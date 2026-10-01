/**
 * Генерация знака, подсчёт Индекса редкости и цены.
 *
 * Буквы берутся только из набора, который визуально идентичен в кириллице
 * и латинице — знак читается одинаково на ru/en/tr без перевода.
 */

import { weighted, randInt } from './rng.js';

export const LETTERS = ['A', 'B', 'E', 'K', 'M', 'H', 'O', 'P', 'C', 'T', 'X'];

/** 24 округа Вектор-Сити: код, ключ локализации, цвет, инициалы для бонуса. */
export const DISTRICTS = [
  { code: '01', key: 'd01', hue: 196, ini: ['H', 'B'] },
  { code: '02', key: 'd02', hue: 210, ini: ['C', 'T'] },
  { code: '03', key: 'd03', hue: 224, ini: ['O', 'X'] },
  { code: '04', key: 'd04', hue: 238, ini: ['M', 'P'] },
  { code: '05', key: 'd05', hue: 252, ini: ['K', 'A'] },
  { code: '06', key: 'd06', hue: 266, ini: ['B', 'E'] },
  { code: '07', key: 'd07', hue: 280, ini: ['T', 'O'] },
  { code: '08', key: 'd08', hue: 294, ini: ['X', 'M'] },
  { code: '09', key: 'd09', hue: 308, ini: ['A', 'P'] },
  { code: '10', key: 'd10', hue: 322, ini: ['E', 'K'] },
  { code: '11', key: 'd11', hue: 336, ini: ['P', 'C'] },
  { code: '12', key: 'd12', hue: 350, ini: ['M', 'A'] },
  { code: '13', key: 'd13', hue: 8, ini: ['O', 'B'] },
  { code: '14', key: 'd14', hue: 22, ini: ['K', 'X'] },
  { code: '15', key: 'd15', hue: 36, ini: ['T', 'E'] },
  { code: '16', key: 'd16', hue: 50, ini: ['C', 'M'] },
  { code: '17', key: 'd17', hue: 64, ini: ['H', 'O'] },
  { code: '18', key: 'd18', hue: 86, ini: ['B', 'A'] },
  { code: '19', key: 'd19', hue: 108, ini: ['X', 'P'] },
  { code: '20', key: 'd20', hue: 130, ini: ['E', 'T'] },
  { code: '21', key: 'd21', hue: 150, ini: ['A', 'C'] },
  { code: '22', key: 'd22', hue: 164, ini: ['M', 'K'] },
  { code: '23', key: 'd23', hue: 176, ini: ['P', 'H'] },
  { code: '24', key: 'd24', hue: 186, ini: ['O', 'E'] },
];

export const DISTRICT_BY_CODE = Object.fromEntries(DISTRICTS.map((d) => [d.code, d]));

export const TIERS = [
  { id: 'common', min: 0, color: '#8e9ab3' },
  { id: 'good', min: 10, color: '#3ddc84' },
  { id: 'rare', min: 25, color: '#39a0ff' },
  { id: 'epic', min: 45, color: '#a855f7' },
  { id: 'legend', min: 65, color: '#ffb020' },
  { id: 'mythic', min: 85, color: '#ff3d9a' },
];

export function tierOf(index) {
  let t = TIERS[0];
  for (const tier of TIERS) if (index >= tier.min) t = tier;
  return t;
}

export function tierRank(id) {
  return TIERS.findIndex((t) => t.id === id);
}

/** Набор «особых» цифровых комбинаций, которые выпадают по бонусу сплава. */
function specialDigits(rng) {
  const kind = weighted(rng, [
    ['quad', 6],
    ['triple', 18],
    ['stairUp', 10],
    ['stairDown', 8],
    ['mirror', 14],
    ['twoPairs', 18],
    ['round', 12],
    ['low', 14],
  ]);
  const d = () => randInt(rng, 0, 9);
  switch (kind) {
    case 'quad': {
      const a = d();
      return [a, a, a, a];
    }
    case 'triple': {
      const a = d();
      let b = d();
      if (b === a) b = (b + 1) % 10;
      const pos = randInt(rng, 0, 3);
      const out = [a, a, a, a];
      out[pos] = b;
      return out;
    }
    case 'stairUp': {
      const s = randInt(rng, 0, 6);
      return [s, s + 1, s + 2, s + 3];
    }
    case 'stairDown': {
      const s = randInt(rng, 3, 9);
      return [s, s - 1, s - 2, s - 3];
    }
    case 'mirror': {
      const a = d();
      const b = d();
      return [a, b, b, a];
    }
    case 'twoPairs': {
      const a = d();
      let b = d();
      if (b === a) b = (b + 1) % 10;
      return [a, a, b, b];
    }
    case 'round': {
      return [randInt(rng, 1, 9), 0, 0, 0];
    }
    default: {
      const n = randInt(rng, 1, 10);
      return [0, 0, Math.floor(n / 10), n % 10];
    }
  }
}

