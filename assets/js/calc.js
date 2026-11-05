/* =========================================================================
   calc.js — portföy muhasebesi (ortalama maliyet yöntemi)
   ========================================================================= */

import { getAsset } from './catalog.js';
import { monthKey } from './util.js';

const byDate = (a, b) => (a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1);

function blankState() {
  return {
    qty: 0, cost: 0, realized: 0,
    buyTotal: 0, sellTotal: 0, buyQty: 0, sellQty: 0,
    feeTotal: 0, count: 0, first: null, last: null,
  };
}

/**
 * Tüm portföyü hesaplar.
 * @param {Array} entries
 * @param {Map} catalog
 * @param {Object} prices  { assetId: TRY fiyatı }
 */
export function computePortfolio(entries = [], catalog = new Map(), prices = {}) {
  const sorted = [...entries].sort(byDate);
  const states = new Map();
  const monthly = new Map();          // ym -> {buy, sell, net, realized}
  const accounts = new Map();         // hesap -> {cost, qty, value}

  const stateOf = (id) => {
    if (!states.has(id)) states.set(id, blankState());
    return states.get(id);
  };

  for (const e of sorted) {
    const s = stateOf(e.assetId);
    const price = Number.isFinite(prices[e.assetId]) ? prices[e.assetId] : 0;
    const m = monthly.get(monthKey(e.date)) || { buy: 0, sell: 0, net: 0, realized: 0, count: 0 };
    m.count++;

    if (e.side === 'sell') {
      const avg = s.qty > 0 ? s.cost / s.qty : 0;
      const closed = Math.min(e.amount, s.qty);
      const pnl = closed * (e.unitPrice - avg) - (e.fee || 0);
      s.realized += pnl;
      s.cost -= closed * avg;
      s.qty -= closed;
      s.sellTotal += e.total;
      s.sellQty += e.amount;
      s.feeTotal += e.fee || 0;
      m.sell += e.total;
      m.net -= e.total;
      m.realized += pnl;
    } else {
      s.qty += e.amount;
      s.cost += e.total;
      s.buyTotal += e.total;
      s.buyQty += e.amount;
      s.feeTotal += e.fee || 0;
      m.buy += e.total;
      m.net += e.total;
    }
    s.count++;
    s.first = s.first || e.date;
    s.last = e.date;

    // hesap kırılımı
    const acc = e.account || 'Diğer';
    const a = accounts.get(acc) || { cost: 0, value: 0, qty: 0 };
    if (e.side === 'buy') { a.cost += e.total; a.qty += e.amount; }
    a.value += (e.side === 'buy' ? e.amount : -e.amount) * price;
    accounts.set(acc, a);

    monthly.set(monthKey(e.date), m);
  }

  /* ------------------------------ Pozisyonlar ----------------------------- */
  const positions = [];
  for (const [id, s] of states) {
    const asset = getAsset(catalog, id);
    const price = Number.isFinite(prices[id]) ? prices[id] : null;
    const value = price !== null ? s.qty * price : null;
    const unreal = value !== null ? value - s.cost : null;
    positions.push({
      id, asset, qty: s.qty, cost: s.cost, avg: s.qty > 0 ? s.cost / s.qty : 0,
      price, value, unreal,
      unrealPct: unreal !== null && s.cost > 0 ? (unreal / s.cost) * 100 : null,
      realized: s.realized, buyTotal: s.buyTotal, sellTotal: s.sellTotal,
      buyQty: s.buyQty, sellQty: s.sellQty, feeTotal: s.feeTotal,
      count: s.count, first: s.first, last: s.last,
      share: 0,
    });
  }
  const totalValue = positions.reduce((a, p) => a + (p.value || 0), 0);
  for (const p of positions) p.share = totalValue > 0 && p.value !== null ? (p.value / totalValue) * 100 : 0;
  positions.sort((a, b) => (b.value ?? b.cost) - (a.value ?? a.cost));

  /* -------------------------------- Toplamlar ------------------------------ */
  const totals = {
    cost: positions.reduce((a, p) => a + p.cost, 0),
    value: totalValue,
    unreal: positions.reduce((a, p) => a + (p.unreal || 0), 0),
    realized: positions.reduce((a, p) => a + p.realized, 0),
    invested: positions.reduce((a, p) => a + p.buyTotal, 0),
    withdrawn: positions.reduce((a, p) => a + p.sellTotal, 0),
    fee: positions.reduce((a, p) => a + p.feeTotal, 0),
    count: entries.length,
    assets: positions.filter((p) => p.qty > 0.0000001).length,
  };
  totals.unrealPct = totals.cost > 0 ? (totals.unreal / totals.cost) * 100 : null;
  totals.netInvested = totals.invested - totals.withdrawn;

  /* ------------------------------ Zaman serisi ---------------------------- */
  const timeline = buildTimeline(sorted, catalog, prices);

  return { positions, totals, timeline, monthly, accounts, sorted };
}

