// ============================================================
// 06-viste.ts — Le schermate: Oggi, Calendario (giorno/settimana/mese/
// agenda), Promemoria, Note, Altro (impostazioni), Cerca.
// Ogni vista è una funzione che restituisce un elemento; `disegna()`
// (in 07-main.ts) ricostruisce la schermata a ogni cambio di dati.
// ============================================================

type Scheda = 'oggi' | 'cal' | 'studio' | 'task' | 'note' | 'altro' | 'cerca';
type VistaCal = 'giorno' | 'settimana' | 'mese' | 'agenda';

const UI = {
  scheda: 'oggi' as Scheda,
  vista: 'mese' as VistaCal,
  data: oggi(),                 // giorno selezionato nel calendario
  filtroTask: 'dafare' as 'dafare' | 'inbox' | 'fatti',
  qNote: '',
  tagNote: '',
  q: '',
  studioVista: 'schede' as 'schede' | 'piano' | 'errori' | 'statistiche' | 'esami' | 'syllabus' | 'tabelle',
  studioPiano: '',
  copMateria: '',
  copStato: '',
  tabella: null as string | null,
  tabQ: '',
  tabOrd: '',
  studioStep: '',
  studioSub: null as string | null,
  soloPrior: false,
  pianoScorso: false,
};
const ORA_PX = 52; // altezza di un'ora nella griglia oraria

function vai(scheda: Scheda, vista?: VistaCal, data?: Date): void {
  UI.scheda = scheda;
  if (vista) UI.vista = vista;
  if (data) UI.data = inizioGiorno(data);
  disegna();
}

// ---------- Righe riusabili ----------
function orarioOcc(o: Occ, giorno?: Date): string {
  if (o.ev.tuttoIlGiorno) return 'Tutto il giorno';
  if (giorno && !stessoGiorno(o.inizio, giorno) && !stessoGiorno(o.fine, giorno)) return 'Tutto il giorno';
  if (giorno && !stessoGiorno(o.inizio, giorno)) return 'fino alle ' + hm(o.fine);
  if (giorno && !stessoGiorno(o.fine, giorno)) return 'dalle ' + hm(o.inizio);
  return hm(o.inizio) + ' – ' + hm(o.fine);
}
function rigaOcc(o: Occ, giorno?: Date): HTMLElement {
  const fatte = (o.ev.checklist || []).filter(v => v.fatto).length, tot = (o.ev.checklist || []).length;
  return h('button.voce-lista', { onclick: () => apriEvento(o.ev, o) },
    h('span.barra', { style: { background: coloreEvento(o.ev) } }),
    h('span.voce-corpo', null,
      h('span.voce-titolo', null, o.ev.titolo),
      h('span.voce-sotto', null, orarioOcc(o, giorno),
        o.ev.luogo ? [' · ', o.ev.luogo] : null,
        tot ? ' · ' + fatte + '/' + tot + ' ✓' : null),
    ),
    o.ev.rrule ? h('span.tenue', { title: testoRicorrenza(o.ev.rrule) }, icona('ripeti', 16)) : null,
    (o.ev.promemoria || []).length ? h('span.tenue', null, icona('campana', 16)) : null,
    (o.ev.allegati || []).length ? h('span.tenue', null, '📎') : null,
  );
}
function etichettaScadenza(t: Task): string {
  if (!t.scadenza) return '';
  const d = daDt(t.scadenza);
  return dataRelativa(d) + (t.scadenza.length > 10 ? ' ' + hm(d) : '');
}
function rigaTask(t: Task): HTMLElement {
  const scad = taskScaduto(t);
  return h('div.voce-lista.task' + (t.fatto ? '.fatto' : ''), null,
    h('button.spunta' + (t.fatto ? '.on' : ''), {
      'aria-label': t.fatto ? 'Segna da fare' : 'Segna fatto',
      style: { '--c': coloreEvento(t) },
      onclick: () => spuntaTask(t),
    }, t.fatto ? '✓' : ''),
    h('button.voce-corpo', { onclick: () => apriTask(t) },
      h('span.voce-titolo', null, t.priorita ? h('span.prio.p' + t.priorita, null, '!'.repeat(t.priorita) + ' ') : null, t.titolo),
      (t.scadenza || t.rrule) ? h('span.voce-sotto' + (scad ? '.scaduto' : ''), null, etichettaScadenza(t), t.rrule ? ' · ' + testoRicorrenza(t.rrule) : null) : null,
    ),
  );
}
function vuoto(testo: string): HTMLElement { return h('div.vuoto', null, testo); }
function scheda(titolo: string, ...corpo: Figlio[]): HTMLElement {
  return h('section.card', null, h('h2.card-titolo', null, titolo), corpo);
}
function taskDelGiorno(g: Date): Task[] {
  const k = ymd(g);
  return Stato.tutti<Task>('task').filter(t => !t.fatto && t.scadenza && t.scadenza.slice(0, 10) === k && categoriaVisibile(t.categoriaId)).sort(ordinaTask);
}

// ---------- OGGI (Home/Dashboard) ----------
const WIDGET: [string, string][] = [['ripassi', 'Ripassi di oggi'], ['chiusura', 'Chiudi la giornata (sera)'], ['esami', 'Prossimi esami'], ['impegni', 'Impegni di oggi'], ['studio', 'Studio di oggi'], ['timer', 'Timer e tempo di studio'], ['errori', 'Schede da rifare'], ['promemoria', 'Promemoria'], ['tabelle', 'Dalle tue tabelle'], ['nota', 'Nota del giorno'], ['domani', 'Domani']];
/** Riquadri di Oggi nell'ordine scelto, senza quelli nascosti (quelli nuovi in fondo). */
function ordineWidget(): string[] {
  const i = imp(), ord = (i.widget || []).filter(w => WIDGET.some(x => x[0] === w));
  for (const [w] of WIDGET) if (!ord.includes(w)) (w === 'ripassi' || w === 'chiusura') ? ord.unshift(w) : ord.push(w); // v0.7: i ripassi in cima
  return ord.filter(w => !(i.widgetNascosti || []).includes(w));
}
let timerNotaGiorno = 0;
function vistaOggi(): HTMLElement {
  const g = oggi();
  const occ = occorrenzeDelGiorno(g);
  const tasks = Stato.tutti<Task>('task').filter(t => !t.fatto && t.scadenza && (taskScaduto(t) || t.scadenza.slice(0, 10) === ymd(g))).sort(ordinaTask);

  // Nota del giorno: id fisso per data, così non si duplica tra dispositivi.
  const idNota = 'giorno-' + ymd(g);
  const nota = Stato.prendi<Nota>(idNota);
  const area = h('textarea.nota-giorno', {
    rows: 4, placeholder: 'Appunti di oggi…', value: nota ? nota.testo : '',
    oninput: () => {
      clearTimeout(timerNotaGiorno);
      timerNotaGiorno = window.setTimeout(() => {
        const n: Nota = Stato.prendi<Nota>(idNota) || { id: idNota, type: 'nota', updatedAt: 0, titolo: 'Nota del ' + fmt(g, { day: 'numeric', month: 'long', year: 'numeric' }), testo: '', tag: [], giorno: ymd(g) };
        n.testo = area.value;
        Stato.salva(n, true);
      }, 500);
    },
  }) as HTMLTextAreaElement;

  const rapido = h('input', { type: 'text', placeholder: '+ Promemoria veloce', enterKeyHint: 'done', onkeydown: (e: KeyboardEvent) => {
    if (e.key === 'Enter' && rapido.value.trim()) {
      Stato.salva({ id: uid(), type: 'task', updatedAt: 0, titolo: rapido.value.trim(), priorita: 0, fatto: false, scadenza: ymd(g) });
    }
  } }) as HTMLInputElement;

  const domani = piuGiorni(g, 1);
  const occDomani = occorrenzeDelGiorno(domani);

  return h('div.pagina', null,
    h('div.oggi-testa', null,
      h('div.oggi-giorno', null, String(g.getDate())),
      h('div', null, h('div.oggi-sett', null, maiuscola(fmt(g, { weekday: 'long' }))), h('div.tenue', null, maiuscola(fmt(g, { month: 'long', year: 'numeric' })))),
    ),
    campoRapido(),
    ordineWidget().map(w => {
      switch (w) {
        case 'impegni': return scheda('Impegni di oggi', occ.length ? occ.map(o => rigaOcc(o, g)) : vuoto('Nessun impegno. Scrivi sopra o tocca +.'));
        case 'promemoria': return scheda('Promemoria', tasks.length ? tasks.map(rigaTask) : vuoto('Niente in scadenza.'), rapido);
        case 'studio': { const st = Studio.vociDelGiorno(g); return Studio.pkPiani().length ? scheda('Studio di oggi', indicatoreStudio(), st.length ? st.map(rigaStudio) : vuoto('Niente dal piano per oggi.')) : null; }
        case 'tabelle': { const r = righeDelGiorno(g); return r.length ? scheda('Dalle tue tabelle', r.map(rigaTabellaGiorno)) : null; }
        case 'nota': return scheda('Nota del giorno', area);
        case 'domani': return occDomani.length ? scheda('Domani', occDomani.map(o => rigaOcc(o, domani))) : null;
        case 'ripassi': return widgetRipassi();
        case 'chiusura': return widgetChiusura();
        case 'esami': return widgetEsami();
        case 'timer': return widgetTimer();
        case 'errori': return widgetErrori();
      }
      return null;
    }),
  );
}

