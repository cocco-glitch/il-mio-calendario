// ============================================================
// 07-rapido.ts — Aggiunta rapida in linguaggio naturale (italiano).
// Esempi: "domani 15-17 Chimica 3.1", "ogni lunedì 9 palestra",
// "ven 18:30 cena da Marco", "12/11 tutto il giorno gita",
// "ricorda lunedì alle 10 chiamare il medico" (→ promemoria),
// "dalle 9 alle 10:30 ripasso fisica", "ogni giorno 7:30 corsa fino al 30/11".
// ============================================================

interface Rapido {
  tipo: 'evento' | 'task';
  titolo: string;
  giorno: Date;          // giorno (00:00)
  ora?: [number, number];
  fine?: [number, number];
  tuttoIlGiorno: boolean;
  rrule?: Ricorrenza;
  categoriaId?: string;
  dataEsplicita: boolean;
}

const GIORNI_IT: Record<string, number> = { lun: 0, lunedi: 0, mar: 1, martedi: 1, mer: 2, mercoledi: 2, gio: 3, giovedi: 3, ven: 4, venerdi: 4, sab: 5, sabato: 5, dom: 6, domenica: 6 };
const MESI_IT: Record<string, number> = { gen: 0, gennaio: 0, feb: 1, febbraio: 1, mar: 2, marzo: 2, apr: 3, aprile: 3, mag: 4, maggio: 4, giu: 5, giugno: 5, lug: 6, luglio: 6, ago: 7, agosto: 7, set: 8, settembre: 8, ott: 9, ottobre: 9, nov: 10, novembre: 10, dic: 11, dicembre: 11 };

