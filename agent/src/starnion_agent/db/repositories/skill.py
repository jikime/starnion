"""Skill registry repository for managing skill definitions and user settings."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from psycopg.rows import dict_row

if TYPE_CHECKING:
    from psycopg_pool import AsyncConnectionPool


async def is_enabled(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    skill_id: str,
) -> bool:
    """Check if a skill is enabled for a user.

    Falls back to the skill's enabled_by_default if no user_skills row exists.
    Returns True for unknown skill_ids (safe default).
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT
                    COALESCE(us.enabled, s.enabled_by_default) AS enabled
                FROM skills s
                LEFT JOIN user_skills us
                    ON us.skill_id = s.id AND us.user_id = %s
                WHERE s.id = %s
                """,
                (user_id, skill_id),
            )
            row = await cur.fetchone()
            if row is None:
                return True  # unknown skill → allow
            return row["enabled"]


async def toggle(
    pool: AsyncConnectionPool[Any],
    user_id: str,
    skill_id: str,
) -> bool:
    """Toggle a skill for a user. Returns the new enabled state.

    Raises ValueError if the skill has permission_level 0 (system).
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            # Check permission level.
            await cur.execute(
                "SELECT permission_level, enabled_by_default FROM skills WHERE id = %s",
                (skill_id,),
            )
            skill_row = await cur.fetchone()
            if skill_row is None:
                msg = f"Unknown skill: {skill_id}"
                raise ValueError(msg)
            if skill_row["permission_level"] == 0:
                msg = f"System skill cannot be toggled: {skill_id}"
                raise ValueError(msg)

            # Get current state.
            await cur.execute(
                "SELECT enabled FROM user_skills WHERE user_id = %s AND skill_id = %s",
                (user_id, skill_id),
            )
            us_row = await cur.fetchone()
            if us_row is None:
                current = skill_row["enabled_by_default"]
            else:
                current = us_row["enabled"]

            new_state = not current

            await cur.execute(
                """
                INSERT INTO user_skills (user_id, skill_id, enabled, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (user_id, skill_id)
                DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
                """,
                (user_id, skill_id, new_state),
            )
            await conn.commit()
            return new_state


async def get_enabled_skills(
    pool: AsyncConnectionPool[Any],
    user_id: str,
) -> list[str]:
    """Return list of enabled skill IDs for a user."""
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT s.id
                FROM skills s
                LEFT JOIN user_skills us
                    ON us.skill_id = s.id AND us.user_id = %s
                WHERE COALESCE(us.enabled, s.enabled_by_default) = TRUE
                ORDER BY s.sort_order
                """,
                (user_id,),
            )
            rows = await cur.fetchall()
            return [row["id"] for row in rows]


async def get_all_with_user_status(
    pool: AsyncConnectionPool[Any],
    user_id: str,
) -> list[dict[str, Any]]:
    """Return all skills with their enabled status for a user.

    Used by the /skills command to build the toggle keyboard.
    """
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT
                    s.id, s.name, s.description, s.category,
                    s.emoji, s.permission_level, s.sort_order,
                    COALESCE(us.enabled, s.enabled_by_default) AS enabled
                FROM skills s
                LEFT JOIN user_skills us
                    ON us.skill_id = s.id AND us.user_id = %s
                ORDER BY s.sort_order
                """,
                (user_id,),
            )
            return await cur.fetchall()


async def register_all(pool: AsyncConnectionPool[Any], skills: dict) -> None:
    """Upsert all skill definitions into the database.

    Called at agent startup.
    """
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            for skill in skills.values():
                await cur.execute(
                    """
                    INSERT INTO skills (
                        id, name, description, category, emoji,
                        tools, reports, cron_rules,
                        enabled_by_default, permission_level, sort_order,
                        updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        description = EXCLUDED.description,
                        category = EXCLUDED.category,
                        emoji = EXCLUDED.emoji,
                        tools = EXCLUDED.tools,
                        reports = EXCLUDED.reports,
                        cron_rules = EXCLUDED.cron_rules,
                        enabled_by_default = EXCLUDED.enabled_by_default,
                        permission_level = EXCLUDED.permission_level,
                        sort_order = EXCLUDED.sort_order,
                        updated_at = NOW()
                    """,
                    (
                        skill.id,
                        skill.name,
                        skill.description,
                        skill.category,
                        skill.emoji,
                        skill.tools,
                        skill.reports,
                        skill.cron_rules,
                        skill.enabled_by_default,
                        skill.permission_level,
                        skill.sort_order,
                    ),
                )
            await conn.commit()
