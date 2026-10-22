from typing import Literal, Any
from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Production-конфигурация Sana AI бота с валидацией через Pydantic v2.
    Поддерживает PostgreSQL + Redis в продакшене и автоматический fallback
    на SQLite + In-Memory для быстрого локального запуска без Docker.
    """
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Telegram Bot
    BOT_TOKEN: SecretStr = Field(default=SecretStr("0000000000:TEST_TOKEN_PLACEHOLDER"))
    BOT_USERNAME: str = Field(default="SanaAIBot")
    BOT_WEBHOOK_URL: str = Field(default="")
    WEBHOOK_PATH: str = Field(default="/webhook")
    WEBHOOK_SECRET: str = Field(default="")
    ADMIN_IDS: list[int] = Field(default_factory=lambda: [123456789])

    @field_validator("ADMIN_IDS", mode="before")
    @classmethod
    def parse_admin_ids(cls, v: Any) -> list[int]:
        if isinstance(v, list):
            return [int(x) for x in v]
        if isinstance(v, int):
            return [v]
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            if v.startswith("[") and v.endswith("]"):
                import json
                return [int(x) for x in json.loads(v)]
            return [int(x.strip()) for x in v.split(",") if x.strip().isdigit()]
        return [123456789]

    # Web Server (FastAPI)
    WEBAPP_HOST: str = Field(default="0.0.0.0")
    WEBAPP_PORT: int = Field(default=8000)

    # Google Gemini API
    GEMINI_API_KEY: SecretStr = Field(default=SecretStr("TEST_GEMINI_KEY_PLACEHOLDER"))
    GEMINI_FREE_MODEL: str = Field(default="gemini-2.5-flash")
    GEMINI_FLASH_MODEL: str = Field(default="gemini-2.5-flash")
    GEMINI_PRO_MODEL: str = Field(default="gemini-2.5-pro")

    # Thinking Levels (LOW | MEDIUM | HIGH)
    THINKING_LEVEL_DEFAULT: Literal["LOW", "MEDIUM", "HIGH"] = "LOW"
    THINKING_LEVEL_REASONING: Literal["LOW", "MEDIUM", "HIGH"] = "MEDIUM"

    # Database (PostgreSQL or SQLite fallback)
    DATABASE_URL: str | None = Field(default=None)
    POSTGRES_USER: str = Field(default="sana_admin")
    POSTGRES_PASSWORD: str = Field(default="postgres")
    POSTGRES_DB: str = Field(default="sana_ai")
    POSTGRES_HOST: str = Field(default="localhost")
    POSTGRES_PORT: int = Field(default=5432)
    SQLITE_FALLBACK_PATH: str = Field(default="sqlite+aiosqlite:///./sana_ai.db")

    @property
    def database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@"
            f"{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # Redis
    REDIS_URL: str | None = Field(default=None)
    REDIS_HOST: str = Field(default="localhost")
    REDIS_PORT: int = Field(default=6379)
    REDIS_PASSWORD: str | None = Field(default=None)

    @property
    def redis_url(self) -> str:
        if self.REDIS_URL:
            return self.REDIS_URL
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/0"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    # Business Limits & Monetization
    FREE_DAILY_LIMIT: int = Field(default=20)
    REFERRAL_BONUS_QUERIES: int = Field(default=10)
    MAX_SHORT_TERM_MESSAGES: int = Field(default=12)
    MEMORY_EXTRACTION_INTERVAL: int = Field(default=6)
    PRO_PRICE_STARS: int = Field(default=100)
    PRO_DURATION_DAYS: int = Field(default=30)

    # Logging
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    ENV: Literal["development", "production"] = "development"


config = Settings()
