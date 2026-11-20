// test/profiliai.mjs — v0.64 «Qualsiasi AI»: profili delle piattaforme, parti k/N, mix dei tipi per archetipo, tetto del testo del PDF.
// Carica src/su-richiesta/07-profiliai.ts in una sandbox vm, transpilato al volo con typescript (mai dist/).
// Uso: node test/profiliai.mjs   (codice di uscita 1 se qualcosa fallisce; ultima riga «Profili N/N»)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(QUI, '..', 'src');
const ts = createRequire(import.meta.url)('typescript');

let ok = 0, ko = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nome); }
  catch (e) { ko++; console.log('  ✗ ' + nome + ' — ' + (e && e.message)); }
}
function eq(a, b, m) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((m || 'atteso') + ': ' + y + ', ottenuto ' + x); }

const sorgente = fs.readFileSync(path.join(SRC, 'su-richiesta', '07-profiliai.ts'), 'utf8');
const js = ts.transpileModule(sorgente, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const sb = { console };
vm.createContext(sb);
vm.runInContext(js + "\n;this.ProfiliAI = typeof ProfiliAI !== 'undefined' ? ProfiliAI : undefined;", sb);
const P = sb.ProfiliAI;
const copia = x => JSON.parse(JSON.stringify(x));

console.log('parti k/N');
t('18 domande, 6 per risposta → 3 parti contigue', () => {
  eq(copia(P.parti(18, 6)), [{ k: 1, N: 3, da: 1, a: 6 }, { k: 2, N: 3, da: 7, a: 12 }, { k: 3, N: 3, da: 13, a: 18 }]);
});
t('19 domande, 6 per risposta → 4 parti, l\'ultima con la sola 19', () => {
  const p = copia(P.parti(19, 6));
  eq(p.length, 4); eq(p[3], { k: 4, N: 4, da: 19, a: 19 });
});
t('0 domande → nessuna parte', () => eq(copia(P.parti(0, 6)), []));
t('perRisposta 0 o non numerico (profilo personalizzato vuoto) → una parte sola', () => {
  eq(copia(P.parti(5, 0)), [{ k: 1, N: 1, da: 1, a: 5 }]);
  eq(copia(P.parti(5, NaN)), [{ k: 1, N: 1, da: 1, a: 5 }]);
});

console.log('mix dei tipi');
t('scienze_sperimentali, 20 domande → 14 mcq, 3 completamento, 3 ordinamento', () => {
  eq(copia(P.mix('scienze_sperimentali', false, 20)), { mcq: 14, completamento: 3, ordinamento: 3, aperta: 0, codice: 0 });
});
t('stem_calcolo, 18 → resti maggiori: 11 mcq, 4 completamento, 3 ordinamento', () => {
  eq(copia(P.mix('stem_calcolo', false, 18)), { mcq: 11, completamento: 4, ordinamento: 3, aperta: 0, codice: 0 });
});
t('umanistico_storico, 18 → a resti pari vince l\'ordine dei tipi: 9/2/2/5/0', () => {
  eq(copia(P.mix('umanistico_storico', false, 18)), { mcq: 9, completamento: 2, ordinamento: 2, aperta: 5, codice: 0 });
});
t('proprietario (Medicina), qualsiasi archetipo → solo mcq', () => {
  eq(copia(P.mix('informatica_coding', true, 18)), { mcq: 18, completamento: 0, ordinamento: 0, aperta: 0, codice: 0 });
});
t('archetipo sconosciuto o assente → solo mcq (come quiz-v3)', () => {
  eq(copia(P.mix('', false, 7)), { mcq: 7, completamento: 0, ordinamento: 0, aperta: 0, codice: 0 });
});

console.log('tetto del testo');
const PAG = [{ n: 54, testo: 'aaaa' }, { n: 55, testo: 'bbbb' }, { n: 56, testo: 'cccc' }];
t('max 10 su pagine da 4 caratteri → taglia a fine pagina: 2 pagine, 8 caratteri, 1 esclusa', () => {
  const r = copia(P.tetto(PAG, 10));
  eq(r.pagine.map(p => p.n), [54, 55]); eq(r.caratteri, 8); eq(r.escluse, 1);
});
t('max 0 → nessun tetto: tutte le pagine', () => {
  const r = copia(P.tetto(PAG, 0));
  eq(r.pagine.length, 3); eq(r.caratteri, 12); eq(r.escluse, 0);
});
t('pagina scansionata (vuota) → non inclusa né esclusa, contata a parte', () => {
  const r = copia(P.tetto([{ n: 54, testo: 'aaaa' }, { n: 55, testo: '', vuota: true }, { n: 56, testo: 'cccc' }], 8));
  eq(r.pagine.map(p => p.n), [54, 56]); eq(r.escluse, 0); eq(r.vuote, 1);
});

console.log('preset');
const riga = p => [p.contesto, p.file, p.json, p.perRisposta, p.maxCaratteri];
t('i 6 profili della spec, nell\'ordine del selettore', () => eq(copia(P.PRESET.map(p => p.id)), ['gemini', 'chatgpt', 'claude', 'copilot', 'locale', 'personalizzato']));
t('gemini, chatgpt, claude: grande, file sì, json alta, 18, nessun tetto', () => {
  for (const id of ['gemini', 'chatgpt', 'claude']) eq(riga(P.preset(id)), ['grande', true, 'alta', 18, 0], id);
});
t('copilot: medio, file no, json media, 10, 40 000', () => eq(riga(P.preset('copilot')), ['medio', false, 'media', 10, 40000]));
t('locale: piccolo, file no, json bassa, 6, 12 000', () => eq(riga(P.preset('locale')), ['piccolo', false, 'bassa', 6, 12000]));
t('personalizzato parte dai valori di copilot', () => eq(riga(P.preset('personalizzato')), riga(P.preset('copilot'))));
t('preset() restituisce una copia: modificarla non cambia il preset', () => {
  const p = P.preset('locale'); p.perRisposta = 99; eq(P.preset('locale').perRisposta, 6);
});
t('id sconosciuto → gemini (il comportamento di v0.63)', () => eq(P.preset('boh').id, 'gemini'));

console.log('== pagine (T4: testo PDF per intervallo) ==');
t('pagine da..a in ordine; testo assente o solo spazi → vuota:true; poi tetto le conta a parte', () => {
  const testi = new Map([[11, '  testo 11 '], [12, '   '], [14, 'testo 14']]);
  const pg = copia(P.pagine(testi, 11, 14));
  eq(pg, [{ n: 11, testo: 'testo 11' }, { n: 12, testo: '', vuota: true }, { n: 13, testo: '', vuota: true }, { n: 14, testo: 'testo 14' }]);
  eq(copia(P.tetto(pg, 0)).vuote, 2);
});
t('intervallo rovesciato o vuoto → nessuna pagina', () => { eq(copia(P.pagine(new Map(), 5, 4)), []); eq(copia(P.pagine(new Map(), 0, 0)), []); });

console.log('== sequenza dei tipi (T5) ==');
t('umanistico 18 → posizioni 1–9 mcq, 10–11 completamento, 12–13 ordinamento, 14–18 aperta', () => {
  const q = copia(P.sequenza(P.mix('umanistico_storico', false, 18)));
  eq(q.length, 18); eq(q[8], 'mcq'); eq(q[9], 'completamento'); eq(q[11], 'ordinamento'); eq(q[13], 'aperta'); eq(q[17], 'aperta');
});

console.log((ko ? '✗ ' : '') + 'Profili ' + ok + '/' + (ok + ko));
process.exit(ko ? 1 : 0);
