---
skill_id: currency
version: "1.0"
tools:
  - convert_currency
  - get_exchange_rate
---

# 환율 스킬

## 도구

### convert_currency
통화를 환전합니다. 실시간 환율 기반으로 금액을 변환합니다.

**파라미터:**
- `amount` (필수): 변환할 금액
- `from_currency` (선택, 기본값 "USD"): 원본 통화 코드
- `to_currency` (선택, 기본값 "KRW"): 대상 통화 코드

**사용 시나리오:**
- "100달러 원화로 얼마야?" → convert_currency(amount=100, from_currency="USD", to_currency="KRW")
- "50유로를 엔화로" → convert_currency(amount=50, from_currency="EUR", to_currency="JPY")
- "만원이 달러로 얼마?" → convert_currency(amount=10000, from_currency="KRW", to_currency="USD")

### get_exchange_rate
현재 환율 정보를 조회합니다.

**파라미터:**
- `base` (선택, 기본값 "USD"): 기준 통화 코드
- `targets` (선택, 기본값 "KRW,EUR,JPY"): 대상 통화 코드 (쉼표 구분)

**사용 시나리오:**
- "달러 환율 알려줘" → get_exchange_rate(base="USD", targets="KRW")
- "유로 환율" → get_exchange_rate(base="EUR", targets="KRW,USD,JPY")
- "주요 환율 보여줘" → get_exchange_rate(base="KRW", targets="USD,EUR,JPY,CNY")

**지원 통화:** USD, EUR, KRW, JPY, GBP, CNY, CHF, CAD, AUD 등 주요 통화

**주의사항:**
- 환율은 Frankfurter API 기반 실시간 데이터입니다.
- 주말/공휴일에는 직전 영업일 환율이 표시됩니다.
