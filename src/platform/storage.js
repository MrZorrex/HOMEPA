/**
 * Сохранения: облако (player.setData/getData) + локальный фоллбэк.
 * Требования: п.1.2.2 (гостевой вход, прогресс сохраняется),
 * п.1.9 (сохранение сразу после действия, не теряется при F5 и повороте экрана),
 * п.1.11 (облачные сохранения), п.1.13.3 (прогресс доступен с разных устройств).
 */

import { Platform } from './ysdk.js';

const LOCAL_KEY = 'homepa_save_v1';
const FLUSH_DELAY = 1200; // дебаунс записи в облако, чтобы не долбить API

export const Storage = {
  _player: null,
  _authorized: false,
  _data: null,
  _timer: null,
  _pendingCloud: false,

  get authorized() { return this._authorized; },

  /** Инициализация игрока. Гость тоже получает player-объект (scopes:false). */
  async init() {
    if (Platform.available) {
      try {
        // scopes: false — не запрашиваем доступ к личным данным без действия игрока (п.1.2.1)
        this._player = await Platform.sdk.getPlayer({ scopes: false });
        this._authorized = this._player.getMode() !== 'lite';
      } catch (e) {
        this._player = null;
        this._authorized = false;
      }
    }
    this._data = await this._load();
    return this._data;
  },

  /**
   * п.1.2.1 — авторизация только по осознанному нажатию кнопки.
   * Возвращает true, если игрок авторизовался.
   */
  async requestAuth() {
    if (!Platform.available) return false;
    try {
      await Platform.sdk.auth.openAuthDialog();
      this._player = await Platform.sdk.getPlayer({ scopes: false });
      this._authorized = this._player.getMode() !== 'lite';
      if (this._authorized) {
        // Сливаем локальный прогресс в облако, чтобы гость ничего не потерял.
        const cloud = await this._readCloud();
        this._data = mergeSaves(cloud, this._data);
        await this._writeCloud(this._data);
      }
      return this._authorized;
    } catch (e) {
      return false;
    }
  },

  getPlayerName() {
    try { return this._player?.getName?.() || ''; } catch (e) { return ''; }
  },

  getPlayerAvatar(size = 'small') {
    try { return this._player?.getPhoto?.(size) || ''; } catch (e) { return ''; }
  },

  get data() { return this._data; },

  /** Немедленная запись локально + отложенная в облако. */
  set(patch) {
    this._data = { ...this._data, ...patch };
    this._writeLocal(this._data);
    this._scheduleCloud();
  },

  /** Принудительный сброс в облако (например, перед показом рекламы). */
  async flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (!this._pendingCloud) return;
    this._pendingCloud = false;
    await this._writeCloud(this._data);
  },

  _scheduleCloud() {
    this._pendingCloud = true;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._timer = null;
      this._pendingCloud = false;
      this._writeCloud(this._data);
    }, FLUSH_DELAY);
  },

  async _load() {
    const local = this._readLocal();
    const cloud = await this._readCloud();
    const merged = mergeSaves(cloud, local);
    this._writeLocal(merged);
    return merged;
  },

  async _readCloud() {
    if (!this._player) return null;
    try {
      const raw = await this._player.getData([LOCAL_KEY]);
      return raw && raw[LOCAL_KEY] ? raw[LOCAL_KEY] : null;
    } catch (e) {
      return null;
    }
  },

  async _writeCloud(data) {
    if (!this._player) return;
    try {
      await this._player.setData({ [LOCAL_KEY]: data }, true);
    } catch (e) {
      // Не падаем: локальная копия уже сохранена.
    }
  },

  _readLocal() {
    try {
      const raw = window.localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  _writeLocal(data) {
    try {
      window.localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    } catch (e) {
      // приватный режим браузера — молча игнорируем
    }
  },
};

/** Склейка сохранений: побеждает более «продвинутое» по времени и прогрессу. */
export function mergeSaves(a, b) {
  if (!a) return b || {};
  if (!b) return a || {};
  return (b.updatedAt || 0) >= (a.updatedAt || 0) ? { ...a, ...b } : { ...b, ...a };
}
