from typing import Callable
from aiogram import Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from sqlalchemy.ext.asyncio import AsyncSession

from bot.models.user import User

router = Router(name="start_router")

MODE_LABELS = {
    "mentor": "🧠 Ментор (Socratic)",
    "coder": "💻 Программист (Senior Dev)",
    "planner": "📅 Планировщик (GTD)",
    "examiner": "🎓 Экзаменатор (Strict)",
    "editor": "✍️ Редактор (Copywriter)",
}


def build_language_keyboard(current_lang: str) -> InlineKeyboardMarkup:
    langs = [
        ("ru", "🇷🇺 Русский"),
        ("kk", "🇰🇿 Қазақша"),
        ("en", "🇬🇧 English"),
    ]
    buttons = []
    for code, label in langs:
        prefix = "✅ " if code == current_lang else ""
        buttons.append(
            InlineKeyboardButton(
                text=f"{prefix}{label}",
                callback_data=f"set_lang:{code}",
            )
        )
    return InlineKeyboardMarkup(inline_keyboard=[buttons])


@router.message(CommandStart())
async def cmd_start(message: Message, current_user: User, _: Callable) -> None:
    keyboard = build_language_keyboard(current_user.language)
    await message.answer(
        text=_("welcome"),
        reply_markup=keyboard,
        parse_mode="HTML",
    )


@router.message(Command("help"))
async def cmd_help(message: Message, _: Callable) -> None:
    await message.answer(
        text=_("help_text"),
        parse_mode="HTML",
    )


@router.message(Command("profile", "status"))
async def cmd_profile(message: Message, current_user: User, _: Callable) -> None:
    tier_label = "💎 PRO (Unlim + Gemini 2.5 Pro)" if current_user.tier == "PRO" else "🆓 FREE (20 запросов/день)"
    limit = 999999 if current_user.tier == "PRO" else 20
    limit_str = "∞" if current_user.tier == "PRO" else str(limit)
    mode_label = MODE_LABELS.get(current_user.active_mode, current_user.active_mode)

    text = _(
        "profile_text",
        user_id=current_user.id,
        tier=tier_label,
        used=current_user.daily_requests_count,
        limit=limit_str,
        mode=mode_label,
        lang=current_user.language.upper(),
    )
    await message.answer(text=text, parse_mode="HTML")


@router.message(Command("lang", "language"))
async def cmd_language(message: Message, current_user: User) -> None:
    keyboard = build_language_keyboard(current_user.language)
    await message.answer(
        "🌐 Выберите язык интерфейса / Тілді таңдаңыз / Choose language:",
        reply_markup=keyboard,
    )


@router.callback_query(F.data.startswith("set_lang:"))
async def process_lang_selection(
    callback: CallbackQuery,
    current_user: User,
    db_session: AsyncSession,
    _: Callable,
) -> None:
    lang_code = callback.data.split(":", 1)[1]
    if lang_code not in ("ru", "kk", "en"):
        await callback.answer("Unsupported language", show_alert=True)
        return

    current_user.language = lang_code
    await db_session.commit()

    lang_messages = {
        "ru": "🇷🇺 Язык успешно изменён на Русский!\n\nНапишите любой вопрос или используйте /mode для выбора режима работы.",
        "kk": "🇰🇿 Тіл Қазақшаға сәтті ауыстырылды!\n\nКез келген сұрақ қойыңыз немесе жұмыс режимін таңдау үшін /mode пәрменін пайдаланыңыз.",
        "en": "🇬🇧 Language switched to English!\n\nAsk me anything or use /mode to select my operating persona.",
    }

    if callback.message:
        await callback.message.edit_text(
            text=lang_messages.get(lang_code, lang_messages["ru"]),
            reply_markup=build_language_keyboard(lang_code),
        )
    await callback.answer()
