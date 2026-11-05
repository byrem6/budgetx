/* =========================================================================
   keypad.js — mobil için özel rakam tuş takımı
   Sistem klavyesini açmadan büyük tuşlarla sayısal giriş yapar.
   ========================================================================= */

import { h } from './util.js';

const STORE_KEY = 'portfoy.keypad';
let panel = null;
let current = null;   // { input, label, decimals }

export const keypadEnabled = () => {
  try { return localStorage.getItem(STORE_KEY) !== 'off'; } catch { return true; }
};
export const setKeypadEnabled = (on) => {
  try { localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch { /* yoksay */ }
};

/* ------------------------------ Tuş takımı -------------------------------- */
const KEY_ROWS = [
  ['1', '2', '3', '⌫'],
  ['4', '5', '6', 'C'],
  ['7', '8', '9', ','],
  ['0', '00', '✓'],
];
const SPAN = { '0': 2 };

function ensurePanel() {
  if (panel) return panel;
  panel = h('div', { class: 'keypad', id: 'keypad', hidden: true });
  panel.append(
    h('div', { class: 'keypad-head' },
      h('span', { class: 'keypad-label' }, 'Değer'),
      h('span', { class: 'keypad-value', id: 'keypadValue' }, '0'),
      h('button', { class: 'btn sm', onclick: () => closeKeypad() }, 'Bitti')),
    h('div', { class: 'keypad-grid' },
      ...KEY_ROWS.flat().map((k) => h('button', {
        type: 'button',
        dataset: { k },
        class: [k === '⌫' || k === 'C' ? 'fn' : '', k === '✓' ? 'fn ok' : '', SPAN[k] ? 'wide' : ''].filter(Boolean).join(' '),
        style: SPAN[k] ? { gridColumn: `span ${SPAN[k]}` } : null,
        onclick: () => press(k),
      }, k))),
  );
  document.body.appendChild(panel);
  return panel;
}

/** Tuş takımı aç/kapat */
export function openKeypad(input, label = 'Değer', decimals = 4) {
  if (!keypadEnabled()) return;
  ensurePanel();
  current = { input, label, decimals };
  const p = ensurePanel();
  p.hidden = false;
  document.body.classList.add('keypad-open');
  p.querySelector('.keypad-label').textContent = label;
  p.querySelector('#keypadValue').textContent = input.value || '0';
  input.focus({ preventScroll: true });
}

export function closeKeypad() {
  if (!panel) return;
  panel.hidden = true;
  document.body.classList.remove('keypad-open');
  const inp = current?.input;
  current = null;
  inp?.blur();
}

/**
 * Sayısal alana tuş takımı bağlar.
 * @param {HTMLInputElement} input
 */
export function attachKeypad(input, { label = 'Değer', decimals = 4 } = {}) {
  if (!keypadEnabled()) {
    input.setAttribute('inputmode', 'decimal');
    input.setAttribute('enterkeyhint', 'done');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    return;
  }
  input.readOnly = true;
  input.setAttribute('inputmode', 'none');
  input.setAttribute('enterkeyhint', 'done');
  input.dataset.keypadLabel = label;
  input.dataset.keypadDecimals = String(decimals);

  const open = () => openKeypad(input, label, decimals);
  input.addEventListener('focus', open);
  input.addEventListener('click', open);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { closeKeypad(); input.blur(); }
  });
}

/** Tuş takımı kapalıyken alan normal davranır */
export function detachKeypad(input) {
  input.readOnly = false;
  input.removeAttribute('inputmode');
}

/* ------------------------------ Tuş işleme ------------------------------- */
function press(key) {
  if (!current) return;
  const { input, decimals } = current;

  if (key === '✓') { closeKeypad(); return; }

  let v = String(input.value ?? '');

  if (key === 'C') v = '';
  else if (key === '⌫') v = v.slice(0, -1);
  else if (key === ',') {
    if (!decimals) return;
    if (!v.includes(',')) v = (v || '0') + ',';
  } else if (/^\d+$/.test(key)) {
    // tek ondalık basamağı sınırla
    const [int, dec] = v.split(',');
    if (dec !== undefined && dec.length >= decimals) return;
    if (int === '0' && v !== '0' && key !== '0') v = key;
    else v += key;
  }

  input.value = v;
  const disp = panel.querySelector('#keypadValue');
  if (disp) disp.textContent = v === '' ? '0' : v;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
