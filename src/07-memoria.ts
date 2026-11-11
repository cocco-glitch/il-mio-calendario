// 07-memoria.ts — Motore dei ripassi (F2): ripetizione spaziata con FSRS.
//
// Ogni scheda fatta ha un record 'memoria' (id 'mem-<idScheda>') con difficoltà D (1–10), stabilità S
// (giorni) e data del prossimo ripasso. Formule pubbliche di FSRS-5 (open-spaced-repetition), parametri
// predefiniti: probabilità di ricordare dopo t giorni R = (1 + F·t/S)^-0,5; intervallo = giorni in cui R
// scende alla ritenzione desiderata (0,90; 0,95 nei 14 giorni prima di un esame).
//
// Voto ricavato dal punteggio della scheda: <50 → 1 (Di nuovo), 50–69 → 2 (Difficile), 70–89 → 3 (Bene),
// ≥90 → 4 (Facile); senza punteggio → 3. Il voto si registra quando cambia la data della scheda
// (ripasso nuovo) o il punteggio nello stesso giorno (correzione: si riparte dallo stato precedente).
//
// "Ripassi di oggi": SOTTO-STEP con data ≤ oggi, prima le più a rischio (R più bassa), con un tetto di
// minuti al giorno (impostazione ripassoMinuti, predefinito 30) e minuti stimati per scheda (10).

interface MemoriaPrima { d: number; s: number; due: string; ultimo?: string; n: number; lapsi: number; }
interface MemoriaV extends Memoria { prima?: MemoriaPrima; }

