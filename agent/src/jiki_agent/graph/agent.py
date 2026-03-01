"""ReAct agent setup with LangGraph and Gemini."""

from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import create_react_agent

from jiki_agent.config import settings
from jiki_agent.tools.finance import get_monthly_total, save_finance


def create_agent():
    """Create and return the ReAct agent graph."""
    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
    )

    tools = [
        save_finance,
        get_monthly_total,
    ]

    agent = create_react_agent(
        model=llm,
        tools=tools,
    )

    return agent
