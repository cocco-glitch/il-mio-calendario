// ============================================================
// v0.63 — «Centro di creazione»: logica pura (nessuno Stato, DOM, rete, data di sistema).
//   Confine AI/app: l'AI scrive solo contenuto (il piano: quali schede coprono quali microstep; il testo delle domande).
//   Qui l'app calcola tutto il resto: numerazione delle schede, id dell'app, nomi delle parti e il file di CHIUSURA
//   (sotto-schede, conteggi, durata, ripassi +1/+3/+7 g) nel formato che ImportaParti/ImportaDrive leggono già:
//   il Centro e «📥 Importa quiz» passano per la stessa pipeline.
//   Testato da test/centro.mjs.
// ============================================================

type CategoriaScheda = 'prioritaria' | 'raffinamento';
/** Una scheda del piano approvato: n = 1..N, micro[0] = microstep dell'app. */
interface SchedaCentro { n: number; micro: string[]; categoria: CategoriaScheda; blocco: string; }
/** Il piano di uno step dopo la lettura e le correzioni dell'app (modificabile in anteprima). */
interface PianoCentro { step: string; schede: SchedaCentro[]; blocchi: string[]; avvisi: string[]; }
interface OpzCentro { materia: string; codice: string; step: string; titolo?: string; unita?: string; archetipo?: string; data?: string; perScheda?: number; minBlocco?: number; }
interface SchedaApp { n: number; sigla: string; id: string; micro: string[]; categoria: CategoriaScheda; blocco: string; }
/** Una scheda nel flusso: ⏳ da fare, ✂️ interrotta (risposta troncata), ✅ arrivata. */
interface SchedaFlusso { n: number; stato: 'da-fare' | 'interrotta' | 'arrivata'; parteId?: string; }
/** Ciò che il record «creazione» salva per riprendere dal passo giusto (mai il testo delle risposte). */
interface StatoCreazione { materia?: string; step?: string; passo?: number; piano?: unknown; schede?: SchedaFlusso[];
  esiti?: { controllato?: boolean; daCorreggere?: number; provato?: boolean; importato?: boolean }; }
interface AlberoMicro { n: string; schede: number[]; domande: number; }
interface AlberoStep { chiave: string; step: string; sotto: string; stato: GruppoQuiz['stato']; schede: number; domande: number; microstep: AlberoMicro[]; errore?: string; }
interface AlberoCartella { cartella: string; steps: AlberoStep[]; }
/** Una riga dell'indice del libro (record `libro`): «3.3.1 Membrane» → pagina stampata 40. */
interface VoceIndice { capitolo: string; pagina: PaginaStampata; }
/** Le pagine di un microstep: stampate dall'indice, PDF dalla mappa (null se non note); stampA null = fino a fine libro. */
/** Record `libro` (v0.63.1): fonte delle pagine scelta per il libro; solo nomi dei PDF e misure, mai il PDF né il testo. */
interface LibroRec extends Rec {
  type: 'libro'; nome: string; materia: string; pdf: Array<{ nome: string; segmentoDa?: number }>;
  fonte: 'auto' | 'mano' | 'indice' | 'nessuna'; mappa: MappaPag | null; lettura?: LetturaPdfMP;
  ancore?: Array<{ stampata: PaginaStampata; pdf: number }>; indice?: VoceIndice[]; prova?: { quando: string; ok: number; tot: number };
  /** Ultima misura automatica (fonte A), tenuta anche quando lo studente sceglie B/C/D: ci si torna con «A». */
  misurata?: MappaPag | null;
}
interface PagineMicro { stampDa: PaginaStampata; stampA: PaginaStampata | null; pdfDa: number | null; pdfA: number | null; affidabilita: MappaPag['affidabilita']; }

