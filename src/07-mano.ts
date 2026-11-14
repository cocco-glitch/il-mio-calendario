// 07-mano.ts — Scrittura a mano negli appunti (v0.31; v0.39 penne, forme, stabilizzazione: scouting Freenotes/GoodNotes/Notability).
//
// Scouting 13/11: GoodNotes / Notability (pagine a quadretti o righe, penna sensibile alla pressione,
// evidenziatore, gomma, scrittura → testo → quiz e flashcard con l'AI); web: Pointer Events danno
// pressione e inclinazione della Pencil su Safari iPad; Scribble di iPadOS può «mangiare» tratti sulle
// tele → blocchiamo i touch dello stilo sulla pagina; riconoscimento: modello visivo di Groq (Llama 4 Scout),
// gratuito con la stessa chiave, SOLO quando premi ✨, e il testo si controlla prima di usarlo.
//
// Dati: Appunto.mano = { t: tratti, h: altezza, sf: sfondo }. Coordinate su una larghezza logica di 1000.
// Tratto compatto: "colore|spessore|tipo|x,y,p x,y,p …" (tipo: p = penna, e = evidenziatore).

interface Mano { t: string[]; h: number; sf: 'quadretti' | 'righe' | 'puntini' | 'bianco' | 'cornell' | 'esercizio'; im?: ImgMano[]; }
const LARG = 1000;

// v0.39 tipi: p = stilografica (pressione), b = biro, m = matita, t = tratteggio, e = evidenziatore; 5° campo facoltativo = riempimento.
type Tratto = { c: string; w: number; k: string; p: number[][]; f?: string };
function decodTratto(s: string): Tratto {
  const [c, w, k, pts, f] = s.split('|');
  return { c, w: +w, k, p: (pts || '').split(' ').filter(Boolean).map(x => x.split(',').map(Number)), ...(f ? { f } : {}) };
}
function codTratto(c: string, w: number, k: string, p: number[][], f?: string): string { return c + '|' + w + '|' + k + '|' + p.map(q => q.join(',')).join(' ') + (f ? '|' + f : ''); }

// ---------- v0.39: riconoscimento forme (disegna e tieni premuto, o forma automatica) ----------
const lungTratto = (p: number[][]) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; };
function rdp(p: number[][], eps: number): number[][] {
  if (p.length < 3) return p.slice();
  const a = p[0], b = p[p.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let mx = 0, ix = 0;
  for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((b[1] - a[1]) * p[i][0] - (b[0] - a[0]) * p[i][1] + b[0] * a[1] - b[1] * a[0]) / L; if (d > mx) { mx = d; ix = i; } }
  if (mx <= eps) return [a, b];
  return rdp(p.slice(0, ix + 1), eps).slice(0, -1).concat(rdp(p.slice(ix), eps));
}
function ellissePunti(cx: number, cy: number, rx: number, ry: number): number[][] { const o: number[][] = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; o.push([Math.round((cx + rx * Math.cos(a)) * 10) / 10, Math.round((cy + ry * Math.sin(a)) * 10) / 10, 50]); } return o; }
function frecciaPunti(a: number[], b: number[]): number[][] {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), l = Math.min(28, Math.hypot(b[0] - a[0], b[1] - a[1]) / 3);
  const t = (d: number) => [b[0] - l * Math.cos(ang + d), b[1] - l * Math.sin(ang + d), 50];
  return [[a[0], a[1], 50], [b[0], b[1], 50], t(.45), [b[0], b[1], 50], t(-.45)];
}
type FormaK = 'linea' | 'freccia' | 'rett' | 'ellisse' | 'triangolo';
function formaDa(k: FormaK, a: number[], b: number[]): number[][] {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  if (k === 'linea') return [[a[0], a[1], 50], [b[0], b[1], 50]];
  if (k === 'freccia') return frecciaPunti(a, b);
  if (k === 'rett') return [[x0, y0, 50], [x1, y0, 50], [x1, y1, 50], [x0, y1, 50], [x0, y0, 50]];
  if (k === 'triangolo') return [[(x0 + x1) / 2, y0, 50], [x1, y1, 50], [x0, y1, 50], [(x0 + x1) / 2, y0, 50]];
  return ellissePunti((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2);
}
/** Riconosce una forma pulita dal tratto (null = nessuna forma chiara). */
function riconosciForma(p: number[][]): { pts: number[][]; chiusa: boolean; nome: string } | null {
  if (p.length < 4) return null;
  const L = lungTratto(p), a = p[0], b = p[p.length - 1], D = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const diag = Math.hypot(x1 - x0, y1 - y0) || 1;
  if (L < 12) return null;
  if (D / L > .9) {
    // linea: si aggancia a orizzontale / verticale se quasi tale
    let e = [b[0], b[1]]; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, m = ((ang % 90) + 90) % 90;
    if (m < 6 || m > 84) { if (Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1])) e = [b[0], a[1]]; else e = [a[0], b[1]]; }
    return { pts: [[a[0], a[1], 50], [e[0], e[1], 50]], chiusa: false, nome: 'linea' };
  }
  // freccia disegnata in un tratto: linea lunga + piccola punta finale
  const s = rdp(p, diag * .06);
  if (D > diag * .35 && s.length >= 4 && s.length <= 5) {
    const l1 = Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]);
    if (l1 > L * .55) return { pts: frecciaPunti(s[0], s[1]), chiusa: false, nome: 'freccia' };
  }
  if (D > diag * .25) return null;   // aperta e non dritta: resta a mano libera
  const v = rdp(p, diag * .09); let n = v.length - 1;
  if (Math.hypot(v[0][0] - v[n][0], v[0][1] - v[n][1]) > diag * .25) n++;
  if (n === 3) { const t = v.slice(0, 3).map(q => [q[0], q[1], 50]); return { pts: [...t, t[0]], chiusa: true, nome: 'triangolo' }; }
  if (n === 4) return { pts: formaDa('rett', [x0, y0], [x1, y1]), chiusa: true, nome: 'rettangolo' };
  // ellisse / cerchio: distanza dal centro quasi costante
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; let rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  const err = p.reduce((s2, q) => s2 + Math.abs(Math.hypot((q[0] - cx) / (rx || 1), (q[1] - cy) / (ry || 1)) - 1), 0) / p.length;
  if (err > .28) return null;
  if (Math.abs(rx - ry) / Math.max(rx, ry) < .15) rx = ry = (rx + ry) / 2;
  return { pts: ellissePunti(cx, cy, rx, ry), chiusa: true, nome: rx === ry ? 'cerchio' : 'ellisse' };
}
// v0.39: appunti a mano copiati col lazo (anche tra un appunto e l'altro)
let APPUNTI_MANO: { t: string[]; im: ImgMano[] } | null = null;
const PREF_MANO = (() => { const d = { tipo: 'p', w: 1, stab: 4, auto: false, tieni: true, gomma: 'tratto', forma: 'rett' as FormaK, riempi: false, extra: [] as string[] }; try { return { ...d, ...JSON.parse(localStorage.getItem('pref-mano') || '{}') }; } catch (_) { return d; } })();
const salvaPrefMano = () => { try { localStorage.setItem('pref-mano', JSON.stringify(PREF_MANO)); } catch (_) { /* privato */ } };

