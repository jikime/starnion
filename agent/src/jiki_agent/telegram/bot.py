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
from jiki_agent.db.pool import close_pool, get_pool, init_pool
from jiki_agent.db.repositories import profile as profile_repo
from jiki_agent.graph.agent import close_checkpointer, create_agent
from jiki_agent.tools.finance import set_current_user

# Module-level agent reference, initialized on startup.
_agent = None


async def _post_init(_app: Application) -> None:
    """Initialize the connection pool, upsert bot profile, and build the agent."""
    global _agent
    await init_pool(settings.database_url)
    _agent = await create_agent(settings.database_url)


async def _post_shutdown(_app: Application) -> None:
    """Shut down the checkpointer and connection pool cleanly."""
    await close_checkpointer()
    await close_pool()


async def start_command(update: Update, _context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start command and upsert the user profile."""
    message = update.message
    if message is None:
        return

    user = update.effective_user
    if user is not None:
        pool = get_pool()
        user_name = user.full_name or user.username or ""
        await profile_repo.upsert(pool, telegram_id=str(user.id), user_name=user_name)

    await message.reply_text(
        "안녕하세요! 저는 지기(jiki)예요.\n"
        "가계부 기록, 지출 조회 등을 도와드릴게요.\n"
        "편하게 말씀해 주세요!"
    )


async def handle_message(update: Update, _context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle incoming text messages by routing through the agent."""
    message = update.message
    if message is None or message.text is None or update.effective_chat is None:
        return

    user_message = message.text
    chat_id = str(update.effective_chat.id)
    user_id = str(update.effective_user.id) if update.effective_user else chat_id

    if _agent is None:
        await message.reply_text("서비스 초기화 중이에요. 잠시 후 다시 시도해 주세요.")
        return

    # Set current user so finance tools can access the user_id.
    set_current_user(user_id)

    # Ensure user profile exists.
    pool = get_pool()
    user_name = ""
    if update.effective_user:
        user_name = update.effective_user.full_name or update.effective_user.username or ""
    await profile_repo.upsert(pool, telegram_id=user_id, user_name=user_name)

    result = await _agent.ainvoke(
        {"messages": [("human", user_message)]},
        config={"configurable": {"thread_id": chat_id}},
    )

    response = result["messages"][-1].content
    await message.reply_text(response)


def create_bot() -> Application:
    """Create and configure the Telegram bot application."""
    app = Application.builder().token(settings.telegram_bot_token).build()

    app.post_init = _post_init
    app.post_shutdown = _post_shutdown

    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    return app
