// ============================================================
// 07-codaquiz.ts - P0-A: coda locale persistente per la generazione quiz.
// Solo fondazione: nessuna rete e nessuna chiamata AI.
// I lavori vivono in un IndexedDB separato, non entrano in Stato/Drive e sono isolati per account.
// ============================================================

type StatoLavoroQuiz = 'in_coda' | 'in_esecuzione' | 'in_pausa' | 'completato' | 'annullato';
interface SorgenteLavoroQuiz { tipo: 'testo' | 'pdf'; id: string; versione: string; }
interface LavoroQuiz {
  account: string;
  id: string;
  stato: StatoLavoroQuiz;
  tentativi: number;
  sorgente: SorgenteLavoroQuiz;
  specifica: Record<string, unknown>;
  creatoIl: number;
  aggiornatoIl: number;
  prossimoTentativoIl: number | null;
  ultimoErrore: string | null;
}
interface LeaseCodaQuiz { account: string; proprietario: string; scadeIl: number; aggiornatoIl: number; }

const CodaQuiz = (() => {
  const NOME_DB = 'imc-coda-quiz';
  const STORE_LAVORI = 'lavori', STORE_LEASE = 'lease';
  const TERMINALI = new Set<StatoLavoroQuiz>(['completato', 'annullato']);
  const PASSI: Record<StatoLavoroQuiz, StatoLavoroQuiz[]> = {
    in_coda: ['in_esecuzione', 'in_pausa', 'annullato'],
    in_esecuzione: ['in_coda', 'in_pausa', 'completato', 'annullato'],
    in_pausa: ['in_coda', 'annullato'],
    completato: [],
    annullato: [],
  };
  let dbp: Promise<IDBDatabase> | null = null;
  let tab = '';

  function canonico(v: unknown): string {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonico(o[k])).join(',') + '}';
  }
  /** Hash deterministico locale: non espone l'account o il testo nell'ID. */
  function hash(s: string): string {
    let a = 0x811c9dc5, b = 0x9e3779b9 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995); b ^= b >>> 13;
    }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36);
  }
  function accountPulito(account: string): string {
    const a = String(account || '').trim().toLowerCase();
    if (!a) throw new Error('account della coda mancante');
    return a;
  }
  function sorgentePulita(s: SorgenteLavoroQuiz): SorgenteLavoroQuiz {
    if (!s || !['testo', 'pdf'].includes(s.tipo) || !String(s.id || '').trim() || !String(s.versione || '').trim()) throw new Error('sorgente della coda non valida');
    return { tipo: s.tipo, id: String(s.id).trim(), versione: String(s.versione).trim() };
  }
  function idDeterministico(account: string, sorgente: SorgenteLavoroQuiz, specifica: Record<string, unknown>): string {
    return 'cq-' + hash(canonico([accountPulito(account), sorgentePulita(sorgente), specifica || {}]));
  }
  function nuovo(account: string, sorgente: SorgenteLavoroQuiz, specifica: Record<string, unknown>, ora = Date.now()): LavoroQuiz {
    const acc = accountPulito(account), src = sorgentePulita(sorgente), spec = specifica || {};
    return { account: acc, id: idDeterministico(acc, src, spec), stato: 'in_coda', tentativi: 0, sorgente: src, specifica: spec,
      creatoIl: ora, aggiornatoIl: ora, prossimoTentativoIl: null, ultimoErrore: null };
  }
  function cambia(l: LavoroQuiz, stato: StatoLavoroQuiz, ora = Date.now()): LavoroQuiz {
    if (l.stato === stato) return { ...l };
    if (!PASSI[l.stato].includes(stato)) throw new Error('transizione non valida: ' + l.stato + ' -> ' + stato);
    return { ...l, stato, aggiornatoIl: ora };
  }
  function proprietarioTab(): string {
    if (tab) return tab;
    const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    tab = 'tab-' + (c && typeof c.randomUUID === 'function' ? c.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    return tab;
  }
  function accountAttuale(): string {
    const drive = typeof Drive !== 'undefined' && Drive.stato && Drive.stato.email ? String(Drive.stato.email) : '';
    const locale = typeof Privacy !== 'undefined' ? Privacy.accLocale() : '';
    if (drive || locale) return accountPulito(drive || locale);
    return 'ospite:' + (typeof Privacy !== 'undefined' ? Privacy.idDispositivo() : 'locale');
  }

  function db(): Promise<IDBDatabase> {
    if (!dbp) dbp = new Promise<IDBDatabase>((ok, ko) => {
      try {
        const rq = indexedDB.open(NOME_DB, 1);
        rq.onupgradeneeded = () => {
          if (!rq.result.objectStoreNames.contains(STORE_LAVORI)) rq.result.createObjectStore(STORE_LAVORI, { keyPath: ['account', 'id'] });
          if (!rq.result.objectStoreNames.contains(STORE_LEASE)) rq.result.createObjectStore(STORE_LEASE, { keyPath: 'account' });
        };
        rq.onsuccess = () => { rq.result.onversionchange = () => { rq.result.close(); dbp = null; }; ok(rq.result); };
        rq.onerror = () => ko(rq.error || new Error('IndexedDB della coda non disponibile'));
        rq.onblocked = () => ko(new Error('IndexedDB della coda bloccato'));
      } catch (e) { ko(e); }
    }).catch(e => { dbp = null; throw e; });
    return dbp!;
  }
  const chiave = (account: string, id: string): [string, string] => [accountPulito(account), id];
  function tuttiDaStore(st: IDBObjectStore, ok: (x: LavoroQuiz[]) => void, ko: (e: unknown) => void): void {
    const rq = st.getAll(); rq.onsuccess = () => ok((rq.result || []) as LavoroQuiz[]); rq.onerror = () => ko(rq.error);
  }

  /** Inserimento idempotente: stessa sorgente/versione/specifica nello stesso account = stesso lavoro. */
  async function aggiungi(account: string, sorgente: SorgenteLavoroQuiz, specifica: Record<string, unknown>, ora = Date.now()): Promise<LavoroQuiz> {
    const d = await db(), l = nuovo(account, sorgente, specifica, ora);
    return new Promise((ok, ko) => {
      const tx = d.transaction(STORE_LAVORI, 'readwrite'), st = tx.objectStore(STORE_LAVORI), rq = st.get(chiave(l.account, l.id));
      let out = l;
      rq.onsuccess = () => { if (rq.result) out = rq.result as LavoroQuiz; else st.put(l); };
      tx.oncomplete = () => ok(out); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error || new Error('salvataggio della coda annullato'));
    });
  }
  async function lista(account: string): Promise<LavoroQuiz[]> {
    const acc = accountPulito(account), d = await db();
    return new Promise((ok, ko) => tuttiDaStore(d.transaction(STORE_LAVORI).objectStore(STORE_LAVORI), xs => ok(xs.filter(x => x.account === acc).sort((a, b) => a.creatoIl - b.creatoIl || a.id.localeCompare(b.id))), ko));
  }
  async function aggiorna(account: string, id: string, fn: (l: LavoroQuiz) => LavoroQuiz): Promise<LavoroQuiz> {
    const d = await db(), key = chiave(account, id);
    return new Promise((ok, ko) => {
      const tx = d.transaction(STORE_LAVORI, 'readwrite'), st = tx.objectStore(STORE_LAVORI), rq = st.get(key); let out: LavoroQuiz | null = null; let causa: unknown = null;
      rq.onsuccess = () => { if (!rq.result) { causa = new Error('lavoro non trovato'); tx.abort(); return; } try { out = fn(rq.result as LavoroQuiz); st.put(out); } catch (e) { causa = e; tx.abort(); } };
      tx.oncomplete = () => out ? ok(out) : ko(causa || new Error('lavoro non trovato'));
      tx.onerror = () => ko(causa || tx.error); tx.onabort = () => ko(causa || tx.error || new Error('aggiornamento annullato'));
    });
  }
  const pausa = (account: string, id: string, ora = Date.now()) => aggiorna(account, id, l => cambia(l, 'in_pausa', ora));
  const riprendi = (account: string, id: string, ora = Date.now()) => aggiorna(account, id, l => cambia(l, 'in_coda', ora));
  const annulla = (account: string, id: string, ora = Date.now()) => aggiorna(account, id, l => TERMINALI.has(l.stato) ? { ...l } : cambia(l, 'annullato', ora));
  const completa = (account: string, id: string, ora = Date.now()) => aggiorna(account, id, l => cambia(l, 'completato', ora));
  function rimanda(account: string, id: string, errore: string, prossimoTentativoIl: number, ora = Date.now()): Promise<LavoroQuiz> {
    return aggiorna(account, id, l => ({ ...cambia(l, 'in_coda', ora), tentativi: l.tentativi + 1, ultimoErrore: String(errore || 'errore sconosciuto'), prossimoTentativoIl }));
  }
  async function elimina(account: string, id: string): Promise<boolean> {
    const d = await db(), key = chiave(account, id);
    return new Promise((ok, ko) => {
      const tx = d.transaction(STORE_LAVORI, 'readwrite'), st = tx.objectStore(STORE_LAVORI), rq = st.get(key); let tolto = false; let causa: unknown = null;
      rq.onsuccess = () => {
        const l = rq.result as LavoroQuiz | undefined; if (!l) return;
        if (!TERMINALI.has(l.stato)) { causa = new Error('prima annulla o completa il lavoro'); tx.abort(); return; }
        st.delete(key); tolto = true;
      };
      tx.oncomplete = () => ok(tolto); tx.onerror = () => ko(causa || tx.error); tx.onabort = () => ko(causa || tx.error || new Error('cancellazione sicura annullata'));
    });
  }

  /** Lease atomico per account: una sola scheda può possederlo finché non scade. */
  async function acquisisciLease(account: string, proprietario = proprietarioTab(), ora = Date.now(), durataMs = 15000): Promise<boolean> {
    const acc = accountPulito(account), d = await db();
    return new Promise((ok, ko) => {
      const tx = d.transaction(STORE_LEASE, 'readwrite'), st = tx.objectStore(STORE_LEASE), rq = st.get(acc); let preso = false;
      rq.onsuccess = () => { const l = rq.result as LeaseCodaQuiz | undefined; if (!l || l.scadeIl <= ora || l.proprietario === proprietario) { st.put({ account: acc, proprietario, scadeIl: ora + Math.max(1000, durataMs), aggiornatoIl: ora } as LeaseCodaQuiz); preso = true; } };
      tx.oncomplete = () => ok(preso); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error || new Error('lease annullato'));
    });
  }
  const rinnovaLease = acquisisciLease;
  async function rilasciaLease(account: string, proprietario = proprietarioTab()): Promise<boolean> {
    const acc = accountPulito(account), d = await db();
    return new Promise((ok, ko) => {
      const tx = d.transaction(STORE_LEASE, 'readwrite'), st = tx.objectStore(STORE_LEASE), rq = st.get(acc); let tolto = false;
      rq.onsuccess = () => { const l = rq.result as LeaseCodaQuiz | undefined; if (l && l.proprietario === proprietario) { st.delete(acc); tolto = true; } };
      tx.oncomplete = () => ok(tolto); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error || new Error('rilascio lease annullato'));
    });
  }
  /** Prende e marca in_esecuzione il prossimo lavoro dovuto, nella stessa transazione del controllo lease. */
  async function prossimo(account: string, proprietario = proprietarioTab(), ora = Date.now()): Promise<LavoroQuiz | null> {
    const acc = accountPulito(account), d = await db();
    return new Promise((ok, ko) => {
      const tx = d.transaction([STORE_LEASE, STORE_LAVORI], 'readwrite'), sl = tx.objectStore(STORE_LEASE), sj = tx.objectStore(STORE_LAVORI); let out: LavoroQuiz | null = null;
      const lr = sl.get(acc);
      lr.onsuccess = () => {
        const lease = lr.result as LeaseCodaQuiz | undefined;
        if (!lease || lease.proprietario !== proprietario || lease.scadeIl <= ora) return;
        tuttiDaStore(sj, xs => {
          const candidati = xs.filter(x => x.account === acc && x.stato === 'in_coda' && (x.prossimoTentativoIl === null || x.prossimoTentativoIl <= ora))
            .sort((a, b) => a.creatoIl - b.creatoIl || a.id.localeCompare(b.id));
          if (candidati[0]) { out = cambia(candidati[0], 'in_esecuzione', ora); sj.put(out); }
        }, e => { console.warn('CodaQuiz: lettura prossimo fallita', e); tx.abort(); });
      };
      tx.oncomplete = () => ok(out); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error || new Error('presa del lavoro annullata'));
    });
  }
  /** Alla riapertura/visibilità: un'esecuzione senza lease vivo torna in coda, senza duplicarsi. */
  async function recuperaInterrotti(account: string, ora = Date.now()): Promise<number> {
    const acc = accountPulito(account), d = await db();
    return new Promise((ok, ko) => {
      const tx = d.transaction([STORE_LEASE, STORE_LAVORI], 'readwrite'), sl = tx.objectStore(STORE_LEASE), sj = tx.objectStore(STORE_LAVORI); let n = 0;
      const lr = sl.get(acc);
      lr.onsuccess = () => {
        const lease = lr.result as LeaseCodaQuiz | undefined; if (lease && lease.scadeIl > ora) return; if (lease) sl.delete(acc);
        tuttiDaStore(sj, xs => { for (const l of xs) if (l.account === acc && l.stato === 'in_esecuzione') { sj.put({ ...cambia(l, 'in_coda', ora), ultimoErrore: l.ultimoErrore || 'esecuzione interrotta: ripresa automatica' }); n++; } }, e => { console.warn('CodaQuiz: recupero fallito', e); tx.abort(); });
      };
      tx.oncomplete = () => ok(n); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error || new Error('recupero della coda annullato'));
    });
  }
  async function svuotaAccount(account: string): Promise<number> {
    const acc = accountPulito(account), d = await db();
    return new Promise((ok, ko) => {
      const tx = d.transaction([STORE_LAVORI, STORE_LEASE], 'readwrite'), sj = tx.objectStore(STORE_LAVORI), sl = tx.objectStore(STORE_LEASE); let n = 0;
      tuttiDaStore(sj, xs => { for (const l of xs) if (l.account === acc) { sj.delete([acc, l.id]); n++; } sl.delete(acc); }, e => { console.warn('CodaQuiz: svuotamento account fallito', e); tx.abort(); });
      tx.oncomplete = () => ok(n); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error || new Error('svuotamento account annullato'));
    });
  }
  async function svuotaTutto(): Promise<void> {
    const d = dbp ? await dbp.catch(() => null) : null; if (d) d.close(); dbp = null;
    await new Promise<void>(ok => {
      try { const rq = indexedDB.deleteDatabase(NOME_DB); rq.onsuccess = () => ok(); rq.onerror = () => ok(); rq.onblocked = () => ok(); }
      catch (_) { ok(); }
    });
  }

  if (typeof document !== 'undefined') {
    const riattiva = () => { if (!document.hidden) recuperaInterrotti(accountAttuale()).catch(e => console.warn('CodaQuiz: ripresa non riuscita', e)); };
    document.addEventListener('visibilitychange', riattiva);
    riattiva();
  }

  return { NOME_DB, nuovo, idDeterministico, cambia, aggiungi, lista, pausa, riprendi, annulla, completa, rimanda, elimina,
    acquisisciLease, rinnovaLease, rilasciaLease, prossimo, recuperaInterrotti, svuotaAccount, svuotaTutto, proprietarioTab, accountAttuale };
})();
