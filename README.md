# 🧠 Sana AI — Персональный ИИ-ментор и Telegram-бот Платформа

**Sana AI** — полнофункциональный ИИ-чат-бот для Telegram и интерактивная веб-платформа управления, симуляции и экспорта кода.

---

## ✨ Архитектура проекта

Проект состоит из двух синхронизированных частей:

1. **Веб-платформа и Live Telegram Engine ([`server.ts`](server.ts) + [`src/`](src/))**:
   - 📱 **Интерактивный Telegram-симулятор ([`TelegramSimulator.tsx`](src/components/TelegramSimulator.tsx))** — тестирование всех команд (`/start`, `/mode`, `/plan`, `/reminders`, `/memory`, `/forget`, `/clear`, `/profile`, `/subscribe`, `/export`, `/admin`), загрузка реальных файлов и фото, инлайн-клавиатуры и Live State Inspector.
   - 🔌 **Прямое подключение реального Telegram-бота (`@BotFather`)** — встроенный в [`server.ts`](server.ts) движок Long-Polling позволяет вставить токен от `@BotFather` прямо в веб-интерфейсе (кнопка **«API / Бот»**) или в `.env`, и бот мгновенно начнёт отвечать реальным пользователям в Telegram!
   - 💻 **Обозреватель кода и экспорт в `.ZIP` ([`CodeExplorer.tsx`](src/components/CodeExplorer.tsx))** — просмотр всех 51 файлов Python-бота с фильтрацией по слоям и скачиванием готового архива.
   - 🗄 **Схема базы данных ([`DatabaseSchemaView.tsx`](src/components/DatabaseSchemaView.tsx))** и **Архитектура + Запуск тестов ([`ArchitectureView.tsx`](src/components/ArchitectureView.tsx))**.
   - 🛡 **Панель администратора ([`AdminPanel.tsx`](src/components/AdminPanel.tsx))** — управление пользователями, выдача PRO, блокировка и рассылка.

2. **Автономный Production Python-бот ([`python_bot/`](python_bot/))**:
   - Стек: **Python 3.11+**, **aiogram 3.x**, **FastAPI** (Webhook + Healthcheck + Long-Polling CLI), **Google Gemini SDK (`google-genai`)**, **SQLAlchemy 2.0 Async** (`PostgreSQL` + автоматический fallback на локальный `SQLite`), **Redis** (с автоматическим In-Memory fallback), **APScheduler**.

---

## 🚀 Быстрый запуск Веб-платформы и Бота (Node.js)

```bash
npm install
cp .env.example .env
# При желании укажите GEMINI_API_KEY и BOT_TOKEN в .env (или прямо в веб-интерфейсе)
npm run dev
```
Откройте `http://localhost:3000` в браузере.

### Команды проверки и сборки:
```bash
npm test        # Запуск unit-тестов логики (MarkdownV2, квоты, анти-спам)
npm run lint    # Проверка типов TypeScript (tsc --noEmit)
npm run build   # Production-сборка фронтенда (Vite)
```

---

## 🐍 Запуск Python Telegram-бота (`python_bot/`)

### Вариант 1: Локальный запуск (Long-Polling + SQLite, без Docker)
```bash
cd python_bot
cp .env.example .env
# Укажите BOT_TOKEN и GEMINI_API_KEY в файле .env
pip install -r requirements.txt
python -m bot.main
```

### Вариант 2: Production-деплой (Docker Compose + PostgreSQL 16 + Redis 7 + FastAPI Webhook)
```bash
cd python_bot
cp .env.example .env
docker compose up -d --build
```
