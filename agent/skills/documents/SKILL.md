---
name: python3 documents/scripts/documents.py
display_name: 문서 검색 및 생성
description: Search, read, save, and generate documents in the knowledge base (문서 검색, 파일 찾아줘, 문서에서 정보 찾아줘, 업로드한 파일, 지식베이스에 저장, 파일 저장, 문서 만들어줘, 문서 생성, 보고서 작성, 워드 문서 생성, Word 파일 만들어줘, 마크다운 파일 생성, PDF 만들어줘, 엑셀 파일 만들어줘, PPT 만들어줘, 한글 파일 만들어줘, hwp 만들어줘, hwpx 만들어줘) — vector + full-text search over indexed documents; save chat/Telegram file attachments; generate AI-written documents (docx/pdf/xlsx/pptx/hwpx/hwp/md/txt) uploaded to MinIO
version: 1.5.0
emoji: "📄"
category: knowledge
enabled_by_default: true
requires_api_key: optional
platforms: web, telegram, api
uses_provider: false
requires:
  bins:
    - python3 documents/scripts/documents.py
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 문서
    - 파일
    - 문서 검색
    - 파일 찾아줘
    - 지식베이스
    - 업로드한
    - 저장된
    - 보고서
    - 워드
    - 엑셀
    - PDF
    - PPT
    - 한글
    - HWP
    - 마크다운
    - 문서 만들어
    - 문서 생성
    - document
    - report
    - search files
    - knowledge base
    - generate document
    - docx
    - xlsx
    - pptx
  when_to_use:
    - User uploads a file or asks to save/index a file
    - User wants to search for documents in the knowledge base
    - User asks to create or generate a document (Word, PDF, Excel, PPT, HWP)
    - User asks "파일 찾아줘" or "문서에서 정보 찾아줘"
    - User references previously uploaded documents
---

# Document Search & Knowledge Base

Use `python3 documents/scripts/documents.py` to search, read, and save documents into the knowledge base. Works for **both web chat and Telegram** — no platform distinction needed.

Always pass `--user-id {user_id}` (extract from `[Context: user_id=...]` at the top of the message).

## API Key & Search Mode

문서 색인(indexing)과 검색은 API 키 설정 여부에 따라 동작 방식이 다릅니다:

| 상태 | 색인 | 검색 방식 |
|------|------|-----------|
| Gemini API 키 있음 | 텍스트 + 벡터 임베딩 저장 | **시멘틱 검색** (의미 유사도) + 전문 검색 |
| API 키 없음 | 텍스트만 저장 (임베딩 없음) | **전문 검색** (키워드 매칭)만 가능 |

> Gemini API 키는 **Settings → Integrations**에서 설정합니다.
> API 키 없이도 문서 업로드·색인·검색은 모두 가능하지만, 의미 기반 검색은 제공되지 않습니다.

## When to use Document skill

| User intent | Use |
|-------------|-----|
| User wants to find information inside their uploaded documents | **search** |
| User wants to see a list of their uploaded documents | **list** |
| User wants to read the contents of a specific document | **read** |
| User attaches a file and wants it saved to the knowledge base | **save** |
| User wants a new document **created/written/generated** in any file format (Word, PDF, Excel, PPT, Hangeul, markdown, etc.) | **generate** |
| General knowledge question not about their files | Use **websearch** or answer directly |

> **중요**: LLM이 문서 내용을 직접 작성한 뒤 파일로 저장할 때는 **반드시 `generate` 커맨드를 사용**하세요.
> 절대로 로컬에 .md 파일을 직접 만들지 마세요 — 모든 파일은 MinIO에 업로드되어야 합니다.

## File Attachment Flow (Web & Telegram)

When a user attaches a file (`[file:name:URL]` or `[image:URL]`) and asks a question:

1. **Use the file for the immediate response** (text extraction, context injection)
2. **After answering, proactively suggest saving**:
   > "이 파일을 지식베이스에 저장해 드릴까요? 저장하면 나중에도 '파일에서 ~ 찾아줘'로 검색할 수 있어요."
3. **If user confirms** → run the `save` command with the file URL

This flow applies uniformly to web chat and Telegram — no platform-specific handling needed.

**Trigger phrases for save suggestion**: 파일 첨부, 문서 전송, 이미지/PDF/Word 파일 수신

## Commands

### List uploaded documents
```bash
python3 documents/scripts/documents.py --user-id {user_id} list
```

### Search documents by keyword or phrase
```bash
python3 documents/scripts/documents.py --user-id {user_id} search \
  --query "{search query}"
```

Optionally limit results:
```bash
python3 documents/scripts/documents.py --user-id {user_id} search \
  --query "{search query}" \
  --limit 5
```

### Read sections of a specific document
```bash
python3 documents/scripts/documents.py --user-id {user_id} read \
  --doc-id {document_id}
```

### Save a chat/Telegram file attachment to the knowledge base
```bash
python3 documents/scripts/documents.py --user-id {user_id} save \
  --url "{file_url}" \
  --filename "{original_filename}"
```

