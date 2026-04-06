#!/usr/bin/env python3
"""starnion-planner-tasks — Daily task CRUD for Franklin Planner."""
import argparse, sys, os
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL:
    print("❌ DATABASE_URL is not set.", file=sys.stderr)
    sys.exit(1)

def psql(sql, params=None): return _shared_psql(sql, DB_URL, params)
def today(): return date.today().isoformat()

PRIORITY_EMOJI = {"A": "🔴", "B": "🔵", "C": "⚪"}
STATUS_EMOJI = {"pending": "⬜", "in-progress": "🟡", "done": "✅", "forwarded": "➡️", "cancelled": "❌", "delegated": "👤"}

import re
def parse_priority(val):
    """Parse 'A1', 'B2', 'A', 'C3' → (priority, order). order is 0-based internally."""
    if not val: return "C", None
    val = val.strip().upper()
    m = re.match(r'^([ABC])(\d+)?$', val)
    if not m: return "C", None
    pri = m.group(1)
    order = int(m.group(2)) - 1 if m.group(2) else None  # 1-based input → 0-based
    return pri, order


def cmd_search(args):
    d = args.date or today()
    kw = args.keyword
    sql = (
        "SELECT t.id, t.title, t.priority, t.sort_order, t.status, t.task_date::text, "
        "COALESCE(r.name,'') as role_name "
        "FROM planner_tasks t LEFT JOIN planner_roles r ON t.role_id = r.id "
        "WHERE t.user_id = %s AND t.is_inbox = FALSE "
        "AND t.title ILIKE %s "
    )
    params = [args.user_id, f'%{kw}%']
    if args.date:
        sql += "AND t.task_date = %s "
        params.append(d)
    sql += "ORDER BY t.task_date DESC, t.priority, t.sort_order LIMIT 10;"
    rows = psql(sql, tuple(params))
    if not rows:
        print(f"🔍 '{args.keyword}' 검색 결과가 없습니다.")
        return
    print(f"🔍 '{args.keyword}' 검색 결과:\n")
    for line in rows.split("\n"):
        parts = line.split("|")
        if len(parts) < 7: continue
        tid, title, pri, order, status, td, role = [p.strip() for p in parts]
        emoji = STATUS_EMOJI.get(status, "⬜")
        pe = PRIORITY_EMOJI.get(pri, "⚪")
        role_str = f" [{role}]" if role else ""
        print(f"  {emoji} [{tid}] {pe} {pri}{int(order)+1}. {title}{role_str} ({td})")


def cmd_add(args):
    d = args.date or today()
    pri, order = parse_priority(args.priority)
    role_id = args.role_id if args.role_id else None
    wg_id = args.weekly_goal_id if args.weekly_goal_id else None
    ts = f"{args.time_start}:00" if args.time_start else None
    te = f"{args.time_end}:00" if args.time_end else None
    if order is not None:
        sql = (
            "INSERT INTO planner_tasks (user_id, title, priority, role_id, task_date, time_start, time_end, sort_order, weekly_goal_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "RETURNING id, sort_order;"
        )
        params = (args.user_id, args.title, pri, role_id, d, ts, te, order, wg_id)
    else:
        sql = (
            "INSERT INTO planner_tasks (user_id, title, priority, role_id, task_date, time_start, time_end, sort_order, weekly_goal_id) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, "
            "(SELECT COALESCE(MAX(sort_order),0)+1 FROM planner_tasks "
            "WHERE user_id=%s AND task_date=%s AND priority=%s AND is_inbox=FALSE), %s) "
            "RETURNING id, sort_order;"
        )
        params = (args.user_id, args.title, pri, role_id, d, ts, te, args.user_id, d, pri, wg_id)
    result = psql(sql, params)
    parts = result.strip().split("|") if result else ["?", "0"]
    tid = parts[0].strip()
    final_order = int(parts[1].strip()) + 1 if len(parts) > 1 else "?"
    pe = PRIORITY_EMOJI.get(pri, "⚪")
    print(f"✅ 업무 추가됨: {pe} {pri}{final_order}. {args.title} ({d})")
    if args.time_start:
        print(f"⏰ 시간: {args.time_start}:00~{args.time_end or '?'}:00")
    print(f"🆔 ID: {tid}")


def cmd_list(args):
    d = args.date or today()
    sql = (
        "SELECT t.id, t.title, t.priority, t.sort_order, t.status, "
        "COALESCE(t.time_start,''), COALESCE(t.time_end,''), "
        "COALESCE(r.name,''), COALESCE(t.note,'') "
        "FROM planner_tasks t LEFT JOIN planner_roles r ON t.role_id = r.id "
        "WHERE t.user_id = %s AND t.is_inbox = FALSE AND t.task_date = %s "
        "ORDER BY t.priority, t.sort_order;"
    )
    rows = psql(sql, (args.user_id, d))
    if not rows:
        print(f"📋 {d} 업무가 없습니다.")
        return
    print(f"📋 {d} 업무 목록\n")
    current_pri = ""
    for line in rows.split("\n"):
        parts = line.split("|")
        if len(parts) < 9: continue
        tid, title, pri, order, status, ts, te, role, note = [p.strip() for p in parts]
        if pri != current_pri:
            current_pri = pri
            pe = PRIORITY_EMOJI.get(pri, "⚪")
            print(f"\n{pe} {pri} 그룹:")
        emoji = STATUS_EMOJI.get(status, "⬜")
        time_str = f" ({ts}~{te})" if ts else ""
        role_str = f" [{role}]" if role else ""
        memo_str = " 📝" if note else ""
        print(f"  {emoji} [{tid}] {pri}{int(order)+1}. {title}{role_str}{time_str}{memo_str}")