// ---------- CALENDARIO ----------
function titoloCal(): string {
  const d = UI.data;
  if (UI.vista === 'mese') return maiuscola(fmt(d, { month: 'long', year: 'numeric' }));
  if (UI.vista === 'giorno') return maiuscola(fmt(d, { weekday: 'short', day: 'numeric', month: 'long' }));
  if (UI.vista === 'settimana') {
    const a = lunedi(d), b = piuGiorni(a, 6);
    return a.getDate() + (a.getMonth() !== b.getMonth() ? ' ' + fmt(a, { month: 'short' }) : '') + ' – ' + b.getDate() + ' ' + fmt(b, { month: 'short', year: 'numeric' });
  }
  return 'Agenda';
}
function spostaCal(dir: number): void {
  const d = UI.data;
  if (UI.vista === 'mese') UI.data = new Date(d.getFullYear(), d.getMonth() + dir, Math.min(d.getDate(), new Date(d.getFullYear(), d.getMonth() + dir + 1, 0).getDate()));
  else if (UI.vista === 'settimana') UI.data = piuGiorni(d, 7 * dir);
  else if (UI.vista === 'giorno') UI.data = piuGiorni(d, dir);
  else UI.data = piuGiorni(d, 30 * dir);
  disegna();
}

function vistaCalendario(): HTMLElement {
  const viste: [VistaCal, string][] = [['giorno', 'Giorno'], ['settimana', 'Settimana'], ['mese', 'Mese'], ['agenda', 'Agenda']];
  const barra = h('div.cal-barra', null,
    h('div.cal-nav', null,
      h('button.btn-ico', { 'aria-label': 'Precedente', onclick: () => spostaCal(-1) }, icona('sx')),
      h('button.cal-titolo', { onclick: () => { UI.data = oggi(); disegna(); }, title: 'Torna a oggi' }, titoloCal()),
      h('button.btn-ico', { 'aria-label': 'Successivo', onclick: () => spostaCal(1) }, icona('dx')),
      stessoGiorno(UI.data, oggi()) ? null : h('button.btn-testo', { onclick: () => { UI.data = oggi(); disegna(); } }, 'Oggi'),
    ),
    h('div.segmenti', { role: 'tablist' }, viste.map(([v, t]) =>
      h('button' + (UI.vista === v ? '.attivo' : ''), { role: 'tab', onclick: () => { UI.vista = v; disegna(); } }, t))),
  );
  const corpo = UI.vista === 'mese' ? vistaMese() : UI.vista === 'agenda' ? vistaAgenda() : vistaGriglia(UI.vista === 'giorno' ? 1 : 7);
  const el = h('div.pagina.cal', null, barra, UI.vista === 'agenda' || UI.vista === 'mese' ? campoRapido() : null, corpo);

  // Scorrimento orizzontale col dito per cambiare periodo.
  let x0 = 0, y0 = 0;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) spostaCal(dx < 0 ? 1 : -1);
  }, { passive: true });
  return el;
}

/** Raggruppa le occorrenze per giorno ('YYYY-MM-DD'), contando anche gli eventi su più giorni. */
function perGiorno(da: Date, a: Date): Map<string, Occ[]> {
  const m = new Map<string, Occ[]>();
  for (const o of occorrenzeTra(da, a)) {
    let g = inizioGiorno(o.inizio < da ? da : o.inizio);
    const ultimo = o.fine > a ? a : o.fine;
    do {
      const k = ymd(g);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
      g = piuGiorni(g, 1);
    } while (g < ultimo);
  }
  return m;
}

function vistaMese(): HTMLElement {
  const primo = new Date(UI.data.getFullYear(), UI.data.getMonth(), 1);
  const inizio = lunedi(primo);
  const giorniMese = new Date(primo.getFullYear(), primo.getMonth() + 1, 0).getDate();
  const settimane = Math.ceil((((primo.getDay() + 6) % 7) + giorniMese) / 7);
  const fine = piuGiorni(inizio, settimane * 7);
  const mappa = perGiorno(inizio, fine);
  const griglia = h('div.mese', { style: { '--righe': String(settimane) } });
  GIORNI_BREVI.forEach(n => griglia.appendChild(h('div.mese-eti', null, n)));
  for (let i = 0; i < settimane * 7; i++) {
    const g = piuGiorni(inizio, i);
    const occ = mappa.get(ymd(g)) || [];
    const nTask = taskDelGiorno(g).length;
    const cls = (g.getMonth() !== primo.getMonth() ? '.fuori' : '') + (stessoGiorno(g, oggi()) ? '.oggi' : '') + (stessoGiorno(g, UI.data) ? '.sel' : '');
    griglia.appendChild(h('button.mese-cella' + cls, {
      'aria-label': dataLunga(g) + ', ' + occ.length + ' impegni',
      onclick: () => { if (stessoGiorno(g, UI.data)) vai('cal', 'giorno', g); else { UI.data = g; disegna(); } },
    },
      h('span.mese-num', null, String(g.getDate())),
      Studio.vociDelGiorno(g).slice(0, 2).map(x => h('span.mese-chip.studio', { style: { '--c': x.v.speciale ? '#7c8597' : coloreChiave(x.v.k) } }, x.v.speciale ? x.v.t : Studio.etichetta(x.v.k))),
      occ.slice(0, 2).map(o => h('span.mese-chip', { style: { '--c': coloreEvento(o.ev) } }, o.ev.titolo)),
      occ.length > 2 ? h('span.mese-altro', null, '+' + (occ.length - 2)) : null,
      nTask ? h('span.mese-task', { title: nTask + ' promemoria' }) : null,
    ));
  }
  // Sotto la griglia: dettaglio del giorno selezionato.
  const occSel = occorrenzeDelGiorno(UI.data), taskSel = taskDelGiorno(UI.data);
  return h('div', null, griglia,
    h('div.card.giorno-sel', null,
      h('div.card-titolo.riga-tra', null, h('span', null, dataLunga(UI.data)),
        h('button.btn-testo', { onclick: () => vai('cal', 'giorno', UI.data) }, 'Apri giorno')),
      Studio.vociDelGiorno(UI.data).map(rigaStudio), righeDelGiorno(UI.data).map(rigaTabellaGiorno), occSel.map(o => rigaOcc(o, UI.data)), taskSel.map(rigaTask),
      !occSel.length && !taskSel.length && !Studio.vociDelGiorno(UI.data).length ? vuoto('Niente in programma.') : null,
    ));
}

