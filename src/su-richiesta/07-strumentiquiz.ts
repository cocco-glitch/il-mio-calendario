// =====================================================================
// 07-strumentiquiz.ts — v0.59.2: UI dei due strumenti per i quiz fatti con un'AI esterna (Gemini, accessibile a tutti)
//  • «🧠 Prompt quiz per Gemini»: costruisce il master prompt su misura (materia, step, archetipo, modalità, materiale
//    trovato su Drive, indice di lettura dei PDF misurato qui, ID già usati, punti deboli). Logica in 07-masterprompt.ts.
//  • «🩺 Diagnostica quiz»: controlla il JSON restituito, ripara il riparabile, prepara il prompt di correzione
//    chirurgica e applica le patch, senza spendere token. Logica in 07-diagnosiquiz.ts.
// =====================================================================
interface FileDrvSQ { id: string; name: string; mimeType: string; }
interface GruppoLibroSQ { libro: LibroMP; files: FileDrvSQ[]; usa: boolean; }

const StrumentiQuiz = (() => {
  const RE_VIETATI = /\bTB\b|TB\.pdf|testbusters|alpha ?test|editest/i;
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
    const file = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', 'aria-label': 'Carica un file .json di quiz' }) as HTMLInputElement;
    file.addEventListener('change', async () => { const f = file.files && file.files[0]; if (!f) return; ta.value = await f.text(); controlla(); });
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
  /** Pagine campione di un PDF di Drive → indice di lettura e mappa pagine PDF ↔ stampata (etichette del PDF, se no scostamento stimato). */
  async function misura(f: FileDrvSQ): Promise<{ lettura: LetturaPdfMP; offset: number | null; mappa: MappaPag | null; pagine: number }> {
    const L = await caricaPdfJs();
    const blob = await Drive.scaricaBlob(f.id);
    const doc = await L.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
    const tot: number = doc.numPages, base = (MasterPrompt.segmentoDa(f.name) || 1) - 1;
    const testi: string[] = [], campioni: Array<{ pdf: number; testo: string }> = [];
    for (const i of MasterPrompt.pagineCampione(tot)) {
      const p = await doc.getPage(i);
      const tc: { items: Array<{ str?: string; hasEOL?: boolean }> } = await p.getTextContent();
      const t = tc.items.map(x => (x.str || '') + (x.hasEOL ? '\n' : ' ')).join('');
      testi.push(t); campioni.push({ pdf: base + i, testo: t });
    }
    let mappa: MappaPag | null = null;
    try { const et: Array<string | null> | null = await doc.getPageLabels(); if (et) mappa = MappaPagine.daEtichette(et); }
    catch (e) { console.warn('[prompt quiz] etichette pagine', e); }
    if (mappa) mappa.tratti.forEach(t => { t.pdfDa += base; t.pdfA += base; });   // segmenti: pagine PDF assolute
    if (typeof doc.destroy === 'function') await doc.destroy();
    const offset = MasterPrompt.stimaOffset(campioni);   // ripiego interno quando il PDF non ha etichette
    return { lettura: MasterPrompt.indiceLettura(testi), offset, mappa: mappa || (offset === null ? null : { fonte: 'auto-stampati', tratti: [{ pdfDa: offset + 1, pdfA: MappaPagine.APERTO, stampDa: 1 }], affidabilita: 'stimata' }), pagine: tot };
  }
  /** Punti deboli dalle statistiche dei quiz: schede di questa materia con meno del 60% di risposte giuste. */
  function puntiDeboli(m: MateriaRec): string[] {
    const ms = MasterPrompt.slug(m.nome), cod = m.codice.toLowerCase();
    const per = new Map<string, { n: number; ok: number }>();
    for (const s of Stato.tutti<StatQ>('statq')) {
      const sk = String(s.sk || '').toLowerCase();
      if (!sk || !(sk.includes(ms) || sk.startsWith(cod + '-'))) continue;
      const v = per.get(s.sk) || { n: 0, ok: 0 }; v.n += s.n || 0; v.ok += s.ok || 0; per.set(s.sk, v);
    }
    return [...per.entries()].filter(([, v]) => v.n >= 3 && v.ok / v.n < 0.6).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)
      .slice(0, 6).map(([sk, v]) => sk + ' (' + Math.round(100 * v.ok / v.n) + '%)');
  }
  function idGiaUsati(): string[] {
    const out: string[] = [];
    for (const b of Stato.tutti<BancaImcRec>('bancaimc')) for (const d of b.domande || []) if (d && d.id) out.push(d.id);
    return out;
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
    const deboli = casella('Insisti sui miei punti deboli (dalle statistiche)', true);
    const note = area('Richieste particolari (facoltativo)', 2);
    const stato = h('p.piccolo.tenue', { role: 'status', 'aria-live': 'polite' });
    const elenco = h('div');
    const out = area('Master prompt da copiare in Gemini', 10, true);
    const info = h('p.piccolo.tenue');
    let gruppi: GruppoLibroSQ[] = [];
    const altri = { slide: [] as FileDrvSQ[], guide: [] as FileDrvSQ[], quiz: [] as FileDrvSQ[], vietati: [] as FileDrvSQ[], indici: [] as FileDrvSQ[] };
    const scelti = new Set<string>();

    const materia = (): { m: MateriaRec | null; nome: string; codice: string } => {
      const m = materie.find(x => x.codice === selMat.value) || null;
      const nome = m ? m.nome : altra.value.trim();
      return { m, nome, codice: m ? m.codice : nome.slice(0, 1).toUpperCase() };
    };
    selMat.addEventListener('change', () => { altra.hidden = !!selMat.value; });

    async function cercaDrive(): Promise<void> {
      if (serveGoogle()) return;
      const { nome } = materia();
      if (!nome) { avviso('Scegli o scrivi la materia.'); return; }
      stato.textContent = 'Cerco su Drive…'; elenco.textContent = '';
      const visti = new Map<string, FileDrvSQ>();
      const aggiungi = (fs: FileDrvSQ[]) => fs.forEach(f => { if (f.mimeType !== 'application/vnd.google-apps.folder' && !visti.has(f.id)) visti.set(f.id, f); });
      try {
        aggiungi(await Drive.cerca(nome));
        for (const c of (await Drive.cercaCartelle(nome)).slice(0, 6)) aggiungi((await Drive.elencaCompleti(c.id)).slice(0, 200));
        for (const t of ['syllabus', 'programma', 'appell']) aggiungi((await Drive.cerca(t)).filter(f => new RegExp(MasterPrompt.slug(nome).slice(0, 5), 'i').test(MasterPrompt.slug(f.name)) || /syllabus/i.test(f.name)));
      } catch (e) { stato.textContent = '⚠️ Ricerca non riuscita: ' + (e instanceof Error ? e.message : String(e)); return; }
      const fs = [...visti.values()];
      altri.slide = []; altri.guide = []; altri.quiz = []; altri.vietati = []; altri.indici = [];
      const libri = new Map<string, FileDrvSQ[]>();
      for (const f of fs) {
        const n = f.name, pdf = /\.pdf$/i.test(n) || f.mimeType === 'application/pdf';
        if (RE_VIETATI.test(n)) altri.vietati.push(f);
        else if (/\.json$/i.test(n) || /quiz/i.test(n)) altri.quiz.push(f);
        else if (RE_INDICE.test(n)) altri.indici.push(f);
        else if (RE_GUIDE.test(n)) altri.guide.push(f);
        else if (RE_SLIDE.test(n) || /presentation|powerpoint/i.test(f.mimeType)) altri.slide.push(f);
        else if (pdf) { const k = MasterPrompt.nomeLibro(n); libri.set(k, (libri.get(k) || []).concat(f)); }
        else altri.slide.push(f);
      }
      gruppi = [...libri.entries()].map(([nomeL, files]) => ({ files: files.sort((a, b) => (MasterPrompt.segmentoDa(a.name) || 0) - (MasterPrompt.segmentoDa(b.name) || 0)),
        usa: true, libro: { nome: nomeL, pdf: files.map(f => f.name), segmenti: files.some(f => MasterPrompt.segmentoDa(f.name) !== null) } }));
      scelti.clear(); [...altri.slide, ...altri.guide, ...altri.quiz, ...altri.indici].forEach(f => scelti.add(f.id));
      stato.textContent = fs.length ? 'Trovati ' + fs.length + ' file: togli la spunta a quelli da non usare e misura i libri.' : 'Nessun file trovato con il nome della materia: il prompt chiederà a Gemini di cercarli.';
      disegnaElenco();
    }
    function disegnaElenco(): void {
      elenco.textContent = '';
      if (gruppi.length) elenco.appendChild(h('p', null, h('b', null, '📚 Libri')));
      gruppi.forEach(g => {
        const c = h('input', { type: 'checkbox', checked: g.usa || undefined, 'aria-label': 'Usa ' + g.libro.nome }) as HTMLInputElement;
        c.addEventListener('change', () => { g.usa = c.checked; });
        const esito = h('span.piccolo.tenue', null, g.libro.lettura ? descrivi(g) : g.files.length + ' PDF' + (g.libro.segmenti ? ' a segmenti' : ''));
        const b = h('button.chip', { type: 'button', 'aria-label': 'Misura la leggibilità di ' + g.libro.nome }, '📏 Misura leggibilità') as HTMLButtonElement;
        b.addEventListener('click', async () => {
          b.disabled = true; esito.textContent = 'Scarico e leggo pagine campione…';
          try {
            const r = await misura(g.files[0]);
            g.libro.lettura = r.lettura; g.libro.offset = r.offset; g.libro.mappa = r.mappa; esito.textContent = descrivi(g);
          } catch (e) { esito.textContent = '⚠️ ' + (e instanceof Error ? e.message : String(e)); }
          b.disabled = false;
        });
        elenco.appendChild(h('div.riga', null, h('label', null, c, ' ' + g.libro.nome), h('div', null, esito, ' ', b)));
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
      sez('🧩 Quiz già fatti', altri.quiz, '(Gemini non li duplicherà)');
      if (altri.vietati.length) elenco.appendChild(h('p.piccolo', null, '🚫 Esclusi come fonte (eserciziari commerciali): ' + altri.vietati.map(f => f.name).slice(0, 8).join(', ')));
    }
    function descrivi(g: GruppoLibroSQ): string {
      const r = g.libro.lettura;
      if (!r) return '';
      const sim = r.giudizio === 'testo pieno' ? '🟢' : r.giudizio === 'parziale' ? '🟡' : '🔴';
      return sim + ' lettura ' + r.pct + '% (' + r.giudizio + ')' + (g.libro.mappa ? ' · pagine ' + (g.libro.mappa.affidabilita === 'esatta' ? 'dalle etichette del PDF' : 'stimate (PDF = libro + ' + g.libro.offset + ')') : ' · pagine non rilevate: si citano capitolo e paragrafo');
    }
    function genera(): void {
      const { m, nome, codice } = materia();
      if (!nome) { avviso('Scegli o scrivi la materia.'); return; }
      if (!/^\d+(\.\d+)*$/.test(step.value.trim())) { avviso('Scrivi lo step come numero, es. 3.3.'); step.focus(); return; }
      const arch = (m && m.archetipo) || Dominio.archetipoMateria(nome) || 'scienze_sperimentali';
      const def = (ARCHETIPI_DISCIPLINARI as Record<string, { etichetta: string } | undefined>)[arch];
      const nomi = (xs: FileDrvSQ[]) => xs.filter(f => scelti.has(f.id)).map(f => f.name);
      const opz: OpzMP = {
        materia: nome, codice, step: step.value.trim(), titolo: titolo.value.trim() || undefined, data: data.value || undefined,
        archetipo: arch, etichettaArchetipo: def ? def.etichetta : arch, tono: Dominio.profilo().tonoSpiegazioneAI,
        intensita: intens.value as OpzMP['intensita'], perMessaggio: perMsg.value === '1' ? 1 : 2, gem: gem.c.checked,
        libri: gruppi.filter(g => g.usa).map(g => g.libro), slide: nomi(altri.slide), guide: nomi(altri.guide), indici: nomi(altri.indici),
        quizEsistenti: nomi(altri.quiz), vietati: altri.vietati.map(f => f.name), idEsistenti: idGiaUsati(),
        puntiDeboli: deboli.c.checked && m ? puntiDeboli(m) : [], note: note.value.trim() || undefined,
      };
      out.value = MasterPrompt.costruisci(opz);
      const nonMisurati = (opz.libri || []).filter(l => !l.lettura).length;
      info.textContent = out.value.length.toLocaleString('it-IT') + ' caratteri' + (nonMisurati ? ' · ' + nonMisurati + ' libri non misurati: Gemini citerà capitolo e paragrafo.' : '') +
        ' · Allega a Gemini il Drive (o i file elencati), incolla il prompt, poi controlla ogni risposta con «🩺 Diagnostica quiz».';
    }
    const corpo = h('div', null,
      h('p.piccolo.tenue', null, 'Prepara il prompt completo per far creare a Gemini le schede di quiz di uno step, nel formato che l\'app importa. Più dati trova l\'app, più il prompt è mirato.'),
      selMat, altra, h('div.chips', null, step, data), titolo, intens, perMsg, gem.el, h('p.piccolo.tenue', null, 'Hai un Gem con le regole vecchie? Copia queste istruzioni nuove nel Gem: l\'app ora chiede il formato quiz-v3 e fa da sola ID, posizioni e conteggi.'), deboli.el, note,
      h('button.btn.neutro', { type: 'button', onclick: () => { cercaDrive(); } }, '🔎 Cerca materiale su Drive'), stato, elenco,
      h('button.btn', { type: 'button', onclick: genera }, '🧠 Genera il prompt'), out, info,
      h('div.chips', null,
        h('button.chip', { type: 'button', onclick: () => { if (out.value) copia(out.value, out); } }, '📋 Copia prompt'),
        h('button.chip', { type: 'button', onclick: () => { if (out.value) scarica('prompt-quiz-' + MasterPrompt.slug(materia().nome) + '-' + step.value.trim() + '.txt', out.value, 'text/plain'); } }, '💾 Scarica .txt'),
        h('button.chip', { type: 'button', onclick: () => diagnostica() }, '🩺 Diagnostica quiz')));
    foglio({ titolo: '🧠 Prompt quiz per Gemini', corpo });
  }

  return { diagnostica, prompt };
})();
