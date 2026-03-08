---
title: Google Integration
nav_order: 1
parent: Integrations
---

# Google Integration

Connecting Starnion to your Google account lets the AI agent control Google Calendar, Gmail, Google Drive, Google Docs, and Google Tasks using natural language. Once connected, you can use all of these from Telegram and the web UI alike.

---

## Overview

With Google integration you can:

- **Calendar**: Create, view, and delete events using natural language, like "Schedule a team meeting at 10 AM tomorrow"
- **Gmail**: Search received mail, send new emails
- **Drive**: View file lists, upload files to Drive
- **Docs**: Create new Google documents, read the content of existing documents
- **Tasks**: Add to-dos, view lists, mark items complete

> **Opt-in feature:** Google integration is disabled by default. An administrator must configure the OAuth app, and each user must complete the connection in Settings before it can be used.

---

## Supported Features

| Service | Supported Features |
|---------|-------------------|
| Calendar | Create events, view upcoming events, delete events |
| Gmail | View received mail list, send mail |
| Drive | View file list, upload files |
| Docs | Create documents, read document content |
| Tasks | Add to-dos, view list, mark complete, delete |

---

## Prerequisites: Creating a Google Cloud Console OAuth App

To use Google integration, a server administrator must create OAuth 2.0 credentials in Google Cloud Console and configure them in Starnion.

> **General users:** This step is performed by the server administrator. Ask your administrator to configure the integration, or follow the procedure below only if you are running Docker yourself.

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project selection dropdown at the top → **New Project**.
3. Enter a project name and click **Create**.

### Step 2: Enable APIs

1. In the left menu, click **APIs & Services** → **Library**.
2. Search for and enable each of the following APIs:
   - `Google Calendar API`
   - `Gmail API`
   - `Google Drive API`
   - `Google Docs API`
   - `Tasks API`

### Step 3: Configure the OAuth Consent Screen

1. Click **APIs & Services** → **OAuth consent screen**.
2. User type: select **External**, then click **Create**.
3. Enter the app name, user support email, and developer contact email.
4. Click **Save and Continue**.
5. Under **Add or remove scopes**, add the following scopes:
   ```
   https://www.googleapis.com/auth/calendar
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/drive
   https://www.googleapis.com/auth/documents
   https://www.googleapis.com/auth/tasks
   ```
6. In the test users step, add your own Google account.

### Step 4: Create OAuth Credentials

1. Click **APIs & Services** → **Credentials**.
2. Click **Create Credentials** → select **OAuth client ID**.
3. Application type: select **Web application**.
4. Under **Authorized redirect URIs**, add the Starnion callback URI:
   ```
   http://localhost:8080/auth/google/callback
   ```
   > For a production environment, replace this with your actual domain (e.g., `https://yourdomain.com/auth/google/callback`).
5. Click **Create**, then copy the **Client ID** and **Client Secret**.

---

## Environment Variable Configuration

Set the credentials you obtained in the Starnion `.env` file.

```dotenv
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
GATEWAY_PUBLIC_URL=http://localhost:8080
```

`GATEWAY_PUBLIC_URL` is the base address for the OAuth callback URI. The Gateway combines this value with `/auth/google/callback` to construct the redirect URI.

After making changes, restart the Gateway service.

```bash
docker compose restart gateway
```

---

## Setup: Connecting Your Google Account

### Connecting via Web UI

1. Log in to the Starnion web UI.
2. Click **Settings** → **Integrations** tab in the left menu.
3. Click **Connect** in the **Google** section.
4. Select the account you want to link on the Google account selection screen.
5. Click **Allow** on the permissions screen.
6. Once connected, **Connected** status will be displayed.

### Connecting via Telegram

You can also initiate Google integration from the Telegram bot.

1. Send a message to the bot such as "connect Google" or "link Google."
2. The bot sends an authentication URL.
3. Click the URL to go through the same OAuth flow.

```
Me: link Google
Bot: Please click the link below to connect your Google account:
    http://yourdomain.com/auth/google/telegram?uid=...
```

---

## How to Use

Once your Google account is connected, make requests to the AI in natural language.

### Google Calendar

