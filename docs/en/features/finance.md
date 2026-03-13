---
title: Expense Tracker & Budget
nav_order: 2
parent: Features
grand_parent: 🇺🇸 English
---

# Expense Tracker & Budget

## Overview

Starnion's expense tracker is an **AI-powered ledger you record with natural language**. Type something like "lunch kimchi stew 9,000 won" and the AI automatically categorizes it, parses the date and amount, and records it instantly. You can also attach a photo of a receipt.

No need to learn a complicated app. Record expenses the way you talk, and just ask "how much did I spend this month?" to get an analysis. Set category budgets to receive warnings when you exceed them, and get savings insights from your spending pattern analysis.

---

## Recording Income & Expenses

### Enter in Natural Language

Just type naturally in the chat box. No special format required.

**Expense entry examples:**

```
User: Lunch kimchi stew 9000 won
AI:   Food / Kimchi stew lunch / 9,000 won recorded 🍜 (March 8)

User: Café Americano 4500 won card
AI:   Café / Americano / 4,500 won recorded ☕ (March 8 · Card)

User: Bus 1250 won
AI:   Transportation / Bus / 1,250 won recorded 🚌 (March 8)

User: Bought shampoo on Coupang for 12800 won
AI:   Shopping / Shampoo / 12,800 won recorded 🛒 (March 8)

User: Netflix monthly subscription 17000 won
AI:   Subscriptions / Netflix / 17,000 won recorded 📺 (March 8)

User: Clinic visit fee 5000 won
AI:   Medical / Clinic visit / 5,000 won recorded 🏥 (March 8)

User: Had chicken with a friend yesterday. I paid 32000 won.
AI:   Food / Chicken / 32,000 won recorded 🍗 (March 7)
```

**Income entry examples:**

```
User: My salary came in. 2850000 won
AI:   Income / Salary / 2,850,000 won recorded 💰 (March 8)

User: Received freelance payment 450000 won
AI:   Income / Freelance / 450,000 won recorded (March 8)

User: Sold a chair on a secondhand marketplace and got 30000 won
AI:   Income / Secondhand sale / 30,000 won recorded (March 8)
```

**Entering multiple items at once:**

```
User: Log today's expenses
      - Convenience store 5200 won
      - Lunch 8500 won
      - Coffee 4000 won
      - Subway 1250 won

AI:   4 entries recorded ✅
      Food / Convenience store / 5,200 won
      Food / Lunch / 8,500 won
      Café / Coffee / 4,000 won
      Transportation / Subway / 1,250 won
      ────────────────
      Total spent today: 18,950 won
```

**Entering from a receipt photo:**

```
[Receipt image attached]
User: Add this receipt to my expense log

AI:   I've analyzed the receipt 🧾
      - Starbucks Tall Americano: 5,500 won
      - Blueberry muffin: 4,800 won
      Shall I record a total of 10,300 won under Café?

User: Yes
AI:   Café / Starbucks / 10,300 won recorded! (March 8)
```

### Specifying a Date

If you include a date, the entry is recorded on that date.

```
User: I did grocery shopping the day before yesterday. Spent 67,400 won at the supermarket.
AI:   Shopping / Supermarket / 67,400 won recorded on March 6 🛒

User: Last Monday I signed up for a 3-month gym membership. 270,000 won.
AI:   Culture / Gym membership / 270,000 won recorded on March 3 💪

User: Dining out on February 28, 45000 won
AI:   Food / Dining out / 45,000 won recorded on February 28 🍽️
```

---

## Category System

When you record an expense, the AI analyzes it and automatically assigns a category.

### Default Categories

| Category | Example items |
|----------|---------------|
| Food | Lunch, dinner, grocery shopping, convenience store food, delivery |
| Café | Coffee shops, cafés, drinks, desserts |
| Transportation | Subway, bus, taxi, gas, toll fees |
| Shopping | Clothing, electronics, household goods, online shopping |
| Subscriptions | Netflix, YouTube Premium, music streaming, app subscriptions |
| Medical | Hospital visits, pharmacy, health check-ups, medical supplies |
| Culture | Movies, performances, exhibitions, gym, hobbies |
| Other | Items that don't fit the above categories |

### Custom Categories

You can specify a category beyond the defaults.

