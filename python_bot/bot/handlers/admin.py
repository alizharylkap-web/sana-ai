import asyncio
from aiogram import Router, Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from bot.config import config
from bot.models.reminder import Reminder
from bot.models.transaction import Transaction
from bot.models.user import User
from bot.repositories.user_repo import UserRepository

logger = structlog.get_logger(__name__)
router = Router(name="admin_router")


def is_admin(user: User) -> bool:
    return user.is_admin or (user.telegram_id in config.ADMIN_IDS)


@router.message(Command("admin"))
async def cmd_admin_stats(
    message: Message,
    current_user: User,
    db_session: AsyncSession,
) -> None:
    if not is_admin(current_user):
        await message.answer("⛔ Доступ запрещён. Ваш ID не входит в список администраторов.")
        return

    total_users = await db_session.scalar(select(func.count(User.telegram_id))) or 0
    pro_users = (
        await db_session.scalar(select(func.count(User.telegram_id)).where(User.is_pro == True))  # noqa: E712
        or 0
    )
    banned_users = (
        await db_session.scalar(
            select(func.count(User.telegram_id)).where(User.is_banned == True)  # noqa: E712
        )
        or 0
    )
    active_reminders = (
        await db_session.scalar(
            select(func.count(Reminder.id)).where(Reminder.is_completed == False)  # noqa: E712
        )
        or 0
    )
    total_revenue_stars = (
        await db_session.scalar(
            select(func.sum(Transaction.amount_stars)).where(
                Transaction.status == "successful"
            )
        )
        or 0
    )

    stats_text = (
        "📊 <b>Панель Администратора Sana AI</b>\n\n"
        f"👥 Всего пользователей: <b>{total_users}</b>\n"
        f"💎 Подписчиков PRO: <b>{pro_users}</b>\n"
        f"🚫 Заблокировано: <b>{banned_users}</b>\n"
        f"⏰ Активных напоминаний: <b>{active_reminders}</b>\n"
        f"⭐ Выручка (Stars): <b>{total_revenue_stars} XTR</b>\n\n"
        "<b>Команды управления:</b>\n"
        "• <code>/grant_pro [user_id]</code> — выдать PRO статус\n"
        "• <code>/ban [user_id]</code> — заблокировать пользователя\n"
        "• <code>/unban [user_id]</code> — разблокировать пользователя\n"
        "• <code>/broadcast [текст]</code> — рассылка всем активным пользователям"
    )
    await message.answer(stats_text, parse_mode="HTML")


@router.message(Command("grant_pro"))
async def cmd_grant_pro(
    message: Message,
    current_user: User,
    user_repo: UserRepository,
    db_session: AsyncSession,
) -> None:
    if not is_admin(current_user):
        return

    args = message.text.split() if message.text else []
    if len(args) < 2 or not args[1].isdigit():
        await message.answer("Использование: <code>/grant_pro 123456789</code>", parse_mode="HTML")
        return

    target_id = int(args[1])
    user = await user_repo.grant_pro(target_id)
    if not user:
        await message.answer("⚠️ Пользователь не найден в базе данных.")
        return

    await db_session.commit()
    await message.answer(
        f"✅ Пользователю <code>{target_id}</code> успешно выдан статус <b>PRO</b>!",
        parse_mode="HTML",
    )


@router.message(Command("ban"))
async def cmd_ban_user(
    message: Message,
    current_user: User,
    user_repo: UserRepository,
    db_session: AsyncSession,
) -> None:
    if not is_admin(current_user):
        return

    args = message.text.split() if message.text else []
    if len(args) < 2 or not args[1].isdigit():
        await message.answer("Использование: <code>/ban 123456789</code>", parse_mode="HTML")
        return

    target_id = int(args[1])
    user = await user_repo.set_ban_status(target_id, is_banned=True)
    if not user:
        await message.answer("⚠️ Пользователь не найден в базе данных.")
        return

    await db_session.commit()
    await message.answer(
        f"🚫 Пользователь <code>{target_id}</code> заблокирован.",
        parse_mode="HTML",
    )


@router.message(Command("unban"))
async def cmd_unban_user(
    message: Message,
    current_user: User,
    user_repo: UserRepository,
    db_session: AsyncSession,
) -> None:
    if not is_admin(current_user):
        return

    args = message.text.split() if message.text else []
    if len(args) < 2 or not args[1].isdigit():
        await message.answer("Использование: <code>/unban 123456789</code>", parse_mode="HTML")
        return

    target_id = int(args[1])
    user = await user_repo.set_ban_status(target_id, is_banned=False)
    if not user:
        await message.answer("⚠️ Пользователь не найден в базе данных.")
        return

    await db_session.commit()
    await message.answer(
        f"✅ Пользователь <code>{target_id}</code> разблокирован.",
        parse_mode="HTML",
    )


@router.message(Command("broadcast"))
async def cmd_broadcast(
    message: Message,
    bot: Bot,
    current_user: User,
    user_repo: UserRepository,
) -> None:
    if not is_admin(current_user):
        return

    args = message.text.split(maxsplit=1) if message.text else []
    if len(args) < 2 or not args[1].strip():
        await message.answer(
            "Использование: <code>/broadcast Текст рассылки для всех пользователей</code>",
            parse_mode="HTML",
        )
        return

    broadcast_text = args[1].strip()
    user_ids = await user_repo.get_active_user_ids()
    status_msg = await message.answer(
        f"📢 Начинаю рассылку для <b>{len(user_ids)}</b> пользователей...",
        parse_mode="HTML",
    )

    sent_count = 0
    failed_count = 0

    for uid in user_ids:
        try:
            await bot.send_message(
                chat_id=uid,
                text=f"📢 <b>Объявление Sana AI</b>\n\n{broadcast_text}",
                parse_mode="HTML",
            )
            sent_count += 1
            await asyncio.sleep(0.05)
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            try:
                await bot.send_message(chat_id=uid, text=broadcast_text)
                sent_count += 1
            except Exception:
                failed_count += 1
        except TelegramForbiddenError:
            failed_count += 1
        except Exception as e:
            logger.warning("broadcast_send_failed", user_id=uid, error=str(e))
            failed_count += 1

    await status_msg.edit_text(
        f"✅ <b>Рассылка завершена!</b>\n\n"
        f"📨 Успешно доставлено: <b>{sent_count}</b>\n"
        f"⚠️ Ошибок / Блокировок бота: <b>{failed_count}</b>",
        parse_mode="HTML",
    )
