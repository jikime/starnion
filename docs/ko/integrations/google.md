---
title: Google 연동
nav_order: 1
parent: 통합
---

# Google 연동

Starnion과 Google 계정을 연결하면 AI 에이전트가 자연어로 Google Calendar, Gmail, Google Drive, Google Docs, Google Tasks를 제어할 수 있습니다. 한 번 연결하면 텔레그램과 웹 UI 어디서나 동일하게 사용할 수 있습니다.

---

## 개요

Google 연동을 사용하면:

- **Calendar**: "내일 오전 10시에 팀 미팅 잡아줘"처럼 자연어로 일정 생성·조회·삭제
- **Gmail**: 받은 메일 검색, 새 메일 전송
- **Drive**: 파일 목록 조회, 파일을 Drive에 업로드
- **Docs**: 새 Google 문서 생성, 기존 문서 내용 읽기
- **Tasks**: 할 일 추가, 목록 조회, 완료 처리

> **옵트인 기능:** Google 연동은 기본적으로 비활성화되어 있습니다. 관리자가 OAuth 앱을 설정하고, 각 사용자가 설정에서 연결을 완료해야 사용할 수 있습니다.

---

## 지원 기능 목록

| 서비스 | 지원 기능 |
|--------|----------|
| Calendar | 일정 생성, 예정된 일정 조회, 일정 삭제 |
| Gmail | 받은 메일 목록 조회, 메일 전송 |
| Drive | 파일 목록 조회, 파일 업로드 |
| Docs | 문서 생성, 문서 내용 읽기 |
| Tasks | 할 일 추가, 목록 조회, 완료 처리, 삭제 |

---

## 사전 준비: Google Cloud Console OAuth 앱 만들기

Google 연동을 사용하려면 서버 관리자가 Google Cloud Console에서 OAuth 2.0 자격 증명을 생성하고 Starnion에 설정해야 합니다.

> **일반 사용자:** 이 단계는 서버 관리자가 수행합니다. 관리자에게 연동 설정을 요청하거나, Docker로 직접 운영하는 경우에만 아래 절차를 따르세요.

### 1단계: Google Cloud 프로젝트 생성

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속합니다.
2. 상단 프로젝트 선택 드롭다운 → **새 프로젝트** 클릭.
3. 프로젝트 이름을 입력하고 **만들기** 클릭.

### 2단계: API 활성화

1. 좌측 메뉴 → **API 및 서비스** → **라이브러리** 클릭.
2. 다음 API를 각각 검색하여 활성화합니다.
   - `Google Calendar API`
   - `Gmail API`
   - `Google Drive API`
   - `Google Docs API`
   - `Tasks API`

### 3단계: OAuth 동의 화면 설정

1. **API 및 서비스** → **OAuth 동의 화면** 클릭.
2. 사용자 유형: **외부** 선택 후 **만들기**.
3. 앱 이름, 사용자 지원 이메일, 개발자 연락처 이메일 입력.
4. **저장 후 계속** 클릭.
5. **범위 추가 또는 삭제**에서 다음 범위를 추가합니다.
   ```
   https://www.googleapis.com/auth/calendar
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/drive
   https://www.googleapis.com/auth/documents
   https://www.googleapis.com/auth/tasks
   ```
6. 테스트 사용자 단계에서 본인의 Google 계정을 추가합니다.

### 4단계: OAuth 자격 증명 생성

1. **API 및 서비스** → **사용자 인증 정보** 클릭.
2. **사용자 인증 정보 만들기** → **OAuth 클라이언트 ID** 선택.
3. 애플리케이션 유형: **웹 애플리케이션** 선택.
4. **승인된 리디렉션 URI**에 Starnion 콜백 URI를 추가합니다.
   ```
   http://localhost:8080/auth/google/callback
   ```
   > 프로덕션 환경이라면 실제 도메인으로 변경하세요 (예: `https://yourdomain.com/auth/google/callback`).
