import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeMarkdownV2,
  splitTelegramMessage,
  checkUserQuota,
  consumeUserQuery,
  awardReferralBonus,
  checkAndConsumeQuota,
  checkThrottle,
  type UserQuotaState,
  type UserState,
} from './telegramLogic.ts';

test('escapeMarkdownV2 properly escapes Telegram special characters', () => {
  const input = 'Hello! Welcome to Sana [AI] (v1.0.0) - cost: 990 ₸.';
  const escaped = escapeMarkdownV2(input);
  assert.equal(escaped, 'Hello\\! Welcome to Sana \\[AI\\] \\(v1\\.0\\.0\\) \\- cost: 990 ₸\\.');
});

test('splitTelegramMessage does not split texts below limit', () => {
  const text = 'Short message for telegram';
  const chunks = splitTelegramMessage(text, 4096);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], text);
});

test('splitTelegramMessage splits text exceeding limit at natural line breaks', () => {
  const para1 = 'A'.repeat(50);
  const para2 = 'B'.repeat(50);
  const full = `${para1}\n\n${para2}`;
  const chunks = splitTelegramMessage(full, 60);

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0], para1);
  assert.equal(chunks[1], para2);
});

test('checkUserQuota permits requests within daily limit', () => {
  const user: UserQuotaState = {
    isPro: false,
    queriesUsedToday: 5,
    dailyLimit: 20,
    bonusQueries: 0,
    lastResetDate: '2026-10-22',
  };

  const status = checkUserQuota(user, '2026-10-22');
  assert.equal(status.allowed, true);
  assert.equal(status.remainingToday, 15);
  assert.equal(status.reason, 'quota_available');
});

test('checkUserQuota resets usage when a new day arrives', () => {
  const user: UserQuotaState = {
    isPro: false,
    queriesUsedToday: 20,
    dailyLimit: 20,
    bonusQueries: 0,
    lastResetDate: '2026-10-21',
  };

  const status = checkUserQuota(user, '2026-10-22');
  assert.equal(status.allowed, true);
  assert.equal(status.remainingToday, 20);
});

test('checkUserQuota blocks when limit reached without bonus', () => {
  const user: UserQuotaState = {
    isPro: false,
    queriesUsedToday: 20,
    dailyLimit: 20,
    bonusQueries: 0,
    lastResetDate: '2026-10-22',
  };

  const status = checkUserQuota(user, '2026-10-22');
  assert.equal(status.allowed, false);
  assert.equal(status.remainingToday, 0);
  assert.equal(status.reason, 'limit_reached');
});

test('consumeUserQuery uses bonus queries after daily limit exhausted', () => {
  const user: UserQuotaState = {
    isPro: false,
    queriesUsedToday: 20,
    dailyLimit: 20,
    bonusQueries: 5,
    lastResetDate: '2026-10-22',
  };

  const updated = consumeUserQuery(user, '2026-10-22');
  assert.equal(updated.queriesUsedToday, 20);
  assert.equal(updated.bonusQueries, 4);
});

test('awardReferralBonus adds 10 queries', () => {
  const user: UserQuotaState = {
    isPro: false,
    queriesUsedToday: 0,
    dailyLimit: 20,
    bonusQueries: 2,
    lastResetDate: '2026-10-22',
  };

  const updated = awardReferralBonus(user, 10);
  assert.equal(updated.bonusQueries, 12);
});

test('Pro users have unlimited access', () => {
  const proUser: UserQuotaState = {
    isPro: true,
    queriesUsedToday: 999,
    dailyLimit: 20,
    bonusQueries: 0,
    lastResetDate: '2026-10-22',
  };

  const status = checkUserQuota(proUser, '2026-10-22');
  assert.equal(status.allowed, true);
  assert.equal(status.reason, 'pro_unlimited');
});

test('checkAndConsumeQuota enforces FREE limit and resets on new UTC day', () => {
  const day1 = new Date('2026-10-22T10:00:00Z');
  const day2 = new Date('2026-10-23T00:01:00Z');
  const state: UserState = { tier: 'FREE', dailyRequestsCount: 19, lastRequestDate: day1 };

  const res1 = checkAndConsumeQuota(state, day1, 20);
  assert.equal(res1.allowed, true);
  assert.equal(res1.newState.dailyRequestsCount, 20);

  const res2 = checkAndConsumeQuota(res1.newState, day1, 20);
  assert.equal(res2.allowed, false);

  const res3 = checkAndConsumeQuota(res2.newState, day2, 20);
  assert.equal(res3.allowed, true);
  assert.equal(res3.newState.dailyRequestsCount, 1);
});

test('checkThrottle blocks rapid bursts within rateLimitMs window', () => {
  const cache = new Map<number, number>();
  const r1 = checkThrottle(999, 1000, cache, 500);
  assert.equal(r1.throttled, false);

  const r2 = checkThrottle(999, 1200, cache, 500);
  assert.equal(r2.throttled, true);
  assert.equal(r2.remainingMs, 300);

  const r3 = checkThrottle(999, 1500, cache, 500);
  assert.equal(r3.throttled, false);
});
