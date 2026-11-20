// =====================================================================
// 07-contratto.ts — v0.61 «Contratto AI»: un solo contratto fra l'app e qualsiasi AI esterna. MODULO PURO.
// L'AI scrive solo il CONTENUTO (testo di domande, opzioni, spiegazioni, titoli del piano). Tutto il resto lo fa l'app:
//  - leggi(): lettore tollerante (fence, prosa intorno, più blocchi, BOM, virgolette tipografiche, virgole finali,
//    LaTeX, risposta troncata) → formato riconosciuto dal contenuto, mai rifiutato in blocco;
//  - aQuiz(): adapter da quiz-v3 / v2 / 0.58 / parte al modello interno unico (il formato v2 che ImportaDrive già legge);
//  - assegna(), tabellaPosizioni(), mescola(): ID, livelli, gemelle e posizione dell'esatta decisi dall'app;
//  - aPiano(): piano-v1 in JSON o a righe «@B 3.3 | titolo» / «COPRE S1 S2 | 3.3.1»;
//  - continua(): prompt «continua da qui» dopo l'ultima domanda completa di una risposta interrotta.
// quiz-v3 = { formato:"quiz-v3", step?, scheda:"S01", sottoStep?, quiz:[{ livello 1..4, gemella?:"G1", tipoItem, domanda,
//   opzioni[4] (giusta in [0]), spiegazione, spiegazioneDistrattori[3], distractorTypes[3], erroreTipico, fonte }] }.
// Se una domanda ha già id/esatta (file v2) si tengono: un file vecchio non viene mai rimescolato.
// Usa JsonAI (01-json.ts, parser unico dell'app) e sezioniSpiegazione (07-sezionispiegazione.ts), entrambi in app.js.
// =====================================================================
type FormatoAI = 'quiz-v4' | 'quiz-v3' | 'quiz-v2' | 'quiz-058' | 'parte' | 'chiusura' | 'piano-v1' | 'piano-righe' | 'ignoto';
type DomAI = Record<string, unknown>;
interface BloccoAI { formato: FormatoAI; dati: unknown; troncato: boolean; }
interface LetturaAI { formato: FormatoAI; dati: unknown; blocchi: BloccoAI[]; riparazioni: string[]; troncato: boolean; ultimoCompleto?: string; avvisi: string[]; errori: string[]; }
interface CtxQuiz { step?: string; sottoStep?: string; scheda?: number | string; categoria?: string; seme?: number; /** v0.64: posizione della prima domanda (parte k/N) */ da?: number; }
interface CoperturaPiano { schede: number[]; micro: string[]; }
interface BloccoPiano { codice: string; titolo: string; copre: CoperturaPiano[]; }
interface PianoV1 { blocchi: BloccoPiano[]; avvisi: string[]; }

/** Chiavi del modello interno di una domanda (ordine canonico): le usano Validatore, DiagnosiQuiz e il master prompt. */
const CHIAVI_QUIZ = ['id', 'stepId', 'sottoStep', 'scheda', 'categoria', 'livelloCognitivo', 'livello', 'tipoItem', 'coppiaGemellaId', 'erroreTipico',
  'domanda', 'opzioni', 'esatta', 'spiegazione', 'spiegazioneDistrattori', 'distractorTypes', 'fonte', 'sourceRef'];

