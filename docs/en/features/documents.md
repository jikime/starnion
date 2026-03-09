---
title: Document Management
nav_order: 8
parent: Features
grand_parent: 🇺🇸 English
---

# Document Management

## Overview

Starnion's document management feature lets you upload documents in a variety of formats — PDF, Word, Excel, PowerPoint, plain text, and more — and use them together with AI. Once a document is uploaded, the AI automatically reads and analyzes its contents, so you can ask natural-language questions in chat such as "Find the delivery deadline in the contract."

Uploaded documents go through a pipeline of text extraction → chunking → vector embedding before being stored in a searchable state. The AI then retrieves relevant sections to provide accurate answers.

---

## Supported Formats

| Format | Extension | Text Extraction | AI Search | AI Chat |
|--------|-----------|-----------------|-----------|---------|
| PDF | .pdf | Yes | Yes | Yes |
| Word | .doc, .docx | Yes | Yes | Yes |
| Excel | .xls, .xlsx | Yes | Yes | Yes |
| PowerPoint | .ppt, .pptx | Yes | Yes | Yes |
| Plain Text | .txt | Yes | Yes | Yes |
| Markdown | .md | Yes | Yes | Yes |
| CSV | .csv | Yes | Yes | Yes |

> **HWP (Hangul Word Processor) files** are not currently supported directly. Export HWP files to PDF before uploading.

---

## Uploading Documents

### Attaching a File in Chat

Click the file attachment button at the bottom of the chat input box and select your document, or drag and drop a file directly into the chat window.

```
User: [Attaches contract.pdf]
AI:   contract.pdf has been uploaded. Analyzing the contents... Done!
      You can now ask questions about this document.

User: What is the delivery deadline in this contract?
AI:   According to Article 4 of the contract, the delivery deadline is June 30, 2025.
      Specifically, it states: "Party B shall deliver the products by June 30, 2025."
```

### Uploading from the Document Menu

Go to the top menu > **Documents** tab, then click the **Upload Document** button or drop a file into the drag-and-drop area.

---

## Document Processing Pipeline

When a document is uploaded, the following steps run automatically in the background.

```
1. Upload       → File saved to MinIO storage
2. Parsing      → Text extracted according to file format
3. Chunking     → Long document split into appropriately sized pieces
4. Embedding    → Each chunk converted into a vector the AI can understand
5. Storage      → Saved to the database in a searchable state
6. Done         → Ready for immediate use in AI chat
```

> Processing time varies by file size. Documents under 1 MB are typically completed within 10 seconds.

---

## Searching and Q&A with Documents

You can ask the AI natural-language questions about the content of any uploaded document.

**Contract-related:**
```
User: Find the penalty clause in the contract.
AI:   Per Article 8 (Penalty): If Party B is unable to meet the delivery deadline,
      Party B must pay a penalty of 0.1% of the contract amount for each day of delay.
```

**Meeting minutes summary:**
```
User: Summarize only the decisions made in the last meeting minutes.
AI:   Decisions from the March 5 meeting:
      1. New feature launch date: April 15
      2. Marketing budget: KRW 5,000,000 approved
      3. Owners: Team Lead Kim (Development), Director Lee (Marketing)
```

**Excel data analysis:**
```
User: Tell me the top 5 best-selling products in the January sales data.
AI:   Top 5 products by January sales:
      1st: Product A — 1,250 units (KRW 3,750,000)
      2nd: Product B — 980 units (KRW 2,940,000)
      ...
```

---

## Using Documents in AI Chat

### Attaching and Asking Questions

Attaching a document directly in chat lets you have a conversation based on that document.

```
User: [Attaches employee-manual.pdf] Summarize the annual leave policy.
AI:   Summary of Chapter 3 (Leave Policy) from the manual:
      - Annual leave accrual: 15 days after 1 year of service, +1 day every 2 years thereafter (max 25 days)
      - Usage period: Must be used within 1 year of accrual date
      - Application method: Team leader approval required 3 days in advance
      - Half-day leave: Can be split into morning (09:00–13:00) or afternoon (14:00–18:00)
```

### Comparing Multiple Documents

```
User: Compare the two quotes and tell me which one is more favorable.
AI:   Comparison of quotes from Vendor A and Vendor B:
      Vendor A: KRW 4,500,000 total, 30-day delivery, 1-year warranty
      Vendor B: KRW 4,800,000 total, 25-day delivery, 2-year warranty
      → Vendor B is KRW 300,000 more expensive, but delivers 5 days sooner and offers double the warranty period.
```

---

## AI Document Generation

You can also ask the AI to draft new documents or reports. Generated documents are automatically saved to your document list.

```
User: Draft a March work report. This month I completed 3 new feature developments and 12 bug fixes.
AI:   Your March work report has been created.
      [report.docx generated]
      You can download it from the Documents tab.
```

---

## Managing Documents

### Viewing the Document List

In the **Documents** tab, you can view all uploaded documents in chronological order. Up to 100 documents are displayed.

### Deleting Documents

Click the delete button next to a document in the list, or request deletion in chat.

```
User: Delete "2024-annual-report.pdf"
AI:   2024-annual-report.pdf has been deleted.
```

---

## Limitations

| Item | Limit |
|------|-------|
| Maximum file size | 50 MB |
| List display | Most recent 100 |
| Supported formats | PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, MD, CSV |
| Unsupported formats | HWP, image files (use the Images tab for images) |

---

## Tips & FAQ

**Q. I uploaded a document but the AI says it doesn't know the content.**
A. File processing may take a moment. Please wait and try your question again. Large files can take 1–2 minutes to process.

**Q. Can scanned PDFs be read?**
A. Scanned PDFs consist of images, making text extraction difficult. Please use OCR-processed PDFs or PDFs that contain selectable text.

**Q. Can I ask questions about only a specific sheet in an Excel file?**
A. Yes — simply mention the sheet name in your question. For example: "Tell me the March total from the Sales sheet."

**Q. Are my uploaded documents stored securely?**
A. All documents are stored in encrypted MinIO storage and are accessible only by you.
