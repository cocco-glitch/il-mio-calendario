// test/contratto.mjs — v0.61 «Contratto AI»: test del lettore, degli adapter, del validatore e della mappa pagine.
// Carica 01-json.ts, 07-sezionispiegazione.ts, 07-importadrive-parti.ts e src/su-richiesta/*.ts (tranne la UI) in una sandbox vm,
// transpilati al volo con typescript (mai dist/). Fixture piccole in test/fixture-ai/.
// REALI=<cartella> con i JSON interi di Gemini (fuori dal repo) attiva il confronto con v0.60.
// Uso: node test/contratto.mjs   (codice di uscita 1 se qualcosa fallisce; ultima riga «Contratto N/N»)
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
const SU = fs.readdirSync(path.join(SRC, 'su-richiesta')).filter(f => f.endsWith('.ts') && f !== '07-strumentiquiz.ts' && f !== '07-centroui.ts').sort().map(f => 'su-richiesta/' + f);
const FILE = ['01-json.ts', '07-sezionispiegazione.ts', '07-importadrive-parti.ts', '07-importadrive.ts', ...SU];
const js = FILE.map(f => ts.transpileModule(leggi(f), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText).join('\n');
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const sb = { console, ymd, oggi: () => new Date(), materiaDi: k => { const m = /^([A-Z]+)/.exec(k || ''); return m ? m[1] : ''; } };
vm.createContext(sb);
const ESPORTA = ['JsonAI', 'ImportaParti', 'ImportaDrive', 'DiagnosiQuiz', 'MasterPrompt', 'Contratto', 'Validatore', 'MappaPagine'];
vm.runInContext(js + '\n;' + ESPORTA.map(n => 'this.' + n + ' = typeof ' + n + " !== 'undefined' ? " + n + ' : undefined;').join(' '), sb);
const { Contratto: C, Validatore: V, MappaPagine: M, DiagnosiQuiz: DQ, ImportaParti: IP, ImportaDrive: ID } = sb;
const serve = (o, n) => { if (!o) throw new Error(n + ' non esiste ancora'); return o; };
const copia = x => JSON.parse(JSON.stringify(x));

// =====================================================================
console.log('\n== Lettore (Contratto.leggi) ==');
const S01 = JSON.parse(fix('s01-v3.json'));
t('JSON pulito quiz-v3: formato, 4 domande, nessuna riparazione', () => {
  const l = serve(C, 'Contratto').leggi(fix('s01-v3.json'));
  eq([l.formato, l.dati.quiz.length, l.riparazioni.length, l.troncato], ['quiz-v3', 4, 0, false]);
});
t('prosa intorno + fence: letto, riparazione annotata', () => {
  const l = serve(C, 'Contratto').leggi(fix('rotta-prosa.txt'));
  eq([l.formato, l.dati.quiz.length, l.troncato], ['quiz-v3', 4, false]); vero(l.riparazioni.length >= 1, 'riparazione annotata');
});
t('virgolette tipografiche come delimitatori: lette', () => {
  const l = serve(C, 'Contratto').leggi(fix('rotta-tipografiche.txt'));
  eq([l.formato, l.dati.quiz.length, l.dati.scheda], ['quiz-v3', 1, 'S02']); vero(l.riparazioni.some(x => /virgolette/.test(x)), 'riparazione virgolette');
});
t('due blocchi della stessa scheda: domande unite', () => {
  const l = serve(C, 'Contratto').leggi(fix('rotta-due-blocchi.txt'));
  eq([l.formato, l.dati.quiz.length, l.blocchi.length], ['quiz-v3', 4, 2]);
});
t('virgole finali (anche dentro l\'oggetto): riparate fuori dalle stringhe', () => {
  const l = serve(C, 'Contratto').leggi(fix('rotta-virgola-l3.txt'));
  eq([l.formato, l.dati.quiz.length], ['quiz-v3', 4]); vero(l.riparazioni.some(x => /virgol/.test(x)), 'riparazione virgole');
  eq(C.riparaVirgole('{"a":"x,}",}'), '{"a":"x,}"}', 'dentro le stringhe intatte');
});
t('troncata: tenute le domande complete, troncato=true, ultimoCompleto', () => {
  const l = serve(C, 'Contratto').leggi(fix('rotta-troncata.txt'));
  eq([l.formato, l.dati.quiz.length, l.troncato, l.dati.scheda], ['quiz-v3', 2, true, 'S01']);
  vero(/pompa sodio-potassio rende/.test(l.ultimoCompleto), 'ultimoCompleto = testo dell\'ultima domanda completa: ' + l.ultimoCompleto);
});
t('formato più nuovo (quiz-v9): letto come quiz-v3 con avviso, mai rifiutato', () => {
  const l = serve(C, 'Contratto').leggi(fix('rotta-formato-nuovo.json'));
  eq([l.formato, l.dati.quiz.length], ['quiz-v3', 4]); vero(l.avvisi.some(x => /più nuovo/.test(x)), 'avviso formato più nuovo');
});
t('formati vecchi e altri: v2 parte, intero 0.58, chiusura, piano, ignoto, vuoto', () => {
  const c = serve(C, 'Contratto');
  eq(c.leggi(fix('v2-parte.json')).formato, 'parte');
  eq(c.leggi(JSON.stringify({ quiz: JSON.parse(fix('v2-parte.json')).quiz })).formato, 'quiz-v2');
  eq(c.leggi(JSON.stringify({ meta: { stepId: 'biologia-3.3' }, quiz: [] })).formato, 'quiz-058');
  eq(c.leggi(JSON.stringify({ meta: { stepId: 'biologia-3.3' }, programmaCalendario: { pianoStrutturato: {} } })).formato, 'chiusura');
  eq(c.leggi(fix('piano-v1.json')).formato, 'piano-v1');
  eq(c.leggi(fix('piano-righe.txt')).formato, 'piano-righe');
  eq(c.leggi('{"a":1}').formato, 'ignoto');
  const v = c.leggi('   '); eq(v.formato, 'ignoto'); vero(v.errori.length === 1, 'errore «vuoto»');
  eq(c.leggi(JSON.stringify(S01.quiz)).formato, 'quiz-v3', 'array nudo di domande v3');
});
t('BOM e LaTeX: letti senza perdere i backslash', () => {
  const l = serve(C, 'Contratto').leggi('﻿{"formato":"quiz-v3","scheda":"S01","quiz":[{"domanda":"Quanto vale \\frac{1}{2}?","opzioni":["a","b","c","d"]}]}');
  eq(l.dati.quiz[0].domanda, 'Quanto vale \\frac{1}{2}?');
});
t('continua: prompt dopo l\'ultima completa, chiede solo le mancanti, stesso formato', () => {
  const c = serve(C, 'Contratto'), l = c.leggi(fix('rotta-troncata.txt')), p = c.continua(l, { perScheda: 18 });
  vero(/S01/.test(p) && /quiz-v3/.test(p), 'scheda e formato');
  vero(/pompa sodio-potassio rende/.test(p), 'cita l\'ultima completa');
  vero(/dalla 3 alla 18/.test(p) && /16/.test(p), 'chiede 16 domande, dalla 3 alla 18');
  vero(!/conta|verifica|controlla/i.test(p), 'mai chiedere all\'AI di contare o verificare');
});

// =====================================================================
console.log('\n== Adapter, ID, posizioni (aQuiz, assegna, tabellaPosizioni, mescola, aPiano) ==');
const ctx3 = { step: 'biologia-3.3' };
t('assegna: ID deterministici, scheda, stepId, sottoStep, livelli, gemelle globali, sourceRef', () => {
  const c = serve(C, 'Contratto'), qs = c.assegna(copia(S01.quiz), { step: 'biologia-3.3', scheda: 'S01', sottoStep: '3.3.1' });
  eq(qs.map(q => q.id), ['biologia-3.3-S01-01', 'biologia-3.3-S01-02', 'biologia-3.3-S01-03', 'biologia-3.3-S01-04']);
  eq([qs[0].scheda, qs[0].stepId, qs[0].sottoStep, qs[0].categoria], ['biologia-3.3-S01', 'biologia-3.3', '3.3.1', 'prioritaria']);
  eq(qs.map(q => [q.livelloCognitivo, q.livello]), [[1, 'L1'], [2, 'L2'], [3, 'L3'], [4, 'L4']]);
  eq([qs[0].coppiaGemellaId, qs[1].coppiaGemellaId], [undefined, 'biologia-3.3-g1'], 'G1 → ID globale dello step');
  eq(qs[2].sourceRef, '[[Manuale, p. 122]]');
  eq(JSON.stringify(c.assegna(copia(S01.quiz), { step: 'biologia-3.3', scheda: 'S01' })), JSON.stringify(c.assegna(copia(S01.quiz), { step: 'biologia-3.3', scheda: 'S01' })), 'deterministico');
  eq(c.assegna([{ id: 'vecchio-1', domanda: 'd', livello: 'L3' }], ctx3)[0].id, 'vecchio-1', 'id già presente: tenuto');
});
t('tabellaPosizioni: bilanciata, deterministica, mai 3 uguali di fila', () => {
  const c = serve(C, 'Contratto'), a = c.tabellaPosizioni(18, 7), b = c.tabellaPosizioni(18, 7);
  eq(a, b, 'stesso seme = stessa tabella'); eq(a.length, 18);
  const n = [0, 0, 0, 0]; a.forEach(x => n[x]++); vero(n.every(x => x === 4 || x === 5), 'conteggi 4/5: ' + n);
  for (let s = 1; s < 40; s++) { const p = c.tabellaPosizioni(18, s); for (let i = 2; i < p.length; i++) vero(!(p[i] === p[i - 1] && p[i] === p[i - 2]), 'tre uguali con seme ' + s); }
  vero(JSON.stringify(c.tabellaPosizioni(18, 8)) !== JSON.stringify(a), 'semi diversi, tabelle diverse');
});
t('mescola: esatta alla posizione, distrattori in ordine, lettere della spiegazione riscritte', () => {
  const c = serve(C, 'Contratto'), q0 = copia(S01.quiz[0]), av = [], m = c.mescola(q0, 2, av);
  eq(m.opzioni, [q0.opzioni[1], q0.opzioni[2], q0.opzioni[0], q0.opzioni[3]]); eq(m.esatta, 2);
  eq(m.spiegazioneDistrattori, q0.spiegazioneDistrattori, 'confutazioni invariate (ordine relativo)');
  vero(/RISPOSTA ESATTA: C\)/.test(m.spiegazione), 'lettera esatta');
  vero(/PERCHÉ GLI ALTRI NO: A\) la diffusione[^]*B\) il simporto[^]*D\) l osmosi/.test(m.spiegazione), 'lettere dei distrattori: ' + m.spiegazione.slice(-230));
  eq(av, []);
  const z = c.mescola(copia(S01.quiz[0]), 0, []); eq([z.esatta, z.spiegazione], [0, S01.quiz[0].spiegazione], 'posizione 0: testo intatto');
  const w = copia(S01.quiz[0]); w.spiegazione = w.spiegazione.replace('CONCETTO E MECCANISMO:', 'CONCETTO E MECCANISMO: come in B) sopra,'); const av2 = []; c.mescola(w, 3, av2);
  vero(av2.some(x => /lettera/i.test(x)), 'lettera libera nel testo → avviso');
});
t('aQuiz v3: ID, posizioni dalla tabella, livello «L3» → 3; v2/parte intatti', () => {
  const c = serve(C, 'Contratto'), l = c.leggi(fix('rotta-virgola-l3.txt')), qs = c.aQuiz(l, ctx3);
  eq(qs.length, 4); eq(qs[2].livelloCognitivo, 3); eq(qs[0].id, 'biologia-3.3-S01-01');
  const tab = c.tabellaPosizioni(4, c.seme('biologia-3.3', 1));
  eq(qs.map(q => q.esatta), tab, 'esatta = tabella della scheda');
  qs.forEach((q, i) => eq(q.opzioni[q.esatta], S01.quiz[i].opzioni[0], 'giusta al suo posto #' + i));
  const v2 = JSON.parse(fix('v2-parte.json')), a = c.aQuiz(c.leggi(fix('v2-parte.json')), ctx3);
  eq(a.map(q => [q.id, q.esatta, q.opzioni]), v2.quiz.map(q => [q.id, q.esatta, q.opzioni]), 'v2: niente rimescolato');
  const mista = copia(S01); mista.quiz[0].esatta = 0; eq(c.aQuiz(c.leggi(JSON.stringify(mista)), ctx3)[0].opzioni, S01.quiz[0].opzioni, 'domanda v3 con esatta: tenuta');
});
t('equivalenza: quiz-v3 → aQuiz → ImportaDrive.traduci = stesso risultato del v2 equivalente', () => {
  const c = serve(C, 'Contratto'), v3 = c.aQuiz(c.leggi(fix('s01-v3.json')), ctx3).slice(0, 3), v2 = JSON.parse(fix('v2-parte.json')).quiz;
  const pac = quiz => ({ meta: { stepId: 'biologia-3.3', materia: 'biologia' }, quiz });
  const a = ID.traduci(pac(v3), '2026-11-20'), b = ID.traduci(pac(v2), '2026-11-20');
  eq([a.k, a.sotto, a.domande], [b.k, b.sotto, b.domande]);
  const senza = t => t.banche.map(x => ({ sk: x.sk, d: x.domande.map(({ e, spiegazione, ...r }) => r) }));
  eq(senza(a), senza(b), 'stesse schede, ID, opzioni (giusta prima), livelli, confutazioni, fonti');
  eq(IP.classifica(c.leggi(fix('v2-parte.json')).dati), 'parte');
});
t('aPiano: righe «@B»/«COPRE» e JSON piano-v1 danno lo stesso piano', () => {
  const c = serve(C, 'Contratto'), r = c.aPiano(c.leggi(fix('piano-righe.txt'))), j = c.aPiano(c.leggi(fix('piano-v1.json')));
  eq(r.blocchi.map(b => b.codice + '|' + b.titolo), ['3.3|Membrane e trasporto', '3.4|Energia cellulare']);
  eq(r.blocchi[0].copre, [{ schede: [1, 2], micro: ['3.3.1'] }, { schede: [3], micro: ['3.3.2', '3.3.3'] }]);
  eq(j.blocchi[0], r.blocchi[0], 'JSON = righe');
  vero(r.avvisi.some(x => /ignorat/.test(x)), 'riga di prosa ignorata con avviso');
  const o = c.aPiano(c.leggi('COPRE S1 | 3.3.1\n@B 3.3 | T\nCOPRE Sx | 3.3.1'));
  eq(o.blocchi.length, 1); vero(o.avvisi.length >= 2, 'COPRE fuori blocco e schede illeggibili segnalate');
});

