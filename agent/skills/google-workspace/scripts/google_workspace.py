#!/usr/bin/env python3
"""Google Workspace skill CLI — Calendar, Drive, Docs, Tasks, Gmail integration."""

import argparse
import base64
import os
import sys
from datetime import datetime, timezone, timedelta
from email.mime.text import MIMEText

import psycopg2
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "_shared"))
from starnion_utils import _load_starnion_yaml, decrypt_value, encrypt_value

_yaml = _load_starnion_yaml()
_db = _yaml.get("database", {}) if isinstance(_yaml.get("database"), dict) else {}
_db_url_default = (
    f"postgresql://{_db.get('user', 'postgres')}:{_db.get('password', '')}"
    f"@{_db.get('host', 'localhost')}:{_db.get('port', 5432)}"
    f"/{_db.get('name', 'starnion')}?sslmode={_db.get('ssl_mode', 'disable')}"
) if _db else ""
DB_URL = os.environ.get("DATABASE_URL") or _db_url_default

_auth = _yaml.get("auth", {}) if isinstance(_yaml.get("auth"), dict) else {}
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY") or _auth.get("encryption_key", "")

_KO_WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]


# ── DB & Auth helpers ──────────────────────────────────────────────────────────

def get_db_conn():
    if not DB_URL:
        sys.exit("ERROR: Database not configured. Set DATABASE_URL or configure ~/.starnion/starnion.yaml")
    return psycopg2.connect(DB_URL)


def get_google_token(conn, user_id: str) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT access_token, refresh_token, expires_at FROM google_tokens WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
    if not row:
        sys.exit("ERROR: Google account not connected. Connect via the Google Workspace skill page.")
    access_token = decrypt_value(row[0], ENCRYPTION_KEY) if ENCRYPTION_KEY else row[0]
    refresh_token = decrypt_value(row[1], ENCRYPTION_KEY) if (ENCRYPTION_KEY and row[1]) else row[1]
    # Fail loudly if decryption silently fell back to the ciphertext
    if access_token.startswith("enc:"):
        sys.exit(
            f"ERROR: Failed to decrypt Google access token "
            f"(ENCRYPTION_KEY={'set' if ENCRYPTION_KEY else 'NOT SET'}). "
            "Check that ENCRYPTION_KEY matches the key used when the token was saved."
        )
    return {"access_token": access_token, "refresh_token": refresh_token, "expires_at": row[2]}


def get_user_google_credentials(conn, user_id: str) -> tuple[str, str]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT api_key FROM integration_keys WHERE user_id = %s AND provider = 'google'",
            (user_id,),
        )
        row = cur.fetchone()
    if not row:
        sys.exit("ERROR: Google Client ID/Secret not configured in skill settings.")
    decrypted = decrypt_value(row[0], ENCRYPTION_KEY)
    if ":" not in decrypted:
        sys.exit("ERROR: Google Client ID/Secret not configured in skill settings.")
    parts = decrypted.split(":", 1)
    return parts[0], parts[1]


def refresh_access_token(conn, user_id: str, refresh_token: str, client_id: str, client_secret: str) -> str:
    resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=10,
    )
    if not resp.ok:
        sys.exit(f"ERROR: Failed to refresh token: {resp.text}")
    data = resp.json()
    new_token = data["access_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))
    stored_token = encrypt_value(new_token, ENCRYPTION_KEY) if ENCRYPTION_KEY else new_token
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE google_tokens SET access_token = %s, expires_at = %s WHERE user_id = %s",
            (stored_token, expires_at, user_id),
        )
    conn.commit()
    return new_token


