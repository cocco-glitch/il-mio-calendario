// 07-mano.ts — Scrittura a mano negli appunti (v0.31).
//
// Scouting 13/11: GoodNotes / Notability (pagine a quadretti o righe, penna sensibile alla pressione,
// evidenziatore, gomma, scrittura → testo → quiz e flashcard con l'AI); web: Pointer Events danno
// pressione e inclinazione della Pencil su Safari iPad; Scribble di iPadOS può «mangiare» tratti sulle
// tele → blocchiamo i touch dello stilo sulla pagina; riconoscimento: modello visivo di Groq (Llama 4 Scout),
// gratuito con la stessa chiave, SOLO quando premi ✨, e il testo si controlla prima di usarlo.
//
// Dati: Appunto.mano = { t: tratti, h: altezza, sf: sfondo }. Coordinate su una larghezza logica di 1000.
// Tratto compatto: "colore|spessore|tipo|x,y,p x,y,p …" (tipo: p = penna, e = evidenziatore).

interface Mano { t: string[]; h: number; sf: 'quadretti' | 'righe' | 'bianco'; }
const LARG = 1000;

function decodTratto(s: string): { c: string; w: number; k: string; p: number[][] } {
  const [c, w, k, pts] = s.split('|');
  return { c, w: +w, k, p: (pts || '').split(' ').filter(Boolean).map(x => x.split(',').map(Number)) };
}
function codTratto(c: string, w: number, k: string, p: number[][]): string { return c + '|' + w + '|' + k + '|' + p.map(q => q.join(',')).join(' '); }