// =====================================================================
console.log('\n== Validatore (un solo validatore, profili) ==');
const V3 = () => C.aQuiz(C.leggi(fix('s01-v3.json')), ctx3);
const ORO_V2 = {"bloccanti":[],"avvisi":["1 domande ripetute tra parti: tengo la più recente (x (vince a))","Schede con domande ≠ 18: S01=3","Livelli fuori soglia (±3): 33/33/33/0% invece di 25/35/25/15","Posizione dell'esatta sbilanciata: 0/33/33/33% (attesa ~25% ciascuna)","La corretta è la più lunga nel 33% delle domande (attesa ≤ 25%): si indovina dalla lunghezza"],"righe":["1 schede · 3 domande","Livelli L1–L4: 33/33/33/0% (attesi 25/35/25/15)","Esatta in A/B/C/D: 0/33/33/33% · corretta più lunga: 33%","Coppie gemelle complete: 0"]};
const ORO_V3 = {"bloccanti":[],"avvisi":["Schede con domande ≠ 18: S01=4","1 schede nello step (attese 18–25)","Livelli fuori soglia (±3): 25/25/25/25% invece di 25/35/25/15","La corretta è la più lunga nel 50% delle domande (attesa ≤ 25%): si indovina dalla lunghezza","1 gemelle senza l'altra metà: biologia-3.3-g1"],"righe":["1 schede · 4 domande","Livelli L1–L4: 25/25/25/25% (attesi 25/35/25/15)","Esatta in A/B/C/D: 25/25/25/25% · corretta più lunga: 50%","Coppie gemelle complete: 0"]};
t('PROFILO_STANDARD = regole dell\'artefatto (18 × 4, 25/35/25/15, range per scheda)', () => {
  const P = serve(V, 'Validatore').PROFILO_STANDARD;
  eq([P.perScheda, P.opzioni, P.quoteLivello, P.rangeScheda, P.spiegazioneMin, P.confutazioneMin], [18, 4, [25, 35, 25, 15], [[4, 5], [6, 7], [4, 5], [2, 3]], 600, 30]);
});
t('rapporto e bloccanti: stessi messaggi di v0.60 (import invariato)', () => {
  const v = serve(V, 'Validatore');
  eq(v.rapporto({ quiz: JSON.parse(fix('v2-parte.json')).quiz }, { duplicati: ['x (vince a)'], completo: false }), ORO_V2);
  eq(v.rapporto({ quiz: V3() }), ORO_V3);
  eq([v.bloccanti({ opzioni: ['a', 'b', 'c'], esatta: 5 }), v.bloccanti(V3()[0])], [['testo mancante', '3 opzioni invece di 4', '«esatta» fuori da 0..3'], []]);
  eq(IP.valida({ quiz: V3() }), ORO_V3, 'ImportaParti.valida delega');
  eq(IP.bloccantiDomanda({ opzioni: [] }), v.bloccanti({ opzioni: [] }), 'ImportaParti.bloccantiDomanda delega');
});
t('valida: bloccanti per id (anche ID doppio), qualità e insieme separati, niente regola sul formato ID', () => {
  const v = serve(V, 'Validatore'), qs = V3(); qs.push({ ...qs[1] }); qs[2] = { ...qs[2], opzioni: ['a', 'b', 'c'] };
  const r = v.valida(qs, v.PROFILO_STANDARD);
  eq([...r.bloccanti.keys()].sort(), ['biologia-3.3-S01-02', 'biologia-3.3-S01-03']);
  vero(r.bloccanti.get('biologia-3.3-S01-02').some(x => /ID doppio/.test(x)), 'ID doppio bloccante');
  vero(r.bloccanti.get('biologia-3.3-S01-03').some(x => /opzioni/.test(x)), '3 opzioni bloccante');
  eq(r.pronte, 3, 'pronte = senza bloccanti');
  vero(r.insieme.some(p => /invece di 18/.test(p.msg)), 'scheda corta in «insieme»');
  vero(r.qualita.every(p => !/^scheda |^insieme|^gemella /.test(p.id)), 'qualità solo per domanda');
  vero(!r.qualita.concat(r.insieme).some(p => /formato ID/.test(p.msg)), 'la regola sul formato ID è caduta');
  const corto = v.valida(V3(), { ...v.PROFILO_STANDARD, perScheda: 4 });
  vero(!corto.insieme.some(p => /invece di/.test(p.msg)), 'profilo da 4 per scheda: niente avviso');
});
t('DiagnosiQuiz.analizza = Validatore.analizza (adapter sottile)', () => {
  const v = serve(V, 'Validatore'), qs = V3();
  eq(DQ.analizza(qs), v.analizza(qs));
});
t('ripara: solo senza perdita («L3»→3, livello allineato, sourceRef=fonte), input intatto', () => {
  const v = serve(V, 'Validatore'), q = { id: 'x-1', livelloCognitivo: 'L3', livello: 'L1', fonte: ' [[Manuale, p. 9]] ', domanda: ' D? ' };
  const r = v.ripara([q]);
  eq([r.qs[0].livelloCognitivo, r.qs[0].livello, r.qs[0].sourceRef, r.qs[0].domanda], [3, 'L3', '[[Manuale, p. 9]]', 'D?']);
  eq(q.livelloCognitivo, 'L3', 'originale intatto'); vero(r.log.length >= 3, 'log: ' + r.log);
  eq(DQ.autoFix([q]), r, 'DiagnosiQuiz.autoFix delega');
});
t('promptCorrezione: chirurgico, con ID e campi da rifare, mai chiedere di contare', () => {
  const v = serve(V, 'Validatore'), qs = V3(); qs[0] = { ...qs[0], spiegazioneDistrattori: ['corta'] };
  const r = v.valida(qs), p = v.promptCorrezione(qs, r.qualita);
  vero(/biologia-3\.3-S01-01/.test(p) && /spiegazioneDistrattori/.test(p), 'id e campo');
  vero(!/conta|calcola/i.test(p), 'mai chiedere di contare: ' + (p.match(/.{30}(conta|calcola).{30}/i) || [''])[0]);
});