/** Dispone gli eventi sovrapposti in colonne affiancate. */
function impagina(occ: Occ[], giorno: Date): { o: Occ; s: number; e: number; col: number; ncol: number }[] {
  const g0 = inizioGiorno(giorno).getTime();
  const voci = occ.map(o => {
    const s = Math.max(0, (o.inizio.getTime() - g0) / 60000);
    const e = Math.min(1440, (o.fine.getTime() - g0) / 60000);
    return { o, s, e: Math.max(e, s + 24), col: 0, ncol: 1 };
  }).sort((a, b) => a.s - b.s || b.e - a.e);
  let gruppo: typeof voci = [], fineGruppo = -1;
  const chiudi = () => { const n = Math.max(...gruppo.map(v => v.col)) + 1; gruppo.forEach(v => v.ncol = n); gruppo = []; fineGruppo = -1; };
  for (const v of voci) {
    if (gruppo.length && v.s >= fineGruppo) chiudi();
    const usate = new Set(gruppo.filter(x => x.e > v.s).map(x => x.col));
    let c = 0; while (usate.has(c)) c++;
    v.col = c; gruppo.push(v); fineGruppo = Math.max(fineGruppo, v.e);
  }
  if (gruppo.length) chiudi();
  return voci;
}

function vistaGriglia(nGiorni: number): HTMLElement {
  const primo = nGiorni === 1 ? UI.data : lunedi(UI.data);
  const giorni: Date[] = []; for (let i = 0; i < nGiorni; i++) giorni.push(piuGiorni(primo, i));
  const mappa = perGiorno(primo, piuGiorni(primo, nGiorni));
  const col = { gridTemplateColumns: '44px repeat(' + nGiorni + ', minmax(0, 1fr))' };

  const testa = h('div.gr-testa', { style: col }, h('span'), giorni.map(g =>
    h('button.gr-giorno' + (stessoGiorno(g, oggi()) ? '.oggi' : ''), { onclick: () => vai('cal', 'giorno', g) },
      h('span.gr-sett', null, GIORNI_BREVI[(g.getDay() + 6) % 7]), h('span.gr-num', null, String(g.getDate())))));

  const lungo = (o: Occ) => o.ev.tuttoIlGiorno || o.fine.getTime() - o.inizio.getTime() >= 86400000;
  const fascia = h('div.gr-fascia', { style: col }, h('span.gr-fascia-eti', null, 'giorno'), giorni.map(g => {
    const occ = (mappa.get(ymd(g)) || []).filter(lungo);
    return h('div.gr-fascia-col', null,
      Studio.vociDelGiorno(g).map(x => h('button.mese-chip.studio', { style: { '--c': x.v.speciale ? '#7c8597' : coloreChiave(x.v.k) }, onclick: () => rigaStudio(x).click() }, x.v.speciale ? x.v.t : Studio.etichetta(x.v.k) + (nGiorni === 1 ? ' · ' + x.v.t : ''))),
      occ.map(o => h('button.mese-chip', { style: { '--c': coloreEvento(o.ev) }, onclick: () => apriEvento(o.ev, o) }, o.ev.titolo)),
      taskDelGiorno(g).map(t => h('button.mese-chip.task', { style: { '--c': coloreEvento(t) }, onclick: () => apriTask(t) }, '○ ' + t.titolo)));
  }));

  const ore = h('div.gr-ore'); for (let i = 1; i < 24; i++) ore.appendChild(h('span', { style: { top: i * ORA_PX + 'px' } }, pad2(i) + ':00'));
  const corpo = h('div.gr-corpo', { style: { ...col, height: 24 * ORA_PX + 'px', '--ora': ORA_PX + 'px' } }, ore, giorni.map(g => {
    const colonna = h('div.gr-col' + (stessoGiorno(g, oggi()) ? '.oggi' : ''), {
      onclick: (e: MouseEvent) => {
        if (e.target !== colonna) return;
        // tocco su uno spazio vuoto: nuovo evento a quell'ora (arrotondata alla mezz'ora)
        const min = Math.floor((e.offsetY / ORA_PX) * 2) * 30;
        const d = new Date(g); d.setHours(0, min, 0, 0);
        apriEvento(undefined, undefined, { inizio: d, tuttoIlGiorno: false });
      },
    });
    for (const v of impagina((mappa.get(ymd(g)) || []).filter(o => !lungo(o)), g)) {
      const breve = v.e - v.s < 45;
      colonna.appendChild(trascinabile(h('button.gr-ev' + (breve ? '.breve' : ''), {
        style: { top: (v.s / 60) * ORA_PX + 'px', height: Math.max(20, ((v.e - v.s) / 60) * ORA_PX - 2) + 'px', left: (v.col / v.ncol) * 100 + '%', width: 'calc(' + 100 / v.ncol + '% - 2px)', '--c': coloreEvento(v.o.ev) },
        onclick: (e: Event) => { e.stopPropagation(); apriEvento(v.o.ev, v.o); },
      }, h('span.gr-ev-tit', null, v.o.ev.titolo), breve ? null : h('span.gr-ev-ora', null, hm(v.o.inizio) + (nGiorni === 1 ? ' – ' + hm(v.o.fine) : ''), v.o.ev.luogo && nGiorni === 1 ? ' · ' + v.o.ev.luogo : null), h('span.gr-maniglia', { 'aria-hidden': 'true' })), v.o, nGiorni));
    }
    if (stessoGiorno(g, oggi())) {
      const ora = new Date();
      colonna.appendChild(h('div.gr-adesso', { style: { top: ((ora.getHours() * 60 + ora.getMinutes()) / 60) * ORA_PX + 'px' } }));
    }
    return colonna;
  }));
  return h('div.griglia' + (nGiorni === 1 ? '.uno' : ''), null, testa, fascia, h('div.gr-scroll', null, corpo));
}

function vistaAgenda(): HTMLElement {
  const da = UI.data, a = piuGiorni(da, 60);
  const mappa = perGiorno(da, a);
  const lista = h('div.agenda');
  for (let i = 0; i < 60; i++) {
    const g = piuGiorni(da, i);
    const occ = mappa.get(ymd(g)) || [], tasks = taskDelGiorno(g), st = Studio.vociDelGiorno(g);
    if (!occ.length && !tasks.length && !st.length) continue;
    lista.appendChild(h('div.agenda-giorno' + (stessoGiorno(g, oggi()) ? '.oggi' : ''), null,
      h('button.agenda-data', { onclick: () => vai('cal', 'giorno', g) },
        h('span.agenda-num', null, String(g.getDate())), h('span.agenda-sett', null, fmt(g, { weekday: 'short' }) + ' · ' + fmt(g, { month: 'short' }))),
      h('div.agenda-voci', null, st.map(rigaStudio), occ.map(o => rigaOcc(o, g)), tasks.map(rigaTask))));
  }
  if (!lista.firstChild) lista.appendChild(vuoto('Niente in programma nei prossimi 60 giorni.'));
  return lista;
}

