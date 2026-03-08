---
title: Notion Integration
nav_order: 2
parent: Integrations
---

# Notion Integration

Connecting Starnion to Notion lets the AI agent search Notion pages, create new pages, read or append content — all in natural language. You can use it for writing meeting notes, capturing ideas, and searching your knowledge base.

---

## Overview

With Notion integration you can:

- **Search**: Search pages and databases in your workspace using natural language
- **Create pages**: Create new pages with a title and body content
- **Read content**: Retrieve and summarize page content by page ID or URL
- **Append content**: Add new text blocks to existing pages

> **Opt-in feature:** Notion integration is disabled by default. You must complete the setup procedure below and enable the skill before using it.

---

## Supported Features

| Feature | Description |
|---------|-------------|
| `notion_search` | Search pages and databases |
| `notion_page_create` | Create a new page (with optional body content) |
| `notion_page_read` | Read page content |
| `notion_block_append` | Append blocks to an existing page |

---

## Prerequisites: Creating a Notion Integration

Notion integration uses an **Integration Token**. You create an integration in your Notion workspace and individually grant access to the pages you want the AI to reach.

### Step 1: Create a Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations).
2. Click **+ New integration**.
3. Enter a name for the integration (e.g., `Starnion`).
4. Select the **workspace** to connect.
5. Under the **Capabilities** tab, verify and enable the required permissions.

   | Permission | Description | Required |
   |------------|-------------|----------|
   | Read content | Read pages and databases | Required |
   | Update content | Edit page content | Recommended |
   | Insert content | Create new pages and blocks | Recommended |

6. Click **Save**.
7. Copy the **Secret** (Internal Integration Secret).

```
secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Security note:** The integration token is like a password. Never share it publicly.

### Step 2: Connect the Integration to Pages

By default, a Notion integration cannot access any pages. You must individually grant access to each page or database the AI needs to reach.

1. Open the page in Notion that you want to allow access to.
2. Click **...** (More) in the upper right → **Connections** (or **Connect to**).
3. Search for and select the integration name you created (e.g., `Starnion`).
4. Click **Confirm**.

> **Tip:** Connecting the integration to a parent page automatically grants access to all child pages. To access your entire workspace, connect it to the top-level page.

---

## Setup

### Registering the Integration Token in the Web UI

1. Log in to the Starnion web UI.
2. Click **Settings** → **Integrations** tab in the left menu.
3. Find the **Integration Token** input field in the **Notion** section.
4. Paste the secret key you copied (`secret_...`).
5. Click **Save**.
6. Turn on the **Enable Notion Skill** toggle.

Once saved, the token is stored in the database and used for all subsequent Notion requests.

---

## How to Use

Once the Notion integration is set up, make requests to the AI in natural language.

### Search Pages

Search for pages and databases in your workspace.

```
Me: Find "Q2 Plan" in Notion
Bot: Search results for 'Q2 Plan' (2 results):
    📄 [Page] 2026 Q2 Business Plan | ID: abc123
    📄 [Page] Q2 Marketing Plan    | ID: def456

Me: Search Notion for databases only (project)
Bot: Search results for 'project' (1 result):
    🗄️ [Database] Project Management Board | ID: ghi789
```

Filter options:
- All (default): Search both pages and databases
- `page` filter: Search pages only
- `database` filter: Search databases only

### Create Pages

Create a new page with a title and body content.

```
Me: Create a Notion page called "March 2026 Meeting Notes"
Bot: Notion page created!
    Title: March 2026 Meeting Notes
    URL: https://notion.so/2026-abc123...

Me: Create a Notion page called "Reading List" and write the following content:
    1. The One Thing
    2. Atomic Habits
Bot: Notion page created!
    Title: Reading List
    URL: https://notion.so/def456...
```

You can also create a sub-page under a specified parent page.

```
Me: Create a page "Meeting Notes 2026-03-08" under page abc123
Bot: Notion page created!
    Title: Meeting Notes 2026-03-08
    URL: https://notion.so/...
