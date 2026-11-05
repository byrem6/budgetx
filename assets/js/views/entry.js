/* =========================================================================
   views/entry.js — Veri Girişi (alış / satım kaydı)
   Mobil odaklı: tek ekran, az alan, büyük dokunma hedefleri, tuş takımı.
   ========================================================================= */

import { h, num, qty, parseNum, todayISO, fmtDate } from '../util.js';
import { assetDot, emptyState, toast, confirmDialog, openModal, closeModal, segmented } from '../ui.js';
import { attachKeypad, closeKeypad } from '../keypad.js';

export function render(root, ctx) {
  const catalog = ctx.catalog;
  const editingId = ctx.params?.id || null;
  const existing = editingId ? ctx.store.entry(editingId) : null;

  const state = {
    side: existing?.side || 'buy',
    assetId: existing?.assetId || ctx.params?.asset || firstAssetId(catalog),
    account: existing?.account || ctx.settings.accounts?.[0] || '',
    date: existing?.date || todayISO(),
    showExtra: false,
  };

  /* ------------------------------ Form parçaları --------------------------- */
  const amountInput = h('input', {
    class: 'input', type: 'text', placeholder: '0',
    inputmode: 'decimal', autocomplete: 'off', value: existing ? String(existing.amount) : '',
  });
  const priceInput = h('input', {
    class: 'input', type: 'text', placeholder: '0,00',
    inputmode: 'decimal', autocomplete: 'off', value: existing ? String(existing.unitPrice) : '',
  });
  const feeInput = h('input', {
    class: 'input', type: 'text', placeholder: '0,00',
    inputmode: 'decimal', autocomplete: 'off', value: existing && existing.fee ? String(existing.fee) : '',
  });
  const dateInput = h('input', { class: 'input', type: 'date', value: state.date });
  const accountInput = h('input', { class: 'input', type: 'text', maxlength: '40', placeholder: 'Örn. Banka', autocomplete: 'off', value: state.account });
  const noteInput = h('input', { class: 'input', type: 'text', maxlength: '300', placeholder: 'Not (isteğe bağlı)', autocomplete: 'off', value: existing?.note || '' });

  const totalValue = h('b', { style: { fontSize: '17px' } }, '–');
  const summaryLine = h('div', { class: 'hint' }, '');
  const errorBox = h('div', { class: 'hint err', style: { minHeight: '20px' } });
  const unitLabel = h('span', { class: 'suffix' }, '');

  /* ----------------------------- Varlık seçici ----------------------------- */
  const assetName = h('div', { class: 'ap-nm' }, '');
  const assetUnit = h('div', { class: 'ap-un' }, '');
  const assetDotBox = h('div', { class: 'ap-dot' }, '');
  const assetBtn = h('button', { class: 'asset-picker', type: 'button', onclick: pickAsset },
    assetDotBox, h('div', { class: 'sp' }, assetName, assetUnit),
    h('span', { class: 'ap-chev' }, chevron()));

  function paintAsset() {
    const a = catalog.get(state.assetId) || { name: state.assetId, short: '?', color: 'var(--text-3)', unit: '' };
    assetName.textContent = a.name;
    assetUnit.textContent = `${a.unit || 'adet'} · 1 birim = ${ctx.prices[state.assetId] ? ctx.money(ctx.prices[state.assetId]) : 'kur yok'}`;
    assetDotBox.textContent = a.short;
    assetDotBox.style.background = a.color;
    unitLabel.textContent = a.unit || '';
    priceLabel.textContent = `Birim fiyat (₺ / ${a.unit || 'adet'})`;
    amountLabel.textContent = `Miktar (${a.unit || 'adet'})`;
    paintSummary();
  }

  async function pickAsset() {
    const list = [...catalog.values()];
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Varlık ara…', autocomplete: 'off' });
    const box = h('div', { class: 'list', style: { margin: '0 -20px' } });
    const paint = (q = '') => {
      box.innerHTML = '';
      const items = list.filter((a) => !q || a.name.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));
      if (!items.length) { box.append(h('div', { class: 'empty-state' }, h('p', null, 'Sonuç yok'))); return; }
      for (const a of items) {
        box.append(h('button', {
          class: `pick-row ${a.id === state.assetId ? 'on' : ''}`, type: 'button',
          onclick: () => { closeModal(); state.assetId = a.id; paintAsset(); },
        },
          h('span', { class: 'ap-dot', style: { background: a.color } }, a.short),
          h('div', { class: 'sp' },
            h('div', { class: 'ap-nm' }, a.name),
            h('div', { class: 'ap-un' }, `${a.unit || 'adet'} · ${kindLabel(a.kind)}`)),
          a.id === state.assetId ? h('span', { style: { color: 'var(--brand)' } }, '✓') : null));
      }
    };
    paint();
    search.addEventListener('input', (e) => paint(e.target.value));
    const res = await openModal({ title: 'Varlık seç', body: h('div', null, search, h('div', { style: { height: '10px' } }), box) });
    if (res === null) return;
  }

  /* -------------------------------- Alanlar -------------------------------- */
  const sideSeg = segmented('side', [{ value: 'buy', label: 'Alış' }, { value: 'sell', label: 'Satış' }],
    state.side, (v) => {
      state.side = v;
      paintSummary();
    });

  const amountLabel = h('label', null, 'Miktar');
  const priceLabel = h('label', null, 'Birim fiyat (₺)');

  const steps = h('div', { class: 'row wrap', style: { marginTop: '8px', gap: '6px' } });
  const paintSteps = () => {
    const a = catalog.get(state.assetId);
    const list = a?.kind === 'metal' ? [0.1, 0.25, 0.5, 1, 5, 10]
      : a?.kind === 'crypto' ? [0.001, 0.01, 0.05, 0.1, 0.5, 1]
      : [1, 5, 10, 25, 50, 100];
    steps.innerHTML = '';
    for (const s of list) {
      steps.append(h('button', {
        class: 'chip', type: 'button',
        onclick: () => {
          const cur = parseNum(amountInput.value) || 0;
          amountInput.value = String(+(cur + s).toFixed(8));
          paintSummary();
        },
      }, `+${qty(s, 3)}`));
    }
  };

  const rateBtn = h('button', {
    class: 'btn subtle sm', type: 'button',
    onclick: () => {
      const p = ctx.prices[state.assetId];
      if (!p) return toast('Bu varlık için güncel kur yok', { type: 'err' });
      priceInput.value = String(+p.toFixed(4)).replace('.', ',');
      paintSummary();
      toast('Güncel kur uygulandı');
    },
  }, 'Güncel kur');

  /* ------------------------------ Hesaplama ------------------------------- */
  function paintSummary() {
    const a = catalog.get(state.assetId);
    const amount = parseNum(amountInput.value) || 0;
    const price = parseNum(priceInput.value) || 0;
    const fee = parseNum(feeInput.value) || 0;
    const total = state.side === 'buy' ? amount * price + fee : amount * price - fee;

    totalValue.textContent = total > 0 ? ctx.money(total) : '–';

    const pos = ctx.portfolio.positions.find((p) => p.id === state.assetId);
    if (pos) {
      const after = state.side === 'buy' ? pos.qty + amount : pos.qty - amount;
      let avgAfter = pos.avg;
      if (state.side === 'buy') {
        const q = pos.qty + amount;
        avgAfter = q > 0 ? (pos.cost + amount * price + fee) / q : 0;
      } else {
        const q = Math.max(0, pos.qty - amount);
        avgAfter = q > 0 ? pos.cost * (q / (pos.qty || 1)) : 0;
      }
      summaryLine.textContent = `Portföyde ${qty(pos.qty, a?.decimals ?? 2)} ${a?.unit || ''} → ${qty(after, a?.decimals ?? 2)} ${a?.unit || ''} · yeni ort. ${ctx.money(avgAfter)}`;
    } else {
      summaryLine.textContent = 'Bu varlık için henüz kayıt yok';
    }
  }

  /* ------------------------------ Ek ayarlar ------------------------------ */
  const extraBody = h('div', { class: 'acc-body', hidden: true },
    h('div', { class: 'field' },
      h('label', null, 'Komisyon / ücret (₺)'),
      h('div', { class: 'input-group' }, feeInput, h('span', { class: 'suffix' }, '₺'))),
    h('div', { class: 'field' },
      h('label', null, 'Tarih'),
      h('div', { class: 'row', style: { gap: '6px' } },
        dateInput,
        h('button', { class: 'btn subtle', type: 'button', onclick: () => { dateInput.value = todayISO(); dateInput.dispatchEvent(new Event('change')); } }, 'Bugün'))),
    h('div', { class: 'field' },
      h('label', null, 'Hesap / kurum'),
      accountInput,
      h('div', { class: 'row wrap', style: { marginTop: '8px', gap: '6px' } },
        ...(ctx.settings.accounts || []).map((acc) => h('button', {
          class: 'chip', type: 'button', onclick: () => { accountInput.value = acc; },
        }, acc)),
        h('button', {
          class: 'chip', type: 'button', onclick: async () => {
            const v = prompt('Yeni hesap / kurum adı');
            if (v && v.trim()) {
              const list = [...(ctx.settings.accounts || []), v.trim()];
              ctx.settings.accounts = list;
              await ctx.store.saveSettings({ accounts: list });
              accountInput.value = v.trim();
            }
          },
        }, '+ Ekle'))),
    h('div', { class: 'field' },
      h('label', null, 'Not'),
      noteInput));

  const accHead = h('button', { class: 'acc-head', type: 'button', onclick: () => {
    state.showExtra = !state.showExtra;
    extraBody.hidden = !state.showExtra;
    accHead.classList.toggle('open', state.showExtra);
  } }, chevron(), 'Ek ayarlar', h('span', { class: 'sp' }), extraBadge());

  function extraBadge() {
    const b = h('span', { class: 'hint' }, '');
    const paint = () => {
      const n = [feeInput.value, accountInput.value, noteInput.value].filter((v) => String(v || '').trim()).length;
      b.textContent = n ? `${n} alan dolduruldu` : '';
    };
    for (const inp of [feeInput, accountInput, noteInput]) inp.addEventListener('input', paint);
    paint();
    return b;
  }

  /* -------------------------------- Form ---------------------------------- */
  const form = h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', null, editingId ? 'Kaydı düzenle' : 'Yeni işlem'),
      h('span', { class: 'sp' }),
      editingId ? h('button', {
        class: 'btn ghost sm', type: 'button', onclick: async () => {
          if (await confirmDialog({ title: 'Kaydı sil', message: 'Bu işlem kalıcı olarak silinecek.', okText: 'Sil', danger: true })) {
            await ctx.store.removeEntry(editingId);
            toast('Kayıt silindi', { type: 'ok' });
            ctx.go('history');
          }
        },
      }, 'Sil') : null),
    h('div', { class: 'card-body' },
      h('div', { class: 'field' }, sideSeg),
      h('div', { class: 'field' },
        h('label', null, 'Varlık'),
        assetBtn),
      h('div', { class: 'field' },
        amountLabel,
        h('div', { class: 'input-group' }, amountInput, unitLabel),
        steps),
      h('div', { class: 'field' },
        h('div', { class: 'row' }, priceLabel, h('span', { class: 'sp' }), rateBtn),
        h('div', { class: 'input-group' }, priceInput, h('span', { class: 'suffix' }, '₺'))),
      h('div', { style: { borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '12px 0', marginTop: '4px' } },
        h('div', { class: 'row' },
          h('span', { style: { color: 'var(--text-2)', fontWeight: '600' } }, 'Toplam tutar'),
          h('span', { class: 'sp' }),
          totalValue),
        summaryLine),
      accHead,
      extraBody,
      errorBox));
  root.append(form);

  if (editingId) {
    root.append(h('button', {
      class: 'btn subtle', type: 'button', style: { width: '100%' },
      onclick: async () => {
        if (await confirmDialog({ title: 'Düzenlemeyi iptal et?', message: 'Değişiklikler kaydedilmeden kapatılacak.', okText: 'İptal et' })) ctx.go('entry');
      },
    }, 'Vazgeç'));
  }

  /* -------------------------- Sabit alt eylem çubuğu ----------------------- */
  document.body.classList.add('has-action-bar');
  document.body.appendChild(h('div', { class: 'action-bar' },
    h('button', { class: 'btn', type: 'button', onclick: () => save() },
      editingId ? 'Değişiklikleri kaydet' : 'Kaydet'),
    h('button', { class: 'btn subtle', type: 'button', onclick: () => save({ keepOpen: true }) }, 'Yeni ekle')));

  /* ------------------------------ Olaylar --------------------------------- */
  for (const inp of [amountInput, priceInput, feeInput]) inp.addEventListener('input', paintSummary);
  attachKeypad(amountInput, { label: 'Miktar', decimals: catalog.get(state.assetId)?.decimals ?? 3 });
  attachKeypad(priceInput, { label: 'Birim fiyat (₺)', decimals: 4 });
  attachKeypad(feeInput, { label: 'Komisyon (₺)', decimals: 2 });

  paintAsset();
  paintSteps();

  async function save({ keepOpen = false } = {}) {
    closeKeypad();
    const amount = parseNum(amountInput.value);
    const price = parseNum(priceInput.value);
    const fee = parseNum(feeInput.value) || 0;
    const date = dateInput.value;

    if (!(amount > 0)) { errorBox.textContent = 'Miktar giriniz.'; return; }
    if (!(price >= 0)) { errorBox.textContent = 'Birim fiyat giriniz.'; return; }
    if (!date) { errorBox.textContent = 'Tarih seçiniz.'; return; }
    errorBox.textContent = '';

    const payload = {
      date, assetId: state.assetId, side: state.side,
      amount, unitPrice: price, fee,
      account: accountInput.value.trim(), note: noteInput.value.trim(),
    };

    try {
      if (editingId) {
        await ctx.store.updateEntry(editingId, payload);
        toast('Kayıt güncellendi', { type: 'ok' });
        ctx.go('history');
      } else {
        await ctx.store.addEntry(payload);
        toast(state.side === 'buy' ? 'Alış kaydedildi' : 'Satış kaydedildi', { type: 'ok' });
        if (keepOpen) {
          amountInput.value = ''; priceInput.value = ''; feeInput.value = ''; noteInput.value = '';
          paintSummary();
        } else {
          ctx.go('dashboard');
        }
      }
    } catch (e) {
      errorBox.textContent = e.message || 'Kaydedilemedi';
    }
  }
}

/* ------------------------------ Yardımcılar ------------------------------- */
function chevron() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = '<path d="M9 6l6 6-6 6"/>';
  return svg;
}
function kindLabel(kind) {
  return { metal: 'Metal', fiat: 'Döviz', crypto: 'Kripto', cash: 'Nakit', manual: 'Manuel' }[kind] || kind;
}
function firstAssetId(catalog) {
  for (const id of ['XAU', 'USD', 'EUR']) if (catalog.has(id)) return id;
  return catalog.keys().next().value;
}
