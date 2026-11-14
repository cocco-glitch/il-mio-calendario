// Build senza dipendenze: `node build.mjs`
// 1) tsc compila src/*.ts in build-tmp/ (controllo dei tipi compreso)
// 2) i .js vengono concatenati in ordine di nome in dist/app.js
// 3) public/ viene copiata in dist/ (il sito da pubblicare)
// 4) dist/anteprima.html = tutto in un solo file (per provarla senza hosting)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, cpSync } from 'node:fs';

const qui = new URL('.', import.meta.url).pathname;
process.chdir(qui);
rmSync('build-tmp', { recursive: true, force: true });
rmSync('dist', { recursive: true, force: true });
execSync('tsc -p tsconfig.json', { stdio: 'inherit' });

const js = readdirSync('build-tmp').filter(f => f.endsWith('.js')).sort()
  .map(f => readFileSync('build-tmp/' + f, 'utf8')).join('\n');
const app = '"use strict";\n' + js.replace(/^"use strict";\n/gm, '');

mkdirSync('dist');
cpSync('public', 'dist', { recursive: true });
writeFileSync('dist/app.js', app);
const versione = Date.now().toString(36);
writeFileSync('dist/sw.js', readFileSync('public/sw.js', 'utf8').replace('__VERSIONE__', versione));
writeFileSync('dist/.nojekyll', '');
execSync('node studio/genera.mjs', { stdio: 'inherit' });
cpSync('studio/pacchetti', 'dist/studio', { recursive: true });
cpSync('studio/banca', 'dist/studio/banca', { recursive: true }); // v0.22: banca domande (Quiz Studio)
// v0.37: una banca per materia (l'app scarica solo quella della scheda aperta)
for (const f of readdirSync('studio/banca').filter(f => /^banca-step-\d+\.json$/.test(f))) {
  const b = JSON.parse(readFileSync('studio/banca/' + f, 'utf8'));
  for (const m of ['C', 'B', 'F']) {
    const schede = Object.fromEntries(Object.entries(b.schede).filter(([k]) => k.startsWith(m + '-')));
    if (!Object.keys(schede).length) continue;
    const domande = b.domande.filter(d => d.sk.startsWith(m + '-'));
    const usate = new Set(domande.flatMap(d => (d.img || []).map(i => i.i)));
    const immagini = Object.fromEntries(Object.entries(b.immagini || {}).filter(([k]) => usate.has(k)));
    writeFileSync('dist/studio/banca/' + f.replace('.json', '-' + m + '.json'), JSON.stringify({ ...b, schede, domande, immagini }));
  }
}

// Anteprima in un solo file: niente manifest/service worker.
const html = readFileSync('public/index.html', 'utf8')
  .replace(/<!--PWA-->[\s\S]*?<!--\/PWA-->\n/, '')
  .replace('<link rel="stylesheet" href="style.css">', () => '<style>\n' + readFileSync('public/style.css', 'utf8') + '</style>')
  .replace('<script src="app.js"></script>', () => '<script>\n' + app.replace(/<\/script/g, '<\\/script') + '</script>');
writeFileSync('dist/anteprima.html', html);
rmSync('build-tmp', { recursive: true, force: true });
console.log('OK: dist/ pronta (cache ' + versione + ', app.js ' + Math.round(app.length / 1024) + ' kB)');
