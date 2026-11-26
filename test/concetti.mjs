// test/concetti.mjs — motore unificato, blocco 6: test del modulo puro src/su-richiesta/07-concetti.ts
// (etichette dal focus, assegnazione BM25 con margine 30% e ripiego dichiarato, padronanza FSRS per concetto 'con:', stati
// dell'audit §14) più la misura sulla banca reale e le guardie statiche sugli agganci. Transpila al volo (mai dist/).
// Uso: node test/concetti.mjs   (codice di uscita 1 se qualcosa fallisce; ultima riga «Concetti N/N»)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(QUI, '..', 'src');
const leggi = f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n');
const ts = createRequire(import.meta.url)('typescript');

let ok = 0, ko = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nome); }
  catch (e) { ko++; console.log('  ✗ ' + nome + ' — ' + (e && e.message)); }
}
function eq(a, b, m) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((m || 'atteso') + ': ' + y + ', ottenuto ' + x); }
function vero(c, m) { if (!c) throw new Error(m || 'condizione falsa'); }

const sb = { console };
vm.createContext(sb);
const carica = (f, nome) => vm.runInContext(ts.transpileModule(leggi(f), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText + '\n;this.' + nome + ' = ' + nome + ';', sb);
carica('07-fsrs.ts', 'Fsrs'); carica('07-locale.ts', 'Locale'); carica('su-richiesta/07-indicepagine.ts', 'IndicePagine'); carica('su-richiesta/07-concetti.ts', 'Concetti');
const C = sb.Concetti, L = sb.Locale;
const conto = m => [...m.values()].reduce((o, a) => { o[a.ripiego ? '*' : a.etichetta] = (o[a.ripiego ? '*' : a.etichetta] || 0) + 1; return o; }, {});

// ---------- etichette ----------
t('etichette: virgole e punti e virgola dividono, quelle tra parentesi no; niente doppioni né frammenti', () => {
  eq(C.etichette('Glicolisi, fase di investimento (esochinasi, PFK-1); resa di 2 ATP, glicolisi, ok'),
    ['Glicolisi', 'fase di investimento (esochinasi, PFK-1)', 'resa di 2 ATP']);
  eq(C.etichette(''), []);
});
t('etichette: al massimo 12 per scheda, ognuna ≤ 80 caratteri', () => {
  const e = C.etichette(Array.from({ length: 20 }, (_, i) => 'argomento numero ' + i + ' ' + 'x'.repeat(100)).join(', '));
  vero(e.length === 12 && e.every(x => x.length <= 80), e.length + ' ' + Math.max(...e.map(x => x.length)));
});

// ---------- assegnazione ----------
const ET = ['Glicolisi e sue tappe', 'Ciclo di Krebs nel mitocondrio', 'Fermentazione lattica e alcolica'];
const D = [
  { id: 'a', q: 'Quante molecole di ATP produce la glicolisi nelle sue tappe?', giusta: 'Due', spieg: 'La glicolisi rende 2 ATP netti.' },
  { id: 'b', q: 'Dove avviene il ciclo di Krebs?', giusta: 'Nella matrice del mitocondrio', spieg: '' },
  { id: 'c', q: 'Il lievito in assenza di ossigeno svolge la fermentazione:', giusta: 'alcolica', spieg: 'Produce etanolo e CO2.' },
  { id: 'd', q: 'Quale affermazione è vera?', giusta: 'Nessuna delle altre', spieg: '' },
];
t('assegnazione BM25: ogni domanda chiara va al suo concetto; quella senza termini comuni va in ripiego (dichiarato)', () => {
  const m = C.assegna('B-1', 'Metabolismo', D, ET, L);
  eq(['a', 'b', 'c'].map(k => m.get(k).etichetta), ET);
  vero(m.get('d').ripiego && m.get('d').etichetta === 'Metabolismo' && m.get('d').chiave === 'B-1|*', JSON.stringify(m.get('d')));
});
t('margine del 30%: due concetti quasi pari → ripiego, mai un\'assegnazione a caso', () => {
  const m = C.assegna('B-1', 'Metabolismo', [{ id: 'x', q: 'Glicolisi o Krebs?', giusta: 'glicolisi e Krebs' }], ['Glicolisi', 'Krebs'], L);
  vero(m.get('x').ripiego, JSON.stringify(m.get('x')));
  eq(C.MARGINE, 1.3);
});
t('concetto scelto dall\'AI: vince sul BM25 e prende la grafia della lista se coincide (stesso slug)', () => {
  const m = C.assegna('B-1', 'Metabolismo', [{ id: 'a', q: D[0].q, concetto: 'ciclo di krebs nel MITOCONDRIO' }, { id: 'z', q: 'x', concetto: 'Navette redox' }], ET, L);
  eq([m.get('a').etichetta, m.get('z').etichetta, m.get('z').ripiego], ['Ciclo di Krebs nel mitocondrio', 'Navette redox', false]);
});
t('meno di 2 etichette e nessun concetto esplicito: tutto ripiego sulla scheda', () => {
  const m = C.assegna('B-2', 'Scheda', D.slice(0, 2), ['Glicolisi'], L);
  vero([...m.values()].every(a => a.ripiego && a.chiave === 'B-2|*'));
});
t('generalità: stesso comportamento su una materia mai vista (storia), nessuna costante per libro', () => {
  const et = C.etichette('Cause della Riforma protestante, Pace di Augusta (1555), Concilio di Trento e Controriforma');
  const m = C.assegna('S-1', 'Riforma', [
    { id: '1', q: 'Quale principio stabilì la pace di Augusta?', giusta: 'Cuius regio, eius religio' },
    { id: '2', q: 'In quale città si riunì il concilio della Controriforma?', giusta: 'Trento' },
    { id: '3', q: 'Tra le cause della Riforma protestante c\'è:', giusta: 'la vendita delle indulgenze' }], et, L);
  eq(['1', '2', '3'].map(k => m.get(k).etichetta), [et[1], et[2], et[0]]);
});
t('stabilità degli id: la chiave del concetto dipende solo da scheda + etichetta normalizzata', () => {
  eq(C.chiave('B-1', 'Ciclo di Krebs (mitocondrio)'), C.chiave('B-1', '  ciclo di KREBS mitocondrio '));
  vero(C.chiave('B-1', 'Krebs') !== C.chiave('B-2', 'Krebs'));
});

// ---------- padronanza ----------
const BASE = (k = 'c1') => ({ id: 'mem-con-' + k, chiave: 'B-1|' + k, sk: 'B-1', etichetta: 'Krebs', ripiego: false });
const G = n => Array.from({ length: n }, () => ({ ok: true, caso: 'padronanza' }));
const S = n => Array.from({ length: n }, () => ({ ok: false, caso: 'standard' }));
t('voto della verifica: illusione o < 50% → 1; < 80% → 2; tutto giusto su ≥ 3 senza fortuna → 4; altrimenti 3', () => {
  eq([C.voto(3, 3, 1, 0), C.voto(1, 3, 0, 0), C.voto(3, 4, 0, 0), C.voto(3, 3, 0, 0), C.voto(2, 2, 0, 0), C.voto(3, 3, 0, 1)], [1, 1, 2, 4, 3, 3]);
});
t('prima verifica: record memoria er \'con:\' con FSRS; stato «da consolidare» (verificato in un solo giorno)', () => {
  const m = C.aggiorna(undefined, BASE(), G(3), '2026-11-20');
  eq([m.type, m.er, m.n, m.lapsi, m.ver], ['memoria', 'con:B-1|c1', 1, 0, [['2026-11-20', 3, 3, 0]]]);
  vero(m.due > '2026-11-20' && m.s > 3, m.due + ' ' + m.s);
  eq(C.stato(m, '2026-11-20').stato, 'da_consolidare');
});
t('stesso giorno, due quiz: gli esiti si sommano e il passo FSRS si rifà dallo stato precedente (un passo al giorno)', () => {
  const a = C.aggiorna(undefined, BASE(), G(3), '2026-11-20'), b = C.aggiorna(a, BASE(), S(3), '2026-11-20');
  eq([b.n, b.ver, b.log.length], [1, [['2026-11-20', 3, 6, 0]], 1]);
  const solo = C.aggiorna(undefined, BASE(), G(3).concat(S(3)), '2026-11-20');
  eq([b.s, b.d, b.due], [solo.s, solo.d, solo.due], 'come un\'unica verifica da 6');
});
t('mai verificato = «non verificato», non «sbagliato»; errori gravi → «da studiare» col motivo', () => {
  eq(C.stato(undefined, '2026-11-20').stato, 'non_verificato');
  const m = C.aggiorna(undefined, BASE(), G(1).concat(S(3)), '2026-11-20');
  const s = C.stato(m, '2026-11-20'); eq([s.stato, s.motivo], ['da_studiare', 'ultima verifica 25%']);
});
t('consolidato: ≥ 3 giorni su ≥ 7, ultime 2 ≥ 80%, S ≥ 21, nessuna illusione; poi R < 0,80 lo riporta «da consolidare»', () => {
  let m;
  for (const g of ['2026-11-01', '2026-11-05', '2026-11-20', '2026-12-20']) m = C.aggiorna(m, BASE(), G(4), g);
  const s = C.stato(m, '2026-12-20');
  vero(s.stato === 'consolidato' && m.s >= 21, JSON.stringify(s));
  const tardi = new Date(Date.parse('2026-12-20') + Math.ceil(m.s * 4) * 86400000).toISOString().slice(0, 10);   // R < 0,80 quando t > 2,4·S (1 + F·t/S > 1,5625)
  eq(C.stato(m, tardi).stato, 'da_consolidare', 'molto dopo la stabilità il ricordo scende (' + tardi + ')');
});
t('affidabilità: con < 3 domande nell\'ultima verifica non si va oltre «in consolidamento»', () => {
  let m;
  for (const g of ['2026-11-01', '2026-11-05', '2026-11-20']) m = C.aggiorna(m, BASE(), G(4), g);
  m = C.aggiorna(m, BASE(), G(2), '2026-12-20');
  const s = C.stato(m, '2026-12-20'); eq(s.stato, 'in_consolidamento'); vero(/solo 2 domande/.test(s.motivo), s.motivo);
});
t('2 errori gravi nelle ultime 3 verifiche → «da studiare» anche se l\'ultima va bene', () => {
  let m;
  m = C.aggiorna(m, BASE(), S(3), '2026-11-01'); m = C.aggiorna(m, BASE(), [{ ok: false, caso: 'illusione_competenza' }].concat(G(3)), '2026-11-03');
  m = C.aggiorna(m, BASE(), G(4), '2026-11-05');
  eq(C.stato(m, '2026-11-05').stato, 'da_studiare');
});
t('microstep = concetto più debole; un concetto non verificato impedisce «consolidato» (nessuna generalizzazione)', () => {
  const st = s => ({ stato: s });
  eq(C.insieme([st('consolidato'), st('da_consolidare')]), { stato: 'da_consolidare', verificati: 2, totale: 2 });
  eq(C.insieme([st('consolidato'), st('non_verificato')]), { stato: 'in_consolidamento', verificati: 1, totale: 2 });
  eq(C.insieme([st('non_verificato')]).stato, 'non_verificato');
});

// ---------- banca reale (pilota): copertura dell'assegnazione ----------
t('pilota: sulla banca BIO/CHI/FIS almeno il 60% delle domande riceve un concetto (soglia di utilità dell\'audit)', () => {
  let tot = 0, ass = 0;
  for (const f of ['banca-step-2.json', 'banca-step-3.json']) {
    const b = JSON.parse(fs.readFileSync(path.join(QUI, '..', 'studio', 'banca', f), 'utf8'));
    const per = new Map(); for (const d of b.domande) { if (!per.has(d.sk)) per.set(d.sk, []); per.get(d.sk).push(d); }
    for (const [sk, ds] of per) {
      const sc = b.schede[sk] || {}, et = C.etichette(sc.focus || '');
      const m = C.assegna(sk, sc.titolo || sk, ds.map(d => ({ id: d.id, q: d.q, giusta: d.t === 'mcq' ? d.o[0] : (d.a || []).join(' '), spieg: Array.isArray(d.e) ? d.e.join(' ') : d.e })), et, L);
      tot += ds.length; ass += [...m.values()].filter(a => !a.ripiego).length;
    }
  }
  console.log('     (assegnate ' + ass + '/' + tot + ' = ' + (ass * 100 / tot).toFixed(1) + '%)');
  vero(tot > 3000 && ass / tot >= 0.6, ass + '/' + tot);
});

// ---------- agganci (guardie statiche) ----------
t('padronanza solo dalle verifiche: Concetti.aggiorna è chiamato solo da FineQuizUI (mai da appunti, carte, letture)', () => {
  const dove = [];
  for (const dir of ['', 'su-richiesta']) for (const f of fs.readdirSync(path.join(SRC, dir)).filter(x => x.endsWith('.ts')))
    if (/Concetti\.aggiorna\(/.test(leggi(path.join(dir, f)))) dove.push(f);
  eq(dove, ['07-finequizui.ts']);
  vero(/if \(r\.dettagli && !r\.errori\) \{ const pd = padronanza\(id, det\)/.test(leggi('su-richiesta/07-finequizui.ts')), 'solo quiz nell\'app, non «Rifai solo gli errori»');
});
t('annullabile: il toast del salvataggio ripristina i record con: e le carte aggiornate', () => {
  const s = leggi('su-richiesta/07-finequizui.ts');
  vero(/aggiungiAnnulla\(pd\.annulla\)/.test(s) && /aggiungiAnnulla\(aggiornaCarte\(id, p\)\)/.test(s));
});
t('QuizApp passa tutte le risposte e il focus della banca; DomB.concetto facoltativo; il contratto non lo rende obbligatorio', () => {
  const q = leggi('07-quizapp.ts');
  vero(/r\.dettagli = P\.filter\(x => !x\.d\.gen && x\.ok != null\)/.test(q) && /focus: B\.schede\[s\.id\]\.focus/.test(q) && /concetto\?: string; \}/.test(q));
  vero(!/'concetto'/.test(leggi('su-richiesta/07-contratto.ts').split('const Contratto')[0]), 'non in CHIAVI_QUIZ (obbligatorie)');
  vero(/FACOLTATIVE: ReadonlyArray<string> = \['concetto'\]/.test(leggi('su-richiesta/07-validatore.ts')));
  vero(/if \(s\(x\.concetto\)\) d\.concetto = s\(x\.concetto\)\.slice\(0, 60\)/.test(leggi('07-importadrive.ts')));
});

console.log('\nConcetti ' + ok + '/' + (ok + ko) + (ko ? ' — ' + ko + ' falliti' : ''));
process.exit(ko ? 1 : 0);
