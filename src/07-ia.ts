// =====================================================================
// 07-ia.ts — GATEWAY AI UNICO (v0.46, router v0.47 — BP1 §4)
// Tutte le chiamate ai fornitori AI passano da qui: chat JSON (`chiedi`/`json`), testo libero e visione
// (`testo`), trascrizione audio (`trascrivi`). Nessun altro file chiama direttamente i domini dei fornitori.
// Chiavi: localStorage['imc-ai-keys'] = { v:2, chiavi:{ groq, gemini } }. In 0.46 restano rispecchiate anche
// nelle vecchie voci 'imc-groq-chiave' / 'imc-gemini-chiave' (rollback a 0.44 funzionante).
// Modelli: nessun ID fisso. GET /models (ricordato 12 ore) e scelta per PATTERN di ruolo; a parità vince la
// versione più alta, le «preview/exp» solo se non c'è alternativa stabile. Senza elenco: modelli di riserva.
//   «veloce»    assistente e comandi        groq → gemini
//   «genera»    quiz, testi, spiegazioni    gemini → groq
//   «revisiona» controllo indipendente      groq → gemini (con `evita` = modello che ha generato)
//   «lungo»     fonti lunghe                gemini
//   «visione»   scrittura a mano, immagini  gemini → groq
// v0.47 (BP1 §4.4–4.5): router con controllo preventivo (token stimati vs limite del modello), lettura delle
// intestazioni x-ratelimit-*, pause dopo 429 / 5xx, chiave rifiutata (401/403) non più riprovata finché non
// cambia, massimo 2 richieste in volo per fornitore. Fornitori facoltativi: Mistral, Cohere, OpenRouter, Requesty
// (chiavi solo in 'imc-ai-keys').
// =====================================================================

