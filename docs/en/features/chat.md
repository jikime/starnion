---
title: AI Chat
nav_order: 1
parent: Features
grand_parent: 🇺🇸 English
---

# AI Chat

## Overview

Starnion's AI chat is the core feature that lets you converse in natural language with a LangGraph-based agent. Beyond simple question-and-answer, you can trigger a wide range of skills — expense tracking, schedule management, document analysis, image generation, weather lookup, and more — all from a single chat message.

The agent maintains conversational context and remembers what was said earlier in the thread, so it can answer follow-up questions naturally. Multimodal input (images, documents, audio) is also supported: attach a file and the AI will analyze or explain its contents.

---

## Chat Channel Comparison

Starnion provides two chat channels.

| Item | Web UI | Telegram |
|------|--------|----------|
| Access | Use directly in a browser | Chat with the bot in the Telegram app |
| File attachment | Drag & drop, clipboard paste | Use Telegram's file attachment feature |
| Conversation management | Conversation list, rename, search | Single thread (per channel) |
| Streaming responses | Real-time typing effect | Displayed all at once after receipt |
| Offline support | None (browser required) | Telegram app notifications supported |
| Recommended use | Long document work, file analysis | Quick lookups on the go, notifications |

---

## Basic Usage

### Starting Your First Conversation

To start a new conversation in the Web UI:

1. Click the **"+ New Chat"** button in the left sidebar.
2. Type a message in the chat input box and press Enter or the send button.
3. The AI's response is displayed as a real-time stream.

When you send your first message, a conversation title is generated automatically. For example, asking "What should I have for lunch today?" might produce a title like "Lunch Recommendations."

```
User: Hello! What's the weather like today?
AI:   Hello! Let me check the current weather in Seoul.
      🔧 Running `weather`...
      The current weather in Seoul is clear, 18°C.
      Air quality (fine dust) is at a moderate level.
```

### Continuing a Conversation

Selecting an existing conversation restores the previous context. Because the AI remembers everything said within the same thread, you can use references like "explain that again" or "record it with the amount you just mentioned."

```
User: I paid 4,500 won for an Americano
AI:   Recorded café Americano 4,500 won under Food & Drink ☕
      (March 8, 2025 · Card)

User: Actually, change the category from Food to Café
AI:   Done. Updated to the Café category.
```

### Managing the Conversation List

The left sidebar shows your recent conversations (up to 100), sorted by most recent activity.

- **Rename**: Click the edit icon next to a conversation title
- **Delete**: Select Delete from the menu next to a conversation
- **Search**: Search conversation titles or content in the top search bar

---

## File Attachments

### Attaching Images

When you attach an image, the AI performs visual analysis. A multimodal vision model reads the image and answers your questions about it.

**How to attach:**
- Click the 📎 icon to the left of the input box, then select a file
- Drag and drop an image into the input box
- Paste a copied image with Ctrl+V (or Cmd+V)

**Example:**
```
[Receipt image attached]
User: Record the contents of this receipt in my expense log
AI:   I've analyzed the receipt.
      - Starbucks Americano: 5,500 won
      - Sandwich: 6,800 won
      Shall I record a total of 12,300 won under Café?
```

Supported formats: JPEG, PNG, GIF, WebP

### Attaching Documents

Attach a PDF, Word file, text file, or other document and the AI will analyze, summarize, or answer questions about its contents.

```
[Contract.pdf attached]
User: Summarize the important clauses in this contract
AI:   I've analyzed the contract. Here are the key points:
      1. Term: April 1, 2025 – March 31, 2026
      2. Penalty clause: 20% of the remaining term amount upon early termination
      3. Auto-renewal: Automatically extended by 1 year unless notice is given 30 days before expiry
```

Supported formats: PDF, DOCX, TXT, MD, CSV

### Attaching Audio

Attach an audio file and the AI will transcribe the speech or analyze the content.

Supported formats: MP3, WAV, M4A, OGG

---

## Conversation Features

### Renaming a Conversation

A conversation title is generated automatically after the first message. You can also change it to any title you prefer.

