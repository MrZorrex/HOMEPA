/**
 * Генерация знака, подсчёт Индекса редкости и цены.
 *
 * Формат знака: буква — три цифры — две буквы — код округа.
 * Буквы берутся только из набора, который визуально идентичен в кириллице
 * и латинице, поэтому знак читается одинаково на ru/en/tr без перевода.
 *
 * Порядок символов на знаке (и в массиве holds):
 *   0 — letters[0]
 *   1,2,3 — digits[0..2]
 *   4 — letters[1]
 *   5 — letters[2]
 */

import { weighted, randInt } from './rng.js';

export const LETTERS = ['A', 'B', 'E', 'K', 'M', 'H', 'O', 'P', 'C', 'T', 'Y', 'X'];

/** 24 округа Вектор-Сити: код, ключ локализации, цвет, буквенная пара округа. */
export const DISTRICTS = [
  { code: '01', key: 'd01', hue: 196, ini: ['H', 'B'] },
  { code: '02', key: 'd02', hue: 210, ini: ['C', 'T'] },
  { code: '03', key: 'd03', hue: 224, ini: ['O', 'X'] },
  { code: '05', key: 'd04', hue: 238, ini: ['M', 'P'] },
  { code: '07', key: 'd05', hue: 252, ini: ['K', 'A'] },
  { code: '09', key: 'd06', hue: 266, ini: ['B', 'E'] },
  { code: '11', key: 'd07', hue: 280, ini: ['T', 'O'] },
  { code: '13', key: 'd08', hue: 294, ini: ['X', 'M'] },
  { code: '15', key: 'd09', hue: 308, ini: ['A', 'P'] },
  { code: '17', key: 'd10', hue: 322, ini: ['E', 'K'] },
  { code: '19', key: 'd11', hue: 336, ini: ['P', 'C'] },
  { code: '21', key: 'd12', hue: 350, ini: ['M', 'A'] },
  { code: '23', key: 'd13', hue: 8, ini: ['O', 'B'] },
  { code: '24', key: 'd14', hue: 22, ini: ['K', 'X'] },
  { code: '33', key: 'd15', hue: 36, ini: ['T', 'E'] },
  { code: '47', key: 'd16', hue: 50, ini: ['C', 'M'] },
  { code: '52', key: 'd17', hue: 64, ini: ['H', 'O'] },
  { code: '66', key: 'd18', hue: 86, ini: ['B', 'A'] },
  { code: '74', key: 'd19', hue: 108, ini: ['X', 'P'] },
  { code: '77', key: 'd20', hue: 130, ini: ['E', 'T'] },
  { code: '96', key: 'd21', hue: 150, ini: ['A', 'C'] },
  { code: '99', key: 'd22', hue: 164, ini: ['M', 'K'] },
  { code: '116', key: 'd23', hue: 176, ini: ['P', 'H'] },
  { code: '177', key: 'd24', hue: 186, ini: ['O', 'E'] },
];

export const DISTRICT_BY_CODE = Object.fromEntries(DISTRICTS.map((d) => [d.code, d]));

/** Группы округов для коллекционных сетов. */
export const DISTRICT_GROUPS = {
  north: DISTRICTS.slice(0, 8).map((d) => d.code),
  south: DISTRICTS.slice(8, 16).map((d) => d.code),
  east: DISTRICTS.slice(16, 24).map((d) => d.code),
};

/** Локализованное имя округа по коду. */
export function districtKey(code) {
  const d = DISTRICT_BY_CODE[code];
  return d ? d.key : 'd01';
}

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

/** Особые цифровые комбинации, которые чаще выпадают при высоком сплаве. */
function specialDigits(rng) {
  const kind = weighted(rng, [
    ['triple', 16],
    ['stairUp', 12],
    ['stairDown', 10],
    ['mirror', 16],
    ['pair', 18],
    ['round', 12],
    ['low', 16],
  ]);
  const d = () => randInt(rng, 0, 9);
  switch (kind) {
    case 'triple': {
      const a = d();
      return [a, a, a];
    }
    case 'stairUp': {
      const s = randInt(rng, 0, 7);
      return [s, s + 1, s + 2];
    }
    case 'stairDown': {
      const s = randInt(rng, 2, 9);
      return [s, s - 1, s - 2];
    }
    case 'mirror': {
      const a = d();
      let b = d();
      if (b === a) b = (b + 1) % 10;
      return [a, b, a];
    }
    case 'pair': {
      const a = d();
      let b = d();
      if (b === a) b = (b + 1) % 10;
      return rng() < 0.5 ? [a, a, b] : [b, a, a];
    }
    case 'round': {
      return [randInt(rng, 1, 9), 0, 0];
    }
    default: {
      const n = randInt(rng, 1, 10);
      return [0, Math.floor(n / 10), n % 10];
    }
  }
}

function randomLetter(rng) {
  return LETTERS[randInt(rng, 0, LETTERS.length - 1)];
}

