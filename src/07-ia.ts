// =====================================================================
// 07-ia.ts — GATEWAY AI UNICO (v0.46, BP1 §4)
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
// =====================================================================

const IA = (() => {
  type Prov = 'groq' | 'gemini';
  type Ruolo = 'genera' | 'revisiona' | 'veloce' | 'visione' | 'lungo';
  type Msg = { role: string; content: any };
  type Fornitore = { nome: string; prov: Prov; modello: string; gem: boolean };
  const PROVS: Prov[] = ['groq', 'gemini'];
  const BASE: Record<Prov, string> = { groq: 'https://api.groq.com/openai/v1', gemini: 'https://generativelanguage.googleapis.com/v1beta/openai' };

  // ---- Chiavi (BP1 §4.1) ----
  const KK = 'imc-ai-keys', LEG: Record<Prov, string> = { groq: 'imc-groq-chiave', gemini: 'imc-gemini-chiave' };
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
    for (const p of PROVS) {
      const v = ls(LEG[p]) || '';
      if (v !== (ch[p] || '')) { if (v) ch[p] = v; else delete ch[p]; cambiato = true; }
    }
    if (cambiato && (a || Object.keys(ch).length)) lsScrivi(KK, JSON.stringify({ v: 2, chiavi: ch }));
    return ch;
  }
  const chiave = (p: Prov): string => allinea()[p] || '';
  function impostaChiave(p: Prov, v: string): void {
    v = String(v || '').replace(/\s+/g, ''); lsScrivi(LEG[p], v); allinea();
    for (const k in disp) if (k.startsWith(p + ':')) delete disp[k];
  }
  const tutteChiavi = (): Partial<Record<Prov, string>> => ({ ...allinea() });
  /** Avviso (non blocco) sul formato della chiave. */
  const formatoOk = (p: Prov, v: string) => !v || (p === 'groq' ? /^gsk_/.test(v) : /^(AIza|AQ\.)/.test(v));

  // ---- Discovery per pattern (BP1 §4.3) ----
  const PATTERN: Record<Prov, Partial<Record<Ruolo, RegExp[]>>> = {
    groq: { genera: [/gpt-oss-120b/, /gpt-oss/], revisiona: [/gpt-oss-120b/, /gpt-oss/], veloce: [/gpt-oss-20b/, /gpt-oss/], visione: [/qwen.*(vl|\d\.\d+-\d+b)/, /scout|maverick|vision/] },
    gemini: { genera: [/gemini-\d.*flash(?!-lite)/], veloce: [/flash-lite/, /flash/], lungo: [/gemini-\d.*flash(?!-lite)/, /pro/], visione: [/gemini-\d.*flash(?!-lite)/, /flash/], revisiona: [/hydrogen|pro/, /flash(?!-lite)/] },
  };
  /** Usati solo se /models non risponde e non c'è nulla in memoria. */
  const RISERVA: Record<Prov, Partial<Record<Ruolo, string[]>>> = {
    groq: { genera: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], revisiona: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], veloce: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'], visione: ['qwen/qwen3.8-27b'] },
    gemini: { genera: ['gemini-3.8-flash'], veloce: ['gemini-3.1-flash-lite', 'gemini-3.8-flash'], lungo: ['gemini-3.8-flash'], visione: ['gemini-3.8-flash'], revisiona: ['gemini-4-hydrogen', 'gemini-3.8-flash'] },
  };
  const CATENA: Record<Ruolo, Prov[]> = { veloce: ['groq', 'gemini'], genera: ['gemini', 'groq'], revisiona: ['groq', 'gemini'], lungo: ['gemini'], visione: ['gemini', 'groq'] };
  const ESCLUSI = /guard|whisper|tts|orpheus|playai|embed|imagen|veo|image|audio|live|aqa|learnlm|compound/i;
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
    const ch = p + ':' + k.slice(-6), cl = (p === 'gemini' ? 'g:' : 'q:') + k.slice(-6);
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
    provs.forEach((p, i) => { for (const m of scegli(p, r, liste[i])) if (m !== evita) out.push({ nome: (p === 'gemini' ? 'Gemini ' : 'Groq ') + m.replace(/^.*\//, ''), prov: p, modello: m, gem: p === 'gemini' }); });
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
  /** v0.44.2: Groq free = 8.000 token/minuto (input + output). 16.000 caratteri ≈ 4.600 token lasciano spazio alla risposta;
   *  prima erano 60.000 (≈17.000 token) e le richieste grandi tornavano 413 «Request too large». */
  const GROQ_CAR = 16000;
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
  const errore = (j: any, stato: number) => { const e: any = new Error((j && (j.error && j.error.message || j[0] && j[0].error && j[0].error.message)) || 'errore ' + stato); e.stato = stato; return e; };
  const contenuto = (j: any) => String(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '');
  type Opz = { temp?: number; evita?: string; maxOut?: number };
  /** Cuore del gateway: prova i modelli della catena del ruolo finché uno risponde. Con `comeJson` legge il JSON (una riprova se illeggibile). */
  async function invia(msgs: Msg[], r: Ruolo, o: Opz, comeJson: boolean): Promise<{ testo: string; j?: any; prov: Prov; modello: string }> {
    await Spiega.pronta();
    const forn = await catena(r, o.evita); if (!forn.length) throw new Error('Manca la chiave AI gratuita: inseriscila in Altro → Spiegazioni AI (Groq, ed eventualmente Gemini).');
    const errori: string[] = []; let ultimo: any = null, solo401 = true;
    for (const f of forn) {
      const m2 = accorcia(msgs, f.gem ? 600000 : GROQ_CAR), k = chiave(f.prov);
      try {
        const corpo: any = { model: f.modello, temperature: o.temp == null ? .3 : o.temp, messages: m2 };
        if (o.maxOut) corpo[f.gem ? 'max_tokens' : 'max_completion_tokens'] = o.maxOut;
        if (comeJson) corpo.response_format = { type: 'json_object' };
        let res = await richiesta(f.prov, '/chat/completions', k, corpo);
        if (res.status === 400 && corpo.response_format) { delete corpo.response_format; res = await richiesta(f.prov, '/chat/completions', k, corpo); }   // modello senza modalità JSON
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw errore(j, res.status);
        const t = contenuto(j);
        if (!comeJson) { const s = t.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim(); if (!s) throw new Error('risposta vuota'); return { testo: s, prov: f.prov, modello: f.modello }; }
        try { return { testo: t, j: json(t), prov: f.prov, modello: f.modello }; } catch (_) { /* una sola riprova, sotto */ }
        // v0.45: JSON illeggibile → una riprova con lo stesso modello chiedendo solo JSON valido
        corpo.messages = [...m2, { role: 'assistant', content: String(t).slice(0, 2000) }, { role: 'user', content: 'Rispondi solo con JSON valido, senza testo prima o dopo. Nelle stringhe scrivi i backslash del LaTeX doppi (\\\\frac).' }];
        const res2 = await richiesta(f.prov, '/chat/completions', k, corpo), j2 = await res2.json().catch(() => ({}));
        if (!res2.ok) throw errore(j2, res2.status);
        const t2 = contenuto(j2);
        return { testo: t2, j: json(t2), prov: f.prov, modello: f.modello };
      } catch (e: any) { ultimo = e; if (e.stato !== 401 && e.stato !== 403) solo401 = false; errori.push(f.nome + ': ' + String(e.message || e).slice(0, 80)); }
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
    const f = new FormData();
    f.append('file', b, o.nome || 'audio.webm'); f.append('model', o.modello || 'whisper-large-v3-turbo'); f.append('language', o.lingua || 'it'); f.append('response_format', 'verbose_json'); f.append('temperature', '0');
    if (o.prompt) f.append('prompt', o.prompt.slice(0, 800));
    const r = await richiesta('groq', '/audio/transcriptions', k, f);
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
  return { chiedi, testo, json: (msgs: Msg[], r: Ruolo, o?: Opz) => chiedi(msgs, r, o).then(x => x.j), trascrivi, campoGemini, disponibili, catena, scegli, accorcia, GROQ_CAR, parseJsonSicuro,
    chiave, impostaChiave, tutteChiavi, formatoOk, get gemini() { return !!chiave('gemini'); } };
})();
