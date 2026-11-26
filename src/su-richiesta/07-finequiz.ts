// 07-finequiz.ts — motore unificato, blocco 5 (N4): proposta PURA del foglio «Fine quiz».
//
// Decisioni utente 26/11 (Sessione 6): unità della carta = la DOMANDA (id stabile; `Carta.concetto` lo riempirà il blocco 6);
// padronanza per concetto nel blocco 6; `carteAuto` 'proponi' per tutti (niente più carte da ogni errore aperto);
// foglio solo per i quiz nell'app (i quiz HTML non hanno certezza né distrattore: lì vale solo 'auto').
// Candidati, in quest'ordine (le risposte giuste e sicure non generano nulla):
//  1 illusione di competenza (certo ma sbagliato) → carta comparativa «Perché X e non Y?» se c'è il distrattore scelto;
//  2 errore → domanda → risposta + spiegazione breve (≤ 300 caratteri);
//  3 risposta fortunata (giusta tirando a indovinare) → come l'errore, da fissare.
// «Lascia decidere all'app» è una regola dichiarata, non un peso: molti errori (≥ 6 o < 60%) = lacuna ampia → blocco note
// (riorganizzare con parole proprie), più le carte se ci sono illusioni; altrimenti carte mirate.
// Nessuna lettura di Stato, DOM o storage: i dati arrivano da 07-finequizui.ts.

type TipoCartaQ = 'illusione' | 'errore' | 'fortunata';
type SceltaFine = 'carte' | 'nota' | 'entrambi';
interface CandCartaQ { qid: string; tipo: TipoCartaQ; q: string; f: string; r: string; motivo: string; }
interface PrefFine { carte: boolean; appunti: boolean; suggerisci: boolean; carteAuto: 'mai' | 'proponi' | 'auto'; }
interface FineQuizP {
  solido: boolean; mostra: boolean; lacuna: boolean;
  candidati: CandCartaQ[]; nuove: CandCartaQ[]; gia: number;
  opzioni: SceltaFine[]; consiglio: SceltaFine | null; perche: string;
  min: Record<SceltaFine, number>; conta: Record<TipoCartaQ, number>;
}

