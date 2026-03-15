---
name: 노션 연동
description: 노션 페이지/데이터베이스 검색, 생성, 읽기, 블록 추가, DB 쿼리, 속성 업데이트
keywords: ["노션", "notion", "페이지", "page", "데이터베이스", "database", "블록", "block", "메모", "노트"]
---

# 노션 연동 (notion)

Notion API `2025-09-03` 기준.

## 도구 목록

| 도구 | 설명 |
|------|------|
| `notion_search` | 페이지·데이터베이스 검색 |
| `notion_page_create` | 새 페이지 생성 |
| `notion_page_read` | 페이지 내용 읽기 |
| `notion_block_append` | 페이지에 텍스트 블록 추가 |
| `notion_database_query` | 데이터베이스 항목 필터/정렬 조회 |
| `notion_page_update` | 페이지 속성(Status, Date 등) 업데이트 |

## 사용 전 필수: 노션 연동

설정 → 연동 메뉴에서 **Notion Integration Token** 등록 후 대상 페이지/DB에 Integration 공유 필요.

## 도구별 사용 지침

### `notion_search`
- `query`: 검색어
- `filter_type`: `'page'` | `'database'` | `''`(전체)
- 데이터베이스 검색 시 **ID**와 **data_source_id** 두 가지를 함께 반환
  - 페이지 생성: `database_id` 사용
  - 항목 쿼리: `data_source_id` 사용

### `notion_database_query`
- `data_source_id`: `notion_search`로 확인한 data_source_id
- `filter_json`: Notion 필터 JSON 문자열 (선택)
- `sort_by` + `sort_direction`: 정렬 기준 속성명 + ascending/descending
- `limit`: 1~50 (기본 10)

### `notion_page_update`
- `page_id`: 업데이트할 페이지 ID 또는 URL
- `properties_json`: Notion API 속성 형식의 JSON 문자열

### 속성 JSON 형식 참고

```json
// Select
{"Status": {"select": {"name": "Done"}}}

// Date
{"Due": {"date": {"start": "2025-01-15"}}}

// Checkbox
{"완료": {"checkbox": true}}

// 숫자
{"Priority": {"number": 1}}
```

## 사용 시나리오

```
"내 노션에서 프로젝트 페이지 찾아줘"
→ notion_search(query="프로젝트")

"Task DB에서 완료된 항목만 보여줘"
→ notion_search(query="Task")로 data_source_id 확인
→ notion_database_query(data_source_id="...", filter_json='{"property":"Status","select":{"equals":"Done"}}')

"이 할일 상태를 완료로 바꿔줘"
→ notion_page_update(page_id="...", properties_json='{"Status":{"select":{"name":"완료"}}}')

"독서 기록 노트에 내용 추가해줘"
→ notion_search(query="독서 기록")으로 ID 확인
→ notion_block_append(page_id="...", content="추가할 내용")
```
