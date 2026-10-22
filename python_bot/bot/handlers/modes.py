from typing import Callable
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

router = Router(name="modes_router")

MODES = {
    "mentor": "🎓 Наставник (Socratic)",
    "coder": "💻 Кодер (Senior Dev)",
    "planner": "📅 Планировщик (GTD)",
    "examiner": "📝 Экзаменатор (Strict)",
    "editor": "✍️ Редактор (Copywriter)",
}


def get_modes_keyboard(current_mode: str) -> InlineKeyboardMarkup:
    buttons = []
    for mode_key, mode_name in MODES.items():
        prefix = "✅ " if mode_key == current_mode else ""
        buttons.append(
            [
                InlineKeyboardButton(
                    text=f"{prefix}{mode_name}",
                    callback_data=f"set_mode:{mode_key}",
                )
            ]
        )
    return InlineKeyboardMarkup(inline_keyboard=buttons)


@router.message(Command("mode"))
async def cmd_mode(message: Message, current_user: User, _: Callable) -> None:
    await message.answer(
        text=_("choose_mode"),
        reply_markup=get_modes_keyboard(current_user.mode),
        parse_mode="HTML",
    )


@router.callback_query(F.data.startswith("set_mode:"))
async def process_mode_selection(
    callback: CallbackQuery,
    current_user: User,
    db_session: AsyncSession,
    _: Callable,
) -> None:
    new_mode = callback.data.split(":", 1)[1]
    if new_mode not in MODES:
        await callback.answer("Неизвестный режим", show_alert=True)
        return

    if new_mode == current_user.mode:
        await callback.answer("Этот режим уже активен!")
        return

    current_user.mode = new_mode
    await db_session.commit()

    if callback.message:
        await callback.message.edit_text(
            text=_("mode_changed", mode=MODES[new_mode]),
            reply_markup=get_modes_keyboard(new_mode),
            parse_mode="HTML",
        )
    await callback.answer()
