#!/usr/bin/env python3
"""starnion-connect-memo — write Context Memo to a Connect (인맥) entry.

Commands:
  find     Search connections by name (fuzzy) and return candidates.
  add      Append notes to an existing connection's context_notes.
  replace  Overwrite context_notes with the given text.
  clear    Set context_notes to the empty string.

The target connection is identified by one of:
  --connection-id <uuid>   preferred when the agent already resolved it
  --name "<substring>"     used with add/replace/clear; fails (exit 2)
                           when 0 or >1 matches unless --force is given

Writes go directly to Postgres via psycopg2. No gateway HTTP call, no
JWT needed.

BR-CONTEXT-1 is enforced: combined notes must not exceed 4096 chars.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import _load_starnion_yaml  # noqa: E402

_yaml = _load_starnion_yaml()
_db = _yaml.get("database", {}) if isinstance(_yaml.get("database"), dict) else {}

_db_url_default = (
    f"postgresql://{_db.get('user','postgres')}:{_db.get('password','')}"
    f"@{_db.get('host','localhost')}:{_db.get('port','5432')}"
    f"/{_db.get('name','starnion')}?sslmode={_db.get('ssl_mode','disable')}"
) if _db else ""

DB_URL = os.environ.get("DATABASE_URL") or _db_url_default

# Mirrors BR-CONTEXT-1 on the gateway side
# (gateway/internal/usecase/connect/usecase.go).
CONTEXT_NOTES_MAX = 4096

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


def _fetch_by_id(conn, user_id: str, connection_id: str):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id::text, name, company, context_notes
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
        SELECT id::text, name, company, category,
               to_char(last_contact_at AT TIME ZONE 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_contact_at,
               context_notes
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


def _preview(text: str, chars: int = 80) -> str:
    if not text:
        return ""
    t = text.strip().replace("\n", " ")
    if len(t) <= chars:
        return t
    return t[: chars - 1] + "…"


def cmd_find(args):
    conn = _connect()
    rows = _search_by_name(conn, args.user_id, args.name)
    conn.close()
    candidates = [
        {
            "id": r[0],
            "name": r[1],
            "company": r[2] or "",
            "category": r[3],
            "last_contact_at": r[4],
            "notes_preview": _preview(r[5]),
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


def _resolve(conn, args):
    """Return (connection_id, name, company, existing_notes).

    Preference: --connection-id takes precedence. When --name is used,
    the caller gets an unambiguous single-match only; 0 or >1 exit with
    code 2 unless --force is given (in which case the most recently
    contacted match wins).
    """
    if args.connection_id:
        row = _fetch_by_id(conn, args.user_id, args.connection_id)
        if not row:
            print("❌ connection not found or not yours", file=sys.stderr)
            sys.exit(2)
        return row[0], row[1], row[2] or "", row[3] or ""

    rows = _search_by_name(conn, args.user_id, args.name)
    if len(rows) == 0:
        print(f"❌ no connection matches name '{args.name}'", file=sys.stderr)
        sys.exit(2)
    if len(rows) > 1 and not args.force:
        print(
            f"❌ '{args.name}' is ambiguous ({len(rows)} matches). "
            "Run `find` first to disambiguate, then pass --connection-id.",
            file=sys.stderr,
        )
        sys.exit(2)
    r = rows[0]
    return r[0], r[1], r[2] or "", r[5] or ""


def _merge_notes(existing: str, new: str) -> str:
    """Append new to existing with a blank line separator. Strips
    trailing whitespace from existing and leading whitespace from new so
    successive appends don't accumulate blank lines."""
    existing = (existing or "").rstrip()
    new = (new or "").lstrip()
    if not existing:
        return new
    if not new:
        return existing
    return f"{existing}\n\n{new}"


def _update(conn, user_id: str, connection_id: str, notes: str):
    if len(notes) > CONTEXT_NOTES_MAX:
        print(
            f"❌ notes too long: {len(notes)} chars (max {CONTEXT_NOTES_MAX})",
            file=sys.stderr,
        )
        sys.exit(2)
    cur = conn.cursor()
    cur.execute(
        "UPDATE connections SET context_notes = %s "
        "WHERE id = %s AND user_id = %s",
        (notes, connection_id, user_id),
    )
    affected = cur.rowcount
    cur.close()
    if affected == 0:
        print("❌ connection not found or not yours", file=sys.stderr)
        sys.exit(2)


def _emit(connection_id: str, name: str, notes: str):
    print(
        json.dumps(
            {
                "status": "ok",
                "connection_id": connection_id,
                "name": name,
                "notes": notes,
                "length": len(notes),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def cmd_add(args):
    conn = _connect()
    cid, cname, _company, existing = _resolve(conn, args)
    merged = _merge_notes(existing, args.notes)
    _update(conn, args.user_id, cid, merged)
    conn.close()
    _emit(cid, cname, merged)


def cmd_replace(args):
    conn = _connect()
    cid, cname, _company, _existing = _resolve(conn, args)
    _update(conn, args.user_id, cid, args.notes)
    conn.close()
    _emit(cid, cname, args.notes)


def cmd_clear(args):
    conn = _connect()
    cid, cname, _company, _existing = _resolve(conn, args)
    _update(conn, args.user_id, cid, "")
    conn.close()
    _emit(cid, cname, "")


# ── CLI ───────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="StarNion Connect memo CLI")
parser.add_argument("--user-id", required=True, help="User UUID")

sub = parser.add_subparsers(dest="cmd")

p_find = sub.add_parser("find", help="Search connections by name")
p_find.add_argument("--name", required=True, help="Name substring (case-insensitive)")

p_add = sub.add_parser("add", help="Append notes to existing context_notes")
p_add.add_argument("--connection-id", help="Connection UUID (preferred)")
p_add.add_argument("--name", help="Name substring — must resolve to one row")
p_add.add_argument("--notes", required=True, help="Text to append")
p_add.add_argument(
    "--force", action="store_true",
    help="When --name is ambiguous, pick the most recent match",
)

p_replace = sub.add_parser("replace", help="Overwrite context_notes")
p_replace.add_argument("--connection-id", help="Connection UUID (preferred)")
p_replace.add_argument("--name", help="Name substring — must resolve to one row")
p_replace.add_argument("--notes", required=True, help="Full replacement text")
p_replace.add_argument("--force", action="store_true")

p_clear = sub.add_parser("clear", help="Erase context_notes")
p_clear.add_argument("--connection-id", help="Connection UUID (preferred)")
p_clear.add_argument("--name", help="Name substring — must resolve to one row")
p_clear.add_argument("--force", action="store_true")


def _require_target(args):
    if not args.connection_id and not args.name:
        print("❌ either --connection-id or --name is required", file=sys.stderr)
        sys.exit(2)


args = parser.parse_args()
if args.cmd == "find":
    cmd_find(args)
elif args.cmd == "add":
    _require_target(args)
    cmd_add(args)
elif args.cmd == "replace":
    _require_target(args)
    cmd_replace(args)
elif args.cmd == "clear":
    _require_target(args)
    cmd_clear(args)
else:
    parser.print_help()
    sys.exit(1)
