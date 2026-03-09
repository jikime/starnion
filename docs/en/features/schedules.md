---
title: Schedules & Reminders
nav_order: 12
parent: Features
grand_parent: 🇺🇸 English
---

# Schedules & Reminders

## Overview

Starnion's schedule and reminder feature helps you set recurring and one-time reminders so you never miss an important event. Just tell the AI naturally in chat — for example, "Remind me to exercise every day at 8 AM" — and the reminder is registered immediately.

There are also system-generated automatic notifications (budget overage warnings, D-Day alerts, goal progress updates, etc.) alongside your own personal reminders. All notifications are sent via Telegram and can also be viewed in web chat.

> Notifications are sent a maximum of 3 times per day, and are not sent during quiet hours: 10:00 PM – 8:00 AM KST.

---

## Creating Reminders

### Creating via Chat

The easiest method. Simply tell the AI in chat what reminder you want.

```
User: Remind me to exercise every day at 8 AM.
AI:   Exercise reminder set for every day at 8:00 AM!
      "Time to exercise! 💪"

User: Remind me to set my weekly plan every Monday at 9 AM.
AI:   Reminder set for every Monday at 09:00!
      "Time to plan your week! 📅"

User: Remind me to pay rent on the 25th of every month at 6 PM.
AI:   Reminder set for the 25th of every month at 18:00!
      "Rent payment day! 🏠"

User: Remind me about my doctor's appointment on March 20 at 10 AM.
AI:   One-time reminder set for March 20, 2025 at 10:00!
      "You have a doctor's appointment today at 10 AM! 🏥"
```

### Creating from the Schedule Management Menu

Go to the top menu > **Schedule** tab > click **Add Reminder** to register a reminder using a form.

---

## Cron Expressions

Reminder schedules are managed using cron expressions. You don't need to enter them directly — just describe what you want in detail in chat.

**Common pattern examples:**

| Pattern | Cron Expression | Description |
|---------|-----------------|-------------|
| Every day at 8 AM | `0 8 * * *` | Daily at 08:00 |
| Every day at 9 PM | `0 21 * * *` | Daily at 21:00 |
| Every Monday at 9 AM | `0 9 * * 1` | Monday at 09:00 |
| Every Friday at 6 PM | `0 18 * * 5` | Friday at 18:00 |
| 1st of every month at 9 AM | `0 9 1 * *` | 1st of each month at 09:00 |
| Last days of each month at 8 PM | `0 20 28-31 * *` | 28th–31st of each month at 20:00 |
| Weekdays (Mon–Fri) at 7 AM | `0 7 * * 1-5` | Weekdays at 07:00 |
| Weekends (Sat, Sun) at 10 AM | `0 10 * * 6,0` | Saturday & Sunday at 10:00 |
| Every hour on the hour | `0 * * * *` | Top of every hour |
| Every 15 minutes | `*/15 * * * *` | Every 15 minutes |

---

## Reminder Types

### Personal Reminders (User-Created)

```
User: Remind me to write my diary every evening at 10 PM.
AI:   Diary reminder set for every day at 22:00!

User: Remind me to submit the regular report every other Friday at 2 PM.
AI:   Reminder set for every other Friday at 14:00.
```

### System Automatic Notifications

Notifications that Starnion sends automatically. Sent when conditions are met, with no additional setup required.

| Notification | Trigger Condition | Time |
|--------------|-------------------|------|
| Weekly Report | Users with spending records | Every Monday at 09:00 |
| Budget Warning | Category budget exceeds 90% | Checked every hour |
| Daily Spending Summary | Users with spending records on that day | Every day at 21:00 |
| Spending Anomaly | Sudden spike in spending vs. average | Checked every 3 hours |
| Inactivity Reminder | No login for 3+ days | Every day at 20:00 |
| Month-End Summary | 28th–31st of each month | Every day at 21:00 |
| Goal Progress | Users with active goals | Every Wednesday at 12:00 |
| Pattern Analysis Results | Users with sufficient analysis data | Every day at 14:00 |
| D-Day Reminder | Users with registered D-Days | Every day at 08:00 |

---

## System Automatic Notification Examples

**Budget warning:**
```
⚠️ Budget Alert

Your food budget is almost used up!
Used: KRW 81,200 / KRW 90,000 (90%)
Remaining: KRW 8,800
```

**Goal progress (every Wednesday):**
```
🎯 Goal Progress (as of March 12)

[Save for travel fund] KRW 650,000 / KRW 1,000,000 (65%)
[Reduce food expenses] This month's progress: 78% — You're doing great!
```

**D-Day reminder:**
```
📅 D-Day Reminder

D-7:   Team presentation (March 15)
D-30:  Summer vacation departure (April 7)
D+365: 1-year work anniversary (was yesterday! 🎉)
```

**Inactivity user reminder:**
```
Hello! We haven't seen you in a few days 😊
Feel free to record your expenses or ask anything at any time.
How was your spending today?
```

---

## Managing Reminders

### Viewing Your Reminder List

```
User: Show me my reminder list.
AI:   Registered reminders:

      1. Exercise reminder  — Every day at 08:00  [Active]
      2. Weekly plan        — Every Monday at 09:00  [Active]
      3. Rent payment       — 25th of every month at 18:00  [Active]
      4. Reading reminder   — Every day at 22:30  [Inactive]
```

