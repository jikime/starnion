#!/usr/bin/env python3
"""starnion-goals — goals tracking CLI for StarNion agent."""
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
    return (s or "").replace("'", "''")

def cmd_add(args):
    uid = str(uuid.uuid4())
    title = esc(args.title)
    desc = esc(args.description or "")
    cat = args.category or "other"
    target = f"'{args.target_date}'" if args.target_date else "NULL"
    sql = (
        f"INSERT INTO goals (id, user_id, title, description, category, target_date) "
        f"VALUES ('{uid}', '{args.user_id}', '{title}', '{desc}', '{cat}', {target});"
    )
    psql(sql)
    print(f"✅ Goal added: {args.title}")

def cmd_list(args):
    status_filter = f"AND status = '{args.status}'" if args.status else ""
    sql = (
        f"SELECT id, title, category, progress, status, target_date FROM goals "
        f"WHERE user_id = '{args.user_id}' {status_filter} "
        f"ORDER BY created_at DESC;"
    )
    rows = psql(sql)
    if not rows:
        print("🎯 No goals found.")
        return
    print("🎯 Goals:")
    for row in rows.splitlines():
        parts = row.split("|")
        if len(parts) >= 6:
            gid, title, cat, prog, status, td = parts
            bar = "█" * (int(prog) // 10) + "░" * (10 - int(prog) // 10)
            td_str = f" | Target: {td}" if td else ""
            print(f"  [{gid[:8]}] {title} ({cat})")
            print(f"    Progress: {bar} {prog}% | Status: {status}{td_str}")

def cmd_update(args):
    progress = max(0, min(100, int(args.progress)))
    status = "completed" if progress == 100 else "active"
    # Find goal by partial id or title
    goal_id = args.id
    # Try exact UUID match first, then partial
    check = psql(f"SELECT id FROM goals WHERE user_id = '{args.user_id}' AND id LIKE '{goal_id}%' LIMIT 1;")
    if not check:
        check = psql(f"SELECT id FROM goals WHERE user_id = '{args.user_id}' AND title ILIKE '%{esc(goal_id)}%' LIMIT 1;")
    if not check:
        print(f"❌ Goal not found: {goal_id}")
        sys.exit(1)
    real_id = check.strip()
    psql(f"UPDATE goals SET progress = {progress}, status = '{status}', updated_at = NOW() WHERE id = '{real_id}';")
    print(f"✅ Progress updated: {progress}% ({'completed' if progress == 100 else 'in progress'})")

parser = argparse.ArgumentParser()
parser.add_argument("--user-id", required=True)
sub = parser.add_subparsers(dest="cmd")

p_add = sub.add_parser("add")
p_add.add_argument("--title", required=True)
p_add.add_argument("--description")
p_add.add_argument("--category")
p_add.add_argument("--target-date")

p_list = sub.add_parser("list")
p_list.add_argument("--status")

p_update = sub.add_parser("update")
p_update.add_argument("--id", required=True)
p_update.add_argument("--progress", required=True)

args = parser.parse_args()
if args.cmd == "add":      cmd_add(args)
elif args.cmd == "list":   cmd_list(args)
elif args.cmd == "update": cmd_update(args)
else: parser.print_help()
