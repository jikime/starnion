#!/usr/bin/env python3
"""starnion-diary — diary entry CLI for StarNion agent."""
import argparse, sys, os, uuid
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL:
    print("❌ DATABASE_URL is not set.", file=sys.stderr)
    sys.exit(1)

def psql(sql): return _shared_psql(sql, DB_URL)

def esc(s):
    """Escape single quotes for SQL."""
    return (s or "").replace("'", "''")

def cmd_save(args):
    uid = str(uuid.uuid4())
    entry_date = args.date or datetime.now().strftime("%Y-%m-%d")
    mood = args.mood or "neutral"
    title = esc(args.title or "")
    content = esc(args.content)
    tags = "{" + ",".join(args.tags.split(",")) + "}" if args.tags else "{}"
    sql = (
        f"INSERT INTO diary_entries (id, user_id, title, content, mood, tags, entry_date) "
        f"VALUES ('{uid}', '{args.user_id}', '{title}', '{content}', '{mood}', '{tags}', '{entry_date}');"
    )
    psql(sql)
    print(f"✅ Diary saved: [{entry_date}] {args.title or content[:20]}...")

def cmd_log(args):
    uid = str(uuid.uuid4())
    today = datetime.now().strftime("%Y-%m-%d")
    content = esc(args.content)
    mood = args.sentiment or "neutral"
    sql = (
        f"INSERT INTO diary_entries (id, user_id, content, mood, entry_date) "
        f"VALUES ('{uid}', '{args.user_id}', '{content}', '{mood}', '{today}');"
    )
    psql(sql)
    print(f"✅ Diary entry logged: {args.content[:30]}...")

def cmd_list(args):
    limit = args.limit or 5
    sql = (
        f"SELECT entry_date, title, content, mood FROM diary_entries "
        f"WHERE user_id = '{args.user_id}' "
        f"ORDER BY entry_date DESC LIMIT {limit};"
    )
    rows = psql(sql)
    if not rows:
        print("📔 No diary entries found.")
        return
    print(f"📔 Recent {limit} entries:")
    for row in rows.splitlines():
        parts = row.split("|")
        if len(parts) >= 4:
            dt, title, content, mood = parts[0], parts[1], parts[2], parts[3]
            display = title if title else content[:30]
            print(f"  [{dt}] {display}... (mood: {mood})")

def cmd_get(args):
    date = args.date or datetime.now().strftime("%Y-%m-%d")
    sql = (
        f"SELECT entry_date, title, content, mood, tags FROM diary_entries "
        f"WHERE user_id = '{args.user_id}' AND entry_date = '{date}' "
        f"ORDER BY created_at DESC LIMIT 1;"
    )
    row = psql(sql)
    if not row:
        print(f"📔 No diary entry for {date}.")
        return
    parts = row.split("|")
    if len(parts) >= 5:
        dt, title, content, mood, tags = parts
        print(f"📔 [{dt}] {title or '(no title)'}")
        print(f"Mood: {mood}")
        print(f"Content:\n{content}")

parser = argparse.ArgumentParser()
parser.add_argument("--user-id", required=True)
sub = parser.add_subparsers(dest="cmd")

p_save = sub.add_parser("save")
p_save.add_argument("--content", required=True)
p_save.add_argument("--title")
p_save.add_argument("--mood")
p_save.add_argument("--tags")
p_save.add_argument("--date")

p_log = sub.add_parser("log")
p_log.add_argument("--content", required=True)
p_log.add_argument("--sentiment")

p_list = sub.add_parser("list")
p_list.add_argument("--limit", type=int, default=5)

p_get = sub.add_parser("get")
p_get.add_argument("--date")

args = parser.parse_args()
if args.cmd == "save":   cmd_save(args)
elif args.cmd == "log":  cmd_log(args)
elif args.cmd == "list": cmd_list(args)
elif args.cmd == "get":  cmd_get(args)
else: parser.print_help()