```
User: Pet food 35000 won, use the "Pets" category
AI:   Pets / Pet food / 35,000 won recorded 🐾

User: English school monthly tuition 150000 won, category: Education
AI:   Education / English school / 150,000 won recorded 📚
```

### How Auto-Categorization Works

```
Input: "Starbucks Americano 5500 won"
  ↓
AI analysis:
  - "Starbucks" → recognized as a café brand
  - "Americano" → recognized as a beverage type
  → Category: Café (confidence: high)

Input: "Pharmacy Tylenol 8200 won"
  ↓
AI analysis:
  - "Pharmacy" → medical-related location
  - "Tylenol" → pharmaceutical product
  → Category: Medical (confidence: high)

Input: "Bought stuff at XX Mart"
  ↓
AI analysis:
  - "Mart" → shopping-related
  - Specific item unclear
  → Category: Shopping (confidence: medium)
  AI: "What did you buy? I can categorize it more accurately."
```

---

## Monthly Summary

You can request a monthly summary via chat, or view it on the expense dashboard in the Web UI.

### Dashboard Layout

```
┌─────────────────────────────────────────────────┐
│  March Expense Summary              March 2025  │
├──────────────┬──────────────┬────────────────────┤
│  Total Income│  Total Spent │  Net (Income−Spent)│
│  2,850,000   │  847,300     │  +2,002,700        │
├──────────────┴──────────────┴────────────────────┤
│  Savings rate: 70.3%                             │
├──────────────────────────────────────────────────┤
│  Spending by category                            │
│  Food    ████████████░░░░  342,500  40.4%        │
│  Café    ████░░░░░░░░░░░░  127,000  15.0%        │
│  Transit ████░░░░░░░░░░░░   89,400  10.6%        │
│  Shopping██░░░░░░░░░░░░░░   67,400   8.0%        │
│  Subscr. ██░░░░░░░░░░░░░░   62,000   7.3%        │
│  Other   ████░░░░░░░░░░░░  159,000  18.7%        │
├──────────────────────────────────────────────────┤
│  Last 6 months trend (Income / Spending)         │
│  Oct  ██████ / ████                              │
│  Nov  ██████ / █████                             │
│  Dec  ███████ / ██████                           │
│  Jan  ██████ / ████                              │
│  Feb  ██████ / ████                              │
│  Mar  ████████ / ████                            │
└──────────────────────────────────────────────────┘
```

### Requesting a Summary via Chat

```
User: Summarize my income and expenses for this month
AI:   🔧 Running `finance_summary`...

      📊 March Summary (as of the 1st–8th)
      ─────────────────────────────
      💰 Income:  2,850,000 won
      💸 Spent:     847,300 won
      ✨ Net:    +2,002,700 won (savings rate 70.3%)

      📂 Spending by category:
      Food           342,500  (40.4%)
      Café           127,000  (15.0%)
      Transportation  89,400  (10.6%)
      Shopping        67,400   (8.0%)
      Subscriptions   62,000   (7.3%)
      Other          159,000  (18.7%)

User: Compare it with last month
AI:   Compared with February:
      Spending 847,300 vs last month 792,400
      → 7% increase (+54,900 won)

      Main increases:
      - Food: +42,000 won (more dining out)
      - Café: +18,500 won
```

---

## Budget Settings

Set monthly spending limits by category to manage your finances.

### Setting a Budget via Chat

```
User: Set my food budget to 400,000 won
AI:   Food budget set to 400,000 won.
      Current food spending this month: 342,500 won (85.6% used)
      Remaining budget: 57,500 won

User: Set café to 100,000 and transportation to 150,000
AI:   Budgets set!
      Café:          100,000 won
      Transportation: 150,000 won

User: Show me the overall budget status
AI:   🔧 Running `budget_status`...

      📋 March Budget Status
      ──────────────────────────────────
      Category    Budget    Used    Left    %
      Food        400,000  342,500  57,500  85.6% ⚠️
      Café        100,000  127,000 -27,000 127.0% ❌ Over!
      Transit     150,000   89,400  60,600  59.6% ✅
      Shopping    200,000   67,400 132,600  33.7% ✅
      ──────────────────────────────────
      Total       850,000  626,300 223,700  73.7%
```

### Setting a Budget in the Web UI

Go to Settings > Budget Management to enter budgets for each category directly.

- **Warning threshold**: a caution indicator appears when spending exceeds this percentage of the budget (default: 70%)
- **Danger threshold**: a danger indicator appears when spending exceeds this percentage (default: 90%)