interface ImgMano { s: string; x: number; y: number; w: number; h: number; }
/** Vista di disegno: la tela copre solo la parte visibile del foglio (ox, oy = scorrimento in pixel). */
interface VistaMano { ox: number; oy: number; w: number; h: number; passo: number; }
const CACHE_IMG = new Map<string, HTMLImageElement>();
function imgPronta(s: string, poi?: () => void): HTMLImageElement | null {
  let i = CACHE_IMG.get(s);
  if (!i) { i = new Image(); i.src = s; CACHE_IMG.set(s, i); }
  if (i.complete && i.naturalWidth) return i;
  if (poi) i.addEventListener('load', poi, { once: true });
  return null;
}
function caricaImmaginiMano(m: Mano): Promise<void> {
  return Promise.all((m.im || []).map(x => new Promise<void>(r => { if (imgPronta(x.s, () => r())) r(); else setTimeout(r, 4000); }))).then(() => undefined);
}

/** Disegna sfondo + allegati + tratti. Con «v» disegna solo la finestra visibile e tiene righe e quadretti di misura fissa sullo schermo. */
function disegnaMano(g: CanvasRenderingContext2D, m: Mano, scala: number, sfondoPieno = false, v?: VistaMano, poi?: () => void): void {
  const W = LARG * scala, H = m.h * scala;
  const ox = v ? v.ox : 0, oy = v ? v.oy : 0, vw = v ? v.w : W, vh = v ? v.h : H;
  g.clearRect(0, 0, vw, vh);
  if (sfondoPieno) { g.fillStyle = '#fff'; g.fillRect(0, 0, vw, vh); }
  if (m.sf === 'puntini' && !sfondoPieno) {
    const passo = v ? v.passo : 25 * scala, fondo = Math.min(vh, H - oy), destra = Math.min(vw, W - ox);
    g.fillStyle = 'rgba(120,130,160,.45)';
    for (let y = passo - (oy % passo); y < fondo; y += passo) for (let x = passo - (ox % passo); x < destra; x += passo) g.fillRect(x - 1, y - 1, 2, 2);
  } else if (m.sf !== 'bianco' && !sfondoPieno) {
    g.strokeStyle = 'rgba(120,130,160,.22)'; g.lineWidth = 1;
    const passo = v ? v.passo * (m.sf === 'quadretti' ? 1 : 1.6) : (m.sf === 'quadretti' ? 25 : 40) * scala;
    const fondo = Math.min(vh, H - oy), destra = Math.min(vw, W - ox);
    g.beginPath();
    for (let y = passo - (oy % passo); y < fondo; y += passo) { g.moveTo(0, y); g.lineTo(destra, y); }
    if (m.sf === 'quadretti') for (let x = passo - (ox % passo); x < destra; x += passo) { g.moveTo(x, 0); g.lineTo(x, fondo); }
    g.stroke();
  }
  g.save(); g.translate(-ox, -oy);
  if (m.sf === 'cornell' || m.sf === 'esercizio') {   // v0.33: modelli di pagina (le zone seguono il foglio)
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
  // v0.36: allegati (pagine PDF, slide, foto) sotto l'inchiostro
  for (const im of m.im || []) {
    if ((im.y + im.h) * scala < oy || im.y * scala > oy + vh) continue;
    const img = imgPronta(im.s, poi);
    if (img) g.drawImage(img, im.x * scala, im.y * scala, im.w * scala, im.h * scala);
    else { g.fillStyle = 'rgba(120,130,160,.12)'; g.fillRect(im.x * scala, im.y * scala, im.w * scala, im.h * scala); }
    g.strokeStyle = 'rgba(120,130,160,.35)'; g.lineWidth = 1; g.strokeRect(im.x * scala, im.y * scala, im.w * scala, im.h * scala);
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  const y0 = oy / scala - 40, y1 = (oy + vh) / scala + 40;
  for (const s of m.t) {
    const t = decodTratto(s);
    if (v && !t.p.some(q => q[1] >= y0 && q[1] <= y1)) continue;   // fuori dalla finestra
    tracciaTratto(g, t, scala);
  }
  g.restore();
}
function tracciaTratto(g: CanvasRenderingContext2D, t: Tratto, scala: number): void {
  if (!t.p.length) return;
  if (t.f && t.p.length > 2) { g.globalAlpha = .28; g.fillStyle = t.f; g.beginPath(); t.p.forEach((q, i) => i ? g.lineTo(q[0] * scala, q[1] * scala) : g.moveTo(q[0] * scala, q[1] * scala)); g.closePath(); g.fill(); }
  g.globalAlpha = t.k === 'e' ? .32 : t.k === 'm' ? .62 : 1; g.strokeStyle = t.c;
  if (t.k !== 'p' && t.p.length > 1) {   // tratto a spessore costante: un solo percorso (più veloce, tratteggio continuo)
    g.lineWidth = Math.max(.6, t.w * scala * (t.k === 'm' ? .8 : t.k === 'e' ? 1 : .95));
    if (t.k === 't') g.setLineDash([t.w * scala * 2.5, t.w * scala * 2.2]);
    g.beginPath(); t.p.forEach((q, i) => i ? g.lineTo(q[0] * scala, q[1] * scala) : g.moveTo(q[0] * scala, q[1] * scala)); g.stroke();
    g.setLineDash([]); g.globalAlpha = 1; return;
  }
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
const manoVuota = (m?: Mano) => !m || (!m.t.length && !(m.im && m.im.length));

/** Editor a mano dentro un elemento (v0.36: tela «a finestra», zoom fino a 10×, righe di misura fissa, allegati). */
interface OpzioniMano { allaCarta?: (riga: string) => void; extra?: () => (HTMLElement | null)[]; }
function paginaMano(contenitore: HTMLElement, iniziale: Mano | undefined, cambia: () => void, sfondo?: Mano['sf'], opz: OpzioniMano | ((riga: string) => void) = {}): { dati: () => Mano; ridisegna: () => void; inserisci: (l: { s: string; w: number; h: number }[]) => void; barra: HTMLElement; aggiornaBarra: () => void } {
  const o: OpzioniMano = typeof opz === 'function' ? { allaCarta: opz } : opz;
  const allaCarta = o.allaCarta;
  const m: Mano = iniziale ? { t: iniziale.t.slice(), h: iniziale.h, sf: iniziale.sf, im: (iniziale.im || []).slice() } : { t: [], h: 1400, sf: sfondo || 'quadretti', im: [] };
  type Foto = { t: string[]; im: ImgMano[] };
  const storia: Foto[] = [], futuro: Foto[] = [];
  const foto = (): Foto => ({ t: m.t.slice(), im: (m.im || []).slice() });
  const ripristina = (f: Foto) => { m.t = f.t; m.im = f.im; };
  let strumento: 'penna' | 'evid' | 'gomma' | 'lazo' | 'forma' = 'penna', colore = '#1f2a44', dito = !matchMedia('(pointer: fine), (hover: hover)').matches && !('ontouchstart' in window && navigator.maxTouchPoints > 1 && /iPad|Macintosh/.test(navigator.userAgent));
  let penna = false;   // diventa true alla prima Pencil vista: da lì il dito scorre soltanto
  const cv = h('canvas.mano-tela') as HTMLCanvasElement, g = cv.getContext('2d')!;
  const vivo = h('canvas.mano-vivo') as HTMLCanvasElement, gv = vivo.getContext('2d')!;
  // la tela è grande quanto la parte visibile (vista «sticky»): nitida a qualunque ingrandimento
  const vista = h('div.mano-vista', null, cv, vivo);
  const box = h('div.mano-box', null, vista);
  const pag = h('div.mano-foglio', null, box);
  let base = 1, scala = 1, zoom = 1, vw = 360, vh = 400, d = Math.min(2, window.devicePixelRatio || 1);
  const ZMAX = 10;
  function dimensiona(): void {
    const pw = pag.clientWidth || 360; base = pw / LARG; scala = base * zoom;
    box.style.width = LARG * scala + 'px'; box.style.height = m.h * scala + 'px';
    vw = pw; vh = Math.min(pag.clientHeight || 400, m.h * scala);
    vista.style.width = vw + 'px'; vista.style.height = vh + 'px';
    for (const c of [cv, vivo]) { c.width = Math.round(vw * d); c.height = Math.round(vh * d); c.style.width = vw + 'px'; c.style.height = vh + 'px'; }
    if (zoomEti) { zoomEti.hidden = zoom === 1; zoomEti.textContent = Math.round(zoom * 100) + '%'; }
    ridisegna();
  }
  let rif = 0;
  function ridisegna(): void {
    rif = 0;
    g.setTransform(d, 0, 0, d, 0, 0);
    disegnaMano(g, m, scala, false, { ox: pag.scrollLeft, oy: pag.scrollTop, w: vw, h: vh, passo: 25 * base }, () => { if (!rif) rif = requestAnimationFrame(ridisegna); });
    disegnaSel();
  }
  pag.addEventListener('scroll', () => { if (!rif) rif = requestAnimationFrame(ridisegna); }, { passive: true });
  const pulisciVivo = () => { gv.setTransform(1, 0, 0, 1, 0, 0); gv.clearRect(0, 0, vivo.width, vivo.height); gv.setTransform(d, 0, 0, d, -pag.scrollLeft * d, -pag.scrollTop * d); };
  let zoomEti: HTMLElement | null = null;
  function impostaZoom(z: number, cx?: number, cy?: number): void {
    z = Math.max(1, Math.min(ZMAX, z));
    const pr = pag.getBoundingClientRect();
    const mx = (cx != null ? cx : pr.left + pr.width / 2) - pr.left, my = (cy != null ? cy : pr.top + pr.height / 2) - pr.top;
    const fx = (mx + pag.scrollLeft) / scala, fy = (my + pag.scrollTop) / scala;   // punto del foglio sotto le dita
    zoom = z; dimensiona();
    pag.scrollLeft = fx * scala - mx; pag.scrollTop = fy * scala - my;
    ridisegna(); aggiornaBarra();
  }
  // pizzico: anteprima con transform (fluida), poi ridisegno nitido al rilascio
  let pz: { d0: number; z0: number; cx: number; cy: number } | null = null, kz = 1;
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  let gesto: { n: number; t: number } | null = null;
  pag.addEventListener('touchstart', e => { if (e.touches.length >= 2) gesto = { n: Math.max(gesto && Date.now() - gesto.t < 300 ? gesto.n : 0, e.touches.length), t: gesto && Date.now() - gesto.t < 300 ? gesto.t : Date.now() }; }, { passive: true, capture: true });
  pag.addEventListener('touchend', e => {
    if (!gesto || e.touches.length) return; const g0 = gesto; gesto = null;
    if (Date.now() - g0.t > 280 || Math.abs(kz - 1) > .03) return;
    if (g0.n === 2 && storia.length) { futuro.push(foto()); ripristina(storia.pop()!); ridisegna(); cambia(); avviso('↶ Annullato', 900); }
    else if (g0.n === 3 && futuro.length) { storia.push(foto()); ripristina(futuro.pop()!); ridisegna(); cambia(); avviso('↷ Ripetuto', 900); }
  }, { capture: true });
  pag.addEventListener('touchstart', e => {
    if (e.touches.length !== 2) return;
    if (cur) { cur = null; idPuntatore = -1; if (storia.length) ripristina(storia.pop()!); pulisciVivo(); ridisegna(); }
    const r = vista.getBoundingClientRect(), cx = (e.touches[0].clientX + e.touches[1].clientX) / 2, cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    pz = { d0: dist(e.touches), z0: zoom, cx, cy }; kz = 1;
    vista.style.transformOrigin = (cx - r.left) + 'px ' + (cy - r.top) + 'px';
  }, { passive: true, capture: true });
  pag.addEventListener('touchmove', e => {
    if (!pz || e.touches.length !== 2) return;
    e.preventDefault();
    const z = Math.max(1, Math.min(ZMAX, pz.z0 * dist(e.touches) / pz.d0)); kz = z / pz.z0;
    vista.style.transform = 'scale(' + kz + ')';
  }, { passive: false, capture: true });
  const finePizzico = (e: TouchEvent) => {
    if (!pz || e.touches.length >= 2) return;
    const p0 = pz; pz = null; vista.style.transform = '';
    if (Math.abs(kz - 1) > .02) impostaZoom(p0.z0 * kz, p0.cx, p0.cy);
  };
  pag.addEventListener('touchend', finePizzico, { capture: true }); pag.addEventListener('touchcancel', finePizzico, { capture: true });
  // su PC: ctrl/⌘ + rotella (o pizzico sul trackpad)
  pag.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); impostaZoom(zoom * Math.exp(-e.deltaY / 200), e.clientX, e.clientY); }, { passive: false });
  const salvaStoria = () => { storia.push(foto()); if (storia.length > 60) storia.shift(); futuro.length = 0; };
  // --- lazo (seleziona tratti e allegati, sposta, elimina, trasforma in carta) ---
  let sel: Set<number> = new Set(), selIm: Set<number> = new Set(), poligono: number[][] | null = null, trascina: number[] | null = null, spost = [0, 0];
  const dentro = (p: number[], poly: number[][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  function riquadro(): number[] | null {
    if (!sel.size && !selIm.size) return null; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    sel.forEach(i => decodTratto(m.t[i]).p.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }));
    selIm.forEach(i => { const a = m.im![i]; x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x + a.w); y1 = Math.max(y1, a.y + a.h); });
    return [x0 - 10, y0 - 10, x1 + 10, y1 + 10];
  }
  function disegnaSel(): void {
    pulisciVivo();
    if (poligono && poligono.length > 1) { gv.setLineDash([6, 6]); gv.strokeStyle = '#4c6ef5'; gv.lineWidth = 1.5; gv.beginPath(); poligono.forEach((q, i) => i ? gv.lineTo(q[0] * scala, q[1] * scala) : gv.moveTo(q[0] * scala, q[1] * scala)); gv.stroke(); gv.setLineDash([]); }
    const r = riquadro(); if (!r) return;
    if (spost[0] || spost[1]) { sel.forEach(i => { const t = decodTratto(m.t[i]); tracciaTratto(gv, { ...t, p: t.p.map(q => [q[0] + spost[0], q[1] + spost[1], q[2]]) }, scala); }); }
    gv.setLineDash([5, 4]); gv.strokeStyle = '#4c6ef5'; gv.lineWidth = 1.5; gv.strokeRect((r[0] + spost[0]) * scala, (r[1] + spost[1]) * scala, (r[2] - r[0]) * scala, (r[3] - r[1]) * scala); gv.setLineDash([]);
  }
  function sposta(dx: number, dy: number): void {
    if (!dx && !dy) return; salvaStoria();
    sel.forEach(i => { const t = decodTratto(m.t[i]); m.t[i] = codTratto(t.c, t.w, t.k, t.p.map(q => [q[0] + dx, q[1] + dy, q[2]])); });
    selIm.forEach(i => { const a = m.im![i]; m.im![i] = { ...a, x: a.x + dx, y: a.y + dy }; });
    ridisegna(); cambia();
  }
  function annullaSel(): void { sel = new Set(); selIm = new Set(); poligono = null; spost = [0, 0]; disegnaSel(); aggiornaAzioni(); }
  const azioni = h('div.mano-azioni');
  function aggiornaAzioni(): void {
    svuota(azioni); const n = sel.size + selIm.size; azioni.hidden = !n; if (!n) return;
    azioni.append(h('span.tenue.piccolo', null, (sel.size ? sel.size + (sel.size === 1 ? ' tratto' : ' tratti') : '') + (sel.size && selIm.size ? ' + ' : '') + (selIm.size ? selIm.size + (selIm.size === 1 ? ' allegato' : ' allegati') : '') + ' · trascina per spostare'),
      h('button.btn-testo', { onclick: () => { salvaStoria(); m.t = m.t.filter((_s, i) => !sel.has(i)); m.im = (m.im || []).filter((_s, i) => !selIm.has(i)); ridisegna(); cambia(); annullaSel(); } }, '🗑 Elimina'),
      h('button.btn-testo', { onclick: () => { APPUNTI_MANO = { t: Array.from(sel).map(i => m.t[i]), im: Array.from(selIm).map(i => m.im![i]) }; avviso('Copiato: incollalo con 📋 anche in un altro appunto', 2000); aggiornaBarra(); } }, '📄 Copia'),
      h('button.btn-testo', { onclick: () => { salvaStoria(); const nt = Array.from(sel).map(i => { const t = decodTratto(m.t[i]); return codTratto(t.c, t.w, t.k, t.p.map(q => [q[0] + 24, q[1] + 24, q[2]]), t.f); }); const ni = Array.from(selIm).map(i => ({ ...m.im![i], x: m.im![i].x + 24, y: m.im![i].y + 24 }));
        const a = m.t.length, b = (m.im || []).length; m.t.push(...nt); m.im = (m.im || []).concat(ni); sel = new Set(nt.map((_x, k) => a + k)); selIm = new Set(ni.map((_x, k) => b + k)); ridisegna(); cambia(); aggiornaAzioni(); } }, '⧉ Duplica'),
      ...(sel.size ? COLORI.concat(PREF_MANO.extra).map(c => h('button.mano-colore.piccolo', { 'aria-label': 'Ricolora', style: { background: c, width: '22px', height: '22px', minWidth: '22px', borderRadius: '50%' }, onclick: () => { salvaStoria(); sel.forEach(i => { const t = decodTratto(m.t[i]); m.t[i] = codTratto(c, t.w, t.k, t.p, t.f ? c : undefined); }); ridisegna(); cambia(); } })) : []),
      ...(allaCarta && sel.size ? [h('button.btn-testo', { onclick: () => cartaDaSelezione() }, '🃏 Diventa flashcard')] : []),
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
  // --- scarabocchio per cancellare (come GoodNotes): zig-zag rapido sopra dei tratti ---
  function eScarabocchio(p: number[][]): boolean {
    if (p.length < 12) return false;
    let inv = 0, dir = 0, lung = 0;
    for (let i = 1; i < p.length; i++) { const dx = p[i][0] - p[i - 1][0]; lung += Math.hypot(dx, p[i][1] - p[i - 1][1]); const dd = Math.sign(dx); if (dd && dir && dd !== dir) inv++; if (dd) dir = dd; }
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]), w = Math.max(...xs) - Math.min(...xs), hh = Math.max(...ys) - Math.min(...ys);
    return inv >= 6 && lung > 3 * Math.max(w, 40 / zoom) && hh < 140 / zoom;
  }
  function cancellaSotto(p: number[][]): boolean {
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]), r = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const prima = m.t.length;
    m.t = m.t.filter(s => decodTratto(s).p.filter(q => q[0] >= r[0] && q[0] <= r[2] && q[1] >= r[1] && q[1] <= r[3]).length < 2);
    return m.t.length !== prima;
  }
  // --- input ---
  let cur: number[][] | null = null, idPuntatore = -1, puntoInizio: number[] | null = null;
  const arrot = (x: number) => Math.round(x * 10) / 10;
  const punto = (e: PointerEvent): number[] => { const r = vivo.getBoundingClientRect(); return [arrot((e.clientX - r.left + pag.scrollLeft) / scala), arrot((e.clientY - r.top + pag.scrollTop) / scala), Math.round((e.pointerType === 'pen' ? (e.pressure || .5) : .5) * 100)]; };
  const scrive = (e: PointerEvent) => e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && dito && !penna);
  // lo spessore resta uguale sullo schermo: ingrandendo scrivi più fine (come Note e GoodNotes)
  const spessore = () => arrot((strumento === 'evid' ? 22 : 3) * PREF_MANO.w / zoom);
  const tipoK = () => strumento === 'evid' ? 'e' : PREF_MANO.tipo;
  const riempi = () => strumento === 'forma' && PREF_MANO.riempi ? colore : undefined;
  // tenuta: forma agganciata mentre la penna resta giù (sposta/ridimensiona/ruota attorno al centro)
  let tenuta: { base: number[][]; c: number[]; r0: number[]; chiusa: boolean } | null = null, timerTieni = 0, ultimoGrezzo: number[] = [0, 0], liscio: number[] | null = null;
  const mostraVivo = (pts: number[][], f?: string) => { pulisciVivo(); gv.lineCap = 'round'; gv.lineJoin = 'round'; tracciaTratto(gv, { c: colore, w: spessore(), k: tipoK(), p: pts, ...(f ? { f } : {}) }, scala); };
  function aggancia(): void {
    if (!cur || tenuta || strumento === 'gomma' || strumento === 'lazo' || strumento === 'forma' || !PREF_MANO.tieni) return;
    const fr = riconosciForma(cur); if (!fr) return;
    const xs = fr.pts.map(q => q[0]), ys = fr.pts.map(q => q[1]);
    const c = fr.chiusa ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : [fr.pts[0][0], fr.pts[0][1]];
    tenuta = { base: fr.pts, c, r0: ultimoGrezzo.slice(), chiusa: fr.chiusa }; cur = fr.pts.map(q => q.slice());
    mostraVivo(cur); try { Tocco.clic(.7); } catch (_) { /* senza audio */ } if (navigator.vibrate) navigator.vibrate(8);
  }
  vivo.addEventListener('pointerdown', e => {
    if (e.pointerType === 'pen' && !penna) { penna = true; aggiornaBarra(); }
    if (!scrive(e) || cur || pz) return;
    e.preventDefault(); try { vivo.setPointerCapture(e.pointerId); } catch (_) { /* puntatore sintetico */ } idPuntatore = e.pointerId;
    pulisciVivo();
    if (strumento === 'lazo') {
      const p = punto(e), r = riquadro();
      if (r && p[0] >= r[0] && p[0] <= r[2] && p[1] >= r[1] && p[1] <= r[3]) { trascina = p; spost = [0, 0]; cur = [p]; return; }
      sel = new Set(); selIm = new Set(); aggiornaAzioni(); poligono = [p]; cur = [p]; return;
    }
    salvaStoria(); cur = [punto(e)]; puntoInizio = cur[0].slice(); liscio = cur[0].slice(); ultimoGrezzo = cur[0].slice(); tenuta = null;
    if (strumento === 'gomma') cancellaVicino(cur[0]);
    if (strumento === 'penna' || strumento === 'evid') { clearTimeout(timerTieni); timerTieni = window.setTimeout(aggancia, 550); }
  });
  vivo.addEventListener('pointermove', e => {
    if (!cur || e.pointerId !== idPuntatore) return; e.preventDefault();
    const evs = (e as any).getCoalescedEvents ? (e as any).getCoalescedEvents() : [e];
    for (const ev of evs.length ? evs : [e]) {
      const grezzo = punto(ev), u = cur[cur.length - 1];
      if (strumento === 'lazo') { const p = grezzo; if (trascina) spost = [p[0] - trascina[0], p[1] - trascina[1]]; else if (poligono) poligono.push(p); disegnaSel(); continue; }
      if (strumento === 'forma') { mostraVivo(formaDa(PREF_MANO.forma, puntoInizio || cur[0], grezzo), riempi()); ultimoGrezzo = grezzo; continue; }
      if (tenuta) {   // forma agganciata: ruota e ridimensiona seguendo la penna
        const t = tenuta, v0 = [t.r0[0] - t.c[0], t.r0[1] - t.c[1]], v1 = [grezzo[0] - t.c[0], grezzo[1] - t.c[1]];
        const k = Math.hypot(v1[0], v1[1]) / (Math.hypot(v0[0], v0[1]) || 1), a = Math.atan2(v1[1], v1[0]) - Math.atan2(v0[1], v0[0]), co = Math.cos(a) * k, si = Math.sin(a) * k;
        cur = t.base.map(q => { const x = q[0] - t.c[0], y = q[1] - t.c[1]; return [arrot(t.c[0] + x * co - y * si), arrot(t.c[1] + x * si + y * co), 50]; });
        mostraVivo(cur); continue;
      }
      if (Math.abs(grezzo[0] - ultimoGrezzo[0]) + Math.abs(grezzo[1] - ultimoGrezzo[1]) > 3 / zoom && (strumento === 'penna' || strumento === 'evid')) { clearTimeout(timerTieni); timerTieni = window.setTimeout(aggancia, 550); }
      ultimoGrezzo = grezzo;
      // stabilizzazione: media mobile esponenziale (0 = nessuna, 10 = molto morbida)
      const f = strumento === 'gomma' ? 1 : 1 - PREF_MANO.stab * .085;
      liscio = liscio ? [liscio[0] + (grezzo[0] - liscio[0]) * f, liscio[1] + (grezzo[1] - liscio[1]) * f] : grezzo.slice();
      const p = [arrot(liscio[0]), arrot(liscio[1]), grezzo[2]];
      if (Math.abs(p[0] - u[0]) + Math.abs(p[1] - u[1]) < 2 / zoom) continue;
      if (strumento === 'gomma') { cancellaVicino(p); cur.push(p); continue; }
      cur.push(p);
      if (tipoK() === 'p') { gv.lineCap = 'round'; tracciaTratto(gv, { c: colore, w: spessore(), k: tipoK(), p: [u, p] }, scala); }
      else mostraVivo(cur);
    }
    if (cur[cur.length - 1][1] > m.h - 150) { m.h += 500; dimensiona(); }   // la pagina si allunga
  });
  const fine = (e: PointerEvent) => {
    if (!cur || e.pointerId !== idPuntatore) return;
    if (strumento === 'lazo') {
      if (trascina) { sposta(spost[0], spost[1]); spost = [0, 0]; trascina = null; }
      else if (poligono && poligono.length > 3) { const poly = poligono;
        m.t.forEach((s, i) => { const pts = decodTratto(s).p; if (pts.filter(q => dentro(q, poly)).length > pts.length / 2) sel.add(i); });
        (m.im || []).forEach((a, i) => { if (dentro([a.x + a.w / 2, a.y + a.h / 2], poly)) selIm.add(i); }); }
      poligono = null; cur = null; idPuntatore = -1; disegnaSel(); aggiornaAzioni(); return;
    }
    clearTimeout(timerTieni);
    if (strumento === 'forma') {
      const pts = formaDa(PREF_MANO.forma, puntoInizio || cur[0], ultimoGrezzo);
      if (lungTratto(pts) > 6) m.t.push(codTratto(colore, spessore(), tipoK(), pts, riempi())); else storia.pop();
      cur = null; tenuta = null; idPuntatore = -1; ridisegna(); cambia(); return;
    }
    if (!tenuta && strumento === 'penna' && eScarabocchio(cur) && cancellaSotto(cur)) { cur = null; idPuntatore = -1; ridisegna(); cambia(); avviso('Cancellato con lo scarabocchio', 1500); return; }
    if (!tenuta && (PREF_MANO.auto || strumento === 'evid') && strumento !== 'gomma') {   // forma automatica / evidenziatore dritto
      const fr = riconosciForma(cur); if (fr && (strumento !== 'evid' || fr.nome === 'linea')) cur = fr.pts;
    }
    if (strumento !== 'gomma') m.t.push(codTratto(colore, spessore(), tipoK(), cur));
    cur = null; tenuta = null; idPuntatore = -1; ridisegna(); cambia();
  };
  vivo.addEventListener('pointerup', fine); vivo.addEventListener('pointercancel', fine);
  // Scribble di iPadOS: sulla tela i tocchi dello stilo non devono diventare testo né scorrere la pagina
  vivo.addEventListener('touchstart', e => { const t = e.touches[0] as any; if (e.touches.length === 1 && ((t && t.touchType === 'stylus') || (dito && !penna))) e.preventDefault(); }, { passive: false });
  vivo.addEventListener('touchmove', e => { const t = e.touches[0] as any; if (e.touches.length === 1 && ((t && t.touchType === 'stylus') || (dito && !penna))) e.preventDefault(); }, { passive: false });
  function cancellaVicino(p: number[]): void {
    const r = 14 * PREF_MANO.w / zoom, vic = (q: number[]) => Math.abs(q[0] - p[0]) < r && Math.abs(q[1] - p[1]) < r;
    let cambiato = false;
    if (PREF_MANO.gomma === 'parziale') {   // gomma parziale: taglia solo dove passa
      const nuovi: string[] = [];
      for (const s of m.t) { const t = decodTratto(s); if (!t.p.some(vic)) { nuovi.push(s); continue; } cambiato = true;
        let pezzo: number[][] = []; for (const q of t.p) { if (vic(q)) { if (pezzo.length > 1) nuovi.push(codTratto(t.c, t.w, t.k, pezzo)); pezzo = []; } else pezzo.push(q); }
        if (pezzo.length > 1) nuovi.push(codTratto(t.c, t.w, t.k, pezzo)); }
      m.t = nuovi;
    } else { const prima = m.t.length; m.t = m.t.filter(s => !decodTratto(s).p.some(vic)); cambiato = m.t.length !== prima; }
    if (cambiato) ridisegna();
  }
  /** v0.36: inserisce immagini (pagine PDF, slide, foto) dove stai guardando, una sotto l'altra. */
  function inserisci(l: { s: string; w: number; h: number }[]): void {
    if (!l.length) return; salvaStoria();
    let y = Math.round(pag.scrollTop / scala) + 20;
    const occ = (m.im || []).reduce((mx, a) => Math.max(mx, a.y + a.h), 0);
    if (occ > y) y = occ + 20;
    m.im = m.im || [];
    for (const x of l) { const w = LARG - 80, hh = Math.round(w * x.h / x.w); m.im.push({ s: x.s, x: 40, y, w, h: hh }); y += hh + 24; }
    if (y + 200 > m.h) m.h = Math.ceil((y + 400) / 100) * 100;
    dimensiona(); cambia();
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
      b('➰', strumento === 'lazo', () => { strumento = 'lazo'; }, 'Lazo: cerchia tratti o allegati per spostarli, eliminarli o farne una flashcard'),
      b(({ linea: '╱', freccia: '↗', rett: '▭', ellisse: '◯', triangolo: '△' } as any)[PREF_MANO.forma], strumento === 'forma', () => { if (strumento === 'forma') opzioni = opzioni === 'forma' ? '' : 'forma'; strumento = 'forma'; annullaSel(); }, 'Forme: trascina per disegnare (tocca di nuovo per sceglierle)'),
      b('⚙︎', !!opzioni && opzioni !== 'forma', () => { opzioni = opzioni === 'penna' ? '' : 'penna'; }, 'Penna: tipo, spessore, stabilizzazione, forme'),
      ...(APPUNTI_MANO ? [b('📋', false, () => { const c = APPUNTI_MANO!; salvaStoria(); const dy = Math.round(pag.scrollTop / scala) + 40; const ys = c.t.flatMap(s => decodTratto(s).p.map(q => q[1])).concat(c.im.map(a => a.y)); const y0 = ys.length ? Math.min(...ys) : 0;
        m.t.push(...c.t.map(s => { const t = decodTratto(s); return codTratto(t.c, t.w, t.k, t.p.map(q => [q[0], q[1] - y0 + dy, q[2]]), t.f); })); m.im = (m.im || []).concat(c.im.map(a => ({ ...a, y: a.y - y0 + dy }))); ridisegna(); cambia(); }, 'Incolla')] : []),
      h('span.mano-sep'),
      ...COLORI.concat(PREF_MANO.extra).map(c => h('button.mano-colore' + (c === colore ? '.attivo' : ''), { 'aria-label': 'Colore', style: { background: c }, onclick: () => { colore = c; if (strumento === 'gomma') strumento = 'penna'; aggiornaBarra(); } })),
      (() => { const i = h('input', { type: 'color', value: colore, 'aria-label': 'Colore personalizzato', style: { position: 'absolute', opacity: '0', width: '1px', height: '1px' }, onchange: () => { colore = i.value; if (!COLORI.includes(colore) && !PREF_MANO.extra.includes(colore)) { PREF_MANO.extra = [colore, ...PREF_MANO.extra].slice(0, 4); salvaPrefMano(); } if (strumento === 'gomma') strumento = 'penna'; aggiornaBarra(); } }) as HTMLInputElement;
        return h('label.mano-colore.mano-piu', { title: 'Altro colore' }, '+', i); })(),
      h('span.mano-sep'),
      b('↶', false, () => { if (storia.length) { futuro.push(foto()); ripristina(storia.pop()!); ridisegna(); cambia(); } }, 'Annulla'),
      b('↷', false, () => { if (futuro.length) { storia.push(foto()); ripristina(futuro.pop()!); ridisegna(); cambia(); } }, 'Ripeti'),
      b(({ quadretti: '▦', righe: '☰', puntini: '⁙', bianco: '▢', cornell: '◧', esercizio: '▤' } as any)[m.sf], false, () => { const oo: Mano['sf'][] = ['quadretti', 'righe', 'puntini', 'bianco', 'cornell', 'esercizio']; m.sf = oo[(oo.indexOf(m.sf) + 1) % oo.length]; ridisegna(); cambia(); }, 'Sfondo: quadretti / righe / puntini / bianco / Cornell / esercizio'),
      (zoomEti = h('button.mano-zoom', { title: 'Torna al 100%', 'aria-label': 'Torna al 100%', hidden: zoom === 1, onclick: () => impostaZoom(1) }, Math.round(zoom * 100) + '%')),
      ...(penna ? [h('span.tenue.piccolo.mano-nota', null, '✏️ Pencil: il dito scorre')] : [b(dito ? '☝️ scrive' : '☝️ scorre', dito, () => { dito = !dito; pag.classList.toggle('dito', dito); }, 'Scrivere anche con il dito')]),
      ...(o.extra ? o.extra().filter(Boolean) as HTMLElement[] : []));
    pannello();
  }
  // v0.39: pannello opzioni (tipo di penna, spessore, stabilizzazione, gomma, forme)
  let opzioni: '' | 'penna' | 'forma' = '';
  const pan = h('div.mano-opzioni');
  function pannello(): void {
    svuota(pan); pan.hidden = !opzioni; if (!opzioni) return;
    const scelta = (val: string, att: boolean, f: () => void, eti: string) => h('button.chip' + (att ? '.attivo' : ''), { onclick: () => { f(); salvaPrefMano(); aggiornaBarra(); } }, eti);
    const riga = (t: string, ...x: HTMLElement[]) => h('div.mano-riga', null, h('span.tenue.piccolo', null, t), ...x);
    const cursore = (min: number, max: number, step: number, v: number, f: (x: number) => void) => h('input', { type: 'range', min, max, step, value: v, oninput: (e: Event) => { f(+(e.target as HTMLInputElement).value); salvaPrefMano(); } });
    if (opzioni === 'forma') {
      pan.append(riga('Forma', ...(['linea', 'freccia', 'rett', 'ellisse', 'triangolo'] as FormaK[]).map(k => scelta(k, PREF_MANO.forma === k, () => { PREF_MANO.forma = k; strumento = 'forma'; }, ({ linea: '╱ Linea', freccia: '↗ Freccia', rett: '▭ Rettangolo', ellisse: '◯ Ellisse', triangolo: '△ Triangolo' } as any)[k]))),
        riga('Riempimento', scelta('n', !PREF_MANO.riempi, () => PREF_MANO.riempi = false, 'Vuota'), scelta('s', PREF_MANO.riempi, () => PREF_MANO.riempi = true, 'Colorata')));
      return;
    }
    pan.append(
      riga('Penna', ...([['p', '✒️ Stilografica'], ['b', '🖊 Biro'], ['m', '✏️ Matita'], ['t', '┄ Tratteggio']] as [string, string][]).map(([k, e]) => scelta(k, PREF_MANO.tipo === k, () => { PREF_MANO.tipo = k; if (strumento !== 'evid') strumento = 'penna'; }, e))),
      riga('Spessore', cursore(.4, 4, .1, PREF_MANO.w, x => PREF_MANO.w = x)),
      riga('Stabilizzazione', cursore(0, 10, 1, PREF_MANO.stab, x => PREF_MANO.stab = x)),
      riga('Forme', scelta('t', PREF_MANO.tieni, () => PREF_MANO.tieni = !PREF_MANO.tieni, (PREF_MANO.tieni ? '✓ ' : '') + 'Disegna e tieni premuto'), scelta('a', PREF_MANO.auto, () => PREF_MANO.auto = !PREF_MANO.auto, (PREF_MANO.auto ? '✓ ' : '') + 'Forma automatica')),
      riga('Gomma', scelta('g', PREF_MANO.gomma === 'tratto', () => PREF_MANO.gomma = 'tratto', 'Tratto intero'), scelta('g', PREF_MANO.gomma === 'parziale', () => PREF_MANO.gomma = 'parziale', 'Parziale')),
      h('div.tenue.piccolo', null, 'Gesti: due dita toccano = annulla · tre dita = ripeti · scarabocchio = cancella · pizzica = zoom'));
  }
  pag.classList.toggle('dito', dito);
  aggiornaBarra();
  azioni.hidden = true;
  contenitore.append(barra, pan, azioni, pag);   // v0.36: barra in alto (come Note), mai sopra il testo
  requestAnimationFrame(dimensiona);
  let ultimaL = 0, ultimaA = 0;
  const ro = new ResizeObserver(() => { const l = pag.clientWidth, a = pag.clientHeight; if (l && (Math.abs(l - ultimaL) > .5 || Math.abs(a - ultimaA) > .5)) { ultimaL = l; ultimaA = a; dimensiona(); } }); ro.observe(pag);
  return { dati: () => ({ t: m.t.slice(), h: Math.max(1400, m.h), sf: m.sf, ...(m.im && m.im.length ? { im: m.im.slice() } : {}) }), ridisegna: dimensiona, inserisci, barra, aggiornaBarra };
}

