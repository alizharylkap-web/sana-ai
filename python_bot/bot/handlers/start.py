from typing import Callable
from aiogram import Router, F
from aiogram.filters import CommandStart, Command, CommandObject
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from sqlalchemy.ext.asyncio import AsyncSession

from bot.config import config
from bot.models.user import User
from bot.repositories.user_repo import UserRepository

router = Router(name="start_router")

MODE_LABELS = {
    "mentor": "🎓 Наставник (Socratic)",
    "coder": "💻 Кодер (Senior Dev)",
    "planner": "📅 Планировщик (GTD)",
    "examiner": "📝 Экзаменатор (Strict)",
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
async def cmd_start(
    message: Message,
    command: CommandObject,
    current_user: User,
    user_repo: UserRepository,
    db_session: AsyncSession,
    _: Callable,
) -> None:
    if command.args and not current_user.referred_by_id:
        ref_user = await user_repo.get_by_referral_code(command.args.strip())
        if ref_user and ref_user.telegram_id != current_user.telegram_id:
            current_user.referred_by_id = ref_user.telegram_id
            ref_user.bonus_queries += config.REFERRAL_BONUS_QUERIES
            ref_user.referral_count += 1
            await db_session.commit()

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
async def cmd_profile(
    message: Message,
    current_user: User,
    user_repo: UserRepository,
    _: Callable,
) -> None:
    _, remaining = await user_repo.check_quota_precondition(current_user)
    tier_label = (
        "💎 Sana PRO (Безлимит + Gemini 2.5 Pro)"
        if current_user.is_pro
        else f"🆓 FREE ({config.FREE_DAILY_LIMIT} запросов/день)"
    )
    limit_str = "∞" if current_user.is_pro else str(config.FREE_DAILY_LIMIT + current_user.bonus_queries)
    mode_label = MODE_LABELS.get(current_user.mode, current_user.mode)

    text = _(
        "profile_text",
        user_id=current_user.telegram_id,
        tier=tier_label,
        used=current_user.queries_used_today,
        limit=limit_str,
        mode=mode_label,
        lang=current_user.language.upper(),
    )
    ref_link = f"https://t.me/{config.BOT_USERNAME}?start={current_user.referral_code}"
    text += f"\n🎁 Бонусных запросов: <b>{current_user.bonus_queries}</b>\n🔗 Реферальная ссылка: <code>{ref_link}</code>"
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
