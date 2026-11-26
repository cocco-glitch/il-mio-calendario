// 07-SUITE-TEST-FUNZIONALI-E-REGRESSIONE.mjs — v0.56 (BP3 + BP4 + BP5)
// Test funzionali e di regressione SENZA browser e SENZA toccare dist/:
//  - compila src/07-neuro.ts (modulo puro) in una cartella temporanea del sistema e lo carica in una sandbox vm;
//  - fetch è sostituita da un contatore: i livelli 0 e 1 dell'imbuto AI devono fare ZERO chiamate di rete;
//  - controlli statici su src/ (catena AI, niente Mistral/OpenRouter, vincoli Google Calendar, aggancio dei moduli).
// Uso: node 07-SUITE-TEST-FUNZIONALI-E-REGRESSIONE.mjs   (codice di uscita 1 se qualcosa fallisce)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RADICE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(RADICE, 'src');
const leggi = f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n');

let ok = 0, ko = 0; const fallite = [];
function t(nome, fn) {
  try { const r = fn(); if (r && typeof r.then === 'function') return r.then(() => { ok++; console.log('  ✓ ' + nome); }, e => { ko++; fallite.push(nome); console.log('  ✗ ' + nome + ' — ' + e.message); }); ok++; console.log('  ✓ ' + nome); }
  catch (e) { ko++; fallite.push(nome); console.log('  ✗ ' + nome + ' — ' + e.message); }
}
function eq(a, b, m) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((m || 'atteso') + ': ' + y + ', ottenuto ' + x); }
function vero(c, m) { if (!c) throw new Error(m || 'condizione falsa'); }

// ---------- caricamento di Neuro (tsc → cartella temporanea, mai dist/) ----------
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'imc-bp3-'));
fs.writeFileSync(path.join(TMP, 'stub.d.ts'), 'interface Rec { id: string; type: string; updatedAt: number; deleted?: boolean; acc?: string; }\n'
  + 'interface VocePiano { k: string; t: string; d?: string; speciale?: boolean; }\n'
  + 'interface GiornoPiano { data: string; n?: number; voci: VocePiano[]; nota?: string; }\n'
  + 'declare function caricaPdfJs(): Promise<any>;\ninterface Blob { arrayBuffer(): Promise<ArrayBuffer>; }\ndeclare const console: { warn(...a: unknown[]): void; log(...a: unknown[]): void };\ndeclare const caches: { open(n: string): Promise<{ match(u: string): Promise<{ json(): Promise<unknown> } | undefined>; put(u: string, r: unknown): Promise<void> }> };\ndeclare const location: { origin: string };\ndeclare class Response { constructor(b: string, o?: unknown); }\n'
  + "interface PkPiano { tipo: 'piano'; id: string; modo?: string; titolo: string; aggiornato: string; giorniTeoria: number; nota?: string; giorni: GiornoPiano[]; }\n");
fs.copyFileSync(path.join(SRC, '01-json.ts'), path.join(TMP, 'json.ts'));   // v0.57 (A15): parser unico usato da Neuro e Pianificatore
fs.copyFileSync(path.join(SRC, '07-fsrs.ts'), path.join(TMP, 'fsrs.ts'));
fs.copyFileSync(path.join(SRC, '07-testopdf.ts'), path.join(TMP, 'testopdf.ts'));
fs.copyFileSync(path.join(SRC, 'su-richiesta', '07-indicepagine.ts'), path.join(TMP, 'indicepagine.ts'));   // blocco 2: indice BM25 per pagina   // blocco 1: punto unico di lettura dei PDF   // blocco 3: nucleo FSRS unico usato da Neuro
fs.copyFileSync(path.join(SRC, '07-neuro.ts'), path.join(TMP, 'neuro.ts'));
fs.copyFileSync(path.join(SRC, '07-pianificatore.ts'), path.join(TMP, 'pianificatore.ts'));
try {
  execFileSync(process.execPath, [path.join(RADICE, 'node_modules', 'typescript', 'bin', 'tsc'), '--target', 'es2020', '--lib', 'es2020', '--strict',
    '--noEmitOnError', 'false', '--outDir', 'out', 'stub.d.ts', 'json.ts', 'fsrs.ts', 'testopdf.ts', 'indicepagine.ts', 'neuro.ts', 'pianificatore.ts'], { cwd: TMP, stdio: 'pipe' });
} catch (e) { console.log('⚠️ tsc sui moduli puri:\n' + String(e.stdout || e.message).slice(0, 2000)); }
const JS_JSON = fs.readFileSync(path.join(TMP, 'out', 'json.js'), 'utf8');
const JS_FSRS = fs.readFileSync(path.join(TMP, 'out', 'fsrs.js'), 'utf8');
const JS_TPDF = fs.readFileSync(path.join(TMP, 'out', 'testopdf.js'), 'utf8');
const JS_IDX = fs.readFileSync(path.join(TMP, 'out', 'indicepagine.js'), 'utf8');
const JS = fs.readFileSync(path.join(TMP, 'out', 'neuro.js'), 'utf8');
const JS_PIAN = fs.readFileSync(path.join(TMP, 'out', 'pianificatore.js'), 'utf8');
let chiamateRete = 0;
const sandbox = { console, fetch: async () => { chiamateRete++; throw new Error('rete vietata nei test'); }, Math, Date, JSON, Promise, Set, Map };
vm.createContext(sandbox);
vm.runInContext(JS_JSON + '\n;this.JsonAI = JsonAI;', sandbox);
vm.runInContext(JS_FSRS + '\n;this.Fsrs = Fsrs;', sandbox);
vm.runInContext(JS_TPDF + '\n;this.TestoPdf = TestoPdf;', sandbox);
vm.runInContext(JS_IDX + '\n;this.IndicePagine = IndicePagine;', sandbox);
vm.runInContext(JS + '\n;this.Neuro = Neuro;', sandbox);
vm.runInContext(JS_PIAN + '\n;this.Pianificatore = Pianificatore;', sandbox);
const N = sandbox.Neuro, P = sandbox.Pianificatore, FS = sandbox.Fsrs, TP = sandbox.TestoPdf, IP = sandbox.IndicePagine;
const OGGI = '2026-11-18';

console.log('\n== BP3 §1.2 Matrice certezza × correttezza ==');
const prev = { iv: 3, ease: 2.5, due: OGGI, reps: 2 };
t('certo + sbagliata → illusione di competenza (0,5 g, ease −0,30, tag, contrastivo)', () => {
  const r = N.pianifica(prev, 3, false, OGGI);
  eq(r.iv, 0.5, 'intervallo'); eq(r.ease, 2.2, 'ease'); eq(r.ultimoCaso, 'illusione_competenza'); vero(r.tag.includes('illusione_competenza'), 'tag'); vero(r.contrastivo, 'feedback contrastivo'); eq(r.due, OGGI, 'ripasso oggi');
});
t('incerto + giusta → lucky guess (max 1 g, ease fermo, da_consolidare)', () => {
  const r = N.pianifica(prev, 1, true, OGGI);
  vero(r.iv <= 1, 'iv ≤ 1'); eq(r.ease, 2.5, 'ease invariato'); vero(r.daConsolidare, 'flag'); eq(r.ultimoCaso, 'lucky_guess');
});
t('certo + giusta → padronanza (voto FSRS «Facile»: intervallo più lungo dello standard)', () => {
  const std = N.pianifica(prev, 2, true, OGGI), r = N.pianifica(prev, 3, true, OGGI);
  vero(r.iv > std.iv, 'padronanza ' + r.iv + ' > standard ' + std.iv); vero(r.s > std.s, 'stabilità maggiore'); eq(r.ultimoCaso, 'padronanza');
});
t('incerto + sbagliata → lacuna nota (1 g + rimando alla teoria)', () => {
  const r = N.pianifica(prev, 1, false, OGGI); eq(r.iv, 1); vero(r.rimando, 'rimando'); eq(r.ultimoCaso, 'lacuna_nota');
});
t('illusione penalizza più della lucky guess', () => {
  const a = N.pianifica(prev, 3, false, OGGI), b = N.pianifica(prev, 1, true, OGGI); vero(a.iv < b.iv && a.ease < b.ease);
});
t('tag illusione tolto quando la risposta torna giusta', () => {
  const a = N.pianifica(prev, 3, false, OGGI), b = N.pianifica(a, 2, true, OGGI); vero(!b.tag || !b.tag.includes('illusione_competenza'));
});
t('ease mai sotto 1,3', () => { let s = { iv: 1, ease: 1.4, due: OGGI, reps: 0 }; for (let i = 0; i < 5; i++) s = N.pianifica(s, 3, false, OGGI); vero(s.ease >= 1.3); });

console.log('\n== BP3 §1.1 Retrocompatibilità (quiz v0.51–v0.53 senza campi neuro) ==');
const vecchia = { id: 'C-1-1-q1', sk: 'C-1-1', t: 'mcq', lv: 'Sbarramento', q: 'Domanda vecchia?', o: ['giusta', 'a', 'b', 'c', 'd'], e: ['In sintesi: x'] };
t('normalizza non aggiunge campi a una domanda vecchia', () => eq(Object.keys(N.normalizza(vecchia)).sort(), Object.keys(vecchia).sort()));
t('bloom stimato senza bloomLevel (mai undefined)', () => { eq(N.bloom(vecchia), 1); eq(N.bloom({ lv: 'Problema' }), 3); eq(N.bloom({ t: 'risposta_aperta_rubrica' }), 4); });
t('pianifica senza stato precedente né certezza → standard (primo «Bene» FSRS: 3 giorni)', () => { const r = N.pianifica(null, null, true, OGGI); eq(r.iv, 3); eq(r.s, 3.173); eq(r.ultimo, OGGI); eq(r.ultimoCaso, 'standard'); });

console.log('\n== Motore unificato · blocco 3: FSRS unico per le domande ==');
t('Fsrs: con ritenzione 0,90 intervallo = stabilità (S := iv è esatto)', () => { for (const x of [1, 3, 7, 21, 60]) eq(FS.intervallo(x, 0.9), x, 'S=' + x); });
t('Fsrs.daSm2: ease 2,5 → D 5, ease 1,3 → D 9, S = iv', () => { eq(FS.daSm2(3, 2.5), { d: 5, s: 3 }); eq(FS.daSm2(10, 1.3), { d: 9, s: 10 }); eq(FS.daSm2(0, 0).s, FS.W[2], 'iv assente → S del primo «Bene»'); });
t('votoCaso: illusione/lacuna/errore → 1, fortunata → 2, giusta → 3, padronanza → 4', () => {
  eq([N.votoCaso('illusione_competenza', false), N.votoCaso('lacuna_nota', false), N.votoCaso('standard', false), N.votoCaso('lucky_guess', true), N.votoCaso('standard', true), N.votoCaso('padronanza', true)], [1, 1, 1, 2, 3, 4]);
});
t('migrazione SM-2 → FSRS alla prima risposta: stesso passo di Fsrs con S = iv e t = oggi − (due − iv)', () => {
  const vecchio = { iv: 3, ease: 2.5, due: '2026-11-20', reps: 2 }, r = N.pianifica(vecchio, 2, true, '2026-11-20');
  const atteso = FS.passo({ d: 5, s: 3 }, 3, 3);
  eq(r.s, Math.round(atteso.s * 1000) / 1000, 'stabilità'); eq(r.d, Math.round(atteso.d * 1000) / 1000, 'difficoltà'); vero(r.iv > 3, 'giusta al momento giusto → intervallo più lungo: ' + r.iv);
});
t('record già FSRS: usa d, s e ultimo salvati (non ease)', () => {
  const a = { iv: 5, ease: 1.3, due: '2026-11-23', reps: 3, d: 4, s: 5, ultimo: '2026-11-18' }, r = N.pianifica(a, 2, true, '2026-11-23');
  eq(r.s, Math.round(FS.passo({ d: 4, s: 5 }, 3, 5).s * 1000) / 1000);
});
t('ritenzione più alta (esame vicino) → intervallo non più lungo', () => { const a = N.pianifica(prev, 2, true, OGGI, 0.9), b = N.pianifica(prev, 2, true, OGGI, 0.95); vero(b.iv <= a.iv && b.iv < 10); });
t('errore standard → voto 1: stabilità non maggiore e ripasso entro 1 giorno', () => { const r = N.pianifica({ iv: 10, ease: 2.5, due: OGGI, reps: 4, d: 5, s: 10, ultimo: '2026-11-08' }, 2, false, OGGI); vero(r.s <= 10 && r.iv <= 2, 's=' + r.s + ' iv=' + r.iv); eq(r.reps, 0); });
t('campi SM-2 conservati per i dispositivi con versioni precedenti (iv, ease, due, reps)', () => { const r = N.pianifica(prev, 2, true, OGGI); for (const k of ['iv', 'ease', 'due', 'reps']) vero(k in r, 'manca ' + k); eq(r.ease, 2.6); });
t('Ripassi e Neuro usano lo stesso nucleo FSRS (nessuna seconda copia delle formule)', () => {
  const m = leggi('07-memoria.ts'), n = leggi('07-neuro.ts'), q = leggi('07-quizapp.ts');
  vero(/= Fsrs;/.test(m) && !/W\[17\]/.test(m) && !/W\[17\]/.test(n), 'formule solo in 07-fsrs.ts');
  vero(/Fsrs\.passo/.test(n) && /Ripassi\.ritenzione\(r\.ultima\)/.test(q) && /d: p\.d, s: p\.s, ultimo: p\.ultimo/.test(q), 'QuizApp salva lo stato FSRS');
});
t('§4-F: sotto-step spuntato senza punteggio entra come «esposto» (nessun voto inventato)', () => {
  const m = leggi('07-memoria.ts'), c = leggi('07-coda.ts');
  vero(/function votoMedio\(k: string\): number \| null/.test(m) && /: null;\n  \}/.test(m), 'votoMedio senza punteggi → null');
  vero(/Fsrs\.esposizione\(\)/.test(m) && /due: piu\(giorno, 1\)/.test(m) && /esposto: true/.test(m), 'primo controllo il giorno dopo');
  vero(/!m\.ultimo \|\| m\.esposto\) return null/.test(m), 'ricordo non mostrato se mai verificato');
  vero(/x\.esposto \? 'primo controllo'/.test(c), 'coda: «primo controllo» al posto della percentuale');
  eq(FS.esposizione().s, 1); eq(FS.intervallo(FS.esposizione().s, 0.9), 1);
});

console.log('\n== Motore unificato · blocco 1: TestoPdf, punto unico di lettura dei PDF ==');
const ITEMS = [{ str: 'Il', hasEOL: false, transform: [1, 0, 0, 1, 50, 700] }, { str: 'potenziale', hasEOL: true, transform: [1, 0, 0, 1, 60, 700.4] },
  { str: '', hasEOL: false, transform: [1, 0, 0, 1, 50, 690] }, { str: 'd\'azione ', hasEOL: false, transform: [1, 0, 0, 1, 50, 680] }, { str: 'è', hasEOL: true, transform: [1, 0, 0, 1, 90, 681] }, {}];
