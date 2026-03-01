"""Shared pytest fixtures for jiki-agent tests."""

import pytest


@pytest.fixture
def sample_finance_data() -> dict:
    """Sample finance record data for testing."""
    return {
        "category": "food",
        "amount": 15000.0,
        "description": "Lunch at cafe",
    }


@pytest.fixture
def sample_user_profile() -> dict:
    """Sample user profile data for testing."""
    return {
        "user_id": "123456789",
        "display_name": "Test User",
        "timezone": "Asia/Seoul",
    }
