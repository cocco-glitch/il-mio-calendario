// 07-SUITE-TEST-FUNZIONALI-E-REGRESSIONE.mjs — v0.54 (BP3)
// Test funzionali e di regressione SENZA browser e SENZA toccare dist/:
//  - compila src/07-neuro.ts (modulo puro) in una cartella temporanea del sistema e lo carica in una sandbox vm;
//  - fetch è sostituita da un contatore: i livelli 0 e 1 dell'imbuto AI devono fare ZERO chiamate di rete;
//  - controlli statici su src/ (catena AI, niente Mistral/OpenRouter, vincoli Google Calendar, aggancio dei moduli).
// Uso: node 07-SUITE-TEST-FUNZIONALI-E-REGRESSIONE.mjs   (codice di uscita 1 se qualcosa fallisce)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execSync } from 'node:child_process';
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
fs.writeFileSync(path.join(TMP, 'stub.d.ts'), 'interface Rec { id: string; type: string; updatedAt: number; deleted?: boolean; acc?: string; }\n');
fs.copyFileSync(path.join(SRC, '07-neuro.ts'), path.join(TMP, 'neuro.ts'));
try {
  execSync('npx -y -p typescript@5.6.3 tsc --target es2020 --lib es2020 --strict --noEmitOnError false --outDir out stub.d.ts neuro.ts', { cwd: TMP, stdio: 'pipe' });
} catch (e) { console.log('⚠️ tsc su 07-neuro.ts:\n' + String(e.stdout || e.message).slice(0, 2000)); }
const JS = fs.readFileSync(path.join(TMP, 'out', 'neuro.js'), 'utf8');
let chiamateRete = 0;
const sandbox = { console, fetch: async () => { chiamateRete++; throw new Error('rete vietata nei test'); }, Math, Date, JSON, Promise, Set, Map };
vm.createContext(sandbox);
vm.runInContext(JS + '\n;this.Neuro = Neuro;', sandbox);
const N = sandbox.Neuro;
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
t('certo + giusta → padronanza (×1,25 sullo standard)', () => {
  const std = N.pianifica(prev, 2, true, OGGI), r = N.pianifica(prev, 3, true, OGGI);
  eq(r.iv, Math.round(std.iv * 1.25 * 10) / 10); eq(r.ultimoCaso, 'padronanza');
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
t('pianifica senza stato precedente né certezza → standard', () => { const r = N.pianifica(null, null, true, OGGI); eq(r.iv, 1); eq(r.ultimoCaso, 'standard'); });
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
t('catena «genera»: gemini → groq → xkiro → cohere → requesty → cerebras → sambanova', () => {
  const m = /genera:\s*\[([^\]]+)\]/.exec(ia.slice(ia.indexOf('const CATENA'))); eq(m[1].replace(/['\s]/g, '').split(','), ['gemini', 'groq', 'xkiro', 'cohere', 'requesty', 'cerebras', 'sambanova']);
});
t('catena «micro» (livello 2): gemini → groq → xkiro, uscita 350 token', () => {
  const m = /micro:\s*\[([^\]]+)\]\s*\}/.exec(ia.slice(ia.indexOf('const CATENA'))); eq(m[1].replace(/['\s]/g, '').split(','), ['gemini', 'groq', 'xkiro']);
  vero(/micro:\s*350/.test(ia), 'USCITA.micro'); vero(/gemini:\s*\{\s*micro:\s*\['gemini-3\.5-flash-lite'/.test(ia), 'flash-lite per primo');
});
t('nessun riferimento attivo a Mistral/OpenRouter in src/', () => {
  const sporchi = [];
  for (const f of fs.readdirSync(SRC).filter(x => x.endsWith('.ts'))) leggi(f).split('\n').forEach((r, i) => {
    const codice = r.replace(/\/\/.*$/, '').replace(/\/\*\*.*\*\//, '');
    if (/mistral|openrouter/i.test(codice) && !/const RITIRATI = \['mistral', 'openrouter'\]/.test(codice)) sporchi.push(f + ':' + (i + 1));
  });
  eq(sporchi, [], 'righe');
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
t('versione app 0.54', () => vero(/const VERSIONE = '0\.54'/.test(leggi('09-main.ts'))));

fs.rmSync(TMP, { recursive: true, force: true });
const tot = ok + ko;
console.log('\n' + (ko ? '✗' : '✓') + ' Superati ' + ok + '/' + tot + ' (' + Math.round(ok / tot * 100) + '%)' + (ko ? ' — falliti: ' + fallite.join('; ') : ''));
process.exit(ko ? 1 : 0);
