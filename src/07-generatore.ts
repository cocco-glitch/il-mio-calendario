// 07-generatore.ts — Generatore di piani di studio (v0.19, F5).
//
// Ispirazione (ricerca 12/11): i planner per esami (StudySmarter, Exam Study Planner, Notion/Shovel)
// chiedono data dell'esame, argomenti e ore disponibili e producono un calendario che si adatta; la
// letteratura sul ripasso suggerisce tre fasi — basi → applicazione → prestazione (simulazioni a tempo) —
// con argomenti alternati tra materie (interleaving) e un secondo passaggio distanziato sui deboli.
//
// Il piano generato è un pacchetto 'piano' con id 'gen-…': affianca gli altri (non li sostituisce),
// compare in Oggi, nel calendario e nel ritardo, e si ripianifica con lo stesso pulsante.
// Le opzioni restano nel piano (campo 'generato') così «Rigenera» lo ricostruisce con i dati di oggi.

interface OpzGen {
  titolo: string; esame: string; inizio: string; modo: 'teoria' | 'raffinamento';
  argomenti: string[];          // chiavi di sotto-step (o 'TXT-n' per argomenti incollati)
  testi?: Record<string, string>;
  deboliPrima: boolean;
  giorniSett: number[];         // 0 = domenica … 6 = sabato
  ore: number; minArg: number;
  riservaOgni: number; simulazioni: number; finale: number; riposo: boolean; secondoGiro: boolean;
}
interface PianoGen extends PkPiano { generato: OpzGen; capienza: number; }

