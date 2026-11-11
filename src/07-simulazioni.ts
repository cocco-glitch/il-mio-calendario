// 07-simulazioni.ts — Modalità simulazione d'esame (v0.11, tattica T14).
//
// Le schede di consolidamento/simulazione (31 domande, 50 minuti) stanno su Drive in una cartella
// trovata per nome ("consolidamento" o "simulazion", modificabile salvando imp().cartellaSimulazioni).
// La simulazione si apre a schermo intero con il conto alla rovescia (predefinito 50 min), lo schermo
// resta acceso (Wake Lock, dove supportato), avvisi a 10 minuti dalla fine e allo scadere; il risultato
// si legge in automatico (07-cattura) e si salva in un record 'simulazione'. I file non vengono toccati.

interface Simulazione extends Rec {
  type: 'simulazione';
  data: string; ora: string; fileId: string; nome: string;
  pct?: number; giuste?: number | null; totale?: number | null;
  deboli?: [string, number, number][]; debole?: string | null;
  minuti: number;          // minuti effettivi
  limite: number;          // minuti concessi
}

const Simulazioni = (() => {
  async function cartella(): Promise<string | null> {
    const i = imp() as any;
    if (i.cartellaSimulazioni) return i.cartellaSimulazioni;
    for (const t of ['consolidamento', 'simulazion', 'Simulazion']) {
      const r = await Drive.cercaCartelle(t);
      if (r.length) { i.cartellaSimulazioni = r[0].id; Stato.salva(i, true); return r[0].id; }
    }
    return null;
  }
  async function file(): Promise<{ id: string; name: string }[]> {
    const c = await cartella(); if (!c) return [];
    return (await Drive.elencaTutti(c)).filter(f => /\.html?$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }));
  }
  const tutte = () => Stato.tutti<Simulazione>('simulazione').sort((a, b) => (a.data + a.ora) < (b.data + b.ora) ? 1 : -1);
  const minutiPredefiniti = () => (imp() as any).minutiSimulazione || 50;
  return { file, tutte, minutiPredefiniti };
})();

/** Elenco dei file di simulazione da scegliere. */
async function apriSimulazioni(): Promise<void> {
  if (serveGoogle()) return;
  const corpo = h('div.modulo', null, h('div.vuoto.centro', null, 'Cerco le simulazioni su Drive…'));
  const f = foglio({ titolo: 'Simulazione d\'esame', corpo });
  try {
    const lista = await Simulazioni.file();
    svuota(corpo);
    if (!lista.length) { corpo.appendChild(h('div.vuoto', null, 'Non trovo la cartella delle simulazioni su Drive (nome con «consolidamento» o «simulazioni»).')); return; }
    const fatte = Simulazioni.tutte();
    corpo.append(
      h('div.tenue.piccolo', null, 'Condizioni d\'esame: ' + Simulazioni.minutiPredefiniti() + ' minuti, schermo intero, senza appunti. Attiva «Full immersion» sull\'iPhone per non ricevere notifiche.'),
      h('div.gruppo', null, lista.map(x => {
        const prec = fatte.filter(s => s.fileId === x.id);
        return h('button.voce-lista', { onclick: () => { f.chiudi(); avviaSimulazione(x.id, x.name.replace(/\.html?$/i, '')); } },
          h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, x.name.replace(/\.html?$/i, '')),
            h('span.voce-sotto', null, prec.length ? 'Fatta ' + prec.length + (prec.length === 1 ? ' volta' : ' volte') + ' · ultima ' + (prec[0].pct != null ? prec[0].pct + '%' : '—') + ' il ' + prec[0].data.slice(8) + '/' + prec[0].data.slice(5, 7) : 'Mai fatta')),
          icona('dx', 18));
      })));
  } catch (e: any) { svuota(corpo); corpo.appendChild(h('div.vuoto', null, String(e.message || e))); }
}

