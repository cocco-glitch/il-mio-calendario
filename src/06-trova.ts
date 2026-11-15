// =====================================================================
// 06-trova.ts — v0.42 RICERCA UNIVERSALE SUL DRIVE (per chiunque usi l'app)
// Non dipende da cartelle fisse: cerca in TUTTO il Drive dell'utente (scope drive.readonly) e ordina i
// risultati con un punteggio, come farebbe una persona che conosce le sue cartelle:
//   1) contenuto: Drive indicizza il testo di JSON/PDF/Docs → «fullText contains» trova i pacchetti
//      anche se hanno un nome qualunque (cerca la firma "pacchetto-studio");
//   2) nome del file: parole chiave del tipo cercato (step, piano, quiz, scheda, materie…);
//   3) cartelle: il nome della cartella e del suo genitore (es. «materiale studio», «fisica quiz»,
//      «Calendario personale») e le cartelle dove l'app ha già trovato roba (impara da sola);
//   4) materie e corsi dell'utente (dai pacchetti già presenti e dalle sue parole);
//   5) recenza e dimensione ragionevole.
// Ogni risultato porta il «perché» del punteggio, così è verificabile.
// =====================================================================

interface Trovato { id: string; name: string; mimeType: string; modifiedTime: string; size?: string; parents?: string[]; punti: number; perche: string[]; cartella?: string; }

