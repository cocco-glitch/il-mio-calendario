// test/copertura.mjs — motore unificato, blocco 7: test del modulo puro src/su-richiesta/07-copertura.ts
// (doppioni, ripetizioni didattiche, argomenti mancanti) più il controllo sulla banca reale e le guardie statiche sull'aggancio.
// Uso: node test/copertura.mjs   (codice di uscita 1 se qualcosa fallisce; ultima riga «Copertura N/N»)
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
carica('07-locale.ts', 'Locale'); carica('su-richiesta/07-indicepagine.ts', 'IndicePagine'); carica('su-richiesta/07-copertura.ts', 'Copertura');
const C = sb.Copertura, L = { radice: sb.Locale.radice, espandi: sb.Locale.espandi };
const U = (uid, titolo, concettiChiave, pagine, fileId = 'F1') => ({ uid, titolo, concettiChiave, pagine, fileId });

// ---------- doppioni e ripetizioni ----------
t('doppione: stessi concetti e stesse pagine → proposta di unione', () => {
  const r = C.analizza([U('U1', 'Glicolisi', ['glicolisi', 'fosfofruttochinasi', 'resa ATP'], [130, 134]),
    U('U2', 'La glicolisi', ['glicolisi', 'resa ATP', 'fosfofruttochinasi'], [131, 134])], '', L);
  eq(r.duplicati.length, 1); eq(r.ripetizioni.length, 0); vero(/doppione/i.test(r.avvisi[0]), r.avvisi[0]);
});
t('ripetizione didattica: stessi concetti su pagine diverse → conservata, solo segnalata', () => {
  const r = C.analizza([U('U1', 'Osmosi (introduzione)', ['osmosi', 'pressione osmotica'], [20, 22]),
    U('U2', 'Osmosi (approfondimento)', ['osmosi', 'pressione osmotica'], [170, 175])], '', L);
  eq(r.duplicati.length, 0); eq(r.ripetizioni.length, 1); vero(/conservata/.test(r.avvisi[0]));
});
t('stesse pagine ma concetti diversi → nessun avviso (teoria e problemi dello stesso capitolo)', () => {
  const r = C.analizza([U('U1', 'Leggi dei gas', ['Boyle', 'Charles', 'Gay-Lussac'], [119, 123]),
    U('U2', 'Problemi di stechiometria dei gas', ['moli', 'volume molare', 'equazione di stato'], [119, 123])], '', L);
  eq(r.duplicati.length + r.ripetizioni.length, 0);
});
t('stesse pagine in FILE diversi non contano come sovrapposte', () => {
  eq(C.sovrapp(U('a', 'x', [], [10, 20], 'F1'), U('b', 'y', [], [10, 20], 'F2')), 0);
  eq(Math.round(C.sovrapp(U('a', 'x', [], [10, 20]), U('b', 'y', [], [15, 30])) * 100), 55);   // 6 pagine comuni su 11
});
t('jaccard: insiemi vuoti = 0, uguali = 1', () => { eq(C.jaccard(new Set(), new Set()), 0); eq(C.jaccard(new Set(['a', 'b']), new Set(['b', 'a'])), 1); });
t('senza concettiChiave (≤ 1) si confrontano titolo e concetti', () => {
  const r = C.analizza([U('U1', 'Ciclo di Krebs e acetil-CoA', [], [137, 139]), U('U2', 'Il ciclo di Krebs: acetil-CoA', ['Krebs'], [137, 139])], '', L);
  eq(r.duplicati.length, 1);
});