const Ripassi = (() => {
  const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
  const DECAY = -0.5, F = 19 / 81;
  const MIN_SCHEDA = 10;
  const giorni = (a: string, b: string) => Math.round((inizioGiorno(daDt(b)).getTime() - inizioGiorno(daDt(a)).getTime()) / 86400000);
  const piu = (k: string, n: number) => { const d = daDt(k); d.setDate(d.getDate() + n); return ymd(d); };
  const lim = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

  function recuperabilita(t: number, s: number): number { return Math.pow(1 + F * t / s, DECAY); }
  function intervallo(s: number, r: number): number { return lim(Math.round(s / F * (Math.pow(r, 1 / DECAY) - 1)), 1, 365); }
  const d0 = (g: number) => lim(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
  function voto(punteggio?: number): number { return punteggio == null ? 3 : punteggio < 50 ? 1 : punteggio < 70 ? 2 : punteggio < 90 ? 3 : 4; }

  /** Un passo di FSRS: nuovo stato dopo un ripasso con voto g, t giorni dopo il precedente. */
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

  /** Ritenzione desiderata per un giorno: più alta nei 14 giorni prima di un esame. */
  function ritenzione(giorno: string): number {
    const base = imp().ritenzione || 0.9;
    const vicino = Stato.tutti<Esame>('esame').some(e => { const g = giorni(giorno, e.data); return g >= 0 && g <= 14; });
    return vicino ? Math.max(base, 0.95) : base;
  }

  // ---------- Unità di ripasso: il SOTTO-STEP (decisione dell'utente, 11/11) ----------
  // Ripassare ogni scheda costerebbe ~150 ore prima dell'esame; per sotto-step ~20 ore. Quando un
  // sotto-step è in scadenza l'app propone UNA sua scheda (la meno rifatta di recente, poi la più debole).
  // Il sotto-step entra nei ripassi quando tutte le sue PRIORITARIE sono fatte ("apprendimento").

  /** Giorno in cui il sotto-step è stato studiato: data del piano se precedente all'ultima spunta. */
  function dataApprendimento(k: string): string | null {
    const t = Studio.trovaSotto(k); if (!t) return null;
    const P = Studio.schedeDi(t.sub).filter(x => x.tipo === 'P');
    const date = P.map(x => (Studio.prog(x.id) || {} as Progresso).data).filter(Boolean) as string[];
    if (!date.length) return null;
    const ultima = date.sort()[date.length - 1];
    let piano: string | null = null;
    for (const pp of Studio.pkPiani()) {
      if (pp.modo === 'raffinamento') continue;
      for (const g of pp.giorni) for (const v of g.voci) if (v.k === k) piano = Studio.dataVoce(v, g, pp.id);
      if (!piano) for (const c of pp.copertura || []) {
        const mm = /(\d{2})\/(\d{2})/.exec(c.k === k ? c.quando : '');
        if (mm) { const d = new Date(); piano = d.getFullYear() + '-' + mm[2] + '-' + mm[1]; break; }
      }
    }
    return piano && piano < ultima ? piano : ultima;
  }
  function votoMedio(k: string): number {
    const t = Studio.trovaSotto(k); if (!t) return 3;
    const pt = Studio.schedeDi(t.sub).filter(x => x.tipo === 'P').map(x => (Studio.prog(x.id) || {} as Progresso).punteggio).filter(v => v != null) as number[];
    return pt.length ? voto(pt.reduce((a, b) => a + b, 0) / pt.length) : 3;
  }
  function salvaStato(k: string, base: MemoriaPrima | null, g: number, giorno: string, log: [string, number][], scheda?: string): void {
    const t = base && base.ultimo ? giorni(base.ultimo, giorno) : 0;
    const st = passo(base && base.ultimo ? { d: base.d, s: base.s } : null, g, t);
    const prec = (mem(k) || {} as any).schede as string[] | undefined;
    const m: MemoriaV & { schede?: string[] } = {
      id: 'mem-sub-' + k, type: 'memoria', updatedAt: 0, er: 'sub:' + k, d: st.d, s: st.s,
      due: piu(giorno, intervallo(st.s, ritenzione(giorno))), ultimo: giorno,
      n: (base ? base.n : 0) + 1, lapsi: (base ? base.lapsi : 0) + (base && base.ultimo && g === 1 ? 1 : 0),
      log: log.slice(-50), prima: base || undefined,
      schede: scheda ? (prec || []).concat([scheda]).slice(-30) : prec,   // schede usate per i ripassi (rotazione)
    };
    Stato.salva(m, true);
  }
  function mem(k: string): MemoriaV | undefined { const m = Stato.prendi<MemoriaV>('mem-sub-' + k); return m && !m.deleted ? m : undefined; }

  /** Primo ingresso nei ripassi (quando le prioritarie sono tutte fatte) o ricalcolo dell'apprendimento. */
  function apprendi(k: string): void {
    const giorno = dataApprendimento(k); if (!giorno) return;
    salvaStato(k, null, votoMedio(k), giorno, [[giorno, votoMedio(k)]]);
  }

  /** Chiamata da Studio.segna: una scheda è stata spuntata o ha un nuovo punteggio. */
  function registra(id: string, p: Progresso | undefined): void {
    const t = trovaScheda(id); if (!t || !p) return;
    const k = t.k, m = mem(k);
    if (!m) { if (Studio.stepFatto(k)) apprendi(k); return; }
    if (!p.fatta || p.punteggio == null || !p.data) return;
    const g = voto(p.punteggio), giorno = p.data;
    if (m.n === 1 && giorno <= (m.ultimo || '')) { apprendi(k); return; }     // correzione dell'apprendimento
    if (giorno < (m.ultimo || '')) return;                                     // data passata: ignoro
    if (giorno === m.ultimo) {                                                 // correzione del ripasso di oggi
      const log = (m.log || []).slice(0, -1) as [string, number][];
      const sc = ((m as any).schede || []) as string[]; (m as any).schede = sc.slice(0, -1);
      Stato.salva(m, true);
      salvaStato(k, m.prima || null, g, giorno, log.concat([[giorno, g]]), id); return;
    }
    salvaStato(k, { d: m.d, s: m.s, due: m.due, ultimo: m.ultimo, n: m.n, lapsi: m.lapsi }, g, giorno, ((m.log || []) as [string, number][]).concat([[giorno, g]]), id);
  }

  /** Crea le memorie mancanti dei sotto-step completati (prima installazione o dati arrivati dalla sync). */
  function inizializza(): number {
    let n = 0;
    for (const pk of Studio.pkStep()) for (const mat of pk.materie) for (const sub of mat.sottostep)
      if (!mem(sub.k) && Studio.stepFatto(sub.k)) { apprendi(sub.k); n++; }
    return n;
  }

  /** Probabilità di ricordare oggi un sotto-step (0–1). */
  function ricordo(k: string, giorno = ymd(new Date())): number | null {
    const m = mem(k); if (!m || !m.ultimo) return null;
    return recuperabilita(Math.max(0, giorni(m.ultimo, giorno)), m.s);
  }
  /** Scheda da proporre per il ripasso: una prioritaria non usata negli ultimi ripassi, la più debole (punteggio più basso). */
  function schedaDaProporre(k: string): SchedaS | null {
    const t = Studio.trovaSotto(k); if (!t) return null;
    const P = Studio.schedeDi(t.sub).filter(x => x.tipo === 'P');
    if (!P.length) return null;
    const usate = ((mem(k) || {} as any).schede || []) as string[];
    const recenti = new Set(P.length > 1 ? usate.slice(-(P.length - 1)) : []);
    const cand = P.filter(x => !recenti.has(x.id));
    const punt = (x: SchedaS) => { const p = Studio.prog(x.id); return p && p.punteggio != null ? p.punteggio : 75; };
    return (cand.length ? cand : P).slice().sort((a, b) => punt(a) - punt(b))[0];
  }
  const quanteAlGiorno = () => Math.max(1, Math.floor((imp().ripassoMinuti || 30) / MIN_SCHEDA));

  /** Ripassi di un giorno: { oggi (entro il tetto), coda, fatti, minuti }. */
  function delGiorno(giorno = ymd(new Date())) {
    const tutte = Stato.tutti<MemoriaV>('memoria').filter(m => m.er.startsWith('sub:'));
    const fatti = tutte.filter(m => m.ultimo === giorno && m.n > 1);
    const scadute = tutte.filter(m => m.due <= giorno && m.ultimo !== giorno && m.ultimo)
      .map(m => ({ m, k: m.er.slice(4), r: recuperabilita(Math.max(0, giorni(m.ultimo!, giorno)), m.s) }))
      .sort((a, b) => a.r - b.r);
    const posti = Math.max(0, quanteAlGiorno() - fatti.length);
    return { oggi: scadute.slice(0, posti), coda: scadute.slice(posti), fatti, minuti: Math.min(posti, scadute.length) * MIN_SCHEDA };
  }

  return { W, voto, passo, recuperabilita, intervallo, ritenzione, registra, inizializza, mem, ricordo, delGiorno, quanteAlGiorno, schedaDaProporre, dataApprendimento, MIN_SCHEDA };
})();

/** Trova una scheda dei pacchetti dal suo id (per aprirla dai ripassi). */
let indiceSchede: { v: number; m: Map<string, { pk: PkStep; m: string; micro: string; s: SchedaS; k: string }> } = { v: -1, m: new Map() };
function trovaScheda(id: string): { pk: PkStep; m: string; micro: string; s: SchedaS; k: string } | null {
  if (indiceSchede.v !== Stato.ver) {        // v0.17: indice ricostruito solo quando i dati cambiano
    const m = new Map<string, { pk: PkStep; m: string; micro: string; s: SchedaS; k: string }>();
    for (const pk of Studio.pkStep()) for (const mat of pk.materie) for (const sub of mat.sottostep) for (const mi of sub.microstep)
      for (const s of mi.schede) if (!m.has(s.id)) m.set(s.id, { pk, m: mat.m, micro: mi.n, s, k: sub.k });
    indiceSchede = { v: Stato.ver, m };
  }
  return indiceSchede.m.get(id) || null;
}

/** Colore della probabilità di ricordare (scala unica del piano: corallo → ambra → verde → teal). */
function coloreRicordo(r: number): string { return r < 0.7 ? '#e8590c' : r < 0.85 ? '#f59f00' : r < 0.95 ? '#2f9e44' : '#0b7285'; }
function chipRicordo(k: string): HTMLElement | null {
  const r = Ripassi.ricordo(k); if (r == null) return null;
  return h('span.chip-ricordo', { style: { color: coloreRicordo(r), borderColor: coloreRicordo(r) }, title: 'Probabilità di ricordare questo sotto-step oggi' }, '🧠 ' + Math.round(r * 100) + '%');
}

/** Riquadro "Ripassi di oggi" (schermata Oggi). */
function widgetRipassi(): HTMLElement | null {
  const r = Ripassi.delGiorno();
  if (!r.oggi.length && !r.fatti.length) return null;
  const proposta = (k: string) => { const sc = Ripassi.schedaDaProporre(k); return sc ? trovaScheda(sc.id) : null; };
  const riga = (x: { k: string; r: number }) => {
    const t = proposta(x.k), sub = Studio.trovaSotto(x.k);
    if (!t || !sub) return null;
    return h('button.voce-lista', { onclick: () => apriScheda(t.pk, t.m, t.micro, t.s, true) },
      h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, Studio.etichetta(x.k) + ' · ' + sub.sub.titolo),
        h('span.voce-sotto', null, 'Rifai: ' + t.micro + ' ' + t.s.titolo + ' (' + t.s.k + '/' + t.s.n + ') · ricordo ', h('b', { style: { color: coloreRicordo(x.r) } }, Math.round(x.r * 100) + '%'))),
      icona('dx', 18));
  };
  const primo = r.oggi.map(x => proposta(x.k)).find(Boolean);
  return scheda('Ripassi di oggi',
    h('div.tenue.piccolo', null, r.oggi.length
      ? r.oggi.length + (r.oggi.length === 1 ? ' sotto-step' : ' sotto-step') + ' · circa ' + r.minuti + ' min. Rifai la scheda proposta (va bene anche «rifai solo gli errori») e scrivi il punteggio: l\'app decide quando riproporre il sotto-step.'
      : '✓ Ripassi di oggi fatti (' + r.fatti.length + '). Ottimo: la fatica di ricordare è ciò che fissa la memoria.'),
    r.oggi.map(riga),
    r.coda.length ? h('div.tenue.piccolo', null, '+' + r.coda.length + ' in coda per i prossimi giorni (tetto: ' + (imp().ripassoMinuti || 30) + ' min al giorno).') : null,
    primo ? h('div.bottoni', null, h('button.btn', { onclick: () => apriScheda(primo.pk, primo.m, primo.micro, primo.s, true) }, '▶ Inizia')) : null);
}
