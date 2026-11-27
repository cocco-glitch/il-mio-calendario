// ============================================================
// 03-modello.ts — Tipi dei dati, stato in memoria, ricorrenze.
// ============================================================

/** Regola di ricorrenza (sottoinsieme di RRULE). */
interface Ricorrenza {
  freq: 'D' | 'W' | 'M' | 'Y';      // giornaliera, settimanale, mensile, annuale
  interval: number;                  // ogni N
  byday?: number[];                  // solo per W: 0=lun … 6=dom
  until?: string;                    // 'YYYY-MM-DD' compreso
  count?: number;                    // numero di ripetizioni
}
interface VoceChecklist { id: string; testo: string; fatto: boolean; }
interface Allegato { id: string; nome: string; driveId?: string; url?: string; mime?: string; }

interface Evento extends Rec {
  type: 'evento';
  titolo: string;
  inizio: string;                    // 'YYYY-MM-DDTHH:mm'
  fine: string;                      // idem; per "tutto il giorno": 23:59 dell'ultimo giorno
  tuttoIlGiorno: boolean;
  luogo?: string;
  categoriaId?: string;
  colore?: string;                   // se assente usa il colore della categoria
  note?: string;                     // markdown
  checklist?: VoceChecklist[];
  promemoria?: number[];             // minuti prima dell'inizio
  rrule?: Ricorrenza;
  exdate?: string[];                 // giorni ('YYYY-MM-DD') esclusi dalla serie
  allegati?: Allegato[];             // Fase 2
  studioRef?: string;                // Fase 3: id di step/microstep
}
interface Task extends Rec {
  type: 'task';
  titolo: string;
  scadenza?: string;                 // 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm'; assente = Inbox
  priorita: number;                  // 0 nessuna, 1 bassa, 2 media, 3 alta
  fatto: boolean;
  fattoIl?: string;
  note?: string;
  categoriaId?: string;
  rrule?: Ricorrenza;
}
interface Nota extends Rec {
  type: 'nota';
  titolo: string;
  testo: string;                     // markdown
  tag: string[];
  giorno?: string;                   // se presente è la "nota del giorno" di quella data
}
interface Categoria extends Rec {
  type: 'categoria';
  nome: string;
  colore: string;
  visibile: boolean;
  ordine: number;
}
interface Impostazioni extends Rec {
  type: 'impostazioni';
  aiutiVisti?: string[];   // redesign blocco 5: aiuti contestuali già chiusi (sincronizzati con l'account)
  tema: 'auto' | 'chiaro' | 'scuro';
  accento: string;
  vistaIniziale: 'oggi' | 'giorno' | 'settimana' | 'mese' | 'agenda';
  // Fase 4 — aspetto e layout (tutti facoltativi: valori assenti = predefiniti)
  sfondo?: string;                       // colore di sfondo personalizzato ('' = del tema)
  font?: 'sistema' | 'arrotondato' | 'serif' | 'mono';
  scala?: number;                        // dimensione testo: 0.9 … 1.25
  densita?: 'compatta' | 'comoda';
  raggio?: number;                       // angoli arrotondati in px
  widget?: string[];                     // ordine dei riquadri di Oggi
  widgetNascosti?: string[];
  /** v0.60: «Modalità esame» automatica a ≤ 21 giorni da un esame ('no' = spenta). */
  modoEsame?: 'auto' | 'no';
  tabNascoste?: string[];                // sezioni nascoste dalla barra
  nav?: 'auto' | 'basso';
  preset?: string;                       // nome dell'ultimo preset applicato
  // Google Calendar (specchio)
  gcal?: boolean;
  gcalId?: string;
  gcalCategorie?: string[];
  gcalStudio?: boolean;                  // copia anche i blocchi del piano di studio
  gcalStudioOra?: string;                // 'HH:mm' dell'avviso dello studio ('' = tutto il giorno)
  gcalLeggiPrimary?: boolean;            // v0.55 (BP4): opt-in, sola lettura degli impegni di `primary` per il pianificatore
  // v0.7 — Notifiche sul telefono tramite ntfy (vedi 06-notifiche.ts). Tutto facoltativo.
  ntfy?: boolean;                        // attive
  ntfyTopic?: string;                    // codice segreto (il "topic" è la password)
  ntfyServer?: string;                   // predefinito https://ntfy.sh
  ntfyTipi?: { promemoria?: boolean; studio?: boolean; sera?: boolean; esami?: boolean };
  ntfyMattino?: string;                  // 'HH:mm' riepilogo dello studio (predef. 08:00)
  ntfySera?: string;                     // 'HH:mm' ripasso serale (predef. 21:30)
  ntfySilenzioDa?: string;               // orari silenziosi (predef. 23:00–07:30)
  ntfySilenzioA?: string;
  ntfyPrivate?: string[];                // id delle categorie con testo generico
  // v0.7 — Ripassi (F2)
  ripassoMinuti?: number;                // tetto giornaliero dei ripassi (predef. 30)
  ritenzione?: number;                   // ritenzione desiderata FSRS (predef. 0.90)
  // blocco 4 (N5): metodi che Studia ora può proporre; carte dagli errori dei quiz; appunti suggeriti dopo il quiz
  metodi?: PrefMetodi; carteAuto?: 'mai' | 'proponi' | 'auto'; suggerisciAppunti?: boolean;
}
/**
 * v0.7 — Scheda di memoria di un "elemento da ricordare" (scheda quiz, carta, errore, pagine).
 * id = 'mem-' + idElemento. Usata dal motore di ripasso FSRS (F2).
 */
