// ============================================================
// v0.58.3 — Quiz da Drive A PARTI + controllo qualità locale (zero token).
//   Gemini consegna uno step in più file nella stessa cartella «… quiz»:
//     parte    { "parte": "<materia>-<step>-s<n>-<m>", "quiz": [...] }          (2 schede = 36 domande)
//     chiusura { meta, programmaCalendario, conteggi }  (meta.stepId + pianoStrutturato, senza «quiz»; nome libero)
//   Il tipo si riconosce dal CONTENUTO, non dal nome. Le parti dello stesso stepId diventano UNA voce;
//   unisci() le fonde in un pacchetto unico che ImportaDrive.traduci() legge come un file intero.
//   Duplicati tra parti: vince il file più recente (segnalato). Duplicati nella stessa parte, opzioni ≠ 4,
//   esatta fuori 0..3: BLOCCANTI, saltano solo quella domanda. JSON illeggibile: salta solo quella parte.
//   valida(): avvisi su distribuzioni (livelli, posizione dell'esatta, corretta più lunga, gemelle, fonti).
//   Modulo puro (nessun DOM, nessun Drive): testato nella suite Node insieme a 07-importadrive.ts.
// ============================================================

type TipoFileQuiz = 'intero' | 'parte' | 'chiusura' | 'ignoto';
/** Un .json delle cartelle «… quiz», già scaricato e riconosciuto. */
interface FileQuizLetto { id: string; name: string; cartella: string; modificato: string; tipo: TipoFileQuiz; step: string; json: PacchettoDrive | null; errore?: string; }
/** Una voce dell'elenco: un file intero oppure le parti (+ chiusura) di uno step. */
interface GruppoQuiz { chiave: string; step: string; tipo: 'intero' | 'parti'; files: FileQuizLetto[]; parti: FileQuizLetto[]; chiusura: FileQuizLetto | null;
  schede: number[]; totaleSchede: number; domande: number; domandeAttese: number; mancanti: number[]; partiAttese: number; stato: 'completo' | 'mancano' | 'senza-chiusura'; }
interface RapportoQuiz { bloccanti: string[]; avvisi: string[]; righe: string[]; }

