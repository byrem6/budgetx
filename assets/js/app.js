/* =========================================================================
   app.js — uygulama kabuğu, yönlendirme, durum yönetimi
   ========================================================================= */

import { store } from './store.js';
import { buildCatalog } from './catalog.js';
import { rates } from './rates.js';
import { computePortfolio } from './calc.js';
import { h, num, money as fmtMoney, $, downloadFile, todayISO } from './util.js';
import { toast, icon, confirmDialog, openModal, closeModal } from './ui.js';

import * as dashboard from './views/dashboard.js';
import * as entry from './views/entry.js';
import * as history from './views/history.js';
import * as analytics from './views/analytics.js';
import * as settings from './views/settings.js';
import { sha256 } from './views/settings.js';

/* ------------------------------ Uygulama sabitleri ------------------------ */
const VIEWS = { dashboard, entry, history, analytics, settings };
const NAV = [
  { id: 'dashboard', label: 'Genel Bakış', short: 'Genel Bakış', icon: 'dashboard' },
  { id: 'entry', label: 'Veri Girişi', short: 'Giriş', icon: 'entry' },
  { id: 'history', label: 'Geçmiş', short: 'Geçmiş', icon: 'history' },
  { id: 'analytics', label: 'Analiz', short: 'Analiz', icon: 'analytics' },
  { id: 'settings', label: 'Ayarlar', short: 'Ayarlar', icon: 'settings' },
];
const TITLES = {
  dashboard: 'Genel Bakış', entry: 'Veri Girişi', history: 'İşlem Geçmişi',
  analytics: 'Analiz', settings: 'Ayarlar',
};

/* --------------------------------- Durum ----------------------------------- */
const state = {
  route: 'dashboard',
  params: {},
  settings: {},
  catalog: new Map(),
  prices: {},
  rateMeta: {},
  portfolio: null,
  dataListeners: [],
};

/* ------------------------------- Yardımcılar ------------------------------ */
function parseHash() {
  const raw = (location.hash || '#/dashboard').replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const route = VIEWS[path] ? path : 'dashboard';
  const params = {};
  if (query) for (const [k, v] of new URLSearchParams(query)) params[k] = v;
  return { route, params };
}

function recompute() {
  state.catalog = buildCatalog(state.settings);
  state.portfolio = computePortfolio(store.entries(), state.catalog, state.prices);
}

/** TRY tutarını seçili para birimine çevirir */
function conv(value) {
  const cur = state.settings.currency || 'TRY';
  if (cur === 'TRY' || !Number.isFinite(value)) return { v: value, cur };
  const rate = state.prices[cur];
  if (!Number.isFinite(rate) || !rate) return { v: value, cur: 'TRY' };
  return { v: value / rate, cur };
}

const ctx = {
  get state() { return state; },
  get settings() { return state.settings; },
  get catalog() { return state.catalog; },
  get prices() { return state.prices; },
  get rateMeta() { return state.rateMeta; },
  get portfolio() { return state.portfolio; },
  get store() { return store; },
  get params() { return state.params; },
  get cur() { return conv(1).cur; },
  money(v) { const c = conv(v); return fmtMoney(c.v, c.cur); },
  num(v, d = 2) { return num(v, d); },
  pct(v, d = 2) { return Number.isFinite(v) ? `%${num(Math.abs(v), d)}` : '–'; },
  conv,
  refresh: () => render(),
  go: (route, params = {}) => {
    const q = new URLSearchParams(params).toString();
    location.hash = `#/${route}${q ? '?' + q : ''}`;
  },
  applyTheme: (mode) => applyTheme(mode),
  refreshRates: (force = true) => loadRates(force),
  onPortfolioChanged: (fn) => { state.dataListeners.push(fn); },
};

/* -------------------------------- Tema ------------------------------------- */
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(mode) {
  const dark = mode === 'dark' || (mode !== 'light' && mq.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#1b1a19' : '#0f6cbd');
}
mq.addEventListener?.('change', () => {
  if ((state.settings.theme || 'auto') === 'auto') applyTheme('auto');
});

/* ------------------------------ Yönlendirme -------------------------------- */
function buildNav() {
  const railNav = $('#railNav');
  const tabbar = $('#tabbar');
  railNav.innerHTML = '';
  tabbar.innerHTML = '';
  for (const item of NAV) {
    railNav.append(h('button', {
      class: 'rail-link', dataset: { nav: item.id },
      onclick: () => { ctx.go(item.id); closeRail(); },
    }, icon(item.icon, 20), h('span', null, item.label)));

    tabbar.append(h('button', {
      class: '', dataset: { tab: item.id },
      'aria-label': item.label,
      onclick: () => ctx.go(item.id),
    }, icon(item.icon, 21), h('span', null, item.short)));
  }
}

function markNav(route) {
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === route));
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === route));
  $('#viewTitle').textContent = TITLES[route] || '';
  const fab = $('#fab');
  if (fab) fab.classList.toggle('hidden', route === 'entry');
  const sub = $('#viewSub');
  if (sub) {
    sub.textContent = route === 'dashboard'
      ? (state.rateMeta?.at ? `Kurlar: ${new Date(state.rateMeta.at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}` : '')
      : route === 'history' ? `${store.entries().length} kayıt` : '';
  }
}