def get_valid_access_token(conn, user_id: str) -> str:
    token_info = get_google_token(conn, user_id)
    expires_at = token_info["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) >= expires_at - timedelta(minutes=5):
        client_id, client_secret = get_user_google_credentials(conn, user_id)
        return refresh_access_token(conn, user_id, token_info["refresh_token"], client_id, client_secret)
    return token_info["access_token"]


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def google_request(method: str, url: str, conn, user_id: str,
                   token: str, **kwargs) -> requests.Response:
    """Make a Google API request; if 401, refresh token once and retry.

    Extra headers (e.g. Content-Type) can be passed via `headers=`.
    They are merged with the Authorization header.
    """
    extra_headers = kwargs.pop("headers", {})
    merged = {**_auth_headers(token), **extra_headers}
    resp = requests.request(method, url, headers=merged, **kwargs)
    if resp.status_code == 401:
        client_id, client_secret = get_user_google_credentials(conn, user_id)
        token_info = get_google_token(conn, user_id)
        new_token = refresh_access_token(
            conn, user_id, token_info["refresh_token"], client_id, client_secret
        )
        new_merged = {**_auth_headers(new_token), **extra_headers}
        resp = requests.request(method, url, headers=new_merged, **kwargs)
    return resp


def _fmt_event_start(start_str: str) -> str:
    """Format a Google Calendar start string to Korean date+time."""
    try:
        if "T" in start_str:
            dt = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
            dt = dt.astimezone()
            day = _KO_WEEKDAYS[dt.weekday()]
            h, m = dt.hour, dt.minute
            if h == 0 and m == 0:
                time_str = "자정"
            elif h < 12:
                time_str = f"오전 {h}:{m:02d}" if m else f"오전 {h}시"
            elif h == 12:
                time_str = f"오후 12:{m:02d}" if m else "정오"
            else:
                time_str = f"오후 {h - 12}:{m:02d}" if m else f"오후 {h - 12}시"
            return f"{dt.month}월 {dt.day}일({day}) {time_str}"
        else:
            from datetime import date as date_cls
            d = date_cls.fromisoformat(start_str)
            day = _KO_WEEKDAYS[d.weekday()]
            return f"{d.month}월 {d.day}일({day}) 종일"
    except Exception:
        return start_str


# ── Calendar commands ──────────────────────────────────────────────────────────

def cmd_calendar(args, conn):
    """List upcoming calendar events."""
    token = get_valid_access_token(conn, args.user_id)
    now = datetime.now(timezone.utc).isoformat()
    end = (datetime.now(timezone.utc) + timedelta(days=args.days)).isoformat()

    resp = google_request("GET",
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        conn, args.user_id, token,
        params={
            "timeMin": now,
            "timeMax": end,
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": 20,
        },
        timeout=10,
    )
    if not resp.ok:
        sys.exit(f"ERROR: Calendar API error: {resp.status_code} {resp.text}")

    events = resp.json().get("items", [])
    if not events:
        print(f"No events in the next {args.days} days.")
        return

    print(f"## 향후 {args.days}일 일정 ({len(events)}개)\n")
    for ev in events:
        raw_start = ev.get("start", {}).get("dateTime") or ev.get("start", {}).get("date", "")
        formatted = _fmt_event_start(raw_start)
        summary = ev.get("summary", "(제목 없음)")
        location = ev.get("location", "")
        loc_str = f" 📍 {location}" if location else ""
        print(f"- {formatted}: {summary}{loc_str} (ID: {ev.get('id', 'N/A')})")


def cmd_calendar_create(args, conn):
    """Create a calendar event."""
    token = get_valid_access_token(conn, args.user_id)
    body = {
        "summary": args.title,
        "start": {"dateTime": args.start_time},
        "end": {"dateTime": args.end_time},
    }
    if args.description:
        body["description"] = args.description

    resp = google_request("POST",
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        conn, args.user_id, token,
        headers={"Content-Type": "application/json"},
        json=body,
        timeout=10,
    )
    if not resp.ok:
        sys.exit(f"ERROR: Calendar API error: {resp.status_code} {resp.text}")

    event = resp.json()
    print(f"일정 '{args.title}'을 생성했습니다. (ID: {event.get('id', 'N/A')})")


def cmd_calendar_delete(args, conn):
    """Delete a calendar event."""
    token = get_valid_access_token(conn, args.user_id)

    resp = google_request("DELETE",
        f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{args.event_id}",
        conn, args.user_id, token, timeout=10,
    )
    if resp.status_code == 404:
        sys.exit(f"ERROR: Event ID '{args.event_id}' not found.")
    if not resp.ok:
        sys.exit(f"ERROR: Calendar API error: {resp.status_code} {resp.text}")

    print(f"일정(ID: {args.event_id})을 삭제했습니다.")


# ── Drive commands ─────────────────────────────────────────────────────────────

def cmd_drive(args, conn):
    """Search Google Drive files by name (query required)."""
    token = get_valid_access_token(conn, args.user_id)

    resp = google_request("GET",
        "https://www.googleapis.com/drive/v3/files",
        conn, args.user_id, token,
        params={
            "q": f"name contains '{args.query}' and trashed = false",
            "fields": "files(id,name,mimeType,modifiedTime,webViewLink)",
            "pageSize": args.limit,
            "orderBy": "modifiedTime desc",
        },
        timeout=10,
    )
    if not resp.ok:
        sys.exit(f"ERROR: Drive API error: {resp.status_code} {resp.text}")

    files = resp.json().get("files", [])
    if not files:
        print(f"'{args.query}'로 검색된 파일이 없습니다.")
        return

    print(f"## Drive 검색 결과: '{args.query}' ({len(files)}개)\n")
    for f in files:
        name = f.get("name", "")
        link = f.get("webViewLink", "")
        modified = f.get("modifiedTime", "")[:10]
        print(f"- [{name}]({link}) — {modified}")


def cmd_drive_list(args, conn):
    """List Google Drive files (optional query filter)."""
    token = get_valid_access_token(conn, args.user_id)

    params: dict = {
        "fields": "files(id,name,mimeType,modifiedTime,webViewLink)",
        "pageSize": args.limit,
        "orderBy": "modifiedTime desc",
    }
    if args.query:
        params["q"] = f"name contains '{args.query}' and trashed = false"
    else:
        params["q"] = "trashed = false"

    resp = google_request("GET",
        "https://www.googleapis.com/drive/v3/files",
        conn, args.user_id, token,
        params=params, timeout=10,
    )
    if not resp.ok:
        sys.exit(f"ERROR: Drive API error: {resp.status_code} {resp.text}")

    files = resp.json().get("files", [])
    if not files:
        print("파일이 없습니다.")
        return

    label = f"'{args.query}' 검색 결과" if args.query else "최근 파일"
    print(f"## Drive {label} ({len(files)}개)\n")
    for f in files:
        name = f.get("name", "")
        link = f.get("webViewLink", "")
        modified = f.get("modifiedTime", "")[:10]
        mime = f.get("mimeType", "")
        print(f"- [{name}]({link}) — {modified} ({mime})")


# ── Docs commands ──────────────────────────────────────────────────────────────

def cmd_docs_create(args, conn):
    """Create a Google Document."""
    token = get_valid_access_token(conn, args.user_id)

    resp = google_request("POST",
        "https://docs.googleapis.com/v1/documents",
        conn, args.user_id, token,
        headers={"Content-Type": "application/json"},
        json={"title": args.title}, timeout=10,
    )
    if not resp.ok:
        sys.exit(f"ERROR: Docs API error: {resp.status_code} {resp.text}")

    doc_id = resp.json().get("documentId", "")

    if args.content:
        update_resp = google_request("POST",
            f"https://docs.googleapis.com/v1/documents/{doc_id}:batchUpdate",
            conn, args.user_id, token,
            headers={"Content-Type": "application/json"},
            json={"requests": [{"insertText": {"location": {"index": 1}, "text": args.content}}]},
            timeout=10,
        )
        if not update_resp.ok:
            sys.exit(f"ERROR: Docs batchUpdate error: {update_resp.status_code} {update_resp.text}")

    print(f"문서 '{args.title}'을 생성했습니다.")
    print(f"https://docs.google.com/document/d/{doc_id}")


def cmd_docs_read(args, conn):
    """Read a Google Document."""
    token = get_valid_access_token(conn, args.user_id)

    resp = google_request("GET",
        f"https://docs.googleapis.com/v1/documents/{args.document_id}",
        conn, args.user_id, token, timeout=10,
    )
    if resp.status_code == 404:
        sys.exit(f"ERROR: Document '{args.document_id}' not found.")
    if not resp.ok:
        sys.exit(f"ERROR: Docs API error: {resp.status_code} {resp.text}")

    doc = resp.json()
    title = doc.get("title", "")
    content_parts = []
    for elem in doc.get("body", {}).get("content", []):
        for pe in elem.get("paragraph", {}).get("elements", []):
            text = pe.get("textRun", {}).get("content", "")
            if text:
                content_parts.append(text)

    text = "".join(content_parts).strip()
    preview = text[:1000] + "\n...(이하 생략)" if len(text) > 1000 else text
    print(f"## {title}\n\n{preview}")


# ── Tasks commands ─────────────────────────────────────────────────────────────

def cmd_tasks_create(args, conn):
    """Add a task to Google Tasks."""
    token = get_valid_access_token(conn, args.user_id)

    body: dict = {"title": args.title}
    if args.notes:
        body["notes"] = args.notes
    if args.due:
        body["due"] = args.due

    resp = google_request("POST",
        "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks",
        conn, args.user_id, token,
        headers={"Content-Type": "application/json"},
        json=body, timeout=10,
    )
    if not resp.ok:
        sys.exit(f"ERROR: Tasks API error: {resp.status_code} {resp.text}")

    task = resp.json()
    print(f"할 일 '{args.title}'을 추가했습니다. (ID: {task.get('id', 'N/A')})")


def cmd_tasks_list(args, conn):
    """List Google Tasks (incomplete only)."""
    token = get_valid_access_token(conn, args.user_id)

    resp = google_request("GET",
        "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks",
        conn, args.user_id, token,
        params={"maxResults": args.max, "showCompleted": "false"}, timeout=10,
    )
    if not resp.ok:
        sys.exit(f"ERROR: Tasks API error: {resp.status_code} {resp.text}")

    items = resp.json().get("items", [])
    if not items:
        print("할 일이 없습니다.")
        return

    print(f"## 할 일 목록 ({len(items)}개)\n")
    for t in items:
        status = "✅" if t.get("status") == "completed" else "⬜"
        due = f" (마감: {t['due'][:10]})" if t.get("due") else ""
        print(f"{status} {t.get('title', '(제목 없음)')}{due} (ID: {t.get('id', 'N/A')})")


def cmd_tasks_complete(args, conn):
    """Mark a Google Task as completed."""
    token = get_valid_access_token(conn, args.user_id)

    # Fetch current task
    get_resp = google_request(
        "GET",
        f"https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/{args.task_id}",
        conn, args.user_id, token,
        timeout=10,
    )
    if get_resp.status_code == 404:
        sys.exit(f"ERROR: Task ID '{args.task_id}' not found.")
    if not get_resp.ok:
        sys.exit(f"ERROR: Tasks API error: {get_resp.status_code} {get_resp.text}")

    task = get_resp.json()
    task["status"] = "completed"

    resp = google_request(
        "PUT",
        f"https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/{args.task_id}",
        conn, args.user_id, token,
        headers={"Content-Type": "application/json"},
        json=task,
        timeout=10,
    )
    if not resp.ok:
        sys.exit(f"ERROR: Tasks API error: {resp.status_code} {resp.text}")

    print(f"할 일 '{task.get('title', args.task_id)}'을 완료 처리했습니다.")


def cmd_tasks_delete(args, conn):
    """Delete a Google Task."""
    token = get_valid_access_token(conn, args.user_id)

    # Fetch title before delete
    get_resp = google_request(
        "GET",
        f"https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/{args.task_id}",
        conn, args.user_id, token,
        timeout=10,
    )
    title = args.task_id
    if get_resp.ok:
        title = get_resp.json().get("title", args.task_id)

    resp = google_request(
        "DELETE",
        f"https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/{args.task_id}",
        conn, args.user_id, token,
        timeout=10,
    )
    if resp.status_code == 404:
        sys.exit(f"ERROR: Task ID '{args.task_id}' not found.")
    if not resp.ok:
        sys.exit(f"ERROR: Tasks API error: {resp.status_code} {resp.text}")

    print(f"할 일 '{title}'을 삭제했습니다.")


# ── Gmail commands ─────────────────────────────────────────────────────────────

def cmd_mail_send(args, conn):
    """Send a Gmail message."""
    token = get_valid_access_token(conn, args.user_id)

    msg = MIMEText(args.body, "plain", "utf-8")
    msg["to"] = args.to
    msg["subject"] = args.subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

    resp = google_request(
        "POST",
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        conn, args.user_id, token,
        headers={"Content-Type": "application/json"},
        json={"raw": raw},
        timeout=10,
    )
    if not resp.ok:
        sys.exit(f"ERROR: Gmail API error: {resp.status_code} {resp.text}")

    print(f"'{args.subject}' 메일을 {args.to}에게 전송했습니다.")


def cmd_mail_list(args, conn):
    """List Gmail messages."""
    token = get_valid_access_token(conn, args.user_id)

    list_resp = google_request(
        "GET",
        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
        conn, args.user_id, token,
        params={"q": args.query, "maxResults": args.max},
        timeout=10,
    )
    if not list_resp.ok:
        sys.exit(f"ERROR: Gmail API error: {list_resp.status_code} {list_resp.text}")

    messages = list_resp.json().get("messages", [])
    if not messages:
        print("메일이 없습니다.")
        return

    # After potential token refresh in list_resp, get the current valid token
    token_info = get_google_token(conn, args.user_id)
    token = token_info["access_token"]

    print(f"## 메일 목록 ({len(messages)}개)\n")
    for msg_ref in messages:
        try:
            msg_resp = google_request(
                "GET",
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_ref['id']}",
                conn, args.user_id, token,
                params={"format": "metadata", "metadataHeaders": ["Subject", "From", "Date"]},
                timeout=10,
            )
            if not msg_resp.ok:
                continue
            headers = {
                h["name"]: h["value"]
                for h in msg_resp.json().get("payload", {}).get("headers", [])
            }
            subject = headers.get("Subject", "(제목 없음)")
            sender = headers.get("From", "?")
            date = headers.get("Date", "")[:16]
            print(f"- {subject} (from: {sender}, {date})")
        except Exception:
            continue


