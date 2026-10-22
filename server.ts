import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { BOT_FILES } from './src/data/botFilesData.ts';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to get GoogleGenAI client safely
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

// Mode system instruction modifiers
const MODE_PROMPTS: Record<string, string> = {
  mentor: `[РЕЖИМ: НАСТАВНИК 🎓]
Твоя цель — помочь пользователю глубоко понять предмет, а не просто дать готовую подсказку.
- Используй метод Сократа: задавай наводящие вопросы.
- Разбирай сложные концепции через метафоры из реальной жизни.
- Хвали за правильный ход мыслей и поддерживай мотивацию.`,
  editor: `[РЕЖИМ: РЕДАКТОР ТЕКСТОВ ✍️]
Твоя цель — вычистить текст пользователя до идеала.
- Исправляй грамматические, пунктуационные и речевые ошибки.
- Устраняй канцеляризмы, плеоназмы и воду.
- Предлагай два варианта: 1) Строгий и академический; 2) Живой и вовлекающий.
- Показывай ключевые исправления списком.`,
  planner: `[РЕЖИМ: ПЛАНИРОВЩИК 📅]
Твоя цель — превратить хаос задач в четкий план действий.
- Декомпозируй большие цели на спринты и подзадачи по 25-45 минут.
- Выделяй приоритеты по матрице Эйзенхауэра (Срочно/Важно).
- Предлагай точные таймлайны и контрольные точки.`,
  examiner: `[РЕЖИМ: ЭКЗАМЕНАТОР 📝]
Твоя цель — протестировать знания пользователя перед сессией или собеседованием.
- Сгенерируй тест с 4 вариантами ответов (A, B, C, D) или открытые вопросы.
- Не раскрывай ответ сразу: жди ответа пользователя.
- Если пользователь ответил — дай детальный разбор и следующий вопрос.`,
  coder: `[РЕЖИМ: КОДЕР 💻]
Твоя цель — помочь написать надежный, поддерживаемый и эффективный код.
- Придерживайся стандартов PEP 8, TypeScript strict, SOLID и чистой архитектуры.
- Оценивай сложность алгоритма O(N).
- Находи скрытые баги, утечки памяти и уязвимости.
- Добавляй понятные комментарии к неочевидным местам.`
};

// 1. Streaming chat endpoint with Server-Sent Events (SSE)
app.post('/api/chat', async (req: Request, res: Response) => {
  const {
    messages,
    mode = 'mentor',
    language = 'ru',
    memories = [],
    userProfile = {},
    image = null
  } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const ai = getGeminiClient();
  if (!ai) {
    res.write(`data: ${JSON.stringify({ error: 'GEMINI_API_KEY is not configured in server environment.' })}\n\n`);
    res.end();
    return;
  }

  try {
    const langInstructions: Record<string, string> = {
      ru: 'Ты — Sana AI (от каз. "сана" — разум, сознание), умный персональный наставник и "второй мозг" для учёбы и работы. Отвечай на русском языке, доброжелательно, без канцелярита. Не говори, что ты просто языковая модель.',
      kk: 'Сен — Sana AI ("сана" — ақыл, ой-өріс), студенттер мен жас мамандардың оқуы мен жұмысына арналған ақылды жеке менторысың. Таза әрі түсінікті қазақ тілінде жауап бер.',
      en: 'You are Sana AI (from Kazakh "sana" — mind, consciousness), an intelligent mentor and second brain for study and work. Speak clearly and constructively.'
    };

    let systemInstruction = langInstructions[language] || langInstructions.ru;
    if (MODE_PROMPTS[mode]) {
      systemInstruction += `\n\n${MODE_PROMPTS[mode]}`;
    }

    if (userProfile.name) {
      systemInstruction += `\nИмя пользователя: ${userProfile.name}.`;
    }
    if (userProfile.studyGoal) {
      systemInstruction += `\nЦель пользователя: ${userProfile.studyGoal}.`;
    }
    if (userProfile.timezone) {
      systemInstruction += `\nЧасовой пояс пользователя: ${userProfile.timezone}.`;
    }

    if (memories && memories.length > 0) {
      systemInstruction += `\n\n[ДОЛГОСРОЧНАЯ ПАМЯТЬ О ПОЛЬЗОВАТЕЛЕ]:\n` + memories.map((m: string) => `- ${m}`).join('\n');
    }

    // Build contents for SDK
    const contents: any[] = [];
    if (Array.isArray(messages)) {
      for (const msg of messages) {
        contents.push({
          role: msg.role === 'model' || msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    // If image provided in last message
    if (image && image.data && image.mimeType) {
      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        contents[contents.length - 1].parts.push({
          inlineData: {
            mimeType: image.mimeType,
            data: image.data
          }
        });
      }
    }

    // Use recommended gemini-3.8-flash model
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.8-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7
      }
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('Gemini streaming error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message || 'Ошибка генерации ответа' })}\n\n`);
    res.end();
  }
});

// 2. Parse natural language reminder
app.post('/api/parse-reminder', async (req: Request, res: Response) => {
  const { text, timezone = 'Asia/Almaty' } = req.body;
  const ai = getGeminiClient();
  if (!ai) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  try {
    const nowLocal = new Date().toISOString();
    const prompt = `
Ты — парсер напоминаний из естественного языка.
Текущее время: ${nowLocal}. Часовой пояс: ${timezone}.
Извлеки название задачи и локальную дату наступления события (в формате ISO YYYY-MM-DDTHH:mm:ss).
Фраза: "${text}"

Верни ТОЛЬКО валидный JSON без markdown:
{
  "title": "название задачи",
  "datetime_iso": "YYYY-MM-DDTHH:mm:ss"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (err: any) {
    console.error('Reminder parse error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 3. Extract long-term facts
app.post('/api/extract-memory', async (req: Request, res: Response) => {
  const { conversation } = req.body;
  const ai = getGeminiClient();
  if (!ai) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  try {
    const prompt = `
Проанализируй диалог и выдели устойчивые факты о пользователе (его специальность, цели, изучаемые технологии, вуз, привычки).
Верни JSON список строк: ["факт 1", "факт 2"]. Если фактов нет, верни [].
Диалог:
${JSON.stringify(conversation)}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    });

    const facts = JSON.parse(response.text || '[]');
    return res.json({ facts });
  } catch (err: any) {
    console.error('Memory extract error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 4. Document study analysis
app.post('/api/analyze-doc', async (req: Request, res: Response) => {
  const { docText, fileName } = req.body;
  const ai = getGeminiClient();
  if (!ai) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  try {
    const prompt = `
Ты — Sana AI. Сделай структурированный академический разбор документа "${fileName}":
1. 🎯 Краткая суть (Executive summary, 2-3 абзаца).
2. 🔑 5-7 ключевых тезисов.
3. 📝 Экспресс-тест из 3 вопросов с 4 вариантами ответов (A, B, C, D) и указанием правильного ответа под спойлером.

Документ:
${docText.slice(0, 50000)}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        temperature: 0.3
      }
    });

    return res.json({ analysis: response.text });
  } catch (err: any) {
    console.error('Doc analysis error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 5. Bot files list
app.get('/api/bot-files', (_req: Request, res: Response) => {
  res.json({ files: BOT_FILES });
});

// Setup Vite or static serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sana AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