let renderToken = 0;
function render() {
  const { route, params } = parseHash();
  state.route = route;
  state.params = params;
  state.settings = store.settings();

  const scroll = window.scrollY;
  const view = $('#view');
  view.innerHTML = '';
  document.querySelectorAll('.action-bar').forEach((el) => el.remove());
  document.body.classList.remove('has-action-bar');
  const token = ++renderToken;
  try {
    VIEWS[route].render(view, ctx);
  } catch (err) {
    console.error(err);
    view.append(h('section', { class: 'card' },
      h('div', { class: 'card-body' },
        h('div', { class: 'msgbar error' }, 'Bu ekran yüklenemedi. Sayfayı yenilemeyi deneyin.'))));
  }
  if (token === renderToken) {
    markNav(route);
    window.scrollTo({ top: scroll });
  }
}

/* -------------------------------- Kurlar ----------------------------------- */
async function loadRates(force = false) {
  const btn = $('#btnMore') || $('#btnRates');
  btn?.classList.add('busy');
  try {
    const res = await rates.load(state.catalog, state.settings, { force });
    state.prices = res.prices || {};
    state.rateMeta = res.meta || {};
    recompute();
    render();
    if (force) {
      const errs = state.rateMeta.errors || [];
      if (!Object.keys(state.prices).length) toast('Kurlar alınamadı', { type: 'err' });
      else if (errs.length) toast(`Kurlar güncellendi (${errs.length} kaynak hatası)`, { type: '' });
      else toast('Kurlar güncellendi', { type: 'ok' });
    }
  } catch (e) {
    console.error(e);
    if (force) toast('Kurlar alınamadı: ' + e.message, { type: 'err' });
  } finally {
    btn?.classList.remove('busy');
  }
}

/* -------------------------------- Kilit ------------------------------------ */
function showLockScreen() {
  const host = document.createElement('div');
  host.className = 'modal-host';
  host.style.zIndex = '300';
  const input = h('input', { class: 'input', type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: '••••', style: { textAlign: 'center', letterSpacing: '8px', fontSize: '20px' } });
  const err = h('div', { class: 'hint err', style: { minHeight: '18px' } });
  const submit = async () => {
    const hash = await sha256(input.value.trim());
    if (hash === state.settings.pin) { host.remove(); return; }
    err.textContent = 'PIN hatalı';
    input.value = '';
    input.focus();
  };
  const modal = h('div', { class: 'modal' },
    h('div', { class: 'modal-head' }, h('h3', null, 'Uygulama kilidi')),
    h('div', { class: 'modal-body' },
      h('p', { style: { marginTop: '0' } }, 'Devam etmek için PIN kodunu girin.'),
      input, err),
    h('div', { class: 'modal-foot' },
      h('button', { class: 'btn', onclick: submit }, 'Kilidi aç')));
  host.append(modal);
  document.body.append(host);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  setTimeout(() => input.focus(), 120);
}

/* ------------------------------ Taşma menüsü ------------------------------- */
async function openOverflowMenu() {
  const item = (iconName, label, onClick) =>
    h('button', {
      class: 'list-item', style: { padding: '14px 4px' },
      onclick: async () => { closeModal(); await onClick(); },
    }, icon(iconName, 22), h('div', { class: 'sp' }, h('div', { class: 'title' }, label)));

  const body = h('div', null,
    item('refresh', 'Kurları yenile', () => loadRates(true)),
    item('sun', 'Tema değiştir', async () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      state.settings.theme = next;
      await store.saveSettings({ theme: next });
      applyTheme(next);
      toast(next === 'dark' ? 'Koyu tema' : 'Açık tema');
    }),
    item('download', 'Yedek indir (JSON)', () => {
      downloadFile(`portfoy-yedek-${todayISO()}.json`, store.exportData(), 'application/json');
      toast('Yedek indirildi', { type: 'ok' });
    }),
    item('upload', 'Yedekten geri yükle', () => {
      const input = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const n = await store.importData(await file.text());
          toast(`${n} kayıt geri yüklendi`, { type: 'ok' });
          render();
        } catch (e) { toast('Yedek okunamadı: ' + e.message, { type: 'err' }); }
      });
      document.body.append(input); input.click(); input.remove();
    }),
    item('info', 'Hakkında', async () => {
      await openModal({
        title: 'Portföy · Yatırım Takibi',
        body: h('div', null,
          h('p', { style: { marginTop: '0' } }, 'Altın, döviz, kripto ve diğer varlıklar için mobil uyumlu portföy takip uygulaması.'),
          h('p', null, 'Tüm veriler yalnızca bu cihazda saklanır; hiçbir sunucuya gönderilmez. Uygulama çevrimdışı çalışır.'),
          h('p', { class: 'muted small' }, `Sürüm 2.0 · Depolama: ${store.mode === 'idb' ? 'IndexedDB' : 'localStorage'}`)),
        actions: [{ label: 'Kapat', value: null, variant: 'subtle', autofocus: true }],
      });
    }));

  const res = await openModal({ title: 'Menü', body, actions: [], dismissible: true });
  return res;
}

