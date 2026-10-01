/**
 * Заказы клиентов — главный источник целей на сессию.
 * Дедлайн считается в спинах, а не в реальном времени: так прогресс
 * честно переживает перезагрузку страницы и не требует таймеров.
 */

import { randInt, weighted } from './rng.js';
import { DISTRICTS, scorePlate, priceOf, tierOf, tierRank } from './plate.js';

export const CLIENTS = [
  { id: 'racer', img: 'assets/clients/racer.png' },
  { id: 'collector', img: 'assets/clients/collector.png' },
  { id: 'courier', img: 'assets/clients/courier.png' },
  { id: 'producer', img: 'assets/clients/producer.png' },
];

let idCounter = 1;

/**
 * Сгенерировать заказ. Сложность растёт вместе с уровнем связей игрока.
 */
export function makeOrder(rng, difficulty = 0) {
  const client = CLIENTS[randInt(rng, 0, CLIENTS.length - 1)];
  const kind = weighted(rng, [
    ['digits', 40],
    ['district', 20],
    ['tier', 25],
    ['twins', 15],
  ]);

  const order = {
    id: `o${Date.now().toString(36)}${idCounter++}`,
    client: client.id,
    kind,
    mask: [null, null, null, null],
    district: null,
    minTier: null,
    twins: false,
    spinsLeft: 30,
    mult: 2,
    rep: 10,
  };

  if (kind === 'digits') {
    // Не больше двух зафиксированных цифр: с рероллами такую маску реально добить,
    // а три цифры превращали заказ в лотерею 1 к 1000.
    const count = difficulty >= 2 && rng() < 0.45 ? 2 : 1;
    const positions = [0, 1, 2, 3].sort(() => rng() - 0.5).slice(0, count);
    const value = randInt(rng, 0, 9);
    for (const p of positions) order.mask[p] = rng() < 0.75 ? value : randInt(rng, 0, 9);
    order.spinsLeft = count === 2 ? randInt(rng, 16, 24) : randInt(rng, 8, 13);
    order.mult = count === 2 ? 3.4 : 2.1;
    order.rep = count === 2 ? 26 : 12;
  } else if (kind === 'district') {
    // Округ нельзя зафиксировать рероллом, поэтому маску цифр не добавляем.
    order.district = DISTRICTS[randInt(rng, 0, DISTRICTS.length - 1)].code;
    order.spinsLeft = randInt(rng, 26, 38);
    order.mult = 2.6;
    order.rep = 18;
  } else if (kind === 'tier') {
    order.minTier = difficulty >= 3 ? 'epic' : difficulty >= 1 ? 'rare' : 'good';
    order.spinsLeft = randInt(rng, 9, 15);
    order.mult = order.minTier === 'epic' ? 4 : order.minTier === 'rare' ? 2.8 : 2.1;
    order.rep = order.minTier === 'epic' ? 38 : order.minTier === 'rare' ? 22 : 11;
  } else {
    order.twins = true;
    order.spinsLeft = randInt(rng, 10, 16);
    order.mult = 2.4;
    order.rep = 16;
  }

  order.mult = Math.round(order.mult * 10) / 10;
  return order;
}

/** Подходит ли знак под заказ. */
export function matchesOrder(order, plate, scored) {
  for (let i = 0; i < 4; i++) {
    if (order.mask[i] !== null && plate.digits[i] !== order.mask[i]) return false;
  }
  if (order.district && plate.district !== order.district) return false;
  if (order.twins && plate.letters[0] !== plate.letters[1]) return false;
  if (order.minTier) {
    const need = tierRank(order.minTier);
    const got = tierRank(tierOf(scored.index).id);
    if (got < need) return false;
  }
  return true;
}

/** Награда за сдачу знака по заказу. */
export function orderReward(order, plate, scored, marketMultiplier) {
  const base = priceOf(scored.index, marketMultiplier);
  return Math.round(base * order.mult);
}

/** Текстовая маска вида "?7?7" для показа игроку. */
export function maskText(order) {
  return order.mask.map((v) => (v === null ? '?' : String(v))).join('');
}

/** Варианты торга: один раз за заказ, успех даёт +15..30%. */
export const HAGGLE_OPTIONS = ['polite', 'bold', 'story'];

export function haggleResult(rng, optionId) {
  const chances = { polite: 0.75, bold: 0.45, story: 0.6 };
  const gains = { polite: 0.15, bold: 0.3, story: 0.22 };
  const win = rng() < chances[optionId];
  return { win, gain: win ? gains[optionId] : 0 };
}

/** Пополнить список заказов до доступного числа слотов. */
export function refillOrders(state, rng, slots, difficulty) {
  while (state.orders.length < slots) {
    state.orders.push(makeOrder(rng, difficulty));
  }
  return state.orders;
}

/** Списать один спин со всех активных заказов, убрать просроченные. */
export function tickOrders(state) {
  const expired = [];
  for (const o of state.orders) {
    o.spinsLeft -= 1;
    if (o.spinsLeft <= 0) expired.push(o.id);
  }
  if (expired.length) {
    state.orders = state.orders.filter((o) => !expired.includes(o.id));
  }
  return expired;
}

export { scorePlate };
