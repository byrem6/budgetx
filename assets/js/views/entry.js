/* =========================================================================
   views/entry.js — Veri Girişi (alım / satım kaydı)
   ========================================================================= */

import { h, num, qty, parseNum, todayISO, fmtDate, uid } from '../util.js';
import { assetDot, emptyState, field, messageBar, segmented, toast, confirmDialog } from '../ui.js';

export function render(root, ctx) {
  const catalog = ctx.catalog;
  const state = {
    editingId: ctx.params?.id || null,
    side: 'buy',
    assetId: ctx.params?.asset || firstAssetId(catalog),
    amount: '', unitPrice: '', fee: '', date: todayISO(),
    account: ctx.settings.accounts?.[0] || '',
    note: '',
    bulk: false,
  };

  const existing = state.editingId ? ctx.store.entry(state.editingId) : null;
  if (existing) {
    state.side = existing.side; state.assetId = existing.assetId;
    state.amount = String(existing.amount); state.unitPrice = String(existing.unitPrice);
    state.fee = String(existing.fee || ''); state.date = existing.date;
    state.account = existing.account; state.note = existing.note;
  }

  /* --------------------------- Varlık seçici ----------------------------- */
  const assetGrid = h('div', { class: 'chips' });
  let unitLabelEl = null;
  const paintAssets = () => {
    assetGrid.innerHTML = '';
    for (const a of catalog.values()) {
      const btn = h('button', {
        class: `chip ${a.id === state.assetId ? 'on' : ''}`,
        type: 'button',
        onclick: () => { state.assetId = a.id; paintAssets(); paintSummary(); },
      }, h('span', { class: 'dot', style: { background: a.color } }), a.name);
      assetGrid.append(btn);
    }
    if (unitLabelEl) unitLabelEl.textContent = catalog.get(state.assetId)?.unit || '';
  };
  paintAssets();

  /* ------------------------------ Form parçaları --------------------------- */
  const amountInput = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: '0', autocomplete: 'off' });
  const priceInput = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: '0,00', autocomplete: 'off' });
  const feeInput = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: '0,00', autocomplete: 'off' });
  const dateInput = h('input', { class: 'input', type: 'date', value: state.date });
  const accountInput = h('input', { class: 'input', type: 'text', maxlength: '40', placeholder: 'Örn. Banka', autocomplete: 'off', value: state.account });
  const noteInput = h('input', { class: 'input', type: 'text', maxlength: '300', placeholder: 'Örn. maaş birikimi', autocomplete: 'off', value: state.note });

  const totalValueEl = h('div', { class: 'kpi-value' }, '–');
  const totalBox = h('div', { class: 'kpi', style: { background: 'var(--surface-alt)', boxShadow: 'none' } },
    h('div', { class: 'kpi-label' }, 'Toplam tutar'),
    totalValueEl);
  const unitBox = h('div', { class: 'hint', id: 'eUnit' }, 'Birim fiyat: –');
  const summaryBox = h('div', { id: 'eSummary' });
  const errorBox = h('div', { class: 'hint err', style: { minHeight: '18px' } });

  const sideSeg = segmented('side', [{ value: 'buy', label: 'Alış' }, { value: 'sell', label: 'Satış' }],
    state.side, (v) => {
      state.side = v;
      sideSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.val === v));
      paintSummary();
    });
  if (state.side === 'sell') {
    sideSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.val === 'sell'));
  }

  const amountLabel = h('label', null, 'Miktar');
  const priceLabel = h('label', null, 'Birim fiyat (₺)');

  const stepper = h('div', { class: 'row', style: { marginTop: '6px', flexWrap: 'wrap' } });
  const paintSteps = () => {
    const a = catalog.get(state.assetId);
    const steps = a?.kind === 'metal' ? [0.1, 0.25, 0.5, 1, 5, 10]
      : a?.kind === 'crypto' ? [0.001, 0.01, 0.05, 0.1, 0.5, 1]
      : [1, 5, 10, 25, 50, 100];
    stepper.innerHTML = '';
    for (const s of steps) {
      stepper.append(h('button', {
        class: 'chip', type: 'button',
        onclick: () => {
          const cur = parseNum(amountInput.value) || 0;
          amountInput.value = String(+(cur + s).toFixed(8));
          paintSummary();
        },
      }, `+${qty(s, 3)}`));
    }
  };
  paintSteps();

  const useRateBtn = h('button', { class: 'btn subtle sm', type: 'button', onclick: () => {
    const p = ctx.prices[state.assetId];
    if (!p) return toast('Bu varlık için güncel kur yok', { type: 'err' });
    priceInput.value = String(+p.toFixed(6));
    paintSummary();
    toast('Güncel kur uygulandı');
  } }, 'Güncel kur');

  /* ------------------------------- Hesaplama ------------------------------- */
  function paintSummary() {
    const a = catalog.get(state.assetId);
    const amount = parseNum(amountInput.value) || 0;
    const price = parseNum(priceInput.value) || 0;
    const fee = parseNum(feeInput.value) || 0;
    const total = state.side === 'buy' ? amount * price + fee : amount * price - fee;

    amountLabel.textContent = `Miktar (${a?.unit || 'adet'})`;
    priceLabel.textContent = `Birim fiyat (₺ / ${a?.unit || 'adet'})`;

    totalValueEl.textContent = total > 0 ? ctx.money(total) : '–';
    unitBox.textContent = amount > 0 && price > 0
      ? `Birim fiyat: ${num(price, 4)} ₺ / ${a?.unit || ''}  ·  ${qty(amount, a?.decimals ?? 2)} ${a?.unit || ''} toplam ${ctx.money(amount * price)}`
      : 'Birim fiyat: –';

    // Portföy özeti
    const pos = ctx.portfolio.positions.find((p) => p.id === state.assetId);
    const after = pos ? (state.side === 'buy' ? pos.qty + amount : pos.qty - amount) : (state.side === 'buy' ? amount : -amount);
    const avgAfter = (() => {
      if (!pos) return price;
      const curCost = pos.cost, curQty = pos.qty;
      if (state.side === 'buy') {
        const q = curQty + amount, c = curCost + amount * price + fee;
        return q > 0 ? c / q : 0;
      }
      const q = Math.max(0, curQty - amount);
      const c = curCost * (q / (curQty || 1));
      return q > 0 ? c / q : 0;
    })();
    summaryBox.innerHTML = '';
    summaryBox.append(h('div', { class: 'card', style: { boxShadow: 'none', background: 'var(--surface-alt)' } },
      h('div', { class: 'card-body' },
        h('div', { class: 'kpi-label', style: { marginBottom: '8px' } }, `${a?.name || ''} portföy özeti`),
        h('div', { class: 'grid-2' },
          kv('Mevcut miktar', pos ? `${qty(pos.qty, a?.decimals ?? 2)} ${a?.unit || ''}` : '–'),
          kv('İşlem sonrası', `${qty(after, a?.decimals ?? 2)} ${a?.unit || ''}`),
          kv('Ortalama maliyet', ctx.money(pos?.avg || 0)),
          kv('Yeni ortalama', ctx.money(avgAfter))),
        pos && pos.price
          ? h('div', { class: 'hint', style: { marginTop: '8px' } }, `Güncel fiyat ${ctx.money(pos.price)} · portföy değeri ${ctx.money(pos.value ?? pos.cost)}`)
          : h('div', { class: 'hint', style: { marginTop: '8px' } }, 'Bu varlık için güncel kur alınamadı.'))));
  }

  /* -------------------------------- Form ---------------------------------- */
  const form = h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', null, state.editingId ? 'Kaydı düzenle' : 'Yeni işlem'),
      h('span', { class: 'sp' }),
      state.editingId ? h('button', {
        class: 'btn subtle sm', onclick: async () => {
          if (await confirmDialog({ title: 'Düzenlemeyi iptal et?', message: 'Kayıt değişiklikleri kaydedilmadan kapatılacak.', okText: 'İptal et' })) {
            ctx.go('entry');
          }
        },
      }, 'Vazgeç') : null),
    h('div', { class: 'card-body' },
      h('div', { class: 'field' }, h('label', null, 'İşlem türü'), sideSeg),
      h('div', { class: 'field' }, h('label', null, 'Varlık'), assetGrid),
      h('div', { class: 'field' },
        h('label', null, 'Miktar'),
        h('div', { class: 'input-group' }, amountInput, (unitLabelEl = h('span', { class: 'suffix' }, catalog.get(state.assetId)?.unit || ''))),
        stepper),
      h('div', { class: 'field' },
        h('div', { class: 'row' }, priceLabel, h('span', { class: 'sp' }), useRateBtn),
        h('div', { class: 'input-group' }, priceInput, h('span', { class: 'suffix' }, '₺')),
        unitBox),
      h('div', { class: 'grid-2' },
        h('div', { class: 'field' }, h('label', null, 'Komisyon / ücret'), h('div', { class: 'input-group' }, feeInput, h('span', { class: 'suffix' }, '₺'))),
        h('div', { class: 'field' }, h('label', null, 'Tarih'), dateInput)),
      h('div', { class: 'field' }, h('label', null, 'Hesap / kurum'), accountInput,
        (() => {
          const chips = h('div', { class: 'chips', style: { marginTop: '6px' } });
          for (const acc of (ctx.settings.accounts || [])) {
            chips.append(h('button', { class: 'chip', type: 'button', onclick: () => { accountInput.value = acc; } }, acc));
          }
          chips.append(h('button', { class: 'chip', type: 'button', onclick: () => {
            const v = prompt('Yeni hesap / kurum adı');
            if (v && v.trim()) {
              const list = [...(ctx.settings.accounts || []), v.trim()];
              ctx.settings.accounts = list;
              ctx.store.saveSettings({ accounts: list });
              accountInput.value = v.trim();
              toast('Hesap eklendi');
            }
          } }, '+ Hesap ekle'));
          return chips;
        })()),
      h('div', { class: 'field' }, h('label', null, 'Not (isteğe bağlı)'), noteInput),
      totalBox,
      h('div', { style: { marginTop: '12px' } }, summaryBox),
      errorBox));
  root.append(form);

  /* ---------------------- Sabit alt eylem çubuğu (mobil) -------------------- */
  document.body.classList.add('has-action-bar');
  const actionBar = h('div', { class: 'action-bar' },
    h('button', { class: 'btn', onclick: () => save() },
      state.editingId ? 'Değişiklikleri kaydet' : 'Kaydet'),
    h('button', { class: 'btn subtle', onclick: () => save({ keepOpen: true }) },
      state.editingId ? 'Kaydet ve kapat' : 'Yeni ekle'));
  document.body.appendChild(actionBar);

  if (state.editingId) {
    root.append(h('div', { class: 'row' },
      h('button', {
        class: 'btn danger', style: { flex: '1' }, onclick: async () => {
          if (!await confirmDialog({ title: 'Kayıt silinsin mi?', message: 'Bu işlem kalıcı olarak silinecek.', okText: 'Sil', danger: true })) return;
          await ctx.store.removeEntry(state.editingId);
          toast('Kayıt silindi', { type: 'ok' });
          ctx.go('history');
        },
      }, 'Kaydı sil')));
  }

  /* ------------------------------ Olaylar --------------------------------- */
  for (const inp of [amountInput, priceInput, feeInput]) inp.addEventListener('input', paintSummary);
  dateInput.addEventListener('change', () => { state.date = dateInput.value; });
  amountInput.addEventListener('input', () => { state.amount = amountInput.value; });
  priceInput.addEventListener('input', () => { state.unitPrice = priceInput.value; });

  async function save({ keepOpen = false } = {}) {
    const amount = parseNum(amountInput.value);
    const price = parseNum(priceInput.value);
    const fee = parseNum(feeInput.value) || 0;
    const date = dateInput.value;

    if (!(amount > 0)) { errorBox.textContent = 'Geçerli bir miktar girin.'; amountInput.classList.add('invalid'); return; }
    if (!(price >= 0)) { errorBox.textContent = 'Geçerli bir birim fiyat girin.'; priceInput.classList.add('invalid'); return; }
    if (!date) { errorBox.textContent = 'Tarih seçin.'; return; }
    errorBox.textContent = '';
    amountInput.classList.remove('invalid');
    priceInput.classList.remove('invalid');

    const payload = {
      date, assetId: state.assetId, side: state.side,
      amount, unitPrice: price, fee,
      account: accountInput.value.trim(), note: noteInput.value.trim(),
    };

    try {
      if (state.editingId) {
        await ctx.store.updateEntry(state.editingId, payload);
        toast('Kayıt güncellendi', { type: 'ok' });
        ctx.go('history');
      } else {
        await ctx.store.addEntry(payload);
        toast(`${state.side === 'buy' ? 'Alış' : 'Satış'} kaydedildi`, { type: 'ok' });
        if (keepOpen) {
          amountInput.value = ''; priceInput.value = ''; feeInput.value = ''; noteInput.value = '';
          paintSummary();
          amountInput.focus();
        } else {
          ctx.go('dashboard');
        }
      }
    } catch (e) {
      errorBox.textContent = e.message || 'Kaydedilemedi';
    }
  }

  // Başlangıç değerlerini forma yaz
  amountInput.value = state.amount;
  priceInput.value = state.unitPrice;
  feeInput.value = state.fee;
  noteInput.value = state.note;
  accountInput.value = state.account;
  paintSummary();
}

/* ------------------------------ Yardımcılar ------------------------------- */
function kv(label, value) {
  return h('div', null, h('div', { class: 'hint' }, label), h('div', { style: { fontWeight: '600' } }, value));
}
function firstAssetId(catalog) {
  for (const id of ['XAU', 'USD', 'EUR']) if (catalog.has(id)) return id;
  return catalog.keys().next().value;
}