// =====================================================================
console.log('\n== Mappa pagine ==');
const ETICH = ['Copertina', null, 'i', 'ii', 'iii', 'iv', '1', '2', '3', '4', '5', '6'];
t('daEtichette: premesse romane + arabi → 2 tratti esatti, conversioni nei due sensi', () => {
  const m = serve(M, 'MappaPagine').daEtichette(ETICH);
  eq([m.fonte, m.affidabilita, m.tratti], ['auto-etichette', 'esatta', [{ pdfDa: 3, pdfA: 6, stampDa: 'i' }, { pdfDa: 7, pdfA: 12, stampDa: 1 }]]);
  eq([M.aPdf(m, 1), M.aPdf(m, 6), M.aPdf(m, 'iii'), M.aPdf(m, 'IV'), M.aPdf(m, 7), M.aPdf(m, 'x')], [7, 12, 5, 6, null, null]);
  eq([M.aStampata(m, 5), M.aStampata(m, 9), M.aStampata(m, 1), M.aStampata(m, 99)], ['iii', 3, null, null]);
  eq(M.daEtichette([null, null]), null, 'nessuna etichetta utile');
  eq(M.daEtichette(['1', '2', '3']).tratti, [{ pdfDa: 1, pdfA: 3, stampDa: 1 }], 'etichette = numeri PDF: mappa banale ma valida');
});
t('daStampati: PDF a due tratti con rumore → voto a tratti (non un solo offset)', () => {
  // pagine 1–2 senza numero, 3–20 stampate 1–18 (offset 2), poi 4 tavole fuori testo, 25–40 stampate 19–34 (offset 6); rumore: anni e numeri di figura
  const np = [];
  for (let p = 1; p <= 40; p++) {
    const n = p >= 3 && p <= 20 ? [p - 2] : p >= 25 ? [p - 6] : [];
    if (p % 5 === 0) n.push(1990 + p); if (p === 11) n.push(3); if (p === 30 && n.length) n.length = 0;   // rumore + una pagina senza numero letto
    np.push(n);
  }
  const m = M.daStampati(np);
  eq([m.fonte, m.affidabilita, m.tratti], ['auto-stampati', 'stimata', [{ pdfDa: 3, pdfA: 20, stampDa: 1 }, { pdfDa: 25, pdfA: 40, stampDa: 19 }]]);
  eq([M.aPdf(m, 18), M.aPdf(m, 19), M.aPdf(m, 24), M.aStampata(m, 22)], [20, 25, 30, null]);
  eq(M.daStampati([[], [], [7]]), null, 'troppo pochi voti: nessuna mappa');
});
t('daMano: vince su auto, ancore stampata↔pdf (anche romane), ultimo tratto aperto', () => {
  const m = M.daMano([{ stampata: 1, pdf: 15 }, { stampata: 'v', pdf: 9 }, { stampata: 200, pdf: 220 }]);
  eq([m.fonte, m.affidabilita, m.tratti.map(x => [x.pdfDa, x.pdfA, x.stampDa])], ['mano', 'esatta', [[9, 14, 'v'], [15, 219, 1], [220, M.APERTO, 200]]]);
  eq([M.aPdf(m, 'vii'), M.aPdf(m, 100), M.aPdf(m, 500), M.aStampata(m, 230)], [11, 114, 520, 210]);
});
t('verifica: ✅ sulla pagina, ↔ a ±1 (con numero corretto), ⚠ parziale, ✗ assente, ❓ senza dati', () => {
  const m = M.daEtichette(ETICH);
  const testi = { 9: 'La glicolisi avviene nel citosol e produce piruvato.', 10: 'Il ciclo di Krebs nel mitocondrio.', 11: 'Fosforilazione ossidativa e ATP sintasi.' };
  const tp = n => testi[n] || '';
  eq(M.verifica(m, '[[Manuale, p. 3]]', tp, ['glicolisi', 'piruvato']), { esito: '✅', pagina: 3 });
  eq(M.verifica(m, '[[Manuale, p. 3]]', tp, ['Krebs', 'mitocondrio']), { esito: '↔', pagina: 4 });
  eq(M.verifica(m, 'Manuale, pp. 3-4', tp, ['glicolisi', 'Calvin', 'tilacoide']), { esito: '⚠', pagina: 3 });
  eq(M.verifica(m, '[[Manuale, p. 3]]', tp, ['fotosintesi']), { esito: '✗', pagina: 3 });
  eq([M.verifica(m, '[[Manuale]]', tp, ['x']).esito, M.verifica(null, '[[Manuale, p. 3]]', tp, ['x']).esito, M.verifica(m, 'p. 3', tp, []).esito], ['❓', '❓', '❓']);
  eq(M.verifica(m, '[[Manuale, p. ii]]', n => n === 4 ? 'Prefazione all\'opera' : '', ['prefazione']).esito, '✅', 'romani e accenti/maiuscole');
});
t('campioneProva: k pagine distinte, deterministiche dal seme, dentro i tratti', () => {
  const m = M.daEtichette(ETICH), a = M.campioneProva(m, 3, 42), b = M.campioneProva(m, 3, 42);
  eq(a, b, 'stesso seme = stesso campione'); eq(a.length, 3);
  vero(new Set(a.map(x => x.pdf)).size === 3 && a.every(x => x.pdf >= 3 && x.pdf <= 12 && x.stampata === M.aStampata(m, x.pdf)), JSON.stringify(a));
  eq(M.campioneProva(M.daMano([{ stampata: 1, pdf: 5 }]), 2, 1, 8).every(x => x.pdf >= 5 && x.pdf <= 8), true, 'tratto aperto: limitato al totale');
  eq(M.campioneProva(null, 3, 1), []);
});