// ---------- PROMEMORIA ----------
function vistaTask(): HTMLElement {
  const tutti = Stato.tutti<Task>('task');
  const rapido = h('input.rapido', { type: 'text', placeholder: '+ Nuovo promemoria (Invio per salvare in Inbox)', enterKeyHint: 'done', onkeydown: (e: KeyboardEvent) => {
    if (e.key === 'Enter' && rapido.value.trim()) Stato.salva({ id: uid(), type: 'task', updatedAt: 0, titolo: rapido.value.trim(), priorita: 0, fatto: false });
  } }) as HTMLInputElement;
  const filtri: [typeof UI.filtroTask, string][] = [['dafare', 'Da fare'], ['inbox', 'Inbox'], ['fatti', 'Fatti']];
  const corpo = h('div');
  const gruppo = (titolo: string, voci: Task[], cls = '') => voci.length ? corpo.appendChild(h('section.card', null, h('h2.card-titolo' + cls, null, titolo + ' · ' + voci.length), voci.map(rigaTask))) : null;

  if (UI.filtroTask === 'fatti') {
    const fatti = tutti.filter(t => t.fatto).sort((a, b) => (b.fattoIl || '') < (a.fattoIl || '') ? -1 : 1);
    if (fatti.length) gruppo('Completati', fatti); else corpo.appendChild(vuoto('Ancora nessun promemoria completato.'));
  } else if (UI.filtroTask === 'inbox') {
    const inbox = tutti.filter(t => !t.fatto && !t.scadenza).sort((a, b) => b.priorita - a.priorita || b.updatedAt - a.updatedAt);
    if (inbox.length) gruppo('Inbox (senza data)', inbox); else corpo.appendChild(vuoto('Inbox vuota.'));
  } else {
    const aperti = tutti.filter(t => !t.fatto).sort(ordinaTask);
    const k = ymd(oggi());
    gruppo('Scaduti', aperti.filter(taskScaduto), '.scaduto');
    gruppo('Oggi', aperti.filter(t => !taskScaduto(t) && t.scadenza && t.scadenza.slice(0, 10) === k));
    gruppo('Prossimi', aperti.filter(t => t.scadenza && t.scadenza.slice(0, 10) > k));
    gruppo('Inbox (senza data)', aperti.filter(t => !t.scadenza));
    if (!aperti.length) corpo.appendChild(vuoto('Tutto fatto. Niente da fare.'));
  }
  return h('div.pagina', null,
    h('div.segmenti', { role: 'tablist' }, filtri.map(([v, t]) => h('button' + (UI.filtroTask === v ? '.attivo' : ''), { role: 'tab', onclick: () => { UI.filtroTask = v; disegna(); } }, t))),
    rapido, corpo);
}