// formule copiate dal codice di f82c7f0, per provare che il formato non cambia di un carattere
const VECCHIO = {
  spazi: it => it.map(x => x.str || '').join(' '),
  eol: it => it.map(x => (x.str || '') + (x.hasEOL ? '\n' : ' ')).join(''),
  righe: it => { const righe = []; let y = null, r = ''; for (const x of it) { const yy = Math.round(x.transform ? x.transform[5] : 0); if (y !== null && Math.abs(yy - y) > 2) { righe.push(r); r = ''; } r += (r && !r.endsWith(' ') ? ' ' : '') + x.str; y = yy; } if (r) righe.push(r); return righe.join('\n'); },
};
t('TestoPdf.formatta: «spazi», «eol» e «righe» identici alle formule di prima', () => {
  for (const m of ['spazi', 'eol', 'righe']) eq(TP.formatta(ITEMS, m), VECCHIO[m](ITEMS), m);
  eq(TP.formatta(ITEMS), VECCHIO.spazi(ITEMS), 'predefinito = spazi');
  eq(TP.formatta([], 'righe'), '', 'pagina vuota');
});
t('coda quiz: l\'hash `versione` di un PDF non cambia (stesso testo, stesso sha256)', () => {
  const pag = [ITEMS, ITEMS.slice(0, 2)];
  eq(pag.map(it => TP.formatta(it, 'spazi')).join('\n'), pag.map(VECCHIO.spazi).join('\n'));
  vero(/TestoPdf\.pagina\(doc, n, 'spazi'\)/.test(leggi('su-richiesta/07-codaquizrunner.ts')), 'il runner usa il formato «spazi»');
});
await t('TestoPdf.con chiude il documento anche se la lettura fallisce; ogni pagina viene pulita', async () => {
  const log = [];
  sandbox.caricaPdfJs = async () => ({ getDocument: o => { log.push('apri:' + o.isEvalSupported + ':' + o.data.length); return { promise: Promise.resolve({
    numPages: 2, destroy: async () => { log.push('chiudi'); },
    getPage: async n => ({ getTextContent: async () => { if (n === 2) throw new Error('pagina rotta'); return { items: ITEMS }; }, cleanup: () => log.push('pulisci:' + n) }) }) }; } });
  const blob = { arrayBuffer: async () => new ArrayBuffer(4) };
  eq(await TP.con(blob, d => TP.pagina(d, 1, 'eol')), VECCHIO.eol(ITEMS));
  let errore = '';
  try { await TP.con(blob, d => TP.pagina(d, 2)); } catch (e) { errore = e.message; }
  eq(errore, 'pagina rotta'); eq(log, ['apri:false:4', 'pulisci:1', 'chiudi', 'apri:false:4', 'pulisci:2', 'chiudi']);
});
t('i chiamanti passano da TestoPdf (Centro, coda quiz, master prompt, piani AI, appunti, wizard, Creaquiz, visore)', () => {
  const usi = { 'su-richiesta/07-centroui.ts': /TestoPdf\.con\(/, 'su-richiesta/07-codaquizrunner.ts': /TestoPdf\.con\(/, 'su-richiesta/07-strumentiquiz.ts': /TestoPdf\.con\(dati/,
    '07-pianiai.ts': /TestoPdf\.con\(blob/, '07-mano.ts': /TestoPdf\.con\(f,/, '07-dominio.ts': /TestoPdf\.righe\(await TestoPdf\.elementi/, '07-creaquiz.ts': /TestoPdf\.con\(await Drive\.scaricaBlob/, '07-studio.ts': /TestoPdf\.apri\(dati\)/ };
  for (const [f, re] of Object.entries(usi)) vero(re.test(leggi(f)), f);
  vero(/TestoPdf\.chiudi\(doc\)/.test(leggi('07-creaquiz.ts')) && /TestoPdf\.chiudi\(doc\)/.test(leggi('su-richiesta/07-strumentiquiz.ts')), 'chiusura uniforme');
  vero(!/declare const pdfjsLib/.test(leggi('07-studio.ts')), 'visore senza seconda copia del caricatore');
});

console.log('\n== Motore unificato · blocco 2: IndicePagine (BM25 per pagina, classi, due segnali su tre) ==');
// lingua finta e deterministica (nell'app: Locale.radice / Locale.espandi)
const LINGUA = { radice: w => w.length > 6 ? w.slice(0, -2) : w.length > 4 ? w.slice(0, -1) : w, espandi: p => p.concat(p.some(w => w.startsWith('potenzial')) ? ['depolarizzazione'] : []) };
const riemp = k => Array.from({ length: 40 }, (_, i) => 'parola' + ((i * 7 + k) % 53) + ' testo').join(' ');
const PAG = [
  { n: 1, testo: 'Indice del volume\n' + riemp(1) },
  { n: 2, testo: 'Capitolo 1 La cellula\n' + riemp(2) + ' membrana cellula organelli' },
  { n: 3, testo: '3.1 Il potenziale di membrana\n' + riemp(3) + ' potenziale potenziale potenziale membrana neurone' },
  { n: 4, testo: 'Il potenziale d\'azione\n' + riemp(4) + ' potenziale azione potenziale azione depolarizzazione soglia potenziale' },
  { n: 5, testo: 'Fasi del potenziale\n' + riemp(5) + ' potenziale potenziale ripolarizzazione potenziale canali sodio' },
  { n: 6, testo: 'Esercizio 3.4\n' + riemp(6) + ' calcola il potenziale potenziale potenziale con V = 70 mV' },
  { n: 7, testo: 'Capitolo 2 Il cuore\n' + riemp(7) + ' cuore atrio ventricolo' },
  { n: 8, testo: 'Il ciclo cardiaco\n' + riemp(8) + ' cuore ciclo come visto il potenziale' },
  { n: 9, testo: 'Capitolo 1 La cellula\n' + riemp(2) + ' membrana cellula organelli' },   // duplicato di p. 2 (stesso testo in un altro PDF)
  { n: 10, testo: 'Riepilogo\n' + riemp(10) },
  { n: 11, testo: 'Appendice\n' + riemp(11) },
  { n: 12, testo: 'Glossario\n' + riemp(12) },
];
const IDX = IP.costruisci('BIO', PAG, LINGUA);
t('costruisci: pagine duplicate indicizzate una volta (N e df non contano il doppione)', () => {
  eq(IDX.N, 11); eq(IDX.per.get(9).dup, 2, 'p. 9 = doppione di p. 2'); eq(IDX.df.get(LINGUA.radice('organelli')), 1, 'df di «organelli»');
});
t('soglia τ: 0,55 × il punteggio massimo della query; 0 se nessuna pagina risponde', () => { eq(IP.soglia([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 5.5); eq(IP.soglia([0, 0]), 0); eq(IP.soglia([4]), 2.2); });
t('τ non dipende dalla lunghezza del libro: pagine estranee in più non lo spostano (il percentile sì)', () => {
  const lungo = IP.costruisci('BIO', PAG.concat(Array.from({ length: 60 }, (_, i) => ({ n: 100 + i, testo: 'Altro\n' + riemp(20 + i) + ' potenziale' }))), LINGUA);
  const t1 = IP.copertura(IDX, ['potenziale']).tau, t2 = IP.copertura(lungo, ['potenziale']).tau;
  vero(Math.abs(t1 - t2) / t1 < 0.25, 'τ ' + t1 + ' vs ' + t2);
});
t('contiguità: la pagina accanto a una trattazione, con i termini, ne fa parte (fino a 2 pagine); mai fuori dall\'intervallo', () => {
  const c = IP.copertura(IDX, ['potenziale'], { tau: 2 }), cl = n => (c.riscontri.find(r => r.n === n) || {}).classe;
  const forti = c.riscontri.filter(r => r.segnali.bm25).map(r => r.n);
  eq(forti, [4], 'sopra τ solo p. 4');
  eq([3, 4, 5, 6].map(cl).every(x => x === 'approfondimento' || x === 'applicazione'), true, 'tratto 3–6 intero: ' + [3, 4, 5, 6].map(cl));
  vero(/accanto a una trattazione/.test(c.riscontri.find(r => !r.segnali.bm25 && r.n >= 3 && r.n <= 6).motivo), 'motivo spiegato');
  eq(IP.copertura(IDX, ['potenziale'], { tau: 1, intervallo: [3, 6] }).riscontri.find(r => r.n === 8).classe, 'richiamo', 'p. 8 fuori intervallo resta richiamo');
});
t('BM25: la pagina che tratta il concetto supera quella che lo cita di passaggio', () => {
  const c = IP.copertura(IDX, ['potenziale'], { tau: 1 });
  const s = n => (c.riscontri.find(r => r.n === n) || {}).punteggio || 0;
  vero(s(4) > s(8) && s(3) > s(8), 'p.3 ' + s(3) + ' / p.4 ' + s(4) + ' > p.8 ' + s(8));
});
t('classi: approfondimento (≥ 3 pagine contigue), applicazione (esercizio), presenza, richiamo fuori intervallo', () => {
  const c = IP.copertura(IDX, ['potenziale'], { tau: 1, intervallo: [3, 6] }), cl = n => (c.riscontri.find(r => r.n === n) || {}).classe;
  eq([cl(3), cl(4), cl(5)], ['approfondimento', 'approfondimento', 'approfondimento']); eq(cl(6), 'applicazione'); eq(cl(8), 'richiamo');
  eq(c.tratti, [{ da: 3, a: 6, classe: 'approfondimento' }]);
});
t('due segnali su tre: intervallo + BM25 → coperto; solo BM25 → da verificare; nessun termine → lacuna', () => {
  eq(IP.copertura(IDX, ['potenziale'], { tau: 1, intervallo: [3, 6] }).stato, 'coperto');
  const solo = IP.copertura(IDX, ['potenziale'], { tau: 1 });
  eq(solo.stato, 'da_verificare'); vero(solo.incertezze.some(x => /intervallo/.test(x)), 'dichiara il segnale mancante');
  eq(IP.copertura(IDX, ['fotosintesi'], { intervallo: [3, 6] }).stato, 'lacuna');
  eq(IP.copertura(IDX, ['potenziale'], { tau: 1, verificate: [4] }).stato, 'coperto', 'BM25 + verifica MappaPagine');
});
t('fuori programma: pagina nell\'intervallo senza termini del microstep è segnalata, non cancellata', () => {
  const c = IP.copertura(IDX, ['potenziale'], { tau: 1, intervallo: [3, 7] });
  eq((c.riscontri.find(r => r.n === 7) || {}).classe, 'fuori_programma');
});
t('correzioni manuali: inclusa vince su τ, esclusa sparisce', () => {
  const c = IP.copertura(IDX, ['cuore'], { tau: 99, incluse: [7], escluse: [8] });
  eq(c.stato, 'coperto'); vero(!c.riscontri.some(r => r.n === 8), 'esclusa'); eq((c.riscontri.find(r => r.n === 7) || {}).motivo, 'inclusa a mano');
});
t('sinonimi a peso 0,5 e riscontro spiegato (estratto ≤ 200 caratteri + «…», motivo, segnali)', () => {
  const c = IP.copertura(IDX, ['potenziale'], { tau: 1, intervallo: [3, 6] }), r = c.riscontri.find(x => x.n === 4);
  vero(r.estratto.length <= 202 && /potenziale/i.test(r.estratto), 'estratto: ' + r.estratto.length);
  vero(/BM25 .* ≥ τ 1/.test(r.motivo) && r.segnali.intervallo && r.segnali.bm25 && !r.segnali.verificata, r.motivo);
  const conSin = IP.copertura(IDX, ['potenziale'], { tau: 1 }).riscontri.find(x => x.n === 4).punteggio;
  const senza = IP.copertura(IP.costruisci('BIO', PAG, { radice: LINGUA.radice, espandi: p => p }), ['potenziale'], { tau: 1 }).riscontri.find(x => x.n === 4).punteggio;
  vero(conSin > senza, 'il sinonimo alza il punteggio: ' + conSin + ' > ' + senza);
});
t('titoliDa: righe numerate e intestazioni brevi, non le frasi', () => {
  eq(IP.titoliDa('3.1 Il potenziale di membrana\nQuesta è una frase lunga che finisce con un punto.\nFasi del potenziale'), ['3.1 Il potenziale di membrana', 'Fasi del potenziale']);
});
t('cache del testo PDF svuotata al cambio account (isolamento) e indice nel chunk su richiesta', () => {
  vero(/caches\.delete\('imc-testo-pdf'\)/.test(leggi('06-privacy.ts')) && /CACHE = 'imc-testo-pdf'/.test(leggi('07-testopdf.ts')), 'Privacy svuota la cache del testo');
  vero(fs.existsSync(path.join(SRC, 'su-richiesta', '07-indicepagine.ts')) && !fs.existsSync(path.join(SRC, '07-indicepagine.ts')), 'IndicePagine fuori da app.js');
});
t('metadati non validi scartati, validi conservati', () => {
  const d = N.normalizza({ ...vecchia, bloomLevel: 7, distractorTypes: { 1: 'misconception', 2: 'boh' }, confidenceLog: 'x', sourceRef: { libro: 'Zan', stepId: 'C-1' } });
  vero(d.bloomLevel === undefined && d.confidenceLog === undefined); eq(d.distractorTypes, { 1: 'misconception' }); eq(d.sourceRef, { libro: 'Zan', stepId: 'C-1' });
});
t('confidenceLog limitato agli ultimi 10 tentativi', () => {
  let l = []; for (let i = 0; i < 14; i++) l = N.aggiungiTentativo(l, { ts: String(i), corretto: true, livelloCertezza: 2, tempoRispostaMs: 1000 }); eq(l.length, 10); eq(l[0].ts, '4');
});

console.log('\n== BP3 §1.3 Interleaving e fatica ==');
const mk = (step, b, i) => ({ id: step + i, q: step + i, stepId: step, bloomLevel: b });
const blocchi = [...Array(8)].map((_, i) => mk('A', 1, i)).concat([...Array(5)].map((_, i) => mk('B', 3, i)), [...Array(5)].map((_, i) => mk('C', 2, i)));
t('mai più di 2 domande di fila sullo stesso stepId', () => {
  const ord = N.interleave(blocchi); eq(ord.length, blocchi.length); eq(new Set(ord).size, blocchi.length, 'permutazione');
  vero(N.filaMax(ord.map(i => blocchi[i])) <= 2, 'fila ' + N.filaMax(ord.map(i => blocchi[i])));
});
t('interleaving con alternanza Bloom resta ≤ 2 di fila', () => { const ord = N.interleave(blocchi, undefined, { alterna: true }); vero(N.filaMax(ord.map(i => blocchi[i])) <= 2); });
t('interleaving: alternanza 1–2 / 3–4 quando possibile', () => {
  const it = [mk('A', 1, 0), mk('B', 1, 1), mk('C', 1, 2), mk('D', 4, 3), mk('E', 4, 4), mk('F', 4, 5)];
  const ord = N.interleave(it, undefined, { alterna: true }).map(i => it[i].bloomLevel >= 3 ? 'a' : 'b').join(''); eq(ord, 'bababa', 'sequenza');
});
t('fatica: risposte impulsive → banner', () => { const r = N.fatica([8000, 9000, 8500, 9000, 8800, 9100, 2000, 1500, 1200, 1100, 1000], Array(11).fill(true)); vero(r.allarme); eq(r.motivo, 'impulsive'); });
t('fatica: 3 errori con tempi in crescita > 1,8× → banner', () => { const r = N.fatica([5000, 5000, 5200, 4800, 5000, 5100, 7000, 8000, 9500], [true, true, true, true, true, true, false, false, false]); vero(r.allarme); eq(r.motivo, 'errori_lenti'); });
t('fatica: ritmo regolare → nessun banner', () => vero(!N.fatica([5000, 5200, 4900, 5100, 5000, 5300, 4800], Array(7).fill(true)).allarme));
t('testo del banner fatica come da blueprint', () => eq(N.TESTO_FATICA, 'Calo attentivo rilevato: pausa consigliata di 3 minuti o chiusura sessione'));

console.log('\n== BP3 §2 Imbuto AI ==');
const dL1 = { ...vecchia, spiegazione: 'Perché sì.', spiegazioneDistrattori: { 2: 'b è un caso limite' }, distractorTypes: { 2: 'caso_limite' } };
await t('livello 0 (locale) → 0 chiamate di rete, micro mai chiamata', async () => {
  chiamateRete = 0; let micro = 0;
  const r = await N.imbuto(vecchia, 1, { locale: () => 'spiegato dal plugin locale', micro: async () => { micro++; return { testo: 'x', modello: 'm' }; } });
  eq(r.livello, 0); eq(micro, 0); eq(chiamateRete, 0);
});
await t('livello 1 (spiegazione già pronta) → 0 chiamate di rete', async () => {
  chiamateRete = 0; let micro = 0;
  const r = await N.imbuto(dL1, 2, { micro: async () => { micro++; return { testo: 'x', modello: 'm' }; } });
  eq(r.livello, 1); vero(r.testo.includes('caso limite') && r.testo.includes('Perché sì.')); eq(micro, 0); eq(chiamateRete, 0);
});
await t('livello 1 (cache salvata) → 0 chiamate di rete', async () => {
  chiamateRete = 0; let micro = 0;
  const r = await N.imbuto(vecchia, 1, { cache: () => 'già spiegata ieri', micro: async () => { micro++; return { testo: 'x', modello: 'm' }; } });
  eq(r.livello, 1); eq(micro, 0); eq(chiamateRete, 0);
});
await t('livello 2 solo se mancano 0 e 1 (una sola micro-chiamata)', async () => {
  let micro = 0; const r = await N.imbuto(vecchia, 1, { micro: async () => { micro++; return { testo: 'ok', modello: 'gemini-3.5-flash-lite' }; } }); eq(r.livello, 2); eq(micro, 1);
});
await t('modalità senza AI → nessuna chiamata, risultato nullo', async () => { let micro = 0; const r = await N.imbuto(vecchia, 1, { senzaAI: true, micro: async () => { micro++; return { testo: '', modello: '' }; } }); eq(r, null); eq(micro, 0); });
t('prompt micro ≤ 120 parole anche con domanda lunghissima', () => { const p = N.promptMicro({ q: 'parola '.repeat(400), corretta: 'x '.repeat(50), scelta: 'y '.repeat(50), archetipo: 'stem_quantitativo' }); vero(N.parole(p) <= 120, N.parole(p) + ' parole'); });
t('budget di uscita del livello 2 = 350 token', () => eq(N.MAX_TOKEN_MICRO, 350));
t('circuit breaker oltre 15 domande', () => { eq(N.serveBreaker(15), false); eq(N.serveBreaker(16), true); });
t('prompt per Gemini con bloomLevel, distractorTypes e sourceRef', () => { const p = N.promptGemini({ argomento: 'enzimi', n: 30, stepId: 'B-2.1' }); for (const k of ['bloomLevel', 'distractorTypes', 'sourceRef', 'B-2.1', '30']) vero(p.includes(k), 'manca ' + k); });

console.log('\n== BP3 §3 Creaquiz Leggero: parser, deduplica, cloze, template, export ==');
const sporco = 'Ecco il quiz:\n```json\n[\n {"question": "Qual è il pH neutro?", "options": ["5", "7", "9", "11"], "answer": "B", "bloomLevel": 1,},\n {"domanda": "Gli enzimi abbassano…", "opzioni": ["la temperatura", "l\'energia di attivazione", "il pH", "la pressione"], "corretta": 1, "distractorTypes": {"0": "misconception", "2": "confusione_termine"}},\n {"question": "", "options": ["a", "b"]},\n]\n```';
t('JSON sporco riparato (markdown, virgole finali, alias)', () => {
  const r = N.importa(sporco, 'qc-x'); eq(r.domande.length, 2); eq(r.scartate, 1, 'scartate');
  eq(r.domande[0].o[0], '7', 'corretta in o[0]'); eq(r.domande[1].o[0], "l'energia di attivazione"); vero(r.riparazioni.length > 0, 'riparazioni segnalate');
  eq(r.domande[1].distractorTypes, { 1: 'misconception', 2: 'confusione_termine' }, 'distrattori rimappati');
});
t('importa pacchetto .imcpack/oggetto {domande:[…]}', () => { const r = N.importa(JSON.stringify({ domande: [{ q: 'Che cos\'è un acido?', a: ['donatore di protoni'] }] }), 's'); eq(r.domande.length, 1); eq(r.domande[0].t, 'fill'); });
t('JSON illeggibile → errore chiaro, nessuna eccezione', () => { const r = N.importa('{{{ niente', 's'); vero(r.errore && !r.domande.length); });
t('deduplica con badge «Nuove: X | Già presenti saltate: Y»', () => {
  const r = N.importa(sporco, 'qc-x'), d = N.deduplica(r.domande.concat([{ q: 'QUAL È il pH  neutro??' }]), [{ q: 'Gli enzimi abbassano...' }]);
  eq(d.nuove.length, 1); eq(d.saltate, 2); eq(d.badge, 'Nuove: 1 | Già presenti saltate: 2');
});
t('cloze dalle frasi chiave (termine in grassetto)', () => { const c = N.cloze('Il **mitocondrio** è la centrale energetica della cellula eucariotica. Corto.', { sk: 's', stepId: 'B-1' }); eq(c.length, 1); eq(c[0].a, ['mitocondrio']); vero(c[0].q.includes('……')); eq(c[0].stepId, 'B-1'); });
t('v0.57.1 Q1: cloze da appunto — {{x}} = risposta x, «q :: r» = domanda/risposta, niente graffe visibili', () => {
  const c = N.cloze('# Rivoluzione\n- La presa della {{Bastiglia}} avviene nel 1789.\n- Quando inizia la Rivoluzione francese? :: 1789\nIl {{=2+3}} resta un template.', { sk: 's' });
  const g = c.find(x => x.a[0] === 'Bastiglia'), q = c.find(x => x.a[0] === '1789');
  vero(g && g.q === 'La presa della …… avviene nel 1789.', 'completamento dalle graffe');
  vero(q && q.q === 'Quando inizia la Rivoluzione francese?' && q.lv === 'Domanda', 'domanda :: risposta');
  vero(c.every(x => !/\{\{|\}\}|::/.test(x.q)), 'nessuna graffa o :: nel testo');
});
t('v0.57.1 D1/D2/D3/D5/Q3/Q6: guardie statiche', () => {
  vero(!/MATERIE_BASE/.test(leggi('07-studio.ts') + leggi('07-dominio.ts') + leggi('07-extra.ts') + leggi('07-pianiai.ts') + leggi('07-quizapp.ts'))
    && /Stato\.tutti<MateriaRec>\('materia'\)/.test(leggi('07-pianiai.ts')), 'D1/T11 materie solo dai record');
  vero(/Drive\.eProprietario\(\) \? \['Chimica'/.test(leggi('07-creaquiz.ts')), 'D2 creaquiz');
  vero(/case 'studiaora': return widgetStudiaOra\(\)/.test(leggi('08-viste.ts')), 'D3 Studia ora (v0.58: sempre)');
  vero(/MATRICE_LIVELLI\.map\(/.test(leggi('07-pianiai.ts')) && !/MATRICE_5_LIVELLI/.test(leggi('07-pianiai.ts')), 'D5 → v0.60: wizard 1–3');
  vero(/for \(const c of carteNuove\) Stato\.elimina\(c\)/.test(leggi('07-quizapp.ts')) && /annullaPiani\(\)/.test(leggi('07-quizapp.ts')), 'Q3 annulla completo');
  vero(/dataset\.titolo === titolo/.test(leggi('07-studio.ts')), 'Q6 un solo visore');
});
t('template parametrici {{var:min:max:step}} e {{=espr}}', () => {
  const v = N.varianti({ id: 't', q: 'Quanto fa {{a:2:9}} × {{b:2:9}}?', o: ['{{=a*b}}', '{{=a*b+1}}', '{{=a*b-1}}'] }, 5, (() => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; })());
  vero(v.length >= 3); for (const x of v) { const [a, b] = x.q.match(/\d+/g).map(Number); eq(x.o[0], String(a * b)); }
});
t('export: filtri errori / illusioni / Bloom ≥ 3', () => {
  const dd = [{ id: '1', q: 'a', lv: 'Problema' }, { id: '2', q: 'b' }, { id: '3', q: 'c' }];
  const st = { 1: { n: 1, esito: true }, 2: { n: 1, esito: false }, 3: { n: 1, esito: true, neuro: { tag: ['illusione_competenza'] } } };
  eq(N.daEsportare(dd, st, 'errori').map(x => x.id), ['2']); eq(N.daEsportare(dd, st, 'illusione').map(x => x.id), ['3']); eq(N.daEsportare(dd, st, 'bloom3').map(x => x.id), ['1']);
});
t('pacchetto .imcpack senza confidenceLog né statistiche', () => {
  const p = N.pacchetto([{ ...vecchia, confidenceLog: [{ ts: 'x' }], gen: true }], { titolo: 'T', archetipo: 'stem_quantitativo', modalita: 'universita_triennale', oggi: OGGI });
  eq(p.formato, 'imcpack-v1'); vero(!JSON.stringify(p).includes('confidenceLog') && !JSON.stringify(p).includes('"gen"'));
});
t('pipeline: bozza → pronta → verificata → bozza e copertura Bloom', () => {
  eq([N.prossimoStato('bozza'), N.prossimoStato('pronta'), N.prossimoStato('verificata'), N.prossimoStato('boh')], ['pronta', 'verificata', 'bozza', 'pronta']);
  const c = N.copertura([{ bloomLevel: 1 }, { bloomLevel: 3 }, { lv: 'Problema' }]); eq(c.quizBankCount, 3); eq(c.mancanti, [2, 4]); eq(c.pct, 50);
});

console.log('\n== Regressione statica su src/ ==');
const ia = leggi('07-ia.ts');
t('catena «genera»: gemini → groq → xkiro → cohere → requesty (v0.60: via cerebras/sambanova)', () => {
  const m = /genera:\s*\[([^\]]+)\]/.exec(ia.slice(ia.indexOf('const CATENA'))); eq(m[1].replace(/['\s]/g, '').split(','), ['gemini', 'groq', 'xkiro', 'cohere', 'requesty']);
});
t('catena «micro» (livello 2): gemini → groq → xkiro, uscita 350 token', () => {
  const m = /micro:\s*\[([^\]]+)\]\s*\}/.exec(ia.slice(ia.indexOf('const CATENA'))); eq(m[1].replace(/['\s]/g, '').split(','), ['gemini', 'groq', 'xkiro']);
  vero(/micro:\s*350/.test(ia), 'USCITA.micro'); vero(/gemini:\s*\{\s*micro:\s*\['gemini-3\.5-flash-lite'/.test(ia), 'flash-lite per primo');
});
// v0.59.2: anche src/su-richiesta/ (strumenti-quiz.js, caricato al primo uso)
function SRC_TUTTI() { return [...fs.readdirSync(SRC).filter(x => x.endsWith('.ts')), ...fs.readdirSync(path.join(SRC, 'su-richiesta')).filter(x => x.endsWith('.ts')).map(x => 'su-richiesta/' + x)]; }
t('nessun riferimento attivo a Mistral/OpenRouter/Cerebras/SambaNova in src/ né in connect-src', () => {
  const sporchi = [];
  for (const f of SRC_TUTTI()) leggi(f).split('\n').forEach((r, i) => {
    const codice = r.replace(/\/\/.*$/, '').replace(/\/\*\*.*\*\//, '');
    if (/mistral|openrouter|cerebras|sambanova/i.test(codice) && !/const RITIRATI = \[/.test(codice)) sporchi.push(f + ':' + (i + 1));
  });
  eq(sporchi, [], 'righe');
  vero(!/cerebras|sambanova/.test(fs.readFileSync(path.join(SRC, '..', 'public', 'index.html'), 'utf8')), 'connect-src ridotta');
});
t('Google Calendar: scritture solo sul calendario specchio (gcalId), mai su primary', () => {
  const g = leggi('06-gcal.ts'), scritture = g.split('\n').filter(r => /method: '(PUT|POST|DELETE|PATCH)'/.test(r));
  vero(g.includes('i.gcalId'), 'specchio'); vero(scritture.length > 0, 'scritture trovate');
  for (const r of scritture) { if (/chiama\('calendars', \{ method: 'POST'/.test(r)) continue;   // creazione del calendario specchio stesso
    vero(!/primary/.test(r), 'scrittura su primary: ' + r.trim().slice(0, 80)); vero(/'calendars\/' \+ cal \+/.test(r), 'scrittura fuori dallo specchio: ' + r.trim().slice(0, 80)); }
});
t('schemaVersion invariata (retrocompatibile)', () => vero(/schemaVersion: 2/.test(leggi('08-viste.ts'))));
t('QuizApp usa matrice, interleaving, imbuto e fatica', () => { const q = leggi('07-quizapp.ts'); for (const k of ['Neuro.pianifica', 'Neuro.interleave', 'Neuro.imbuto', 'Neuro.fatica', "'micro'", 'qz-cert']) vero(q.includes(k), 'manca ' + k); });
t('Simulazione Esame senza certezza, Allenamento Neuro predefinito', () => { const q = leggi('07-quizapp.ts'); vero(q.includes("'imc-quiz-modo'") && /esame/.test(q) && /neuro/.test(q)); });
t('Creaquiz Leggero esposto e collegato a deduplica/importa/breaker', () => { const c = leggi('07-creaquiz.ts'); for (const k of ['function leggero', 'leggero }', 'Neuro.deduplica', 'Neuro.importa', 'Neuro.serveBreaker', 'Copia Prompt Ottimizzato per Gemini', 'Neuro.copertura']) vero(c.includes(k), 'manca ' + k); });
t('Neuro concatenato prima dei moduli che lo usano', () => { const f = fs.readdirSync(SRC).filter(x => x.endsWith('.ts')).sort(); vero(f.indexOf('07-neuro.ts') >= 0 && f.indexOf('07-neuro.ts') < f.indexOf('07-quizapp.ts')); });
t('versione app 0.64.5', () => vero(/const VERSIONE = '0.64.5'/.test(leggi('09-main.ts'))));
t('v0.58.4: build senza commenti (peso app.js)', () => vero(/"removeComments": *true/.test(fs.readFileSync(new URL('tsconfig.json', import.meta.url), 'utf8'))));
t('v0.58.5: niente banner fisso di aggiornamento, avvisi al massimo 2', () => vero(!/avviso\('Nuova versione/.test(leggi('09-main.ts')) && /zona\.children\.length >= 2/.test(leggi('04-componenti.ts'))));
t('v0.58.6: nessun vicolo cieco (materia al volo, Annulla nel toast, guida su Oggi)', () => vero(/function campoMateria/.test(leggi('07-extra.ts')) && /testo: 'Annulla'/.test(leggi('07-rapido.ts')) && /function iniziaIn3Passi/.test(leggi('08-viste.ts')) && /Ho una data d’esame/.test(leggi('07-generatore.ts'))));
t('v0.59: coda unica di ripasso (CodaRipasso, un solo riquadro Ripassa, Studia ora dalla coda)', () => vero(/const CodaRipasso/.test(leggi('07-coda.ts')) && /function widgetRipassa/.test(leggi('07-coda.ts')) && !/function widgetCarte|function widgetAppunti|function widgetRipassi/.test(leggi('07-carte.ts') + leggi('07-appunti.ts') + leggi('07-memoria.ts')) && /CodaRipasso\.dovuti/.test(leggi('07-studiaora.ts')) && /case 'ripassi': return widgetRipassa\(\)/.test(leggi('08-viste.ts'))));
t('v0.59.1: Oggi «vuoto» solo senza studio (piani, coda, appunti, mazzi)', () => vero(/vuotoTotale = senzaCorsi && !Studio\.pkPiani\(\)\.length && !CodaRipasso\.conta\(\)/.test(leggi('08-viste.ts'))));
t('v0.60 N2: appunto collegato a uno step scelto da un elenco (piani attivi + corsi), il titolo non lo sovrascrive', () => { const a = leggi('07-appunti.ts'); vero(/function passiCollegabili/.test(a) && /Studio\.pianiAttivi\(\)/.test(a) && /'aria-label': 'Collega a uno step'/.test(a) && /if \(!a\.subMano\) \{ const col = Carte\.collega/.test(a)); });
t('v0.60 N1: nota del giorno = appunto datato (id fisso, migrazione che non ricrea gli eliminati, nota vecchia intatta)', () => { const a = leggi('07-appunti.ts'), v = leggi('08-viste.ts'); vero(/'ap-giorno-' \+ k/.test(a) && /Stato\.esiste\(idGiorno\(x\.giorno\)\)/.test(a) && /giorno\?: string; sub\?/.test(a), 'appunti'); vero(/esiste\(id: string\): boolean \{ return rec\.has\(id\)/.test(leggi('03-modello.ts')), 'Stato.esiste'); vero(/Appunti\.salvaGiorno\(kG/.test(v) && !/type: 'nota', updatedAt: 0, titolo: 'Nota del '/.test(v), 'Oggi'); vero(/Appunti\.migraNoteGiorno\(\)/.test(leggi('09-main.ts')), 'avvio'); });

t('v0.60 Taglio: Studio 4 sotto-schede, 3 stili in Aspetto, Modalità esame che nasconde solo il superfluo e non riaccende i nascosti', () => {
  const st = leggi('07-studio.ts'), v = leggi('08-viste.ts'), c = leggi('07-carte.ts'), m = leggi('03-modello.ts');
  vero(/\['Ripassa', \['carte'\]/.test(st) && /\['Piano', \['piano'\]/.test(st) && /\['Corsi', \['schede', 'syllabus', 'tabelle', 'esami'\]/.test(st) && /\['Progressi', \['statistiche', 'errori'\]/.test(st), '4 gruppi');
  vero(!/Altro ▾/.test(st), 'niente più «Altro ▾»');
  vero(/details\.personalizza/.test(v) && /function sezionePreset/.test(v) && /role: 'radiogroup'/.test(v), 'U8 preset in cima, Personalizza chiuso');
  vero(/SUPERFLUI_ESAME = \['nota', 'tabelle', 'domani'\]/.test(v) && /!\(i\.widgetNascosti \|\| \[\]\)\.includes\(w\) && \(!esame/.test(v), 'esame: nascosti restano nascosti');
  vero(/modalitaEsame\(\)/.test(c), 'niente carte nuove negli ultimi 3 giorni');
  vero(/widgetNascosti: \['nota', 'tabelle', 'chiusura'\]/.test(m), 'nota/tabelle/chiusura spenti di default');
});
// ================= BP4 — Pianificatore Neuro-Algoritmico Ibrido =================
console.log('\n== BP4 Pianificatore Neuro-Algoritmico Ibrido ==');
const finestre = (da, a, giorni = [1, 2, 3, 4, 5, 6]) => giorni.map(g => ({ giornoSettimana: g, oraInizio: da, oraFine: a }));
const V = (o = {}) => ({ materiaCodice: 'C', archetipo: 'scienze_sperimentali', sorgentiDriveIds: [], dataTarget: '2026-12-08', livelloPartenza: 'da_zero',
  livelloObiettivo: 4, finestreSettimanali: finestre('15:00', '19:00'), maxOreGiorno: 3, ...o });
const UNITA = [
  { uid: 'U1', titolo: 'Atomo', prereq: [], densita: 2, minutiBase: 90, concettiChiave: [], fileId: 'f1', nomeFile: 'Chimica.pdf', pagine: [1, 10] },
  { uid: 'U2', titolo: 'Legami', prereq: ['U1'], densita: 3, minutiBase: 90, concettiChiave: [], fileId: 'f1', nomeFile: 'Chimica.pdf', pagine: [11, 22] },
  { uid: 'U3', titolo: 'Stechiometria', prereq: ['U1'], densita: 4, minutiBase: 90, concettiChiave: [] },
  { uid: 'U4', titolo: 'Reazioni', prereq: ['U2', 'U3'], densita: 3, minutiBase: 90, concettiChiave: [] },
];
const minHM = s => +s.slice(0, 2) * 60 + +s.slice(3, 5);
const tutteVoci = p => p.giorni.flatMap(g => g.voci.map(v => ({ ...v, data: g.data })));
const STAT_ILL = [{ sk: 'C-3.1.1-1', n: 3, ok: 1, neuro: { ultimoCaso: 'illusione_competenza', tag: ['illusione_competenza'] } }, { sk: 'C-3.1.1-2', n: 2, ok: 2, ipercorrezioni: 1 }];

await t('testFattibilitaCritica: 40 unità in ~4 h → critico, 3 rimedi, 0 chiamate AI e di rete', async () => {
  const indice = Array.from({ length: 40 }, (_, i) => (i + 1) + ' Capitolo numero ' + (i + 1) + ' ..... ' + (1 + i * 10)).join('\n');
  let ia = 0; const rete0 = chiamateRete;
  const r = await P.creaPiano(V({ dataTarget: '2026-11-21', finestreSettimanali: finestre('17:00', '19:00'), maxOreGiorno: 2 }),
    { oggi: OGGI, testoIndice: indice, ia: async () => { ia++; return '[]'; } });
  eq(r.fatt.stato, 'critico', 'stato'); vero(r.piano === null, 'nessun piano'); eq(r.fatt.rimedi.map(x => x.tipo).sort(), ['piu_minuti', 'sopravvivenza', 'sposta_data'], 'rimedi');
  vero(r.fatt.oreDisponibili <= 4.5 && r.fatt.oreNecessarie > 40, 'ore ' + r.fatt.oreDisponibili + '/' + r.fatt.oreNecessarie);
  eq(ia, 0, 'chiamate AI'); eq(r.chiamate, 0, 'chiamate dichiarate'); eq(r.tokenStimati, 0, 'token'); eq(chiamateRete - rete0, 0, 'rete');
});

await t('testAntiLoopGCal: specchio/app/trasparenti/cancellati non sono occupato; primary letto solo in GET', async () => {
  const ev = (o) => ({ start: { dateTime: '2026-11-19T16:00:00' }, end: { dateTime: '2026-11-19T17:00:00' }, ...o });
  const occ = P.occupatoDaEventi([
    ev({ summary: 'Lezione' }),
    ev({ summary: 'Specchio', organizer: { email: 'mirror123@group.calendar.google.com' } }),
    ev({ summary: 'App', extendedProperties: { private: { imc: '1' } } }),
    ev({ summary: 'Libero', transparency: 'transparent' }),
    ev({ summary: 'Annullato', status: 'cancelled' }),
  ], 'mirror123@group.calendar.google.com');
  eq(occ.length, 1, 'eventi occupati'); eq(occ[0].inizio, '2026-11-19T16:00', 'inizio');
  const v = V({ maxOreGiorno: 4 }), senza = P.capacita(v, OGGI, []), con = P.capacita(v, OGGI, occ);
  const g = d => (x => x ? x.minuti : 0)(senza.find(x => x.data === d)) - (x => x ? x.minuti : 0)(con.find(x => x.data === d));
  vero(g('2026-11-19') > 0, 'l\'impegno di primary riduce la capacità del giorno');
  const gc = leggi('06-gcal.ts'), fn = gc.slice(gc.indexOf('async function occupatoPrimary'), gc.indexOf('function programma'));
  vero(/calendars\/primary\/events/.test(fn) && !/method:/.test(fn), 'lettura primary solo GET');
  vero(fn.includes('Pianificatore.occupatoDaEventi') && fn.includes('gcalMirrorCalendarId()'), 'filtro anti-loop sullo specchio');
  vero(/gcalLeggiPrimary/.test(fn) && /calendar\.events\.readonly/.test(gc), 'lettura primary opt-in con scope di sola lettura');
});

await t('testFallbackOfflineZeroAI: AI con 429 → indice locale (TOC), piano valido, 0 token', async () => {
  const indice = ['1 Atomo ..... 1', '2 Legami chimici ..... 12', '3 Stechiometria ..... 25', '4 Reazioni ..... 38'].join('\n');
  let viste = 0; const rete0 = chiamateRete;
  const r = await P.creaPiano(V(), { oggi: OGGI, testoIndice: indice, pid: 'ai-test1',
    ia: async (msgs, o) => { viste++; eq(o.maxOut, 1800, 'max_tokens'); try { await sandbox.fetch('https://api.groq.com/x'); } catch (_) { /* contata */ } const e = new Error('429 Too Many Requests'); e.status = 429; throw e; } });
  eq(viste, 1, 'una sola chiamata AI'); eq(chiamateRete - rete0, 1, 'una sola richiesta di rete');
  eq(r.fonte, 'toc', 'fonte'); eq(r.tokenStimati, 0, 'token'); vero(r.piano && r.piano.giorni.length > 0, 'piano valido');
  eq(r.piano.fonteMappa, 'toc'); eq(r.piano.unita.length, 4, 'unità dall\'indice'); eq(r.piano.unita[1].prereq, ['U1'], 'prerequisiti lineari');
  // risposta AI troncata: si recuperano gli oggetti completi (grounding sulla struttura)
  const parz = P.recuperaArrayParziale('[{"uid":"U1","titolo":"Atomo","prereq":[],"densita":2,"minutiBase":60,"concettiChiave":["protone"]},{"uid":"U2","tit');
  eq(parz.length, 1, 'JSON parziale');
});

await t('testAllocazioneFSRS4Livelli: ordine topologico, L1→L4, ripassi FSRS, fine ≤ 21:30, target−1 leggero ≤ 60 min', async () => {
  const r = await P.creaPiano(V({ finestreSettimanali: finestre('18:00', '23:00', [0, 1, 2, 3, 4, 5, 6]) }), { oggi: OGGI, unita: UNITA, pid: 'ai-test2' });
  vero(r.piano, 'piano creato (' + r.fatt.stato + ')'); const voci = tutteVoci(r.piano);
  const prima = (uid, l) => (voci.filter(v => v.uid === uid && v.livelloCognitivo === l && !v.isRipassoFSRS).map(v => v.data).sort()[0]) || '9999';
  for (const u of UNITA) {
    for (let l = 1; l < 4; l++) vero(prima(u.uid, l) <= prima(u.uid, l + 1), u.uid + ' L' + l + ' prima di L' + (l + 1));
    for (const p of u.prereq) vero(prima(p, 1) <= prima(u.uid, 1), p + ' prima di ' + u.uid);
    vero(prima(u.uid, 1) !== '9999' && prima(u.uid, 4) !== '9999', u.uid + ' con tutti i livelli');
  }
  vero(voci.some(v => v.isRipassoFSRS && /~R1$/.test(v.k)), 'ripassi FSRS'); vero(voci.some(v => v.isBuffer && v.speciale), 'buffer (speciali)');
  for (const v of voci) if (v.ora) vero(minHM(v.ora) + (v.min || 0) <= 21 * 60 + 30, 'oltre le 21:30: ' + v.k + ' ' + v.ora);
  const leggero = voci.filter(v => v.data === '2026-12-07');
  vero(leggero.some(v => /~RIPOSO$/.test(v.k)), 'riposo attivo il giorno prima'); vero(leggero.reduce((s, v) => s + (v.min || 0), 0) <= 60, 'target−1 ≤ 60 min');
  vero(!voci.some(v => v.data >= '2026-12-08'), 'niente dopo la data obiettivo');
  vero(voci.filter(v => v.sorgenteRef).every(v => v.sorgenteRef.fileId === 'f1'), 'sorgenteRef dal fileId');
  vero(/^C~test2~U\d~L[1-4]/.test(voci.find(v => v.livelloCognitivo && !v.isRipassoFSRS).k), 'chiavi stabili');
});

await t('testHookIpercorrezioneZeroToken: ipercorrezioni (neuro + legacy) → +20% e L3 anticipata nel buffer, 0 rete', async () => {
  const s = P.segnaliIper(STAT_ILL, 'C');
  vero(s.attiva && s.illusioni >= 2, 'illusione da statq.neuro + campo legacy ipercorrezioni');
  vero(P.segnaliIper([{ sk: 'C-1', n: 1, ok: 1, confidenceLog: [{ corretto: false, livelloCertezza: 3 }] }], 'C').illusioni === 1, 'confidenceLog certo+sbagliata');
  eq(P.segnaliIper(STAT_ILL, 'B').illusioni, 0, 'altre materie ignorate');
  const base = P.oreNecessarie(UNITA, V()), iper = P.oreNecessarie(UNITA, V(), s);
  vero(Math.abs(iper / base - 1.2) < 0.02, '+20% slot: ' + base + ' → ' + iper);
  const rete0 = chiamateRete;
  const r = await P.creaPiano(V(), { oggi: OGGI, unita: UNITA, pid: 'ai-test3', statq: () => STAT_ILL });
  vero(r.piano && r.piano.iper, 'piano marcato iper'); vero(r.fatt.extraIper, 'fattibilità con extra iper');
  const prima = JSON.stringify(r.piano);
  const h = P.hookIpercorrezione(r.piano, { oggi: OGGI, sk: 'C-3.1.1-1', caso: 'illusione_competenza' });
  vero(h, 'hook applicato'); vero(/~L[34]/.test(h.k), 'attività L3/L4: ' + h.k); vero(h.a < h.da, 'anticipata ' + h.da + ' → ' + h.a);
  vero(tutteVoci(h.piano).some(v => v.k === h.k && v.data === h.a), 'nel giorno del buffer'); eq(JSON.stringify(r.piano), prima, 'piano originale intatto');
  eq(P.hookIpercorrezione(r.piano, { oggi: OGGI, sk: 'C-3.1.1-1', caso: 'padronanza' }), null, 'padronanza: niente');
  eq(P.hookIpercorrezione(r.piano, { oggi: OGGI, sk: 'B-3.1.1-1', caso: 'illusione_competenza' }), null, 'altra materia: niente');
  eq(chiamateRete - rete0, 0, 'rete');
  vero(/PianiAI\.dopoQuiz\(v\.d\.sk, v\.caso\)/.test(leggi('07-quizapp.ts')), 'hook collegato al quiz');
});

await t('testIsolamentoPianiEsistenti: opt-in ai_neuro, altri piani intatti, buffer e FSRS in Ripianifica', async () => {
  const altro = { formato: 'pacchetto-studio', tipo: 'piano', id: 'gen-x', titolo: 'Altro', aggiornato: '2026-11-01', giorniTeoria: 1, giorni: [{ data: '2026-11-20', voci: [{ k: 'C-3.1.1-1', t: 'x' }] }] };
  const copia = JSON.stringify(altro), u0 = JSON.stringify(UNITA);
  eq(P.hookIpercorrezione(altro, { oggi: OGGI, caso: 'illusione_competenza' }), null, 'hook su piano non AI'); eq(P.riassorbi(altro, ['C-3.1.1-1'], OGGI), [], 'riassorbi su piano non AI');
  const pieno = await P.creaPiano(V(), { oggi: OGGI, unita: UNITA, pid: 'ai-test4', minutiAltriPiani: () => 0 });
  const r = await P.creaPiano(V(), { oggi: OGGI, unita: UNITA, pid: 'ai-test5', minutiAltriPiani: d => d === '2026-11-19' ? 9999 : 0 });
  eq(copia, JSON.stringify(altro), 'piano esistente intatto'); eq(u0, JSON.stringify(UNITA), 'unità intatte');
  const p = r.piano; eq([p.formato, p.tipo, p.origine, p.proprio, p.id], ['pacchetto-studio', 'piano', 'ai_neuro', true, 'ai-test5'], 'piano isolato');
  vero(!p.giorni.some(g => g.data === '2026-11-19') && pieno.piano.giorni.some(g => g.data === '2026-11-19'), 'rispetta i minuti degli altri piani');
  vero(/^ai-/.test((await P.creaPiano(V(), { oggi: OGGI, unita: UNITA })).piano.id), 'id ai-…');
  const l1 = tutteVoci(p).find(v => v.livelloCognitivo === 1 && !v.isRipassoFSRS), rip = tutteVoci(p).find(v => v.isRipassoFSRS);
  const ri = P.riassorbi(p, [l1.k, rip.k], OGGI);
  eq(ri.length, 1, 'solo l\'attività, non il ripasso FSRS'); vero(ri[0].k === l1.k && /~BUF~/.test(ri[0].buffer), 'nel buffer');
  vero(!tutteVoci(P.consumaBuffer(p, [ri[0].buffer])).some(v => v.k === ri[0].buffer) && tutteVoci(p).some(v => v.k === ri[0].buffer), 'buffer consumato su copia');
  const rp = leggi('07-ripianifica.ts'), ui = leggi('07-pianiai.ts'), gen = leggi('07-generatore.ts');
  vero(rp.includes('Pianificatore.riassorbi') && rp.includes('Pianificatore.consumaBuffer') && rp.includes('isRipassoFSRS'), 'Ripianifica usa buffer e salta FSRS');
  vero(gen.includes('PianiAI.bottoni(p)') && gen.includes('PianiAI.apri()') && ui.includes('✨ Crea Piano Intelligente'), 'pulsante opt-in (da «＋ Crea piano»)');
  vero(ui.includes("Stato.elimina('pk-' + p.id)") && !/Stato\.elimina\((?!'pk-' \+ p\.id)/.test(ui), 'Elimina tocca solo pk-<id>');
  vero(ui.includes("IA.testo(m as any, 'genera'") && ui.includes('Dominio.senzaAI()'), 'router «genera» e modalità senza AI');
});
await t('testGuardRailBP4: prereq in ciclo sanificati prima di Kahn, data obiettivo ≤ domani → critico senza AI', async () => {
  const ciclo = [
    { uid: 'U1', titolo: 'A', prereq: ['U3'], densita: 3, minutiBase: 60, concettiChiave: [] },
    { uid: 'U2', titolo: 'B', prereq: ['U1', 'U2'], densita: 3, minutiBase: 60, concettiChiave: [] },
    { uid: 'U3', titolo: 'C', prereq: ['U2'], densita: 3, minutiBase: 60, concettiChiave: [] },
  ];
  const c0 = JSON.stringify(ciclo), san = P.sanitizzaPrereq(ciclo);
  eq(c0, JSON.stringify(ciclo), 'input non mutato');
  const pos = new Map(san.map(u => [u.uid, P.ordineTopologico(san).findIndex(x => x.uid === u.uid)]));
  vero(san.every(u => u.prereq.every(p => pos.get(p) < pos.get(u.uid))), 'niente archi all\'indietro: ' + JSON.stringify(san.map(u => u.prereq)));
  const r = await P.creaPiano(V(), { oggi: OGGI, unita: ciclo, pid: 'ai-ciclo' });
  vero(r.piano, 'piano creato'); const voci = tutteVoci(r.piano);
  for (const u of ciclo) vero(voci.some(v => v.uid === u.uid && v.livelloCognitivo === 1 && !v.isRipassoFSRS), u.uid + ' pianificata nonostante il ciclo');
  for (const target of ['2026-11-18', OGGI, '2026-11-20']) {
    let ia = 0;
    const x = await P.creaPiano(V({ dataTarget: target }), { oggi: OGGI, unita: UNITA, ia: async () => { ia++; return '[]'; } });
    eq(x.fatt.stato, 'critico', 'target ' + target); vero(x.piano === null && ia === 0, 'nessun piano, 0 AI');
    const nd = x.fatt.rimedi.find(m => m.tipo === 'sposta_data').nuovaData; vero(nd >= '2026-11-21', 'nuova data futura: ' + nd);
  }
});
// ---------- BP5: 5 livelli, questionario 6+3, guard-rail biologici, Burnout Circuit Breaker ----------
const minDi = (o) => +o.slice(0, 2) * 60 + +o.slice(3, 5);
t('P0.67-D: le sessioni quiz usano 5/6/8 pronte e conservano il microstep', () => {
  const q = (micro, n) => Array.from({ length: n }, (_, i) => ({ id: micro + '-' + (i + 1) }));
  const banche = [{ microstep: '3.3.1', domande: [...q('3.3.1', 7), { id: '3.3.1-1' }] }, { microstep: '3.3.2', domande: q('3.3.2', 4) }];
  eq(P.sessioniQuiz(banche, 1).map(x => [x.microstep, x.richieste, x.disponibili, x.domande.length]),
    [['3.3.1', 5, 7, 5], ['3.3.2', 5, 4, 4]], 'livello leggero');
  eq(P.sessioniQuiz(banche, 2)[0].domande.length, 6, 'livello standard');
  eq(P.sessioniQuiz(banche, 3)[0].domande.length, 7, 'livello intenso limitato alle pronte');
});
t('testHardCapEricssonL5 (v0.60: L5 → L3): 9,5 h → analitico ≤ 270 min, il resto offloading attivo', () => {
  const rete0 = chiamateRete;
  eq(P.MATRICE_LIVELLI.length, 3); vero(P.MATRICE_LIVELLI.every(c => c.capSforzoAnaliticoMin <= 270), 'cap ≤ 270 in matrice');
  eq(P.configLivello(5).livello, 3, 'migrazione 5 → 3'); eq(P.configLivello(4).livello, 3, 'migrazione 4 → 3'); eq(P.configLivello(5).capSforzoAnaliticoMin, 230); eq(P.configLivello(1).ritenzioneTargetFSRS, 0.85);
  for (const cronotipo of ['allodola_mattina', 'intermedio', 'pomeridiano', 'gufo_sera']) for (const autonomiaBRACMin of [35, 55, 80, 100]) {
    const g = P.allocaGiornata(5, { fasciaEta: '20-26', oreSonnoMedie: '7-8', cronotipo, autonomiaBRACMin }, { minuti: 570 });
    const an = g.slot.filter(x => x.analitico).reduce((a, x) => a + x.min, 0);
    vero(an <= 230 && an === g.analiticoMin, cronotipo + '/' + autonomiaBRACMin + ': analitico ' + an);
    vero(g.slot.filter(x => x.analitico).every(x => x.tipo === 'L1_codifica' || x.tipo === 'L3_problemi' || x.tipo === 'L3_faded'), 'solo L1/L3 analitici');
    vero(g.slot.some(x => x.tipo === 'offloading') && g.studioMin - an > 0, 'eccedenza → offloading');
    vero(g.slot.every(x => minDi(x.ora) + x.min <= 21 * 60 + 30), 'mai oltre le 21:30');
    const blocchi = g.slot.filter(x => x.tipo !== 'wakeful_rest');
    vero(blocchi.every(x => x.min <= autonomiaBRACMin), 'blocchi ≤ autonomia BRAC');
    vero(g.slot.some(x => x.tipo === 'wakeful_rest'), 'Wakeful Rest presente');
  }
  eq(chiamateRete - rete0, 0, 'rete');
});
await t('testHardCapEricssonL5 (timeline): piano con livelloIntensita → analitico/giorno ≤ cap, piano BP4 senza livello invariato', async () => {
  const a = await P.creaPiano(V(), { oggi: OGGI, unita: UNITA, pid: 'ai-bp4' });
  vero(a.piano && a.piano.livelloIntensita === undefined && !tutteVoci(a.piano).some(v => v.isOffloading), 'BP4 retrocompatibile');
  const r = await P.creaPiano(V({ livelloIntensita: 1, maxOreGiorno: 2.5 }), { oggi: OGGI, unita: UNITA, pid: 'ai-l1' });
  vero(r.piano, 'piano L1'); eq(r.piano.livelloIntensita, 1);
  for (const g of r.piano.giorni) {
    const an = g.voci.filter(v => (v.livelloCognitivo === 1 || v.livelloCognitivo === 3) && !v.isRipassoFSRS).reduce((s, v) => s + (v.min || 0), 0);
    vero(an <= 90, g.data + ': analitico ' + an + ' > 90');
    for (const v of g.voci) if (v.ora && (v.livelloCognitivo === 1 || v.livelloCognitivo === 3) && !v.isRipassoFSRS) { const m = minDi(v.ora); vero(m + (v.min || 0) <= 780 || m >= 900, g.data + ' ' + v.ora + ' L' + v.livelloCognitivo + ' nel dip'); }
  }
});
t('testAllocazioneCircadianaDip: 13:00–15:00 solo flashcard/cue, mai L1/L3', () => {
  for (const liv of [1, 2, 3, 4, 5]) for (const cronotipo of ['allodola_mattina', 'intermedio', 'pomeridiano', 'gufo_sera']) for (const autonomiaBRACMin of [35, 55, 80, 100]) {
    const g = P.allocaGiornata(liv, { cronotipo, autonomiaBRACMin, oreSonnoMedie: '7-8' }, { inizio: '08:00' });
    for (const x of g.slot) {
      const a = minDi(x.ora), b = a + x.min, nelDip = a < 900 && b > 780;
      if (nelDip && x.tipo !== 'wakeful_rest') vero(x.tipo === 'flashcard_dip' && !x.analitico && /flashcard|Cornell/.test(x.modalita), 'L' + liv + ' ' + cronotipo + ' ' + x.ora + ' ' + x.tipo);
      if (x.analitico) vero(b <= 780 || a >= 900, 'analitico fuori dal dip');
      if (a >= 20 * 60 + 30 && x.tipo !== 'wakeful_rest') eq(x.tipo, 'consolidamento', 'sera solo consolidamento');
    }
    if (liv >= 3) vero(g.slot.some(x => x.tipo === 'flashcard_dip'), 'dip usato con flashcard a L' + liv);
  }
  const sc = P.allocaGiornata(3, { reazioneErrore: 'necessita_scaffolding' }, { giorno: 0 });
  vero(sc.slot.some(x => x.tipo === 'L3_faded') && !sc.slot.some(x => x.tipo === 'L3_problemi'), 'scaffolding: faded nei primi 2 giorni');
  vero(P.allocaGiornata(3, { reazioneErrore: 'necessita_scaffolding' }, { giorno: 2 }).slot.some(x => x.tipo === 'L3_problemi'), 'dal giorno 3 problemi');
});
t('testCapBiologiciEtaESonno: <16 o sonno <6 che chiedono L3 → L2 con avviso; BRAC 35 → 35 + 10', () => {
  const a = P.applicaGuardRailBiologici(5, { fasciaEta: '<16' });
  eq(a.livello, 2); eq(a.richiesto, 3); vero(a.avvisi.some(x => /neurosviluppo/.test(x) && /4\.5h/.test(x)), 'avviso età');
  const b = P.applicaGuardRailBiologici(5, { oreSonnoMedie: '<6' });
  eq(b.livello, 2); vero(b.avvisi.some(x => /6h di sonno/.test(x) && /ippocampale/.test(x)), 'avviso sonno');
  const c = P.applicaGuardRailBiologici(3, { fasciaEta: '<16', oreSonnoMedie: '<6' }); eq(c.livello, 2); eq(c.avvisi.length, 2);
  eq(P.applicaGuardRailBiologici(2, { fasciaEta: '<16', oreSonnoMedie: '<6' }).livello, 2, 'L2 resta L2');
  eq(P.applicaGuardRailBiologici(5, { fasciaEta: '20-26', oreSonnoMedie: '7-8' }).livello, 3, 'adulto riposato: L3 (5 migrato)');
  const d = P.applicaGuardRailBiologici(2, { autonomiaBRACMin: 35 }); eq(d.bloccoMin, 35); eq(d.pausaMin, 10);
  const g = P.allocaGiornata(5, { fasciaEta: '<16', autonomiaBRACMin: 35 });
  eq(g.livello, 2); vero(g.studioMin <= 4.5 * 60, 'ore L2'); vero(g.slot.filter(x => x.tipo === 'wakeful_rest').every(x => x.min === 10), 'pause 10');
  vero(g.slot.filter(x => x.tipo !== 'wakeful_rest').every(x => x.min <= 35), 'micro-blocchi 35');
  eq(P.DOMANDE_UNIVERSALI.length, 6, 'Blocco A: 6 domande');
});
await t('testBurnoutCircuitBreaker48h: errori +30% in 2 giorni → de-load 48 h a 0 token, poi ripristino graduale', async () => {
  const rete0 = chiamateRete; let ia = 0;
  const log = (d, corretto, c = 2) => ({ ts: d + 'T10:00:00.000Z', corretto, livelloCertezza: c, tempoRispostaMs: 4000 });
  const vecchi = [], nuovi = [];
  for (let i = 0; i < 10; i++) vecchi.push(log('2026-11-1' + (i % 5), i >= 2)); // storico 20% errori
  for (let i = 0; i < 10; i++) nuovi.push(log(i < 5 ? '2026-11-17' : OGGI, i >= 5 && i < 10 && i % 2 === 0 ? true : i < 5 ? i >= 3 : false)); // ~50%+ errori
  const stats = [{ sk: 'C-1.1.1-1', n: 20, ok: 12, confidenceLog: vecchi.slice(0, 5).concat(nuovi.slice(0, 5)) }, { sk: 'C-1.1.1-2', n: 10, ok: 6, confidenceLog: vecchi.slice(5).concat(nuovi.slice(5)) }];
  const f = P.monitoraAffaticamento(stats, { oggi: OGGI, materia: 'C' });
  vero(f.condA && f.trigger, 'cond A: ' + JSON.stringify(f)); vero(f.tasso2g >= f.mediaStorica + 0.25, 'tasso +25%');
  vero(!P.monitoraAffaticamento(stats, { oggi: OGGI, materia: 'ZZ' }).trigger, 'altra materia: niente');
  const calmo = [{ sk: 'C-1-1', n: 10, ok: 8, confidenceLog: vecchi.slice(0, 5).concat([log(OGGI, true), log(OGGI, true), log(OGGI, false), log(OGGI, true)]) }];
  vero(!P.monitoraAffaticamento(calmo, { oggi: OGGI }).trigger, 'oscillazione normale: niente de-load');
  const iper = [{ sk: 'C-2-1', n: 6, ok: 3, confidenceLog: [log('2026-11-14', false, 3), log('2026-11-17', false, 3), log(OGGI, false, 3), log(OGGI, true, 3)] }];
  const fb = P.monitoraAffaticamento(iper, { oggi: OGGI }); vero(fb.condB && fb.iper48 === 2 && fb.iperPrima === 0, 'cond B ipercorrezioni ×2: ' + JSON.stringify(fb));
  const neuro = [{ sk: 'C-3-1', n: 4, ok: 2, ultima: OGGI, neuro: { ultimoCaso: 'illusione_competenza' } }, { sk: 'C-3-2', n: 4, ok: 2, ultima: '2026-11-17', neuro: { tag: ['illusione_competenza'] } }];
  vero(P.monitoraAffaticamento(neuro, { oggi: OGGI }).condB, 'cond B da statq.neuro');
  const r = await P.creaPiano(V({ livelloIntensita: 4, maxOreGiorno: 7 }), { oggi: OGGI, unita: UNITA, pid: 'ai-dl', ia: async () => { ia++; return '[]'; } });
  vero(r.piano, 'piano'); const p0 = JSON.stringify(r.piano), chiavi = tutteVoci(r.piano).filter(v => !v.speciale).map(v => v.k).sort();
  const d = P.attivaDeload(r.piano, { oggi: OGGI, motivo: 'test' });
  eq(JSON.stringify(r.piano), p0, 'originale intatto'); vero(d && d.deload.attivo, 'de-load attivo');
  eq(d.deload.fino, '2026-11-20'); eq(d.deload.livelloTarget, 3); eq(d.deload.livelloRidotto, 2); eq(d.livelloIntensita, 2);
  for (const g of d.giorni) if (g.data >= OGGI && g.data < '2026-11-20') {
    vero(!g.voci.some(v => v.livelloCognitivo && !v.isRipassoFSRS && !v.isBuffer), g.data + ': niente capitoli nuovi');
  }
  vero(tutteVoci(d).some(v => v.isDeload), 'voce de-load (FSRS leggero + Wakeful Rest)');
  eq(tutteVoci(d).filter(v => !v.speciale).map(v => v.k).sort().join(), chiavi.join(), 'chiavi invariate, niente perso');
  eq(P.attivaDeload(d, { oggi: OGGI }), null, 'niente doppio de-load');
  eq(P.livelloEffettivo(d, '2026-11-19'), 2); eq(P.livelloEffettivo(d, '2026-11-20'), 3); eq(P.livelloEffettivo(d, '2026-11-21'), 3);
  eq(P.aggiornaDeload(d, '2026-11-19'), null);
  const x = P.aggiornaDeload(d, '2026-11-20'); eq(x.livelloIntensita, 3); vero(x.deload.attivo);
  const y = P.aggiornaDeload(x, '2026-11-21'); eq(y.livelloIntensita, 3); vero(!y.deload.attivo, 'de-load chiuso');
  eq(P.attivaDeload({ ...r.piano, origine: 'manuale' }, { oggi: OGGI }), null, 'solo ai_neuro');
  eq(ia, 0, 'AI'); eq(chiamateRete - rete0, 0, 'rete');
  const ui = leggi('07-pianiai.ts'), qz = leggi('07-quizapp.ts');
  vero(ui.includes('Pianificatore.monitoraAffaticamento') && ui.includes('Pianificatore.attivaDeload') && qz.includes('PianiAI.controllaFatica()'), 'breaker collegato al quiz');
});
await t('testQuestionario6Piu3Fallback: 3 domande AI (≤600 token, max 450) e fallback per archetipo a 0 token', async () => {
  const rete0 = chiamateRete;
  const buono = { domande: [0, 1, 2].map(i => ({ testo: 'Domanda ' + i, opzioni: [{ testo: 'a', delta: { w_faded: 0.9 } }, { testo: 'b', delta: { w_cornell: -0.9 } }, { testo: 'c', delta: { w_gemelle: 0.2, w_x: 3 } }] })) };
  let viste = 0, maxOut = 0, prompt = '';
  const r = await P.generaDomandeCalibrazione({ materia: 'Chimica', archetipo: 'scienze_sperimentali', keyword: P.paroleChiaveBM25('Stechiometria e moli\nEquilibrio chimico acido base\nCinetica chimica velocità\nEquilibrio di solubilità'), errori: ['C-1-1'] },
    async (m, o) => { viste++; maxOut = o.maxOut; prompt = m.map(x => x.content).join(' '); return '```json\n' + JSON.stringify(buono) + '\n```'; });
  eq(r.fonte, 'ai'); eq(viste, 1); eq(r.chiamate, 1); eq(maxOut, 450); vero(r.tokenStimati > 450 && r.tokenStimati <= 600, 'token ' + r.tokenStimati);
  vero(/equilibrio/.test(prompt) && /ESATTAMENTE 3/.test(prompt), 'prompt con keyword BM25');
  eq(r.domande.length, 3); vero(r.domande.every(d => d.opzioni.length === 3), '3×3');
  eq(r.domande[0].opzioni[0].delta.w_faded, 0.35); eq(r.domande[0].opzioni[1].delta.w_cornell, -0.25); eq(r.domande[0].opzioni[2].delta.w_x, undefined);
  for (const [nome, ia] of [['JSON rotto', async () => '{"domande":[{"testo":'], ['2 domande', async () => JSON.stringify({ domande: buono.domande.slice(0, 2) })], ['429 su tutta la catena', async () => { throw new Error('429 quarantena'); }], ['offline', async () => { throw new TypeError('Failed to fetch'); }]]) {
    const t0 = Date.now(), f = await P.generaDomandeCalibrazione({ materia: 'Diritto', archetipo: 'giuridico_economico' }, ia);
    eq(f.fonte, 'default', nome); eq(f.tokenStimati, 0, nome); vero(Date.now() - t0 < 200, nome + ' istantaneo'); vero(/caso pratico/.test(f.domande[0].testo), nome + ': set per archetipo');
  }
  const z = await P.generaDomandeCalibrazione({ materia: 'X', archetipo: 'informatica_coding' });
  eq(z.fonte, 'default'); eq(z.chiamate, 0); eq(z.tokenStimati, 0); eq(chiamateRete - rete0, 0, 'senza API key: 0 rete');
  for (const a of ['stem_calcolo', 'scienze_sperimentali', 'umanistico_storico', 'giuridico_economico', 'lingue_letteratura', 'informatica_coding']) {
    const d = P.domandeCalibrazioneDefault(a); eq(d.length, 3); vero(d.every(q => q.opzioni.length === 3 && q.opzioni.every(o => Object.values(o.delta).every(x => x >= -0.25 && x <= 0.35))), a);
  }
  const w0 = P.pesiIniziali({ canalePreferito: 'scrittura_schemi' }), w = P.applicaRisposte(w0, z.domande, [0, 0, 1]);
  vero(w.w_cornell > w0.w_cornell && w.w_interleave < w0.w_interleave && Object.values(w).every(x => x >= 0.5 && x <= 1.5), 'pesi adattivi ' + JSON.stringify(w));
  const ui = leggi('07-pianiai.ts');
  vero(ui.includes("IA.testo(m as any, 'genera', { maxOut: x.maxOut }") && ui.includes('Pianificatore.generaDomandeCalibrazione') && !/mistral|openrouter/i.test(ui), 'catena «genera», niente Mistral/OpenRouter');
  vero(/MAX_TOKEN_CALIBRAZIONE = 450/.test(leggi('07-pianificatore.ts')) && /BUDGET_CALIBRAZIONE = 600/.test(leggi('07-pianificatore.ts')), 'costanti budget');
});
// ---------- v0.56.2: urgenze pre-BP6 (audit A1–A4, A7, A9, U8) ----------
const tuttiSrc = SRC_TUTTI().map(f => [f, leggi(f)]);
t('U5 pdf.js: un solo getDocument, in 07-testopdf.ts, con isEvalSupported:false (CVE-2024-4367)', () => {
  const chiamate = tuttiSrc.flatMap(([f, s]) => s.split('\n').filter(r => /\.getDocument\(/.test(r)).map(c => [f, c.trim()]));
  eq(chiamate.map(c => c[0]), ['07-testopdf.ts'], 'punti di apertura dei PDF');   // blocco 1: prima ≥ 5, sparsi in 9 file
  for (const [f, c] of chiamate) vero(/isEvalSupported:\s*false/.test(c), f + ': ' + c);
  const testo = tuttiSrc.filter(([, s]) => /getTextContent\(/.test(s)).map(([f]) => f);
  eq(testo, ['07-testopdf.ts'], 'lettura del testo dei PDF solo in TestoPdf');
});
t('U7 service worker: replaceAll del segnaposto, nessun __VERSIONE__ rimasto', () => {
  const b = fs.readFileSync(path.join(RADICE, 'build.mjs'), 'utf8');
  vero(/readFileSync\('public\/sw\.js', 'utf8'\)\.replaceAll\('__VERSIONE__'/.test(b), 'build.mjs usa replaceAll');
  const sw = fs.readFileSync(path.join(RADICE, 'public', 'sw.js'), 'utf8');
  vero((sw.match(/__VERSIONE__/g) || []).length >= 2, 'il sorgente ha più segnaposti (il caso che rompeva replace)');
  const fatto = sw.replaceAll('__VERSIONE__', 'x1');
  vero(!fatto.includes('__VERSIONE__') && fatto.includes("const CACHE = 'imc-x1'"), 'nome cache sostituito');
  const dist = path.join(RADICE, 'dist', 'sw.js');
  if (fs.existsSync(dist)) vero(!fs.readFileSync(dist, 'utf8').includes('__VERSIONE__'), 'dist/sw.js senza __VERSIONE__');
});
t('U6 esc del quiz: niente uscita dagli attributi (abuse case XSS)', () => {
  const riga = leggi('07-quizapp.ts').split('\n').find(r => /^\s*const esc = \(s: any\) =>/.test(r));
  vero(riga, 'esc trovata');
  const esc = vm.runInNewContext('(' + riga.replace(/^\s*const esc = \(s: any\) =>/, '(s) =>').replace(/;\s*(\/\/.*)?$/, '') + ')');
  for (const p of ['" onmouseover="alert(1)', "' onfocus='alert(1)' autofocus x='", '"><img src=x onerror=alert(1)>', '<script>alert(1)</script>']) {
    const e = esc(p); vero(!/["'<>]/.test(e), 'resta un carattere pericoloso in ' + e);
    const html = '<button data-r="' + e + '" title=\'' + e + '\'>' + e + '</button>';
    eq((html.match(/["']/g) || []).length, 4, 'solo le virgolette dei due attributi: ' + html);
  }
  eq(esc('a & b "c" \'d\''), 'a &amp; b &quot;c&quot; &#39;d&#39;');
});
t('IndexedDB: ogni transazione readwrite gestisce onabort (Stato.scritto() mai appeso)', () => {
  const db = leggi('02-db.ts'), tx = (db.match(/transaction\('records', 'readwrite'\)/g) || []).length, ab = (db.match(/tx\.onabort = \(\) => ko\(/g) || []).length;
  vero(tx >= 2, 'transazioni ' + tx); eq(ab, tx, 'onabort per transazione');
});
await t('Contrasto: --accento-testo ≥ 4,5:1 nei due temi, CSS usa il token per il testo', async () => {
  const { createRequire } = await import('node:module');
  const ts = createRequire(import.meta.url)('typescript');
  const m = leggi('09-main.ts'), da = m.indexOf('// ACCENTO-TESTO-INIZIO'), a = m.indexOf('// ACCENTO-TESTO-FINE');
  vero(da >= 0 && a > da, 'marcatori');
  const js = ts.transpileModule(m.slice(da, a), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const f = vm.runInNewContext(js + '\naccentoTesto', { Math });
  const lum = h => { const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const cr = (x, y) => { const p = lum(x), q = lum(y); return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05); };
  vero(cr('#2f6bea', '#151821') < 4.5, 'il caso dell\'audit (3,72) parte sotto soglia');
  for (const acc of ['#2f6bea', '#6c8cff', '#000080', '#ff9500', '#34c759', '#8e8e93', '#ffd60a']) {
    for (const [scuro, fondi] of [[true, ['#0e1014', '#151821', '#171a21', '#20242d']], [false, ['#ffffff', '#f4f5f8', '#eceef3']]]) {
      const c = f(acc, scuro); for (const b of fondi) vero(cr(c, b) >= 4.5, acc + (scuro ? ' scuro' : ' chiaro') + ' → ' + c + ' su ' + b + ' = ' + cr(c, b).toFixed(2));
    }
  }
  eq(f('var(--x)', true), 'var(--x)', 'non esadecimale invariato');
  const css = fs.readFileSync(path.join(RADICE, 'public', 'style.css'), 'utf8');
  vero(!/(^|[;{\s])color: var\(--accento\)/m.test(css), 'nessun testo con var(--accento) diretto');
  vero(/--accento-testo: var\(--accento\)/.test(css) && /\.btn-testo \{ color: var\(--accento-testo\)/.test(css), 'token in :root e .btn-testo');
});
t('U8 vista Piano raggiungibile senza PkPiano, con i due pulsanti del generatore', () => {
  const s = leggi('07-studio.ts'), g = leggi('07-generatore.ts'), pa = leggi('07-pianiai.ts');
  const vuota = s.indexOf("if (UI.studioVista === 'piano') return h('div.pagina.piano-vuoto'"), redir = s.indexOf("if (UI.studioVista !== 'schede') UI.studioVista = 'schede';");
  vero(vuota > 0 && vuota < redir, 'stato vuoto prima del rimando a Schede');
  vero(/piano-vuoto'[\s\S]{0,300}bottoniGeneratore\(\)/.test(s), 'bottoniGeneratore() nello stato vuoto');
  vero(g.includes("'＋ Crea piano'") && g.includes('PianiAI.bottoni(p)'), 'Crea piano + PianiAI.bottoni');
  // v0.57 (BP6 · T7-3): un solo ingresso con le tre modalità, niente pulsanti di creazione duplicati
  vero(/function scegliPiano[\s\S]{0,900}apriGeneratore\(\)[\s\S]{0,80}PianiAI\.apri\(\)[\s\S]{0,80}Dominio\.wizardPiano\(\)/.test(g), 'scegliPiano offre generatore, intelligente e libro');
  vero(!pa.includes("onclick: () => apri() }, '✨ Crea Piano Intelligente'") && !leggi('07-dominio.ts').includes("'🗓 Crea piano dal libro'),"), 'nessun ingresso duplicato');
  vero(pa.includes('Crea Piano Intelligente'), '«✨ Crea Piano Intelligente»');
});
console.log('\n== BP6 · A15/A16 parser JSON unico e ritenzione unica ==');
const J = sandbox.JsonAI;
t('A15 JsonAI.leggi: recinto ```json, virgole finali, LaTeX', () => {
  eq(JSON.stringify(J.leggi('Ecco:\n```json\n{"a": [1, 2,], "f": "\\\\frac{1}{2}",}\n```')), '{"a":[1,2],"f":"\\\\frac{1}{2}"}');
  vero(J.leggi('nessun json') === null || J.leggi('nessun json') === undefined, 'testo libero → nessun dato inventato');
});
t('A15 JsonAI.leggiFile (.imcpack) tollera BOM e rifiuta il non-JSON', () => {
  eq(J.leggiFile('﻿{"v": 1}').v, 1);
  let rotto = false; try { const r = J.leggiFile('<html>'); rotto = r == null; } catch (_) { rotto = true; } vero(rotto, 'file non JSON segnalato');
});
t('A15 recuperaArrayParziale: risposta AI troncata → elementi completi', () => {
  const r = J.recuperaArrayParziale('{"unita": [{"t": "a"}, {"t": "b"}, {"t": "c', 'unita'); eq(r.map(x => x.t).join(','), 'a,b');
  eq(P.recuperaArrayParziale, J.recuperaArrayParziale, 'il pianificatore usa lo stesso parser');
});
t('A16 intervalliFsrs: ritenzione 0,9 invariata, più alta → intervalli più brevi', () => {
  const iv = (s, r) => s * 9 * (1 / r - 1);   // stessa forma di Ripassi.intervallo
  eq(JSON.stringify(P.intervalliFsrs(2.5, 0.9, iv)), JSON.stringify(P.intervalliFsrs(2.5)), '0,9 = curva base');
  const a = P.intervalliFsrs(2.5, 0.9, iv), b = P.intervalliFsrs(2.5, 0.97, iv);
  vero(b.reduce((x, y) => x + y) < a.reduce((x, y) => x + y), a + ' vs ' + b);
  vero(b.every((x, i) => i === 0 || x > b[i - 1]), 'intervalli strettamente crescenti');
});
t('U3 VERSIONE con patch (A8)', () => vero(/const VERSIONE = '\d+\.\d+\.\d+';/.test(leggi('09-main.ts')), 'VERSIONE x.y.z'));

console.log('\n== v0.58 «Cosa faccio adesso» ==');
t('v0.58 Q4: segnaliIper usa materiaQ (quiz creati in app «qc-…» contano per la loro materia)', () => {
  const st = [{ sk: 'qc-abc', id: 'sq-1', materiaQ: 'C', n: 1, neuro: { tag: ['illusione_competenza'] } }];
  vero(P.segnaliIper(st, 'C').illusioni === 1, 'qc con materiaQ conta per C');
  eq(P.segnaliIper(st, 'B').illusioni, 0, 'non per altre materie');
  eq(P.materiaSk({ sk: 'qc-abc' }), 'qc', 'senza materiaQ: prefisso');
  eq(P.materiaSk({ sk: 'C-3.1-1' }), 'C', 'scheda classica');
});
await t('v0.58 Q2: QuizRifare.dovute — l\'illusione di oggi torna oggi, in testa', async () => {
  const d = path.join(TMP, 'qr'); fs.mkdirSync(d);
  fs.copyFileSync(path.join(SRC, '07-quizrifare.ts'), path.join(d, 'qr.ts'));
  try { execFileSync(process.execPath, [path.join(RADICE, 'node_modules', 'typescript', 'bin', 'tsc'), '--target', 'es2020', '--noEmitOnError', 'false', '--outDir', 'out', 'qr.ts'], { cwd: d, stdio: 'pipe' }); }
  catch (_) { /* tipi globali dell'app assenti: emette comunque */ }
  const recs = [
    { id: 'sq-1', sk: 'C-1-1', neuro: { due: '2026-11-17', tag: [] } },
    { id: 'sq-2', sk: 'C-1-1', neuro: { due: OGGI, tag: ['illusione_competenza'] } },
    { id: 'sq-3', sk: 'C-1-1', neuro: { due: '2026-11-25', tag: [] } },
    { id: 'sq-4', sk: 'X-9-9', neuro: { due: '2026-11-01', tag: [] } },
    { id: 'sq-5', sk: 'C-1-1', deleted: true, neuro: { due: '2026-11-01', tag: [] } },
  ];
  const sb = { console, Stato: { tutti: () => recs, prendi: () => null }, Dominio: { domandeDi: () => null }, trovaScheda: sk => sk === 'C-1-1' ? { pk: {}, m: 'C' } : null, ymd: () => OGGI };
  vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(d, 'out', 'qr.js'), 'utf8') + '\n;this.QuizRifare = QuizRifare;', sb);
  const ids = sb.QuizRifare.dovute(OGGI).map(s => s.id);
  eq(ids, ['sq-2', 'sq-1'], 'illusione prima, futuro/irrisolvibile/eliminato esclusi');
  eq(sb.QuizRifare.minuti(25), 10, 'massimo 10 minuti');
});
t('v0.58: guardie statiche (Adesso, scorciatoie PWA, quiz da appunto, pulsante Studio, wizard corto)', () => {
  vero(/case 'studiaora': return widgetStudiaOra\(\)/.test(leggi('08-viste.ts')), 'Adesso sempre in Oggi');
  const so = leggi('07-studiaora.ts');
  vero(/section\.card\.adesso/.test(so) && /QuizRifare\.conta/.test(so) && /tipo === 'quiz'/.test(so), 'card Adesso + voce quiz');
  const man = JSON.parse(fs.readFileSync(path.join(RADICE, 'public', 'manifest.webmanifest'), 'utf8'));
  eq((man.shortcuts || []).map(s => s.url), ['./?az=studia', './?az=aggiungi', './?az=ripassa'], 'shortcuts');
  vero(/function scorciatoiaAvvio/.test(leggi('09-main.ts')), 'gestione ?az=');
  vero(/'🎯 Quiz da questo appunto'/.test(leggi('07-appunti.ts')) && /appunto\?: string/.test(leggi('07-creaquiz.ts')), 'quiz da appunto');
  vero(/button\.cq-studio/.test(leggi('07-studio.ts')), 'pulsante Quiz in Studio');
  vero(/details\.pai-avanzate/.test(leggi('07-pianiai.ts')), 'wizard: Avanzate chiuso');
  vero(/hookIpercorrezione\(p, \{ oggi, sk, caso, materia: materiaDiSk\(sk\) \}\)/.test(leggi('07-pianiai.ts')), 'Q4 hook con materia');
});

await t('v0.58.2: ImportaDrive — traduci (schema 2 e 0.58) + riconosci (dove va) + innesti', async () => {
  const { createRequire } = await import('node:module');
  const ts = createRequire(import.meta.url)('typescript');
  const js = ['01-json.ts', '07-sezionispiegazione.ts', '07-importadrive-parti.ts', '07-importadrive.ts', 'su-richiesta/07-contratto.ts', 'su-richiesta/07-diagnosiquiz.ts', 'su-richiesta/07-validatore.ts'].map(f => ts.transpileModule(leggi(f), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText).join('\n');
  const ymdF = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const materiaDi = k => { const m = /^([A-Z]+)/.exec(k || ''); return m ? m[1] : ''; };
  const sb = { console, ymd: ymdF, oggi: () => new Date(), materiaDi };
  vm.createContext(sb); vm.runInContext(js + '\n;this.ImportaDrive = ImportaDrive;', sb);
  const ID = sb.ImportaDrive;
  globalThis.__ID_SANDBOX = sb;   // riusato dal test v0.58.3
  // --- schema 2 ---
  const q = (n, es) => ({ id: 'biologia-3.3-0' + n, livelloCognitivo: n, tipoItem: 'scelta_multipla', domanda: 'D' + n + '?', opzioni: ['a' + n, 'b' + n, 'c' + n, 'd' + n], esatta: es, spiegazione: 'perché ' + n, fonte: 'Campbell p.' + n });
  const j = { meta: { schemaVersion: 2, materia: 'Biologia', codiceMateria: 'B', unitaDidattica: 'UD3', sottoStep: '3.3', titolo: 'Membrane' },
    programmaCalendario: { formatoGeneraMjs: ['B|UD3|Membrane|N|3.3|Mer 18/11'], pianoStrutturato: { durataTotaleMin: 90,
      sottoSchede: [{ codice: '3.3.1', titolo: 'Fosfolipidi', schedePrioritarie: ['biologia-3.3-01', 'biologia-3.3-02'], schedeRaffinamento: ['biologia-3.3-03'] }],
      ancoraggiRipassoFSRS: [{ intervallo: '+1g', target: [] }, { intervallo: '+7g', target: [] }] } },
    quiz: [q(1, 2), q(2, 0), q(3, 1), q(4, 3), { id: 'rotta', domanda: 'x', opzioni: ['a'], esatta: 0 }] };
  const t1 = ID.traduci(j, '2026-11-19');
  eq([t1.k, t1.cod, t1.sotto, t1.ud, t1.min, t1.dataPacchetto], ['B3.3', 'B', '3.3', 'UD3', 90, '2026-11-18'], 'chiave, UD, durata, data del pacchetto');
  vero(t1.sub.innesto && t1.sub.k === 'B3.3', 'sotto-step marcato innesto');
  eq(t1.sub.microstep[0].schede.map(s => s.id + s.tipo), ['B-3.3.1-1P', 'B-3.3.1-2R'], 'schede P/R con id <materia>-<microstep>-<k>');
  const p = t1.banche.find(b => b.sk === 'B-3.3.1-1');
  eq(p.domande.map(d => d.q), ['D1?', 'D2?', 'D4?'], 'prioritarie + non assegnate nella P');
  const d1 = p.domande[0];
  eq([d1.o[0], d1.e, d1.r, d1.bloomLevel, d1.t, d1.stepId], ['c1', 'perché 1', 'Campbell p.1', 1, 'mcq', 'B3.3'], 'esatta → o[0], spiegazione → e, fonte → r');
  eq(d1.o.slice().sort(), ['a1', 'b1', 'c1', 'd1'], 'nessuna opzione persa');
  eq(t1.domande, 4, '4 domande valide'); eq(t1.scartate, 1, '1 scartata');
  eq(t1.ripassi.map(r => r.giorni), [1, 7], 'ripassi FSRS del pacchetto');
  eq(JSON.stringify(ID.traduci(j, '2026-11-19').banche), JSON.stringify(t1.banche), 'reimportare = stesso risultato');
  let err = ''; try { ID.traduci({ meta: { sottoStep: '3.3' }, quiz: [] }); } catch (e) { err = e.message; } vero(/quiz/.test(err), 'senza quiz: errore chiaro');
  err = ''; try { ID.traduci({ meta: {}, quiz: [q(1, 0)] }); } catch (e) { err = e.message; } vero(/sotto-step/.test(err), 'senza sotto-step: errore chiaro');
  // --- schema 0.58 (sottoSchede in cima, rangeId, categoria, livello «L2») ---
  const qv = (n, sotto, cat) => ({ id: 'biologia-4.1-' + String(n).padStart(2, '0'), stepId: 'biologia-4.1', sottoStep: sotto, categoria: cat, livelloCognitivo: 'L' + (1 + n % 4), domanda: 'V' + n + '?', opzioni: ['a', 'b', 'c', 'd'], esatta: n % 4, spiegazione: 's', fonte: 'f' });
  const v = { meta: { versioneSchema: '0.58', materia: 'B', unita: 'UD4', stepId: 'biologia-4.1', titolo: 'Genetica' },
    programmaCalendario: { formatoGeneraMjs: ['B|UD4|Genetica|N|4.1|Sab 21/11'] },
    sottoSchede: [{ sottoStep: '4.1.1', titolo: 'Mendel', durataBracMin: 40, rangeId: ['biologia-4.1-01', 'biologia-4.1-02', 'biologia-4.1-03'] },
      { sottoStep: '4.1.2', titolo: 'Eccezioni', durataBracMin: 35, rangeId: ['biologia-4.1-04', 'biologia-4.1-05'] }],
    quiz: [qv(1, '4.1.1', 'prioritaria'), qv(2, '4.1.1', 'prioritaria'), qv(3, '4.1.2', 'raffinamento'), qv(4, '4.1.2', 'prioritaria'), qv(5, '4.1.2', 'raffinamento'), qv(6, '4.1.2', 'prioritaria')] };
  const t2 = ID.traduci(v, '2026-11-19');
  eq([t2.k, t2.ud, t2.min, t2.dataPacchetto, t2.domande], ['B4.1', 'UD4', 75, '2026-11-21', 6], 'v0.58: chiave da stepId, UD, durata, data');
  eq(t2.banche.map(b => b.sk + ':' + b.domande.length), ['B-4.1.1-1:2', 'B-4.1.1-2:1', 'B-4.1.2-1:2', 'B-4.1.2-2:1'], 'rangeId vince su sottoStep; categoria → P/R');
  eq(t2.banche[0].domande[1].bloomLevel, 3, '«L3» → bloomLevel 3');
  vero(ID.eNomeQuiz('biologia_4_1_quiz_e_calendario_v058.json') && ID.eNomeQuiz('biologia_3_4_quiz_e_calendario.json') && !ID.eNomeQuiz('note.json'), 'riconosce il nome (anche _v058)');
  // --- riconosci: dove va ---
  const sch = (m, n) => ({ n: m + '.1', schede: [{ id: 'B-' + m + '.1-1', k: 1, n: 1, titolo: n, tipo: 'P', problemi: false, pagine: '', quizFile: '' }] });
  const corso = (id, step, subs) => ({ tipo: 'step', id, step, titolo: 'Step ' + step, aggiornato: '', risorse: { libri: {}, quiz: {} }, materie: [{ m: 'B', nome: 'Biologia', libro: '', sottostep: subs.map(n => ({ k: 'B' + n, n, titolo: n, posizione: '', microstep: [sch(n, n)] })) }, { m: 'F', nome: 'Fisica', libro: '', sottostep: [] }] });
  const corsi = [corso('step-1', 1, ['1.1']), corso('step-2', 2, ['2.1']), corso('step-3', 3, ['3.1', '3.2'])];
  const piano = { tipo: 'piano', id: 'piano', titolo: 'Piano', aggiornato: '', giorniTeoria: 0, giorni: [
    { data: '2026-11-16', voci: [{ k: 'B3.2', t: '' }] }, { data: '2026-11-18', voci: [{ k: 'B3.3', t: '' }, { k: 'SIM3', t: '', speciale: true }] }, { data: '2026-11-21', voci: [{ k: 'B4.1', t: '' }] }] };
  const raff = { tipo: 'piano', id: 'raff', modo: 'raffinamento', titolo: 'Raff', aggiornato: '', giorniTeoria: 0, giorni: [{ data: '2026-12-11', voci: [{ k: 'B3.3', t: '' }] }] };
  const r1 = ID.riconosci(t1, corsi, [piano, raff], '2026-11-19');
  eq([r1.corsi[0].id, r1.corsi[0].punti], ['step-3', 90], 'B3.3 → step-3 (stessa UD, dopo B3.2)');
  vero(/dopo B3\.2/.test(r1.corsi[0].motivo), 'il motivo dice «dopo B3.2»: ' + r1.corsi[0].motivo);
  eq([r1.piani[0].id, r1.piani[0].data], ['piano', '2026-11-19'], 'piano che lo prevedeva il 18/11 (in ritardo) → oggi');
  vero(/ritardo/.test(r1.piani[0].motivo), 'motivo: in ritardo');
  vero(r1.piani.find(x => x.id === 'raff').punti < r1.piani[0].punti && r1.piani.some(x => x.id === ''), 'raffinamento sotto, piano «a parte» disponibile');
  const r2 = ID.riconosci(t2, corsi, [piano], '2026-11-19');
  eq([r2.corsi[0].id, r2.corsi[0].punti], ['', 70], 'B4.1 senza corso UD4 → corso «Step 4 · da Drive»');
  eq([r2.piani[0].id, r2.piani[0].data, r2.piani[0].punti], ['piano', '2026-11-21', 100], 'B4.1 già previsto il 21/11 → resta il 21/11');
  const t3 = Object.assign({}, t2, { k: 'B4.2', sotto: '4.2', dataPacchetto: '2026-11-23' });
  const r3 = ID.riconosci(t3, corsi, [piano], '2026-11-19');
  eq([r3.piani[0].id, r3.piani[0].data, r3.piani[0].punti], ['piano', '2026-11-23', 80], 'B4.2 non previsto: dopo B4.1, nel giorno del pacchetto');
  const corsoDrv = { tipo: 'step', id: 'drv-ud-4', step: 4, titolo: 'Step 4 (UD4) · da Drive', aggiornato: '', proprio: true, risorse: { libri: {}, quiz: {} }, materie: [{ m: 'B', nome: 'Biologia', libro: '', sottostep: [{ k: 'B4.1', n: '4.1', titolo: '', posizione: '', microstep: [], innesto: true }] }] };
  const r4 = ID.riconosci(t3, [...corsi, corsoDrv], [piano], '2026-11-19');
  vero(r4.corsi[0].id === '' && r4.corsi.filter(x => x.id === '' || x.id === 'drv-ud-4').length === 1 && /Step 4 \(UD4\)/.test(r4.corsi[0].titolo), 'B4.2 va con B4.1 nel corso UD4 da Drive (un\'opzione sola)');
  eq(ID.cmpNum('3.10', '3.9') > 0 && ID.cmpNum('4.1', '3.10') > 0, true, 'ordine numerico dei sotto-step');
  vero(/ImportaDrive\.applicaCorsi\(/.test(leggi('07-studio.ts')) && /ImportaDrive\.applicaPiani\(/.test(leggi('07-studio.ts')), 'Studio applica gli innesti in lettura');
  vero(/!x\.innesto/.test(leggi('07-extra.ts')), 'salvaPacchetto non salva gli innesti nel corso');
  vero(/'📥 Importa quiz da Drive'/.test(leggi('07-studio.ts')) && /ImportaDrive\.gestisci\(\)/.test(leggi('07-studio.ts')), 'pulsante in Studio + «Sposta quiz importati»');
});

await t('v0.58.3: quiz a PARTI — classifica, raggruppa, unisci (ordine qualsiasi), formato ampliato, validatore', async () => {
  const sb = globalThis.__ID_SANDBOX; vero(!!sb, 'sandbox ImportaDrive'); if (!sb) return;
  vm.runInContext(';this.ImportaParti = ImportaParti;', sb);
  const ID = sb.ImportaDrive, IP = sb.ImportaParti;
  const pad = n => String(n).padStart(2, '0');
  // Step sintetico come il master prompt: 6 schede da 18, livelli 25/35/25/15, esatta ruotata, gemelle, corretta non la più lunga.
  const LIV = [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 2];   // 5/8/4/3 ≈ 22/39/22/17 → per 6 schede resta in ±3? controllato sotto con soglie
  const domanda = (s, i, o = {}) => ({ id: 'biologia-3.3-S' + pad(s) + '-' + pad(i), stepId: 'biologia-3.3', sottoStep: s <= 3 ? '3.3.1' : '3.3.2', scheda: 'biologia-3.3-S' + pad(s), categoria: s % 3 === 0 ? 'raffinamento' : 'prioritaria',
    livello: 'L' + LIV[i - 1], livelloCognitivo: LIV[i - 1], domanda: 'S' + s + ' D' + i + '?', opzioni: ['opzione lunga A' + i, 'B' + i, 'opzione lunga C' + i, 'opz D' + i].map((x, j) => j === (i + s) % 4 ? 'giusta ' + i : x), esatta: (i + s) % 4,
    spiegazione: 'perché', spiegazioneDistrattori: ['no 1', 'no 2', 'no 3'], distractorTypes: ['misconception', 'caso limite', 'inventato'], sourceRef: 'Campbell, cap. 7, p. 140', fonte: 'Campbell cap. 7 p. 140', erroreTipico: 'confonde',
    coppiaGemellaId: i <= 2 && s % 3 === 1 ? 'g' + s : undefined, campoIgnoto: 42, ...o });
  const parte = (a, b, extra = []) => ({ parte: 'biologia-3.3-s' + a + '-' + b, quiz: [...[a, b].flatMap(s => Array.from({ length: 18 }, (_, i) => domanda(s, i + 1))), ...extra] });
  const chiusura = { meta: { stepId: 'biologia-3.3', materia: 'biologia', unita: 'UD3', titolo: 'Membrane', domandeTotali: 108, ripartizioneSchede: { totale: 6 } },
    programmaCalendario: { pianoStrutturato: { durataTotaleMin: 95, sottoSchede: [{ codice: '3.3.1', titolo: 'Fosfolipidi', durataBracMin: 45, schedePrioritarie: ['biologia-3.3-S01', 'biologia-3.3-S02'], schedeRaffinamento: ['biologia-3.3-S03'] },
      { codice: '3.3.2', titolo: 'Trasporto', durataBracMin: 50, schedePrioritarie: ['biologia-3.3-S04', 'biologia-3.3-S05'], schedeRaffinamento: ['biologia-3.3-S06'] }],
      ancoraggiRipassoFSRS: [{ intervallo: '+1g', target: ['biologia-3.3-S01', 'biologia-3.3-S02'] }, { intervallo: '+3g', target: ['biologia-3.3-S03'] }, { intervallo: '+7g', target: [] }] } }, conteggi: { domande: 108 } };
  eq([IP.classifica(parte(1, 2)), IP.classifica(chiusura), IP.classifica({ meta: { sottoStep: '3.3' }, quiz: [] }), IP.classifica({ a: 1 }), IP.classifica(null)], ['parte', 'chiusura', 'intero', 'ignoto', 'ignoto'], 'riconosce dal contenuto');
  eq([IP.stepDi(parte(1, 2)), IP.stepDi(chiusura), IP.numScheda('biologia-3.3-S05'), IP.numScheda('S7'), IP.numScheda('biologia-3.3-01'), IP.numScheda('fisica-1.1-02')], ['biologia-3.3', 'biologia-3.3', 5, 7, 0, 0], 'stepId e numero di scheda');
  const file = (id, json, mod) => ({ id, name: id + '.json', cartella: 'biologia quiz', modificato: mod, tipo: IP.classifica(json), step: IP.stepDi(json), json });
  const P1 = file('p1', parte(1, 2), '2026-11-19T08:00:00Z'), P2 = file('p2', parte(3, 4), '2026-11-19T09:00:00Z'), P3 = file('p3', parte(5, 6), '2026-11-19T10:00:00Z'), C = file('chiusura', chiusura, '2026-11-19T11:00:00Z');
  // stato dell'elenco
  const g12 = IP.raggruppa([P1, P2]); eq([g12.length, g12[0].tipo, g12[0].stato, g12[0].domande, g12[0].parti.length], [1, 'parti', 'senza-chiusura', 72, 2], 'senza chiusura: una voce, «manca il file di chiusura»');
  const g12c = IP.raggruppa([P1, C, P2])[0]; eq([g12c.stato, g12c.mancanti, g12c.partiAttese, g12c.totaleSchede], ['mancano', [5, 6], 3, 6], 'con chiusura: mancano S05, S06 (2/3 parti)');
  const gTutto = IP.raggruppa([P3, C, P1, P2])[0]; eq([gTutto.stato, gTutto.domande, gTutto.domandeAttese], ['completo', 108, 108], 'tutte le parti: completo');
  // ordine qualsiasi = stesso risultato
  const tr = l => ID.preparaGruppo(IP.raggruppa(l)[0], '2026-11-19').t;
  const a = tr([P1, P2, P3, C]), b = tr([C, P3, P1, P2]);
  eq(JSON.stringify(a), JSON.stringify(b), 'parti in ordine o sparse: stessa traduzione');
  eq(a.sub.microstep.map(m => m.n + ':' + m.schede.map(s => s.id + s.tipo).join(',')), ['3.3.1:B-3.3.1-1P,B-3.3.1-2P,B-3.3.1-3R', '3.3.2:B-3.3.2-4P,B-3.3.2-5P,B-3.3.2-6R'], 'una scheda Gemini = una scheda app, P/R dagli elenchi della chiusura');
  eq([a.domande, a.scartate, a.min, a.sub.microstep[0].schede[0].n, a.ripassi.map(r => r.giorni + ':' + (r.target || []).join('|')).join(' ')], [108, 0, 95, 6, '1:B-3.3.1-1|B-3.3.1-2 3:B-3.3.1-3 7:'], 'conteggi, durata, ripassi con target = id scheda app');
  const senza = tr([P2, P1]);
  eq([senza.ripassi.length, senza.sub.microstep.map(m => m.n).join(','), senza.domande], [0, '3.3.1,3.3.2', 72], 'senza chiusura: microstep da sottoStep, nessun ripasso');
  eq(senza.sub.microstep[1].schede.map(s => s.id + s.tipo), ['B-3.3.2-4P'], 'senza chiusura: P/R dalla categoria, stessi id');
  // campi neuro
  const d = a.banche[0].domande[0];
  eq([d.o.length, d.o[0], d.bloomLevel, d.subtopic, d.spiegazione, JSON.stringify(d.spiegazioneDistrattori), JSON.stringify(d.distractorTypes), d.sourceRef.capitolo, d.sourceRef.pagina, 'campoIgnoto' in d],
    [4, 'giusta 1', 1, '3.3.1', 'perché', '{"1":"no 1","2":"no 2","3":"no 3"}', '{"1":"misconception","2":"caso_limite"}', '7', '140', false], 'formato ampliato → campi neuro (chiavi ignote saltate)');
  for (const [lv, atteso] of [['L3', 3], [3, 3], ['3', 3], ['L9', undefined]]) eq(ID.traduci({ meta: { stepId: 'biologia-3.3' }, quiz: [domanda(1, 1, { livello: undefined, livelloCognitivo: lv })] }, '2026-11-19').banche[0].domande[0].bloomLevel, atteso, 'livelloCognitivo ' + JSON.stringify(lv));
  // duplicati: tra parti vince la più recente; nella stessa parte è bloccante
  const P1b = file('p1b', { parte: 'biologia-3.3-s1-2', quiz: [domanda(1, 1, { domanda: 'NUOVA' })] }, '2026-11-19T12:00:00Z');
  const gd = IP.raggruppa([P1, P1b, P2, P3, C])[0], ud = IP.unisci(gd);
  eq([ud.pacchetto.quiz.length, ud.pacchetto.quiz.find(q => q.id === 'biologia-3.3-S01-01').domanda, ud.duplicati.length], [108, 'NUOVA', 1], 'id ripetuto tra parti: vince il file più recente (segnalato)');
  const dup = file('pd', parte(5, 6, [domanda(5, 1), { id: 'x', domanda: 'tre', opzioni: ['a', 'b', 'c'], esatta: 0 }, { id: 'y', domanda: 'fuori', opzioni: ['a', 'b', 'c', 'd'], esatta: 4 }]), '2026-11-19T10:00:00Z');
  const ub = IP.unisci(IP.raggruppa([P1, P2, dup, C])[0]);
  eq([ub.pacchetto.quiz.length, ub.bloccanti.length], [108, 3], 'bloccanti (id doppio nella parte, 3 opzioni, esatta 4): saltata solo la domanda');
  const rotto = { id: 'r', name: 'rotto.json', cartella: 'biologia quiz', modificato: '', tipo: 'parte', step: 'biologia-3.3', json: null, errore: 'JSON non valido' };
  const ur = IP.unisci(IP.raggruppa([P1, rotto, C])[0]); vero(ur.pacchetto.quiz.length === 36 && ur.bloccanti.some(x => /rotto\.json.*saltata/.test(x)), 'JSON non valido: salta solo quella parte');
  // validatore
  const rOk = ID.preparaGruppo(gTutto, '2026-11-19').rapporto;
  eq(rOk.bloccanti, [], 'step pulito: nessun bloccante');
  vero(!rOk.avvisi.some(x => /lunga|sbilanciata|erroreTipico|spiegazioneDistrattori|gemelle/.test(x)), 'step pulito: niente avvisi su lunghezza/posizione/campi: ' + rOk.avvisi.join(' | '));
  const tutteZero = { quiz: Array.from({ length: 36 }, (_, i) => domanda(1 + (i >= 18), 1 + i % 18, { esatta: 0, opzioni: ['la corretta molto molto lunga', 'b', 'c', 'd'], fonte: 'p. da verificare', erroreTipico: '' })) };
  const rv = IP.valida(tutteZero);
  vero(rv.avvisi.some(x => /sbilanciata/.test(x)), 'esatta sempre 0 → avviso');
  vero(rv.avvisi.some(x => /più lunga nel 100%/.test(x)), 'corretta sempre la più lunga → avviso');
  vero(rv.avvisi.some(x => /da verificare/.test(x)) && rv.avvisi.some(x => /erroreTipico/.test(x)), 'fonti da verificare / erroreTipico vuoto → avviso');
  vero(rv.bloccanti.length === 0, 'gli avvisi non bloccano');
  vero(IP.bloccantiDomanda({ domanda: 'x', opzioni: ['a', 'b', 'c'], esatta: 0 }).some(x => /3 opzioni/.test(x)), 'opzioni ≠ 4 → bloccante');
  vero(ID.traduci({ meta: { stepId: 'biologia-3.3' }, quiz: [domanda(1, 1), { ...domanda(1, 2), opzioni: ['a', 'b', 'c'] }] }, '2026-11-19').scartate === 1, 'traduci: 3 opzioni scartata');
  // file reali (facoltativi): test/fixtures/*.json
  const FIX = path.join(path.dirname(SRC), 'test', 'fixtures');
  const reali = fs.existsSync(FIX) ? fs.readdirSync(FIX).filter(x => /quiz_e_calendario.*\.json$/i.test(x)) : [];
  for (const f of reali) {
    const j = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')), tr2 = ID.traduci(j, '2026-11-19');
    vero(tr2.domande > 0 && /^B\d/.test(tr2.k), 'reale ' + f + ': ' + tr2.k + ' · ' + tr2.domande + ' domande, ' + tr2.scartate + ' scartate');
  }
  if (!reali.length) console.log('    (nessun file reale in test/fixtures: saltati)');
});

await t('v0.59.2: DiagnosiQuiz — lettura chat, controlli, auto-fix, patch, prompt di correzione, piano', async () => {
  const { createRequire } = await import('node:module');
  const ts = createRequire(import.meta.url)('typescript');
  const js = ['01-json.ts', '07-sezionispiegazione.ts', '07-importadrive-parti.ts', 'su-richiesta/07-contratto.ts', 'su-richiesta/07-diagnosiquiz.ts', 'su-richiesta/07-mappapagine.ts', 'su-richiesta/07-masterprompt.ts', 'su-richiesta/07-validatore.ts'].map(f => ts.transpileModule(leggi(f), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText).join('\n');
  const sb = { console }; vm.createContext(sb);
  vm.runInContext(js + '\n;this.DiagnosiQuiz = DiagnosiQuiz; this.MasterPrompt = MasterPrompt;', sb);
  const DQ = sb.DiagnosiQuiz; globalThis.__DQ_SANDBOX = sb;
  const SP = (l) => 'COSA CHIEDE: il meccanismo della pompa. CONCETTO E MECCANISMO: ' + 'la pompa sodio-potassio scambia 3 Na+ contro 2 K+ consumando ATP. '.repeat(8) + 'RISPOSTA ESATTA: ' + l + ') «x». PERCHÉ GLI ALTRI NO: A) no B) no. IN SINTESI: gradiente. [[Manuale, p. 120]]';
  const q = (n, es, lv) => ({ id: 'biologia-3.3-' + String(n).padStart(3, '0'), stepId: 'biologia-3.3', sottoStep: '3.3.1', scheda: 'biologia-3.3-S01', categoria: 'prioritaria',
    livelloCognitivo: lv, livello: 'L' + lv, tipoItem: 'richiamo', coppiaGemellaId: null, erroreTipico: 'confondere', domanda: 'Domanda numero ' + n + ' sulla pompa?',
    opzioni: [0, 1, 2, 3].map(i => i === es ? 'corta ' + n : 'distrattore molto più lungo e plausibile numero ' + i + ' / ' + n), esatta: es, spiegazione: SP('ABCD'[es]),
    spiegazioneDistrattori: [1, 2, 3].map(k => 'Confutazione ' + k + ' della domanda ' + n + ': il distrattore confonde i due ioni.'), distractorTypes: ['a', 'b', 'c'], fonte: '[[Manuale, p. 120]]', sourceRef: '[[Manuale, p. 120]]' });
  const LV = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4], ES = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1];
  const buone = LV.map((lv, i) => q(i + 1, ES[i], lv));
  // lettura: chat con testo + due blocchi ```json, virgola finale riparata
  const chat = 'STEP biologia 3.3\n```json\n{ "parte": "biologia-3.3-s1", "quiz": ' + JSON.stringify(buone.slice(0, 9)) + ', }\n```\nSTATO: 1/2\n```json\n' + JSON.stringify(buone.slice(9)) + '\n```';
  const L = DQ.leggi(chat);
  eq([L.quiz.length, L.blocchi, L.riparato, L.parti[0]], [18, 2, true, 'biologia-3.3-s1'], 'chat intera: 2 blocchi, virgola riparata');
  vero(DQ.riparaVirgole('{"a":"x,}",}') === '{"a":"x,}"}', 'virgole: dentro le stringhe intatte');
  eq(DQ.sezioni(SP('B')).map(x => x.etichetta), ['COSA CHIEDE', 'CONCETTO E MECCANISMO', 'RISPOSTA ESATTA', 'PERCHÉ GLI ALTRI NO', 'IN SINTESI'], 'sezioni della spiegazione');
  eq(DQ.letteraDichiarata(SP('C')), 2, 'lettera dichiarata');
  const A = DQ.analizza(buone);
  eq([A.n, A.pronte, A.problemi.filter(p => p.sev === 'err').length], [18, 18, 0], 'scheda corretta: 18 pronte, 0 errori: ' + JSON.stringify(A.problemi.filter(p => p.sev === 'err')));
  eq(A.schede[0].lv, [5, 6, 4, 3], 'livelli per scheda');
  // difetti mirati
  const rotte = buone.map(x => ({ ...x }));
  rotte[0] = { ...rotte[0], spiegazione: SP('D') };                       // lettera ≠ esatta
  rotte[1] = { ...rotte[1], livelloCognitivo: '2' };                     // stringa
  rotte[2] = { ...rotte[2], opzioni: ['a', 'b', 'c'] };                  // 3 opzioni
  rotte[3] = { ...rotte[3], fonte: '[[Manuale, p. 999]]' };              // citazione ≠ fonte
  const B = DQ.analizza(rotte), msg = (id) => B.problemi.filter(p => p.id === id).map(p => p.sev + ':' + p.msg).join(' | ');
  vero(/err:.*RISPOSTA ESATTA/i.test(msg('biologia-3.3-001')), 'lettera RISPOSTA ESATTA ≠ esatta → errore: ' + msg('biologia-3.3-001'));
  vero(/livelloCognitivo/.test(msg('biologia-3.3-002')), 'livelloCognitivo stringa segnalato');
  vero(/err:.*opzioni/.test(msg('biologia-3.3-003')), '3 opzioni → errore');
  vero(/citazione/.test(msg('biologia-3.3-004')), 'citazione ≠ fonte → avviso');
  vero(B.pronte < 18, 'le domande con errori non sono pronte');
  // auto-fix immutabile
  const F = DQ.autoFix(rotte);
  vero(F.log.length > 0 && rotte[1].livelloCognitivo === '2' && F.qs[1].livelloCognitivo === 2, 'autoFix converte il livello senza toccare l\'originale');
  // patch
  const P = DQ.leggiPatch('```json\n[{"id":"biologia-3.3-003","opzioni":["a","b","c","d"]},{"id":"nessuno","domanda":"x"}]\n```');
  vero(P.patch && P.patch.length === 2, 'leggiPatch dal blocco di codice');
  const AP = DQ.applicaPatch(F.qs, P.patch);
  eq([AP.n, AP.mancanti, AP.qs[2].opzioni.length, F.qs[2].opzioni.length], [1, ['nessuno'], 4, 3], 'applicaPatch immutabile, ID mancanti');
  vero('errore' in DQ.leggiPatch('non json'), 'patch non valida → errore');
  // prompt di correzione
  const C = DQ.promptCorrezione(rotte, B.problemi, { gem: false });
  vero(C.nDomande >= 2 && /biologia-3\.3-001/.test(C.testo) && /RESTITUISCI/.test(C.testo), 'prompt di correzione con ID e campi da restituire');
  vero(!/scheda intera/i.test(C.testo) || /mai la scheda intera|non.*scheda intera/i.test(C.testo), 'chiede solo patch');
  // JSON finale
  const jf = JSON.parse(DQ.jsonFinale(buone, 'biologia-3.3-s1'));
  eq([jf.parte, jf.quiz.length], ['biologia-3.3-s1', 18], 'jsonFinale');
  // piano: quote 25/35/25/15 e mai 3 uguali di fila
  eq(DQ.pianoConteggi(18), [5, 6, 4, 3], 'quote per 18');
  eq(DQ.pianoConteggi(36).reduce((a, b) => a + b, 0), 36, 'somma quote');
  let seme = 7; const rnd = () => (seme = (seme * 16807) % 2147483647) / 2147483647;
  const pi = DQ.piano(36, rnd);
  vero(pi.length === 36 && pi.every((p, i) => i < 2 || !(p.es === pi[i - 1].es && p.es === pi[i - 2].es)), 'piano: mai 3 posizioni uguali di fila');
  vero(/biologia-3\.3-019 \| L\d \| esatta=\d \([A-D]\)/.test(DQ.tabella('biologia-3.3', 19, pi.slice(0, 18))), 'tabella di assegnazione');
});

await t('v0.59.2→v0.61: MasterPrompt — indice di lettura, mappa pagine, formato quiz-v3, prompt universale', async () => {
  const MP = globalThis.__DQ_SANDBOX.MasterPrompt;
  const testo = 'La membrana plasmatica è formata da un doppio strato fosfolipidico con proteine integrali e periferiche. '.repeat(4);
  eq(MP.indiceLettura([testo, testo, testo, '']).giudizio, 'parziale', '3/4 → parziale');
  eq(MP.indiceLettura(Array(10).fill(testo)).giudizio, 'testo pieno', 'tutte leggibili');
  eq(MP.indiceLettura(['', '12', '§§§ ### ' + '@@@ '.repeat(80)]).giudizio, 'scansione', 'scansione/OCR sporco');
  eq(MP.pagineCampione(5), [1, 2, 3, 4, 5], 'pochi fogli: tutti');
  const pc = MP.pagineCampione(600); vero(pc.length === 24 && pc[0] === 1 && pc[23] === 600, 'campione distribuito');
  eq([MP.segmentoDa('Fasano 301-350.pdf'), MP.segmentoDa('Biologia.pdf'), MP.segmentoDa('Cap 50-10.pdf')], [301, null, null], 'segmento dal nome');
  eq(MP.nomeLibro('Fasano 301-350.pdf'), MP.nomeLibro('Fasano 351-400.pdf'), 'segmenti dello stesso libro raggruppati');
  const camp = [20, 40, 60, 80, 100].map(n => ({ pdf: n + 14, testo: 'Capitolo 3\n' + testo + '\n' + n }));
  eq(MP.stimaOffset(camp), 14, 'scostamento costante dalle pagine stampate');
  eq(MP.stimaOffset([{ pdf: 5, testo }]), null, 'senza numeri → null');
  eq(MP.prossimo(['q-drv-biologia-3.3-018', 'biologia-3.3-036', 'chimica-3.3-099'], 'biologia-3.3'), { primo: 37, scheda: 3 }, 'primo ID libero e prima scheda');
  eq(MP.slug('Fisica e Chimica'), 'fisicaechimica', 'slug');
  const p = MP.costruisci({ materia: 'Chimica', codice: 'C', step: '2.1', archetipo: 'scienze_sperimentali', intensita: 'leggera', perMessaggio: 1, tono: 'semplice_esempi',
    libri: [{ nome: 'Chimica generale', pdf: ['Chimica generale.pdf'], lettura: { campione: 24, leggibili: 6, pct: 25, media: 300, giudizio: 'scansione' }, offset: null }],
    vietati: ['Chimica TB.pdf'], idEsistenti: ['chimica-2.1-018'], puntiDeboli: ['C-2.1.1-1 (40%)'] });
  vero(/10–14 schede/.test(p) && /Prima scheda: S02/.test(p) && !/chimica-2\.1-019/.test(p), 'intensità leggera, prima scheda libera, niente ID chiesti alla AI');
  vero(/SCANSIONE/.test(p) && /capitolo e paragrafo/.test(p) && !/ricavalo tu/.test(p) && /Chimica TB\.pdf/.test(p), 'leggibilità, pagine non misurate → capitolo e paragrafo, fonti vietate');
  vero(/Problemi su/.test(p) && /CHIMICA/.test(p), 'regola Q-E e schede di calcolo per la chimica');
  vero(/1 scheda \(18 domande\)/.test(p) && /punti deboli/i.test(p) && /semplice/.test(p), '1 scheda per messaggio, punti deboli, registro');
  vero(/"parte": "chimica-2\.1-s<n>"/.test(p) && /erroreTipico/.test(p), 'formato consegna');
  vero(!/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(p), 'nessun indirizzo email nel prompt universale');
  const s = MP.costruisci({ materia: 'Storia', codice: 'S', step: '1.1', archetipo: 'umanistico_storico' });
  vero(/cause → eventi/.test(s) && !/Problemi su/.test(s) && /18–25 schede/.test(s), 'archetipo umanistico, niente calcoli, standard');
  vero(/"formato": "quiz-v3"/.test(s) && MP.CHIAVI_V3.every(k => s.includes(k)) && /opzioni\[0\]/.test(s), 'formato quiz-v3: campi di contenuto, giusta in opzioni[0]');
  vero(!/"esatta":/.test(s) && !/"id":/.test(s) && !/esatta` bilanciata/.test(s) && !/conteggi": \{/.test(s) && !/domandeTotali/.test(s), 'niente ID, esatta né conteggi chiesti alla AI');
  eq([MP.SEQUENZA_LIVELLI.length, [1, 2, 3, 4].map(l => MP.SEQUENZA_LIVELLI.filter(x => x === l).length)], [18, [5, 6, 4, 3]], 'sequenza livelli 18 = 5/6/4/3');
  vero(s.includes(MP.SEQUENZA_LIVELLI.join(', ')), 'la sequenza è nel prompt');
  const lb = MP.costruisci({ materia: 'Biologia', step: '3.3', gem: true, libri: [{ nome: 'Manuale', pdf: ['Manuale.pdf'], mappa: { fonte: 'auto-etichette', affidabilita: 'esatta', tratti: [{ pdfDa: 3, pdfA: 6, stampDa: 'i' }, { pdfDa: 7, pdfA: 400, stampDa: 1 }] } }] });
  vero(/stampate i–iv = PDF 3–6; stampate 1–394 = PDF 7–400/.test(lb) && /valgono QUESTE/.test(lb), 'con mappa: intervalli esatti; Gem con regole vecchie');
});

await t('v0.61: strumenti-quiz.js espone Contratto, Validatore e MappaPagine; l\'esempio del prompt si legge come quiz-v3', () => {
  const sb = globalThis.__DQ_SANDBOX, bm = fs.readFileSync(path.join(SRC, '..', 'build.mjs'), 'utf8');
  const su = fs.readdirSync(path.join(SRC, 'su-richiesta')).sort();
  vero(['07-contratto.ts', '07-mappapagine.ts', '07-validatore.ts'].every(f => su.includes(f)) && /readdirSync\('build-tmp\/su-richiesta'\)/.test(bm), 'moduli nel pacchetto su richiesta');
  eq(vm.runInContext('[typeof Contratto.leggi, typeof Validatore.valida, typeof MappaPagine.daEtichette]', sb), ['function', 'function', 'function'], 'API esposte');
  vero(/MappaPagine\.daEtichette\(/.test(leggi('su-richiesta/07-strumentiquiz.ts')), 'il prompt misura le pagine con MappaPagine');
  const p = sb.MasterPrompt.costruisci({ materia: 'Biologia', step: '3.3' }), es = p.split('\n').find(r => r.startsWith('{"scheda":"S01"'));
  const l = vm.runInContext('Contratto.leggi', sb)('```json\n{ "formato": "quiz-v3", "parte": "biologia-3.3-s1", "quiz": [' + es + '] }\n```');
  const qs = vm.runInContext('Contratto.aQuiz', sb)(l, { step: 'biologia-3.3' });
  vero(l.formato === 'quiz-v3' && qs.length === 1 && /^risposta corretta/.test(qs[0].opzioni[qs[0].esatta]) && qs[0].id === 'biologia-3.3-S01-01', 'esempio → id dall\'app, giusta tracciata dopo il mescolamento');
});

await t('v0.62: Dossier studente — modulo puro su richiesta, privacy prima di copiare, voci tolte in localStorage imc-', () => {
  const ds = leggi('su-richiesta/07-dossier.ts'), sq = leggi('su-richiesta/07-strumentiquiz.ts'), mp = leggi('su-richiesta/07-masterprompt.ts');
  vero(!/\bStato\.|\bdocument\.|localStorage|fetch\(|innerHTML/.test(ds), 'dossier puro: niente Stato, DOM, rete o storage');
  vero(!fs.readdirSync(SRC).some(f => /dossier/.test(f)), 'dossier fuori da app.js');
  vero(/Dossier\.controllaPrivacy\(/.test(sq) && /btnCopia\.disabled = btnScarica\.disabled = problemiPrivacy\.length > 0/.test(sq), 'Copia e Scarica bloccati se il controllo privacy trova qualcosa');
  vero(/'imc-dossier-escluse'/.test(sq) && /Privacy\.accLocale\(\)/.test(sq) && /Privacy\.idDispositivo\(\)/.test(sq), 'voci tolte con prefisso imc-; email e dispositivo nel controllo');
  vero(/dossier\?: string\[\]/.test(mp) && /o\.dossier && o\.dossier\.length/.test(mp), 'master prompt: regole del dossier al posto dei punti deboli');
  vero(!/new Date\(\)|Date\.now/.test(ds), 'dossier deterministico: la data arriva da fuori');
});

await t('v0.59.2: quiz in app — confutazioni da spiegazioneDistrattori, sezioni, errore tipico, strumenti in Studio', () => {
  const qa = leggi('07-quizapp.ts'), id = leggi('07-importadrive.ts'), st = leggi('07-studio.ts'), sq = leggi('su-richiesta/07-strumentiquiz.ts'), sp = leggi('07-sezionispiegazione.ts'), bm = fs.readFileSync(path.join(SRC, '..', 'build.mjs'), 'utf8'), sw = fs.readFileSync(path.join(SRC, '..', 'public', 'sw.js'), 'utf8');
  vero(/ew = ewDi\(d\)/.test(qa) && /spiegazioneDistrattori/.test(qa), 'correzione usa le confutazioni dei quiz da Drive');
  vero(/sezioniSpiegazione\(d\.e\)/.test(qa) && /function sezioniSpiegazione/.test(sp) && /RISPOSTA ESATTA\|PERCH/.test(qa), 'spiegazione a sezioni, lettere originali omesse');
  vero(/d\.erroreTipico/.test(qa) && /d\.erroreTipico = s\(x\.erroreTipico\)/.test(id), 'erroreTipico importato e mostrato');
  vero(/conStrumentiQuiz\(\(\) => StrumentiQuiz\.prompt\(\)\)/.test(st) && /conStrumentiQuiz\(\(\) => StrumentiQuiz\.diagnostica\(\)\)/.test(st), 'voci in Studio «⋯», caricate su richiesta');
  vero(/dist\/strumenti-quiz\.js/.test(bm) && /app \+ '\\n' \+ extra/.test(bm) && /'strumenti-quiz\.js'/.test(sw), 'strumenti-quiz.js costruito, nell\'anteprima e in cache offline');
  vero(!fs.readdirSync(SRC).some(f => /diagnosiquiz|masterprompt|strumentiquiz/.test(f)), 'strumenti quiz fuori dal pacchetto principale');
  vero(/TestoPdf\.(con|apri)\(/.test(sq) && !/getDocument\(/.test(sq) && !/innerHTML/.test(sq), 'pdf.js solo via TestoPdf (senza eval, U5), niente innerHTML');
});

const fl = fs.readdirSync(SRC).filter(x => x.endsWith('.ts')).sort();
t('Pianificatore e interfaccia concatenati prima del quiz (uso solo a runtime)', () => vero(['07-pianificatore.ts', '07-pianiai.ts'].every(x => fl.indexOf(x) >= 0 && fl.indexOf(x) < fl.indexOf('07-quizapp.ts'))));

t('v0.63: modalità prova del quiz in app senza statq né sessione (senza flag come prima)', () => {
  const q = leggi('07-quizapp.ts'), c = leggi('su-richiesta/07-centroui.ts');
  vero(/const annulla = prova \? null : registraStat\(x\)/.test(q), 'prova salta registraStat (statq, carte, piani)');
  vero(/if \(!gen && !prova\) Cattura\.salva\(/.test(q), 'prova salta Cattura.salva (sessione e progresso)');
  vero(/const prova = !!\(info && info\.prova\)/.test(q), 'flag facoltativo: senza info.prova tutto come prima');
  vero(/prova: true/.test(c), 'il Centro apre il quiz in prova');
});

t('v0.63: Importa del Centro sulla pipeline unica, lista esclusi precompilata, titolo senza «da Drive»', () => {
  const c = leggi('su-richiesta/07-centroui.ts'), sq = leggi('su-richiesta/07-strumentiquiz.ts'), d = leggi('07-importadrive.ts');
  vero(/Centro\.chiusura\(/.test(c) && /Centro\.filtra\(/.test(c) && /ImportaParti\.raggruppa\(/.test(c), 'chiusura dall\'app, filtro per microstep, stessi gruppi dell\'import');
  vero(/ImportaDrive\.salva\(t, sc, CARTELLA, \{ accumula: true/.test(c), 'reimport = stesso innesto (inn-<k>), niente doppioni');
  vero(/'imc-centro-esclusi'/.test(sq) && /\['Testbusters', 'Alpha Test', 'Editest'\]/.test(sq), 'lista esclusi con prefisso imc- e precompilata');
  vero(!/RE_VIETATI/.test(sq) && /if \(vietato\(n\)\)/.test(sq), 'la raccolta fonti usa la lista modificabile');
  vero(/titolo: '📥 Importa quiz', corpo/.test(d) && !/titolo: '📥 Importa quiz da Drive'/.test(d), 'titolo del foglio import senza «da Drive»');
});

t('v0.64: runner — codice in monospazio, rubrica confermata dall\'utente, linguaggio di programmazione accettato', () => {
  const q = leggi('07-quizapp.ts'), dm = leggi('07-dominio.ts');
  vero(/qz-codice[^\n]{0,200}spellcheck="false"[^\n]{0,80}autocapitalize="off"/.test(q), 'textarea del codice: monospazio, niente correttore né maiuscole');
  vero(/data-voto="1"/.test(q) && /data-voto="0"/.test(q) && /Era giusta/.test(q) && /Era sbagliata/.test(q), 'pulsanti di conferma del voto');
  vero(/if \(v\.auto\) r\.auto = true/.test(q), 'auto:true in statq solo se il voto è stato cambiato');
  const m = /linguaCodice\)\)\) d\.linguaCodice/.exec(dm); vero(!!m, 'normalizzaDomanda copia linguaCodice');
  const re = new RegExp(/\/(\^[^/]+\$)\/\.test\(str\(x\.linguaCodice\)\)/.exec(dm)[1]);
  vero(['python', 'c++', 'c#', 'en', 'it-IT'].every(x => re.test(x)) && !re.test('<script>'), 'regex: linguaggi e lingue sì, markup no');
});

t('v0.64.3 P0-B: ingresso UI alla coda, nessun OCR o racing, risultati scaricabili', () => {
  const ui = leggi('su-richiesta/07-codaquizui.ts'), runner = leggi('su-richiesta/07-codaquizrunner.ts'), studio = leggi('07-studio.ts');
  vero(/CodaQuizRunner\.creaPianoDaPdf/.test(ui) && /CodaQuizRunner\.creaPianoDaTesto/.test(ui) && /CodaQuizRunner\.avanza/.test(ui), 'testo/PDF → piano quantità → runner');
  vero(/Pausa/.test(ui) && /Riprendi/.test(ui) && /Annulla/.test(ui) && /Scarica JSON/.test(ui), 'controlli della coda');
  vero(/CodaQuizUI\.apri\(\)/.test(studio), 'ingresso da Studio');
  vero(/IA\.chiedi\(m as any, 'genera'/.test(runner) && !/Promise\.(?:all|race|any)\s*\(/.test(runner), 'router esistente e sequenziale');
});

t('v0.64.4 P0-C: valida domanda/pacchetto, corregge solo bocciate per tre tentativi e innesta idempotente', () => {
  const q = leggi('su-richiesta/07-codaquizqualita.ts'), r = leggi('su-richiesta/07-codaquizrunner.ts'), ui = leggi('su-richiesta/07-codaquizui.ts');
  vero(/Validatore\.valida\(\[q\]\)/.test(q) && /problemiPacchetto: v\.insieme/.test(q), 'domanda e pacchetto separati');
  vero(/tentativi >= 3 \? 'da_rivedere'/.test(q) && /filter\(x => x\.stato === 'da_correggere'\)/.test(r), 'solo bocciate, massimo tre tentativi');
  vero(/DiagnosiQuiz\.applicaPatch/.test(q) && /Restituisci esclusivamente un array JSON di patch/.test(q), 'patch chirurgiche');
  vero(/ImportaDrive\.salva\(t, sc, 'coda:' \+ l\.id, \{ accumula: true/.test(q) && /Innestalo nel piano/.test(ui), 'innesto idempotente esposto');
  vero(!/\bfetch\s*\(|Promise\.(?:all|race|any)\s*\(/.test(r), 'nessun OCR o racing parallelo');
});

t('v0.64.5 T13: onboarding ospite in tre domande, atomico e riapribile', () => {
  const d = leggi('07-dominio.ts'), m = leggi('09-main.ts');
  vero(/Domanda ['"] \+ \(passo \+ 1\) \+ ['"] di 3/.test(d) && /Profilo di studio iniziale/.test(d) && /Prima materia/.test(d) && /AI usata per creare quiz/.test(d), 'tre domande');
  vero(/Salta per ora/.test(d) && /Riapri configurazione iniziale/.test(d) && /p\.ruolo === 'ospite'/.test(d), 'salta, riapri e solo ospite');
  vero(/if \(data\.value\) Stato\.salva/.test(d) && /id: 'profiloai'/.test(d) && /CentroUI\.apri/.test(d), 'materia, esame facoltativo, AI e Centro');
  vero(/Dominio\.benvenuto\(\)/.test(m) && !/Drive\.stato\.sync === 'ok' && Dominio\.serveBenvenuto/.test(m), 'parte senza Drive');
});

fs.rmSync(TMP, { recursive: true, force: true });
const tot = ok + ko;
console.log('\n' + (ko ? '✗' : '✓') + ' Superati ' + ok + '/' + tot + ' (' + Math.round(ok / tot * 100) + '%)' + (ko ? ' — falliti: ' + fallite.join('; ') : ''));
process.exit(ko ? 1 : 0);
