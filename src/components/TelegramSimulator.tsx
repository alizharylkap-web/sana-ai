import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Mic,
  Paperclip,
  Sparkles,
  Bot,
  User as UserIcon,
  Check,
  Clock,
  BookOpen,
  Calendar,
  Share2,
  FileText,
  Volume2,
  Image as ImageIcon,
  Flame,
  CheckCircle2,
  X,
  CreditCard,
  Download,
  Brain,
  HelpCircle
} from 'lucide-react';
import { UserProfile, ChatMessage, UserReminder, BotMode, Language } from '../types/index.ts';

interface Props {
  user: UserProfile;
  setUser: React.Dispatch<React.SetStateAction<UserProfile>>;
  reminders: UserReminder[];
  setReminders: React.Dispatch<React.SetStateAction<UserReminder[]>>;
  memories: string[];
  setMemories: React.Dispatch<React.SetStateAction<string[]>>;
  onOpenAdmin: () => void;
}

export const TelegramSimulator: React.FC<Props> = ({
  user,
  setUser,
  reminders,
  setReminders,
  memories,
  setMemories,
  onOpenAdmin,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState(0);

  // Modals & Panels
  const [showStarsModal, setShowStarsModal] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [newFactInput, setNewFactInput] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isBotTyping]);

  // Voice recording timer simulation
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordTimer((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordTimer(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Initialize with onboarding if needed
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome_1',
          role: 'model',
          content: `👋 *Привет! Я Sana AI* — твой умный наставник и второй мозг для учёбы и работы.\n\nДавай настроим профиль за 3 быстрых шага, чтобы я давал максимально точные ответы.\n\n*Шаг 1 из 3:* Как к тебе обращаться?`,
          timestamp: '10:00',
          inlineButtons: [
            { text: 'Димаш 👨‍🎓', data: 'set_name_Димаш' },
            { text: 'Айгерим 👩‍💻', data: 'set_name_Айгерим' },
            { text: 'Александр 💻', data: 'set_name_Александр' },
          ],
        },
      ]);
    }
  }, []);

  // Format time HH:MM
  const getCurrTime = () => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  // Execute bot command or send message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    if (!textToSend) {
      setInputText('');
    }

    // Handle bot commands
    if (text.startsWith('/')) {
      handleBotCommand(text);
      return;
    }

    // Check user quota
    if (!user.isPro && user.queriesUsedToday >= user.dailyLimit && user.bonusQueries <= 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'user',
          content: text,
          timestamp: getCurrTime(),
        },
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: `🛑 *Дневной лимит 20 запросов исчерпан!*\n\nЛимит обновится в 00:00 по твоему часовому поясу (${user.timezone}).\n\n✨ Пригласи друга по реферальной ссылке и получи **+10 бонусных запросов**, или подключи безлимитный **Sana Pro**!`,
          timestamp: getCurrTime(),
          inlineButtons: [
            { text: '⭐ Подключить Sana Pro (100 Stars)', data: 'open_stars' },
            { text: '🎁 Реферальная ссылка (+10)', data: 'open_referral' },
          ],
        },
      ]);
      return;
    }

    // Deduct query from quota
    setUser((prev) => {
      if (prev.isPro) return prev;
      if (prev.queriesUsedToday < prev.dailyLimit) {
        return { ...prev, queriesUsedToday: prev.queriesUsedToday + 1 };
      }
      return { ...prev, bonusQueries: Math.max(0, prev.bonusQueries - 1) };
    });

    // Check if natural reminder phrase: "напомни..."
    if (text.toLowerCase().startsWith('напомни')) {
      await handleNaturalReminder(text);
      return;
    }

    // Standard Chat with Gemini
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: text,
      timestamp: getCurrTime(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsBotTyping(true);

    try {
      // Call server streaming API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          mode: user.mode,
          language: user.language,
          memories: memories,
          userProfile: {
            name: user.name,
            studyGoal: user.studyGoal,
            timezone: user.timezone,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('API server error');
      }

      const botMsgId = String(Date.now() + 1);
      const botMsg: ChatMessage = {
        id: botMsgId,
        role: 'model',
        content: '',
        timestamp: getCurrTime(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, botMsg]);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.replace('data: ', '').trim());
                if (parsed.text) {
                  accumulated += parsed.text;
                  setMessages((prev) =>
                    prev.map((m) => (m.id === botMsgId ? { ...m, content: accumulated } : m))
                  );
                }
                if (parsed.done) {
                  setMessages((prev) =>
                    prev.map((m) => (m.id === botMsgId ? { ...m, isStreaming: false } : m))
                  );
                }
              } catch (e) {
                // ignore SSE parse errors
              }
            }
          }
        }
      }

      // Periodically trigger background fact extraction
      if (messages.length > 0 && messages.length % 4 === 0) {
        extractMemoriesSilently([...messages, userMsg]);
      }
    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 2),
          role: 'model',
          content: '⚠️ Не удалось связаться с сервером Sana AI. Пожалуйста, проверьте подключение.',
          timestamp: getCurrTime(),
        },
      ]);
    } finally {
      setIsBotTyping(false);
    }
  };

  // Background memory extractor
  const extractMemoriesSilently = async (allMsgs: ChatMessage[]) => {
    try {
      const res = await fetch('/api/extract-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: allMsgs.slice(-6).map((m) => `${m.role}: ${m.content}`),
        }),
      });
      const data = await res.json();
      if (data.facts && Array.isArray(data.facts) && data.facts.length > 0) {
        setMemories((prev) => Array.from(new Set([...prev, ...data.facts])));
      }
    } catch (e) {
      // silent background fail
    }
  };

  // Natural reminder parser
  const handleNaturalReminder = async (text: string) => {
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: text,
      timestamp: getCurrTime(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsBotTyping(true);

    try {
      const res = await fetch('/api/parse-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, timezone: user.timezone }),
      });
      const data = await res.json();

      if (data.title && data.datetime_iso) {
        const newRem: UserReminder = {
          id: String(Date.now()),
          title: data.title,
          datetimeIso: data.datetime_iso,
          isCompleted: false,
        };
        setReminders((prev) => [newRem, ...prev]);

        const formattedDate = new Date(data.datetime_iso).toLocaleString('ru-RU', {
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        });

        setMessages((prev) => [
          ...prev,
          {
            id: String(Date.now() + 1),
            role: 'model',
            content: `✅ *Напоминание успешно создано!*\n\n📌 **Задача:** ${data.title}\n⏰ **Время:** ${formattedDate} (${user.timezone})\n\nЯ пришлю уведомление вовремя. Список всех задач: /reminders`,
            timestamp: getCurrTime(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: String(Date.now() + 1),
            role: 'model',
            content: `Пожалуйста, укажи точнее время и дату события. Например:\n\n_«Напомни завтра в 14:00 сдать реферат по экономике»_`,
            timestamp: getCurrTime(),
          },
        ]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: 'Ошибка при сохранении напоминания. Попробуйте еще раз.',
          timestamp: getCurrTime(),
        },
      ]);
    } finally {
      setIsBotTyping(false);
    }
  };

  // Bot commands dispatcher
  const handleBotCommand = (cmd: string) => {
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: cmd,
      timestamp: getCurrTime(),
    };

    const cleanCmd = cmd.toLowerCase().trim();

    if (cleanCmd === '/start') {
      setUser((prev) => ({ ...prev, onboardingStep: 1 }));
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: `👋 *Привет! Я Sana AI* — твой умный наставник и второй мозг для учёбы и работы.\n\nДавай настроим профиль за 3 быстрых шага:\n\n*Шаг 1 из 3:* Как к тебе обращаться?`,
          timestamp: getCurrTime(),
          inlineButtons: [
            { text: 'Димаш 👨‍🎓', data: 'set_name_Димаш' },
            { text: 'Айгерим 👩‍💻', data: 'set_name_Айгерим' },
            { text: 'Александр 💻', data: 'set_name_Александр' },
          ],
        },
      ]);
    } else if (cleanCmd === '/mode') {
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: `🧭 *Выберите рабочий режим Sana AI:*\n\nКаждый режим меняет системные инструкции и методику общения с вами:`,
          timestamp: getCurrTime(),
          inlineButtons: [
            { text: '🎓 Наставник', data: 'mode_mentor' },
            { text: '✍️ Редактор текстов', data: 'mode_editor' },
            { text: '📅 Планировщик', data: 'mode_planner' },
            { text: '📝 Экзаменатор', data: 'mode_examiner' },
            { text: '💻 Кодер', data: 'mode_coder' },
          ],
        },
      ]);
    } else if (cleanCmd === '/plan' || cleanCmd === '/upgrade') {
      setShowStarsModal(true);
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: `⭐ *Тарифные планы Sana AI*\n\nТвой текущий статус: **${user.isPro ? 'Sana Pro (Активен)' : 'Free план'}**\n\n• **Free:** 20 запросов в день, модель Flash\n• **Sana Pro (100 Stars / 990 ₸ / 1900 ₽):** Безлимит, модель Pro, файлы до 50 МБ, приоритет!`,
          timestamp: getCurrTime(),
          inlineButtons: [
            { text: '⭐ Подключить Pro за 100 Stars', data: 'open_stars' },
            { text: '🎁 Реферальная ссылка (+10)', data: 'open_referral' },
          ],
        },
      ]);
    } else if (cleanCmd === '/reminders') {
      setShowRemindersModal(true);
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: `📋 Открываю список твоих активных напоминаний (${reminders.length} запланировано).`,
          timestamp: getCurrTime(),
        },
      ]);
    } else if (cleanCmd === '/export') {
      exportDialogAsMarkdown();
    } else if (cleanCmd === '/admin') {
      onOpenAdmin();
    } else {
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: `Команда не распознана. Доступные команды:\n• /start — перезапустить онбординг\n• /mode — сменить режим работы\n• /plan или /upgrade — тарифы и подписка\n• /reminders — список напоминаний\n• /export — скачать историю диалога\n• /admin — админ-панель`,
          timestamp: getCurrTime(),
        },
      ]);
    }
  };

  // Handle inline buttons clicks
  const handleInlineClick = async (actionData: string) => {
    if (actionData.startsWith('set_name_')) {
      const selectedName = actionData.replace('set_name_', '');
      setUser((prev) => ({ ...prev, name: selectedName, onboardingStep: 2 }));
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'user',
          content: `Мое имя: ${selectedName}`,
          timestamp: getCurrTime(),
        },
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: `Отлично, ${selectedName}! 🎯\n\n*Шаг 2 из 3:* Какая твоя главная цель сейчас?`,
          timestamp: getCurrTime(),
          inlineButtons: [
            { text: '🎓 Сдать сессию / экзамены', data: 'set_goal_exams' },
            { text: '💻 Научиться программировать', data: 'set_goal_coding' },
            { text: '💼 Работа и фриланс', data: 'set_goal_freelance' },
            { text: '⚡ Личная продуктивность', data: 'set_goal_productivity' },
          ],
        },
      ]);
    } else if (actionData.startsWith('set_goal_')) {
      const goalMap: Record<string, string> = {
        set_goal_exams: 'Сдать экзамены и сессию',
        set_goal_coding: 'Изучить IT и программирование',
        set_goal_freelance: 'Работа и карьера на фрилансе',
        set_goal_productivity: 'Личная продуктивность и тайм-менеджмент',
      };
      const goal = goalMap[actionData] || 'Учёба';
      setUser((prev) => ({ ...prev, studyGoal: goal, onboardingStep: 3 }));
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'user',
          content: `Цель: ${goal}`,
          timestamp: getCurrTime(),
        },
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: `Запомнил цель: *${goal}*! ⏰\n\n*Шаг 3 из 3:* Выбери свой часовой пояс (нужен для точных напоминаний):`,
          timestamp: getCurrTime(),
          inlineButtons: [
            { text: '🇰🇿 Алматы / Астана (UTC+5)', data: 'set_tz_Asia/Almaty' },
            { text: '🇷🇺 Москва / СПб (UTC+3)', data: 'set_tz_Europe/Moscow' },
            { text: '🇺🇿 Ташкент (UTC+5)', data: 'set_tz_Asia/Tashkent' },
            { text: '🇦🇲 Ереван / Тбилиси (UTC+4)', data: 'set_tz_Asia/Yerevan' },
          ],
        },
      ]);
    } else if (actionData.startsWith('set_tz_')) {
      const tz = actionData.replace('set_tz_', '');
      setUser((prev) => ({ ...prev, timezone: tz, onboardingStep: 4 }));
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'user',
          content: `Часовой пояс: ${tz}`,
          timestamp: getCurrTime(),
        },
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: `🎉 *Настройка профиля успешно завершена!*\n\n• Твой тариф: **Free** (20 запросов в день)\n• Текущий режим: **Наставник 🎓**\n• Часовой пояс: **${tz}**\n\n💡 *Что можно сделать прямо сейчас:*\n1. Отправь фото задачи или конспекта — разберу по шагам\n2. Напиши «Напомни завтра в 10:00 сдать курсовую»\n3. Загрузи документ (PDF, DOCX) для конспекта и теста\n4. Задай любой вопрос по учёбе или коду!`,
          timestamp: getCurrTime(),
          inlineButtons: [
            { text: '🧭 Выбрать режим (/mode)', data: 'cmd_mode' },
            { text: '🎁 Моя реферальная ссылка', data: 'open_referral' },
          ],
        },
      ]);
    } else if (actionData.startsWith('mode_')) {
      const newMode = actionData.replace('mode_', '') as BotMode;
      const modeNames: Record<BotMode, string> = {
        mentor: 'Наставник 🎓',
        editor: 'Редактор текстов ✍️',
        planner: 'Планировщик 📅',
        examiner: 'Экзаменатор 📝',
        coder: 'Кодер 💻',
      };
      setUser((prev) => ({ ...prev, mode: newMode }));
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          role: 'user',
          content: `/mode ${newMode}`,
          timestamp: getCurrTime(),
        },
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: `✨ Режим переключен на **${modeNames[newMode]}**!\n\nГотов к работе. Чем могу помочь прямо сейчас?`,
          timestamp: getCurrTime(),
        },
      ]);
    } else if (actionData === 'open_stars') {
      setShowStarsModal(true);
    } else if (actionData === 'open_referral') {
      setShowReferralModal(true);
    } else if (actionData === 'cmd_mode') {
      handleBotCommand('/mode');
    }
  };

  // Simulate Voice message recording and Gemini transcription
  const handleToggleVoiceRecording = async () => {
    if (!isRecording) {
      setIsRecording(true);
    } else {
      setIsRecording(false);
      // Simulate transcribing voice audio
      setIsBotTyping(true);

      const sampleVoiceQueries = [
        'Привет, Sana! Объясни простыми словами, что такое нормализация баз данных и 3 нормальная форма?',
        'Как мне подготовиться к экзамену по матанализу за три дня, если я ничего не помню?',
        'Помоги составить план для диплома по теме разработка телеграм ботов на Python aiogram.',
      ];
      const randomTranscription = sampleVoiceQueries[Math.floor(Math.random() * sampleVoiceQueries.length)];

      const voiceMsg: ChatMessage = {
        id: String(Date.now()),
        role: 'user',
        content: `🎙️ _Голосовое сообщение (0:0${Math.max(3, recordTimer)} с)_`,
        timestamp: getCurrTime(),
        attachment: {
          type: 'voice',
          name: 'voice_note.ogg',
          transcription: randomTranscription,
        },
      };

      setMessages((prev) => [...prev, voiceMsg]);

      // Call Gemini for answering the transcribed voice text
      await handleSendMessage(randomTranscription);
    }
  };

  // Document analysis simulation (PDF/DOCX/TXT)
  const handleAnalyzeDocumentSample = async (sampleName: string, text: string) => {
    setShowAttachMenu(false);
    setIsBotTyping(true);

    const docMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: `📎 Отправлен документ: **${sampleName}** (разбор и тест)`,
      timestamp: getCurrTime(),
      attachment: {
        type: 'file',
        name: sampleName,
      },
    };

    setMessages((prev) => [...prev, docMsg]);

    try {
      const res = await fetch('/api/analyze-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: sampleName, docText: text }),
      });
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: data.analysis || 'Не удалось сформировать разбор документа.',
          timestamp: getCurrTime(),
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'model',
          content: 'Ошибка анализа документа.',
          timestamp: getCurrTime(),
        },
      ]);
    } finally {
      setIsBotTyping(false);
    }
  };

  // Photo / Vision analysis
  const handleAnalyzePhotoSample = async (sampleTitle: string, promptText: string) => {
    setShowAttachMenu(false);
    setIsBotTyping(true);

    const photoMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: `📷 Отправлено фото: **${sampleTitle}**\n_${promptText}_`,
      timestamp: getCurrTime(),
      attachment: {
        type: 'image',
        name: sampleTitle,
      },
    };

    setMessages((prev) => [...prev, photoMsg]);

    await handleSendMessage(`Проанализируй конспект/задачу на фото "${sampleTitle}": ${promptText}. Реши задачу пошагово, объясняя каждое действие.`);
  };

  // Export conversation as Markdown
  const exportDialogAsMarkdown = () => {
    let md = `# Sana AI — Экспорт диалога\n\n`;
    md += `Пользователь: ${user.name} | Цель: ${user.studyGoal} | Часовой пояс: ${user.timezone}\n`;
    md += `Дата экспорта: ${new Date().toLocaleString()}\n\n---\n\n`;

    for (const m of messages) {
      const author = m.role === 'user' ? '👤 Пользователь' : '🧠 Sana AI';
      md += `### ${author} (${m.timestamp})\n${m.content}\n\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sana_ai_dialog_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);

    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        role: 'model',
        content: `📄 *Файл с историей диалога успешно экспортирован!*\n\nЗагрузка файла .md началась на твоем устройстве.`,
        timestamp: getCurrTime(),
      },
    ]);
  };

  // Activate Pro subscription via Telegram Stars
  const handleConfirmStarsPayment = () => {
    setUser((prev) => ({
      ...prev,
      isPro: true,
      dailyLimit: 999999,
    }));
    setShowStarsModal(false);

    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        role: 'model',
        content: `🎉 *Поздравляем! Подписка Sana Pro активирована за 100 Telegram Stars!*\n\n⭐ Безлимитные запросы без счетчика\n🚀 Модель Gemini Pro с глубоким рассуждением\n📁 Загрузка документов до 50 МБ\n⚡ Приоритетная скорость ответов\n\nСпасибо за поддержку Sana AI!`,
        timestamp: getCurrTime(),
      },
    ]);
  };

  const modeBadge = {
    mentor: { title: 'Наставник', icon: '🎓', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    editor: { title: 'Редактор', icon: '✍️', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    planner: { title: 'Планировщик', icon: '📅', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    examiner: { title: 'Экзаменатор', icon: '📝', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    coder: { title: 'Кодер', icon: '💻', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  }[user.mode];

  return (
    <div className="flex h-full w-full bg-[#0e1621] text-slate-100 antialiased overflow-hidden select-none">
      {/* Main Telegram Chat Window */}
      <div className="flex flex-col flex-1 h-full min-w-0 bg-[#0f141c]">
        {/* Top Header */}
        <header className="h-16 px-3 sm:px-4 bg-[#17212b] border-b border-slate-800 flex items-center justify-between z-10 shadow-sm shrink-0 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center text-white font-bold text-base sm:text-lg shadow-md">
                S
              </div>
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#17212b] rounded-full"></span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-white tracking-wide text-xs sm:text-sm">Sana AI</span>
                <span className="text-[9px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-400 font-mono">bot</span>
                <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full border flex items-center gap-1 ${modeBadge.color}`}>
                  <span>{modeBadge.icon}</span>
                  <span className="font-medium">{modeBadge.title}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-[140px] sm:max-w-xs">
                {isBotTyping ? (
                  <span className="text-cyan-400 animate-pulse font-medium">печатает...</span>
                ) : (
                  'Второй мозг для учёбы и работы'
                )}
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <div className="hidden sm:flex items-center bg-[#0e1621] rounded-lg p-0.5 border border-slate-700">
              {(['ru', 'kk', 'en'] as Language[]).map((lng) => (
                <button
                  key={lng}
                  onClick={() => setUser((prev) => ({ ...prev, language: lng }))}
                  className={`px-2 py-1 text-xs rounded uppercase font-semibold transition-all ${
                    user.language === lng ? 'bg-cyan-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {lng}
                </button>
              ))}
            </div>

            {/* Quota Meter */}
            <div
              onClick={() => setShowStarsModal(true)}
              className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#242f3d] hover:bg-[#2b394a] transition border border-slate-700 text-xs"
              title="Нажмите для управления тарифом"
            >
              {user.isPro ? (
                <span className="flex items-center gap-1 text-amber-400 font-semibold">
                  <Sparkles className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  Sana Pro
                </span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span className="font-medium text-slate-300">
                    {Math.max(0, user.dailyLimit - user.queriesUsedToday)}/20
                  </span>
                  {user.bonusQueries > 0 && (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1 rounded font-bold">
                      +{user.bonusQueries}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Reminders Bell */}
            <button
              onClick={() => setShowRemindersModal(true)}
              className="relative p-2 rounded-lg bg-[#242f3d] hover:bg-[#2b394a] text-slate-300 hover:text-white transition"
              title="Напоминания"
              aria-label="Напоминания"
            >
              <Calendar className="w-4 h-4" />
              {reminders.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-500 text-[10px] text-white font-bold rounded-full flex items-center justify-center">
                  {reminders.length}
                </span>
              )}
            </button>

            {/* Long-term Memory facts button */}
            <button
              onClick={() => setShowMemoryModal(true)}
              className="p-2 rounded-lg bg-[#242f3d] hover:bg-[#2b394a] text-slate-300 hover:text-white transition"
              title="Долгосрочная память"
              aria-label="Долгосрочная память"
            >
              <Brain className="w-4 h-4 text-purple-400" />
            </button>

            {/* Export dialog */}
            <button
              onClick={exportDialogAsMarkdown}
              className="p-2 rounded-lg bg-[#242f3d] hover:bg-[#2b394a] text-slate-300 hover:text-white transition"
              title="Экспорт в Markdown"
              aria-label="Экспорт в Markdown"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-3.5 bg-radial from-[#121924] to-[#0b0f16]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-full`}
            >
              <div
                className={`relative px-4 py-3 rounded-2xl max-w-[88%] sm:max-w-[75%] shadow-md text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#2b5278] text-white rounded-tr-xs'
                    : 'bg-[#182533] text-slate-200 border border-slate-800 rounded-tl-xs'
                }`}
              >
                {/* Optional attachment preview */}
                {msg.attachment && (
                  <div className="mb-2 p-2 rounded-lg bg-black/20 border border-white/10 flex items-center gap-2">
                    {msg.attachment.type === 'file' && <FileText className="w-5 h-5 text-cyan-400 shrink-0" />}
                    {msg.attachment.type === 'image' && <ImageIcon className="w-5 h-5 text-emerald-400 shrink-0" />}
                    {msg.attachment.type === 'voice' && <Volume2 className="w-5 h-5 text-amber-400 shrink-0" />}
                    <div className="text-xs truncate">
                      <div className="font-semibold text-slate-200">{msg.attachment.name || 'Вложение'}</div>
                      {msg.attachment.transcription && (
                        <div className="text-slate-400 italic">«{msg.attachment.transcription}»</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Message text with formatting */}
                <div className="whitespace-pre-wrap font-sans break-words selection:bg-cyan-500 selection:text-white">
                  {msg.content}
                </div>

                {/* Timestamp and status */}
                <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-slate-400 select-none">
                  <span>{msg.timestamp}</span>
                  {msg.role === 'user' && <Check className="w-3.5 h-3.5 text-cyan-300 inline" />}
                </div>
              </div>

              {/* Inline Buttons below bot messages */}
              {msg.inlineButtons && msg.inlineButtons.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 max-w-[85%]">
                  {msg.inlineButtons.map((btn, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleInlineClick(btn.data)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#242f3d] hover:bg-cyan-700/60 active:scale-98 text-cyan-300 hover:text-white border border-cyan-500/20 transition-all flex items-center gap-1.5 shadow-xs"
                    >
                      {btn.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Typing Indicator */}
          {isBotTyping && (
            <div className="flex items-center gap-2 text-slate-400 text-xs px-3 py-2 bg-[#182533] border border-slate-800 rounded-xl w-fit">
              <Bot className="w-4 h-4 text-cyan-400 animate-spin" />
              <span>Sana AI формулирует мысль...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-1.5 bg-[#17212b]/80 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 text-xs">
          <span className="text-slate-500 shrink-0 font-medium text-[11px]">Команды:</span>
          {[
            { label: '/mode — Режимы', cmd: '/mode' },
            { label: 'Напомни завтра в 10:00...', cmd: 'Напомни завтра в 10:00 сдать курсовую работу' },
            { label: 'Тест по истории', cmd: 'Проэкзаменуй меня по теме Вторая мировая война' },
            { label: 'Разбор алгоритма O(N)', cmd: 'Объясни бинарный поиск и сложность алгоритмов' },
            { label: '/plan — Тарифы', cmd: '/plan' },
          ].map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(chip.cmd)}
              className="shrink-0 px-2.5 py-1 rounded-full bg-[#242f3d] hover:bg-[#2f3d4f] text-slate-300 hover:text-white border border-slate-700/60 transition"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Chat Input Bar */}
        <div className="p-3 bg-[#17212b] border-t border-slate-800 shrink-0 relative">
          {/* Attachment Popup Menu */}
          {showAttachMenu && (
            <div className="absolute bottom-16 left-4 p-3 bg-[#242f3d] border border-slate-700 rounded-xl shadow-2xl z-20 w-80 space-y-2">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Загрузить для разбора
              </div>

              {/* Study Samples */}
              <div className="space-y-1">
                <button
                  onClick={() =>
                    handleAnalyzeDocumentSample(
                      'Конспект_Микроэкономика_Спрос_и_Предложение.pdf',
                      'Микроэкономика: Закон спроса и предложения. Эластичность спроса по цене. Рыночное равновесие. Излишек потребителя и излишек производителя. Государственное регулирование цен: потолок и пол цен. Налоговое бремя.'
                    )
                  }
                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-[#182533] hover:bg-cyan-900/40 text-xs text-slate-200 flex items-center gap-2 transition"
                >
                  <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="truncate">📄 Конспект: Микроэкономика.pdf</span>
                </button>

                <button
                  onClick={() =>
                    handleAnalyzeDocumentSample(
                      'Алгоритмы_и_структуры_данных.docx',
                      'Структуры данных: Связные списки, бинарные деревья поиска, красно-черные деревья, хэш-таблицы. Разрешение коллизий методом цепочек и открытой адресацией. Оценка временной сложности в худшем и среднем случае O(1) vs O(N).'
                    )
                  }
                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-[#182533] hover:bg-cyan-900/40 text-xs text-slate-200 flex items-center gap-2 transition"
                >
                  <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">📄 Лекция: Структуры данных.docx</span>
                </button>

                <button
                  onClick={() =>
                    handleAnalyzePhotoSample(
                      'Задача_по_физике_кинематика.jpg',
                      'Тело брошено под углом 30 градусов к горизонту с начальной скоростью 20 м/с. Найти дальность полета и максимальную высоту подъема.'
                    )
                  }
                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-[#182533] hover:bg-cyan-900/40 text-xs text-slate-200 flex items-center gap-2 transition"
                >
                  <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate">📷 Фото задачи: Кинематика</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Attachment Button */}
            <button
              onClick={() => setShowAttachMenu((prev) => !prev)}
              className="p-2.5 rounded-full hover:bg-[#242f3d] text-slate-400 hover:text-cyan-400 transition"
              title="Прикрепить файл или фото"
              aria-label="Прикрепить файл или фото"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Text Input */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  isRecording
                    ? `🔴 Идет запись голоса... (${recordTimer}с)`
                    : 'Напишите сообщение или «Напомни завтра в...»'
                }
                className="w-full bg-[#242f3d] text-white placeholder-slate-400 text-sm px-4 py-2.5 rounded-xl border border-slate-700/80 focus:outline-hidden focus:border-cyan-500 transition"
              />
            </div>

            {/* Voice Message Recording Button */}
            <button
              onClick={handleToggleVoiceRecording}
              className={`p-2.5 rounded-full transition ${
                isRecording
                  ? 'bg-rose-600 text-white animate-pulse shadow-lg shadow-rose-600/30'
                  : 'hover:bg-[#242f3d] text-slate-400 hover:text-cyan-400'
              }`}
              title={isRecording ? 'Остановить и отправить' : 'Голосовое сообщение'}
              aria-label={isRecording ? 'Остановить и отправить' : 'Голосовое сообщение'}
            >
              <Mic className="w-5 h-5" />
            </button>

            {/* Send Button */}
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim()}
              className="p-2.5 rounded-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white transition shadow-sm"
              title="Отправить"
              aria-label="Отправить"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: Telegram Stars & Sana Pro Checkout */}
      {showStarsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#17212b] border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setShowStarsModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center text-white shadow-lg">
                <Sparkles className="w-8 h-8 fill-white" />
              </div>
              <h3 className="text-xl font-bold text-white">Sana Pro Подписка</h3>
              <p className="text-sm text-slate-400 mt-1">
                Максимальная производительность для учёбы и фриланса
              </p>
            </div>

            <div className="space-y-3 mb-6 bg-[#0e1621] p-4 rounded-xl border border-slate-800 text-sm">
              <div className="flex items-center gap-2 text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Полный безлимит запросов без дневного ограничения</span>
              </div>
              <div className="flex items-center gap-2 text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Углублённая модель Gemini Pro с логическим рассуждением</span>
              </div>
              <div className="flex items-center gap-2 text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Загрузка учебников и документов до 50 МБ</span>
              </div>
              <div className="flex items-center gap-2 text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Приоритетная очередь и ускоренная генерация</span>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl mb-6 text-center">
              <div className="text-xs text-amber-400 uppercase font-bold tracking-wider">
                Стоимость через Telegram Stars
              </div>
              <div className="text-2xl font-black text-amber-300 mt-0.5">
                100 ⭐ <span className="text-sm font-normal text-slate-400">(≈ 990 ₸ / 1 900 ₽)</span>
              </div>
            </div>

            <button
              onClick={handleConfirmStarsPayment}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold transition flex items-center justify-center gap-2 shadow-lg"
            >
              <Sparkles className="w-4 h-4 fill-slate-950" />
              Оплатить 100 Stars и активировать Pro
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: Long-Term Memory Inspector */}
      {showMemoryModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#17212b] border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
            <button
              onClick={() => setShowMemoryModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
                <Brain className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Долгосрочная память Sana AI</h3>
                <p className="text-xs text-slate-400">
                  Факты о вас, извлечённые нейросетью из ваших сообщений
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto mb-4 pr-1">
              {memories.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  Пока нет сохранённых фактов. Общайтесь с ботом, и он автоматически запомнит ваш вуз, цели и любимые темы!
                </div>
              ) : (
                memories.map((fact, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#0e1621] border border-slate-800 text-xs text-slate-200 flex items-center justify-between"
                  >
                    <span>📌 {fact}</span>
                    <button
                      onClick={() => setMemories((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-500 hover:text-rose-400 text-xs ml-2"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add custom fact */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newFactInput}
                onChange={(e) => setNewFactInput(e.target.value)}
                placeholder="Добавить факт вручную (например: Студент 3 курса IT)"
                className="flex-1 bg-[#242f3d] text-white text-xs px-3 py-2 rounded-xl border border-slate-700 focus:outline-hidden"
              />
              <button
                onClick={() => {
                  if (newFactInput.trim()) {
                    setMemories((prev) => [...prev, newFactInput.trim()]);
                    setNewFactInput('');
                  }
                }}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold"
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Reminders Planner */}
      {showRemindersModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#17212b] border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
            <button
              onClick={() => setShowRemindersModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Умные напоминания</h3>
                <p className="text-xs text-slate-400">
                  Планировщик с учётом часового пояса ({user.timezone})
                </p>
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto mb-4 pr-1">
              {reminders.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  Активных напоминаний нет. Напишите боту: «Напомни завтра в 10:00 сдать курсовую»!
                </div>
              ) : (
                reminders.map((rem) => (
                  <div
                    key={rem.id}
                    className="p-3 rounded-xl bg-[#0e1621] border border-slate-800 text-xs text-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-slate-100">📌 {rem.title}</div>
                      <div className="text-[11px] text-cyan-400 mt-0.5">
                        ⏰ {new Date(rem.datetimeIso).toLocaleString('ru-RU')}
                      </div>
                    </div>
                    <button
                      onClick={() => setReminders((prev) => prev.filter((r) => r.id !== rem.id))}
                      className="text-slate-500 hover:text-rose-400 text-xs px-2 py-1"
                    >
                      Удалить
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="text-xs text-slate-400 bg-[#0e1621] p-3 rounded-xl border border-slate-800">
              💡 <b>Совет:</b> Sana AI понимает естественный язык. Просто отправьте в чат фразу вроде:
              <br />
              <span className="text-cyan-300">«Напомни в четверг в 18:30 созвон с ментором»</span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Referral Program */}
      {showReferralModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#17212b] border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setShowReferralModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-5">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Share2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Реферальная программа</h3>
              <p className="text-xs text-slate-400 mt-1">
                +10 бонусных запросов за каждого приглашённого друга
              </p>
            </div>

            <div className="bg-[#0e1621] p-4 rounded-xl border border-slate-800 mb-4 text-center">
              <div className="text-xs text-slate-400 mb-1">Твоя персональная ссылка:</div>
              <div className="font-mono text-xs bg-slate-900 py-2 px-3 rounded-lg text-cyan-300 select-all border border-slate-800">
                https://t.me/SanaAIBot?start={user.referralCode}
              </div>
              <div className="text-xs text-emerald-400 font-semibold mt-2">
                Уже приглашено друзей: {user.referralCount}
              </div>
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(`https://t.me/SanaAIBot?start=${user.referralCode}`);
                alert('Ссылка скопирована в буфер обмена!');
              }}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition"
            >
              Скопировать ссылку
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
