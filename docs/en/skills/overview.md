---
title: Skills System
nav_order: 1
parent: Skills
grand_parent: 🇺🇸 English
---

# Skills System

Skills are the capability modules of the Starnion AI agent. Each skill is an independent tool responsible for a specific function that can be toggled on or off as needed.

---

## What Are Skills?

Skills are functional units that allow the AI to actually **execute** things, not just hold conversations.

For example:
- `What's the weather?` → the **weather** skill calls the weather API
- `Lunch 12,000 won` → the **finance** skill records it in the expense tracker
- `Receipt photo` → the **image** skill extracts the amount → the **finance** skill records it automatically

Even if the user does not explicitly mention a skill name, the AI reads the context and automatically selects the appropriate skill.

---

## Enabling / Disabling Skills

You can toggle each skill individually under **Settings > Skills**.

- A disabled skill will not be executed even if the AI receives a relevant request.
- Some core skills (system skills) cannot be disabled.
- Skill settings are saved per account.

---

## Skill Detail Panel

Each skill card in **Settings > Skills** has an **ⓘ** button. Clicking it opens a side panel showing:

- **Description** — what the skill does
- **Trigger Keywords** — words in your message that activate this skill automatically
- **Usage Examples** — copy-and-paste examples you can send directly to the chat

You can also enable or disable a skill directly from the detail panel.

---

## Full Skill List

### Finance

| Skill ID | Skill Name | Description | Enabled by Default |
|----------|------------|-------------|--------------------|
| `finance` | Expense Tracker | Automatically records income and expenses. Responds to messages like "lunch 12,000 won" or "got paid" | ✓ |
| `budget` | Budget Manager | Set monthly budgets by category, modify them, and view usage | ✓ |
| `pattern` | Spending Pattern Analysis | Automatically analyzes spending tendencies by day of the week, recurring charges, and spending pace in the background | ✓ |
| `proactive` | Proactive Notifications | AI-initiated alerts for budget overruns, anomalous spending, etc. | ✓ |
| `currency` | Exchange Rate | Real-time exchange rate lookup and currency conversion | ✓ |

### Personal

| Skill ID | Skill Name | Description | Enabled by Default |
|----------|------------|-------------|--------------------|
| `diary` | Diary | Records daily life, emotions, and thoughts. Responds to non-financial messages like "I feel great today" or "the meeting ran long" | ✓ |
| `memo` | Memo | Save memos with titles and tags, view and delete the list | ✓ |
| `goals` | Goal Manager | Set financial goals, to-dos, habits, and personal goals; track progress | ✓ |
| `dday` | D-Day | Track days remaining until important dates; supports yearly recurrence | ✓ |
| `reminder` | Reminder | Schedule a one-time alert at a specific time. "Remind me of my meeting tomorrow at 9 AM" | ✓ |
| `schedule` | Schedule | Create and manage regular or one-time alert schedules; supports recurring alerts | ✓ |
| `memory` | Memory Search | Unified semantic search across past conversations, expense records, diary entries, and documents | ✓ |

### Media

| Skill ID | Skill Name | Description | Enabled by Default |
|----------|------------|-------------|--------------------|
| `image` | Image Analysis & Generation | Analyze images, generate and edit AI images, automatically parse receipts | ✓ |
| `audio` | Voice Conversion | Speech-to-text (STT) and text-to-speech (TTS) conversion | ✓ |
| `video` | Video Analysis | Summarize video content, describe scenes, generate AI image slideshow videos | - |
| `documents` | Document Manager | Parse PDF/Word documents and store in vector DB; generate new documents | ✓ |
| `qrcode` | QR Code Generator | Generate QR code images from URLs or text | ✓ |

### Search

| Skill ID | Skill Name | Description | Enabled by Default |
|----------|------------|-------------|--------------------|
| `websearch` | Web Search | Search the internet for up-to-date information and fetch webpage content via Tavily API | ✓ |
| `naver_search` | Naver Search | Search shopping, blogs, news, books, Knowledge iN, and local results via Naver Open API | - |
| `weather` | Weather | View current weather and forecasts | ✓ |
| `summarize` | Summarize | AI-powered summarization of URL web pages or text; supports concise/detailed/bullet-point styles | ✓ |

### Utilities

