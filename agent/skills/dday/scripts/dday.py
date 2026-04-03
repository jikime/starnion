#!/usr/bin/env python3
"""starnion-dday — D-Day tracking CLI for StarNion agent."""
import argparse, sys, os
from datetime import date, datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL:
    print("❌ DATABASE_URL is not set.", file=sys.stderr)
    sys.exit(1)

def psql(sql): return _shared_psql(sql, DB_URL)

def esc(s):
    return (s or "").replace("'", "''")

def calc_dday(target: date) -> str:
    delta = (target - date.today()).days
    if delta > 0:
        return f"D-{delta}"
    if delta == 0:
        return "D-Day!"
    return f"D+{abs(delta)}"

def effective_date(target: date, recurring: bool) -> date:
    """For recurring D-Days, return the upcoming occurrence."""
    if not recurring:
        return target
    today = date.today()
    try:
        this_year = target.replace(year=today.year)
    except ValueError:
        this_year = date(today.year, 3, 1)
    if this_year < today:
        try:
            return target.replace(year=today.year + 1)
        except ValueError:
            return date(today.year + 1, 3, 1)
    return this_year

def cmd_set(args):
    try:
        target_dt = datetime.strptime(args.target_date.strip(), "%Y-%m-%d").date()
    except ValueError:
        print("❌ Invalid date format. Use YYYY-MM-DD.", file=sys.stderr)
        sys.exit(1)

    title = esc(args.title)
    icon = esc(args.icon or "📅")
    desc = esc(args.description or "")
    recurring = "true" if args.recurring else "false"

    sql = (
        f"INSERT INTO ddays (user_id, title, target_date, icon, description, recurring) "
        f"VALUES ('{args.user_id}', '{title}', '{args.target_date}', '{icon}', '{desc}', {recurring}) "
        f"RETURNING id;"
    )
    result = psql(sql)
    dday_id = result.strip()
    dday_str = calc_dday(target_dt)
    recurring_label = " (yearly)" if args.recurring else ""
    print(f"✅ D-Day set: {args.title}{recurring_label}")
    print(f"ID: {dday_id} | Date: {args.target_date} | {dday_str}")

def cmd_list(args):
    sql = (
        f"SELECT id, title, target_date, icon, description, recurring "
        f"FROM ddays WHERE user_id = '{args.user_id}' "
        f"ORDER BY target_date ASC;"
    )
    rows = psql(sql)
    if not rows:
        print("📅 No D-Days registered.")
        return

    items = []
    for row in rows.splitlines():
        parts = row.split("|")
        if len(parts) < 6:
            continue
        did, title, td_str, icon, desc, recurring = parts
        try:
            target_dt = datetime.strptime(td_str.strip(), "%Y-%m-%d").date()
        except ValueError:
            continue
        is_recurring = recurring.strip() == "t"
        display_dt = effective_date(target_dt, is_recurring)

        if not args.include_past and display_dt < date.today() and not is_recurring:
            continue

        dday_str = calc_dday(display_dt)
        recurring_label = " 🔄" if is_recurring else ""
        items.append((display_dt, f"{icon.strip()} {title}{recurring_label} — {dday_str} (ID: {did})\n  Date: {display_dt}" + (f"\n  {desc}" if desc.strip() else "")))

    if not items:
        print("📅 No active D-Days.")
        return

    items.sort(key=lambda x: x[0])
    print("📅 D-Day list:")
    for _, line in items:
        print(f"  {line}")

def cmd_delete(args):
    sql = f"DELETE FROM ddays WHERE id = {args.id} AND user_id = '{args.user_id}' RETURNING id;"
    result = psql(sql)
    if not result.strip():
        print(f"❌ D-Day ID {args.id} not found.")
        sys.exit(1)
    print(f"✅ D-Day deleted (ID: {args.id})")

parser = argparse.ArgumentParser(description="StarNion D-Day tracking")
parser.add_argument("--user-id", required=True, help="User UUID")
sub = parser.add_subparsers(dest="cmd")

p_set = sub.add_parser("set", help="Set a D-Day")
p_set.add_argument("--title", required=True, help="D-Day name")
p_set.add_argument("--target-date", required=True, help="Target date (YYYY-MM-DD)")
p_set.add_argument("--icon", default="📅", help="Icon emoji (default: 📅)")
p_set.add_argument("--description", default="", help="Note (optional)")
p_set.add_argument("--recurring", action="store_true", help="Repeat yearly")

p_list = sub.add_parser("list", help="List D-Days")
p_list.add_argument("--include-past", action="store_true", help="Include past D-Days")

p_del = sub.add_parser("delete", help="Delete a D-Day")
p_del.add_argument("--id", required=True, type=int, help="D-Day ID")

args = parser.parse_args()
if args.cmd == "set":       cmd_set(args)
elif args.cmd == "list":    cmd_list(args)
elif args.cmd == "delete":  cmd_delete(args)
else: parser.print_help()
