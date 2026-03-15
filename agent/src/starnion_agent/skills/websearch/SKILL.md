---
name: websearch
description: 인터넷에서 최신 정보를 검색하고 웹페이지 내용을 가져옵니다.
keywords: ["검색", "찾아봐", "검색해줘", "search", "look up", "検索", "搜索", "查一查"]
---

# 웹 검색 (websearch)

## 도구 목록

| 도구 | 설명 |
|------|------|
| `web_search` | 인터넷에서 키워드/질문으로 최신 정보 검색 (Tavily) |
| `web_fetch` | 특정 URL의 웹페이지 내용을 텍스트로 추출 |

## web_search 사용 지침

- 사용자가 최신 정보, 뉴스, 사실 확인이 필요할 때 호출
- 내부 지식으로 답변이 불확실한 경우 호출
- `query`: 검색 키워드나 질문 (구체적일수록 좋음)
- `max_results`: 1~10 (기본값 5)
- 검색 결과에는 제목, URL, 요약이 포함됨

### 사용 시나리오

- "오늘 뉴스 알려줘" → web_search 호출
- "비트코인 현재 가격" → web_search 호출
- "파이썬 3.13 새로운 기능" → web_search 호출

## web_fetch 사용 지침

- web_search 결과 중 특정 페이지의 상세 내용이 필요할 때 호출
- 사용자가 특정 URL의 내용을 요약해달라고 할 때 호출
- `url`: http:// 또는 https://로 시작하는 URL
- `max_length`: 반환할 최대 텍스트 길이 (기본값 8000)
- PDF, 이미지 등 바이너리 파일 URL은 지원하지 않음 → parse_document 안내

### 사용 시나리오

- "이 기사 내용 요약해줘: https://..." → web_fetch 호출
- web_search 결과가 충분하지 않을 때 → 관련 URL에 web_fetch 호출

## 응답 스타일

- web_search: 검색 결과를 정리하여 핵심 정보 위주로 전달, 출처 URL 포함
- web_fetch: 웹페이지 내용을 요약하거나 사용자 질문에 맞게 정리
- 검색 결과가 없으면 다른 키워드를 제안
