import asyncio
from contextlib import asynccontextmanager
import logging
import sys

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.fsm.storage.redis import RedisStorage
from aiogram.types import BotCommand, Update
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Request, Header, HTTPException
from sqlalchemy import text

from bot.config import settings
from bot.core import database as db_core
from bot.core.prompts_cache import PromptsCache
from bot.core.redis import init_redis, close_redis, get_redis
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
from bot.services.reminder_service import reminder_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()
bot: Bot | None = None
dp: Dispatcher | None = None


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
        logger.warning(f"Could not set bot commands: {e}")


def create_dispatcher(redis_client=None) -> Dispatcher:
    storage = RedisStorage(redis=redis_client) if redis_client else MemoryStorage()
    dispatcher = Dispatcher(storage=storage)

    # Register Middlewares (Order matters: Throttling -> Auth/DB -> I18n)
    dispatcher.message.middleware(ThrottlingMiddleware(redis_client, rate_limit=0.8))
    dispatcher.callback_query.middleware(ThrottlingMiddleware(redis_client, rate_limit=0.4))

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
    global bot, dp
    logger.info("Starting Sana AI Bot...")

    # 1. Initialize Database & Cache
    await db_core.init_db()
    PromptsCache.load_prompts()
    redis_client = await init_redis()

    # 2. Initialize Bot & Dispatcher
    bot = Bot(
        token=settings.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = create_dispatcher(redis_client)

    # 3. Start Background Scheduler
    scheduler.add_job(
        reminder_service.check_and_send_reminders,
        trigger="interval",
        seconds=30,
        kwargs={"bot": bot},
        id="check_reminders",
        replace_existing=True,
    )
    scheduler.start()

    # 4. Set Webhook if configured
    if settings.BOT_WEBHOOK_URL and settings.BOT_TOKEN != "0000000000:TEST_TOKEN_PLACEHOLDER":
        webhook_url = f"{settings.BOT_WEBHOOK_URL.rstrip('/')}{settings.WEBHOOK_PATH}"
        await bot.set_webhook(
            url=webhook_url,
            secret_token=settings.WEBHOOK_SECRET,
            drop_pending_updates=True,
            allowed_updates=["message", "callback_query", "pre_checkout_query"],
        )
        await setup_bot_commands(bot)
        logger.info(f"Webhook set to {webhook_url}")

    yield

    logger.info("Shutting down Sana AI Bot...")
    if scheduler.running:
        scheduler.shutdown()
    if bot:
        try:
            if settings.BOT_WEBHOOK_URL and settings.BOT_TOKEN != "0000000000:TEST_TOKEN_PLACEHOLDER":
                await bot.delete_webhook()
        except Exception:
            pass
        await bot.session.close()
    await db_core.close_db()
    await close_redis()


app = FastAPI(title="Sana AI Webhook API", lifespan=lifespan)


@app.post(settings.WEBHOOK_PATH)
async def bot_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str = Header(None),
):
    if x_telegram_bot_api_secret_token != settings.WEBHOOK_SECRET:
        logger.warning("Unauthorized webhook attempt detected!")
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
        logger.error(f"Healthcheck DB error: {e}")
        health_status["status"] = "unhealthy"

    try:
        redis_client = get_redis()
        if redis_client:
            await redis_client.ping()
            health_status["redis"] = "up"
    except Exception as e:
        logger.warning(f"Healthcheck Redis warning: {e}")
        health_status["redis"] = "fallback_memory"

    if health_status["status"] == "unhealthy":
        raise HTTPException(status_code=503, detail=health_status)

    return health_status


async def run_polling() -> None:
    """Run Sana AI Bot in Long-Polling mode (convenient for local dev or VPS without SSL)."""
    await db_core.init_db()
    PromptsCache.load_prompts()
    redis_client = await init_redis()

    active_bot = Bot(
        token=settings.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dispatcher = create_dispatcher(redis_client)

    scheduler.add_job(
        reminder_service.check_and_send_reminders,
        trigger="interval",
        seconds=30,
        kwargs={"bot": active_bot},
        id="check_reminders_polling",
        replace_existing=True,
    )
    scheduler.start()

    try:
        await active_bot.delete_webhook(drop_pending_updates=True)
        await setup_bot_commands(active_bot)
        logger.info("Sana AI Bot started in Long-Polling mode!")
        await dispatcher.start_polling(active_bot)
    finally:
        if scheduler.running:
            scheduler.shutdown()
        await active_bot.session.close()
        await db_core.close_db()
        await close_redis()


if __name__ == "__main__":
    if settings.BOT_TOKEN == "0000000000:TEST_TOKEN_PLACEHOLDER":
        logger.error("Please set a real BOT_TOKEN in .env before running polling!")
        sys.exit(1)
    asyncio.run(run_polling())
