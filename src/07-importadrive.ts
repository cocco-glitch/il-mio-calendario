// ============================================================
// v0.58.1 — «📥 Importa quiz da Drive»: elenca i .json delle cartelle «<materia> quiz» e traduce lo schema
// *_quiz_e_calendario.json (schemaVersion 2) in: un corso proprio (PkStep) con le schede del sotto-step,
// la Banca domande (record 'bancaimc', o[0] = risposta corretta) e un piano (PkPiano) che mette lo step
// in Oggi / Studia ora già da oggi, con i ripassi FSRS indicati dal pacchetto.
// Id deterministici: reimportare lo stesso file aggiorna, non duplica; i progressi stanno altrove e restano.
// ============================================================

/** Una domanda nello schema dei pacchetti Drive (campi in italiano). */
interface QuizDrive { id?: string; livelloCognitivo?: number; tipoItem?: string; domanda?: string; opzioni?: string[]; esatta?: number; spiegazione?: string; fonte?: string; erroreTipico?: string; }
interface SottoSchedaDrive { codice?: string; titolo?: string; durataMin?: number; schedePrioritarie?: string[]; schedeRaffinamento?: string[]; fonte?: string; }
interface PacchettoDrive {
  meta?: { materia?: string; codiceMateria?: string; unitaDidattica?: string; sottoStep?: string; titolo?: string };
  programmaCalendario?: { formatoGeneraMjs?: string[]; pianoStrutturato?: { durataTotaleMin?: number; sottoSchede?: SottoSchedaDrive[]; ancoraggiRipassoFSRS?: { intervallo?: string; target?: string[] }[] } };
  quiz?: QuizDrive[];
}
interface TraduzioneDrive { pk: PkStep; piano: PkPiano; banche: { sk: string; domande: DomB[] }[]; domande: number; scartate: number; }

