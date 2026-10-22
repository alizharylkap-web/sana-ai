from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine
)
from sqlalchemy.orm import DeclarativeBase
from bot.config import config
import structlog

logger = structlog.get_logger(__name__)


class Base(DeclarativeBase):
    """Базовый декларативный класс для моделей SQLAlchemy 2.0."""
    pass


def _build_engine(db_url: str) -> AsyncEngine:
    is_sqlite = db_url.startswith("sqlite")
    kwargs: dict = {
        "echo": (config.ENV == "development" and config.LOG_LEVEL == "DEBUG"),
    }
    if not is_sqlite:
        kwargs.update({
            "pool_size": 20,
            "max_overflow": 10,
            "pool_recycle": 1800,
            "pool_pre_ping": True,
        })
    try:
        return create_async_engine(db_url, **kwargs)
    except (ModuleNotFoundError, ImportError) as exc:
        logger.warning(
            "db_driver_missing_falling_back_to_sqlite",
            error=str(exc),
            fallback=config.SQLITE_FALLBACK_PATH,
        )
        return create_async_engine(
            config.SQLITE_FALLBACK_PATH,
            echo=(config.ENV == "development" and config.LOG_LEVEL == "DEBUG"),
        )


engine: AsyncEngine = _build_engine(config.database_url)

async_session_maker = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)


async def init_db() -> None:
    """
    Инициализирует подключение к БД и создает таблицы при необходимости.
    При недоступности PostgreSQL в локальной среде автоматически переключается на SQLite.
    """
    global engine, async_session_maker
    # Импортируем все модели для регистрации метаданных
    from bot.models import user, dialog, reminder, transaction  # noqa: F401

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("database_initialized", url=engine.url.render_as_string(hide_password=True))
    except Exception as exc:
        logger.warning(
            "primary_db_unavailable_falling_back_to_sqlite",
            error=str(exc),
            fallback=config.SQLITE_FALLBACK_PATH
        )
        await engine.dispose()
        engine = _build_engine(config.SQLITE_FALLBACK_PATH)
        async_session_maker = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False
        )
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("sqlite_fallback_initialized", path=config.SQLITE_FALLBACK_PATH)


async def close_db() -> None:
    """Корректное закрытие пула соединений БД."""
    await engine.dispose()
    logger.info("database_pool_disposed")


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Асинхронный генератор сессии БД с автоматическим commit/rollback."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
