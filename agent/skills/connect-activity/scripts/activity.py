#!/usr/bin/env python3
"""starnion-connect-activity — Connect (인맥) activity timeline CLI.

Commands:
  find     Search connections by name (fuzzy) and return candidates.
  add      Insert one row into connection_activities for a connection.
  list     Show the most recent activities for a connection.
  delete   Remove one activity row by id (tenant-scoped).
  sync     Pull Gmail + Google Calendar activity into the timeline.

Writes go directly to Postgres via psycopg2 (matching connect-memo /
connect-ocr / finance / budget skills). The `sync` subcommand reuses
the google-workspace skill's OAuth helpers so it shares the same
access token / refresh logic with no duplication.

BR-AUTH-1: every query is scoped to user_id.
BR-109-1: occurred_at must not be more than 60 seconds in the future.

Mirrors the gateway's UC-112 validation:
  - label ≤ 40 chars
  - note ≤ 1000 chars
  - duration_min ∈ [0, 1440]
  - kind ∈ {email, calendar, manual, telegram}
"""
import argparse
import json
import math
import os
import re
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import _load_starnion_yaml  # noqa: E402

# Reuse the google-workspace skill's OAuth helpers verbatim — same DB,
# same token table, same refresh path. The relative import works
# because the agent always runs skills from the skills root.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "google-workspace", "scripts"))

_yaml = _load_starnion_yaml()
_db = _yaml.get("database", {}) if isinstance(_yaml.get("database"), dict) else {}

_db_url_default = (
    f"postgresql://{_db.get('user','postgres')}:{_db.get('password','')}"
    f"@{_db.get('host','localhost')}:{_db.get('port','5432')}"
    f"/{_db.get('name','starnion')}?sslmode={_db.get('ssl_mode','disable')}"
) if _db else ""

DB_URL = os.environ.get("DATABASE_URL") or _db_url_default

# Mirror gateway/internal/usecase/connect/usecase.go limits.
LABEL_MAX = 40
NOTE_MAX = 1000
DURATION_MAX = 24 * 60  # 24 hours
ALLOWED_KINDS = {"email", "calendar", "manual", "telegram"}
RECIPIENT_LIMIT = 20
NOREPLY_PREFIXES = (
    "noreply@", "no-reply@", "do-not-reply@", "donotreply@",
    "notifications@", "notification@", "alerts@", "alert@",
    "mailer-daemon@", "postmaster@", "support@", "team@",
)

if not DB_URL:
    print("❌ DATABASE_URL is not configured.", file=sys.stderr)
    sys.exit(1)


# ── DB helpers ────────────────────────────────────────────────────────


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


def _fetch_by_id(conn, user_id: str, connection_id: str):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id::text, name, COALESCE(company, ''), COALESCE(email, '')
          FROM connections
         WHERE id = %s AND user_id = %s
         LIMIT 1
        """,
        (connection_id, user_id),
    )
    row = cur.fetchone()
    cur.close()
    return row


def _search_by_name(conn, user_id: str, name: str, limit: int = 10):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id::text, name, COALESCE(company, ''), category,
               to_char(last_contact_at AT TIME ZONE 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_contact_at,
               COALESCE(email, '')
          FROM connections
         WHERE user_id = %s AND name ILIKE %s
         ORDER BY last_contact_at DESC NULLS LAST, name ASC
         LIMIT %s
        """,
        (user_id, f"%{name}%", limit),
    )
    rows = cur.fetchall()
    cur.close()
    return rows