/** Interpreta una frase. Restituisce null se non c'è un titolo. */
function interpreta(frase: string, rif = new Date()): Rapido | null {
  let s = ' ' + frase.trim().replace(/\s+/g, ' ') + ' ';
  const n = norm(s);           // senza accenti, minuscolo, stesse posizioni
  const togli = (re: RegExp) => { let m: RegExpExecArray | null; const out: RegExpExecArray[] = []; const r = new RegExp(re.source, 'gi'); let t = norm(s);
    while ((m = r.exec(t))) { out.push(m); s = s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length); t = norm(s); r.lastIndex = m.index + m[0].length; } return out; };
  void n;
  const base = inizioGiorno(rif);
  let giorno = base, dataEsplicita = false, tipo: Rapido['tipo'] = 'evento', tutto = false;
  let rr: Ricorrenza | undefined;

  if (togli(/(^|\s)(ricorda(mi)?|promemoria|todo|da fare)(\s*:)?(?=\s)/).length) tipo = 'task';
  if (togli(/\s(tutto il giorno|tutta la giornata)(?=\s)/).length) tutto = true;

  // ricorrenze: "ogni giorno", "ogni settimana", "ogni mese", "ogni lunedì e giovedì", "ogni 2 settimane"
  const og = togli(/\sogni\s+(\d+\s+)?(giorno|giorni|settimana|settimane|mese|mesi|anno|anni|((lun|mar|mer|gio|ven|sab|dom)[a-z]*)((\s*,\s*|\s+e\s+)(lun|mar|mer|gio|ven|sab|dom)[a-z]*)*)(?=\s)/);
  if (og.length) {
    const m = og[0], interv = m[1] ? parseInt(m[1], 10) : 1, w = m[2];
    if (/^giorn/.test(w)) rr = { freq: 'D', interval: interv };
    else if (/^settiman/.test(w)) rr = { freq: 'W', interval: interv };
    else if (/^mes/.test(w)) rr = { freq: 'M', interval: interv };
    else if (/^ann/.test(w)) rr = { freq: 'Y', interval: interv };
    else {
      const giorni = Array.from(new Set((w.match(/(lun|mar|mer|gio|ven|sab|dom)[a-z]*/g) || []).map(x => GIORNI_IT[x.slice(0, 3)]))).sort();
      rr = { freq: 'W', interval: interv, byday: giorni };
      const oggiI = (base.getDay() + 6) % 7, primo = giorni.map(g => (g - oggiI + 7) % 7).sort((a, b) => a - b)[0];
      giorno = piuGiorni(base, primo); dataEsplicita = true;
    }
  }
  const fino = togli(/\s(fino al?|fino a)\s+(\d{1,2})[\/.-](\d{1,2})([\/.-](\d{2,4}))?(?=\s)/);
  if (rr && fino.length) { const f = fino[0]; let y = f[5] ? +f[5] : base.getFullYear(); if (y < 100) y += 2000; rr.until = ymd(new Date(y, +f[3] - 1, +f[2])); }
  const volte = togli(/\sper\s+(\d+)\s+volte(?=\s)/);
  if (rr && volte.length) rr.count = +volte[0][1];

  // giorno
  if (togli(/\sdopodomani(?=\s)/).length) { giorno = piuGiorni(base, 2); dataEsplicita = true; }
  else if (togli(/\sdomani(?=\s)/).length) { giorno = piuGiorni(base, 1); dataEsplicita = true; }
  else if (togli(/\s(oggi|stasera|stamattina)(?=\s)/).length) { giorno = base; dataEsplicita = true; }
  const dm = togli(/\s(\d{1,2})\/(\d{1,2})(\/(\d{2,4}))?(?=\s)/);   // solo con '/': '3.1' resta nel titolo (es. Chimica 3.1)
  if (dm.length) { const m = dm[0]; let y = m[4] ? +m[4] : base.getFullYear(); if (y < 100) y += 2000; let d = new Date(y, +m[2] - 1, +m[1]); if (!m[4] && d < base) d = new Date(y + 1, +m[2] - 1, +m[1]); giorno = d; dataEsplicita = true; }
  const dmes = togli(/\s(\d{1,2})\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*\.?(\s+(\d{4}))?(?=\s)/);
  if (dmes.length) { const m = dmes[0]; const y = m[4] ? +m[4] : base.getFullYear(); let d = new Date(y, MESI_IT[m[2]], +m[1]); if (!m[4] && d < base) d = new Date(y + 1, MESI_IT[m[2]], +m[1]); giorno = d; dataEsplicita = true; }
  if (!og.length || (rr && !rr.byday)) {
    const gs = togli(/\s(prossimo\s+|prossima\s+|questo\s+|questa\s+)?(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|lun|mar|mer|gio|ven|sab|dom)(?=\s)/);
    if (gs.length) { const g = GIORNI_IT[gs[0][2]]; const oggiI = (base.getDay() + 6) % 7; let d = (g - oggiI + 7) % 7; if (d === 0 || /prossim/.test(gs[0][1] || '')) d = d || 7; giorno = piuGiorni(base, d); dataEsplicita = true; }
  }
  if (rr && !rr.byday && rr.freq === 'W') rr.byday = [(giorno.getDay() + 6) % 7];

  // ore: "15-17", "15:30-17", "dalle 9 alle 10:30", "alle 9", "ore 9", "9:30", "h 9"
  const hh = (x: string) => { const [a, b] = x.replace('.', ':').split(':'); return [Math.min(23, +a), Math.min(59, +(b || 0))] as [number, number]; };
  let ora: [number, number] | undefined, fineOra: [number, number] | undefined;
  const intv = togli(/\s(dalle\s+|ore\s+|h\s*)?(\d{1,2}([:.]\d{2})?)\s*(-|–|alle\s+|fino alle\s+)\s*(\d{1,2}([:.]\d{2})?)(?=\s)/);
  if (intv.length) { ora = hh(intv[0][2]); fineOra = hh(intv[0][5]); }
  else {
    const una = togli(/\s(alle\s+|ore\s+|h\s*|all')(\d{1,2}([:.]\d{2})?)(?=\s)/);
    if (una.length) ora = hh(una[0][2]);
    else { const nuda = togli(/\s(\d{1,2}[:.]\d{2})(?=\s)/); if (nuda.length) ora = hh(nuda[0][1]); }
    // "ogni lunedì 9 palestra": un numero isolato subito dopo la data/ricorrenza vale come ora
    if (!ora && (og.length || dataEsplicita)) { const iso = togli(/^\s+(\d{1,2})(?=\s)/); if (iso.length && +iso[0][1] <= 23) ora = [+iso[0][1], 0]; }
  }
  if (ora && !fineOra) { const p = /(sera|stasera)/.test(norm(frase)) && ora[0] < 12 ? 12 : 0; ora = [ora[0] + p, ora[1]]; }

  const titolo = s.replace(/\s+/g, ' ').replace(/^[\s,:;-]+|[\s,:;-]+$/g, '').trim();
  if (!titolo) return null;
  if (!ora && tipo === 'evento' && !rr) tutto = tutto || dataEsplicita;
  if (!ora && tipo === 'evento' && rr) tutto = true;
  // categoria: materie di studio → Studio
  let categoriaId: string | undefined;
  const t = norm(titolo);
  for (const c of categorie()) if (t.includes(norm(c.nome))) categoriaId = c.id;
  if (!categoriaId && /(chimica|biologia|fisica|\bchi\b|\bbio\b|\bfis\b|quiz|ripasso|simulazione)/.test(t) && Stato.prendi('cat-studio')) categoriaId = 'cat-studio';
  return { tipo, titolo: maiuscola(titolo), giorno, ora, fine: fineOra, tuttoIlGiorno: tipo === 'evento' && (tutto || !ora), rrule: rr, categoriaId, dataEsplicita };
}

function descriviRapido(r: Rapido): string {
  const quando = (r.rrule ? testoRicorrenza(r.rrule) + (r.rrule.byday ? '' : ', da ' + dataBreve(r.giorno)) : dataLunga(r.giorno))
    + (r.ora ? ' · ' + pad2(r.ora[0]) + ':' + pad2(r.ora[1]) + (r.fine ? '–' + pad2(r.fine[0]) + ':' + pad2(r.fine[1]) : '') : r.tipo === 'evento' ? ' · tutto il giorno' : '');
  const cat = r.categoriaId ? Stato.prendi<Categoria>(r.categoriaId) : null;
  return (r.tipo === 'task' ? 'Promemoria' : 'Evento') + ': «' + r.titolo + '» — ' + quando + (cat ? ' · ' + cat.nome : '');
}

function creaDaRapido(r: Rapido): Rec {
  if (r.tipo === 'task') {
    const d = ymd(r.giorno);
    const t: Task = { id: uid(), type: 'task', updatedAt: 0, titolo: r.titolo, priorita: 0, fatto: false, categoriaId: r.categoriaId,
      scadenza: r.dataEsplicita || r.ora ? (r.ora ? d + 'T' + pad2(r.ora[0]) + ':' + pad2(r.ora[1]) : d) : undefined, rrule: r.rrule };
    Stato.salva(t); return t;
  }
  const i = new Date(r.giorno), f = new Date(r.giorno);
  if (r.tuttoIlGiorno) { f.setHours(23, 59); }
  else {
    i.setHours(r.ora![0], r.ora![1], 0, 0);
    if (r.fine) { f.setHours(r.fine[0], r.fine[1], 0, 0); if (f <= i) f.setDate(f.getDate() + 1); }
    else f.setTime(i.getTime() + 3600000);
  }
  const ev: Evento = { id: uid(), type: 'evento', updatedAt: 0, titolo: r.titolo, inizio: dtStr(i), fine: dtStr(f), tuttoIlGiorno: r.tuttoIlGiorno,
    categoriaId: r.categoriaId || (categorie()[0] || {} as Categoria).id, rrule: r.rrule, promemoria: r.tuttoIlGiorno ? [] : [30], checklist: [] };
  Stato.salva(ev); return ev;
}

/** Campo di aggiunta rapida con anteprima di ciò che verrà creato. */
function campoRapido(): HTMLElement {
  const anteprima = h('div.rapido-anteprima');
  const campo = h('input.rapido', { type: 'text', placeholder: '+ Aggiungi: "domani 15-17 Chimica 3.1"', enterKeyHint: 'done', autocomplete: 'off',
    oninput: () => { const r = interpreta(campo.value); anteprima.textContent = r && campo.value.trim() ? descriviRapido(r) : ''; },
    onkeydown: (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const r = interpreta(campo.value); if (!r) return;
      const rec = creaDaRapido(r);
      avviso('Creato: ' + descriviRapido(r), 5000, () => rec.type === 'task' ? apriTask(rec as Task) : apriEvento(rec as Evento));
    } }) as HTMLInputElement;
  return h('div.rapido-box', null, campo, anteprima);
}
