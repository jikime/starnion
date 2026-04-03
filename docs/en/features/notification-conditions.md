---
title: Notification Trigger Conditions
nav_order: 13
parent: Features
grand_parent: 🇺🇸 English
---

# Notification Trigger Conditions

This is a technical reference page for when notifications don't arrive as expected. Both system automatic notifications and user-created schedules must pass multiple conditions before they are finally sent.

---

## Common Block Conditions (Applied to All Notifications)

Even if the scheduled time is correct, notifications are **blocked** if any of the following conditions apply.

| Condition | Details | Exceptions |
|-----------|---------|------------|
| **Notifications globally disabled** | Notifications turned off in settings | None |
| **Quiet hours** | 22:00 – 08:00 KST | User-created schedules |
| **Active conversation** | Within 1 hour of last message sent | User-created schedules |
| **Daily limit exceeded** | Maximum **3** automatic notifications per day | Budget warning, user-created schedules |
| **Individual job disabled** | That specific notification was turned off in the notification center | None |

> User-created schedules (e.g., "daily exercise reminder at 8am") **ignore** quiet hours, active conversation, and the daily 3-notification limit. However, global notification settings and skill gates still apply.

---

## System Notification Trigger Conditions

### Weekly Report

- **Run time:** Every Monday at 09:00 KST
- **Required skill:** `finance`
- **Data condition:** Finance records exist within the last 30 days
- **Fatigue check:** Applied

---

### Budget Warning

- **Run time:** Every hour at :00 (hourly)
- **Required skill:** `budget`
- **Data conditions:**
  - At least 1 budget category configured
  - This month's spending for that category ≥ **90%** of budget
- **Fatigue check:** Quiet hours / active conversation applied; daily 3-notification limit **not applied**

---

### Daily Spending Summary

- **Run time:** Every day at 21:00 KST
- **Required skill:** `finance`
- **Data condition:** Finance records exist **today (KST)**
- **Fatigue check:** Applied

---

### Inactive Reminder

- **Run time:** Every day at 20:00 KST
- **Required skill:** `proactive`
- **Data conditions:**
  - Past finance records exist, but
  - No finance records in the last **3 days**
- **Fatigue check:** Applied

---

### Monthly Closing

- **Run time:** Every month on days 28–31 at 21:00 KST (only runs on actual last day)
- **Required skill:** `finance`
- **Data condition:** Finance records exist this month
- **Additional condition:** Code internally re-checks whether it is the **actual last day of the month** (cron expression covers days 28–31 to handle varying month lengths)
- **Fatigue check:** Applied

---

### Spending Anomaly Detection

- **Run time:** Every 3 hours
- **Required skill:** `finance`
- **Data conditions:**
  - Finance records exist today (KST)
  - At least **7 days** of data accumulated
  - Today's total spending > **200%** of the 30-day daily average
- **Fatigue check:** Applied

---

### Pattern Insight

- **Run time:** Every day at 14:00 KST
- **Required skill:** `pattern`
- **Data conditions:**
  - Pattern analysis result (`pattern:analysis_result`) must be stored in `knowledge_base`
  - (→ The daily 06:00 pattern analysis background job must have run first)
  - Pattern confidence ≥ **0.6**
  - Stored pattern trigger matches the current day of week / date
- **Fatigue check:** Applied

---

### Goal Progress Report

- **Run time:** Every Wednesday at 12:00 KST
- **Required skill:** `goals`
- **Data condition:** Goals with `status='active'` exist in `knowledge_base`
- **Fatigue check:** Applied

---

### D-Day Notification

- **Run time:** Every day at 08:00 KST
- **Required skill:** `dday`
- **Data conditions:**
  - Entries exist in the `ddays` table
  - Today matches D-**30**, D-**7**, D-**3**, D-**1**, or D-**0**
  - Recurring items calculate the date based on the current or next year
- **Fatigue check:** Applied

---

## Background-Only Jobs (No Notifications)

The following jobs only analyze and store data — they do not send notifications. Cannot be disabled.

### Pattern Analysis

- **Run time:** Every day at 06:00 KST
- **Required skill:** `pattern`
- **Condition:** Finance records exist within the last 30 days
- **Output:** Stored in `knowledge_base.key='pattern:analysis_result'`
- **Dependency:** Prerequisite for the Pattern Insight notification

