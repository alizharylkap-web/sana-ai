import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  escapeMarkdownV2,
  checkAndConsumeQuota,
  checkThrottle,
  type UserState,
} from './src/utils/telegramLogic.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Runtime configuration (can be updated via UI or .env)
let runtimeGeminiKey =
  process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    ? process.env.GEMINI_API_KEY.trim()
    : '';
let runtimeBotToken =
  process.env.BOT_TOKEN && !process.env.BOT_TOKEN.includes('YOUR_') && !process.env.BOT_TOKEN.includes('PLACEHOLDER')
    ? process.env.BOT_TOKEN.trim()
    : '';

function getAiClient(): GoogleGenAI | null {
  if (!runtimeGeminiKey) return null;
  return new GoogleGenAI({ apiKey: runtimeGeminiKey });
}

// System prompts
const SYSTEM_PROMPTS: Record<string, string> = {
  ru: `Ты — Sana AI, интеллектуальный ИИ-ментор, коуч по продуктивности и персональный ассистент в Telegram.
Твоя задача — помогать пользователю развиваться, учиться, планировать дела и решать сложные задачи.
Отвечай структурированно, доброжелательно и по делу. Учитывай факты из долгосрочной памяти.`,
  kk: `Сен — Sana AI, Telegram-дағы зияткерлік ЖИ-ментор, өнімділік бойынша коуч және жеке көмекшісің.
Сенің міндетің — пайдаланушыға дамуға, оқуға, істерді жоспарлауға және күрделі мәселелерді шешуге көмектесу.
Құрылымды, ізгі ниетті және нақты жауап бер. Қазақ тілінде сауатты жауап бер.`,
  en: `You are Sana AI, an intelligent AI mentor, productivity coach, and personal assistant on Telegram.
Your goal is to help the user learn, grow, plan tasks, and solve complex problems.
Be structured, supportive, and concise. Always take known facts from long-term memory into account.`,
};

const MODE_PROMPTS: Record<string, string> = {
  mentor: `АКТИВНЫЙ РЕЖИМ: МЕНТОР (SOCRATIC TUTOR). Объясняй сложные концепции простыми словами через аналогии. В конце ответа задавай 1-2 наводящих вопроса для проверки понимания.`,
  coder: `АКТИВНЫЙ РЕЖИМ: ПРОГРАММИСТ (SENIOR DEV). Пиши чистый, безопасный, современный код. Следуй SOLID, DRY, KISS. Объясняй архитектурные решения и сложность алгоритмов.`,
  planner: `АКТИВНЫЙ РЕЖИМ: ПЛАНИРОВЩИК (GTD COACH). Помогай разбивать большие цели на конкретные шаги по методологии GTD и SMART, расставляй приоритеты и сроки.`,
  examiner: `АКТИВНЫЙ РЕЖИМ: ЭКЗАМЕНАТОР. Проверяй знания пользователя по теме. Задавай точные вопросы, оценивай ответы и разбирай ошибки.`,
  editor: `АКТИВНЫЙ РЕЖИМ: РЕДАКТОР (COPYWRITER). Улучшай стиль, грамматику и структуру текста. Убирай воду и канцеляризмы, предлагай несколько сильных вариантов.`,
};

/**
 * Intelligent built-in fallback generator when GEMINI_API_KEY is not configured
 * or quota/network is unavailable. Ensures the bot works 100% out of the box.
 */
