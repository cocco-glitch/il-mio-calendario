// 07-studiaoraui.ts — motore unificato, blocco 4: «Studia ora» nel chunk su richiesta.
// Istantanea = sola lettura dei moduli (CodaRipasso, Studio, Freddo, Ripassi, piano AI) → candidati per MotoreStudio.
// Sessione = record 'sessioneora' sincronizzato ('sessione' è del Timer) (isolato per account come gli altri): voci, motivi, esclusi, secondi.
// Preferenze N5 in Impostazioni: metodi {quiz, carte, appunti}, carteAuto (mai/proponi/auto), suggerisciAppunti.

const StudiaOra = (() => {
  const MIN = 10, VECCHIA = 'imc-studia-ora';
  const g8 = (d: Date) => ymd(d);

  function prefGlobali(): PrefMetodi { const m = (imp() || {} as Impostazioni).metodi; return { quiz: !m || m.quiz !== false, carte: !m || m.carte !== false, appunti: !m || m.appunti !== false }; }
  /** Migrazione: carteDaErrori === false → 'mai'; altrimenti 'proponi' (decisione utente 26/11). */
  function carteAuto(): 'mai' | 'proponi' | 'auto' { const i = (imp() || {}) as Impostazioni & { carteDaErrori?: boolean }; return i.carteAuto || (i.carteDaErrori === false ? 'mai' : 'proponi'); }

  function metodoCoda(s: SorgenteCoda): MetodoS { return s === 'carte' ? 'carte' : s === 'appunti' ? 'appunto' : s === 'piano' ? 'richiamo' : 'quiz'; }
  function motivoCoda(e: ElemCoda): string {
    if (e.sorgente === 'step') return 'ripasso in scadenza · ' + (e.sotto.split(' · ').pop() || '');
    if (e.sorgente === 'carte') return e.sotto;
    if (e.sorgente === 'quiz') return e.n + ' domande scadute';
    if (e.sorgente === 'appunti') return 'sezioni da ripassare';
    return 'ripasso previsto dal piano';
  }

  /** Candidati dei livelli 1–6 dai dati reali (nessuna scrittura). */
  function istantanea(giorno: Date): CandidatoS[] {
    const g = g8(giorno), out: CandidatoS[] = [], ieri = g8(new Date(giorno.getTime() - 2 * 864e5));
    // 1–2: coda unica dei ripassi; le illusioni di competenza degli ultimi 2 giorni salgono al livello 1
    for (const e of CodaRipasso.dovuti(g)) {
      const ill = e.sorgente === 'quiz' && QuizRifare.dovute(g).some(s => !!(s.neuro && s.neuro.ultimoCaso === 'illusione_competenza' && s.ultima >= ieri));
      out.push({ id: e.voce.id ? 'scheda:' + e.voce.id : e.id, livello: ill ? 1 : 2, ind: e.priorita, metodo: metodoCoda(e.sorgente), min: e.voce.min, voce: e.voce,
        motivo: ill ? 'eri certo ma era sbagliato' : motivoCoda(e), gruppo: e.sorgente === 'step' ? 'step' : e.sorgente === 'appunti' ? 'appunti' : undefined });
    }
    const vg = Studio.vociDelGiorno(giorno).filter(x => !x.v.speciale && x.p.modo !== 'raffinamento' && !x.v.isRipassoFSRS);
    // 3: prerequisiti non fatti delle unità di oggi (piani AI con `unita`)
    const dip = new Map<string, { p: PkPiano; n: number }>();
    for (const x of vg) {
      const u = ((x.p as PkPianoAI).unita || []).find(z => z.uid === x.v.uid); if (!u) continue;
      for (const pu of u.prereq) for (const gp of x.p.giorni) for (const v of gp.voci)
        if (v.uid === pu && !v.isRipassoFSRS && !Studio.stepFatto(v.k, x.p)) { const d = dip.get(v.k); dip.set(v.k, { p: x.p, n: (d ? d.n : 0) + 1 }); }
    }
    dip.forEach((d, k) => {
      const t = Studio.trovaSotto(k), s = t && Studio.schedeDi(t.sub).find(x => x.tipo === 'P' && !Studio.fatta(x.id)); if (!s) return;
      out.push({ id: 'scheda:' + s.id, livello: 3, ind: d.n, metodo: 'fonte', min: MIN, motivo: 'prerequisito di ' + d.n + (d.n === 1 ? ' argomento' : ' argomenti') + ' di oggi',
        voce: { tipo: 'scheda', titolo: '🧩 Prerequisito ' + Studio.etichetta(k) + ' · scheda ' + s.k + '/' + s.n, sotto: s.titolo, min: MIN, k, id: s.id } });
    });
    // 4: errori aperti (schede da rifare)
    for (const x of tutteLeSchede().filter(x => daRifare(x.s.id)))
      out.push({ id: 'scheda:' + x.s.id, livello: 4, ind: 0, metodo: 'errori', min: MIN, motivo: 'errori aperti in questa scheda',
        voce: { tipo: 'errore', titolo: '✏️ Da rifare · ' + Studio.etichetta(x.sub.k), sotto: x.s.titolo, min: MIN, k: x.sub.k, id: x.s.id } });
    // 5: contenuto nuovo previsto dal piano, nell'ordine del piano (prova a freddo prima della lettura)
    let ord = 1000;
    for (const x of vg) {
      const t = Studio.trovaSotto(x.v.k); if (!t) continue;
      if (Freddo.possibile(x.v.k) && !Freddo.rec(x.v.k))
        out.push({ id: 'freddo:' + x.v.k, livello: 5, ind: ord--, metodo: 'diagnostico', min: MIN, motivo: 'previsto oggi dal piano · prima di leggere',
          voce: { tipo: 'freddo', titolo: '🧊 Prova a freddo ' + Studio.etichetta(x.v.k), sotto: 'Prima di leggere: d\'istinto, non conta', min: MIN, k: x.v.k } });
      for (const s of Studio.schedeDi(t.sub).filter(z => z.tipo === 'P' && !Studio.fatta(z.id)))
        out.push({ id: 'scheda:' + s.id, livello: 5, ind: ord--, metodo: 'fonte', min: MIN, motivo: 'previsto oggi dal piano',
          voce: { tipo: 'scheda', titolo: '📖 ' + Studio.etichetta(x.v.k) + ' · scheda ' + s.k + '/' + s.n, sotto: s.titolo + ' · pp. ' + Studio.intervalli(Studio.pagineSet(s.pagine)), min: MIN, k: x.v.k, id: s.id } });
    }
    // 6: consolidamento — sotto-step verificati in ≥ 2 giorni, stabilità < 21 g, non ancora scaduti
    for (const m of Stato.tutti<MemoriaV>('memoria')) {
      if (!m.er.startsWith('sub:') || m.esposto || !(m.s < 21) || m.due <= g) continue;
      const giorni = new Set((m.log || []).filter(l => l[1] > 0).map(l => l[0])); if (giorni.size < 2) continue;
      const k = m.er.slice(4), sc = Ripassi.schedaDaProporre(k); if (!sc) continue;
      out.push({ id: 'cons:' + k, livello: 6, ind: -m.s, metodo: 'quiz', min: MIN, gruppo: 'step', motivo: 'da fissare prima che si stabilizzi (stabilità ' + Math.round(m.s) + ' g)',
        voce: { tipo: 'ripasso', titolo: '🔒 Consolida ' + Studio.etichetta(k), sotto: 'Rifai: ' + sc.titolo, min: MIN, k, id: sc.id } });
    }
    return out;
  }

  function osservazioni(): OsservazioneS[] {
    const out: OsservazioneS[] = [];
    for (const s of Stato.tutti<SessioneRec>('sessioneora').filter(x => x.chiusa).sort((a, b) => a.inizio - b.inizio).slice(-30))
      for (const v of s.voci) if (v.metodo && v.sec) out.push({ metodo: v.metodo, min: v.min, sec: v.sec });
    return out;
  }
  function proposta(minuti: number, giorno = oggi(), o: ObiettivoS = 'auto', pref = prefGlobali()): PropostaS {
    return MotoreStudio.componi(o, minuti, pref, istantanea(giorno), MotoreStudio.fattori(osservazioni()));
  }
  /** Compatibilità: le voci della sessione (stessa firma di prima del blocco 4). */
  function componi(minuti: number, giorno = oggi(), o: ObiettivoS = 'auto', pref = prefGlobali()): VoceSessione[] { return proposta(minuti, giorno, o, pref).voci; }

  /** Una sola volta: la sessione locale di prima (localStorage) diventa un record. */
  function migra(): void {
    let v: { inizio: number; minuti: number; voci: VoceSessione[] } | null = null; try { v = JSON.parse(localStorage.getItem(VECCHIA) || 'null'); localStorage.removeItem(VECCHIA); } catch (e) { console.warn('StudiaOra.migra', e); }
    if (v && Array.isArray(v.voci) && !sessioneAperta()) Stato.salva({ id: 'sor-' + v.inizio, type: 'sessioneora', updatedAt: Date.now(), inizio: v.inizio, minuti: v.minuti, obiettivo: 'auto', voci: v.voci } as SessioneRec);
  }
  function leggi(): SessioneRec | null { migra(); return sessioneAperta() || null; }
  function avvia(minuti: number, o: ObiettivoS = 'auto', pref = prefGlobali()): SessioneRec {
    const p = proposta(minuti, oggi(), o, pref), t = Date.now();
    const s: SessioneRec = { id: 'sor-' + t, type: 'sessioneora', updatedAt: t, inizio: t, minuti, obiettivo: p.obiettivo, voci: p.voci, esclusi: p.esclusi.slice(0, 20), pref };
    Stato.salva(s);
    const prima = s.voci.find(v => v.k);
    Timer.avvia({ m: prima && prima.k ? materiaDi(prima.k) : undefined, k: prima && prima.k, titolo: 'Studia ora · ' + minuti + ' min', durata: minuti });
    return s;
  }
  function cambia(f: (s: SessioneRec) => void): void { const s = sessioneAperta(); if (!s) return; const c: SessioneRec = JSON.parse(JSON.stringify(s)); f(c); c.updatedAt = Date.now(); Stato.salva(c); }
  /** Spunta: con l'ora d'inizio registra i secondi (tetto 3× la durata prevista, per non imparare dalle pause dimenticate). */
  function segnaFatto(i: number): void {
    cambia(s => { const v = s.voci[i]; if (!v) return; v.fatto = !v.fatto; if (v.fatto && v.avviata) v.sec = Math.min(Math.round((Date.now() - v.avviata) / 1000), v.min * 180); });
  }
  function inizia(i: number): void { cambia(s => { const v = s.voci[i]; if (v && !v.fatto && !v.avviata) v.avviata = Date.now(); }); }
  function chiudi(): void { cambia(s => { s.chiusa = Date.now(); }); }
  return { componi, proposta, istantanea, avvia, leggi, segnaFatto, inizia, chiudi, prefGlobali, carteAuto };
})();

