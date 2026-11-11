// 07-chiusura.ts — Chiusura serale della giornata in 2 minuti (v0.13, tattica T28).
//
// Dalle 19:00 compare in cima a Oggi il riquadro "Chiudi la giornata" (finché non la chiudi).
// Tre tocchi: step di oggi (fatti / da spostare a domani), ripasso serale fatto, concentrazione 1–5
// e ore di sonno della notte scorsa. Si salva nel record 'giorno' (id 'g-YYYY-MM-DD').
// Gli step lasciati indietro si spostano con Studio.sposta (i progressi restano).

interface Giorno extends Rec {
  type: 'giorno';
  data: string;
  sonno?: number;           // ore dormite la notte prima
  focus?: number;           // concentrazione 1–5
  ripassoSerale?: boolean;
  chiuso?: boolean;
  spostati?: string[];      // step spostati a domani dalla chiusura
  nota?: string;
}

const Giornata = {
  rec(k = ymd(new Date())): Giorno { return Stato.prendi<Giorno>('g-' + k) || { id: 'g-' + k, type: 'giorno', updatedAt: 0, data: k }; },
  oraDiChiudere(): boolean { const d = new Date(); return d.getHours() >= 19 && !Giornata.rec().chiuso; },
};

function widgetChiusura(): HTMLElement | null {
  if (!Giornata.oraDiChiudere()) return null;
  return scheda('Chiudi la giornata',
    h('div.tenue.piccolo', null, '2 minuti: cosa hai fatto, cosa slitta, come stai. Serve a ripianificare bene e a vedere come sonno e concentrazione influiscono sui risultati.'),
    h('div.bottoni', null, h('button.btn', { onclick: apriChiusura }, '🌙 Chiudi la giornata')));
}

function apriChiusura(): void {
  const k = ymd(new Date()), g = Giornata.rec(k), domani = ymd(new Date(Date.now() + 86400000));
  // step di oggi + quelli che questa chiusura aveva già spostato a domani (per poterli riportare)
  const voci = Studio.vociDelGiorno(oggi()).concat(Studio.vociDelGiorno(daDt(domani)).filter(x => (g.spostati || []).includes(x.v.k)))
    .filter(x => !x.v.speciale && x.p.modo !== 'raffinamento');
  const sposta = new Set<string>(g.spostati || []);
  let focus = g.focus || 0, sonno = g.sonno || 0, serale = !!g.ripassoSerale;
  const corpo = h('div.modulo');
  const chip = (val: number, att: number, testo: string, set: (v: number) => void) => h('button.chip' + (val === att ? '.attivo' : ''), { onclick: () => { set(val); disegnaC(); } }, testo);
  const disegnaC = () => {
    svuota(corpo);
    const righe = voci.map(x => {
      const fatto = Studio.stepFatto(x.v.k, x.p), n = Studio.trovaSotto(x.v.k) ? Studio.numeri(Studio.schedeDi(Studio.trovaSotto(x.v.k)!.sub)) : null;
      return h('div.widget-riga', null,
        h('span.nome', null, (fatto ? '✓ ' : '') + Studio.etichetta(x.v.k), h('div.tenue.piccolo', null, n ? n.Pf + '/' + n.P + ' prioritarie' : x.v.t)),
        fatto ? h('span.tenue.piccolo', null, 'fatto') : h('button.chip' + (sposta.has(x.v.k) ? '.attivo' : ''), { onclick: () => { sposta.has(x.v.k) ? sposta.delete(x.v.k) : sposta.add(x.v.k); disegnaC(); } }, sposta.has(x.v.k) ? '→ domani' : 'Sposta a domani'));
    });
    [
      h('div.gruppo-titolo', null, 'Step di oggi'),
      voci.length ? h('div.gruppo', null, righe) : h('div.tenue.piccolo', null, 'Nessuno step del piano oggi.'),
      voci.some(x => !Studio.stepFatto(x.v.k, x.p)) ? h('div.tenue.piccolo', null, 'Se non lo sposti resta «in ritardo» e potrai ripianificarlo dopo.') : null,
      h('div.gruppo-titolo', null, 'Ripasso prima di dormire'),
      h('div.widget-riga', null, h('span.nome', null, '10–15 min di richiamo a memoria di ciò che hai studiato oggi', h('div.tenue.piccolo', null, 'Senza libro: scrivi o ripeti a voce i punti chiave, poi controlla. Il sonno fissa ciò che hai appena richiamato.')),
        h('label.interruttore', null, h('input', { type: 'checkbox', checked: serale, onchange: (e: Event) => { serale = (e.target as HTMLInputElement).checked; } }), h('span'))),
      h('div.gruppo-titolo', null, 'Concentrazione di oggi'),
      h('div.chips', null, [1, 2, 3, 4, 5].map(v => chip(v, focus, ['😵', '😕', '😐', '🙂', '🔥'][v - 1] + ' ' + v, x => { focus = x; }))),
      h('div.gruppo-titolo', null, 'Ore di sonno la notte scorsa'),
      h('div.chips', null, [5, 6, 7, 8, 9].map(v => chip(v, sonno, (v === 5 ? '≤5' : v === 9 ? '9+' : String(v)) + ' h', x => { sonno = x; }))),
    ].forEach(el => { if (el) corpo.appendChild(el); });
  };
  disegnaC();
  foglio({ titolo: 'Chiudi la giornata', corpo, etichettaSalva: 'Fatto', salva: () => {
    for (const x of voci) {
      const pid = x.p.id;
      if (sposta.has(x.v.k) && !Studio.stepFatto(x.v.k, x.p)) Studio.sposta(x.v.k, domani, pid);
      else if ((g.spostati || []).includes(x.v.k) && !sposta.has(x.v.k)) Studio.sposta(x.v.k, null, pid);
    }
    Stato.salva(Object.assign(g, { chiuso: true, focus: focus || undefined, sonno: sonno || undefined, ripassoSerale: serale, spostati: Array.from(sposta) }) as Giorno);
    const dom = Studio.vociDelGiorno(daDt(domani)).map(x => x.v.speciale ? x.v.t : Studio.etichetta(x.v.k));
    avviso('🌙 Buonanotte. Domani: ' + (dom.length ? dom.join(' + ') : 'niente dal piano') + '.', 7000);
  } });
}

