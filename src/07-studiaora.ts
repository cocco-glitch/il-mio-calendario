// 07-studiaora.ts — "Studia ora": in app.js restano solo tipi, agganci e il riquadro di Oggi.
// Blocco 4 (motore unificato): composizione (MotoreStudio, livelli 1–6), fogli e preferenze stanno nel chunk
// strumenti-quiz.js (07-motorestudio.ts, 07-studiaoraui.ts). La sessione è un record 'sessioneora' sincronizzato ('sessione' è del Timer).

interface VoceSessione { tipo: 'ripasso' | 'carte' | 'quiz' | 'appunto' | 'piano' | 'freddo' | 'scheda' | 'errore' | 'pausa' | 'richiamo'; titolo: string; sotto: string; min: number; k?: string; id?: string; fatto?: boolean;
  /** blocco 4: metodo, livello e motivo reale; avviata (ms) e secondi impiegati per imparare le durate */ metodo?: MetodoS; livello?: number; motivo?: string; avviata?: number; sec?: number; }
interface SessioneRec extends Rec { type: 'sessioneora'; inizio: number; minuti: number; obiettivo: string; voci: VoceSessione[]; esclusi?: { titolo: string; perche: string }[]; pref?: PrefMetodi; chiusa?: number; }
/** Sessione aperta (la più recente non chiusa). */
function sessioneAperta(): SessioneRec | undefined { return Stato.tutti<SessioneRec>('sessioneora').filter(s => !s.chiusa).sort((a, b) => b.inizio - a.inizio)[0]; }
function apriStudiaOra(): void { conMotoreStudio(() => StudiaOraUI.scegli()); }
function apriSessione(): void { conMotoreStudio(() => StudiaOraUI.sessione()); }

/** Riquadro in cima a Oggi. */
function widgetStudiaOra(): HTMLElement {
  const s = sessioneAperta();
  if (s) {
    const prossima = s.voci.find(v => !v.fatto), fatte = s.voci.filter(v => v.fatto).length;
    return h('section.card', null, h('button.btn.studia-ora', { onclick: apriSessione }, '▶ Sessione in corso · ' + fatte + '/' + s.voci.length),
      prossima ? h('div.tenue.piccolo', { style: { marginTop: '6px' } }, 'Prossima: ' + prossima.titolo) : null);
  }
  // v0.58: card «Adesso» — cosa fare ora in una riga, durata stimata e [Inizia] che avvia subito la sessione (2 tocchi da app chiusa)
  // Il riassunto (2 composizioni della sessione) si calcola dopo il disegno: Oggi resta nel budget dei tempi (prestazioni.py).
  const e = prossimoEsame(), durata = h('span'), riassunto = h('div.tenue.piccolo', { style: { margin: '2px 0 8px' } }, '…');
  const inizia = () => conMotoreStudio(() => StudiaOraUI.studia());
  const btn = h('button.btn.studia-ora', { onclick: inizia }, '▶ Inizia');
  caricaMotoreStudio().then(() => setTimeout(() => {   // dopo il disegno: Oggi resta nel budget dei tempi
    if (!riassunto.isConnected) return;
    const a = StudiaOraUI.adesso(); riassunto.textContent = a.riassunto;
    durata.textContent = a.minuti ? ' · ' + a.minuti + ' min' : ''; if (!a.minuti) btn.textContent = '▶ Studio libero con timer';
  }, 0), (e: Error) => { riassunto.textContent = '⚠️ ' + e.message; });
  return h('section.card.adesso', null,
    h('div.adesso-testa', null, h('b', null, 'Adesso'), durata,
      e ? h('span.tenue.piccolo', null, ' · ' + (e.giorni === 0 ? 'esame oggi' : '−' + e.giorni + (e.giorni === 1 ? ' giorno' : ' giorni')) + ' a ' + e.nome + (e.stato ? ' · ' + e.stato : '')) : null),
    riassunto,
    h('div.bottoni', null, lungo(btn, () => [
      { t: 'Scegli quanto tempo hai', ic: 'cronometro', f: () => apriStudiaOra() },
      { t: 'Ripassa le flashcard', ic: 'carte', f: () => { UI.studioVista = 'carte'; UI.studioSub = null; vai('studio'); } },
      { t: 'Rivedi gli errori', ic: 'avvertenza', f: () => { UI.studioVista = 'errori'; UI.studioSub = null; vai('studio'); } },
      { t: 'Studio libero con timer', ic: 'cronometro', f: () => Timer.avvia({ titolo: 'Studio libero' }) },
      { t: 'Simulazione d\'esame', ic: 'quiz', f: () => apriSimulazioni() }], 'Studia ora'),
      h('button.btn-testo', { onclick: apriStudiaOra }, 'Altra durata')));
}

/** v0.58: esame più vicino (oggi compreso) e stato rispetto al piano. */
/** v0.60: giorni al prossimo esame se la «Modalità esame» è attiva (≤ 21 giorni, non spenta), altrimenti null. */
function modalitaEsame(): number | null {
  if ((imp() || {} as Impostazioni).modoEsame === 'no') return null;
  const gg = Stato.tutti<Esame>('esame').map(x => giorniA(x.data)).filter(n => n >= 0);
  const m = gg.length ? Math.min(...gg) : Infinity;
  return m <= 21 ? m : null;
}
function prossimoEsame(): { nome: string; giorni: number; stato: string } | null {
  const e = Stato.tutti<Esame>('esame').filter(x => !x.deleted && giorniA(x.data) >= 0).sort((a, b) => a.data < b.data ? -1 : 1)[0];
  if (!e) return null;
  const r = Studio.pkPiani().length ? Studio.inRitardo().length : -1;
  return { nome: e.nome.replace(/ semestre filtro$/i, ''), giorni: giorniA(e.data), stato: r < 0 ? '' : r ? 'indietro di ' + r + ' step' : 'in pari ✓' };
}
