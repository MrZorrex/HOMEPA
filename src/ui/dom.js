/** Мелкие помощники для DOM, тостов и модальных окон. */

export const $ = (id) => document.getElementById(id);
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

export function setText(id, text) {
  const node = $(id);
  if (node) node.textContent = text;
}

export function toast(text, kind = '') {
  const box = $('toasts');
  if (!box) return;
  const t = el('div', `toast ${kind}`.trim(), '');
  t.textContent = text;
  box.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s, transform .3s';
    t.style.opacity = '0';
    t.style.transform = 'translateY(-8px)';
    setTimeout(() => t.remove(), 320);
  }, 1900);
}

let modalOpen = false;

/**
 * Показать модалку. content — DOM-узел или HTML-строка.
 * Возвращает функцию закрытия.
 */
export function showModal(content, { closable = true } = {}) {
  const root = $('modalRoot');
  const box = $('modal');
  box.innerHTML = '';
  if (typeof content === 'string') box.innerHTML = content;
  else box.appendChild(content);
  root.classList.remove('hidden');
  modalOpen = true;

  const close = () => {
    root.classList.add('hidden');
    box.innerHTML = '';
    modalOpen = false;
  };

  $('modalBackdrop').onclick = closable ? close : null;
  return close;
}

export function isModalOpen() {
  return modalOpen;
}

export function closeModal() {
  $('modalRoot').classList.add('hidden');
  $('modal').innerHTML = '';
  modalOpen = false;
}

/** Компактная карточка знака для модалок и списков. */
export function plateCard(plate, tierColor) {
  const node = el('div', 'plate modal-plate');
  node.innerHTML = `
    <div class="plate-main">
      <span class="sym">${plate.letters[0]}</span>
      <span class="sym">${plate.letters[1]}</span>
      <span class="gap"></span>
      ${plate.digits.map((d) => `<span class="sym">${d}</span>`).join('')}
    </div>
    <div class="plate-side">
      <span class="plate-code">${plate.district}</span>
      <span class="plate-region">VCT</span>
    </div>`;
  if (tierColor) node.style.boxShadow = `0 0 30px ${tierColor}55, 0 10px 30px rgba(0,0,0,.5)`;
  return node;
}

export function fmt(n) {
  return Math.round(n).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
}
