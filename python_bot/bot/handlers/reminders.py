from datetime import datetime, timezone
import html
import zoneinfo
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from sqlalchemy.ext.asyncio import AsyncSession

from bot.models.user import User
from bot.repositories.reminder_repo import ReminderRepository
from bot.services.reminder_service import parse_natural_reminder

router = Router(name="reminders_router")


def build_reminders_keyboard(reminders) -> InlineKeyboardMarkup:
    buttons = []
    for r in reminders:
        short_title = r.title[:28] + ("…" if len(r.title) > 28 else "")
        buttons.append(
            [
                InlineKeyboardButton(
                    text=f"✅ Выполнить: {short_title}",
                    callback_data=f"rem_done:{r.id}",
                ),
                InlineKeyboardButton(
                    text="🗑",
                    callback_data=f"rem_del:{r.id}",
                ),
            ]
        )
    return InlineKeyboardMarkup(inline_keyboard=buttons)


@router.message(Command("plan"))
async def cmd_plan(
    message: Message,
    current_user: User,
    db_session: AsyncSession,
) -> None:
    args = message.text.split(maxsplit=1) if message.text else []
    if len(args) < 2 or not args[1].strip():
        await message.answer(
            "📅 <b>Умный планировщик Sana AI</b>\n\n"
            "Напишите задачу в свободной форме после команды <code>/plan</code>.\n"
            "Примеры:\n"
            "• <code>/plan Позвонить маме через 15 минут</code>\n"
            "• <code>/plan Сдать отчет завтра в 10:00</code>\n"
            "• <code>/plan Повторить билеты по физике через 2 часа</code>",
            parse_mode="HTML",
        )
        return

    user_request = args[1].strip()
    status_msg = await message.answer(
        "⏳ <i>Анализирую время и создаю напоминание...</i>",
        parse_mode="HTML",
    )

    parsed_data = await parse_natural_reminder(
        user_text=user_request,
        user_tz=current_user.timezone,
    )

    if not parsed_data or "title" not in parsed_data or "datetime_iso" not in parsed_data:
        await status_msg.edit_text(
            "⚠️ Не удалось распознать дату и время. Попробуйте указать точнее (например: <i>«через 30 минут»</i>).",
            parse_mode="HTML",
        )
        return

    try:
        try:
            tz = zoneinfo.ZoneInfo(current_user.timezone)
        except Exception:
            tz = zoneinfo.ZoneInfo("Asia/Almaty")

        due_str = str(parsed_data["datetime_iso"]).replace("Z", "+00:00")
        due_dt = datetime.fromisoformat(due_str)
        if due_dt.tzinfo is None:
            due_dt = due_dt.replace(tzinfo=tz)
        due_utc = due_dt.astimezone(timezone.utc)

        repo = ReminderRepository(db_session)
        reminder = await repo.create_reminder(
            user_id=current_user.telegram_id,
            title=str(parsed_data["title"]),
            remind_at_utc=due_utc,
        )
        await db_session.commit()

        safe_title = html.escape(reminder.title)
        formatted_time = due_dt.strftime("%d.%m.%Y в %H:%M")
        await status_msg.edit_text(
            f"✅ <b>Напоминание установлено!</b>\n\n"
            f"📌 <b>Задача:</b> {safe_title}\n"
            f"🕒 <b>Время:</b> {formatted_time} ({current_user.timezone})",
            parse_mode="HTML",
        )
    except Exception:
        await status_msg.edit_text("⚠️ Ошибка при сохранении напоминания в базу данных.")


@router.message(Command("reminders", "tasks"))
async def cmd_reminders_list(
    message: Message,
    current_user: User,
    db_session: AsyncSession,
) -> None:
    repo = ReminderRepository(db_session)
    reminders = await repo.get_active_user_reminders(current_user.telegram_id)

    if not reminders:
        await message.answer(
            "📭 У вас пока нет активных напоминаний.\n"
            "Создайте новое с помощью команды:\n"
            "<code>/plan Позвонить клиенту через 30 минут</code>",
            parse_mode="HTML",
        )
        return

    text = "📋 <b>Ваши активные напоминания:</b>\n\n"
    for idx, r in enumerate(reminders, 1):
        due_at = r.remind_at_utc
        if due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=timezone.utc)
        time_str = due_at.strftime("%d.%m.%Y %H:%M UTC")
        text += f"{idx}. <b>{html.escape(r.title)}</b> — <i>{time_str}</i>\n"

    await message.answer(
        text,
        reply_markup=build_reminders_keyboard(reminders),
        parse_mode="HTML",
    )


@router.callback_query(F.data.startswith("rem_done:"))
async def callback_complete_reminder(
    callback: CallbackQuery,
    current_user: User,
    db_session: AsyncSession,
) -> None:
    reminder_id = int(callback.data.split(":", 1)[1])
    repo = ReminderRepository(db_session)
    await repo.mark_completed(reminder_id, user_id=current_user.telegram_id)
    await db_session.commit()

    reminders = await repo.get_active_user_reminders(current_user.telegram_id)
    if callback.message:
        if not reminders:
            await callback.message.edit_text("✅ Все напоминания выполнены! Список пуст.")
        else:
            text = "📋 <b>Ваши активные напоминания:</b>\n\n"
            for idx, r in enumerate(reminders, 1):
                time_str = r.remind_at_utc.strftime("%d.%m.%Y %H:%M UTC")
                text += f"{idx}. <b>{html.escape(r.title)}</b> — <i>{time_str}</i>\n"
            await callback.message.edit_text(
                text,
                reply_markup=build_reminders_keyboard(reminders),
                parse_mode="HTML",
            )
    await callback.answer("Задача отмечена выполненной!")


@router.callback_query(F.data.startswith("rem_del:"))
async def callback_delete_reminder(
    callback: CallbackQuery,
    current_user: User,
    db_session: AsyncSession,
) -> None:
    reminder_id = int(callback.data.split(":", 1)[1])
    repo = ReminderRepository(db_session)
    await repo.delete_reminder(reminder_id, user_id=current_user.telegram_id)
    await db_session.commit()

    reminders = await repo.get_active_user_reminders(current_user.telegram_id)
    if callback.message:
        if not reminders:
            await callback.message.edit_text("🗑 Напоминание удалено. Активных задач больше нет.")
        else:
            text = "📋 <b>Ваши активные напоминания:</b>\n\n"
            for idx, r in enumerate(reminders, 1):
                time_str = r.remind_at_utc.strftime("%d.%m.%Y %H:%M UTC")
                text += f"{idx}. <b>{html.escape(r.title)}</b> — <i>{time_str}</i>\n"
            await callback.message.edit_text(
                text,
                reply_markup=build_reminders_keyboard(reminders),
                parse_mode="HTML",
            )
    await callback.answer("Напоминание удалено")
