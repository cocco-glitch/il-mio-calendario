// 07-audio.ts — v0.41: lezioni audio (registra o carica) trascritte dall'AI con autocorrezione.
// Scouting: Groq offre Whisper (large-v3-turbo e large-v3) gratis con la stessa chiave: 25 MB a file,
// ~8 ore di audio al giorno. Notability/GoodNotes legano l'audio agli appunti; Otter evidenzia le parti incerte.
// Processo in 3 passaggi:
//   1) Whisper turbo trascrive, con un «prompt» di contesto (titolo, step, termini dell'appunto) per i nomi tecnici;
//   2) l'AI testuale controlla la COERENZA con argomento e contesto e indica i segmenti dubbi
//      (aiutata dalla confidenza di Whisper: avg_logprob basso, compressione anomala);
//   3) l'audio viene ritrascritto con Whisper large-v3 (più preciso) usando il glossario trovato; per ogni
//      segmento dubbio l'AI confronta le due versioni ASCOLTATE (non inventa) e sceglie/riscrive.
// Ogni correzione resta visibile con ▶ per riascoltare quel punto e decidere.

type Segmento = { s: number; e: number; t: string; lp?: number; cr?: number };
const Lezioni = (() => {
  const MAX = 24 * 1024 * 1024;
  async function whisper(b: Blob, nome: string, modello: string, prompt: string): Promise<Segmento[]> {
    const k = Spiega.chiaveAI(); if (!k) throw new Error('Manca la chiave Groq: inseriscila in Altro → Spiegazioni AI.');
    const f = new FormData();
    f.append('file', b, nome); f.append('model', modello); f.append('language', 'it'); f.append('response_format', 'verbose_json'); f.append('temperature', '0');
    if (prompt) f.append('prompt', prompt.slice(0, 800));
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + k }, body: f });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Chiave Groq non valida.');
    if (r.status === 429) throw new Error('Limite gratuito di Groq raggiunto (audio): riprova tra un po\'.');
    if (!r.ok) throw new Error((j && j.error && j.error.message) || 'errore ' + r.status);
    return (j.segments || [{ start: 0, end: j.duration || 0, text: j.text || '' }]).map((x: any) => ({ s: x.start, e: x.end, t: String(x.text || '').trim(), lp: x.avg_logprob, cr: x.compression_ratio }));
  }
  /** File troppo grandi: decodifica, porta a 16 kHz mono e divide in pezzi WAV da 10 minuti (< 25 MB). */
  async function pezzi(b: Blob): Promise<{ b: Blob; da: number; nome: string }[]> {
    if (b.size <= MAX) return [{ b, da: 0, nome: 'lezione.' + ((b.type.split('/')[1] || 'm4a').split(';')[0].replace('mpeg', 'mp3').replace('x-m4a', 'm4a')) }];
    const Ctx: any = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    const ac = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    let buf: AudioBuffer;
    try { buf = await ac.decodeAudioData(await b.arrayBuffer()); } catch (_) { throw new Error('file troppo grande da dividere su questo dispositivo: prova dal PC o registra in più parti'); } finally { try { ac.close(); } catch (_) { /* */ } }
    const off = new Ctx(1, Math.ceil(buf.duration * 16000), 16000), src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    const mono: Float32Array = (await off.startRendering()).getChannelData(0), PEZZO = 600 * 16000, o: { b: Blob; da: number; nome: string }[] = [];
    for (let i = 0; i < mono.length; i += PEZZO) o.push({ b: wav(mono.subarray(i, i + PEZZO)), da: i / 16000, nome: 'parte' + (o.length + 1) + '.wav' });
    return o;
  }
  function wav(x: Float32Array): Blob {
    const v = new DataView(new ArrayBuffer(44 + x.length * 2)), s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    s(0, 'RIFF'); v.setUint32(4, 36 + x.length * 2, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, x.length * 2, true);
    for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 0x7fff, true);
    return new Blob([v], { type: 'audio/wav' });
  }
  async function trascrivi(b: Blob, prompt: string, modello: string, passo: (t: string) => void): Promise<Segmento[]> {
    const ps = await pezzi(b), out: Segmento[] = [];
    for (let i = 0; i < ps.length; i++) {
      passo((ps.length > 1 ? 'parte ' + (i + 1) + ' di ' + ps.length + ' · ' : ''));
      const sg = await whisper(ps[i].b, ps[i].nome, modello, prompt + (out.length ? ' ' + out.slice(-3).map(x => x.t).join(' ') : ''));
      out.push(...sg.map(x => ({ ...x, s: x.s + ps[i].da, e: x.e + ps[i].da })));
    }
    return out.filter(x => x.t);
  }
  const mmss = (t: number) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  /** Il processo completo. Restituisce i segmenti finali e le correzioni fatte. */
  async function processa(b: Blob, contesto: { titolo: string; step: string; testo: string }, passo: (t: string) => void): Promise<{ seg: Segmento[]; corr: { i: number; prima: string; dopo: string; nota: string; ok: boolean }[] }> {
    const prompt = 'Lezione universitaria in italiano (semestre filtro di Medicina: chimica, biologia, fisica). Argomento: ' + contesto.titolo + (contesto.step ? ' (' + contesto.step + ')' : '') + '. ' + contesto.testo.replace(/\s+/g, ' ').slice(0, 300);
    // v0.43 memoria: i termini già incontrati entrano nel «prompt» di Whisper, che li usa durante il
    // riconoscimento dei suoni (così una parola corretta più volte viene riconosciuta giusta la volta dopo)
    const noti = MemoriaIA.migliori('audio', 'termine', 40).map(x => x.k);
    const promptM = prompt + (noti.length ? ' Termini: ' + noti.join(', ') + '.' : '');
    passo('1/3 Trascrivo…');
    const seg = await trascrivi(b, promptM, 'whisper-large-v3-turbo', t => passo('1/3 Trascrivo ' + t));
    if (!seg.length) throw new Error('non ho sentito parole nell\'audio');
    // correzioni confermate più volte: applicate subito, senza chiedere all'AI (meno token)
    const daMemoria: { i: number; prima: string; dopo: string; nota: string; ok: boolean }[] = [];
    seg.forEach(x => { x.t = Locale.pulisciParlato(x.t); });   // v0.44 locale: intercalari e ripetizioni via (meno token)
    seg.forEach((x, i) => { const c = MemoriaIA.correggi('audio', x.t); if (c.cambi.length) { daMemoria.push({ i, prima: x.t, dopo: c.testo, nota: 'dalla memoria: ' + c.cambi.map(z => z.prima + ' → ' + z.dopo).join(', '), ok: true }); x.t = c.testo; x.lp = 0; } });
    // 2) controllo di coerenza (blocchi da ~120 segmenti per restare nei limiti)
    passo('2/3 Controllo la coerenza del testo…');
    const dubbi = new Map<number, string>(), termini = new Set<string>();
    // v0.44 locale: nelle lezioni lunghe all'AI vanno solo i segmenti dubbi (con il vicino prima e dopo)
    const glossario = noti.concat(contesto.testo.split(/\W+/).filter(w => w.length > 6)).slice(0, 80);
    const scelti = new Set<number>();
    if (seg.length <= 40) seg.forEach((_, i) => scelti.add(i));
    else seg.forEach((x, i) => { if (Locale.segmentoDubbio(x, glossario)) { scelti.add(i); if (i) scelti.add(i - 1); if (i + 1 < seg.length) scelti.add(i + 1); } });
    const daVedere = Array.from(scelti).sort((p, q) => p - q);
    for (let a = 0; a < daVedere.length; a += 120) {
      const righe = daVedere.slice(a, a + 120).map(k => k + (seg[k].lp != null && (seg[k].lp! < -.6 || (seg[k].cr || 0) > 2.4) ? ' ⚠' : '') + ' | ' + seg[k].t).join('\n');
      const r = await Spiega.chat([{ role: 'system', content: 'Sei un revisore di trascrizioni automatiche di lezioni universitarie italiane. Rispondi SOLO in JSON.' },
        { role: 'user', content: 'Argomento: ' + contesto.titolo + (contesto.step ? ' · ' + contesto.step : '') + '\nSegmenti numerati (⚠ = il riconoscitore era poco sicuro):\n' + righe +
          (daMemoria.length ? '\nCorrezioni già applicate dalla memoria (non segnalarle): ' + daMemoria.map(z => z.nota.replace('dalla memoria: ', '')).join('; ') : '') +
          '\n\nTrova i segmenti con parole probabilmente sentite male (termini tecnici storpiati, frasi senza senso nel contesto, numeri/unità incoerenti). JSON: {"dubbi":[{"i":numero,"motivo":"breve"}],"termini":["termini tecnici corretti dell\'argomento presenti o storpiati"]}. Non segnalare lo stile parlato.' }], .2).catch(() => ({ dubbi: [], termini: [] }));
      for (const d of (r.dubbi || []).slice(0, 40)) if (seg[+d.i]) dubbi.set(+d.i, String(d.motivo || ''));
      for (const t of (r.termini || []).slice(0, 40)) termini.add(String(t));
    }
    seg.forEach((x, i) => { if (x.lp != null && x.lp < -1 && !dubbi.has(i)) dubbi.set(i, 'audio poco chiaro'); });
    if (!dubbi.size) return { seg, corr: daMemoria };
    // 3) ritrascrizione accurata con il glossario e scelta, solo sui punti dubbi
    passo('3/3 Riascolto i punti dubbi (' + dubbi.size + ')…');
    let seg2: Segmento[] = [];
    termini.forEach(t => MemoriaIA.nota('audio', 'termine', t, null, .3));
    try { seg2 = await trascrivi(b, promptM + ' ' + Array.from(termini).join(', '), 'whisper-large-v3', t => passo('3/3 Riascolto ' + t)); } catch (_) { /* resta la prima versione */ }
    const idx = Array.from(dubbi.keys()), corr: { i: number; prima: string; dopo: string; nota: string; ok: boolean }[] = [];
    for (let a = 0; a < idx.length; a += 25) {
      const casi = idx.slice(a, a + 25).map(i => { const x = seg[i], alt = seg2.filter(y => y.e > x.s - .3 && y.s < x.e + .3).map(y => y.t).join(' ');
        return { i, prima: (seg[i - 1] || { t: '' }).t.slice(-120), v1: x.t, v2: alt, dopo: (seg[i + 1] || { t: '' }).t.slice(0, 120), motivo: dubbi.get(i) }; });
      const r = await Spiega.chat([{ role: 'system', content: 'Correggi trascrizioni di lezioni basandoti SOLO su ciò che è stato ascoltato. Rispondi in JSON.' },
        { role: 'user', content: 'Argomento: ' + contesto.titolo + '. Glossario: ' + Array.from(termini).join(', ') + '\nPer ogni caso hai due ascolti dello stesso audio (v1 veloce, v2 accurato) e il contesto prima/dopo. Scegli o combina la versione giusta: puoi correggere un termine storpiato quando il suono è compatibile (es. «entalpia» per «in talpa»), ma NON aggiungere contenuti che nessuno dei due ascolti contiene. ' +
          'JSON: {"correzioni":[{"i":numero,"testo":"versione finale","nota":"cosa hai corretto, breve"}]} (ometti i casi già giusti).\n' + JSON.stringify(casi) }], .1).catch(() => ({ correzioni: [] }));
      for (const c of r.correzioni || []) { const i = +c.i, t = String(c.testo || '').trim(); if (seg[i] && t && t !== seg[i].t) corr.push({ i, prima: seg[i].t, dopo: t, nota: String(c.nota || ''), ok: true }); }
    }
    return { seg, corr: daMemoria.concat(corr.filter(c => !daMemoria.some(z => z.i === c.i))) };
  }
  /** Testo Markdown: paragrafi di circa un minuto con il minuto della lezione. */
  function inMarkdown(seg: Segmento[], titolo: string): string {
    const par: string[] = []; let cur = '', da = 0;
    seg.forEach((x, i) => { if (!cur) da = x.s; cur += (cur ? ' ' : '') + x.t; if (x.e - da > 60 || i === seg.length - 1) { par.push('[' + mmss(da) + '] ' + cur); cur = ''; } });
    return '## Lezione audio · ' + titolo + '\n' + par.join('\n\n') + '\n';
  }
  return { processa, inMarkdown, mmss };
})();

