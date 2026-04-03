---
name: websearch
display_name: 웹 검색
description: "Search the internet for up-to-date information and fetch web page content. Use for: 검색해줘, 찾아줘, 최신 정보, 인터넷 검색, 뉴스, 요즘, web search, latest news, current information"
version: 1.0.0
emoji: "🔍"
category: search
enabled_by_default: true
requires_api_key: true
platforms: web, telegram, api
api_key_provider: tavily
api_key_label: Tavily API Key
uses_provider: false
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 검색해줘
    - 찾아줘
    - 최신 정보
    - 인터넷에서
    - 웹에서
    - 뉴스
    - 요즘
    - 지금
    - 알려줘
    - search
    - look up
    - find online
    - latest
    - current news
    - web search
    - internet
  when_to_use:
    - User asks for up-to-date information that may have changed recently
    - User asks to search the internet for news or current events
    - User asks to fetch or read the content of a specific web page URL
    - User says "검색해줘", "찾아줘", or "최신 정보 알려줘"
  not_for:
    - Searching within knowledge base documents (use documents skill)
    - Korea-specific searches where Naver would be better (use naver-search skill)
---

# 웹 검색 (websearch)

Always pass `--user-id {user_id}`.

## API Key

`TAVILY_API_KEY` is automatically injected as an environment variable when configured in the web UI.
**Always attempt to run the script** — it will report if credentials are missing.

## Commands

### 웹 검색

```bash
python3 websearch/scripts/websearch.py \
  --user-id {user_id} search \
  --query "{검색 키워드나 질문}" \
  --max-results 5
```

### 고급 검색 (Tavily 전용)

```bash
python3 websearch/scripts/websearch.py \
  --user-id {user_id} search \
  --query "{검색 쿼리}" \
  --search-depth advanced \
  --topic news \
  --time-range week \
  --include-answer \
  --max-results 5
```

### URL 컨텐츠 추출

```bash
python3 websearch/scripts/websearch.py \
  --user-id {user_id} fetch \
  --url "{https://...}" \
  --max-length 8000
```

## Options

### search 공통
- `--max-results N`: 결과 개수 (기본: 5, 최대: 10)

### search Tavily 전용 (키 설정 시에만 유효)
- `--search-depth basic|advanced`: 검색 깊이 (기본: basic)
  - `basic`: 빠른 일반 검색
  - `advanced`: 심층 연구 수준, 가장 관련성 높은 결과
- `--topic general|news|finance`: 검색 주제 (기본: general)
  - `news`: 최신 뉴스·실시간 업데이트
  - `finance`: 주식·금융 정보
- `--time-range day|week|month|year`: 기간 필터
- `--include-answer`: AI 생성 요약 답변 포함
- `--include-domains domain1,domain2`: 특정 도메인으로 제한
- `--exclude-domains domain1,domain2`: 특정 도메인 제외

### fetch
- `--max-length N`: 최대 텍스트 길이 (기본: 8000, 최대: 50000)

## Output

**search**: 결과 목록 (제목, URL, 요약 포함)
**fetch**: 웹페이지 텍스트 내용 (HTML → 가독성 있는 텍스트 변환)

## When to use

| User intent | Command | Options |
|-------------|---------|---------|
| Latest news or current events | search | `--topic news --time-range day` |
| Fact-checking or general information | search | (default) |
| Deep research with comprehensive results | search | `--search-depth advanced --include-answer` |
| Summarize or extract content from a specific URL | fetch | — |
| Get full content of a search result | fetch | use URL from search result |

## Examples

**User:** "오늘 뉴스 알려줘"

```bash
python3 websearch/scripts/websearch.py \
  --user-id abc123 search \
  --query "오늘 주요 뉴스" \
  --topic news \
  --time-range day \
  --max-results 5
```

**User:** "비트코인 현재 가격"

```bash
python3 websearch/scripts/websearch.py \
  --user-id abc123 search \
  --query "bitcoin price today" \
  --topic finance \
  --max-results 3
```

**User:** "이 기사 내용 요약해줘: https://..."

```bash
python3 websearch/scripts/websearch.py \
  --user-id abc123 fetch \
  --url "https://..." \
  --max-length 8000
```

## Notes

- Tavily 키 없을 경우 기본 DuckDuckGo 검색으로 fallback (검색 품질 제한)
- `--search-depth advanced`와 고급 옵션은 Tavily 키 설정 시에만 유효
- PDF·이미지·바이너리 URL은 fetch 미지원
