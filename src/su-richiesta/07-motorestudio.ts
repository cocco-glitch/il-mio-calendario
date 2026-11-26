// 07-motorestudio.ts — motore unificato, blocco 4 (N1): composizione PURA della sessione di studio.
//
// Livelli lessicografici (decisione utente 26/11), un solo indicatore dentro ogni livello:
//  1 illusione di competenza recente · 2 ripasso FSRS scaduto · 3 prerequisito non verificato di un'unità di oggi
//  4 errori aperti · 5 contenuto nuovo del piano · 6 consolidamento (stabilità < 21 g, non ancora scaduto).
// Spareggio stabile: livello → indicatore (decrescente) → durata minore → id.
// Tempo: il totale (lavoro + pause + richiamo finale) non supera mai i minuti scelti. Pause e richiamo fanno da margine,
//   che vale almeno il 10%: lavoro ≤ minuti − max(5 + pause, ⌈10%⌉); sotto i 15 min (niente richiamo) lavoro ≤ 90%. Ciò che non entra va in `esclusi` col motivo; mai comprimere un'attività.
// Obiettivo: breve (< 15 min) = niente lettura · consolidamento = livelli 1, 2, 4, 6 · ordinaria = tutto.
// Nessuna lettura di Stato, DOM o storage: i candidati arrivano dall'istantanea (07-studiaoraui.ts).

type ObiettivoS = 'breve' | 'ordinaria' | 'consolidamento' | 'auto';
type MetodoS = 'fonte' | 'quiz' | 'carte' | 'appunto' | 'richiamo' | 'errori' | 'diagnostico';
interface PrefMetodi { quiz: boolean; carte: boolean; appunti: boolean; }
interface CandidatoS { id: string; livello: 1 | 2 | 3 | 4 | 5 | 6; ind: number; metodo: MetodoS; min: number; motivo: string; voce: VoceSessione;
  /** tetti di prima: ripassi dei sotto-step ≤ ~40% del tempo, appunti al massimo 3 */ gruppo?: 'step' | 'appunti'; }
interface PropostaS { obiettivo: Exclude<ObiettivoS, 'auto'>; minuti: number; voci: VoceSessione[]; esclusi: { titolo: string; perche: string }[]; margine: number; }
interface OsservazioneS { metodo: MetodoS; min: number; sec: number; }

const MotoreStudio = (() => {
  const PREF: Record<MetodoS, keyof PrefMetodi | null> = { fonte: null, richiamo: null, quiz: 'quiz', errori: 'quiz', diagnostico: 'quiz', carte: 'carte', appunto: 'appunti' };
  const CONSOLIDA = [1, 2, 4, 6], FINALE = 5, PAUSA = 5, BLOCCO = 25, MIN_PASSO = 10;
  const tra = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

  function obiettivo(o: ObiettivoS, minuti: number): PropostaS['obiettivo'] { return o !== 'auto' ? o : minuti < 15 ? 'breve' : 'ordinaria'; }
  const attivo = (m: MetodoS, p: PrefMetodi) => { const k = PREF[m]; return !k || p[k] !== false; };
  function ordina(c: CandidatoS[]): CandidatoS[] {
    return c.slice().sort((a, b) => a.livello - b.livello || b.ind - a.ind || a.min - b.min || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  /** Fattore di durata per metodo: media mobile esponenziale (α 0,3) di secondi osservati / minuti previsti, in [0,5; 2]. */
  function fattori(oss: OsservazioneS[]): Partial<Record<MetodoS, number>> {
    const f: Partial<Record<MetodoS, number>> = {};
    for (const o of oss) {
      if (!(o.min > 0) || !(o.sec > 0)) continue;
      const r = tra(o.sec / 60 / o.min, 0.5, 2), p = f[o.metodo];
      f[o.metodo] = p === undefined ? r : Math.round((0.3 * r + 0.7 * p) * 100) / 100;
    }
    return f;
  }
  /** Varietà: tre voci di fila con lo stesso metodo → si anticipa un'alternativa dello stesso livello (regola, non peso). */
  function varia(v: CandidatoS[]): CandidatoS[] {
    const out = v.slice();
    for (let i = 2; i < out.length; i++) {
      if (out[i].metodo !== out[i - 1].metodo || out[i].metodo !== out[i - 2].metodo) continue;
      const j = out.findIndex((x, n) => n > i && x.livello === out[i].livello && x.metodo !== out[i].metodo);
      if (j > 0) { const x = out[j]; out.splice(j, 1); out.splice(i, 0, x); }
    }
    return out;
  }

  function componi(o: ObiettivoS, minuti: number, pref: PrefMetodi, cand: CandidatoS[], fatt: Partial<Record<MetodoS, number>> = {}): PropostaS {
    const ob = obiettivo(o, minuti), finale = minuti >= 15 ? FINALE : 0;
    const pause = minuti >= 50 ? PAUSA * Math.floor((minuti - finale) / 30) : 0;   // al più una ogni 25 min di lavoro, mai in coda
    const budget = finale ? Math.max(0, minuti - Math.max(finale + pause, Math.ceil(minuti * 0.1))) : Math.floor(minuti * 0.9);
    const esclusi: PropostaS['esclusi'] = [], dentro: CandidatoS[] = [], visti = new Set<string>();
    let resto = budget, tettoStep = Math.max(MIN_PASSO, Math.round(minuti * 0.4)), nAp = 0;
    for (const c0 of ordina(cand)) {
      if (visti.has(c0.id)) continue; visti.add(c0.id);
      const c = { ...c0, min: Math.max(1, Math.round(c0.min * (fatt[c0.metodo] || 1))) }, no = (perche: string) => esclusi.push({ titolo: c.voce.titolo, perche });
      if (!attivo(c.metodo, pref)) { no('metodo disattivato'); continue; }
      if (ob === 'consolidamento' && !CONSOLIDA.includes(c.livello)) { no('consolidamento: niente contenuto nuovo'); continue; }
      if (ob === 'breve' && c.metodo === 'fonte') { no('serve leggere: non entra in una sessione breve'); continue; }
      if (c.gruppo === 'step' && tettoStep < c.min) { no('ripassi dei sotto-step già al 40% del tempo'); continue; }
      if (c.gruppo === 'appunti' && nAp >= 3) { no('già 3 appunti in questa sessione'); continue; }
      if (c.min > resto) { no('non entra nel tempo (' + c.min + ' min)'); continue; }
      dentro.push(c); resto -= c.min;
      if (c.gruppo === 'step') tettoStep -= c.min;
      if (c.gruppo === 'appunti') nAp++;
    }
    const voci: VoceSessione[] = []; let acc = 0;
    varia(dentro).forEach((c, i, a) => {
      voci.push({ ...c.voce, min: c.min, metodo: c.metodo, livello: c.livello, motivo: c.motivo });
      acc += c.min;
      if (acc >= BLOCCO && i < a.length - 1 && minuti >= 50) { voci.push({ tipo: 'pausa', titolo: '☕ Pausa', sotto: 'Alzati, bevi, niente social: il cervello consolida', min: PAUSA }); acc = 0; }
    });
    if (finale) voci.push({ tipo: 'richiamo', titolo: '🔁 Richiamo finale', sotto: 'Senza guardare: scrivi i 3 concetti chiave di oggi e una domanda d\'esame che ti faresti', min: FINALE, metodo: 'richiamo' });
    return { obiettivo: ob, minuti, voci, esclusi, margine: minuti - voci.reduce((x, v) => x + v.min, 0) };
  }
  return { componi, ordina, fattori, obiettivo, attivo, varia };
})();
