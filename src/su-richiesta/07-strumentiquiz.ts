// =====================================================================
// 07-strumentiquiz.ts — v0.59.2: UI dei due strumenti per i quiz fatti con un'AI esterna (Gemini, accessibile a tutti)
//  • «🧠 Prompt quiz per Gemini»: costruisce il master prompt su misura (materia, step, archetipo, modalità, materiale
//    trovato su Drive, indice di lettura dei PDF misurato qui, ID già usati, punti deboli). Logica in 07-masterprompt.ts.
//  • «🩺 Diagnostica quiz»: controlla il JSON restituito, ripara il riparabile, prepara il prompt di correzione
//    chirurgica e applica le patch, senza spendere token. Logica in 07-diagnosiquiz.ts.
// =====================================================================
interface FileDrvSQ { id: string; name: string; mimeType: string; file?: File; }   // file: PDF scelto dal dispositivo (solo per misurarlo)
interface GruppoLibroSQ { libro: LibroMP; files: FileDrvSQ[]; usa: boolean; }
/** Fonti scelte per uno step (solo nomi di file e misure dei libri): salvate nel record «creazione». */
interface FontiSQ { libri: LibroMP[]; slide: string[]; guide: string[]; indici: string[]; quiz: string[]; vietati: string[]; }

const StrumentiQuiz = (() => {
  // v0.63: fonti escluse modificabili nelle impostazioni del Centro (prefisso imc-: cancellata al cambio account).
  const K_CENTRO_ESCLUSI = 'imc-centro-esclusi', ESCLUSI_BASE = ['Testbusters', 'Alpha Test', 'Editest'];
  function esclusi(): string[] {
    try { const x = JSON.parse(localStorage.getItem(K_CENTRO_ESCLUSI) || 'null'); return Array.isArray(x) ? x.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()) : ESCLUSI_BASE.slice(); }
    catch (e) { console.warn('[centro] lista esclusi illeggibile', e); return ESCLUSI_BASE.slice(); }
  }
  /** Salva la lista (null = torna ai predefiniti). */
  function salvaEsclusi(xs: string[] | null): void {
    try { if (xs) localStorage.setItem(K_CENTRO_ESCLUSI, JSON.stringify([...new Set(xs.map(v => v.trim()).filter(Boolean))].slice(0, 50))); else localStorage.removeItem(K_CENTRO_ESCLUSI); }
    catch (e) { console.warn('[centro] lista esclusi non salvata', e); }
  }
  const reNome = (v: string) => new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, ' ?'), 'i');
  /** Un file è vietato come fonte: sigla TB o un nome della lista esclusi («Alpha Test» trova anche «alphatest»). */
  const vietato = (n: string) => /\bTB\b|TB\.pdf/i.test(n) || esclusi().some(v => reNome(v).test(n));
  const RE_GUIDE = /syllabus|programma|appell|esame|prova|simulazion/i;
  const RE_SLIDE = /slide|lezion|dispens|presentaz/i;
  const RE_INDICE = /indice|sommario|toc\b/i;

  async function copia(t: string, ta?: HTMLTextAreaElement): Promise<void> {
    try { await navigator.clipboard.writeText(t); avviso('Copiato: incollalo in Gemini.'); }
    catch (_) { if (ta) { ta.focus(); ta.select(); } avviso('Appunti non disponibili: seleziona e copia dal riquadro.', 5000); }
  }
  function scarica(nome: string, testo: string, tipo: string): void {
    const a = h('a', { href: URL.createObjectURL(new Blob([testo], { type: tipo })), download: nome }) as HTMLAnchorElement;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const area = (etichetta: string, righe: number, sola = false) => h('textarea', { rows: righe, 'aria-label': etichetta, readonly: sola || undefined, spellcheck: 'false' }) as HTMLTextAreaElement;
  const casella = (etichetta: string, val = false) => {
    const c = h('input', { type: 'checkbox', checked: val || undefined }) as HTMLInputElement;
    return { c, el: h('label.riga-tra', null, etichetta, c) };
  };
  const SEGNO: Record<SevQ, string> = { err: '⛔', warn: '⚠️', info: 'ℹ️' };

  // ================== DIAGNOSTICA ==================
  function diagnostica(testoIniziale?: string): void {
    let qs: unknown[] = [], parte = '', analisi: AnalisiQ | null = null, autoSospese = 0;
    const ta = area('JSON dei quiz da controllare (anche la chat intera)', 8);
    if (testoIniziale) ta.value = testoIniziale;
    const file = h('input', { type: 'file', multiple: true, accept: '.json,.txt,application/json,text/plain', 'aria-label': 'Carica uno o più file .json di quiz' }) as HTMLInputElement;
    file.addEventListener('change', async () => { if (!file.files || !file.files.length) return; ta.value = await testiDaFile(file.files); controlla(); });
    const rapporto = h('div', { role: 'status', 'aria-live': 'polite' });
    const registro = h('ul.piccolo.tenue');

    const correzione = h('div');
    const gem = casella('Ho un Gem con le «Regole per il Gem»'), perche = casella('Chiedi anche il perché di ogni patch');
    const outCorr = area('Prompt di correzione da copiare in Gemini', 8, true);
    const avvisiCorr = h('ul.piccolo');
    const patch = area('Risposta di Gemini (patch JSON) da applicare', 6);

    function controlla(): void {
      const L = DiagnosiQuiz.leggi(ta.value);
      rapporto.textContent = ''; registro.textContent = '';
      if (!L.quiz.length) { rapporto.appendChild(h('p', null, '⛔ ' + (L.errori[0] || 'Nessuna domanda trovata: incolla il blocco ```json con «quiz».'))); analisi = null; return; }
      qs = L.quiz; parte = L.parti[0] || parte;
      if (L.riparato) registro.appendChild(h('li', null, '🔧 Virgole finali rimosse per leggere il JSON (salva il JSON corretto qui sotto).'));
      if (L.blocchi > 1) registro.appendChild(h('li', null, 'Letti ' + L.blocchi + ' blocchi ```json dalla chat.'));
      L.errori.forEach(e => registro.appendChild(h('li', null, '⚠️ ' + e)));
      analisi = DiagnosiQuiz.analizza(qs);
      autoSospese = DiagnosiQuiz.autoFix(qs).log.length;
      disegnaRapporto(analisi);
    }
    function disegnaRapporto(A: AnalisiQ): void {
      const err = A.problemi.filter(p => p.sev === 'err'), warn = A.problemi.filter(p => p.sev === 'warn'), info = A.problemi.filter(p => p.sev === 'info');
      const pct = (x: number) => A.n ? Math.round(100 * x / A.n) + '%' : '0%';
      rapporto.appendChild(h('p', null, h('b', null, (err.length ? '⛔ ' : warn.length ? '⚠️ ' : '✅ ') + A.n + ' domande · ' + A.pronte + ' pronte per l\'import'),
        ' · ' + err.length + ' errori · ' + warn.length + ' avvisi'));
      rapporto.appendChild(h('p.piccolo', null, 'Livelli L1–L4: ' + A.lv.map(pct).join(' / ') + ' (obiettivo 25/35/25/15) · posizioni A–D: ' + A.es.map(pct).join(' / ') +
        ' · corretta più lunga: ' + pct(A.lunga) + ' · coppie gemelle: ' + A.gemelle));
      if (A.schede.length) rapporto.appendChild(h('div.scorre', null, h('table.piccolo', { 'aria-label': 'Composizione per scheda' },
        h('thead', null, h('tr', null, ...['Scheda', 'N', 'L1', 'L2', 'L3', 'L4', 'A', 'B', 'C', 'D'].map(t => h('th', { scope: 'col' }, t)))),
        h('tbody', null, ...A.schede.map(s => h('tr', null, h('th', { scope: 'row' }, s.nome), h('td', null, (s.n === DiagnosiQuiz.PER_SCHEDA ? '' : '⚠️') + s.n),
          ...s.lv.map(x => h('td', null, String(x))), ...s.es.map(x => h('td', null, String(x)))))))));
      const gruppo = (titolo: string, xs: ProblemaQ[], aperto: boolean) => xs.length ? h('details', { open: aperto || undefined }, h('summary', null, titolo + ' (' + xs.length + ')'),
        h('ul.piccolo', null, ...xs.slice(0, 150).map(p => { const [fix, why] = DiagnosiQuiz.consiglio(p.msg);
          return h('li', null, SEGNO[p.sev] + ' ', h('b', null, p.id), ' — ' + p.msg, fix ? h('div.tenue', null, '→ ' + fix + (why ? ' (' + why + ')' : '')) : null); }),
          xs.length > 150 ? h('li.tenue', null, '…e altri ' + (xs.length - 150)) : null)) : null;
      const g1 = gruppo('Errori bloccanti', err, true), g2 = gruppo('Avvisi', warn, !err.length), g3 = gruppo('Note', info, false);
      [g1, g2, g3].forEach(g => { if (g) rapporto.appendChild(g); });
      if (autoSospese) rapporto.appendChild(h('p.piccolo', null, '🔧 ' + autoSospese + ' problemi si riparano da soli: premi «Ripara automaticamente».'));
    }
    function ripara(): void {
      if (!qs.length) controlla();
      if (!qs.length) return;
      const r = DiagnosiQuiz.autoFix(qs);
      qs = r.qs; ta.value = DiagnosiQuiz.jsonFinale(qs, parte);
      rapporto.textContent = '';
      analisi = DiagnosiQuiz.analizza(qs); autoSospese = 0;
      disegnaRapporto(analisi);
      registro.textContent = '';
      (r.log.length ? r.log : ['Niente da riparare in automatico.']).slice(0, 60).forEach(x => registro.appendChild(h('li', null, '🔧 ' + x)));
    }
    function preparaCorrezione(): void {
      if (!analisi) controlla();
      if (!analisi) return;
      const r = DiagnosiQuiz.promptCorrezione(qs, analisi.problemi, { gem: gem.c.checked, perche: perche.c.checked });
      outCorr.value = r.nDomande ? r.testo : '';
      avvisiCorr.textContent = '';
      if (!r.nDomande) avvisiCorr.appendChild(h('li', null, '✅ Nessuna domanda da correggere con le patch.'));
      DiagnosiQuiz.avvisiUso({ gem: gem.c.checked, autoInSospeso: autoSospese, manuali: r.manuali, globali: r.globali })
        .forEach(a => avvisiCorr.appendChild(h('li', null, SEGNO[a.sev] + ' ', h('b', null, a.t + ': '), a.x)));
    }
    function applica(): void {
      if (!qs.length) controlla();
      if (!qs.length) return;
      const p = DiagnosiQuiz.leggiPatch(patch.value);
      if ('errore' in p) { avviso('⚠️ ' + p.errore, 6000); return; }
      const r = DiagnosiQuiz.applicaPatch(qs, p.patch);
      qs = r.qs; ta.value = DiagnosiQuiz.jsonFinale(qs, parte); patch.value = '';
      rapporto.textContent = ''; analisi = DiagnosiQuiz.analizza(qs); autoSospese = DiagnosiQuiz.autoFix(qs).log.length; disegnaRapporto(analisi);
      registro.textContent = '';
      registro.appendChild(h('li', null, '🩹 ' + r.n + ' patch applicate' + (r.mancanti.length ? ' · ID non trovati: ' + r.mancanti.join(', ') : '') + '.'));
      r.log.slice(0, 40).forEach(x => registro.appendChild(h('li', null, x)));
    }
    correzione.append(gem.el, perche.el,
      h('button.btn.neutro', { type: 'button', onclick: preparaCorrezione }, '✍️ Prepara il prompt di correzione'), outCorr,
      h('div.chips', null, h('button.chip', { type: 'button', onclick: () => { if (outCorr.value) copia(outCorr.value, outCorr); } }, '📋 Copia prompt')), avvisiCorr,
      h('p.piccolo.tenue', null, 'Incolla qui sotto SOLO il blocco di codice che risponde Gemini:'), patch,
      h('button.btn.neutro', { type: 'button', onclick: applica }, '🩹 Applica la risposta'));

    // piano di assegnazione + regole Gem
    const pref = h('input', { type: 'text', placeholder: 'biologia-3.3', 'aria-label': 'Prefisso ID (materia-step)' }) as HTMLInputElement;
    const primo = h('input', { type: 'number', min: 1, value: 1, 'aria-label': 'Numero della prima domanda' }) as HTMLInputElement;
    const quante = h('input', { type: 'number', min: 1, max: 200, value: 18, 'aria-label': 'Quante domande' }) as HTMLInputElement;
    const outTab = area('Tabella di assegnazione', 6, true);
    const regole = area('Regole per il Gem', 6, true); regole.value = DiagnosiQuiz.REGOLE_GEM;
    const piano = h('details', null, h('summary', null, '🎲 Tabella di assegnazione e regole per il Gem'),
      h('p.piccolo.tenue', null, 'Decide prima livello e posizione della risposta esatta di ogni domanda: incollala nel prompt e Gemini non sbilancia più A–D e L1–L4.'),
      h('div.chips', null, pref, primo, quante,
        h('button.chip', { type: 'button', onclick: () => {
          const p = pref.value.trim() || 'materia-1.1', n = Math.max(1, Math.min(200, Number(quante.value) || 18));
          outTab.value = DiagnosiQuiz.tabella(p, Math.max(1, Number(primo.value) || 1), DiagnosiQuiz.piano(n));
        } }, 'Genera')),
      outTab, h('div.chips', null, h('button.chip', { type: 'button', onclick: () => { if (outTab.value) copia(outTab.value, outTab); } }, '📋 Copia tabella')),
      regole, h('div.chips', null, h('button.chip', { type: 'button', onclick: () => copia(regole.value, regole) }, '📋 Copia regole Gem')));

    const corpo = h('div', null,
      h('p.piccolo.tenue', null, 'Incolla il JSON dei quiz (o l\'intera risposta di Gemini) oppure carica il file. Il controllo è locale: zero token.'),
      ta, file,
      h('div.chips', null,
        h('button.btn', { type: 'button', onclick: controlla }, '🩺 Controlla'),
        h('button.btn.neutro', { type: 'button', onclick: ripara }, '🔧 Ripara automaticamente')),
      rapporto, registro,
      h('details', null, h('summary', null, '✍️ Correzione chirurgica con Gemini (solo patch)'), correzione),
      piano,
      h('div.chips', null,
        h('button.chip', { type: 'button', onclick: () => { if (qs.length) copia(DiagnosiQuiz.jsonFinale(qs, parte), ta); } }, '📋 Copia JSON'),
        h('button.chip', { type: 'button', onclick: () => { if (qs.length) scarica((parte || 'quiz') + '.json', DiagnosiQuiz.jsonFinale(qs, parte), 'application/json'); } }, '💾 Scarica .json')),
      h('p.piccolo.tenue', null, 'Poi metti il .json nella cartella «<materia> quiz» del tuo Drive e usa «📥 Importa quiz da Drive».'));
    foglio({ titolo: '🩺 Diagnostica quiz', corpo });
    if (testoIniziale) controlla();
  }

  // ================== MASTER PROMPT ==================
  /**
   * Un PDF (di Drive o dal dispositivo) → indice di lettura su pagine campione e mappa pagine PDF ↔ stampata a tratti:
   * etichette del PDF (fonte A), se no numeri stampati letti su TUTTE le pagine (mai un solo scostamento stimato).
   */
  async function misuraPdf(dati: Blob, avanza?: (msg: string) => void): Promise<{ lettura: LetturaPdfMP; mappa: MappaPag | null; pagine: number }> {
    return TestoPdf.con(dati, async doc => {
      const tot: number = doc.numPages, campione = new Set(MasterPrompt.pagineCampione(tot));
      let et: Array<string | null> | null = null;
      try { et = await doc.getPageLabels(); } catch (e) { console.warn('[misura] etichette pagine', e); }
      const conEtichette = !!(et && MappaPagine.daEtichette(et));
      const testi: string[] = [], numeri: number[][] = [];
      for (let i = 1; i <= tot; i++) {
        if (conEtichette && !campione.has(i)) continue;
        if (avanza && !conEtichette && i % 20 === 0) avanza('Leggo i numeri di pagina: ' + i + '/' + tot + '…');
        const t = await TestoPdf.pagina(doc, i, 'eol');
        if (campione.has(i)) testi.push(t);
        numeri[i - 1] = conEtichette ? [] : MasterPrompt.numeroStampato(t);
      }
      return { lettura: MasterPrompt.indiceLettura(testi), mappa: Centro.mappaAuto(et, numeri), pagine: tot };
    });
  }
  /** Tutti i PDF di un libro (anche a segmenti) → lettura peggiore e mappa unica in pagine PDF assolute. */
  async function misura(g: GruppoLibroSQ, avanza: (msg: string) => void): Promise<{ lettura: LetturaPdfMP | null; mappa: MappaPag | null }> {
    let lettura: LetturaPdfMP | null = null;
    const segmenti: Array<{ mappa: MappaPag | null; base: number }> = [];
    for (const [k, f] of g.files.entries()) {
      const pre = g.files.length > 1 ? 'PDF ' + (k + 1) + '/' + g.files.length + ': ' : '';
      avanza(pre + (f.file ? 'leggo il file…' : 'scarico da Drive…'));
      const r = await misuraPdf(f.file || await Drive.scaricaBlob(f.id), m => avanza(pre + m));
      if (!lettura || r.lettura.pct < lettura.pct) lettura = r.lettura;
      segmenti.push({ mappa: r.mappa, base: g.libro.segmenti ? (MasterPrompt.segmentoDa(f.name) || 1) - 1 : 0 });
    }
    return { lettura, mappa: Centro.unisciSegmenti(segmenti) };
  }
  // ================== DOSSIER STUDENTE (v0.62) — raccolta dati; il calcolo è in 07-dossier.ts ==================
  const K_ESCLUSE = 'imc-dossier-escluse';   // prefisso imc-: cancellata al cambio account (Privacy.pulisciLocalStorage)
  function escluseLette(): string[] {
    try { const x = JSON.parse(localStorage.getItem(K_ESCLUSE) || '[]'); return Array.isArray(x) ? x.filter(v => typeof v === 'string') : []; }
    catch (e) { console.warn('[dossier] voci escluse illeggibili', e); return []; }
  }
  function escluseSalva(xs: string[]): void {
    try { localStorage.setItem(K_ESCLUSE, JSON.stringify(xs.slice(-200))); } catch (e) { console.warn('[dossier] voci escluse non salvate', e); }
  }
  const LV_NUM: Record<string, number> = { Sbarramento: 1, Completamento: 1, Applicativo: 2, Trabocchetto: 3, Problema: 4 };
  /** Legge da Stato solo ciò che serve al dossier di questa materia (niente identificativi: qid e sk sono id didattici). */
  function datiDossier(nome: string, codice: string): DatiDossier {
    const ms = MasterPrompt.slug(nome), cod = codice.toLowerCase();
    const testi = new Map<string, DomB>();
    for (const b of Stato.tutti<BancaImcRec>('bancaimc')) for (const d of b.domande || []) if (d && d.id) testi.set(d.id, d);
    for (const q of Stato.tutti<QCreato>('qcreato')) for (const d of q.domande || []) if (d && d.id) testi.set(d.id, d);
    const stat: StatD[] = [];
    for (const s of Stato.tutti<StatQ>('statq')) {
      const sk = String(s.sk || '').toLowerCase();
      if (!sk || !(sk.includes(ms) || sk.startsWith(cod + '-'))) continue;
      const qid = s.id.replace(/^sq-/, ''), d = testi.get(qid), nr = s.neuro;
      stat.push({ qid, sk: s.sk, n: s.n || 0, ok: s.ok || 0, scelte: s.scelte, testo: d ? d.q : undefined,
        caso: nr && nr.ultimoCaso, tag: nr && nr.tag, ease: nr && nr.ease, reps: nr && nr.reps,
        livello: d ? (d.bloomLevel || LV_NUM[d.lv]) : undefined, aperta: d && d.t === 'risposta_aperta_rubrica' ? true : undefined,
        log: (s.confidenceLog || []).map(t => ({ ts: t.ts, corretto: t.corretto, certezza: t.livelloCertezza, ms: t.tempoRispostaMs })) });
    }
    const oggiY = ymd(new Date()), t0 = Date.parse(oggiY + 'T00:00:00');
    const esami = Stato.tutti<Esame>('esame').filter(e => e.data >= oggiY && (!e.materie || !e.materie.length || e.materie.includes(codice))).sort((a, b) => a.data < b.data ? -1 : 1);
    const giorniEsame = esami.length ? Math.round((Date.parse(esami[0].data + 'T00:00:00') - t0) / 86400000) : null;
    const da = ymd(new Date(t0 - 14 * 86400000)), perG = new Map<string, number>();
    for (const s of Stato.tutti<Sessione>('sessione')) if (s.m === codice && s.data >= da && s.data <= oggiY) perG.set(s.data, (perG.get(s.data) || 0) + (s.minuti || 0));
    const minutiGiorno = perG.size ? [...perG.values()].reduce((a, b) => a + b, 0) / perG.size : null;
    return { stat, giorniEsame, minutiGiorno };
  }
  function idGiaUsati(): string[] {
    const out: string[] = [];
    for (const b of Stato.tutti<BancaImcRec>('bancaimc')) for (const d of b.domande || []) if (d && d.id) out.push(d.id);
    return out;
  }

  // ================== RACCOLTA FONTI (v0.63: condivisa da «🧠 Prompt quiz» e dal Centro di creazione) ==================
  /** Nomi di un file → categoria (libro, slide, guide, indici, quiz, vietati). Solo nomi: niente contenuto. */
  function classifica(fs: FileDrvSQ[]): { libri: Map<string, FileDrvSQ[]>; altri: Record<'slide' | 'guide' | 'quiz' | 'vietati' | 'indici', FileDrvSQ[]> } {
    const altri = { slide: [] as FileDrvSQ[], guide: [] as FileDrvSQ[], quiz: [] as FileDrvSQ[], vietati: [] as FileDrvSQ[], indici: [] as FileDrvSQ[] };
    const libri = new Map<string, FileDrvSQ[]>();
    for (const f of fs) {
      const n = f.name, pdf = /\.pdf$/i.test(n) || f.mimeType === 'application/pdf';
      if (vietato(n)) altri.vietati.push(f);
      else if (/\.json$/i.test(n) || /quiz/i.test(n)) altri.quiz.push(f);
      else if (RE_INDICE.test(n)) altri.indici.push(f);
      else if (RE_GUIDE.test(n)) altri.guide.push(f);
      else if (RE_SLIDE.test(n) || /presentation|powerpoint/i.test(f.mimeType)) altri.slide.push(f);
      else if (pdf) { const k = MasterPrompt.nomeLibro(n); libri.set(k, (libri.get(k) || []).concat(f)); }
      else altri.slide.push(f);
    }
    return { libri, altri };
  }
  /**
   * Blocco «Fonti»: con Drive collegato cerca il materiale della materia; senza Drive (ospite) si scrivono i nomi
   * dei file o si scelgono dal dispositivo (l'app ne legge solo il nome: i file li allega lo studente all'AI).
   */
  function raccoltaFonti(nomeMateria: () => string, iniziali?: FontiSQ): { el: HTMLElement; valori: () => FontiSQ; nomiNoti: () => string[] } {
    const stato = h('p.piccolo.tenue', { role: 'status', 'aria-live': 'polite' });
    const elenco = h('div');
    let gruppi: GruppoLibroSQ[] = [];
    let altri = classifica([]).altri;
    const scelti = new Set<string>();
    const incollate = area('Fonti senza Drive: un nome di file per riga (libro, syllabus, slide…)', 3);
    if (iniziali) incollate.value = [...iniziali.libri.flatMap(l => l.pdf), ...iniziali.guide, ...iniziali.slide, ...iniziali.indici, ...iniziali.quiz].join('\n');
    const daFile = h('input', { type: 'file', multiple: true, 'aria-label': 'Scegli i file delle fonti dal dispositivo (si usa solo il nome)' }) as HTMLInputElement;
    daFile.addEventListener('change', () => {
      const nomi = Array.from(daFile.files || []).map(f => f.name), gia = new Set(incollate.value.split('\n').map(x => x.trim()).filter(Boolean));
      incollate.value = [...gia, ...nomi.filter(n => !gia.has(n))].join('\n'); daFile.value = '';
    });

    async function cercaDrive(): Promise<void> {
      if (serveGoogle()) return;
      const nome = nomeMateria();
      if (!nome) { avviso('Scegli o scrivi la materia.'); return; }
      stato.textContent = 'Cerco su Drive…'; elenco.textContent = '';
      const visti = new Map<string, FileDrvSQ>();
      const aggiungi = (fs: FileDrvSQ[]) => fs.forEach(f => { if (f.mimeType !== 'application/vnd.google-apps.folder' && !visti.has(f.id)) visti.set(f.id, f); });
      try {
        aggiungi(await Drive.cerca(nome));
        for (const c of (await Drive.cercaCartelle(nome)).slice(0, 6)) aggiungi((await Drive.elencaCompleti(c.id)).slice(0, 200));
        for (const t of ['syllabus', 'programma', 'appell']) aggiungi((await Drive.cerca(t)).filter(f => new RegExp(MasterPrompt.slug(nome).slice(0, 5), 'i').test(MasterPrompt.slug(f.name)) || /syllabus/i.test(f.name)));
      } catch (e) { stato.textContent = '⚠️ Ricerca non riuscita: ' + (e instanceof Error ? e.message : String(e)); return; }
      const fs = [...visti.values()], c = classifica(fs);
      altri = c.altri;
      gruppi = [...c.libri.entries()].map(([nomeL, files]) => gruppoLibro(nomeL, files));
      scelti.clear(); [...altri.slide, ...altri.guide, ...altri.quiz, ...altri.indici].forEach(f => scelti.add(f.id));
      stato.textContent = fs.length ? 'Trovati ' + fs.length + ' file: togli la spunta a quelli da non usare e misura i libri.' : 'Nessun file trovato con il nome della materia: il prompt chiederà all\'AI di cercarli.';
      disegnaElenco();
    }
    /** Misura e mappa già salvate nel record `libro` di questa materia, se c'è. */
    function daRecord(libro: LibroMP): LibroMP {
      const rec = Stato.prendi<LibroRec>(Centro.idLibro(nomeMateria(), libro.nome));
      if (rec && !rec.deleted) { if (rec.lettura) libro.lettura = rec.lettura; libro.mappa = rec.mappa; }
      return libro;
    }
    /** PDF dello stesso libro → gruppo (segmenti in ordine). */
    function gruppoLibro(nomeL: string, files: FileDrvSQ[]): GruppoLibroSQ {
      const fs = files.slice().sort((a, b) => (MasterPrompt.segmentoDa(a.name) || 0) - (MasterPrompt.segmentoDa(b.name) || 0));
      return { usa: true, files: fs, libro: daRecord({ nome: nomeL, pdf: fs.map(f => f.name), segmenti: fs.some(f => MasterPrompt.segmentoDa(f.name) !== null) }) };
    }
    /** PDF scelti dal dispositivo (ospite o senza Drive): misurati qui sul telefono; il file non viene salvato né inviato. */
    const daPdf = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, 'aria-label': 'Scegli i PDF del libro da misurare' }) as HTMLInputElement;
    daPdf.addEventListener('change', () => {
      const fs: FileDrvSQ[] = Array.from(daPdf.files || []).map((file, i) => ({ id: 'loc-' + i + '-' + file.name, name: file.name, mimeType: 'application/pdf', file }));
      daPdf.value = '';
      for (const [nomeL, files] of classifica(fs).libri) gruppi = gruppi.filter(g => g.libro.nome !== nomeL).concat(gruppoLibro(nomeL, files));
      disegnaElenco();
    });
    function disegnaElenco(): void {
      elenco.textContent = '';
      if (gruppi.length) elenco.appendChild(h('p', null, h('b', null, '📚 Libri')));
      gruppi.forEach(g => {
        const c = h('input', { type: 'checkbox', checked: g.usa || undefined, 'aria-label': 'Usa ' + g.libro.nome }) as HTMLInputElement;
        c.addEventListener('change', () => { g.usa = c.checked; });
        const esito = h('span.piccolo.tenue', { role: 'status', 'aria-live': 'polite' }, g.libro.lettura || g.libro.mappa ? descrivi(g) : g.files.length + ' PDF' + (g.libro.segmenti ? ' a segmenti' : ''));
        const b = h('button.chip', { type: 'button', 'aria-label': 'Misura pagine e leggibilità di ' + g.libro.nome }, '📏 Misura pagine') as HTMLButtonElement;
        b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            const r = await misura(g, m => { esito.textContent = m; });
            g.libro.lettura = r.lettura; g.libro.mappa = r.mappa; delete g.libro.offset;
            const rec = recordDi(g);
            if (rec) g.libro.mappa = rec.mappa;   // una fonte B/C/D scelta prima resta
            esito.textContent = descrivi(g);
          } catch (e) { esito.textContent = '⚠️ ' + (e instanceof Error ? e.message : String(e)); }
          b.disabled = false;
        });
        const bp = h('button.chip', { type: 'button', 'aria-label': 'Pagine di ' + g.libro.nome + ': fonte, ancore, indice e prova', onclick: () => foglioPagine(g, esito) }, '⚙️ Pagine');
        elenco.appendChild(h('div.riga', null, h('label', null, c, ' ' + g.libro.nome), h('div', null, esito, ' ', b, ' ', bp)));
      });
      const sez = (titolo: string, xs: FileDrvSQ[], nota?: string) => {
        if (!xs.length) return;
        elenco.appendChild(h('p', null, h('b', null, titolo), nota ? h('span.piccolo.tenue', null, ' ' + nota) : null));
        xs.slice(0, 25).forEach(f => {
          const c = h('input', { type: 'checkbox', checked: scelti.has(f.id) || undefined, 'aria-label': 'Usa ' + f.name }) as HTMLInputElement;
          c.addEventListener('change', () => { if (c.checked) scelti.add(f.id); else scelti.delete(f.id); });
          elenco.appendChild(h('label.riga-tra.piccolo', null, f.name, c));
        });
      };
      sez('🎞️ Slide e dispense', altri.slide); sez('🧭 Syllabus e appelli', altri.guide); sez('📑 Indici', altri.indici);
      sez('🧩 Quiz già fatti', altri.quiz, '(l\'AI non li duplicherà)');
      if (altri.vietati.length) elenco.appendChild(h('p.piccolo', null, '🚫 Esclusi come fonte (eserciziari commerciali): ' + altri.vietati.map(f => f.name).slice(0, 8).join(', ')));
    }
    function descrivi(g: GruppoLibroSQ): string {
      const r = g.libro.lettura, sim = !r ? '' : r.giudizio === 'testo pieno' ? '🟢' : r.giudizio === 'parziale' ? '🟡' : '🔴';
      const rec = nomeMateria() ? Stato.prendi<LibroRec>(Centro.idLibro(nomeMateria(), g.libro.nome)) : null;
      return (r ? sim + ' lettura ' + r.pct + '% (' + r.giudizio + ') · ' : '') + (rec && !rec.deleted ? Centro.descriviLibro(rec) : Centro.descriviMappa(g.libro.mappa || null));
    }
    /** Record `libro` aggiornato con il gruppo (misura compresa) e salvato; null senza materia. */
    function recordDi(g: GruppoLibroSQ): LibroRec | null {
      const mat = nomeMateria();
      if (!mat) return null;
      const prec = Stato.prendi<LibroRec>(Centro.idLibro(mat, g.libro.nome)), nuovo = Centro.libroDa(mat, g.libro, prec);
      if (!prec || JSON.stringify(prec) !== JSON.stringify(nuovo)) Stato.salva(nuovo, true);
      return nuovo;
    }
    const blobLibro = new Map<string, Blob>();
    /** Pagina PDF assoluta del libro → canvas (sceglie il segmento giusto; il file resta sul dispositivo). */
    async function disegnaPagina(g: GruppoLibroSQ, pdf: number, tela: HTMLCanvasElement, nota: HTMLElement): Promise<void> {
      const conBase = g.files.map(f => ({ f, base: g.libro.segmenti ? (MasterPrompt.segmentoDa(f.name) || 1) - 1 : 0 })).sort((a, b) => a.base - b.base);
      const x = conBase.filter(c => c.base < pdf).pop();
      if (!x) { nota.textContent = 'Apri tu il PDF alla pagina ' + pdf + ' e leggi il numero stampato.'; tela.hidden = true; return; }
      nota.textContent = 'Carico la pagina ' + pdf + '…';
      try {
        let b = x.f.file || blobLibro.get(x.f.id);
        if (!b) { b = await Drive.scaricaBlob(x.f.id); blobLibro.set(x.f.id, b); }
        const doc = await TestoPdf.apri(b);
        try {
          const n = pdf - x.base;
          if (n > doc.numPages) { nota.textContent = 'Il PDF ha solo ' + (doc.numPages + x.base) + ' pagine.'; tela.hidden = true; return; }
          const pag = await doc.getPage(n), base = pag.getViewport({ scale: 1 });
          const dpr = Math.min(window.devicePixelRatio || 1, 2), larg = Math.min(560, (tela.parentElement?.clientWidth || 320) - 8);
          const vp = pag.getViewport({ scale: (larg / base.width) * dpr });
          tela.width = vp.width; tela.height = vp.height; tela.style.width = vp.width / dpr + 'px'; tela.hidden = false;
          await pag.render({ canvasContext: tela.getContext('2d'), viewport: vp }).promise;
          nota.textContent = 'Pagina ' + pdf + ' del PDF: quale numero è stampato (in alto o in basso)?';
        } finally { await TestoPdf.chiudi(doc); }
      } catch (e) { nota.textContent = '⚠️ Pagina non mostrata: ' + (e instanceof Error ? e.message : String(e)); tela.hidden = true; }
    }
    /** Foglio «Pagine» di un libro: fonte A–D, ancore B guidate, indice C, prova a 3 pagine. */
    function foglioPagine(g: GruppoLibroSQ, esito: HTMLElement): void {
      let rec = recordDi(g);
      if (!rec) { avviso('Scegli o scrivi la materia.'); return; }
      const riga = h('p', { role: 'status', 'aria-live': 'polite' });
      const salva = (r: LibroRec) => { rec = r; Stato.salva(r, true); riga.textContent = Centro.descriviLibro(r); disegnaAncore(); };
      riga.textContent = Centro.descriviLibro(rec);
      const FONTI: Array<[LibroRec['fonte'], string]> = [['auto', 'A · 📏 automatica (misura del PDF)'], ['mano', 'B · ✍️ guidata: leggo io i numeri stampati'], ['indice', 'C · 📑 dall’indice del libro'], ['nessuna', 'D · ⚪ senza numeri di pagina (capitoli e paragrafi)']];
      const sceltaFonte = h('fieldset', null, h('legend', null, 'Da dove prendo le pagine'), ...FONTI.map(([v, t]) => {
        const r = h('input', { type: 'radio', name: 'fonte-pagine', value: v, checked: rec!.fonte === v || undefined }) as HTMLInputElement;
        r.addEventListener('change', () => { if (r.checked) salva(Centro.conFonte(rec!, v)); });
        return h('label.riga', null, r, ' ' + t);
      }));
      // --- B guidata ---
      const tela = h('canvas.pdf-tela', { hidden: true }) as HTMLCanvasElement, notaB = h('p.piccolo.tenue', { 'aria-live': 'polite' });
      const pagPdf = h('input', { type: 'number', min: '1', value: '10', 'aria-label': 'Pagina del PDF da guardare' }) as HTMLInputElement;
      const stampata = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': 'Numero stampato su questa pagina' }) as HTMLInputElement;
      const elencoAncore = h('ul.piccolo');
      function disegnaAncore(): void {
        elencoAncore.textContent = '';
        (rec!.ancore || []).forEach(a => elencoAncore.appendChild(h('li', null, 'PDF ' + a.pdf + ' → pagina ' + a.stampata)));
      }
      disegnaAncore();
      const righeB = area('Oppure una riga per ancora: «pagina 5 = PDF 9»', 2);
      const sezB = h('details', null, h('summary', null, '✍️ B · leggo io i numeri (ancore)'),
        h('div.riga', null, pagPdf, h('button.chip', { type: 'button', 'aria-label': 'Mostra la pagina del PDF', onclick: () => { disegnaPagina(g, Number(pagPdf.value) || 1, tela, notaB); } }, '👁️ Mostra')),
        notaB, tela,
        h('div.riga', null, stampata, h('button.chip', { type: 'button', 'aria-label': 'Aggiungi ancora', onclick: () => {
          const p = Number(pagPdf.value), s = stampata.value.trim();
          if (!(p >= 1) || !s) { avviso('Scrivi la pagina del PDF e il numero stampato.'); return; }
          salva(Centro.conAncore(rec!, { pdf: p, stampata: s })); stampata.value = '';
        } }, '➕ Aggiungi ancora')),
        righeB, h('button.chip', { type: 'button', 'aria-label': 'Salva le ancore scritte', onclick: () => {
          let r = rec!, n = 0;
          for (const t of righeB.value.split('\n')) {
            const m = /^\s*(?:pagina|pag\.?|p\.?)?\s*([0-9]+|[ivxlcdm]+)\s*=\s*(?:pdf\s*)?([0-9]+)\s*$/i.exec(t);
            if (m) { r = Centro.conAncore(r, { stampata: m[1], pdf: Number(m[2]) }); n++; }
          }
          if (!n) { avviso('Nessuna riga «pagina N = PDF M» riconosciuta.'); return; }
          salva(r); righeB.value = '';
        } }, '💾 Salva righe'), elencoAncore);
      // --- C indice ---
      const testoIndice = area('Incolla qui l’indice del libro (una voce per riga, con il numero di pagina)', 5);
      const notaC = h('p.piccolo.tenue', { 'aria-live': 'polite' }, rec.indice ? rec.indice.length + ' voci dell’indice salvate.' : '');
      const sezC = h('details', null, h('summary', null, '📑 C · indice del libro'), testoIndice,
        h('button.chip', { type: 'button', 'aria-label': 'Leggi l’indice', onclick: () => {
          const v = Centro.indiceDa(testoIndice.value);
          if (!v.length) { notaC.textContent = 'Nessuna voce con numero di pagina riconosciuta.'; return; }
          salva({ ...rec!, indice: v }); notaC.textContent = v.length + ' voci dell’indice salvate.';
        } }, '📑 Leggi indice'), notaC);
      // --- prova a 3 pagine ---
      const sezProva = h('div');
      const avviaProva = () => {
        sezProva.textContent = '';
        const camp = MappaPagine.campioneProva(rec!.mappa, 3, Date.now() % 997 + 1);
        if (!camp.length) { sezProva.appendChild(h('p.piccolo.tenue', null, 'Prima serve una mappa (misura, ancore o indice).')); return; }
        sezProva.appendChild(h('p.piccolo.tenue', null, 'Apri ogni pagina e correggi il numero se sul libro è diverso.'));
        const campi = camp.map(c => {
          const inp = h('input', { type: 'text', inputmode: 'numeric', value: String(c.stampata), 'aria-label': 'Numero stampato sulla pagina ' + c.pdf + ' del PDF' }) as HTMLInputElement;
          const t = h('canvas.pdf-tela', { hidden: true }) as HTMLCanvasElement, n = h('p.piccolo.tenue', { 'aria-live': 'polite' });
          sezProva.appendChild(h('div', null, h('div.riga', null, h('span', null, 'PDF ' + c.pdf + ': '), inp,
            h('button.chip', { type: 'button', 'aria-label': 'Mostra la pagina ' + c.pdf + ' del PDF', onclick: () => { disegnaPagina(g, c.pdf, t, n); } }, '👁️')), n, t));
          return { c, inp };
        });
        sezProva.appendChild(h('button.btn', { type: 'button', 'aria-label': 'Conferma la prova', onclick: () => {
          salva(Centro.conProva(rec!, campi.map(x => ({ pdf: x.c.pdf, stampata: x.c.stampata, letta: x.inp.value })), ymd(new Date())));
          sezProva.textContent = '';
        } }, '✅ Conferma prova'));
      };
      const corpo = h('div', null, riga, sceltaFonte, sezB, sezC,
        h('button.chip', { type: 'button', 'aria-label': 'Prova la mappa su 3 pagine', onclick: avviaProva }, '🧪 Prova a 3 pagine'), sezProva);
      foglio({ titolo: '📄 Pagine di ' + g.libro.nome, corpo, allaChiusura: () => {
        if (rec) { if (rec.lettura) g.libro.lettura = rec.lettura; g.libro.mappa = rec.mappa; }
        esito.textContent = descrivi(g);
      } });
    }
    /** Nomi scritti a mano o scelti da file → stesse categorie della ricerca su Drive. */
    function daIncollate(): ReturnType<typeof classifica> {
      const fs = incollate.value.split('\n').map(x => x.trim()).filter(Boolean).map((name, i) => ({ id: 'man-' + i, name, mimeType: '' }));
      return classifica(fs);
    }
    function valori(): FontiSQ {
      const m = daIncollate(), nomi = (xs: FileDrvSQ[], tutti = false) => xs.filter(f => tutti || scelti.has(f.id)).map(f => f.name);
      const libriMan: LibroMP[] = [...m.libri.entries()].map(([nome, files]) => daRecord({ nome, pdf: files.map(f => f.name) }));
      const libriDrv = gruppi.filter(g => g.usa).map(g => g.libro), visti = new Set(libriDrv.map(l => l.nome));
      return { libri: [...libriDrv, ...libriMan.filter(l => !visti.has(l.nome))],
        slide: [...nomi(altri.slide), ...nomi(m.altri.slide, true)], guide: [...nomi(altri.guide), ...nomi(m.altri.guide, true)],
        indici: [...nomi(altri.indici), ...nomi(m.altri.indici, true)], quiz: [...nomi(altri.quiz), ...nomi(m.altri.quiz, true)],
        vietati: [...altri.vietati, ...m.altri.vietati].map(f => f.name) };
    }
    const nomiNoti = () => [...gruppi.flatMap(g => g.files), ...altri.slide, ...altri.guide, ...altri.quiz, ...altri.indici, ...altri.vietati].map(f => f.name)
      .concat(incollate.value.split('\n').map(x => x.trim()).filter(Boolean));
    const el = h('div.fonti', null,
      h('button.btn.neutro', { type: 'button', onclick: () => { cercaDrive(); } }, '🔎 Cerca materiale su Drive'), stato, elenco,
      h('details', { open: (!Drive.pronto && !!iniziali) || undefined }, h('summary', null, '📎 Fonti senza Drive (nomi dei file da allegare all\'AI)'),
        h('p.piccolo.tenue', null, 'Scrivi un nome per riga o scegli i file: l\'app legge solo il nome, i file li alleghi tu alla chat dell\'AI.'), incollate, daFile,
        h('p.piccolo.tenue', null, '📏 Misura le pagine di un libro dal dispositivo: l\'app legge i numeri di pagina del PDF qui (il file non viene salvato né inviato).'), daPdf));
    return { el, valori, nomiNoti };
  }
  /** Regole del dossier di una materia/step (se lo step non ha risposte: tutta la materia) e controllo privacy. */
  function regoleDossier(nome: string, codice: string, stepV: string, nomiFile: string[], escl = escluseLette()): { d: DossierS | null; regole: string[]; problemi: string[] } {
    if (!nome) return { d: null, regole: [], problemi: [] };
    const dati = datiDossier(nome, codice), oggiY = ymd(new Date());
    const d0 = Dossier.calcola(dati, { materia: nome, step: stepV, oggi: oggiY });
    const d = d0.tentativi || !d0.step ? d0 : Dossier.calcola(dati, { materia: nome, oggi: oggiY });
    const regole = Dossier.regole(d, escl);
    return { d, regole, problemi: Dossier.controllaPrivacy(regole.join('\n'), { email: Privacy.accLocale(), dispositivo: Privacy.idDispositivo(), nomiFile }) };
  }

  function prompt(): void {
    const materie = Stato.tutti<MateriaRec>('materia').sort((a, b) => a.nome.localeCompare(b.nome));
    const selMat = h('select', { 'aria-label': 'Materia' }, ...materie.map(m => h('option', { value: m.codice }, m.nome)),
      h('option', { value: '' }, 'Altra materia…')) as HTMLSelectElement;
    const altra = h('input', { type: 'text', placeholder: 'Nome della materia', 'aria-label': 'Nome di un\'altra materia', hidden: materie.length ? true : undefined }) as HTMLInputElement;
    if (!materie.length) selMat.value = '';
    const step = h('input', { type: 'text', placeholder: 'es. 3.3', 'aria-label': 'Step (es. 3.3)' }) as HTMLInputElement;
    const titolo = h('input', { type: 'text', placeholder: 'Titolo dello step (facoltativo)', 'aria-label': 'Titolo dello step' }) as HTMLInputElement;
    const data = h('input', { type: 'date', 'aria-label': 'Data prevista' }) as HTMLInputElement;
    const intens = h('select', { 'aria-label': 'Intensità' }, h('option', { value: 'leggera' }, 'Leggera (10–14 schede)'),
      h('option', { value: 'standard', selected: true }, 'Standard (18–25 schede)'), h('option', { value: 'intensa' }, 'Intensa (24–30 schede)')) as HTMLSelectElement;
    const perMsg = h('select', { 'aria-label': 'Schede per messaggio' }, h('option', { value: '2' }, '2 schede per messaggio'), h('option', { value: '1' }, '1 scheda per messaggio (account gratuito)')) as HTMLSelectElement;
    const gem = casella('Uso un Gem con le «Regole per il Gem»');
    const usaDos = casella('Usa il mio dossier (regole dai miei quiz)', true);
    const dosBox = h('div.dossier', { hidden: true, role: 'region', 'aria-label': 'Dossier studente' });
    const btnDos = h('button.chip', { type: 'button', 'aria-expanded': 'false', 'aria-label': 'Vedi dossier' }, '👁 Vedi dossier') as HTMLButtonElement;
    let escluse = escluseLette(), problemiPrivacy: string[] = [];
    const note = area('Richieste particolari (facoltativo)', 2);
    const out = area('Master prompt da copiare in Gemini', 10, true);
    const info = h('p.piccolo.tenue');
    const materia = (): { m: MateriaRec | null; nome: string; codice: string } => {
      const m = materie.find(x => x.codice === selMat.value) || null;
      const nome = m ? m.nome : altra.value.trim();
      return { m, nome, codice: m ? m.codice : nome.slice(0, 1).toUpperCase() };
    };
    selMat.addEventListener('change', () => { altra.hidden = !!selMat.value; });
    const fonti = raccoltaFonti(() => materia().nome);

    /** Dossier della materia e dello step (se lo step non ha ancora risposte: tutta la materia). */
    function dossier(): DossierS | null {
      const { nome, codice } = materia();
      if (!nome) return null;
      const dati = datiDossier(nome, codice), oggiY = ymd(new Date());
      const d = Dossier.calcola(dati, { materia: nome, step: step.value.trim(), oggi: oggiY });
      return d.tentativi || !d.step ? d : Dossier.calcola(dati, { materia: nome, oggi: oggiY });
    }
    function controllaDossier(regole: string[]): string[] {
      return Dossier.controllaPrivacy(regole.join('\n'), { email: Privacy.accLocale(), dispositivo: Privacy.idDispositivo(), nomiFile: fonti.nomiNoti() });
    }
    function disegnaDossier(): void {
      dosBox.textContent = '';
      const d = dossier();
      if (!d) { dosBox.appendChild(h('p.piccolo.tenue', null, 'Scegli prima la materia.')); return; }
      const regole = Dossier.regole(d, escluse), problemi = controllaDossier(regole);
      dosBox.appendChild(h('p.piccolo', null, h('b', null, '🗂️ Dossier — ' + d.materia + (d.step ? ' · step ' + d.step : ' · tutta la materia')), ' · ' + d.tentativi + ' risposte'));
      if (d.insufficiente || !d.voci.length) dosBox.appendChild(h('p.piccolo.tenue', null, 'Dati insufficienti: fai qualche quiz in app di questa materia e il dossier ti dirà dove insistere.'));
      for (const v of d.voci) {
        const testoV = h('span', null, h('b', null, v.titolo), h('br'), h('span.piccolo.tenue', null, v.motivo), v.regola ? h('span.piccolo', null, h('br'), '→ all\'AI: ' + v.regola) : h('span.piccolo.tenue', null, ' (solo per te, non va all\'AI)'));
        if (!v.regola) { dosBox.appendChild(h('p.dossier-voce', null, testoV)); continue; }
        const c = h('input', { type: 'checkbox', checked: escluse.includes(v.id) ? undefined : true, 'aria-label': 'Manda all\'AI: ' + v.titolo }) as HTMLInputElement;
        c.addEventListener('change', () => {
          escluse = c.checked ? escluse.filter(x => x !== v.id) : escluse.concat(v.id);
          escluseSalva(escluse); disegnaDossier(); if (out.value) genera();
        });
        dosBox.appendChild(h('label.dossier-voce.riga-tra', null, testoV, c));
      }
      dosBox.appendChild(h('p.piccolo', { role: 'status' }, problemi.length ? '⛔ Controllo privacy: ' + problemi.join(' ') + ' Togli la voce per poter copiare.'
        : '✅ Controllo privacy: nessun dato identificativo. All\'AI ' + (regole.length === 1 ? 'va 1 regola' : 'vanno ' + regole.length + ' regole') + '.'));
    }
    btnDos.addEventListener('click', () => {
      const apri = dosBox.hidden;
      dosBox.hidden = !apri; btnDos.setAttribute('aria-expanded', String(apri));
      if (apri) disegnaDossier();
    });
    function genera(): void {
      const { m, nome, codice } = materia();
      if (!nome) { avviso('Scegli o scrivi la materia.'); return; }
      if (!/^\d+(\.\d+)*$/.test(step.value.trim())) { avviso('Scrivi lo step come numero, es. 3.3.'); step.focus(); return; }
      const arch = (m && m.archetipo) || Dominio.archetipoMateria(nome) || 'scienze_sperimentali';
      const def = (ARCHETIPI_DISCIPLINARI as Record<string, { etichetta: string } | undefined>)[arch];
      const fv = fonti.valori();
      const opz: OpzMP = {
        materia: nome, codice, step: step.value.trim(), titolo: titolo.value.trim() || undefined, data: data.value || undefined,
        archetipo: arch, etichettaArchetipo: def ? def.etichetta : arch, tono: Dominio.profilo().tonoSpiegazioneAI,
        intensita: intens.value as OpzMP['intensita'], perMessaggio: perMsg.value === '1' ? 1 : 2, gem: gem.c.checked,
        libri: fv.libri, slide: fv.slide, guide: fv.guide, indici: fv.indici, quizEsistenti: fv.quiz, vietati: fv.vietati, idEsistenti: idGiaUsati(),
        note: note.value.trim() || undefined,
      };
      const d = usaDos.c.checked ? dossier() : null;
      opz.dossier = d ? Dossier.regole(d, escluse) : [];
      problemiPrivacy = controllaDossier(opz.dossier);
      out.value = MasterPrompt.costruisci(opz);
      bloccaCopia();
      if (!dosBox.hidden) disegnaDossier();
      if (problemiPrivacy.length) avviso('⛔ Il dossier contiene dati identificativi: apri «Vedi dossier» e togli la voce.', 6000);
      const nonMisurati = (opz.libri || []).filter(l => !l.lettura).length;
      info.textContent = out.value.length.toLocaleString('it-IT') + ' caratteri' + (nonMisurati ? ' · ' + nonMisurati + ' libri non misurati: Gemini citerà capitolo e paragrafo.' : '') +
        ' · Allega a Gemini il Drive (o i file elencati), incolla il prompt, poi controlla ogni risposta con «🩺 Diagnostica quiz».';
    }
    const btnCopia = h('button.chip', { type: 'button', onclick: () => { if (out.value && !problemiPrivacy.length) copia(out.value, out); } }, '📋 Copia prompt') as HTMLButtonElement;
    const btnScarica = h('button.chip', { type: 'button', onclick: () => { if (out.value && !problemiPrivacy.length) scarica('prompt-quiz-' + MasterPrompt.slug(materia().nome) + '-' + step.value.trim() + '.txt', out.value, 'text/plain'); } }, '💾 Scarica .txt') as HTMLButtonElement;
    function bloccaCopia(): void { btnCopia.disabled = btnScarica.disabled = problemiPrivacy.length > 0; }
    const corpo = h('div', null,
      h('p.piccolo.tenue', null, 'Prepara il prompt completo per far creare a Gemini le schede di quiz di uno step, nel formato che l\'app importa. Più dati trova l\'app, più il prompt è mirato.'),
      selMat, altra, h('div.chips', null, step, data), titolo, intens, perMsg, gem.el, h('p.piccolo.tenue', null, 'Hai un Gem con le regole vecchie? Copia queste istruzioni nuove nel Gem: l\'app ora chiede il formato quiz-v3 e fa da sola ID, posizioni e conteggi.'), usaDos.el, h('div.chips', null, btnDos), dosBox, note,
      fonti.el,
      h('button.btn', { type: 'button', onclick: genera }, '🧠 Genera il prompt'), out, info,
      h('div.chips', null,
        btnCopia, btnScarica,
        h('button.chip', { type: 'button', onclick: () => diagnostica() }, '🩺 Diagnostica quiz')));
    foglio({ titolo: '🧠 Prompt quiz per Gemini', corpo });
  }

  return { diagnostica, prompt, raccoltaFonti, regoleDossier, idGiaUsati, copia, esclusi, salvaEsclusi, vietato };
})();
