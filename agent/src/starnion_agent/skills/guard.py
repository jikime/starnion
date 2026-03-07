"""Runtime skill guard decorator.

Secondary safety net: if the LLM somehow calls a tool for a disabled
skill (primary defense is prompt-level exclusion), this decorator
returns a friendly message instead of executing.
"""

from functools import wraps

from starnion_agent.context import get_current_user
from starnion_agent.db.pool import get_pool
from starnion_agent.db.repositories import skill as skill_repo
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
                return (
                    f"'{name}' 기능이 비활성화되어 있어요. "
                    "/skills 명령으로 활성화할 수 있어요."
                )
            return await func(*args, **kwargs)

        return wrapper

    return decorator
