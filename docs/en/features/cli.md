---
title: CLI Chat & Authentication
nav_order: 12
parent: Features
grand_parent: 🇺🇸 English
---

# CLI Chat & Authentication

## Overview

In addition to the web UI and Telegram, Starnion lets you chat with AI directly from the **terminal (CLI)**. This is especially useful when you are connected to a server via SSH or want to query the AI quickly without opening a browser.

CLI conversations are stored in the **same database** as your web UI and Telegram chats — not in a separate location. That means you can review conversations started in the terminal later in the web UI.

---

## Verifying the Installation

CLI functionality is built into the `starnion` binary. Check whether it is installed with the following command.

```bash
starnion --version
```

If it is not installed, refer to the [Installation Guide](/docs/en/getting-started/introduction).

---

## Authentication

### Logging In

Use `starnion login` to sign in with your email and password. On success, an authentication token is saved to `~/.starnion/user.yaml`.

```bash
starnion login
```

```
Email:    user@example.com
Password: ••••••••
✅ Login successful! Welcome, Jane Doe.
Token valid until: April 9, 2025 (30 days)
```

**Token storage location:** `~/.starnion/user.yaml`

```yaml
# ~/.starnion/user.yaml
token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
expires_at: "2025-04-09T00:00:00Z"
email: user@example.com
name: Jane Doe
```

> **Tokens are valid for 30 days.** Starting 7 days before expiry, a renewal reminder is displayed each time you run a CLI command.

---

### Logging Out

`starnion logout` deletes the locally stored token. It does not affect the server-side session. You will need to log in again before using the CLI.

```bash
starnion logout
```

```
🔒 Logged out. Local credentials have been removed.
```

---

### Checking the Current Login

Use `starnion whoami` to display information about the currently authenticated account.

```bash
starnion whoami
```

```
Name:    Jane Doe
Email:   user@example.com
Token expires: April 9, 2025 (in 23 days)
```

If you are not logged in:

```
Not logged in. Run 'starnion login' to authenticate.
```

---

## CLI Chat

### Starting Interactive REPL Mode

Running `starnion chat` enters an interactive REPL (Read-Eval-Print Loop) mode. Type a message at the prompt and the AI responds in real time.

```bash
starnion chat
```

```
Starnion CLI Chat Mode
Starting a new conversation. Type 'exit' or press Ctrl+C to quit.

> Hello! What's the weather like today?
AI: Let me check the current weather for you.
    🔧 Running weather...
    Current weather in Seoul: Clear, 18°C.
    Air quality is moderate.

> Summarize my spending this month.
AI: 🔧 Running finance_summary...
    March spending (1st–10th):
    - Food:        $31.50
    - Café:        $13.30
    - Transport:   $11.40
    - Total:       $56.20

> exit
Exiting. Your conversation has been saved.
```

### Ending a Session

To exit REPL mode, use one of the following:

- Type `exit` or `quit`
- Press `Ctrl+C`

The current conversation is saved automatically when you exit.

---

## Integration with the Web UI

Conversations started in the CLI are **visible in the web UI sidebar**. CLI conversations are stored with `platform='cli'` and appear under the **💻 CLI** section in the sidebar, separate from web and Telegram conversations.

```
Sidebar conversation list:
  📱 Telegram
    └─ Asked about today's weather
  💻 CLI
    └─ March 10 spending summary  ← started in the CLI
  🌐 Web
    └─ Contract analysis request
```

> You can continue a CLI conversation directly in the web UI. Selecting a CLI conversation in the web UI restores the full message context of that thread.

---

## Token Expiry Warnings

Authentication tokens are valid for **30 days**. Starting **7 days before expiry**, a reminder is shown every time you run a CLI command.

```bash
starnion chat
```

```
⚠️  Your token expires in 5 days. Run 'starnion login' to renew it.

Starnion CLI Chat Mode
> ...
```

After the token has expired, all CLI commands will prompt you to log in again.

```bash
starnion whoami
```

```
❌ Your token has expired. Run 'starnion login' to sign in again.
```

---

## Multi-User Support

The CLI supports **independent authentication per OS user**. A separate `~/.starnion/user.yaml` file is created in each OS user's home directory, so multiple users on the same server can each use their own Starnion account.

| OS User | Token File Path |
|---------|----------------|
| alice | `/home/alice/.starnion/user.yaml` |
| bob | `/home/bob/.starnion/user.yaml` |
| root | `/root/.starnion/user.yaml` |

Each user can access only their own conversation history using their own token.

---

## Command Reference

| Command | Description |
|---------|-------------|
| `starnion login` | Sign in with email/password and save the token to `~/.starnion/user.yaml` |
| `starnion logout` | Delete the local token |
| `starnion whoami` | Show the current account and token expiry date |
| `starnion chat` | Start interactive REPL chat mode |

---

## Tips & FAQ

**Q. Can I edit the token file (`~/.starnion/user.yaml`) manually?**

A. This is not recommended. The token is a server-signed JWT. Modifying it manually will cause authentication to fail. When your token expires, use `starnion login` to obtain a new one.

**Q. CLI conversations are not appearing in the web UI sidebar.**

A. Look for the **💻 CLI** section in the sidebar. If you already have the web UI open, refresh the page to reload the conversation list.

**Q. Can I switch between multiple Starnion accounts in the CLI?**

A. Yes — run `starnion logout` and then `starnion login` with a different account. The token file will be overwritten with the new account's credentials.

**Q. I want to use the CLI in a CI/CD pipeline.**

A. Currently, the CLI only supports interactive login. API key authentication for automated environments is planned for a future release.

**Q. Does the CLI work on an unstable network connection?**

A. The CLI makes an API call for each message. If the network drops, the request fails and an error message is displayed without retrying. We recommend using the CLI on a stable network connection.

---

## starnion ask — One-Shot Questions

While `starnion chat` is an interactive session, `starnion ask` sends **a single question and returns the answer immediately**. This is ideal for scripts and pipelines where you want to incorporate AI output.

### Basic Usage

```bash
# Direct question
starnion ask "Give me an example of list comprehension in Python"

# Pipe content
cat error.log | starnion ask "What's causing this error?"
cat report.md | starnion ask "Summarize this in 3 lines"
```

### Features

| Feature | Details |
|---------|---------|
| Login required | Yes (run `starnion login` first) |
| Conversation history | Saved to the web UI |
| Streaming | Real-time output supported |
| Pipe support | `cat file \| starnion ask "..."` |

### Pipe Examples

```bash
# Analyze log files
tail -100 /var/log/app.log | starnion ask "Analyze the recent error patterns"

# Code review
git diff HEAD~1 | starnion ask "Review these changes"

# Summarize a document
curl -s https://example.com/readme.md | starnion ask "Summarize the key points"
```
