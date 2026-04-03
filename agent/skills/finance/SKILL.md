---
name: python3 finance/scripts/finance.py
display_name: 가계부
description: "Record and query income/expense transactions with optional location. Use for: 가계부, 지출, 수입, 얼마 썼어, 이번 달 지출, 카드값, 식비, expense logging, spending history, 어디서 썼어, 영수증, receipt OCR, 주소, 이미지"
version: 1.1.0
emoji: "💵"
category: finance
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
requires:
  bins:
    - python3 finance/scripts/finance.py
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 가계부
    - 지출
    - 수입
    - 소비
    - 얼마 썼어
    - 이번 달 지출
    - 거래 내역
    - 월급
    - 식비
    - 교통비
    - 카드값
    - 어디서
    - 영수증
    - receipt
    - finance
    - expense
    - income
    - transaction
    - spending
    - salary
  when_to_use:
    - User records an expense or income transaction
    - User asks how much they have spent in a category or time period
    - User wants to view their transaction history
    - User says "커피 5000원 썼어" or "이번 달 식비 얼마야"
    - User mentions a place/location alongside spending ("스타벅스 강남점에서 6500원")
    - User sends a receipt image for OCR processing
    - User sends a photo of a storefront, menu, or location sign
    - User provides an address string in their message
  not_for:
    - Setting spending budgets (use budget skill)
    - Investment or stock tracking
---

# Finance Tracking

Use `python3 finance/scripts/finance.py` to record income/expenses and query monthly totals.

