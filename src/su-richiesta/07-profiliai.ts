// ============================================================
// v0.64 — «Qualsiasi AI»: logica pura (nessuno Stato, DOM, rete).
//   Profili delle piattaforme AI, divisione di uno step in parti k/N con gli intervalli di ID decisi dall'app,
//   mix dei tipi di domanda per archetipo e tetto del testo del PDF incollato nel prompt.
//   Confine AI/app: conteggi, intervalli e tagli li calcola l'app; l'AI riceve solo numeri già pronti.
//   Testato da test/profiliai.mjs.
// ============================================================

/** Una parte del prompt: domande da..a (1-based, estremi inclusi) della parte k di N. */
interface ParteAI { k: number; N: number; da: number; a: number; }

/** Una pagina del PDF (numero PDF) con il suo testo; vuota = nessun testo estraibile (scansione). */
interface PaginaTesto { n: number; testo: string; vuota?: boolean; }
/** Le pagine tenute dal tetto, i loro caratteri e quante pagine sono rimaste fuori. */
interface TestoTagliato { pagine: PaginaTesto[]; caratteri: number; escluse: number; vuote: number; }

type TipoV4 = 'mcq' | 'completamento' | 'ordinamento' | 'aperta' | 'codice';
type MixTipi = Record<TipoV4, number>;

/** Ciò che l'app sa della piattaforma AI scelta: quanto regge, se legge file, quanto è affidabile col JSON. */
interface ProfiloAI {
  id: string; nome: string; contesto: 'piccolo' | 'medio' | 'grande'; file: boolean; json: 'alta' | 'media' | 'bassa';
  /** Domande al massimo per risposta (oltre: parti k/N). */ perRisposta: number;
  /** Tetto del testo del PDF incollato nel prompt; 0 = nessun tetto (il PDF si allega). */ maxCaratteri: number;
}

const ProfiliAI = (() => {
  const grande = (id: string, nome: string): ProfiloAI => ({ id, nome, contesto: 'grande', file: true, json: 'alta', perRisposta: 18, maxCaratteri: 0 });
  const COPILOT: Omit<ProfiloAI, 'id' | 'nome'> = { contesto: 'medio', file: false, json: 'media', perRisposta: 10, maxCaratteri: 40000 };
  /** Preset nell'ordine del selettore «Quale AI usi?» (spec v0.64 §A). */
  const PRESET: ReadonlyArray<ProfiloAI> = [
    grande('gemini', 'Gemini'), grande('chatgpt', 'ChatGPT'), grande('claude', 'Claude'),
    { id: 'copilot', nome: 'Copilot', ...COPILOT },
    { id: 'locale', nome: 'AI locale', contesto: 'piccolo', file: false, json: 'bassa', perRisposta: 6, maxCaratteri: 12000 },
    { id: 'personalizzato', nome: 'Personalizzato', ...COPILOT },
  ];
  /** Copia del preset; id sconosciuto → Gemini, il prompt di v0.63. */
  const preset = (id: string): ProfiloAI => ({ ...(PRESET.find(p => p.id === id) || PRESET[0]) });

  const TIPI: TipoV4[] = ['mcq', 'completamento', 'ordinamento', 'aperta', 'codice'];
  /** Percentuali proposte per archetipo (spec v0.64 §D). */
  const MIX: Record<string, MixTipi> = {
    scienze_sperimentali: { mcq: 70, completamento: 15, ordinamento: 15, aperta: 0, codice: 0 },
    stem_calcolo: { mcq: 60, completamento: 25, ordinamento: 15, aperta: 0, codice: 0 },
    informatica_coding: { mcq: 50, completamento: 10, ordinamento: 10, aperta: 0, codice: 30 },
    umanistico_storico: { mcq: 50, completamento: 10, ordinamento: 10, aperta: 30, codice: 0 },
    lingue_letteratura: { mcq: 40, completamento: 40, ordinamento: 10, aperta: 10, codice: 0 },
    giuridico_economico: { mcq: 60, completamento: 10, ordinamento: 10, aperta: 20, codice: 0 },
  };

  /** Quante domande per tipo, su n: resti maggiori, a parità vince l'ordine di TIPI (stabile). */
  function mix(archetipo: string, proprietario: boolean, n: number): MixTipi {
    const SOLO_MCQ: MixTipi = { mcq: 100, completamento: 0, ordinamento: 0, aperta: 0, codice: 0 };
    const perc = proprietario || !Object.prototype.hasOwnProperty.call(MIX, archetipo) ? SOLO_MCQ : MIX[archetipo];
    const quote = TIPI.map(tipo => perc[tipo] * n / 100);
    const out = {} as MixTipi;
    TIPI.forEach((tipo, i) => { out[tipo] = Math.floor(quote[i]); });
    let resto = n - TIPI.reduce((s, tipo) => s + out[tipo], 0);
    const ordine = TIPI.map((tipo, i) => ({ tipo, r: quote[i] - out[tipo], i })).sort((x, y) => y.r - x.r || x.i - y.i);
    for (const o of ordine) { if (resto <= 0) break; if (o.r > 0) { out[o.tipo]++; resto--; } }
    return out;
  }

  /** Divide n domande in parti da al massimo perRisposta, senza buchi né sovrapposizioni. */
  function parti(n: number, perRisposta: number): ParteAI[] {
    const passo = perRisposta >= 1 ? Math.floor(perRisposta) : Math.max(n, 1);   // profilo vuoto → una parte sola
    const N = n > 0 ? Math.ceil(n / passo) : 0, out: ParteAI[] = [];
    for (let k = 1; k <= N; k++) out.push({ k, N, da: (k - 1) * passo + 1, a: Math.min(n, k * passo) });
    return out;
  }

  /** Tiene le pagine intere finché il totale resta entro max; dichiara quante ne ha incluse e quante ne ha tolte. */
  function tetto(pagine: PaginaTesto[], max: number): TestoTagliato {
    const tenute: PaginaTesto[] = [];
    let caratteri = 0, escluse = 0, vuote = 0;
    for (const p of pagine) {
      if (p.vuota || !p.testo.trim()) { vuote++; continue; }
      if (escluse || (max > 0 && caratteri + p.testo.length > max)) { escluse++; continue; }
      tenute.push(p); caratteri += p.testo.length;
    }
    return { pagine: tenute, caratteri, escluse, vuote };
  }

  /** Pagine PDF da..a (1-based, incluse) dal testo estratto; pagina senza testo (scansione o non letta) → vuota. */
  function pagine(testi: Map<number, string>, da: number, a: number): PaginaTesto[] {
    const out: PaginaTesto[] = [];
    for (let n = Math.max(1, da); n <= a; n++) {
      const testo = (testi.get(n) || '').trim();
      out.push(testo ? { n, testo } : { n, testo: '', vuota: true });
    }
    return out;
  }

  /** Tipo di ogni posizione della scheda (1ª = indice 0): i tipi in blocchi nell'ordine di TIPI, così aperte e codice cadono in fondo (L3–L4). */
  const sequenza = (m: MixTipi): TipoV4[] => TIPI.flatMap(tipo => Array.from({ length: Math.max(0, Math.floor(m[tipo] || 0)) }, () => tipo));

  return { PRESET, preset, parti, mix, tetto, pagine, sequenza };
})();
