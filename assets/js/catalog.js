/* =========================================================================
   catalog.js — varlık kataloğu ve uygulama ayarları
   ========================================================================= */

/** Dahili varlıklar. kind: metal | fiat | crypto | cash | manual */
export const BUILTIN_ASSETS = [
  { id: 'XAU',  name: 'Gram Altın',      short: 'Au', kind: 'metal',  unit: 'gr',  decimals: 3, color: '#b8860b', metal: 'gold',   size: 'gram',   source: 'gold' },
  { id: 'XAUO', name: 'Ons Altın',       short: 'Oz', kind: 'metal',  unit: 'ons', decimals: 4, color: '#d4a017', metal: 'gold',   size: 'ounce',  source: 'gold' },
  { id: 'XAG',  name: 'Gram Gümüş',      short: 'Ag', kind: 'metal',  unit: 'gr',  decimals: 3, color: '#7d8597', metal: 'silver', size: 'gram',   source: 'silver' },
  { id: 'USD',  name: 'Amerikan Doları', short: '$',  kind: 'fiat',   unit: '$',   decimals: 2, color: '#107c10', currency: 'USD' },
  { id: 'EUR',  name: 'Euro',            short: '€',  kind: 'fiat',   unit: '€',   decimals: 2, color: '#0f6cbd', currency: 'EUR' },
  { id: 'GBP',  name: 'İngiliz Sterlini', short: '£',  kind: 'fiat',   unit: '£',   decimals: 2, color: '#7b4fa3', currency: 'GBP' },
  { id: 'CHF',  name: 'İsviçre Frangı',  short: 'Fr', kind: 'fiat',   unit: 'Fr',  decimals: 2, color: '#c239b3', currency: 'CHF' },
  { id: 'TRY',  name: 'Türk Lirası',     short: '₺',  kind: 'cash',   unit: '₺',   decimals: 2, color: '#8764b8' },
  { id: 'BTC',  name: 'Bitcoin',         short: '₿',  kind: 'crypto', unit: 'BTC', decimals: 6, color: '#f7931a', cgId: 'bitcoin' },
  { id: 'ETH',  name: 'Ethereum',        short: 'Ξ',  kind: 'crypto', unit: 'ETH', decimals: 6, color: '#627eea', cgId: 'ethereum' },
  { id: 'USDT', name: 'Tether',          short: '₮',  kind: 'crypto', unit: 'USDT', decimals: 2, color: '#26a17b', cgId: 'tether' },
  { id: 'SOL',  name: 'Solana',          short: 'S',  kind: 'crypto', unit: 'SOL', decimals: 4, color: '#14f195', cgId: 'solana' },
];

export const DEFAULT_SETTINGS = {
  theme: 'auto',              // auto | light | dark
  currency: 'TRY',            // ana görünüm para birimi
  goldPremium: 0,             // % altın primi (yerel fiyat farkı)
  autoRefresh: true,          // açılışta kurları otomatik yenile
  rates: {},                  // { assetId: {price, at} } elle girilen kurlar
  assets: [],                 // kullanıcı tanımlı varlıklar
  hiddenAssets: [],           // gizlenen dahili varlıklar
  targets: [],                // { id, assetId, value, label }
  accounts: ['Banka', 'Hesap', 'Midas', 'Parola', 'Nakit'],
  feeDefault: 0,
  pin: null,                  // isteğe bağlı kilit
};

export const ACCENT_COLORS = [
  '#0f6cbd', '#107c10', '#b8860b', '#c239b3', '#8764b8', '#e3008c',
  '#008272', '#ca5010', '#7b4fa3', '#038387', '#986f0b', '#7a7574',
];

/**
 * Kullanıcı ayarları + dahili katalog birleşimi.
 * @returns {Map<string, object>} id -> varlık
 */
export function buildCatalog(settings) {
  const map = new Map();
  const hidden = new Set(settings.hiddenAssets || []);
  for (const a of BUILTIN_ASSETS) {
    if (hidden.has(a.id)) continue;
    map.set(a.id, { ...a, builtin: true });
  }
  for (const a of settings.assets || []) {
    map.set(a.id, { ...a, builtin: false });
  }
  return map;
}

export const getAsset = (catalog, id) => catalog.get(id) || {
  id, name: id, short: id.slice(0, 2).toUpperCase(), kind: 'manual',
  unit: '', decimals: 2, color: '#605e5c',
};

export const assetLabel = (a) => (a?.name || 'Bilinmiyor');

/** Varlık adet birimi: "gr", "$", "BTC" … */
export const unitOf = (a) => a?.unit || '';

/** Kullanıcı tanımlı varlık için kimlik üretimi */
export function makeCustomAsset({ name, kind = 'manual', unit = '', decimals = 2, color = '#605e5c', currency = '', cgId = '' }) {
  const id = `u_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20)}_${Date.now().toString(36).slice(-4)}`;
  return {
    id, name, short: name.slice(0, 2).toUpperCase(), kind, unit, decimals, color,
    ...(currency ? { currency: currency.toUpperCase() } : {}),
    ...(cgId ? { cgId } : {}),
  };
}