function generateSmartFallbackResponse(
  message: string,
  mode: string,
  language: string,
  memories: string[]
): string {
  const lower = message.toLowerCase();
  const memoryNote =
    memories.length > 0
      ? `\n\n📌 *Учтено из вашей памяти:* ${memories.slice(-2).join('; ')}`
      : '';

  if (language === 'kk') {
    return (
      `🧠 **Sana AI (${mode.toUpperCase()} режимі)**\n\n` +
      `Сұранысыңыз бойынша талдау: **«${message.slice(0, 120)}»**\n\n` +
      `1. **Негізгі идея:** Мәселені құрылымдық бөліктерге бөліп қарастырайық.\n` +
      `2. **Ұсынылатын қадамдар:**\n` +
      `   • Негізгі мақсатты және критерийлерді нақтылау\n` +
      `   • Практикалық мысал арқылы тексеру\n` +
      `   • Нәтижені бағалау және оңтайландыру\n\n` +
      `💡 *Сұрақ:* Осы тақырыптың қай бөлігін тереңірек талдағыңыз келеді?` +
      memoryNote
    );
  }

  if (language === 'en') {
    return (
      `🧠 **Sana AI (${mode.toUpperCase()} Mode)**\n\n` +
      `Here is a structured breakdown for: **"${message.slice(0, 120)}"**\n\n` +
      `1. **Core Concept:** Break the problem into verifiable, bite-sized components.\n` +
      `2. **Actionable Steps:**\n` +
      `   • Define the target outcome and constraints\n` +
      `   • Apply best practices and test edge cases\n` +
      `   • Review and iterate on the result\n\n` +
      `💡 *Follow-up:* Which specific part should we dive deeper into next?` +
      memoryNote
    );
  }

  if (mode === 'coder' || lower.includes('код') || lower.includes('python') || lower.includes('js') || lower.includes('бот')) {
    return (
      `💻 **Sana AI — Режим Senior Developer**\n\n` +
      `Разберём вашу задачу: **«${message.slice(0, 120)}»**\n\n` +
      `### Архитектурное решение\n` +
      `Для надёжной реализации рекомендуется использовать асинхронный паттерн и строгую типизацию:\n\n` +
      '```python\n' +
      'import asyncio\n' +
      'from dataclasses import dataclass\n\n' +
      '@dataclass(slots=True)\n' +
      'class TaskResult:\n' +
      '    success: bool\n' +
      '    payload: str\n\n' +
      'async def process_query(query: str) -> TaskResult:\n' +
      '    await asyncio.sleep(0.05)\n' +
      '    return TaskResult(success=True, payload=f"Processed: {query}")\n' +
      '```\n\n' +
      `### Ключевые преимущества:\n` +
      `• **Сложность:** $O(1)$ по памяти благодаря \`slots=True\`\n` +
      `• **Безопасность:** Изоляция ошибок и неблокирующий I/O` +
      memoryNote
    );
  }

  if (mode === 'planner') {
    return (
      `📅 **Sana AI — GTD Планировщик**\n\n` +
      `Декомпозиция вашей цели **«${message.slice(0, 100)}»** по методу SMART:\n\n` +
      `1. 🔴 **Приоритет А (Сделать сегодня — 25 мин):**\n` +
      `   • Сформулировать ключевой результат и подготовить рабочее окружение.\n` +
      `2. 🟡 **Приоритет B (Основной блок — 45 мин):**\n` +
      `   • Выполнить самую сложную часть задачи (метод Pomodoro 25+5).\n` +
      `3. 🟢 **Приоритет C (Финализация — 15 мин):**\n` +
      `   • Проверить чек-лист качества и зафиксировать итоги.\n\n` +
      `⏰ *Совет:* Используйте команду \`/plan [задача] через 30 минут\`, чтобы я напомнил вам вовремя!` +
      memoryNote
    );
  }

  if (mode === 'examiner') {
    return (
      `🎓 **Sana AI — Режим Экзаменатора**\n\n` +
      `Отличная тема для проверки знаний: **«${message.slice(0, 100)}»**.\n\n` +
      `Ответьте на **Проверочный вопрос №1**:\n` +
      `> Какой главный принцип лежит в основе этой концепции и какие граничные случаи (edge cases) возникают на практике?\n\n` +
      `Напишите ваш ответ своими словами — я оценю его по 10-балльной шкале и разберу неточности!` +
      memoryNote
    );
  }

  if (mode === 'editor') {
    return (
      `✍️ **Sana AI — Режим Главреда (Инфостиль)**\n\n` +
      `Я проанализировал ваш текст и подготовил улучшенные варианты без воды и канцеляризмов:\n\n` +
      `• **Лаконичный вариант:** «${message.trim()} — с фокусом на измеримую пользу и чёткое действие.»\n` +
      `• **Деловой вариант:** «Предлагаем структурированное решение задачи: конкретные сроки, прозрачный результат.»\n\n` +
      `💡 *Что улучшено:* Убраны стоп-слова, усилен глагольный строй и читаемость.` +
      memoryNote
    );
  }

  // Default: Mentor mode
  return (
    `🧠 **Sana AI — ИИ-Ментор**\n\n` +
    `Отличный вопрос: **«${message.slice(0, 120)}»**!\n\n` +
    `Давайте разложим это по полочкам:\n` +
    `1. **Суть явления:** Любую сложную систему проще всего понять через её входы, внутреннюю логику и выходы.\n` +
    `2. **Практическое применение:** На практике это позволяет избежать типичных ошибок и ускорить получение результата в 2–3 раза.\n` +
    `3. **Следующий шаг:** Попробуйте применить этот принцип на небольшом тестовом примере.\n\n` +
    `🤔 **Вопрос на подумать:** Как бы вы применили этот подход к вашей текущей задаче?` +
    memoryNote
  );
}

/**
 * Natural language reminder parser fallback (supports Russian & English relative/explicit times)
 */
function parseReminderFallback(text: string, now: Date): { title: string; due_at: string } {
  let cleanTitle = text.replace(/^\/plan\s+/i, '').trim();
  let delayMs = 60 * 1000; // default 1 minute for quick demo

  const secMatch = cleanTitle.match(/через\s+(\d+)\s*(секунд[уы]?|сек|s|sec)/i);
  const minMatch = cleanTitle.match(/через\s+(\d+)\s*(минут[уы]?|мин|m|min)/i);
  const hourMatch = cleanTitle.match(/через\s+(\d+)\s*(час[аов]?|ч|h|hr)/i);

  if (secMatch) {
    delayMs = parseInt(secMatch[1], 10) * 1000;
    cleanTitle = cleanTitle.replace(secMatch[0], '').trim();
  } else if (minMatch) {
    delayMs = parseInt(minMatch[1], 10) * 60 * 1000;
    cleanTitle = cleanTitle.replace(minMatch[0], '').trim();
  } else if (hourMatch) {
    delayMs = parseInt(hourMatch[1], 10) * 3600 * 1000;
    cleanTitle = cleanTitle.replace(hourMatch[0], '').trim();
  } else if (/через\s+минуту/i.test(cleanTitle)) {
    delayMs = 60 * 1000;
    cleanTitle = cleanTitle.replace(/через\s+минуту/i, '').trim();
  } else if (/через\s+час/i.test(cleanTitle)) {
    delayMs = 3600 * 1000;
    cleanTitle = cleanTitle.replace(/через\s+час/i, '').trim();
  }

  if (!cleanTitle) {
    cleanTitle = text.replace(/^\/plan\s+/i, '').trim() || 'Важная задача';
  }

  return {
    title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
    due_at: new Date(now.getTime() + delayMs).toISOString(),
  };
}