interface Memoria extends Rec {
  type: 'memoria';
  er: string;                            // es. 'scheda:C-2.2.4-2'
  d: number;                             // difficoltà (1–10)
  s: number;                             // stabilità in giorni
  due: string;                           // prossimo ripasso 'YYYY-MM-DD'
  ultimo?: string;                       // ultimo ripasso 'YYYY-MM-DD'
  n: number;                             // ripassi fatti
  lapsi: number;                         // volte dimenticato
  log?: [string, number, number?, number?][]; // [giorno, voto 1–4, sicurezza 1–3, secondi], ultimi 50
}
/** v0.7 — Registro delle notifiche programmate su ntfy (uno per notifica, per non mandarle due volte). */
interface NotificaReg extends Rec { type: 'notifica'; at: number; h: string; titolo: string; }
interface Preset extends Rec { type: 'preset'; nome: string; valori: Partial<Impostazioni>; }

/** Una singola occorrenza di un evento (anche non ricorrente). */
interface Occ { ev: Evento; inizio: Date; fine: Date; chiave: string; }

// ---------- Stato ----------
/** Dati di partenza di un dispositivo nuovo (updatedAt = 1: alla prima sincronizzazione vincono quelli su Drive). */
function predefiniti(): Rec[] {
  return [
    { id: 'impostazioni', type: 'impostazioni', updatedAt: 1, tema: 'auto', accento: '#6c8cff', vistaIniziale: 'oggi', widgetNascosti: ['nota', 'tabelle', 'chiusura'] } as Rec,   // v0.60: Nota del giorno, Tabelle e Chiusura spenti di default (non rimossi)
    { id: 'cat-studio', type: 'categoria', updatedAt: 1, nome: 'Studio', colore: '#6c8cff', visibile: true, ordine: 0 } as Rec,
    { id: 'cat-personale', type: 'categoria', updatedAt: 1, nome: 'Personale', colore: '#2fbf8f', visibile: true, ordine: 1 } as Rec,
    { id: 'cat-salute', type: 'categoria', updatedAt: 1, nome: 'Salute', colore: '#f0708a', visibile: true, ordine: 2 } as Rec,
    { id: 'cat-uni', type: 'categoria', updatedAt: 1, nome: 'Uni', colore: '#e9a23b', visibile: true, ordine: 3 } as Rec,
  ];
}
const Stato = (() => {
  const rec = new Map<string, Rec>();
  const TIPI_SERVIZIO = new Set(['notifica']);       // v0.17: lapidi ripulibili dopo 7 giorni
  const lapideScaduta = (r: Rec) => TIPI_SERVIZIO.has(r.type) && (r.updatedAt || 0) < Date.now() - 7 * 86400000;
  const inCorso = new Set<Promise<void>>();         // v0.56.1: scritture IndexedDB non ancora confermate
  const traccia = (p: Promise<void>): Promise<void> => { const q = p.catch(e => { console.warn('DB.salva', e); }); inCorso.add(q); q.then(() => inCorso.delete(q)); return q; };
  let ver = 0, cacheVer = -1;                       // v0.17: versione dei dati e cache per tipo
  const perTipo = new Map<string, Rec[]>();
  const ascoltatori: Array<() => void> = [];
  let inAttesa = false;

  function notifica(): void {
    if (inAttesa) return;
    inAttesa = true;
    Promise.resolve().then(() => { inAttesa = false; ascoltatori.forEach(f => f()); });
  }

  return {
    rec,
    ascolta(f: () => void) { ascoltatori.push(f); },
    notifica,

    async carica(): Promise<void> {
      for (const r of await DB.apri()) rec.set(r.id, r);
      ver++;
      // Primo avvio: categorie e impostazioni di partenza.
      // updatedAt = 1 così, alla prima sincronizzazione, vincono sempre i dati già su Drive.
      if (!rec.has('impostazioni')) {
        const nuovi: Rec[] = predefiniti();
        for (const r of nuovi) if (!rec.has(r.id)) rec.set(r.id, r);
        ver++;
        await DB.salva(nuovi);
      }
    },

    /** Tutti i record non eliminati di un tipo. */
    tutti<T extends Rec>(type: string): T[] {
      // v0.17: indice per tipo, ricostruito solo dopo una modifica (ver). Restituisce sempre una copia.
      if (cacheVer !== ver) { perTipo.clear(); cacheVer = ver; }
      let l = perTipo.get(type);
      if (!l) { l = []; rec.forEach(r => { if (r.type === type && !r.deleted) l!.push(r); }); perTipo.set(type, l); }
      return l.slice() as T[];
    },
    /**
     * v0.17: rimuove le lapidi scadute dei tipi "di servizio" (registro notifiche): non servono più alla
     * sincronizzazione e ingrandirebbero dati.json. I dati dell'utente (eventi, schede…) non si toccano.
     */
    pulisci(): number {
      const via: string[] = [];
      rec.forEach(r => { if (r.deleted && lapideScaduta(r)) via.push(r.id); });
      for (const id of via) rec.delete(id);
      if (via.length) { ver++; DB.rimuovi(via); if (typeof Drive !== 'undefined') Drive.programma(); }
      return via.length;
    },
    /** Numero di versione dei dati: cambia a ogni salvataggio/unione (per le cache). */
    get ver(): number { return ver; },
    /** v0.60: true anche per le lapidi (serve alle migrazioni una tantum: un record eliminato non va ricreato). */
    esiste(id: string): boolean { return rec.has(id); },
    prendi<T extends Rec>(id: string): T | undefined {
      const r = rec.get(id);
      return r && !r.deleted ? (r as T) : undefined;
    },
    /** Salva un record aggiornando updatedAt (serve alla sincronizzazione). */
    salva(r: Rec, silenzioso = false): Promise<void> {
      r.updatedAt = Date.now();
      // v0.44 privacy: ogni dato porta l'account a cui appartiene (serve a non mescolare mai gli account)
      try { const em = JSON.parse(localStorage.getItem('imc-email') || '""'); if (em) (r as any).acc = String(em).toLowerCase(); } catch (_) { /* */ }
      rec.set(r.id, r); ver++;
      const p = traccia(DB.salva([r]));   // v0.56.1: promise risolta solo a transazione IndexedDB completata (oncomplete)
      if (!silenzioso) notifica(); // silenzioso: non ridisegna (es. mentre scrivi la nota del giorno)
      if (typeof Drive !== 'undefined') Drive.programma();
      if (typeof GCal !== 'undefined' && (r.type === 'evento' || r.type === 'task')) GCal.programma();
      return p;
    },
    /** v0.56.1: si risolve quando tutte le scritture IndexedDB avviate finora sono confermate (oncomplete). */
    scritto(): Promise<void> { return Promise.all(Array.from(inCorso)).then(() => undefined); },
    /** Eliminazione "morbida": il record resta come lapide per la sync. */
    elimina(id: string): void {
      const r = rec.get(id);
      if (!r) return;
      r.deleted = true;
      this.salva(r);
    },
    /** Unisce record esterni (backup/Drive): vince l'updatedAt più recente. */
    unisci(esterni: Rec[]): number {
      const cambiati: Rec[] = [];
      for (const e of esterni) {
        if (!e || !e.id || !e.type) continue;
        if (e.deleted && lapideScaduta(e) && !rec.has(e.id)) continue;   // v0.17: lapidi vecchie già ripulite
        const mio = rec.get(e.id);
        // v0.48: statistiche per domanda = contatore per dispositivo (si sommano, non vince l'ultimo)
        const m = mio && e.type === 'statq' && mio.type === 'statq' ? StatQC.unisci(mio, e) : null;
        if (m) { if (!StatQC.uguali(m, mio!)) { rec.set(e.id, m); cambiati.push(m); ver++; } continue; }
        if (!mio || (e.updatedAt || 0) > (mio.updatedAt || 0)) { rec.set(e.id, e); cambiati.push(e); ver++; }
      }
      if (cambiati.length) { traccia(DB.salva(cambiati)); notifica(); }
      return cambiati.length;
    },
    esporta(): Rec[] { return Array.from(rec.values()); },
    /** v0.44: cancella TUTTI i dati locali di questo dispositivo (quelli su Drive restano dove sono). */
    async svuotaLocale(): Promise<void> { const ids = Array.from(rec.keys()); rec.clear(); const p = predefiniti(); for (const r of p) rec.set(r.id, r); ver++; await DB.rimuovi(ids); await DB.salva(p); notifica(); },
    /** v0.44: rimuove davvero dal dispositivo (senza lapide) i record indicati. */
    async togliLocale(ids: string[]): Promise<void> { for (const id of ids) rec.delete(id); ver++; await DB.rimuovi(ids); notifica(); },
  };
})();

