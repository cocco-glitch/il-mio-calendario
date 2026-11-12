// banca.js — Q0: converte i sorgenti delle schede (meta *.json + card *.js) nella banca domande dell'app.
// Uso: node banca.js <cartella di uscita>   →  banca-step-N.json (uno per step) + indice-banca.json
// Formato: docs/banca-domande.md nel repo dell'app.
const fs = require('fs'), vm = require('vm'), path = require('path');
const OUT = process.argv[2]; if (!OUT) { console.error('uso: node banca.js <uscita>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const norm = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
const MAT = { Chimica: 'C', Biologia: 'B', Fisica: 'F' };
const banche = {}; let nq = 0, nimg = 0; const avvisi = [];
for (const f of fs.readdirSync('.').filter(f => /^[a-z]?\d*\.json$|^n\d+\.json$|^[bcf]\d+\.json$/.test(f)).sort()) {
  let m; try { m = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
  if (!m.out || !m.data) continue;
  const mm = /^(\d+)\.(\d+)\.(\d+)\S*\s.*\(scheda (\d+) di (\d+)\)\.html$/.exec(m.out);
  const mat = MAT[(m.eyebrow || '').split(' ')[0]];
  if (!mm || !mat) { avvisi.push('saltato ' + f + ': ' + m.out); continue; }
  const micro = mm[1] + '.' + mm[2] + '.' + mm[3], k = +mm[4], step = mm[1];
  const sk = mat + '-' + micro + '-' + k;
  const c = { console }; vm.createContext(c);
  try { for (const d of m.data) vm.runInContext(fs.readFileSync(d, 'utf8'), c, { filename: d }); }
  catch (e) { avvisi.push('errore ' + f + ': ' + e.message); continue; }
  if (!c.q || !c.q.questions) { avvisi.push('senza domande ' + f); continue; }
  const B = banche[step] || (banche[step] = { formato: 'banca-domande', versione: 1, step: +step, aggiornato: new Date().toISOString().slice(0, 10), schede: {}, immagini: {}, domande: [] });
  B.schede[sk] = { titolo: m.h1, materia: mat, microstep: micro, k, n: +mm[5], fonti: m.src, focus: m.focus, file: m.out };
  const visti = new Set();
  c.q.questions.forEach((q, i) => {
    let id = 'q-' + hash(sk + '|' + norm(q.q));
    if (visti.has(id)) id += '-' + i; visti.add(id);
    const d = { id, sk, t: q.t, lv: q.lv, q: q.q };
    if (q.t === 'mcq') { d.o = q.o; if (q.c !== 0) avvisi.push(sk + ' domanda ' + (i + 1) + ': c=' + q.c); }
    else { d.a = q.a; d.show = q.show; }
    d.e = q.e; if (q.ew) d.ew = q.ew;
    if (q.r) d.r = q.r;
    const x = q.x || {};
    if (x.cit && x.cit.length) d.cit = x.cit.map(z => ({ t: z.t, f: z.f, l: z.l }));
    if (x.cl) d.cl = x.cl;
    if (q.img && q.img.length) d.img = q.img.map(g => {
      const svg = c.IMG && c.IMG[g.s]; if (!svg) { avvisi.push(sk + ': immagine mancante ' + g.s); return null; }
      const hid = 'i-' + hash(svg); if (!B.immagini[hid]) { B.immagini[hid] = svg; nimg++; }
      return { i: hid, cap: g.cap, f: g.f };
    }).filter(Boolean);
    B.domande.push(d); nq++;
  });
}
const indice = [];
for (const [s, B] of Object.entries(banche)) {
  const nome = 'banca-step-' + s + '.json'; fs.writeFileSync(path.join(OUT, nome), JSON.stringify(B));
  indice.push({ file: nome, step: +s, schede: Object.keys(B.schede).length, domande: B.domande.length, kb: Math.round(fs.statSync(path.join(OUT, nome)).size / 1024) });
}
fs.writeFileSync(path.join(OUT, 'indice-banca.json'), JSON.stringify(indice));
console.log(JSON.stringify(indice), 'domande', nq, 'immagini', nimg);
if (avvisi.length) console.log('AVVISI:\n' + avvisi.join('\n'));
