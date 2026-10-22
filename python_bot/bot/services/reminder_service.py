import asyncio
from datetime import datetime, timezone
import inspect
import json
import zoneinfo
from aiogram import Bot
from google import genai
from google.genai import types
import structlog

from bot.config import config
import bot.core.database as db_core
from bot.repositories.reminder_repo import ReminderRepository
from bot.utils.markdown_escaper import escape_markdown_v2

logger = structlog.get_logger(__name__)

PARSER_PROMPT = """
Ты — парсер напоминаний из естественного языка.
Текущее локальное время пользователя: {now_str}.
Часовой пояс пользователя: {timezone}.

Твоя задача — извлечь из фразы пользователя:
1. Текст напоминания (что сделать).
2. Точное локальное время наступления события в формате ISO 8601 (YYYY-MM-DDTHH:MM:SS).

Верни ответ ТОЛЬКО в формате JSON:
{{
  "title": "название напоминания",
  "datetime_iso": "2026-10-23T10:00:00"
}}
Если пользователь не указал дату или время, верни {{"error": "no_datetime"}}.
"""


async def parse_natural_reminder(user_text: str, user_tz: str) -> dict | None:
    try:
        tz = zoneinfo.ZoneInfo(user_tz)
    except Exception:
        tz = zoneinfo.ZoneInfo("Asia/Almaty")

    now_local = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
    client = genai.Client(api_key=config.GEMINI_API_KEY.get_secret_value())

    try:
        res_or_coro = client.aio.models.generate_content(
            model=config.GEMINI_FLASH_MODEL,
            contents=[user_text],
            config=types.GenerateContentConfig(
                system_instruction=PARSER_PROMPT.format(now_str=now_local, timezone=user_tz),
                temperature=0.1,
                response_mime_type="application/json"
            )
        )
        response = await res_or_coro if inspect.isawaitable(res_or_coro) else res_or_coro
        if not response or not getattr(response, "text", None):
            return None
        return json.loads(response.text)
    except Exception as e:
        logger.error("parse_reminder_failed", error=str(e))
        return None


async def reminder_checker_loop(bot: Bot) -> None:
    """
    Фоновый цикл проверки наступивших напоминаний раз в 30 секунд.
    """
    while True:
        try:
            now_utc = datetime.now(timezone.utc)
            async with db_core.async_session_maker() as session:
                repo = ReminderRepository(session)
                due_reminders = await repo.get_due_reminders(current_utc=now_utc, limit=50)

                for reminder in due_reminders:
                    try:
                        safe_title = escape_markdown_v2(reminder.title)
                        text = (
                            f"🔔 *Напоминание от Sana AI\\!*\n\n"
                            f"📌 {safe_title}\n\n"
                            f"Сфокусируйся на задаче — у тебя всё получится\\!"
                        )
                        await bot.send_message(
                            chat_id=reminder.user_id,
                            text=text,
                            parse_mode="MarkdownV2"
                        )
                        reminder.is_completed = True
                    except Exception as send_err:
                        logger.warning(
                            "failed_to_send_reminder",
                            reminder_id=reminder.id,
                            error=str(send_err)
                        )
                        # Помечаем завершенным при блокировке бота пользователем, чтобы не зацикливать очередь
                        if "blocked" in str(send_err).lower() or "chat not found" in str(send_err).lower():
                            reminder.is_completed = True

                await session.commit()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("reminder_loop_error", error=str(e))

        await asyncio.sleep(30)
