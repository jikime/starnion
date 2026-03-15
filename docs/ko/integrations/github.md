---
title: GitHub 연동
nav_order: 3
parent: 통합
grand_parent: 🇰🇷 한국어
---

# GitHub 연동

Starnion과 GitHub를 연결하면 AI 에이전트가 자연어로 저장소 정보, 이슈, Pull Request를 조회하고 관리할 수 있습니다. 개발 워크플로우를 대화형으로 관리해 보세요.

---

## 개요

GitHub 연동을 사용하면:

- **저장소**: 저장소 목록 조회, 최근 커밋 확인
- **이슈**: 이슈 생성, 조회, 상태 확인
- **Pull Request**: PR 목록 조회, 상태 확인, 리뷰 요약
- **코드 검색**: 저장소 내 코드 검색

> **옵트인 기능:** GitHub 연동은 기본적으로 비활성화되어 있습니다. Personal Access Token을 설정한 후 스킬을 활성화해야 사용할 수 있습니다.

---

## 지원 기능 목록

| 도구 | 설명 |
|------|------|
| `github_list_repos` | 저장소 목록 조회 (공개·비공개, 정렬·필터 지원) |
| `github_list_issues` | 이슈 목록 조회 (open/closed/all) |
| `github_create_issue` | 새 이슈 생성 (레이블 지원) |
| `github_list_prs` | Pull Request 목록 조회 |
| `github_get_pr` | PR 상세 조회 (변경 파일 목록 + CI 검사 상태) |
| `github_search_code` | GitHub 전체 코드 검색 (한정자 지원) |

---

## 사전 준비: GitHub Personal Access Token 발급

### 1단계: Token 생성

1. [GitHub Settings](https://github.com/settings/tokens)에 접속합니다.
2. **Generate new token** → **Generate new token (classic)** 클릭.
3. **Note** 필드에 토큰 이름을 입력합니다 (예: `Starnion`).
4. **Expiration**에서 만료 기간을 선택합니다.
5. 다음 스코프(권한)를 선택합니다:

   | 스코프 | 목적 |
   |--------|------|
   | `repo` | 저장소 읽기/쓰기 (비공개 저장소 포함) |
   | `read:user` | 사용자 정보 읽기 |
   | `read:org` | 조직 정보 읽기 (선택) |

6. **Generate token** 클릭 후 토큰을 복사합니다 (`ghp_...` 형식).

> **보안 주의:** 토큰은 생성 직후에만 전체를 볼 수 있습니다. 즉시 복사하세요.

---

## 설정 방법

### 웹 UI에서 Token 등록

1. Starnion 웹 UI에 로그인합니다.
2. 좌측 메뉴 → **Settings** → **Integrations** 탭 클릭.
3. **GitHub** 섹션에서 **Personal Access Token** 입력 필드를 찾습니다.
4. 복사한 토큰(`ghp_...`)을 붙여넣습니다.
5. **저장** 버튼 클릭.
6. **GitHub 스킬 활성화** 토글을 켭니다.

---

## 사용 방법

GitHub 연동이 설정되면 AI에게 자연어로 요청합니다.

### 저장소 조회

```
나: 내 GitHub 저장소 목록 보여줘
봇: GitHub 저장소 목록:
    - starnion/starnion (Private) ⭐ 12
    - starnion/docs (Public) ⭐ 5
    - starnion/agent (Private) ⭐ 3
```

### 이슈 관리

```
나: starnion 저장소에 열린 이슈 보여줘
봇: starnion/starnion 열린 이슈 (3개):
    - #42: 로그인 오류 수정 필요 (bug)
    - #38: 다국어 지원 추가 (enhancement)
    - #35: API 문서 업데이트 (documentation)

나: starnion 저장소에 "검색 기능 개선" 이슈 만들어줘
봇: 이슈를 생성했어요.
    #43: 검색 기능 개선
    URL: https://github.com/starnion/starnion/issues/43
```

### Pull Request 확인

```
나: starnion 저장소 최근 PR 상태 알려줘
봇: starnion/starnion PR 목록:
    - #41: feat: 검색 필터 추가 (Open, 리뷰 대기 중)
    - #39: fix: 메모리 누수 해결 (Merged)
```

### PR 상세 조회

변경 파일 목록과 CI 검사 상태를 함께 확인합니다.

```
나: starnion/api PR #42 상세 내용 알려줘
봇: PR #42: feat: 사용자 설정 타임존 저장 기능
    상태: open | 작성자: devteam
    브랜치: feat/timezone → main
    변경: +127 -34 (6개 파일)
    URL: https://github.com/starnion/api/pull/42

    변경 파일 (6개):
      modified gateway/internal/handler/profile.go (+45 -8)
      modified ui/app/(dashboard)/settings/page.tsx (+62 -12)
      ...

    CI 검사 (3개):
      ✅ build: success
      ✅ lint: success
      🔄 test: in_progress
```

### 코드 검색

저장소 내에서 특정 코드를 검색합니다.

```
나: starnion/api에서 timezone 관련 코드 찾아줘
봇: 코드 검색 결과: 'timezone repo:starnion/api' (총 8개 중 5개 표시)
    📄 gateway/internal/handler/profile.go
       https://github.com/starnion/api/blob/main/gateway/...
    📄 agent/src/starnion_agent/db/repositories/profile.py
       https://github.com/starnion/api/blob/main/agent/...
    ...
```

---

## 필요 권한 (Scopes)

| 스코프 | 목적 | 필요 여부 |
|--------|------|----------|
| `repo` | 저장소 읽기/쓰기 (비공개 포함) | 필수 |
| `read:user` | 사용자 정보 읽기 | 필수 |
| `read:org` | 조직 저장소 접근 | 선택 |

> **팁:** 읽기 전용으로만 사용하려면 `repo` 대신 `public_repo` 스코프를 선택할 수 있지만, 비공개 저장소에는 접근할 수 없습니다.

---

## 연결 해제 방법

1. Settings → Integrations → GitHub 섹션.
2. **연결 해제** 버튼 클릭.
3. 저장된 Personal Access Token이 즉시 삭제됩니다.

GitHub에서도 토큰을 무효화하려면:
1. [GitHub Settings > Tokens](https://github.com/settings/tokens) → 해당 토큰 삭제.

---

## 문제 해결

### "GitHub 연동이 되어 있지 않아요"

Settings → Integrations → GitHub에서 Personal Access Token을 등록했는지 확인하세요.

### "GitHub API 인증 실패" (401 오류)

- 토큰이 만료되었을 수 있습니다. GitHub에서 새 토큰을 발급 후 업데이트하세요.
- 토큰의 스코프(권한)가 충분한지 확인하세요.

### "저장소를 찾을 수 없어요" (404 오류)

- 토큰에 `repo` 스코프가 있는지 확인합니다.
- 비공개 저장소의 경우 `repo` 스코프가 필수입니다.

---

## FAQ

**Q: 조직(Organization) 저장소에도 접근할 수 있나요?**
A: 네, 토큰에 `repo`와 `read:org` 스코프가 있으면 조직 저장소에도 접근할 수 있습니다.

**Q: GitHub Enterprise에서도 사용할 수 있나요?**
A: 현재는 github.com만 지원합니다. GitHub Enterprise 지원은 추후 추가될 예정입니다.

**Q: 토큰이 만료되면 어떻게 되나요?**
A: API 요청 시 인증 오류가 발생합니다. GitHub에서 새 토큰을 발급 후 Settings에서 업데이트하세요.