Always pass `--user-id {user_id}` (the current user's ID from the system prompt).

## Commands

### Save a transaction

> ⚠️ **REQUIRED: Always pass `--text` with the EXACT original user message** — this is how the script finds the location (store/place name). If you omit `--text`, no location will be saved even if the user mentioned one.

```bash
python3 finance/scripts/finance.py --user-id {user_id} save \
  --amount {amount} --category {category} --description "{description}" \
  --text "{exact user message}"
```

**Wrong** (location will be lost):
```bash
# ❌ missing --text
python3 finance/scripts/finance.py --user-id {id} save --amount -12000 --category 식비 --description "양재 나주곰탕"
```

**Correct**:
```bash
# ✅ --text always included
python3 finance/scripts/finance.py --user-id {id} save --amount -12000 --category 식비 --description "양재 나주곰탕" \
  --text "양재 나주곰탕 가게에서 나주곰탕 11000원 사용"
```

Optionally override location explicitly — choose the right flag based on what you have:

```bash
# --address: structured address string → uses Naver Geocoding API (도로명/지번주소)
python3 finance/scripts/finance.py --user-id {user_id} save \
  --amount {amount} --category {category} --description "{description}" \
  --address "서울 강남구 테헤란로 101"

# --location-name: store/place name → uses Naver Local Search
python3 finance/scripts/finance.py --user-id {user_id} save \
  --amount {amount} --category {category} --description "{description}" \
  --location-name "스타벅스 강남점"

# --lat + --lng: exact GPS coordinates (e.g. from image EXIF)
python3 finance/scripts/finance.py --user-id {user_id} save \
  --amount {amount} --category {category} --description "{description}" \
  --lat 37.5012 --lng 127.0396 --location-name "{optional display name}"
```

**Location flag selection guide:**

| Input type | Flag to use | Example |
|---|---|---|
| Structured address (도로명/지번) | `--address` | `--address "서울 마포구 와우산로 21"` |
| Store/place name | `--location-name` | `--location-name "올리브영 홍대점"` |
| GPS coords from image EXIF | `--lat` + `--lng` | `--lat 37.5012 --lng 127.0396` |
| Nothing explicit | (omit) | script auto-extracts from `--text` |

**Amount rules:**
- Expenses (food, transport, shopping, etc.) → **negative** number: `-12000`
- Income (salary, allowance, etc.) → **positive** number: `3000000`

**Categories:** Infer from context in any language:

| User intent | Category |
|-------------|----------|
| Food / dining / meals | `식비` |
| Transport / commute / fuel | `교통` |
| Shopping / retail | `쇼핑` |
| Entertainment / culture | `문화` |
| Medical / health | `의료` |
| Subscriptions / services | `구독` |
| Salary / income / allowance | `수입` |
| Other / miscellaneous | `기타` |

### View monthly total
```bash
# All categories
python3 finance/scripts/finance.py --user-id {user_id} monthly

# Specific category
python3 finance/scripts/finance.py --user-id {user_id} monthly --category 식비

# Specific month
python3 finance/scripts/finance.py --user-id {user_id} monthly --month 2025-01
```

### List recent records
```bash
python3 finance/scripts/finance.py --user-id {user_id} list --limit 10
```

---

## Image Input (Receipt / Photo / Screenshot)

When the user sends any image, follow this decision tree:

```
Image received
  │
  ├─ Is it a receipt / invoice / 영수증?
  │    → Receipt OCR workflow (see below)
  │
  ├─ Is it a photo of a place / storefront / menu / sign?
  │    → Place photo workflow (see below)
  │
  └─ Is it a screenshot of a map / navigation app?
       → Map screenshot workflow (see below)
```

---

### Receipt OCR workflow

Use Claude Vision to extract:
1. **Merchant name** (상호명 / store name)
2. **Address** (주소) — if printed on receipt → use `--address`
3. **Total amount** (합계 / total / 결제금액)
4. **Category** — infer from merchant type
5. **Date** — if different from today

```
1. Analyze the receipt image with Vision
2. Extract: merchant, address, total, date
3. Determine category from merchant type
4. If address found on receipt → --address "{road address}"
5. If no address but merchant name → --location-name "{merchant name}"
6. Run finance.py save
```

**Receipt examples:**

```
Receipt shows:
  상호: 맥도날드 강남점
  주소: 서울 강남구 테헤란로 101
  합계: 12,500원

→ python3 finance/scripts/finance.py --user-id {id} save \
    --amount -12500 --category 식비 \
    --description "맥도날드 강남점" \
    --address "서울 강남구 테헤란로 101"

---

Receipt shows:
  Store: Whole Foods Market
  123 Main St, San Francisco CA
  Total: $47.82

→ python3 finance/scripts/finance.py --user-id {id} save \
    --amount -47 --category 식비 \
    --description "Whole Foods Market" \
    --address "123 Main St San Francisco CA"

---

Receipt shows:
  약국: 올리브영 홍대점
  (no address on receipt)
  결제: 8,900원

→ python3 finance/scripts/finance.py --user-id {id} save \
    --amount -8900 --category 쇼핑 \
    --description "올리브영 홍대점" \
    --location-name "올리브영 홍대점"
```

---

### Place photo / storefront workflow

When the user sends a photo of a place (not a receipt):

```
1. Identify the store/place name from the image (signage, branding)
2. Check image EXIF metadata for GPS coordinates if available
3. If GPS found in EXIF → --lat {lat} --lng {lng} --location-name "{place name}"
4. If no GPS → --location-name "{place name}"
5. Ask the user for the amount if not mentioned
```

---

### Map screenshot workflow

When the user sends a screenshot of a map or navigation app:

```
1. Read the place name / address visible on the map
2. Use --address if an address is visible, or --location-name for a place name
3. Ask the user for the amount and category if not clear from context
```

---

**After running any save command**, always confirm to the user:
- What was recorded (amount, category, description)
- Whether location was geocoded successfully (script prints `📍 Geocoded ... → lat, lng`) or stored as name-only

---

## Examples

User: "점심으로 김치찌개 8000원 먹었어"
```bash
python3 finance/scripts/finance.py --user-id abc123 save \
  --amount -8000 --category 식비 --description "김치찌개 점심" \
  --text "점심으로 김치찌개 8000원 먹었어"
```

User: "스타벅스 강남점에서 아메리카노 6500원 썼어"
```bash
python3 finance/scripts/finance.py --user-id abc123 save \
  --amount -6500 --category 식비 --description "스타벅스 아메리카노" \
  --text "스타벅스 강남점에서 아메리카노 6500원 썼어"
# → auto-extracts "스타벅스 강남점" and geocodes it
```

User: "이번 달 식비 얼마야?"
```bash
python3 finance/scripts/finance.py --user-id abc123 monthly --category 식비
```

User: "월급 350만원 들어왔어"
```bash
python3 finance/scripts/finance.py --user-id abc123 save \
  --amount 3500000 --category 수입 --description "월급" \
  --text "월급 350만원 들어왔어"
```

User: "서울 강남구 테헤란로 152에서 점심 15000원 먹었어"
```bash
python3 finance/scripts/finance.py --user-id abc123 save \
  --amount -15000 --category 식비 --description "점심" \
  --address "서울 강남구 테헤란로 152" \
  --text "서울 강남구 테헤란로 152에서 점심 15000원 먹었어"
# → Geocoding API로 주소 좌표 변환
```

User: [sends receipt image — GS25 편의점, 서울 마포구 와우산로 21, 합계 3,200원]
```bash
python3 finance/scripts/finance.py --user-id abc123 save \
  --amount -3200 --category 식비 --description "GS25 편의점" \
  --address "서울 마포구 와우산로 21"
# → 영수증에 주소 있음 → --address 사용 (Geocoding API)
```

User: [sends receipt image — 올리브영 신촌점, 주소 없음, 결제 22,000원]
```bash
python3 finance/scripts/finance.py --user-id abc123 save \
  --amount -22000 --category 쇼핑 --description "올리브영 신촌점" \
  --location-name "올리브영 신촌점"
# → 영수증에 주소 없음 → --location-name 사용 (Local Search API)
```

User: [sends photo of storefront with GPS EXIF: lat=37.5172, lng=127.0473]
```bash
python3 finance/scripts/finance.py --user-id abc123 save \
  --amount -8000 --category 식비 --description "카페 방문" \
  --lat 37.5172 --lng 127.0473 --location-name "카페 이름"
# → EXIF GPS 좌표 직접 사용
```
