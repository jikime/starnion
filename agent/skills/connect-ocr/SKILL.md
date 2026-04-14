---
name: connect-ocr
display_name: 명함 스캔 (인맥)
description: "Scan a business card image with Gemini Vision and extract structured contact fields (name, role, company, email, phone, address, etc.) to create a new Connect (인맥) entry. Use for: 명함, 명함 스캔, 명함 등록, 명함 인식, 명함 저장, 명함 추가, 인맥, 인맥 추가, 인맥 등록, 연락처 등록, 연락처 추가, 비즈니스 카드, business card, business card ocr, scan business card, contact card, register contact"
version: 1.0.0
emoji: "📇"
category: productivity
enabled_by_default: false
requires_api_key: true
platforms: web, telegram, api
api_key_provider: gemini
api_key_label: Gemini API Key
uses_provider: false
allowed-tools:
  - Bash
  - exec
triggers:
  # NOTE: the active keyword list that the agent's dynamic-scoping filter
  # actually reads is parsed from the `description` field's "Use for: ..."
  # suffix above. This `triggers.keywords` block is kept in sync only as
  # documentation — changing it alone has no runtime effect.
  keywords:
    - 명함
    - 명함 스캔
    - 명함 등록
    - 명함 인식
    - 명함 저장
    - 명함 추가
    - 인맥
    - 인맥 추가
    - 인맥 등록
    - 연락처 등록
    - 연락처 추가
    - 비즈니스 카드
    - business card
    - business card ocr
    - scan business card
    - contact card
    - register contact
  when_to_use:
    - User uploads a photo of a business card and asks to register it
    - User says "이 명함 등록해줘" or "인맥에 추가해줘" with an `[image:URL]`
    - Message clearly shows a business card (logo + name + title + phone + email + company)
  not_for:
    - General image analysis (use image skill)
    - Receipt OCR (use finance skill)
    - Editing existing connection fields (use the /connections API directly)
---

# 명함 스캔 (Business Card OCR)

Uses `python3 connect-ocr/scripts/scan.py` to OCR a business card image with Gemini Vision and **insert the extracted fields directly into the `connections` table**, creating a new Connect (인맥) entry in one shot. Writes to the DB are made with the same `DATABASE_URL` credentials the finance/budget skills use — the agent does NOT need to call the gateway HTTP layer afterwards.

Always pass `--user-id {user_id}`.

## Prerequisites

- Gemini API key is injected as `GEMINI_API_KEY` when configured. If missing, the script prints an error — tell the user to configure it in Web UI → Integrations → Gemini.
- Environment: `DATABASE_URL`, `GATEWAY_URL`, `JWT_SECRET` (for signing `/api/files/…` fetches).
- `psycopg2-binary` must be installed in the starnion venv (it already is — same package other skills use).
- BR-SOCIAL-3 — **the skill MUST NOT populate `social_profiles`**. The INSERT always passes `'{}'::jsonb` for that column, and Gemini is prompted to never emit social handles.

---

## When to use

The message contains `[image:URL]` AND the user's intent is to register the card into their Connect (인맥) list:

- "이 명함 등록해줘"
- "연락처에 추가해줘"
- "인맥에 저장해줘"
- "scan this business card"

If the user just wants to *read* the card without saving it, use the `image` skill instead.

## How it works

1. Fetch the image from `--file-url` (MinIO URL or `/api/files/...` relative). User-scoped `/api/files/users/<id>/...` URLs are signed automatically with `JWT_SECRET` so the gateway allows the read.
2. Send it to Gemini Vision with a structured-extraction prompt.
3. Parse Gemini's JSON response into the `business_card` schema.
4. **INSERT a new row into `connections`** (columns: `user_id`, `name`, `role`, `company`, `email`, `phone`, `meeting_location`, `tags`, `business_card`, `social_profiles`). Table defaults fill in `category`, `contact_frequency_target`, `connection_score`, `created_at`, `updated_at`.
5. Print a result JSON containing the new `connection_id` plus the populated fields so the agent can confirm the registration to the user.

The agent **must not** re-OCR the raw text, inject SNS links, or call the gateway afterwards — the skill is the single source of truth for business-card registration.

## Command

```bash
python3 connect-ocr/scripts/scan.py \
  --user-id {user_id} scan \
  --file-url "{image_url}" \
  [--meeting-location "{where you met}"]
```

The script prints a JSON object on stdout after a successful insert, e.g.:

```json
{
  "business_card_image_url": "/api/files/users/abc/2026/card.webp",
  "company": "ACME Corp",
  "connection_id": "f3c2e5a1-…",
  "email": "cs.kim@acme.com",
  "meeting_location": null,
  "name": "김철수",
  "phone": "+82-10-1234-5678",
  "role": "Product Manager",
  "status": "created"
}
```

Use `connection_id` + `name` in your reply to the user.

## Example

**User:** "이 명함 인맥에 등록해줘 [image:/api/files/users/abc/2026/card.webp]"

```bash
python3 connect-ocr/scripts/scan.py \
  --user-id abc \
  scan \
  --file-url "/api/files/users/abc/2026/card.webp"
```

Reply: "김철수 님을 인맥에 등록했습니다 (회사: ACME Corp). 인맥 페이지에서 SNS 계정도 추가해보세요."

## Error cases

- **No Gemini API key** → script exits 1 with a configuration error. Ask the user to register the key.
- **Image fetch 404 / 401** → script exits 1. For 401 on `/api/files/users/…`, the skill should have signed the URL automatically using `JWT_SECRET`; if it still fails, check that `JWT_SECRET` is exported or present in `~/.starnion/starnion.yaml`.
- **Gemini returned non-JSON or missing name** → the script prints an error and exits 1. Fall back to the plain `image` skill so the user can see the raw analysis.
- **DB insert failed** → script exits 1 and prints the driver error. Most common cause: `DATABASE_URL` missing or `psycopg2` not installed in the starnion venv.

## Notes

- Uses the same `gemini-3.1-flash-image-preview` model as the `image` skill.
- **Never** populates `social_profiles` — the INSERT passes `'{}'::jsonb` unconditionally (BR-SOCIAL-3). If the card has SNS handles visible, the user must add them manually via the Web UI after the scan.
- The `business_card.image_url` field is the exact URL you passed to `--file-url` (so the persona card can render the scanned thumbnail later).
- DB writes bypass the gateway's HTTP layer. This matches how finance/budget skills work and removes the need for service-token auth between agent and gateway.
