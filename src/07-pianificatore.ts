// ============================================================
// 07-pianificatore.ts — v0.55 (BP4) Pianificatore Neuro-Algoritmico Ibrido.
// Modulo PURO: niente DOM né rete al caricamento. Google Calendar, IA, Drive e IndexedDB arrivano come
// dipendenze iniettate (così la suite 07-SUITE-… lo carica in una vm, come Neuro). Interfaccia: 07-pianiai.ts.
// Invarianti:
//  - opt-in puro: un piano nasce solo dal pulsante «✨ Crea Piano Intelligente»; è un PkPiano isolato
//    (id 'ai-…', origine 'ai_neuro', proprio) e gli altri piani/pacchetti non vengono mai toccati;
//  - al massimo UNA chiamata AI JSON (uscita ≤1800 token, struttura ≤8000 caratteri); se manca o fallisce
//    si usa l'indice locale (TOC) a 0 token;
//  - Google Calendar: si legge solo `primary`; gli eventi dello specchio non contano come occupato (anti-loop);
//  - ipercorrezioni lette sia da statq.neuro (tag/ultimoCaso/daConsolidare + confidenceLog) sia dai campi legacy.
// ============================================================

type LivelloPartenzaAI = 'da_zero' | 'ripasso' | 'raffinamento';
type StatoFattibilita = 'ottimale' | 'serrato' | 'critico';
interface FinestraSettimanale { giornoSettimana: number; oraInizio: string; oraFine: string; }
interface VincoliPianoAI {
  materiaCodice: string; archetipo: string; sorgentiDriveIds: string[]; dataTarget: string;
  livelloPartenza: LivelloPartenzaAI; livelloObiettivo: 1 | 2 | 3 | 4; finestreSettimanali: FinestraSettimanale[]; maxOreGiorno: number;
}
interface SorgenteRef { fileId: string; nomeFile: string; pagine: number[]; chunkIds?: string[]; }
interface UnitaAI { uid: string; titolo: string; prereq: string[]; densita: number; minutiBase: number; fileId?: string; nomeFile?: string; pagine?: [number, number]; concettiChiave: string[]; priorita?: boolean; }
/** Intervallo occupato in ora locale: 'YYYY-MM-DDTHH:MM'. */
interface IntervalloOcc { inizio: string; fine: string; }
interface EventoGCal {
  id?: string; summary?: string; status?: string; transparency?: string; description?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  organizer?: { email?: string }; extendedProperties?: { private?: Record<string, string> };
}
interface SegnaliIper { illusioni: number; lucky: number; tassoErrore: number; risposte: number; attiva: boolean; topErrori: string[]; }
interface RimedioAI { tipo: 'sopravvivenza' | 'piu_minuti' | 'sposta_data'; testo: string; livelloObiettivo?: 1 | 2 | 3 | 4; minutiExtra?: number; nuovaData?: string; }
interface GiornoCapacita { data: string; finestre: [number, number][]; minuti: number; leggero: boolean; }
interface FattibilitaAI {
  stato: StatoFattibilita; rapporto: number; oreNecessarie: number; oreDisponibili: number; bufferPct: number;
  extraIper: boolean; giorni: GiornoCapacita[]; rimedi: RimedioAI[];
}
interface FonteTesto { fileId: string; nome: string; pagine: string[]; }
interface VocePianoAI extends VocePiano {
  ora?: string; min?: number; uid?: string; livelloCognitivo?: 1 | 2 | 3 | 4; sorgenteRef?: SorgenteRef; isRipassoFSRS?: boolean; isBuffer?: boolean;
}
interface GiornoPianoAI extends GiornoPiano { voci: VocePianoAI[]; }
interface PkPianoAI extends PkPiano {
  formato: 'pacchetto-studio'; origine: 'ai_neuro'; proprio: true; vincoliAI: VincoliPianoAI; statoFattibilita: StatoFattibilita;
  giorni: GiornoPianoAI[]; capienza: number; unita: UnitaAI[]; fonteMappa: 'ai' | 'toc'; iper?: boolean;
}
interface DipPianificatore {
  oggi: string;
  /** Occupato da Google Calendar `primary` (già filtrato con occupatoDaEventi). */
  occupato?: (da: string, a: string) => Promise<IntervalloOcc[]>;
  /** Minuti già impegnati da altri piani in quel giorno. */
  minutiAltriPiani?: (data: string) => number;
  statq?: () => any[];
  leggiFonte?: (fileId: string) => Promise<FonteTesto | null>;
  /** Router AI (catena «genera»): riceve i messaggi e { maxOut: 1800 }; restituisce testo o JSON. Assente = 0 token. */
  ia?: (msgs: { role: string; content: string }[], o: { maxOut: number; archetipo?: string }) => Promise<any>;
  /** Unità già note (Ricalcola da oggi): niente estrazione né AI. */
  unita?: UnitaAI[];
  testoIndice?: string;
  pid?: string;
  titolo?: string;
}

