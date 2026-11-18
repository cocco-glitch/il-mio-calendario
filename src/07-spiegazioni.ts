// 07-spiegazioni.ts — Spiegazioni AI dentro i quiz (v0.21).
//
// Nella copia del quiz aperta nell'app (il file su Drive non cambia) si aggiunge, sotto la correzione,
// il riquadro «✨ Spiegazione AI» con tre livelli: breve, media, dettagliata. Il quiz manda al genitore
// domanda, opzioni, risposta corretta, risposta data, citazioni e correzione; l'app chiama Groq
// (gratuito, chiave solo su questo dispositivo, mai nei dati sincronizzati) e risponde.
// Ogni spiegazione diventa un record 'spiegazione' (id 'sp-<hash domanda+corretta>-<livello>'):
// si sincronizza su Drive con gli altri dati, così non si rigenera mai due volte e resta offline.
// Modello principale openai/gpt-oss-120b; se finisce il limite si passa alla riserva.

interface Spiegazione extends Rec {
  type: 'spiegazione';
  q: string; giusta: string; livello: string; testo: string; modello: string; quiz?: string;
}
interface DatiDomanda { q: string; opts: string[]; corretta: string; scelta: string; cit: string; passi: string; titolo: string; archetipo?: string; nomeMateria?: string; }   // v0.52: archetipo + nome materia (corsi propri)

