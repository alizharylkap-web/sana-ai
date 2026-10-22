import os
import structlog

logger = structlog.get_logger(__name__)

SYSTEM_PROMPTS: dict[str, str] = {}
MODE_PROMPTS: dict[str, str] = {}


def load_prompts_cache(base_dir: str | None = None) -> None:
    """
    Загружает системные промпты и промпты режимов с диска один раз при старте
    приложения и кэширует их в памяти для исключения дискового I/O в горячем цикле.
    """
    if base_dir is None:
        base_dir = os.path.join(os.path.dirname(__file__), "..", "..", "prompts")
    base_dir = os.path.abspath(base_dir)

    # 1. Системные промпты по языкам
    for lang in ["ru", "kk", "en"]:
        file_path = os.path.join(base_dir, f"system_{lang}.txt")
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                SYSTEM_PROMPTS[lang] = f.read().strip()
        else:
            SYSTEM_PROMPTS[lang] = "Ты — Sana AI, умный персональный наставник и второй мозг для учёбы и работы."

    # 2. Модификаторы режимов
    for mode in ["mentor", "editor", "planner", "examiner", "coder"]:
        file_path = os.path.join(base_dir, f"mode_{mode}.txt")
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                MODE_PROMPTS[mode] = f.read().strip()
        else:
            MODE_PROMPTS[mode] = ""

    logger.info(
        "prompts_cache_loaded",
        languages=list(SYSTEM_PROMPTS.keys()),
        modes=list(MODE_PROMPTS.keys())
    )


def get_cached_system_prompt(language: str, mode: str) -> str:
    """
    Возвращает скомпонованный системный промпт из оперативной памяти без обращений к диску.
    """
    base_sys = SYSTEM_PROMPTS.get(language, SYSTEM_PROMPTS.get("ru", "Ты — Sana AI."))
    mode_text = MODE_PROMPTS.get(mode, "")
    if mode_text:
        return f"{base_sys}\n\n{mode_text}"
    return base_sys
