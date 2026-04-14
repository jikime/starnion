#!/usr/bin/env python3
"""starnion-connect-contacts-import — bulk import Google Contacts (People API).

Subcommands:
  preview  Walk People API + dedup, return counts only (no writes).
  import   Same walk, then INSERT each new row into connections.

The skill never updates existing rows — dedup decides INSERT vs SKIP.
Honors BR-AUTH-1 (every SQL scoped by user_id) and BR-SOCIAL-3
(social_profiles is hard-coded to '{}' regardless of what Google
returns about LinkedIn/Twitter handles).

Re-uses the google-workspace skill's OAuth helpers (get_valid_access_token,
google_request) so no token logic is duplicated. The required scope
(`https://www.googleapis.com/auth/contacts.readonly`) is added to both
the gateway's googleoauth.Scopes constant and the skills oauth URL
builder, so any *new* Google connection asks for it. Existing tokens
must be re-issued — the skill detects the missing scope and returns a
`scope_missing` JSON error with re-auth instructions.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import _load_starnion_yaml  # noqa: E402

# Reuse google-workspace skill helpers (same DB, same token table).
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "google-workspace", "scripts"))

_yaml = _load_starnion_yaml()
_db = _yaml.get("database", {}) if isinstance(_yaml.get("database"), dict) else {}

_db_url_default = (
    f"postgresql://{_db.get('user','postgres')}:{_db.get('password','')}"
    f"@{_db.get('host','localhost')}:{_db.get('port','5432')}"
    f"/{_db.get('name','starnion')}?sslmode={_db.get('ssl_mode','disable')}"
) if _db else ""

DB_URL = os.environ.get("DATABASE_URL") or _db_url_default

CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly"
PEOPLE_API = "https://people.googleapis.com/v1/people/me/connections"
PERSON_FIELDS = "names,emailAddresses,phoneNumbers,organizations"
PAGE_SIZE = 1000  # People API max
DEFAULT_LIMIT = 500
DEFAULT_FREQ_TARGET = 30
DEFAULT_SCORE = 0.5

if not DB_URL:
    print("❌ DATABASE_URL is not configured.", file=sys.stderr)
    sys.exit(1)


def _connect():
    try:
        import psycopg2
    except ImportError:
        print(
            "❌ psycopg2 is required. Install with: pip install psycopg2-binary",
            file=sys.stderr,
        )
        sys.exit(1)
    try:
        conn = psycopg2.connect(DB_URL)
        conn.autocommit = True
        return conn
    except Exception as e:  # noqa: BLE001
        print(f"❌ DB connection failed: {e}", file=sys.stderr)
        sys.exit(1)


# ── scope check ──────────────────────────────────────────────────────


def _check_scope(conn, user_id: str) -> tuple[bool, str]:
    """Returns (has_contacts_scope, current_scopes_string).

    Reads google_tokens.scopes (the space-separated scope list Google
    returned when the OAuth token was issued). Treats both the
    canonical "https://www.googleapis.com/auth/contacts.readonly"
    URL and the rare bare "contacts.readonly" form as a hit.
    """
    cur = conn.cursor()
    cur.execute(
        "SELECT COALESCE(scopes, '') FROM google_tokens WHERE user_id = %s",
        (user_id,),
    )
    row = cur.fetchone()
    cur.close()
    if not row:
        return False, ""
    scopes = row[0] or ""
    has = (CONTACTS_SCOPE in scopes) or ("contacts.readonly" in scopes)
    return has, scopes


# ── existing-connection index for dedup ──────────────────────────────


_PHONE_NORMALIZE_RE = re.compile(r"[^\d]")


def _normalize_phone(s: str) -> str:
    """Strip everything except digits. '+82 10-1234-5678' → '821012345678'.
    Returns '' for empty / nil input."""
    if not s:
        return ""
    return _PHONE_NORMALIZE_RE.sub("", s)


def _build_existing_indexes(conn, user_id: str) -> tuple[set, set]:
    """Returns (emails_set, phones_set) for the user's current
    connections, both lower/normalized for case-insensitive lookups."""
    cur = conn.cursor()
    cur.execute(
        "SELECT COALESCE(LOWER(TRIM(email)), ''), COALESCE(phone, '') "
        "FROM connections WHERE user_id = %s",
        (user_id,),
    )
    emails = set()
    phones = set()
    for e, p in cur.fetchall():
        if e:
            emails.add(e)
        n = _normalize_phone(p)
        if n:
            phones.add(n)
    cur.close()
    return emails, phones


# ── People API field extraction ──────────────────────────────────────


def _pick_primary(items: list, value_key: str) -> str:
    """People API fields like emailAddresses are a list with optional
    metadata.primary=True flags. Return the value of the primary entry
    when present, else the first entry."""
    if not items:
        return ""
    for item in items:
        meta = item.get("metadata") or {}
        if meta.get("primary"):
            return (item.get(value_key) or "").strip()
    return (items[0].get(value_key) or "").strip()


def _extract_contact(person: dict) -> dict | None:
    """Flatten one People API person resource to the columns we care
    about. Returns None when the row has no name (often a stub)."""
    name = _pick_primary(person.get("names") or [], "displayName")
    if not name:
        return None
    email = _pick_primary(person.get("emailAddresses") or [], "value")
    phone = _pick_primary(person.get("phoneNumbers") or [], "value")
    org_list = person.get("organizations") or []
    company = _pick_primary(org_list, "name") if org_list else ""
    role = _pick_primary(org_list, "title") if org_list else ""
    return {
        "name": name.strip(),
        "email": email.strip().lower() or None,
        "phone": phone.strip() or None,
        "company": company.strip() or None,
        "role": role.strip() or None,
    }


# ── People API pagination ────────────────────────────────────────────


def _fetch_all_contacts(google_request, conn, user_id: str, token: str) -> list:
    """Pages through People API and returns the flat list of person
    dicts. Stops on the first non-200 (lets caller handle the error)."""
    out = []
    page_token = None
    while True:
        params = {
            "personFields": PERSON_FIELDS,
            "pageSize": PAGE_SIZE,
        }
        if page_token:
            params["pageToken"] = page_token
        resp = google_request(
            "GET", PEOPLE_API, conn, user_id, token, params=params, timeout=30
        )
        if not resp.ok:
            raise RuntimeError(
                f"people api {resp.status_code}: {resp.text[:200]}"
            )
        data = resp.json()
        out.extend(data.get("connections", []) or [])
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return out


# ── INSERT path ──────────────────────────────────────────────────────


def _insert_connection(conn, user_id: str, contact: dict) -> str:
    """Inserts one row and returns its UUID. Raises on DB error."""
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO connections (
            id, user_id, name, role, company, category,
            email, phone,
            tags, context_notes,
            contact_frequency_target, connection_score,
            social_profiles, business_card,
            created_at, updated_at
        ) VALUES (
            gen_random_uuid(), %s, %s, %s, %s, 'acquaintance',
            %s, %s,
            ARRAY['google_contacts']::TEXT[], '',
            %s, %s,
            '{}'::jsonb, NULL,
            NOW(), NOW()
        )
        RETURNING id::text
        """,
        (
            user_id,
            contact["name"],
            contact["role"],
            contact["company"],
            contact["email"],
            contact["phone"],
            DEFAULT_FREQ_TARGET,
            DEFAULT_SCORE,
        ),
    )
    new_id = cur.fetchone()[0]
    cur.close()
    return new_id


