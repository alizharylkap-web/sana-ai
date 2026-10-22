from redis.asyncio import Redis, from_url
from bot.config import config
import structlog

logger = structlog.get_logger(__name__)
_redis_client: Redis | None = None


async def get_redis_client() -> Redis | None:
    """
    Подключается к Redis и проверяет доступность через PING.
    Если Redis недоступен в локальной разработке, возвращает None
    для прозрачного переключения на In-Memory хранилище.
    """
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    try:
        client = from_url(
            config.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
            retry_on_timeout=True
        )
        await client.ping()
        _redis_client = client
        logger.info("redis_connection_established")
        return _redis_client
    except Exception as exc:
        logger.warning("redis_unavailable_using_memory_fallback", error=str(exc))
        _redis_client = None
        return None


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None
        logger.info("redis_connection_closed")
