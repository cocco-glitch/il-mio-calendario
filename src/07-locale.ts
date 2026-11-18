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

  // ---------- v0.52 (BP2 §3): diagnostica dell'errore per archetipo disciplinare, a zero token (< 3 ms) ----------
  interface ContestoDiag { scelta: string; corretta: string; domanda?: string; opzioni?: string[]; }
  const taglia = (x: any) => String(x == null ? '' : x).slice(0, 400);
  /** Primo numero di un testo (accetta 1,2·10^3, 1.2e-3, 3×10⁻⁵, 1 200). */
  function numero(t: string): number | null {
    const sup: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
    const x = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, m => '^' + m.split('').map(c => sup[c]).join('')).replace(/(\d)\s(?=\d{3}\b)/g, '$1').replace(/−/g, '-');
    const m = /(-?\d+(?:[.,]\d+)?)\s*(?:(?:[x×·*]\s*10\s*\^?\s*\(?\s*(-?\d+)\)?)|[eE](-?\d+))?/.exec(x);
    if (!m) return null;
    const v = parseFloat(m[1].replace(',', '.')) * Math.pow(10, parseInt(m[2] || m[3] || '0', 10));
    return isFinite(v) ? v : null;
  }
  function diagnosticaStemDimensionale(c: ContestoDiag): string | null {
    const s = numero(c.scelta), g = numero(c.corretta);
    if (s == null || g == null || !s || !g || s === g) return null;
    if (Math.abs(s + g) < 1e-9 * Math.abs(g)) return '➖ Segno invertito: il valore è giusto ma con il segno opposto (controlla il verso o la convenzione).';
    if (Math.abs(g) !== 1 && Math.abs(s * g - 1) < 0.02) return '🔄 Reciproco: hai calcolato 1/x invece di x (controlla la formula inversa).';
    const l = Math.log10(Math.abs(s / g)), k = Math.round(l);
    if (k !== 0 && Math.abs(l - k) < 0.02) return '⚠️ Ordine di grandezza: fattore 10^' + k + ' (controlla conversione unità SI).' + (s * g < 0 ? ' Anche il segno è invertito.' : '');
    return null;
  }
  /** H2SO4 → H₂SO₄ (indici in pedice dopo un elemento o una parentesi). */
  const formula = (t: string) => t.replace(/([A-Z][a-z]?|\))(\d+)/g, (_, a: string, n: string) => a + n.split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[+d]).join(''));
  const COPPIE_OPPOSTE: [string, string][] = [['ossidazion', 'riduzion'], ['ossida', 'riduc'], ['anabol', 'catabol'], ['esocitosi', 'endocitosi'], ['parasimpatic', 'simpatic'], ['antagonist', 'agonist'],
    ['esotermic', 'endotermic'], ['esoergonic', 'endoergonic'], ['meiosi', 'mitosi'], ['efferent', 'afferent'], ['espirazion', 'inspirazion'], ['diastole', 'sistole'], ['ipotonic', 'ipertonic'],
    ['catodo', 'anodo'], ['gluconeogenesi', 'glicolisi'], ['depolarizz', 'iperpolarizz'], ['basic', 'acid'], ['extracellular', 'intracellular'], ['eterozigot', 'omozigot'], ['recessiv', 'dominant'],
    ['matrice mitocondriale', 'citoplasma'], ['citosol', 'mitocondri'], ['nucleo', 'citoplasma'], ['lume', 'stroma'], ['tilacoid', 'stroma'], ['reticolo endoplasmatico liscio', 'reticolo endoplasmatico rugoso'],
    ['eucariot', 'procariot'], ['idrofil', 'idrofob'], ['purin', 'pirimidin'], ['inibizione', 'attivazione']];
  function diagnosticaScienzeCompartimenti(c: ContestoDiag): string | null {
    const s = n2(c.scelta), g = n2(c.corretta);
    for (const [a, b] of COPPIE_OPPOSTE) {
      const re = (w: string) => new RegExp('(^|[^a-z])' + w.replace(/ /g, '\\s+'));
      if ((re(a).test(s) && re(b).test(g) && !re(a).test(g)) || (re(b).test(s) && re(a).test(g) && !re(b).test(g)))
        return '🔀 Inversione rilevata: hai scelto il meccanismo del compartimento opposto.';
    }
    const fs = /\b(?:[A-Z][a-z]?\d*|\(\w+\)\d*){2,}\b/.exec(c.scelta), fg = /\b(?:[A-Z][a-z]?\d*|\(\w+\)\d*){2,}\b/.exec(c.corretta);
    if (fs && fg && fs[0] !== fg[0] && fs[0].replace(/\d/g, '') === fg[0].replace(/\d/g, ''))
      return '🧪 Formula: stessi elementi ma indici diversi (' + formula(fs[0]) + ' invece di ' + formula(fg[0]) + ').';
    return null;
  }
  /** Anno citato: 1848, 2001, «XV sec» (→ metà secolo). */
  function anno(t: string): number | null {
    const m = /\b(1\d{3}|20\d{2}|[IVX]+\s*sec)/i.exec(t); if (!m) return null;
    if (/^\d/.test(m[1])) return parseInt(m[1], 10);
    const r = m[1].replace(/\s*sec.*/i, '').toUpperCase(), v: Record<string, number> = { I: 1, V: 5, X: 10 };
    let n = 0; for (let i = 0; i < r.length; i++) { const a = v[r[i]], b = v[r[i + 1]] || 0; n += a < b ? -a : a; }
    return n ? (n - 1) * 100 + 50 : null;
  }
  function diagnosticaCronologiaCausalita(c: ContestoDiag): string | null {
    const s = anno(c.scelta), g = anno(c.corretta) ?? anno(c.domanda || '');
    if (s == null || g == null || Math.abs(s - g) < 3) return null;
    const d = Math.abs(s - g), circa = d >= 20 ? Math.round(d / 10) * 10 : d;
    return '⏳ Anacronismo: l\'evento scelto è ' + (s > g ? 'successivo' : 'precedente') + ' di circa ' + circa + ' anni al contesto richiesto.';
  }
  const ASSOLUTI = /\b(esclusivamente|sempre|mai|soltanto|unicamente|in ogni caso|in nessun caso|tutti|nessun[oa]?|obbligatoriamente)\b/i;
  const ECCEZIONI = /\b(salvo(?: che)?|tranne|eccetto|ad eccezione|a meno che|purch[ée]|entro \d+ giorni|di regola|in linea di massima|fatt[oa] salv[oa])\b/i;
  function diagnosticaNormativaEccezioni(c: ContestoDiag): string | null {
    const a = ASSOLUTI.exec(c.scelta);
    if (a && !new RegExp('\\b' + a[1] + '\\b', 'i').test(c.corretta)) return '⚖️ Trappola normativa: l\'opzione contiene "' + a[1].toLowerCase() + '", ma la norma prevede eccezioni.';
    const ts = /(\d+)\s*(giorni|mesi|anni)/i.exec(c.scelta), tg = /(\d+)\s*(giorni|mesi|anni)/i.exec(c.corretta);
    if (ts && tg && (ts[1] !== tg[1] || ts[2].toLowerCase() !== tg[2].toLowerCase())) return '📅 Termine sbagliato: ' + ts[0] + ' invece di ' + tg[0] + '.';
    if (ECCEZIONI.test(c.corretta) && !ECCEZIONI.test(c.scelta)) return '⚖️ Trappola normativa: la risposta giusta prevede un\'eccezione o un termine che la tua non considera.';
    return null;
  }
  /** Damerau-Levenshtein (trasposizioni adiacenti), sensibile ad accenti, insensibile alle maiuscole. */
  function damerau(a: string, b: string): number {
    a = a.toLowerCase().trim().slice(0, 120); b = b.toLowerCase().trim().slice(0, 120);
    const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => { const r = new Array(b.length + 1).fill(0); r[0] = i; return r; });
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }
  function diagnosticaMorfologiaLevenshtein(c: ContestoDiag): string | null {
    const s = c.scelta.trim(), g = c.corretta.trim(); if (!s || !g || s.length > 80 || g.length > 80) return null;
    const k = damerau(s, g); if (!k) return null;
    if (k <= 2 && Math.max(s.length, g.length) >= 3) return '✍️ Quasi esatto (distanza ' + k + (k === 1 ? ' carattere' : ' caratteri') + '): controlla la desinenza/accento.';
    return null;
  }
  /** Pronuncia (sintesi vocale del browser, offline): utile nelle lingue straniere. */
  function pronuncia(testo: string, lingua = 'it-IT'): boolean {
    try { if (!('speechSynthesis' in window)) return false; const u = new SpeechSynthesisUtterance(testo); u.lang = lingua; speechSynthesis.cancel(); speechSynthesis.speak(u); return true; } catch (_) { return false; }
  }
  /** Prima riga dove le parentesi/virgolette si sbilanciano (0 = bilanciato). */
  function rigaSbilanciata(t: string): number {
    const pila: [string, number][] = [], ap: Record<string, string> = { ')': '(', ']': '[', '}': '{' }; let riga = 1, str: string | null = null;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i]; if (ch === '\n') { riga++; continue; }
      if (str) { if (ch === '\\') i++; else if (ch === str) str = null; continue; }
      if (ch === '"' || ch === '\'' || ch === '`') { str = ch; continue; }
      if ('([{'.includes(ch)) pila.push([ch, riga]);
      else if (ap[ch]) { const t2 = pila.pop(); if (!t2 || t2[0] !== ap[ch]) return riga; }
    }
    return str ? riga : pila.length ? pila[pila.length - 1][1] : 0;
  }
  function diagnosticaSintassiAST(c: ContestoDiag): string | null {
    const s = c.scelta, g = c.corretta;
    const msg = (r: number) => '🐛 Errore di sintassi o indice off-by-one alla riga ' + r + ' del blocco.';
    const rb = rigaSbilanciata(s); if (rb && !rigaSbilanciata(g)) return msg(rb);
    const ej = (t: string) => { try { JSON.parse(t); return true; } catch (_) { return false; } };
    if (/^\s*[{[]/.test(g) && ej(g) && !ej(s)) return msg(1);
    if (/^\s*(select|insert|update|delete)\b/i.test(g) && !/;\s*$/.test(s) && /;\s*$/.test(g)) return msg(Math.max(1, s.split('\n').length));
    const ls = s.split('\n'), lg = g.split('\n');
    for (let i = 0; i < Math.max(ls.length, lg.length); i++) {
      const a = (ls[i] || '').trim(), b = (lg[i] || '').trim();
      if (a === b) continue;
      const op = (t: string) => t.replace(/<=/g, '<').replace(/>=/g, '>').replace(/\s+/g, '');
      if (op(a) === op(b)) return msg(i + 1);   // < invece di <= (o viceversa): classico off-by-one
      const na = a.match(/-?\d+/g), nb = b.match(/-?\d+/g);
      if ((ls.length > 1 || lg.length > 1) || (na && nb && na.length === nb.length && na.some((x, k) => Math.abs(+x - +nb[k]) === 1))) return msg(i + 1);
      return null;
    }
    return null;
  }
  const PLUGIN: Record<string, (c: ContestoDiag) => string | null> = { diagnosticaStemDimensionale, diagnosticaScienzeCompartimenti, diagnosticaCronologiaCausalita, diagnosticaNormativaEccezioni, diagnosticaMorfologiaLevenshtein, diagnosticaSintassiAST };
  /** Diagnostica locale dell'errore secondo l'archetipo della materia (null = nessuna osservazione utile). */
  function diagnosticaPerArchetipo(archetipo: string, c: ContestoDiag): string | null {
    const def = (ARCHETIPI_DISCIPLINARI as Record<string, DefinizioneArchetipo>)[archetipo];
    const f = def && PLUGIN[def.pluginLocaleId]; if (!f) return null;
    try { return f({ scelta: taglia(c.scelta), corretta: taglia(c.corretta), domanda: taglia(c.domanda), opzioni: c.opzioni }); } catch (_) { return null; }
  }
  /** Valuta una risposta aperta su una rubrica di punti chiave (sovrapposizione delle radici, pesata IDF tipo BM25). */
  function rubrica(testo: string, punti: string[]): { punteggio: number; coperti: string[]; mancanti: string[] } {
    const parole = (t: string) => n2(t).split(/\W+/).filter(w => w.length > 3 && !STOP.has(w)).map(radice);
    const r = new Set(parole(testo)), docs = punti.map(p => new Set(parole(p)));
    const df = new Map<string, number>(); docs.forEach(d => d.forEach(w => df.set(w, (df.get(w) || 0) + 1)));
    const idf = (w: string) => Math.log(1 + (punti.length - (df.get(w) || 0) + 0.5) / ((df.get(w) || 0) + 0.5));
    const coperti: string[] = [], mancanti: string[] = [];
    punti.forEach((p, i) => {
      const ws = Array.from(docs[i]); if (!ws.length) { coperti.push(p); return; }
      const tot = ws.reduce((s, w) => s + idf(w), 0), ok = ws.filter(w => r.has(w)).reduce((s, w) => s + idf(w), 0);
      (tot && ok / tot >= 0.5 ? coperti : mancanti).push(p);
    });
    return { punteggio: punti.length ? coperti.length / punti.length : 0, coperti, mancanti };
  }

  return { radice, espandi, pulisciPagine, frasiChiave, accorciaCorretta, citazioneVera, digitabili, pulisciParlato, quasiTermini, segmentoDubbio, carteDaTesto, spiegazioneBreve, concettiMancanti, capisci, distanza,
    formula, damerau, pronuncia, diagnosticaPerArchetipo, rubrica, PLUGIN };
})();
