// 07-neuro.ts — v0.54 (BP3): motore neuroscientifico dei quiz, PURO (nessun effetto all'avvio, niente DOM,
// niente rete): lo usano 07-quizapp (certezza, interleaving, fatica, imbuto AI) e 07-creaquiz (Creaquiz Leggero).
//
// 1. Metadati per domanda (tutti facoltativi, con ripiego sicuro → i quiz v0.51–v0.53 restano validi):
//    bloomLevel 1–4, distractorTypes {indiceOpzione: tipo}, confidenceLog (ultimi tentativi), sourceRef.
// 2. Matrice certezza × correttezza (1 = tiro a indovinare, 2 = abbastanza sicuro, 3 = certo):
//    certo+sbagliata → illusione di competenza (0,5 giorni, ease −0,30, feedback contrastivo obbligatorio);
//    incerto+giusta → risposta fortunata (max 1 giorno, ease fermo, «da consolidare»);
//    certo+giusta → padronanza (intervallo ×1,25); incerto+sbagliata → lacuna nota (1 giorno + rimando alla teoria).
// 3. Interleaving: mai più di 2 domande di fila dello stesso micro-argomento; alternanza Bloom 1–2 / 3–4.
// 4. Fatica attentiva (zero token): media mobile degli ultimi 5 tempi contro la base della sessione.
// 5. Imbuto AI a 4 livelli: 0 locale → 1 spiegazioni già pronte/cache → 2 micro-chiamata (≤120 parole,
//    ≤350 token) → 3 circuit breaker oltre 15 domande (prompt per Gemini web + incolla il JSON).
// 6. Creaquiz Leggero: template {{var:min:max:step}}, cloze, parser JSON tollerante, deduplicazione, export.
// 7. Pipeline di studio per step: scheda prolissa → scheda condensata → quiz bank (copertura Bloom).

type BloomN = 1 | 2 | 3 | 4;
type TipoDistr = 'misconception' | 'inversione_causa' | 'confusione_termine' | 'caso_limite' | 'plausibile_generico';
type Certezza = 1 | 2 | 3;
interface TentativoN { ts: string; corretto: boolean; livelloCertezza: Certezza; tempoRispostaMs: number; }
interface SourceRefN { libro?: string; capitolo?: string; pagina?: string; stepId?: string; }
/** Stato di ripasso della singola domanda (dentro il record 'statq', campo facoltativo `neuro`). */
interface SrsN { iv: number; ease: number; due: string; reps: number; tag?: string[]; daConsolidare?: boolean; ultimoCaso?: CasoN; }
type CasoN = 'illusione_competenza' | 'lucky_guess' | 'padronanza' | 'lacuna_nota' | 'standard';
type StatoPipe = 'bozza' | 'pronta' | 'verificata';
interface PipeStep extends Rec { type: 'pipestep'; stepId: string; schedaProlissa: StatoPipe; schedaCondensata: StatoPipe; }

