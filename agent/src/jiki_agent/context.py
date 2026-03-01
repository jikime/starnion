"""Request-scoped context using contextvars for async safety."""

import contextvars

user_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("user_ctx", default="")


def set_current_user(user_id: str) -> None:
    """Set the current user ID for the active async task."""
    user_ctx.set(user_id)


def get_current_user() -> str:
    """Return the current user ID from the active async context."""
    return user_ctx.get()
