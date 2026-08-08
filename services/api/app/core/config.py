"""Application configuration loaded from environment variables.

All external services are configured here so they can be swapped without
touching application code. Defaults are chosen so the API runs fully locally
with no paid credentials (SQLite + local filesystem storage + mock AI).
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- App ---
    app_name: str = "DataMind AI API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:3000"

    # --- Auth (shared secret with the Next.js frontend) ---
    auth_secret: str = "change-me-in-production-use-a-long-random-string"
    jwt_algorithm: str = "HS256"

    # --- Database ---
    database_url: str = "sqlite:///./.data/datamind.db"

    # --- Storage ---
    storage_backend: str = "local"  # local | s3
    local_storage_dir: str = "./.data/storage"
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "datamind"
    s3_secret_key: str = "datamind-secret"
    s3_bucket: str = "datamind"
    s3_region: str = "us-east-1"

    # --- AI ---
    # Provider is selected by name; all integrations are swappable via env only.
    ai_provider: str = "mock"  # mock|openai|azure|gemini|anthropic|ollama|openrouter
    ai_temperature: float = 0.2

    # --- Notebook ---
    # Pluggable code executor for the notebook UI. "full" runs real Python
    # in-process with the data-science stack preloaded (fit for the single-user
    # local desktop context); "safe" runs a restricted, read-only pandas subset.
    # Other executors can be registered in app.services.notebook.factory without
    # changing the API.
    notebook_executor: str = "full"

    # OpenAI (and the default OpenAI-compatible endpoint).
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"

    # Azure OpenAI.
    azure_openai_api_key: str = ""
    azure_openai_endpoint: str = ""  # https://<resource>.openai.azure.com
    azure_openai_deployment: str = ""
    azure_openai_api_version: str = "2024-02-15-preview"

    # Google Gemini (via its OpenAI-compatible endpoint).
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"

    # Anthropic Claude.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-3-5-sonnet-latest"
    anthropic_base_url: str = "https://api.anthropic.com/v1"

    # Ollama (local, no key required).
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "llama3.1"

    # OpenRouter.
    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-4o-mini"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    @field_validator("cors_origins")
    @classmethod
    def _strip_origins(cls, v: str) -> str:
        return v.strip()

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()


settings = get_settings()
