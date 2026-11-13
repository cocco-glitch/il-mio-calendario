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

interface Mano { t: string[]; h: number; sf: 'quadretti' | 'righe' | 'bianco' | 'cornell' | 'esercizio'; }
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
  if (m.sf === 'cornell' || m.sf === 'esercizio') {   // v0.33: modelli di pagina
    g.strokeStyle = 'rgba(120,130,160,.18)'; g.lineWidth = 1; g.beginPath();
    for (let y = 40 * scala; y < H; y += 40 * scala) { g.moveTo(0, y); g.lineTo(W, y); } g.stroke();
    g.strokeStyle = 'rgba(70,100,220,.45)'; g.lineWidth = 2; g.fillStyle = 'rgba(70,100,220,.75)'; g.font = Math.round(22 * scala) + 'px system-ui, sans-serif';
    if (m.sf === 'cornell') {
      const fondo = H - 260 * scala;
      g.beginPath(); g.moveTo(300 * scala, 0); g.lineTo(300 * scala, fondo); g.moveTo(0, fondo); g.lineTo(W, fondo); g.stroke();
      g.fillText('Spunti / domande', 14 * scala, 30 * scala); g.fillText('Appunti', 316 * scala, 30 * scala); g.fillText('Riassunto (con parole tue)', 14 * scala, fondo + 30 * scala);
    } else {
      const zone: [number, string][] = [[0, 'Testo / dati'], [0.22, 'Formule che servono'], [0.38, 'Svolgimento'], [0.82, 'Risultato · errore fatto · cosa ricordare']];
      g.beginPath(); for (const [f] of zone.slice(1)) { g.moveTo(0, H * f); g.lineTo(W, H * f); } g.stroke();
      for (const [f, t] of zone) g.fillText(t, 14 * scala, H * f + 30 * scala);
    }
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
function paginaMano(contenitore: HTMLElement, iniziale: Mano | undefined, cambia: () => void, sfondo?: Mano['sf'], allaCarta?: (riga: string) => void): { dati: () => Mano; ridisegna: () => void } {
  const m: Mano = iniziale ? { t: iniziale.t.slice(), h: iniziale.h, sf: iniziale.sf } : { t: [], h: 1400, sf: sfondo || 'quadretti' };
  const storia: string[][] = [], futuro: string[][] = [];
  let strumento: 'penna' | 'evid' | 'gomma' | 'lazo' = 'penna', colore = '#1f2a44', dito = !matchMedia('(pointer: fine), (hover: hover)').matches && !('ontouchstart' in window && navigator.maxTouchPoints > 1 && /iPad|Macintosh/.test(navigator.userAgent));
  let penna = false;   // diventa true alla prima Pencil vista: da lì il dito scorre soltanto
  const cv = h('canvas.mano-tela') as HTMLCanvasElement, g = cv.getContext('2d')!;
  const vivo = h('canvas.mano-vivo') as HTMLCanvasElement, gv = vivo.getContext('2d')!;
  // v0.35: il foglio si ingrandisce con due dita (come Note di iOS): la tela interna si allarga e si scorre
  const box = h('div.mano-box', null, cv, vivo);
  const pag = h('div.mano-foglio', null, box);
  let scala = 1, zoom = 1, dpr = Math.min(2, window.devicePixelRatio || 1);
  function dimensiona(): void {
    const w = (pag.clientWidth || 360) * zoom; scala = w / LARG;
    const hh = m.h * scala, d = Math.min(dpr, Math.sqrt(15e6 / Math.max(1, w * hh)));   // iOS: tele oltre ~16 Mpx diventano bianche
    box.style.width = w + 'px'; box.style.transform = '';
    for (const c of [cv, vivo]) { c.width = Math.round(w * d); c.height = Math.round(hh * d); c.style.width = w + 'px'; c.style.height = hh + 'px'; }
    g.setTransform(d, 0, 0, d, 0, 0); gv.setTransform(d, 0, 0, d, 0, 0);
    disegnaMano(g, m, scala);
    if (zoomEti) zoomEti.hidden = zoom === 1, zoomEti.textContent = Math.round(zoom * 100) + '%';
  }
  let zoomEti: HTMLElement | null = null;
  const scorritore = (): HTMLElement => { for (let e = pag.parentElement; e; e = e.parentElement) { const o = getComputedStyle(e).overflowY; if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight) return e; } return document.scrollingElement as HTMLElement; };
  function impostaZoom(z: number, cx?: number, cy?: number): void {
    z = Math.max(1, Math.min(4, z));
    const r = box.getBoundingClientRect(), pr = pag.getBoundingClientRect();
    const mx = cx != null ? cx : pr.left + pr.width / 2, my = cy != null ? cy : pr.top + Math.min(pr.height, innerHeight) / 2;
    const fx = (mx - r.left) / scala, fy = (my - r.top) / scala;   // punto del foglio sotto le dita
    zoom = z; dimensiona();
    pag.scrollLeft = fx * scala - (mx - pr.left);
    const r2 = box.getBoundingClientRect(); scorritore().scrollTop += (r2.top + fy * scala) - my;
  }
  // pizzico: anteprima con transform (fluida), poi ridisegno nitido al rilascio
  let pz: { d0: number; z0: number; cx: number; cy: number; ox: number; oy: number } | null = null;
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  pag.addEventListener('touchstart', e => {
    if (e.touches.length !== 2) return;
    if (cur) { cur = null; idPuntatore = -1; if (storia.length) m.t = storia.pop()!; gv.clearRect(0, 0, vivo.width, vivo.height); disegnaMano(g, m, scala); }
    const r = box.getBoundingClientRect(), cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    pz = { d0: dist(e.touches), z0: zoom, cx, cy, ox: cx - r.left, oy: cy - r.top };
    box.style.transformOrigin = pz.ox + 'px ' + pz.oy + 'px';
  }, { passive: true, capture: true });
  pag.addEventListener('touchmove', e => {
    if (!pz || e.touches.length !== 2) return;
    e.preventDefault();
    const z = Math.max(1, Math.min(4, pz.z0 * dist(e.touches) / pz.d0));
    box.style.transform = 'scale(' + (z / pz.z0) + ')';
  }, { passive: false, capture: true });
  const finePizzico = (e: TouchEvent) => {
    if (!pz || e.touches.length >= 2) return;
    const m0 = box.style.transform.match(/scale\(([\d.]+)\)/), k = m0 ? parseFloat(m0[1]) : 1, p0 = pz; pz = null;
    box.style.transform = '';
    if (Math.abs(k - 1) > .02) impostaZoom(p0.z0 * k, p0.cx, p0.cy);
  };
  pag.addEventListener('touchend', finePizzico, { capture: true }); pag.addEventListener('touchcancel', finePizzico, { capture: true });
  // su PC: ctrl/⌘ + rotella (o pizzico sul trackpad)
  pag.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); impostaZoom(zoom * Math.exp(-e.deltaY / 200), e.clientX, e.clientY); }, { passive: false });
  const salvaStoria = () => { storia.push(m.t.slice()); if (storia.length > 60) storia.shift(); futuro.length = 0; };
  // --- v0.33: lazo (seleziona, sposta, elimina, trasforma in carta) ---
  let sel: Set<number> = new Set(), poligono: number[][] | null = null, trascina: number[] | null = null, spost = [0, 0];
  const dentro = (p: number[], poly: number[][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  function riquadro(): number[] | null {
    if (!sel.size) return null; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    sel.forEach(i => decodTratto(m.t[i]).p.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }));
    return [x0 - 10, y0 - 10, x1 + 10, y1 + 10];
  }
  function disegnaSel(): void {
    gv.clearRect(0, 0, vivo.width, vivo.height);
    if (poligono && poligono.length > 1) { gv.setLineDash([6, 6]); gv.strokeStyle = '#4c6ef5'; gv.lineWidth = 1.5; gv.beginPath(); poligono.forEach((q, i) => i ? gv.lineTo(q[0] * scala, q[1] * scala) : gv.moveTo(q[0] * scala, q[1] * scala)); gv.stroke(); gv.setLineDash([]); }
    const r = riquadro(); if (!r) return;
    if (spost[0] || spost[1]) { sel.forEach(i => { const t = decodTratto(m.t[i]); tracciaTratto(gv, { ...t, p: t.p.map(q => [q[0] + spost[0], q[1] + spost[1], q[2]]) }, scala); }); }
    gv.setLineDash([5, 4]); gv.strokeStyle = '#4c6ef5'; gv.lineWidth = 1.5; gv.strokeRect((r[0] + spost[0]) * scala, (r[1] + spost[1]) * scala, (r[2] - r[0]) * scala, (r[3] - r[1]) * scala); gv.setLineDash([]);
  }
  function sposta(dx: number, dy: number): void {
    if (!dx && !dy) return; salvaStoria();
    sel.forEach(i => { const t = decodTratto(m.t[i]); m.t[i] = codTratto(t.c, t.w, t.k, t.p.map(q => [q[0] + dx, q[1] + dy, q[2]])); });
    disegnaMano(g, m, scala); cambia();
  }
  function annullaSel(): void { sel = new Set(); poligono = null; spost = [0, 0]; disegnaSel(); aggiornaAzioni(); }
  const azioni = h('div.mano-azioni');
  function aggiornaAzioni(): void {
    svuota(azioni); azioni.hidden = !sel.size; if (!sel.size) return;
    azioni.append(h('span.tenue.piccolo', null, sel.size + (sel.size === 1 ? ' tratto' : ' tratti') + ' · trascina per spostare'),
      h('button.btn-testo', { onclick: () => { salvaStoria(); m.t = m.t.filter((_s, i) => !sel.has(i)); disegnaMano(g, m, scala); cambia(); annullaSel(); } }, '🗑 Elimina'),
      ...(allaCarta ? [h('button.btn-testo', { onclick: () => cartaDaSelezione() }, '🃏 Diventa flashcard')] : []),
      h('button.btn-testo', { onclick: annullaSel }, 'Fine'));
  }
  async function cartaDaSelezione(): Promise<void> {
    const r = riquadro()!, parte: Mano = { t: Array.from(sel).map(i => { const t = decodTratto(m.t[i]); return codTratto(t.c, t.w, t.k, t.p.map(q => [q[0] - r[0] + 20, q[1] - r[1] + 20, q[2]])); }), h: r[3] - r[1] + 40, sf: 'bianco' };
    avviso('✨ Leggo la selezione…', 15000);
    let t = '';
    try { t = await Spiega.vede('Trascrivi fedelmente il testo scritto a mano (italiano, chimica/biologia/fisica). Restituisci solo il testo, su una riga; formule con simboli corretti.', immagineMano(parte, 800)); }
    catch (e: any) { avviso(String(e.message || e), 8000); return; }
    t = t.replace(/^```\w*\s*|```$/g, '').replace(/\s+/g, ' ').trim();
    const f = h('input.campo', { value: t.includes('::') ? t.split('::')[0].trim() : t }) as HTMLInputElement, rr = h('input.campo', { value: t.includes('::') ? t.split('::').slice(1).join('::').trim() : '', placeholder: 'Risposta (o lascia vuoto e usa {{…}} nella domanda)' }) as HTMLInputElement;
    foglio({ titolo: '🃏 Flashcard dalla selezione', etichettaSalva: 'Crea', corpo: h('div.modulo', null, h('div.tenue.piccolo', null, 'Controlla la trascrizione: diventa una riga «domanda :: risposta» nel testo dell\'appunto.'), f, rr),
      salva: () => { if (!f.value.trim()) return false; allaCarta!('- ' + f.value.trim() + (rr.value.trim() ? ' :: ' + rr.value.trim() : '')); annullaSel(); } });
  }
  // --- v0.33: scarabocchio per cancellare (come GoodNotes): zig-zag rapido sopra dei tratti ---
  function eScarabocchio(p: number[][]): boolean {
    if (p.length < 12) return false;
    let inv = 0, dir = 0, lung = 0;
    for (let i = 1; i < p.length; i++) { const dx = p[i][0] - p[i - 1][0]; lung += Math.hypot(dx, p[i][1] - p[i - 1][1]); const d = Math.sign(dx); if (d && dir && d !== dir) inv++; if (d) dir = d; }
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]), w = Math.max(...xs) - Math.min(...xs), hh = Math.max(...ys) - Math.min(...ys);
    return inv >= 6 && lung > 3 * Math.max(w, 40) && hh < 140;
  }
  function cancellaSotto(p: number[][]): boolean {
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]), r = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const prima = m.t.length;
    m.t = m.t.filter(s => decodTratto(s).p.filter(q => q[0] >= r[0] && q[0] <= r[2] && q[1] >= r[1] && q[1] <= r[3]).length < 2);
    return m.t.length !== prima;
  }
  // --- input ---
  let cur: number[][] | null = null, idPuntatore = -1;
  const punto = (e: PointerEvent): number[] => { const r = vivo.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / scala), Math.round((e.clientY - r.top) / scala), Math.round((e.pointerType === 'pen' ? (e.pressure || .5) : .5) * 100)]; };
  const scrive = (e: PointerEvent) => e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && dito && !penna);
  vivo.addEventListener('pointerdown', e => {
    if (e.pointerType === 'pen' && !penna) { penna = true; aggiornaBarra(); }
    if (!scrive(e) || cur || pz) return;
    e.preventDefault(); try { vivo.setPointerCapture(e.pointerId); } catch (_) { /* puntatore sintetico */ } idPuntatore = e.pointerId;
    if (strumento === 'lazo') {
      idPuntatore = e.pointerId; try { vivo.setPointerCapture(e.pointerId); } catch (_) { /* sintetico */ } e.preventDefault();
      const p = punto(e), r = riquadro();
      if (r && p[0] >= r[0] && p[0] <= r[2] && p[1] >= r[1] && p[1] <= r[3]) { trascina = p; spost = [0, 0]; cur = [p]; return; }
      sel = new Set(); aggiornaAzioni(); poligono = [p]; cur = [p]; return;
    }
    salvaStoria(); cur = [punto(e)];
    if (strumento === 'gomma') cancellaVicino(cur[0]);
  });
  vivo.addEventListener('pointermove', e => {
    if (!cur || e.pointerId !== idPuntatore) return; e.preventDefault();
    const evs = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const p = punto(ev), u = cur[cur.length - 1];
      if (strumento === 'lazo') { if (trascina) spost = [p[0] - trascina[0], p[1] - trascina[1]]; else if (poligono) poligono.push(p); disegnaSel(); continue; }
      if (Math.abs(p[0] - u[0]) + Math.abs(p[1] - u[1]) < 2) continue;
      if (strumento === 'gomma') { cancellaVicino(p); cur.push(p); continue; }
      cur.push(p);
      gv.lineCap = 'round'; tracciaTratto(gv, { c: colore, w: strumento === 'evid' ? 22 : 3, k: strumento === 'evid' ? 'e' : 'p', p: [u, p] }, scala);
    }
    if (cur[cur.length - 1][1] > m.h - 150) { m.h += 500; dimensiona(); }   // la pagina si allunga
  });
  const fine = (e: PointerEvent) => {
    if (!cur || e.pointerId !== idPuntatore) return;
    if (strumento === 'lazo') {
      if (trascina) { sposta(spost[0], spost[1]); spost = [0, 0]; trascina = null; }
      else if (poligono && poligono.length > 3) { const poly = poligono; m.t.forEach((s, i) => { const pts = decodTratto(s).p; if (pts.filter(q => dentro(q, poly)).length > pts.length / 2) sel.add(i); }); }
      poligono = null; cur = null; idPuntatore = -1; disegnaSel(); aggiornaAzioni(); return;
    }
    if (strumento === 'penna' && eScarabocchio(cur) && cancellaSotto(cur)) { cur = null; idPuntatore = -1; gv.clearRect(0, 0, vivo.width, vivo.height); disegnaMano(g, m, scala); cambia(); avviso('Cancellato con lo scarabocchio', 1500); return; }
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
      b('✒️', strumento === 'penna', () => { strumento = 'penna'; annullaSel(); }, 'Penna (scarabocchia sopra un tratto per cancellarlo)'),
      b('🖍', strumento === 'evid', () => strumento = 'evid', 'Evidenziatore'),
      b('🧽', strumento === 'gomma', () => strumento = 'gomma', 'Gomma (tocca un tratto)'),
      b('➰', strumento === 'lazo', () => { strumento = 'lazo'; }, 'Lazo: cerchia per selezionare, poi sposta, elimina o crea una flashcard'),
      h('span.mano-sep'),
      ...COLORI.map(c => h('button.mano-colore' + (c === colore ? '.attivo' : ''), { 'aria-label': 'Colore', style: { background: c }, onclick: () => { colore = c; if (strumento === 'gomma') strumento = 'penna'; aggiornaBarra(); } })),
      h('span.mano-sep'),
      b('↶', false, () => { if (storia.length) { futuro.push(m.t.slice()); m.t = storia.pop()!; disegnaMano(g, m, scala); cambia(); } }, 'Annulla'),
      b('↷', false, () => { if (futuro.length) { storia.push(m.t.slice()); m.t = futuro.pop()!; disegnaMano(g, m, scala); cambia(); } }, 'Ripeti'),
      b(({ quadretti: '▦', righe: '☰', bianco: '▢', cornell: '◧', esercizio: '▤' } as any)[m.sf], false, () => { const o: Mano['sf'][] = ['quadretti', 'righe', 'bianco', 'cornell', 'esercizio']; m.sf = o[(o.indexOf(m.sf) + 1) % o.length]; disegnaMano(g, m, scala); cambia(); }, 'Sfondo: quadretti / righe / bianco / Cornell / esercizio'),
      (zoomEti = h('button.mano-zoom', { title: 'Torna al 100%', 'aria-label': 'Torna al 100%', hidden: zoom === 1, onclick: () => impostaZoom(1) }, Math.round(zoom * 100) + '%')),
      penna ? h('span.tenue.piccolo', null, '✏️ Pencil: il dito scorre') : b(dito ? '☝️ dito: scrive' : '☝️ dito: scorre', dito, () => { dito = !dito; pag.classList.toggle('dito', dito); }, 'Scrivere anche con il dito'));
  }
  pag.classList.toggle('dito', dito);
  aggiornaBarra();
  azioni.hidden = true;
  contenitore.append(azioni, pag, barra);   // v0.35: barra fluttuante in basso, sempre visibile mentre scorri i fogli
  requestAnimationFrame(dimensiona);
  const ro = new ResizeObserver(() => { const w = pag.clientWidth * zoom; if (w && Math.abs(w / LARG - scala) > .001) dimensiona(); }); ro.observe(pag);
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
