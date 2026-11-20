// test/dossier.mjs — v0.62 «Dossier studente»: test del modulo puro src/su-richiesta/07-dossier.ts.
// Transpila al volo con typescript (mai dist/) e lo esegue in una sandbox vm senza Stato né DOM.
// Uso: node test/dossier.mjs   (codice di uscita 1 se qualcosa fallisce; ultima riga «Dossier N/N»)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(QUI, '..', 'src');
const ts = createRequire(import.meta.url)('typescript');
const sorgente = fs.readFileSync(path.join(SRC, 'su-richiesta', '07-dossier.ts'), 'utf8').replace(/\r\n/g, '\n');

let ok = 0, ko = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nome); }
  catch (e) { ko++; console.log('  ✗ ' + nome + ' — ' + (e && e.message)); }
}
function eq(a, b, m) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((m || 'atteso') + ': ' + y + ', ottenuto ' + x); }
function vero(c, m) { if (!c) throw new Error(m || 'condizione falsa'); }

const sb = { console };
vm.createContext(sb);
vm.runInContext(ts.transpileModule(sorgente, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText + '\n;this.Dossier = Dossier;', sb);
const D = sb.Dossier;

// ---------- fixture ----------
// ts in ora LOCALE (le fasce orarie dipendono dal fuso del dispositivo)
const ora = (g, h, m = 0, s = 0) => new Date(2026, 10, g, h, m, s).toISOString();
/** n tentativi di cui ok giusti, uno ogni 40 s a partire da (g, h). */
function log(g, h, n, okN, o = {}) {
  return Array.from({ length: n }, (_, i) => ({ ts: ora(g, h, 0, 40 * i), corretto: i < okN, certezza: o.certezza || 2, ms: o.ms || 9000 }));
}
const stat = (qid, sk, n, okN, x = {}) => ({ qid, sk, n, ok: okN, ...x });
const OGGI = '2026-11-20';

// =====================================================================
console.log('\n== Argomenti e ambito ==');
t('argomentoDaSk: scheda → sotto-step; qc e banche importate', () => {
  eq([D.argomentoDaSk('B-2.2.1-1'), D.argomentoDaSk('B-2.2.1-12'), D.argomentoDaSk('biologia-3.3-S01'), D.argomentoDaSk('')], ['2.2.1', '2.2.1', '3.3', '']);
});
t('nello step: «2.2» prende 2.2 e 2.2.x, non 2.20 né 12.2', () => {
  eq(['2.2', '2.2.1', '2.2.10', '2.20', '12.2'].map(a => D.nelloStep(a, '2.2')), [true, true, true, false, false]);
  vero(D.nelloStep('7.1', ''), 'senza step = tutta la materia');
});

console.log('\n== Segnali ==');
t('dati insufficienti: < 5 tentativi per argomento → nessuna voce debole, dossier marcato insufficiente', () => {
  const d = D.calcola({ stat: [stat('q1', 'B-2.2.1-1', 3, 0)] }, { materia: 'Biologia', step: '2.2', oggi: OGGI });
  eq(d.voci.filter(v => v.tipo === 'debole').length, 0); vero(d.insufficiente, 'insufficiente');
});
t('argomento debole (< 60 % su ≥ 5): voce con motivo numerico, regola SENZA numeri', () => {
  const d = D.calcola({ stat: [stat('q1', 'B-2.2.1-1', 6, 2), stat('q2', 'B-2.2.1-2', 4, 1), stat('q3', 'B-2.2.2-1', 10, 9)] }, { materia: 'Biologia', step: '2.2', oggi: OGGI });
  const deb = d.voci.filter(v => v.tipo === 'debole');
  eq(deb.map(v => v.arg), ['2.2.1']);
  vero(/30 %/.test(deb[0].motivo) && /10 tentativi/.test(deb[0].motivo), 'motivo: ' + deb[0].motivo);
  vero(deb[0].regola && !/\d+ ?%|tentativ/.test(deb[0].regola), 'regola senza numeri da elaborare: ' + deb[0].regola);
});
t('fuori dallo step: ignorato', () => {
  const d = D.calcola({ stat: [stat('q1', 'B-3.1.1-1', 10, 1)] }, { materia: 'Biologia', step: '2.2', oggi: OGGI });
  eq(d.voci.filter(v => v.tipo === 'debole').length, 0);
});
t('idea sbagliata: distrattore scelto ≥ 2 volte → confusione citata (testi tagliati a 140), max 5, più scelte prima', () => {
  const lungo = 'x'.repeat(300);
  const s = [
    stat('q1', 'B-2.2.1-1', 5, 2, { testo: 'Il catabolismo comprende le reazioni che:', scelte: { 'Costruiscono molecole consumando ATP': 3, 'Avvengono solo nei cloroplasti': 1 } }),
    stat('q2', 'B-2.2.1-1', 5, 3, { testo: lungo, scelte: { [lungo]: 2 } }),
    ...[3, 4, 5, 6, 7].map(i => stat('q' + i, 'B-2.2.2-1', 4, 2, { testo: 'Domanda ' + i, scelte: { ['Sbagliata ' + i]: 2 } })),
  ];
  const c = D.calcola({ stat: s }, { materia: 'Biologia', step: '2.2', oggi: OGGI }).voci.filter(v => v.tipo === 'confusione');
  eq(c.length, 5); vero(/Costruiscono molecole consumando ATP/.test(c[0].regola), 'prima la più scelta');
  vero(c.every(v => v.regola.length < 420), 'testi tagliati');
  vero(!c.some(v => /cloroplasti/.test(v.regola)), 'una scelta sola non è un\'idea sbagliata');
});
t('illusioni (sicuro e sbagliato) ≥ 2 nello stesso argomento → regola gemelle e trabocchetti', () => {
  const s = [
    stat('q1', 'B-2.2.1-1', 3, 2, { caso: 'illusione_competenza' }),
    stat('q2', 'B-2.2.1-2', 3, 2, { log: [{ ts: ora(18, 10), corretto: false, certezza: 3, ms: 5000 }] }),
    stat('q3', 'B-2.2.2-1', 3, 2, { caso: 'illusione_competenza' }),
  ];
  const v = D.calcola({ stat: s }, { materia: 'Biologia', step: '2.2', oggi: OGGI }).voci.filter(x => x.tipo === 'illusione');
  eq(v.map(x => x.arg), ['2.2.1']); vero(/gemell/i.test(v[0].regola) && /L3/.test(v[0].regola), v[0].regola);
});
t('oblio: ease medio ≤ 2,0 su ≥ 3 domande con ripasso → più richiamo', () => {
  const s = [1, 2, 3].map(i => stat('q' + i, 'B-2.2.1-' + i, 4, 3, { ease: 1.7, reps: 3 })).concat([4, 5, 6].map(i => stat('q' + i, 'B-2.2.2-' + i, 4, 3, { ease: 2.5, reps: 3 })));
  const v = D.calcola({ stat: s }, { materia: 'Biologia', step: '2.2', oggi: OGGI }).voci.filter(x => x.tipo === 'oblio');
  eq(v.map(x => x.arg), ['2.2.1']);
});
t('tempo: mediana L1 > 25 s su ≥ 8 risposte → domande L1 brevi', () => {
  const lento = stat('q1', 'B-2.2.1-1', 8, 6, { livello: 1, log: log(18, 10, 8, 6, { ms: 31000 }) });
  const v = D.calcola({ stat: [lento] }, { materia: 'Biologia', step: '2.2', oggi: OGGI }).voci.filter(x => x.tipo === 'tempo');
  eq(v.length, 1); vero(/L1/.test(v[0].regola));
  eq(D.calcola({ stat: [stat('q1', 'B-2.2.1-1', 8, 6, { livello: 1, log: log(18, 10, 8, 6, { ms: 9000 }) })] }, { materia: 'B', oggi: OGGI }).voci.filter(x => x.tipo === 'tempo').length, 0);
});
t('concentrazione: calo dopo ~N domande in ≥ 2 sessioni → voce SOLO a schermo (nessuna regola)', () => {
  // due sessioni da 20: le prime 10 giuste, poi sbagliate
  const sess = g => Array.from({ length: 20 }, (_, i) => ({ ts: ora(g, 9, 0, 40 * i), corretto: i < 10, certezza: 2, ms: 8000 }));
  const s = [stat('q1', 'B-2.2.1-1', 40, 20, { log: sess(17).concat(sess(18)) })];
  const v = D.calcola({ stat: s }, { materia: 'Biologia', step: '2.2', oggi: OGGI }).voci.filter(x => x.tipo === 'concentrazione');
  eq(v.length, 1); vero(!v[0].regola, 'niente regola all\'AI'); vero(/1[0-4] domande/.test(v[0].titolo), v[0].titolo);
});
t('orario: fascia migliore e peggiore distanti ≥ 15 punti → voce a schermo', () => {
  const s = [stat('q1', 'B-2.2.1-1', 24, 15, { log: log(17, 9, 12, 11).concat(log(17, 22, 12, 4)) })];
  const v = D.calcola({ stat: s }, { materia: 'B', oggi: OGGI }).voci.filter(x => x.tipo === 'orario');
  eq(v.length, 1); vero(!v[0].regola); vero(/mattina/.test(v[0].titolo) && /sera/.test(v[0].motivo), v[0].titolo + ' | ' + v[0].motivo);
});
t('esame: giorni mancanti (mai la data); ≤ 7 → regola «esame vicino»; > 21 → solo a schermo', () => {
  const v5 = D.calcola({ stat: [], giorniEsame: 5 }, { materia: 'B', oggi: OGGI }).voci.find(x => x.tipo === 'esame');
  vero(v5 && v5.regola && /L3|L4/.test(v5.regola) && !/2026/.test(v5.regola + v5.motivo), 'vicino');
  const v40 = D.calcola({ stat: [], giorniEsame: 40 }, { materia: 'B', oggi: OGGI }).voci.find(x => x.tipo === 'esame');
  vero(v40 && !v40.regola, 'lontano: solo a schermo');
  eq(D.calcola({ stat: [] }, { materia: 'B', oggi: OGGI }).voci.filter(x => x.tipo === 'esame').length, 0);
});

console.log('\n== Regole e testo ==');
t('regole: max 8, più importanti prima, voci escluse tolte, deterministiche', () => {
  const s = [];
  for (let i = 1; i <= 12; i++) s.push(stat('q' + i, 'B-2.2.' + i + '-1', 10, i % 5, { scelte: { ['Errore ' + i]: 2 }, testo: 'D' + i }));
  const d = D.calcola({ stat: s, giorniEsame: 3 }, { materia: 'Biologia', step: '2.2', oggi: OGGI });
  const r = D.regole(d); eq(r.length, 8);
  eq(JSON.stringify(D.regole(D.calcola({ stat: s, giorniEsame: 3 }, { materia: 'Biologia', step: '2.2', oggi: OGGI }))), JSON.stringify(r), 'stesso input, stesse regole');
  const via = d.voci.find(v => v.regola).id;
  vero(!D.regole(d, [via]).includes(d.voci.find(v => v.id === via).regola), 'voce esclusa');
});
t('id delle voci stabili (servono per ricordare le escluse)', () => {
  const s = [stat('q1', 'B-2.2.1-1', 10, 2)];
  const a = D.calcola({ stat: s }, { materia: 'Biologia', step: '2.2', oggi: OGGI }).voci[0].id;
  const b = D.calcola({ stat: s.concat([stat('q2', 'B-2.2.2-1', 10, 9)]) }, { materia: 'Biologia', step: '2.2', oggi: '2026-11-25' }).voci[0].id;
  eq(a, b); eq(a, 'debole:2.2.1');
});
t('testo: anteprima con titoli e motivi; segnala quante voci vanno all\'AI', () => {
  const d = D.calcola({ stat: [stat('q1', 'B-2.2.1-1', 10, 2)], giorniEsame: 40 }, { materia: 'Biologia', step: '2.2', oggi: OGGI });
  const x = D.testo(d, D.regole(d));
  vero(/Biologia/.test(x) && /2\.2\.1/.test(x) && /1 regol/.test(x), x);
});

console.log('\n== Controllo privacy ==');
const CTX = { email: 'mario.rossi@esempio.it', dispositivo: 'dev-abc123xyz', nomiFile: ['Appunti di Mario Rossi.pdf'] };
t('testo pulito → nessun problema', () => {
  const d = D.calcola({ stat: [stat('q1', 'B-2.2.1-1', 10, 2)], giorniEsame: 5 }, { materia: 'Biologia', step: '2.2', oggi: OGGI });
  eq(D.controllaPrivacy(D.regole(d).join('\n'), CTX), []);
});
t('email, parte locale dell\'email, id dispositivo, date, ore, nome file → bloccati', () => {
  const p = D.controllaPrivacy('scrivi a mario.rossi@esempio.it', CTX); vero(p.length >= 1 && /email/i.test(p[0]), JSON.stringify(p));
  vero(D.controllaPrivacy('ciao mario.rossi', CTX).length >= 1, 'parte locale');
  vero(D.controllaPrivacy('altra@posta.com', CTX).some(x => /email/i.test(x)), 'qualsiasi email');
  vero(D.controllaPrivacy('dispositivo dev-abc123xyz', CTX).length >= 1, 'id dispositivo');
  vero(D.controllaPrivacy('esame il 2026-12-03', CTX).some(x => /data/i.test(x)), 'data ISO');
  vero(D.controllaPrivacy('esame il 03/12/2026', CTX).some(x => /data/i.test(x)), 'data italiana');
  vero(D.controllaPrivacy('studia alle 22:30', CTX).some(x => /ora/i.test(x)), 'ora esatta');
  vero(D.controllaPrivacy('vedi Appunti di Mario Rossi.pdf', CTX).some(x => /file/i.test(x)), 'nome file');
  vero(D.controllaPrivacy('chiamami al +39 333 1234567', CTX).some(x => /telefono/i.test(x)), 'telefono');
});
t('numeri di step e pagine non sono falsi allarmi', () => {
  eq(D.controllaPrivacy('Sotto-step 2.2.1 e 3.10.4: pagine 120-135, livello L3, 18 domande', CTX), []);
  eq(D.controllaPrivacy('Smonta l\'idea sbagliata: si risponde spesso «1 000 000 000 di cellule» o «602 214 076 molecole».', CTX), [], 'numeri didattici con spazi');
  vero(D.controllaPrivacy('numero 333 1234567', CTX).some(x => /telefono/i.test(x)), 'cellulare senza prefisso');
});

// =====================================================================
console.log('\n== Aperte e codice (v0.64) ==');
const sicuroSbagliato = (g, h) => [{ ts: ora(g, h), corretto: false, certezza: 3, ms: 30000 }];
t('aperta/codice sicure e sbagliate non fanno illusione di competenza', () => {
  const xs = [stat('a1', 'B-2.2.1-1', 1, 0, { aperta: true, caso: 'illusione_competenza', log: sicuroSbagliato(10, 9) }),
    stat('a2', 'B-2.2.1-2', 1, 0, { aperta: true, tag: ['illusione_competenza'], log: sicuroSbagliato(10, 10) })];
  eq(D.calcola({ stat: xs }, { materia: 'Storia', step: '2.2', oggi: OGGI }).voci.filter(v => v.tipo === 'illusione').length, 0);
  const mcq = xs.map(x => ({ ...x, aperta: undefined }));
  eq(D.calcola({ stat: mcq }, { materia: 'Storia', step: '2.2', oggi: OGGI }).voci.filter(v => v.tipo === 'illusione').length, 1, 'le stesse mcq sì');
});
t('aperta/codice: le risposte scritte non diventano idee sbagliate (distrattori)', () => {
  const d = D.calcola({ stat: [stat('a1', 'B-2.2.1-1', 3, 0, { aperta: true, scelte: { 'def f(): pass': 3 } })] }, { materia: 'Info', step: '', oggi: OGGI });
  eq(d.voci.filter(v => v.tipo === 'confusione').length, 0);
});
t('aperta/codice: tentativi e tempi contano normalmente (debole e concentrazione)', () => {
  const d = D.calcola({ stat: [stat('a1', 'B-2.2.1-1', 6, 1, { aperta: true })] }, { materia: 'Storia', step: '2.2', oggi: OGGI });
  eq(d.voci.filter(v => v.tipo === 'debole').map(v => v.arg), ['2.2.1']); eq(d.tentativi, 6);
});

// =====================================================================
const fine = 'Dossier ' + ok + '/' + (ok + ko);
console.log('\n' + fine + (ko ? ' — ' + ko + ' falliti' : ''));
process.exit(ko ? 1 : 0);
