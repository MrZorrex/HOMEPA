/**
 * Локализация с автоопределением языка (п.2.14).
 * Язык берётся из ysdk.environment.i18n.lang, фоллбэк — navigator.language, затем 'en'.
 * Строки игры будут добавлены после финализации дизайна геймплея.
 */

import { Platform } from './ysdk.js';

const SUPPORTED = ['ru', 'en', 'tr'];
const FALLBACK = 'en';

export const I18n = {
  lang: FALLBACK,
  dict: {},

  init(dictionaries) {
    this.dict = dictionaries;
    const fromSdk = Platform.getLang();
    const fromBrowser = (navigator.language || '').slice(0, 2).toLowerCase();
    const candidate = (fromSdk || fromBrowser || FALLBACK).slice(0, 2).toLowerCase();
    this.lang = SUPPORTED.includes(candidate) ? candidate : FALLBACK;
    try { document.documentElement.setAttribute('lang', this.lang); } catch (e) { /* no-op */ }
    return this.lang;
  },

  /** t('menu.play', { score: 10 }) */
  t(key, params) {
    const table = this.dict[this.lang] || this.dict[FALLBACK] || {};
    const fallbackTable = this.dict[FALLBACK] || {};
    let str = table[key] ?? fallbackTable[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return str;
  },
};

export const SUPPORTED_LANGS = SUPPORTED;
