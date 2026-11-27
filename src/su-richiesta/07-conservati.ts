// 07-conservati.ts — redesign 27/11/2026: codice tolto dall'interfaccia ma conservato per riusarlo.
// tsc lo controlla come il resto (resta compilabile), ma build.mjs non lo mette in nessun file pubblicato:
// app.js resta più leggero (tetto 306 KB gzip). Per riusare una funzione: riportarla nel file d'origine indicato.

// da 07-extra.ts (blocco 4): il riquadro del timer con i pulsanti ▶ per ogni step di oggi
function widgetTimerAvvii(): HTMLElement {
  const g = oggi(), oggiMin = minutiStudio(g, g), sett = minutiStudio(lunedi(g), g);
  const st = Studio.vociDelGiorno(g).filter(x => !x.v.speciale);
  return scheda('Timer e tempo di studio',
    h('div.numeri', null, numero(durata(oggiMin), 'oggi'), numero(durata(sett), 'questa settimana')),
    h('div.chips', { style: { marginTop: '8px' } },
      st.map(x => h('button.chip', { style: { borderLeft: '4px solid ' + coloreChiave(x.v.k) }, onclick: () => Timer.avvia({ m: materiaDi(x.v.k), k: x.v.k, titolo: Studio.etichetta(x.v.k) }) }, '▶ ' + Studio.etichetta(x.v.k))),
      h('button.chip', { onclick: () => Timer.avvia({ titolo: 'Studio libero' }) }, '▶ Studio libero')),
    h('div.tenue.piccolo', null, 'Sessioni da ' + Timer.durate().studio + ' min + pausa ' + Timer.durate().pausa + ' (si cambia in Altro → Studio).'));
}

// da 07-extra.ts (blocco 4): i riquadri «numero grande» degli esami e degli step in ritardo, in Oggi
function widgetEsami(): HTMLElement | null {
  const prossimi = Stato.tutti<Esame>('esame').filter(e => giorniA(e.data) >= 0).sort((a, b) => a.data < b.data ? -1 : 1).slice(0, 2);
  if (!prossimi.length) return null;
  // v0.34: dati raccolti in tessere (giorni agli esami + step in ritardo)
  const apri = () => { UI.studioVista = 'esami'; UI.studioSub = null; vai('studio'); };
  const rit = Studio.pkPiani().length ? Studio.inRitardo().length : 0;
  return h('div.tessere', { 'aria-label': 'Prossimi esami' },
    prossimi.map((e, i) => { const d = giorniA(e.data); return lungo(h('button.tessera' + (i === 0 ? '.primo' : ''), { onclick: apri, title: e.nome + ' · ' + dataLunga(daYmd(e.data)) },
      h('span.tessera-num', null, h('span.conta', null, String(d)), h('small', null, d === 1 ? ' giorno' : ' giorni')),
      h('span.tessera-eti', null, e.nome.replace(/ semestre filtro$/i, '').replace(/^primo /i, '1° ').replace(/^secondo /i, '2° ').replace(/^terzo /i, '3° ')),
      h('span.tessera-sotto', null, fmt(daYmd(e.data), { weekday: 'short', day: 'numeric', month: 'short' }))), () => MenuLungo.esame(), e.nome); }),
    rit ? h('button.tessera.ritardo', { onclick: () => { UI.studioVista = 'piano'; vai('studio'); } },
      h('span.tessera-num', null, h('span.conta', null, String(rit))), h('span.tessera-eti', null, rit === 1 ? 'step indietro' : 'step indietro'), h('span.tessera-sotto', null, 'Vedi il piano')) : null);
}

// da 08-viste.ts (blocco 4): il banner «Modalità esame» in cima a Oggi
function bannerModoEsame(): HTMLElement | null {
  const n = modalitaEsame(); if (n === null) return null;
  return h('div.modo-esame', { role: 'status' }, '🎯 Modalità esame · ' + (n === 0 ? 'oggi' : n === 1 ? 'domani' : 'tra ' + n + ' giorni') + (n <= 3 ? ' · solo ripasso' : ''),
    h('button.btn-testo', { onclick: () => { const i = imp(); i.modoEsame = 'no'; Stato.salva(i); avviso('Modalità esame spenta: la riattivi da Altro › Aspetto.'); } }, 'Mostra tutto'));
}

// da 07-studiaora.ts (blocco 4): esame più vicino e stato del piano per la riga di «Adesso» (ora la riga è rigaEsami)
function prossimoEsame(): { nome: string; giorni: number; stato: string } | null {
  const e = esamiNoti().filter(x => giorniA(x.data) >= 0).sort((a, b) => a.data < b.data ? -1 : 1)[0];
  if (!e) return null;
  const r = Studio.pkPiani().length ? Studio.inRitardo().length : -1;
  return { nome: e.nome.replace(/ semestre filtro$/i, ''), giorni: giorniA(e.data), stato: r < 0 ? '' : r ? 'indietro di ' + r + ' step' : 'in pari ✓' };
}

// da 07-extra.ts: testo del conto alla rovescia (non più usato)
function testoCountdown(d: number): string { return d === 0 ? 'oggi!' : d === 1 ? 'domani' : d < 0 ? 'passato' : 'tra ' + d + ' giorni'; }

// da 03-modello.ts: scadenza di un promemoria come Date (non più usata)
function scadenzaTask(t: Task): Date | null { return t.scadenza ? daDt(t.scadenza) : null; }
