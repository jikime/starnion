---
title: Goal Tracking
nav_order: 4
parent: Features
---

# Goal Tracking

## Overview

Starnion's goal tracking feature is an AI-powered system that helps you systematically track and achieve both big and small everyday goals. Rather than simply listing tasks, the AI follows your progress alongside you, offering encouragement and analyzing how things are going.

Supported goal types:
- **Tasks / Projects** — one-off items with a deadline (submit a report, complete a project)
- **Habits** — actions repeated daily (exercise, reading, meditation)
- **Savings goals** — accumulating a specific amount (travel fund, emergency fund)
- **Spending limits** — keeping spending within a budget (food budget of 300,000 won this month)
- **General goals** — personal goals that don't fit the above categories

---

## Creating a Goal

### Creating on the Web

1. Click **Goals** in the sidebar.
2. Click the **+ New Goal** button.
3. Fill in the following fields:
   - **Goal name** (required): a brief description of what you want to achieve
   - **Icon**: an emoji representing the goal (default 🎯)
   - **Category**: Health, Finance, Self-improvement, Work, etc.
   - **Target value**: the number that defines completion (e.g., 30 times, 100,000 won)
   - **Unit**: times, days, won, km, etc.
   - **Start date / End date**: set the period
   - **Description**: additional notes about the goal (optional)

### Creating via Chat

Talk naturally and the AI will set up the goal automatically. It is saved immediately without a confirmation step.

**Example conversations:**

> User: "Set my reading goal for this month to 5 books"
>
> AI: "Goal saved! You've set a goal to read 5 books this month. Rooting for you 📚"

> User: "I've decided to exercise every morning"
>
> AI: "What a great habit goal! I've saved the 'Exercise every morning' goal. Starting today 💪"

> User: "I'm going to keep my food spending under 300,000 won this month"
>
> AI: "Financial goal saved! Your goal is to stay under 300,000 won on food this month. Let's manage it together 👍"

**Trigger patterns** — a goal is automatically created when any of the following phrases appear:

| Example phrase | Goal type |
|----------------|-----------|
| "I decided to do X", "Set a goal to X" | General / Habit |
| "I need to do X every day" | Habit |
| "I need to finish X this week" | Task |
| "I'm going to save X", "I'll spend no more than X" | Finance |
| "I decided to save up X" | Savings |

---

## Check-in System

Check-ins are especially important for habit-type goals. Record daily whether you met the goal to build a consecutive streak.

### How to Check In

**On the web:**
1. Find the goal card in your goal list.
2. Click the **Check in today** button at the bottom of the card.
3. The check-in is confirmed and the streak is updated.

**Via chat:**

> User: "I worked out today"
>
> AI: "Awesome! Today's workout goal check-in is done. Current streak: 7 days in a row 🔥"

> User: "Check reading goal for today"
>
> AI: "Checked in! Reading progress this month: 3/5 books (60%)"

### Streak Counter

A streak is the number of consecutive days you have checked in. Even if you missed yesterday, checking in today keeps your streak alive (one-day grace period).

| Streak | Status |
|--------|--------|
| 0 days | Not started or reset |
| 1–6 days | Getting started |
| 7–29 days | On a roll 🔥 |
| 30+ days | Habit formed 🏆 |

Missing two or more consecutive check-ins resets the streak to zero.

---

## Evaluating Goals

### Updating Progress

For numerical goals (savings, spending, etc.) you can update the progress directly.

> User: "I've hit 50% of my travel savings goal"
>
> AI: "You're halfway there! I've updated the travel savings goal to 50%. Halfway to the finish line ✈️"

> User: "Exercise goal progress is at 70%"
>
> AI: "Impressive! I've updated the exercise goal progress to 70%. Looks like you'll hit it within the month!"

### Changing Goal Status

A goal can have one of three statuses:

| Status | Meaning | How to change |
|--------|---------|---------------|
| `In progress` | Currently working on it | Default status |
| `Achieved` | Goal completed | "I achieved it", "I succeeded", "Done" |
| `Abandoned` | No longer pursuing | "I'll quit", "I'll stop", "Cancel it" |

> User: "I finished all 5 books for my reading goal!"
>
> AI: "Congratulations! 🎉 You've achieved your reading goal for this month! You read all 5 books. That's incredible!"

---

## Notifications

Goal-related notifications are delivered through weekly reports. As a set end date approaches, the AI will automatically remind you in chat.

**Automatic notification triggers:**
- 7 days before the end date: "7 days left until your goal deadline"
- 1 day before the end date: "Your goal deadline is tomorrow"
- Streak at risk: "You missed yesterday's check-in — check in today to keep your streak alive"

---

## Integration with Weekly Reports

Each week's automatically generated report includes a goal status section:

```
[This Week's Goal Status]
Goals in progress: 3
- Daily exercise (streak: 5 days) — 5/7 days checked in this week
- Read 5 books (60% complete) — 3/5 books done, deadline in 18 days
- Food spending limit (45% complete) — 135,000 won remaining in budget

Achieved this week: none
New this week: Read 5 books (started 3/1)
```

---

## Goal Examples

### Exercise Habit

```
Goal name: Exercise 30 minutes every day
Category: Health
Icon: 🏃
Target value: 30 (days)
Unit: days
Start date: 2025-03-01
End date: 2025-03-31
```

Chat: "I went jogging for 30 minutes today" → automatic check-in

### Reading Goal

```
Goal name: Read 5 books this month
Category: Self-improvement
Icon: 📚
Target value: 5 (books)
Unit: books
End date: End of this month
```

Chat: "I finished volume 1 of Land" → progress update

### Savings Goal

```
Goal name: Save up for a Europe trip
Category: Finance
Icon: ✈️
Target value: 3,000,000 (won)
Unit: won
End date: 2025-12-31
```

Chat: "I saved 500,000 won this month" → progress update

---

## Tips & FAQ

**Q. How many goals can I have at one time?**
You can manage up to 20 goals in progress simultaneously. There is no limit on achieved or abandoned goals.

**Q. If my streak breaks, do I have to start from zero?**
Yes, a broken streak resets to zero. However, if you miss yesterday's check-in but check in today, tomorrow's check-in will preserve the streak (one-day grace period policy).

**Q. Are numeric values set automatically when I create a goal via chat?**
Habit goals like "exercise every day" are automatically set with a unit of 'days'. If a specific number is mentioned — like "read 5 books" — the target value is also set automatically.

**Q. How do I view completed goals?**
Select **Completed** from the filter at the top of the Goals screen to see your achieved goals. In chat, just say "show me my achieved goals."

**Q. Don't financial goals and the expense tracker overlap?**
Financial goals are for setting a target amount and tracking the big picture. The expense tracker is for recording daily spending in detail. The two features are complementary — expense tracker data can be used to analyze progress toward financial goals.
