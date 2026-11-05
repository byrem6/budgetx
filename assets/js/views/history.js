/* =========================================================================
   views/history.js — Geçmiş (arama, filtre paneli, aylık gruplama, CSV)
   ========================================================================= */

import { h, qty, fmtDate, fmtMonth, groupBy, downloadFile, todayISO } from '../util.js';
import { assetDot, emptyState, toast, confirmDialog, openModal, selectEl } from '../ui.js';

export function render(root, ctx) {
  const state = {
    asset: ctx.params?.asset || 'ALL',
    side: 'ALL',
    account: 'ALL',
    q: '',
    sort: 'date-desc',
  };

  const listHost = h('div', { class: 'list' });

  /* ------------------------------- Arama ---------------------------------- */
  const searchInput = h('input', {
    class: 'input', type: 'search', placeholder: 'Ara: not, tutar, varlık…', value: state.q,
    autocomplete: 'off',
    oninput: (e) => { state.q = e.target.value; paint(); },
  });
  if (ctx.params?.focus === 'search') setTimeout(() => searchInput.focus(), 120);

  /* ------------------------------ Varlık çipleri --------------------------- */
  const assetChips = h('div', { class: 'chips' });
  const paintAssetChips = () => {
    assetChips.innerHTML = '';
    const opts = [['ALL', 'Tümü'], ...[...ctx.catalog.values()].map((a) => [a.id, a.name])];
    for (const [val, label] of opts) {
      const color = val === 'ALL' ? 'var(--brand)' : ctx.catalog.get(val).color;
      assetChips.append(h('button', {
        class: `chip ${state.asset === val ? 'on' : ''}`, type: 'button',
        onclick: () => { state.asset = val; paintAssetChips(); paint(); },
      }, val === 'ALL' ? null : h('span', { class: 'dot', style: { background: color } }), label));
    }
  };
  paintAssetChips();

  /* ---------------------------- Filtre paneli ----------------------------- */
  const filterBtn = h('button', { class: 'btn subtle sm', type: 'button', onclick: openFilters }, 'Filtre');
  const filterInfo = h('span', { class: 'hint' }, '');

  function paintFilterInfo() {
    const parts = [];
    if (state.side !== 'ALL') parts.push(state.side === 'buy' ? 'Alış' : 'Satış');
    if (state.account !== 'ALL') parts.push(state.account);
    if (state.sort !== 'date-desc') parts.push('Sıralama');
    filterInfo.textContent = parts.length ? parts.join(' · ') : '';
    filterBtn.textContent = parts.length ? 'Filtre ✓' : 'Filtre';
  }

  async function openFilters() {
    const sideSeg = h('div', { class: 'seg' });
    const paintSide = () => {
      sideSeg.innerHTML = '';
      for (const [v, l] of [['ALL', 'Tümü'], ['buy', 'Alış'], ['sell', 'Satış']]) {
        sideSeg.append(h('button', {
          class: state.side === v ? 'on' : '', type: 'button',
          onclick: () => { state.side = v; paintSide(); },
        }, l));
      }
    };
    paintSide();

    const accountSel = selectEl(
      [{ value: 'ALL', label: 'Tüm hesaplar' }, ...(ctx.settings.accounts || []).map((a) => ({ value: a, label: a }))],
      state.account, (v) => { state.account = v; });
    const sortSel = selectEl([
      { value: 'date-desc', label: 'Tarih (yeni → eski)' },
      { value: 'date-asc', label: 'Tarih (eski → yeni)' },
      { value: 'amount-desc', label: 'Tutar (yüksek → düşük)' },
      { value: 'amount-asc', label: 'Tutar (düşük → yüksek)' },
    ], state.sort, (v) => { state.sort = v; });

    const body = h('div', null,
      h('div', { class: 'field' }, h('label', null, 'İşlem türü'), sideSeg),
      h('div', { class: 'field' }, h('label', null, 'Hesap / kurum'), accountSel),
      h('div', { class: 'field' }, h('label', null, 'Sıralama'), sortSel));

    await openModal({
      title: 'Filtrele',
      body,
      actions: [{ label: 'Vazgeç', value: null, variant: 'subtle' }, { label: 'Uygula', value: 'ok', variant: 'primary' }],
    });
    paintFilterInfo();
    paint();
  }

  root.append(h('section', { class: 'card' },
    h('div', { class: 'card-body' },
      h('div', { class: 'row', style: { marginBottom: '10px' } },
        h('div', { class: 'sp' }, searchInput),
        filterBtn),
      assetChips,
      filterInfo)));

  /* -------------------------------- Özet ---------------------------------- */
  const summaryHost = h('div', { class: 'card-body' });
  root.append(h('section', { class: 'card' }, summaryHost));

  /* -------------------------------- Liste --------------------------------- */
  root.append(h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', null, 'İşlemler'),
      h('span', { class: 'sp' }),
      h('button', { class: 'btn subtle sm', onclick: exportCsv }, 'CSV')),
    listHost));

  /* ------------------------------ Filtreleme ------------------------------ */
  function filtered() {
    let list = [...ctx.portfolio.sorted];
    if (state.asset !== 'ALL') list = list.filter((e) => e.assetId === state.asset);
    if (state.side !== 'ALL') list = list.filter((e) => e.side === state.side);
    if (state.account !== 'ALL') list = list.filter((e) => (e.account || 'Diğer') === state.account);
    const q = state.q.trim().toLocaleLowerCase('tr');
    if (q) {
      list = list.filter((e) => {
        const a = ctx.catalog.get(e.assetId);
        return [e.note, e.account, a?.name, e.amount, e.unitPrice, e.total]
          .some((v) => String(v ?? '').toLocaleLowerCase('tr').includes(q));
      });
    }
    const cmp = {
      'date-desc': (a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1),
      'date-asc': (a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date > b.date ? 1 : -1),
      'amount-desc': (a, b) => b.total - a.total,
      'amount-asc': (a, b) => a.total - b.total,
    }[state.sort];
    return list.sort(cmp);
  }

  function paint() {
    const list = filtered();
    const buy = list.filter((e) => e.side === 'buy').reduce((a, e) => a + e.total, 0);
    const sell = list.filter((e) => e.side === 'sell').reduce((a, e) => a + e.total, 0);

    summaryHost.innerHTML = '';
    summaryHost.append(h('div', { class: 'row' },
      h('div', { class: 'sp' },
        h('div', { class: 'hint' }, 'İşlem'),
        h('div', { style: { fontWeight: '600' } }, String(list.length))),
      h('div', { class: 'sp' },
        h('div', { class: 'hint' }, 'Alım'),
        h('div', { style: { fontWeight: '600' } }, ctx.money(buy))),
      h('div', { class: 'sp' },
        h('div', { class: 'hint' }, 'Satış'),
        h('div', { style: { fontWeight: '600' } }, ctx.money(sell)))));

    listHost.innerHTML = '';
    if (!list.length) {
      listHost.append(emptyState({
        title: 'Kayıt bulunamadı',
        message: 'Filtreleri değiştirin veya yeni işlem ekleyin.',
        actionLabel: 'Veri girişi',
        onAction: () => ctx.go('entry'),
        iconName: 'history',
      }));
      return;
    }

    const byMonth = groupBy(list, (e) => e.date.slice(0, 7));
    for (const ym of [...byMonth.keys()].sort().reverse()) {
      const rows = byMonth.get(ym);
      const net = rows.reduce((a, e) => a + (e.side === 'buy' ? e.total : -e.total), 0);
      listHost.append(h('div', { class: 'group-head' },
        h('span', null, fmtMonth(ym)),
        h('span', { class: 'sp' }),
        h('span', { class: 'tabular' }, ctx.money(net))));
      for (const e of rows) listHost.append(row(e));
    }
  }

  function row(e) {
    const asset = ctx.catalog.get(e.assetId) || { name: e.assetId, short: '?', color: 'var(--text-3)', unit: '', decimals: 2 };
    const isSell = e.side === 'sell';
    return h('div', { class: 'list-item' },
      assetDot(asset, 34),
      h('div', { class: 'sp' },
        h('div', { class: 'title' }, `${qty(e.amount, asset.decimals)} ${asset.unit} · ${ctx.money(e.unitPrice)}`),
        h('div', { class: 'meta' },
          `${isSell ? 'Satış' : 'Alış'} · ${fmtDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' })}`
          + (e.account ? ` · ${e.account}` : '')
          + (e.fee ? ` · komisyon ${ctx.money(e.fee)}` : '')),
        e.note ? h('div', { class: 'meta', style: { fontStyle: 'italic' } }, e.note) : null),
      h('div', { class: 'amount' },
        h('div', { class: 'title' }, ctx.money(Math.abs(e.total))),
        h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '0' } },
          h('button', { class: 'icon-btn', title: 'Düzenle', 'aria-label': 'Düzenle', onclick: () => ctx.go('entry', { id: e.id }) }, iconEl('edit')),
          h('button', {
            class: 'icon-btn', title: 'Sil', 'aria-label': 'Sil',
            onclick: async () => {
              if (!await confirmDialog({ title: 'Kayıt silinsin mi?', message: `${asset.name} · ${fmtDate(e.date)} · ${ctx.money(e.total)}`, okText: 'Sil', danger: true })) return;
              await ctx.store.removeEntry(e.id);
              toast('Silindi', { type: 'ok', action: { label: 'Geri al', onClick: async () => { await ctx.store.restoreEntry(e); toast('Geri alındı'); } } });
            },
          }, iconEl('trash')))));
  }

  function exportCsv() {
    const list = filtered();
    if (!list.length) return toast('Dışa aktarılacak kayıt yok', { type: 'err' });
    const header = ['Tarih', 'İşlem', 'Varlık', 'Miktar', 'Birim', 'Birim Fiyat (₺)', 'Tutar (₺)', 'Komisyon (₺)', 'Hesap', 'Not'];
    const rows = list.map((e) => {
      const a = ctx.catalog.get(e.assetId) || {};
      return [e.date, e.side === 'sell' ? 'Satış' : 'Alış', a.name || e.assetId,
        String(e.amount).replace('.', ','), a.unit || '',
        String(e.unitPrice).replace('.', ','), String(Math.abs(e.total)).replace('.', ','),
        String(e.fee || 0).replace('.', ','), e.account || '', e.note || ''];
    });
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    downloadFile(`portfoy-${todayISO()}.csv`, '\ufeff' + csv, 'text/csv;charset=utf-8');
    toast(`${list.length} kayıt dışa aktarıldı`, { type: 'ok' });
  }

  paintFilterInfo();
  paint();
}

/* ------------------------------ Yardımcılar ------------------------------- */
function iconEl(name) {
  const paths = {
    edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M14.5 6.5l3 3"/>',
    trash: '<path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = paths[name] || '';
  return svg;
}
