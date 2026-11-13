// 07-domande.ts — Errori ricorrenti, domanda per domanda (v0.16).
//
// L'osservatore dei quiz (07-cattura) legge dalla schermata finale la sezione «Da rivedere»: per ogni
// domanda sbagliata testo, risposta corretta e spiegazione. Qui diventano record 'domanda'
// (id 'dom-<hash scheda+testo>') con quante volte è stata sbagliata e com'è andata l'ultima volta.
// - quiz intero: le domande già note di quella scheda che NON sono tra le sbagliate contano come giuste;
// - «rifai solo gli errori»: aggiorna solo quelle ancora aperte;
// - le prove a freddo non contano (lì sbagliare è normale).
// In Studio → Errori: elenco con «mostra risposta» (prima prova a ricordare) e «la sapevo / non la sapevo».

interface Domanda extends Rec {
  type: 'domanda';
  schedaId: string; titolo: string;      // scheda (o 'sim:<file>') e suo titolo leggibile
  q: string; giusta: string; spieg?: string;
  volte: number;                         // volte sbagliata
  giuste: number;                        // volte giusta dopo il primo errore
  ultima: string;                        // giorno dell'ultimo esito
  esito: 'sbagliata' | 'giusta';
}

const Domande = (() => {
  function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  const norm = (q: string) => q.replace(/\s+/g, ' ').trim().toLowerCase();
  const tutte = () => Stato.tutti<Domanda>('domanda');

  /** Registra l'esito di un quiz; restituisce la funzione per annullare. */
  const Domande_aperte = () => tutte().filter(x => x.esito === 'sbagliata');
  function registra(schedaId: string, titolo: string, d: RisultatoQuiz): () => void {
    const oggiK = ymd(new Date()), sb = d.sbagliate || [];
    const mie = tutte().filter(x => x.schedaId === schedaId);
    const prima = mie.map(x => JSON.parse(JSON.stringify(x)) as Domanda), nuove: string[] = [];
    const sbagliateId = new Set<string>();
    for (const [q, giusta, spieg] of sb) {
      if (!q) continue;
      const id = 'dom-' + hash(schedaId + '|' + norm(q)); sbagliateId.add(id);
      const r = Stato.prendi<Domanda>(id);
      if (r && !r.deleted) Stato.salva(Object.assign(r, { volte: r.volte + 1, ultima: oggiK, esito: 'sbagliata', giusta: giusta || r.giusta, spieg: spieg || r.spieg }), true);
      else { nuove.push(id); Stato.salva({ id, type: 'domanda', updatedAt: 0, schedaId, titolo, q, giusta, spieg: spieg || undefined, volte: 1, giuste: 0, ultima: oggiK, esito: 'sbagliata' } as Domanda, true); }
    }
    // Le domande note che stavolta non sono tra le sbagliate: giuste (nel ripasso errori, solo quelle aperte)
    // (solo se il quiz ha mostrato «Da rivedere» o è tutto giusto: un formato diverso non deve «risolvere» nulla)
    if (sb.length || d.pct === 100) for (const r of mie) {
      if (sbagliateId.has(r.id) || (d.errori && r.esito !== 'sbagliata')) continue;
      Stato.salva(Object.assign(r, { giuste: r.giuste + 1, ultima: oggiK, esito: 'giusta' }), true);
    }
    const carteNuove = Carte.daErrori(Domande_aperte());   // v0.20.3: errori → flashcard (anche quelli vecchi ancora aperti)
    Stato.notifica();
    return () => { for (const r of prima) Stato.salva(r, true); for (const id of nuove) Stato.elimina(id); for (const id of carteNuove) Stato.elimina(id); };
  }

  /** Aperte = ultimo esito sbagliato; ricorrenti = sbagliate almeno 2 volte e ancora aperte. */
  const aperte = () => tutte().filter(x => x.esito === 'sbagliata');
  const ricorrenti = () => aperte().filter(x => x.volte >= 2);
  function segna(id: string, sapevo: boolean): void {
    const r = Stato.prendi<Domanda>(id); if (!r) return;
    Stato.salva(Object.assign(r, sapevo ? { giuste: r.giuste + 1, esito: 'giusta' } : { volte: r.volte + 1, esito: 'sbagliata' }, { ultima: ymd(new Date()) }));
  }
  return { registra, aperte, ricorrenti, tutte, segna };
})();

