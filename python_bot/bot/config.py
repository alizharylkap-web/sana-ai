from typing import Literal
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Production-конфигурация Sana AI бота с валидацией через Pydantic v2.
    """
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Telegram Bot
    BOT_TOKEN: SecretStr
    BOT_WEBHOOK_URL: str = Field(default="")
    WEBHOOK_PATH: str = Field(default="/webhook")
    ADMIN_IDS: list[int] = Field(description="Список Telegram ID администраторов без значений по умолчанию")

    # Web Server (FastAPI)
    WEBAPP_HOST: str = Field(default="0.0.0.0")
    WEBAPP_PORT: int = Field(default=8000)

    # Google Gemini API
    GEMINI_API_KEY: SecretStr
    GEMINI_FREE_MODEL: str = Field(default="gemini-3.5-flash-lite")
    GEMINI_PRO_MODEL: str = Field(default="gemini-3.8-flash")

    # Thinking Levels для Gemini 3.8 Flash (low | medium | high, минимал запрещен)
    THINKING_LEVEL_DEFAULT: Literal["LOW", "MEDIUM", "HIGH"] = "LOW"
    THINKING_LEVEL_REASONING: Literal["LOW", "MEDIUM", "HIGH"] = "MEDIUM"

    # PostgreSQL Database
    POSTGRES_USER: str = Field(default="sana_admin")
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str = Field(default="sana_ai")
    POSTGRES_HOST: str = Field(default="postgres")
    POSTGRES_PORT: int = Field(default=5432)

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@"
            f"{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # Redis
    REDIS_HOST: str = Field(default="redis")
    REDIS_PORT: int = Field(default=6379)
    REDIS_PASSWORD: str

    @property
    def redis_url(self) -> str:
        return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    # Business Limits & Monetization
    FREE_DAILY_LIMIT: int = Field(default=20)
    REFERRAL_BONUS_QUERIES: int = Field(default=10)
    MAX_SHORT_TERM_MESSAGES: int = Field(default=12)
    MEMORY_EXTRACTION_INTERVAL: int = Field(default=6)
    PRO_PRICE_STARS: int = Field(default=100)
    PRO_DURATION_DAYS: int = Field(default=30)

    # Logging
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    ENV: Literal["development", "production"] = "production"


config = Settings()
