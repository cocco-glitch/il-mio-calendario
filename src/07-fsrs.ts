// 07-fsrs.ts — Motore unificato, blocco 3: UNICO nucleo FSRS-5, puro (niente DOM, Stato o rete).
// Lo usano Ripassi (sotto-step), Carte, Appunti e, dal blocco 3, anche le domande dei quiz (Neuro.pianifica),
// che prima avevano un secondo SRS (SM-2 semplificato). Formule pubbliche di FSRS-5 con parametri predefiniti:
// R = (1 + F·t/S)^-0,5; intervallo = giorni in cui R scende alla ritenzione desiderata.
// Con R = 0,9: 0,9^(-2) − 1 = F, quindi intervallo = S (la stabilità è «i giorni fino al 90 %»).

const Fsrs = (() => {
  const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
  const DECAY = -0.5, F = 19 / 81;
  const lim = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

  function recuperabilita(t: number, s: number): number { return Math.pow(1 + F * t / s, DECAY); }
  function intervallo(s: number, r: number): number { return lim(Math.round(s / F * (Math.pow(r, 1 / DECAY) - 1)), 1, 365); }
  const d0 = (g: number) => lim(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);

  /** Un passo di FSRS: nuovo stato dopo un ripasso con voto g (1–4), t giorni dopo il precedente. */
  function passo(st: { d: number; s: number } | null, g: number, t: number): { d: number; s: number } {
    if (!st) return { d: d0(g), s: W[g - 1] };
    const { d, s } = st;
    let s2: number;
    if (t <= 0) s2 = s * Math.exp(W[17] * (g - 3 + W[18]));                      // stesso giorno
    else {
      const r = recuperabilita(t, s);
      if (g === 1) s2 = Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
      else s2 = s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1) + 1);
    }
    const dd = d - W[6] * (g - 3) * (10 - d) / 9;
    return { d: lim(W[7] * d0(4) + (1 - W[7]) * dd, 1, 10), s: lim(s2, 0.1, 36500) };
  }

  /** Migrazione SM-2 → FSRS senza perdere storia: S := intervallo SM-2 (stesso significato a R = 0,9);
   *  D := 5 + 4·(2,5 − ease)/1,2 in [1; 10] (ease 2,5 → 5; ease 1,3 → 9). */
  function daSm2(iv: number, ease: number): { d: number; s: number } {
    const e = ease > 0 ? ease : 2.5;
    return { d: lim(5 + 4 * (2.5 - e) / 1.2, 1, 10), s: lim(iv > 0 ? iv : W[2], 0.1, 36500) };
  }

  /** Stato di un elemento solo «esposto» (spuntato senza verifica): primo controllo dopo 1 giorno,
   *  difficoltà neutra. Non è un voto: il primo punteggio vero riparte da passo(null, g, 0). */
  function esposizione(): { d: number; s: number } { return { d: d0(3), s: 1 }; }

  return { W, F, DECAY, recuperabilita, intervallo, passo, daSm2, esposizione, d0 };
})();
