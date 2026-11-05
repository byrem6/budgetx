/* =========================================================================
   views/login.js — modern giriş ekranı
   Sabit kullanıcı: admin / admin
   ========================================================================= */

import { h } from '../util.js';

export function render(host, ctx) {
  host.hidden = false;
  host.innerHTML = '';

  const userInput = h('input', {
    class: 'input', type: 'text', autocomplete: 'username', autocapitalize: 'none',
    autocorrect: 'off', spellcheck: 'false', placeholder: 'admin', value: 'admin',
  });
  const passInput = h('input', {
    class: 'input', type: 'password', autocomplete: 'current-password', placeholder: '••••••',
  });
  const errorBox = h('div', { class: 'login-error' }, '');
  const submitBtn = h('button', { class: 'btn block', type: 'submit' }, 'Giriş Yap');

  const toggle = h('button', { class: 'pw-toggle', type: 'button', 'aria-label': 'Şifreyi göster' }, eyeIcon());
  toggle.addEventListener('click', () => {
    const show = passInput.type === 'password';
    passInput.type = show ? 'text' : 'password';
    toggle.innerHTML = '';
    toggle.append(show ? eyeOffIcon() : eyeIcon());
    passInput.focus();
  });

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorBox.textContent = '';
      const user = userInput.value.trim();
      const pass = passInput.value;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Kontrol ediliyor…';
      await new Promise((r) => setTimeout(r, 350));
      const res = ctx.auth.login(user, pass);
      if (!res.ok) {
        errorBox.textContent = res.error;
        form.classList.remove('shake');
        void form.offsetWidth;
        form.classList.add('shake');
        passInput.value = '';
        passInput.focus();
        submitBtn.disabled = false;
        submitBtn.textContent = 'Giriş Yap';
        return;
      }
      submitBtn.textContent = 'Hoş geldiniz!';
      await new Promise((r) => setTimeout(r, 250));
      ctx.auth.onSuccess();
    },
  },
    h('div', { class: 'field' },
      h('label', null, 'Kullanıcı adı'),
      h('div', { class: 'login-field' },
        h('span', { class: 'lead' }, userIcon()),
        userInput)),
    h('div', { class: 'field' },
      h('label', null, 'Şifre'),
      h('div', { class: 'login-field' },
        h('span', { class: 'lead' }, lockIcon()),
        passInput,
        toggle)),
    errorBox,
    submitBtn,
    h('div', { class: 'login-hint' },
      'Demo hesabı: ', h('b', null, 'admin'), ' / ', h('b', null, 'admin'),
      h('br'),
      'Veriler yalnızca bu cihazda saklanır.'));

  host.append(
    h('div', { class: 'login-hero' },
      h('div', { class: 'login-logo' }, logoIcon()),
      h('h1', null, 'Portföy'),
      h('p', null, 'Yatırım takip ve analiz')),
    h('div', { class: 'login-sheet' },
      h('h2', null, 'Giriş yap'),
      h('p', { class: 'login-lead' }, 'Devam etmek için hesabınıza giriş yapın.'),
      form));

  setTimeout(() => passInput.focus(), 250);
}

/* --------------------------------- İkonlar -------------------------------- */
function svg(inner, size = 20) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('width', size); el.setAttribute('height', size);
  el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.8'); el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
  el.innerHTML = inner;
  return el;
}
const userIcon = () => svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>');
const lockIcon = () => svg('<rect x="4.5" y="10" width="15" height="10" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>');
const eyeIcon = () => svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>');
const eyeOffIcon = () => svg('<path d="M4 4l16 16"/><path d="M9.5 6.1A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.4 8.2A16.8 16.8 0 0 0 2.5 12S6 18.5 12 18.5c1 0 1.9-.2 2.7-.5"/>');
const logoIcon = () => svg('<path d="M4 18.5 9 11l4 3.5L20 6" stroke="#fff" stroke-width="2.6"/>', 34);
