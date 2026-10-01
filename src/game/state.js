/**
 * Состояние игры и производные характеристики.
 * Любое изменение немедленно пишется локально и дебаунсом уходит в облако
 * (п.1.9 — прогресс не теряется при перезагрузке и повороте экрана).
 */

import { Storage } from '../platform/storage.js';
import { UPGRADE_KEYS } from './economy.js';
import * as Eco from './economy.js';
import { collectionBonuses } from './collections.js';
import { todayKey, weekKey, seasonDistrict, makeDailyTasks } from './daily.js';

export const SAVE_VERSION = 2;

export function defaultState() {
  return {
    v: SAVE_VERSION,
    credits: 150,
    sparks: 0,
    reputation: 0,
    home: null,
    storage: [],
    upgrades: Object.fromEntries(UPGRADE_KEYS.map((k) => [k, 0])),
    collections: {},
    setsClaimed: [],
    orders: [],
    stats: { spins: 0, rerolls: 0, sold: 0, earned: 0, ordersDone: 0, best: 0, rareFound: 0 },
    daily: { date: '', tasks: [], streak: 0, lastLogin: '', streakClaimed: false },
    dailyPlate: { date: '', attempts: 0, best: 0, bestPlate: null, submitted: false },
    season: { week: '', district: '' },
    autospin: { on: false, threshold: 'rare' },
    settings: { muted: false },
    noAds: false,
    tutorial: { step: 0, done: false },
    unlocked: { orders: false, collection: false, daily: false, workshop: false },
    lastSeen: Date.now(),
  };
}

export const State = {
  data: defaultState(),

  async load() {
    const saved = await Storage.init();
    this.data = migrate(saved);
    return this.data;
  },

  save() {
    this.data.lastSeen = Date.now();
    Storage.set({ ...this.data, updatedAt: Date.now() });
  },

  async flush() {
    await Storage.flush();
  },
};

export function migrate(saved) {
  const base = defaultState();
  if (!saved || typeof saved !== 'object') return base;
  const out = { ...base, ...saved };
  out.upgrades = { ...base.upgrades, ...(saved.upgrades || {}) };
  out.stats = { ...base.stats, ...(saved.stats || {}) };
  out.daily = { ...base.daily, ...(saved.daily || {}) };
  out.dailyPlate = { ...base.dailyPlate, ...(saved.dailyPlate || {}) };
  out.season = { ...base.season, ...(saved.season || {}) };
  out.autospin = { ...base.autospin, ...(saved.autospin || {}) };
  out.settings = { ...base.settings, ...(saved.settings || {}) };
  out.tutorial = { ...base.tutorial, ...(saved.tutorial || {}) };
  out.unlocked = { ...base.unlocked, ...(saved.unlocked || {}) };
  out.collections = saved.collections || {};
  out.setsClaimed = saved.setsClaimed || [];
  out.storage = Array.isArray(saved.storage) ? saved.storage : [];
  out.orders = Array.isArray(saved.orders) ? saved.orders : [];

  // Формат знака изменился: старые знаки и заказы несовместимы, но валюту,
  // апгрейды и статистику игрока сохраняем — прогресс не обнуляется (п.1.9).
  if ((saved.v || 1) < 2) {
    for (const item of out.storage) {
      out.credits += 40;
    }
    out.storage = [];
    out.orders = [];
    out.collections = {};
    out.setsClaimed = [];
    out.home = null;
  }

  out.v = SAVE_VERSION;
  return out;
}

/** Производные значения с учётом апгрейдов и бонусов коллекций. */
export function derived(s) {
  const b = collectionBonuses(s);
  const season = seasonDistrict();
  return {
    bonuses: b,
    seasonDistrict: season,
    rerolls: Eco.rerollLimit(s.upgrades.calib, b.reroll),
    storageCap: Eco.storageCap(s.upgrades.storage, b.storage),
    market: Eco.marketMult(s.upgrades.market, b.sell),
    orderSlots: Eco.orderSlots(s.upgrades.links, b.order),
    spinMs: Eco.spinDuration(s.upgrades.machine),
    alloy: s.upgrades.alloy + b.rarity * 20,
    autospin: Eco.autospinUnlocked(s.upgrades.machine),
    idleRate: Eco.idleRate(s.upgrades.machine, Eco.marketMult(s.upgrades.market, b.sell)),
    offlineCap: Eco.offlineCapSeconds(s.upgrades.storage),
  };
}

/** Множитель цены с учётом сезонного округа. */
export function districtMult(s, districtCode) {
  return districtCode === seasonDistrict() ? 2 : 1;
}

/** Ежедневный ролловер: задания, серия входов, сезон. */
export function rollover(s) {
  const today = todayKey();
  const events = { newDay: false, streakDay: 0, newSeason: false };

  if (s.daily.date !== today) {
    s.daily.date = today;
    s.daily.tasks = makeDailyTasks(today);
    s.daily.streakClaimed = false;
    events.newDay = true;

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (s.daily.lastLogin === yesterday) s.daily.streak = Math.min(7, s.daily.streak + 1);
    else if (s.daily.lastLogin !== today) s.daily.streak = 1;
    s.daily.lastLogin = today;
    events.streakDay = s.daily.streak;
  }

  if (s.dailyPlate.date !== today) {
    s.dailyPlate = { date: today, attempts: 0, best: 0, bestPlate: null, submitted: false };
  }

  const wk = weekKey();
  if (s.season.week !== wk) {
    s.season = { week: wk, district: seasonDistrict() };
    events.newSeason = true;
  }

  return events;
}

/** Засчитать прогресс ежедневного задания. */
export function progressTask(s, id, amount = 1) {
  const task = (s.daily.tasks || []).find((t) => t.id === id);
  if (!task || task.claimed) return false;
  const before = task.progress;
  task.progress = Math.min(task.target, task.progress + amount);
  return before < task.target && task.progress >= task.target;
}

export function allTasksDone(s) {
  const tasks = s.daily.tasks || [];
  return tasks.length > 0 && tasks.every((t) => t.progress >= t.target);
}
