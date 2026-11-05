/* =========================================================================
   store.js — yerel veri katmanı (IndexedDB, localStorage yedeği)
   Veriler yalnızca cihazda tutulur; sunucuya hiçbir şey gönderilmez.
   ========================================================================= */

import { DEFAULT_SETTINGS } from './catalog.js';
import { uid } from './util.js';
import { deriveKey, encryptJSON, decryptJSON, randomSalt, exportKey, importKey } from './crypto.js';

const DB_NAME = 'portfoy-db';
const DB_VERSION = 1;
const STORES = ['entries', 'kv'];
const LS_ENTRIES = 'portfoy.entries.v1';
const LS_SETTINGS = 'portfoy.settings.v1';
const LS_DELETED = 'portfoy.deleted.v1';
const LS_VAULT = 'portfoy.vault.v1';
const LS_VAULT_META = 'portfoy.vaultmeta.v1';

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
    this._deleted = [];     // silinen kayitlar (bulut senkronizasyonu için)
    this._settings = { ...DEFAULT_SETTINGS };
    this.encMeta = null;   // { salt, iter } — şifreleme meta verisi
    this.key = null;       // AES anahtarı (bellekte)
    this.passphrase = null; // kasa şifresi (yalnızca bellekte, diske yazılmaz)
    this.locked = false;   // kasa kilidi
  }

  async init() {
    try {
      const db = await openDB();
      this.db = db;
      this.mode = 'idb';
      this._entries = await reqToPromise(tx(db, 'entries').getAll());
      const saved = await reqToPromise(tx(db, 'kv').get('settings'));
      this._settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
      this._deleted = (await reqToPromise(tx(db, 'kv').get('deleted'))) || [];
      this._entries = this._sort(this._entries);

      // Şifreli kasa (vault) var mı?
      const meta = await reqToPromise(tx(db, 'kv').get('vault-meta'));
      if (meta) {
        this.encMeta = meta;
        this.locked = true;
        const blob = await reqToPromise(tx(db, 'kv').get('vault'));
        if (blob) {
          // Parola bilinmeden çözülemez; içerik bellekte tutulmaz.
          this._vaultBlob = blob;
        }
        this._entries = [];
      }
    } catch (err) {
      console.warn('[store] IndexedDB kullanılamıyor, localStorage yedeğine geçiliyor:', err?.message);
      this.mode = 'ls';
      this._entries = this._sort(ls.get(LS_ENTRIES, []));
      this._deleted = ls.get(LS_DELETED, []);
      this._settings = { ...DEFAULT_SETTINGS, ...ls.get(LS_SETTINGS, {}) };
      const meta = ls.get(LS_VAULT_META, null);
      if (meta) {
        this.encMeta = meta;
        this.locked = true;
        this._vaultBlob = ls.get(LS_VAULT, null);
        this._entries = [];
      }
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
  async _persistDeleted() {
    if (this.mode === 'idb') await reqToPromise(tx(this.db, 'kv', 'readwrite').put(this._deleted, 'deleted'));
    else ls.set(LS_DELETED, this._deleted);
  }

  /* --------------------------- Şifreli kasa (vault) ----------------------- */
  isEncrypted() { return !!this.encMeta; }
  isLocked() { return this.locked; }

  /** Şifreli kasa açma */
  async unlock(passphrase) {
    if (!this.encMeta) return true;
    const key = await deriveKey(passphrase, this.encMeta.salt, this.encMeta.iter);
    const blob = this._vaultBlob || (this.mode === 'idb'
      ? await reqToPromise(tx(this.db, 'kv').get('vault'))
      : ls.get(LS_VAULT, null));
    if (!blob) throw new Error('Kasa içeriği bulunamadı.');
    const doc = await decryptJSON(key, blob);
    this._entries = this._sort(doc.entries || []);
    this._deleted = doc.deleted || [];
    this.key = key;
    this.passphrase = passphrase;
    this.locked = false;
    this._vaultBlob = blob;
    this._emit('change', { reason: 'unlock' });
    return true;
  }

  /** Kayıtlı anahtar (oturum) ile açma */
  async unlockWithKey(keyB64) {
    if (!this.encMeta) return true;
    const key = await importKey(keyB64);
    const blob = this._vaultBlob || (this.mode === 'idb'
      ? await reqToPromise(tx(this.db, 'kv').get('vault'))
      : ls.get(LS_VAULT, null));
    if (!blob) throw new Error('Kasa içeriği bulunamadı.');
    const doc = await decryptJSON(key, blob);
    this._entries = this._sort(doc.entries || []);
    this._deleted = doc.deleted || [];
    this.key = key;
    this.locked = false;
    this._vaultBlob = blob;
    this._emit('change', { reason: 'unlock' });
    return true;
  }

  /** Oturum anahtarı (sessionStorage) */
  async sessionKey() {
    if (!this.key) return null;
    try { return await exportKey(this.key); } catch { return null; }
  }

  /** Şifrelemeyi etkinleştir: mevcut veri şifrelenerek saklanır */
  async enableEncryption(passphrase) {
    if (!passphrase || String(passphrase).length < 4) throw new Error('En az 4 karakterli bir şifre girin.');
    const salt = randomSalt();
    const key = await deriveKey(passphrase, salt);
    this.encMeta = { salt, iter: 210000, at: Date.now() };
    this.key = key;
    this.passphrase = passphrase;
    this.locked = false;
    await this._persistVault();
    await this._clearPlainStore();
    this._emit('change', { reason: 'encrypt' });
    return true;
  }

  /** Şifreyi değiştir (mevcut veri yeni şifreyle yeniden şifrelenir) */
  async changePassphrase(newPass) {
    if (!this.encMeta) throw new Error('Önce şifrelemeyi etkinleştirin.');
    if (!newPass || String(newPass).length < 4) throw new Error('En az 4 karakterli bir şifre girin.');
    const salt = randomSalt();
    const key = await deriveKey(newPass, salt);
    this.encMeta = { salt, iter: 210000, at: Date.now() };
    this.key = key;
    this.passphrase = newPass;
    await this._persistVault();
    this._emit('change', { reason: 'encrypt' });
    return true;
  }

  /** Şifrelemeyi kaldır: veri düz metne döner */
  async disableEncryption() {
    if (!this.encMeta) return true;
    this.encMeta = null;
    this.key = null;
    this.passphrase = null;
    this.locked = false;
    if (this.mode === 'idb') {
      const st = tx(this.db, 'entries', 'readwrite');
      await reqToPromise(st.clear());
      for (const e of this._entries) await reqToPromise(st.put(e));
      await reqToPromise(tx(this.db, 'kv', 'readwrite').delete('vault'));
      await reqToPromise(tx(this.db, 'kv', 'readwrite').delete('vault-meta'));
    } else {
      ls.set(LS_ENTRIES, this._entries);
      ls.set(LS_VAULT, null);
      ls.set(LS_VAULT_META, null);
    }
    this._emit('change', { reason: 'decrypt' });
    return true;
  }

  async _persistVault() {
    const blob = await encryptJSON(this.key, { entries: this._entries, deleted: this._deleted });
    this._vaultBlob = blob;
    if (this.mode === 'idb') {
      await reqToPromise(tx(this.db, 'kv', 'readwrite').put(blob, 'vault'));
      await reqToPromise(tx(this.db, 'kv', 'readwrite').put(this.encMeta, 'vault-meta'));
    } else {
      ls.set(LS_VAULT, blob);
      ls.set(LS_VAULT_META, this.encMeta);
    }
  }

  async _clearPlainStore() {
    if (this.mode === 'idb') {
      const st = tx(this.db, 'entries', 'readwrite');
      await reqToPromise(st.clear());
      await reqToPromise(tx(this.db, 'kv', 'readwrite').delete('deleted'));
    } else {
      ls.set(LS_ENTRIES, []);
      ls.set(LS_DELETED, []);
    }
  }

  /** Tüm kayıtları şifreli kasa olarak yazar */
  async _persistAll() {
    if (this.encMeta) {
      if (!this.key) return;                 // kilitliyken yazma
      await this._persistVault();
      return;
    }
    if (this.mode === 'idb') {
      const st = tx(this.db, 'entries', 'readwrite');
      await reqToPromise(st.clear());
      for (const e of this._entries) await reqToPromise(st.put(e));
      await this._persistDeleted();
    } else {
      ls.set(LS_ENTRIES, this._entries);
      ls.set(LS_DELETED, this._deleted);
    }
  }

  /* ------------------------------ Kayıtlar ------------------------------ */
  entries() { return this._entries; }
  entry(id) { return this._entries.find((e) => e.id === id) || null; }

  async addEntry(data) {
    const now = Date.now();
    const entry = {
      ...normalizeEntry(data),
      id: data.id || uid(),
      createdAt: data.createdAt || now,
      updatedAt: Number(data.updatedAt) || now,
    };
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
    this._deleted = [...this._deleted.filter((d) => d.id !== id), { id, at: Date.now() }];
    await this._persistAll();
    this._emit('change', { reason: 'remove', entry });
    return entry;
  }

  async restoreEntry(entry) {
    if (!entry) return;
    this._entries = this._sort([entry, ...this._entries.filter((e) => e.id !== entry.id)]);
    this._deleted = this._deleted.filter((d) => d.id !== entry.id);
    await this._persistAll();
    this._emit('change', { reason: 'restore', entry });
  }

  async replaceAll(list) {
    this._entries = this._sort(list.map((e) => ({ ...normalizeEntry(e), id: e.id || uid() })));
    this._deleted = [];
    await this._persistAll();
    this._emit('change', { reason: 'replace' });
  }

  async clearAll() { await this.replaceAll([]); }

  async _write(entry) {
    await this._persistAll();
  }

  /* ------------------------------ Ayarlar ------------------------------- */
  settings() { return { ...this._settings }; }
  deleted() { return [...this._deleted]; }

  /** Bulut senkronizasyonu sonrası yerel veriyi değiştirir */
  async mergeRemote(entries, deleted) {
    this._entries = this._sort(entries.map((e) => ({ ...normalizeEntry(e), id: e.id || uid() })));
    this._deleted = deleted || [];
    await this._persistAll();
    this._emit('change', { reason: 'sync' });
  }

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
    updatedAt: Number(data.updatedAt) || Date.now(),
  };
}

export const store = new Store();
