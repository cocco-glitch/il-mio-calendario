// ============================================================
// P0.67 — quantità complessiva di quiz per microstep.
// Modulo puro: nessun DOM, stato, calendario, Drive o provider.
// ============================================================

type ModalitaQuantitaQuiz = 'auto' | 'manuale';
interface MicrostepDaCoprire {
  id: string; pagine?: number; concetti?: number; applicazioni?: number; densita?: number;
  livelliRichiesti?: number; minutiDisponibili?: number; priorita?: boolean;
}
interface RichiestaPianoQuiz {
  modalita: ModalitaQuantitaQuiz; totaleManuale?: number; massimoTotale: number;
  intensita: 1 | 2 | 3; microstep: MicrostepDaCoprire[];
}
interface QuotaMicrostepQuiz { id: string; quantita: number; motivi: string[]; }
interface PianoQuantitaQuiz { totale: number; perMicrostep: QuotaMicrostepQuiz[]; avvisi: string[]; }
interface SegnaliAdapterQuiz {
  pagine?: Record<string, number>; applicazioni?: Record<string, number>; livelliRichiesti?: Record<string, number>;
  minutiDisponibili?: Record<string, number>;
}

const PianificazioneQuiz = (() => {
  const numero = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v)) || 0));
  const ordineId = (id: string) => { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const segnale = (m: Record<string, number> | undefined, id: string) => m && Object.prototype.hasOwnProperty.call(m, id) ? m[id] : undefined;
  function daUnita(u: UnitaAI | undefined, id: string, s: SegnaliAdapterQuiz): MicrostepDaCoprire {
    const intervallo = u && u.pagine, pagineUnita = intervallo && Number.isFinite(intervallo[0]) && Number.isFinite(intervallo[1]) && intervallo[1] >= intervallo[0]
      ? Math.floor(intervallo[1] - intervallo[0] + 1) : undefined;
    return {
      id,
      pagine: segnale(s.pagine, id) ?? pagineUnita,
      concetti: u && Array.isArray(u.concettiChiave) ? u.concettiChiave.length : undefined,
      applicazioni: segnale(s.applicazioni, id),
      densita: u ? u.densita : undefined,
      livelliRichiesti: segnale(s.livelliRichiesti, id),
      minutiDisponibili: segnale(s.minutiDisponibili, id),
      priorita: u ? !!u.priorita : undefined,
    };
  }
  /** Unità del pianificatore → segnali di copertura. `minutiBase` non è tempo disponibile e non viene copiato. */
  function daUnitaAI(unita: UnitaAI[], segnali: SegnaliAdapterQuiz = {}): MicrostepDaCoprire[] {
    return (unita || []).map(u => daUnita(u, String(u.uid), segnali));
  }
  /** Piano importato → microstep unici; le schede storiche individuano la copertura, ma non ne decidono la quantità. */
  function daPianoV1(piano: PianoV1, unita: UnitaAI[] = [], segnali: SegnaliAdapterQuiz = {}): MicrostepDaCoprire[] {
    const note = new Map((unita || []).map(u => [String(u.uid), u])), ids: string[] = [], visti = new Set<string>();
    for (const b of (piano && piano.blocchi) || []) for (const c of b.copre || []) for (const valore of c.micro || []) {
      const id = String(valore || '').trim();
      if (id && !visti.has(id)) { visti.add(id); ids.push(id); }
    }
    return ids.map(id => daUnita(note.get(id), id, segnali));
  }
  function ridistribuisci(q: QuotaMicrostepQuiz[], totale: number): QuotaMicrostepQuiz[] {
    const liberi = Math.max(0, totale - q.length), somma = q.reduce((a, x) => a + x.quantita, 0) || q.length;
    const quote = q.map(x => { const esatta = liberi * x.quantita / somma; return { id: x.id, n: 1 + Math.floor(esatta), resto: esatta - Math.floor(esatta) }; });
    let mancanti = totale - quote.reduce((a, x) => a + x.n, 0);
    const ordine = quote.slice().sort((a, b) => b.resto - a.resto || ordineId(a.id) - ordineId(b.id) || a.id.localeCompare(b.id));
    for (let i = 0; i < mancanti; i++) ordine[i % ordine.length].n++;
    const perId = new Map(quote.map(x => [x.id, x.n]));
    return q.map(x => ({ ...x, quantita: perId.get(x.id) || 1, motivi: x.motivi.concat('Ridotta dal massimo globale.') }));
  }
  function automatica(x: MicrostepDaCoprire, intensita: 1 | 2 | 3): QuotaMicrostepQuiz {
    let quantita = 4; const motivi = ['Base minima di copertura.'];
    const pagine = numero(x.pagine, 1000); if (pagine) { quantita += Math.ceil(pagine / 5); motivi.push(pagine + ' pagine.'); }
    const concetti = numero(x.concetti, 200); if (concetti) { quantita += Math.ceil(concetti / 2); motivi.push(concetti + ' concetti.'); }
    const applicazioni = numero(x.applicazioni, 50); if (applicazioni) { quantita += applicazioni * 2; motivi.push(applicazioni + ' applicazioni.'); }
    const densita = numero(x.densita, 5); if (densita > 1) { quantita += (densita - 1) * 2; motivi.push('Densità ' + densita + '/5.'); }
    const livelli = numero(x.livelliRichiesti, 4); if (livelli > 1) { quantita += (livelli - 1) * 2; motivi.push(livelli + ' livelli cognitivi.'); }
    if (x.priorita) { quantita = Math.ceil(quantita * 1.2); motivi.push('Priorità nel piano.'); }
    quantita = Math.max(1, Math.round(quantita * ([0.8, 1, 1.2][intensita - 1] || 1)));
    const minuti = numero(x.minutiDisponibili, 100000);
    if (minuti) {
      const capTempo = Math.max(1, Math.floor(minuti / 2));
      if (capTempo < quantita) { quantita = capTempo; motivi.push('Copertura ridotta dal tempo disponibile: ' + minuti + ' minuti.'); }
    }
    return { id: String(x.id), quantita, motivi };
  }
  function calcola(r: RichiestaPianoQuiz): PianoQuantitaQuiz {
    const micro = (r.microstep || []).map(x => ({ ...x })), n = micro.length;
    if (!n) return { totale: 0, perMicrostep: [], avvisi: ['Nessun microstep da coprire.'] };
    const massimo = Math.max(n, Math.min(200, Math.floor(Number(r.massimoTotale)) || n));
    if (r.modalita === 'auto') {
      let perMicrostep = micro.map(x => automatica(x, r.intensita));
      const stimato = perMicrostep.reduce((a, x) => a + x.quantita, 0), tagliato = stimato > massimo;
      if (tagliato) perMicrostep = ridistribuisci(perMicrostep, massimo);
      const ridotti = perMicrostep.filter(x => x.motivi.some(m => /^Copertura ridotta/.test(m))).map(x => x.id);
      return { totale: perMicrostep.reduce((a, x) => a + x.quantita, 0), perMicrostep,
        avvisi: (ridotti.length ? ['Tempo insufficiente: copertura ridotta per ' + ridotti.join(', ') + '.'] : [])
          .concat(tagliato ? ['Stima di ' + stimato + ' domande ridotta al massimo consentito di ' + massimo + '.'] : []) };
    }
    const richiesto = Math.floor(Number(r.totaleManuale)) || n;
    const totale = Math.max(n, Math.min(massimo, richiesto)), base = Math.floor(totale / n), resto = totale % n;
    const extra = new Set(micro.slice().sort((a, b) => ordineId(String(a.id)) - ordineId(String(b.id)) || String(a.id).localeCompare(String(b.id))).slice(0, resto).map(x => String(x.id)));
    const avvisi = richiesto > massimo ? ['Totale ridotto al massimo consentito di ' + massimo + ' domande.']
      : richiesto < n ? ['Totale aumentato a ' + n + ': serve almeno una domanda per microstep.'] : [];
    return {
      totale,
      perMicrostep: micro.map(x => ({ id: String(x.id), quantita: base + (extra.has(String(x.id)) ? 1 : 0), motivi: ['Distribuzione del totale scelto.'] })),
      avvisi,
    };
  }
  return { calcola, daUnitaAI, daPianoV1 };
})();
