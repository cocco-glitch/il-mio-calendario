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

// ---------- fase 3 (27/11): formule e sigle nell'indice ----------
{
  const I = sb.IndicePagine;
  t('simboli: ΔG ≠ ΔH, pH, O₂, ioni, uguaglianze intere; niente sigle finte (Il, II, IV, tras-) né doppioni di mRNA/pKa', () => {
    eq(I.parole('ΔG = ΔH − TΔS'), ['§deltag=deltah-tdeltas', '§deltag', '§deltah']);
    eq(I.parole('pH e pKa'), ['pka', '§ph']);
    eq(I.parole('O₂ e CO₂'), ['co2', '§o2']);
    eq(I.parole('ioni H⁺, Ca²⁺, Cl- e Na+'), ['ioni', 'ca2', '§h+', '§ca2+', '§cl-', '§na+']);
    eq(I.parole('F = m · a e PV = nRT'), ['nrt', '§f=m*a', '§pv=nrt', '§pv']);
    eq(I.parole('Il complesso II e i complessi I-IV, mRNA, tras-\nporto'), ['complesso', 'complessi', 'mrna', 'tras', 'porto']);
    eq(I.rad(L, '§deltag'), '§deltag', 'i simboli non passano dalla radice'); eq(I.rad(L, 'deltag'), L.radice('deltag'));
  });
  t('simboli: una domanda su ΔG va all\'etichetta di ΔG, non a quella di ΔH (prima: ripiego, Δ spariva)', () => {
    const et = ['ΔH = qp', 'ΔG = ΔH - TΔS', 'segno di ΔS'];
    const m = C.assegna('C-1', 'Termodinamica', [{ id: 'a', q: 'Quanto vale ΔG se ΔH = −10 kJ e TΔS = +5 kJ?' }, { id: 'b', q: 'A pressione costante il calore scambiato è:', giusta: 'ΔH = qp' }, { id: 'c', q: 'Quanto vale ΔH se ΔG = 0?' }], et, L);
    eq([m.get('a').etichetta, m.get('b').etichetta, m.get('c').etichetta], ['ΔG = ΔH - TΔS', 'ΔH = qp', 'ΔG = ΔH - TΔS'], 'c cita ΔH e ΔG: vince l\'etichetta che li ha entrambi');
  });
  t('simboli: generalità su una materia mai vista (economia: ΔY, PIL, «Y = C + I + G») e pagine trovate per «pH» in un libro sintetico', () => {
    eq(I.parole('Il moltiplicatore: ΔY = ΔG / (1 − c), PIL e Y = C + I + G'), ['moltiplicatore', 'pil', '§deltay=deltag/(1-c)', '§y=c+i+g', '§deltay', '§deltag']);
    const ind = I.costruisci('Sintetico', [{ n: 1, testo: 'Introduzione alla chimica delle soluzioni acquose' }, { n: 2, testo: 'Il pH misura l\'acidità: pH = −log[H⁺]' }, { n: 3, testo: 'Soluzioni tampone e pOH' }], L);
    const c = I.copertura(ind, ['pH']);
    vero(c.riscontri.some(r => r.n === 2) && !c.riscontri.some(r => r.n === 1), JSON.stringify(c.riscontri.map(r => r.n)));
  });
}

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

