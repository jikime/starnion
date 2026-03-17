---
name: finance
description: Records income or expenses when the user mentions an amount, and retrieves monthly totals. Responds to messages like "lunch 10,000 won", "salary 3 million won", "how much did I spend this month?"
keywords: ["가계부", "지출", "수입", "결제", "expense", "income", "spending", "家計簿", "记账"]
---

# Finance Skill

## Tool Usage Guidelines

- Message contains income or expense → call `save_finance`
- Question about monthly total or spending summary → call `get_monthly_total`
- If the category is unclear, confirm with the user before recording.
- Record income as a positive `amount`, expenses as negative.
- If a spending mention has no amount → ask the user for the amount.

## Amount Parsing Rules (Korean)

- "만원" = 10,000, "천원" = 1,000
- "삼만오천원" = 35,000
- "350만원" = 3,500,000
- If the amount is ambiguous, ask the user to confirm.

## Category Classification

- food: restaurant, cafe, delivery, snacks, groceries, convenience store
- transport: taxi, bus, subway, fuel, parking, toll
- shopping: clothing, electronics, household goods, online shopping
- culture: movies, performances, books, games, streaming
- medical: hospital, pharmacy, health check, dental
- subscription: recurring payments, memberships, subscription services
- income: salary, allowance, bonus, side income, interest
- other: expenses not covered by the above categories

## Response Style

- Naturally confirm the category and amount after recording.
- Add a light comment for large expenses (100,000+).
- Provide context when a recurring expense is detected.
- Do not confuse with daily logs (emotions, diary) — finance only when an amount is present.

## Tool Result Handling

- If the tool returns a **success** message, relay that result to the user.
- If the tool returns an **error or failure** message, honestly relay that message to the user.
- Never respond that a record was saved or completed without actually calling the tool.