const IA = (() => {
  type Prov = 'groq' | 'gemini' | 'mistral' | 'cohere' | 'openrouter' | 'requesty';
  type Ruolo = 'genera' | 'revisiona' | 'veloce' | 'visione' | 'lungo';
  type Msg = { role: string; content: any };
  type Fornitore = { nome: string; prov: Prov; modello: string; gem: boolean };
  const PROVS: Prov[] = ['groq', 'gemini', 'mistral', 'cohere', 'openrouter', 'requesty'];
  const ALTRI: Prov[] = ['mistral', 'cohere', 'openrouter', 'requesty'];
  const NOMI: Record<Prov, string> = { groq: 'Groq', gemini: 'Gemini', mistral: 'Mistral', cohere: 'Cohere', openrouter: 'OpenRouter', requesty: 'Requesty' };
  const BASE: Record<Prov, string> = {
    groq: 'https://api.groq.com/openai/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta/openai', mistral: 'https://api.mistral.ai/v1',
    cohere: 'https://api.cohere.ai/compatibility/v1', openrouter: 'https://openrouter.ai/api/v1', requesty: 'https://router.requesty.ai/v1' };

  // ---- Chiavi (BP1 §4.1) ----
  const KK = 'imc-ai-keys', LEG: Partial<Record<Prov, string>> = { groq: 'imc-groq-chiave', gemini: 'imc-gemini-chiave' };
  const ls = (k: string): string | null => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const lsScrivi = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (_) { /* */ } };
  function archivio(): { v: 2; chiavi: Partial<Record<Prov, string>> } | null {
    try { const j = JSON.parse(ls(KK) || 'null'); return j && j.v === 2 && j.chiavi ? j : null; } catch (_) { return null; }
  }
  /** Allinea 'imc-ai-keys' alle vecchie voci (che in 0.46 restano la copia di riferimento per groq/gemini).
   *  La prima volta è la migrazione: crea 'imc-ai-keys' dalle chiavi già salvate. Idempotente. */
  function allinea(): Partial<Record<Prov, string>> {
    const a = archivio(), ch: Partial<Record<Prov, string>> = { ...(a ? a.chiavi : {}) };
    let cambiato = !a;
    for (const p of ['groq', 'gemini'] as Prov[]) {
      const v = ls(LEG[p]!) || '';
      if (v !== (ch[p] || '')) { if (v) ch[p] = v; else delete ch[p]; cambiato = true; }
    }
    if (cambiato && (a || Object.keys(ch).length)) lsScrivi(KK, JSON.stringify({ v: 2, chiavi: ch }));
    return ch;
  }
  const chiave = (p: Prov): string => allinea()[p] || '';
  function impostaChiave(p: Prov, v: string): void {
    v = String(v || '').replace(/\s+/g, '');
    const leg = LEG[p];
    if (leg) lsScrivi(leg, v);
    else { const a = archivio(), ch: Partial<Record<Prov, string>> = { ...(a ? a.chiavi : {}) }; if (v) ch[p] = v; else delete ch[p]; if (a || v) lsScrivi(KK, JSON.stringify({ v: 2, chiavi: ch })); }
    allinea();
    for (const k in disp) if (k.startsWith(p + ':')) delete disp[k];
    azzera(p);
  }
  const tutteChiavi = (): Partial<Record<Prov, string>> => ({ ...allinea() });
  /** Avviso (non blocco) sul formato della chiave. */
  const FORMATO: Partial<Record<Prov, RegExp>> = { groq: /^gsk_/, gemini: /^(AIza|AQ\.)/, openrouter: /^sk-or-/ };
  const formatoOk = (p: Prov, v: string) => { const re = FORMATO[p]; return !v || !re || re.test(v); };

  // ---- Discovery per pattern (BP1 §4.3) ----
  const PATTERN: Record<Prov, Partial<Record<Ruolo, RegExp[]>>> = {
    groq: { genera: [/gpt-oss-120b/, /gpt-oss/], revisiona: [/gpt-oss-120b/, /gpt-oss/], veloce: [/gpt-oss-20b/, /gpt-oss/], visione: [/qwen.*(vl|\d\.\d+-\d+b)/, /scout|maverick|vision/] },
    gemini: { genera: [/gemini-\d.*flash(?!-lite)/], veloce: [/flash-lite/, /flash/], lungo: [/gemini-\d.*flash(?!-lite)/, /pro/], visione: [/gemini-\d.*flash(?!-lite)/, /flash/], revisiona: [/hydrogen|pro/, /flash(?!-lite)/] },
    mistral: { genera: [/mistral-(large|medium)/, /mistral-small/], revisiona: [/mistral-(large|medium)/], veloce: [/mistral-small/, /ministral/], lungo: [/mistral-(large|medium)/] },
    cohere: { genera: [/command-a(?!.*(vision|reasoning|translate))/, /command-r-plus/, /command/], revisiona: [/command-a(?!.*(vision|reasoning|translate))/, /command-r-plus/] },
    openrouter: { genera: [/:free$/], veloce: [/:free$/] },
    requesty: { genera: [/gemini.*flash(?!-lite)/, /gpt-.*mini/, /llama/], veloce: [/flash-lite|mini|small/] },
  };
  /** Usati solo se /models non risponde e non c'è nulla in memoria. */
  const RISERVA: Record<Prov, Partial<Record<Ruolo, string[]>>> = {
    groq: { genera: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], revisiona: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], veloce: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'], visione: ['qwen/qwen3.8-27b'] },
    gemini: { genera: ['gemini-3.8-flash'], veloce: ['gemini-3.1-flash-lite', 'gemini-3.8-flash'], lungo: ['gemini-3.8-flash'], visione: ['gemini-3.8-flash'], revisiona: ['gemini-4-hydrogen', 'gemini-3.8-flash'] },
    mistral: { genera: ['mistral-large-latest', 'mistral-small-latest'], revisiona: ['mistral-large-latest'], veloce: ['mistral-small-latest'], lungo: ['mistral-large-latest'] },
    cohere: {}, openrouter: {}, requesty: {},
  };
  const CATENA: Record<Ruolo, Prov[]> = {
    veloce: ['groq', 'gemini', 'mistral', 'openrouter', 'requesty'], genera: ['gemini', 'groq', 'mistral', 'cohere', 'openrouter', 'requesty'],
    revisiona: ['groq', 'gemini', 'mistral', 'cohere'], lungo: ['gemini', 'mistral'], visione: ['gemini', 'groq'] };
  const ESCLUSI = /guard|whisper|tts|orpheus|playai|embed|imagen|veo|image|audio|live|aqa|learnlm|compound|moderation|ocr|rerank/i;
  const versione = (id: string) => { const m = /(\d+(?:\.\d+)?)/.exec(id.replace(/^.*\//, '')); return m ? parseFloat(m[1]) : 0; };
  const instabile = (id: string) => /preview|exp/i.test(id);
  /** Sceglie fino a 3 modelli per il ruolo, nell'ordine dei pattern; a parità la versione più alta. */
  function scegli(p: Prov, r: Ruolo, lista: string[] | null): string[] {
    const pat = PATTERN[p][r]; if (!pat) return [];
    if (!lista || !lista.length) return (RISERVA[p][r] || []).slice();
    const out: string[] = [];
    for (const re of pat) {
      let c = lista.filter(m => re.test(m) && !ESCLUSI.test(m) && !out.includes(m));
      if (!(p === 'groq' && r === 'visione') && c.some(m => !instabile(m))) c = c.filter(m => !instabile(m));
      c.sort((a, b) => versione(b) - versione(a) || a.length - b.length);
      out.push(...c);
    }
    return out.slice(0, 3);
  }
  const disp: Record<string, { t: number; m: string[] } | undefined> = {};
  async function disponibili(p: Prov | boolean): Promise<string[] | null> {
    if (typeof p === 'boolean') p = p ? 'gemini' : 'groq';
    const k = chiave(p); if (!k) return [];
    const ch = p + ':' + k.slice(-6), cl = (p === 'gemini' ? 'g' : p === 'groq' ? 'q' : p) + ':' + k.slice(-6);
    const c = disp[ch] || (() => { try { return JSON.parse(ls('imc-modelli-' + cl) || 'null'); } catch (_) { return null; } })();
    if (c && Date.now() - c.t < 12 * 36e5) return c.m;
    try {
      const r = await richiesta(p, '/models', k, undefined);
      if (!r.ok) return c ? c.m : null;   // anche scaduto: meglio di niente
      const j = await r.json(); const m = ((j.data || j.models || []) as any[]).map(x => String(x.id || x.name || '').replace(/^models\//, '')).filter(Boolean);
      const v = { t: Date.now(), m }; disp[ch] = v; try { localStorage.setItem('imc-modelli-' + cl, JSON.stringify(v)); } catch (_) { /* */ }
      return m;
    } catch (_) { return c ? c.m : null; }
  }
  /** Le chiavi Gemini nuove (prefisso «AQ.», oltre alle vecchie «AIza») si accettano tutte: provo Bearer e, se rifiutato, l'intestazione x-goog-api-key. */
  async function richiesta(p: Prov, perc: string, k: string, corpo?: any): Promise<Response> {
    const gem = p === 'gemini', base = BASE[p], form = typeof FormData !== 'undefined' && corpo instanceof FormData;
    const tipo: Record<string, string> = corpo && !form ? { 'Content-Type': 'application/json' } : {};
    const op: RequestInit = { method: corpo ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + k, ...tipo }, body: corpo ? (form ? corpo : JSON.stringify(corpo)) : undefined };
    let r = await fetch(base + perc, op);
    if (gem && (r.status === 401 || r.status === 403 || r.status === 400)) {
      const r2 = await fetch(base + perc, { ...op, headers: { 'x-goog-api-key': k, ...tipo } });
      if (r2.ok || r2.status === 429) return r2;
      const r3 = await fetch(base + perc + (perc.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(k), { ...op, headers: tipo });
      if (r3.ok || r3.status === 429) return r3;
    }
    return r;
  }
  async function catena(r: Ruolo, evita?: string): Promise<Fornitore[]> {
    const provs = CATENA[r].filter(p => chiave(p));
    const liste = await Promise.all(provs.map(p => disponibili(p)));
    const out: Fornitore[] = [];
    provs.forEach((p, i) => { for (const m of scegli(p, r, liste[i])) if (m !== evita) out.push({ nome: NOMI[p] + ' ' + m.replace(/^.*\//, ''), prov: p, modello: m, gem: p === 'gemini' }); });
    return out;
  }

  // v0.45 (BP1 §4.6): lettura robusta del JSON restituito dai modelli.
  const LATEX = new Set(('frac dfrac tfrac sqrt text textrm mathrm mathbf mathit operatorname times cdot div pm mp neq ne leq le geq ge approx sim propto infty partial nabla int sum prod lim log ln exp sin cos tan to rightarrow leftarrow Rightarrow rightleftharpoons leftrightarrow left right bar vec hat dot overline underline ' +
    'alpha beta gamma Gamma delta Delta epsilon varepsilon zeta eta theta Theta iota kappa lambda Lambda mu nu xi Xi pi Pi rho sigma Sigma tau upsilon phi Phi varphi chi psi Psi omega Omega degree circ ce pu quad qquad newline not in notin cup cap subset forall exists rm bf it').split(' '));
  /** Raddoppia i backslash del LaTeX SOLO dentro le stringhe JSON: `\\` già doppi, `\uXXXX` e i veri escape (\n, \t, \" …) restano. */
  function riparaLatex(t: string): string {
    return t.replace(/"(?:[^"\\]|\\.)*"/gs, s => s.replace(/\\(\\|u[0-9a-fA-F]{4}|[a-zA-Z]+|[\s\S])/g, (m, x: string) => {
      if (x === '\\' || /^u[0-9a-fA-F]{4}$/.test(x)) return m;      // già escapato · unicode valido
      if (!/^[a-zA-Z]/.test(x)) return '"/'.includes(x) ? m : '\\\\' + x;   // \" \/ validi; \( \, \[ … sono LaTeX
      if (LATEX.has(x)) return '\\\\' + x;                           // comando LaTeX intero (limite noto: \nu \tau \theta …)
      if (/^[bfnrt]/.test(x)) return m;                              // vero escape JSON seguito da testo (es. \nnuovo)
      return '\\\\' + x;                                             // \l \s \c… invalidi in JSON → LaTeX
    }));
  }
  /** Toglie <think>, fence ``` e testo intorno; estrae il PRIMO JSON bilanciato (fuori dalle stringhe), ripara il LaTeX, poi JSON.parse. */
  function parseJsonSicuro(raw: string): any {
    let t = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').replace(/```(?:json)?/gi, '');
    const i = t.search(/[{[]/); if (i < 0) throw new Error('risposta non in JSON');
    let d = 0, s = false, e = false, j = i;
    for (; j < t.length; j++) {
      const c = t[j];
      if (s) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') s = false; continue; }
      if (c === '"') s = true; else if (c === '{' || c === '[') d++; else if (c === '}' || c === ']') { d--; if (!d) break; }
    }
    t = t.slice(i, j + 1);
    // sempre riparare prima: «\frac» è JSON valido (\f = form feed) ma va letto come LaTeX
    try { return JSON.parse(riparaLatex(t)); } catch (_) { throw new Error('risposta non in JSON valido'); }
  }
  const json = parseJsonSicuro;
  /** Accorcia i messaggi di testo più lunghi finché il totale sta sotto `lim` caratteri (i brevi restano interi; immagini intatte). */
  function accorcia<T extends { content: any }>(msgs: T[], lim: number): T[] {
    const len = (x: T) => typeof x.content === 'string' ? x.content.length : 0;
    const tot = msgs.reduce((s, x) => s + len(x), 0); if (tot <= lim) return msgs;
    const out = msgs.slice(); let eccesso = tot - lim + 30;
    while (eccesso > 0) {
      let i = 0; for (let k = 1; k < out.length; k++) if (len(out[k]) > len(out[i])) i = k;
      const c = out[i].content; if (typeof c !== 'string') break;
      const taglio = Math.min(eccesso, c.length - 200); if (taglio <= 0) break;
      out[i] = { ...out[i], content: c.slice(0, c.length - taglio) + '\n[…testo accorciato…]' }; eccesso -= taglio;
    }
    return out;
  }
  // ---- Router (BP1 §4.4–4.5, v0.47) ----
  /** Limiti di partenza (token/minuto e contesto); `tpm` si aggiorna dalle intestazioni x-ratelimit-limit-tokens e dopo un 413. */
  const LIMITI: Record<Prov, { tpm: number; ctx: number }> = {
    groq: { tpm: 8000, ctx: 131072 }, gemini: { tpm: 250000, ctx: 1e6 }, mistral: { tpm: 50000, ctx: 32000 },
    cohere: { tpm: 20000, ctx: 128000 }, openrouter: { tpm: 20000, ctx: 32000 }, requesty: { tpm: 20000, ctx: 32000 } };
  /** Token di risposta attesi per ruolo: contano solo nel budget (non si inviano: i token di ragionamento li consumerebbero). */
  const USCITA: Record<Ruolo, number> = { genera: 1500, revisiona: 1000, veloce: 500, visione: 4096, lungo: 3000 };
  type StatoM = { finoA: number; k: number; tpm: number; rest?: { tok: number; finoA: number } };
  let RM: Record<string, StatoM> = {};                                  // per «fornitore:modello»
  let RP: Partial<Record<Prov, { finoA: number; motivo: string }>> = {};   // pausa dell'intero fornitore
  let NO: Partial<Record<Prov, string>> = {};                            // impronta della chiave rifiutata
  const impronta = (k: string) => k.slice(-6) + k.length;
  function sm(p: Prov, m: string): StatoM { const id = p + ':' + m; return RM[id] || (RM[id] = { finoA: 0, k: 0, tpm: LIMITI[p].tpm }); }
  function azzera(p?: Prov): void {
    if (!p) { RM = {}; RP = {}; NO = {}; return; }
    delete RP[p]; delete NO[p]; for (const k of Object.keys(RM)) if (k.startsWith(p + ':')) delete RM[k];
  }
  /** Stima: 3,5 caratteri per token; delle immagini conta solo il testo. */
  const stimaTok = (msgs: Msg[]) => Math.ceil(msgs.reduce((s, x) => s + (typeof x.content === 'string' ? x.content.length
    : Array.isArray(x.content) ? x.content.reduce((a: number, c: any) => a + (c && typeof c.text === 'string' ? c.text.length : 0), 0) : 0), 0) / 3.5);
  const budget = (p: Prov, m: string, out: number) => Math.min(LIMITI[p].ctx, Math.floor(0.7 * sm(p, m).tpm)) - out;
  /** Motivo per cui il modello va saltato ora ('' = utilizzabile). */
  function bloccato(p: Prov, m: string, serve: number, k: string): string {
    const ora = Date.now(), P = RP[p], s = sm(p, m);
    if (NO[p] && NO[p] === impronta(k)) return 'chiave non valida';
    if (P && P.finoA > ora) return P.motivo;
    if (s.finoA > ora) return 'in pausa';
    if (s.rest && s.rest.finoA > ora && s.rest.tok < serve) return 'in pausa';
    return '';
  }
  /** Durate delle intestazioni: «7.66s», «2m59.56s», «120ms», «1h2m», «30» (secondi) o data HTTP → millisecondi. */
  function dur(v: string | null): number {
    if (!v) return 0; v = v.trim();
    if (/^\d+(\.\d+)?$/.test(v)) return parseFloat(v) * 1000;
    const U: Record<string, number> = { ms: 1, s: 1e3, m: 6e4, h: 36e5 };
    let t = 0, x: RegExpExecArray | null; const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
    while ((x = re.exec(v))) t += parseFloat(x[1]) * U[x[2]];
    if (!t) { const d = Date.parse(v); if (!isNaN(d)) t = Math.max(0, d - Date.now()); }
    return t;
  }
  /** Legge le intestazioni e aggiorna lo stato dopo ogni risposta. */
  function esito(p: Prov, m: string, res: Response, tok: number, k: string): void {
    const hd = (n: string) => res.headers.get(n), s = sm(p, m), ora = Date.now();
    const lim = parseInt(hd('x-ratelimit-limit-tokens') || '', 10); if (lim > 0) s.tpm = lim;
    const rim = parseInt(hd('x-ratelimit-remaining-tokens') || '', 10);
    if (!isNaN(rim)) s.rest = { tok: rim, finoA: ora + (dur(hd('x-ratelimit-reset-tokens')) || 6e4) };
    if (res.ok) { s.k = 0; return; }
    if (res.status === 429) {
      const att = dur(hd('retry-after')) || Math.max(dur(hd('x-ratelimit-reset-tokens')), dur(hd('x-ratelimit-reset-requests'))) || Math.min(6e5, 15e3 * Math.pow(2, s.k));
      s.finoA = ora + Math.min(att, 6 * 36e5); s.k++;
    } else if (res.status === 413) { if (tok) s.tpm = Math.min(s.tpm, Math.floor(tok * 0.9)); }
    else if (res.status === 401 || res.status === 403) NO[p] = impronta(k);
    else if (res.status >= 500) RP[p] = { finoA: ora + 30e3, motivo: 'non raggiungibile' };
  }
  // al massimo 2 richieste in volo per fornitore
  const inVolo: Partial<Record<Prov, number>> = {}, attesa: Partial<Record<Prov, (() => void)[]>> = {};
  async function slot(p: Prov): Promise<void> {
    if ((inVolo[p] || 0) >= 2) { await new Promise<void>(r => (attesa[p] = attesa[p] || []).push(r)); return; }   // il posto viene passato da `libera`
    inVolo[p] = (inVolo[p] || 0) + 1;
  }
  function libera(p: Prov): void { const q = attesa[p], n = q && q.shift(); if (n) n(); else inVolo[p] = Math.max(0, (inVolo[p] || 0) - 1); }
  /** Una richiesta passando dal router: posto libero, esito registrato, errori di rete → fornitore in pausa 30 s. */
  async function manda(p: Prov, m: string, perc: string, k: string, corpo: any, tok: number): Promise<Response> {
    await slot(p);
    let res: Response;
    try { res = await richiesta(p, perc, k, corpo); }
    catch (e) { RP[p] = { finoA: Date.now() + 30e3, motivo: 'non raggiungibile' }; throw e; }
    finally { libera(p); }
    esito(p, m, res, tok, k);
    return res;
  }
  const ora2 = (t: number) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  /** Stato dei fornitori per le impostazioni. */
  function stato(): Record<Prov, { ok: boolean; finoA?: number; motivo?: string }> {
    const out = {} as Record<Prov, { ok: boolean; finoA?: number; motivo?: string }>, ora = Date.now();
    for (const p of PROVS) {
      const k = chiave(p), P = RP[p];
      if (!k) { out[p] = { ok: false, motivo: 'senza chiave' }; continue; }
      if (NO[p] === impronta(k)) { out[p] = { ok: false, motivo: 'chiave non valida' }; continue; }
      if (P && P.finoA > ora) { out[p] = { ok: false, finoA: P.finoA, motivo: P.motivo }; continue; }
      const ms = Object.keys(RM).filter(x => x.startsWith(p + ':')).map(x => RM[x]);
      if (ms.length && ms.every(s => s.finoA > ora)) { out[p] = { ok: false, finoA: Math.min(...ms.map(s => s.finoA)), motivo: 'limite gratuito' }; continue; }
      out[p] = { ok: true };
    }
    return out;
  }

  const errore = (j: any, stato: number) => { const e: any = new Error((j && (j.error && j.error.message || j[0] && j[0].error && j[0].error.message)) || 'errore ' + stato); e.stato = stato; return e; };
  const contenuto = (j: any) => String(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '');
  /** `tronca: false` = non accorciare il testo per farlo stare in un modello piccolo (salta e basta). */
  type Opz = { temp?: number; evita?: string; maxOut?: number; tronca?: boolean };
  /** Un tentativo con un modello (più l'eventuale riprova senza modalità JSON / per JSON illeggibile). */
  async function tenta(f: Fornitore, m2: Msg[], o: Opz, comeJson: boolean, tok: number): Promise<{ testo: string; j?: any; prov: Prov; modello: string }> {
    const k = chiave(f.prov);
    const corpo: any = { model: f.modello, temperature: o.temp == null ? .3 : o.temp, messages: m2 };
    if (o.maxOut) corpo[f.prov === 'groq' ? 'max_completion_tokens' : 'max_tokens'] = o.maxOut;
    if (comeJson) corpo.response_format = { type: 'json_object' };
    let res = await manda(f.prov, f.modello, '/chat/completions', k, corpo, tok);
    if (res.status === 400 && corpo.response_format) { delete corpo.response_format; res = await manda(f.prov, f.modello, '/chat/completions', k, corpo, tok); }   // modello senza modalità JSON
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw errore(j, res.status);
    const t = contenuto(j);
    if (!comeJson) { const s = t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim(); if (!s) throw new Error('risposta vuota'); return { testo: s, prov: f.prov, modello: f.modello }; }
    try { return { testo: t, j: json(t), prov: f.prov, modello: f.modello }; } catch (_) { /* una sola riprova, sotto */ }
    // v0.45: JSON illeggibile → una riprova con lo stesso modello chiedendo solo JSON valido
    corpo.messages = [...m2, { role: 'assistant', content: String(t).slice(0, 2000) }, { role: 'user', content: 'Rispondi solo con JSON valido, senza testo prima o dopo. Nelle stringhe scrivi i backslash del LaTeX doppi (\\\\frac).' }];
    const res2 = await manda(f.prov, f.modello, '/chat/completions', k, corpo, tok), j2 = await res2.json().catch(() => ({}));
    if (!res2.ok) throw errore(j2, res2.status);
    const t2 = contenuto(j2);
    return { testo: t2, j: json(t2), prov: f.prov, modello: f.modello };
  }
  /** Cuore del gateway: 1° giro sui modelli in cui il testo sta per intero; 2° giro (salvo `tronca:false`) accorciando il testo
   *  per i modelli più piccoli. Salta i modelli in pausa o con chiave rifiutata. */
  async function invia(msgs: Msg[], r: Ruolo, o: Opz, comeJson: boolean): Promise<{ testo: string; j?: any; prov: Prov; modello: string }> {
    await Spiega.pronta();
    const forn = await catena(r, o.evita); if (!forn.length) throw new Error('Manca la chiave AI gratuita: inseriscila in Altro → Spiegazioni AI (Groq, ed eventualmente Gemini).');
    const out = o.maxOut || USCITA[r], tok = stimaTok(msgs);
    const errori: string[] = [], grandi: Fornitore[] = [], saltati: string[] = []; let ultimo: any = null, solo401 = true, provati = 0;
    const prova = async (f: Fornitore, m2: Msg[], t: number) => {
      provati++;
      try { return await tenta(f, m2, o, comeJson, t); }
      catch (e: any) { ultimo = e; if (e.stato !== 401 && e.stato !== 403) solo401 = false; errori.push(f.nome + ': ' + String(e.message || e).slice(0, 80)); return null; }
    };
    for (const f of forn) {
      const b = bloccato(f.prov, f.modello, tok + out, chiave(f.prov)); if (b) { saltati.push(b); continue; }
      if (tok > budget(f.prov, f.modello, out)) { grandi.push(f); continue; }
      const x = await prova(f, msgs, tok); if (x) return x;
    }
    if (o.tronca !== false) for (const f of grandi) {
      const bud = budget(f.prov, f.modello, out);
      if (bud < 300 || bloccato(f.prov, f.modello, bud + out, chiave(f.prov))) continue;
      const x = await prova(f, accorcia(msgs, Math.floor(bud * 3.5)), bud); if (x) return x;
    }
    if (!provati) {
      if (saltati.length && saltati.every(s => s === 'chiave non valida')) throw new Error('Chiave AI non valida: controllala in Altro → Spiegazioni AI.');
      if (!saltati.length) throw new Error('Il testo è troppo lungo per i modelli disponibili: accorcialo, oppure aggiungi la chiave Gemini.');
      const fino = forn.map(f => Math.max(sm(f.prov, f.modello).finoA, (RP[f.prov] || { finoA: 0 }).finoA)).filter(t => t > Date.now());
      throw new Error('Tutti i modelli AI sono in pausa per i limiti gratuiti' + (fino.length ? ': riprova verso le ' + ora2(Math.min(...fino)) : '') + '.');
    }
    if (solo401 && ultimo) throw new Error('Chiave AI non valida: controllala in Altro → Spiegazioni AI.');
    if (ultimo && ultimo.stato === 429) throw new Error('Limite gratuito raggiunto su tutti i modelli: riprova tra qualche minuto.');
    throw new Error(navigator.onLine === false ? 'Sei offline.' : 'Nessun modello ha risposto. ' + errori.slice(0, 3).join(' · '));
  }
  /** Chiede JSON al primo modello disponibile del ruolo. Restituisce anche chi ha risposto. */
  async function chiedi(msgs: Msg[], r: Ruolo, o: Opz = {}): Promise<{ j: any; modello: string; prov: Prov }> {
    const x = await invia(msgs, r, o, true); return { j: x.j, modello: x.modello, prov: x.prov };
  }
  /** Testo libero (spiegazioni) o visione (content con image_url). */
  const testo = (msgs: Msg[], r: Ruolo, o: Opz = {}) => invia(msgs, r, o, false);
  /** Trascrizione audio con Whisper di Groq. Restituisce la risposta grezza (verbose_json: segments, duration…). */
  async function trascrivi(b: Blob, o: { nome?: string; modello?: string; prompt?: string; lingua?: string } = {}): Promise<any> {
    await Spiega.pronta();
    const k = chiave('groq'); if (!k) throw new Error('Manca la chiave Groq: inseriscila in Altro → Spiegazioni AI.');
    const mod = o.modello || 'whisper-large-v3-turbo', b0 = bloccato('groq', mod, 0, k);
    if (b0 === 'chiave non valida') throw new Error('Chiave Groq non valida.');
    if (b0) throw new Error('Limite gratuito di Groq raggiunto (audio): riprova verso le ' + ora2(Math.max(sm('groq', mod).finoA, (RP.groq || { finoA: 0 }).finoA)) + '.');
    const f = new FormData();
    f.append('file', b, o.nome || 'audio.webm'); f.append('model', mod); f.append('language', o.lingua || 'it'); f.append('response_format', 'verbose_json'); f.append('temperature', '0');
    if (o.prompt) f.append('prompt', o.prompt.slice(0, 800));
    const r = await manda('groq', mod, '/audio/transcriptions', k, f, 0);
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Chiave Groq non valida.');
    if (r.status === 429) throw new Error('Limite gratuito di Groq raggiunto (audio): riprova tra un po\'.');
    if (!r.ok) throw errore(j, r.status);
    return j;
  }
  /** Campo per la chiave Gemini (facoltativa) dentro Altro → Spiegazioni AI. */
  function campoGemini(): HTMLElement {
    const inp = h('input', { type: 'text', placeholder: 'AQ.… oppure AIza… (facoltativa)', value: chiave('gemini'), autocomplete: 'off', autocapitalize: 'none', spellcheck: false, style: { fontFamily: 'monospace' } }) as HTMLInputElement;
    const salva = () => { const v = inp.value.replace(/\s+/g, ''); inp.value = v; impostaChiave('gemini', v); avviso(v ? (formatoOk('gemini', v) ? 'Chiave Gemini salvata su questo dispositivo (vanno bene sia le nuove «AQ.» sia le vecchie «AIza»).' : 'Salvata, ma non sembra una chiave Gemini (inizia con AQ. o AIza).') : 'Chiave Gemini rimossa.', 5000); };
    const prova = async () => { salva(); try { const g = await disponibili('gemini'); if (g === null || (g && !g.length)) throw new Error('Google non accetta questa chiave: controlla di averla copiata intera da aistudio.google.com (API key).'); const r = await chiedi([{ role: 'user', content: 'Rispondi in JSON: {"ok":true}' }], 'genera'); avviso('✅ Funziona: ' + r.modello + ' · modelli Gemini disponibili: ' + g.filter(x => /gemini/.test(x)).length, 7000); } catch (e: any) { avviso(String(e.message || e), 9000); } };
    return h('div.gruppo', null,
      h('div.tenue.piccolo', null, 'Facoltativa: chiave gratuita di Google AI Studio (aistudio.google.com → «Get API key», senza carta). Serve per leggere PDF lunghi quando l\'app crea i quiz; senza, si usa Groq.'),
      h('div.riga', null, h('span', null, 'Chiave Gemini'), inp),
      h('div.bottoni', null, h('button.btn.neutro', { onclick: salva }, 'Salva'), h('button.btn.neutro', { onclick: prova }, 'Prova')));
  }
  /** Altri fornitori facoltativi + stato di tutti i fornitori (Altro → Spiegazioni AI). */
  function campoAltri(): HTMLElement {
    const DOVE: Record<string, string> = { mistral: 'console.mistral.ai (piano gratuito)', cohere: 'dashboard.cohere.com (chiave di prova)', openrouter: 'openrouter.ai (solo modelli «:free»)', requesty: 'requesty.ai' };
    const elenco = h('div.tenue.piccolo', null);
    const aggiorna = () => {
      const st = stato(); elenco.textContent = '';
      for (const p of PROVS) {
        const x = st[p];
        const d = x.ok ? '✅ pronto' : x.motivo === 'senza chiave' ? '—' : x.motivo === 'chiave non valida' ? '❌ chiave non valida'
          : '⏳ in pausa fino alle ' + ora2(x.finoA || Date.now()) + (x.motivo === 'non raggiungibile' ? ' (non raggiungibile)' : '');
        elenco.appendChild(h('div', null, NOMI[p] + ': ' + d));
      }
    };
    const righe = ALTRI.map(p => {
      const inp = h('input', { type: 'text', placeholder: DOVE[p], value: chiave(p), autocomplete: 'off', autocapitalize: 'none', spellcheck: false, style: { fontFamily: 'monospace' } }) as HTMLInputElement;
      const salva = () => { const v = inp.value.replace(/\s+/g, ''); inp.value = v; impostaChiave(p, v); aggiorna();
        avviso(v ? (formatoOk(p, v) ? 'Chiave ' + NOMI[p] + ' salvata su questo dispositivo.' : 'Salvata, ma non sembra una chiave ' + NOMI[p] + '.') : 'Chiave ' + NOMI[p] + ' rimossa.', 5000); };
      return h('div.riga', null, h('span', null, NOMI[p]), inp, h('button.btn.neutro', { onclick: salva }, 'Salva'));
    });
    aggiorna();
    return h('div.gruppo', null,
      h('details', null, h('summary', null, 'Altri fornitori AI (facoltativi)'),
        h('div.tenue.piccolo', null, 'Usati solo se Groq e Gemini sono in pausa o mancano. Chiavi salvate solo su questo dispositivo.'), ...righe),
      h('div.piccolo', null, 'Stato dei fornitori'), elenco,
      h('div.bottoni', null, h('button.btn.neutro', { onclick: aggiorna }, 'Aggiorna stato')));
  }
  return { chiedi, testo, json: (msgs: Msg[], r: Ruolo, o?: Opz) => chiedi(msgs, r, o).then(x => x.j), trascrivi, campoGemini, campoAltri, disponibili, catena, scegli, accorcia, parseJsonSicuro,
    chiave, impostaChiave, tutteChiavi, formatoOk, stato, azzera, ALTRI, _r: { stimaTok, budget, dur, get RM() { return RM; } },
    get gemini() { return !!chiave('gemini'); } };
})();
