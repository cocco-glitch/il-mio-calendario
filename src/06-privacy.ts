// =====================================================================
// 06-privacy.ts — v0.44 I DATI DI UN ACCOUNT NON FINISCONO MAI IN UN ALTRO
// Problema: i dati del proprietario ricomparivano nell'app di un altro account (es. dispositivo usato
// prima da lui, programma del sito, pacchetti trovati nel Drive condiviso) e, una volta uniti, venivano
// risalvati nel Drive dell'altro → ricomparivano a ogni sincronizzazione.
// Rimedio (identità = account Google, già con login: nessuna password nuova da ricordare):
//  1) ogni record porta l'account a cui appartiene («acc»), stampato a ogni salvataggio;
//  2) il dispositivo ricorda di chi sono i dati locali («accLocale»): se accede un ALTRO account, i dati
//     locali si cancellano PRIMA di unirli (quelli del proprietario restano al sicuro nel suo Drive);
//  3) a ogni sincronizzazione di un account non proprietario si eliminano (con lapide, quindi anche dal
//     suo Drive e dagli altri suoi dispositivi) i record di un altro account e quelli derivati dal programma
//     del proprietario (pacchetti del sito, progressi, statistiche e modifiche delle sue schede);
//  4) la ricerca dei pacchetti guarda solo i file DI PROPRIETÀ dell'account (non quelli condivisi con lui);
//  5) «Dispositivi riconosciuti»: ogni dispositivo si registra (nome, ultimo accesso). Da Altro → Dati
//     si può scollegare un dispositivo: alla prossima apertura cancella i dati locali ed esce dall'account.
//     Uscendo dall'account si può anche cancellare subito tutto da questo dispositivo.
// =====================================================================

interface Dispositivo extends Rec { type: 'dispositivo'; nome: string; ua: string; primo: string; ultimo: string; revocato?: boolean; }

