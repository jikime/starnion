"""Runtime skill guard decorator.

Secondary safety net: if the LLM somehow calls a tool for a disabled
skill (primary defense is prompt-level exclusion), this decorator
returns a friendly message instead of executing.
"""

from functools import wraps

from starnion_agent.context import get_current_user, get_current_language
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import skill as skill_repo
from starnion_agent.persona import get_prompt_strings
from starnion_agent.skills.registry import SKILLS


def skill_guard(skill_id: str):
    """Decorator that checks if skill is enabled for current user."""

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            user_id = get_current_user()
            pool = get_pool()
            if not await skill_repo.is_enabled(pool, user_id, skill_id):
                skill = SKILLS.get(skill_id)
                name = skill.name if skill else skill_id
                language = get_current_language()
                return get_prompt_strings(language)["skill_disabled"].format(name=name)
            return await func(*args, **kwargs)

        return wrapper

    return decorator
