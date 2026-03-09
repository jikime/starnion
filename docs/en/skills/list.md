---
title: Skill List
nav_order: 2
parent: Skills
grand_parent: 🇺🇸 English
---

# Skill List

Starnion currently has **34** built-in skills. Each skill is an independent module that can be individually enabled or disabled as needed.

---

## Finance

| Skill ID | Skill Name | Description | Example Commands | Enabled by Default |
|----------|------------|-------------|------------------|--------------------|
| `finance` | Expense Tracker | Automatically records income and expenses and retrieves monthly totals. | `lunch 12,000 won`, `how much did I spend this month?` | ✓ |
| `budget` | Budget Manager | Set monthly budgets by category and view usage. | `set food budget 300,000 won`, `how much budget is left?` | ✓ |
| `pattern` | Spending Pattern Analysis | Automatically analyzes spending tendencies by day of the week, recurring charges, and anomalous spending in the background. | `what are my spending patterns?`, `any unusual expenses?` | ✓ |
| `proactive` | Proactive Notifications | AI-initiated alerts for budget overruns, anomalous spending, etc. | (sent automatically, no direct invocation) | ✓ |
| `currency` | Exchange Rate | Look up real-time exchange rates and convert currencies. | `tell me the dollar exchange rate`, `how much is 100 dollars in won?` | ✓ |

---

## Personal

| Skill ID | Skill Name | Description | Example Commands | Enabled by Default |
|----------|------------|-------------|------------------|--------------------|
| `diary` | Diary | Records daily life, emotions, and thoughts. Responds to non-financial messages. | `I'm feeling really awful today`, `the meeting ran long` | ✓ |
| `memo` | Memo | Save, view, and delete memos with titles and tags. | `memo to buy milk`, `show only work memos` | ✓ |
| `goals` | Goal Manager | Set financial goals, to-dos, habits, and personal goals; track progress. | `keep food spending under 300,000 this month`, `I achieved my goal!` | ✓ |
| `dday` | D-Day | Track the number of days remaining until important dates; supports yearly recurrence. | `set a D-Day for Christmas`, `show my D-Days` | ✓ |
| `reminder` | Reminder | Schedule a one-time alert at a specific time. | `remind me about my meeting tomorrow at 9 AM` | ✓ |
| `schedule` | Schedule Alerts | Create and manage regular or one-time alert schedules. | `remind me of weekly spending every Friday at 8 PM` | ✓ |
| `memory` | Memory Search | Unified semantic search across past conversations, expense records, diary entries, and documents. | `what did I eat last week?`, `remember what I said last time?` | ✓ |

---

## Media

| Skill ID | Skill Name | Description | Example Commands | Enabled by Default |
|----------|------------|-------------|------------------|--------------------|
| `image` | Image Analysis & Generation | Analyze images, generate and edit with AI; supports automatic expense extraction from receipts. | `analyze this image`, `create an image of a cat`, `change the background to the ocean` | ✓ |
| `audio` | Voice Conversion | Speech-to-text (STT) and text-to-speech (TTS) conversion. | `convert this voice to text`, `read this sentence aloud` | ✓ |
| `video` | Video Analysis & Generation | Summarize video content and generate AI image slideshow videos. | `summarize this video`, `make a video about space travel` | - |
| `documents` | Document Manager | Parse PDF, Word, Excel, and other documents, store them in the vector DB, and generate new documents. | `summarize this contract`, `create this report as a PDF` | ✓ |
| `qrcode` | QR Code Generator | Generate QR code images from URLs or text. | `make a QR code for this URL`, `create a Wi-Fi QR code` | ✓ |

---

## Search

| Skill ID | Skill Name | Description | Example Commands | Enabled by Default |
|----------|------------|-------------|------------------|--------------------|
| `websearch` | Web Search | Search the internet for up-to-date information and fetch webpage content via the Tavily API. | `tell me today's news`, `summarize this article: https://...` | ✓ |
| `naver_search` | Naver Search | Search shopping, blogs, news, books, Knowledge iN, local results, and more via the Naver Open API. | `find restaurants in Gangnam on Naver`, `search for the lowest iPhone price` | - |
| `weather` | Weather | View current weather and forecasts. | `how's the weather?`, `Seoul weather tomorrow`, `Tokyo weather this week` | ✓ |
| `summarize` | Summarize | AI-powered summarization of URL web pages or text; supports concise/detailed/bullet-point styles. | `summarize this link: https://...`, `summarize in 3 key points` | ✓ |

---

## Utilities

