// =====================================================================
// 07-creaquiz.ts — v0.42 QUIZ «CREATI IN APP» (quando Claude non c'è)
// Replica il metodo delle schede fatte da Claude (file DIRETTIVE, punti 3-7), in 6 fasi controllabili:
//   1) RICHIESTA guidata: argomento + materia + cosa vuoi (teoria/problemi/trabocchetti/misto) + parole
//      chiave facoltative (sinonimi, capitolo, autore del libro, nome del docente, «slide», «UD3»…).
//   2) FONTI: Trova.fonti cerca in TUTTO il Drive (testo dei PDF, Documenti, Presentazioni) e propone le
//      migliori con il perché; l'utente può togliere/aggiungere. Dai PDF si leggono solo le pagine
//      pertinenti (parole chiave per pagina), con il numero di pagina.
//   3) GENERAZIONE (modello «genera»): 12 multiple A–E + 6 completamenti, tipi Sbarramento/Applicativo/
//      Trabocchetto/Problema/Completamento, correzione passo-passo (Cosa chiede → Il concetto → Passaggi →
//      In sintesi), «perché è sbagliata» per ogni distrattore, citazioni VERBATIM con file e pagina.
//   4) CONTROLLI AUTOMATICI (codice, non AI): formato, 5 opzioni distinte, corretta MAI la più lunga,
//      completamenti digitabili da tastiera, citazioni davvero presenti nella fonte (parola per parola),
//      niente doppioni (anche con la banca esistente).
//   5) REVISIONE INDIPENDENTE (modello DIVERSO): risolve ogni domanda «alla cieca» con le opzioni mescolate,
//      segnala errori di contenuto, ambiguità, numeri/unità e italiano (ortografia, grammatica) e propone
//      correzioni. Le domande non superate si rigenerano (max 2 giri), poi si scartano.
//   6) SALVATAGGIO come scheda «✨ creata in app» (record 'qcreato'): si apre col motore quiz dell'app,
//      con statistiche, «Rifai gli errori», spiegazione AI. Le schede di Claude restano distinte.
// =====================================================================

interface MisuraQuiz { fase: string; caratteri: number; }
interface SchedaQuiz { micro: string; priorita: string; copertura: string; multiple: number; completamenti: number; }
interface RichiestaQuiz { pianoSchede?: SchedaQuiz[]; scheda?: number; argomento: string; materia: string; cosa: string; extra: string; testoIncollato?: string; fonti: Trovato[]; nMcq: number; nFill: number; pianoId?: string; voceId?: string; minuti?: number; }
interface QCreato extends Rec { misure?: MisuraQuiz[]; pianoSchede?: SchedaQuiz[]; type: 'qcreato'; ripresa?: RichiestaQuiz; pianoId?: string; voceId?: string; minuti?: number; titolo: string; materia: string; argomento: string; cosa: string; fonti: { nome: string; id: string; pagine: string; mimeType?: string }[]; testoIncollato?: string; applicazioni?: string[]; domande: DomB[]; daRivedere?: { domanda: DomB; motivo: string }[]; creato: string; modelli: string[]; scartate: number; }

