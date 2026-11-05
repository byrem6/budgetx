/* =========================================================================
   views/dashboard.js — Genel Bakış
   ========================================================================= */

import { h, num, qty, money as fmtMoney, pct, signedMoney, signedPct, fmtDate, monthKey, fmtMonth } from '../util.js';
import { donut, areaChart, barChart, initChartTooltips, responsiveChart } from '../charts.js';
import { assetDot, emptyState, messageBar, segmented } from '../ui.js';
import { targetProgress } from '../calc.js';

export function render(root, ctx) {
  const { portfolio, settings, catalog } = ctx;
  const t = portfolio.totals;
  const hasData = portfolio.sorted.length > 0;
  const cur = ctx.cur;

  /* ------------------------------- Hero ---------------------------------- */
  const hero = h('section', { class: 'card hero' },
    h('div', { class: 'card-body' },
      h('div', { class: 'hero-label' }, 'Toplam portföy değeri'),
      h('div', { class: 'hero-value' }, ctx.money(t.value)),
      h('div', { class: 'hero-row' },
        h('span', { class: `pill on-hero ${t.unreal >= 0 ? 'up' : 'dn'}` },
          `${t.unreal >= 0 ? '▲' : '▼'} ${ctx.money(Math.abs(t.unreal))} (${signedPct(t.unrealPct)})`),
        h('span', { class: 'pill on-hero' }, `Maliyet ${ctx.money(t.cost)}`),
        h('span', { class: 'sp' }),
        h('span', { style: { fontSize: '11px', opacity: '.85' } }, `${t.assets} varlık · ${t.count} işlem`)),
      h('div', { class: 'hero-stats' },
        stat('Net yatırım', ctx.money(t.netInvested)),
        stat('Gerçekleşen kâr', ctx.money(t.realized)),
        stat('Komisyon', ctx.money(t.fee)))));
  root.append(hero);

  /* --------------------------- Kur durumu uyarısı -------------------------- */
  if (ctx.rateMeta?.stale) {
    root.append(messageBar('warn', 'Güncel kurlar alınamadı; son bilinen kurlar ve elle girdiğiniz değerler kullanılıyor. Ayarlar > "Kurları elle gir" bölümünden güncelleyebilirsiniz.'));
  }

  if (!hasData) {
    root.append(h('section', { class: 'card' }, emptyState({
      title: 'Henüz yatırım kaydı yok',
      message: 'İlk alımınızı ekleyerek portföy takibine başlayın.',
      actionLabel: 'Veri girişi yap',
      onAction: () => ctx.go('entry'),
      iconName: 'entry',
    })));
    return;
  }

  /* ------------------------------- KPI kartları --------------------------- */
  const active = portfolio.positions.filter((p) => p.qty > 0);
  const best = [...active].sort((a, b) => (b.unrealPct ?? -Infinity) - (a.unrealPct ?? -Infinity))[0];
  const worst = [...active].sort((a, b) => (a.unrealPct ?? Infinity) - (b.unrealPct ?? Infinity))[0];
  const thisMonth = monthKey(new Date().toISOString());
  const monthBuy = [...portfolio.monthly.values()].reduce((a, m) => a + m.buy, 0);
  const curMonth = portfolio.monthly.get(thisMonth);
  const kpis = h('section', { class: 'kpi-grid' },
    kpi('En çok kazandıran', best ? best.asset.name : '–', best ? `${signedPct(best.unrealPct)} · ${ctx.money(best.unreal)}` : '', best ? 'up' : ''),
    kpi('En çok kaybettiren', worst ? worst.asset.name : '–', worst ? `${signedPct(worst.unrealPct)} · ${ctx.money(worst.unreal)}` : '', worst && worst.unreal < 0 ? 'dn' : ''),
    kpi('Bu ay alım', ctx.money(curMonth?.buy || 0), `Toplam ${ctx.money(monthBuy)}`),
    kpi('Varlık sayısı', String(t.assets), `Ort. maliyet ${ctx.money(t.invested)}`));
  root.append(kpis);

  /* -------------------------------- Hedefler ------------------------------- */
  const targets = settings.targets || [];
  if (targets.length) {
    const card = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, 'Hedefler'), h('span', { class: 'sp' }),
        h('button', { class: 'btn ghost sm', onclick: () => ctx.go('settings') }, 'Düzenle')));
    const body = h('div', { class: 'card-body' });
    for (const tg of targets) {
      const p = targetProgress(tg, portfolio.positions, t.value);
      const asset = tg.assetId === '*' ? { name: 'Tüm portföy', color: 'var(--brand)' } : catalog.get(tg.assetId) || { name: tg.assetId };
      body.append(h('div', { style: { marginBottom: '14px' } },
        h('div', { class: 'row' },
          h('b', { style: { fontSize: '13.5px' } }, asset.name),
          h('span', { class: 'sp' }),
          h('span', { class: 'tabular', style: { fontSize: '12.5px', color: 'var(--text-2)' } }, `${ctx.money(p.current)} / ${ctx.money(tg.value)}`)),
        h('div', { class: `progress ${p.done ? 'ok' : ''}` }, h('span', { style: { width: `${Math.min(100, p.pct).toFixed(1)}%` } })),
        h('div', { class: 'row', style: { marginTop: '4px' } },
          h('span', { class: 'hint' }, `%${num(p.pct, 1)}`),
          h('span', { class: 'sp' }),
          h('span', { class: 'hint' }, p.done ? 'Hedefe ulaşıldı 🎉' : `Kalan ${ctx.money(p.remaining)}`))));
    }
    card.append(body);
    root.append(card);
  }

  /* --------------------------- Portföy değeri grafiği ---------------------- */
  const tl = portfolio.timeline;
  const chartCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', null, 'Portföy değeri'),
      h('span', { class: 'sub' }, 'mevcut kurlarla'),
      h('span', { class: 'sp' })));
  const bodyEl = h('div', { class: 'card-body' });
  const periods = [['6', '6A'], ['12', '12A'], ['24', '24A'], ['0', 'Tümü']];
  let range = 12;
  const seg = segmented('period', periods.map(([v, l]) => ({ value: v, label: l })), String(range), (v) => {
    range = Number(v);
    redraw();
  });
  chartCard.querySelector('.card-head').append(seg);
  const chartHost = h('div');
  bodyEl.append(chartHost);
  bodyEl.append(h('div', { class: 'chart-legend' },
    h('span', null, h('i', { style: { background: 'var(--brand)' } }), 'Portföy değeri'),
    h('span', null, h('i', { style: { background: 'var(--text-3)' } }), 'Maliyet')));
  chartCard.append(bodyEl);
  root.append(chartCard);

  function buildArea(w, hh) {
    const data = range > 0 ? tl.slice(-range) : tl;
    return areaChart(data.map((d) => ({ label: d.ym, value: ctx.conv(d.value).v, cost: ctx.conv(d.cost).v })), { width: w, height: hh, currency: cur });
  }
  const redraw = responsiveChart(chartHost, buildArea, 260);

  /* -------------------------------- Dağılım ------------------------------- */
  const alloc = portfolio.positions.filter((p) => p.value > 0);
  if (alloc.length) {
    const segs = alloc.map((p) => ({ label: p.asset.name, value: ctx.conv(p.value).v, color: p.asset.color }));
    const donutHost = h('div', { style: { width: '150px', flex: 'none' } });
    donutHost.innerHTML = donut(segs);
    const legend = h('div', { class: 'donut-legend' });
    for (const p of alloc) {
      legend.append(h('button', { class: 'legend-row', onclick: () => ctx.go('history', { asset: p.id }) },
        h('span', { class: 'sw', style: { background: p.asset.color } }),
        h('span', { class: 'nm' }, p.asset.name),
        h('span', { class: 'pc' }, `%${num(p.share, 1)}`),
        h('span', { class: 'vl' }, ctx.money(p.value))));
    }
    root.append(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, 'Dağılım'), h('span', { class: 'sp' }),
        h('span', { class: 'sub' }, `${alloc.length} varlık`)),
      h('div', { class: 'card-body' }, h('div', { class: 'donut-wrap' }, donutHost, legend))));
  }

  /* ------------------------------- Varlıklar ------------------------------ */
  const assetCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Varlıklarım'), h('span', { class: 'sp' }),
      h('button', { class: 'btn ghost sm', onclick: () => ctx.go('analytics') }, 'Detaylı analiz')));
  const list = h('div', { class: 'list' });
  for (const p of portfolio.positions) {
    const up = (p.unreal ?? 0) >= 0;
    list.append(h('button', { class: 'list-item', onclick: () => ctx.go('history', { asset: p.id }) },
      assetDot(p.asset),
      h('div', { class: 'sp' },
        h('div', { class: 'title' }, p.asset.name),
        h('div', { class: 'meta' }, `${qty(p.qty, p.asset.decimals)} ${p.asset.unit} · ort. ${ctx.money(p.avg)}`)),
      h('div', { class: 'amount' },
        h('div', { class: 'title' }, ctx.money(p.value ?? p.cost)),
        h('div', { class: `meta ${up ? 'up' : 'dn'}` }, p.value !== null ? `${up ? '▲' : '▼'} ${signedPct(p.unrealPct)}` : 'kur yok'))));
  }
  assetCard.append(list);
  root.append(assetCard);

  /* ---------------------------- Aylık hareketler --------------------------- */
  const monthly = [...portfolio.monthly.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  if (monthly.length) {
    const barCard = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, 'Aylık alış'), h('span', { class: 'sp' }),
        h('span', { class: 'sub' }, 'son 12 ay')),
      h('div', { class: 'card-body' }));
    const host = h('div');
    barCard.querySelector('.card-body').append(host);
    responsiveChart(host, (w, hh) => barChart(monthly.map(([ym, m]) => ({
      label: fmtMonth(ym), value: ctx.conv(m.buy).v,
      color: 'var(--brand)',
    })), { width: w, height: hh, currency: cur }), 220);
    root.append(barCard);
  }

  /* ------------------------------ Son hareketler --------------------------- */
  const recent = portfolio.sorted.slice(0, 6);
  const recCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Son işlemler'), h('span', { class: 'sp' }),
      h('button', { class: 'btn ghost sm', onclick: () => ctx.go('history') }, 'Tümü')));
  const rlist = h('div', { class: 'list' });
  for (const e of recent) {
    const asset = catalog.get(e.assetId) || { name: e.assetId, short: '?', color: 'var(--text-3)', unit: '', decimals: 2 };
    const isSell = e.side === 'sell';
    rlist.append(h('div', { class: 'list-item' },
      assetDot(asset, 32),
      h('div', { class: 'sp' },
        h('div', { class: 'title' }, `${isSell ? 'Satış' : 'Alış'} · ${asset.name}`),
        h('div', { class: 'meta' }, `${fmtDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' })} · ${qty(e.amount, asset.decimals)} ${asset.unit}`)),
      h('div', { class: 'amount' },
        h('div', { class: 'title' }, ctx.money(Math.abs(e.total))),
        h('div', { class: `meta ${isSell ? 'dn' : ''}` }, isSell ? '−' : '+'))));
  }
  recCard.append(rlist);
  root.append(recCard);
}

/* ------------------------------ Yardımcılar ------------------------------- */
function stat(label, value) {
  return h('div', { class: 'hero-stat' }, h('span', null, label), h('b', null, value));
}
function kpi(label, value, foot, tone = '') {
  return h('div', { class: 'kpi' },
    h('div', { class: 'kpi-label' }, label),
    h('div', { class: `kpi-value ${tone}` }, value),
    foot ? h('div', { class: 'kpi-foot' }, foot) : null);
}