```
Budget example:

Category       Monthly Budget
──────────────────
Food           400,000
Café           100,000
Transportation 150,000
Shopping       200,000
Subscriptions   70,000
Medical         50,000
Culture         80,000
Other          100,000
──────────────────
Total        1,150,000
```

---

## Budget Alerts

Receive alerts when you exceed a budget or approach a threshold.

### How Alerts Work

```
[70% warning — caution stage]
AI alert: "You've used 70% of your Food budget.
           Remaining budget this month: 120,000 won
           You can spend up to 5,455 won per day for the next 22 days."

[90% warning — danger stage]
AI alert: "⚠️ You've used 92% of your Transportation budget!
           Only 12,000 won remaining.
           Try to cut back on transportation spending this month."

[100% exceeded]
AI alert: "❌ You've exceeded your Café budget.
           Budget: 100,000 won / Spent: 127,000 won (27,000 won over)
           Consider reviewing your Café budget for this month."
```

### Telegram Alert Integration

Connect a Telegram channel to receive budget alerts on your phone as well. Stay on top of your spending in real time, even when you're out.

---

## Spending Analysis

Beyond simple record-keeping, Starnion analyzes spending patterns and provides useful insights.

### Analysis Metrics

**1. Monthly trend (up to 12 months)**
```
Income/spending trend:
       Income  ──────────────●──●──●──●──●──●
       Spent   ──────●──●──●──●──●──●──●

       Monthly savings rate:
       Oct  68.2%  ████████████████░░░░
       Nov  64.1%  ████████████████░░░░
       Dec  55.8%  ██████████████░░░░░░  (higher year-end spending)
       Jan  72.4%  ██████████████████░░
       Feb  73.1%  ██████████████████░░
       Mar  70.3%  ████████████████████  (current)
```

**2. Category share analysis**
```
3-month cumulative spending breakdown:

Food         ████████████████░░░░  38.2%  (largest share)
Café         ████░░░░░░░░░░░░░░░░  14.7%
Transit      ████░░░░░░░░░░░░░░░░  11.3%
Shopping     ███░░░░░░░░░░░░░░░░░   9.8%
Subscriptions██░░░░░░░░░░░░░░░░░░   7.2%
Medical      █░░░░░░░░░░░░░░░░░░░   4.1%
Culture      ██░░░░░░░░░░░░░░░░░░   6.3%
Other        ███░░░░░░░░░░░░░░░░░   8.4%
```

**3. Day-of-week spending pattern**
```
Average daily spending by day (last 30 days):

Sun  ████████████░░░  24,800  (weekend dining out)
Mon  ████░░░░░░░░░░░   9,200
Tue  ████░░░░░░░░░░░   8,700
Wed  █████░░░░░░░░░░  11,400
Thu  ████░░░░░░░░░░░   9,800
Fri  ███████░░░░░░░░  17,300  (Friday dinners/social)
Sat  █████████░░░░░░  21,200  (weekend activities)
```

**4. Daily spending heatmap (last 90 days)**
```
Spending intensity by date:
Low  □  ░  ▒  ▓  █  High

January:
Sun  Mon  Tue  Wed  Thu  Fri  Sat
               □    ░    □    ▒    ▒
 ░    □    □    ░    □    ▓    █
 □    □    ░    □    ░    ▒    ▒
 ░    □    □    □    □    ░    ░
 ░
```

**5. Summary statistics**

| Metric | Value |
|--------|-------|
| Total spending (6 months) | 4,812,400 won |
| Daily average | 26,733 won |
| Total transactions | 312 |
| Top category | Food at 38.2% |
| This month's spending | 847,300 won |
| Month-over-month change | +7.0% ↑ |

### AI Insights

Insights are automatically generated from your statistical data.

```
User: Analyze my spending patterns

AI:   📊 Spending pattern analysis:

      1. Café spending increased 27.3% compared to last month ☕
         → That's an average of 1.4 cups per day

      2. Friday is your highest-spending day (avg. 17,300 won/week) 💰
         → Mostly dining out / social activities

      3. You're spending 62,000 won on subscriptions this month 📺
         → Check if there are any you're no longer using

      4. Food budget: 85.6% of 400,000 won used ⚠️
         → 22 days left in the month — worth keeping an eye on

      Savings tip: Cutting café visits to 3 times a week
      could save you around 40,000 won per month 💡
```

