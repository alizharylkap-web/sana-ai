import asyncio
import io
from typing import Callable

from aiogram import Router, F, Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import Message
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from bot.core.prompts_cache import get_cached_system_prompt
from bot.handlers.dialog import gemini_service
from bot.models.user import User
from bot.repositories.dialog_repo import DialogRepository
from bot.repositories.user_repo import UserRepository
from bot.services.document_service import DocumentService
from bot.utils.markdown_escaper import format_telegram_html, split_message

logger = structlog.get_logger(__name__)
router = Router(name="files_router")
document_service = DocumentService()


@router.message(F.document | F.photo)
async def handle_files_and_photos(
    message: Message,
    bot: Bot,
    current_user: User,
    user_repo: UserRepository,
    db_session: AsyncSession,
    _: Callable,
) -> None:
    allowed, _ = await user_repo.check_quota_precondition(current_user)
    if not allowed:
        await message.answer(_("quota_exceeded"), parse_mode="HTML")
        return

    status_msg = await message.answer(
        "📥 <i>Загружаю и анализирую файл...</i>",
        parse_mode="HTML",
    )
    prompt = message.caption or "Проанализируй этот материал, выдели ключевые тезисы и сделай подробное резюме."
    dialog_repo = DialogRepository(db_session)

    try:
        if message.photo:
            photo = message.photo[-1]
            if photo.file_size and photo.file_size > 20 * 1024 * 1024:
                await status_msg.edit_text("⚠️ Изображение слишком большое (максимум 20 МБ).")
                return

            file_info = await bot.get_file(photo.file_id)
            file_bytes_io = io.BytesIO()
            await bot.download_file(file_info.file_path, destination=file_bytes_io)

            sys_prompt = get_cached_system_prompt(current_user.language, current_user.mode)
            response = await gemini_service.analyze_image_bytes(
                image_bytes=file_bytes_io.getvalue(),
                caption_prompt=prompt,
                system_prompt=sys_prompt,
                mime_type="image/jpeg",
            )
            user_context_entry = f"[Загружено изображение] Запрос: {prompt}"

        elif message.document:
            doc = message.document
            max_mb = 50 if current_user.is_pro else 20
            if doc.file_size and doc.file_size > max_mb * 1024 * 1024:
                await status_msg.edit_text(f"⚠️ Файл слишком большой (максимум {max_mb} МБ).")
                return

            file_info = await bot.get_file(doc.file_id)
            file_bytes_io = io.BytesIO()
            await bot.download_file(file_info.file_path, destination=file_bytes_io)
            raw_bytes = file_bytes_io.getvalue()

            mime = doc.mime_type or ""
            file_name = doc.file_name or "document"
            lower_name = file_name.lower()

            if mime == "application/pdf" or lower_name.endswith(".pdf"):
                extracted_text = await asyncio.to_thread(document_service.extract_text_from_pdf, raw_bytes)
            elif "wordprocessingml" in mime or lower_name.endswith(".docx"):
                extracted_text = await asyncio.to_thread(document_service.extract_text_from_docx, raw_bytes)
            elif mime.startswith("text/") or lower_name.endswith((".txt", ".md", ".py", ".js", ".ts", ".json", ".csv")):
                extracted_text = await asyncio.to_thread(document_service.extract_text_from_txt, raw_bytes)
            else:
                await status_msg.edit_text(
                    "⚠️ Формат не поддерживается. Я понимаю PDF, DOCX, TXT, исходный код и изображения (JPG/PNG)."
                )
                return

            response = await document_service.analyze_document(text=extracted_text, filename=file_name)
            user_context_entry = f"[Загружен файл {file_name}] Запрос: {prompt}"
        else:
            return

        # Save to dialog history and deduct quota
        await user_repo.atomic_consume_quota(current_user.telegram_id, current_user.timezone)
        await dialog_repo.add_message(
            user_id=current_user.telegram_id,
            role="user",
            content=user_context_entry,
            mode=current_user.mode,
        )
        await dialog_repo.add_message(
            user_id=current_user.telegram_id,
            role="model",
            content=response,
            mode=current_user.mode,
        )
        await db_session.commit()

        chunks = split_message(response, max_length=3900)
        try:
            await status_msg.edit_text(format_telegram_html(chunks[0]), parse_mode="HTML")
        except TelegramBadRequest:
            await status_msg.edit_text(chunks[0], parse_mode=None)

        for extra_chunk in chunks[1:]:
            try:
                await message.answer(format_telegram_html(extra_chunk), parse_mode="HTML")
            except TelegramBadRequest:
                await message.answer(extra_chunk, parse_mode=None)

    except Exception as e:
        logger.error("file_handling_error", user_id=current_user.telegram_id, error=str(e))
        await status_msg.edit_text("⚠️ Произошла ошибка при чтении или анализе файла.")
