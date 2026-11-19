// ============================================================
// 06-drive.ts — Google: login (Google Identity Services), Drive API v3,
// Picker, sincronizzazione, backup, allegati. Nessun backend.
//
// COME FUNZIONA LA SYNC
// - Su Drive, nella cartella dell'app, c'è `dati/dati.json`: l'elenco di
//   TUTTI i record (anche le lapidi `deleted`). È la fonte di verità.
// - Sync = scarico dati.json → Stato.unisci (vince updatedAt più alto) →
//   se ho modifiche locali più nuove, ricarico il file unito.
// - Le modifiche locali vengono accodate (coda offline = tutti i record con
//   updatedAt > ultimoSyncRiuscito) e spedite al prossimo sync.
// - Una volta al giorno, prima di sovrascrivere, copio il file in
//   `backup/dati-YYYY-MM-DD.json` e tengo gli ultimi 30.
// - L'app NON elimina mai file di Drive: al massimo li sposta in
//   `_cestino app/` dentro la sua cartella.
// ============================================================

const G_CLIENT_ID = '1032464441107-ccv99btse1o2497kckfia1ps074n1h0c.apps.googleusercontent.com';
const G_API_KEY = 'AIzaSyD3-PbIu4U4jmAIru6C8wwGIboFcGKY4tk';
const G_APP_ID = '1032464441107';
// drive.file: scrive solo i file creati dall'app. drive.readonly: LEGGE le cartelle di studio (quiz HTML, PDF dei libri,
// pacchetti creati da Claude). L'app non può modificare né eliminare nulla fuori dalla sua cartella.
const G_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly openid email';
// Privacy "solo mia": l'app accetta solo questi account (oltre al blocco lato Google: progetto in Testing con soli utenti di test).
// v0.26: due account ammessi. Il proprietario vede anche il programma pubblicato col sito (Medicina);
// il secondo account parte vuoto e riceve i suoi pacchetti dalla sua cartella Drive.
// v0.57 (U4/A12): nel sito pubblico solo l'hash SHA-256 dell'email minuscola, mai l'indirizzo in chiaro.
// Per ammettere un account: `node -e "console.log(require('crypto').createHash('sha256').update('<gmail minuscolo>').digest('hex'))"`,
// aggiungere l'hash qui e l'account tra gli «utenti di prova» del progetto Google Cloud (vedi docs/SECONDA-PERSONA.md).
const HASH_PROPRIETARIO = 'aa6b55d11a786b1b08a4606d7b72587a231c199a5f5ef22f1dc231635fca545e';
const HASH_AMMESSI = [HASH_PROPRIETARIO, 'fce4085ef1d95714e8c92ca2a8fe1ec0080ebcdb6538af6c4fac8e0d06138a1d'];
/** SHA-256 esadecimale (FIPS 180-4) di una stringa UTF-8. Sincrono: eProprietario() deve sempre riflettere l'email attuale. */
function sha256Hex(testo: string): string {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const b = Array.from(new TextEncoder().encode(testo)), bit = b.length * 8;
  b.push(0x80); while (b.length % 64 !== 56) b.push(0);
  for (let i = 7; i >= 0; i--) b.push(i > 3 ? 0 : (bit >>> (i * 8)) & 0xff);
  const r = (x: number, n: number) => (x >>> n) | (x << (32 - n)), w = new Array<number>(64);
  for (let o = 0; o < b.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = (b[o + i * 4] << 24) | (b[o + i * 4 + 1] << 16) | (b[o + i * 4 + 2] << 8) | b[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, bb, c, d, e, f, g, hh] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    [a, bb, c, d, e, f, g, hh].forEach((x, i) => { H[i] = (H[i] + x) | 0; });
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
/** Hash dell'email (minuscola, senza spazi) con cui si confrontano gli account ammessi. */
const hashEmail = (email: string): string => sha256Hex(String(email || '').trim().toLowerCase());
const CARTELLA_APP = 'Calendario personale';
/** Permessi richiesti: si aggiunge Google Calendar solo se lo specchio è attivo. */
function scopeAttuale(): string { try { return G_SCOPE + (imp().gcal ? ' https://www.googleapis.com/auth/calendar.app.created' : '') + (imp().gcalLeggiPrimary ? ' ' + GCAL_SCOPE_LETTURA : ''); } catch (_) { return G_SCOPE; } }
const SOTTOCARTELLE = ['dati', 'allegati', 'backup', 'studio', '_cestino app'] as const;
type NomeSotto = typeof SOTTOCARTELLE[number];

declare const google: any;
declare const gapi: any;

type StatoSync = 'spento' | 'ok' | 'attesa' | 'incorso' | 'errore' | 'offline';

const Drive = (() => {
  let token = '';
  let scadenzaToken = 0;
  let client: any = null;
  let cartelle: Record<string, string> = {};   // nome → id (cache in localStorage)
  let idDati = '';
  let timerSync = 0;
  let inCorso = false;
  const stato = { sync: 'spento' as StatoSync, messaggio: '', email: '', ultimoSync: 0 };
  const ascoltatori: Array<() => void> = [];

  const LS = {
    get<T>(k: string, def: T): T { try { const v = localStorage.getItem('imc-' + k); return v ? JSON.parse(v) : def; } catch (_) { return def; } },
    set(k: string, v: any) { try { localStorage.setItem('imc-' + k, JSON.stringify(v)); } catch (_) { /* niente */ } },
  };
  cartelle = LS.get('cartelle', {});
  idDati = LS.get('idDati', '');
  stato.email = LS.get('email', '');
  stato.ultimoSync = LS.get('ultimoSync', 0);
  if (stato.email) stato.sync = 'attesa';

  function cambia(s: StatoSync, msg = ''): void { stato.sync = s; stato.messaggio = msg; ascoltatori.forEach(f => f()); }

  function script(src: string): Promise<void> {
    return new Promise((ok, ko) => {
      if (document.querySelector('script[src="' + src + '"]')) return ok();
      const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => ok(); s.onerror = () => ko(new Error('Impossibile caricare ' + src));
      document.head.appendChild(s);
    });
  }

  /** Ottiene un token. interattivo=false prova in silenzio (sessione Google già attiva). */
  async function accedi(interattivo: boolean): Promise<boolean> {
    await script('https://accounts.google.com/gsi/client');
    return new Promise(ok => {
      if (!client) client = google.accounts.oauth2.initTokenClient({ client_id: G_CLIENT_ID, scope: G_SCOPE, callback: () => { /* impostata sotto */ } });
      client.callback = (r: any) => {
        if (r && r.access_token) { token = r.access_token; scadenzaToken = Date.now() + (r.expires_in - 60) * 1000; ok(true); }
        else ok(false);
      };
      client.error_callback = () => ok(false);
      try {
        client.requestAccessToken(interattivo ? { prompt: '', scope: scopeAttuale(), login_hint: stato.email || undefined } : { prompt: 'none', scope: scopeAttuale(), login_hint: stato.email || undefined });
      } catch (_) { ok(false); }
    });
  }

  /** v0.56.1: consenso incrementale (es. calendar.events.readonly per il wizard BP4). Chiede a Google lo scope attuale
   *  con popup; se l'utente rifiuta, il token Drive già valido resta quello di prima (accedi lo sostituisce solo in caso di successo). */
  function ampliaPermessi(): Promise<boolean> { return accedi(true); }

  async function tokenValido(interattivo = false): Promise<string> {
    if (token && Date.now() < scadenzaToken) return token;
    if (await accedi(false)) return token;
    if (interattivo && await accedi(true)) return token;
    return '';
  }

  /** Chiamata REST a Drive. Rilancia l'errore con testo leggibile. */
  async function api(percorso: string, opz: RequestInit & { query?: Record<string, string> } = {}, base = 'https://www.googleapis.com/drive/v3/'): Promise<any> {
    const t = await tokenValido(false);
    if (!t) throw new Error('NOLOGIN');
    const url = new URL(base + percorso);
    if (opz.query) for (const k in opz.query) url.searchParams.set(k, opz.query[k]);
    const r = await fetch(url.toString(), { ...opz, headers: { Authorization: 'Bearer ' + t, ...(opz.headers || {}) } });
    if (r.status === 401) { token = ''; throw new Error('NOLOGIN'); }
    if (!r.ok) { const txt = await r.text(); throw new Error('Drive ' + r.status + ': ' + txt.slice(0, 200)); }
    if ((opz.query && opz.query.alt === 'media') || percorso.endsWith('/export')) return r; // download: restituisco la Response grezza
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : r;
  }

  async function chiSono(): Promise<string> {
    const r = await api('', { }, 'https://www.googleapis.com/oauth2/v3/userinfo');
    return r.email || '';
  }

  /** Trova (o crea) una cartella per nome dentro `parent`. */
  async function cartella(nome: string, parent: string): Promise<string> {
    const q = "name = '" + nome.replace(/'/g, "\\'") + "' and mimeType = 'application/vnd.google-apps.folder' and '" + parent + "' in parents and trashed = false";
    const r = await api('files', { query: { q, fields: 'files(id,name)', spaces: 'drive' } });
    if (r.files && r.files.length) return r.files[0].id;
    const c = await api('files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }), query: { fields: 'id' } });
    return c.id;
  }
  async function preparaCartelle(): Promise<void> {
    if (cartelle.app && cartelle['_cestino app']) return;
    const app = await cartella(CARTELLA_APP, 'root');
    const nuove: Record<string, string> = { app };
    for (const n of SOTTOCARTELLE) nuove[n] = await cartella(n, app);
    cartelle = nuove; LS.set('cartelle', cartelle);
  }
  function idCartella(n: NomeSotto | 'app'): string { return cartelle[n]; }
  /** v0.21: sottocartella dell'app creata al bisogno (es. «Appunti»), ricordata in locale. */
  async function sottocartella(nome: string): Promise<string> {
    await preparaCartelle();
    if (!cartelle[nome]) { cartelle[nome] = await cartella(nome, cartelle.app); LS.set('cartelle', cartelle); }
    return cartelle[nome];
  }

  /** Carica (crea o aggiorna) un file; contenuto testo o Blob. Ritorna l'id. */
  async function carica(nome: string, parent: string, contenuto: Blob | string, mime: string, idEsistente?: string): Promise<string> {
    const meta = idEsistente ? { name: nome } : { name: nome, parents: [parent] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', contenuto instanceof Blob ? contenuto : new Blob([contenuto], { type: mime }));
    const r = await api('files' + (idEsistente ? '/' + idEsistente : ''), { method: idEsistente ? 'PATCH' : 'POST', body: form, query: { uploadType: 'multipart', fields: 'id,name,size,modifiedTime' } }, 'https://www.googleapis.com/upload/drive/v3/');
    return r.id;
  }
  async function scaricaTesto(id: string): Promise<string> {
    const r: Response = await api('files/' + id, { query: { alt: 'media' } });
    return r.text();
  }
  async function scaricaBlob(id: string): Promise<Blob> {
    const r: Response = await api('files/' + id, { query: { alt: 'media' } });
    return r.blob();
  }
  async function trovaFile(nome: string, parent: string): Promise<{ id: string; modifiedTime: string } | null> {
    const q = "name = '" + nome.replace(/'/g, "\\'") + "' and '" + parent + "' in parents and trashed = false";
    const r = await api('files', { query: { q, fields: 'files(id,name,modifiedTime)', orderBy: 'modifiedTime desc' } });
    return r.files && r.files[0] || null;
  }
  async function elenca(parent: string, extra = ''): Promise<any[]> {
    const r = await api('files', { query: { q: "'" + parent + "' in parents and trashed = false" + extra, fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)', orderBy: 'name', pageSize: '200' } });
    return r.files || [];
  }
  /** Elenco completo (tutte le pagine) dei file di una cartella. */
  async function elencaTutti(parent: string): Promise<{ id: string; name: string }[]> {
    const out: { id: string; name: string }[] = []; let pageToken = '';
    do {
      const query: Record<string, string> = { q: "'" + parent + "' in parents and trashed = false", fields: 'nextPageToken,files(id,name)', pageSize: '1000' };
      if (pageToken) query.pageToken = pageToken;
      const r = await api('files', { query }); out.push(...(r.files || [])); pageToken = r.nextPageToken || '';
    } while (pageToken);
    return out;
  }
  /** Cerca file nel Drive (sola lettura): per nome, opzionalmente per tipo. Più recenti prima. */
  async function cerca(testo: string, mime?: string): Promise<{ id: string; name: string; mimeType: string; webViewLink: string; modifiedTime: string }[]> {
    // v0.18: con mime = cartella cerca solo cartelle (import di mazzi), altrimenti solo file
    let q = "trashed = false";
    q += mime ? " and mimeType = '" + mime + "'" : " and mimeType != 'application/vnd.google-apps.folder'";
    if (testo.trim()) q += " and name contains '" + testo.trim().replace(/\\/g, '').replace(/'/g, "\\'") + "'";
    const r = await api('files', { query: { q, fields: 'files(id,name,mimeType,webViewLink,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: '40' } });
    return r.files || [];
  }
  /** v0.18: contenuto di una cartella con tipo e data (sottocartelle incluse), per importare i mazzi. */
  async function elencaCompleti(parent: string): Promise<{ id: string; name: string; mimeType: string; modifiedTime: string }[]> {
    const out: { id: string; name: string; mimeType: string; modifiedTime: string }[] = []; let pageToken = '';
    do {
      const query: Record<string, string> = { q: "'" + parent + "' in parents and trashed = false", fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)', pageSize: '1000' };
      if (pageToken) query.pageToken = pageToken;
      const r = await api('files', { query });
      out.push(...(r.files || [])); pageToken = r.nextPageToken || '';
    } while (pageToken);
    return out;
  }
  /** v0.11: cerca cartelle per nome (sola lettura). */
  async function cercaCartelle(testo: string): Promise<{ id: string; name: string }[]> {
    const q = "trashed = false and mimeType = 'application/vnd.google-apps.folder' and name contains '" + testo.replace(/'/g, "\\'") + "'";
    const r = await api('files', { query: { q, fields: 'files(id,name)', pageSize: '20' } });
    return r.files || [];
  }
  /** Esporta un Google Sheet (primo foglio) come CSV. */
  async function esportaCsv(id: string): Promise<string> { const r: Response = await api('files/' + id + '/export', { query: { mimeType: 'text/csv' } }); return r.text(); }
  /** Mai eliminare: sposta nel cestino dell'app. */
  async function cestinaApp(id: string, daParent: string): Promise<void> {
    await api('files/' + id, { method: 'PATCH', query: { addParents: cartelle['_cestino app'], removeParents: daParent, fields: 'id' } });
  }

  // ---------- Backup giornaliero ----------
  async function backupSeServe(testoAttuale: string): Promise<void> {
    const oggiK = ymd(new Date());
    if (LS.get('ultimoBackup', '') === oggiK) return;
    const dir = idCartella('backup');
    // un altro dispositivo può averlo già fatto oggi: controllo su Drive
    if (await trovaFile('dati-' + oggiK + '.json', dir)) { LS.set('ultimoBackup', oggiK); return; }
    await carica('dati-' + oggiK + '.json', dir, testoAttuale, 'application/json');
    LS.set('ultimoBackup', oggiK);
    // conservo gli ultimi 30: i più vecchi vanno in _cestino app (mai eliminati)
    const tutti = (await elenca(dir, " and name contains 'dati-'")).sort((a, b) => a.name < b.name ? 1 : -1);
    for (const f of tutti.slice(30)) await cestinaApp(f.id, dir);
  }

  // ---------- Sincronizzazione ----------
  /** v0.49: schema dei dati che questa app sa scrivere (nell'involucro di dati.json, accanto a versione:1). */
  const SCHEMA = 2;
  let avvisatoVersione = false;
  /** Firma del file su Drive: cambia a ogni scrittura, di qualunque dispositivo. */
  async function firmaDati(id: string): Promise<string> {
    const m = await api('files/' + id, { query: { fields: 'version,modifiedTime' } });
    return String(m.version || '') + '|' + String(m.modifiedTime || '');
  }
  async function sincronizza(forzaLogin = false): Promise<void> {
    if (inCorso) return;
    if (!navigator.onLine) { cambia('offline', 'Sei offline: le modifiche partiranno appena torna la rete.'); return; }
    inCorso = true;
    cambia('incorso');
    try {
      if (!await tokenValido(forzaLogin)) throw new Error('NOLOGIN');
      if (!stato.email) {
        const email = await chiSono();
        const hh = hashEmail(email);
        if (!HASH_AMMESSI.includes(hh)) {
          try { google.accounts.oauth2.revoke(token, () => { /* ok */ }); } catch (_) { /* niente */ }
          token = '';
          throw new Error('Questa app è privata: l\'account ' + email + ' non è autorizzato.');
        }
        // v0.44 privacy: se su questo dispositivo c'erano i dati di un altro account, si cancellano PRIMA di unire
        await Privacy.primaDiUnire(email);
        stato.email = email; LS.set('email', stato.email);
        if (typeof Studio !== 'undefined') { if (hh !== HASH_PROPRIETARIO) Studio.togliSito(); else Studio.caricaDalSito(); }
      }
      await preparaCartelle();

      if (!idDati) { const f = await trovaFile('dati.json', idCartella('dati')); if (f) { idDati = f.id; LS.set('idDati', idDati); } }
      let solaLettura = false;
      // v0.49: scarica → unisci → (prima di caricare) ricontrollo che il file non sia cambiato nel frattempo, max 3 giri
      for (let giro = 0; ; giro++) {
        // 1. scarico il file remoto, con la sua «firma» (version + modifiedTime di Drive)
        let remoti: Rec[] = [];
        let testoRemoto = '', firma = '';
        if (idDati) {
          try { firma = await firmaDati(idDati); testoRemoto = await scaricaTesto(idDati); } catch (e: any) { if (String(e.message).includes('404')) { idDati = ''; LS.set('idDati', ''); firma = ''; } else throw e; }
        }
        if (testoRemoto) {
          let j: any;
          try { j = JSON.parse(testoRemoto); } catch (_) { throw new Error('Il file dati.json su Drive non è leggibile: non lo sovrascrivo.'); }
          remoti = Array.isArray(j) ? j : j.records || [];
          // file scritto da un'app più nuova: lo leggo ma non lo sovrascrivo mai
          if (!Array.isArray(j) && Number(j.schemaVersion) > SCHEMA) solaLettura = true;
        }
        // 2. unisco (vince l'updatedAt più alto, per record)
        // v0.44 privacy: mai unire record di un altro account; dispositivo riconosciuto; pulizia di ciò che non è suo
        if (Privacy.accLocale() !== stato.email.toLowerCase()) await Privacy.primaDiUnire(stato.email);
        remoti = remoti.filter(r => !(r as any).acc || (r as any).acc === stato.email.toLowerCase());
        Stato.unisci(remoti);
        if (!(await Privacy.dispositivo(stato.email))) return;
        await Privacy.pulisciAltrui(stato.email);
        // v0.57 (A14): immagini incorporate → archivio allegati (prima di ricaricare dati.json, così il file resta leggero)
        if (giro === 0 && typeof Allegati !== 'undefined') { try { await Allegati.migra(); if (!solaLettura) await Allegati.caricaInAttesa(); } catch (e) { console.warn('Allegati: sync rimandata', e); } }
        if (solaLettura) break;
        // 3. se ho qualcosa di più nuovo del remoto, ricarico
        const remotiMap = new Map(remoti.map(r => [r.id, r.updatedAt || 0]));
        const miei = Stato.esporta();
        const daSpedire = miei.some(r => (r.updatedAt || 0) > (remotiMap.get(r.id) || 0));
        if (!daSpedire && idDati) break;
        // un altro dispositivo ha scritto dopo il mio download? riscarico e riunisco invece di sovrascriverlo
        if (idDati && firma && giro < 3 && await firmaDati(idDati) !== firma) continue;
        if (testoRemoto) await backupSeServe(testoRemoto);
        const testo = JSON.stringify({ formato: 'il-mio-calendario', versione: 1, schemaVersion: SCHEMA, salvatoIl: new Date().toISOString(), records: miei });
        idDati = await carica('dati.json', idCartella('dati'), testo, 'application/json', idDati || undefined);
        LS.set('idDati', idDati);
        break;
      }
      applicaTema();
      if (solaLettura) {
        cambia('errore', "Aggiorna l'app: i dati su Drive sono di una versione più nuova. Le modifiche di qui restano su questo dispositivo finché non aggiorni.");
        if (!avvisatoVersione) { avvisatoVersione = true; avviso("Aggiorna l'app: i dati su Drive vengono da una versione più nuova. Tocca per ricaricare.", 0, () => location.reload()); }
        return;
      }
      stato.ultimoSync = Date.now(); LS.set('ultimoSync', stato.ultimoSync);
      cambia('ok');
      if (typeof GCal !== 'undefined' && GCal.attivo()) GCal.allinea().catch(e => { if (String(e.message).includes('403') || String(e.message) === 'NOLOGIN') cambia('attesa', 'Tocca per autorizzare Google Calendar.'); });
    } catch (e: any) {
      const m = String(e && e.message || e);
      if (m === 'NOLOGIN') cambia(stato.email ? 'attesa' : 'spento', stato.email ? 'Tocca per accedere di nuovo a Google.' : '');
      else if (m.includes('Failed to fetch')) cambia('offline', 'Rete assente o Google non raggiungibile.');
      else cambia('errore', m);
    } finally { inCorso = false; }
  }

  /** Sync "a breve": dopo una modifica aspetto 3 s per raggruppare. */
  function programma(): void {
    if (!stato.email) return;
    clearTimeout(timerSync);
    if (stato.sync !== 'incorso') cambia('attesa');
    timerSync = window.setTimeout(() => sincronizza(false), 3000);
  }

  /** Precarica la libreria Google, così al tocco il popup si apre subito. */
  function precarica(): void {
    script('https://accounts.google.com/gsi/client').then(() => {
      if (!client) client = google.accounts.oauth2.initTokenClient({ client_id: G_CLIENT_ID, scope: G_SCOPE, callback: () => { /* impostata dopo */ } });
    }).catch(() => { /* offline */ });
  }
  /** DA CHIAMARE DIRETTAMENTE DAL TOCCO (niente await prima): apre il popup Google. */
  function login(): void {
    if (!client) { precarica(); avviso('Sto caricando Google… tocca di nuovo tra un secondo.'); return; }
    const primaVolta = !stato.email;
    client.callback = async (r: any) => {
      if (!r || !r.access_token) { cambia('errore', 'Accesso annullato o non riuscito.'); return; }
      token = r.access_token; scadenzaToken = Date.now() + (r.expires_in - 60) * 1000;
      if (primaVolta) stato.email = '';
      await sincronizza(false);
      if (stato.sync === 'ok' && primaVolta) avviso('Collegato a Google Drive come ' + stato.email);
    };
    client.error_callback = (e: any) => cambia('errore', e && e.type === 'popup_failed_to_open'
      ? 'Il browser ha bloccato la finestra di Google: consenti i popup per questo sito e riprova.'
      : 'Finestra di Google chiusa.');
    client.requestAccessToken({ prompt: primaVolta ? 'select_account' : '', scope: scopeAttuale(), login_hint: stato.email || undefined });
  }
  /** v0.57 (A6): al cambio account le cartelle e dati.json in cache sono dell'account precedente. */
  function dimenticaCartelle(): void { cartelle = {}; idDati = ''; LS.set('cartelle', {}); LS.set('idDati', ''); }
  function logout(): void {
    if (token) { try { google.accounts.oauth2.revoke(token, () => { /* ok */ }); } catch (_) { /* niente */ } }
    token = ''; stato.email = ''; stato.ultimoSync = 0;
    LS.set('email', ''); LS.set('ultimoSync', 0);
    cambia('spento');
  }

  // ---------- Allegati ----------
  async function caricaAllegato(file: File, parent?: string): Promise<Allegato> {
    if (!await tokenValido(true)) throw new Error('Accedi a Google per caricare allegati.');
    await preparaCartelle();
    const id = await carica(file.name, parent || idCartella('allegati'), file, file.type || 'application/octet-stream');
    return { id: uid(), nome: file.name, driveId: id, mime: file.type, url: 'https://drive.google.com/file/d/' + id + '/view' };
  }
  /** Google Picker per scegliere un file esistente (lo rende accessibile all'app). */
  async function scegliConPicker(opz: { cartelle?: boolean; multi?: boolean; mime?: string } = {}): Promise<{ id: string; name: string; mimeType: string; url: string }[]> {
    const t = await tokenValido(true);
    if (!t) throw new Error('Accedi a Google prima.');
    await script('https://apis.google.com/js/api.js');
    await new Promise<void>(ok => gapi.load('picker', () => ok()));
    return new Promise(ok => {
      const vista = new google.picker.DocsView(opz.cartelle ? google.picker.ViewId.FOLDERS : google.picker.ViewId.DOCS)
        .setIncludeFolders(true).setParent('root');
      if (opz.cartelle) vista.setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder');
      if (opz.mime) vista.setMimeTypes(opz.mime);
      let b = new google.picker.PickerBuilder()
        .setOAuthToken(t).setDeveloperKey(G_API_KEY).setAppId(G_APP_ID)
        .setLocale('it').setTitle(opz.cartelle ? 'Scegli una cartella' : 'Scegli un file')
        .addView(vista)
        .setCallback((d: any) => {
          if (d.action === google.picker.Action.PICKED) ok((d.docs || []).map((x: any) => ({ id: x.id, name: x.name, mimeType: x.mimeType, url: x.url })));
          else if (d.action === google.picker.Action.CANCEL) ok([]);
        });
      if (opz.multi) b = b.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
      if (!opz.cartelle) b = b.enableFeature(google.picker.Feature.NAV_HIDDEN);
      b.build().setVisible(true);
    });
  }

  window.addEventListener('online', () => { if (stato.email) sincronizza(false); });

  return {
    stato, ascolta(f: () => void) { ascoltatori.push(f); },
    sincronizza, programma, login, logout, precarica, ampliaPermessi,
    caricaAllegato, scegliConPicker, dimenticaCartelle, scaricaBlob, scaricaTesto, elenca, trovaFile, carica, idCartella, sottocartella, preparaCartelle, tokenValido,
    elencaTutti, elencaCompleti, esportaCsv, cerca, cercaCartelle, api,
    get collegato() { return !!stato.email; },
    /** v0.26: proprietario dell'app, o nessun account ancora collegato (anteprima, primo avvio). */
    eProprietario(): boolean { return stato.email ? hashEmail(stato.email) === HASH_PROPRIETARIO : (['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:'); },  // v0.26.2: senza account solo in prova locale
    /** true se c'è un token valido adesso (senza aprire finestre). */
    get pronto() { return !!token && Date.now() < scadenzaToken; },
  };
})();

/** Apre un allegato: link Drive in una nuova scheda (il viewer in-app arriva con la Fase 3). */
function apriAllegato(a: Allegato): void {
  const url = a.url || (a.driveId ? 'https://drive.google.com/file/d/' + a.driveId + '/view' : '');
  if (url) window.open(url, '_blank', 'noopener');
}

/** Testo e colore dell'indicatore di stato sync. */
function descrSync(): { testo: string; cls: string } {
  const s = Drive.stato;
  switch (s.sync) {
    case 'spento': return { testo: 'Drive non collegato', cls: 'sync-spento' };
    case 'ok': return { testo: 'Sincronizzato' + (s.ultimoSync ? ' · ' + hm(new Date(s.ultimoSync)) : ''), cls: 'sync-ok' };
    case 'attesa': return { testo: s.messaggio || 'In attesa di sincronizzazione', cls: 'sync-attesa' };
    case 'incorso': return { testo: 'Sincronizzo…', cls: 'sync-attesa' };
    case 'offline': return { testo: 'Offline · modifiche in coda', cls: 'sync-attesa' };
    default: return { testo: 'Errore sync: ' + s.messaggio, cls: 'sync-errore' };
  }
}

/**
 * Selettore di file del Drive dentro l'app (sostituisce il Google Picker, che richiede la chiave API).
 * Usa solo il login: cerca per nome tra i tuoi file. Restituisce i file scelti (vuoto se annulli).
 */
function scegliFileDrive(opz: { mime?: string; multi?: boolean; titolo?: string } = {}): Promise<{ id: string; name: string; mimeType: string; url: string }[]> {
  return new Promise(ok => {
    const scelti = new Map<string, { id: string; name: string; mimeType: string; url: string }>();
    const lista = h('div.lista-file');
    const campo = h('input.rapido', { type: 'search', placeholder: 'Cerca per nome…', oninput: () => { clearTimeout(timer); timer = window.setTimeout(carica, 350); } }) as HTMLInputElement;
    let timer = 0, giro = 0, finito = false;
    const fine = (v: { id: string; name: string; mimeType: string; url: string }[]) => { if (finito) return; finito = true; ok(v); };
    async function carica(): Promise<void> {
      const mio = ++giro; svuota(lista); lista.appendChild(h('div.vuoto', null, 'Cerco…'));
      try {
        const f = await Drive.cerca(campo.value, opz.mime); if (mio !== giro) return;
        svuota(lista);
        if (!f.length) lista.appendChild(h('div.vuoto', null, 'Nessun file trovato.'));
        for (const x of f) {
          const v = { id: x.id, name: x.name, mimeType: x.mimeType, url: x.webViewLink || 'https://drive.google.com/file/d/' + x.id + '/view' };
          const el = h('button.voce-lista' + (scelti.has(x.id) ? '.scelto' : ''), { onclick: () => {
            if (!opz.multi) { fs.chiudi(); fine([v]); return; }
            if (scelti.has(x.id)) scelti.delete(x.id); else scelti.set(x.id, v);
            el.classList.toggle('scelto', scelti.has(x.id));
          } }, h('span.voce-corpo', null, h('span.voce-titolo', null, x.name), h('span.voce-sotto', null, fmt(new Date(x.modifiedTime), { day: 'numeric', month: 'short', year: 'numeric' }))));
          lista.appendChild(el);
        }
      } catch (e: any) { svuota(lista); lista.appendChild(h('div.vuoto', null, String(e.message || e))); }
    }
    const fs = foglio({ titolo: opz.titolo || 'Scegli dal Drive', corpo: h('div.modulo', null, campo, lista),
      etichettaSalva: opz.multi ? 'Aggiungi' : undefined,
      salva: opz.multi ? () => { fine(Array.from(scelti.values())); } : undefined });
    // chiusura con Annulla / tocco fuori: risolvo con vuoto
    const oss = new MutationObserver(() => { if (!document.body.contains(lista)) { oss.disconnect(); fine([]); } });
    oss.observe(document.body, { childList: true });
    carica(); setTimeout(() => campo.focus(), 50);
  });
}
