---
name: connect-activity
display_name: 인맥 활동 기록
description: "Record and sync Connect (인맥) activity timeline entries. Pulls from Google Calendar + Gmail (shares google-workspace OAuth token), or accepts manual entries like '김철수와 어제 점심 먹었어'. Use for: 인맥 활동, 활동 기록, 만남 기록, 미팅 기록, 점심, 저녁, 통화 기록, 일정 동기화, 인맥 동기화, connect sync, connect activity, meeting log, met with, had lunch with"
version: 1.0.0
emoji: "🕒"
category: productivity
enabled_by_default: false
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 인맥 활동
    - 활동 기록
    - 만남 기록
    - 미팅 기록
    - 통화 기록
    - 점심 먹었
    - 저녁 먹었
    - 만났어
    - 미팅했어
    - 통화했어
    - 식사했어
    - 일정 동기화
    - 인맥 동기화
    - 구글 캘린더 인맥
    - 이메일 인맥
    - connect activity
    - connect sync
    - sync activities
    - met with
    - had meeting
    - had lunch with
    - activity log
  when_to_use:
    - User describes a past interaction with a known connection ("어제 김철수와 점심 먹었어")
    - User asks to pull Gmail/Calendar events into their Connect timeline ("내 일정에서 인맥 활동 가져와줘")
    - User wants to list recent activities with a connection ("최근에 박영희랑 무슨 일정 있었지?")
    - User wants to delete an activity entry they recorded by mistake
  not_for:
    - Creating a new connection from scratch (use connect-ocr or the web UI)
    - Editing static personal facts like "비건 식단" or "자녀 2명" (use connect-memo — that's the Context Memo)
    - Marking "I just contacted them now" as a one-shot ping (use the touch button in the web UI)
    - General calendar/Gmail browsing (use google-workspace)
---

# 인맥 활동 기록 (Connect Activity)

Uses `python3 connect-activity/scripts/activity.py` to record entries
on the **activity timeline** for a Connect (인맥) entry. The activity
timeline is distinct from the Context Memo:

| | Context Memo (`connect-memo`) | Activity Timeline (this skill) |
|---|---|---|
| What | Static personal facts | Dated event log |
| Storage | `connections.context_notes` | `connection_activities` rows |
| Example | "비건 식단, 자녀 2명" | "2026-04-13 · 점심 미팅 · COEX 45분" |

Writes go directly to the `connection_activities` table via `psycopg2`,
matching how `connect-memo`, `connect-ocr`, and `finance` skills persist
their data. The `sync` subcommand also reaches out to Google Calendar
+ Gmail using the **same OAuth token** as the `google-workspace` skill
(it imports `get_valid_access_token` and `google_request` from
`google-workspace/scripts/google_workspace.py`).

Always pass `--user-id {user_id}`.

## Prerequisites

- `DATABASE_URL` (auto-loaded from `~/.starnion/starnion.yaml` if missing).
- `psycopg2-binary` and `requests` — already in the starnion venv.
- For `sync`: the user must have Google Workspace already connected
  (the existing OAuth flow under integrations). The skill will fail
  cleanly with "Google account not connected" otherwise.
- BR-AUTH-1: every query is scoped to `user_id = :user_id`.

## Commands

### `find` — resolve a name to a connection

Same fuzzy lookup as `connect-memo`. Use this first when the user
gives you a name and not a UUID.

```bash
python3 connect-activity/scripts/activity.py \
  --user-id {user_id} find \
  --name "김철수"
```

Returns up to 10 candidates with `id`, `name`, `company`, `category`,
`last_contact_at`. Disambiguate before calling `add` / `list` /
`delete` with `--name`.

### `add` — record a manual activity

```bash
python3 connect-activity/scripts/activity.py \
  --user-id {user_id} add \
  --connection-id <uuid> \
  --label "미팅" \
  --note "분기 전략 검토" \
  --when "2026-04-13T12:00" \
  --duration 45
```

Or pass `--name "김철수"` instead of `--connection-id` when `find`
already confirmed there is exactly one match (use `--force` to pick
the most recently contacted match when multiple exist).

Defaults:
- `--label` — empty string (allowed; the timeline still shows the kind icon)
- `--note` — empty
- `--when` — now in UTC (accepts ISO 8601 with or without timezone)
- `--duration` — 0
- `--kind` — `manual` (other valid kinds: `email`, `calendar`, `telegram`)

Limits enforced client-side (mirroring the gateway):
- label ≤ 40 chars
- note ≤ 1000 chars
- duration_min: 0..1440
- occurred_at must not be more than 60 seconds in the future

The `manual` kind also bumps `connections.last_contact_at` (monotonic
— never rewinds).

### `list` — show recent timeline entries

```bash
python3 connect-activity/scripts/activity.py \
  --user-id {user_id} list \
  --connection-id <uuid> \
  --limit 10
```

Or `--name "김철수"`. Returns `id`, `kind`, `label`, `occurred_at`,
`duration_min`, `note`, `weight` for each row, ordered DESC by
`occurred_at`.

### `delete` — remove one activity row

```bash
python3 connect-activity/scripts/activity.py \
  --user-id {user_id} delete \
  --activity-id 42
```

Tenant-scoped — fails with exit 2 if the row belongs to another user.
Append-only enforcement means there is no `update` subcommand; ask the
user to delete and re-add if they want to fix a typo.

### `sync` — pull Gmail + Calendar into the timeline

```bash
python3 connect-activity/scripts/activity.py \
  --user-id {user_id} sync \
  --days 7
```

Default window: 7 days. The user can pass `--days 90` for a backfill.

What it does, in order:
1. Loads a valid Google access token (refreshes if needed) via the
   same helpers `google-workspace` uses.
2. Builds an `email → connection_id` map from the user's
   `connections` table.
3. Fetches `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=newer_than:Nd`
   then per-message metadata (`From`, `To`, `Cc`, `Date`, `Subject`).
4. Filters out `noreply@`, mailing-list traffic (>20 recipients), and
   messages with no matching connection.
5. Fetches `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=-Nd&timeMax=+7d&singleEvents=true`
   and matches attendees against the email index.
6. Batch INSERTs via `ON CONFLICT (connection_id, kind, occurred_at) DO NOTHING`
   so re-syncing is safe and idempotent.

Exits with a JSON summary `{status, ingested, gmail_candidates,
calendar_candidates, days}`.

## Output format

Every command prints a compact JSON object on stdout:

```json
{
  "status": "ok",
  "activity_id": 42,
  "connection_id": "f3c2e5a1-…",
  "name": "김철수",
  "kind": "manual",
  "label": "미팅",
  "occurred_at": "2026-04-13T12:00:00Z",
  "duration_min": 45
}
```

For `find`:

```json
{
  "status": "ok",
  "count": 1,
  "candidates": [
    {
      "id": "…",
      "name": "김철수",
      "company": "ACME Corp",
      "category": "business",
      "last_contact_at": "2026-04-03T09:12:00Z"
    }
  ]
}
```

For `list`:

```json
{
  "status": "ok",
  "connection_id": "…",
  "name": "김철수",
  "count": 3,
  "items": [
    { "id": 42, "kind": "manual", "label": "미팅", "occurred_at": "...", "duration_min": 45, "note": "..." },
    ...
  ]
}
```

For `sync`:

```json
{
  "status": "ok",
  "ingested": 23,
  "gmail_candidates": 18,
  "calendar_candidates": 7,
  "days": 7
}
```

Errors print to stderr:
- `exit 1` — config / DB / Google API failure
- `exit 2` — user input problem (label too long, ambiguous name, missing target)

## Examples

**1. Single-shot add when name is unique:**

```
User: "김철수랑 어제 점심 먹었어. COEX에서 45분 미팅"
Agent:
  $ python3 connect-activity/scripts/activity.py --user-id u find --name "김철수"
  → 1 candidate
  $ python3 connect-activity/scripts/activity.py --user-id u add \
      --connection-id <uuid> --label "식사" \
      --note "COEX에서 점심 미팅" \
      --when "2026-04-12T12:00" --duration 45
  → status=ok, activity_id=42
Reply: "김철수님과의 4월 12일 점심 기록을 추가했어요."
```

**2. Backfill 30 days from Google:**

```
User: "내 일정에서 최근 한 달 인맥 활동 가져와줘"
Agent:
  $ python3 connect-activity/scripts/activity.py --user-id u sync --days 30
  → ingested=23 gmail_candidates=18 calendar_candidates=7
Reply: "최근 30일 동안 23건의 활동을 가져왔어요. (Gmail 18건, Calendar 7건)"
```

**3. Mistake → delete:**

```
User: "방금 추가한 박영희 미팅 기록 잘못됐어. 지워줘."
Agent:
  $ python3 connect-activity/scripts/activity.py --user-id u list --name "박영희" --limit 1
  → activity_id=99
  $ python3 connect-activity/scripts/activity.py --user-id u delete --activity-id 99
Reply: "박영희님의 가장 최근 활동 기록을 삭제했어요."
```

## Notes

- **The Context Memo and Activity Timeline are different surfaces.** If
  the user says "메모 추가" use `connect-memo`. If they say "미팅 기록"
  or "만났어" use this skill.
- **Sync is opt-in.** The nightly cron (`connect_activity_ingest`) runs
  the same logic in Go, but only for users who have explicitly enabled
  it in `/cron`. The skill's `sync` is the manual / on-demand variant.
- **No update.** The timeline is append-only. To "edit" a row, delete
  it and re-add.
- `last_contact_at` is auto-bumped only by `kind=manual` adds — auto
  ingested rows already have an authoritative timestamp from Gmail or
  Calendar that the gateway respects via `GREATEST()`.
