---
title: Search
nav_order: 7
parent: Features
grand_parent: 🇺🇸 English
---

# Search

Starnion provides two search modes. **Local search** quickly finds your own data (diary entries, memos, budget records, etc.), while **web search** retrieves up-to-date information from the internet. Both modes can also be used through natural language in AI chat.

---

## Top Search Bar

The search bar at the top of the screen lets you search your data instantly as you type.

### How to Use

1. Click the search icon (🔍) or the search input field at the top of the screen.
2. Type your search query.
3. Results appear in real time.
4. Click a result to navigate to that item.

### Search Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` (Windows/Linux) | Open search bar |
| `Cmd+K` (macOS) | Open search bar |
| `ESC` | Close search bar |
| `↑` `↓` | Navigate results |
| `Enter` | Go to selected item |

---

## Local Search

Searches within your own data. Results appear quickly without any external internet connection.

### What Is Searched

| Data Type | Searchable Content | Examples |
|-----------|-------------------|---------|
| **Diary** | Date, content, mood | "last week's diary", "a sad day" |
| **Memos** | Title, content, tags | "Python memo", "#work tag" |
| **Budget** | Item name, amount, date, category | "pork belly", "expenses over KRW 50,000" |
| **Documents** | Filename, document content | "contract", "2024 report" |
| **Chat history** | Previous chat content | "the recipe I asked about last time" |

### Search Examples

```
Query: "pork belly"
Results:
  📒 Budget    2024-03-15  Pork belly (with friends)  KRW 32,000
  📒 Budget    2024-02-28  Late-night pork belly place  KRW 18,000
  📔 Diary     2024-03-15  "Ate pork belly with friends..."

Query: "Python"
Results:
  📝 Memo     Python Basics Summary  #study #development
  📄 Document  Python_tutorial.pdf
  💬 Chat      "Tell me how to use Python list comprehensions..."
```

---

## Web Search

Starnion searches the internet for up-to-date information via the **Tavily API** and **Naver Search API**.

### Tavily Web Search

An AI-friendly search API that delivers highly relevant results even for complex questions.

**How to enable:** The server administrator sets `TAVILY_API_KEY` in `.env`, which automatically activates the `websearch` skill.

**Usage example:**

```
You:  Compare the latest AI models from 2024.
Bot:  [Searching the web...]
      Here is a summary of internet search results.

      GPT-4o (OpenAI): Multimodal support, fast responses...
      Gemini 1.5 Pro (Google): 1 million token context...
      Claude 3.5 Sonnet (Anthropic): Excellent coding performance...

      Sources: techcrunch.com, arxiv.org ...
```

### Naver Search

Search optimized for Korean-language content. Searches blogs, news, shopping, and Naver Knowledge iN (Q&A).

**How to enable:** Set `NAVER_CLIENT_ID` and `NAVER_CLIENT_SECRET` in `.env`, then activate the `naver_search` skill under Settings > Skills.

**Supported search types:**

| Type | Description | Example Request |
|------|-------------|-----------------|
| Blog | Naver blog search | "Find a blog post on how to make great kimchi stew" |
| News | Latest news | "Today's domestic economic news" |
| Shopping | Product and price comparison | "Tell me the lowest price for AirPods Pro" |
| Knowledge iN | Q&A search | "Find precautions for signing a lease on Naver Knowledge iN" |
| Local | Local information | "Find restaurants in Gangnam" |
| Books | Book search | "Tell me about the book Clean Code" |

---

## Search History

You can review your recent searches and results.

- After searching with the top search bar, results are automatically recorded.
- You can view or clear the full history under **Settings > Search History**.
- Search history can also be referenced in AI chat.

---

## Searching via AI Chat

Beyond the top search bar, you can make search requests in natural language directly in the chat window. The AI combines local search and web search as appropriate to answer your question.

### Searching Local Data (memory skill)

Query your own records in natural language.

