#!/usr/bin/env python3
"""starnion-planner-roles — Role CRUD for Franklin Planner."""
import argparse, sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL: print("❌ DATABASE_URL is not set.", file=sys.stderr); sys.exit(1)

def psql(sql, params=None): return _shared_psql(sql, DB_URL, params)

def cmd_search(args):
    kw = args.keyword
    rows = psql(
        "SELECT id, name, color, big_rock, COALESCE(mission,'') FROM planner_roles "
        "WHERE user_id=%s AND name ILIKE %s ORDER BY sort_order;",
        (args.user_id, f'%{kw}%')
    )
    if not rows: print(f"🔍 '{args.keyword}' 역할 없음."); return
    print(f"🔍 역할 검색 '{args.keyword}':\n")
    for line in rows.split("\n"):
        p = line.split("|")
        if len(p) < 5: continue
        print(f"  [{p[0].strip()}] 🎭 {p[1].strip()} — 핵심 목표: {p[3].strip()}")

def cmd_add(args):
    name = args.name
    color = args.color or "#3b6de0"
    br = args.big_rock or ""
    mission = args.mission or ""
    psql(
        "INSERT INTO planner_roles (user_id, name, color, big_rock, mission, sort_order) "
        "VALUES (%s, %s, %s, %s, %s, "
        "(SELECT COALESCE(MAX(sort_order),0)+1 FROM planner_roles WHERE user_id=%s));",
        (args.user_id, name, color, br, mission, args.user_id)
    )
    print(f"✅ 역할 추가됨: 🎭 {args.name}")

def cmd_list(args):
    rows = psql(
        "SELECT id, name, color, big_rock, COALESCE(mission,'') FROM planner_roles "
        "WHERE user_id=%s ORDER BY sort_order;",
        (args.user_id,)
    )
    if not rows: print("🎭 등록된 역할이 없습니다."); return
    print("🎭 역할 목록:\n")
    for line in rows.split("\n"):
        p = line.split("|")
        if len(p) < 5: continue
        rid, name, color, br, mission = [x.strip() for x in p]
        print(f"  [{rid}] {name}")
        if br: print(f"      핵심 목표: {br}")
        if mission: print(f"      미션: {mission}")

def cmd_update(args):
    sets = []
    params = []
    if args.name:
        sets.append("name=%s")
        params.append(args.name)
    if args.color:
        sets.append("color=%s")
        params.append(args.color)
    if args.big_rock:
        sets.append("big_rock=%s")
        params.append(args.big_rock)
    if args.mission:
        sets.append("mission=%s")
        params.append(args.mission)
    if not sets: print("❌ 수정할 항목이 없습니다."); return
    sets.append("updated_at=NOW()")
    params.extend([args.id, args.user_id])
    result = psql(
        f"UPDATE planner_roles SET {','.join(sets)} WHERE id=%s AND user_id=%s RETURNING name;",
        tuple(params)
    )
    if not result: print("❌ 해당 역할을 찾을 수 없습니다."); return
    print(f"✅ 역할 수정됨: {result.strip()}")

def cmd_delete(args):
    result = psql(
        "DELETE FROM planner_roles WHERE id=%s AND user_id=%s RETURNING name;",
        (args.id, args.user_id)
    )
    if not result: print("❌ 해당 역할을 찾을 수 없습니다."); return
    print(f"🗑️ 역할 삭제됨: {result.strip()}")

parser = argparse.ArgumentParser()
parser.add_argument("--user-id", required=True)
sub = parser.add_subparsers(dest="cmd")
p = sub.add_parser("search"); p.add_argument("--keyword", required=True)
p = sub.add_parser("add"); p.add_argument("--name", required=True); p.add_argument("--color"); p.add_argument("--big-rock"); p.add_argument("--mission")
sub.add_parser("list")
p = sub.add_parser("update"); p.add_argument("--id", required=True, type=int); p.add_argument("--name"); p.add_argument("--color"); p.add_argument("--big-rock"); p.add_argument("--mission")
p = sub.add_parser("delete"); p.add_argument("--id", required=True, type=int)

args = parser.parse_args()
{"search": cmd_search, "add": cmd_add, "list": cmd_list, "update": cmd_update, "delete": cmd_delete}.get(args.cmd, lambda a: parser.print_help())(args)