/** ✨ Trascrive la pagina a mano: mostra il testo da controllare, poi lo aggiunge o sostituisce. */
async function leggiScrittura(m: Mano, dopo: (testo: string, modo: 'aggiungi' | 'sostituisci') => void): Promise<void> {
  if (manoVuota(m)) { avviso('Scrivi qualcosa sulla pagina prima.'); return; }
  avviso('✨ Leggo la tua scrittura…', 20000);
  await caricaImmaginiMano(m);
  let t = '';
  try {
    t = await Spiega.vede('Trascrivi FEDELMENTE il testo scritto a mano in questa pagina di appunti di studio (italiano; chimica, biologia o fisica). Se nella pagina ci sono slide o pagine stampate incollate, trascrivi solo le annotazioni a mano e, tra parentesi quadre, il titolo della slide a cui si riferiscono. '
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

// ---------- v0.36: allegati (PDF, slide, foto) ----------
// PDF.js (Mozilla) viene caricato solo la prima volta che inserisci un PDF; le pagine diventano immagini
// JPEG leggere (larghezza 1000 px) da annotare a mano, e il loro testo va nel testo dell'appunto.
let pdfjsPronto: Promise<any> | null = null;
function caricaPdfJs(): Promise<any> {
  if ((window as any).pdfjsLib) return Promise.resolve((window as any).pdfjsLib);
  if (!pdfjsPronto) pdfjsPronto = new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js';
    s.onload = () => { const L = (window as any).pdfjsLib; if (!L) return ko(new Error('PDF.js non disponibile')); L.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(L); };
    s.onerror = () => { pdfjsPronto = null; ko(new Error('serve la connessione per aprire i PDF')); };
    document.head.appendChild(s);
  });
  return pdfjsPronto;
}
async function pdfInImmagini(f: File, max = 20): Promise<{ pagine: { s: string; w: number; h: number }[]; testo: string }> {
  const L = await caricaPdfJs();
  const doc = await L.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  const n = Math.min(doc.numPages, max), pagine: { s: string; w: number; h: number }[] = [], testi: string[] = [];
  for (let i = 1; i <= n; i++) {
    const p = await doc.getPage(i), v0 = p.getViewport({ scale: 1 }), sc = 1000 / v0.width, v = p.getViewport({ scale: sc });
    const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
    const cx = c.getContext('2d')!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    await p.render({ canvasContext: cx, viewport: v }).promise;
    pagine.push({ s: c.toDataURL('image/jpeg', .7), w: c.width, h: c.height });
    try { const tc = await p.getTextContent(); const t = tc.items.map((x: any) => x.str + (x.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim(); if (t) testi.push('### Pagina ' + i + '\n' + t); } catch (_) { /* pagina senza testo (scansione) */ }
  }
  if (doc.numPages > max) avviso('Inserite le prime ' + max + ' pagine su ' + doc.numPages + ' (per non appesantire l\'appunto).', 6000);
  return { pagine, testo: testi.join('\n\n') };
}
function fotoInImmagine(f: File): Promise<{ s: string; w: number; h: number }> {
  return new Promise((ok, ko) => {
    const u = URL.createObjectURL(f), i = new Image();
    i.onload = () => { const sc = Math.min(1, 1200 / i.naturalWidth), c = document.createElement('canvas'); c.width = Math.round(i.naturalWidth * sc); c.height = Math.round(i.naturalHeight * sc);
      const cx = c.getContext('2d')!; cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(i, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok({ s: c.toDataURL('image/jpeg', .75), w: c.width, h: c.height }); };
    i.onerror = () => { URL.revokeObjectURL(u); ko(new Error('immagine non leggibile')); };
    i.src = u;
  });
}
