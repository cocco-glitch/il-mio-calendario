// =====================================================================
// 07-dossier.ts — v0.62 «Dossier studente» — MODULO PURO (niente Stato, DOM o rete; testato da test/dossier.mjs)
// Dai dati dell'app (statistiche per domanda, distrattori scelti, certezza × correttezza, tempi, ripassi, esame)
// calcola un dossier anonimo e lo trasforma in REGOLE già decise per l'AI esterna (master prompt).
// Confine AI/app: all'AI vanno solo regole («nel sotto-step 2.2.1 più L3»), mai numeri da elaborare né dati grezzi.
// Orari, concentrazione e tempo di studio restano a schermo (voci senza regola). La raccolta dei dati è in 07-strumentiquiz.ts.
// =====================================================================
interface TentD { ts: string; corretto: boolean; certezza: number; ms: number; }
interface StatD {
  qid: string; sk: string; n: number; ok: number; scelte?: Record<string, number>; testo?: string;
  caso?: string; tag?: string[]; ease?: number; reps?: number; livello?: number; log?: TentD[];
  /** v0.64: risposta aperta o codice (scritta, voto confermato dall'utente) → fuori da illusioni e distrattori. */ aperta?: boolean;
}
interface DatiDossier { stat: StatD[]; giorniEsame?: number | null; minutiGiorno?: number | null; }
type TipoVoceD = 'esame' | 'debole' | 'illusione' | 'confusione' | 'oblio' | 'tempo' | 'concentrazione' | 'orario' | 'studio';
interface VoceDossier { id: string; tipo: TipoVoceD; arg?: string; titolo: string; motivo: string; regola?: string; peso: number; }
interface DossierS { materia: string; step: string; voci: VoceDossier[]; tentativi: number; insufficiente: boolean; }
interface CtxPrivacy { email?: string; nome?: string; dispositivo?: string; nomiFile?: string[]; }

