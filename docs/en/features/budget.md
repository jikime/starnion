---
title: Budget
nav_order: 17
parent: Features
grand_parent: 🇺🇸 English
---

# Budget

## Overview

The Budget feature lets you **set monthly budgets by category and monitor spending in real time**. A progress bar visualizes actual spending against your budget at a glance. When spending exceeds 80% of a category budget, you receive a warning to prevent overspending.

> Budgets are automatically linked to your expense records. Ask Nion "How much food budget do I have left this month?"

---

## Setting a Budget

### On the Web

1. Click **Budget** in the sidebar.
2. Click the **+ Add Budget** button.
3. Enter the following:
   - **Category** (required): Food, Transport, Shopping, Leisure, Medical, Education, etc.
   - **Monthly Amount** (required): Budget for the category
4. Click **Save**.

The total budget is automatically calculated as the sum of all category budgets.

### Via Chat

You can set budgets by telling the AI in natural language.

**Example:**

> User: "Set my food budget to $500 this month"
>
> AI: "I've set your food budget to $500! Current food spending is $215, which is 43% of the budget."

---

## Viewing Budget Status

### Dashboard

The Budget page shows the following for each category:

| Item | Description |
|------|-------------|
| **Category** | Budget category name |
| **Progress bar** | Visual ratio of spending vs. budget |
| **Spent / Budget** | Current spending / set budget (e.g., $215 / $500) |
| **Usage (%)** | Percentage of budget spent |
| **Status icon** | Safe (green), Caution (orange), Warning (red) |

### Progress Bar Colors

| Usage | Color | Meaning |
|-------|-------|---------|
| 0–60% | Green | Safe zone |
| 60–80% | Orange | Caution zone |
| 80–100% | Red | Warning zone |
| 100%+ | Dark red | Over budget |

---

## Over-Budget Warnings

You are automatically warned when spending exceeds 80% of a category budget.

### Warning Methods

- **Web dashboard**: Progress bar turns red
- **Chat notification**: AI alerts you when recording an expense that pushes close to the limit
- **Weekly report**: Budget status included in the weekly summary

### Warning Example

> User: "Spent $45 on dinner tonight"
>
> AI: "Recorded $45 for dinner under Food. Heads up — you've used 87% of your food budget ($500). You have $65 left. You might want to pace yourself!"

---

## Editing and Deleting Budgets

### Edit on Web

- Click a budget entry to open the edit screen.
- Change the amount and click **Save**.

### Edit via Chat

> User: "Raise my food budget to $600"
>
> AI: "Updated your food budget to $600. Usage is now at 36%."

### Delete

> User: "Delete the transport budget"
>
> AI: "Deleted the transport budget. Your total budget is now $500."

---

## FAQ

**Q. Is the budget automatically reset every month?**

Yes, budgets reset on the 1st of each month. Only spending amounts are reset; your budget settings are preserved.

**Q. Can I set a total budget without per-category budgets?**

Currently only per-category budgets are supported. You can use a "Miscellaneous" category as a catch-all.

**Q. Does exceeding the budget block expense recording?**

No, expenses are always recorded regardless of budget status. You will only see a warning — recording is never restricted.

**Q. Does it sync automatically with expense records?**

Yes, expenses recorded in the finance section are automatically reflected in the corresponding budget category. No additional setup is needed.