// ---------- import ----------
t('pacchetti: blocco quiz-v3 con «parte» → pacchetto con ID, esatta e meta; si importa con raggruppa + preparaGruppo', () => {
  const dom = (n, k) => ({ scheda: 'S0' + n, categoria: 'prioritaria', livello: 1, tipoItem: 'concetto', domanda: 'Domanda ' + n + '.' + k + ' sulla glicolisi?', opzioni: ['Giusta ' + k, 'Falsa a', 'Falsa b', 'Falsa c'], spiegazione: 'RISPOSTA ESATTA: A) Giusta. PERCHÉ GLI ALTRI NO: B) no. C) no. D) no.', fonte: '[[Manuale, p. 3]]' });
  const testo = 'Ecco:\n```json\n' + JSON.stringify({ formato: 'quiz-v3', parte: 'biologia-3.3-s1-2', quiz: [dom(1, 1), dom(1, 2), dom(2, 1)] }) + '\n```';
  const r = serve(C.pacchetti, 'Contratto.pacchetti')(testo);
  eq(r.pacchetti.length, 1); const p = r.pacchetti[0];
  eq([IP.classifica(p), IP.stepDi(p), p.meta.stepId, p.meta.materia], ['parte', 'biologia-3.3', 'biologia-3.3', 'biologia']);
  eq(p.quiz.map(q => q.id), ['biologia-3.3-S01-01', 'biologia-3.3-S01-02', 'biologia-3.3-S02-01']);
  vero(p.quiz.every(q => q.opzioni[q.esatta].startsWith('Giusta')), 'esatta segue la giusta');
  const f = { id: 'man-1', name: 'incollato', cartella: 'incollato', modificato: '', tipo: IP.classifica(p), step: IP.stepDi(p), json: p };
  const g = IP.raggruppa([f]); eq(g.length, 1);
  const { t: tr } = ID.preparaGruppo(g[0]);
  vero(!tr.errore, 'traduzione: ' + tr.errore); eq(tr.domande, 3);
  eq(C.pacchetti('{"blocchi":[{"codice":"B1"}]}').pacchetti.length, 0, 'un piano non è un pacchetto quiz');
  vero(C.pacchetti('{"blocchi":[{"codice":"B1"}]}').lettura.avvisi.some(a => /Piano Intelligente/.test(a)));
});

