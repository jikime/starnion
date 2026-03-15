---
name: GitHub 연동
description: GitHub 저장소, 이슈, PR, 코드 검색 — Personal Access Token 연동 필요
keywords: ["github", "깃허브", "레포", "repo", "repository", "이슈", "issue", "PR", "pull request", "풀리퀘스트", "코드 검색", "CI", "커밋", "commit"]
---

# GitHub 연동 (github)

## 도구 목록

| 도구 | 설명 |
|------|------|
| `github_list_repos` | 인증된 사용자의 저장소 목록 조회 |
| `github_list_issues` | 저장소의 이슈 목록 조회 |
| `github_create_issue` | 저장소에 새 이슈 생성 |
| `github_list_prs` | 저장소의 Pull Request 목록 조회 |
| `github_get_pr` | PR 상세 정보 조회 (변경 파일, CI 상태 포함) |
| `github_search_code` | GitHub 전체에서 코드 검색 |

## 사용 전 필수: GitHub 연동

설정 → 연동 메뉴에서 **GitHub Personal Access Token (PAT)**을 등록해야 합니다.

- classic PAT 권장 스코프: `repo`, `read:user`
- Fine-grained token: 대상 저장소에 `Contents`, `Issues`, `Pull requests` 권한 부여

## 도구별 사용 지침

### `github_list_repos`
- `visibility`: `'all'` | `'public'` | `'private'` (기본: `'all'`)
- `sort`: `'updated'` | `'created'` | `'pushed'` | `'full_name'` (기본: `'updated'`)
- `limit`: 1~50 (기본: 10)

### `github_list_issues` / `github_list_prs`
- `repo`: `owner/repo` 형식 (예: `octocat/Hello-World`)
- `state`: `'open'` | `'closed'` | `'all'` (기본: `'open'`)
- `limit`: 1~50 (기본: 10)

### `github_create_issue`
- `repo`: `owner/repo` 형식
- `title`: 이슈 제목 (필수)
- `body`: 이슈 본문 (선택)
- `labels`: 쉼표 구분 레이블 (예: `'bug,help wanted'`)

### `github_get_pr`
- `repo`: `owner/repo` 형식
- `pr_number`: PR 번호 (정수)
- 변경 파일 목록(최대 10개)과 CI 검사 상태(최대 5개)를 함께 반환

### `github_search_code`
- `query`: GitHub 코드 검색 쿼리 — `repo:owner/name` 한정자 포함 권장
  - 예: `"className repo:facebook/react"`
- `limit`: 1~30 (기본: 10)
- 주의: 인증 없이는 rate limit이 매우 낮으므로 반드시 PAT 연동 후 사용

## 사용 시나리오

```
"내 GitHub 저장소 목록 보여줘"
→ github_list_repos()

"facebook/react 최근 이슈 보여줘"
→ github_list_issues(repo="facebook/react", state="open")

"내 프로젝트에 버그 이슈 만들어줘"
→ github_create_issue(repo="my-org/my-repo", title="버그 제목", labels="bug")

"octocat/Hello-World의 열린 PR 목록"
→ github_list_prs(repo="octocat/Hello-World")

"PR #42 상세 내용 알려줘"
→ github_get_pr(repo="owner/repo", pr_number=42)

"우리 레포에서 useState 사용한 곳 찾아줘"
→ github_search_code(query="useState repo:owner/my-repo")
```

## 응답 스타일

- 저장소 목록: 공개/비공개 아이콘(🌐/🔒), 언어, 설명, 스타 수 포함
- 이슈/PR 목록: 번호, 제목, 레이블 포함
- PR 상세: 상태, 변경 파일, CI 검사 결과 포함
- 연동 안 된 경우: 설정 → 연동 메뉴 안내
