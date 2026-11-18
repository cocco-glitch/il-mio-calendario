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
// cambia, massimo 2 richieste in volo per fornitore. Fornitori facoltativi: xkiro, Cohere, Requesty
// (chiavi solo in 'imc-ai-keys').
// v0.51 (BP1 §11): PROVIDER_FREE_QUOTAS con soglia di guardia all'85% e contatori locali a finestra mobile
// ('imc-ai-uso'), perché via CORS le intestazioni x-ratelimit-* spesso non arrivano. Gemini parte da flash-lite.
// Opzioni in 'imc-ai-opzioni': strictPrivacy (salta i fornitori con trainsOnFreeTier), xkiroTelegramVerified.
// v0.53: tolti Mistral e OpenRouter; nuovo fornitore nativo xkiro (OpenAI Chat Completions, Bearer), subito dopo
// Gemini e Groq in ogni catena. Chiavi/opzioni/contatori salvati che li citano ancora vengono ignorati e ripuliti.
// =====================================================================

const IA = (() => {
  type Prov = 'groq' | 'gemini' | 'xkiro' | 'cohere' | 'requesty' | 'cerebras' | 'sambanova';
  type Ruolo = 'genera' | 'revisiona' | 'veloce' | 'visione' | 'lungo' | 'micro';
  type Msg = { role: string; content: any };
  type Fornitore = { nome: string; prov: Prov; modello: string; gem: boolean };
  const PROVS: Prov[] = ['groq', 'gemini', 'xkiro', 'cohere', 'requesty', 'cerebras', 'sambanova'];
  const ALTRI: Prov[] = ['xkiro', 'cohere', 'requesty', 'cerebras', 'sambanova'];
  const NOMI: Record<Prov, string> = { groq: 'Groq', gemini: 'Gemini', xkiro: 'xkiro', cohere: 'Cohere', requesty: 'Requesty', cerebras: 'Cerebras', sambanova: 'SambaNova' };
  /** Fornitori tolti (v0.53): le loro chiavi, opzioni e contatori salvati si ignorano e si ripuliscono in silenzio. */
  const RITIRATI = ['mistral', 'openrouter'];
  const eProv = (p: string): p is Prov => (PROVS as string[]).includes(p);
  const BASE: Record<Prov, string> = {
    groq: 'https://api.groq.com/openai/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta/openai', xkiro: 'https://api.xkiro.com/v1',
    cohere: 'https://api.cohere.ai/compatibility/v1', requesty: 'https://router.requesty.ai/v1',
    // v0.54 (BP3): due fornitori veloci in coda a ogni catena (OpenAI-compatibili, Bearer)
    cerebras: 'https://api.cerebras.ai/v1', sambanova: 'https://api.sambanova.ai/v1' };

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
    for (const p of Object.keys(ch)) if (!eProv(p)) { delete (ch as any)[p]; cambiato = true; }   // v0.53: fornitori ritirati
    for (const p of ['groq', 'gemini'] as Prov[]) {
      const v = ls(LEG[p]!) || '';
      if (v !== (ch[p] || '')) { if (v) ch[p] = v; else delete ch[p]; cambiato = true; }
    }
    if (cambiato && (a || Object.keys(ch).length)) lsScrivi(KK, JSON.stringify({ v: 2, chiavi: ch }));
    return ch;
  }
  const chiave = (p: Prov): string => allinea()[p] || '';
  function impostaChiave(p: Prov, v: string): void {
    if (!eProv(p)) return;   // v0.53: fornitore ritirato (es. chiave Mistral recuperata da Drive) → ignorato
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
  const FORMATO: Partial<Record<Prov, RegExp>> = { groq: /^gsk_/, gemini: /^(AIza|AQ\.)/ };
  const formatoOk = (p: Prov, v: string) => { const re = FORMATO[p]; return !v || !re || re.test(v); };

  // ---- Discovery per pattern (BP1 §4.3) ----
  const PATTERN: Record<Prov, Partial<Record<Ruolo, RegExp[]>>> = {
    groq: { micro: [/gpt-oss-20b/, /gpt-oss/, /8b-instant/], genera: [/gpt-oss-120b/, /gpt-oss/], revisiona: [/gpt-oss-120b/, /gpt-oss/], veloce: [/gpt-oss-20b/, /gpt-oss/], visione: [/qwen.*(vl|\d\.\d+-\d+b)/, /scout|maverick|vision/] },
    // v0.51: flash-lite di base (500 richieste/giorno gratis contro le 20 di flash); flash resta come riserva
    gemini: { micro: [/flash-lite/], genera: [/flash-lite/, /gemini-\d.*flash(?!-lite)/], veloce: [/flash-lite/, /flash/], lungo: [/flash-lite/, /gemini-\d.*flash(?!-lite)/, /pro/], visione: [/flash-lite/, /gemini-\d.*flash(?!-lite)/], revisiona: [/hydrogen|pro/, /flash(?!-lite)/] },
    // xkiro: solo ID con prefisso vendor («vendor/modello»), vedi `scegli`
    xkiro: { micro: [/nemotron/, /deepseek/], genera: [/deepseek-v\d.*pro/, /kimi/, /nemotron/], revisiona: [/kimi/, /deepseek/], veloce: [/nemotron/, /deepseek/], lungo: [/kimi/, /deepseek/], visione: [/nemotron.*-vl/, /-vl\b/] },
    cohere: { genera: [/command-a(?!.*(vision|reasoning|translate))/, /command-r-plus/, /command/], revisiona: [/command-a(?!.*(vision|reasoning|translate))/, /command-r-plus/] },
    requesty: { genera: [/gemini.*flash(?!-lite)/, /gpt-.*mini/, /llama/], veloce: [/flash-lite|mini|small/] },
    cerebras: { genera: [/gpt-oss-120b/, /qwen-3.*(235b|480b)/, /llama/], revisiona: [/gpt-oss-120b/, /qwen-3/], veloce: [/llama.*8b|gpt-oss/, /qwen-3/], lungo: [/gpt-oss-120b/, /qwen-3/] },
    sambanova: { genera: [/gpt-oss-120b/, /deepseek-v3/i, /llama-3.3/i], revisiona: [/deepseek/i, /gpt-oss/], veloce: [/llama.*8b/i, /gpt-oss/], lungo: [/deepseek/i, /llama-3.3/i], visione: [/llama-4|vision/i] },
  };
  /** Modelli gratuiti consigliati su xkiro (ID sempre con prefisso vendor obbligatorio). */
  const XKIRO_FREE = ['deepseek/deepseek-v4-pro-0813', 'moonshotai/kimi-k3-agent', 'nvidia/nemotron-3.5-super-vl'];
  /** Usati solo se /models non risponde e non c'è nulla in memoria. */
  const RISERVA: Record<Prov, Partial<Record<Ruolo, string[]>>> = {
    groq: { micro: ['openai/gpt-oss-20b', 'llama-3.1-8b-instant'], genera: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], revisiona: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], veloce: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'], visione: ['qwen/qwen3.8-27b'] },
    gemini: { micro: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'], genera: ['gemini-3.1-flash-lite', 'gemini-3.8-flash'], veloce: ['gemini-3.1-flash-lite', 'gemini-3.8-flash'], lungo: ['gemini-3.1-flash-lite', 'gemini-3.8-flash'], visione: ['gemini-3.1-flash-lite', 'gemini-3.8-flash'], revisiona: ['gemini-4-hydrogen', 'gemini-3.8-flash'] },
    xkiro: { micro: ['nvidia/nemotron-3.5-super-vl'], genera: [...XKIRO_FREE], revisiona: ['moonshotai/kimi-k3-agent', 'deepseek/deepseek-v4-pro-0813'], veloce: ['nvidia/nemotron-3.5-super-vl', 'deepseek/deepseek-v4-pro-0813'],
      lungo: ['moonshotai/kimi-k3-agent', 'deepseek/deepseek-v4-pro-0813'], visione: ['nvidia/nemotron-3.5-super-vl'] },
    cohere: {}, requesty: {},
    cerebras: { genera: ['gpt-oss-120b', 'qwen-3-235b-a22b-instruct-2507'], revisiona: ['gpt-oss-120b'], veloce: ['llama3.1-8b', 'gpt-oss-120b'], lungo: ['gpt-oss-120b'] },
    sambanova: { genera: ['gpt-oss-120b', 'DeepSeek-V3.1', 'Meta-Llama-3.3-70B-Instruct'], revisiona: ['DeepSeek-V3.1'], veloce: ['Meta-Llama-3.1-8B-Instruct'], lungo: ['DeepSeek-V3.1'] },
  };
  const CATENA: Record<Ruolo, Prov[]> = {
    veloce: ['groq', 'gemini', 'xkiro', 'requesty', 'cerebras', 'sambanova'], genera: ['gemini', 'groq', 'xkiro', 'cohere', 'requesty', 'cerebras', 'sambanova'],
    revisiona: ['groq', 'gemini', 'xkiro', 'cohere', 'cerebras', 'sambanova'], lungo: ['gemini', 'xkiro', 'cerebras', 'sambanova'], visione: ['gemini', 'groq', 'xkiro', 'sambanova'],
    // v0.54 (BP3 §2, imbuto livello 2): micro-spiegazione ≤350 token, solo fascia veloce
    micro: ['gemini', 'groq', 'xkiro'] };
  const ESCLUSI = /guard|whisper|tts|orpheus|playai|embed|imagen|veo|image|audio|live|aqa|learnlm|compound|moderation|ocr|rerank/i;
  const versione = (id: string) => { const m = /(\d+(?:\.\d+)?)/.exec(id.replace(/^.*\//, '')); return m ? parseFloat(m[1]) : 0; };
  const instabile = (id: string) => /preview|exp/i.test(id);
  /** Sceglie fino a 3 modelli per il ruolo, nell'ordine dei pattern; a parità la versione più alta. */
  function scegli(p: Prov, r: Ruolo, lista: string[] | null): string[] {
    const pat = PATTERN[p][r]; if (!pat) return [];
    if (p === 'xkiro' && lista) lista = lista.filter(m => m.includes('/'));   // prefisso vendor obbligatorio
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
  /** v0.52 (BP2 §2): con un archetipo disciplinare i fornitori del ruolo si riordinano secondo la sua catena preferita
   *  (solo quelli che il gateway conosce; gli altri restano dopo, nell'ordine di sempre). Senza archetipo nulla cambia. */
  function ordinePerArchetipo(lista: Prov[], archetipo?: string): Prov[] {
    const pref = archetipo ? Dominio.catenaPreferita(archetipo) : [];
    if (!pref.length) return lista;
    const pos = (p: Prov) => { const i = pref.indexOf(p); return i < 0 ? pref.length : i; };
    return lista.map((p, i) => ({ p, i })).sort((x, y) => pos(x.p) - pos(y.p) || x.i - y.i).map(x => x.p);
  }
  async function catena(r: Ruolo, evita?: string, archetipo?: string): Promise<Fornitore[]> {
    const priv = !!opzioni().strictPrivacy;   // v0.51: con Strict Privacy si saltano i fornitori che addestrano sui dati gratuiti
    const provs = ordinePerArchetipo(CATENA[r], archetipo).filter(p => chiave(p) && !(priv && PROVIDER_FREE_QUOTAS[p].trainsOnFreeTier));
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
    groq: { tpm: 8000, ctx: 131072 }, gemini: { tpm: 250000, ctx: 1e6 }, xkiro: { tpm: 100000, ctx: 128000 },
    cohere: { tpm: 20000, ctx: 128000 }, requesty: { tpm: 20000, ctx: 32000 }, cerebras: { tpm: 60000, ctx: 65536 }, sambanova: { tpm: 20000, ctx: 32768 } };
  /** Token di risposta attesi per ruolo: contano solo nel budget (non si inviano: i token di ragionamento li consumerebbero). */
  const USCITA: Record<Ruolo, number> = { genera: 1500, revisiona: 1000, veloce: 500, visione: 4096, lungo: 3000, micro: 350 };

  // ---- Quote dei piani gratuiti e contatori locali (BP1 §11, v0.51) ----
  /** `rpd` assente = nessun tetto di richieste al giorno; `tpd` = token al giorno. */
  type Quota = { rpm: number; rpd?: number; tpm?: number; tpd?: number };
  /** `potenziata`: quota più alta se l'utente ha attivato l'opzione indicata (es. xkiro verificato con Telegram). */
  type QuotaProv = { base: Quota; perModello?: boolean; modelli?: { re: RegExp; q: Quota }[]; trainsOnFreeTier?: boolean; potenziata?: { opz: keyof OpzIA; q: Quota } };
  /** Limiti gratuiti noti. `perModello`: la quota è di ogni modello (Gemini, Groq), altrimenti dell'intero account.
   *  Il router si ferma a `SOGLIA` (85%) e passa al fornitore seguente; il resto si usa solo se non c'è alternativa. */
  const PROVIDER_FREE_QUOTAS: Record<Prov, QuotaProv> = {
    gemini: { perModello: true, base: { rpm: 5, rpd: 20, tpm: 250000 }, modelli: [
      { re: /flash-lite/, q: { rpm: 12, rpd: 500, tpm: 250000 } }, { re: /flash/, q: { rpm: 5, rpd: 20, tpm: 250000 } }] },
    xkiro: { base: { rpm: 20, tpd: 500000 }, potenziata: { opz: 'xkiroTelegramVerified', q: { rpm: 20, tpd: 1000000 } } },
    cohere: { base: { rpm: 20, rpd: 33 } },
    requesty: { base: { rpm: 20, rpd: 200 } },
    // v0.54: quote gratuite prudenti (da verificare dal vivo)
    cerebras: { base: { rpm: 30, rpd: 14400, tpd: 1000000 } },
    sambanova: { base: { rpm: 20, rpd: 1000 } },
    groq: { perModello: true, base: { rpm: 30, rpd: 1000 }, modelli: [
      { re: /8b-instant/, q: { rpm: 30, rpd: 14400 } }, { re: /70b-versatile/, q: { rpm: 30, rpd: 1000 } }, { re: /whisper/, q: { rpm: 20, rpd: 2000 } }] },
  };
  const SOGLIA = 0.85;
  /** Opzioni AI del dispositivo: Strict Privacy (salta i fornitori con `trainsOnFreeTier`) e account xkiro verificato con Telegram. */
  type OpzIA = { strictPrivacy?: boolean; xkiroTelegramVerified?: boolean };
  const OPZ_NOTE: (keyof OpzIA)[] = ['strictPrivacy', 'xkiroTelegramVerified'];
  const KO = 'imc-ai-opzioni', KU = 'imc-ai-uso';
  /** Solo le opzioni note (v0.53: es. `openrouterHasCredits10Usd` salvata da versioni vecchie si ignora). */
  function opzioni(): OpzIA {
    try { const j = JSON.parse(ls(KO) || '{}'), o: OpzIA = {}; if (j && typeof j === 'object') for (const n of OPZ_NOTE) if (j[n] === true) o[n] = true; return o; } catch (_) { return {}; }
  }
  function impostaOpzione(n: keyof OpzIA, v: boolean): void {
    const o = opzioni(); if (v) o[n] = true; else delete o[n];
    lsScrivi(KO, Object.keys(o).length ? JSON.stringify(o) : '');
  }
  /** Quota e chiave dei contatori per «fornitore:modello» (o solo «fornitore» se la quota è dell'account). */
  function quota(p: Prov, m: string): { id: string; q: Quota } {
    const Q = PROVIDER_FREE_QUOTAS[p], x = Q.modelli && Q.modelli.find(e => e.re.test(m));
    const q = Q.potenziata && opzioni()[Q.potenziata.opz] ? Q.potenziata.q : x ? x.q : Q.base;
    return { id: Q.perModello ? p + ':' + m : p, q };
  }
  // Contatori a finestra mobile, salvati in localStorage['imc-ai-uso'] = { id: { g: giorno, n: richieste oggi, w: [[ora, token]…] ultimi 60 s, q?: pausa fino a } }
  type Uso = { g: string; n: number; w: [number, number][]; q?: number; t?: number };   // t = token di oggi (per `tpd`)
  const giorno = (t: number) => { const d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const mezzanotte = () => { const d = new Date(Date.now()); d.setHours(24, 0, 0, 0); return d.getTime(); };
  function tuttoUso(): Record<string, Uso> { try { const j = JSON.parse(ls(KU) || '{}'); return j && typeof j === 'object' ? j : {}; } catch (_) { return {}; } }
  function contatori(id: string): { rpm60s: number; tpm60s: number; rpdToday: number; tpdToday: number; finoA: number } {
    const ora = Date.now(), u = tuttoUso()[id], w = u && Array.isArray(u.w) ? u.w.filter(x => ora - x[0] < 6e4) : [], oggi = !!u && u.g === giorno(ora);
    return { rpm60s: w.length, tpm60s: w.reduce((s, x) => s + (x[1] || 0), 0), rpdToday: oggi ? u.n || 0 : 0, tpdToday: oggi ? u.t || 0 : 0, finoA: u && u.q && u.q > ora ? u.q : 0 };
  }
  function aggiornaUso(id: string, f: (u: Uso) => void): void {
    const tutto = tuttoUso(), ora = Date.now(), g = giorno(ora), v = tutto[id];
    const u: Uso = v && v.g === g ? { ...v, w: (Array.isArray(v.w) ? v.w : []).filter(x => ora - x[0] < 6e4) } : { g, n: 0, w: [] };
    if (v && v.q && v.q > ora) u.q = v.q; else delete u.q;
    f(u); tutto[id] = u;
    for (const k of Object.keys(tutto)) { const x = tutto[k]; if ((x.g !== g && !(x.q && x.q > ora)) || RITIRATI.includes(k.split(':')[0])) delete tutto[k]; }   // via i giorni passati e i fornitori ritirati
    lsScrivi(KU, JSON.stringify(tutto));
  }
  /** Vero se la prossima richiesta porterebbe un contatore oltre `lim` (0,85 = soglia di guardia; 1 = limite vero). */
  function quotaPiena(p: Prov, m: string, tok: number, lim = SOGLIA): boolean {
    const { id, q } = quota(p, m), c = contatori(id);
    return c.rpm60s + 1 > q.rpm * lim || (!!q.rpd && c.rpdToday + 1 > q.rpd * lim) || (!!q.tpm && c.tpm60s + tok > q.tpm * lim) || (!!q.tpd && c.tpdToday + tok > q.tpd * lim);
  }
  /** Intestazioni di limite lette solo se esistono (`get(...) !== null`): via CORS molti fornitori non le espongono
   *  e allora valgono i contatori locali. Durate in millisecondi. */
  function parseRateLimitInfo(res: Response): { remainingRequests?: number; remainingTokens?: number; limitTokens?: number; resetRequests?: number; resetTokens?: number; retryAfter?: number } {
    const g = (n: string): string | null => { try { return res.headers.get(n); } catch (_) { return null; } };
    const num = (n: string) => { const v = g(n); if (v === null) return undefined; const x = parseInt(v, 10); return isNaN(x) ? undefined : x; };
    const tempo = (n: string) => { const v = g(n); return v === null ? undefined : dur(v); };
    return { remainingRequests: num('x-ratelimit-remaining-requests'), remainingTokens: num('x-ratelimit-remaining-tokens'), limitTokens: num('x-ratelimit-limit-tokens'),
      resetRequests: tempo('x-ratelimit-reset-requests'), resetTokens: tempo('x-ratelimit-reset-tokens'), retryAfter: tempo('retry-after') };
  }
  /** `retryDelay` nel corpo di un 429 di Gemini (error.details[].retryDelay, es. «37s»); anche nella forma ad array. */
  function ritardoCorpo(j: any): number {
    const e = Array.isArray(j) ? j[0] && j[0].error : j && j.error, d = e && Array.isArray(e.details) ? e.details : [];
    for (const x of d) if (x && x.retryDelay) return dur(String(x.retryDelay));
    return 0;
  }
  type StatoM = { finoA: number; k: number; tpm: number; rest?: { tok: number; finoA: number } };
  let RM: Record<string, StatoM> = {};                                  // per «fornitore:modello»
  let RP: Partial<Record<Prov, { finoA: number; motivo: string }>> = {};   // pausa dell'intero fornitore
  let NO: Partial<Record<Prov, string>> = {};                            // impronta della chiave rifiutata
  const impronta = (k: string) => k.slice(-6) + k.length;
  function sm(p: Prov, m: string): StatoM { const id = p + ':' + m; return RM[id] || (RM[id] = { finoA: 0, k: 0, tpm: LIMITI[p].tpm }); }
  function azzera(p?: Prov): void {
    if (!p) { RM = {}; RP = {}; NO = {}; lsScrivi(KU, ''); return; }   // azzeramento completo: anche i contatori
    delete RP[p]; delete NO[p]; for (const k of Object.keys(RM)) if (k.startsWith(p + ':')) delete RM[k];
    const t = tuttoUso(); let c = false;   // chiave nuova: via le pause salvate (i conteggi restano)
    for (const k of Object.keys(t)) if ((k === p || k.startsWith(p + ':')) && t[k].q) { delete t[k].q; c = true; }
    if (c) lsScrivi(KU, JSON.stringify(t));
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
    if (contatori(quota(p, m).id).finoA > ora) return 'in pausa';
    if (quotaPiena(p, m, serve)) return 'quota';   // oltre l'85%: si preferisce un altro fornitore
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
  async function esito(p: Prov, m: string, res: Response, tok: number, k: string): Promise<void> {
    const ri = parseRateLimitInfo(res), s = sm(p, m), ora = Date.now(), { id, q } = quota(p, m);
    if (ri.limitTokens && ri.limitTokens > 0) s.tpm = ri.limitTokens;
    if (ri.remainingTokens !== undefined) s.rest = { tok: ri.remainingTokens, finoA: ora + (ri.resetTokens || 6e4) };
    if (ri.remainingRequests === 0) s.finoA = Math.max(s.finoA, ora + Math.min(ri.resetRequests || 6e4, 6 * 36e5));
    if (res.status !== 429) aggiornaUso(id, u => { u.n++; u.w.push([ora, tok]); u.t = (u.t || 0) + tok; });   // il 429 non consuma quota
    if (res.ok) { s.k = 0; return; }
    if (res.status === 429) {
      // retry-after → retryDelay nel corpo (Gemini) → reset delle intestazioni → 65 s, o fino a mezzanotte se la quota del giorno è quasi finita
      let att = ri.retryAfter || 0;
      if (!att) att = ritardoCorpo(await res.clone().json().catch(() => null));
      if (!att) att = Math.max(ri.resetTokens || 0, ri.resetRequests || 0);
      const cg = contatori(id), giornoPieno = (!!q.rpd && cg.rpdToday >= q.rpd * SOGLIA) || (!!q.tpd && cg.tpdToday >= q.tpd * SOGLIA);
      const fino = att ? ora + Math.min(att, 6 * 36e5) : giornoPieno ? mezzanotte() : ora + 65e3;
      s.finoA = fino; s.k++;
      aggiornaUso(id, u => { u.q = Math.max(u.q || 0, fino); });
      return;
    }
    if (p === 'requesty' && (res.status === 404 || res.status === 410 || (res.status === 400
      && /expired|deprecat|not.?found|no longer|retired/i.test(JSON.stringify(await res.clone().json().catch(() => '')))))) {
      s.finoA = ora + 24 * 36e5; return;   // modello sparito o scaduto su Requesty: si passa subito al seguente
    }
    if (res.status === 413) { if (tok) s.tpm = Math.min(s.tpm, Math.floor(tok * 0.9)); }
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
    await esito(p, m, res, tok, k);
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
      if (opzioni().strictPrivacy && PROVIDER_FREE_QUOTAS[p].trainsOnFreeTier) { out[p] = { ok: false, motivo: 'privacy' }; continue; }
      if (P && P.finoA > ora) { out[p] = { ok: false, finoA: P.finoA, motivo: P.motivo }; continue; }
      const c = contatori(p); if (c.finoA > ora) { out[p] = { ok: false, finoA: c.finoA, motivo: 'limite gratuito' }; continue; }
      const ms = Object.keys(RM).filter(x => x.startsWith(p + ':')).map(x => RM[x]);
      if (ms.length && ms.every(s => s.finoA > ora)) { out[p] = { ok: false, finoA: Math.min(...ms.map(s => s.finoA)), motivo: 'limite gratuito' }; continue; }
      out[p] = { ok: true };
    }
    return out;
  }

  const errore = (j: any, stato: number) => { const e: any = new Error((j && (j.error && j.error.message || j[0] && j[0].error && j[0].error.message)) || 'errore ' + stato); e.stato = stato; return e; };
  const contenuto = (j: any) => String(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '');
  /** `tronca: false` = non accorciare il testo per farlo stare in un modello piccolo (salta e basta). */
  type Opz = { temp?: number; evita?: string; maxOut?: number; tronca?: boolean; archetipo?: string };   // v0.52: archetipo → ordine fornitori
  /** Un tentativo con un modello (più l'eventuale riprova senza modalità JSON / per JSON illeggibile). */
  async function tenta(f: Fornitore, m2: Msg[], o: Opz, comeJson: boolean, tok: number): Promise<{ testo: string; j?: any; prov: Prov; modello: string }> {
    const k = chiave(f.prov);
    const corpo: any = { model: f.modello, temperature: o.temp == null ? .3 : o.temp, messages: m2 };
    if (o.maxOut) corpo[f.prov === 'groq' ? 'max_completion_tokens' : 'max_tokens'] = o.maxOut;
    if (comeJson) corpo.response_format = { type: 'json_object' };
    let res = await manda(f.prov, f.modello, '/chat/completions', k, corpo, tok);
    if (res.status === 400 && corpo.response_format && !(f.prov === 'requesty' && sm(f.prov, f.modello).finoA > Date.now())) { delete corpo.response_format; res = await manda(f.prov, f.modello, '/chat/completions', k, corpo, tok); }   // modello senza modalità JSON
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
    const forn = await catena(r, o.evita, o.archetipo); if (!forn.length) throw new Error('Manca la chiave AI gratuita: inseriscila in Altro → Spiegazioni AI (Groq, ed eventualmente Gemini).');
    const out = o.maxOut || USCITA[r], tok = stimaTok(msgs);
    const errori: string[] = [], grandi: Fornitore[] = [], quasiPieni: Fornitore[] = [], saltati: string[] = []; let ultimo: any = null, solo401 = true, provati = 0;
    const prova = async (f: Fornitore, m2: Msg[], t: number) => {
      provati++;
      try { return await tenta(f, m2, o, comeJson, t); }
      catch (e: any) { ultimo = e; if (e.stato !== 401 && e.stato !== 403) solo401 = false; errori.push(f.nome + ': ' + String(e.message || e).slice(0, 80)); return null; }
    };
    for (const f of forn) {
      const b = bloccato(f.prov, f.modello, tok + out, chiave(f.prov)); if (b) { saltati.push(b); if (b === 'quota') quasiPieni.push(f); continue; }
      if (tok > budget(f.prov, f.modello, out)) { grandi.push(f); continue; }
      const x = await prova(f, msgs, tok); if (x) return x;
    }
    if (o.tronca !== false) for (const f of grandi) {
      const bud = budget(f.prov, f.modello, out);
      if (bud < 300 || bloccato(f.prov, f.modello, bud + out, chiave(f.prov))) continue;
      const x = await prova(f, accorcia(msgs, Math.floor(bud * 3.5)), bud); if (x) return x;
    }
    // ultimo giro: nessun altro ha risposto → si usa il 15% di quota tenuto da parte
    for (const f of quasiPieni) {
      if (quotaPiena(f.prov, f.modello, tok + out, 1) || tok > budget(f.prov, f.modello, out)) continue;
      const x = await prova(f, msgs, tok); if (x) return x;
    }
    if (!provati) {
      if (saltati.length && saltati.every(s => s === 'chiave non valida')) throw new Error('Chiave AI non valida: controllala in Altro → Spiegazioni AI.');
      if (!saltati.length) throw new Error('Il testo è troppo lungo per i modelli disponibili: accorcialo, oppure aggiungi la chiave Gemini.');
      const fino = forn.map(f => Math.max(sm(f.prov, f.modello).finoA, (RP[f.prov] || { finoA: 0 }).finoA, contatori(quota(f.prov, f.modello).id).finoA)).filter(t => t > Date.now());
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
    if (b0 === 'quota' ? quotaPiena('groq', mod, 0, 1) : b0) throw new Error('Limite gratuito di Groq raggiunto (audio): riprova verso le ' + ora2(Math.max(sm('groq', mod).finoA, (RP.groq || { finoA: 0 }).finoA, contatori(quota('groq', mod).id).finoA, Date.now() + 6e4)) + '.');
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
    const DOVE: Record<string, string> = { xkiro: 'api.xkiro.com (modelli gratuiti «vendor/modello»)', cohere: 'dashboard.cohere.com (chiave di prova)', requesty: 'requesty.ai', cerebras: 'cloud.cerebras.ai (chiave gratuita)', sambanova: 'cloud.sambanova.ai (chiave gratuita)' };
    const elenco = h('div.tenue.piccolo', null);
    const aggiorna = () => {
      const st = stato(); elenco.textContent = '';
      for (const p of PROVS) {
        const x = st[p];
        const d = x.ok ? '✅ pronto' : x.motivo === 'senza chiave' ? '—' : x.motivo === 'chiave non valida' ? '❌ chiave non valida'
          : x.motivo === 'privacy' ? '🔒 escluso (Strict Privacy)'
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
    const spunta = (n: keyof OpzIA, testo: string) => {
      const cb = h('input', { type: 'checkbox' }) as HTMLInputElement; cb.checked = !!opzioni()[n];
      cb.onchange = () => { impostaOpzione(n, cb.checked); aggiorna(); };
      return h('label.riga', null, cb, h('span', null, testo));
    };
    aggiorna();
    return h('div.gruppo', null,
      h('details', null, h('summary', null, 'Altri fornitori AI (facoltativi)'),
        h('div.tenue.piccolo', null, 'Usati solo se Groq e Gemini sono in pausa o mancano. Chiavi salvate solo su questo dispositivo.'), ...righe,
        PROVS.some(p => PROVIDER_FREE_QUOTAS[p].trainsOnFreeTier) ? spunta('strictPrivacy', 'Strict Privacy: non usare fornitori che addestrano i modelli sui dati del piano gratuito') : null,
        spunta('xkiroTelegramVerified', 'Account xkiro verificato con Telegram (1.000.000 token al giorno invece di 500.000)')),
      h('div.piccolo', null, 'Stato dei fornitori'), elenco,
      h('div.bottoni', null, h('button.btn.neutro', { onclick: aggiorna }, 'Aggiorna stato')));
  }
  /** v0.53: pulizia silenziosa una tantum dei dati dei fornitori ritirati (chiavi, opzioni, contatori, elenchi modelli). */
  (function ripulisci(): void {
    try {
      allinea();
      const j = JSON.parse(ls(KO) || 'null');
      if (j && typeof j === 'object' && Object.keys(j).some(n => !(OPZ_NOTE as string[]).includes(n))) { const o = opzioni(); lsScrivi(KO, Object.keys(o).length ? JSON.stringify(o) : ''); }
      const u = tuttoUso(); if (Object.keys(u).some(k => RITIRATI.includes(k.split(':')[0]))) { for (const k of Object.keys(u)) if (RITIRATI.includes(k.split(':')[0])) delete u[k]; lsScrivi(KU, Object.keys(u).length ? JSON.stringify(u) : ''); }
      const via: string[] = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) || ''; if (RITIRATI.some(r => k.startsWith('imc-modelli-' + r + ':'))) via.push(k); }
      via.forEach(k => localStorage.removeItem(k));
    } catch (_) { /* localStorage non disponibile: nulla da pulire */ }
  })();
  return { chiedi, testo, json: (msgs: Msg[], r: Ruolo, o?: Opz) => chiedi(msgs, r, o).then(x => x.j), trascrivi, campoGemini, campoAltri, disponibili, catena, ordinePerArchetipo, scegli, accorcia, parseJsonSicuro,
    chiave, impostaChiave, tutteChiavi, formatoOk, stato, azzera, ALTRI, PROVS, XKIRO_FREE, PROVIDER_FREE_QUOTAS, opzioni, impostaOpzione, parseRateLimitInfo,
    _r: { stimaTok, budget, dur, quota, contatori, quotaPiena, CATENA, get RM() { return RM; } },
    get gemini() { return !!chiave('gemini'); } };
})();
