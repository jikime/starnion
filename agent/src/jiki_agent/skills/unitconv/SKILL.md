---
skill_id: unitconv
version: "1.0"
tools:
  - convert_unit
---

# 단위변환 스킬

## 도구

### convert_unit
단위를 변환합니다.

**파라미터:**
- `value` (필수): 변환할 값
- `from_unit` (필수): 원본 단위
- `to_unit` (필수): 대상 단위

**지원 단위:**

| 카테고리 | 단위 |
|----------|------|
| 길이 | mm, cm, m, km, in, ft, yd, mi |
| 무게 | mg, g, kg, lb, oz, ton |
| 온도 | C (섭씨), F (화씨), K (켈빈) |
| 부피 | ml, l, gal, cup, fl_oz |
| 면적 | sqm, sqkm, sqft, pyeong, acre, ha |
| 데이터 | B, KB, MB, GB, TB |

**사용 시나리오:**
- "10km는 마일로 얼마야?" → convert_unit(value=10, from_unit="km", to_unit="mi")
- "화씨 100도는 섭씨로?" → convert_unit(value=100, from_unit="F", to_unit="C")
- "30평은 몇 제곱미터?" → convert_unit(value=30, from_unit="pyeong", to_unit="sqm")
- "5파운드는 몇 킬로?" → convert_unit(value=5, from_unit="lb", to_unit="kg")
- "2GB는 몇 MB?" → convert_unit(value=2, from_unit="GB", to_unit="MB")

**주의사항:**
- 같은 카테고리 내에서만 변환 가능합니다 (예: 길이↔길이, 무게↔무게).
- 온도 변환은 공식 기반으로 정확히 계산됩니다.
- pyeong(평)은 한국식 면적 단위입니다.
