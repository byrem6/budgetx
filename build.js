/* =========================================================================
   build.js — GitHub Pages için statik site çıktısı üretir
   Kullanım: node build.js   ->  _site/ klasörü
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');

const FILES = ['index.html', 'manifest.webmanifest', 'sw.js', '.nojekyll', 'icon.svg'];
const DIRS = ['assets'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let count = 0;
for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, path.join(OUT, f));
  count++;
}
for (const d of DIRS) {
  const src = path.join(ROOT, d);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(OUT, d), { recursive: true });
  count++;
}

// Klasör yapısını doğrula
const required = ['index.html', 'manifest.webmanifest', 'sw.js', 'assets/css/app.css', 'assets/js/app.js'];
const missing = required.filter((r) => !fs.existsSync(path.join(OUT, r)));
if (missing.length) {
  console.error('Eksik dosyalar:', missing.join(', '));
  process.exit(1);
}

console.log(`Statik site hazır: ${path.relative(process.cwd(), OUT)}/ (${count} öğe)`);
