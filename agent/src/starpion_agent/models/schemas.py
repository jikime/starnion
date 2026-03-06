"""Pydantic models for domain entities."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class FinanceCategory(StrEnum):
    """Predefined finance categories."""

    FOOD = "food"
    TRANSPORT = "transport"
    ENTERTAINMENT = "entertainment"
    SHOPPING = "shopping"
    HEALTH = "health"
    EDUCATION = "education"
    UTILITIES = "utilities"
    OTHER = "other"


class FinanceRecord(BaseModel):
    """A single finance transaction record."""

    id: int = Field(default=0, description="Record ID")
    user_id: str = Field(description="Telegram user ID")
    category: str = Field(description="Expense category")
    amount: float = Field(description="Amount in KRW")
    description: str = Field(default="", description="Optional description")
    created_at: datetime = Field(default_factory=datetime.now, description="Record timestamp")


class UserProfile(BaseModel):
    """User profile information."""

    user_id: str = Field(description="Telegram user ID")
    display_name: str = Field(default="", description="User display name")
    timezone: str = Field(default="Asia/Seoul", description="User timezone")
    created_at: datetime = Field(default_factory=datetime.now, description="Profile creation time")


class DailyLog(BaseModel):
    """Daily activity log entry."""

    id: int = Field(default=0, description="Log ID")
    user_id: str = Field(description="Telegram user ID")
    content: str = Field(description="Log content")
    tags: list[str] = Field(default_factory=list, description="Tags for categorization")
    created_at: datetime = Field(default_factory=datetime.now, description="Log timestamp")
