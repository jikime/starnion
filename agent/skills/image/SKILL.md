---
name: image
display_name: 이미지 분석 및 생성
description: "Analyze uploaded images using Gemini Vision, or generate/edit images with Gemini AI. Use for: 이미지 분석, 사진 분석, 이미지 생성, 그려줘, 그림 만들어줘, image generation, photo analysis"
version: 3.0.0
emoji: "🖼️"
category: creative
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
    - 이미지
    - 사진
    - 그림
    - 이미지 생성
    - 그려줘
    - 만들어줘
    - 분석해줘
    - 이미지 분석
    - 사진 분석
    - 뭐가 보여
    - image
    - photo
    - picture
    - generate image
    - analyze image
    - draw
    - create image
    - vision
  when_to_use:
    - User uploads a photo or image and asks to analyze it
    - User asks to generate or create an image based on a description
    - User asks "이 사진에서 뭐가 보여?" or "그림 그려줘"
    - User wants to edit or modify an existing image
---

# 이미지 분석 및 생성

Uses `python3 image/scripts/analyze.py` for **image analysis** and `python3 image/scripts/image.py` for **image generation**.

Always pass `--user-id {user_id}`.

## Prerequisites

- Gemini API key is automatically injected as `GEMINI_API_KEY` environment variable when configured. **Always attempt to run the script** — it will report if credentials are missing.
- Environment: `DATABASE_URL`, `GATEWAY_URL`
- MinIO env (for generation): `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`

---

## 1. Analyze Image (이미지 분석)

**When to use:** The message contains `[image:URL]` — meaning the user uploaded one or more images.

For each `[image:URL]` found in the message, call the analyze script **once per image**.

```bash
python3 image/scripts/analyze.py \
  --user-id {user_id} analyze \
  --file-url "{image_url}" \
  --query "{user's question about the image}"
```

The script prints the Gemini Vision analysis result to stdout. Use that result to answer the user.

### Image type auto-detection

After receiving the analysis text, determine the image type and respond accordingly:

| Type | Indicators | Action |
|------|-----------|--------|
| Receipt (영수증) | 금액, 날짜, 상호명 | Extract expense → offer to save to 가계부 |
| General photo | 풍경, 사람, 물체 | Describe the content |
| Text/Document | 글자, 표, 문서 | OCR and summarize |
| Screenshot | UI, 앱 화면 | Describe the screen content |

### Receipt auto-pipeline

If the image is a receipt:
1. **User intent clear** (e.g., "기록해줘", "저장해줘", or receipt-only message) → call `save_finance` immediately
2. **Intent unclear** (e.g., "뭐야?", "분석해줘") → show analysis, then ask "가계부에 기록할까요?"

### Multiple images

If the message contains multiple `[image:URL]` markers, analyze **each one** separately and combine the results.

### Examples

**User:** "이 사진 뭔지 분석해줘 [image:http://localhost:9000/starnion-files/users/abc/2026/img.webp]"

```bash
python3 image/scripts/analyze.py \
  --user-id abc \
  analyze \
  --file-url "http://localhost:9000/starnion-files/users/abc/2026/img.webp" \
  --query "이 이미지를 자세히 분석해주세요."
```

**User:** "이 영수증 기록해줘 [image:/api/files/users/abc/2026/receipt.webp]"

```bash
python3 image/scripts/analyze.py \
  --user-id abc \
  analyze \
  --file-url "/api/files/users/abc/2026/receipt.webp" \
  --query "영수증의 가게명, 날짜, 총 금액, 항목을 추출해주세요."
```

---

## 2. Generate Image (이미지 생성)

**When to use:** User explicitly requests image creation ("그려줘", "만들어줘", "생성해줘").

```bash
python3 image/scripts/image.py \
  --user-id {user_id} generate \
  --prompt "{description in English}" \
  --aspect-ratio 1:1
```

**Aspect ratios:** `1:1` (square), `16:9` (landscape), `9:16` (portrait), `4:3`, `3:4`

The script prints the image URL and a Markdown embed. Always include it in the response:

```markdown
![생성된 이미지]({url})
```

### Examples

**User:** "고양이가 우주복을 입은 그림 그려줘"

```bash
python3 image/scripts/image.py \
  --user-id abc123 generate \
  --prompt "A cute cat wearing a spacesuit floating in space, digital art style" \
  --aspect-ratio 1:1
```

---

## Notes

- Prompts for generation work best in English; translate Korean before passing as `--prompt`
- Analysis uses `gemini-3.1-flash-image-preview` (same as generation)
- Generation uses `gemini-3.1-flash-image-preview`
- If Gemini API key is missing, both commands print an error — inform the user to configure it
