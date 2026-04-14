---
title: 인맥 관리
nav_order: 20
parent: 기능
grand_parent: 🇰🇷 한국어
---

# 인맥 관리 (Connect)

## 개요

Starnion의 **인맥 관리(Connect)** 는 단순 주소록이 아닌 **관계 유지 어시스턴트**입니다. 명함 스캔부터 활동 기록, 자동 수집, 연락 주기 알림, 드리프트 감지, Google 연락처 가져오기까지 — 사람을 '잊지 않고 잘 챙기는' 모든 과정을 한 화면에서 처리합니다.

핵심 차이점은 **자동화**입니다. 사용자가 매번 "누구와 언제 만났는지"를 기록할 필요 없이, Gmail / Google Calendar에서 활동을 자동으로 수집하고, 점수 기반으로 "지금 누구에게 연락해야 하는지"를 알려줍니다.

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| **인맥 카드(PersonaCard)** | 한 사람당 avatar, 이름, 직책, 회사, 카테고리, 연락처, SNS, 태그, 컨텍스트 메모, 명함, 활동 타임라인을 한 화면에 표시 |
| **명함 스캔(OCR)** | 명함 이미지를 업로드하면 Gemini Vision으로 텍스트 추출 + 자동으로 인맥 등록 |
| **컨텍스트 메모** | "비건 식단, 자녀 2명, Next.js 관심" 같은 정적 인적 정보 (최대 4,096자) |
| **활동 타임라인** | "언제 무엇을 함께 했는가"의 이벤트 로그 — 수동 기록 + Gmail/Calendar 자동 수집 |
| **Nion 제안** | 드리프트 여부·최근 활동 카운트·마지막 활동을 조합한 데이터 기반 행동 제안 |
| **연결 점수** | 최근성(45%) + 빈도(35%) + 중요도(20%) 공식으로 매일 03:00 자동 재계산 |
| **리마인더 패널** | 목표 연락 주기를 초과한 인연 목록, 드리프트 일수 내림차순 |
| **드리프트 알림** | 매일 09:00 "N명과 연락이 뜸해졌어요" 텔레그램 요약 |
| **Google 연락처 가져오기** | 구글 주소록 전체를 일괄 import, 이메일/전화로 중복 제거 |

---

## 인맥 등록

### 방법 1: 명함 스캔

```
사용자: [명함 이미지 첨부]
AI:    명함을 분석했어요. 새 인맥으로 등록했어요.
       이름: 김철수
       회사: ACME Corp
       직책: Senior Engineer
       이메일: kim@acme.com
       전화: 010-1234-5678
```

내부적으로는 `connect-ocr` 스킬이 Gemini Vision으로 OCR → 필드 추출 → `connections` 테이블에 직접 INSERT합니다. 스캔 원본 이미지는 `business_card` JSONB 컬럼에 URL로 보관돼 인맥 카드에서 미리보기/확대 조회 가능합니다.

### 방법 2: 수동 입력

웹 UI `/connect` → "새 인연 추가" 버튼 → 이름, 이메일, 카테고리 등 입력 → 저장.

### 방법 3: Google 연락처 일괄 가져오기 (Phase 3)

```
사용자: 구글에 있는 연락처 다 인맥에 가져와줘
AI:    구글 주소록에서 142개를 발견했고, 1개는 이미 등록되어 있어요.
       141개를 가져올까요?
사용자: 응
AI:    141개를 인맥에 가져왔어요.
       인맥 페이지에서 'google_contacts' 태그로 필터링할 수 있어요.
```

`connect-contacts-import` 스킬이 Google People API를 페이지네이션하여 전체 주소록을 순회합니다. 이메일 → 전화 순으로 기존 인맥과 중복 체크하고, 새 인맥만 `category=acquaintance`, `tags=['google_contacts']`로 INSERT합니다. 한 번만 실행하는 일회성 import이며, 주기적인 2-way sync는 아닙니다.

