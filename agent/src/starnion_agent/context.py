"""Request-scoped context using contextvars for async safety."""

import contextvars

user_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("user_ctx", default="")
lang_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("lang_ctx", default="ko")


def set_current_user(user_id: str) -> None:
    """Set the current user ID for the active async task."""
    user_ctx.set(user_id)


def get_current_user() -> str:
    """Return the current user ID from the active async context."""
    return user_ctx.get()


def set_current_language(language: str) -> None:
    """Set the current user language for the active async task."""
    lang_ctx.set(language)


def get_current_language() -> str:
    """Return the current user language from the active async context."""
    return lang_ctx.get()