### Enabling/Disabling Reminders

```
User: Turn off the exercise reminder.
AI:   Exercise reminder disabled. To turn it back on, say "Enable exercise reminder."

User: Turn the reading reminder back on.
AI:   Reading reminder re-enabled!
```

### Editing Reminders

```
User: Change the exercise reminder time to 7 AM.
AI:   Exercise reminder updated to 7:00 AM! (08:00 → 07:00)

User: Change the rent reminder message to "Pay rent! Don't forget this month."
AI:   Reminder message updated.
```

### Deleting Reminders

```
User: Delete the doctor's appointment reminder.
AI:   Doctor's appointment reminder deleted.

User: Show me all reminders and delete the reading reminder.
AI:   Reading reminder deleted.
```

---

## Telegram Notifications

All notifications are sent via the Telegram messaging app. You need to connect Telegram first.

How to connect Telegram:
1. Search for the Starnion Telegram bot (`@starnion_bot`)
2. Send the `/start` command
3. Note the connection code and link your account on the web

> For detailed instructions on connecting Telegram, see the [Telegram channel](../channels/telegram.md) documentation.

---

## 10 Real-Life Reminder Examples

```
1. Wake-up reminder
   User: Remind me to wake up every day at 7 AM.
   → Daily at 07:00: "Good morning! Let's start today with energy! ☀️"

2. Hydration reminder
   User: Remind me to drink water every 2 hours.
   → Every 2 hours: "Time for a glass of water! 💧"

3. Medication reminder
   User: Remind me to take my medicine every day at 8 AM and 8 PM.
   → Daily at 08:00 and 20:00: "Time to take your medicine! 💊"

4. Lunch expense check
   User: Remind me on weekdays at 1 PM to check if I've recorded my lunch expenses.
   → Weekdays at 13:00: "Have you recorded your lunch expense today? Let me check your budget tracker."

5. Evening workout reminder
   User: Remind me to work out on weekdays at 7 PM.
   → Weekdays at 19:00: "Time to work out! Keep going toward today's goal! 💪"

6. Weekly cleaning reminder
   User: Remind me to clean every Saturday at 10 AM.
   → Every Saturday at 10:00: "Weekly cleaning time! Start the weekend fresh! 🧹"

7. Credit card payment reminder
   User: Remind me to check my credit card statement on the 15th of every month at 9 AM.
   → 15th of every month at 09:00: "Check this month's credit card statement! 💳"

8. Reading reminder
   User: Remind me to read every night at 11 PM.
   → Daily at 23:00: "Time to read before bed! 📚"

9. Weekly goal check
   User: Remind me to check this week's goals every Sunday evening at 9 PM.
   → Every Sunday at 21:00: "Time to review this week's goal progress! ✅"

10. Annual year-end reminder
    User: Remind me about year-end tax settlement every December 31 at 9 AM.
    → December 31 every year at 09:00: "Prepare your year-end tax settlement documents! 📋"
```

---

## How It Works

Schedules registered by users are stored as JSON in the `knowledge_base` table. Every 15 minutes, the system checks all active schedules and sends a notification if the current time falls within a 15-minute window of the scheduled time.

```
Schedule workflow:

1. Registration → AI parses the chat request and saves the schedule to knowledge_base
2. Check        → All active schedules queried every 15 minutes
3. Time check   → Verify if current time is within ±15-minute window of scheduled time
4. Fatigue check → Quiet hours (22:00–08:00) and daily max (3 times) checked
5. Send         → Message sent via Telegram
6. Update       → One-time → marked 'completed', recurring → last_sent updated
```

### Schedule Types

| Type | Description | Example |
|------|-------------|---------|
| `one_time` | Fires once at the specified date and time | "Remind me about my doctor's appointment on March 20 at 10 AM" |
| `recurring` | Repeats daily, weekly, or monthly | "Remind me every Monday at 9 AM to make my weekly plan" |

### Notification Delivery Limits

To prevent notification overload, notifications are blocked under the following conditions:

- **Quiet hours**: 10:00 PM (22:00) – 8:00 AM (08:00) KST
- **Daily limit**: Maximum 3 automatic notifications per day (excludes responses to user requests)
- **Blocked during active chat**: If the user has sent a chat message within the past hour (they are considered active)

---

## FAQ

**Q. How many reminders can I create?**
A. There is currently no limit on the number of personal reminders. However, managing too many can be cumbersome, so it is recommended to register only what you actually need.

**Q. Can I receive notifications without Telegram?**
A. Telegram notifications require Telegram to be connected. The AI may mention reminders in web chat, but active push notifications are only possible through Telegram.

**Q. Can I set reminder times to the minute?**
A. Yes. You can specify minute-level precision, for example "Remind me every day at 8:30 AM."

**Q. Can I turn off system automatic notifications (budget warnings, spending anomalies, etc.)?**
A. Currently there is no option to disable individual system automatic notifications. Deactivating the relevant feature (e.g., budget, budget tracker) will automatically stop the related notifications.

**Q. Can I set a one-time reminder for a specific date?**
A. Yes. Specifying a particular date, such as "Remind me on March 20 at 10 AM," registers a one-time reminder. It is automatically deactivated after that time has passed.
