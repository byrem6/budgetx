/* =========================================================================
   rates.js — piyasa verisi (döviz / metal / kripto) + elle kurlar
   Tüm kaynaklar CORS uyumlu; tarayıcıdan doğrudan çağrılır.
   ========================================================================= */

import { getAsset } from './catalog.js';

const CACHE_KEY = 'portfoy.rates.v2';
const TTL = 30 * 60 * 1000;               // 30 dakika
const OZ_TO_G = 31.1034768;                // troy ons -> gram
const CG_IDS = {
  bitcoin: 'BTC', ethereum: 'ETH', tether: 'USDT', solana: 'SOL', ripple: 'XRP',
  dogecoin: 'DOGE', cardano: 'ADA', 'avalanche-2': 'AVAX', chainlink: 'LINK',
  polkadot: 'DOT', 'matic-network': 'MATIC', litecoin: 'LTC', 'the-open-network': 'TON',
  'shiba-inu': 'SHIB', 'avalanche-2': 'AVAX', uniswap: 'UNI', 'aave': 'AAVE',
  binancecoin: 'BNB', stellar: 'XLM', monero: 'XMR', tron: 'TRX',
};

/* ------------------------------- Kaynaklar ------------------------------- */
const FX_SOURCES = [
  {
    id: 'exchangerate-api',
    url: 'https://api.exchangerate-api.com/v4/latest/USD',
    parse: (j) => j?.rates || null,
  },
  {
    id: 'open.er-api',
    url: 'https://open.er-api.com/v6/latest/USD',
    parse: (j) => (j?.result === 'success' ? j.rates : null),
  },
  {
    id: 'currency-api',
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    parse: (j) => j?.usd || null,
  },
];

const METAL_SOURCES = [
  { id: 'gold-api', url: (m) => `https://api.gold-api.com/price/${m === 'silver' ? 'XAG' : 'XAU'}`,
    parse: (j) => (Number.isFinite(j?.price) ? j.price : null) },
  { id: 'currency-api', url: () => 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    parse: (j, m) => { const v = j?.usd?.[m === 'silver' ? 'xag' : 'xau']; return Number.isFinite(v) ? v : null; } },
];