---

## Data Management

### Editing Records

```
User: Change the 1250 won transportation entry I entered today to 1450 won
AI:   Transportation / Bus / 1,250 won → 1,450 won updated ✏️

User: Change the category of the last entry from Food to Café
AI:   Category updated to Café ✅
```

To edit directly in the Web UI:
1. Click the item you want to edit in the transaction list
2. Modify the amount, category, description, or date
3. Click the Save button

### Deleting Records

```
User: Delete the convenience store 5200 won entry I recorded today
AI:   Deleted the convenience store 5,200 won entry 🗑️

User: Can you undo that deletion?
AI:   Sorry, deleted records cannot be recovered.
      Would you like me to re-enter it?
```

### Filtering and Viewing Records

```
User: Show me my café expenses for this month
AI:   🔧 Running `finance_list`...

      March café expenses:
      3/1   Starbucks Americano      5,500
      3/2   Ediya Coffee             3,800
      3/4   Blue Bottle latte        7,200
      3/5   Convenience store can    2,000
      ...
      ─────────────────────────
      Total: 127,000 won (18 entries)

User: Show only expenses over 50,000 won
AI:   This month's expenses over 50,000 won:
      3/1   Grocery shopping        67,400
      3/3   3-month gym membership 270,000
      3/7   Dinner with friends     85,000
      Total: 422,400 won (3 entries)
```

---

## Querying Your Ledger via AI Chat

Natural language queries support a wide variety of lookups.

### Period Queries

```
User: How much did I spend on food this month?
AI:   March food spending: 342,500 won (29 entries)
      85.6% of the 400,000 won budget used.

User: What was my total spending last month?
AI:   February total spending: 792,400 won
      Savings rate of 72.2% against income of 2,850,000 won

User: Show me cumulative spending from January to March this year
AI:   January–March 2025 cumulative spending:
      January: 758,200 won
      February: 792,400 won
      March: 847,300 won (in progress)
      Total: 2,397,900 won
```

### Category Queries

```
User: How much have I spent on subscriptions in the last 3 months?
AI:   Subscription spending over 3 months:
      January:  62,000 won
      February: 62,000 won
      March:    62,000 won
      Total: 186,000 won
      Active subscriptions: Netflix, YouTube Premium, Spotify

User: What are my top 3 spending categories this month?
AI:   This month's top 3 categories:
      #1  Food          342,500  (40.4%)
      #2  Café          127,000  (15.0%)
      #3  Transportation  89,400  (10.6%)
```

### Comparison Queries

```
User: Am I spending more this month than last month?
AI:   March spending: 847,300 won (as of 1st–8th)
      February spending: 792,400 won (full month)

      At this pace, March total is projected to reach
      approximately 3,178,000 won (based on daily average).
      Looks like it could exceed last month — heads up ⚠️

User: Compare with the same time last year
AI:   March 1–8, 2024 spending: 731,200 won
      March 1–8, 2025 spending: 847,300 won
      +15.9% increase year-over-year.
      Main drivers: Food +22.4%, Café +18.7%
```

### Analysis Queries

```
User: Which day of the week do I spend the most?
AI:   Day-of-week analysis for the last 30 days:
      Friday averages the highest at 17,300 won. 💸
      Mainly dining out (52%) and transportation (18%).

User: What's my daily average spending this month?
AI:   March 1–8 basis:
      847,300 won ÷ 8 days = 105,913 won/day average
      At this rate, March total spending would be about 3,283,000 won.
      Might be worth cutting back a little 😅
```

---

## Tips & Examples

### Real-World Use Scenarios

**Scenario 1: Morning commute**
```
(After boarding the subway)
User: Subway 1250 won
AI:   Transportation logged! 1,250 won ✅

(Stopping at a café)
User: Iced Americano 5000 won card
AI:   Café logged! 5,000 won ✅

Today's commute total: 6,250 won
```

**Scenario 2: After lunch**
```
User: Had samgyeopsal with coworkers. Total was 92,000 won split 4 ways, so 23,000 won for me
AI:   Food / Samgyeopsal / 23,000 won recorded 🥩 (March 8)

User: We went to a café for dessert. Iced tea 6000 won
AI:   Café / Iced tea / 6,000 won recorded ☕

Today's lunch total: 29,000 won
```

