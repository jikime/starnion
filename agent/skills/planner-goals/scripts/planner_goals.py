#!/usr/bin/env python3
"""starnion-planner-goals — D-Day goal management for Franklin Planner."""
import argparse, sys, os
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL: print("❌ DATABASE_URL is not set.", file=sys.stderr); sys.exit(1)

def psql(sql, params=None): return _shared_psql(sql, DB_URL, params)
def days_left(due): return (date.fromisoformat(due) - date.today()).days

def cmd_search(args):
    kw = args.keyword
    rows = psql(
        "SELECT g.id, g.title, g.due_date::text, g.status, COALESCE(r.name,'') "
        "FROM planner_goals g LEFT JOIN planner_roles r ON g.role_id=r.id "
        "WHERE g.user_id=%s AND g.title ILIKE %s ORDER BY g.due_date LIMIT 10;",
        (args.user_id, f'%{kw}%')
    )
    if not rows: print(f"🔍 '{args.keyword}' 목표 없음."); return
    print(f"🔍 목표 검색 '{args.keyword}':\n")
    for line in rows.split("\n"):
        p = line.split("|")
        if len(p) < 5: continue
        gid, title, due, status, role = [x.strip() for x in p]
        dl = days_left(due)
        dday = f"D-{dl}" if dl > 0 else "D-Day" if dl == 0 else f"D+{abs(dl)}"
        print(f"  [{gid}] 🎯 {title} ({dday}) [{role}] — {status}")

def cmd_add(args):
    title, due, desc = args.title, args.due_date, args.description or ""
    role_id = args.role_id if args.role_id else None
    result = psql(
        "INSERT INTO planner_goals (user_id, title, role_id, due_date, description) "
        "VALUES (%s, %s, %s, %s, %s) RETURNING id;",
        (args.user_id, title, role_id, due, desc)
    )
    dl = days_left(due)
    print(f"✅ 목표 추가됨: 🎯 {args.title} (D-{dl})")

def cmd_list(args):
    if args.status:
        sql = (
            "SELECT g.id, g.title, g.due_date::text, g.status, COALESCE(g.description,''), COALESCE(r.name,'') "
            "FROM planner_goals g LEFT JOIN planner_roles r ON g.role_id=r.id "
            "WHERE g.user_id=%s AND status=%s ORDER BY g.due_date;"
        )
        rows = psql(sql, (args.user_id, args.status))
    else:
        sql = (
            "SELECT g.id, g.title, g.due_date::text, g.status, COALESCE(g.description,''), COALESCE(r.name,'') "
            "FROM planner_goals g LEFT JOIN planner_roles r ON g.role_id=r.id "
            "WHERE g.user_id=%s ORDER BY g.due_date;"
        )
        rows = psql(sql, (args.user_id,))
    if not rows: print("🎯 등록된 목표가 없습니다."); return
    print("🎯 목표 목록:\n")
    for line in rows.split("\n"):
        p = line.split("|")
        if len(p) < 6: continue
        gid, title, due, status, desc, role = [x.strip() for x in p]
        dl = days_left(due)
        dday = f"D-{dl}" if dl > 0 else "D-Day" if dl == 0 else f"D+{abs(dl)}"
        urgent = "🔥" if 0 <= dl <= 7 else ""
        print(f"  [{gid}] {urgent}{title} — {dday} [{role}] ({status})")
        if desc: print(f"      {desc}")

def cmd_update(args):
    sets = []
    params = []
    if args.title:
        sets.append("title=%s")
        params.append(args.title)
    if args.due_date:
        sets.append("due_date=%s")
        params.append(args.due_date)
    if args.description:
        sets.append("description=%s")
        params.append(args.description)
    if args.status:
        sets.append("status=%s")
        params.append(args.status)
    if not sets: print("❌ 수정할 항목 없음."); return
    sets.append("updated_at=NOW()")
    params.extend([args.id, args.user_id])
    result = psql(
        f"UPDATE planner_goals SET {','.join(sets)} WHERE id=%s AND user_id=%s RETURNING title;",
        tuple(params)
    )
    if not result: print("❌ 목표를 찾을 수 없습니다."); return
    print(f"✅ 목표 수정됨: {result.strip()}")

def cmd_delete(args):
    result = psql(
        "DELETE FROM planner_goals WHERE id=%s AND user_id=%s RETURNING title;",
        (args.id, args.user_id)
    )
    if not result: print("❌ 목표를 찾을 수 없습니다."); return
    print(f"🗑️ 목표 삭제됨: {result.strip()}")

parser = argparse.ArgumentParser()
parser.add_argument("--user-id", required=True)
sub = parser.add_subparsers(dest="cmd")
p = sub.add_parser("search"); p.add_argument("--keyword", required=True)
p = sub.add_parser("add"); p.add_argument("--title", required=True); p.add_argument("--due-date", required=True); p.add_argument("--role-id"); p.add_argument("--description")
p = sub.add_parser("list"); p.add_argument("--status")
p = sub.add_parser("update"); p.add_argument("--id", required=True, type=int); p.add_argument("--title"); p.add_argument("--due-date"); p.add_argument("--description"); p.add_argument("--status")
p = sub.add_parser("delete"); p.add_argument("--id", required=True, type=int)

args = parser.parse_args()
{"search": cmd_search, "add": cmd_add, "list": cmd_list, "update": cmd_update, "delete": cmd_delete}.get(args.cmd, lambda a: parser.print_help())(args)
