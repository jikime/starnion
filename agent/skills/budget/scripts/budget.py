#!/usr/bin/env python3
"""starnion-budget — monthly budget management CLI for StarNion agent."""
import argparse, sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL:
    print("❌ DATABASE_URL is not set.", file=sys.stderr)
    sys.exit(1)

def psql(sql, params=None): return _shared_psql(sql, DB_URL, params)

def get_budget(user_id):
    rows = psql(
        "SELECT category, amount FROM budgets "
        "WHERE user_id = %s AND period = 'monthly';",
        (user_id,)
    )
    budget = {}
    if rows:
        for line in rows.splitlines():
            parts = line.split("|")
            if len(parts) == 2:
                budget[parts[0]] = int(parts[1])
    return budget

def cmd_set(args):
    if not args.category or not args.amount:
        print("Error: --category and --amount are required", file=sys.stderr)
        sys.exit(1)
    psql(
        "INSERT INTO budgets (user_id, category, amount, period) "
        "VALUES (%s, %s, %s, 'monthly') "
        "ON CONFLICT (user_id, category, period) DO UPDATE "
        "SET amount = EXCLUDED.amount, updated_at = NOW();",
        (args.user_id, args.category, args.amount)
    )
    print(f"✅ Monthly budget for '{args.category}' set to {args.amount:,}.")

def cmd_status(args):
    budget = get_budget(args.user_id)
    if not budget:
        print("No budgets set. Use the 'set' command to set a budget.")
        return

    from datetime import datetime
    month = datetime.now().strftime("%Y-%m")

    if args.category:
        budget_amount = budget.get(args.category)
        if not budget_amount:
            print(f"No budget set for category '{args.category}'.")
            return
        row = psql(
            "SELECT COALESCE(ABS(SUM(amount)), 0) FROM finances "
            "WHERE user_id = %s AND category = %s "
            "AND TO_CHAR(created_at, 'YYYY-MM') = %s AND amount < 0;",
            (args.user_id, args.category, month)
        )
        spent = int(float(row or "0"))
        pct = (spent / budget_amount * 100) if budget_amount > 0 else 0
        status = "(over!)" if pct >= 100 else "(warning)" if pct >= 80 else ""
        print(f"{args.category} budget: {spent:,} / {budget_amount:,} ({pct:.0f}%) {status}")
    else:
        print("This month's budget status:")
        for cat, budget_amount in budget.items():
            row = psql(
                "SELECT COALESCE(ABS(SUM(amount)), 0) FROM finances "
                "WHERE user_id = %s AND category = %s "
                "AND TO_CHAR(created_at, 'YYYY-MM') = %s AND amount < 0;",
                (args.user_id, cat, month)
            )
            spent = int(float(row or "0"))
            pct = (spent / budget_amount * 100) if budget_amount > 0 else 0
            status = "(over!)" if pct >= 100 else "(warning)" if pct >= 80 else ""
            print(f"  {cat}: {spent:,} / {budget_amount:,} ({pct:.0f}%) {status}")

def main():
    parser = argparse.ArgumentParser(description="Budget management")
    parser.add_argument("--user-id", required=True)
    sub = parser.add_subparsers(dest="command")

    p_set = sub.add_parser("set", help="Set budget for a category")
    p_set.add_argument("--category", required=True)
    p_set.add_argument("--amount", type=int, required=True)

    p_status = sub.add_parser("status", help="Check budget status")
    p_status.add_argument("--category", default="")

    args = parser.parse_args()
    if args.command == "set":
        cmd_set(args)
    elif args.command == "status":
        cmd_status(args)
    else:
        parser.print_help()
        sys.exit(1)

if __name__ == "__main__":
    main()
