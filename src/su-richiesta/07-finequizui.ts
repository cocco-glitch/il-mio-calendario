// 07-finequizui.ts — motore unificato, blocco 5 (N4): riquadro «Consolida» a fine quiz, carte per domanda e blocco note Cornell.
//
// Aggancio unico da Cattura.salva (app.js): FineQuizUI.dopo(id, risultato, aggiungiAnnulla). Le carte create in automatico
// (carteAuto = 'auto') si annullano col toast «tocca per annullare» del salvataggio; quelle scelte nel foglio sono una scelta
// esplicita e restano. I quiz HTML (senza `dettagli`) non aprono il foglio: lì vale solo 'auto'.
// Blocco 6: prima di tutto i concetti (Concetti.assegna sulla lista `focus` della scheda), poi la padronanza 'con:' (un record
// memoria per concetto, annullabile col toast) e l'unione delle carte per concetto (aggiornamenti annullabili anche loro).

const FineQuizUI = (() => {
  function pref(): PrefFine {
    const p = StudiaOra.prefGlobali();
    return { carte: p.carte, appunti: p.appunti, suggerisci: (imp() as Impostazioni).suggerisciAppunti !== false, carteAuto: StudiaOra.carteAuto() };
  }
  const mazzoDi = (id: string) => Carte.mazzoErrori(id);
  /** La carta di questa domanda (o del suo concetto) c'è già? Stesso id di Carte.daErrori. */
  function esiste(id: string): (q: string, c?: CandCartaQ) => boolean {
    const idM = mazzoDi(id);
    return (q, c) => { const x = cartaDi(idM, q, c); return !!x; };
  }
  function cartaDi(idM: string, q: string, c?: CandCartaQ): Carta | null { const x = Stato.prendi<Carta>(Carte.idErrore(idM, q, c && c.chiave)); return x && !x.deleted ? x : null; }
  /** Crea le carte (stesso mazzo «⚠️ Errori dei quiz» › step; id dal concetto o dal testo della domanda) e restituisce gli id nuovi. */
  const crea = (id: string, l: CandCartaQ[]) => Carte.daErrori(l.map(c => ({ schedaId: id, q: c.q, giusta: c.r, f: c.f, r: c.r, tag: c.tipo, qid: c.qid || undefined,
    chiave: c.chiave, concetto: c.concetto, qids: c.qids })), true);

  /** Esiti con il concetto assegnato (blocco 6). Quiz HTML: solo le sbagliate, senza concetti (ripiego implicito). */
  function dettagliDi(r: RisultatoQuiz, id = ''): EsitoQ[] {
    if (!r.dettagli) return (r.sbagliate || []).map(([q, giusta, spieg]) => ({ id: '', q, giusta, spieg, ok: false }));
    if (r.dettagli.every(e => e.con)) return r.dettagli;
    const t = trovaScheda(id), titolo = r.titoloScheda || (t ? t.s.titolo : id);
    const ass = Concetti.assegna(id, titolo, r.dettagli, Concetti.etichette(r.focus || ''), Locale);
    r.dettagli = r.dettagli.map(e => ({ ...e, con: ass.get(e.id) }));
    return r.dettagli;
  }
  /** Padronanza: un passo FSRS per concetto toccato (lettura e appunti non passano mai di qui). Restituisce l'annulla e gli stati. */
  function padronanza(id: string, det: EsitoQ[]): { annulla: () => void; stati: PadronanzaCon[] } {
    const giorno = ymd(new Date()), per = new Map<string, { con: NonNullable<EsitoQ['con']>; es: EsitoCon[] }>();
    for (const e of det) { if (!e.con) continue; const g = per.get(e.con.chiave) || { con: e.con, es: [] }; g.es.push({ ok: e.ok, caso: e.caso }); per.set(e.con.chiave, g); }
    const prima: [string, MemoriaCon | undefined][] = [], stati: PadronanzaCon[] = [];
    for (const [ch, g] of per) {
      const idM = 'mem-con-' + Carte.hash(ch), m0 = Stato.prendi<MemoriaCon>(idM), vivo = m0 && !m0.deleted ? m0 : undefined;
      prima.push([idM, vivo ? JSON.parse(JSON.stringify(vivo)) : undefined]);
      const m = Concetti.aggiorna(vivo, { id: idM, chiave: ch, sk: id, etichetta: g.con.etichetta, ripiego: g.con.ripiego }, g.es, giorno, Ripassi.ritenzione(giorno));
      Stato.salva(m, true); stati.push(Concetti.stato(m, giorno));
    }
    return { stati, annulla: () => { for (const [k, m] of prima) { if (m) Stato.salva(m, true); else if (Stato.prendi<Rec>(k)) Stato.elimina(k); } } };
  }
  /** Carte di concetto già esistenti: domande nuove in origine e, dopo un'illusione, versione comparativa (testo non modificato). */
  function aggiornaCarte(id: string, p: FineQuizP): () => void {
    const idM = mazzoDi(id), prima: Carta[] = [];
    for (const c of p.candidati) {
      if (!c.chiave) continue;
      const x = cartaDi(idM, c.q, c); if (!x) continue;
      const nuova = FineQuiz.unisci(x, c, Carte.hash); if (!nuova) continue;
      prima.push(JSON.parse(JSON.stringify(x))); Stato.salva(nuova, true);
    }
    return () => { for (const c of prima) Stato.salva(c, true); };
  }
  /** Riga di stato dei concetti toccati (interfaccia minima, decisione utente 26/11). */
  function rigaConcetti(stati: PadronanzaCon[], senza: number): HTMLElement | null {
    const veri = stati.filter(s => !s.ripiego); if (!veri.length) return null;
    const n = new Map<StatoConcetto, number>(); for (const s of veri) n.set(s.stato, (n.get(s.stato) || 0) + 1);
    const ord: StatoConcetto[] = ['da_studiare', 'da_consolidare', 'in_consolidamento', 'consolidato'];
    return h('p.tenue.piccolo.qz-concetti', null, '🧩 Concetti verificati (' + veri.length + '): ' + ord.filter(s => n.get(s)).map(s => n.get(s) + ' ' + Concetti.NOMI[s]).join(' · ')
      + (senza ? ' · ' + senza + (senza === 1 ? ' domanda senza concetto distinto' : ' domande senza concetto distinto') : ''));
  }
  function apriNota(id: string, r: RisultatoQuiz): void {
    const t = trovaScheda(id), giorno = ymd(new Date()), idA = 'ap-q-' + Carte.hash(id + '|' + giorno);
    let a = Stato.prendi<Appunto>(idA);
    if (!a || a.deleted) {
      a = Appunti.nuovo({ id: idA, titolo: 'Dopo il quiz · ' + (t ? Studio.etichetta(t.k) + ' ' + t.micro + ' · ' + t.s.titolo : 'quiz'), testo: FineQuiz.cornell(dettagliDi(r, id)),
        origine: { tipo: 'quiz', scheda: id, concetti: [...new Set(dettagliDi(r, id).filter(e => e.con && !e.con.ripiego && (!e.ok || e.caso === 'lucky_guess')).map(e => e.con!.etichetta))] }, ...(t ? { sub: t.k, micro: t.micro, subMano: 1 as const } : {}) });
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
  function solido(id: string, box: Element, riga: HTMLElement | null): void {
    if (box.querySelector('.qz-solido')) return;
    const t = trovaScheda(id), m = t ? Stato.prendi<Memoria>('mem-sub-' + t.k) : undefined;
    // lo step entra nei ripassi solo a prioritarie finite: prima di allora vale la scadenza FSRS più vicina delle domande
    const dom = Stato.tutti<StatQ>('statq').filter(q => q.sk === id && q.neuro && q.neuro.due).map(q => q.neuro!.due).sort()[0];
    const [quando, cosa] = m && m.due && !m.deleted ? [m.due, 'dello step'] : dom ? [dom, 'delle domande'] : ['', ''];
    const el = h('p.qz-solido', null, '✅ Tutto solido' + (quando ? ' · prossimo ripasso ' + cosa + ' il ' + quando.slice(8, 10) + '/' + quando.slice(5, 7) : ''));
    inserisci(box, el); if (riga) el.after(riga);
  }

  function dopo(id: string, r: RisultatoQuiz, aggiungiAnnulla: (f: () => void) => void): void {
    const pr = pref(), det = dettagliDi(r, id), p = FineQuiz.proposta(det, r.pct, pr, esiste(id));
    let stati: PadronanzaCon[] = [];
    if (r.dettagli && !r.errori) { const pd = padronanza(id, det); stati = pd.stati; aggiungiAnnulla(pd.annulla); }
    if (pr.carte && pr.carteAuto !== 'mai') aggiungiAnnulla(aggiornaCarte(id, p));
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
    const riga = rigaConcetti(stati, det.filter(e => e.con && e.con.ripiego).length);
    if (p.solido) { solido(id, box, riga); return; }
    if (!p.mostra) { if (riga) inserisci(box, riga); return; }
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
      p.consiglio ? h('div.tenue.piccolo', null, 'Consiglio: ' + NOMI[p.consiglio] + ' — ' + p.perche) : null, riga);
    inserisci(box, el);
  }
  return { dopo, apriNota };
})();
