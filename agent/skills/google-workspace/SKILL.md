---
name: google-workspace
display_name: Google Workspace
description: "Google Calendar, Drive, Docs, Tasks, Gmail 연동. Use for: 구글 캘린더, 일정 추가/삭제, 구글 드라이브, 구글 문서, 할 일 목록, 지메일, calendar events, google drive, google docs, tasks, gmail"
version: 2.0.0
emoji: "🔵"
category: productivity
enabled_by_default: false
requires_api_key: true
platforms: web, telegram, api
api_key_provider: google
api_key_type: google_oauth
api_key_label: Google OAuth App
api_key_label_1: Client ID
api_key_label_2: Client Secret
uses_provider: false
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - 구글
    - google
    - 구글 캘린더
    - 캘린더
    - 일정
    - 일정 추가
    - 일정 삭제
    - 일정 확인
    - 구글 드라이브
    - 드라이브
    - 구글 문서
    - 구글 독스
    - docs
    - 할 일
    - 태스크
    - tasks
    - 지메일
    - gmail
    - 메일
    - calendar
    - drive
    - schedule
    - event
  when_to_use:
    - User asks to check, add, or delete Google Calendar events
    - User wants to search or list files in Google Drive
    - User wants to create or read a Google Document
    - User asks to manage Google Tasks (add, list, complete, delete)
    - User wants to send or read Gmail messages
    - User says "구글 캘린더에 일정 추가해줘" or "메일 보내줘"
---

# Google Workspace 스킬

Google OAuth App을 통해 Calendar, Drive, Docs, Tasks, Gmail을 연동합니다.

Always pass `--user-id {user_id}`.

## 설정 방법

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
2. **Create Credentials** → **OAuth 2.0 Client ID** 생성 (Application type: Web application)
3. **Authorized redirect URIs**에 아래 URL 추가:
   ```
   {APP_URL}/api/v1/integrations/google/callback
   ```
4. 아래 API를 **Enabled APIs**에서 활성화:
   - Google Calendar API
   - Google Drive API v3
   - Google Docs API
   - Google Tasks API
   - Gmail API
5. 스킬 페이지에서 **Client ID**와 **Client Secret** 입력 후 저장
6. **Google 계정 연결** 버튼 클릭 → Google 동의 화면 진행

## Commands

### 📅 Calendar

#### 일정 조회
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} calendar \
  --days 7
```
- `--days N`: 향후 N일 일정 조회 (기본: 7)

#### 일정 생성
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} calendar-create \
  --title "회의" \
  --start-time "2026-04-01T14:00:00+09:00" \
  --end-time "2026-04-01T15:00:00+09:00" \
  --description "월간 팀 회의"
```
- `--title`: 일정 제목 (필수)
- `--start-time`: 시작 시간 ISO 8601 (필수)
- `--end-time`: 종료 시간 ISO 8601 (필수)
- `--description`: 설명 (선택)

#### 일정 삭제
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} calendar-delete \
  --event-id "abc123xyz"
```
- `--event-id`: 삭제할 일정 ID (calendar 명령으로 확인)

### 📁 Drive

#### 파일 검색 (키워드 필수)
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} drive \
  --query "보고서" \
  --limit 10
```

#### 파일 목록 조회 (키워드 선택)
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} drive-list \
  --query "프로젝트" \
  --limit 10
```
- `--query`: 이름 필터 (선택, 없으면 최근 파일 목록)
- `--limit N`: 결과 개수 (기본: 10)

### 📄 Docs

#### 문서 생성
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} docs-create \
  --title "새 문서" \
  --content "문서 내용"
```
- `--title`: 문서 제목 (필수)
- `--content`: 초기 내용 (선택)

#### 문서 읽기
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} docs-read \
  --document-id "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
```
- `--document-id`: 문서 ID (URL에서 추출, 최대 1000자 미리보기)

### ✅ Tasks

#### 할 일 추가
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} tasks-create \
  --title "보고서 작성" \
  --notes "2분기 실적 포함" \
  --due "2026-04-10T00:00:00Z"
```
- `--title`: 할 일 제목 (필수)
- `--notes`: 메모 (선택)
- `--due`: 마감일 RFC 3339 (선택)

#### 할 일 목록 조회
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} tasks-list \
  --max 20
```

#### 할 일 완료
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} tasks-complete \
  --task-id "MDEwMDAwMDAwMDI2NzQ5NTI4MDE6MDow"
```

#### 할 일 삭제
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} tasks-delete \
  --task-id "MDEwMDAwMDAwMDI2NzQ5NTI4MDE6MDow"
```
- `--task-id`: 할 일 ID (tasks-list 명령으로 확인)

### ✉️ Gmail

#### 메일 전송
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} mail-send \
  --to "recipient@example.com" \
  --subject "제목" \
  --body "메일 본문 내용"
```
- `--to`: 수신자 이메일 (필수)
- `--subject`: 메일 제목 (필수)
- `--body`: 메일 본문 (필수)

#### 메일 목록 조회
```bash
python3 google-workspace/scripts/google_workspace.py \
  --user-id {user_id} mail-list \
  --query "is:unread" \
  --max 10
```
- `--query`: Gmail 검색 쿼리 (기본: is:unread) — `from:`, `subject:`, `is:unread` 등 지원
- `--max N`: 최대 결과 수 (기본: 10)

## Notes

- OAuth 토큰은 서버에 암호화 저장됩니다
- 스코프: Calendar (read/write), Drive (read/write), Docs, Tasks, Gmail (send/read)
- Client ID/Secret은 `integration_keys` 테이블에 저장됩니다
- 토큰은 만료 5분 전 자동 갱신됩니다
- 메일 전송 전 수신자와 내용을 사용자에게 확인하세요