// ---------- v0.48 (BP1 §5.1): StatQ come PN-counter ----------
// c[dispositivo] = { n, ok, xn, xok }: risposte e giuste date su quel dispositivo; xn/xok = quelle annullate.
// Unione: per dispositivo e per campo il massimo (commutativa, associativa, idempotente); n/ok si ricalcolano come somma
// e restano nel record per i client 0.44. Un record senza `c` (scritto da 0.44) si unisce come prima (vince il più recente)
// e al primo tocco riparte da c = { legacy: { n, ok } }.
type ContoQ = { n: number; ok: number; xn: number; xok: number };
const StatQC = {
  conti(r: any): Record<string, ContoQ> { if (!r.c) r.c = { legacy: { n: r.n || 0, ok: r.ok || 0, xn: 0, xok: 0 } }; return r.c; },
  mio(r: any, dev: string): ContoQ { const c = StatQC.conti(r); return c[dev] || (c[dev] = { n: 0, ok: 0, xn: 0, xok: 0 }); },
  ricalcola(r: any): void {
    let n = 0, ok = 0; for (const k in r.c || {}) { const x = r.c[k]; n += (x.n || 0) - (x.xn || 0); ok += (x.ok || 0) - (x.xok || 0); }
    r.n = Math.max(0, n); r.ok = Math.max(0, Math.min(ok, r.n));
  },
  canon(x: any): any { return x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o: any, k) => { o[k] = StatQC.canon(x[k]); return o; }, {}) : x; },
  uguali(a: any, b: any): boolean { return JSON.stringify(StatQC.canon(a)) === JSON.stringify(StatQC.canon(b)); },
  /** null = unione classica (manca `c` da una parte, o lapide). */
  unisci(a: any, b: any): any {
    if (!a.c || !b.c || a.deleted || b.deleted) return null;
    const chiave = (r: any) => JSON.stringify(StatQC.canon([r.ultima || '', !!r.esito, r.scelte || null, r.sk || '']));
    const vince = (a.updatedAt || 0) !== (b.updatedAt || 0) ? ((a.updatedAt || 0) > (b.updatedAt || 0) ? a : b) : (chiave(a) >= chiave(b) ? a : b);
    const c: Record<string, ContoQ> = {};
    for (const k of Array.from(new Set(Object.keys(a.c).concat(Object.keys(b.c)))).sort()) {
      const x = a.c[k] || {}, y = b.c[k] || {}, m = (f: string) => Math.max(x[f] || 0, y[f] || 0);
      c[k] = { n: m('n'), ok: m('ok'), xn: m('xn'), xok: m('xok') };
    }
    const r = { ...vince, c, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) }; StatQC.ricalcola(r); return r;
  },
};

