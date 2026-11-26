// ============================================================
// 07-pianificatore.ts — v0.55 (BP4) Pianificatore Neuro-Algoritmico Ibrido + v0.56 (BP5) 5 livelli di intensità,
// questionario biopsicologico 6+3 e Burnout Circuit Breaker (deload_48h).
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
  /** v0.56 (BP5, facoltativi): intensità 1–5 e profilo biopsicologico. Assenti = comportamento BP4 invariato. */
  livelloIntensita?: IntensitaPiano; profiloBio?: ProfiloBiopsicologico; pesi?: PesiAdattiviAlgoritmo;
  /** blocco 6: giorni della settimana finale (calendario, D−N…D−1): 7 predefinito, 3 = emergenza solo su conferma, 0 = nessuna. */
  giorniFinale?: number;
}
// ---------- v0.56 (BP5): 5 livelli di intensità, questionario 6+3, Burnout Circuit Breaker ----------
type IntensitaPiano = 1 | 2 | 3;
interface ConfigLivelloIntensita {
  livello: IntensitaPiano; nome: string; oreRealiMin: number; oreRealiMax: number;
  capSforzoAnaliticoMin: number; ritenzioneTargetFSRS: number; itemPerMicroQuiz: number; maxCardAutogenerateGiorno: number;
  abilitaCornellAuto: boolean; abilitaTrabocchetti: boolean; abilitaMiniCasiCatena: boolean;
  gradoInterleaving: 'nessuno' | 'intra_materia' | 'multi_materia'; pauseWakefulRestMin: number; moltiplicatoreResaEquivalente: number;
}
interface BancaMicroQuiz<T extends { id: string }> { microstep: string; domande: T[]; }
interface SessioneMicroQuiz<T extends { id: string }> { microstep: string; richieste: number; disponibili: number; domande: T[]; }
interface ProfiloBiopsicologico {
  fasciaEta: '<16' | '16-19' | '20-26' | '27-40' | '40+';
  cronotipo: 'allodola_mattina' | 'intermedio' | 'pomeridiano' | 'gufo_sera';
  autonomiaBRACMin: 35 | 55 | 80 | 100;
  oreSonnoMedie: '<6' | '6-7' | '7-8' | '>8';
  reazioneErrore: 'sfida_attiva' | 'necessita_scaffolding';
  canalePreferito: 'scrittura_schemi' | 'quiz_immediati' | 'esposizione_orale';
}
interface PesiAdattiviAlgoritmo { w_faded: number; w_cornell: number; w_gemelle: number; w_interleave: number; }
interface OpzioneCalibrazione { testo: string; delta: Partial<PesiAdattiviAlgoritmo>; }
interface DomandaCalibrazione { testo: string; opzioni: OpzioneCalibrazione[]; }
interface DomandaUniversale { campo: keyof ProfiloBiopsicologico; testo: string; opzioni: [string, string][]; }
type TipoSlot = 'L1_codifica' | 'L3_problemi' | 'L3_faded' | 'offloading' | 'flashcard_dip' | 'consolidamento' | 'wakeful_rest';
interface SlotGiornata { ora: string; min: number; tipo: TipoSlot; analitico: boolean; modalita?: string; }
interface GuardRailBio { livello: IntensitaPiano; richiesto: IntensitaPiano; avvisi: string[]; bloccoMin: number; pausaMin: number; }
interface StatoDeload { attivo: boolean; da: string; fino: string; livelloTarget: IntensitaPiano; livelloRidotto: IntensitaPiano; motivo: string; }
interface EsitoFatica { trigger: boolean; condA: boolean; condB: boolean; tasso2g: number; mediaStorica: number; risposte2g: number; iper48: number; iperPrima: number; }
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
interface RimedioAI { tipo: 'sopravvivenza' | 'piu_minuti' | 'sposta_data' | 'finale_breve'; testo: string; livelloObiettivo?: 1 | 2 | 3 | 4; minutiExtra?: number; nuovaData?: string; giorniFinale?: number; }
interface GiornoCapacita { data: string; finestre: [number, number][]; minuti: number; leggero: boolean; }
interface FattibilitaAI {
  stato: StatoFattibilita; rapporto: number; oreNecessarie: number; oreDisponibili: number; bufferPct: number;
  extraIper: boolean; giorni: GiornoCapacita[]; rimedi: RimedioAI[];
}
interface FonteTesto { fileId: string; nome: string; pagine: string[]; }
interface VocePianoAI extends VocePiano {
  ora?: string; min?: number; uid?: string; livelloCognitivo?: 1 | 2 | 3 | 4; sorgenteRef?: SorgenteRef; isRipassoFSRS?: boolean; isBuffer?: boolean;
  /** v0.56: attività di offloading multi-modale / segnaposto del de-load. */
  isOffloading?: boolean; isDeload?: boolean;
}
interface GiornoPianoAI extends GiornoPiano { voci: VocePianoAI[]; }
interface PkPianoAI extends PkPiano {
  formato: 'pacchetto-studio'; origine: 'ai_neuro'; proprio: true; vincoliAI: VincoliPianoAI; statoFattibilita: StatoFattibilita;
  giorni: GiornoPianoAI[]; capienza: number; unita: UnitaAI[]; fonteMappa: 'ai' | 'toc'; iper?: boolean;
  /** v0.56 (BP5, facoltativi): livello effettivo dopo i guard-rail, avvisi, de-load 48 h. */
  livelloIntensita?: IntensitaPiano; avvisiBio?: string[]; deload?: StatoDeload;
}
interface DipPianificatore {
  oggi: string;
  /** Occupato da Google Calendar `primary` (già filtrato con occupatoDaEventi). */
  occupato?: (da: string, a: string) => Promise<IntervalloOcc[]>;
  /** Minuti già impegnati da altri piani in quel giorno. */
  minutiAltriPiani?: (data: string) => number;
  statq?: () => any[];
  /** v0.57 (A16): unica fonte di ritenzione = Ripassi.ritenzione (il minimo è quello del livello d'intensità). */
  ritenzione?: (minimo: number) => number;
  /** v0.57 (A16): curva FSRS di Ripassi (giorni per stabilità s e ritenzione r). */
  intervallo?: (s: number, r: number) => number;
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
  /** v0.58 (Q4): materia di un record statq. I quiz creati in app (sk «qc-…») portano la materia in `materiaQ`
   *  (la aggiunge PianiAI dal record qcreato); gli altri usano il prefisso della scheda `<materia>-<microstep>-<k>`. */
  const materiaSk = (s: { sk?: unknown; materiaQ?: unknown } | null | undefined): string => s && s.materiaQ ? String(s.materiaQ) : String((s && s.sk) || '').split('-')[0].split('~')[0];
  function segnaliIper(stats: any[], materia?: string): SegnaliIper {
    let ill = 0, luck = 0, n = 0, ok = 0; const errori: { sk: string; peso: number }[] = [];
    for (const s of stats || []) {
      if (!s || s.deleted || typeof s !== 'object') continue;
      const sk = String(s.sk || ''); if (materia && sk && materiaSk(s) !== materia) continue;
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

  /**
   * Blocco 6 (audit S2 §10): settimana finale in GIORNI DI CALENDARIO, D−F…D−1 (giorno d'esame escluso); fineNuovi = ultimo giorno
   * per argomenti nuovi (L1–L2). Nella finestra: ripassi FSRS, L3/L4 di unità già iniziate, cumulativi e simulazioni. Calendario e
   * non giorni di studio: «gli ultimi sette giorni» del brief; con 5 giorni di studio a settimana 7 giorni di studio ne
   * occuperebbero 9–10 e ruberebbero tempo ai nuovi argomenti.
   */
  function finestraFinale(esame: string, giorni = 7): { inizio: string; fineNuovi: string } {
    const inizio = piu(esame, -clamp(Math.round(+giorni || 0), 0, 30));
    return { inizio, fineNuovi: piu(inizio, -1) };
  }
  const giorniFin = (v: VincoliPianoAI) => v.giorniFinale == null ? 7 : v.giorniFinale;
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
    const giorni = capacita(v, ctx.oggi, ctx.occupato || [], ctx.minutiAltriPiani), fin = finestraFinale(v.dataTarget, giorniFin(v));
    // blocco 6: il tempo per gli argomenti si conta solo fino a fineNuovi (la settimana finale è per ripasso e simulazioni)
    const disp = arr1(giorni.filter(g => g.data <= fin.fineNuovi).reduce((s, g) => s + g.minuti, 0) / 60 * BUFFER_DISP), nec = oreNecessarie(unita, v, ctx.segnali);
    const rapporto = arr1(nec / Math.max(0.5, disp));
    // v0.55.1: data obiettivo oggi, domani o già passata → non c'è nessun giorno di studio nuovo (target−1 è leggero)
    const vicina = v.dataTarget <= piu(ctx.oggi, 1) || fin.fineNuovi < ctx.oggi;   // blocco 6: esame entro la finestra = niente giorni per argomenti nuovi
    const stato: StatoFattibilita = vicina ? 'critico' : rapporto <= 0.90 ? 'ottimale' : rapporto <= 1.15 ? 'serrato' : 'critico';
    const rimedi: RimedioAI[] = [];
    if (stato === 'critico') {
      const lavoro = Math.max(1, giorni.filter(g => !g.leggero).length), mancano = Math.max(0, nec - disp);
      const sopr = oreNecessarie(unita, v, ctx.segnali, 1);
      rimedi.push({ tipo: 'sopravvivenza', livelloObiettivo: 1, testo: 'Modalità Sopravvivenza: solo comprensione (L1) + ripassi, circa ' + Math.round(sopr) + ' h invece di ' + Math.round(nec) + ' h.' });
      const extra = Math.ceil(mancano * 60 / BUFFER_DISP / lavoro / 5) * 5;
      rimedi.push({ tipo: 'piu_minuti', minutiExtra: extra, testo: 'Aggiungi circa ' + extra + ' minuti al giorno alle finestre di studio.' });
      const media = Math.max(0.25, disp / lavoro), giorniInPiu = Math.max(1, Math.ceil(mancano / media));
      const nuova = piu(vicina ? piu(ctx.oggi, 1) : v.dataTarget, giorniInPiu);   // mai una data nel passato
      rimedi.push({ tipo: 'sposta_data', nuovaData: nuova, testo: 'Sposta la data obiettivo al ' + nuova + ' (+' + giorniInPiu + ' giorni).' });
      // blocco 6: emergenza = settimana finale di 3 giorni, mai applicata da sola (decisione utente 26/11)
      if (giorniFin(v) > 3 && v.dataTarget > piu(ctx.oggi, 3)) rimedi.push({ tipo: 'finale_breve', giorniFinale: 3, testo: 'Piano d\'emergenza: settimana finale di 3 giorni invece di ' + giorniFin(v) + ' (solo se confermi).' });
    }
    return { stato, rapporto, oreNecessarie: nec, oreDisponibili: disp, bufferPct: stato === 'serrato' ? 0.08 : stato === 'ottimale' ? 0.10 : 0, extraIper: !!(ctx.segnali && ctx.segnali.attiva), giorni, rimedi };
  }

  // ---------- Stadio 2: struttura delle fonti (indice locale, 0 token) ----------
  /** Righe d'indice «1.2 Titolo ..... 34», «Capitolo 3 – Titolo 51», «Titolo 12». */
  function righeIndice(testo: string, elencoLibero = false): { num: string; titolo: string; pagina?: number }[] {
    const out: { num: string; titolo: string; pagina?: number }[] = [];
    for (const r0 of String(testo || '').split(/\r?\n/)) {
      const r = r0.replace(/\s+/g, ' ').trim(); if (r.length < 3 || r.length > 160 || /^(indice|sommario|contents|index)$/i.test(r)) continue;
      const m = /^(?:(?:cap(?:itolo)?|chapter|unit[àa]|modulo|lezione|parte)\.?\s*)?(\d{1,2}(?:\.\d{1,2}){0,2}|[IVXLC]{1,6})[.)]?\s*[-–—:]?\s+(.+?)(?:\s*\.{2,}\s*|\s+)?(\d{1,4})?$/i.exec(r);
      if (m && m[2] && /[a-zà-ü]/i.test(m[2])) { out.push({ num: m[1], titolo: m[2].replace(/[\s.·…_-]+$/, '').trim(), pagina: m[3] ? parseInt(m[3], 10) : undefined }); continue; }
      const p = /^([A-Za-zÀ-ÿ][^\d]{2,}?)(?:\s*\.{2,}\s*|\s+)(\d{1,4})$/.exec(r);
      if (p) out.push({ num: String(out.length + 1), titolo: p[1].replace(/[\s.·…_-]+$/, '').trim(), pagina: parseInt(p[2], 10) });
      else if (elencoLibero && /[\p{L}]/u.test(r)) out.push({ num: String(out.length + 1), titolo: r.replace(/^[-•*]\s+/, '') });
    }
    return out.filter((c, i) => !(out[i + 1] && out[i + 1].num.startsWith(c.num + '.')));   // solo le foglie
  }
  const pulisci = (s: string) => String(s || '').replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  /** «FILE_ID | NOME | PAG_START-PAG_END | TITOLO», al massimo 8000 caratteri. */
  function strutturaDaFonti(fonti: FonteTesto[]): string {
    const righe: string[] = [];
    for (const f of fonti || []) {
      if (!f) continue;
      const voci = righeIndice((f.pagine || []).join('\n'), f.fileId === 'indice'), n = Math.max(1, (f.pagine || []).length);
      if (!voci.length) { righe.push([pulisci(f.fileId), pulisci(f.nome), '1-' + n, pulisci(f.nome)].join(' | ')); continue; }
      voci.forEach((c, i) => {
        const a = c.pagina || 1, succ = voci.slice(i + 1).find(x => x.pagina != null), b = succ && succ.pagina! > a ? succ.pagina! - 1 : a + 9;
        const pagine = f.fileId === 'indice' && c.pagina == null ? '—' : a + '-' + b;
        righe.push([pulisci(f.fileId), pulisci(f.nome), pagine, pulisci(c.titolo).slice(0, 80)].join(' | '));
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
      out.push({ uid, titolo: p[3].slice(0, 60), prereq: out.length ? [out[out.length - 1].uid] : [], densita: 3,
        minutiBase: clamp((b - a + 1) * 8, 30, 240), fileId: p[0], nomeFile: p[1], pagine: m ? [a, b] : undefined, concettiChiave: [] });
    }
    return out;
  }

  // ---------- Stadio 3: mapping del curriculum (1 chiamata AI JSON, fallback TOC) ----------
  /** v0.57 (A15): parsing delegato all'unico parser (01-json.ts). */
  const recuperaArrayParziale = (raw: string) => JsonAI.recuperaArrayParziale(raw, 'unita');
  function leggiRisposta(r: any): any[] {
    const j = JsonAI.leggi(r);
    if (j) { const l = Array.isArray(j) ? j : Array.isArray(j.unita) ? j.unita : null; if (l) return l; }
    return typeof r === 'string' ? recuperaArrayParziale(r) : [];
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
  /** v0.55.1 — anti-ciclo: toglie i prerequisiti che puntano a unità successive nell'ordine di Kahn (archi all'indietro
   *  di un ciclo U1↔U2) e quelli inesistenti. Senza, le unità in ciclo non avrebbero mai L1 «pronta». Copia, non muta. */
  function sanitizzaPrereq(unita: UnitaAI[]): UnitaAI[] {
    const pos = new Map(ordineTopologico(unita).map((u, i) => [u.uid, i]));
    return unita.map(u => ({ ...u, prereq: (u.prereq || []).filter((p, i, a) => p !== u.uid && pos.has(p) && pos.get(p)! < pos.get(u.uid)! && a.indexOf(p) === i) }));
  }
  const s0 =(arch: string, densita: number, errori: boolean) => arr1((BASE_S0[arch] || 2.5) * (1.25 - 0.12 * densita) * (errori ? 0.65 : 1));
  /** Ancoraggi di ripasso. Con «iv» (curva FSRS di Ripassi) gli intervalli si allungano/accorciano secondo la
   *  ritenzione r rispetto al riferimento 0,90; senza, restano quelli di base (modulo puro nei test). */
  function intervalliFsrs(S0: number, r = 0.9, iv?: (s: number, r: number) => number): number[] {
    const k = iv && r !== 0.9 ? clamp(iv(100, r) / Math.max(1, iv(100, 0.9)), 0.4, 2) : 1;
    const f = clamp(S0 / 2.5, 0.6, 1.4) * k, out: number[] = [];
    for (const g of INTERVALLI) out.push(Math.max(out.length ? out[out.length - 1] + 1 : 1, Math.round(g * f)));
    return out;
  }
  interface Compito { u: UnitaAI; liv: 1 | 2 | 3 | 4; parte: number; parti: number; min: number; ordine: number; }
  const pezzi = (min: number) => { const n = Math.max(1, Math.round(min / 45)); const m = Math.max(30, Math.min(50, Math.round(min / n))); return { n, m }; };

  function compilaTimelineNeuro(unita0: UnitaAI[], v: VincoliPianoAI, f: FattibilitaAI, seg: SegnaliIper | null, o: { oggi: string; pid: string; titolo?: string; ritenzione?: number; intervallo?: (s: number, r: number) => number }): PkPianoAI {
    const unita = sanitizzaPrereq(unita0 || []);
    const ob = clamp(v.livelloObiettivo || 4, 1, 4), molt = (MOLT[v.livelloPartenza] || 1) * (seg && seg.attiva ? 1.2 : 1);
    const cod = String(v.materiaCodice || 'X').toUpperCase().replace(/[^A-Z]/g, '') || 'X', pidC = o.pid.replace(/^ai-/, '');
    const ordine = ordineTopologico(unita), errori = !!(seg && seg.attiva);
    // v0.56 (BP5): con un livello di intensità → hard cap analitico (L1+L3), pause Wakeful Rest BRAC, dip 13–15 senza teoria/calcolo
    const bio = v.livelloIntensita ? applicaGuardRailBiologici(v.livelloIntensita, v.profiloBio) : null;
    const capAnal = bio ? MATRICE_LIVELLI[bio.livello - 1].capSforzoAnaliticoMin : Infinity, pausaBio = bio ? bio.pausaMin : 0;
    const anal = new Map<string, number>(), eAnal = (l: number) => l === 1 || l === 3;
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
    function posto(g: GiornoCapacita, min: number, dip = false): number | null {
      const c = cursore.get(g.data) || 0;
      for (const [a, b] of g.finestre) {
        let ini = Math.max(a, c);
        if (bio && !dip && ini < DIP[1] && ini + min > DIP[0]) ini = Math.max(ini, DIP[1]);   // BP5: niente studio vero nel dip
        if (b - ini >= min && ini + min <= LIMITE_SERA) return ini;
      }
      return null;
    }
    function metti(g: GiornoCapacita, vo: VocePianoAI, min: number, dip = false): boolean {
      const ini = posto(g, min, dip); if (ini == null) return false;
      vo.ora = hhmm(ini); vo.min = min; cursore.set(g.data, ini + min + pausaBio); usato.set(g.data, (usato.get(g.data) || 0) + min); voci.get(g.data)!.push(vo);
      if (vo.livelloCognitivo && !vo.isRipassoFSRS && eAnal(vo.livelloCognitivo)) anal.set(g.data, (anal.get(g.data) || 0) + min);
      return true;
    }
    const fin = finestraFinale(v.dataTarget, giorniFin(v));
    const pronto = (c: Compito, d: string) => {
      if (c.liv <= 2 && d > fin.fineNuovi) return false;   // blocco 6: nella settimana finale niente argomenti nuovi
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
      let profondo = false, capRaggiunto = false, nDip = 0;
      for (let giri = 0; giri < 200; giri++) {
        const resto = tetto - (usato.get(g.data) || 0); if (resto < 30) break;
        if (bio) {   // BP5 §1.3: se il cursore cade nel dip post-prandiale, solo flashcard a bassa frizione e cue Cornell
          const ini = posto(g, 15, true);
          if (ini != null && ini >= DIP[0] && ini < DIP[1]) {
            const m = Math.min(DIP[1] - ini, resto, bio.bloccoMin);
            if (m >= 15 && metti(g, { k: cod + '~' + pidC + '~DIP~' + g.data.replace(/-/g, '') + (nDip ? '-' + nDip : ''), t: '🃏 Dip post-prandiale: flashcard a bassa frizione + cue Cornell', speciale: true, isOffloading: true }, m, true)) { nDip++; continue; }
          }
        }
        const pronti = coda.filter(c => c.min <= resto && pronto(c, g.data) && (!bio || !eAnal(c.liv) || (anal.get(g.data) || 0) + c.min <= capAnal));
        if (bio && coda.some(c => eAnal(c.liv) && pronto(c, g.data) && (anal.get(g.data) || 0) + c.min > capAnal)) capRaggiunto = true;
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
          intervalliFsrs(s0(v.archetipo, pref.u.densita, errori || !!pref.u.priorita), o.ritenzione, o.intervallo).forEach((gg, i) => {
            const d0r = piu(g.data, gg), d = (giorni.find(x => x.data >= d0r) || { data: '' }).data; if (!d || d > ultimo) return;
            ripassi.push({ data: d, voce: { k: cod + '~' + pidC + '~' + pref.u.uid + '~R' + (i + 1), t: '🔁 Ripasso ' + (i + 1) + ' · ' + pref.u.titolo, uid: pref.u.uid, livelloCognitivo: 1, isRipassoFSRS: true, min, sorgenteRef: ref(pref.u) } });
          });
        }
      }
      // 2a) blocco 6: settimana finale — simulazione a D−6 e D−3 (revisione degli errori il giorno dopo), altrimenti ripasso cumulativo
      const restoFin = Math.floor(g.minuti * (1 - f.bufferPct)) - (usato.get(g.data) || 0);
      if (g.data >= fin.inizio && restoFin >= 30) {
        const dm = diff(g.data, v.dataTarget), sim = dm === 6 || dm === 3, dopoSim = dm === 5 || dm === 2;
        metti(g, { k: cod + '~' + pidC + '~FIN~' + g.data.replace(/-/g, ''), speciale: true,
          t: sim ? '📝 Simulazione d\'esame (D−' + dm + ')' : dopoSim ? '🔍 Revisione degli errori della simulazione' : '📚 Settimana finale: quiz cumulativo + ripassi',
          d: sim ? 'Tempo reale, senza fonti. Domani si rivedono gli errori.' : 'Ripassi in scadenza, concetti da consolidare, un quiz cumulativo per step a rotazione; niente argomenti nuovi.' }, Math.min(restoFin, sim ? 120 : 90));
      }
      // 2b) BP5 §1.1: oltre l'hard cap analitico → Offloading Attivo Multi-Modale
      const restoOff = Math.floor(g.minuti * (1 - f.bufferPct)) - (usato.get(g.data) || 0);
      if (bio && capRaggiunto && restoOff >= 30) metti(g, { k: cod + '~' + pidC + '~OFF~' + g.data.replace(/-/g, ''), t: '🃏 Offloading attivo: ' + modalitaOffloading(MATRICE_LIVELLI[bio.livello - 1], v.profiloBio).join(' · '), speciale: true, isOffloading: true }, Math.min(restoOff, 90));
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
    const esclusi = coda.map(c => c.u.titolo + ' · ' + NOMI_LIV[c.liv])
      .concat(ripassi.filter(r => r.data && r.data < v.dataTarget).map(r => r.voce.t));
    const avanzi = esclusi.length;
    const gg: GiornoPianoAI[] = giorni.filter(g => voci.get(g.data)!.length).map((g, i) => ({ data: g.data, n: i + 1, voci: voci.get(g.data)! }));
    return {
      formato: 'pacchetto-studio', tipo: 'piano', id: o.pid, titolo: o.titolo || '✨ Piano intelligente ' + v.materiaCodice, aggiornato: new Date().toISOString(),
      giorniTeoria: gg.length, giorni: gg, origine: 'ai_neuro', proprio: true, vincoliAI: v,
      statoFattibilita: avanzi && f.stato === 'ottimale' ? 'serrato' : f.stato,
      capienza: Math.max(3, ...gg.map(x => x.voci.length)) + 1, unita, fonteMappa: 'toc', iper: errori || undefined,
      livelloIntensita: bio ? bio.livello : undefined, avvisiBio: bio && bio.avvisi.length ? bio.avvisi : undefined,
      nota: avanzi ? 'Piano parziale. Attività fuori calendario (' + avanzi + '): ' + [...new Set(esclusi)].join(', ') + '.' : undefined,
    };
  }

  // ================= v0.56 (BP5): 5 livelli, guard-rail biologici, allocazione BRAC/circadiana, questionario 6+3, breaker =================
  const HARD_CAP_ANALITICO = 270;                 // Ericsson: mai più di 4,5 h al giorno di codifica/calcolo profondo
  const DIP: [number, number] = [13 * 60, 15 * 60];
  const SERA = LIMITE_SERA - 60;                  // dalle 20:30 solo consolidamento leggero
  const MAX_TOKEN_CALIBRAZIONE = 450, BUDGET_CALIBRAZIONE = 600;
  const L = (livello: IntensitaPiano, nome: string, oreRealiMin: number, oreRealiMax: number, capSforzoAnaliticoMin: number, ritenzioneTargetFSRS: number, itemPerMicroQuiz: number,
    maxCardAutogenerateGiorno: number, abilitaCornellAuto: boolean, abilitaTrabocchetti: boolean, abilitaMiniCasiCatena: boolean, gradoInterleaving: ConfigLivelloIntensita['gradoInterleaving'],
    pauseWakefulRestMin: number, moltiplicatoreResaEquivalente: number): ConfigLivelloIntensita =>
    ({ livello, nome, oreRealiMin, oreRealiMax, capSforzoAnaliticoMin: Math.min(HARD_CAP_ANALITICO, capSforzoAnaliticoMin), ritenzioneTargetFSRS, itemPerMicroQuiz, maxCardAutogenerateGiorno,
      abilitaCornellAuto, abilitaTrabocchetti, abilitaMiniCasiCatena, gradoInterleaving, pauseWakefulRestMin, moltiplicatoreResaEquivalente });
  const MATRICE_LIVELLI: ConfigLivelloIntensita[] = [
    L(1, 'Mantenimento Leggero', 1.5, 2.5, 90, 0.85, 5, 0, false, false, false, 'nessuno', 1, 1.05),
    L(2, 'Standard Strutturato', 3.0, 4.5, 150, 0.88, 6, 8, true, false, false, 'nessuno', 2, 1.25),
    L(3, 'Intensivo (pre-esame)', 5.0, 7.0, 230, 0.92, 8, 20, true, true, true, 'multi_materia', 3, 1.6),
  ];
  /** v0.60 «Taglio»: 3 livelli invece di 5. I piani salvati con 4 o 5 vengono portati a 3 (il più vicino) alla lettura. */
  const livelloValido = (x: any): IntensitaPiano => clamp(Math.round(+x) || 2, 1, 3) as IntensitaPiano;
  const configLivello = (l: number) => MATRICE_LIVELLI[livelloValido(l) - 1];
  /** Seleziona una sessione breve dalla banca pronta. Non cambia la copertura totale e conserva il microstep. */
  function sessioniQuiz<T extends { id: string }>(banche: BancaMicroQuiz<T>[], livello: number): SessioneMicroQuiz<T>[] {
    const richieste = configLivello(livello).itemPerMicroQuiz;
    return (banche || []).map(b => {
      const viste = new Set<string>(), pronte = (b.domande || []).filter(d => {
        const id = String(d && d.id || '').trim(); if (!id || viste.has(id)) return false; viste.add(id); return true;
      });
      return { microstep: String(b.microstep || '').trim(), richieste, disponibili: pronte.length, domande: pronte.slice(0, richieste) };
    }).filter(x => !!x.microstep);
  }
  const PROFILO_BASE: ProfiloBiopsicologico = { fasciaEta: '20-26', cronotipo: 'intermedio', autonomiaBRACMin: 55, oreSonnoMedie: '7-8', reazioneErrore: 'sfida_attiva', canalePreferito: 'quiz_immediati' };

  /** Blocco A del questionario: 6 domande universali, 0 token, linguaggio semplice. */
  const DOMANDE_UNIVERSALI: DomandaUniversale[] = [
    { campo: 'fasciaEta', testo: 'Quanti anni hai?', opzioni: [['<16', 'Meno di 16'], ['16-19', '16–19'], ['20-26', '20–26'], ['27-40', '27–40'], ['40+', 'Più di 40']] },
    { campo: 'cronotipo', testo: 'Quando ti senti più lucido mentalmente?', opzioni: [['allodola_mattina', 'Presto la mattina'], ['intermedio', 'In tarda mattinata'], ['pomeridiano', 'Nel pomeriggio'], ['gufo_sera', 'La sera']] },
    { campo: 'autonomiaBRACMin', testo: 'Dopo quanti minuti continui senti bisogno di staccare?', opzioni: [['35', 'Circa 35'], ['55', 'Circa 55'], ['80', 'Circa 80'], ['100', 'Oltre 90']] },
    { campo: 'oreSonnoMedie', testo: 'Quante ore dormi in media a notte?', opzioni: [['<6', 'Meno di 6'], ['6-7', '6–7'], ['7-8', '7–8'], ['>8', 'Più di 8']] },
    { campo: 'reazioneErrore', testo: 'Quando sbagli un quiz ti carichi per capire subito o ti innervosisci?', opzioni: [['sfida_attiva', 'Mi carico: voglio capire subito'], ['necessita_scaffolding', 'Mi innervosisco: preferisco una guida']] },
    { campo: 'canalePreferito', testo: 'Ricordi meglio scrivendo schemi brevi, facendo subito quiz o ripetendo a voce?', opzioni: [['scrittura_schemi', 'Schemi brevi'], ['quiz_immediati', 'Quiz subito'], ['esposizione_orale', 'Ripetere a voce']] },
  ];
  /** Ripara un profilo parziale o vecchio (valori sconosciuti → base). */
  function normalizzaProfilo(p: any): ProfiloBiopsicologico {
    const out: any = { ...PROFILO_BASE };
    for (const d of DOMANDE_UNIVERSALI) {
      const x = p && p[d.campo] != null ? String(p[d.campo]) : '';
      if (d.opzioni.some(o => o[0] === x)) out[d.campo] = d.campo === 'autonomiaBRACMin' ? +x : x;
    }
    return out;
  }

  /** §4.1 Cap biologici preventivi (0 token): età < 16 o sonno < 6 h → massimo L2 (v0.60); BRAC 35 → micro-blocchi 35 + 10. */
  function applicaGuardRailBiologici(richiesto: number, profilo?: Partial<ProfiloBiopsicologico> | null): GuardRailBio {
    const p = normalizzaProfilo(profilo || {}), req = livelloValido(richiesto), avvisi: string[] = [];
    let livello = req;
    if (p.fasciaEta === '<16' && req > 2) { livello = 2; avvisi.push('Protezione neurosviluppo: massimo 4.5h al giorno (livello 2).'); }
    if (p.oreSonnoMedie === '<6' && req > 2) { livello = 2; avvisi.push('Con meno di 6h di sonno il consolidamento ippocampale cala: intensità calibrata (livello 2) per evitare perdita di ritenzione.'); }
    const bloccoMin = p.autonomiaBRACMin, pausaMin = bloccoMin === 35 ? 10 : bloccoMin === 100 ? 15 : 12;
    if (bloccoMin === 35) avvisi.push('Micro-blocchi da 35 minuti + 10 minuti di pausa (Wakeful Rest, zero schermi).');
    return { livello, richiesto: req, avvisi, bloccoMin, pausaMin };
  }

  /** §1.3 Due picchi circadiani per cronotipo (minuti dalla mezzanotte) e inizio della giornata. */
  const PICCHI: Record<ProfiloBiopsicologico['cronotipo'], [number, number][]> = {
    allodola_mattina: [[8 * 60, 11 * 60 + 30], [15 * 60 + 30, 18 * 60]],
    intermedio: [[9 * 60 + 30, 12 * 60 + 30], [16 * 60, 19 * 60]],
    pomeridiano: [[10 * 60 + 30, 12 * 60 + 45], [15 * 60 + 30, 19 * 60 + 30]],
    gufo_sera: [[11 * 60, 12 * 60 + 45], [17 * 60, SERA]],
  };
  const INIZIO_GIORNATA: Record<ProfiloBiopsicologico['cronotipo'], number> = { allodola_mattina: 8 * 60, intermedio: 8 * 60 + 30, pomeridiano: 9 * 60, gufo_sera: 9 * 60 + 30 };
  const picchiCircadiani = (c?: string) => PICCHI[(c as ProfiloBiopsicologico['cronotipo'])] || PICCHI.intermedio;

  /** Modalità di offloading attivo multi-modale, con il canale preferito in testa. */
  function modalitaOffloading(cfg: ConfigLivelloIntensita, profilo?: Partial<ProfiloBiopsicologico> | null): string[] {
    const p = normalizzaProfilo(profilo || {});
    const m = ['flashcard visive', 'micro-quiz lampo (' + cfg.itemPerMicroQuiz + ' item, Lag-Buffered Loop)', 'richiamo orale'];
    if (cfg.abilitaCornellAuto) m.splice(1, 0, 'card da note Cornell (max ' + cfg.maxCardAutogenerateGiorno + '/giorno)');
    const pref = p.canalePreferito === 'scrittura_schemi' ? /Cornell|flashcard/ : p.canalePreferito === 'quiz_immediati' ? /micro-quiz/ : /orale/;
    const i = m.findIndex(x => pref.test(x)); if (i > 0) m.unshift(m.splice(i, 1)[0]);
    return m;
  }

  /** §1.1–1.3 Allocazione di una giornata (0 token): blocchi BRAC + Wakeful Rest; L1/L3 solo nei picchi e fino all'hard cap
   *  analitico; nel dip 13–15 solo flashcard/cue Cornell; dalle 20:30 solo consolidamento; mai oltre le 21:30. */
  function allocaGiornata(livello: number, profilo?: Partial<ProfiloBiopsicologico> | null, o: { minuti?: number; inizio?: string; giorno?: number } = {}):
    { slot: SlotGiornata[]; livello: IntensitaPiano; analiticoMin: number; studioMin: number; avvisi: string[] } {
    const p = normalizzaProfilo(profilo || {}), g = applicaGuardRailBiologici(livello, p), cfg = configLivello(g.livello);
    const totale = Math.round(clamp(o.minuti != null ? +o.minuti : cfg.oreRealiMax * 60, 0, cfg.oreRealiMax * 60));
    const cap = Math.min(HARD_CAP_ANALITICO, cfg.capSforzoAnaliticoMin), pic = picchiCircadiani(p.cronotipo), offl = modalitaOffloading(cfg, p);
    const faded = p.reazioneErrore === 'necessita_scaffolding' && (o.giorno || 0) < 2;
    const slot: SlotGiornata[] = []; let t = o.inizio ? minDi(o.inizio) : INIZIO_GIORNATA[p.cronotipo], studio = 0, anal = 0, nA = 0, nO = 0, nD = 0;
    for (let giri = 0; giri < 100 && studio < totale && t + 15 <= LIMITE_SERA; giri++) {
      let len = Math.min(g.bloccoMin, totale - studio, LIMITE_SERA - t), tipo: TipoSlot, modalita: string | undefined, analitico = false;
      if (t >= DIP[0] && t < DIP[1]) { len = Math.min(len, DIP[1] - t); tipo = 'flashcard_dip'; modalita = nD++ % 2 ? 'cue Cornell' : 'flashcard a bassa frizione'; }
      else if (t >= SERA) { tipo = 'consolidamento'; modalita = 'consolidamento leggero e chiusura errori del giorno'; }
      else {
        if (t < DIP[0]) len = Math.min(len, DIP[0] - t); else len = Math.min(len, SERA - t);
        const pk = pic.find(([a, b]) => t >= a && t < b);
        if (pk && cap - anal >= 20) {
          len = Math.min(len, pk[1] - t, cap - anal); analitico = true;
          tipo = nA++ % 2 === 0 ? 'L1_codifica' : faded ? 'L3_faded' : 'L3_problemi';
          modalita = tipo === 'L1_codifica' ? 'codifica di teoria nuova' : tipo === 'L3_faded' ? 'Faded Worked Examples guidati' : 'problemi' + (cfg.abilitaTrabocchetti ? ' + trabocchetti' : '') + (cfg.abilitaMiniCasiCatena ? ' + mini-casi a catena' : '');
        } else { tipo = 'offloading'; modalita = offl[nO++ % offl.length]; }
      }
      if (len < 15) { t = t < DIP[0] && t + len >= DIP[0] ? DIP[0] : t + Math.max(len, 5); continue; }
      slot.push({ ora: hhmm(t), min: len, tipo, analitico, modalita });
      studio += len; if (analitico) anal += len; t += len;
      if (studio < totale && t + g.pausaMin + 15 <= LIMITE_SERA) { slot.push({ ora: hhmm(t), min: g.pausaMin, tipo: 'wakeful_rest', analitico: false, modalita: 'Wakeful Rest: zero schermi' }); t += g.pausaMin; }
    }
    return { slot, livello: g.livello, analiticoMin: anal, studioMin: studio, avvisi: g.avvisi };
  }

  /** Pesi iniziali dal Blocco A (domande 5 e 6) + sonno/età per l'interleaving. */
  function pesiIniziali(profilo?: Partial<ProfiloBiopsicologico> | null): PesiAdattiviAlgoritmo {
    const p = normalizzaProfilo(profilo || {}), w: PesiAdattiviAlgoritmo = { w_faded: 1, w_cornell: 1, w_gemelle: 1, w_interleave: 1 };
    if (p.canalePreferito === 'scrittura_schemi') { w.w_cornell = 1.3; w.w_gemelle = 0.9; }
    else if (p.canalePreferito === 'quiz_immediati') { w.w_gemelle = 1.3; w.w_cornell = 0.9; }
    else { w.w_cornell = 1.1; w.w_faded = 1.1; }
    if (p.reazioneErrore === 'necessita_scaffolding') { w.w_faded += 0.2; w.w_gemelle -= 0.1; } else w.w_gemelle += 0.1;
    if (p.oreSonnoMedie === '<6') w.w_interleave -= 0.2;
    if (p.fasciaEta === '<16') w.w_interleave -= 0.1;
    return limitaPesi(w);
  }
  const CHIAVI_PESI: (keyof PesiAdattiviAlgoritmo)[] = ['w_faded', 'w_cornell', 'w_gemelle', 'w_interleave'];
  const limitaPesi = (w: PesiAdattiviAlgoritmo): PesiAdattiviAlgoritmo => { const o: any = {}; for (const k of CHIAVI_PESI) o[k] = arr1(clamp(+w[k] || 1, 0.5, 1.5)); return o; };
  /** Applica le risposte del Blocco B (indice dell'opzione per domanda). Delta già limitati a −0,25..+0,35. */
  function applicaRisposte(base: PesiAdattiviAlgoritmo, domande: DomandaCalibrazione[], scelte: (number | null | undefined)[]): PesiAdattiviAlgoritmo {
    const w: any = { ...base };
    (domande || []).forEach((d, i) => { const op = d && d.opzioni && scelte && scelte[i] != null ? d.opzioni[scelte[i] as number] : null; if (op) for (const k of CHIAVI_PESI) if (op.delta[k] != null) w[k] = (+w[k] || 1) + clamp(+op.delta[k]!, -0.25, 0.35); });
    return limitaPesi(w);
  }

  /** Top parole chiave in stile BM25 (righe = documenti) dai titoli/indice delle fonti. */
  function paroleChiaveBM25(testo: string, n = 8): string[] {
    const STOP = new Set('della delle degli dello nella nelle negli sulla sulle alla alle agli dalla dalle con per tra fra una uno del dei gli che non come capitolo parte indice esercizi introduzione and the of'.split(' '));
    const docs = String(testo || '').toLowerCase().split(/\r?\n/).map(r => (r.match(/[a-zà-ü]{4,}/g) || []).filter(x => !STOP.has(x))).filter(d => d.length);
    if (!docs.length) return [];
    const N = docs.length, avg = docs.reduce((s, d) => s + d.length, 0) / N, df = new Map<string, number>(), sc = new Map<string, number>();
    for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) || 0) + 1);
    for (const d of docs) {
      const tf = new Map<string, number>(); for (const w of d) tf.set(w, (tf.get(w) || 0) + 1);
      for (const [w, f] of tf) { const idf = Math.log(1 + (N - df.get(w)! + 0.5) / (df.get(w)! + 0.5)); sc.set(w, (sc.get(w) || 0) + idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * d.length / avg))); }
    }
    return Array.from(sc.entries()).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n).map(x => x[0]);
  }

  /** Fallback 0 token del Blocco B: set pre-calibrato per archetipo (6 archetipi di Dominio). */
  function domandeCalibrazioneDefault(archetipo?: string): DomandaCalibrazione[] {
    const T: Record<string, [string, string, string]> = {
      stem_calcolo: ['Davanti a un esercizio di calcolo nuovo cosa ti aiuta di più?', 'Le formule le ricordi meglio…', 'Quando due formule si somigliano…'],
      scienze_sperimentali: ['Davanti a un problema di chimica/fisica/biologia nuovo cosa ti aiuta di più?', 'I processi (cicli, reazioni) li ricordi meglio…', 'Quando due concetti si somigliano (es. mitosi/meiosi)…'],
      umanistico_storico: ['Davanti a un argomento storico o filosofico nuovo cosa ti aiuta di più?', 'Date ed eventi li ricordi meglio…', 'Quando due autori o periodi si somigliano…'],
      giuridico_economico: ['Davanti a un caso pratico nuovo cosa ti aiuta di più?', 'Norme e definizioni le ricordi meglio…', 'Quando due istituti si somigliano…'],
      lingue_letteratura: ['Davanti a una regola grammaticale nuova cosa ti aiuta di più?', 'Il lessico lo ricordi meglio…', 'Quando due costruzioni si somigliano…'],
      informatica_coding: ['Davanti a un algoritmo o a un pezzo di codice nuovo cosa ti aiuta di più?', 'Sintassi e API le ricordi meglio…', 'Quando due strutture dati si somigliano…'],
    };
    const q = T[String(archetipo)] || T.scienze_sperimentali;
    return [
      { testo: q[0], opzioni: [{ testo: 'Vedere prima un esempio svolto passo passo', delta: { w_faded: 0.35 } }, { testo: 'Provare subito da solo e poi correggermi', delta: { w_faded: -0.25, w_gemelle: 0.15 } }, { testo: 'Un mix: esempio breve e poi prova', delta: { w_faded: 0.1 } }] },
      { testo: q[1], opzioni: [{ testo: 'Scrivendo uno schema con le domande a margine', delta: { w_cornell: 0.35 } }, { testo: 'Rispondendo a domande lampo', delta: { w_cornell: -0.15, w_gemelle: 0.1 } }, { testo: 'Ripetendole a voce', delta: { w_cornell: 0.1, w_faded: 0.05 } }] },
      { testo: q[2], opzioni: [{ testo: 'Le confondo spesso: mettimele a confronto', delta: { w_gemelle: 0.35, w_interleave: 0.1 } }, { testo: 'Preferisco studiarle separate e ben distinte', delta: { w_interleave: -0.25 } }, { testo: 'Mi va bene alternarle durante lo studio', delta: { w_interleave: 0.3 } }] },
    ];
  }
  /** Prompt del Blocco B: materia, archetipo, top 8 parole chiave, top 3 errori storici. Ingresso ≤ ~150 token. */
  function promptCalibrazione(c: { materia: string; archetipo: string; keyword: string[]; errori: string[] }): { role: string; content: string }[] {
    return [
      { role: 'system', content: 'Genera ESATTAMENTE 3 domande a scelta multipla (3 opzioni ciascuna) per capire come studia uno studente. Linguaggio semplice, in italiano. '
        + 'Ogni opzione modifica i pesi w_faded, w_cornell, w_gemelle, w_interleave con delta tra -0.25 e 0.35. Solo JSON: '
        + '{"domande":[{"testo":"...","opzioni":[{"testo":"...","delta":{"w_faded":0.2}}]}]}' },
      { role: 'user', content: 'Materia ' + String(c.materia).slice(0, 30) + ', archetipo ' + c.archetipo + '. Parole chiave: ' + (c.keyword || []).slice(0, 8).join(', ') + '. Errori ricorrenti: ' + ((c.errori || []).slice(0, 3).join(', ') || 'nessuno') + '.' },
    ];
  }
  /** Parsing tollerante: esattamente 3 domande × 3 opzioni, delta limitati; altrimenti null (→ fallback). */
  function leggiDomandeCalibrazione(r: any): DomandaCalibrazione[] | null {
    let j: any = r;
    if (typeof r === 'string') { j = JsonAI.leggi(r); if (!j) return null; }   // v0.57 (A15)
    const arr = Array.isArray(j) ? j : j && Array.isArray(j.domande) ? j.domande : null;
    if (!arr || arr.length < 3) return null;
    const out: DomandaCalibrazione[] = [];
    for (const d of arr.slice(0, 3)) {
      if (!d || !String(d.testo || '').trim() || !Array.isArray(d.opzioni) || d.opzioni.length < 3) return null;
      const opz: OpzioneCalibrazione[] = [];
      for (const o of d.opzioni.slice(0, 3)) {
        if (!o || !String(o.testo || '').trim()) return null;
        const delta: Partial<PesiAdattiviAlgoritmo> = {};
        for (const k of CHIAVI_PESI) if (o.delta && isFinite(+o.delta[k]) && o.delta[k] !== null && o.delta[k] !== '') delta[k] = arr1(clamp(+o.delta[k], -0.25, 0.35));
        opz.push({ testo: pulisci(o.testo).slice(0, 120), delta });
      }
      out.push({ testo: pulisci(d.testo).slice(0, 160), opzioni: opz });
    }
    return out;
  }
  const stimaTokenCalibrazione = (msgs: { content: string }[]) => Math.round(msgs.reduce((s, m) => s + m.content.length, 0) / 3.5) + MAX_TOKEN_CALIBRAZIONE;
  /** Blocco B: 1 micro-call (max_tokens 450, totale ≤ 600) sulla catena iniettata; JSON rotto, 429 su tutta la catena,
   *  offline o modalità senza AI → set pre-calibrato per archetipo a 0 token, all'istante. */
  async function generaDomandeCalibrazione(c: { materia: string; archetipo: string; keyword?: string[]; errori?: string[] }, ia?: DipPianificatore['ia']):
    Promise<{ domande: DomandaCalibrazione[]; fonte: 'ai' | 'default'; chiamate: number; tokenStimati: number; errore?: string }> {
    const def = () => domandeCalibrazioneDefault(c.archetipo);
    if (!ia) return { domande: def(), fonte: 'default', chiamate: 0, tokenStimati: 0 };
    const msgs = promptCalibrazione({ materia: c.materia, archetipo: c.archetipo, keyword: c.keyword || [], errori: c.errori || [] });
    const tok = Math.min(BUDGET_CALIBRAZIONE, stimaTokenCalibrazione(msgs));
    try {
      const d = leggiDomandeCalibrazione(await ia(msgs, { maxOut: MAX_TOKEN_CALIBRAZIONE }));
      return d ? { domande: d, fonte: 'ai', chiamate: 1, tokenStimati: tok } : { domande: def(), fonte: 'default', chiamate: 1, tokenStimati: 0, errore: 'JSON non valido' };
    } catch (e: any) { return { domande: def(), fonte: 'default', chiamate: 1, tokenStimati: 0, errore: String(e && e.message || e).slice(0, 120) }; }
  }

  /** §4.2 Burnout Circuit Breaker (0 token). A: tasso d'errore degli ultimi 2 giorni ≥ media storica + 0,25.
   *  B: ipercorrezioni (certo → sbagliata) delle ultime 48 h ≥ 2× le 48 h precedenti (minimo 2). Fonti: confidenceLog e
   *  statq.neuro (illusione_competenza) di BP3, più i contatori storici n/ok. */
  function monitoraAffaticamento(stats: any[], o: { oggi: string; materia?: string; mediaStorica?: number }): EsitoFatica {
    const ieri = piu(o.oggi, -1), l2 = piu(o.oggi, -2), l3 = piu(o.oggi, -3);
    let r2 = 0, e2 = 0, rv = 0, ev = 0, n = 0, ok = 0, iper48 = 0, iperPrima = 0;
    for (const s of stats || []) {
      if (!s || s.deleted || typeof s !== 'object') continue;
      const sk = String(s.sk || ''); if (o.materia && sk && materiaSk(s) !== o.materia) continue;
      const nn = Math.max(0, +s.n || 0); n += nn; ok += clamp(+s.ok || 0, 0, nn);
      const log: any[] = Array.isArray(s.confidenceLog) ? s.confidenceLog : [];
      let illLog48 = 0;
      for (const x of log) {
        if (!x || !x.ts) continue; const d = String(x.ts).slice(0, 10), sbagliata = x.corretto === false, iper = sbagliata && x.livelloCertezza === 3;
        if (d >= ieri && d <= o.oggi) { r2++; if (sbagliata) e2++; if (iper) { iper48++; illLog48++; } }
        else if (d < ieri) { rv++; if (sbagliata) ev++; if (iper && d >= l3 && d <= l2) iperPrima++; }
      }
      // statq.neuro: illusione registrata nelle ultime 48 h ma non ancora nel log (es. log troncato agli ultimi 10)
      const ne = s.neuro || {}, ult = String(s.ultima || '');
      if (!illLog48 && ult >= ieri && ult <= o.oggi && (ne.ultimoCaso === 'illusione_competenza' || (Array.isArray(ne.tag) && ne.tag.includes('illusione_competenza')))) iper48++;
      if (!log.length && ult >= ieri && ult <= o.oggi) { r2++; if (s.esito === false) e2++; }
    }
    const nVecchi = n - r2, okVecchi = ok - (r2 - e2);
    const media = o.mediaStorica != null ? +o.mediaStorica : rv >= 5 ? ev / rv : nVecchi >= 5 ? clamp(1 - okVecchi / nVecchi, 0, 1) : n ? 1 - ok / n : 0;
    const tasso = r2 ? e2 / r2 : 0;
    const condA = r2 >= 4 && tasso >= media + 0.25 - 1e-9;
    const condB = iper48 >= 2 && iper48 >= 2 * Math.max(1, iperPrima);
    return { trigger: condA || condB, condA, condB, tasso2g: arr1(tasso), mediaStorica: arr1(media), risposte2g: r2, iper48, iperPrima };
  }
  /** Attiva il de-load di 48 h su un piano ai_neuro (copia): −2 livelli (min L1); i nuovi capitoli (L1–L4) delle 48 h slittano
   *  di 2 giorni (chiavi invariate, mai oltre l'ultimo giorno di lavoro) e al loro posto restano ripasso FSRS leggero + Wakeful Rest. */
  function attivaDeload(piano: any, o: { oggi: string; motivo?: string }): PkPianoAI | null {
    if (!piano || piano.origine !== 'ai_neuro') return null;
    if (piano.deload && piano.deload.attivo && piano.deload.fino > o.oggi) return null;
    const p: PkPianoAI = clona(piano), target = livelloValido(p.livelloIntensita || (p.vincoliAI && p.vincoliAI.livelloIntensita) || 2), fino = piu(o.oggi, 2);
    const ridotto = Math.max(1, target - 1) as IntensitaPiano;
    const cod = String(p.vincoliAI && p.vincoliAI.materiaCodice || 'X').toUpperCase().replace(/[^A-Z]/g, '') || 'X', pidC = String(p.id).replace(/^ai-/, '');
    const lavoro = p.giorni.filter(g => g.voci.some(v => v.livelloCognitivo && !v.isRipassoFSRS)).map(g => g.data).sort();
    const ultimo = lavoro.length ? lavoro[lavoro.length - 1] : fino;
    const sposta: { v: VocePianoAI; a: string }[] = [];
    for (const g of p.giorni) {
      if (g.data < o.oggi || g.data >= fino) continue;
      const tenere: VocePianoAI[] = [];
      for (const v of g.voci) {
        if (v.livelloCognitivo && !v.isRipassoFSRS && !v.isBuffer) { const a = piu(g.data, 2); sposta.push({ v, a: a > ultimo ? ultimo : a }); } else tenere.push(v);
      }
      if (tenere.length !== g.voci.length) tenere.push({ k: cod + '~' + pidC + '~DELOAD~' + g.data.replace(/-/g, ''), t: '🛌 De-load: ripasso FSRS leggero + Wakeful Rest (niente capitoli nuovi)', speciale: true, isDeload: true, d: 'Circuit breaker anti-burnout: intensità ridotta a L' + ridotto + ' fino al ' + fino + '.' });
      g.voci = tenere;
    }
    for (const s of sposta) {
      let g = p.giorni.find(x => x.data === s.a);
      if (!g) { g = { data: s.a, voci: [] }; p.giorni.push(g); p.giorni.sort((a, b) => a.data < b.data ? -1 : 1); }
      const iBuf = g.voci.findIndex(v => v.isBuffer); if (iBuf >= 0) g.voci.splice(iBuf, 0, s.v); else g.voci.push(s.v);
    }
    p.giorni.forEach((g, i) => { g.n = i + 1; });
    p.giorniTeoria = p.giorni.length; p.capienza = Math.max(p.capienza || 0, ...p.giorni.map(g => g.voci.length + 1));
    p.deload = { attivo: true, da: o.oggi, fino, livelloTarget: target, livelloRidotto: ridotto, motivo: o.motivo || 'affaticamento' };
    p.livelloIntensita = ridotto;
    return p;
  }
  /** Livello effettivo oggi: ridotto nelle 48 h, poi un giorno a metà strada (ripristino graduale), poi il target. */
  function livelloEffettivo(piano: any, oggi: string): IntensitaPiano {
    const d: StatoDeload | undefined = piano && piano.deload;
    if (!d || !d.attivo) return livelloValido(piano && piano.livelloIntensita || 2);
    if (oggi < d.fino) return d.livelloRidotto;
    if (oggi < piu(d.fino, 1)) return Math.min(d.livelloTarget, d.livelloRidotto + 1) as IntensitaPiano;
    return d.livelloTarget;
  }
  /** Chiude il de-load scaduto (copia) e ripristina il livello target; null se non c'è nulla da cambiare. */
  function aggiornaDeload(piano: any, oggi: string): PkPianoAI | null {
    if (!piano || piano.origine !== 'ai_neuro' || !piano.deload || !piano.deload.attivo) return null;
    const liv = livelloEffettivo(piano, oggi);
    if (liv === piano.livelloIntensita && oggi < piu(piano.deload.fino, 1)) return null;
    const p: PkPianoAI = clona(piano); p.livelloIntensita = liv;
    if (oggi >= piu(p.deload!.fino, 1)) p.deload = { ...p.deload!, attivo: false };
    return p;
  }

  // ---------- Stadio 5: hook post-quiz e buffer ----------
  const vociDi = (p: PkPianoAI) => p.giorni.flatMap(g => g.voci.map(v => ({ v, g })));
  const clona = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  /** Dopo un'illusione di competenza (o una risposta fortunata) su una materia del piano ai_neuro: anticipa di 24–48 h
   *  la prossima attività L3/L4 scambiandola con un buffer. Zero token; restituisce il piano nuovo (l'originale resta intatto). */
  function hookIpercorrezione(piano: any, ctx: { oggi: string; sk?: string; uid?: string; caso: string; materia?: string }): { piano: PkPianoAI; k: string; da: string; a: string } | null {
    if (!piano || piano.origine !== 'ai_neuro' || piano.pausa) return null;
    if (ctx.caso !== 'illusione_competenza' && ctx.caso !== 'lucky_guess') return null;
    if ((ctx.materia || ctx.sk) && piano.vincoliAI && (ctx.materia || materiaSk({ sk: ctx.sk })) !== piano.vincoliAI.materiaCodice) return null;
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
    if (fatt.stato === 'critico') return { piano: null, fatt, segnali: seg, fonte: m.fonte, chiamate: m.chiamate, tokenStimati: m.tokenStimati, struttura };
    const pid = dip.pid || 'ai-' + Date.now().toString(36);
    const rMin = v.livelloIntensita ? MATRICE_LIVELLI[livelloValido(v.livelloIntensita) - 1].ritenzioneTargetFSRS : 0;
    const piano = compilaTimelineNeuro(m.unita, v, fatt, seg, { oggi: dip.oggi, pid, titolo: dip.titolo, ritenzione: dip.ritenzione ? dip.ritenzione(rMin) : undefined, intervallo: dip.intervallo });
    piano.fonteMappa = m.fonte;
    return { piano, fatt, segnali: seg, fonte: m.fonte, chiamate: m.chiamate, tokenStimati: m.tokenStimati, struttura, errore: (m as any).errore };
  }

  return { finestraFinale, segnaliIper, materiaSk, occupatoDaEventi, finestreLibere, capacita, oreNecessarie, calcolaFattibilita, righeIndice, strutturaDaFonti, estraiStrutturaFonti,
    unitaDaStruttura, recuperaArrayParziale, normalizzaUnita, promptMappa, mappaCurriculumAI, stimaToken, ordineTopologico, sanitizzaPrereq, intervalliFsrs, s0,
    compilaTimelineNeuro, hookIpercorrezione, riassorbi, consumaBuffer, creaPiano, LIMITE_SERA, MAX_TOKEN_MAPPA, MAX_CHARS_STRUTTURA,
    // v0.56 (BP5)
    MATRICE_LIVELLI, HARD_CAP_ANALITICO, DIP, MAX_TOKEN_CALIBRAZIONE, BUDGET_CALIBRAZIONE, DOMANDE_UNIVERSALI, configLivello, sessioniQuiz, normalizzaProfilo, applicaGuardRailBiologici,
    picchiCircadiani, modalitaOffloading, allocaGiornata, pesiIniziali, applicaRisposte, paroleChiaveBM25, domandeCalibrazioneDefault, promptCalibrazione,
    leggiDomandeCalibrazione, generaDomandeCalibrazione, monitoraAffaticamento, attivaDeload, livelloEffettivo, aggiornaDeload };
})();
