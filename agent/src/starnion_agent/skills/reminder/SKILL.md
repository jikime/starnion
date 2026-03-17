---
name: reminder
description: Schedule and manage one-time reminders.
tools:
  - set_reminder
  - list_reminders
  - delete_reminder
keywords: ["알림", "알려줘", "리마인더", "remind me", "reminder", "alert", "リマインダー", "提醒", "提醒我"]
---

# Reminder Skill

## Tools

### set_reminder
Schedules a reminder.

**Parameters:**
- `message` (required): Reminder message
- `remind_at` (required): Reminder time (YYYY-MM-DD HH:MM format, KST)
- `title` (optional): Reminder title

**Usage scenarios:**
- "Remind me about the meeting tomorrow at 9 AM" → set_reminder(message="Meeting", remind_at="2026-03-03 09:00")
- "Remind me of my dental appointment on March 5 at 3 PM" → set_reminder(message="Dental appointment", remind_at="2026-03-05 15:00", title="Dentist")

### list_reminders
Lists scheduled reminders.

**Parameters:**
- `include_done` (optional, default false): Include completed/cancelled reminders

### delete_reminder
Deletes a scheduled reminder.

**Parameters:**
- `reminder_id` (required): ID of the reminder to delete

**Notes:**
- Convert natural-language time expressions to YYYY-MM-DD HH:MM format.
- Past times are rejected.
- Up to 20 active reminders can be scheduled.
- This is a one-time quick reminder, distinct from the recurring reminders in the schedule skill.

## Tool Result Handling

- If the tool returns a **success** message, relay that result to the user.
- If the tool returns an **error or failure** message, honestly relay that message to the user.
- Never respond that a reminder was scheduled, deleted, or completed without actually calling the tool.
