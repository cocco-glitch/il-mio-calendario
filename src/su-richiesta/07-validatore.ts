// =====================================================================
// 07-validatore.ts — v0.61 «Contratto AI»: UN SOLO validatore per Diagnostica e Importa. MODULO PURO.
// Le regole stanno in un profilo (PROFILO_STANDARD = le regole del master prompt); oggi c'è solo quello.
//  - bloccanti(q): ciò che impedisce l'import della singola domanda (gli altri problemi non bloccano mai);
//  - rapporto(p): il riepilogo dell'import (ex ImportaParti.valida, stessi messaggi);
//  - analizza(qs): la diagnostica per domanda e per scheda (ex DiagnosiQuiz.analizza, senza la regola sul formato ID:
//    gli ID ora li assegna l'app);
//  - valida(qs): bloccanti per id + problemi di qualità (per domanda) e d'insieme (scheda, gemelle, totali);
//  - ripara(qs): solo correzioni senza perdita; promptCorrezione: patch chirurgiche (mai chiedere all'AI di contare).
// ImportaParti e DiagnosiQuiz ne restano adapter sottili (stessa API di v0.60).
// =====================================================================
interface ProfiloQuiz { perScheda: number; opzioni: number; quoteLivello: number[]; rangeScheda: Array<[number, number]>; spiegazioneMin: number; confutazioneMin: number;
  tolLivello: number; tolPosizione: number; lungaMax: number; schedeStep: [number, number]; brac: [number, number]; biasRapporto?: number; biasDifferenza?: number; }
interface ValidazioneQ { bloccanti: Map<string, string[]>; qualita: ProblemaQ[]; insieme: ProblemaQ[]; pronte: number; analisi: AnalisiQ; }

const PROFILO_STANDARD: ProfiloQuiz = { perScheda: 18, opzioni: 4, quoteLivello: [25, 35, 25, 15], rangeScheda: [[4, 5], [6, 7], [4, 5], [2, 3]], spiegazioneMin: 600, confutazioneMin: 30,
  tolLivello: 3, tolPosizione: 10, lungaMax: 25, schedeStep: [18, 25], brac: [45, 50], biasRapporto: 1.65, biasDifferenza: 22 };

