---
title: Memo
nav_order: 5
parent: Features
grand_parent: 🇺🇸 English
---

# Memo

## Overview

The memo feature is a simple note system for quickly saving information you need to remember and organizing it with tags. If the diary is a personal journal for recording emotions and daily life, the memo is a personal database for storing information and facts.

**Key features:**
- Tag-based organization for fast searching
- Store up to 100 memos
- AI automatically finds relevant memos for you
- Simple title + content structure for clean management

> Memos are different from the memory skill. A memo is a structured information store that you explicitly save and retrieve. Memory is the AI's long-term learning system that automatically absorbs conversational context.

---

## Writing a Memo

### Writing on the Web

1. Click **Memo** in the sidebar.
2. Click the **+ New Memo** button in the upper right.
3. Enter the following:
   - **Title** (required): a name to quickly identify the memo
   - **Content** (optional): detailed content of the memo
   - **Tag** (optional): classification category (default: Personal)
4. Click **Save**.

Saved memos are displayed in the list sorted by most recently modified.

### Writing via Chat

Ask the AI to save a memo in the chat box and it is stored immediately.

**Example conversations:**

> User: "I need to buy milk and eggs, save a memo"
>
> AI: "Memo saved! Recorded as 'Shopping list'."

> User: "Save meeting notes — scheduled to launch next Tuesday, needs Marketing team approval"
>
> AI: "Meeting notes memo saved. Tag set to 'Work'."

> User: "New idea memo — it would be great to add dark mode to the app"
>
> AI: "Idea memo saved! Recorded with the 'Ideas' tag."

**Save trigger phrases:**
- "Memo this", "record this", "save this"
- "Leave me a note —", "note this down"
- "Save the meeting notes", "write down X"

---

## Tag System

Tags are the key feature for categorizing memos and finding them quickly later.

### Default Tags

If no tag is specified when saving a memo, the **Personal** tag is applied automatically. The AI analyzes the memo content and automatically suggests an appropriate tag:

| Content example | Auto-tag |
|-----------------|----------|
| Meeting content, project-related | Work |
| Shopping, food memos | Personal |
| New ideas, planning | Ideas |
| Study notes, lecture notes | Learning |
| Travel plans, places to visit | Travel |

### How to Add Tags

**On the web:** Type directly in the tag field and save
**Via chat:** "Memo this with the Work tag" / "Save this with the Ideas tag"

### Searching by Tag

**On the web:** Click the tag filter button above the memo list → select the desired tag
**Via chat:**

> User: "Show me only Work memos"
>
> AI: "Work tag memos:\n1. Meeting notes (3/5)\n2. Project plan (3/3)\n3. Deadline schedule (2/28)"

---

## Searching Memos

### Keyword Search (Web)

Use the search bar on the memo screen to search by keywords contained in titles or content. The search is case-insensitive and supports partial matches.

**Example:** Searching "marketing" → shows all memos with "marketing" in the title or content

### AI-Assisted Search (Chat)

Describe what you're looking for to the AI and it will find the relevant memo. You don't need to remember the exact keyword.

> User: "Find the meeting-related memo I saved last time"
>
> AI: "Found meeting-related memos:\n1. 3/5 Meeting notes — scheduled to launch next week\n2. 2/28 Weekly meeting — Marketing team feedback"

> User: "Show me all project-related memos"
>
> AI: "Found 3 project-related memos:\n..."

> User: "Are there any food-related memos?"
>
> AI: "There are food-related memos:\n- Shopping list: milk, eggs\n- Restaurant list: pasta place (Hongdae)"

---

## AI Usage Examples

Here are various ways to use the memo feature together with the AI.

### Quick Memo Save

```
User: "Save a link for later — https://example.com/article"
AI: "Link memo saved. Title set to 'Reference link'."

User: "Save Kim Cheol-su's phone number 010-1234-5678 as a memo"
AI: "Contact memo saved. Recorded with the 'Personal' tag."
```

### Saving a Structured Memo

```
User: "Save these meeting notes:
  Attendees: Team Lead Kim, Deputy Lee, Staff Park
  Agenda: Q2 marketing strategy
  Decisions: Increase SNS advertising budget by 2,000,000 won"
AI: "Meeting notes saved! Recorded with the 'Work' tag."
```

### Retrieving Memos

```
User: "Show me my memos"
AI: "Here are your 5 most recent memos:
  1. Meeting notes (Work) — 3/8
  2. Shopping list (Personal) — 3/7
  3. Travel checklist (Travel) — 3/5
  4. Idea notes (Ideas) — 3/3
  5. Study summary (Learning) — 3/1"

User: "Show me the travel memo in detail"
AI: "[Travel checklist memo]
  Passport, charger, travel insurance certificate, local SIM card..."
```

### Deleting a Memo

```
User: "Delete the shopping list memo"
AI: "Shopping list memo deleted."
```

---

## Tips & FAQ

**Q. How should I decide between using a memo and a diary?**

| Situation | Recommended feature |
|-----------|---------------------|
| "How I felt today and what happened" | Diary |
| "Saving information I'll reference later" | Memo |
| "Meeting notes, to-do lists" | Memo |
| "Reflecting on an emotional day" | Diary |

**Q. How many memos can I store?**
Up to 100 memos. Once you reach 100, you'll need to delete older memos before saving new ones.

**Q. Can I attach multiple tags to a memo?**
Currently each memo can only have one tag. If a memo covers multiple topics, including keywords in the content itself makes it easier to find during searches.

**Q. Can I see memos saved in chat on the web too?**
Yes, chat and the web share the same data. Memos saved in chat are also visible in the web memo list, where you can view and edit them.

**Q. Can I edit a memo?**
On the web, clicking a memo takes you to the edit screen. Chat does not currently support direct editing, so delete the existing memo and save a new one instead.

**Q. Is memo content also saved to AI memory?**
Memos themselves are not saved directly to AI long-term memory. However, if you retrieve a memo or mention its content during a conversation, that conversation context may influence AI memory. To explicitly have something remembered, say "remember this."