```
You:  What did I eat last month?
Bot:  Here are your food expenses from last month (February 2024):
      - Feb 3:  Lunch (convenience store)  KRW 8,500
      - Feb 8:  Dinner (pork belly place)  KRW 22,000
      - Feb 14: Valentine's dinner (Italian)  KRW 67,000
      ...
      Total food expenses: KRW 312,400

You:  Find my Python-related memos.
Bot:  Found 3 Python-related memos:
      1. "Python Basics Summary" (2024-01-15, #study)
      2. "How to Use FastAPI" (2024-02-03, #development)
      3. "Pandas DataFrame Notes" (2024-02-18, #study)

You:  What was the estimate for the ceiling repair I mentioned before?
Bot:  Found in a conversation from January 15, 2024:
      "Ceiling repair estimate: KRW 2,500,000" is recorded.
```

### Web Search (websearch / naver_search skill)

```
You:  Tell me how to prevent rental scams (전세사기) these days.
Bot:  [Searching the web...]
      Here is the latest information on preventing rental scams:

      1. Always register your move-in date and get the official date stamp (확정일자)
      2. A lease-to-value ratio above 80% is a warning sign
      3. Check mortgage liens in the property registry
      ...

You:  Recommend a good place for lunch in Gangnam.
Bot:  [Searching Naver local listings...]
      Here are some Gangnam restaurants:

      1. OO Korean Table d'hôte — 2,400 blog reviews, rating 4.7
      2. XX Sushi — KRW 15,000 lunch special, reservations required
      ...
```

### Combined Local + Web Search

```
You:  Compare my food expenses this month with the Seoul average.
Bot:  I looked up your food expenses this month and searched the web for the Seoul average.

      Your food expenses this month: KRW 287,000
      Average monthly food expenses for Seoul workers: approx. KRW 350,000–400,000 (Source: ○○ Research Institute)

      Your food expenses are approximately 20% below the Seoul average.
```

---

## Semantic Search

Starnion's search goes beyond simple keyword matching to support **meaning-based (semantic)** search.

### What Is Semantic Search?

- Results appear even when the exact word you entered is **not present**, as long as the meaning is similar.
- Text is converted into vectors (embeddings) and stored in PostgreSQL (pgvector). At search time, similar vectors are retrieved.

### Semantic Search Examples

```
Query: "meals I had" (밥 먹은 거)
Actual matches: "lunch", "dinner out", "pork belly place", "Italian restaurant"
→ Finds food-related records even without the exact word

Query: "money I spent" (돈 나간 것)
Actual matches: "expense", "payment", "KRW 12,000", "purchase"
→ Finds financial records even without the exact word

Query: "a day I felt great" (기분 좋았던 날)
Actual matches: "today was really exciting", "a happy day", "feeling fantastic"
→ Understands the emotional expression and finds related diary entries
```

### Data with Semantic Search Applied

| Data | Embedding Applied | Notes |
|------|:-----------------:|-------|
| Daily conversation log | ✓ | Auto-saved after each conversation |
| Budget items | ✓ | Item name + category |
| Diary entries | ✓ | Full-text embedding |
| Memos | ✓ | Title + content |
| Document sections | ✓ | Per document chunk |
| Knowledge base | ✓ | Pattern analysis results |

---

## FAQ

**Q. How fast is local search?**
Most searches return results in under 100 ms. Semantic vector search may take slightly longer depending on the volume of data, but is typically under 1 second.

**Q. What do I do when search results are off-target?**
Enter more specific keywords, or specify a date and conditions in AI chat — for example, "lunch food expenses recorded in February 2024" — to get more accurate results.

**Q. Are web search results saved?**
Web search results themselves are not saved. However, they are retained as part of your chat history. You can then ask the AI something like "Show me the rental scam prevention tips you found before" and it will retrieve them from the chat history.

**Q. Can old data be searched?**
Yes. All data is stored permanently and is searchable. However, older data may receive a lower relevance score.

**Q. How do I search the content inside a file?**
Upload a PDF or Word file to Starnion and the `documents` skill will parse its content and store it in the vector database. You can then search by the file content using either the top search bar or AI chat.
