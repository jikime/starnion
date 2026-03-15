"""GitHub integration tools.

PAT (Personal Access Token) is fetched per-user from integration_keys table
(provider='github').  Falls back to nothing if the user has not connected GitHub.
"""

from __future__ import annotations

import logging

import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.github.com"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_github_token() -> str | None:
    """Return the GitHub PAT for the current user from integration_keys."""
    user_id = get_current_user()
    if not user_id:
        return None
    try:
        from psycopg.rows import dict_row

        pool = get_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT api_key FROM integration_keys"
                    " WHERE user_id = %s AND provider = 'github'",
                    (user_id,),
                )
                row = await cur.fetchone()
                return row["api_key"] if row and row.get("api_key") else None
    except Exception:
        logger.debug("Failed to fetch GitHub token", exc_info=True)
        return None


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _not_linked() -> str:
    return (
        "GitHub 연동이 되어 있지 않아요. "
        "설정 → 연동 메뉴에서 GitHub Personal Access Token을 등록해주세요."
    )


def _token_invalid() -> str:
    return "GitHub PAT이 유효하지 않아요. 설정 → 연동에서 토큰을 다시 등록해주세요."


# ---------------------------------------------------------------------------
# Input schemas
# ---------------------------------------------------------------------------

class GithubListReposInput(BaseModel):
    visibility: str = Field(
        default="all",
        description="저장소 공개 범위: 'all' | 'public' | 'private'",
    )
    sort: str = Field(
        default="updated",
        description="정렬 기준: 'updated' | 'created' | 'pushed' | 'full_name'",
    )
    limit: int = Field(default=10, ge=1, le=50, description="반환할 최대 저장소 수 (1~50)")


class GithubListIssuesInput(BaseModel):
    repo: str = Field(description="저장소 경로 (예: owner/repo)")
    state: str = Field(
        default="open",
        description="이슈 상태: 'open' | 'closed' | 'all'",
    )
    limit: int = Field(default=10, ge=1, le=50, description="반환할 최대 이슈 수 (1~50)")


class GithubCreateIssueInput(BaseModel):
    repo: str = Field(description="저장소 경로 (예: owner/repo)")
    title: str = Field(description="이슈 제목")
    body: str = Field(default="", description="이슈 본문 내용 (선택)")
    labels: str = Field(
        default="",
        description="쉼표로 구분된 레이블 목록 (예: 'bug,help wanted')",
    )


class GithubListPRsInput(BaseModel):
    repo: str = Field(description="저장소 경로 (예: owner/repo)")
    state: str = Field(
        default="open",
        description="PR 상태: 'open' | 'closed' | 'all'",
    )
    limit: int = Field(default=10, ge=1, le=50, description="반환할 최대 PR 수 (1~50)")


class GithubGetPRInput(BaseModel):
    repo: str = Field(description="저장소 경로 (예: owner/repo)")
    pr_number: int = Field(description="PR 번호")


class GithubSearchCodeInput(BaseModel):
    query: str = Field(description="검색할 코드 쿼리 (예: 'addClass repo:jquery/jquery')")
    limit: int = Field(default=10, ge=1, le=30, description="반환할 최대 결과 수 (1~30)")


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@tool(args_schema=GithubListReposInput)
@skill_guard("github")
async def github_list_repos(visibility: str = "all", sort: str = "updated", limit: int = 10) -> str:
    """인증된 사용자의 GitHub 저장소 목록을 조회합니다."""
    token = await _get_github_token()
    if not token:
        return _not_linked()

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{_BASE_URL}/user/repos",
                headers=_headers(token),
                params={"visibility": visibility, "sort": sort, "per_page": min(limit, 50)},
            )
            if resp.status_code == 401:
                return _token_invalid()
            resp.raise_for_status()
            repos = resp.json()
    except httpx.HTTPStatusError as e:
        return f"GitHub 저장소 목록 조회에 실패했어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("github_list_repos failed", exc_info=True)
        return "GitHub 저장소 목록 조회 중 오류가 발생했어요."

    if not repos:
        return "저장소가 없어요."

    lines = [f"GitHub 저장소 목록 ({len(repos)}개):"]
    for r in repos:
        name = r.get("full_name", "")
        desc = r.get("description") or ""
        stars = r.get("stargazers_count", 0)
        private = "🔒" if r.get("private") else "🌐"
        lang = r.get("language") or ""
        lang_str = f" [{lang}]" if lang else ""
        desc_str = f" — {desc}" if desc else ""
        lines.append(f"  {private} {name}{lang_str}{desc_str} ⭐{stars}")

    return "\n".join(lines)


