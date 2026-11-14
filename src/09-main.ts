// ============================================================
// 07-main.ts — Avvio, struttura della pagina, tema, avvisi in-app.
// ============================================================

const VERSIONE = '0.37.0';

function applicaTema(): void {
  const i = imp();
  const scuro = i.tema === 'scuro' || (i.tema === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.tema = scuro ? 'scuro' : 'chiaro';
  const r = document.documentElement, st = r.style;
  // v0.34: il vecchio blu predefinito passa al nuovo blu del rebranding
  st.setProperty('--accento', !i.accento || i.accento === '#6c8cff' ? '#2f6bea' : i.accento);
  r.dataset.animazioni = (i as any).animazioni === 'no' ? 'no' : 'si';
  if (i.sfondo) st.setProperty('--bg', i.sfondo); else st.removeProperty('--bg');
  const FONT: Record<string, string> = { sistema: '', arrotondato: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif', serif: 'ui-serif, "New York", Georgia, "Times New Roman", serif', mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' };
  if (i.font && FONT[i.font]) st.setProperty('--font', FONT[i.font]); else st.removeProperty('--font');
  st.setProperty('--scala', String(i.scala || 1));
  st.setProperty('--raggio', (i.raggio != null ? i.raggio : 14) + 'px');
  r.dataset.densita = i.densita || 'comoda';
  r.dataset.nav = i.nav || 'auto';
  r.dataset.vetro = (i as any).vetro === false || (i as any).vetro === 'no' ? 'no' : 'si';   // v0.20: vetro leggero (disattivabile)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', i.sfondo || (scuro ? '#0b0d12' : '#f5f7fa'));
}

/** Ricostruisce l'intera schermata (le viste sono leggere: va benissimo così). */
function disegna(): void {
  const app = document.getElementById('app')!;
  // ricordo lo scorrimento della griglia oraria per non "saltare" a ogni salvataggio
  const vecchiaGriglia = app.querySelector('.gr-scroll');
  const scrollGriglia = vecchiaGriglia ? vecchiaGriglia.scrollTop : -1;
  const vecchioMain = app.querySelector('main');
  const scrollMain = vecchioMain ? vecchioMain.scrollTop : 0;
  const stessaScheda = vecchioMain && vecchioMain.dataset.scheda === UI.scheda + (UI.scheda === 'cal' ? UI.vista : '');

  const titoli: Record<Scheda, string> = { oggi: 'Oggi', cal: 'Calendario', studio: 'Studio', appunti: 'Appunti', task: 'Promemoria', note: 'Note', altro: UI.altroSez ? (GRUPPI_ALTRO.find(g => g[0] === UI.altroSez) || ['', 'Altro'])[1] : 'Altro', cerca: 'Cerca' };
  const vista = UI.scheda === 'oggi' ? vistaOggi() : UI.scheda === 'cal' ? vistaCalendario() : UI.scheda === 'studio' ? vistaStudio() : UI.scheda === 'task' ? vistaTask()
    : UI.scheda === 'note' ? vistaNote() : UI.scheda === 'appunti' ? vistaAppunti() : UI.scheda === 'cerca' ? vistaCerca() : vistaAltro();

  const daFare = Stato.tutti<Task>('task').filter(t => !t.fatto && t.scadenza && (taskScaduto(t) || t.scadenza.slice(0, 10) === ymd(oggi()))).length;
  // v0.34: 5 sezioni in barra; Promemoria e Note vivono in Altro (con scorciatoie in Oggi)
  const schede: [Scheda, string, string][] = [['oggi', 'Oggi', 'oggi'], ['cal', 'Calendario', 'cal'], ['studio', 'Studio', 'studio'], ['appunti', 'Appunti', 'appunti'], ['altro', 'Altro', 'altro']];
  const nascoste = imp().tabNascoste || [];
  const inAltro = UI.scheda === 'task' || UI.scheda === 'note';
  const nav = h('nav.tabbar', { 'aria-label': 'Sezioni' }, schede.filter(([s]) => s === 'oggi' || s === 'altro' || !nascoste.includes(s)).map(([s, t, ic]) => {
    const att = UI.scheda === s || (s === 'altro' && inAltro);
    return lungo(h('button' + (att ? '.attivo' : ''), { onclick: () => { if (s === 'studio') UI.studioSub = null; if (s === 'altro') UI.altroSez = null; vai(s); }, 'aria-current': att ? 'page' : null },
      h('span.tab-ico', null, icona(ic), s === 'altro' && daFare ? h('span.badge', null, String(daFare)) : null),
      h('span.tab-eti', null, t)), () => MenuLungo.sezione(s), t);
  }));
  // direzione dell'animazione: verso destra o sinistra secondo la posizione in barra
  const ordine = ['oggi', 'cal', 'studio', 'appunti', 'altro', 'task', 'note', 'cerca'];
  const prima = vecchioMain ? ordine.indexOf((vecchioMain.dataset.scheda || '').replace(/(giorno|settimana|mese|agenda)$/, '')) : -1;
  const dir = prima < 0 ? '' : ordine.indexOf(UI.scheda) >= prima ? '.da-dx' : '.da-sx';
  const indietro = inAltro || (UI.scheda === 'altro' && UI.altroSez)
    ? h('button.indietro', { onclick: () => { if (UI.scheda === 'altro') UI.altroSez = null; vai('altro'); } }, icona('sx', 20), 'Altro') : null;
  const giornoNuovo = UI.scheda === 'cal' ? UI.data : undefined;
  const nuovo = () => UI.scheda === 'task' ? apriTask() : UI.scheda === 'note' ? apriNota() : UI.scheda === 'appunti' ? apriAppunto() : apriNuovo(giornoNuovo);

  const main = h('main' + (stessaScheda ? '' : '.entra' + dir), { 'data-scheda': UI.scheda + (UI.scheda === 'cal' ? UI.vista : '') }, vista);
  svuota(app);
  aggiungi(app, [
    h('header.testata', null,
      h('div.testata-tit', null, indietro, h('h1', null, titoli[UI.scheda])),
      h('div.testata-azioni', null,
        Drive.stato.sync === 'spento' ? null : h('button.sync-ind', { 'aria-label': descrSync().testo, title: descrSync().testo, onclick: () => { if (Drive.stato.sync === 'errore' || Drive.stato.sync === 'attesa') Drive.login(); else vai('altro'); } }, h('span.sync-pallino.' + descrSync().cls)),
        h('button.btn-ico', { 'aria-label': 'Cerca', onclick: () => vai('cerca') }, icona('cerca')),
        h('button.btn-ico' + (UI.scheda === 'oggi' ? '.piu-testa' : '.solo-pc'), { 'aria-label': 'Nuovo', onclick: nuovo }, icona('piu')))),
    nav, main,
    UI.scheda === 'altro' || UI.scheda === 'cerca' || UI.scheda === 'studio' || UI.scheda === 'oggi' ? null : h('button.fab', { 'aria-label': 'Nuovo', onclick: nuovo }, icona('piu', 26)),
  ]);

  const griglia = app.querySelector('.gr-scroll');
  if (griglia) {
    if (scrollGriglia >= 0 && stessaScheda) griglia.scrollTop = scrollGriglia;
    else griglia.scrollTop = Math.max(0, (Math.min(new Date().getHours(), 20) - 1.5) * ORA_PX); // parte vicino all'ora attuale
  }
  if (stessaScheda) main.scrollTop = scrollMain;
  else Tocco.conta(main);
  if (inAltro || (UI.scheda === 'altro' && UI.altroSez)) attivaIndietroSwipe(main);
  else attivaScorriSezioni(main, schede.filter(([s]) => s === 'oggi' || s === 'altro' || !nascoste.includes(s)).map(x => x[0]));
}

/** v0.35: scorrendo col dito a destra/sinistra si passa alla sezione accanto (la pagina segue il dito). */
const ZONE_SENZA_SCORRI = 'input, textarea, select, canvas, [contenteditable], .mano-foglio, .mano-barra, .segmenti, .chips, .gr-scroll, .mese, .cal, .tabella, .scorre, .tessere, .carta, .foglio, input[type=range]';
function attivaScorriSezioni(main: HTMLElement, ordine: Scheda[]): void {
  const i = ordine.indexOf(UI.scheda);
  if (i < 0 || UI.scheda === 'cal') return; // il calendario usa lo scorrimento per cambiare periodo
  let x0 = 0, y0 = 0, dx = 0, attivo = false, deciso = false, scartato = false, t0 = 0;
  const pag = () => main.firstElementChild as HTMLElement | null;
  const scorribile = (el: Element | null): boolean => {
    for (; el && el !== main; el = el.parentElement) if (el.scrollWidth > el.clientWidth + 4 && getComputedStyle(el).overflowX !== 'visible') return true;
    return false;
  };
  main.addEventListener('touchstart', e => {
    const t = e.target as Element;
    scartato = e.touches.length > 1 || !!t.closest(ZONE_SENZA_SCORRI) || scorribile(t) || e.touches[0].clientX < 24;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; attivo = false; deciso = false; t0 = performance.now();
  }, { passive: true });
  main.addEventListener('touchmove', e => {
    if (scartato) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!deciso) { if (Math.abs(mx) < 10 && Math.abs(my) < 10) return; deciso = true; attivo = Math.abs(mx) > Math.abs(my) * 1.4; if (!attivo) return; }
    if (!attivo) return;
    dx = mx;
    const bordo = (dx > 0 && i === 0) || (dx < 0 && i === ordine.length - 1);
    const p = pag(); if (p) { p.style.transition = 'none'; p.style.transform = 'translateX(' + (bordo ? dx / 4 : dx * 0.6) + 'px)'; p.style.opacity = String(1 - Math.min(Math.abs(dx) / 900, .35)); }
  }, { passive: true });
  main.addEventListener('touchend', () => {
    if (!attivo) return;
    const p = pag(), vel = Math.abs(dx) / Math.max(1, performance.now() - t0);
    const j = i + (dx < 0 ? 1 : -1);
    if ((Math.abs(dx) > 90 || (vel > .5 && Math.abs(dx) > 40)) && j >= 0 && j < ordine.length) {
      if (p) { p.style.transition = 'transform .14s ease-in, opacity .14s'; p.style.transform = 'translateX(' + (dx < 0 ? -80 : 80) + 'px)'; p.style.opacity = '0'; }
      Tocco.clic(0.7);
      setTimeout(() => { if (ordine[j] === 'studio') UI.studioSub = null; if (ordine[j] === 'altro') UI.altroSez = null; vai(ordine[j]); }, 120);
    } else if (p) { p.style.transition = 'transform .3s var(--molla, ease), opacity .3s'; p.style.transform = ''; p.style.opacity = ''; }
  }, { passive: true });
}