# ── command handlers ─────────────────────────────────────────────────


def _run_walk(args, dry_run: bool):
    """Shared walk used by both `preview` (dry_run=True) and `import`.

    Reports back through a single JSON envelope so the agent can
    parse it the same way regardless of the subcommand."""
    try:
        from google_workspace import get_valid_access_token, google_request
    except ImportError as e:
        print(f"❌ failed to import google-workspace helpers: {e}", file=sys.stderr)
        sys.exit(1)

    conn = _connect()

    has_scope, scopes = _check_scope(conn, args.user_id)
    if not has_scope:
        conn.close()
        print(
            json.dumps(
                {
                    "status": "error",
                    "reason": "scope_missing",
                    "message": (
                        "Google contacts.readonly scope not granted. "
                        "Disconnect and reconnect Google Workspace under "
                        "/skills to authorize contacts access."
                    ),
                    "current_scopes": scopes,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        sys.exit(2)

    try:
        token = get_valid_access_token(conn, args.user_id)
    except SystemExit:
        conn.close()
        print(
            json.dumps(
                {"status": "error", "reason": "google_not_connected"},
                ensure_ascii=False,
                indent=2,
            )
        )
        sys.exit(2)

    try:
        people = _fetch_all_contacts(google_request, conn, args.user_id, token)
    except RuntimeError as e:
        conn.close()
        print(
            json.dumps(
                {"status": "error", "reason": "people_api_failed", "detail": str(e)},
                ensure_ascii=False,
                indent=2,
            )
        )
        sys.exit(1)

    emails_existing, phones_existing = _build_existing_indexes(conn, args.user_id)

    fetched = len(people)
    skipped_no_name = 0
    duplicates = 0
    imported = 0
    limit_reached = False
    limit = max(int(args.limit or DEFAULT_LIMIT), 0)

    for person in people:
        contact = _extract_contact(person)
        if contact is None:
            skipped_no_name += 1
            continue

        # Dedup: email first, phone second.
        is_dup = False
        if contact["email"] and contact["email"] in emails_existing:
            is_dup = True
        elif contact["phone"]:
            n = _normalize_phone(contact["phone"])
            if n and n in phones_existing:
                is_dup = True

        if is_dup:
            duplicates += 1
            continue

        if not dry_run:
            if imported >= limit:
                limit_reached = True
                break
            try:
                _insert_connection(conn, args.user_id, contact)
            except Exception as e:  # noqa: BLE001
                # Don't abort the whole batch on one row failure.
                print(
                    f"  warning: insert failed for {contact['name']!r}: {e}",
                    file=sys.stderr,
                )
                continue
            # Defensive add to in-memory indexes so duplicate Google
            # rows in the same response don't double-insert.
            if contact["email"]:
                emails_existing.add(contact["email"])
            if contact["phone"]:
                n = _normalize_phone(contact["phone"])
                if n:
                    phones_existing.add(n)

        imported += 1

    conn.close()

    print(
        json.dumps(
            {
                "status": "ok",
                "fetched": fetched,
                "duplicates": duplicates,
                "skipped_no_name": skipped_no_name,
                "imported": imported,
                "limit_reached": limit_reached,
                "dry_run": dry_run,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def cmd_preview(args):
    _run_walk(args, dry_run=True)


def cmd_import(args):
    _run_walk(args, dry_run=False)


# ── CLI ──────────────────────────────────────────────────────────────


parser = argparse.ArgumentParser(description="StarNion Google Contacts import CLI")
parser.add_argument("--user-id", required=True, help="User UUID")

sub = parser.add_subparsers(dest="cmd")

p_preview = sub.add_parser("preview", help="Dry-run the import (count only)")
p_preview.add_argument("--limit", type=int, default=DEFAULT_LIMIT)

p_import = sub.add_parser("import", help="Walk + insert new contacts")
p_import.add_argument("--limit", type=int, default=DEFAULT_LIMIT)


args = parser.parse_args()
if args.cmd == "preview":
    cmd_preview(args)
elif args.cmd == "import":
    cmd_import(args)
else:
    parser.print_help()
    sys.exit(1)
