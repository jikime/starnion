#!/usr/bin/env python3
"""starnion-memo — Quick memo/note CLI for StarNion agent. Saves to memos table."""
import argparse, sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL:
    print("❌ DATABASE_URL is not set.", file=sys.stderr)
    sys.exit(1)


def psql(sql): return _shared_psql(sql, DB_URL)


def esc(s):
    return (s or "").replace("'", "''")


def cmd_save(args):
    title = esc(args.title or args.content[:30])
    content = esc(args.content)
    tag = esc(args.tag or "personal")
    sql = (
        f"INSERT INTO memos (user_id, title, content, tag) "
        f"VALUES ('{args.user_id}', '{title}', '{content}', '{tag}');"
    )
    psql(sql)
    print(f"✅ Memo saved: {args.content[:40]}{'...' if len(args.content) > 40 else ''}")
    if args.tag:
        print(f"🏷️  Tag: {args.tag}")


def cmd_list(args):
    limit = args.limit or 10
    tag_filter = f"AND tag = '{esc(args.tag)}'" if args.tag else ""
    sql = (
        f"SELECT id, title, content, tag, created_at FROM memos "
        f"WHERE user_id = '{args.user_id}' {tag_filter} "
        f"ORDER BY created_at DESC LIMIT {limit};"
    )
    rows = psql(sql)
    if not rows:
        print("📝 No memos found.")
        return
    print(f"📝 Recent memos (max {limit})\n")
    for line in rows.split("\n"):
        parts = line.split("|")
        if len(parts) < 5:
            continue
        mid, title, content, tag, created_at = parts[0], parts[1], parts[2], parts[3], parts[4]
        date_str = created_at[:10] if created_at else ""
        preview = content[:50] + ("..." if len(content) > 50 else "")
        print(f"[{mid}] {date_str} [{tag}] {title or preview}")


def cmd_search(args):
    query = esc(args.query)
    limit = args.limit or 5
    sql = (
        f"SELECT id, title, content, tag, created_at FROM memos "
        f"WHERE user_id = '{args.user_id}' "
        f"AND (title ILIKE '%{query}%' OR content ILIKE '%{query}%') "
        f"ORDER BY created_at DESC LIMIT {limit};"
    )
    rows = psql(sql)
    if not rows:
        print(f"📝 No memos found for '{args.query}'.")
        return
    print(f"🔍 Search results for '{args.query}'\n")
    for line in rows.split("\n"):
        parts = line.split("|")
        if len(parts) < 5:
            continue
        mid, title, content, tag, created_at = parts[0], parts[1], parts[2], parts[3], parts[4]
        date_str = created_at[:10] if created_at else ""
        preview = content[:80] + ("..." if len(content) > 80 else "")
        print(f"[{mid}] {date_str} [{tag}]\n  {title or preview}\n")


def cmd_delete(args):
    sql = f"DELETE FROM memos WHERE id = {args.id} AND user_id = '{args.user_id}';"
    psql(sql)
    print(f"🗑️  Memo #{args.id} deleted.")


# ── CLI ───────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="StarNion memo manager")
parser.add_argument("--user-id", required=True, help="User UUID")

sub = parser.add_subparsers(dest="cmd")

p_save = sub.add_parser("save", help="Save a memo")
p_save.add_argument("--content", required=True, help="Memo content")
p_save.add_argument("--title", help="Title (optional)")
p_save.add_argument("--tag", default="personal", help="Tag (default: personal)")

p_list = sub.add_parser("list", help="List memos")
p_list.add_argument("--limit", type=int, default=10, help="Max count (default: 10)")
p_list.add_argument("--tag", help="Tag filter")

p_search = sub.add_parser("search", help="Search memos")
p_search.add_argument("--query", required=True, help="Search keyword")
p_search.add_argument("--limit", type=int, default=5)

p_delete = sub.add_parser("delete", help="Delete a memo")
p_delete.add_argument("--id", type=int, required=True, help="Memo ID")

args = parser.parse_args()
if args.cmd == "save":
    cmd_save(args)
elif args.cmd == "list":
    cmd_list(args)
elif args.cmd == "search":
    cmd_search(args)
elif args.cmd == "delete":
    cmd_delete(args)
else:
    parser.print_help()
