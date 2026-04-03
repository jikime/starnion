---
name: notion
display_name: Notion 연동
description: "Search, read, create, and update Notion pages and databases. Use for: 노션, notion, 페이지 찾아줘, 노션에 저장, 회의록, 데이터베이스, workspace pages, meeting notes"
version: 1.0.0
emoji: "📝"
category: productivity
enabled_by_default: false
requires_api_key: true
platforms: web, telegram, api
api_key_provider: notion
api_key_label: Notion Integration Token
uses_provider: false
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 노션
    - notion
    - 페이지
    - 데이터베이스
    - 워크스페이스
    - 회의록
    - 노션에서
    - 노션에 저장
    - page
    - database
    - workspace
    - meeting notes
  when_to_use:
    - User wants to search or read Notion pages
    - User asks to save notes or information to Notion
    - User wants to query or update a Notion database
    - User explicitly mentions "Notion" or "노션"
---

# Notion 연동

Always pass `--user-id {user_id}`.

## Prerequisites

- API key is automatically injected as `NOTION_API_KEY` environment variable when configured in the web UI. **Always attempt to run the script** — it will report if credentials are missing.
  - 인테그레이션 생성: https://www.notion.so/my-integrations
  - 생성 후 대상 페이지/데이터베이스에서 "연결(Connections)"에 인테그레이션 추가 필수
- Environment: `DATABASE_URL`

## Commands

### 페이지/데이터베이스 검색

```bash
python3 notion/scripts/notion.py \
  --user-id {user_id} search \
  --query "{검색어}" \
  --filter-type page|database
```

`--filter-type` 생략 시 전체 검색 (페이지 + 데이터베이스)

검색 결과에서:
- 📄 `[페이지]` → `ID` 사용
- 🗄️ `[데이터베이스]` → 페이지 생성 시 `ID`, 항목 조회 시 `data_source_id` 사용

### 페이지 읽기

```bash
python3 notion/scripts/notion.py \
  --user-id {user_id} read-page \
  --page-id "{page_id 또는 URL}"
```

### 페이지 생성

```bash
python3 notion/scripts/notion.py \
  --user-id {user_id} create-page \
  --title "{페이지 제목}" \
  --content "{본문 내용}" \
  --parent-page-id "{상위 페이지 ID}"
```

`--parent-page-id` 생략 시 워크스페이스 최상위에 생성

### 페이지에 블록 추가

```bash
python3 notion/scripts/notion.py \
  --user-id {user_id} append-blocks \
  --page-id "{page_id 또는 URL}" \
  --content "{추가할 텍스트}"
```

### 데이터베이스 항목 조회

```bash
python3 notion/scripts/notion.py \
  --user-id {user_id} query-database \
  --database-id "{data_source_id}" \
  --filter-json '{"property":"Status","select":{"equals":"Done"}}' \
  --sort-by "Date" \
  --sort-direction descending \
  --limit 10
```

### 페이지 속성 업데이트

```bash
python3 notion/scripts/notion.py \
  --user-id {user_id} update-page \
  --page-id "{page_id 또는 URL}" \
  --properties-json '{"Status":{"select":{"name":"Done"}}}'
```

## Properties JSON 형식 참고

```json
// Select
{"Status": {"select": {"name": "Done"}}}

// Date
{"Due": {"date": {"start": "2025-01-15"}}}

// Checkbox
{"Done": {"checkbox": true}}

// Number
{"Priority": {"number": 1}}
```

## Examples

**User:** "노션에서 프로젝트 관련 페이지 찾아줘"

```bash
python3 notion/scripts/notion.py \
  --user-id abc123 search \
  --query "프로젝트" \
  --filter-type page
```

**User:** "오늘 회의록을 노션에 저장해줘"

```bash
python3 notion/scripts/notion.py \
  --user-id abc123 create-page \
  --title "2025-01-28 회의록" \
  --content "{회의 내용}" \
  --parent-page-id "{상위 페이지 ID}"
```

**User:** "할 일 데이터베이스에서 완료된 항목 보여줘"

```bash
python3 notion/scripts/notion.py \
  --user-id abc123 query-database \
  --database-id "{data_source_id}" \
  --filter-json '{"property":"Status","select":{"equals":"완료"}}' \
  --limit 10
```

## Notes

- Notion API version `2025-09-03` 사용
- 페이지 ID는 URL에서 추출 가능 (32자리 hex 또는 UUID 형식 모두 지원)
- 인테그레이션에 공유되지 않은 페이지/DB 접근 시 404 에러