// ---------- blocco 7: riepilogo per la vista padronanza ----------
t('riepilogo: «N di M» con M dal focus (nEt), i non verificati restano tali, il ripiego a parte; ordine dal più debole', () => {
  const a = C.aggiorna(undefined, { ...BASE('a'), etichetta: 'Krebs', nEt: 5 }, G(3), '2026-11-20');
  const b = C.aggiorna(undefined, { ...BASE('b'), etichetta: 'Glicolisi', nEt: 5 }, S(3), '2026-11-20');
  const r = C.aggiorna(undefined, { ...BASE('*'), etichetta: 'Scheda', ripiego: true }, G(2), '2026-11-20');
  const altro = C.aggiorna(undefined, { id: 'mem-con-x', chiave: 'C-9|x', sk: 'C-9', etichetta: 'pH', ripiego: false }, G(4), '2026-11-20');
  const out = C.riepilogo([altro, a, b, r, { ...a, id: 'z', deleted: true }], '2026-11-21');
  eq(out.map(x => x.sk), ['B-1', 'C-9']);
  const x = out[0];
  eq([x.totale, x.nonVerificati, x.concetti.length], [5, 3]  .concat([2]));
  eq(x.concetti.map(c => c.etichetta), ['Glicolisi', 'Krebs']);   // da studiare prima di da consolidare
  eq(x.insieme, 'da_studiare'); vero(x.ripiego && x.ripiego.stato === 'da_consolidare', JSON.stringify(x.ripiego));
  eq([out[1].totale, out[1].nonVerificati], [1, 0]);   // senza nEt: M = concetti visti
});
t('riepilogo: nEt si conserva fra verifiche anche quando la nuova non lo porta', () => {
  const a = C.aggiorna(undefined, { ...BASE('a'), nEt: 4 }, G(3), '2026-11-20'), b = C.aggiorna(a, BASE('a'), G(3), '2026-11-22');
  eq(b.nEt, 4);
});
t('vista padronanza: solo lettura (nessun Stato.salva), guscio nel bundle principale che carica il chunk solo con record con:', () => {
  const ui = leggi('su-richiesta/07-padronanzaui.ts'), ex = leggi('07-extra.ts');
  vero(!/Stato\.(salva|elimina)/.test(ui), 'la vista non scrive');
  vero(/startsWith\('con:'\)\);\n  if \(!ci\)/.test(ex) && /PadronanzaUI\.riempi\(el\)/.test(ex) && /sezionePadronanza\(\),/.test(ex));
  vero(/non verificato/.test(ui) && !/'[^'\n]*[^0-9]0%/.test(ui), 'mai 0% per i non verificati (nei testi mostrati)');
});
t('correzione manuale: l\'editor scrive `concetto` nella modifica (modq) e QuizApp passa il focus; assegna lo usa per primo', () => {
  const q = leggi('07-quizapp.ts');
  vero(/if \(conc\.value\) n\.concetto = conc\.value; else delete n\.concetto;/.test(q) && /\}, false, dati\.focus \|\| ''\);/.test(q));
  const m = C.assegna('B-1', 'Scheda', [{ id: 'q1', q: 'Quanti ATP produce la glicolisi?', concetto: 'Krebs' }], ['Glicolisi', 'Krebs'], L);
  eq(m.get('q1').etichetta, 'Krebs');
});