function imp(): Impostazioni { return Stato.rec.get('impostazioni') as Impostazioni; }
function categorie(): Categoria[] { return Stato.tutti<Categoria>('categoria').sort((a, b) => a.ordine - b.ordine); }
function coloreEvento(e: { colore?: string; categoriaId?: string }): string {
  if (e.colore) return e.colore;
  const c = e.categoriaId ? Stato.prendi<Categoria>(e.categoriaId) : undefined;
  return c ? c.colore : imp().accento;
}
function categoriaVisibile(id?: string): boolean {
  if (!id) return true;
  const c = Stato.prendi<Categoria>(id);
  return !c || c.visibile;
}

// ---------- Ricorrenze ----------

/** Genera in ordine le date di inizio di una serie (max 3000 passi). */
function* dateSerie(inizio: Date, rr: Ricorrenza): Generator<Date> {
  const intervallo = Math.max(1, rr.interval || 1);
  const fino = rr.until ? piuGiorni(daYmd(rr.until), 1) : null;
  let emesse = 0;
  const H = inizio.getHours(), M = inizio.getMinutes();
  const emetti = function* (d: Date): Generator<Date> {
    if (fino && d >= fino) return;
    if (rr.count && emesse >= rr.count) return;
    emesse++;
    yield d;
  };
  const finita = (d: Date) => (fino != null && d >= fino) || (rr.count != null && rr.count > 0 && emesse >= rr.count);

  if (rr.freq === 'W' && rr.byday && rr.byday.length) {
    const giorni = rr.byday.slice().sort((a, b) => a - b);
    let sett = lunedi(inizio);
    for (let i = 0; i < 3000; i++) {
      for (const g of giorni) {
        const d = piuGiorni(sett, g); d.setHours(H, M, 0, 0);
        if (d < inizio) continue;
        if (finita(d)) return;
        yield* emetti(d);
      }
      sett = piuGiorni(sett, 7 * intervallo);
    }
    return;
  }
  for (let i = 0; i < 3000; i++) {
    let d: Date;
    if (rr.freq === 'D') d = piuGiorni(inizio, i * intervallo);
    else if (rr.freq === 'W') d = piuGiorni(inizio, i * 7 * intervallo);
    else if (rr.freq === 'M') {
      d = new Date(inizio.getFullYear(), inizio.getMonth() + i * intervallo, inizio.getDate(), H, M);
      if (d.getDate() !== inizio.getDate()) continue; // es. il 31 nei mesi corti: si salta
    } else {
      d = new Date(inizio.getFullYear() + i * intervallo, inizio.getMonth(), inizio.getDate(), H, M);
      if (d.getMonth() !== inizio.getMonth()) continue; // 29 febbraio
    }
    if (finita(d)) return;
    yield* emetti(d);
  }
}

