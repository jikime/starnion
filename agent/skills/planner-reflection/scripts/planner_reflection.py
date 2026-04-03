#!/usr/bin/env python3
"""starnion-planner-reflection — Daily reflection notes."""
import argparse, sys, os, json
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL: print("❌ DATABASE_URL is not set.", file=sys.stderr); sys.exit(1)

def psql(sql): return _shared_psql(sql, DB_URL)
def esc(s): return (s or "").replace("'", "''")
def today(): return date.today().isoformat()

def cmd_add(args):
    d = args.date or today()
    text = esc(args.text)
    ts = __import__("datetime").datetime.now().isoformat() + "Z"
    new_note = json.dumps({"id": str(int(__import__("time").time() * 1000)), "text": args.text, "createdAt": ts})
    # Read existing notes
    row = psql(f"SELECT notes FROM planner_reflection_notes WHERE user_id='{args.user_id}' AND note_date='{d}';")
    if row and row.strip():
        try:
            existing = json.loads(row.strip())
            if isinstance(existing, list):
                existing.append(json.loads(new_note))
                notes_json = json.dumps(existing)
            else:
                notes_json = json.dumps([json.loads(new_note)])
        except:
            notes_json = json.dumps([json.loads(new_note)])
    else:
        notes_json = json.dumps([json.loads(new_note)])
    notes_escaped = esc(notes_json)
    psql(f"INSERT INTO planner_reflection_notes (user_id, note_date, notes) VALUES ('{args.user_id}', '{d}', '{notes_escaped}'::jsonb) ON CONFLICT (user_id, note_date) DO UPDATE SET notes='{notes_escaped}'::jsonb, updated_at=NOW();")
    print(f"💭 성찰 노트 추가됨 ({d})")
    print(f"  {args.text[:80]}{'...' if len(args.text) > 80 else ''}")

def cmd_list(args):
    d = args.date or today()
    row = psql(f"SELECT notes FROM planner_reflection_notes WHERE user_id='{args.user_id}' AND note_date='{d}';")
    if not row or not row.strip(): print(f"💭 {d} 성찰 노트가 없습니다."); return
    try:
        notes = json.loads(row.strip())
    except:
        print(f"💭 {d}: {row.strip()}"); return
    if not isinstance(notes, list): print(f"💭 {d}: {row.strip()}"); return
    print(f"💭 {d} 성찰 노트 ({len(notes)}개):\n")
    for i, n in enumerate(notes, 1):
        text = n.get("text", "")
        time_str = n.get("createdAt", "")[:16].replace("T", " ")
        print(f"  {i}. {text}")
        if time_str: print(f"     ({time_str})")
        print()

parser = argparse.ArgumentParser()
parser.add_argument("--user-id", required=True)
sub = parser.add_subparsers(dest="cmd")
p = sub.add_parser("add"); p.add_argument("--text", required=True); p.add_argument("--date")
p = sub.add_parser("list"); p.add_argument("--date")

args = parser.parse_args()
{"add": cmd_add, "list": cmd_list}.get(args.cmd, lambda a: parser.print_help())(args)