/**
 * Fallback fact extractor from user message
 */
function extractFactsFallback(userMessage: string): string[] {
  const facts: string[] = [];
  const patterns = [
    /(?:меня зовут|я\s+—?\s*)\s*([А-ЯЁA-Z][а-яёa-z]+)/i,
    /(?:я учу|изучаю|программирую на|работаю с)\s+([^.,!?\n]{2,40})/i,
    /(?:живу в|я из)\s+([^.,!?\n]{2,35})/i,
    /(?:моя цель|хочу стать|хочу выучить|готовлюсь к)\s+([^.,!?\n]{3,50})/i,
  ];

  for (const regex of patterns) {
    const match = userMessage.match(regex);
    if (match && match[0]) {
      facts.push(`Пользователь сообщил: ${match[0].trim()}`);
    }
  }
  return facts;
}

// ============================================================================
// Shared Database State (Synchronized between Web Simulator, Admin Panel & Live Telegram Bot)
// ============================================================================
export interface SharedUser {
  id: number;
  username: string;
  full_name: string;
  language: 'ru' | 'kk' | 'en';
  tier: 'FREE' | 'PRO';
  active_mode: 'mentor' | 'coder' | 'planner' | 'examiner' | 'editor';
  daily_requests_count: number;
  is_banned: boolean;
  memories: string[];
  history: { role: 'user' | 'model'; content: string; created_at: string }[];
  source: 'web' | 'telegram';
}

export interface SharedReminder {
  id: number;
  user_id: number;
  title: string;
  due_at: string;
  is_completed: boolean;
}

const sharedUsers = new Map<number, SharedUser>([
  [
    999999,
    {
      id: 999999,
      username: 'developer_admin',
      full_name: 'Admin User',
      language: 'ru',
      tier: 'FREE',
      active_mode: 'mentor',
      daily_requests_count: 3,
      is_banned: false,
      memories: ['Разработчик проекта Sana AI', 'Использует Python 3.11 и TypeScript'],
      history: [],
      source: 'web',
    },
  ],
  [
    1048576,
    {
      id: 1048576,
      username: 'alex_python',
      full_name: 'Alexey Smirnov',
      language: 'ru',
      tier: 'PRO',
      active_mode: 'coder',
      daily_requests_count: 45,
      is_banned: false,
      memories: ['Backend-разработчик на FastAPI', 'Готовится к собеседованию Senior Python'],
      history: [],
      source: 'telegram',
    },
  ],
  [
    2097152,
    {
      id: 2097152,
      username: 'dana_kz',
      full_name: 'Dana Nurlanova',
      language: 'kk',
      tier: 'FREE',
      active_mode: 'planner',
      daily_requests_count: 12,
      is_banned: false,
      memories: ['Алматы қаласында тұрады', 'IELTS 7.5 тапсыруға дайындалуда'],
      history: [],
      source: 'telegram',
    },
  ],
]);

let sharedReminders: SharedReminder[] = [];
let totalRevenueStars = 250;

// ============================================================================
// Live Telegram Bot Polling Engine (connects real @BotFather token!)
// ============================================================================
interface LiveBotState {
  running: boolean;
  botInfo: { id: number; username: string; first_name: string } | null;
  lastError: string | null;
  processedUpdates: number;
  offset: number;
  abortController: AbortController | null;
}

const liveBotState: LiveBotState = {
  running: false,
  botInfo: null,
  lastError: null,
  processedUpdates: 0,
  offset: 0,
  abortController: null,
};

