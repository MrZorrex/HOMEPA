/** Частицы и вспышки поверх интерфейса. Canvas на весь экран, pointer-events: none. */

export const FX = {
  canvas: null,
  ctx: null,
  parts: [],
  running: false,
  dpr: 1,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    if (!this.canvas) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
  },

  burst(x, y, color, count = 30, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 6) * power;
      this.parts.push({
        x: x * this.dpr,
        y: y * this.dpr,
        vx: Math.cos(a) * sp * this.dpr,
        vy: Math.sin(a) * sp * this.dpr - 2 * this.dpr,
        life: 1,
        decay: 0.012 + Math.random() * 0.02,
        size: (2 + Math.random() * 4) * this.dpr,
        color,
      });
    }
    this._start();
  },

  confetti(count = 70) {
    const colors = ['#ff3d9a', '#ffb020', '#39a0ff', '#3ddc84', '#a855f7'];
    for (let i = 0; i < count; i++) {
      this.parts.push({
        x: Math.random() * this.canvas.width,
        y: -20 * this.dpr,
        vx: (Math.random() - 0.5) * 3 * this.dpr,
        vy: (2 + Math.random() * 4) * this.dpr,
        life: 1,
        decay: 0.005 + Math.random() * 0.005,
        size: (3 + Math.random() * 5) * this.dpr,
        color: colors[Math.floor(Math.random() * colors.length)],
        spin: true,
      });
    }
    this._start();
  },

  _start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(() => this._frame());
  },

  _frame() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const g = 0.18 * this.dpr;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += g;
      p.vx *= 0.99;
      p.life -= p.decay;
      if (p.life <= 0 || p.y > canvas.height + 40) {
        this.parts.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (p.spin) {
        ctx.fillRect(p.x, p.y, p.size, p.size * 1.8);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (this.parts.length) {
      requestAnimationFrame(() => this._frame());
    } else {
      this.running = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  },

  shake(el, strength = 1) {
    if (!el) return;
    el.style.setProperty('--shake', `${strength}`);
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  },
};
