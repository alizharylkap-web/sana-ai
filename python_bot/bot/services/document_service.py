import inspect
import io
from google import genai
from google.genai import types
import structlog
from bot.config import config

logger = structlog.get_logger(__name__)

DOC_STUDY_PROMPT = """
Ты — умный академический ассистент Sana AI.
Тебе предоставлен учебный или рабочий документ.
Сделай полный структурированный разбор:

1. 🎯 **Краткая суть (Executive Summary)**: 2-3 абзаца о главном.
2. 🔑 **Ключевые тезисы**: 5-7 маркированных пунктов.
3. 📝 **Вопросы для самопроверки**: 3 вопроса с 4 вариантами ответа (A, B, C, D) и правильными ответами в конце.

Форматируй ответ аккуратно для Telegram (разборчиво, со списками).
"""


class DocumentService:
    def __init__(self):
        self.client = genai.Client(api_key=config.GEMINI_API_KEY.get_secret_value())

    def extract_text_from_pdf(self, file_bytes: bytes) -> str:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in reader.pages[:40]:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text

    def extract_text_from_docx(self, file_bytes: bytes) -> str:
        from docx import Document
        doc = Document(io.BytesIO(file_bytes))
        return "\n".join([p.text for p in doc.paragraphs if p.text])

    def extract_text_from_txt(self, file_bytes: bytes) -> str:
        return file_bytes.decode("utf-8", errors="ignore")

    async def analyze_document(self, text: str, filename: str = "document") -> str:
        if not text.strip():
            return "Файл пуст или содержит только отсканированные изображения без слоя текста."

        truncated = text[:80000]
        prompt_content = f"Документ: {filename}\n\n{truncated}"

        res_or_coro = self.client.aio.models.generate_content(
            model=config.GEMINI_FLASH_MODEL,
            contents=[prompt_content],
            config=types.GenerateContentConfig(
                system_instruction=DOC_STUDY_PROMPT,
                temperature=0.3
            )
        )
        response = await res_or_coro if inspect.isawaitable(res_or_coro) else res_or_coro
        return response.text if response and getattr(response, "text", None) else "Не удалось проанализировать документ."