async function getJSON(url, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

/* ------------------------------- Hesaplama ------------------------------- */
/** USD bazlı kurlar: { TRY: 50.0, EUR: 0.88, ... } → varlık fiyatı (₺) */
function composePrices(catalog, fx, metals, cryptos, settings) {
  const prices = {};
  const usdTry = fx?.TRY || null;

  for (const [id, a] of catalog) {
    switch (a.kind) {
      case 'cash':
        prices[id] = 1;
        break;
      case 'fiat': {
        const c = a.currency;
        if (c === 'USD') prices[id] = usdTry;
        else if (c === 'TRY') prices[id] = 1;
        else if (fx && fx[c] && usdTry) prices[id] = fx[c] * usdTry;   // 1 X = fx[c] USD = fx[c]*usdTry TRY
        break;
      }
      case 'crypto': {
        const usd = cryptos?.[a.cgId || CG_IDS[id] || id];
        if (usd && usdTry) prices[id] = usd * usdTry;
        break;
      }
      case 'metal': {
        const usdOz = metals?.[a.metal];
        if (!usdOz || !usdTry) break;
        const premium = a.metal === 'gold' ? 1 + (Number(settings.goldPremium) || 0) / 100 : 1;
        prices[id] = a.size === 'ounce'
          ? usdOz * usdTry * premium
          : (usdOz / OZ_TO_G) * usdTry * premium;
        break;
      }
      default:
        break; // manual -> kullanıcı kuru
    }
  }

  // Temel para birimleri her hesaplanır (görüntüleme dönüşümü ve altın fiyatı için)
  const ensure = (id, fn) => { if (prices[id] === undefined) { const v = fn(); if (v !== null && v !== undefined) prices[id] = v; } };
  ensure('TRY', () => 1);
  ensure('USD', () => usdTry);
  ensure('EUR', () => (fx?.EUR && usdTry ? fx.EUR * usdTry : null));
  ensure('GBP', () => (fx?.GBP && usdTry ? fx.GBP * usdTry : null));
  ensure('CHF', () => (fx?.CHF && usdTry ? fx.CHF * usdTry : null));
  return prices;
}

/** Elle girilen kurlar her şeyi ezer. */
function applyManual(prices, settings, catalog) {
  const manual = settings.rates || {};
  const out = { ...prices };
  for (const [id, val] of Object.entries(manual)) {
    const price = typeof val === 'number' ? val : val?.price;
    if (Number.isFinite(price) && price > 0) out[id] = price;
  }
  return out;
}

/* -------------------------------- API ------------------------------------ */
export const rates = {
  cache: null,

  readCache() {
    if (this.cache !== null) return this.cache;
    try { this.cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); }
    catch { this.cache = null; }
    return this.cache;
  },
  writeCache(data) {
    this.cache = data;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* kota dolu olabilir */ }
  },
  clearCache() {
    this.cache = null;
    try { localStorage.removeItem(CACHE_KEY); } catch { /* yoksay */ }
  },

  /**
   * Kurları getirir.
   * @returns {{prices:Object, meta:{at:string, sources:string[], stale:boolean, errors:string[]}}}
   */
  async load(catalog, settings, { force = false } = {}) {
    const cached = this.readCache();
    if (!force && cached && Date.now() - cached.at < TTL) {
      return { ...cached, meta: { ...cached.meta, stale: false, fromCache: true } };
    }

    const errors = [];
    const sources = [];

    // Gerekli veri kümelerini belirle
    // Döviz kurları metal/kripto fiyatları için de gereklidir -> her zaman çekilir
    const needFx = catalog.size > 0;
    const needCrypto = [...catalog.values()].some((a) => a.kind === 'crypto');
    const needMetal = [...catalog.values()].some((a) => a.kind === 'metal');

    let fx = null, metals = {}, cryptos = {};

    if (needFx) {
      for (const src of FX_SOURCES) {
        try {
          const j = await getJSON(src.url);
          const parsed = src.parse(j);
          if (parsed && parsed.TRY) { fx = parsed; sources.push(src.id); break; }
          throw new Error('biçim');
        } catch (e) { errors.push(`döviz/${src.id}: ${e.message}`); }
      }
    }
    if (needMetal) {
      for (const metal of ['gold', 'silver']) {
        for (const src of METAL_SOURCES) {
          try {
            const j = await getJSON(src.url(metal));
            const v = src.parse(j, metal);
            if (Number.isFinite(v) && v > 0) { metals[metal] = v; if (!sources.includes(src.id)) sources.push(src.id); break; }
            throw new Error('biçim');
          } catch (e) { errors.push(`metal/${metal}/${src.id}: ${e.message}`); }
        }
      }
    }
    if (needCrypto) {
      const ids = [...catalog.values()].filter((a) => a.kind === 'crypto').map((a) => a.cgId || CG_IDS[a.id] || a.id);
      try {
        const j = await getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`);
        for (const [k, v] of Object.entries(j || {})) if (Number.isFinite(v.usd)) cryptos[k] = v.usd;
        if (Object.keys(cryptos).length) sources.push('coingecko');
        else throw new Error('boş');
      } catch (e) {
        errors.push(`kripto/coingecko: ${e.message}`);
        for (const id of ids) {
          try {
            const j = await getJSON(`https://api.coinbase.com/v2/prices/${id}-USD/spot`);
            const amt = Number(j?.data?.amount);
            if (Number.isFinite(amt)) { cryptos[id] = amt; if (!sources.includes('coinbase')) sources.push('coinbase'); }
          } catch (e2) { errors.push(`kripto/coinbase/${id}: ${e2.message}`); }
        }
      }
    }

    const composed = composePrices(catalog, fx, metals, cryptos, settings);
    const prices = applyManual(composed, settings, catalog);

    // Hiçbir fiyat gelmediyse önbelleğe düş
    if (!Object.keys(prices).length) {
      if (cached?.prices) {
        return { prices: applyManual(cached.prices, settings, catalog), meta: { ...cached.meta, stale: true, errors } };
      }
      return { prices: {}, meta: { at: new Date().toISOString(), sources: [], stale: true, errors } };
    }

    const data = {
      prices,
      meta: { at: new Date().toISOString(), sources, stale: false, errors },
    };
    this.writeCache({ ...data, at: Date.now() });
    return data;
  },

  /** Tek varlığın güncel fiyatı (₺) */
  priceOf(assetId, priceMap) {
    const p = priceMap?.[assetId];
    return Number.isFinite(p) ? p : null;
  },
};

export { OZ_TO_G };
