// 07-testopdf.ts — Motore unificato, blocco 1 (N3): UNICO punto in cui l'app apre un PDF e ne legge il testo.
// Prima 10 chiamate a pdf.js `getDocument` in 9 file, con 3 modi diversi di unire il testo e chiusure non uniformi
// (creaquiz leggeva fino a 700 pagine senza mai chiudere il documento). Qui: apertura sempre senza eval
// (CVE-2024-4367), chiusura garantita con `con()`, `page.cleanup()` dopo ogni lettura, formati del testo invariati.
//
// I formati restano quelli di prima, byte per byte, perché alcuni chiamanti calcolano un hash del testo
// (es. la `versione` di un PDF nella coda quiz): cambiarli farebbe sembrare «nuovo» un libro già lavorato.
//   'spazi' → str unite da uno spazio            (Centro, coda quiz, piani AI, pagine scelte in Creaquiz)
//   'eol'   → str + a capo dove pdf.js segna EOL (misura del master prompt, appunti da PDF, ricerca in Creaquiz)
//   'righe' → righe ricostruite dalla coordinata y (indice del programma nel wizard)

type ModoTestoPdf = 'spazi' | 'eol' | 'righe';
interface ElementoTestoPdf { str?: string; hasEOL?: boolean; transform?: number[]; }

const TestoPdf = (() => {
  /** Righe di una pagina: un elemento va a capo quando la sua y differisce di oltre 2 punti dalla precedente. */
  function righe(items: ElementoTestoPdf[]): string[] {
    const out: string[] = []; let y: number | null = null, r = '';
    for (const it of items) {
      const yy = Math.round(it.transform ? it.transform[5] : 0);
      if (y !== null && Math.abs(yy - y) > 2) { out.push(r); r = ''; }
      r += (r && !r.endsWith(' ') ? ' ' : '') + it.str; y = yy;
    }
    if (r) out.push(r);
    return out;
  }
  /** Testo di una pagina nel formato richiesto (funzione pura, testata in Node). */
  function formatta(items: ElementoTestoPdf[], modo: ModoTestoPdf = 'spazi'): string {
    if (modo === 'eol') return items.map(x => (x.str || '') + (x.hasEOL ? '\n' : ' ')).join('');
    if (modo === 'righe') return righe(items).join('\n');
    return items.map(x => x.str || '').join(' ');
  }
  /** Apre un PDF (Blob, File, ArrayBuffer o byte) con pdf.js, sempre senza eval. */
  async function apri(dati: Blob | ArrayBuffer | Uint8Array) {
    const L = await caricaPdfJs();
    const data = dati instanceof Uint8Array ? dati : new Uint8Array(dati instanceof ArrayBuffer ? dati : await dati.arrayBuffer());
    return L.getDocument({ data, isEvalSupported: false }).promise;
  }
  async function chiudi(doc: { destroy?: () => unknown } | null | undefined): Promise<void> {
    try { if (doc && typeof doc.destroy === 'function') await doc.destroy(); } catch (e) { console.warn('[TestoPdf] chiusura del PDF', e); }
  }
  /** Apre, esegue `fn` e chiude SEMPRE il documento, anche in caso di errore. */
  async function con<T>(dati: Blob | ArrayBuffer | Uint8Array, fn: (doc: Awaited<ReturnType<typeof apri>>) => Promise<T>): Promise<T> {
    const doc = await apri(dati);
    try { return await fn(doc); } finally { await chiudi(doc); }
  }
  /** Elementi di testo della pagina n (1…numPages); libera subito le risorse della pagina. */
  async function elementi(doc: { getPage(n: number): Promise<{ getTextContent(): Promise<{ items: ElementoTestoPdf[] }>; cleanup?: () => void }> }, n: number): Promise<ElementoTestoPdf[]> {
    const p = await doc.getPage(n);
    try { return (await p.getTextContent()).items; }
    finally { try { if (typeof p.cleanup === 'function') p.cleanup(); } catch (e) { console.warn('[TestoPdf] pulizia pagina ' + n, e); } }
  }
  async function pagina(doc: Parameters<typeof elementi>[0], n: number, modo: ModoTestoPdf = 'spazi'): Promise<string> {
    return formatta(await elementi(doc, n), modo);
  }
  // ---------- Blocco 2: cache locale del testo (Cache API, solo questo dispositivo, svuotata al cambio account) ----------
  const CACHE = 'imc-testo-pdf';
  const url = (chiave: string, modo: ModoTestoPdf) => location.origin + '/__testo-pdf/' + encodeURIComponent(chiave) + '/' + modo;
  async function daCache(chiave: string, modo: ModoTestoPdf): Promise<string[] | null> {
    try { const r = await (await caches.open(CACHE)).match(url(chiave, modo)); return r ? await r.json() as string[] : null; }
    catch (e) { console.warn('[TestoPdf] cache non leggibile', e); return null; }
  }
  async function inCache(chiave: string, modo: ModoTestoPdf, pagine: string[]): Promise<void> {
    try { await (await caches.open(CACHE)).put(url(chiave, modo), new Response(JSON.stringify(pagine), { headers: { 'content-type': 'application/json' } })); }
    catch (e) { console.warn('[TestoPdf] cache non scritta (spazio?)', e); }
  }
  /** Testo di TUTTE le pagine; con una chiave (id@versione o sha256 del file) la seconda volta non riapre il PDF. */
  async function tutte(dati: Blob | ArrayBuffer | Uint8Array | (() => Promise<Blob>), chiave: string | null, modo: ModoTestoPdf = 'eol', avanza?: (fatte: number, tot: number) => void): Promise<string[]> {
    if (chiave) { const c = await daCache(chiave, modo); if (c) return c; }
    const pagine = await con(typeof dati === 'function' ? await dati() : dati, async doc => {
      const out: string[] = [];
      for (let n = 1; n <= doc.numPages; n++) { out.push(await pagina(doc, n, modo)); if (avanza && n % 20 === 0) avanza(n, doc.numPages); }
      return out;
    });
    if (chiave) await inCache(chiave, modo, pagine);
    return pagine;
  }
  return { apri, chiudi, con, elementi, pagina, formatta, righe, tutte, CACHE };
})();
