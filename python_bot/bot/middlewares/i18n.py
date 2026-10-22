import json
import os
from typing import Callable, Dict, Any, Awaitable
from aiogram import BaseMiddleware
from aiogram.types import TelegramObject

DEFAULT_LOCALES: dict[str, dict[str, str]] = {
    "ru": {
        "welcome": "Привет! Я Sana AI — твой второй мозг для учёбы и работы.",
        "mode_changed": "Режим изменен на {mode}",
        "limit_reached": "Дневной лимит 20 запросов исчерпан. Обновится в 00:00.",
        "pro_activated": "Sana Pro активирован! Безлимитный доступ открыт.",
        "reminder_set": "Напоминание установлено на {time}: {title}",
        "file_analyzed": "Документ разобран. Вот конспект и вопросы для самопроверки."
    },
    "kk": {
        "welcome": "Сәлем! Мен Sana AI — оқу мен жұмысқа арналған екінші миыңмын.",
        "mode_changed": "Режим ауыстырылды: {mode}",
        "limit_reached": "Күндізгі 20 сұраныс лимиті бітті. Сағат 00:00-де жаңарады.",
        "pro_activated": "Sana Pro белсендірілді! Шексіз мүмкіндіктер ашық.",
        "reminder_set": "Еске салғыш сақталды: {time} - {title}",
        "file_analyzed": "Құжат талданды. Міне қысқаша мазмұны мен тексеру сұрақтары."
    },
    "en": {
        "welcome": "Hello! I am Sana AI — your second brain for study and work.",
        "mode_changed": "Mode switched to {mode}",
        "limit_reached": "Daily limit of 20 queries reached. Resets at 00:00.",
        "pro_activated": "Sana Pro activated! Unlimited access is now active.",
        "reminder_set": "Reminder saved for {time}: {title}",
        "file_analyzed": "Document parsed. Here is your summary and quiz."
    }
}

LOCALES: dict[str, dict[str, str]] = {k: dict(v) for k, v in DEFAULT_LOCALES.items()}
LOCALES_DIR = os.path.join(os.path.dirname(__file__), "..", "locales")


def load_locales() -> None:
    for lang in ["ru", "kk", "en"]:
        filepath = os.path.join(LOCALES_DIR, f"{lang}.json")
        if os.path.exists(filepath):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    LOCALES[lang] = {**DEFAULT_LOCALES[lang], **json.load(f)}
            except Exception:
                LOCALES[lang] = dict(DEFAULT_LOCALES[lang])


load_locales()


class I18nMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: Dict[str, Any]
    ) -> Any:
        user = data.get("current_user")
        user_lang = user.language if user and user.language in LOCALES else "ru"
        locale_data = LOCALES.get(user_lang, LOCALES["ru"])

        def get_text(key: str, **kwargs: Any) -> str:
            text = locale_data.get(key, DEFAULT_LOCALES["ru"].get(key, key))
            if kwargs:
                try:
                    return text.format(**kwargs)
                except Exception:
                    return text
            return text

        data["_"] = get_text
        data["lang"] = user_lang
        return await handler(event, data)