| Skill ID | Skill Name | Description | Example Commands | Enabled by Default |
|----------|------------|-------------|------------------|--------------------|
| `calculator` | Calculator | Calculate mathematical expressions; supports sin/cos/log and other math functions. | `calculate 2+3*4`, `square root of 144`, `what is sin(pi/2)?` | ✓ |
| `translate` | Translate | Translate text into a specified language; supports automatic language detection. | `translate this to English`, `Translate this to Korean` | ✓ |
| `timezone` | World Time | View current time in cities around the world and convert between time zones. | `what time is it in London?`, `if it's 14:30 in Seoul, what time is it in New York?` | ✓ |
| `unitconv` | Unit Converter | Convert length, weight, temperature, volume, area, and data units. | `how many miles is 10 km?`, `how many square meters is 30 pyeong?` | ✓ |
| `color` | Color Converter | Interconvert HEX, RGB, and HSL color codes. | `tell me about the color #FF5733`, `what is the RGB value of red?` | ✓ |
| `encode` | Encoding | Base64, URL, and HTML encoding and decoding. | `encode Hello World in Base64`, `decode this URL` | ✓ |
| `hash` | Hash | Generate MD5, SHA-1, SHA-256, and SHA-512 hash values. | `create a SHA256 hash of this text` | ✓ |
| `wordcount` | Word Count | Analyze character count, word count, sentence count, line count, and byte count. | `count the characters in this text`, `tell me how many words there are` | ✓ |
| `random` | Random | Random selection, number drawing, coin flip, dice roll, and random string generation. | `choose between jajangmyeon and jjamppong`, `draw 6 numbers from 1–45`, `generate a password` | ✓ |
| `ip` | IP Lookup | Look up location and ISP information for an IP address or domain. | `where is 8.8.8.8?`, `tell me my public IP`, `where is the google.com server?` | ✓ |

---

## Integrations

| Skill ID | Skill Name | Description | Example Commands | Enabled by Default |
|----------|------------|-------------|------------------|--------------------|
| `google` | Google Integration | Integrates Google Calendar, Docs, Tasks, Drive, and Gmail; requires OAuth2 authentication. | `connect Google`, `add a 3 PM doctor appointment tomorrow`, `show received mail` | - |
| `browser` | Browser Control | Automated web browser control: URL navigation, clicking, screenshots. | `search for today's weather on Naver`, `take a screenshot of this site` | - |

---

## Misc

| Skill ID | Skill Name | Description | Example Commands | Enabled by Default |
|----------|------------|-------------|------------------|--------------------|
| `horoscope` | Horoscope | View today's horoscope for any of the 12 zodiac signs. | `tell me the Leo horoscope for today`, `what's the Pisces horoscope?` | ✓ |

---

## Skill Activation Summary

| Status | Number of Skills |
|--------|-----------------|
| Enabled by default (✓) | 29 |
| Opt-in required | 5 (`video`, `naver_search`, `google`, `browser`, + some skills requiring external APIs) |
| **Total** | **34** |

---

## Required Permissions per Skill

Some skills require external API keys or OAuth authentication.

| Skill | Required Configuration | Where to Configure |
|-------|----------------------|-------------------|
| `weather` | Weather API key | Server `.env` |
| `websearch` | Tavily API key | **Settings > Integrations** |
| `naver_search` | Naver Client ID / Secret | **Settings > Integrations** |
| `google` | Google OAuth2 authentication | **Settings > Integrations** |
| `image` | Gemini API key (for image generation) | **Settings > Models** |
| `audio` | Gemini API key (for TTS) | **Settings > Models** |
| `currency` | Exchange rate API (Frankfurter, free) | Automatic |
| `browser` | Playwright installation required | Server environment |

---

## Invoking Skills with Natural Language

You do not need to mention a skill name directly. Just speak naturally and the AI will automatically select the appropriate skill.

```
Me: How much is 50,000 won in dollars?
Bot: At the current exchange rate (1,340 KRW/USD), 50,000 won ≈ 37.31 USD.

Me: What time is it in London?
Bot: Current time in London (GMT) is 6:42 AM.

Me: I'm feeling really terrible today. My manager scolded me.
Bot: That sounds like a rough day. I've recorded it in your diary.

Me: Remind me about my doctor's appointment tomorrow at 3 PM.
Bot: Set a reminder for "Doctor's appointment" at 3 PM tomorrow.

Me: Draw 6 lottery numbers from 1 to 45.
Bot: 🎰 Results: 7, 14, 23, 31, 38, 42

Me: What's in this image? (attach photo)
Bot: It appears to be a coffee shop receipt — an Americano for 4,500 won. Shall I record this in your expense tracker?

Me: Summarize https://news.ycombinator.com.
Bot: I've summarized that page. Current top posts: ...
```

---

## Combining Multiple Skills

A single message can trigger multiple skills in sequence.

| Example | Skills Activated |
|---------|-----------------|
| Send a receipt photo | `image` → extract amount → `finance` → record automatically |
| Voice message "lunch 10,000 won" | `audio` → transcribe → `finance` → record in expense tracker |
| "Any unusual spending patterns?" | `pattern` analysis result → `memory` search → response |
| "Create this report as a PDF" | LLM writes content → `documents` → deliver PDF file |

---

## Upcoming Skills

| Skill | Description | Status |
|-------|-------------|--------|
| `notion` | Notion workspace integration | In development |
| `slack` | Slack channel message integration | Planned |
| `github` | GitHub issues, PRs, and code search | Planned |
