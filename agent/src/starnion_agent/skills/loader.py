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


def parse_skill_md(skill_id: str) -> SkillDoc | None:
    """Parse a SKILL.md file into frontmatter metadata and body content.

    Args:
        skill_id: The skill directory name (e.g. "finance", "budget").

    Returns:
        A SkillDoc with parsed name, description, and body, or None if
        the file doesn't exist or has no valid frontmatter.
    """
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

    name = meta.get("name", skill_id)
    description = meta.get("description", "")

    return SkillDoc(
        skill_id=skill_id,
        name=name,
        description=description,
        body=body.strip(),
    )


def load_all_skill_docs(skill_ids: list[str]) -> dict[str, SkillDoc]:
    """Load and parse SKILL.md for a list of skill IDs.

    Args:
        skill_ids: List of skill directory names to load.

    Returns:
        Dict mapping skill_id to its parsed SkillDoc.
    """
    docs: dict[str, SkillDoc] = {}
    for sid in skill_ids:
        doc = parse_skill_md(sid)
        if doc is not None:
            docs[sid] = doc
    return docs


def build_skill_catalog(docs: dict[str, SkillDoc]) -> str:
    """Build a concise skill catalog string for the system prompt.

    Level 1 (progressive disclosure): Only name + description per skill,
    giving the LLM awareness of available skills without full instructions.

    Args:
        docs: Dict of parsed SkillDocs.

    Returns:
        Formatted catalog text.
    """
    if not docs:
        return ""

    lines = ["## 활성 스킬 카탈로그\n"]
    for doc in docs.values():
        lines.append(f"- **{doc.name}**: {doc.description}")
    return "\n".join(lines)


def build_skill_instructions(docs: dict[str, SkillDoc]) -> str:
    """Build the full skill instruction block for the system prompt.

    Level 2 (progressive disclosure): Full SKILL.md body content
    for enabled skills, providing detailed usage guidelines to the LLM.

    Args:
        docs: Dict of parsed SkillDocs.

    Returns:
        Combined instruction text from all skill bodies.
    """
    if not docs:
        return ""

    sections = []
    for doc in docs.values():
        if doc.body:
            sections.append(doc.body)

    if not sections:
        return ""

    return "## 스킬 지침\n\n" + "\n\n---\n\n".join(sections)


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
