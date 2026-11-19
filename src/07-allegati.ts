// ============================================================
// 07-allegati.ts — v0.57 (BP6 · A14): immagini dei fogli a mano FUORI da dati.json.
// Prima ogni pagina PDF/foto/risultato finiva come data-URL dentro il record → dati.json da ~7 MB a ogni sync.
// Ora: il record tiene solo un riferimento «imc-img:<hash>»; i byte stanno in IndexedDB
// ('imc-allegati') e, per gli altri dispositivi, su Drive in «Calendario personale/Allegati app/<hash>.img».
// - Migrazione automatica e retrocompatibile (schemaVersion resta 2): un data-URL viene sostituito dal
//   riferimento SOLO dopo che la scrittura in IndexedDB è riuscita. Se fallisce, il record resta com'era.
// - Un'app vecchia che riceve un riferimento vede l'immagine mancante ma lo conserva così com'è: nessuna perdita.
// - Mai eliminazioni su Drive: si caricano solo file nuovi (nome = hash del contenuto, quindi immutabili).
// ============================================================

const Allegati = (() => {
  const PREFISSO = 'imc-img:';
  const NOME_DB = 'imc-allegati';
  const CARTELLA = 'Allegati app';
  const CHIAVE_ATTESA = 'imc-allegati-attesa';
  const mem = new Map<string, string>();          // rif → data-URL (cache di sessione)
  const inArrivo = new Map<string, Promise<string>>();
  let dbp: Promise<IDBDatabase | null> | null = null;

  /** Hash sincrono a 64 bit (due FNV-1a) + lunghezza: stesso contenuto → stesso riferimento. */
  function hash(s: string): string {
    let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995); b ^= b >>> 15; }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36) + s.length.toString(36);
  }
  const eRif = (s: unknown): s is string => typeof s === 'string' && s.startsWith(PREFISSO);
  const rifDi = (dataUrl: string) => PREFISSO + hash(dataUrl);
  const nomeFile = (rif: string) => rif.slice(PREFISSO.length).replace(/[^a-z0-9]/gi, '') + '.img';

  function db(): Promise<IDBDatabase | null> {
    if (!dbp) dbp = new Promise(ok => {
      try {
        const rq = indexedDB.open(NOME_DB, 1);
        rq.onupgradeneeded = () => { rq.result.createObjectStore('img'); };
        rq.onsuccess = () => ok(rq.result);
        rq.onerror = () => { console.warn('Allegati: IndexedDB non disponibile', rq.error); ok(null); };
        rq.onblocked = () => ok(null);
      } catch (e) { console.warn('Allegati: IndexedDB non disponibile', e); ok(null); }
    });
    return dbp;
  }
  async function leggiIdb(rif: string): Promise<string | undefined> {
    const d = await db(); if (!d) return undefined;
    return new Promise(ok => {
      try { const rq = d.transaction('img').objectStore('img').get(rif); rq.onsuccess = () => ok(typeof rq.result === 'string' ? rq.result : undefined); rq.onerror = () => ok(undefined); }
      catch (e) { console.warn('Allegati: lettura fallita', e); ok(undefined); }
    });
  }
  async function scriviIdb(rif: string, dataUrl: string): Promise<boolean> {
    const d = await db(); if (!d) return false;
    return new Promise(ok => {
      try {
        const tx = d.transaction('img', 'readwrite'); tx.objectStore('img').put(dataUrl, rif);
        tx.oncomplete = () => ok(true); tx.onerror = () => ok(false); tx.onabort = () => ok(false);
      } catch (e) { console.warn('Allegati: scrittura fallita', e); ok(false); }
    });
  }

  function attesa(): string[] { try { const v = JSON.parse(localStorage.getItem(CHIAVE_ATTESA) || '[]'); return Array.isArray(v) ? v.filter(eRif) : []; } catch (_) { return []; } }
  function salvaAttesa(l: string[]): void { try { localStorage.setItem(CHIAVE_ATTESA, JSON.stringify([...new Set(l)])); } catch (e) { console.warn('Allegati: coda non salvata', e); } }

  /** Mette un data-URL nell'archivio. Ritorna il riferimento, o null se l'archivio non è scrivibile. */
  async function metti(dataUrl: string): Promise<string | null> {
    const rif = rifDi(dataUrl);
    if (mem.get(rif) === dataUrl) return rif;
    if (!await scriviIdb(rif, dataUrl)) return null;
    mem.set(rif, dataUrl); salvaAttesa([...attesa(), rif]);
    return rif;
  }

  /** Data-URL già in memoria (sincrono, per il disegno). */
  const subito = (rif: string): string | undefined => mem.get(rif);

  /** Data-URL di un riferimento: memoria → IndexedDB → Drive (se collegato). Stringa vuota se introvabile. */
  function risolvi(rif: string): Promise<string> {
    const m = mem.get(rif); if (m) return Promise.resolve(m);
    let p = inArrivo.get(rif);
    if (p) return p;
    p = (async () => {
      const loc = await leggiIdb(rif);
      if (loc) { mem.set(rif, loc); return loc; }
      if (typeof Drive === 'undefined' || !Drive.stato.email) return '';
      try {
        const cart = await Drive.sottocartella(CARTELLA);
        const f = await Drive.trovaFile(nomeFile(rif), cart);
        if (!f) return '';
        const testo = await Drive.scaricaTesto(f.id);
        if (!testo.startsWith('data:') || rifDi(testo) !== rif) { console.warn('Allegati: file su Drive non valido', rif); return ''; }
        await scriviIdb(rif, testo); mem.set(rif, testo);
        return testo;
      } catch (e) { console.warn('Allegati: download non riuscito', e); return ''; }
    })().finally(() => inArrivo.delete(rif));
    inArrivo.set(rif, p);
    return p;
  }

  /** Sostituisce i data-URL di un foglio a mano con riferimenti. true se ha cambiato qualcosa. */
  async function esternalizzaMano(m: Mano | undefined): Promise<boolean> {
    if (!m || !m.im || !m.im.length) return false;
    let cambiato = false;
    for (const x of m.im) {
      if (typeof x.s !== 'string' || !x.s.startsWith('data:')) continue;
      const rif = await metti(x.s);
      if (rif) { x.s = rif; cambiato = true; }
    }
    return cambiato;
  }

  type ConMano = Rec & { mano?: Mano };
  const haIncorporate = (m: Mano | undefined) => !!(m && m.im && m.im.some(x => typeof x.s === 'string' && x.s.startsWith('data:')));
  /** Alleggerisce un record (appunto con foglio a mano): data-URL → riferimenti, poi salva. */
  async function alleggerisci(id: string): Promise<boolean> {
    const a = Stato.prendi<ConMano>(id); if (!a || !a.mano || !haIncorporate(a.mano)) return false;
    const m = a.mano, copia: Mano = { ...m, im: (m.im || []).map(x => ({ ...x })) };
    if (!await esternalizzaMano(copia)) return false;
    const r = Stato.prendi<ConMano>(id); if (!r) return false;
    r.mano = copia; Stato.salva(r, true);
    return true;
  }

  /** Migrazione all'avvio: tutti gli appunti con immagini incorporate. Ritorna quanti record sono stati alleggeriti. */
  async function migra(): Promise<number> {
    let n = 0;
    for (const a of Stato.tutti<ConMano>('appunto')) if (haIncorporate(a.mano) && await alleggerisci(a.id)) n++;
    return n;
  }

  /** Carica su Drive gli allegati in attesa (solo file nuovi: niente sovrascritture né eliminazioni). */
  async function caricaInAttesa(): Promise<number> {
    const l = attesa(); if (!l.length || typeof Drive === 'undefined' || !Drive.stato.email) return 0;
    const cart = await Drive.sottocartella(CARTELLA);
    const resto: string[] = []; let n = 0;
    for (const rif of l) {
      try {
        const dato = mem.get(rif) || await leggiIdb(rif);
        if (!dato) continue;                                   // sparito in locale: niente da caricare
        if (!await Drive.trovaFile(nomeFile(rif), cart)) { await Drive.carica(nomeFile(rif), cart, dato, 'text/plain'); n++; }
      } catch (e) { console.warn('Allegati: upload rimandato', e); resto.push(rif); }
    }
    salvaAttesa(resto);
    return n;
  }

  /** Logout / cambio account: l'archivio locale appartiene all'account precedente. */
  async function svuota(): Promise<void> {
    mem.clear(); inArrivo.clear(); salvaAttesa([]);
    const d = await db(); if (!d) return;
    await new Promise<void>(ok => {
      try { const tx = d.transaction('img', 'readwrite'); tx.objectStore('img').clear(); tx.oncomplete = () => ok(); tx.onerror = () => ok(); tx.onabort = () => ok(); }
      catch (e) { console.warn('Allegati: svuotamento non riuscito', e); ok(); }
    });
  }

  return { eRif, rifDi, metti, subito, risolvi, esternalizzaMano, alleggerisci, migra, caricaInAttesa, svuota, attesa, PREFISSO, CARTELLA };
})();
