---
name: notion
description: Search, create, read, append blocks, query databases, and update properties in Notion pages/databases.
keywords: ["노션", "notion", "페이지", "page", "데이터베이스", "database", "블록", "block", "메모", "노트"]
---

# Notion Skill

Notion API version `2025-09-03`.

## Tool List

| Tool | Description |
|------|-------------|
| `notion_search` | Search pages and databases |
| `notion_page_create` | Create a new page |
| `notion_page_read` | Read page content |
| `notion_block_append` | Append text blocks to a page |
| `notion_database_query` | Filter and sort database entries |
| `notion_page_update` | Update page properties (Status, Date, etc.) |

## Prerequisite: Notion Integration

Register a **Notion Integration Token** in Settings → Integrations, then share the Integration with the target pages/databases.

## Tool-Specific Guidelines

### `notion_search`
- `query`: search term
- `filter_type`: `'page'` | `'database'` | `''` (all)
- When searching a database, two IDs are returned: **ID** and **data_source_id**
  - Page creation: use `database_id`
  - Entry query: use `data_source_id`

### `notion_database_query`
- `data_source_id`: the data_source_id obtained from `notion_search`
- `filter_json`: Notion filter JSON string (optional)
- `sort_by` + `sort_direction`: property name to sort by + ascending/descending
- `limit`: 1–50 (default 10)

### `notion_page_update`
- `page_id`: page ID or URL to update
- `properties_json`: JSON string in Notion API property format

### Property JSON Format Reference

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

## Usage Scenarios

```
"Find my project page in Notion"
→ notion_search(query="project")

"Show only completed items in the Task DB"
→ notion_search(query="Task") to get data_source_id
→ notion_database_query(data_source_id="...", filter_json='{"property":"Status","select":{"equals":"Done"}}')

"Change this task's status to Done"
→ notion_page_update(page_id="...", properties_json='{"Status":{"select":{"name":"Done"}}}')

"Add content to the reading log note"
→ notion_search(query="reading log") to get ID
→ notion_block_append(page_id="...", content="content to add")
```

## Tool Result Handling

- If the tool returns a **success** message, relay that result to the user.
- If the tool returns an **error or failure** message, honestly relay that message to the user.
- Never respond that a page was created, appended, updated, or completed without actually calling the tool.
