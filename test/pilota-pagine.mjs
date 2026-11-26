// test/pilota-pagine.mjs — misura del pilota (blocco 7): richiamo e precisione apparente di IndicePagine sulle pagine citate dalla banca.
// NON fa parte della suite: richiede un file locale con il testo dei libri (diritti d'autore: mai nel repository).
// Uso: node test/pilota-pagine.mjs <dati.json>
//   dati.json = { libri: { <libro>: [{ n, testo }] }, schede: [{ sk, libro, titolo, focus, gold: { <pagina>: <n. domande> } }] }
//   Per rifarlo con pdf.js (dubbio Codex S4 n. 1): libri da TestoPdf.tutte, gold dalle `cit` della banca (#page=N).
// Riferimento 26/11 (testo del connettore Drive, BIO Fasano + CHI Bettelheim, 72 schede): richiamo 93,1%, 12,2 pagine/scheda,
// precisione apparente 27,6%; controllo a mano di 30 pagine «in più»: 11 pertinenti → precisione stimata ≈ 54% (IC ~43–67%).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const ts = createRequire(import.meta.url)('typescript');
const tr = f => ts.transpileModule(fs.readFileSync(path.join(SRC, f), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const sb = { console }; vm.createContext(sb);
vm.runInContext(tr('07-locale.ts') + ';this.Locale=Locale;', sb);
vm.runInContext(tr('su-richiesta/07-indicepagine.ts') + ';this.IP=IndicePagine;', sb);
if (!process.argv[2]) { console.log('Uso: node test/pilota-pagine.mjs <dati.json>'); process.exit(2); }
const D = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), lingua = { radice: sb.Locale.radice, espandi: sb.Locale.espandi };
const ind = {}; for (const k in D.libri) ind[k] = sb.IP.costruisci(k, D.libri[k], lingua);
const FORTI = new Set(['trattazione', 'approfondimento', 'applicazione']);
let tot = 0, prese = 0, nForti = 0, complete = 0;
for (const s of D.schede) {
  const c = sb.IP.copertura(ind[s.libro], [s.titolo, s.focus], {});
  const forti = new Set(c.riscontri.filter(r => FORTI.has(r.classe)).map(r => r.n)), g = Object.keys(s.gold).map(Number);
  const k = g.filter(n => forti.has(n)).length; tot += g.length; prese += k; nForti += forti.size; if (k === g.length) complete++;
}
const pct = x => (100 * x).toFixed(1) + '%';
console.log('schede ' + D.schede.length + ' · richiamo ' + pct(prese / tot) + ' · schede con tutte le pagine ' + complete + ' · pagine per scheda ' + (nForti / D.schede.length).toFixed(1) + ' · precisione apparente ' + pct(prese / nForti) + ' (limite inferiore: il riferimento sono le sole pagine citate)');