const ImportaParti = (() => {
  const s = (x: unknown) => typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim();
  const ogg = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  /** «biologia-3.3-S05», «S5», 5 → 5 (0 se manca). */
  const numScheda = (x: unknown): number => { const v = s(x), m = /(?:^|[^A-Za-z0-9])S(\d+)$/i.exec(v) || /^S?(\d+)$/i.exec(v); return m ? Number(m[1]) : 0; };
  /** «biologia-3.3-s1-2» → { step: 'biologia-3.3', da: 1, a: 2 }. */
  function nomeParte(p: string): { step: string; da: number; a: number } | null {
    const m = /^(.+?)-s(\d+)(?:-(\d+))?$/i.exec(s(p)); if (!m) return null;
    const da = Number(m[2]), a = Number(m[3] || m[2]);
    return { step: m[1], da: Math.min(da, a), a: Math.max(da, a) };
  }
  function classifica(j: unknown): TipoFileQuiz {
    if (!ogg(j)) return 'ignoto';
    const quiz = Array.isArray(j.quiz);
    if (s(j.parte) && quiz) return 'parte';
    if (quiz) return 'intero';
    const meta = ogg(j.meta) ? j.meta : {}, pc = ogg(j.programmaCalendario) ? j.programmaCalendario : {};
    if (s(meta.stepId) && ogg(pc.pianoStrutturato)) return 'chiusura';
    return 'ignoto';
  }
  /** Lo stepId («biologia-3.3»): dal meta, dal nome della parte o dalla prima domanda. */
  function stepDi(j: PacchettoDrive & { parte?: string }): string {
    const m = j.meta || {};
    if (s(m.stepId)) return s(m.stepId).toLowerCase();
    const np = nomeParte(s(j.parte)); if (np) return np.step.toLowerCase();
    const q = (Array.isArray(j.quiz) ? j.quiz : []).find(x => x && s(x.stepId));
    if (q) return s(q.stepId).toLowerCase();
    return s(m.sottoStep) ? (s(m.materia) || s(m.codiceMateria)).toLowerCase() + '-' + s(m.sottoStep) : '';
  }
  const piuVecchio = (a: FileQuizLetto, b: FileQuizLetto) => (a.modificato < b.modificato ? -1 : a.modificato > b.modificato ? 1 : 0) || a.name.localeCompare(b.name, 'it', { numeric: true });

  /** File letti → voci dell'elenco. I file interi restano voci a sé; parti e chiusure si raggruppano per stepId. */
  function raggruppa(files: FileQuizLetto[]): GruppoQuiz[] {
    const out: GruppoQuiz[] = [], perStep = new Map<string, FileQuizLetto[]>();
    for (const f of files) {
      if (f.tipo === 'parte' || f.tipo === 'chiusura') { const l = perStep.get(f.step) || []; l.push(f); perStep.set(f.step, l); }
      else out.push({ chiave: 'f:' + f.id, step: f.step, tipo: 'intero', files: [f], parti: [], chiusura: null, schede: [], totaleSchede: 0, domande: (f.json && f.json.quiz || []).length, domandeAttese: 0, mancanti: [], partiAttese: 0, stato: 'completo' });
    }
    for (const [step, l] of perStep) {
      const parti = l.filter(f => f.tipo === 'parte').sort(piuVecchio), chiusure = l.filter(f => f.tipo === 'chiusura').sort(piuVecchio);
      const chiusura = chiusure.length ? chiusure[chiusure.length - 1] : null;
      const ids = new Set<string>(), sch = new Set<number>();
      let ampiezza = 0;
      for (const p of parti) {
        for (const q of (p.json && p.json.quiz) || []) { if (!q) continue; ids.add(s(q.id) || s(q.domanda)); const n = numScheda(q.scheda); if (n) sch.add(n); }
        const np = nomeParte(s((p.json as { parte?: string } | null)?.parte)); if (np) { ampiezza = Math.max(ampiezza, np.a - np.da + 1); if (!(p.json && p.json.quiz || []).some(q => q && numScheda(q.scheda))) for (let n = np.da; n <= np.a; n++) sch.add(n); }
      }
      const meta = (chiusura && chiusura.json && chiusura.json.meta) || {};
      const rip = ogg(meta.ripartizioneSchede) ? meta.ripartizioneSchede : {};
      const schede = [...sch].sort((a, b) => a - b), totale = Number(rip.totale) || 0;
      const mancanti: number[] = []; if (totale) for (let n = 1; n <= totale; n++) if (!sch.has(n)) mancanti.push(n);
      const domandeAttese = Number(meta.domandeTotali) || 0;
      const partiAttese = totale ? Math.ceil(totale / (ampiezza || 2)) : 0;
      const stato: GruppoQuiz['stato'] = !chiusura ? 'senza-chiusura' : mancanti.length || (domandeAttese && ids.size < domandeAttese) || !parti.length ? 'mancano' : 'completo';
      out.push({ chiave: 's:' + step, step, tipo: 'parti', files: [...parti, ...(chiusura ? [chiusura] : [])], parti, chiusura, schede, totaleSchede: totale || schede.length, domande: ids.size, domandeAttese, mancanti, partiAttese, stato });
    }
    return out;
  }

  /** Blocchi per una singola domanda (vuoto = valida). */
  function bloccantiDomanda(q: QuizDrive): string[] {
    const b: string[] = [], o = Array.isArray(q.opzioni) ? q.opzioni : [];
    if (!s(q.domanda)) b.push('testo mancante');
    if (o.length !== 4) b.push(o.length + ' opzioni invece di 4');
    const e = Number(q.esatta); if (!Number.isInteger(e) || e < 0 || e > 3 || e >= o.length) b.push('«esatta» fuori da 0..3');
    return b;
  }
  /**
   * Parti (+ chiusura) → un pacchetto unico come un file intero. Le parti si applicano dalla più vecchia alla
   * più recente: un id già visto viene sostituito (vince il più recente). Le domande bloccate non entrano.
   */
  function unisci(g: GruppoQuiz): { pacchetto: PacchettoDrive; duplicati: string[]; bloccanti: string[] } {
    const perId = new Map<string, QuizDrive>(), duplicati: string[] = [], bloccanti: string[] = [];
    const fonti = g.tipo === 'intero' ? g.files : g.parti;
    for (const f of fonti) {
      if (!f.json) { bloccanti.push(f.name + ': ' + (f.errore || 'JSON non valido') + ' — parte saltata'); continue; }
      const visti = new Set<string>();
      (f.json.quiz || []).forEach((q, i) => {
        if (!q || typeof q !== 'object') { bloccanti.push(f.name + ' #' + (i + 1) + ': non è una domanda'); return; }
        const id = s(q.id) || f.id + '#' + i;
        if (visti.has(id)) { bloccanti.push(f.name + ': id ' + id + ' ripetuto nello stesso file — saltato'); return; }
        visti.add(id);
        const b = bloccantiDomanda(q); if (b.length) { bloccanti.push(f.name + ' · ' + id + ': ' + b.join(', ')); return; }
        if (perId.has(id)) duplicati.push(id + ' (vince ' + f.name + ')');
        perId.set(id, q);
      });
    }
    const base: PacchettoDrive = g.chiusura && g.chiusura.json ? g.chiusura.json : g.tipo === 'intero' && g.files[0].json ? g.files[0].json : {};
    const meta = { ...(base.meta || {}) };
    if (!s(meta.stepId) && !s(meta.sottoStep)) meta.stepId = g.step;
    if (!s(meta.materia) && !s(meta.codiceMateria)) meta.materia = g.step.replace(/-[\d.]+$/, '');
    return { pacchetto: { ...base, meta, quiz: [...perId.values()] }, duplicati, bloccanti };
  }

  const pct = (n: number, tot: number) => tot ? Math.round(n * 100 / tot) : 0;
  const LIV_ATTESI = [25, 35, 25, 15];
  const livelloDi = (q: QuizDrive) => { const n = Number(s(q.livelloCognitivo).replace(/^L/i, '')) || Number(s(q.livello).replace(/^L/i, '')); return n >= 1 && n <= 4 ? n : 0; };
  /** Controllo qualità locale (zero token): gli avvisi non bloccano, si vedono prima di «Importa» e restano nel rapporto. */
  function valida(p: PacchettoDrive, extra: { bloccanti?: string[]; duplicati?: string[]; completo?: boolean } = {}): RapportoQuiz {
    const quiz = (p.quiz || []).filter(q => q && typeof q === 'object'), tot = quiz.length;
    const bloccanti = (extra.bloccanti || []).slice(), avvisi: string[] = [], righe: string[] = [];
    if (extra.duplicati && extra.duplicati.length) avvisi.push(extra.duplicati.length + ' domande ripetute tra parti: tengo la più recente (' + extra.duplicati.slice(0, 3).join('; ') + (extra.duplicati.length > 3 ? '…' : '') + ')');
    if (!tot) return { bloccanti, avvisi, righe: ['Nessuna domanda valida'] };
    // schede
    const perScheda = new Map<number, number>(); for (const q of quiz) { const n = numScheda(q.scheda); if (n) perScheda.set(n, (perScheda.get(n) || 0) + 1); }
    if (perScheda.size) {
      const storte = [...perScheda].filter(([, c]) => c !== 18).sort((a, b) => a[0] - b[0]);
      righe.push(perScheda.size + ' schede · ' + tot + ' domande');
      if (storte.length) avvisi.push('Schede con domande ≠ 18: ' + storte.slice(0, 6).map(([n, c]) => 'S' + String(n).padStart(2, '0') + '=' + c).join(', ') + (storte.length > 6 ? '…' : ''));
      if (extra.completo !== false && (perScheda.size < 18 || perScheda.size > 25)) avvisi.push(perScheda.size + ' schede nello step (attese 18–25)');
    } else righe.push(tot + ' domande');
    // livelli
    const liv = [0, 0, 0, 0]; for (const q of quiz) { const l = livelloDi(q); if (l) liv[l - 1]++; }
    const lp = liv.map(n => pct(n, tot));
    righe.push('Livelli L1–L4: ' + lp.join('/') + '% (attesi 25/35/25/15)');
    if (lp.some((x, i) => Math.abs(x - LIV_ATTESI[i]) > 3)) avvisi.push('Livelli fuori soglia (±3): ' + lp.join('/') + '% invece di 25/35/25/15');
    // posizione dell'esatta e corretta più lunga
    const pos = [0, 0, 0, 0]; let lunga = 0;
    for (const q of quiz) {
      const e = Number(q.esatta), o = (q.opzioni || []).map(x => s(x).length);
      if (e >= 0 && e <= 3) pos[e]++;
      if (o.length > 1 && o.every((l, i) => i === e || l < o[e])) lunga++;
    }
    const pp = pos.map(n => pct(n, tot));
    righe.push('Esatta in A/B/C/D: ' + pp.join('/') + '% · corretta più lunga: ' + pct(lunga, tot) + '%');
    if (pp.some(x => Math.abs(x - 25) > 10)) avvisi.push('Posizione dell\'esatta sbilanciata: ' + pp.join('/') + '% (attesa ~25% ciascuna)');
    if (pct(lunga, tot) > 25) avvisi.push('La corretta è la più lunga nel ' + pct(lunga, tot) + '% delle domande (attesa ≤ 25%): si indovina dalla lunghezza');
    // coppie gemelle
    const gem = new Map<string, number>(); for (const q of quiz) { const g = s(q.coppiaGemellaId); if (g) gem.set(g, (gem.get(g) || 0) + 1); }
    const coppie = [...gem.values()].filter(n => n >= 2).length, sole = [...gem].filter(([, n]) => n < 2).map(([g]) => g);
    const schede = perScheda.size || Math.ceil(tot / 18), attese = Math.floor(schede / 3);
    righe.push('Coppie gemelle complete: ' + coppie);
    if (coppie < attese) avvisi.push('Coppie gemelle: ' + coppie + ' (attese ≥ ' + attese + ', una ogni 3 schede)');
    if (sole.length) avvisi.push(sole.length + ' gemelle senza l\'altra metà: ' + sole.slice(0, 3).join(', ') + (sole.length > 3 ? '…' : ''));
    // campi
    const senzaErrore = quiz.filter(q => !s(q.erroreTipico)).length;
    if (senzaErrore) avvisi.push(senzaErrore + ' domande senza «erroreTipico»');
    const conSd = quiz.filter(q => q.spiegazioneDistrattori !== undefined);
    const sdStorte = (conSd.length || perScheda.size ? quiz : []).filter(q => !(Array.isArray(q.spiegazioneDistrattori) && q.spiegazioneDistrattori.length === 3)).length;
    if (sdStorte) avvisi.push(sdStorte + ' domande senza 3 «spiegazioneDistrattori»');
    const daVerificare = quiz.filter(q => /da verificare|p\.\s*_{2,}/i.test(s(q.fonte))).length;
    if (daVerificare) avvisi.push(daVerificare + ' fonti «da verificare» o senza pagina');
    // ripassi e durate (chiusura)
    const ps = (p.programmaCalendario && p.programmaCalendario.pianoStrutturato) || {};
    const brac = (Array.isArray(ps.sottoSchede) ? ps.sottoSchede : Array.isArray(p.sottoSchede) ? p.sottoSchede : []).map(x => Number(x && (x.durataBracMin || x.durataMin)) || 0).filter(Boolean);
    if (brac.some(m => m < 45 || m > 50)) avvisi.push('Blocchi di studio fuori 45–50 min (BRAC): ' + brac.filter(m => m < 45 || m > 50).join(', '));
    return { bloccanti, avvisi, righe };
  }

  return { classifica, stepDi, nomeParte, numScheda, raggruppa, unisci, valida, bloccantiDomanda };
})();
