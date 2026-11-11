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
  tabNascoste?: string[];                // sezioni nascoste dalla barra
  nav?: 'auto' | 'basso';
  preset?: string;                       // nome dell'ultimo preset applicato
  // Google Calendar (specchio)
  gcal?: boolean;
  gcalId?: string;
  gcalCategorie?: string[];
  gcalStudio?: boolean;                  // copia anche i blocchi del piano di studio
  gcalStudioOra?: string;                // 'HH:mm' dell'avviso dello studio ('' = tutto il giorno)
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
const Stato = (() => {
  const rec = new Map<string, Rec>();
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
      // Primo avvio: categorie e impostazioni di partenza.
      // updatedAt = 1 così, alla prima sincronizzazione, vincono sempre i dati già su Drive.
      if (!rec.has('impostazioni')) {
        const nuovi: Rec[] = [
          { id: 'impostazioni', type: 'impostazioni', updatedAt: 1, tema: 'auto', accento: '#6c8cff', vistaIniziale: 'oggi' },
          { id: 'cat-studio', type: 'categoria', updatedAt: 1, nome: 'Studio', colore: '#6c8cff', visibile: true, ordine: 0 },
          { id: 'cat-personale', type: 'categoria', updatedAt: 1, nome: 'Personale', colore: '#2fbf8f', visibile: true, ordine: 1 },
          { id: 'cat-salute', type: 'categoria', updatedAt: 1, nome: 'Salute', colore: '#f0708a', visibile: true, ordine: 2 },
          { id: 'cat-uni', type: 'categoria', updatedAt: 1, nome: 'Uni', colore: '#e9a23b', visibile: true, ordine: 3 },
        ];
        for (const r of nuovi) if (!rec.has(r.id)) rec.set(r.id, r);
        await DB.salva(nuovi);
      }
    },

    /** Tutti i record non eliminati di un tipo. */
    tutti<T extends Rec>(type: string): T[] {
      const out: T[] = [];
      rec.forEach(r => { if (r.type === type && !r.deleted) out.push(r as T); });
      return out;
    },
    prendi<T extends Rec>(id: string): T | undefined {
      const r = rec.get(id);
      return r && !r.deleted ? (r as T) : undefined;
    },
    /** Salva un record aggiornando updatedAt (serve alla sincronizzazione). */
    salva(r: Rec, silenzioso = false): void {
      r.updatedAt = Date.now();
      rec.set(r.id, r);
      DB.salva([r]);
      if (!silenzioso) notifica(); // silenzioso: non ridisegna (es. mentre scrivi la nota del giorno)
      if (typeof Drive !== 'undefined') Drive.programma();
      if (typeof GCal !== 'undefined' && (r.type === 'evento' || r.type === 'task')) GCal.programma();
    },
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
        const mio = rec.get(e.id);
        if (!mio || (e.updatedAt || 0) > (mio.updatedAt || 0)) { rec.set(e.id, e); cambiati.push(e); }
      }
      if (cambiati.length) { DB.salva(cambiati); notifica(); }
      return cambiati.length;
    },
    esporta(): Rec[] { return Array.from(rec.values()); },
  };
})();

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
function scadenzaTask(t: Task): Date | null { return t.scadenza ? daDt(t.scadenza) : null; }
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
