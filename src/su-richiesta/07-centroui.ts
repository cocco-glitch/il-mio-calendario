// ============================================================
// v0.63 — «🏗️ Centro di creazione»: foglio a 7 passi (UI). La logica pura è in 07-centro.ts.
//   1 Obiettivo · 2 Piano · 3 Quiz · 4 Controllo · 5 Correggi · 6 Prova · 7 Importa.
//   Il record «creazione» salva solo scelte e stato (mai il testo delle risposte): riaprendo si riparte da Centro.passoDi.
// ============================================================

interface CreazioneRec extends Rec, StatoCreazione {
  type: 'creazione'; materia: string; nomeMateria: string; step: string; titolo?: string; data?: string;
  intensita?: OpzMP['intensita']; piano?: PianoCentro; fonti?: FontiSQ;
  /** T12: ultima verifica delle citazioni sul PDF (problemi con la fonte di allora: valgono finché la fonte non cambia). */
  citazioni?: { quando: string; libro: string; firma?: string; drive?: VersionePdfDrive[]; ok: number; dubbi: string[]; registro: string[]; problemi: Array<ProblemaQ & { fonte: string }> };
}

interface VersionePdfDrive { nome: string; id: string; modificato: string; }

/** v0.64: la piattaforma AI scelta nel passo 1 (un record per account: `acc` lo mette Stato.salva). */
interface ProfiloAIRec extends Rec { type: 'profiloai'; profilo: ProfiloAI; }

/** Una scheda arrivata (o interrotta): la «parte» com'è nel file di Drive, una per scheda (prq-<materia>-<step>-s<n>). */
interface ParteQRec extends Rec { type: 'parteq'; cre: string; parte: string; scheda: number; quiz: DomAI[]; }