def cmd_update(args):
    sets = []
    params = []
    if args.status:
        valid = ("pending", "in-progress", "done", "forwarded", "cancelled", "delegated")
        if args.status not in valid:
            print(f"❌ 상태는 {', '.join(valid)} 중 하나여야 합니다.")
            return
        sets.append("status = %s")
        params.append(args.status)
    if args.title:
        sets.append("title = %s")
        params.append(args.title)
    if args.priority:
        sets.append("priority = %s")
        params.append(args.priority.upper())
    if not sets:
        print("❌ 수정할 항목이 없습니다. --status, --title, --priority 중 하나를 지정하세요.")
        return
    sets.append("updated_at = NOW()")
    params.extend([args.id, args.user_id])
    sql = (
        f"UPDATE planner_tasks SET {', '.join(sets)} "
        "WHERE id = %s AND user_id = %s AND is_inbox = FALSE "
        "RETURNING title, status;"
    )
    result = psql(sql, tuple(params))
    if not result:
        print("❌ 해당 업무를 찾을 수 없습니다.")
        return
    parts = result.strip().split("|")
    title = parts[0].strip() if parts else "?"
    status = parts[1].strip() if len(parts) > 1 else "?"
    emoji = STATUS_EMOJI.get(status, "⬜")
    print(f"{emoji} 업무 수정됨: {title} → {status}")


def cmd_delete(args):
    sql = (
        "DELETE FROM planner_tasks WHERE id = %s AND user_id = %s AND is_inbox = FALSE "
        "RETURNING title;"
    )
    result = psql(sql, (args.id, args.user_id))
    if not result:
        print("❌ 해당 업무를 찾을 수 없습니다.")
        return
    print(f"🗑️ 삭제됨: {result.strip()}")


def cmd_forward(args):
    # Mark as forwarded
    sql1 = (
        "UPDATE planner_tasks SET status = 'forwarded', updated_at = NOW() "
        "WHERE id = %s AND user_id = %s AND is_inbox = FALSE "
        "RETURNING title, task_date::text;"
    )
    result = psql(sql1, (args.id, args.user_id))
    if not result:
        print("❌ 해당 업무를 찾을 수 없습니다.")
        return
    parts = result.strip().split("|")
    title = parts[0].strip()
    old_date = parts[1].strip()
    # Create copy for tomorrow
    sql2 = (
        "INSERT INTO planner_tasks (user_id, title, priority, role_id, time_start, time_end, note, sort_order, task_date, forwarded_from_id) "
        "SELECT user_id, title, priority, role_id, time_start, time_end, note, sort_order, task_date + 1, id "
        "FROM planner_tasks WHERE id = %s "
        "RETURNING id, task_date::text;"
    )
    result2 = psql(sql2, (args.id,))
    new_parts = result2.strip().split("|") if result2 else ["?", "?"]
    new_date = new_parts[1].strip() if len(new_parts) > 1 else "?"
    print(f"➡️ 이월됨: {title}")
    print(f"  {old_date} → {new_date}")


def cmd_memo(args):
    sql = (
        "UPDATE planner_tasks SET note = %s, updated_at = NOW() "
        "WHERE id = %s AND user_id = %s AND is_inbox = FALSE "
        "RETURNING title;"
    )
    result = psql(sql, (args.text, args.id, args.user_id))
    if not result:
        print("❌ 해당 업무를 찾을 수 없습니다.")
        return
    print(f"📝 메모 저장됨: {result.strip()}")
    print(f"  → {args.text[:60]}{'...' if len(args.text) > 60 else ''}")


def cmd_memo_clear(args):
    sql = (
        "UPDATE planner_tasks SET note = NULL, updated_at = NOW() "
        "WHERE id = %s AND user_id = %s AND is_inbox = FALSE "
        "RETURNING title;"
    )
    result = psql(sql, (args.id, args.user_id))
    if not result:
        print("❌ 해당 업무를 찾을 수 없습니다.")
        return
    print(f"🗑️ 메모 삭제됨: {result.strip()}")


# ── CLI ──────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Planner daily tasks")
parser.add_argument("--user-id", required=True)
sub = parser.add_subparsers(dest="cmd")

p_search = sub.add_parser("search")
p_search.add_argument("--keyword", required=True)
p_search.add_argument("--date")

p_add = sub.add_parser("add")
p_add.add_argument("--title", required=True)
p_add.add_argument("--priority", default="C")
p_add.add_argument("--role-id")
p_add.add_argument("--date")
p_add.add_argument("--time-start", type=int)
p_add.add_argument("--time-end", type=int)
p_add.add_argument("--weekly-goal-id", help="Link to weekly key plan")

p_list = sub.add_parser("list")
p_list.add_argument("--date")

p_update = sub.add_parser("update")
p_update.add_argument("--id", required=True, type=int)
p_update.add_argument("--status")
p_update.add_argument("--title")
p_update.add_argument("--priority")

p_delete = sub.add_parser("delete")
p_delete.add_argument("--id", required=True, type=int)

p_forward = sub.add_parser("forward")
p_forward.add_argument("--id", required=True, type=int)

p_memo = sub.add_parser("memo")
p_memo.add_argument("--id", required=True, type=int)
p_memo.add_argument("--text", required=True)

p_memo_clear = sub.add_parser("memo-clear")
p_memo_clear.add_argument("--id", required=True, type=int)

args = parser.parse_args()
if args.cmd == "search": cmd_search(args)
elif args.cmd == "add": cmd_add(args)
elif args.cmd == "list": cmd_list(args)
elif args.cmd == "update": cmd_update(args)
elif args.cmd == "delete": cmd_delete(args)
elif args.cmd == "forward": cmd_forward(args)
elif args.cmd == "memo": cmd_memo(args)
elif args.cmd == "memo-clear": cmd_memo_clear(args)
else: parser.print_help()
