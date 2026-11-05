/* =========================================================================
   sync.js — GitHub Gist tabanlı ortak veri katmanı
   -------------------------------------------------------------------------
   GitHub Pages statik bir barındırma olduğu için sunucu yoktur. Verileri
   paylaşmak için bir "bulut veri tabanı" olarak GitHub Gist kullanılır.

   • Okuma: herkese açık (public) gist → token gerekmez, tüm istemciler
     aynı veriyi görür.
   • Yazma: gist'i düzenleyebilmek için "gist" kapsamlı kişisel erişim
     jetonu (PAT) gerekir.
   • Birleştirme: kayıt kimliği (id) + updatedAt ile "son yazan kazanır";
     silinen kayıtlar mezar taşı (tombstone) olarak taşınır, böylece
     silme de tüm istemcilere yayılır. Çevrimdışı çalışma korunur.
   ========================================================================= */

import { store } from './store.js';
import { deriveKey, encryptJSON, decryptJSON } from './crypto.js';

const API = 'https://api.github.com/gists';
const FILE = 'portfoy.json';

export const sync = {
  status: { state: 'idle', at: null, error: '', mode: 'off' },

  config() {
    const s = store.settings().sync || {};
    return { gistId: (s.gistId || '').trim(), token: (s.token || '').trim(), auto: s.auto !== false };
  },
  isConfigured() { return !!this.config().gistId; },
  canWrite() { const c = this.config(); return !!c.gistId && !!c.token; },

  headers(token) {
    const h = { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  },

  /* ------------------------------ Gist işlemleri -------------------------- */
  async fetchDoc(gistId, token) {
    const res = await fetch(`${API}/${gistId}`, { headers: this.headers(token) });
    if (!res.ok) {
      if (res.status === 404) throw new Error('Gist bulunamadı (ID veya erişim hatalı)');
      if (res.status === 401 || res.status === 403) throw new Error('Erişim reddedildi (jeton geçersiz)');
      throw new Error(`GitHub hatası: ${res.status}`);
    }
    const j = await res.json();
    const file = j.files?.[FILE];
    if (!file) return { v: 1, entries: [], deleted: [], created: false };
    let content = file.content;
    if (file.truncated && file.raw_url) {
      const r2 = await fetch(file.raw_url, { headers: this.headers(token) });
      content = await r2.text();
    }
    try {
      const doc = JSON.parse(content);
      if (doc.enc === 'AES-GCM') return this.decryptPayload(doc);
      return { v: doc.v || 1, entries: Array.isArray(doc.entries) ? doc.entries : [], deleted: Array.isArray(doc.deleted) ? doc.deleted : [] };
    } catch (e) {
      if (e && e.message && e.message.includes('şifreli')) throw e;
      throw new Error('Gist içeriği okunamadı (geçersiz JSON)');
    }
  },

  /* ------------------------- Şifreli yük (zarf) -------------------------- */
  /** Düz veriyi şifreli zarf haline getirir (bulutta asla düz metin gitmez) */
  async encryptPayload(doc) {
    if (!store.isEncrypted()) {
      return { v: 1, updatedAt: Date.now(), entries: doc.entries, deleted: doc.deleted };
    }
    const salt = store.encMeta.salt;
    const key = store.passphrase ? await deriveKey(store.passphrase, salt, store.encMeta.iter) : store.key;
    if (!key) throw new Error('Şifreli gönderim için kasa şifresi gerekli.');
    const env = await encryptJSON(key, { entries: doc.entries, deleted: doc.deleted });
    return {
      v: 1,
      enc: 'AES-GCM',
      kdf: 'PBKDF2-SHA256',
      iter: store.encMeta.iter,
      salt,
      iv: env.iv,
      data: env.data,
      updatedAt: Date.now(),
    };
  },

  /** Şifreli zarfı çözer */
  async decryptPayload(doc) {
    let key = null;
    if (store.passphrase) key = await deriveKey(store.passphrase, doc.salt, doc.iter || 210000);
    else if (store.encMeta && store.encMeta.salt === doc.salt && store.key) key = store.key;
    if (!key) throw new Error('Bulut verisi şifreli — bu cihazda kasa şifresiyle açın.');
    try {
      const plain = await decryptJSON(key, { iv: doc.iv, data: doc.data });
      return { v: 1, entries: plain.entries || [], deleted: plain.deleted || [] };
    } catch {
      throw new Error('Bulut verisi çözülemedi — şifre hatalı olabilir.');
    }
  },

  async createGist(token, doc) {
    const res = await fetch(API, {
      method: 'POST',
      headers: this.headers(token),
      body: JSON.stringify({
        description: 'Portföy · Yatırım Takibi — şifreli ortak veri',
        public: true,
        files: { [FILE]: { content: JSON.stringify(await this.encryptPayload(doc), null, 2) } },
      }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('Jeton geçersiz veya "gist" yetkisi yok');
      throw new Error(`Gist oluşturulamadı: ${res.status}`);
    }
    const j = await res.json();
    return j.id;
  },

  async pushDoc(gistId, token, doc) {
    const payload = await this.encryptPayload(doc);
    const res = await fetch(`${API}/${gistId}`, {
      method: 'PATCH',
      headers: this.headers(token),
      body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(payload, null, 2) } } }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error('Jeton geçersiz veya "gist" yetkisi yok');
      throw new Error(`Yazma hatası: ${res.status}`);
    }
    return true;
  },

  /* -------------------------------- Birleştirme --------------------------- */
  merge(localEntries, localDeleted, remote) {
    const map = new Map();
    for (const e of remote.entries || []) if (e?.id) map.set(e.id, e);
    for (const e of localEntries || []) {
      if (!e?.id) continue;
      const r = map.get(e.id);
      if (!r || (e.updatedAt || 0) > (r.updatedAt || 0)) map.set(e.id, e);
    }
    const del = new Map();
    for (const d of [...(remote.deleted || []), ...(localDeleted || [])]) {
      if (!d?.id) continue;
      const prev = del.get(d.id);
      if (!prev || (d.at || 0) > (prev.at || 0)) del.set(d.id, d);
    }
    for (const [id, d] of del) {
      const e = map.get(id);
      if (e && (e.updatedAt || 0) <= (d.at || 0)) map.delete(id);
    }
    return { entries: [...map.values()], deleted: [...del.values()] };
  },

  /* --------------------------------- Çalıştır ---------------------------- */
  /**
   * @param {{push?:boolean, force?:boolean}} opts
   * @returns {{ok:boolean, message:string, count?:number, gistId?:string}}
   */
  async run(opts = {}) {
    const { gistId, token } = this.config();
    if (!gistId) {
      this.status = { state: 'idle', at: null, error: '', mode: 'off' };
      return { ok: false, message: 'Bulut senkronizasyonu için Gist ID gerekli.' };
    }
    this.status = { ...this.status, state: 'syncing', error: '' };
    try {
      let remote;
      try {
        remote = await this.fetchDoc(gistId, token || undefined);
      } catch (e) {
        if (token) {
          // Gist yoksa token ile oluştur
          remote = { v: 1, entries: [], deleted: [] };
        } else {
          throw e;
        }
      }

      const merged = this.merge(store.entries(), store.deleted(), remote);
      const changed = merged.entries.length !== store.entries().length;
      await store.mergeRemote(merged.entries, merged.deleted);

      let pushed = false;
      if (token) {
        await this.pushDoc(gistId, token, {
          entries: merged.entries,
          deleted: merged.deleted,
        });
        pushed = true;
      }

      const at = Date.now();
      this.status = { state: 'ok', at, error: '', mode: pushed ? 'rw' : 'r' };
      await store.saveSettings({ sync: { ...this.config(), lastSync: at } });
      return {
        ok: true,
        message: pushed ? 'Bulut verisi güncellendi' : 'Bulut verisi okundu (salt okunur)',
        count: merged.entries.length,
        gistId,
      };
    } catch (e) {
      this.status = { state: 'error', at: Date.now(), error: e.message, mode: this.canWrite() ? 'rw' : 'r' };
      return { ok: false, message: e.message };
    }
  },

  /** Yeni ortak veri deposu (gist) oluşturur */
  async createShared(token) {
    if (!token) throw new Error('Erişim jetonu gerekli');
    const doc = { v: 1, updatedAt: Date.now(), entries: store.entries(), deleted: store.deleted() };
    const id = await this.createGist(token, doc);
    await store.saveSettings({ sync: { gistId: id, token, auto: true, lastSync: Date.now() } });
    this.status = { state: 'ok', at: Date.now(), error: '', mode: 'rw' };
    return id;
  },

  /** Bağlantı testi */
  async test(token, gistId) {
    const t = (token || '').trim();
    const g = (gistId || '').trim();
    if (!g) {
      if (!t) throw new Error('Gist ID veya jeton gerekli');
      const id = await this.createGist(t, { v: 1, updatedAt: Date.now(), entries: [], deleted: [] });
      return { ok: true, message: `Bulut veri deposu oluşturuldu: ${id}`, gistId: id };
    }
    const doc = await this.fetchDoc(g, t || undefined);
    return { ok: true, message: `Bağlantı başarılı — ${doc.entries.length} kayıt bulundu`, gistId: g, count: doc.entries.length };
  },
};