const Trova = (() => {
  const KCART = 'trova-cartelle';            // cartelle dove l'app ha già trovato cose utili (si impara)
  const nomiCartelle = new Map<string, Promise<{ name: string; parents?: string[] } | null>>();
  const norm2 = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const esc = (s: string) => s.replace(/\\/g, '').replace(/'/g, "\\'");
  const imparate = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(KCART) || '{}'); } catch (_) { return {}; } };
  function impara(cartelle: (string | undefined)[]): void {
    const c = imparate(); for (const x of cartelle) if (x) c[x] = (c[x] || 0) + 1;
    try { localStorage.setItem(KCART, JSON.stringify(c)); } catch (_) { /* privato */ }
  }
  async function cartella(id: string): Promise<{ name: string; parents?: string[] } | null> {
    if (!nomiCartelle.has(id)) nomiCartelle.set(id, Drive.api('files/' + id, { query: { fields: 'name,parents' } }).catch(() => null));
    return nomiCartelle.get(id)!;
  }
  async function query(q: string, n = 200): Promise<any[]> {
    try {
      const r = await Drive.api('files', { query: { q: 'trashed = false and ' + q, fields: 'files(id,name,mimeType,modifiedTime,size,parents)', pageSize: String(n), orderBy: 'modifiedTime desc', corpora: 'user', includeItemsFromAllDrives: 'false' } });
      return r.files || [];
    } catch (e: any) { if (String(e.message) === 'NOLOGIN') throw e; return []; }
  }
  /** Parole che descrivono il mondo dell'utente: materie, corsi, step già presenti. */
  function contesto(): string[] {
    const o = new Set<string>(['studio', 'materiale', 'quiz', 'schede', 'piano', 'step', 'calendario', 'corso', 'esame', 'lezioni', 'universita']);
    try {
      for (const r of Stato.tutti<Rec>('pacchetto')) { const c: any = r.contenuto; if (!c) continue; for (const m of c.materie || []) { o.add(norm2(m.nome || '')); if (m.libro) o.add(norm2(String(m.libro).split(/\s/)[0])); } }
      for (const c of Stato.tutti<any>('categoria')) if (c.nome) o.add(norm2(c.nome));
    } catch (_) { /* senza dati */ }
    ['chimica', 'biologia', 'fisica', 'matematica', 'anatomia', 'fisiologia', 'istologia', 'biochimica', 'genetica', 'statistica'].forEach(x => o.add(x));
    return Array.from(o).filter(x => x && x.length > 2);
  }
  /** Punteggio di un file rispetto alle parole chiave (con il «perché»). */
  async function punteggio(f: any, parole: string[], extra: { firma?: boolean; tipi?: RegExp }): Promise<Trovato> {
    const perche: string[] = []; let p = 0; const n = norm2(f.name);
    if (extra.firma) { p += 60; perche.push('contiene la firma del formato'); }
    for (const w of parole) if (w.length > 2 && n.includes(w)) { p += 12; perche.push('nome: «' + w + '»'); }
    if (extra.tipi && extra.tipi.test(n)) { p += 10; perche.push('nome tipico'); }
    const par = (f.parents || [])[0]; let cart = '';
    if (par) {
      const c = await cartella(par); if (c) { cart = c.name; const cn = norm2(c.name);
        for (const w of parole) if (w.length > 2 && cn.includes(w)) { p += 8; perche.push('cartella «' + c.name + '»'); break; }
        const g = c.parents && c.parents[0] ? await cartella(c.parents[0]) : null;
        if (g) { const gn = norm2(g.name); for (const w of parole) if (w.length > 2 && gn.includes(w)) { p += 4; perche.push('dentro «' + g.name + '»'); break; } }
      }
      const imp = imparate()[par]; if (imp) { p += Math.min(20, imp * 5); perche.push('cartella già usata'); }
    }
    const giorni = (Date.now() - Date.parse(f.modifiedTime || '2000-01-01')) / 864e5; p += Math.max(0, 8 - giorni / 30);
    if (f.size && +f.size > 25e6) { p -= 30; perche.push('molto grande'); }
    return { ...f, punti: Math.round(p), perche, cartella: cart };
  }

  /** PACCHETTI (piani, step, corsi): ovunque nel Drive.
   *  v0.43 memoria: dopo una ricerca completa, per 7 giorni cerca solo i file MODIFICATI da allora
   *  e riaggiunge quelli già noti (MemoriaIA, tipo «pacchetto»): molte meno chiamate al Drive. */
  async function pacchetti(completa = false): Promise<Trovato[]> {
    let ultima = 0; try { ultima = +(localStorage.getItem('trova-ultima') || 0); } catch (_) { /* */ }
    const incr = !completa && Date.now() - ultima < 7 * 864e5 ? " and modifiedTime > '" + new Date(ultima - 36e5).toISOString() + "'" : '';
    // v0.44 privacy: solo file DI PROPRIETÀ dell'account (mai i pacchetti di altri condivisi con lui)
    const firma = await query("'me' in owners and fullText contains 'pacchetto-studio'" + incr, 300);
    const json = await query("'me' in owners and (mimeType = 'application/json' or name contains '.json')" + incr, 400);
    if (incr) { for (const x of MemoriaIA.migliori('ricerca', 'pacchetto', 60)) if (x.v && x.v.id && !firma.some(f => f.id === x.v.id)) firma.push({ ...x.v, noto: true }); }
    else { try { localStorage.setItem('trova-ultima', String(Date.now())); } catch (_) { /* */ } }
    const visti = new Map<string, any>(); for (const f of firma) visti.set(f.id, { f, firma: true }); for (const f of json) if (!visti.has(f.id)) visti.set(f.id, { f, firma: false });
    const parole = contesto().concat(['pacchetto', 'raffinamento', 'banca']);
    const tipi = /step|piano|pacchett|corso|raffinamento|banca|indice/;
    const out: Trovato[] = [];
    for (const { f, firma: fi } of visti.values()) { if (f.mimeType === 'application/vnd.google-apps.folder') continue; out.push(await punteggio(f, parole, { firma: fi, tipi })); }
    return out.sort((a, b) => b.punti - a.punti);
  }

  /** FILE PER UN ARGOMENTO (fonti di studio: PDF, Documenti, slide, testi).
   *  v0.43 memoria: prima guarda «dove stava cosa» (argomenti simili già cercati e usati con successo):
   *  se la memoria è buona basta UNA ricerca nel Drive invece di sei. */
  async function fonti(argomento: string, extraParole: string[] = [], max = 12): Promise<Trovato[]> {
    const ricordati = MemoriaIA.migliori('ricerca', 'posto', 3, argomento).filter(x => MemoriaIA.simile(argomento, x.k) >= .5);
    const daMemoria: Trovato[] = [];
    for (const x of ricordati) for (const f of (x.v && x.v.files) || []) if (!daMemoria.some(y => y.id === f.id)) daMemoria.push({ ...f, punti: 40 + Math.round(10 * x.n), perche: ['già usata per «' + x.k + '»'], cartella: f.cartella || '' });
    const memBuona = daMemoria.length >= 1 && ricordati.some(x => MemoriaIA.simile(argomento, x.k) >= .75);
    const chiavi = Array.from(new Set((argomento + ' ' + extraParole.join(' ')).split(/[\s,;:/()«»"]+/).map(norm2).filter(w => w.length > 3 && !STOP.has(w)))).slice(0, 8);
    if (!chiavi.length) return [];
    const tipiQ = "(mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.presentation' or mimeType = 'text/plain' or mimeType = 'text/markdown')";
    const visti = new Map<string, { f: any; colpi: number }>();
    // una ricerca per ogni parola (nel testo) + una con tutte insieme (più precisa)
    const qs = [chiavi.map(w => "fullText contains '" + esc(w) + "'").join(' and '), ...(memBuona ? [] : chiavi.slice(0, 5).map(w => "fullText contains '" + esc(w) + "'"))];
    for (let i = 0; i < qs.length; i++) for (const f of await query(qs[i] + ' and ' + tipiQ, i ? 40 : 60)) { const v = visti.get(f.id) || { f, colpi: 0 }; v.colpi += i ? 1 : 4; visti.set(f.id, v); }
    const parole = chiavi.concat(contesto());
    const out: Trovato[] = [];
    for (const { f, colpi } of visti.values()) { const t = await punteggio(f, parole, {}); t.punti += colpi * 9; t.perche.unshift('testo: ' + colpi + ' corrispondenze'); out.push(t); }
    for (const m of daMemoria) { const o = out.find(y => y.id === m.id); if (o) { o.punti += m.punti; o.perche.unshift(m.perche[0]); } else out.push(m); }
    return out.sort((a, b) => b.punti - a.punti).slice(0, max);
  }
  /** Ricorda dove stava cosa: argomento → file usati (con pagine utili). */
  function ricordaPosto(argomento: string, files: { id: string; name: string; mimeType: string; cartella?: string; pagine?: string }[]): void {
    if (files.length) MemoriaIA.nota('ricerca', 'posto', argomento, { files: files.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, cartella: f.cartella || '', modifiedTime: '' })) });
  }

  /** Un file per nome (es. una scheda quiz) quando la cartella indicata dal pacchetto non esiste. */
  async function perNome(parti: string[], tipo?: string): Promise<Trovato | null> {
    const q = parti.filter(Boolean).map(x => "name contains '" + esc(x) + "'").join(' and ') + (tipo ? " and mimeType = '" + tipo + "'" : '');
    const r = await query(q, 20); if (!r.length) return null;
    const t = await punteggio(r[0], contesto(), {}); impara([t.parents && t.parents[0]]); return t;
  }
  const STOP = new Set(['della', 'delle', 'degli', 'dello', 'nella', 'nelle', 'sulla', 'sulle', 'come', 'cosa', 'quale', 'quali', 'questo', 'questa', 'sono', 'fare', 'crea', 'creami', 'quiz', 'scheda', 'domande', 'voglio', 'vorrei', 'perche', 'anche', 'tutto', 'tutti', 'ogni', 'dove', 'quando', 'with', 'from']);
  return { pacchetti, fonti, perNome, impara, contesto, ricordaPosto };
})();
