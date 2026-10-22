import asyncio
import inspect
from typing import AsyncGenerator
from google import genai
from google.genai import types
import structlog
from bot.config import config

logger = structlog.get_logger(__name__)


class GeminiService:
    """
    Высоконадежный сервис для генерации контента через Google Gen AI SDK.
    Поддерживает стриминг ответов, мультимодальность (фото, аудио, файлы),
    exponential backoff и автоматический fallback с Pro на Flash.
    """
    def __init__(self):
        self.client = genai.Client(api_key=config.GEMINI_API_KEY.get_secret_value())
        self.flash_model = config.GEMINI_FLASH_MODEL
        self.pro_model = config.GEMINI_PRO_MODEL

    async def generate_response_stream(
        self,
        system_prompt: str,
        contents: list[types.Content],
        use_pro: bool = False,
        temperature: float = 0.7,
    ) -> AsyncGenerator[str, None]:
        """
        Генерирует ответ потоково (streaming). При ошибке Pro модели автоматически
        переключается на резервную модель Flash.
        """
        target_model = self.pro_model if use_pro else self.flash_model
        max_retries = 3
        backoff = 1.0

        for attempt in range(1, max_retries + 1):
            try:
                config_params = types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=temperature,
                    safety_settings=[
                        types.SafetySetting(
                            category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                            threshold=types.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                        ),
                        types.SafetySetting(
                            category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
                            threshold=types.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                        ),
                        types.SafetySetting(
                            category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                            threshold=types.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                        ),
                    ]
                )

                stream_or_coro = self.client.aio.models.generate_content_stream(
                    model=target_model,
                    contents=contents,
                    config=config_params
                )
                response_stream = (
                    await stream_or_coro
                    if inspect.isawaitable(stream_or_coro)
                    else stream_or_coro
                )

                async for chunk in response_stream:
                    if chunk and getattr(chunk, "text", None):
                        yield chunk.text
                return

            except Exception as e:
                logger.warning(
                    "gemini_stream_attempt_failed",
                    attempt=attempt,
                    model=target_model,
                    error=str(e)
                )

                # Fallback с Pro на Flash (или если они совпадают в конфиге — пробуем снова на Flash)
                if use_pro and attempt == 1:
                    logger.info("falling_back_to_flash_model")
                    target_model = self.flash_model
                    continue

                if attempt == max_retries:
                    logger.error("gemini_stream_exhausted_retries", error=str(e))
                    yield "⚠️ Произошла временная задержка соединения с нейросетью. Попробуй повторить запрос через минуту."
                    return

                await asyncio.sleep(backoff)
                backoff *= 2.0

    async def transcribe_audio_bytes(self, audio_bytes: bytes, mime_type: str = "audio/ogg") -> str:
        """
        Транскрибирует голосовое сообщение с помощью мультимодальности Gemini.
        """
        try:
            prompt = (
                "Дословно и точно расшифруй это аудиосообщение на том языке, на котором оно сказано. "
                "Выведи только текст расшифровки без лишних фраз."
            )
            res_or_coro = self.client.aio.models.generate_content(
                model=self.flash_model,
                contents=[
                    types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
                    prompt
                ]
            )
            response = await res_or_coro if inspect.isawaitable(res_or_coro) else res_or_coro
            return response.text.strip() if response and response.text else ""
        except Exception as e:
            logger.error("audio_transcription_error", error=str(e))
            return ""

    async def analyze_image_bytes(
        self,
        image_bytes: bytes,
        caption_prompt: str,
        system_prompt: str | None = None,
        mime_type: str = "image/jpeg"
    ) -> str:
        """
        Разбирает конспект, задачу, формулу, код или схему по фотографии.
        """
        try:
            cfg = types.GenerateContentConfig(
                system_instruction=system_prompt or "Ты — Sana AI, умный академический наставник.",
                temperature=0.4
            )
            res_or_coro = self.client.aio.models.generate_content(
                model=self.flash_model,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    caption_prompt or "Проанализируй это изображение, объясни материал или реши задачу пошагово."
                ],
                config=cfg
            )
            response = await res_or_coro if inspect.isawaitable(res_or_coro) else res_or_coro
            return response.text.strip() if response and response.text else "Не удалось разобрать изображение."
        except Exception as e:
            logger.error("image_analysis_error", error=str(e))
            return "Ошибка анализа изображения. Пожалуйста, убедитесь в четкости снимка."