def _resolve(conn, args):
    """Return (connection_id, name) for the target.

    Preference: --connection-id beats --name. Ambiguous --name without
    --force exits 2 (caller should run `find` first).
    """
    if getattr(args, "connection_id", None):
        row = _fetch_by_id(conn, args.user_id, args.connection_id)
        if not row:
            print("❌ connection not found or not yours", file=sys.stderr)
            sys.exit(2)
        return row[0], row[1]

    if not getattr(args, "name", None):
        print("❌ either --connection-id or --name is required", file=sys.stderr)
        sys.exit(2)

    rows = _search_by_name(conn, args.user_id, args.name)
    if not rows:
        print(f"❌ no connection matches name '{args.name}'", file=sys.stderr)
        sys.exit(2)
    if len(rows) > 1 and not getattr(args, "force", False):
        print(
            f"❌ '{args.name}' is ambiguous ({len(rows)} matches). "
            "Run `find` first to disambiguate, then pass --connection-id.",
            file=sys.stderr,
        )
        sys.exit(2)
    return rows[0][0], rows[0][1]


# ── find ──────────────────────────────────────────────────────────────


def cmd_find(args):
    conn = _connect()
    rows = _search_by_name(conn, args.user_id, args.name)
    conn.close()
    candidates = [
        {
            "id": r[0],
            "name": r[1],
            "company": r[2],
            "category": r[3],
            "last_contact_at": r[4],
            "email": r[5],
        }
        for r in rows
    ]
    print(
        json.dumps(
            {"status": "ok", "count": len(candidates), "candidates": candidates},
            ensure_ascii=False,
            indent=2,
        )
    )


# ── add ───────────────────────────────────────────────────────────────


def _parse_when(s: str | None) -> datetime:
    """Parse an ISO-8601 string into an aware UTC datetime, defaulting
    to now when the input is empty or None."""
    if not s:
        return datetime.now(timezone.utc)
    try:
        # Accept "2026-04-13T12:00", "2026-04-13T12:00:00", or with TZ.
        s2 = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s2)
    except ValueError:
        print(f"❌ invalid --when '{s}' (use ISO 8601, e.g. 2026-04-13T12:00)", file=sys.stderr)
        sys.exit(2)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _validate_add(label: str, note: str, duration: int, kind: str, occurred_at: datetime):
    if kind not in ALLOWED_KINDS:
        print(f"❌ invalid kind '{kind}' (allowed: {sorted(ALLOWED_KINDS)})", file=sys.stderr)
        sys.exit(2)
    if len(label) > LABEL_MAX:
        print(f"❌ label too long: {len(label)} chars (max {LABEL_MAX})", file=sys.stderr)
        sys.exit(2)
    if len(note) > NOTE_MAX:
        print(f"❌ note too long: {len(note)} chars (max {NOTE_MAX})", file=sys.stderr)
        sys.exit(2)
    if duration < 0 or duration > DURATION_MAX:
        print(f"❌ duration_min must be in [0, {DURATION_MAX}] (got {duration})", file=sys.stderr)
        sys.exit(2)
    if occurred_at > datetime.now(timezone.utc) + timedelta(seconds=60):
        print("❌ occurred_at cannot be more than 60 seconds in the future", file=sys.stderr)
        sys.exit(2)


def _insert_activity(conn, user_id, connection_id, kind, label, occurred_at, duration, weight, note):
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO connection_activities
            (user_id, connection_id, kind, label, occurred_at,
             duration_min, weight, note)
        VALUES (%s, %s, %s, NULLIF(%s, ''), %s, %s, %s, NULLIF(%s, ''))
        ON CONFLICT (connection_id, kind, occurred_at) DO NOTHING
        RETURNING id
        """,
        (user_id, connection_id, kind, label, occurred_at, duration, weight, note),
    )
    row = cur.fetchone()
    cur.close()
    return row[0] if row else None


def _bump_last_contact(conn, user_id: str, connection_id: str, occurred_at: datetime):
    """Monotonic update — only advances last_contact_at, never rewinds."""
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE connections
           SET last_contact_at = GREATEST(
                 COALESCE(last_contact_at, '-infinity'::timestamptz),
                 %s)
         WHERE id = %s AND user_id = %s
        """,
        (occurred_at, connection_id, user_id),
    )
    cur.close()


