/**
 * NOMERON — точка входа и игровой контроллер.
 *
 * Порядок запуска соответствует документации Яндекс Игр:
 * init SDK → загрузка сохранений → построение интерфейса → LoadingAPI.ready().
 */

import { Platform } from './platform/ysdk.js';
import { Storage } from './platform/storage.js';
import { Ads } from './platform/ads.js';
import { Payments } from './platform/payments.js';
import { I18n } from './platform/i18n.js';
import { STRINGS } from './i18n/strings.js';

import { mulberry32, hashSeed, todayKey, randInt } from './game/rng.js';
import * as P from './game/plate.js';
import * as Eco from './game/economy.js';
import { State, derived, rollover, progressTask, allTasksDone } from './game/state.js';
import { SETS, SET_BY_ID, registerPlate, setProgress } from './game/collections.js';
import * as Orders from './game/orders.js';
import { dailyRng, DAILY_ATTEMPTS, streakReward, seasonDistrict } from './game/daily.js';

import { Audio } from './ui/audio.js';
import { FX } from './ui/fx.js';
import { $, el, setText, toast, showModal, closeModal, isModalOpen, plateCard, fmt } from './ui/dom.js';

const LB_NAME = 'daily';

const t = (k, p) => I18n.t(k, p);

/** ------------------------------------------------------------------ */
/** Состояние сессии (не сохраняется)                                    */
/** ------------------------------------------------------------------ */
const session = {
  plate: null,
  scored: null,
  holds: [false, false, false, false, false, false],
  rerollsUsed: 0,
  bonusRerolls: 0,
  spinning: false,
  resolved: true,
  screen: 'spin',
  autoTimer: null,
  dailyMode: false,
  dailyRng: null,
  dailyRerolls: 0,
  rng: Math.random,
};

const DAILY_REROLLS = 2;

/** ------------------------------------------------------------------ */
/** Запуск                                                              */
/** ------------------------------------------------------------------ */
async function boot() {
  await Platform.init();
  I18n.init(STRINGS);
  document.title = t('app.title');

  await State.load();
  const s = State.data;

  rollover(s);
  if (!s.home) s.home = String(randInt(Math.random, 1, 24)).padStart(2, '0');

  Audio.init(s.settings.muted);
  FX.init($('fx'));

  bindLifecycle();
  bindInput();
  buildStaticUI();

  // Покупки: каталог и обязательное консумирование зависших платежей (п.1.13.1)
  Payments.init(grantProduct).then(() => renderShopButton());

  refreshOrders();
  renderAll();

  $('boot').classList.add('hidden');
  $('app').classList.remove('hidden');

  // п.1.19.2 — игрок может приступить к игре
  Platform.ready();

  State.save();
  checkOfflineIncome();
  runTutorial();

  // Игрок может держать вкладку открытой через полночь — проверяем смену суток
  setInterval(() => {
    const ev = rollover(State.data);
    if (ev.newDay) {
      State.save();
      renderAll();
      toast(t('daily.tasks'));
    }
  }, 60000);
}

/** ------------------------------------------------------------------ */
/** Жизненный цикл: пауза, звук, реклама                                */
/** ------------------------------------------------------------------ */
function bindLifecycle() {
  const pause = () => {
    Audio.suspend();
    stopAutospin();
  };
  const resume = () => {
    if (!State.data.settings.muted) Audio.resume();
  };

  Platform.onPause(pause);
  Platform.onResume(resume);

  // п.1.3 — звук останавливается при потере фокуса
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else resume();
  });
  window.addEventListener('blur', pause);
  window.addEventListener('focus', resume);

  // п.4.7 — звук и игровой процесс на паузу во время рекламы
  Ads.onAdStart = pause;
  Ads.onAdEnd = () => {
    resume();
    if (State.data.autospin.on) startAutospin();
  };

  window.addEventListener('beforeunload', () => {
    State.save();
  });

  // п.1.6.1.8 — лонгтап не открывает контекстное меню
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}

/** ------------------------------------------------------------------ */
/** Ввод                                                                */
/** ------------------------------------------------------------------ */
function bindInput() {
  $('btnSpin').onclick = () => doSpin();
  $('btnReroll').onclick = () => doReroll();
  $('btnSell').onclick = () => (session.dailyMode ? finishDaily() : doSell());
  $('btnStore').onclick = () => doStore();
  $('btnDeliver').onclick = () => openDeliver();
  $('btnSettings').onclick = openSettings;
  $('btnShop').onclick = openShop;

  $('autospinToggle').onchange = (e) => {
    State.data.autospin.on = e.target.checked;
    State.save();
    if (e.target.checked) startAutospin();
    else stopAutospin();
  };
  $('thresholdSelect').onchange = (e) => {
    State.data.autospin.threshold = e.target.value;
    State.save();
  };

  for (const btn of document.querySelectorAll('.nav-btn')) {
    btn.onclick = () => goScreen(btn.dataset.screen);
  }

  $('btnDailySpin').onclick = () => startDailyAttempt();
  $('btnDailyExtra').onclick = () => watchForExtraAttempt();

  // п.1.6.2.4 — управление клавиатурой, не зависящее от раскладки (используем code)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (isModalOpen()) closeModal();
      return;
    }
    if (isModalOpen()) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (session.screen === 'spin' && !$('btnSpin').disabled) doSpin();
      return;
    }
    if (e.code === 'KeyR') {
      doReroll();
      return;
    }
    const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
    if (digit >= 0) toggleHold(digit);
  });
}

function goScreen(name) {
  session.screen = name;
  for (const sc of document.querySelectorAll('.screen')) {
    sc.classList.toggle('active', sc.id === `screen-${name}`);
  }
  for (const btn of document.querySelectorAll('.nav-btn')) {
    btn.classList.toggle('active', btn.dataset.screen === name);
  }
  if (name !== 'spin' && session.dailyMode) cancelDailyMode();
  if (name === 'daily') renderDaily(true);
  if (name === 'orders') renderOrders();
  if (name === 'collection') renderCollection();
  if (name === 'workshop') renderWorkshop();
  Audio.click();
}

