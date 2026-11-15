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
  type Fornitore = { nome: string; url: string; chiave: () => string; modello: string };
  const GROQ = 'https://api.groq.com/openai/v1/chat/completions', GEM = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  const g = (m: string): Fornitore => ({ nome: 'Groq ' + m.replace(/^.*\//, ''), url: GROQ, chiave: () => Spiega.chiaveAI(), modello: m });
  const gm = (m: string): Fornitore => ({ nome: 'Gemini ' + m.replace('gemini-', ''), url: GEM, chiave: gemini, modello: m });
  function catena(r: Ruolo, evita?: string): Fornitore[] {
    const c = r === 'genera' ? [gm('gemini-2.5-flash'), g('openai/gpt-oss-120b'), g('llama-3.3-70b-versatile'), gm('gemini-2.5-flash-lite')]
      : r === 'revisiona' ? [g('llama-3.3-70b-versatile'), g('openai/gpt-oss-120b'), gm('gemini-2.5-flash'), g('qwen/qwen3-32b')]
      : [g('openai/gpt-oss-20b'), g('openai/gpt-oss-120b'), g('llama-3.3-70b-versatile'), gm('gemini-2.5-flash-lite')];
    return c.filter(f => f.chiave() && f.modello !== evita);
  }
  function json(t: string): any {
    t = t.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(t); } catch (_) { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1)); throw new Error('risposta non in JSON'); }
  }
  /** Chiede JSON al primo modello disponibile del ruolo. Restituisce anche chi ha risposto. */
  async function chiedi(msgs: { role: string; content: string }[], r: Ruolo, o: { temp?: number; evita?: string; maxCar?: number } = {}): Promise<{ j: any; modello: string }> {
    await Spiega.pronta();
    const forn = catena(r, o.evita); if (!forn.length) throw new Error('Serve una chiave AI gratuita: Altro → Spiegazioni AI (Groq, ed eventualmente Gemini).');
    let ultimo: any = null;
    for (const f of forn) {
      // i modelli Groq hanno contesto più corto: se il testo è enorme, lo accorcio per loro
      const lim = f.url === GROQ ? 60000 : 600000;
      const m2 = msgs.map(x => x.content.length > lim ? { ...x, content: x.content.slice(0, lim) + '\n[…testo accorciato…]' } : x);
      try {
        const res = await fetch(f.url, { method: 'POST', headers: { Authorization: 'Bearer ' + f.chiave(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: f.modello, temperature: o.temp == null ? .3 : o.temp, response_format: { type: 'json_object' }, messages: m2 }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { const e: any = new Error((j && (j.error && j.error.message || j[0] && j[0].error && j[0].error.message)) || 'errore ' + res.status); e.stato = res.status; throw e; }
        const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
        return { j: json(t), modello: f.modello };
      } catch (e: any) { ultimo = e; }
    }
    if (ultimo && ultimo.stato === 429) throw new Error('Limite gratuito raggiunto su tutti i modelli: riprova tra qualche minuto.');
    throw new Error(navigator.onLine === false ? 'Sei offline.' : 'AI non raggiungibile: ' + (ultimo && ultimo.message || 'errore'));
  }
  /** Campo per la chiave Gemini (facoltativa) dentro Altro → Spiegazioni AI. */
  function campoGemini(): HTMLElement {
    const inp = h('input', { type: 'text', placeholder: 'AIza… (facoltativa)', value: gemini(), autocomplete: 'off', autocapitalize: 'none', spellcheck: false, style: { fontFamily: 'monospace' } }) as HTMLInputElement;
    const salva = () => { const v = inp.value.replace(/\s+/g, ''); inp.value = v; try { v ? localStorage.setItem(KG, v) : localStorage.removeItem(KG); } catch (_) { /* */ } avviso(v ? (/^AIza/.test(v) ? 'Chiave Gemini salvata su questo dispositivo.' : 'Salvata, ma non sembra una chiave Gemini (inizia con AIza).') : 'Chiave Gemini rimossa.', 5000); };
    const prova = async () => { salva(); try { const r = await chiedi([{ role: 'user', content: 'Rispondi in JSON: {"ok":true}' }], 'genera'); avviso('✅ Funziona: ' + r.modello, 5000); } catch (e: any) { avviso(String(e.message || e), 8000); } };
    return h('div.gruppo', null,
      h('div.tenue.piccolo', null, 'Facoltativa: chiave gratuita di Google AI Studio (aistudio.google.com → «Get API key», senza carta). Serve per leggere PDF lunghi quando l\'app crea i quiz; senza, si usa Groq.'),
      h('div.riga', null, h('span', null, 'Chiave Gemini'), inp),
      h('div.bottoni', null, h('button.btn.neutro', { onclick: salva }, 'Salva'), h('button.btn.neutro', { onclick: prova }, 'Prova')));
  }
  return { chiedi, campoGemini, get gemini() { return !!gemini(); } };
})();