function gruppoDomanda(x: Domanda): string { return x.schedaId.startsWith('sim:') ? 'Simulazioni' : nomeMateria(materiaDi(x.schedaId)); }

/** Sezione in Studio → Errori. */
function sezioneDomande(): HTMLElement {
  const filtro = (UI as any).domFiltro || 'ricorrenti';
  const elenco = (filtro === 'ricorrenti' ? Domande.ricorrenti() : filtro === 'aperte' ? Domande.aperte() : Domande.tutte().filter(x => x.esito === 'giusta'))
    .sort((a, b) => b.volte - a.volte || (a.ultima < b.ultima ? 1 : -1));
  const nR = Domande.ricorrenti().length, nA = Domande.aperte().length, nG = Domande.tutte().length - nA;
  const voce = (x: Domanda) => {
    const risp = h('div.dom-risposta', { hidden: true },
      h('div', null, h('b', null, 'Risposta: '), x.giusta || '—'),
      x.spieg ? h('div.tenue.piccolo', null, x.spieg) : null,
      rigaAppuntoErrore(x),
      x.esito === 'sbagliata' ? h('div.bottoni', null,
        h('button.btn', { onclick: () => { Domande.segna(x.id, true); avviso('✓ Bene: esce dagli errori aperti.'); } }, '✓ La sapevo'),
        h('button.btn.neutro', { onclick: () => { Domande.segna(x.id, false); avviso('Resta tra gli errori: la rivedrai.'); } }, '✗ Non la sapevo')) : null);
    return h('div.dom-voce', null,
      h('div.tenue.piccolo', null, gruppoDomanda(x) + ' · ' + x.titolo + ' · sbagliata ' + x.volte + (x.volte === 1 ? ' volta' : ' volte') + (x.giuste ? ' · giusta ' + x.giuste : '')),
      h('div.dom-q', null, x.q),
      h('button.btn-testo', { onclick: (e: Event) => { risp.hidden = !risp.hidden; (e.target as HTMLElement).textContent = risp.hidden ? 'Prima prova a rispondere, poi mostra la risposta' : 'Nascondi'; } }, 'Prima prova a rispondere, poi mostra la risposta'),
      risp);
  };
  return h('section.card', null, h('h2.card-titolo', null, 'Domande sbagliate'),
    h('div.tenue.piccolo', null, 'Raccolte in automatico dai quiz fatti nell\'app (sezione «Da rivedere»). Ricorrenti = sbagliate almeno 2 volte: ripassale prima delle simulazioni.'),
    h('div.segmenti', null,
      h('button' + (filtro === 'ricorrenti' ? '.attivo' : ''), { onclick: () => { (UI as any).domFiltro = 'ricorrenti'; disegna(); } }, 'Ricorrenti ' + nR),
      h('button' + (filtro === 'aperte' ? '.attivo' : ''), { onclick: () => { (UI as any).domFiltro = 'aperte'; disegna(); } }, 'Aperte ' + nA),
      h('button' + (filtro === 'risolte' ? '.attivo' : ''), { onclick: () => { (UI as any).domFiltro = 'risolte'; disegna(); } }, 'Risolte ' + nG)),
    nA ? h('button.btn.neutro', { onclick: () => { const n = Carte.daErrori(Domande.aperte()).length; if (n) avviso(n + ' errori trasformati in flashcard.'); avviaCarte(['mz-errori'], 'Errori dei quiz'); } }, '🃏 Ripassa gli errori come flashcard') : null,
    elenco.length ? elenco.slice(0, 60).map(voce) : h('div.vuoto', null, filtro === 'ricorrenti' ? 'Nessuna domanda sbagliata due volte. 👍' : 'Niente qui per ora.'));
}
