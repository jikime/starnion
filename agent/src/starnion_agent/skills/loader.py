"""SKILL.md loader with progressive disclosure support.

Parses SKILL.md files using the Claude Code SKILL.md format:
  ---
  name: skill-name
  description: What this skill does and when to use it
  ---
  Markdown body with detailed instructions...

Progressive disclosure:
  - Level 1 (catalog): name + description (~100 tokens per skill, always in prompt)
  - Level 2 (body): Full markdown instructions (loaded for enabled skills)

Fallback policy
---------------
Many SKILL.md files use ``skill_id:`` instead of ``name:`` and omit
``description:``.  When those keys are absent, values are pulled from the
central SKILLS registry (``registry.py``) so the LLM always gets a useful
catalog entry with the correct Korean display name.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

SKILLS_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class SkillDoc:
    """Parsed SKILL.md with frontmatter and body separated."""

    skill_id: str
    name: str
    description: str
    body: str
    keywords: tuple[str, ...] = ()  # multilingual trigger keywords from frontmatter


def parse_skill_md(skill_id: str) -> SkillDoc | None:
    """Parse a SKILL.md file into frontmatter metadata and body content.

    Falls back to the SKILLS registry for ``name`` and ``description`` when
    the SKILL.md frontmatter uses ``skill_id:`` instead of ``name:``, or
    omits ``description:`` entirely.

    Args:
        skill_id: The skill directory name (e.g. "finance", "budget").

    Returns:
        A SkillDoc with parsed name, description, and body, or None if
        the file doesn't exist or has no valid frontmatter.
    """
    # Lazy import to avoid circular dependency at module load time.
    from starnion_agent.skills.registry import SKILLS  # noqa: PLC0415
    skill_def = SKILLS.get(skill_id)

    doc_path = SKILLS_DIR / skill_id / "SKILL.md"
    if not doc_path.exists():
        return None

    text = doc_path.read_text(encoding="utf-8")
    frontmatter, body = _split_frontmatter(text)
    if frontmatter is None:
        logger.warning("SKILL.md for '%s' has no YAML frontmatter", skill_id)
        return None

    try:
        meta = yaml.safe_load(frontmatter)
    except yaml.YAMLError:
        logger.warning("SKILL.md for '%s' has invalid YAML frontmatter", skill_id)
        return None

    if not isinstance(meta, dict):
        logger.warning("SKILL.md for '%s' frontmatter is not a mapping", skill_id)
        return None

    # Use registry name/description as fallback when SKILL.md frontmatter
    # uses the legacy ``skill_id:`` key or omits ``description:``.
    name = meta.get("name") or (skill_def.name if skill_def else skill_id)
    description = meta.get("description") or (skill_def.description if skill_def else "")

    # Parse multilingual keywords (list of strings) if present.
    raw_kw = meta.get("keywords")
    if isinstance(raw_kw, list):
        keywords: tuple[str, ...] = tuple(str(k) for k in raw_kw if k)
    else:
        keywords = ()

    return SkillDoc(
        skill_id=skill_id,
        name=name,
        description=description,
        body=body.strip(),
        keywords=keywords,
    )


def load_all_skill_docs(skill_ids: list[str]) -> dict[str, SkillDoc]:
    """Load and parse SKILL.md for a list of skill IDs.

    Skills without a SKILL.md file (or with unparseable frontmatter) still
    receive a minimal SkillDoc built from the SKILLS registry so the catalog
    is always complete.

    Args:
        skill_ids: List of skill directory names to load.

    Returns:
        Dict mapping skill_id to its parsed SkillDoc.
    """
    from starnion_agent.skills.registry import SKILLS  # noqa: PLC0415

    docs: dict[str, SkillDoc] = {}
    for sid in skill_ids:
        doc = parse_skill_md(sid)
        if doc is not None:
            docs[sid] = doc
        else:
            # No SKILL.md (or unparseable) — build minimal doc from registry.
            skill_def = SKILLS.get(sid)
            if skill_def:
                docs[sid] = SkillDoc(
                    skill_id=sid,
                    name=skill_def.name,
                    description=skill_def.description,
                    body="",
                    keywords=(),
                )
    return docs


def build_skill_catalog(docs: dict[str, SkillDoc], language: str = "ko") -> str:
    """Build a concise skill catalog string for the system prompt.

    Level 1 (progressive disclosure): name + description + tool names per
    skill.  Including tool names lets the LLM directly map a user intent
    (e.g. "메모해줘") to the correct tool (``save_memo``) without having
    to scan the full instructions section.

    Format per entry:
        - **{name}** ({tool1}, {tool2}, ...): {description}

    Args:
        docs: Dict of parsed SkillDocs.
        language: User language code for localized header (ko/en/ja/zh).

    Returns:
        Formatted catalog text.
    """
    if not docs:
        return ""

    from starnion_agent.skills.registry import SKILLS  # noqa: PLC0415
    from starnion_agent.persona import get_prompt_strings  # noqa: PLC0415

    lines = [get_prompt_strings(language)["catalog_header"] + "\n"]
    for doc in docs.values():
        skill_def = SKILLS.get(doc.skill_id)
        kw_suffix = f" [{', '.join(doc.keywords)}]" if doc.keywords else ""
        if skill_def and skill_def.tools:
            tools_str = ", ".join(skill_def.tools)
            lines.append(f"- **{doc.name}** ({tools_str}): {doc.description}{kw_suffix}")
        else:
            lines.append(f"- **{doc.name}**: {doc.description}{kw_suffix}")
    return "\n".join(lines)


def build_skill_instructions(docs: dict[str, SkillDoc], language: str = "ko") -> str:
    """Build the full skill instruction block for the system prompt.

    Level 2 (progressive disclosure): Full SKILL.md body content
    for enabled skills, providing detailed usage guidelines to the LLM.

    Args:
        docs: Dict of parsed SkillDocs.
        language: User language code for localized header (ko/en/ja/zh).

    Returns:
        Combined instruction text from all skill bodies.
    """
    if not docs:
        return ""

    from starnion_agent.persona import get_prompt_strings  # noqa: PLC0415

    sections = []
    for doc in docs.values():
        if doc.body:
            sections.append(doc.body)

    if not sections:
        return ""

    return get_prompt_strings(language)["instructions_header"] + "\n\n" + "\n\n---\n\n".join(sections)


def _split_frontmatter(text: str) -> tuple[str | None, str]:
    """Split YAML frontmatter from markdown body.

    Expects the file to start with ``---`` on the first line,
    followed by YAML, then another ``---`` line, then body.

    Returns:
        (frontmatter_str, body_str).  frontmatter_str is None if no
        valid frontmatter delimiters are found.
    """
    stripped = text.lstrip()
    if not stripped.startswith("---"):
        return None, text

    # Find the closing ---
    first_delim = stripped.index("---")
    rest = stripped[first_delim + 3 :]
    second_delim = rest.find("\n---")
    if second_delim == -1:
        return None, text

    frontmatter = rest[:second_delim].strip()
    body = rest[second_delim + 4 :]  # skip \n---
    return frontmatter, body
