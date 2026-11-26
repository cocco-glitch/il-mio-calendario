// test/finequiz.mjs — motore unificato, blocco 5 (N4): test del modulo puro src/su-richiesta/07-finequiz.ts
// (candidati per domanda, tipo di carta dal tipo di errore, preferenze mai/proponi/auto, «Lascia decidere all'app»,
// modello Cornell) e guardie statiche sugli agganci in app.js. Transpila al volo con typescript (mai dist/).
// Uso: node test/finequiz.mjs   (codice di uscita 1 se qualcosa fallisce; ultima riga «FineQuiz N/N»)
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
vm.runInContext(ts.transpileModule(leggi('su-richiesta/07-finequiz.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText + '\n;this.FineQuiz = FineQuiz;', sb);
const F = sb.FineQuiz;
const PROPONI = { carte: true, appunti: true, suggerisci: true, carteAuto: 'proponi' };
const ill = (n, extra = {}) => ({ id: 'q' + n, q: 'Domanda ' + n + '?', giusta: 'Giusta ' + n, spieg: 'Spiegazione ' + n, ok: false, caso: 'illusione_competenza', scelta: 'Distrattore ' + n, perche: 'confonde A con B', ...extra });
const err = (n, extra = {}) => ({ id: 'q' + n, q: 'Domanda ' + n + '?', giusta: 'Giusta ' + n, spieg: 'Spiegazione ' + n, ok: false, caso: 'standard', ...extra });
const fort = (n, extra = {}) => ({ id: 'q' + n, q: 'Domanda ' + n + '?', giusta: 'Giusta ' + n, spieg: 'Spiegazione ' + n, ok: true, caso: 'lucky_guess', ...extra });
const giusta = n => ({ id: 'q' + n, q: 'Domanda ' + n + '?', giusta: 'Giusta ' + n, ok: true, caso: 'padronanza' });

// ---------- candidati ----------
t('le risposte giuste e sicure non generano nulla; solo giuste → solido, nessun foglio', () => {
  const p = F.proposta([giusta(1), giusta(2)], 100, PROPONI);
  vero(p.solido && !p.mostra && p.candidati.length === 0, JSON.stringify(p));
});
t('ordine: illusioni, poi errori, poi fortunate (dentro il tipo, l\'ordine del quiz)', () => {
  const c = F.candidati([fort(1), err(2), ill(3), err(4), ill(5)]);
  eq(c.map(x => x.qid), ['q3', 'q5', 'q2', 'q4', 'q1']);
  eq(c.map(x => x.tipo), ['illusione', 'illusione', 'errore', 'errore', 'fortunata']);
});
t('una domanda = una carta: la stessa domanda due volte (spazi/maiuscole diverse) non duplica', () => {
  eq(F.candidati([err(1), err(1, { q: '  domanda 1? ' })]).length, 1);
});
t('domanda senza risposta giusta: scartata (una carta vuota non si ripassa)', () => {
  eq(F.candidati([err(1, { giusta: '' })]).length, 0);
});
// ---------- tipo di carta ----------
t('illusione con distrattore scelto → carta comparativa «Perché X e non Y?» con la confutazione', () => {
  const [c] = F.candidati([ill(1)]);
  vero(/Perché «Giusta 1» e non «Distrattore 1»\?$/.test(c.f), c.f);
  vero(c.r.startsWith('Giusta 1') && c.r.includes('Perché «Distrattore 1» non va: confonde A con B'), c.r);
  eq(c.motivo, 'eri certo ma era sbagliata');
});
t('illusione senza distrattore (risposta aperta) → domanda → risposta + spiegazione', () => {
  const [c] = F.candidati([ill(1, { scelta: undefined, perche: undefined })]);
  eq([c.f, c.r], ['Domanda 1?', 'Giusta 1\n\nSpiegazione 1']);
});
t('errore semplice → domanda → risposta + spiegazione breve (≤ 300 caratteri, taglio sulla parola)', () => {
  const lunga = ('parola ').repeat(100);
  const [c] = F.candidati([err(1, { spieg: lunga })]);
  const sp = c.r.split('\n\n')[1];
  vero(sp.length <= 300 && sp.endsWith('…') && !/\s…$/.test(sp), sp.length + ' ' + sp.slice(-12));
});
t('fortunata → carta da fissare, motivo dichiarato', () => {
  const [c] = F.candidati([fort(1)]);
  eq([c.tipo, c.motivo], ['fortunata', 'giusta tirando a indovinare: da fissare']);
});
// ---------- preferenze ----------
t("carteAuto 'proponi': il foglio offre carte, blocco note ed entrambi", () => {
  eq(F.proposta([err(1)], 90, PROPONI).opzioni, ['carte', 'nota', 'entrambi']);
});
t("carteAuto 'mai': nessuna opzione carte; resta il blocco note", () => {
  const p = F.proposta([err(1)], 90, { ...PROPONI, carteAuto: 'mai' });
  eq(p.opzioni, ['nota']); vero(p.mostra);
});
t("carteAuto 'mai' e appunti spenti: niente foglio", () => {
  vero(!F.proposta([err(1)], 90, { ...PROPONI, carteAuto: 'mai', appunti: false }).mostra);
});
t('metodo flashcard spento nelle preferenze: mai proposto, anche con carteAuto proponi', () => {
  eq(F.proposta([ill(1)], 90, { ...PROPONI, carte: false }).opzioni, ['nota']);
});
t("carteAuto 'auto': al massimo 5 carte, nell'ordine dei candidati; foglio solo se serve il blocco note", () => {
  const det = [ill(1), err(2), err(3), err(4), fort(5), fort(6), fort(7)];
  const p = F.proposta(det, 70, { ...PROPONI, carteAuto: 'auto' });
  eq(F.automatiche(p).map(c => c.qid), ['q1', 'q2', 'q3', 'q4', 'q5']);
  vero(!p.mostra, 'pochi errori: in auto niente foglio');
  const q = F.proposta([1, 2, 3, 4, 5, 6].map(n => err(n)), 40, { ...PROPONI, carteAuto: 'auto' });
  vero(q.mostra && q.opzioni.join() === 'nota', 'lacuna ampia: in auto si propone solo il blocco note');
});
t('carte già esistenti: escluse dalle nuove e contate (niente doppioni)', () => {
  const p = F.proposta([err(1), err(2)], 80, PROPONI, q => q === 'Domanda 1?');
  eq([p.nuove.map(c => c.qid), p.gia], [['q2'], 1]);
  const tutte = F.proposta([err(1)], 80, PROPONI, () => true);
  eq(tutte.opzioni, ['nota'], 'tutte già esistenti: niente opzione carte');
});
t('solo fortunate (tutte giuste a intuito): carte sì, blocco note no (non c\'è nulla da correggere)', () => {
  eq(F.proposta([fort(1)], 100, PROPONI).opzioni, ['carte']);
});
// ---------- «Lascia decidere all'app» ----------
t('pochi errori puntuali → carte mirate, con il perché', () => {
  const p = F.proposta([err(1), ill(2)], 80, PROPONI);
  eq(p.consiglio, 'carte'); vero(/2 carte mirate bastano/.test(p.perche), p.perche);
});
t('lacuna ampia (≥ 6 errori) senza illusioni → blocco note', () => {
  const p = F.proposta([1, 2, 3, 4, 5, 6].map(n => err(n)), 70, PROPONI);
  vero(p.lacuna && p.consiglio === 'nota', JSON.stringify([p.lacuna, p.consiglio]));
});
t('lacuna ampia (< 60%) con illusioni → entrambi', () => {
  const p = F.proposta([ill(1), err(2)], 50, PROPONI);
  eq(p.consiglio, 'entrambi');
});
t('suggerisciAppunti spento: l\'app non sceglie mai il blocco note da sola (ma resta tra le opzioni)', () => {
  const p = F.proposta([1, 2, 3, 4, 5, 6].map(n => err(n)), 40, { ...PROPONI, suggerisci: false });
  eq([p.consiglio, p.opzioni.includes('nota')], ['carte', true]);
});
t('tempi dichiarati: carte 0,5 min/carta (minimo 1), blocco note 5, entrambi la somma', () => {
  const p = F.proposta([1, 2, 3].map(n => err(n)), 80, PROPONI);
  eq(p.min, { carte: 2, nota: 5, entrambi: 7 });
});
// ---------- modello Cornell ----------
t('Cornell: errori e correzioni, distrattore che aveva convinto, richiamo, sezione vuota per lo studente', () => {
  const s = F.cornell([ill(1), err(2), fort(3)]);
  vero(/^## Errori e correzioni$/m.test(s) && /^- Domanda 1\?$/m.test(s) && /Corretta: Giusta 2\. Spiegazione 2/.test(s), s);
  vero(/Mi aveva convinto «Distrattore 1»: confonde A con B/.test(s), 'distrattore');
  vero(/^## Da richiamare senza guardare$/m.test(s) && /perché la risposta è «Giusta 3»\?$/m.test(s), 'richiamo');
  vero(/## Con parole mie\n*$/.test(s), 'sezione finale vuota');
});
t('Cornell: niente «::» né «{{}}» (l\'appunto non genera carte doppie); domanda senza «?» diventa spunto', () => {
  const s = F.cornell([err(1, { q: 'Definisci la mole', giusta: 'a :: b {{c}}', spieg: 'x::y' })]);
  vero(!/::|\{\{/.test(s), s); vero(/^- Definisci la mole — perché\?$/m.test(s), s);
});
// ---------- agganci (guardie statiche) ----------
t('Domande.registra non crea più carte da tutti gli errori aperti', () => {
  const s = leggi('07-domande.ts'), reg = s.slice(s.indexOf('function registra'), s.indexOf('/** Aperte'));
  vero(!/Carte\.daErrori/.test(reg), 'daErrori ancora in registra');
});
t('Carte.daErrori rispetta carteAuto (mai) e migra carteDaErrori === false; il pulsante manuale forza', () => {
  const s = leggi('07-carte.ts');
  vero(/!forza && \(i\.carteAuto === 'mai' \|\| \(!i\.carteAuto && i\.carteDaErrori === false\)\)/.test(s));
  vero(/Carte\.daErrori\(Domande\.aperte\(\), true\)/.test(leggi('07-domande.ts')));
});
t('Cattura.salva: aggancio al chunk solo per quiz interi con dettagli o carteAuto auto; annulli aggiunti eseguiti', () => {
  const s = leggi('07-cattura.ts');
  vero(/FineQuizUI\.dopo\(id, d, f => \{ dopo\.push\(f\); \}\)/.test(s) && /for \(const f of dopo\) f\(\);/.test(s));
  vero(s.indexOf('FineQuizUI.dopo') > s.indexOf('if (d.errori)'), 'non per «Rifai solo gli errori»');
});
t('QuizApp: dettagli anche dai quiz creati (qcreato), esclusi solo gli esercizi a numeri; con caso, distrattore e confutazione', () => {
  const s = leggi('07-quizapp.ts');
  // blocco 6: tutte le risposte (anche giuste) per la padronanza per concetto; FineQuiz filtra da sé i candidati
  vero(/r\.dettagli = P\.filter\(x => !x\.d\.gen && x\.ok != null\)/.test(s));
  vero(/'mz-err-' \+ \(t \? t\.k : Stato\.prendi<Rec>\(schedaId\)\?\.type === 'qcreato' \? 'qc' : 'sim'\)/.test(leggi('07-carte.ts')), 'mazzo errori dei quiz creati');
  vero(/scelta: x\.d\.o!\[oi\], perche: ewDi\(x\.d\)\[oi - 1\]/.test(s));
});
t('Appunto.origine e Carta.origine/concetto: campi solo facoltativi (schemaVersion retrocompatibile)', () => {
  vero(/origine\?: \{ tipo: 'quiz'; scheda: string; concetti: string\[\] \}/.test(leggi('07-appunti.ts')));
  vero(/concetto\?: string; origine\?: \{ domande: string\[\] \}/.test(leggi('07-carte.ts')));
});
t('il foglio vive nel chunk su richiesta, non in app.js', () => {
  vero(fs.existsSync(path.join(SRC, 'su-richiesta/07-finequizui.ts')) && !fs.readdirSync(SRC).some(f => /finequiz/i.test(f)));
});

// ---------- blocco 6: carte per concetto ----------
const con = (k, ripiego = false) => ({ chiave: 'B-1|' + k, etichetta: 'Concetto ' + k, ripiego });
t('una carta per concetto: 3 domande sullo stesso concetto → 1 candidato, rappresentato dalla peggiore, con tutte le domande', () => {
  const c = F.candidati([err(1, { con: con('a') }), ill(2, { con: con('a') }), fort(3, { con: con('a') }), err(4, { con: con('b') })]);
  eq(c.map(x => [x.qid, x.tipo, x.chiave, x.qids]), [['q2', 'illusione', 'B-1|a', ['q2', 'q1', 'q3']], ['q4', 'errore', 'B-1|b', ['q4']]]);
  vero(/Perché «Giusta 2» e non «Distrattore 2»/.test(c[0].f), 'l\'illusione dà la carta comparativa');
});
t('ripiego (concetto non distinto): resta una carta per domanda, senza chiave', () => {
  const c = F.candidati([err(1, { con: con('*', true) }), err(2, { con: con('*', true) })]);
  eq(c.map(x => [x.qid, x.chiave || null]), [['q1', null], ['q2', null]]);
});
t('gli errori si contano per domanda (lacuna), le carte per concetto', () => {
  const p = F.proposta([1, 2, 3, 4, 5, 6].map(n => err(n, { con: con('a') })), 70, PROPONI);
  eq([p.conta.errore, p.candidati.length, p.lacuna, p.consiglio], [6, 1, true, 'nota']);
});
t('esiste() riceve anche il candidato: la carta del concetto già presente non si duplica', () => {
  const p = F.proposta([err(1, { con: con('a') }), err(2, { con: con('b') })], 80, PROPONI, (q, c) => c.chiave === 'B-1|a');
  eq([p.nuove.map(c => c.chiave), p.gia], [['B-1|b'], 1]);
});
const imp = s => 'h' + s.length;   // impronta finta: basta che sia deterministica
const carta0 = { id: 'cr-x', type: 'carta', updatedAt: 0, mazzo: 'm', f: 'Domanda 1?', r: 'Giusta 1', tipo: 'base', tag: 'errore', origine: { domande: ['q1'] } };
t('unisci: domande nuove in origine; nulla da cambiare → null', () => {
  const [c] = F.candidati([err(1, { con: con('a') }), err(5, { con: con('a') })]);
  const u = F.unisci({ ...carta0, gen: imp('Domanda 1?\nGiusta 1') }, c, imp);
  eq([u.origine.domande, u.f, u.concetto], [['q1', 'q5'], 'Domanda 1?', 'Concetto a']);
  eq(F.unisci(u, c, imp), null);
});
t('unisci: dopo un\'illusione la carta intatta diventa comparativa; testo modificato dall\'utente o carta senza impronta: mai toccato', () => {
  const [c] = F.candidati([ill(2, { con: con('a') })]);
  const u = F.unisci({ ...carta0, gen: imp('Domanda 1?\nGiusta 1') }, c, imp);
  vero(u.tag === 'illusione' && /Perché «Giusta 2»/.test(u.f) && u.gen === imp(u.f + '\n' + u.r), JSON.stringify(u));
  const mod = F.unisci({ ...carta0, r: 'Mia risposta riscritta', gen: imp('Domanda 1?\nGiusta 1') }, c, imp);
  eq([mod.f, mod.r, mod.tag, mod.origine.domande], ['Domanda 1?', 'Mia risposta riscritta', 'errore', ['q1', 'q2']]);
  eq(F.unisci({ ...carta0 }, c, imp).f, 'Domanda 1?');
});
t('Cornell con i concetti: ogni domanda sbagliata resta nell\'appunto, anche se le carte sono una per concetto', () => {
  const s = F.cornell([err(1, { con: con('a') }), err(2, { con: con('a') })]);
  vero(/Domanda 1\?/.test(s) && /Domanda 2\?/.test(s), s);
});
t('Carte.daErrori: id dal concetto quando c\'è la chiave, impronta del testo generato salvata', () => {
  const s = leggi('07-carte.ts');
  vero(/const idErrore = \(idM: string, q: string, chiave\?: string\) => 'cr-' \+ hash\(idM \+ '\|' \+ \(chiave \? 'con\|' \+ chiave : norm\(q\)\)\)/.test(s));
  vero(/gen: hash\(f \+ '\\n' \+ r\)/.test(s), 'impronta');
});

console.log('\nFineQuiz ' + ok + '/' + (ok + ko));
process.exit(ko ? 1 : 0);
