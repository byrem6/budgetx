/* =========================================================================
   util.js — biçimlendirme, DOM ve genel yardımcılar
   ========================================================================= */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Kısa ve okunabilir DOM üreticisi: h('div', {class:'x'}, 'metin', child) */
export function h(tag, attrs = null, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  appendAll(node, children);
  return node;
}
function appendAll(node, children) {
  for (const c of children.flat(6)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}
export const frag = (...children) => { const f = document.createDocumentFragment(); appendAll(f, children); return f; };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* --------------------------- Sayı biçimlendirme --------------------------- */
const cache = new Map();
function nf(min, max, currency) {
  const key = `${min}|${max}|${currency || ''}`;
  if (!cache.has(key)) {
    cache.set(key, new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: min, maximumFractionDigits: max,
      ...(currency ? { style: 'currency', currency } : {})
    }));
  }
  return cache.get(key);
}
export const num = (n, d = 2) => (Number.isFinite(n) ? nf(d, d).format(n) : '–');
/** Varlık miktarı: sondaki sıfırlar atılır (1,2 ETH / 0,05 BTC / 35 gr) */
export const qty = (n, d = 3) => (Number.isFinite(n)
  ? new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d }).format(n)
  : '–');
export const money = (n, cur = 'TRY', d = 2) =>
  (Number.isFinite(n) ? nf(d, d, cur).format(n) : '–');
export const moneyCompact = (n, cur = 'TRY') => {
  if (!Number.isFinite(n)) return '–';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${num(abs / 1e9, 2)} Mr ₺`;
  if (abs >= 1e6) return `${sign}${num(abs / 1e6, 2)} Mn ₺`;
  if (abs >= 1e4) return `${sign}${num(abs / 1e3, 1)} B ₺`;
  return money(n, cur);
};
export const pct = (n, d = 2) => (Number.isFinite(n) ? `%${num(Math.abs(n), d)}` : '–');
export const signedPct = (n, d = 2) => (Number.isFinite(n) ? `${n >= 0 ? '+' : '-'}${num(Math.abs(n), d)}%` : '–');
export const signedMoney = (n, cur = 'TRY') => (Number.isFinite(n) ? `${n >= 0 ? '+' : '-'}${money(Math.abs(n), cur)}` : '–');

/* ------------------------------ Tarihler --------------------------------- */
export function parseDate(iso) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
export const todayISO = () => toISO(new Date());
export function toISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function fmtDate(iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString('tr-TR', opts) : '–';
}
export const fmtDateShort = (iso) => fmtDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' });
};
export const monthKey = (iso) => (iso || '').slice(0, 7);
export function daysBetween(a, b) {
  const d1 = parseDate(a), d2 = parseDate(b);
  if (!d1 || !d2) return 0;
  return Math.round((d2 - d1) / 86400000);
}

/* -------------------------------- Yardımcı -------------------------------- */
export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);

export function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** "₺1.234,56" -> 1234.56 (yerel ayrıştırma) */
export function parseNum(v) {
  if (typeof v === 'number') return v;
  if (!v) return NaN;
  const s = String(v).replace(/\s|₺|\$|€|gbp|try|usd|eur/gi, '')
    .replace(/[^0-9,.\-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  return parseFloat(s);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
