import * as P from '../src/game/plate.js';
import * as O from '../src/game/orders.js';

// Симуляция игрока: спин, фиксируем символы, которые уже подходят под маску, реролл.
function attempt(order, alloy, rerolls) {
  let plate = P.generatePlate(Math.random, { alloy });
  let sc = P.scorePlate(plate, {});
  if (O.matchesOrder(order, plate, sc)) return true;
  for (let r = 0; r < rerolls; r++) {
    const holds = [false, false, false, false, false, false];
    if (order.twins && plate.letters[1] === plate.letters[2]) { holds[4] = true; holds[5] = true; }
    for (let i = 0; i < 3; i++) if (order.mask[i] !== null && plate.digits[i] === order.mask[i]) holds[1 + i] = true;
    plate = P.rerollPlate(Math.random, plate, holds, { alloy });
    sc = P.scorePlate(plate, {});
    if (O.matchesOrder(order, plate, sc)) return true;
  }
  return false;
}

const profiles = [
  { name: 'новичок ', alloy: 0, rerolls: 1, diff: 0 },
  { name: 'средний ', alloy: 3, rerolls: 3, diff: 1 },
  { name: 'прокач. ', alloy: 7, rerolls: 5, diff: 3 },
];
for (const pr of profiles) {
  const byKind = {};
  for (let n = 0; n < 4000; n++) {
    const order = O.makeOrder(Math.random, pr.diff);
    let done = false;
    for (let spin = 0; spin < order.spinsLeft; spin++) {
      if (attempt(order, pr.alloy, pr.rerolls)) { done = true; break; }
    }
    const k = byKind[order.kind] || (byKind[order.kind] = { n: 0, ok: 0 });
    k.n++; if (done) k.ok++;
  }
  const out = Object.entries(byKind).map(([k, v]) => `${k}: ${(v.ok / v.n * 100).toFixed(0)}%`).join('  ');
  const all = Object.values(byKind).reduce((a, v) => ({ n: a.n + v.n, ok: a.ok + v.ok }), { n: 0, ok: 0 });
  console.log(pr.name, '| всего', (all.ok / all.n * 100).toFixed(0) + '%', '|', out);
}
