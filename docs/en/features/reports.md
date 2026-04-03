---
title: Reports
nav_order: 11
parent: Features
grand_parent: 🇺🇸 English
---

# Reports

## Overview

Starnion's report feature uses AI to comprehensively analyze your diary entries, budget records, goals, and spending patterns, then automatically generates weekly and monthly summary reports.

Every Monday at 9:00 AM KST, a summary of the previous week's activity is automatically sent to you via Telegram. You can also generate a report on demand at any time by typing "Create a weekly report" in chat. All generated reports — including historical ones — are viewable in the Reports menu.

> Reports are a starting point for your weekly and monthly reflection. The AI organizes your data first, so review the content and use it to plan the week ahead.

---

## Report Types

| Type | Key | Description | Auto-generation Time (KST) |
|------|-----|-------------|---------------------------|
| **Weekly Report** | `weekly` | Comprehensive analysis of the past 7 days | Every Monday at 09:00 |
| **Daily Summary** | `daily` | Summary of the day's expenses and activity | Every day at 21:00 (on days with records) |
| **Monthly Report** | `monthly` | Full analysis of the current month | Last day of each month at 21:00 |
| **Spending Anomaly** | `anomaly` | Alert for spending exceeding 200% of average | Automatic check every 3 hours |
| **Pattern Insights** | `pattern` | Personalized spending and behavior pattern insights | Every day at 14:00 (when conditions are met) |
| **Goal Progress** | `goal` | Progress summary for active goals | Every Wednesday at 12:00 |

---

## Automatically Sent Reports

### Weekly Report — Every Monday at 09:00 KST

Every Monday morning at 9:00, a report analyzing the past week's activity is automatically sent via Telegram. Only sent to users who have budget records within the past 30 days.

**Weekly report example:**
```
📊 Week 2 of March 2025 — Weekly Report

💰 Total spending this week: KRW 187,400

Spending by category:
🍽 Food:         KRW 78,500  (41.9%)
🚌 Transport:    KRW 24,200  (12.9%)
☕ Café:          KRW 18,700  (10.0%)
🛒 Shopping:     KRW 42,000  (22.4%)
🎬 Leisure:      KRW 24,000  (12.8%)

vs. last week: +KRW 12,300 (▲7.0%)
Month-to-date: KRW 312,800

💡 Insight
Café spending increased by 35% compared to last week.
Food expenses are at 87% of the budget (KRW 90,000).
```

### Daily Summary — Every day at 21:00 KST

Sent to users who have recorded spending on that day.

```
📋 Daily Summary — March 8, 2025

Today's spending: KRW 42,300
- Breakfast:  KRW 6,500
- Lunch:      KRW 9,000
- Café:       KRW 4,500
- Transport:  KRW 4,200
- Dinner:     KRW 18,100

Weekly total so far: KRW 127,400 / KRW 300,000 (42.5%)
```

### Monthly Report — Last day of each month at 21:00 KST

Sent on the evening of the last day of each month, with a full analysis of that month's spending. Sent to users who have records for the current month.

### Spending Anomaly — Automatic check every 3 hours

Sends an immediate alert if today's spending exceeds 200% of the 30-day daily average. Requires at least 7 days of accumulated data to activate.

**Spending anomaly example:**
```
⚠️ Spending Anomaly Detected

Today's total spending: KRW 185,000
30-day daily average:   KRW 31,200  (593%)

You're spending significantly more than usual. Please take a look!
```

### Pattern Insights — Every day at 14:00 KST

The AI learns your spending patterns and sends personalized insights when conditions are met. Pattern analysis runs in the background every morning at 6:00 AM.

```
💡 Pattern Insight

Your Friday evening spending is 2.3× your usual amount.
Friday average over the past 4 weeks: KRW 48,200
(Weekday average: KRW 21,000)

How about setting a separate Friday evening budget?
```

### Goal Progress — Every Wednesday at 12:00 KST

Sent to users who have active goals, with a weekly progress update.