def cmd_add(args):
    occurred_at = _parse_when(args.when)
    label = (args.label or "").strip()
    note = (args.note or "").strip()
    duration = int(args.duration or 0)
    kind = args.kind or "manual"
    _validate_add(label, note, duration, kind, occurred_at)

    conn = _connect()
    cid, cname = _resolve(conn, args)
    activity_id = _insert_activity(
        conn, args.user_id, cid, kind, label, occurred_at, duration, 1.0, note
    )
    if kind == "manual":
        _bump_last_contact(conn, args.user_id, cid, occurred_at)
    conn.close()

    print(
        json.dumps(
            {
                "status": "ok",
                "activity_id": activity_id,
                "deduped": activity_id is None,
                "connection_id": cid,
                "name": cname,
                "kind": kind,
                "label": label,
                "occurred_at": occurred_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "duration_min": duration,
                "note": note,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


# ── list ──────────────────────────────────────────────────────────────


def cmd_list(args):
    conn = _connect()
    cid, cname = _resolve(conn, args)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, kind, COALESCE(label, ''),
               to_char(occurred_at AT TIME ZONE 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               duration_min, weight, COALESCE(note, '')
          FROM connection_activities
         WHERE user_id = %s AND connection_id = %s
         ORDER BY occurred_at DESC
         LIMIT %s
        """,
        (args.user_id, cid, args.limit),
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    items = [
        {
            "id": r[0],
            "kind": r[1],
            "label": r[2],
            "occurred_at": r[3],
            "duration_min": r[4],
            "weight": float(r[5]),
            "note": r[6],
        }
        for r in rows
    ]
    print(
        json.dumps(
            {
                "status": "ok",
                "connection_id": cid,
                "name": cname,
                "count": len(items),
                "items": items,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


# ── delete ────────────────────────────────────────────────────────────


def cmd_delete(args):
    if args.activity_id <= 0:
        print("❌ --activity-id must be positive", file=sys.stderr)
        sys.exit(2)
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM connection_activities WHERE id = %s AND user_id = %s",
        (args.activity_id, args.user_id),
    )
    affected = cur.rowcount
    cur.close()
    conn.close()
    if affected == 0:
        print("❌ activity not found or not yours", file=sys.stderr)
        sys.exit(2)
    print(
        json.dumps(
            {"status": "ok", "deleted_id": args.activity_id},
            ensure_ascii=False,
            indent=2,
        )
    )


# ── sync ──────────────────────────────────────────────────────────────


def _build_email_index(conn, user_id: str) -> dict:
    cur = conn.cursor()
    cur.execute(
        "SELECT id::text, LOWER(TRIM(email)) FROM connections "
        "WHERE user_id = %s AND email IS NOT NULL AND email <> ''",
        (user_id,),
    )
    out: dict[str, str] = {}
    for row in cur.fetchall():
        if row[1]:
            out.setdefault(row[1], row[0])  # first wins on duplicates
    cur.close()
    return out


_EMAIL_RE = re.compile(r"<([^>]+)>")


def _extract_first_email(header: str) -> str:
    if not header:
        return ""
    m = _EMAIL_RE.search(header)
    if m:
        return m.group(1).strip().lower()
    # Bare address fallback
    return header.split(",", 1)[0].strip().lower()


def _extract_all_emails(header: str) -> list:
    if not header:
        return []
    parts = []
    for chunk in header.split(","):
        chunk = chunk.strip()
        m = _EMAIL_RE.search(chunk)
        if m:
            parts.append(m.group(1).strip().lower())
        elif "@" in chunk:
            parts.append(chunk.lower())
    return parts


def _is_noreply(addr: str) -> bool:
    return any(addr.startswith(p) for p in NOREPLY_PREFIXES)


def _decay_weight(participants: int) -> float:
    if participants <= 1:
        return 1.0
    w = 1.0 / math.sqrt(participants)
    return max(w, 0.1)


def _gmail_sync(google_request, conn, user_id: str, token: str, days: int, email_index: dict):
    """Returns list of (connection_id, kind, label, occurred_at, duration_min, weight, note)."""
    rows = []
    list_resp = google_request(
        "GET",
        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
        conn, user_id, token,
        params={"q": f"newer_than:{days}d", "maxResults": 200},
        timeout=15,
    )
    if not list_resp.ok:
        return rows
    messages = list_resp.json().get("messages", []) or []

    seen = set()  # (connection_id, occurred_at) local dedup
    for m in messages[:200]:
        msg_resp = google_request(
            "GET",
            f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{m['id']}",
            conn, user_id, token,
            params={
                "format": "metadata",
                "metadataHeaders": ["From", "To", "Cc", "Date", "Subject"],
            },
            timeout=15,
        )
        if not msg_resp.ok:
            continue
        msg = msg_resp.json()
        headers = {
            h.get("name", "").lower(): h.get("value", "")
            for h in msg.get("payload", {}).get("headers", []) or []
        }
        from_addr = _extract_first_email(headers.get("from", ""))
        if not from_addr or _is_noreply(from_addr):
            continue
        to_addrs = _extract_all_emails(headers.get("to", ""))
        cc_addrs = _extract_all_emails(headers.get("cc", ""))
        recipient_count = len(to_addrs) + len(cc_addrs)
        if recipient_count > RECIPIENT_LIMIT:
            continue

        connection_id = email_index.get(from_addr)
        if not connection_id:
            for a in to_addrs + cc_addrs:
                if a in email_index:
                    connection_id = email_index[a]
                    break
        if not connection_id:
            continue

        try:
            occurred_at = datetime.fromtimestamp(int(msg.get("internalDate", "0")) / 1000, tz=timezone.utc)
        except Exception:  # noqa: BLE001
            continue

        key = (connection_id, occurred_at.isoformat())
        if key in seen:
            continue
        seen.add(key)

        weight = _decay_weight(recipient_count + 1)
        subject = (headers.get("subject") or "").strip()
        rows.append((connection_id, "email", "", occurred_at, 0, weight, subject[:280]))
    return rows


def _calendar_sync(google_request, conn, user_id: str, token: str, days: int, email_index: dict):
    rows = []
    now = datetime.now(timezone.utc)
    time_min = (now - timedelta(days=days)).isoformat()
    time_max = (now + timedelta(days=7)).isoformat()
    resp = google_request(
        "GET",
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        conn, user_id, token,
        params={
            "timeMin": time_min,
            "timeMax": time_max,
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": 250,
        },
        timeout=15,
    )
    if not resp.ok:
        return rows
    items = resp.json().get("items", []) or []
    seen = set()
    for ev in items:
        if ev.get("status") == "cancelled":
            continue
        attendees = ev.get("attendees") or []
        if not attendees or len(attendees) > RECIPIENT_LIMIT:
            continue
        start_dt = (ev.get("start") or {}).get("dateTime")
        end_dt = (ev.get("end") or {}).get("dateTime")
        if not start_dt:
            continue
        try:
            start = datetime.fromisoformat(start_dt.replace("Z", "+00:00")).astimezone(timezone.utc)
        except Exception:  # noqa: BLE001
            continue
        end = start
        if end_dt:
            try:
                end = datetime.fromisoformat(end_dt.replace("Z", "+00:00")).astimezone(timezone.utc)
            except Exception:  # noqa: BLE001
                pass
        duration = max(int((end - start).total_seconds() // 60), 0)
        weight = _decay_weight(len(attendees))
        summary = (ev.get("summary") or "").strip()[:280]

        matched = set()
        for a in attendees:
            addr = (a.get("email") or "").strip().lower()
            if not addr:
                continue
            cid = email_index.get(addr)
            if not cid or cid in matched:
                continue
            matched.add(cid)
            key = (cid, start.isoformat())
            if key in seen:
                continue
            seen.add(key)
            rows.append((cid, "calendar", "", start, duration, weight, summary))
    return rows


def cmd_sync(args):
    days = max(int(args.days or 7), 1)

    # Lazy import — we only need google-workspace's helpers here, so a
    # missing Google token doesn't stop other subcommands from running.
    try:
        from google_workspace import get_valid_access_token, google_request
    except ImportError as e:
        print(f"❌ failed to import google-workspace helpers: {e}", file=sys.stderr)
        sys.exit(1)

    conn = _connect()
    try:
        token = get_valid_access_token(conn, args.user_id)
    except SystemExit:
        # google_workspace.get_valid_access_token calls sys.exit on
        # missing token — translate that into our JSON error shape.
        conn.close()
        print(
            json.dumps(
                {"status": "skipped", "reason": "google_not_connected"},
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    email_index = _build_email_index(conn, args.user_id)
    if not email_index:
        conn.close()
        print(
            json.dumps(
                {"status": "ok", "ingested": 0, "reason": "no_emails", "days": days},
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    gmail_rows = _gmail_sync(google_request, conn, args.user_id, token, days, email_index)
    calendar_rows = _calendar_sync(google_request, conn, args.user_id, token, days, email_index)

    inserted = 0
    bumped = set()
    for row in gmail_rows + calendar_rows:
        cid, kind, label, occurred_at, duration, weight, note = row
        new_id = _insert_activity(
            conn, args.user_id, cid, kind, label, occurred_at, duration, weight, note
        )
        if new_id is not None:
            inserted += 1
            bumped.add((cid, occurred_at))

    # Auto-ingested rows still bump last_contact_at so the score
    # recompute cron picks up fresh recency on the next tick. Using
    # GREATEST keeps it monotonic.
    for cid, occurred_at in bumped:
        _bump_last_contact(conn, args.user_id, cid, occurred_at)

    conn.close()

    print(
        json.dumps(
            {
                "status": "ok",
                "ingested": inserted,
                "gmail_candidates": len(gmail_rows),
                "calendar_candidates": len(calendar_rows),
                "days": days,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


# ── CLI ───────────────────────────────────────────────────────────────


parser = argparse.ArgumentParser(description="StarNion Connect activity timeline CLI")
parser.add_argument("--user-id", required=True, help="User UUID")

sub = parser.add_subparsers(dest="cmd")

p_find = sub.add_parser("find", help="Search connections by name")
p_find.add_argument("--name", required=True, help="Name substring (case-insensitive)")

p_add = sub.add_parser("add", help="Insert one activity row")
p_add.add_argument("--connection-id", help="Connection UUID (preferred)")
p_add.add_argument("--name", help="Name substring — must resolve to one row")
p_add.add_argument("--label", default="", help="UI category chip (미팅, 통화, 식사, ...)")
p_add.add_argument("--note", default="", help="Free-text note about the activity")
p_add.add_argument("--when", default="", help="ISO 8601 occurred_at (default: now)")
p_add.add_argument("--duration", type=int, default=0, help="Duration in minutes (0..1440)")
p_add.add_argument("--kind", default="manual", help="email|calendar|manual|telegram")
p_add.add_argument("--force", action="store_true", help="Pick most-recent on ambiguous --name")

p_list = sub.add_parser("list", help="Show recent activities for a connection")
p_list.add_argument("--connection-id", help="Connection UUID (preferred)")
p_list.add_argument("--name", help="Name substring — must resolve to one row")
p_list.add_argument("--limit", type=int, default=10, help="Max rows to return")
p_list.add_argument("--force", action="store_true")

p_delete = sub.add_parser("delete", help="Delete one activity row by id")
p_delete.add_argument("--activity-id", type=int, required=True, help="Row id")

p_sync = sub.add_parser("sync", help="Pull Gmail + Calendar into the timeline")
p_sync.add_argument("--days", type=int, default=7, help="Lookback window in days")


args = parser.parse_args()
if args.cmd == "find":
    cmd_find(args)
elif args.cmd == "add":
    cmd_add(args)
elif args.cmd == "list":
    cmd_list(args)
elif args.cmd == "delete":
    cmd_delete(args)
elif args.cmd == "sync":
    cmd_sync(args)
else:
    parser.print_help()
    sys.exit(1)