// ---------- dossier studente (v0.62) ----------
t('master prompt: le regole del dossier entrano nel TARGET al posto dei punti deboli; senza dossier resta il ripiego', () => {
  const MP = sb.MasterPrompt, base = { materia: 'Biologia', codice: 'B', step: '2.2' };
  const r = ['Sotto-step 2.2.1: aggiungi almeno una scheda in più.', 'Domande L1 brevi.'];
  const p = MP.costruisci({ ...base, dossier: r, puntiDeboli: ['B-2.2.1-1 (30%)'] });
  vero(/Dossier dello studente/.test(p) && r.every(x => p.includes('• ' + x)), 'regole elencate');
  vero(!/Punti deboli misurati/.test(p), 'il dossier sostituisce i punti deboli');
  vero(p.indexOf('Dossier dello studente') < p.indexOf('COMPATIBILITÀ CON L'), 'dentro il TARGET');
  vero(/Punti deboli misurati/.test(MP.costruisci({ ...base, puntiDeboli: ['B-2.2.1-1 (30%)'] })), 'ripiego');
  vero(!/Dossier dello studente/.test(MP.costruisci({ ...base, dossier: [] })), 'dossier vuoto = nessuna riga');
});

// ---------- prompt del Centro (v0.63): piano e schede, mai la chiusura ----------
const VIETATE = /ricalcol|\bcont(a|are|ano|i)\b|ricavalo|chiusura/i;
const BASE63 = { materia: 'Biologia', codice: 'B', step: '3.3', titolo: 'Membrane', archetipo: 'scienze_sperimentali', vietati: ['Eserciziario Rosso', 'Quiz Blu'], dossier: ['Domande L1 brevi.'] };
t('costruisciPiano: Fase 0 + Fase 1, chiede piano-v1 (JSON o righe @B/COPRE), niente righe calendario né schede', () => {
  const p = serve(sb.MasterPrompt.costruisciPiano, 'costruisciPiano')(BASE63);
  vero(/FASE 0/.test(p) && /FASE 1/.test(p) && !/FASE 2/.test(p), 'fasi');
  vero(/"formato": ?"piano-v1"/.test(p) && /@B 3\.3/.test(p) && /COPRE S1/.test(p), 'formato piano');
  vero(!/\|UD3\|/.test(p) && !/"quiz-v3"/.test(p), 'niente calendario né quiz');
  vero(/Raffinamento/.test(p), 'come si indicano le schede di raffinamento');
  vero(p.includes('«Eserciziario Rosso»') && p.includes('• Domande L1 brevi.'), 'esclusi e dossier da opz');
  const m = VIETATE.exec(p); vero(!m, 'parola vietata: ' + (m && m[0]));
});
t('costruisciSchede: solo le schede date, nome parte e sigle dall\'app, Fase 2, niente piano né chiusura', () => {
  const sch = [{ n: 1, sigla: 'S01', micro: ['3.3.1'], categoria: 'prioritaria', blocco: 'Membrane' }, { n: 2, sigla: 'S02', micro: ['3.3.2', '3.3.3'], categoria: 'raffinamento', blocco: 'Raffinamento' }];
  const p = serve(sb.MasterPrompt.costruisciSchede, 'costruisciSchede')(BASE63, sch);
  vero(p.includes('"parte": "biologia-3.3-s1-2"'), 'nome parte');
  eq(IP.nomeParte('biologia-3.3-s1-2'), { step: 'biologia-3.3', da: 1, a: 2 });
  vero(/S01[^\n]*3\.3\.1[^\n]*prioritaria/.test(p) && /S02[^\n]*3\.3\.2, 3\.3\.3[^\n]*raffinamento/.test(p), 'elenco schede');
  vero(/FASE 2/.test(p) && /SEQUENZA/.test(p) && !/FASE 1/.test(p) && !/piano-v1/.test(p), 'fasi');
  vero(p.includes('«Quiz Blu»') && p.includes('• Domande L1 brevi.'), 'esclusi e dossier');
  const m = VIETATE.exec(p); vero(!m, 'parola vietata: ' + (m && m[0]));
  const una = sb.MasterPrompt.costruisciSchede(BASE63, [sch[0]]);
  vero(una.includes('"parte": "biologia-3.3-s1"') && !/S02/.test(una), 'una scheda sola');
});
t('costruisciSchede: pagine esatte del microstep dall\'app (stampate e PDF), senza pagine nessuna riga in più', () => {
  const sch = [{ n: 1, sigla: 'S01', micro: ['3.3.1'], categoria: 'prioritaria' }, { n: 2, sigla: 'S02', micro: ['3.3.3'], categoria: 'prioritaria' }];
  const pag = { '3.3.1': { stampDa: 40, stampA: 45, pdfDa: 49, pdfA: 56, affidabilita: 'stimata' }, '3.3.3': { stampDa: 52, stampA: null, pdfDa: null, pdfA: null, affidabilita: 'nessuna' } };
  const p = sb.MasterPrompt.costruisciSchede(BASE63, sch, pag);
  vero(/S01[^\n]*pagine 40–45 del libro \(PDF 49–56\)/.test(p), 'S01 con intervallo e PDF');
  vero(/S02[^\n]*pagine dalla 52 del libro/.test(p) && !/S02[^\n]*PDF/.test(p), 'S02 aperta, senza PDF');
  vero(/cita solo le pagine indicate/i.test(p), 'regola sulle pagine');
  const m = VIETATE.exec(p); vero(!m, 'parola vietata: ' + (m && m[0]));
  const senza = sb.MasterPrompt.costruisciSchede(BASE63, sch);
  vero(!/pagine \d|cita solo le pagine indicate/i.test(senza), 'senza pagine come prima');
});
t('costruisci (prompt classico) invariato fino alla v0.64: chiede ancora la chiusura', () => {
  vero(/CHIUSURA/.test(sb.MasterPrompt.costruisci(BASE63)));
});