```

### Read Page Content

Retrieve content by page ID or URL.

```
Me: Show me the content of Notion page abc123
Bot: 📄 2026 Q2 Business Plan
    URL: https://notion.so/...

    ## Goals
    - 15% revenue growth
    - Acquire 20+ new customers

Me: Summarize the content of https://notion.so/project-plan-abc123
Bot: (Reads and summarizes the page content.)
    This page is a new service plan for 2026...
```

### Append Content to an Existing Page

```
Me: Add "Action item: UI improvements by next week" to page abc123
Bot: Content added to the Notion page.

Me: Add today's decisions to the meeting notes page:
    - April launch confirmed
    - Owner: John Smith
Bot: Content added to the Notion page.
```

---

## Example Use Cases

### Automatically Organizing Meeting Notes

```
Me: Organize the meeting notes from just now in Notion.
    Attendees: John Smith, Jane Lee
    Key points: Q2 roadmap discussion, April launch confirmed
    Action items: Draft proposal (John Smith, by 3/15)

Bot: Notion page created!
    Title: 2026-03-08 Q2 Roadmap Meeting
    URL: https://notion.so/...
```

### Saving Idea Memos

```
Me: Save the idea I just thought of to Notion.
    "AI-based schedule optimization feature — learns the user's energy patterns
    to schedule important events at optimal times"

Bot: Notion page created!
    Title: Idea Memo 2026-03-08
    URL: https://notion.so/...
```

### Searching and Retrieving Knowledge Base

```
Me: Find the API guide in Notion
Bot: Search results for 'API guide' (2 results):
    📄 [Page] Internal REST API Guide v2 | ID: ...
    📄 [Page] External API Integration Checklist | ID: ...

Me: Summarize the content of Internal REST API Guide v2
Bot: (Reads and summarizes the content.)
    This document describes how to use the internal REST API...
```

---

## Important Notes

### Integration Access Scope

A Notion integration **can only access pages and databases to which it has been explicitly granted access**. Querying a page that does not have the integration connected will return a "Page not found" error.

### Page Content Length Limit

`notion_page_read` returns up to 3,000 characters. If the content is longer, only the beginning is shown with a message indicating "content was truncated."

### Permissions for Creating Top-Level Pages

If no parent page is specified, the page is created at the top level of the workspace. This requires the integration to have **workspace-level write permission**.

---

## How to Disconnect

1. Settings → Integrations → Notion section.
2. Click **Disconnect**.
3. The stored Notion API key is deleted immediately.

To also remove the integration connection from your Notion workspace:

1. Go to [my-integrations](https://www.notion.so/my-integrations) → select the integration.
2. Click **Delete integration**.

---

## Troubleshooting

### "Notion integration is not set up"

Check that you have registered an Integration Token under Settings → Integrations → Notion. The token starts with `secret_`.

### "Notion API key is not valid" (401 error)

- Verify that the integration token is correct.
- Check at [my-integrations](https://www.notion.so/my-integrations) that the token is still valid.
- Generate a new token and update it in Settings.

### "Page not found" (404 error)

- Check that the integration is connected to that page.
- Open the page in Notion → **...** → **Connections** → add the integration.

### "No permission to create page" (403 error)

- Check that the **Insert content** permission is enabled for the integration.
- Verify the integration's capability settings at [my-integrations](https://www.notion.so/my-integrations).

---

## FAQ

**Q: Can I add records to a Notion database?**
A: Currently, page creation, reading content, and appending blocks are supported. Directly manipulating database properties is not supported.

**Q: Can I connect multiple Notion workspaces?**
A: Currently, only one Integration Token can be registered per user. As a workaround, connect the same integration to pages across multiple workspaces.

**Q: Does the Integration Token expire?**
A: Notion Internal Integration Tokens do not expire unless you manually regenerate them. However, if you delete the integration from Notion, it can no longer be used.

**Q: Can I edit (overwrite) existing page content?**
A: Currently, only appending new blocks to the end of a page is supported. Editing existing block content is not supported.

**Q: How does Starnion protect the Notion API key?**
A: The API key is stored server-side in the database (`integration_keys` table) and is not displayed in the UI. It is transmitted only over HTTPS.