> **사전 조건:** Google Workspace 스킬에 `contacts.readonly` scope가 필요합니다. 2026-04 이전에 연결한 사용자는 `/skills` → Google Workspace → 연결 해제 → 다시 연결해서 새 scope을 승인해야 합니다.

---

## 카테고리와 연락 주기 목표

인맥은 4가지 카테고리 중 하나로 분류됩니다:

| 카테고리 | 기본 importance | 권장 연락 주기 |
|---|---|---|
| `family` | 0.9 | 2주 |
| `business` | 0.7 | 1개월 |
| `friend` | 0.7 | 1개월 |
| `acquaintance` | 0.4 | 3개월 |

각 인맥마다 `contact_frequency_target` (일 단위)을 설정할 수 있고, 이 값이 드리프트 판정과 점수 계산의 기준이 됩니다.

---

## 컨텍스트 메모

**정적 인적 정보**를 기록하는 텍스트 영역입니다 — "비건 식단", "자녀: 초등학생 딸, 유치원 아들", "Next.js 관심" 같은 **잘 변하지 않는 사실**을 모아두는 곳. 활동 타임라인과는 분리돼 있어요 (메모 = 프로필, 타임라인 = 이벤트 로그).

채팅으로도 직접 편집 가능:

```
사용자: 김철수 메모에 "비건 식단, 사이클링 취미" 추가해줘
AI:    김철수님의 메모에 추가했습니다.
```

`connect-memo` 스킬이 `context_notes` 컬럼에 append/replace/clear 3가지 액션을 지원합니다. 길이 제한은 4,096자 (BR-CONTEXT-1).

---

## 활동 타임라인 (Phase 2)

**"언제 무엇을 함께 했는가"의 이벤트 로그**입니다. 수동 기록과 자동 수집 두 경로가 있고, 인맥 카드 우측 패널에 세로형 타임라인으로 렌더링됩니다.

### 수동 기록

인맥 카드 → "기록 추가" 버튼 → 카테고리 칩(미팅/통화/식사/협업/메시지/기타) 선택 → 내용·날짜·시간(선택) 입력 → 저장.

또는 채팅:

```
사용자: 김철수랑 어제 점심 먹었어. COEX에서 45분 미팅
AI:    김철수님과의 4월 12일 점심 기록을 추가했어요.
```

`connect-activity` 스킬이 처리합니다. 수동 기록 시 `connections.last_contact_at`이 자동으로 갱신돼요 (monotonic — 과거 방향으로는 되돌리지 않음).

### 자동 수집 (Gmail + Google Calendar)

**Cron 또는 수동 트리거**로 최근 이메일/일정을 인맥 타임라인에 자동 수집합니다.

- **Cron (`connect_activity_ingest`)**: 매일 02:00 (기본 OFF, 알림 센터에서 ON)
- **수동 트리거**: 알림 센터 → "인맥 활동 자동 수집" ▶ 버튼
- **스킬 호출**: `"내 일정에서 인맥 활동 가져와줘"`

### 매칭 전략

각 이메일/이벤트마다:

1. **1차: 이메일 매칭** — `From:`/`To:`/`Cc:`/`attendees[].email` → `connections.email`
2. **2차: 이름 매칭** — 이메일로 못 잡으면 `Subject` / `event.summary`에 연결 이름이 부분 문자열로 있는지 (2자 이상)

예: "임진수 과장 미팅"이라는 개인 일정(참석자 없음)도 이름 매칭으로 `임진수` 인연에 연결됩니다.

### 필터

- `noreply@`, `notifications@`, `alerts@` 등 자동 발송자 제외
- 수신자 20명 초과(메일링 리스트) 제외
- 가중치 감쇠: `1 / sqrt(participant_count)` — 1:1 미팅은 1.0, 4인 미팅은 0.5, 16인 회의는 0.25
- 미래 일정은 **타임라인에 표시되지만** `last_contact_at`을 갱신하지 않음 (드리프트 감지 무결성 보장)

