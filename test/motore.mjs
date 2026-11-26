// test/motore.mjs — motore unificato, blocco 4: test del modulo puro src/su-richiesta/07-motorestudio.ts
// (livelli lessicografici, obiettivi, preferenze, tempo al 90%, esclusi col motivo, varietà, durate apprese)
// e guardie statiche sugli agganci in app.js. Transpila al volo con typescript (mai dist/).
// Uso: node test/motore.mjs   (codice di uscita 1 se qualcosa fallisce; ultima riga «Motore N/N»)
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
vm.runInContext(ts.transpileModule(leggi('su-richiesta/07-motorestudio.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText + '\n;this.MotoreStudio = MotoreStudio;', sb);
const M = sb.MotoreStudio;
const TUTTI = { quiz: true, carte: true, appunti: true };
let n = 0;
const c = (livello, metodo, min = 10, extra = {}) => { const id = extra.id || 'c' + (++n); return { id, livello, ind: 0, metodo, min, motivo: 'm' + livello, voce: { tipo: 'scheda', titolo: id, sotto: '', min }, ...extra }; };
const ids = p => p.voci.filter(v => v.tipo !== 'pausa' && v.tipo !== 'richiamo').map(v => v.titolo);
const lavoro = p => p.voci.filter(v => v.tipo !== 'pausa' && v.tipo !== 'richiamo').reduce((s, v) => s + v.min, 0);

// ---------- livelli e spareggio ----------
t('livelli lessicografici: 1 prima di 2 … prima di 6, qualunque sia l\'ordine di arrivo', () => {
  const p = M.componi('ordinaria', 90, TUTTI, [c(6, 'quiz', 10, { id: 'L6' }), c(5, 'fonte', 10, { id: 'L5' }), c(1, 'quiz', 10, { id: 'L1' }), c(4, 'errori', 10, { id: 'L4' }), c(2, 'carte', 10, { id: 'L2' }), c(3, 'fonte', 10, { id: 'L3' })]);
  eq(ids(p), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
});
t('dentro il livello: indicatore decrescente, poi durata minore, poi id', () => {
  const p = M.componi('ordinaria', 90, TUTTI, [c(2, 'quiz', 10, { id: 'b', ind: 0.5 }), c(2, 'carte', 5, { id: 'z', ind: 0.5 }), c(2, 'appunto', 10, { id: 'a', ind: 0.5 }), c(2, 'quiz', 10, { id: 'top', ind: 0.9 })]);
  eq(ids(p), ['top', 'z', 'a', 'b']);
});
t('ordine deterministico: stessi candidati in ordine diverso → stessa sessione', () => {
  const l = [c(2, 'quiz', 10, { id: 'x', ind: 0.3 }), c(5, 'fonte', 10, { id: 'y' }), c(2, 'carte', 7, { id: 'w', ind: 0.3 }), c(4, 'errori', 10, { id: 'v' })];
  eq(ids(M.componi('ordinaria', 50, TUTTI, l)), ids(M.componi('ordinaria', 50, TUTTI, l.slice().reverse())));
});
t('duplicati per id: resta il livello più urgente', () => {
  const p = M.componi('ordinaria', 90, TUTTI, [c(4, 'errori', 10, { id: 'scheda:S1' }), c(2, 'quiz', 10, { id: 'scheda:S1' })]);
  eq(p.voci.filter(v => v.livello).map(v => v.livello), [2]);
});
t('ogni voce porta metodo, livello e motivo reale', () => {
  const v = M.componi('ordinaria', 25, TUTTI, [c(2, 'carte', 5, { motivo: '12 da ripassare' })]).voci[0];
  eq([v.metodo, v.livello, v.motivo], ['carte', 2, '12 da ripassare']);
});

// ---------- tempo ----------
t('lavoro massimo: 25 → 20, 50 → 40, 90 → 75 (pause e richiamo come margine), 10 → 9 (90%)', () => {
  const l = Array.from({ length: 200 }, () => c(5, 'carte', 1));
  eq([25, 50, 90, 10].map(m => lavoro(M.componi('ordinaria', m, TUTTI, l))), [20, 40, 75, 9]);
});
t('margine ≥ 10% del tempo in ogni sessione piena', () => {
  for (const d of [1, 4, 10, 15]) for (const m of [15, 25, 50, 90, 180]) {
    const p = M.componi('ordinaria', m, TUTTI, Array.from({ length: 200 }, () => c(5, 'fonte', d)));
    vero(lavoro(p) <= m * 0.9, m + ' min, attività da ' + d + ': ' + lavoro(p));
  }
});
t('25 min con attività da 10: due attività, non una (il margine non spreca metà sessione)', () => {
  eq(ids(M.componi('ordinaria', 25, TUTTI, [c(2, 'quiz'), c(5, 'diagnostico'), c(5, 'fonte')])).length, 2);
});
t('totale della sessione (pause e richiamo compresi) entro la durata scelta', () => {
  const l = Array.from({ length: 20 }, () => c(5, 'fonte'));
  for (const d of [1, 4, 10, 15]) for (const m of [15, 25, 50, 90, 180]) {
    const p = M.componi('ordinaria', m, TUTTI, Array.from({ length: 200 }, () => c(5, 'fonte', d))), tot = p.voci.reduce((s, v) => s + v.min, 0);
    vero(tot <= m && p.margine === m - tot, m + ' min, attività da ' + d + ': ' + tot);
  }
});
t('mai comprimere: un\'attività che non entra va negli esclusi intera, col motivo', () => {
  const p = M.componi('ordinaria', 25, TUTTI, [c(2, 'quiz', 15, { id: 'A' }), c(2, 'quiz', 15, { id: 'B' })]);
  eq(ids(p), ['A']); eq(p.voci[0].min, 15);
  vero(p.esclusi.some(x => x.titolo === 'B' && /non entra nel tempo \(15 min\)/.test(x.perche)), JSON.stringify(p.esclusi));
});
t('un\'attività più corta che entra dopo una esclusa viene presa (nessun buco inutile)', () => {
  const p = M.componi('ordinaria', 25, TUTTI, [c(2, 'quiz', 15, { id: 'A' }), c(2, 'quiz', 15, { id: 'B' }), c(6, 'carte', 3, { id: 'C' })]);
  eq(ids(p), ['A', 'C']);
});
t('richiamo finale da 5 min sempre ultimo da 15 min in su; niente sotto i 15', () => {
  eq(M.componi('ordinaria', 25, TUTTI, [c(2, 'quiz')]).voci.slice(-1)[0].tipo, 'richiamo');
  vero(!M.componi('auto', 10, TUTTI, [c(2, 'carte', 5)]).voci.some(v => v.tipo === 'richiamo'), '10 min: niente richiamo');
});
t('pause: nessuna a 25 min; a 50 min una ogni ~25 min di lavoro, mai in coda', () => {
  const l = Array.from({ length: 12 }, () => c(5, 'fonte'));
  eq(M.componi('ordinaria', 25, TUTTI, l).voci.filter(v => v.tipo === 'pausa').length, 0);
  const p = M.componi('ordinaria', 90, TUTTI, l), tipi = p.voci.map(v => v.tipo);
  vero(tipi.filter(x => x === 'pausa').length >= 2 && tipi[tipi.length - 2] !== 'pausa', tipi.join(','));
});
t('margine dichiarato = minuti − durata totale della sessione', () => {
  const p = M.componi('ordinaria', 50, TUTTI, [c(2, 'quiz', 10), c(2, 'quiz', 10)]);
  eq(p.margine, 50 - 20 - 5);   // 2 voci, nessuna pausa (non in coda), richiamo 5
});

// ---------- obiettivi ----------
t('auto: < 15 min = breve, altrimenti ordinaria', () => { eq(M.obiettivo('auto', 10), 'breve'); eq(M.obiettivo('auto', 15), 'ordinaria'); eq(M.obiettivo('consolidamento', 10), 'consolidamento'); });
t('breve: niente lettura (fonte) anche se c\'è tempo; carte e richiamo sì', () => {
  const p = M.componi('breve', 60, TUTTI, [c(3, 'fonte', 5, { id: 'leggi' }), c(2, 'carte', 5, { id: 'carte' })]);
  eq(ids(p), ['carte']); vero(p.esclusi.some(x => x.titolo === 'leggi' && /leggere/.test(x.perche)));
});
t('consolidamento: solo livelli 1, 2, 4, 6 (niente prerequisiti né contenuto nuovo)', () => {
  const p = M.componi('consolidamento', 90, TUTTI, [1, 2, 3, 4, 5, 6].map(l => c(l, l === 3 || l === 5 ? 'fonte' : 'quiz', 10, { id: 'L' + l })));
  eq(ids(p), ['L1', 'L2', 'L4', 'L6']);
  eq(p.esclusi.filter(x => /niente contenuto nuovo/.test(x.perche)).map(x => x.titolo), ['L3', 'L5']);
});

// ---------- preferenze ----------
t('metodo disattivato non compare mai (quiz spento toglie anche errori e prova a freddo)', () => {
  const p = M.componi('ordinaria', 90, { quiz: false, carte: true, appunti: true }, [c(1, 'quiz'), c(4, 'errori'), c(5, 'diagnostico'), c(2, 'carte', 5, { id: 'K' }), c(5, 'fonte', 10, { id: 'F' })]);
  eq(ids(p), ['K', 'F']); eq(p.esclusi.filter(x => x.perche === 'metodo disattivato').length, 3);
});
t('carte e appunti spenti; lettura e richiamo restano sempre', () => {
  const p = M.componi('ordinaria', 90, { quiz: true, carte: false, appunti: false }, [c(2, 'carte', 5), c(2, 'appunto', 4), c(2, 'richiamo', 10, { id: 'R' }), c(5, 'fonte', 10, { id: 'F' })]);
  eq(ids(p), ['R', 'F']);
});
t('preferenza per sessione: stessa lista, esito diverso solo per quella chiamata (nessuno stato interno)', () => {
  const l = [c(2, 'carte', 5, { id: 'K' }), c(2, 'quiz', 10, { id: 'Q' })];
  eq(ids(M.componi('ordinaria', 50, { quiz: true, carte: false, appunti: true }, l)), ['Q']);
  eq(ids(M.componi('ordinaria', 50, TUTTI, l)), ['K', 'Q']);
});

// ---------- tetti di prima (compatibilità) ----------
t('ripassi dei sotto-step ≤ ~40% del tempo; appunti al massimo 3', () => {
  const st = Array.from({ length: 6 }, () => c(2, 'quiz', 10, { gruppo: 'step' })), ap = Array.from({ length: 5 }, () => c(2, 'appunto', 4, { gruppo: 'appunti' }));
  const p = M.componi('ordinaria', 90, TUTTI, [...st, ...ap]);
  eq(p.voci.filter(v => v.metodo === 'quiz').length, 3, '40% di 90 = 36 → 3 ripassi da 10');
  eq(p.voci.filter(v => v.metodo === 'appunto').length, 3);
});

// ---------- varietà ----------
t('varietà: tre voci di fila con lo stesso metodo → si anticipa un\'alternativa dello stesso livello', () => {
  const p = M.componi('ordinaria', 90, TUTTI, [c(5, 'fonte', 10, { id: 'f1', ind: 9 }), c(5, 'fonte', 10, { id: 'f2', ind: 8 }), c(5, 'fonte', 10, { id: 'f3', ind: 7 }), c(5, 'diagnostico', 10, { id: 'd', ind: 1 })]);
  eq(ids(p), ['f1', 'f2', 'd', 'f3']);
});
t('varietà non scavalca i livelli', () => {
  const p = M.componi('ordinaria', 90, TUTTI, [c(2, 'quiz', 10, { id: 'q1' }), c(2, 'quiz', 10, { id: 'q2' }), c(2, 'quiz', 10, { id: 'q3' }), c(5, 'fonte', 10, { id: 'f' })]);
  eq(ids(p), ['q1', 'q2', 'q3', 'f']);
});

// ---------- durate apprese ----------
t('fattori: media mobile esponenziale α 0,3 dei rapporti osservati', () => {
  const f = M.fattori([{ metodo: 'carte', min: 5, sec: 600 }, { metodo: 'carte', min: 5, sec: 300 }]);
  eq(f.carte, 1.7);   // 2, poi 0,3·1 + 0,7·2 = 1,7
});
t('fattori limitati a [0,5; 2] e osservazioni senza secondi ignorate', () => {
  const f = M.fattori([{ metodo: 'quiz', min: 10, sec: 99999 }, { metodo: 'fonte', min: 10, sec: 1 }, { metodo: 'carte', min: 5, sec: 0 }]);
  eq([f.quiz, f.fonte, f.carte], [2, 0.5, undefined]);
});
t('le durate apprese cambiano la sessione (carte lente → meno spazio), mai sotto 1 min', () => {
  const l = [c(2, 'carte', 5, { id: 'K' }), c(2, 'quiz', 15, { id: 'Q' })];
  eq(ids(M.componi('ordinaria', 25, TUTTI, l)), ['K', 'Q'], 'senza storico: 5 + 15 = 20 entrano');
  const p = M.componi('ordinaria', 25, TUTTI, l, { carte: 2 });
  eq(p.voci.find(v => v.titolo === 'K').min, 10); eq(ids(p), ['K']);
  eq(M.componi('ordinaria', 25, TUTTI, [c(2, 'carte', 1)], { carte: 0.5 }).voci[0].min, 1);
});

// ---------- generalità e dati mancanti ----------
t('nessun candidato → solo il richiamo finale (dati mancanti ≠ inventare attività)', () => {
  const p = M.componi('auto', 50, TUTTI, []); eq(p.voci.map(v => v.tipo), ['richiamo']); eq(p.esclusi.length, 0);
});
t('nessuna costante di libro o materia nel motore (generalità)', () => {
  const s = leggi('su-richiesta/07-motorestudio.ts');
  vero(!/Fasano|Bettelheim|biologia|chimica|fisica|'[CBF]-/i.test(s), 'nomi di libri/materie nel motore');
});

// ---------- guardie statiche sugli agganci ----------
t('motore puro: niente Stato, DOM, storage o rete', () => {
  vero(!/\bStato\.|\bdocument\.|localStorage|fetch\(|innerHTML/.test(leggi('su-richiesta/07-motorestudio.ts')));
});
t('app.js tiene solo gli agganci: composizione e fogli nel chunk su richiesta', () => {
  const so = leggi('07-studiaora.ts'), ui = leggi('su-richiesta/07-studiaoraui.ts');
  vero(!/function componi|function adesso|function eseguiVoce|const StudiaOra =/.test(so), 'composizione rimasta in app.js');
  vero(/conStrumentiQuiz\(\(\) => StudiaOraUI\.scegli\(\)\)/.test(so) && /conStrumentiQuiz\(\(\) => StudiaOraUI\.sessione\(\)\)/.test(so), 'agganci');
  vero(/const StudiaOra = /.test(ui) && /MotoreStudio\.componi\(/.test(ui) && /CodaRipasso\.dovuti/.test(ui), 'StudiaOra nel chunk usa MotoreStudio e la coda unica');
});
t('sessione = record \'sessione\' sincronizzato; localStorage solo per la migrazione una tantum', () => {
  const ui = leggi('su-richiesta/07-studiaoraui.ts');
  vero(/type: 'sessione'/.test(ui) && /Stato\.salva\(s\)/.test(ui), 'record sessione');
  eq((ui.match(/localStorage\./g) || []).length, 2, 'solo getItem + removeItem della migrazione');
});
t('preferenze N5 in Impostazioni e migrazione carteDaErrori → carteAuto', () => {
  vero(/metodi\?: PrefMetodi; carteAuto\?: 'mai' \| 'proponi' \| 'auto'; suggerisciAppunti\?: boolean/.test(leggi('03-modello.ts')));
  vero(/carteDaErrori === false \? 'mai' : 'proponi'/.test(leggi('su-richiesta/07-studiaoraui.ts')));
  vero(/StudiaOraUI\.preferenze\(\)/.test(leggi('08-viste.ts')), 'voce in Impostazioni → Studio');
});

console.log('\nMotore ' + ok + '/' + (ok + ko));
process.exit(ko ? 1 : 0);
