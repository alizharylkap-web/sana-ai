from typing import Callable, Dict, Any, Awaitable
from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, Message, CallbackQuery, PreCheckoutQuery
import bot.core.database as db_core
from bot.repositories.user_repo import UserRepository


class AuthUserMiddleware(BaseMiddleware):
    """
    Создает или загружает профиль пользователя в БД, проверяет блокировку
    и инжектирует `db_session`, `user_repo` и `current_user` во все обработчики.
    """
    async def __call__(
        self,
        handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: Dict[str, Any]
    ) -> Any:
        tg_user = None
        if isinstance(event, (Message, CallbackQuery, PreCheckoutQuery)):
            tg_user = event.from_user
        elif hasattr(event, "message") and getattr(event, "message") is not None:
            tg_user = event.message.from_user
        elif hasattr(event, "callback_query") and getattr(event, "callback_query") is not None:
            tg_user = event.callback_query.from_user

        if not tg_user or tg_user.is_bot:
            return await handler(event, data)

        async with db_core.async_session_maker() as session:
            user_repo = UserRepository(session)
            user, _ = await user_repo.get_or_create(
                telegram_id=tg_user.id,
                first_name=tg_user.first_name or "Студент",
                last_name=tg_user.last_name,
                username=tg_user.username,
            )

            if user and user.is_banned:
                if isinstance(event, Message):
                    await event.answer("⛔ Ваш аккаунт заблокирован за нарушение правил сервиса.")
                elif isinstance(event, CallbackQuery):
                    await event.answer("⛔ Ваш аккаунт заблокирован.", show_alert=True)
                return None

            data["db_session"] = session
            data["user_repo"] = user_repo
            data["current_user"] = user

            try:
                result = await handler(event, data)
                await session.commit()
                return result
            except Exception:
                await session.rollback()
                raise
