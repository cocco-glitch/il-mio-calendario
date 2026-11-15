// =====================================================================
// 07-locale.ts — v0.44 ALGORITMI LOCALI (zero token): tutto ciò che si può fare senza AI si fa qui.
// Ogni assistente prova prima questi; chiama l'AI solo per ciò che resta (e le manda meno testo).
//  A. ASSISTENTE: riconoscitore di intenzioni in italiano (aprire, cercare, quiz, carte, appunti, studia ora,
//     lezione audio, pacchetti, quiz creati, guida d'uso), più frasi divise in pezzi («… e …», «poi»).
//  B. TESTI: pulizia delle fonti (intestazioni/piè di pagina ripetuti, numeri di pagina, righe spezzate),
//     radici delle parole e sinonimi di studio per cercare meglio le pagine, frasi chiave per densità.
//  C. QUIZ: correzioni automatiche senza rigenerare (corretta troppo lunga → si accorcia; citazione non
//     verbatim → si sostituisce con la frase vera più simile della fonte; risposte con simboli → digitabili).
//  D. AUDIO: pulizia del parlato (intercalari, parole ripetute, maiuscole), segmenti dubbi decisi in locale
//     (solo quelli vanno all'AI), parole quasi uguali a termini noti (distanza di modifica).
//  E. FLASHCARD: carte estratte dal testo con regole (definizioni «X è…», «Termine: …», grassetti, formule).
//  F. SPIEGAZIONE BREVE: dalla correzione passo-passo già scritta (Il concetto + In sintesi), senza AI.
//  G. RIASSUNTO: concetti chiave dell'appunto che mancano nel riassunto (prima del controllo AI).
// =====================================================================