/** Disegna sfondo + tratti su un contesto (scala = pixel per unità logica). */
function disegnaMano(g: CanvasRenderingContext2D, m: Mano, scala: number, sfondoPieno = false): void {
  const W = LARG * scala, H = m.h * scala;
  g.clearRect(0, 0, W, H);
  if (sfondoPieno) { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
  if (m.sf !== 'bianco' && !sfondoPieno) {
    g.strokeStyle = 'rgba(120,130,160,.22)'; g.lineWidth = 1;
    const passo = (m.sf === 'quadretti' ? 25 : 40) * scala;
    g.beginPath();
    for (let y = passo; y < H; y += passo) { g.moveTo(0, y); g.lineTo(W, y); }
    if (m.sf === 'quadretti') for (let x = passo; x < W; x += passo) { g.moveTo(x, 0); g.lineTo(x, H); }
    g.stroke();
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const s of m.t) tracciaTratto(g, decodTratto(s), scala);
}
function tracciaTratto(g: CanvasRenderingContext2D, t: { c: string; w: number; k: string; p: number[][] }, scala: number): void {
  if (!t.p.length) return;
  g.globalAlpha = t.k === 'e' ? .32 : 1; g.strokeStyle = t.c;
  if (t.p.length === 1) { g.fillStyle = t.c; g.beginPath(); g.arc(t.p[0][0] * scala, t.p[0][1] * scala, t.w * scala / 2, 0, 7); g.fill(); g.globalAlpha = 1; return; }
  for (let i = 1; i < t.p.length; i++) {
    const a = t.p[i - 1], b = t.p[i];
    g.lineWidth = Math.max(.6, t.w * scala * (t.k === 'e' ? 1 : .45 + (b[2] || 50) / 100));
    g.beginPath(); g.moveTo(a[0] * scala, a[1] * scala); g.lineTo(b[0] * scala, b[1] * scala); g.stroke();
  }
  g.globalAlpha = 1;
}
/** Immagine PNG (fondo bianco) della pagina, per l'AI o per Drive. */
function immagineMano(m: Mano, larghezza = 1000): string {
  const cv = document.createElement('canvas'), s = larghezza / LARG;
  cv.width = larghezza; cv.height = Math.ceil(m.h * s);
  disegnaMano(cv.getContext('2d')!, m, s, true);
  return cv.toDataURL('image/png');
}
const manoVuota = (m?: Mano) => !m || !m.t.length;

/** Editor a mano dentro un elemento. Restituisce l'interfaccia per leggere i dati. */
function paginaMano(contenitore: HTMLElement, iniziale: Mano | undefined, cambia: () => void): { dati: () => Mano; ridisegna: () => void } {
  const m: Mano = iniziale ? { t: iniziale.t.slice(), h: iniziale.h, sf: iniziale.sf } : { t: [], h: 1400, sf: 'quadretti' };
  const storia: string[][] = [], futuro: string[][] = [];
  let strumento: 'penna' | 'evid' | 'gomma' = 'penna', colore = '#1f2a44', dito = !matchMedia('(pointer: fine), (hover: hover)').matches && !('ontouchstart' in window && navigator.maxTouchPoints > 1 && /iPad|Macintosh/.test(navigator.userAgent));
  let penna = false;   // diventa true alla prima Pencil vista: da lì il dito scorre soltanto
  const cv = h('canvas.mano-tela') as HTMLCanvasElement, g = cv.getContext('2d')!;
  const vivo = h('canvas.mano-vivo') as HTMLCanvasElement, gv = vivo.getContext('2d')!;
  const foglio = h('div.mano-foglio', null, cv, vivo);
  let scala = 1, dpr = Math.min(2, window.devicePixelRatio || 1);
  function dimensiona(): void {
    const w = foglio.clientWidth || 360; scala = w / LARG;
    for (const c of [cv, vivo]) { c.width = Math.round(w * dpr); c.height = Math.round(m.h * scala * dpr); c.style.height = (m.h * scala) + 'px'; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); gv.setTransform(dpr, 0, 0, dpr, 0, 0);
    disegnaMano(g, m, scala);
  }
  const salvaStoria = () => { storia.push(m.t.slice()); if (storia.length > 60) storia.shift(); futuro.length = 0; };
  // --- input ---
  let cur: number[][] | null = null, idPuntatore = -1;
  const punto = (e: PointerEvent): number[] => { const r = vivo.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / scala), Math.round((e.clientY - r.top) / scala), Math.round((e.pointerType === 'pen' ? (e.pressure || .5) : .5) * 100)]; };
  const scrive = (e: PointerEvent) => e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && dito && !penna);
  vivo.addEventListener('pointerdown', e => {
    if (e.pointerType === 'pen' && !penna) { penna = true; aggiornaBarra(); }
    if (!scrive(e) || cur) return;
    e.preventDefault(); try { vivo.setPointerCapture(e.pointerId); } catch (_) { /* puntatore sintetico */ } idPuntatore = e.pointerId;
    salvaStoria(); cur = [punto(e)];
    if (strumento === 'gomma') cancellaVicino(cur[0]);
  });
  vivo.addEventListener('pointermove', e => {
    if (!cur || e.pointerId !== idPuntatore) return; e.preventDefault();
    const evs = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const p = punto(ev), u = cur[cur.length - 1];
      if (Math.abs(p[0] - u[0]) + Math.abs(p[1] - u[1]) < 2) continue;
      if (strumento === 'gomma') { cancellaVicino(p); cur.push(p); continue; }
      cur.push(p);
      gv.lineCap = 'round'; tracciaTratto(gv, { c: colore, w: strumento === 'evid' ? 22 : 3, k: strumento === 'evid' ? 'e' : 'p', p: [u, p] }, scala);
    }
    if (cur[cur.length - 1][1] > m.h - 150) { m.h += 500; dimensiona(); }   // la pagina si allunga
  });
  const fine = (e: PointerEvent) => {
    if (!cur || e.pointerId !== idPuntatore) return;
    if (strumento !== 'gomma') m.t.push(codTratto(colore, strumento === 'evid' ? 22 : 3, strumento === 'evid' ? 'e' : 'p', cur));
    cur = null; idPuntatore = -1; gv.clearRect(0, 0, vivo.width, vivo.height); disegnaMano(g, m, scala); cambia();
  };
  vivo.addEventListener('pointerup', fine); vivo.addEventListener('pointercancel', fine);
  // Scribble di iPadOS: sulla tela i tocchi dello stilo non devono diventare testo né scorrere la pagina
  vivo.addEventListener('touchstart', e => { const t = e.touches[0] as any; if ((t && t.touchType === 'stylus') || (dito && !penna)) e.preventDefault(); }, { passive: false });
  vivo.addEventListener('touchmove', e => { const t = e.touches[0] as any; if ((t && t.touchType === 'stylus') || (dito && !penna)) e.preventDefault(); }, { passive: false });
  function cancellaVicino(p: number[]): void {
    const r = 14, prima = m.t.length;
    m.t = m.t.filter(s => !decodTratto(s).p.some(q => Math.abs(q[0] - p[0]) < r && Math.abs(q[1] - p[1]) < r));
    if (m.t.length !== prima) disegnaMano(g, m, scala);
  }
  // --- barra strumenti ---
  const barra = h('div.mano-barra');
  const COLORI = ['#1f2a44', '#1c7ed6', '#e03131', '#2f9e44', '#f59f00'];
  function aggiornaBarra(): void {
    svuota(barra);
    const b = (t: string, att: boolean, f: () => void, titolo: string) => h('button' + (att ? '.attivo' : ''), { title: titolo, 'aria-label': titolo, onclick: () => { f(); aggiornaBarra(); } }, t);
    barra.append(
      b('✒️', strumento === 'penna', () => strumento = 'penna', 'Penna'),
      b('🖍', strumento === 'evid', () => strumento = 'evid', 'Evidenziatore'),
      b('🧽', strumento === 'gomma', () => strumento = 'gomma', 'Gomma (tocca un tratto)'),
      h('span.mano-sep'),
      ...COLORI.map(c => h('button.mano-colore' + (c === colore ? '.attivo' : ''), { 'aria-label': 'Colore', style: { background: c }, onclick: () => { colore = c; if (strumento === 'gomma') strumento = 'penna'; aggiornaBarra(); } })),
      h('span.mano-sep'),
      b('↶', false, () => { if (storia.length) { futuro.push(m.t.slice()); m.t = storia.pop()!; disegnaMano(g, m, scala); cambia(); } }, 'Annulla'),
      b('↷', false, () => { if (futuro.length) { storia.push(m.t.slice()); m.t = futuro.pop()!; disegnaMano(g, m, scala); cambia(); } }, 'Ripeti'),
      b(m.sf === 'quadretti' ? '▦' : m.sf === 'righe' ? '☰' : '▢', false, () => { m.sf = m.sf === 'quadretti' ? 'righe' : m.sf === 'righe' ? 'bianco' : 'quadretti'; disegnaMano(g, m, scala); cambia(); }, 'Sfondo: quadretti / righe / bianco'),
      penna ? h('span.tenue.piccolo', null, '✏️ Pencil: il dito scorre') : b(dito ? '☝️ dito: scrive' : '☝️ dito: scorre', dito, () => { dito = !dito; foglio.classList.toggle('dito', dito); }, 'Scrivere anche con il dito'));
  }
  foglio.classList.toggle('dito', dito);
  aggiornaBarra();
  contenitore.append(barra, foglio);
  requestAnimationFrame(dimensiona);
  const ro = new ResizeObserver(() => { const w = foglio.clientWidth; if (w && Math.abs(w / LARG - scala) > .001) dimensiona(); }); ro.observe(foglio);
  return { dati: () => ({ t: m.t.slice(), h: Math.max(1400, m.h), sf: m.sf }), ridisegna: dimensiona };
}

