---
title: Diary
nav_order: 3
parent: Features
---

# Diary

## Overview

Starnion's diary feature is more than a simple text log — it is a personal journal where the AI understands and remembers your emotions and daily life. Talk about your day the way you would in conversation, and the AI automatically analyzes your mood, records it, and brings it back when you ask "how was I feeling back then?"

> The diary is a core source for AI memory. What you record is used to help the AI understand you better.

---

## Writing a Diary Entry

### Writing on the Web

1. Click **Diary** in the sidebar.
2. Click the **+ New Entry** button in the upper right.
3. Enter a title (optional), content, and emotion tag.
4. Click **Save**.

The date defaults to today, but you can click the calendar icon to change it to a past date.

### Writing via Chat

Just talk about your day naturally in the chat box and the AI will automatically record it as a diary entry. No special command needed.

**Example conversations:**

> User: "The team presentation went better than expected today. I was nervous, but I'm relieved."
>
> AI: "I'm glad it went well! You overcame the nerves and got a great result. I've recorded it in today's diary 😊"

> User: "Write a diary entry for today — I almost overslept and was late this morning, but I had lunch at a new pasta place and it was great."
>
> AI: "Recorded! The pasta place sounds delicious — you'll probably want to go back. Hope you have a good rest of your day."

**Tip:** Messages that include a monetary amount (e.g., "I spent 12,000 won on lunch") are automatically classified as expense entries and will not be saved as diary entries.

---

## Diary Entry Structure

Each diary entry consists of the following fields:

| Field | Description | Example |
|-------|-------------|---------|
| **Date** | Date the entry was written (YYYY-MM-DD) | 2025-03-08 |
| **Title** | A brief title (optional) | Team presentation success |
| **Content** | The body of the entry | The presentation went really well today... |
| **Emotion** | Mood classified by AI or selected manually | great |
| **Tags** | Topic-based classification tags | #work #achievement |

### Emotion Classification

The AI automatically classifies each entry into one of five emotions based on the content:

- **great** — achievement, excitement, thrill ("Nailed the presentation!", "I passed!")
- **good** — happiness, satisfaction, gratitude ("A relaxing day", "Delicious dinner")
- **okay** — an ordinary day with no particular emotional shift
- **tired** — exhaustion, drowsiness, physical fatigue ("Overtime", "Wiped out after exercising")
- **bad** — sadness, anger, disappointment, stress ("We argued", "I'm really disappointed")

You can also change the emotion manually in the web editor.

---

## Viewing Diary Entries

### List View

The diary screen on the web shows all entries in reverse chronological order. Fifty entries are displayed per page, and you can navigate to older entries using pagination.

### Searching by Date

Use the monthly filter to view entries from a specific month:

- Select **Year** and **Month** from the dropdown at the top
- All entries for that month are shown in reverse date order

### Viewing via Chat

> User: "Show me last week's diary entries"
>
> AI: "Here are last week's entries:\n- 3/3 (Mon): Team meeting, mood: okay\n- 3/5 (Wed): Dinner with a friend, mood: good\n- 3/7 (Fri): End-of-week wrap-up, mood: tired"

> User: "Show me all my March diary entries"
>
> AI: "Here's your March diary list. There are 12 entries in total..."

---

## AI Analysis

### Understanding Emotion Patterns

Weekly reports include the emotional flow for that week. Based on diary data, the AI analyzes which emotions appeared most often and whether there are patterns on specific days.

**Example analysis result:**
```
This week's emotion summary:
- great: 2 times, good: 3 times, okay: 1 time, tired: 1 time
- Weekdays (Mon–Fri) showed more tiredness; weekends showed more good moods.
- Overall emotional state has improved compared to last week!
```

### Finding High-Stress Days

> User: "When was I stressed?"
>
> AI: "Days recorded with 'bad' mood:\n- 2025-02-14: Overtime, work pressure\n- 2025-02-28: Failed an important presentation\n- 2025-03-03: Conflict with a team member"

---

## Using Entries as Memories

What you record in your diary is stored in the AI's long-term memory. This means the AI can remember relevant details and give contextually appropriate responses days or even months later.

**Memory usage example:**

> User: (3 months later) "Do you remember when I said I went to that pasta place?"
>
> AI: "Of course! On March 8th you visited a newly opened pasta place and said it was great."

**What gets stored as memory:**
- Places, people, and events mentioned in diary entries
- Emotion patterns that appear repeatedly
- Things the user considers important

**What does not get stored as memory:**
- Monetary information (classified separately into the expense tracker)
- Memos with no emotional content — just a list of facts (use the Memo feature instead)

---

## Example Conversations

```
User: I worked out for a full hour today for the first time. It was tough but I feel accomplished.
AI: Amazing! You did a full hour of exercise for the first time. I can feel that sense of pride.
    I've recorded today's entry with the emotion 'great'. Keep it up tomorrow! 💪

User: What days was I in a good mood last month?
AI: Diary entries from last month (February) recorded with 'great' or 'good':
    - 2/8: Met up with a friend after a long time
    - 2/15: Finished a project
    - 2/22: Family gathering

User: How many diary entries do I have from February?
AI: You have 18 diary entries from February.
    Emotion breakdown: great 4, good 7, okay 4, tired 2, bad 1
```

---

## Tips & FAQ

**Q. How are diary entries different from memos?**
A diary entry is a personal journal for recording emotions and daily life. The AI analyzes the emotion and saves it to long-term memory. A memo is a simple, tag-based information store with no emotion analysis.

**Q. Can I write more than one diary entry per day?**
Yes, you can write multiple entries for the same date. If you share things through chat multiple times throughout the day, each message is recorded as a separate diary entry.

**Q. Can I write a diary entry for a past date?**
You can change the date directly in the web editor to write an entry for a past date. In chat, say something like "this happened yesterday..." or specify the date, and it will be recorded on that date.

**Q. If I delete a diary entry, will it also disappear from the AI's memory?**
Deleting an entry removes it from your list. Content that was already stored in AI memory may partially remain depending on when the weekly report was generated.

**Q. Is there a rule for what gets automatically recorded as a diary entry from chat?**
Messages containing emotions or daily life experiences are automatically saved as diary entries. Monetary information is classified as expense data, and information worth keeping for reference is classified as a memo.
