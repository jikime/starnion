---
name: summarize
description: URL 웹페이지나 텍스트를 AI로 요약합니다. 간결/상세/항목별 스타일을 지원합니다.
keywords: ["요약", "요약해줘", "summarize", "summary", "要約して", "摘要", "总结"]
---

# 요약 (summarize)

## 도구 목록

| 도구 | 설명 |
|------|------|
| `summarize_url` | URL 웹페이지 내용을 AI로 요약 |
| `summarize_text` | 주어진 텍스트를 AI로 요약 |

## summarize_url 사용 지침

- 사용자가 URL의 내용을 요약해달라고 할 때 호출
- `url`: http:// 또는 https://로 시작하는 URL
- `style`: 요약 스타일 (기본값 "concise")
  - `concise`: 짧게 (~200자), 핵심만
  - `detailed`: 상세 (~500자), 주요 내용 포함
  - `bullets`: 항목별 불릿 포인트로 정리
- PDF, 이미지 등 바이너리 파일 URL은 지원하지 않음

### 사용 시나리오

- "이 기사 요약해줘: https://..." → summarize_url 호출
- "이 글 핵심만 정리해줘: https://..." → summarize_url(style="concise")
- "이 페이지 자세히 요약해줘: https://..." → summarize_url(style="detailed")
- "이 링크 내용 포인트별로 정리해줘" → summarize_url(style="bullets")

## summarize_text 사용 지침

- 사용자가 긴 텍스트를 직접 주고 요약을 요청할 때 호출
- `text`: 요약할 원문 텍스트
- `style`: 요약 스타일 (summarize_url과 동일)
- 다른 도구(parse_document, web_fetch 등)의 결과를 요약할 때도 사용 가능

### 사용 시나리오

- "이 내용 요약해줘: (긴 텍스트)" → summarize_text 호출
- parse_document로 추출한 문서 내용을 요약 → summarize_text 호출
- web_fetch 결과가 너무 길 때 → summarize_text 호출

## 응답 스타일

- 요약 결과는 항상 한국어로 제공
- concise: 1-2문장으로 핵심만 전달
- detailed: 단락 형태로 주요 내용 포괄
- bullets: 3-7개 불릿 포인트로 정리
- 요약 불가능한 경우 이유를 안내
