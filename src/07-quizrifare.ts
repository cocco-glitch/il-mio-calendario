// 07-quizrifare.ts — v0.58 (Q2): «🎯 Quiz da rifare».
//
// Lo SRS per domanda (statq.neuro.due, BP3) prima era letto solo dentro un quiz già aperto: la promessa
// «tornano già oggi in cima al ripasso» non si avverava. Qui le domande scadute (illusioni di competenza in testa)
// diventano un quiz unico, proposto in Studia ora e nella card «Adesso» di Oggi. ~1 minuto a domanda, massimo 10.
// Sorgenti delle domande: quiz creati in app (qcreato), pacchetti .imcpack (Dominio.domandeDi), schede del proprietario (Banca).
// In v0.59 diventa l'adapter di CodaRipasso per questa sorgente.

const QuizRifare = (() => {
  const MAX = 10;
  const qcreato = (sk: string) => { const r = /^qc-/.test(sk) ? Stato.prendi<QCreato>(sk) : null; return r && !r.deleted ? r : null; };
  /** La domanda si può ricostruire? (le serie generate 🎲 no: cambiano i numeri a ogni giro) */
  const risolvibile = (sk: string) => !!sk && (!!qcreato(sk) || !!Dominio.domandeDi(sk) || !!trovaScheda(sk));
  const urgenza = (s: StatQ) => s.neuro && s.neuro.tag && s.neuro.tag.includes('illusione_competenza') ? 0 : 1;

  /** Record statq con ripasso scaduto entro `giorno` (incluso), illusioni prima, poi i più vecchi. */
  function dovute(giorno = ymd(new Date())): StatQ[] {
    return Stato.tutti<StatQ>('statq').filter(s => !s.deleted && s.neuro && s.neuro.due && s.neuro.due <= giorno && risolvibile(s.sk))
      .sort((a, b) => urgenza(a) - urgenza(b) || (a.neuro!.due < b.neuro!.due ? -1 : a.neuro!.due > b.neuro!.due ? 1 : 0));
  }
  const conta = (giorno?: string) => dovute(giorno).length;
  /** Minuti stimati: ~1 a domanda, al massimo MAX domande. */
  const minuti = (n = conta()) => Math.min(MAX, n);

  /** Ricostruisce le domande (al massimo MAX) con le immagini delle schede del proprietario. */
  async function domande(max = MAX): Promise<{ domande: DomB[]; immagini: Record<string, string>; materia: string }> {
    const out: DomB[] = [], imm: Record<string, string> = {}, cache = new Map<string, DomB[]>();
    let materia = '';
    for (const s of dovute()) {
      if (out.length >= max) break;
      let lista = cache.get(s.sk);
      if (!lista) {
        const qc = qcreato(s.sk), imc = Dominio.domandeDi(s.sk), t = !qc && !imc ? trovaScheda(s.sk) : null;
        if (qc) lista = qc.domande;
        else if (imc) lista = Banca.applica(imc.map(d => ({ ...d })), s.sk);
        else if (t) { try { const b = await Banca.scheda(t.pk, t.m, t.micro, t.s); lista = b.domande; Object.assign(imm, b.immagini); } catch (e) { console.warn('QuizRifare: scheda non caricata', s.sk, e); lista = []; } }
        else lista = [];
        cache.set(s.sk, lista);
      }
      const d = lista.find(x => 'sq-' + x.id === s.id);
      if (d) { out.push(d); if (!materia) { const qc = qcreato(s.sk), t = trovaScheda(s.sk); materia = qc ? qc.materia : t ? t.m : s.sk.split('-')[0]; } }
    }
    return { domande: out, immagini: imm, materia };
  }

  async function avvia(chiudi?: () => void): Promise<void> {
    const r = await domande();
    if (!r.domande.length) { avviso('Nessun quiz da rifare oggi. 🎉'); return; }
    const pk = { tipo: 'step', id: 'qr', step: 0, titolo: '', aggiornato: '', risorse: { libri: {}, quiz: {} }, materie: [] } as unknown as PkStep;
    const s = { id: 'qr-' + ymd(new Date()), k: 1, n: 1, titolo: 'Quiz da rifare', tipo: 'P', problemi: false, pagine: '', quizFile: '' } as SchedaS;
    const lista = r.domande;
    QuizApp.apri(pk, r.materia, 'Quiz da rifare', s, () => lista, { occh: '🎯 Ripasso delle domande scadute · ' + lista.length + (lista.length === 1 ? ' domanda' : ' domande'), titolo: 'Quiz da rifare', chiudi, immagini: r.immagini });
  }

  return { dovute, conta, minuti, domande, avvia, MAX };
})();
