---
name: documents
description: 다양한 형식의 문서를 파싱하여 벡터 DB에 저장하고, 요청한 내용으로 문서를 생성하여 파일로 전달합니다.
---

# 문서 처리 (documents)

## 도구 목록

| 도구 | 설명 |
|------|------|
| `parse_document` | 문서 파일을 텍스트로 추출하고 벡터 DB에 저장 |
| `generate_document` | 요청한 내용으로 문서 파일을 생성하여 전달 |

## parse_document 사용 지침

- 문서가 첨부된 메시지에 호출
- 추출된 텍스트는 청크 단위로 벡터 DB에 자동 저장
- 문서가 첨부되지 않은 상태에서는 호출하지 않음

## 문서 내용 질문 처리 (중요!)

사용자가 **이전에 업로드한 문서의 내용**에 대해 질문하거나 요약을 요청하면:

1. **반드시 `retrieve_memory`를 먼저 호출**하여 관련 청크를 검색하세요.
2. 검색 결과를 바탕으로 답변하세요.
3. `retrieve_memory` 없이 직접 답변하지 마세요 — 문서 전체 내용이 메모리에 없으므로 할루시네이션이 발생합니다.

**트리거 패턴** (다음 표현이 나오면 `retrieve_memory` 호출):
- "이 문서에서 ~", "업로드한 파일에서 ~", "방금 보낸 문서 ~"
- "문서 요약해줘", "파일 내용이 뭐야?", "어떤 내용이야?"
- "~라고 나와 있어?", "문서에서 ~를 찾아줘"

**쿼리 설정**: 사용자 질문의 핵심 키워드를 `query`로 전달하세요.
예: "계약서에서 납품 일정이 언제야?" → `retrieve_memory(query="납품 일정")`

### 지원 포맷

| 확장자 | 형식 | 설명 |
|--------|------|------|
| `.pdf` | PDF | 텍스트 추출 (pypdf) |
| `.docx` / `.doc` | Word | 단락 텍스트 추출 |
| `.xlsx` / `.xls` | Excel | 시트별 셀 데이터 추출 |
| `.pptx` / `.ppt` | PowerPoint | 슬라이드 텍스트 추출 |
| `.hwp` | 한글 | 기본 텍스트 추출 (제한적) |
| `.md` | Markdown | 원문 그대로 |
| `.txt` / `.csv` | 텍스트 | 원문 그대로 |

## generate_document 사용 지침

**중요**: 사용자가 문서/파일 생성을 요청하면 텍스트로 답하지 말고 반드시 `generate_document`를 호출하세요.

### 트리거 키워드 → format 매핑

| 사용자 표현 | format 값 |
|-------------|-----------|
| 워드, 워드문서, Word, doc, docx | `docx` |
| 엑셀, 엑셀파일, Excel, xls, xlsx | `xlsx` |
| PPT, ppt, pptx, 발표자료, 프레젠테이션, 슬라이드 | `pptx` |
| PDF, pdf, 피디에프 | `pdf` |
| 마크다운, Markdown, md | `md` |
| 텍스트, 텍스트파일, txt | `txt` |

### 사용 예시

- "~에 대해 조사한 후 워드문서로 만들어줘" → 내용 작성 후 `generate_document(content=..., format="docx", title="...")`
- "이걸 엑셀로 정리해줘" → `generate_document(content=..., format="xlsx", title="...")`
- "보고서 PDF로 생성해줘" → `generate_document(content=..., format="pdf", title="...")`
- "발표자료 만들어줘" → `generate_document(content=..., format="pptx", title="...")`
- "~를 문서로 만들어줘" (포맷 미지정) → 기본값 `pdf`로 생성

### 파라미터

- `content`: 문서에 들어갈 내용 (마크다운 또는 일반 텍스트). 먼저 내용을 충분히 작성한 뒤 전달
- `format`: 위 매핑표 참고 (기본값: pdf)
- `title`: 문서 제목 (파일명에 사용). 주제에 맞게 자동 설정

### 포맷별 참고

- **xlsx**: content의 첫 줄은 쉼표로 구분된 헤더, 이후 줄은 데이터 행
- **pdf/docx**: title이 제목으로, content가 본문으로 들어감
- **pptx**: title이 제목 슬라이드, content의 각 문단이 내용 슬라이드의 bullet으로 생성 (6개마다 새 슬라이드)
- **md/txt**: 내용 그대로 파일로 저장

## 응답 스타일

- parse_document: 문서 내용을 요약하여 전달, "나중에 기억 검색으로 조회할 수 있어요" 안내
- generate_document: "문서를 생성했어요" 간단히 안내 (파일이 자동 전달됨)
- 문서가 길면 핵심 내용 위주로 요약
