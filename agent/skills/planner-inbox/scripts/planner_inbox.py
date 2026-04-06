#!/usr/bin/env python3
"""starnion-planner-inbox — Inbox/capture management for Franklin Planner."""
import argparse, sys, os
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL:
    print("❌ DATABASE_URL is not set.", file=sys.stderr); sys.exit(1)

def psql(sql, params=None): return _shared_psql(sql, DB_URL, params)
def today(): return date.today().isoformat()

def cmd_search(args):
    kw = args.keyword
    rows = psql(
        "SELECT id, title, priority FROM planner_tasks "
        "WHERE user_id=%s AND is_inbox=TRUE AND title ILIKE %s ORDER BY sort_order LIMIT 10;",
        (args.user_id, f'%{kw}%')
    )
    if not rows: print(f"🔍 '{args.keyword}' 검색 결과 없음."); return
    print(f"🔍 임시보관 검색 '{args.keyword}':\n")
    for line in rows.split("\n"):
        p = line.split("|")
        if len(p) < 3: continue
        print(f"  [{p[0].strip()}] {p[1].strip()}")

def cmd_add(args):
    title = args.title
    psql(
        "INSERT INTO planner_tasks (user_id, title, is_inbox, task_date, sort_order) "
        "VALUES (%s, %s, TRUE, %s, "
        "(SELECT COALESCE(MAX(sort_order),0)+1 FROM planner_tasks WHERE user_id=%s AND is_inbox=TRUE));",
        (args.user_id, title, today(), args.user_id)
    )
    print(f"📥 임시보관 추가: {args.title}")

def cmd_list(args):
    rows = psql(
        "SELECT id, title, priority FROM planner_tasks "
        "WHERE user_id=%s AND is_inbox=TRUE ORDER BY sort_order;",
        (args.user_id,)
    )
    if not rows: print("📥 임시보관함이 비어 있습니다."); return
    print("📥 임시보관 목록:\n")
    for line in rows.split("\n"):
        p = line.split("|")
        if len(p) < 3: continue
        print(f"  [{p[0].strip()}] {p[1].strip()}")

def cmd_promote(args):
    pri = (args.priority or "B").upper()
    d = args.date or today()
    result = psql(
        "UPDATE planner_tasks SET is_inbox=FALSE, priority=%s, task_date=%s, updated_at=NOW() "
        "WHERE id=%s AND user_id=%s AND is_inbox=TRUE RETURNING title;",
        (pri, d, args.id, args.user_id)
    )
    if not result: print("❌ 해당 항목을 찾을 수 없습니다."); return
    print(f"✅ 업무로 이동: {result.strip()} → {pri} ({d})")

def cmd_delete(args):
    result = psql(
        "DELETE FROM planner_tasks WHERE id=%s AND user_id=%s AND is_inbox=TRUE RETURNING title;",
        (args.id, args.user_id)
    )
    if not result: print("❌ 해당 항목을 찾을 수 없습니다."); return
    print(f"🗑️ 삭제됨: {result.strip()}")

parser = argparse.ArgumentParser()
parser.add_argument("--user-id", required=True)
sub = parser.add_subparsers(dest="cmd")
p = sub.add_parser("search"); p.add_argument("--keyword", required=True)
p = sub.add_parser("add"); p.add_argument("--title", required=True)
sub.add_parser("list")
p = sub.add_parser("promote"); p.add_argument("--id", required=True, type=int); p.add_argument("--priority", default="B"); p.add_argument("--date")
p = sub.add_parser("delete"); p.add_argument("--id", required=True, type=int)

args = parser.parse_args()
{"search": cmd_search, "add": cmd_add, "list": cmd_list, "promote": cmd_promote, "delete": cmd_delete}.get(args.cmd, lambda a: parser.print_help())(args)
