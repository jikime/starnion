---
name: naver-search
display_name: 네이버 검색
description: Search Korean web content via Naver Open API — news, shopping, blogs, books, local places, Q&A, encyclopedia, and more. Use when the user explicitly requests Naver or needs Korea-specific information (local restaurants, Korean news, Korean shopping prices, etc.).
version: 1.1.0
emoji: "🟢"
category: search
enabled_by_default: false
requires_api_key: true
platforms: web, telegram, api
api_key_provider: naver_search
api_key_type: dual
api_key_label: Naver API Key
api_key_label_1: Client ID
api_key_label_2: Client Secret
uses_provider: false
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 네이버
    - naver
    - 네이버에서
    - 국내 뉴스
    - 맛집
    - 블로그
    - 지식인
    - 한국 뉴스
    - 쇼핑 가격
    - 동네
    - 근처
    - 한국어 검색
    - Korean search
    - local restaurant
    - Korean news
  when_to_use:
    - User explicitly asks to search on Naver
    - User needs Korea-specific local information (맛집, 근처 가게 등)
    - User asks for Korean news, blogs, or shopping prices
    - User needs Korean-language Q&A or encyclopedia results
  not_for:
    - General international web searches (use websearch skill)
    - Real-time stock or finance data
---

# 네이버 검색 스킬 (Naver Search)

네이버 Open API를 통해 10가지 유형의 콘텐츠를 검색합니다.

Always pass `--user-id {user_id}`.

## Prerequisites

- API keys are automatically injected as environment variables (`NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET`) when the user has configured them in the web UI.
- **Always attempt to run the script** — the script itself will report if credentials are missing.
- Environment: `DATABASE_URL`, `NAVER_SEARCH_CLIENT_ID`, `NAVER_SEARCH_CLIENT_SECRET`

## Command Syntax

**IMPORTANT**: The subcommand is always `search`. Search types are passed via `--search-type`, NOT as a subcommand.

```bash
# Correct ✅
python3 naver-search/scripts/naver-search.py \
  --user-id {user_id} search \
  --query "{검색 키워드}" \
  --search-type {search_type} \
  --display 5

# Wrong ❌ — do NOT use search type as subcommand
python3 naver-search/scripts/naver-search.py \
  --user-id {user_id} book --query "..."
```

## 검색 유형 (`--search-type` 값)

| `--search-type` | 설명 | 언제 사용 |
|-----------------|------|----------|
| `webkr` | 웹문서 (기본값) | 일반 한국 웹 정보 검색 |
| `news` | 뉴스 기사 | 최신 뉴스·이슈 |
| `blog` | 블로그 포스트 | 후기·경험담 |
| `shop` | 쇼핑 (최저가/최고가) | 상품 가격 비교·구매 |
| `book` | 도서 정보 | 책·출판물 정보 |
| `encyc` | 백과사전 | 사전적 개념 정의 |
| `cafearticle` | 카페글 | 커뮤니티 반응·의견 |
| `kin` | 지식iN | 질문-답변 형식 |
| `local` | 지역 (주소, 전화번호) | 주변 가게·장소 찾기 |
| `doc` | 전문자료 | 학술 논문·자료 |

## Options

- `--display N`: 결과 개수 (기본: 5, 최대: 100)
- `--sort sim|date|asc|dsc`: Sort order
  - `sim`: relevance (default)
  - `date`: newest first — use when user wants recent/latest results
  - `asc`: price ascending (shop only) — use when user wants cheapest/lowest price
  - `dsc`: price descending (shop only) — use when user wants most expensive/premium

## When to Use

Use this skill when:
- The user explicitly mentions Naver
- The user needs Korea-specific local information (restaurants, places, addresses)
- The user wants Korean news, blogs, or shopping price comparisons
- General websearch would not return Korea-specific results

## Examples

**User:** "v0 책 검색해줘"

```bash
python3 naver-search/scripts/naver-search.py \
  --user-id abc123 search \
  --query "v0" \
  --search-type book \
  --display 10
```

**User:** "최신 AI 뉴스 알려줘"

```bash
python3 naver-search/scripts/naver-search.py \
  --user-id abc123 search \
  --query "AI 인공지능" \
  --search-type news \
  --sort date \
  --display 5
```

**User:** "아이폰 최저가 쇼핑 검색해줘"

```bash
python3 naver-search/scripts/naver-search.py \
  --user-id abc123 search \
  --query "아이폰 16" \
  --search-type shop \
  --sort asc \
  --display 10
```

**User:** "강남 맛집 알려줘"

```bash
python3 naver-search/scripts/naver-search.py \
  --user-id abc123 search \
  --query "강남 맛집" \
  --search-type local \
  --display 5
```

**User:** "파이썬 입문 블로그 후기"

```bash
python3 naver-search/scripts/naver-search.py \
  --user-id abc123 search \
  --query "파이썬 입문" \
  --search-type blog \
  --sort date \
  --display 5
```
