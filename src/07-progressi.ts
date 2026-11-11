// 07-progressi.ts — Punti deboli (v0.12, F6 ridotta). In Studio → Statistiche.
//
// 1) Per tipo di domanda (Sbarramento, Applicativo, Trabocchetto, Problema, Completamento…), per materia,
//    sommando i risultati letti in automatico dai quiz (Progresso.deboli) e dalle simulazioni.
// 2) Sotto-step più deboli: media dei punteggi delle prioritarie e probabilità di ricordarli oggi.

function puntiDeboli(): { gruppi: { chiave: string; nome: string; colore: string; righe: { tipo: string; ok: number; tot: number }[] }[]; quiz: number } {
  const acc: Record<string, Record<string, [number, number]>> = {};
  let quiz = 0;
  const somma = (g: string, l: [string, number, number][]) => {
    acc[g] = acc[g] || {};
    for (const [tipo, ok, tot] of l) { if (!tipo || !tot) continue; const r = acc[g][tipo] || (acc[g][tipo] = [0, 0]); r[0] += ok; r[1] += tot; }
  };
  for (const p of Stato.tutti<Progresso>('progresso')) if (p.deboli && p.deboli.length) { quiz++; somma(materiaDi(p.id.slice(5)) || '?', p.deboli); }
  for (const s of Stato.tutti<Simulazione>('simulazione')) if (s.deboli && s.deboli.length) { quiz++; somma('SIM', s.deboli); }
  const gruppi = Object.keys(acc).sort((a, b) => a === 'SIM' ? 1 : b === 'SIM' ? -1 : a.localeCompare(b)).map(g => ({
    chiave: g, nome: g === 'SIM' ? 'Simulazioni' : nomeMateria(g), colore: g === 'SIM' ? 'var(--accento)' : coloreMateria(g),
    righe: Object.entries(acc[g]).map(([tipo, [ok, tot]]) => ({ tipo, ok, tot })).sort((a, b) => a.ok / a.tot - b.ok / b.tot),
  }));
  return { gruppi, quiz };
}

function sezionePuntiDeboli(): HTMLElement {
  const { gruppi, quiz } = puntiDeboli();
  const riga = (r: { tipo: string; ok: number; tot: number }, primo: boolean, colore: string) => {
    const pc = Math.round(r.ok * 100 / r.tot);
    return h('div.debole-riga', null,
      h('span.debole-tipo', null, r.tipo, primo && pc < 85 ? h('span.debole-tag', null, 'più debole') : null),
      h('span.debole-barra', null, h('span', { style: { width: pc + '%', background: pc < 70 ? coloreRicordo(0.6) : pc < 85 ? coloreRicordo(0.8) : colore } })),
      h('span.debole-n', null, pc + '%', h('small', null, ' ' + r.ok + '/' + r.tot)));
  };
  return h('section.card', null, h('h2.card-titolo', null, 'Punti deboli per tipo di domanda'),
    quiz ? h('div.tenue.piccolo', null, 'Da ' + quiz + (quiz === 1 ? ' quiz letto' : ' quiz letti') + ' in automatico. Dove la percentuale è bassa, allenati su quel tipo: rileggi la «Correzione» e la «Spiegazione» delle domande sbagliate.')
      : h('div.tenue.piccolo', null, 'Si riempie da sola man mano che finisci i quiz dentro l\'app (i punteggi scritti a mano non contengono i tipi di domanda).'),
    gruppi.map(g => h('div.debole-gruppo', null, h('div.gruppo-titolo', { style: { color: g.colore } }, g.nome), g.righe.map((r, i) => riga(r, i === 0, g.colore)))));
}

function sezioneSottostepDeboli(): HTMLElement | null {
  const out: { k: string; titolo: string; media: number; n: number; r: number | null }[] = [];
  for (const pk of Studio.pkStep()) for (const mat of pk.materie) for (const sub of mat.sottostep) {
    const pt = Studio.schedeDi(sub).filter(x => x.tipo === 'P').map(x => Studio.prog(x.id)).filter(p => p && p.fatta && p.punteggio != null).map(p => p!.punteggio!) as number[];
    if (pt.length) out.push({ k: sub.k, titolo: sub.titolo, media: Math.round(pt.reduce((a, b) => a + b, 0) / pt.length), n: pt.length, r: Ripassi.ricordo(sub.k) });
  }
  if (!out.length) return null;
  out.sort((a, b) => a.media - b.media || (a.r ?? 1) - (b.r ?? 1));
  return h('section.card', null, h('h2.card-titolo', null, 'Sotto-step più deboli'),
    h('div.tenue.piccolo', null, 'Media dei punteggi delle prioritarie fatte; 🧠 = probabilità di ricordarlo oggi.'),
    out.slice(0, 5).map(x => h('button.voce-lista', { onclick: () => { const t = Studio.trovaSotto(x.k); if (t) { UI.studioStep = t.pk.id; UI.studioSub = x.k; UI.studioVista = 'schede'; disegna(); } } },
      h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, Studio.etichetta(x.k) + ' · ' + x.titolo),
        h('span.voce-sotto', null, 'media ', h('b', { style: { color: coloreRicordo(x.media / 100) } }, x.media + '%'), ' su ' + x.n + (x.n === 1 ? ' scheda' : ' schede') + (x.r != null ? ' · 🧠 ' + Math.round(x.r * 100) + '%' : ''))),
      icona('dx', 18))));
}
