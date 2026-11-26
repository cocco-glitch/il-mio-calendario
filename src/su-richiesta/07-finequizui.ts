// 07-finequizui.ts — motore unificato, blocco 5 (N4): riquadro «Consolida» a fine quiz, carte per domanda e blocco note Cornell.
//
// Aggancio unico da Cattura.salva (app.js): FineQuizUI.dopo(id, risultato, aggiungiAnnulla). Le carte create in automatico
// (carteAuto = 'auto') si annullano col toast «tocca per annullare» del salvataggio; quelle scelte nel foglio sono una scelta
// esplicita e restano. I quiz HTML (senza `dettagli`) non aprono il foglio: lì vale solo 'auto'.

const FineQuizUI = (() => {
  function pref(): PrefFine {
    const p = StudiaOra.prefGlobali();
    return { carte: p.carte, appunti: p.appunti, suggerisci: (imp() as Impostazioni).suggerisciAppunti !== false, carteAuto: StudiaOra.carteAuto() };
  }
  const mazzoDi = (id: string) => Carte.mazzoErrori(id);
  /** La carta di questa domanda c'è già? (stesso id di Carte.daErrori: mazzo + testo normalizzato) */
  function esiste(id: string): (q: string) => boolean {
    const idM = mazzoDi(id);
    return q => { const c = Stato.prendi<Carta>('cr-' + Carte.hash(idM + '|' + norm(q))); return !!c && !c.deleted; };
  }
  /** Crea le carte (stesso mazzo «⚠️ Errori dei quiz» › step, id dal testo della domanda) e restituisce gli id nuovi. */
  const crea = (id: string, l: CandCartaQ[]) => Carte.daErrori(l.map(c => ({ schedaId: id, q: c.q, giusta: c.r, f: c.f, r: c.r, tag: c.tipo, qid: c.qid || undefined })), true);

  function dettagliDi(r: RisultatoQuiz): EsitoQ[] {
    return r.dettagli || (r.sbagliate || []).map(([q, giusta, spieg]) => ({ id: '', q, giusta, spieg, ok: false }));
  }
  function apriNota(id: string, r: RisultatoQuiz): void {
    const t = trovaScheda(id), giorno = ymd(new Date()), idA = 'ap-q-' + Carte.hash(id + '|' + giorno);
    let a = Stato.prendi<Appunto>(idA);
    if (!a || a.deleted) {
      a = Appunti.nuovo({ id: idA, titolo: 'Dopo il quiz · ' + (t ? Studio.etichetta(t.k) + ' ' + t.micro + ' · ' + t.s.titolo : 'quiz'), testo: FineQuiz.cornell(dettagliDi(r)),
        origine: { tipo: 'quiz', scheda: id, concetti: [] }, ...(t ? { sub: t.k, micro: t.micro, subMano: 1 as const } : {}) });
      Appunti.salva(a);
      a = Stato.prendi<Appunto>(idA) || a;
    }
    apriAppunto(a);
  }
  function avviaCarteDi(id: string): void { avviaCarte([mazzoDi(id)], 'Errori · ' + (trovaScheda(id) ? Studio.etichetta(trovaScheda(id)!.k) : 'quiz')); }

  /** Riquadro nel risultato (decisione utente 26/11: niente finestra modale sopra le correzioni), prima di «Da rivedere». */
  function inserisci(box: Element, el: HTMLElement): void {
    const dopoDi = box.querySelector(':scope > .qz-neuro') || box.querySelector(':scope > .qz-livelli + p');
    if (dopoDi) { dopoDi.after(el); return; }
    const h3 = box.querySelector(':scope > h3');
    if (h3) box.insertBefore(el, h3); else box.appendChild(el);
  }
  function esegui(s: SceltaFine, id: string, r: RisultatoQuiz, p: FineQuizP, el: HTMLElement): void {
    let n = 0;
    if (s === 'carte' || s === 'entrambi') n = crea(id, p.nuove).length;
    svuota(el);
    el.append(h('div', null, h('b', null, '✓ ' + (n ? n + (n === 1 ? ' carta creata' : ' carte create') : s === 'nota' ? 'Blocco note pronto' : 'Carte già presenti'))),
      h('div.bottoni', null,
        s !== 'nota' ? h('button.btn', { type: 'button', onclick: () => avviaCarteDi(id) }, '🃏 Ripassale ora') : null,
        s !== 'carte' ? h('button.btn' + (s === 'nota' ? '' : '.neutro'), { type: 'button', onclick: () => apriNota(id, r) }, '📝 Apri il blocco note') : null));
    if (s !== 'carte') apriNota(id, r);
  }
  /** Riga «Tutto solido» sotto il risultato del quiz nell'app, con la data del prossimo ripasso dello step. */
  function solido(id: string, box: Element): void {
    if (box.querySelector('.qz-solido')) return;
    const t = trovaScheda(id), m = t ? Stato.prendi<Memoria>('mem-sub-' + t.k) : undefined;
    // lo step entra nei ripassi solo a prioritarie finite: prima di allora vale la scadenza FSRS più vicina delle domande
    const dom = Stato.tutti<StatQ>('statq').filter(q => q.sk === id && q.neuro && q.neuro.due).map(q => q.neuro!.due).sort()[0];
    const [quando, cosa] = m && m.due && !m.deleted ? [m.due, 'dello step'] : dom ? [dom, 'delle domande'] : ['', ''];
    inserisci(box, h('p.qz-solido', null, '✅ Tutto solido' + (quando ? ' · prossimo ripasso ' + cosa + ' il ' + quando.slice(8, 10) + '/' + quando.slice(5, 7) : '')));
  }

  function dopo(id: string, r: RisultatoQuiz, aggiungiAnnulla: (f: () => void) => void): void {
    const pr = pref(), p = FineQuiz.proposta(dettagliDi(r), r.pct, pr, esiste(id));
    if (pr.carteAuto === 'auto' && p.nuove.length) {
      const ids = crea(id, FineQuiz.automatiche(p));
      if (ids.length) {
        aggiungiAnnulla(() => { for (const x of ids) Stato.elimina(x); });
        // niente toast nuovo: la zona avvisi ne tiene 2 e spingerebbe fuori «Salvato … tocca per annullare»; lo si arricchisce
        const t = Array.from(document.querySelectorAll<HTMLElement>('#avvisi .avviso')).reverse().find(x => /^✅ Salvato .*tocca per annullare$/.test(x.dataset.testo || ''));
        if (t) t.insertBefore(h('span', null, ' · 🃏 ' + ids.length + (ids.length === 1 ? ' carta creata' : ' carte create')), t.firstChild ? t.firstChild.nextSibling : null);
      }
    }
    const box = r.dettagli ? document.querySelector('.qz-carta') : null;
    if (!box || box.querySelector('.finequiz')) return;   // quiz HTML: niente riquadro (decisione utente 26/11)
    if (p.solido) { solido(id, box); return; }
    if (!p.mostra) return;
    const NOMI: Record<SceltaFine, string> = { carte: '🃏 Flashcard mirate', nota: '📝 Blocco note (Cornell)', entrambi: '🃏 + 📝 Entrambi' };
    const SOTTO: Record<SceltaFine, string> = {
      carte: p.nuove.length + (p.nuove.length === 1 ? ' carta' : ' carte') + ' · ~' + p.min.carte + ' min',
      nota: 'correzioni già scritte, tu aggiungi le tue parole · ~' + p.min.nota + ' min',
      entrambi: '~' + p.min.entrambi + ' min' };
    const c = p.conta, pezzi = [c.illusione ? c.illusione + (c.illusione === 1 ? ' illusione' : ' illusioni') : '', c.errore ? c.errore + (c.errore === 1 ? ' errore' : ' errori') : '', c.fortunata ? c.fortunata + (c.fortunata === 1 ? ' fortunata' : ' fortunate') : ''].filter(Boolean);
    const el: HTMLElement = h('section.finequiz', { 'aria-label': 'Consolida' },
      h('div', null, h('b', null, '✨ Consolida: ' + pezzi.join(' · '))),
      p.gia ? h('div.tenue.piccolo', null, p.gia + (p.gia === 1 ? ' è già tra le tue carte: non la duplico.' : ' sono già tra le tue carte: non le duplico.')) : null,
      h('div.finequiz-opzioni', null, p.opzioni.map(s => h('button.btn' + (s === p.consiglio ? '' : '.neutro'), { type: 'button', 'data-fine': s, onclick: () => esegui(s, id, r, p, el) }, h('b', null, NOMI[s]), h('span.piccolo', null, ' · ' + SOTTO[s])))),
      p.consiglio ? h('button.btn-testo', { type: 'button', 'data-fine': 'app', onclick: () => { const s = p.consiglio!; esegui(s, id, r, p, el); el.prepend(h('div.tenue.piccolo', null, '✨ Scelta dell\'app: ' + NOMI[s] + ' — ' + p.perche)); } }, '✨ Lascia decidere all\'app') : null,
      p.consiglio ? h('div.tenue.piccolo', null, 'Consiglio: ' + NOMI[p.consiglio] + ' — ' + p.perche) : null);
    inserisci(box, el);
  }
  return { dopo, apriNota };
})();
