---
name: 계산기
description: 수학 수식 계산 (사칙연산, 함수, 상수)
tools:
  - calculate
keywords: ["계산", "계산해줘", "수식", "calculate", "math", "compute", "計算して", "计算", "算一算"]
---

# 계산기 스킬

## 도구

### calculate
수학 수식을 계산합니다.

**파라미터:**
- `expression` (필수): 계산할 수식

**지원 연산:**
- 사칙연산: `+`, `-`, `*`, `/`, `//` (정수 나눗셈), `%` (나머지), `**` (거듭제곱)
- 수학 함수: `sqrt`, `abs`, `round`, `sin`, `cos`, `tan`, `log`, `log10`, `log2`, `ceil`, `floor`
- 상수: `pi` (3.14159...), `e` (2.71828...)

**사용 시나리오:**
- "2+3*4 계산해줘" → calculate(expression="2+3*4")
- "루트 144 구해줘" → calculate(expression="sqrt(144)")
- "sin(pi/2) 값은?" → calculate(expression="sin(pi/2)")
- "15% 팁 계산" → calculate(expression="50000*0.15")

**주의사항:**
- 보안을 위해 허용된 연산과 함수만 사용 가능합니다.
- 매우 큰 숫자의 거듭제곱은 제한될 수 있습니다.
