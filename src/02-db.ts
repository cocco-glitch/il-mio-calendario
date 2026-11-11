// ============================================================
// 02-db.ts — Salvataggio locale (local-first).
// Un solo "tavolo" di record: ogni record ha id (UUID), type, updatedAt,
// deleted (soft delete / tombstone). È lo stesso formato che la Fase 2
// sincronizza su Drive (merge per record, vince l'ultima modifica).
// Se IndexedDB non è disponibile si ripiega su localStorage, poi memoria.
// ============================================================

interface Rec {
  id: string;
  type: string;
  updatedAt: number;
  deleted?: boolean;
  [k: string]: any;
}

const DB = (() => {
  const NOME = 'il-mio-calendario';
  const CHIAVE_LS = 'imc-records';
  let idb: IDBDatabase | null = null;
  let modo: 'idb' | 'ls' | 'mem' = 'mem';
  let mem: Record<string, Rec> = {};

  function apriIdb(): Promise<IDBDatabase> {
    return new Promise((ok, ko) => {
      const rq = indexedDB.open(NOME, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore('records', { keyPath: 'id' }); };
      rq.onsuccess = () => ok(rq.result);
      rq.onerror = () => ko(rq.error);
      rq.onblocked = () => ko(new Error('bloccato'));
    });
  }

  function scriviLs(): void {
    try { localStorage.setItem(CHIAVE_LS, JSON.stringify(Object.values(mem))); } catch (_) { /* pieno o vietato */ }
  }

  return {
    get modo() { return modo; },

    /** Apre il database e restituisce tutti i record. */
    async apri(): Promise<Rec[]> {
      try {
        idb = await apriIdb();
        modo = 'idb';
        return await new Promise<Rec[]>((ok, ko) => {
          const rq = idb!.transaction('records').objectStore('records').getAll();
          rq.onsuccess = () => ok(rq.result as Rec[]);
          rq.onerror = () => ko(rq.error);
        });
      } catch (_) {
        try {
          const txt = localStorage.getItem(CHIAVE_LS);
          modo = 'ls';
          const arr: Rec[] = txt ? JSON.parse(txt) : [];
          for (const r of arr) mem[r.id] = r;
          return arr;
        } catch (_e) { modo = 'mem'; return []; }
      }
    },

    /** Salva (inserisce o sovrascrive) uno o più record. */
    salva(recs: Rec[]): Promise<void> {
      if (modo === 'idb' && idb) {
        return new Promise((ok, ko) => {
          const tx = idb!.transaction('records', 'readwrite');
          const st = tx.objectStore('records');
          for (const r of recs) st.put(r);
          tx.oncomplete = () => ok();
          tx.onerror = () => ko(tx.error);
        });
      }
      for (const r of recs) mem[r.id] = r;
      if (modo === 'ls') scriviLs();
      return Promise.resolve();
    },
  };
})();