const Generatore = (() => {
  const piu = (k: string, n: number) => { const d = daDt(k); d.setDate(d.getDate() + n); return ymd(d); };
  const tra = (a: string, b: string) => Math.round((daDt(b).getTime() - daDt(a).getTime()) / 86400000);

  /** Quanto è debole un sotto-step (0 = solido, 1 = da rifare): punteggi, schede da rifare, ricordo. */
  /** Ha dati veri (punteggi o ripassi)? Senza, la debolezza è una stima neutra (0.6). */
  function haDati(k: string): boolean {
    const t = Studio.trovaSotto(k); if (!t) return false;
    return Ripassi.ricordo(k) != null || Studio.schedeDi(t.sub).some(s => { const p = Studio.prog(s.id); return !!(p && p.fatta && p.punteggio != null); });
  }
  function debolezza(k: string): number {
    const t = Studio.trovaSotto(k); if (!t) return .5;
    const sch = Studio.schedeDi(t.sub).filter(s => s.tipo === 'P');
    const pt = sch.map(s => Studio.prog(s.id)).filter(p => p && p.fatta && p.punteggio != null).map(p => p!.punteggio!);
    let w = pt.length ? 1 - pt.reduce((a, b) => a + b, 0) / pt.length / 100 : .6;
    w += Math.min(.3, sch.filter(s => { const p = Studio.prog(s.id); return p && p.daRifare; }).length * .1);
    const r = Ripassi.ricordo(k); if (r != null && r < .8) w += (.8 - r) * .5;
    return Math.max(0, Math.min(1, w));
  }
  /** Tutti i sotto-step disponibili, con materia e debolezza. */
  function catalogo(): { k: string; t: string; m: string; w: number; dati: boolean }[] {
    const out: { k: string; t: string; m: string; w: number; dati: boolean }[] = [];
    for (const pk of Studio.pkStep()) for (const ma of pk.materie) for (const s of ma.sottostep) out.push({ k: s.k, t: s.titolo, m: ma.m, w: debolezza(s.k), dati: haDati(s.k) });
    return out;
  }
  const capienza = (o: OpzGen) => Math.max(1, Math.min(4, Math.floor(o.ore * 60 / o.minArg)));

  /** Ordine degli argomenti: alternati tra materie; nel raffinamento (o se chiesto) prima i più deboli. */
  function ordina(o: OpzGen): { k: string; t: string; m: string; w: number; dati: boolean }[] {
    const cat = new Map(catalogo().map(x => [x.k, x]));
    const lista = o.argomenti.map((k, i) => { const c = cat.get(k); return { k, t: c ? c.t : (o.testi || {})[k] || k, m: c ? c.m : 'TXT', w: c ? c.w : .5, dati: c ? c.dati : false, i }; });
    const gruppi = new Map<string, typeof lista>();
    for (const x of lista) { if (!gruppi.has(x.m)) gruppi.set(x.m, []); gruppi.get(x.m)!.push(x); }
    for (const g of gruppi.values()) g.sort((a, b) => o.deboliPrima ? b.w - a.w || a.i - b.i : a.i - b.i);
    const out: typeof lista = [], code = Array.from(gruppi.values());
    while (code.some(c => c.length)) for (const c of code) if (c.length) out.push(c.shift()!);
    return out;
  }

  /** Costruisce il piano. Non salva nulla. */
  function genera(o: OpzGen): { piano: PianoGen; fuori: string[]; avvisi: string[] } {
    const cap = capienza(o), avvisi: string[] = [];
    const giorni = new Map<string, GiornoPiano>();
    const metti = (d: string, v: VocePiano) => { if (!giorni.has(d)) giorni.set(d, { data: d, voci: [] }); giorni.get(d)!.voci.push(v); };
    // 1) giorni disponibili prima dell'esame
    const tutti: string[] = [];
    for (let d = o.inizio; d < o.esame; d = piu(d, 1)) if (o.giorniSett.includes(daDt(d).getDay())) tutti.push(d);
    let liberi = tutti.slice();
    // 2) coda: vigilia di riposo, ripasso finale
    if (o.riposo && liberi.length && liberi[liberi.length - 1] === piu(o.esame, -1)) { metti(liberi.pop()!, { k: 'RIPOSO', t: '😌 Riposo pre-esame', d: 'Niente teoria nuova: una passeggiata, formule a colpo d\'occhio, a letto presto.', speciale: true }); }
    for (let i = o.finale; i > 0 && liberi.length; i--) metti(liberi.pop()!, { k: 'FINALE-' + i, t: '📚 Ripasso finale ' + (o.finale - i + 1) + '/' + o.finale, d: 'Tabelle, formule ed errori ricorrenti. Ripassi e flashcard di oggi.', speciale: true });
    // 3) simulazioni nella fase "prestazione" (ultimo 40% dei giorni rimasti), ognuna seguita dalla revisione
    const sim: string[] = [];
    if (o.simulazioni > 0 && liberi.length > 4) {
      const da = Math.floor(liberi.length * .6), span = liberi.length - da;
      for (let i = 0; i < o.simulazioni; i++) { const idx = da + Math.floor((i + 1) * span / (o.simulazioni + 1)) - 1; if (idx >= 0 && idx < liberi.length && !sim.includes(liberi[idx])) sim.push(liberi[idx]); }
      sim.forEach((d, i) => metti(d, { k: 'SIM-' + (i + 1), t: '⏱ Simulazione ' + (i + 1), d: 'A tempo, come all\'esame. Poi registra il punteggio.', speciale: true }));
      liberi = liberi.filter(d => !sim.includes(d));
    }
    // 4) riserve: un giorno ogni N giorni utili resta vuoto (assorbe i ritardi)
    if (o.riservaOgni > 1) {
      const ris = liberi.filter((_d, i) => (i + 1) % o.riservaOgni === 0);
      ris.forEach((d, i) => metti(d, { k: 'RISERVA-' + (i + 1), t: '🛟 Riserva', d: 'Recupera i ritardi; se sei in pari, ripassi e flashcard.', speciale: true }));
      liberi = liberi.filter(d => !ris.includes(d));
    }
    // 5) posti per gli argomenti: revisione della simulazione il giorno utile dopo (occupa 1 posto)
    const posti = new Map<string, number>(liberi.map(d => [d, cap]));
    sim.forEach((s, i) => { const d = liberi.find(x => x > s); if (d) { metti(d, { k: 'REV-' + (i + 1), t: '🔎 Revisione simulazione ' + (i + 1), d: 'Rifai le domande sbagliate, annota l\'errore.', speciale: true }); posti.set(d, posti.get(d)! - 1); } });
    // 6) primo giro (fase «basi»): distribuito in modo uniforme sul primo ~65% dei giorni utili, così
    //    restano giorni per il secondo giro e le simulazioni; se non basta, usa tutti i giorni a pieno carico.
    const ord = ordina(o), fuori: string[] = [], quando = new Map<string, string>();
    const nBasi = Math.max(1, Math.ceil(liberi.length * (o.secondoGiro || o.simulazioni ? .65 : 1)));
    const carico = Math.min(cap, Math.ceil(ord.length / nBasi));
    const limite = new Map<string, number>(liberi.map(d => [d, Math.min(posti.get(d)!, carico)]));
    let gi = 0;
    for (const x of ord) {
      while (gi < liberi.length && limite.get(liberi[gi])! <= 0) gi++;
      if (gi >= liberi.length) { gi = 0; for (const d of liberi) limite.set(d, posti.get(d)!); while (gi < liberi.length && limite.get(liberi[gi])! <= 0) gi++; }
      if (gi >= liberi.length) { fuori.push(x.k); continue; }
      metti(liberi[gi], { k: x.k, t: x.t, ...(x.m === 'TXT' ? { speciale: true, d: 'Argomento' } : {}) }); quando.set(x.k, liberi[gi]); posti.set(liberi[gi], posti.get(liberi[gi])! - 1); limite.set(liberi[gi], limite.get(liberi[gi])! - 1);
    }
    // 7) secondo giro sui deboli, distanziato di almeno 7 giorni (o 3 se manca spazio)
    if (o.secondoGiro) {
      const deboli = ord.filter(x => x.m !== 'TXT' && x.dati && x.w >= .4 && quando.has(x.k)).sort((a, b) => b.w - a.w);
      let saltati = 0;
      for (const x of deboli) {
        const primo = quando.get(x.k)!;
        const d = liberi.find(g => tra(primo, g) >= 7 && posti.get(g)! > 0) || liberi.find(g => tra(primo, g) >= 3 && posti.get(g)! > 0);
        if (!d) { saltati++; continue; }
        metti(d, { k: 'G2-' + x.k, t: '🔁 Secondo giro · ' + Studio.etichetta(x.k), d: 'Rifai le schede sbagliate di ' + x.t + ' (' + Math.round(x.w * 100) + '% debole).', speciale: true }); posti.set(d, posti.get(d)! - 1);
      }
      if (saltati) avvisi.push(saltati + ' secondi giri non entrano: aggiungi ore o giorni.');
    }
    if (fuori.length) avvisi.push(fuori.length + ' argomenti non entrano prima dell\'esame: aumenta le ore, riduci le riserve o i minuti per argomento.');
    if (!tutti.length) avvisi.push('Nessun giorno disponibile tra inizio ed esame.');
    const lista = Array.from(giorni.values()).sort((a, b) => a.data < b.data ? -1 : 1);
    lista.forEach((g, i) => g.n = i + 1);
    const piano: PianoGen = { formato: 'pacchetto-studio', versione: 1, tipo: 'piano', id: 'gen-' + uid(), modo: o.modo === 'raffinamento' ? 'raffinamento' : undefined, titolo: o.titolo,
      aggiornato: ymd(new Date()), giorniTeoria: lista.filter(g => g.voci.some(v => !v.speciale)).length,
      nota: 'Generato il ' + fmt(new Date(), { day: '2-digit', month: '2-digit' }) + ': ' + ord.length + ' argomenti, ' + carico + ' al giorno (massimo ' + cap + ')' + (o.deboliPrima ? ', prima i più deboli' : '') + '.',
      giorni: lista, generato: o, capienza: cap } as any;
    return { piano, fuori, avvisi };
  }
  function salva(p: PianoGen): void { Studio.importa(p); }
  function elimina(id: string): void { Stato.elimina('pk-' + id); }
  return { debolezza, catalogo, capienza, ordina, genera, salva, elimina };
})();

