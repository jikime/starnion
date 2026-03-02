"""Google API authentication helper."""

from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

from jiki_agent.config import settings
from jiki_agent.db.pool import get_pool
from jiki_agent.db.repositories import google as google_repo


async def get_google_service(user_id: str, service_name: str, version: str):
    """Get an authenticated Google API service for a user.

    Args:
        user_id: The user's Telegram ID.
        service_name: Google API service name (e.g. "calendar", "drive").
        version: API version (e.g. "v3").

    Returns:
        A Google API service resource.

    Raises:
        ValueError: If the user has no linked Google account.
    """
    pool = get_pool()
    token = await google_repo.refresh_if_expired(pool, user_id)
    if not token:
        raise ValueError(
            "구글 계정이 연동되지 않았어요. '구글 연동해줘'라고 말씀해주세요."
        )

    creds = Credentials(
        token=token["access_token"],
        refresh_token=token["refresh_token"],
        token_uri=token.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
    )

    return build(service_name, version, credentials=creds)
