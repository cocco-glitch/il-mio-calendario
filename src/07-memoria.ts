// 07-memoria.ts — Motore dei ripassi (F2): ripetizione spaziata con FSRS.
//
// Ogni scheda fatta ha un record 'memoria' (id 'mem-<idScheda>') con difficoltà D (1–10), stabilità S
// (giorni) e data del prossimo ripasso. Formule pubbliche di FSRS-5 (open-spaced-repetition), parametri
// predefiniti: probabilità di ricordare dopo t giorni R = (1 + F·t/S)^-0,5; intervallo = giorni in cui R
// scende alla ritenzione desiderata (0,90; 0,95 nei 14 giorni prima di un esame).
//
// Voto ricavato dal punteggio della scheda: <50 → 1 (Di nuovo), 50–69 → 2 (Difficile), 70–89 → 3 (Bene),
// ≥90 → 4 (Facile). Il voto si registra quando cambia la data della scheda (ripasso nuovo) o il punteggio
// nello stesso giorno (correzione: si riparte dallo stato precedente).
// Motore unificato, blocco 3: formule in 07-fsrs.ts (nucleo unico, condiviso con i quiz). Un sotto-step con
// le prioritarie spuntate SENZA alcun punteggio entra come «esposto»: primo controllo il giorno dopo,
// nessun voto inventato (prima valeva «Bene» e la stabilità partiva da 3,17 giorni).
//
// "Ripassi di oggi": SOTTO-STEP con data ≤ oggi, prima le più a rischio (R più bassa), con un tetto di
// minuti al giorno (impostazione ripassoMinuti, predefinito 30) e minuti stimati per scheda (10).

interface MemoriaPrima { d: number; s: number; due: string; ultimo?: string; n: number; lapsi: number; esposto?: boolean; }
interface MemoriaV extends Memoria { prima?: MemoriaPrima; esposto?: boolean; }