const Neuro = (() => {
  const TIPI_DISTR: TipoDistr[] = ['misconception', 'inversione_causa', 'confusione_termine', 'caso_limite', 'plausibile_generico'];
  const MAX_LOG = 10, EASE0 = 2.5, EASE_MIN = 1.3, BREAKER = 15, MAX_PAROLE_MICRO = 120, MAX_TOKEN_MICRO = 350;
  const STATI_PIPE: StatoPipe[] = ['bozza', 'pronta', 'verificata'];
  const str = (x: any) => typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '';

  // ---------- 1. metadati ----------
  /** Livello di Bloom: quello scritto, altrimenti stimato dal livello/tipo della domanda (mai undefined). */
  function bloom(d: any): BloomN {
    const b = Number(d && d.bloomLevel); if (b >= 1 && b <= 4 && Math.floor(b) === b) return b as BloomN;
    const lv = String(d && d.lv || ''), t = String(d && d.t || '');
    if (t === 'risposta_aperta_rubrica') return 4;
    if (/problema|applicativ/i.test(lv)) return 3;
    if (/trabocchetto/i.test(lv) || t === 'sequenza' || t === 'abbinamento') return 2;
    return 1;
  }
  function pulisciLog(x: any, max = MAX_LOG): TentativoN[] {
    if (!Array.isArray(x)) return [];
    return x.filter(t => t && typeof t === 'object').map(t => ({ ts: str(t.ts) || '', corretto: !!t.corretto,
      livelloCertezza: ([1, 2, 3].includes(Number(t.livelloCertezza)) ? Number(t.livelloCertezza) : 2) as Certezza,
      tempoRispostaMs: Math.max(0, Number(t.tempoRispostaMs) || 0) })).slice(-max);
  }
  /** Copia della domanda con i metadati neuro ripuliti (campi non validi tolti, mai inventati). */
  function normalizza<T extends Record<string, any>>(d: T): T {
    const o: any = { ...d };
    const b = Number(o.bloomLevel); if (!(b >= 1 && b <= 4 && Math.floor(b) === b)) delete o.bloomLevel; else o.bloomLevel = b;
    if (o.distractorTypes && typeof o.distractorTypes === 'object') {
      const m: Record<number, TipoDistr> = {}; let n = 0;
      for (const k of Object.keys(o.distractorTypes)) { const v = o.distractorTypes[k]; if (/^\d+$/.test(k) && TIPI_DISTR.includes(v)) { m[+k] = v; n++; } }
      if (n) o.distractorTypes = m; else delete o.distractorTypes;
    } else delete o.distractorTypes;
    if (o.confidenceLog !== undefined) { const l = pulisciLog(o.confidenceLog); if (l.length) o.confidenceLog = l; else delete o.confidenceLog; }
    if (o.sourceRef && typeof o.sourceRef === 'object') {
      const s: SourceRefN = {}; for (const k of ['libro', 'capitolo', 'pagina', 'stepId'] as const) if (str(o.sourceRef[k])) s[k] = str(o.sourceRef[k]);
      if (Object.keys(s).length) o.sourceRef = s; else delete o.sourceRef;
    } else delete o.sourceRef;
    for (const k of ['subtopic', 'stepId', 'spiegazione']) if (o[k] !== undefined && !str(o[k])) delete o[k];
    if (o.spiegazioneDistrattori !== undefined && !(o.spiegazioneDistrattori && typeof o.spiegazioneDistrattori === 'object')) delete o.spiegazioneDistrattori;
    return o;
  }
  function aggiungiTentativo(log: any, t: TentativoN, max = MAX_LOG): TentativoN[] { return pulisciLog((Array.isArray(log) ? log : []).concat([t]), max); }
  const stepDi = (d: any): string => str(d && d.stepId) || str(d && d.sourceRef && d.sourceRef.stepId) || '';
  const argomentoDi = (d: any): string => stepDi(d) || str(d && d.subtopic) || str(d && d.sk) || '';
  const tipoDistrattore = (d: any, oi: number): TipoDistr | null => d && d.distractorTypes && TIPI_DISTR.includes(d.distractorTypes[oi]) ? d.distractorTypes[oi] : null;
  const NOMI_DISTR: Record<TipoDistr, string> = { misconception: 'idea sbagliata diffusa', inversione_causa: 'causa ed effetto invertiti', confusione_termine: 'termine scambiato con un altro', caso_limite: 'caso limite', plausibile_generico: 'risposta plausibile ma generica' };

  // ---------- 2. matrice certezza × correttezza ----------
  function caso(certezza: Certezza | null | undefined, corretto: boolean): CasoN {
    if (certezza === 3) return corretto ? 'padronanza' : 'illusione_competenza';
    if (certezza === 1) return corretto ? 'lucky_guess' : 'lacuna_nota';
    return 'standard';
  }
  const piuGiorni = (oggi: string, n: number) => { const d = new Date(oggi + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  /** Nuovo stato di ripasso della domanda (SM-2 semplificato + correzione metacognitiva della BP3). */
  function pianifica(prev: SrsN | null | undefined, certezza: Certezza | null | undefined, corretto: boolean, oggi: string): SrsN & { contrastivo: boolean; rimando: boolean } {
    const p = prev && typeof prev === 'object' ? prev : null;
    const ease0 = p && p.ease > 0 ? p.ease : EASE0, iv0 = p && p.iv > 0 ? p.iv : 0, reps0 = p && p.reps > 0 ? p.reps : 0;
    // standard
    let iv = corretto ? (iv0 < 1 ? 1 : iv0 < 3 ? 3 : Math.round(iv0 * ease0)) : 1;
    let ease = corretto ? ease0 + 0.1 : Math.max(EASE_MIN, ease0 - 0.2);
    const c = caso(certezza, corretto);
    let tag = (p && p.tag ? p.tag.slice() : []).filter(t => t !== 'illusione_competenza' || !corretto);
    let daConsolidare = false, contrastivo = false, rimando = false;
    if (c === 'illusione_competenza') { iv = 0.5; ease = Math.max(EASE_MIN, ease0 - 0.30); contrastivo = true; if (!tag.includes('illusione_competenza')) tag.push('illusione_competenza'); }
    else if (c === 'lucky_guess') { iv = Math.min(iv, 1); ease = ease0; daConsolidare = true; }
    else if (c === 'padronanza') iv = Math.round(iv * 1.25 * 10) / 10;
    else if (c === 'lacuna_nota') { iv = 1; rimando = true; }
    const r: SrsN & { contrastivo: boolean; rimando: boolean } = { iv, ease: Math.round(ease * 100) / 100, due: piuGiorni(oggi, iv < 1 ? 0 : Math.round(iv)), reps: corretto ? reps0 + 1 : 0, contrastivo, rimando, ultimoCaso: c };
    if (tag.length) r.tag = tag;
    if (daConsolidare) r.daConsolidare = true;
    return r;
  }

  // ---------- 3. interleaving ----------
  const banda = (b: number) => b <= 2 ? 'b' : 'a';
  /** Riordina (indici) con al massimo `maxFila` domande di fila dello stesso argomento e, se `alterna`,
   *  preferendo l'alternanza Bloom 1–2 ↔ 3–4. Parte dall'ordine dato e lo cambia il meno possibile. */
  function interleave<T>(items: T[], ordine?: number[], o: { chiave?: (d: T) => string; bloom?: (d: T) => number; alterna?: boolean; maxFila?: number } = {}): number[] {
    const chiave = o.chiave || argomentoDi, bl = o.bloom || bloom, maxFila = o.maxFila || 2;
    const rest = (ordine || items.map((_, i) => i)).slice(), out: number[] = [];
    const conta = new Map<string, number>(); for (const i of rest) { const k = chiave(items[i]); conta.set(k, (conta.get(k) || 0) + 1); }
    let ultima = '', fila = 0, ultimaBanda = '';
    const fattibile = (k: string) => {   // dopo aver preso k, il resto si può ancora sistemare?
      const tot = rest.length - 1, nuovaFila = k === ultima ? fila + 1 : 1;
      for (const [kk, c0] of conta) { const c = kk === k ? c0 - 1 : c0; if (!c) continue;
        const cap = maxFila * (tot - c + 1) - (kk === k ? nuovaFila : 0); if (c > cap) return false; }
      return true;
    };
    while (rest.length) {
      const ammessi = rest.map((i, pos) => ({ i, pos, k: chiave(items[i]) })).filter(x => !(x.k === ultima && fila >= maxFila));
      let cand = ammessi.filter(x => fattibile(x.k));
      if (!cand.length) cand = ammessi.length ? ammessi : rest.map((i, pos) => ({ i, pos, k: chiave(items[i]) }));
      let sc = cand[0];
      if (o.alterna && ultimaBanda) { const alt = cand.slice(0, 4).find(x => banda(bl(items[x.i])) !== ultimaBanda); if (alt) sc = alt; }
      rest.splice(sc.pos, 1); out.push(sc.i); conta.set(sc.k, (conta.get(sc.k) || 1) - 1);
      fila = sc.k === ultima ? fila + 1 : 1; ultima = sc.k; ultimaBanda = banda(bl(items[sc.i]));
    }
    return out;
  }
  /** La fila più lunga di domande consecutive con la stessa chiave (per i test e per i controlli). */
  function filaMax<T>(items: T[], chiave: (d: T) => string = argomentoDi as any): number {
    let m = 0, f = 0, u: string | null = null; for (const d of items) { const k = chiave(d); f = k === u ? f + 1 : 1; u = k; if (f > m) m = f; } return m;
  }

  // ---------- 4. fatica attentiva ----------
  const media = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const mediana = (a: number[]) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  /** tempi e esiti in ordine cronologico. Base = mediana dei tempi prima degli ultimi 5 (o di tutti se pochi). */
  function fatica(tempi: number[], esiti: boolean[]): { allarme: boolean; motivo: '' | 'impulsive' | 'errori_lenti'; rollingAvgMs: number; baselineMs: number } {
    const t = tempi.filter(x => x > 0), rollingAvgMs = Math.round(media(t.slice(-5)));
    const prima = t.length > 8 ? t.slice(0, -5) : t.slice(0, Math.max(1, t.length - 1));
    const baselineMs = Math.round(mediana(prima));
    const r = { allarme: false, motivo: '' as '' | 'impulsive' | 'errori_lenti', rollingAvgMs, baselineMs };
    if (t.length < 5 || !baselineMs) return r;
    const ult = t[t.length - 1];
    if (ult < 0.35 * baselineMs && rollingAvgMs < 0.6 * baselineMs) { r.allarme = true; r.motivo = 'impulsive'; return r; }
    const e = esiti.slice(-3), u3 = t.slice(-3);
    if (e.length === 3 && e.every(x => !x) && u3[0] <= u3[1] && u3[1] <= u3[2] && u3[2] > 1.8 * baselineMs) { r.allarme = true; r.motivo = 'errori_lenti'; }
    return r;
  }
  const TESTO_FATICA = 'Calo attentivo rilevato: pausa consigliata di 3 minuti o chiusura sessione';

  // ---------- 5. imbuto AI ----------
  /** Livello 1: spiegazione già pronta nel JSON (spiegazione + spiegazioneDistrattori[opzione] o ew). oi = indice nell'array o (0 = corretta). */
  function prontaL1(d: any, oi: number | null): string | null {
    const parti: string[] = [];
    if (oi != null && oi > 0) {
      const sd = d && d.spiegazioneDistrattori, x = sd && (Array.isArray(sd) ? sd[oi - 1] : sd[oi]);
      const ew = d && Array.isArray(d.ew) ? d.ew[oi - 1] : '';
      const t = str(x) || str(ew);
      if (t) { const tipo = tipoDistrattore(d, oi); parti.push((tipo ? '(' + NOMI_DISTR[tipo] + ') ' : '') + t); }
    }
    if (str(d && d.spiegazione)) parti.push(str(d.spiegazione));
    return parti.length ? parti.join('\n\n') : null;
  }
  interface DipImbuto { locale?: () => string | null; cache?: () => string | null; micro?: () => Promise<{ testo: string; modello: string }>; senzaAI?: boolean; forza?: boolean; }
  /** Attraversa l'imbuto dal livello 0 al 2: la rete (micro) si usa solo se i livelli 0 e 1 non hanno nulla. */
  async function imbuto(d: any, oi: number | null, dip: DipImbuto): Promise<{ livello: 0 | 1 | 2; testo: string; modello: string } | null> {
    if (!dip.forza) {
      const l0 = dip.locale ? dip.locale() : null; if (l0) return { livello: 0, testo: l0, modello: 'locale (senza AI)' };
      const l1 = prontaL1(d, oi); if (l1) return { livello: 1, testo: l1, modello: 'spiegazione già pronta (senza AI)' };
      const c = dip.cache ? dip.cache() : null; if (c) return { livello: 1, testo: c, modello: 'salvata (senza AI)' };
    }
    if (dip.senzaAI || !dip.micro) return null;
    const r = await dip.micro(); return { livello: 2, testo: r.testo, modello: r.modello };
  }
  const parole = (s: string) => String(s).split(/\s+/).filter(Boolean).length;
  const taglia = (s: string, n: number) => { const w = String(s).split(/\s+/).filter(Boolean); return w.length > n ? w.slice(0, n).join(' ') + '…' : w.join(' '); };
  const TONI: Record<string, string> = { semplice_esempi: 'parole semplici e un esempio concreto', didattico_chiaro: 'tono didattico chiaro', tecnico_accademico: 'lessico tecnico preciso' };
  const LENTI: Record<string, string> = { stem_quantitativo: 'controlla unità, formule e passaggi numerici', biomedico_clinico: 'collega meccanismo e conseguenza clinica', umanistico_storico: 'contesto, cause e date', giuridico_normativo: 'norma, requisito ed eccezione', lingue_letteratura: 'regola grammaticale o lessicale', informatico_tecnico: 'comportamento del codice o del sistema' };
  /** Livello 2: prompt ultra-compatto (≤120 parole) per «Spiegami perché ho sbagliato questa opzione». */
  function promptMicro(o: { q: string; corretta: string; scelta: string; archetipo?: string; tono?: string; tipoDistr?: TipoDistr | null }): string {
    const testa = 'Studente ha sbagliato. In max 80 parole, italiano, ' + (TONI[o.tono || ''] || TONI.didattico_chiaro) + ': perché la sua scelta è sbagliata e perché la corretta è giusta' + (LENTI[o.archetipo || ''] ? ' (' + LENTI[o.archetipo!] + ')' : '') + '. Niente preamboli.';
    const corpo = ' Domanda: ' + taglia(o.q, 40) + ' | Scelta: ' + taglia(o.scelta, 15) + ' | Corretta: ' + taglia(o.corretta, 15) + (o.tipoDistr ? ' | Errore tipo: ' + NOMI_DISTR[o.tipoDistr] : '');
    const p = testa + corpo;
    return parole(p) > MAX_PAROLE_MICRO ? taglia(p, MAX_PAROLE_MICRO) : p;
  }
  /** Livello 3 (circuit breaker): più di 15 domande → niente chiamate multiple dall'app. */
  const serveBreaker = (n: number) => n > BREAKER;
  function promptGemini(o: { argomento: string; materia?: string; archetipo?: string; n: number; testo?: string; stepId?: string; libro?: string }): string {
    return [
      'Sei un autore di quiz didattici. Genera ' + o.n + ' domande su: ' + o.argomento + (o.materia ? ' (materia: ' + o.materia + ')' : '') + '.',
      o.archetipo && LENTI[o.archetipo] ? 'Taglio disciplinare: ' + LENTI[o.archetipo] + '.' : '',
      'Rispondi SOLO con un array JSON valido (niente markdown, niente commenti, niente virgole finali). Ogni elemento:',
      '{"t":"mcq","lv":"Sbarramento|Applicativo|Trabocchetto|Problema","q":"testo","o":["CORRETTA","distrattore1","distrattore2","distrattore3","distrattore4"],',
      ' "e":["Cosa chiede: …","Il concetto: …","Passaggi: …","In sintesi: …"],"ew":["perché distrattore1 è sbagliato", "…x4"],',
      ' "bloomLevel":1-4,"distractorTypes":{"1":"misconception|inversione_causa|confusione_termine|caso_limite|plausibile_generico", "2":"…","3":"…","4":"…"},',
      ' "spiegazione":"max 60 parole","subtopic":"micro-argomento","sourceRef":{"libro":"' + (o.libro || '') + '","capitolo":"","pagina":"","stepId":"' + (o.stepId || '') + '"}}',
      'Per i completamenti: {"t":"fill","q":"frase con …… al posto della risposta","a":["risposte accettate"],"show":"risposta","e":[…],"bloomLevel":1-2,"subtopic":"…"}.',
      'Regole: la corretta è SEMPRE o[0] e NON è la più lunga; 5 opzioni distinte; bloomLevel 1=richiamo, 2=comprensione, 3=applicazione/calcolo, 4=analisi; distribuisci i livelli (almeno un terzo a 3–4); non più di 2 domande di fila sullo stesso subtopic; italiano corretto.',
      o.testo ? 'Testo di partenza:\n"""\n' + o.testo.slice(0, 60000) + '\n"""' : '',
    ].filter(Boolean).join('\n');
  }

  // ---------- 6a. template parametrici e cloze ----------
  /** Valuta un'espressione aritmetica (+ − × ÷ ^ parentesi, variabili) senza eval. */
  function calcola(espr: string, v: Record<string, number>): number {
    const s = espr.replace(/\s+/g, ''); let i = 0;
    const num = (): number => {
      if (s[i] === '(') { i++; const x = somma(); i++; return x; }
      if (s[i] === '-') { i++; return -num(); }
      const m = /^(\d+(?:[.,]\d+)?|[a-zA-Z_]\w*)/.exec(s.slice(i)); if (!m) throw new Error('espressione');
      i += m[0].length; if (/^\d/.test(m[0])) return parseFloat(m[0].replace(',', '.'));
      if (!(m[0] in v)) throw new Error('variabile ' + m[0]); return v[m[0]];
    };
    const pot = (): number => { const b = num(); if (s[i] === '^') { i++; return Math.pow(b, pot()); } return b; };
    const prod = (): number => { let x = pot(); while (s[i] === '*' || s[i] === '/') { const op = s[i++]; const y = pot(); x = op === '*' ? x * y : x / y; } return x; };
    const somma = (): number => { let x = prod(); while (s[i] === '+' || s[i] === '-') { const op = s[i++]; const y = prod(); x = op === '+' ? x + y : x - y; } return x; };
    const r = somma(); if (i < s.length) throw new Error('espressione'); return r;
  }
  const arrot = (x: number) => Math.round(x * 1e6) / 1e6;
  /** {{nome:min:max:step}} → valore casuale; {{=espressione}} → risultato. Stesso `v` per domanda e risposta. */
  function espandiTemplate(testo: string, v: Record<string, number> = {}, rnd: () => number = Math.random): { testo: string; v: Record<string, number> } {
    let t = String(testo).replace(/\{\{\s*([a-zA-Z_]\w*)\s*:\s*(-?[\d.]+)\s*:\s*(-?[\d.]+)\s*(?::\s*([\d.]+))?\s*\}\}/g, (_, n, a, b, st) => {
      if (!(n in v)) { const lo = +a, hi = +b, p = +(st || 1) || 1, k = Math.floor((hi - lo) / p + 1e-9) + 1; v[n] = arrot(lo + Math.floor(rnd() * Math.max(1, k)) * p); }
      return String(v[n]).replace('.', ',');
    });
    t = t.replace(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g, (m0, n) => n in v ? String(v[n]).replace('.', ',') : m0);
    t = t.replace(/\{\{=\s*([^}]+)\}\}/g, (m0, e) => { try { return String(arrot(calcola(e, v))).replace('.', ','); } catch (_) { return m0; } });
    return { testo: t, v };
  }
  const haTemplate = (s: string) => /\{\{\s*[a-zA-Z_]\w*\s*:/.test(String(s || ''));
  /** n varianti numeriche di una domanda-modello (zero token). */
  function varianti(d: any, n: number, rnd: () => number = Math.random): any[] {
    const out: any[] = [], visti = new Set<string>();
    for (let t = 0; out.length < n && t < n * 6; t++) {
      const v: Record<string, number> = {}, q = espandiTemplate(d.q, v, rnd).testo; if (visti.has(q)) continue; visti.add(q);
      const x: any = { ...d, q, gen: true, id: (d.id || 'q-t') + '-v' + out.length };
      if (Array.isArray(d.o)) x.o = d.o.map((o: string) => espandiTemplate(o, v, rnd).testo);
      if (Array.isArray(d.a)) x.a = d.a.map((o: string) => espandiTemplate(o, v, rnd).testo);
      if (d.show) x.show = espandiTemplate(d.show, v, rnd).testo;
      x.e = Array.isArray(d.e) ? d.e.map((o: string) => espandiTemplate(o, v, rnd).testo) : espandiTemplate(String(d.e || ''), v, rnd).testo;
      if (Array.isArray(x.o) && new Set(x.o).size !== x.o.length) continue;   // due opzioni uguali con questi numeri
      out.push(x);
    }
    return out;
  }
  const STOP = new Set('della delle degli dello dalla dalle dagli nella nelle negli sulla sulle questo questa quello quella perché quando mentre anche ancora sempre molto essere hanno viene sono stato stata tutti tutte altri altre loro come dove però quindi infatti'.split(' '));
  /** Cloze dalle frasi chiave: **termine** se c'è, altrimenti la parola lunga più rara della frase. */
  function cloze(testo: string, o: { sk?: string; stepId?: string; max?: number } = {}): any[] {
    const out: any[] = [], visti = new Set<string>(), max = o.max || 8, resto: string[] = [];
    const aggiungi = (q: string, r: string, lv: string, e: string) => {
      if (out.length >= max || !q || !r || visti.has(n2Cz(q))) return; visti.add(n2Cz(q));
      const d: any = { id: 'q-cz-' + hashTesto(q), sk: o.sk || '', t: 'fill', lv, q, a: [r], show: r, e: [e], bloomLevel: 1, gen: true };
      if (o.stepId) d.stepId = o.stepId;
      out.push(d);
    };
    // v0.57.1 (Q1): sintassi degli appunti prima dell'euristica. «domanda :: risposta» → domanda con la sua risposta;
    // {{parola}} → completamento con risposta «parola» (le graffe non restano mai visibili). I template {{x:1:9}} / {{=…}} non sono toccati.
    const GRAFFA = /\{\{(?!\s*=)(?![^}]*:)\s*([^}]+?)\s*\}\}/g;
    for (const riga of String(testo || '').replace(/\r/g, '').split('\n')) {
      const x = riga.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '');
      const qr = /^(.+?)\s::\s(.+)$/.exec(x);
      if (qr) { aggiungi(qr[1].trim(), qr[2].trim(), 'Domanda', 'Risposta: ' + qr[2].trim()); continue; }
      const g = Array.from(x.matchAll(GRAFFA));
      if (g.length) {
        const pulita = x.replace(GRAFFA, '$1');
        g.forEach((m, i) => { let k = 0; aggiungi(x.replace(GRAFFA, (_m, p) => k++ === i ? '……' : p), m[1], 'Completamento', 'In sintesi: ' + pulita); });
        continue;
      }
      resto.push(riga);
    }
    const testoResto = resto.join('\n');
    const frasi = testoResto.split(/(?<=[.!?])\s+|\n+/).map(x => x.trim().replace(/^[-*•]\s*/, '')).filter(x => x.length >= 30 && x.length <= 260 && !x.includes('{{'));
    const freq = new Map<string, number>(); for (const w of testoResto.toLowerCase().match(/[a-zà-ù]{7,}/g) || []) freq.set(w, (freq.get(w) || 0) + 1);
    for (const f of frasi) {
      if (out.length >= max) break;
      let term = (/\*\*([^*]{2,40})\*\*/.exec(f) || [])[1] || '';
      if (!term) { const cand = (f.match(/[A-Za-zÀ-ù]{7,}/g) || []).filter(w => !STOP.has(w.toLowerCase())); cand.sort((a, b) => (freq.get(a.toLowerCase()) || 0) - (freq.get(b.toLowerCase()) || 0) || b.length - a.length); term = cand[0] || ''; }
      if (!term || visti.has(term.toLowerCase())) continue; visti.add(term.toLowerCase());
      const pulita = f.replace(/\*\*/g, ''), q = pulita.replace(term, '……');
      if (q === pulita) continue;
      aggiungi(q, term, 'Completamento', 'In sintesi: ' + pulita);
    }
    return out;
  }
  const n2Cz = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

  // ---------- 6b. parser JSON tollerante + alias ----------
  // v0.57 (A15): un solo parser, in 01-json.ts (qui restano i nomi storici).
  const riparaJson = (t: string): string => JsonAI.riparaJson(t);
  const parseTollerante = (t: string) => JsonAI.parseTollerante(t);
  const prendi = (x: any, ...k: string[]) => { for (const n of k) if (x[n] !== undefined && x[n] !== null && x[n] !== '') return x[n]; return undefined; };
  /** Una domanda in formato qualsiasi (alias it/en) → DomB; null se inutilizzabile. */
  function daAlias(x: any, sk: string): any | null {
    if (!x || typeof x !== 'object') return null;
    const q = str(prendi(x, 'q', 'domanda', 'question', 'testo', 'text', 'prompt')).trim(); if (!q) return null;
    let o = prendi(x, 'o', 'opzioni', 'options', 'scelte', 'choices', 'risposte');
    if (o && !Array.isArray(o) && typeof o === 'object') o = Object.keys(o).sort().map(k => o[k]);
    const ans = prendi(x, 'corretta', 'answer', 'correct', 'risposta', 'risposta_corretta', 'c', 'correctIndex');
    const e = prendi(x, 'e', 'spiegazione_passi', 'explanation', 'spiegazione', 'solution') || '';
    const d: any = { id: '', sk, t: 'mcq', lv: str(prendi(x, 'lv', 'livello', 'level')) || 'Applicativo', q, e: Array.isArray(e) ? e.map(str) : str(e) };
    if (Array.isArray(o) && o.length >= 2) {
      const ops = o.map((v: any) => str(typeof v === 'object' && v ? prendi(v, 'text', 'testo', 't') : v).trim());
      let c = 0;
      if (typeof ans === 'number' && ans >= 0 && ans < ops.length) c = ans;
      else if (typeof ans === 'string' && /^[A-Ea-e]$/.test(ans.trim())) c = ans.trim().toUpperCase().charCodeAt(0) - 65;
      else if (typeof ans === 'string' && /^\d$/.test(ans.trim()) && +ans < ops.length && !ops.includes(ans.trim())) c = +ans;
      else if (typeof ans === 'string') { const k = ops.findIndex((v: string) => v.toLowerCase() === ans.trim().toLowerCase()); if (k >= 0) c = k; }
      else if (Array.isArray(o) && o.some((v: any) => v && v.correct)) c = o.findIndex((v: any) => v && v.correct);
      const ew0 = prendi(x, 'ew', 'perche', 'why', 'spiegazioneDistrattori');
      d.o = [ops[c]].concat(ops.filter((_: string, k: number) => k !== c));
      if (Array.isArray(ew0)) d.ew = ew0.map(str);
      else if (ew0 && typeof ew0 === 'object') { d.spiegazioneDistrattori = ew0; }
      if (x.distractorTypes && c) { const m: any = {}; for (const k of Object.keys(x.distractorTypes)) { const i = +k; if (i === c) continue; m[i < c ? i + 1 : i] = x.distractorTypes[k]; } d.distractorTypes = m; }
      else if (x.distractorTypes) d.distractorTypes = x.distractorTypes;
    } else {
      const a = prendi(x, 'a', 'accettate', 'answers') || ans; if (a === undefined) return null;
      d.t = 'fill'; d.lv = d.lv === 'Applicativo' ? 'Completamento' : d.lv; d.a = (Array.isArray(a) ? a : [a]).map(str).filter(Boolean); d.show = str(prendi(x, 'show', 'mostra')) || d.a[0];
      if (!d.a.length) return null;
      if (!/…|\.\.\.\./.test(d.q)) d.q = d.q.replace(/_{3,}/, '……');
      if (Array.isArray(x.ew)) d.ew = x.ew.map(str);
    }
    for (const k of ['bloomLevel', 'confidenceLog', 'sourceRef', 'subtopic', 'stepId', 'archetipo', 'r']) if (x[k] !== undefined) d[k] = x[k];
    if (x.bloom !== undefined && d.bloomLevel === undefined) d.bloomLevel = x.bloom;
    if (str(x.spiegazione) && Array.isArray(e)) d.spiegazione = str(x.spiegazione);
    if (x.spiegazioneDistrattori && !d.spiegazioneDistrattori && !Array.isArray(x.spiegazioneDistrattori)) d.spiegazioneDistrattori = x.spiegazioneDistrattori;
    const n = normalizza(d); n.id = 'q-l-' + hashTesto(q);
    if (n.t === 'mcq' && (n.o.some((v: string) => !v) || new Set(n.o.map((v: string) => v.toLowerCase())).size !== n.o.length)) return null;
    return n;
  }
  /** Testo incollato (JSON sporco, pacchetto .imcpack o {domande|questions:[…]}) → domande pulite. */
  function importa(t: string, sk: string): { domande: any[]; scartate: number; riparazioni: string[]; errore?: string } {
    const p = parseTollerante(t);
    if (!p.ok) return { domande: [], scartate: 0, riparazioni: p.riparazioni, errore: 'JSON non leggibile nemmeno dopo la riparazione.' };
    let a = p.dati; if (a && !Array.isArray(a)) a = a.domande || a.questions || a.quiz || (a.banca && a.banca.domande) || (a.q || a.domanda || a.question ? [a] : []);
    if (!Array.isArray(a)) a = [];
    const domande: any[] = []; let scartate = 0; const ids = new Set<string>();
    for (const x of a) { const d = daAlias(x, sk); if (!d) { scartate++; continue; } if (ids.has(d.id)) d.id += '-' + domande.length; ids.add(d.id); domande.push(d); }
    return { domande, scartate, riparazioni: p.riparazioni };
  }

  // ---------- 6c. deduplicazione ----------
  function normTesto(s: string): string { let t = String(s || '').toLowerCase(); if (t.normalize) t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); return t.replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function hashTesto(s: string): string { const n = normTesto(s); let h = 5381; for (let i = 0; i < n.length; i++) h = ((h << 5) + h + n.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function deduplica<T extends { q: string }>(nuove: T[], esistenti: Array<{ q: string }>): { nuove: T[]; saltate: number; badge: string } {
    const visti = new Set(esistenti.map(d => hashTesto(d.q))), out: T[] = []; let saltate = 0;
    for (const d of nuove) { const k = hashTesto(d.q); if (visti.has(k)) { saltate++; continue; } visti.add(k); out.push(d); }
    return { nuove: out, saltate, badge: 'Nuove: ' + out.length + ' | Già presenti saltate: ' + saltate };
  }

  // ---------- 6d. export ----------
  type FiltroExp = 'errori' | 'illusione' | 'bloom3' | 'tutti';
  /** stat: per id domanda → { esito, neuro } (dal record 'statq'). */
  function daEsportare<T extends { id: string }>(domande: T[], stat: Record<string, { esito?: boolean; n?: number; neuro?: SrsN } | undefined>, f: FiltroExp): T[] {
    return domande.filter(d => {
      const s = stat[d.id];
      if (f === 'errori') return !!s && !!s.n && s.esito === false;
      if (f === 'illusione') return !!s && !!s.neuro && !!s.neuro.tag && s.neuro.tag.includes('illusione_competenza');
      if (f === 'bloom3') return bloom(d) >= 3;
      return true;
    });
  }
  /** Formato compatto per il ripasso esterno: «D: … / R: … / Perché: …». */
  function compatto(domande: any[]): string {
    return domande.map((d, i) => (i + 1) + '. ' + d.q.replace(/\s+/g, ' ') + '\n   R: ' + (d.t === 'mcq' ? d.o[0] : (d.show || (d.a || [''])[0])) + (bloom(d) ? '  [Bloom ' + bloom(d) + ']' : '')
      + ((d.spiegazione || (Array.isArray(d.e) ? d.e[d.e.length - 1] : d.e)) ? '\n   Perché: ' + String(d.spiegazione || (Array.isArray(d.e) ? d.e[d.e.length - 1] : d.e)).replace(/^[^:]{2,20}:\s*/, '').slice(0, 240) : '')).join('\n');
  }

  // ---------- 7. pipeline di studio ----------
  const statoPipe = (x: any): StatoPipe => STATI_PIPE.includes(x) ? x : 'bozza';
  function copertura(domande: any[]): { quizBankCount: number; bloom: Record<BloomN, number>; mancanti: BloomN[]; pct: number } {
    const b: Record<BloomN, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }; for (const d of domande) b[bloom(d)]++;
    const mancanti = ([1, 2, 3, 4] as BloomN[]).filter(k => !b[k]);
    return { quizBankCount: domande.length, bloom: b, mancanti, pct: Math.round((4 - mancanti.length) * 25) };
  }
  const prossimoStato = (s: StatoPipe): StatoPipe => STATI_PIPE[(STATI_PIPE.indexOf(statoPipe(s)) + 1) % 3];
  /** Pacchetto .imcpack-v1 con le sole domande (niente statistiche, SRS, chiavi o account: confidenceLog tolto). */
  function pacchetto(domande: any[], o: { titolo: string; archetipo: string; modalita: string; oggi: string }): any {
    const per: Record<string, any[]> = {};
    for (const d of domande) { const c: any = { ...d }; delete c.confidenceLog; delete c.mod; delete c.nuova; delete c.gen; (per[c.sk || 'senza-scheda'] = per[c.sk || 'senza-scheda'] || []).push(c); }
    return { formato: 'imcpack-v1', titolo: o.titolo, descrizione: 'Esportato da Il mio calendario (' + domande.length + ' domande)', archetipo: o.archetipo, livelloConsigliato: o.modalita, dataCreazione: o.oggi,
      programma: [{ codiceStep: 'export', titolo: o.titolo, sottostep: Object.keys(per).map(sk => ({ sk, titolo: sk })) }], domande: per, flashcard: [] };
  }

  return { TIPI_DISTR, MAX_LOG, BREAKER, MAX_PAROLE_MICRO, MAX_TOKEN_MICRO, TESTO_FATICA, NOMI_DISTR,
    bloom, normalizza, aggiungiTentativo, stepDi, argomentoDi, tipoDistrattore, caso, pianifica, piuGiorni,
    interleave, filaMax, fatica, prontaL1, imbuto, promptMicro, parole, serveBreaker, promptGemini,
    calcola, espandiTemplate, haTemplate, varianti, cloze, riparaJson, parseTollerante, daAlias, importa,
    normTesto, hashTesto, deduplica, daEsportare, compatto, pacchetto, statoPipe, copertura, prossimoStato };
})();
