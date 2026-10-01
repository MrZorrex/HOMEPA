import * as P from '../src/game/plate.js';
import * as Eco from '../src/game/economy.js';
import * as O from '../src/game/orders.js';
import { dailyRng } from '../src/game/daily.js';

const N = 200000;
for (const alloy of [0, 3, 7]) {
  const c = {};
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const p = P.generatePlate(Math.random, { alloy });
    const sc = P.scorePlate(p, {});
    const tier = P.tierOf(sc.index).id;
    c[tier] = (c[tier] || 0) + 1;
    sum += P.priceOf(sc.index, Eco.marketMult(alloy));
  }
  const pct = Object.fromEntries(P.TIERS.map(t => [t.id, ((c[t.id]||0)/N*100).toFixed(2)+'%']));
  console.log('alloy', alloy, pct, 'avg price', (sum/N).toFixed(1));
}

// Детерминированность «Знака дня»
const a = dailyRng('2026-10-01', 0), b = dailyRng('2026-10-01', 0);
const pa = P.generatePlate(a, {alloy:2}), pb = P.generatePlate(b, {alloy:2});
console.log('daily deterministic:', P.plateKey(pa) === P.plateKey(pb), P.plateText(pa));

// Заказы выполнимы
let hit = 0;
const ord = O.makeOrder(Math.random, 1);
for (let i=0;i<50000;i++){ const p=P.generatePlate(Math.random,{alloy:3}); if(O.matchesOrder(ord,p,P.scorePlate(p,{}))) hit++; }
console.log('order kind', ord.kind, 'match rate', (hit/50000*100).toFixed(2)+'%', 'spins', ord.spinsLeft);

// Кривая апгрейдов
for (const k of Eco.UPGRADE_KEYS) {
  const costs=[]; for(let l=0;l<Eco.UPGRADES[k].max;l++) costs.push(Eco.upgradeCost(k,l));
  console.log(k.padEnd(8), 'total', costs.reduce((a,b)=>a+b,0), costs.join(' '));
}
console.log('idle rate lvl3', Eco.idleRate(3,1).toFixed(1), 'lvl7', Eco.idleRate(7,2.2).toFixed(1));
