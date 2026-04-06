# Comprehensive Code Review Report

## Summary
- **Verdict**: BLOCK
- **Files Reviewed**: 14 primary files + cross-references
- **Total Findings**: 24 (Critical: 3, High: 6, Medium: 10, Low: 5)

---

## 1. Security Review

### CRITICAL-01: Python 스킬 스크립트 전체에 SQL Injection 취약점
- **Severity**: CRITICAL
- **파일**: `agent/skills/planner-tasks/scripts/planner_tasks.py`, 및 전체 skills/*.py (15개 이상 파일)
- **위치**: `cmd_search`, `cmd_add`, `cmd_list`, `cmd_update`, `cmd_delete`, `cmd_forward`, `cmd_memo` 등 전체 함수
- **문제**: 모든 Python 스킬 스크립트가 f-string으로 SQL을 조합하고, `esc()` 함수는 단순히 `'`를 `''`로 치환할 뿐입니다. 이것은 parameterized query가 아니며, SQL injection 공격에 취약합니다.

```python
# planner_tasks.py:41 - 직접 문자열 삽입
f"AND t.title ILIKE '%{kw}%' "

# planner_tasks.py:78 - user_id도 직접 삽입
f"WHERE user_id='{args.user_id}' AND task_date='{d}'"
```

`esc()` 함수의 단순 quote escaping은 다음을 방어하지 못합니다:
  - 백슬래시 이스케이프 (`\'`)
  - LIKE 패턴 와일드카드 삽입 (`%`, `_`)
  - PostgreSQL의 dollar-quote (`$$`) 또는 타입 캐스팅 악용

**특히 `args.user_id`는 AI 에이전트가 전달하는 값**으로, system prompt에서 `--user-id ${userId}`를 지정하지만, 에이전트가 조작된 user_id를 전달하면 다른 사용자의 데이터에 접근할 수 있습니다.

- **수정 권고**: `psql()` 함수를 parameterized query 지원으로 전면 리팩터링. psycopg2의 `cur.execute(sql, params)` 패턴 사용 필수.

---

### CRITICAL-02: `starnion_utils.psql()` 함수가 raw SQL 문자열을 직접 실행
- **Severity**: CRITICAL
- **파일**: `agent/skills/_shared/starnion_utils.py:143`
- **문제**: `cur.execute(sql)` 에서 파라미터 바인딩 없이 전체 SQL 문자열을 직접 실행합니다. 모든 스킬 스크립트가 이 함수를 통해 DB에 접근하므로, 이것이 전체 SQL injection 취약점의 근본 원인입니다.

```python
def psql(sql: str, db_url: str) -> str:
    cur.execute(sql)  # 파라미터 바인딩 없음!
```

- **수정 권고**: `psql(sql, params=None, db_url)` 시그니처로 변경하고 `cur.execute(sql, params)` 사용.

---

### CRITICAL-03: `code-block.tsx`에서 `dangerouslySetInnerHTML` 사용
- **Severity**: CRITICAL (조건부)
- **파일**: `web/components/chat/code-block.tsx:40`
- **문제**: `lowlight`의 `toHtml()` 출력을 `dangerouslySetInnerHTML`로 렌더링합니다. `code` prop이 AI 에이전트의 응답에서 오므로, 에이전트가 악의적인 HTML을 코드 블록에 삽입하면 XSS 공격이 가능합니다.

```tsx
<code dangerouslySetInnerHTML={{
  __html: toHtml(lowlight.highlight(language, code))
}} />
```

`lowlight`가 코드를 파싱하여 토큰화하므로 대부분의 경우 안전하지만, `lowlight`가 인식하지 못하는 언어에서 `highlightAuto`가 실패하면 원본 문자열이 그대로 전달될 가능성이 있습니다.

- **수정 권고**: `toHtml()` 출력에 DOMPurify 적용, 또는 토큰 기반 렌더링으로 전환.

---

### HIGH-01: JWT 토큰 refresh에 revocation 메커니즘 없음
- **Severity**: HIGH
- **파일**: `gateway/internal/adapter/handler/auth.go:302-342`
- **문제**: `RefreshToken` 엔드포인트가 유효한 JWT만 확인하고 새 토큰을 발급합니다. 토큰이 탈취되면 공격자가 무한정 refresh할 수 있으며, 이를 무효화할 방법이 없습니다.
  - Token blacklist/revocation list 없음
  - `jti` (JWT ID) 클레임 미사용
  - Device fingerprint 미검증

- **수정 권고**: Refresh token rotation 구현, 또는 최소한 token family tracking으로 탈취 감지.

---

### HIGH-02: WebSocket 인증에 query parameter로 JWT 전달
- **Severity**: HIGH
- **파일**: `gateway/internal/adapter/handler/ws.go:127`, `web/hooks/use-websocket-chat.ts:270`
- **문제**: `GET /ws?token=<jwt>`로 토큰을 전달합니다. 이는:
  - 서버 access log에 토큰이 기록될 수 있음
  - 브라우저 히스토리에 남음
  - Referrer 헤더로 누출 가능
  
  현재 `ws-token` 엔드포인트를 통해 별도 토큰을 발급하므로 메인 JWT 노출은 완화되었으나, 해당 ws-token의 만료 시간과 일회성 여부를 확인해야 합니다.

- **수정 권고**: ws-token을 short-lived (30초) + 일회용으로 설정. 사용 후 즉시 무효화.

---

### MEDIUM-01: `loginAttempts` in-memory rate limiting의 한계
- **Severity**: MEDIUM
- **파일**: `gateway/internal/adapter/handler/auth.go:22-60`
- **문제**: `sync.Map` 기반 in-memory rate limiting은 다중 인스턴스 배포 시 무효화됩니다. 공격자가 각 인스턴스에 분산 요청하면 lockout을 우회할 수 있습니다.
- **수정 권고**: Redis 기반 rate limiting으로 전환. 단일 인스턴스라면 현재 구현은 적절합니다.

---

### MEDIUM-02: Telegram 사용자에 빈 password_hash로 계정 생성
- **Severity**: MEDIUM
- **파일**: `gateway/internal/adapter/handler/telegram.go:171`
- **문제**: `password_hash: ''`로 사용자를 생성합니다. 이 계정이 웹 로그인과 연동되면 빈 패스워드로 인증될 위험이 있습니다.
- **수정 권고**: Telegram 전용 계정에 `is_password_auth_disabled = true` 플래그 추가, 또는 랜덤 불가능 해시 설정.

---

### MEDIUM-03: Budget/Statistics 핸들러에서 DB 에러 무시
- **Severity**: MEDIUM
- **파일**: `gateway/internal/adapter/handler/budget.go:224-225`, `statistics.go:155-176`
- **문제**: 여러 곳에서 `_, _ = h.db.ExecContext(...)` 패턴으로 에러를 무시합니다. 데이터 무결성 문제가 조용히 발생할 수 있습니다.
- **수정 권고**: 최소한 에러 로깅 추가.

---

## 2. Performance Review

### HIGH-03: Statistics 핸들러의 N+1 유사 패턴 (직렬 다중 쿼리)
- **Severity**: HIGH
- **파일**: `gateway/internal/adapter/handler/statistics.go:26-243` (GetStatistics), `288-504` (GetAnalytics)
- **문제**: `GetStatistics`는 **9개**, `GetAnalytics`는 **12개** 이상의 순차적 DB 쿼리를 실행합니다. 각 쿼리가 독립적이므로 병렬 실행이 가능합니다.

```go
// 현재: 순차적 실행 (9개 쿼리 x ~50ms = ~450ms)
trendRows, err := h.db.QueryContext(ctx, ...) // 1
catRows, err := h.db.QueryContext(ctx, ...)   // 2  
wdRows, err := h.db.QueryContext(ctx, ...)    // 3
// ... 6개 더
```

- **수정 권고**: `planner.go`의 Snapshot처럼 `errgroup`을 사용하여 병렬 실행. 예상 성능 개선: 4-5x.

---

### HIGH-04: Statistics `GetAnalytics`의 복잡한 UNION ALL 쿼리
- **Severity**: HIGH
- **파일**: `gateway/internal/adapter/handler/statistics.go:356-372`
- **문제**: `chat_messages` 테이블(레거시)과 `messages` 테이블을 UNION ALL로 합치는 패턴이 daily, hourly, weekly 쿼리에서 반복됩니다. 데이터 증가 시 성능 저하가 심합니다.
- **수정 권고**: 레거시 데이터를 `messages` 테이블로 마이그레이션하거나, materialized view 도입.

---

### MEDIUM-04: Planner store의 비효율적 computed functions
- **Severity**: MEDIUM
- **파일**: `web/lib/planner-store.ts:440-492`
- **문제**: `getTasksForDate`, `getCompletionScore`, `getRoleBalance` 등이 호출될 때마다 전체 tasks 배열을 필터링합니다. Zustand의 `get()` 패턴이므로 메모이제이션되지 않습니다.
- **수정 권고**: `useMemo`와 selector 패턴 도입, 또는 Zustand `subscribeWithSelector` 미들웨어 사용.

---

### MEDIUM-05: WebSocket polling 간격
- **Severity**: MEDIUM
- **파일**: `web/hooks/use-websocket-chat.ts:192`
- **문제**: WebSocket이 이미 연결된 상태에서 10초 간격으로 REST API polling도 수행합니다. 외부 메시지(Telegram) 동기화를 위해 필요하지만, WebSocket을 통한 push notification이 더 효율적입니다.
- **수정 권고**: Gateway에서 cross-platform message notification을 WS로 push하는 방식으로 개선.

---

### MEDIUM-06: Planner Snapshot의 후속 쿼리가 errgroup 밖에서 실행
- **Severity**: MEDIUM
- **파일**: `gateway/internal/adapter/handler/planner.go:227-248`
- **문제**: Weekly goals의 task count 조회가 `g.Wait()` 이후 별도 쿼리로 실행됩니다. errgroup 내부에서 함께 실행하면 더 효율적입니다.

---

## 3. Code Quality Review

### HIGH-05: `telegram.go` 파일 크기 (1,605줄)
- **Severity**: HIGH
- **파일**: `gateway/internal/adapter/handler/telegram.go`
- **문제**: 단일 파일에 1,605줄. 핸들러, 유틸리티, MinIO 업로드/다운로드, 앨범 버퍼링, 명령어 처리 등 여러 관심사가 혼합되어 있습니다.
- **수정 권고**: 최소한 다음으로 분리:
  - `telegram_handler.go` (HandleUpdate 메인 로직)
  - `telegram_commands.go` (명령어 핸들러)
  - `telegram_media.go` (파일 업/다운로드, 이미지/오디오 추출)
  - `telegram_user.go` (사용자 조회/생성)

---

### HIGH-06: Python 스킬 스크립트의 코드 중복
- **Severity**: HIGH
- **파일**: `agent/skills/planner-*/scripts/*.py` (12개 이상 파일)
- **문제**: 거의 동일한 패턴이 모든 스킬에서 반복됩니다:
  - `def esc(s)` 함수가 15개 파일에 각각 정의
  - `DB_URL = os.environ.get(...)` 보일러플레이트 반복
  - CRUD 패턴이 구조적으로 동일하지만 각각 수동 구현
- **수정 권고**: `_shared/starnion_utils.py`에 `esc()` 통합, 공통 CRUD 베이스 클래스 도입.

---

### MEDIUM-07: `planner-store.ts`의 `uid()` 함수가 암호학적으로 안전하지 않음
- **Severity**: MEDIUM
- **파일**: `web/lib/planner-store.ts:69`
- **문제**: `Math.random().toString(36).slice(2, 10)`은 충돌 가능성이 있고 예측 가능합니다. 낙관적 업데이트의 임시 ID로 사용되며 서버 응답으로 교체되므로 보안 위험은 낮지만, 동시 작업 시 충돌 가능성이 있습니다.
- **수정 권고**: `crypto.randomUUID()` 사용.

---

### MEDIUM-08: `use-websocket-chat.ts`의 `nanoid()` 동일 문제
- **Severity**: MEDIUM  
- **파일**: `web/hooks/use-websocket-chat.ts:40`
- **문제**: `uid()`와 동일한 `Math.random()` 기반 ID 생성.
- **수정 권고**: `crypto.randomUUID()` 또는 `nanoid` 패키지 사용.

---

### MEDIUM-09: `planner-store.ts`의 API 헬퍼에 에러 처리 부재
- **Severity**: MEDIUM
- **파일**: `web/lib/planner-store.ts:92-98`
- **문제**: `api.post`, `api.put` 등이 실패 시 `.catch(() => null)`로 조용히 무시합니다. 사용자는 서버 저장 실패를 알 수 없습니다.

```typescript
post: (path, body) => fetch(path, {...}).then(r => r.ok ? r.json() : null).catch(() => null)
```

- **수정 권고**: 실패 시 toast notification 또는 retry queue 도입.

---

### LOW-01: `addDaysStr` 함수가 `date-fns`와 중복
- **Severity**: LOW
- **파일**: `web/lib/planner-store.ts:76-80`
- **문제**: `date-fns`가 이미 import되어 있으나 (`format`), 날짜 계산은 수동으로 구현.
- **수정 권고**: `addDays`, `format` 등 `date-fns` 유틸리티 활용.

---

### LOW-02: `getToday()` 함수가 모듈 로드 시 1회만 실행
- **Severity**: LOW
- **파일**: `web/lib/planner-store.ts:72-74`
- **문제**: `const TODAY = getToday()`는 모듈 로드 시점에 고정됩니다. 자정을 넘기면 stale 값이 됩니다.
- **수정 권고**: 사용 시점에 동적으로 계산하도록 변경.

---

## 4. Architecture Review

### MEDIUM-10: Gateway 핸들러들의 반복적인 인증 패턴
- **Severity**: MEDIUM
- **파일**: 모든 handler 파일 (`planner.go`, `budget.go`, `statistics.go`)
- **문제**: 모든 핸들러 메서드 시작 부분에 동일한 인증 코드가 반복됩니다:

```go
userID, err := getUserIDFromContext(c)
if err != nil {
    return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
}
```

- **수정 권고**: Echo 미들웨어에서 user ID 추출을 공통화. `c.Get("userID")`로 접근.

---

### LOW-03: `proxy.ts` (middleware)가 인증 외 기능 부재
- **Severity**: LOW
- **파일**: `web/proxy.ts`
- **문제**: middleware가 `auth()` wrapper만 사용하며, API rate limiting, CORS, security headers 등이 없습니다. Next.js 자체 기능에 의존하고 있으나, 명시적 설정이 더 안전합니다.
- **수정 권고**: `next.config.ts`에 security headers (CSP, HSTS 등) 추가.

---

### LOW-04: 시스템 프롬프트에 user_id 노출
- **Severity**: LOW
- **파일**: `agent/src/system/prompt.ts:3`
- **문제**: `Your user's ID is: ${userId}`로 시스템 프롬프트에 user ID가 포함됩니다. 프롬프트 인젝션 공격 시 user ID가 노출될 수 있습니다. 다만 스킬 호출에 필요하므로 기능적으로는 필수입니다.
- **수정 권고**: user_id를 시스템 컨텍스트가 아닌 tool 호출 시 서버 사이드에서 주입하는 방식으로 변경 검토.

---

### LOW-05: Planner 컴포넌트 중 `right-panel.tsx` (838줄), `journal-tab.tsx` (783줄) 대형 파일
- **Severity**: LOW
- **파일**: `web/components/planner/right-panel.tsx`, `journal-tab.tsx`
- **문제**: 800줄 이상의 단일 컴포넌트 파일들. 코딩 스타일 가이드의 800줄 제한에 근접하거나 초과.
- **수정 권고**: 서브 컴포넌트로 분할.

---

## Recommendations (우선순위 순)

1. **[IMMEDIATE]** Python 스킬의 SQL injection 수정 - `psql()` 함수를 parameterized query 지원으로 전면 리팩터링. 이것이 가장 긴급한 보안 이슈입니다.

2. **[IMMEDIATE]** `code-block.tsx`의 XSS 방어 - DOMPurify 적용 또는 토큰 기반 렌더링 전환.

3. **[SHORT-TERM]** JWT revocation 메커니즘 도입 - token blacklist 또는 refresh token rotation.

4. **[SHORT-TERM]** Statistics 핸들러 errgroup 병렬화 - 사용자 체감 응답 시간 4-5배 개선 예상.

5. **[SHORT-TERM]** Telegram 핸들러 파일 분할 - 유지보수성 대폭 향상.

6. **[MEDIUM-TERM]** Python 스킬 공통 코드 리팩터링 - `esc()`, DB 보일러플레이트 통합.

7. **[MEDIUM-TERM]** Planner store에 에러 핸들링 및 retry 로직 추가.

8. **[LONG-TERM]** 레거시 `chat_messages` 테이블 마이그레이션.

---

*Review performed: 2026-04-06*
*Reviewer: J.A.R.V.I.S. Code Review System*
