"""Google Workspace integration tools (12 tools)."""

from __future__ import annotations

import logging

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from starnion_agent.config import settings
from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import google as google_repo
from starnion_agent.skills.google.api import NOT_LINKED_MSG, get_google_service
from starnion_agent.skills.guard import skill_guard

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Auth tools
# ---------------------------------------------------------------------------

@tool
@skill_guard("google")
async def google_auth() -> str:
    """구글 계정을 연동합니다. 인증 URL을 생성하여 반환합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    if not settings.google.client_id or not settings.google.client_secret:
        return (
            "구글 연동 설정이 되어 있지 않아요. "
            "~/.starnion/starnion.yaml 에 아래 내용을 추가한 후 에이전트를 재시작해주세요:\n\n"
            "google:\n"
            "  client_id: YOUR_CLIENT_ID\n"
            "  client_secret: YOUR_CLIENT_SECRET\n"
            "  redirect_uri: YOUR_REDIRECT_URI"
        )

    # Use a server-side redirect endpoint to avoid Telegram Markdown
    # underscore-stripping that corrupts OAuth parameter names
    # (e.g. response_type → responsetype).
    # The gateway URL /auth/google/telegram?uid=<user_id> has no underscores
    # and redirects the browser to the full Google OAuth URL server-side.
    start_url = f"{settings.gateway_url}/auth/google/telegram?uid={user_id}"

    return f"아래 링크를 눌러 구글 계정을 연동해주세요:\n{start_url}"


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


class CalendarDeleteInput(BaseModel):
    """Input schema for google_calendar_delete."""

    event_id: str = Field(description="삭제할 일정 ID (google_calendar_list 에서 확인)")


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
    if service is None:
        return NOT_LINKED_MSG
    event = {
        "summary": title,
        "description": description,
        "start": {"dateTime": start_time},
        "end": {"dateTime": end_time},
    }
    try:
        result = service.events().insert(calendarId="primary", body=event).execute()
    except Exception as e:
        logger.warning("google_calendar_create failed for user %s: %s", user_id, e)
        return f"일정 생성 중 오류가 발생했어요: {e}"
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
    if service is None:
        return NOT_LINKED_MSG
    now = datetime.now(timezone.utc).isoformat()
    try:
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
    except Exception as e:
        logger.warning("google_calendar_list failed for user %s: %s", user_id, e)
        return f"일정 조회 중 오류가 발생했어요: {e}"

    events = result.get("items", [])
    if not events:
        return "예정된 일정이 없어요."

    lines = []
    for e in events:
        start = e["start"].get("dateTime", e["start"].get("date", ""))
        lines.append(
            f"- {start}: {e.get('summary', '(제목 없음)')} (ID: {e.get('id', 'N/A')})"
        )
    return "예정된 일정:\n" + "\n".join(lines)


@tool(args_schema=CalendarDeleteInput)
@skill_guard("google")
async def google_calendar_delete(event_id: str) -> str:
    """구글 캘린더의 일정을 삭제합니다. event_id는 google_calendar_list 로 확인하세요."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "calendar", "v3")
    if service is None:
        return NOT_LINKED_MSG

    try:
        service.events().delete(calendarId="primary", eventId=event_id).execute()
        return f"일정(ID: {event_id})을 삭제했어요."
    except Exception as e:
        err = str(e)
        if "404" in err:
            return f"일정을 찾을 수 없어요. (ID: {event_id})"
        return f"일정 삭제 중 오류가 발생했어요: {err}"


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
    if service is None:
        return NOT_LINKED_MSG
    try:
        doc = service.documents().create(body={"title": title}).execute()
        doc_id = doc.get("documentId", "")

        if content:
            requests = [
                {"insertText": {"location": {"index": 1}, "text": content}},
            ]
            service.documents().batchUpdate(
                documentId=doc_id, body={"requests": requests},
            ).execute()
    except Exception as e:
        logger.warning("google_docs_create failed for user %s: %s", user_id, e)
        return f"문서 생성 중 오류가 발생했어요: {e}"

    return f"문서 '{title}'을 생성했어요.\nhttps://docs.google.com/document/d/{doc_id}"


@tool(args_schema=DocsReadInput)
@skill_guard("google")
async def google_docs_read(document_id: str) -> str:
    """구글 문서의 내용을 읽어옵니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "docs", "v1")
    if service is None:
        return NOT_LINKED_MSG
    try:
        doc = service.documents().get(documentId=document_id).execute()
    except Exception as e:
        logger.warning("google_docs_read failed for user %s: %s", user_id, e)
        err = str(e)
        if "404" in err:
            return f"문서를 찾을 수 없어요. (ID: {document_id})"
        return f"문서 읽기 중 오류가 발생했어요: {e}"

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


class TasksCompleteInput(BaseModel):
    """Input schema for google_tasks_complete."""

    task_id: str = Field(description="완료 처리할 할 일 ID (google_tasks_list 에서 확인)")


class TasksDeleteInput(BaseModel):
    """Input schema for google_tasks_delete."""

    task_id: str = Field(description="삭제할 할 일 ID (google_tasks_list 에서 확인)")


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
    if service is None:
        return NOT_LINKED_MSG
    task_body: dict = {"title": title}
    if notes:
        task_body["notes"] = notes
    if due:
        task_body["due"] = due

    try:
        result = service.tasks().insert(tasklist="@default", body=task_body).execute()
    except Exception as e:
        logger.warning("google_tasks_create failed for user %s: %s", user_id, e)
        return f"할 일 추가 중 오류가 발생했어요: {e}"
    return f"할 일 '{title}'을 추가했어요. (ID: {result.get('id', 'N/A')})"


@tool(args_schema=TasksListInput)
@skill_guard("google")
async def google_tasks_list(max_results: int = 20) -> str:
    """구글 Tasks의 할 일 목록을 조회합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "tasks", "v1")
    if service is None:
        return NOT_LINKED_MSG
    try:
        result = (
            service.tasks()
            .list(tasklist="@default", maxResults=max_results, showCompleted=False)
            .execute()
        )
    except Exception as e:
        logger.warning("google_tasks_list failed for user %s: %s", user_id, e)
        return f"할 일 조회 중 오류가 발생했어요: {e}"

    items = result.get("items", [])
    if not items:
        return "할 일이 없어요."

    lines = []
    for t in items:
        status = "✅" if t.get("status") == "completed" else "⬜"
        lines.append(f"{status} {t.get('title', '(제목 없음)')} (ID: {t.get('id', 'N/A')})")
    return "할 일 목록:\n" + "\n".join(lines)