### 활동 종류별 색상

타임라인 bullet은 kind별 색상이 붙습니다:

- 🔵 이메일 (`email`, sky-400)
- 🟢 일정 (`calendar`, emerald-400)
- 🟣 수동 (`manual`, violet-400)
- 🔷 텔레그램 (`telegram`, cyan-400)

---

## Nion 제안

인맥 카드 상단의 **데이터 기반 요약 박스**입니다. 최근 활동 + 드리프트 상태 + 카테고리 심각도를 조합해 한 문장의 행동 제안을 생성합니다. LLM 호출 없이 100% 클라이언트 사이드 계산.

```
✨ NION의 제안
27일째 연락 없음 (목표 30일)
최근 90일: 📧 이메일 4  📅 일정 1
마지막 활동: 3일 전 · 미팅 (45분)
─────────────────────────────
→ 곧 정기 연락 주기예요. 미리 한 번 인사를 건네보세요.
```

카테고리 × 드리프트 심각도 매트릭스로 9가지 메시지를 자동 선택합니다:

- **family** (가족) → 드리프트 1단계부터 강한 어조
- **business / friend / acquaintance** → 1→2→3단계에서 점진적으로 강해짐
- **정상(healthy)** → "잘 챙기고 있어요 👍"
- **never contacted** → "짧은 첫 인사를 건네보세요"

---

## 연결 점수

0.0 ~ 1.0 사이의 숫자로 **관계의 건강도**를 표현합니다. 매일 03:00에 `connect_score_recompute` cron이 재계산합니다.

**공식** (architecture-design.md §D):

```
score = 0.45 × recency + 0.35 × frequency + 0.20 × importance

recency   = exp(-days_since_contact / (2 × target_interval))
frequency = min(1, activity_weight_90d / (90 / target_interval))
importance = category_base[category] + tag_boost
```

- **recency**: 목표 주기 내 연락은 1.0에 근접, 2배 지나면 0.37
- **frequency**: 90일간 가중 활동 수 / 기대값
- **importance**: family 0.9, business/friend 0.7, acquaintance 0.4

변동폭이 0.005 미만이면 DB 쓰기를 생략해 cron churn을 줄입니다.

---

## 리마인더 (드리프트 감지)

### 리마인더 패널

`/connect` → 우측 패널 상단의 토글 → "리마인더" 선택.

`last_contact_at + contact_frequency_target < NOW()`인 인맥을 **일수 초과 내림차순**으로 나열합니다. 각 행 클릭 시 해당 인맥 카드로 전환.

### 드리프트 알림 (Cron)

- **Job**: `connect_drift_reminder` (매일 09:00, 기본 OFF)
- **채널**: 텔레그램 (연결돼 있을 때)
- **내용**: "3명과 연락이 뜸해졌어요: 김철수, 박영희, 이영수. 인맥 페이지에서 확인하세요."
- **상위 3명**만 명시하고 나머지는 "외 N명" 형태
- **Dedup**: 하루 1회 (중복 알림 차단)

리마인더 패널과 드리프트 알림은 **같은 쿼리**(`ListDriftingConnections`)를 다른 채널로 출력하는 구조입니다. 서로 의존하지 않고, cron이 꺼져 있어도 패널은 항상 라이브로 동작합니다.

---

## Cron 요약

알림 센터(`/cron`)에서 개별로 토글 가능한 3개 시스템 작업:

| Job ID | 시각 | 액션 | 기본 | 설명 |
|---|---|---|---|---|
| `connect_activity_ingest` | 02:00 | maintenance | OFF | Gmail + Calendar → 인맥 활동 자동 수집 |
| `connect_score_recompute` | 03:00 | maintenance | OFF | 연결 점수 재계산 |
| `connect_drift_reminder` | 09:00 | smart_notify | OFF | 드리프트 텔레그램 요약 알림 |

