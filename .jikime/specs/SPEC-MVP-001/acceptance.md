# Acceptance Criteria: SPEC-MVP-001

## Success Criteria

- [ ] Telegram /start 명령어로 프로필 자동 생성 및 한국어 환영 메시지 출력
- [ ] 자연어 지출 메시지 -> save_finance Tool -> PostgreSQL INSERT 전체 흐름 동작
- [ ] 월별 합계 질문 -> get_monthly_total Tool -> PostgreSQL SELECT SUM 전체 흐름 동작
- [ ] LangGraph checkpointer로 대화 맥락 유지 (후속 메시지에서 이전 내용 참조 가능)
- [ ] Docker Compose로 PostgreSQL + Agent 통합 실행 가능
- [ ] 단위 테스트 커버리지 >= 85% (Tool, Repository)
- [ ] 에러 발생 시 사용자 친화적 한국어 메시지 응답

## Test Scenarios

### Scenario 1: /start 명령어 온보딩 (Happy Path)

**Given** 사용자 "홍길동" (telegram_id: "123456")이 jiki 봇에 처음 접속한 상태
**When** /start 명령어를 전송한다
**Then**
- 한국어 환영 메시지가 "반가워요, 홍길동님! 저는 지기예요." 로 시작한다
- 사용 가이드가 포함된다 (지출 기록 예시, 조회 예시)
- profiles 테이블에 telegram_id="123456", user_name="홍길동" 레코드가 존재한다

### Scenario 2: 자연어 지출 기록 (Happy Path)

**Given** 프로필이 등록된 사용자 (telegram_id: "123456")
**When** "오늘 점심 만원 썼어" 메시지를 전송한다
**Then**
- LLM이 save_finance Tool을 호출한다
- Tool 파라미터: category="식비", amount=10000, description="점심"
- finances 테이블에 해당 레코드가 INSERT된다
- 응답에 "식비", "10,000원", "기록" 키워드가 포함된다
- 응답에 이번 달 식비 누적 합계가 포함된다

### Scenario 3: 다양한 자연어 지출 표현 (Happy Path)

**Given** 프로필이 등록된 사용자
**When** 다음 메시지들을 각각 전송한다:
  - "스타벅스 아이스아메리카노 4,500원"
  - "택시비 12,000원"
  - "월급 350만원 들어왔어"
**Then**
  - 각각 save_finance Tool이 호출된다
  - 파싱 결과: (카페, 4500), (교통, 12000), (수입, 3500000)
  - 모든 기록이 finances 테이블에 저장된다
  - 각 응답은 한국어로 확인 메시지를 포함한다

### Scenario 4: 월별 합계 조회 (Happy Path)

**Given** 사용자의 이번 달 finances 테이블에 다음 레코드가 존재한다:
  - (식비, 10000), (식비, 15000), (카페, 4500), (교통, 12000)
**When** "이번 달 식비 얼마 썼어?" 메시지를 전송한다
**Then**
- LLM이 get_monthly_total Tool을 호출한다
- Tool 파라미터: category="식비"
- 응답에 "25,000원" (10000 + 15000)이 포함된다

### Scenario 5: 전체 카테고리 합계 조회

**Given** 사용자의 이번 달 finances 테이블에 다양한 카테고리 레코드가 존재한다
**When** "이번 달 총 지출 알려줘" 메시지를 전송한다
**Then**
- get_monthly_total Tool이 호출된다 (category="" 또는 전체)
- 응답에 전체 합계와 카테고리별 내역이 포함된다

### Scenario 6: 대화 컨텍스트 유지 (Checkpointer)

**Given** 사용자가 "커피 4,500원" 메시지를 보낸 상태 (이전 대화 기록 존재)
**When** "아까 기록한 거 맞아?" 후속 메시지를 전송한다
**Then**
- LangGraph checkpointer를 통해 이전 대화 내용을 참조한다
- 응답에 커피 4,500원 기록에 대한 언급이 포함된다

### Scenario 7: 프로필 자동 생성 (/start 없이)

**Given** 프로필이 없는 신규 사용자 (telegram_id: "789012")
**When** /start 없이 바로 "점심 8천원" 메시지를 전송한다
**Then**
- profiles 테이블에 프로필이 자동 생성된다
- save_finance Tool이 정상 호출되어 기록이 저장된다
- 에러 없이 정상 응답한다

### Scenario 8: 일반 대화 (Tool 미호출)

**Given** 프로필이 등록된 사용자
**When** "오늘 날씨 어때?" 메시지를 전송한다
**Then**
- save_finance, get_monthly_total 어느 Tool도 호출되지 않는다
- 일반적인 대화 응답을 한국어로 반환한다