Extract `{file_url}` from the `[file:name:URL]` or `[image:URL]` tag in the message.
Extract `{original_filename}` from the `name` part of the tag.

### Generate a document from AI-written content and upload to MinIO

**Use this whenever the user asks you to create, write, or save a document.**

#### Format inference — no need to ask the user

Match user intent to format semantically, regardless of language:

| User intent | `--format` |
|-------------|-----------|
| Word processor document (Word, 워드, Documento Word, Wortdokument, etc.) | `docx` |
| PDF file | `pdf` |
| Spreadsheet / tabular data (Excel, 엑셀, tableur, Tabelle, etc.) | `xlsx` |
| Presentation / slides (PowerPoint, 발표자료, diapositivas, etc.) | `pptx` |
| Hangeul XML format (hwpx, 한글 문서 XML) | `hwpx` |
| Hangeul binary format (hwp — requires LibreOffice) | `hwp` |
| Markdown / plain markup file | `md` |
| Plain text file | `txt` |
| Not specified or ambiguous | `docx` (default) |

> The table above describes **intent categories**, not keyword lists.
> "워드 문서", "Word document", "documento de Word" all map to `docx` —
> no need to enumerate every language variant.

```bash
printf '%s' "{markdown content}" | \
  python3 documents/scripts/documents.py --user-id {user_id} generate \
    --title "{document title without extension}" \
    --format docx
```

- `--format` accepts `docx` (default), `pdf`, `xlsx`, `pptx`, `hwpx`, `hwp`, `md`, `txt`
- `hwpx`: 한글 XML 포맷 (LibreOffice 불필요, stdlib만 사용)
- `hwp`: LibreOffice 변환 방식 (서버에 LibreOffice 필요; 없으면 `hwpx` 권장)
- Content is piped via **stdin** as markdown (the script converts automatically — no pandoc required)
- The script uploads to MinIO, inserts into the `documents` table, auto-indexes for search, and prints the download link

**Expected output** (last line):
```
[📄 {filename}.docx](/api/files/users/{user_id}/docs/{year}/{uuid}.docx)
```

The agent must include this output link in the response so the user can download the document. It will render as a download card in the web chat and be sent as a file in Telegram.

## Examples

User: "내가 업로드한 파일 목록 보여줘"
```bash
python3 documents/scripts/documents.py --user-id abc123 list
```

User: "계약서에서 해지 조항 찾아줘"
```bash
python3 documents/scripts/documents.py --user-id abc123 search \
  --query "해지 조항"
```

User: "2번 문서 내용 읽어줘"
```bash
python3 documents/scripts/documents.py --user-id abc123 read \
  --doc-id 2
```

User sends `[file:계약서.pdf:https://files.example.com/abc.pdf]`, then says "저장해줘"
```bash
python3 documents/scripts/documents.py --user-id abc123 save \
  --url "https://files.example.com/abc.pdf" \
  --filename "계약서.pdf"
```

User: "바이브코딩에 대해 웹검색해서 문서로 만들어줘" → docx (기본값)
```bash
printf '%s' "# 바이브코딩 (Vibe Coding)\n\n## 개요\n바이브코딩은..." | \
  python3 documents/scripts/documents.py --user-id abc123 generate \
    --title "바이브코딩 가이드" \
    --format docx
```

User: "스타트업 사업계획서 PDF로 만들어줘" → pdf
```bash
printf '%s' "# 스타트업 사업계획서\n\n## 1. 회사 개요\n..." | \
  python3 documents/scripts/documents.py --user-id abc123 generate \
    --title "스타트업 사업계획서" \
    --format pdf
```

User: "분기별 매출 데이터 엑셀로 만들어줘" → xlsx
```bash
printf '%s' "분기|매출|전년비\nQ1|1억|+10%\nQ2|1.2억|+15%" | \
  python3 documents/scripts/documents.py --user-id abc123 generate \
    --title "분기별 매출 현황" \
    --format xlsx
```

User: "발표자료 만들어줘" → pptx
```bash
printf '%s' "# 2024 사업 전략\n\n## 핵심 목표\n- 매출 성장 20%\n- 신규 고객 100명" | \
  python3 documents/scripts/documents.py --user-id abc123 generate \
    --title "2024 사업 전략 발표" \
    --format pptx
```

User: "마크다운 파일로 정리해줘" → md
```bash
printf '%s' "# 정리 내용\n\n..." | \
  python3 documents/scripts/documents.py --user-id abc123 generate \
    --title "정리 문서" \
    --format md
```

User: "한글 문서로 만들어줘", "hwpx 파일로" → hwpx (LibreOffice 불필요)
```bash
printf '%s' "# 제목\n\n## 내용\n한글 문서 내용..." | \
  python3 documents/scripts/documents.py --user-id abc123 generate \
    --title "한글 문서" \
    --format hwpx
```

User: "hwp 파일로 만들어줘" → hwp (LibreOffice 필요, 없으면 hwpx 권장)
```bash
printf '%s' "# 제목\n\n## 내용\n..." | \
  python3 documents/scripts/documents.py --user-id abc123 generate \
    --title "한글 문서" \
    --format hwp
```
