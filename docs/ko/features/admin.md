---
title: 관리자 도구
nav_order: 13
parent: 기능
grand_parent: 🇰🇷 한국어
---

# 관리자 도구

## 개요

Starnion은 서버 관리자를 위한 CLI 명령어를 제공합니다. 사용자 계정 관리와 데이터베이스 마이그레이션을 터미널에서 직접 수행할 수 있습니다.

---

## starnion users — 사용자 계정 관리

`starnion users` 명령어 그룹은 PostgreSQL에 직접 접근하여 사용자 계정을 관리합니다. **로그인 불필요** — 대신 `~/.starnion/config.yaml`에 유효한 데이터베이스 접속 정보가 있어야 합니다.

### 사용자 목록 조회

```bash
starnion users list
```

출력 예시:

```
══════════════════════════════════ USERS ═══════════════════════════════════════

  ID        EMAIL                  NAME        ROLE    CREATED
  ──────    ─────────────────────  ──────────  ─────   ──────────
  a1b2c3    admin@example.com      관리자        admin   2024-01-15
  d4e5f6    user@example.com       홍길동         user    2024-02-01

  총 2명
```

### 새 사용자 추가

```bash
starnion users add \
  --email user@example.com \
  --password "강력한비밀번호123!" \
  --name "홍길동"

# 관리자 권한 부여
starnion users add \
  --email admin@example.com \
  --password "관리자비밀번호!" \
  --name "시스템관리자" \
  --admin
```

| 플래그 | 필수 | 설명 |
|--------|------|------|
| `--email` | ✅ | 이메일 주소 (중복 불가) |
| `--password` | ✅ | 초기 비밀번호 |
| `--name` | ✅ | 표시 이름 |
| `--admin` | ❌ | 관리자 권한 부여 (기본값: 일반 사용자) |

### 사용자 삭제

```bash
starnion users remove user@example.com
```

삭제 전 확인 메시지가 표시됩니다. `yes`를 입력해야 삭제가 진행됩니다.

> ⚠️ **주의**: 삭제된 계정의 대화 기록, 메모, 일기 등 모든 데이터가 함께 삭제됩니다.

### 비밀번호 재설정

```bash
starnion users reset-password user@example.com
```

새 비밀번호를 안전하게 입력하는 프롬프트가 표시됩니다 (입력 내용이 화면에 표시되지 않음).

---

## starnion db — 데이터베이스 마이그레이션

`starnion db` 명령어 그룹은 데이터베이스 스키마 버전을 관리합니다. `schema_migrations` 테이블로 어떤 마이그레이션이 적용되었는지 추적합니다.

### 마이그레이션 적용

```bash
starnion db migrate
```

`gateway/internal/cli/migrations/incremental/` 디렉토리의 `.sql` 파일을 파일명 순서대로 실행합니다. 이미 적용된 파일은 건너뜁니다.

출력 예시:

```
  · v1.1.0-add-search-index.sql 이미 적용됨
  ✓ v1.2.0-add-usage-logs.sql 적용됨

  마이그레이션 완료: 1개 적용, 1개 스킵
```

### 마이그레이션 상태 확인

```bash
starnion db status
```

출력 예시:

```
══════════════════════════ MIGRATION STATUS ════════════════════════════════════

  ✓ v1.0.0 (baseline)          [applied 2024-01-15 10:30:00]
  ✓ v1.1.0-add-search-index    [applied 2024-02-01 14:22:10]
  · v1.2.0-add-usage-logs      [pending]
```

### 새 마이그레이션 파일 추가 방법

1. `gateway/internal/cli/migrations/incremental/` 에 `.sql` 파일 생성
2. 파일명은 정렬 순서가 곧 실행 순서이므로 버전 접두사를 붙이세요

   ```
   v1.2.0-add-usage-logs.sql
   v1.2.1-add-audit-table.sql
   ```

3. `starnion db migrate` 로 적용
4. `starnion db status` 로 확인

---

## 문서 처리 대기열 (백그라운드 Queue)

대용량 문서(500 KB 이상) 파싱 및 임베딩은 gRPC 핸들러 타임아웃을 방지하기 위해 **백그라운드 대기열**에서 처리됩니다.

### 동작 방식

```
parse_document 호출
  ↓
파일 크기 확인
  ├── < 500 KB → 즉시 처리 후 결과 반환
  └── ≥ 500 KB → 대기열에 등록 → task_id 반환
                     ↓
               백그라운드 Worker (최대 2개 동시 실행)
                     ↓
               Docling 파싱 + 임베딩 + DB 저장
```

### 상태 확인 (AI 도구)

대용량 문서 처리 후 반환된 `task_id`로 진행 상황을 확인할 수 있습니다:

```
check_document_status('<task_id>')
```

상태 값:

| 상태 | 의미 |
|------|------|
| `pending` | 대기 중 (처리 시작 전) |
| `processing` | 처리 중 (Docling 파싱 + 임베딩) |
| `done` | 완료 (N개 섹션 벡터 DB 저장됨) |
| `error` | 오류 발생 (오류 메시지 포함) |

### 환경 변수 설정

```bash
# 동시 처리 Worker 수 (기본값: 2)
DOC_QUEUE_WORKERS=3
```

> 💡 Docling은 CPU 집약적 작업입니다. Worker를 너무 많이 설정하면 CPU 경쟁이 발생해 처리 속도가 오히려 느려질 수 있습니다.
EOF