const Centro = (() => {
  const s = (x: unknown) => typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim();
  const slug = (x: string) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '');
  const nelloStep = (m: string, step: string) => /^\d+(\.\d+)*$/.test(m) && m.startsWith(step + '.');
  const due = (n: number) => String(n).padStart(2, '0');

  /** «biologia-3.3»: lo stepId che l'import usa per raggruppare parti e chiusura. */
  const prefisso = (o: Pick<OpzCentro, 'materia' | 'step'>) => slug(o.materia) + '-' + s(o.step);
  /** Nome della parte che l'AI scrive nel JSON («biologia-3.3-s1-2»). */
  const nomeParte = (o: Pick<OpzCentro, 'materia' | 'step'>, da: number, a = da) => prefisso(o) + '-s' + da + (a !== da ? '-' + a : '');
  const codiceDi = (o: Pick<OpzCentro, 'codice'>) => s(o.codice).toUpperCase().replace(/[^A-Z]/g, '') || 'X';

  /**
   * Piano letto (Contratto.aPiano) → piano dello step. Tiene i blocchi dello step chiesto, mette ogni scheda in un
   * microstep valido (altrimenti <step>.1) e rinumera 1..N nell'ordine del piano se i numeri hanno doppi o buchi.
   */
  function daPiano(p: PianoV1, step: string): PianoCentro {
    step = s(step);
    const avvisi = [...(p.avvisi || [])], schede: SchedaCentro[] = [], blocchi: string[] = [], numeri: number[] = [];
    for (const b of p.blocchi || []) {
      const micro = b.copre.flatMap(c => c.micro);
      const dentro = b.codice === step || nelloStep(b.codice, step) || micro.some(m => nelloStep(m, step));
      if (!dentro) { avvisi.push('Blocco ' + b.codice + ' (' + b.titolo + ') non è dello step ' + step + ': ignorato'); continue; }
      blocchi.push(b.titolo);
      const cat: CategoriaScheda = /raffin/i.test(b.titolo) ? 'raffinamento' : 'prioritaria';
      for (const c of b.copre) {
        const validi = c.micro.filter(m => nelloStep(m, step)), fuori = c.micro.filter(m => !nelloStep(m, step));
        if (fuori.length) avvisi.push('Microstep fuori dallo step ' + step + ': ' + fuori.join(', ') + (validi.length ? '' : ' → scheda in ' + step + '.1'));
        for (const n of c.schede) { numeri.push(n); schede.push({ n, micro: validi.length ? validi : [step + '.1'], categoria: cat, blocco: b.titolo }); }
      }
    }
    if (numeri.some((n, i) => n !== i + 1)) {
      avvisi.push('Schede rinumerate 1–' + schede.length + ' nell\'ordine del piano (erano ' + numeri.map(n => 'S' + n).join(' ') + ')');
      schede.forEach((x, i) => { x.n = i + 1; });
    }
    if (!schede.length) avvisi.push('Nessuna scheda per lo step ' + step);
    return { step, schede, blocchi, avvisi };
  }

  /** Le schede come le vedrà l'app: sigla per l'AI (S01), id dell'app <COD>-<microstep>-<n> (stabile: dipende solo dal piano). */
  function schede(p: PianoCentro, o: Pick<OpzCentro, 'codice'>): SchedaApp[] {
    const cod = codiceDi(o);
    return p.schede.map(x => ({ n: x.n, sigla: 'S' + due(x.n), id: cod + '-' + x.micro[0] + '-' + x.n, micro: x.micro.slice(), categoria: x.categoria, blocco: x.blocco }));
  }

  /** «2026-11-25» → «25/11/2026» (la forma che ImportaDrive legge come data del pacchetto). */
  const dataBreve = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(d)); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };

  /** Divide `tot` minuti in parti proporzionali ai pesi; la somma resta esatta. */
  function ripartisci(tot: number, pesi: number[]): number[] {
    const somma = pesi.reduce((a, b) => a + b, 0) || 1;
    const out = pesi.map(p => Math.floor(tot * p / somma));
    let resto = tot - out.reduce((a, b) => a + b, 0);
    for (let i = 0; resto > 0 && out.length; i = (i + 1) % out.length, resto--) out[i]++;
    return out;
  }

  /** Il file di chiusura dello step, costruito dall'app dal piano approvato (l'AI non lo scrive più). */
  function chiusura(p: PianoCentro, o: OpzCentro): PacchettoDrive & { meta: Record<string, unknown> } {
    const pref = prefisso(o), cod = codiceDi(o), step = s(o.step) || p.step, per = o.perScheda || 18, minB = o.minBlocco || 50;
    const sigla = (n: number) => pref + '-S' + due(n);
    const perMicro = new Map<string, SchedaCentro[]>();
    for (const x of p.schede) { const l = perMicro.get(x.micro[0]) || []; l.push(x); perMicro.set(x.micro[0], l); }
    const nBlocchi = Math.max(1, p.blocchi.length), durata = nBlocchi * minB;
    const voci = [...perMicro.entries()], minuti = ripartisci(durata, voci.map(([, l]) => l.length));
    const sottoSchede = voci.map(([micro, l], i) => ({
      codice: micro, titolo: l[0].blocco || micro, microstep: [...new Set(l.flatMap(x => x.micro))], durataMin: minuti[i], wakefulRestMin: 12,
      schedePrioritarie: l.filter(x => x.categoria === 'prioritaria').map(x => sigla(x.n)), schedeRaffinamento: l.filter(x => x.categoria === 'raffinamento').map(x => sigla(x.n)),
    }));
    const prio = p.schede.filter(x => x.categoria === 'prioritaria').map(x => sigla(x.n)), raff = p.schede.filter(x => x.categoria === 'raffinamento').map(x => sigla(x.n));
    const tutte = p.schede.map(x => sigla(x.n)), base = prio.length ? prio : tutte;
    const titolo = s(o.titolo) || p.blocchi[0] || step, data = dataBreve(o.data || '');
    const programma: Record<string, unknown> = {};
    if (data) programma.formatoGeneraMjs = [cod + '|' + (s(o.unita) || 'UD' + step.split('.')[0]) + '|' + titolo + '|' + p.schede.length + '|' + step + '|' + data];
    programma.pianoStrutturato = {
      materiaCodice: cod, step, origine: 'ai_neuro', durataTotaleMin: durata, blocchiBRAC: nBlocchi, sottoSchede,
      ancoraggiRipassoFSRS: [{ intervallo: '+1g', target: base }, { intervallo: '+3g', target: base }, { intervallo: '+7g', target: raff.length ? raff : tutte }],
    };
    const meta: Record<string, unknown> = { schemaVersion: 2, origine: 'centro', materia: s(o.materia), codiceMateria: cod, unita: s(o.unita) || 'UD' + step.split('.')[0], stepId: pref, sottoStep: step, titolo,
      domandeTotali: p.schede.length * per, ripartizioneSchede: { totale: p.schede.length } };
    if (s(o.archetipo)) meta.archetipo = s(o.archetipo);
    return { meta, programmaCalendario: programma } as PacchettoDrive & { meta: Record<string, unknown> };
  }

  // ---------- stato del flusso (record «creazione») ----------
  const arrivata = (x: SchedaFlusso) => x.stato === 'arrivata';
  /** Il passo da cui riprendere (1 Obiettivo … 7 Importa), calcolato da ciò che è salvato. */
  function passoDi(r: StatoCreazione): number {
    if (!s(r.materia) || !s(r.step)) return 1;
    const sc = r.schede || [], e = r.esiti || {};
    if (!r.piano || !sc.length) return 2;
    if (!sc.every(arrivata)) return 3;
    if (!e.controllato) return 4;
    if ((e.daCorreggere || 0) > 0) return 5;
    return e.provato ? 7 : 6;
  }
  /** La prima scheda non arrivata (interrotta o da fare), 0 se sono tutte arrivate. */
  const prossimaScheda = (r: Pick<StatoCreazione, 'schede'>) => ((r.schede || []).filter(x => !arrivata(x)).sort((a, b) => a.n - b.n)[0] || { n: 0 }).n;

  // ---------- albero cartella → step → microstep e import selezionabile ----------
  const cmpNum = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
  const DATA_FISSA = '2000-01-01';   // traduci vuole un «oggi» solo per la data del pacchetto, che qui non serve

  /** Voci dell'import (ImportaParti.raggruppa) → albero. I microstep vengono da ImportaDrive.traduci: gli stessi dell'import. */
  function albero(gruppi: GruppoQuiz[]): AlberoCartella[] {
    const perCartella = new Map<string, AlberoStep[]>();
    for (const g of gruppi) {
      const cartella = (g.files[0] && g.files[0].cartella) || '';
      const st: AlberoStep = { chiave: g.chiave, step: g.step, sotto: '', stato: g.stato, schede: 0, domande: 0, microstep: [] };
      try {
        const tr = ImportaDrive.traduci(ImportaParti.unisci(g).pacchetto, DATA_FISSA), dom = new Map(tr.banche.map(b => [b.sk, b.domande.length] as [string, number]));
        st.sotto = tr.sotto; st.domande = tr.domande;
        st.microstep = tr.sub.microstep.map(m => ({ n: m.n, schede: m.schede.map(x => x.k), domande: m.schede.reduce((a, x) => a + (dom.get(x.id) || 0), 0) }));
        st.schede = st.microstep.reduce((a, m) => a + m.schede.length, 0);
      } catch (e) { st.errore = (e as Error).message; }
      const l = perCartella.get(cartella) || []; l.push(st); perCartella.set(cartella, l);
    }
    return [...perCartella.entries()].sort(([a], [b]) => a.localeCompare(b, 'it'))
      .map(([cartella, steps]) => ({ cartella, steps: steps.sort((a, b) => cmpNum(a.sotto, b.sotto) || a.step.localeCompare(b.step)) }));
  }

  /**
   * Pacchetto unito → solo i microstep scelti: domande, sotto-schede, durata, ripassi (bersagli rimasti; un ripasso
   * che resta senza bersagli si toglie). Gli id delle schede non cambiano (dipendono da numero e microstep). Non modifica `j`.
   */
  function filtra(j: PacchettoDrive, scelti: string[]): PacchettoDrive {
    const out = JSON.parse(JSON.stringify(j)) as PacchettoDrive, ok = new Set(scelti.map(s));
    const ps = (out.programmaCalendario && out.programmaCalendario.pianoStrutturato) || null;
    const quiz = Array.isArray(out.quiz) ? out.quiz : [], tieni = (x: SottoSchedaDrive) => ok.has(s(x.codice || x.sottoStep));
    const sez = (Array.isArray(out.sottoSchede) ? out.sottoSchede : ps && Array.isArray(ps.sottoSchede) ? ps.sottoSchede : []).filter(x => x && tieni(x));
    const ampliato = quiz.some(q => q && ImportaParti.numScheda(q.scheda));
    let resta: (q: QuizDrive) => boolean, bersaglio: ((t: string) => boolean) | null = null;
    if (ampliato) {
      const numeri = new Set<number>();
      for (const m of ImportaDrive.traduci(j, DATA_FISSA).sub.microstep) if (ok.has(m.n)) for (const x of m.schede) numeri.add(x.k);
      const primo = ImportaParti.numScheda((quiz.find(q => q && ImportaParti.numScheda(q.scheda)) || {}).scheda);
      resta = q => numeri.has(ImportaParti.numScheda(q.scheda) || primo);
      bersaglio = t => numeri.has(ImportaParti.numScheda(t));
    } else {
      const ids = new Set(sez.flatMap(x => [...(x.schedePrioritarie || []), ...(x.schedeRaffinamento || []), ...(x.rangeId || [])].map(s)));
      resta = q => ids.has(s(q.id)) || ok.has(s(q.sottoStep));
    }
    out.quiz = quiz.filter(q => q && resta(q));
    if (Array.isArray(out.sottoSchede)) out.sottoSchede = out.sottoSchede.filter(x => x && tieni(x));
    if (ps) {
      if (Array.isArray(ps.sottoSchede)) ps.sottoSchede = ps.sottoSchede.filter(x => x && tieni(x));
      const min = sez.reduce((a, x) => a + (Number(x.durataMin || x.durataBracMin) || 0), 0);
      if (min > 0) ps.durataTotaleMin = min;
      if (bersaglio && Array.isArray(ps.ancoraggiRipassoFSRS)) {
        const b = bersaglio;
        ps.ancoraggiRipassoFSRS = ps.ancoraggiRipassoFSRS.filter(a => a).map(a => Array.isArray(a.target) && a.target.length ? { ...a, target: a.target.filter(t => b(s(t))) } : a)
          .filter(a => !Array.isArray(a.target) || a.target.length);
      }
    }
    out.meta = { ...(out.meta || {}), domandeTotali: out.quiz.length };
    return out;
  }

  // ---------- pagine per microstep (indice del libro + mappa PDF) ----------
  const codiceVoce = (v: VoceIndice) => (/^\s*(\d+(?:\.\d+)*)/.exec(s(v.capitolo)) || ['', ''])[1];
  /** Intervallo di pagine stampate del microstep dall'indice (fino alla pagina prima della voce dopo); PDF dalla mappa. */
  function pagineMicrostep(indice: VoceIndice[], mappa: MappaPag | null, ms: string): PagineMicro | null {
    const voci = (indice || []).filter(v => v && codiceVoce(v)), i = voci.findIndex(v => codiceVoce(v) === s(ms));
    if (i < 0 || (mappa && mappa.fonte === 'nessuna')) return null;   // fonte D: si cita per capitolo/paragrafo
    const da = Number(voci[i].pagina), dopo = voci[i + 1] ? Number(voci[i + 1].pagina) : NaN;
    const a = dopo > da ? dopo - 1 : null;
    const m = mappa && mappa.tratti.length ? mappa : null;
    return { stampDa: da, stampA: a, pdfDa: m ? MappaPagine.aPdf(m, da) : null, pdfA: m && a !== null ? MappaPagine.aPdf(m, a) : null,
      affidabilita: m ? m.affidabilita : 'nessuna' };
  }

  // ---------- libri: fonte A automatica ----------
  /** Fonte A: 1° etichette del PDF (esatta), 2° numeri ai bordi di tutte le pagine, a tratti (stimata); se no null = «pagine non rilevate». */
  function mappaAuto(etichette: Array<string | null> | null, numeriPerPagina: number[][]): MappaPag | null {
    return (etichette && MappaPagine.daEtichette(etichette)) || MappaPagine.daStampati(numeriPerPagina || []);
  }

  /** L'affidabilità come la vede lo studente (sempre a schermo accanto al libro). */
  function descriviMappa(m: MappaPag | null): string {
    if (!m || (!m.tratti.length && m.fonte !== 'nessuna')) return '⚪ pagine non rilevate: indicale tu a mano (pagina del libro = pagina del PDF)';
    if (m.fonte === 'nessuna') return '⚪ senza numeri di pagina: si cita per capitolo e paragrafo';
    const n = m.tratti.length, tratti = n > 1 ? ', ' + n + ' tratti' : '';
    if (m.fonte === 'mano') return '🟢 pagine esatte (indicate a mano' + tratti + ')';
    if (m.fonte === 'auto-etichette') return '🟢 pagine esatte (etichette del PDF' + tratti + ')';
    return '🟡 pagine stimate dai numeri stampati' + (n > 1 ? ' (' + n + ' tratti)' : '') + ': controllale con la prova';
  }

  const slugLibro = (x: string) => String(x || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  /** «lib-biologia-campbell-biologia-2a-ed»: un record per libro e materia. */
  const idLibro = (materia: string, nome: string) => 'lib-' + slugLibro(materia) + '-' + slugLibro(nome);

  /**
   * Libro trovato/scelto (e magari appena misurato) → record `libro`. Solo nomi e misure: mai PDF né testo.
   * Una fonte scelta dallo studente (B a mano, C indice, D nessuna) vince sulla misura automatica; ancore, indice e prova restano.
   */
  function libroDa(materia: string, l: LibroMP, prec?: LibroRec | null): LibroRec {
    const base: LibroRec = prec && !prec.deleted ? { ...prec } : { id: idLibro(materia, l.nome), type: 'libro', updatedAt: 0, nome: l.nome, materia, pdf: [], fonte: 'auto', mappa: null };
    base.nome = l.nome; base.materia = materia;
    base.pdf = l.pdf.map(nome => { const sd = l.segmenti ? MasterPrompt.segmentoDa(nome) : null; return sd ? { nome, segmentoDa: sd } : { nome }; });
    if (l.lettura) base.lettura = l.lettura;
    // Una mappa «mano»/«nessuna» è la scelta dello studente tornata dal blocco Fonti, non una misura.
    const misuraNuova = l.mappa && l.mappa.fonte !== 'mano' && l.mappa.fonte !== 'nessuna' ? l.mappa : null;
    base.misurata = misuraNuova || misurataDi(base);
    if ((base.fonte === 'auto' || base.fonte === 'indice') && misuraNuova) base.mappa = misuraNuova;
    if (base.mappa === undefined) base.mappa = null;
    return base;
  }

  /** Mappe dei singoli PDF a segmenti («… 301-600.pdf» → base 300) → una mappa in pagine PDF assolute del libro. */
  function unisciSegmenti(segmenti: Array<{ mappa: MappaPag | null; base: number }>): MappaPag | null {
    const con = segmenti.filter(x => x.mappa && x.mappa.tratti.length) as Array<{ mappa: MappaPag; base: number }>;
    if (!con.length) return null;
    const tratti = con.flatMap(x => x.mappa.tratti.map(t => ({ pdfDa: t.pdfDa + x.base, pdfA: t.pdfA + x.base, stampDa: t.stampDa })));
    const stimata = con.some(x => x.mappa.affidabilita !== 'esatta');
    return { fonte: con.every(x => x.mappa.fonte === 'auto-etichette') ? 'auto-etichette' : 'auto-stampati', tratti, affidabilita: stimata ? 'stimata' : 'esatta' };
  }

  /** Fonte C: testo dell'indice del libro → voci «capitolo → pagina stampata» (lettore dell'indice del pianificatore, 0 token). */
  function indiceDa(testo: string): VoceIndice[] {
    return Pianificatore.righeIndice(testo).filter(v => v.pagina != null).map(v => ({ capitolo: v.num + ' ' + v.titolo, pagina: v.pagina! }));
  }

  /** Misura automatica del record; i record del T10 non la hanno a parte: era la mappa, se la fonte era A. */
  const misurataDi = (r: LibroRec): MappaPag | null => r.misurata !== undefined ? r.misurata : r.fonte === 'auto' ? r.mappa : null;

  /** Ancore B sopra la misura: ogni ancora apre un tratto esatto dal suo PDF fino alla fine del tratto che la contiene. */
  function applicaAncore(misurata: MappaPag | null, ancore: Array<{ stampata: PaginaStampata; pdf: number }>): MappaPag {
    if (!misurata || !misurata.tratti.length) return MappaPagine.daMano(ancore);
    let tratti = misurata.tratti.map(t => ({ ...t })).sort((a, b) => a.pdfDa - b.pdfDa);
    for (const a of [...ancore].sort((x, y) => x.pdf - y.pdf)) {
      const dentro = tratti.find(t => t.pdfDa <= a.pdf && a.pdf <= t.pdfA);
      const dopo = tratti.find(t => t.pdfDa > a.pdf);
      const fine = dentro ? dentro.pdfA : dopo ? dopo.pdfDa - 1 : MappaPagine.APERTO;
      if (dentro) dentro.pdfA = a.pdf - 1;
      tratti = tratti.filter(t => t.pdfA >= t.pdfDa);
      tratti.push({ pdfDa: a.pdf, pdfA: fine, stampDa: a.stampata });
      tratti.sort((x, y) => x.pdfDa - y.pdfDa);
    }
    return { fonte: 'mano', tratti, affidabilita: 'esatta' };
  }

  /** Mappa che conta per la fonte scelta: D senza numeri, B ancore sulla misura, A/C la misura. */
  function mappaDi(r: LibroRec): MappaPag | null {
    if (r.fonte === 'nessuna') return { fonte: 'nessuna', tratti: [], affidabilita: 'nessuna' };
    if (r.fonte === 'mano' && r.ancore && r.ancore.length) return applicaAncore(misurataDi(r), r.ancore);
    return misurataDi(r);
  }

  const numeroO = (x: PaginaStampata): PaginaStampata => typeof x === 'string' && /^\s*\d+\s*$/.test(x) ? Number(x) : typeof x === 'string' ? x.trim() : x;

  /** Fonte B: «la pagina PDF n porta stampato s» → ancora (una per PDF, l'ultima vince). Non modifica il record dato. */
  function conAncore(r: LibroRec, a: { stampata: PaginaStampata; pdf: number }): LibroRec {
    const ancora = { stampata: numeroO(a.stampata), pdf: a.pdf };
    const out: LibroRec = { ...r, misurata: misurataDi(r), ancore: [...(r.ancore || []).filter(x => x.pdf !== a.pdf), ancora].sort((x, y) => x.pdf - y.pdf), fonte: 'mano' };
    out.mappa = mappaDi(out);
    return out;
  }

  /** Selettore A–D: cambia fonte senza perdere ancore, indice e misura. */
  function conFonte(r: LibroRec, fonte: LibroRec['fonte']): LibroRec {
    const out: LibroRec = { ...r, misurata: misurataDi(r), fonte };
    out.mappa = mappaDi(out);
    return out;
  }

  /** Prova a 3 pagine: le risposte sbagliate diventano ancore B; l'esito «k/n» resta nel record. */
  function conProva(r: LibroRec, risposte: Array<{ pdf: number; stampata: PaginaStampata; letta: string }>, quando: string): LibroRec {
    const norma = (x: unknown) => String(x == null ? '' : x).trim().toLowerCase();
    let out: LibroRec = { ...r, misurata: misurataDi(r) };
    let ok = 0;
    for (const x of risposte) {
      if (norma(x.letta) === norma(x.stampata)) { ok++; continue; }
      if (norma(x.letta)) out = conAncore(out, { pdf: x.pdf, stampata: x.letta });
    }
    out.prova = { quando, ok, tot: risposte.length };
    return out;
  }

  /** Riga di stato del libro: fonte, mappa ed esito dell'ultima prova. */
  function descriviLibro(r: LibroRec): string {
    let s = r.fonte === 'indice' ? '📑 capitoli dall’indice · ' + (r.mappa ? descriviMappa(r.mappa) : '🟡 pagine stimate dall’indice (PDF non mappato)') : descriviMappa(r.mappa);
    if (r.prova) { const [a, m, g] = r.prova.quando.split('-'); s += ' · provata il ' + g + '/' + m + '/' + a + ': ' + r.prova.ok + '/' + r.prova.tot; }
    return s;
  }

  /** Pagine dei microstep per il prompt delle schede: primo libro della materia con un indice (fonte C), con la sua mappa. */
  function paginePer(libri: LibroRec[], micro: string[]): Record<string, PagineMicro> {
    const out: Record<string, PagineMicro> = {};
    for (const ms of micro) for (const l of libri) {
      if (!l || l.deleted || !l.indice || !l.indice.length) continue;
      const p = pagineMicrostep(l.indice, l.mappa, ms);
      if (p) { out[ms] = p; break; }
    }
    return out;
  }

  // ---------- T12: verifica delle citazioni sul testo del PDF ----------
  const VUOTE = new Set(['quale', 'quali', 'della', 'delle', 'degli', 'dello', 'nella', 'nelle', 'negli', 'nello', 'dalla', 'dalle', 'dagli', 'dallo',
    'sulla', 'sulle', 'sugli', 'sullo', 'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'quelli', 'quelle', 'viene', 'vengono', 'essere',
    'tramite', 'attraverso', 'durante', 'mentre', 'anche', 'ancora', 'sempre', 'perché', 'quando', 'quanto', 'quanti', 'seguenti', 'seguente',
    'corretta', 'corretto', 'affermazione', 'risposta', 'funzione', 'principale', 'rispetto', 'possono', 'perche']);
  /** Parole chiave di una domanda (domanda + risposta corretta): parole di 5+ lettere non vuote e sigle (ATP), senza doppioni, al massimo 8. */
  function paroleChiave(q: DomAI): string[] {
    const o = Array.isArray(q.opzioni) ? q.opzioni as unknown[] : [], e = q.esatta;
    const giusta = typeof e === 'number' && typeof o[e] === 'string' ? o[e] as string : '';
    const out: string[] = [];
    for (const w of (String(q.domanda || '') + ' ' + giusta).split(/[^\p{L}\p{N}]+/u)) {
      const l = w.toLowerCase();
      if (!(l.length >= 5 || /^\p{Lu}{2,}$/u.test(w)) || VUOTE.has(l) || out.includes(l)) continue;
      out.push(l);
      if (out.length === 8) break;
    }
    return out;
  }
  const verificabile = (m: MappaPag | null) => !!m && m.fonte !== 'nessuna' && m.tratti.length > 0;
  /** Pagine PDF da leggere (citata ±1) per verificare le citazioni: le chiede a MappaPagine.verifica con un testo sempre vuoto. */
  function pagineDaLeggere(qs: DomAI[], m: MappaPag | null): number[] {
    const pagine = new Set<number>();
    if (verificabile(m)) for (const q of qs) if (typeof q.fonte === 'string') MappaPagine.verifica(m, q.fonte, p => { pagine.add(p); return ''; }, ['x']);
    return [...pagine].filter(p => p > 0).sort((a, b) => a - b);
  }
  /** Cambia il numero di pagina dopo «p.»/«pp.» (solo la prima volta). */
  const cambiaPagina = (t: string, da: PaginaStampata, a: PaginaStampata) => t.replace(new RegExp('(\\bpp?\\.\\s*)' + String(da) + '\\b', 'i'), '$1' + String(a));
  /**
   * Citazione di ogni domanda ↔ testo della pagina (MappaPagine.verifica): ↔ si corregge da sola in fonte, sourceRef e [[…]] della spiegazione
   * (registrata), ⚠/✗ diventano problemi per il prompt di correzione, ❓ (pagina senza testo o non mappabile) si dichiara.
   */
  function verificaCitazioni(qs: DomAI[], m: MappaPag | null, testoPagina: (pdf: number) => string): { qs: DomAI[]; registro: string[]; problemi: ProblemaQ[]; ok: number; dubbi: string[] } {
    const out = { qs: [...qs], registro: [] as string[], problemi: [] as ProblemaQ[], ok: 0, dubbi: [] as string[] };
    if (!verificabile(m)) return out;
    qs.forEach((q, i) => {
      if (typeof q.fonte !== 'string' || !q.fonte.trim()) return;
      const id = String(q.id), v = MappaPagine.verifica(m, q.fonte, testoPagina, paroleChiave(q));
      const vecchia = (/\bpp?\.\s*(\d{1,5}|[ivxlcdm]+)\b/i.exec(q.fonte) || [])[1];
      if (v.esito === '✅') out.ok++;
      else if (v.esito === '❓') out.dubbi.push(id);
      else if (v.esito === '↔' && vecchia && v.pagina !== null) {
        const n: DomAI = { ...q, fonte: cambiaPagina(q.fonte, vecchia, v.pagina) };
        if (typeof q.sourceRef === 'string') n.sourceRef = cambiaPagina(q.sourceRef, vecchia, v.pagina);
        if (typeof q.spiegazione === 'string') n.spiegazione = q.spiegazione.replace(/\[\[[^\]]*\]\]/g, c => cambiaPagina(c, vecchia, v.pagina!));
        out.qs[i] = n;
        out.registro.push(id + ': p. ' + vecchia + ' → p. ' + v.pagina + ' (i concetti sono sulla pagina accanto)');
      } else out.problemi.push({ sev: 'err', id, msg: 'citazione p. ' + (vecchia || v.pagina) + ': ' + (v.esito === '⚠' ? 'sulla pagina solo parte dei concetti della domanda' : 'la pagina non contiene i concetti della domanda') });
    });
    return out;
  }

  // ---------- v0.64 T6: parti k/N di una scheda ----------
  /** Posizione di una domanda nella scheda, dal suffisso dell'ID assegnato dall'app (…-S01-07 → 7); 0 se non c'è. */
  const posizione = (q: DomAI) => { const m = /-(\d+)$/.exec(String(q.id || '')); return m ? Number(m[1]) : 0; };
  /** Unisce le domande di una parte a quelle già arrivate: stesso ID = sostituita (reimport senza doppioni), poi in ordine di posizione. */
  function unisciDomande(gia: DomAI[], nuove: DomAI[]): DomAI[] {
    const per = new Map<string, DomAI>();
    for (const q of [...gia, ...nuove]) per.set(String(q.id), q);
    return [...per.values()].sort((a, b) => posizione(a) - posizione(b));
  }
  /** Per ogni parte: true se tutte le posizioni da..a sono arrivate. */
  function partiIncollate(parti: ParteAI[], quiz: DomAI[]): boolean[] {
    const ci = new Set(quiz.map(posizione));
    return parti.map(p => { for (let k = p.da; k <= p.a; k++) if (!ci.has(k)) return false; return true; });
  }

  return { prefisso, nomeParte, unisciDomande, partiIncollate, daPiano, schede, chiusura, passoDi, prossimaScheda, albero, filtra, pagineMicrostep, mappaAuto, descriviMappa, idLibro, libroDa, unisciSegmenti, indiceDa, conAncore, conFonte, conProva, descriviLibro, paginePer, paroleChiave, pagineDaLeggere, verificaCitazioni };
})();