// ---------- v0.64 T1: prompt di Medicina identici al byte a v0.63.1 ----------
// Snapshot in test/fixture-ai/prompt-medicina-v0631-*.txt, generati UNA volta dal codice di v0.63.1 (672ec17).
// Rigenerarli (node test/contratto.mjs --aggiorna-snapshot) solo con decisione esplicita dell'utente: è il punto del test.
const MED = { materia: 'Biologia', codice: 'B', step: '3.3', titolo: 'Membrane e trasporto', unita: 'UD3', data: '2026-12-15', archetipo: 'scienze_sperimentali',
  etichettaArchetipo: 'Scienze sperimentali', tono: 'tecnico_accademico', intensita: 'standard', vietati: ['Eserciziario Rosso'], dossier: ['Domande L1 brevi.'],
  idEsistenti: ['biologia-3.3-S01-1'], note: 'Test di ammissione a Medicina.',
  libri: [{ nome: 'Campbell', pdf: ['campbell.pdf'], offset: 14, mappa: { fonte: 'mano', tratti: [{ daStampata: 1, aStampata: 900, scostamento: 14 }], affidabilita: 'esatta' } }] };
const SCH_MED = [{ n: 1, sigla: 'S01', micro: ['3.3.1'], categoria: 'prioritaria', blocco: 'Membrane' }, { n: 2, sigla: 'S02', micro: ['3.3.2', '3.3.3'], categoria: 'raffinamento', blocco: 'Raffinamento' }];
const PAG_MED = { '3.3.1': { stampDa: 40, stampA: 45, pdfDa: 54, pdfA: 59, affidabilita: 'esatta' }, '3.3.2': { stampDa: 46, stampA: 50, pdfDa: 60, pdfA: 64, affidabilita: 'esatta' } };
const SNAP = {
  piano: () => sb.MasterPrompt.costruisciPiano(MED),
  schede: () => sb.MasterPrompt.costruisciSchede(MED, SCH_MED, PAG_MED),
  classico: () => sb.MasterPrompt.costruisci(MED),
};
const AGGIORNA = process.argv.includes('--aggiorna-snapshot');
for (const [nome, fn] of Object.entries(SNAP)) {
  t('Medicina identico al byte a v0.63.1: prompt ' + nome, () => {
    const f = path.join(FIX, 'prompt-medicina-v0631-' + nome + '.txt'), ora = fn();
    if (AGGIORNA) { fs.writeFileSync(f, ora); return; }
    const prima = fix(path.basename(f));      // senza \r: con core.autocrlf il checkout su Windows li aggiunge
    if (ora === prima) return;
    let i = 0; while (i < ora.length && ora[i] === prima[i]) i++;
    throw new Error('diverso al carattere ' + i + ': atteso «' + prima.slice(i, i + 40) + '», ottenuto «' + ora.slice(i, i + 40) + '»');
  });
}

