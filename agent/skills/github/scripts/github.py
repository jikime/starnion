#!/usr/bin/env python3
"""starnion-github — GitHub integration CLI for StarNion agent.

GITHUB_TOKEN is injected into the subprocess environment by the agent runner.
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

_BASE_URL = "https://api.github.com"


def get_github_token(user_id: str) -> str | None:
    """Return GitHub PAT injected by the agent runner via GITHUB_TOKEN env var."""
    return os.environ.get("GITHUB_TOKEN") or None


# ── HTTP helpers ───────────────────────────────────────────────────────────────
def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _github_get(token: str, path: str, params: dict | None = None) -> Any:
    url = f"{_BASE_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=_headers(token))
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}") from e


def _github_post(token: str, path: str, body: dict) -> dict:
    url = f"{_BASE_URL}{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={**_headers(token), "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}") from e


def _not_linked() -> str:
    return (
        "GitHub is not connected. "
        "Please register your GitHub Personal Access Token in the skill settings."
    )


# ── Commands ───────────────────────────────────────────────────────────────────
def cmd_list_repos(token: str, visibility: str, sort: str, limit: int) -> str:
    try:
        repos = _github_get(token, "/user/repos", {
            "visibility": visibility,
            "sort": sort,
            "per_page": min(limit, 50),
        })
    except RuntimeError as e:
        if "401" in str(e):
            return "GitHub PAT is invalid. Please re-register your token in the skill settings."
        return f"Failed to list GitHub repositories. ({e})"

    if not repos:
        return "No repositories found."

    lines = [f"GitHub repositories ({len(repos)}):"]
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


def cmd_list_issues(token: str, repo: str, state: str, limit: int) -> str:
    try:
        items = _github_get(token, f"/repos/{repo}/issues", {
            "state": state,
            "per_page": min(limit, 50),
        })
    except RuntimeError as e:
        if "401" in str(e):
            return "GitHub PAT is invalid."
        if "404" in str(e):
            return f"Repository `{repo}` not found."
        return f"Failed to list issues. ({e})"

    # Filter out pull requests
    issues = [i for i in items if not i.get("pull_request")]
    if not issues:
        return f"No {state} issues in `{repo}`."

    lines = [f"`{repo}` issues ({state}, {len(issues)}):"]
    for i in issues:
        num = i.get("number")
        title = i.get("title", "")
        labels = ", ".join(lb["name"] for lb in i.get("labels", []))
        label_str = f" [{labels}]" if labels else ""
        lines.append(f"  #{num} {title}{label_str}")
    return "\n".join(lines)


def cmd_create_issue(token: str, repo: str, title: str, body: str, labels: str) -> str:
    payload: dict = {"title": title}
    if body:
        payload["body"] = body
    if labels:
        payload["labels"] = [lb.strip() for lb in labels.split(",") if lb.strip()]

    try:
        issue = _github_post(token, f"/repos/{repo}/issues", payload)
    except RuntimeError as e:
        if "401" in str(e):
            return "GitHub PAT is invalid."
        if "404" in str(e):
            return f"Repository `{repo}` not found."
        if "403" in str(e):
            return "No permission to create issues. Check that your PAT has the `repo` scope."
        return f"Failed to create issue. ({e})"

    num = issue.get("number")
    url = issue.get("html_url", "")
    return f"✅ Issue created!\nTitle: {title}\n#{num}: {url}"


def cmd_list_prs(token: str, repo: str, state: str, limit: int) -> str:
    try:
        prs = _github_get(token, f"/repos/{repo}/pulls", {
            "state": state,
            "per_page": min(limit, 50),
        })
    except RuntimeError as e:
        if "401" in str(e):
            return "GitHub PAT is invalid."
        if "404" in str(e):
            return f"Repository `{repo}` not found."
        return f"Failed to list PRs. ({e})"

    if not prs:
        return f"No {state} PRs in `{repo}`."

    lines = [f"`{repo}` Pull Requests ({state}, {len(prs)}):"]
    for pr in prs:
        num = pr.get("number")
        title = pr.get("title", "")
        author = pr.get("user", {}).get("login", "")
        base = pr.get("base", {}).get("ref", "")
        head = pr.get("head", {}).get("ref", "")
        draft = " [draft]" if pr.get("draft") else ""
        lines.append(f"  #{num} {title}{draft} ({head} → {base}) by {author}")
    return "\n".join(lines)


def cmd_get_pr(token: str, repo: str, pr_number: int) -> str:
    try:
        pr = _github_get(token, f"/repos/{repo}/pulls/{pr_number}")
        files = _github_get(token, f"/repos/{repo}/pulls/{pr_number}/files", {"per_page": 30})
        sha = pr.get("head", {}).get("sha", "")
        checks_data = _github_get(token, f"/repos/{repo}/commits/{sha}/check-runs", {"per_page": 10}) if sha else {}
        checks = checks_data.get("check_runs", []) if isinstance(checks_data, dict) else []
    except RuntimeError as e:
        if "401" in str(e):
            return "GitHub PAT is invalid."
        if "404" in str(e):
            return f"PR #{pr_number} not found."
        return f"Failed to get PR. ({e})"

    title = pr.get("title", "")
    state = pr.get("state", "")
    merged = pr.get("merged", False)
    author = pr.get("user", {}).get("login", "")
    base = pr.get("base", {}).get("ref", "")
    head = pr.get("head", {}).get("ref", "")
    body_text = (pr.get("body") or "")[:500]
    url = pr.get("html_url", "")
    additions = pr.get("additions", 0)
    deletions = pr.get("deletions", 0)
    changed_files_count = pr.get("changed_files", 0)

    status = "merged ✅" if merged else state

    lines = [
        f"**PR #{pr_number}: {title}**",
        f"Status: {status} | Author: {author}",
        f"Branch: {head} → {base}",
        f"Changes: +{additions} -{deletions} ({changed_files_count} files)",
        f"URL: {url}",
    ]

    if body_text:
        lines.append(f"\nBody:\n{body_text}")

    if files:
        lines.append(f"\nChanged files ({min(len(files), 10)}):")
        for f in files[:10]:
            fname = f.get("filename", "")
            fstatus = f.get("status", "")
            add = f.get("additions", 0)
            rem = f.get("deletions", 0)
            lines.append(f"  {fstatus} {fname} (+{add} -{rem})")

    if checks:
        lines.append(f"\nCI checks ({len(checks)}):")
        for c in checks[:5]:
            cname = c.get("name", "")
            cstatus = c.get("status", "")
            conclsn = c.get("conclusion") or cstatus
            icon = "✅" if conclsn == "success" else ("❌" if conclsn in ("failure", "cancelled") else "🔄")
            lines.append(f"  {icon} {cname}: {conclsn}")

    return "\n".join(lines)


def cmd_search_code(token: str, query: str, limit: int) -> str:
    try:
        data = _github_get(token, "/search/code", {
            "q": query,
            "per_page": min(limit, 30),
        })
    except RuntimeError as e:
        if "401" in str(e):
            return "GitHub PAT is invalid."
        if "422" in str(e):
            return "Invalid search query. Include qualifiers like 'repo:owner/name'."
        return f"Code search failed. ({e})"

    items = data.get("items", [])
    total = data.get("total_count", 0)

    if not items:
        return f"No code results found for '{query}'."

    lines = [f"Code search: '{query}' ({len(items)} of {total} results)"]
    for item in items:
        repo_name = item.get("repository", {}).get("full_name", "")
        path = item.get("path", "")
        url = item.get("html_url", "")
        lines.append(f"  📄 {repo_name}/{path}")
        lines.append(f"     {url}")
    return "\n".join(lines)


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="StarNion GitHub integration")
    parser.add_argument("--user-id", required=True, help="User ID")

    sub = parser.add_subparsers(dest="command", required=True)

    # list-repos
    p = sub.add_parser("list-repos", help="List repositories")
    p.add_argument("--visibility", choices=["all", "public", "private"], default="all")
    p.add_argument("--sort", choices=["updated", "created", "pushed", "full_name"], default="updated")
    p.add_argument("--limit", type=int, default=10)

    # list-issues
    p = sub.add_parser("list-issues", help="List issues")
    p.add_argument("--repo", required=True, help="owner/repo")
    p.add_argument("--state", choices=["open", "closed", "all"], default="open")
    p.add_argument("--limit", type=int, default=10)

    # create-issue
    p = sub.add_parser("create-issue", help="Create an issue")
    p.add_argument("--repo", required=True, help="owner/repo")
    p.add_argument("--title", required=True)
    p.add_argument("--body", default="")
    p.add_argument("--labels", default="", help="Comma-separated labels")

    # list-prs
    p = sub.add_parser("list-prs", help="List pull requests")
    p.add_argument("--repo", required=True, help="owner/repo")
    p.add_argument("--state", choices=["open", "closed", "all"], default="open")
    p.add_argument("--limit", type=int, default=10)

    # get-pr
    p = sub.add_parser("get-pr", help="Get PR details")
    p.add_argument("--repo", required=True, help="owner/repo")
    p.add_argument("--pr-number", type=int, required=True)

    # search-code
    p = sub.add_parser("search-code", help="Search code")
    p.add_argument("--query", required=True)
    p.add_argument("--limit", type=int, default=10)

    args = parser.parse_args()

    token = get_github_token(args.user_id)
    if not token:
        print(_not_linked())
        return

    if args.command == "list-repos":
        print(cmd_list_repos(token, args.visibility, args.sort, args.limit))
    elif args.command == "list-issues":
        print(cmd_list_issues(token, args.repo, args.state, args.limit))
    elif args.command == "create-issue":
        print(cmd_create_issue(token, args.repo, args.title, args.body, args.labels))
    elif args.command == "list-prs":
        print(cmd_list_prs(token, args.repo, args.state, args.limit))
    elif args.command == "get-pr":
        print(cmd_get_pr(token, args.repo, args.pr_number))
    elif args.command == "search-code":
        print(cmd_search_code(token, args.query, args.limit))


if __name__ == "__main__":
    main()