const ImportaDrive = (() => {
  const s = (x: unknown) => typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim();
  const hash = (t: string) => { let x = 5381; for (let i = 0; i < t.length; i++) x = ((x << 5) + x + t.charCodeAt(i)) | 0; return (x >>> 0).toString(36); };
  const LV: Record<number, string> = { 1: 'Sbarramento', 2: 'Applicativo', 3: 'Applicativo', 4: 'Problema' };

  /** È un pacchetto quiz+calendario? (per nome o per contenuto) */
  const eNomeQuiz = (nome: string) => /_quiz_e_calendario\.json$/i.test(nome);
  function valida(j: PacchettoDrive): string {
    if (!j || typeof j !== 'object') return 'Il file non è un oggetto JSON.';
    if (!j.meta || !s(j.meta.sottoStep)) return 'Manca meta.sottoStep.';
    if (!/^\d+(\.\d+)*$/.test(s(j.meta.sottoStep))) return 'meta.sottoStep non valido: ' + s(j.meta.sottoStep);
    if (!Array.isArray(j.quiz) || !j.quiz.length) return 'Il pacchetto non contiene quiz.';
    return '';
  }
  /** domanda → q, opzioni → o (la corretta per prima), esatta → o[0], spiegazione → e, fonte → r. */
  function domanda(x: QuizDrive, sk: string, k: string): DomB | null {
    const opz = Array.isArray(x.opzioni) ? x.opzioni.map(s).filter(Boolean) : [];
    const es = Number(x.esatta);
    if (!s(x.domanda) || opz.length < 2 || !Number.isInteger(es) || es < 0 || es >= opz.length) return null;
    const bl = Number(x.livelloCognitivo);
    const d: DomB = { id: 'q-drv-' + (s(x.id) || hash(sk + '|' + s(x.domanda))), sk, t: 'mcq', lv: LV[bl] || 'Applicativo', q: s(x.domanda),
      o: [opz[es], ...opz.filter((_, i) => i !== es)], e: s(x.spiegazione), stepId: k };
    if (s(x.fonte)) d.r = s(x.fonte);
    if (bl >= 1 && bl <= 4) d.bloomLevel = bl as BloomN;
    return d;
  }
  const piuGiorni = (data: string, n: number) => { const d = new Date(data + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  /** «+1g», «+3 g», «+2s» (settimane) → giorni. */
  function giorniIntervallo(t: string): number { const m = /\+?\s*(\d+)\s*([gs])/i.exec(t); return m ? Number(m[1]) * (m[2].toLowerCase() === 's' ? 7 : 1) : 0; }

  /** Traduzione pura (nessun salvataggio): testata nella suite Node. */
  function traduci(j: PacchettoDrive, oggiK = ymd(oggi())): TraduzioneDrive {
    const err = valida(j); if (err) throw new Error(err);
    const meta = j.meta!, sotto = s(meta.sottoStep);
    const cod = (s(meta.codiceMateria).toUpperCase().replace(/[^A-Z]/g, '') || 'X');
    const nome = s(meta.materia) || cod, titolo = s(meta.titolo) || sotto, k = cod + sotto;
    const ps = (j.programmaCalendario && j.programmaCalendario.pianoStrutturato) || {};
    const quiz = (j.quiz || []).filter(q => q && typeof q === 'object');
    const perId = new Map(quiz.map((q, i) => [s(q.id) || '#' + i, q] as [string, QuizDrive]));
    const usate = new Set<string>(), banche: { sk: string; domande: DomB[] }[] = [];
    let nd = 0, scart = 0;
    const raccogli = (ids: string[], sk: string): DomB[] => {
      const out: DomB[] = [];
      for (const id of ids) { const q = perId.get(id); if (!q || usate.has(id)) continue; usate.add(id); const d = domanda(q, sk, k); if (d) out.push(d); else scart++; }
      return out;
    };
    const sotSch = (Array.isArray(ps.sottoSchede) ? ps.sottoSchede : []).filter(x => x && s(x.codice));
    const micro: MicroS[] = [];
    sotSch.forEach(x => {
      const n = s(x.codice), schede: SchedaS[] = [];
      const p = raccogli((x.schedePrioritarie || []).map(s), cod + '-' + n + '-1');
      const r = raccogli((x.schedeRaffinamento || []).map(s), cod + '-' + n + '-2');
      const tit = s(x.titolo) || n;
      schede.push({ id: cod + '-' + n + '-1', k: 1, n: r.length ? 2 : 1, titolo: tit, tipo: 'P', problemi: false, pagine: '', quizFile: '' });
      if (r.length) schede.push({ id: cod + '-' + n + '-2', k: 2, n: 2, titolo: tit + ' · raffinamento', tipo: 'R', problemi: false, pagine: '', quizFile: '' });
      banche.push({ sk: cod + '-' + n + '-1', domande: p });
      if (r.length) banche.push({ sk: cod + '-' + n + '-2', domande: r });
      micro.push({ n, schede });
    });
    // domande non assegnate a nessuna sotto-scheda: nella prima scheda P (o in una scheda unica)
    const resto = [...perId.keys()].filter(id => !usate.has(id));
    if (resto.length) {
      if (!micro.length) { const n = sotto + '.1'; micro.push({ n, schede: [{ id: cod + '-' + n + '-1', k: 1, n: 1, titolo, tipo: 'P', problemi: false, pagine: '', quizFile: '' }] }); banche.push({ sk: cod + '-' + n + '-1', domande: [] }); }
      const b = banche[0]; b.domande.push(...raccogli(resto, b.sk));
    }
    const piene = banche.filter(b => b.domande.length);
    for (const b of piene) nd += b.domande.length;
    const pk: PkStep = { tipo: 'step', id: 'drv-' + cod.toLowerCase() + '-' + sotto, step: Number(sotto.split('.')[0]) || 0, titolo: nome + ' ' + sotto + ' · ' + titolo, aggiornato: oggiK, proprio: true,
      descrizione: 'Importato da Drive' + (s(meta.unitaDidattica) ? ' · ' + s(meta.unitaDidattica) : ''), risorse: { libri: {}, quiz: {} },
      materie: [{ m: cod, nome, libro: '', sottostep: [{ k, n: sotto, titolo, posizione: '', microstep: micro }] }] };
    // piano: lo step oggi (entra subito in Oggi / Studia ora), poi i ripassi FSRS del pacchetto
    const prevista = ((j.programmaCalendario && j.programmaCalendario.formatoGeneraMjs) || []).map(s).filter(Boolean)[0];
    const giorni = new Map<string, GiornoPiano>();
    const giorno = (d: string) => { let g = giorni.get(d); if (!g) { g = { data: d, voci: [] }; giorni.set(d, g); } return g; };
    giorno(oggiK).voci.push({ k, t: titolo, min: Number(ps.durataTotaleMin) || undefined });
    for (const a of Array.isArray(ps.ancoraggiRipassoFSRS) ? ps.ancoraggiRipassoFSRS : []) {
      const n = giorniIntervallo(s(a && a.intervallo)); if (!n) continue;
      const g = giorno(piuGiorni(oggiK, n));
      if (!g.voci.some(v => v.k === k)) g.voci.push({ k, t: '🔁 Ripasso ' + nome + ' ' + sotto + ' (' + s(a.intervallo) + ')', speciale: true, isRipassoFSRS: true });
    }
    const piano: PkPiano = { tipo: 'piano', id: 'drv-piano-' + cod.toLowerCase() + '-' + sotto, titolo: '📥 ' + nome + ' ' + sotto, aggiornato: oggiK, giorniTeoria: 0, proprio: true,
      nota: 'Quiz importati da Drive' + (prevista ? ' · data del pacchetto: ' + (prevista.split('|').pop() || '').trim() : ''),
      giorni: [...giorni.values()].sort((a, b) => a.data < b.data ? -1 : 1) };
    return { pk, piano, banche: piene, domande: nd, scartate: scart };
  }

  /** Salva la traduzione: corso proprio, banca domande (le banche vecchie del pacchetto spariscono), piano. */
  function salvaTraduzione(t: TraduzioneDrive): void {
    const idPk = t.pk.id, nuove = new Set(t.banche.map(b => b.sk));
    const vecchio = Studio.pkStep().find(p => p.id === idPk);
    if (vecchio) { const vs = vecchio.materie[0] && vecchio.materie[0].sottostep[0], ns = t.pk.materie[0].sottostep[0]; if (vs) { ns.svolto = vs.svolto; ns.data = vs.data; } }
    for (const b of t.banche) Stato.salva({ id: 'bq-' + b.sk, type: 'bancaimc', updatedAt: 0, sk: b.sk, pk: idPk, domande: b.domande } as BancaImcRec, true);
    for (const r of Stato.tutti<BancaImcRec>('bancaimc')) if (r.pk === idPk && !nuove.has(r.sk)) Stato.elimina(r.id);
    salvaPacchetto(t.pk);
    const r = Stato.rec.get('pk-' + t.piano.id) || { id: 'pk-' + t.piano.id, type: 'pacchetto', updatedAt: 0 } as Rec;
    r.contenuto = t.piano; r.deleted = false; Stato.salva(r);
    Stato.notifica();
  }

  interface FileDrive { id: string; name: string; cartella: string; }
  /** I .json nelle cartelle «… quiz» (biologia quiz, fisica quiz, chimica quiz…). */
  async function elenca(): Promise<FileDrive[]> {
    const cartelle = (await Drive.cercaCartelle('quiz')).filter(c => /(^|\s)quiz$/i.test(c.name.trim()));
    const out: FileDrive[] = [];
    for (const c of cartelle) for (const f of await Drive.elencaTutti(c.id)) if (/\.json$/i.test(f.name)) out.push({ id: f.id, name: f.name, cartella: c.name });
    return out.sort((a, b) => (Number(eNomeQuiz(b.name)) - Number(eNomeQuiz(a.name))) || a.name.localeCompare(b.name, 'it', { numeric: true }));
  }
  async function importaFile(f: FileDrive): Promise<TraduzioneDrive> {
    const j = JsonAI.leggiFile(await Drive.scaricaTesto(f.id)) as PacchettoDrive;
    const t = traduci(j); salvaTraduzione(t); return t;
  }

  /** Il foglio: elenco esplicito dei pacchetti trovati, un tocco per importarne uno. */
  function apri(): void {
    if (serveGoogle()) return;
    const stato = h('p.tenue', { role: 'status' }, 'Cerco le cartelle «… quiz» su Drive…');
    const lista = h('div.lista-drv');
    const f = foglio({ titolo: '📥 Importa quiz da Drive', corpo: h('div', null, stato, lista) });
    elenca().then(files => {
      if (!files.length) { stato.textContent = 'Nessun .json nelle cartelle «… quiz» del tuo Drive.'; return; }
      stato.textContent = files.length + (files.length === 1 ? ' pacchetto trovato' : ' pacchetti trovati') + '. Tocca «Importa»: entra nella coda di oggi.';
      for (const x of files) {
        const esito = h('div.tenue.piccolo');
        const btn = h('button.btn', { 'aria-label': 'Importa ' + x.name }, 'Importa') as HTMLButtonElement;
        btn.onclick = async () => {
          btn.disabled = true; esito.textContent = 'Importo…';
          try {
            const t = await importaFile(x);
            esito.textContent = '✓ ' + t.domande + ' domande in Banca' + (t.scartate ? ' (' + t.scartate + ' scartate)' : '') + ' · in coda oggi';
            btn.textContent = 'Reimporta'; btn.disabled = false;
            avviso('📥 ' + t.pk.titolo + ': ' + t.domande + ' domande, in Studia ora', 5000, () => { f.chiudi(); vai('oggi'); });
          } catch (e: unknown) {
            console.warn('ImportaDrive', x.name, e);
            esito.textContent = '✗ ' + (String(e instanceof Error ? e.message : e) === 'NOLOGIN' ? 'Accedi a Google e riprova.' : String(e instanceof Error ? e.message : e));
            btn.disabled = false;
          }
        };
        lista.appendChild(h('div.cat-riga', null, h('div', { style: { flex: '1', minWidth: '0' } }, h('div.forte', null, x.name), h('div.tenue.piccolo', null, '📁 ' + x.cartella + (eNomeQuiz(x.name) ? '' : ' · schema da verificare')), esito), btn));
      }
    }).catch((e: unknown) => { console.warn('ImportaDrive.elenca', e); stato.textContent = String(e instanceof Error ? e.message : e) === 'NOLOGIN' ? 'Accedi a Google (Altro → Drive) e riprova.' : 'Errore Drive: ' + String(e instanceof Error ? e.message : e); });
  }

  return { traduci, salvaTraduzione, elenca, importaFile, apri, eNomeQuiz };
})();
