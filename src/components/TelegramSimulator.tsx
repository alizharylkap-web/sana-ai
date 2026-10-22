import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Mic,
  Sparkles,
  Brain,
  Clock,
  Star,
  Download,
  ShieldAlert,
  FileText,
  Image as ImageIcon,
  Check,
  CheckCheck,
  Radio,
  Settings,
  X,
  Trash2,
  HelpCircle,
  UserCheck,
} from 'lucide-react';
import { checkAndConsumeQuota, checkThrottle, type UserState } from '../utils/telegramLogic';

interface Message {
  id: string;
  role: 'user' | 'bot';
  text: string;
  timestamp: string;
  isStreaming?: boolean;
  inlineKeyboard?: { text: string; callback_data: string }[][];
  isInvoice?: boolean;
  isDocument?: { filename: string; content: string };
}

interface Reminder {
  id: string;
  title: string;
  due_at: Date;
  completed: boolean;
}

interface LiveBotStatus {
  running: boolean;
  botInfo: { id: number; username: string; first_name: string } | null;
  lastError: string | null;
  processedUpdates: number;
  hasGeminiKey: boolean;
}

export function TelegramSimulator({ onOpenAdmin }: { onOpenAdmin?: () => void } = {}) {
  // DB State
  const [user, setUser] = useState({
    id: 999999,
    username: 'developer_admin',
    language: 'ru',
    tier: 'FREE' as 'FREE' | 'PRO',
    active_mode: 'mentor',
    daily_requests_count: 3,
    last_request_date: new Date().toISOString(),
  });

  const [memories, setMemories] = useState<string[]>([
    'Пользователь — разработчик из Алматы',
    'Изучает архитектуру высоконагруженных систем',
  ]);

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'bot',
      text: '👋 Привет! Я — **Sana AI**, твой персональный ИИ-ментор и коуч.\n\nЯ умею объяснять сложные темы, писать чистый код, анализировать PDF/DOCX/Фото, понимать голосовые сообщения и ставить умные напоминания (`/plan`).\n\nВыбери язык интерфейса или напиши любой вопрос:',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      inlineKeyboard: [
        [
          { text: '🇷🇺 Русский', callback_data: 'set_lang:ru' },
          { text: '🇰🇿 Қазақша', callback_data: 'set_lang:kk' },
          { text: '🇬🇧 English', callback_data: 'set_lang:en' },
        ],
      ],
    },
  ]);

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live Telegram Bot connection modal state
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [botTokenInput, setBotTokenInput] = useState('');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [isConnectingBot, setIsConnectingBot] = useState(false);
  const [liveBotStatus, setLiveBotStatus] = useState<LiveBotStatus>({
    running: false,
    botInfo: null,
    lastError: null,
    processedUpdates: 0,
    hasGeminiKey: false,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const throttleCacheRef = useRef<Map<number, number>>(new Map());

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Poll Live Bot status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/telegram-bot/status');
        if (res.ok) {
          const data = await res.json();
          setLiveBotStatus(data);
        }
      } catch {
        // ignore offline errors
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Background APScheduler simulation for reminders
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setReminders((prev) =>
        prev.map((rem) => {
          if (!rem.completed && rem.due_at <= now) {
            addBotMessage(`🔔 **НАПОМИНАНИЕ!**\n\nВы просили напомнить:\n📌 **${rem.title}**`);
            return { ...rem, completed: true };
          }
          return rem;
        })
      );
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const addBotMessage = (text: string, extra?: Partial<Message>) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString() + Math.random(),
        role: 'bot',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ...extra,
      },
    ]);
  };

  const addUserMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString() + Math.random(),
        role: 'user',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const checkQuotaPrecondition = (): boolean => {
    const state: UserState = {
      tier: user.tier,
      dailyRequestsCount: user.daily_requests_count,
      lastRequestDate: new Date(user.last_request_date),
    };
    const result = checkAndConsumeQuota(state, new Date(), 20);
    if (!result.allowed) {
      addBotMessage(
        '⚠️ Вы исчерпали дневной лимит бесплатных запросов (20/20).\n\nПерейдите на **Sana PRO** (/subscribe), чтобы получить безлимитный доступ к флагманской модели **Gemini 2.5 Pro**!'
      );
      return false;
    }
    return true;
  };

  const consumeQuotaOnSuccess = () => {
    setUser((prev) => {
      const state: UserState = {
        tier: prev.tier,
        dailyRequestsCount: prev.daily_requests_count,
        lastRequestDate: new Date(prev.last_request_date),
      };
      const result = checkAndConsumeQuota(state, new Date(), 20);
      return {
        ...prev,
        daily_requests_count: result.newState.dailyRequestsCount,
        last_request_date: result.newState.lastRequestDate.toISOString(),
      };
    });
  };

  const handleConnectLiveBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnectingBot(true);
    try {
      const res = await fetch('/api/telegram-bot/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: botTokenInput.trim() || undefined,
          geminiApiKey: geminiKeyInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        showToast(`⚠️ Ошибка: ${data.error || 'Не удалось подключить бота'}`);
      } else {
        setLiveBotStatus((prev) => ({
          ...prev,
          running: data.running,
          botInfo: data.botInfo,
          hasGeminiKey: data.hasGeminiKey,
          lastError: null,
        }));
        showToast(
          data.botInfo
            ? `✅ Бот @${data.botInfo.username} успешно запущен в Telegram!`
            : '✅ Настройки API успешно сохранены!'
        );
        setShowConnectModal(false);
        setBotTokenInput('');
        setGeminiKeyInput('');
      }
    } catch {
      showToast('⚠️ Ошибка соединения с сервером');
    } finally {
      setIsConnectingBot(false);
    }
  };

  const handleStopLiveBot = async () => {
    await fetch('/api/telegram-bot/stop', { method: 'POST' });
    setLiveBotStatus((prev) => ({ ...prev, running: false }));
    showToast('⏹ Long-Polling Telegram-бота остановлен');
  };

  // Handle Commands & Text
  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text) return;

    // 1. Throttling Middleware Simulation (0.5s rate limit)
    const throttleResult = checkThrottle(user.id, Date.now(), throttleCacheRef.current, 500);
    if (throttleResult.throttled) {
      showToast('⏳ Слишком много запросов! Подождите полсекунды.');
      return;
    }

    if (!textToSend) setInputText('');
    addUserMessage(text);

    // 2. Command Routing
    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const cmd = parts[0].toLowerCase();

      if (cmd === '/start') {
        setTimeout(() => {
          addBotMessage(
            '👋 Привет! Я — **Sana AI**, твой персональный ИИ-ментор.\n\nВыбери язык интерфейса или просто напиши свой вопрос:',
            {
              inlineKeyboard: [
                [
                  { text: '🇷🇺 Русский', callback_data: 'set_lang:ru' },
                  { text: '🇰🇿 Қазақша', callback_data: 'set_lang:kk' },
                  { text: '🇬🇧 English', callback_data: 'set_lang:en' },
                ],
              ],
            }
          );
        }, 250);
        return;
      }

      if (cmd === '/help') {
        setTimeout(() => {
          addBotMessage(
            `📚 **Доступные команды Sana AI:**\n\n` +
              `• \`/start\` — Перезапуск и выбор языка\n` +
              `• \`/mode\` — Выбрать режим работы ИИ (Ментор, Кодер, Планировщик, Экзаменатор, Редактор)\n` +
              `• \`/plan [текст]\` — Создать умное напоминание (напр. \`/plan Позвонить через 1 минуту\`)\n` +
              `• \`/reminders\` — Список активных напоминаний\n` +
              `• \`/memory\` — Посмотреть факты в долгосрочной памяти\n` +
              `• \`/forget\` — Очистить долгосрочную память\n` +
              `• \`/clear\` — Очистить контекст текущего диалога\n` +
              `• \`/profile\` — Профиль и остаток дневных лимитов\n` +
              `• \`/subscribe\` — Перейти на тариф Sana PRO\n` +
              `• \`/export\` — Скачать историю диалогов в Markdown (.md)\n` +
              `• \`/admin\` — Панель администратора`
          );
        }, 250);
        return;
      }

      if (cmd === '/profile' || cmd === '/status') {
        setTimeout(() => {
          const limitStr = user.tier === 'PRO' ? '∞' : '20';
          addBotMessage(
            `👤 **Профиль пользователя Sana AI**\n\n` +
              `🆔 ID: \`${user.id}\`\n` +
              `💎 Тариф: **${user.tier}**\n` +
              `📊 Запросов сегодня: **${user.daily_requests_count} / ${limitStr}**\n` +
              `🎭 Активный режим: **${user.active_mode.toUpperCase()}**\n` +
              `🌐 Язык: **${user.language.toUpperCase()}**`
          );
        }, 250);
        return;
      }

      if (cmd === '/clear' || cmd === '/reset') {
        setMessages([
          {
            id: Date.now().toString(),
            role: 'bot',
            text: '🧹 **Контекст текущего диалога очищен!**\nДолгосрочная память сохранена (посмотреть — `/memory`).',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        return;
      }

      if (cmd === '/memory' || cmd === '/memories') {
        setTimeout(() => {
          if (memories.length === 0) {
            addBotMessage(
              '📭 В долгосрочной памяти пока нет записей.\nРасскажите мне о своих целях, профессии или интересах — я запомню это автоматически!'
            );
          } else {
            const list = memories.map((m, idx) => `${idx + 1}. • ${m}`).join('\n');
            addBotMessage(`🧠 **Долгосрочная память Sana AI (что я знаю о вас):**\n\n${list}`, {
              inlineKeyboard: [[{ text: '🗑 Очистить память (/forget)', callback_data: 'clear_memories' }]],
            });
          }
        }, 250);
        return;
      }

      if (cmd === '/forget') {
        setMemories([]);
        setTimeout(() => {
          addBotMessage('🗑 Долгосрочная память полностью очищена.');
        }, 250);
        return;
      }

      if (cmd === '/mode') {
        const modes = [
          { key: 'mentor', name: '🧠 Ментор (Socratic)' },
          { key: 'coder', name: '💻 Программист (Senior Dev)' },
          { key: 'planner', name: '📅 Планировщик (GTD)' },
          { key: 'examiner', name: '🎓 Экзаменатор (Strict)' },
          { key: 'editor', name: '✍️ Редактор (Copywriter)' },
        ];
        const keyboard = modes.map((m) => [
          {
            text: `${m.key === user.active_mode ? '✅ ' : ''}${m.name}`,
            callback_data: `set_mode:${m.key}`,
          },
        ]);
        setTimeout(() => {
          addBotMessage('🎭 **Выберите режим работы Sana AI:**', { inlineKeyboard: keyboard });
        }, 250);
        return;
      }

      if (cmd === '/plan') {
        const requestText = text.substring(5).trim();
        if (!requestText) {
          addBotMessage(
            '📅 Пожалуйста, укажите задачу после команды.\nПример: `/plan Позвонить маме через 1 минуту`'
          );
          return;
        }
        setIsTyping(true);
        try {
          const res = await fetch('/api/parse-reminder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: requestText, current_time: new Date().toISOString() }),
          });
          const data = await res.json();
          setIsTyping(false);

          if (data && data.title && data.due_at) {
            const dueDate = new Date(data.due_at);
            setReminders((prev) => [
              ...prev,
              { id: Date.now().toString(), title: data.title, due_at: dueDate, completed: false },
            ]);
            addBotMessage(
              `✅ **Напоминание установлено!**\n\n📌 **Задача:** ${data.title}\n🕒 **Время:** ${dueDate.toLocaleTimeString()}`
            );
          } else {
            addBotMessage('⚠️ Не удалось распознать время в вашем запросе. Попробуйте указать точнее.');
          }
        } catch {
          setIsTyping(false);
          addBotMessage('⚠️ Ошибка при создании напоминания.');
        }
        return;
      }

      if (cmd === '/reminders' || cmd === '/tasks') {
        const active = reminders.filter((r) => !r.completed);
        if (active.length === 0) {
          addBotMessage('📭 У вас нет активных напоминаний.\nСоздайте задачу с помощью `/plan [текст]`');
        } else {
          const list = active
            .map((r, i) => `${i + 1}. **${r.title}** — _${r.due_at.toLocaleTimeString()}_`)
            .join('\n');
          const kb = active.map((r) => [
            { text: `✅ Выполнить: ${r.title.slice(0, 22)}`, callback_data: `rem_done:${r.id}` },
            { text: '🗑 Удалить', callback_data: `rem_del:${r.id}` },
          ]);
          addBotMessage(`📋 **Ваши активные напоминания:**\n\n${list}`, { inlineKeyboard: kb });
        }
        return;
      }

      if (cmd === '/subscribe' || cmd === '/pro') {
        if (user.tier === 'PRO') {
          addBotMessage('🌟 У вас уже активирована подписка **Sana PRO**! Наслаждайтесь безлимитным общением.');
          return;
        }
        setTimeout(() => {
          addBotMessage(
            '💎 **Подписка Sana PRO (1 месяц)**\n\nОткройте полный потенциал вашего ИИ-ментора:\n• Безлимитные запросы\n• Доступ к флагманской модели **Gemini 2.5 Pro**\n• Анализ больших PDF документов и аудио\n\nК оплате: **250 ⭐️ (Telegram Stars)**',
            { isInvoice: true }
          );
        }, 250);
        return;
      }

      if (cmd === '/admin') {
        setTimeout(() => {
          addBotMessage(
            `📊 **Панель Администратора Sana AI**\n\n` +
              `👥 Всего пользователей: **1,248**\n` +
              `💎 Подписчиков PRO: **142**\n` +
              `⏰ Активных напоминаний: **${reminders.filter((r) => !r.completed).length}**\n` +
              `⭐️ Выручка (Stars): **35,500 XTR**\n\n` +
              `Команды:\n` +
              `• \`/grant_pro [user_id]\` — выдать PRO\n` +
              `• \`/ban [user_id]\` — заблокировать\n` +
              `• \`/broadcast [текст]\` — рассылка`
          );
        }, 250);
        return;
      }

      if (cmd === '/grant_pro') {
        setUser((prev) => ({ ...prev, tier: 'PRO' }));
        addBotMessage(`✅ Пользователю \`${parts[1] || user.id}\` успешно выдан статус **PRO**!`);
        return;
      }

      if (cmd === '/broadcast') {
        const bText = text.replace(/^\/broadcast\s*/i, '').trim();
        if (!bText) {
          addBotMessage('Использование: `/broadcast Текст рассылки для всех пользователей`');
          return;
        }
        addBotMessage(`✅ **Рассылка завершена!**\n📨 Доставлено: **1,248 пользователям**\nТекст: «${bText}»`);
        return;
      }

      if (cmd === '/export') {
        setTimeout(() => {
          let md = `# 🧠 История диалогов с Sana AI\nДата экспорта: ${new Date().toISOString()}\n\n---\n\n`;
          if (memories.length > 0) {
            md += `## 📌 Долгосрочная память\n${memories.map((m) => `- ${m}`).join('\n')}\n\n---\n\n`;
          }
          messages.forEach((m) => {
            const role = m.role === 'user' ? '👤 Вы' : '🤖 Sana AI';
            md += `### ${role} (${m.timestamp})\n${m.text}\n\n---\n\n`;
          });
          addBotMessage('📄 Ваша полная история диалогов в формате Markdown готова к скачиванию.', {
            isDocument: { filename: `sana_ai_history_${user.id}.md`, content: md },
          });
        }, 350);
        return;
      }

      addBotMessage('⚠️ Неизвестная команда. Напишите `/help` для просмотра всех возможностей.');
      return;
    }

    // 3. Regular Dialog Message (with Quota Check & Streaming)
    if (!checkQuotaPrecondition()) return;

    const botMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      {
        id: botMsgId,
        role: 'bot',
        text: '⏳ _Sana думает..._',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isStreaming: true,
      },
    ]);

    try {
      const historyForApi = messages
        .filter((m) => !m.isInvoice && !m.isDocument && !m.inlineKeyboard)
        .slice(-15)
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'model',
          content: m.text,
        }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyForApi,
          memories,
          mode: user.active_mode,
          language: user.language,
          tier: user.tier,
        }),
      });

      if (!response.body) throw new Error('No body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let streamSuccess = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (dataStr === '[DONE]') break;
            try {
              const data = JSON.parse(dataStr);
              if (data.text) {
                fullText += data.text;
                streamSuccess = true;
                setMessages((prev) =>
                  prev.map((m) => (m.id === botMsgId ? { ...m, text: fullText + ' ▌' } : m))
                );
              }
            } catch {
              // ignore partial JSON chunk
            }
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId ? { ...m, text: fullText || 'Ответ получен.', isStreaming: false } : m
        )
      );

      if (streamSuccess) {
        consumeQuotaOnSuccess();

        // Trigger Background Memory Extraction
        fetch('/api/extract-memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_message: text, bot_response: fullText }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.facts && Array.isArray(data.facts) && data.facts.length > 0) {
              setMemories((prev) => Array.from(new Set([...prev, ...data.facts])));
            }
          })
          .catch(() => {});
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId
            ? {
                ...m,
                text: '⚠️ Произошла ошибка при генерации ответа. Ваша квота не была списана.',
                isStreaming: false,
              }
            : m
        )
      );
    }
  };

  // Handle Inline Keyboard Callbacks
  const handleCallback = (data: string, msgId: string) => {
    if (data.startsWith('set_lang:')) {
      const lang = data.split(':')[1];
      setUser((prev) => ({ ...prev, language: lang }));
      const langMap: Record<string, string> = {
        ru: '🇷🇺 Язык успешно изменён на Русский! Напишите свой вопрос или используйте `/mode`.',
        kk: '🇰🇿 Тіл Қазақшаға сәтті ауыстырылды! Сұрағыңызды жазыңыз немесе `/mode` таңдаңыз.',
        en: '🇬🇧 Language switched to English! Ask me anything or use `/mode`.',
      };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, text: langMap[lang], inlineKeyboard: undefined } : m
        )
      );
    } else if (data.startsWith('set_mode:')) {
      const mode = data.split(':')[1];
      setUser((prev) => ({ ...prev, active_mode: mode }));
      const modes = [
        { key: 'mentor', name: '🧠 Ментор (Socratic)' },
        { key: 'coder', name: '💻 Программист (Senior Dev)' },
        { key: 'planner', name: '📅 Планировщик (GTD)' },
        { key: 'examiner', name: '🎓 Экзаменатор (Strict)' },
        { key: 'editor', name: '✍️ Редактор (Copywriter)' },
      ];
      const keyboard = modes.map((m) => [
        { text: `${m.key === mode ? '✅ ' : ''}${m.name}`, callback_data: `set_mode:${m.key}` },
      ]);
      const modeName = modes.find((m) => m.key === mode)?.name;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, text: `✅ Активный режим изменён на: **${modeName}**`, inlineKeyboard: keyboard }
            : m
        )
      );
    } else if (data === 'clear_memories') {
      setMemories([]);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, text: '🗑 Долгосрочная память полностью очищена.', inlineKeyboard: undefined }
            : m
        )
      );
    } else if (data.startsWith('rem_done:')) {
      const remId = data.split(':')[1];
      setReminders((prev) => prev.map((r) => (r.id === remId ? { ...r, completed: true } : r)));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, text: '✅ Задача отмечена выполненной!', inlineKeyboard: undefined }
            : m
        )
      );
    } else if (data.startsWith('rem_del:')) {
      const remId = data.split(':')[1];
      setReminders((prev) => prev.filter((r) => r.id !== remId));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, text: '🗑 Напоминание удалено.', inlineKeyboard: undefined } : m
        )
      );
    }
  };

  // Handle Real File Upload
  const handleRealFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowAttachMenu(false);

    if (!checkQuotaPrecondition()) return;

    addUserMessage(`📎 [Файл: ${file.name}] Проанализируй содержимое и выдели главное.`);
    const botMsgId = Date.now().toString();
    setMessages((prev) => [
      ...prev,
      {
        id: botMsgId,
        role: 'bot',
        text: `📥 _Читаю и анализирую файл «${file.name}»..._`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    try {
      const isText =
        file.type.startsWith('text/') ||
        /\.(txt|md|py|js|ts|tsx|json|csv)$/i.test(file.name);

      let textContent = '';
      let base64 = '';

      if (isText) {
        textContent = await file.text();
      } else {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64 = btoa(binary);
      }

      const res = await fetch('/api/analyze-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: file.name,
          mime_type: file.type || 'application/octet-stream',
          file_base64: base64 || undefined,
          text_content: textContent || undefined,
          prompt: `Проанализируй файл ${file.name} и составь структурированное резюме.`,
          tier: user.tier,
        }),
      });
      const data = await res.json();
      consumeQuotaOnSuccess();
      setMessages((prev) =>
        prev.map((m) => (m.id === botMsgId ? { ...m, text: data.text || 'Анализ завершён.' } : m))
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId ? { ...m, text: '⚠️ Ошибка при анализе файла.' } : m
        )
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Simulate Demo Media Uploads
  const simulateMedia = async (type: 'pdf' | 'photo' | 'voice') => {
    setShowAttachMenu(false);
    if (!checkQuotaPrecondition()) return;

    if (type === 'pdf') {
      addUserMessage('📄 [Документ: architecture_spec.pdf]\nСделай резюме этого документа.');
      const botMsgId = Date.now().toString();
      setMessages((prev) => [
        ...prev,
        {
          id: botMsgId,
          role: 'bot',
          text: '📥 _Загружаю и анализирую PDF документ (в ThreadPoolExecutor)..._',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      setTimeout(async () => {
        await handleSend(
          'Проанализируй следующий текст из PDF документа и сделай краткое резюме: "Sana AI — это мультимодальный бот на базе Gemini 2.5 и aiogram 3.x. Он использует асинхронный SQLAlchemy 2.0 для работы с PostgreSQL и Redis для FSM-состояний и троттлинга. Главная цель — помочь пользователю учиться через сократовский метод."'
        );
        setMessages((prev) => prev.filter((m) => m.id !== botMsgId));
      }, 900);
    } else if (type === 'photo') {
      addUserMessage('🖼 [Фото: math_equation.jpg]\nОбъясни, как решить это уравнение.');
      setTimeout(() => {
        handleSend(
          'Пользователь прислал фото с квадратным уравнением: x^2 - 5x + 6 = 0. Объясни пошагово, как его решить через дискриминант и теорему Виета.'
        );
      }, 400);
    } else if (type === 'voice') {
      addUserMessage('🎙 [Голосовое сообщение: 0:12]');
      const botMsgId = Date.now().toString();
      setMessages((prev) => [
        ...prev,
        {
          id: botMsgId,
          role: 'bot',
          text: '🎙 _Слушаю и транскрибирую голосовое сообщение..._',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      setTimeout(() => {
        const transcription =
          'Привет, Сана! Расскажи кратко, в чём разница между процессами и потоками в операционных системах?';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMsgId ? { ...m, text: `🎙 **Вы сказали:**\n_"${transcription}"_` } : m
          )
        );
        handleSend(transcription);
      }, 1100);
    }
  };

  const handlePayInvoice = (msgId: string) => {
    setUser((prev) => ({ ...prev, tier: 'PRO' }));
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, isInvoice: false, text: m.text + '\n\n✅ **ОПЛАЧЕНО (250 XTR)**' } : m
      )
    );
    addBotMessage(
      '🎉 **Оплата прошла успешно!**\n\nДобро пожаловать в **Sana PRO**! Теперь вам доступны безлимитные запросы и флагманская модель **Gemini 2.5 Pro**.'
    );
  };

  const renderFormattedText = (text: string) => {
    // Rich markdown renderer supporting code blocks, bold, italic, inline code, spoilers
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        const firstLine = lines[0]?.trim() || '';
        const hasLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
        const codeContent = hasLang ? lines.slice(1).join('\n') : lines.join('\n');
        return (
          <pre
            key={idx}
            className="my-2 p-2.5 bg-[#0e1621] text-emerald-300 rounded-lg overflow-x-auto text-xs font-mono border border-slate-700/60"
          >
            <code>{codeContent}</code>
          </pre>
        );
      }

      return (
        <span key={idx} className="whitespace-pre-wrap">
          {part.split('\n').map((line, i, arr) => (
            <React.Fragment key={i}>
              {line.split(/(\*\*.*?\*\*|`.*?`|\|\|.*?\|\||_.*?_)/g).map((seg, j) => {
                if (seg.startsWith('**') && seg.endsWith('**')) {
                  return (
                    <strong key={j} className="font-bold text-white">
                      {seg.slice(2, -2)}
                    </strong>
                  );
                }
                if (seg.startsWith('`') && seg.endsWith('`')) {
                  return (
                    <code
                      key={j}
                      className="px-1.5 py-0.5 bg-black/30 text-indigo-200 rounded text-xs font-mono"
                    >
                      {seg.slice(1, -1)}
                    </code>
                  );
                }
                if (seg.startsWith('||') && seg.endsWith('||')) {
                  return (
                    <span
                      key={j}
                      title="Наведите, чтобы увидеть спойлер"
                      className="bg-slate-600 text-transparent hover:bg-slate-700/60 hover:text-slate-100 rounded px-1 transition-colors cursor-pointer"
                    >
                      {seg.slice(2, -2)}
                    </span>
                  );
                }
                if (seg.startsWith('_') && seg.endsWith('_') && seg.length > 2) {
                  return (
                    <em key={j} className="italic text-slate-300">
                      {seg.slice(1, -1)}
                    </em>
                  );
                }
                return seg;
              })}
              {i < arr.length - 1 && <br />}
            </React.Fragment>
          ))}
        </span>
      );
    });
  };

  return (
    <div className="flex h-full w-full bg-slate-950 overflow-hidden relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 border border-indigo-500/40 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm animate-in fade-in slide-in-from-top-2">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Connect Real Telegram Bot Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Подключить реального Telegram-бота</h3>
                  <p className="text-xs text-slate-400">Запуск живого Long-Polling прямо с этого сервера</p>
                </div>
              </div>
              <button
                onClick={() => setShowConnectModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {liveBotStatus.running && liveBotStatus.botInfo && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                <div className="text-xs">
                  <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Активен: @{liveBotStatus.botInfo.username}
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    Обработано событий: {liveBotStatus.processedUpdates}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleStopLiveBot}
                  className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-medium transition-colors"
                >
                  Остановить
                </button>
              </div>
            )}

            <form onSubmit={handleConnectLiveBot} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Telegram Bot Token (от @BotFather)
                </label>
                <input
                  type="password"
                  value={botTokenInput}
                  onChange={(e) => setBotTokenInput(e.target.value)}
                  placeholder="1234567890:AAH_ваш_токен_от_BotFather..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Если указать токен, вы сможете писать боту прямо со своего телефона в Telegram!
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Google Gemini API Key (опционально)
                </label>
                <input
                  type="password"
                  value={geminiKeyInput}
                  onChange={(e) => setGeminiKeyInput(e.target.value)}
                  placeholder={
                    liveBotStatus.hasGeminiKey
                      ? '✅ Ключ уже настроен (введите новый для замены)'
                      : 'AIzaSy_ваш_ключ_Gemini_API...'
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Даже без ключа бот работает на встроенном интеллектуальном движке Sana Mentor.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isConnectingBot}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  {isConnectingBot ? 'Подключение...' : '🚀 Сохранить и запустить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden File Input for real uploads */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleRealFileUpload}
        className="hidden"
        accept=".pdf,.docx,.txt,.md,.py,.js,.ts,.json,.csv,image/*"
      />

      {/* Left Column: Telegram Phone Simulator */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-6 bg-radial from-slate-900 to-slate-950">
        <div className="w-full max-w-[430px] h-[760px] max-h-full bg-[#0e1621] rounded-[36px] border-[8px] border-slate-800 shadow-2xl flex flex-col overflow-hidden relative">
          {/* Telegram Header */}
          <div className="bg-[#17212b] px-4 py-3 flex items-center justify-between border-b border-slate-800/80 z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold text-lg shadow-inner">
                S
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-white font-semibold text-sm">Sana AI Mentor</h2>
                  <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                    bot
                  </span>
                </div>
                <p className="text-[#6c7883] text-xs">
                  {isTyping
                    ? 'печатает...'
                    : liveBotStatus.running && liveBotStatus.botInfo
                    ? `🟢 Live: @${liveBotStatus.botInfo.username}`
                    : 'в сети • ИИ-ментор'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowConnectModal(true)}
                title="Подключить реального Telegram-бота (@BotFather) или API-ключ"
                className={`text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors border ${
                  liveBotStatus.running
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-[#242f3d] hover:bg-[#2b3848] text-slate-300 border-slate-700'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{liveBotStatus.running ? 'Live ON' : 'API / Бот'}</span>
              </button>
              <button
                onClick={() => handleSend('/mode')}
                className="text-xs bg-[#242f3d] hover:bg-[#2b3848] text-indigo-300 px-2.5 py-1.5 rounded-lg transition-colors border border-slate-700"
              >
                /mode
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0e1621] scrollbar-thin">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm relative ${
                    msg.role === 'user'
                      ? 'bg-[#2b5278] text-white rounded-br-xs'
                      : 'bg-[#182533] text-slate-100 rounded-bl-xs'
                  } shadow-sm`}
                >
                  <div className="leading-relaxed break-words">{renderFormattedText(msg.text)}</div>

                  {/* Document Attachment */}
                  {msg.isDocument && (
                    <div className="mt-3 p-2.5 bg-[#0e1621]/60 rounded-xl border border-slate-700/50 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-medium text-white truncate">
                            {msg.isDocument.filename}
                          </div>
                          <div className="text-[10px] text-slate-400">Markdown Document</div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const blob = new Blob([msg.isDocument!.content], { type: 'text/markdown' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = msg.isDocument!.filename;
                          a.click();
                        }}
                        className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs flex items-center gap-1 shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" /> Скачать
                      </button>
                    </div>
                  )}

                  {/* Telegram Stars Invoice */}
                  {msg.isInvoice && (
                    <div className="mt-3 pt-3 border-t border-slate-700/60">
                      <button
                        onClick={() => handlePayInvoice(msg.id)}
                        className="w-full py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/10 transition-all"
                      >
                        <Star className="w-4 h-4 fill-slate-950" /> Заплатить 250 ⭐️
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-[#6c7883]">{msg.timestamp}</span>
                    {msg.role === 'user' && <CheckCheck className="w-3 h-3 text-[#53bdeb]" />}
                  </div>
                </div>

                {/* Inline Keyboard */}
                {msg.inlineKeyboard && (
                  <div className="w-full max-w-[86%] mt-1 space-y-1">
                    {msg.inlineKeyboard.map((row, rIdx) => (
                      <div key={rIdx} className="flex gap-1">
                        {row.map((btn, bIdx) => (
                          <button
                            key={bIdx}
                            onClick={() => handleCallback(btn.callback_data, msg.id)}
                            className="flex-1 py-2 px-3 bg-[#202b36]/90 hover:bg-[#293644] text-white text-xs font-medium rounded-xl transition-colors text-center border border-slate-800/50"
                          >
                            {btn.text}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Commands Bar */}
          <div className="bg-[#17212b] px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto border-t border-slate-800/60 scrollbar-none">
            {[
              { cmd: '/mode', label: '🎭 Режим' },
              { cmd: '/plan Позвонить через 1 минуту', label: '⏰ Напоминание' },
              { cmd: '/reminders', label: '📋 Задачи' },
              { cmd: '/memory', label: '🧠 Память' },
              { cmd: '/profile', label: '👤 Профиль' },
              { cmd: '/subscribe', label: '⭐️ PRO' },
              { cmd: '/export', label: '📦 Экспорт' },
              { cmd: '/clear', label: '🧹 Очистить' },
              { cmd: '/help', label: '❓ Помощь' },
            ].map((item) => (
              <button
                key={item.cmd}
                onClick={() => handleSend(item.cmd)}
                className="text-[11px] bg-[#242f3d] hover:bg-[#2e3c4e] text-slate-300 px-2.5 py-1 rounded-full whitespace-nowrap transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="bg-[#17212b] px-3 py-2.5 flex items-center gap-2 border-t border-slate-800 relative">
            {/* Attach Menu Popup */}
            {showAttachMenu && (
              <div className="absolute bottom-14 left-3 bg-[#1c2733] border border-slate-700 rounded-2xl p-2 shadow-xl flex flex-col gap-1 w-60 z-20">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-800 rounded-xl text-xs text-emerald-300 text-left font-medium"
                >
                  <Paperclip className="w-4 h-4 text-emerald-400" /> Загрузить свой файл с ПК...
                </button>
                <div className="h-px bg-slate-800 my-0.5" />
                <button
                  onClick={() => simulateMedia('pdf')}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-800 rounded-xl text-xs text-slate-200 text-left"
                >
                  <FileText className="w-4 h-4 text-rose-400" /> Демо PDF документ
                </button>
                <button
                  onClick={() => simulateMedia('photo')}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-800 rounded-xl text-xs text-slate-200 text-left"
                >
                  <ImageIcon className="w-4 h-4 text-emerald-400" /> Демо фото задачи
                </button>
                <button
                  onClick={() => simulateMedia('voice')}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-800 rounded-xl text-xs text-slate-200 text-left"
                >
                  <Mic className="w-4 h-4 text-amber-400" /> Демо голосовое (Voice)
                </button>
              </div>
            )}

            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="p-2 text-[#6c7883] hover:text-slate-200 transition-colors"
              title="Прикрепить файл или фото"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Написать сообщение..."
              className="flex-1 bg-transparent text-white text-sm placeholder-[#6c7883] focus:outline-none"
            />

            {inputText.trim() ? (
              <button
                onClick={() => handleSend()}
                className="p-2 bg-[#5288c1] hover:bg-[#6197d1] text-white rounded-full transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => simulateMedia('voice')}
                title="Отправить тестовое голосовое сообщение"
                className="p-2 text-[#6c7883] hover:text-amber-400 transition-colors"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Live Internal State Inspector (DB / Redis / Memory) */}
      <div className="w-96 border-l border-slate-800 bg-slate-900/50 p-5 overflow-y-auto hidden xl:flex flex-col gap-5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" /> Live State Inspector
            </h3>
            <button
              onClick={() => setShowConnectModal(true)}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Настроить API
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Визуализация работы PostgreSQL, Redis и фоновых воркеров в реальном времени.
          </p>
        </div>

        {/* Live Telegram Bot Connection Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-indigo-400" /> Реальный Telegram Бот
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                liveBotStatus.running
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {liveBotStatus.running ? 'ONLINE' : 'STANDBY'}
            </span>
          </div>
          {liveBotStatus.running && liveBotStatus.botInfo ? (
            <div className="text-xs text-slate-300 space-y-1">
              <div>
                Бот: <span className="text-indigo-400 font-mono">@{liveBotStatus.botInfo.username}</span>
              </div>
              <div className="text-slate-400">
                Обработано сообщений: <strong className="text-white">{liveBotStatus.processedUpdates}</strong>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Вы можете подключить токен от <code>@BotFather</code> и общаться с ботом прямо в Telegram.
            </p>
          )}
          <button
            onClick={() => setShowConnectModal(true)}
            className="w-full py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium transition-colors"
          >
            {liveBotStatus.running ? '⚙️ Управление подключением' : '🔌 Подключить @BotFather токен'}
          </button>
        </div>

        {/* User DB Record */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> Таблица `users`
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                user.tier === 'PRO'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {user.tier} TIER
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/60">
              <div className="text-slate-500 text-[10px]">Активный режим</div>
              <div className="text-indigo-400 font-mono font-medium mt-0.5">{user.active_mode}</div>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/60">
              <div className="text-slate-500 text-[10px]">Язык (i18n)</div>
              <div className="text-emerald-400 font-mono font-medium mt-0.5">
                {user.language.toUpperCase()}
              </div>
            </div>
            <div className="col-span-2 bg-slate-950 p-2 rounded-lg border border-slate-800/60 flex items-center justify-between">
              <div>
                <div className="text-slate-500 text-[10px]">Дневная квота запросов</div>
                <div className="text-slate-200 font-mono font-medium mt-0.5">
                  {user.daily_requests_count} / {user.tier === 'PRO' ? '∞' : '20'}
                </div>
              </div>
              <button
                onClick={() => setUser((prev) => ({ ...prev, tier: prev.tier === 'PRO' ? 'FREE' : 'PRO' }))}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700"
              >
                Сменить тариф
              </button>
            </div>
          </div>
        </div>

        {/* Long-Term Memory (`user_memories`) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-purple-400" /> Долгосрочная память
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500">{memories.length} фактов</span>
              {memories.length > 0 && (
                <button
                  onClick={() => setMemories([])}
                  title="Очистить память"
                  className="text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Фоновый `memory_service.py` анализирует каждый ваш ответ и автоматически извлекает важные факты в таблицу `user_memories`:
          </p>
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {memories.map((mem, idx) => (
              <div
                key={idx}
                className="text-xs bg-slate-950 border border-slate-800/80 p-2 rounded-lg text-slate-300 flex items-start gap-2"
              >
                <Check className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                <span>{mem}</span>
              </div>
            ))}
          </div>
        </div>

        {/* APScheduler Reminders (`reminders`) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" /> APScheduler Задачи
            </span>
            <span className="text-[10px] text-slate-500">
              {reminders.filter((r) => !r.completed).length} активных
            </span>
          </div>
          {reminders.length === 0 ? (
            <div className="text-xs text-slate-500 italic py-2 text-center bg-slate-950 rounded-lg border border-slate-800/50">
              Напишите `/plan Позвонить через 1 минуту` в чат
            </div>
          ) : (
            <div className="space-y-1.5">
              {reminders.map((rem) => (
                <div
                  key={rem.id}
                  className={`text-xs p-2 rounded-lg border flex items-center justify-between ${
                    rem.completed
                      ? 'bg-slate-950/40 border-slate-800/40 text-slate-500 line-through'
                      : 'bg-slate-950 border-amber-500/30 text-slate-200'
                  }`}
                >
                  <span className="truncate pr-2">{rem.title}</span>
                  <span className="text-[10px] font-mono text-amber-400 shrink-0">
                    {rem.due_at.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TelegramSimulator;
