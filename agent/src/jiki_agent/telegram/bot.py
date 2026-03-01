"""Telegram bot handler for message processing."""

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from jiki_agent.config import settings
from jiki_agent.graph.agent import create_agent


async def start_command(update: Update, _context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start command."""
    message = update.message
    if message is None:
        return
    await message.reply_text(
        "Hello! I'm Jiki, your personal assistant.\n"
        "I can help you track finances and more.\n"
        "Just send me a message!"
    )


async def handle_message(update: Update, _context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle incoming text messages by routing through the agent."""
    message = update.message
    if message is None or message.text is None or update.effective_chat is None:
        return

    user_message = message.text
    chat_id = str(update.effective_chat.id)

    agent = create_agent()

    result = await agent.ainvoke(
        {"messages": [("human", user_message)]},
        config={"configurable": {"thread_id": chat_id}},
    )

    response = result["messages"][-1].content
    await message.reply_text(response)


def create_bot() -> Application:
    """Create and configure the Telegram bot application."""
    app = Application.builder().token(settings.telegram_bot_token).build()

    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    return app