**Scenario 3: Month-end review**
```
User: How did this month go?

AI:   📊 March Final Summary
      ────────────────────────────────
      Income:  2,850,000 won
      Spent:   1,247,300 won
      Savings: 1,602,700 won (savings rate 56.2%)

      Notable this month:
      ⚠️ Café budget exceeded by 127% (27,000 won over)
      ✅ Transportation budget well managed (59.6% of budget used)
      📈 Spending up 57.4% from last month

      Recommendations for next month:
      - Raise the Café budget to 130,000 won, or
      - Limit café visits to 5 times per week or fewer
```

**Scenario 4: Handling a budget crunch**
```
AI:   ⚠️ Alert: You've used 91% of your Food budget.
      Remaining: 36,000 won / Days left: 8

User: How much can I spend per day for the next 8 days?
AI:   36,000 won ÷ 8 days = 4,500 won per day.
      That's a bit tight 😅
      Cooking at home with groceries should make it very doable!

User: Increase my budget by 50,000 won
AI:   Food budget updated from 400,000 won → 450,000 won.
      Remaining: 86,000 won (10,750 won/day for 8 days)
```

### Tips for Getting More Out of the Expense Tracker

1. **Record right away**: Entering expenses immediately after they happen keeps your records accurate and ensures nothing is forgotten.

2. **Use receipt photos**: For large purchases or items with many line items, snapping a photo of the receipt lets the AI auto-enter multiple entries at once.

3. **Set budgets at the start of each month**: Setting category budgets at the beginning of the month makes spending management much easier.

4. **Make weekly reviews a habit**: Asking "summarize my spending this week" once a week gives you a quick snapshot of your spending patterns.

5. **Use AI insights**: Regularly asking "analyze my spending patterns" helps you discover where you can save.

---

## 💬 Telegram Usage Examples

> Just talk to Nion in natural language. No special commands needed — chat like you normally would!

### Recording Expenses

```
Spent $5.50 on an iced latte at Starbucks
```
→ Automatically recorded under the Cafe category

```
Lunch was $8 for kimchi stew
```
→ Automatically categorized as Food

```
Taxi fare was $12
```
→ Recorded under Transportation

### Viewing Expenses

```
How much did I spend this month?
```
→ Shows total monthly spending with category breakdown

```
How much did I spend on food last week?
```
→ Shows the food category total for last week

### Budget Management

```
Set my food budget to $300 for this month
```
→ Food category budget is set

```
How much budget do I have left?
```
→ Shows remaining budget and usage rate per category

### Editing and Deleting

```
Change the Starbucks $5.50 I just entered to $4.50
```
→ The expense record is updated

```
Delete today's taxi fare
```
→ The expense record is removed

---

## Frequently Asked Questions

**Q. I entered the wrong amount. How do I fix it?**

A. Just say "fix the [item] [amount] I just entered." You can also click the entry directly in the transaction list in the Web UI.

```
User: Change the convenience store entry I entered earlier from 5200 won to 4200 won
AI:   Convenience store expense updated from 5,200 won → 4,200 won.
```

**Q. The automatic category classification was wrong.**

A. Say "change the category from [original category] to [desired category]" and it will be updated instantly. If the AI consistently misclassifies a certain type of entry, feel free to share feedback — it helps us improve.

**Q. Can I enter expenses from a previous month?**

A. Yes, just specify the date. For example, entering "February 15 supermarket 32,000 won" will record it on that date.

**Q. Can I export my expense data to Excel?**

A. A CSV export feature is currently in development. For now, you can request "send me this month's expense list" to receive it in text format.

**Q. Can I manage shared expenses (family, partner)?**

A. Currently the system is account-based for individual use. A shared ledger feature is planned for a future update.

**Q. What alerts do I get when I exceed a budget?**

A. You receive alerts at 70% (warning), 90% (danger), and 100% exceeded (urgent) of each budget. Connecting Telegram allows you to receive alerts on mobile as well.

**Q. How do I record income?**

A. Type something like "salary of 3 million won came in" or "income 3,000,000 won" and it will automatically be classified as income. Positive amounts are treated as income; negative amounts as expenses.

**Q. Can regular subscription payments be recorded automatically?**

A. Manual entry is the default, but for recurring fixed amounts you can say "auto-record Netflix 17,000 won every month" and it will be logged automatically each month.