// ---------- lacune ----------
const STRUTTURA = ['F1 | Libro.pdf | 120-129 | Le leggi dei gas', 'F1 | Libro.pdf | 130-139 | Liquidi e solidi', 'F1 | Libro.pdf | 140-149 | Diagrammi di fase'].join('\n');
t('lacuna: voce della struttura senza unità né per pagine né per titolo → argomento mancante', () => {
  const r = C.analizza([U('U1', 'Gas ideali', ['Boyle', 'Charles'], [120, 128]), U('U2', 'Forze intermolecolari nei liquidi', ['liquidi', 'solidi'], [130, 136])], STRUTTURA, L);
  eq(r.voci, 3); eq(r.lacune.map(x => x.titolo), ['Diagrammi di fase']); vero(r.avvisi.some(a => /mancante.*Diagrammi di fase.*140–149/.test(a)), r.avvisi.join(' | '));
});
t('lacuna: la voce è coperta dal TITOLO di un\'unità anche senza pagine', () => {
  const r = C.analizza([U('U1', 'Gas', [], [120, 129]), U('U2', 'Liquidi e solidi', [], [130, 139]), { uid: 'U3', titolo: 'Diagrammi di fase dell\'acqua', concettiChiave: [] }], STRUTTURA, L);
  eq(r.lacune.length, 0);
});
t('lacuna: unità su un altro file non coprono per pagine', () => {
  const r = C.analizza([U('U1', 'Altro', [], [120, 149], 'F9')], STRUTTURA, L);
  eq(r.lacune.length, 3);
});
t('righe della struttura senza pagine («—») si giudicano solo dal titolo', () => {
  const v = C.voci('indice | Indice incollato | — | Equilibrio chimico');
  eq(v.length, 1); eq(v[0].pagine, undefined);
  eq(C.analizza([U('U1', 'Cinetica', [], [1, 5])], 'indice | Indice incollato | — | Equilibrio chimico', L).lacune.length, 1);
});
t('mappa dall\'indice locale (unità = voci) → 0 avvisi', () => {
  const unita = C.voci(STRUTTURA).map((v, i) => ({ uid: 'U' + (i + 1), titolo: v.titolo, concettiChiave: [], fileId: v.fileId, pagine: v.pagine }));
  eq(C.analizza(unita, STRUTTURA, L).avvisi, []);
});
t('al massimo 6 avvisi + riga col resto', () => {
  const s = Array.from({ length: 10 }, (_, i) => 'F1 | L | ' + (i * 10 + 1) + '-' + (i * 10 + 9) + ' | Argomento numero ' + ['alfa', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa'][i]).join('\n');
  const r = C.analizza([U('U1', 'Niente', [], [500, 510])], s, L);
  eq(r.avvisi.length, 7); vero(/altri 4/.test(r.avvisi[6]), r.avvisi[6]);
});
t('generalità: stesso comportamento su una materia mai vista (diritto)', () => {
  const r = C.analizza([U('U1', 'Fonti del diritto', ['Costituzione', 'legge ordinaria', 'regolamenti'], [1, 10]),
    U('U2', 'Le fonti del diritto', ['legge ordinaria', 'Costituzione', 'regolamenti'], [3, 10])],
    'F1 | Manuale | 1-10 | Le fonti del diritto\nF1 | Manuale | 11-20 | Il contratto', L);
  eq(r.duplicati.length, 1); eq(r.lacune.map(x => x.titolo), ['Il contratto']);
});

// ---------- banca reale: controllo dei falsi positivi ----------
t('banca reale (217 schede): 0 doppioni alle soglie dell\'audit', () => {
  const dir = path.join(QUI, '..', 'studio', 'banca'), unita = [];
  for (const f of ['banca-step-2.json', 'banca-step-3.json']) {
    const b = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const [id, s] of Object.entries(b.schede)) {
      const m = /pp?\.\s*(\d+)(?:\s*[-–]\s*(\d+))?/.exec(s.fonti || '');
      unita.push({ uid: id, titolo: s.titolo, concettiChiave: String(s.focus || '').split(',').map(x => x.trim()).filter(Boolean), fileId: s.materia, pagine: m ? [+m[1], +(m[2] || m[1])] : undefined });
    }
  }
  vero(unita.length >= 200, 'schede ' + unita.length);
  const r = C.coppie(unita, L);
  eq(r.duplicati.length, 0, 'doppioni: ' + r.duplicati.map(d => d.titoloA + ' ~ ' + d.titoloB).join('; '));
});

// ---------- guardie statiche ----------
t('aggancio in PianiAI: solo con la mappa AI, dentro try, mai bloccante; Ricalcola conserva gli avvisi', () => {
  const s = leggi('07-pianiai.ts');
  vero(/r\.fonte === 'ai' && r\.struttura/.test(s) && /Copertura\.analizza\(r\.piano\.unita, r\.struttura/.test(s));
  vero(/catch \(e: any\) \{ console\.warn\('Copertura non calcolata/.test(s));
  vero(/r\.piano\.avvisiCopertura = p\.avvisiCopertura/.test(s));
});
t('modulo puro: niente DOM, Stato, rete', () => {
  const s = leggi('su-richiesta/07-copertura.ts');
  vero(!/document\.|Stato\.|fetch\(|localStorage/.test(s));
});

console.log('\nCopertura ' + ok + '/' + (ok + ko));
if (ko) process.exit(1);
