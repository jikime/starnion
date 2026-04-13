# StarNion 그룹웨어 기능 로드맵

> 작성일: 2026-04-10  
> 협업 관리는 기존 플래너(planner_tasks/roles/goals)로 대체.  
> Google OAuth 토큰(`google_tokens`) + `google-workspace` Agent 스킬 이미 존재 → Calendar/Contacts/Gmail 즉시 활용 가능.

---

## 기존 인프라 현황

| 인프라 | 현황 |
|--------|------|
| Google OAuth 토큰 | `google_tokens` 테이블 존재 → Calendar/Contacts/Gmail 재활용 |
| 파일 스토리지 | MinIO (S3) + `files` 테이블 + `file_sections` (벡터) |
| AI 스킬 | `google-workspace`, `audio` (Whisper), `image` (Vision) 등 26개 |
| 알림/스케줄 | `cron_schedules` + `notifications` + Scheduler (이벤트 기반) |
| 검색 | pgvector + tsvector 하이브리드 |
| 플래너 | `planner_roles/tasks/goals/diary/reflection/weekly_goals` |
| 재무 | `finances` + `budgets` |

---

## 1순위 — 외부 서비스 통합

### Phase 1: 캘린더

**목표:** 구글 캘린더 양방향 동기화 + 자체 월/주/일 뷰

**DB 마이그레이션** (`db/migrations/004_calendar.sql`):
```sql
CREATE TABLE calendars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    google_calendar_id TEXT,
    color TEXT DEFAULT '#3B82F6',
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    calendar_id UUID REFERENCES calendars(id),
    google_event_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN DEFAULT FALSE,
    recurrence TEXT,      -- RRULE 형식
    location TEXT,
    attendees JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**API:**
```
GET    /api/v1/calendars
POST   /api/v1/calendars
GET    /api/v1/calendars/:id/events    ?start=&end=
POST   /api/v1/calendars/:id/events
PUT    /api/v1/calendars/:id/events/:eid
DELETE /api/v1/calendars/:id/events/:eid
POST   /api/v1/calendars/sync          구글 캘린더 양방향 동기화
```

**수정 파일:**
- `gateway/internal/adapter/handler/calendar.go` — CalendarHandler 신규
- `gateway/internal/adapter/handler/router.go` — 라우트 등록
- `web/app/(main)/calendar/page.tsx` — 캘린더 메인 페이지
- `web/components/calendar/` — MonthView, WeekView, EventModal
- `agent/src/skills/calendar/` — Agent 스킬 (자연어 일정 CRUD)

**재활용:**
- `google_tokens` → Calendar API access_token 재사용
- `gateway/internal/infrastructure/scheduler/` → 이벤트 30분 전 알림 연동
- `gateway/internal/adapter/handler/files.go` → 핸들러 패턴 참고

**AI 시너지:** "다음 주 일정 요약해줘", "내일 3시에 회의 추가해줘"

---

### Phase 2: 주소록 (Contacts)

**목표:** 연락처 저장/검색 + 구글 연락처 동기화 + CRM 라이트

**DB:**
```sql
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    google_contact_id TEXT,
    name TEXT NOT NULL,
    emails JSONB DEFAULT '[]',
    phones JSONB DEFAULT '[]',
    birthday DATE,
    groups JSONB DEFAULT '[]',
    last_contacted_at TIMESTAMPTZ,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**API:** `GET/POST/PUT/DELETE /api/v1/contacts`, `POST /api/v1/contacts/sync`

**수정 파일:**
- `gateway/internal/adapter/handler/contacts.go` — 신규
- `web/app/(main)/contacts/page.tsx` — 신규
- `agent/src/skills/contacts/` — Agent 스킬

**AI 시너지:** "오래 연락 안 한 친구 알림", "홍길동 생일 3주 전 알림 설정"

---

### Phase 3: 메일 (Mail)

**목표:** Gmail 읽기/쓰기/발송 + AI 요약

**DB:**
```sql
CREATE TABLE emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    gmail_message_id TEXT,
    thread_id TEXT,
    subject TEXT,
    from_address TEXT,
    to_addresses JSONB DEFAULT '[]',
    snippet TEXT,
    body TEXT,
    labels JSONB DEFAULT '[]',
    is_read BOOLEAN DEFAULT FALSE,
    received_at TIMESTAMPTZ,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**API:** `GET /api/v1/emails`, `POST /api/v1/emails/send`, `POST /api/v1/emails/sync`

**수정 파일:**
- `gateway/internal/adapter/handler/email.go` — 신규
- `web/app/(main)/mail/page.tsx` — InboxList, EmailThread, ComposeModal
- `agent/src/skills/email/` — Agent 스킬

**AI 시너지:** "중요 메일만 요약해줘", "이 메일에 정중하게 거절 답장 작성해줘"

---

### Phase 4: Drive 고도화

**목표:** 폴더 구조 + 공유 + 구글 드라이브 연동

**DB (기존 `files` 테이블 확장):**
```sql
CREATE TABLE file_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES file_folders(id),
    google_folder_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE files ADD COLUMN folder_id UUID REFERENCES file_folders(id);
