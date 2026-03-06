"""Unit tests for starpion_agent.skills.registry module.

Tests cover:
- SKILLS dictionary structure and required fields
- _TOOL_TO_SKILL reverse mapping correctness
- get_skill_for_tool helper function
- Skill metadata consistency
"""

from starpion_agent.skills.registry import SKILLS, SkillDef, get_skill_for_tool


class TestSkillsDict:
    """Tests for the SKILLS registry dictionary."""

    def test_all_entries_are_skill_defs(self):
        """Every value in SKILLS is a SkillDef instance."""
        for skill_id, skill in SKILLS.items():
            assert isinstance(skill, SkillDef), f"{skill_id} is not a SkillDef"

    def test_ids_match_keys(self):
        """Each skill's id field matches its dictionary key."""
        for key, skill in SKILLS.items():
            assert skill.id == key, f"Key '{key}' != skill.id '{skill.id}'"

    def test_required_fields_not_empty(self):
        """Every skill has a non-empty name, description, and category."""
        for skill_id, skill in SKILLS.items():
            assert skill.name, f"{skill_id} has empty name"
            assert skill.description, f"{skill_id} has empty description"
            assert skill.category, f"{skill_id} has empty category"

    def test_expected_skills_present(self):
        """Core skills that should always be present."""
        expected = [
            "finance", "budget", "diary", "goals", "schedule",
            "memory", "image", "documents", "audio", "video", "google",
        ]
        for sid in expected:
            assert sid in SKILLS, f"Expected skill '{sid}' not in SKILLS"

    def test_sort_orders_unique(self):
        """Sort orders should be unique across all skills."""
        orders = [s.sort_order for s in SKILLS.values()]
        assert len(orders) == len(set(orders)), "Duplicate sort_order values found"

    def test_permission_levels_valid(self):
        """Permission levels are in the expected range 0-3."""
        for skill_id, skill in SKILLS.items():
            assert 0 <= skill.permission_level <= 3, (
                f"{skill_id} has invalid permission_level: {skill.permission_level}"
            )


class TestToolToSkillMapping:
    """Tests for the tool-to-skill reverse mapping."""

    def test_all_tools_mapped(self):
        """Every tool listed in any skill is present in the reverse mapping."""
        for skill in SKILLS.values():
            for tool_name in skill.tools:
                result = get_skill_for_tool(tool_name)
                assert result == skill.id, (
                    f"Tool '{tool_name}' maps to '{result}', "
                    f"expected '{skill.id}'"
                )

    def test_unknown_tool_returns_none(self):
        """A tool name not in any skill returns None."""
        assert get_skill_for_tool("nonexistent_tool") is None

    def test_finance_tools_mapped(self):
        """Finance tools map to the finance skill."""
        assert get_skill_for_tool("save_finance") == "finance"
        assert get_skill_for_tool("get_monthly_total") == "finance"

    def test_google_tools_mapped(self):
        """All Google tools map to the google skill."""
        google_tools = SKILLS["google"].tools
        assert len(google_tools) == 12, f"Expected 12 Google tools, got {len(google_tools)}"
        for tool_name in google_tools:
            assert get_skill_for_tool(tool_name) == "google"

    def test_media_tools_mapped(self):
        """Image, audio, video tools map to their respective skills."""
        assert get_skill_for_tool("analyze_image") == "image"
        assert get_skill_for_tool("generate_image") == "image"
        assert get_skill_for_tool("transcribe_audio") == "audio"
        assert get_skill_for_tool("generate_audio") == "audio"
        assert get_skill_for_tool("analyze_video") == "video"
        assert get_skill_for_tool("generate_video") == "video"


class TestSkillDef:
    """Tests for the SkillDef dataclass."""

    def test_defaults(self):
        """SkillDef defaults are correctly set."""
        skill = SkillDef(
            id="test",
            name="Test",
            description="Test skill",
            category="test",
        )
        assert skill.emoji == ""
        assert skill.tools == []
        assert skill.reports == []
        assert skill.cron_rules == []
        assert skill.enabled_by_default is True
        assert skill.permission_level == 1
        assert skill.sort_order == 0

    def test_opt_in_skills_disabled_by_default(self):
        """Opt-in skills (permission_level=2) should be disabled by default."""
        for skill_id, skill in SKILLS.items():
            if skill.permission_level == 2:
                assert not skill.enabled_by_default, (
                    f"Opt-in skill '{skill_id}' should have enabled_by_default=False"
                )