/** Statistiche: sonno e concentrazione rispetto ai punteggi dei quiz fatti lo stesso giorno. */
function sezioneSonno(): HTMLElement | null {
  const giorni = Stato.tutti<Giorno>('giorno').filter(g => g.sonno || g.focus);
  if (giorni.length < 3) return null;
  const punteggi: Record<string, number[]> = {};
  for (const p of Stato.tutti<Progresso>('progresso')) if (p.data && p.punteggio != null) (punteggi[p.data] = punteggi[p.data] || []).push(p.punteggio);
  const media = (l: number[]) => l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null;
  const gruppo = (f: (g: Giorno) => boolean) => media(giorni.filter(f).flatMap(g => punteggi[g.data] || []));
  const pocoSonno = gruppo(g => !!g.sonno && g.sonno < 7), sonnoOk = gruppo(g => !!g.sonno && g.sonno >= 7);
  const focusAlto = gruppo(g => !!g.focus && g.focus >= 4), focusBasso = gruppo(g => !!g.focus && g.focus <= 2);
  return h('section.card', null, h('h2.card-titolo', null, 'Sonno, concentrazione e risultati'),
    h('div.numeri', null, numero(pocoSonno != null ? pocoSonno + '%' : '—', 'con < 7 h di sonno'), numero(sonnoOk != null ? sonnoOk + '%' : '—', 'con ≥ 7 h')),
    h('div.numeri', null, numero(focusBasso != null ? focusBasso + '%' : '—', 'concentrazione 1–2'), numero(focusAlto != null ? focusAlto + '%' : '—', 'concentrazione 4–5')),
    h('div.tenue.piccolo', null, 'Media dei punteggi dei quiz fatti in quei giorni (' + giorni.length + ' giornate chiuse). È una correlazione sui tuoi dati, non una prova: più giornate chiudi, più è affidabile.'));
}
