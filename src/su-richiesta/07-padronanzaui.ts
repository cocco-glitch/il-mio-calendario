// 07-padronanzaui.ts — motore unificato, blocco 7: vista «Padronanza per concetto» in Studio › Statistiche.
//
// Decisione utente 26/11 (Sessione 8): per materia «N di M concetti consolidati» con barra a 5 stati, poi scheda → concetti con lo
// stato e il MOTIVO, e un'azione (rifai il quiz). Scouting: le dashboard da sole non migliorano il rendimento (revisione di 38 studi,
// Kaliisa & Saqr 2023) [A]; un'autovalutazione accurata sì (Dunlosky & Rawson 2012) [B] → testo onesto + azione, niente percentuali
// inventate: un concetto mai verificato resta «non verificato», non 0%. Solo lettura: la vista non scrive nulla.

const PadronanzaUI = (() => {
  const VARI: StatoConcetto[] = ['da_studiare', 'da_consolidare', 'in_consolidamento', 'consolidato', 'non_verificato'];
  const COL: Record<StatoConcetto, string> = {
    da_studiare: 'var(--rosso)', da_consolidare: 'color-mix(in srgb, var(--rosso) 45%, var(--sup2))',
    in_consolidamento: 'color-mix(in srgb, var(--accento) 45%, var(--sup2))', consolidato: 'var(--accento)', non_verificato: 'var(--linea)',
  };
  const plur = (s: StatoConcetto, n: number) => n === 1 ? Concetti.NOMI[s] : s === 'consolidato' ? 'consolidati' : s === 'non_verificato' ? 'non verificati' : Concetti.NOMI[s];
  const ICO: Record<StatoConcetto, string> = { da_studiare: '●', da_consolidare: '◐', in_consolidamento: '◑', consolidato: '✔', non_verificato: '○' };

  function barra5(n: Record<StatoConcetto, number>, tot: number, nome: string): HTMLElement {
    const testo = VARI.filter(s => n[s]).map(s => n[s] + ' ' + plur(s, n[s])).join(', ');
    return h('div.pad-barra', { role: 'img', 'aria-label': nome + ': ' + testo },
      VARI.filter(s => n[s]).map(s => h('span', { style: { width: (n[s] / Math.max(1, tot)) * 100 + '%', background: COL[s] }, title: n[s] + ' ' + plur(s, n[s]) })));
  }
  function apriQuiz(sk: string): void {
    const t = trovaScheda(sk); if (!t) { avviso('Scheda non trovata nei corsi caricati.'); return; }
    void QuizApp.apri(t.pk, t.m, t.micro, t.s);
  }
  /** Riempie la sezione (il guscio lo crea vistaStatistiche nel bundle principale). */
  function riempi(el: HTMLElement): void {
    const g = ymd(new Date()), righe = Concetti.riepilogo(Stato.tutti<MemoriaCon>('memoria'), g);
    svuota(el);
    el.appendChild(h('h2.card-titolo', null, '🧩 Padronanza per concetto'));
    el.appendChild(h('p.tenue.piccolo', null, 'Conta solo i quiz: lettura e appunti non la cambiano. Consolidato = verificato in almeno 3 giorni su 7 o più, ultime 2 verifiche ≥ 80%.'));
    if (!righe.length) { el.appendChild(h('p.tenue.piccolo', null, 'Nessun concetto verificato: fai il quiz di una scheda della banca.')); return; }
    const perM = new Map<string, typeof righe>();
    for (const r of righe) { const t = trovaScheda(r.sk), m = t ? t.m : '?'; const l = perM.get(m) || []; l.push(r); perM.set(m, l); }
    for (const [m, l] of perM) {
      const n = Object.fromEntries(VARI.map(s => [s, 0])) as Record<StatoConcetto, number>;
      let tot = 0;
      for (const r of l) { for (const c of r.concetti) n[c.p.stato]++; n.non_verificato += r.totale - r.concetti.length; tot += r.totale; }
      const nome = m === '?' ? 'Altro' : nomeMateria(m), debole = l.find(r => r.insieme !== 'consolidato');
      el.appendChild(h('div.pad-materia', null,
        h('h3.pad-nome', { style: { color: m === '?' ? 'var(--tenue)' : coloreMateria(m) } }, nome),
        h('div.tenue.piccolo', null, n.consolidato + ' di ' + tot + ' concetti consolidati · ' + l.length + (l.length === 1 ? ' scheda verificata' : ' schede verificate')),
        barra5(n, tot, nome),
        h('div.pad-legenda.tenue.piccolo', null, VARI.filter(s => n[s]).map(s => h('span', null, h('i', { style: { background: COL[s] }, 'aria-hidden': 'true' }), n[s] + ' ' + plur(s, n[s])))),
        debole ? h('button.btn.neutro', { onclick: () => apriQuiz(debole.sk) }, '▶ Inizia dalla più debole') : null,
        l.map(r => {
          const t = trovaScheda(r.sk), tit = t ? t.micro + ' · ' + t.s.titolo : r.sk;
          const ver = r.totale - r.nonVerificati;
          return h('details.pad-scheda', null,
            h('summary', null, ICO[r.insieme] + ' ' + tit, h('span.tenue.piccolo', null, ' — ' + Concetti.NOMI[r.insieme] + ' (' + ver + '/' + r.totale + ' verificati)')),
            h('ul.pad-concetti', null,
              r.concetti.map(c => h('li', null, h('span', { style: { color: c.p.stato === 'non_verificato' ? 'var(--tenue)' : COL[c.p.stato] }, 'aria-hidden': 'true' }, ICO[c.p.stato] + ' '),
                h('strong', null, c.etichetta), h('span.tenue.piccolo', null, ' — ' + Concetti.NOMI[c.p.stato] + ': ' + c.p.motivo))),
              r.totale > r.concetti.length ? h('li.tenue.piccolo', null, '○ ' + (r.totale - r.concetti.length) + ' concetti non ancora verificati') : null,
              r.ripiego ? h('li.tenue.piccolo', null, 'Domande senza concetto distinto: ' + Concetti.NOMI[r.ripiego.stato] + ' (' + r.ripiego.motivo + '). Correggile da «Modifica domanda» › Concetto.') : null),
            t ? h('button.btn.neutro', { onclick: () => apriQuiz(r.sk) }, '🧩 Rifai il quiz') : null);
        })));
    }
  }
  return { riempi };
})();
