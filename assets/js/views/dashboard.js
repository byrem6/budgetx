/* =========================================================================
   views/dashboard.js — Genel Bakış (tam analiz dashboard)
   ========================================================================= */

import { h, num, qty, signedPct, fmtDate, monthKey, fmtMonth } from '../util.js';
import { donut, areaChart, barChart, responsiveChart } from '../charts.js';
import { assetDot, emptyState, messageBar, segmented } from '../ui.js';
import { targetProgress } from '../calc.js';

export function render(root, ctx) {
  const { portfolio, settings, catalog } = ctx;
  const t = portfolio.totals;
  const hasData = portfolio.sorted.length > 0;
  const cur = ctx.cur;

  if (!hasData) {
    root.append(h('section', { class: 'card hero' },
      h('div', { class: 'card-body' },
        h('div', { class: 'hero-label' }, 'Toplam portföy değeri'),
        h('div', { class: 'hero-value' }, ctx.money(0)),
        h('div', { class: 'hero-row' }, h('span', { class: 'hint' }, 'Henüz kayıt yok')))));
    root.append(h('section', { class: 'card' }, emptyState({
      title: 'Portföyünüz boş',
      message: 'İlk alımınızı ekleyerek başlayın.',
      actionLabel: 'Veri girişi',
      onAction: () => ctx.go('entry'),
      iconName: 'entry',
    })));
    return;
  }

  /* ============================ 1. ÖZET KARTI ============================ */
  const thisMonth = monthKey(new Date().toISOString());
  const monthBuy = portfolio.monthly.get(thisMonth)?.buy || 0;
  const monthSell = portfolio.monthly.get(thisMonth)?.sell || 0;
  const active = portfolio.positions.filter((p) => p.qty > 0);
  const best = [...active].sort((a, b) => (b.unrealPct ?? -Infinity) - (a.unrealPct ?? -Infinity))[0];
  const worst = [...active].sort((a, b) => (a.unrealPct ?? Infinity) - (b.unrealPct ?? Infinity))[0];

  root.append(h('section', { class: 'card hero' },
    h('div', { class: 'card-body' },
      h('div', { class: 'hero-label' }, 'Toplam portföy değeri'),
      h('div', { class: 'hero-value' }, ctx.money(t.value)),
      h('div', { class: 'hero-row' },
        h('span', { class: `pill ${t.unreal >= 0 ? 'up' : 'dn'}` },
          `${t.unreal >= 0 ? '▲' : '▼'} ${ctx.money(Math.abs(t.unreal))} · ${signedPct(t.unrealPct)}`),
        h('span', { class: 'hint' }, `${t.assets} varlık · ${t.count} işlem`)),
      h('div', { class: 'metrics' },
        metric('Maliyet', ctx.money(t.cost)),
        metric('Net yatırım', ctx.money(t.netInvested)),
        metric('Bu ay alım', ctx.money(monthBuy)),
        metric('Bu ay satış', ctx.money(monthSell)),
        metric('Gerçekleşen kâr', ctx.money(t.realized), t.realized >= 0 ? 'up' : 'dn'),
        metric('Komisyon', ctx.money(t.fee))))));

  if (ctx.rateMeta?.stale) {
    root.append(messageBar('warn', 'Güncel kurlar alınamadı; son bilinen kurlar kullanılıyor.'));
  }

  /* ========================== 2. DEĞER GRAFİĞİ =========================== */
  const tl = portfolio.timeline;
  let range = 12;
  let redraw = null;
  const chartHost = h('div');
  const periodInfo = h('div', { class: 'period-info' });

  root.append(h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', null, 'Portföy değeri'),
      h('span', { class: 'sp' }),
      segmented('period', [{ value: '6', label: '6A' }, { value: '12', label: '12A' }, { value: '24', label: '24A' }, { value: '0', label: 'Tümü' }],
        String(range), (v) => { range = Number(v); refreshChart(); })),
    h('div', { class: 'card-body' }, chartHost, periodInfo)));

  function refreshChart() {
    redraw?.();
    paintPeriodInfo();
  }

  redraw = responsiveChart(chartHost, (w, hh) => {
    const data = range > 0 ? tl.slice(-range) : tl;
    return areaChart(data.map((d) => ({ label: d.ym, value: ctx.conv(d.value).v, cost: ctx.conv(d.cost).v })),
      { width: w, height: hh, currency: cur });
  }, 210);

  function paintPeriodInfo() {
    const data = range > 0 ? tl.slice(-range) : tl;
    periodInfo.innerHTML = '';
    if (data.length < 2) { periodInfo.append(h('div', { class: 'hint' }, 'Kıyaslama için yeterli geçmiş yok.')); return; }
    const first = data[0].value, last = data[data.length - 1].value;
    const chg = first > 0 ? ((last - first) / first) * 100 : null;
    periodInfo.append(h('div', { class: 'row' },
      h('div', { class: 'sp' },
        h('div', { class: 'hint' }, 'Dönem başı'),
        h('div', { style: { fontWeight: '600' } }, ctx.money(first))),
      h('div', { class: 'sp' },
        h('div', { class: 'hint' }, 'Dönem sonu'),
        h('div', { style: { fontWeight: '600' } }, ctx.money(last))),
      h('div', { class: 'sp' },
        h('div', { class: 'hint' }, 'Değişim'),
        h('div', { class: chg >= 0 ? 'up' : 'dn', style: { fontWeight: '600' } }, chg === null ? '–' : signedPct(chg)))));
  }
  redraw = responsiveChart(chartHost, (w, hh) => {
    const data = range > 0 ? tl.slice(-range) : tl;
    return areaChart(data.map((d) => ({ label: d.ym, value: ctx.conv(d.value).v, cost: ctx.conv(d.cost).v })),
      { width: w, height: hh, currency: cur });
  }, 210);

  /* ============================= 3. HEDEFLER ============================= */
  const targets = settings.targets || [];
  if (targets.length) {
    const body = h('div', { class: 'card-body' });
    for (const tg of targets) {
      const p = targetProgress(tg, portfolio.positions, t.value);
      const asset = tg.assetId === '*' ? { name: 'Tüm portföy' } : catalog.get(tg.assetId) || { name: tg.assetId };
      body.append(h('div', { style: { marginBottom: '14px' } },
        h('div', { class: 'row' },
          h('b', { style: { fontSize: '13.5px' } }, asset.name),
          h('span', { class: 'sp' }),
          h('span', { class: 'tabular', style: { fontSize: '12.5px', color: 'var(--text-2)' } },
            `${ctx.money(p.current)} / ${ctx.money(tg.value)}`)),
        h('div', { class: `progress ${p.done ? 'ok' : ''}` }, h('span', { style: { width: `${Math.min(100, p.pct).toFixed(1)}%` } })),
        h('div', { class: 'row', style: { marginTop: '4px' } },
          h('span', { class: 'hint' }, `%${num(p.pct, 1)}`),
          h('span', { class: 'sp' }),
          h('span', { class: 'hint' }, p.done ? 'Hedefe ulaşıldı' : `Kalan ${ctx.money(p.remaining)}`))));
    }
    root.append(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, 'Hedefler'), h('span', { class: 'sp' }),
        h('button', { class: 'btn ghost sm', onclick: () => ctx.go('settings') }, 'Düzenle')),
      body));
  }

  /* ============================ 4. DAĞILIM ============================== */
  const alloc = portfolio.positions.filter((p) => p.value > 0);
  if (alloc.length) {
    const donutHost = h('div', { style: { width: '108px', flex: 'none' } });
    donutHost.innerHTML = donut(alloc.map((p) => ({ label: p.asset.name, value: ctx.conv(p.value).v, color: p.asset.color })), { size: 108, thickness: 15 });
    const legend = h('div', { class: 'donut-legend' });
    for (const p of alloc) {
      legend.append(h('button', { class: 'legend-row', onclick: () => ctx.go('history', { asset: p.id }) },
        h('span', { class: 'sw', style: { background: p.asset.color } }),
        h('span', { class: 'nm' }, p.asset.name),
        h('span', { class: 'pc' }, `%${num(p.share, 1)}`),
        h('span', { class: 'vl' }, ctx.money(p.value))));
    }
    const top = alloc[0];
    root.append(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, 'Dağılım'), h('span', { class: 'sp' }),
        h('span', { class: 'sub' }, `${alloc.length} varlık`)),
      h('div', { class: 'card-body' },
        h('div', { class: 'donut-wrap' }, donutHost, legend),
        alloc.length >= 3 && top.share > 60
          ? h('div', { class: 'msgbar warn', style: { marginTop: '12px' } },
            `Portföyün %${num(top.share, 0)}'i ${top.asset.name} içinde. Yoğunlaşma riski olabilir.`)
          : null)));
  }

  /* ========================== 5. VARLIK PERFORMANSI ====================== */
  const kpiRow = h('section', { class: 'kpi-grid' },
    kpi('En çok kazandıran', best ? best.asset.name : '–',
      best ? `${signedPct(best.unrealPct)} · ${ctx.money(best.unreal)}` : '', best ? 'up' : ''),
    kpi('En çok kaybettiren', worst ? worst.asset.name : '–',
      worst ? `${signedPct(worst.unrealPct)} · ${ctx.money(worst.unreal)}` : '', worst && worst.unreal < 0 ? 'dn' : ''),
    kpi('Bu ay alım', ctx.money(monthBuy), `Satış ${ctx.money(monthSell)}`),
    kpi('Komisyon', ctx.money(t.fee), `${t.count} işlem`));
  root.append(kpiRow);

  const list = h('div', { class: 'list' });
  for (const p of portfolio.positions) {
    const up = (p.unreal ?? 0) >= 0;
    list.append(h('button', { class: 'list-item', onclick: () => ctx.go('history', { asset: p.id }) },
      assetDot(p.asset),
      h('div', { class: 'sp' },
        h('div', { class: 'title' }, p.asset.name),
        h('div', { class: 'meta' }, `${qty(p.qty, p.asset.decimals)} ${p.asset.unit} · ort. ${ctx.money(p.avg)}`),
        h('div', { class: 'weight' }, h('span', { style: { width: `${Math.max(2, p.share).toFixed(1)}%`, background: p.asset.color } }))),
      h('div', { class: 'amount' },
        h('div', { class: 'title' }, ctx.money(p.value ?? p.cost)),
        h('div', { class: `meta ${up ? 'up' : 'dn'}` }, p.value !== null ? `${up ? '▲' : '▼'} ${signedPct(p.unrealPct)}` : 'kur yok'))));
  }
  root.append(h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Varlık performansı'), h('span', { class: 'sp' }),
      h('button', { class: 'btn ghost sm', onclick: () => ctx.go('analytics') }, 'Analiz')),
    list));

  /* ========================= 6. AYLIK NET YATIRIM ========================= */
  const monthly = [...portfolio.monthly.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  if (monthly.length) {
    const barHost = h('div');
    root.append(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, 'Aylık net yatırım'), h('span', { class: 'sp' }),
        h('span', { class: 'sub' }, 'alış − satış')),
      h('div', { class: 'card-body' }, barHost)));
    responsiveChart(barHost, (w, hh) => barChart(monthly.map(([ym, m]) => ({
      label: fmtMonth(ym), value: ctx.conv(m.net).v,
      color: m.net >= 0 ? 'var(--brand)' : 'var(--text-3)',
    })), { width: w, height: hh, currency: cur }), 200);
  }

  /* ============================ 7. BU YIL ÖZETİ ========================== */
  const year = new Date().getFullYear();
  const yearRows = [...portfolio.monthly.entries()].filter(([ym]) => ym.startsWith(String(year)));
  if (yearRows.length) {
    const yBuy = yearRows.reduce((a, [, m]) => a + m.buy, 0);
    const ySell = yearRows.reduce((a, [, m]) => a + m.sell, 0);
    const yReal = yearRows.reduce((a, [, m]) => a + m.realized, 0);
    root.append(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, `${year} özeti`), h('span', { class: 'sp' }),
        h('span', { class: 'sub' }, `${yearRows.length} ay`)),
      h('div', { class: 'card-body' },
        h('div', { class: 'metrics' },
          metric('Alış', ctx.money(yBuy)),
          metric('Satış', ctx.money(ySell)),
          metric('Net', ctx.money(yBuy - ySell)),
          metric('Gerçekleşen', ctx.money(yReal), yReal >= 0 ? 'up' : 'dn')))));
  }

  /* ========================= 8. HESAP DAĞILIMI ========================== */
  const accRows = [...portfolio.accounts.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .filter((r) => Math.abs(r.value) > 0.001 || r.cost > 0.001)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  if (accRows.length > 1) {
    const colors = ['#e11d2e', '#0f6cbd', '#107c10', '#b8860b', '#8764b8', '#008272', '#ca5010', '#c239b3'];
    const total = accRows.reduce((a, r) => a + Math.abs(r.value), 0) || 1;
    const accList = h('div', { class: 'list' });
    accRows.forEach((r, i) => {
      accList.append(h('div', { class: 'list-item' },
        h('span', { class: 'dot', style: { background: colors[i % colors.length], width: '12px', height: '12px', borderRadius: '4px' } }),
        h('div', { class: 'sp' }, h('div', { class: 'title' }, r.name)),
        h('div', { class: 'amount' },
          h('div', { class: 'title' }, ctx.money(r.value)),
          h('div', { class: 'meta' }, `%${num(Math.abs(r.value) / total * 100, 1)}`))));
    });
    root.append(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, 'Hesap dağılımı')),
      accList));
  }

  /* =========================== 9. SON İŞLEMLER =========================== */
  const recent = portfolio.sorted.slice(0, 5);
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
  root.append(h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Son işlemler'), h('span', { class: 'sp' }),
      h('button', { class: 'btn ghost sm', onclick: () => ctx.go('history') }, 'Tümü')),
    rlist));
}

/* ------------------------------ Yardımcılar ------------------------------- */
function metric(label, value, tone = '') {
  return h('div', { class: 'metric' },
    h('span', null, label),
    h('b', { class: tone }, value));
}
function kpi(label, value, foot, tone = '') {
  return h('div', { class: 'kpi' },
    h('div', { class: 'kpi-label' }, label),
    h('div', { class: `kpi-value ${tone}` }, value),
    foot ? h('div', { class: 'kpi-foot' }, foot) : null);
}
