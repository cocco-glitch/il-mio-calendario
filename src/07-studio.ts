// ============================================================
// 07-studio.ts — Modulo STUDIO.
// - Pacchetti studio (formato v1, docs/formato-studio.md): arrivano dal sito
//   (studio/*.json, generati da studio/genera.mjs) e dalla cartella Drive
//   "Calendario personale/studio". Salvati come record type 'pacchetto'.
// - I PROGRESSI sono record separati (type 'progresso', id 'prog-<idScheda>'):
//   aggiornare un pacchetto non li tocca mai.
// - Piano → calendario: i giorni del piano compaiono come blocchi "Studio".
//   Uno step spostato è un record type 'spostamento' (id 'sp-<chiave>').
// ============================================================

interface FileS { id?: string; nome: string; mime?: string; url?: string; }
interface SchedaS { id: string; k: number; n: number; titolo: string; tipo: 'P' | 'R'; problemi: boolean; pagine: string; slide?: string; quizFile: string; quizFileId?: string; file?: FileS; }
interface MicroS { n: string; schede: SchedaS[]; }
interface SottoS { k: string; n: string; titolo: string; posizione: string; ripasso?: string; svolto?: boolean; data?: string; microstep: MicroS[]; }
interface MateriaS { m: string; nome: string; libro: string; sottostep: SottoS[]; }
interface LibroS { nome: string; offset: number; blocco: number; cartella: string; file: Record<string, string>; }
interface PkStep { tipo: 'step'; id: string; step: number; titolo: string; aggiornato: string; proprio?: boolean; descrizione?: string; risorse: { libri: Record<string, LibroS>; quiz: Record<string, string> }; materie: MateriaS[]; }
interface VocePiano { k: string; t: string; d?: string; speciale?: boolean; }
interface GiornoPiano { data: string; n?: number; voci: VocePiano[]; nota?: string; }
interface Copertura { m: string; ud: string; a: string; stato: 'E' | 'I' | 'N'; k: string; quando: string; }
interface PkPiano { tipo: 'piano'; id: string; modo?: 'raffinamento'; titolo: string; aggiornato: string; giorniTeoria: number; nota?: string; giorni: GiornoPiano[]; copertura?: Copertura[]; }
/** Una voce del piano nel giorno in cui cade (tenendo conto degli spostamenti). */
interface VoceGiorno { v: VocePiano; g: GiornoPiano; spostata: boolean; p: PkPiano; }
interface Progresso extends Rec { type: 'progresso'; fatta: boolean; data?: string; punteggio?: number; nota?: string; daRifare?: boolean;
  deboli?: [string, number, number][];   // v0.9: per tipo di domanda [tipo, giuste, totale], letto dal quiz
}

// ---------- Materie (generiche) ----------
// Una materia ha un CODICE di lettere maiuscole (C, B, F, ANA, STAT…). Le chiavi dei sotto-step sono
// codice + numero ("C2.3", "ANA1.2"). Nome, sigla e colore vengono, in ordine: dal record 'materia'
// (modificabile dall'utente), dal pacchetto che la contiene, dai valori di base sotto.
const MATERIE_BASE: Record<string, { nome: string; breve: string; colore: string }> = {
  C: { nome: 'Chimica', breve: 'Chi', colore: '#e9a23b' }, B: { nome: 'Biologia', breve: 'Bio', colore: '#2fbf8f' }, F: { nome: 'Fisica', breve: 'Fis', colore: '#6c8cff' },
};
const PALETTE_MATERIE = ['#e9a23b', '#2fbf8f', '#6c8cff', '#f0708a', '#a78bfa', '#38bdf8', '#f97316', '#14b8a6', '#eab308', '#ec4899'];
interface MateriaRec extends Rec { type: 'materia'; codice: string; nome: string; breve?: string; colore: string; }
function materiaDi(k: string): string { const m = /^([A-Z]+)/.exec(k || ''); return m ? m[1] : ''; }
function infoMateria(code: string): { nome: string; breve: string; colore: string } {
  const r = Stato.prendi<MateriaRec>('mat-' + code);
  const base = MATERIE_BASE[code];
  let nome = r ? r.nome : base ? base.nome : '', colore = r ? r.colore : base ? base.colore : '';
  if (!nome || !colore) for (const pk of Studio.pkStep()) { const m = pk.materie.find(x => x.m === code); if (m) { nome = nome || m.nome; colore = colore || (m as any).colore || ''; break; } }
  if (!colore) { let hsh = 0; for (const ch of code) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0; colore = PALETTE_MATERIE[hsh % PALETTE_MATERIE.length]; }
  nome = nome || code;
  return { nome, breve: (r && r.breve) || (base && base.breve) || nome.slice(0, 3), colore };
}
const nomeMateria = (c: string) => infoMateria(c).nome;
const coloreMateria = (c: string) => infoMateria(c).colore;
/** Colore di una chiave di step ("C2.3") o grigio per le voci speciali. */
const coloreChiave = (k: string) => materiaDi(k) ? coloreMateria(materiaDi(k)) : '#7c8597';
/** v0.20: ogni materia ha anche una FORMA (non solo un colore): si riconosce anche senza distinguere i colori. */
const FORME_BASE: Record<string, string> = { C: '◆', B: '●', F: '▲' };
const FORME = ['■', '★', '⬟', '⬢', '✚', '◗'];
function formaMateria(code: string): string { if (FORME_BASE[code]) return FORME_BASE[code]; let x = 0; for (const ch of code) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return FORME[x % FORME.length]; }
const formaChiave = (k: string) => materiaDi(k) ? formaMateria(materiaDi(k)) : '';
function segnoMateria(k: string): HTMLElement | null { const f = formaChiave(k); return f ? h('span.forma-mat', { style: { color: coloreChiave(k) }, 'aria-hidden': 'true' }, f) : null; }