/** ------------------------------------------------------------------ */
/** Статические подписи                                                 */
/** ------------------------------------------------------------------ */
function buildStaticUI() {
  setText('navSpin', t('nav.spin'));
  setText('navOrders', t('nav.orders'));
  setText('navCollection', t('nav.collection'));
  setText('navWorkshop', t('nav.workshop'));
  setText('navDaily', t('nav.daily'));

  setText('ordersTitle', t('orders.title'));
  setText('collectionTitle', t('collection.title'));
  setText('collectionHint', t('collection.hint'));
  setText('workshopTitle', t('workshop.title'));
  setText('dailyTitle', t('daily.title'));
  setText('dailyDesc', t('daily.desc'));
  setText('lbTitle', t('daily.leaderboard'));
  setText('tasksTitle', t('daily.tasks'));
  setText('streakTitle', t('daily.streak'));
  setText('vaultTitle', t('spin.storage'));
  setText('btnSpin', t('spin.button'));
  setText('btnSell', t('spin.sell'));
  setText('btnStore', t('spin.store'));
  setText('btnDeliver', t('spin.deliver'));
  setText('autospinLabel', t('spin.autospin'));
  setText('thresholdLabel', t('spin.threshold'));
  setText('btnDailyExtra', t('daily.extra'));

  const sel = $('thresholdSelect');
  sel.innerHTML = '';
  for (const tier of P.TIERS.slice(1)) {
    const o = el('option');
    o.value = tier.id;
    o.textContent = t(`tier.${tier.id}`);
    sel.appendChild(o);
  }
  sel.value = State.data.autospin.threshold;
  $('autospinToggle').checked = State.data.autospin.on;

  // Ряд кнопок фиксации под символами знака
  const row = $('holdRow');
  row.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    if (i === 1 || i === 4) row.appendChild(el('div', 'hold-dot spacer'));
    const b = el('button', 'hold-dot', '○');
    b.onclick = () => toggleHold(i);
    row.appendChild(b);
  }
}

/** ------------------------------------------------------------------ */
/** Спин, фиксация, реролл                                              */
/** ------------------------------------------------------------------ */
function doSpin() {
  if (session.spinning) return;
  const s = State.data;

  if (session.dailyMode) {
    if (session.dailyStarted) return;
    session.dailyStarted = true;
  } else if (!session.resolved) {
    // Знак ещё не продан и не убран: кнопка в этот момент заблокирована,
    // но клавиатура может прийти сюда — молча игнорируем.
    return;
  }

  const d = derived(s);
  session.spinning = true;
  session.holds = [false, false, false, false, false, false];
  session.rerollsUsed = 0;
  session.bonusRerolls = 0;
  session.resolved = false;

  const rng = session.dailyMode ? session.dailyRng : Math.random;
  const plate = P.generatePlate(rng, {
    alloy: session.dailyMode ? 2 : d.alloy,
    home: session.dailyMode ? null : s.home,
  });

  Audio.press();
  animateReels(plate, d.spinMs, () => {
    session.plate = plate;
    session.scored = P.scorePlate(plate, { home: session.dailyMode ? null : s.home });
    session.spinning = false;

    if (!session.dailyMode) {
      s.stats.spins += 1;
      progressTask(s, 'spins', 1);
      const expired = Orders.tickOrders(s);
      if (expired.length) toast(t('orders.expired'), 'bad');
      checkUnlocks();
      State.save();
    }

    revealResult();
    renderAll();
    advanceTutorial('spin');
  });
}

/** Случайный символ для позиции: буква или цифра в зависимости от слота. */
function randomSymbolFor(i) {
  return P.isLetterSlot(i)
    ? P.LETTERS[Math.floor(Math.random() * P.LETTERS.length)]
    : String(Math.floor(Math.random() * 10));
}

