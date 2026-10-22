import io
import logging
from typing import Callable

from aiogram import Router, F, Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import Message
from sqlalchemy.ext.asyncio import AsyncSession

from bot.models.user import User
from bot.repositories.dialog_repo import DialogRepository
from bot.repositories.user_repo import UserRepository
from bot.services.document_service import document_service
from bot.services.gemini_service import gemini_service
from bot.utils.markdown_escaper import format_telegram_html, split_message

logger = logging.getLogger(__name__)
router = Router(name="files_router")


@router.message(F.document | F.photo)
async def handle_files_and_photos(
    message: Message,
    bot: Bot,
    current_user: User,
    user_repo: UserRepository,
    db_session: AsyncSession,
    _: Callable,
) -> None:
    # 1. Quota check
    has_quota = await user_repo.check_quota_precondition(current_user)
    if not has_quota:
        await message.answer(_("quota_exceeded"), parse_mode="HTML")
        return

    status_msg = await message.answer(
        "📥 <i>Загружаю и анализирую файл...</i>",
        parse_mode="HTML",
    )
    prompt = message.caption or "Проанализируй этот файл, выдели ключевые тезисы и сделай подробное резюме."
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

            response = await gemini_service.analyze_media(
                file_bytes=file_bytes_io.getvalue(),
                mime_type="image/jpeg",
                prompt=prompt,
                user=current_user,
            )
            user_context_entry = f"[Загружено изображение] Запрос: {prompt}"

        elif message.document:
            doc = message.document
            if doc.file_size and doc.file_size > 20 * 1024 * 1024:
                await status_msg.edit_text("⚠️ Файл слишком большой (максимум 20 МБ).")
                return

            file_info = await bot.get_file(doc.file_id)
            file_bytes_io = io.BytesIO()
            await bot.download_file(file_info.file_path, destination=file_bytes_io)
            raw_bytes = file_bytes_io.getvalue()

            mime = doc.mime_type or ""
            file_name = doc.file_name or "document"
            lower_name = file_name.lower()

            if mime == "application/pdf" or lower_name.endswith(".pdf"):
                response = await gemini_service.analyze_media(
                    file_bytes=raw_bytes,
                    mime_type="application/pdf",
                    prompt=prompt,
                    user=current_user,
                )
            elif (
                "wordprocessingml" in mime
                or lower_name.endswith(".docx")
                or mime.startswith("text/")
                or lower_name.endswith((".txt", ".md", ".py", ".js", ".ts", ".json", ".csv"))
            ):
                if lower_name.endswith(".docx") or "wordprocessingml" in mime:
                    extracted_text = await document_service.extract_text_from_docx(raw_bytes)
                else:
                    extracted_text = await document_service.extract_text_from_txt(raw_bytes)

                full_prompt = f"Содержимое документа ({file_name}):\n\n{extracted_text[:25000]}\n\nЗадание: {prompt}"
                context = await dialog_repo.get_recent_context(current_user.id, limit=5)
                memories = await dialog_repo.get_user_memories(current_user.id)

                response = ""
                async for chunk in gemini_service.generate_response_stream(
                    user=current_user,
                    context_messages=context,
                    memories=memories,
                    user_message=full_prompt,
                ):
                    response += chunk
            else:
                await status_msg.edit_text(
                    "⚠️ Формат не поддерживается. Я понимаю PDF, DOCX, TXT, код и изображения (JPG/PNG)."
                )
                return

            user_context_entry = f"[Загружен файл {file_name}] Запрос: {prompt}"
        else:
            return

        # Save to dialog history and deduct quota
        await user_repo.atomic_consume_quota(current_user.id, limit=20)
        await dialog_repo.add_message(current_user.id, "user", user_context_entry)
        await dialog_repo.add_message(current_user.id, "model", response)
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
        logger.error(f"File handling error for user {current_user.id}: {e}")
        await status_msg.edit_text("⚠️ Произошла ошибка при чтении или анализе файла.")
