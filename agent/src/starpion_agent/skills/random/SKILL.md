---
skill_id: random
version: "1.0"
tools:
  - random_pick
---

# 랜덤 스킬

## 도구

### random_pick
랜덤 선택, 숫자 뽑기, 동전 던지기, 주사위 굴리기 등을 수행합니다.

**파라미터:**
- `mode` (선택, 기본값 "choice"): 랜덤 모드
  - `choice`: 목록에서 랜덤 선택
  - `number`: 숫자 범위에서 랜덤 뽑기
  - `shuffle`: 목록 순서 섞기
  - `coin`: 동전 던지기
  - `dice`: 주사위 굴리기
  - `string`: 랜덤 문자열 생성
- `items` (선택): 쉼표로 구분된 선택 항목 (choice/shuffle 모드)
- `min_val` (선택, 기본값 1): 최소값 (number 모드)
- `max_val` (선택, 기본값 100): 최대값 (number 모드)
- `count` (선택, 기본값 1): 선택/주사위/문자열 개수
- `length` (선택, 기본값 16): 문자열 길이 (string 모드, 1-200)
- `charset` (선택, 기본값 "alphanumeric"): 문자열 구성 (string 모드)
  - `alphanumeric`: 영문+숫자
  - `alpha`: 영문만
  - `numeric`: 숫자만
  - `hex`: 16진수 (0-9, a-f)
  - `password`: 영문+숫자+특수문자

**사용 시나리오:**
- "짜장면, 짬뽕 중에 골라줘" → random_pick(mode="choice", items="짜장면,짬뽕")
- "1부터 45까지 6개 뽑아줘" → random_pick(mode="number", min_val=1, max_val=45, count=6)
- "동전 던져줘" → random_pick(mode="coin")
- "주사위 2개 굴려줘" → random_pick(mode="dice", count=2)
- "발표 순서 정해줘: 철수,영희,민수" → random_pick(mode="shuffle", items="철수,영희,민수")
- "랜덤 문자열 만들어줘" → random_pick(mode="string")
- "비밀번호 생성해줘" → random_pick(mode="string", charset="password", length=20)
- "랜덤 문자열 8자리 3개" → random_pick(mode="string", length=8, count=3)
- "16진수 토큰 32자리" → random_pick(mode="string", charset="hex", length=32)

**주의사항:**
- choice 모드에서 count가 항목 수보다 크면 전체 항목이 선택됩니다.
- number 모드에서 count > 1이면 중복 없이 뽑습니다 (범위가 충분할 때).
- string 모드의 문자열은 암호학적으로 안전하지 않습니다 (보안 용도 비권장).