/* -------------------------- Sekmeler arası kaydırma ----------------------- */
function enableSwipeNavigation() {
  const view = $('#view');
  let sx = 0, sy = 0, tracking = false;
  const isScrollable = (el) => el && el.closest('.chips, .table-wrap, .seg, input, select, textarea');

  view.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { tracking = false; return; }
    if (isScrollable(e.target)) { tracking = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });

  view.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    const order = NAV.map((n) => n.id);
    const i = order.indexOf(state.route);
    const next = dx < 0 ? order[Math.min(order.length - 1, i + 1)] : order[Math.max(0, i - 1)];
    if (next && next !== state.route) ctx.go(next);
  }, { passive: true });
}

/* ------------------------------ Yan menü ----------------------------------- */
function closeRail() {
  $('#rail')?.classList.remove('open');
  document.querySelector('.scrim')?.remove();
  $('#railToggle')?.setAttribute('aria-expanded', 'false');
}
function toggleRail() {
  const rail = $('#rail');
  const open = rail.classList.toggle('open');
  $('#railToggle')?.setAttribute('aria-expanded', String(open));
  if (open) {
    const scrim = h('div', { class: 'scrim', onclick: closeRail });
    document.body.append(scrim);
  } else {
    document.querySelector('.scrim')?.remove();
  }
}

/* -------------------------------- Başlat ----------------------------------- */
async function boot() {
  await store.init();
  state.settings = store.settings();
  applyTheme(state.settings.theme || 'auto');
  buildNav();
  recompute();

  // Veri değişikliklerini dinle
  store.addEventListener('change', (e) => {
    const reason = e.detail?.reason;
    if (reason === 'init') return;
    state.settings = store.settings();
    recompute();
    if (state.route === 'entry') {
      state.dataListeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
      return;
    }
    render();
  });

  // Tema düğmesi
  $('#btnTheme')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    state.settings.theme = next;
    store.saveSettings({ theme: next });
    applyTheme(next);
    toast(next === 'dark' ? 'Koyu tema' : 'Açık tema');
  });

  // Uygulama çubuğu eylemleri
  $('#btnNew')?.addEventListener('click', () => ctx.go('entry'));
  $('#btnSearch')?.addEventListener('click', () => ctx.go('history', { focus: 'search' }));
  $('#btnMore')?.addEventListener('click', () => openOverflowMenu());
  $('#fab')?.addEventListener('click', () => ctx.go('entry'));

  // Kur yenileme düğmesi
  $('#btnRates')?.addEventListener('click', () => loadRates(true));

  // Menü düğmesi
  $('#railToggle')?.addEventListener('click', toggleRail);

  // Sekmeler arası kaydırma hareketi
  enableSwipeNavigation();

  // Yönlendirme
  window.addEventListener('hashchange', () => render());
  if (!location.hash) location.hash = '#/dashboard';

  render();

  // Kurlar
  if (state.settings.autoRefresh !== false) {
    loadRates(false);
  } else {
    const cached = rates.readCache();
    if (cached?.prices) {
      state.prices = cached.prices;
      state.rateMeta = cached.meta || {};
      recompute();
      render();
    }
  }

  // Kilit ekranı
  if (state.settings.pin) setTimeout(showLockScreen, 300);

  // PWA
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW kaydedilemedi', e));
  }

  // Uygulama kurulum istemi (Android Chrome / PWA)
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    if (localStorage.getItem('portfoy.installTip') === '1') return;
    localStorage.setItem('portfoy.installTip', '1');
    setTimeout(() => toast('Uygulamayı telefonunuza ekleyebilirsiniz', {
      duration: 6000,
      action: { label: 'Kur', onClick: async () => { installPrompt?.prompt(); installPrompt = null; } },
    }), 2500);
  });

  // Yükleme ekranını kaldır
  const bootEl = $('#boot');
  setTimeout(() => {
    bootEl.classList.add('done');
    setTimeout(() => bootEl.remove(), 350);
  }, 260);
}

boot().catch((err) => {
  console.error(err);
  const bootEl = $('#boot');
  if (bootEl) {
    bootEl.innerHTML = `<div class="boot-inner"><p>Uygulama başlatılamadı:<br>${err.message}</p></div>`;
  }
});