const Dossier = (() => {
  const MIN_ARG = 5, SOGLIA_DEBOLE = 0.6, MAX_CONFUSIONI = 5, MAX_REGOLE = 8, TAGLIO = 140;
  const pct = (a: number, b: number) => Math.round(100 * a / b);
  const taglia = (s: string) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > TAGLIO ? x.slice(0, TAGLIO - 1) + '…' : x; };
  const mediana = (a: number[]) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  /** Sotto-step di una scheda: «B-2.2.1-1» → «2.2.1»; «biologia-3.3-S01» → «3.3». */
  function argomentoDaSk(sk: string): string {
    const m = /(\d+(?:\.\d+)+|\d+)(?=-(?:S?\d+)$|$)/i.exec(String(sk || ''));
    return m ? m[1] : '';
  }
  /** L'argomento sta nello step? «2.2» prende 2.2 e 2.2.x; step vuoto = tutta la materia. */
  const nelloStep = (arg: string, step: string): boolean => !step || arg === step || arg.startsWith(step + '.');

  function calcola(dati: DatiDossier, o: { materia: string; step?: string; oggi: string }): DossierS {
    const step = String(o.step || '').trim();
    const stat = (dati.stat || []).filter(s => s && nelloStep(argomentoDaSk(s.sk), step));
    const voci: VoceDossier[] = [];
    const perArg = new Map<string, StatD[]>();
    for (const s of stat) { const a = argomentoDaSk(s.sk); if (!a) continue; const l = perArg.get(a) || []; l.push(s); perArg.set(a, l); }
    const tentativi = stat.reduce((x, s) => x + (s.n || 0), 0);

    // esame: solo i giorni mancanti, mai la data
    const g = dati.giorniEsame;
    if (typeof g === 'number' && g >= 0) {
      const motivo = 'Esame tra ' + g + (g === 1 ? ' giorno.' : ' giorni.');
      if (g <= 7) voci.push({ id: 'esame', tipo: 'esame', titolo: 'Esame vicino', motivo, peso: 100,
        regola: 'Esame tra pochi giorni: niente approfondimenti fuori programma; privilegia domande d\'esame L3–L4 e trabocchetti sui sotto-step deboli.' });
      else if (g <= 21) voci.push({ id: 'esame', tipo: 'esame', titolo: 'Esame entro tre settimane', motivo, peso: 45,
        regola: 'Esame entro tre settimane: bilancia richiamo (L1–L2) e applicazione (L3–L4) in ogni scheda.' });
      else voci.push({ id: 'esame', tipo: 'esame', titolo: 'Esame lontano', motivo: motivo + ' C\'è tempo per costruire le basi.', peso: 5 });
    }

    for (const [arg, xs] of perArg) {
      // argomento debole
      const n = xs.reduce((a, s) => a + (s.n || 0), 0), ok = xs.reduce((a, s) => a + (s.ok || 0), 0);
      if (n >= MIN_ARG && ok / n < SOGLIA_DEBOLE) voci.push({ id: 'debole:' + arg, tipo: 'debole', arg, titolo: 'Sotto-step ' + arg + ' debole',
        motivo: pct(ok, n) + ' % di risposte giuste su ' + n + ' tentativi.', peso: 80 + Math.round(60 - 100 * ok / n),
        regola: 'Sotto-step ' + arg + ': aggiungi almeno una scheda in più, con più domande L3 (trabocchetti) e confutazioni esplicite.' });
      // illusioni di competenza: sicuro e sbagliato
      const ill = xs.filter(s => !s.aperta).filter(s => s.caso === 'illusione_competenza' || (s.tag || []).includes('illusione_competenza') ||
        (s.log || []).some(t => !t.corretto && t.certezza === 3)).length;
      if (ill >= 2) voci.push({ id: 'illusione:' + arg, tipo: 'illusione', arg, titolo: 'Sicurezza mal riposta nel sotto-step ' + arg,
        motivo: ill + ' domande sbagliate dicendo «sicuro».', peso: 70 + ill,
        regola: 'Sotto-step ' + arg + ': ci sono risposte sbagliate date con sicurezza; aggiungi coppie gemelle (G1, G2…) e trabocchetti L3 sui punti che sembrano facili.' });
      // oblio: i ripassi peggiorano l'ease
      const rip = xs.filter(s => typeof s.ease === 'number' && (s.reps || 0) >= 1);
      if (rip.length >= 3) {
        const e = rip.reduce((a, s) => a + (s.ease as number), 0) / rip.length;
        if (e <= 2.0) voci.push({ id: 'oblio:' + arg, tipo: 'oblio', arg, titolo: 'Il sotto-step ' + arg + ' si dimentica in fretta',
          motivo: 'Facilità media dei ripassi ' + e.toFixed(1).replace('.', ',') + ' su ' + rip.length + ' domande (2,5 = normale).', peso: 50,
          regola: 'Sotto-step ' + arg + ': più domande di richiamo (L1–L2) sugli stessi concetti, formulate in modi diversi.' });
      }
    }

    // idee sbagliate: distrattori scelti almeno 2 volte (testo didattico, non personale)
    const conf: { s: StatD; scelta: string; volte: number }[] = [];
    for (const s of stat) if (s.scelte && !s.aperta && !/^g-/.test(s.qid)) for (const [scelta, volte] of Object.entries(s.scelte)) if (volte >= 2 && scelta.trim()) conf.push({ s, scelta, volte });
    conf.sort((a, b) => b.volte - a.volte || (a.s.qid < b.s.qid ? -1 : a.s.qid > b.s.qid ? 1 : 0) || (a.scelta < b.scelta ? -1 : 1));
    for (const c of conf.slice(0, MAX_CONFUSIONI)) {
      const arg = argomentoDaSk(c.s.sk), dove = c.s.testo ? 'a «' + taglia(c.s.testo) + '»' : 'nel sotto-step ' + arg;
      voci.push({ id: 'confusione:' + c.s.qid + ':' + taglia(c.scelta).slice(0, 24), tipo: 'confusione', arg, titolo: 'Idea sbagliata ricorrente (sotto-step ' + arg + ')',
        motivo: 'Risposta sbagliata «' + taglia(c.scelta) + '» scelta ' + c.volte + ' volte.', peso: 60 + c.volte,
        regola: 'Smonta l\'idea sbagliata: ' + dove + ' si risponde spesso «' + taglia(c.scelta) + '». Aggiungi 2 domande con questa risposta come distrattore e confutazione esplicita.' });
    }

    // tempo per domanda L1
    const tL1 = stat.filter(s => s.livello === 1).flatMap(s => (s.log || []).map(t => t.ms).filter(ms => ms > 0));
    if (tL1.length >= 8) {
      const m = mediana(tL1);
      if (m > 25000) voci.push({ id: 'tempo:L1', tipo: 'tempo', titolo: 'Domande di base lente', motivo: 'Mediana ' + Math.round(m / 1000) + ' s per una domanda L1 (su ' + tL1.length + ' risposte).', peso: 40,
        regola: 'Domande L1 brevi: testo sotto le 25 parole, una sola idea per domanda.' });
    }

    // concentrazione e orari: solo a schermo
    const tutti = stat.flatMap(s => s.log || []).filter(t => t && t.ts && !isNaN(Date.parse(t.ts))).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const sessioni: TentD[][] = [];
    for (const t of tutti) {
      const u = sessioni[sessioni.length - 1];
      if (u && Date.parse(t.ts) - Date.parse(u[u.length - 1].ts) <= 20 * 60000) u.push(t); else sessioni.push([t]);
    }
    const cali: number[] = [];
    for (const s of sessioni) {
      if (s.length < 12) continue;
      const base = s.slice(0, 8), acc0 = base.filter(t => t.corretto).length / 8, ms0 = mediana(base.map(t => t.ms).filter(x => x > 0));
      for (let i = 8; i + 5 <= s.length; i++) {
        const w = s.slice(i, i + 5), acc = w.filter(t => t.corretto).length / 5, ms = mediana(w.map(t => t.ms).filter(x => x > 0));
        if (acc < acc0 - 0.25 || (ms0 > 0 && ms > 1.6 * ms0)) { const primo = w.findIndex(t => !t.corretto); cali.push(i + (primo >= 0 ? primo : 0)); break; }
      }
    }
    if (cali.length >= 2) {
      const n = Math.round(mediana(cali));
      voci.push({ id: 'concentrazione', tipo: 'concentrazione', titolo: 'La concentrazione cala dopo circa ' + n + ' domande',
        motivo: 'Mediana su ' + cali.length + ' sessioni: fai una pausa breve ogni ' + n + ' domande.', peso: 20 });
    }
    const FASCE = ['notte', 'mattina', 'pomeriggio', 'sera'];
    const perF = FASCE.map(() => ({ n: 0, ok: 0 }));
    for (const t of tutti) { const f = perF[Math.floor(new Date(t.ts).getHours() / 6)]; f.n++; if (t.corretto) f.ok++; }
    const valide = perF.map((f, i) => ({ i, n: f.n, p: f.n ? f.ok / f.n : 0 })).filter(f => f.n >= 10).sort((a, b) => b.p - a.p || a.i - b.i);
    if (valide.length >= 2) {
      const su = valide[0], giu = valide[valide.length - 1];
      if (su.p - giu.p >= 0.15) voci.push({ id: 'orario', tipo: 'orario', titolo: 'Rendi di più di ' + FASCE[su.i],
        motivo: FASCE[su.i] + ' ' + Math.round(100 * su.p) + ' % · ' + FASCE[giu.i] + ' ' + Math.round(100 * giu.p) + ' % di risposte giuste.', peso: 15 });
    }
    const mg = dati.minutiGiorno;
    if (typeof mg === 'number' && mg > 0) voci.push({ id: 'studio', tipo: 'studio', titolo: 'Circa ' + Math.round(mg) + ' minuti nei giorni di studio',
      motivo: 'Media degli ultimi 14 giorni in cui hai studiato.', peso: 10 });

    voci.sort((a, b) => b.peso - a.peso || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { materia: o.materia, step, voci, tentativi, insufficiente: tentativi < MIN_ARG };
  }

  /** Regole per l'AI: solo le voci con regola, non escluse, al massimo 8, più importanti prima. */
  function regole(d: DossierS, escluse: string[] = []): string[] {
    const via = new Set(escluse);
    return d.voci.filter(v => v.regola && !via.has(v.id)).slice(0, MAX_REGOLE).map(v => v.regola as string);
  }

  /** Anteprima leggibile del dossier (a schermo, non va all'AI). */
  function testo(d: DossierS, r: string[]): string {
    const L = ['Dossier — ' + d.materia + (d.step ? ' · step ' + d.step : ' · tutta la materia') + ' (' + d.tentativi + ' risposte)'];
    if (d.insufficiente) L.push('Dati insufficienti: servono più quiz fatti in app perché il dossier dica qualcosa.');
    for (const v of d.voci) L.push('• ' + v.titolo + ' — ' + v.motivo + (v.regola ? '' : ' (solo per te)'));
    L.push('All\'AI vanno ' + (r.length === 1 ? '1 regola.' : r.length + ' regole.'));
    return L.join('\n');
  }

  /** Cerca dati identificativi nel testo che va all'AI. Restituisce i problemi trovati (vuoto = si può copiare). */
  function controllaPrivacy(t: string, ctx: CtxPrivacy = {}): string[] {
    const s = String(t || ''), basso = s.toLowerCase(), out = new Set<string>();
    if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(s)) out.add('Contiene un\'email.');
    const email = String(ctx.email || '').toLowerCase();
    if (email) { const loc = email.split('@')[0]; if (basso.includes(email) || (loc.length >= 4 && basso.includes(loc))) out.add('Contiene l\'email dell\'account (o una sua parte).'); }
    const nome = String(ctx.nome || '').trim().toLowerCase();
    if (nome.length >= 3 && basso.includes(nome)) out.add('Contiene il nome dell\'account.');
    if ((ctx.dispositivo && s.includes(ctx.dispositivo)) || /\bdev-[a-z0-9]{6,}/i.test(s)) out.add('Contiene l\'id del dispositivo.');
    if (/\b\d{4}-\d{2}-\d{2}\b/.test(s) || /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(s)) out.add('Contiene una data.');
    if (/\b([01]?\d|2[0-3]):[0-5]\d\b/.test(s)) out.add('Contiene un\'ora esatta.');
    for (const f of ctx.nomiFile || []) {
      const x = String(f || '').toLowerCase(), senza = x.replace(/\.[a-z0-9]{2,5}$/, '');
      if (senza.length >= 5 && basso.includes(senza)) { out.add('Contiene il nome di un file.'); break; }
    }
    // telefono: prefisso internazionale, o cellulare italiano 3xx + 6–7 cifre (non i numeri didattici con spazi delle migliaia)
    if (/(?:\+|\b00)\d{2}[\s.-]?\d{2,4}[\s.-]?\d{5,8}\b/.test(s) || /\b3\d{2}[\s.-]?\d{6,7}\b/.test(s)) out.add('Contiene un numero di telefono.');
    return [...out];
  }

  return { argomentoDaSk, nelloStep, calcola, regole, testo, controllaPrivacy };
})();