/** Occorrenze di un evento che toccano l'intervallo [da, a). */
function occorrenze(ev: Evento, da: Date, a: Date): Occ[] {
  const inizio = daDt(ev.inizio);
  const durata = Math.max(0, daDt(ev.fine).getTime() - inizio.getTime());
  const out: Occ[] = [];
  if (!ev.rrule) {
    const fine = new Date(inizio.getTime() + durata);
    if (inizio < a && fine >= da) out.push({ ev, inizio, fine, chiave: ymd(inizio) });
    return out;
  }
  const esclusi = new Set(ev.exdate || []);
  for (const d of dateSerie(inizio, ev.rrule)) {
    if (d >= a) break;
    const fine = new Date(d.getTime() + durata);
    if (fine < da) continue;
    const chiave = ymd(d);
    if (esclusi.has(chiave)) continue;
    out.push({ ev, inizio: d, fine, chiave });
  }
  return out;
}

/** Tutte le occorrenze visibili in [da, a), ordinate. */
function occorrenzeTra(da: Date, a: Date): Occ[] {
  let out: Occ[] = [];
  for (const ev of Stato.tutti<Evento>('evento')) {
    if (!categoriaVisibile(ev.categoriaId)) continue;
    out = out.concat(occorrenze(ev, da, a));
  }
  return out.sort((x, y) => x.inizio.getTime() - y.inizio.getTime() || (x.ev.titolo < y.ev.titolo ? -1 : 1));
}
function occorrenzeDelGiorno(g: Date): Occ[] {
  const da = inizioGiorno(g), a = piuGiorni(da, 1);
  return occorrenzeTra(da, a).filter(o => o.fine > da || stessoGiorno(o.inizio, da));
}

