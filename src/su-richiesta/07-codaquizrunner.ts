// ============================================================
// 07-codaquizrunner.ts - P0-B: percorso verticale testo/PDF testuale -> router AI -> checkpoint.
// Il runner e' strettamente sequenziale. Quote, 429, cooldown e failover appartengono solo a IA.chiedi.
// Nessun OCR: un PDF senza testo viene dichiarato e resta fuori dalla generazione.
// ============================================================

interface SpecificaGenerazioneQuiz {
  quantita: number;
  materia?: string;
  argomento?: string;
  step?: string;
  microstep?: string;
  codiceMateria?: string;
  archetipo?: string;
  maxPerBatch?: number;
  maxCaratteriFonte?: number;
}
interface EsitoPassoCodaQuiz { esito: 'occupato' | 'vuoto' | 'checkpoint' | 'completato' | 'rimandato' | 'pausa_incerta'; lavoro?: LavoroQuiz; prossimoTentativoIl?: number; errore?: string; }
interface DipendenzeRunnerQuiz {
  chiama?: (messaggi: Array<{ role: string; content: string }>, opzioni: { maxOut: number; tronca: false; archetipo?: string }) => Promise<{ j: unknown; prov: string; modello: string }>;
  ora?: () => number;
}

const CodaQuizRunner = (() => {
  const parole = (s: string): string[] => (String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{3,}/g) || []);
  const compatta = (s: string) => String(s || '').replace(/\s+/g, ' ').trim();
  const intero = (v: unknown, min: number, max: number, ripiego: number) => Math.max(min, Math.min(max, Math.floor(Number(v)) || ripiego));
  function specifica(o: SpecificaGenerazioneQuiz): SpecificaGenerazioneQuiz {
    return { quantita: intero(o && o.quantita, 1, 200, 30), materia: compatta(o && o.materia || '') || undefined,
      argomento: compatta(o && o.argomento || '') || undefined, step: compatta(o && o.step || '') || undefined,
      microstep: compatta(o && o.microstep || '') || undefined, codiceMateria: compatta(o && o.codiceMateria || '').toUpperCase() || undefined,
      archetipo: compatta(o && o.archetipo || '') || undefined, maxPerBatch: intero(o && o.maxPerBatch, 1, 8, 5),
      maxCaratteriFonte: intero(o && o.maxCaratteriFonte, 2000, 24000, 12000) };
  }
  function pagineTesto(testo: string, max = 5000): PaginaSorgenteQuiz[] {
    const ps = String(testo || '').replace(/\r/g, '').split(/\n\s*\n/).map(compatta).filter(Boolean), out: PaginaSorgenteQuiz[] = [];
    let blocco = '';
    const salva = () => { if (blocco) { out.push({ n: out.length + 1, testo: blocco }); blocco = ''; } };
    for (const p of ps.length ? ps : [compatta(testo)]) {
      if (p.length > max) {
        salva(); for (let i = 0; i < p.length; i += max) out.push({ n: out.length + 1, testo: p.slice(i, i + max) });
      } else if (!blocco || blocco.length + p.length + 2 <= max) blocco += (blocco ? '\n\n' : '') + p;
      else { salva(); blocco = p; }
    }
    salva(); return out;
  }
  async function creaDaTesto(account: string, testo: string, o: SpecificaGenerazioneQuiz, id?: string): Promise<LavoroQuiz> {
    const pulito = String(testo || '').trim(); if (!pulito) throw new Error('incolla del testo prima di creare la coda');
    const sp = specifica(o), versione = 'sha256:' + sha256Hex(pulito), pagine = pagineTesto(pulito);
    return CodaQuiz.aggiungi(account, { tipo: 'testo', id: id || 'testo-' + versione.slice(7, 19), versione }, sp as unknown as Record<string, unknown>, Date.now(), { pagine, pagineVuote: 0 });
  }
  async function creaDaPaginePdf(account: string, id: string, versione: string, pagine: PaginaSorgenteQuiz[], o: SpecificaGenerazioneQuiz): Promise<LavoroQuiz> {
    const tutte = (pagine || []).map(p => ({ n: Math.max(1, Math.floor(Number(p.n)) || 1), testo: compatta(p.testo) })), leggibili = tutte.filter(p => p.testo);
    if (!leggibili.length) throw new Error('Il PDF non contiene testo leggibile. L’OCR non fa parte di questa versione.');
    return CodaQuiz.aggiungi(account, { tipo: 'pdf', id: compatta(id) || 'pdf', versione: compatta(versione) || 'sha256:' + sha256Hex(leggibili.map(p => p.testo).join('\n')) },
      specifica(o) as unknown as Record<string, unknown>, Date.now(), { pagine: leggibili, pagineVuote: tutte.length - leggibili.length });
  }
  async function creaDaPdf(account: string, file: File, o: SpecificaGenerazioneQuiz): Promise<LavoroQuiz> {
    if (!file || !/\.pdf$/i.test(file.name || '')) throw new Error('scegli un PDF');
    const L = await caricaPdfJs(), doc = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const pagine: PaginaSorgenteQuiz[] = [];
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const tc: { items: Array<{ str?: string }> } = await (await doc.getPage(n)).getTextContent();
        pagine.push({ n, testo: tc.items.map(x => x.str || '').join(' ') });
      }
    } finally { if (typeof doc.destroy === 'function') await doc.destroy(); }
    return creaDaPaginePdf(account, file.name, 'sha256:' + sha256Hex(pagine.map(p => p.testo).join('\n')), pagine, o);
  }

  const maxOutPer = (n: number) => Math.min(4096, Math.max(900, n * 650));
  function limiteDaMessaggi(l: LavoroQuiz, maxOut: number, messaggi: Array<{ content: string }>): number {
    const configurato = intero(l.specifica.maxCaratteriFonte, 2000, 24000, 12000);
    const istruzioni = messaggi.reduce((tot, m) => tot + m.content.length, 0) + 80;
    const budget = typeof IA === 'undefined' ? configurato + istruzioni : IA.budgetCaratteriPrudente(maxOut);
    return Math.max(0, Math.min(configurato, budget - istruzioni));
  }
  const limiteFonte = (l: LavoroQuiz, n: number) => limiteDaMessaggi(l, maxOutPer(n), prompt(l, n, []));
  const limiteCorrezione = (l: LavoroQuiz, revisioni: RevisioneDomandaQuiz[]) =>
    limiteDaMessaggi(l, maxOutPer(revisioni.length), CodaQuizQualita.promptCorrezione(revisioni, []));
  function ritagliaPagine(pagine: PaginaSorgenteQuiz[], batch: number, max: number): PaginaSorgenteQuiz[] {
    if (max <= 0) return [];
    const finestra = (p: PaginaSorgenteQuiz): PaginaSorgenteQuiz => {
      if (p.testo.length <= max) return p;
      const blocchi = Math.ceil(p.testo.length / max), da = (batch % blocchi) * max;
      return { n: p.n, testo: p.testo.slice(da, da + max).trim() };
    };
    const out: PaginaSorgenteQuiz[] = []; let caratteri = 0;
    for (const originale of pagine) { const p = finestra(originale); if (out.length && caratteri + p.testo.length > max) continue; out.push(p); caratteri += p.testo.length; if (caratteri >= max) break; }
    return out;
  }
  function selezionaPagine(l: LavoroQuiz, batch: number, n = grandezzaBatch(l)): PaginaSorgenteQuiz[] {
    const input = l.input, max = limiteFonte(l, n); if (!input) return [];
    const chiavi = [...new Set<string>(parole(String(l.specifica.materia || '') + ' ' + String(l.specifica.argomento || '')))];
    const righe = input.pagine.map(p => ({ p, punti: chiavi.reduce((n, k) => n + (parole(p.testo).includes(k) ? 1 : 0), 0) }))
      .sort((a, b) => b.punti - a.punti || a.p.n - b.p.n);
    if (!righe.length) return [];
    const ruotate = righe.slice(batch % righe.length).concat(righe.slice(0, batch % righe.length));
    return ritagliaPagine(ruotate.map(r => r.p), batch, max).sort((a, b) => a.n - b.n);
  }
  function grandezzaBatch(l: LavoroQuiz): number {
    const fatti = (l.risultati || []).length + (l.revisioni || []).length, totale = intero(l.specifica.quantita, 1, 200, 30), foglio = 18 - (fatti % 18);
    return Math.min(totale - fatti, intero(l.specifica.maxPerBatch, 1, 8, 5), foglio);
  }
  function prompt(l: LavoroQuiz, n: number, pagine: PaginaSorgenteQuiz[]): Array<{ role: string; content: string }> {
    const fonte = pagine.map(p => '\n--- PAGINA ' + p.n + ' ---\n' + p.testo).join('');
    const target = [l.specifica.materia, l.specifica.argomento].filter(Boolean).join(' · ') || 'contenuto fornito';
    const regole = 'Genera quiz usando solo la fonte. Rispondi con un solo oggetto JSON {"formato":"quiz-v4","quiz":[...]}. ' +
      'Ogni domanda deve avere tipo "mcq", livello 1..4, domanda, 4 opzioni con la corretta in posizione 0, spiegazione con citazione [[Fonte, p. N]], ' +
      '3 spiegazioneDistrattori di almeno 30 caratteri, 3 distractorTypes, erroreTipico e fonte "Pagina N". Non scrivere id, esatta, markdown o testo fuori dal JSON.';
    return [
      { role: 'system', content: regole },
      { role: 'user', content: 'TARGET: ' + target + '\nCrea esattamente ' + n + ' domande nuove, autonome e non ripetitive.' + fonte },
    ];
  }
  function domandeDa(risposta: unknown, l: LavoroQuiz, n: number): DomAI[] {
    const lettura = Contratto.leggi(JSON.stringify(risposta)), fatti = (l.risultati || []).length + (l.revisioni || []).length, scheda = Math.floor(fatti / 18) + 1;
    const qs = Contratto.aQuiz(lettura, { step: String(l.specifica.step || l.id.slice(3, 11)), scheda, da: fatti % 18 + 1 });
    if (!qs.length) throw new Error(lettura.errori[0] || 'la risposta AI non contiene domande leggibili');
    return qs.slice(0, n);
  }
  const ritardo = (errore: string, tentativi: number) => /429|limite|quota|pausa/i.test(errore) ? 65e3 : Math.min(15 * 60e3, 30e3 * Math.pow(2, Math.min(5, tentativi)));
  async function avanza(account: string, proprietario = CodaQuiz.proprietarioTab(), d: DipendenzeRunnerQuiz = {}): Promise<EsitoPassoCodaQuiz> {
    const ora = d.ora || (() => Date.now()), t0 = ora();
    if (!await CodaQuiz.acquisisciLease(account, proprietario, t0, 120000)) return { esito: 'occupato' };
    let l: LavoroQuiz | null = null;
    try {
      l = await CodaQuiz.prossimo(account, proprietario, t0);
      if (!l) return { esito: 'vuoto' };
      const n = grandezzaBatch(l), totale = intero(l.specifica.quantita, 1, 200, 30), batch = (l.checkpoint || []).length;
      const pendenti = (l.revisioni || []).filter(x => x.stato === 'da_correggere').slice(0, 1);
      const numeri = new Set(pendenti.flatMap(x => x.pagine)), pagine = pendenti.length && l.input
        ? ritagliaPagine(l.input.pagine.filter(p => numeri.has(p.n)), batch, limiteCorrezione(l, pendenti)) : selezionaPagine(l, batch, n);
      if (pendenti.length) {
        const chiama = d.chiama || ((m, o) => IA.chiedi(m as any, 'genera', o)), opzioni = { maxOut: maxOutPer(pendenti.length), tronca: false as const, prudente: true,
          archetipo: l.specifica.archetipo ? String(l.specifica.archetipo) : undefined };
        const battito = setInterval(() => { CodaQuiz.rinnovaLease(account, proprietario, Date.now(), 120000).catch(e => console.warn('CodaQuizRunner: rinnovo lease fallito', e)); }, 30000);
        let r: { j: unknown; prov: string; modello: string };
        try { r = await chiama(CodaQuizQualita.promptCorrezione(pendenti, pagine), opzioni); } finally { clearInterval(battito); }
        const esiti = CodaQuizQualita.applicaCorrezioni(pendenti, r.j, pagine, l.risultati || []), tentativo = Math.max(...esiti.map(e => e.tentativi));
        const salvato = await CodaQuiz.salvaCorrezioni(account, l.id, { id: 'fix-' + pendenti.map(x => x.id).join('-') + '-' + tentativo,
          da: 0, richieste: pendenti.length, ottenute: esiti.filter(e => e.stato === 'pronta').length, provider: r.prov, modello: r.modello, salvatoIl: ora() }, esiti, totale, ora());
        return { esito: salvato.stato === 'completato' ? 'completato' : 'checkpoint', lavoro: salvato };
      }
      if (!n || !pagine.length) throw new Error('la sorgente non contiene testo utilizzabile');
      const opzioni = { maxOut: maxOutPer(n), tronca: false as const, prudente: true, archetipo: l.specifica.archetipo ? String(l.specifica.archetipo) : undefined };
      const chiama = d.chiama || ((m, o) => IA.chiedi(m as any, 'genera', o));
      const battito = setInterval(() => { CodaQuiz.rinnovaLease(account, proprietario, Date.now(), 120000).catch(e => console.warn('CodaQuizRunner: rinnovo lease fallito', e)); }, 30000);
      let r: { j: unknown; prov: string; modello: string };
      try { r = await chiama(prompt(l, n, pagine), opzioni); } finally { clearInterval(battito); }
      const qs = domandeDa(r.j, l, n), da = (l.risultati || []).length + (l.revisioni || []).length + 1;
      const esiti = CodaQuizQualita.validaDomande(qs, pagine, [...(l.risultati || []), ...(l.revisioni || []).map(x => x.domanda), ...(l.revisioniStoriche || []).map(x => x.domanda)]);
      const salvato = await CodaQuiz.salvaBatchQualita(account, l.id, { id: 'mb-' + da + '-' + n + '-r' + (l.rigenerazioni || 0), da, richieste: n, ottenute: qs.length,
        provider: r.prov, modello: r.modello, salvatoIl: ora() }, esiti, totale, ora());
      if (salvato.stato === 'in_pausa' || salvato.stato === 'annullato') return { esito: 'vuoto', lavoro: salvato };
      return { esito: salvato.stato === 'completato' ? 'completato' : 'checkpoint', lavoro: salvato };
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e), quando = ora() + ritardo(msg, l ? l.tentativi : 0);
      if (!l) throw e;
      if ((e as any)?.consumoIncerto) { const salvato = await CodaQuiz.fermaIncerto(account, l.id, msg, ora()); return { esito: 'pausa_incerta', lavoro: salvato, errore: msg }; }
      const salvato = await CodaQuiz.rimanda(account, l.id, msg, quando, ora());
      return salvato.stato === 'in_coda' ? { esito: 'rimandato', lavoro: salvato, prossimoTentativoIl: quando, errore: msg }
        : { esito: 'vuoto', lavoro: salvato };
    } finally { await CodaQuiz.rilasciaLease(account, proprietario).catch(e => console.warn('CodaQuizRunner: rilascio lease fallito', e)); }
  }

  return { specifica, pagineTesto, creaDaTesto, creaDaPaginePdf, creaDaPdf, selezionaPagine, grandezzaBatch, prompt, domandeDa, avanza };
})();