### Conversation Analysis

- **Run time:** Every 10 minutes (only actually runs when conditions are met)
- **Required skill:** `diary`
- **Conditions:**
  - User has sent messages before
  - User has been idle for **30 minutes to 2 hours** since last message
  - Not during quiet hours (22:00–08:00 KST)
  - The same idle session is not analyzed twice
- **Output:** Conversation analysis result stored (viewable on AI Memory page)

### Goal Evaluation

- **Run time:** Every day at 07:00 KST
- **Required skill:** `goals`
- **Condition:** Active goals exist
- **Output:** Evaluation result stored in `knowledge_base`

### Weekly Memory Compaction

- **Run time:** Every Monday at 05:00 KST
- **Required skill:** None (always runs)
- **Condition:** Finance records exist within the last 30 days
- **Output:** Previous week's daily logs compressed into weekly summaries

---

## User-Created Schedules

- **Check interval:** Queries all active schedules every 15 minutes
- **Required skill:** `schedule`
- **Trigger conditions:**
  - Schedule `status='active'`
  - Current time is within **±15 minutes** of scheduled time
  - Not already sent today (`last_sent` check)
- **Schedule types:**
  - `one_time`: Sends once at the specified date+time, then marked `completed`
  - `recurring`: Repeats based on day of week + time, updates `last_sent`

| Fatigue condition | User-created schedules |
|-------------------|----------------------|
| Quiet hours (22–08) | **Ignored** |
| Active conversation (within 1 hour) | **Ignored** |
| Daily 3-notification limit | **Ignored** |
| Global notifications disabled | Applied |
| Skill gate (`schedule`) | Applied |

---

## Skill Gate Summary

If the required skill for a notification is disabled, the notification will not be sent. Check in **Settings > Skills**.

| Notification | Required skill | Without skill |
|-------------|---------------|---------------|
| Weekly Report | `finance` | Not sent |
| Budget Warning | `budget` | Not sent |
| Daily Summary | `finance` | Not sent |
| Inactive Reminder | `proactive` | Not sent |
| Monthly Closing | `finance` | Not sent |
| Spending Anomaly | `finance` | Not sent |
| Pattern Insight | `pattern` | Not sent |
| Goal Progress | `goals` | Not sent |
| D-Day Notification | `dday` | Not sent |
| User-created schedules | `schedule` | Not sent |
| Pattern Analysis (background) | `pattern` | Not run |
| Conversation Analysis (background) | `diary` | Not run |
| Goal Evaluation (background) | `goals` | Not run |
| Weekly Memory Compaction | None | Always runs |

---

## Troubleshooting: When Notifications Don't Arrive

```
Checklist (check in order from top)

□ 1. Skill activation
      Verify the required skill is enabled in Settings > Skills

□ 2. Telegram connection
      Verify Telegram is connected in Settings > Channels

□ 3. Global notification settings
      Verify notifications are enabled in Settings

□ 4. Individual notification status
      Check that the notification is enabled in Notification Center > System tab

□ 5. Current time
      Notifications between 22:00–08:00 KST are blocked by quiet hours policy

□ 6. Today's notification count
      Automatic notifications are limited to 3 per day.
      If 3+ already received, try again after midnight

□ 7. Sufficient data
      - Spending anomaly: requires 7+ days of data
      - Pattern insight: requires pattern analysis results with confidence ≥ 0.6
      - Inactive reminder: requires past records AND no records in last 3 days

□ 8. User-created schedule — time window
      System checks every 15 minutes, so up to 15 minutes of delay is expected.
      The scheduled time must fall within the ±15 minute window when checked.
```

---

## Full Schedule Timeline

| Time (KST) | Job |
|------------|-----|
| 05:00 (Monday) | Weekly memory compaction |
| 06:00 | Pattern analysis (background) |
| 07:00 | Goal evaluation (background) |
| 08:00 | D-Day notification |
| 09:00 (Monday) | Weekly report |
| 12:00 (Wednesday) | Goal progress report |
| 14:00 | Pattern insight |
| 20:00 | Inactive reminder |
| 21:00 | Daily summary, monthly closing |
| Every hour | Budget warning |
| Every 3 hours | Spending anomaly detection |
| Every 10 minutes | Conversation analysis condition check |
| Every 15 minutes | User-created schedule check |
