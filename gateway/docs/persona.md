# 페르소나 시스템 테스트 방법

## 1. Telegram에서 직접 테스트

```bash
# 1) 서비스 실행
cd gateway && go run ./cmd/gateway
# (별도 터미널에서 agent도 실행)
```

**Telegram 봇에서:**

1. `/persona` 입력 → 인라인 키보드 5개 버튼 표시 확인
2. 버튼 클릭 (예: "친한 친구") → "친한 친구 모드로 전환했어요!" 확인
3. 아무 메시지 전송 → 반말 톤으로 응답 확인
4. 다른 페르소나로 전환 후 같은 메시지 → 톤 변화 확인

## 2. DB에서 페르소나 변경 확인

```sql
-- 현재 설정 확인
SELECT telegram_id, preferences->>'persona' AS persona
FROM profiles;

-- 수동으로 변경 테스트
UPDATE profiles
SET preferences = COALESCE(preferences, '{}'::jsonb) || '{"persona":"buddy"}'::jsonb
WHERE telegram_id = 'YOUR_USER_ID';

-- 기존 키(budget 등) 보존 확인
SELECT telegram_id, preferences FROM profiles WHERE telegram_id = 'YOUR_USER_ID';
```

## 3. 리포트 톤 테스트

```bash
# 리포트 API로 톤 적용 확인
curl -X POST http://localhost:8080/api/v1/report \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "YOUR_USER_ID", "chat_id": YOUR_CHAT_ID, "report_type": "weekly"}'

# 다른 리포트 타입도 테스트
# daily_summary, monthly_closing, pattern_insight, goal_status
```

## 4. 페르소나별 톤 비교 테스트

| 페르소나 | 기대 톤 | 테스트 메시지 |
|---------|---------|-------------|
| `assistant` | "~했어요, ~할게요" (존댓말) | "오늘 점심 만원" |
| `finance` | "~입니다, ~됩니다" (격식체) | "이번 달 지출 알려줘" |
| `buddy` | "~했어, ~할게" (반말) | "커피 5000원" |
| `coach` | "~해봐요!, ~할 수 있어요!" (격려체) | "예산 초과했어" |
| `analyst` | 수치 중심, 객관적 | "이번 주 분석해줘" |

## 5. 기본값 확인

```sql
-- persona 미설정 사용자 확인 (assistant 톤이어야 함)
UPDATE profiles SET preferences = '{"budget": {"식비": 300000}}'::jsonb
WHERE telegram_id = 'YOUR_USER_ID';
```

이 상태에서 메시지를 보내면 기본 `assistant` 톤(현재와 동일)으로 응답해야 합니다.

## 6. 에러 케이스

- preferences가 `NULL`인 사용자 → 기본 페르소나 적용 확인
- 존재하지 않는 persona ID → `personaNames` 맵에 없으면 무시 (bot.go에서 검증)
- 프로필이 없는 신규 사용자 → `DEFAULT_PERSONA` fallback 확인
