export type BotMode = 'mentor' | 'editor' | 'planner' | 'examiner' | 'coder';

export type Language = 'ru' | 'kk' | 'en';

export interface UserProfile {
  name: string;
  studyGoal: string;
  timezone: string;
  language: Language;
  mode: BotMode;
  isPro: boolean;
  queriesUsedToday: number;
  bonusQueries: number;
  dailyLimit: number;
  referralCode: string;
  referralCount: number;
  onboardingStep: number; // 0 = not started, 1 = name, 2 = goal, 3 = tz, 4 = done
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: string;
  inlineButtons?: Array<{ text: string; data: string }>;
  isStreaming?: boolean;
  attachment?: {
    type: 'image' | 'file' | 'voice';
    name?: string;
    url?: string;
    transcription?: string;
  };
}

export interface UserReminder {
  id: string;
  title: string;
  datetimeIso: string;
  isCompleted: boolean;
}