```
Me: What's on my schedule tomorrow?
Bot: Tomorrow's scheduled events:
    - 10:00: Weekly team meeting
    - 14:00: Client report

Me: Add a 1-hour project meeting next Wednesday at 2 PM
Bot: Created event 'Project Meeting'.
    - Date/time: 2026-03-11 14:00 – 15:00

Me: Cancel tomorrow's 2 PM meeting
Bot: Deleted event 'Client Report'.
```

### Gmail

```
Me: Show me my unread mail
Bot: Unread mail (latest 10):
    - [Important] Contract review request (from: partner@example.com)
    - Weekly newsletter (from: news@example.com)

Me: Send mail to partner@example.com with the subject "Contract review complete"
Bot: Please confirm before sending.
    Recipient: partner@example.com
    Subject: Contract review complete
    Shall I send it?

Me: Yes, send it
Bot: Mail sent.
```

> **Note:** The AI confirms the content with you before sending mail. It sends only after you confirm with "Yes, send it."

### Google Drive

```
Me: Find the report file in Drive
Bot: Drive file list (search: 'report'):
    - 2026 Q1 Sales Report.xlsx
    - Project Final Report.docx

Me: Upload today's meeting notes file to Drive
Bot: (Uploaded the attached file to Drive.)
    Uploaded 'meeting_notes_20260308.pdf' to Drive.
```

### Google Docs

```
Me: Create a Google document titled "2026 Q2 Plan"
Bot: Created document '2026 Q2 Plan'.
    https://docs.google.com/document/d/abc123...

Me: Read the content of Drive document abc123
Bot: Document: 2026 Q2 Plan
    ...
```

### Google Tasks

```
Me: Add a to-do "Draft proposal" due tomorrow
Bot: Added to-do 'Draft proposal'.

Me: Show my to-do list
Bot: To-do list:
    ⬜ Draft proposal
    ⬜ Collect team feedback
    ⬜ Write weekly report

Me: Mark "Draft proposal" as complete
Bot: Marked to-do 'Draft proposal' as complete.
```

---

## Permission Scopes

The Google permission scopes requested by Starnion are as follows.

| Scope | Purpose |
|-------|---------|
| `calendar` | Read and write events |
| `gmail.send` | Send mail |
| `gmail.readonly` | View mail list |
| `drive` | View file list, upload |
| `documents` | Create and read documents |
| `tasks` | Manage to-dos |

---

## How to Disconnect

1. Settings → Integrations → Google section.
2. Click **Disconnect**.
3. The stored OAuth tokens are deleted immediately upon disconnection.

You can also ask the AI: "disconnect Google."

---

## Important Notes

### Security

- OAuth tokens (access token + refresh token) are stored in the database.
- When the access token expires, it is automatically renewed using the refresh token.
- When the refresh token expires, reconnection is required (typically after 6 months).

### Enabling the Google Skill

The Google skill is disabled by default. An administrator must enable the skill before use.

- Turn on the **Google** skill enable toggle under Settings → Skills.
- If the Google OAuth app settings (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are not configured, enabling the skill will not make it work.

---

## Troubleshooting

### "Google integration is not configured"

The `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables are not set on the server. Check the `.env` file and restart the Gateway.

### "Please connect your Google account first"

You have not yet connected a Google account. Complete the connection under Settings → Integrations → Google in the web UI.

### "This app isn't verified" warning on the OAuth consent screen

This is normal during development. Click **Advanced** → **Go to [App Name]** to continue. For production deployment, request app verification from Google, or if targeting only users within your organization, set the user type to **Internal**.

### "Notion API key is not valid" (or 401 error)

The OAuth token may have expired or been revoked. Disconnect and reconnect.

---

## FAQ

**Q: Can I connect multiple Google accounts?**
A: Currently, only one Google account can be connected per user.

**Q: Is the Google account connected from Telegram the same as from the web UI?**
A: Yes. When connected through the same Starnion account, the same Google token is shared regardless of which channel you use to connect.

**Q: Can I use both Google Tasks and Calendar?**
A: Yes, after connecting Google, you can use both services with natural language.

**Q: Can the AI send mail arbitrarily through Gmail?**
A: No. Before sending mail, the AI confirms the recipient, subject, and body with you, then sends only after you confirm.
