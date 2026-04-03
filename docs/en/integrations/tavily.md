---
title: Tavily Search Integration
nav_order: 4
parent: Integrations
grand_parent: 🇺🇸 English
---

# Tavily Search Integration

Connecting Starnion to Tavily lets the AI agent perform real-time web searches to provide up-to-date information. Ninon automatically runs Tavily searches when current information is needed.

---

## Overview

With the Tavily integration you can:

- **Real-time web search**: Search for the latest news, information, and data
- **News search**: Find recent news articles
- **Academic search**: Search academic papers and research

> **Opt-in feature:** The Tavily integration is disabled by default. You need to register an API key and enable the skill to use it.

---

## Supported Features

| Feature | Description |
|---------|-------------|
| Web search | Real-time web search for the latest information |
| News search | Recent news article search |
| Academic search | Academic papers and research search |

---

## Prerequisites: Get a Tavily API Key

### Step 1: Create an API Key

1. Go to [tavily.com](https://tavily.com).
2. Create an account or log in.
3. Find the **API Keys** section in the dashboard.
4. Click **Create API Key**.
5. Copy the generated API key (`tvly-...` format).

> **Free tier:** Tavily offers up to 1,000 searches per month for free.

---

## Setup

### Register API Key in Web UI

1. Log in to the Starnion web UI.
2. Go to **Settings** → **Integrations** tab.
3. Find the **Tavily** section and the **API Key** field.
4. Paste the copied API key (`tvly-...`).
5. Click **Save**.
6. Enable the **Tavily skill** toggle.

---

## Usage

Once configured, Ninon automatically searches when up-to-date information is needed.

### Real-time Information

```
You: What's the current S&P 500 index?
Bot: (Tavily search)
     The S&P 500 is currently at 5,450.12, up 0.3% from yesterday.
     Source: MarketWatch

You: Find the latest AI news
Bot: (Tavily search)
     Recent AI news:
     1. "OpenAI announces GPT-5 release" — TechCrunch
     2. "Google releases Gemini 2.0 update" — The Verge
     3. "AI startup funding reaches record highs" — Bloomberg
```

### Topic-Specific Search

```
You: What are the latest Bitcoin price trends?
Bot: (Tavily search)
     Bitcoin is currently trading at approximately $85,000...

You: Find economic forecasts for 2026
Bot: (Tavily search)
     According to recent analyses, the global economy is expected to...
```

---

## Automatic Search Behavior

Ninon automatically triggers Tavily searches when:

- Current news or real-time information is requested
- Real-time data (stock prices, exchange rates, weather) is asked about
- Recent information not included in AI training data is needed

> **Tip:** Using phrases like "search for" or "find" increases the likelihood of triggering a Tavily search.

---

## Disconnect

1. Go to Settings → Integrations → Tavily section.
2. Click **Disconnect**.
3. The stored API key is immediately deleted.

---

## Troubleshooting

### "Tavily integration is not configured"

Check that an API key is registered in Settings → Integrations → Tavily.

### "Tavily API key is invalid" (401 error)

- Verify the API key is correct.
- Check on [tavily.com](https://tavily.com) that the key is active.

### "Search limit exceeded" (429 error)

- You may have exceeded the free tier monthly limit (1,000 searches).
- Upgrade to a paid plan or wait until next month.

---

## FAQ

**Q: Are Tavily search results always accurate?**
A: Results are based on web search, so always verify the source. Ninon displays sources when available.

**Q: Can I get current information without Tavily?**
A: Without Tavily, the AI responds based on its training data only. For real-time information, Tavily integration is recommended.

**Q: Is the free tier sufficient?**
A: For personal use, 1,000 searches per month is usually enough. For team use, consider a paid plan.
