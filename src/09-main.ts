// ============================================================
// 07-main.ts — Avvio, struttura della pagina, tema, avvisi in-app.
// ============================================================

const VERSIONE = '0.26.0';

function applicaTema(): void {
  const i = imp();
  const scuro = i.tema === 'scuro' || (i.tema === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.tema = scuro ? 'scuro' : 'chiaro';
  const r = document.documentElement, st = r.style;
  st.setProperty('--accento', i.accento);
  if (i.sfondo) st.setProperty('--bg', i.sfondo); else st.removeProperty('--bg');
  const FONT: Record<string, string> = { sistema: '', arrotondato: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif', serif: 'ui-serif, "New York", Georgia, "Times New Roman", serif', mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' };
  if (i.font && FONT[i.font]) st.setProperty('--font', FONT[i.font]); else st.removeProperty('--font');
  st.setProperty('--scala', String(i.scala || 1));
  st.setProperty('--raggio', (i.raggio != null ? i.raggio : 14) + 'px');
  r.dataset.densita = i.densita || 'comoda';
  r.dataset.nav = i.nav || 'auto';
  r.dataset.vetro = (i as any).vetro === false || (i as any).vetro === 'no' ? 'no' : 'si';   // v0.20: vetro leggero (disattivabile)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', i.sfondo || (scuro ? '#0e1014' : '#f4f5f8'));
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

  const titoli: Record<Scheda, string> = { oggi: 'Oggi', cal: 'Calendario', studio: 'Studio', task: 'Promemoria', note: 'Note', altro: 'Impostazioni', cerca: 'Cerca' };
  const vista = UI.scheda === 'oggi' ? vistaOggi() : UI.scheda === 'cal' ? vistaCalendario() : UI.scheda === 'studio' ? vistaStudio() : UI.scheda === 'task' ? vistaTask()
    : UI.scheda === 'note' ? vistaNote() : UI.scheda === 'cerca' ? vistaCerca() : vistaAltro();

  const daFare = Stato.tutti<Task>('task').filter(t => !t.fatto && t.scadenza && (taskScaduto(t) || t.scadenza.slice(0, 10) === ymd(oggi()))).length;
  const schede: [Scheda, string, string][] = [['oggi', 'Oggi', 'oggi'], ['cal', 'Calendario', 'cal'], ['studio', 'Studio', 'studio'], ['task', 'Promemoria', 'task'], ['note', 'Note', 'note'], ['altro', 'Altro', 'altro']];
  const nascoste = imp().tabNascoste || [];
  const nav = h('nav.tabbar', { 'aria-label': 'Sezioni' }, schede.filter(([s]) => s === 'oggi' || s === 'altro' || !nascoste.includes(s)).map(([s, t, ic]) =>
    h('button' + (UI.scheda === s ? '.attivo' : ''), { onclick: () => { if (s === 'studio') UI.studioSub = null; vai(s); }, 'aria-current': UI.scheda === s ? 'page' : null },
      h('span.tab-ico', null, icona(ic), s === 'task' && daFare ? h('span.badge', null, String(daFare)) : null),
      h('span.tab-eti', null, t))));

  const giornoNuovo = UI.scheda === 'cal' ? UI.data : undefined;
  const nuovo = () => UI.scheda === 'task' ? apriTask() : UI.scheda === 'note' ? apriNota() : apriNuovo(giornoNuovo);

  const main = h('main' + (stessaScheda ? '' : '.entra'), { 'data-scheda': UI.scheda + (UI.scheda === 'cal' ? UI.vista : '') }, vista);
  svuota(app);
  aggiungi(app, [
    h('header.testata', null,
      h('h1', null, titoli[UI.scheda]),
      h('div.testata-azioni', null,
        Drive.stato.sync === 'spento' ? null : h('button.sync-ind', { 'aria-label': descrSync().testo, title: descrSync().testo, onclick: () => { if (Drive.stato.sync === 'errore' || Drive.stato.sync === 'attesa') Drive.login(); else vai('altro'); } }, h('span.sync-pallino.' + descrSync().cls)),
        h('button.btn-ico', { 'aria-label': 'Cerca', onclick: () => vai('cerca') }, icona('cerca')),
        h('button.btn-ico.solo-pc', { 'aria-label': 'Nuovo', onclick: nuovo }, icona('piu')))),
    nav, main,
    UI.scheda === 'altro' || UI.scheda === 'cerca' || UI.scheda === 'studio' ? null : h('button.fab', { 'aria-label': 'Nuovo', onclick: nuovo }, icona('piu', 26)),
  ]);

  const griglia = app.querySelector('.gr-scroll');
  if (griglia) {
    if (scrollGriglia >= 0 && stessaScheda) griglia.scrollTop = scrollGriglia;
    else griglia.scrollTop = Math.max(0, (Math.min(new Date().getHours(), 20) - 1.5) * ORA_PX); // parte vicino all'ora attuale
  }
  if (stessaScheda) main.scrollTop = scrollMain;
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
  Drive.ascolta(() => { if (!document.querySelector('.foglio-sfondo')) disegna(); });
  disegna();
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
