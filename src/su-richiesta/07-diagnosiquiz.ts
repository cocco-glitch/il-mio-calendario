// =====================================================================
// 07-diagnosiquiz.ts — v0.59.2: diagnostica dei quiz generati da un'AI esterna (Gemini) — MODULO PURO
// Porting in-app dello strumento «Diagnostica quiz» (artifact Sonnet), con alcune rifiniture:
//  - legge anche una chat incollata intera (più blocchi ```json) e ripara le virgole finali;
//  - controlla che la lettera di «RISPOSTA ESATTA: X)» nella spiegazione coincida con `esatta`;
//  - segnala 3 risposte esatte di fila nella stessa posizione dentro una scheda;
//  - controlla che la citazione [[…]] della spiegazione sia coerente con `fonte`;
//  - «corretta più lunga» per singola domanda è solo informativa: l'errore scatta sull'insieme (> 25%);
//  - conta le domande «pronte all'import» (nessun errore bloccante).
// Nessun DOM, nessuno stato: tutto è testato nella suite Node. La UI è in 07-strumentiquiz.ts.
// Sta in src/su-richiesta/: finisce in strumenti-quiz.js, caricato al primo uso (vedi conStrumentiQuiz).
// =====================================================================
type SevQ = 'err' | 'warn' | 'info';
type DomQ = Record<string, unknown>;
interface ProblemaQ { sev: SevQ; id: string; msg: string; }
interface SchedaQ { nome: string; n: number; lv: number[]; es: number[]; }
interface AnalisiQ { problemi: ProblemaQ[]; n: number; lv: number[]; es: number[]; lunga: number; schede: SchedaQ[]; gemelle: number; pronte: number; }
interface LetturaQ { quiz: DomQ[]; parti: string[]; chiusura: DomQ | null; errori: string[]; riparato: boolean; blocchi: number; }
interface PianoRigaQ { lv: number; es: number; }