모두 **default OFF** (opt-in)입니다 — 사용자가 `/cron` 페이지에서 명시적으로 ON해야 동작합니다. ▶ 트리거 버튼으로 즉시 1회 실행도 가능.

---

## 연결 스킬 4종

| 스킬 | 용도 |
|---|---|
| `connect-ocr` | 명함 이미지 → OCR → 새 인맥 생성 |
| `connect-memo` | 컨텍스트 메모 add/replace/clear |
| `connect-activity` | 활동 타임라인 find/add/list/delete + Gmail/Calendar sync |
| `connect-contacts-import` | Google 주소록 일괄 import (preview/import) |

모두 Python psycopg2로 직접 DB에 쓰며, BR-AUTH-1에 따라 `WHERE user_id = %s` 스코프로 철저히 격리됩니다. BR-SOCIAL-3에 따라 `social_profiles`는 OCR/Contacts import 경로에서 절대 쓰지 않습니다 (LinkedIn URL은 웹 UI에서만 수동 입력).

---

## 비즈니스 규칙 요약

| 규칙 | 내용 |
|---|---|
| BR-AUTH-1 | 모든 쿼리는 `user_id` 스코프 — 타 사용자 데이터 접근 불가 |
| BR-CAT-1 | 카테고리는 `family / friend / business / acquaintance` 중 하나 (case-sensitive) |
| BR-TAG-1 | 태그 최대 16개, 각 32자, 대소문자 무시 중복 제거 |
| BR-CONTEXT-1 | 컨텍스트 메모 최대 4,096자 |
| BR-SOCIAL-1 | `social_profiles` 키는 facebook/instagram/x/linkedin/threads 5개만 |
| BR-SOCIAL-2 | social_profiles PATCH는 merge-patch (nil = 키 삭제) |
| BR-SOCIAL-3 | OCR/import 경로는 `social_profiles` 절대 안 씀 |
| BR-SCORE-1 | `connection_score`는 서버 전용 — PATCH로 못 씀 |
| BR-109-1 | `last_contact_at`은 monotonic — 과거로 되돌아가지 않음, `NOW() + 60s` 초과 거부 |

---

## 문제 해결

### "Google 인증이 만료됐는데 자동 갱신이 안 돼요"

`decrypt_value`가 v2 암호화 포맷을 못 읽는 구 버전에서 발생. v0.4.0부터 해결. 재시작 후 정상 동작.

### "캘린더 일정이 타임라인에 안 잡혀요"

두 가지 확인:

1. **윈도우**: cron은 과거 7일 + 미래 14일만 봅니다. 그 밖의 일정은 수동 스킬 호출로 `sync --days 90` 사용.
2. **매칭**: 참석자(`attendees`)가 비어있으면 **이름 매칭**으로 시도 — 제목에 인맥 이름이 있어야 합니다. 둘 다 실패하면 개인 todo로 간주해 스킵.

### "리마인더 패널이 비어있어요"

정상 상태일 가능성. 드리프트 조건(`last_contact_at + target < NOW()`)을 만족하는 인맥이 없으면 "잘 챙기고 있어요 👍" 메시지가 나옵니다. 테스트하려면:

```sql
UPDATE connections SET last_contact_at = NOW() - INTERVAL '60 days'
WHERE name = '...' AND user_id = '...';
```

### "점수가 업데이트되지 않아요"

`connect_score_recompute` cron이 OFF 상태일 수 있어요. `/cron` 페이지에서 ON. 또는 ▶ 트리거로 즉시 1회 실행.

---

## 관련 링크

- [스킬](../skills.md) — connect-ocr / connect-memo / connect-activity / connect-contacts-import 상세
- [알림 & 일정](schedules.md) — cron 시스템 잡 설정
- [아키텍처](../architecture.md) — Clean Architecture, 도메인 모델
