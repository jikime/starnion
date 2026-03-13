# 인수 기준: SPEC-I18N-001

## 성공 기준

- [ ] 모든 기능 요구사항 구현 완료
- [ ] 테스트 커버리지 >= 80%
- [ ] 기존 한국어 하드코딩 문자열 제거 (agent/gateway/ui 전체)
- [ ] 4개 언어(ko/en/ja/zh) 모두에서 LLM 응답이 해당 언어로 생성됨을 검증
- [ ] 기존 한국어 사용자의 동작이 변경되지 않음 (하위 호환성)

## 테스트 시나리오

### Scenario 1: 언어 설정 저장 (Happy Path)

**Given** 사용자가 설정 > 계정 탭에 접근해 있고, 현재 언어가 `ko`로 설정되어 있다.
**When** 사용자가 언어 선택기에서 `en`(English)을 선택하고 저장 버튼을 클릭한다.
**Then** `users.preferences->>'language'`가 `en`으로 업데이트되고, UI에 저장 성공 피드백이 표시된다.

### Scenario 2: Agent 영어 응답 (Happy Path)

**Given** 사용자의 `preferred_language`가 `en`이다.
**When** 사용자가 "오늘 얼마 썼어?"라고 한국어로 질문한다.
**Then** Agent는 시스템 프롬프트에 "Always respond in English." 지시어가 주입되어, LLM이 영어로 응답을 생성한다.

### Scenario 3: 언어 설정 없는 사용자 (기본값)

**Given** 기존 사용자로, `users.preferences`에 `language` 키가 없다.
**When** Agent가 해당 사용자의 `get_user_language(user_id)`를 호출한다.
**Then** 함수는 `"ko"`를 반환하고, 기존과 동일하게 한국어 응답이 생성된다.

### Scenario 4: Telegram 영어 사용자 (Happy Path)

**Given** 사용자의 `preferred_language`가 `en`이고, Telegram 봇과 연동되어 있다.
**When** 사용자가 Telegram에서 `/start` 명령을 입력한다.
**Then** 봇이 "Hello! I'm Nion (Starnion)..."와 같이 영어로 환영 메시지를 전송한다.

### Scenario 5: 지원하지 않는 언어 코드 거부 (Error Case)

**Given** 사용자가 설정 API를 통해 `language: "fr"` (미지원 언어)를 전송한다.
**When** `PATCH /api/settings/account` 요청이 처리된다.
**Then** HTTP 400 Bad Request와 함께 지원 언어 목록이 에러 응답에 포함된다.

### Scenario 6: 주간 리포트 다국어 (Happy Path)

**Given** 사용자의 `preferred_language`가 `ja`이다.
**When** 크론 작업이 해당 사용자의 주간 리포트를 생성한다.
**Then** LLM 프롬프트에 "常に日本語で回答してください。" 지시어가 포함되어, 일본어 리포트가 생성된다.

### Scenario 7: UI 한글 하드코딩 제거 검증 (Quality)

**Given** 개발자가 `settings/page.tsx` 파일을 검사한다.
**When** 파일 내 한글 문자열(가-힣)을 검색한다.
**Then** 모든 한글 텍스트가 `t("...")` next-intl 번역 함수로 대체되어 있고, 직접 한글 리터럴이 존재하지 않는다.

### Scenario 8: 페르소나 BASE_PROMPT 중립화 검증 (Quality)

**Given** 개발자가 `persona.py`의 `BASE_PROMPT`를 검사한다.
**When** `항상 한국어로 응답` 문자열을 검색한다.
**Then** 해당 문자열이 `BASE_PROMPT`에 존재하지 않고, `LANGUAGE_INSTRUCTIONS` dict를 통해 동적으로 주입된다.

## 품질 게이트

| 게이트 | 기준 | 상태 |
|--------|------|------|
| Agent 유닛 테스트 | `build_system_prompt()` 4개 언어 검증 | Pending |
| API 통합 테스트 | `GET/PATCH /api/settings/account` language 필드 | Pending |
| UI 빌드 | TypeScript 컴파일 에러 없음 | Pending |
| 보안 스캔 | 언어 코드 인젝션 방지 검증 | Pending |
| 하위 호환성 | 기존 한국어 사용자 응답 동일함 | Pending |
| i18n 완성도 | 4개 messages/*.json 동일 키셋 | Pending |

## 완료 정의 (Definition of Done)

- [ ] 모든 인수 기준 충족
- [ ] `persona.py` `BASE_PROMPT`에 언어 고정 지시어 없음
- [ ] `skills/report`, `skills/goals`, `skills/conversation`, `skills/pattern`, `skills/audio` 프롬프트 국제화
- [ ] `telegram/bot.go` 한글 메시지 다국어 맵으로 교체
- [ ] `settings/page.tsx` 한글 하드코딩 전체 제거
- [ ] 4개 언어 messages/*.json에 language 관련 번역 키 추가
- [ ] DB 마이그레이션 스크립트 작성 완료
- [ ] 코드 리뷰 완료
- [ ] 스테이징 환경에서 4개 언어 E2E 테스트 통과
