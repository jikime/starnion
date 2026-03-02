"""Google Workspace integration tools (12 tools)."""

from __future__ import annotations

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from jiki_agent.config import settings
from jiki_agent.context import get_current_user
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import google as google_repo
from jiki_agent.skills.google.api import get_google_service
from jiki_agent.skills.guard import skill_guard


# ---------------------------------------------------------------------------
# Auth tools
# ---------------------------------------------------------------------------

SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.readonly",
]


@tool
@skill_guard("google")
async def google_auth() -> str:
    """구글 계정을 연동합니다. 인증 URL을 생성하여 반환합니다."""
    from google_auth_oauthlib.flow import Flow

    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    if not settings.google_client_id or not settings.google_client_secret:
        return "구글 연동 설정이 되어 있지 않아요. 관리자에게 문의해주세요."

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.google_redirect_uri],
            },
        },
        scopes=SCOPES,
    )
    flow.redirect_uri = settings.google_redirect_uri

    auth_url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        state=user_id,
    )

    return f"아래 링크를 눌러 구글 계정을 연동해주세요:\n{auth_url}"


@tool
@skill_guard("google")
async def google_disconnect() -> str:
    """구글 계정 연동을 해제합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    pool = get_pool()
    await google_repo.delete_token(pool, user_id)
    return "구글 계정 연동을 해제했어요."


# ---------------------------------------------------------------------------
# Calendar tools
# ---------------------------------------------------------------------------


class CalendarCreateInput(BaseModel):
    """Input schema for google_calendar_create."""

    title: str = Field(description="일정 제목")
    start_time: str = Field(description="시작 시간 (ISO 8601, 예: 2026-03-02T14:00:00+09:00)")
    end_time: str = Field(description="종료 시간 (ISO 8601)")
    description: str = Field(default="", description="일정 설명")


class CalendarListInput(BaseModel):
    """Input schema for google_calendar_list."""

    max_results: int = Field(default=10, description="최대 조회 건수")


@tool(args_schema=CalendarCreateInput)
@skill_guard("google")
async def google_calendar_create(
    title: str, start_time: str, end_time: str, description: str = "",
) -> str:
    """구글 캘린더에 일정을 생성합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "calendar", "v3")
    event = {
        "summary": title,
        "description": description,
        "start": {"dateTime": start_time},
        "end": {"dateTime": end_time},
    }
    result = service.events().insert(calendarId="primary", body=event).execute()
    return f"일정 '{title}'을 생성했어요. (ID: {result.get('id', 'N/A')})"


@tool(args_schema=CalendarListInput)
@skill_guard("google")
async def google_calendar_list(max_results: int = 10) -> str:
    """구글 캘린더의 예정된 일정을 조회합니다."""
    from datetime import datetime, timezone

    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "calendar", "v3")
    now = datetime.now(timezone.utc).isoformat()
    result = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=now,
            maxResults=max_results,
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )

    events = result.get("items", [])
    if not events:
        return "예정된 일정이 없어요."

    lines = []
    for e in events:
        start = e["start"].get("dateTime", e["start"].get("date", ""))
        lines.append(f"- {start}: {e.get('summary', '(제목 없음)')}")
    return "예정된 일정:\n" + "\n".join(lines)


# ---------------------------------------------------------------------------
# Docs tools
# ---------------------------------------------------------------------------


class DocsCreateInput(BaseModel):
    """Input schema for google_docs_create."""

    title: str = Field(description="문서 제목")
    content: str = Field(default="", description="문서 초기 내용")


class DocsReadInput(BaseModel):
    """Input schema for google_docs_read."""

    document_id: str = Field(description="구글 문서 ID")


@tool(args_schema=DocsCreateInput)
@skill_guard("google")
async def google_docs_create(title: str, content: str = "") -> str:
    """구글 문서를 생성합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "docs", "v1")
    doc = service.documents().create(body={"title": title}).execute()
    doc_id = doc.get("documentId", "")

    if content:
        requests = [
            {"insertText": {"location": {"index": 1}, "text": content}},
        ]
        service.documents().batchUpdate(
            documentId=doc_id, body={"requests": requests},
        ).execute()

    return f"문서 '{title}'을 생성했어요.\nhttps://docs.google.com/document/d/{doc_id}"


@tool(args_schema=DocsReadInput)
@skill_guard("google")
async def google_docs_read(document_id: str) -> str:
    """구글 문서의 내용을 읽어옵니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "docs", "v1")
    doc = service.documents().get(documentId=document_id).execute()

    title = doc.get("title", "")
    body = doc.get("body", {})
    content_parts = []
    for elem in body.get("content", []):
        paragraph = elem.get("paragraph", {})
        for e in paragraph.get("elements", []):
            text_run = e.get("textRun", {})
            if text_run.get("content"):
                content_parts.append(text_run["content"])

    text = "".join(content_parts).strip()
    preview = text[:500] + "..." if len(text) > 500 else text
    return f"문서: {title}\n\n{preview}"


# ---------------------------------------------------------------------------
# Tasks tools
# ---------------------------------------------------------------------------


class TasksCreateInput(BaseModel):
    """Input schema for google_tasks_create."""

    title: str = Field(description="할 일 제목")
    notes: str = Field(default="", description="할 일 메모")
    due: str = Field(default="", description="마감일 (RFC 3339, 예: 2026-03-10T00:00:00Z)")


