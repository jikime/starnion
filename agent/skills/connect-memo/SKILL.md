---
name: connect-memo
display_name: 인맥 메모
description: "Add or replace Context Memo (context_notes) for a Connect (인맥) entry. Looks up the target connection by exact or fuzzy name when the agent doesn't already know the connection UUID. Use for: 인맥 메모, 인맥 메모 추가, 메모 추가, 메모 수정, 인물 메모, 사람 메모, connect memo, add note, update note, context note"
version: 1.0.0
emoji: "📝"
category: productivity
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 인맥 메모
    - 메모 추가
    - 메모 수정
    - 메모 업데이트
    - 인물 메모
    - 사람 메모
    - connect memo
    - add note
    - update note
    - context note
  when_to_use:
    - User says "김철수 메모 추가해줘 — 비건 식단, 자녀 2명"
    - User wants to record a personal detail, preference, or fact about someone in their Connect list
    - User asks to update the Context Memo of an existing connection
  not_for:
    - Creating a new connection from scratch (use connect-ocr or the web UI)
    - Recording that they contacted someone "today" (use connect-touch once it exists, or the /touch API)
    - General note-taking unrelated to a specific person (use planner-reflection)
---

# 인맥 메모 (Connect Memo)

Uses `python3 connect-memo/scripts/memo.py` to update the `context_notes`
column on a row in the `connections` table. Writes go directly to the DB
via `psycopg2`, matching how `connect-ocr`, `finance`, and `budget` skills
persist their data.

Always pass `--user-id {user_id}`.

## Prerequisites

- Environment: `DATABASE_URL` (the skill loads it from `~/.starnion/starnion.yaml` if the env var is missing).
- `psycopg2-binary` — already in the starnion venv.
- No external API keys needed.
- BR-CONTEXT-1 is enforced client-side: notes longer than **4096 characters** are rejected with exit code 2 and a clear error.
- BR-AUTH-1: every query is scoped to `user_id = :user_id` so one user can never touch another user's connections.

---

## Commands

### `find` — resolve a name to a connection

Use this first when the user says "김철수" and you don't yet have a UUID.

```bash
python3 connect-memo/scripts/memo.py \
  --user-id {user_id} find \
  --name "김철수"
```

Output: a JSON array of up to 10 candidates, sorted by most recent contact first. Each candidate has `id`, `name`, `company`, `category`, `last_contact_at`, and a preview of the current `context_notes`.

- **Exactly 1 result** → use that `id` for the next command.
- **0 results** → tell the user "해당 이름의 인연을 찾지 못했습니다" and offer to create a new connection (or widen the query).
- **≥2 results** → show the list to the user and ask them which one they mean, using `company` / `last_contact_at` to disambiguate.

### `add` — append to existing memo (default semantics)

```bash
python3 connect-memo/scripts/memo.py \
  --user-id {user_id} add \
  --connection-id <uuid> \
  --notes "비건 식단, 자녀 2명 (초등학생 딸, 유치원 아들). Next.js 관심."
```

Merge rule: if the connection already has notes, the new text is appended with a blank line between the old and new block. If the combined length would exceed the 4096-char cap, the whole operation is rejected — the agent should tell the user to shorten the message or use `replace`.

You can also pass `--name "김철수"` instead of `--connection-id` when `find` already confirmed there is exactly one match.

### `replace` — overwrite existing memo

```bash
python3 connect-memo/scripts/memo.py \
  --user-id {user_id} replace \
  --connection-id <uuid> \
  --notes "새로 정리한 전체 메모. 이전 내용은 모두 덮어씁니다."
```

Use this when the user explicitly wants to clean up or rewrite the memo from scratch ("메모 다시 정리해줘", "기존 메모 지우고").

### `clear` — erase memo

```bash
python3 connect-memo/scripts/memo.py \
  --user-id {user_id} clear \
  --connection-id <uuid>
```

Sets `context_notes` to the empty string. Confirm with the user first.

## Output format

On success every command prints a compact JSON object on stdout:

```json
{
  "status": "ok",
  "connection_id": "f3c2e5a1-…",
  "name": "김철수",
  "notes": "… the resulting context_notes after the update …",
  "length": 124
}
```

For `find`:

```json
{
  "status": "ok",
  "candidates": [
    {
      "id": "…",
      "name": "김철수",
      "company": "ACME Corp",
      "category": "business",
      "last_contact_at": "2026-04-03T09:12:00Z",
      "notes_preview": "지난번 커피챗에서 사이클링 얘기…"
    }
  ]
}
```

On error, prints an error message to stderr and exits:

- `exit 1` — configuration / DB / driver problem (DATABASE_URL missing, psycopg2 not installed, SQL error)
- `exit 2` — user input problem (notes exceed 4096 chars, neither --connection-id nor --name given, no match for name, ambiguous match but `--force` not set)

## Examples

**1. Single-shot add when name is unique:**

```
User: "김철수 메모 추가해줘 — 비건 식단"
Agent:
  $ python3 connect-memo/scripts/memo.py --user-id u memo \
      --name "김철수" add --notes "비건 식단"
  → status=ok, updated, notes="...existing...\n\n비건 식단"
Reply: "김철수님의 메모에 '비건 식단'을 추가했습니다."
```

**2. Disambiguation flow when name returns 2 matches:**

```
User: "Kim 메모에 '첫 미팅 COEX' 추가"
Agent:
  $ python3 connect-memo/scripts/memo.py --user-id u find --name "Kim"
  → 2 candidates: 김철수 (ACME), Kim Youngho (Naver)
Reply: "Kim이라는 이름으로 두 분이 있어요. 1) ACME의 김철수, 2) Naver의 Kim Youngho. 누구를 말씀하시나요?"
User: "1번"
Agent:
  $ python3 connect-memo/scripts/memo.py --user-id u add \
      --connection-id <uuid1> --notes "첫 미팅 COEX"
```

**3. Replace rather than append:**

```
User: "박영희 메모 싹 정리해서 다시 써줘. '배경: VC, 2024년 IR 때 만남. 관심: FinTech, AI.'로."
Agent:
  $ python3 connect-memo/scripts/memo.py --user-id u replace \
      --name "박영희" --notes "배경: VC, 2024년 IR 때 만남. 관심: FinTech, AI."
```

## Notes

- **BR-SOCIAL-3 does not apply** to this skill — it touches `context_notes`, not `social_profiles`. Social links remain edit-only through the web UI.
- The skill **never touches** other columns. `last_contact_at`, `connection_score`, and `category` are preserved.
- `updated_at` is bumped automatically by the existing DB trigger; this skill does not set it explicitly.
- If the user's intent is a *brand-new* connection with a memo already attached, the agent should prefer `connect-ocr` (with a business card) or the web UI's "새 인연 추가" dialog, then optionally call this skill to record the memo.
