---
name: github
display_name: GitHub 연동
description: "GitHub 저장소, 이슈, PR, 코드 검색 — Personal Access Token 연동 필요. Use for: github, 깃허브, 저장소, repo, 이슈, PR, pull request, 커밋, branch, code search"
version: 1.0.0
emoji: "🐙"
category: productivity
enabled_by_default: false
requires_api_key: true
platforms: web, telegram, api
api_key_provider: github
api_key_label: GitHub Personal Access Token
uses_provider: false
allowed-tools:
  - Bash
  - exec
triggers:
  keywords:
    - github
    - 깃허브
    - 저장소
    - repository
    - repo
    - 이슈
    - issue
    - PR
    - pull request
    - 풀리퀘스트
    - 커밋
    - commit
    - 브랜치
    - branch
    - 코드
    - code search
  when_to_use:
    - User asks about GitHub repositories or code
    - User wants to search for issues or pull requests
    - User wants to browse or read code from GitHub
    - User mentions a GitHub repository URL or org/repo name
---

# GitHub 연동

Always pass `--user-id {user_id}`.

## Prerequisites

- API key is automatically injected as `GITHUB_TOKEN` environment variable when configured in the web UI. **Always attempt to run the script** — it will report if credentials are missing.
  - classic PAT 권장 스코프: `repo`, `read:user`
  - Fine-grained token: 대상 저장소에 `Contents`, `Issues`, `Pull requests` 권한 부여
- Environment: `DATABASE_URL`

## Commands

### 저장소 목록 조회

```bash
python3 github/scripts/github.py \
  --user-id {user_id} list-repos \
  --visibility all \
  --sort updated \
  --limit 10
```

### 이슈 목록 조회

```bash
python3 github/scripts/github.py \
  --user-id {user_id} list-issues \
  --repo "{owner}/{repo}" \
  --state open \
  --limit 10
```

### 이슈 생성

```bash
python3 github/scripts/github.py \
  --user-id {user_id} create-issue \
  --repo "{owner}/{repo}" \
  --title "{이슈 제목}" \
  --body "{이슈 본문}" \
  --labels "bug,help wanted"
```

### PR 목록 조회

```bash
python3 github/scripts/github.py \
  --user-id {user_id} list-prs \
  --repo "{owner}/{repo}" \
  --state open \
  --limit 10
```

### PR 상세 조회 (변경 파일, CI 상태 포함)

```bash
python3 github/scripts/github.py \
  --user-id {user_id} get-pr \
  --repo "{owner}/{repo}" \
  --pr-number {pr_number}
```

### 코드 검색

```bash
python3 github/scripts/github.py \
  --user-id {user_id} search-code \
  --query "{코드 쿼리} repo:{owner}/{repo}" \
  --limit 10
```

## Options

- `--visibility all|public|private`: 저장소 공개 범위 (list-repos)
- `--sort updated|created|pushed|full_name`: 정렬 기준 (list-repos)
- `--state open|closed|all`: 이슈/PR 상태 필터
- `--limit N`: 결과 개수 (1~50)

## Output

- 저장소 목록: 공개/비공개 아이콘(🌐/🔒), 언어, 설명, 스타 수 포함
- 이슈/PR 목록: 번호, 제목, 레이블 포함
- PR 상세: 상태, 변경 파일(최대 10개), CI 검사 결과(최대 5개) 포함
- 연동 안 된 경우: 스킬 설정 안내 메시지 반환

## Examples

**User:** "내 GitHub 저장소 목록 보여줘"

```bash
python3 github/scripts/github.py \
  --user-id abc123 list-repos \
  --visibility all \
  --sort updated \
  --limit 10
```

**User:** "facebook/react 최근 이슈 보여줘"

```bash
python3 github/scripts/github.py \
  --user-id abc123 list-issues \
  --repo "facebook/react" \
  --state open \
  --limit 10
```

**User:** "PR #42 상세 내용 알려줘"

```bash
python3 github/scripts/github.py \
  --user-id abc123 get-pr \
  --repo "owner/repo" \
  --pr-number 42
```

**User:** "우리 레포에서 useState 사용한 곳 찾아줘"

```bash
python3 github/scripts/github.py \
  --user-id abc123 search-code \
  --query "useState repo:owner/my-repo" \
  --limit 10
```

## Notes

- PAT가 만료된 경우 인증 오류 반환 → 스킬 설정에서 토큰 재등록 안내
- `repo:owner/name` 한정자 없이 코드 검색 시 rate limit 주의
