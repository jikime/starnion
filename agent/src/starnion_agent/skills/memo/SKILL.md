---
name: memo
description: Save, list, and delete quick memos.
tools:
  - save_memo
  - list_memos
  - delete_memo
keywords: ["메모", "적어줘", "기록해줘", "memo", "note", "jot down", "メモ", "メモして", "备忘录", "记下来"]
---

# Memo Skill

## Tools

### save_memo
Saves a memo.

**Parameters:**
- `content` (required): Memo content
- `title` (optional): Memo title
- `tag` (optional): Memo tag (e.g., work, personal, idea)

**Usage scenarios:**
- "Remind me to buy milk" → save_memo(content="Buy milk", title="Shopping")
- "Meeting note: launch planned for next week" → save_memo(content="Launch planned for next week", title="Meeting note", tag="work")

### list_memos
Lists saved memos.

**Parameters:**
- `tag` (optional): Filter by tag
- `limit` (optional, default 10): Number of results (1–50)

**Usage scenarios:**
- "Show my memos" → list_memos()
- "Show only work memos" → list_memos(tag="work")

### delete_memo
Deletes a memo.

**Parameters:**
- `memo_id` (required): ID of the memo to delete

**Notes:**
- Up to 100 memos can be stored.
- Unlike the memory skill, this is an explicit save/delete quick-memo feature.

## Tool Result Handling

- If the tool returns a **success** message, relay that result to the user.
- If the tool returns an **error or failure** message, honestly relay that message to the user.
- Never respond that a memo was saved, deleted, or completed without actually calling the tool.