/**
 * Сгенерировать знак.
 * @param {function} rng
 * @param {{alloy?:number, home?:string|null, district?:string|null}} opts
 */
export function generatePlate(rng, opts = {}) {
  const alloy = opts.alloy || 0;
  const specialChance = 0.05 + alloy * 0.022;
  const digits = rng() < specialChance
    ? specialDigits(rng)
    : [randInt(rng, 0, 9), randInt(rng, 0, 9), randInt(rng, 0, 9), randInt(rng, 0, 9)];

  const twinChance = 0.07 + alloy * 0.012;
  let letters;
  if (rng() < twinChance) {
    const a = LETTERS[randInt(rng, 0, LETTERS.length - 1)];
    letters = [a, a];
  } else {
    letters = [
      LETTERS[randInt(rng, 0, LETTERS.length - 1)],
      LETTERS[randInt(rng, 0, LETTERS.length - 1)],
    ];
  }

  let district = opts.district;
  if (!district) {
    district = opts.home && rng() < 0.1
      ? opts.home
      : DISTRICTS[randInt(rng, 0, DISTRICTS.length - 1)].code;
  }

  return { letters, digits, district };
}

/** Перекрутить только незафиксированные позиции. holds = [l0,l1,d0,d1,d2,d3] булевы. */
export function rerollPlate(rng, plate, holds, opts = {}) {
  const fresh = generatePlate(rng, opts);
  const letters = [
    holds[0] ? plate.letters[0] : fresh.letters[0],
    holds[1] ? plate.letters[1] : fresh.letters[1],
  ];
  const digits = plate.digits.map((v, i) => (holds[2 + i] ? v : fresh.digits[i]));
  return { letters, digits, district: plate.district };
}

/**
 * Индекс редкости 0..100 + список сработавших паттернов.
 * @param {object} plate
 * @param {{home?:string|null}} ctx
 */
export function scorePlate(plate, ctx = {}) {
  const d = plate.digits;
  const L = plate.letters;
  const tags = [];
  let s = 0;

  const counts = {};
  for (const x of d) counts[x] = (counts[x] || 0) + 1;
  const values = Object.values(counts);
  const maxCount = Math.max(...values);

  if (maxCount === 4) {
    s += 45;
    tags.push('quad');
  } else if (maxCount === 3) {
    s += 25;
    tags.push('triple');
  } else if (values.filter((c) => c === 2).length === 2) {
    s += 12;
    tags.push('twoPairs');
  }

  const asc = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
  const desc = d.every((v, i) => i === 0 || v === d[i - 1] - 1);
  if (asc) {
    s += 30;
    tags.push('stairUp');
  }
  if (desc) {
    s += 28;
    tags.push('stairDown');
  }

  if (maxCount < 4 && d[0] === d[3] && d[1] === d[2]) {
    s += 20;
    tags.push('mirror');
  }

  const num = d[0] * 1000 + d[1] * 100 + d[2] * 10 + d[3];
  if (num !== 0 && num % 1000 === 0) {
    s += 15;
    tags.push('round');
  }
  if (num >= 1 && num <= 10) {
    s += 25;
    tags.push('low');
  }

  if (L[0] === L[1]) {
    s += 15;
    tags.push('twins');
  }

  const dist = DISTRICT_BY_CODE[plate.district];
  if (dist && dist.ini[0] === L[0] && dist.ini[1] === L[1]) {
    s += 10;
    tags.push('initials');
  }

  if (ctx.home && ctx.home === plate.district) {
    s += 8;
    tags.push('home');
  }

  if (d.every((x) => x === 7)) {
    s = Math.round(s * 1.5);
    tags.push('lucky');
  }

  return { index: Math.min(100, s), tags };
}

/** Цена продажи. */
export function priceOf(index, marketMult = 1) {
  return Math.max(1, Math.round(10 * Math.pow(1 + index / 10, 2.2) * marketMult));
}

/** Строковый вид знака: "AB 7777 · 12" */
export function plateText(plate) {
  return `${plate.letters.join('')} ${plate.digits.join('')} ${plate.district}`;
}

/** Уникальный ключ для коллекций и дедупликации. */
export function plateKey(plate) {
  return `${plate.letters.join('')}${plate.digits.join('')}${plate.district}`;
}

export function numberOf(plate) {
  return plate.digits[0] * 1000 + plate.digits[1] * 100 + plate.digits[2] * 10 + plate.digits[3];
}