const CreaQuiz = (() => {
  const limiteTesto = (n: number) => Math.floor((IA.gemini ? 120000 : 22000) / Math.max(1, n));
  const LV = ['Sbarramento', 'Applicativo', 'Trabocchetto', 'Problema', 'Completamento'];
  const n2 = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[«»"“”‘’']/g, '').replace(/\s+/g, ' ').trim();
  const parole = (s: string) => new Set(n2(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 3));
  function simile(a: string, b: string): number { const A = parole(a), B = parole(b); if (!A.size || !B.size) return 0; let c = 0; A.forEach(w => { if (B.has(w)) c++; }); return c / (A.size + B.size - c); }
  const tutti = () => Stato.tutti<QCreato>('qcreato').filter(r => !r.deleted).sort((a, b) => b.creato < a.creato ? -1 : 1);

  // ---------- 2) lettura delle fonti ----------
  type Fonte = { nome: string; id: string; testo: string; pagine: string };
  /** Lezioni che la memoria ricava dai problemi trovati (così il generatore non li ripete). */
  const LEZIONE: [RegExp, string][] = [
    [/corretta è la più lunga/, 'Scrivi l\'opzione corretta breve quanto i distrattori: mai la più lunga né la più dettagliata.'],
    [/contenuta in un distrattore/, 'Il testo della corretta non deve comparire dentro un distrattore.'],
    [/citazione non trovata/, 'Copia le citazioni carattere per carattere dalle FONTI (stessa punteggiatura), senza riassumere né unire frasi diverse.'],
    [/non digitabile/, 'Nei completamenti solo risposte digitabili da tastiera: niente apici, pedici, ², ·, Δ, π, frecce.'],
    [/4 «perché/, 'Per ogni multipla scrivi esattamente 4 testi in "ew", uno per distrattore, nello stesso ordine.'],
    [/alla cieca|più risposte difendibili/, 'Ogni multipla deve avere UNA sola risposta difendibile secondo la fonte: distrattori chiaramente sbagliati, niente opzioni parzialmente vere.'],
    [/ha completato con/, 'Nei completamenti la frase deve ammettere una sola risposta: aggiungi contesto e metti tra le risposte accettate le varianti corrette.'],
    [/quasi uguale/, 'Varia concetto e formulazione di ogni domanda: niente domande che chiedono la stessa cosa.'],
    [/manca lo spazio/, 'Nei completamenti scrivi «……» nel punto dove va la risposta.'],
    [/troppo corta/, 'La correzione deve avere almeno 4 passaggi: Cosa chiede, Il concetto, i Passaggi, In sintesi.'],
    [/^contenuto:/, 'Controlla ogni affermazione sulla fonte prima di scriverla; niente dati che la fonte non contiene.'],
    [/^italiano:/, 'Rileggi l\'italiano: accordi, accenti (è/e, perché, più), apostrofi e punteggiatura.'],
  ];
  function impara(problemi: string[], materia: string): void {
    for (const p of problemi) for (const [re, l] of LEZIONE) if (re.test(p)) { MemoriaIA.nota('quiz', 'lezione', l.slice(0, 60), l); if (/^italiano:/.test(p)) MemoriaIA.nota('quiz', 'lezione', 'ita-' + p.slice(9, 60), 'Errore già fatto (' + materia + '): ' + p.slice(9, 160)); }
  }
  async function leggi(f: Trovato, chiavi: string[], budget: number, passo: (t: string) => void, argomento = ''): Promise<Fonte | null> {
    // v0.43 memoria: pagine che in passato hanno dato citazioni buone per argomenti simili
    const utili = new Set<number>(); for (const x of MemoriaIA.migliori('ricerca', 'pagine', 5, argomento)) if (x.k.startsWith(f.id + '|')) for (const p of String(x.v || '').split(',')) if (+p) utili.add(+p);
    if (utili.size >= 2) budget = Math.round(budget * .65);   // so già dove guardare: mando meno testo all'AI
    try {
      if (f.mimeType === 'application/pdf') {
        passo('Leggo «' + f.name + '»…');
        const grezze: { i: number; t: string }[] = [];
        await TestoPdf.con(await Drive.scaricaBlob(f.id), async doc => {   // blocco 1: prima il documento non veniva mai chiuso
          for (let i = 1; i <= Math.min(doc.numPages, 700); i++) {
            if (i % 25 === 0) passo('Leggo «' + f.name + '» · pagina ' + i + '/' + doc.numPages);
            grezze.push({ i, t: (await TestoPdf.pagina(doc, i, 'eol')).replace(/[ \t]+/g, ' ').trim() });
          }
        });
        // v0.44 locale: via intestazioni/piè di pagina ripetuti e righe spezzate (meno token), radici e sinonimi per trovare le pagine
        const pulite = Locale.pulisciPagine(grezze.map(x => x.t)), rad = Locale.espandi(chiavi).map(Locale.radice);
        const pag: { i: number; t: string; s: number }[] = [];
        grezze.forEach((g0, k) => { const t = pulite[k]; if (t.length < 40) return; const parole = n2(t).split(/[^a-z0-9]+/); let s = 0;
          for (const r of rad) { const c = parole.filter(w => w.startsWith(r)).length; s += c ? 3 + Math.min(c, 8) : 0; }
          pag.push({ i: g0.i, t, s: s + (utili.has(g0.i) ? 25 : 0) }); });
        const scelte = pag.filter(x => x.s > 0).sort((a, b) => b.s - a.s);
        const tieni: typeof pag = []; let tot = 0;
        for (const p of scelte) { if (tot + p.t.length > budget) break; tieni.push(p); tot += p.t.length; }
        if (!tieni.length) return null;
        tieni.sort((a, b) => a.i - b.i);
        return { nome: f.name.replace(/\.pdf$/i, ''), id: f.id, pagine: tieni.map(x => x.i).join(','), testo: tieni.map(x => '[[' + f.name.replace(/\.pdf$/i, '') + ', p. ' + x.i + ']]\n' + x.t).join('\n\n') };
      }
      const ex = f.mimeType.startsWith('application/vnd.google-apps.') ? await (await Drive.api('files/' + f.id + '/export', { query: { mimeType: 'text/plain' } })).text() : await Drive.scaricaTesto(f.id);
      // documenti lunghi: tengo i paragrafi con le parole chiave
      const par = ex.split(/\n\s*\n/).map((t: string, i: number) => ({ t: t.trim(), i, s: chiavi.reduce((a, w) => a + (n2(t).includes(w) ? 1 : 0), 0) })).filter((x: any) => x.t);
      const best = par.filter((x: any) => x.s).sort((a: any, b: any) => b.s - a.s); const tieni: any[] = []; let tot = 0;
      for (const p of best) { if (tot + p.t.length > budget) break; tieni.push(p); tot += p.t.length; }
      if (!tieni.length) return null;
      tieni.sort((a, b) => a.i - b.i);
      return { nome: f.name, id: f.id, pagine: '', testo: '[[' + f.name + ']]\n' + tieni.map(x => x.t).join('\n\n') };
    } catch (e: any) { passo('⚠️ «' + f.name + '» non leggibile: ' + (e.message || e)); return null; }
  }

  // ---------- 3) generazione ----------
  const REGOLE = [
    'Adatta il linguaggio, gli esempi e le applicazioni alla materia e alle fonti indicate. Italiano corretto e frasi chiare.',
    'Usa SOLO le informazioni delle FONTI: niente dati, numeri o fatti che non ci sono. Se un calcolo serve, i dati devono essere nel testo della domanda.',
    'Multiple (t:"mcq"): 5 opzioni in "o", la CORRETTA È SEMPRE LA PRIMA (verranno mescolate). La corretta NON deve essere la più lunga né la più dettagliata: scrivila breve e simile ai distrattori; allunga i distrattori se serve. Ogni distrattore nasce da un errore tipico preciso (formula invertita, unità non convertita, fattore 2, concetti simili confusi, lettura affrettata).',
    'Completamenti (t:"fill", lv:"Completamento"): testo con «……» al posto della risposta; "a" = risposte accettate DIGITABILI da tastiera iPhone (numeri semplici, parole; niente apici, pedici, ², ⁻, ·, Δ, π, →); varianti utili (sinonimi, singolare/plurale, con/senza unità); "show" = risposta da mostrare.',
    'Tipi "lv": Sbarramento (teoria), Applicativo, Trabocchetto, Problema (calcoli), Completamento. Mix adeguato a quanto richiesto.',
    'Correzione "e" = array di passaggi DISCORSIVI (come un tutor che spiega a voce): "Cosa chiede: …", "Il concetto: … (dove si trova nella fonte)", poi "Passaggio 1: …", "Passaggio 2: …" (nei calcoli: formula, formula inversa esplicita, da dove viene OGNI numero, conversioni di unità esplicite, unità fino in fondo), infine "In sintesi: …" (la regola da ricordare). Minimo 4 elementi.',
    '"ew" (solo mcq) = 4 testi, uno per ogni distrattore nello stesso ordine di o[1..4]: perché è sbagliato e quale errore di ragionamento c\'è dietro. Per i completamenti "ew" = 1 testo con gli errori più probabili.',
    '"cit" = 1-2 citazioni copiate PAROLA PER PAROLA dalle FONTI (frase intera, 10-50 parole), con "f" = nome del file e pagina come indicato tra [[ ]]. Non riformulare le citazioni. "r" = fonte breve (file, pagina).',
    'Niente domande duplicate o quasi uguali tra loro né con quelle elencate come già presenti.',
  ];
  function msgGenera(o: { argomento: string; materia: string; cosa: string; extra: string }, fonti: Fonte[], nMcq: number, nFill: number, gia: string[], applicazioni: string[], feedback = ''): { role: string; content: string }[] {
    return [{ role: 'system', content: 'Sei un docente esperto che scrive schede di quiz di ' + o.materia + '. Regole obbligatorie:\n- ' + REGOLE.join('\n- ') + MemoriaIA.linee('quiz', 8) + '\nRispondi SOLO con JSON valido: {"applicazioni":["sottoargomento — azione concreta"],"domande":[{"applicazione","t","lv","q","o","e","ew","a","show","r","cit":[{"t","f"}]}]}.' },
      { role: 'user', content: 'ARGOMENTO: ' + o.argomento + '\nCOSA VOGLIO: ' + o.cosa + (o.extra ? '\nINDICAZIONI: ' + o.extra : '') + '\n\nScrivi ' + (nMcq ? nMcq + ' domande a risposta multipla' : '') + (nMcq && nFill ? ' e ' : '') + (nFill ? nFill + ' completamenti' : '') + ' (prima le multiple).'
        + (applicazioni.length ? '\nUsa queste applicazioni, copiando il nome esatto in ogni domanda: ' + JSON.stringify(applicazioni)
          : '\nRicava dalle fonti le applicazioni richieste per questo argomento, incluse quelle che non entrano nel quiz. Elencale in applicazioni. Per ogni domanda copia in applicazione la voce che mette alla prova.')
        + (gia.length ? '\n\nDOMANDE GIÀ PRESENTI (non ripeterle):\n- ' + gia.slice(-40).join('\n- ') : '') + (feedback ? '\n\nCORREGGI QUESTI PROBLEMI:\n' + feedback : '')
        + '\n\nFONTI:\n' + fonti.map(f => f.testo).join('\n\n') }];
  }

  // ---------- 4) controlli automatici ----------
  const NON_DIGITABILE = /[²³¹⁰⁴-⁹⁻⁺·×÷Δδπ→←↔≈≠≤≥√∞°µ±_^]/;
  function controlla(d: any, fontiTesto: string, altre: string[]): string[] {
    const p: string[] = [];
    if (!d || typeof d.q !== 'string' || d.q.trim().length < 15) return ['testo mancante'];
    // v0.44 correzioni locali (zero token) prima di giudicare: corretta accorciata, risposte rese digitabili,
    // citazioni sostituite con la frase vera della fonte più simile
    Locale.accorciaCorretta(d);
    if (d.t === 'fill' && Array.isArray(d.a)) d.a = Locale.digitabili(d.a.map(String));
    if (Array.isArray(d.cit)) d.cit = d.cit.map((c: any) => { if (!c || typeof c.t !== 'string') return c; const ftt = n2(fontiTesto).replace(/[^a-z0-9]/g, ''); if (ftt.includes(n2(c.t).replace(/[^a-z0-9]/g, ''))) return c; const v = Locale.citazioneVera(c.t, fontiTesto); return v ? { ...c, t: v } : c; });
    if (!LV.includes(d.lv)) d.lv = d.t === 'fill' ? 'Completamento' : 'Applicativo';
    if (!Array.isArray(d.e) || d.e.filter((x: any) => typeof x === 'string' && x.trim()).length < 3) p.push('correzione passo-passo troppo corta');
    if (d.t === 'mcq') {
      if (!Array.isArray(d.o) || d.o.length !== 5 || d.o.some((x: any) => typeof x !== 'string' || !x.trim())) p.push('servono 5 opzioni');
      else {
        if (new Set(d.o.map((x: string) => n2(x))).size < 5) p.push('opzioni uguali');
        const lc = d.o[0].length, max = Math.max(...d.o.slice(1).map((x: string) => x.length));
        if (lc > max) p.push('la corretta è la più lunga: accorciala o allunga i distrattori');
        if (d.o.slice(1).some((x: string) => n2(x).includes(n2(d.o[0])) && n2(d.o[0]).length > 3)) p.push('la corretta è contenuta in un distrattore');
      }
      if (!Array.isArray(d.ew) || d.ew.length !== 4 || d.ew.some((x: any) => typeof x !== 'string' || !x.trim())) p.push('servono 4 «perché è sbagliata»');
    } else if (d.t === 'fill') {
      if (!Array.isArray(d.a) || !d.a.length) p.push('mancano le risposte accettate');
      else if (d.a.some((x: any) => typeof x !== 'string' || NON_DIGITABILE.test(x))) p.push('risposta non digitabile da tastiera');
      if (!/……|\.\.\.|___/.test(d.q)) p.push('manca lo spazio «……» da completare');
      if (!d.show) d.show = d.a && d.a[0];
      if (!Array.isArray(d.ew) || !d.ew.length) d.ew = ['Controlla unità, segno e ortografia della risposta.'];
    } else p.push('tipo sconosciuto');
    // citazioni: devono esserci davvero nella fonte (confronto senza spazi/maiuscole/virgolette)
    const ft = n2(fontiTesto);
    d.cit = (Array.isArray(d.cit) ? d.cit : []).filter((c: any) => c && typeof c.t === 'string' && c.t.length > 20 && ft.includes(n2(c.t)));
    if (!d.cit.length) p.push('citazione non trovata parola per parola nelle fonti');
    if (altre.some(q => n2(q) === n2(d.q) || simile(q, d.q) >= .6)) p.push('quasi uguale a un\'altra domanda');
    return p;
  }

  // ---------- 5) revisione indipendente ----------
  function chiediMisurato(misure: MisuraQuiz[], ...parametri: Parameters<typeof IA.chiedi>) {
    const [messaggi, fase] = parametri;
    misure.push({ fase, caratteri: messaggi.reduce((n, m) => n + m.content.length, 0) });
    return IA.chiedi(...parametri);
  }
  async function revisiona(ds: any[], fonti: Fonte[], evita: string, specifica = '', misure: MisuraQuiz[] = []): Promise<{ esiti: Map<number, string[]>; modello: string }> {
    const L = 'ABCDE', ordini = ds.map(d => d.t === 'mcq' ? mescolaU([0, 1, 2, 3, 4]) : []);
    const elenco = ds.map((d, i) => (d.t === 'mcq' ? i + ') ' + d.q + '\n' + ordini[i].map((k: number, j: number) => '   ' + L[j] + ') ' + d.o[k]).join('\n') : i + ') [completamento] ' + d.q) + (d.applicazione ? '\nApplicazione da verificare: ' + d.applicazione : ''));
    const r = await chiediMisurato(misure, [{ role: 'system', content: 'Sei un revisore severo di quiz universitari italiani. Hai SOLO le fonti. Rispondi in JSON.' },
      { role: 'user', content: 'Risolvi ogni domanda basandoti SOLO sulle fonti, poi controllala. JSON: {"esiti":[{"i":numero,"risposta":"lettera A-E oppure testo del completamento","ambigua":bool,"errori_contenuto":"…o vuoto","errori_italiano":"…o vuoto"}]}. Se è indicata una applicazione, restituisci anche applicazione_verificata (booleano): vera solo se la fonte sostiene questa applicazione e rispondere richiede davvero quella capacità. Segnala in errori_contenuto gli indizi da dettaglio, concordanza grammaticale o ripetizione della consegna, i distrattori implausibili e gli scostamenti dalla specifica confermata. ' + specifica + ' Segnala come ambigua una multipla con più opzioni difendibili. Segnala errori di italiano (ortografia, grammatica, concordanze, punteggiatura) anche piccoli.\n\nDOMANDE:\n' + elenco.join('\n\n') + '\n\nFONTI:\n' + fonti.map(f => f.testo).join('\n\n') }], 'revisiona', { evita, temp: 0 });
    const esiti = new Map<number, string[]>();
    for (const x of (r.j && r.j.esiti) || []) {
      if (!x || !Number.isInteger(x.i) || !ds[x.i]) continue;
      const i = x.i, d = ds[i], p: string[] = [];
      if (esiti.has(i) || typeof x.risposta !== 'string' || !x.risposta.trim() ||
          typeof x.ambigua !== 'boolean' || typeof x.errori_contenuto !== 'string' || typeof x.errori_italiano !== 'string') {
        esiti.set(i, ['Esito incompleto o duplicato.']);
        continue;
      }
      if (d.t === 'mcq') { const lettera = x.risposta.trim().toUpperCase(); const k = /^[A-E]$/.test(lettera) ? L.indexOf(lettera) : -1; if (k < 0 || ordini[i][k] !== 0) p.push('il revisore, risolvendola alla cieca, ha scelto un\'altra opzione: la domanda è ambigua o la risposta indicata è sbagliata'); }
      else if (!giustaR(String(x.risposta || ''), d.a || [])) p.push('il revisore ha completato con «' + String(x.risposta || '').slice(0, 40) + '»: rendi la frase univoca o aggiungi la variante se corretta');
      if (d.applicazione && x.applicazione_verificata !== true) p.push('Applicazione didattica da verificare.');
      if (x.ambigua) p.push('più risposte difendibili');
      if (x.errori_contenuto && String(x.errori_contenuto).trim().length > 0) p.push('contenuto: ' + x.errori_contenuto);
      if (x.errori_italiano && String(x.errori_italiano).trim().length > 0) p.push('italiano: ' + x.errori_italiano);
      esiti.set(i, p);
    }
    // Il primo giudizio resta cieco. Solo dopo la soluzione controlliamo il materiale che leggerà lo studente.
    const correzioni = ds.flatMap((d, i) => esiti.get(i)?.length === 0 ? [{
      i, domanda: d.q, opzioni: d.o, risposta: d.t === 'mcq' ? d.o[0] : d.a,
      mostrata: d.show, spiegazione: d.e, motivi: d.ew, citazioni: d.cit,
    }] : []);
    if (correzioni.length) {
      const controllo = await chiediMisurato(misure, [
        { role: 'system', content: 'Sei un revisore delle correzioni didattiche. Rispondi in JSON.' },
        { role: 'user', content: 'Verifica sui brani delle fonti la pertinenza delle citazioni, la risposta mostrata, ogni passaggio, formule e unità se pertinenti, e il motivo di ciascun distrattore nel suo ordine. Per i completamenti controlla varianti accettate ed errori tipici. Restituisci {"correzioni":[{"i":numero,"problema":stringa}]}, con problema vuoto solo se tutti i controlli passano.\n' + JSON.stringify(correzioni) + '\nFONTI:\n' + fonti.map(f => f.testo).join('\n\n') },
      ], 'revisiona', { evita, temp: 0 });
      const giudizi: unknown[] = Array.isArray(controllo.j?.correzioni) ? controllo.j.correzioni : [];
      for (const { i } of correzioni) {
        const voci = giudizi.filter((v): v is { i: number; problema: string } =>
          typeof v === 'object' && v !== null && 'i' in v && v.i === i);
        if (voci.length !== 1 || typeof voci[0].problema !== 'string') esiti.set(i, ['Esito incompleto o duplicato.']);
        else if (voci[0].problema.trim()) esiti.set(i, ['Correzione: ' + voci[0].problema.trim()]);
      }
    }
    return { esiti, modello: r.modello };
  }
  const normR = (s: string) => n2(s).replace(',', '.').replace(/[^a-z0-9.\- ]/g, '').trim();
  function giustaR(v: string, a: string[]): boolean { const x = normR(v); return !!x && a.some(y => { const z = normR(y); return x === z || (/^-?\d+(\.\d+)?$/.test(x) && /^-?\d+(\.\d+)?$/.test(z) && Number(x) === Number(z)); }); }

  // ---------- l'intero processo ----------
  async function crea(o: RichiestaQuiz, passo: (t: string) => void, destinazione?: { quiz: QCreato; applicazione?: string; sostituisci?: string; lotto?: boolean }): Promise<QCreato> {
    const chiavi = Array.from(new Set((o.argomento + ' ' + o.extra).split(/[\s,;:/()«»"]+/).map(n2).filter(w => w.length > 3))).slice(0, 12);
    const fonti: Fonte[] = [];
    const testoIncollato = o.testoIncollato?.trim();
    const quota = limiteTesto(o.fonti.length + (testoIncollato ? 1 : 0));
    if (testoIncollato) {
      if (testoIncollato.length > quota) throw new Error('Il testo supera il limite per queste fonti (' + quota + ' caratteri). Riduci il testo o togli una fonte.');
      fonti.push({ id: 'testo-incollato', nome: 'Testo incollato', pagine: '', testo: '[[Testo incollato]]\n' + testoIncollato });
    }
    for (const f of o.fonti) { const x = await leggi(f, chiavi, quota, passo, o.argomento); if (x) fonti.push(x); }
    if (!fonti.length) throw new Error('Nelle fonti scelte non ho trovato pagine su «' + o.argomento + '». Prova parole chiave diverse (sinonimi, nome del capitolo) o altre fonti.');
    const scheda = o.scheda === undefined ? undefined : o.pianoSchede?.[o.scheda];
    const misure: MisuraQuiz[] = [];
    if (scheda) {
      const termini = Array.from(parole(scheda.micro + ' ' + scheda.copertura));
      for (const fonte of fonti) {
        const pagine = fonte.testo.split(/(?=\[\[)/).filter(p => p.trim() && !/^\[\[Testo incollato\]\]\s*$/.test(p));
        if (pagine.length < 2) continue;
        const pertinenti = pagine.filter(p => termini.some(w => parole(p).has(w)));
        if (pertinenti.length) fonte.testo = pertinenti.join('\n');
      }
    }
    const testoFonti = fonti.map(f => f.testo).join('\n');
    const banca = Stato.tutti<QCreato>('qcreato').flatMap(r => r.domande.map(d => d.q)).slice(-200);
    if (destinazione) banca.push(...destinazione.quiz.domande.map(d => d.q), ...(destinazione.quiz.daRivedere || []).map(x => x.domanda.q));
    const modelli = new Set<string>(); let buone: any[] = [], scartate = 0;
    const specifica = scheda ? 'Scheda confermata: ' + JSON.stringify(scheda) : '';
    const applicazioni: string[] = destinazione?.applicazione ? [destinazione.applicazione] : scheda ? [scheda.copertura] : [...(destinazione?.quiz.applicazioni || [])];
    const genera = async (nM: number, nF: number, feedback = ''): Promise<any[]> => {
      const out: any[] = [];
      const blocco = async (multiple: number, completamenti: number) => {
        const gia = (destinazione?.quiz.domande || []).map(d => d.q).concat(buone.concat(out).map(d => d.q));
        const r = await chiediMisurato(misure, msgGenera({ ...o, extra: [o.extra, specifica].filter(Boolean).join('\n') }, fonti, multiple, completamenti, gia, applicazioni, feedback), 'genera', { temp: .5 });
        modelli.add(r.modello);
        if ((!destinazione || destinazione.lotto) && !applicazioni.length && Array.isArray(r.j?.applicazioni)) {
          for (const nome of r.j.applicazioni) {
            if (typeof nome === 'string' && nome.trim() && !applicazioni.includes(nome.trim())) applicazioni.push(nome.trim());
          }
        }
        for (const d of (r.j?.domande || []).slice(0, multiple + completamenti)) {
          const applicazione = typeof d.applicazione === 'string' ? d.applicazione.trim() : '';
          if (destinazione?.applicazione && applicazione !== destinazione.applicazione) continue;
          out.push({ ...d, applicazione: applicazioni.includes(applicazione) ? applicazione : undefined,
            t: multiple ? 'mcq' : 'fill', lv: multiple ? d.lv : 'Completamento' });
        }
      };
      for (let k = 0; k < nM; k += 6) {
        passo('Scrivo le multiple ' + (k + 1) + '–' + Math.min(nM, k + 6) + '…');
        await blocco(Math.min(6, nM - k), 0);
      }
      if (nF) { passo('Scrivo i completamenti…'); await blocco(0, nF); }
      return out;
    };
    const sospese = new Map<typeof buone[number], string>();
    let candidate = await genera(o.nMcq, o.nFill), giro = 0;
    while (giro < 3) {
      giro++;
      passo('Controlli automatici (giro ' + giro + ')…');
      const problemi = new Map<any, string[]>();
      candidate.forEach((d, i) => { const p = controlla(d, testoFonti, banca.concat(buone.map(x => x.q), candidate.filter((_, j) => j !== i).map(x => x.q))); if (p.length) problemi.set(d, p); });
      const sane = candidate.filter(d => !problemi.has(d));
      if (sane.length) {
        passo('Revisione indipendente: un altro modello risolve le domande alla cieca e controlla l\'italiano…');
        const gen = Array.from(modelli).pop() || '';
        try {
          const rv = await revisiona(sane, fonti, gen, specifica, misure);
          modelli.add(rv.modello);
          sane.forEach((d, i) => {
            const p = rv.esiti.get(i);
            if (scheda && d.applicazione !== scheda.copertura) sospese.set(d, 'Copertura della scheda non confermata.');
            else if (!p || p[0] === 'Esito incompleto o duplicato.') sospese.set(d, p ? p[0] : 'Esito del revisore mancante.');
            else if (p.length) { sospese.set(d, p.join(' · ')); problemi.set(d, p); }
          });
        } catch {
          passo('Revisione interrotta. Salvo le domande da rivedere.');
          sane.forEach(d => sospese.set(d, 'Revisione interrotta.'));
        }
      }
      buone = buone.concat(sane.filter(d => !sospese.has(d)));
      problemi.forEach(p => impara(p, o.materia));
      const ko = candidate.filter(d => problemi.has(d));
      const mancanti = Array.from(sospese.keys()).filter(d => !problemi.has(d));
      const riservate = buone.concat(mancanti);
      const mancaM = o.nMcq - riservate.filter(d => d.t === 'mcq').length, mancaF = o.nFill - riservate.filter(d => d.t === 'fill').length;
      if (!ko.length || (mancaM <= 0 && mancaF <= 0)) { scartate += ko.filter(d => !sospese.has(d)).length; break; }
      if (giro === 3) { scartate += ko.filter(d => !sospese.has(d)).length; break; }
      passo('Rigenero ' + ko.length + ' domande con i problemi trovati…');
      const fb = ko.slice(0, 8).map(d => '- «' + String(d.q).slice(0, 90) + '»: ' + problemi.get(d)!.join('; ')).join('\n');
      scartate += ko.filter(d => !sospese.has(d)).length;
      candidate = await genera(Math.max(0, mancaM), Math.max(0, mancaF), fb);
    }
    buone = buone.filter(d => d.t === 'mcq').slice(0, o.nMcq).concat(buone.filter(d => d.t === 'fill').slice(0, o.nFill));
    if (!buone.length && !sospese.size) throw new Error('Nessuna domanda ha superato i controlli. Prova con fonti più pertinenti o un argomento più preciso.');
    const id = destinazione?.quiz.id || 'qc-' + uid();
    const converti = (d: typeof buone[number], i: number): DomB => ({ schedaQuiz: o.scheda, id: id + '-' + (destinazione ? uid() : i + 1), sk: id, applicazione: d.applicazione, t: d.t, lv: d.lv, q: String(d.q).trim(), o: d.t === 'mcq' ? d.o.map((x: string) => String(x).trim()) : undefined,
      a: d.t === 'fill' ? d.a.map(String) : undefined, show: d.t === 'fill' ? String(d.show || d.a[0]) : undefined, e: d.e.map(String), ew: (d.ew || []).map(String), r: String(d.r || fonti[0].nome),
      cit: d.cit.map((c: {t: string}) => {
        const fonte = fonti.find(f => n2(f.testo).includes(n2(c.t)));
        const porzione = fonte?.testo.split(/(?=\[\[)/).find(t => n2(t).includes(n2(c.t)));
        const nome = porzione?.match(/^\[\[([^\]]+)\]\]/)?.[1] || fonte?.nome || '';
        return { t:c.t.trim(), f:nome, l:linkFonte(fonti, nome) };
      }), gen: true });
    const domande = buone.map(converti);
    const daRivedere = (['mcq', 'fill'] as const).flatMap(tipo => Array.from(sospese).filter(([d]) => d.t === tipo)
      .slice(0, (tipo === 'mcq' ? o.nMcq : o.nFill) - domande.filter(d => d.t === tipo).length)
      .map(([d, motivo], i) => ({ domanda: converti(d, domande.length + (tipo === 'fill' ? o.nMcq : 0) + i), motivo })));
    if (destinazione) {
      const precedente = destinazione.quiz;
      const attuale = Stato.prendi<QCreato>(id);
      if (!attuale || attuale.deleted || attuale.acc !== precedente.acc || attuale.updatedAt !== precedente.updatedAt) {
        throw new Error('Il quiz è cambiato. Riapri la mappa per aggiornarlo.');
      }
      let pendenti = attuale.daRivedere || [];
      if (destinazione.sostituisci) {
        if (!domande.length) throw new Error('Sostituzione non approvata. La domanda originale resta da rivedere. ' + (daRivedere[0]?.motivo || ''));
        pendenti = pendenti.filter(x => x.domanda.id !== destinazione.sostituisci);
      } else {
        pendenti = pendenti.concat(daRivedere);
      }
      const posizione = attuale.domande.findIndex(d => d.id === destinazione.sostituisci);
      const aggiornate = attuale.domande.slice();
      aggiornate.splice(posizione < 0 ? aggiornate.length : posizione, posizione < 0 ? 0 : 1, ...domande);
      const aggiornato = { ...attuale, misure: (attuale.misure || []).concat(misure), domande: aggiornate, daRivedere: pendenti,
        modelli: Array.from(new Set(attuale.modelli.concat(Array.from(modelli)))), scartate: attuale.scartate + scartate };
      if (destinazione.lotto && attuale.ripresa) {
        aggiornato.fonti = fonti.map(f => ({ nome:f.nome, id:f.id, pagine:f.pagine, mimeType:o.fonti.find(x => x.id === f.id)?.mimeType }));
        aggiornato.applicazioni = Array.from(new Set([...(attuale.applicazioni || []), ...applicazioni]));
        const tutte = aggiornato.domande.concat(pendenti.map(x => x.domanda));
        const mancanoM = tutte.filter(d => d.t === 'mcq').length < attuale.ripresa.nMcq;
        const mancanoF = tutte.filter(d => d.t === 'fill').length < attuale.ripresa.nFill;
        if (!mancanoM && !mancanoF) delete aggiornato.ripresa;
      }
      await Stato.salva(aggiornato);
      return aggiornato;
    }
    const rec: QCreato = { id, misure, type: 'qcreato', updatedAt: 0, titolo: o.argomento.charAt(0).toUpperCase() + o.argomento.slice(1), materia: o.materia, argomento: o.argomento, cosa: o.cosa,
      fonti: fonti.map(f => ({ nome: f.nome, id: f.id, pagine: f.pagine, mimeType: o.fonti.find(x => x.id === f.id)?.mimeType })), testoIncollato, applicazioni, domande, daRivedere, creato: new Date().toISOString(), modelli: Array.from(modelli), scartate };
    Stato.salva(rec);
    // v0.43 memoria: dove stava cosa (argomento → file) e quali pagine hanno dato citazioni buone
    Trova.ricordaPosto(o.argomento, o.fonti.filter(f => fonti.some(x => x.id === f.id)));
    for (const f of fonti) { const pp = new Set<string>(); for (const d of domande) for (const c of d.cit || []) { const m = /p\.\s*(\d+)/.exec(c.f); if (m && n2(c.f).includes(n2(f.nome).slice(0, 15))) pp.add(m[1]); } if (pp.size) MemoriaIA.nota('ricerca', 'pagine', f.id + '|' + o.argomento, Array.from(pp).join(',')); }
    return rec;
  }
  function linkFonte(fonti: Fonte[], f: string): string | undefined {
    const x = fonti.find(y => f && n2(f).includes(n2(y.nome))); if (!x || x.id === 'testo-incollato') return undefined;
    const p = /p\.\s*(\d+)/.exec(f); return 'https://drive.google.com/file/d/' + x.id + '/view' + (p ? '#page=' + p[1] : '');
  }

  // ---------- interfaccia ----------
  function apri(r: QCreato): void {
    if (r.ripresa) {
      const v = visore(r.titolo);
      v.corpo.append(h('p', null, r.domande.length + ' pronte · ' + (r.daRivedere?.length || 0) + ' da rivedere'),
        h('button.btn', { onclick: () => { v.chiudi(); avvia(r.ripresa!, r); } }, 'Riprendi generazione'));
      return;
    }
    if (r.minuti || r.applicazioni?.length || r.daRivedere?.length) {
      const v = visore(r.titolo);
      let occupato = false;
      const stato = h('p.tenue', { role: 'status' });
      const generaDomanda = async (nome?: string, originale?: { domanda: DomB; motivo: string }) => {
        if (occupato) return;
        occupato = true;
        stato.textContent = 'Leggo le fonti…';
        try {
          const fonti = await Promise.all(r.fonti.filter(f => f.id !== 'testo-incollato').map(async f => {
            const mimeType = f.mimeType || (await Drive.api('files/' + encodeURIComponent(f.id), { query: { fields: 'mimeType' } })).mimeType;
            return { id: f.id, name: f.nome, mimeType, modifiedTime: '', punti: 0, perche: [] };
          }));
          const completamento = originale?.domanda.t === 'fill';
          const extra = originale ? [nome, 'Riscrivi questa domanda: ' + originale.domanda.q, 'Problema da correggere: ' + originale.motivo].filter(Boolean).join('\n') : nome || '';
          const aggiornato = await crea({ ...r, scheda: originale?.domanda.schedaQuiz ?? (nome && r.pianoSchede ? r.pianoSchede.findIndex(s => s.copertura === nome) : undefined), fonti, extra, nMcq: completamento ? 0 : 1, nFill: completamento ? 1 : 0 },
            t => { stato.textContent = t; }, { quiz: r, applicazione: nome, sostituisci: originale?.domanda.id });
          if (v.corpo.isConnected) { v.chiudi(); apri(aggiornato); }
        } catch (errore) {
          stato.textContent = errore instanceof Error ? errore.message : 'Generazione interrotta. Riprova.';
        } finally { occupato = false; }
      };
      const modalita = selettore([['neuro', 'Allenamento'], ['esame', 'Simulazione esame']], 'neuro');
      const sessioni: [string,string][] = [['0', 'Quiz intero']];
      const perSessione = Math.max(1, Math.floor((r.minuti || 10) / 2));
      if (r.domande.length > perSessione) for (let i = 0; i < r.domande.length; i += perSessione)
        sessioni.push([String(i + 1), 'Domande ' + (i + 1) + '–' + Math.min(r.domande.length, i + perSessione)]);
      const sessione = selettore(sessioni, '0');
      const modifica = (d: DomB) => Editor.apri(d, r.id, nuova => {
        if (!nuova) return;
        if (Stato.prendi(r.id)?.updatedAt !== r.updatedAt) { avviso('Riapri il quiz aggiornato.'); return; }
        const aggiornato = { ...r, domande: r.domande.filter(x => x.id !== d.id),
          daRivedere: [...(r.daRivedere || []), { domanda: nuova, motivo: 'Contenuto modificato manualmente.' }] };
        Stato.salva(aggiornato); v.chiudi(); apri(aggiornato);
      }, true);
      v.corpo.append(h('div.pagina', null, stato,
        r.misure?.length ? h('details', null, h('summary', null, 'Richieste AI · ' + r.misure.reduce((n, m) => n + m.caratteri, 0) + ' caratteri totali · circa ' + r.misure.reduce((n, m) => n + Math.ceil(m.caratteri / 4), 0) + ' token'), ...r.misure.map((m, i) => h('p', null, (i + 1) + '. ' + m.fase + ' · ' + m.caratteri + ' caratteri · circa ' + Math.ceil(m.caratteri / 4) + ' token'))) : null,
        r.pianoSchede?.length ? h('section', null, h('h3', null, 'Piano confermato'), ...r.pianoSchede.map((s, i) => h('p', null, s.micro + ' · ' + s.priorita + ' · ' + s.copertura + ' · ' + r.domande.filter(d => d.schedaQuiz === i).length + '/' + (s.multiple + s.completamenti) + ' pronte'))) : null,
        r.applicazioni?.length ? h('section', null, h('h3', null, 'Mappa delle applicazioni'),
          ...r.applicazioni.map(nome => {
            const pronte = r.domande.filter(d => d.applicazione === nome);
            const sospese = (r.daRivedere || []).filter(x => x.domanda.applicazione === nome);
            return h('details', null, h('summary', null, nome + ' · ' + (pronte.length ? 'Coperta' : 'Scoperta')),
              h('p', null, pronte.length + ' pronte · ' + sospese.length + ' da rivedere'),
              pronte.length ? null : h('button.btn', { onclick: () => generaDomanda(nome) }, 'Aggiungi una domanda su questa applicazione'),
              ...pronte.map(d => h('p', null, d.q)), ...sospese.map(x => h('p', null, x.domanda.q + ' · ' + x.motivo)));
          })) : null,
        r.daRivedere?.length ? h('h3', null, r.daRivedere.length + ' domande da rivedere') : null,
        ...(r.daRivedere || []).map(x => h('details', null, h('summary', null, x.domanda.q), h('p', null, x.motivo),
          h('p', null, (x.domanda.o || x.domanda.a || []).join(' · ')), h('p', null, Array.isArray(x.domanda.e) ? x.domanda.e.join(' ') : x.domanda.e), h('p', null, x.domanda.r),
          h('button.btn', { onclick: () => generaDomanda(x.domanda.applicazione, x) }, 'Rigenera questa domanda'))),
        r.domande.length ? h('details', null, h('summary', null, 'Anteprima e banca delle domande'),
          ...r.domande.map(d => h('details', null, h('summary', null, d.q), h('p', null, (d.o || d.a || []).join(' · ')),
            h('p', null, Array.isArray(d.e) ? d.e.join(' ') : d.e), h('p', null, d.r),
            h('button.chip', { onclick: () => modifica(d) }, 'Modifica domanda'),
            h('button.chip', { onclick: () => generaDomanda(d.applicazione, { domanda: d, motivo: 'Genera una variante dello stesso livello.' }) }, 'Rigenera domanda pronta'))),
          h('button.chip', { onclick: () => QuizApp.esporta(r.domande, 'tutti', r.titolo, Dominio.archetipoMateria(r.materia)) }, 'Esporta quiz')) : null,
        r.domande.length ? h('label', null, 'Modalità', modalita) : null,
        sessioni.length > 1 ? h('label', null, 'Sessione', sessione) : null,
        r.domande.length ? h('button.btn', { onclick: () => { v.chiudi();
          const inizio = Number(sessione.value);
          avviaTentativo(r, inizio ? r.domande.slice(inizio - 1, inizio - 1 + perSessione) : r.domande, modalita.value === 'esame' ? 'esame' : 'neuro');
        } }, 'Inizia con ' + r.domande.length + ' domande pronte') : null));
      return;
    }
    avviaTentativo(r);
  }
  function avviaTentativo(r: QCreato, domande = r.domande, modo?: 'neuro' | 'esame'): void {
    const pk = { tipo: 'step', id: 'qc', step: 0, titolo: '', aggiornato: '', risorse: { libri: {}, quiz: {} }, materie: [] } as unknown as PkStep;
    const s = { id: r.id, k: 1, n: 1, titolo: r.titolo, tipo: 'P', problemi: false, pagine: '', quizFile: '' } as SchedaS;
    QuizApp.apri(pk, r.materia, r.titolo, s, () => domande, { modo, occh: r.materia + ' · ✨ creato in app · ' + new Date(r.creato).toLocaleDateString('it-IT'), titolo: r.titolo, chiudi: () => elenco() });
  }
  function elenco(): void {
    const v = visore('✨ Quiz creati in app', () => { /* */ });
    const lista = tutti();
    v.corpo.append(h('div.pagina', null,

      h('div.bottoni', null, h('button.btn', { onclick: () => { v.chiudi(); nuovo(); } }, '＋ Crea un quiz')),
      lista.length ? h('div.chips', null, h('span.piccolo', null, 'Esporta:'), ...([['errori', 'Errori'], ['illusione', 'Illusioni'], ['bloom3', 'Bloom ≥ 3']] as const).map(([fx, n]) => h('button.chip', { onclick: () => QuizApp.esporta(lista.flatMap(r => r.domande), fx, 'Quiz creati in app', Dominio.archetipoMateria(lista[0] ? lista[0].materia : '')) }, n))) : null,
      lista.length ? h('div.lista', null, ...lista.map(r => { const st = QuizApp.stat(r.id); const ultima = st.length ? st[0] : null;
        return h('button.voce-lista', { onclick: () => { v.chiudi(); apri(r); } }, h('span.voce-corpo', null, h('span.voce-titolo', null, '✨ ' + r.titolo),
          h('span.voce-sotto', null, r.materia + (r.ripresa ? ' · Generazione da riprendere' : '') + ' · ' + r.domande.length + ' domande' + (r.daRivedere?.length ? ' · ' + r.daRivedere.length + ' da rivedere' : '') + ' · ' + new Date(r.creato).toLocaleDateString('it-IT') + (ultima ? ' · ultima: ' + ultima.ok + '/' + ultima.n : '') + ' · fonti: ' + r.fonti.map(f => f.nome + (f.pagine ? ' p. ' + f.pagine.split(',').slice(0, 4).join(',') + (f.pagine.split(',').length > 4 ? '…' : '') : '')).join('; ')))); })) : vuoto('Nessun quiz creato in app per ora.')));
  }
  function paginePdf(testo: HTMLTextAreaElement) {
    const intervalli = h('input.campo', { value: '1', placeholder: '2-4, 8' }) as HTMLInputElement;
    const offset = h('input.campo', { type: 'number', value: 0 }) as HTMLInputElement;
    const file = h('input', { type: 'file', accept: '.pdf,application/pdf' }) as HTMLInputElement;
    const stato = h('p.piccolo', { role: 'status' }), stima = h('p.piccolo');
    const aggiorna = () => { stima.textContent = testo.value.length + ' caratteri · circa ' + Math.ceil(testo.value.length / 4) + ' token di fonte'; };
    testo.addEventListener('input', aggiorna); aggiorna();
    let occupato = false;
    const estrai = async (nome: string, apri: () => Promise<Blob>) => {
      if (occupato) return false;
      occupato = true;
      try {
        const doc = await TestoPdf.apri(await apri());
        try {
          const pagine = new Set<number>();
          for (const parte of intervalli.value.split(',')) {
            const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(parte);
            const a = Number(m?.[1]), b = Number(m?.[2] || a);
            if (!m || a < 1 || b < a || b > doc.numPages) throw new Error('Scegli pagine PDF tra 1 e ' + doc.numPages + '.');
            for (let i = a; i <= b; i++) pagine.add(i);
          }
          if (!Number.isSafeInteger(offset.valueAsNumber)) throw new Error('Indica uno scarto intero per le pagine del libro.');
          const brani: string[] = [], lacune: number[] = [];
          for (const i of pagine) {
            stato.textContent = 'Lettura pagina ' + i;
            let t = (await TestoPdf.pagina(doc, i, 'spazi')).trim();
            if (t.replace(/\s/g, '').length < 25) {
              const pagina = await doc.getPage(i);   // solo per l'OCR locale della pagina scansionata
              const Detector = (window as Window & { TextDetector?: new () => { detect(c: HTMLCanvasElement): Promise<{ rawValue: string }[]> } }).TextDetector;
              if (Detector) {
                const canvas = document.createElement('canvas');
                try {
                  const base = pagina.getViewport({ scale: 1 });
                  const viewport = pagina.getViewport({ scale: Math.min(2, 2200 / Math.max(base.width, base.height)) });
                  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
                  await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                  const riconosciuto = (await new Detector().detect(canvas)).map(r => r.rawValue).join('\n');
                  if (riconosciuto.trim().length > t.length) t = riconosciuto.trim();
                } catch { stato.textContent = 'OCR locale non disponibile.'; }
                finally { canvas.width = canvas.height = 0; }
              }
              if (t.replace(/\s/g, '').length < 25) lacune.push(i);
            }
            brani.push('[[' + nome + ', p. ' + i + (offset.valueAsNumber ? ', libro p. ' + (i + offset.valueAsNumber) : '') + ']]\n' + t);
          }
          testo.value = [testo.value, ...brani].filter(Boolean).join('\n\n'); aggiorna();
          stato.textContent = lacune.length ? 'Testo insufficiente. Trascrivi o correggi le pagine ' + lacune.join(', ') : 'Pagine estratte: ' + Array.from(pagine).join(', ');
          return true;
        } finally { await TestoPdf.chiudi(doc); }
      } catch (e) { stato.textContent = e instanceof Error ? e.message : 'PDF illeggibile.'; return false; }
      finally { occupato = false; }
    };
    const drive = (id: string, nome: string) => estrai(nome, () => Drive.scaricaBlob(id));
    const el = h('fieldset', null, h('legend', null, 'Estratti PDF'), h('label', null, 'Pagine PDF da leggere', intervalli),
      h('label', null, 'Scarto pagina libro meno pagina PDF', offset), h('label', null, 'Aggiungi un PDF locale', file),
      h('button.chip', { onclick: () => { const f = file.files?.[0]; if (f) void estrai(f.name, async () => f); else avviso('Scegli prima un PDF.'); } }, 'Estrai pagine locali'),
      h('button.chip', { onclick: async () => { try { const [f] = await scegliFileDrive({ mime: 'application/pdf' }); if (f) await drive(f.id, f.name); } catch { stato.textContent = 'Impossibile aprire Drive.'; } } }, 'Estrai pagine da Drive'), stato, stima);
    return { el, drive, occupato: () => occupato };
  }

  async function nuovo(pre: Partial<RichiestaQuiz> = {}): Promise<void> {

    // v0.57.1 (D2): materie fisse solo per il proprietario; per gli altri solo dai propri dati (corsi + pacchetti)
    const materie = Array.from(new Set((Drive.eProprietario() ? ['Chimica', 'Biologia', 'Fisica'] : Stato.tutti<MateriaRec>('materia').map(m => m.nome)).concat(Stato.tutti<Rec>('pacchetto').flatMap(r => ((r.contenuto && r.contenuto.materie) || []).map((m: any) => m.nome))).filter(Boolean)));
    const arg = h('input.campo', { type: 'text', value: pre.argomento || '', placeholder: 'Argomento preciso (es. «leve del corpo umano e guadagno meccanico»)' }) as HTMLInputElement;
    // v0.58.6 (U4): niente più «Studio» d'ufficio: elenco vuoto → si scrive il nome, che crea la materia (riappare la volta dopo)
    if (pre.materia && !materie.includes(pre.materia)) materie.push(pre.materia);
    const mat = campoMateria(materie.map(m => [m, m] as [string, string]), materie.find(m => pre.materia && n2(pre.materia) === n2(m)) || '', nome => { materiaPerNome(nome); return nome.trim(); });
    let cosa = pre.cosa || 'misto';
    const cose: [string, string][] = [['misto', 'Misto (come le schede)'], ['teoria', 'Teoria e definizioni'], ['problemi', 'Problemi con calcoli'], ['trabocchetti', 'Trabocchetti']];
    const chips = h('div.chips', null, ...cose.map(([k, t]) => h('button.chip' + (k === cosa ? '.attivo' : ''), { type: 'button', onclick: (e: Event) => { cosa = k; chips.querySelectorAll('.chip').forEach(c => c.classList.remove('attivo')); (e.target as HTMLElement).classList.add('attivo'); } }, t)));
    const extra = h('input.campo', { type: 'text', value: pre.extra || '', placeholder: 'Parole chiave in più (sinonimi, capitolo, libro, docente, «slide UD2»)' }) as HTMLInputElement;
    const quantita = (n: number) => h('input.campo', { type: 'number', min: 0, max: 200, value: n }) as HTMLInputElement;
    const multiple = quantita(pre.nMcq ?? 12), completamenti = quantita(pre.nFill ?? 6);
    const piano = h('textarea.campo', { rows: 3, placeholder: 'Una scheda per riga: microstep | prioritaria o raffinamento | applicazione attesa' }) as HTMLTextAreaElement;
    const preset = selettore([['libero', 'Quantità libere'], ['claude', 'Modello Claude per step']], 'libero');
    const campiPiano = h('label', null, 'Schede in ordine di progressione. Le quantità sotto valgono per ogni scheda.', piano);
    campiPiano.hidden = true;
    preset.onchange = () => { campiPiano.hidden = preset.value !== 'claude'; if (!campiPiano.hidden) { multiple.value = '12'; completamenti.value = '6'; } };
    const minuti = h('input.campo', { type:'number', min:1, max:480, value: pre.minuti || 20 }) as HTMLInputElement;
    const riferimento = selettore([['','Nessuno'], ...tutti().filter(r => r.domande.length).map(r => [r.id, r.titolo] as [string,string])], '');
    const difficolta = selettore([['', 'Adatta al materiale'], ['base', 'Base'], ['intermedia', 'Intermedia'], ['avanzata', 'Avanzata']], '');
    const appunti = selettore([['', 'Scegli un appunto'], ...Appunti.tutti().map(a => [a.id, a.titolo] as [string,string])], '');
    const libri = new Map<string,string>();
    for (const corso of Studio.pkStep()) for (const libro of Object.values(corso.risorse?.libri || {})) {
      for (const [parte,id] of Object.entries(libro.file || {})) libri.set(id, corso.titolo + ' · ' + libro.nome + ' · ' + parte);
    }
    const libroCorso = selettore([['','Scegli un file del corso'], ...libri.entries()], '');
    const domandeFonte = selettore([['', 'Scegli un quiz'], ...tutti().filter(q => q.domande.length).map(q => [q.id,q.titolo] as [string,string])], '');
    domandeFonte.onchange = () => {
      const q = Stato.prendi<QCreato>(domandeFonte.value);
      if (q) testo.value = [testo.value, '[[' + q.titolo + ']]', ...q.domande.map(d =>
        [d.q, d.o?.[0] || d.show || d.a?.join(' / '), Array.isArray(d.e) ? d.e.join(' ') : d.e].filter(Boolean).join('\n'))].filter(Boolean).join('\n\n');
      domandeFonte.value = '';
    };
    appunti.onchange = () => {
      const a = Stato.prendi<Appunto>(appunti.value);
      if (a) { testo.value = [testo.value, '[[' + a.titolo + ']]\n' + a.testo].filter(Boolean).join('\n\n'); if (!arg.value) arg.value = a.titolo; }
      appunti.value = '';
    };
    const testo = h('textarea.campo', { rows: 5, value: pre.testoIncollato || '' }) as HTMLTextAreaElement;
    const lettore = paginePdf(testo);
    const box = h('div.cq-fonti'), stato = h('div.tenue.piccolo');
    let fonti: (Trovato & { usa: boolean })[] = [];
    const cercaFonti = async () => {
      if (arg.value.trim().length < 4) { avviso('Scrivi l\'argomento.'); return; }
      svuota(box); stato.textContent = 'Cerco le fonti in tutto il tuo Drive…';
      try { fonti = (await Trova.fonti(arg.value + ' ' + mat.value, extra.value.split(/[,;]/).map(x => x.trim()).filter(Boolean), 10)).map((f, i) => ({ ...f, usa: i < 3 })); }
      catch (e: any) { stato.textContent = String(e.message) === 'NOLOGIN' ? 'Accedi a Google (Altro → Drive) per cercare le fonti.' : String(e.message || e); return; }
      stato.textContent = fonti.length ? 'Fonti trovate (le prime 3 sono già scelte; tocca per cambiare):' : 'Nessuna fonte trovata: prova con altre parole chiave (sinonimi, nome del capitolo o del libro).';
      box.append(...fonti.map(f => h('label.cq-fonte', null, h('input', { type: 'checkbox', checked: f.usa, onchange: (e: Event) => f.usa = (e.target as HTMLInputElement).checked }),
        h('span', null, h('b', null, f.name), h('span.tenue.piccolo', null, ' · ' + (f.cartella ? '«' + f.cartella + '» · ' : '') + f.perche.slice(0, 3).join(', '))), f.mimeType === 'application/pdf' ? h('button.chip', { type: 'button', onclick: async (e: Event) => { e.preventDefault(); const input = (e.currentTarget as HTMLElement).closest('label')?.querySelector('input'); if (await lettore.drive(f.id, f.name)) { f.usa = false; if (input) input.checked = false; } } }, 'Estrai pagine') : null)));
    };
    const fs = foglio({ titolo: '✨ Crea un quiz', etichettaSalva: 'Crea', corpo: h('div.modulo', null,
      h('label', null, 'Argomento', arg), h('label', null, 'Materia', mat.el), h('div', null, h('div.piccolo', null, 'Cosa vuoi'), chips), h('label', null, 'Aiuta la ricerca (facoltativo)', extra),
      h('div.tenue.piccolo', null, '💡 Più l\'argomento è preciso, migliori sono le fonti e le domande: nomina il capitolo o la lezione, aggiungi sinonimi e il nome del libro o del docente.'),
      h('label', null, 'Modello dello step', preset), campiPiano, h('label', null, 'Risposte multiple', multiple), h('label', null, 'Completamenti', completamenti), h('label', null, 'Difficoltà', difficolta),
      h('label', null, 'Durata indicativa della sessione (minuti)', minuti), h('label', null, 'Quiz di riferimento per lo stile', riferimento),
      libri.size ? h('div', null, h('label', null, 'Materiale del corso', libroCorso), h('button.chip', { onclick: async () => { const id = libroCorso.value; if (id && await lettore.drive(id, libri.get(id)!)) libroCorso.value = ''; } }, 'Estrai pagine del libro')) : null,
      domandeFonte.options.length > 1 ? h('label', null, 'Usa domande esistenti come fonte', domandeFonte) : null,
      h('label', null, 'Aggiungi un appunto', appunti), lettore.el,
      h('label', null, 'Testo o appunti da usare come fonte', testo),
      h('button.chip', { onclick: () => { fs.chiudi(); leggero({ titolo: arg.value, materia: mat.value, testo: testo.value, pianoId: pre.pianoId, voceId: pre.voceId }); } }, 'Scrivi o importa domande'),
      h('button.btn.neutro', { type: 'button', onclick: cercaFonti }, '🔎 Cerca le fonti nel Drive'), stato, box),
      salva: () => {
        const scelte: Trovato[] = fonti.filter(f => f.usa);
        if (libroCorso.value || scelte.some(f => f.mimeType === 'application/pdf')) { avviso('Estrai prima le pagine dei PDF selezionati.'); return false; }
        if (!arg.value.trim()) { avviso('Scrivi l’argomento del quiz.'); return false; }
        if (!scelte.length && !testo.value.trim()) { avviso('Incolla un testo o scegli una fonte da Drive.'); return false; }
        const limite = limiteTesto(scelte.length + 1);
        if (testo.value.trim().length > limite) { avviso('Riduci il testo a ' + limite + ' caratteri per queste fonti.'); return false; }
        if (lettore.occupato()) { avviso('Attendi la lettura del PDF.'); return false; }
        if ((!Spiega.attiva && !IA.gemini) || Dominio.senzaAI()) { avviso('Per generare configura un provider AI, oppure scegli Scrivi o importa domande.'); return false; }
        const nM = multiple.valueAsNumber, nF = completamenti.valueAsNumber;
        if (![nM,nF].every(n => Number.isInteger(n) && n >= 0) || nM+nF < 1 || nM+nF > 200) { avviso('Scegli da 1 a 200 domande totali.'); return false; }
        if (!Number.isInteger(minuti.valueAsNumber) || minuti.valueAsNumber < 1 || minuti.valueAsNumber > 480) { avviso('Scegli da 1 a 480 minuti.'); return false; }
        let pianoSchede: SchedaQuiz[] | undefined;
        if (preset.value === 'claude') {
          const righe = piano.value.trim().split(/\r?\n/).map(r => r.split('|').map(s => s.trim()));
          if (righe.some(r => r.length !== 3 || !r[0] || !/^(prioritaria|raffinamento)$/i.test(r[1]) || !r[2])) { avviso('Indica microstep, prioritaria o raffinamento e copertura per ogni scheda.'); return false; }
          if (righe.length * (nM + nF) > 200) { avviso('Il piano supera 200 domande. Riduci quantità o schede.'); return false; }
          pianoSchede = righe.map(([micro, priorita, copertura]) => ({ micro, priorita, copertura, multiple: nM, completamenti: nF }));
          if (!window.confirm('Confermi ' + righe.length + ' schede e ' + righe.length * (nM + nF) + ' domande?\n' + piano.value)) return false;
        }
        const modello = Stato.prendi<QCreato>(riferimento.value);
        const stile = modello?.domande.slice(0, 2).map(d => JSON.stringify({ q:d.q, lv:d.lv, opzioni:d.o, spiegazione:d.e })).join('\n');
        avvia({ minuti: minuti.valueAsNumber, pianoId: pre.pianoId, voceId: pre.voceId, argomento: arg.value.trim(), materia: mat.value || 'Studio', cosa: ({ misto: 'mix di teoria, applicazioni, trabocchetti e problemi come nelle schede', teoria: 'soprattutto teoria e definizioni (Sbarramento), qualche applicativa', problemi: 'soprattutto problemi con calcoli (Problema), con passaggi numerici completi', trabocchetti: 'soprattutto trabocchetti sugli errori tipici' } as any)[cosa], extra: [extra.value.trim(), stile && 'Esempi solo di stile, verifica il contenuto sulle fonti: ' + stile.slice(0, 3000), difficolta.value && 'Difficoltà ' + difficolta.value].filter(Boolean).join(' · '), testoIncollato: testo.value.trim(), fonti: scelte, pianoSchede, nMcq: nM * (pianoSchede?.length || 1), nFill: nF * (pianoSchede?.length || 1) });
      } });
    void fs;

  }
  const lavori = new Set<string>();
  async function avvia(o: RichiestaQuiz, bozza?: QCreato): Promise<void> {
    let r: QCreato = bozza || { id: 'qc-' + uid(), type: 'qcreato', updatedAt: 0, titolo: o.argomento, argomento: o.argomento, materia: o.materia,
      pianoSchede: o.pianoSchede, applicazioni: o.pianoSchede?.map(s => s.copertura), cosa: o.cosa, creato: new Date().toISOString(), minuti: o.minuti, pianoId: o.pianoId, voceId: o.voceId, ripresa: o, testoIncollato: o.testoIncollato,
      fonti: [...(o.testoIncollato ? [{id:'testo-incollato', nome:'Testo incollato', pagine:''}] : []),
        ...o.fonti.map(f => ({id:f.id, nome:f.name, mimeType:f.mimeType, pagine:''}))], domande: [], scartate: 0, modelli: [] };
    if (lavori.has(r.id)) { avviso('Generazione già in corso.'); return; }
    lavori.add(r.id);
    if (!bozza) await Stato.salva(r);
    const stato = h('span.audio-stato', null, 'Preparo…'), pill = h('div.audio-pillola.lavora', { role: 'status' }, h('span.audio-giro'), stato);
    document.body.appendChild(pill);
    try {
      while (r.ripresa) {
        const tutte = r.domande.concat((r.daRivedere || []).map(x => x.domanda));
        const scheda = o.pianoSchede?.findIndex((s, i) => tutte.filter(d => d.schedaQuiz === i).length < s.multiple + s.completamenti);
        const target = scheda === undefined ? undefined : o.pianoSchede?.[scheda];
        const presenti = target ? tutte.filter(d => d.schedaQuiz === scheda) : tutte;
        const nMcq = Math.min(6, Math.max(0, (target?.multiple ?? o.nMcq) - presenti.filter(d => d.t === 'mcq').length));
        const nFill = Math.min(6 - nMcq, Math.max(0, (target?.completamenti ?? o.nFill) - presenti.filter(d => d.t === 'fill').length));
        const indice = tutte.length;
        r = await crea({ ...o, scheda, nMcq, nFill }, t => { stato.textContent = indice + '/' + (o.nMcq + o.nFill) + ' · ' + t; }, { quiz: r, lotto: true });
      }
      svuota(pill); pill.classList.remove('lavora'); pill.classList.add('pronta');
      pill.append(h('button.audio-fine', { type: 'button', onclick: () => { pill.remove(); apri(r); } }, r.domande.length + ' pronte' + (r.daRivedere?.length ? ' · ' + r.daRivedere.length + ' da rivedere' : '') + (r.scartate ? ' (' + r.scartate + ' scartate dai controlli)' : '') + ' — Apri'));
      try { Tocco.clic(1); } catch (_) { /* */ }
    } catch (e: any) { stato.textContent = '⚠️ ' + (e.message || e); pill.append(h('button', { type: 'button', 'aria-label': 'Chiudi', onclick: () => pill.remove() }, '✕')); } finally { lavori.delete(r.id); }
  }

  // ---------- v0.54 (BP3 §3): Creaquiz Leggero — 3 click, zero attrito, zero token per import/cloze/dedup ----------
  /** Tutte le domande già in archivio (quiz creati in app), per la deduplicazione. */
  const archivio = (): DomB[] => tutti().flatMap(r => r.domande || []);
  const statoPipe = (stepId: string): PipeStep => {
    const r = Stato.prendi<PipeStep>('ps-' + stepId);
    return r && !r.deleted ? r : { id: 'ps-' + stepId, type: 'pipestep', updatedAt: 0, stepId, schedaProlissa: 'bozza', schedaCondensata: 'bozza' };
  };
  const ICONA_PIPE: Record<StatoPipe, string> = { bozza: '✏️ bozza', pronta: '✅ pronta', verificata: '🔒 verificata' };
  /** BP3 §3.2: indicatori della pipeline di uno step (scheda prolissa → condensata → quiz bank con copertura Bloom). */
  function pannelloPipeline(stepId: string): HTMLElement {
    const box = h('div.gruppo.cq-pipe');
    const disegna = () => {
      svuota(box);
      if (!stepId) { box.append(h('div.tenue.piccolo', null, 'Scrivi lo step (es. «C-3.2») per vedere la pipeline di studio.')); return; }
      const p = statoPipe(stepId), dom = archivio().filter(d => Neuro.stepDi(d) === stepId || d.sk === stepId || d.subtopic === stepId), cop = Neuro.copertura(dom);
      const giro = (k: 'schedaProlissa' | 'schedaCondensata') => { const r = statoPipe(stepId); (r as any)[k] = Neuro.prossimoStato(r[k]); Stato.salva(r, true); disegna(); };
      box.append(h('div.gruppo-titolo', null, 'Pipeline di studio · ' + stepId),
        h('div.chips', null,
          h('button.chip', { type: 'button', title: 'Tocca per cambiare stato', onclick: () => giro('schedaProlissa') }, '📚 Scheda prolissa: ' + ICONA_PIPE[p.schedaProlissa]),
          h('button.chip', { type: 'button', title: 'Tocca per cambiare stato', onclick: () => giro('schedaCondensata') }, '⚡ Scheda condensata: ' + ICONA_PIPE[p.schedaCondensata])),
        h('div.piccolo', null, '🧩 Quiz bank: ' + cop.quizBankCount + ' domande · Bloom ' + ([1, 2, 3, 4] as BloomN[]).map(b => b + ':' + cop.bloom[b]).join(' ') + ' · copertura ' + cop.pct + '%'
          + (cop.mancanti.length && cop.quizBankCount ? ' (mancano i livelli ' + cop.mancanti.join(', ') + ')' : '')));
    };
    disegna();
    return box;
  }
  function leggiFile(accetta: string): Promise<string | null> {
    return new Promise(ok => {
      const i = h('input', { type: 'file', accept: accetta, style: { display: 'none' } }) as HTMLInputElement;
      i.onchange = () => { const f = i.files && i.files[0]; i.remove(); if (!f) { ok(null); return; } f.text().then(ok, () => ok(null)); };
      document.body.appendChild(i); i.click();
    });
  }
  function leggero(pre: { materia?: string; stepId?: string; titolo?: string; appunto?: string; pianoId?: string; voceId?: string; testo?: string } = {}): void {
    const v = visore('⚡ Creaquiz Leggero', () => { /* */ });
    const titolo = h('input.campo', { type: 'text', value: pre.titolo || '', placeholder: 'Titolo del quiz (es. «Enzimi — ripasso lampo»)' }) as HTMLInputElement;
    const materia = h('input.campo', { type: 'text', value: pre.materia || '', placeholder: 'Materia (es. Biologia)' }) as HTMLInputElement;
    const step = h('input.campo', { type: 'text', value: pre.stepId || '', placeholder: 'Step / micro-argomento (facoltativo, es. B-2.1)' }) as HTMLInputElement;
    const testo = h('textarea.campo', { rows: 8, value: pre.testo || '', placeholder: 'Incolla qui il JSON delle domande (anche «sporco»: blocchi ```json, virgole finali, chiavi question/options/answer) oppure appunti e testo breve per i completamenti automatici.' }) as HTMLTextAreaElement;
    const app = Appunti.tutti().slice(0, 60);
    const selApp = h('select.campo', null, h('option', { value: '' }, '— oppure prendi i punti chiave da un appunto —'), ...app.map(a => h('option', { value: a.id }, a.titolo || '(senza titolo)'))) as HTMLSelectElement;
    const badge = h('div.cq-badge'), anteprima = h('div.tenue.piccolo');
    const elencoDomande = h('div'), escluse = new Set<string>();
    const estratti = h('textarea.campo', { rows: 4, value: pre.testo || '' }) as HTMLTextAreaElement;
    const lettore = paginePdf(estratti);
    const pipe = h('div');
    let pronte: DomB[] = [];
    const idQuiz = 'qc-' + uid();
    const disegna = () => {
      svuota(elencoDomande);
      for (const [i, d] of pronte.entries()) {
        elencoDomande.append(h('div', null, h('label', null, h('input', { type: 'checkbox', checked: !escluse.has(d.id), onchange: (e: Event) => { if ((e.target as HTMLInputElement).checked) escluse.delete(d.id); else escluse.add(d.id); } }), d.q),
          h('button.chip', { onclick: () => Editor.apri(d, idQuiz, nuova => {
            if (!nuova) return;
            if (!Neuro.deduplica([nuova], archivio().concat(pronte.filter(x => x !== d))).nuove.length) { avviso('Domanda già presente.'); return; }
            pronte[i] = { ...nuova, id: d.id }; disegna();
          }, true) }, 'Modifica domanda')));
      }
    };
    const mostra = (dom: any[], extra: string[]) => {
      const d = Neuro.deduplica(dom, archivio().concat(pronte));
      pronte = pronte.concat(d.nuove.map(x => ({ ...x, id: idQuiz + '-' + uid(), sk: idQuiz, gen: true })));
      disegna(); badge.textContent = d.badge;
      anteprima.textContent = extra.filter(Boolean).join(' · ') + (pronte.length ? (extra.some(Boolean) ? ' · ' : '') + 'Pronte da salvare: ' + pronte.length : '');
    };
    const daTesto = (t: string) => {
      if (!t.trim()) { avviso('Incolla prima qualcosa.'); return; }
      if (!/[[{]/.test(t)) { avviso('Non vedo JSON: uso il testo per i completamenti automatici.'); return daCloze(t); }
      const r = Neuro.importa(t, idQuiz);
      if (r.errore && !r.domande.length) { avviso('⚠️ ' + r.errore, 6000); return; }
      mostra(r.domande, [r.riparazioni.length ? '🔧 ' + r.riparazioni.join(', ') : '', r.scartate ? r.scartate + ' scartate (incomplete)' : '']);
    };
    const daCloze = (t: string) => {
      const c = Neuro.cloze(t, { sk: idQuiz, stepId: step.value.trim() || undefined, max: 12 });
      if (!c.length) { avviso('Non ho trovato frasi chiave adatte (servono frasi complete; **grassetto** sui termini aiuta).', 6000); return; }
      mostra(c, ['✂️ ' + c.length + ' completamenti dalle frasi chiave (senza AI)']);
    };
    // Livello 3 (circuit breaker): oltre 15 domande niente chiamate multiple dall'app → prompt per Gemini e incolla
    const nAI = h('input.campo', { type: 'number', min: 1, max: 60, value: 10, style: { width: '6em' } }) as HTMLInputElement;
    const breaker = h('div');
    const generaAI = async () => {
      const n = Math.max(1, Math.min(60, parseInt(nAI.value, 10) || 10)), arg = titolo.value.trim() || step.value.trim() || 'il testo incollato';
      const prompt = Neuro.promptGemini({ argomento: arg, materia: materia.value.trim() || undefined, archetipo: Dominio.archetipoMateria(materia.value.trim()), n, testo: testo.value.trim() || undefined, stepId: step.value.trim() || undefined });
      svuota(breaker);
      if (Neuro.serveBreaker(n) && !Dominio.senzaAI() && (Spiega.attiva || IA.gemini)) {
        nuovo({ argomento: arg, materia: materia.value.trim(), testoIncollato: testo.value.trim(), nMcq: n, nFill: 0 });
        return;
      }
      if (Dominio.senzaAI() || (!Spiega.attiva && !IA.gemini)) {
        breaker.append(h('div.qz-neuro', null,
          h('b', null, '🛑 AI dell\'app non disponibile: usa Gemini sul web'),
          h('p.piccolo', null, '1) Copia il prompt · 2) incollalo in Gemini · 3) incolla qui sopra il JSON che ti restituisce e premi «Leggi JSON».'),
          h('button.btn', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(prompt); avviso('Prompt copiato: incollalo in Gemini.'); } catch (_) { testo.value = prompt; avviso('Appunti non disponibili: il prompt è nel riquadro, copialo da lì.', 6000); } } }, '📋 Copia Prompt Ottimizzato per Gemini')));
        return;
      }
      breaker.append(h('div.tenue.piccolo', null, 'Genero ' + n + ' domande con una sola chiamata…'));
      try {
        const g = await IA.testo([{ role: 'user', content: prompt }], 'genera', { temp: 0.5, archetipo: Dominio.archetipoMateria(materia.value.trim()) });
        svuota(breaker); daTesto(g.testo); breaker.append(h('div.tenue.piccolo', null, 'Generate con ' + g.modello + '. Controllale prima di salvarle.'));
      } catch (e: any) { svuota(breaker); breaker.append(h('div.tenue.piccolo', null, '⚠️ ' + (e.message || e))); }
    };
    let salvataggio = false;
    const salva = async () => {
      if (salvataggio) return;
      if (lettore.occupato()) { avviso('Attendi la lettura delle pagine.'); return; }
      const selezionate = Neuro.deduplica(pronte.filter(d => !escluse.has(d.id)), archivio()).nuove;
      if (!selezionate.length) { avviso('Nessuna domanda nuova da salvare.'); return; }
      const t = titolo.value.trim() || 'Quiz leggero ' + new Date().toLocaleDateString('it-IT'), st = step.value.trim();
      const domande = selezionate.map(d => { const x: any = { ...d, sk: idQuiz }; if (st) x.stepId = st; return x as DomB; });
      const rec: QCreato = { id: idQuiz, type: 'qcreato', updatedAt: 0, titolo: t, pianoId:pre.pianoId, voceId:pre.voceId, materia: materia.value.trim() || 'Studio', argomento: st || t, cosa: 'leggero', testoIncollato: estratti.value.trim(), fonti: estratti.value.trim() ? [{ id: 'testo-incollato', nome: 'Estratti selezionati', pagine: '' }] : [], domande, creato: new Date().toISOString(), modelli: [], scartate: 0 };
      salvataggio = true;
      try { await Stato.salva(rec); } catch { salvataggio = false; avviso('Salvataggio interrotto. Riprova.'); return; }
      avviso('✓ Salvato: ' + domande.length + ' domande.');
      v.chiudi(); apri(rec);
    };
    const aggiornaPipe = () => { svuota(pipe); pipe.append(pannelloPipeline(step.value.trim())); };
    step.addEventListener('change', aggiornaPipe);
    v.corpo.append(h('div.pagina.modulo', null,
      h('div.tenue.piccolo', null, 'Import, riparazione, completamenti e deduplicazione avvengono sul dispositivo, senza AI. Le domande già presenti vengono saltate.'),
      h('label', null, 'Titolo', titolo), h('label', null, 'Materia', materia), h('label', null, 'Step', step),
      testo,
      h('div.chips', null,
        h('button.chip', { type: 'button', onclick: () => daTesto(testo.value) }, '📥 Leggi JSON'),
        h('button.chip', { type: 'button', onclick: async () => { const t = await leggiFile('.json,.imcpack,application/json'); if (t != null) daTesto(t); } }, '📂 Carica .json / .imcpack'),
        h('button.chip', { onclick: async () => { try { const [f] = await scegliFileDrive({ titolo: 'Scegli un quiz JSON o .imcpack' }); if (f) daTesto(await Drive.scaricaTesto(f.id)); } catch { avviso('Impossibile leggere il quiz da Drive.'); } } }, 'Importa quiz da Drive'),
        h('button.chip', { type: 'button', onclick: () => daCloze(testo.value) }, '✂️ Completamenti dal testo')),
      h('div.chips', null, selApp, h('button.chip', { type: 'button', onclick: () => { const a = app.find(x => x.id === selApp.value); if (!a) { avviso('Scegli un appunto.'); return; } if (!step.value.trim() && (a.micro || a.sub)) { step.value = String(a.micro || a.sub); aggiornaPipe(); } daCloze(a.testo); } }, '✂️ Dai punti chiave')),
      h('button.chip', { onclick: () => Editor.apri(null, idQuiz, d => { if (d) mostra([d], ['Domanda scritta a mano']); }, true) }, 'Scrivi una domanda'),
      h('div.tenue.piccolo', null, 'Import e scrittura manuale: il contenuto richiede un controllo sulle fonti del corso.'),
      badge, anteprima, elencoDomande, h('label', null, 'Pagine o estratti di riferimento', estratti), lettore.el,
      h('div.chips', null, h('span.piccolo', null, 'Oppure con l\'AI:'), nAI, h('button.chip', { type: 'button', onclick: generaAI }, '✨ Genera domande')), breaker,
      h('div.bottoni', null, h('button.btn', { type: 'button', onclick: salva }, '💾 Salva e apri il quiz'), h('button.btn.neutro', { type: 'button', onclick: () => { pronte = []; escluse.clear(); disegna(); badge.textContent = ''; anteprima.textContent = 'Svuotato.'; } }, 'Svuota')),
      h('div.gruppo', null, h('div.gruppo-titolo', null, 'Esporta dall\'archivio (appunti + .imcpack)'),
        h('div.chips', null, ...([['errori', 'Solo errori'], ['illusione', 'Illusioni di competenza'], ['bloom3', 'Bloom ≥ 3']] as const).map(([f, n]) =>
          h('button.chip', { type: 'button', onclick: () => QuizApp.esporta(archivio(), f, 'Quiz creati in app', Dominio.archetipoMateria(materia.value.trim())) }, n)))),
      pipe));
    aggiornaPipe();
    // v0.58 (Q5): «🎯 Quiz da questo appunto» dal menu ⋯ dell'appunto → completamenti già pronti dai suoi punti chiave
    if (pre.appunto) {
      const a = app.find(x => x.id === pre.appunto) || Stato.prendi<Appunto>(pre.appunto);
      if (a && !a.deleted) { if (app.includes(a)) selApp.value = a.id; if (!step.value.trim() && (a.micro || a.sub)) { step.value = String(a.micro || a.sub); aggiornaPipe(); } daCloze(a.testo); }
    }
  }

  function sessioniDalPiano(p: PkPiano, v: VocePiano): SessioneMicroQuiz<DomB>[] {
    const t = Studio.trovaSotto(v.k.replace(/^G2-/, '')); if (!t) return [];
    const banche = t.sub.microstep.map(micro => ({ microstep: micro.n, domande: micro.schede.flatMap(s => Dominio.domandeDi(s.id) || []) }));
    const livello = Number((p as PkPianoAI).livelloIntensita) || 2;
    return Pianificatore.sessioniQuiz(banche, livello);
  }
  function apriSessioneDalPiano(p: PkPiano, v: VocePiano, sessione: SessioneMicroQuiz<DomB>): void {
    const t = Studio.trovaSotto(v.k.replace(/^G2-/, '')); if (!t || !sessione.domande.length) return;
    const titolo = v.t + ' · ' + sessione.microstep;
    const s = { id: sessione.domande[0].sk, k: 1, n: 1, titolo, tipo: 'P', problemi: false, pagine: '', quizFile: '' } as SchedaS;
    void QuizApp.apri(t.pk, t.mat.m, sessione.microstep, s, () => sessione.domande.map(d => ({ ...d })), {
      occh: 'Sessione breve · ' + sessione.domande.length + '/' + sessione.richieste + ' pronte · banca ' + sessione.disponibili, titolo, modo: 'neuro',
    });
  }
  function dalPiano(p: PkPiano, v: VocePiano): void {
    const sessioni = sessioniDalPiano(p, v).filter(x => x.domande.length);
    if (sessioni.length === 1) { apriSessioneDalPiano(p, v, sessioni[0]); return; }
    if (sessioni.length > 1) {
      let f: { chiudi: () => void };
      const corpo = h('div.modulo', null,
        h('p.piccolo.tenue', null, 'Scegli il microstep. La sessione usa solo domande già pronte e non cambia la copertura totale della banca.'),
        ...sessioni.map(x => h('button.btn.neutro', { type: 'button', 'aria-label': 'Avvia sessione ' + x.microstep + ' con ' + x.domande.length + ' di ' + x.richieste + ' domande pronte; banca ' + x.disponibili, onclick: () => { f.chiudi(); apriSessioneDalPiano(p, v, x); } },
          x.microstep + ' · ' + x.domande.length + '/' + x.richieste + ' pronte · banca ' + x.disponibili)));
      f = foglio({ titolo: 'Sessione quiz breve', corpo });
      return;
    }
    const esistente = tutti().find(r => r.pianoId === p.id && r.voceId === v.k);
    if (esistente) apri(esistente);
    else nuovo({ pianoId: p.id, voceId: v.k, argomento: v.t, materia: nomeMateria(p.vincoliAI?.materiaCodice || materiaDi(v.k)) });
  }
  return { sessioniDalPiano, dalPiano, nuovo, elenco, apri, tutti, controlla, crea, leggero };
})();
