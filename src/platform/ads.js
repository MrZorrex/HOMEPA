/**
 * Реклама: интерстишлы и rewarded-видео.
 * Требования: п.1.12 (монетизация подключена), п.1.16 (никаких модификаций
 * и имитаций рекламных блоков), п.1.3 (звук глушится при потере фокуса),
 * раздел 4 (интерстишл не чаще чем раз в 60 секунд, не на старте игры).
 */

import { Platform } from './ysdk.js';

const MIN_INTERSTITIAL_GAP_MS = 60 * 1000;

export const Ads = {
  _lastInterstitial: 0,
  _busy: false,
  /** Коллбэки: игра должна сама глушить звук и ставить паузу. */
  onAdStart: () => {},
  onAdEnd: () => {},

  get busy() { return this._busy; },

  /** Прошло ли достаточно времени с прошлого интерстишла. */
  canShowInterstitial() {
    if (this._busy) return false;
    return Date.now() - this._lastInterstitial >= MIN_INTERSTITIAL_GAP_MS;
  },

  /**
   * Полноэкранная реклама между игровыми сессиями.
   * Возвращает true, если реклама была показана.
   */
  async showInterstitial() {
    if (!Platform.available || !this.canShowInterstitial()) return false;
    this._busy = true;
    this.onAdStart();
    Platform.gameplayStop();

    const shown = await new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      try {
        Platform.sdk.adv.showFullscreenAdv({
          callbacks: {
            onClose: (wasShown) => done(Boolean(wasShown)),
            onError: () => done(false),
          },
        });
      } catch (e) {
        done(false);
      }
      // Страховка от «залипания» колбэка (п.1.14 — без зависаний).
      setTimeout(() => done(false), 20000);
    });

    if (shown) this._lastInterstitial = Date.now();
    this._busy = false;
    this.onAdEnd();
    return shown;
  },

  /**
   * Rewarded-видео. Награда выдаётся только в onRewarded.
   * @param {() => void} onReward
   */
  async showRewarded(onReward) {
    if (!Platform.available || this._busy) return false;
    this._busy = true;
    this.onAdStart();
    Platform.gameplayStop();

    const rewarded = await new Promise((resolve) => {
      let got = false;
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      try {
        Platform.sdk.adv.showRewardedVideo({
          callbacks: {
            onRewarded: () => { got = true; },
            onClose: () => done(got),
            onError: () => done(false),
          },
        });
      } catch (e) {
        done(false);
      }
      setTimeout(() => done(got), 60000);
    });

    this._busy = false;
    this.onAdEnd();
    if (rewarded) onReward?.();
    return rewarded;
  },
};
