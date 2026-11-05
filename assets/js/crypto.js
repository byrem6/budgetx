/* =========================================================================
   crypto.js — Web Crypto ile şifreleme (AES-GCM 256 + PBKDF2-SHA256)
   Veriler hem yerel depoda hem de Gist'te şifreli (AES-256-GCM) saklanır.
   ========================================================================= */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const cryptoAvailable = () => !!(globalThis.crypto && globalThis.crypto.subtle);

/* ------------------------------ Base64 (yol bağımsız) -------------------- */
export function toB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
export function fromB64(str) {
  const bin = atob(String(str || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const randomSalt = () => toB64(crypto.getRandomValues(new Uint8Array(16)));

/* ------------------------------ Anahtar türetme ------------------------- */
const ITERATIONS = 210000;

/**
 * Parola + tuzdan AES-GCM anahtarı türetir.
 * @param {string} passphrase
 * @param {string} saltB64
 * @param {number} iterations
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(passphrase, saltB64, iterations = ITERATIONS) {
  if (!cryptoAvailable()) throw new Error('Bu tarayıcıda şifreleme desteklenmiyor (güvenli bağlam gerekir).');
  const salt = fromB64(saltB64);
  const base = await crypto.subtle.importKey('raw', enc.encode(String(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

/** Anahtarı sessionStorage'da saklamak için dışa aktarım */
export async function exportKey(key) {
  return toB64(await crypto.subtle.exportKey('raw', key));
}
export async function importKey(b64) {
  return crypto.subtle.importKey('raw', fromB64(b64), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/* ------------------------------ Şifreleme -------------------------------- */
export async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), data: toB64(data) };
}

export async function decryptJSON(key, envelope) {
  const iv = fromB64(envelope.iv);
  const data = fromB64(envelope.data);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(dec.decode(plain));
}

/** Kısa parola gücü tahmini (0-4) */
export function passwordStrength(pw) {
  const s = String(pw || '');
  if (!s) return 0;
  let score = 0;
  if (s.length >= 8) score++;
  if (s.length >= 12) score++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score++;
  if (/\d/.test(s)) score++;
  if (/[^A-Za-z0-9]/.test(s)) score++;
  return Math.min(4, score);
}