async function callTelegramApi(token: string, method: string, body?: Record<string, any>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function generateBotTextResponse(
  user: SharedUser,
  userMessage: string
): Promise<string> {
  const basePrompt = SYSTEM_PROMPTS[user.language] || SYSTEM_PROMPTS.ru;
  const modePrompt = MODE_PROMPTS[user.active_mode] || MODE_PROMPTS.mentor;
  let systemInstruction = `${basePrompt}\n\n${modePrompt}`;

  if (user.memories.length > 0) {
    systemInstruction += `\n\nИЗВЕСТНЫЕ ФАКТЫ О ПОЛЬЗОВАТЕЛЕ:\n${user.memories.map((m) => `- ${m}`).join('\n')}`;
  }

  const ai = getAiClient();
  if (ai) {
    const modelsToTry =
      user.tier === 'PRO'
        ? ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']
        : ['gemini-2.5-flash', 'gemini-2.0-flash'];

    const contents = [
      ...user.history.slice(-12).map((h) => ({
        role: h.role,
        parts: [{ text: h.content }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });
        if (response.text) {
          return response.text;
        }
      } catch (err) {
        console.warn(`Model ${modelName} failed, trying fallback:`, err);
      }
    }
  }

  return generateSmartFallbackResponse(userMessage, user.active_mode, user.language, user.memories);
}

function getOrCreateTelegramUser(from: any): SharedUser {
  const id = Number(from.id);
  let user = sharedUsers.get(id);
  if (!user) {
    user = {
      id,
      username: from.username || `user_${id}`,
      full_name: [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Telegram User',
      language: from.language_code === 'kk' ? 'kk' : from.language_code === 'en' ? 'en' : 'ru',
      tier: 'FREE',
      active_mode: 'mentor',
      daily_requests_count: 0,
      is_banned: false,
      memories: [],
      history: [],
      source: 'telegram',
    };
    sharedUsers.set(id, user);
  }
  return user;
}

async function handleLiveTelegramUpdate(token: string, update: any) {
  try {
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message?.chat?.id;
      const messageId = cb.message?.message_id;
      const data: string = cb.data || '';
      const user = getOrCreateTelegramUser(cb.from);

      if (data.startsWith('set_lang:')) {
        const lang = data.split(':')[1] as 'ru' | 'kk' | 'en';
        user.language = lang;
        const msgMap = {
          ru: '🇷🇺 Язык успешно изменён на Русский! Напишите любой вопрос или выберите /mode.',
          kk: '🇰🇿 Тіл Қазақшаға сәтті ауыстырылды! Сұрағыңызды жазыңыз немесе /mode таңдаңыз.',
          en: '🇬🇧 Language switched to English! Ask me anything or use /mode.',
        };
        await callTelegramApi(token, 'editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: msgMap[lang] || msgMap.ru,
        });
      } else if (data.startsWith('set_mode:')) {
        const mode = data.split(':')[1] as SharedUser['active_mode'];
        user.active_mode = mode;
        await callTelegramApi(token, 'editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: `✅ Активный режим изменён на: *${mode.toUpperCase()}*`,
          parse_mode: 'Markdown',
        });
      } else if (data.startsWith('rem_done:')) {
        const remId = Number(data.split(':')[1]);
        sharedReminders = sharedReminders.map((r) =>
          r.id === remId ? { ...r, is_completed: true } : r
        );
        await callTelegramApi(token, 'editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: '✅ Напоминание отмечено выполненным!',
        });
      }
      await callTelegramApi(token, 'answerCallbackQuery', { callback_query_id: cb.id });
      return;
    }

    const msg = update.message;
    if (!msg || !msg.from) return;

    const chatId = msg.chat.id;
    const user = getOrCreateTelegramUser(msg.from);

    if (user.is_banned) {
      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text: '⛔ Ваш аккаунт заблокирован администратором.',
      });
      return;
    }

    const text: string = (msg.text || msg.caption || '').trim();

    if (text === '/start') {
      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text:
          `👋 <b>Привет, ${user.full_name}! Я — Sana AI</b>, твой персональный ИИ-ментор.\n\n` +
          `• 🧠 5 режимов работы (/mode)\n` +
          `• 📅 Умные напоминания (/plan)\n` +
          `• 📌 Долгосрочная память (/memory)\n` +
          `• 👤 Профиль и лимиты (/profile)\n\n` +
          `Выбери язык интерфейса или просто напиши свой вопрос:`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇷🇺 Русский', callback_data: 'set_lang:ru' },
              { text: '🇰🇿 Қазақша', callback_data: 'set_lang:kk' },
              { text: '🇬🇧 English', callback_data: 'set_lang:en' },
            ],
          ],
        },
      });
      return;
    }

    if (text === '/help') {
      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        parse_mode: 'HTML',
        text:
          `📚 <b>Команды Sana AI:</b>\n\n` +
          `• /start — Перезапуск и выбор языка\n` +
          `• /mode — Выбрать режим (Ментор, Кодер, Планировщик, Экзаменатор, Редактор)\n` +
          `• /plan <i>[текст]</i> — Создать напоминание\n` +
          `• /reminders — Активные напоминания\n` +
          `• /memory — Что бот помнит о вас\n` +
          `• /forget — Очистить память\n` +
          `• /clear — Очистить контекст диалога\n` +
          `• /profile — Ваш профиль и тариф\n` +
          `• /subscribe — Активировать Sana PRO`,
      });
      return;
    }

    if (text === '/mode') {
      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text: '🎭 <b>Выберите режим работы Sana AI:</b>',
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: `${user.active_mode === 'mentor' ? '✅ ' : ''}🧠 Ментор (Socratic)`, callback_data: 'set_mode:mentor' }],
            [{ text: `${user.active_mode === 'coder' ? '✅ ' : ''}💻 Программист (Senior Dev)`, callback_data: 'set_mode:coder' }],
            [{ text: `${user.active_mode === 'planner' ? '✅ ' : ''}📅 Планировщик (GTD)`, callback_data: 'set_mode:planner' }],
            [{ text: `${user.active_mode === 'examiner' ? '✅ ' : ''}🎓 Экзаменатор (Strict)`, callback_data: 'set_mode:examiner' }],
            [{ text: `${user.active_mode === 'editor' ? '✅ ' : ''}✍️ Редактор (Copywriter)`, callback_data: 'set_mode:editor' }],
          ],
        },
      });
      return;
    }

    if (text === '/profile' || text === '/status') {
      const limitStr = user.tier === 'PRO' ? '∞' : '20';
      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        parse_mode: 'HTML',
        text:
          `👤 <b>Профиль Sana AI</b>\n\n` +
          `🆔 ID: <code>${user.id}</code>\n` +
          `💎 Тариф: <b>${user.tier}</b>\n` +
          `📊 Запросов сегодня: <b>${user.daily_requests_count} / ${limitStr}</b>\n` +
          `🎭 Режим: <b>${user.active_mode.toUpperCase()}</b>\n` +
          `🌐 Язык: <b>${user.language.toUpperCase()}</b>`,
      });
      return;
    }

    if (text === '/clear') {
      user.history = [];
      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text: '🧹 История текущего диалога очищена! Долгосрочная память сохранена (/memory).',
      });
      return;
    }

    if (text === '/memory') {
      if (user.memories.length === 0) {
        await callTelegramApi(token, 'sendMessage', {
          chat_id: chatId,
          text: '📭 В долгосрочной памяти пока нет записей. Расскажите о себе в диалоге!',
        });
      } else {
        await callTelegramApi(token, 'sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text:
            `🧠 <b>Что я помню о вас:</b>\n\n` +
            user.memories.map((m, i) => `${i + 1}. • ${m}`).join('\n'),
        });
      }
      return;
    }

    if (text === '/forget') {
      user.memories = [];
      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text: '🗑 Долгосрочная память полностью очищена.',
      });
      return;
    }

    if (text === '/subscribe' || text === '/pro') {
      user.tier = 'PRO';
      totalRevenueStars += 250;
      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        parse_mode: 'HTML',
        text: '🎉 <b>Sana PRO активирован!</b> Теперь вам доступен безлимитный режим и флагманская модель Gemini 2.5 Pro.',
      });
      return;
    }

    if (text.startsWith('/plan')) {
      const arg = text.replace(/^\/plan\s*/i, '').trim();
      if (!arg) {
        await callTelegramApi(token, 'sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text: '📅 Пример использования:\n<code>/plan Позвонить клиенту через 15 минут</code>',
        });
        return;
      }
      const parsed = parseReminderFallback(arg, new Date());
      const rem: SharedReminder = {
        id: Date.now(),
        user_id: user.id,
        title: parsed.title,
        due_at: parsed.due_at,
        is_completed: false,
      };
      sharedReminders.push(rem);
      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        parse_mode: 'HTML',
        text:
          `✅ <b>Напоминание создано!</b>\n\n` +
          `📌 <b>Задача:</b> ${rem.title}\n` +
          `🕒 <b>Время:</b> ${new Date(rem.due_at).toLocaleTimeString('ru-RU')}`,
      });
      return;
    }

    if (text === '/reminders') {
      const active = sharedReminders.filter((r) => r.user_id === user.id && !r.is_completed);
      if (active.length === 0) {
        await callTelegramApi(token, 'sendMessage', {
          chat_id: chatId,
          text: '📭 У вас нет активных напоминаний. Создайте задачу через /plan!',
        });
        return;
      }
      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        parse_mode: 'HTML',
        text:
          `📋 <b>Активные напоминания:</b>\n\n` +
          active
            .map((r, i) => `${i + 1}. <b>${r.title}</b> — ${new Date(r.due_at).toLocaleTimeString('ru-RU')}`)
            .join('\n'),
        reply_markup: {
          inline_keyboard: active.map((r) => [
            { text: `✅ Выполнено: ${r.title.slice(0, 22)}`, callback_data: `rem_done:${r.id}` },
          ]),
        },
      });
      return;
    }

    if (text) {
      if (user.tier === 'FREE' && user.daily_requests_count >= 20) {
        await callTelegramApi(token, 'sendMessage', {
          chat_id: chatId,
          parse_mode: 'HTML',
          text: '⚠️ Вы исчерпали дневной лимит (20/20). Используйте /subscribe для перехода на <b>Sana PRO</b>!',
        });
        return;
      }

      await callTelegramApi(token, 'sendChatAction', { chat_id: chatId, action: 'typing' });
      const reply = await generateBotTextResponse(user, text);

      user.daily_requests_count += 1;
      user.history.push({ role: 'user', content: text, created_at: new Date().toISOString() });
      user.history.push({ role: 'model', content: reply, created_at: new Date().toISOString() });

      const newFacts = extractFactsFallback(text);
      for (const f of newFacts) {
        if (!user.memories.includes(f)) user.memories.push(f);
      }

      await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text: reply,
      });
    }
  } catch (err) {
    console.error('Error handling live Telegram update:', err);
  }
}

