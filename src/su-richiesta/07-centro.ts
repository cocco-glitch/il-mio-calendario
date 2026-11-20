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

  return { prefisso, nomeParte, daPiano, schede, chiusura, passoDi, prossimaScheda, albero, filtra };
})();
