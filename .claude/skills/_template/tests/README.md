# Skill Test Framework

이 디렉토리는 스킬 테스트 예시를 포함합니다.

## 테스트 구조

```
tests/
├── README.md           # 이 파일
├── examples.yaml       # 입력/출력 예시 정의
└── scenarios/          # 시나리오별 테스트 케이스
    ├── basic.md        # 기본 사용 시나리오
    └── advanced.md     # 고급 사용 시나리오
```

## examples.yaml 형식

```yaml
name: jikime-example-skill
tests:
  - name: "기본 사용"
    description: "스킬의 기본 기능 테스트"
    input: |
      사용자 요청 예시
    expected_behavior:
      - "예상되는 동작 1"
      - "예상되는 동작 2"
    keywords_triggered:
      - "keyword1"
      - "keyword2"

  - name: "에지 케이스"
    description: "경계 조건 테스트"
    input: |
      특수한 입력 예시
    expected_behavior:
      - "예상되는 동작"
    should_not:
      - "하면 안 되는 동작"
```

## 테스트 실행

```bash
# 모든 스킬 테스트
python scripts/test_skills.py

# 특정 스킬만
python scripts/test_skills.py --skill jikime-marketing-seo

# 상세 출력
python scripts/test_skills.py --verbose
```

## 테스트 작성 가이드라인

### 1. 입력 예시 (Input)
- 실제 사용자가 입력할 만한 내용 작성
- 다양한 표현 방식 포함 (한국어/영어)
- 명확한 의도가 드러나는 예시

### 2. 예상 동작 (Expected Behavior)
- 스킬이 반드시 수행해야 할 동작
- 검증 가능한 구체적 결과
- 출력에 포함되어야 할 요소

### 3. 금지 동작 (Should Not)
- 스킬이 하면 안 되는 동작
- 잘못된 정보 생성
- 범위를 벗어난 응답

### 4. 트리거 검증 (Keywords Triggered)
- 이 입력으로 트리거되어야 할 키워드
- 트리거 설정의 정확성 검증
