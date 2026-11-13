// ============================================================
// 04-tocco.ts — v0.34: riscontro al tocco.
// - Suono di tap: un "clic" morbido e cortissimo generato al volo con
//   Web Audio (niente file). Su tocchi di pulsanti e mentre si scrive.
//   Si spegne da Altro › Aspetto. Su iPhone parte dopo il primo tocco.
// - Numeri che "contano" fino al valore (classe .conta).
// ============================================================

const Tocco = (() => {
  let ctx: AudioContext | null = null;
  let rumore: AudioBuffer | null = null;
  let ultimo = 0;

  function attivo(): boolean { const s = (imp() as any).suono; return s !== 'no' && s !== false; }
  function volume(): number { const v = (imp() as any).volumeTap; return typeof v === 'number' ? v : 0.35; }

  function prepara(): AudioContext | null {
    if (ctx) return ctx;
    const C = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    try {
      ctx = new C() as AudioContext;
      // 12 ms di rumore che decade in fretta: suona come un clic smorzato
      const n = Math.floor(ctx.sampleRate * 0.012);
      rumore = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = rumore.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4);
    } catch (_) { ctx = null; }
    return ctx;
  }

  /** forte: 1 = pulsante, 0.6 = tasto della tastiera */
  function clic(forte = 1): void {
    if (!attivo()) return;
    const adesso = performance.now();
    if (adesso - ultimo < 30) return; // niente raffiche
    ultimo = adesso;
    const c = prepara();
    if (!c || !rumore) return;
    if (c.state === 'suspended') c.resume().catch(() => { /* niente */ });
    try {
      const s = c.createBufferSource(); s.buffer = rumore;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = forte < 1 ? 2600 : 1800; f.Q.value = 0.9;
      const g = c.createGain(); g.gain.value = volume() * forte * 0.9;
      s.connect(f); f.connect(g); g.connect(c.destination);
      s.start();
    } catch (_) { /* niente */ }
  }

  const TOCCABILI = 'button, a[href], .chip, select, summary, label.interruttore, input[type=checkbox], input[type=radio], [role=button], [role=tab]';
  function attiva(): void {
    document.addEventListener('pointerdown', e => {
      const t = e.target as Element;
      if (!t || !t.closest) return;
      const b = t.closest(TOCCABILI) as HTMLButtonElement | null;
      if (b && !b.disabled) clic(1);
    }, { capture: true, passive: true });
    document.addEventListener('keydown', e => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (!t || !(t.matches('input, textarea, [contenteditable]'))) return;
      if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') clic(0.6);
    }, { capture: true, passive: true });
  }

  // ---------- Numeri che contano ----------
  const visti = new WeakSet<Element>();
  function conta(radice: ParentNode): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    radice.querySelectorAll('.conta').forEach(el => {
      if (visti.has(el)) return; visti.add(el);
      const fine = parseInt(el.textContent || '', 10);
      if (!(fine > 1)) return;
      const t0 = performance.now(), dur = Math.min(900, 350 + fine * 8);
      const passo = (t: number) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = String(Math.round(fine * e));
        if (k < 1) requestAnimationFrame(passo);
      };
      el.textContent = '0';
      requestAnimationFrame(passo);
    });
  }

  return { clic, attiva, conta };
})();
