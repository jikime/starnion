---
title: D-Day
nav_order: 6
parent: Features
---

# D-Day

## Overview

The D-Day feature provides a real-time countdown showing how many days remain until an important date. Register dates you want to remember — birthdays, anniversaries, exams, travel departure dates — and the AI will instantly answer questions like "how many days until my exam?"

You can register up to 30 D-Days, and both future dates (D-N) and past dates (D+N) are supported.

---

## Registering a D-Day

### Registering on the Web

1. Click **D-Day** in the sidebar.
2. Click the **+ Add D-Day** button.
3. Enter the following information:
   - **Name** (required): the D-Day title (e.g., Birthday, TOEIC Exam)
   - **Date** (required): the target date (select from a calendar)
   - **Icon** (optional): a representative emoji (default: 📅)
   - **Description** (optional): additional notes
4. Click **Save**.

The D-Day list is sorted in ascending date order (closest date first).

### Registering via Chat

Tell the AI in natural language and it will set up the D-Day automatically.

**Example conversations:**

> User: "Set a D-Day for Christmas"
>
> AI: "Christmas D-Day is set! D-292 until December 25, 2025 🎄"

> User: "Set our wedding anniversary as a yearly recurring D-Day on May 20th"
>
> AI: "Wedding anniversary D-Day set as yearly recurring! D-73 until the next anniversary (5/20) 💍"

> User: "My TOEIC exam is on June 15th. Set a D-Day for it."
>
> AI: "TOEIC exam D-Day is set! D-99 days until the exam (6/15). Good luck! 📝"

**Natural language date expressions:**
The AI automatically converts natural language date expressions:

| Expression | Converted to |
|------------|--------------|
| "Next Monday" | The date of next Monday |
| "End of this month" | The last day of the current month |
| "Christmas" | December 25 |
| "June 15th" | YYYY-06-15 |
| "My birthday March 10th" | YYYY-03-10 |

---

## D-N vs D+N

Understanding how D-Day counts work lets you get more out of the feature.

### D-N (Days remaining)

Shows the number of days remaining until a future date.

```
Today: March 8, 2025
Target date: June 15, 2025
Display: D-99
```

### D-Day! (The day itself)

Displayed when today matches the registered date.

```
Today: June 15, 2025
Target date: June 15, 2025
Display: D-Day!
```

### D+N (Days elapsed)

Shows the number of days that have passed since a past date. Useful when you register a past date such as an anniversary.

```
Today: March 8, 2025
Target date: March 8, 2024
Display: D+365
```

### Usage Examples

| Purpose | Date example | Display example |
|---------|-------------|-----------------|
| Exam D-Day | 2025-06-15 | D-99 |
| Wedding anniversary (today) | 2025-03-08 | D-Day! |
| Day you met your partner | 2024-01-01 | D+431 |
| Travel departure | 2025-04-01 | D-24 |

---

## Notifications

D-Day notifications currently work by querying them actively via chat, or by checking the weekly report.

### Included in Weekly Reports

Upcoming D-Day information is included in each week's automatically generated report:

```
[Upcoming D-Days]
- D-7: TOEIC Exam (6/15)
- D-30: Friend's Birthday (4/7)
- D-93: Jeju Island Trip (6/9)
```

### Checking via Chat

Ask the AI any time to see the current D-Day status:

> User: "When is my next D-Day?"
>
> AI: "Your closest D-Day is **TOEIC Exam**. D-7, on June 15th. Give it everything you've got for the final stretch!"

> User: "Are there any D-Days this month?"
>
> AI: "There are 2 D-Days this month:\n- 3/10 (D-2): Parents' wedding anniversary\n- 3/20 (D-12): Project deadline"

---

## Examples: Various D-Day Uses

### Birthday

```
Name: Mom's birthday
Date: 2025-04-15
Icon: 🎂
Description: Don't forget to prepare a gift!
```

> User: "When is Mom's birthday?"
> AI: "Mom's birthday is April 15th. D-38 to go. Get a gift ready in advance! 🎂"

### Anniversary

```
Name: Day we first met
Date: 2023-11-25
Icon: 💕
```

> User: "How many days have we been together?"
> AI: "From November 25, 2023 to today is D+468. You've been together for over a year! 💕"

### Exam

```
Name: IELTS Exam
Date: 2025-05-10
Icon: 📝
Description: Target score: 7.0
```

> User: "How much time is left until the exam?"
> AI: "D-63 until the IELTS exam. It's on May 10th. How is your preparation going? 📝"

### Travel

```
Name: Japan trip departure
Date: 2025-05-01
Icon: ✈️
Description: Osaka, 4 nights 5 days
```

> User: "How many days until the trip?"
> AI: "D-54 until the Japan trip departure. How exciting! Time to start packing ✈️"

### Project Deadline

```
Name: Q2 Report Deadline
Date: 2025-03-31
Icon: 📊
Description: Submit to team lead
```

---

## Querying with AI

You can query D-Days in a variety of ways from chat.

```
User: "When is the next anniversary?"
AI: "The closest registered anniversary is the **wedding anniversary**. D-73, on May 20th 💍"

User: "How many days until the exam?"
AI: "D-99 until the TOEIC exam. It's on June 15th. A little preparation every day will be more than enough!"

User: "Show me the full D-Day list"
AI: "Here are your registered D-Days:
  1. D-7: TOEIC Exam (6/15) 📝
  2. D-30: Friend's Birthday (4/7) 🎂
  3. D-54: Japan Trip (5/1) ✈️
  4. D-73: Wedding Anniversary (5/20) 💍
  5. D+5: Company Foundation Day (3/3) 🏢"

User: "Show past D-Days too"
AI: "Full list including past D-Days:
  [Upcoming]
  - D-7: TOEIC Exam
  ...
  [Past]
  - D+5: Company Foundation Day (3/3)"

User: "Delete the Christmas D-Day"
AI: "Christmas D-Day has been deleted."
```

---

## FAQ

**Q. How many D-Days can I register?**
Up to 30. Once you reach 30, you will need to delete an older D-Day before adding a new one.

**Q. How do I set up a yearly recurring anniversary?**
In chat, say "set it as a yearly recurring event," or enable the **Repeat** option on the web registration screen. Once the set date passes, it automatically updates to the following year's date.

**Q. Is the countdown recalculated automatically based on today's date?**
Yes, the D-Day value is recalculated automatically every day. If it was D-10 yesterday, it will show D-9 today.

**Q. Can I edit a D-Day?**
Click on a D-Day in the web to open the edit screen, where you can change the date, name, icon, and description.

**Q. How does a past date appear when registered as a D-Day?**
Past dates are displayed in D+N format. This is useful when you want to commemorate elapsed time, such as the day you first met a partner or your company start date.

**Q. Are D-Days automatically included in the weekly report?**
Yes, upcoming D-Days within D-30 are automatically included when the weekly report is generated. This lets you review important upcoming dates before the week begins.