/** v0.34: nelle sotto-pagine si torna indietro scorrendo dal bordo sinistro (come su iPhone). */
function attivaIndietroSwipe(el: HTMLElement): void {
  let x0 = -1, y0 = 0;
  el.addEventListener('touchstart', e => { const t = e.touches[0]; x0 = t.clientX < 28 ? t.clientX : -1; y0 = t.clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 < 0) return;
    const t = e.changedTouches[0];
    if (t.clientX - x0 > 80 && Math.abs(t.clientY - y0) < 60) { if (UI.scheda === 'altro') UI.altroSez = null; vai('altro'); }
  }, { passive: true });
}

/** v0.34: una volta sola, dico dove sono finiti Promemoria e Note. */
function avvisoNovita(): void {
  if (navigator.webdriver) return; // nei test automatici niente finestre
  try {
    if (localStorage.getItem('imc-novita-035')) return;
    if (!Stato.tutti<Task>('task').length && !Stato.tutti<Nota>('nota').length) { localStorage.setItem('imc-novita-035', '1'); return; }
  } catch (_) { return; }
  chiedi('Nuova grafica', [{ testo: 'Ho capito', valore: 'ok' }], '• Scorri col dito a destra o sinistra per passare da una sezione all\'altra.\n• Tieni premuto un pulsante della barra, un esame o una voce del piano: compaiono le scorciatoie collegate.\n• Promemoria e Note ora sono in Altro (in alto) e restano nei riquadri di Oggi.\n• Nelle pagine a mano: due dita per ingrandire.')
    .then(() => { try { localStorage.setItem('imc-novita-035', '1'); } catch (_) { /* niente */ } });
}

