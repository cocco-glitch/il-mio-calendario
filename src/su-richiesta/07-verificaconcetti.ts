// 07-verificaconcetti.ts — F1/F2 (S9, 27/11/2026): mini-verifica dei concetti, nel chunk del motore (motore-studio.js).
//
// Modello: la «Mastery Challenge» di Khan Academy (poche domande per abilità, regola trasparente) con la nostra soglia di affidabilità:
// fino a 3 concetti × 3 domande (Concetti.MIN_AFFIDABILE = 3: con 2 domande un concetto non potrebbe mai diventare «consolidato»).
// Usata per i concetti SCADUTI (CodaRipasso 'concetti', livello 2) e, in settimana finale, per le verifiche cumulative (livello 6).
// Il risultato aggiorna la padronanza e l'SRS delle domande, NON il punteggio della scheda (RisultatoQuiz.verifica, Cattura.salva).
// Scouting: docs/scouting/2026-11-27-settimana-finale-concetti-scaduti.md.

interface DomVerifica { id: string; q: string; t?: string; o?: string[]; show?: unknown; e?: unknown; concetto?: string; }
interface SchedaDaVerificare { sk: string; etichette: string[]; peggiore: StatoConcetto; r: number; materia: string; }

const VerificaConcetti = (() => {
  const PER = 3, MAX_CON = 3;
  const ORD: StatoConcetto[] = ['da_studiare', 'da_consolidare', 'in_consolidamento', 'consolidato', 'non_verificato'];

  /**
   * Pura: fino a PER domande per concetto (prima le mai viste, poi le viste da più tempo), alternate tra i concetti
   * (A1 B1 C1 A2 B2 …: interleaving dentro la verifica). Solo domande assegnate a quel concetto, mai il ripiego.
   */
  function scegli<D extends { id: string }>(domande: D[], ass: Map<string, AssegnaCon>, etichette: string[], vista: (id: string) => string): D[] {
    const gruppi = etichette.slice(0, MAX_CON).map(e => domande
      .filter(d => { const a = ass.get(d.id); return !!a && !a.ripiego && Concetti.slug(a.etichetta) === Concetti.slug(e); })
      .sort((a, b) => { const x = vista(a.id), y = vista(b.id); return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0; })
      .slice(0, PER));
    const out: D[] = [];
    for (let i = 0; i < PER; i++) for (const g of gruppi) if (g[i]) out.push(g[i]);
    return out;
  }

  /**
   * Pura (F1): schede da riverificare in settimana finale — concetti già verificati e non ancora scaduti (gli scaduti li porta la coda),
   * per scheda i MAX_CON più deboli; schede ordinate dal concetto peggiore e dal ricordo più basso, poi materie alternate.
   */
  function perFinale(mem: MemoriaCon[], giorno: string, materiaDi: (sk: string) => string): SchedaDaVerificare[] {
    const per = new Map<string, { c: { e: string; p: PadronanzaCon }[] }>();
    for (const m of mem) {
      if (!m || m.deleted || !String(m.er || '').startsWith('con:') || m.ripiego || !m.sk || !m.etichetta || !m.ultimo || m.due <= giorno) continue;
      const x = per.get(m.sk) || { c: [] }; x.c.push({ e: m.etichetta, p: Concetti.stato(m, giorno) }); per.set(m.sk, x);
    }
    const peso = (p: PadronanzaCon) => ORD.indexOf(p.stato) * 10 + (p.r === null ? 1 : p.r);
    const schede: SchedaDaVerificare[] = [];
    per.forEach((x, sk) => {
      const c = x.c.sort((a, b) => peso(a.p) - peso(b.p) || (a.e < b.e ? -1 : 1)).slice(0, MAX_CON);
      schede.push({ sk, etichette: c.map(z => z.e), peggiore: c[0].p.stato, r: Math.min(...c.map(z => z.p.r === null ? 1 : z.p.r)), materia: materiaDi(sk) });
    });
    schede.sort((a, b) => ORD.indexOf(a.peggiore) - ORD.indexOf(b.peggiore) || a.r - b.r || (a.sk < b.sk ? -1 : 1));
    // materie alternate a parità di urgenza: la prima di ogni materia, poi la seconda…
    const code = new Map<string, SchedaDaVerificare[]>(); for (const s of schede) { const l = code.get(s.materia) || []; l.push(s); code.set(s.materia, l); }
    const out: SchedaDaVerificare[] = [], liste = Array.from(code.values());
    for (let i = 0; out.length < schede.length; i++) for (const l of liste) if (l[i]) out.push(l[i]);
    return out;
  }

  async function avvia(sk: string, etichette: string[], chiudi?: () => void): Promise<void> {
    const t = trovaScheda(sk); if (!t) { avviso('Scheda non trovata: ' + sk); return; }
    let b: Awaited<ReturnType<typeof Banca.scheda>>;
    try { b = await Banca.scheda(t.pk, t.m, t.micro, t.s); } catch (e) { console.warn('VerificaConcetti: banca', e); avviso('⚠️ Domande della scheda non disponibili (serve la connessione la prima volta).', 6000); return; }
    const lista = Concetti.etichette(b.focus || ''), doms = b.domande as unknown as DomVerifica[];
    const ass = Concetti.assegna(sk, t.s.titolo, doms.map(d => ({ id: d.id, q: d.q, giusta: d.t === 'mcq' && d.o ? d.o[0] : String(d.show || ''),
      spieg: Array.isArray(d.e) ? d.e.join(' ') : String(d.e || ''), concetto: d.concetto })), lista, Locale);
    const viste = new Map(Stato.tutti<StatQ>('statq').filter(s => !s.deleted && s.sk === sk).map(s => [s.id, s.ultima || ''] as [string, string]));
    const sel = scegli(doms, ass, etichette, id => viste.get('sq-' + id) || '');
    if (!sel.length) { avviso('Nessuna domanda della scheda è assegnata a questi concetti: rifai il quiz completo.', 6000); apriScheda(t.pk, t.m, t.micro, t.s, true); return; }
    const scelte = sel as unknown as DomB[];
    QuizApp.apri(t.pk, t.m, t.micro, t.s, () => scelte, { occh: '🧩 Verifica dei concetti · ' + scelte.length + (scelte.length === 1 ? ' domanda' : ' domande') + ' · il punteggio della scheda non cambia',
      titolo: etichette.slice(0, MAX_CON).join(' · '), chiudi, immagini: b.immagini, verifica: true, focus: b.focus });
  }

  return { scegli, perFinale, avvia, PER, MAX_CON };
})();
