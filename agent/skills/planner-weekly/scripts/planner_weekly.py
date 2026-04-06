#!/usr/bin/env python3
"""starnion-planner-weekly — Weekly key goals management for Planner."""
import argparse, sys, os
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL: print("❌ DATABASE_URL is not set.", file=sys.stderr); sys.exit(1)

def psql(sql, params=None): return _shared_psql(sql, DB_URL, params)
def monday_of(d=None):
    d = d or date.today()
    return (d - __import__("datetime").timedelta(days=d.weekday())).isoformat()

def cmd_search(args):
    kw = args.keyword
    week = args.week or monday_of()
    rows = psql(
        "SELECT w.id, w.title, w.done, COALESCE(r.name,'') "
        "FROM planner_weekly_goals w LEFT JOIN planner_roles r ON w.role_id=r.id "
        "WHERE w.user_id=%s AND w.week_start=%s AND w.title ILIKE %s ORDER BY w.id;",
        (args.user_id, week, f'%{kw}%')
    )
    if not rows: print(f"🔍 '{args.keyword}' 주간 목표 없음."); return
    print(f"🔍 주간 목표 검색 '{args.keyword}':\n")
    for line in rows.split("\n"):
        p = line.split("|")
        if len(p) < 4: continue
        wid, title, done, role = [x.strip() for x in p]
        check = "✅" if done == "t" else "⬜"
        print(f"  {check} [{wid}] {title} [{role}]")

def cmd_add(args):
    title = args.title
    week = args.week or monday_of()
    psql(
        "INSERT INTO planner_weekly_goals (user_id, role_id, title, week_start) "
        "VALUES (%s, %s, %s, %s);",
        (args.user_id, args.role_id, title, week)
    )
    print(f"✅ 주간 목표 추가: 🪨 {args.title} (주간: {week})")

def cmd_list(args):
    week = args.week or monday_of()
    rows = psql(
        "SELECT w.id, w.title, w.done, COALESCE(r.name,'') "
        "FROM planner_weekly_goals w LEFT JOIN planner_roles r ON w.role_id=r.id "
        "WHERE w.user_id=%s AND w.week_start=%s ORDER BY r.sort_order, w.id;",
        (args.user_id, week)
    )
    if not rows: print(f"🪨 {week} 주간 목표가 없습니다."); return
    print(f"🪨 주간 목표 ({week}):\n")
    for line in rows.split("\n"):
        p = line.split("|")
        if len(p) < 4: continue
        wid, title, done, role = [x.strip() for x in p]
        check = "✅" if done == "t" else "⬜"
        print(f"  {check} [{wid}] {title} [{role}]")

def cmd_toggle(args):
    result = psql(
        "UPDATE planner_weekly_goals SET done=NOT done, updated_at=NOW() "
        "WHERE id=%s AND user_id=%s RETURNING title, done;",
        (args.id, args.user_id)
    )
    if not result: print("❌ 주간 목표를 찾을 수 없습니다."); return
    p = result.strip().split("|")
    status = "완료 ✅" if p[1].strip() == "t" else "미완료 ⬜"
    print(f"🪨 {p[0].strip()} → {status}")

def cmd_delete(args):
    result = psql(
        "DELETE FROM planner_weekly_goals WHERE id=%s AND user_id=%s RETURNING title;",
        (args.id, args.user_id)
    )
    if not result: print("❌ 주간 목표를 찾을 수 없습니다."); return
    print(f"🗑️ 삭제됨: {result.strip()}")

parser = argparse.ArgumentParser()
parser.add_argument("--user-id", required=True)
sub = parser.add_subparsers(dest="cmd")
p = sub.add_parser("search"); p.add_argument("--keyword", required=True); p.add_argument("--week")
p = sub.add_parser("add"); p.add_argument("--title", required=True); p.add_argument("--role-id", required=True, type=int); p.add_argument("--week")
p = sub.add_parser("list"); p.add_argument("--week")
p = sub.add_parser("toggle"); p.add_argument("--id", required=True, type=int)
p = sub.add_parser("delete"); p.add_argument("--id", required=True, type=int)

args = parser.parse_args()
{"search": cmd_search, "add": cmd_add, "list": cmd_list, "toggle": cmd_toggle, "delete": cmd_delete}.get(args.cmd, lambda a: parser.print_help())(args)