@tool(args_schema=TasksCompleteInput)
@skill_guard("google")
async def google_tasks_complete(task_id: str) -> str:
    """구글 Tasks의 할 일을 완료 처리합니다. task_id는 google_tasks_list 로 확인하세요."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "tasks", "v1")
    if service is None:
        return NOT_LINKED_MSG

    try:
        task = service.tasks().get(tasklist="@default", task=task_id).execute()
        task["status"] = "completed"
        service.tasks().update(tasklist="@default", task=task_id, body=task).execute()
        return f"할 일 '{task.get('title', task_id)}'을 완료 처리했어요."
    except Exception as e:
        err = str(e)
        if "404" in err:
            return f"할 일을 찾을 수 없어요. (ID: {task_id})"
        return f"완료 처리 중 오류가 발생했어요: {err}"


@tool(args_schema=TasksDeleteInput)
@skill_guard("google")
async def google_tasks_delete(task_id: str) -> str:
    """구글 Tasks의 할 일을 삭제합니다. task_id는 google_tasks_list 로 확인하세요."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "tasks", "v1")
    if service is None:
        return NOT_LINKED_MSG

    try:
        # 삭제 전 제목 조회
        task = service.tasks().get(tasklist="@default", task=task_id).execute()
        title = task.get("title", task_id)
        service.tasks().delete(tasklist="@default", task=task_id).execute()
        return f"할 일 '{title}'을 삭제했어요."
    except Exception as e:
        err = str(e)
        if "404" in err:
            return f"할 일을 찾을 수 없어요. (ID: {task_id})"
        return f"삭제 중 오류가 발생했어요: {err}"


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

    from googleapiclient.http import MediaIoBaseUpload  # type: ignore[import-untyped]

    from starnion_agent.document.parser import fetch_file  # type: ignore[import-not-found]

    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    data = await fetch_file(file_url)
    service = await get_google_service(user_id, "drive", "v3")
    if service is None:
        return NOT_LINKED_MSG

    file_metadata = {"name": file_name}
    media = MediaIoBaseUpload(BytesIO(data), mimetype=mime_type)
    try:
        result = (
            service.files()
            .create(body=file_metadata, media_body=media, fields="id,webViewLink")
            .execute()
        )
    except Exception as e:
        logger.warning("google_drive_upload failed for user %s: %s", user_id, e)
        return f"파일 업로드 중 오류가 발생했어요: {e}"

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
    if service is None:
        return NOT_LINKED_MSG
    q = f"name contains '{query}'" if query else None
    try:
        result = (
            service.files()
            .list(q=q, pageSize=max_results, fields="files(id,name,mimeType,modifiedTime)")
            .execute()
        )
    except Exception as e:
        logger.warning("google_drive_list failed for user %s: %s", user_id, e)
        return f"파일 조회 중 오류가 발생했어요: {e}"

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
    if service is None:
        return NOT_LINKED_MSG

    message = MIMEText(body)
    message["to"] = to
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")

    try:
        service.users().messages().send(
            userId="me", body={"raw": raw},
        ).execute()
    except Exception as e:
        logger.warning("google_mail_send failed for user %s: %s", user_id, e)
        return f"메일 전송 중 오류가 발생했어요: {e}"

    return f"'{subject}' 메일을 {to}에게 전송했어요."


@tool(args_schema=MailListInput)
@skill_guard("google")
async def google_mail_list(query: str = "is:unread", max_results: int = 10) -> str:
    """Gmail 메일 목록을 조회합니다."""
    user_id = get_current_user()
    if not user_id:
        return "사용자 정보를 확인할 수 없어요."

    service = await get_google_service(user_id, "gmail", "v1")
    if service is None:
        return NOT_LINKED_MSG
    try:
        result = (
            service.users()
            .messages()
            .list(userId="me", q=query, maxResults=max_results)
            .execute()
        )
    except Exception as e:
        logger.warning("google_mail_list failed for user %s: %s", user_id, e)
        return f"메일 조회 중 오류가 발생했어요: {e}"

    messages = result.get("messages", [])
    if not messages:
        return "메일이 없어요."

    lines = []
    for msg_ref in messages[:max_results]:
        try:
            msg = (
                service.users()
                .messages()
                .get(userId="me", id=msg_ref["id"], format="metadata", metadataHeaders=["Subject", "From"])
                .execute()
            )
        except Exception as e:
            logger.warning("google_mail_list: failed to fetch message %s: %s", msg_ref["id"], e)
            continue
        headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        subject = headers.get("Subject", "(제목 없음)")
        sender = headers.get("From", "?")
        lines.append(f"- {subject} (from: {sender})")

    if not lines:
        return "메일 내용을 불러올 수 없었어요."
    return "메일 목록:\n" + "\n".join(lines)