const DiagnosiQuiz = (() => {
  const CHIAVI = CHIAVI_QUIZ;
  const PER_SCHEDA = 18;
  const LV_TARGET = [25, 35, 25, 15];
  const RANGE_SCHEDA: Array<[number, number]> = [[4, 5], [6, 7], [4, 5], [2, 3]];
  const LETTERE = 'ABCD';
  const oggetto = (v: unknown): v is DomQ => !!v && typeof v === 'object' && !Array.isArray(v);
  const testo = (v: unknown) => typeof v === 'string' ? v : '';

  // ---------- lettura ----------
  /** Toglie le virgole finali prima di } o ] (fuori dalle stringhe). */
  function riparaVirgole(s: string): string {
    let out = '', str = false, esc = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (str) { out += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
      if (c === '"') { str = true; out += c; continue; }
      if (c === ',') { let j = i + 1; while (j < s.length && /\s/.test(s[j])) j++; if (s[j] === '}' || s[j] === ']') continue; }
      out += c;
    }
    return out;
  }
  function blocchiDi(t: string): string[] {
    const re = /```[a-zA-Z]*\s*\n?([\s\S]*?)```/g, out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) if (m[1].trim()) out.push(m[1].trim());
    return out.length ? out : [t.trim()];
  }
  /** Accetta: JSON grezzo, una chat incollata con più blocchi ```json, un array, {quiz}, {parte, quiz}, il file di chiusura. */
  function leggi(t: string): LetturaQ {
    const r: LetturaQ = { quiz: [], parti: [], chiusura: null, errori: [], riparato: false, blocchi: 0 };
    const pulito = String(t || '').replace(/^﻿/, '').trim();
    if (!pulito) { r.errori.push('Il testo è vuoto.'); return r; }
    blocchiDi(pulito).forEach((b, k) => {
      let d: unknown;
      try { d = JSON.parse(b); } catch (e) {
        try { d = JSON.parse(riparaVirgole(b)); r.riparato = true; } catch (_e2) { r.errori.push('Blocco ' + (k + 1) + ': JSON non valido (' + (e instanceof Error ? e.message : String(e)) + ').'); return; }
      }
      r.blocchi++;
      if (Array.isArray(d)) { r.quiz.push(...d.filter(oggetto)); return; }
      if (!oggetto(d)) { r.errori.push('Blocco ' + (k + 1) + ': formato non riconosciuto.'); return; }
      if (Array.isArray(d.quiz)) { r.quiz.push(...(d.quiz as unknown[]).filter(oggetto)); if (testo(d.parte)) r.parti.push(testo(d.parte)); }
      if (oggetto(d.meta) && oggetto(d.programmaCalendario)) r.chiusura = d;
      else if (!Array.isArray(d.quiz)) r.errori.push('Blocco ' + (k + 1) + ': cerco un elenco di domande o un oggetto con la chiave "quiz".');
    });
    return r;
  }

  // ---------- spiegazione a sezioni ----------
  /** Sezioni del master prompt: la funzione sta nel pacchetto principale (07-sezionispiegazione.ts). */
  const sezioni = (sp: string) => sezioniSpiegazione(sp);
  const letteraDichiarata = (sp: string) => Validatore.letteraDichiarata(sp);
  const citazioni = (x: string) => Validatore.citazioni(x);

  // ---------- analisi ----------
  /** La diagnostica sta nel Validatore unico (07-validatore.ts): qui resta l'API di v0.59. */
  const analizza = (qs: unknown[]): AnalisiQ => Validatore.analizza(qs);

  // ---------- consigli (cosa fare + perché) ----------
  const CONSIGLI: Array<[RegExp, (m: RegExpMatchArray) => [string, string]]> = [
    [/^chiave mancante: (.+)/, m => ['Aggiungi la chiave «' + m[1] + '» con un valore del tipo corretto.', 'L\'import scarta gli oggetti incompleti.']],
    [/^chiave in più: (.+)/, m => ['Rimuovi la chiave «' + m[1] + '»: non fa parte del formato.', 'Il formato è fisso; chiavi estranee confondono l\'import.']],
    [/ID duplicato/, () => ['Assegna un ID univoco materia-x.y-NNN senza riusare numeri già presenti.', 'Con un ID duplicato una domanda sovrascrive l\'altra.']],
    [/livelloCognitivo deve essere/, () => ['Scrivi livelloCognitivo come numero da 1 a 4, senza virgolette.', 'Serve all\'interleaving per livello di Bloom.']],
    [/non coincide con livelloCognitivo/, () => ['Allinea «livello» a «livelloCognitivo» (3 → "L3").', 'Altrimenti i conteggi per livello sono sbagliati.']],
    [/domanda mancante/, () => ['Scrivi un testo di domanda completo.', 'Senza testo la domanda non è utilizzabile.']],
    [/tutte\/nessuna delle precedenti/, () => ['Elimina «tutte/nessuna delle precedenti» da domanda e opzioni.', 'Si risponde per esclusione senza conoscere il contenuto.']],
    [/4 opzioni testuali/, () => ['Porta le opzioni a esattamente 4 stringhe non vuote.', 'L\'app usa 4 opzioni e l\'indice di «esatta».']],
    [/opzioni duplicate/, () => ['Rendi le 4 opzioni distinte.', 'Opzioni uguali rendono la domanda ambigua.']],
    [/esatta deve essere/, () => ['Imposta «esatta» come intero 0–3 (posizione della risposta giusta).', 'L\'app legge opzioni[esatta] come corretta.']],
    [/RISPOSTA ESATTA: /, () => ['Allinea la lettera in «RISPOSTA ESATTA» a «esatta» (0=A … 3=D), o correggi «esatta» se è lei a essere sbagliata.', 'Una delle due è sbagliata: lo studente vedrebbe la soluzione contraddetta.']],
    [/la più lunga/, () => ['Accorcia la corretta o arricchisci i distrattori, senza cambiare il significato.', 'Altrimenti si impara a scegliere la risposta più lunga.']],
    [/contenuto in un distrattore/, () => ['Riformula il distrattore perché non contenga il testo della corretta.', 'Avresti due risposte difendibili.']],
    [/molto più corta/, () => ['Porta la corretta a una lunghezza simile ai distrattori.', 'Una corretta molto più corta si riconosce a colpo d\'occhio.']],
    [/confutazioni duplicate/, () => ['Scrivi una confutazione diversa per ciascun distrattore.', 'Ogni distrattore nasce da un errore diverso.']],
    [/spiegazioneDistrattori/, () => ['Scrivi 3 confutazioni, una per distrattore, nell\'ordine delle opzioni saltando la corretta.', 'È il feedback «Perché la tua risposta è sbagliata».']],
    [/distractorTypes/, () => ['Fornisci 3 etichette di tipo di errore, nello stesso ordine delle confutazioni.', 'Classificano gli errori dello studente.']],
    [/erroreTipico/, () => ['Scrivi in una frase l\'errore di ragionamento che la domanda intercetta.', 'L\'app lo mostra quando sbagli.']],
    [/spiegazione mancante/, () => ['Scrivi la spiegazione con COSA CHIEDE / CONCETTO E MECCANISMO / RISPOSTA ESATTA / PERCHÉ GLI ALTRI NO / IN SINTESI e [[Manuale, p. X]].', 'È ciò che si studia dopo la risposta.']],
    [/spiegazione corta/, () => ['Amplia la spiegazione ad almeno 600 caratteri (meccanismo e confronto coi distrattori).', 'Una spiegazione breve non insegna il perché.']],
    [/manca la citazione/, () => ['Aggiungi in fondo [[Manuale, p. X]] con la pagina reale del libro cartaceo.', 'Senza fonte non si può ricontrollare.']],
    [/non coincide con fonte/, () => ['Rendi la citazione [[…]] della spiegazione coerente con «fonte».', 'Fonte e spiegazione devono rimandare alle stesse pagine.']],
    [/fonte mancante/, () => ['Compila «fonte» con manuale e pagina reale (e copia in sourceRef).', 'Ogni risposta deve essere verificabile.']],
    [/da verificare/, () => ['Sostituisci con una pagina reale controllata sul PDF.', 'Una fonte non verificata è un rischio di errore.']],
    [/sourceRef diverso/, () => ['Imposta sourceRef uguale a fonte.', 'Le due chiavi devono coincidere.']],
    [/^citazione p\. /, () => ['Cerca sul libro la pagina reale che contiene questi concetti e correggi la pagina in fonte, sourceRef e [[…]] della spiegazione.', 'Il controllo sul testo del PDF non ha trovato i concetti della domanda sulla pagina citata né su quelle accanto.']],
    [/stanno nella stessa scheda/, () => ['Sposta un membro della coppia gemella in un\'altra scheda.', 'La coppia serve a ripetere il concetto a distanza.']],
    [/ha (\d+) domande invece di/, m => ['Porta la scheda a ' + PER_SCHEDA + ' domande (ora ' + m[1] + ').', 'Ignoralo se hai caricato solo una parte del file.']],
    [/livello L(\d): (\d+) domande \(atteso (.+)\)/, m => ['Riequilibra: L' + m[1] + ' ha ' + m[2] + ' domande, atteso ' + m[3] + '.', 'Il mix 25/35/25/15 garantisce progressione.']],
    [/meno di 3 posizioni|per 3 domande di fila/, () => ['Ridistribuisci la posizione della corretta (aggiorna «esatta» e l\'ordine delle confutazioni).', 'Posizioni ripetute rendono la risposta prevedibile.']],
    [/nel (\d+)% dei casi \(massimo 25%\)/, () => ['Riscrivi le opzioni delle domande segnate «la più lunga».', 'Vedi la regola sulla lunghezza.']],
    [/esatta=(\d) nel/, m => ['Sposta la corretta dalla posizione ' + m[1] + ' in alcune domande.', 'Le 4 posizioni vanno usate in modo omogeneo.']],
    [/^L(\d) al/, m => ['Riequilibra la quota di domande L' + m[1] + '.', 'Il mix di livelli deve rispettare le percentuali.']],
  ];
  function consiglio(msg: string): [string, string] {
    for (const [re, fn] of CONSIGLI) { const m = msg.match(re); if (m) return fn(m); }
    return ['Correggi secondo il formato di riferimento.', 'Regola del formato non rispettata.'];
  }

  // ---------- correzioni automatiche e patch ----------
  /** Correzioni sicure: le fa il Validatore (07-validatore.ts). */
  const autoFix = (qs: unknown[]) => Validatore.ripara(qs);

  /** Legge la risposta di Gemini alla correzione chirurgica: array, righe JSON, {quiz}, {patch}, oggetto per id. */
  function leggiPatch(t: string): { patch: DomQ[] } | { errore: string } {
    let s = String(t || '').trim();
    if (!s) return { errore: 'Il riquadro è vuoto.' };
    const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) s = m[1].trim();
    let d: unknown;
    try { d = JSON.parse(riparaVirgole(s)); } catch (e) {
      try { d = s.split(/\n+/).map(l => l.trim().replace(/,$/, '')).filter(l => l && l !== '[' && l !== ']').map(l => JSON.parse(l) as unknown); }
      catch (_e2) { return { errore: 'JSON non valido: ' + (e instanceof Error ? e.message : String(e)) }; }
    }
    if (oggetto(d) && Array.isArray(d.quiz)) d = d.quiz;
    if (oggetto(d) && Array.isArray(d.patch)) d = d.patch;
    if (oggetto(d)) { const o = d; d = o.id !== undefined ? [o] : Object.keys(o).map(k => ({ id: k, ...(oggetto(o[k]) ? o[k] as DomQ : {}) })); }
    if (!Array.isArray(d)) return { errore: 'Non trovo un elenco di patch (serve un array di oggetti con «id»).' };
    return { patch: d.filter(oggetto) };
  }
  const valoreValido = (k: string, v: unknown) => k === 'opzioni' ? Array.isArray(v) && v.length === 4 && v.every(x => typeof x === 'string' && x.trim())
    : k === 'spiegazioneDistrattori' || k === 'distractorTypes' ? Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'string' && x.trim())
    : k === 'esatta' ? Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 3
    : k === 'livelloCognitivo' ? Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 4
    : ['domanda', 'spiegazione', 'fonte', 'sourceRef', 'erroreTipico', 'livello'].includes(k) ? typeof v === 'string' && !!v.trim() : true;
  /** Applica per id soltanto i campi autorizzati dal piano; una violazione rifiuta l'intera patch. */
  function applicaPatch(qs: unknown[], patch: DomQ[], autorizzate?: Record<string, string[]>): { qs: unknown[]; log: string[]; mancanti: string[]; rifiutate: string[]; n: number } {
    const out = qs.map(q => oggetto(q) ? { ...q } : q), log: string[] = [], mancanti: string[] = [], rifiutate: string[] = [];
    let n = 0;
    for (const p of patch) {
      if (p.id === undefined) { mancanti.push('elemento senza id'); continue; }
      const q = out.find(x => oggetto(x) && x.id === p.id) as DomQ | undefined;
      if (!q) { mancanti.push(String(p.id)); continue; }
      const ch = Object.keys(p).filter(k => k !== 'id'), permessi = autorizzate && autorizzate[String(p.id)];
      const vietati = ch.filter(k => !CHIAVI.includes(k) || (permessi && !permessi.includes(k)) || !valoreValido(k, p[k]));
      if (!ch.length || vietati.length) { const msg = p.id + ': patch rifiutata' + (vietati.length ? ', campi non autorizzati o malformati: ' + vietati.join(', ') : ', nessun campo'); rifiutate.push(msg); log.push(msg); continue; }
      for (const k of ch) q[k] = p[k];
      if (ch.length) { n++; log.push(p.id + ': aggiornati ' + ch.join(', ')); } else log.push(p.id + ': nessun campo da aggiornare');
    }
    return { qs: out, log, mancanti, rifiutate, n };
  }
  /** JSON finale nel formato di consegna, con le chiavi nell'ordine canonico (una domanda per riga). */
  function jsonFinale(qs: unknown[], parte: string): string {
    const ord = (q: unknown) => { if (!oggetto(q)) return q; const o: DomQ = {}; for (const k of CHIAVI) if (k in q) o[k] = q[k]; for (const k of Object.keys(q)) if (!(k in o)) o[k] = q[k]; return o; };
    return '{"parte":' + JSON.stringify(parte || 'DA-COMPILARE') + ',"quiz":[\n' + qs.map(q => '  ' + JSON.stringify(ord(q))).join(',\n') + '\n]}';
  }

  // ---------- prompt di correzione chirurgica ----------
  const A_MANO = /ID duplicato|stanno nella stessa scheda|domande invece di|per 3 domande di fila/;
  const SPEC: Array<[RegExp, (m: RegExpMatchArray) => { f: string[]; c: string[] }]> = [
    [/^chiave mancante: (.+)/, m => ({ f: [m[1]], c: ['domanda'] })],
    [/livelloCognitivo deve essere/, () => ({ f: ['livelloCognitivo', 'livello'], c: ['domanda'] })],
    [/domanda mancante/, () => ({ f: ['domanda'], c: ['opzioni', 'esatta'] })],
    [/tutte\/nessuna delle precedenti/, () => ({ f: ['domanda', 'opzioni', 'esatta', 'spiegazioneDistrattori', 'distractorTypes'], c: ['domanda', 'opzioni', 'esatta', 'spiegazioneDistrattori'] })],
    [/4 opzioni testuali|opzioni (?:semanticamente )?duplicate/, () => ({ f: ['opzioni', 'esatta', 'spiegazioneDistrattori', 'distractorTypes'], c: ['domanda', 'opzioni', 'esatta'] })],
    [/esatta deve essere/, () => ({ f: ['esatta'], c: ['domanda', 'opzioni'] })],
    [/RISPOSTA ESATTA: /, () => ({ f: ['esatta', 'spiegazione'], c: ['domanda', 'opzioni', 'esatta', 'spiegazione'] })],
    [/più lunga|contenuto in un distrattore|molto più corta/, () => ({ f: ['opzioni'], c: ['domanda', 'opzioni', 'esatta'] })],
    [/spiegazioneDistrattori/, () => ({ f: ['spiegazioneDistrattori'], c: ['domanda', 'opzioni', 'esatta', 'spiegazioneDistrattori'] })],
    [/distractorTypes/, () => ({ f: ['distractorTypes'], c: ['opzioni', 'esatta', 'spiegazioneDistrattori'] })],
    [/erroreTipico/, () => ({ f: ['erroreTipico'], c: ['domanda', 'opzioni', 'esatta'] })],
    [/spiegazione mancante|spiegazione corta|manca la citazione|non coincide con fonte/, () => ({ f: ['spiegazione'], c: ['domanda', 'opzioni', 'esatta', 'spiegazione', 'fonte'] })],
    [/fonte mancante/, () => ({ f: ['fonte', 'sourceRef'], c: ['domanda', 'citazione'] })],
    [/da verificare/, () => ({ f: ['fonte', 'sourceRef', 'spiegazione'], c: ['domanda', 'fonte', 'spiegazione'] })],
    [/sourceRef diverso/, () => ({ f: ['sourceRef'], c: ['fonte'] })],
    [/Bloom L[1-4] dichiarato/, () => ({ f: ['domanda'], c: ['domanda', 'opzioni', 'esatta'] })],
    [/^citazione p\. /, () => ({ f: ['fonte', 'sourceRef', 'spiegazione'], c: ['domanda', 'opzioni', 'esatta', 'fonte', 'citazione'] })],
  ];
  const specDi = (msg: string) => { msg = msg.replace(/^(?:Formato|Didattica|Fonte|Correzione):\s*/, ''); for (const [re, fn] of SPEC) { const m = msg.match(re); if (m) return fn(m); } return { f: [] as string[], c: ['domanda'] }; };
  function pianoPatch(qs: unknown[], problemi: ProblemaQ[]): Record<string, string[]> {
    const ids = new Set(qs.filter(oggetto).map(q => String(q.id || ''))), out: Record<string, string[]> = {};
    for (const p of problemi.filter(x => x.sev === 'err' && ids.has(x.id))) { const a = out[p.id] || []; for (const f of specDi(p.msg).f) if (CHIAVI.includes(f) && !a.includes(f)) a.push(f); out[p.id] = a; }
    return out;
  }
  function riga(q: DomQ, k: string): string {
    const o = Array.isArray(q.opzioni) ? q.opzioni as unknown[] : null, e = q.esatta;
    if (k === 'domanda') return 'Domanda: ' + testo(q.domanda);
    if (k === 'opzioni') return o ? 'Opzioni: ' + o.map((x, j) => (LETTERE[j] || String(j + 1)) + ') ' + String(x)).join(' | ') : 'Opzioni: (assenti)';
    if (k === 'esatta') return 'Esatta attuale: ' + (Number.isInteger(e) && (e as number) >= 0 && (e as number) < 4 ? LETTERE[e as number] + ' (indice ' + e + ')' : String(e));
    if (k === 'spiegazioneDistrattori') return 'Confutazioni attuali: ' + (Array.isArray(q.spiegazioneDistrattori) ? q.spiegazioneDistrattori.map((x, j) => (j + 1) + ') ' + String(x)).join(' ') : '(assenti)');
    if (k === 'spiegazione') return 'Spiegazione attuale (' + testo(q.spiegazione).length + ' car.): ' + (testo(q.spiegazione) || '(assente)');
    if (k === 'citazione') { const c = citazioni(testo(q.spiegazione)); return 'Citazione nella spiegazione: ' + (c.length ? c.join(' ') : '(nessuna)'); }
    if (k === 'fonte') return 'Fonte attuale: ' + (testo(q.fonte) || '(assente)');
    return k + ': ' + JSON.stringify(q[k]);
  }
  interface OpzCorr { gem?: boolean; perche?: boolean; avvisi?: boolean; }
  function promptCorrezione(qs: unknown[], problemi: ProblemaQ[], o: OpzCorr = {}): { testo: string; nDomande: number; manuali: ProblemaQ[]; globali: ProblemaQ[]; autorizzate: Record<string, string[]> } {
    const sel = problemi.filter(p => p.sev === 'err' || (o.avvisi && p.sev === 'warn'));
    const perQ = new Map<string, { q: DomQ; f: Set<string>; c: Set<string>; righe: string[] }>(), manuali: ProblemaQ[] = [], globali: ProblemaQ[] = [];
    for (const p of sel) {
      if (A_MANO.test(p.msg)) { manuali.push(p); continue; }
      const q = qs.find(x => oggetto(x) && x.id === p.id) as DomQ | undefined;
      if (!q) { globali.push(p); continue; }
      if (p.msg === 'chiave mancante: fonte' && sel.some(j => j.id === p.id && /^fonte mancante/.test(j.msg))) continue;
      const sp = specDi(p.msg), a = perQ.get(p.id) || { q, f: new Set<string>(), c: new Set<string>(), righe: [] };
      sp.f.forEach(x => a.f.add(x)); sp.c.forEach(x => a.c.add(x));
      const [fix, why] = consiglio(p.msg);
      a.righe.push('- ' + p.msg + ' → ' + fix + (o.perche ? ' (perché: ' + why + ')' : ''));
      perQ.set(p.id, a);
    }
    const out: string[] = [];
    if (o.gem) out.push('CORREZIONE CHIRURGICA — solo patch JSON: per ogni domanda un oggetto con «id» e SOLO i campi dopo RESTITUISCI; un unico blocco di codice compatto (un oggetto per riga), nessun altro testo.');
    else out.push('CORREZIONE CHIRURGICA QUIZ — restituisci SOLO patch JSON.',
      '1. Per ogni domanda elencata rispondi con un oggetto con «id» e SOLO i campi indicati dopo RESTITUISCI. Non rimandare la scheda e non toccare le altre domande.',
      '2. Un unico blocco di codice JSON: array con un oggetto per riga, compatto, senza commenti né altro testo.',
      '3. Non cambiare il contenuto scientifico se non serve; cita pagine reali del libro cartaceo; niente eserciziari commerciali.',
      '4. Non cambiare l\'ordine delle opzioni né «esatta» se non richiesto; se modifichi un\'opzione, adatta la confutazione relativa.',
      '5. Niente controlli, conteggi o riepiloghi: il controllo è automatico.',
      'Formato: [{"id":"...","campo":"..."},{"id":"...","campo":"..."}]');
    out.push('');
    if (!perQ.size) out.push('Nessuna patch da chiedere con le impostazioni attuali.');
    else {
      out.push('DOMANDE DA CORREGGERE: ' + perQ.size);
      const ordine = ['domanda', 'opzioni', 'esatta', 'spiegazioneDistrattori', 'spiegazione', 'fonte', 'citazione'];
      perQ.forEach((a, id) => {
        out.push('', '### ' + id, 'RESTITUISCI: ' + (a.f.size ? [...a.f].join(', ') : '(vedi problemi)'), ...a.righe);
        ordine.filter(k => a.c.has(k)).forEach(k => out.push(riga(a.q, k)));
      });
    }
    return { testo: out.join('\n'), nDomande: perQ.size, manuali, globali, autorizzate: pianoPatch(qs, sel) };
  }
  /** Avvisi d'uso per non sprecare quota. */
  function avvisiUso(o: { gem?: boolean; autoInSospeso?: number; manuali?: ProblemaQ[]; globali?: ProblemaQ[] }): Array<{ sev: SevQ; t: string; x: string }> {
    const n: Array<{ sev: SevQ; t: string; x: string }> = [], m = o.manuali || [], g = o.globali || [];
    if (o.autoInSospeso) n.push({ sev: 'warn', t: 'Prima le correzioni automatiche', x: 'Ci sono ' + o.autoInSospeso + ' correzioni automatiche non applicate: il prompt le dà per fatte. Premi «Ripara automaticamente» prima di applicare la risposta.' });
    if (m.length) n.push({ sev: 'warn', t: 'Da correggere a mano', x: 'Non si risolvono con le patch: ' + m.slice(0, 6).map(i => i.id + ' — ' + i.msg).join('; ') + (m.length > 6 ? '; …e altri ' + (m.length - 6) : '') + '.' });
    if (g.length) n.push({ sev: 'warn', t: 'Squilibri globali', x: 'Livelli, posizioni o lunghezze sull\'insieme non si correggono con patch: ' + g.slice(0, 5).map(i => i.id + ' — ' + i.msg).join('; ') + '. Rigenera solo le domande necessarie con la tabella di assegnazione.' });
    n.push({ sev: 'warn', t: 'Chat nuova', x: 'Apri una chat NUOVA (o il tuo Gem) per la correzione: continuare quella della generazione rilegge tutta la cronologia e consuma quota.' });
    n.push({ sev: 'warn', t: 'Incolla solo il prompt', x: 'Non riallegare il file e non chiedere di rigenerare la scheda: le patch bastano.' });
    n.push({ sev: 'info', t: 'Risposta', x: 'Copia solo il blocco di codice e incollalo in «Applica la risposta». Se arriva la scheda intera, rispondi: «Solo patch JSON, solo i campi richiesti.»' });
    n.push({ sev: 'info', t: 'Non farlo ricontrollare', x: 'Non chiedere all\'AI di contare o verificare: il controllo lo fa l\'app.' });
    if (!o.gem) n.push({ sev: 'info', t: 'Gem', x: 'Metti le «Regole per il Gem» nelle istruzioni di un Gem e spunta «Ho un Gem»: i prompt si accorciano.' });
    n.push({ sev: 'info', t: 'Quota', x: 'Il consumo si controlla su gemini.google.com/usage.' });
    return n;
  }

  // ---------- piano di assegnazione (livelli e posizioni decisi prima) ----------
  /** Quote L1–L4 (25/35/25/15) con il metodo del resto maggiore. */
  function pianoConteggi(n: number): number[] {
    const p = [0.25, 0.35, 0.25, 0.15], raw = p.map(x => x * n), fl = raw.map(Math.floor);
    const resto = n - fl.reduce((a, b) => a + b, 0);
    const ord = raw.map((r, i) => [r - fl[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let k = 0; k < resto; k++) fl[ord[k][1]]++;
    return fl;
  }
  function mescola<T>(a: T[], rnd: () => number): T[] { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
  /** Livello e posizione della corretta per n domande: mai 3 uguali di fila. rnd iniettabile per i test. */
  function piano(n: number, rnd: () => number = Math.random): PianoRigaQ[] {
    const lv: number[] = []; pianoConteggi(n).forEach((k, i) => { for (let j = 0; j < k; j++) lv.push(i + 1); });
    const base = Math.floor(n / 4), pc = [base, base, base, base];
    mescola([0, 1, 2, 3], rnd).slice(0, n % 4).forEach(i => pc[i]++);
    const ps: number[] = []; pc.forEach((k, i) => { for (let j = 0; j < k; j++) ps.push(i); });
    const ok = (a: number[]) => { for (let i = 2; i < a.length; i++) if (a[i] === a[i - 1] && a[i] === a[i - 2]) return false; return true; };
    for (let t = 0; t < 3000; t++) { const a = mescola(lv, rnd), b = mescola(ps, rnd); if (ok(a) && ok(b)) return a.map((l, i) => ({ lv: l, es: b[i] })); }
    return lv.map((l, i) => ({ lv: l, es: ps[i] }));
  }
  const pad3 = (x: number) => String(x).padStart(3, '0');
  /** Testo della TABELLA DI ASSEGNAZIONE per un blocco (prefisso = materia-x.y, primo = numero della prima domanda). */
  function tabella(prefisso: string, primo: number, righe: PianoRigaQ[]): string {
    return ['TABELLA DI ASSEGNAZIONE (domande ' + pad3(primo) + '–' + pad3(primo + righe.length - 1) + ')',
      'Per ogni riga usa ESATTAMENTE id e livello indicati e metti la risposta giusta nella posizione indicata (esatta: 0=A, 1=B, 2=C, 3=D). Non cambiare l\'assegnazione.',
      ...righe.map((p, i) => prefisso + '-' + pad3(primo + i) + ' | L' + p.lv + ' | esatta=' + p.es + ' (' + LETTERE[p.es] + ')')].join('\n');
  }
  const REGOLE_GEM = ['REGOLE DI FORMATO (da mettere nelle istruzioni del Gem)',
    '- Rispondi solo con blocchi di codice JSON, una domanda per riga, compatti, senza commenti né testo fuori dal formato richiesto.',
    '- Se ricevi una TABELLA DI ASSEGNAZIONE, segui alla lettera id, livello e posizione della risposta esatta di ogni riga.',
    '- In ogni domanda almeno un distrattore deve avere più caratteri della risposta corretta.',
    '- spiegazioneDistrattori e distractorTypes: 3 elementi, nell\'ordine delle opzioni saltando la corretta.',
    '- Non eseguire controlli o conteggi finali estesi: la verifica la fa l\'app.',
    '- Se ricevi una CORREZIONE CHIRURGICA, restituisci solo patch: un oggetto per domanda con «id» e i soli campi dopo RESTITUISCI, mai la scheda intera.'].join('\n');

  return { CHIAVI, PER_SCHEDA, LETTERE, riparaVirgole, leggi, sezioni, letteraDichiarata, analizza, consiglio, autoFix, leggiPatch, applicaPatch, pianoPatch, jsonFinale,
    promptCorrezione, avvisiUso, pianoConteggi, piano, tabella, REGOLE_GEM };
})();