const Studio = (() => {
  /**
   * "Piani" ricavati da altri dati: i corsi creati dall'utente (sotto-step con data) e gli esami.
   * Così compaiono nel calendario, in Oggi e nel ritardo come gli step del piano principale.
   */
  function pianiVirtuali(): PkPiano[] {
    const out: PkPiano[] = [];
    for (const pk of pkStep().filter(p => p.proprio)) {
      const giorni: GiornoPiano[] = [];
      for (const m of pk.materie) for (const s of m.sottostep) if (s.data) giorni.push({ data: s.data, voci: [{ k: s.k, t: s.titolo }] });
      if (giorni.length) out.push({ tipo: 'piano', id: 'v-' + pk.id, titolo: pk.titolo, aggiornato: pk.aggiornato, giorniTeoria: 0, giorni });
    }
    const esami = Stato.tutti<Rec>('esame');
    if (esami.length) out.push({ tipo: 'piano', id: 'v-esami', titolo: 'Esami', aggiornato: '', giorniTeoria: 0,
      giorni: esami.map(e => ({ data: e.data, voci: [{ k: 'ESAME-' + e.id, t: '🎓 ' + e.nome + (e.ora ? ' · ' + e.ora : ''), d: e.nota || 'Esame', speciale: true }] })) });
    return out;
  }
  // v0.17: risultati memorizzati finché i dati non cambiano (Stato.ver)
  const memo = <T>(f: () => T) => { let v = -1, x: T; return () => { if (v !== Stato.ver) { x = f(); v = Stato.ver; } return x; }; };
  const pkStepM = memo(() => Stato.tutti<Rec>('pacchetto').map(r => r.contenuto).filter(c => c && c.tipo === 'step').sort((a, b) => a.step - b.step) as PkStep[]);
  function pkStep(): PkStep[] { return pkStepM().slice(); }
  const pkPianiM = memo(() => Stato.tutti<Rec>('pacchetto').map(r => r.contenuto).filter(c => c && c.tipo === 'piano').sort((a, b) => (a.giorni[0] || { data: '' }).data < (b.giorni[0] || { data: '' }).data ? -1 : 1) as PkPiano[]);
  function pkPiani(): PkPiano[] { return pkPianiM().slice(); }
  /** v0.20.1: piani visibili in Oggi, calendario, ritardi e ripassi (quelli nascosti restano solo nella vista Piano). */
  const nascosto = (id: string) => ((imp() as any).pianiNascosti || []).includes(id);
  function pianiAttivi(): PkPiano[] { return pkPianiM().filter(p => !nascosto(p.id)); }
  function nascondiPiano(id: string, si: boolean): void { const i = imp() as any, l: string[] = (i.pianiNascosti || []).filter((x: string) => x !== id); if (si) l.push(id); i.pianiNascosti = l; Stato.salva(i, true); }
  /** Il piano principale (teoria). */
  function pkPiano(): PkPiano | null { return pkPiani().find(p => p.id === 'piano') || pkPiani()[0] || null; }

  /** Inserisce/aggiorna un pacchetto. I progressi stanno altrove: non si perdono. */
  function importa(c: any, daSito = false): boolean {
    if (!c || c.formato !== 'pacchetto-studio' || !c.id || !c.tipo) return false;
    const id = 'pk-' + c.id, mio = Stato.rec.get(id);
    if (mio && !mio.deleted && JSON.stringify(mio.contenuto) === JSON.stringify(c)) return false;
    // mai sostituire un pacchetto con una versione più vecchia (es. sito vs Drive)
    if (mio && !mio.deleted && mio.contenuto && String(mio.contenuto.aggiornato || '') > String(c.aggiornato || '')) return false;
    Stato.salva({ id, type: 'pacchetto', updatedAt: 0, contenuto: c, daSito: daSito || undefined } as any);
    // esami indicati dal pacchetto: creati una volta sola (poi li gestisce l'utente)
    for (const e of c.esami || []) if (e && e.id && !Stato.rec.has(e.id)) Stato.salva({ id: e.id, type: 'esame', updatedAt: 0, nome: e.nome, data: e.data, ora: e.ora, daSito: daSito || undefined } as any);
    return true;
  }
  /** Pacchetti distribuiti col sito (base di partenza). */
  async function caricaDalSito(): Promise<void> {
    if (!Drive.eProprietario()) return;   // v0.26: il programma del sito è solo del proprietario
    try {
      const r = await fetch('studio/indice.json', { cache: 'no-cache' }); if (!r.ok) return;
      for (const f of await r.json() as string[]) { const p = await fetch('studio/' + f, { cache: 'no-cache' }); if (p.ok) importa(await p.json(), true); }
    } catch (_) { /* offline o anteprima */ }
  }
  /** v0.26: il secondo account non deve ereditare il programma del sito caricato prima dell'accesso. */
  function togliSito(): number {
    let n = 0;
    for (const r of Stato.rec.values()) if ((r as any).daSito && !r.deleted) { Stato.elimina(r.id); n++; }
    return n;
  }
  /** Pacchetti nella cartella Drive dell'app (quelli creati da Claude in futuro). */
  async function caricaDaDrive(): Promise<number> {
    await Drive.preparaCartelle();
    let n = 0;
    for (const f of await Drive.elencaTutti(Drive.idCartella('studio'))) {
      if (!/\.json$/i.test(f.name)) continue;
      try { if (importa(JSON.parse(await Drive.scaricaTesto(f.id)))) n++; } catch (_) { avviso('Pacchetto non leggibile: ' + f.name); }
    }
    return n;
  }

  function prog(id: string): Progresso | undefined { return Stato.prendi<Progresso>('prog-' + id); }
  function fatta(id: string): boolean { const p = prog(id); return !!(p && p.fatta); }
  function segna(id: string, mod: Partial<Progresso>): void {
    const p: Progresso = prog(id) || { id: 'prog-' + id, type: 'progresso', updatedAt: 0, fatta: false };
    Object.assign(p, mod);
    if (p.fatta && !p.data) p.data = ymd(new Date());
    Stato.salva(p);
    if (!id.startsWith('step-') && typeof Ripassi !== 'undefined') Ripassi.registra(id, p); // v0.7: ripasso FSRS
  }

  /** Pagine del libro: '141-144,146' o appendice 'A1-A4'. Restituisce stringhe ('141', 'A2'). */
  const cachePagine = new Map<string, string[]>();      // v0.17: stessa stringa → stesso risultato
  function pagineSet(s: string): Set<string> {
    const c = cachePagine.get(s || '');
    if (c) return new Set(c);
    const o = new Set<string>();
    for (const p of (s || '').split(',').map(x => x.trim()).filter(Boolean)) {
      const m = p.match(/^([A-Z]?)(\d+)(?:-[A-Z]?(\d+))?$/); if (!m) continue;
      for (let i = +m[2]; i <= +(m[3] || m[2]); i++) o.add(m[1] + i);
    }
    cachePagine.set(s || '', Array.from(o));
    return o;
  }
  function intervalli(set: Set<string>): string {
    const ord = (x: string) => /^\d/.test(x) ? +x : 100000 + +x.slice(1);
    const v = Array.from(set).sort((a, b) => ord(a) - ord(b)), out: string[] = [];
    for (let i = 0; i < v.length; i++) { let j = i; while (j + 1 < v.length && ord(v[j + 1]) === ord(v[j]) + 1) j++; out.push(i === j ? v[i] : v[i] + '–' + v[j]); i = j; }
    return out.join(', ');
  }
  function unione(l: SchedaS[]): Set<string> { const o = new Set<string>(); l.forEach(s => pagineSet(s.pagine).forEach(p => o.add(p))); return o; }
  /** Numeri di un insieme di schede (come nella tabella riepilogo della scheda PDF). */
  function numeri(l: SchedaS[]) {
    const P = l.filter(s => s.tipo === 'P'), R = l.filter(s => s.tipo === 'R');
    return { P: P.length, R: R.length, Pf: P.filter(s => fatta(s.id)).length, Rf: R.filter(s => fatta(s.id)).length,
      pagP: unione(P), pagR: unione(R), pagT: unione(l), pagLette: unione(l.filter(s => fatta(s.id))) };
  }
  function schedeDi(s: SottoS): SchedaS[] { return s.microstep.flatMap(m => m.schede); }
  const indiceSotto = memo(() => { const m = new Map<string, { pk: PkStep; mat: MateriaS; sub: SottoS }>(); for (const pk of pkStepM()) for (const mat of pk.materie) for (const sub of mat.sottostep) if (!m.has(sub.k)) m.set(sub.k, { pk, mat, sub }); return m; });
  function trovaSotto(k: string): { pk: PkStep; mat: MateriaS; sub: SottoS } | null {
    const x = indiceSotto().get(k); if (x) return x;
    return null;
  }
  function etichetta(k: string): string { const m = /^([A-Z]+)(\d.*)$/.exec(k); return m ? infoMateria(m[1]).breve + ' ' + m[2] : k; }

  // ---------- Piano ----------
  // Chiavi degli spostamenti: 'sp-<k>' per il piano principale, 'sp-<idPiano>-<k>' per gli altri.
  const idSp = (k: string, pid = 'piano') => pid === 'piano' ? 'sp-' + k : 'sp-' + pid + '-' + k;
  function dataVoce(v: VocePiano, g: GiornoPiano, pid = 'piano'): string { const sp = Stato.prendi<Rec>(idSp(v.k, pid)); return sp ? sp.data : g.data; }
  /**
   * Uno step è completato quando tutte le sue prioritarie sono fatte; nel piano di raffinamento
   * quando sono fatte anche tutte le schede di raffinamento. Senza pacchetto si spunta a mano.
   */
  function stepFatto(k: string, p?: PkPiano): boolean {
    const t = trovaSotto(k), raff = !!(p && p.modo === 'raffinamento');
    if (t) { const n = numeri(schedeDi(t.sub)); return raff ? n.R + n.P > 0 && n.Rf === n.R && n.Pf === n.P : n.P > 0 && n.Pf === n.P; }
    return fatta(raff ? 'step-raff-' + k : 'step-' + k);
  }
  function segnaStepAMano(k: string, p: PkPiano, si: boolean): void { segna(p.modo === 'raffinamento' ? 'step-raff-' + k : 'step-' + k, { fatta: si }); }
  function vociDelGiorno(g: Date): VoceGiorno[] {
    const k = ymd(g), out: VoceGiorno[] = [];
    for (const p of [...pianiAttivi(), ...pianiVirtuali()]) for (const gg of p.giorni) for (const v of gg.voci) if (dataVoce(v, gg, p.id) === k) out.push({ v, g: gg, spostata: gg.data !== k, p });
    return out;
  }
  /** Step (non speciali) con data già passata e non completati, in tutti i piani. */
  function inRitardo(): VocePiano[] {
    const oggiK = ymd(oggi()), out: VocePiano[] = [];
    for (const p of [...pianiAttivi(), ...pianiVirtuali()]) for (const g of p.giorni) for (const v of g.voci) if (!v.speciale && dataVoce(v, g, p.id) < oggiK && !stepFatto(v.k, p)) out.push(v);
    return out;
  }
  function sposta(k: string, data: string | null, pid = 'piano'): void {
    const id = idSp(k, pid);
    if (data) Stato.salva({ id, type: 'spostamento', updatedAt: 0, data });
    else if (Stato.rec.get(id)) Stato.elimina(id);
  }

  // ---------- Risorse su Drive ----------
  const cacheElenchi: Record<string, { id: string; name: string }[]> = {};
  async function elenco(cartella: string): Promise<{ id: string; name: string }[]> {
    if (!cacheElenchi[cartella]) cacheElenchi[cartella] = await Drive.elencaTutti(cartella);
    return cacheElenchi[cartella];
  }
  /** Trova il file quiz di una scheda nella cartella "<materia> quiz" (per microstep + "scheda k di n"). */
  async function idQuiz(pk: PkStep, m: string, micro: string, s: SchedaS): Promise<string> {
    if (s.quizFileId) return s.quizFileId;
    const coda = '(scheda ' + s.k + ' di ' + s.n + ').html';
    const f = (await elenco(pk.risorse.quiz[m])).filter(x => x.name.startsWith(micro + ' ') && x.name.endsWith(coda));
    const esatto = f.find(x => x.name === s.quizFile);
    if (!f.length) throw new Error('Quiz non trovato su Drive: ' + s.quizFile);
    return (esatto || f[0]).id;
  }
  /** Pagina del libro → file PDF diviso + pagina dentro al file. */
  async function pdfPagina(pk: PkStep, m: string, pagLibro: number): Promise<{ id: string; pagina: number; nome: string }> {
    const L = pk.risorse.libri[m], ass = pagLibro + L.offset, primo = Math.floor((ass - 1) / L.blocco) * L.blocco + 1;
    let id = L.file[String(primo)];
    const pref = String(primo).padStart(3, '0');
    if (!id) { const f = (await elenco(L.cartella)).find(x => x.name.startsWith(pref) && /\.pdf$/i.test(x.name)); if (!f) throw new Error('PDF del libro non trovato (inizio ' + pref + ').'); id = f.id; }
    return { id, pagina: ass - primo + 1, nome: L.nome + ' p. ' + pagLibro };
  }

  return { togliSito, pkStep, pkPiano, pkPiani, pianiAttivi, nascosto, nascondiPiano, pianiVirtuali, segnaStepAMano, importa, caricaDalSito, caricaDaDrive, prog, fatta, segna, pagineSet, intervalli, numeri, schedeDi, trovaSotto, etichetta,
    dataVoce, stepFatto, vociDelGiorno, inRitardo, sposta, idQuiz, pdfPagina };
})();