/** Esegue una simulazione a tempo. */
async function avviaSimulazione(fileId: string, nome: string, limite = Simulazioni.minutiPredefiniti()): Promise<void> {
  const inizio = Date.now(), fine = inizio + limite * 60000;
  let lock: any = null, tick = 0, salvata = false, avvisato10 = false, scaduto = false;
  const orologio = h('span.sim-orologio', { 'aria-live': 'off' }, limite + ':00');
  const barra = h('div.sim-barra', null, h('div.sim-riempi'));
  const v = visore('⏱ ' + nome, () => { clearInterval(tick); try { lock && lock.release(); } catch (_) { /* niente */ } });
  v.barra.appendChild(orologio);
  v.corpo.appendChild(h('div.vuoto.centro', null, 'Scarico la simulazione da Drive…'));
  const aggiorna = () => {
    const resta = Math.max(0, fine - Date.now()), m = Math.floor(resta / 60000), s = Math.floor(resta / 1000) % 60;
    orologio.textContent = m + ':' + String(s).padStart(2, '0');
    (barra.firstChild as HTMLElement).style.width = (100 - resta / (limite * 600)) + '%';
    orologio.classList.toggle('ultimi', resta <= 10 * 60000);
    if (!avvisato10 && resta <= 10 * 60000 && limite > 10) { avvisato10 = true; avviso('⏱ Mancano 10 minuti.', 6000); }
    if (!scaduto && resta === 0) { scaduto = true; avviso('⏰ Tempo scaduto: chiudi il quiz e guarda il risultato (come all\'esame, le domande senza risposta contano sbagliate).', 12000); }
  };
  try {
    let html = await Drive.scaricaTesto(fileId);
    const toppa = '<script>try{window.localStorage.getItem("x")}catch(e){(function(){var m={};var s={getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}}};try{Object.defineProperty(window,"localStorage",{value:s});Object.defineProperty(window,"sessionStorage",{value:s})}catch(_){}})()}<\/script>';
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, x => x + toppa) : toppa + html;
    html = Cattura.inietta(html);
    svuota(v.corpo);
    const fr = h('iframe.visore-frame', { sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals', srcdoc: html, title: nome }) as HTMLIFrameElement;
    v.corpo.append(barra, fr);
    try { lock = await (navigator as any).wakeLock?.request('screen'); } catch (_) { /* non supportato */ }
    tick = window.setInterval(aggiorna, 1000); aggiorna();
    Cattura.osserva(fr, 'sim:' + fileId, nome, d => {
      if (d.errori) { avviso('📝 Errori rifatti: ' + (d.giuste ?? '') + '/' + (d.totale ?? '') + ' (non cambia il risultato della simulazione)'); return; }
      const adesso = new Date(), minuti = Math.round((Date.now() - inizio) / 60000);
      const rec: Simulazione = { id: 'sim-' + inizio, type: 'simulazione', updatedAt: 0, data: ymd(adesso), ora: hm(new Date(inizio)), fileId, nome,
        pct: d.pct, giuste: d.giuste, totale: d.totale, deboli: d.livelli, debole: d.debole, minuti, limite };
      Stato.salva(rec); salvata = true;
      clearInterval(tick);
      avviso('✅ Simulazione salvata: ' + d.pct + '%' + (d.giuste != null ? ' (' + d.giuste + '/' + d.totale + ')' : '') + ' in ' + minuti + ' min' + (minuti > limite ? ' · fuori tempo di ' + (minuti - limite) + ' min' : '') + ' · tocca per annullare', 9000, () => { Stato.elimina(rec.id); avviso('Simulazione non salvata.'); });
    });
  } catch (e: any) { svuota(v.corpo); v.corpo.appendChild(h('div.vuoto.centro', null, String(e.message || e))); }
}

/** Riquadro in Studio → Esami: storico e pulsante. */
function sezioneSimulazioni(): HTMLElement {
  const s = Simulazioni.tutte();
  return h('section.card', null, h('h2.card-titolo', null, 'Simulazioni a tempo'),
    h('div.bottoni', null, h('button.btn', { onclick: apriSimulazioni }, '▶ Nuova simulazione (' + Simulazioni.minutiPredefiniti() + ' min)')),
    s.length ? s.slice(0, 12).map(x => h('div.widget-riga', null,
      h('span.nome', null, x.nome, h('div.tenue.piccolo', null, x.data.slice(8) + '/' + x.data.slice(5, 7) + ' · ' + x.minuti + '/' + x.limite + ' min' + (x.debole ? ' · debole: ' + x.debole : ''))),
      h('b', { style: { fontVariantNumeric: 'tabular-nums' } }, x.pct != null ? x.pct + '%' : '—'))) : h('div.tenue.piccolo', null, 'Nessuna simulazione ancora. La prossima del piano: Simulazione 3, domenica 22/11.'));
}
