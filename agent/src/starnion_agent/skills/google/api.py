"""Google API authentication helper."""

from __future__ import annotations

from googleapiclient.discovery import build  # type: ignore[import-untyped]
from google.oauth2.credentials import Credentials

from starnion_agent.config import settings
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import google as google_repo

# Friendly message returned when the user has no linked Google account.
NOT_LINKED_MSG = "구글 계정이 연동되지 않았어요. '구글 연동해줘'라고 말씀해주세요."


async def get_google_service(
    user_id: str, service_name: str, version: str,
):
    """Get an authenticated Google API service for a user.

    Returns:
        A Google API service resource, or *None* if the user has no
        linked Google account (token missing or refresh failed).
    """
    pool = get_pool()
    token = await google_repo.refresh_if_expired(pool, user_id)
    if not token:
        return None

    creds = Credentials(
        token=token["access_token"],
        refresh_token=token["refresh_token"],
        token_uri=token.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=settings.google.client_id,
        client_secret=settings.google.client_secret,
    )

    return build(service_name, version, credentials=creds)