/** ✨ Trascrive la pagina a mano: mostra il testo da controllare, poi lo aggiunge o sostituisce. */
async function leggiScrittura(m: Mano, dopo: (testo: string, modo: 'aggiungi' | 'sostituisci') => void): Promise<void> {
  if (manoVuota(m)) { avviso('Scrivi qualcosa sulla pagina prima.'); return; }
  avviso('✨ Leggo la tua scrittura…', 20000);
  let t = '';
  try {
    t = await Spiega.vede('Trascrivi FEDELMENTE il testo scritto a mano in questa pagina di appunti di studio (italiano; chimica, biologia o fisica). '
      + 'Regole: mantieni l\'ordine e gli a capo; titoli sottolineati o grandi → «# titolo»; elenchi → «- punto» (rientro per i sotto-punti); '
      + 'se c\'è una freccia o «::» tra domanda e risposta scrivi «domanda :: risposta»; parole racchiuse tra graffe {{…}} restano così; '
      + 'formule con simboli corretti (es. ΔH, H₂O, →); se una parola è illeggibile scrivi [?]. Non aggiungere nulla, non commentare: restituisci solo il testo in Markdown.', immagineMano(m, 1200));
  } catch (e: any) { avviso(String(e.message || e), 8000); return; }
  t = t.replace(/^```(markdown|md)?\s*|```\s*$/g, '').trim();
  if (!t) { avviso('Non sono riuscito a leggere la pagina.'); return; }
  const campo = h('textarea.appunto-testo', { style: { minHeight: '40vh' } }, t) as HTMLTextAreaElement;
  const fs = foglio({ titolo: '✨ Controlla la trascrizione', corpo: h('div.modulo', null,
    h('div.tenue.piccolo', null, 'Correggi dove serve ([?] = illeggibile). Le righe «domanda :: risposta» e i {{completamenti}} diventeranno flashcard.'), campo,
    h('div.bottoni', null,
      h('button.btn', { onclick: () => { fs.chiudi(); dopo(campo.value.trim(), 'aggiungi'); } }, 'Aggiungi al testo'),
      h('button.btn.neutro', { onclick: () => { fs.chiudi(); dopo(campo.value.trim(), 'sostituisci'); } }, 'Sostituisci il testo'))) });
}