/** Testo leggibile di una ricorrenza. */
function testoRicorrenza(rr?: Ricorrenza): string {
  if (!rr) return '';
  const n = rr.interval || 1;
  const unita = { D: ['giorno', 'giorni'], W: ['settimana', 'settimane'], M: ['mese', 'mesi'], Y: ['anno', 'anni'] }[rr.freq];
  let s = n === 1 ? 'Ogni ' + unita[0] : 'Ogni ' + n + ' ' + unita[1];
  if (rr.freq === 'W' && rr.byday && rr.byday.length) s += ' (' + rr.byday.map(g => GIORNI_BREVI[g]).join(', ') + ')';
  if (rr.until) s += ' fino al ' + fmt(daYmd(rr.until), { day: 'numeric', month: 'short', year: 'numeric' });
  if (rr.count) s += ', ' + rr.count + ' volte';
  return s;
}

// ---------- Promemoria/Task ----------
function taskScaduto(t: Task): boolean {
  if (t.fatto || !t.scadenza) return false;
  const d = daDt(t.scadenza);
  return t.scadenza.length > 10 ? d < new Date() : d < oggi();
}
/** Spunta un promemoria; se è ricorrente lo sposta alla prossima scadenza. */
function spuntaTask(t: Task): void {
  if (!t.fatto && t.rrule && t.scadenza) {
    const base = daDt(t.scadenza);
    let prossima: Date | null = null;
    for (const d of dateSerie(base, t.rrule)) { if (d > base) { prossima = d; break; } }
    if (prossima) {
      t.scadenza = t.scadenza.length > 10 ? dtStr(prossima) : ymd(prossima);
      if (t.rrule.count) t.rrule.count = Math.max(1, t.rrule.count - 1);
      Stato.salva(t);
      return;
    }
  }
  t.fatto = !t.fatto;
  t.fattoIl = t.fatto ? dtStr(new Date()) : undefined;
  Stato.salva(t);
}
function ordinaTask(a: Task, b: Task): number {
  const da = a.scadenza || '9999', db = b.scadenza || '9999';
  if (da !== db) return da < db ? -1 : 1;
  return b.priorita - a.priorita;
}
