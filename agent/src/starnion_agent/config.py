"""Configuration management — reads from ~/.starnion/starnion.yaml."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


def _config_path() -> Path:
    return Path.home() / ".starnion" / "starnion.yaml"


def _load_yaml() -> dict[str, Any]:
    path = _config_path()
    if path.exists():
        with path.open("r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


@dataclass
class EmbeddingConfig:
    """Server-wide embedding configuration.

    All users share the same embedding model so that vectors are comparable.
    WARNING: Changing provider/model after initial setup requires re-indexing all DB vectors.
    """
    provider: str = "openai"              # "openai" | "gemini"
    api_key: str = ""
    model: str = "text-embedding-3-small"
    dimensions: int = 768                 # must match pgvector column size


@dataclass
class GoogleConfig:
    """Google OAuth2 credentials for Google Workspace integration."""
    client_id: str = ""
    client_secret: str = ""
    redirect_uri: str = ""


@dataclass
class GeminiConfig:
    """Server-level Gemini configuration.

    Only holds the default model name — API keys are stored per-user
    in integration_keys (provider='gemini') or reused from the providers table.
    Set the model via: starnion config gemini
    """
    model: str = "gemini-2.5-pro"


@dataclass
class Settings:
    """Application settings loaded from ~/.starnion/starnion.yaml.

    Per-user API keys (LLM providers, Tavily, etc.) are stored in the database.
    Server-level config (embedding engine, Google OAuth, Gemini) is stored in starnion.yaml.
    """

    # Database connection URL
    database_url: str = "postgresql://postgres:@localhost:5432/starnion"

    # Gateway base URL (used to generate Telegram OAuth start URL)
    gateway_url: str = "http://localhost:8080"

    # gRPC server port
    grpc_port: int = 50051

    # Server-wide embedding engine (shared by all users)
    embedding: EmbeddingConfig = field(default_factory=EmbeddingConfig)

    # Google OAuth2 credentials
    google: GoogleConfig = field(default_factory=GoogleConfig)

    # Gemini API for image generation / vision / audio
    gemini: GeminiConfig = field(default_factory=GeminiConfig)

    @property
    def gemini_model(self) -> str:
        return self.gemini.model

    @classmethod
    def from_yaml(cls) -> "Settings":
        raw = _load_yaml()

        db = raw.get("database", {})
        host = db.get("host", "localhost")
        port = db.get("port", 5432)
        name = db.get("name", "starnion")
        user = db.get("user", "postgres")
        password = db.get("password", "")
        ssl_mode = db.get("ssl_mode", "disable")
        database_url = (
            f"postgresql://{user}:{password}@{host}:{port}/{name}?sslmode={ssl_mode}"
        )

        gw = raw.get("gateway", {})
        gateway_url = gw.get("url", "http://localhost:8080")
        grpc_port = int(gw.get("grpc_port", 50051))

        emb = raw.get("embedding", {})
        embedding = EmbeddingConfig(
            provider=emb.get("provider", "openai"),
            api_key=emb.get("api_key", ""),
            model=emb.get("model", "text-embedding-3-small"),
            dimensions=int(emb.get("dimensions", 768)),
        )

        g = raw.get("google", {})
        google = GoogleConfig(
            client_id=g.get("client_id", ""),
            client_secret=g.get("client_secret", ""),
            redirect_uri=g.get("redirect_uri", ""),
        )

        gem = raw.get("gemini", {})
        gemini = GeminiConfig(
            model=gem.get("model", "gemini-2.5-pro"),
        )

        return cls(
            database_url=database_url,
            gateway_url=gateway_url,
            grpc_port=grpc_port,
            embedding=embedding,
            google=google,
            gemini=gemini,
        )


settings = Settings.from_yaml()