const Ripassi = (() => {
  const { W, recuperabilita, intervallo, passo } = Fsrs;
  const MIN_SCHEDA = 10;
  const giorni = (a: string, b: string) => Math.round((inizioGiorno(daDt(b)).getTime() - inizioGiorno(daDt(a)).getTime()) / 86400000);
  const piu = (k: string, n: number) => { const d = daDt(k); d.setDate(d.getDate() + n); return ymd(d); };
  const lim = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

  function voto(punteggio?: number): number { return punteggio == null ? 3 : punteggio < 50 ? 1 : punteggio < 70 ? 2 : punteggio < 90 ? 3 : 4; }

  /** v0.57 (A16): UNICA fonte della ritenzione desiderata (carte, appunti, pianificatore).
   *  Ordine: scelta manuale → profilo cognitivo (Dominio) → minimo richiesto dal chiamante (es. livello
   *  d'intensità del piano) → 0,95 nei 14 giorni prima di un esame. Sempre in [0,50; 0,99]. */
  function ritenzione(giorno: string, minimo = 0): number {
    const base = Math.max(imp().ritenzione || Dominio.ritenzioneProfilo(), minimo);   // v0.52: senza scelta manuale, la ritenzione del profilo (proprietario: 0,90 come prima)
    const vicino = Stato.tutti<Esame>('esame').some(e => { const g = giorni(giorno, e.data); return g >= 0 && g <= 14; });
    return lim(vicino ? Math.max(base, 0.95) : base, 0.5, 0.99);
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
    for (const pp of Studio.pianiAttivi()) {
      if (pp.modo === 'raffinamento') continue;
      for (const g of pp.giorni) for (const v of g.voci) if (v.k === k) piano = Studio.dataVoce(v, g, pp.id);
      if (!piano) for (const c of pp.copertura || []) {
        const mm = /(\d{2})\/(\d{2})/.exec(c.k === k ? c.quando : '');
        if (mm) { const d = new Date(); piano = d.getFullYear() + '-' + mm[2] + '-' + mm[1]; break; }
      }
    }
    return piano && piano < ultima ? piano : ultima;
  }
  /** Voto medio delle prioritarie con punteggio; null se nessuna ne ha (solo esposizione, §4-F). */
  function votoMedio(k: string): number | null {
    const t = Studio.trovaSotto(k); if (!t) return null;
    const pt = Studio.schedeDi(t.sub).filter(x => x.tipo === 'P').map(x => (Studio.prog(x.id) || {} as Progresso).punteggio).filter(v => v != null) as number[];
    return pt.length ? voto(pt.reduce((a, b) => a + b, 0) / pt.length) : null;
  }
  function salvaStato(k: string, base: MemoriaPrima | null, g: number, giorno: string, log: [string, number][], scheda?: string): void {
    const verificato = !!(base && base.ultimo && !base.esposto);   // dopo una sola esposizione il primo voto vero riparte da zero
    const t = verificato ? giorni(base!.ultimo!, giorno) : 0;
    const st = passo(verificato ? { d: base!.d, s: base!.s } : null, g, t);
    const prec = (mem(k) || {} as any).schede as string[] | undefined;
    const m: MemoriaV & { schede?: string[] } = {
      id: 'mem-sub-' + k, type: 'memoria', updatedAt: 0, er: 'sub:' + k, d: st.d, s: st.s,
      due: piu(giorno, intervallo(st.s, ritenzione(giorno))), ultimo: giorno,
      n: (base ? base.n : 0) + 1, lapsi: (base ? base.lapsi : 0) + (verificato && g === 1 ? 1 : 0),
      log: log.slice(-50), prima: base || undefined,
      schede: scheda ? (prec || []).concat([scheda]).slice(-30) : prec,   // schede usate per i ripassi (rotazione)
    };
    Stato.salva(m, true);
  }
  function mem(k: string): MemoriaV | undefined { const m = Stato.prendi<MemoriaV>('mem-sub-' + k); return m && !m.deleted ? m : undefined; }

  /** Primo ingresso nei ripassi (quando le prioritarie sono tutte fatte) o ricalcolo dell'apprendimento.
   *  Senza alcun punteggio: «esposto», log con voto 0 (= nessun voto), primo controllo il giorno dopo. */
  function apprendi(k: string): void {
    const giorno = dataApprendimento(k); if (!giorno) return;
    const g = votoMedio(k);
    if (g != null) { salvaStato(k, null, g, giorno, [[giorno, g]]); return; }
    const st = Fsrs.esposizione(), mm = mem(k) as (MemoriaV & { schede?: string[] }) | undefined, prec = mm ? mm.schede : undefined;
    const m: MemoriaV & { schede?: string[] } = {
      id: 'mem-sub-' + k, type: 'memoria', updatedAt: 0, er: 'sub:' + k, d: st.d, s: st.s,
      due: piu(giorno, 1), ultimo: giorno, n: 1, lapsi: 0, log: [[giorno, 0]], esposto: true, schede: prec,
    };
    Stato.salva(m, true);
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
    salvaStato(k, { d: m.d, s: m.s, due: m.due, ultimo: m.ultimo, n: m.n, lapsi: m.lapsi, esposto: m.esposto }, g, giorno, ((m.log || []) as [string, number][]).concat([[giorno, g]]), id);
  }

  /** Crea le memorie mancanti dei sotto-step completati (prima installazione o dati arrivati dalla sync). */
  function inizializza(): number {
    let n = 0;
    for (const pk of Studio.pkStep()) for (const mat of pk.materie) for (const sub of mat.sottostep)
      if (!mem(sub.k) && Studio.stepFatto(sub.k)) { apprendi(sub.k); n++; }
    return n;
  }

  /** Probabilità di ricordare oggi un sotto-step (0–1); null se mai verificato (solo esposto). */
  function ricordo(k: string, giorno = ymd(new Date())): number | null {
    const m = mem(k); if (!m || !m.ultimo || m.esposto) return null;
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
      .map(m => ({ m, k: m.er.slice(4), r: recuperabilita(Math.max(0, giorni(m.ultimo!, giorno)), m.s), esposto: !!m.esposto }))
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

