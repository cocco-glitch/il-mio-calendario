// ============================================================
// v0.58.1 — «📥 Importa quiz da Drive»: elenca i .json delle cartelle «<materia> quiz».
// v0.58.2 — INNESTI: un pacchetto quiz non crea più un percorso a parte «a caso». Si riconosce dove va
//   (riconosci: corso con lo stesso sotto-step o la stessa UD, piano che lo prevede già o con lo step che lo
//   precede) e si INNESTA lì: record 'innesto' (id 'inn-<chiave>') con il sotto-step, il corso e il piano
//   di destinazione e il giorno. Studio applica gli innesti in lettura (applicaCorsi / applicaPiani):
//   i pacchetti originali non vengono toccati, quindi un aggiornamento dal sito non li cancella e il
//   percorso si può CAMBIARE quando si vuole (sposta) senza duplicare nulla. Id scheda invariati.
//   Schemi letti: «schemaVersion 2» (meta.sottoStep, pianoStrutturato.sottoSchede) e «versioneSchema 0.58»
//   (meta.stepId, sottoSchede[].rangeId, quiz[].categoria).
// ============================================================

/** Una domanda nello schema dei pacchetti Drive (campi in italiano). */
interface QuizDrive { id?: string; livelloCognitivo?: number | string; tipoItem?: string; domanda?: string; opzioni?: string[]; esatta?: number; spiegazione?: string; fonte?: string; erroreTipico?: string;
  sottoStep?: string; categoria?: string; }
interface SottoSchedaDrive { codice?: string; sottoStep?: string; titolo?: string; durataMin?: number; durataBracMin?: number; schedePrioritarie?: string[]; schedeRaffinamento?: string[]; rangeId?: string[]; fonte?: string; }
interface PacchettoDrive {
  meta?: { materia?: string; codiceMateria?: string; unitaDidattica?: string; unita?: string; sottoStep?: string; stepId?: string; titolo?: string };
  programmaCalendario?: { formatoGeneraMjs?: string[]; pianoStrutturato?: { durataTotaleMin?: number; sottoSchede?: SottoSchedaDrive[]; ancoraggiRipassoFSRS?: { intervallo?: string; target?: string[] }[] } };
  sottoSchede?: SottoSchedaDrive[];
  quiz?: QuizDrive[];
}
/** Il pacchetto letto e tradotto, indipendente dalla destinazione. */
interface TraduzioneDrive { k: string; cod: string; nome: string; sotto: string; ud: string; titolo: string; min: number; dataPacchetto: string;
  sub: SottoS; banche: { sk: string; domande: DomB[] }[]; ripassi: { giorni: number; etichetta: string }[]; domande: number; scartate: number; }
/** Un innesto: il sotto-step importato e il posto dove sta (corso, piano, giorno). '' = corso/piano «da Drive». */
interface InnestoRec extends Rec { type: 'innesto'; k: string; cod: string; nome: string; ud: string; titolo: string; min: number; sub: SottoS; corso: string; piano: string; data: string;
  ripassi: { giorni: number; etichetta: string }[]; banche: string[]; file: string; aggiornato: string; spostato?: string; }
interface DestinazioneDrive { id: string; titolo: string; punti: number; motivo: string; data?: string; }
interface SceltaDrive { corso: string; piano: string; data: string; }

