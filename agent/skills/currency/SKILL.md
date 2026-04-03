---
name: currency
display_name: 환율
description: "Get currency exchange rates and convert amounts. Use for: 환율, 달러, 유로, 엔화, 환전, 얼마예요, USD/EUR/JPY/KRW conversion"
version: 1.0.0
emoji: "💱"
category: utility
enabled_by_default: true
requires_api_key: false
platforms: web, telegram, api
uses_provider: false
requires:
  bins:
    - starnion-currency
allowed-tools:
  - Bash
triggers:
  keywords:
    - 환율
    - 달러
    - 유로
    - 엔화
    - 위안
    - 원화
    - 환전
    - 외화
    - 얼마예요
    - exchange rate
    - currency
    - convert
    - USD
    - EUR
    - JPY
    - CNY
    - KRW
  when_to_use:
    - User asks for exchange rates between currencies
    - User wants to convert an amount from one currency to another
    - User asks how much a foreign currency is worth in KRW
    - User is planning a trip and asks about foreign currency
  - exec
---

# Currency Exchange

Use `starnion-currency` to check exchange rates and convert between currencies.

No user ID required for this tool (uses public API).

## Commands

### Get exchange rates
```bash
starnion-currency --user-id {user_id} rate --base USD --targets KRW,EUR,JPY
```

### Convert currency
```bash
starnion-currency --user-id {user_id} convert --amount 100 --from USD --to KRW
```

## Supported Currencies
USD, EUR, KRW, JPY, GBP, CNY, CHF, CAD, AUD, SGD, HKD, THB, INR

## Examples

User: "달러 환율 얼마야?"
```bash
starnion-currency --user-id abc123 rate --base USD --targets KRW,EUR,JPY
```

User: "100달러 원화로 바꾸면 얼마야?"
```bash
starnion-currency --user-id abc123 convert --amount 100 --from USD --to KRW
```
