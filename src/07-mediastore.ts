// ============================================================
// 07-mediastore.ts — v0.50 (BP1 §7, minimo utile): compressione delle immagini prima dell'invio.
// - comprimiImmagine: lato lungo ≤ maxLato, WebP 0.82; se il browser restituisce altro (Safari può
//   dare PNG in silenzio) si rifà in JPEG 0.85.
// - Limite visione: Groq 20 MB, Gemini inline ~20 MB → oltre, errore chiaro e nessun invio.
// ============================================================

const MediaStore = (() => {
  const LIMITE_VISIONE = 20 * 1024 * 1024;

  function tela(c: HTMLCanvasElement, tipo: string, q: number): Promise<Blob | null> {
    return new Promise(ok => { try { c.toBlob(b => ok(b), tipo, q); } catch (_) { ok(null); } });
  }

  async function carica(file: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; chiudi: () => void }> {
    if (typeof createImageBitmap === 'function') {
      try { const b = await createImageBitmap(file); return { img: b, w: b.width, h: b.height, chiudi: () => b.close() }; } catch (_) { /* provo con <img> */ }
    }
    const u = URL.createObjectURL(file);
    try {
      const i = await new Promise<HTMLImageElement>((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ko(new Error('Immagine non leggibile.')); im.src = u; });
      return { img: i, w: i.naturalWidth, h: i.naturalHeight, chiudi: () => URL.revokeObjectURL(u) };
    } catch (e) { URL.revokeObjectURL(u); throw e; }
  }

  /** Riduce e ricomprime un'immagine. Restituisce WebP, o JPEG se il browser non sa fare WebP. */
  async function comprimiImmagine(file: Blob, maxLato = 1600): Promise<Blob> {
    const s = await carica(file);
    try {
      const k = Math.min(1, maxLato / Math.max(s.w, s.h, 1));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(s.w * k)); c.height = Math.max(1, Math.round(s.h * k));
      const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(s.img, 0, 0, c.width, c.height);
      const w = await tela(c, 'image/webp', 0.82);
      if (w && w.type === 'image/webp') return w;
      const j = await tela(c, 'image/jpeg', 0.85);
      if (!j) throw new Error('Non riesco a comprimere l\'immagine.');
      return j;
    } finally { s.chiudi(); }
  }

  function aDataUrl(b: Blob): Promise<string> {
    return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ko(r.error); r.readAsDataURL(b); });
  }

  /** Byte reali di un data URL base64 (o di un URL qualsiasi: lunghezza). */
  function byteDataUrl(u: string): number {
    const i = u.indexOf(';base64,');
    if (i < 0) return u.length;
    const b64 = u.length - i - 8;
    return Math.floor(b64 * 3 / 4) - (u.endsWith('==') ? 2 : u.endsWith('=') ? 1 : 0);
  }

  /** Errore chiaro se l'immagine supera il limite dei modelli visivi: nessun invio. */
  function controllaVisione(u: string): void {
    const n = byteDataUrl(u);
    if (n > LIMITE_VISIONE) throw new Error('Immagine troppo grande per la lettura AI (' + (n / 1048576).toFixed(1) + ' MB, massimo 20 MB): riducila e riprova.');
  }

  return { comprimiImmagine, aDataUrl, byteDataUrl, controllaVisione, LIMITE_VISIONE };
})();