class TasksListInput(BaseModel):
    """Input schema for google_tasks_list."""

    max_results: int = Field(default=20, description="최대 조회 건수")


@tool(args_schema=TasksCreateInput)
@skill_guard("google")
async def google_tasks_create(
    title: str, notes: str = "", due: str = "",
) -> str:
    """구글 Tasks에 할 일을 추가합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "tasks", "v1")
    task_body: dict = {"title": title}
    if notes:
        task_body["notes"] = notes
    if due:
        task_body["due"] = due

    result = service.tasks().insert(tasklist="@default", body=task_body).execute()
    return f"할 일 '{title}'을 추가했어요. (ID: {result.get('id', 'N/A')})"


@tool(args_schema=TasksListInput)
@skill_guard("google")
async def google_tasks_list(max_results: int = 20) -> str:
    """구글 Tasks의 할 일 목록을 조회합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "tasks", "v1")
    result = (
        service.tasks()
        .list(tasklist="@default", maxResults=max_results, showCompleted=False)
        .execute()
    )

    items = result.get("items", [])
    if not items:
        return "할 일이 없어요."

    lines = []
    for t in items:
        status = "✅" if t.get("status") == "completed" else "⬜"
        lines.append(f"{status} {t.get('title', '(제목 없음)')}")
    return "할 일 목록:\n" + "\n".join(lines)


# ---------------------------------------------------------------------------
# Drive tools
# ---------------------------------------------------------------------------


class DriveUploadInput(BaseModel):
    """Input schema for google_drive_upload."""

    file_url: str = Field(description="업로드할 파일의 URL")
    file_name: str = Field(description="파일명")
    mime_type: str = Field(default="application/octet-stream", description="MIME 타입")


class DriveListInput(BaseModel):
    """Input schema for google_drive_list."""

    query: str = Field(default="", description="검색 쿼리 (예: 보고서)")
    max_results: int = Field(default=10, description="최대 조회 건수")


@tool(args_schema=DriveUploadInput)
@skill_guard("google")
async def google_drive_upload(
    file_url: str, file_name: str, mime_type: str = "application/octet-stream",
) -> str:
    """구글 드라이브에 파일을 업로드합니다."""
    from io import BytesIO

    from googleapiclient.http import MediaIoBaseUpload

    from jiki_agent.document.parser import fetch_file

    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    data = await fetch_file(file_url)
    service = await get_google_service(user_id, "drive", "v3")

    file_metadata = {"name": file_name}
    media = MediaIoBaseUpload(BytesIO(data), mimetype=mime_type)
    result = (
        service.files()
        .create(body=file_metadata, media_body=media, fields="id,webViewLink")
        .execute()
    )

    link = result.get("webViewLink", "")
    return f"'{file_name}'을 드라이브에 업로드했어요.\n{link}"


@tool(args_schema=DriveListInput)
@skill_guard("google")
async def google_drive_list(query: str = "", max_results: int = 10) -> str:
    """구글 드라이브의 파일 목록을 조회합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "drive", "v3")
    q = f"name contains '{query}'" if query else None
    result = (
        service.files()
        .list(q=q, pageSize=max_results, fields="files(id,name,mimeType,modifiedTime)")
        .execute()
    )

    files = result.get("files", [])
    if not files:
        return "파일이 없어요." if not query else f"'{query}'로 검색된 파일이 없어요."

    lines = []
    for f in files:
        lines.append(f"- {f.get('name', '?')} ({f.get('mimeType', '?')})")
    return "드라이브 파일 목록:\n" + "\n".join(lines)


# ---------------------------------------------------------------------------
# Gmail tools
# ---------------------------------------------------------------------------


class MailSendInput(BaseModel):
    """Input schema for google_mail_send."""

    to: str = Field(description="수신자 이메일 주소")
    subject: str = Field(description="메일 제목")
    body: str = Field(description="메일 본문")


class MailListInput(BaseModel):
    """Input schema for google_mail_list."""

    query: str = Field(default="is:unread", description="Gmail 검색 쿼리")
    max_results: int = Field(default=10, description="최대 조회 건수")


@tool(args_schema=MailSendInput)
@skill_guard("google")
async def google_mail_send(to: str, subject: str, body: str) -> str:
    """Gmail로 메일을 전송합니다."""
    import base64
    from email.mime.text import MIMEText

    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "gmail", "v1")

    message = MIMEText(body)
    message["to"] = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

    service.users().messages().send(
        userId="me", body={"raw": raw},
    ).execute()

    return f"'{subject}' 메일을 {to}에게 전송했어요."


@tool(args_schema=MailListInput)
@skill_guard("google")
async def google_mail_list(query: str = "is:unread", max_results: int = 10) -> str:
    """Gmail 메일 목록을 조회합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "gmail", "v1")
    result = (
        service.users()
        .messages()
        .list(userId="me", q=query, maxResults=max_results)
        .execute()
    )

    messages = result.get("messages", [])
    if not messages:
        return "메일이 없어요."

    lines = []
    for msg_ref in messages[:max_results]:
        msg = (
            service.users()
            .messages()
            .get(userId="me", id=msg_ref["id"], format="metadata", metadataHeaders=["Subject", "From"])
            .execute()
        )
        headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        subject = headers.get("Subject", "(제목 없음)")
        sender = headers.get("From", "?")
        lines.append(f"- {subject} (from: {sender})")

    return "메일 목록:\n" + "\n".join(lines)