const Spiega = (() => {
  // v0.46: chiavi e chiamate passano da IA (gateway unico); qui resta solo la logica delle spiegazioni.
  const KM = 'imc-groq-modello';   // solo per compatibilità: i client 0.44 lo leggono da chiave-ai.json
  const LIV: Record<string, string> = {
    breve: 'in 2-3 frasi, andando dritto al punto',
    media: 'in un paragrafo di 5-7 frasi, con il ragionamento passo passo',
    dettagliata: 'in modo approfondito: ragionamento passo passo, perché ciascuna risposta sbagliata è sbagliata, un esempio concreto e un trucco per ricordarlo',
  };
  const leggi = (k: string) => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
  const scrivi = (k: string, v: string) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (_) { /* niente */ } };
  const chiave = () => IA.chiave('groq');
  // v0.29: la chiave può viaggiare tra i TUOI dispositivi (iPhone dall'icona Home, Safari, iPad, PC hanno
  // memorie separate) tramite un file privato sul tuo Drive, «dati/chiave-ai.json» — solo dopo conferma.
  const FILE_K = 'chiave-ai.json';
  async function recuperaDaDrive(): Promise<boolean> {
    if (chiave() || !Drive.pronto) return false;
    try {
      await Drive.preparaCartelle(); const f = await Drive.trovaFile(FILE_K, Drive.idCartella('dati')); if (!f) return false;
      const d = JSON.parse(await Drive.scaricaTesto(f.id)); if (!d) return false;
      // v0.46: { groq, modello, v:2, chiavi:{groq, gemini} } — se c'è `chiavi` vale quello, altrimenti il vecchio { groq }
      const ch: Record<string, string> = d.v === 2 && d.chiavi ? d.chiavi : { groq: d.groq };
      if (!/^gsk_/.test(ch.groq || '')) return false;
      IA.impostaChiave('groq', ch.groq); if (ch.gemini && !IA.gemini) IA.impostaChiave('gemini', ch.gemini);
      for (const p of IA.ALTRI) if ((ch as any)[p] && !IA.chiave(p)) IA.impostaChiave(p, (ch as any)[p]);   // v0.47
      if (d.modello) scrivi(KM, d.modello); avviso('✨ AI pronta: ' + (ch.gemini ? 'chiavi AI recuperate' : 'chiave Groq recuperata') + ' dal tuo Drive.'); return true;
    } catch (_) { return false; }
  }
  async function salvaSuDrive(): Promise<void> {
    if (!Drive.collegato || !chiave()) return;
    const s = await chiedi('Salvare le chiavi AI anche sul tuo Drive?', [{ testo: '☁︎ Sì, per gli altri miei dispositivi', valore: 'si' }],
      'File privato «Calendario personale/dati/chiave-ai.json»: l\'app sull\'icona Home, su iPad e PC la recupera da sola. Puoi cancellare il file quando vuoi.');
    if (s !== 'si' || serveGoogle()) return;
    try { await Drive.preparaCartelle(); const dir = Drive.idCartella('dati'), f = await Drive.trovaFile(FILE_K, dir);
      await Drive.carica(FILE_K, dir, JSON.stringify({ groq: chiave(), modello: leggi(KM), v: 2, chiavi: IA.tutteChiavi() }), 'application/json', f ? f.id : undefined); avviso('☁︎ Chiave salvata sul Drive.'); }
    catch (e: any) { avviso('Drive: ' + (e.message || e), 6000); }
  }
  /** Garantisce la chiave: locale, oppure dal Drive. */
  async function pronta(): Promise<boolean> { return !!chiave() || await recuperaDaDrive(); }
  function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const idDi = (d: DatiDomanda, l: string) => 'sp-' + hash(norm(d.q) + '|' + norm(d.corretta)) + '-' + l;

  function materia(t: string): string {
    if (/fisic/i.test(t)) return 'Fisica';
    if (/biolog/i.test(t)) return 'Biologia';
    if (/chimic/i.test(t)) return 'Chimica';
    return 'Chimica, Biologia o Fisica';
  }

  async function chiama(d: DatiDomanda, l: string): Promise<{ testo: string; modello: string }> {
    // v0.52 (BP2): prompt per profilo/archetipo; per il proprietario (Medicina) il testo resta identico a prima
    const sys = Dominio.promptTutor(d.nomeMateria || materia(d.titolo), d.archetipo)
      + 'Basati sul testo di riferimento del corso e su conoscenze certe; non inventare dati, numeri o citazioni. Se il testo di riferimento non basta, dillo. '
      + 'Niente markdown: niente asterischi, cancelletti o tabelle. Puoi andare a capo tra un passaggio e l\'altro.' + MemoriaIA.linee('spiegazioni', 4);
    const u = 'Quiz: ' + d.titolo + '\nDomanda: ' + d.q
      + (d.opts.length ? '\nOpzioni: ' + d.opts.join(' | ') : '')
      + '\nRisposta corretta: ' + d.corretta
      + (d.scelta && norm(d.scelta) !== norm(d.corretta) ? '\nLo studente ha risposto: ' + d.scelta + ' (sbagliato): spiega anche dove sta l\'errore.' : '')
      + (d.cit ? '\nTesto di riferimento (dal corso): ' + d.cit : '')
      + (d.passi ? '\nCorrezione già mostrata: ' + d.passi : '')
      + '\n\nSpiega perché la risposta corretta è giusta ' + LIV[l] + '.';
    const r = await IA.testo([{ role: 'system', content: sys }, { role: 'user', content: u }], 'genera', { temp: 0.3, archetipo: d.archetipo });
    return { testo: r.testo.replace(/\*\*/g, '').replace(/^#+\s*/gm, ''), modello: r.modello };
  }

  async function genera(d: DatiDomanda, l: string): Promise<{ testo: string; modello: string }> {
    await pronta();
    return chiama(d, l);
  }

  /** Q5: chiamata generica (messaggi liberi, risposta JSON). v0.46: firma invariata, passa dal gateway IA. */
  async function chat(msgs: { role: string; content: string }[], temperatura = 0.4): Promise<any> {
    return IA.json(msgs, 'genera', { temp: temperatura });
  }

  /** v0.31: legge un'immagine (scrittura a mano) con un modello visivo; restituisce testo. */
  async function vede(istruzioni: string, immagine: string): Promise<string> {
    if (!await pronta() && !Object.keys(IA.tutteChiavi()).length) throw new Error('Manca la chiave AI: inseriscila in Altro → Spiegazioni AI.');
    MediaStore.controllaVisione(immagine);   // v0.50: oltre 20 MB nessun invio
    // v0.46: modello visivo scelto dal gateway (Gemini Flash, poi Qwen visivo di Groq)
    const r = await IA.testo([{ role: 'user', content: [{ type: 'text', text: istruzioni }, { type: 'image_url', image_url: { url: immagine } }] }], 'visione', { temp: 0.1, maxOut: 4096 });
    return r.testo;
  }

  // ---- Lato genitore: risponde alle richieste dei quiz aperti nell'app ----
  async function ricevi(e: MessageEvent): Promise<void> {
    const m = e.data;
    if (!m || m.imc !== 'spiega-chiedi' || !e.source) return;
    const fonte = Array.from(document.querySelectorAll('iframe.visore-frame')).some(f => (f as HTMLIFrameElement).contentWindow === e.source);
    if (!fonte) return;
    const d = m.d as DatiDomanda, l = String(m.l);
    const rispondi = (x: object) => (e.source as Window).postMessage(Object.assign({ imc: 'spiega-risposta', k: m.k, l }, x), '*');
    if (!d || !d.q || !d.corretta || !LIV[l]) { rispondi({ errore: 'Non riesco a leggere la domanda.' }); return; }
    const id = idDi(d, l), c = Stato.prendi<Spiegazione>(id);
    if (c && !c.deleted && !m.forza) { rispondi({ testo: c.testo, modello: c.modello, salvata: true }); return; }
    if (!await pronta() && !Object.keys(IA.tutteChiavi()).length) { rispondi({ errore: 'Manca la chiave AI: incollala in Altro → Spiegazioni AI.' }); return; }
    try {
      const g = await genera(d, l);
      Stato.salva({ id, type: 'spiegazione', updatedAt: 0, q: d.q, giusta: d.corretta, livello: l, testo: g.testo, modello: g.modello, quiz: d.titolo } as Spiegazione, true);
      rispondi(g);
    } catch (err: any) { rispondi({ errore: String(err.message || err) }); }
  }
  window.addEventListener('message', e => { ricevi(e); });

  // ---- Lato quiz: script aggiunto alla copia del quiz (autonomo, niente riferimenti all'app) ----
  function spiaAI(): void {
    const D = document, stato: Record<string, any> = {};
    const tx = (el: Element | null) => el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const senzaTag = (el: Element | null) => { if (!el) return ''; const c = el.cloneNode(true) as Element; c.querySelectorAll('.tag').forEach(t => t.remove()); return tx(c); };
    const chiaveQ = () => tx(D.querySelector('.question'));
    const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
    function raccogli() {
      const opts = Array.prototype.map.call(D.querySelectorAll('.opt .txt'), senzaTag) as string[];
      let corretta = senzaTag(D.querySelector('.opt.ok .txt')), scelta = senzaTag(D.querySelector('.opt.bad .txt'));
      if (!opts.length) {
        const v = D.querySelector('#why .verdict'), ans = D.querySelector('#ans') as HTMLInputElement | null;
        const mm = /«([\s\S]*)»/.exec(tx(v));
        if (v && v.classList.contains('ok')) corretta = ans ? ans.value : ''; else { corretta = mm ? mm[1] : ''; scelta = ans ? ans.value : ''; }
      }
      return { q: chiaveQ(), opts, corretta, scelta,
        cit: Array.prototype.map.call(D.querySelectorAll('#expl blockquote'), tx).join('\n'),
        passi: tx(D.querySelector('#why .steps')), titolo: tx(D.querySelector('header .eyebrow')) + ' — ' + tx(D.querySelector('header h1')) };
    }
    function mostra(b: Element, k: string) {
      const o = b.querySelector('.ai-out') as HTMLElement, s = stato[k];
      b.querySelectorAll('button[data-l]').forEach(x => x.classList.toggle('on', !!s && (x as HTMLElement).dataset.l === s.l && !(x as HTMLElement).dataset.f));
      if (!s) { o.innerHTML = ''; return; }
      if (s.attesa) { o.innerHTML = '<p class="ai-nota">Genero la spiegazione…</p>'; return; }
      if (s.errore) { o.innerHTML = '<p class="ai-nota">⚠️ ' + esc(s.errore) + '</p>'; return; }
      o.innerHTML = '<div class="ai-testo">' + esc(s.testo) + '</div><div class="ai-piede"><span>' + esc(s.modello || '') + (s.salvata ? ' · salvata' : '') + '</span><button type="button" class="tool" data-l="' + s.l + '" data-f="1">↻ Rigenera</button></div>';
    }
    function aggiungi() {
      const w = D.getElementById('why');
      if (!w || (w.nextElementSibling && w.nextElementSibling.classList.contains('ai-box'))) return;
      const k = chiaveQ(), b = D.createElement('div');
      b.className = 'ai-box';
      b.innerHTML = '<span class="label">✨ Spiegazione AI</span><div class="ai-btns"><button type="button" class="tool" data-l="breve">Breve</button><button type="button" class="tool" data-l="media">Media</button><button type="button" class="tool" data-l="dettagliata">Dettagliata</button></div><div class="ai-out"></div>';
      w.parentNode!.insertBefore(b, w.nextSibling);
      mostra(b, k);
      b.addEventListener('click', ev => {
        const t = (ev.target as Element).closest('button[data-l]') as HTMLElement | null; if (!t) return;
        ev.stopPropagation();
        const l = t.dataset.l!, forza = !!t.dataset.f;
        // Le citazioni sono nel riquadro «📖 Spiegazione»: se è chiuso lo apro un istante per leggerle.
        const btn = D.getElementById('explbtn'), apri = !D.getElementById('expl') && !!btn;
        if (apri) btn!.click();
        const d = raccogli();
        if (apri && D.getElementById('explbtn')) D.getElementById('explbtn')!.click();
        stato[k] = { l, attesa: true };
        const box = D.querySelector('.ai-box'); if (box) mostra(box, k);
        parent.postMessage({ imc: 'spiega-chiedi', k, l, forza, d }, '*');
      });
    }
    window.addEventListener('message', e => {
      const m = e.data; if (!m || m.imc !== 'spiega-risposta') return;
      stato[m.k] = { l: m.l, testo: m.testo, errore: m.errore, modello: m.modello, salvata: m.salvata };
      const b = D.querySelector('.ai-box'); if (b && chiaveQ() === m.k) mostra(b, m.k);
    });
    const st = D.createElement('style');
    st.textContent = '.ai-box{margin-top:14px;padding:12px 14px;border-radius:12px;border:1px solid rgba(127,127,127,.35)}'
      + '.ai-box .label{display:block;font-weight:700;margin-bottom:8px}.ai-btns{display:flex;gap:6px;flex-wrap:wrap}'
      + '.ai-btns .tool.on{outline:2px solid currentColor}.ai-testo{white-space:pre-wrap;margin-top:10px;line-height:1.55}'
      + '.ai-piede{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;font-size:.8em;opacity:.8}.ai-nota{margin:10px 0 0;opacity:.85}';
    D.head.appendChild(st);
    new MutationObserver(aggiungi).observe(D.body, { childList: true, subtree: true });
    aggiungi();
  }
  const SCRIPT = '<script>(' + spiaAI.toString() + ')();<\/script>';
  /** Aggiunge il riquadro AI alla copia del quiz (in fondo al body). */
  function inietta(html: string): string { return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, SCRIPT + '</body>') : html + SCRIPT; }

  // ---- Altro → Spiegazioni AI ----
  function sezione(): HTMLElement {
    const inp = h('input', { type: 'text', placeholder: 'gsk_…', value: chiave(), autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: false, style: { fontFamily: 'monospace' } }) as HTMLInputElement;
    const salvaChiave = () => { const v = inp.value.replace(/\s+/g, ''); inp.value = v; IA.impostaChiave('groq', v); if (/^gsk_/.test(v)) setTimeout(salvaSuDrive, 600); avviso(v ? (/^gsk_/.test(v) ? 'Chiave salvata su questo dispositivo.' : 'Salvata, ma non sembra una chiave Groq (inizia con gsk_).') : 'Chiave rimossa.', 5000); };
    const incolla = async () => {
      try { const t = await navigator.clipboard.readText(); if (!t) { avviso('Gli appunti sono vuoti.'); return; } inp.value = t; salvaChiave(); }
      catch (_) { inp.focus(); avviso('Tieni premuto nel campo e scegli «Incolla».', 6000); }
    };
    const n = Stato.tutti<Spiegazione>('spiegazione').length;
    const prova = async () => {
      if (!chiave()) { avviso('Prima salva la chiave.'); return; }
      avviso('Provo…');
      try { const g = await genera({ q: 'Quanto fa 2 + 2?', opts: [], corretta: '4', scelta: '', cit: '', passi: '', titolo: 'prova' }, 'breve'); avviso('✅ Funziona (' + g.modello + ')', 5000); }
      catch (e: any) { avviso(String(e.message || e), 8000); }
    };
    return scheda('Spiegazioni AI',
      h('div.tenue.piccolo', null, 'Nei quiz aperti dall\'app, sotto la correzione compare «✨ Spiegazione AI» (breve, media o dettagliata). Usa Groq (e Gemini, se aggiungi la chiave), gratuiti; i modelli migliori disponibili sono scelti da soli. La chiave resta solo su questo dispositivo; le spiegazioni generate si salvano con i tuoi dati su Drive e non si rigenerano.'),
      h('div.gruppo', null, riga('Chiave Groq', inp)),
      h('div.bottoni', null,
        h('button.btn', { onclick: incolla }, '📋 Incolla chiave'),
        h('button.btn.neutro', { onclick: salvaChiave }, 'Salva'),
        h('button.btn.neutro', { onclick: prova }, 'Prova')),
      h('div.tenue.piccolo', null, n ? 'Spiegazioni salvate: ' + n + '.' : 'Nessuna spiegazione salvata finora.'),
      IA.campoGemini(),
      IA.campoAltri(),
      MemoriaIA.sezione());
  }

  return { vede, inietta, sezione, genera, idDi, chat, materia, pronta, chiaveAI: () => chiave(), recuperaDaDrive, salvaSuDrive, get attiva() { return !!chiave(); } };
})();
