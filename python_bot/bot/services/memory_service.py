import inspect
import json
from google import genai
from google.genai import types
import structlog
from bot.config import config
import bot.core.database as db_core
from bot.repositories.dialog_repo import DialogRepository

logger = structlog.get_logger(__name__)

MEMORY_EXTRACTION_PROMPT = """
Ты — алгоритм анализа профиля пользователя.
Твоя задача — извлечь из последних сообщений диалога постоянные факты о пользователе:
- Университет, курс, специальность
- Изучаемые дисциплины или технологии
- Цели, проекты, профессия
- Предпочтения и привычки

Правила:
1. Игнорируй сиюминутные фразы ("я устал", "привет", "спасибо").
2. Формулируй факт кратко, емко, от третьего лица ("Учится на 3 курсе IT", "Пишет диплом по машинному обучению").
3. Верни JSON список строк: ["факт 1", "факт 2"]. Если новых постоянных фактов нет, верни пустой список [].
"""


class MemoryService:
    def __init__(self, dialog_repo: DialogRepository | None = None):
        self.dialog_repo = dialog_repo
        self.client = genai.Client(api_key=config.GEMINI_API_KEY.get_secret_value())

    async def _run_with_repo(self, repo: DialogRepository, user_id: int) -> None:
        recent_msgs = await repo.get_recent_messages(user_id, limit=8)
        if not recent_msgs:
            return

        dialog_text = "\n".join([f"{m.role}: {m.content}" for m in recent_msgs])

        res_or_coro = self.client.aio.models.generate_content(
            model=config.GEMINI_FLASH_MODEL,
            contents=[dialog_text],
            config=types.GenerateContentConfig(
                system_instruction=MEMORY_EXTRACTION_PROMPT,
                temperature=0.2,
                response_mime_type="application/json"
            )
        )
        response = await res_or_coro if inspect.isawaitable(res_or_coro) else res_or_coro

        if not response or not getattr(response, "text", None):
            return

        facts = json.loads(response.text)
        if isinstance(facts, list):
            for fact in facts:
                if isinstance(fact, str) and len(fact.strip()) > 5:
                    await repo.add_memory(user_id, fact.strip())
                    logger.info("long_term_fact_saved", user_id=user_id, fact=fact.strip())

    async def extract_and_save_facts(self, user_id: int) -> None:
        """
        Запускается раз в N сообщений для фонового извлечения долговременных фактов.
        Если репозиторий не передан извне, открывает собственную изолированную сессию БД.
        """
        try:
            if self.dialog_repo is not None:
                await self._run_with_repo(self.dialog_repo, user_id)
            else:
                async with db_core.async_session_maker() as session:
                    repo = DialogRepository(session)
                    await self._run_with_repo(repo, user_id)
                    await session.commit()
        except Exception as e:
            logger.warning("memory_extraction_failed", user_id=user_id, error=str(e))
