---
title: GitHub Integration
nav_order: 3
parent: Integrations
grand_parent: 🇺🇸 English
---

# GitHub Integration

Connecting Starnion to GitHub lets the AI agent query repository information, issues, and Pull Requests using natural language. Manage your development workflow conversationally.

---

## Overview

With the GitHub integration you can:

- **Repositories**: List repositories, view recent commits
- **Issues**: Create, view, and check issue status
- **Pull Requests**: List PRs, check review status, get summaries
- **Code Search**: Search code within repositories

> **Opt-in feature:** The GitHub integration is disabled by default. You need to register a Personal Access Token and enable the skill to use it.

---

## Supported Features

| Feature | Description |
|---------|-------------|
| Repository listing | View your repository list |
| Issue creation | Create new issues |
| Issue viewing | View issue list and details |
| PR status | Check Pull Request list and review status |
| Code search | Search for keywords in repository code |

---

## Prerequisites: Generate a GitHub Personal Access Token

### Step 1: Create a Token

1. Go to [GitHub Settings](https://github.com/settings/tokens).
2. Click **Generate new token** → **Generate new token (classic)**.
3. Enter a token name in the **Note** field (e.g., `Starnion`).
4. Select an **Expiration** period.
5. Select the following scopes:

   | Scope | Purpose |
   |-------|---------|
   | `repo` | Read/write repositories (including private) |
   | `read:org` | Read organization info |

6. Click **Generate token** and copy the token (`ghp_...` format).

> **Security note:** The token is only visible immediately after creation. Copy it right away.

---

## Setup

### Register Token in Web UI

1. Log in to the Starnion web UI.
2. Go to **Settings** → **Integrations** tab.
3. Find the **GitHub** section and the **Personal Access Token** field.
4. Paste the copied token (`ghp_...`).
5. Click **Save**.
6. Enable the **GitHub skill** toggle.

---

## Usage

Once configured, ask the AI in natural language.

### Repository Listing

```
You: Show me my GitHub repositories
Bot: GitHub repositories:
     - starnion/starnion (Private) ⭐ 12
     - starnion/docs (Public) ⭐ 5
     - starnion/agent (Private) ⭐ 3
```

### Issue Management

```
You: Show open issues in the starnion repo
Bot: starnion/starnion open issues (3):
     - #42: Fix login error (bug)
     - #38: Add multilingual support (enhancement)
     - #35: Update API docs (documentation)

You: Create an issue "Improve search feature" in starnion repo
Bot: Issue created.
     #43: Improve search feature
     URL: https://github.com/starnion/starnion/issues/43
```

### Pull Request Status

```
You: Show recent PRs in the starnion repo
Bot: starnion/starnion PRs:
     - #41: feat: Add search filters (Open, awaiting review)
     - #39: fix: Resolve memory leak (Merged)
```

### Recent Commits

```
You: Show recent commits in the starnion repo
Bot: starnion/starnion recent commits:
     - c29a8d8: config: integrate embedding settings (2 hours ago)
     - a3a6fc0: garden: align counseling space elements (5 hours ago)
```

---

## Required Scopes

| Scope | Purpose |
|-------|---------|
| `repo` | Read/write repositories (including private) |
| `read:org` | Read organization info |

> **Tip:** For read-only access, you can select only `public_repo` instead of `repo`, but private repositories will be inaccessible.

---

## Disconnect

1. Go to Settings → Integrations → GitHub section.
2. Click **Disconnect**.
3. The stored Personal Access Token is immediately deleted.

To also revoke the token on GitHub:
1. Go to [GitHub Settings > Tokens](https://github.com/settings/tokens) → delete the token.

---

## Troubleshooting

### "GitHub integration is not configured"

Check that a Personal Access Token is registered in Settings → Integrations → GitHub.

### "GitHub API authentication failed" (401 error)

- The token may have expired. Generate a new token on GitHub and update it.
- Verify the token has sufficient scopes.

### "Repository not found" (404 error)

- Verify the token has the `repo` scope.
- The `repo` scope is required for private repositories.

---

## FAQ

**Q: Can I access organization repositories?**
A: Yes, if the token has `repo` and `read:org` scopes, organization repositories are accessible.

**Q: Does it work with GitHub Enterprise?**
A: Currently only github.com is supported. GitHub Enterprise support is planned for a future release.

**Q: What happens when the token expires?**
A: API requests will return authentication errors. Generate a new token on GitHub and update it in Settings.
