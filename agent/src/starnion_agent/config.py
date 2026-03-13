"""Configuration management — reads from ~/.starnion/starnion.yaml.

Priority order (highest to lowest):
  1. Environment variables  — for Docker / container deployments
  2. ~/.starnion/starnion.yaml — written by `starnion setup`
  3. Hardcoded defaults        — fallback only
"""

from __future__ import annotations

import os
import platform
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


def _config_path() -> Path:
    return Path.home() / ".starnion" / "starnion.yaml"


def _detect_headless_mode() -> bool:
    """실행 환경을 분석해 headless 모드 여부를 자동 결정한다.

    판단 우선순위:
    1. Docker 컨테이너 (/.dockerenv 존재) → True
    2. CI 환경 (CI / GITHUB_ACTIONS / JENKINS_URL 등) → True
    3. Linux + 디스플레이 서버 없음 (DISPLAY / WAYLAND_DISPLAY 미설정) → True
    4. macOS / Windows (데스크탑) → False
    5. Linux + 디스플레이 서버 있음 → False
    6. 알 수 없는 환경 → True (서버 안전 기본값)
    """
    # 1. Docker
    if Path("/.dockerenv").exists():
        return True

    # 2. CI 환경
    ci_vars = ("CI", "GITHUB_ACTIONS", "JENKINS_URL", "GITLAB_CI", "CIRCLECI", "TRAVIS")
    if any(os.environ.get(v) for v in ci_vars):
        return True

    system = platform.system()

    # 3-5. Linux: 디스플레이 서버 유무로 판단
    if system == "Linux":
        has_display = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
        return not has_display

    # 4. macOS / Windows: 데스크탑 환경 → headed
    if system in ("Darwin", "Windows"):
        return False

    # 6. 알 수 없는 환경 → 안전하게 headless
    return True


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
class BrowserConfig:
    """Browser automation configuration.

    headless 모드 결정 우선순위:
      1. BROWSER_HEADLESS 환경변수 (명시적 override)
      2. starnion.yaml browser.headless (명시적 설정)
      3. 환경 자동 감지:
         - Docker (/.dockerenv) → True
         - CI (CI / GITHUB_ACTIONS 등) → True
         - Linux + DISPLAY/WAYLAND_DISPLAY 없음 → True
         - macOS / Windows → False  (데스크탑 개발 환경)
         - Linux + 디스플레이 있음 → False

    starnion.yaml 예시 (자동 감지 재정의):
      browser:
        headless: false
    """
    headless: bool = True


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

    # Browser automation settings
    browser: BrowserConfig = field(default_factory=BrowserConfig)

    @property
    def gemini_model(self) -> str:
        return self.gemini.model

    @classmethod
    def from_yaml(cls) -> "Settings":
        raw = _load_yaml()

        # ── Database ─────────────────────────────────────────────────────────
        # DATABASE_URL env var (set by docker-compose) takes priority over YAML.
        database_url = os.environ.get("DATABASE_URL", "")
        if not database_url:
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

        # ── Gateway ──────────────────────────────────────────────────────────
        gw = raw.get("gateway", {})
        gateway_url = os.environ.get("GATEWAY_URL") or gw.get("url", "http://localhost:8080")
        grpc_port = int(os.environ.get("GRPC_PORT") or gw.get("grpc_port", 50051))

        # ── Embedding ────────────────────────────────────────────────────────
        # Env vars (EMBEDDING_*) override YAML values so Docker mode can be
        # configured without mounting starnion.yaml into the container.
        emb = raw.get("embedding", {})
        embedding = EmbeddingConfig(
            provider=os.environ.get("EMBEDDING_PROVIDER") or emb.get("provider", "openai"),
            api_key=os.environ.get("EMBEDDING_API_KEY") or emb.get("api_key", ""),
            model=os.environ.get("EMBEDDING_MODEL") or emb.get("model", "text-embedding-3-small"),
            dimensions=int(os.environ.get("EMBEDDING_DIMENSIONS") or emb.get("dimensions", 768)),
        )

        # ── Google OAuth ─────────────────────────────────────────────────────
        g = raw.get("google", {})
        google = GoogleConfig(
            client_id=g.get("client_id", ""),
            client_secret=g.get("client_secret", ""),
            redirect_uri=g.get("redirect_uri", ""),
        )

        # ── Gemini ───────────────────────────────────────────────────────────
        gem = raw.get("gemini", {})
        gemini = GeminiConfig(
            model=os.environ.get("GEMINI_MODEL") or gem.get("model") or "gemini-2.5-pro",
        )

        # ── Browser ──────────────────────────────────────────────────────────
        # Priority:
        #   1. BROWSER_HEADLESS 환경변수 (명시적 override)
        #   2. starnion.yaml browser.headless (명시적 설정)
        #   3. 환경 자동 감지 (_detect_headless_mode)
        #      - Docker / CI → True, macOS/Windows → False, Linux+DISPLAY → False
        brw = raw.get("browser", {})
        env_headless = os.environ.get("BROWSER_HEADLESS")
        if env_headless is not None:
            browser_headless = env_headless.lower() != "false"
        elif "headless" in brw:
            browser_headless = bool(brw["headless"])
        else:
            browser_headless = _detect_headless_mode()
        browser = BrowserConfig(headless=browser_headless)

        return cls(
            database_url=database_url,
            gateway_url=gateway_url,
            grpc_port=grpc_port,
            embedding=embedding,
            google=google,
            gemini=gemini,
            browser=browser,
        )


settings = Settings.from_yaml()