// ---------- NOTE ----------
function vistaNote(): HTMLElement {
  const lista = h('div');
  const zonaTag = h('div.chips');
  function aggiorna(): void {
    const tutte = Stato.tutti<Nota>('nota').filter(n => n.testo.trim() || !n.giorno).sort((a, b) => b.updatedAt - a.updatedAt);
    const tags = Array.from(new Set(tutte.flatMap(n => n.tag))).sort();
    svuota(zonaTag);
    tags.forEach(t => zonaTag.appendChild(h('button.chip' + (UI.tagNote === t ? '.attivo' : ''), { onclick: () => { UI.tagNote = UI.tagNote === t ? '' : t; aggiorna(); } }, '#' + t)));
    const q = norm(UI.qNote);
    const viste = tutte.filter(n => (!UI.tagNote || n.tag.includes(UI.tagNote)) && (!q || norm(n.titolo + ' ' + n.testo + ' ' + n.tag.join(' ')).includes(q)));
    svuota(lista);
    if (!viste.length) lista.appendChild(vuoto(tutte.length ? 'Nessuna nota trovata.' : 'Ancora nessuna nota. Tocca + per scriverne una.'));
    viste.forEach(n => lista.appendChild(h('button.card.nota-card', { onclick: () => apriNota(n) },
      h('span.voce-titolo', null, n.titolo || '(senza titolo)'),
      h('span.nota-estratto', null, n.testo.replace(/[#*`]/g, '').slice(0, 140)),
      h('span.voce-sotto', null, n.giorno ? 'Nota del giorno · ' : '', fmt(new Date(n.updatedAt), { day: 'numeric', month: 'short' }), n.tag.map(t => ' #' + t)),
    )));
  }
  aggiorna();
  return h('div.pagina', null,
    h('input.rapido', { type: 'search', placeholder: 'Cerca nelle note…', value: UI.qNote, oninput: (e: Event) => { UI.qNote = (e.target as HTMLInputElement).value; aggiorna(); } }),
    zonaTag, lista);
}

// ---------- CERCA (globale) ----------
function vistaCerca(): HTMLElement {
  const ris = h('div');
  function aggiorna(): void {
    svuota(ris);
    const q = norm(UI.q.trim());
    if (q.length < 2) { ris.appendChild(vuoto('Scrivi almeno 2 lettere: cerco in eventi, promemoria e note.')); return; }
    const ev = Stato.tutti<Evento>('evento').filter(e => norm(e.titolo + ' ' + (e.luogo || '') + ' ' + (e.note || '')).includes(q)).sort((a, b) => a.inizio < b.inizio ? 1 : -1);
    const tk = Stato.tutti<Task>('task').filter(t => norm(t.titolo + ' ' + (t.note || '')).includes(q));
    const nt = Stato.tutti<Nota>('nota').filter(n => norm(n.titolo + ' ' + n.testo + ' ' + n.tag.join(' ')).includes(q));
    if (ev.length) ris.appendChild(scheda('Eventi · ' + ev.length, ev.slice(0, 50).map(e => h('button.voce-lista', { onclick: () => apriEvento(e) },
      h('span.barra', { style: { background: coloreEvento(e) } }),
      h('span.voce-corpo', null, h('span.voce-titolo', null, e.titolo), h('span.voce-sotto', null, fmt(daDt(e.inizio), { day: 'numeric', month: 'short', year: 'numeric' }), e.rrule ? ' · ' + testoRicorrenza(e.rrule) : ''))))));
    if (tk.length) ris.appendChild(scheda('Promemoria · ' + tk.length, tk.slice(0, 50).map(rigaTask)));
    if (nt.length) ris.appendChild(scheda('Note · ' + nt.length, nt.slice(0, 50).map(n => h('button.voce-lista', { onclick: () => apriNota(n) },
      h('span.voce-corpo', null, h('span.voce-titolo', null, n.titolo || '(senza titolo)'), h('span.voce-sotto', null, n.testo.slice(0, 80)))))));
    if (!ev.length && !tk.length && !nt.length) ris.appendChild(vuoto('Nessun risultato.'));
  }
  aggiorna();
  const campo = h('input.rapido', { type: 'search', placeholder: 'Cerca ovunque…', value: UI.q, oninput: (e: Event) => { UI.q = (e.target as HTMLInputElement).value; aggiorna(); } }) as HTMLInputElement;
  setTimeout(() => { if (document.activeElement !== campo && !UI.q) campo.focus(); }, 50);
  return h('div.pagina', null, campo, ris);
}

// ---------- ALTRO (impostazioni base; l'editor completo arriva in Fase 4) ----------
function vistaAltro(): HTMLElement {
  const i = imp();
  const salvaImp = (mod: Partial<Impostazioni>) => { Object.assign(i, mod); Stato.salva(i); applicaTema(); };

  const cats = categorie().map(c => h('div.cat-riga', null,
    h('input', { type: 'color', value: c.colore, 'aria-label': 'Colore di ' + c.nome, onchange: (e: Event) => { c.colore = (e.target as HTMLInputElement).value; Stato.salva(c); } }),
    h('input', { type: 'text', value: c.nome, 'aria-label': 'Nome categoria', onchange: (e: Event) => { const v = (e.target as HTMLInputElement).value.trim(); if (v) { c.nome = v; Stato.salva(c); } } }),
    h('label.interruttore', { title: 'Mostra/nascondi nel calendario' }, h('input', { type: 'checkbox', checked: c.visibile, onchange: (e: Event) => { c.visibile = (e.target as HTMLInputElement).checked; Stato.salva(c); } }), h('span')),
    h('button.btn-ico', { 'aria-label': 'Elimina categoria ' + c.nome, onclick: () => chiedi('Eliminare la categoria?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], c.nome + ' — gli eventi restano, senza categoria.').then(s => { if (s) Stato.elimina(c.id); }) }, icona('x', 18)),
  ));
  const nuovaCat = h('input', { type: 'text', placeholder: '+ Nuova categoria', onkeydown: (e: KeyboardEvent) => {
    if (e.key === 'Enter' && nuovaCat.value.trim()) {
      const colori = ['#6c8cff', '#2fbf8f', '#f0708a', '#e9a23b', '#a78bfa', '#38bdf8', '#f97316'];
      Stato.salva({ id: uid(), type: 'categoria', updatedAt: 0, nome: nuovaCat.value.trim(), colore: colori[categorie().length % colori.length], visibile: true, ordine: categorie().length });
    }
  } }) as HTMLInputElement;

  const fileImport = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: () => {
    const f = fileImport.files && fileImport.files[0];
    if (!f) return;
    f.text().then(txt => {
      try {
        const dati = JSON.parse(txt);
        const n = Stato.unisci(Array.isArray(dati) ? dati : dati.records || []);
        applicaTema();
        avviso('Importazione completata: ' + n + ' elementi aggiornati.');
      } catch (_) { avviso('File non valido.'); }
    });
  } }) as HTMLInputElement;
  const anteprima = !document.querySelector('link[rel="manifest"]'); // versione di prova a file unico
  const esporta = () => {
    if (anteprima) { avviso("Nell'anteprima l'esportazione non è disponibile: funziona nell'app installata."); return; }
    const blob = new Blob([JSON.stringify({ formato: 'il-mio-calendario', versione: 1, esportatoIl: new Date().toISOString(), records: Stato.esporta() })], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'calendario-backup-' + ymd(new Date()) + '.json' }) as HTMLAnchorElement;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const memoria = { idb: 'sul dispositivo (IndexedDB)', ls: 'sul dispositivo (ridotto)', mem: 'solo temporaneo: questa finestra non permette il salvataggio' }[DB.modo];

  const ds = descrSync();
  const sezDrive = scheda('Google Drive',
    h('div.sync-riga', null, h('span.sync-pallino.' + ds.cls), h('span', null, ds.testo)),
    Drive.collegato
      ? [h('div.tenue.piccolo', null, 'Account: ' + Drive.stato.email + '. Dati in "Calendario personale/dati", backup giornaliero in "backup" (ultimi 30). L\'app non elimina mai file: al massimo li sposta in "_cestino app".'),
         h('div.bottoni', null,
           h('button.btn', { onclick: () => Drive.stato.sync === 'ok' ? Drive.sincronizza(false) : Drive.login() }, 'Sincronizza ora'),
           h('button.btn.neutro', { onclick: () => chiedi('Scollegare Google Drive?', [{ testo: 'Scollega', valore: 'si', pericolo: true }], 'I dati restano sia qui sia su Drive.').then(s => { if (s) Drive.logout(); }) }, 'Scollega'))]
      : [h('div.tenue.piccolo', null, 'Collega il tuo Google Drive: i dati si salvano in una cartella "Calendario personale" e compaiono identici su iPhone e PC. Solo il tuo account potrà vederli.'),
         h('div.bottoni', null, h('button.btn', { onclick: () => Drive.login() }, 'Accedi con Google'))],
  );

  return h('div.pagina', null,
    sezDrive,
    sezioneAspetto(salvaImp),
    sezioneLayout(salvaImp),
    sezionePreset(salvaImp),
    scheda('Categorie', cats, nuovaCat),
    sezioneStudio(salvaImp),
    sezioneNotifiche(salvaImp),
    sezioneCalendari(salvaImp),
    scheda('I miei dati',
      h('div.tenue.piccolo', null, 'Salvataggio: ' + memoria + '.'),
      anteprima ? h('div.tenue.piccolo', null, 'Questa è l\'anteprima di prova: i dati restano solo in questo browser e possono andare persi.') : null,
      h('div.bottoni', null,
        h('button.btn', { onclick: esporta }, 'Esporta backup'),
        h('button.btn.neutro', { onclick: () => fileImport.click() }, 'Importa backup'), fileImport),
    ),
    h('div.tenue.piccolo.centro', null, 'Il mio calendario · v' + VERSIONE),
  );
}

// ---------- Impostazioni: aspetto, layout, preset, calendari esterni ----------
type SalvaImp = (mod: Partial<Impostazioni>) => void;
const ACCENTI = ['#6c8cff', '#2fbf8f', '#e9a23b', '#f0708a', '#a78bfa', '#38bdf8', '#f97316', '#64748b'];
const CAMPI_ASPETTO: (keyof Impostazioni)[] = ['tema', 'accento', 'sfondo', 'font', 'scala', 'densita', 'raggio', 'widget', 'widgetNascosti', 'tabNascoste', 'nav', 'vistaIniziale'];

function sezioneAspetto(salva: SalvaImp): HTMLElement {
  const i = imp(), sel = (o: [string, string][], v: string, k: keyof Impostazioni, num = false) => selettore(o, v, function (this: HTMLSelectElement) { salva({ [k]: num ? +this.value : this.value, preset: '' } as any); });
  return scheda('Aspetto',
    riga('Tema', sel([['auto', 'Automatico'], ['chiaro', 'Chiaro'], ['scuro', 'Scuro']], i.tema, 'tema')),
    riga('Colore accento', h('span.anteprima-tema', null, ACCENTI.map(c => h('button.campione' + (c === i.accento ? '.attivo' : ''), { style: { background: c }, 'aria-label': 'Accento ' + c, onclick: () => salva({ accento: c, preset: '' }) })),
      h('input', { type: 'color', value: i.accento, 'aria-label': 'Altro colore', onchange: (e: Event) => salva({ accento: (e.target as HTMLInputElement).value, preset: '' }) }))),
    riga('Sfondo', h('input', { type: 'color', value: i.sfondo || (document.documentElement.dataset.tema === 'scuro' ? '#0e1014' : '#f4f5f8'), onchange: (e: Event) => salva({ sfondo: (e.target as HTMLInputElement).value, preset: '' }) }),
      i.sfondo ? h('button.btn-testo', { onclick: () => salva({ sfondo: '', preset: '' }) }, 'Del tema') : null),
    riga('Carattere', sel([['sistema', 'Sistema'], ['arrotondato', 'Arrotondato'], ['serif', 'Serif'], ['mono', 'Monospazio']], i.font || 'sistema', 'font')),
    riga('Dimensione testo', sel([['0.9', 'Piccolo'], ['1', 'Normale'], ['1.1', 'Grande'], ['1.25', 'Molto grande']], String(i.scala || 1), 'scala', true)),
    riga('Densità', sel([['comoda', 'Comoda'], ['compatta', 'Compatta']], i.densita || 'comoda', 'densita')),
    riga('Angoli', sel([['4', 'Squadrati'], ['10', 'Leggeri'], ['14', 'Arrotondati'], ['22', 'Molto arrotondati']], String(i.raggio != null ? i.raggio : 14), 'raggio', true)));
}

function sezioneLayout(salva: SalvaImp): HTMLElement {
  const i = imp(), ord = (() => { const o = (i.widget || []).filter(w => WIDGET.some(x => x[0] === w)); for (const [w] of WIDGET) if (!o.includes(w)) (w === 'ripassi' || w === 'chiusura') ? o.unshift(w) : o.push(w); return o; })();
  const nasc = new Set(i.widgetNascosti || []), tabN = new Set(i.tabNascoste || []);
  const sposta = (idx: number, d: number) => { const o = ord.slice(); const [x] = o.splice(idx, 1); o.splice(idx + d, 0, x); salva({ widget: o, preset: '' }); };
  return scheda('Layout',
    riga('Vista iniziale', selettore([['oggi', 'Oggi'], ['giorno', 'Giorno'], ['settimana', 'Settimana'], ['mese', 'Mese'], ['agenda', 'Agenda']], i.vistaIniziale, function (this: HTMLSelectElement) { salva({ vistaIniziale: this.value as Impostazioni['vistaIniziale'], preset: '' }); })),
    riga('Barra delle sezioni su PC', selettore([['auto', 'Laterale'], ['basso', 'In basso']], i.nav || 'auto', function (this: HTMLSelectElement) { salva({ nav: this.value as Impostazioni['nav'], preset: '' }); })),
    h('div.gruppo-titolo', null, 'Riquadri di Oggi (ordine e visibilità)'),
    ord.map((w, idx) => h('div.widget-riga', null,
      h('span.nome', null, (WIDGET.find(x => x[0] === w) || [w, w])[1]),
      h('button.btn-ico', { 'aria-label': 'Su', disabled: idx === 0, onclick: () => sposta(idx, -1) }, '↑'),
      h('button.btn-ico', { 'aria-label': 'Giù', disabled: idx === ord.length - 1, onclick: () => sposta(idx, 1) }, '↓'),
      h('label.interruttore', { title: 'Mostra' }, h('input', { type: 'checkbox', checked: !nasc.has(w), onchange: (e: Event) => { (e.target as HTMLInputElement).checked ? nasc.delete(w) : nasc.add(w); salva({ widgetNascosti: Array.from(nasc), preset: '' }); } }), h('span')))),
    h('div.gruppo-titolo', null, 'Sezioni nella barra'),
    [['cal', 'Calendario'], ['studio', 'Studio'], ['task', 'Promemoria'], ['note', 'Note']].map(([s, t]) => h('div.widget-riga', null, h('span.nome', null, t),
      h('label.interruttore', null, h('input', { type: 'checkbox', checked: !tabN.has(s), onchange: (e: Event) => { (e.target as HTMLInputElement).checked ? tabN.delete(s) : tabN.add(s); salva({ tabNascoste: Array.from(tabN), preset: '' }); } }), h('span')))));
}

const PRESET_BASE: { nome: string; valori: Partial<Impostazioni> }[] = [
  { nome: 'Predefinito', valori: { tema: 'auto', accento: '#6c8cff', sfondo: '', font: 'sistema', scala: 1, densita: 'comoda', raggio: 14, widget: [], widgetNascosti: [], tabNascoste: [], nav: 'auto', vistaIniziale: 'oggi' } },
  { nome: 'Studio intenso', valori: { tema: 'scuro', accento: '#e9a23b', sfondo: '', font: 'sistema', scala: 1, densita: 'compatta', raggio: 10, widget: ['studio', 'impegni', 'promemoria', 'tabelle', 'nota', 'domani'], widgetNascosti: ['domani'], tabNascoste: [], nav: 'auto', vistaIniziale: 'oggi' } },
  { nome: 'Minimal', valori: { tema: 'chiaro', accento: '#64748b', sfondo: '#ffffff', font: 'sistema', scala: 1, densita: 'comoda', raggio: 4, widget: ['impegni', 'promemoria', 'studio', 'nota', 'tabelle', 'domani'], widgetNascosti: ['tabelle', 'domani'], tabNascoste: ['note'], nav: 'auto', vistaIniziale: 'oggi' } },
];
function sezionePreset(salva: SalvaImp): HTMLElement {
  const i = imp(), miei = Stato.tutti<Preset>('preset').sort((a, b) => a.nome.localeCompare(b.nome));
  const applica = (nome: string, v: Partial<Impostazioni>) => { salva({ ...JSON.parse(JSON.stringify(v)), preset: nome }); avviso('Preset «' + nome + '» applicato'); };
  return scheda('Preset',
    h('div.chips', null,
      PRESET_BASE.map(p => h('button.chip' + (i.preset === p.nome ? '.attivo' : ''), { onclick: () => applica(p.nome, p.valori) }, p.nome)),
      miei.map(p => h('button.chip' + (i.preset === p.nome ? '.attivo' : ''), { onclick: async () => {
        const s = await chiedi(p.nome, [{ testo: 'Applica', valore: 'a' }, { testo: 'Sovrascrivi con l\'aspetto attuale', valore: 's' }, { testo: 'Elimina preset', valore: 'd', pericolo: true }]);
        if (s === 'a') applica(p.nome, p.valori);
        else if (s === 's') { p.valori = valoriAttuali(); Stato.salva(p); avviso('Preset aggiornato'); }
        else if (s === 'd') Stato.elimina(p.id);
      } }, '★ ' + p.nome))),
    h('button.btn.neutro', { style: { marginTop: '8px' }, onclick: () => {
      const nome = h('input.titolo-grande', { type: 'text', placeholder: 'Nome del preset (es. Esami)' }) as HTMLInputElement;
      foglio({ titolo: 'Salva preset', corpo: h('div.modulo', null, nome, h('div.tenue.piccolo', null, 'Salva tema, colori, carattere, densità e layout attuali.')),
        salva: () => { const n = nome.value.trim(); if (!n) return false; Stato.salva({ id: 'preset-' + uid(), type: 'preset', updatedAt: 0, nome: n, valori: valoriAttuali() }); salva({ preset: n }); } });
      setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) nome.focus(); }, 50);
    } }, 'Salva l\'aspetto attuale come preset'));
}
function valoriAttuali(): Partial<Impostazioni> { const i = imp(), v: any = {}; for (const k of CAMPI_ASPETTO) if ((i as any)[k] !== undefined) v[k] = JSON.parse(JSON.stringify((i as any)[k])); return v; }

function sezioneCalendari(salva: SalvaImp): HTMLElement {
  const i = imp(), cats = new Set(i.gcalCategorie || []);
  const fileIcs = h('input', { type: 'file', accept: '.ics,text/calendar', style: { display: 'none' }, onchange: () => {
    const f = fileIcs.files && fileIcs.files[0]; if (!f) return;
    f.text().then(async txt => {
      const opz = [{ testo: 'Nessuna categoria', valore: '' }].concat(categorie().map(c => ({ testo: c.nome, valore: c.id })));
      const cat = await chiedi('In quale categoria?', opz, f.name);
      if (cat === null) return;
      const n = importaIcs(txt, cat || undefined); avviso(n ? 'Importati ' + n + ' eventi da ' + f.name : 'Nessun evento trovato nel file.');
    });
  } }) as HTMLInputElement;
  const esporta = () => {
    const a = h('a', { href: URL.createObjectURL(new Blob([esportaIcs()], { type: 'text/calendar' })), download: 'il-mio-calendario-' + ymd(new Date()) + '.ics' }) as HTMLAnchorElement;
    document.body.appendChild(a); a.click(); a.remove();
  };
  return scheda('Google Calendar e file .ics',
    h('div.tenue.piccolo', null, 'Gli avvisi dentro l\'app arrivano solo ad app aperta. Per le notifiche vere sull\'iPhone attiva lo specchio: gli eventi vengono copiati in un calendario Google dedicato («' + GCal.GCAL_NOME + '») e le notifiche arrivano dall\'app Google Calendar o da Calendario di iOS (aggiungendo il tuo account Google). L\'app può toccare solo quel calendario, non gli altri tuoi.'),
    h('div.widget-riga', null, h('span.nome', null, 'Specchio su Google Calendar'),
      h('label.interruttore', null, h('input', { type: 'checkbox', checked: !!i.gcal, onchange: (e: Event) => {
        const on = (e.target as HTMLInputElement).checked;
        salva({ gcal: on });
        if (on) { Drive.login(); setTimeout(() => GCal.allinea(true).then(n => avviso('Specchio attivo: ' + n + ' elementi copiati su Google Calendar.')).catch(err => avviso('Specchio: ' + (err.message || err), 8000)), 2500); }
      } }), h('span'))),
    i.gcal ? [h('div.gruppo-titolo', null, 'Categorie da copiare (nessuna scelta = tutte)'),
      categorie().map(c => h('div.widget-riga', null, h('span.nome', null, h('span.campione', { style: { background: c.colore, display: 'inline-block', width: '12px', height: '12px', marginRight: '8px', verticalAlign: 'middle' } }), c.nome),
        h('label.interruttore', null, h('input', { type: 'checkbox', checked: cats.has(c.id), onchange: (e: Event) => { (e.target as HTMLInputElement).checked ? cats.add(c.id) : cats.delete(c.id); salva({ gcalCategorie: Array.from(cats) }); GCal.allinea(true).catch(() => { /* niente */ }); } }), h('span')))),
      h('div.widget-riga', null, h('span.nome', null, 'Copia anche il piano di studio'),
        h('label.interruttore', null, h('input', { type: 'checkbox', checked: !!i.gcalStudio, onchange: (e: Event) => { salva({ gcalStudio: (e.target as HTMLInputElement).checked }); GCal.allinea().then(n => avviso('Specchio aggiornato (' + n + ').')).catch(() => { /* niente */ }); } }), h('span'))),
      i.gcalStudio ? riga('Avviso dello studio', h('input', { type: 'time', value: i.gcalStudioOra || '', onchange: (e: Event) => { salva({ gcalStudioOra: (e.target as HTMLInputElement).value }); GCal.allinea().catch(() => { /* niente */ }); } }), h('span.tenue.piccolo', null, 'vuoto = tutto il giorno')) : null,
      h('div.tenue.piccolo', null, 'Si copiano: eventi delle categorie scelte, promemoria con un orario' + (i.gcalStudio ? ' e blocchi del piano di studio.' : '. Se non vedi nulla su Google Calendar, è probabile che non ci siano ancora eventi da copiare.')),
      h('button.btn.neutro', { onclick: () => GCal.allinea(true).then(n => avviso('Ricopiati ' + n + ' elementi.')).catch(err => { if (String(err.message).match(/NOLOGIN|403|401/)) { Drive.login(); avviso('Autorizza Google Calendar e riprova.'); } else avviso(String(err.message || err), 8000); }) }, 'Ricopia tutto ora')] : null,
    h('div.gruppo-titolo', null, 'File .ics'),
    h('div.bottoni', null, h('button.btn.neutro', { onclick: () => fileIcs.click() }, 'Importa .ics'), h('button.btn.neutro', { onclick: esporta }, 'Esporta .ics'), fileIcs));
}

// ---------- v0.7: Notifiche sul telefono (ntfy) ----------
function sezioneNotifiche(salva: SalvaImp): HTMLElement {
  const i = imp(), T = Object.assign({ promemoria: true, studio: true, sera: true, esami: true }, i.ntfyTipi || {});
  const priv = new Set(i.ntfyPrivate || []);
  const interr = (on: boolean, cambia: (v: boolean) => void) => h('label.interruttore', null, h('input', { type: 'checkbox', checked: on, onchange: (e: Event) => cambia((e.target as HTMLInputElement).checked) }), h('span'));
  const ora = (k: 'ntfyMattino' | 'ntfySera' | 'ntfySilenzioDa' | 'ntfySilenzioA', def: string) => h('input', { type: 'time', value: (i as any)[k] || def, onchange: (e: Event) => salva({ [k]: (e.target as HTMLInputElement).value || def } as any) });
  const tipo = (k: keyof typeof T, nome: string, nota: string) => h('div.widget-riga', null, h('span.nome', null, nome, h('div.tenue.piccolo', null, nota)), interr(!!T[k], v => salva({ ntfyTipi: Object.assign({}, T, { [k]: v }) })));
  const copia = (t: string) => { try { navigator.clipboard.writeText(t).then(() => avviso('Codice copiato: incollalo nell\'app ntfy.')); } catch (_) { avviso(t, 15000); } };
  const futuri = Stato.tutti<NotificaReg>('notifica').filter(r => r.at > Date.now()).length;
  return scheda('Notifiche sul telefono',
    h('div.tenue.piccolo', null, 'Avvisi anche ad app chiusa, tramite l\'app gratuita ntfy. L\'app programma le notifiche dei prossimi 3 giorni ogni volta che la apri o modifichi qualcosa.'),
    h('div.widget-riga', null, h('span.nome', null, 'Notifiche sul telefono'), interr(!!i.ntfy, v => { if (v) { Notifiche.attiva(); avviso('Attivate: segui i 3 passi qui sotto.', 6000); } else salva({ ntfy: false }); })),
    i.ntfy && i.ntfyTopic ? [
      h('div.gruppo-titolo', null, 'Collega l\'iPhone (una volta sola)'),
      h('ol.tenue.piccolo', { style: { paddingLeft: '18px', margin: '4px 0 8px' } },
        h('li', null, 'Installa «ntfy» dall\'App Store (gratis) e consenti le notifiche.'),
        h('li', null, 'In ntfy tocca «+», incolla il codice qui sotto e tocca «Subscribe».'),
        h('li', null, 'Torna qui e tocca «Prova»: deve arrivare «✅ Notifiche attive».')),
      h('div.widget-riga', null, h('code', { style: { fontSize: '12px', wordBreak: 'break-all' } }, i.ntfyTopic), h('button.btn.neutro', { onclick: () => copia(i.ntfyTopic!) }, 'Copia')),
      h('div.bottoni', null,
        h('button.btn', { onclick: () => Notifiche.prova().then(() => avviso('Inviata: controlla il telefono.')).catch(e => avviso('Invio non riuscito: ' + (e.message || e), 8000)) }, 'Prova'),
        h('button.btn.neutro', { onclick: () => Notifiche.allinea().then(n => avviso(n ? 'Mandate ' + n + ' notifiche.' : 'Già tutto programmato.')) }, 'Riprogramma ora'),
        h('button.btn.neutro', { onclick: async () => { const r = await chiedi('Nuovo codice?', [{ testo: 'Genera nuovo codice', valore: 'si', pericolo: true }], 'Il vecchio smette di ricevere. Dovrai iscriverti in ntfy al nuovo codice.'); if (r) { Notifiche.rigenera(); avviso('Nuovo codice creato.'); } } }, 'Nuovo codice')),
      h('div.tenue.piccolo', null, futuri + ' notifiche programmate nei prossimi giorni.'),
      h('div.gruppo-titolo', null, 'Cosa ricevere'),
      tipo('promemoria', 'Promemoria di eventi e task', 'quelli impostati negli eventi e nei promemoria con orario'),
      tipo('studio', 'Studio di oggi', 'la mattina: gli step del piano del giorno'),
      tipo('sera', 'Ripasso prima di dormire', 'la sera dei giorni di studio: 10–15 min di richiamo'),
      tipo('esami', 'Esami e simulazioni vicini', '7, 3 e 1 giorno prima'),
      h('div.gruppo-titolo', null, 'Orari'),
      riga('Studio di oggi', ora('ntfyMattino', Notifiche.PRED.mattino)),
      riga('Ripasso serale', ora('ntfySera', Notifiche.PRED.sera)),
      riga('Silenzio dalle', ora('ntfySilenzioDa', Notifiche.PRED.silDa)),
      riga('alle', ora('ntfySilenzioA', Notifiche.PRED.silA)),
      h('div.tenue.piccolo', null, 'Le notifiche che cadono nel silenzio arrivano alla fine del silenzio.'),
      h('div.gruppo-titolo', null, 'Categorie private (testo generico)'),
      h('div.tenue.piccolo', null, 'I testi passano dal server pubblico ntfy.sh senza cifratura. Per queste categorie arriva solo «Promemoria».'),
      categorie().map(c => h('div.widget-riga', null, h('span.nome', null, h('span.campione', { style: { background: c.colore, display: 'inline-block', width: '12px', height: '12px', marginRight: '8px', verticalAlign: 'middle' } }), c.nome),
        interr(priv.has(c.id), v => { v ? priv.add(c.id) : priv.delete(c.id); salva({ ntfyPrivate: Array.from(priv) }); }))),
    ] : null);
}

function sezioneStudio(salva: SalvaImp): HTMLElement {
  const i = imp() as any;
  const num = (k: string, def: number, min: number, max: number) => h('input', { type: 'number', min: String(min), max: String(max), inputMode: 'numeric', value: String(i[k] || def), onchange: (e: Event) => salva({ [k]: Math.max(min, Math.min(max, parseInt((e.target as HTMLInputElement).value, 10) || def)) } as any) });
  return scheda('Studio',
    riga('Sessione di studio', num('pomodoro', 25, 5, 180), h('span.dopo', null, 'min')),
    riga('Pausa', num('pausa', 5, 1, 60), h('span.dopo', null, 'min')),
    riga('Soglia "da rifare"', num('sogliaErrori', 70, 0, 100), h('span.dopo', null, '%')),
    riga('Ripassi al giorno', num('ripassoMinuti', 30, 10, 240), h('span.dopo', null, 'min')),
    h('div.tenue.piccolo', null, 'I ripassi (Oggi → Ripassi di oggi) riprogrammano le schede fatte con la ripetizione spaziata (FSRS): tornano quando stai per dimenticarle, prima se il punteggio era basso. Circa ' + Ripassi.MIN_SCHEDA + ' min a scheda.'));
}

// ---------- Trascinamento degli eventi (vista Giorno/Settimana) ----------
// Tieni premuto (circa 0,3 s) e trascina per spostare; trascina la lineetta in basso per cambiare la durata.
// Passi di 15 minuti; nella settimana si può spostare anche di giorno. Le serie chiedono "solo questo / tutta la serie".
const PASSO = 15;
function trascinabile(el: HTMLElement, o: Occ, nGiorni: number): HTMLElement {
  let x0 = 0, y0 = 0, attivo = false, ridim = false, dMin = 0, dGiorni = 0, timer = 0, larg = 0, mosso = false, pid = -1;
  const reset = () => { clearTimeout(timer); el.classList.remove('trascino'); el.style.transform = ''; el.style.height = el.dataset.h || el.style.height; attivo = false; pid = -1; };
  el.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    x0 = e.clientX; y0 = e.clientY; mosso = false; dMin = 0; dGiorni = 0; pid = e.pointerId;
    ridim = (e.target as HTMLElement).classList.contains('gr-maniglia');
    larg = (el.parentElement as HTMLElement).getBoundingClientRect().width;
    el.dataset.h = el.style.height;
    const parti = () => { attivo = true; el.classList.add('trascino'); try { el.setPointerCapture(pid); } catch (_) { /* niente */ } try { navigator.vibrate && navigator.vibrate(15); } catch (_) { /* niente */ } };
    if (e.pointerType === 'mouse' || ridim) parti(); else timer = window.setTimeout(parti, 300);
  });
  el.addEventListener('pointermove', (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!attivo) { if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(timer); return; }
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mosso = true;
    dMin = Math.round((dy / ORA_PX) * 60 / PASSO) * PASSO;
    if (ridim) { const h0 = parseFloat(el.dataset.h || '0'); el.style.height = Math.max(ORA_PX / 4, h0 + (dMin / 60) * ORA_PX) + 'px'; return; }
    dGiorni = nGiorni > 1 ? Math.round(dx / larg) : 0;
    el.style.transform = 'translate(' + dGiorni * larg + 'px,' + (dMin / 60) * ORA_PX + 'px)';
  });
  el.addEventListener('touchmove', (e: TouchEvent) => { if (attivo) e.preventDefault(); }, { passive: false });
  const fine = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    const eraAttivo = attivo && mosso, dm = dMin, dg = dGiorni, r = ridim;
    reset();
    if (!eraAttivo || (!dm && !dg)) return;
    el.dataset.trascinato = '1'; setTimeout(() => delete el.dataset.trascinato, 50);
    spostaOccorrenza(o, r ? 0 : dm + dg * 1440, dm);
  };
  el.addEventListener('pointerup', fine);
  el.addEventListener('pointercancel', (e: PointerEvent) => { if (e.pointerId === pid) reset(); });
  // dopo un trascinamento non deve aprirsi l'editor
  el.addEventListener('click', (e: Event) => { if (el.dataset.trascinato) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  return el;
}
/** Sposta un'occorrenza: deltaInizio (min) sposta tutto, deltaFine (min) allunga/accorcia solo la fine (ridimensionamento). */
async function spostaOccorrenza(o: Occ, deltaInizio: number, deltaFine: number): Promise<void> {
  const ridim = deltaInizio === 0;
  const nuovoI = piuMinuti(o.inizio, deltaInizio), nuovaF = piuMinuti(o.fine, ridim ? deltaFine : deltaInizio);
  if (nuovaF <= nuovoI) return;
  const ev = Stato.prendi<Evento>(o.ev.id); if (!ev) return;
  if (!ev.rrule) { ev.inizio = dtStr(nuovoI); ev.fine = dtStr(nuovaF); Stato.salva(ev); avviso('Spostato: ' + ev.titolo + ' · ' + dataBreve(nuovoI) + ' ' + hm(nuovoI) + '–' + hm(nuovaF)); return; }
  const s = await chiedi('Evento ricorrente', [{ testo: 'Solo questo evento', valore: 'uno' }, { testo: 'Tutta la serie', valore: 'tutti' }], ev.titolo);
  if (s === 'uno') {
    ev.exdate = (ev.exdate || []).concat([o.chiave]); Stato.salva(ev);
    Stato.salva({ ...JSON.parse(JSON.stringify(ev)), id: uid(), rrule: undefined, exdate: undefined, serieId: ev.id, inizio: dtStr(nuovoI), fine: dtStr(nuovaF) });
  } else if (s === 'tutti') {
    const i0 = piuMinuti(daDt(ev.inizio), deltaInizio), f0 = piuMinuti(daDt(ev.fine), ridim ? deltaFine : deltaInizio);
    ev.inizio = dtStr(i0); ev.fine = dtStr(f0); Stato.salva(ev);
  }
}