ALTER TABLE files ADD COLUMN google_file_id TEXT;
```

**수정 파일:**
- 기존 `gateway/internal/adapter/handler/files.go` 확장
- `web/app/(main)/files/` — 폴더 트리 뷰 UI 추가

**AI 시너지:** "이 PDF 핵심 내용 뽑아줘", "드라이브에서 계약서 찾아줘"

---

## 2순위 — AI 자동화 (기존 인프라 확장, 구현 빠름)

### Phase 5: 습관 추적 & 스트릭

**목표:** 일일 습관 체크 + 연속 달성 일수 추적

**DB:**
```sql
CREATE TABLE habit_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    frequency TEXT DEFAULT 'daily',  -- daily | weekday | weekend | custom
    target_days JSONB DEFAULT '[]',  -- [0,1,2,3,4] = Mon-Fri
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE habit_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    habit_id UUID NOT NULL REFERENCES habit_templates(id),
    date DATE NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    note TEXT,
    UNIQUE(habit_id, date)
);
```

**수정 파일:**
- `gateway/internal/adapter/handler/habits.go` — 신규
- `web/app/(main)/planners/habits/page.tsx` — 기존 planners 탭 추가
- `agent/src/skills/planner-habits/` — 신규 스킬

**AI 시너지:** "이번 주 습관 달성률 알려줘", "러닝 며칠 연속이야?"

---

### Phase 6: 주간 회고 자동화

**목표:** 주간 목표 + 일일 로그 → AI가 회고 자동 생성

**재활용:** `planner_reflection_notes` + `planner_weekly_goals` + `daily_logs` + AI

**변경:**
- 기존 `planner-reflection` Agent 스킬 확장
- API: `POST /api/v1/planner/reflection/auto-generate`
- UI: 기존 `/planners` 회고 탭에 "1클릭 자동 생성" 버튼 추가

**AI 시너지:** "이번 주 회고 자동으로 작성해줘"

---

### Phase 7: AI 개인 뉴스레터

**목표:** 주 1회 한 주 활동 요약 → Telegram 또는 메일 발송

**재활용:** `cron_schedules` + `notifications` + AI + `daily_logs` + `finances` + `planner_weekly_goals`

**DB:**
```sql
CREATE TABLE newsletter_config (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    enabled BOOLEAN DEFAULT TRUE,
    frequency TEXT DEFAULT 'weekly',  -- weekly | monthly
    day_of_week INT DEFAULT 0,        -- 0=Sun, 1=Mon ...
    send_time TIME DEFAULT '09:00',
    sections JSONB DEFAULT '["goals","tasks","finance","diary"]',
    channel TEXT DEFAULT 'telegram',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**변경:**
- `agent/src/skills/newsletter/` — 신규 스킬 (데이터 취합 + AI 요약)
- `gateway/internal/infrastructure/scheduler/` — 뉴스레터 발송 시스템 잡 추가
- `web/app/(main)/settings/` — 뉴스레터 설정 UI

---

### Phase 8: 지출 영수증 OCR

**목표:** 영수증 사진 → Vision API → 자동 재정 기록

**재활용:** `image` (Vision), `finances` 테이블, `files` 테이블

**변경:**
- `agent/src/skills/finance-receipt/` — 신규 스킬 (Vision prompt: 금액/품목/카테고리 추출 → finances 자동 기록)
- `web/app/(main)/assets/` — "영수증 스캔" 버튼 추가

**AI 시너지:** "영수증 사진 찍어서 올려줘" → 자동 지출 등록

---

## 3순위 — 정보 관리 강화

### Phase 9: 독서 & 학습 로그

**목표:** 책/강의/논문 기록 + AI 요약 → knowledge_base 저장 → 검색

**DB:**
```sql
CREATE TABLE reading_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    type TEXT DEFAULT 'book',  -- book | article | course | video
    title TEXT NOT NULL,
    author TEXT,
    url TEXT,
    status TEXT DEFAULT 'reading',  -- to_read | reading | completed | dropped
    progress INT DEFAULT 0,         -- 0-100%
    started_at DATE,
    finished_at DATE,
    rating INT,                      -- 1-5
    notes TEXT,
    ai_summary TEXT,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**수정 파일:**
- `gateway/internal/adapter/handler/library.go` — 신규
- `web/app/(main)/library/page.tsx` — 신규
- `agent/src/skills/planner-reading/` — 신규 스킬

---

### Phase 10: 음성 메모 & 빠른 캡처

**목표:** 녹음 → Whisper → AI 분류 (할일/메모/아이디어/일기)

**재활용:** `audio` 스킬 (Whisper), AI 분류

**변경:**
- `agent/src/skills/audio-capture/` — 기존 audio 스킬 확장 (분류 로직 추가)
- `web/app/(main)/capture/page.tsx` — 신규 빠른 캡처 페이지 (음성/텍스트)

---

### Phase 11: 템플릿 & 빠른 노트

**목표:** 자주 쓰는 문서 템플릿 저장 + 1클릭 적용

**DB:**
```sql
CREATE TABLE note_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    category TEXT,
    content TEXT NOT NULL,
    tags JSONB DEFAULT '[]',
    use_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**수정 파일:**
- `gateway/internal/adapter/handler/templates.go` — 신규
- `web/app/(main)/templates/page.tsx` — 신규

---

### Phase 12: 시간 로깅 & 생산성 분석

**목표:** 활동별 시간 기록 + 주간/월간 분석

**DB:**
```sql
CREATE TABLE time_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    category TEXT NOT NULL,  -- work | study | exercise | rest | hobby
    description TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_minutes INT,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**수정 파일:**
- `gateway/internal/adapter/handler/timelog.go` — 신규
- `web/app/(main)/analytics/` — 시간 분석 탭 추가

---

### Phase 13: 블로그

**목표:** 마크다운 작성/발행 + AI 도움 + 벡터 검색

**DB:**
```sql
CREATE TABLE blog_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT,
    excerpt TEXT,
    status TEXT DEFAULT 'draft',  -- draft | published | archived
    category TEXT,
    tags JSONB DEFAULT '[]',
    embedding VECTOR(1536),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**수정 파일:**
- `gateway/internal/adapter/handler/blog.go` — 신규
- `web/app/(main)/blog/page.tsx` — 목록 + 에디터

---

### Phase 14: 프로젝트 아카이빙

**목표:** 장기 프로젝트 관리 + 완료 시 자동 아카이빙

**DB (기존 planner_tasks 확장):**
```sql
CREATE TABLE planner_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',  -- active | completed | archived
    color TEXT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE planner_tasks ADD COLUMN project_id UUID REFERENCES planner_projects(id);
ALTER TABLE files ADD COLUMN project_id UUID REFERENCES planner_projects(id);
```

---

## AI 시너지 요약

```
캘린더 + AI      → "다음 주 일정 요약", "내일 3시에 팀 미팅 추가"
메일 + AI        → "중요 메일만 요약", "거절 답장 대신 작성"
Drive + AI       → "이 PDF 핵심 내용 추출", "드라이브에서 계약서 찾아"
주소록 + AI      → "오래 연락 안 한 친구 목록", "생일 3주 전 알림"
영수증 + AI      → "사진 올리면 자동 지출 등록"
습관 + AI        → "이번 주 습관 달성률", "러닝 며칠 연속이야"
회고 + AI        → "이번 주 회고 자동 작성"
뉴스레터 + AI    → "매주 일요일 한 주 요약 Telegram 수신"
독서 + AI        → "이 책 핵심 요약", "독서 노트 자동 생성"
음성 캡처 + AI   → "녹음하면 할일/메모/일기 자동 분류"
```

---

## 전체 우선순위 한눈에

| 순위 | Phase | 기능 | 난이도 | 기존 인프라 활용 |
|------|-------|------|--------|---------------|
| ⭐⭐⭐ | 1 | 캘린더 | 중 | google_tokens, cron |
| ⭐⭐⭐ | 2 | 주소록 | 중 | google_tokens |
| ⭐⭐⭐ | 3 | 메일 | 중 | google_tokens, AI |
| ⭐⭐⭐ | 4 | Drive 고도화 | 중 | files, MinIO |
| ⭐⭐⭐ | 5 | 습관 추적 | 낮 | planner |
| ⭐⭐⭐ | 6 | 주간 회고 자동화 | 낮 | reflection, AI |
| ⭐⭐⭐ | 7 | AI 개인 뉴스레터 | 낮 | cron, AI |
| ⭐⭐ | 8 | 영수증 OCR | 중 | Vision, finances |
| ⭐⭐ | 9 | 독서 & 학습 로그 | 낮 | knowledge_base |
| ⭐⭐ | 10 | 음성 메모 캡처 | 중 | audio (Whisper) |
| ⭐ | 11 | 템플릿 & 빠른 노트 | 낮 | knowledge_base |
| ⭐ | 12 | 시간 로깅 & 분석 | 중 | analytics |
| ⭐ | 13 | 블로그 | 중 | knowledge_base, AI |
| ⭐ | 14 | 프로젝트 아카이빙 | 중 | planner_tasks |