const Contratto = (() => {
  const LETTERE = 'ABCD';
  const ogg = (v: unknown): v is DomAI => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v: unknown) => typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const QUIZ: FormatoAI[] = ['quiz-v4', 'quiz-v3', 'quiz-v2', 'quiz-058', 'parte'];

  // ---------- riparazioni testuali ----------
  /** Toglie le virgole finali prima di } o ] (fuori dalle stringhe). */
  function riparaVirgole(s: string): string {
    let out = '', dentro = false, esc = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (dentro) { out += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') dentro = false; continue; }
      if (c === '"') { dentro = true; out += c; continue; }
      if (c === ',') { let j = i + 1; while (j < s.length && /\s/.test(s[j])) j++; if (s[j] === '}' || s[j] === ']') continue; }
      out += c;
    }
    return out;
  }
  /** Il primo JSON bilanciato (fuori dalle stringhe); null se si interrompe prima di chiudersi. */
  function bilanciato(s: string): string | null {
    const i = s.search(/[{[]/); if (i < 0) return null;
    let d = 0, dentro = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (dentro) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') dentro = false; continue; }
      if (c === '"') dentro = true; else if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') { d--; if (!d) return s.slice(i, j + 1); }
    }
    return null;
  }
  const parse = (s: string): { ok: boolean; d?: unknown } => { try { return { ok: true, d: JSON.parse(JsonAI.riparaLatex(s)) }; } catch (_) { return { ok: false }; } };
  /** Blocchi di codice ``` (anche l'ultimo non chiuso, se la risposta si è interrotta); senza fence = tutto il testo. */
  function blocchiDi(t: string): { blocchi: string[]; fuori: boolean } {
    const re = /```[a-zA-Z]*[ \t]*\n?([\s\S]*?)```/g, out: string[] = [];
    let m: RegExpExecArray | null, fine = 0, fuori = '';
    while ((m = re.exec(t))) { fuori += t.slice(fine, m.index); if (m[1].trim()) out.push(m[1].trim()); fine = re.lastIndex; }
    const resto = t.slice(fine), aperto = resto.search(/```/);
    if (aperto >= 0) { fuori += resto.slice(0, aperto); const r = resto.slice(aperto).replace(/^```[a-zA-Z]*/, '').trim(); if (r) out.push(r); }
    else fuori += resto;
    return out.length ? { blocchi: out, fuori: !!fuori.trim() } : { blocchi: [t.trim()], fuori: false };
  }

  // ---------- riconoscimento del formato ----------
  function formatoDi(d: unknown, avvisi: string[]): { formato: FormatoAI; dati: unknown } {
    if (Array.isArray(d)) {
      const qs = d.filter(ogg);
      if (qs.some(q => 'opzioni' in q || 'domanda' in q)) return { formato: qs.some(q => 'esatta' in q) ? 'quiz-v2' : 'quiz-v3', dati: { quiz: qs } };
      return { formato: 'ignoto', dati: d };
    }
    if (!ogg(d)) return { formato: 'ignoto', dati: d };
    const f = str(d.formato);
    if (f) {
      const q = /^quiz-v(\d+)/i.exec(f), p = /^piano-v(\d+)/i.exec(f);
      if (q && Array.isArray(d.quiz)) {
        const n = Number(q[1]);
        if (n === 4) return { formato: 'quiz-v4', dati: d };   // v0.64: + «tipo» e campi per tipo
        if (n > 4) avvisi.push('Formato «' + f + '» più nuovo dell\'app: lo leggo come quiz-v3 (aggiorna l\'app se manca qualcosa)');
        return { formato: n >= 3 ? 'quiz-v3' : 'quiz-v2', dati: d };
      }
      if (p) { if (Number(p[1]) > 1) avvisi.push('Formato «' + f + '» più nuovo dell\'app: lo leggo come piano-v1'); return { formato: 'piano-v1', dati: d }; }
      avvisi.push('Formato «' + f + '» sconosciuto: lo riconosco dal contenuto');
    }
    if (Array.isArray(d.quiz)) {
      if (str(d.parte)) return { formato: 'parte', dati: d };
      if (ogg(d.meta)) return { formato: 'quiz-058', dati: d };
      return { formato: (d.quiz as unknown[]).some(q => ogg(q) && 'esatta' in q) ? 'quiz-v2' : 'quiz-v3', dati: d };
    }
    if (ogg(d.meta) && ogg(d.programmaCalendario)) return { formato: 'chiusura', dati: d };
    if (Array.isArray(d.blocchi)) return { formato: 'piano-v1', dati: d };
    return { formato: 'ignoto', dati: d };
  }

  /** Un blocco di testo → JSON, con le riparazioni annotate; se troncato, le domande complete. */
  function leggiBlocco(b: string, rip: string[], avvisi: string[]): (BloccoAI & { ultimo?: string }) | null {
    let s = b.trim(), r = parse(s);
    if (!r.ok) { const e = bilanciato(s); if (e && e !== s) { s = e; r = parse(s); if (r.ok) rip.push('testo intorno al JSON ignorato'); } }
    if (!r.ok && /[“”]/.test(s)) { s = s.replace(/[“”]/g, '"'); const e = bilanciato(s); if (e) s = e; r = parse(s); rip.push('virgolette tipografiche sostituite'); }
    if (!r.ok) { const v = riparaVirgole(s); if (v !== s) { s = v; r = parse(s); rip.push('virgole finali rimosse'); } }
    if (r.ok) return { ...formatoDi(r.d, avvisi), troncato: false };
    // risposta interrotta: si tengono gli oggetti completi dell'array «quiz» (o del primo array)
    const qs = JsonAI.recuperaArrayParziale(s, s.indexOf('"quiz"') >= 0 ? '"quiz"' : '').filter(ogg);
    if (!qs.length) return null;
    const testata: DomAI = {};
    for (const k of ['formato', 'step', 'scheda', 'sottoStep', 'parte']) { const m = new RegExp('"' + k + '"\\s*:\\s*"([^"]*)"').exec(s.slice(0, s.indexOf('"quiz"') >= 0 ? s.indexOf('"quiz"') : 0)); if (m) testata[k] = m[1]; }
    const ultimo = qs[qs.length - 1];
    rip.push('risposta interrotta: tenute ' + qs.length + ' domande complete');
    const f = formatoDi({ ...testata, quiz: qs }, avvisi);
    return { ...f, troncato: true, ultimo: str(ultimo.domanda) || str(ultimo.id) };
  }

  function leggi(testo: unknown): LetturaAI {
    const l: LetturaAI = { formato: 'ignoto', dati: null, blocchi: [], riparazioni: [], troncato: false, avvisi: [], errori: [] };
    const t = JsonAI.pulisci(testo).trim();
    if (!t) { l.errori.push('Il testo è vuoto.'); return l; }
    if (!/[{[]/.test(t) && /^\s*@B\s/m.test(t)) { l.formato = 'piano-righe'; l.dati = t; return l; }
    const { blocchi, fuori } = blocchiDi(t);
    if (blocchi.length > 1 || fuori) l.riparazioni.push(fuori ? 'testo fuori dai blocchi di codice ignorato' : 'blocchi di codice uniti');
    else if (/```/.test(t)) l.riparazioni.push('blocco markdown rimosso');
    blocchi.forEach((b, k) => {
      const r = leggiBlocco(b, l.riparazioni, l.avvisi);
      if (!r) { l.errori.push('Blocco ' + (k + 1) + ': JSON non leggibile.'); return; }
      l.blocchi.push({ formato: r.formato, dati: r.dati, troncato: r.troncato });
      if (r.troncato) { l.troncato = true; l.ultimoCompleto = r.ultimo; }
    });
    l.riparazioni = [...new Set(l.riparazioni)];
    const quiz = l.blocchi.filter(b => QUIZ.includes(b.formato));
    if (quiz.length) {
      const primo = quiz[0], testa = ogg(primo.dati) ? primo.dati : {};
      l.formato = primo.formato;
      l.dati = quiz.length === 1 ? primo.dati : { ...testa, quiz: quiz.flatMap(b => ogg(b.dati) && Array.isArray(b.dati.quiz) ? b.dati.quiz as unknown[] : []) };
    } else if (l.blocchi.length) { l.formato = l.blocchi[0].formato; l.dati = l.blocchi[0].dati; }
    return l;
  }

  // ---------- ID, posizioni, mescola (le fa l'app, mai l'AI) ----------
  const livelloN = (v: unknown) => { const n = Number(str(v).replace(/^L/i, '')); return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 0; };
  const numScheda = (v: unknown) => ImportaParti.numScheda(v);
  /** quiz-v4: senza «tipo» (v3 e precedenti) è un mcq. */
  const eMcq = (q: DomAI) => !str(q.tipo) || str(q.tipo) === 'mcq';
  const haEsatta = (q: DomAI) => q.esatta !== undefined && q.esatta !== null && q.esatta !== '';
  /** Seme stabile da step e scheda (FNV-1a): reimportare lo stesso file = stesse posizioni. */
  function seme(step: string, scheda: number): number {
    let h = 2166136261;
    for (const c of step + '#' + scheda) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** Posizioni dell'esatta per n domande: blocchi da 4 rimescolati (conteggi pari ±1, mai 3 uguali di fila). */
  function tabellaPosizioni(n: number, sem: number): number[] {
    let x = (sem >>> 0) || 1;
    const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    const out: number[] = [];
    while (out.length < n) {
      const p = [0, 1, 2, 3];
      for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
      out.push(...p);
    }
    return out.slice(0, n);
  }
  /** ID, scheda, stepId, sottoStep, categoria, livelli, gemelle («G1» → ID dello step), sourceRef. Gli id già presenti restano. */
  function assegna(qs: DomAI[], ctx: CtxQuiz = {}): DomAI[] {
    const step = str(ctx.step).toLowerCase(), n0 = numScheda(ctx.scheda) || 1, conta = new Map<number, number>();
    const primo = Math.max(1, Math.floor(Number(ctx.da) || 1));
    return qs.map(q0 => {
      const q: DomAI = { ...q0 }, n = numScheda(q.scheda) || n0, k = (conta.get(n) ?? primo - 1) + 1, base = (step ? step + '-' : '') + 'S' + pad2(n);
      conta.set(n, k);
      if (!str(q.id)) q.id = base + '-' + pad2(k);
      if (!/-S\d+$/i.test(str(q.scheda))) q.scheda = base;
      if (step && !str(q.stepId)) q.stepId = step;
      const sotto = str(q.sottoStep) || str(ctx.sottoStep); if (sotto) q.sottoStep = sotto;
      q.categoria = str(q.categoria) || str(ctx.categoria) || 'prioritaria';
      const lv = livelloN(q.livelloCognitivo) || livelloN(q.livello); if (lv) { q.livelloCognitivo = lv; q.livello = 'L' + lv; }
      const g = str(q.gemella); if (g && !str(q.coppiaGemellaId)) q.coppiaGemellaId = (step ? step + '-' : '') + g.toLowerCase();
      if (!q.sourceRef && str(q.fonte)) q.sourceRef = str(q.fonte);
      return q;
    });
  }
  const LETTERA_LIBERA = /(^|[^A-Za-z0-9])[A-D]\)/;
  /** Lettere della spiegazione dopo il rimescolamento: «RISPOSTA ESATTA: X)» e la sezione «PERCHÉ GLI ALTRI NO». */
  function riscriviLettere(sp: string, mappa: number[], pos: number): { testo: string; libere: boolean } {
    const re = new RegExp(RE_SEZ_SPIEGAZIONE.source, 'g'), tagli: { i: number; fine: number; et: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(sp))) tagli.push({ i: m.index, fine: re.lastIndex, et: m[1] });
    let out = sp.slice(0, tagli.length ? tagli[0].i : sp.length), libere = LETTERA_LIBERA.test(out);
    tagli.forEach((c, k) => {
      let corpo = sp.slice(c.fine, k + 1 < tagli.length ? tagli[k + 1].i : sp.length);
      if (/^RISPOSTA/.test(c.et)) corpo = corpo.replace(/^(\s*)([A-D])\)/, (_, a: string) => a + LETTERE[pos] + ')');
      else if (/^PERCH/.test(c.et)) corpo = corpo.replace(/(^|[^A-Za-z0-9])([A-D])\)/g, (_, a: string, l: string) => a + LETTERE[mappa[LETTERE.indexOf(l)]] + ')');
      else if (LETTERA_LIBERA.test(corpo)) libere = true;
      out += sp.slice(c.i, c.fine) + corpo;
    });
    return { testo: out, libere };
  }
  /** La giusta (opzioni[0]) va in «pos», i distrattori restano nell'ordine (confutazioni e tipi invariati); lettere riscritte. */
  function mescola(q: DomAI, pos: number, avvisi: string[] = []): DomAI {
    const o = Array.isArray(q.opzioni) ? (q.opzioni as unknown[]).slice() : [];
    if (o.length < 2 || !(pos >= 0 && pos < o.length)) return { ...q, esatta: 0 };
    const resto = o.slice(1), mappa = o.map((_, i) => i === 0 ? pos : i - 1 < pos ? i - 1 : i);
    const r: DomAI = { ...q, opzioni: [...resto.slice(0, pos), o[0], ...resto.slice(pos)], esatta: pos };
    if (typeof q.spiegazione === 'string') {
      const w = riscriviLettere(q.spiegazione, mappa, pos);
      r.spiegazione = w.testo;
      if (w.libere) avvisi.push('«' + str(q.domanda).slice(0, 50) + '…»: c\'è una lettera d\'opzione fuori da «RISPOSTA ESATTA» e «PERCHÉ GLI ALTRI NO» — non riscritta, controllala');
    }
    return r;
  }

  // ---------- adapter ----------
  /** Lettura → domande nel modello interno (il v2 che ImportaDrive legge). quiz-v3: ID, livelli e posizioni dall'app;
   *  v2 / 0.58 / parte: intatti (mai rimescolati). Gli avvisi finiscono in l.avvisi. */
  function aQuiz(l: LetturaAI, ctx: CtxQuiz = {}): DomAI[] {
    if (!QUIZ.includes(l.formato)) return [];
    const d: DomAI = ogg(l.dati) ? l.dati : {}, qs = (Array.isArray(d.quiz) ? d.quiz as unknown[] : []).filter(ogg).map(q => ({ ...q }));
    if (l.formato !== 'quiz-v3' && l.formato !== 'quiz-v4') return qs;
    const step = (str(ctx.step) || str(d.step)).toLowerCase(), sch = numScheda(d.scheda) || numScheda(ctx.scheda) || 1;
    const fatte = assegna(qs, { ...ctx, step, scheda: sch, sottoStep: str(d.sottoStep) || str(ctx.sottoStep), da: Number(d.da) || ctx.da });
    const perScheda = new Map<number, number[]>();
    fatte.forEach((q, i) => { if (haEsatta(q) || !eMcq(q)) return; const n = numScheda(q.scheda) || sch, v = perScheda.get(n) || []; v.push(i); perScheda.set(n, v); });
    for (const [n, idx] of perScheda) {
      const tab = tabellaPosizioni(idx.length, ctx.seme ?? seme(step, n));
      idx.forEach((i, k) => { fatte[i] = mescola(fatte[i], tab[k], l.avvisi); });
    }
    return fatte;
  }
  /** Piano: JSON piano-v1 o righe «@B 3.3 | titolo» + «COPRE S1 S2 | 3.3.1 3.3.2». */
  function aPiano(l: LetturaAI): PianoV1 {
    const avvisi: string[] = [], blocchi: BloccoPiano[] = [];
    const schedeDi = (xs: unknown[]) => xs.map(numScheda).filter(n => n > 0);
    const lista = (v: unknown) => (Array.isArray(v) ? v : []) as unknown[];
    if (l.formato === 'piano-righe') {
      let cur: BloccoPiano | null = null, ignorate = 0;
      for (const riga of String(l.dati).split('\n').map(r => r.trim()).filter(Boolean)) {
        let m = /^@B\s+(\S+)\s*(?:\|\s*(.*))?$/.exec(riga);
        if (m) { cur = { codice: m[1], titolo: str(m[2]) || m[1], copre: [] }; blocchi.push(cur); continue; }
        m = /^COPRE\s+(.*?)\s*\|\s*(.*)$/i.exec(riga);
        if (!m) { ignorate++; continue; }
        if (!cur) { avvisi.push('«' + riga + '» viene prima di ogni @B: ignorata'); continue; }
        const tok = m[1].split(/[\s,]+/).filter(Boolean), schede = schedeDi(tok), micro = m[2].split(/[\s,]+/).filter(Boolean);
        if (schede.length !== tok.length) avvisi.push('Blocco ' + cur.codice + ': schede illeggibili in «' + riga + '»');
        if (schede.length) cur.copre.push({ schede, micro });
      }
      if (ignorate) avvisi.push(ignorate + (ignorate === 1 ? ' riga ignorata' : ' righe ignorate') + ' (né @B né COPRE)');
    } else if (l.formato === 'piano-v1') {
      for (const b of lista(ogg(l.dati) ? l.dati.blocchi : null).filter(ogg)) {
        const codice = str(b.codice);
        if (!codice) { avvisi.push('Blocco senza codice: ignorato'); continue; }
        const copre = lista(b.copre).filter(ogg).map(c => ({ schede: schedeDi(lista(c.schede)), micro: lista(c.micro).map(str).filter(Boolean) })).filter(c => c.schede.length);
        blocchi.push({ codice, titolo: str(b.titolo) || codice, copre });
      }
    } else avvisi.push('Non è un piano (formato ' + l.formato + ')');
    return { blocchi, avvisi };
  }

  // ---------- continua da qui ----------
  /** Prompt per far riprendere una risposta interrotta: solo le domande mancanti, stesso formato. */
  function continua(l: LetturaAI, o: { perScheda?: number } = {}): string {
    const per = o.perScheda || 18, d: DomAI = ogg(l.dati) ? l.dati : {}, n = Array.isArray(d.quiz) ? (d.quiz as unknown[]).length : 0;
    const scheda = str(d.scheda) || 'S01', da = n + 1, mancano = Math.max(0, per - n);
    const v4 = l.formato === 'quiz-v4' || (Array.isArray(d.quiz) && (d.quiz as unknown[]).some(q => ogg(q) && !!str(q.tipo) && str(q.tipo) !== 'mcq'));
    const testa = JSON.stringify({ formato: v4 ? 'quiz-v4' : 'quiz-v3', ...(str(d.step) ? { step: str(d.step) } : {}), scheda, ...(str(d.sottoStep) ? { sottoStep: str(d.sottoStep) } : {}) }).slice(0, -1);
    return ['CONTINUA DA QUI — la risposta precedente si è interrotta a metà.',
      'Scheda ' + scheda + ': sono arrivate complete ' + n + ' domande. Scrivi le ' + mancano + ' domande che mancano (dalla ' + da + ' alla ' + per + ') e solo quelle.',
      l.ultimoCompleto ? 'L\'ultima domanda arrivata completa è: «' + l.ultimoCompleto + '». Riprendi subito dopo, senza riscrivere quelle già arrivate.' : 'Non riscrivere le domande già arrivate.',
      'Segui la stessa sequenza di livelli' + (v4 ? ' e di tipi' : '') + ' e le stesse regole del prompt iniziale, dalla posizione ' + da + '.',
      'Stesso formato, un solo blocco di codice JSON: ' + testa + ',"quiz":[ … ]}'].join('\n');
  }

  // ---------- import (Drive o manuale) ----------
  /** Testo dell'AI → pacchetti che ImportaDrive sa importare: un pacchetto per blocco quiz (ID, esatta e meta dall'app), le chiusure intatte. */
  function pacchetti(testo: unknown): { lettura: LetturaAI; pacchetti: DomAI[] } {
    const l = leggi(testo), out: DomAI[] = [];
    for (const b of l.blocchi) {
      const d: DomAI = ogg(b.dati) ? b.dati : {};
      if (b.formato === 'chiusura') { out.push(d); continue; }
      if (b.formato === 'piano-v1') { l.avvisi.push('C\'è un piano: si importa da «✨ Crea Piano Intelligente», non da qui'); continue; }
      if (!QUIZ.includes(b.formato)) continue;
      const meta: DomAI = ogg(d.meta) ? d.meta : {}, np = ImportaParti.nomeParte(str(d.parte));
      const step = (str(d.step) || str(meta.stepId) || (np ? np.step : '')).toLowerCase();
      const quiz = aQuiz({ ...l, formato: b.formato, dati: d }, { step });
      const m2: DomAI = { ...meta };
      if (step && !str(m2.stepId)) m2.stepId = step;
      if (step && !str(m2.materia)) m2.materia = step.replace(/-[\d.]+$/, '');
      if (str(d.sottoStep) && !str(m2.sottoStep)) m2.sottoStep = str(d.sottoStep);
      out.push({ ...d, meta: m2, quiz });
    }
    return { lettura: l, pacchetti: out };
  }

  return { LETTERE, riparaVirgole, bilanciato, blocchiDi, formatoDi, leggi, continua, seme, tabellaPosizioni, assegna, mescola, aQuiz, aPiano, pacchetti };
})();
