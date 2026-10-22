import asyncio
import html
import logging
import time
from typing import Callable, Optional

from aiogram import Router, F, Bot
from aiogram.exceptions import TelegramBadRequest, TelegramRetryAfter
from aiogram.filters import Command
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
)
from sqlalchemy.ext.asyncio import AsyncSession

from bot.models.user import User
from bot.repositories.dialog_repo import DialogRepository
from bot.repositories.user_repo import UserRepository
from bot.services.gemini_service import gemini_service
from bot.services.memory_service import memory_service
from bot.utils.markdown_escaper import format_telegram_html, split_message

logger = logging.getLogger(__name__)
router = Router(name="dialog_router")


@router.message(Command("clear", "reset"))
async def cmd_clear_history(
    message: Message,
    current_user: User,
    db_session: AsyncSession,
    _: Callable,
) -> None:
    dialog_repo = DialogRepository(db_session)
    await dialog_repo.clear_user_messages(current_user.id)
    await db_session.commit()
    await message.answer(_("history_cleared"), parse_mode="HTML")


@router.message(Command("memory", "memories"))
async def cmd_show_memory(
    message: Message,
    current_user: User,
    db_session: AsyncSession,
    _: Callable,
) -> None:
    dialog_repo = DialogRepository(db_session)
    memories = await dialog_repo.get_user_memories(current_user.id)
    if not memories:
        await message.answer(_("memory_empty"), parse_mode="HTML")
        return

    text = f"{_('memory_header')}\n\n"
    for idx, mem in enumerate(memories, start=1):
        text += f"{idx}. • {html.escape(mem)}\n"

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🗑 Очистить память (/forget)",
                    callback_data="clear_memories",
                )
            ]
        ]
    )
    await message.answer(text, reply_markup=keyboard, parse_mode="HTML")


@router.message(Command("forget"))
async def cmd_forget_memories(
    message: Message,
    current_user: User,
    db_session: AsyncSession,
    _: Callable,
) -> None:
    dialog_repo = DialogRepository(db_session)
    await dialog_repo.clear_user_memories(current_user.id)
    await db_session.commit()
    await message.answer(_("memory_cleared"), parse_mode="HTML")


@router.callback_query(F.data == "clear_memories")
async def process_clear_memories_callback(
    callback: CallbackQuery,
    current_user: User,
    db_session: AsyncSession,
    _: Callable,
) -> None:
    dialog_repo = DialogRepository(db_session)
    await dialog_repo.clear_user_memories(current_user.id)
    await db_session.commit()
    if callback.message:
        await callback.message.edit_text(_("memory_cleared"), parse_mode="HTML")
    await callback.answer()


async def process_user_query_text(
    message: Message,
    bot: Bot,
    current_user: User,
    user_repo: UserRepository,
    db_session: AsyncSession,
    user_text: str,
    _: Optional[Callable] = None,
) -> None:
    """
    Core text processing pipeline shared by text messages and voice transcriptions.
    Checks quota, streams Gemini response with flood-safe message editing,
    saves dialog history, deducts quota on success, and extracts background facts.
    """
    # 1. Pre-check Quota
    has_quota = await user_repo.check_quota_precondition(current_user)
    if not has_quota:
        msg = (
            _("quota_exceeded")
            if _
            else "⚠️ Вы исчерпали дневной лимит бесплатных запросов (20/20).\n\nПерейдите на <b>Sana PRO</b> (/subscribe), чтобы получить безлимитный доступ!"
        )
        await message.answer(msg, parse_mode="HTML")
        return

    dialog_repo = DialogRepository(db_session)

    # 2. Fetch context & memories
    context_messages = await dialog_repo.get_recent_context(current_user.id, limit=15)
    memories = await dialog_repo.get_user_memories(current_user.id)

    # 3. Save user message
    await dialog_repo.add_message(current_user.id, "user", user_text)
    await db_session.commit()

    # 4. Send initial placeholder
    thinking_text = _("thinking") if _ else "⏳ <i>Sana думает...</i>"
    sent_msg = await message.answer(thinking_text, parse_mode="HTML")
    await bot.send_chat_action(chat_id=message.chat.id, action="typing")

    full_response = ""
    last_edit_time = time.monotonic()
    edit_interval = 1.5
    generation_succeeded = False

    try:
        async for chunk in gemini_service.generate_response_stream(
            user=current_user,
            context_messages=context_messages,
            memories=memories,
            user_message=user_text,
        ):
            full_response += chunk
            generation_succeeded = True
            current_time = time.monotonic()

            if current_time - last_edit_time >= edit_interval and len(full_response) <= 3800:
                try:
                    preview_html = format_telegram_html(full_response) + " ▌"
                    await sent_msg.edit_text(preview_html, parse_mode="HTML")
                    last_edit_time = current_time
                except TelegramRetryAfter as e:
                    await asyncio.sleep(e.retry_after)
                except TelegramBadRequest:
                    try:
                        await sent_msg.edit_text(full_response[:3900] + " ▌", parse_mode=None)
                        last_edit_time = current_time
                    except Exception:
                        pass

        if not full_response.strip():
            full_response = "Извините, не удалось сформировать ответ. Попробуйте переформулировать вопрос."

        # 5. Final edit with splitting for long messages (>4000 chars)
        chunks = split_message(full_response, max_length=3900)
        first_chunk_html = format_telegram_html(chunks[0])
        try:
            await sent_msg.edit_text(first_chunk_html, parse_mode="HTML")
        except TelegramBadRequest:
            await sent_msg.edit_text(chunks[0], parse_mode=None)

        for extra_chunk in chunks[1:]:
            try:
                await message.answer(format_telegram_html(extra_chunk), parse_mode="HTML")
            except TelegramBadRequest:
                await message.answer(extra_chunk, parse_mode=None)

        # 6. Deduct quota and save model response
        if generation_succeeded:
            await user_repo.atomic_consume_quota(current_user.id, limit=20)
            await dialog_repo.add_message(current_user.id, "model", full_response)
            await db_session.commit()

            # 7. Background memory extraction using its own independent DB session
            asyncio.create_task(
                memory_service.extract_and_save_facts(
                    user_id=current_user.id,
                    user_message=user_text,
                    bot_response=full_response,
                )
            )

    except Exception as e:
        logger.error(f"Dialog error for user {current_user.id}: {e}")
        await sent_msg.edit_text(
            "⚠️ Произошла ошибка при генерации ответа. Ваша квота не была списана."
        )


@router.message(F.text & ~F.text.startswith("/"))
async def handle_user_text(
    message: Message,
    bot: Bot,
    current_user: User,
    user_repo: UserRepository,
    db_session: AsyncSession,
    _: Callable,
) -> None:
    if not message.text:
        return
    await process_user_query_text(
        message=message,
        bot=bot,
        current_user=current_user,
        user_repo=user_repo,
        db_session=db_session,
        user_text=message.text,
        _=_,
    )
