/** Мастерская: 6 веток апгрейдов. */

export const UPGRADES = {
  alloy: { max: 7, base: 120, icon: '🔥' },
  machine: { max: 7, base: 150, icon: '⚙️' },
  calib: { max: 4, base: 240, icon: '🎯' },
  storage: { max: 7, base: 100, icon: '📦' },
  market: { max: 7, base: 180, icon: '📈' },
  links: { max: 2, base: 400, icon: '🤝' },
};

export const UPGRADE_KEYS = Object.keys(UPGRADES);

export function upgradeCost(key, level) {
  const u = UPGRADES[key];
  if (!u || level >= u.max) return Infinity;
  return Math.round(u.base * Math.pow(1.8, level));
}

/** Длительность анимации спина в миллисекундах. */
export function spinDuration(level) {
  return Math.round((2.0 - level * 0.228) * 1000);
}

export function rerollLimit(level, bonus = 0) {
  return 1 + level + bonus;
}

export function storageCap(level, bonus = 0) {
  return 20 + level * 26 + bonus;
}

export function marketMult(level, bonus = 0) {
  return 1 + level * 0.17 + bonus;
}

export function orderSlots(level, bonus = 0) {
  return 1 + level + bonus;
}

export function alloyBonus(level) {
  return level;
}

/** Автокрутилка открывается на 3-м уровне станка. */
export function autospinUnlocked(machineLevel) {
  return machineLevel >= 3;
}

/** Стоимость реролла растёт вместе с ценностью заготовки. */
export function rerollCost(currentPrice) {
  return Math.max(5, Math.round(currentPrice * 0.25));
}

/** Доход автокрутилки в секунду (используется для оффлайн-начисления). */
export function idleRate(machineLevel, marketMultiplier) {
  if (!autospinUnlocked(machineLevel)) return 0;
  const spinsPerSec = 1000 / spinDuration(machineLevel) / 2;
  return spinsPerSec * 14 * marketMultiplier;
}

/** Предел накопления оффлайн-дохода в секундах: 2 ч, до 8 ч по уровню хранилища. */
export function offlineCapSeconds(storageLevel) {
  return (2 + storageLevel * 0.857) * 3600;
}
