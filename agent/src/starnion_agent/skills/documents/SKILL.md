---
name: documents
description: Parses documents of various formats and stores them in the vector DB, and generates document files from requested content.
keywords: ["문서", "PDF", "DOCX", "파싱", "document", "parse", "ドキュメント", "文档", "解析"]
---

# Documents Skill

## Tool List

| Tool | Description |
|------|-------------|
| `parse_document` | Extracts text from a document file and stores it in the vector DB |
| `generate_document` | Generates a document file from requested content and delivers it |

## parse_document Usage

- Call when a document is attached to the message.
- Extracted text is automatically stored in the vector DB in chunks.
- Do not call when no document is attached.

## Handling Questions About Document Content (Important!)

When the user asks about or requests a summary of a **previously uploaded document**:

1. **Always call `retrieve_memory` first** to search for relevant chunks.
2. Answer based on the search results.
3. Do not answer directly without `retrieve_memory` — the full document content is not in memory, so hallucination will occur.

**Trigger patterns** (call `retrieve_memory` when these expressions appear):
- "from this document ~", "from the uploaded file ~", "the document I just sent ~"
- "summarize the document", "what's in the file?", "what does it say?"
- "does it say ~?", "find ~ in the document"

**Query setting**: Pass the core keywords from the user's question as `query`.
Example: "When is the delivery date in the contract?" → `retrieve_memory(query="delivery date")`

### Supported Formats

| Extension | Format | Notes |
|-----------|--------|-------|
| `.pdf` | PDF | Text extraction (pypdf) |
| `.docx` / `.doc` | Word | Paragraph text extraction |
| `.xlsx` / `.xls` | Excel | Cell data extraction per sheet |
| `.pptx` / `.ppt` | PowerPoint | Slide text extraction |
| `.hwp` | Hangul | Basic text extraction (limited) |
| `.md` | Markdown | Raw content |
| `.txt` / `.csv` | Text | Raw content |

## generate_document Usage

**Important**: When the user requests a document or file creation, always call `generate_document` instead of responding with plain text.

### Trigger Keywords → format Mapping

| User expression | format value |
|----------------|--------------|
| Word, word document, doc, docx | `docx` |
| Excel, spreadsheet, xls, xlsx | `xlsx` |
| PPT, ppt, pptx, presentation, slides | `pptx` |
| PDF, pdf | `pdf` |
| Markdown, md | `md` |
| text, txt, text file | `txt` |

### Usage Examples

- "Research X and make a Word document" → compose content then `generate_document(content=..., format="docx", title="...")`
- "Organize this into Excel" → `generate_document(content=..., format="xlsx", title="...")`
- "Generate a report as PDF" → `generate_document(content=..., format="pdf", title="...")`
- "Create a presentation" → `generate_document(content=..., format="pptx", title="...")`
- "Make this into a document" (no format specified) → generate with default `pdf`

### Parameters

- `content`: Content to include in the document (Markdown or plain text). Fully compose the content before passing it.
- `format`: See mapping table above (default: pdf)
- `title`: Document title (used for the filename). Set automatically based on the topic.

### Format-Specific Notes

- **xlsx**: First line of content is comma-separated headers; subsequent lines are data rows.
- **pdf/docx**: `title` becomes the heading, `content` becomes the body.
- **pptx**: `title` becomes the title slide; each paragraph in `content` becomes a bullet on content slides (new slide every 6 paragraphs).
- **md/txt**: Content is saved as-is to the file.

## Response Style

- parse_document: Summarize the document content, inform the user it can be retrieved later via the memory skill.
- generate_document: Briefly say "Document created" (the file is delivered automatically).
- For long documents, summarize the key points.

## Tool Result Handling

- If the tool returns a **success** message, relay that result to the user.
- If the tool returns an **error or failure** message, honestly relay that message to the user.
- Never respond that a document was saved, generated, or completed without actually calling the tool.
