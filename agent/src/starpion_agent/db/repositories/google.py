"""Google OAuth2 token repository."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from psycopg.rows import dict_row

if TYPE_CHECKING:
    from psycopg_pool import AsyncConnectionPool


async def get_token(
    pool: AsyncConnectionPool[Any],
    user_id: str,
) -> dict[str, Any] | None:
    """Get stored Google OAuth2 token for a user."""
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT * FROM google_tokens WHERE user_id = %s",
                (user_id,),
            )
            return await cur.fetchone()


async def save_token(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    access_token: str,
    refresh_token: str,
    scopes: str,
    expires_at: datetime,
) -> None:
    """Save or update a Google OAuth2 token."""
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO google_tokens
                    (user_id, access_token, refresh_token, scopes, expires_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    access_token = EXCLUDED.access_token,
                    refresh_token = EXCLUDED.refresh_token,
                    scopes = EXCLUDED.scopes,
                    expires_at = EXCLUDED.expires_at,
                    updated_at = NOW()
                """,
                (user_id, access_token, refresh_token, scopes, expires_at),
            )
            await conn.commit()


async def delete_token(
    pool: AsyncConnectionPool[Any],
    user_id: str,
) -> None:
    """Delete a user's Google OAuth2 token."""
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM google_tokens WHERE user_id = %s",
                (user_id,),
            )
            await conn.commit()


async def refresh_if_expired(
    pool: AsyncConnectionPool[Any],
    user_id: str,
) -> dict[str, Any] | None:
    """Get token, refreshing it if expired.

    Returns None if no token exists.
    """
    token = await get_token(pool, user_id)
    if token is None:
        return None

    # Check if token is expired (with 5-minute buffer).
    now = datetime.now(timezone.utc)
    expires_at = token["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now >= expires_at:
        # Refresh the token using google-auth.
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials

        from starpion_agent.config import settings

        creds = Credentials(
            token=token["access_token"],
            refresh_token=token["refresh_token"],
            token_uri=token.get("token_uri", "https://oauth2.googleapis.com/token"),
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
        )
        creds.refresh(Request())

        new_expires = creds.expiry
        if new_expires and new_expires.tzinfo is None:
            new_expires = new_expires.replace(tzinfo=timezone.utc)

        await save_token(
            pool,
            user_id=user_id,
            access_token=creds.token,
            refresh_token=creds.refresh_token or token["refresh_token"],
            scopes=token["scopes"],
            expires_at=new_expires,
        )

        token["access_token"] = creds.token
        token["expires_at"] = new_expires

    return token
