/* =========================================================================
   views/settings.js — Ayarlar
   ========================================================================= */

import { h, num, qty, downloadFile, todayISO, parseNum, debounce } from '../util.js';
import { toast, confirmDialog, openModal, messageBar, selectEl, segmented, switchBox, field, promptPassphrase } from '../ui.js';
import { ACCENT_COLORS, makeCustomAsset } from '../catalog.js';
import { keypadEnabled, setKeypadEnabled, attachKeypad } from '../keypad.js';
import { sync } from '../sync.js';

export function render(root, ctx) {
  const s = ctx.settings;

  /* ------------------------------- Görünüm -------------------------------- */
  root.append(card('Görünüm', 'Tema, para birimi ve biçim ayarları',
    h('div', { class: 'field' },
      h('label', null, 'Tema'),
      segmented('theme', [{ value: 'auto', label: 'Otomatik' }, { value: 'light', label: 'Açık' }, { value: 'dark', label: 'Koyu' }],
        s.theme || 'auto', (v) => { ctx.store.saveSettings({ theme: v }); ctx.applyTheme(v); toast('Tema güncellendi'); })),
    h('div', { class: 'field' },
      h('label', null, 'Görüntüleme para birimi'),
      selectEl([
        { value: 'TRY', label: '₺ Türk Lirası' },
        { value: 'USD', label: '$ Amerikan Doları' },
        { value: 'EUR', label: '€ Euro' },
        { value: 'GBP', label: '£ Sterlin' },
      ], s.currency || 'TRY', (v) => { ctx.store.saveSettings({ currency: v }); toast('Para birimi güncellendi'); ctx.refresh(); })),
    h('div', { class: 'field' },
      h('label', null, 'Altın primi (%)'),
      (() => {
        const inp = h('input', {
          class: 'input', type: 'text', inputmode: 'decimal', value: String(s.goldPremium ?? 0),
          oninput: (e) => {
            const v = parseNum(e.target.value) || 0;
            ctx.store.saveSettings({ goldPremium: v });
          },
          onchange: () => { toast('Altın primi kaydedildi'); ctx.refreshRates(true); },
        });
        attachKeypad(inp, { label: 'Altın primi (%)', decimals: 2 });
        return inp;
      })(),
      h('div', { class: 'hint' }, 'Yerel altın fiyatının uluslararası spot fiyata farkı. Gram altın fiyatını elle girmiyorsanız 0 bırakın.')),
    switchBox('Uygulama açılışında kurları otomatik yenile', s.autoRefresh !== false, (v) => ctx.store.saveSettings({ autoRefresh: v })),
    switchBox('Özel rakam tuş takımı (büyük tuşlar)', keypadEnabled(), (v) => {
      setKeypadEnabled(v);
      toast(v ? 'Rakam tuş takımı açıldı' : 'Rakam tuş takımı kapatıldı — sistem klavyesi kullanılacak');
      ctx.refresh();
    })));

  /* -------------------------------- Kurlar --------------------------------- */
  const rateRows = h('div', { class: 'table-wrap' });
  const rateCard = card('Kurlar', 'Güncel piyasa verileri ve elle giriş',
    h('div', { class: 'row wrap', style: { marginBottom: '12px' } },
      h('button', { class: 'btn subtle sm', onclick: () => ctx.refreshRates(true) }, 'Kurları yenile'),
      h('span', { class: 'hint' }, ctx.rateMeta?.at ? `Son güncelleme: ${new Date(ctx.rateMeta.at).toLocaleString('tr-TR')}` : 'Henüz güncellenmedi'),
      h('span', { class: 'sp' }),
      ctx.rateMeta?.sources?.length ? h('span', { class: 'pill info' }, ctx.rateMeta.sources.join(' · ')) : null),
    rateRows);
  root.append(rateCard);

  const saveRate = debounce(async (assetId, raw) => {
    const v = parseNum(raw);
    const rates = { ...(ctx.settings.rates || {}) };
    if (Number.isFinite(v) && v > 0) rates[assetId] = { price: v, at: new Date().toISOString() };
    else delete rates[assetId];
    await ctx.store.saveSettings({ rates });
    toast('Fiyat kaydedildi');
    ctx.refresh();
  }, 600);

  const rateTable = h('table', { class: 'grid' },
    h('thead', null, h('tr', null, h('th', null, 'Varlık'), h('th', { class: 'num' }, 'Güncel (₺)'), h('th', { class: 'num' }, 'Elle gir'))),
    h('tbody', null, [...ctx.catalog.values()].map((a) => {
      const inp = h('input', {
        class: 'input', type: 'text', inputmode: 'decimal',
        style: { maxWidth: '150px', marginLeft: 'auto', minHeight: '40px', fontSize: '15px' },
        placeholder: '—',
        value: s.rates?.[a.id] ? String(s.rates[a.id].price ?? s.rates[a.id]) : '',
        oninput: (e) => saveRate(a.id, e.target.value),
      });
      attachKeypad(inp, { label: `${a.name} fiyatı (₺)`, decimals: 4 });
      return h('tr', null,
        h('td', null, h('div', { class: 'row', style: { gap: '8px' } },
          h('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: a.color, display: 'inline-block' } }),
          a.name, h('span', { class: 'muted small' }, a.unit))),
        h('td', { class: 'num' }, ctx.prices[a.id] ? num(ctx.prices[a.id], a.decimals > 2 ? 4 : 2) : '–'),
        h('td', { class: 'num' }, inp));
    })));
  rateRows.append(rateTable);

  /* -------------------------------- Hedefler ------------------------------- */
  const targetList = h('div', { class: 'list' });
  const targetCard = card('Hedefler', 'Portföy hedeflerinizi takip edin',
    h('button', { class: 'btn subtle sm', onclick: addTarget }, '+ Hedef ekle'),
    targetList);
  root.append(targetCard);
  paintTargets();

  function paintTargets() {
    targetList.innerHTML = '';
    const list = ctx.settings.targets || [];
    if (!list.length) {
      targetList.append(h('div', { class: 'card-body' }, h('div', { class: 'hint' }, 'Henüz hedef tanımlanmamış.')));
      return;
    }
    for (const tg of list) {
      const asset = tg.assetId === '*' ? { name: 'Tüm portföy' } : ctx.catalog.get(tg.assetId) || { name: tg.assetId };
      targetList.append(h('div', { class: 'list-item' },
        h('div', { class: 'sp' },
          h('div', { class: 'title' }, asset.name),
          h('div', { class: 'meta' }, `Hedef ${ctx.money(tg.value)}`)),
        h('button', {
          class: 'icon-btn', title: 'Sil', onclick: async () => {
            if (!await confirmDialog({ title: 'Hedef silinsin mi?', message: asset.name, okText: 'Sil', danger: true })) return;
            const targets = (ctx.settings.targets || []).filter((x) => x.id !== tg.id);
            await ctx.store.saveSettings({ targets });
            ctx.settings.targets = targets;
            paintTargets();
          },
        }, trashIcon())));
    }
  }

  async function addTarget() {
    const assets = [['*', 'Tüm portföy'], ...[...ctx.catalog.values()].map((a) => [a.id, a.name])];
    let assetId = '*';
    let value = '';
    const body = h('div', null,
      h('div', { class: 'field' }, h('label', null, 'Varlık'),
        selectEl(assets.map(([v, l]) => ({ value: v, label: l })), assetId, (v) => { assetId = v; })),
      h('div', { class: 'field' }, h('label', null, 'Hedef tutar (₺)'),
        (() => {
          const inp = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: '0', oninput: (e) => { value = e.target.value; } });
          attachKeypad(inp, { label: 'Hedef tutar (₺)', decimals: 2 });
          return inp;
        })()),
      h('div', { class: 'hint' }, 'Hedefe ulaşıldığında Genel Bakış ekranında tamamlandı olarak gösterilir.'));
    const res = await openModal({
      title: 'Yeni hedef',
      body,
      actions: [{ label: 'Vazgeç', value: null, variant: 'subtle' }, { label: 'Kaydet', value: 'ok', variant: 'primary' }],
    });
    if (res !== 'ok') return;
    const v = parseNum(value);
    if (!(v > 0)) return toast('Geçerli bir tutar girin', { type: 'err' });
    const targets = [...(ctx.settings.targets || []), { id: 'tg' + Date.now().toString(36), assetId, value: v }];
    await ctx.store.saveSettings({ targets });
    ctx.settings.targets = targets;
    paintTargets();
    toast('Hedef eklendi', { type: 'ok' });
  }

  /* ---------------------------- Veri şifreleme ---------------------------- */
  const encStatus = h('div', { class: 'hint' }, ctx.store.isEncrypted()
    ? 'Veriler şifreli (AES-256-GCM) saklanıyor.'
    : 'Veriler cihazda düz metin olarak saklanıyor.');
  const pass1 = h('input', { class: 'input', type: 'password', placeholder: 'Yeni kasa şifresi', autocomplete: 'new-password' });
  const pass2 = h('input', { class: 'input', type: 'password', placeholder: 'Şifreyi tekrar girin', autocomplete: 'new-password' });

  root.append(card('Veri şifreleme', 'Kasa şifresiyle koruma',
    encStatus,
    h('div', { class: 'field' }, h('label', null, 'Kasa şifresi'), pass1),
    h('div', { class: 'field' }, h('label', null, 'Şifre tekrar'), pass2),
    h('div', { class: 'row wrap' },
      ctx.store.isEncrypted()
        ? h('button', { class: 'btn', onclick: () => changePass() }, 'Şifreyi değiştir')
        : h('button', { class: 'btn', onclick: () => enableEnc() }, 'Şifrelemeyi başlat'),
      ctx.store.isEncrypted()
        ? h('button', { class: 'btn subtle', onclick: () => disableEnc() }, 'Şifrelemeyi kaldır')
        : h('button', { class: 'btn subtle', onclick: () => adoptPass() }, 'Şifreyi bu cihazda gir'),
      h('span', { class: 'sp' }),
      ctx.store.isEncrypted()
        ? h('button', { class: 'btn subtle', onclick: () => ctx.syncNow() }, 'Bulutu senkronize et')
        : null),
    h('div', { class: 'hint', style: { marginTop: '10px' } },
      'AES-256-GCM + PBKDF2 (210.000 tur). Şifre hiçbir yere kaydedilmez; unutursanız ' +
      'veriler geri dönüşü olmayan şekilde kilitlenir. Bulut (Gist) verisi de aynı şifreyle ' +
      'şifrelenerek gönderilir.')));

  async function enableEnc() {
    const p1 = pass1.value, p2 = pass2.value;
    if (p1.length < 4) return toast('En az 4 karakterli şifre girin', { type: 'err' });
    if (p1 !== p2) return toast('Şifreler eşleşmiyor', { type: 'err' });
    try {
      await ctx.store.enableEncryption(p1);
      encStatus.textContent = 'Veriler şifreli (AES-256-GCM) saklanıyor.';
      toast('Şifreleme aktif', { type: 'ok' });
      ctx.refresh();
    } catch (e) { toast(e.message, { type: 'err' }); }
  }

  async function changePass() {
    const p1 = pass1.value, p2 = pass2.value;
    if (p1.length < 4) return toast('En az 4 karakterli şifre girin', { type: 'err' });
    if (p1 !== p2) return toast('Şifreler eşleşmiyor', { type: 'err' });
    try {
      await ctx.store.changePassphrase(p1);
      encStatus.textContent = 'Veriler şifreli (AES-256-GCM) saklanıyor.';
      toast('Şifre güncellendi', { type: 'ok' });
      pass1.value = pass2.value = '';
      ctx.refresh();
    } catch (e) { toast(e.message, { type: 'err' }); }
  }

  /** Başka bir cihazda kullanılan kasa şifresini bu cihazda da etkinleştir */
  async function adoptPass() {
    const pw = await promptPassphrase({
      title: 'Kasa şifresi',
      message: 'Bulut verisi bu şifreyle şifrelendi. Aynı şifreyi girerek bu cihazda da şifrelemeyi etkinleştirin.',
    });
    if (!pw) return;
    try {
      await ctx.store.enableEncryption(pw);
      encStatus.textContent = 'Veriler şifreli (AES-256-GCM) saklanıyor.';
      toast('Bu cihaz da şifrelendi', { type: 'ok' });
      await ctx.syncNow();
      ctx.refresh();
    } catch (e) { toast(e.message, { type: 'err' }); }
  }

  async function disableEnc() {
    if (!await confirmDialog({
      title: 'Şifreleme kaldırılsın mı?',
      message: 'Veriler cihazda düz metin olarak saklanacak. Bulut verisi de düz metne dönüşür.',
      okText: 'Kaldır', danger: true,
    })) return;
    await ctx.store.disableEncryption();
    encStatus.textContent = 'Veriler cihazda düz metin olarak saklanıyor.';
    toast('Şifreleme kaldırıldı');
    ctx.refresh();
  }

  /* ---------------------------- Bulut senkronizasyonu --------------------- */
  const syncStatus = h('div', { class: 'hint' }, syncStateText());
  const gistInput = h('input', { class: 'input', type: 'text', placeholder: 'Gist ID (URL içindeki son kısım)', value: s.sync?.gistId || '' });
  const tokenInput = h('input', { class: 'input', type: 'password', placeholder: 'ghp_… (gist yetkili jeton)', value: s.sync?.token || '' });

  root.append(card('Bulut senkronizasyonu', 'Verileriniz tüm cihazlarda aynı olsun',
    h('div', { class: 'hint', style: { marginBottom: '12px' } },
      'Veriler bir GitHub Gist içinde tutulur. Her cihazda aynı veri görünür; ' +
      'tarayıcı değişse bile kayıtlarınız kaybolmaz. ' +
      (ctx.store.isEncrypted()
        ? 'Şifreleme etkin olduğu için gönderilen veriler AES-256-GCM ile şifrelenir; Gist herkese açık olsa bile içerik okunamaz. '
        : 'Gist herkese açıksa okuma jeton gerektirmez; yazma için “gist” yetkili bir kişisel erişim jetonu gerekir. ' +
          'Şifreleme etkinse gönderilen veriler şifrelenir.')),
    h('div', { class: 'field' },
      h('label', null, 'Gist ID'),
      gistInput),
    h('div', { class: 'field' },
      h('label', null, 'Erişim jetonu (isteğe bağlı — yazmak için)'),
      tokenInput,
      h('div', { class: 'hint' }, 'GitHub → Settings → Developer settings → Personal access tokens → “gist” yetkisi. Jeton yalnızca bu cihazda saklanır.')),
    h('div', { class: 'row wrap', style: { marginBottom: '10px' } },
      h('button', { class: 'btn subtle', onclick: () => doTest() }, 'Bağlantıyı test et'),
      h('button', { class: 'btn subtle', onclick: () => doCreate() }, 'Bulut verisi oluştur'),
      h('button', { class: 'btn', onclick: () => doSave() }, 'Kaydet ve senkronize et')),
    syncStatus));

  function syncStateText() {
    const st = sync.status;
    if (st.state === 'syncing') return 'Senkronize ediliyor…';
    if (st.state === 'error') return `Hata: ${st.error}`;
    const last = s.sync?.lastSync;
    if (last) return `Son senkronizasyon: ${new Date(last).toLocaleString('tr-TR')}`;
    return 'Henüz senkronizasyon yapılmadı.';
  }

  async function doTest() {
    syncStatus.textContent = 'Bağlantı test ediliyor…';
    try {
      const res = await sync.test(tokenInput.value, gistInput.value);
      syncStatus.textContent = res.message;
      toast(res.message, { type: 'ok' });
      if (res.gistId) gistInput.value = res.gistId;
    } catch (e) {
      syncStatus.textContent = `Hata: ${e.message}`;
      toast(e.message, { type: 'err' });
    }
  }

  async function doCreate() {
    syncStatus.textContent = 'Bulut veri deposu oluşturuluyor…';
    try {
      const id = await sync.createShared(tokenInput.value.trim());
      gistInput.value = id;
      syncStatus.textContent = `Bulut veri deposu oluşturuldu: ${id}`;
      toast('Bulut veri deposu oluşturuldu', { type: 'ok' });
    } catch (e) {
      syncStatus.textContent = `Hata: ${e.message}`;
      toast(e.message, { type: 'err' });
    }
  }

  async function doSave() {
    const gistId = gistInput.value.trim();
    const token = tokenInput.value.trim();
    await ctx.store.saveSettings({ sync: { gistId, token, auto: true, lastSync: s.sync?.lastSync } });
    ctx.settings.sync = { gistId, token, auto: true, lastSync: s.sync?.lastSync };
    syncStatus.textContent = 'Senkronize ediliyor…';
    const res = await ctx.syncNow();
    syncStatus.textContent = res.ok ? `${res.message} · ${res.count ?? 0} kayıt` : `Hata: ${res.message}`;
    toast(res.message, { type: res.ok ? 'ok' : 'err' });
  }

  /* ------------------------------ Hesaplar -------------------------------- */
  const accList = h('div', { class: 'chips' });
  const accCard = card('Hesaplar / kurumlar', 'İşlemlerde kullanılacak etiketler',
    h('button', { class: 'btn subtle sm', onclick: addAccount }, '+ Ekle'), accList);
  root.append(accCard);
  paintAccounts();

  function paintAccounts() {
    accList.innerHTML = '';
    for (const acc of ctx.settings.accounts || []) {
      accList.append(h('span', { class: 'chip on' }, acc,
        h('span', {
          style: { cursor: 'pointer', opacity: '.75', marginLeft: '4px' },
          onclick: async () => {
            if (!await confirmDialog({ title: 'Hesap silinsin mi?', message: acc, okText: 'Sil', danger: true })) return;
            const accounts = (ctx.settings.accounts || []).filter((x) => x !== acc);
            await ctx.store.saveSettings({ accounts });
            ctx.settings.accounts = accounts;
            paintAccounts();
          },
        }, '✕')));
    }
  }
  async function addAccount() {
    const v = prompt('Hesap / kurum adı');
    if (!v || !v.trim()) return;
    const accounts = [...(ctx.settings.accounts || []), v.trim()];
    await ctx.store.saveSettings({ accounts });
    ctx.settings.accounts = accounts;
    paintAccounts();
  }

  /* ------------------------------- Varlıklar ------------------------------- */
  const assetList = h('div', { class: 'list' });
  root.append(card('Varlıklar', 'Portföyde takip edilen varlıklar',
    h('button', { class: 'btn subtle sm', onclick: addAsset }, '+ Varlık ekle'), assetList));
  paintAssets();

  function paintAssets() {
    assetList.innerHTML = '';
    for (const a of ctx.catalog.values()) {
      assetList.append(h('div', { class: 'list-item' },
        h('span', { class: 'dot', style: { background: a.color } }, a.short),
        h('div', { class: 'sp' },
          h('div', { class: 'title' }, a.name),
          h('div', { class: 'meta' }, `${kindLabel(a.kind)} · ${a.unit || '—'}`)),
        a.builtin
          ? h('button', { class: 'btn subtle sm', onclick: () => toggleHidden(a) }, 'Gizle')
          : h('div', { class: 'row', style: { gap: '4px' } },
            h('button', { class: 'btn subtle sm', onclick: () => editAsset(a) }, 'Düzenle'),
            h('button', { class: 'btn subtle sm', onclick: () => removeCustom(a) }, 'Sil'))));
    }
  }
  async function toggleHidden(a) {
    const hidden = [...(ctx.settings.hiddenAssets || [])];
    const i = hidden.indexOf(a.id);
    if (i >= 0) hidden.splice(i, 1); else hidden.push(a.id);
    await ctx.store.saveSettings({ hiddenAssets: hidden });
    ctx.settings.hiddenAssets = hidden;
    toast(`${a.name} ${i >= 0 ? 'gösterildi' : 'gizlendi'}`);
    ctx.refresh();
  }
  async function removeCustom(a) {
    if (!await confirmDialog({ title: 'Varlık silinsin mi?', message: `${a.name} — mevcut işlemler etkilenmez.`, okText: 'Sil', danger: true })) return;
    const assets = (ctx.settings.assets || []).filter((x) => x.id !== a.id);
    await ctx.store.saveSettings({ assets });
    ctx.settings.assets = assets;
    toast('Varlık silindi');
    ctx.refresh();
  }
  async function editAsset(a) {
    let name = a.name, unit = a.unit || '', color = a.color;
    const body = h('div', null,
      h('div', { class: 'field' }, h('label', null, 'Ad'), h('input', { class: 'input', value: name, oninput: (e) => { name = e.target.value; } })),
      h('div', { class: 'field' }, h('label', null, 'Birim'), h('input', { class: 'input', value: unit, oninput: (e) => { unit = e.target.value; } })),
      h('div', { class: 'field' }, h('label', null, 'Renk'),
        h('div', { class: 'row wrap' }, ACCENT_COLORS.map((c) => h('button', {
          class: 'chip', type: 'button', style: { background: c, width: '28px', height: '28px', padding: '0', borderRadius: '50%' },
          onclick: (e) => { color = c; e.target.parentElement.querySelectorAll('.chip').forEach((x) => (x.style.outline = '')); e.target.style.outline = '2px solid var(--text)'; },
        })))));
    const res = await openModal({ title: 'Varlığı düzenle', body, actions: [{ label: 'Vazgeç', value: null, variant: 'subtle' }, { label: 'Kaydet', value: 'ok' }] });
    if (res !== 'ok') return;
    const assets = (ctx.settings.assets || []).map((x) => (x.id === a.id ? { ...x, name: name.trim() || x.name, unit: unit.trim(), color } : x));
    await ctx.store.saveSettings({ assets });
    ctx.settings.assets = assets;
    toast('Varlık güncellendi');
    ctx.refresh();
  }
  async function addAsset() {
    let name = '', unit = 'adet', kind = 'manual', color = ACCENT_COLORS[0], currency = '', cgId = '';
    const kindSel = selectEl([
      { value: 'manual', label: 'Manuel (elle fiyat)' },
      { value: 'fiat', label: 'Döviz (otomatik kur)' },
      { value: 'crypto', label: 'Kripto (otomatik kur)' },
    ], kind, (v) => { kind = v; extra.style.display = v === 'fiat' || v === 'crypto' ? '' : 'none'; });
    const extra = h('div', { style: { display: 'none' } },
      h('div', { class: 'field' }, h('label', null, 'Döviz kodu'), h('input', { class: 'input', placeholder: 'AUD, CAD, PLN…', oninput: (e) => { currency = e.target.value; } })),
      h('div', { class: 'field' }, h('label', null, 'CoinGecko kimliği'), h('input', { class: 'input', placeholder: 'dogecoin, cardano…', oninput: (e) => { cgId = e.target.value; } })));
    const body = h('div', null,
      h('div', { class: 'field' }, h('label', null, 'Varlık adı'), h('input', { class: 'input', placeholder: 'Örn. Avustralya Doları', oninput: (e) => { name = e.target.value; } })),
      h('div', { class: 'field' }, h('label', null, 'Tür'), kindSel),
      extra,
      h('div', { class: 'field' }, h('label', null, 'Birim'), h('input', { class: 'input', value: unit, oninput: (e) => { unit = e.target.value; } })),
      h('div', { class: 'field' }, h('label', null, 'Renk'),
        h('div', { class: 'row wrap' }, ACCENT_COLORS.map((c) => h('button', {
          class: 'chip', type: 'button', style: { background: c, width: '28px', height: '28px', padding: '0', borderRadius: '50%' },
          onclick: (e) => { color = c; e.target.parentElement.querySelectorAll('.chip').forEach((x) => (x.style.outline = '')); e.target.style.outline = '2px solid var(--text)'; },
        })))));
    const res = await openModal({ title: 'Yeni varlık', body, actions: [{ label: 'Vazgeç', value: null, variant: 'subtle' }, { label: 'Ekle', value: 'ok' }] });
    if (res !== 'ok') return;
    if (!name.trim()) return toast('Varlık adı gerekli', { type: 'err' });
    const a = makeCustomAsset({ name: name.trim(), kind, unit: unit.trim(), color, currency: currency.trim(), cgId: cgId.trim() });
    const assets = [...(ctx.settings.assets || []), a];
    await ctx.store.saveSettings({ assets });
    ctx.settings.assets = assets;
    toast('Varlık eklendi', { type: 'ok' });
    ctx.refresh();
  }

  /* --------------------------------- Veri ---------------------------------- */
  root.append(card('Veri', 'Yedekleme, geri yükleme ve sıfırlama',
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn subtle', onclick: () => {
        downloadFile(`portfoy-yedek-${todayISO()}.json`, ctx.store.exportData(), 'application/json');
        toast('Yedek indirildi', { type: 'ok' });
      } }, 'JSON yedeği indir'),
      h('button', { class: 'btn subtle', onclick: importData }, 'Yedekten geri yükle'),
      h('span', { class: 'sp' }),
      h('button', { class: 'btn danger', onclick: clearAll }, 'Tüm verileri sil'))));

  function importData() {
    const input = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const n = await ctx.store.importData(text);
        toast(`${n} kayıt geri yüklendi`, { type: 'ok' });
        ctx.refresh();
      } catch (e) {
        toast('Yedek okunamadı: ' + e.message, { type: 'err' });
      }
    });
    document.body.append(input);
    input.click();
    input.remove();
  }

  async function clearAll() {
    if (!await confirmDialog({
      title: 'Tüm veriler silinsin mi?',
      message: 'Tüm işlem kayıtları ve ayarlar kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      okText: 'Evet, sil', danger: true,
    })) return;
    await ctx.store.clearAll();
    await ctx.store.saveSettings({ targets: [], accounts: ['Banka', 'Hesap'] });
    toast('Tüm veriler silindi', { type: 'ok' });
    ctx.refresh();
  }

  /* -------------------------------- Güvenlik ------------------------------- */
  root.append(card('Gizlilik', 'Uygulama kilidi (isteğe bağlı)',
    h('div', { class: 'hint', style: { marginBottom: '10px' } },
      'Tüm veriler yalnızca bu cihazda saklanır. Kilit, cihazınızı açan biri için ek güvenlik sağlar.'),
    h('div', { class: 'row wrap' },
      s.pin
        ? h('button', { class: 'btn subtle', onclick: removePin }, 'Kilidi kaldır')
        : h('button', { class: 'btn subtle', onclick: setPin }, '4 haneli PIN belirle'))));

  async function setPin() {
    const val = h('input', { class: 'input', type: 'password', inputmode: 'numeric', maxlength: '4', placeholder: '••••' });
    const body = h('div', null, h('div', { class: 'field' }, h('label', null, 'PIN (4 hane)'), val),
      h('div', { class: 'hint' }, 'PIN unutursanız veriler cihazda kalır ve yedek dosyası ile geri yükleyebilirsiniz.'));
    const res = await openModal({ title: 'Uygulama kilidi', body, actions: [{ label: 'Vazgeç', value: null, variant: 'subtle' }, { label: 'Kaydet', value: 'ok' }] });
    if (res !== 'ok') return;
    const pin = val.value.trim();
    if (!/^\d{4}$/.test(pin)) return toast('4 haneli rakam girin', { type: 'err' });
    const hash = await sha256(pin);
    await ctx.store.saveSettings({ pin: hash });
    toast('Kilid aktif', { type: 'ok' });
    ctx.refresh();
  }
  async function removePin() {
    if (!await confirmDialog({ title: 'Kilit kaldırılsın mı?', message: 'Uygulama açılışında PIN sorulmayacak.', okText: 'Kaldır', danger: true })) return;
    await ctx.store.saveSettings({ pin: null });
    toast('Kilit kaldırıldı');
    ctx.refresh();
  }

  /* -------------------------------- Hakkında ------------------------------- */
  root.append(card('Hakkında', null,
    h('div', { class: 'hint' },
      'Portföy · Yatırım Takibi v2.0 — Microsoft Fluent tasarım diliyle hazırlandı. '
      + 'Veriler tarayıcınızın yerel deposunda tutulur; hiçbir sunucuya gönderilmez. '
      + 'GitHub Pages üzerinden çalışır, çevrimdışı kullanılabilir.'),
    h('div', { class: 'hint', style: { marginTop: '8px' } },
      `Depolama: ${ctx.store.mode === 'idb' ? 'IndexedDB' : 'localStorage'} · ${ctx.store.entries().length} kayıt`)));
}

/* ------------------------------ Yardımcılar ------------------------------- */
function card(title, subtitle, ...body) {
  const c = h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', null, title),
      subtitle ? h('span', { class: 'sub' }, subtitle) : null,
      h('span', { class: 'sp' })),
    h('div', { class: 'card-body' }, ...body));
  return c;
}
function kindLabel(kind) {
  return { metal: 'Metal', fiat: 'Döviz', crypto: 'Kripto', cash: 'Nakit', manual: 'Manuel' }[kind] || kind;
}
function trashIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16'); svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = '<path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/>';
  return svg;
}
export async function sha256(text) {
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return 'fallback:' + h;
}