// =====================================================================
console.log('\n== quiz-v4 (v0.64 T3): tipi di domanda ==');
const MCQ4 = { scheda: 'S01', livello: 1, tipo: 'mcq', domanda: 'Quale organello produce ATP?', opzioni: ['Mitocondrio', 'Ribosoma', 'Lisosoma', 'Golgi'], spiegazione: 'RISPOSTA ESATTA: A) Mitocondrio.', fonte: '[[Campbell, p. 40]]' };
const COMPL = { scheda: 'S01', livello: 1, tipo: 'completamento', domanda: 'La glicolisi avviene nel ___.', risposte: ['citosol', 'citoplasma'], spiegazione: 'Nel citosol.', fonte: '[[Campbell, p. 41]]' };
const ORD = { scheda: 'S01', livello: 2, tipo: 'ordinamento', domanda: 'Ordina le fasi della mitosi.', elementi: ['Profase', 'Metafase', 'Anafase', 'Telofase'], spiegazione: 'P-M-A-T.', fonte: '[[Campbell, p. 42]]' };
const APERTA = { scheda: 'S01', livello: 3, tipo: 'aperta', domanda: 'Spiega il trasporto attivo.', rubrica: ['usa ATP', 'contro gradiente', 'proteine pompa'], rispostaModello: 'Il trasporto attivo usa ATP per spostare soluti contro gradiente tramite pompe.', fonte: '[[Campbell, p. 43]]' };
const CODICE = { scheda: 'S01', livello: 3, tipo: 'codice', linguaggio: 'python', domanda: 'Scrivi una funzione che somma una lista.', rubrica: ['ciclo o sum()', 'restituisce il totale'], rispostaModello: 'def somma(xs):\n    return sum(xs)', fonte: '[[Lutz, p. 10]]' };
const V4 = (...quiz) => JSON.stringify({ formato: 'quiz-v4', step: 'biologia-3.3', scheda: 'S01', quiz });