@tool(args_schema=GithubListIssuesInput)
@skill_guard("github")
async def github_list_issues(repo: str, state: str = "open", limit: int = 10) -> str:
    """GitHub 저장소의 이슈 목록을 조회합니다."""
    token = await _get_github_token()
    if not token:
        return _not_linked()

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{_BASE_URL}/repos/{repo}/issues",
                headers=_headers(token),
                params={"state": state, "per_page": min(limit, 50), "pulls": "false"},
            )
            if resp.status_code == 401:
                return _token_invalid()
            if resp.status_code == 404:
                return f"저장소 `{repo}`를 찾을 수 없어요. 경로를 확인해주세요."
            resp.raise_for_status()
            items = resp.json()
    except httpx.HTTPStatusError as e:
        return f"이슈 목록 조회에 실패했어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("github_list_issues failed", exc_info=True)
        return "이슈 목록 조회 중 오류가 발생했어요."

    # Filter out pull requests (GitHub API returns PRs in /issues endpoint)
    issues = [i for i in items if not i.get("pull_request")]

    if not issues:
        return f"`{repo}` 저장소에 {state} 상태의 이슈가 없어요."

    lines = [f"`{repo}` 이슈 ({state}, {len(issues)}개):"]
    for i in issues:
        num = i.get("number")
        title = i.get("title", "")
        labels = ", ".join(lb["name"] for lb in i.get("labels", []))
        label_str = f" [{labels}]" if labels else ""
        lines.append(f"  #{num} {title}{label_str}")

    return "\n".join(lines)


@tool(args_schema=GithubCreateIssueInput)
@skill_guard("github")
async def github_create_issue(repo: str, title: str, body: str = "", labels: str = "") -> str:
    """GitHub 저장소에 새 이슈를 생성합니다."""
    token = await _get_github_token()
    if not token:
        return _not_linked()

    payload: dict = {"title": title}
    if body:
        payload["body"] = body
    if labels:
        payload["labels"] = [lb.strip() for lb in labels.split(",") if lb.strip()]

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{_BASE_URL}/repos/{repo}/issues",
                headers=_headers(token),
                json=payload,
            )
            if resp.status_code == 401:
                return _token_invalid()
            if resp.status_code == 404:
                return f"저장소 `{repo}`를 찾을 수 없어요."
            if resp.status_code == 403:
                return "이슈 생성 권한이 없어요. PAT에 `repo` 스코프가 있는지 확인해주세요."
            resp.raise_for_status()
            issue = resp.json()
    except httpx.HTTPStatusError as e:
        return f"이슈 생성에 실패했어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("github_create_issue failed", exc_info=True)
        return "이슈 생성 중 오류가 발생했어요."

    num = issue.get("number")
    url = issue.get("html_url", "")
    return f"✅ 이슈가 생성됐어요!\n제목: {title}\n#{num}: {url}"


@tool(args_schema=GithubListPRsInput)
@skill_guard("github")
async def github_list_prs(repo: str, state: str = "open", limit: int = 10) -> str:
    """GitHub 저장소의 Pull Request 목록을 조회합니다."""
    token = await _get_github_token()
    if not token:
        return _not_linked()

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{_BASE_URL}/repos/{repo}/pulls",
                headers=_headers(token),
                params={"state": state, "per_page": min(limit, 50)},
            )
            if resp.status_code == 401:
                return _token_invalid()
            if resp.status_code == 404:
                return f"저장소 `{repo}`를 찾을 수 없어요."
            resp.raise_for_status()
            prs = resp.json()
    except httpx.HTTPStatusError as e:
        return f"PR 목록 조회에 실패했어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("github_list_prs failed", exc_info=True)
        return "PR 목록 조회 중 오류가 발생했어요."

    if not prs:
        return f"`{repo}` 저장소에 {state} 상태의 PR이 없어요."

    lines = [f"`{repo}` Pull Requests ({state}, {len(prs)}개):"]
    for pr in prs:
        num = pr.get("number")
        title = pr.get("title", "")
        author = pr.get("user", {}).get("login", "")
        base = pr.get("base", {}).get("ref", "")
        head = pr.get("head", {}).get("ref", "")
        draft = " [draft]" if pr.get("draft") else ""
        lines.append(f"  #{num} {title}{draft} ({head} → {base}) by {author}")

    return "\n".join(lines)


