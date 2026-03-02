"""Configuration management via environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings

# Resolve project root .env (jiki/.env), falling back to agent/.env.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_ROOT_ENV = _PROJECT_ROOT / ".env"
_ENV_FILE = str(_ROOT_ENV) if _ROOT_ENV.exists() else ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Google Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # Database
    database_url: str = "postgresql://user:password@localhost:5432/jiki"

    # Google Cloud (TTS, etc.)
    google_cloud_credentials: str = ""

    # Google OAuth2 (Workspace integration)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    # Tavily (Web Search)
    tavily_api_key: str = ""

    # gRPC server
    grpc_port: int = 50051

    model_config = {"env_file": _ENV_FILE, "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
