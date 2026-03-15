---
name: google
description: 구글 캘린더, 문서, 태스크, 드라이브, 메일을 연동합니다. OAuth2 인증 후 사용 가능합니다.
keywords: ["구글", "캘린더", "드라이브", "google", "calendar", "drive", "グーグル", "谷歌"]
---

# 구글 연동 (google)

## 도구 목록

| 도구 | 서비스 | 설명 |
|------|--------|------|
| `google_auth` | OAuth2 | 구글 계정 연동 (인증 URL 생성) |
| `google_disconnect` | OAuth2 | 구글 계정 연동 해제 |
| `google_calendar_create` | Calendar | 캘린더 일정 생성 |
| `google_calendar_list` | Calendar | 예정된 일정 조회 |
| `google_docs_create` | Docs | 구글 문서 생성 |
| `google_docs_read` | Docs | 구글 문서 읽기 |
| `google_tasks_create` | Tasks | 할 일 추가 |
| `google_tasks_list` | Tasks | 할 일 목록 조회 |
| `google_drive_upload` | Drive | 파일 업로드 |
| `google_drive_list` | Drive | 파일 목록 조회 |
| `google_mail_send` | Gmail | 메일 전송 |
| `google_mail_list` | Gmail | 메일 목록 조회 |

## 인증 흐름

1. 사용자가 "구글 연동해줘"라고 요청
2. `google_auth` 호출 → 인증 URL 반환
3. 사용자가 브라우저에서 인증 완료
4. 자동으로 토큰 저장 → 이후 모든 구글 도구 사용 가능

## 사용 지침

- 구글 서비스 요청 시 먼저 토큰 존재 여부 확인
- 토큰이 없으면 "구글 계정을 먼저 연동해주세요"로 안내
- 연동 해제 요청 시 `google_disconnect` 호출

### 서비스별 참고

- **Calendar**: `start_time`, `end_time`은 ISO 8601 형식 (예: 2026-03-02T14:00:00+09:00)
- **Docs**: `document_id`는 URL에서 추출 가능
- **Tasks**: 기본 태스크 리스트(@default) 사용
- **Drive**: 검색 쿼리로 파일 필터링 가능
- **Gmail**: 검색 쿼리 지원 (is:unread, from:, subject: 등)

## 주의사항

- 이 스킬은 옵트인 방식이며, 사용자가 활성화해야 사용 가능
- OAuth2 인증이 필요하며, 토큰은 자동 갱신됨
- 메일 전송은 신중하게 — 사용자에게 수신자/내용 확인 후 전송

## 응답 스타일

- 작업 완료 후 간단히 결과 안내
- 에러 발생 시 원인과 해결 방법 안내
- 민감한 작업(메일 전송) 전 사용자 확인