/** Барабаны останавливаются по очереди слева направо, последний — медленнее. */
function animateReels(target, totalMs, done) {
  const syms = Array.from(document.querySelectorAll('#plate .sym'));
  const final = P.symbolsOf(target);
  const stopAt = [0.42, 0.52, 0.62, 0.72, 0.84, 1].map((f) => f * totalMs);
  const start = performance.now();
  const stopped = [false, false, false, false, false, false];

  $('plateCode').textContent = target.district;
  $('verdictTier').textContent = '';
  $('verdictTags').innerHTML = '';
  $('verdictIndex').textContent = '';
  $('verdictPrice').textContent = '';
  syms.forEach((n) => n.classList.add('rolling'));

  let lastTick = 0;
  function frame(now) {
    const dt = now - start;
    for (let i = 0; i < 6; i++) {
      if (stopped[i]) continue;
      if (dt >= stopAt[i]) {
        stopped[i] = true;
        syms[i].textContent = final[i];
        syms[i].classList.remove('rolling');
        Audio.tick();
        continue;
      }
      // Чем ближе к остановке, тем реже меняются символы — эффект замедления
      const progress = dt / stopAt[i];
      const period = 40 + progress * progress * 140;
      if (now - lastTick > period / 6) {
        syms[i].textContent = randomSymbolFor(i);
      }
    }
    if (now - lastTick > 24) lastTick = now;

    if (stopped.every(Boolean)) {
      done();
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function revealResult() {
  const tier = P.tierOf(session.scored.index);
  const rank = P.tierRank(tier.id);

  $('plate').classList.add('flash');
  setTimeout(() => $('plate').classList.remove('flash'), 700);

  Audio.reveal(tier.id);

  if (rank >= 2) {
    const rect = $('plate').getBoundingClientRect();
    FX.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, tier.color, 18 + rank * 14, 0.6 + rank * 0.3);
    FX.shake($('plateStage'), rank - 1);
  }
  if (rank >= 4) FX.confetti(50 + rank * 25);

  if (!session.dailyMode && rank >= 2) {
    State.data.stats.rareFound += 1;
    progressTask(State.data, 'rare', 1);
  }
  if (!session.dailyMode && session.scored.index > State.data.stats.best) {
    State.data.stats.best = session.scored.index;
    if (session.scored.index >= 45) toast(t('msg.newRecord', { n: session.scored.index }), 'good');
  }
}

function toggleHold(i) {
  if (session.spinning || !session.plate || session.resolved) return;
  if (rerollsLeft() <= 0) return;
  session.holds[i] = !session.holds[i];
  Audio[session.holds[i] ? 'lock' : 'unlock']();
  renderPlate();
  advanceTutorial('hold');
}

function rerollsLeft() {
  if (session.dailyMode) return DAILY_REROLLS - session.rerollsUsed;
  const d = derived(State.data);
  return d.rerolls + session.bonusRerolls - session.rerollsUsed;
}

function currentPrice() {
  if (!session.scored) return 0;
  const s = State.data;
  const d = derived(s);
  const mult = d.market * (session.plate.district === seasonDistrict() ? 2 : 1);
  return P.priceOf(session.scored.index, mult);
}

function doReroll() {
  if (session.spinning || !session.plate || session.resolved) return;
  if (rerollsLeft() <= 0) return;

  const s = State.data;
  if (!session.dailyMode) {
    const cost = Eco.rerollCost(currentPrice());
    if (s.credits < cost) {
      Audio.error();
      toast(t('msg.notEnough'), 'bad');
      return;
    }
    s.credits -= cost;
    s.stats.rerolls += 1;
    progressTask(s, 'rerolls', 1);
  }

  session.rerollsUsed += 1;
  session.spinning = true;
  const d = derived(s);
  const rng = session.dailyMode ? session.dailyRng : Math.random;
  const next = P.rerollPlate(rng, session.plate, session.holds, {
    alloy: session.dailyMode ? 2 : d.alloy,
    home: session.dailyMode ? null : s.home,
  });

  Audio.press();
  animateRerollOnly(next, Math.max(500, d.spinMs * 0.6), () => {
    session.plate = next;
    session.scored = P.scorePlate(next, { home: session.dailyMode ? null : s.home });
    session.spinning = false;
    revealResult();
    renderAll();
    if (!session.dailyMode) State.save();
    advanceTutorial('reroll');
  });
}

function animateRerollOnly(target, ms, done) {
  const syms = Array.from(document.querySelectorAll('#plate .sym'));
  const final = P.symbolsOf(target);
  const start = performance.now();
  function frame(now) {
    const dt = now - start;
    const p = Math.min(1, dt / ms);
    for (let i = 0; i < 6; i++) {
      if (session.holds[i]) continue;
      if (p >= 1) {
        syms[i].textContent = final[i];
        syms[i].classList.remove('rolling');
      } else {
        syms[i].classList.add('rolling');
        syms[i].textContent = randomSymbolFor(i);
      }
    }
    if (p >= 1) {
      Audio.tick();
      done();
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** ------------------------------------------------------------------ */
/** Продажа, хранилище, заказы                                          */
/** ------------------------------------------------------------------ */
function doSell() {
  if (!session.plate || session.resolved || session.spinning) return;
  const s = State.data;
  const price = currentPrice();
  s.credits += price;
  s.stats.sold += 1;
  s.stats.earned += price;
  progressTask(s, 'sell', price);
  session.resolved = true;
  Audio.coin();
  toast(t('msg.sold', { credits: fmt(price) }), 'good');
  checkUnlocks();
  State.save();
  renderAll();
  advanceTutorial('sell');
}

function doStore() {
  if (!session.plate || session.resolved || session.spinning) return;
  const s = State.data;
  const d = derived(s);
  if (s.storage.length >= d.storageCap) {
    Audio.error();
    toast(t('msg.storageFull'), 'bad');
    return;
  }
  const key = P.plateKey(session.plate);
  if (s.storage.some((it) => P.plateKey(it.plate) === key)) {
    Audio.error();
    toast(t('msg.duplicate'), 'bad');
    return;
  }

  s.storage.push({ plate: session.plate, index: session.scored.index, at: Date.now() });
  const filled = registerPlate(s, session.plate, session.scored);
  if (filled.length) progressTask(s, 'collect', filled.length);

  s.unlocked.collection = true;
  session.resolved = true;
  Audio.coin();
  toast(t('msg.stored'), 'good');

  for (const setId of filled) {
    const pr = setProgress(s, setId);
    if (pr.done && !s.setsClaimed.includes(setId)) {
      toast(t('msg.setDone', { name: t(`set.${setId}`) }), 'good');
      FX.confetti(80);
    }
  }

  checkUnlocks();
  State.save();
  renderAll();
  advanceTutorial('store');
}

function matchingOrders() {
  if (!session.plate || !session.scored || session.resolved) return [];
  return State.data.orders.filter((o) => Orders.matchesOrder(o, session.plate, session.scored));
}

function openDeliver() {
  const list = matchingOrders();
  if (!list.length) {
    toast(t('orders.noMatch'), 'bad');
    return;
  }
  const order = list[0];
  openHaggle(order);
}

function openHaggle(order) {
  const box = el('div');
  box.appendChild(el('h3', null, t('orders.haggleTitle')));
  box.appendChild(plateCard(session.plate, P.tierOf(session.scored.index).color));

  for (const opt of Orders.HAGGLE_OPTIONS) {
    const b = el('button', 'btn', t(`orders.haggle.${opt}`));
    b.onclick = () => {
      const res = Orders.haggleResult(Math.random, opt);
      closeModal();
      completeOrder(order, res);
    };
    box.appendChild(b);
  }
  const skip = el('button', 'btn btn-ghost', t('orders.deliver'));
  skip.onclick = () => {
    closeModal();
    completeOrder(order, null);
  };
  box.appendChild(skip);

  showModal(box);
}

function completeOrder(order, haggle) {
  const s = State.data;
  const bargain = haggle || { win: false, gain: 0, skipped: true };
  const d = derived(s);
  const base = Orders.orderReward(order, session.plate, session.scored, d.market);
  const reward = Math.round(base * (1 + bargain.gain));

  s.credits += reward;
  s.reputation += order.rep;
  s.stats.ordersDone += 1;
  s.stats.earned += reward;
  progressTask(s, 'orders', 1);
  progressTask(s, 'sell', reward);
  s.orders = s.orders.filter((o) => o.id !== order.id);
  session.resolved = true;

  Audio.coin();
  FX.confetti(60);
  if (bargain.win) toast(t('orders.haggleWin', { percent: Math.round(bargain.gain * 100) }), 'good');
  else if (!bargain.skipped) toast(t('orders.haggleFail'));
  toast(t('orders.done', { credits: fmt(reward), rep: order.rep }), 'good');

  refreshOrders();
  State.save();
  renderAll();

  // Интерстишл только в логической паузе — после завершения заказа (п.4.4)
  maybeInterstitial();
}

function refreshOrders() {
  const s = State.data;
  const d = derived(s);
  if (!s.unlocked.orders) return;
  Orders.refillOrders(s, Math.random, d.orderSlots, s.upgrades.links);
}

/** ------------------------------------------------------------------ */
/** Автокрутилка и оффлайн-доход                                        */
/** ------------------------------------------------------------------ */
function startAutospin() {
  stopAutospin();
  const s = State.data;
  const d = derived(s);
  if (!d.autospin || !s.autospin.on) return;

  const tickMs = Math.max(350, d.spinMs * 0.8);
  session.autoTimer = setInterval(() => {
    if (document.hidden || isModalOpen() || session.dailyMode) return;
    const dd = derived(s);
    const plate = P.generatePlate(Math.random, { alloy: dd.alloy, home: s.home });
    const scored = P.scorePlate(plate, { home: s.home });
    s.stats.spins += 1;
    progressTask(s, 'spins', 1);

    const rank = P.tierRank(P.tierOf(scored.index).id);
    const keepFrom = P.tierRank(s.autospin.threshold);

    if (rank >= keepFrom && s.storage.length < dd.storageCap) {
      const key = P.plateKey(plate);
      if (!s.storage.some((it) => P.plateKey(it.plate) === key)) {
        s.storage.push({ plate, index: scored.index, at: Date.now() });
        const filled = registerPlate(s, plate, scored);
        if (filled.length) progressTask(s, 'collect', filled.length);
      }
    } else {
      const mult = dd.market * (plate.district === seasonDistrict() ? 2 : 1);
      const price = P.priceOf(scored.index, mult);
      s.credits += price;
      s.stats.earned += price;
      s.stats.sold += 1;
      progressTask(s, 'sell', price);
    }
    Orders.tickOrders(s);
    renderHud();
    renderVault();
  }, tickMs);
}

function stopAutospin() {
  if (session.autoTimer) {
    clearInterval(session.autoTimer);
    session.autoTimer = null;
  }
}

function checkOfflineIncome() {
  const s = State.data;
  const d = derived(s);
  if (!s.autospin.on || d.idleRate <= 0) {
    if (s.autospin.on) startAutospin();
    return;
  }
  const elapsed = Math.max(0, (Date.now() - (s.lastSeen || Date.now())) / 1000);
  const capped = Math.min(elapsed, d.offlineCap);
  const earned = Math.floor(capped * d.idleRate);
  if (earned < 50) {
    startAutospin();
    return;
  }

  const box = el('div');
  box.appendChild(el('h3', null, t('offline.title')));
  box.appendChild(el('p', null, t('offline.text', { credits: fmt(earned) })));

  const claim = el('button', 'btn btn-primary', t('offline.claim'));
  claim.onclick = () => {
    s.credits += earned;
    State.save();
    closeModal();
    renderAll();
    startAutospin();
    Audio.coin();
  };

  const dbl = el('button', 'btn btn-rv', t('offline.double'));
  dbl.onclick = async () => {
    const ok = await Ads.showRewarded(() => {
      s.credits += earned * 2;
      State.save();
      Audio.coin();
    });
    if (!ok) {
      s.credits += earned;
      State.save();
      toast(t('msg.adUnavailable'));
    }
    closeModal();
    renderAll();
    startAutospin();
  };

  box.appendChild(claim);
  box.appendChild(dbl);
  showModal(box, { closable: false });
}

/** ------------------------------------------------------------------ */
/** Знак дня                                                            */
/** ------------------------------------------------------------------ */
function startDailyAttempt() {
  const s = State.data;
  if (s.dailyPlate.attempts >= DAILY_ATTEMPTS + (s.dailyPlate.bonus || 0)) {
    toast(t('daily.noAttempts'), 'bad');
    return;
  }
  session.dailyMode = true;
  session.dailyStarted = false;
  session.dailyRng = dailyRng(todayKey(), s.dailyPlate.attempts);
  session.rerollsUsed = 0;
  session.resolved = false;
  s.dailyPlate.attempts += 1;
  State.save();

  goScreen('spin');
  $('btnSell').textContent = t('common.ok');
  $('btnStore').classList.add('hidden');
  doSpin();
  renderAll();
}

function cancelDailyMode() {
  session.dailyMode = false;
  session.dailyStarted = false;
  session.resolved = true;
  $('btnSell').textContent = t('spin.sell');
  $('btnStore').classList.remove('hidden');
  renderAll();
}

async function finishDaily() {
  const s = State.data;
  const score = session.scored ? session.scored.index : 0;
  if (score > s.dailyPlate.best) {
    s.dailyPlate.best = score;
    s.dailyPlate.bestPlate = session.plate;
    if (Platform.available && Storage.authorized) {
      Platform.setScore(LB_NAME, score);
    }
  }
  State.save();
  cancelDailyMode();
  goScreen('daily');
  renderDaily(true);

  if (!Storage.authorized && !session.authPrompted) {
    session.authPrompted = true;
    promptAuth();
  }
}

async function watchForExtraAttempt() {
  const s = State.data;
  const ok = await Ads.showRewarded(() => {
    s.dailyPlate.bonus = (s.dailyPlate.bonus || 0) + 1;
    State.save();
    toast('+1', 'good');
  });
  if (!ok) toast(t('msg.adUnavailable'));
  renderDaily();
}

/** ------------------------------------------------------------------ */
/** Реклама                                                             */
/** ------------------------------------------------------------------ */
function maybeInterstitial() {
  const s = State.data;
  if (s.noAds) return;
  if (!Ads.canShowInterstitial()) return;
  if (s.stats.ordersDone < 2) return; // не беспокоим новичка
  Ads.showInterstitial();
}

async function watchForExtraReroll() {
  const ok = await Ads.showRewarded(() => {
    session.bonusRerolls += 1;
    toast(`+1 ${t('spin.reroll')}`, 'good');
  });
  if (!ok) toast(t('msg.adUnavailable'));
  renderAll();
}

/** ------------------------------------------------------------------ */
/** Покупки                                                             */
/** ------------------------------------------------------------------ */
function grantProduct(productID) {
  const s = State.data;
  const id = String(productID);
  if (id.includes('noads')) {
    s.noAds = true;
  } else if (id.includes('starter')) {
    s.credits += 5000;
    s.sparks += 10;
    s.upgrades.calib = Math.min(Eco.UPGRADES.calib.max, s.upgrades.calib + 2);
  } else if (id.includes('sparks_l')) {
    s.sparks += 120;
  } else if (id.includes('sparks_m')) {
    s.sparks += 50;
  } else if (id.includes('sparks')) {
    s.sparks += 18;
  } else if (id.includes('credits')) {
    s.credits += 12000;
  } else {
    s.sparks += 10;
  }
  State.save();
  renderAll();
}

function renderShopButton() {
  $('btnShop').classList.toggle('hidden', !Payments.available);
}

function openShop() {
  const box = el('div');
  box.appendChild(el('h3', null, t('shop.title')));

  if (!Payments.available || !Payments.catalog.length) {
    box.appendChild(el('p', null, t('shop.unavailable')));
  } else {
    for (const item of Payments.catalog) {
      const row = el('div', 'shop-item');
      if (item.imageURI) {
        const img = el('img', 'shop-img');
        img.src = item.imageURI;
        img.alt = '';
        row.appendChild(img);
      }
      const body = el('div', 'shop-body');
      body.appendChild(el('div', 'shop-name', item.title || item.id));
      if (item.description) body.appendChild(el('div', 'shop-desc', item.description));
      row.appendChild(body);

      const buy = el('button', 'btn btn-sm');
      // п.1.13.4 — стоимость цифрами и портальная валюта, всё из SDK (п.1.13.2)
      const price = el('span', 'shop-price');
      price.append(document.createTextNode(String(item.priceValue ?? item.price ?? '')));
      if (item.currencyImage) {
        const ci = el('img');
        ci.src = item.currencyImage;
        ci.alt = item.currencyCode || '';
        price.appendChild(ci);
      } else {
        price.append(document.createTextNode(` ${item.currencyCode || ''}`));
      }
      buy.appendChild(price);
      buy.onclick = async () => {
        buy.disabled = true;
        const res = await Payments.purchase(item.id);
        buy.disabled = false;
        if (res === 'ok') {
          toast(t('shop.thanks'), 'good');
          FX.confetti(70);
          closeModal();
        } else if (res === 'cancelled') {
          toast(t('shop.cancelled'));
        } else {
          toast(t('shop.unavailable'), 'bad');
        }
      };
      row.appendChild(buy);
      box.appendChild(row);
    }
  }

  const close = el('button', 'btn btn-ghost', t('common.close'));
  close.onclick = closeModal;
  box.appendChild(close);
  showModal(box);
}

/** ------------------------------------------------------------------ */
/** Авторизация и настройки                                             */
/** ------------------------------------------------------------------ */
function promptAuth() {
  if (!Platform.available || Storage.authorized) return;
  const box = el('div');
  box.appendChild(el('h3', null, t('auth.title')));
  // п.1.2.1 — объясняем выгоду до нажатия кнопки входа
  box.appendChild(el('p', null, t('auth.text')));

  const go = el('button', 'btn btn-primary', t('auth.button'));
  go.onclick = async () => {
    const ok = await Storage.requestAuth();
    closeModal();
    if (ok) {
      toast(t('auth.done'), 'good');
      if (State.data.dailyPlate.best > 0) Platform.setScore(LB_NAME, State.data.dailyPlate.best);
      renderDaily(true);
    }
  };
  const later = el('button', 'btn btn-ghost', t('auth.later'));
  later.onclick = closeModal;

  box.appendChild(go);
  box.appendChild(later);
  showModal(box);
}

function openSettings() {
  const s = State.data;
  const box = el('div');
  box.appendChild(el('h3', null, t('settings.title')));

  const sound = el('button', 'btn', `${t('settings.sound')}: ${s.settings.muted ? '🔇' : '🔊'}`);
  sound.onclick = () => {
    s.settings.muted = !s.settings.muted;
    Audio.setMuted(s.settings.muted);
    if (!s.settings.muted) Audio.resume();
    sound.textContent = `${t('settings.sound')}: ${s.settings.muted ? '🔇' : '🔊'}`;
    State.save();
  };
  box.appendChild(sound);

  const how = el('button', 'btn btn-ghost', t('settings.howto'));
  how.onclick = () => {
    const h = el('div');
    h.appendChild(el('h3', null, t('settings.howto')));
    h.appendChild(el('p', null, t('settings.howtoText')));
    const ok = el('button', 'btn btn-primary', t('common.ok'));
    ok.onclick = openSettings;
    h.appendChild(ok);
    showModal(h);
  };
  box.appendChild(how);

  if (Platform.available && !Storage.authorized) {
    const auth = el('button', 'btn btn-ghost', t('auth.button'));
    auth.onclick = () => {
      closeModal();
      promptAuth();
    };
    box.appendChild(auth);
  }

  const close = el('button', 'btn btn-ghost', t('common.close'));
  close.onclick = closeModal;
  box.appendChild(close);
  showModal(box);
}

/** ------------------------------------------------------------------ */
/** Прогресс открытия систем и обучение                                 */
/** ------------------------------------------------------------------ */
function checkUnlocks() {
  const s = State.data;
  const before = JSON.stringify(s.unlocked);
  if (s.stats.spins >= 4) s.unlocked.orders = true;
  if (s.stats.spins >= 8 || s.stats.sold >= 1) s.unlocked.workshop = true;
  if (s.stats.spins >= 14) s.unlocked.daily = true;
  if (before !== JSON.stringify(s.unlocked)) {
    refreshOrders();
    renderNav();
  }
}

function runTutorial() {
  const s = State.data;
  if (s.tutorial.done) return;
  if (s.tutorial.step === 0) s.tutorial.step = 1;
  showTutorial();
}

function showTutorial() {
  const s = State.data;
  const box = $('tutorial');
  if (s.tutorial.done || s.tutorial.step < 1 || s.tutorial.step > 6) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  $('tutorialText').textContent = t(`tut.${s.tutorial.step}`);
}

function advanceTutorial(action) {
  const s = State.data;
  if (s.tutorial.done) return;
  const step = s.tutorial.step;
  if (step === 1 && action === 'spin') s.tutorial.step = 2;
  else if (step === 2 && action === 'hold') s.tutorial.step = 3;
  else if (step === 3 && action === 'reroll') s.tutorial.step = 4;
  else if (step === 4 && (action === 'sell' || action === 'store')) s.tutorial.step = 5;
  else if (step === 5 && action === 'spin' && s.unlocked.orders) s.tutorial.step = 6;
  else if (step === 6 && s.unlocked.workshop) {
    s.tutorial.step = 7;
    s.tutorial.done = true;
  }
  showTutorial();
  State.save();
}

/** ------------------------------------------------------------------ */
/** Рендер                                                              */
/** ------------------------------------------------------------------ */
function renderAll() {
  renderHud();
  renderPlate();
  renderVerdict();
  renderActions();
  renderVault();
  renderNav();
  renderAutospin();
  renderSeason();
  if (session.screen === 'orders') renderOrders();
  if (session.screen === 'collection') renderCollection();
  if (session.screen === 'workshop') renderWorkshop();
  if (session.screen === 'daily') renderDaily();
}

function renderHud() {
  const s = State.data;
  $('hudCredits').querySelector('b').textContent = fmt(s.credits);
  $('hudSparks').querySelector('b').textContent = fmt(s.sparks);
}

function renderSeason() {
  const code = seasonDistrict();
  const note = $('seasonNote');
  note.classList.remove('hidden');
  note.textContent = `${t('spin.season')} — ${t(P.districtKey(code))} (${code})`;
}

function renderPlate() {
  const syms = Array.from(document.querySelectorAll('#plate .sym'));
  if (session.plate) {
    const vals = P.symbolsOf(session.plate);
    syms.forEach((n, i) => {
      if (!session.spinning) n.textContent = vals[i];
      n.classList.toggle('locked', session.holds[i]);
    });
    $('plateCode').textContent = session.plate.district;
  }
  const dots = Array.from(document.querySelectorAll('.hold-dot:not(.spacer)'));
  dots.forEach((d, i) => {
    d.classList.toggle('on', session.holds[i]);
    d.textContent = session.holds[i] ? '●' : '○';
  });
}

function renderVerdict() {
  if (!session.scored || session.spinning) return;
  const tier = P.tierOf(session.scored.index);
  const tierEl = $('verdictTier');
  tierEl.textContent = t(`tier.${tier.id}`);
  tierEl.style.color = tier.color;
  document.documentElement.style.setProperty('--tier', tier.color);

  const tags = $('verdictTags');
  tags.innerHTML = '';
  for (const tag of session.scored.tags) {
    tags.appendChild(el('span', 'tag', t(`tag.${tag}`)));
  }

  $('verdictIndex').innerHTML = `${t('spin.index')} <b>${session.scored.index}</b>`;
  $('verdictPrice').innerHTML = session.dailyMode
    ? ''
    : `${t('spin.price')} <b>${fmt(currentPrice())}</b>`;
}

function renderActions() {
  const s = State.data;
  const has = !!session.plate && !session.resolved && !session.spinning;
  const left = rerollsLeft();

  const btnReroll = $('btnReroll');
  const btnSpin = $('btnSpin');
  const btnSell = $('btnSell');
  const btnStore = $('btnStore');
  const btnDeliver = $('btnDeliver');

  btnSpin.disabled = session.spinning
    || (session.dailyMode && session.dailyStarted)
    || (!session.dailyMode && !!session.plate && !session.resolved);

  if (has && left > 0) {
    btnReroll.disabled = false;
    const cost = session.dailyMode ? 0 : Eco.rerollCost(currentPrice());
    btnReroll.textContent = session.dailyMode
      ? `${t('spin.reroll')} (${left})`
      : `${t('spin.reroll')} · ${fmt(cost)} 💳 (${left})`;
    btnReroll.classList.remove('btn-rv');
    btnReroll.onclick = () => doReroll();
  } else if (has && left <= 0 && !session.dailyMode && Platform.available) {
    // Доп. реролл за рекламу — это бонус сверх лимита, игра проходится и без него (п.4.5.2)
    btnReroll.disabled = false;
    btnReroll.textContent = t('rv.extraReroll');
    btnReroll.classList.add('btn-rv');
    btnReroll.onclick = () => watchForExtraReroll();
  } else {
    btnReroll.disabled = true;
    btnReroll.textContent = t('spin.reroll');
    btnReroll.classList.remove('btn-rv');
    btnReroll.onclick = () => doReroll();
  }

  btnSell.disabled = !has;
  btnStore.disabled = !has;
  btnSell.textContent = session.dailyMode ? t('common.ok') : t('spin.sell');

  const matches = matchingOrders();
  btnDeliver.classList.toggle('hidden', session.dailyMode || matches.length === 0);
  if (matches.length) {
    btnDeliver.textContent = `${t('spin.deliver')} · ${t(`client.${matches[0].client}`)}`;
  }

  $('spinHint').textContent = has && !session.dailyMode && left > 0 ? t('spin.holdHint') : '';
}

function renderVault() {
  const s = State.data;
  const d = derived(s);
  setText('vaultCount', t('storage.count', { n: s.storage.length, cap: d.storageCap }));
  const list = $('vaultList');
  list.innerHTML = '';
  const recent = s.storage.slice(-12).reverse();
  if (!recent.length) {
    list.appendChild(el('span', 'muted', t('storage.empty')));
    return;
  }
  for (const item of recent) {
    const tier = P.tierOf(item.index);
    const chip = el('span', 'vault-chip', P.plateText(item.plate));
    chip.style.borderColor = `${tier.color}66`;
    chip.style.color = tier.color;
    list.appendChild(chip);
  }
}

function renderNav() {
  const s = State.data;
  const map = {
    orders: s.unlocked.orders,
    collection: s.unlocked.collection || s.storage.length > 0,
    workshop: s.unlocked.workshop,
    daily: s.unlocked.daily,
  };
  for (const btn of document.querySelectorAll('.nav-btn')) {
    const name = btn.dataset.screen;
    if (name === 'spin') continue;
    btn.classList.toggle('locked', !map[name]);
  }
}

function renderAutospin() {
  const s = State.data;
  const d = derived(s);
  $('autospinBox').classList.toggle('hidden', !d.autospin);
}

function renderOrders() {
  const s = State.data;
  const list = $('orderList');
  list.innerHTML = '';
  if (!s.orders.length) {
    list.appendChild(el('p', 'muted', t('orders.empty')));
    return;
  }
  for (const o of s.orders) {
    const match = session.plate && !session.resolved && Orders.matchesOrder(o, session.plate, session.scored);
    const card = el('div', `order${match ? ' match' : ''}`);

    const client = Orders.CLIENTS.find((c) => c.id === o.client);
    const img = el('img', 'order-ava');
    img.src = client ? client.img : '';
    img.alt = '';
    card.appendChild(img);

    const body = el('div', 'order-body');
    body.appendChild(el('div', 'order-name', t(`client.${o.client}`)));

    const req = el('div', 'order-req');
    const parts = [];
    // Показываем только то, что реально требуется: пустая маска "????" лишь путает
    if (o.mask.some((v) => v !== null)) {
      parts.push(`${t('orders.mask')}: <b>${Orders.maskText(o)}</b>`);
    }
    if (o.district) parts.push(`${t('orders.district')}: <b>${t(P.districtKey(o.district))} (${o.district})</b>`);
    if (o.minTier) parts.push(`${t('orders.minTier')}: <b>${t(`tier.${o.minTier}`)}</b>`);
    if (o.twins) parts.push(`<b>${t('orders.twins')}</b>`);
    parts.push(`${t('orders.reward')}: <b>×${o.mult}</b>`);
    req.innerHTML = parts.join('<br>');
    body.appendChild(req);

    const foot = el('div', 'order-foot');
    foot.appendChild(el('span', 'order-timer', t('orders.spinsLeft', { n: o.spinsLeft })));
    if (match) {
      const b = el('button', 'btn btn-sm btn-deliver', t('orders.deliver'));
      b.onclick = () => openHaggle(o);
      foot.appendChild(b);
    }
    body.appendChild(foot);
    card.appendChild(body);
    list.appendChild(card);
  }
}

function renderCollection() {
  const s = State.data;
  const list = $('setList');
  list.innerHTML = '';

  for (const set of SETS) {
    const owned = s.collections[set.id] || [];
    const pr = setProgress(s, set.id);
    const claimed = s.setsClaimed.includes(set.id);
    const card = el('div', `set${pr.done ? ' done' : ''}`);

    const head = el('div', 'set-head');
    head.appendChild(el('span', 'set-name', t(`set.${set.id}`)));
    head.appendChild(el('span', 'set-prog', t('collection.progress', { have: pr.have, need: pr.need })));
    card.appendChild(head);

    const slots = el('div', 'set-slots');
    for (const slot of set.slots) {
      const on = owned.includes(slot);
      slots.appendChild(el('span', `slot${on ? ' on' : ''}`, on ? slot : '·'));
    }
    card.appendChild(slots);

    const r = set.reward;
    const rewardText = r.type === 'sell' || r.type === 'rarity'
      ? t(`collection.reward.${r.type}`, { percent: Math.round(r.value * 100) })
      : t(`collection.reward.${r.type}`, { value: r.value });
    card.appendChild(el('div', 'set-reward', rewardText));

    if (pr.done && !claimed) {
      const b = el('button', 'btn btn-sm btn-primary', t('collection.claim'));
      b.style.marginTop = '8px';
      b.onclick = () => {
        s.setsClaimed.push(set.id);
        s.sparks += 5;
        Audio.coin();
        FX.confetti(70);
        State.save();
        renderCollection();
        renderHud();
      };
      card.appendChild(b);
    } else if (claimed) {
      card.appendChild(el('div', 'muted', t('collection.claimed')));
    }

    list.appendChild(card);
  }
}

function renderWorkshop() {
  const s = State.data;
  const list = $('upList');
  list.innerHTML = '';

  for (const key of Eco.UPGRADE_KEYS) {
    const def = Eco.UPGRADES[key];
    const lvl = s.upgrades[key];
    const cost = Eco.upgradeCost(key, lvl);
    const maxed = lvl >= def.max;

    const card = el('div', 'up');
    card.appendChild(el('div', 'up-ico', def.icon));

    const body = el('div', 'up-body');
    body.appendChild(el('div', 'up-name', `${t(`up.${key}`)} · ${t('workshop.level', { n: lvl })}`));
    body.appendChild(el('div', 'up-desc', t(`up.${key}.desc`)));

    const bar = el('div', 'up-bar');
    for (let i = 0; i < def.max; i++) bar.appendChild(el('i', i < lvl ? 'on' : ''));
    body.appendChild(bar);
    card.appendChild(body);

    const btn = el('button', 'btn btn-sm');
    if (maxed) {
      btn.textContent = t('workshop.max');
      btn.disabled = true;
    } else {
      btn.textContent = `${fmt(cost)} 💳`;
      btn.disabled = s.credits < cost;
      btn.onclick = () => {
        if (s.credits < cost) return;
        s.credits -= cost;
        s.upgrades[key] += 1;
        Audio.coin();
        State.save();
        renderWorkshop();
        renderAll();
        if (key === 'machine' && Eco.autospinUnlocked(s.upgrades.machine)) renderAutospin();
      };
    }
    card.appendChild(btn);
    list.appendChild(card);
  }
}

async function renderDaily(fetchBoard = false) {
  const s = State.data;
  const total = DAILY_ATTEMPTS + (s.dailyPlate.bonus || 0);
  const left = Math.max(0, total - s.dailyPlate.attempts);

  setText('dailyAttempts', t('daily.attempts', { left, total }));
  setText('dailyBest', t('daily.best', { n: s.dailyPlate.best }));

  const spinBtn = $('btnDailySpin');
  spinBtn.textContent = left > 0 ? t('spin.button') : t('daily.noAttempts');
  spinBtn.disabled = left <= 0;
  $('btnDailyExtra').classList.toggle('hidden', left > 0 || !Platform.available);

  renderTasks();
  renderStreak();

  if (fetchBoard) renderLeaderboard();
}

async function renderLeaderboard() {
  const box = $('lbList');
  box.innerHTML = '';
  if (!Platform.available || !Storage.authorized) {
    box.appendChild(el('p', 'muted', t('daily.lbEmpty')));
    return;
  }
  const data = await Platform.getEntries(LB_NAME, 10);
  if (!data || !data.entries || !data.entries.length) {
    box.appendChild(el('p', 'muted', t('daily.lbEmpty')));
    return;
  }
  for (const entry of data.entries) {
    const row = el('div', `lb-row${entry.rank === data.userRank ? ' me' : ''}`);
    row.appendChild(el('span', 'lb-rank', `#${entry.rank}`));
    row.appendChild(el('span', 'lb-name', entry.player?.publicName || '—'));
    row.appendChild(el('span', 'lb-score', String(entry.score)));
    box.appendChild(row);
  }
}

function renderTasks() {
  const s = State.data;
  const list = $('taskList');
  list.innerHTML = '';
  for (const task of s.daily.tasks || []) {
    const done = task.progress >= task.target;
    const card = el('div', `task${done ? ' done' : ''}`);

    const top = el('div', 'task-top');
    top.appendChild(el('span', null, t(`task.${task.id}`, { target: fmt(task.target) })));

    if (done && !task.claimed) {
      const b = el('button', 'btn btn-sm btn-primary', t('daily.claim'));
      b.onclick = () => {
        task.claimed = true;
        if (task.reward.credits) s.credits += task.reward.credits;
        if (task.reward.sparks) s.sparks += task.reward.sparks;
        Audio.coin();
        toast(t('msg.taskDone'), 'good');
        State.save();
        renderTasks();
        renderHud();
      };
      top.appendChild(b);
    } else {
      const reward = task.reward.credits ? `${fmt(task.reward.credits)} 💳` : `${task.reward.sparks} ✨`;
      top.appendChild(el('span', 'muted', task.claimed ? '✓' : reward));
    }
    card.appendChild(top);

    const bar = el('div', 'task-bar');
    const fill = el('i');
    fill.style.width = `${Math.min(100, (task.progress / task.target) * 100)}%`;
    bar.appendChild(fill);
    card.appendChild(bar);
    list.appendChild(card);
  }
}

function renderStreak() {
  const s = State.data;
  const row = $('streakRow');
  row.innerHTML = '';
  for (let day = 1; day <= 7; day++) {
    const d = el('div', `streak-day${day <= s.daily.streak ? ' on' : ''}`);
    d.textContent = String(day);
    row.appendChild(d);
  }
  const oldBtn = document.getElementById('streakClaimBtn');
  if (oldBtn) oldBtn.remove();

  if (!s.daily.streakClaimed && s.daily.streak > 0) {
    const reward = streakReward(s.daily.streak);
    const b = el('button', 'btn btn-sm btn-primary', t('daily.streakClaim', { n: s.daily.streak }));
    b.id = 'streakClaimBtn';
    b.style.marginTop = '8px';
    b.onclick = () => {
      s.daily.streakClaimed = true;
      if (reward.credits) s.credits += reward.credits;
      if (reward.sparks) s.sparks += reward.sparks;
      if (reward.epic) grantEpicPlate();
      Audio.coin();
      FX.confetti(70);
      State.save();
      renderStreak();
      renderHud();
      maybeInterstitial();
    };
    row.parentElement.appendChild(b);
  }
}

/** Гарантированный эпический знак за 7-й день серии. */
function grantEpicPlate() {
  const s = State.data;
  const d = derived(s);
  let plate;
  let scored;
  let guard = 0;
  do {
    plate = P.generatePlate(Math.random, { alloy: 7, home: s.home });
    scored = P.scorePlate(plate, { home: s.home });
    guard++;
  } while (scored.index < 45 && guard < 400);

  if (s.storage.length < d.storageCap) {
    s.storage.push({ plate, index: scored.index, at: Date.now() });
    registerPlate(s, plate, scored);
  } else {
    s.credits += P.priceOf(scored.index, d.market);
  }
}

boot();
