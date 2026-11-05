/* =========================================================================
   ui.js — ortak arayüz bileşenleri (ikon, toast, modal, onay)
   ========================================================================= */

import { h, frag, $ } from './util.js';

/* --------------------------------- İkonlar -------------------------------- */
const PATHS = {
  dashboard: '<rect x="3" y="3" width="7.5" height="9" rx="1"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="1"/><rect x="13.5" y="12" width="7.5" height="9" rx="1"/><rect x="3" y="15.5" width="7.5" height="5.5" rx="1"/>',
  entry: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5V9h4.5"/><path d="M12 7.5V12l3 2"/>',
  analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7h.09A1.7 1.7 0 0 0 10.09 3.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v.09a1.7 1.7 0 0 0 1.56 1.06H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.05Z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5"/>',
  trash: '<path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M14.5 6.5l3 3"/>',
  download: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16"/>',
  upload: '<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4 20h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5 10 17.5 19 7"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3M3 7.5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2.5"/><path d="M21 9.5h-4a2 2 0 0 0 0 4h4V9.5Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.4"/>',
  warning: '<path d="M12 4.5 21 19.5H3L12 4.5Z"/><path d="M12 10v4M12 16.6v.4"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  filter: '<path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8L4 5Z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  lock: '<rect x="4.5" y="10" width="15" height="10" rx="2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
};

export function icon(name, size = 20, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  svg.innerHTML = PATHS[name] || '';
  return svg;
}

/* --------------------------------- Toast ---------------------------------- */
let toastHost = null;
export function toast(message, { type = '', duration = 3200, action = null } = {}) {
  toastHost = toastHost || document.getElementById('toastHost');
  if (!toastHost) return;
  const el = h('div', { class: `toast ${type}` }, message);
  if (action) {
    el.append(h('button', {
      onclick: () => { action.onClick?.(); el.remove(); },
    }, action.label));
  }
  toastHost.append(el);
  const t = setTimeout(() => {
    el.style.transition = 'opacity .2s, transform .2s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 220);
  }, duration);
  el.addEventListener('pointerdown', () => clearTimeout(t));
  return el;
}

/* --------------------------------- Modal ---------------------------------- */
let modalHost = null;
function ensureModalHost() {
  modalHost = modalHost || document.getElementById('modalHost');
  return modalHost;
}

/**
 * Modal açar. body: Node | string. actions: [{label, variant, value, autofocus}]
 * Kapatma sonucu Promise ile döner (değer = action.value).
 */
export function openModal({ title, body, actions = [], dismissible = true, width = 520 }) {
  const host = ensureModalHost();
  return new Promise((resolve) => {
    host.hidden = false;
    host.innerHTML = '';
    const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', style: { width: `min(${width}px, 100%)` } });
    modal.append(h('div', { class: 'modal-handle' }));

    const close = (value) => {
      host.hidden = true;
      host.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) close(null);
    };
    document.addEventListener('keydown', onKey);

    modal.append(h('div', { class: 'modal-head' }, h('h3', null, title)));
    const bodyEl = h('div', { class: 'modal-body' });
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body) bodyEl.append(body);
    modal.append(bodyEl);

    if (actions.length) {
      const foot = h('div', { class: 'modal-foot' });
      for (const a of actions) {
        const btn = h('button', {
          class: `btn ${a.variant || 'subtle'}`,
          onclick: () => { const v = a.value !== undefined ? a.value : a.label; if (a.onClick) { const r = a.onClick(); if (r === false) return; } close(v); },
        }, a.label);
        if (a.autofocus) setTimeout(() => btn.focus(), 40);
        foot.append(btn);
      }
      modal.append(foot);
    }
    host.append(modal);
    host.onclick = (e) => { if (e.target === host && dismissible) close(null); };
    if (!actions.some((a) => a.autofocus)) setTimeout(() => modal.querySelector('input,select,textarea,button')?.focus(), 60);
  });
}

/** Açık modalı kapatır (arka plana tıklama davranışı) */
export function closeModal() {
  const host = document.getElementById('modalHost');
  if (host && !host.hidden) host.click();
}

export function confirmDialog({ title = 'Emin misiniz?', message = '', okText = 'Evet', cancelText = 'Vazgeç', danger = false }) {
  return openModal({
    title,
    body: h('p', { style: { margin: '0' } }, message),
    actions: [
      { label: cancelText, value: false, variant: 'subtle' },
      { label: okText, value: true, variant: danger ? 'danger' : 'primary', autofocus: true },
    ],
  }).then((v) => v === true);
}

/* ------------------------------ Küçük parçalar ---------------------------- */
export const assetDot = (asset, size = 36) => h('div', {
  class: 'dot',
  style: { background: asset?.color || 'var(--text-3)', width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.36)}px` },
}, asset?.short || '?');

export function emptyState({ title, message, actionLabel, onAction, iconName = 'wallet' }) {
  const box = h('div', { class: 'empty-state' });
  box.append(icon(iconName, 46));
  box.append(h('h4', null, title));
  if (message) box.append(h('p', null, message));
  if (actionLabel) box.append(h('button', { class: 'btn subtle', onclick: onAction }, actionLabel));
  return box;
}

export function messageBar(kind, text, iconName) {
  const names = { info: 'info', warn: 'warning', error: 'warning', success: 'check' };
  return h('div', { class: `msgbar ${kind}` }, icon(iconName || names[kind] || 'info', 18), h('div', null, text));
}

export function segmented(name, options, value, onChange) {
  const wrap = h('div', { class: `seg ${name === 'buy-sell' ? 'buy-sell' : ''}`, role: 'tablist' });
  for (const opt of options) {
    const b = h('button', {
      class: opt.value === value ? 'on' : '',
      dataset: { val: opt.value },
      type: 'button',
      onclick: () => {
        wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        onChange(opt.value);
      },
    }, opt.label);
    wrap.append(b);
  }
  return wrap;
}

export function field(label, control, hint) {
  return h('div', { class: 'field' }, h('label', null, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
}

export function switchBox(label, checked, onChange) {
  const input = h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) });
  return h('label', { class: 'row' },
    h('span', { class: 'switch' }, input, h('span', { class: 'track' })),
    h('span', null, label));
}

export function selectEl(options, value, onChange, { placeholder } = {}) {
  const sel = h('select', { class: 'select', onchange: (e) => onChange(e.target.value) });
  if (placeholder) sel.append(h('option', { value: '' }, placeholder));
  for (const o of options) {
    const opt = typeof o === 'string' ? { value: o, label: o } : o;
    sel.append(h('option', { value: opt.value, selected: String(opt.value) === String(value) }, opt.label));
  }
  sel.value = value ?? '';
  return sel;
}
