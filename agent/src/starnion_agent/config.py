"""Configuration management — reads from ~/.starnion/starnion.yaml."""

from __future__ import annotations

from dataclasses import dataclass
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
class Settings:
    """Application settings loaded from ~/.starnion/starnion.yaml.

    API keys (Gemini, Google, Tavily, etc.) are stored per-user in the
    database — they are intentionally absent from this global config.
    """

    # Database connection URL
    database_url: str = "postgresql://postgres:@localhost:5432/starnion"

    # Gateway base URL (used to generate Telegram OAuth start URL)
    gateway_url: str = "http://localhost:8080"

    # gRPC server port
    grpc_port: int = 50051

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

        return cls(
            database_url=database_url,
            gateway_url=gateway_url,
            grpc_port=grpc_port,
        )


settings = Settings.from_yaml()
