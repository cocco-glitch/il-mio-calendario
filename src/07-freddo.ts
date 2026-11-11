// 07-freddo.ts — Prova a freddo (v0.14, tattica T6 "effetto pretest").
//
// Prima di studiare uno step nuovo (nessuna prioritaria fatta) si fa la PRIMA scheda prioritaria
// senza aver letto niente. Il risultato NON è il punteggio della scheda, non entra nei ripassi né nelle
// statistiche: si salva a parte (record 'pretest', id 'pre-<k>'). Provare a rispondere prima, anche
// sbagliando, migliora quanto si impara dopo. Quando poi la stessa scheda si fa "sul serio", l'avviso
// mostra il confronto (es. "prova a freddo 40% → 85%").

interface Pretest extends Rec { type: 'pretest'; k: string; schedaId: string; data: string; pct: number; giuste?: number | null; totale?: number | null; }

const Freddo = {
  rec(k: string): Pretest | undefined { const r = Stato.prendi<Pretest>('pre-' + k); return r && !r.deleted ? r : undefined; },
  /** Lo step si presta alla prova a freddo: ha prioritarie e nessuna è ancora fatta. */
  possibile(k: string): boolean {
    const t = Studio.trovaSotto(k); if (!t) return false;
    const P = Studio.schedeDi(t.sub).filter(x => x.tipo === 'P');
    return P.length > 0 && !P.some(x => Studio.fatta(x.id));
  },
  scheda(k: string): SchedaS | null { const t = Studio.trovaSotto(k); return t ? Studio.schedeDi(t.sub).find(x => x.tipo === 'P') || null : null; },
  /** Testo di confronto per l'avviso quando la scheda della prova a freddo viene fatta sul serio. */
  confronto(schedaId: string, pct: number): string {
    const t = trovaScheda(schedaId); const r = t ? Freddo.rec(t.k) : undefined;
    if (!r || r.schedaId !== schedaId) return '';
    const d = pct - r.pct;
    return ' · a freddo era ' + r.pct + '% (' + (d >= 0 ? '+' : '') + d + ')';
  },
};

async function avviaProvaAFreddo(k: string): Promise<void> {
  const t = Studio.trovaSotto(k), s = Freddo.scheda(k);
  if (!t || !s) return;
  const micro = (t.sub.microstep.find(m => m.schede.some(x => x.id === s.id)) || { n: '' }).n;
  const ok = await chiedi('Prova a freddo · ' + Studio.etichetta(k), [{ testo: 'Inizia la prova', valore: 'si' }],
    'Fai la scheda «' + s.titolo + '» SENZA aver studiato: rispondi d\'istinto, anche a caso. Il risultato non conta e non cambia i tuoi punteggi. Serve a preparare il cervello: dopo, studiando, le risposte giuste si fissano meglio.');
  if (!ok) return;
  apriQuiz(t.pk, t.mat.m, micro, s, d => {
    if (d.errori) return;
    const r: Pretest = { id: 'pre-' + k, type: 'pretest', updatedAt: 0, k, schedaId: s.id, data: ymd(new Date()), pct: d.pct, giuste: d.giuste, totale: d.totale };
    Stato.salva(r);
    avviso('🧊 Prova a freddo: ' + d.pct + '%. Non conta: ora studia lo step. Alla fine rifai questa scheda e guarda quanto sei migliorato.', 10000);
  });
}

/** Pulsanti "Prova a freddo" per gli step di oggi non ancora iniziati (riquadro Studio di oggi). */
function bottoniFreddo(voci: VoceGiorno[]): HTMLElement | null {
  const ks = voci.filter(x => !x.v.speciale && x.p.modo !== 'raffinamento' && Freddo.possibile(x.v.k) && !Freddo.rec(x.v.k)).map(x => x.v.k);
  if (!ks.length) return null;
  return h('div', null, h('div.tenue.piccolo', { style: { margin: '8px 0 4px' } }, 'Prima di leggere: 5–10 min a freddo sulla prima scheda (non conta, aiuta a ricordare).'),
    h('div.chips', null, ks.map(k => h('button.chip', { onclick: () => avviaProvaAFreddo(k) }, '🧊 Prova a freddo · ' + Studio.etichetta(k)))));
}

/** Riga nella scheda del sotto-step: pulsante o risultato. */
function rigaFreddo(k: string): HTMLElement | null {
  const r = Freddo.rec(k);
  if (r) return h('div.tenue.piccolo', null, '🧊 Prova a freddo del ' + r.data.slice(8) + '/' + r.data.slice(5, 7) + ': ' + r.pct + '%' + (r.giuste != null ? ' (' + r.giuste + '/' + r.totale + ')' : ''));
  if (!Freddo.possibile(k)) return null;
  return h('div.bottoni', null, h('button.btn.neutro', { onclick: () => avviaProvaAFreddo(k) }, '🧊 Prova a freddo (prima di studiare)'));
}