// ---------- Avvisi in-app (Livello 1 dei promemoria) ----------
// Controlla ogni 30 s cosa è "scattato" dall'ultimo controllo; all'apertura
// mostra anche ciò che è scattato mentre l'app era chiusa (ultime 12 ore).
function controllaAvvisi(): void {
  const CHIAVE = 'imc-ultimo-controllo';
  const adesso = Date.now();
  let ultimo = adesso - 60000;
  try { const v = parseInt(localStorage.getItem(CHIAVE) || '', 10); if (v) ultimo = Math.max(v, adesso - 12 * 3600000); } catch (_) { /* niente */ }
  try { localStorage.setItem(CHIAVE, String(adesso)); } catch (_) { /* niente */ }

  for (const o of occorrenzeTra(new Date(ultimo - 86400000), new Date(adesso + 3 * 86400000))) {
    if (o.fine.getTime() < adesso) continue; // già finito: inutile avvisare
    for (const min of o.ev.promemoria || []) {
      const scatto = o.inizio.getTime() - min * 60000;
      if (scatto > ultimo && scatto <= adesso) {
        const quando = stessoGiorno(o.inizio, new Date()) ? 'alle ' + hm(o.inizio) : dataRelativa(o.inizio).toLowerCase() + ' alle ' + hm(o.inizio);
        avviso('🔔 ' + o.ev.titolo + (o.ev.tuttoIlGiorno ? ' — ' + dataRelativa(o.inizio).toLowerCase() : ' — ' + quando), 15000, () => apriEvento(o.ev, o));
      }
    }
  }
  for (const t of Stato.tutti<Task>('task')) {
    if (t.fatto || !t.scadenza || t.scadenza.length <= 10) continue;
    const scatto = daDt(t.scadenza).getTime();
    if (scatto > ultimo && scatto <= adesso) avviso('☑️ ' + t.titolo + ' — scade adesso', 15000, () => apriTask(t));
  }
}

