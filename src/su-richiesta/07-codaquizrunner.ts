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
interface DocumentoPdfQuiz { id: string; nome?: string; versione: string; pagine: PaginaSorgenteQuiz[]; }
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
  async function creaPianoDaTesto(account: string, testo: string, o: SpecificaGenerazioneQuiz, piano: PianoQuantitaQuiz, id?: string): Promise<LavoroQuiz[]> {
    const pulito = String(testo || '').trim(); if (!pulito) throw new Error('incolla del testo prima di creare la coda');
    const sp = specifica(o), versione = 'sha256:' + sha256Hex(pulito), pagine = pagineTesto(pulito);
    return CodaQuiz.aggiungiPiano(account, { tipo: 'testo', id: id || 'testo-' + versione.slice(7, 19), versione },
      sp as unknown as Record<string, unknown>, piano, Date.now(), { pagine, pagineVuote: 0 });
  }
  async function creaDaPaginePdf(account: string, id: string, versione: string, pagine: PaginaSorgenteQuiz[], o: SpecificaGenerazioneQuiz): Promise<LavoroQuiz> {
    const tutte = (pagine || []).map(p => ({ n: Math.max(1, Math.floor(Number(p.n)) || 1), testo: compatta(p.testo) })), leggibili = tutte.filter(p => p.testo);
    if (!leggibili.length) throw new Error('Il PDF non contiene testo leggibile. L’OCR non fa parte di questa versione.');
    return CodaQuiz.aggiungi(account, { tipo: 'pdf', id: compatta(id) || 'pdf', versione: compatta(versione) || 'sha256:' + sha256Hex(leggibili.map(p => p.testo).join('\n')) },
      specifica(o) as unknown as Record<string, unknown>, Date.now(), { pagine: leggibili, pagineVuote: tutte.length - leggibili.length });
  }
  async function creaPianoDaPaginePdf(account: string, id: string, versione: string, pagine: PaginaSorgenteQuiz[], o: SpecificaGenerazioneQuiz, piano: PianoQuantitaQuiz): Promise<LavoroQuiz[]> {
    const tutte = (pagine || []).map(p => ({ n: Math.max(1, Math.floor(Number(p.n)) || 1), testo: compatta(p.testo) })), leggibili = tutte.filter(p => p.testo);
    if (!leggibili.length) throw new Error('Il PDF non contiene testo leggibile. L’OCR non fa parte di questa versione.');
    return CodaQuiz.aggiungiPiano(account, { tipo: 'pdf', id: compatta(id) || 'pdf', versione: compatta(versione) || 'sha256:' + sha256Hex(leggibili.map(p => p.testo).join('\n')) },
      specifica(o) as unknown as Record<string, unknown>, piano, Date.now(), { pagine: leggibili, pagineVuote: tutte.length - leggibili.length });
  }
  /** Unisce piu' PDF in un solo libro virtuale. I numeri virtuali sono stabili e conservano il rimando a file e pagina originali. */
  async function creaDaLibroPdf(account: string, documenti: DocumentoPdfQuiz[], o: SpecificaGenerazioneQuiz): Promise<LavoroQuiz> {
    const pronto = preparaLibroPdf(documenti);
    return CodaQuiz.aggiungi(account, pronto.sorgente, specifica(o) as unknown as Record<string, unknown>, Date.now(), pronto.input);
  }
  function preparaLibroPdf(documenti: DocumentoPdfQuiz[]): { sorgente: SorgenteLavoroQuiz; input: InputLavoroQuiz } {
    if (!documenti || documenti.length < 2) throw new Error('scegli almeno due PDF per creare un libro virtuale');
    const pagine: PaginaSorgenteQuiz[] = [], fonti: FonteLibroQuiz[] = []; let vuote = 0;
    documenti.forEach((d, indice) => {
      const nome = compatta(d.nome || d.id) || 'PDF ' + (indice + 1), id = compatta(d.id) || 'pdf-' + (indice + 1);
      const versione = compatta(d.versione) || 'sha256:' + sha256Hex((d.pagine || []).map(p => p.testo).join('\n'));
      const prima = pagine.length + 1, tutte = d.pagine || [], leggibili = tutte.filter(p => compatta(p.testo));
      leggibili.forEach(p => pagine.push({ n: pagine.length + 1, testo: compatta(p.testo), fileId: id, fileNome: nome,
        paginaFile: Math.max(1, Math.floor(Number(p.n)) || 1) }));
      const nVuote = tutte.length - leggibili.length; vuote += nVuote;
      fonti.push({ id, nome, versione, pagine: leggibili.length, pagineVuote: nVuote,
        primaPagina: leggibili.length ? prima : 0, ultimaPagina: leggibili.length ? pagine.length : 0 });
    });
    if (!pagine.length) throw new Error('I PDF non contengono testo leggibile. L’OCR non fa parte di questa versione.');
    const impronta = JSON.stringify(fonti.map(f => [f.id, f.versione, f.pagine, f.pagineVuote]));
    const versione = 'sha256:' + sha256Hex(impronta), id = 'libro-' + versione.slice(7, 19);
    return { sorgente: { tipo: 'libro_pdf', id, versione }, input: { pagine, pagineVuote: vuote, fonti } };
  }
  async function creaPianoDaLibroPdf(account: string, documenti: DocumentoPdfQuiz[], o: SpecificaGenerazioneQuiz, piano: PianoQuantitaQuiz): Promise<LavoroQuiz[]> {
    const pronto = preparaLibroPdf(documenti);
    return CodaQuiz.aggiungiPiano(account, pronto.sorgente, specifica(o) as unknown as Record<string, unknown>, piano, Date.now(), pronto.input);
  }
  async function estraiPdf(file: File): Promise<DocumentoPdfQuiz> {
    if (!file || !/\.pdf$/i.test(file.name || '')) throw new Error('scegli un PDF');
    const L = await caricaPdfJs(), doc = await L.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const pagine: PaginaSorgenteQuiz[] = [];
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const tc: { items: Array<{ str?: string }> } = await (await doc.getPage(n)).getTextContent();
        pagine.push({ n, testo: tc.items.map(x => x.str || '').join(' ') });
      }
    } finally { if (typeof doc.destroy === 'function') await doc.destroy(); }
    return { id: file.name, nome: file.name, versione: 'sha256:' + sha256Hex(pagine.map(p => p.testo).join('\n')), pagine };
  }
  async function creaDaPdf(account: string, file: File, o: SpecificaGenerazioneQuiz): Promise<LavoroQuiz> {
    const d = await estraiPdf(file);
    return creaDaPaginePdf(account, d.id, d.versione, d.pagine, o);
  }
  async function creaPianoDaPdf(account: string, file: File, o: SpecificaGenerazioneQuiz, piano: PianoQuantitaQuiz): Promise<LavoroQuiz[]> {
    const d = await estraiPdf(file);
    return creaPianoDaPaginePdf(account, d.id, d.versione, d.pagine, o, piano);
  }
  async function creaDaPdfs(account: string, files: File[], o: SpecificaGenerazioneQuiz): Promise<LavoroQuiz> {
    if (!files || files.length < 2) throw new Error('scegli almeno due PDF per creare un libro virtuale');
    const documenti: DocumentoPdfQuiz[] = [];
    for (const file of files) documenti.push(await estraiPdf(file));
    return creaDaLibroPdf(account, documenti, o);
  }
  async function creaPianoDaPdfs(account: string, files: File[], o: SpecificaGenerazioneQuiz, piano: PianoQuantitaQuiz): Promise<LavoroQuiz[]> {
    if (!files || files.length < 2) throw new Error('scegli almeno due PDF per creare un libro virtuale');
    const documenti: DocumentoPdfQuiz[] = [];
    for (const file of files) documenti.push(await estraiPdf(file));
    return creaPianoDaLibroPdf(account, documenti, o, piano);
  }

  const maxOutPer = (n: number) => Math.min(4096, Math.max(900, n * 650));
  function limiteDaMessaggi(l: LavoroQuiz, messaggi: Array<{ content: string }>, budgetCaratteri?: number): number {
    const configurato = intero(l.specifica.maxCaratteriFonte, 2000, 24000, 12000);
    const istruzioni = messaggi.reduce((tot, m) => tot + m.content.length, 0) + 80;
    const budget = budgetCaratteri == null ? configurato + istruzioni : budgetCaratteri;
    return Math.max(0, Math.min(configurato, budget - istruzioni));
  }
  const limiteFonte = (l: LavoroQuiz, n: number, budgetCaratteri?: number) => limiteDaMessaggi(l, prompt(l, n, []), budgetCaratteri);
  const limiteCorrezione = (l: LavoroQuiz, revisioni: RevisioneDomandaQuiz[], budgetCaratteri?: number) =>
    limiteDaMessaggi(l, CodaQuizQualita.promptCorrezione(revisioni, []), budgetCaratteri);
  function ritagliaPagine(pagine: PaginaSorgenteQuiz[], batch: number, max: number): PaginaSorgenteQuiz[] {
    if (max <= 0) return [];
    const finestra = (p: PaginaSorgenteQuiz): PaginaSorgenteQuiz => {
      if (p.testo.length <= max) return p;
      const blocchi = Math.ceil(p.testo.length / max), da = (batch % blocchi) * max;
      return { ...p, testo: p.testo.slice(da, da + max).trim() };
    };
    const out: PaginaSorgenteQuiz[] = []; let caratteri = 0;
    for (const originale of pagine) { const p = finestra(originale); if (out.length && caratteri + p.testo.length > max) continue; out.push(p); caratteri += p.testo.length; if (caratteri >= max) break; }
    return out;
  }
  function selezionaPagine(l: LavoroQuiz, batch: number, n = grandezzaBatch(l), budgetCaratteri?: number): PaginaSorgenteQuiz[] {
    const input = l.input, max = limiteFonte(l, n, budgetCaratteri); if (!input) return [];
    const chiavi = [...new Set<string>(parole(String(l.specifica.materia || '') + ' ' + String(l.specifica.argomento || '')))];
    const righe = input.pagine.map(p => ({ p, punti: chiavi.reduce((n, k) => n + (parole(p.testo).includes(k) ? 1 : 0), 0) }))
      .sort((a, b) => b.punti - a.punti || a.p.n - b.p.n);
    if (!righe.length) return [];
    const ruotate = righe.slice(batch % righe.length).concat(righe.slice(0, batch % righe.length));
    return ritagliaPagine(ruotate.map(r => r.p), batch, max).sort((a, b) => a.n - b.n);
  }
  function grandezzaBatch(l: LavoroQuiz): number {
    const fatti = (l.risultati || []).length + (l.revisioni || []).length, totale = intero(l.specifica.quantita, 1, 200, 30);
    return Math.min(totale - fatti, intero(l.specifica.maxPerBatch, 1, 8, 5));
  }
  function prompt(l: LavoroQuiz, n: number, pagine: PaginaSorgenteQuiz[]): Array<{ role: string; content: string }> {
    const fonte = pagine.map(p => '\n--- PAGINA ' + p.n + (p.fileNome ? ' · ' + p.fileNome + ' · pagina originale ' + p.paginaFile : '') + ' ---\n' + p.testo).join('');
    const target = [l.specifica.materia, l.specifica.argomento].filter(Boolean).join(' · ') || 'contenuto fornito';
    const regole = 'Genera quiz usando solo la fonte. Rispondi con un solo oggetto JSON {"formato":"quiz-v4","quiz":[...]}. ' +
      'Ogni domanda deve avere tipo "mcq", livello 1..4, domanda, 4 opzioni con la corretta in posizione 0, spiegazione con citazione [[Fonte, p. N]], ' +
      '3 spiegazioneDistrattori di almeno 30 caratteri, 3 distractorTypes, erroreTipico e fonte "Pagina N". Non scrivere id, esatta, markdown o testo fuori dal JSON.';
    return [
      { role: 'system', content: regole },
      { role: 'user', content: 'TARGET: ' + target + '\nCrea esattamente ' + n + ' domande nuove, autonome e non ripetitive.' + fonte },
    ];
  }
  /** Rifila sul prompt realmente inviato: oltre al testo conta intestazioni di pagina, file e citazioni. */
  function adattaPagineAlBudget(pagine: PaginaSorgenteQuiz[], budgetCaratteri: number | undefined,
    creaMessaggi: (pagine: PaginaSorgenteQuiz[]) => Array<{ content: string }>): PaginaSorgenteQuiz[] {
    if (budgetCaratteri == null) return pagine;
    const out = pagine.map(p => ({ ...p }));
    const lunghezza = () => creaMessaggi(out).reduce((tot, m) => tot + m.content.length, 0);
    while (out.length) {
      const eccedenza = lunghezza() - budgetCaratteri;
      if (eccedenza <= 0) break;
      const ultima = out[out.length - 1];
      if (ultima.testo.length <= eccedenza + 80) out.pop();
      else ultima.testo = ultima.testo.slice(0, Math.max(0, ultima.testo.length - eccedenza - 16)).trim();
    }
    return out;
  }
  function domandeDa(risposta: unknown, l: LavoroQuiz, n: number): DomAI[] {
    const lettura = Contratto.leggi(JSON.stringify(risposta)), fatti = (l.risultati || []).length + (l.revisioni || []).length;
    const qs = Contratto.aQuiz(lettura, { step: String(l.specifica.step || l.id.slice(3, 11)), scheda: 1, da: fatti + 1,
      sottoStep: l.specifica.microstep ? String(l.specifica.microstep) : undefined });
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
      let n = grandezzaBatch(l); const totale = intero(l.specifica.quantita, 1, 200, 30), batch = (l.checkpoint || []).length;
      const pendenti = (l.revisioni || []).filter(x => x.stato === 'da_correggere').slice(0, 1);
      // I test/iniettori non dichiarano un provider: per loro resta il profilo Groq conservativo; il percorso reale pianifica sul candidato effettivo.
      let maxOut = maxOutPer(pendenti.length || n), piano: { caratteri: number } | null = null;
      if (d.chiama) piano = { caratteri: IA.budgetCaratteriPrudente(maxOut, 'groq') };
      else {
        const archetipo = l.specifica.archetipo ? String(l.specifica.archetipo) : undefined, minimo = pendenti.length ? 1 : n;
        for (let candidato = minimo; candidato >= 1; candidato--) {
          const uscita = maxOutPer(pendenti.length || candidato), p = await IA.pianificaBudgetCaratteri('genera', uscita, { archetipo });
          if (p) { n = pendenti.length ? n : candidato; maxOut = uscita; piano = p; break; }
        }
        if (!piano) throw new Error('Nessun provider disponibile ha budget sufficiente per una domanda: controlla chiavi e quota oppure aggiungi Gemini.');
      }
      const numeri = new Set(pendenti.flatMap(x => x.pagine)); let pagine = pendenti.length && l.input
        ? ritagliaPagine(l.input.pagine.filter(p => numeri.has(p.n)), batch, limiteCorrezione(l, pendenti, piano?.caratteri)) : selezionaPagine(l, batch, n, piano?.caratteri);
      pagine = adattaPagineAlBudget(pagine, piano?.caratteri, ps => pendenti.length
        ? CodaQuizQualita.promptCorrezione(pendenti, ps) : prompt(l as LavoroQuiz, n, ps));
      if (pendenti.length) {
        const chiama = d.chiama || ((m, o) => IA.chiedi(m as any, 'genera', o)), opzioni = { maxOut, tronca: false as const, prudente: true,
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
      const opzioni = { maxOut, tronca: false as const, prudente: true, archetipo: l.specifica.archetipo ? String(l.specifica.archetipo) : undefined };
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

  return { specifica, pagineTesto, creaDaTesto, creaPianoDaTesto, creaDaPaginePdf, creaPianoDaPaginePdf, creaDaLibroPdf, creaPianoDaLibroPdf,
    creaDaPdf, creaPianoDaPdf, creaDaPdfs, creaPianoDaPdfs, selezionaPagine, grandezzaBatch, prompt, domandeDa, avanza };
})();
