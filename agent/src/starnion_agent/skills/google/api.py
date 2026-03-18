"""Google API authentication helper."""

from __future__ import annotations

import logging

from googleapiclient.discovery import build  # type: ignore[import-untyped]
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials

from starnion_agent.config import settings
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import google as google_repo

logger = logging.getLogger(__name__)

# Friendly message returned when the user has no linked Google account
# or when the OAuth token has been revoked / expired beyond refresh.
NOT_LINKED_MSG = (
    "구글 계정 연동이 필요하거나 인증이 만료되었어요. "
    "'구글 연동해줘'라고 말씀해 다시 연결해 주세요."
)


async def get_google_service(
    user_id: str, service_name: str, version: str,
):
    """Get an authenticated Google API service for a user.

    Returns:
        A Google API service resource, or *None* if the user has no
        linked Google account (token missing or refresh failed).
    """
    pool = get_pool()
    try:
        token = await google_repo.refresh_if_expired(pool, user_id)
    except RefreshError as e:
        logger.warning(
            "Google token refresh failed for user %s (invalid_grant): %s", user_id, e,
        )
        return None
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
