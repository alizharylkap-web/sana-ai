# 🧠 Sana AI — Персональный ИИ-ментор и Коуч в Telegram

Production-ready Telegram-бот на базе **Python 3.11+**, **aiogram 3.x**, **FastAPI**, **Google Gemini API (`google-genai`)**, **PostgreSQL / SQLite (SQLAlchemy 2.0 Async)** и **Redis**.

## ✨ Ключевые возможности
- **5 специализированных режимов (`/mode`)**:
  - 🧠 **Ментор (Socratic)** — объясняет сложные концепции и задаёт наводящие вопросы.
  - 💻 **Программист (Senior Dev)** — пишет чистый код, проводит код-ревью и разбирает алгоритмы.
  - 📅 **Планировщик (GTD)** — декомпозирует цели на конкретные шаги.
  - 🎓 **Экзаменатор (Strict)** — проверяет знания по билетам и темам.
  - ✍️ **Редактор (Copywriter)** — улучшает стиль, структуру и убедительность текста.
- **Потоковая генерация (Streaming)** с защитой от `FloodWait` и безопасным конвертером Markdown -> Telegram HTML.
- **Долгосрочная память (`/memory`, `/forget`)** — автоматическое извлечение и запоминание фактов о пользователе в фоновом режиме.
- **Мультимодальность** — анализ PDF, DOCX, TXT, исходного кода, фотографий и голосовых сообщений (`voice`/`audio`).
- **Умный планировщик (`/plan`, `/reminders`)** — распознавание естественного языка (NLP) в точные даты + инлайн-кнопки выполнения и удаления.
- **Мультиязычность (`/lang`)** — Русский 🇷🇺, Қазақша 🇰🇿, English 🇬🇧.
- **Монетизация (`/subscribe`)** — встроенная оплата через **Telegram Stars (`XTR`)** с защитой от дублирования транзакций.
- **Панель администратора (`/admin`)** — статистика, выдача PRO (`/grant_pro`), блокировка (`/ban`, `/unban`) и рассылка (`/broadcast`).

## 🚀 Быстрый старт (Локальный запуск за 1 минуту)

Бот автоматически переключается на локальную базу **SQLite (`sana_ai.db`)** и **In-Memory FSM**, если PostgreSQL и Redis не запущены.

```bash
cd python_bot
cp .env.example .env
# Укажите ваш BOT_TOKEN и GEMINI_API_KEY в файле .env
pip install -r requirements.txt
python -m bot.main
```

## 🐳 Запуск в Production (Docker Compose + Webhook)

```bash
cd python_bot
cp .env.example .env
docker compose up -d --build
```

## 🧪 Запуск тестов

```bash
cd python_bot
pytest -v
```
