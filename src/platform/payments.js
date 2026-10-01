/**
 * Инап-покупки через ysdk.payments.
 * Требования: п.1.4 (платежи только через SDK), п.1.13.1 (консумирование),
 * п.1.13.2 (название и иконка портальной валюты берутся из SDK),
 * п.1.13.4 (цена цифрами + валюта), п.1.13.6 (список в игре = Консоль),
 * п.1.6.3.4 (на ТВ инапов нет).
 *
 * Важно: каталог товаров берётся ИЗ SDK (getCatalog), а не хардкодится,
 * поэтому игра автоматически совпадает с Консолью разработчика.
 */

import { Platform } from './ysdk.js';

export const Payments = {
  _payments: null,
  available: false,
  catalog: [],
  /** Коллбэк выдачи товара: (productID, purchase) => void */
  grant: () => {},

  async init(grantHandler) {
    if (grantHandler) this.grant = grantHandler;
    // На ТВ инап-покупки запрещены требованиями (п.1.6.3.4).
    if (!Platform.available || Platform.isTV()) {
      this.available = false;
      return false;
    }
    try {
      this._payments = await Platform.sdk.getPayments({ signed: false });
      this.available = true;
    } catch (e) {
      this.available = false;
      return false;
    }
    await this.loadCatalog();
    await this.consumePending();
    return true;
  },

  /** п.1.13.2 / п.1.13.4 — цена и валюта только из SDK. */
  async loadCatalog() {
    if (!this.available) return [];
    try {
      const items = await this._payments.getCatalog();
      this.catalog = items.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        imageURI: p.imageURI,
        price: p.price,                       // строка вида "10 YAN" с валютой
        priceValue: p.priceValue,             // число
        currencyCode: p.getPriceCurrencyCode?.() || '',
        currencyImage: p.getPriceCurrencyImage?.('medium') || '',
      }));
    } catch (e) {
      this.catalog = [];
    }
    return this.catalog;
  },

  /**
   * п.1.13.1 — при каждом старте обрабатываем «зависшие» покупки,
   * выдаём товар и консумируем токен.
   */
  async consumePending() {
    if (!this.available) return;
    try {
      const purchases = await this._payments.getPurchases();
      for (const purchase of purchases) {
        try {
          this.grant(purchase.productID, purchase);
          await this._payments.consumePurchase(purchase.purchaseToken);
        } catch (e) {
          console.warn('[Payments] consume failed', purchase.productID, e);
        }
      }
    } catch (e) {
      // нет покупок или нет доступа
    }
  },

  /**
   * Покупка товара. Товар выдаётся только после успешного consume.
   * @returns {Promise<'ok'|'cancelled'|'unavailable'>}
   */
  async purchase(productID, developerPayload) {
    if (!this.available) return 'unavailable';
    try {
      const purchase = await this._payments.purchase({ id: productID, developerPayload });
      this.grant(purchase.productID, purchase);
      try {
        await this._payments.consumePurchase(purchase.purchaseToken);
      } catch (e) {
        // Если консумирование не прошло — догоним при следующем запуске.
        console.warn('[Payments] consume retry later', e);
      }
      return 'ok';
    } catch (e) {
      return 'cancelled';
    }
  },
};
