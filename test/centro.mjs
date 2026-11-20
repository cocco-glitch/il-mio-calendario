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
const FILE = ['01-json.ts', '07-pianificatore.ts', '07-sezionispiegazione.ts', '07-importadrive-parti.ts', '07-importadrive.ts', ...SU];
const js = FILE.map(f => ts.transpileModule(leggi(f), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText).join('\n');
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const sb = { console, ymd, oggi: () => new Date(), materiaDi: k => { const m = /^([A-Z]+)/.exec(k || ''); return m ? m[1] : ''; } };
vm.createContext(sb);
const ESPORTA = ['ImportaParti', 'ImportaDrive', 'Contratto', 'Centro', 'DiagnosiQuiz'];
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

console.log('\n== Pagine per microstep ==');
const INDICE = [{ capitolo: '3.3.1 Membrane', pagina: 40 }, { capitolo: '3.3.2 Trasporto passivo', pagina: 46 }, { capitolo: '3.3.3 Trasporto attivo', pagina: 52 }];
t('pagineMicrostep: senza mappa → solo l\'intervallo stampato, fino alla pagina prima del microstep dopo', () => {
  eq(CE.pagineMicrostep(INDICE, null, '3.3.1'), { stampDa: 40, stampA: 45, pdfDa: null, pdfA: null, affidabilita: 'nessuna' });
});
/** Due tratti: stampate 1–41 = PDF 10–50, poi 2 tavole fuori testo (PDF 51–52), stampate 42… = PDF 53… */
const TRATTI = { fonte: 'auto-stampati', affidabilita: 'stimata', tratti: [{ pdfDa: 10, pdfA: 50, stampDa: 1 }, { pdfDa: 53, pdfA: 300, stampDa: 42 }] };
t('pagineMicrostep: mappa a tratti → PDF di inizio e fine anche a cavallo di due tratti, con l\'affidabilità della mappa', () => {
  eq(CE.pagineMicrostep(INDICE, TRATTI, '3.3.1'), { stampDa: 40, stampA: 45, pdfDa: 49, pdfA: 56, affidabilita: 'stimata' });
  eq(CE.pagineMicrostep(INDICE, TRATTI, '3.3.2'), { stampDa: 46, stampA: 51, pdfDa: 57, pdfA: 62, affidabilita: 'stimata' });
});
t('pagineMicrostep: fonte D (nessuna) → nessuna pagina; microstep fuori dall\'indice → null; ultima voce aperta', () => {
  eq(CE.pagineMicrostep(INDICE, { fonte: 'nessuna', tratti: [], affidabilita: 'nessuna' }, '3.3.1'), null, 'fonte D');
  eq(CE.pagineMicrostep(INDICE, TRATTI, '3.4.1'), null, 'non nell\'indice');
  eq(CE.pagineMicrostep(INDICE, TRATTI, '3.3.3'), { stampDa: 52, stampA: null, pdfDa: 63, pdfA: null, affidabilita: 'stimata' }, 'fino a fine libro');
});

console.log('\n== Libri e misura a tratti ==');
/** Numeri ai bordi di ogni pagina: 4 pagine di premessa senza numero, poi stampata = PDF − 4 fino a PDF 20, 2 tavole, poi stampata = PDF − 6. */
const NUMERI = Array.from({ length: 40 }, (_, i) => { const pdf = i + 1; return pdf <= 4 || pdf === 21 || pdf === 22 ? [] : pdf <= 20 ? [pdf - 4] : [pdf - 6, 2024]; });
t('mappaAuto: etichette del PDF → esatta (vincono sui numeri stampati)', () => {
  const et = ['i', 'ii', 'iii', '1', '2', '3'];
  eq(CE.mappaAuto(et, NUMERI), { fonte: 'auto-etichette', tratti: [{ pdfDa: 1, pdfA: 3, stampDa: 'i' }, { pdfDa: 4, pdfA: 6, stampDa: 1 }], affidabilita: 'esatta' });
});
t('mappaAuto: senza etichette → numeri stampati di tutte le pagine, a tratti, stimata; niente scostamento unico', () => {
  eq(CE.mappaAuto(null, NUMERI), { fonte: 'auto-stampati', tratti: [{ pdfDa: 5, pdfA: 20, stampDa: 1 }, { pdfDa: 23, pdfA: 40, stampDa: 17 }], affidabilita: 'stimata' });
});
t('mappaAuto: né etichette né numeri → null (pagine non rilevate)', () => {
  eq(CE.mappaAuto(null, Array.from({ length: 30 }, () => [])), null);
  eq(CE.mappaAuto([null, null], [[], []]), null);
});
t('descriviMappa: l\'affidabilità a schermo per ogni caso, «non rilevate» propone la fonte B', () => {
  vero(/esatt/i.test(CE.descriviMappa(CE.mappaAuto(['1', '2', '3'], []))) && /etichette/.test(CE.descriviMappa(CE.mappaAuto(['1', '2', '3'], []))), 'etichette');
  const st = CE.descriviMappa(CE.mappaAuto(null, NUMERI));
  vero(/stimat/i.test(st) && /2 tratti/.test(st), 'stimata a tratti: ' + st);
  const nr = CE.descriviMappa(null);
  vero(/non rilevate/.test(nr) && /a mano/.test(nr), 'non rilevate → B: ' + nr);
  vero(/esatt/i.test(CE.descriviMappa({ fonte: 'mano', tratti: [{ pdfDa: 5, pdfA: 99999, stampDa: 1 }], affidabilita: 'esatta' })), 'a mano');
  vero(/capitolo/.test(CE.descriviMappa({ fonte: 'nessuna', tratti: [], affidabilita: 'nessuna' })), 'fonte D');
});
const LIBRO = { nome: 'Campbell – Biologia 2ª ed', pdf: ['Campbell – Biologia 2ª ed 1-300.pdf', 'Campbell – Biologia 2ª ed 301-600.pdf'], segmenti: true };
t('idLibro: lib-<materia>-<slug> stabile', () => {
  eq(CE.idLibro('Biologia', LIBRO.nome), 'lib-biologia-campbell-biologia-2a-ed');
  eq(CE.idLibro('Biologia', 'campbell biologia 2ª ED'), 'lib-biologia-campbell-biologia-2a-ed');
});
t('libroDa: libro nuovo misurato → record con fonte auto, mappa e segmenti; mai PDF né testo', () => {
  const m = CE.mappaAuto(null, NUMERI), r = CE.libroDa('Biologia', { ...LIBRO, mappa: m, lettura: { pct: 96 } }, null);
  eq([r.id, r.type, r.nome, r.materia, r.fonte], ['lib-biologia-campbell-biologia-2a-ed', 'libro', LIBRO.nome, 'Biologia', 'auto']);
  eq(r.pdf, [{ nome: LIBRO.pdf[0], segmentoDa: 1 }, { nome: LIBRO.pdf[1], segmentoDa: 301 }]);
  eq(r.mappa, m); eq(r.lettura, { pct: 96 });
  const non = CE.libroDa('Biologia', { nome: 'Dispensa', pdf: ['Dispensa.pdf'] }, null);
  eq([non.fonte, non.mappa, non.pdf], ['auto', null, [{ nome: 'Dispensa.pdf' }]], 'non misurato: niente mappa');
});
t('libroDa: la fonte scelta (B a mano) vince sulla misura nuova; mappa, indice e prova precedenti restano', () => {
  const mano = { fonte: 'mano', tratti: [{ pdfDa: 7, pdfA: 99999, stampDa: 1 }], affidabilita: 'esatta' };
  const prec = { ...CE.libroDa('Biologia', LIBRO, null), fonte: 'mano', ancore: [{ stampata: 1, pdf: 7 }], mappa: mano, indice: [{ capitolo: '3.3.1 X', pagina: 40 }], prova: { quando: '2026-11-20', ok: 3, tot: 3 }, updatedAt: 5 };
  const r = CE.libroDa('Biologia', { ...LIBRO, mappa: CE.mappaAuto(null, NUMERI) }, prec);
  eq([r.fonte, r.mappa, r.ancore, r.indice, r.prova, r.updatedAt], ['mano', mano, prec.ancore, prec.indice, prec.prova, 5]);
  const auto = CE.libroDa('Biologia', LIBRO, { ...prec, fonte: 'auto' });
  eq(auto.mappa, mano, 'senza misura nuova resta la mappa salvata');
});

t('unisciSegmenti: PDF a segmenti → tratti in pagine PDF assolute; basta un segmento stimato per dire «stimata»', () => {
  const s1 = { fonte: 'auto-etichette', tratti: [{ pdfDa: 1, pdfA: 300, stampDa: 1 }], affidabilita: 'esatta' };
  const s2 = { fonte: 'auto-stampati', tratti: [{ pdfDa: 3, pdfA: 300, stampDa: 303 }], affidabilita: 'stimata' };
  eq(CE.unisciSegmenti([{ mappa: s1, base: 0 }, { mappa: s2, base: 300 }]),
    { fonte: 'auto-stampati', tratti: [{ pdfDa: 1, pdfA: 300, stampDa: 1 }, { pdfDa: 303, pdfA: 600, stampDa: 303 }], affidabilita: 'stimata' });
  eq(CE.unisciSegmenti([{ mappa: s1, base: 0 }, { mappa: null, base: 300 }]).affidabilita, 'esatta', 'segmento non rilevato: resta senza tratti');
  eq(CE.unisciSegmenti([{ mappa: null, base: 0 }]), null);
  eq(s2.tratti[0].pdfDa, 3, 'le mappe dei segmenti non vengono modificate');
});

// ---------- T11: fonte delle pagine B/C/D e prova a 3 pagine ----------
t('indiceDa: testo dell\'indice → voci capitolo/pagina (solo righe con pagina), pronte per pagineMicrostep', () => {
  const v = CE.indiceDa('Indice\n3 Membrane\n3.3.1 Diffusione ........ 40\n3.3.2 Osmosi 46\n3.3.3 Trasporto attivo .... 52\nAppendice senza pagina');
  eq(v, [{ capitolo: '3.3.1 Diffusione', pagina: 40 }, { capitolo: '3.3.2 Osmosi', pagina: 46 }, { capitolo: '3.3.3 Trasporto attivo', pagina: 52 }]);
  eq(CE.pagineMicrostep(v, null, '3.3.2').stampA, 51);
  eq(CE.indiceDa(''), []);
});
const STIM = { fonte: 'auto-stampati', tratti: [{ pdfDa: 5, pdfA: 20, stampDa: 1 }, { pdfDa: 23, pdfA: 40, stampDa: 17 }], affidabilita: 'stimata' };
const LIB1 = { nome: 'Chimica Stampati', pdf: ['Chimica Stampati.pdf'] };
t('conAncore (B): l\'ancora corregge la mappa misurata da quella pagina in poi, tavole e tratti prima restano; B vince ed è esatta', () => {
  const rec = CE.libroDa('Chimica', { ...LIB1, mappa: STIM }, null);
  const r = CE.conAncore(rec, { stampata: 20, pdf: 25 });
  eq([r.fonte, r.ancore], ['mano', [{ stampata: 20, pdf: 25 }]]);
  eq(r.mappa, { fonte: 'mano', tratti: [{ pdfDa: 5, pdfA: 20, stampDa: 1 }, { pdfDa: 23, pdfA: 24, stampDa: 17 }, { pdfDa: 25, pdfA: 40, stampDa: 20 }], affidabilita: 'esatta' });
  eq(CE.conAncore(r, { stampata: 21, pdf: 25 }).ancore, [{ stampata: 21, pdf: 25 }], 'stessa pagina PDF: l\'ancora nuova sostituisce');
  eq([rec.fonte, rec.mappa], ['auto', STIM], 'il record di partenza non cambia');
  eq(CE.conAncore(CE.libroDa('Chimica', LIB1, null), { stampata: 1, pdf: 7 }).mappa.tratti, [{ pdfDa: 7, pdfA: 99999, stampDa: 1 }], 'senza misura: daMano');
});
t('conFonte: A torna alla misura, C usa la mappa se c\'è, D senza numeri; le ancore restano salvate', () => {
  const b = CE.conAncore(CE.libroDa('Chimica', { ...LIB1, mappa: STIM }, null), { stampata: 20, pdf: 25 });
  const a = CE.conFonte(b, 'auto');
  eq([a.fonte, a.mappa, a.ancore.length], ['auto', STIM, 1]);
  eq(CE.conFonte(a, 'indice').mappa, STIM);
  eq(CE.conFonte(CE.libroDa('Chimica', LIB1, null), 'indice').mappa, null);
  const d = CE.conFonte(b, 'nessuna');
  eq(d.mappa, { fonte: 'nessuna', tratti: [], affidabilita: 'nessuna' });
  vero(/capitolo/.test(CE.descriviMappa(d.mappa)));
  eq(CE.libroDa('Chimica', { ...LIB1, mappa: STIM }, d).mappa.fonte, 'nessuna', 'una misura nuova non cambia la fonte D scelta');
});
t('conProva: 3 pagine, una sbagliata → ancora B, mappa esatta, esito salvato e a schermo', () => {
  const rec = CE.libroDa('Chimica', { ...LIB1, mappa: STIM }, null);
  const r = CE.conProva(rec, [{ pdf: 8, stampata: 4, letta: '4' }, { pdf: 25, stampata: 19, letta: '20' }, { pdf: 30, stampata: 24, letta: ' 24 ' }], '2026-11-20');
  eq([r.prova, r.fonte, r.ancore, r.mappa.affidabilita], [{ quando: '2026-11-20', ok: 2, tot: 3 }, 'mano', [{ stampata: 20, pdf: 25 }], 'esatta']);
  vero(/provata il 20\/11\/2026: 2\/3/.test(CE.descriviLibro(r)), CE.descriviLibro(r));
  const tutte = CE.conProva(rec, [{ pdf: 8, stampata: 4, letta: '4' }], '2026-11-21');
  eq([tutte.fonte, tutte.mappa, tutte.prova.ok], ['auto', STIM, 1], 'tutte giuste: la mappa resta quella misurata');
  vero(/indice/.test(CE.descriviLibro(CE.conFonte(CE.libroDa('Chimica', LIB1, null), 'indice'))));
});

t('libroDa: la mappa scelta (B/D) che torna dal blocco Fonti non diventa la misura; una misura vera sì', () => {
  const b = CE.conAncore(CE.libroDa('Chimica', { ...LIB1, mappa: STIM }, null), { stampata: 20, pdf: 25 });
  const giro = CE.libroDa('Chimica', { ...LIB1, mappa: b.mappa }, b);
  eq([giro.fonte, giro.mappa], ['mano', b.mappa]);
  eq(CE.conFonte(giro, 'auto').mappa, STIM, 'tornando ad A si ritrova la misura');
  const nuova = { fonte: 'auto-etichette', tratti: [{ pdfDa: 1, pdfA: 40, stampDa: 1 }], affidabilita: 'esatta' };
  eq(CE.conFonte(CE.libroDa('Chimica', { ...LIB1, mappa: nuova }, giro), 'auto').mappa, nuova);
});
t('paginePer: per ogni microstep le pagine dal primo libro con indice (mappa del libro); senza indice niente', () => {
  const senza = { id: 'lib-a', type: 'libro', nome: 'A', fonte: 'auto', mappa: TRATTI };
  const con = { id: 'lib-b', type: 'libro', nome: 'B', fonte: 'auto', mappa: TRATTI, indice: INDICE };
  eq(CE.paginePer([senza, con], ['3.3.2', '9.9']), { '3.3.2': { stampDa: 46, stampA: 51, pdfDa: 57, pdfA: 62, affidabilita: 'stimata' } });
  eq(CE.paginePer([senza], ['3.3.1']), {});
});
t('paroleChiave: parole lunghe e sigle di domanda e risposta corretta, senza parole vuote né doppioni', () => {
  const q = { domanda: 'Qual è la funzione dei mitocondri nella cellula eucariote?', opzioni: ['Sintesi delle proteine', 'Produzione di ATP tramite respirazione cellulare', 'Divisione', 'Fotosintesi'], esatta: 1 };
  eq(CE.paroleChiave(q), ['mitocondri', 'cellula', 'eucariote', 'produzione', 'atp', 'respirazione', 'cellulare']);
  eq(CE.paroleChiave({ domanda: 'Che cosa?' }), []);
});
t('verificaCitazioni: ✅ resta, ↔ corretta in fonte, sourceRef e [[…]] e registrata, ⚠/✗ problemi per la correzione, ❓ dichiarata', () => {
  const M = { fonte: 'auto-etichette', tratti: [{ pdfDa: 5, pdfA: 200, stampDa: 1 }], affidabilita: 'esatta' };   // stampata p = PDF p+4
  const MIT = 'I mitocondri della cellula eucariote: produzione di ATP con la respirazione cellulare.';
  const TESTI = { 23: 'Il reticolo endoplasmatico liscio.', 24: MIT, 25: 'Apparato di Golgi.', 34: 'I mitocondri hanno due membrane.', 53: 'Il nucleo.', 54: 'La mitosi.', 55: 'La meiosi.' };
  const base = { domanda: 'Qual è la funzione dei mitocondri nella cellula eucariote?', opzioni: ['Sintesi delle proteine', 'Produzione di ATP tramite respirazione cellulare', 'Divisione', 'Fotosintesi'], esatta: 1 };
  const q = (id, p) => ({ ...base, id, fonte: 'Manuale, p. ' + p, sourceRef: 'Manuale, p. ' + p, spiegazione: 'Testo. [[Manuale, p. ' + p + ']] e p. ' + p + ' fuori.' });
  const qs = [q('q1', 19), q('q2', 50), q('q3', 20), q('q4', 80), q('q5', 30), { id: 'q6', domanda: 'Senza fonte' }];
  eq(CE.pagineDaLeggere(qs, M), [22, 23, 24, 25, 33, 34, 35, 53, 54, 55, 83, 84, 85]);
  const r = CE.verificaCitazioni(qs, M, p => TESTI[p] || '');
  eq([r.qs[0].fonte, r.qs[0].sourceRef, r.qs[0].spiegazione], ['Manuale, p. 20', 'Manuale, p. 20', 'Testo. [[Manuale, p. 20]] e p. 19 fuori.']);
  eq(r.registro, ['q1: p. 19 → p. 20 (i concetti sono sulla pagina accanto)']);
  eq(r.problemi, [{ sev: 'err', id: 'q2', msg: 'citazione p. 50: la pagina non contiene i concetti della domanda' },
    { sev: 'err', id: 'q5', msg: 'citazione p. 30: sulla pagina solo parte dei concetti della domanda' }]);
  eq([r.ok, r.dubbi], [1, ['q4']]);
  eq(r.qs.slice(1), qs.slice(1), 'le altre domande restano come sono');
  eq(CE.verificaCitazioni(qs, { fonte: 'nessuna', tratti: [], affidabilita: 'nessuna' }, () => MIT).ok, 0, 'mappa nessuna: niente verifica');
});
t('verificaCitazioni → prompt di correzione: chiede fonte, sourceRef e spiegazione mostrando domanda, risposta e citazione', () => {
  const q = { id: 'B-3.3-001', domanda: 'Che cosa producono i mitocondri?', opzioni: ['ATP', 'DNA', 'RNA', 'Lipidi'], esatta: 0, fonte: 'Manuale, p. 50', spiegazione: 'Spiega. [[Manuale, p. 50]]' };
  const c = sb.DiagnosiQuiz.promptCorrezione([q], [{ sev: 'err', id: q.id, msg: 'citazione p. 50: la pagina non contiene i concetti della domanda' }]);
  vero(c.nDomande === 1 && !c.manuali.length, 'una domanda da correggere con patch');
  vero(c.testo.includes('RESTITUISCI: fonte, sourceRef, spiegazione'), 'campi da rifare: ' + c.testo);
  vero(/Fonte attuale: Manuale, p\. 50/.test(c.testo) && /Opzioni: A\) ATP/.test(c.testo), 'contesto per ritrovare la pagina');
  vero(/pagina reale/.test(c.testo), 'consiglio: cercare la pagina vera');
});
// =====================================================================
console.log('\nCentro ' + ok + '/' + (ok + ko));
process.exit(ko ? 1 : 0);
