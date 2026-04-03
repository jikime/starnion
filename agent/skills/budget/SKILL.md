---
name: python3 budget/scripts/budget.py
display_name: 예산 관리
description: "Set and check monthly spending budgets per category. Use for: 예산, 지출 한도, 이번 달 예산, 카테고리 한도, 예산 초과, budget limit, spending cap"
version: 2.0.0
emoji: "💰"
category: finance
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
triggers:
  keywords:
    - 예산
    - 예산 설정
    - 한도
    - 지출 한도
    - 한달 예산
    - 카테고리 예산
    - 예산 초과
    - 예산 현황
    - budget
    - spending limit
    - monthly limit
    - budget status
    - over budget
  when_to_use:
    - User wants to set a monthly spending budget for a category
    - User asks to check remaining budget for a category
    - User asks if they are over budget
    - User says "이번 달 식비 예산 설정해줘" or "예산 현황 알려줘"
  not_for:
    - Recording individual transactions (use finance skill)
    - Viewing spending history (use finance skill)
---

# Budget Management

Use `python3 budget/scripts/budget.py` to set monthly spending limits and check budget status.

Always pass `--user-id {user_id}`.

## Commands

### Set a budget
```bash
python3 budget/scripts/budget.py --user-id {user_id} set --category {category} --amount {amount}
```

### Check budget status
```bash
# All categories
python3 budget/scripts/budget.py --user-id {user_id} status

# Specific category
python3 budget/scripts/budget.py --user-id {user_id} status --category 식비
```

## When to Use

- User wants to set a spending limit for a category (food, transport, shopping, etc.)
- User asks how much budget remains for a category or overall
- User wants to check current spending against their budget

## Category Inference

`--category` is a free-form label. Infer the appropriate label from context in any language:

| User intent | `--category` example |
|-------------|---------------------|
| Food / dining / meals | `식비` |
| Transport / commute / fuel | `교통` |
| Shopping / retail | `쇼핑` |
| Entertainment / culture | `문화` |
| Medical / health | `의료` |
| Subscriptions / services | `구독` |
| Other | `기타` |

> Use the category name that matches the user's existing budget entries. If unknown, infer from context.

## Examples

User: "Set food budget to 300,000 won"
```bash
python3 budget/scripts/budget.py --user-id abc123 set --category 식비 --amount 300000
```

User: "How much budget do I have left?"
```bash
python3 budget/scripts/budget.py --user-id abc123 status
```

User: "Show transport budget status"
```bash
python3 budget/scripts/budget.py --user-id abc123 status --category 교통
```
