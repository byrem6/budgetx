/* =========================================================================
   views/analytics.js — Analiz
   ========================================================================= */

import { h, num, qty, fmtMonth, signedPct } from '../util.js';
import { areaChart, barChart, donut, initChartTooltips, responsiveChart } from '../charts.js';
import { emptyState, segmented } from '../ui.js';

export function render(root, ctx) {
  const p = ctx.portfolio;
  if (!p.sorted.length) {
    root.append(h('section', { class: 'card' }, emptyState({
      title: 'Analiz için veri yok',
      message: 'En az bir işlem ekleyin.',
      actionLabel: 'Veri girişi yap',
      onAction: () => ctx.go('entry'),
      iconName: 'analytics',
    })));
    return;
  }

  /* --------------------------- Dönem seçimi ------------------------------- */
  const periods = [['3', '3A'], ['6', '6A'], ['12', '12A'], ['0', 'Tümü']];
  let range = 12;
  const seg = segmented('range', periods.map(([v, l]) => ({ value: v, label: l })), String(range), (v) => {
    range = Number(v);
    redraw();
  });

  const chartHost = h('div');
  const barHost = h('div');
  const chartCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Değer gelişimi'), h('span', { class: 'sp' }), seg),
    h('div', { class: 'card-body' }, chartHost,
      h('div', { class: 'chart-legend' },
        h('span', null, h('i', { style: { background: 'var(--brand)' } }), 'Portföy değeri'),
        h('span', null, h('i', { style: { background: 'var(--text-3)' } }), 'Maliyet'))));
  root.append(chartCard);

  /* ------------------------------ Performans ------------------------------ */
  const tableHost = h('div', { class: 'table-wrap' });
  root.append(h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Varlık performansı'), h('span', { class: 'sp' }),
      h('span', { class: 'sub' }, 'güncel kurlarla')),
    tableHost));

  /* --------------------------- Aylık net akış ---------------------------- */
  root.append(h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Aylık net yatırım'), h('span', { class: 'sp' }),
      h('span', { class: 'sub' }, 'alış − satış')),
    h('div', { class: 'card-body' }, barHost)));

  /* ------------------------------ Hesap dağılımı -------------------------- */
  const accRows = [...p.accounts.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .filter((r) => Math.abs(r.value) > 0.001 || r.cost > 0.001)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  if (accRows.length) {
    const colors = ['#0f6cbd', '#107c10', '#b8860b', '#c239b3', '#8764b8', '#e3008c', '#008272', '#ca5010'];
    const donutHost = h('div', { style: { width: '150px', flex: 'none' } });
    donutHost.innerHTML = donut(accRows.map((r, i) => ({ label: r.name, value: ctx.conv(r.value).v, color: colors[i % colors.length] })));
    const legend = h('div', { class: 'donut-legend' });
    const total = accRows.reduce((a, r) => a + Math.abs(r.value), 0) || 1;
    accRows.forEach((r, i) => {
      legend.append(h('div', { class: 'legend-row' },
        h('span', { class: 'sw', style: { background: colors[i % colors.length] } }),
        h('span', { class: 'nm' }, r.name),
        h('span', { class: 'pc' }, `%${num(Math.abs(r.value) / total * 100, 1)}`),
        h('span', { class: 'vl' }, ctx.money(r.value))));
    });
    root.append(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, 'Hesap dağılımı')),
      h('div', { class: 'card-body' }, h('div', { class: 'donut-wrap' }, donutHost, legend))));
  }

  /* --------------------------- Gerçekleşen kâr ---------------------------- */
  const realized = p.positions.filter((x) => Math.abs(x.realized) > 0.0001);
  if (realized.length) {
    const realizedList = realized.map((x) => h('div', { class: 'row', style: { padding: '6px 0' } },
      h('b', { style: { fontSize: '13.5px' } }, x.asset.name),
      h('span', { class: 'sp' }),
      h('span', { class: `tabular ${x.realized >= 0 ? 'up' : 'dn'}`, style: { fontWeight: '600' } },
        `${x.realized >= 0 ? '+' : '-'}${ctx.money(Math.abs(x.realized))}`),
      h('span', { class: 'hint', style: { minWidth: '80px', textAlign: 'right' } },
        `satış ${qty(x.sellQty, x.asset.decimals)} ${x.asset.unit}`)));
    root.append(h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, 'Gerçekleşen kâr / zarar')),
      h('div', { class: 'card-body' }, realizedList)));
  }

  /* ------------------------------ Grafikler -------------------------------- */
  const redraw = responsiveChart(chartHost, (w, hh) => {
    const tl = range > 0 ? p.timeline.slice(-range) : p.timeline;
    return areaChart(tl.map((d) => ({ label: d.ym, value: ctx.conv(d.value).v, cost: ctx.conv(d.cost).v })), { width: w, height: hh, currency: ctx.cur });
  }, 260);

  responsiveChart(barHost, (w, hh) => {
    const monthly = [...p.monthly.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
    return barChart(monthly.map(([ym, m]) => ({
      label: fmtMonth(ym), value: ctx.conv(m.net).v,
      color: m.net >= 0 ? 'var(--brand)' : 'var(--danger)',
    })), { width: w, height: hh, currency: ctx.cur });
  }, 220);

  /* ------------------------------ Tablo ------------------------------------ */
  const rows = p.positions;
  const table = h('table', { class: 'grid' },
    h('thead', null, h('tr', null,
      h('th', null, 'Varlık'),
      h('th', { class: 'num' }, 'Miktar'),
      h('th', { class: 'num' }, 'Ort. alış'),
      h('th', { class: 'num' }, 'Güncel'),
      h('th', { class: 'num' }, 'Değer'),
      h('th', { class: 'num' }, 'Kâr/Zarar'),
      h('th', { class: 'num' }, '%'))),
    h('tbody', null, rows.map((x) => {
      const up = (x.unreal ?? 0) >= 0;
      return h('tr', null,
        h('td', null, h('div', { class: 'row', style: { gap: '8px' } },
          h('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: x.asset.color, display: 'inline-block' } }),
          x.asset.name)),
        h('td', { class: 'num' }, `${qty(x.qty, x.asset.decimals)} ${x.asset.unit}`),
        h('td', { class: 'num' }, ctx.money(x.avg)),
        h('td', { class: 'num' }, x.price ? ctx.money(x.price) : '–'),
        h('td', { class: 'num' }, ctx.money(x.value ?? x.cost)),
        h('td', { class: `num ${up ? 'up' : 'dn'}` }, x.value !== null ? `${up ? '+' : '-'}${ctx.money(Math.abs(x.unreal))}` : '–'),
        h('td', { class: `num ${up ? 'up' : 'dn'}` }, x.unrealPct !== null ? signedPct(x.unrealPct) : '–'));
    })),
    h('tfoot', null, h('tr', null,
      h('td', null, 'TOPLAM'),
      h('td', { class: 'num' }, ''),
      h('td', { class: 'num' }, ''),
      h('td', { class: 'num' }, ''),
      h('td', { class: 'num' }, ctx.money(p.totals.value)),
      h('td', { class: `num ${p.totals.unreal >= 0 ? 'up' : 'dn'}` }, ctx.money(p.totals.unreal)),
      h('td', { class: `num ${p.totals.unreal >= 0 ? 'up' : 'dn'}` }, signedPct(p.totals.unrealPct)))));
  tableHost.append(table);

  // Mobil görünüm: tablo yerine kart listesi
  const listHost = h('div', { class: 'list only-narrow' });
  for (const x of rows) {
    const up = (x.unreal ?? 0) >= 0;
    listHost.append(h('div', { class: 'list-item' },
      h('span', { class: 'dot', style: { background: x.asset.color } }, x.asset.short),
      h('div', { class: 'sp' },
        h('div', { class: 'title' }, x.asset.name),
        h('div', { class: 'meta' }, `${qty(x.qty, x.asset.decimals)} ${x.asset.unit} · ort. ${ctx.money(x.avg)}`),
        h('div', { class: 'meta' }, `güncel ${x.price ? ctx.money(x.price) : '–'}`)),
      h('div', { class: 'amount' },
        h('div', { class: 'title' }, ctx.money(x.value ?? x.cost)),
        h('div', { class: `meta ${up ? 'up' : 'dn'}` }, x.value !== null ? `${up ? '▲' : '▼'} ${signedPct(x.unrealPct)}` : '–'))));
  }
  listHost.append(h('div', { class: 'group-head' },
    h('span', null, 'TOPLAM'),
    h('span', { class: 'sp' }),
    h('span', { class: 'tabular' }, ctx.money(p.totals.value)),
    h('span', { class: `tabular ${p.totals.unreal >= 0 ? 'up' : 'dn'}`, style: { marginLeft: '10px' } }, signedPct(p.totals.unrealPct))));
  tableHost.classList.add('only-wide');
  tableHost.parentElement.append(listHost);
}
