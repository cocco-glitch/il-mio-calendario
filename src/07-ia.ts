// =====================================================================
// 07-ia.ts — v0.42 SCELTA DEI MODELLI AI (tutti gratuiti, senza carta)
// Scouting (15/11): Groq = gratis senza carta, molto veloce (gpt-oss-120b, llama-3.3-70b, gpt-oss-20b);
// Google AI Studio (Gemini 2.5 Flash / Flash-Lite) = gratis senza carta, contesto da 1M token, ottimo
// per leggere PDF lunghi, ma con pochi messaggi al giorno. Ogni compito usa il modello più adatto e,
// se uno manca o è al limite, passa da solo al successivo:
//   «genera»     quiz e testi lunghi: Gemini 2.5 Flash (fonti lunghe) → gpt-oss-120b → llama-3.3-70b
//   «revisiona»  controllo indipendente: un modello DIVERSO da chi ha generato (llama-3.3-70b ↔ gpt-oss-120b)
//   «veloce»     assistente e comandi: gpt-oss-20b → gpt-oss-120b → llama-3.3-70b
// La chiave Gemini è facoltativa (Altro → Spiegazioni AI).
// =====================================================================

const IA = (() => {
  const KG = 'imc-gemini-chiave';
  const gemini = () => { try { return localStorage.getItem(KG) || ''; } catch (_) { return ''; } };
  type Ruolo = 'genera' | 'revisiona' | 'veloce';
  type Fornitore = { nome: string; url: string; chiave: () => string; modello: string; gem?: boolean };
  const GROQ = 'https://api.groq.com/openai/v1', GEM = 'https://generativelanguage.googleapis.com/v1beta/openai';
  // v0.44.1: i modelli non sono più fissi. L'app chiede a Groq e a Gemini QUALI modelli la chiave può usare
  // (GET /models, risultato ricordato 12 ore) e sceglie per ogni ruolo il migliore disponibile: se un modello
  // viene ritirato o la chiave non ha accesso, si passa da soli al successivo.
  const PREF: Record<Ruolo, string[]> = {
    genera: ['gemini-2.5-flash', 'openai/gpt-oss-120b', 'gemini-2.5-flash-lite', 'llama-3.3-70b-versatile', 'moonshotai/kimi-k2-instruct', 'qwen/qwen3-32b', 'gemini-2.0-flash', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],
    revisiona: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3-32b', 'moonshotai/kimi-k2-instruct', 'gemini-2.5-flash', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'gemini-2.5-flash-lite', 'openai/gpt-oss-20b'],
    veloce: ['openai/gpt-oss-20b', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'gemini-2.5-flash-lite', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b', 'gemini-2.5-flash'],
  };
  const disp: Record<string, { t: number; m: string[] } | undefined> = {};
  async function disponibili(gem: boolean): Promise<string[] | null> {
    const k = gem ? gemini() : Spiega.chiaveAI(); if (!k) return [];
    const ch = (gem ? 'g:' : 'q:') + k.slice(-6), c = disp[ch] || (() => { try { return JSON.parse(localStorage.getItem('imc-modelli-' + ch) || 'null'); } catch (_) { return null; } })();
    if (c && Date.now() - c.t < 12 * 36e5) return c.m;
    try {
      const r = await richiesta(gem, '/models', k, undefined);
      if (!r.ok) return c ? c.m : null;
      const j = await r.json(); const m = ((j.data || j.models || []) as any[]).map(x => String(x.id || x.name || '').replace(/^models\//, '')).filter(Boolean);
      const v = { t: Date.now(), m }; disp[ch] = v; try { localStorage.setItem('imc-modelli-' + ch, JSON.stringify(v)); } catch (_) { /* */ }
      return m;
    } catch (_) { return c ? c.m : null; }
  }
  /** Le chiavi Gemini nuove (prefisso «AQ.», oltre alle vecchie «AIza») si accettano tutte: provo Bearer e, se rifiutato, l'intestazione x-goog-api-key. */
  async function richiesta(gem: boolean, perc: string, k: string, corpo?: any): Promise<Response> {
    const base = gem ? GEM : GROQ, op: RequestInit = { method: corpo ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + k, ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined };
    let r = await fetch(base + perc, op);
    if (gem && (r.status === 401 || r.status === 403 || r.status === 400)) {
      const r2 = await fetch(base + perc, { ...op, headers: { 'x-goog-api-key': k, ...(corpo ? { 'Content-Type': 'application/json' } : {}) } });
      if (r2.ok || r2.status === 429) return r2;
      const r3 = await fetch(base + perc + (perc.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(k), { ...op, headers: corpo ? { 'Content-Type': 'application/json' } : {} });
      if (r3.ok || r3.status === 429) return r3;
    }
    return r;
  }
  async function catena(r: Ruolo, evita?: string): Promise<Fornitore[]> {
    const [dq, dg] = await Promise.all([disponibili(false), disponibili(true)]);
    const out: Fornitore[] = [];
    for (const m of PREF[r]) {
      const gem = m.startsWith('gemini'), lista = gem ? dg : dq;
      if (m === evita || !(gem ? gemini() : Spiega.chiaveAI())) continue;
      if (lista && lista.length && !lista.includes(m)) continue;   // la chiave non ha questo modello
      out.push({ nome: (gem ? 'Gemini ' : 'Groq ') + m.replace(/^.*\//, ''), url: gem ? GEM : GROQ, chiave: gem ? gemini : () => Spiega.chiaveAI(), modello: m, gem });
    }
    // modelli nuovi non in elenco: in coda, se la chiave li offre (es. un modello Groq appena uscito)
    if (dq) for (const m of dq) if (!out.some(f => f.modello === m) && /gpt-oss|llama-3\.3|qwen3|kimi/.test(m) && !/guard|whisper|tts/.test(m)) out.push({ nome: 'Groq ' + m, url: GROQ, chiave: () => Spiega.chiaveAI(), modello: m });
    return out;
  }
  function json(t: string): any {
    t = t.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(t); } catch (_) { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1)); throw new Error('risposta non in JSON'); }
  }
  /** Chiede JSON al primo modello disponibile del ruolo. Restituisce anche chi ha risposto. */
  async function chiedi(msgs: { role: string; content: string }[], r: Ruolo, o: { temp?: number; evita?: string; maxCar?: number } = {}): Promise<{ j: any; modello: string }> {
    await Spiega.pronta();
    const forn = await catena(r, o.evita); if (!forn.length) throw new Error('Serve una chiave AI gratuita: Altro → Spiegazioni AI (Groq, ed eventualmente Gemini).');
    const errori: string[] = []; let ultimo: any = null;
    for (const f of forn) {
      const lim = f.gem ? 600000 : 60000;
      const m2 = msgs.map(x => x.content.length > lim ? { ...x, content: x.content.slice(0, lim) + '\n[…testo accorciato…]' } : x);
      try {
        const corpo: any = { model: f.modello, temperature: o.temp == null ? .3 : o.temp, messages: m2 };
        if (!/llama-3\.1-8b/.test(f.modello)) corpo.response_format = { type: 'json_object' };
        let res = await richiesta(!!f.gem, '/chat/completions', f.chiave(), corpo);
        if (res.status === 400 && corpo.response_format) { delete corpo.response_format; res = await richiesta(!!f.gem, '/chat/completions', f.chiave(), corpo); }   // modello senza modalità JSON
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { const e: any = new Error((j && (j.error && j.error.message || j[0] && j[0].error && j[0].error.message)) || 'errore ' + res.status); e.stato = res.status; throw e; }
        const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
        return { j: json(t), modello: f.modello };
      } catch (e: any) { ultimo = e; errori.push(f.nome + ': ' + String(e.message || e).slice(0, 80)); }
    }
    if (ultimo && ultimo.stato === 429) throw new Error('Limite gratuito raggiunto su tutti i modelli: riprova tra qualche minuto.');
    throw new Error(navigator.onLine === false ? 'Sei offline.' : 'Nessun modello ha risposto. ' + errori.slice(0, 3).join(' · '));
  }
  /** Campo per la chiave Gemini (facoltativa) dentro Altro → Spiegazioni AI. */
  function campoGemini(): HTMLElement {
    const inp = h('input', { type: 'text', placeholder: 'AQ.… oppure AIza… (facoltativa)', value: gemini(), autocomplete: 'off', autocapitalize: 'none', spellcheck: false, style: { fontFamily: 'monospace' } }) as HTMLInputElement;
    const salva = () => { const v = inp.value.replace(/\s+/g, ''); inp.value = v; try { v ? localStorage.setItem(KG, v) : localStorage.removeItem(KG); } catch (_) { /* */ } for (const k in disp) delete disp[k]; avviso(v ? 'Chiave Gemini salvata su questo dispositivo (vanno bene sia le nuove «AQ.» sia le vecchie «AIza»).' : 'Chiave Gemini rimossa.', 5000); };
    const prova = async () => { salva(); try { const g = await disponibili(true); if (g === null || (g && !g.length)) throw new Error('Google non accetta questa chiave: controlla di averla copiata intera da aistudio.google.com (API key).'); const r = await chiedi([{ role: 'user', content: 'Rispondi in JSON: {"ok":true}' }], 'genera'); avviso('✅ Funziona: ' + r.modello + ' · modelli Gemini disponibili: ' + g.filter(x => /gemini/.test(x)).length, 7000); } catch (e: any) { avviso(String(e.message || e), 9000); } };
    return h('div.gruppo', null,
      h('div.tenue.piccolo', null, 'Facoltativa: chiave gratuita di Google AI Studio (aistudio.google.com → «Get API key», senza carta). Serve per leggere PDF lunghi quando l\'app crea i quiz; senza, si usa Groq.'),
      h('div.riga', null, h('span', null, 'Chiave Gemini'), inp),
      h('div.bottoni', null, h('button.btn.neutro', { onclick: salva }, 'Salva'), h('button.btn.neutro', { onclick: prova }, 'Prova')));
  }
  return { chiedi, campoGemini, disponibili, catena, get gemini() { return !!gemini(); } };
})();