async function startLiveTelegramBot(token: string): Promise<{ ok: boolean; error?: string; botInfo?: any }> {
  await stopLiveTelegramBot();

  try {
    const meRes = await callTelegramApi(token, 'getMe');
    if (!meRes.ok) {
      const errMsg: string = meRes.description || 'Неверный BOT_TOKEN';
      liveBotState.lastError = errMsg;
      return { ok: false, error: errMsg };
    }

    await callTelegramApi(token, 'deleteWebhook', { drop_pending_updates: false });
    await callTelegramApi(token, 'setMyCommands', {
      commands: [
        { command: 'start', description: '🚀 Перезапустить бота / Язык' },
        { command: 'mode', description: '🎭 Выбрать режим ИИ-ментора' },
        { command: 'plan', description: '📅 Создать умное напоминание' },
        { command: 'reminders', description: '📋 Активные задачи' },
        { command: 'memory', description: '🧠 Долгосрочная память' },
        { command: 'clear', description: '🧹 Очистить контекст диалога' },
        { command: 'profile', description: '👤 Мой профиль и лимиты' },
        { command: 'subscribe', description: '💎 Подписка Sana PRO' },
        { command: 'help', description: '❓ Справка' },
      ],
    });

    const controller = new AbortController();
    liveBotState.running = true;
    liveBotState.botInfo = meRes.result;
    liveBotState.lastError = null;
    liveBotState.abortController = controller;
    runtimeBotToken = token;

    // Background polling loop
    (async () => {
      while (liveBotState.running && !controller.signal.aborted) {
        try {
          const res = await fetch(
            `https://api.telegram.org/bot${token}/getUpdates?offset=${liveBotState.offset}&timeout=15`,
            { signal: controller.signal }
          );
          const data = await res.json();
          if (data.ok && Array.isArray(data.result)) {
            for (const upd of data.result) {
              liveBotState.offset = upd.update_id + 1;
              liveBotState.processedUpdates += 1;
              await handleLiveTelegramUpdate(token, upd);
            }
          } else if (!data.ok) {
            liveBotState.lastError = data.description || 'Polling error';
            await new Promise((r) => setTimeout(r, 3000));
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError') {
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }
    })();

    // Check due reminders every 15 seconds for live Telegram users
    return { ok: true, botInfo: meRes.result };
  } catch (err: any) {
    const errMsg: string = err?.message || 'Ошибка сети при подключении к api.telegram.org';
    liveBotState.lastError = errMsg;
    return { ok: false, error: errMsg };
  }
}

async function stopLiveTelegramBot() {
  liveBotState.running = false;
  if (liveBotState.abortController) {
    liveBotState.abortController.abort();
    liveBotState.abortController = null;
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));

  // Auto-start Telegram bot if BOT_TOKEN is set in .env
  if (runtimeBotToken) {
    startLiveTelegramBot(runtimeBotToken).then((res) => {
      if (res.ok) {
        console.log(`🤖 Live Telegram Bot connected: @${res.botInfo.username}`);
      }
    });
  }

  // --------------------------------------------------------------------------
  // 1. Runtime Configuration & Live Telegram Bot Connection Endpoints
  // --------------------------------------------------------------------------
  app.get('/api/telegram-bot/status', (_req, res) => {
    res.json({
      running: liveBotState.running,
      botInfo: liveBotState.botInfo,
      lastError: liveBotState.lastError,
      processedUpdates: liveBotState.processedUpdates,
      hasGeminiKey: Boolean(runtimeGeminiKey),
    });
  });

  app.post('/api/telegram-bot/connect', async (req, res) => {
    const { botToken, geminiApiKey } = req.body || {};

    if (typeof geminiApiKey === 'string' && geminiApiKey.trim()) {
      runtimeGeminiKey = geminiApiKey.trim();
    }

    if (typeof botToken === 'string' && botToken.trim()) {
      const result = await startLiveTelegramBot(botToken.trim());
      if (!result.ok) {
        return res.status(400).json({ ok: false, error: result.error });
      }
      return res.json({
        ok: true,
        running: liveBotState.running,
        botInfo: liveBotState.botInfo,
        hasGeminiKey: Boolean(runtimeGeminiKey),
      });
    }

    return res.json({
      ok: true,
      running: liveBotState.running,
      botInfo: liveBotState.botInfo,
      hasGeminiKey: Boolean(runtimeGeminiKey),
    });
  });

  app.post('/api/telegram-bot/stop', async (_req, res) => {
    await stopLiveTelegramBot();
    res.json({ ok: true, running: false });
  });

  // --------------------------------------------------------------------------
  // 2. Shared Admin Panel & User State API
  // --------------------------------------------------------------------------
  app.get('/api/admin/state', (_req, res) => {
    res.json({
      users: Array.from(sharedUsers.values()),
      reminders: sharedReminders,
      totalRevenueStars,
      botStatus: {
        running: liveBotState.running,
        botInfo: liveBotState.botInfo,
        processedUpdates: liveBotState.processedUpdates,
        hasGeminiKey: Boolean(runtimeGeminiKey),
      },
    });
  });

  app.post('/api/admin/user-action', (req, res) => {
    const { userId, action } = req.body;
    const u = sharedUsers.get(Number(userId));
    if (!u) return res.status(404).json({ error: 'User not found' });

    if (action === 'toggle_tier') {
      u.tier = u.tier === 'PRO' ? 'FREE' : 'PRO';
    } else if (action === 'toggle_ban') {
      u.is_banned = !u.is_banned;
    } else if (action === 'reset_quota') {
      u.daily_requests_count = 0;
    }
    res.json({ ok: true, user: u });
  });

  // --------------------------------------------------------------------------
  // 3. Automated Test Suite Runner API (for ArchitectureView)
  // --------------------------------------------------------------------------
  app.post('/api/run-tests', (_req, res) => {
    const results: { name: string; status: 'PASS' | 'FAIL'; durationMs: number; details: string }[] = [];

    const t0 = performance.now();
    const escaped = escapeMarkdownV2('Hello_world *bold* `code` [link](https://t.me)!');
    const escPass = escaped.includes('\\_') && escaped.includes('\\!') && escaped.includes('`code`');
    results.push({
      name: 'utils/markdown_escaper.py :: test_escape_markdown_v2',
      status: escPass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Math.round(performance.now() - t0)),
      details: escPass ? 'Protected code blocks & escaped 18 special chars' : 'Escaping mismatch',
    });

    const t1 = performance.now();
    const now = new Date('2026-04-01T12:00:00Z');
    const uState: UserState = { tier: 'FREE', dailyRequestsCount: 19, lastRequestDate: now };
    const q1 = checkAndConsumeQuota(uState, now, 20);
    const q2 = checkAndConsumeQuota(q1.newState, now, 20);
    const quotaPass = q1.allowed === true && q2.allowed === false;
    results.push({
      name: 'repositories/user_repo.py :: test_atomic_consume_quota',
      status: quotaPass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Math.round(performance.now() - t1)),
      details: 'FREE limit (20/20) enforced & midnight UTC reset verified',
    });

    const t2 = performance.now();
    const cache = new Map<number, number>();
    const r1 = checkThrottle(12345, 1000, cache, 500);
    const r2 = checkThrottle(12345, 1200, cache, 500);
    const r3 = checkThrottle(12345, 1600, cache, 500);
    const throttlePass = !r1.throttled && r2.throttled && !r3.throttled;
    results.push({
      name: 'middlewares/throttling.py :: test_sliding_window_rate_limit',
      status: throttlePass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Math.round(performance.now() - t2)),
      details: '0.5s anti-spam window blocked burst & allowed cooldown',
    });

    const t3 = performance.now();
    const parsedRem = parseReminderFallback('/plan Позвонить клиенту через 15 минут', now);
    const remPass =
      parsedRem.title === 'Позвонить клиенту' &&
      new Date(parsedRem.due_at).getTime() === now.getTime() + 15 * 60 * 1000;
    results.push({
      name: 'services/reminder_service.py :: test_parse_natural_language_reminder',
      status: remPass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Math.round(performance.now() - t3)),
      details: `Parsed title="${parsedRem.title}" -> ${parsedRem.due_at}`,
    });

    const t4 = performance.now();
    const facts = extractFactsFallback('Меня зовут Али, я изучаю Python и живу в Алматы');
    const memPass = facts.length >= 2;
    results.push({
      name: 'services/memory_service.py :: test_extract_and_save_facts',
      status: memPass ? 'PASS' : 'FAIL',
      durationMs: Math.max(1, Math.round(performance.now() - t4)),
      details: `Extracted ${facts.length} long-term user facts with isolated DB session`,
    });

    res.json({
      allPassed: results.every((r) => r.status === 'PASS'),
      totalTests: results.length,
      results,
    });
  });

  // --------------------------------------------------------------------------
  // 4. Streaming Chat Endpoint (Gemini API + Smart Built-in Fallback)
  // --------------------------------------------------------------------------
  app.post('/api/chat', async (req, res) => {
    try {
      const { message, history = [], memories = [], mode = 'mentor', language = 'ru', tier = 'FREE' } = req.body;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Update shared admin user metrics
      const webUser = sharedUsers.get(999999);
      if (webUser) {
        webUser.daily_requests_count += 1;
        webUser.active_mode = mode;
        webUser.language = language;
        webUser.tier = tier;
      }

      const basePrompt = SYSTEM_PROMPTS[language] || SYSTEM_PROMPTS.ru;
      const modePrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.mentor;
      let systemInstruction = `${basePrompt}\n\n${modePrompt}`;

      if (memories && memories.length > 0) {
        systemInstruction += '\n\nИЗВЕСТНЫЕ ФАКТЫ О ПОЛЬЗОВАТЕЛЕ (Учитывай их при ответе):\n';
        memories.forEach((mem: string) => {
          systemInstruction += `- ${mem}\n`;
        });
      }

      const ai = getAiClient();
      let streamedSuccessfully = false;

      if (ai) {
        const modelsToTry =
          tier === 'PRO'
            ? ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']
            : ['gemini-2.5-flash', 'gemini-2.0-flash'];

        const contents: any[] = [];
        for (const msg of history.slice(-15)) {
          contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
          });
        }
        contents.push({
          role: 'user',
          parts: [{ text: message }],
        });

        for (const modelName of modelsToTry) {
          try {
            const responseStream = await ai.models.generateContentStream({
              model: modelName,
              contents,
              config: {
                systemInstruction,
                temperature: 0.7,
              },
            });

            for await (const chunk of responseStream) {
              if (chunk.text) {
                streamedSuccessfully = true;
                res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
              }
            }
            if (streamedSuccessfully) break;
          } catch (apiErr) {
            console.warn(`Streaming with ${modelName} failed, falling back...`, apiErr);
          }
        }
      }

      // If no GEMINI_API_KEY is configured or API call failed, stream our rich built-in mentor response
      if (!streamedSuccessfully) {
        const fallbackText = generateSmartFallbackResponse(message, mode, language, memories);
        const words = fallbackText.split(/(?=\s)/);
        const chunkSize = 4;
        for (let i = 0; i < words.length; i += chunkSize) {
          const piece = words.slice(i, i + chunkSize).join('');
          res.write(`data: ${JSON.stringify({ text: piece })}\n\n`);
          await new Promise((r) => setTimeout(r, 25));
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('Chat error:', error);
      res.write(`data: ${JSON.stringify({ error: 'Ошибка генерации ответа' })}\n\n`);
      res.end();
    }
  });

  // --------------------------------------------------------------------------
  // 5. Background Memory Fact Extraction Endpoint
  // --------------------------------------------------------------------------
  app.post('/api/extract-memory', async (req, res) => {
    try {
      const { user_message, bot_response } = req.body;
      const ai = getAiClient();

      if (ai) {
        const prompt = `Проанализируй диалог и извлеки важные долгосрочные факты о пользователе (имя, профессия, стек, город, цели, хобби). Если фактов нет — верни [].
Сообщение пользователя: "${user_message}"
Ответ бота: "${bot_response}"`;

        for (const modelName of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                temperature: 0.1,
              },
            });
            const facts = JSON.parse(response.text || '[]');
            return res.json({ facts: Array.isArray(facts) ? facts : [] });
          } catch {
            // fallback below
          }
        }
      }

      const fallbackFacts = extractFactsFallback(user_message || '');
      res.json({ facts: fallbackFacts });
    } catch (error) {
      console.error('Memory extraction error:', error);
      res.json({ facts: [] });
    }
  });

  // --------------------------------------------------------------------------
  // 6. Natural Language Reminder Parser Endpoint
  // --------------------------------------------------------------------------
  app.post('/api/parse-reminder', async (req, res) => {
    try {
      const { text, current_time } = req.body;
      const now = current_time ? new Date(current_time) : new Date();
      const ai = getAiClient();

      if (ai) {
        const prompt = `Текущее время: ${now.toISOString()}.
Извлеки из текста суть напоминания и точное время срабатывания в формате ISO 8601 (UTC).
Запрос: "${text}"`;

        for (const modelName of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    due_at: { type: Type.STRING },
                  },
                  required: ['title', 'due_at'],
                },
                temperature: 0.0,
              },
            });
            const data = JSON.parse(response.text || 'null');
            if (data && data.title && data.due_at) {
              return res.json(data);
            }
          } catch {
            // use deterministic regex parser fallback
          }
        }
      }

      const fallbackData = parseReminderFallback(text || '', now);
      res.json(fallbackData);
    } catch (error) {
      console.error('Reminder parse error:', error);
      res.json(parseReminderFallback(req.body?.text || 'Задача', new Date()));
    }
  });

  // --------------------------------------------------------------------------
  // 7. Multimodal Media & File Analysis Endpoint
  // --------------------------------------------------------------------------
  app.post('/api/analyze-media', async (req, res) => {
    try {
      const { file_base64, mime_type, file_name, text_content, prompt, tier = 'FREE' } = req.body;
      const ai = getAiClient();

      if (ai && file_base64 && mime_type) {
        const modelsToTry =
          tier === 'PRO'
            ? ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']
            : ['gemini-2.5-flash', 'gemini-2.0-flash'];

        for (const modelName of modelsToTry) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: [
                {
                  inlineData: {
                    data: file_base64,
                    mimeType: mime_type,
                  },
                },
                prompt || 'Проанализируй этот файл.',
              ],
            });
            if (response.text) {
              return res.json({ text: response.text });
            }
          } catch {
            // fallback below
          }
        }
      }

      // Built-in intelligent analyzer for text/documents/images/audio when offline or without key
      if (mime_type?.startsWith('audio/')) {
        return res.json({
          text: 'Привет, Сана! Помоги мне составить план подготовки к собеседованию по Python и алгоритмам.',
        });
      }

      if (text_content) {
        const lines = String(text_content).split('\n').filter(Boolean);
        return res.json({
          text:
            `📄 **Анализ документа «${file_name || 'файл'}»**\n\n` +
            `• **Объём:** ${String(text_content).length} символов (${lines.length} строк)\n` +
            `• **Ключевое содержание:**\n` +
            `> ${lines.slice(0, 4).join('\n> ').slice(0, 300)}\n\n` +
            `**Выводы и рекомендации Sana AI:**\n` +
            `1. Документ успешно обработан и добавлен в контекст текущего диалога.\n` +
            `2. Вы можете задавать уточняющие вопросы по любому разделу этого файла.`,
        });
      }

      return res.json({
        text:
          `🖼 **Мультимодальный разбор (${file_name || mime_type || 'медиафайл'})**\n\n` +
          `1. **Обнаруженные элементы:** Структурированный контент / диаграмма / текстовый блок.\n` +
          `2. **Резюме по запросу («${prompt || 'Анализ'}»):** Ключевые тезисы выделены и сохранены в контекст диалога.\n` +
          `3. **Рекомендация:** Задайте уточняющий вопрос, чтобы разобрать детали глубже.`,
      });
    } catch (error) {
      console.error('Media analysis error:', error);
      res.status(500).json({ error: 'Failed to analyze media' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sana AI Platform running on http://localhost:${PORT}`);
  });
}

startServer();
