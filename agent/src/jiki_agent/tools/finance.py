"""Finance tracking tools for saving and querying expenses."""

from datetime import datetime

from langchain_core.tools import tool
from pydantic import BaseModel, Field


class SaveFinanceInput(BaseModel):
    """Input schema for save_finance tool."""

    category: str = Field(description="Expense category (e.g. food, transport, entertainment)")
    amount: float = Field(description="Amount spent in KRW")
    description: str = Field(default="", description="Optional description of the expense")


class GetMonthlyTotalInput(BaseModel):
    """Input schema for get_monthly_total tool."""

    category: str = Field(default="", description="Filter by category. Empty string for all categories.")


@tool(args_schema=SaveFinanceInput)
async def save_finance(category: str, amount: float, description: str = "") -> str:
    """Save a finance record with category, amount, and optional description."""
    now = datetime.now()
    # TODO: Persist to database via psycopg
    return (
        f"Saved: {category} - {amount:,.0f} KRW"
        f"{f' ({description})' if description else ''}"
        f" on {now.strftime('%Y-%m-%d %H:%M')}"
    )


@tool(args_schema=GetMonthlyTotalInput)
async def get_monthly_total(category: str = "") -> str:
    """Get the total spending for the current month, optionally filtered by category."""
    now = datetime.now()
    month_label = now.strftime("%Y-%m")
    # TODO: Query database for actual totals
    if category:
        return f"[{month_label}] Total for '{category}': 0 KRW (no data yet)"
    return f"[{month_label}] Total spending: 0 KRW (no data yet)"