const ImportaDrive = (() => {
  const s = (x: unknown) => typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim();
  const hash = (t: string) => { let x = 5381; for (let i = 0; i < t.length; i++) x = ((x << 5) + x + t.charCodeAt(i)) | 0; return (x >>> 0).toString(36); };
  const LV: Record<number, string> = { 1: 'Sbarramento', 2: 'Applicativo', 3: 'Applicativo', 4: 'Problema' };
  const CORSO_DRV = 'drv-ud-', PIANO_DRV = 'drv-piano';
  const nomeDi = (cod: string) => typeof nomeMateria === 'function' ? nomeMateria(cod) : cod;   // nei test Node la funzione può mancare

  /** È un pacchetto quiz+calendario? (per nome: anche «…_quiz_e_calendario_v058.json») */
  const eNomeQuiz = (nome: string) => /_quiz_e_calendario(_v[\w.-]+)?\.json$/i.test(nome);
  /** «3.3» < «3.10» < «4.1»: confronto per numeri. */
  function cmpNum(a: string, b: string): number {
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
    return 0;
  }
  const numeroK = (k: string) => k.replace(/^[A-Z]+/, '');
  const udDi = (sotto: string) => Number(sotto.split('.')[0]) || 0;
  const piuGiorni = (data: string, n: number) => { const d = new Date(data + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  const breve = (d: string) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
  /** «+1g», «+3 g», «+2s» (settimane) → giorni. */
  function giorniIntervallo(t: string): number { const m = /\+?\s*(\d+)\s*([gs])/i.exec(t); return m ? Number(m[1]) * (m[2].toLowerCase() === 's' ? 7 : 1) : 0; }
  /** «Mer 18/11» → la data più vicina a oggi con quel giorno/mese. */
  function dataDa(t: string, oggiK: string): string {
    const m = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(t); if (!m) return '';
    const dd = m[1].padStart(2, '0'), mm = m[2].padStart(2, '0');
    if (m[3]) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + mm + '-' + dd;
    const a = Number(oggiK.slice(0, 4)), cand = [a - 1, a, a + 1].map(y => y + '-' + mm + '-' + dd);
    const dist = (d: string) => Math.abs(new Date(d + 'T12:00:00').getTime() - new Date(oggiK + 'T12:00:00').getTime());
    return cand.sort((x, y) => dist(x) - dist(y))[0];
  }

  /** domanda → q, opzioni → o (la corretta per prima), esatta → o[0], spiegazione → e, fonte → r. */
  function domanda(x: QuizDrive, sk: string, k: string): DomB | null {
    const opz = Array.isArray(x.opzioni) ? x.opzioni.map(s).filter(Boolean) : [];
    const es = Number(x.esatta);
    if (!s(x.domanda) || opz.length < 2 || !Number.isInteger(es) || es < 0 || es >= opz.length) return null;
    const bl = Number(s(x.livelloCognitivo).replace(/^L/i, ''));
    const d: DomB = { id: 'q-drv-' + (s(x.id) || hash(sk + '|' + s(x.domanda))), sk, t: 'mcq', lv: LV[bl] || 'Applicativo', q: s(x.domanda),
      o: [opz[es], ...opz.filter((_, i) => i !== es)], e: s(x.spiegazione), stepId: k };
    if (s(x.fonte)) d.r = s(x.fonte);
    if (bl >= 1 && bl <= 4) d.bloomLevel = bl as BloomN;
    return d;
  }
  function falla(msg: string): never { throw new Error(msg); }

  /** Traduzione pura (nessun salvataggio, nessuna destinazione): testata nella suite Node. */
  function traduci(j: PacchettoDrive, oggiK = ymd(oggi())): TraduzioneDrive {
    if (!j || typeof j !== 'object') return falla('Il file non è un oggetto JSON.');
    const meta = j.meta || {}, pc = j.programmaCalendario || {}, ps = pc.pianoStrutturato || {};
    const g0 = (Array.isArray(pc.formatoGeneraMjs) ? pc.formatoGeneraMjs : []).map(s).filter(Boolean)[0] || '';
    const gc = g0 ? g0.split('|').map(s) : [];
    const sez0 = (Array.isArray(j.sottoSchede) ? j.sottoSchede : Array.isArray(ps.sottoSchede) ? ps.sottoSchede : []).filter(x => x && typeof x === 'object');
    const sotto = s(meta.sottoStep) || ((/(\d+(?:\.\d+)+)\s*$/.exec(s(meta.stepId)) || [])[1] || '') || gc[4] || '';
    if (!sotto) return falla('Manca il sotto-step (meta.sottoStep o meta.stepId).');
    if (!/^\d+(\.\d+)*$/.test(sotto)) return falla('Sotto-step non valido: ' + sotto);
    if (!Array.isArray(j.quiz) || !j.quiz.length) return falla('Il pacchetto non contiene quiz.');
    const mat = s(meta.materia), codGrezzo = s(meta.codiceMateria) || (/^[A-Za-z]{1,4}$/.test(mat) ? mat : '') || gc[0] || mat.slice(0, 1);
    const cod = codGrezzo.toUpperCase().replace(/[^A-Z]/g, '') || 'X', k = cod + sotto;
    const nome = (mat.length > 4 ? mat : '') || nomeDi(cod);
    const titolo = s(meta.titolo) || gc[2] || sotto;
    const quiz = j.quiz.filter(q => q && typeof q === 'object');
    const perId = new Map(quiz.map((q, i) => [s(q.id) || '#' + i, q] as [string, QuizDrive]));
    const usate = new Set<string>(), banche: { sk: string; domande: DomB[] }[] = [];
    let scart = 0;
    const raccogli = (ids: string[], sk: string): DomB[] => {
      const out: DomB[] = [];
      for (const id of ids) { const q = perId.get(id); if (!q || usate.has(id)) continue; usate.add(id); const d = domanda(q, sk, k); if (d) out.push(d); else scart++; }
      return out;
    };
    const raff = (id: string) => /raffin/i.test(s((perId.get(id) || {}).categoria));
    const micro: MicroS[] = [];
    let min = 0;
    // prima passata: gli elenchi espliciti (rangeId / schedePrioritarie) vincono sul campo sottoStep della domanda
    const elenchi = sez0.map(x => {
      const range = (x.rangeId || []).map(s);
      return { x, n: s(x.codice || x.sottoStep), idsP: [...(x.schedePrioritarie || []).map(s), ...range.filter(id => !raff(id))], idsR: [...(x.schedeRaffinamento || []).map(s), ...range.filter(raff)] };
    }).filter(e => e.n);
    const elencate = new Set(elenchi.flatMap(e => [...e.idsP, ...e.idsR]));
    for (const e of elenchi) for (const [id, q] of perId) if (!elencate.has(id) && s(q.sottoStep) === e.n) { (raff(id) ? e.idsR : e.idsP).push(id); elencate.add(id); }
    for (const { x, n, idsP, idsR } of elenchi) {
      const p = raccogli(idsP, cod + '-' + n + '-1'), r = raccogli(idsR, cod + '-' + n + '-2');
      const tit = s(x.titolo) || n, schede: SchedaS[] = [{ id: cod + '-' + n + '-1', k: 1, n: r.length ? 2 : 1, titolo: tit, tipo: 'P', problemi: false, pagine: '', quizFile: '' }];
      if (r.length) schede.push({ id: cod + '-' + n + '-2', k: 2, n: 2, titolo: tit + ' · raffinamento', tipo: 'R', problemi: false, pagine: '', quizFile: '' });
      banche.push({ sk: cod + '-' + n + '-1', domande: p });
      if (r.length) banche.push({ sk: cod + '-' + n + '-2', domande: r });
      micro.push({ n, schede });
      min += Number(x.durataMin || x.durataBracMin) || 0;
    }
    // domande non assegnate a nessuna sotto-scheda: nella prima scheda P (o in una scheda unica)
    const resto = [...perId.keys()].filter(id => !usate.has(id));
    if (resto.length) {
      if (!micro.length) { const n = sotto + '.1'; micro.push({ n, schede: [{ id: cod + '-' + n + '-1', k: 1, n: 1, titolo, tipo: 'P', problemi: false, pagine: '', quizFile: '' }] }); banche.push({ sk: cod + '-' + n + '-1', domande: [] }); }
      const b = banche[0]; b.domande.push(...raccogli(resto, b.sk));
    }
    const piene = banche.filter(b => b.domande.length);
    const ripassi: { giorni: number; etichetta: string }[] = [];
    for (const a of Array.isArray(ps.ancoraggiRipassoFSRS) ? ps.ancoraggiRipassoFSRS : []) { const n = giorniIntervallo(s(a && a.intervallo)); if (n && !ripassi.some(r => r.giorni === n)) ripassi.push({ giorni: n, etichetta: s(a.intervallo) }); }
    const sub: SottoS = { k, n: sotto, titolo, posizione: '', microstep: micro, innesto: true };
    return { k, cod, nome, sotto, ud: s(meta.unitaDidattica || meta.unita) || gc[1] || '', titolo, min: Number(ps.durataTotaleMin) || min, dataPacchetto: gc.length ? dataDa(gc[gc.length - 1], oggiK) : '',
      sub, banche: piene, ripassi, domande: piene.reduce((a, b) => a + b.domande.length, 0), scartate: scart };
  }

  // ---------- Riconoscimento: dove va? ----------
  const vociDi = (p: PkPiano) => p.giorni.flatMap(g => g.voci.filter(v => !v.speciale).map(v => ({ v, data: g.data })));
  /**
   * Corsi e piani candidati, il migliore per primo, ciascuno con il perché. Puro: riceve i corsi e i piani
   * (già con gli innesti applicati) e il giorno di oggi. id '' = «da Drive» (corso della UD / piano a parte).
   */
  function riconosci(t: { k: string; cod: string; nome: string; sotto: string; ud: string; dataPacchetto: string }, corsi: PkStep[], piani: PkPiano[], oggiK = ymd(oggi())): { corsi: DestinazioneDrive[]; piani: DestinazioneDrive[] } {
    const ud = udDi(t.sotto), idDrv = CORSO_DRV + ud, c: DestinazioneDrive[] = [];
    let drv: DestinazioneDrive | null = null;
    for (const pk of corsi) {
      if (pk.id.startsWith(CORSO_DRV) && pk.id !== idDrv) continue;
      const m = pk.materie.find(x => x.m === t.cod);
      const nativo = !!(m && m.sottostep.some(x => x.k === t.k && !x.innesto));
      const prima = m ? m.sottostep.filter(x => cmpNum(x.n, t.sotto) < 0 && udDi(x.n) === ud).sort((a, b) => cmpNum(a.n, b.n)).pop() : undefined;
      let punti = 10, motivo = 'Corso senza ' + t.nome + ': la aggiunge';
      if (nativo) { punti = 100; motivo = 'Contiene già ' + t.k + ': le domande vanno sulle sue schede'; }
      else if (m && pk.step === ud) { punti = 90; motivo = prima ? t.k + ' va dopo ' + prima.k + ' (stessa UD ' + ud + ')' : 'Stessa UD ' + ud + ' e stessa materia'; }
      else if (pk.step === ud) { punti = 75; motivo = 'Stessa UD ' + ud + ': aggiunge ' + t.nome; }
      else if (m) { punti = Math.max(20, 60 - Math.abs(pk.step - ud) * 5); motivo = 'Stessa materia, ma è lo step ' + pk.step; }
      else if (pk.proprio) punti = 15;
      if (pk.id === idDrv) { drv = { id: '', titolo: pk.titolo, punti: 0, motivo: '' }; continue; }
      c.push({ id: pk.id, titolo: pk.titolo, punti, motivo });
    }
    const alto = c.some(x => x.punti >= 75);
    c.push({ id: '', titolo: drv ? drv.titolo : 'Nuovo corso «Step ' + ud + (t.ud ? ' (' + t.ud + ')' : '') + ' · da Drive»', punti: alto ? 30 : 70,
      motivo: alto ? 'Un corso a parte per la UD ' + ud : 'Nessun tuo corso ha la UD ' + ud + ': ' + (drv ? 'va con gli altri ' + t.nome + ' ' + ud + '.x importati' : 'ne crea uno (ci andranno anche gli altri ' + ud + '.x)') });
    const pacchettoOk = t.dataPacchetto && t.dataPacchetto >= oggiK ? t.dataPacchetto : '';
    const p: DestinazioneDrive[] = [];
    for (const pi of piani) {
      if (pi.id === PIANO_DRV) continue;
      const voci = vociDi(pi).filter(x => !x.v.innesto), gia = voci.find(x => x.v.k === t.k), raff = pi.modo === 'raffinamento' ? 25 : 0;
      if (gia) { p.push({ id: pi.id, titolo: pi.titolo, punti: 100 - raff, data: gia.data >= oggiK ? gia.data : oggiK, motivo: gia.data >= oggiK ? 'Già previsto il ' + breve(gia.data) : 'Era previsto il ' + breve(gia.data) + ' (in ritardo): lo porto a oggi' }); continue; }
      const stessa = voci.filter(x => materiaDi(x.v.k) === t.cod && /^[A-Z]+\d/.test(x.v.k));
      const prec = stessa.filter(x => cmpNum(numeroK(x.v.k), t.sotto) < 0).sort((a, b) => cmpNum(numeroK(a.v.k), numeroK(b.v.k))).pop();
      if (prec) { const d = pacchettoOk || [piuGiorni(prec.data, 1), oggiK].sort().pop()!; p.push({ id: pi.id, titolo: pi.titolo, punti: 80 - raff, data: d, motivo: 'Dopo ' + prec.v.k + ' (' + breve(prec.data) + ')' }); continue; }
      p.push({ id: pi.id, titolo: pi.titolo, punti: (stessa.length ? 60 : 40) - raff, data: pacchettoOk || oggiK, motivo: stessa.length ? 'Piano con ' + t.nome : 'Piano senza ' + t.nome });
    }
    p.push({ id: '', titolo: '📥 Piano «Importati da Drive»', punti: 35, data: pacchettoOk || oggiK, motivo: 'Un piano a parte solo per i quiz importati' });
    const ord = (a: DestinazioneDrive, b: DestinazioneDrive) => b.punti - a.punti;
    return { corsi: c.sort(ord), piani: p.sort(ord) };
  }

  // ---------- Innesti: applicati in lettura da Studio ----------
  const innesti = () => Stato.tutti<InnestoRec>('innesto').filter(x => x && x.sub && x.k).sort((a, b) => cmpNum(numeroK(a.k), numeroK(b.k)));
  /** I corsi con dentro i sotto-step innestati (copie: i pacchetti salvati non cambiano). */
  function applicaCorsi(base: PkStep[]): PkStep[] {
    const inn = innesti(); if (!inn.length) return base;
    const out = base.slice(), copiati = new Set<PkStep>();
    for (const x of inn) {
      let i = x.corso ? out.findIndex(p => p.id === x.corso) : -1;
      if (i < 0) {
        const ud = udDi(numeroK(x.k)), id = CORSO_DRV + ud; i = out.findIndex(p => p.id === id);
        if (i < 0) { out.push({ tipo: 'step', id, step: ud, titolo: 'Step ' + ud + (x.ud ? ' (' + x.ud + ')' : '') + ' · da Drive', aggiornato: x.aggiornato, proprio: true, descrizione: 'Quiz importati da Drive', risorse: { libri: {}, quiz: {} }, materie: [] }); i = out.length - 1; copiati.add(out[i]); }
      }
      if (!copiati.has(out[i])) { out[i] = { ...out[i], materie: out[i].materie.slice() }; copiati.add(out[i]); }
      const pk = out[i];
      let mi = pk.materie.findIndex(m => m.m === x.cod);
      if (mi < 0) { pk.materie.push({ m: x.cod, nome: x.nome, libro: '', sottostep: [] }); mi = pk.materie.length - 1; }
      const mat = pk.materie[mi] = { ...pk.materie[mi], sottostep: pk.materie[mi].sottostep.slice() };
      const j = mat.sottostep.findIndex(z => z.k === x.k);
      if (j >= 0) {   // il sotto-step c'è già: aggiungo solo i microstep che mancano (le domande vanno comunque sulle schede per id)
        const es = mat.sottostep[j], nuovi = x.sub.microstep.filter(m => !es.microstep.some(e => e.n === m.n));
        if (nuovi.length) mat.sottostep[j] = { ...es, microstep: [...es.microstep, ...nuovi.map(m => ({ ...m, innesto: true }))] };
      } else {
        const dopo = mat.sottostep.findIndex(z => cmpNum(z.n, x.sub.n) > 0);
        mat.sottostep.splice(dopo < 0 ? mat.sottostep.length : dopo, 0, { ...x.sub, innesto: true });
      }
    }
    return out.sort((a, b) => a.step - b.step);
  }
  /** I piani con le voci innestate (lo step il giorno scelto + i ripassi del pacchetto). */
  function applicaPiani(base: PkPiano[]): PkPiano[] {
    const inn = innesti(); if (!inn.length) return base;
    const out = base.slice(), copiati = new Set<PkPiano>();
    const metti = (pid: string, data: string, v: VocePiano) => {
      let i = out.findIndex(p => p.id === pid);
      if (i < 0) { out.push({ tipo: 'piano', id: PIANO_DRV, titolo: '📥 Importati da Drive', aggiornato: '', giorniTeoria: 0, proprio: true, nota: 'Quiz importati da Drive', giorni: [] }); i = out.length - 1; copiati.add(out[i]); }
      if (!copiati.has(out[i])) { out[i] = { ...out[i], giorni: out[i].giorni.slice() }; copiati.add(out[i]); }
      const p = out[i], gi = p.giorni.findIndex(g => g.data === data);
      if (gi >= 0) p.giorni[gi] = { ...p.giorni[gi], voci: [...p.giorni[gi].voci, v] };
      else { p.giorni.push({ data, voci: [v] }); p.giorni.sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0); }
    };
    for (const x of inn) {
      const pid = x.piano && base.some(p => p.id === x.piano) ? x.piano : PIANO_DRV;
      const dest = base.find(p => p.id === pid);
      if (!(dest && dest.giorni.some(g => g.voci.some(v => v.k === x.k && !v.speciale)))) metti(pid, x.data, { k: x.k, t: x.titolo, min: x.min || undefined, innesto: true });
      for (const r of x.ripassi || []) metti(pid, piuGiorni(x.data, r.giorni), { k: 'RIP-' + x.k + '-' + r.giorni, t: '🔁 Ripasso ' + x.nome + ' ' + numeroK(x.k) + ' (' + r.etichetta + ')', speciale: true, isRipassoFSRS: true, innesto: true });
    }
    return out;
  }

  // ---------- Salvataggio e spostamento ----------
  const pianoSalvato = (pid: string): PkPiano | null => { const r = pid ? Stato.rec.get('pk-' + pid) : undefined; return r && !r.deleted && r.contenuto && r.contenuto.tipo === 'piano' ? r.contenuto as PkPiano : null; };
  const giaNelPiano = (p: PkPiano | null, k: string) => { if (!p) return ''; for (const g of p.giorni) if (g.voci.some(v => v.k === k && !v.speciale)) return g.data; return ''; };
  /** Mette (o rimette) l'innesto nel corso/piano/giorno scelti. Se il piano prevedeva già lo step in un altro
   *  giorno lo SPOSTA (record 'spostamento', come a mano) invece di duplicarlo. */
  function applicaScelta(x: InnestoRec, sc: SceltaDrive): void {
    const corsoReale = sc.corso && !sc.corso.startsWith(CORSO_DRV) && Stato.rec.get('pk-' + sc.corso) ? sc.corso : '';
    const pianoReale = sc.piano && pianoSalvato(sc.piano) ? sc.piano : '';
    if (x.spostato) Studio.sposta(x.k, null, x.spostato);
    x.spostato = undefined;
    const gia = giaNelPiano(pianoSalvato(pianoReale), x.k);
    if (gia && gia !== sc.data) { Studio.sposta(x.k, sc.data, pianoReale); x.spostato = pianoReale; }
    x.corso = corsoReale; x.piano = pianoReale; x.data = sc.data; x.aggiornato = ymd(new Date());
    Stato.salva(x);
  }
  /** Banca: una scheda già con domande di un altro pacchetto le tiene, e riceve anche le nostre. */
  function salvaBanche(idInn: string, banche: { sk: string; domande: DomB[] }[], vecchie: string[]): string[] {
    const nuove = new Set(banche.map(b => b.sk));
    for (const b of banche) {
      const r = Stato.prendi<BancaImcRec>('bq-' + b.sk);
      if (r && r.pk !== idInn) { r.domande = (r.domande || []).filter(d => !String(d.id).startsWith('q-drv-')).concat(b.domande); Stato.salva(r, true); }
      else Stato.salva({ id: 'bq-' + b.sk, type: 'bancaimc', updatedAt: 0, sk: b.sk, pk: idInn, domande: b.domande } as BancaImcRec, true);
    }
    for (const sk of vecchie) if (!nuove.has(sk)) togliBanca(idInn, sk);
    return [...nuove];
  }
  function togliBanca(idInn: string, sk: string): void {
    const r = Stato.prendi<BancaImcRec>('bq-' + sk); if (!r) return;
    if (r.pk === idInn) { Stato.elimina(r.id); return; }
    r.domande = (r.domande || []).filter(d => !String(d.id).startsWith('q-drv-')); Stato.salva(r, true);
  }
  /** v0.58.1 → v0.58.2: il corso 'drv-<m>-<n>' e il piano 'drv-piano-<m>-<n>' a parte spariscono (le banche passano all'innesto). */
  function togliVecchio(cod: string, sotto: string, idInn: string): void {
    const c = 'drv-' + cod.toLowerCase() + '-' + sotto;
    for (const r of Stato.tutti<BancaImcRec>('bancaimc')) if (r.pk === c) { r.pk = idInn; Stato.salva(r, true); }
    if (Stato.prendi('pk-' + c)) Stato.elimina('pk-' + c);
    if (Stato.prendi('pk-drv-piano-' + cod.toLowerCase() + '-' + sotto)) Stato.elimina('pk-drv-piano-' + cod.toLowerCase() + '-' + sotto);
  }
  /** Importa: salva l'innesto (stesso id a ogni reimportazione: aggiorna, non duplica) e lo mette nel posto scelto. */
  function salva(t: TraduzioneDrive, sc: SceltaDrive, file = ''): InnestoRec {
    const id = 'inn-' + t.k, prima = Stato.prendi<InnestoRec>(id);
    togliVecchio(t.cod, t.sotto, id);
    if (prima && prima.sub) t.sub.svolto = prima.sub.svolto;
    const x: InnestoRec = { ...(prima || { id, type: 'innesto', updatedAt: 0 } as InnestoRec), k: t.k, cod: t.cod, nome: t.nome, ud: t.ud, titolo: t.titolo, min: t.min, sub: t.sub,
      ripassi: t.ripassi, file: file || (prima && prima.file) || '', banche: [], corso: '', piano: '', data: sc.data, aggiornato: '' };
    x.banche = salvaBanche(id, t.banche, prima ? prima.banche || [] : []);
    applicaScelta(x, sc);
    Stato.notifica();
    return x;
  }
  /** Cambia percorso a un innesto già importato. */
  function sposta(k: string, sc: SceltaDrive): boolean { const x = Stato.prendi<InnestoRec>('inn-' + k); if (!x) return false; applicaScelta(x, sc); Stato.notifica(); return true; }
  /** Toglie un innesto (le sue domande spariscono; i progressi restano, come sempre). */
  function rimuovi(k: string): void {
    const x = Stato.prendi<InnestoRec>('inn-' + k); if (!x) return;
    if (x.spostato) Studio.sposta(x.k, null, x.spostato);
    for (const sk of x.banche || []) togliBanca(x.id, sk);
    Stato.elimina(x.id); Stato.notifica();
  }
  /** I pacchetti a parte della v0.58.1 diventano innesti (corso/piano «da Drive», giorno di prima). */
  function migraVecchi(): number {
    let n = 0;
    for (const r of Stato.tutti<Rec>('pacchetto')) {
      const c = r.contenuto as PkStep, m = /^pk-drv-([a-z]+)-(\d+(?:\.\d+)*)$/.exec(r.id);
      if (!m || r.deleted || !c || c.tipo !== 'step' || Stato.prendi('inn-' + m[1].toUpperCase() + m[2])) continue;
      const mat = c.materie[0], sub = mat && mat.sottostep[0]; if (!sub) continue;
      const vp = Stato.prendi<Rec>('pk-drv-piano-' + m[1] + '-' + m[2]), data = giaNelPiano(vp ? vp.contenuto as PkPiano : null, sub.k) || ymd(oggi());
      const banche = Stato.tutti<BancaImcRec>('bancaimc').filter(b => b.pk === c.id).map(b => b.sk);
      Stato.salva({ id: 'inn-' + sub.k, type: 'innesto', updatedAt: 0, k: sub.k, cod: mat.m, nome: mat.nome, ud: (c.descrizione || '').replace(/^[^·]*·?\s*/, ''), titolo: sub.titolo, min: 0, sub: { ...sub, innesto: true },
        corso: '', piano: '', data, ripassi: [], banche, file: '', aggiornato: ymd(new Date()) } as InnestoRec);
      togliVecchio(mat.m, m[2], 'inn-' + sub.k); n++;
    }
    if (n) Stato.notifica();
    return n;
  }

  interface FileDrive { id: string; name: string; cartella: string; }
  /** I .json nelle cartelle «… quiz» (biologia quiz, fisica quiz, chimica quiz…). */
  async function elenca(): Promise<FileDrive[]> {
    const cartelle = (await Drive.cercaCartelle('quiz')).filter(c => /(^|\s)quiz$/i.test(c.name.trim()));
    const out: FileDrive[] = [];
    for (const c of cartelle) for (const f of await Drive.elencaTutti(c.id)) if (/\.json$/i.test(f.name)) out.push({ id: f.id, name: f.name, cartella: c.name });
    return out.sort((a, b) => (Number(eNomeQuiz(b.name)) - Number(eNomeQuiz(a.name))) || a.name.localeCompare(b.name, 'it', { numeric: true }));
  }
  async function leggiFile(f: FileDrive): Promise<TraduzioneDrive> { return traduci(JsonAI.leggiFile(await Drive.scaricaTesto(f.id)) as PacchettoDrive); }
  /** Destinazioni proposte per un pacchetto, sui corsi e piani attuali. */
  const proponi = (t: { k: string; cod: string; nome: string; sotto: string; ud: string; dataPacchetto: string }) => riconosci(t, Studio.pkStep(), Studio.pianiAttivi());
  /** Importa con la destinazione riconosciuta (la migliore), senza chiedere: per test e automatismi. */
  async function importaFile(f: FileDrive): Promise<InnestoRec> { const t = await leggiFile(f), d = proponi(t); return salva(t, { corso: d.corsi[0].id, piano: d.piani[0].id, data: d.piani[0].data || ymd(oggi()) }, f.name); }

  // ---------- Interfaccia ----------
  const nomeCorso = (x: InnestoRec) => { const p = x.corso && Studio.pkStep().find(c => c.id === x.corso); return p ? p.titolo : 'Step ' + udDi(numeroK(x.k)) + ' · da Drive'; };
  const nomePiano = (x: InnestoRec) => { const p = x.piano && Studio.pkPiani().find(c => c.id === x.piano); return p ? p.titolo : '📥 Importati da Drive'; };
  const dove = (x: InnestoRec) => nomeCorso(x) + ' · ' + nomePiano(x) + ', ' + (x.data === ymd(oggi()) ? 'oggi' : breve(x.data));
  /** Il pannello «Dove lo metto?»: corso e piano riconosciuti (cambiabili), giorno, conferma. */
  function pannelloScelta(k: string, titolo: string, d: { corsi: DestinazioneDrive[]; piani: DestinazioneDrive[] }, iniziale: SceltaDrive | null, etichetta: string, ok: (sc: SceltaDrive) => void): HTMLElement {
    const opz = (l: DestinazioneDrive[]) => l.map((x, i) => [x.id, (i === 0 ? '★ ' : '') + x.titolo] as [string, string]);
    const motivoC = h('div.tenue.piccolo'), motivoP = h('div.tenue.piccolo');
    const giorno = h('input', { type: 'date', 'aria-label': 'Giorno nel piano per ' + k, value: (iniziale && iniziale.data) || d.piani[0].data || ymd(oggi()) }) as HTMLInputElement;
    const sc = selettore(opz(d.corsi), iniziale && d.corsi.some(x => x.id === iniziale.corso) ? iniziale.corso : d.corsi[0].id, () => aggiorna(false));
    const sp = selettore(opz(d.piani), iniziale && d.piani.some(x => x.id === iniziale.piano) ? iniziale.piano : d.piani[0].id, () => aggiorna(true));
    sc.setAttribute('aria-label', 'Corso di destinazione per ' + k); sp.setAttribute('aria-label', 'Piano di destinazione per ' + k);
    function aggiorna(nuovaData: boolean) {
      const c = d.corsi.find(x => x.id === sc.value), p = d.piani.find(x => x.id === sp.value);
      motivoC.textContent = c ? '🧭 ' + c.motivo : ''; motivoP.textContent = p ? '🗓 ' + p.motivo : '';
      if (nuovaData && p && p.data) giorno.value = p.data;
    }
    aggiorna(false);
    return h('div.innesto-scelta', { style: { margin: '8px 0', padding: '8px', border: '1px solid var(--bordo, #8884)', borderRadius: '10px' } },
      h('div.forte.piccolo', null, 'Dove lo metto? ' + titolo),
      riga('Corso', sc), motivoC, riga('Piano', sp), motivoP, riga('Giorno', giorno),
      h('div.bottoni', null, h('button.btn', { 'aria-label': etichetta + ' ' + k, onclick: () => ok({ corso: sc.value, piano: sp.value, data: giorno.value || ymd(oggi()) }) }, '✓ ' + etichetta)));
  }
  /** Gli innesti già fatti, con «Cambia percorso» e «Togli». */
  function listaInnesti(cont: HTMLElement): void {
    svuota(cont);
    const l = innesti(); if (!l.length) return;
    cont.appendChild(h('div.gruppo-titolo', null, 'Già nei tuoi programmi'));
    for (const x of l) {
      const zona = h('div'), info = h('div.tenue.piccolo', null, '→ ' + dove(x));
      const cambia = h('button.btn.neutro', { 'aria-label': 'Cambia percorso ' + x.k }, 'Cambia percorso') as HTMLButtonElement;
      cambia.onclick = () => {
        if (zona.firstChild) { svuota(zona); return; }
        const t = { k: x.k, cod: x.cod, nome: x.nome, sotto: numeroK(x.k), ud: x.ud, dataPacchetto: '' };
        zona.appendChild(pannelloScelta(x.k, x.nome + ' ' + numeroK(x.k), proponi(t), { corso: x.corso, piano: x.piano, data: x.data }, 'Sposta qui', scelta => {
          sposta(x.k, scelta); avviso('🧭 ' + x.k + ' → ' + dove(Stato.prendi<InnestoRec>(x.id)!), 5000); listaInnesti(cont);
        }));
      };
      const togli = h('button.btn-testo', { 'aria-label': 'Togli ' + x.k, onclick: () => { chiedi('Togliere ' + x.k + ' dai programmi?', [{ testo: 'Togli', valore: 'si', pericolo: true }], 'Spariscono le sue domande dalla Banca; i progressi restano salvati.').then(r => { if (r) { rimuovi(x.k); listaInnesti(cont); } }); } }, 'Togli');
      cont.appendChild(h('div.cat-riga', null, h('div', { style: { flex: '1', minWidth: '0' } }, h('div.forte', null, Studio.etichetta(x.k) + ' · ' + x.titolo), info, zona), h('div.bottoni', null, cambia, togli)));
    }
  }
  /** Foglio senza Drive: solo i percorsi dei quiz già importati. */
  function gestisci(): void {
    migraVecchi();
    const cont = h('div');
    foglio({ titolo: '🧭 Percorsi dei quiz importati', corpo: cont });
    listaInnesti(cont);
    if (!cont.firstChild) cont.appendChild(h('p.tenue', null, 'Nessun quiz importato da Drive. Usa «📥 Importa quiz da Drive».'));
  }
  /** Il foglio: elenco dei pacchetti su Drive; «Importa» legge il file, riconosce il posto e lo propone. */
  function apri(): void {
    if (serveGoogle()) return;
    migraVecchi();
    const stato = h('p.tenue', { role: 'status' }, 'Cerco le cartelle «… quiz» su Drive…');
    const gia = h('div'), lista = h('div.lista-drv');
    const f = foglio({ titolo: '📥 Importa quiz da Drive', corpo: h('div', null, stato, lista, gia) });
    listaInnesti(gia);
    elenca().then(files => {
      if (!files.length) { stato.textContent = 'Nessun .json nelle cartelle «… quiz» del tuo Drive.'; return; }
      stato.textContent = files.length + (files.length === 1 ? ' pacchetto trovato' : ' pacchetti trovati') + '. «Importa» riconosce dove va nei tuoi programmi: puoi cambiarlo prima di confermare.';
      for (const x of files) {
        const esito = h('div.tenue.piccolo'), zona = h('div');
        const btn = h('button.btn', { 'aria-label': 'Importa ' + x.name }, 'Importa') as HTMLButtonElement;
        btn.onclick = async () => {
          btn.disabled = true; esito.textContent = 'Leggo il pacchetto…'; svuota(zona);
          try {
            const t = await leggiFile(x), d = proponi(t), prima = Stato.prendi<InnestoRec>('inn-' + t.k);
            esito.textContent = 'Riconosciuto: ' + t.nome + ' ' + t.sotto + (t.ud ? ' · ' + t.ud : '') + ' · ' + t.domande + ' domande' + (t.scartate ? ' (' + t.scartate + ' scartate)' : '') + (t.dataPacchetto ? ' · pacchetto del ' + breve(t.dataPacchetto) : '');
            zona.appendChild(pannelloScelta(t.k, t.nome + ' ' + t.sotto + ' · ' + t.titolo, d, prima ? { corso: prima.corso, piano: prima.piano, data: prima.data } : null, 'Inserisci', sc => {
              const inn = salva(t, sc, x.name);
              svuota(zona); btn.textContent = 'Reimporta';
              esito.textContent = '✓ ' + t.domande + ' domande in Banca · ' + dove(inn);
              listaInnesti(gia);
              avviso('📥 ' + t.k + ' → ' + dove(inn), 5000, () => { f.chiudi(); vai('oggi'); });
            }));
          } catch (e: unknown) {
            console.warn('ImportaDrive', x.name, e);
            esito.textContent = '✗ ' + (String(e instanceof Error ? e.message : e) === 'NOLOGIN' ? 'Accedi a Google e riprova.' : String(e instanceof Error ? e.message : e));
          }
          btn.disabled = false;
        };
        lista.appendChild(h('div.cat-riga', null, h('div', { style: { flex: '1', minWidth: '0' } }, h('div.forte', { style: { overflowWrap: 'anywhere' } }, x.name), h('div.tenue.piccolo', null, '📁 ' + x.cartella + (eNomeQuiz(x.name) ? '' : ' · schema da verificare')), esito, zona), btn));
      }
    }).catch((e: unknown) => { console.warn('ImportaDrive.elenca', e); stato.textContent = String(e instanceof Error ? e.message : e) === 'NOLOGIN' ? 'Accedi a Google (Altro → Drive) e riprova.' : 'Errore Drive: ' + String(e instanceof Error ? e.message : e); });
  }

  return { traduci, riconosci, applicaCorsi, applicaPiani, salva, sposta, rimuovi, migraVecchi, elenca, leggiFile, importaFile, proponi, apri, gestisci, eNomeQuiz, cmpNum };
})();