/** Esegue una voce: apre il quiz giusto (ripasso, scheda, errore) o la prova a freddo. */
function eseguiVoce(v: VoceSessione): void {
  if (v.tipo === 'freddo' && v.k) { avviaProvaAFreddo(v.k); return; }
  if (v.tipo === 'carte') { avviaCarte(undefined, 'Flashcard'); return; }
  if (v.tipo === 'quiz') { QuizRifare.avvia(); return; }
  if (v.tipo === 'piano' && v.id) { apriPianoDi(v.id); return; }
  if (v.tipo === 'appunto' && v.id) { const a = Stato.prendi<Appunto>(v.id); if (a) { apriCornell(a, true); return; } }
  if (v.id) { const t = trovaScheda(v.id); if (t) { apriScheda(t.pk, t.m, t.micro, t.s, v.tipo === 'ripasso' || v.tipo === 'errore'); return; } }
  avviso(v.sotto, 8000);
}

const StudiaOraUI = (() => {
  const OB: [ObiettivoS, string][] = [['auto', 'Automatico'], ['breve', 'Breve'], ['consolidamento', 'Solo consolidare']];
  const MET: [keyof PrefMetodi, string][] = [['quiz', 'Quiz'], ['carte', 'Flashcard'], ['appunti', 'Appunti']];
  const chip = (on: boolean, t: string, f: () => void) => h('button.chip' + (on ? '.attivo' : ''), { 'aria-pressed': String(on), onclick: f }, t);

  /** La sessione consigliata adesso: la durata più corta (25/50/90) che contiene tutto il dovuto, e una riga di riassunto. */
  function adesso(giorno = oggi()): { minuti: number; riassunto: string } {
    const lavoro = (vv: VoceSessione[]) => vv.filter(v => v.tipo !== 'pausa' && v.tipo !== 'richiamo');
    const tutto = lavoro(StudiaOra.componi(90, giorno)), serve = tutto.reduce((s, v) => s + v.min, 0);
    if (!tutto.length) return { minuti: 0, riassunto: 'Niente in scadenza: buon momento per avanzare o per una pausa vera.' };
    const minuti = [25, 50, 90].find(m => Math.ceil(serve / 0.9) + 5 <= m) || 90, voci = lavoro(StudiaOra.componi(minuti, giorno));
    const n = (tipo: VoceSessione['tipo']) => voci.filter(v => v.tipo === tipo).length, pezzi: string[] = [];
    const nc = Carte.conta(), nq = QuizRifare.conta(ymd(giorno));
    if (n('ripasso')) pezzi.push(n('ripasso') + (n('ripasso') === 1 ? ' ripasso' : ' ripassi'));
    if (n('carte')) pezzi.push((nc.ripasso + nc.nuove) + ' carte');
    if (n('quiz')) pezzi.push(Math.min(nq, QuizRifare.MAX) + ' quiz da rifare');
    if (n('appunto')) pezzi.push(n('appunto') + (n('appunto') === 1 ? ' appunto' : ' appunti'));
    if (n('piano')) pezzi.push(n('piano') + (n('piano') === 1 ? ' ripasso del piano' : ' ripassi del piano'));
    const st = voci.find(v => (v.tipo === 'scheda' || v.tipo === 'freddo') && v.k);
    if (st && st.k) pezzi.push(Studio.etichetta(st.k));
    if (n('errore')) pezzi.push(n('errore') + ' errori');
    return { minuti, riassunto: (pezzi.join(' + ') || voci[0].titolo) };
  }
  /** «Inizia» di Oggi: riprende la sessione aperta o avvia quella consigliata. */
  function studia(sceltaSeVuoto = false): void {
    if (StudiaOra.leggi()) { sessione(); return; }
    const a = adesso(); if (!a.minuti) { if (sceltaSeVuoto) scegli(); else Timer.avvia({ titolo: 'Studio libero' }); return; }
    StudiaOra.avvia(a.minuti); setTimeout(sessione, 50);
  }

  function scegli(): void {
    if (StudiaOra.leggi()) { sessione(); return; }
    let minuti = 50, ob: ObiettivoS = 'auto'; const pref = StudiaOra.prefGlobali();
    const corpo = h('div.modulo');
    const disegna = () => {
      svuota(corpo);
      const p = StudiaOra.proposta(minuti, oggi(), ob, pref);
      [
        h('div.gruppo-titolo', null, 'Quanto tempo hai?'),
        h('div.chips', null, [10, 25, 50, 90].map(m => chip(m === minuti, m + ' min', () => { minuti = m; disegna(); }))),
        h('div.gruppo-titolo', null, 'Obiettivo'),
        h('div.chips', null, OB.map(([o, t]) => chip(o === ob, t, () => { ob = o; disegna(); }))),
        h('div.gruppo-titolo', null, 'Metodi di questa sessione'),
        h('div.chips', null, MET.map(([k, t]) => chip(pref[k], t, () => { pref[k] = !pref[k]; disegna(); }))),
        h('div.gruppo-titolo', null, 'La tua sessione'),
        h('div.gruppo', null, p.voci.map(v => h('div.widget-riga', null, h('span.nome', null, v.titolo, h('div.tenue.piccolo', null, v.motivo ? v.motivo : v.sotto)), h('span.tenue.piccolo', null, v.min + "'")))),
        p.esclusi.length ? h('details', null, h('summary.tenue.piccolo', null, 'Non entrano (' + p.esclusi.length + ')'),
          h('div.gruppo', null, p.esclusi.slice(0, 12).map(x => h('div.tenue.piccolo', null, x.titolo + ' — ' + x.perche)))) : null,
        h('div.tenue.piccolo', null, 'Ordine: illusioni di competenza, ripassi in scadenza, prerequisiti, errori, contenuto nuovo, consolidamento. Almeno il 10% del tempo resta per pause e richiamo finale; ciò che non entra è elencato con il motivo.'),
      ].forEach(el => el && corpo.appendChild(el));
    };
    disegna();
    foglio({ titolo: '▶ Studia ora', corpo, etichettaSalva: 'Inizia', salva: () => { StudiaOra.avvia(minuti, ob, pref); setTimeout(sessione, 50); } });
  }

  function sessione(): void {
    const corpo = h('div.modulo');
    const disegna = () => {
      const s = StudiaOra.leggi(); svuota(corpo); if (!s) return;
      const prossima = s.voci.findIndex(v => !v.fatto), fatte = s.voci.filter(v => v.fatto).length;
      const esegui = (i: number) => { StudiaOra.inizia(i); eseguiVoce(s.voci[i]); };
      [
        h('div.tenue.piccolo', null, fatte + ' di ' + s.voci.length + ' fatte · ' + s.minuti + ' minuti · iniziata alle ' + hm(new Date(s.inizio))),
        barra(fatte, s.voci.length),
        h('div.gruppo', null, s.voci.map((v, i) => h('div.voce-lista.task' + (v.fatto ? '.fatto' : '') + (i === prossima ? '.sessione-ora' : ''), null,
          h('button.spunta' + (v.fatto ? '.on' : ''), { 'aria-label': v.fatto ? 'Da fare' : 'Fatto', onclick: () => { StudiaOra.segnaFatto(i); disegna(); } }, v.fatto ? '✓' : ''),
          h('button.voce-corpo', { onclick: () => esegui(i) }, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, v.titolo), h('span.voce-sotto', null, (v.motivo || v.sotto) + ' · ' + v.min + "'"))))),
        prossima >= 0 ? h('div.bottoni', null, h('button.btn', { onclick: () => esegui(prossima) }, '▶ ' + s.voci[prossima].titolo.replace(/^\S+\s/, ''))) : h('div.vuoto', null, '🎉 Sessione completata. Ora 5 minuti di pausa tranquilla, senza schermo.'),
      ].forEach(el => corpo.appendChild(el));
    };
    disegna();
    foglio({ titolo: 'Sessione in corso', corpo, etichettaSalva: 'Termina', salva: () => { StudiaOra.chiudi(); avviso('Sessione chiusa.'); } });
  }

  /** Impostazioni → Studio → Metodi di studio (preferenze globali N5). */
  function preferenze(): void {
    const i = imp(), pref = StudiaOra.prefGlobali(); let ca = StudiaOra.carteAuto(), sa = i.suggerisciAppunti !== false;
    const corpo = h('div.modulo');
    const disegna = () => {
      svuota(corpo);
      [
        h('div.gruppo-titolo', null, 'Metodi che l\'app può proporti'),
        h('div.chips', null, MET.map(([k, t]) => chip(pref[k], t, () => { pref[k] = !pref[k]; disegna(); }))),
        h('div.tenue.piccolo', null, 'Un metodo spento non compare mai in Studia ora; nella singola sessione puoi riaccenderlo solo per quella volta. Lettura e richiamo restano sempre.'),
        h('div.gruppo-titolo', null, 'Flashcard dagli errori dei quiz'),
        h('div.chips', null, ([['mai', 'Mai'], ['proponi', 'Proponi'], ['auto', 'Automatiche']] as ['mai' | 'proponi' | 'auto', string][]).map(([v, t]) => chip(ca === v, t, () => { ca = v; disegna(); }))),
        h('div.gruppo-titolo', null, 'Appunti dopo il quiz'),
        h('div.chips', null, chip(sa, 'Suggeriscili', () => { sa = !sa; disegna(); })),
      ].forEach(el => corpo.appendChild(el));
    };
    disegna();
    foglio({ titolo: 'Metodi di studio', corpo, etichettaSalva: 'Salva', salva: () => { Stato.salva({ ...i, metodi: { ...pref }, carteAuto: ca, suggerisciAppunti: sa, updatedAt: Date.now() }); avviso('Preferenze salvate.'); } });
  }
  return { adesso, studia, scegli, sessione, preferenze };
})();