const CentroUI = (() => {
  const PASSI = ['Obiettivo', 'Piano', 'Quiz', 'Controllo', 'Correggi', 'Prova', 'Importa'];
  const RE_STEP = /^\d+(\.\d+)*$/;
  const FORMATI_QUIZ: FormatoAI[] = ['quiz-v4', 'quiz-v3', 'quiz-v2', 'quiz-058', 'parte'];
  const vaiScheda = (x: Scheda) => vai(x);       // la vai() globale delle schede: dentro apri() «vai» è quella dei passi
  const PER = () => PROFILO_STANDARD.perScheda;   // funzione: 07-validatore viene concatenato dopo questo file
  const SEGNO: Record<SevQ, string> = { err: '⛔', warn: '⚠️', info: 'ℹ️' };
  const sig = (n: number) => 'S' + String(n).padStart(2, '0');
  const simbolo = (x: SchedaFlusso) => x.stato === 'arrivata' ? '✅' : x.stato === 'interrotta' ? '✂️' : '⏳';
  const statoTesto = (x: SchedaFlusso) => x.stato === 'arrivata' ? 'arrivata' : x.stato === 'interrotta' ? 'interrotta' : 'da fare';
  const aperte = () => Stato.tutti<CreazioneRec>('creazione').filter(r => !r.deleted && !(r.esiti && r.esiti.importato))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const pref = (r: CreazioneRec) => Centro.prefisso({ materia: r.nomeMateria, step: r.step });
  const idParte = (r: CreazioneRec, n: number) => 'prq-' + pref(r) + '-s' + n;
  function parteDi(r: CreazioneRec, n: number): ParteQRec | null {
    const p = Stato.prendi<ParteQRec>(idParte(r, n));
    return p && !p.deleted ? p : null;
  }
  /** Tutte le domande arrivate, con la scheda da cui vengono (per rimetterle a posto dopo le patch). */
  function domande(r: CreazioneRec): { qs: DomAI[]; daScheda: Map<string, number> } {
    const qs: DomAI[] = [], daScheda = new Map<string, number>();
    for (const x of r.schede || []) {
      const p = parteDi(r, x.n);
      if (p) for (const q of p.quiz) { qs.push(q); daScheda.set(String(q.id), x.n); }
    }
    return { qs, daScheda };
  }
  /** Rimette le domande (riparate o corrette) nelle parti da cui vengono. */
  function salvaDomande(r: CreazioneRec, qs: unknown[], daScheda: Map<string, number>): void {
    const per = new Map<number, DomAI[]>();
    for (const q of qs) {
      const n = daScheda.get(String((q as DomAI).id));
      if (n) { const l = per.get(n) || []; l.push(q as DomAI); per.set(n, l); }
    }
    for (const [n, l] of per) { const p = parteDi(r, n); if (p) Stato.salva({ ...p, quiz: l }, true); }
  }
  /** Controllo zero token: problemi (bloccanti + qualità + insieme, senza doppioni) e quante domande si correggono con patch. */
  function controlla(qs: DomAI[], avvisi = false, citazioni: ProblemaQ[] = []) {
    const v = Validatore.valida(qs), visti = new Set<string>(), problemi: ProblemaQ[] = [];
    const tutti: ProblemaQ[] = [...[...v.bloccanti].flatMap(([id, ms]) => ms.map(msg => ({ sev: 'err' as SevQ, id, msg }))), ...v.qualita, ...v.insieme, ...citazioni];
    for (const p of tutti) { const k = p.id + '|' + p.msg; if (!visti.has(k)) { visti.add(k); problemi.push(p); } }
    const corr = DiagnosiQuiz.promptCorrezione(qs, problemi, { avvisi });
    return { v, problemi, corr };
  }
  /** Libri del record con una mappa delle pagine utilizzabile: il primo serve alla verifica delle citazioni. */
  const libriVerificabili = (r: CreazioneRec) => (r.fonti ? r.fonti.libri : []).map(l => Stato.prendi<LibroRec>(Centro.idLibro(r.nomeMateria, l.nome)))
    .filter((x): x is LibroRec => !!x && !x.deleted && x.fonte !== 'nessuna' && !!x.mappa && x.mappa.fonte !== 'nessuna' && x.mappa.tratti.length > 0);
  const pdfScelti = new Map<string, { file: Blob; versione: string }>();
  const validitaDrive = new Map<string, 'attesa' | 'valida' | 'cambiata' | 'non-disponibile'>();
  const chiavePdf = (l: LibroRec, nome: string) => JSON.stringify([Drive.stato.email, l.id, nome]);
  const versionePdf = (l: LibroRec, nome: string) => pdfScelti.get(chiavePdf(l, nome))?.versione;
  function firmaCitazioni(l: LibroRec, qs: DomAI[]): string {
    return sha256Hex(JSON.stringify([l.id, l.mappa, l.pdf.map(f => [f, versionePdf(l, f.nome)]),
      qs.map(q => [q.id, q.domanda, q.fonte])]));
  }
  const chiaveValidita = (r: CreazioneRec) => JSON.stringify([Drive.stato.email, r.id, r.citazioni?.firma, r.citazioni?.drive]);
  function citazioniValide(r: CreazioneRec, qs: DomAI[]): boolean {
    const l = libriVerificabili(r)[0], c = r.citazioni;
    if (!l || !c?.firma || c.firma !== firmaCitazioni(l, qs) || !c.drive) return false;
    return c.drive.length === 0 || validitaDrive.get(chiaveValidita(r)) === 'valida';
  }
  function problemiCit(r: CreazioneRec, qs: DomAI[]): ProblemaQ[] {
    const c = r.citazioni;
    if (!c || !citazioniValide(r, qs)) return [];
    return c.problemi.map(({ sev, id, msg }) => ({ sev, id, msg }));
  }
  async function pdfDrive(nome: string): Promise<VersionePdfDrive> {
    const f = (await Drive.cerca(nome.replace(/\.pdf$/i, ''), 'application/pdf')).find(x => x.name === nome);
    if (!f) throw new Error('«' + nome + '» non trovato su Drive');
    return { nome, id: f.id, modificato: f.modifiedTime };
  }
  /** Un PDF del libro: scelto dal dispositivo, se no da Drive per nome (cache «imc-pdf»: scaricato una volta sola). */
  async function datiPdf(l: LibroRec, nome: string, versioni?: Map<string, VersionePdfDrive>): Promise<Uint8Array> {
    const loc = pdfScelti.get(chiavePdf(l, nome));
    if (loc) return new Uint8Array(await loc.file.arrayBuffer());
    const f = await pdfDrive(nome);
    if (versioni) versioni.set(nome, f);
    return PdfCache.prendi(f.id, undefined, f.modificato);
  }
  /** Testo delle pagine PDF assolute richieste, aprendo ogni segmento del libro una volta sola (pdf.js senza eval). */
  async function testiPagine(l: LibroRec, pagine: number[], avanza: (m: string) => void, versioni?: Map<string, VersionePdfDrive>): Promise<Map<number, string>> {
    const testi = new Map<number, string>();
    const seg = l.pdf.map(f => ({ nome: f.nome, base: f.segmentoDa ? f.segmentoDa - 1 : 0 })).sort((a, b) => a.base - b.base);
    for (const [k, sg] of seg.entries()) {
      const fine = k + 1 < seg.length ? seg[k + 1].base : Infinity, mie = pagine.filter(p => p > sg.base && p <= fine);
      if (!mie.length) continue;
      avanza('Apro «' + sg.nome + '»…');
      await TestoPdf.con(await datiPdf(l, sg.nome, versioni), async doc => {
        for (const p of mie) {
          if (p - sg.base > doc.numPages) continue;
          testi.set(p, await TestoPdf.pagina(doc, p - sg.base, 'spazi'));
        }
      });
    }
    return testi;
  }
  /** Profilo AI salvato; nessuno → Gemini, cioè il prompt di v0.63 (una parte, file allegati). */
  function profiloAI(): ProfiloAI {
    const r = Stato.prendi<ProfiloAIRec>('profiloai');
    return r && !r.deleted && r.profilo ? { ...ProfiliAI.preset(r.profilo.id), ...r.profilo } : ProfiliAI.preset('gemini');
  }
  function salvaProfiloAI(p: ProfiloAI): void {
    const gia = Stato.prendi<ProfiloAIRec>('profiloai');
    Stato.salva({ id: 'profiloai', type: 'profiloai', updatedAt: gia ? gia.updatedAt : 0, profilo: p } as ProfiloAIRec, true);
  }
  const numero = (n: number) => n.toLocaleString('it-IT');
  /** Cosa farà l'app con il profilo, in una riga. */
  const descriviProfilo = (p: ProfiloAI) => {
    const N = ProfiliAI.parti(PROFILO_STANDARD.perScheda, p.perRisposta).length;
    return (N > 1 ? 'Ogni scheda in ' + N + ' parti da al massimo ' + p.perRisposta + ' domande' : 'Una scheda per risposta')
      + (p.file ? ' · allega i PDF nella chat.' : ' · non legge file: incollo io il testo del PDF' + (p.maxCaratteri ? ' (prompt entro ' + numero(p.maxCaratteri) + ' caratteri).' : '.'));
  };
  /** Selettore «Quale AI usi?» (passo 1): si salva subito; «Personalizzato» mostra i 3 campi. */
  function campoAI(): HTMLElement {
    let p = profiloAI();
    const sel = selettore(ProfiliAI.PRESET.map(x => [x.id, x.nome] as [string, string]), p.id);
    sel.setAttribute('aria-label', 'Quale AI usi?');
    const per = h('input', { type: 'number', min: '1', max: '50', inputmode: 'numeric', 'aria-label': 'Domande al massimo per risposta', value: String(p.perRisposta) }) as HTMLInputElement;
    const max = h('input', { type: 'number', min: '0', step: '1000', inputmode: 'numeric', 'aria-label': 'Caratteri massimi del prompt (0 = nessun tetto)', value: String(p.maxCaratteri) }) as HTMLInputElement;
    const file = h('input', { type: 'checkbox', 'aria-label': 'L\'AI legge i file allegati', checked: p.file || undefined }) as HTMLInputElement;
    const campi = h('div.chips', null, h('label.piccolo', null, 'Domande per risposta ', per), h('label.piccolo', null, 'Caratteri max ', max), h('label.piccolo', null, file, ' legge i file'));
    const descr = h('p.piccolo.tenue', { 'aria-live': 'polite' });
    const mostra = () => { campi.style.display = p.id === 'personalizzato' ? '' : 'none'; descr.textContent = descriviProfilo(p); };   // .chips è flex: hidden non basta
    sel.addEventListener('change', () => {
      p = ProfiliAI.preset(sel.value);
      per.value = String(p.perRisposta); max.value = String(p.maxCaratteri); file.checked = p.file;
      salvaProfiloAI(p); mostra();
    });
    const campo = () => {
      const n = Math.max(1, Math.min(50, Math.floor(Number(per.value)) || 1)), c = Math.max(0, Math.floor(Number(max.value)) || 0);
      p = { ...p, perRisposta: n, maxCaratteri: c, file: file.checked };
      salvaProfiloAI(p); mostra();
    };
    for (const x of [per, max, file]) x.addEventListener('change', campo);
    mostra();
    return h('div', null, h('label.piccolo', null, 'Quale AI usi?'), sel, campi, descr);
  }
  /** Libro con l'indice che conosce le pagine del microstep e un PDF da cui estrarre il testo. */
  function libroPer(r: CreazioneRec, ms: string): { libro: LibroRec; p: PagineMicro } | null {
    for (const l of r.fonti ? r.fonti.libri : []) {
      const libro = Stato.prendi<LibroRec>(Centro.idLibro(r.nomeMateria, l.nome));
      if (!libro || libro.deleted || !libro.indice || !libro.indice.length || !libro.pdf.length) continue;
      const p = Centro.pagineMicrostep(libro.indice, libro.mappa, ms);
      if (p && p.pdfDa !== null) return { libro, p };
    }
    return null;
  }
  /** Testo del PDF per un microstep (pagine PDF da..a, al massimo 40), con le pagine senza testo segnate; null se non c'è. */
  async function materialeDi(r: CreazioneRec, ms: string): Promise<PaginaTesto[] | null> {
    const x = libroPer(r, ms);
    if (!x || x.p.pdfDa === null) return null;
    const da = x.p.pdfDa, a = Math.min(x.p.pdfA !== null ? x.p.pdfA : da + 19, da + 39);
    const testi = await testiPagine(x.libro, Array.from({ length: a - da + 1 }, (_, i) => da + i), () => { /* stato mostrato dal passo */ });
    return ProfiliAI.pagine(testi, da, a);
  }
  const elencoProblemi = (problemi: ProblemaQ[], etichetta: string, max = 40) => problemi.length
    ? h('ul.piccolo.centro-avvisi', { 'aria-label': etichetta }, ...problemi.slice(0, max).map(p => h('li', null, SEGNO[p.sev] + ' ' + p.id + ' — ' + p.msg)),
      problemi.length > max ? h('li.tenue', null, '…e altri ' + (problemi.length - max)) : null)
    : null;

  function apri(testoCondiviso: string | null = null): void {
    const condiviso = testoCondiviso === null ? null : String(testoCondiviso);
    let rec: CreazioneRec | null = aperte()[0] || null;
    let passo = condiviso === null ? (rec ? Centro.passoDi(rec) : 1) : 4;
    if (rec?.citazioni?.drive) validitaDrive.delete(chiaveValidita(rec));
    const indicatore = h('p.centro-passo', { role: 'status', 'aria-live': 'polite' });
    const indietro = h('button.chip', { type: 'button', 'aria-label': 'Torna al passo precedente' }, '← Indietro') as HTMLButtonElement;
    const zona = h('div.centro-zona');
    indietro.addEventListener('click', () => { if (passo > 1) vai(passo - 1); });

    let nota: HTMLElement | null = null;      // esito dell'ultima azione, mostrato in cima al passo successivo
    let registroRip: string[] = [];          // riparazioni automatiche fatte in questa apertura
    function salva(r: CreazioneRec): void { Stato.salva(r, true); rec = r; }
    async function riconfermaDrive(r: CreazioneRec, forza = false): Promise<void> {
      const c = r.citazioni;
      if (!c?.drive?.length) return;
      const k = chiaveValidita(r);
      if (!forza && validitaDrive.has(k)) return;
      validitaDrive.set(k, 'attesa');
      try {
        const correnti = await Promise.all(c.drive.map(x => pdfDrive(x.nome)));
        validitaDrive.set(k, JSON.stringify(correnti) === JSON.stringify(c.drive) ? 'valida' : 'cambiata');
      } catch (e) {
        console.warn('[centro] riconferma PDF Drive', e);
        validitaDrive.set(k, 'non-disponibile');
      }
      if (rec && rec.id === r.id && passo === 4) vai(4);
    }
    function ricontrolla(): void {
      if (rec?.citazioni?.drive?.length) void riconfermaDrive(rec, true);
      vai(4);
    }
    function vai(n: number): void {
      if (condiviso !== null) {
        passo = 4;
        indicatore.textContent = 'Passo 4 di 7 · Controllo — risposta condivisa';
        indietro.disabled = true;
        svuota(zona);
        zona.appendChild(passoCondiviso(condiviso));
        const primoCondiviso = zona.querySelector<HTMLElement>('button, textarea');
        if (primoCondiviso) primoCondiviso.focus({ preventScroll: true });
        return;
      }
      passo = Math.max(1, Math.min(7, n));
      indicatore.textContent = 'Passo ' + passo + ' di 7 · ' + PASSI[passo - 1] + (rec ? ' — ' + rec.nomeMateria + ' · step ' + rec.step : '');
      indietro.disabled = passo === 1;
      svuota(zona);
      const corpo = passo === 1 ? passoObiettivo() : passo === 2 ? passoPiano() : passo === 3 ? passoQuiz()
        : passo === 4 ? passoControllo() : passo === 5 ? passoCorreggi() : passo === 6 ? passoProva() : passoImporta();
      if (nota) { corpo.insertBefore(nota, corpo.firstChild); nota = null; }
      zona.appendChild(corpo);
      if (passo === 4 && rec?.citazioni?.drive?.length && !validitaDrive.has(chiaveValidita(rec))) void riconfermaDrive(rec);
      const primo = zona.querySelector<HTMLElement>('input, select, textarea, button');
      if (primo) primo.focus({ preventScroll: true });
    }

    // ---------- Passo 1: Obiettivo ----------
    function passoObiettivo(): HTMLElement {
      const materie = Stato.tutti<MateriaRec>('materia').filter(m => !m.deleted).sort((a, b) => a.nome.localeCompare(b.nome));
      const cm = campoMateria(materie.map(m => [m.codice, m.nome] as [string, string]), rec ? rec.materia : '', materiaPerNome);
      const sel = cm.el.querySelector('select');
      if (sel) sel.setAttribute('aria-label', 'Materia');
      const step = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'es. 3.3', 'aria-label': 'Step (es. 3.3)', value: rec ? rec.step : '' }) as HTMLInputElement;
      const titolo = h('input', { type: 'text', placeholder: 'Titolo dello step (facoltativo)', 'aria-label': 'Titolo dello step', value: (rec && rec.titolo) || '' }) as HTMLInputElement;
      const data = h('input', { type: 'date', 'aria-label': 'Data prevista', value: (rec && rec.data) || '' }) as HTMLInputElement;
      const intens = selettore([['leggera', 'Leggera (10–14 schede)'], ['standard', 'Standard (18–25 schede)'], ['intensa', 'Intensa (24–30 schede)']], (rec && rec.intensita) || 'standard');
      intens.setAttribute('aria-label', 'Intensità');
      const opzArch = Object.values(ARCHETIPI_DISCIPLINARI).map(a => [a.id, ICONE_ARCHETIPO[a.id] + ' ' + a.etichetta] as [string, string]);
      const codiceScelto = () => sel && sel.value !== '__nuova__' ? sel.value : '';
      const arch = selettore(opzArch, codiceScelto() ? Dominio.archetipoMateria(codiceScelto()) : 'scienze_sperimentali');
      arch.setAttribute('aria-label', 'Tipo di materia (archetipo)');
      if (sel) sel.addEventListener('change', () => { const c = codiceScelto(); if (c) arch.value = Dominio.archetipoMateria(c); });
      const nomeMat = () => { const c = codiceScelto(); if (c) return (materie.find(m => m.codice === c) || { nome: '' }).nome;
        // senza materie salvate cm.el È il campo di testo (querySelector cerca solo nei discendenti)
        const t = cm.el.matches('input.campo-materia-nuova') ? cm.el as HTMLInputElement : cm.el.querySelector<HTMLInputElement>('input.campo-materia-nuova');
        return t ? t.value.trim() : ''; };
      const fonti = StrumentiQuiz.raccoltaFonti(nomeMat, rec ? rec.fonti : undefined);

      const altri = aperte().filter(r => !rec || r.id !== rec.id);
      const riprendi = altri.length ? h('div', null, h('p.piccolo.tenue', null, 'Altri step in corso:'),
        h('div.chips', null, ...altri.slice(0, 8).map(r => h('button.chip', { type: 'button', onclick: () => { rec = r; vai(Centro.passoDi(r)); } },
          r.nomeMateria + ' · ' + r.step + ' (passo ' + Centro.passoDi(r) + ')')))) : null;
      const nuovo = rec ? h('button.chip', { type: 'button', onclick: () => { rec = null; vai(1); } }, '＋ Nuovo step') : null;

      function avanti(): void {
        const codice = cm.value;
        if (!codice) { avviso('Scegli o scrivi la materia.'); return; }
        const st = step.value.trim();
        if (!RE_STEP.test(st)) { avviso('Scrivi lo step come numero, es. 3.3.'); step.focus(); return; }
        const m = Stato.prendi<MateriaRec>('mat-' + codice), nome = m ? m.nome : codice;
        if (eArchetipo(arch.value) && (!m || m.archetipo !== arch.value)) Dominio.impostaArchetipo(codice, arch.value);
        const id = 'cre-' + Centro.prefisso({ materia: nome, step: st });
        const gia = Stato.prendi<CreazioneRec>(id);
        const base: CreazioneRec = gia && !gia.deleted ? gia : { id, type: 'creazione', updatedAt: 0, materia: codice, nomeMateria: nome, step: st, schede: [], esiti: {} };
        const fv = fonti.valori();
        // Un record `libro` per ogni libro scelto (solo nomi e misure): la fonte scelta a mano resta (Centro.libroDa).
        for (const l of fv.libri) {
          const prec = Stato.prendi<LibroRec>(Centro.idLibro(nome, l.nome)), nuovo = Centro.libroDa(nome, l, prec);
          if (!prec || JSON.stringify(prec) !== JSON.stringify(nuovo)) Stato.salva(nuovo, true);   // niente sync se non cambia
        }
        salva({ ...base, materia: codice, nomeMateria: nome, step: st, titolo: titolo.value.trim() || undefined, data: data.value || undefined,
          intensita: intens.value as OpzMP['intensita'], fonti: fv });
        vai(Math.max(2, Centro.passoDi(rec!)));
      }
      return h('div.centro-passo-corpo', null,
        h('p.piccolo.tenue', null, 'Scegli la materia e lo step: l\'app prepara il prompt del piano, poi quello di ogni scheda.'),
        riprendi, nuovo,
        h('label.piccolo', null, 'Materia'), cm.el,
        h('div.chips', null, step, data), titolo, intens,
        h('label.piccolo', null, 'Tipo di materia'), arch,
        campoAI(),
        h('h3.centro-sotto', null, 'Fonti'), fonti.el,
        h('button.btn', { type: 'button', onclick: avanti }, 'Avanti →'));
    }

    // ---------- Passo 2: Piano ----------
    /** Opzioni del master prompt dallo stato salvato (le stesse per il prompt del piano e per quello delle schede). */
    function opzioniMP(r: CreazioneRec): { opz: OpzMP; dos: ReturnType<typeof StrumentiQuiz.regoleDossier> } {
      const fv = r.fonti || { libri: [], slide: [], guide: [], indici: [], quiz: [], vietati: [] };
      const dos = StrumentiQuiz.regoleDossier(r.nomeMateria, r.materia, r.step, [...fv.libri.flatMap(l => l.pdf), ...fv.slide, ...fv.guide, ...fv.indici, ...fv.quiz]);
      const arch = Dominio.archetipoMateria(r.materia);
      const opz: OpzMP = { materia: r.nomeMateria, codice: r.materia, step: r.step, titolo: r.titolo, data: r.data, intensita: r.intensita,
        archetipo: arch, etichettaArchetipo: ARCHETIPI_DISCIPLINARI[arch].etichetta, tono: Dominio.profilo().tonoSpiegazioneAI,
        libri: fv.libri, slide: fv.slide, guide: fv.guide, indici: fv.indici, quizEsistenti: fv.quiz, vietati: [...new Set([...fv.vietati, ...StrumentiQuiz.esclusi()])],
        idEsistenti: StrumentiQuiz.idGiaUsati(), dossier: dos.problemi.length ? [] : dos.regole };
      return { opz, dos };
    }
    /** Riquadro «incolla la risposta» con apertura da file: chiama `leggi` col testo. */
    function rispostaAI(etichetta: string, segnaposto: string, bottone: string, leggi: (t: string) => void): HTMLElement {
      const ta = h('textarea', { rows: 6, placeholder: segnaposto, 'aria-label': etichetta, spellcheck: 'false' }) as HTMLTextAreaElement;
      const daFile = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', 'aria-label': etichetta + ' da un file' }) as HTMLInputElement;
      daFile.addEventListener('change', async () => { const f = daFile.files && daFile.files[0]; if (f) { ta.value = await f.text(); leggi(ta.value); } daFile.value = ''; });
      return h('div.centro-passo-corpo', null, ta, h('div.chips', null, h('button.chip', { type: 'button', onclick: () => leggi(ta.value) }, bottone), daFile));
    }
    const notaDi = (righe: string[]) => h('div.centro-nota', { role: 'status' }, ...righe.map(t => h('p.piccolo', null, t)));
    const copiabile = (testo: string, etichetta: string, bottone: string) => {
      const out = h('textarea', { rows: 5, readonly: true, 'aria-label': etichetta, spellcheck: 'false' }) as HTMLTextAreaElement;
      out.value = testo;
      return [h('button.btn', { type: 'button', onclick: () => { StrumentiQuiz.copia(testo, out); } }, bottone), out];
    };

    /** T12 v0.64.1: controllo effimero del testo condiviso; non scrive alcun record. */
    function passoCondiviso(testo: string): HTMLElement {
      const originale = h('textarea', { rows: 5, readonly: true, 'aria-label': 'Testo condiviso da controllare', spellcheck: 'false' }) as HTMLTextAreaElement;
      originale.value = testo;
      const l = Contratto.leggi(testo), quiz = FORMATI_QUIZ.includes(l.formato);
      const errore = l.errori[0] || (l.formato === 'ignoto' ? 'Serve un blocco JSON con «quiz».' : 'Il testo è un ' + l.formato + ', non una risposta quiz.');
      const continua = l.troncato ? copiabile(Contratto.continua(l, { perScheda: PER() }), 'Prompt per continuare la risposta condivisa', 'Copia «continua da qui»') : [];
      if (!quiz) return h('div.centro-passo-corpo', null,
        h('p.piccolo', null, '✗ Non trovo domande di quiz. ' + errore),
        ...continua,
        h('details', null, h('summary.piccolo', null, 'Testo ricevuto'), originale));
      const grezze = Contratto.aQuiz(l), rip = Validatore.ripara(grezze), qs = rip.qs as DomAI[];
      const { v, problemi, corr } = controlla(qs), err = problemi.filter(p => p.sev === 'err'), warn = problemi.filter(p => p.sev !== 'err');
      return h('div.centro-passo-corpo', null,
        h('p.piccolo', null, h('b', null, qs.length + ' domande condivise'), ' · pronte da importare ' + v.pronte + ' · da correggere con patch ' + corr.nDomande),
        l.troncato ? h('p.piccolo', null, '✂️ La risposta sembra interrotta: le domande complete restano visibili qui.') : null,
        rip.log.length ? h('details', null, h('summary.piccolo', null, '↔ Riparazioni applicabili: ' + rip.log.length),
          h('ul.piccolo.tenue.centro-avvisi', { 'aria-label': 'Riparazioni della risposta condivisa' }, ...rip.log.map(t => h('li', null, t)))) : null,
        err.length ? h('h3.centro-sotto', null, '✗ Da rifare') : null, elencoProblemi(err, 'Problemi da rifare'),
        warn.length ? h('details', null, h('summary.piccolo', null, '⚠️ Avvisi di qualità: ' + warn.length), elencoProblemi(warn, 'Avvisi di qualità')) : null,
        !problemi.length ? h('p.piccolo', null, '✓ Nessun problema trovato.') : null,
        ...continua,
        h('details', null, h('summary.piccolo', null, 'Testo ricevuto'), originale));
    }

    function passoPiano(): HTMLElement {
      const r = rec!;
      const { opz, dos } = opzioniMP(r);
      const testoPrompt = MasterPrompt.costruisciPiano(opz);
      const out = h('textarea', { rows: 6, readonly: true, 'aria-label': 'Prompt del piano da copiare nell\'AI' }) as HTMLTextAreaElement;
      out.value = testoPrompt;
      const copia = h('button.btn', { type: 'button', onclick: () => { StrumentiQuiz.copia(testoPrompt, out); } }, '📋 Copia il prompt del piano');
      const incolla = h('textarea', { rows: 6, placeholder: 'Incolla qui la risposta dell\'AI (il piano)…', 'aria-label': 'Risposta dell\'AI con il piano' }) as HTMLTextAreaElement;
      const daFile = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', 'aria-label': 'Apri la risposta dell\'AI da un file' }) as HTMLInputElement;
      daFile.addEventListener('change', async () => { const f = daFile.files && daFile.files[0]; if (f) { incolla.value = await f.text(); leggi(); } daFile.value = ''; });
      const esito = h('div', { role: 'status', 'aria-live': 'polite' });
      const anteprima = h('div.centro-anteprima');
      let piano: PianoCentro | null = r.piano ? JSON.parse(JSON.stringify(r.piano)) as PianoCentro : null;

      function leggi(): void {
        const l = Contratto.leggi(incolla.value);
        svuota(esito);
        if (l.formato !== 'piano-v1' && l.formato !== 'piano-righe') {
          esito.appendChild(h('p.piccolo', null, '⛔ Non trovo un piano. ' + (l.errori[0] || 'Serve il blocco piano-v1 (o le righe @B / COPRE).')));
          return;
        }
        piano = Centro.daPiano(Contratto.aPiano(l), r.step);
        disegna();
      }
      function disegna(): void {
        svuota(anteprima);
        if (!piano) return;
        const p = piano;
        const rinumera = () => p.schede.forEach((x, i) => { x.n = i + 1; });
        if (p.avvisi.length) anteprima.appendChild(h('ul.piccolo.centro-avvisi', { 'aria-label': 'Avvisi sul piano' }, ...p.avvisi.map(a => h('li', null, '⚠️ ' + a))));
        anteprima.appendChild(h('p.piccolo', null, h('b', null, p.schede.length + ' schede'), ' · ' + p.blocchi.length + ' blocchi: correggi microstep e categoria se serve.'));
        const lista = h('ol.centro-schede', { 'aria-label': 'Schede del piano' });
        p.schede.forEach((x, i) => {
          const micro = h('input', { type: 'text', value: x.micro.join(', '), 'aria-label': 'Microstep della scheda S' + x.n, size: 8 }) as HTMLInputElement;
          micro.addEventListener('change', () => {
            const v = micro.value.split(/[,;\s]+/).map(m => m.trim()).filter(Boolean), ok = v.filter(m => RE_STEP.test(m) && m.startsWith(p.step + '.'));
            if (!ok.length) { avviso('Microstep dello step ' + p.step + ', es. ' + p.step + '.1'); micro.value = x.micro.join(', '); return; }
            x.micro = ok; micro.value = ok.join(', ');
          });
          const cat = selettore([['prioritaria', 'Prioritaria'], ['raffinamento', 'Raffinamento']], x.categoria, function () { x.categoria = this.value as CategoriaScheda; });
          cat.setAttribute('aria-label', 'Categoria della scheda S' + x.n);
          const togli = h('button.btn-ico', { type: 'button', 'aria-label': 'Togli la scheda S' + x.n, onclick: () => { p.schede.splice(i, 1); rinumera(); disegna(); } }, '✕');
          lista.appendChild(h('li.riga-tra', null, h('span', null, h('b', null, 'S' + String(x.n).padStart(2, '0')), h('span.piccolo.tenue', null, ' ' + x.blocco)), h('span.chips', null, micro, cat, togli)));
        });
        anteprima.appendChild(lista);
        const aggiungi = h('button.chip', { type: 'button', onclick: () => {
          const ult = p.schede[p.schede.length - 1];
          p.schede.push({ n: p.schede.length + 1, micro: ult ? ult.micro.slice() : [p.step + '.1'], categoria: 'prioritaria', blocco: ult ? ult.blocco : (p.blocchi[0] || p.step) });
          disegna();
        } }, '＋ Aggiungi scheda');
        const approva = h('button.btn', { type: 'button', onclick: () => {
          if (!p.schede.length) { avviso('Il piano non ha schede.'); return; }
          salva({ ...r, piano: p, schede: p.schede.map(x => ({ n: x.n, stato: 'da-fare' as const })), esiti: {} });
          avviso('Piano salvato: ' + p.schede.length + ' schede.');
          vai(3);
        } }, '✅ Approva il piano');
        anteprima.appendChild(h('div.chips', null, aggiungi, approva));
      }
      if (piano) disegna();
      return h('div.centro-passo-corpo', null,
        h('p.piccolo.tenue', null, '1) Copia il prompt e incollalo nella chat dell\'AI, allegando le fonti. 2) Incolla qui la risposta: l\'app numera le schede e ti mostra il piano.'),
        dos.problemi.length ? h('p.piccolo', null, '⛔ Il dossier conteneva dati identificativi: nel prompt non è stato messo.') : null,
        copia, out,
        h('h3.centro-sotto', null, 'Risposta dell\'AI'), incolla,
        h('div.chips', null, h('button.chip', { type: 'button', onclick: leggi }, '🔍 Leggi il piano'), daFile), esito, anteprima);
    }

    // ---------- Passo 3: Quiz ----------
    let scelta = 0, coppia = true;            // scheda scelta a mano (0 = la prossima) e «2 schede per messaggio»
    let parteScelta = 0, conTesto = true;     // v0.64: parte k scelta a mano (0 = la prima che manca) e casella «Includo … del tuo PDF»
    const mixPer = new Map<string, MixTipi>();                          // mix del giro, per step (modificabile coi campi del passo 3)
    const testiPer = new Map<string, PaginaTesto[] | null | 'attesa'>(); // testo del PDF per microstep, estratto una volta per apertura
    /** Campi del mix: ogni tipo diverso da mcq si sceglie, le mcq sono il resto fino a 18 (il totale resta giusto). */
    function campiMix(r: CreazioneRec, m: MixTipi): HTMLElement {
      const tot = PER(), ALTRI: Array<[Exclude<TipoV4, 'mcq'>, string]> = [['completamento', 'Completamento'], ['ordinamento', 'Ordinamento'], ['aperta', 'Aperta'], ['codice', 'Codice']];
      const ins = ALTRI.map(([t, nome]) => h('input', { type: 'number', min: '0', max: String(tot), inputmode: 'numeric', 'aria-label': 'Domande di tipo ' + nome.toLowerCase() + ' per scheda', value: String(m[t]) }) as HTMLInputElement);
      const cambia = () => {
        const nuovo = { ...m }; let resto = tot;
        ALTRI.forEach(([k], j) => { nuovo[k] = Math.max(0, Math.min(resto, Math.floor(Number(ins[j].value)) || 0)); resto -= nuovo[k]; });
        nuovo.mcq = resto; mixPer.set(r.id, nuovo); vai(3);
      };
      ins.forEach(i => i.addEventListener('change', cambia));
      const etichette = ALTRI.map(([, nome], j) => h('label.piccolo.chip', null, nome + ' ', ins[j]));
      return h('div', { role: 'group', 'aria-label': 'Tipi di domanda per scheda' }, h('p.piccolo', null, h('b', null, 'Tipi di domanda'), ' · risposta multipla ' + m.mcq + ' · totale ' + tot),
        h('div.chips', null, ...etichette));
    }
    function passoQuiz(): HTMLElement {
      const r = rec!, sc = r.schede || [], piano = r.piano as PianoCentro | undefined;
      if (!piano || !sc.length) { vai(2); return h('div'); }
      const delPiano = (n: number) => piano.schede.find(x => x.n === n);
      const flusso = (n: number) => sc.find(x => x.n === n);
      const n0 = scelta && flusso(scelta) ? scelta : Centro.prossimaScheda(r);
      const tutte = !n0;
      const prof = profiloAI(), parti = ProfiliAI.parti(PER(), prof.perRisposta), aParti = parti.length > 1;
      const cur = n0 ? flusso(n0)! : null, continua = !!cur && cur.stato === 'interrotta' && !aParti;
      const succ = cur && !continua && coppia && !aParti ? flusso(n0 + 1) : undefined;
      const bersaglio = cur ? [n0, ...(succ && succ.stato === 'da-fare' ? [succ.n] : [])] : [];

      const lista = h('ol.centro-schede', { 'aria-label': 'Schede dello step' }, ...sc.map(x => {
        const p = delPiano(x.n), parte = x.stato !== 'da-fare' ? parteDi(r, x.n) : null, n = parte ? parte.quiz.length : 0;
        const etich = x.stato === 'interrotta' ? (aParti ? '▶ Prossima parte' : '✂️ Continua da qui') : x.stato === 'arrivata' ? '↻ Riscrivi' : '✍️ Scrivi';
        const aria = x.stato === 'interrotta' ? (aParti ? 'Prossima parte della scheda ' + sig(x.n) : 'Continua la scheda ' + sig(x.n) + ' da dove si è interrotta') : (x.stato === 'arrivata' ? 'Riscrivi' : 'Scrivi') + ' la scheda ' + sig(x.n);
        const attiva = bersaglio.includes(x.n);
        return h('li.riga-tra' + (attiva ? '.centro-attiva' : ''), { 'aria-current': attiva ? 'true' : undefined },
          h('span', null, simbolo(x) + ' ', h('b', null, sig(x.n)), h('span.piccolo.tenue', null, ' ' + (p ? p.micro[0] + ' · ' + p.categoria : '') + ' · ' + statoTesto(x) + (n ? ' (' + n + '/' + PER() + ')' : ''))),
          h('button.chip', { type: 'button', 'aria-label': aria, onclick: () => { scelta = x.n; parteScelta = 0; vai(3); } }, etich));
      }));
      const arrivate = sc.filter(x => x.stato === 'arrivata').length;
      const testa = h('p.piccolo', null, h('b', null, arrivate + ' di ' + sc.length + ' schede arrivate'), ' · ✅ arrivata · ✂️ interrotta · ⏳ da fare');
      if (tutte) return h('div.centro-passo-corpo', null, testa, lista,
        h('p.piccolo', null, 'Tutte le schede sono arrivate: ora l\'app le controlla.'),
        h('button.btn', { type: 'button', onclick: () => vai(4) }, 'Avanti: Controllo →'));

      const casella = h('input', { type: 'checkbox', checked: coppia || undefined }) as HTMLInputElement;
      casella.addEventListener('change', () => { coppia = casella.checked; vai(3); });
      let testoPrompt: string, rigaTesto: HTMLElement | null = null, bloccoParti: HTMLElement | null = null, mixEl: HTMLElement | null = null, parte: ParteAI | undefined;
      if (continua) {
        const gia = (parteDi(r, n0) || { quiz: [] as DomAI[] }).quiz, ult = gia[gia.length - 1];
        const ultimo = ult ? String(ult.domanda || ult.id || '').slice(0, 160) : undefined;
        testoPrompt = Contratto.continua({ formato: 'quiz-v3', dati: { step: pref(r), scheda: sig(n0), quiz: gia }, blocchi: [], riparazioni: [],
          troncato: true, ultimoCompleto: ultimo, avvisi: [], errori: [] }, { perScheda: PER() });
      } else {
        const lst = bersaglio.map(n => delPiano(n)).filter((x): x is SchedaCentro => !!x);
        const libri = (r.fonti ? r.fonti.libri : []).map(l => Stato.prendi<LibroRec>(Centro.idLibro(r.nomeMateria, l.nome))).filter((x): x is LibroRec => !!x);
        const pagine = Centro.paginePer(libri, lst.map(x => x.micro[0]).filter(Boolean));
        const proprietario = Drive.eProprietario();
        const mix = mixPer.get(r.id) || ProfiliAI.mix(Dominio.archetipoMateria(r.materia), proprietario, PER());
        if (!proprietario) mixEl = campiMix(r, mix);   // Medicina: solo mcq, il prompt resta quello di v0.63
        if (aParti) {
          const fatte = Centro.partiIncollate(parti, (parteDi(r, n0) || { quiz: [] as DomAI[] }).quiz);
          const k = parteScelta && parteScelta <= parti.length ? parteScelta : (fatte.indexOf(false) + 1 || 1);
          parte = parti[k - 1];
          bloccoParti = h('div', { role: 'group', 'aria-label': 'Parti della scheda ' + sig(n0) },
            h('p.piccolo', null, h('b', null, 'Parti di ' + sig(n0)), ' · ' + fatte.filter(Boolean).length + ' di ' + parti.length + ' incollate'),
            h('div.chips', null, ...parti.map((p, i) => h('button.chip', { type: 'button', 'aria-pressed': p.k === k ? 'true' : 'false',
              'aria-label': 'Parte ' + p.k + ' di ' + p.N + ', domande ' + p.da + '–' + p.a + ', ' + (fatte[i] ? 'incollata' : 'da fare'),
              onclick: () => { parteScelta = p.k; vai(3); } }, (fatte[i] ? '✓ ' : '⏳ ') + p.k + '/' + p.N + ' (' + p.da + '–' + p.a + ')'))));
        }
        let materiale: PaginaTesto[] | null | undefined;
        if (!prof.file) {
          const ms = lst.length ? lst[0].micro[0] : '', t = testiPer.get(r.id + '|' + ms);
          if (t === undefined && ms) {
            testiPer.set(r.id + '|' + ms, 'attesa');
            materialeDi(r, ms).catch(() => null).then(x => { testiPer.set(r.id + '|' + ms, x); if (passo === 3 && rec && rec.id === r.id) vai(3); });
          }
          if (t === undefined && ms || t === 'attesa') return h('div.centro-passo-corpo', null, testa, lista, bloccoParti,
            h('p.piccolo', { role: 'status' }, '⏳ Estraggo il testo del PDF per ' + sig(n0) + '…'));
          materiale = conTesto && t ? t : null;
        }
        const res = MasterPrompt.promptSchede({ ...opzioniMP(r).opz, mix, parteAI: parte, materiale, maxCaratteri: prof.file ? undefined : prof.maxCaratteri },
          lst.map(x => ({ n: x.n, sigla: sig(x.n), micro: x.micro, categoria: x.categoria, blocco: x.blocco })), pagine);
        testoPrompt = res.testo;
        if (materiale !== undefined) {
          const mt = res.materiale, ci = !!mt && mt.pagine.length > 0, t = testiPer.get(r.id + '|' + (lst.length ? lst[0].micro[0] : ''));
          const disponibile = !!t && t !== 'attesa' && t.some(x => !x.vuota);
          const cas = h('input', { type: 'checkbox', checked: conTesto && disponibile || undefined, disabled: !disponibile || undefined }) as HTMLInputElement;
          cas.addEventListener('change', () => { conTesto = cas.checked; vai(3); });
          rigaTesto = h('label.riga-tra.piccolo', null,
            ci ? 'Includo ' + mt!.pagine.length + (mt!.pagine.length === 1 ? ' pagina, ' : ' pagine, ') + numero(mt!.caratteri) + ' caratteri del tuo PDF' + (mt!.escluse ? ' (tagliato: ' + mt!.escluse + ' pagine fuori)' : '')
              : disponibile ? 'Testo del PDF tolto dal prompt' : 'Testo del PDF non disponibile: il prompt dice «materiale non incluso»', cas);
        }
      }
      const titolo = (continua ? 'Continua ' : 'Prompt per ') + bersaglio.map(sig).join(' e ') + (parte ? ' · parte ' + parte.k + ' di ' + parte.N : '');
      return h('div.centro-passo-corpo', null, testa, lista,
        bloccoParti, mixEl,
        h('h3.centro-sotto', null, titolo),
        continua ? h('p.piccolo.tenue', null, 'Incolla questo prompt nella stessa chat: l\'AI scrive solo le domande che mancano.')
          : aParti ? h('p.piccolo.tenue', null, descriviProfilo(prof))
          : h('label.riga-tra.piccolo', null, '2 schede per messaggio (36 domande)', casella),
        rigaTesto,
        ...copiabile(testoPrompt, 'Prompt da copiare nell\'AI per ' + bersaglio.map(sig).join(' e '), continua ? '📋 Copia «continua da qui»' : '📋 Copia il prompt'),
        h('h3.centro-sotto', null, 'Risposta dell\'AI'),
        rispostaAI('Risposta dell\'AI con le schede ' + bersaglio.map(sig).join(' e '), 'Incolla qui la risposta (anche la chat intera)…', '📥 Leggi la risposta',
          t => leggiSchede(r, t, bersaglio, continua)));
    }

    /** Risposta incollata → domande nel modello interno → una parte per scheda; ✅ se ci sono tutte, ✂️ se mancano. */
    function leggiSchede(r: CreazioneRec, testo: string, bersaglio: number[], continua: boolean): void {
      const l = Contratto.leggi(testo), piano = r.piano as PianoCentro;
      if (!FORMATI_QUIZ.includes(l.formato)) {
        avviso('⛔ Non trovo domande di quiz. ' + (l.errori[0] || (l.formato === 'ignoto' ? 'Serve il blocco JSON con «quiz».' : 'È un ' + l.formato + '.')), 6000);
        return;
      }
      const d = (l.dati && typeof l.dati === 'object' ? l.dati : {}) as DomAI, nuove = (Array.isArray(d.quiz) ? d.quiz : []) as DomAI[];
      let dati: DomAI = d;
      if (continua) {
        const gia = (parteDi(r, bersaglio[0]) || { quiz: [] as DomAI[] }).quiz, testi = new Set(gia.map(q => String(q.domanda || '').trim()));
        const solo = nuove.filter(q => !testi.has(String(q.domanda || '').trim()));
        dati = { ...d, scheda: sig(bersaglio[0]), quiz: [...gia, ...solo.map(q => ({ ...q, scheda: q.scheda || sig(bersaglio[0]) }))] };
      }
      const qs = Contratto.aQuiz({ ...l, dati }, { step: pref(r), scheda: bersaglio[0] });
      const diParte = Number(d.da) >= 1;   // risposta «parte k/N»: si aggiunge a quelle già arrivate (stesso ID = sostituita)
      const perScheda = new Map<number, DomAI[]>(), fuori: number[] = [];
      for (const q of qs) {
        const n = ImportaParti.numScheda(q.scheda) || bersaglio[0], p = piano.schede.find(x => x.n === n);
        if (!p) { if (!fuori.includes(n)) fuori.push(n); continue; }
        const lst = perScheda.get(n) || [];
        lst.push({ ...q, categoria: p.categoria, sottoStep: q.sottoStep || p.micro[0] });
        perScheda.set(n, lst);
      }
      if (!perScheda.size) { avviso('⛔ Nessuna domanda delle schede del piano in questa risposta.', 6000); return; }
      const righe: string[] = [], schede = (r.schede || []).map(x => ({ ...x }));
      for (let [n, lst] of [...perScheda].sort((a, b) => a[0] - b[0])) {
        const id = idParte(r, n), gia = Stato.prendi<ParteQRec>(id);
        if (diParte && gia && !gia.deleted) lst = Centro.unisciDomande(gia.quiz, lst);
        Stato.salva({ id, type: 'parteq', updatedAt: gia ? gia.updatedAt : 0, cre: r.id, parte: Centro.nomeParte({ materia: r.nomeMateria, step: r.step }, n), scheda: n, quiz: lst } as ParteQRec, true);
        const x = schede.find(s => s.n === n)!, ok = lst.length >= PER();
        x.stato = ok ? 'arrivata' : 'interrotta'; x.parteId = id;
        righe.push((ok ? '✅ ' : '✂️ ') + sig(n) + ': ' + lst.length + ' domande' + (ok ? '' : ' su ' + PER() + (diParte ? ' — ora la prossima parte' : ' — premi «Continua da qui»')));
      }
      if (fuori.length) righe.push('⚠️ Ignorate le domande di ' + fuori.map(sig).join(', ') + ': non sono nel piano.');
      for (const n of bersaglio) if (!perScheda.has(n)) righe.push('⏳ ' + sig(n) + ': nessuna domanda arrivata.');
      if (l.riparazioni.length) righe.push('🔧 ' + l.riparazioni.join(' · '));
      for (const a of l.avvisi.slice(0, 5)) righe.push('⚠️ ' + a);
      salva({ ...r, schede, esiti: {} });
      scelta = 0; parteScelta = 0; nota = notaDi(righe); registroRip = [];
      vai(3);
    }

    // ---------- Passo 4: Controllo ----------
    function passoControllo(): HTMLElement {
      const r = rec!, { qs: grezze, daScheda } = domande(r);
      const rip = Validatore.ripara(grezze);
      if (rip.log.length) { salvaDomande(r, rip.qs, daScheda); registroRip = [...registroRip, ...rip.log]; }
      const qs = rip.qs as DomAI[], { v, problemi, corr } = controlla(qs, false, problemiCit(r, qs));
      const daCorreggere = corr.nDomande;
      salva({ ...r, esiti: { ...(r.esiti || {}), controllato: true, daCorreggere } });
      const err = problemi.filter(p => p.sev === 'err'), warn = problemi.filter(p => p.sev !== 'err');
      return h('div.centro-passo-corpo', null,
        h('p.piccolo', null, h('b', null, qs.length + ' domande'), ' · pronte da importare ' + v.pronte + ' · da correggere con patch ' + daCorreggere),
        registroRip.length ? h('details', null, h('summary.piccolo', null, '🔧 Riparazioni automatiche già fatte: ' + registroRip.length),
          h('ul.piccolo.tenue.centro-avvisi', { 'aria-label': 'Riparazioni automatiche' }, ...registroRip.map(t => h('li', null, t)))) : null,
        err.length ? h('h3.centro-sotto', null, '⛔ Da rifare') : null, elencoProblemi(err, 'Problemi da rifare'),
        corr.manuali.length ? h('p.piccolo', null, '✋ Da sistemare a mano (le patch non bastano): ' + corr.manuali.map(p => p.id + ' — ' + p.msg).join('; ')) : null,
        warn.length ? h('details', null, h('summary.piccolo', null, '⚠️ Avvisi di qualità: ' + warn.length), elencoProblemi(warn, 'Avvisi di qualità')) : null,
        !problemi.length ? h('p.piccolo', null, '✅ Nessun problema trovato.') : null,
        bloccoCitazioni(r, qs),
        h('div.chips', null,
          daCorreggere ? h('button.btn', { type: 'button', onclick: () => vai(5) }, 'Correggi ' + daCorreggere + (daCorreggere === 1 ? ' domanda →' : ' domande →'))
            : h('button.btn', { type: 'button', onclick: () => vai(6) }, 'Avanti: Prova →'),
          h('button.chip', { type: 'button', onclick: ricontrolla }, '🔁 Ricontrolla'),
          h('button.chip', { type: 'button', onclick: () => vai(3) }, '📋 Torna alle schede')));
    }

    /** T12: citazioni ↔ testo del PDF del primo libro con mappa; ↔ corrette da sole, ⚠/✗ nel prompt di correzione, ❓ dichiarate. */
    function bloccoCitazioni(r: CreazioneRec, qs: DomAI[]): HTMLElement {
      const libri = libriVerificabili(r), l = libri[0], c = r.citazioni;
      if (!l) return h('div', null, h('h3.centro-sotto', null, '📖 Citazioni sul libro'),
        h('p.piccolo.tenue', null, 'Nessun libro con la mappa delle pagine: le citazioni non si possono verificare sul PDF (Obiettivo → Fonti → ⚙️ Pagine).'));
      const stato = h('span.piccolo', { role: 'status' }), btn = h('button.chip', { type: 'button', 'aria-label': 'Verifica le citazioni sul PDF di ' + l.nome }, '🔎 Verifica le citazioni sul PDF') as HTMLButtonElement;
      const scegli = h('input', { type: 'file', accept: 'application/pdf', multiple: true, 'aria-label': 'Scegli dal dispositivo il PDF di ' + l.nome }) as HTMLInputElement;
      scegli.addEventListener('change', () => { for (const f of Array.from(scegli.files || [])) pdfScelti.set(chiavePdf(l, f.name), { file: f, versione: f.size + ':' + f.lastModified });
        testiPer.clear();   // il PDF scelto può avere lo stesso nome ma contenuto diverso
        nota = notaDi([(scegli.files || []).length + ' PDF scelti: ora verifica.']);
        vai(4); });
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const pagine = Centro.pagineDaLeggere(qs, l.mappa);
          if (!pagine.length) { stato.textContent = 'Nessuna citazione con numero di pagina da verificare.'; return; }
          const versioni = new Map<string, VersionePdfDrive>();
          const testi = await testiPagine(l, pagine, m => { stato.textContent = m; }, versioni);
          const { qs: dopo, daScheda } = domande(r), res = Centro.verificaCitazioni(dopo, l.mappa, p => testi.get(p) || '');
          if (res.registro.length) salvaDomande(r, res.qs, daScheda);
          const fonteDi = (id: string) => String((res.qs.find(q => String(q.id) === id) || {}).fonte || '');
          const nuovo: CreazioneRec = { ...r, citazioni: { quando: ymd(new Date()), libro: l.nome, firma: firmaCitazioni(l, res.qs),
            drive: Array.from(versioni.values()), ok: res.ok, dubbi: res.dubbi, registro: res.registro,
            problemi: res.problemi.map(p => ({ ...p, fonte: fonteDi(p.id) })) } };
          validitaDrive.set(chiaveValidita(nuovo), 'valida');
          salva(nuovo);
          vai(4);
        } catch (e) {
          console.warn('[centro] verifica citazioni', e);
          stato.textContent = '⛔ ' + (e instanceof Error ? e.message : String(e)) + ': scegli il PDF dal dispositivo e riprova.';
          btn.disabled = false;
        }
      });
      const fatto = c && c.libro === l.nome && citazioniValide(r, qs) ? (() => {
        const [a, m, g] = c.quando.split('-'), np = problemiCit(r, qs).length;
        return [h('p.piccolo', null, 'Verificate il ' + g + '/' + m + '/' + a + ' su «' + l.nome + '»: ✅ ' + c.ok + ' giuste · ↔ ' + c.registro.length + ' corrette da sole · ⚠/✗ ' + np + ' nel prompt di correzione · ❓ ' + c.dubbi.length + ' non verificabili'),
          c.dubbi.length ? h('p.piccolo.tenue', null, '❓ Pagina senza testo leggibile o citazione senza numero: ' + c.dubbi.join(', ') + '. Controllale tu sul libro.') : null,
          c.registro.length ? h('details', null, h('summary.piccolo', null, '↔ Citazioni corrette sulla pagina accanto: ' + c.registro.length),
            h('ul.piccolo.tenue.centro-avvisi', { 'aria-label': 'Citazioni corrette' }, ...c.registro.map(t => h('li', null, t)))) : null];
      })() : [c ? h('p.piccolo', null, 'Verifica precedente da ripetere: la fonte è cambiata o deve essere riconfermata.')
        : h('p.piccolo.tenue', null, 'Controlla che ogni «fonte» citi la pagina giusta di «' + l.nome + '»: l\'app legge la pagina (e quelle accanto) e cerca le parole chiave della domanda.' + (libri.length > 1 ? ' Si usa il primo libro con la mappa.' : ''))];
      return h('div', null, h('h3.centro-sotto', null, '📖 Citazioni sul libro'), ...fatto,
        h('div.chips', null, btn, h('label.piccolo', null, 'PDF dal dispositivo: ', scegli)), stato);
    }

    // ---------- Passo 5: Correggi ----------
    let conAvvisi = false;
    function passoCorreggi(): HTMLElement {
      const r = rec!, { qs, daScheda } = domande(r), { corr } = controlla(qs, conAvvisi, problemiCit(r, qs));
      const casella = h('input', { type: 'checkbox', checked: conAvvisi || undefined }) as HTMLInputElement;
      casella.addEventListener('change', () => { conAvvisi = casella.checked; vai(5); });
      function applica(t: string): void {
        const lp = DiagnosiQuiz.leggiPatch(t);
        if ('errore' in lp) { avviso('⛔ ' + lp.errore, 6000); return; }
        const ap = DiagnosiQuiz.applicaPatch(qs, lp.patch, corr.autorizzate);
        salvaDomande(r, ap.qs, daScheda);
        const dopo = controlla(ap.qs as DomAI[], false, problemiCit(r, ap.qs as DomAI[])), resta = dopo.corr.nDomande;
        salva({ ...r, esiti: { ...(r.esiti || {}), controllato: true, daCorreggere: resta } });
        const righe = ['🩹 Patch applicate a ' + ap.n + (ap.n === 1 ? ' domanda' : ' domande') + '.',
          ...(ap.mancanti.length ? ['⚠️ Id non trovati: ' + ap.mancanti.join(', ')] : []),
          ...(ap.rifiutate.length ? ['⛔ Patch rifiutate: ' + ap.rifiutate.join('; ')] : []),
          resta ? '⛔ Restano ' + resta + ' domande da correggere: ecco il nuovo prompt.' : '✅ Ricontrollo superato: nessuna domanda da correggere.'];
        nota = notaDi(righe);
        vai(resta ? 5 : 6);
      }
      return h('div.centro-passo-corpo', null,
        h('p.piccolo.tenue', null, '1) Copia il prompt di correzione nella stessa chat: l\'AI rimanda solo i campi da rifare. 2) Incolla le patch: l\'app le applica e ricontrolla.'),
        h('label.riga-tra.piccolo', null, 'Chiedi di correggere anche gli avvisi', casella),
        h('p.piccolo', null, h('b', null, corr.nDomande + (corr.nDomande === 1 ? ' domanda' : ' domande')), ' nel prompt'),
        ...copiabile(corr.testo, 'Prompt di correzione da copiare nell\'AI', '📋 Copia il prompt di correzione'),
        corr.manuali.length ? h('p.piccolo', null, '✋ Da sistemare a mano: ' + corr.manuali.map(p => p.id + ' — ' + p.msg).join('; ')) : null,
        corr.globali.length ? h('p.piccolo', null, '⚠️ Squilibri d\'insieme (non si correggono con patch): ' + corr.globali.slice(0, 5).map(p => p.id + ' — ' + p.msg).join('; ')) : null,
        h('h3.centro-sotto', null, 'Patch dell\'AI'),
        rispostaAI('Patch JSON dell\'AI', 'Incolla qui le patch ([{"id":"…","campo":"…"}])…', '🩹 Applica le patch', applica),
        h('div.chips', null,
          h('button.chip', { type: 'button', onclick: ricontrolla }, '🔁 Ricontrolla'),
          h('button.chip', { type: 'button', 'aria-label': 'Prosegui senza correggere: le domande bloccate non si importano',
            onclick: () => { salva({ ...r, esiti: { ...(r.esiti || {}), controllato: true, daCorreggere: 0 } }); vai(6); } }, '⏭ Prosegui senza correggere')));
    }

    // ---------- Passo 6: Prova (quiz in app senza statistiche) ----------
    const provate = new Set<number>();
    /** Una scheda → domande del quiz in app (le bloccate restano fuori, come all'import). */
    function domandeProva(r: CreazioneRec, n: number): { lista: DomB[]; escluse: number } {
      const p = parteDi(r, n), qs = p ? p.quiz : [], sk = 'prova-' + pref(r) + '-s' + n;
      const lista = qs.map(q => ImportaDrive.domanda(q as QuizDrive, sk, pref(r))).filter((d): d is DomB => !!d);
      return { lista, escluse: qs.length - lista.length };
    }
    function prova(r: CreazioneRec, n: number): void {
      const { lista } = domandeProva(r, n), p = (r.piano as PianoCentro).schede.find(x => x.n === n);
      if (!lista.length) { avviso('Nessuna domanda valida da provare in ' + sig(n) + '.'); return; }
      const pk = { tipo: 'step', id: 'prova', step: 0, titolo: '', aggiornato: '', risorse: { libri: {}, quiz: {} }, materie: [] } as unknown as PkStep;
      const s = { id: 'prova-' + pref(r) + '-s' + n, k: n, n: (r.schede || []).length, titolo: 'Prova ' + sig(n), tipo: 'P', problemi: false, pagine: '', quizFile: '' } as SchedaS;
      provate.add(n);
      fg.chiudi();                                           // il visore del quiz sta sotto ai fogli: il Centro si chiude e si riapre al passo 6
      QuizApp.apri(pk, r.materia, p ? p.micro[0] : r.step, s, () => lista, { occh: '🧪 Prova · ' + r.nomeMateria + ' ' + r.step + ' · ' + sig(n) + ' · senza statistiche',
        titolo: 'Prova della scheda ' + sig(n), prova: true, chiudi: () => { apriFoglio(); vai(6); } });
    }
    function passoProva(): HTMLElement {
      const r = rec!, sc = r.schede || [], piano = r.piano as PianoCentro;
      const lista = h('ol.centro-schede', { 'aria-label': 'Schede da provare' }, ...sc.map(x => {
        const p = piano.schede.find(y => y.n === x.n), { lista: l, escluse } = domandeProva(r, x.n);
        return h('li.riga-tra', null,
          h('span', null, (provate.has(x.n) ? '🧪 ' : simbolo(x) + ' '), h('b', null, sig(x.n)),
            h('span.piccolo.tenue', null, ' ' + (p ? p.micro[0] : '') + ' · ' + l.length + ' domande' + (escluse ? ' (' + escluse + ' bloccate escluse)' : '') + (provate.has(x.n) ? ' · provata' : ''))),
          h('button.chip', { type: 'button', 'aria-label': 'Prova la scheda ' + sig(x.n) + ' nel quiz in app', disabled: l.length ? undefined : true, onclick: () => prova(r, x.n) }, '▶ Prova la scheda'));
      }));
      const avanti = () => { salva({ ...r, esiti: { ...(r.esiti || {}), provato: true } }); vai(7); };
      return h('div.centro-passo-corpo', null,
        h('p.piccolo.tenue', null, 'Fai il quiz di una scheda come lo vedrà lo studente. È una prova: non salva statistiche, ripassi né flashcard.'),
        lista,
        h('div.chips', null,
          h('button.btn', { type: 'button', onclick: avanti }, provate.size ? 'Avanti: Importa →' : 'Salta la prova: Importa →'),
          h('button.chip', { type: 'button', onclick: () => vai(4) }, '🔁 Torna al controllo')));
    }

    // ---------- Passo 7: Importa (stessa pipeline dell'import: raggruppa → filtra → traduci → salva) ----------
    const CARTELLA = '🏗️ Centro di creazione';
    /** Le schede arrivate come «parti» + la chiusura scritta dall'app dal piano approvato (mai dall'AI). */
    function letture(r: CreazioneRec): FileQuizLetto[] {
      const step = pref(r), quando = (n: number) => new Date(n || 0).toISOString();
      const parti = (r.schede || []).filter(x => x.stato !== 'da-fare').map(x => parteDi(r, x.n)).filter((p): p is ParteQRec => !!p)
        .map(p => ({ id: p.id, name: p.parte + '.json', cartella: CARTELLA, modificato: quando(p.updatedAt), tipo: 'parte' as TipoFileQuiz, step, json: { parte: p.parte, quiz: p.quiz } as unknown as PacchettoDrive }));
      const ch = Centro.chiusura(r.piano as PianoCentro, { materia: r.nomeMateria, codice: r.materia, step: r.step, titolo: r.titolo, data: r.data, archetipo: Dominio.archetipoMateria(r.materia), perScheda: PER() });
      return [...parti, { id: 'chi-' + r.id, name: step + '-chiusura.json', cartella: CARTELLA, modificato: '', tipo: 'chiusura', step, json: ch }];
    }
    function passoImporta(): HTMLElement {
      const r = rec!, g = ImportaParti.raggruppa(letture(r)).find(x => x.tipo === 'parti');
      const esito = h('div.centro-nota', { role: 'status', hidden: true }), zona = h('div');
      if (!g) return h('div.centro-passo-corpo', null, h('p.piccolo', null, 'Nessuna scheda arrivata da importare.'), h('button.chip', { type: 'button', onclick: () => vai(3) }, '← Torna ai quiz'));
      const [cart] = Centro.albero([g]), st = cart.steps[0];
      const spunte: { n: string; el: HTMLInputElement; schede: number; domande: number }[] = [];
      const conta = h('p.piccolo', { 'aria-live': 'polite' }), tutto = h('input', { type: 'checkbox', 'aria-label': 'Tutto lo step ' + st.sotto }) as HTMLInputElement;
      const vaiBtn = h('button.btn', { type: 'button' }, 'Avanti: dove lo metto? →') as HTMLButtonElement;
      const scelti = () => spunte.filter(x => x.el.checked);
      function aggiorna(): void {
        const sel = scelti(), sch = sel.reduce((a, x) => a + x.schede, 0), dom = sel.reduce((a, x) => a + x.domande, 0);
        tutto.checked = sel.length === spunte.length; tutto.indeterminate = sel.length > 0 && sel.length < spunte.length;
        conta.textContent = sel.length ? 'Selezionati: ' + sel.length + ' microstep · ' + sch + (sch === 1 ? ' scheda' : ' schede') + ' · ' + dom + ' domande' : 'Seleziona almeno un microstep.';
        vaiBtn.disabled = !sel.length; svuota(zona);
      }
      const voci = st.microstep.map(m => {
        const el = h('input', { type: 'checkbox', 'aria-label': 'Microstep ' + m.n }) as HTMLInputElement;
        el.checked = true; el.addEventListener('change', aggiorna);
        spunte.push({ n: m.n, el, schede: m.schede.length, domande: m.domande });
        return h('li', null, h('label', null, el, ' ' + m.n + ' ', h('span.piccolo.tenue', null, m.schede.map(sig).join(', ') + ' · ' + m.domande + ' domande')));
      });
      tutto.checked = true;
      tutto.addEventListener('change', () => { for (const x of spunte) x.el.checked = tutto.checked; aggiorna(); });
      vaiBtn.addEventListener('click', () => {
        const u = ImportaParti.unisci(g), pk = Centro.filtra(u.pacchetto, scelti().map(x => x.n));
        const rapporto = ImportaParti.valida(pk, { bloccanti: u.bloccanti, duplicati: u.duplicati, completo: true });
        let t: TraduzioneDrive;
        try { t = ImportaDrive.traduci(pk); } catch (e) { esito.hidden = false; esito.textContent = '✗ ' + (e as Error).message; return; }
        const prima = Stato.prendi<InnestoRec>('inn-' + t.k);
        svuota(zona);
        zona.appendChild(ImportaDrive.pannelloScelta(t.k, t.nome + ' ' + t.sotto + ' · ' + t.titolo, ImportaDrive.proponi(t), prima ? { corso: prima.corso, piano: prima.piano, data: prima.data } : null, prima ? 'Reimporta' : 'Inserisci', sc => {
          const inn = ImportaDrive.salva(t, sc, CARTELLA, { accumula: true, rapporto });
          salva({ ...r, esiti: { ...(r.esiti || {}), importato: true } });
          svuota(zona); esito.hidden = false; svuota(esito);
          const ns = t.sub.microstep.reduce((a, m) => a + m.schede.length, 0);
          esito.append(h('p', null, '✓ ' + t.domande + ' domande · ' + ns + (ns === 1 ? ' scheda' : ' schede') + ' nei tuoi programmi (' + inn.k + ').'),
            h('p.piccolo.tenue', null, prima ? 'Reimport: aggiornate le schede già presenti, nessun doppione.' : 'Le trovi in Oggi e in «Studia ora» nel giorno scelto.'),
            h('button.chip', { type: 'button', onclick: () => { fg.chiudi(); vaiScheda('oggi'); } }, '📅 Vai a Oggi'));
        }));
        const b = zona.querySelector<HTMLElement>('select, button'); if (b) b.focus({ preventScroll: true });
      });
      aggiorna();
      return h('div.centro-passo-corpo', null,
        h('p.piccolo.tenue', null, 'Scegli cosa importare. Il file di chiusura (sotto-schede, ripassi +1/+3/+7 g, durata) lo scrive l\'app dal piano approvato.'),
        h('ul.centro-albero', { 'aria-label': 'Cosa importare' },
          h('li', null, h('span.piccolo.tenue', null, '📁 ' + cart.cartella),
            h('ul', null, h('li', null, h('label.forte', null, tutto, ' ' + r.nomeMateria + ' ' + st.sotto + ' ', h('span.piccolo.tenue', null, st.schede + ' schede · ' + st.domande + ' domande')),
              h('ul', null, ...voci))))),
        st.errore ? h('p.piccolo', null, '⚠️ ' + st.errore) : null,
        conta, h('div.chips', null, vaiBtn, h('button.chip', { type: 'button', onclick: () => vai(6) }, '← Torna alla prova')), zona, esito);
    }

    /** Impostazioni del Centro: fonti escluse (una per riga), usate dai prompt e dalla raccolta fonti. */
    function impostazioni(): HTMLElement {
      const ta = h('textarea', { rows: 4, 'aria-label': 'Fonti escluse, una per riga' }) as HTMLTextAreaElement;
      const stato = h('p.piccolo.tenue', { role: 'status' });
      const carica = () => { ta.value = StrumentiQuiz.esclusi().join('\n'); };
      carica();
      return h('div', null, QuoteUI.pannello(), h('details.centro-impostazioni', null, h('summary.piccolo', null, '⚙️ Impostazioni del Centro'),
        h('p.piccolo.tenue', null, 'Fonti escluse (eserciziari commerciali): l\'AI non deve usarle e i file con questi nomi non entrano tra le fonti. Una per riga.'),
        ta, h('div.chips', null,
          h('button.chip', { type: 'button', onclick: () => { StrumentiQuiz.salvaEsclusi(ta.value.split('\n')); carica(); stato.textContent = '✓ Lista salvata (' + StrumentiQuiz.esclusi().length + ').'; } }, '💾 Salva lista'),
          h('button.chip', { type: 'button', onclick: () => { StrumentiQuiz.salvaEsclusi(null); carica(); stato.textContent = 'Ripristinata la lista predefinita.'; } }, '↺ Predefiniti')),
        stato));
    }

    const corpo = h('div.centro', null, h('div.riga-tra', null, indicatore, indietro), zona, impostazioni());
    let fg: { chiudi: () => void } = { chiudi: () => undefined };
    const apriFoglio = () => { fg = foglio({ titolo: '🏗️ Centro di creazione', corpo }); };
    apriFoglio();
    vai(passo);
  }

  return { apri };
})();
