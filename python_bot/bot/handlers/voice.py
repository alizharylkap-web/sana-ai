import html
import io
from typing import Callable

from aiogram import Router, F, Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import Message
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from bot.handlers.dialog import process_user_query_text, gemini_service
from bot.models.user import User
from bot.repositories.user_repo import UserRepository

logger = structlog.get_logger(__name__)
router = Router(name="voice_router")


@router.message(F.voice | F.audio)
async def handle_voice_message(
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

    media = message.voice or message.audio
    if not media:
        return

    if media.file_size and media.file_size > 20 * 1024 * 1024:
        await message.answer("⚠️ Аудиофайл слишком большой (максимум 20 МБ).")
        return

    status_msg = await message.answer(
        "🎙 <i>Слушаю и транскрибирую голосовое сообщение...</i>",
        parse_mode="HTML",
    )

    try:
        file_info = await bot.get_file(media.file_id)
        if not file_info.file_path:
            await status_msg.edit_text("⚠️ Не удалось получить аудиофайл от серверов Telegram.")
            return

        file_bytes_io = io.BytesIO()
        await bot.download_file(file_info.file_path, destination=file_bytes_io)
        audio_bytes = file_bytes_io.getvalue()

        mime_type = getattr(media, "mime_type", None) or "audio/ogg"
        transcription = await gemini_service.transcribe_audio_bytes(
            audio_bytes=audio_bytes,
            mime_type=mime_type,
        )
        transcription = (transcription or "").strip()

        if not transcription:
            await status_msg.edit_text("⚠️ Не удалось распознать речь в аудиосообщении.")
            return

        safe_transcription = html.escape(transcription)
        try:
            await status_msg.edit_text(
                f"🎙 <b>Вы сказали:</b>\n<i>«{safe_transcription}»</i>",
                parse_mode="HTML",
            )
        except TelegramBadRequest:
            await status_msg.edit_text(f"🎙 Вы сказали:\n«{transcription}»", parse_mode=None)

        # Process recognized text through the shared dialog pipeline
        await process_user_query_text(
            message=message,
            bot=bot,
            current_user=current_user,
            user_repo=user_repo,
            db_session=db_session,
            user_text=transcription,
            _=_,
        )

    except Exception as e:
        logger.error("voice_handling_error", user_id=current_user.telegram_id, error=str(e))
        await status_msg.edit_text("⚠️ Ошибка при обработке голосового сообщения.")
