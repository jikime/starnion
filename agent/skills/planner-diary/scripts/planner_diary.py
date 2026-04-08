#!/usr/bin/env python3
"""starnion-planner-diary — Daily diary with mood tracking."""
import argparse, sys, os
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import psql as _shared_psql

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL: print("❌ DATABASE_URL is not set.", file=sys.stderr); sys.exit(1)

def psql(sql, params=None): return _shared_psql(sql, DB_URL, params)
def today(): return date.today().isoformat()

MOOD_EMOJI = {"great": "★★★", "good": "★★", "neutral": "★", "tired": "△", "rough": "▽"}

def cmd_write(args):
    d = args.date or today()
    one_liner = args.text
    full_note = args.note or ""
    mood = args.mood or "neutral"
    if mood not in MOOD_EMOJI: print(f"❌ 기분은 great/good/neutral/tired/rough 중 하나."); return
    sql = (
        "INSERT INTO planner_diary (user_id, entry_date, one_liner, mood, full_note) "
        "VALUES (%s, %s, %s, %s, %s) "
        "ON CONFLICT (user_id, entry_date) DO UPDATE SET "
        "one_liner=%s, mood=%s, "
        "full_note=CASE WHEN %s='' THEN planner_diary.full_note ELSE %s END, "
        "updated_at=NOW();"
    )
    psql(sql, (args.user_id, d, one_liner, mood, full_note,
               one_liner, mood, full_note, full_note))
    print(f"📔 오늘의 한마디 저장됨 ({d})")
    print(f"  {MOOD_EMOJI.get(mood, '★')} {args.text}")

def cmd_read(args):
    d = args.date or today()
    row = psql(
        "SELECT entry_date::text, one_liner, mood, COALESCE(full_note,'') "
        "FROM planner_diary WHERE user_id=%s AND entry_date=%s;",
        (args.user_id, d)
    )
    if not row: print(f"📔 {d} 오늘의 한마디가 없습니다."); return
    p = row.strip().split("|")
    if len(p) < 4: return
    ed, ol, mood, fn = [x.strip() for x in p]
    print(f"📔 {ed} 오늘의 한마디\n")
    print(f"  {MOOD_EMOJI.get(mood, '★')} {ol}")
    if fn: print(f"\n  {fn}")

def cmd_mood(args):
    d = args.date or today()
    mood = args.mood
    if mood not in MOOD_EMOJI: print(f"❌ 기분은 great/good/neutral/tired/rough 중 하나."); return
    psql(
        "INSERT INTO planner_diary (user_id, entry_date, mood) "
        "VALUES (%s, %s, %s) "
        "ON CONFLICT (user_id, entry_date) DO UPDATE SET mood=%s, updated_at=NOW();",
        (args.user_id, d, mood, mood)
    )
    print(f"📔 컨디션 기록: {MOOD_EMOJI[mood]} ({mood}) — {d}")

parser = argparse.ArgumentParser()
parser.add_argument("--user-id", required=True)
sub = parser.add_subparsers(dest="cmd")
p = sub.add_parser("write"); p.add_argument("--text", required=True); p.add_argument("--mood", default="neutral"); p.add_argument("--note"); p.add_argument("--date")
p = sub.add_parser("read"); p.add_argument("--date")
p = sub.add_parser("mood"); p.add_argument("--mood", required=True); p.add_argument("--date")

args = parser.parse_args()
{"write": cmd_write, "read": cmd_read, "mood": cmd_mood}.get(args.cmd, lambda a: parser.print_help())(args)
