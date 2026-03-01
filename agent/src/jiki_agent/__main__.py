"""Entry point for running the jiki agent as a module."""

import logging

from jiki_agent.telegram.bot import create_bot

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)


def main() -> None:
    """Start the Telegram bot with polling."""
    app = create_bot()
    app.run_polling()


if __name__ == "__main__":
    main()