# ── CLI entrypoint ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Google Workspace skill CLI")
    parser.add_argument("--user-id", required=True, help="User ID")

    sub = parser.add_subparsers(dest="command", required=True)

    # calendar (list)
    cal = sub.add_parser("calendar", help="List upcoming calendar events")
    cal.add_argument("--days", type=int, default=7, help="Days ahead (default: 7)")

    # calendar-create
    cal_c = sub.add_parser("calendar-create", help="Create a calendar event")
    cal_c.add_argument("--title", required=True, help="Event title")
    cal_c.add_argument("--start-time", required=True, help="Start time (ISO 8601, e.g. 2026-04-01T14:00:00+09:00)")
    cal_c.add_argument("--end-time", required=True, help="End time (ISO 8601)")
    cal_c.add_argument("--description", default="", help="Event description")

    # calendar-delete
    cal_d = sub.add_parser("calendar-delete", help="Delete a calendar event")
    cal_d.add_argument("--event-id", required=True, help="Event ID (from calendar command)")

    # drive (search, query required)
    drv = sub.add_parser("drive", help="Search Drive files by name")
    drv.add_argument("--query", required=True, help="Search keyword")
    drv.add_argument("--limit", type=int, default=10, help="Max results (default: 10)")

    # drive-list (optional query)
    drv_l = sub.add_parser("drive-list", help="List Drive files (query optional)")
    drv_l.add_argument("--query", default="", help="Filter by name (optional)")
    drv_l.add_argument("--limit", type=int, default=10, help="Max results (default: 10)")

    # docs-create
    docs_c = sub.add_parser("docs-create", help="Create a Google Document")
    docs_c.add_argument("--title", required=True, help="Document title")
    docs_c.add_argument("--content", default="", help="Initial content")

    # docs-read
    docs_r = sub.add_parser("docs-read", help="Read a Google Document")
    docs_r.add_argument("--document-id", required=True, help="Document ID (from URL)")

    # tasks-create
    task_c = sub.add_parser("tasks-create", help="Add a task to Google Tasks")
    task_c.add_argument("--title", required=True, help="Task title")
    task_c.add_argument("--notes", default="", help="Task notes")
    task_c.add_argument("--due", default="", help="Due date (RFC 3339, e.g. 2026-04-01T00:00:00Z)")

    # tasks-list
    task_l = sub.add_parser("tasks-list", help="List Google Tasks")
    task_l.add_argument("--max", type=int, default=20, help="Max results (default: 20)")

    # tasks-complete
    task_done = sub.add_parser("tasks-complete", help="Mark a task as completed")
    task_done.add_argument("--task-id", required=True, help="Task ID (from tasks-list)")

    # tasks-delete
    task_del = sub.add_parser("tasks-delete", help="Delete a task")
    task_del.add_argument("--task-id", required=True, help="Task ID (from tasks-list)")

    # mail-send
    mail_s = sub.add_parser("mail-send", help="Send a Gmail message")
    mail_s.add_argument("--to", required=True, help="Recipient email address")
    mail_s.add_argument("--subject", required=True, help="Email subject")
    mail_s.add_argument("--body", required=True, help="Email body text")

    # mail-list
    mail_l = sub.add_parser("mail-list", help="List Gmail messages")
    mail_l.add_argument("--query", default="is:unread", help="Gmail search query (default: is:unread)")
    mail_l.add_argument("--max", type=int, default=10, help="Max results (default: 10)")

    args = parser.parse_args()

    conn = get_db_conn()
    try:
        dispatch = {
            "calendar":        cmd_calendar,
            "calendar-create": cmd_calendar_create,
            "calendar-delete": cmd_calendar_delete,
            "drive":           cmd_drive,
            "drive-list":      cmd_drive_list,
            "docs-create":     cmd_docs_create,
            "docs-read":       cmd_docs_read,
            "tasks-create":    cmd_tasks_create,
            "tasks-list":      cmd_tasks_list,
            "tasks-complete":  cmd_tasks_complete,
            "tasks-delete":    cmd_tasks_delete,
            "mail-send":       cmd_mail_send,
            "mail-list":       cmd_mail_list,
        }
        dispatch[args.command](args, conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