// ---------- Procedura guidata ----------
function apriGeneratore(base?: Partial<OpzGen>, sostituisci?: string): void {
  const oggiK = ymd(new Date()), esami = Stato.tutti<Esame>('esame').filter(e => e.data > oggiK).sort((a, b) => a.data < b.data ? -1 : 1);
  const cat = Generatore.catalogo();
  // Proposta iniziale: con due appelli futuri → raffinamento tra il primo e il secondo, prima i deboli.
  const due = esami.length >= 2;
  const o: OpzGen = {
    titolo: due ? 'Raffinamento verso ' + esami[1].nome : esami.length ? 'Piano per ' + esami[0].nome : 'Nuovo piano',
    esame: due ? esami[1].data : esami.length ? esami[0].data : ymd(new Date(Date.now() + 30 * 864e5)),
    inizio: due ? (() => { const d = daDt(esami[0].data); d.setDate(d.getDate() + 1); return ymd(d); })() : (() => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); })(),
    modo: due ? 'raffinamento' : 'teoria', argomenti: cat.map(x => x.k), deboliPrima: true,
    giorniSett: [0, 1, 2, 3, 4, 5, 6], ore: 6, minArg: due ? 100 : 120, riservaOgni: 7, simulazioni: due ? 3 : 2, finale: 2, riposo: true, secondoGiro: true,
    ...(base || {}),
  };
  const PASSI = ['Esame', 'Argomenti', 'Tempo', 'Struttura', 'Anteprima'];
  let passo = 0, incolla = false, testoIncollato = '';
  const v = visore('✨ Genera un piano');
  const testa = h('div.gen-passi'), corpo = h('div.gen-corpo'), piede = h('div.gen-piede');
  v.corpo.append(testa, corpo, piede);
  const campo = (eti: string, el: HTMLElement, nota?: string) => h('label.gen-campo', null, h('span.gen-eti', null, eti), el, nota ? h('span.tenue.piccolo', null, nota) : null);
  const num = (val: number, min: number, max: number, pas: number, set: (n: number) => void) => h('input', { type: 'number', min, max, step: pas, value: String(val), oninput: (e: Event) => { const n = +(e.target as HTMLInputElement).value; if (!isNaN(n)) set(n); } });
  const interr = (val: boolean, set: (b: boolean) => void) => h('span.interruttore', null, h('input', { type: 'checkbox', checked: val, onchange: (e: Event) => set((e.target as HTMLInputElement).checked) }), h('span'));

  function disegnaPasso(): void {
    svuota(testa); svuota(corpo); svuota(piede);
    PASSI.forEach((p, i) => testa.appendChild(h('button.gen-passo' + (i === passo ? '.attivo' : i < passo ? '.fatto' : ''), { onclick: () => { if (i < passo) { passo = i; disegnaPasso(); } } }, h('b', null, String(i + 1)), h('span', null, p))));
    if (passo === 0) {
      corpo.append(
        esami.length ? h('div.chips', null, esami.map(e => h('button.chip' + (o.esame === e.data ? '.attivo' : ''), { onclick: () => { o.esame = e.data; o.titolo = (o.modo === 'raffinamento' ? 'Raffinamento verso ' : 'Piano per ') + e.nome; disegnaPasso(); } }, '🎓 ' + e.nome + ' · ' + giornoBreve(e.data)))) : h('div.tenue.piccolo', null, 'Nessun esame salvato: scegli la data qui (puoi aggiungerli in Studio → Esami).'),
        campo('Data dell\'esame', h('input', { type: 'date', value: o.esame, onchange: (e: Event) => { o.esame = (e.target as HTMLInputElement).value; } })),
        campo('Inizio del piano', h('input', { type: 'date', value: o.inizio, onchange: (e: Event) => { o.inizio = (e.target as HTMLInputElement).value; } })),
        campo('Tipo', h('div.segmenti', null, ([['teoria', 'Prima passata (teoria)'], ['raffinamento', 'Raffinamento']] as const).map(([m, t]) => h('button' + (o.modo === m ? '.attivo' : ''), { onclick: () => { o.modo = m; if (m === 'raffinamento') { o.deboliPrima = true; o.minArg = Math.min(o.minArg, 100); } disegnaPasso(); } }, t))),
          o.modo === 'raffinamento' ? 'Uno step è completo quando hai rifatto le sbagliate e fatto le schede di raffinamento.' : 'Uno step è completo quando hai fatto tutte le prioritarie.'),
        campo('Nome', h('input', { type: 'text', value: o.titolo, oninput: (e: Event) => { o.titolo = (e.target as HTMLInputElement).value; } })));
    }
    if (passo === 1) {
      corpo.append(h('div.segmenti', null,
        h('button' + (!incolla ? '.attivo' : ''), { onclick: () => { incolla = false; disegnaPasso(); } }, 'Dagli step'),
        h('button' + (incolla ? '.attivo' : ''), { onclick: () => { incolla = true; disegnaPasso(); } }, 'Incolla un elenco')));
      if (incolla) {
        corpo.append(h('textarea.campo', { rows: 10, placeholder: 'Un argomento per riga (es. dal syllabus del corso)…', oninput: (e: Event) => { testoIncollato = (e.target as HTMLTextAreaElement).value; } }, testoIncollato),
          h('div.tenue.piccolo', null, 'Gli argomenti incollati diventano voci del piano (senza schede collegate). Per legarli alle schede crea un corso in Studio.'));
      } else {
        const scelti = new Set(o.argomenti);
        corpo.append(h('div.bottoni', null,
          h('button.btn.neutro', { onclick: () => { o.argomenti = cat.map(x => x.k); disegnaPasso(); } }, 'Tutti'),
          h('button.btn.neutro', { onclick: () => { o.argomenti = cat.filter(x => x.dati ? x.w >= .4 : true).map(x => x.k); disegnaPasso(); } }, 'Deboli + mai provati'),
          h('button.btn.neutro', { onclick: () => { o.argomenti = []; disegnaPasso(); } }, 'Nessuno')),
          h('label.widget-riga', null, h('span.nome', null, 'Prima i più deboli', h('div.tenue.piccolo', null, 'Dentro ogni materia; le materie si alternano ogni giorno.')), interr(o.deboliPrima, b => o.deboliPrima = b)),
          h('div.tenue.piccolo', null, o.argomenti.length + ' scelti. La barra è quanto è debole (punteggi, schede da rifare, ricordo stimato); n.d. = ancora nessun punteggio. Il secondo giro va solo ai deboli misurati.'));
        const mats = Array.from(new Set(cat.map(x => x.m)));
        for (const m of mats) corpo.appendChild(h('section.card', null, h('h2.card-titolo', { style: { color: coloreMateria(m) } }, nomeMateria(m)),
          cat.filter(x => x.m === m).map(x => h('label.gen-arg', null,
            h('input', { type: 'checkbox', checked: scelti.has(x.k), onchange: (e: Event) => { const on = (e.target as HTMLInputElement).checked; o.argomenti = on ? o.argomenti.concat(x.k) : o.argomenti.filter(y => y !== x.k); } }),
            h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, Studio.etichetta(x.k) + ' · ' + x.t),
              h('span.gen-debole', null, h('i', { style: { width: Math.round(x.w * 100) + '%', background: coloreRicordo(1 - x.w) } }))),
            x.dati ? h('b.piccolo', { style: { color: coloreRicordo(1 - x.w) } }, Math.round(x.w * 100) + '%') : h('span.tenue.piccolo', { title: 'Nessun punteggio ancora: stima neutra' }, 'n.d.')))));
      }
    }
    if (passo === 2) {
      const nomi = ['D', 'L', 'M', 'M', 'G', 'V', 'S'], ordine = [1, 2, 3, 4, 5, 6, 0];
      const resa = h('div.gen-resa');
      const aggiorna = () => { const c = Generatore.capienza(o); resa.textContent = '= ' + c + (c === 1 ? ' argomento' : ' argomenti') + ' al giorno (' + o.ore + ' h ÷ ' + o.minArg + ' min)'; };
      corpo.append(
        campo('Giorni in cui studi', h('div.gen-sett', null, ordine.map(d => h('button.gen-giorno' + (o.giorniSett.includes(d) ? '.attivo' : ''), { 'aria-pressed': String(o.giorniSett.includes(d)), onclick: (e: Event) => {
          o.giorniSett = o.giorniSett.includes(d) ? o.giorniSett.filter(x => x !== d) : o.giorniSett.concat(d); (e.currentTarget as HTMLElement).classList.toggle('attivo'); } }, nomi[d])))),
        campo('Ore di studio al giorno', num(o.ore, 1, 12, .5, n => { o.ore = n; aggiorna(); })),
        campo('Minuti per argomento', num(o.minArg, 30, 300, 10, n => { o.minArg = n; aggiorna(); }), o.modo === 'raffinamento' ? 'Raffinamento: rifai le sbagliate + schede R. Di solito 80–110 min.' : 'Prima passata: lettura + prioritarie. Di solito 100–150 min.'),
        resa);
      aggiorna();
    }
    if (passo === 3) {
      corpo.append(
        campo('Giorno di riserva ogni', h('div.segmenti', null, [0, 5, 6, 7].map(n => h('button' + (o.riservaOgni === n ? '.attivo' : ''), { onclick: () => { o.riservaOgni = n; disegnaPasso(); } }, n ? n + ' giorni' : 'mai'))), 'Un giorno vuoto che assorbe i ritardi: i piani senza margine saltano alla prima influenza.'),
        campo('Simulazioni a tempo', h('div.segmenti', null, [0, 1, 2, 3, 4].map(n => h('button' + (o.simulazioni === n ? '.attivo' : ''), { onclick: () => { o.simulazioni = n; disegnaPasso(); } }, String(n)))), 'Nell\'ultima parte del piano, ognuna seguita dalla revisione degli errori.'),
        campo('Giorni di ripasso finale', h('div.segmenti', null, [0, 1, 2, 3, 4].map(n => h('button' + (o.finale === n ? '.attivo' : ''), { onclick: () => { o.finale = n; disegnaPasso(); } }, String(n))))),
        h('label.widget-riga', null, h('span.nome', null, 'Vigilia di riposo', h('div.tenue.piccolo', null, 'Il sonno prima dell\'esame consolida più di un\'ultima nottata.')), interr(o.riposo, b => o.riposo = b)),
        h('label.widget-riga', null, h('span.nome', null, 'Secondo giro sui deboli', h('div.tenue.piccolo', null, 'Gli argomenti deboli tornano almeno 7 giorni dopo: ripetizione distanziata.')), interr(o.secondoGiro, b => o.secondoGiro = b)));
    }
    if (passo === 4) {
      if (incolla) { const righe = testoIncollato.split('\n').map(s => s.trim()).filter(Boolean); o.argomenti = righe.map((_r, i) => 'TXT-' + (i + 1)); o.testi = Object.fromEntries(righe.map((r, i) => ['TXT-' + (i + 1), r])); }
      const r = Generatore.genera(o), p = r.piano;
      const nArg = p.giorni.reduce((a, g) => a + g.voci.filter(x => !x.speciale).length, 0);
      corpo.append(
        h('section.card', null, h('h2.card-titolo', null, p.titolo),
          h('div.numeri', null, numero(String(p.giorni.length), 'giorni'), numero(String(nArg), 'argomenti'), numero(String(p.giorni.filter(g => g.voci.some(x => /^SIM/.test(x.k))).length), 'simulazioni')),
          h('div.tenue.piccolo', null, giornoBreve(o.inizio) + ' → esame ' + giornoBreve(o.esame) + ' · ' + p.nota)),
        r.avvisi.length ? h('div.gen-avvisi', null, r.avvisi.map(a => h('div', null, '⚠️ ' + a))) : h('span'),
        h('section.card.gen-anteprima', null, p.giorni.map(g => h('div.gen-giorno-riga', null,
          h('span.gen-data', null, giornoBreve(g.data)),
          h('span.gen-voci', null, g.voci.map(x => h('span.gen-voce' + (x.speciale ? '.speciale' : ''), { style: x.speciale ? {} : { '--c': coloreChiave(x.k) } as any }, x.speciale ? x.t : Studio.etichetta(x.k))))))));
      (corpo as any)._r = r;
    }
    piede.append(
      passo ? h('button.btn.neutro', { onclick: () => { passo--; disegnaPasso(); } }, '‹ Indietro') : h('span'),
      passo < PASSI.length - 1
        ? h('button.btn', { onclick: () => { if (passo === 1 && !incolla && !o.argomenti.length) { avviso('Scegli almeno un argomento.'); return; } if (passo === 0 && !(o.inizio < o.esame)) { avviso('L\'inizio deve essere prima dell\'esame.'); return; } passo++; disegnaPasso(); } }, 'Avanti ›')
        : h('button.btn', { onclick: () => {
          const r = (corpo as any)._r as ReturnType<typeof Generatore.genera>;
          if (sostituisci) {   // i giorni già passati del vecchio piano restano (storico e ritardi)
            const vecchio = Studio.pkPiani().find(x => x.id === sostituisci), oggiK2 = ymd(new Date());
            r.piano.id = sostituisci;
            if (vecchio) { r.piano.giorni = vecchio.giorni.filter(g => g.data < oggiK2).concat(r.piano.giorni.filter(g => g.data >= oggiK2)); r.piano.giorni.forEach((g, i) => g.n = i + 1); }
          }
          Generatore.salva(r.piano); v.chiudi();
          UI.studioVista = 'piano'; UI.studioPiano = r.piano.id; vai('studio');
          avviso((sostituisci ? 'Piano rigenerato: ' : 'Piano creato: ') + r.piano.giorni.length + ' giorni. Lo trovi in Studio → Piano, in Oggi e nel calendario.', 6000);
        } }, sostituisci ? '✓ Sostituisci il piano' : '✓ Crea il piano'));
    corpo.scrollTop = 0;
  }
  disegnaPasso();
}

/** Pulsanti nella vista Piano: genera, e per i piani generati rigenera/elimina. */
function bottoniGeneratore(p?: PkPiano): HTMLElement {
  const gen = p && /^gen-/.test(p.id) ? p as PianoGen : null;
  return h('div.bottoni', null,
    h('button.btn.neutro', { onclick: () => apriGeneratore() }, '✨ Genera un piano'),
    gen ? h('button.btn.neutro', { onclick: () => apriGeneratore({ ...gen.generato, inizio: gen.generato.inizio < ymd(new Date()) ? ymd(new Date()) : gen.generato.inizio, argomenti: gen.generato.argomenti.filter(k => /^TXT-/.test(k) || !Studio.stepFatto(k, gen)) }, gen.id) }, '↻ Rigenera con i dati di oggi') : null,
    gen ? h('button.btn.neutro', { onclick: async () => { if (await chiedi('Eliminare «' + gen.titolo + '»?', [{ testo: 'Elimina il piano', valore: 'si', pericolo: true }], 'Le schede fatte e i punteggi restano: sparisce solo il calendario.') === 'si') { Generatore.elimina(gen.id); UI.studioPiano = ''; disegna(); } } }, '🗑 Elimina') : null);
}
