/* =========================================================================
   views/unlock.js — kasa kilidi ekranı (şifreli veriyi açma)
   ========================================================================= */

import { h } from '../util.js';

export function render(host, ctx) {
  host.hidden = false;
  host.innerHTML = '';

  const passInput = h('input', {
    class: 'input', type: 'password', placeholder: '••••••••',
    autocomplete: 'current-password', inputmode: 'text',
  });
  const errorBox = h('div', { class: 'login-error' }, '');
  const submitBtn = h('button', { class: 'btn block', type: 'submit' }, 'Kasayı Aç');

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorBox.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Çözülüyor…';
      await new Promise((r) => setTimeout(r, 250));
      try {
        await ctx.unlock(passInput.value);
        if (ctx.remember) {
          try { sessionStorage.setItem('portfoy.vaultkey', await ctx.sessionKey()); } catch { /* yoksay */ }
        }
        ctx.onSuccess();
      } catch (err) {
        errorBox.textContent = err.message || 'Şifre hatalı.';
        form.classList.remove('shake');
        void form.offsetWidth;
        form.classList.add('shake');
        passInput.value = '';
        passInput.focus();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Kasayı Aç';
      }
    },
  },
    h('div', { class: 'field' },
      h('label', null, 'Kasa şifresi'),
      h('div', { class: 'login-field' },
        h('span', { class: 'lead' }, lockIcon()),
        passInput)),
    errorBox,
    submitBtn,
    h('div', { class: 'login-hint' },
      'Verileriniz AES-256-GCM ile şifrelenerek saklanır. ' +
      'Şifre bu cihazda saklanmaz; doğru şifre olmadan veriler açılamaz.'));

  host.append(
    h('div', { class: 'login-hero' },
      h('div', { class: 'login-logo' }, lockIcon()),
      h('h1', null, 'Kasa Kilidi'),
      h('p', null, 'Verileriniz şifreli')),
    h('div', { class: 'login-sheet' },
      h('h2', null, 'Kasayı aç'),
      h('p', { class: 'login-lead' }, 'Devam etmek için kasa şifrenizi girin.'),
      form));

  setTimeout(() => passInput.focus(), 250);
}

function svg(inner, size = 20) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('width', size); el.setAttribute('height', size);
  el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.8'); el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
  el.innerHTML = inner;
  return el;
}
const lockIcon = () => svg('<rect x="4.5" y="10" width="15" height="10" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>', 34);