### Scenario 9: 데이터베이스 연결 실패 (Error Case)

**Given** PostgreSQL 서버가 중지된 상태
**When** 사용자가 "점심 만원" 메시지를 전송한다
**Then**
- 내부 에러 스택 트레이스가 사용자에게 노출되지 않는다
- "잠시 서비스에 문제가 있어요. 잠시 후 다시 시도해주세요." 등의 사용자 친화적 메시지가 응답된다
- 에러 내용이 서버 로그에 기록된다

### Scenario 10: 금액이 불명확한 메시지 (Edge Case)

**Given** 프로필이 등록된 사용자
**When** "오늘 영화 봤어" (금액 없음) 메시지를 전송한다
**Then**
- save_finance Tool이 호출되지 않는다
- 또는 LLM이 금액을 확인하는 후속 질문을 한다
- 잘못된 데이터가 DB에 저장되지 않는다

### Scenario 11: 수입 기록 (Happy Path)

**Given** 프로필이 등록된 사용자
**When** "월급 350만원 들어왔어" 메시지를 전송한다
**Then**
- save_finance Tool이 호출된다
- Tool 파라미터: category="수입", amount=3500000
- finances 테이블에 양수 금액으로 기록된다
- 응답에 "수입", "3,500,000원" 키워드가 포함된다

### Scenario 12: /start 재실행 (중복 방지)

**Given** 이미 프로필이 존재하는 사용자 (telegram_id: "123456")
**When** /start 명령어를 다시 전송한다
**Then**
- 기존 프로필이 중복 생성되지 않는다 (UPSERT)
- 환영 메시지가 정상 출력된다
- 기존 금융 데이터가 유지된다

## Quality Gates

| Gate | Criteria | Target | Status |
|------|----------|--------|--------|
| Unit Tests | Tool 로직 (save_finance, get_monthly_total) 단위 테스트 | Coverage >= 85% | Pending |
| Unit Tests | Repository 로직 (finance, profile) 단위 테스트 | Coverage >= 85% | Pending |
| Integration Tests | DB 연동 테스트 (testcontainers-python) | 핵심 CRUD 시나리오 통과 | Pending |
| Schema Validation | Tool args_schema에 Optional[T] 미사용 확인 | 0 violations | Pending |
| Performance | 전체 응답 시간 (Tool 호출 포함) | < 5초 | Pending |
| Performance | DB 쿼리 응답 시간 | < 200ms | Pending |
| Security | 환경 변수로 비밀 정보 관리 (.env) | No hardcoded secrets | Pending |
| Security | 로그에 민감 정보 미포함 | No API keys in logs | Pending |
| Error Handling | DB 실패 시 사용자 친화적 메시지 | 스택 트레이스 미노출 | Pending |
| Persona | 모든 응답이 한국어 | 100% Korean responses | Pending |
| Docker | docker-compose up 후 전체 흐름 동작 | E2E smoke test pass | Pending |

## Definition of Done

- [ ] 모든 Primary Goals 마일스톤 완료
- [ ] 12개 테스트 시나리오 중 Scenario 1-8, 11-12 통과 (필수)
- [ ] 단위 테스트 커버리지 >= 85% (Tool + Repository)
- [ ] Docker Compose로 PostgreSQL + Agent 통합 실행 확인
- [ ] /start -> 지출 기록 -> 조회 E2E 수동 테스트 통과
- [ ] 코드에 hardcoded secret 없음
- [ ] args_schema에 Optional[T] 패턴 없음
- [ ] 에러 발생 시 사용자 친화적 메시지 응답 확인
- [ ] pyproject.toml 의존성 업데이트 완료
- [ ] .env.example에 필수 환경 변수 문서화 완료

## Test Commands

```bash
# 단위 테스트 실행
cd agent && uv run pytest tests/unit/ -v --cov=jiki_agent --cov-report=term-missing

# 통합 테스트 실행 (Docker PostgreSQL 필요)
cd agent && uv run pytest tests/integration/ -v

# 전체 테스트
cd agent && uv run pytest tests/ -v --cov=jiki_agent

# Lint 검사
cd agent && uv run ruff check src/

# Docker Compose 통합 실행
cd docker && docker compose up --build

# 수동 E2E 테스트
# 1. Telegram에서 /start 전송
# 2. "오늘 점심 만원 썼어" 전송
# 3. "이번 달 식비 얼마 썼어?" 전송
# 4. 각 응답이 정상적인지 확인
```