```
🎯 Goal Progress (Week 3 of March)

✅ Reading challenge: 4/5 books (80%) — Just one more!
🔄 Exercise habit: 8/12 sessions (67%) — Need 2 more this week
💰 Travel savings: KRW 150,000 / KRW 200,000 (75%)

Overall completion rate vs. last week: 74% (+8%)
Keep it up this week! 💪
```

---

## Generating Reports Manually

You can generate a report immediately without waiting for the automatic schedule.

### Requesting in Chat

```
User: Create a weekly report.
AI:   I've generated this week's report. [Report content displayed]

User: Create a monthly report for this month.
AI:   I've generated the March monthly report.

User: Analyze today's spending patterns.
AI:   I've generated a pattern insights report.

User: Tell me my savings goal progress.
AI:   I've generated a goal progress report.
```

### Generating from the Reports Menu

Go to the top menu > **Reports** tab > click the **Generate Report** button, then select the report type you want. Generation takes approximately 20–60 seconds.

> Manually generated reports are also saved to the report list and can be viewed again later.

---

## Report Contents in Detail

### Weekly Report (weekly)

- Total spending this week
- Spending amount and percentage by category
- Increase/decrease vs. last week
- Month-to-date total
- Budget utilization rate (when a budget is set)
- AI insights and saving tips

### Monthly Report (monthly)

- Total spending this month
- Monthly breakdown by category
- Comparison vs. previous month
- Day-by-day spending trend
- Highest and lowest spending days
- Whether the savings goal was achieved

### Pattern Insights (pattern)

```
💡 Spending Pattern Insights (2025-03-08)

1. Café spending pattern
   High frequency of café visits on weekday mornings (9–11 AM).
   Weekly average café spending: KRW 23,500

2. Weekend spending characteristics
   Weekend shopping spending is 3.2× that of weekdays.
   We recommend writing a shopping list before the weekend.

3. Saving opportunity
   Switching convenience store purchases to supermarket shopping
   could save approximately KRW 15,000 per month.
```

### Goal Progress (goal)

```
🎯 Goal Progress (2025-03-08)

[Goal 1] Save KRW 1,000,000 for an emergency fund
Current: KRW 650,000 / KRW 1,000,000 (65%)
Estimated completion date: May 15, 2025

[Goal 2] Keep monthly food expenses under KRW 150,000
March food expenses: KRW 89,200 / KRW 150,000 (59.5%)
Likelihood of achieving goal this month: ✅ High
```

---

## Viewing Reports

### Report List

In the top menu > **Reports** tab, you can view all previously generated reports in reverse chronological order. Up to 20 are displayed at a time; click the load more button to see additional reports.

### Report Filters

| Filter | Description |
|--------|-------------|
| All | All reports |
| Weekly | `weekly` type only |
| Monthly | `monthly` type only |
| Pattern | `pattern` type only |
| Goal | `goal` type only |
| Anomaly | `anomaly` type only |

### Viewing Past Reports

```
User: Show me last month's monthly report.
AI:   February 2025 monthly report:
      [February report content displayed]

User: Compare last week's weekly report with this week's.
AI:   Week 4 of February vs. Week 1 of March:
      Total spending: KRW 175,200 → KRW 187,400 (+KRW 12,200)
      Biggest increase: Shopping (+KRW 18,000)
      Biggest decrease: Food (−KRW 5,800)
```

---

## How It Works

```
Report generation flow:

1. Trigger      → Scheduler (automatic) or user request (manual)
2. Data fetch   → Retrieves diary, budget, goal, and memo data
3. AI analysis  → Analysis request sent to agent via gRPC (max 120 seconds)
4. Content gen. → LLM generates comprehensive report text
5. Storage      → Permanently saved in the reports table
6. Delivery     → Displayed in web UI + sent via Telegram (if Telegram is connected)
```

Report title format by type:

