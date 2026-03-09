---
title: Analytics & Usage
nav_order: 13
parent: Features
grand_parent: 🇺🇸 English
---

# Analytics & Usage

## Overview

Starnion provides two types of analytical information:

1. **Conversation Analytics**: Chat patterns, channel-level statistics, monthly trends
2. **LLM Usage**: Token consumption, call counts per model, estimated costs

This data helps you understand how actively you are using AI, which channels you use most, and how much LLM API cost you are incurring.

---

## Conversation Analytics

Access via **Settings > Analytics** or the API `GET /api/v1/analytics?user_id=<id>`.

### Summary Statistics

| Item | Description |
|------|-------------|
| Total messages | Total messages sent and received over all time |
| Messages this month | Number of messages in the current month |
| User messages | Number of messages sent by the user |
| AI messages | Number of messages responded by AI |
| Total conversations | Number of conversations (threads) created |
| Daily average messages | Daily average based on the past 30 days |
| Month-over-month (MoM) | Percentage change in messages vs. last month (%) |

### Channel Statistics

Shows usage broken down by Telegram and Web Chat.

```
Telegram messages:  ████████████ 156  (62%)
Web Chat messages:  ███████       96  (38%)
```

### Daily Message Trend

Visualizes the daily message count over the past 30 days as a graph. You can see which days of the week you use Starnion the most, or whether usage increased after a particular event.

### Hourly Distribution

Shows which hours of the day you chat most actively. Displayed as a 24-hour distribution, this lets you identify your morning, afternoon, and evening usage patterns.

### Weekly Pattern

Analyzes the average number of messages per day of the week. You can visually compare usage differences between workdays and weekends.

---

## LLM Usage

Access via **Settings > Usage** or the API `GET /api/v1/usage?user_id=<id>`.

### Usage Overview

Records token usage across all LLM calls.

| Item | Description |
|------|-------------|
| Total calls | Total number of LLM API calls |
| Total input tokens | Total tokens consumed by prompts |
| Total output tokens | Total tokens generated in AI responses |
| Total tokens | Input + output |
| Estimated total cost | USD amount based on per-token pricing |

### Usage by Model

Compares the usage of each LLM model.

```
Model               Calls     Input tokens   Output tokens   Est. cost
──────────────────────────────────────────────────────────────────────
gemini-2.0-flash    1,234     2,345,678       456,789        $0.23
gpt-4o-mini            89       123,456        45,678        $0.18
claude-haiku-3-5       12        34,567         8,901        $0.04
```

### Daily Usage Trend

Visualizes daily token usage over the past 30 days. Lets you quickly identify dates when costs spiked.

### Usage by Skill

Analyzes which features (skills) consume the most tokens.

```
Skill                Calls    Total tokens   Share
────────────────────────────────────────────────
General chat          892       1,234,567      54%
Budget analysis       234         456,789      20%
Document summary       89         234,567      10%
Web search             56         123,456       5%
Other                 ...             ...      11%
```

---

## Cost Reduction Tips

Practical ways to reduce your LLM API costs.

### 1. Choose the Right Model for the Task

There is no need to use the most powerful model for every conversation.

| Task Type | Recommended Model | Reason |
|-----------|-------------------|--------|
| Simple Q&A | Gemini 2.0 Flash | Fast and inexpensive |
| Everyday conversation | GPT-4o-mini | Low cost and sufficiently capable |
| Long document analysis | Gemini 1.5 Pro | Efficient handling of long contexts |
| Complex reasoning | Claude Opus (only when needed) | High cost — use only when necessary |

### 2. Take Advantage of the Gemini Free Tier

No cost is incurred as long as you stay within the Gemini API free quota (1,500 calls per day). Light personal use can be run entirely for free.

### 3. Optimize Context Length

As a conversation grows longer, the entire conversation history is consumed as tokens with every turn. When starting a new topic, creating a new conversation is more cost-efficient.

### 4. Be Mindful of Document Indexing Costs

Uploading documents consumes tokens for embedding generation. Frequently re-indexing large files will increase costs.

---

## Data Retention

- Conversation messages: Retained indefinitely
- LLM usage logs: Retained indefinitely
- Analytics aggregates: Calculated in real time (no separate cache)

---

## API Endpoints

### Conversation Analytics

```http
GET /api/v1/analytics?user_id=<uuid>
```

The response includes summary statistics, channel distribution, daily trend, hourly distribution, and day-of-week patterns.

### LLM Usage

```http
GET /api/v1/usage?user_id=<uuid>
```

The response includes total usage summary, breakdown by model, daily trend, and breakdown by skill.