const Pianificatore = (() => {
  const LIMITE_SERA = 21 * 60 + 30;
  const BUFFER_DISP = 0.85;
  const MAX_CHARS_STRUTTURA = 8000;
  const MAX_TOKEN_MAPPA = 1800;
  const MOLT: Record<LivelloPartenzaAI, number> = { da_zero: 1, ripasso: 0.55, raffinamento: 0.35 };
  const QUOTE = [0.40, 0.25, 0.20, 0.15];      // L1 comprensione, L2 elaborazione, L3 applicazione, L4 transfer
  const QUOTA_RIPASSO = 0.15;                  // ripassi FSRS: 15% del tempo di L1
  const INTERVALLI = [1, 3, 7, 15];
  const BASE_S0: Record<string, number> = { stem_calcolo: 2.0, scienze_sperimentali: 2.5, umanistico_storico: 3.0, giuridico_economico: 2.8, lingue_letteratura: 2.2, informatica_coding: 2.4 };
  const NOMI_LIV = ['', 'Comprensione', 'Elaborazione', 'Applicazione', 'Transfer'];

  // ---------- date e ore (UTC: niente sorprese con l'ora legale) ----------
  const d0 = (s: string) => { const [a, m, g] = s.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, g)); };
  const ymdU = (d: Date) => d.toISOString().slice(0, 10);
  const piu = (s: string, n: number) => { const d = d0(s); d.setUTCDate(d.getUTCDate() + n); return ymdU(d); };
  const diff = (a: string, b: string) => Math.round((d0(b).getTime() - d0(a).getTime()) / 864e5);
  const minDi = (hhmm: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); return m ? Math.min(24 * 60, +m[1] * 60 + +m[2]) : 0; };
  const hhmm = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
  const arr1 = (x: number) => Math.round(x * 100) / 100;

  // ---------- Stadio 1a: ipercorrezioni (neuro + legacy) ----------
  /** Legge i segnali di ipercorrezione da record statq: tag/ultimoCaso/daConsolidare di `neuro` (BP3), confidenceLog
   *  (certo+sbagliata, incerto+giusta) e i campi legacy (`iper`, `illusioni`, `ipercorrezioni`, `lucky`). */
  function segnaliIper(stats: any[], materia?: string): SegnaliIper {
    let ill = 0, luck = 0, n = 0, ok = 0; const errori: { sk: string; peso: number }[] = [];
    for (const s of stats || []) {
      if (!s || s.deleted || typeof s !== 'object') continue;
      const sk = String(s.sk || ''); if (materia && sk && sk.split('-')[0] !== materia) continue;
      const nn = Math.max(0, +s.n || 0), oo = clamp(+s.ok || 0, 0, nn); n += nn; ok += oo;
      const ne = s.neuro || {}, tag: string[] = Array.isArray(ne.tag) ? ne.tag : [], log: any[] = Array.isArray(s.confidenceLog) ? s.confidenceLog : [];
      const illLog = log.filter(t => t && t.livelloCertezza === 3 && t.corretto === false).length;
      const luckLog = log.filter(t => t && t.livelloCertezza === 1 && t.corretto === true).length;
      const illNeuro = tag.includes('illusione_competenza') || ne.ultimoCaso === 'illusione_competenza' ? 1 : 0;
      const luckNeuro = ne.daConsolidare || ne.ultimoCaso === 'lucky_guess' || tag.includes('lucky_guess') ? 1 : 0;
      const illLegacy = Math.max(+s.iper || 0, +s.illusioni || 0, +s.ipercorrezioni || 0, +(ne.illusioni || 0));
      const luckLegacy = Math.max(+s.lucky || 0, +s.luckyGuess || 0);
      const i = Math.max(illLog, illNeuro, illLegacy), l = Math.max(luckLog, luckNeuro, luckLegacy);
      ill += i; luck += l;
      const peso = (nn - oo) + 2 * i + l; if (peso > 0 && sk) errori.push({ sk, peso });
    }
    const tasso = n ? arr1(1 - ok / n) : 0;
    const top: string[] = []; for (const e of errori.sort((a, b) => b.peso - a.peso)) if (!top.includes(e.sk) && top.length < 5) top.push(e.sk);
    return { illusioni: ill, lucky: luck, tassoErrore: tasso, risposte: n, attiva: ill > 0 || tasso > 0.30, topErrori: top };
  }

  // ---------- Stadio 1b: occupato da Google Calendar (anti-loop) ----------
  /** Eventi di `primary` → intervalli occupati. Esclusi: annullati, «libero» (transparent), e tutto ciò che viene
   *  dallo specchio dell'app (organizer = calendario specchio, proprietà privata imc, firma nella descrizione). */
  function occupatoDaEventi(eventi: EventoGCal[], mirrorId?: string): IntervalloOcc[] {
    const out: IntervalloOcc[] = [];
    for (const e of eventi || []) {
      if (!e || e.status === 'cancelled' || e.transparency === 'transparent') continue;
      if (mirrorId && e.organizer && e.organizer.email === mirrorId) continue;
      if (e.extendedProperties && e.extendedProperties.private && (e.extendedProperties.private.imc || e.extendedProperties.private.imcPiano)) continue;
      if (/\(da Il mio calendario\)|promemoria da Il mio calendario/.test(e.description || '')) continue;
      const s = e.start || {}, f = e.end || {};
      if (s.dateTime && f.dateTime) out.push({ inizio: s.dateTime.slice(0, 16), fine: f.dateTime.slice(0, 16) });
      else if (s.date) { const fine = f.date || piu(s.date, 1); for (let d = s.date; d < fine; d = piu(d, 1)) out.push({ inizio: d + 'T00:00', fine: d + 'T24:00' }); }
    }
    return out;
  }

  /** Finestre libere del giorno: finestre settimanali ∩ (non occupato), tetto 21:30. */
  function finestreLibere(v: VincoliPianoAI, data: string, occ: IntervalloOcc[]): [number, number][] {
    const gs = d0(data).getUTCDay();
    let lib: [number, number][] = (v.finestreSettimanali || []).filter(f => f && +f.giornoSettimana === gs)
      .map(f => [minDi(f.oraInizio), Math.min(minDi(f.oraFine), LIMITE_SERA)] as [number, number]).filter(x => x[1] - x[0] >= 15).sort((a, b) => a[0] - b[0]);
    for (const o of occ || []) {
      const di = o.inizio.slice(0, 10), df = o.fine.slice(0, 10);
      if (data < di || data > df) continue;
      const a = di === data ? minDi(o.inizio.slice(11)) : 0, b = df === data ? minDi(o.fine.slice(11)) : 24 * 60;
      if (b <= a) continue;
      const n: [number, number][] = [];
      for (const [x, y] of lib) { if (b <= x || a >= y) { n.push([x, y]); continue; } if (a > x) n.push([x, a]); if (b < y) n.push([b, y]); }
      lib = n.filter(x => x[1] - x[0] >= 15);
    }
    return lib;
  }

  /** Capacità giorno per giorno da oggi a target−1 (target−1 = giorno leggero, massimo 60 minuti). */
  function capacita(v: VincoliPianoAI, oggi: string, occ: IntervalloOcc[], altri?: (d: string) => number): GiornoCapacita[] {
    const out: GiornoCapacita[] = [], fine = piu(v.dataTarget, -1), tetto = Math.max(0.5, +v.maxOreGiorno || 2) * 60;
    for (let d = oggi; d <= fine; d = piu(d, 1)) {
      const fin = finestreLibere(v, d, occ), lib = fin.reduce((s, x) => s + x[1] - x[0], 0);
      const leggero = d === fine, max = leggero ? 60 : tetto;
      out.push({ data: d, finestre: fin, minuti: Math.max(0, Math.min(lib, max - Math.max(0, altri ? altri(d) || 0 : 0))), leggero });
    }
    return out;
  }

  const frazioneLivelli = (ob: number) => QUOTE.slice(0, clamp(ob || 4, 1, 4)).reduce((s, x) => s + x, 0) + QUOTE[0] * QUOTA_RIPASSO;
  function oreNecessarie(unita: UnitaAI[], v: VincoliPianoAI, seg?: SegnaliIper | null, obiettivo?: number): number {
    const base = (unita || []).reduce((s, u) => s + Math.max(0, +u.minutiBase || 0), 0) / 60;
    return arr1(base * (MOLT[v.livelloPartenza] || 1) * frazioneLivelli(obiettivo || v.livelloObiettivo) * (seg && seg.attiva ? 1.2 : 1));
  }

  // ---------- Stadio 1: fattibilità (0 token) ----------
  function calcolaFattibilita(v: VincoliPianoAI, unita: UnitaAI[], ctx: { oggi: string; occupato?: IntervalloOcc[]; minutiAltriPiani?: (d: string) => number; segnali?: SegnaliIper | null }): FattibilitaAI {
    const giorni = capacita(v, ctx.oggi, ctx.occupato || [], ctx.minutiAltriPiani);
    const disp = arr1(giorni.reduce((s, g) => s + g.minuti, 0) / 60 * BUFFER_DISP), nec = oreNecessarie(unita, v, ctx.segnali);
    const rapporto = arr1(nec / Math.max(0.5, disp));
    const stato: StatoFattibilita = rapporto <= 0.90 ? 'ottimale' : rapporto <= 1.15 ? 'serrato' : 'critico';
    const rimedi: RimedioAI[] = [];
    if (stato === 'critico') {
      const lavoro = Math.max(1, giorni.filter(g => !g.leggero).length), mancano = Math.max(0, nec - disp);
      const sopr = oreNecessarie(unita, v, ctx.segnali, 1);
      rimedi.push({ tipo: 'sopravvivenza', livelloObiettivo: 1, testo: 'Modalità Sopravvivenza: solo comprensione (L1) + ripassi, circa ' + Math.round(sopr) + ' h invece di ' + Math.round(nec) + ' h.' });
      const extra = Math.ceil(mancano * 60 / BUFFER_DISP / lavoro / 5) * 5;
      rimedi.push({ tipo: 'piu_minuti', minutiExtra: extra, testo: 'Aggiungi circa ' + extra + ' minuti al giorno alle finestre di studio.' });
      const media = Math.max(0.25, disp / lavoro), giorniInPiu = Math.ceil(mancano / media);
      const nuova = piu(v.dataTarget, giorniInPiu);
      rimedi.push({ tipo: 'sposta_data', nuovaData: nuova, testo: 'Sposta la data obiettivo al ' + nuova + ' (+' + giorniInPiu + ' giorni).' });
    }
    return { stato, rapporto, oreNecessarie: nec, oreDisponibili: disp, bufferPct: stato === 'serrato' ? 0.08 : stato === 'ottimale' ? 0.10 : 0, extraIper: !!(ctx.segnali && ctx.segnali.attiva), giorni, rimedi };
  }

  // ---------- Stadio 2: struttura delle fonti (indice locale, 0 token) ----------
  /** Righe d'indice «1.2 Titolo ..... 34», «Capitolo 3 – Titolo 51», «Titolo 12». */
  function righeIndice(testo: string): { num: string; titolo: string; pagina?: number }[] {
    const out: { num: string; titolo: string; pagina?: number }[] = [];
    for (const r0 of String(testo || '').split(/\r?\n/)) {
      const r = r0.replace(/\s+/g, ' ').trim(); if (r.length < 3 || r.length > 160 || /^(indice|sommario|contents|index)$/i.test(r)) continue;
      const m = /^(?:(?:cap(?:itolo)?|chapter|unit[àa]|modulo|lezione|parte)\.?\s*)?(\d{1,2}(?:\.\d{1,2}){0,2}|[IVXLC]{1,6})[.)]?\s*[-–—:]?\s+(.+?)(?:\s*\.{2,}\s*|\s+)?(\d{1,4})?$/i.exec(r);
      if (m && m[2] && /[a-zà-ü]/i.test(m[2])) { out.push({ num: m[1], titolo: m[2].replace(/[\s.·…_-]+$/, '').trim(), pagina: m[3] ? parseInt(m[3], 10) : undefined }); continue; }
      const p = /^([A-Za-zÀ-ÿ][^\d]{2,}?)(?:\s*\.{2,}\s*|\s+)(\d{1,4})$/.exec(r);
      if (p) out.push({ num: String(out.length + 1), titolo: p[1].replace(/[\s.·…_-]+$/, '').trim(), pagina: parseInt(p[2], 10) });
    }
    return out.filter((c, i) => !(out[i + 1] && out[i + 1].num.startsWith(c.num + '.')));   // solo le foglie
  }
  const pulisci = (s: string) => String(s || '').replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  /** «FILE_ID | NOME | PAG_START-PAG_END | TITOLO», al massimo 8000 caratteri. */
  function strutturaDaFonti(fonti: FonteTesto[]): string {
    const righe: string[] = [];
    for (const f of fonti || []) {
      if (!f) continue;
      const voci = righeIndice((f.pagine || []).join('\n')), n = Math.max(1, (f.pagine || []).length);
      if (!voci.length) { righe.push([pulisci(f.fileId), pulisci(f.nome), '1-' + n, pulisci(f.nome)].join(' | ')); continue; }
      voci.forEach((c, i) => {
        const a = c.pagina || 1, succ = voci.slice(i + 1).find(x => x.pagina != null), b = succ && succ.pagina! > a ? succ.pagina! - 1 : a + 9;
        righe.push([pulisci(f.fileId), pulisci(f.nome), a + '-' + b, pulisci(c.titolo).slice(0, 80)].join(' | '));
      });
    }
    let out = ''; for (const r of righe) { if (out.length + r.length + 1 > MAX_CHARS_STRUTTURA) break; out += (out ? '\n' : '') + r; }
    return out;
  }
  /** Legge le prime pagine di ogni sorgente (la lettura PDF/Drive è iniettata) e restituisce la struttura. */
  async function estraiStrutturaFonti(fileIds: string[], leggi?: (id: string) => Promise<FonteTesto | null>, testoIndice?: string): Promise<string> {
    const fonti: FonteTesto[] = [];
    if (testoIndice && testoIndice.trim()) fonti.push({ fileId: 'indice', nome: 'Indice incollato', pagine: [testoIndice] });
    for (const id of fileIds || []) { try { const f = leggi ? await leggi(id) : null; if (f) fonti.push(f); } catch (_) { /* fonte illeggibile: si salta */ } }
    return strutturaDaFonti(fonti);
  }
  /** Fallback offline: una unità per riga della struttura, catena lineare di prerequisiti. */
  function unitaDaStruttura(struttura: string): UnitaAI[] {
    const out: UnitaAI[] = [];
    for (const r of String(struttura || '').split('\n')) {
      const p = r.split('|').map(x => x.trim()); if (p.length < 4 || !p[3]) continue;
      const m = /^(\d+)-(\d+)$/.exec(p[2]), a = m ? +m[1] : 1, b = m ? Math.max(+m[1], +m[2]) : a;
      const uid = 'U' + (out.length + 1);
      out.push({ uid, titolo: p[3].slice(0, 60), prereq: out.length ? [out[out.length - 1].uid] : [], densita: 3, minutiBase: clamp((b - a + 1) * 8, 30, 240), fileId: p[0], nomeFile: p[1], pagine: [a, b], concettiChiave: [] });
    }
    return out;
  }

  // ---------- Stadio 3: mapping del curriculum (1 chiamata AI JSON, fallback TOC) ----------
  /** Recupera gli oggetti completi di un array JSON troncato (risposta AI interrotta a metà). */
  function recuperaArrayParziale(raw: string): any[] {
    const s = String(raw || ''), k0 = s.indexOf('unita') >= 0 ? s.indexOf('[', s.indexOf('unita')) : s.indexOf('[');
    if (k0 < 0) return [];
    const out: any[] = []; let prof = 0, ini = -1, str = false, esc = false;
    for (let k = k0 + 1; k < s.length; k++) {
      const c = s[k];
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
      if (c === '"') str = true;
      else if (c === '{') { if (prof === 0) ini = k; prof++; }
      else if (c === '}') { prof--; if (prof === 0 && ini >= 0) { try { out.push(JSON.parse(s.slice(ini, k + 1))); } catch (_) { /* oggetto rotto */ } ini = -1; } if (prof < 0) break; }
      else if (c === ']' && prof === 0) break;
    }
    return out;
  }
  function leggiRisposta(r: any): any[] {
    if (r && typeof r === 'object') return Array.isArray(r) ? r : Array.isArray(r.unita) ? r.unita : [];
    const s = String(r || '').replace(/```(?:json)?/g, '');
    try { const j = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)); if (j && Array.isArray(j.unita)) return j.unita; } catch (_) { /* troncato */ }
    return recuperaArrayParziale(s);
  }
  /** Validazione e grounding: fileId solo tra le sorgenti note, prerequisiti solo tra uid esistenti, valori nei limiti. */
  function normalizzaUnita(lista: any[], struttura: string): UnitaAI[] {
    const noti = new Map<string, string>();
    for (const r of String(struttura || '').split('\n')) { const p = r.split('|').map(x => x.trim()); if (p.length >= 4) noti.set(p[0], p[1]); }
    const solo = noti.size === 1 ? Array.from(noti.keys())[0] : undefined;
    const out: UnitaAI[] = [], uids = new Set<string>();
    for (const x of lista || []) {
      if (!x || typeof x !== 'object' || !String(x.titolo || '').trim()) continue;
      let uid = /^[A-Za-z0-9_-]{1,12}$/.test(String(x.uid || '')) ? String(x.uid) : 'U' + (out.length + 1);
      while (uids.has(uid)) uid += 'b'; uids.add(uid);
      const fileId = noti.has(String(x.fileId)) ? String(x.fileId) : solo;
      const pg = Array.isArray(x.pagine) && x.pagine.length ? x.pagine.map((n: any) => Math.max(1, Math.round(+n) || 1)) : null;
      out.push({ uid, titolo: pulisci(x.titolo).slice(0, 60), prereq: Array.isArray(x.prereq) ? x.prereq.map(String) : [],
        densita: clamp(Math.round(+x.densita || 3), 1, 5), minutiBase: clamp(Math.round(+x.minutiBase || 60), 20, 300),
        fileId, nomeFile: fileId ? noti.get(fileId) : undefined, pagine: pg ? [Math.min(pg[0], pg[pg.length - 1]), Math.max(pg[0], pg[pg.length - 1])] : undefined,
        concettiChiave: (Array.isArray(x.concettiChiave) ? x.concettiChiave : []).map((c: any) => pulisci(c).slice(0, 40)).filter(Boolean).slice(0, 3),
        priorita: x.priorita === true || undefined });
    }
    for (const u of out) u.prereq = u.prereq.filter((p, i, a) => p !== u.uid && uids.has(p) && a.indexOf(p) === i);
    return out;
  }
  function promptMappa(struttura: string, v: VincoliPianoAI, seg: SegnaliIper | null): { role: string; content: string }[] {
    return [
      { role: 'system', content: 'Sei un progettista didattico. Dalla STRUTTURA delle fonti ricava le unità di studio. Rispondi SOLO con JSON: '
        + '{"unita":[{"uid":"U1","titolo":"max 60 caratteri","prereq":["uid"],"densita":1-5,"minutiBase":numero,"fileId":"FILE_ID della struttura","pagine":[inizio,fine],"concettiChiave":["3 concetti"],"priorita":true|false}]}. '
        + 'Usa solo FILE_ID e pagine presenti nella struttura; niente testo fuori dal JSON.' },
      { role: 'user', content: 'Materia: ' + v.materiaCodice + ' (archetipo ' + v.archetipo + '). Partenza: ' + v.livelloPartenza + '. Obiettivo: livello ' + v.livelloObiettivo + ' di 4. Data: ' + v.dataTarget + '.\n'
        + (seg && seg.attiva ? 'Errori ricorrenti (priorità alta): ' + seg.topErrori.join(', ') + '. Illusioni di competenza: ' + seg.illusioni + ', risposte fortunate: ' + seg.lucky + '.\n' : '')
        + 'STRUTTURA (FILE_ID | NOME | PAGINE | TITOLO):\n' + String(struttura || '').slice(0, MAX_CHARS_STRUTTURA) },
    ];
  }
  /** Una sola chiamata JSON al router (≤1800 token di uscita). Qualsiasi errore (429 su tutta la catena, offline,
   *  JSON vuoto) → unità dall'indice locale, 0 token. */
  async function mappaCurriculumAI(struttura: string, v: VincoliPianoAI, seg: SegnaliIper | null, ia?: DipPianificatore['ia']): Promise<{ unita: UnitaAI[]; fonte: 'ai' | 'toc'; chiamate: number; tokenStimati: number; errore?: string }> {
    const toc = unitaDaStruttura(struttura);
    if (!ia || !String(struttura || '').trim()) return { unita: toc, fonte: 'toc', chiamate: 0, tokenStimati: 0 };
    const msgs = promptMappa(struttura, v, seg);
    try {
      const u = normalizzaUnita(leggiRisposta(await ia(msgs, { maxOut: MAX_TOKEN_MAPPA, archetipo: v.archetipo })), struttura);
      if (u.length) return { unita: u, fonte: 'ai', chiamate: 1, tokenStimati: stimaToken(struttura) };
      return { unita: toc, fonte: 'toc', chiamate: 1, tokenStimati: 0, errore: 'risposta AI senza unità' };
    } catch (e: any) { return { unita: toc, fonte: 'toc', chiamate: 1, tokenStimati: 0, errore: String(e && e.message || e).slice(0, 120) }; }
  }
  /** Stima mostrata nel wizard: ingresso (prompt + struttura) + uscita massima. */
  const stimaToken = (struttura: string) => Math.round((700 + Math.min(MAX_CHARS_STRUTTURA, String(struttura || '').length)) / 3.5) + MAX_TOKEN_MAPPA;

  // ---------- Stadio 4: timeline (Kahn + livelli L1–L4 + FSRS) ----------
  /** Ordine topologico: tra le unità pronte prima le prioritarie (errori), poi la densità più alta. */
  function ordineTopologico(unita: UnitaAI[]): UnitaAI[] {
    const per = new Map(unita.map(u => [u.uid, u])), grado = new Map(unita.map(u => [u.uid, u.prereq.filter(p => per.has(p)).length]));
    const fatti = new Set<string>(), out: UnitaAI[] = [];
    const chiave = (u: UnitaAI) => (u.priorita ? 0 : 1) * 10 - u.densita;
    while (out.length < unita.length) {
      const pronte = unita.filter(u => !fatti.has(u.uid) && (grado.get(u.uid) || 0) === 0).sort((a, b) => chiave(a) - chiave(b) || unita.indexOf(a) - unita.indexOf(b));
      const u = pronte[0] || unita.find(x => !fatti.has(x.uid))!;   // ciclo: si spezza nell'ordine originale
      fatti.add(u.uid); out.push(u);
      for (const x of unita) if (x.prereq.includes(u.uid)) grado.set(x.uid, Math.max(0, (grado.get(x.uid) || 0) - 1));
    }
    return out;
  }
  const s0 = (arch: string, densita: number, errori: boolean) => arr1((BASE_S0[arch] || 2.5) * (1.25 - 0.12 * densita) * (errori ? 0.65 : 1));
  function intervalliFsrs(S0: number): number[] {
    const f = clamp(S0 / 2.5, 0.6, 1.4), out: number[] = [];
    for (const g of INTERVALLI) out.push(Math.max(out.length ? out[out.length - 1] + 1 : 1, Math.round(g * f)));
    return out;
  }
  interface Compito { u: UnitaAI; liv: 1 | 2 | 3 | 4; parte: number; parti: number; min: number; ordine: number; }
  const pezzi = (min: number) => { const n = Math.max(1, Math.round(min / 45)); const m = Math.max(30, Math.min(50, Math.round(min / n))); return { n, m }; };

  function compilaTimelineNeuro(unita: UnitaAI[], v: VincoliPianoAI, f: FattibilitaAI, seg: SegnaliIper | null, o: { oggi: string; pid: string; titolo?: string }): PkPianoAI {
    const ob = clamp(v.livelloObiettivo || 4, 1, 4), molt = (MOLT[v.livelloPartenza] || 1) * (seg && seg.attiva ? 1.2 : 1);
    const cod = String(v.materiaCodice || 'X').toUpperCase().replace(/[^A-Z]/g, '') || 'X', pidC = o.pid.replace(/^ai-/, '');
    const ordine = ordineTopologico(unita), errori = !!(seg && seg.attiva);
    const ref = (u: UnitaAI): SorgenteRef | undefined => u.fileId ? { fileId: u.fileId, nomeFile: u.nomeFile || '', pagine: u.pagine ? [u.pagine[0], u.pagine[1]] : [] } : undefined;
    // coda dei compiti: L1→L2 subito, L3 almeno 2 giorni dopo L1, L4 almeno 4 (interleaving con le unità successive)
    const coda: Compito[] = []; let ord = 0;
    for (const u of ordine) for (let l = 1; l <= ob; l++) {
      const { n, m } = pezzi(u.minutiBase * molt * QUOTE[l - 1]);
      for (let p = 1; p <= n; p++) coda.push({ u, liv: l as 1 | 2 | 3 | 4, parte: p, parti: n, min: m, ordine: ord++ });
    }
    const giorni = f.giorni.filter(g => g.minuti > 0 || g.leggero), lavoro = giorni.filter(g => !g.leggero);
    const voci = new Map<string, VocePianoAI[]>(giorni.map(g => [g.data, []]));
    const usato = new Map<string, number>(), cursore = new Map<string, number>();
    const dataL1 = new Map<string, string>(), fattiLiv = new Map<string, number>();   // uid → ultimo livello completato
    const ripassi: { data: string; voce: VocePianoAI }[] = [];
    const ultimo = giorni.length ? giorni[giorni.length - 1].data : piu(v.dataTarget, -1);
    /** Trova un orario libero di `min` minuti nelle finestre del giorno (in sequenza). */
    function posto(g: GiornoCapacita, min: number): number | null {
      const c = cursore.get(g.data) || 0;
      for (const [a, b] of g.finestre) { const ini = Math.max(a, c); if (b - ini >= min && ini + min <= LIMITE_SERA) return ini; }
      return null;
    }
    function metti(g: GiornoCapacita, vo: VocePianoAI, min: number): boolean {
      const ini = posto(g, min); if (ini == null) return false;
      vo.ora = hhmm(ini); vo.min = min; cursore.set(g.data, ini + min); usato.set(g.data, (usato.get(g.data) || 0) + min); voci.get(g.data)!.push(vo); return true;
    }
    const pronto = (c: Compito, d: string) => {
      if ((fattiLiv.get(c.u.uid) || 0) < c.liv - 1) return false;
      if (c.parte > 1 && (fattiLiv.get(c.u.uid + '#' + c.liv) || 0) < c.parte - 1) return false;
      if (c.liv === 1) return c.u.prereq.every(p => (fattiLiv.get(p) || 0) >= 1 || !unita.some(x => x.uid === p));
      const l1 = dataL1.get(c.u.uid); if (!l1) return false;
      const attesa = c.liv === 3 ? 2 : c.liv === 4 ? 4 : 0;
      return d >= piu(l1, Math.min(attesa, Math.max(0, diff(l1, lavoro.length ? lavoro[lavoro.length - 1].data : l1))));
    };
    for (const g of lavoro) {
      const tetto = Math.floor(g.minuti * (1 - f.bufferPct));
      // 1) ancoraggi FSRS del giorno (brevi, prima di tutto)
      for (const r of ripassi.filter(x => x.data === g.data)) { if (metti(g, r.voce, r.voce.min!)) r.data = ''; else r.data = piu(g.data, 1); }
      // 2) compiti: alterna «nuovo» (L1–L2) e «profondo» (L3–L4)
      let profondo = false;
      for (let giri = 0; giri < 200; giri++) {
        const resto = tetto - (usato.get(g.data) || 0); if (resto < 30) break;
        const pronti = coda.filter(c => c.min <= resto && pronto(c, g.data));
        if (!pronti.length) break;
        const pref = pronti.find(c => (c.liv >= 3) === profondo) || pronti[0];
        const k = cod + '~' + pidC + '~' + pref.u.uid + '~L' + pref.liv + (pref.parti > 1 ? '-' + pref.parte : '');
        const vo: VocePianoAI = { k, t: pref.u.titolo + ' · L' + pref.liv + ' ' + NOMI_LIV[pref.liv] + (pref.parti > 1 ? ' (' + pref.parte + '/' + pref.parti + ')' : ''), uid: pref.u.uid, livelloCognitivo: pref.liv, sorgenteRef: ref(pref.u) };
        if (!metti(g, vo, pref.min)) { coda.splice(coda.indexOf(pref), 1); coda.push(pref); break; }
        coda.splice(coda.indexOf(pref), 1); profondo = !profondo;
        fattiLiv.set(pref.u.uid + '#' + pref.liv, pref.parte);
        if (pref.parte === pref.parti) fattiLiv.set(pref.u.uid, pref.liv);
        if (pref.liv === 1 && pref.parte === pref.parti) {
          dataL1.set(pref.u.uid, g.data);
          const min = Math.max(15, Math.round(pref.u.minutiBase * molt * QUOTE[0] * QUOTA_RIPASSO / INTERVALLI.length / 5) * 5);
          intervalliFsrs(s0(v.archetipo, pref.u.densita, errori || !!pref.u.priorita)).forEach((gg, i) => {
            const d0r = piu(g.data, gg), d = (giorni.find(x => x.data >= d0r) || { data: '' }).data; if (!d || d > ultimo) return;
            ripassi.push({ data: d, voce: { k: cod + '~' + pidC + '~' + pref.u.uid + '~R' + (i + 1), t: '🔁 Ripasso ' + (i + 1) + ' · ' + pref.u.titolo, uid: pref.u.uid, livelloCognitivo: 1, isRipassoFSRS: true, min, sorgenteRef: ref(pref.u) } });
          });
        }
      }
      // 3) buffer per imprevisti (consumati da Ripianifica e dall'hook post-quiz)
      const buf = Math.min(Math.round(g.minuti * f.bufferPct / 5) * 5, g.minuti - (usato.get(g.data) || 0));
      if (f.bufferPct > 0 && buf >= 20) metti(g, { k: cod + '~' + pidC + '~BUF~' + g.data.replace(/-/g, ''), t: '🧩 Buffer (recupero o anticipo)', isBuffer: true, speciale: true }, buf);
    }
    // giorno leggero (target−1): solo ripassi e riposo attivo, massimo 60 minuti
    const leg = giorni.find(g => g.leggero);
    if (leg) {
      for (const r of ripassi.filter(x => x.data && x.data <= leg.data)) { if ((usato.get(leg.data) || 0) + r.voce.min! <= 60 && metti(leg, r.voce, r.voce.min!)) r.data = ''; }
      voci.get(leg.data)!.push({ k: cod + '~' + pidC + '~RIPOSO', t: '🌿 Riposo attivo (Wakeful Rest): niente studio nuovo', speciale: true, d: 'Giorno prima dell\'obiettivo: al massimo 60 minuti di ripasso leggero.' });
    }
    const avanzi = coda.length;
    const gg: GiornoPianoAI[] = giorni.filter(g => voci.get(g.data)!.length).map((g, i) => ({ data: g.data, n: i + 1, voci: voci.get(g.data)! }));
    return {
      formato: 'pacchetto-studio', tipo: 'piano', id: o.pid, titolo: o.titolo || '✨ Piano intelligente ' + v.materiaCodice, aggiornato: new Date().toISOString(),
      giorniTeoria: gg.length, giorni: gg, origine: 'ai_neuro', proprio: true, vincoliAI: v, statoFattibilita: f.stato,
      capienza: Math.max(3, ...gg.map(x => x.voci.length)) + 1, unita, fonteMappa: 'toc', iper: errori || undefined,
      nota: avanzi ? avanzi + ' attività non sono entrate nel calendario: valuta i rimedi (più minuti o data più lontana).' : undefined,
    };
  }

  // ---------- Stadio 5: hook post-quiz e buffer ----------
  const vociDi = (p: PkPianoAI) => p.giorni.flatMap(g => g.voci.map(v => ({ v, g })));
  const clona = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  /** Dopo un'illusione di competenza (o una risposta fortunata) su una materia del piano ai_neuro: anticipa di 24–48 h
   *  la prossima attività L3/L4 scambiandola con un buffer. Zero token; restituisce il piano nuovo (l'originale resta intatto). */
  function hookIpercorrezione(piano: any, ctx: { oggi: string; sk?: string; uid?: string; caso: string }): { piano: PkPianoAI; k: string; da: string; a: string } | null {
    if (!piano || piano.origine !== 'ai_neuro' || piano.pausa) return null;
    if (ctx.caso !== 'illusione_competenza' && ctx.caso !== 'lucky_guess') return null;
    if (ctx.sk && piano.vincoliAI && String(ctx.sk).split('-')[0].split('~')[0] !== piano.vincoliAI.materiaCodice) return null;
    const p: PkPianoAI = clona(piano), tutte = vociDi(p);
    const cand = tutte.filter(x => (x.v.livelloCognitivo === 3 || x.v.livelloCognitivo === 4) && !x.v.isRipassoFSRS && !x.v.isBuffer && x.g.data > ctx.oggi && (!ctx.uid || x.v.uid === ctx.uid))
      .sort((a, b) => a.g.data < b.g.data ? -1 : a.g.data > b.g.data ? 1 : (a.v.livelloCognitivo || 0) - (b.v.livelloCognitivo || 0));
    for (const c of cand) {
      const buf = tutte.find(x => x.v.isBuffer && x.g.data >= ctx.oggi && x.g.data < c.g.data && diff(x.g.data, c.g.data) <= 2);
      if (!buf) continue;
      // scambio: l'attività va nel posto del buffer, il buffer prende il suo posto
      const iA = c.g.voci.indexOf(c.v), iB = buf.g.voci.indexOf(buf.v), oraA = c.v.ora, oraB = buf.v.ora;
      c.g.voci[iA] = buf.v; buf.g.voci[iB] = c.v; c.v.ora = oraB; buf.v.ora = oraA;
      p.iper = true;
      return { piano: p, k: c.v.k, da: c.g.data, a: buf.g.data };
    }
    return null;
  }
  /** Ripianifica: per le attività in ritardo propone prima i buffer futuri; i ripassi FSRS (ancoraggi) non si spostano. */
  function riassorbi(piano: any, ritardi: string[], oggi: string): { k: string; a: string; buffer: string }[] {
    if (!piano || piano.origine !== 'ai_neuro') return [];
    const tutte = vociDi(piano), liberi = tutte.filter(x => x.v.isBuffer && x.g.data >= oggi).sort((a, b) => a.g.data < b.g.data ? -1 : 1), out: { k: string; a: string; buffer: string }[] = [];
    for (const k of ritardi) {
      const x = tutte.find(y => y.v.k === k); if (!x || x.v.isRipassoFSRS || x.v.isBuffer) continue;
      const b = liberi.shift(); if (!b) break;
      out.push({ k, a: b.g.data, buffer: b.v.k });
    }
    return out;
  }
  /** Toglie dal piano i buffer consumati (nuovo oggetto). */
  function consumaBuffer(piano: any, chiavi: string[]): PkPianoAI {
    const p: PkPianoAI = clona(piano); for (const g of p.giorni) g.voci = g.voci.filter(v => !(v.isBuffer && chiavi.includes(v.k))); return p;
  }

  // ---------- orchestrazione ----------
  /** Crea il piano: segnali → struttura → fattibilità (0 token) → [critico: stop, rimedi] → mapping (1 chiamata o TOC) → timeline. */
  async function creaPiano(v: VincoliPianoAI, dip: DipPianificatore): Promise<{ piano: PkPianoAI | null; fatt: FattibilitaAI; segnali: SegnaliIper; fonte: 'ai' | 'toc'; chiamate: number; tokenStimati: number; struttura: string; errore?: string }> {
    const seg = segnaliIper(dip.statq ? dip.statq() : [], v.materiaCodice);
    let occ: IntervalloOcc[] = [];
    if (dip.occupato) { try { occ = await dip.occupato(dip.oggi, v.dataTarget); } catch (_) { occ = []; } }
    const struttura = dip.unita ? '' : await estraiStrutturaFonti(v.sorgentiDriveIds, dip.leggiFonte, dip.testoIndice);
    const stima = dip.unita || unitaDaStruttura(struttura);
    const ctx = { oggi: dip.oggi, occupato: occ, minutiAltriPiani: dip.minutiAltriPiani, segnali: seg };
    let fatt = calcolaFattibilita(v, stima, ctx);
    if (fatt.stato === 'critico' || !stima.length) return { piano: null, fatt, segnali: seg, fonte: 'toc', chiamate: 0, tokenStimati: 0, struttura };
    const m = dip.unita ? { unita: dip.unita, fonte: 'toc' as const, chiamate: 0, tokenStimati: 0 } : await mappaCurriculumAI(struttura, v, seg, dip.ia);
    if (m.fonte === 'ai') fatt = calcolaFattibilita(v, m.unita, ctx);
    const pid = dip.pid || 'ai-' + Date.now().toString(36);
    const piano = compilaTimelineNeuro(m.unita, v, fatt, seg, { oggi: dip.oggi, pid, titolo: dip.titolo });
    piano.fonteMappa = m.fonte;
    return { piano, fatt, segnali: seg, fonte: m.fonte, chiamate: m.chiamate, tokenStimati: m.tokenStimati, struttura, errore: (m as any).errore };
  }

  return { segnaliIper, occupatoDaEventi, finestreLibere, capacita, oreNecessarie, calcolaFattibilita, righeIndice, strutturaDaFonti, estraiStrutturaFonti,
    unitaDaStruttura, recuperaArrayParziale, normalizzaUnita, promptMappa, mappaCurriculumAI, stimaToken, ordineTopologico, intervalliFsrs, s0,
    compilaTimelineNeuro, hookIpercorrezione, riassorbi, consumaBuffer, creaPiano, LIMITE_SERA, MAX_TOKEN_MAPPA, MAX_CHARS_STRUTTURA };
})();