@tool(args_schema=GithubGetPRInput)
@skill_guard("github")
async def github_get_pr(repo: str, pr_number: int) -> str:
    """GitHub PR의 상세 정보를 조회합니다 (제목, 본문, 변경 파일, CI 상태 등)."""
    token = await _get_github_token()
    if not token:
        return _not_linked()

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # PR metadata
            pr_resp = await client.get(
                f"{_BASE_URL}/repos/{repo}/pulls/{pr_number}",
                headers=_headers(token),
            )
            if pr_resp.status_code == 401:
                return _token_invalid()
            if pr_resp.status_code == 404:
                return f"PR #{pr_number}를 찾을 수 없어요."
            pr_resp.raise_for_status()
            pr = pr_resp.json()

            # Changed files
            files_resp = await client.get(
                f"{_BASE_URL}/repos/{repo}/pulls/{pr_number}/files",
                headers=_headers(token),
                params={"per_page": 30},
            )
            files_resp.raise_for_status()
            files = files_resp.json()

            # CI check runs
            sha = pr.get("head", {}).get("sha", "")
            checks_resp = await client.get(
                f"{_BASE_URL}/repos/{repo}/commits/{sha}/check-runs",
                headers=_headers(token),
                params={"per_page": 10},
            ) if sha else None
            checks = checks_resp.json().get("check_runs", []) if checks_resp and checks_resp.status_code == 200 else []

    except httpx.HTTPStatusError as e:
        return f"PR 조회에 실패했어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("github_get_pr failed", exc_info=True)
        return "PR 조회 중 오류가 발생했어요."

    title = pr.get("title", "")
    state = pr.get("state", "")
    merged = pr.get("merged", False)
    author = pr.get("user", {}).get("login", "")
    base = pr.get("base", {}).get("ref", "")
    head = pr.get("head", {}).get("ref", "")
    body = (pr.get("body") or "")[:500]
    url = pr.get("html_url", "")
    additions = pr.get("additions", 0)
    deletions = pr.get("deletions", 0)
    changed_files_count = pr.get("changed_files", 0)

    status = "merged ✅" if merged else state

    lines = [
        f"**PR #{pr_number}: {title}**",
        f"상태: {status} | 작성자: {author}",
        f"브랜치: {head} → {base}",
        f"변경: +{additions} -{deletions} ({changed_files_count}개 파일)",
        f"URL: {url}",
    ]

    if body:
        lines.append(f"\n본문:\n{body}")

    if files:
        lines.append(f"\n변경 파일 ({min(len(files), 10)}개):")
        for f in files[:10]:
            fname = f.get("filename", "")
            status_f = f.get("status", "")
            add = f.get("additions", 0)
            rem = f.get("deletions", 0)
            lines.append(f"  {status_f} {fname} (+{add} -{rem})")

    if checks:
        lines.append(f"\nCI 검사 ({len(checks)}개):")
        for c in checks[:5]:
            cname = c.get("name", "")
            cstatus = c.get("status", "")
            conclsn = c.get("conclusion") or cstatus
            icon = "✅" if conclsn == "success" else ("❌" if conclsn in ("failure", "cancelled") else "🔄")
            lines.append(f"  {icon} {cname}: {conclsn}")

    return "\n".join(lines)


@tool(args_schema=GithubSearchCodeInput)
@skill_guard("github")
async def github_search_code(query: str, limit: int = 10) -> str:
    """GitHub에서 코드를 검색합니다. 'repo:owner/name' 등의 한정자를 사용할 수 있습니다."""
    token = await _get_github_token()
    if not token:
        return _not_linked()

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{_BASE_URL}/search/code",
                headers=_headers(token),
                params={"q": query, "per_page": min(limit, 30)},
            )
            if resp.status_code == 401:
                return _token_invalid()
            if resp.status_code == 422:
                return "검색 쿼리가 올바르지 않아요. 'repo:owner/name' 등의 한정자를 포함해주세요."
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        return f"코드 검색에 실패했어요. (HTTP {e.response.status_code})"
    except Exception:
        logger.debug("github_search_code failed", exc_info=True)
        return "코드 검색 중 오류가 발생했어요."

    items = data.get("items", [])
    total = data.get("total_count", 0)

    if not items:
        return f"'{query}'에 해당하는 코드를 찾지 못했어요."

    lines = [f"코드 검색 결과: '{query}' (총 {total}개 중 {len(items)}개 표시)"]
    for item in items:
        repo_name = item.get("repository", {}).get("full_name", "")
        path = item.get("path", "")
        url = item.get("html_url", "")
        lines.append(f"  📄 {repo_name}/{path}")
        lines.append(f"     {url}")

    return "\n".join(lines)