// ---------- Visore a tutto schermo (quiz e PDF) ----------
function visore(titolo: string, alChiudi?: () => void): { corpo: HTMLElement; barra: HTMLElement; chiudi: () => void } {
  const corpo = h('div.visore-corpo'), barra = h('div.visore-strumenti');
  const chiudi = () => { el.remove(); if (alChiudi) alChiudi(); };
  const el = h('div.visore', null, h('div.visore-testa', null, h('button.btn-testo', { onclick: chiudi }, 'Chiudi'), h('div.foglio-titolo.visore-titolo', null, titolo), barra), corpo);
  document.body.appendChild(el);
  return { corpo, barra, chiudi };
}
function serveGoogle(): boolean {
  if (Drive.pronto) return false;
  Drive.login(); avviso('Accedi a Google, poi tocca di nuovo.'); return true;
}
/** Apre una mini-app quiz HTML dentro l'app, in un iframe isolato (sandbox). Il file su Drive non viene modificato. */
async function apriQuiz(pk: PkStep, m: string, micro: string, s: SchedaS, cb?: (d: RisultatoQuiz) => void): Promise<void> {
  // Schede dei corsi propri: file qualsiasi (PDF → visore, HTML → iframe, altro → link)
  if (s.file && !(s.file.mime || '').includes('html') && !/\.html?$/i.test(s.file.nome)) {
    if (s.file.id && /pdf/i.test(s.file.mime || s.file.nome)) { if (serveGoogle()) return; apriPdf(s.file.id, 1, s.file.nome); return; }
    if (s.file.url) { window.open(s.file.url, '_blank', 'noopener'); return; }
  }
  if (s.file && s.file.id) s = { ...s, quizFileId: s.file.id };
  if (!s.quizFileId && !s.file && pk.proprio) { avviso('Questa scheda non ha un file collegato.'); return; }
  if (serveGoogle()) return;
  const v = visore((cb ? '🧊 ' : '') + micro + ' · scheda ' + s.k + '/' + s.n, () => { if (!cb) apriScheda(pk, m, micro, s); else disegna(); });
  v.corpo.appendChild(h('div.vuoto.centro', null, 'Scarico il quiz da Drive…'));
  try {
    let html = await Drive.scaricaTesto(await Studio.idQuiz(pk, m, micro, s));
    // Nell'iframe isolato localStorage non esiste: ne fornisco uno in memoria, solo a schermo.
    const toppa = '<script>try{window.localStorage.getItem("x")}catch(e){(function(){var m={};var s={getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}}};try{Object.defineProperty(window,"localStorage",{value:s});Object.defineProperty(window,"sessionStorage",{value:s})}catch(_){}})()}<\/script>';
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, x => x + toppa) : html.replace(/<html[^>]*>/i, x => x + toppa);
    html = Cattura.inietta(html); // v0.9: legge il risultato finale (il file su Drive non cambia)
    html = Spiega.inietta(html);  // v0.21: riquadro «✨ Spiegazione AI» sotto la correzione
    svuota(v.corpo);
    const fr = h('iframe.visore-frame', { sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals', srcdoc: html, title: s.titolo }) as HTMLIFrameElement;
    v.corpo.appendChild(fr);
    Cattura.osserva(fr, s.id, s.titolo, cb);
  } catch (e: any) { svuota(v.corpo); v.corpo.appendChild(h('div.vuoto.centro', null, String(e.message || e))); }
}

declare const pdfjsLib: any;
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
/**
 * Cache dei PDF dei libri sul dispositivo (Cache Storage): il primo apertura scarica il file intero
 * mostrando l'avanzamento, le successive sono istantanee e funzionano anche offline.
 * Tiene al massimo MAX file (i meno usati escono per primi).
 */
const PdfCache = (() => {
  const NOME = 'imc-pdf', MAX = 10, CH = 'imc-pdf-uso';
  const url = (id: string) => location.origin + '/__pdf/' + id;
  const uso = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(CH) || '{}'); } catch (_) { return {}; } };
  const segna = (u: Record<string, number>) => { try { localStorage.setItem(CH, JSON.stringify(u)); } catch (_) { /* niente */ } };
  async function cache(): Promise<Cache | null> { try { return await caches.open(NOME); } catch (_) { return null; } }
  async function presente(id: string): Promise<boolean> { const c = await cache(); return !!(c && await c.match(url(id))); }
  async function prendi(id: string, avanz?: (fatti: number, tot: number) => void): Promise<Uint8Array> {
    const c = await cache(), u = uso();
    const vecchia = c && await c.match(url(id));
    if (vecchia) { u[id] = Date.now(); segna(u); return new Uint8Array(await vecchia.arrayBuffer()); }
    const token = await Drive.tokenValido(false);
    if (!token) throw new Error('Accedi a Google per scaricare il PDF.');
    const r = await fetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok || !r.body) throw new Error('Download non riuscito (' + r.status + ').');
    const tot = parseInt(r.headers.get('content-length') || '0', 10), pezzi: Uint8Array[] = [], lettore = r.body.getReader();
    let fatti = 0;
    for (;;) { const { done, value } = await lettore.read(); if (done) break; pezzi.push(value); fatti += value.length; if (avanz) avanz(fatti, tot); }
    const tutto = new Uint8Array(fatti); let pos = 0; for (const p of pezzi) { tutto.set(p, pos); pos += p.length; }
    if (c) {
      try {
        await c.put(url(id), new Response(tutto.slice(0), { headers: { 'content-type': 'application/pdf' } }));
        u[id] = Date.now();
        for (const vecchio of Object.keys(u).sort((a, b) => u[b] - u[a]).slice(MAX)) { await c.delete(url(vecchio)); delete u[vecchio]; }
        segna(u);
      } catch (_) { /* spazio esaurito: lo uso senza salvarlo */ }
    }
    return tutto;
  }
  return { prendi, presente };
})();

