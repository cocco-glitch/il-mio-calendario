// 06-notifiche.ts — Notifiche sul telefono tramite ntfy (Livello A del piano, docs/aggiornamento/06-NOTIFICHE.md).
//
// Come funziona: l'app calcola le notifiche delle prossime 72 ore e le manda SUBITO al server ntfy
// con l'orario di consegna (`delay` = timestamp Unix). Il server le consegna all'ora giusta all'app
// ntfy dell'iPhone, iscritta allo stesso codice segreto (topic). Su ntfy.sh si programma al massimo
// 3 giorni avanti: per questo a ogni apertura/modifica l'app riprogramma la finestra.
//
// Non mandare doppioni: ogni notifica ha una chiave stabile (es. 'ev:<occorrenza>:<minuti>') e un
// record 'notifica' sincronizzato (id 'ntf-<hash chiave>') con orario e impronta del contenuto.
// Anche se l'app è aperta su più dispositivi, una notifica già registrata non si rimanda.
//
// Limite di ntfy: una notifica programmata non si può annullare sul server. Se un evento cambia o
// sparisce, l'app manda, 5 secondi dopo il vecchio orario, un messaggio silenzioso con lo stesso
// sequence_id che SOSTITUISCE quella vecchia ("Annullato" / "Spostato alle …").