/** Особые буквенные комбинации: тройка одинаковых или пара в конце. */
function specialLetters(rng) {
  const kind = weighted(rng, [
    ['all', 10],
    ['tail', 22],
    ['head', 14],
  ]);
  const a = randomLetter(rng);
  if (kind === 'all') return [a, a, a];
  if (kind === 'tail') return [randomLetter(rng), a, a];
  return [a, a, randomLetter(rng)];
}

/**
 * Сгенерировать знак.
 * @param {function} rng
 * @param {{alloy?:number, home?:string|null, district?:string|null}} opts
 */
export function generatePlate(rng, opts = {}) {
  const alloy = opts.alloy || 0;

  const digitChance = 0.05 + alloy * 0.022;
  const digits = rng() < digitChance
    ? specialDigits(rng)
    : [randInt(rng, 0, 9), randInt(rng, 0, 9), randInt(rng, 0, 9)];

  const letterChance = 0.05 + alloy * 0.012;
  const letters = rng() < letterChance
    ? specialLetters(rng)
    : [randomLetter(rng), randomLetter(rng), randomLetter(rng)];

  let district = opts.district;
  if (!district) {
    district = opts.home && rng() < 0.1
      ? opts.home
      : DISTRICTS[randInt(rng, 0, DISTRICTS.length - 1)].code;
  }

  return { letters, digits, district };
}

/**
 * Перекрутить только незафиксированные позиции.
 * holds = [l0, d0, d1, d2, l1, l2]
 */
export function rerollPlate(rng, plate, holds, opts = {}) {
  const fresh = generatePlate(rng, opts);
  const letters = [
    holds[0] ? plate.letters[0] : fresh.letters[0],
    holds[4] ? plate.letters[1] : fresh.letters[1],
    holds[5] ? plate.letters[2] : fresh.letters[2],
  ];
  const digits = plate.digits.map((v, i) => (holds[1 + i] ? v : fresh.digits[i]));
  return { letters, digits, district: plate.district };
}

/** Порядок символов на знаке для рендера и фиксации. */
export function symbolsOf(plate) {
  return [
    plate.letters[0],
    String(plate.digits[0]),
    String(plate.digits[1]),
    String(plate.digits[2]),
    plate.letters[1],
    plate.letters[2],
  ];
}

/** Является ли позиция буквенной (для анимации барабанов). */
export function isLetterSlot(i) {
  return i === 0 || i === 4 || i === 5;
}

/**
 * Индекс редкости 0..100 + список сработавших паттернов.
 */
export function scorePlate(plate, ctx = {}) {
  const d = plate.digits;
  const L = plate.letters;
  const tags = [];
  let s = 0;

  const counts = {};
  for (const x of d) counts[x] = (counts[x] || 0) + 1;
  const maxCount = Math.max(...Object.values(counts));

  // Зеркало и пара взаимоисключающи: зеркало уже содержит пару,
  // иначе треть всех знаков улетала бы в «редкие».
  const isMirror = maxCount === 2 && d[0] === d[2];
  if (maxCount === 3) {
    s += 45;
    tags.push('triple');
  } else if (isMirror) {
    s += 22;
    tags.push('mirror');
  } else if (maxCount === 2) {
    s += 6;
    tags.push('pair');
  }

  const asc = d[1] === d[0] + 1 && d[2] === d[1] + 1;
  const desc = d[1] === d[0] - 1 && d[2] === d[1] - 1;
  if (asc) {
    s += 30;
    tags.push('stairUp');
  }
  if (desc) {
    s += 28;
    tags.push('stairDown');
  }

  const num = d[0] * 100 + d[1] * 10 + d[2];
  if (num !== 0 && num % 100 === 0) {
    s += 15;
    tags.push('round');
  }
  if (num >= 1 && num <= 10) {
    s += 25;
    tags.push('low');
  }

  if (L[0] === L[1] && L[1] === L[2]) {
    s += 30;
    tags.push('letters3');
  } else if (L[1] === L[2]) {
    s += 14;
    tags.push('twins');
  } else if (L[0] === L[1]) {
    s += 8;
    tags.push('pairHead');
  }

  const dist = DISTRICT_BY_CODE[plate.district];
  if (dist && dist.ini[0] === L[1] && dist.ini[1] === L[2]) {
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

/** Строковый вид знака: "A123BC 77" */
export function plateText(plate) {
  return `${plate.letters[0]}${plate.digits.join('')}${plate.letters[1]}${plate.letters[2]} ${plate.district}`;
}

/** Уникальный ключ для коллекций и дедупликации. */
export function plateKey(plate) {
  return `${plate.letters[0]}${plate.digits.join('')}${plate.letters[1]}${plate.letters[2]}${plate.district}`;
}

export function numberOf(plate) {
  return plate.digits[0] * 100 + plate.digits[1] * 10 + plate.digits[2];
}