5. **만들기** 클릭 후 **클라이언트 ID**와 **클라이언트 보안 비밀번호**를 복사합니다.

---

## 환경 변수 설정

발급받은 자격 증명을 Starnion `.env` 파일에 설정합니다.

```dotenv
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
GATEWAY_PUBLIC_URL=http://localhost:8080
```

`GATEWAY_PUBLIC_URL`은 OAuth 콜백 URI의 기본 주소입니다. Gateway는 이 값과 `/auth/google/callback`을 조합하여 리디렉션 URI를 구성합니다.

변경 후 Gateway 서비스를 재시작합니다.

```bash
docker compose restart gateway
```

---

## 설정 방법: Google 계정 연결하기

### 웹 UI에서 연결

1. Starnion 웹 UI에 로그인합니다.
2. 좌측 메뉴 → **Settings** → **Integrations** 탭 클릭.
3. **Google** 섹션에서 **연결하기** 버튼 클릭.
4. Google 계정 선택 화면에서 연동할 계정을 선택합니다.
5. 권한 허용 화면에서 **허용** 클릭.
6. 연결이 완료되면 **연결됨** 상태가 표시됩니다.

### 텔레그램에서 연결

텔레그램 봇에서도 Google 연동을 시작할 수 있습니다.

1. 봇에게 "구글 연결해줘" 또는 "구글 연동해줘"라고 메시지를 보냅니다.
2. 봇이 인증 URL을 전송합니다.
3. URL을 클릭하여 동일한 OAuth 흐름을 진행합니다.

```
나: 구글 연동해줘
봇: 아래 링크를 눌러 구글 계정을 연동해주세요:
    http://yourdomain.com/auth/google/telegram?uid=...
```

---

## 사용 방법

Google 계정이 연결되면 AI에게 자연어로 요청합니다.

### Google Calendar

```
나: 내일 일정 뭐야?
봇: 내일 예정된 일정:
    - 10:00: 팀 주간 미팅
    - 14:00: 고객사 보고

나: 다음 주 수요일 오후 2시에 프로젝트 회의 1시간 추가해줘
봇: '프로젝트 회의' 일정을 생성했어요.
    - 일시: 2026-03-11 14:00 ~ 15:00

나: 내일 14시 회의 취소해줘
봇: '고객사 보고' 일정을 삭제했어요.
```

### Gmail

```
나: 읽지 않은 메일 보여줘
봇: 읽지 않은 메일 (최근 10개):
    - [중요] 계약서 검토 요청 (from: partner@example.com)
    - 주간 뉴스레터 (from: news@example.com)

나: partner@example.com에게 "계약서 검토 완료했습니다" 제목으로 메일 보내줘
봇: 메일을 전송하기 전에 확인해 주세요.
    수신자: partner@example.com
    제목: 계약서 검토 완료했습니다
    전송할까요?

나: 응, 보내줘
봇: 메일을 전송했어요.
```

> **주의:** 메일 전송 전에 AI가 내용을 확인받습니다. "응, 보내줘"라고 확인한 후 전송됩니다.

### Google Drive

```
나: 드라이브에서 보고서 파일 찾아줘
봇: 드라이브 파일 목록 ('보고서' 검색):
    - 2026년 Q1 영업보고서.xlsx
    - 프로젝트 최종 보고서.docx

나: 오늘 회의록 파일을 드라이브에 올려줘
봇: (첨부 파일을 드라이브에 업로드했어요.)
    '회의록_20260308.pdf'를 드라이브에 업로드했어요.
```

### Google Docs

```
나: "2026 Q2 계획서"라는 제목의 구글 문서 만들어줘
봇: 문서 '2026 Q2 계획서'를 생성했어요.
    https://docs.google.com/document/d/abc123...

나: 드라이브 문서 abc123 내용 읽어줘
봇: 문서: 2026 Q2 계획서
    ...
```

### Google Tasks

