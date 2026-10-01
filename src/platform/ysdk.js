/**
 * Платформенный слой Яндекс Игр.
 * Требования: п.1.1, п.1.19 (инициализация строго по документации),
 * п.1.19.2 (LoadingAPI.ready), п.1.19.3 (GameplayAPI), п.1.19.4 (pause/resume),
 * п.1.7 (никаких абсолютных URL на S3), п.1.18 (работа с любого URL).
 *
 * Весь модуль устойчив к отсутствию SDK (локальная разработка):
 * игра обязана запускаться и работать, даже если YaGames не загрузился.
 */

export const Platform = {
  sdk: null,
  player: null,
  payments: null,
  available: false,
  _ready: false,
  _gameplayActive: false,
  _pauseHandlers: new Set(),
  _resumeHandlers: new Set(),

  /** Инициализация SDK. Вызывается один раз при старте. */
  async init() {
    try {
      if (typeof window.YaGames === 'undefined') {
        throw new Error('YaGames is not available');
      }
      // п.1.19.1 — инициализация строго как в документации.
      this.sdk = await window.YaGames.init();
      this.available = true;
      this._bindLifecycle();
    } catch (e) {
      this.available = false;
      console.warn('[Platform] SDK недоступен, работаем в офлайн-режиме:', e && e.message);
    }
    return this.available;
  },

  /** п.1.19.4 — обработка game_api_pause / game_api_resume. */
  _bindLifecycle() {
    if (!this.sdk || typeof this.sdk.on !== 'function') return;
    this.sdk.on('game_api_pause', () => this._pauseHandlers.forEach((h) => h()));
    this.sdk.on('game_api_resume', () => this._resumeHandlers.forEach((h) => h()));
  },

  onPause(handler) { this._pauseHandlers.add(handler); },
  onResume(handler) { this._resumeHandlers.add(handler); },

  /** п.1.19.2 — вызывается в момент, когда игрок может приступить к игре. */
  ready() {
    if (this._ready) return;
    this._ready = true;
    try {
      this.sdk?.features?.LoadingAPI?.ready();
    } catch (e) {
      console.warn('[Platform] LoadingAPI.ready failed', e);
    }
  },

  /** п.1.19.3 — разметка геймплея. */
  gameplayStart() {
    if (this._gameplayActive) return;
    this._gameplayActive = true;
    try { this.sdk?.features?.GameplayAPI?.start(); } catch (e) { /* no-op */ }
  },

  gameplayStop() {
    if (!this._gameplayActive) return;
    this._gameplayActive = false;
    try { this.sdk?.features?.GameplayAPI?.stop(); } catch (e) { /* no-op */ }
  },

  /** п.2.14 — автоопределение языка. */
  getLang() {
    try {
      return this.sdk?.environment?.i18n?.lang || null;
    } catch (e) {
      return null;
    }
  },

  /** Лидерборды: инициализируются лениво при первом обращении. */
  async getLeaderboards() {
    if (!this.available) return null;
    if (this._lb !== undefined) return this._lb;
    try {
      this._lb = await this.sdk.getLeaderboards();
    } catch (e) {
      this._lb = null;
    }
    return this._lb;
  },

  /** Отправить результат. Работает только для авторизованного игрока. */
  async setScore(name, score) {
    const lb = await this.getLeaderboards();
    if (!lb) return false;
    try {
      await lb.setLeaderboardScore(name, score);
      return true;
    } catch (e) {
      return false;
    }
  },

  /** Получить верхушку таблицы вместе с позицией игрока. */
  async getEntries(name, quantityTop = 10) {
    const lb = await this.getLeaderboards();
    if (!lb) return null;
    try {
      return await lb.getLeaderboardEntries(name, {
        quantityTop,
        includeUser: true,
        quantityAround: 3,
      });
    } catch (e) {
      return null;
    }
  },

  /** Тип устройства: desktop | mobile | tablet | tv */
  getDeviceType() {
    try {
      return this.sdk?.deviceInfo?.type || 'desktop';
    } catch (e) {
      return 'desktop';
    }
  },

  isMobileLike() {
    const t = this.getDeviceType();
    return t === 'mobile' || t === 'tablet';
  },

  isTV() {
    return this.getDeviceType() === 'tv';
  },
};
