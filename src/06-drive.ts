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
// Privacy "solo mia": l'app accetta solo questo account (oltre al blocco lato Google: progetto in Testing con un solo utente di test).
// v0.26: due account ammessi. Il proprietario vede anche il programma pubblicato col sito (Medicina);
// il secondo account parte vuoto e riceve i suoi pacchetti dalla sua cartella Drive. Per ammettere
// la seconda persona: scrivere il suo Gmail in SECONDO_ACCOUNT (minuscolo) e ripubblicare; deve
// anche essere tra gli «utenti di prova» del progetto Google Cloud (vedi docs/SECONDA-PERSONA.md).
const PROPRIETARIO = 'cocco.haloa@gmail.com';
const SECONDO_ACCOUNT = '';
const ACCOUNT_AMMESSI = [PROPRIETARIO, SECONDO_ACCOUNT].filter(Boolean);
const CARTELLA_APP = 'Calendario personale';
/** Permessi richiesti: si aggiunge Google Calendar solo se lo specchio è attivo. */
function scopeAttuale(): string { try { return G_SCOPE + (imp().gcal ? ' https://www.googleapis.com/auth/calendar.app.created' : ''); } catch (_) { return G_SCOPE; } }
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
  async function sincronizza(forzaLogin = false): Promise<void> {
    if (inCorso) return;
    if (!navigator.onLine) { cambia('offline', 'Sei offline: le modifiche partiranno appena torna la rete.'); return; }
    inCorso = true;
    cambia('incorso');
    try {
      if (!await tokenValido(forzaLogin)) throw new Error('NOLOGIN');
      if (!stato.email) {
        const email = await chiSono();
        if (!ACCOUNT_AMMESSI.includes(email.toLowerCase())) {
          try { google.accounts.oauth2.revoke(token, () => { /* ok */ }); } catch (_) { /* niente */ }
          token = '';
          throw new Error('Questa app è privata: l\'account ' + email + ' non è autorizzato.');
        }
        stato.email = email; LS.set('email', stato.email);
        if (email.toLowerCase() !== PROPRIETARIO && typeof Studio !== 'undefined') Studio.togliSito();
      }
      await preparaCartelle();

      // 1. scarico il file remoto
      let remoti: Rec[] = [];
      if (!idDati) { const f = await trovaFile('dati.json', idCartella('dati')); if (f) { idDati = f.id; LS.set('idDati', idDati); } }
      let testoRemoto = '';
      if (idDati) {
        try { testoRemoto = await scaricaTesto(idDati); } catch (e: any) { if (String(e.message).includes('404')) { idDati = ''; LS.set('idDati', ''); } else throw e; }
      }
      if (testoRemoto) {
        try { const j = JSON.parse(testoRemoto); remoti = Array.isArray(j) ? j : j.records || []; } catch (_) { throw new Error('Il file dati.json su Drive non è leggibile: non lo sovrascrivo.'); }
      }
      // 2. unisco (vince l'updatedAt più alto, per record)
      Stato.unisci(remoti);
      // 3. se ho qualcosa di più nuovo del remoto, ricarico
      const remotiMap = new Map(remoti.map(r => [r.id, r.updatedAt || 0]));
      const miei = Stato.esporta();
      const daSpedire = miei.some(r => (r.updatedAt || 0) > (remotiMap.get(r.id) || 0));
      if (daSpedire || !idDati) {
        if (testoRemoto) await backupSeServe(testoRemoto);
        const testo = JSON.stringify({ formato: 'il-mio-calendario', versione: 1, salvatoIl: new Date().toISOString(), records: miei });
        idDati = await carica('dati.json', idCartella('dati'), testo, 'application/json', idDati || undefined);
        LS.set('idDati', idDati);
      }
      stato.ultimoSync = Date.now(); LS.set('ultimoSync', stato.ultimoSync);
      applicaTema();
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
    sincronizza, programma, login, logout, precarica,
    caricaAllegato, scegliConPicker, scaricaBlob, scaricaTesto, elenca, trovaFile, carica, idCartella, preparaCartelle, tokenValido,
    elencaTutti, elencaCompleti, esportaCsv, cerca, cercaCartelle,
    get collegato() { return !!stato.email; },
    /** v0.26: proprietario dell'app, o nessun account ancora collegato (anteprima, primo avvio). */
    eProprietario(): boolean { return !stato.email || stato.email.toLowerCase() === PROPRIETARIO; },
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