```
나: 내일까지 "기획서 초안 작성" 할 일 추가해줘
봇: 할 일 '기획서 초안 작성'을 추가했어요.

나: 할 일 목록 보여줘
봇: 할 일 목록:
    ⬜ 기획서 초안 작성
    ⬜ 팀원 피드백 취합
    ⬜ 주간 보고서 작성

나: 기획서 초안 작성 완료 처리해줘
봇: 할 일 '기획서 초안 작성'을 완료 처리했어요.
```

---

## 권한 범위 (Scopes)

Starnion이 요청하는 Google 권한 범위는 다음과 같습니다.

| 범위 | 목적 |
|------|------|
| `calendar` | 일정 읽기 및 쓰기 |
| `gmail.send` | 메일 전송 |
| `gmail.readonly` | 메일 목록 조회 |
| `drive` | 파일 목록 조회, 업로드 |
| `documents` | 문서 생성 및 읽기 |
| `tasks` | 할 일 관리 |

---

## 연결 해제 방법

1. Settings → Integrations → Google 섹션.
2. **연결 해제** 버튼 클릭.
3. 연결 해제 시 저장된 OAuth 토큰이 즉시 삭제됩니다.

또는 AI에게 "구글 연동 해제해줘"라고 요청할 수 있습니다.

---

## 주의사항

### 보안

- OAuth 토큰(액세스 토큰 + 리프레시 토큰)은 데이터베이스에 저장됩니다.
- 액세스 토큰이 만료되면 리프레시 토큰으로 자동 갱신됩니다.
- 리프레시 토큰 만료 시 재연결이 필요합니다 (일반적으로 6개월).

### Google 스킬 활성화

Google 스킬은 기본적으로 비활성화되어 있습니다. 사용 전 관리자가 스킬을 활성화해야 합니다.

- Settings → Skills → **Google** 스킬 활성화 토글을 켭니다.
- Google OAuth 앱 설정(`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)이 없으면 스킬을 활성화해도 작동하지 않습니다.

---

## 문제 해결

### "구글 연동 설정이 되어 있지 않아요"

서버에 `GOOGLE_CLIENT_ID`와 `GOOGLE_CLIENT_SECRET` 환경 변수가 설정되지 않았습니다. `.env` 파일을 확인하고 Gateway를 재시작하세요.

### "구글 계정을 먼저 연동해주세요"

아직 Google 계정을 연결하지 않은 상태입니다. 웹 UI Settings → Integrations → Google에서 연결을 완료하세요.

### OAuth 동의 화면에서 "이 앱은 Google에서 확인하지 않았습니다" 경고

개발 단계에서는 정상입니다. **고급** → **[앱 이름](으)로 이동**을 클릭하면 계속 진행할 수 있습니다. 프로덕션 배포 시에는 Google에 앱 검증을 요청하거나, 조직 내 사용자만 대상으로 하는 경우 **내부** 유형으로 설정하세요.

### "Notion API 키가 유효하지 않아요" (또는 401 오류)

OAuth 토큰이 만료되었거나 취소되었을 수 있습니다. 연결 해제 후 다시 연결하세요.

---

## FAQ

**Q: 여러 Google 계정을 연결할 수 있나요?**
A: 현재는 사용자당 하나의 Google 계정만 연결됩니다.

**Q: 텔레그램과 웹 UI에서 연결된 Google 계정이 같은가요?**
A: 네, 동일한 Starnion 계정으로 연결된 경우 어느 채널에서 연결하든 동일한 Google 토큰을 공유합니다.

**Q: Google Tasks와 Calendar 둘 다 사용할 수 있나요?**
A: 네, Google 연동 후 두 서비스를 모두 자연어로 사용할 수 있습니다.

**Q: Gmail 전송 시 AI가 임의로 메일을 보낼 수 있나요?**
A: 아니요. AI는 메일 전송 전에 수신자, 제목, 본문을 사용자에게 확인한 뒤 전송합니다.
