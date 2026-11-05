/* =========================================================================
   store.js — yerel veri katmanı (IndexedDB, localStorage yedeği)
   Veriler yalnızca cihazda tutulur; sunucuya hiçbir şey gönderilmez.
   ========================================================================= */

import { DEFAULT_SETTINGS } from './catalog.js';
import { uid } from './util.js';

const DB_NAME = 'portfoy-db';
const DB_VERSION = 1;
const STORES = ['entries', 'kv'];
const LS_ENTRIES = 'portfoy.entries.v1';
const LS_SETTINGS = 'portfoy.settings.v1';

/* --------------------------- IndexedDB yardımcısı -------------------------- */
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB yok'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) {
        const s = db.createObjectStore('entries', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('assetId', 'assetId');
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB açılamadı'));
    req.onblocked = () => reject(new Error('IndexedDB engellendi'));
  }).catch((err) => { dbPromise = null; throw err; });
  return dbPromise;
}

function tx(db, store, mode = 'readonly') {
  return db.transaction(store, mode).objectStore(store);
}
function reqToPromise(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}

/* --------------------------- localStorage yedeği -------------------------- */
const ls = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
};

/* -------------------------------- Mağaza ---------------------------------- */
class Store extends EventTarget {
  constructor() {
    super();
    this.mode = 'idb';
    this._entries = [];
    this._settings = { ...DEFAULT_SETTINGS };
  }

  async init() {
    try {
      const db = await openDB();
      this.db = db;
      this.mode = 'idb';
      this._entries = await reqToPromise(tx(db, 'entries').getAll());
      const saved = await reqToPromise(tx(db, 'kv').get('settings'));
      this._settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
      this._entries = this._sort(this._entries);
    } catch (err) {
      console.warn('[store] IndexedDB kullanılamıyor, localStorage yedeğine geçiliyor:', err?.message);
      this.mode = 'ls';
      this._entries = this._sort(ls.get(LS_ENTRIES, []));
      this._settings = { ...DEFAULT_SETTINGS, ...ls.get(LS_SETTINGS, {}) };
    }
    this._emit('change', { reason: 'init' });
    return this;
  }

  _sort(list) {
    return [...list].sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
  }
  _emit(reason, detail) { this.dispatchEvent(new CustomEvent('change', { detail: { reason, ...detail } })); }
  _persistEntries() { if (this.mode === 'ls') ls.set(LS_ENTRIES, this._entries); }
  _persistSettings() { if (this.mode === 'ls') ls.set(LS_SETTINGS, this._settings); }

  /* ------------------------------ Kayıtlar ------------------------------ */
  entries() { return this._entries; }
  entry(id) { return this._entries.find((e) => e.id === id) || null; }

  async addEntry(data) {
    const now = Date.now();
    const entry = { ...normalizeEntry(data), id: uid(), createdAt: now, updatedAt: now };
    this._entries = this._sort([entry, ...this._entries]);
    await this._write(entry);
    this._emit('change', { reason: 'add', entry });
    return entry;
  }

  async updateEntry(id, data) {
    const idx = this._entries.findIndex((e) => e.id === id);
    if (idx < 0) throw new Error('Kayıt bulunamadı');
    const entry = { ...this._entries[idx], ...normalizeEntry(data), id, updatedAt: Date.now() };
    this._entries[idx] = entry;
    this._entries = this._sort(this._entries);
    await this._write(entry);
    this._emit('change', { reason: 'update', entry });
    return entry;
  }

  async removeEntry(id) {
    const entry = this.entry(id);
    this._entries = this._entries.filter((e) => e.id !== id);
    if (this.mode === 'idb') await reqToPromise(tx(this.db, 'entries', 'readwrite').delete(id));
    this._persistEntries();
    this._emit('change', { reason: 'remove', entry });
    return entry;
  }

  async restoreEntry(entry) {
    if (!entry) return;
    this._entries = this._sort([entry, ...this._entries.filter((e) => e.id !== entry.id)]);
    await this._write(entry);
    this._emit('change', { reason: 'restore', entry });
  }

  async replaceAll(list) {
    this._entries = this._sort(list.map((e) => ({ ...normalizeEntry(e), id: e.id || uid() })));
    if (this.mode === 'idb') {
      const store = tx(this.db, 'entries', 'readwrite');
      await reqToPromise(store.clear());
      for (const e of this._entries) await reqToPromise(store.put(e));
    } else {
      ls.set(LS_ENTRIES, this._entries);
    }
    this._emit('change', { reason: 'replace' });
  }

  async clearAll() { await this.replaceAll([]); }

  async _write(entry) {
    if (this.mode === 'idb') await reqToPromise(tx(this.db, 'entries', 'readwrite').put(entry));
    this._persistEntries();
  }

  /* ------------------------------ Ayarlar ------------------------------- */
  settings() { return { ...this._settings }; }

  async saveSettings(patch) {
    this._settings = { ...this._settings, ...patch };
    if (this.mode === 'idb') await reqToPromise(tx(this.db, 'kv', 'readwrite').put(this._settings, 'settings'));
    this._persistSettings();
    this._emit('change', { reason: 'settings' });
    return this.settings();
  }

  /* --------------------------- Dışa/içe aktarma -------------------------- */
  exportData() {
    return JSON.stringify({ app: 'portfoy', version: 1, exportedAt: new Date().toISOString(), settings: this._settings, entries: this._entries }, null, 2);
  }

  async importData(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || !Array.isArray(data.entries)) throw new Error('Geçersiz yedek dosyası');
    await this.replaceAll(data.entries);
    if (data.settings) await this.saveSettings(data.settings);
    return data.entries.length;
  }
}

/** Girdi doğrulama + alan normalizasyonu */
export function normalizeEntry(data) {
  const amount = Math.abs(Number(data.amount) || 0);
  const unitPrice = Math.abs(Number(data.unitPrice) || 0);
  const fee = Math.abs(Number(data.fee) || 0);
  const side = data.side === 'sell' ? 'sell' : 'buy';
  const total = side === 'buy' ? amount * unitPrice + fee : amount * unitPrice - fee;
  return {
    date: data.date || new Date().toISOString().slice(0, 10),
    assetId: data.assetId || 'XAU',
    side,
    amount: +amount.toFixed(8),
    unitPrice: +unitPrice.toFixed(8),
    fee: +fee.toFixed(4),
    total: +total.toFixed(4),
    account: (data.account || '').trim().slice(0, 40),
    note: (data.note || '').trim().slice(0, 300),
  };
}

export const store = new Store();