| Type | Example Title |
|------|--------------|
| `daily` | `Daily Summary — March 08, 2025` |
| `weekly` | `Week 2 of March 2025 — Weekly Report` |
| `monthly` | `March 2025 Monthly Report` |
| `anomaly` | `2025-03-08 Spending Anomaly Detected` |
| `pattern` | `2025-03-08 Pattern Insights` |
| `goal` | `2025-03-08 Goal Progress` |

---

## API Endpoints

### List Reports

```
GET /api/v1/reports?user_id={user_id}&type={type}&limit=20&offset=0
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `user_id` | Required | User ID |
| `type` | Optional | Report type (daily, weekly, monthly, anomaly, pattern, goal) |
| `limit` | Optional | Maximum results to return (default 20) |
| `offset` | Optional | Offset (default 0) |

**Response example:**
```json
[
  {
    "id": 42,
    "report_type": "weekly",
    "title": "Week 2 of March 2025 — Weekly Report",
    "created_at": "2025-03-10 09:00"
  }
]
```

### Get Report Detail

```
GET /api/v1/reports/{id}?user_id={user_id}
```

**Response example:**
```json
{
  "id": 42,
  "report_type": "weekly",
  "title": "Week 2 of March 2025 — Weekly Report",
  "content": "📊 This week's spending summary...",
  "created_at": "2025-03-10 09:00"
}
```

### Generate Report Manually

```
POST /api/v1/reports/generate
Content-Type: application/json

{
  "user_id": "...",
  "report_type": "weekly"
}
```

Allowed `report_type` values: `daily`, `weekly`, `monthly`, `anomaly`, `pattern`, `goal`

---

## Automatic Delivery Schedule Summary

| Report | Delivery Time (KST) | Target Condition |
|--------|---------------------|-----------------|
| Weekly Report | Every Monday at 09:00 | Users with budget records in the past 30 days |
| Daily Summary | Every day at 21:00 | Users with spending records on that day |
| Monthly Report | Last day of each month at 21:00 | Users with records this month |
| Spending Anomaly | Automatic check every 3 hours | When spending exceeds 200% of daily average |
| Pattern Insights | Every day at 14:00 | When pattern trigger conditions are met |
| Goal Progress | Every Wednesday at 12:00 | Users with active goals |

> To prevent notification overload, a maximum of 3 notifications are sent per day.
> No notifications are sent during quiet hours: 10:00 PM – 8:00 AM KST.

---

## 💬 Telegram Usage Examples

> Just talk to Nion in natural language. No special commands needed — chat like you normally would!

### Generating Reports

```
Create a weekly report
```
→ A spending analysis report for this week is generated

```
Show me this month's monthly report
```
→ A comprehensive monthly report is generated

### Requesting Analysis

```
Analyze my spending patterns
```
→ Analyzes spending patterns and identifies savings opportunities

```
How's my savings goal progress?
```
→ Generates a goal progress report

### Comparing Periods

```
Compare last week's and this week's spending
```
→ Provides a comparative analysis of the two periods

---

## FAQ

**Q. I want to receive the weekly report on a day other than Monday.**
A. The automatic weekly report delivery is currently fixed to every Monday at 9:00 AM. If you want it at a different time, simply request "Create a weekly report" directly in chat.

**Q. Can I receive reports without using Telegram?**
A. Automatic delivery is only available via Telegram. On the web, you can generate reports directly from the Reports menu or by requesting them in chat.

**Q. Will a report be generated even if I have no spending records?**
A. Users without spending records in the past 30 days are excluded from automatic weekly report delivery. If you request one manually, a report stating "no records found" may be generated.

**Q. How long are generated reports retained?**
A. All generated reports are retained permanently. You can view historical reports from the Reports menu at any time.

**Q. Report generation is too slow.**
A. The AI analyzes all your recorded data, which typically takes 20–60 seconds. Processing time may increase with larger volumes of records.

**Q. I'm getting spending anomaly alerts too frequently.**
A. Spending anomaly alerts are sent no more than the daily notification limit (3 times). If your usual spending is high and the threshold feels low, continue building up budget records — once the 30-day average better reflects your actual spending patterns, false alerts will decrease.
