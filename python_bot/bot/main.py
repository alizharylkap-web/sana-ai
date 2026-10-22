import asyncio
from contextlib import asynccontextmanager
import sys

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.types import BotCommand, Update
from fastapi import FastAPI, Request, Header, HTTPException
from sqlalchemy import text
import structlog

from bot.config import config
from bot.core import database as db_core
from bot.core.prompts_cache import load_prompts_cache
from bot.core.redis import get_redis_client, close_redis
from bot.handlers import (
    admin,
    billing,
    dialog,
    export,
    files,
    modes,
    reminders,
    start,
    voice,
)
from bot.middlewares.auth_user import AuthUserMiddleware
from bot.middlewares.i18n import I18nMiddleware
from bot.middlewares.throttling import ThrottlingMiddleware
from bot.services.reminder_service import reminder_checker_loop

logger = structlog.get_logger(__name__)

bot: Bot | None = None
dp: Dispatcher | None = None
reminder_task: asyncio.Task | None = None


async def setup_bot_commands(active_bot: Bot) -> None:
    commands = [
        BotCommand(command="start", description="🚀 Перезапустить бота / Выбор языка"),
        BotCommand(command="mode", description="🎭 Выбрать режим ИИ-ментора"),
        BotCommand(command="plan", description="📅 Создать умное напоминание"),
        BotCommand(command="reminders", description="📋 Список активных задач"),
        BotCommand(command="memory", description="🧠 Что бот помнит обо мне"),
        BotCommand(command="clear", description="🧹 Очистить контекст диалога"),
        BotCommand(command="profile", description="👤 Мой профиль и лимиты"),
        BotCommand(command="subscribe", description="💎 Подписка Sana PRO"),
        BotCommand(command="export", description="📦 Скачать историю диалогов (.md)"),
        BotCommand(command="help", description="❓ Справка по возможностям"),
    ]
    try:
        await active_bot.set_my_commands(commands)
    except Exception as e:
        logger.warning("could_not_set_bot_commands", error=str(e))


def create_dispatcher(redis_client=None) -> Dispatcher:
    storage = RedisStorage(redis=redis_client) if redis_client else MemoryStorage()
    dispatcher = Dispatcher(storage=storage)

    # Register Middlewares (Throttling -> Auth/DB -> I18n)
    dispatcher.message.middleware(ThrottlingMiddleware(redis_client, limit_per_sec=2.0))
    dispatcher.update.middleware(AuthUserMiddleware())
    dispatcher.update.middleware(I18nMiddleware())

    # Register Routers (Specific commands first, catch-all text dialog last)
    dispatcher.include_router(start.router)
    dispatcher.include_router(admin.router)
    dispatcher.include_router(billing.router)
    dispatcher.include_router(modes.router)
    dispatcher.include_router(reminders.router)
    dispatcher.include_router(export.router)
    dispatcher.include_router(files.router)
    dispatcher.include_router(voice.router)
    dispatcher.include_router(dialog.router)

    return dispatcher


@asynccontextmanager
async def lifespan(app: FastAPI):
    global bot, dp, reminder_task
    logger.info("starting_sana_ai_bot")

    await db_core.init_db()
    load_prompts_cache()
    redis_client = await get_redis_client()

    token_str = config.BOT_TOKEN.get_secret_value()
    bot = Bot(
        token=token_str,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = create_dispatcher(redis_client)

    reminder_task = asyncio.create_task(reminder_checker_loop(bot))

    if config.BOT_WEBHOOK_URL and token_str != "0000000000:TEST_TOKEN_PLACEHOLDER":
        webhook_url = f"{config.BOT_WEBHOOK_URL.rstrip('/')}{config.WEBHOOK_PATH}"
        await bot.set_webhook(
            url=webhook_url,
            secret_token=config.WEBHOOK_SECRET,
            drop_pending_updates=True,
            allowed_updates=["message", "callback_query", "pre_checkout_query"],
        )
        await setup_bot_commands(bot)
        logger.info("webhook_set", url=webhook_url)

    yield

    logger.info("shutting_down_sana_ai_bot")
    if reminder_task:
        reminder_task.cancel()
    if bot:
        try:
            if config.BOT_WEBHOOK_URL and token_str != "0000000000:TEST_TOKEN_PLACEHOLDER":
                await bot.delete_webhook()
        except Exception:
            pass
        await bot.session.close()
    await db_core.close_db()
    await close_redis()


app = FastAPI(title="Sana AI Webhook API", lifespan=lifespan)


@app.post(config.WEBHOOK_PATH)
async def bot_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str = Header(None),
):
    if config.WEBHOOK_SECRET and x_telegram_bot_api_secret_token != config.WEBHOOK_SECRET:
        logger.warning("unauthorized_webhook_attempt")
        raise HTTPException(status_code=403, detail="Invalid secret token")

    if not bot or not dp:
        raise HTTPException(status_code=503, detail="Bot is not initialized")

    update_data = await request.json()
    telegram_update = Update(**update_data)
    await dp.feed_update(bot=bot, update=telegram_update)
    return {"status": "ok"}


@app.get("/health")
async def health_check():
    health_status = {"status": "healthy", "db": "down", "redis": "optional"}

    try:
        async with db_core.async_session_maker() as session:
            await session.execute(text("SELECT 1"))
        health_status["db"] = "up"
    except Exception as e:
        logger.error("healthcheck_db_error", error=str(e))
        health_status["status"] = "unhealthy"

    try:
        redis_client = await get_redis_client()
        if redis_client:
            await redis_client.ping()
            health_status["redis"] = "up"
        else:
            health_status["redis"] = "fallback_memory"
    except Exception:
        health_status["redis"] = "fallback_memory"

    if health_status["status"] == "unhealthy":
        raise HTTPException(status_code=503, detail=health_status)

    return health_status


async def run_polling() -> None:
    """Run Sana AI Bot in Long-Polling mode (convenient for local dev or VPS without SSL)."""
    await db_core.init_db()
    load_prompts_cache()
    redis_client = await get_redis_client()

    token_str = config.BOT_TOKEN.get_secret_value()
    active_bot = Bot(
        token=token_str,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dispatcher = create_dispatcher(redis_client)

    checker_task = asyncio.create_task(reminder_checker_loop(active_bot))

    try:
        await active_bot.delete_webhook(drop_pending_updates=True)
        await setup_bot_commands(active_bot)
        logger.info("sana_ai_polling_started")
        await dispatcher.start_polling(active_bot)
    finally:
        checker_task.cancel()
        await active_bot.session.close()
        await db_core.close_db()
        await close_redis()


if __name__ == "__main__":
    if config.BOT_TOKEN.get_secret_value() == "0000000000:TEST_TOKEN_PLACEHOLDER":
        logger.error("please_set_real_bot_token_in_env")
        sys.exit(1)
    asyncio.run(run_polling())