/** Visualizzatore PDF integrato (pdf.js), alla pagina indicata. */
async function apriPdf(fileId: string, pagina: number, titolo: string): Promise<void> {
  if (serveGoogle()) return;
  const v = visore(titolo);
  const stato = h('div.vuoto.centro', null, 'Apro il PDF…'); v.corpo.appendChild(stato);
  try {
    await new Promise<void>((ok, ko) => { if (typeof pdfjsLib !== 'undefined') return ok(); const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js'; s.onload = () => ok(); s.onerror = () => ko(new Error('Impossibile caricare il lettore PDF (serve la rete).')); document.head.appendChild(s); });
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    const dati = await PdfCache.prendi(fileId, (f, t) => { stato.textContent = 'Scarico il PDF… ' + (t ? Math.round(f / t * 100) + '%' : Math.round(f / 1048576) + ' MB') + ' (solo la prima volta)'; });
    stato.textContent = 'Apro il PDF…';
    const doc = await pdfjsLib.getDocument({ data: dati }).promise;
    let p = Math.min(Math.max(1, pagina), doc.numPages), zoom = 1, giro = 0;
    const tela = h('canvas.pdf-tela') as HTMLCanvasElement, num = h('span.pdf-num');
    async function mostra(): Promise<void> {
      const mio = ++giro; num.textContent = p + ' / ' + doc.numPages;
      const pag = await doc.getPage(p); if (mio !== giro) return;
      const larg = v.corpo.clientWidth - 8, base = pag.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2), scala = (larg / base.width) * zoom;
      const vp = pag.getViewport({ scale: scala * dpr });
      tela.width = vp.width; tela.height = vp.height; tela.style.width = vp.width / dpr + 'px';
      await pag.render({ canvasContext: tela.getContext('2d'), viewport: vp }).promise;
    }
    svuota(v.corpo); v.corpo.classList.add('pdf'); v.corpo.appendChild(tela);
    aggiungi(v.barra, [
      h('button.btn-ico', { 'aria-label': 'Pagina precedente', onclick: () => { if (p > 1) { p--; v.corpo.scrollTop = 0; mostra(); } } }, icona('sx')), num,
      h('button.btn-ico', { 'aria-label': 'Pagina successiva', onclick: () => { if (p < doc.numPages) { p++; v.corpo.scrollTop = 0; mostra(); } } }, icona('dx')),
      h('button.btn-ico', { 'aria-label': 'Ingrandisci', onclick: () => { zoom = zoom >= 2.5 ? 1 : zoom + 0.5; mostra(); } }, icona('cerca')),
    ]);
    await mostra();
  } catch (e: any) { stato.textContent = 'Non riesco ad aprire il PDF: ' + String(e.message || e); if (!stato.isConnected) { svuota(v.corpo); v.corpo.appendChild(stato); } }
}

/** Foglio di una scheda: fatta, data, punteggio, nota errori, quiz, pagine del libro. */
function apriScheda(pk: PkStep, m: string, micro: string, s: SchedaS, ripasso = false): void {
  const p = Studio.prog(s.id);
  // Ripasso (v0.7): data di oggi e punteggio vuoto; si salva solo se scrivi il nuovo punteggio.
  const fatta = h('input', { type: 'checkbox', checked: !!(p && p.fatta) }) as HTMLInputElement;
  const data = h('input', { type: 'date', value: ripasso ? ymd(new Date()) : p && p.data || '' }) as HTMLInputElement;
  const punti = h('input', { type: 'number', min: '0', max: '100', inputMode: 'numeric', placeholder: ripasso && p && p.punteggio != null ? 'prima ' + p.punteggio + '%' : '%', value: !ripasso && p && p.punteggio != null ? String(p.punteggio) : '' }) as HTMLInputElement;
  const nota = h('textarea', { rows: 3, placeholder: 'Errori, cose da rivedere…', value: p && p.nota || '' }) as HTMLTextAreaElement;
  const rifare = h('input', { type: 'checkbox', checked: !!(p && p.daRifare) }) as HTMLInputElement;
  punti.oninput = () => { if (punti.value !== '') fatta.checked = true; };
  const L = pk.risorse.libri[m] || { nome: mat0(pk, m).libro || 'libro' } as LibroS;
  const blocchi = Studio.intervalli(Studio.pagineSet(s.pagine)).split(', ').filter(Boolean);
  const apribili = pk.risorse.libri[m] ? blocchi.filter(b => /^\d/.test(b)) : [];
  const f = foglio({
    titolo: (ripasso ? '🧠 Ripasso · ' : '') + micro + ' · scheda ' + s.k + '/' + s.n,
    corpo: h('div.modulo', null,
      h('div.gruppo', { style: { padding: '12px 14px' } }, h('div.voce-titolo', { style: { whiteSpace: 'normal' } }, s.titolo),
        h('div.chips', { style: { marginTop: '8px' } }, h('span.etichetta.' + (s.tipo === 'P' ? 'prior' : 'raff'), null, s.tipo === 'P' ? 'PRIORITARIA' : 'RAFFINAMENTO'), s.problemi ? h('span.etichetta', null, 'Problemi da risolvere') : null)),
      h('div.bottoni', null,
        h('button.btn', { onclick: () => { salva(); f.chiudi(); apriQuiz(pk, m, micro, s); } }, pk.proprio ? (s.file ? 'Apri il file' : 'Nessun file') : 'Apri il quiz'),
        pk.proprio ? null : h('button.btn.neutro', { onclick: () => { salva(); f.chiudi(); QuizApp.apri(pk, m, micro, s); } }, '🧩 Quiz nell\'app'),
        Generatori.per(m, micro).length ? h('button.btn.neutro', { onclick: () => { salva(); f.chiudi(); QuizApp.apri(pk, m, micro, s, () => Generatori.serie(m, micro)); } }, '🎲 Esercizi nuovi') : null,
        h('button.btn.neutro', { onclick: () => { salva(); f.chiudi(); Timer.avvia({ m, k: m + micro.split('.').slice(0, 2).join('.'), schedaId: s.id, titolo: s.titolo }); } }, '▶ Timer')),
      pk.proprio ? h('button.btn-testo', { onclick: () => { f.chiudi(); editorSchedaPropria(pk, mat0(pk, m), mat0(pk, m).sottostep.find(ss => ss.microstep.some(mm => mm.schede.some(x => x.id === s.id)))!, s); } }, 'Modifica scheda') : null,
      h('div.gruppo', null, riga('Fatta', fatta), riga('Data', data), riga('Punteggio %', punti), riga('Da rifare', rifare)),
      ripasso ? h('div.tenue.piccolo', null, 'Rifai il quiz senza guardare gli appunti, poi scrivi il nuovo punteggio: l\'app calcola il prossimo ripasso.') : h('div.tenue.piccolo', null, 'Con un punteggio sotto il ' + sogliaErrori() + '% la scheda va da sola in Studio → Errori.'),
      h('div.gruppo', null, h('div.gruppo-titolo', null, 'Nota errori'), nota),
      h('div.gruppo', null, h('div.gruppo-titolo', null, blocchi.length ? 'Libro (' + L.nome + ') — pp. ' + blocchi.join(', ') : 'Nessuna pagina del libro'),
        h('div.chips', { style: { margin: '4px 0 10px' } }, apribili.map(b => { const pag = parseInt(b, 10); return h('button.chip', { onclick: async () => {
          if (serveGoogle()) return;
          try { const r = await Studio.pdfPagina(pk, m, pag); apriPdf(r.id, r.pagina, r.nome); } catch (e: any) { avviso(String(e.message || e), 6000); }
        } }, 'Apri p. ' + b); })),
        s.slide ? h('div.tenue.piccolo', { style: { paddingBottom: '10px' } }, 'Slide docenti — ' + s.slide) : null),
    ),
    salva: () => { salva(); },
  });
  function salva(): void {
    if (ripasso && punti.value === '') return; // aprire un ripasso senza punteggio non conta
    const v = punti.value === '' ? undefined : Math.max(0, Math.min(100, parseInt(punti.value, 10) || 0));
    const prima = JSON.stringify([!!(p && p.fatta), p && p.data || '', p && p.punteggio, p && p.nota || '', !!(p && p.daRifare)]);
    if (prima === JSON.stringify([fatta.checked, data.value, v, nota.value, rifare.checked])) return;
    Studio.segna(s.id, { fatta: fatta.checked, data: data.value || undefined, punteggio: v, nota: nota.value || undefined, daRifare: rifare.checked });
  }
}

/** Foglio per spostare uno step del piano su un altro giorno (i progressi restano). */
function apriSposta(v: VocePiano, g: GiornoPiano, p: PkPiano): void {
  const attuale = Studio.dataVoce(v, g, p.id);
  const data = h('input', { type: 'date', value: attuale }) as HTMLInputElement;
  const riserve = p.giorni.filter(x => x.voci.some(y => /^RISERVA/.test(y.k)) || x.nota && /leggero/i.test(x.nota));
  const f = foglio({
    titolo: 'Sposta ' + Studio.etichetta(v.k),
    corpo: h('div.modulo', null,
      h('div.gruppo', { style: { padding: '12px 14px' } }, h('div.voce-titolo', { style: { whiteSpace: 'normal' } }, v.t), h('div.tenue.piccolo', null, 'Nel piano: ' + dataLunga(daYmd(g.data)))),
      h('div.gruppo', null, riga('Nuovo giorno', data),
        h('div.chips', { style: { margin: '4px 0 10px' } }, riserve.map(r => h('button.chip', { onclick: () => { data.value = r.data; } }, fmt(daYmd(r.data), { day: 'numeric', month: 'short' }) + (r.voci[0].speciale ? ' · ' + r.voci[0].t : ' · leggero'))))),
      attuale !== g.data ? h('button.btn.neutro', { onclick: () => { Studio.sposta(v.k, null, p.id); f.chiudi(); } }, 'Rimetti al giorno del piano') : null),
    salva: () => { if (data.value) Studio.sposta(v.k, data.value === g.data ? null : data.value, p.id); },
  });
}

function barra(fatte: number, tot: number, colore?: string): HTMLElement {
  return h('div.barra-av', { role: 'progressbar', 'aria-valuenow': String(fatte), 'aria-valuemax': String(tot) }, h('div', { style: { width: (tot ? (fatte / tot) * 100 : 0) + '%', background: colore || 'var(--accento)' } }));
}
/** Riga "blocco studio" per Oggi / calendario. */
function rigaStudio(x: VoceGiorno): HTMLElement {
  const raff = x.p.modo === 'raffinamento', fatto = !x.v.speciale && Studio.stepFatto(x.v.k, x.p), t = Studio.trovaSotto(x.v.k.replace(/^G2-/, ''));
  const sim = !!x.v.speciale && /^(SIM|VERIFICA)/.test(x.v.k); // v0.11: apre la modalità simulazione
  return h('button.voce-lista', { onclick: () => { if (sim) { apriSimulazioni(); return; } if (t) { UI.studioSub = t.sub.k; UI.studioVista = 'schede'; UI.studioStep = t.pk.id; vai('studio'); } else { UI.studioVista = 'piano'; UI.studioPiano = x.p.id; vai('studio'); } } },
    h('span.barra', { style: { background: x.v.speciale ? 'var(--tenue)' : coloreChiave(x.v.k) } }),
    h('span.voce-corpo', null, h('span.voce-titolo', null, x.v.speciale ? null : segnoMateria(x.v.k), (fatto ? '✓ ' : '') + (raff && !x.v.speciale ? 'Raffina ' : '') + (x.v.speciale ? x.v.t : Studio.etichetta(x.v.k) + ' · ' + x.v.t)),
      h('span.voce-sotto', null, x.v.speciale ? (x.v.d || '') + (/^G2-/.test(x.v.k) ? testoCarte(x.v.k.slice(3)) : '') : testoAvanzamento(x.v.k, x.p), x.spostata ? ' · spostato' : '', sim ? ' · ▶ tocca per iniziare' : '')));
}
/** "3/9 prioritarie · 19 pag." (teoria) oppure "1 · priorità ... 2 · raffina ..." (raffinamento). */
/** v0.20.2: flashcard collegate al sotto-step, da aggiungere al sottotitolo delle voci del piano. */
function testoCarte(k: string): string {
  const mz = Carte.mazzi().filter(m => m.sub === k); if (!mz.length) return '';
  const n = Carte.conta(mz.map(m => m.id));
  return ' · 🃏 ' + (n.nuove + n.ripasso ? (n.nuove + n.ripasso) + ' carte oggi' : n.totale + ' carte');
}
function testoAvanzamento(k: string, p: PkPiano): string { return testoAvanzamento0(k, p) + testoCarte(k); }
function testoAvanzamento0(k: string, p: PkPiano): string {
  const t = Studio.trovaSotto(k);
  if (!t) return p.modo === 'raffinamento' ? 'schede in preparazione' : 'schede da creare';
  const n = Studio.numeri(Studio.schedeDi(t.sub));
  if (p.modo !== 'raffinamento') return n.Pf + '/' + n.P + ' prioritarie · ' + n.pagP.size + ' pag. · ' + n.R + ' raff.';
  const piu = Array.from(n.pagR).filter(x => !n.pagP.has(x)).length;
  const err = Studio.schedeDi(t.sub).filter(s => daRifare(s.id)).length;
  return '1 · priorità: ' + (err ? err + ' schede da rifare' : 'rifai le prioritarie sbagliate') + ', rileggi ' + n.pagP.size + ' pag. · 2 · raffina: ' + n.Rf + '/' + n.R + ' schede (+' + piu + ' pag.)';
}
function indicatoreStudio(): HTMLElement | null {
  if (!Studio.pkPiani().length) return null;
  const r = Studio.inRitardo();
  const ind = h('button.indicatore.' + (r.length ? 'ritardo' : 'pari'), { onclick: () => { UI.studioVista = 'piano'; vai('studio'); } },
    r.length ? 'In ritardo di ' + r.length + ' step: ' + r.map(v => Studio.etichetta(v.k)).join(', ') : 'In pari con il piano');
  // v0.10: ripianificazione in un tocco (solo piano principale)
  return Ripianifica.inRitardo().length ? h('div', null, ind, h('button.btn.neutro', { style: { marginTop: '8px', width: '100%' }, onclick: () => apriRipianifica() }, '↻ Ripianifica i ritardi')) : ind;
}

// ---------- Vista STUDIO ----------
function vistaStudio(): HTMLElement {
  const pks = Studio.pkStep(), piano = Studio.pkPiano();
  if (UI.studioSub) { const t = Studio.trovaSotto(UI.studioSub); if (t) return vistaSottostep(t.pk, t.mat, t.sub); UI.studioSub = null; }
  const pk = pks.find(p => p.id === UI.studioStep) || pks[pks.length - 1];
  const voci: [typeof UI.studioVista, string][] = [['schede', 'Schede'], ['carte', 'Carte'], ['piano', 'Piano'], ['errori', 'Errori'], ['statistiche', 'Statistiche'], ['esami', 'Esami'], ['syllabus', 'Syllabus'], ['tabelle', 'Tabelle']];
  const seg = h('div.segmenti.scorre', { role: 'tablist' }, voci.map(([v, t]) => h('button' + (UI.studioVista === v ? '.attivo' : ''), { role: 'tab', onclick: () => { UI.studioVista = v; UI.pianoScorso = false; disegna(); } }, t)));
  if (UI.studioVista === 'carte') return h('div.pagina', null, seg, vistaCarte());
  if (UI.studioVista === 'tabelle') return h('div.pagina', null, seg, vistaTabelle());
  if (UI.studioVista === 'errori') return h('div.pagina', null, seg, vistaErrori());
  if (UI.studioVista === 'statistiche') return h('div.pagina', null, seg, vistaStatistiche());
  if (UI.studioVista === 'esami') return h('div.pagina', null, seg, vistaEsami());
  if (UI.studioVista === 'syllabus' && piano) return h('div.pagina', null, seg, vistaCopertura(piano));
  if (UI.studioVista === 'piano' && piano) {
    const piani = Studio.pkPiani(), scelto = piani.find(p => p.id === UI.studioPiano) || piani.find(p => { const g = p.giorni; return g.length && ymd(oggi()) <= g[g.length - 1].data; }) || piano;
    return h('div.pagina', null, seg, indicatoreStudio(),
      piani.length > 1 ? h('div.chips', null, piani.map(p => h('button.chip' + (p.id === scelto.id ? '.attivo' : ''), { onclick: () => { UI.studioPiano = p.id; UI.pianoScorso = false; disegna(); } }, p.titolo))) : null,
      scelto.nota ? h('div.tenue.piccolo', null, scelto.nota) : null,
      bottoniGeneratore(scelto),
      Ripianifica.inRitardo(ymd(new Date()), scelto).length && scelto.id !== (Studio.pkPiano() || { id: '' }).id ? h('button.btn.neutro', { onclick: () => apriRipianifica(scelto) }, '↻ Ripianifica i ritardi di questo piano') : null,
      vistaPiano(scelto));
  }
  if (UI.studioVista !== 'schede') UI.studioVista = 'schede';
  if (!pk) return h('div.pagina', null, seg, vuoto('Nessun corso di studio. Crea il tuo corso (qualsiasi materia o esame) oppure aggiorna i pacchetti dal Drive.'), h('button.btn', { onclick: () => editorCorso() }, '+ Nuovo corso di studio'), bottoneDrive());

  const tutte = pk.materie.flatMap(m => m.sottostep.flatMap(Studio.schedeDi)), T = Studio.numeri(tutte);
  return h('div.pagina', null, seg, indicatoreStudio(),
    h('div.chips', null, pks.map(p => h('button.chip' + (p.id === pk.id ? '.attivo' : ''), { onclick: () => { UI.studioStep = p.id; disegna(); } }, (p.proprio ? '★ ' : '') + p.titolo)),
      h('button.chip', { onclick: () => editorCorso() }, '+ Nuovo corso')),
    pk.proprio ? h('div.bottoni', null, h('button.btn.neutro', { onclick: () => editorCorso(pk) }, 'Modifica corso'), h('button.btn.neutro', { onclick: () => editorSottostep(pk) }, '+ Aggiungi argomento')) : null,
    pk.descrizione ? h('div.tenue.piccolo', null, pk.descrizione) : null,
    h('section.card', null, h('h2.card-titolo', null, pk.titolo + ' · totale'),
      h('div.numeri', null, numero(T.Pf + '/' + T.P, 'prioritarie'), numero(T.Rf + '/' + T.R, 'raffinamento'), numero(T.pagLette.size + '/' + T.pagT.size, 'pagine lette')),
      barra(T.Pf, T.P)),
    pk.materie.map(m => {
      const N = Studio.numeri(m.sottostep.flatMap(Studio.schedeDi));
      return h('section.card', null, h('h2.card-titolo', { style: { color: coloreMateria(m.m) } }, formaMateria(m.m) + ' ' + m.nome + (m.libro ? ' · ' + m.libro : '')),
        m.sottostep.map(s => { const n = Studio.numeri(Studio.schedeDi(s)); return h('button.voce-lista.sotto', { onclick: () => { UI.studioSub = s.k; disegna(); } },
          h('span.voce-corpo', null,
            h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, s.n + ' · ' + s.titolo, chipRicordo(s.k)),
            h('span.voce-sotto', null, 'Prior. ' + n.Pf + '/' + n.P + ' · Raff. ' + n.Rf + '/' + n.R + ' · pag. ' + n.pagP.size + ' / ' + n.pagR.size + ' / ' + n.pagT.size),
            h('span.voce-sotto', null, s.posizione), barra(n.Pf, n.P, coloreMateria(m.m))), icona('dx', 18)); }),
        h('div.totale-riga', null, 'Totale ' + m.nome + ': ' + N.P + ' prior. · ' + N.R + ' raff. · pag. ' + N.pagP.size + ' / ' + N.pagR.size + ' / ' + N.pagT.size));
    }),
    h('div.tenue.piccolo', null, 'pag. = prioritarie / raffinamento / totali (unione, non somma). Aggiornato: ' + pk.aggiornato + '.'),
    bottoneDrive());
}
function numero(v: string, eti: string): HTMLElement { return h('div.numero', null, h('strong', null, v), h('span', null, eti)); }
function bottoneDrive(): HTMLElement {
  return h('button.btn.neutro', { onclick: async () => {
    if (serveGoogle()) return;
    try { const n = await Studio.caricaDaDrive(); avviso(n ? 'Pacchetti aggiornati da Drive: ' + n : 'Nessun pacchetto nuovo su Drive.'); } catch (e: any) { avviso(String(e.message || e), 6000); }
  } }, 'Aggiorna pacchetti da Drive');
}

