// test/centro.mjs — v0.63 «Centro di creazione»: test del modulo puro src/su-richiesta/07-centro.ts.
// Carica 01-json.ts, 07-sezionispiegazione.ts, l'import (07-importadrive*.ts) e src/su-richiesta/*.ts senza le UI in una sandbox vm,
// transpilati al volo con typescript (mai dist/): la chiusura costruita dall'app deve passare per la stessa pipeline dell'import.
// Uso: node test/centro.mjs   (codice di uscita 1 se qualcosa fallisce; ultima riga «Centro N/N»)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(QUI, '..', 'src');
const FIX = path.join(QUI, 'fixture-ai');
const leggi = f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n');
const fix = f => fs.readFileSync(path.join(FIX, f), 'utf8').replace(/\r\n/g, '\n');
const ts = createRequire(import.meta.url)('typescript');

let ok = 0, ko = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nome); }
  catch (e) { ko++; console.log('  ✗ ' + nome + ' — ' + (e && e.message)); }
}
function eq(a, b, m) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((m || 'atteso') + ': ' + y + ', ottenuto ' + x); }
function vero(c, m) { if (!c) throw new Error(m || 'condizione falsa'); }

// ---------- sandbox ----------
const UI = new Set(['07-strumentiquiz.ts', '07-centroui.ts']);
const SU = fs.readdirSync(path.join(SRC, 'su-richiesta')).filter(f => f.endsWith('.ts') && !UI.has(f)).sort().map(f => 'su-richiesta/' + f);
const FILE = ['01-json.ts', '07-sezionispiegazione.ts', '07-importadrive-parti.ts', '07-importadrive.ts', ...SU];
const js = FILE.map(f => ts.transpileModule(leggi(f), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText).join('\n');
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const sb = { console, ymd, oggi: () => new Date(), materiaDi: k => { const m = /^([A-Z]+)/.exec(k || ''); return m ? m[1] : ''; } };
vm.createContext(sb);
const ESPORTA = ['ImportaParti', 'ImportaDrive', 'Contratto', 'Centro'];
vm.runInContext(js + '\n;' + ESPORTA.map(n => 'this.' + n + ' = typeof ' + n + " !== 'undefined' ? " + n + ' : undefined;').join(' '), sb);
const { Contratto: C, ImportaParti: IP, ImportaDrive: ID } = sb;
const CE = sb.Centro || new Proxy({}, { get: (_, k) => () => { throw new Error('Centro.' + String(k) + ' non esiste ancora'); } });

// ---------- fixture ----------
const OPZ = { materia: 'Biologia', codice: 'B', step: '3.3', titolo: 'Membrane e trasporto', unita: 'UD3', archetipo: 'scienze_sperimentali' };
const pianoV1 = () => C.aPiano(C.leggi(fix('piano-v1.json')));
const pianoRighe = () => C.aPiano(C.leggi(fix('piano-righe.txt')));
/** Una domanda quiz-v3 valida (giusta in opzioni[0]). */
const dom = (sch, i, cat = 'prioritaria') => ({ id: 'biologia-3.3-S' + sch + '-' + i, scheda: 'S' + sch, categoria: cat, livello: 1 + (i % 4), domanda: 'D' + sch + '.' + i + '?',
  opzioni: ['giusta ' + i, 'b' + i, 'c' + i, 'd' + i], esatta: 0, spiegazione: 'perché ' + i, fonte: '[[Campbell, p. 10]]' });
const parte = (nome, schede, per = 18, data = '2026-11-20T10:00:00Z') => {
  const quiz = schede.flatMap(n => Array.from({ length: per }, (_, i) => dom(n, i)));
  return { id: nome, name: nome + '.json', cartella: 'Biologia quiz', modificato: data, tipo: 'parte', step: 'biologia-3.3', json: { formato: 'quiz-v3', parte: nome, quiz } };
};
const comeFile = (j, data = '2026-11-20T11:00:00Z') => ({ id: 'chiusura', name: 'chiusura.json', cartella: 'Biologia quiz', modificato: data, tipo: IP.classifica(j), step: IP.stepDi(j), json: j });

// =====================================================================
console.log('\n== Piano → schede ==');
t('daPiano: piano-v1 → schede numerate con microstep e categoria; avvisi del lettore conservati', () => {
  const p = CE.daPiano(pianoV1(), '3.3');
  eq(p.step, '3.3');
  eq(p.schede.map(s => [s.n, s.micro, s.categoria]), [[1, ['3.3.1'], 'prioritaria'], [2, ['3.3.1'], 'prioritaria'], [3, ['3.3.2', '3.3.3'], 'prioritaria']]);
  eq(p.schede[0].blocco, 'Membrane e trasporto', 'titolo del blocco');
});
t('daPiano: a righe con blocchi di più step → tiene solo lo step chiesto e lo dice', () => {
  const p = CE.daPiano(pianoRighe(), '3.3');
  eq(p.schede.map(s => s.n), [1, 2, 3]);
  vero(p.avvisi.some(a => /3\.4/.test(a)), 'avviso sul blocco 3.4: ' + JSON.stringify(p.avvisi));
});
t('daPiano: microstep fuori dallo step → avviso, la scheda va in <step>.1', () => {
  const l = C.leggi(JSON.stringify({ formato: 'piano-v1', blocchi: [{ codice: '3.3', titolo: 'X', copre: [{ schede: ['S1'], micro: ['4.1.1'] }, { schede: ['S2'], micro: ['3.3.2'] }] }] }));
  const p = CE.daPiano(C.aPiano(l), '3.3');
  eq(p.schede.map(s => s.micro), [['3.3.1'], ['3.3.2']]);
  vero(p.avvisi.some(a => /4\.1\.1/.test(a)), 'avviso: ' + JSON.stringify(p.avvisi));
});
t('daPiano: numeri doppi o buchi → rinumerate 1..N nell\'ordine del piano, con avviso', () => {
  const l = C.leggi(JSON.stringify({ formato: 'piano-v1', blocchi: [{ codice: '3.3', titolo: 'X', copre: [{ schede: ['S2', 'S2'], micro: ['3.3.1'] }, { schede: ['S7'], micro: ['3.3.2'] }] }] }));
  const p = CE.daPiano(C.aPiano(l), '3.3');
  eq(p.schede.map(s => s.n), [1, 2, 3]);
  vero(p.avvisi.some(a => /rinumerat/i.test(a)), 'avviso: ' + JSON.stringify(p.avvisi));
});
t('schede: sigla S01, nome parte e id app <COD>-<microstep>-<n> stabili (stesso piano → stessi id)', () => {
  const p = CE.daPiano(pianoV1(), '3.3');
  const a = CE.schede(p, OPZ), b = CE.schede(CE.daPiano(pianoV1(), '3.3'), OPZ);
  eq(a.map(s => [s.sigla, s.id]), [['S01', 'B-3.3.1-1'], ['S02', 'B-3.3.1-2'], ['S03', 'B-3.3.2-3']]);
  eq(a, b, 'deterministico');
  eq(CE.prefisso(OPZ), 'biologia-3.3');
  eq(CE.nomeParte(OPZ, 1, 2), 'biologia-3.3-s1-2');
  eq(IP.nomeParte(CE.nomeParte(OPZ, 1, 2)), { step: 'biologia-3.3', da: 1, a: 2 }, 'l\'import lo riconosce');
});

console.log('\n== Chiusura costruita dall\'app ==');
t('chiusura: l\'import la riconosce come «chiusura» dello stesso step', () => {
  const c = CE.chiusura(CE.daPiano(pianoV1(), '3.3'), OPZ);
  eq(IP.classifica(c), 'chiusura');
  eq(IP.stepDi(c), 'biologia-3.3');
});
t('chiusura: una sotto-scheda per microstep, ogni scheda in esattamente una; conteggi e durata', () => {
  const p = CE.daPiano(pianoV1(), '3.3'), c = CE.chiusura(p, OPZ), ps = c.programmaCalendario.pianoStrutturato;
  eq(ps.sottoSchede.map(x => [x.codice, x.schedePrioritarie, x.schedeRaffinamento]),
    [['3.3.1', ['biologia-3.3-S01', 'biologia-3.3-S02'], []], ['3.3.2', ['biologia-3.3-S03'], []]]);
  eq(ps.sottoSchede[1].microstep, ['3.3.2', '3.3.3'], 'microstep coperti dalla scheda');
  eq([c.meta.ripartizioneSchede.totale, c.meta.domandeTotali], [3, 54], '3 schede × 18');
  eq([ps.blocchiBRAC, ps.durataTotaleMin], [1, 50], 'un blocco da 50 min');
  eq(c.meta.schemaVersion, 2);
});
t('chiusura: ripassi +1/+3/+7 g con target calcolati (raffinamento al +7)', () => {
  const p = CE.daPiano(pianoV1(), '3.3'); p.schede[2].categoria = 'raffinamento';
  const a = CE.chiusura(p, OPZ).programmaCalendario.pianoStrutturato.ancoraggiRipassoFSRS;
  eq(a.map(x => [x.intervallo, x.target]), [['+1g', ['biologia-3.3-S01', 'biologia-3.3-S02']], ['+3g', ['biologia-3.3-S01', 'biologia-3.3-S02']], ['+7g', ['biologia-3.3-S03']]]);
});
t('chiusura: senza raffinamento il +7 g ripassa tutte le schede', () => {
  const a = CE.chiusura(CE.daPiano(pianoV1(), '3.3'), OPZ).programmaCalendario.pianoStrutturato.ancoraggiRipassoFSRS;
  eq(a[2].target, ['biologia-3.3-S01', 'biologia-3.3-S02', 'biologia-3.3-S03']);
});
t('chiusura: con la data → riga calendario che l\'import legge come data del pacchetto', () => {
  const c = CE.chiusura(CE.daPiano(pianoV1(), '3.3'), { ...OPZ, data: '2026-11-25' });
  eq(c.programmaCalendario.formatoGeneraMjs, ['B|UD3|Membrane e trasporto|3|3.3|25/11/2026']);
  const senza = CE.chiusura(CE.daPiano(pianoV1(), '3.3'), OPZ);
  vero(!senza.programmaCalendario.formatoGeneraMjs, 'senza data nessuna riga');
});
t('chiusura: niente quiz dentro e nessun campo chiesto all\'AI', () => {
  const c = CE.chiusura(CE.daPiano(pianoV1(), '3.3'), OPZ);
  vero(!('quiz' in c), 'niente quiz');
  eq(c.meta.origine, 'centro');
});

console.log('\n== Stessa pipeline dell\'import ==');
t('parti + chiusura dall\'app → raggruppa «completo», unisci senza bloccanti', () => {
  const c = CE.chiusura(CE.daPiano(pianoV1(), '3.3'), OPZ);
  const g = IP.raggruppa([parte('biologia-3.3-s1-2', [1, 2]), parte('biologia-3.3-s3', [3]), comeFile(c)]);
  eq(g.length, 1); eq([g[0].tipo, g[0].stato, g[0].totaleSchede, g[0].domande, g[0].domandeAttese], ['parti', 'completo', 3, 54, 54]);
  const u = IP.unisci(g[0]);
  eq([u.bloccanti.length, u.pacchetto.quiz.length], [0, 54]);
});
t('manca una scheda → «mancano» con il numero giusto', () => {
  const c = CE.chiusura(CE.daPiano(pianoV1(), '3.3'), OPZ);
  const g = IP.raggruppa([parte('biologia-3.3-s1-2', [1, 2]), comeFile(c)]);
  eq([g[0].stato, g[0].mancanti], ['mancano', [3]]);
});
t('traduci: schede dell\'app con gli id previsti, P/R dalla chiusura, ripassi, data', () => {
  const p = CE.daPiano(pianoV1(), '3.3'); p.schede[2].categoria = 'raffinamento';
  const c = CE.chiusura(p, { ...OPZ, data: '2026-11-25' });
  const u = IP.unisci(IP.raggruppa([parte('biologia-3.3-s1-2', [1, 2]), parte('biologia-3.3-s3', [3]), comeFile(c)])[0]);
  const tr = ID.traduci(u.pacchetto, '2026-11-20');
  const attesi = CE.schede(p, OPZ).map(s => s.id);
  eq(tr.sub.microstep.flatMap(m => m.schede.map(s => s.id)), attesi, 'id = Centro.schede');
  eq(tr.sub.microstep.flatMap(m => m.schede.map(s => s.tipo)), ['P', 'P', 'R']);
  eq(tr.ripassi.map(r => [r.giorni, r.target]), [[1, ['B-3.3.1-1', 'B-3.3.1-2']], [3, ['B-3.3.1-1', 'B-3.3.1-2']], [7, ['B-3.3.2-3']]]);
  eq([tr.k, tr.ud, tr.titolo, tr.min, tr.dataPacchetto, tr.domande], ['B3.3', 'UD3', 'Membrane e trasporto', 50, '2026-11-25', 54]);
});

console.log('\n== Stato del flusso ==');
const sch = (...st) => st.map((stato, i) => ({ n: i + 1, stato }));
const PIANO = { formato: 'piano-v1', blocchi: [] };
t('passoDi: senza materia/step → 1; senza piano → 2', () => {
  eq(CE.passoDi({ materia: '', step: '', schede: [] }), 1);
  eq(CE.passoDi({ materia: 'Biologia', step: '3.3', schede: [] }), 2);
  eq(CE.passoDi({ materia: 'Biologia', step: '3.3', piano: PIANO, schede: [] }), 2, 'piano senza schede');
});
t('passoDi: schede da fare o interrotte → 3; tutte arrivate → 4', () => {
  eq(CE.passoDi({ materia: 'Biologia', step: '3.3', piano: PIANO, schede: sch('arrivata', 'interrotta', 'da-fare') }), 3);
  eq(CE.passoDi({ materia: 'Biologia', step: '3.3', piano: PIANO, schede: sch('arrivata', 'arrivata') }), 4);
});
t('passoDi: controllato con correzioni → 5; senza → 6; provato → 7', () => {
  const r = { materia: 'Biologia', step: '3.3', piano: PIANO, schede: sch('arrivata', 'arrivata') };
  eq(CE.passoDi({ ...r, esiti: { controllato: true, daCorreggere: 2 } }), 5);
  eq(CE.passoDi({ ...r, esiti: { controllato: true, daCorreggere: 0 } }), 6);
  eq(CE.passoDi({ ...r, esiti: { controllato: true, provato: true } }), 7);
  eq(CE.passoDi({ ...r, esiti: { controllato: true, provato: true, importato: true } }), 7, 'importato resta all\'ultimo passo');
});
t('prossimaScheda: la prima non arrivata (interrotta o da fare); tutte arrivate → 0', () => {
  eq(CE.prossimaScheda({ schede: sch('arrivata', 'interrotta', 'da-fare') }), 2);
  eq(CE.prossimaScheda({ schede: sch('arrivata', 'arrivata', 'da-fare') }), 3);
  eq(CE.prossimaScheda({ schede: sch('arrivata') }), 0);
  eq(CE.prossimaScheda({ schede: [] }), 0);
});

console.log('\n== Albero e import selezionabile ==');
const OPZC = { materia: 'Chimica', codice: 'C', step: '2.1' };
/** Un file intero di chimica: chiusura + quiz nello stesso JSON. */
const intero = () => {
  const l = C.leggi(JSON.stringify({ formato: 'piano-v1', blocchi: [{ codice: '2.1', titolo: 'Atomi', copre: [{ schede: ['S1'], micro: ['2.1.1'] }, { schede: ['S2'], micro: ['2.1.2'] }] }] }));
  const j = { ...CE.chiusura(CE.daPiano(C.aPiano(l), '2.1'), OPZC), quiz: [1, 2].flatMap(n => Array.from({ length: 18 }, (_, i) => ({ ...dom(n, i), id: 'chimica-2.1-S' + n + '-' + i }))) };
  return { id: 'ch', name: 'chimica.json', cartella: 'Chimica quiz', modificato: '2026-11-19T10:00:00Z', tipo: IP.classifica(j), step: IP.stepDi(j), json: j };
};
const gruppiBio = (p = CE.daPiano(pianoV1(), '3.3')) => IP.raggruppa([parte('biologia-3.3-s1-2', [1, 2]), parte('biologia-3.3-s3', [3]), comeFile(CE.chiusura(p, OPZ))]);
t('albero: cartella → step → microstep con schede e domande, cartelle in ordine', () => {
  const a = CE.albero([...IP.raggruppa([intero()]), ...gruppiBio()]);
  eq(a.map(c => c.cartella), ['Biologia quiz', 'Chimica quiz']);
  const bio = a[0].steps[0];
  eq([bio.chiave, bio.sotto, bio.stato, bio.schede, bio.domande], ['s:biologia-3.3', '3.3', 'completo', 3, 54]);
  eq(bio.microstep.map(m => [m.n, m.schede, m.domande]), [['3.3.1', [1, 2], 36], ['3.3.2', [3], 18]]);
  const ch = a[1].steps[0];
  eq([ch.sotto, ch.microstep.map(m => [m.n, m.schede, m.domande])], ['2.1', [['2.1.1', [1], 18], ['2.1.2', [2], 18]]]);
});
t('albero: step incompleto → stato e microstep di ciò che è arrivato', () => {
  const g = IP.raggruppa([parte('biologia-3.3-s3', [3]), comeFile(CE.chiusura(CE.daPiano(pianoV1(), '3.3'), OPZ))]);
  const st = CE.albero(g)[0].steps[0];
  eq([st.stato, st.microstep.map(m => m.n)], ['mancano', ['3.3.2']]);
});
const unito = p => IP.unisci(gruppiBio(p)[0]).pacchetto;
t('filtra: un microstep su due → solo quelle schede, domande, durata e ripassi', () => {
  const f = CE.filtra(unito(), ['3.3.1']), tr = ID.traduci(f, '2026-11-20');
  eq(tr.sub.microstep.map(m => [m.n, m.schede.map(s => s.id)]), [['3.3.1', ['B-3.3.1-1', 'B-3.3.1-2']]]);
  eq([tr.domande, tr.min, f.meta.domandeTotali], [36, 34, 36]);
  eq(tr.ripassi.map(r => [r.giorni, r.target]), [[1, ['B-3.3.1-1', 'B-3.3.1-2']], [3, ['B-3.3.1-1', 'B-3.3.1-2']], [7, ['B-3.3.1-1', 'B-3.3.1-2']]]);
});
t('filtra: id delle schede invariati e ripassi senza bersaglio tolti', () => {
  const p = CE.daPiano(pianoV1(), '3.3'); p.schede[2].categoria = 'raffinamento';
  const tr = ID.traduci(CE.filtra(unito(p), ['3.3.2']), '2026-11-20');
  eq(tr.sub.microstep.flatMap(m => m.schede.map(s => s.id)), ['B-3.3.2-3'], 'stesso id dell\'import completo');
  eq(tr.ripassi.map(r => [r.giorni, r.target]), [[7, ['B-3.3.2-3']]]);
});
t('filtra: tutto scelto → stesso risultato; il pacchetto di partenza non cambia', () => {
  const u = unito(), prima = JSON.stringify(u);
  const a = ID.traduci(CE.filtra(u, ['3.3.1', '3.3.2']), '2026-11-20'), b = ID.traduci(u, '2026-11-20');
  eq(a, b);
  eq(JSON.stringify(u), prima, 'nessuna modifica in place');
});

// =====================================================================
console.log('\nCentro ' + ok + '/' + (ok + ko));
process.exit(ko ? 1 : 0);