- Click the edit (✏️) icon to the right of a conversation title in the sidebar
- Enter a new title and press Enter or the confirm button

### Deleting a Conversation

Hovering over a conversation item in the sidebar reveals a delete button. Deleted conversations cannot be recovered, and all message history in that thread is permanently removed.

### Searching Conversations

Enter a keyword in the top search bar to search conversation titles and message content. Clicking a result takes you directly to that conversation.

---

## Streaming Responses

Starnion streams AI responses in real time. Instead of waiting for the full response, words appear on screen as they are generated.

**How streaming works:**

```
AI SDK v6 SSE stream event order:

data: {"type":"start"}
data: {"type":"start-step"}
data: {"type":"text-start","id":"txt"}
data: {"type":"text-delta","id":"txt","delta":"Hello"}
data: {"type":"text-delta","id":"txt","delta":"!"}
data: {"type":"text-end","id":"txt"}
data: {"type":"finish-step"}
data: {"type":"finish","finishReason":"stop"}
data: [DONE]
```

When a tool (skill) is executing, its status is shown inline:

```
🔧 Running `weather`...
🔧 Running `finance_add`...
```

The maximum streaming wait time is **3 minutes**, after which the connection is automatically closed.

---

## WebSocket Connection

The Web UI uses WebSocket for real-time bidirectional communication. The full flow from connection to message delivery is shown below.

```
Browser                   Gateway (Go)               Agent (Python)
   |                          |                           |
   |-- WS connect request --> |                           |
   |<-- connection accepted --|                           |
   |                          |                           |
   |-- {method:"chat",        |                           |
   |    message:"Hello",      |                           |
   |    thread_id:"uuid"} --> |                           |
   |                          |-- gRPC ChatStream ------->|
   |                          |                           |-- LLM call
   |                          |                           |<-- token stream
   |                          |<-- TEXT event ------------|
   |<-- {event:"text",        |                           |
   |     text:"Hello"} -------|                           |
   |                          |<-- TEXT event ------------|
   |<-- {event:"text",        |                           |
   |     text:"!"} -----------|                           |
   |                          |<-- STREAM_END ------------|
   |<-- {event:"done"} -------|                           |
   |                          |                           |
```

**Connection maintenance:**
- Ping interval: server sends a ping every 50 seconds
- Pong timeout: connection closes if no response within 60 seconds
- Maximum message size: 64 KB
- Reconnection: browser attempts automatic reconnection

**Authentication & security:**
- When a WebSocket connection is established, conversation ownership is verified based on the user's ID.
- Attempts to access another user's conversation are immediately blocked.

---

## Context Retention (RAG 4-Layer Memory)

The Starnion agent manages conversational context across multiple layers.

```
[Message sent]
      |
      v
+------------------------+
| Layer 1: Short-term    |  Recent messages in the current conversation thread
| (In-Context)           |  → Managed via LangGraph thread_id
+------------------------+
      |
      v
+------------------------+
| Layer 2: Long-term     |  Permanent storage of important per-user information
| (Vector Store)         |  → Relevant memories retrieved via embedding search
+------------------------+
      |
      v
+------------------------+
| Layer 3: Tool results  |  Skill execution results (weather, expenses, etc.)
| (Tool Results)         |  → Automatically included in the current conversation
+------------------------+
      |
      v
+------------------------+
| Layer 4: User profile  |  Name, preferences, persona settings
| (User Profile)         |  → Provides baseline context for all conversations
+------------------------+
```

**Real-world context retention example:**

```
[Conversation 1 — one week ago]
User: I budget 100,000 won a month for transportation
AI:   Got it! I'll remember your 100,000 won transportation budget.

[Conversation 2 — today]
User: How much have I spent on transportation this month?
AI:   Let me check your transportation expenses for this month.
      🔧 Running `finance_summary`...
      Transportation expenses this month: 73,400 won (73.4% of 100,000 won budget)
      You still have 26,600 won left — great job managing it! 👍
```

Conversation history is managed by LangGraph's `thread_id`. A new thread is created each time you start a new conversation. Returning to a previous conversation restores the memory of that thread.

---