/** Interfaccia: registra o carica, trascrivi, rivedi le correzioni con ▶, aggiungi all'appunto. */
async function lezioneAudio(contesto: { titolo: string; step: string; testo: string }, aggiungi: (md: string) => void): Promise<void> {
  if (!await Spiega.pronta()) { avviso('Serve la chiave Groq (gratuita): Altro → Spiegazioni AI.', 6000); return; }
  const s = await chiedi('🎙 Lezione audio', [{ testo: '🎙 Registra ora', valore: 'reg' }, { testo: '📁 Carica un file audio', valore: 'file' }], 'Trascrizione con autocorrezione (gratis con Groq: fino a ~8 ore al giorno).');
  if (s === 'file') {
    const inp = h('input', { type: 'file', accept: 'audio/*,.m4a,.mp3,.wav,.ogg,.webm,.aac,.flac,video/mp4' }) as HTMLInputElement;
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) elabora(f, f.name.replace(/\.[^.]+$/, '')); };
    inp.click(); return;
  }
  if (s !== 'reg') return;
  if (!navigator.mediaDevices || !(window as any).MediaRecorder) { avviso('Questo browser non registra audio: usa «Carica un file» (es. dal registratore di iPhone).', 6000); return; }
  let st: MediaStream;
  try { st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } as any }); } catch (_) { avviso('Microfono non consentito: abilitalo nelle impostazioni del browser.', 6000); return; }
  const tipo = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => (window as any).MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(st, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 32000 }), pezzi: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size) pezzi.push(e.data); };
  // v0.41.1: registrazione IN BACKGROUND: una pillola fissa in alto, puoi continuare a scrivere appunti
  const t0 = Date.now(), orologio = h('span.audio-orologio', null, '0:00'), punto = h('span.audio-punto');
  let wake: any = null; try { wake = await (navigator as any).wakeLock?.request('screen'); } catch (_) { /* non supportato */ }
  let pausa = false, inPausa = 0, daPausa = 0;
  const tic = setInterval(() => { orologio.textContent = Lezioni.mmss(((pausa ? daPausa : Date.now()) - t0 - inPausa) / 1000); }, 500);
  const bPausa = h('button', { type: 'button', title: 'Pausa', 'aria-label': 'Pausa', onclick: () => { if (pausa) { rec.resume(); inPausa += Date.now() - daPausa; bPausa.textContent = '⏸'; } else { rec.pause(); daPausa = Date.now(); bPausa.textContent = '▶'; } pausa = !pausa; punto.classList.toggle('fermo', pausa); } }, '⏸');
  const pillola = h('div.audio-pillola', { role: 'status', 'aria-label': 'Registrazione in corso' }, punto, orologio,
    bPausa,
    h('button.audio-fine', { type: 'button', title: 'Fine e trascrivi', 'aria-label': 'Fine e trascrivi', onclick: () => fine(true) }, '⏹', h('span', null, 'Fine')),
    h('button', { type: 'button', title: 'Annulla la registrazione', 'aria-label': 'Annulla la registrazione', onclick: async () => { if (await chiedi('Annullare la registrazione?', [{ testo: 'Annulla e butta l\'audio', valore: 'si', pericolo: true }]) === 'si') { fine(false); avviso('Registrazione annullata.'); } } }, '🗑'));
  document.body.appendChild(pillola);
  const avvisoUscita = () => { if (document.hidden) avviso('🎙 La registrazione continua solo con l\'app aperta: torna qui se iOS la mette in pausa.', 6000); };
  document.addEventListener('visibilitychange', avvisoUscita);
  let finito = false;
  function fine(usa: boolean): void {
    if (finito) return; finito = true;
    clearInterval(tic); document.removeEventListener('visibilitychange', avvisoUscita); pillola.remove(); try { wake && wake.release(); } catch (_) { /* */ }
    rec.onstop = () => { st.getTracks().forEach(t => t.stop()); if (usa) elabora(new Blob(pezzi, { type: rec.mimeType || 'audio/mp4' }), 'Lezione ' + new Date().toLocaleDateString('it-IT')); };
    rec.stop();
  }
  rec.start(10000);
  avviso('🎙 Registro in sottofondo: continua pure a scrivere. Tocca «Fine» in basso quando la lezione finisce.', 5000);

  async function elabora(b: Blob, nome: string): Promise<void> {
    // la trascrizione lavora in sottofondo (pillola), poi un avviso apre la revisione
    const stato = h('span.audio-stato', null, 'Preparo…'), pill = h('div.audio-pillola.lavora', { role: 'status' }, h('span.audio-giro'), stato);
    document.body.appendChild(pill);
    try {
      const r = await Lezioni.processa(b, { ...contesto, titolo: contesto.titolo || nome }, t => { stato.textContent = t; });
      try { Tocco.clic(1); } catch (_) { /* */ } if (navigator.vibrate) navigator.vibrate([10, 60, 10]);
      svuota(pill); pill.classList.remove('lavora'); pill.classList.add('pronta');   // resta finché non la apri
      pill.append(h('button.audio-fine', { type: 'button', onclick: () => { pill.remove(); rivedi(b, nome, r); } }, '✓ Trascrizione pronta' + (r.corr.length ? ' · ' + r.corr.length + ' correzioni' : '') + ' — Rivedi'));
    } catch (e: any) { stato.textContent = '⚠️ ' + (e && e.message || e); pill.append(h('button', { type: 'button', 'aria-label': 'Chiudi', onclick: () => pill.remove() }, '✕')); }
  }
  function rivedi(b: Blob, nome: string, r: { seg: Segmento[]; corr: { i: number; prima: string; dopo: string; nota: string; ok: boolean }[] }): void {
    const url = URL.createObjectURL(b), player = h('audio', { controls: true, src: url, preload: 'metadata', style: { width: '100%' } }) as HTMLAudioElement;
    const lista = h('div.audio-corr', null, r.corr.length ? null : h('div.tenue', null, '✓ Nessun punto dubbio: il testo era coerente.'),
      ...r.corr.map(c => h('label.audio-c', null,
        h('input', { type: 'checkbox', checked: true, onchange: (e: Event) => c.ok = (e.target as HTMLInputElement).checked }),
        h('button.btn-testo', { type: 'button', 'aria-label': 'Riascolta', onclick: (e: Event) => { e.preventDefault(); player.currentTime = Math.max(0, r.seg[c.i].s - 1); player.play(); } }, '▶ ' + Lezioni.mmss(r.seg[c.i].s)),
        h('div', null, h('div.audio-prima', null, c.prima), h('div.audio-dopo', null, c.dopo), c.nota ? h('div.tenue.piccolo', null, c.nota) : null))));
    const fs2 = foglio({ titolo: '🎙 Trascrizione pronta', etichettaSalva: 'Aggiungi', corpo: h('div.modulo', null,
      h('div.tenue.piccolo', null, r.seg.length + ' frasi · ' + Lezioni.mmss(r.seg[r.seg.length - 1].e) + ' di audio · ' + r.corr.length + ' correzioni dell\'AI (togli la spunta per tenere l\'originale; ▶ per riascoltare).'),
      player, lista,
      h('button.btn.neutro', { type: 'button', onclick: async () => { try { const c = await Drive.sottocartella('Lezioni audio'); await Drive.carica(nome.replace(/[\\/:*?"<>|]/g, '-') + '.' + ((b.type.split('/')[1] || 'm4a').split(';')[0]), c, b, b.type || 'audio/mp4'); avviso('☁︎ Audio salvato in «Calendario personale/Lezioni audio».'); } catch (e: any) { avviso('Drive: ' + (e && e.message || e), 6000); } } }, '☁︎ Salva anche l\'audio su Drive')),
      salva: () => {
        // v0.43 memoria: ogni correzione accettata insegna «come suona → come si scrive»; quelle rifiutate la indeboliscono
        for (const c of r.corr) for (const d of MemoriaIA.differenze(c.prima, c.dopo)) {
          if (c.ok) { MemoriaIA.nota('audio', 'correzione', d.prima, d.dopo); for (const w of d.dopo.split(/\s+/)) if (w.length > 5) MemoriaIA.nota('audio', 'termine', w.replace(/[.,;:!?]/g, ''), null, .5); }
          else MemoriaIA.smentisci('audio', 'correzione', d.prima);
        }
        const seg = r.seg.map((x, i) => { const c = r.corr.find(z => z.i === i && z.ok); return c ? { ...x, t: c.dopo } : x; }); aggiungi(Lezioni.inMarkdown(seg, nome)); setTimeout(() => URL.revokeObjectURL(url), 60000); } });
    void fs2;
  }
}
