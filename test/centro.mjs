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
const ESPORTA = ['ImportaParti', 'ImportaDrive', 'Contratto', 'Centro', 'DiagnosiQuiz', 'MasterPrompt', 'ProfiliAI', 'PianificazioneQuiz'];
vm.runInContext(js + '\n;' + ESPORTA.map(n => 'this.' + n + ' = typeof ' + n + " !== 'undefined' ? " + n + ' : undefined;').join(' '), sb);
const { Contratto: C, ImportaParti: IP, ImportaDrive: ID } = sb;
const CE = sb.Centro || new Proxy({}, { get: (_, k) => () => { throw new Error('Centro.' + String(k) + ' non esiste ancora'); } });
const PQ = sb.PianificazioneQuiz || new Proxy({}, { get: (_, k) => () => { throw new Error('PianificazioneQuiz.' + String(k) + ' non esiste ancora'); } });

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

console.log('\n== P0.67 quantità quiz per microstep ==');
t('manuale: due microstep equivalenti dividono esattamente il totale senza mutare la richiesta', () => {
  const richiesta = { modalita: 'manuale', totaleManuale: 10, massimoTotale: 200, intensita: 2,
    microstep: [{ id: '3.3.1' }, { id: '3.3.2' }] };
  const prima = JSON.stringify(richiesta), r = PQ.calcola(richiesta);
  eq([r.totale, r.perMicrostep.map(x => [x.id, x.quantita])], [10, [['3.3.1', 5], ['3.3.2', 5]]]);
  eq(JSON.stringify(richiesta), prima, 'input immutato');
});
t('auto: ampiezza, complessità, applicazioni, livelli e priorità aumentano la copertura in modo spiegabile', () => {
  const r = PQ.calcola({ modalita: 'auto', massimoTotale: 200, intensita: 2, microstep: [
    { id: 'base' },
    { id: 'ricco', pagine: 20, concetti: 8, applicazioni: 4, densita: 4, livelliRichiesti: 4, minutiDisponibili: 90, priorita: true },
  ] });
  const base = r.perMicrostep.find(x => x.id === 'base'), ricco = r.perMicrostep.find(x => x.id === 'ricco');
  vero(base && ricco && ricco.quantita > base.quantita, JSON.stringify(r));
  eq(r.totale, r.perMicrostep.reduce((n, x) => n + x.quantita, 0), 'totale esatto');
  vero(/pagine|concetti|applicazioni|densità|livelli|priorità/i.test(ricco.motivi.join(' ')), ricco.motivi.join('; '));
});
t('manuale: tetto 200 esplicito e arrotondamento stabile per ID, non per posizione', () => {
  const esegui = microstep => PQ.calcola({ modalita: 'manuale', totaleManuale: 500, massimoTotale: 200, intensita: 2, microstep });
  const ids = [{ id: '3.3.1' }, { id: '3.3.2' }, { id: '3.3.3' }], a = esegui(ids), b = esegui([...ids].reverse());
  const mappa = r => r.perMicrostep.map(x => [x.id, x.quantita]).sort((x, y) => x[0].localeCompare(y[0]));
  eq([a.totale, a.perMicrostep.reduce((n, x) => n + x.quantita, 0)], [200, 200]);
  eq(mappa(a), mappa(b), 'stessa quota per ID anche cambiando ordine');
  vero(a.perMicrostep.every(x => x.quantita >= 1) && /200|massimo/i.test(a.avvisi.join(' ')), JSON.stringify(a));
});
t('auto: il tempo insufficiente riduce la copertura e lo dichiara', () => {
  const r = PQ.calcola({ modalita: 'auto', massimoTotale: 200, intensita: 3, microstep: [
    { id: '3.3.1', pagine: 30, concetti: 12, applicazioni: 5, densita: 5, livelliRichiesti: 4, minutiDisponibili: 6, priorita: true },
  ] });
  eq([r.totale, r.perMicrostep[0].quantita], [3, 3]);
  vero(/tempo|minuti|copertura ridotta/i.test(r.avvisi.concat(r.perMicrostep[0].motivi).join(' ')), JSON.stringify(r));
});
t('auto: il massimo globale ridistribuisce senza azzerare microstep e con avviso', () => {
  const r = PQ.calcola({ modalita: 'auto', massimoTotale: 20, intensita: 3, microstep: [
    { id: 'a', pagine: 40, concetti: 12, applicazioni: 6, densita: 5, livelliRichiesti: 4, priorita: true },
    { id: 'b', pagine: 20, concetti: 8, applicazioni: 3, densita: 4, livelliRichiesti: 4 },
    { id: 'c' },
  ] });
  eq([r.totale, r.perMicrostep.reduce((n, x) => n + x.quantita, 0)], [20, 20]);
  vero(r.perMicrostep.every(x => x.quantita >= 1) && r.perMicrostep[0].quantita > r.perMicrostep[2].quantita, JSON.stringify(r));
  vero(/massimo|20|ridott/i.test(r.avvisi.join(' ')), r.avvisi.join('; '));
});
t('adapter UnitaAI: traduce solo segnali di copertura e lascia il tempo disponibile esplicito', () => {
  const unita = [{ uid: '3.3.1', titolo: 'Membrane', prereq: [], densita: 3, minutiBase: 120,
    pagine: [41, 44], concettiChiave: ['diffusione', 'osmosi', 'canali', 'pompe'], priorita: true }];
  const prima = JSON.stringify(unita);
  const micro = PQ.daUnitaAI(unita, { applicazioni: { '3.3.1': 2 }, livelliRichiesti: { '3.3.1': 4 }, minutiDisponibili: { '3.3.1': 20 } });
  eq(micro, [{ id: '3.3.1', pagine: 4, concetti: 4, applicazioni: 2, densita: 3, livelliRichiesti: 4, minutiDisponibili: 20, priorita: true }]);
  eq(JSON.stringify(unita), prima, 'UnitaAI immutate');
  const r = PQ.calcola({ modalita: 'auto', massimoTotale: 200, intensita: 2, microstep: micro });
  eq(r.perMicrostep[0].quantita, 10, '20 minuti disponibili limitano a 10, non minutiBase=120');
  vero(/pagine|concetti|applicazioni|densit|livelli|priorit/i.test(r.perMicrostep[0].motivi.join(' ')), JSON.stringify(r));
});
t('adapter PianoV1: deduplica i microstep e non trasforma le schede storiche in quantità', () => {
  const unita = [{ uid: '3.3.1', titolo: 'Membrane', prereq: [], densita: 4, minutiBase: 60, pagine: [10, 12], concettiChiave: ['a', 'b'], priorita: false }];
  const piano = schede => ({ avvisi: [], blocchi: [{ codice: '3.3', titolo: 'Membrane', copre: [
    { schede, micro: ['3.3.1', '3.3.2'] }, { schede: [99], micro: ['3.3.1'] },
  ] }] });
  const a = PQ.daPianoV1(piano([1]), unita, { applicazioni: { '3.3.2': 1 } });
  const b = PQ.daPianoV1(piano(Array.from({ length: 18 }, (_, i) => i + 1)), unita, { applicazioni: { '3.3.2': 1 } });
  eq(a, [{ id: '3.3.1', pagine: 3, concetti: 2, densita: 4, priorita: false }, { id: '3.3.2', applicazioni: 1 }]);
  eq(b, a, '1 o 18 schede storiche non cambiano la copertura richiesta');
  const calcola = microstep => PQ.calcola({ modalita: 'auto', massimoTotale: 200, intensita: 2, microstep });
  eq(calcola(a), calcola(b), 'stesso PianoV1 logico → stessa quantità totale');
});
const sorgentePQ = leggi('su-richiesta/07-pianificazionequiz.ts');
t('adapter quantità: nessuna dipendenza da batch provider, micro-quiz o formato storico da 18', () => {
  vero(!/perRisposta|itemPerMicroQuiz|PROFILO_STANDARD|perScheda/.test(sorgentePQ), 'concetti numerici mescolati nel modulo');
});
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
  eq(r.verificate, [24], 'blocco 2: pagine PDF verificate (✅ e ↔ corretta), terzo segnale di IndicePagine');
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
console.log('\n== Prompt v4, parti k/N e materiale (v0.64 T5) ==');
const MP = sb.MasterPrompt, PA = sb.ProfiliAI;
const SCH1 = [{ n: 1, micro: ['3.3.1'], categoria: 'prioritaria' }];
const PAG1 = { '3.3.1': { stampDa: 41, stampA: 44, pdfDa: 54, pdfA: 57, affidabilita: 'esatta' } };
const MCQ_SOLE = { mcq: 18, completamento: 0, ordinamento: 0, aperta: 0, codice: 0 };
t('mix solo mcq (proprietario) → prompt identico al byte a quello senza mix (v3)', () => {
  eq(MP.costruisciSchede({ ...OPZ, mix: PA.mix('informatica_coding', true, 18) }, SCH1, PAG1), MP.costruisciSchede(OPZ, SCH1, PAG1));
  eq(MP.costruisciSchede({ ...OPZ, mix: MCQ_SOLE }, SCH1), MP.costruisciSchede(OPZ, SCH1));
});
t('umanistico → quiz-v4 con la sequenza dei tipi decisa dall\'app: 5 aperte su 18 (~30%) in fondo, con rubrica', () => {
  const p = MP.costruisciSchede({ ...OPZ, archetipo: 'umanistico_storico', mix: PA.mix('umanistico_storico', false, 18) }, SCH1);
  vero(p.includes('"formato": "quiz-v4"') && !p.includes('"formato": "quiz-v3"'), 'formato v4');
  vero(p.includes('1–9 risposta multipla, 10–11 completamento, 12–13 ordinamento, 14–18 aperta'), 'sequenza dei tipi');
  vero(/rubrica/.test(p) && /rispostaModello/.test(p) && /`___`/.test(p) && /da 3 a 7/.test(p), 'campi per tipo');
  vero(!/linguaggio/.test(p), 'niente regole del codice se il mix non ha codice');
});
t('nessuna frase chiede all\'AI di contare o calcolare quante domande', () => {
  const p = MP.costruisciSchede({ ...OPZ, mix: PA.mix('informatica_coding', false, 18), parteAI: { k: 2, N: 3, da: 7, a: 12 }, materiale: null }, SCH1);
  vero(!/\bcont(a|are|ale)\b|quante domande|calcola (il numero|quante)/i.test(p), 'frase che fa contare l\'AI');
});
t('locale, 18 domande → 3 parti; la parte 2 chiede solo 7–12 con tipi, livelli e "da": 7', () => {
  const parti = PA.parti(18, PA.preset('locale').perRisposta);
  eq(parti.length, 3);
  const mix = PA.mix('scienze_sperimentali', false, 18);   // 70/15/15 di 18 a resti maggiori → 12 mcq, 3 completamento, 3 ordinamento
  const p = MP.costruisciSchede({ ...OPZ, mix, parteAI: parti[1] }, SCH1);
  vero(p.includes('PARTE 2 di 3') && p.includes('dalla 7 alla 12'), 'parte e intervallo');
  vero(p.includes('biologia-3.3-S01-07') && p.includes('biologia-3.3-S01-12'), 'ID assegnati dall\'app');
  vero(p.includes('"da": 7'), 'intestazione con da');
  vero(p.includes('livelli 3, 1, 2, 3, 2, 4'), 'livelli della parte');
  vero(p.includes('posizioni 7–12: 7–12 risposta multipla'), 'tipi della parte');
  const p3 = MP.costruisciSchede({ ...OPZ, mix, parteAI: parti[2] }, SCH1);
  vero(p3.includes('posizioni 13–18: 13–15 completamento, 16–18 ordinamento'), 'tipi della parte 3: ' + (/posizioni 13–18: [^\n.]*/.exec(p3) || [''])[0]);
});
t('parte con "da": 7 → l\'app numera gli ID dalla 7 (nessuna collisione con la parte 1)', () => {
  const qs = Array.from({ length: 6 }, (_, i) => ({ tipo: 'completamento', livello: 1, domanda: 'Il ___ ' + i, risposte: ['x'], fonte: '[[M, p. 41]]' }));
  const fatte = C.aQuiz(C.leggi(JSON.stringify({ formato: 'quiz-v4', parte: 'biologia-3.3-s1', da: 7, quiz: qs })), { step: 'biologia-3.3' });
  eq(fatte.map(q => q.id), ['07', '08', '09', '10', '11', '12'].map(k => 'biologia-3.3-S01-' + k));
});
const PAGINE_PDF = Array.from({ length: 20 }, (_, i) => ({ n: 54 + i, testo: ('Pagina ' + (54 + i) + ' ').padEnd(5000, 'x') }));
t('copilot (file no, 40 000) → materiale tagliato a fine pagina, prompt intero ≤ 40 000 caratteri e taglio dichiarato', () => {
  const cp = PA.preset('copilot');
  const r = MP.promptSchede({ ...OPZ, mix: PA.mix('scienze_sperimentali', false, 18), parteAI: PA.parti(18, cp.perRisposta)[0], materiale: PAGINE_PDF, maxCaratteri: cp.maxCaratteri }, SCH1, PAG1);
  vero(r.testo.length <= 40000, 'lunghezza ' + r.testo.length);
  vero(r.materiale && r.materiale.pagine.length > 0 && r.materiale.escluse > 0, 'pagine tenute e tolte');
  vero(r.testo.includes('MATERIALE') && /TAGLIATO/.test(r.testo), 'taglio dichiarato');
  vero(r.testo.includes('PDF p. 54 = p. 41'), 'pagina stampata dalla mappa');
  vero(!r.testo.includes('Leggi sul Drive') && !r.testo.includes('Usa solo il materiale dello step, in quest'), 'niente istruzioni per leggere file');
});
t('materiale null o solo pagine scansionate → «materiale non incluso»', () => {
  for (const m of [null, [{ n: 54, testo: '', vuota: true }]]) {
    const r = MP.promptSchede({ ...OPZ, materiale: m, maxCaratteri: 12000 }, SCH1, PAG1);
    vero(/[Mm]ateriale non incluso/.test(r.testo), 'frase');
  }
});
t('continua() di una scheda quiz-v4 → resta quiz-v4', () => {
  const p = C.continua({ formato: 'quiz-v4', dati: { step: 'biologia-3.3', scheda: 'S01', quiz: [{ tipo: 'aperta' }] }, blocchi: [], riparazioni: [], avvisi: [], errori: [] });
  vero(p.includes('"formato":"quiz-v4"'), p);
});
// == Parti incollate e unione per ID (v0.64 T6) ==
console.log('== Parti incollate e unione per ID (v0.64 T6) ==');
{
  const q = k => ({ id: 'bio-3.3-S01-' + String(k).padStart(2, '0'), domanda: 'D' + k });
  t('unisciDomande: la parte 2 si aggiunge alla 1 in ordine di posizione; il reimport sostituisce, niente doppioni', () => {
    const p1 = [1, 2, 3, 4, 5, 6].map(q), p2 = [7, 8, 9, 10, 11, 12].map(q);
    const u = CE.unisciDomande(p2, p1);
    eq(u.map(x => x.id.slice(-2)), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
    const re = CE.unisciDomande(u, [{ ...q(8), domanda: 'nuova' }]);
    eq(re.length, 12); eq(re[7].domanda, 'nuova');
  });
  t('partiIncollate: ✓ solo se ci sono tutte le posizioni da..a della parte', () => {
    const parti = [{ k: 1, N: 3, da: 1, a: 6 }, { k: 2, N: 3, da: 7, a: 12 }, { k: 3, N: 3, da: 13, a: 18 }];
    eq(CE.partiIncollate(parti, [1, 2, 3, 4, 5, 6, 7, 8, 13, 14, 15, 16, 17, 18].map(q)), [true, false, true]);
    eq(CE.partiIncollate(parti, []), [false, false, false]);
  });
}
// ---------- Motore unificato, blocco 2 parte 2: IndicePagine collegato a Centro/MappaPagine ----------
{
  const LIN = { radice: w => w.length > 6 ? w.slice(0, -2) : w.length > 4 ? w.slice(0, -1) : w, espandi: p => p };
  const riemp = k => Array.from({ length: 30 }, (_, i) => 'parola' + ((i * 7 + k) % 41)).join(' ');
  // libro di 30 pagine PDF; la stampata è PDF − 4; il trasporto attivo è trattato alle PDF 20–22 (pp. 16–18)
  const TESTI = Array.from({ length: 30 }, (_, i) => ({ n: i + 1, testo: 'Pagina\n' + riemp(i) + (i + 1 === 21 ? '\nTrasporto attivo\npompa sodio potassio trasporto attivo ATP trasporto attivo pompa'
    : i + 1 === 20 || i + 1 === 22 ? ' trasporto attivo pompa' : i + 1 === 8 ? ' trasporto' : '') }));
  const MAPPA = { fonte: 'auto-etichette', tratti: [{ pdfDa: 5, pdfA: 30, stampDa: 1 }], affidabilita: 'esatta' };
  const LIB = { id: 'lib-b-x', type: 'libro', updatedAt: 0, nome: 'Manuale', materia: 'B', pdf: [{ nome: 'Manuale.pdf' }], fonte: 'auto', mappa: MAPPA };
  t('terminiMicro: voce dell\'indice senza numero + testi del piano, senza doppioni né vuoti', () => {
    eq(CE.terminiMicro(INDICE, '3.3.3', ['Pompe e trasporto attivo', '', undefined, 'Trasporto attivo']), ['Trasporto attivo', 'Pompe e trasporto attivo']);
    eq(CE.terminiMicro(undefined, '3.3.3', ['Pompe']), ['Pompe']);
  });
  t('pagineTrovate senza indice: il tratto della pagina più forte, con le stampate dalla mappa', () => {
    const x = CE.pagineTrovate(LIB, TESTI, '3.3.3', ['trasporto attivo'], LIN);
    eq(x.fonte, 'testo'); eq([x.pagine.pdfDa, x.pagine.pdfA, x.pagine.stampDa, x.pagine.stampA, x.pagine.affidabilita], [20, 22, 16, 18, 'esatta']);
    eq(x.copertura.stato, 'da_verificare', 'solo BM25: un segnale');
    vero(/🟡 da verificare · pagine trovate nel testo: p\. 16–18 \(PDF 20–22\)/.test(CE.descriviTrovate(x)), CE.descriviTrovate(x));
  });
  t('pagineTrovate: le pagine verificate dalle citazioni (MappaPagine) sono il secondo segnale → coperto', () => {
    eq(CE.pagineTrovate(LIB, TESTI, '3.3.3', ['trasporto attivo'], LIN, [21]).copertura.stato, 'coperto');
  });
  t('pagineTrovate con indice: intervallo dell\'indice (fonte C) e stato dai due segnali su tre', () => {
    const conIndice = { ...LIB, indice: [{ capitolo: '3.3.2 Trasporto passivo', pagina: 10 }, { capitolo: '3.3.3 Trasporto attivo', pagina: 16 }, { capitolo: '3.3.4 Endocitosi', pagina: 19 }] };
    const x = CE.pagineTrovate(conIndice, TESTI, '3.3.3', CE.terminiMicro(conIndice.indice, '3.3.3', []), LIN);
    eq(x.fonte, 'indice'); eq([x.pagine.pdfDa, x.pagine.pdfA], [20, 22]); eq(x.copertura.stato, 'coperto');
  });
  t('pagineTrovate: correzioni a mano del libro vincono; nessun termine nel libro → lacuna senza pagine', () => {
    const mano = { ...LIB, pagineMano: { '3.3.3': { escluse: [20, 21, 22], incluse: [8] } } };
    const x = CE.pagineTrovate(mano, TESTI, '3.3.3', ['trasporto attivo'], LIN);
    eq([x.pagine.pdfDa, x.pagine.pdfA, x.copertura.stato], [8, 8, 'coperto']);
    const v = CE.pagineTrovate(LIB, TESTI, '3.3.3', ['fotosintesi'], LIN);
    eq([v.pagine, v.copertura.stato], [null, 'lacuna']); vero(/🔴 non trovato/.test(CE.descriviTrovate(v)));
  });
}
// =====================================================================
console.log('\n== Fase 14: unire e dividere i micro-step (nel piano, prima dell\'import) ==');
{
  const LIN = { radice: w => w.length > 6 ? w.slice(0, -2) : w.length > 4 ? w.slice(0, -1) : w, espandi: p => p };
  /** 4 schede: S1–S2 in 3.3.1, S3–S4 in 3.3.2 (stesso blocco), un solo blocco. */
  const quattro = () => CE.daPiano(C.aPiano(C.leggi(JSON.stringify({ formato: 'piano-v1', blocchi: [{ codice: '3.3', titolo: 'Membrane',
    copre: [{ schede: ['S1', 'S2'], micro: ['3.3.1'] }, { schede: ['S3', 'S4'], micro: ['3.3.2'] }] }] }))), '3.3');
  const tutte = p => p.schede.map(x => x.n);
  t('gruppi: schede per microstep nell\'ordine della prima scheda (come le sotto-schede della chiusura)', () => {
    eq(CE.gruppi(quattro()).map(g => [g.micro, g.schede.map(x => x.n)]), [['3.3.1', [1, 2]], ['3.3.2', [3, 4]]]);
  });
  t('unisci: le schede di 3.3.2 passano in 3.3.1, numeri invariati, 3.3.2 resta coperto e resta la fonte delle pagine', () => {
    const p = quattro(), q = CE.unisci(p, '3.3.1', '3.3.2');
    eq(tutte(q), [1, 2, 3, 4], 'nessuna scheda persa o rinumerata');
    eq(q.schede.map(x => [x.micro, CE.fonte(x)]), [[['3.3.1'], '3.3.1'], [['3.3.1'], '3.3.1'], [['3.3.1', '3.3.2'], '3.3.2'], [['3.3.1', '3.3.2'], '3.3.2']]);
    eq(p.schede[2].micro, ['3.3.2'], 'il piano di partenza non cambia');
    eq(CE.schede(q, OPZ).map(s => s.id), ['B-3.3.1-1', 'B-3.3.1-2', 'B-3.3.1-3', 'B-3.3.1-4']);
    const ps = CE.chiusura(q, OPZ).programmaCalendario.pianoStrutturato;
    eq(ps.sottoSchede.map(x => [x.codice, x.microstep, x.schedePrioritarie.length, x.durataMin]), [['3.3.1', ['3.3.1', '3.3.2'], 4, 50]], 'una sotto-scheda, tutto il tempo');
  });
  t('dividi: dopo S1 → S2 in un microstep nuovo (fratello libero), con le pagine di quello d\'origine', () => {
    const q = CE.dividi(quattro(), '3.3.1', 1);
    eq(q.schede.map(x => [x.n, x.micro[0], CE.fonte(x)]), [[1, '3.3.1', '3.3.1'], [2, '3.3.3', '3.3.1'], [3, '3.3.2', '3.3.2'], [4, '3.3.2', '3.3.2']]);
    eq(q.nuovi, ['3.3.3']);
    eq(CE.gruppi(q).map(g => g.micro), ['3.3.1', '3.3.3', '3.3.2']);
    vero(q.schede.every(x => x.micro.every(m => m.startsWith('3.3.'))), 'nuovo codice dentro lo step');
    eq(CE.dividi(quattro(), '3.3.1', 2), null, 'dopo l\'ultima scheda non si divide');
    eq(CE.dividi(quattro(), '3.3.9', 1), null, 'microstep inesistente');
  });
  t('dividi poi unisci = piano di partenza (il codice creato sparisce, niente fonte residua)', () => {
    const p = quattro(), q = CE.unisci(CE.dividi(p, '3.3.1', 1), '3.3.1', '3.3.3');
    eq(q.schede, p.schede); vero(!q.nuovi, 'nuovi vuoto');
  });
  t('nuovoCodice: segue il più alto del piano anche fra i coperti e le fonti; sotto-livelli restano nello stesso padre', () => {
    const p = quattro(); p.schede[3].micro = ['3.3.2', '3.3.7'];
    eq(CE.nuovoCodice(p, '3.3.1'), '3.3.8');
    const d = CE.daPiano(C.aPiano(C.leggi(JSON.stringify({ formato: 'piano-v1', blocchi: [{ codice: '3.3', titolo: 'X', copre: [{ schede: ['S1', 'S2'], micro: ['3.3.1.2'] }] }] }))), '3.3');
    eq(CE.dividi(d, '3.3.1.2', 1).schede[1].micro, ['3.3.1.3']);
  });
  t('riallinea: unire/dividere conserva le schede arrivate; categoria cambiata, piano riletto o schede tolte → da fare', () => {
    const p = quattro(), fl = [{ n: 1, stato: 'arrivata', parteId: 'x' }, { n: 2, stato: 'interrotta' }, { n: 3, stato: 'arrivata' }, { n: 4, stato: 'da-fare' }];
    const st = q => CE.riallinea(p, fl, q).map(x => x.stato);
    eq(st(CE.unisci(p, '3.3.1', '3.3.2')), ['arrivata', 'interrotta', 'arrivata', 'da-fare']);
    eq(st(CE.dividi(p, '3.3.1', 1)), ['arrivata', 'interrotta', 'arrivata', 'da-fare']);
    eq(CE.riallinea(p, fl, p)[0], { n: 1, stato: 'arrivata', parteId: 'x' }, 'parte conservata');
    const c = JSON.parse(JSON.stringify(p)); c.schede[2].categoria = 'raffinamento';
    eq(st(c), ['arrivata', 'interrotta', 'da-fare', 'da-fare']);
    const m = JSON.parse(JSON.stringify(p)); m.schede[0].micro = ['3.3.2'];
    eq(st(m)[0], 'da-fare', 'microstep cambiato a mano: le pagine sono altre');
    eq(st({ ...p, azzera: true }), ['da-fare', 'da-fare', 'da-fare', 'da-fare']);
    eq(CE.riallinea(undefined, undefined, p).map(x => x.stato), ['da-fare', 'da-fare', 'da-fare', 'da-fare'], 'prima approvazione');
  });
  t('minutiMicro: blocchi × 50 min ripartiti per schede, come la chiusura', () => {
    eq(CE.minutiMicro(quattro()), { '3.3.1': 25, '3.3.2': 25 });
    const p = quattro(); p.blocchi = ['A', 'B', 'C'];
    eq(CE.minutiMicro(p), { '3.3.1': 75, '3.3.2': 75 });
  });
  t('proposte «Dividi?»: più di 4 concetti nuovi O più minuti di una sessione; mai con una sola scheda; punto a metà', () => {
    const p = quattro();
    eq(CE.proposte(p, { concetti: { '3.3.1': ['a', 'b', 'c', 'D', 'd'] } }, LIN), [], '4 distinti (d = D): non basta');
    const x = CE.proposte(p, { concetti: { '3.3.1': ['a', 'b', 'c', 'd', 'e'] } }, LIN);
    eq(x.map(y => [y.tipo, y.micro, y.dopo]), [['dividi', '3.3.1', 1]]); vero(/5 concetti nuovi/.test(x[0].motivo), x[0].motivo);
    const lungo = quattro(); lungo.blocchi = ['A', 'B', 'C'];
    const y = CE.proposte(lungo, {}, LIN);
    eq(y.map(z => [z.tipo, z.micro]), [['dividi', '3.3.1'], ['dividi', '3.3.2']]); vero(/~75 min \(più di una sessione da 50\)/.test(y[0].motivo), y[0].motivo);
    const solo = CE.unisci(quattro(), '3.3.1', '3.3.2'); solo.schede = solo.schede.slice(0, 1); solo.blocchi = ['A', 'B', 'C'];
    eq(CE.proposte(solo, {}, LIN), [], 'una scheda non si divide');
  });
  t('proposte «Unisci?»: doppione di Copertura (stessi concetti, pagine ≥ 50%); senza pagine o pagine diverse → niente', () => {
    const p = quattro();
    const u = CE.proposte(p, { pagine: { '3.3.1': [10, 14], '3.3.2': [12, 15] } }, LIN);
    eq(u.map(z => [z.tipo, z.micro, z.con]), [['unisci', '3.3.1', '3.3.2']]); vero(/75%/.test(u[0].motivo), u[0].motivo);
    eq(CE.proposte(p, {}, LIN), [], 'pagine ignote');
    eq(CE.proposte(p, { pagine: { '3.3.1': [10, 14], '3.3.2': [30, 34] } }, LIN), [], 'altre pagine = ripetizione didattica');
    eq(CE.proposte(p, { pagine: { '3.3.1': [10, 14], '3.3.2': [12, 15] }, concetti: { '3.3.1': ['osmosi', 'diffusione'], '3.3.2': ['pompa sodio', 'endocitosi'] } }, LIN), [], 'concetti diversi');
  });
  t('pipeline: piano unito → chiusura → import con gli id del piano nuovo (nessun record esistente: gli id nascono qui)', () => {
    const q = CE.unisci(quattro(), '3.3.1', '3.3.2');
    const u = IP.unisci(IP.raggruppa([parte('biologia-3.3-s1-2', [1, 2]), parte('biologia-3.3-s3-4', [3, 4]), comeFile(CE.chiusura(q, OPZ))])[0]);
    eq(u.bloccanti.length, 0);
    const tr = ID.traduci(u.pacchetto, '2026-11-20');
    eq(tr.sub.microstep.map(m => [m.n, m.schede.map(s => s.id)]), [['3.3.1', ['B-3.3.1-1', 'B-3.3.1-2', 'B-3.3.1-3', 'B-3.3.1-4']]]);
    const d = CE.dividi(quattro(), '3.3.2', 3);
    const ud = IP.unisci(IP.raggruppa([parte('biologia-3.3-s1-2', [1, 2]), parte('biologia-3.3-s3-4', [3, 4]), comeFile(CE.chiusura(d, OPZ))])[0]);
    eq(ID.traduci(ud.pacchetto, '2026-11-20').sub.microstep.map(m => [m.n, m.schede.map(s => s.id)]), [['3.3.1', ['B-3.3.1-1', 'B-3.3.1-2']], ['3.3.2', ['B-3.3.2-3']], ['3.3.3', ['B-3.3.3-4']]]);
  });
}
// =====================================================================
console.log('\nCentro ' + ok + '/' + (ok + ko));
process.exit(ko ? 1 : 0);