t('quiz-v4 letto come quiz-v4, senza avviso «più nuovo», con i campi per tipo intatti', () => {
  const l = C.leggi(V4(MCQ4, COMPL, ORD, APERTA, CODICE));
  eq(l.formato, 'quiz-v4'); eq(l.avvisi, []); eq(l.errori, []);
  eq(l.dati.quiz.map(q => q.tipo), ['mcq', 'completamento', 'ordinamento', 'aperta', 'codice']);
  eq(l.dati.quiz[2].elementi, ORD.elementi);
});
t('aQuiz v4: ID dall\'app per tutte; solo gli mcq ricevono «esatta», gli altri tipi restano senza', () => {
  const qs = C.aQuiz(C.leggi(V4(MCQ4, COMPL, ORD, APERTA)), { step: 'biologia-3.3' });
  eq(qs.map(q => q.id), ['biologia-3.3-S01-01', 'biologia-3.3-S01-02', 'biologia-3.3-S01-03', 'biologia-3.3-S01-04']);
  eq(qs[0].opzioni[qs[0].esatta], 'Mitocondrio');
  eq(qs.slice(1).map(q => 'esatta' in q), [false, false, false]);
  eq(qs[2].elementi, ORD.elementi, 'ordine giusto intatto (il rimescolamento lo fa il runner)');
});
t('validatore v4: le domande giuste di ogni tipo non hanno bloccanti', () => {
  for (const q of [COMPL, ORD, APERTA, CODICE]) eq(V.bloccanti(q), [], q.tipo);
});
t('validatore v4: regole bloccanti della spec, una per tipo', () => {
  const b = (base, mod) => V.bloccanti({ ...base, ...mod }).join(' | ');
  vero(/___/.test(b(COMPL, { domanda: 'La glicolisi avviene nel citosol.' })), 'completamento senza ___');
  vero(/risposte/.test(b(COMPL, { risposte: [] })), 'completamento senza risposte');
  vero(/3–7/.test(b(ORD, { elementi: ['a', 'b'] })), 'ordinamento con 2 elementi');
  vero(/3–7/.test(b(ORD, { elementi: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] })), 'ordinamento con 8 elementi');
  vero(/2–5/.test(b(APERTA, { rubrica: ['uno'] })), 'aperta con rubrica da 1');
  vero(/rispostaModello/.test(b(APERTA, { rispostaModello: '' })), 'aperta senza risposta modello');
  vero(/linguaggio/.test(b(CODICE, { linguaggio: '' })), 'codice senza linguaggio');
  vero(/tipo/.test(b(MCQ4, { tipo: 'vero_falso' })), 'tipo sconosciuto');
  eq(V.bloccanti({ ...MCQ4, esatta: 0 }).length, 0, 'mcq v4 (dopo aQuiz) come v3');
  vero(/opzioni/.test(b(MCQ4, { esatta: 0, opzioni: ['a', 'b'] })), 'mcq v4: regole v3 invariate');
});
t('ripara v4: tiene i campi dei tipi; «…», «[ ]», «____», «[...]» → «___»; prefissi «1.», «1)», «a)» tolti', () => {
  const r = V.ripara([
    { ...COMPL, id: 'c1', domanda: 'La glicolisi avviene nel … e produce [ ] ATP.' },
    { ...COMPL, id: 'c2', domanda: 'Il ____ e il [...] .' },
    { ...ORD, id: 'o1', elementi: ['1. Profase', '2) Metafase', 'c) Anafase', 'Telofase'] },
    { ...CODICE, id: 'k1' },
  ]);
  eq(r.qs[0].domanda, 'La glicolisi avviene nel ___ e produce ___ ATP.');
  eq(r.qs[1].domanda, 'Il ___ e il ___ .');
  eq(r.qs[2].elementi, ['Profase', 'Metafase', 'Anafase', 'Telofase']);
  eq([r.qs[3].tipo, r.qs[3].linguaggio, r.qs[3].rubrica, r.qs[3].rispostaModello], ['codice', 'python', CODICE.rubrica, CODICE.rispostaModello], 'campi v4 non rimossi');
  eq(r.qs[0].risposte, COMPL.risposte);
  vero(r.log.some(x => /___/.test(x)) && r.log.some(x => /prefiss/.test(x)), 'log: ' + r.log);
});
t('analizza v4: per i tipi non mcq niente controlli da scelta multipla né «chiave in più» sui campi v4; fonte e domanda restano controllate', () => {
  const qs = C.aQuiz(C.leggi(V4(COMPL, ORD, APERTA, CODICE)), { step: 'biologia-3.3' });
  const per = a => a.problemi.filter(p => !/^(scheda |insieme|gemella )/.test(p.id) && p.sev !== 'info').map(p => p.id + ': ' + p.msg);
  eq(per(V.analizza(qs)), []);
  const rotta = per(V.analizza([{ ...qs[0], fonte: '', domanda: 'corta' }])).join(' | ');
  vero(/fonte mancante/.test(rotta) && /domanda/.test(rotta), rotta);
});
t('adapter v4 → DomB: completamento → fill, ordinamento → sequenza, aperta/codice → risposta_aperta_rubrica (+linguaCodice)', () => {
  const qs = C.aQuiz(C.leggi(V4(MCQ4, COMPL, ORD, APERTA, CODICE)), { step: 'biologia-3.3' });
  const tr = ID.traduci({ meta: { stepId: 'biologia-3.3', materia: 'biologia' }, quiz: qs }, '2026-11-20');
  const d = tr.banche.flatMap(b => b.domande);
  eq([tr.domande, tr.scartate], [5, 0]);
  eq(d.map(x => x.t), ['mcq', 'fill', 'sequenza', 'risposta_aperta_rubrica', 'risposta_aperta_rubrica']);
  eq([d[1].a, d[1].show], [COMPL.risposte, 'citosol']);
  eq([d[2].sequenzaOk, d[2].show], [ORD.elementi, 'Profase → Metafase → Anafase → Telofase']);
  eq([d[3].rubricaPunti, d[3].show, d[3].linguaCodice], [APERTA.rubrica, APERTA.rispostaModello, undefined]);
  eq([d[4].rubricaPunti, d[4].show, d[4].linguaCodice], [CODICE.rubrica, CODICE.rispostaModello, 'python']);
  eq(d.slice(1).map(x => [x.r, x.stepId, 'o' in x]), [COMPL, ORD, APERTA, CODICE].map(q => [q.fonte, d[0].stepId, false]), 'fonte e stepId come per l\'mcq');
  eq(ID.traduci({ meta: { stepId: 'biologia-3.3', materia: 'biologia' }, quiz: [{ ...qs[2], elementi: ['a', 'b'] }] }, '2026-11-20').domande, 0, 'ordinamento rotto scartato');
});

// =====================================================================
const fine = 'Contratto ' + ok + '/' + (ok + ko);
console.log('\n' + fine + (ko ? ' — ' + ko + ' falliti' : ''));
process.exit(ko ? 1 : 0);
