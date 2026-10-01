/** Детерминированный ГПСЧ (mulberry32) — нужен для «Знака дня» с общим сидом. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Хеш строки в 32-битное число (для сида из даты). */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Обычный случайный поток. */
export const rand = Math.random;

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Взвешенный выбор: items = [[value, weight], ...] */
export function weighted(rng, items) {
  let total = 0;
  for (const it of items) total += it[1];
  let r = rng() * total;
  for (const it of items) {
    r -= it[1];
    if (r <= 0) return it[0];
  }
  return items[items.length - 1][0];
}

export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Текущая дата в формате YYYY-MM-DD по UTC — одинакова для всех игроков. */
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
