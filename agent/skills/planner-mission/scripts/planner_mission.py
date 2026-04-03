#!/usr/bin/env python3
"""starnion-planner-mission — Mission statement management."""
import argparse, sys, os, json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL: print("❌ DATABASE_URL is not set.", file=sys.stderr); sys.exit(1)

def psql(sql): return _shared_psql(sql, DB_URL)
def esc(s): return (s or "").replace("'", "''")

def cmd_set(args):
    mission_json = json.dumps(args.text)
    psql(f"UPDATE users SET preferences = jsonb_set(COALESCE(preferences,'{{}}'::jsonb), '{{planner_mission}}', '{esc(mission_json)}'::jsonb) WHERE id = '{args.user_id}';")
    print(f"🧭 사명문 저장됨:")
    print(f"  \"{args.text}\"")

def cmd_get(args):
    row = psql(f"SELECT COALESCE(preferences,'{{}}'::jsonb) FROM users WHERE id='{args.user_id}';")
    if not row: print("🧭 사명문이 설정되지 않았습니다."); return
    try:
        prefs = json.loads(row.strip())
        mission = prefs.get("planner_mission", "")
    except:
        mission = ""
    if not mission: print("🧭 사명문이 설정되지 않았습니다."); return
    print(f"🧭 나의 사명문:\n")
    print(f"  \"{mission}\"")

parser = argparse.ArgumentParser()
parser.add_argument("--user-id", required=True)
sub = parser.add_subparsers(dest="cmd")
p = sub.add_parser("set"); p.add_argument("--text", required=True)
sub.add_parser("get")

args = parser.parse_args()
{"set": cmd_set, "get": cmd_get}.get(args.cmd, lambda a: parser.print_help())(args)