const Validatore = (() => {
  const LETTERE = 'ABCD';
  const oggetto = (v: unknown): v is DomQ => !!v && typeof v === 'object' && !Array.isArray(v);
  const testo = (v: unknown) => typeof v === 'string' ? v : '';
  const s = (x: unknown) => typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim();
  /** Lettera dichiarata in «RISPOSTA ESATTA: X)», se c'è. */
  function letteraDichiarata(sp: string): number | null {
    const m = /RISPOSTA ESATTA\s*:\s*([A-D])\s*[)\].:]/.exec(String(sp || ''));
    return m ? LETTERE.indexOf(m[1]) : null;
  }
  const citazioni = (x: string) => (String(x || '').match(/\[\[[^\]]+\]\]/g) || []);
  const numeriPagina = (x: string) => new Set((String(x).match(/\d+/g) || []).map(Number));
  const normSem = (x: unknown) => s(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(il|lo|la|i|gli|le|un|uno|una)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const doppioniSem = (a: string[]) => a.some((x, i) => a.some((y, j) => { if (j >= i) return false; const nx = normSem(x), ny = normSem(y), corta = nx.length < ny.length ? nx : ny, lunga = nx.length < ny.length ? ny : nx; return corta !== lunga && corta.split(' ').length >= 3 && (' ' + lunga + ' ').includes(' ' + corta + ' '); }));
  const fonteNorm = (x: unknown) => { const v = s(x), m = /^\s*(?:pagina|pag\.?|p\.?)\s*[:#-]?\s*(\d+)\s*$/i.exec(v); return m ? 'Pagina ' + Number(m[1]) : v; };
  const rispostaEsplicita = (sp: string) => { const m = /RISPOSTA ESATTA\s*:\s*([A-D])\s*[)\].:-]\s*([^\n.]{3,240})/i.exec(sp); return m ? { lettera: LETTERE.indexOf(m[1].toUpperCase()), testo: normSem(m[2]) } : null; };

  /** Blocchi per una singola domanda (vuoto = importabile). */
  function bloccanti(q: QuizDrive, P: ProfiloQuiz = PROFILO_STANDARD): string[] {
    const b: string[] = [], o = Array.isArray(q.opzioni) ? q.opzioni : [];
    if (!s(q.domanda)) b.push('testo mancante');
    const tipo = s(q.tipo) || 'mcq', piene = (v: unknown) => Array.isArray(v) ? v.map(s).filter(Boolean) : [];
    if (tipo !== 'mcq') {   // v0.64 quiz-v4: regole per tipo (spec §D)
      if (tipo === 'completamento') {
        if (!s(q.domanda).includes('___')) b.push('completamento senza «___» nel testo');
        if (!piene(q.risposte).length) b.push('completamento senza risposte');
      } else if (tipo === 'ordinamento') {
        const n = piene(q.elementi).length; if (n < 3 || n > 7) b.push(n + ' elementi da ordinare invece di 3–7');
      } else if (tipo === 'aperta' || tipo === 'codice') {
        const n = piene(q.rubrica).length; if (n < 2 || n > 5) b.push(n + ' punti di rubrica invece di 2–5');
        if (!s(q.rispostaModello)) b.push('manca la rispostaModello');
        if (tipo === 'codice' && !s(q.linguaggio)) b.push('codice senza linguaggio');
      } else b.push('tipo «' + tipo + '» sconosciuto');
      return b;
    }
    if (o.length !== P.opzioni) b.push(o.length + ' opzioni invece di ' + P.opzioni);
    const e = Number(q.esatta); if (!Number.isInteger(e) || e < 0 || e >= P.opzioni || e >= o.length) b.push('«esatta» fuori da 0..' + (P.opzioni - 1));
    return b;
  }

  const pct = (n: number, tot: number) => tot ? Math.round(n * 100 / tot) : 0;
  const livelloDi = (q: QuizDrive) => { const n = Number(s(q.livelloCognitivo).replace(/^L/i, '')) || Number(s(q.livello).replace(/^L/i, '')); return n >= 1 && n <= 4 ? n : 0; };
  /** Controllo qualità dell'import (zero token): gli avvisi non bloccano, si vedono prima di «Importa» e restano nel rapporto. */
  function rapporto(p: PacchettoDrive, extra: { bloccanti?: string[]; duplicati?: string[]; completo?: boolean } = {}, P: ProfiloQuiz = PROFILO_STANDARD): RapportoQuiz {
    const quiz = (p.quiz || []).filter(q => q && typeof q === 'object'), tot = quiz.length;
    const bloccanti = (extra.bloccanti || []).slice(), avvisi: string[] = [], righe: string[] = [];
    if (extra.duplicati && extra.duplicati.length) avvisi.push(extra.duplicati.length + ' domande ripetute tra parti: tengo la più recente (' + extra.duplicati.slice(0, 3).join('; ') + (extra.duplicati.length > 3 ? '…' : '') + ')');
    if (!tot) return { bloccanti, avvisi, righe: ['Nessuna domanda valida'] };
    // schede
    const perScheda = new Map<number, number>(); for (const q of quiz) { const n = ImportaParti.numScheda(q.scheda); if (n) perScheda.set(n, (perScheda.get(n) || 0) + 1); }
    if (perScheda.size) {
      const storte = [...perScheda].filter(([, c]) => c !== P.perScheda).sort((a, b) => a[0] - b[0]);
      righe.push(perScheda.size + ' schede · ' + tot + ' domande');
      if (storte.length) avvisi.push('Schede con domande ≠ ' + P.perScheda + ': ' + storte.slice(0, 6).map(([n, c]) => 'S' + String(n).padStart(2, '0') + '=' + c).join(', ') + (storte.length > 6 ? '…' : ''));
      if (extra.completo !== false && (perScheda.size < P.schedeStep[0] || perScheda.size > P.schedeStep[1])) avvisi.push(perScheda.size + ' schede nello step (attese ' + P.schedeStep.join('–') + ')');
    } else righe.push(tot + ' domande');
    // livelli
    const liv = [0, 0, 0, 0]; for (const q of quiz) { const l = livelloDi(q); if (l) liv[l - 1]++; }
    const lp = liv.map(n => pct(n, tot));
    righe.push('Livelli L1–L4: ' + lp.join('/') + '% (attesi ' + P.quoteLivello.join('/') + ')');
    if (lp.some((x, i) => Math.abs(x - P.quoteLivello[i]) > P.tolLivello)) avvisi.push('Livelli fuori soglia (±' + P.tolLivello + '): ' + lp.join('/') + '% invece di ' + P.quoteLivello.join('/'));
    // posizione dell'esatta e corretta più lunga
    const pos: number[] = Array(P.opzioni).fill(0); let lunga = 0;
    for (const q of quiz) {
      const e = Number(q.esatta), o = (q.opzioni || []).map(x => s(x).length);
      if (e >= 0 && e < P.opzioni) pos[e]++;
      if (o.length > 1 && o.every((l, i) => i === e || l < o[e])) lunga++;
    }
    const pp = pos.map(n => pct(n, tot));
    righe.push('Esatta in A/B/C/D: ' + pp.join('/') + '% · corretta più lunga: ' + pct(lunga, tot) + '%');
    if (pp.some(x => Math.abs(x - 100 / P.opzioni) > P.tolPosizione)) avvisi.push('Posizione dell\'esatta sbilanciata: ' + pp.join('/') + '% (attesa ~' + Math.round(100 / P.opzioni) + '% ciascuna)');
    if (pct(lunga, tot) > P.lungaMax) avvisi.push('La corretta è la più lunga nel ' + pct(lunga, tot) + '% delle domande (attesa ≤ ' + P.lungaMax + '%): si indovina dalla lunghezza');
    // coppie gemelle
    const gem = new Map<string, number>(); for (const q of quiz) { const g = s(q.coppiaGemellaId); if (g) gem.set(g, (gem.get(g) || 0) + 1); }
    const coppie = [...gem.values()].filter(n => n >= 2).length, sole = [...gem].filter(([, n]) => n < 2).map(([g]) => g);
    const schede = perScheda.size || Math.ceil(tot / P.perScheda), attese = Math.floor(schede / 3);
    righe.push('Coppie gemelle complete: ' + coppie);
    if (coppie < attese) avvisi.push('Coppie gemelle: ' + coppie + ' (attese ≥ ' + attese + ', una ogni 3 schede)');
    if (sole.length) avvisi.push(sole.length + ' gemelle senza l\'altra metà: ' + sole.slice(0, 3).join(', ') + (sole.length > 3 ? '…' : ''));
    // campi
    const senzaErrore = quiz.filter(q => !s(q.erroreTipico)).length;
    if (senzaErrore) avvisi.push(senzaErrore + ' domande senza «erroreTipico»');
    const conSd = quiz.filter(q => q.spiegazioneDistrattori !== undefined);
    const sdStorte = (conSd.length || perScheda.size ? quiz : []).filter(q => !(Array.isArray(q.spiegazioneDistrattori) && q.spiegazioneDistrattori.length === P.opzioni - 1)).length;
    if (sdStorte) avvisi.push(sdStorte + ' domande senza ' + (P.opzioni - 1) + ' «spiegazioneDistrattori»');
    const daVerificare = quiz.filter(q => /da verificare|p\.\s*_{2,}/i.test(s(q.fonte))).length;
    if (daVerificare) avvisi.push(daVerificare + ' fonti «da verificare» o senza pagina');
    // ripassi e durate (chiusura)
    const fuori = (m: number) => m < P.brac[0] || m > P.brac[1];
    const ps = (p.programmaCalendario && p.programmaCalendario.pianoStrutturato) || {};
    const brac = (Array.isArray(ps.sottoSchede) ? ps.sottoSchede : Array.isArray(p.sottoSchede) ? p.sottoSchede : []).map(x => Number(x && (x.durataBracMin || x.durataMin)) || 0).filter(Boolean);
    if (brac.some(fuori)) avvisi.push('Blocchi di studio fuori ' + P.brac.join('–') + ' min (BRAC): ' + brac.filter(fuori).join(', '));
    return { bloccanti, avvisi, righe };
  }

  // ---------- diagnostica ----------
  function analizza(qs: unknown[], P: ProfiloQuiz = PROFILO_STANDARD): AnalisiQ {
    const problemi: ProblemaQ[] = [], add = (sev: SevQ, id: string, msg: string) => { problemi.push({ sev, id, msg }); };
    const visti = new Set<string>(), schede = new Map<string, SchedaQ & { seq: number[] }>(), gemelle = new Map<string, Array<{ id: string; scheda: string }>>();
    const lv = [0, 0, 0, 0], es = [0, 0, 0, 0];
    let lunga = 0;
    qs.forEach((q0, i) => {
      if (!oggetto(q0)) { add('err', '(riga ' + (i + 1) + ')', 'elemento non valido'); return; }
      const q = q0, id = testo(q.id) || '(riga ' + (i + 1) + ')';
      const mcq = !testo(q.tipo) || q.tipo === 'mcq';
      for (const k of mcq ? CHIAVI_QUIZ : CHIAVI_BASE_V4) if (!(k in q)) add('err', id, 'chiave mancante: ' + k);
      for (const k of Object.keys(q)) if (!CHIAVI_QUIZ.includes(k) && !CHIAVI_V4.includes(k) && !FACOLTATIVE.includes(k)) add('warn', id, 'chiave in più: ' + k);
      if ('concetto' in q && (typeof q.concetto !== 'string' || !q.concetto.trim() || q.concetto.length > 60)) add('warn', id, 'concetto: 2–5 parole (al massimo 60 caratteri); senza, l\'app lo assegna da sola');
      if (testo(q.id)) { if (visti.has(id)) add('err', id, 'ID duplicato'); visti.add(id); }
      const L = q.livelloCognitivo;
      const lOk = typeof L === 'number' && [1, 2, 3, 4].includes(L);
      if (!lOk) add('err', id, 'livelloCognitivo deve essere un numero da 1 a 4, senza virgolette');
      else { lv[(L as number) - 1]++; if (q.livello !== 'L' + L) add('err', id, 'livello (' + String(q.livello) + ') non coincide con livelloCognitivo (' + L + ')'); }
      const o = q.opzioni;
      if (testo(q.domanda).trim().length < 10) add('err', id, 'domanda mancante o troppo breve');
      if (!mcq) {   // v0.64: i campi propri del tipo li controlla bloccanti(); qui solo ciò che vale per ogni domanda
        if (!testo(q.fonte).trim()) add('err', id, 'fonte mancante');
        else if (/verificar/i.test(testo(q.fonte) + ' ' + testo(q.spiegazione))) add('err', id, 'pagina «da verificare»: vietata');
        const nome = testo(q.scheda) || '(senza scheda)', s = schede.get(nome) || { nome, n: 0, lv: [0, 0, 0, 0], es: [0, 0, 0, 0], seq: [] };
        s.n++; if (lOk) s.lv[(L as number) - 1]++; schede.set(nome, s);
        return;
      }
      else if (/tutte le precedenti|nessuna delle precedenti/i.test(testo(q.domanda) + ' ' + (Array.isArray(o) ? o.join(' ') : ''))) add('warn', id, 'usa «tutte/nessuna delle precedenti»');
      const esOk = Number.isInteger(q.esatta) && (q.esatta as number) >= 0 && (q.esatta as number) < P.opzioni;
      if (!Array.isArray(o) || o.length !== P.opzioni || o.some(x => typeof x !== 'string' || !x.trim())) add('err', id, 'servono esattamente ' + P.opzioni + ' opzioni testuali');
      else {
        const op = o as string[];
        if (new Set(op.map(normSem)).size < P.opzioni || doppioniSem(op)) add('err', id, new Set(op.map(x => x.trim().toLowerCase())).size < P.opzioni ? 'opzioni duplicate' : 'opzioni semanticamente duplicate');
        if (!esOk) add('err', id, 'esatta deve essere un intero da 0 a ' + (P.opzioni - 1));
        else {
          const e = q.esatta as number, c = op[e], altre = op.filter((_, j) => j !== e);
          es[e]++;
          const med = altre.map(x => x.length).sort((a, b) => a - b)[1] || 1, rapporto = c.length / Math.max(1, med);
          if (c.length >= Math.max(...altre.map(x => x.length))) { lunga++; add(rapporto >= (P.biasRapporto || 1.65) && c.length - med >= (P.biasDifferenza || 22) ? 'err' : 'info', id, rapporto >= (P.biasRapporto || 1.65) && c.length - med >= (P.biasDifferenza || 22) ? 'la risposta corretta è marcatamente più lunga dei distrattori' : 'la risposta corretta è la più lunga'); }
          if (altre.some(x => x.toLowerCase().includes(c.toLowerCase()))) add('err', id, 'il testo della corretta è contenuto in un distrattore');
          if (c.length < 0.45 * Math.min(...altre.map(x => x.length))) add('warn', id, 'la corretta è molto più corta delle altre: si nota');
          const dich = letteraDichiarata(testo(q.spiegazione));
          if (dich !== null && dich !== e) add('err', id, 'la spiegazione dice «RISPOSTA ESATTA: ' + LETTERE[dich] + ')» ma esatta = ' + e + ' (' + LETTERE[e] + ')');
        }
      }
      if (!esOk && !(Array.isArray(o) && o.length === P.opzioni) && 'esatta' in q && !Number.isInteger(q.esatta)) add('err', id, 'esatta deve essere un intero da 0 a ' + (P.opzioni - 1));
      const sd = q.spiegazioneDistrattori;
      if (!Array.isArray(sd) || sd.length !== P.opzioni - 1 || sd.some(x => typeof x !== 'string' || x.trim().length < P.confutazioneMin)) add('err', id, 'spiegazioneDistrattori: servono ' + (P.opzioni - 1) + ' confutazioni (almeno ' + P.confutazioneMin + ' caratteri ciascuna)');
      else {
        if (new Set(sd.map(normSem)).size < P.opzioni - 1) add('err', id, 'spiegazioneDistrattori: confutazioni duplicate o semanticamente uguali');
        if (sd.some(x => /(?:questa|tale) (?:opzione|risposta).{0,25}(?:sbagliat|non (?:è|e) corrett)|non pertinente senza|semplicemente errat/i.test(String(x)))) add('err', id, 'spiegazioneDistrattori: confutazioni generiche, serve il motivo specifico');
      }
      if (!Array.isArray(q.distractorTypes) || q.distractorTypes.length !== P.opzioni - 1) add('err', id, 'distractorTypes: servono ' + (P.opzioni - 1) + ' stringhe');
      if (!testo(q.erroreTipico).trim()) add('err', id, 'erroreTipico vuoto o null');
      const sp = testo(q.spiegazione), fonte = testo(q.fonte).trim();
      if (typeof q.spiegazione !== 'string') add('err', id, 'spiegazione mancante');
      else {
        if (sp.length < P.spiegazioneMin) add('warn', id, 'spiegazione corta (' + sp.length + ' caratteri, minimo ~' + P.spiegazioneMin + ')');
        if (!citazioni(sp).length) add('warn', id, 'nella spiegazione manca la citazione [[Manuale, p. X]]');
        else if (fonte) {
          const pf = numeriPagina(fonte), ps = numeriPagina(citazioni(sp).join(' '));
          if (pf.size && ![...pf].some(n => ps.has(n))) add('warn', id, 'la citazione nella spiegazione non coincide con fonte');
        }
      }
      if (!fonte) add('err', id, 'fonte mancante');
      else {
        if (/verificar/i.test(fonte + ' ' + sp)) add('err', id, 'pagina «da verificare»: vietata');
        if (q.sourceRef !== q.fonte) add('warn', id, 'sourceRef diverso da fonte');
      }
      if (lOk) {
        const d = normSem(q.domanda), recupero = /^(qual e|quale e|come si definisce|indica|riconosci|che cosa e)\b/.test(d), alto = /(caso|scenario|situazione|dati|risultati|confront|analizz|valut|relazione|conseguenza|applic)/.test(d);
        if (L === 4 && recupero && !alto) add('err', id, 'Bloom L4 dichiarato ma la richiesta effettiva è di riconoscimento/recupero');
        if (L === 1 && alto && d.split(' ').length > 8) add('err', id, 'Bloom L1 dichiarato ma la richiesta effettiva richiede applicazione o analisi');
      }
      const gid = testo(q.coppiaGemellaId);
      if (gid) { const a = gemelle.get(gid) || []; a.push({ id, scheda: testo(q.scheda) }); gemelle.set(gid, a); }
      const nome = testo(q.scheda) || '(senza scheda)';
      const s = schede.get(nome) || { nome, n: 0, lv: [0, 0, 0, 0], es: [0, 0, 0, 0], seq: [] };
      s.n++;
      if (lOk) s.lv[(L as number) - 1]++;
      if (esOk) { s.es[q.esatta as number]++; s.seq.push(q.esatta as number); }
      schede.set(nome, s);
    });
    schede.forEach(s => {
      const chi = 'scheda ' + s.nome;
      if (s.n !== P.perScheda) add('err', chi, 'ha ' + s.n + ' domande invece di ' + P.perScheda + ' (può essere normale solo se hai caricato una parte del file)');
      else {
        P.rangeScheda.forEach(([a, b], k) => { if (s.lv[k] < a || s.lv[k] > b) add('warn', chi, 'livello L' + (k + 1) + ': ' + s.lv[k] + ' domande (atteso ' + a + '–' + b + ')'); });
        if (s.es.filter(x => x > 0).length < 3) add('warn', chi, 'la risposta esatta usa meno di 3 posizioni diverse');
      }
      for (let i = 2; i < s.seq.length; i++) if (s.seq[i] === s.seq[i - 1] && s.seq[i] === s.seq[i - 2]) { add('warn', chi, 'risposta esatta nella stessa posizione (' + LETTERE[s.seq[i]] + ') per 3 domande di fila'); break; }
    });
    gemelle.forEach((a, k) => {
      if (a.length === 1) add('info', 'gemella ' + k, 'membro presente: ' + a[0].id + ' (scheda ' + a[0].scheda + '). L\'altro membro deve stare in una scheda diversa.');
      else if (new Set(a.map(x => x.scheda)).size < a.length) add('warn', 'gemella ' + k, 'i due membri stanno nella stessa scheda');
    });
    const n = qs.length;
    if (n >= P.perScheda && 100 * lunga / n > P.lungaMax) add('err', 'insieme', 'la corretta è la più lunga nel ' + Math.round(100 * lunga / n) + '% dei casi (massimo ' + P.lungaMax + '%)');
    if (n >= 2 * P.perScheda) {
      es.forEach((c, j) => { const p = 100 * c / n; if (Math.abs(p - 100 / P.opzioni) > P.tolPosizione) add('warn', 'insieme', 'esatta=' + j + ' nel ' + Math.round(p) + '% dei casi (atteso ~' + Math.round(100 / P.opzioni) + '%)'); });
      P.quoteLivello.forEach((t, k) => { const p = 100 * lv[k] / n; if (Math.abs(p - t) > P.tolLivello) add('warn', 'insieme', 'L' + (k + 1) + ' al ' + Math.round(p) + '% (atteso ' + t + '% ±' + P.tolLivello + ')'); });
    }
    const conErrori = new Set(problemi.filter(p => p.sev === 'err').map(p => p.id));
    const pronte = qs.filter((q, i) => oggetto(q) && !conErrori.has(testo(q.id) || '(riga ' + (i + 1) + ')')).length;
    return { problemi, n, lv, es, lunga, schede: [...schede.values()].map(({ nome, n: nn, lv: l, es: e }) => ({ nome, n: nn, lv: l, es: e })), gemelle: gemelle.size, pronte };
  }

  /** Diagnostica completa: bloccanti per id (con l'ID doppio: vale la prima), qualità per domanda, problemi d'insieme. */
  function valida(qs: unknown[], P: ProfiloQuiz = PROFILO_STANDARD): ValidazioneQ {
    const blocchi = new Map<string, string[]>(), visti = new Set<string>();
    let pronte = 0;
    qs.forEach((q, i) => {
      const id = oggetto(q) && testo(q.id) ? testo(q.id) : '(riga ' + (i + 1) + ')';
      const b = oggetto(q) ? bloccanti(q as QuizDrive, P) : ['non è una domanda'];
      if (visti.has(id)) b.push('ID doppio: vale la prima domanda con questo id');
      visti.add(id);
      if (b.length) blocchi.set(id, [...(blocchi.get(id) || []), ...b]); else pronte++;
    });
    const analisi = analizza(qs, P), globale = (p: ProblemaQ) => /^(scheda |insieme|gemella )/.test(p.id);
    return { bloccanti: blocchi, qualita: analisi.problemi.filter(p => !globale(p)), insieme: analisi.problemi.filter(globale), pronte, analisi };
  }

  /** v0.64 quiz-v4: chiavi dei tipi di domanda, ammesse ma non obbligatorie (il v3 resta com'è). */
  /** blocco 6: chiavi facoltative (un file senza resta valido; con, non è «chiave in più»). */
  const FACOLTATIVE: ReadonlyArray<string> = ['concetto'];
  const CHIAVI_V4: ReadonlyArray<string> = ['tipo', 'risposte', 'elementi', 'rubrica', 'rispostaModello', 'linguaggio'];
  /** Chiavi obbligatorie per i tipi non mcq: le altre di CHIAVI_QUIZ sono proprie della scelta multipla o facoltative. */
  const CHIAVI_BASE_V4: ReadonlyArray<string> = ['id', 'stepId', 'scheda', 'categoria', 'livelloCognitivo', 'livello', 'domanda', 'fonte', 'sourceRef'];
  /** Segnaposto del buco che le AI scrivono al posto di «___»: «…», «...», «[ ]», «[...]», «____» e oltre. */
  const BUCHI = /\[\s*(?:\.\.\.|…)?\s*\]|_{4,}|…|\.{3}/g;
  /** Numerazione davanti agli elementi da ordinare: «1.», «2)», «a)». */
  const PREFISSO = /^\s*(?:\d{1,2}|[a-z])[.)]\s+/i;

  /** Solo correzioni senza perdita (nessun contenuto inventato). Non modifica l'input. */
  function ripara(qs: unknown[]): { qs: unknown[]; log: string[] } {
    const log: string[] = [];
    const out = qs.map(q0 => {
      if (!oggetto(q0)) return q0;
      const q: DomQ = { ...q0 }, id = testo(q.id) || '?';
      for (const k of Object.keys(q)) if (!CHIAVI_QUIZ.includes(k) && !CHIAVI_V4.includes(k) && !FACOLTATIVE.includes(k)) { log.push(id + ': rimossa la chiave in più «' + k + '»'); delete q[k]; }
      if (q.tipo === 'completamento' && typeof q.domanda === 'string') { const d = q.domanda.replace(BUCHI, '___'); if (d !== q.domanda) { log.push(id + ': segnaposto del buco reso «___»'); q.domanda = d; } }
      if (q.tipo === 'ordinamento' && Array.isArray(q.elementi) && q.elementi.some(e => typeof e === 'string' && PREFISSO.test(e))) { log.push(id + ': tolti i prefissi di numerazione dagli elementi'); q.elementi = q.elementi.map(e => typeof e === 'string' ? e.replace(PREFISSO, '') : e); }
      for (const k of ['domanda', 'spiegazione', 'fonte', 'erroreTipico']) { const v = q[k]; if (typeof v === 'string' && v !== v.trim()) { log.push(id + ': tolti spazi superflui in «' + k + '»'); q[k] = v.trim(); } }
      if (Array.isArray(q.opzioni) && q.opzioni.some(o => typeof o === 'string' && o !== o.trim())) { log.push(id + ': tolti spazi superflui nelle opzioni'); q.opzioni = q.opzioni.map(o => typeof o === 'string' ? o.trim() : o); }
      if (typeof q.livelloCognitivo === 'string' && /^L?[1-4]$/i.test(q.livelloCognitivo.trim())) { log.push(id + ': livelloCognitivo da testo a numero'); q.livelloCognitivo = Number(q.livelloCognitivo.trim().replace(/^L/i, '')); }
      if (typeof q.esatta === 'string' && /^[0-3]$/.test(q.esatta.trim())) { log.push(id + ': esatta da testo a numero'); q.esatta = Number(q.esatta.trim()); }
      if (Array.isArray(q.opzioni) && typeof q.spiegazione === 'string') {
        const r = rispostaEsplicita(q.spiegazione), op = q.opzioni.map(normSem);
        if (r && r.testo) {
          const candidati = op.map((x, i) => ({ x, i })).filter(x => x.x && (r.testo === x.x || r.testo.includes(x.x) || x.x.includes(r.testo)));
          if (candidati.length === 1) {
            const e = candidati[0].i, prima = Number(q.esatta); if (prima !== e) { q.esatta = e; log.push(id + ': esatta riallineata al testo della risposta (' + prima + ' → ' + e + ')'); }
            if (r.lettera !== e) { q.spiegazione = q.spiegazione.replace(/(RISPOSTA ESATTA\s*:\s*)[A-D]/i, '$1' + LETTERE[e]).replace(/\b(risposta|opzione)\s+(?:corretta\s+)?[A-D]\b/gi, (_m, a) => a + ' ' + LETTERE[e]); log.push(id + ': lettera della risposta aggiornata a ' + LETTERE[e]); }
          }
        }
      }
      const lc = q.livelloCognitivo;
      if (typeof lc === 'number' && [1, 2, 3, 4].includes(lc) && q.livello !== 'L' + lc) { log.push(id + ': livello allineato a livelloCognitivo (' + (q.livello === undefined ? 'mancante' : String(q.livello)) + ' → L' + lc + ')'); q.livello = 'L' + lc; }
      const f = fonteNorm(q.fonte), sr = fonteNorm(q.sourceRef);
      if (f && q.fonte !== f) { q.fonte = f; log.push(id + ': formato fonte normalizzato'); }
      if (f && sr !== f) { log.push(id + ': sourceRef reso uguale a fonte'); q.sourceRef = f; } else if (f && q.sourceRef !== f) { q.sourceRef = f; log.push(id + ': formato sourceRef normalizzato'); }
      return q;
    });
    return { qs: out, log };
  }

  /** Prompt di correzione chirurgica (solo patch dei campi da rifare): la logica sta in DiagnosiQuiz. */
  const promptCorrezione = (qs: unknown[], problemi: ProblemaQ[], o: { gem?: boolean; perche?: boolean; avvisi?: boolean } = {}) => DiagnosiQuiz.promptCorrezione(qs, problemi, o).testo;

  return { PROFILO_STANDARD, LETTERE, letteraDichiarata, citazioni, bloccanti, rapporto, analizza, valida, ripara, promptCorrezione };
})();
