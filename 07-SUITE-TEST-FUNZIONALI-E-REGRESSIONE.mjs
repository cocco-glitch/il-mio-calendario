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
fs.writeFileSync(path.join(TMP, 'stub.d.ts'), 'interface Rec { id: string; type: string; updatedAt: number; deleted?: boolean; acc?: string; }\n'
  + 'interface VocePiano { k: string; t: string; d?: string; speciale?: boolean; }\n'
  + 'interface GiornoPiano { data: string; n?: number; voci: VocePiano[]; nota?: string; }\n'
  + "interface PkPiano { tipo: 'piano'; id: string; modo?: string; titolo: string; aggiornato: string; giorniTeoria: number; nota?: string; giorni: GiornoPiano[]; }\n");
fs.copyFileSync(path.join(SRC, '01-json.ts'), path.join(TMP, 'json.ts'));   // v0.57 (A15): parser unico usato da Neuro e Pianificatore
fs.copyFileSync(path.join(SRC, '07-neuro.ts'), path.join(TMP, 'neuro.ts'));
fs.copyFileSync(path.join(SRC, '07-pianificatore.ts'), path.join(TMP, 'pianificatore.ts'));
try {
  execSync('npx -y -p typescript@5.6.3 tsc --target es2020 --lib es2020 --strict --noEmitOnError false --outDir out stub.d.ts json.ts neuro.ts pianificatore.ts', { cwd: TMP, stdio: 'pipe' });
} catch (e) { console.log('⚠️ tsc sui moduli puri:\n' + String(e.stdout || e.message).slice(0, 2000)); }
const JS_JSON = fs.readFileSync(path.join(TMP, 'out', 'json.js'), 'utf8');
const JS = fs.readFileSync(path.join(TMP, 'out', 'neuro.js'), 'utf8');
const JS_PIAN = fs.readFileSync(path.join(TMP, 'out', 'pianificatore.js'), 'utf8');
let chiamateRete = 0;
const sandbox = { console, fetch: async () => { chiamateRete++; throw new Error('rete vietata nei test'); }, Math, Date, JSON, Promise, Set, Map };
vm.createContext(sandbox);
vm.runInContext(JS_JSON + '\n;this.JsonAI = JsonAI;', sandbox);
vm.runInContext(JS + '\n;this.Neuro = Neuro;', sandbox);
vm.runInContext(JS_PIAN + '\n;this.Pianificatore = Pianificatore;', sandbox);
const N = sandbox.Neuro, P = sandbox.Pianificatore;
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
t('v0.57.1 Q1: cloze da appunto — {{x}} = risposta x, «q :: r» = domanda/risposta, niente graffe visibili', () => {
  const c = N.cloze('# Rivoluzione\n- La presa della {{Bastiglia}} avviene nel 1789.\n- Quando inizia la Rivoluzione francese? :: 1789\nIl {{=2+3}} resta un template.', { sk: 's' });
  const g = c.find(x => x.a[0] === 'Bastiglia'), q = c.find(x => x.a[0] === '1789');
  vero(g && g.q === 'La presa della …… avviene nel 1789.', 'completamento dalle graffe');
  vero(q && q.q === 'Quando inizia la Rivoluzione francese?' && q.lv === 'Domanda', 'domanda :: risposta');
  vero(c.every(x => !/\{\{|\}\}|::/.test(x.q)), 'nessuna graffa o :: nel testo');
});
t('v0.57.1 D1/D2/D3/D5/Q3/Q6: guardie statiche', () => {
  vero(/MATERIE_BASE\)\.filter\(\(\) => Drive\.eProprietario\(\)\)/.test(leggi('07-pianiai.ts')), 'D1 pianiai');
  vero(/Drive\.eProprietario\(\) \? \['Chimica'/.test(leggi('07-creaquiz.ts')), 'D2 creaquiz');
  vero(/case 'studiaora': return widgetStudiaOra\(\)/.test(leggi('08-viste.ts')), 'D3 Studia ora (v0.58: sempre)');
  vero(/MATRICE_5_LIVELLI\.filter\(c => c\.livello <= 4\)/.test(leggi('07-pianiai.ts')), 'D5 wizard 1–4');
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
t('versione app 0.59.0', () => vero(/const VERSIONE = '0\.59\.0'/.test(leggi('09-main.ts'))));
t('v0.58.4: build senza commenti (peso app.js)', () => vero(/"removeComments": *true/.test(fs.readFileSync(new URL('tsconfig.json', import.meta.url), 'utf8'))));
t('v0.58.5: niente banner fisso di aggiornamento, avvisi al massimo 2', () => vero(!/avviso\('Nuova versione/.test(leggi('09-main.ts')) && /zona\.children\.length >= 2/.test(leggi('04-componenti.ts'))));
t('v0.58.6: nessun vicolo cieco (materia al volo, Annulla nel toast, guida su Oggi)', () => vero(/function campoMateria/.test(leggi('07-extra.ts')) && /testo: 'Annulla'/.test(leggi('07-rapido.ts')) && /function iniziaIn3Passi/.test(leggi('08-viste.ts')) && /Ho una data d’esame/.test(leggi('07-generatore.ts'))));
t('v0.59: coda unica di ripasso (CodaRipasso, un solo riquadro Ripassa, Studia ora dalla coda)', () => vero(/const CodaRipasso/.test(leggi('07-coda.ts')) && /function widgetRipassa/.test(leggi('07-coda.ts')) && !/function widgetCarte|function widgetAppunti|function widgetRipassi/.test(leggi('07-carte.ts') + leggi('07-appunti.ts') + leggi('07-memoria.ts')) && /CodaRipasso\.dovuti/.test(leggi('07-studiaora.ts')) && /case 'ripassi': return widgetRipassa\(\)/.test(leggi('08-viste.ts'))));

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
t('testHardCapEricssonL5: L5 con 9,5 h → analitico ≤ 270 min, il resto offloading attivo', () => {
  const rete0 = chiamateRete;
  eq(P.MATRICE_5_LIVELLI.length, 5); vero(P.MATRICE_5_LIVELLI.every(c => c.capSforzoAnaliticoMin <= 270), 'cap ≤ 270 in matrice');
  eq(P.configLivello(5).capSforzoAnaliticoMin, 270); eq(P.configLivello(5).moltiplicatoreResaEquivalente, 1.95); eq(P.configLivello(1).ritenzioneTargetFSRS, 0.85);
  for (const cronotipo of ['allodola_mattina', 'intermedio', 'pomeridiano', 'gufo_sera']) for (const autonomiaBRACMin of [35, 55, 80, 100]) {
    const g = P.allocaGiornata(5, { fasciaEta: '20-26', oreSonnoMedie: '7-8', cronotipo, autonomiaBRACMin }, { minuti: 570 });
    const an = g.slot.filter(x => x.analitico).reduce((a, x) => a + x.min, 0);
    vero(an <= 270 && an === g.analiticoMin, cronotipo + '/' + autonomiaBRACMin + ': analitico ' + an);
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
t('testCapBiologiciEtaESonno: <16 o sonno <6 che chiedono L5 → L3 con avviso; BRAC 35 → 35 + 10', () => {
  const a = P.applicaGuardRailBiologici(5, { fasciaEta: '<16' });
  eq(a.livello, 3); eq(a.richiesto, 5); vero(a.avvisi.some(x => /neurosviluppo/.test(x) && /6\.5h/.test(x)), 'avviso età');
  const b = P.applicaGuardRailBiologici(5, { oreSonnoMedie: '<6' });
  eq(b.livello, 3); vero(b.avvisi.some(x => /6h di sonno/.test(x) && /ippocampale/.test(x)), 'avviso sonno');
  const c = P.applicaGuardRailBiologici(4, { fasciaEta: '<16', oreSonnoMedie: '<6' }); eq(c.livello, 3); eq(c.avvisi.length, 2);
  eq(P.applicaGuardRailBiologici(3, { fasciaEta: '<16', oreSonnoMedie: '<6' }).livello, 3, 'L3 resta L3');
  eq(P.applicaGuardRailBiologici(5, { fasciaEta: '20-26', oreSonnoMedie: '7-8' }).livello, 5, 'adulto riposato: L5');
  const d = P.applicaGuardRailBiologici(2, { autonomiaBRACMin: 35 }); eq(d.bloccoMin, 35); eq(d.pausaMin, 10);
  const g = P.allocaGiornata(5, { fasciaEta: '<16', autonomiaBRACMin: 35 });
  eq(g.livello, 3); vero(g.studioMin <= 6.5 * 60, 'ore L3'); vero(g.slot.filter(x => x.tipo === 'wakeful_rest').every(x => x.min === 10), 'pause 10');
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
  eq(d.deload.fino, '2026-11-20'); eq(d.deload.livelloTarget, 4); eq(d.deload.livelloRidotto, 2); eq(d.livelloIntensita, 2);
  for (const g of d.giorni) if (g.data >= OGGI && g.data < '2026-11-20') {
    vero(!g.voci.some(v => v.livelloCognitivo && !v.isRipassoFSRS && !v.isBuffer), g.data + ': niente capitoli nuovi');
  }
  vero(tutteVoci(d).some(v => v.isDeload), 'voce de-load (FSRS leggero + Wakeful Rest)');
  eq(tutteVoci(d).filter(v => !v.speciale).map(v => v.k).sort().join(), chiavi.join(), 'chiavi invariate, niente perso');
  eq(P.attivaDeload(d, { oggi: OGGI }), null, 'niente doppio de-load');
  eq(P.livelloEffettivo(d, '2026-11-19'), 2); eq(P.livelloEffettivo(d, '2026-11-20'), 3); eq(P.livelloEffettivo(d, '2026-11-21'), 4);
  eq(P.aggiornaDeload(d, '2026-11-19'), null);
  const x = P.aggiornaDeload(d, '2026-11-20'); eq(x.livelloIntensita, 3); vero(x.deload.attivo);
  const y = P.aggiornaDeload(x, '2026-11-21'); eq(y.livelloIntensita, 4); vero(!y.deload.attivo, 'de-load chiuso');
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
const tuttiSrc = fs.readdirSync(SRC).filter(x => x.endsWith('.ts')).map(f => [f, leggi(f)]);
t('U5 pdf.js: ogni getDocument con isEvalSupported:false (CVE-2024-4367)', () => {
  const chiamate = tuttiSrc.flatMap(([f, s]) => s.split('\n').filter(r => /\.getDocument\(/.test(r)).map(c => [f, c.trim()]));
  vero(chiamate.length >= 5, 'trovate ' + chiamate.length + ' chiamate');
  for (const [f, c] of chiamate) vero(/isEvalSupported:\s*false/.test(c), f + ': ' + c);
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
  try { execSync('npx -y -p typescript@5.6.3 tsc --target es2020 --noEmitOnError false --outDir out qr.ts', { cwd: d, stdio: 'pipe' }); } catch (_) { /* tipi globali dell'app assenti: emette comunque */ }
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
  const js = ['07-importadrive-parti.ts', '07-importadrive.ts'].map(f => ts.transpileModule(leggi(f), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText).join('\n');
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

const fl = fs.readdirSync(SRC).filter(x => x.endsWith('.ts')).sort();
t('Pianificatore e interfaccia concatenati prima del quiz (uso solo a runtime)', () => vero(['07-pianificatore.ts', '07-pianiai.ts'].every(x => fl.indexOf(x) >= 0 && fl.indexOf(x) < fl.indexOf('07-quizapp.ts'))));

fs.rmSync(TMP, { recursive: true, force: true });
const tot = ok + ko;
console.log('\n' + (ko ? '✗' : '✓') + ' Superati ' + ok + '/' + tot + ' (' + Math.round(ok / tot * 100) + '%)' + (ko ? ' — falliti: ' + fallite.join('; ') : ''));
process.exit(ko ? 1 : 0);
