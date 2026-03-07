"""Unit tests for starnion_agent.skills.loader module.

Tests cover:
- _split_frontmatter: YAML frontmatter parsing
- parse_skill_md: SKILL.md file parsing
- build_skill_catalog: Level 1 catalog generation
- build_skill_instructions: Level 2 instructions generation
- load_all_skill_docs: Batch loading
"""

from starnion_agent.skills.loader import (
    SkillDoc,
    _split_frontmatter,
    build_skill_catalog,
    build_skill_instructions,
    load_all_skill_docs,
    parse_skill_md,
)


class TestSplitFrontmatter:
    """Tests for the _split_frontmatter helper."""

    def test_valid_frontmatter(self):
        """Standard YAML frontmatter is correctly split."""
        text = "---\nname: test\ndescription: A test\n---\n\n# Body\nContent here."
        fm, body = _split_frontmatter(text)

        assert fm is not None
        assert "name: test" in fm
        assert "# Body" in body

    def test_no_frontmatter(self):
        """Text without frontmatter returns None + full text."""
        text = "# Just a heading\n\nNo frontmatter here."
        fm, body = _split_frontmatter(text)

        assert fm is None
        assert body == text

    def test_single_delimiter(self):
        """Only one --- delimiter means no valid frontmatter."""
        text = "---\nname: test\nNo closing delimiter."
        fm, body = _split_frontmatter(text)

        assert fm is None

    def test_empty_body(self):
        """Frontmatter with empty body."""
        text = "---\nname: test\n---\n"
        fm, body = _split_frontmatter(text)

        assert fm is not None
        assert "name: test" in fm


class TestParseSkillMd:
    """Tests for parse_skill_md using real SKILL.md files."""

    def test_parse_finance_skill(self):
        """Finance skill has a valid SKILL.md with name and description."""
        doc = parse_skill_md("finance")
        assert doc is not None
        assert doc.skill_id == "finance"
        assert doc.name == "finance"
        assert doc.description
        assert doc.body

    def test_parse_nonexistent_skill(self):
        """A nonexistent skill returns None."""
        doc = parse_skill_md("this_skill_does_not_exist")
        assert doc is None

    def test_parse_all_skill_docs_have_names(self):
        """All existing SKILL.md files parse to SkillDocs with names."""
        skill_ids = [
            "finance", "budget", "diary", "goals", "schedule",
            "memory", "image", "documents", "audio", "video", "google",
        ]
        for sid in skill_ids:
            doc = parse_skill_md(sid)
            if doc is not None:
                assert doc.name, f"Skill '{sid}' has empty name"


class TestBuildSkillCatalog:
    """Tests for build_skill_catalog."""

    def test_empty_docs_returns_empty(self):
        """Empty dict returns empty string."""
        assert build_skill_catalog({}) == ""

    def test_catalog_contains_skill_names(self):
        """Catalog includes each skill's name and description."""
        docs = {
            "finance": SkillDoc("finance", "Finance", "Money tracking", "body"),
            "diary": SkillDoc("diary", "Diary", "Daily logs", "body"),
        }
        catalog = build_skill_catalog(docs)

        assert "Finance" in catalog
        assert "Money tracking" in catalog
        assert "Diary" in catalog
        assert "Daily logs" in catalog

    def test_catalog_has_header(self):
        """Catalog starts with the expected header."""
        docs = {"x": SkillDoc("x", "X", "desc", "body")}
        catalog = build_skill_catalog(docs)

        assert "활성 스킬 카탈로그" in catalog


class TestBuildSkillInstructions:
    """Tests for build_skill_instructions."""

    def test_empty_docs_returns_empty(self):
        """Empty dict returns empty string."""
        assert build_skill_instructions({}) == ""

    def test_instructions_contain_body(self):
        """Instructions include the body content of each skill."""
        docs = {
            "finance": SkillDoc("finance", "Finance", "desc", "Use save_finance tool."),
        }
        instructions = build_skill_instructions(docs)

        assert "Use save_finance tool." in instructions

    def test_instructions_skip_empty_body(self):
        """Skills with empty body are skipped."""
        docs = {
            "empty": SkillDoc("empty", "Empty", "desc", ""),
        }
        instructions = build_skill_instructions(docs)

        assert instructions == ""

    def test_instructions_has_header(self):
        """Instructions start with the expected header."""
        docs = {"x": SkillDoc("x", "X", "desc", "content")}
        instructions = build_skill_instructions(docs)

        assert "스킬 지침" in instructions


class TestLoadAllSkillDocs:
    """Tests for load_all_skill_docs."""

    def test_loads_existing_skills(self):
        """Loading known skill IDs returns their SkillDocs."""
        docs = load_all_skill_docs(["finance", "budget"])
        assert "finance" in docs
        assert "budget" in docs

    def test_skips_nonexistent_skills(self):
        """Nonexistent skill IDs are silently skipped."""
        docs = load_all_skill_docs(["nonexistent_123"])
        assert len(docs) == 0

    def test_empty_list_returns_empty(self):
        """Empty input returns empty dict."""
        docs = load_all_skill_docs([])
        assert docs == {}
