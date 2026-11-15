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

interface QCreato extends Rec { type: 'qcreato'; titolo: string; materia: string; argomento: string; cosa: string; fonti: { nome: string; id: string; pagine: string }[]; domande: DomB[]; creato: string; modelli: string[]; scartate: number; }

const CreaQuiz = (() => {
  const LV = ['Sbarramento', 'Applicativo', 'Trabocchetto', 'Problema', 'Completamento'];
  const n2 = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[«»"“”‘’']/g, '').replace(/\s+/g, ' ').trim();
  const parole = (s: string) => new Set(n2(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 3));
  function simile(a: string, b: string): number { const A = parole(a), B = parole(b); if (!A.size || !B.size) return 0; let c = 0; A.forEach(w => { if (B.has(w)) c++; }); return c / (A.size + B.size - c); }
  const tutti = () => Stato.tutti<QCreato>('qcreato').filter(r => !r.deleted).sort((a, b) => b.creato < a.creato ? -1 : 1);

  // ---------- 2) lettura delle fonti ----------
  type Fonte = { nome: string; id: string; testo: string; pagine: string };
  async function leggi(f: Trovato, chiavi: string[], budget: number, passo: (t: string) => void): Promise<Fonte | null> {
    try {
      if (f.mimeType === 'application/pdf') {
        const L = await caricaPdfJs(); passo('Leggo «' + f.name + '»…');
        const doc = await L.getDocument({ data: new Uint8Array(await (await Drive.scaricaBlob(f.id)).arrayBuffer()) }).promise;
        const pag: { i: number; t: string; s: number }[] = [];
        for (let i = 1; i <= Math.min(doc.numPages, 700); i++) {
          if (i % 25 === 0) passo('Leggo «' + f.name + '» · pagina ' + i + '/' + doc.numPages);
          const tc = await (await doc.getPage(i)).getTextContent();
          const t = tc.items.map((x: any) => x.str + (x.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').replace(/Volume concesso in uso a[^\n]*/gi, '').trim();
          if (t.length < 40) continue;
          const tn = n2(t); let s = 0; for (const w of chiavi) { const k = tn.split(w).length - 1; s += k ? 3 + Math.min(k, 8) : 0; }
          pag.push({ i, t, s });
        }
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
    'Stile: test di ammissione / semestre filtro di Medicina italiano. Italiano corretto, frasi chiare, nessun refuso.',
    'Usa SOLO le informazioni delle FONTI: niente dati, numeri o fatti che non ci sono. Se un calcolo serve, i dati devono essere nel testo della domanda.',
    'Multiple (t:"mcq"): 5 opzioni in "o", la CORRETTA È SEMPRE LA PRIMA (verranno mescolate). La corretta NON deve essere la più lunga né la più dettagliata: scrivila breve e simile ai distrattori; allunga i distrattori se serve. Ogni distrattore nasce da un errore tipico preciso (formula invertita, unità non convertita, fattore 2, concetti simili confusi, lettura affrettata).',
    'Completamenti (t:"fill", lv:"Completamento"): testo con «……» al posto della risposta; "a" = risposte accettate DIGITABILI da tastiera iPhone (numeri semplici, parole; niente apici, pedici, ², ⁻, ·, Δ, π, →); varianti utili (sinonimi, singolare/plurale, con/senza unità); "show" = risposta da mostrare.',
    'Tipi "lv": Sbarramento (teoria), Applicativo, Trabocchetto, Problema (calcoli), Completamento. Mix adeguato a quanto richiesto.',
    'Correzione "e" = array di passaggi DISCORSIVI (come un tutor che spiega a voce): "Cosa chiede: …", "Il concetto: … (dove si trova nella fonte)", poi "Passaggio 1: …", "Passaggio 2: …" (nei calcoli: formula, formula inversa esplicita, da dove viene OGNI numero, conversioni di unità esplicite, unità fino in fondo), infine "In sintesi: …" (la regola da ricordare). Minimo 4 elementi.',
    '"ew" (solo mcq) = 4 testi, uno per ogni distrattore nello stesso ordine di o[1..4]: perché è sbagliato e quale errore di ragionamento c\'è dietro. Per i completamenti "ew" = 1 testo con gli errori più probabili.',
    '"cit" = 1-2 citazioni copiate PAROLA PER PAROLA dalle FONTI (frase intera, 10-50 parole), con "f" = nome del file e pagina come indicato tra [[ ]]. Non riformulare le citazioni. "r" = fonte breve (file, pagina).',
    'Niente domande duplicate o quasi uguali tra loro né con quelle elencate come già presenti.',
  ];
  function msgGenera(o: { argomento: string; materia: string; cosa: string; extra: string }, fonti: Fonte[], nMcq: number, nFill: number, gia: string[], feedback = ''): { role: string; content: string }[] {
    return [{ role: 'system', content: 'Sei un docente esperto che scrive schede di quiz di ' + o.materia + '. Regole obbligatorie:\n- ' + REGOLE.join('\n- ') + '\nRispondi SOLO con JSON valido: {"domande":[{"t","lv","q","o","e","ew","a","show","r","cit":[{"t","f"}]}]}.' },
      { role: 'user', content: 'ARGOMENTO: ' + o.argomento + '\nCOSA VOGLIO: ' + o.cosa + (o.extra ? '\nINDICAZIONI: ' + o.extra : '') + '\n\nScrivi ' + (nMcq ? nMcq + ' domande a risposta multipla' : '') + (nMcq && nFill ? ' e ' : '') + (nFill ? nFill + ' completamenti' : '') + ' (prima le multiple).'
        + (gia.length ? '\n\nDOMANDE GIÀ PRESENTI (non ripeterle):\n- ' + gia.slice(0, 40).join('\n- ') : '') + (feedback ? '\n\nCORREGGI QUESTI PROBLEMI:\n' + feedback : '')
        + '\n\nFONTI:\n' + fonti.map(f => f.testo).join('\n\n') }];
  }

  // ---------- 4) controlli automatici ----------
  const NON_DIGITABILE = /[²³¹⁰⁴-⁹⁻⁺·×÷Δδπ→←↔≈≠≤≥√∞°µ±_^]/;
  function controlla(d: any, fontiTesto: string, altre: string[]): string[] {
    const p: string[] = [];
    if (!d || typeof d.q !== 'string' || d.q.trim().length < 15) return ['testo mancante'];
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
    const ft = n2(fontiTesto).replace(/[^a-z0-9]/g, '');
    d.cit = (Array.isArray(d.cit) ? d.cit : []).filter((c: any) => c && typeof c.t === 'string' && c.t.length > 20 && ft.includes(n2(c.t).replace(/[^a-z0-9]/g, '')));
    if (!d.cit.length) p.push('citazione non trovata parola per parola nelle fonti');
    if (altre.some(q => simile(q, d.q) >= .6)) p.push('quasi uguale a un\'altra domanda');
    return p;
  }

  // ---------- 5) revisione indipendente ----------
  async function revisiona(ds: any[], fonti: Fonte[], evita: string): Promise<{ esiti: Map<number, string[]>; modello: string }> {
    const L = 'ABCDE', ordini = ds.map(d => d.t === 'mcq' ? mescolaU([0, 1, 2, 3, 4]) : []);
    const elenco = ds.map((d, i) => d.t === 'mcq' ? i + ') ' + d.q + '\n' + ordini[i].map((k: number, j: number) => '   ' + L[j] + ') ' + d.o[k]).join('\n') : i + ') [completamento] ' + d.q);
    const r = await IA.chiedi([{ role: 'system', content: 'Sei un revisore severo di quiz universitari italiani. Hai SOLO le fonti. Rispondi in JSON.' },
      { role: 'user', content: 'Risolvi ogni domanda basandoti SOLO sulle fonti, poi controllala. JSON: {"esiti":[{"i":numero,"risposta":"lettera A-E oppure testo del completamento","ambigua":bool,"errori_contenuto":"…o vuoto","errori_italiano":"…o vuoto"}]}. Segnala come ambigua una multipla con più opzioni difendibili. Segnala errori di italiano (ortografia, grammatica, concordanze, punteggiatura) anche piccoli.\n\nDOMANDE:\n' + elenco.join('\n\n') + '\n\nFONTI:\n' + fonti.map(f => f.testo).join('\n\n') }], 'revisiona', { evita, temp: 0 });
    const esiti = new Map<number, string[]>();
    for (const x of (r.j && r.j.esiti) || []) {
      const i = +x.i, d = ds[i]; if (!d) continue; const p: string[] = [];
      if (d.t === 'mcq') { const k = L.indexOf(String(x.risposta || '').trim().toUpperCase().charAt(0)); if (k < 0 || ordini[i][k] !== 0) p.push('il revisore, risolvendola alla cieca, ha scelto un\'altra opzione: la domanda è ambigua o la risposta indicata è sbagliata'); }
      else if (!giustaR(String(x.risposta || ''), d.a || [])) p.push('il revisore ha completato con «' + String(x.risposta || '').slice(0, 40) + '»: rendi la frase univoca o aggiungi la variante se corretta');
      if (x.ambigua) p.push('più risposte difendibili');
      if (x.errori_contenuto && String(x.errori_contenuto).trim().length > 3) p.push('contenuto: ' + x.errori_contenuto);
      if (x.errori_italiano && String(x.errori_italiano).trim().length > 3) p.push('italiano: ' + x.errori_italiano);
      if (p.length) esiti.set(i, p);
    }
    return { esiti, modello: r.modello };
  }
  const normR = (s: string) => n2(s).replace(',', '.').replace(/[^a-z0-9.\- ]/g, '').trim();
  function giustaR(v: string, a: string[]): boolean { const x = normR(v); return a.some(y => { const z = normR(y); return x === z || (!!z && x.startsWith(z + ' ')) || (!isNaN(+x.split(' ')[0]) && +x.split(' ')[0] === +z.split(' ')[0] && /\d/.test(z)); }); }

  // ---------- l'intero processo ----------
  async function crea(o: { argomento: string; materia: string; cosa: string; extra: string; fonti: Trovato[]; nMcq: number; nFill: number }, passo: (t: string) => void): Promise<QCreato> {
    const chiavi = Array.from(new Set((o.argomento + ' ' + o.extra).split(/[\s,;:/()«»"]+/).map(n2).filter(w => w.length > 3))).slice(0, 12);
    const budget = IA.gemini ? 120000 : 22000, fonti: Fonte[] = [];
    for (const f of o.fonti) { const x = await leggi(f, chiavi, Math.round(budget / Math.max(1, o.fonti.length)), passo); if (x) fonti.push(x); }
    if (!fonti.length) throw new Error('Nelle fonti scelte non ho trovato pagine su «' + o.argomento + '». Prova parole chiave diverse (sinonimi, nome del capitolo) o altre fonti.');
    const testoFonti = fonti.map(f => f.testo).join('\n');
    const banca = Stato.tutti<QCreato>('qcreato').flatMap(r => r.domande.map(d => d.q)).slice(-200);
    const modelli = new Set<string>(); let buone: any[] = [], scartate = 0;
    const genera = async (nM: number, nF: number, feedback = ''): Promise<any[]> => {
      const out: any[] = [];
      for (let k = 0; k < nM; k += 6) { passo('Scrivo le multiple ' + (k + 1) + '–' + Math.min(nM, k + 6) + '…'); const r = await IA.chiedi(msgGenera(o, fonti, Math.min(6, nM - k), 0, banca.concat(buone.concat(out).map(d => d.q)), feedback), 'genera', { temp: .5 }); modelli.add(r.modello); out.push(...((r.j && r.j.domande) || []).map((d: any) => ({ ...d, t: 'mcq' }))); }
      if (nF) { passo('Scrivo i completamenti…'); const r = await IA.chiedi(msgGenera(o, fonti, 0, nF, banca.concat(buone.concat(out).map(d => d.q)), feedback), 'genera', { temp: .5 }); modelli.add(r.modello); out.push(...((r.j && r.j.domande) || []).map((d: any) => ({ ...d, t: 'fill', lv: 'Completamento' }))); }
      return out;
    };
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
        try { const rv = await revisiona(sane, fonti, gen); modelli.add(rv.modello); sane.forEach((d, i) => { const p = rv.esiti.get(i); if (p) problemi.set(d, p); }); }
        catch (e: any) { passo('⚠️ Revisione non riuscita (' + (e.message || e) + '): tengo solo i controlli automatici.'); }
      }
      buone = buone.concat(candidate.filter(d => !problemi.has(d)));
      const ko = candidate.filter(d => problemi.has(d));
      const mancaM = o.nMcq - buone.filter(d => d.t === 'mcq').length, mancaF = o.nFill - buone.filter(d => d.t === 'fill').length;
      if (!ko.length || (mancaM <= 0 && mancaF <= 0)) { scartate += ko.length; break; }
      if (giro === 3) { scartate += ko.length; break; }
      passo('Rigenero ' + ko.length + ' domande con i problemi trovati…');
      const fb = ko.slice(0, 8).map(d => '- «' + String(d.q).slice(0, 90) + '»: ' + problemi.get(d)!.join('; ')).join('\n');
      scartate += ko.length;
      candidate = await genera(Math.max(0, mancaM), Math.max(0, mancaF), fb);
    }
    buone = buone.filter(d => d.t === 'mcq').slice(0, o.nMcq).concat(buone.filter(d => d.t === 'fill').slice(0, o.nFill));
    if (!buone.length) throw new Error('Nessuna domanda ha superato i controlli. Prova con fonti più pertinenti o un argomento più preciso.');
    const id = 'qc-' + uid();
    const domande: DomB[] = buone.map((d, i) => ({ id: id + '-' + (i + 1), sk: id, t: d.t, lv: d.lv, q: String(d.q).trim(), o: d.t === 'mcq' ? d.o.map((x: string) => String(x).trim()) : undefined,
      a: d.t === 'fill' ? d.a.map(String) : undefined, show: d.t === 'fill' ? String(d.show || d.a[0]) : undefined, e: d.e.map(String), ew: (d.ew || []).map(String), r: String(d.r || fonti[0].nome),
      cit: d.cit.map((c: any) => ({ t: String(c.t).trim(), f: String(c.f || fonti[0].nome), l: linkFonte(fonti, String(c.f || '')) })), gen: true }));
    const rec: QCreato = { id, type: 'qcreato', updatedAt: 0, titolo: o.argomento.charAt(0).toUpperCase() + o.argomento.slice(1), materia: o.materia, argomento: o.argomento, cosa: o.cosa,
      fonti: fonti.map(f => ({ nome: f.nome, id: f.id, pagine: f.pagine })), domande, creato: new Date().toISOString(), modelli: Array.from(modelli), scartate };
    Stato.salva(rec);
    return rec;
  }
  function linkFonte(fonti: Fonte[], f: string): string | undefined {
    const x = fonti.find(y => f && n2(f).includes(n2(y.nome).slice(0, 20))) || fonti[0]; if (!x) return undefined;
    const p = /p\.\s*(\d+)/.exec(f); return 'https://drive.google.com/file/d/' + x.id + '/view' + (p ? '#page=' + p[1] : '');
  }

  // ---------- interfaccia ----------
  function apri(r: QCreato): void {
    const pk = { tipo: 'step', id: 'qc', step: 0, titolo: '', aggiornato: '', risorse: { libri: {}, quiz: {} }, materie: [] } as unknown as PkStep;
    const s = { id: r.id, k: 1, n: 1, titolo: r.titolo, tipo: 'P', problemi: false, pagine: '', quizFile: '' } as SchedaS;
    QuizApp.apri(pk, r.materia, r.titolo, s, () => r.domande, { occh: r.materia + ' · ✨ creato in app · ' + new Date(r.creato).toLocaleDateString('it-IT'), titolo: r.titolo, chiudi: () => elenco() });
  }
  function elenco(): void {
    const v = visore('✨ Quiz creati in app', () => { /* */ });
    const lista = tutti();
    v.corpo.append(h('div.pagina', null,
      h('div.tenue.piccolo', null, 'Creati dall\'app con il metodo delle schede di Claude (stesse regole, fonti dal tuo Drive, doppio controllo). Le schede di Claude restano a parte.'),
      h('button.btn', { onclick: () => { v.chiudi(); nuovo(); } }, '＋ Crea un quiz'),
      lista.length ? h('div.lista', null, ...lista.map(r => { const st = QuizApp.stat(r.id); const ultima = st.length ? st[0] : null;
        return h('button.voce-lista', { onclick: () => { v.chiudi(); apri(r); } }, h('span.voce-corpo', null, h('span.voce-titolo', null, '✨ ' + r.titolo),
          h('span.voce-sotto', null, r.materia + ' · ' + r.domande.length + ' domande · ' + new Date(r.creato).toLocaleDateString('it-IT') + (ultima ? ' · ultima: ' + ultima.ok + '/' + ultima.n : '') + ' · fonti: ' + r.fonti.map(f => f.nome + (f.pagine ? ' p. ' + f.pagine.split(',').slice(0, 4).join(',') + (f.pagine.split(',').length > 4 ? '…' : '') : '')).join('; ')))); })) : vuoto('Nessun quiz creato in app per ora.')));
  }
  async function nuovo(pre: Partial<{ argomento: string; materia: string; cosa: string; extra: string }> = {}): Promise<void> {
    if (!Spiega.attiva && !IA.gemini) { avviso('Serve una chiave AI gratuita: Altro → Spiegazioni AI.', 6000); return; }
    const materie = Array.from(new Set(['Chimica', 'Biologia', 'Fisica'].concat(Stato.tutti<Rec>('pacchetto').flatMap(r => ((r.contenuto && r.contenuto.materie) || []).map((m: any) => m.nome)).filter(Boolean))));
    const arg = h('input.campo', { type: 'text', value: pre.argomento || '', placeholder: 'Argomento preciso (es. «leve del corpo umano e guadagno meccanico»)' }) as HTMLInputElement;
    const mat = h('select.campo', null, ...materie.map(m => h('option', { value: m, selected: pre.materia ? n2(pre.materia) === n2(m) : false }, m))) as HTMLSelectElement;
    let cosa = pre.cosa || 'misto';
    const cose: [string, string][] = [['misto', 'Misto (come le schede)'], ['teoria', 'Teoria e definizioni'], ['problemi', 'Problemi con calcoli'], ['trabocchetti', 'Trabocchetti']];
    const chips = h('div.chips', null, ...cose.map(([k, t]) => h('button.chip' + (k === cosa ? '.attivo' : ''), { type: 'button', onclick: (e: Event) => { cosa = k; chips.querySelectorAll('.chip').forEach(c => c.classList.remove('attivo')); (e.target as HTMLElement).classList.add('attivo'); } }, t)));
    const extra = h('input.campo', { type: 'text', value: pre.extra || '', placeholder: 'Parole chiave in più (sinonimi, capitolo, libro, docente, «slide UD2»)' }) as HTMLInputElement;
    const box = h('div.cq-fonti'), stato = h('div.tenue.piccolo');
    let fonti: (Trovato & { usa: boolean })[] = [];
    const cercaFonti = async () => {
      if (arg.value.trim().length < 4) { avviso('Scrivi l\'argomento.'); return; }
      svuota(box); stato.textContent = 'Cerco le fonti in tutto il tuo Drive…';
      try { fonti = (await Trova.fonti(arg.value + ' ' + mat.value, extra.value.split(/[,;]/).map(x => x.trim()).filter(Boolean), 10)).map((f, i) => ({ ...f, usa: i < 3 })); }
      catch (e: any) { stato.textContent = String(e.message) === 'NOLOGIN' ? 'Accedi a Google (Altro → Drive) per cercare le fonti.' : String(e.message || e); return; }
      stato.textContent = fonti.length ? 'Fonti trovate (le prime 3 sono già scelte; tocca per cambiare):' : 'Nessuna fonte trovata: prova con altre parole chiave (sinonimi, nome del capitolo o del libro).';
      box.append(...fonti.map(f => h('label.cq-fonte', null, h('input', { type: 'checkbox', checked: f.usa, onchange: (e: Event) => f.usa = (e.target as HTMLInputElement).checked }),
        h('span', null, h('b', null, f.name), h('span.tenue.piccolo', null, ' · ' + (f.cartella ? '«' + f.cartella + '» · ' : '') + f.perche.slice(0, 3).join(', '))))));
    };
    const fs = foglio({ titolo: '✨ Crea un quiz', etichettaSalva: 'Crea', corpo: h('div.modulo', null,
      h('label', null, 'Argomento', arg), h('label', null, 'Materia', mat), h('div', null, h('div.piccolo', null, 'Cosa vuoi'), chips), h('label', null, 'Aiuta la ricerca (facoltativo)', extra),
      h('div.tenue.piccolo', null, '💡 Più l\'argomento è preciso, migliori sono le fonti e le domande: nomina il capitolo o la lezione, aggiungi sinonimi e il nome del libro o del docente.'),
      h('button.btn.neutro', { type: 'button', onclick: cercaFonti }, '🔎 Cerca le fonti nel Drive'), stato, box),
      salva: () => {
        const scelte = fonti.filter(f => f.usa);
        if (!scelte.length) { avviso('Prima cerca e scegli almeno una fonte.'); return false; }
        const nM = cosa === 'problemi' ? 12 : 12, nF = 6;
        avvia({ argomento: arg.value.trim(), materia: mat.value, cosa: ({ misto: 'mix di teoria, applicazioni, trabocchetti e problemi come nelle schede', teoria: 'soprattutto teoria e definizioni (Sbarramento), qualche applicativa', problemi: 'soprattutto problemi con calcoli (Problema), con passaggi numerici completi', trabocchetti: 'soprattutto trabocchetti sugli errori tipici' } as any)[cosa], extra: extra.value.trim(), fonti: scelte, nMcq: nM, nFill: nF });
      } });
    void fs;
    if (pre.argomento) setTimeout(cercaFonti, 200);
  }
  async function avvia(o: Parameters<typeof crea>[0]): Promise<void> {
    const stato = h('span.audio-stato', null, 'Preparo…'), pill = h('div.audio-pillola.lavora', { role: 'status' }, h('span.audio-giro'), stato);
    document.body.appendChild(pill);
    try {
      const r = await crea(o, t => { stato.textContent = t; });
      svuota(pill); pill.classList.remove('lavora'); pill.classList.add('pronta');
      pill.append(h('button.audio-fine', { type: 'button', onclick: () => { pill.remove(); apri(r); } }, '✓ Quiz pronto: ' + r.domande.length + ' domande' + (r.scartate ? ' (' + r.scartate + ' scartate dai controlli)' : '') + ' — Apri'));
      try { Tocco.clic(1); } catch (_) { /* */ }
    } catch (e: any) { stato.textContent = '⚠️ ' + (e.message || e); pill.append(h('button', { type: 'button', 'aria-label': 'Chiudi', onclick: () => pill.remove() }, '✕')); }
  }
  return { nuovo, elenco, apri, tutti, controlla, crea };
})();
