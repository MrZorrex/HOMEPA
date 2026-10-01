/**
 * «Знак дня», ежедневные задания и серия входов.
 * Сид «Знака дня» общий для всех игроков — соревнование честное,
 * решает мастерство холдов, а не удача генератора.
 */

import { mulberry32, hashSeed, todayKey, randInt } from './rng.js';

export const DAILY_ATTEMPTS = 5;

/** Детерминированный генератор на сегодня, одинаковый у всех игроков. */
export function dailyRng(dateKey = todayKey(), salt = 0) {
  return mulberry32(hashSeed(`nomeron-${dateKey}-${salt}`));
}

/** Текущая неделя — для сезона округа и сброса лидерборда. */
export function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Бонусный округ недели: ×2 к цене знаков этого округа. */
export function seasonDistrict() {
  const rng = mulberry32(hashSeed(`season-${weekKey()}`));
  return String(randInt(rng, 1, 24)).padStart(2, '0');
}

export const TASK_POOL = [
  { id: 'spins', target: () => 40, reward: { credits: 350 } },
  { id: 'sell', target: () => 2500, reward: { credits: 400 } },
  { id: 'rare', target: () => 3, reward: { sparks: 2 } },
  { id: 'orders', target: () => 2, reward: { credits: 600 } },
  { id: 'rerolls', target: () => 10, reward: { credits: 300 } },
  { id: 'collect', target: () => 2, reward: { sparks: 2 } },
];

/** Три задания на сегодня, одинаковые для всех (детерминированы датой). */
export function makeDailyTasks(dateKey = todayKey()) {
  const rng = mulberry32(hashSeed(`tasks-${dateKey}`));
  const pool = [...TASK_POOL];
  const picked = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const idx = randInt(rng, 0, pool.length - 1);
    const t = pool.splice(idx, 1)[0];
    picked.push({ id: t.id, target: t.target(), progress: 0, claimed: false, reward: t.reward });
  }
  return picked;
}

export const STREAK_REWARDS = [
  { credits: 200 },
  { credits: 400 },
  { sparks: 2 },
  { credits: 800 },
  { sparks: 3 },
  { credits: 1500 },
  { sparks: 6, epic: true },
];

export function streakReward(day) {
  return STREAK_REWARDS[Math.min(day, STREAK_REWARDS.length) - 1];
}

export { todayKey };
