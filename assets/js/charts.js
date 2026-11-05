/* =========================================================================
   charts.js — bağımlılıksız SVG grafikler (Fluent görünüm)
   ========================================================================= */

import { num, money, fmtMonth } from './util.js';

const escAttr = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------- Halka (donut) ---------------------------- */
export function donut(segments, { size = 148, thickness = 20 } = {}) {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (!total) {
    return `<svg class="chart" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Dağılım yok">
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--border-strong)" stroke-width="${thickness}"/></svg>`;
  }
  let offset = 0;
  const arcs = segments.filter((s) => s.value > 0).map((s) => {
    const frac = s.value / total;
    const dash = `${(frac * circ).toFixed(2)} ${(circ - frac * circ).toFixed(2)}`;
    const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thickness}"
      stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(2)}" stroke-linecap="butt">
      <title>${escAttr(s.label)}: %${num(frac * 100, 1)}</title></circle>`;
    offset += frac * circ;
    return el;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Varlık dağılımı">
    ${arcs}<circle cx="${c}" cy="${c}" r="${r - thickness / 2 - 1}" fill="none"/></svg>`;
}

/* --------------------------- Alan (değer) grafiği -------------------------- */
/**
 * @param {Array} series [{label, value, cost}]  (zaman sırası)
 */
export function areaChart(series, { width = 640, height = 240, currency = 'TRY' } = {}) {
  if (!series.length) return '<div class="empty-state"><p>Grafik için veri yok</p></div>';
  const padL = 52, padR = 12, padT = 14, padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(...series.map((s) => Math.max(s.value || 0, s.cost || 0)), 1);
  const min = 0;
  const x = (i) => padL + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
  const y = (v) => padT + innerH - ((v - min) / (max - min || 1)) * innerH;

  const path = (key) => series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s[key] || 0).toFixed(1)}`).join(' ');
  const area = `${path('value')} L${x(series.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  const gridCount = 4;
  const grid = Array.from({ length: gridCount + 1 }, (_, i) => {
    const v = (max / gridCount) * i;
    const yy = y(v);
    return `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${width - padR}" y2="${yy.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
      <text x="${padL - 7}" y="${(yy + 3.5).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--text-3)">${money(v, currency, 0)}</text>`;
  }).join('');

  const step = Math.max(1, Math.ceil(series.length / Math.max(3, Math.floor(innerW / 82))));
  const xLabels = series.map((s, i) => (i % step === 0 || i === series.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${height - 8}" font-size="10" text-anchor="middle" fill="var(--text-3)">${fmtMonth(s.label)}</text>`
    : '').join('');

  const hits = series.map((s, i) => {
    const w = innerW / Math.max(1, series.length - 1 || 1);
    return `<rect x="${(x(i) - w / 2).toFixed(1)}" y="${padT}" width="${w.toFixed(1)}" height="${innerH}"
      fill="transparent" data-tip="${escAttr(`${fmtMonth(s.label)} · Değer ${money(s.value || 0, currency)} · Maliyet ${money(s.cost || 0, currency)}`)}"/>`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Portföy değeri grafiği">
    <defs>
      <linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.30"/>
        <stop offset="100%" stop-color="var(--brand)" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#gradArea)"/>
    <path d="${path('cost')}" fill="none" stroke="var(--text-3)" stroke-width="1.6" stroke-dasharray="4 3"/>
    <path d="${path('value')}" fill="none" stroke="var(--brand)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${xLabels}${hits}
  </svg>`;
}

/* ------------------------------ Sütun grafiği ----------------------------- */
export function barChart(items, { width = 640, height = 200, currency = 'TRY', color = 'var(--brand)' } = {}) {
  if (!items.length) return '<div class="empty-state"><p>Grafik için veri yok</p></div>';
  const padL = 52, padR = 10, padT = 18, padB = 24;
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  const slot = innerW / items.length;
  const bw = Math.min(38, slot * 0.62);

  const gridCount = 3;
  const grid = Array.from({ length: gridCount + 1 }, (_, i) => {
    const v = (max / gridCount) * i;
    const yy = padT + innerH - (v / max) * innerH;
    return `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${width - padR}" y2="${yy.toFixed(1)}" stroke="var(--border)"/>
      <text x="${padL - 7}" y="${(yy + 3.5).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--text-3)">${money(v, currency, 0)}</text>`;
  }).join('');

  const labelStep = Math.max(1, Math.ceil(items.length / Math.max(3, Math.floor(innerW / 62))));
  const bars = items.map((it, i) => {
    const h = Math.max(0, (Math.abs(it.value) / max) * innerH);
    const bx = padL + slot * i + (slot - bw) / 2;
    const by = padT + innerH - h;
    const c = it.color || color;
    const showVal = h > 16 && items.length <= 14;
    const showLabel = i % labelStep === 0;
    return `<g data-tip="${escAttr(`${it.label}: ${money(it.value, currency)}`)}">
      <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${c}"/>
      ${showVal ? `<text x="${(bx + bw / 2).toFixed(1)}" y="${(by - 5).toFixed(1)}" font-size="9" text-anchor="middle" fill="var(--text-2)">${money(it.value, currency, 0)}</text>` : ''}
      ${showLabel ? `<text x="${(bx + bw / 2).toFixed(1)}" y="${height - 8}" font-size="10" text-anchor="middle" fill="var(--text-3)">${it.label}</text>` : ''}
    </g>`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Aylık hareket grafiği">${grid}${bars}</svg>`;
}

/* ------------------------------- Sparkline -------------------------------- */
export function sparkline(values, { width = 120, height = 30, color = 'var(--brand)' } = {}) {
  const vals = values.filter((v) => Number.isFinite(v));
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="height:${height}px">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/* ----------------------- Araç ipucu (tooltip) bağlama --------------------- */
export function initChartTooltips(root) {
  if (root.__tipReady) return;
  root.__tipReady = true;
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  root.style.position = root.style.position || 'relative';
  root.appendChild(tip);

  const show = (target, x, y) => {
    tip.textContent = target.dataset.tip;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    tip.classList.add('on');
  };
  root.addEventListener('pointermove', (e) => {
    const t = e.target.closest('[data-tip]');
    if (!t) { tip.classList.remove('on'); return; }
    const rect = root.getBoundingClientRect();
    show(t, e.clientX - rect.left, e.clientY - rect.top);
  });
  root.addEventListener('pointerleave', () => tip.classList.remove('on'));
}

/* ------------------- Duyarlı grafik kapsayıcısı (yeniden boyut) ---------- */
/**
 * Kapsayıcının gerçek genişliğine göre SVG üretir ve pencere yeniden
 * boyutlandırıldığında yeniden çizer.
 * @param {HTMLElement} host
 * @param {(width:number,height:number)=>string} builder
 * @returns {Function} yeniden çizim fonksiyonu
 */
export function responsiveChart(host, builder, height = 260) {
  let raf = 0;
  const draw = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const w = Math.max(280, Math.round(host.clientWidth || 600));
      host.innerHTML = builder(w, height);
      initChartTooltips(host);
    });
  };
  draw();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => draw());
    ro.observe(host);
  } else {
    window.addEventListener('resize', draw);
  }
  return draw;
}