const Privacy = (() => {
  const KLOC = 'imc-accLocale', KDEV = 'imc-dispositivo';
  const accLocale = (): string => { try { return JSON.parse(localStorage.getItem(KLOC) || '""'); } catch (_) { return ''; } };
  const setAcc = (e: string) => { try { localStorage.setItem(KLOC, JSON.stringify(e.toLowerCase())); } catch (_) { /* */ } };
  function idDispositivo(): string {
    let id = ''; try { id = localStorage.getItem(KDEV) || ''; } catch (_) { /* */ }
    if (!id) { id = 'dev-' + uid(); try { localStorage.setItem(KDEV, id); } catch (_) { /* */ } }
    return id;
  }
  function nomeDispositivo(): string {
    const u = navigator.userAgent;
    const tipo = /iPad|Macintosh.*Mobile|Macintosh(?=.*Safari)(?=.*Version)/.test(u) && navigator.maxTouchPoints > 1 ? 'iPad' : /iPhone/.test(u) ? 'iPhone' : /Android/.test(u) ? (/Mobile/.test(u) ? 'Telefono Android' : 'Tablet Android') : /Windows/.test(u) ? 'PC Windows' : /Mac/.test(u) ? 'Mac' : 'Dispositivo';
    const br = /Edg\//.test(u) ? 'Edge' : /CriOS|Chrome/.test(u) ? 'Chrome' : /FxiOS|Firefox/.test(u) ? 'Firefox' : /Safari/.test(u) ? 'Safari' : '';
    return tipo + (br ? ' · ' + br : '');
  }
  // v0.57 (A6): l'isolamento vale anche per localStorage e Cache Storage, non solo per i record.
  // SENSIBILI = segreti e tracce dell'account (via anche con «Esci soltanto»); al cambio account o con
  // «Esci e cancella» va via tutto tranne le preferenze del dispositivo in TIENI.
  const SENSIBILI = ['imc-ai-keys', 'imc-groq-chiave', 'imc-gemini-chiave', 'imc-ai-uso', 'imc-gcal-inviati'];
  const TIENI = new Set([KDEV, 'imc-records', 'pref-mano', 'imc-quiz-modo']);
  /** Toglie da localStorage le chiavi dell'account. tutto=false: solo SENSIBILI. Restituisce quante ne ha tolte. */
  function pulisciLocalStorage(tutto: boolean): number {
    const via: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (SENSIBILI.includes(k) || (tutto && !TIENI.has(k) && /^(imc-|trova-)/.test(k))) via.push(k);
      }
      via.forEach(k => localStorage.removeItem(k));
    } catch (e) { console.warn('Privacy: localStorage non pulito', e); }
    return via.length;
  }
  /** Cancella anche i PDF dei libri in Cache Storage (sono file del Drive dell'account precedente). */
  async function pulisciCache(): Promise<void> {
    try { if (typeof caches !== 'undefined') await caches.delete('imc-pdf'); } catch (e) { console.warn('Privacy: cache PDF non cancellata', e); }
    try { if (typeof caches !== 'undefined') await caches.delete('imc-testo-pdf'); } catch (e) { console.warn('Privacy: cache del testo PDF non cancellata', e); }   // blocco 2 (TestoPdf.tutte)
  }
  /** Tutto ciò che appartiene all'account precedente, su questo dispositivo. */
  async function svuotaAccount(): Promise<void> {
    await Stato.svuotaLocale(); pulisciLocalStorage(true); await pulisciCache(); if (typeof Allegati !== 'undefined') await Allegati.svuota();
    // P0-A: la coda quiz è solo locale. Va eliminata al cambio account anche se il chunk
    // strumenti-quiz non è mai stato caricato in questa sessione.
    if (typeof CodaQuiz !== 'undefined') await CodaQuiz.svuotaTutto();
    else await new Promise<void>(ok => {
      try {
        // Non usare deleteDatabase: un'altra scheda aperta lo bloccherebbe lasciando i dati intatti.
        const rq = indexedDB.open('imc-coda-quiz');
        rq.onupgradeneeded = () => {
          if (!rq.result.objectStoreNames.contains('lavori')) rq.result.createObjectStore('lavori', { keyPath: ['account', 'id'] });
          if (!rq.result.objectStoreNames.contains('lease')) rq.result.createObjectStore('lease', { keyPath: 'account' });
        };
        rq.onsuccess = () => {
          const d = rq.result, tx = d.transaction(['lavori', 'lease'], 'readwrite');
          tx.objectStore('lavori').clear(); tx.objectStore('lease').clear();
          const fine = () => { d.close(); ok(); }; tx.oncomplete = fine; tx.onerror = fine; tx.onabort = fine;
        };
        rq.onerror = () => ok(); rq.onblocked = () => ok();
      } catch (_) { ok(); }
    });
    if (typeof Drive !== 'undefined' && Drive.dimenticaCartelle) Drive.dimenticaCartelle();
  }
  /** Chiamata appena si conosce l'account del login, PRIMA di unire i dati remoti. */
  async function primaDiUnire(email: string): Promise<boolean> {
    const e = email.toLowerCase(), prec = accLocale();
    let svuotato = false;
    if (prec && prec !== e) { await svuotaAccount(); svuotato = true; }
    else if (!prec) {
      // dispositivo di una versione precedente: tolgo i record marcati con un altro account
      const altrui = Stato.esporta().filter(r => (r as any).acc && (r as any).acc !== e).map(r => r.id);
      if (altrui.length) await Stato.togliLocale(altrui);
    }
    setAcc(e);
    return svuotato;
  }
  /** Id delle schede, dei sotto-step e dei pacchetti del programma del proprietario (dal sito). */
  let idSito: Promise<{ pk: Set<string>; voci: Set<string>; titoli: Set<string> }> | null = null;
  function caricaIdSito() {
    if (!idSito) idSito = (async () => {
      const pk = new Set<string>(), voci = new Set<string>(), titoli = new Set<string>();
      try {
        const r = await fetch('studio/indice.json', { cache: 'no-cache' }); if (!r.ok) return { pk, voci, titoli };
        for (const f of await r.json() as string[]) {
          const p = await fetch('studio/' + f, { cache: 'no-cache' }); if (!p.ok) continue; const c = await p.json(); pk.add(c.id);
          for (const m of c.materie || []) for (const ss of m.sottostep || []) { voci.add(ss.k); for (const mi of ss.microstep || []) for (const s of mi.schede || []) { voci.add(s.id); titoli.add(norm(s.titolo)); } }
        }
      } catch (_) { /* offline */ }
      if (!pk.size) idSito = null;   // offline: riprovo la prossima volta
      return { pk, voci, titoli };
    })();
    return idSito;
  }
  /** Per un account NON proprietario: elimina (con lapide → anche dal suo Drive) ciò che è del proprietario. */
  async function pulisciAltrui(email: string): Promise<number> {
    const e = email.toLowerCase();
    if (!e || hashEmail(e) === HASH_PROPRIETARIO) return 0;   // v0.57: confronto su hash dell'email ricevuta (non dell'account in sessione)
    const s = await caricaIdSito(); let n = 0;
    const togli = (r: Rec) => { Stato.elimina(r.id); n++; };
    for (const r0 of Stato.esporta()) {
      const r: any = r0; if (r.deleted) continue;
      if (r.type === 'impostazioni' || r.type === 'categoria') { if (r.acc && r.acc !== e && r.type === 'impostazioni') { const d0 = predefiniti()[0]; Stato.salva({ ...d0 }); n++; } continue; }   // mai senza impostazioni
      if (r.acc && r.acc !== e) { togli(r); continue; }
      if (r.daSito) { togli(r); continue; }
      if (r.type === 'pacchetto' && r.contenuto && s.pk.has(r.contenuto.id)) { togli(r); continue; }
      if (['progresso', 'statq', 'modq', 'propq', 'ripasso', 'spostamento', 'notascheda'].includes(r.type)) {
        const chiave = String(r.sk || r.id || '').replace(/^(prog|rip|sp|nota|mq|pq|sq)-/, '');
        if (s.voci.has(chiave) || Array.from(s.voci).some(v => v.length > 4 && chiave.startsWith(v + '-') && /^[CBF]-/.test(v))) { togli(r); continue; }
      }
      if (r.type === 'spiegazione' && r.quiz && s.titoli.has(norm(String(r.quiz).split(' — ').pop() || ''))) { togli(r); continue; }
    }
    return n;
  }
  /** Registra/aggiorna questo dispositivo; se è stato scollegato, cancella tutto ed esce. */
  async function dispositivo(email: string): Promise<boolean> {
    const id = idDispositivo(), d = Stato.rec.get(id) as Dispositivo | undefined;
    if (d && !d.deleted && d.revocato) {
      await svuotaAccount();
      Drive.logout(); avviso('Questo dispositivo è stato scollegato dal tuo account: dati locali cancellati.', 10000);
      return false;
    }
    const oggi = new Date().toISOString();
    if (!d || d.deleted || !d.ultimo || Date.now() - Date.parse(d.ultimo) > 6 * 36e5) Stato.salva({ id, type: 'dispositivo', updatedAt: 0, nome: (d && d.nome) || nomeDispositivo(), ua: navigator.userAgent.slice(0, 160), primo: (d && d.primo) || oggi, ultimo: oggi } as Dispositivo, true);
    void email; return true;
  }
  /** Uscita sicura: scollega l'account e (se scelto) cancella tutto da questo dispositivo. */
  async function esci(cancella: boolean): Promise<void> {
    if (cancella) { try { await Drive.sincronizza(false); } catch (e) { console.warn('Privacy: ultima sync non riuscita', e); } await svuotaAccount(); }
    else pulisciLocalStorage(false);   // A6: le chiavi AI non restano a chi usa il dispositivo dopo
    Drive.logout();
    if (cancella) location.reload();
  }
  /** Altro → I miei dati: dispositivi riconosciuti. */
  function sezione(): HTMLElement {
    const mio = idDispositivo();
    const lista = Stato.tutti<Dispositivo>('dispositivo').sort((a, b) => b.ultimo < a.ultimo ? -1 : 1);
    return scheda('Dispositivi riconosciuti',
      h('div.tenue.piccolo', null, 'Solo i dispositivi in cui hai fatto l\'accesso con il tuo account Google vedono i tuoi dati. Se ne scolleghi uno, alla prossima apertura cancellerà i dati e uscirà dall\'account.'),
      ...lista.map(d => h('div.cq-fonte', null, h('span', null, d.id === mio ? '📍' : d.revocato ? '⛔' : '📱'),
        h('span', null, h('b', null, d.nome + (d.id === mio ? ' (questo)' : '')), h('span.tenue.piccolo', null, ' · ultimo accesso ' + new Date(d.ultimo).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (d.revocato ? ' · scollegato' : '')),
          d.id !== mio && !d.revocato ? h('div', null, h('button.btn-testo', { onclick: async () => { if (await chiedi('Scollegare «' + d.nome + '»?', [{ testo: 'Scollega', valore: 'si', pericolo: true }], 'Alla prossima apertura cancellerà i tuoi dati ed uscirà dall\'account.') === 'si') { d.revocato = true; Stato.salva(d); disegna(); } } }, 'Scollega questo dispositivo')) : null))),
      Drive.collegato ? h('div.bottoni', null, h('button.btn.neutro', { onclick: async () => { const s = await chiedi('Uscire dall\'account su questo dispositivo?', [{ testo: 'Esci e cancella i dati da qui', valore: 'via', pericolo: true }, { testo: 'Esci soltanto', valore: 'esci' }], 'I dati restano al sicuro nel tuo Drive.'); if (s) esci(s === 'via'); } }, 'Esci da questo dispositivo')) : null);
  }
  return { primaDiUnire, pulisciAltrui, dispositivo, esci, sezione, idDispositivo, accLocale, pulisciLocalStorage, svuotaAccount };
})();