function vistaSottostep(pk: PkStep, mat: MateriaS, sub: SottoS): HTMLElement {
  const sch = Studio.schedeDi(sub), n = Studio.numeri(sch), col = coloreMateria(mat.m);
  const blocco = (eti: string, cls: string, k: number, f: number, pag: Set<string>) => h('div.blocco.' + cls, null, h('strong', null, eti), h('span', null, f + '/' + k + ' schede · ' + pag.size + ' pag.'), h('span.tenue.piccolo', null, pag.size ? (mat.libro ? mat.libro + ': ' : '') + 'pp. ' + Studio.intervalli(pag) : '—'));
  return h('div.pagina', null,
    h('button.btn-testo.indietro', { onclick: () => { UI.studioSub = null; disegna(); } }, '‹ ' + pk.titolo),
    h('section.card', null, h('h2.sub-titolo', { style: { color: col } }, mat.nome + ' ' + sub.n, chipRicordo(sub.k)), h('div.voce-titolo', { style: { whiteSpace: 'normal' } }, sub.titolo),
      h('div.tenue.piccolo', null, sub.posizione), sub.ripasso ? h('div.tenue.piccolo', null, 'Ripasso: ' + sub.ripasso) : null,
      barra(n.Pf, n.P, col),
      h('div.blocchi', null, blocco('PRIORITARIE', 'prior', n.P, n.Pf, n.pagP), blocco('RAFFINAMENTO', 'raff', n.R, n.Rf, n.pagR), blocco('TOTALE', 'tot', n.P + n.R, n.Pf + n.Rf, n.pagT)),
      h('div.tenue.piccolo', null, 'Pagine lette: ' + n.pagLette.size + ' di ' + n.pagT.size), rigaFreddo(sub.k), rigaCarte(sub.k)),
    h('div.bottoni', null,
      h('button.btn', { onclick: () => Timer.avvia({ m: mat.m, k: sub.k, titolo: mat.nome + ' ' + sub.n + ' · ' + sub.titolo }) }, '▶ Avvia timer di studio'),
      pk.proprio ? h('button.btn.neutro', { onclick: () => editorSottostep(pk, mat, sub) }, 'Modifica') : null),
    pk.proprio ? h('button.btn.neutro', { onclick: () => editorSchedaPropria(pk, mat, sub) }, '+ Aggiungi scheda') : null,
    !pk.risorse.libri[mat.m] ? null : (h('button.btn.neutro', { onclick: async (e: Event) => {
      if (serveGoogle()) return;
      const b = e.currentTarget as HTMLButtonElement, ids = new Map<string, string>();
      try {
        for (const p of Array.from(n.pagT).filter(x => /^\d/.test(x))) { const r = await Studio.pdfPagina(pk, mat.m, +p); ids.set(r.id, r.nome); }
        let i = 0;
        for (const id of Array.from(ids.keys())) { i++; await PdfCache.prendi(id, (f, t) => { b.textContent = 'Scarico PDF ' + i + '/' + ids.size + '… ' + (t ? Math.round(f / t * 100) + '%' : ''); }); }
        b.textContent = 'PDF del libro pronti anche offline ✓';
      } catch (err: any) { b.textContent = 'Scarica i PDF del libro'; avviso(String(err.message || err), 6000); }
    } }, 'Scarica i PDF del libro (apertura immediata)')),
    h('label.riga.filtro', null, h('span.riga-eti', null, 'Solo prioritarie'), h('span.interruttore', null, h('input', { type: 'checkbox', checked: UI.soloPrior, onchange: (e: Event) => { UI.soloPrior = (e.target as HTMLInputElement).checked; disegna(); } }), h('span'))),
    sub.microstep.map(mi => {
      const lista = mi.schede.filter(s => !UI.soloPrior || s.tipo === 'P').sort((a, b) => a.k - b.k); if (!lista.length) return null;
      const mn = Studio.numeri(mi.schede);
      return h('section.card', null, h('h2.card-titolo.riga-tra', null, h('span', null, 'Microstep ' + mi.n), h('span.tenue.piccolo', null, (mn.Pf + mn.Rf) + '/' + mi.schede.length + ' · ' + mn.pagT.size + ' pag.')),
        barra(mn.Pf + mn.Rf, mi.schede.length, col),
        lista.map(s => { const p = Studio.prog(s.id), ok = !!(p && p.fatta); return h('div.voce-lista.task' + (ok ? '.fatto' : ''), null,
          h('button.spunta' + (ok ? '.on' : ''), { 'aria-label': ok ? 'Segna da fare' : 'Segna fatta', style: { '--c': col }, onclick: () => Studio.segna(s.id, { fatta: !ok }) }, ok ? '✓' : ''),
          h('button.voce-corpo', { onclick: () => apriScheda(pk, mat.m, mi.n, s) },
            h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, s.titolo, h('span.tenue', null, ' (' + s.k + '/' + s.n + ')')),
            h('span.voce-sotto', null, h('span.etichetta.' + (s.tipo === 'P' ? 'prior' : 'raff'), null, s.tipo === 'P' ? 'PRIOR.' : 'RAFF.'), s.problemi ? ' problemi ·' : '', ' pp. ' + Studio.intervalli(Studio.pagineSet(s.pagine)),
              p && p.punteggio != null ? ' · ' + p.punteggio + '%' : '', p && p.nota ? ' · 📝' : ''))); }));
    }));
}