const FineQuiz = (() => {
  const MAX_R = 300, MIN_CARTA = 0.5, MIN_NOTA = 5, AUTO_MAX = 5, LACUNA_N = 6, LACUNA_PCT = 60;
  const ORD: Record<TipoCartaQ, number> = { illusione: 0, errore: 1, fortunata: 2 };
  const una = (s: string) => String(s || '').replace(/\s+/g, ' ').trim();
  /** Taglia a n caratteri sul confine di parola, con «…». */
  function taglia(s: string, n: number): string {
    const x = una(s); if (x.length <= n) return x;
    const y = x.slice(0, n - 1), sp = y.lastIndexOf(' ');
    return (sp > n * 0.6 ? y.slice(0, sp) : y).replace(/[\s,;:.]+$/, '') + '…';
  }
  function tipo(e: EsitoQ): TipoCartaQ | null {
    if (e.ok) return e.caso === 'lucky_guess' ? 'fortunata' : null;
    return e.caso === 'illusione_competenza' ? 'illusione' : 'errore';
  }
  /** Testo della carta dal tipo di errore (0 token). */
  function carta(e: EsitoQ, t: TipoCartaQ): CandCartaQ {
    const giusta = una(e.giusta), spieg = e.spieg ? taglia(e.spieg, MAX_R) : '';
    if (t === 'illusione' && e.scelta) {
      const sc = una(e.scelta);
      return { qid: e.id, tipo: t, q: e.q, motivo: 'eri certo ma era sbagliata',
        f: e.q + '\n\nPerché «' + taglia(giusta, 120) + '» e non «' + taglia(sc, 120) + '»?',
        r: giusta + '\n\n' + (e.perche ? 'Perché «' + taglia(sc, 120) + '» non va: ' + taglia(e.perche, MAX_R) : spieg) };
    }
    return { qid: e.id, tipo: t, q: e.q, motivo: t === 'illusione' ? 'eri certo ma era sbagliata' : t === 'fortunata' ? 'giusta tirando a indovinare: da fissare' : 'sbagliata',
      f: e.q, r: giusta + (spieg ? '\n\n' + spieg : '') };
  }
  /** Candidati in ordine: illusioni, errori, fortunate (dentro il tipo, l'ordine del quiz). Una domanda = una carta. */
  function candidati(det: EsitoQ[]): CandCartaQ[] {
    const visti = new Set<string>(), out: CandCartaQ[] = [];
    for (const e of det) {
      const t = tipo(e), chiave = una(e.q).toLowerCase();
      if (!t || !chiave || !una(e.giusta) || visti.has(chiave)) continue;
      visti.add(chiave); out.push(carta(e, t));
    }
    return out.sort((a, b) => ORD[a.tipo] - ORD[b.tipo]);   // sort stabile (ES2019): dentro il tipo resta l'ordine del quiz
  }
  /**
   * Proposta del foglio. `esiste(q)` dice se la carta di quella domanda c'è già (non si duplica).
   * mostra = c'è qualcosa da consolidare e almeno un'opzione permessa dalle preferenze.
   */
  function proposta(det: EsitoQ[], pct: number, pref: PrefFine, esiste: (q: string) => boolean = () => false): FineQuizP {
    const cand = candidati(det), nuove = cand.filter(c => !esiste(c.q));
    const conta: Record<TipoCartaQ, number> = { illusione: 0, errore: 0, fortunata: 0 };
    for (const c of cand) conta[c.tipo]++;
    const sbagliate = conta.illusione + conta.errore;
    const lacuna = sbagliate >= LACUNA_N || (sbagliate > 0 && pct < LACUNA_PCT);
    const carteOk = pref.carte && pref.carteAuto === 'proponi' && nuove.length > 0;
    // in 'auto' le carte le crea l'app (≤ 5): il foglio resta solo per il blocco note, quando serve davvero
    const notaOk = pref.appunti && sbagliate > 0 && (pref.carteAuto !== 'auto' || (pref.suggerisci && lacuna));
    const opzioni: SceltaFine[] = [];
    if (carteOk) opzioni.push('carte');
    if (notaOk) opzioni.push('nota');
    if (carteOk && notaOk) opzioni.push('entrambi');
    let consiglio: SceltaFine | null = null, perche = '';
    const notaSugg = notaOk && pref.suggerisci;
    if (lacuna && notaSugg && carteOk && conta.illusione) { consiglio = 'entrambi'; perche = sbagliate + ' errori: riorganizzali in un appunto con parole tue; le illusioni vanno in carte comparative.'; }
    else if (lacuna && notaSugg) { consiglio = 'nota'; perche = sbagliate + ' errori: una lacuna ampia si ripara riorganizzando, non con carte singole.'; }
    else if (carteOk) { consiglio = 'carte'; perche = 'pochi errori puntuali: ' + nuove.length + (nuove.length === 1 ? ' carta mirata basta' : ' carte mirate bastano') + '.'; }
    else if (notaSugg) { consiglio = 'nota'; perche = 'le carte di queste domande ci sono già: fissa la correzione in un appunto.'; }
    const mc = Math.max(1, Math.ceil(nuove.length * MIN_CARTA));
    return { solido: cand.length === 0, mostra: cand.length > 0 && opzioni.length > 0, lacuna, candidati: cand, nuove, gia: cand.length - nuove.length,
      opzioni, consiglio, perche, min: { carte: mc, nota: MIN_NOTA, entrambi: mc + MIN_NOTA }, conta };
  }
  /** Carte da creare da sole con carteAuto = 'auto': al massimo 5, nell'ordine dei candidati. */
  const automatiche = (p: FineQuizP) => p.nuove.slice(0, AUTO_MAX);
  /**
   * Modello Cornell precompilato (0 token). Spunti = righe che finiscono con «?» (regola di Appunti.sezioni);
   * niente «::» né «{{}}», così l'appunto non genera carte doppie. La sezione «Con parole mie» resta vuota per lo studente.
   */
  function cornell(det: EsitoQ[]): string {
    const cand = candidati(det), err = cand.filter(c => c.tipo !== 'fortunata'), fort = cand.filter(c => c.tipo === 'fortunata');
    const pul = (x: string) => x.replace(/::/g, ':').replace(/\{\{|\}\}/g, '');   // niente carte implicite (Appunti.estraiCarte)
    const dom = (q: string) => { const x = taglia(q, 160); return /\?\s*$/.test(x) ? x : x + ' — perché?'; };
    const riga: string[] = [];
    if (err.length) {
      riga.push('## Errori e correzioni');
      for (const c of err) {
        const e = det.find(x => una(x.q) === una(c.q))!;
        riga.push('- ' + dom(c.q), '  Corretta: ' + taglia(e.giusta, 200) + (e.spieg ? '. ' + taglia(e.spieg, 240) : ''));
        if (c.tipo === 'illusione' && e.scelta) riga.push('  Mi aveva convinto «' + taglia(e.scelta, 120) + '»' + (e.perche ? ': ' + taglia(e.perche, 200) : ''));
      }
    }
    const richiamo = cand.filter(c => c.tipo !== 'errore');
    if (richiamo.length) {
      riga.push('', '## Da richiamare senza guardare');
      for (const c of richiamo) { const e = det.find(x => una(x.q) === una(c.q))!; riga.push('- Sai spiegare con parole tue perché la risposta è «' + taglia(e.giusta, 100) + '»?'); }
    }
    if (fort.length && !err.length) riga.unshift('_Tutte giuste, ma ' + fort.length + ' a intuito._', '');
    riga.push('', '## Con parole mie', '');
    return pul(riga.join('\n'));
  }
  return { candidati, proposta, automatiche, cornell, taglia, AUTO_MAX };
})();
