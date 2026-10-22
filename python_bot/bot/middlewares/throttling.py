import time
from typing import Callable, Dict, Any, Awaitable
from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, Message
from redis.asyncio import Redis
import structlog

logger = structlog.get_logger(__name__)


class ThrottlingMiddleware(BaseMiddleware):
    """
    Защита от флуда и спама: использует Redis в продакшене и автоматически
    переключается на локальный кэш в памяти при работе без Redis.
    """
    def __init__(self, redis: Redis | None = None, limit_per_sec: float = 2.0):
        self.redis = redis
        self.cooldown = 1.0 / max(0.1, limit_per_sec)
        self._memory_timestamps: dict[int, float] = {}

    async def __call__(
        self,
        handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: Dict[str, Any]
    ) -> Any:
        if not isinstance(event, Message) or not event.from_user:
            return await handler(event, data)

        user_id = event.from_user.id
        key = f"throttle:{user_id}"

        if self.redis is not None:
            try:
                is_throttled = await self.redis.get(key)
                if is_throttled:
                    logger.warning("user_throttled_redis", user_id=user_id)
                    await event.answer("⏳ Не так быстро! Дай мне секунду закончить предыдущую мысль.")
                    return None
                ttl_ms = max(500, int(self.cooldown * 1000))
                await self.redis.psetex(key, ttl_ms, "1")
                return await handler(event, data)
            except Exception as exc:
                logger.warning("redis_throttle_fallback", error=str(exc))

        now = time.monotonic()
        last_ts = self._memory_timestamps.get(user_id, 0.0)
        if now - last_ts < self.cooldown:
            logger.warning("user_throttled_memory", user_id=user_id)
            await event.answer("⏳ Не так быстро! Дай мне секунду закончить предыдущую мысль.")
            return None

        self._memory_timestamps[user_id] = now
        return await handler(event, data)
