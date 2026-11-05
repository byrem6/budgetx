/* =========================================================================
   tools/ship.js — tek komutla commit + push
   Kullanım: npm run ship "mesajınız"
   ========================================================================= */
const { execSync } = require('child_process');

const msg = process.argv.slice(2).join(' ').trim();
if (!msg) {
  console.error('Kullanım: npm run ship "commit mesajı"');
  process.exit(1);
}

const run = (cmd) => {
  execSync(cmd, { stdio: 'inherit' });
};

try {
  run('git add -A');
  const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
  if (!status) {
    console.log('Değişiklik yok — commit atlanıyor.');
  } else {
    run(`git commit -m "${msg.replace(/"/g, '\\"')}"`);
  }
  run('git push origin main');
  console.log('\n✔ Tamamlandı: değişiklikler GitHub\'a gönderildi.');
  console.log('  Yayın adresi: https://byrem6.github.io/budgetx/');
} catch (e) {
  console.error('\n✘ Git işlemi başarısız:', e.message);
  process.exit(1);
}
