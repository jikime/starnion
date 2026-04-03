---
title: Naver Search Integration
nav_order: 5
parent: Integrations
grand_parent: 🇺🇸 English
---

# Naver Search Integration

Connecting Starnion to the Naver Search API lets the AI agent perform searches specialized for Korean-language content. Access Naver's blog, news, cafe, shopping, and Knowledge iN (Q&A) search services using natural language.

---

## Overview

With the Naver Search integration you can:

- **Blog search**: Search Naver blog posts
- **News search**: Search Korean-language news articles
- **Cafe search**: Search Naver cafe (community forum) posts
- **Shopping search**: Search product information
- **Knowledge iN search**: Search questions and answers

> **Opt-in feature:** The Naver Search integration is disabled by default. You need to create an app on Naver Developers and register the API keys, then enable the skill.

---

## Supported Search Types

| Search Type | Description |
|-------------|-------------|
| Blog | Naver blog post search |
| News | Korean-language news article search |
| Cafe | Naver cafe community post search |
| Shopping | Product name, price, and shopping info search |
| Knowledge iN | Question and answer search |

---

## Prerequisites: Create a Naver Developers App

### Step 1: Register an App

1. Go to [Naver Developers](https://developers.naver.com/).
2. Click **Application** → **Register Application**.
3. Enter an **Application Name** (e.g., `Starnion`).
4. Under **APIs**, select **Search**.
5. Add an appropriate environment under **Non-login Open API Service Environment**.
6. Click **Register**.

### Step 2: Get Credentials

1. After registration, click your app in the **My Applications** list.
2. Copy the **Client ID** and **Client Secret**.

> **Free usage:** The Naver Search API allows up to 25,000 calls per day for free.

---

## Setup

### Register API Keys in Web UI

1. Log in to the Starnion web UI.
2. Go to **Settings** → **Integrations** tab.
3. In the **Naver Search** section, enter:
   - **Client ID**: The Client ID from Naver Developers
   - **Client Secret**: The Client Secret from Naver Developers
4. Click **Save**.
5. Enable the **Naver Search skill** toggle.

---

## Usage

Once configured, ask the AI in natural language.

### News Search

```
You: Search Naver for today's economy news
Bot: (Naver news search)
     Recent economy news:
     1. "KOSPI breaks through 2,650, semiconductor stocks strong" — Korea Economic Daily
     2. "Exchange rate holds steady at 1,300 won" — Maeil Business Newspaper
     ...
```

### Blog Search

```
You: Find MacBook Pro reviews on Naver blogs
Bot: (Naver blog search)
     MacBook Pro blog posts:
     1. "[Review] M4 MacBook Pro one month usage review" — TechBlog
     2. "MacBook Pro vs MacBook Air comparison" — IT Reviewer
     ...
```

### Shopping Search

```
You: Search Naver Shopping for wireless earbuds prices
Bot: (Naver shopping search)
     Wireless earbuds results:
     1. AirPods Pro 2 — ₩299,000 (lowest price)
     2. Samsung Galaxy Buds3 Pro — ₩259,000
     3. Sony WF-1000XM5 — ₩279,000
```

---

## Why Specialized for Korean Content

The Naver Search API is optimized for Korean-language content:

- **Korean morphological analysis**: Accurately understands Korean search terms
- **Domestic content**: Specialized for Korean websites, blogs, and news
- **Local information**: Korean shopping, local info, and domestic community search
- **Cafe/Knowledge iN**: Korean community information hard to find on global search engines

> **Tip:** Use Naver Search for Korean content and Tavily for global searches to get the most comprehensive results.

---

## Disconnect

1. Go to Settings → Integrations → Naver Search section.
2. Click **Disconnect**.
3. The stored Client ID and Client Secret are immediately deleted.

---

## Troubleshooting

### "Naver Search integration is not configured"

Check that Client ID and Client Secret are registered in Settings → Integrations → Naver Search.

### "Naver API authentication failed" (401 error)

- Verify the Client ID and Client Secret are correct.
- Check on [Naver Developers](https://developers.naver.com/) that the app is active.

### "Daily call limit exceeded" (429 error)

- The daily API call limit (25,000) has been exceeded.
- It resets automatically the next day.

---

## FAQ

**Q: Can I use Naver Search and Tavily together?**
A: Yes, both can be enabled simultaneously. Ninon automatically selects the appropriate service based on the search content.

**Q: Can I search in English using Naver?**
A: Yes, but Tavily is recommended for English content. Naver is optimized for Korean content.

**Q: Is the Naver Search API free?**
A: Up to 25,000 calls per day are free, which is sufficient for typical personal use.
