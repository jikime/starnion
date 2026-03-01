"""Configuration management via environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Telegram
    telegram_bot_token: str = ""

    # Google Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # Database
    database_url: str = "postgresql://user:password@localhost:5432/jiki"

    # gRPC
    grpc_address: str = "localhost:50051"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