## Tips & Examples

### Getting the Most Out of AI Chat

**Be specific:**

Good example:
```
User: Tonight I paid 18,000 won cash for samgyeopsal (Korean BBQ). Record it under Food.
```

Less effective:
```
User: I had dinner
```

**Handle multiple items at once:**
```
User: Summarize today's expenses.
      Café Americano 4,500 won, lunch 8,000 won, convenience store 3,200 won

AI:   Three entries recorded.
      - Café / Americano / 4,500 won ☕
      - Food / Lunch / 8,000 won 🍱
      - Food / Convenience store / 3,200 won 🏪
      Total spent today: 15,700 won
```

**Specifying a date:**
```
User: I watched a movie yesterday. It was 15,000 won for the ticket.
AI:   Recorded March 7 · Entertainment/Movie · 15,000 won 🎬
```

### More Example Conversations

**Weather check:**
```
User: Do I need an umbrella tomorrow?
AI:   Let me check tomorrow's weather in Seoul.
      🔧 Running `weather`...
      Rain is expected from tomorrow afternoon (March 9th) onward. 🌧️
      I'd recommend bringing an umbrella!
```

**Monthly expense summary:**
```
User: How much have I spent this month?
AI:   🔧 Running `finance_summary`...
      March spending (1st–8th):
      - Food:          42,500 won
      - Café:          18,000 won
      - Transportation: 15,400 won
      - Total:         75,900 won

      You've spent 12.3% more than the same period last month.
      The main driver is increased food spending.
```

**Image analysis:**
```
[Photo of food attached]
User: How many calories is this?
AI:   I analyzed the photo.
      It looks like bibimbap. A standard single serving is typically
      around 500–600 kcal, though it varies depending on the amount of sesame oil used!
```

**Document summary:**
```
[Report.pdf attached]
User: Summarize the key points in 3 lines
AI:   Sure, here's the document summarized in 3 lines.
      1. Revenue in 2024 grew 23% year-over-year, led primarily by the online channel.
      2. Customer satisfaction reached an all-time high of 92 points.
      3. The 2025 targets are entering new markets and relaunching the mobile app.
```

---

## 💬 Telegram Usage Examples

> Just talk to Nion in natural language. No special commands needed — chat like you normally would!

### Casual Conversation

```
The weather's great today! Any suggestions for what to do?
```
→ Nion recommends activities suited to the weather

```
I've been really stressed out lately
```
→ Nion empathizes and suggests stress relief methods

### Asking Questions

```
How do I make a delicious kimchi stew?
```
→ Provides a step-by-step recipe

```
What's the weather like in Seoul this week?
```
→ Shares weather information

### File Attachments

```
[Attach photo] Organize this receipt for me
```
→ Analyzes the receipt and automatically records the expenses

```
[Voice message] (meeting recording)
```
→ Transcribes the audio to text and summarizes it

---

## Frequently Asked Questions

**Q. How long are conversations stored?**

A. Conversations are permanently stored in the server database and are retained unless you delete them. However, only the most recent 100 conversations are displayed in the conversation list.

**Q. The AI doesn't seem to remember our previous conversation.**

A. Starting a new conversation separates it from previous threads. To continue a past conversation, select it from the sidebar. Context is maintained within the same conversation thread.

**Q. Is there a file size limit for attachments?**

A. The current maximum is 20 MB per file. For larger files, we recommend compressing or splitting them before uploading.

**Q. The response stopped mid-stream or got cut off.**

A. The maximum streaming wait time is 3 minutes. Complex tasks may take time. Check your network connection or refresh the page and try again.

**Q. Can I have multiple conversations going at the same time?**

A. Yes, you can have different conversations in multiple browser tabs. However, only one WebSocket connection is maintained per user, so opening a connection in a new tab may interrupt real-time streaming in an existing tab.

**Q. Are Telegram and web UI conversations linked?**

A. Currently, each channel manages independent threads. Telegram conversations and web UI conversations are stored separately.

**Q. Which AI model is used?**

A. The default configured model is used. You can change it to your preferred model in Settings. The list of available models can be found under Settings > Models.
