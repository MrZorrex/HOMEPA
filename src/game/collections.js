/**
 * Коллекционные сеты. Награда за сет — перманентный бонус, а не разовые деньги:
 * именно это даёт игроку причину НЕ продавать редкий знак.
 */

import { DISTRICTS, numberOf } from './plate.js';

function rangeSlots(from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(String(i));
  return out;
}

export const SETS = [
  {
    id: 'quads',
    slots: rangeSlots(0, 9),
    reward: { type: 'rarity', value: 0.05 },
    keyOf: (p, sc) => (sc.tags.includes('quad') ? String(p.digits[0]) : null),
  },
  {
    id: 'twins',
    slots: ['A', 'B', 'E', 'K', 'M', 'H', 'O', 'P', 'C', 'T', 'X'],
    reward: { type: 'sell', value: 0.05 },
    keyOf: (p, sc) => (sc.tags.includes('twins') ? p.letters[0] : null),
  },
  {
    id: 'low',
    slots: rangeSlots(1, 10),
    reward: { type: 'reroll', value: 1 },
    keyOf: (p, sc) => (sc.tags.includes('low') ? String(numberOf(p)) : null),
  },
  {
    id: 'round',
    slots: rangeSlots(1, 9),
    reward: { type: 'sell', value: 0.04 },
    keyOf: (p, sc) => (sc.tags.includes('round') ? String(p.digits[0]) : null),
  },
  {
    id: 'mirror',
    slots: rangeSlots(0, 9),
    reward: { type: 'rarity', value: 0.04 },
    keyOf: (p, sc) => (sc.tags.includes('mirror') ? String(p.digits[0]) : null),
  },
  {
    id: 'stairs',
    slots: ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'],
    reward: { type: 'order', value: 1 },
    keyOf: (p, sc) => {
      if (sc.tags.includes('stairUp')) return `u${p.digits[0]}`;
      if (sc.tags.includes('stairDown')) return `d${p.digits[0]}`;
      return null;
    },
  },
  {
    id: 'north',
    slots: DISTRICTS.slice(0, 8).map((d) => d.code),
    reward: { type: 'sell', value: 0.03 },
    keyOf: (p) => (Number(p.district) <= 8 ? p.district : null),
  },
  {
    id: 'south',
    slots: DISTRICTS.slice(8, 16).map((d) => d.code),
    reward: { type: 'storage', value: 15 },
    keyOf: (p) => (Number(p.district) > 8 && Number(p.district) <= 16 ? p.district : null),
  },
  {
    id: 'east',
    slots: DISTRICTS.slice(16, 24).map((d) => d.code),
    reward: { type: 'rarity', value: 0.03 },
    keyOf: (p) => (Number(p.district) > 16 ? p.district : null),
  },
];

export const SET_BY_ID = Object.fromEntries(SETS.map((s) => [s.id, s]));

/**
 * Зарегистрировать знак в коллекциях.
 * @returns {string[]} id сетов, в которых появился новый слот
 */
export function registerPlate(state, plate, scored) {
  const filled = [];
  for (const set of SETS) {
    const key = set.keyOf(plate, scored);
    if (!key || !set.slots.includes(key)) continue;
    const owned = state.collections[set.id] || (state.collections[set.id] = []);
    if (!owned.includes(key)) {
      owned.push(key);
      filled.push(set.id);
    }
  }
  return filled;
}

export function setProgress(state, setId) {
  const set = SET_BY_ID[setId];
  const owned = state.collections[setId] || [];
  return { have: owned.length, need: set.slots.length, done: owned.length >= set.slots.length };
}

/** Суммарные перманентные бонусы от завершённых сетов. */
export function collectionBonuses(state) {
  const b = { sell: 0, rarity: 0, reroll: 0, order: 0, storage: 0 };
  for (const set of SETS) {
    if (!state.setsClaimed.includes(set.id)) continue;
    b[set.reward.type] += set.reward.value;
  }
  return b;
}
