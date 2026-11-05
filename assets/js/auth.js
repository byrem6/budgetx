/* =========================================================================
   auth.js — sabit kullanıcı ile yerel oturum yönetimi
   Not: İstemci tarafı bir uygulamadır; bu kilit cihazı başkasına karşı
   korur, sunucu tabanlı kimlik doğrulama değildir.
   ========================================================================= */

const KEY = 'portfoy.session';
const USER = 'admin';
const PASS = 'admin';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;   // 30 gün

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export const auth = {
  /** Oturum geçerli mi? */
  isActive() {
    const s = read();
    return !!s && s.user === USER && (Date.now() - (s.at || 0)) < MAX_AGE;
  },
  /** Giriş denemesi */
  login(user, pass) {
    if (user === USER && pass === PASS) {
      try { localStorage.setItem(KEY, JSON.stringify({ user: USER, at: Date.now() })); } catch { /* yoksay */ }
      return { ok: true };
    }
    return { ok: false, error: 'Kullanıcı adı veya şifre hatalı.' };
  },
  /** Çıkış */
  logout() {
    try { localStorage.removeItem(KEY); } catch { /* yoksay */ }
  },
  user: USER,
};
