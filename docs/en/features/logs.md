---
title: Logs
nav_order: 14
parent: Features
grand_parent: 🇺🇸 English
---

# Logs

## Overview

The Logs feature lets you view and analyze all activity records within the Starnion system. You can check conversation history with Nion, skill execution details, and system errors in one place — useful for troubleshooting and understanding usage patterns.

**Key Features:**
- Conversation logs: Search and browse all chat history
- Skill execution logs: Track which skills were executed and when
- Error logs: View detailed information when system errors occur
- Flexible filters: Filter by date, log level, skill type, and channel
- Export: Download logs in CSV/JSON format

---

## Log Types

### Conversation Logs

A record of all messages exchanged with Nion.

| Field | Description |
|-------|-------------|
| Timestamp | Exact time the message was sent |
| Sender | User or AI |
| Channel | Telegram, WebChat, etc. |
| Content | Message body |
| Conversation ID | Thread identifier |

### Skill Execution Logs

Records of skills (functions) invoked internally by the AI.

```
[2024-03-15 14:23:45] SKILL  finance.add_expense  SUCCESS  "Recorded pork belly 32,000 KRW"
[2024-03-15 14:25:12] SKILL  diary.create         SUCCESS  "Saved 3/15 diary entry"
[2024-03-15 14:30:01] SKILL  websearch.search     SUCCESS  "Searched Samsung stock price"
[2024-03-15 14:35:22] SKILL  memo.create          FAILED   "Save failed: memo limit exceeded"
```

### Error Logs

Detailed logs recorded when system errors occur.

| Level | Description | Examples |
|-------|-------------|----------|
| ERROR | Function execution failure | Skill call error, API timeout |
| WARN | Warning (function still works) | Slow response, retry triggered |
| INFO | General information | Skill execution complete, user login |
| DEBUG | Debug information | Detailed execution flow (for developers) |

---

## Viewing Logs

### From the Web UI

1. Click **Logs** in the sidebar.
2. Set filters at the top:
   - **Date range**: Start date ~ End date
   - **Log level**: ERROR, WARN, INFO, DEBUG
   - **Skill type**: Filter by specific skill
   - **Channel**: Telegram, WebChat, etc.
3. Results are displayed in chronological order.

### Filter Examples

**View errors only:**
- Set the log level to ERROR to quickly identify failed operations.

**Track a specific skill:**
- Select `finance` in the skill filter to show only finance-related logs.

**Query a specific period:**
- Use quick date selectors like "Last 7 days" or "This month" for convenience.

---

## Exporting Logs

You can download log data as files for external analysis.

### Supported Formats

| Format | Features | Use Case |
|--------|----------|----------|
| CSV | Opens directly in Excel | Spreadsheet analysis |
| JSON | Structured data | Programmatic analysis, external tools |

### How to Export

1. Apply your desired filters.
2. Click the **Export** button in the upper right.
3. Select the format (CSV or JSON).
4. The file downloads automatically.

---

## Use Cases

### Troubleshooting

When the AI gives an unexpected response or a feature doesn't work, checking the logs can reveal the cause.

```
Issue: Said "Record this in my ledger" but nothing was saved

Log check:
[14:35:22] SKILL  finance.add_expense  FAILED  "Category parsing failed: missing input"

Cause: No amount was specified, causing a parsing failure
Fix: Retry with amount included, e.g., "Record lunch 12,000 KRW"
```

### Usage Pattern Analysis

Understand which skills you use most frequently to maximize your productivity.

### Security Audit

Check for abnormal access to your account or unexpected activity at unusual hours.

---

## Tips & FAQ

**Q. How long are logs retained?**
All logs are retained permanently. For very old logs, narrowing the date range will speed up search results.

**Q. Is sensitive information exposed in logs?**
Conversation content is included in logs, but system credentials like API keys and passwords are masked.

**Q. Can I delete individual logs?**
Individual log deletion is not currently supported. Logs are preserved for data integrity and audit trail purposes.

**Q. Can I monitor logs in real time?**
Enabling auto-refresh on the web log screen lets you view the latest logs in near real-time.