const Notifiche = (() => {
  const FINESTRA = 72 * 3600000;          // 3 giorni (limite di ntfy.sh)
  const MAX_PER_GIRO = 40;                // sotto il limite di raffica del server pubblico
  const PRED = { mattino: '08:00', sera: '21:30', silDa: '23:00', silA: '07:30' };
  let timer = 0, inCorso = false;

  interface Da { chiave: string; at: number; titolo: string; testo: string; tag: string; prio?: number; }

  const server = () => (imp().ntfyServer || 'https://ntfy.sh').replace(/\/+$/, '');
  const tipi = () => Object.assign({ promemoria: true, studio: true, sera: true, esami: true }, imp().ntfyTipi || {});
  const attive = () => !!(imp().ntfy && imp().ntfyTopic);
  const linkApp = () => location.origin + location.pathname.replace(/[^/]*$/, '');
  function minDi(hhmm: string): number { const [a, b] = hhmm.split(':').map(Number); return (a || 0) * 60 + (b || 0); }
  function alle(g: Date, hhmm: string): Date { const d = new Date(g); const m = minDi(hhmm); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d; }
  function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function nuovoTopic(): string {
    const b = new Uint8Array(24); crypto.getRandomValues(b);
    return 'imc-' + Array.from(b, x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
  }

  /** Orari silenziosi: se l'orario cade dentro, slitta alla fine del silenzio. */
  function fuoriSilenzio(t: number): number {
    const i = imp(), da = minDi(i.ntfySilenzioDa || PRED.silDa), a = minDi(i.ntfySilenzioA || PRED.silA);
    const d = new Date(t), m = d.getHours() * 60 + d.getMinutes();
    const dentro = da > a ? (m >= da || m < a) : (m >= da && m < a);
    if (!dentro) return t;
    const fine = alle(d, i.ntfySilenzioA || PRED.silA);
    if (m >= da && da > a) fine.setDate(fine.getDate() + 1); // es. 23:30 → 07:30 del giorno dopo
    return fine.getTime();
  }

  function privata(catId?: string): boolean { return !!catId && (imp().ntfyPrivate || []).includes(catId); }
  function vociStudio(g: Date) { return typeof Studio === 'undefined' ? [] : Studio.vociDelGiorno(g); }
  function testoVoci(g: Date): string {
    return vociStudio(g).map(x => x.v.speciale ? x.v.t : Studio.etichetta(x.v.k)).join(' + ');
  }

  /** Tutte le notifiche desiderate tra adesso e adesso+72h. */
  function calcola(adesso = Date.now()): Da[] {
    const fine = adesso + FINESTRA, T = tipi(), i = imp(), out: Da[] = [];
    const metti = (d: Da) => { d.at = fuoriSilenzio(d.at); if (d.at > adesso + 15000 && d.at <= fine) out.push(d); };
    if (T.promemoria) {
      for (const o of occorrenzeTra(new Date(adesso - 86400000), new Date(fine + 86400000))) {
        const priv = privata(o.ev.categoriaId);
        for (const min of o.ev.promemoria || []) {
          const at = o.inizio.getTime() - min * 60000;
          const quando = o.ev.tuttoIlGiorno ? dataRelativa(o.inizio) : (min === 0 ? 'adesso' : (min < 60 ? 'tra ' + min + ' min' : dataRelativa(o.inizio).toLowerCase() + ' alle ' + hm(o.inizio)));
          metti({ chiave: 'ev:' + o.chiave + ':' + min, at, titolo: priv ? 'Promemoria' : o.ev.titolo, testo: priv ? 'Hai un impegno ' + quando : quando + (o.ev.tuttoIlGiorno ? '' : ' · ore ' + hm(o.inizio)) + (o.ev.luogo && !priv ? ' · ' + o.ev.luogo : ''), tag: 'bell' });
        }
      }
      for (const t of Stato.tutti<Task>('task')) {
        if (t.fatto || !t.scadenza || t.scadenza.length <= 10) continue;
        const priv = privata(t.categoriaId);
        metti({ chiave: 'task:' + t.id + ':' + t.scadenza, at: daDt(t.scadenza).getTime(), titolo: priv ? 'Promemoria' : t.titolo, testo: 'Scade adesso', tag: 'ballot_box_with_check' });
      }
    }
    // Giorni della finestra (oggi compreso)
    for (let g = oggi(); g.getTime() <= fine; g = new Date(g.getFullYear(), g.getMonth(), g.getDate() + 1)) {
      const k = ymd(g), voci = testoVoci(g);
      if (T.studio && voci) metti({ chiave: 'studio:' + k, at: alle(g, i.ntfyMattino || PRED.mattino).getTime(), titolo: '📚 Studio di oggi', testo: voci, tag: 'books' });
      if (T.sera && vociStudio(g).some(x => !x.v.speciale)) metti({ chiave: 'sera:' + k, at: alle(g, i.ntfySera || PRED.sera).getTime(), titolo: '🌙 Ripasso prima di dormire', testo: '10–15 min: richiama a memoria ' + voci + ', senza aprire il libro.', tag: 'crescent_moon', prio: 2 });
      if (T.esami) for (const n of [7, 3, 1]) {
        const target = new Date(g.getFullYear(), g.getMonth(), g.getDate() + n);
        for (const x of vociStudio(target)) {
          if (!x.v.speciale || !/^(SIM|VERIFICA|ESAME-)/.test(x.v.k)) continue;
          metti({ chiave: 'esame:' + x.v.k + ':' + n, at: alle(g, i.ntfyMattino || PRED.mattino).getTime() + 60000, titolo: (n === 1 ? '⏰ Domani: ' : '🎯 Tra ' + n + ' giorni: ') + x.v.t.replace(/^🎓 /, ''), testo: n === 1 ? 'Oggi ripasso leggero e dormi bene: il sonno fissa ciò che sai.' : 'Inizia a dare priorità ai ripassi e agli errori.', tag: 'dart', prio: 4 });
        }
      }
    }
    return out;
  }

  /** Invio a ntfy. mode 'no-cors': la richiesta parte anche se il server non manda le intestazioni CORS. */
  async function invia(m: { chiave: string; at?: number; titolo: string; testo: string; tag?: string; prio?: number }): Promise<void> {
    const corpo: any = { topic: imp().ntfyTopic, title: m.titolo, message: m.testo, click: linkApp(), sequence_id: 'imc' + hash(m.chiave) };
    if (m.tag) corpo.tags = [m.tag];
    if (m.prio) corpo.priority = m.prio;
    if (m.at && m.at > Date.now() + 10000) corpo.delay = String(Math.floor(m.at / 1000));
    await fetch(server() + '/', { method: 'POST', mode: 'no-cors', body: JSON.stringify(corpo) });
  }
  const impronta = (d: Da) => hash(d.at + '|' + d.titolo + '|' + d.testo);
  const idReg = (chiave: string) => 'ntf-' + hash(chiave);

  /** Allinea il server ntfy con le notifiche desiderate. Restituisce quante ne ha mandate. */
  async function allinea(): Promise<number> {
    if (!attive() || inCorso || !navigator.onLine) return 0;
    inCorso = true;
    let inviati = 0;
    try {
      const adesso = Date.now(), voluti = calcola(adesso), visti = new Set<string>();
      for (const d of voluti) {
        if (inviati >= MAX_PER_GIRO) break;
        const id = idReg(d.chiave), reg = Stato.prendi<NotificaReg>(id), h = impronta(d);
        visti.add(id);
        if (reg && !reg.deleted && reg.h === h) continue;
        // Cambiata e la vecchia è ancora in attesa: subito dopo il vecchio orario la sostituisco in silenzio.
        if (reg && !reg.deleted && reg.at > adesso && reg.at !== d.at) { await invia({ chiave: d.chiave, at: reg.at + 5000, titolo: '↪ ' + reg.titolo, testo: 'Spostato: ' + dataRelativa(new Date(d.at)).toLowerCase() + ' alle ' + hm(new Date(d.at)), prio: 1 }); inviati++; }
        await invia(d); inviati++;
        Stato.salva({ id, type: 'notifica', updatedAt: 0, at: d.at, h, titolo: d.titolo } as NotificaReg, true);
      }
      // Notifiche registrate in futuro che non servono più: annullo (sostituzione silenziosa) e chiudo il registro.
      for (const reg of Stato.tutti<NotificaReg>('notifica')) {
        if (visti.has(reg.id)) continue;
        if (reg.at > adesso + 15000 && reg.at <= adesso + FINESTRA && inviati < MAX_PER_GIRO) {
          await invia({ chiave: reg.id, at: reg.at + 5000, titolo: '✕ Annullato', testo: reg.titolo, prio: 1 });
          inviati++; Stato.elimina(reg.id);
        } else if (reg.at < adesso - 86400000) Stato.elimina(reg.id); // vecchie: pulizia
      }
    } catch (e) {
      console.warn('ntfy:', e);
    } finally { inCorso = false; }
    return inviati;
  }
  /** Programma un allineamento tra qualche secondo (le modifiche ravvicinate si accorpano). */
  function programma(): void { if (!attive()) return; clearTimeout(timer); timer = setTimeout(() => { allinea(); }, 4000) as unknown as number; }

  function attiva(): string { const i = imp(); if (!i.ntfyTopic) i.ntfyTopic = nuovoTopic(); i.ntfy = true; Stato.salva(i); return i.ntfyTopic!; }
  function rigenera(): string {
    for (const r of Stato.tutti<NotificaReg>('notifica')) Stato.elimina(r.id); // il nuovo topic riparte da zero
    const i = imp(); i.ntfyTopic = nuovoTopic(); Stato.salva(i); return i.ntfyTopic;
  }
  async function prova(): Promise<void> { await invia({ chiave: 'prova:' + Date.now(), titolo: '✅ Notifiche attive', testo: 'Il mio calendario può avvisarti anche ad app chiusa.', tag: 'white_check_mark' }); }

  return { calcola, allinea, programma, attiva, rigenera, prova, attive, server, PRED, nuovoTopic, fuoriSilenzio };
})();