function vistaPiano(piano: PkPiano): HTMLElement {
  const oggiK = ymd(oggi()), lista = h('div.agenda');
  // raggruppo per data effettiva (tenendo conto degli spostamenti)
  const perData = new Map<string, { v: VocePiano; g: GiornoPiano }[]>();
  for (const g of piano.giorni) { if (!perData.has(g.data)) perData.set(g.data, []); for (const v of g.voci) { const d = Studio.dataVoce(v, g, piano.id); if (!perData.has(d)) perData.set(d, []); perData.get(d)!.push({ v, g }); } }
  for (const d of Array.from(perData.keys()).sort()) {
    const g = daYmd(d), gp = piano.giorni.find(x => x.data === d), voci = perData.get(d)!;
    lista.appendChild(h('div.agenda-giorno' + (d === oggiK ? '.oggi' : ''), { id: d === oggiK ? 'piano-oggi' : null },
      h('div.agenda-data', null, h('span.agenda-num', null, String(g.getDate())), h('span.agenda-sett', null, fmt(g, { weekday: 'short' }) + ' · ' + fmt(g, { month: 'short' })), gp && gp.n ? h('span.agenda-sett', null, 'g. ' + gp.n + '/' + piano.giorniTeoria) : null),
      h('div.agenda-voci', null,
        voci.map(({ v, g: go }) => {
          const fatto = !v.speciale && Studio.stepFatto(v.k, piano), t = Studio.trovaSotto(v.k), tardi = !v.speciale && !fatto && d < oggiK;
          return h('div.voce-lista.task' + (fatto ? '.fatto' : ''), null,
            v.speciale ? h('span.barra', { style: { background: 'var(--tenue)' } })
              : h('button.spunta' + (fatto ? '.on' : ''), { style: { '--c': coloreChiave(v.k) }, 'aria-label': 'Step completato', onclick: () => { if (t) { UI.studioSub = v.k; disegna(); } else Studio.segnaStepAMano(v.k, piano, !fatto); } }, fatto ? '✓' : ''),
            h('button.voce-corpo', { onclick: () => { if (t) { UI.studioSub = v.k; disegna(); } } },
              h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, v.speciale ? v.t : Studio.etichetta(v.k) + ' · ' + v.t),
              h('span.voce-sotto' + (tardi ? '.scaduto' : ''), { style: { whiteSpace: 'normal' } }, v.speciale ? (v.d || '') + (/^G2-/.test(v.k) ? testoCarte(v.k.slice(3)) : '') : testoAvanzamento(v.k, piano), tardi ? ' · in ritardo' : '', go.data !== d ? ' · spostato dal ' + fmt(daYmd(go.data), { day: 'numeric', month: 'short' }) : '')),
            v.speciale ? null : h('button.btn-testo', { onclick: () => apriSposta(v, go, piano) }, 'Sposta'));
        }),
        !voci.length ? h('div.tenue.piccolo', { style: { padding: '8px 0' } }, 'Step spostati altrove.') : null,
        gp && gp.nota ? h('div.tenue.piccolo', { style: { padding: '4px 0' } }, gp.nota) : null)));
  }
  setTimeout(() => { const el = document.getElementById('piano-oggi'); if (el && !UI.pianoScorso) { UI.pianoScorso = true; el.scrollIntoView({ block: 'start' }); } }, 30);
  return lista;
}

