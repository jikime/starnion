---
skill_id: color
version: "1.0"
tools:
  - convert_color
---

# 색상변환 스킬

## 도구

### convert_color
색상 코드를 HEX, RGB, HSL 형식으로 변환합니다.

**파라미터:**
- `color` (필수): 색상 값

**지원 입력 형식:**
- HEX: `#FF5733`, `#F00`, `FF5733`
- RGB: `rgb(255, 87, 51)`, `255,87,51`
- 영문 이름: `red`, `blue`, `coral`, `gold` 등 CSS 색상 이름
- 한글 이름: `빨강`, `파랑`, `노랑`, `초록`, `보라`, `하늘색` 등

**사용 시나리오:**
- "#FF5733 색상 정보 알려줘" → convert_color(color="#FF5733")
- "빨강색 RGB 값은?" → convert_color(color="빨강")
- "rgb(100,200,50) 헥스 코드는?" → convert_color(color="rgb(100,200,50)")
- "coral 색상 코드 알려줘" → convert_color(color="coral")

**주의사항:**
- HSL의 H는 0-360도, S와 L은 0-100% 범위입니다.
- RGB 값은 0-255 범위여야 합니다.
