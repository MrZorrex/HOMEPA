/**
 * Процедурный звук на WebAudio — никаких аудиофайлов: сборка остаётся
 * крошечной, а вопрос авторских прав (п.3.5) снимается полностью.
 *
 * Звук обязан замолкать при потере фокуса (п.1.3) и во время рекламы (п.4.7).
 */

export const Audio = {
  ctx: null,
  master: null,
  muted: false,
  _suspended: false,

  init(muted = false) {
    this.muted = muted;
    // Контекст создаётся лениво — браузеры требуют пользовательский жест.
  },

  _ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch (e) {
      return false;
    }
  },

  resume() {
    this._suspended = false;
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },

  /** Полная остановка: потеря фокуса, пауза SDK, показ рекламы. */
  suspend() {
    this._suspended = true;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  },

  _tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.25, slide = 0, delay = 0 }) {
    if (this.muted || this._suspended || !this._ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  },

  _noise({ dur = 0.2, gain = 0.2, delay = 0, bandpass = 1200 }) {
    if (this.muted || this._suspended || !this._ensure()) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const chan = buf.getChannelData(0);
    for (let i = 0; i < len; i++) chan[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = bandpass;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  },

  click() {
    this._tone({ freq: 620, dur: 0.05, type: 'square', gain: 0.1 });
  },

  tick() {
    this._tone({ freq: 880, dur: 0.035, type: 'triangle', gain: 0.07 });
  },

  lock() {
    this._tone({ freq: 440, dur: 0.07, type: 'square', gain: 0.14, slide: 260 });
  },

  unlock() {
    this._tone({ freq: 500, dur: 0.07, type: 'square', gain: 0.1, slide: -200 });
  },

  press() {
    this._noise({ dur: 0.18, gain: 0.25, bandpass: 400 });
    this._tone({ freq: 140, dur: 0.16, type: 'sawtooth', gain: 0.18, slide: -60 });
  },

  coin() {
    this._tone({ freq: 1180, dur: 0.07, type: 'triangle', gain: 0.16 });
    this._tone({ freq: 1560, dur: 0.1, type: 'triangle', gain: 0.14, delay: 0.06 });
  },

  error() {
    this._tone({ freq: 200, dur: 0.16, type: 'sawtooth', gain: 0.14, slide: -60 });
  },

  /** Фанфары по тиру: чем выше редкость, тем длиннее и ярче аккорд. */
  reveal(tierId) {
    const scales = {
      common: [440],
      good: [523, 659],
      rare: [523, 659, 784],
      epic: [523, 659, 784, 1046],
      legend: [587, 740, 880, 1175, 1480],
      mythic: [587, 740, 880, 1175, 1480, 1760],
    };
    const notes = scales[tierId] || scales.common;
    notes.forEach((f, i) => {
      this._tone({ freq: f, dur: 0.32, type: 'triangle', gain: 0.16, delay: i * 0.07 });
    });
    if (tierId === 'legend' || tierId === 'mythic') {
      this._noise({ dur: 0.5, gain: 0.12, bandpass: 3000, delay: 0.1 });
    }
  },
};