async function avvia(): Promise<void> {
  await Stato.carica();
  applicaTema();
  const v = imp().vistaIniziale;
  if (v && v !== 'oggi') { UI.scheda = 'cal'; UI.vista = v; }
  Stato.ascolta(disegna);
  Ripassi.inizializza();
  Stato.pulisci(); // v0.17: lapidi vecchie del registro notifiche
  Stato.ascolta(() => { Ripassi.inizializza(); }); // v0.7: memoria per le schede fatte (anche da altri dispositivi)
  Stato.ascolta(Notifiche.programma); // v0.7: riallinea le notifiche sul telefono a ogni modifica
  Drive.ascolta(() => { if (!document.querySelector('.foglio-sfondo')) disegna(); if (Drive.stato.sync === 'ok' && !Spiega.attiva) Spiega.recuperaDaDrive(); });
  attivaSimboli();
  Tocco.attiva();
  disegna();
  avvisoNovita();
  Drive.precarica();
  Timer.parti();
  Studio.caricaDalSito();
  if (Drive.collegato && navigator.onLine) Drive.sincronizza(false);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applicaTema);

  controllaAvvisi();
  setInterval(controllaAvvisi, 30000);
  Notifiche.programma();
  // Al ritorno sull'app (es. dalla Home dell'iPhone) aggiorno giorno e avvisi.
  let giornoMostrato = ymd(new Date());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    controllaAvvisi();
    Timer.aggiorna();
    if (Drive.collegato) Drive.sincronizza(false);
    Notifiche.programma();
    if (giornoMostrato !== ymd(new Date())) { giornoMostrato = ymd(new Date()); UI.data = oggi(); }
    if (!document.querySelector('.foglio-sfondo')) disegna();
  });

  // Service worker: cache dell'app per l'uso offline (solo sul sito vero, non nell'anteprima).
  if ('serviceWorker' in navigator && location.protocol === 'https:' && document.querySelector('link[rel="manifest"]')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline non disponibile */ });
  }
  // Chiedo al browser di non cancellare i dati locali quando lo spazio scarseggia.
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) { /* niente */ }
}

avvia().catch(err => {
  document.getElementById('app')!.textContent = 'Errore di avvio: ' + (err && err.message || err);
});
