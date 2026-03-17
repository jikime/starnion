---
name: schedule
description: Creates and manages recurring or one-time scheduled notifications. Responds to messages like "notify me of weekly expenses every Friday at 8 PM" or "show my schedule list."
keywords: ["일정", "일정등록", "알림설정", "schedule", "event", "スケジュール", "日程", "日程安排"]
---

# Schedule Skill

## Tool Usage Guidelines

- Schedule creation request → call `create_schedule`
- Schedule list request → call `list_schedules`
- Schedule cancellation request → call `cancel_schedule`
- Time format is HH:MM (24-hour) — "8 PM" becomes 20:00.

## Recurrence Classification

- daily: repeats every day ("every morning at 9")
- weekly: specific day each week ("every Friday")
- monthly: specific date each month ("on the 1st of every month")
- one-time: one-off occurrence ("next Monday")

## Response Style

- Confirm the scheduled time and content after creation.
- Confirm which schedule is being cancelled before processing.
- Report types: weekly (weekly spending), daily_summary (daily summary), budget (budget), custom_reminder (custom reminder)

## Tool Result Handling

- If the tool returns a **success** message, relay that result to the user.
- If the tool returns an **error or failure** message, honestly relay that message to the user.
- Never respond that a schedule was created, cancelled, or completed without actually calling the tool.