| Skill ID | Skill Name | Description | Enabled by Default |
|----------|------------|-------------|--------------------|
| `calculator` | Calculator | Calculate mathematical expressions; supports sin/cos/log and other math functions | ✓ |
| `translate` | Translate | Translate text into a specified language; supports automatic language detection | ✓ |
| `currency` | Currency Converter | Currency conversion based on real-time exchange rates | ✓ |
| `timezone` | World Time | View current time in cities around the world and convert between time zones | ✓ |
| `unitconv` | Unit Converter | Convert length, weight, temperature, speed, area, and other units | ✓ |
| `color` | Color Converter | Interconvert HEX, RGB, and HSL color codes | ✓ |
| `encode` | Encoding | Base64, URL, and HTML encoding and decoding | ✓ |
| `hash` | Hash | Generate MD5, SHA-1, and SHA-256 hash values | ✓ |
| `wordcount` | Word Count | Analyze character count, word count, sentence count, and byte count | ✓ |
| `random` | Random | Random selection, number drawing, coin flip, dice roll | ✓ |
| `ip` | IP Lookup | Look up location and ISP information for an IP address or domain | ✓ |

### Integrations

| Skill ID | Skill Name | Description | Enabled by Default |
|----------|------------|-------------|--------------------|
| `google` | Google Integration | Integrates Google Calendar, Docs, Tasks, Drive, and Gmail; requires OAuth2 authentication | - |
| `browser` | Browser Control | Automated web browser control: URL navigation, clicking, screenshots, page reading | - |
| `notion` | Notion Integration | Search, create, and read Notion pages; append blocks; query databases; update properties. Requires Integration Token. | - |
| `github` | GitHub Integration | Browse repositories, issues, and PRs; create issues; search code. Requires Personal Access Token. | - |

### Misc

| Skill ID | Skill Name | Description | Enabled by Default |
|----------|------------|-------------|--------------------|
| `horoscope` | Horoscope | View today's horoscope for any of the 12 zodiac signs | ✓ |

### System

| Skill ID | Skill Name | Description | Enabled by Default |
|----------|------------|-------------|--------------------|
| `usage` | Usage Summary | View AI usage statistics — request count, tokens, cost, per-model or daily breakdown | ✓ |

### Development

| Skill ID | Skill Name | Description | Enabled by Default |
|----------|------------|-------------|--------------------|
| `coding_agent` | Coding Agent | Delegate coding tasks to Claude Code CLI: implement features, refactor, write tests, generate README | - |

---

## Invoking Skills with Natural Language

You do not need to name a skill explicitly. Just speak naturally and the AI will select the appropriate skill.

```
Me: How much is 50,000 won in dollars?
Bot: At the current exchange rate (1,340 KRW/USD), 50,000 won ≈ 37.31 USD.

Me: What time is it in London right now?
Bot: Current time in London (GMT) is 6:42 AM.

Me: I'm feeling really terrible today. My manager scolded me.
Bot: That sounds like a rough day. I've recorded it in your diary.

Me: Remind me about my doctor's appointment tomorrow at 3 PM.
Bot: Set a reminder for "Doctor's appointment" at 3 PM tomorrow.

Me: What's in this image? (attach photo)
Bot: I analyzed the image. It appears to be a coffee shop receipt — an Americano for 4,500 won.

Me: Summarize https://news.ycombinator.com.
Bot: I've summarized that page. Current top posts: ...
```

---

## Skill Permissions

Some skills require external API keys or OAuth authentication.

| Skill | Required Configuration |
|-------|----------------------|
| `weather` | Weather API key (environment variable) |
| `websearch` | Tavily API key |
| `naver_search` | Naver Client ID / Secret |
| `google` | Google OAuth2 authentication complete |
| `image` | OpenAI API key (for image generation) |
| `currency` | Exchange rate API key |
| `notion` | Notion Integration Token |
| `github` | GitHub Personal Access Token |
| `coding_agent` | Claude Code CLI (server environment) |

API key configuration is handled by the server administrator in the `.env` file.

---

## Upcoming Skills (Phase 2)

The following skills are in the development roadmap:

| Skill | Description |
|-------|-------------|
| `video` | Real-time streaming analysis |
| `slack` | Slack channel integration |

---

## FAQ

**Q. Is data from a disabled skill deleted?**
No. Disabling a skill does not delete existing data. Re-enabling it restores access to all previous data.

**Q. What are system skills?**
Skills such as `memory` and `proactive` that are required for the agent's core operations. These skills cannot be disabled.

**Q. Can multiple skills be used simultaneously?**
Yes. A single message can trigger multiple skills in sequence. For example, sending a receipt image causes the `image` skill to recognize the amount, and the `finance` skill to automatically record it in the expense tracker.
