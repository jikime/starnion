---
name: connect-ocr
display_name: 명함 스캔 (인맥)
description: "Scan a business card image with Gemini Vision and extract structured contact fields (name, role, company, email, phone, address, etc.) to create a new Connect (인맥) entry. Use for: 명함 스캔, 명함 인식, business card OCR, scan business card, 연락처 등록"
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
  keywords:
    - 명함
    - 명함 스캔
    - 명함 인식
    - 연락처 등록
    - 인맥 추가
    - business card
    - scan card
    - contact card
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

Uses `python3 connect-ocr/scripts/scan.py` to OCR a business card image with Gemini Vision and emit a **structured JSON payload** that the agent forwards to `POST /api/v1/connections/scan-business-card` to create a new Connect (인맥) entry.

Always pass `--user-id {user_id}`.

## Prerequisites

- Gemini API key is injected as `GEMINI_API_KEY` when configured. If missing, the script prints an error — tell the user to configure it in Web UI → Integrations → Gemini.
- Environment: `DATABASE_URL`, `GATEWAY_URL`
- BR-SOCIAL-3 — **the skill MUST NOT populate `social_profiles`**. The gateway's scan-business-card endpoint will refuse any social fields anyway; this skill never emits them.

---

## When to use

The message contains `[image:URL]` AND the user's intent is to register the card into their Connect (인맥) list:

- "이 명함 등록해줘"
- "연락처에 추가해줘"
- "인맥에 저장해줘"
- "scan this business card"

If the user just wants to *read* the card without saving it, use the `image` skill instead.

## How it works

1. Fetch the image from `--file-url` (MinIO URL or `/api/files/...` relative).
2. Send it to Gemini Vision with a structured-extraction prompt.
3. Parse Gemini's JSON response into the `business_card` schema.
4. Print the full POST body to stdout — the agent is responsible for actually calling `POST /api/v1/connections/scan-business-card` with it.

The agent **must not** re-OCR the raw text or inject SNS links — the skill is the single source of truth for business-card extraction.

## Command

```bash
python3 connect-ocr/scripts/scan.py \
  --user-id {user_id} scan \
  --file-url "{image_url}" \
  [--meeting-location "{where you met}"]
```

The script prints a JSON object on stdout, e.g.:

```json
{
  "name": "김철수",
  "role": "Product Manager",
  "company": "ACME Corp",
  "email": "cs.kim@acme.com",
  "phone": "+82-10-1234-5678",
  "meeting_location": null,
  "tags": [],
  "business_card": {
    "image_url": "http://localhost:9000/starnion-files/users/abc/2026/card.webp",
    "company_name_en": "ACME Corp",
    "dept": "Product",
    "address": "Seoul, Gangnam-gu",
    "website": "https://acme.com",
    "fax": "",
    "scanned_at": "2026-04-13T12:00:00Z",
    "ocr_raw_text": "…"
  }
}
```

Once you have this JSON, immediately POST it to the gateway and return the created connection id to the user.

## Example

**User:** "이 명함 인맥에 등록해줘 [image:/api/files/users/abc/2026/card.webp]"

```bash
python3 connect-ocr/scripts/scan.py \
  --user-id abc \
  scan \
  --file-url "/api/files/users/abc/2026/card.webp"
```

Then POST the stdout JSON to `POST /api/v1/connections/scan-business-card` and reply "김철수 님을 인맥에 등록했습니다 (회사: ACME Corp)".

## Error cases

- **No Gemini API key** → script exits 1 with a configuration error. Ask the user to register the key.
- **Image fetch 404 / network error** → script exits 1. Ask the user to re-upload.
- **Gemini returned non-JSON or missing name** → the script prints an error and exits 1. Fall back to the plain `image` skill so the user can see the raw analysis.

## Notes

- Uses the same `gemini-3.1-flash-image-preview` model as the `image` skill.
- **Never** populates `social_profiles`. If the card has SNS handles visible, the user must add them manually via the Web UI (BR-SOCIAL-3).
- The `business_card.image_url` field is the exact URL you passed to `--file-url` (so the gateway can serve the card thumbnail later).
