// 07-ripianifica.ts — Ripianifica gli step in ritardo del piano principale (F5 ridotta, v0.10).
//
// Gli step non completati con data passata vengono spostati in avanti con Studio.sposta(): i progressi
// non cambiano mai, cambia solo il giorno (record 'spostamento'). Due modi, scelti nell'anteprima:
//  - "prima possibile": il primo giorno utile con meno di 3 step;
//  - "giorni leggeri": il giorno utile con meno step (a parità, il più vicino).
// Giorni utili: da domani all'ultimo giorno prima della chiusura della teoria; esclusi simulazioni,
// verifica, chiusura, sprint, riposo. Le "Riserva" accettano al massimo 2 step, gli altri 3.

const Ripianifica = (() => {
  const VIETATI = /^(SIM|VERIFICA|CHIUSURA|SPRINT|RIPOSO|FINALE)/;   // v0.19: anche i giorni finali dei piani generati
  const piu = (k: string, n: number) => { const d = daDt(k); d.setDate(d.getDate() + n); return ymd(d); };

  /** Step in ritardo del piano principale, nell'ordine del piano. */
  function inRitardo(oggiK = ymd(new Date()), p: PkPiano | null = Studio.pkPiano()): { k: string; t: string; da: string }[] {
    if (!p || (p.modo === 'raffinamento' && !/^gen-/.test(p.id))) return [];
    const out: { k: string; t: string; da: string }[] = [];
    for (const g of p.giorni) for (const v of g.voci) {
      const d = Studio.dataVoce(v, g, p.id);
      if (!v.speciale && d < oggiK && !Studio.stepFatto(v.k, p)) out.push({ k: v.k, t: v.t, da: d });
    }
    return out;
  }

  /** Giorni utili con il loro carico attuale (step non speciali che cadono quel giorno). */
  function giorniUtili(oggiK: string, p: PkPiano | null = Studio.pkPiano()): { data: string; carico: number; max: number }[] {
    if (!p) return [];
    const cap = (p as any).capienza || 3;
    const fine = (p.giorni.find(g => g.voci.some(v => /^CHIUSURA/.test(v.k))) || p.giorni[p.giorni.length - 1]).data;
    const carico: Record<string, number> = {}, tipo: Record<string, string> = {};
    for (const g of p.giorni) for (const v of g.voci) {
      const d = Studio.dataVoce(v, g, p.id);
      if (v.speciale) { if (g.data === d) tipo[d] = VIETATI.test(v.k) ? 'no' : (tipo[d] || 'riserva'); }
      else carico[d] = (carico[d] || 0) + 1;
    }
    const out: { data: string; carico: number; max: number }[] = [];
    for (let d = piu(oggiK, 1); d < fine; d = piu(d, 1)) {
      if (tipo[d] === 'no') continue;
      out.push({ data: d, carico: carico[d] || 0, max: tipo[d] === 'riserva' ? Math.min(2, cap) : cap });
    }
    return out;
  }

  /** Proposta: per ogni step in ritardo, il nuovo giorno (null se non c'è posto prima della chiusura). */
  function proponi(modo: 'presto' | 'leggeri', oggiK = ymd(new Date()), p: PkPiano | null = Studio.pkPiano()): { k: string; t: string; da: string; a: string | null }[] {
    const giorni = giorniUtili(oggiK, p);
    return inRitardo(oggiK, p).map(x => {
      const liberi = giorni.filter(g => g.carico < g.max);
      let scelto = liberi[0];
      if (modo === 'leggeri' && liberi.length) scelto = liberi.reduce((a, b) => b.carico < a.carico ? b : a);
      if (scelto) scelto.carico++;
      return { ...x, a: scelto ? scelto.data : null };
    });
  }

  function applica(prop: { k: string; a: string | null }[], p: PkPiano = Studio.pkPiano()!): () => void {
    const prima = prop.map(x => ({ k: x.k, sp: Stato.prendi<Rec>(p.id === 'piano' ? 'sp-' + x.k : 'sp-' + p.id + '-' + x.k) }));
    for (const x of prop) if (x.a) Studio.sposta(x.k, x.a, p.id);
    return () => { for (const x of prima) Studio.sposta(x.k, x.sp && !x.sp.deleted ? (x.sp as any).data : null, p.id); };
  }

  return { inRitardo, giorniUtili, proponi, applica };
})();

const giornoBreve = (k: string) => { const d = daDt(k); return ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'][d.getDay()] + ' ' + k.slice(8, 10) + '/' + k.slice(5, 7); };

/** Foglio con anteprima e conferma. */
function apriRipianifica(piano?: PkPiano): void {
  const pp = piano && (piano as any).giorni ? piano : Studio.pkPiano();
  let modo: 'presto' | 'leggeri' = 'leggeri';
  const corpo = h('div.modulo');
  const disegnaProp = () => {
    svuota(corpo);
    const prop = Ripianifica.proponi(modo, ymd(new Date()), pp);
    [
      h('div.segmenti', { role: 'tablist' },
        h('button' + (modo === 'leggeri' ? '.attivo' : ''), { onclick: () => { modo = 'leggeri'; disegnaProp(); } }, 'Giorni leggeri'),
        h('button' + (modo === 'presto' ? '.attivo' : ''), { onclick: () => { modo = 'presto'; disegnaProp(); } }, 'Prima possibile')),
      h('div.tenue.piccolo', null, modo === 'leggeri'
        ? 'Mette gli step dove il piano è più leggero (giorni con meno step, Riserve): giornate più sostenibili.'
        : 'Recupera subito: il primo giorno con meno di 3 step. Si torna in pari prima, ma con giornate più piene.'),
      h('div.gruppo', null, prop.length ? prop.map(x => h('div.widget-riga', null,
        h('span.nome', null, Studio.etichetta(x.k), h('div.tenue.piccolo', null, x.t)),
        h('span', { style: { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } }, giornoBreve(x.da) + ' → ', x.a ? h('b', null, giornoBreve(x.a)) : h('b', { style: { color: 'var(--rosso)' } }, 'nessun posto')))) : h('div.vuoto', null, 'Nessuno step in ritardo: sei in pari. 🎉')),
      prop.some(x => !x.a) ? h('div.tenue.piccolo', { style: { color: 'var(--rosso)' } }, 'Alcuni step non trovano posto prima della chiusura: vanno fatti in un giorno di sprint o accorpati.') : null,
      h('div.tenue.piccolo', null, 'Cambia solo il giorno: le schede fatte e i punteggi restano.'),
    ].forEach(el => { if (el) corpo.appendChild(el); });
    (corpo as any)._prop = prop;
  };
  disegnaProp();
  foglio({ titolo: 'Ripianifica i ritardi', corpo, etichettaSalva: 'Conferma', salva: () => {
    const prop = (corpo as any)._prop as ReturnType<typeof Ripianifica.proponi>;
    if (!prop.length) return;
    const annulla = Ripianifica.applica(prop, pp!);
    avviso('Spostati ' + prop.filter(x => x.a).length + ' step · tocca per annullare', 8000, () => { annulla(); avviso('Spostamenti annullati.'); });
  } });
}