// ---------- Copertura del syllabus ----------
function vistaCopertura(piano: PkPiano): HTMLElement {
  const cop = piano.copertura || [];
  if (!cop.length) return vuoto('Il piano non contiene la tabella di copertura.');
  const ETI: Record<string, [string, string]> = { E: ['Schede esistenti', 'stato-e'], I: ['Integrazione', 'stato-i'], N: ['Da creare', 'stato-n'] };
  const filtrate = cop.filter(c => (!UI.copMateria || c.m === UI.copMateria) && (!UI.copStato || c.stato === UI.copStato));
  const conta = (st: string) => cop.filter(c => (!UI.copMateria || c.m === UI.copMateria) && c.stato === st).length;
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('div.chips', null, [['', 'Tutte']].concat(Array.from(new Set(cop.map(c => c.m))).map(m => [m, nomeMateria(m)])).map(([m, t]) => h('button.chip' + (UI.copMateria === m ? '.attivo' : ''), { onclick: () => { UI.copMateria = m; disegna(); } }, t))),
    h('div.chips', null, h('button.chip' + (!UI.copStato ? '.attivo' : ''), { onclick: () => { UI.copStato = ''; disegna(); } }, 'Tutti · ' + (conta('E') + conta('I') + conta('N'))),
      ['E', 'I', 'N'].map(st => h('button.chip' + (UI.copStato === st ? '.attivo' : ''), { onclick: () => { UI.copStato = st; disegna(); } }, ETI[st][0] + ' · ' + conta(st)))),
    Array.from(new Set(cop.map(c => c.m))).filter(m => filtrate.some(c => c.m === m)).map(m => h('section.card', null, h('h2.card-titolo', { style: { color: coloreMateria(m) } }, nomeMateria(m) + ' — copertura del syllabus'),
      filtrate.filter(c => c.m === m).map(c => {
        const t = Studio.trovaSotto(c.k), fatto = Studio.stepFatto(c.k, piano);
        return h('button.voce-lista', { onclick: () => { if (t) { UI.studioSub = c.k; disegna(); } } },
          h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal', fontWeight: '550' } }, (fatto ? '✓ ' : '') + c.a),
            h('span.voce-sotto', { style: { whiteSpace: 'normal' } }, h('span.etichetta.' + ETI[c.stato][1], null, ETI[c.stato][0]), ' ' + c.ud + ' · Step ' + c.k.slice(1) + ' · ' + c.quando)));
      }))));
}

function mat0(pk: PkStep, m: string): MateriaS { return pk.materie.find(x => x.m === m) || { m, nome: nomeMateria(m), libro: '', sottostep: [] }; }
