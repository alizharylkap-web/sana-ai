/**
 * Core business and formatting logic for Sana AI Telegram Bot.
 * Decoupled for deterministic unit testing.
 */

/**
 * Escapes characters for Telegram MarkdownV2 according to official Bot API:
 * Any character from '_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'
 * must be escaped with the preceding character '\' if not part of markdown formatting.
 */
export function escapeMarkdownV2(text: string): string {
  if (!text) return '';
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Splits a long Telegram response into chunks that obey Telegram's 4096 character limit.
 * Splits on paragraphs or newlines first to keep readable blocks.
 */
export function splitTelegramMessage(text: string, maxLen = 4096): string[] {
  if (!text) return [];
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try finding the best split point: double newline, then single newline, then space
    let splitIdx = remaining.lastIndexOf('\n\n', maxLen);
    if (splitIdx === -1 || splitIdx < maxLen / 2) {
      splitIdx = remaining.lastIndexOf('\n', maxLen);
    }
    if (splitIdx === -1 || splitIdx < maxLen / 2) {
      splitIdx = remaining.lastIndexOf(' ', maxLen);
    }
    if (splitIdx === -1 || splitIdx === 0) {
      // Force split at maxLen
      splitIdx = maxLen;
    }

    chunks.push(remaining.slice(0, splitIdx).trimEnd());
    remaining = remaining.slice(splitIdx).trimStart();
  }

  return chunks;
}

export interface UserQuotaState {
  isPro: boolean;
  queriesUsedToday: number;
  dailyLimit: number;
  bonusQueries: number;
  lastResetDate: string; // YYYY-MM-DD
}

/**
 * Checks if user can perform a query, and computes consumed quotas.
 */
export function checkUserQuota(user: UserQuotaState, currentDateStr: string): {
  allowed: boolean;
  remainingToday: number;
  reason?: 'limit_reached' | 'pro_unlimited' | 'quota_available';
} {
  if (user.isPro) {
    return { allowed: true, remainingToday: 999999, reason: 'pro_unlimited' };
  }

  const queriesUsed = (user.lastResetDate !== currentDateStr) ? 0 : user.queriesUsedToday;
  const standardRemaining = Math.max(0, user.dailyLimit - queriesUsed);
  const totalAvailable = standardRemaining + user.bonusQueries;

  if (totalAvailable <= 0) {
    return { allowed: false, remainingToday: 0, reason: 'limit_reached' };
  }

  return { allowed: true, remainingToday: totalAvailable, reason: 'quota_available' };
}

/**
 * Deducts 1 query from quota: standard limit first, then bonus queries.
 */
export function consumeUserQuery(user: UserQuotaState, currentDateStr: string): UserQuotaState {
  if (user.isPro) {
    return { ...user };
  }

  let queriesUsed = user.queriesUsedToday;
  let bonus = user.bonusQueries;

  if (user.lastResetDate !== currentDateStr) {
    queriesUsed = 0;
  }

  if (queriesUsed < user.dailyLimit) {
    queriesUsed += 1;
  } else if (bonus > 0) {
    bonus -= 1;
  }

  return {
    ...user,
    lastResetDate: currentDateStr,
    queriesUsedToday: queriesUsed,
    bonusQueries: bonus,
  };
}

/**
 * Awards referral bonus (+10 queries per invited friend).
 */
export function awardReferralBonus(referrer: UserQuotaState, bonusAmount = 10): UserQuotaState {
  return {
    ...referrer,
    bonusQueries: referrer.bonusQueries + bonusAmount,
  };
}

export interface UserState {
  tier: 'FREE' | 'PRO';
  dailyRequestsCount: number;
  lastRequestDate: Date;
}

/**
 * Checks and consumes daily quota for UserState (used by Simulator and API test suite).
 */
export function checkAndConsumeQuota(
  state: UserState,
  now: Date,
  limit = 20
): { allowed: boolean; newState: UserState } {
  const isNewDay =
    state.lastRequestDate.getUTCFullYear() !== now.getUTCFullYear() ||
    state.lastRequestDate.getUTCMonth() !== now.getUTCMonth() ||
    state.lastRequestDate.getUTCDate() !== now.getUTCDate();

  const currentCount = isNewDay ? 0 : state.dailyRequestsCount;

  if (state.tier === 'PRO') {
    return {
      allowed: true,
      newState: {
        ...state,
        dailyRequestsCount: currentCount + 1,
        lastRequestDate: now,
      },
    };
  }

  if (currentCount >= limit) {
    return {
      allowed: false,
      newState: {
        ...state,
        dailyRequestsCount: currentCount,
        lastRequestDate: isNewDay ? now : state.lastRequestDate,
      },
    };
  }

  return {
    allowed: true,
    newState: {
      ...state,
      dailyRequestsCount: currentCount + 1,
      lastRequestDate: now,
    },
  };
}

/**
 * Sliding-window anti-spam rate limiter (ThrottlingMiddleware simulation).
 */
export function checkThrottle(
  userId: number,
  nowMs: number,
  cache: Map<number, number>,
  rateLimitMs = 500
): { throttled: boolean; remainingMs: number } {
  const lastMs = cache.get(userId);
  if (lastMs !== undefined && nowMs - lastMs < rateLimitMs) {
    return { throttled: true, remainingMs: rateLimitMs - (nowMs - lastMs) };
  }
  cache.set(userId, nowMs);
  return { throttled: false, remainingMs: 0 };
}