const Locale = (() => {
  const n2 = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const STOP = new Set('il lo la i gli le un una uno di da in con su per tra fra del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle e ed o od ma che chi cui non si come piu anche se sono e era essere ha hanno ho questo questa questi queste quello quella quelli quelle mi ti ci vi ne me te lui lei noi voi loro mio mia tuo tua suo sua cosa quale quali quando dove perche molto poco tutto tutti ogni fare fa fanno puo possono deve devono viene vengono stato stata'.split(' '));
  /** Radice semplice italiana (per confrontare «leve», «leva», «leveraggio» → «lev»). */
  const radice = (w: string) => { w = n2(w).replace(/[^a-z0-9]/g, ''); return w.length > 6 ? w.slice(0, w.length - 2) : w.length > 4 ? w.slice(0, w.length - 1) : w; };
  const SINONIMI: Record<string, string[]> = {
    leva: ['fulcro', 'braccio', 'momento'], momento: ['torcente', 'coppia', 'braccio'], forza: ['newton', 'dinamica'], energia: ['lavoro', 'potenza', 'joule'],
    entalpia: ['calore', 'termochimica', 'hess'], entropia: ['disordine', 'spontaneita'], equilibrio: ['costante', 'chatelier'], acido: ['base', 'ph', 'protone'],
    ossidoriduzione: ['redox', 'ossidazione', 'riduzione', 'elettroni'], soluzione: ['concentrazione', 'molarita', 'soluto', 'solvente'], gas: ['pressione', 'volume', 'temperatura'],
    cellula: ['membrana', 'organelli', 'citoplasma'], mitosi: ['ciclo', 'cromosomi', 'divisione'], meiosi: ['gameti', 'crossing', 'aploide'], dna: ['replicazione', 'nucleotidi', 'elica'],
    trascrizione: ['rna', 'polimerasi', 'promotore'], traduzione: ['ribosoma', 'codone', 'trna'], enzima: ['substrato', 'catalisi', 'attivazione'], fluido: ['pressione', 'densita', 'bernoulli'],
    onda: ['frequenza', 'lunghezza', 'suono'], cinematica: ['velocita', 'accelerazione', 'moto'], termodinamica: ['calore', 'lavoro', 'entropia'], elettricita: ['carica', 'corrente', 'potenziale'],
  };
  function espandi(parole: string[]): string[] {
    const o = new Set(parole.map(n2));
    for (const w of parole) { const r = radice(w); for (const k in SINONIMI) if (radice(k) === r) SINONIMI[k].forEach(x => o.add(x)); }
    return Array.from(o);
  }
  // ---------- B. testi ----------
  /** Toglie da un testo diviso in pagine le righe che si ripetono (intestazioni, piè di pagina, diciture). */
  function pulisciPagine(pagine: string[]): string[] {
    const conta = new Map<string, number>();
    const righe = pagine.map(p => p.split('\n').map(r => r.trim()).filter(Boolean));
    for (const rr of righe) new Set(rr.map(r => n2(r).replace(/\d+/g, '#'))).forEach(k => conta.set(k, (conta.get(k) || 0) + 1));
    const soglia = Math.max(3, pagine.length * .3);
    return righe.map(rr => rr.filter(r => { const k = n2(r).replace(/\d+/g, '#'); return !(conta.get(k)! >= soglia && r.length < 120) && !/^(pag(ina)?\.?\s*)?\d{1,4}$/i.test(r) && !/volume concesso in uso/i.test(r); })
      .join('\n').replace(/(\w)-\n(\w)/g, '$1$2').replace(/([^.:;!?\n])\n(?=[a-zà-ù])/g, '$1 '));
  }
  /** Le frasi più dense di parole chiave (per mandare all'AI solo il necessario). */
  function frasiChiave(testo: string, chiavi: string[], maxCar: number): string {
    const rad = new Set(espandi(chiavi).map(radice));
    const frasi = testo.split(/(?<=[.!?])\s+|\n+/).map((t, i) => ({ t: t.trim(), i, s: t.split(/\s+/).reduce((a, w) => a + (rad.has(radice(w)) ? 1 : 0), 0) })).filter(x => x.t.length > 20);
    const scelte: typeof frasi = []; let tot = 0;
    for (const f of frasi.slice().sort((a, b) => b.s - a.s)) { if (!f.s || tot + f.t.length > maxCar) continue; scelte.push(f); tot += f.t.length; }
    return scelte.sort((a, b) => a.i - b.i).map(x => x.t).join(' ');
  }
  // ---------- C. quiz ----------
  /** La corretta è più lunga dei distrattori: prova ad accorciarla togliendo parentesi e incisi finali. */
  function accorciaCorretta(d: any): boolean {
    if (!d || d.t !== 'mcq' || !Array.isArray(d.o) || d.o.length !== 5) return false;
    const max = Math.max(...d.o.slice(1).map((x: string) => x.length)); if (d.o[0].length <= max) return false;
    const prove = [(x: string) => x.replace(/\s*\([^)]*\)/g, ''), (x: string) => x.replace(/[,;:]\s*(cioè|ovvero|ossia|quindi|perché|poiché|in quanto|dato che)\b.*$/i, ''), (x: string) => x.replace(/[,;]\s[^,;]*$/, '')];
    let c = d.o[0];
    for (const p of prove) { c = p(c).trim(); if (c.length <= max && c.length > 2) { d.o[0] = c; return true; } }
    return false;
  }
  /** Citazione non verbatim: la sostituisce con la frase vera della fonte più simile (se lo è abbastanza). */
  function citazioneVera(c: string, fonte: string): string | null {
    const P = new Set(n2(c).split(/\W+/).filter(w => w.length > 3)); if (P.size < 4) return null;
    let best = '', bs = 0;
    for (const f of fonte.split(/(?<=[.!?])\s+|\n+/)) { const F = n2(f).split(/\W+/).filter(w => w.length > 3); if (F.length < 4) continue; let x = 0; for (const w of F) if (P.has(w)) x++; const s = x / Math.max(P.size, F.length); if (s > bs) { bs = s; best = f.trim(); } }
    return bs >= .6 && best.length > 20 ? best : null;
  }
  // esponenti solo dopo un'unità (m² → m2); dopo un numero (10²) cambierebbe il valore: resta e il controllo la scarta
  const SIMBOLI: [RegExp, string][] = [[/([a-zA-Z])²/g, '$12'], [/([a-zA-Z])³/g, '$13'], [/[·×]/g, '*'], [/÷/g, '/'], [/Δ|δ/g, 'delta'], [/π/g, 'pi'], [/[→←↔]/g, ''], [/µ/g, 'micro'], [/°/g, ' gradi'], [/±/g, '+-'], [/√/g, 'radice di ']];
  /** Rende digitabili le risposte dei completamenti (aggiunge la variante senza simboli). */
  function digitabili(a: string[]): string[] { const o = new Set<string>(); for (const x of a) { let y = x; for (const [re, s] of SIMBOLI) y = y.replace(re, s); y = y.replace(/\s+/g, ' ').trim(); if (y) o.add(y); } return Array.from(o); }
  // ---------- D. audio ----------
  const INTERCALARI = /\b(ehm+|eh+|uhm+|mmh+|cioè cioè|diciamo|ok ok|allora allora)\b[,.]?\s*/gi;
  function pulisciParlato(t: string): string {
    return t.replace(INTERCALARI, '').replace(/\b(\w+)(\s+\1\b)+/gi, '$1').replace(/\s+([,.;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim().replace(/^[a-zà-ù]/, c => c.toUpperCase());
  }
  function distanza(a: string, b: string): number {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  /** Parole quasi uguali a un termine noto (es. «entalpa» ~ «entalpia»): candidati a errore di ascolto. */
  function quasiTermini(t: string, termini: string[]): { parola: string; termine: string }[] {
    const T = termini.filter(x => x.length >= 6).map(x => ({ x, n: n2(x) })), o: { parola: string; termine: string }[] = [];
    for (const w of t.split(/[^\p{L}]+/u)) { const nw = n2(w); if (nw.length < 5 || STOP.has(nw)) continue; for (const k of T) { if (nw === k.n) break; if (distanza(nw, k.n) <= (k.n.length > 8 ? 2 : 1)) { o.push({ parola: w, termine: k.x }); break; } } }
    return o;
  }
  /** Segmento dubbio deciso in locale (confidenza del riconoscitore, compressione, termini quasi uguali). */
  function segmentoDubbio(s: { t: string; lp?: number; cr?: number }, termini: string[]): boolean {
    return (s.lp != null && s.lp < -.6) || (s.cr || 0) > 2.4 || s.t.length < 3 || quasiTermini(s.t, termini).length > 0 || /(\b\w+\b)(?:\s+\1\b){2,}/i.test(s.t);
  }
  // ---------- E. flashcard ----------
  function carteDaTesto(testo: string, max = 12): { q: string; r: string }[] {
    const o: { q: string; r: string }[] = [], visti = new Set<string>();
    const add = (q: string, r: string) => { q = q.trim().replace(/\s+/g, ' '); r = r.trim().replace(/\s+/g, ' ').replace(/[.;]$/, ''); const k = n2(q); if (q.length < 8 || r.length < 2 || r.length > 140 || visti.has(k)) return; visti.add(k); o.push({ q, r }); };
    for (const riga of testo.split('\n')) {
      const l = riga.replace(/^[-*•\s]+/, '').trim(); if (!l || /::/.test(l)) continue;
      let m = /^\*\*(.{2,60})\*\*\s*[:\-–]\s*(.{3,140})$/.exec(l) || /^([A-ZÀ-Ù][^:]{2,50}):\s+(.{3,140})$/.exec(l);
      if (m) { add('Che cos\'è ' + m[1].replace(/\*/g, '') + '?', m[2]); continue; }
      m = /^(?:il |lo |la |l'|i |gli |le )?([^,.;:]{3,50}?)\s+(è|sono|si definisce|si chiama|indica|rappresenta)\s+(.{5,140}?)[.;]?$/i.exec(l);
      if (m && !/^(questo|questa|esso|essa|ciò|che)$/i.test(m[1])) { add(m[2] === 'si chiama' ? 'Come si chiama ' + m[3] + '?' : 'Che cos\'è ' + m[1] + '?', m[2] === 'si chiama' ? m[1] : m[3]); continue; }
      m = /^([A-Za-zΔρλνμ][\w ]{0,30})\s*=\s*([^=]{2,60})$/.exec(l);
      if (m && /[a-zA-Z]/.test(m[2])) add('Formula di ' + m[1].trim() + '?', m[1].trim() + ' = ' + m[2].trim());
      if (o.length >= max) break;
    }
    return o.slice(0, max);
  }
  // ---------- F. spiegazione breve ----------
  function spiegazioneBreve(e: string | string[]): string | null {
    const passi = (Array.isArray(e) ? e : [e]).map(String);
    const conc = passi.find(x => /^il concetto:/i.test(x)), sint = passi.find(x => /^in sintesi:/i.test(x));
    if (!conc && !sint) return null;
    return [conc, sint].filter(Boolean).map(x => x!.replace(/^[^:]+:\s*/, '')).join('\n\n');
  }
  // ---------- G. riassunto ----------
  function concettiMancanti(appunto: string, riassunto: string, max = 8): string[] {
    const r = new Set(n2(riassunto).split(/\W+/).map(radice));
    const cand = new Map<string, number>();
    for (const m of appunto.matchAll(/^#+\s*(.+)$|\*\*([^*]{3,40})\*\*|^\s*[-*]?\s*([^:\n]{3,40})\s*::/gm)) { const t = (m[1] || m[2] || m[3] || '').trim(); if (t) cand.set(t, (cand.get(t) || 0) + 3); }
    const freq = new Map<string, number>(); for (const w of n2(appunto).split(/\W+/)) if (w.length > 6 && !STOP.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
    freq.forEach((n, w) => { if (n >= 3) cand.set(w, (cand.get(w) || 0) + n); });
    return Array.from(cand.entries()).filter(([t]) => !n2(t).split(/\W+/).filter(w => w.length > 3).every(w => r.has(radice(w))) ? true : false).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, max);
  }
  // ---------- A. assistente ----------
  const VISTE: [RegExp, string][] = [[/statistic/, 'statistiche'], [/\bpiano\b|programma/, 'piano'], [/\b(carte|flashcard|card)\b/, 'carte'], [/errori/, 'errori'], [/esami|appell/, 'esami'], [/syllabus/, 'syllabus'], [/tabell/, 'tabelle'],
    [/appunt/, 'appunti'], [/calendari|settimana|mese/, 'calendario'], [/\boggi\b|home/, 'oggi'], [/promemoria|cose da fare|to ?do/, 'promemoria'], [/\bnote\b/, 'note'], [/impostazion|preferenz/, 'impostazioni'], [/studio|schede/, 'studio']];
  const MAT: [RegExp, string][] = [[/chimic|mol[ae]|acid|ph\b|redox|entalp|entrop|reazion|legam|atom|orbital|soluzion|gas\b/, 'Chimica'], [/biolog|cellul|dna|rna|protein|mitosi|meiosi|gene|enzim|membran|organell/, 'Biologia'], [/fisic|forz|lev[ae]\b|momento|cinemat|dinamic|energi|onda|fluid|pression|elettr|ottic|termodin/, 'Fisica']];
  const AIUTO: [RegExp, string][] = [
    [/^(come|dove)\b(?=.*\b(quiz|domande))(?=.*\b(cre|fa|genera))/, 'Studio → Altro ▾ → «Quiz creati in app» → «Crea un quiz»: scrivi l\'argomento, cerca le fonti nel Drive e tocca Crea. Oppure scrivi qui «crea un quiz su …».'],
    [/^(come|dove)\b(?=.*\b(pacchett|piano))(?=.*\b(caric|aggiorn|import))/, 'Studio → «Aggiorna pacchetti da Drive»: l\'app cerca i pacchetti in tutto il tuo Drive, anche con nomi qualunque.'],
    [/^(come|dove)\b(?=.*\b(flashcard|carte|card))(?=.*\b(cre|fa))/, 'In un appunto scrivi «domanda :: risposta» oppure {{parola}}: diventa una flashcard. Con ✨ l\'app ne propone altre dal testo.'],
    [/^(come|dove)\b(?=.*\b(registr|lezion|audio))/, 'Apri un appunto e tocca 🎙: registra (anche in sottofondo mentre scrivi) o carica un file; la trascrizione si corregge da sola.'],
    [/^(come|dove)\b(?=.*\b(zoom|ingrand))/, 'Nel foglio a mano: pizzica con due dita (puoi anche trascinare mentre zoomi), doppio tocco per 2,5× e di nuovo per il 100%.'],
    [/^(come|dove)\b(?=.*\b(chiave|groq|gemini))/, 'Altro → Studio e AI → Spiegazioni AI: incolla la chiave Groq (e, se vuoi, quella Gemini).'],
    [/^(come|dove)\b(?=.*\b(dispositiv|esc|scolleg))/, 'Altro → Dati e backup → Google Drive: «Scollega» per uscire (anche cancellando i dati da qui) e «Dispositivi riconosciuti» per scollegarne altri.'],
  ];
  type AzL = { tipo: string; [k: string]: any };
  /** Una frase (anche con più richieste) → azioni, oppure null se serve l'AI. */
  function capisci(frase: string): AzL[] | null {
    const pezzi = frase.split(/\s*(?:;|\.\s|\be poi\b|\bpoi\b|,\s*e\s+|\s+e\s+(?=(?:crea|fa|apri|vai|mostra|cerca|trova|ricord|aggiung|registr|studia|aggiorna|metti|segna)\w*\b))\s*/i).map(x => x.trim()).filter(Boolean);
    const out: AzL[] = [];
    for (const p of pezzi) { const a = uno(p); if (!a) return null; out.push(...a); }
    return out.length ? out : null;
  }
  function uno(p: string): AzL[] | null {
    const n = n2(p);
    for (const [re, t] of AIUTO) if (re.test(n)) return [{ tipo: 'risposta', testo: t }];
    if (/quiz creati|quiz dell.?app|miei quiz/.test(n)) return [{ tipo: 'quiz_creati' }];
    let m = /(?:crea(?:mi)?|fa(?:mmi)?|genera(?:mi)?|prepara(?:mi)?|voglio|vorrei|nuovo)?\s*(?:un |dei |delle |degli )?(?:quiz|domande|test|esercizi)\s+(?:su|sul|sulla|sullo|sui|sugli|sulle|di|del|della|dei|delle|riguardo|per)\s+(.+)$/.exec(n);
    if (m) {
      const arg = m[1].replace(/\b(per favore|grazie|subito)\b/g, '').trim(); if (arg.length < 3) return null;
      const mat = (MAT.find(([re]) => re.test(arg + ' ' + n)) || [, ''])[1];
      const cosa = /problem|calcol|esercizi/.test(n) ? 'problemi' : /trabocchett|tranell/.test(n) ? 'trabocchetti' : /teori|definizion/.test(n) ? 'teoria' : 'misto';
      return [{ tipo: 'quiz', argomento: arg, materia: mat, cosa }];
    }
    if (/^(?:crea|fammi|genera|ripassa|apri|mostra|fai)?\s*(?:le |delle |mie )?(?:flashcard|carte|card)\b/.test(n)) return [{ tipo: 'carte' }];
    m = /^(?:cerca|trova|ricerca|dov.?e|dove sono)\s+(.+)$/.exec(n); if (m) return [{ tipo: 'cerca', testo: m[1] }];
    m = /^(?:crea|nuovo|nuova|scrivi|apri)?\s*(?:un |una )?(?:nuovo |nuova )?(?:appunto|nota|pagina di appunti)\s*(a mano)?\s*(?:su|sul|sulla|di|per|:)?\s*(.*)$/.exec(n);
    if (m && /appunto|nota|pagina di appunti/.test(n)) return [{ tipo: 'appunto', titolo: (m[2] || 'Nuovo appunto').replace(/^\w/, c => c.toUpperCase()), modo: m[1] ? 'mano' : undefined }];
    if (/(registra|registrare|dett|trascriv).*(lezion|audio)|lezione audio/.test(n)) return [{ tipo: 'lezione_audio' }];
    if (/studia(re)? ora|cosa (devo )?studi|sessione di studio|inizia(mo)? a studiare/.test(n)) return [{ tipo: 'studia_ora' }];
    if (/aggiorna.*(pacchett|piano|quiz).*drive|carica.*pacchett|pacchetti/.test(n)) return [{ tipo: 'pacchetti' }];
    if (/^(apri|aprimi|vai|portami|mostra(mi)?|fammi vedere|voglio vedere|visualizza)\b/.test(n)) { const v = VISTE.find(([re]) => re.test(n)); if (v) return [{ tipo: 'apri', vista: v[1] }]; }
    // eventi e promemoria: il riconoscitore del calendario (07-rapido), solo se la frase chiede UNA cosa
    if (/\b(e|ed|poi|anche)\s+(ricord|crea|fa|apri|cerca|aggiung|metti|segna|registr)\w*/.test(n)) return null;
    const r = interpreta(p);
    if (r && (r.ora || r.dataEsplicita || r.rrule || r.tipo === 'task')) return [r.tipo === 'task'
      ? { tipo: 'promemoria', titolo: r.titolo, data: r.dataEsplicita || r.ora ? ymd(r.giorno) : undefined, ora: r.ora ? pad2(r.ora[0]) + ':' + pad2(r.ora[1]) : undefined }
      : { tipo: 'evento', titolo: r.titolo, data: ymd(r.giorno), inizio: r.ora ? pad2(r.ora[0]) + ':' + pad2(r.ora[1]) : undefined, fine: r.fine ? pad2(r.fine[0]) + ':' + pad2(r.fine[1]) : undefined, tutto_il_giorno: r.tuttoIlGiorno, _rr: r.rrule }];
    return null;
  }
  return { radice, espandi, pulisciPagine, frasiChiave, accorciaCorretta, citazioneVera, digitabili, pulisciParlato, quasiTermini, segmentoDubbio, carteDaTesto, spiegazioneBreve, concettiMancanti, capisci, distanza };
})();
