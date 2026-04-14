---
name: connect-contacts-import
display_name: 구글 연락처 가져오기
description: "One-shot import of Google Contacts (People API) into the user's Connect (인맥) list. Pages through every contact, dedupes against existing connections by email then phone, and inserts new rows with category=acquaintance and tags=['google_contacts']. Honors BR-SOCIAL-3 — never writes social_profiles even if Google returns LinkedIn URLs. Use for: 구글 연락처 가져오기, 연락처 동기화, contacts import, import google contacts, sync google contacts, google 연락처, 인맥 가져오기, 주소록 가져오기"
version: 1.0.0
emoji: "📇"
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
    - 구글 연락처 가져오기
    - 구글 주소록
    - 연락처 동기화
    - 연락처 가져오기
    - 주소록 가져오기
    - 인맥 가져오기
    - import google contacts
    - sync google contacts
    - google contacts import
    - bring my contacts
  when_to_use:
    - User wants to bulk-import their existing Google address book into the Connect feature
    - User says things like "구글에 있는 연락처 인맥에 다 가져와줘" or "내 주소록 동기화해줘"
    - First-time setup of the Connect feature for a user who already has a populated Google account
  not_for:
    - Importing one specific person (use connect-ocr with a business card)
    - Pulling email/calendar activity (use connect-activity sync)
    - Editing or removing imported contacts (use the web UI)
    - Two-way sync — this skill is one-way (Google → Connect), never the reverse
---

# 구글 연락처 가져오기 (Connect Contacts Import)

Bulk-imports your Google Contacts (People API) into the Connect (인맥)
list as a **one-shot** operation. Not a recurring sync — run it once
when you first set up Connect, or again whenever you want to pull in
contacts you've added to Google since the last run.

| | This skill | `connect-activity sync` | `connect-ocr` |
|---|---|---|---|
| What | Address book → Connect rows | Gmail/Calendar → activity timeline | Business card image → 1 connection |
| Idempotent | ✅ (dedups by email/phone) | ✅ (ON CONFLICT) | ❌ (always creates) |
| Frequency | Once-ish | Daily-ish | On demand |

## Prerequisites

- Google Workspace must be connected. Visit `/skills` → Google Workspace
  → 연결, OR ask the agent "구글 연결해줘".
- The connection must include the **`contacts.readonly` scope**. If
  you connected before 2026-04 the scope is missing and the skill
  exits with a clear re-auth instruction (see "Re-consent flow"
  below).
- `psycopg2-binary` and `requests` — already in the StarNion venv.
- `DATABASE_URL` and `ENCRYPTION_KEY` are auto-loaded from
  `~/.starnion/starnion.yaml`.

## Commands

### `preview` — dry run, count only

```bash
python3 connect-contacts-import/scripts/import.py \
  --user-id {user_id} preview
```

Walks the People API, runs the dedup logic, but **does not insert
anything**. Returns a JSON summary so you can tell the user "I found
N contacts, M are new, N-M already exist" before they commit.

### `import` — actually import

```bash
python3 connect-contacts-import/scripts/import.py \
  --user-id {user_id} import [--limit 500]
```

Same walk, then INSERTs each new row into `connections`. `--limit` is
a safety cap on how many new rows to insert in one run (default 500).

Each new row is created with:
- `category = 'acquaintance'`
- `tags = ['google_contacts']` (so the user can filter for them later)
- `contact_frequency_target = 30` (default)
- `connection_score = 0.5` (default)
- `name`, `email`, `phone`, `company`, `role` populated from the
  primary fields of the People API response
- `social_profiles = '{}'` — **always empty**, regardless of what
  Google returns (BR-SOCIAL-3)

The user will likely want to re-categorize family/friend/business
manually after the import lands.

## Output format

`preview` and `import` both print a compact JSON summary on stdout:

```json
{
  "status": "ok",
  "fetched": 142,
  "duplicates": 1,
  "imported": 141,
  "skipped_no_name": 0,
  "limit_reached": false,
  "dry_run": false
}
```

When the scope is missing the skill exits with status code 2 and a
JSON error:

```json
{
  "status": "error",
  "reason": "scope_missing",
  "message": "Google contacts.readonly scope not granted. Disconnect and reconnect Google Workspace under /skills to authorize contacts access.",
  "current_scopes": "openid email profile https://www.googleapis.com/auth/calendar ..."
}
```

## Re-consent flow

If you connected Google before this skill was added (or if the user
declined the contacts.readonly permission), the skill detects it and
exits with `reason=scope_missing`. To fix it:

1. Web: `/skills` → "Google Workspace" → "연결 해제" → "연결" again
2. Google's consent screen will now ask for "연락처(읽기 전용)" in
   addition to the existing permissions
3. Approve → token is replaced with the new scope set
4. Re-run the skill

**The existing OAuth tokens for Calendar / Drive / Gmail keep
working** during the disconnect — only the local DB row is wiped.
Reconnecting a few seconds later restores everything plus contacts.

## Dedup rules

For each Google contact, the skill checks the user's existing
`connections` table:

1. If `email` matches an existing connection (case-insensitive,
   trimmed) → **skip**, log as duplicate
2. Else if `phone` matches (digits-only comparison after stripping
   `+`/`-`/spaces) → **skip**, log as duplicate
3. Else → **insert** as a new row

Contacts with no name at all are skipped (Google sometimes returns
"connections" rows for non-people resources). Contacts with no email
AND no phone are kept anyway, since they might still be useful in
the persona card.

## Examples

**1. First-time bulk import:**

```
User: "구글에 저장된 연락처 다 인맥에 가져와줘"
Agent:
  $ python3 connect-contacts-import/scripts/import.py --user-id u preview
  → fetched=142, duplicates=1, would_import=141
  "구글 주소록에서 142개를 발견했고, 이미 1개는 등록되어 있어요. 141개를 가져올까요?"
User: "응 가져와"
Agent:
  $ python3 connect-contacts-import/scripts/import.py --user-id u import
  → status=ok, imported=141
  "141개를 인맥에 가져왔습니다. 인맥 페이지에서 'google_contacts' 태그로 필터링할 수 있어요."
```

**2. Scope missing (existing user, hasn't re-authed):**

```
User: "내 구글 연락처 인맥에 가져와줘"
Agent:
  $ python3 connect-contacts-import/scripts/import.py --user-id u preview
  → exit 2, reason=scope_missing
Reply: "Google 연결에 '연락처' 권한이 빠져있어요. /skills 페이지에서 Google Workspace를 한 번 연결 해제했다 다시 연결해주세요. 그러면 동의 화면에 '연락처(읽기 전용)' 항목이 추가됩니다. 다시 연결한 다음 한 번 더 말씀해주세요."
```

## Notes

- **One-way only.** This skill never writes back to Google. Edits
  made in the Connect web UI stay local.
- **Bring-your-own re-categorization.** All imported rows land as
  `acquaintance`. The user is expected to walk through the new entries
  and bump family/business/friend manually. A future skill could
  auto-categorize via labels in Google Contacts; not in scope here.
- **No photos, no birthdays.** Google People API returns photoUrls
  and partial birthday objects; both are ignored for now to keep the
  ingest simple. Add via a follow-up skill if needed.
- **BR-AUTH-1**: every SQL is scoped by `WHERE user_id = %s`. There
  is no path that could touch another user's connections.
- **BR-SOCIAL-3**: `social_profiles` is hard-coded to `{}` even when
  Google returns LinkedIn / Twitter URLs. The user must add social
  links manually in the web UI.