/** Aylık portföy değeri / maliyet serisi */
function buildTimeline(sorted, catalog, prices) {
  if (!sorted.length) return [];
  const out = [];
  const st = new Map();
  const stateOf = (id) => { if (!st.has(id)) st.set(id, blankState()); return st.get(id); };

  const start = monthKey(sorted[0].date);
  const now = new Date();
  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const months = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard++ < 600) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }

  const monthEnd = {};
  for (const mm of months) {
    const [yy, mo] = mm.split('-').map(Number);
    monthEnd[mm] = new Date(yy, mo, 0).getDate();     // ayın son günü
  }

  let idx = 0;
  let netInvested = 0;
  for (const mm of months) {
    const limit = monthEnd[mm];
    while (idx < sorted.length) {
      const e = sorted[idx];
      const em = monthKey(e.date);
      if (em > mm) break;
      const s = stateOf(e.assetId);
      if (e.side === 'sell') {
        const avg = s.qty > 0 ? s.cost / s.qty : 0;
        const closed = Math.min(e.amount, s.qty);
        s.realized += closed * (e.unitPrice - avg) - (e.fee || 0);
        s.cost -= closed * avg; s.qty -= closed;
        netInvested -= e.total;
      } else {
        s.qty += e.amount; s.cost += e.total; netInvested += e.total;
      }
      idx++;
    }
    let value = 0, cost = 0, qty = 0;
    for (const [id, s] of st) {
      const p = Number.isFinite(prices[id]) ? prices[id] : 0;
      value += s.qty * p;
      cost += s.cost;
      qty += s.qty;
    }
    out.push({ ym: mm, value, cost, netInvested, qty });
  }
  return out;
}

/** Belirli bir varlık için alım-satım dökümü */
export function assetLedger(entries, assetId) {
  const list = entries.filter((e) => e.assetId === assetId).sort(byDate);
  let qty = 0, cost = 0, realized = 0;
  const rows = list.map((e) => {
    if (e.side === 'sell') {
      const avg = qty > 0 ? cost / qty : 0;
      const closed = Math.min(e.amount, qty);
      const pnl = closed * (e.unitPrice - avg) - (e.fee || 0);
      realized += pnl; cost -= closed * avg; qty -= closed;
      return { ...e, avg, pnl, running: qty };
    }
    qty += e.amount; cost += e.total;
    return { ...e, avg: cost / qty, pnl: null, running: qty };
  });
  return { rows, qty, cost, realized };
}

/** Hedef ilerlemesi */
export function targetProgress(target, positions, totalValue) {
  const current = target.assetId === '*'
    ? totalValue
    : (positions.find((p) => p.id === target.assetId)?.value || 0);
  const pct = target.value > 0 ? (current / target.value) * 100 : 0;
  return { current, pct, done: pct >= 100, remaining: Math.max(0, target.value - current) };
}