// ---------- agganci (guardie statiche) ----------
t('padronanza solo dalle verifiche: Concetti.aggiorna è chiamato solo da FineQuizUI (mai da appunti, carte, letture)', () => {
  const dove = [];
  for (const dir of ['', 'su-richiesta']) for (const f of fs.readdirSync(path.join(SRC, dir)).filter(x => x.endsWith('.ts')))
    if (/Concetti\.aggiorna\(/.test(leggi(path.join(dir, f)))) dove.push(f);
  eq(dove, ['07-finequizui.ts']);
  vero(/if \(r\.dettagli && !r\.errori\) \{ const pd = padronanza\(id, det, Concetti\.etichette\(r\.focus \|\| ''\)\.length\)/.test(leggi('su-richiesta/07-finequizui.ts')), 'solo quiz nell\'app, non «Rifai solo gli errori»');
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

// ---------- S9 (F1/F2): mini-verifica dei concetti ----------
carica('su-richiesta/07-verificaconcetti.ts', 'VerificaConcetti');
const V = sb.VerificaConcetti;
const assMap = coppie => new Map(coppie.map(([id, e]) => [id, { chiave: 'x|' + e, etichetta: e === '*' ? 'Scheda' : e, ripiego: e === '*' }]));
t('S9 scegli: 3 domande per concetto (soglia di affidabilità), alternate A B C A B C, prima le mai viste, mai il ripiego, al più 3 concetti', () => {
  vero(V.PER === C.MIN_AFFIDABILE && V.MAX_CON === 3, 'PER = MIN_AFFIDABILE: con meno domande «consolidato» sarebbe irraggiungibile');
  const dom = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'c1', 'd1', 'r1'].map(id => ({ id }));
  const ass = assMap([['a1', 'Alfa'], ['a2', 'Alfa'], ['a3', 'Alfa'], ['a4', 'Alfa'], ['b1', 'Beta'], ['b2', 'Beta'], ['c1', 'Gamma'], ['d1', 'Delta'], ['r1', '*']]);
  const vista = id => ({ a1: '2026-11-20', a2: '', a3: '2026-11-01', a4: '2026-11-10' })[id] || '';
  eq(V.scegli(dom, ass, ['Alfa', 'Beta', 'Gamma', 'Delta'], vista).map(d => d.id), ['a2', 'b1', 'c1', 'a3', 'b2', 'a4']);
  eq(V.scegli(dom, ass, ['alfa'], vista).length, 3, 'confronto sullo slug (maiuscole)');
  eq(V.scegli(dom, ass, ['Scheda'], vista), [], 'il ripiego non è un concetto da verificare');
});
const memC = (sk, e, ver, due, extra = {}) => ({ id: 'm-' + sk + e, type: 'memoria', er: 'con:' + sk + '|' + e, sk, etichetta: e, ultimo: ver[ver.length - 1][0], due, s: 4, d: 5, n: ver.length,
  ver, log: ver.map(v => [v[0], v[1] === v[2] ? 3 : 1]), ...extra });
t('S9 perFinale: solo concetti già verificati e NON scaduti, niente ripiego; schede dalla più debole; al più 3 concetti per scheda', () => {
  const g = '2026-11-16';
  const mem = [memC('C-1', 'Legami', [['2026-11-13', 3, 3, 0]], '2026-11-20'), memC('C-1', 'Moli', [['2026-11-13', 1, 3, 0]], '2026-11-18'),
    memC('C-1', 'Scaduto', [['2026-11-13', 3, 3, 0]], '2026-11-15'), memC('C-1', 'Rip', [['2026-11-13', 3, 3, 0]], '2026-11-25', { ripiego: true }),
    memC('B-1', 'Cellula', [['2026-11-12', 3, 3, 0], ['2026-11-14', 3, 3, 0]], '2026-11-24'), memC('C-2', 'Gas', [['2026-11-13', 3, 3, 0]], '2026-11-22'),
    memC('F-1', 'Moto', [['2026-11-13', 0, 3, 0]], '2026-11-17'),
    memC('C-3', 'A', [['2026-11-13', 3, 3, 0]], '2026-11-30'), memC('C-3', 'B', [['2026-11-13', 3, 3, 0]], '2026-11-30'), memC('C-3', 'C', [['2026-11-13', 3, 3, 0]], '2026-11-30'), memC('C-3', 'D', [['2026-11-13', 3, 3, 0]], '2026-11-30')];
  const r = V.perFinale(mem, g, sk => sk[0]);
  const c1 = r.find(x => x.sk === 'C-1');
  eq(c1.etichette, ['Moli', 'Legami'], 'C-1: prima il più debole; niente scaduto (lo porta la coda) né ripiego');
  eq(c1.peggiore, 'da_studiare');
  vero(r.find(x => x.sk === 'C-3').etichette.length === 3, 'al più 3 concetti per scheda');
  eq(r.slice(0, 2).map(x => x.sk).sort(), ['C-1', 'F-1'], 'in testa le schede con un concetto da studiare');
  vero(r.every((x, i) => !i || x.materia !== r[i - 1].materia || r.slice(i).every(y => y.materia === x.materia)), 'materie alternate finché ce ne sono più di una: ' + r.map(x => x.sk).join(' '));
});
t('S9 generalità: verifica su una materia mai vista (psichiatria), stessa regola', () => {
  const lista = ['recettori D2', 'effetti extrapiramidali', 'clozapina'];
  const dom = [{ id: 'p1', q: 'Quale recettore D2 bloccano gli antipsicotici tipici?', giusta: 'D2 dopaminergico' }, { id: 'p2', q: 'Che cos\'è la distonia acuta tra gli effetti extrapiramidali?', giusta: 'effetto extrapiramidale' },
    { id: 'p3', q: 'Perché la clozapina richiede il controllo dei neutrofili?', giusta: 'agranulocitosi da clozapina' }];
  const ass = C.assegna('PSI-1', 'Antipsicotici', dom, lista, L);
  eq(V.scegli(dom, ass, ['clozapina', 'recettori D2'], () => '').map(d => d.id), ['p3', 'p1']);
});
t('S9 agganci: coda «concetti» (app.js), voce «concetti» in Studia ora, settimana finale, verifica senza punteggio', () => {
  const co = leggi('07-coda.ts'), so = leggi('su-richiesta/07-studiaoraui.ts'), qa = leggi('07-quizapp.ts'), ca = leggi('07-cattura.ts');
  vero(/'concetti'\]/.test(co.split('\n').find(l => l.includes('const ORDINE')) || '') && /apri: \(\) => conMotoreStudio\(\(\) => VerificaConcetti\.avvia\(sk, x\.et\)\)/.test(co), 'sorgente concetti nella coda unica, chunk del motore');
  vero(/m\.due <= g && m\.ultimo/.test(co) && /!m\.ripiego/.test(co), 'solo scaduti e mai il ripiego');
  vero(/if \(v\.tipo === 'concetti' && v\.id\) \{ VerificaConcetti\.avvia\(v\.id, v\.con \|\| \[\]\)/.test(so), 'eseguiVoce');
  vero(/\/\^FINALE-\|~FIN~\/\.test\(x\.v\.k\)/.test(so) && /d >= 1 && d <= 7/.test(so) && /VerificaConcetti\.perFinale\(/.test(so), 'settimana finale: voce del piano o esame tra 1 e 7 giorni');
  vero(/if \(gen && !prova && info && info\.verifica\) \{ r\.verifica = true;/.test(qa) && /if \(d\.verifica\) \{/.test(ca), 'QuizApp → Cattura con verifica');
  vero(/'07-verificaconcetti\.js'\]/.test(fs.readFileSync(path.join(SRC, '..', 'build.mjs'), 'utf8')), 'nel chunk del motore');
});

// ---------- fase 9/12 (27/11): quiz manuali sui deboli e cumulativi, simulazione in app ----------
carica('su-richiesta/07-componiquiz.ts', 'ComponiQuiz');
const Q = sb.ComponiQuiz;
const memQ = () => [memC('C-1', 'Moli', [['2026-11-13', 1, 3, 0]], '2026-11-18'), memC('C-1', 'Legami', [['2026-11-13', 3, 3, 0]], '2026-11-20'),
  memC('C-1', 'Rip', [['2026-11-13', 0, 3, 0]], '2026-11-25', { ripiego: true }),
  memC('B-1', 'Cellula', [['2026-11-12', 3, 3, 0], ['2026-11-14', 3, 3, 0]], '2026-11-24'), memC('B-2', 'Dna', [['2026-11-01', 3, 3, 0], ['2026-11-05', 3, 3, 0], ['2026-11-09', 3, 3, 0]], '2026-11-15'),
  memC('F-1', 'Moto', [['2026-11-13', 2, 3, 0]], '2026-11-17'), memC('PSI-1', 'clozapina', [['2026-11-13', 0, 3, 0]], '2026-11-17')];
const mat = sk => sk.split('-')[0];
t('fase 9 deboli: da studiare/da consolidare o scaduti, mai il ripiego né i solidi non scaduti; dalla scheda peggiore, materie alternate; vale su una materia mai vista', () => {
  const r = Q.candidati('deboli', memQ(), '2026-11-16', mat, ['B-9'], []);
  eq(r.map(x => x.sk), ['C-1', 'PSI-1', 'F-1', 'B-2'], 'B-1 (in consolidamento, non scaduto) fuori; B-2 dentro perché scaduto, ma dopo F-1 (da consolidare); B-9 fatta ma senza quiz: solo nel cumulativo');
  eq(r[0].etichette, ['Moli', 'Legami'], 'C-1: prima il più debole, mai il ripiego');
  eq(Q.candidati('deboli', memQ(), '2026-11-16', mat, [], ['C', 'F']).map(x => x.sk), ['C-1', 'F-1'], 'filtro per materia');
});
t('fase 9 cumulativo: tutte le schede verificate + quelle fatte senza quiz in app (concetti dal focus al caricamento), dal ricordo più basso, materie alternate', () => {
  const r = Q.candidati('cumulativo', memQ(), '2026-11-16', mat, ['B-9', 'C-1'], []);
  eq(r.map(x => x.sk).sort(), ['B-1', 'B-2', 'B-9', 'C-1', 'F-1', 'PSI-1']);
  eq(r.find(x => x.sk === 'B-9').etichette, [], 'scheda fatta senza record con: → concetti dal focus');
  vero(r.every((x, i) => !i || x.materia !== r[i - 1].materia || r.slice(i).every(y => y.materia === x.materia)), 'materie alternate: ' + r.map(x => x.sk).join(' '));
  eq(Q.perScheda('deboli'), 9, 'deboli: 3 domande × 3 concetti (MIN_AFFIDABILE)'); eq(Q.perScheda('cumulativo'), 3, 'cumulativo: una per concetto');
});
t('fase 9 intreccia: domanda per domanda tra le schede (A1 B1 C1 A2 …) fino a n', () => {
  eq(Q.intreccia([['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']], 5), ['a1', 'b1', 'c1', 'a2', 'c2']);
  eq(Q.intreccia([['a1'], ['b1']], Infinity), ['a1', 'b1']);
});
t('fase 9 dividi: il risultato misto si divide per scheda (punteggio, sbagliate, dettagli), sempre «verifica» e «misto»; domande ignote scartate', () => {
  const r = { imc: 'quiz-risultato', pct: 50, giuste: 2, totale: 4, livelli: [], debole: null, errori: false, dettagli: [
    { id: 'a1', q: 'qa1', giusta: 'x', ok: true }, { id: 'b1', q: 'qb1', giusta: 'y', spieg: 'perché', ok: false }, { id: 'a2', q: 'qa2', giusta: 'z', ok: false }, { id: 'b2', q: 'qb2', giusta: 'w', ok: true }, { id: '??', q: '?', giusta: '', ok: false }] };
  const p = Q.dividi(r, new Map([['a1', 'C-1'], ['a2', 'C-1'], ['b1', 'B-1'], ['b2', 'B-1']]));
  eq([...p.keys()], ['C-1', 'B-1']);
  const c = p.get('C-1'), b = p.get('B-1');
  eq([c.giuste, c.totale, c.pct, c.dettagli.map(e => e.id), c.sbagliate], [1, 2, 50, ['a1', 'a2'], [['qa2', 'z', '']]]);
  eq([b.dettagli.map(e => e.id), b.sbagliate], [['b1', 'b2'], [['qb1', 'y', 'perché']]]);
  vero([c, b].every(x => x.verifica && x.misto && !x.errori), 'verifica: il punteggio delle schede non cambia');
});
t('fase 9/12 agganci: QuizApp passa il risultato a `fine` (non a Cattura), `ferma` chiude a tempo, Cattura muta, niente «Consolida» nel misto, ingresso dalla padronanza, voci SIM/REV, chunk', () => {
  const qa = leggi('07-quizapp.ts'), ca = leggi('07-cattura.ts'), fu = leggi('su-richiesta/07-finequizui.ts'), pu = leggi('su-richiesta/07-padronanzaui.ts'), st = leggi('07-studio.ts'), cq = leggi('su-richiesta/07-componiquiz.ts');
  vero(/if \(info\.fine\) info\.fine\(r\); else Cattura\.salva\(s\.id, r\);/.test(qa), 'fine al posto di Cattura.salva');
  vero(/if \(info && info\.ferma\) info\.ferma\(\(\) => \{ if \(!finito\) \{ finito = true; disegnaQ\(\); \} \}\);/.test(qa), 'ferma');
  vero(/Editor\.apri\(x\.d, x\.d\.sk \|\| s\.id,/.test(qa), 'l\'editor modifica la domanda nella SUA scheda');
  vero(/muto\?: boolean\): \(\) => void \{/.test(ca) && /if \(!muto\) avviso\(testo/.test(ca), 'Cattura muta: un solo avviso per tutte le schede');
  vero(/r\.dettagli && !r\.misto \? document\.querySelector\('\.qz-carta'\)/.test(fu), 'niente riquadro di una sola scheda nel misto');
  vero(/Cattura\.salva\(sk, rp, undefined, true\)/.test(cq) && /verifica: true,/.test(cq), 'una Cattura.salva in verifica per scheda');
  vero(/ComponiQuiz\.apri\(\{ tipo: 'deboli' \}\)/.test(pu) && /ComponiQuiz\.apri\(\{ tipo: 'cumulativo' \}\)/.test(pu), 'ingresso dalla vista padronanza');
  vero(/\/\^\(SIM\|VERIFICA\|REV-\)\/\.test\(x\.v\.k\)/.test(st) && /conMotoreStudio\(\(\) => ComponiQuiz\.daVoce\(x\.p, x\.v\)\)/.test(st), 'SIM/REV del piano aprono la simulazione e la revisione');
  vero(/'07-componiquiz\.js'/.test(fs.readFileSync(path.join(SRC, '..', 'build.mjs'), 'utf8')), 'nel chunk del motore');
});

console.log('\nConcetti ' + ok + '/' + (ok + ko) + (ko ? ' — ' + ko + ' falliti' : ''));
process.exit(ko ? 1 : 0);
