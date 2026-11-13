"use strict";
// ============================================================
// 01-util.ts — Utilità di base: DOM, date, id, markdown.
// NOTA ARCHITETTURA: niente moduli/import. Tutti i file in src/ sono
// "script" globali, compilati da tsc e concatenati in ordine di nome
// (vedi build.mjs) in un unico app.js. Zero dipendenze esterne.
// ============================================================
/** Crea un elemento: h('div.card.big', {onclick: fn}, figli...) */
function h(tag, attrs, ...figli) {
    const parti = tag.split('.');
    const el = document.createElement(parti[0] || 'div');
    if (parti.length > 1)
        el.className = parti.slice(1).join(' ');
    if (attrs) {
        for (const k in attrs) {
            const v = attrs[k];
            if (v == null || v === false)
                continue;
            if (k.startsWith('on') && typeof v === 'function')
                el.addEventListener(k.slice(2).toLowerCase(), v);
            else if (k === 'style' && typeof v === 'object') {
                for (const p in v) {
                    if (p.startsWith('--'))
                        el.style.setProperty(p, v[p]);
                    else
                        el.style[p] = v[p];
                }
            }
            else if (k === 'class')
                el.className += (el.className ? ' ' : '') + v;
            else if (k in el && k !== 'list' && k !== 'style')
                el[k] = v;
            else
                el.setAttribute(k, v === true ? '' : String(v));
        }
    }
    aggiungi(el, figli);
    return el;
}
function aggiungi(el, figli) {
    for (const f of figli) {
        if (f == null || f === false)
            continue;
        if (Array.isArray(f))
            aggiungi(el, f);
        else if (f instanceof Node)
            el.appendChild(f);
        else
            el.appendChild(document.createTextNode(String(f)));
    }
}
function svuota(el) { while (el.firstChild)
    el.removeChild(el.firstChild); }
function uid() {
    try {
        return crypto.randomUUID();
    }
    catch (_) { /* vecchi browser */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
}
// ---------- Date ----------
// Le date sono salvate come stringhe "orario a muro" locali (Europe/Rome sul
// tuo iPhone/PC): 'YYYY-MM-DD' oppure 'YYYY-MM-DDTHH:mm'. Niente fusi/UTC:
// un impegno alle 15:00 resta alle 15:00.
const pad2 = (n) => String(n).padStart(2, '0');
function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function hm(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function dtStr(d) { return ymd(d) + 'T' + hm(d); }
function daYmd(s) { const p = s.slice(0, 10).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function daDt(s) {
    const d = daYmd(s);
    if (s.length > 10) {
        const t = s.slice(11).split(':').map(Number);
        d.setHours(t[0] || 0, t[1] || 0, 0, 0);
    }
    return d;
}
function piuGiorni(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes()); }
function piuMinuti(d, n) { return new Date(d.getTime() + n * 60000); }
function inizioGiorno(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
/** Lunedì della settimana di d (la settimana parte di lunedì). */
function lunedi(d) { const g = (d.getDay() + 6) % 7; return piuGiorni(inizioGiorno(d), -g); }
function stessoGiorno(a, b) { return ymd(a) === ymd(b); }
function oggi() { return inizioGiorno(new Date()); }
// v0.17: i formattatori si creano una volta sola per combinazione di opzioni (crearli è costoso)
const FORMATI = new Map();
function fmt(d, o) {
    const k = JSON.stringify(o);
    let f = FORMATI.get(k);
    if (!f) {
        f = new Intl.DateTimeFormat('it-IT', o);
        FORMATI.set(k, f);
    }
    return f.format(d);
}
const GIORNI_BREVI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
function maiuscola(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function dataLunga(d) { return maiuscola(fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })); }
function dataBreve(d) { return fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }); }
/** "Oggi", "Domani", "Ieri" oppure data breve. */
function dataRelativa(d) {
    const diff = Math.round((inizioGiorno(d).getTime() - oggi().getTime()) / 86400000);
    if (diff === 0)
        return 'Oggi';
    if (diff === 1)
        return 'Domani';
    if (diff === -1)
        return 'Ieri';
    return dataBreve(d);
}
// ---------- Markdown minimale (sicuro: prima escape, poi sostituzioni) ----------
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function mdInline(s) {
    return esc(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function md(src) {
    const out = [];
    let lista = false;
    for (const riga of src.split('\n')) {
        const li = /^\s*[-*]\s+(.*)$/.exec(riga);
        if (li) {
            if (!lista) {
                out.push('<ul>');
                lista = true;
            }
            out.push('<li>' + mdInline(li[1]) + '</li>');
            continue;
        }
        if (lista) {
            out.push('</ul>');
            lista = false;
        }
        const t = /^(#{1,3})\s+(.*)$/.exec(riga);
        if (t)
            out.push('<h' + (t[1].length + 2) + '>' + mdInline(t[2]) + '</h' + (t[1].length + 2) + '>');
        else if (riga.trim() === '')
            out.push('<div class="md-sp"></div>');
        else
            out.push('<p>' + mdInline(riga) + '</p>');
    }
    if (lista)
        out.push('</ul>');
    return out.join('');
}
/** Normalizza per la ricerca: minuscole e senza accenti. */
function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// ============================================================
// 02-db.ts — Salvataggio locale (local-first).
// Un solo "tavolo" di record: ogni record ha id (UUID), type, updatedAt,
// deleted (soft delete / tombstone). È lo stesso formato che la Fase 2
// sincronizza su Drive (merge per record, vince l'ultima modifica).
// Se IndexedDB non è disponibile si ripiega su localStorage, poi memoria.
// ============================================================
const DB = (() => {
    const NOME = 'il-mio-calendario';
    const CHIAVE_LS = 'imc-records';
    let idb = null;
    let modo = 'mem';
    let mem = {};
    function apriIdb() {
        return new Promise((ok, ko) => {
            const rq = indexedDB.open(NOME, 1);
            rq.onupgradeneeded = () => { rq.result.createObjectStore('records', { keyPath: 'id' }); };
            rq.onsuccess = () => ok(rq.result);
            rq.onerror = () => ko(rq.error);
            rq.onblocked = () => ko(new Error('bloccato'));
        });
    }
    function scriviLs() {
        try {
            localStorage.setItem(CHIAVE_LS, JSON.stringify(Object.values(mem)));
        }
        catch (_) { /* pieno o vietato */ }
    }
    return {
        get modo() { return modo; },
        /** Apre il database e restituisce tutti i record. */
        async apri() {
            try {
                idb = await apriIdb();
                modo = 'idb';
                return await new Promise((ok, ko) => {
                    const rq = idb.transaction('records').objectStore('records').getAll();
                    rq.onsuccess = () => ok(rq.result);
                    rq.onerror = () => ko(rq.error);
                });
            }
            catch (_) {
                try {
                    const txt = localStorage.getItem(CHIAVE_LS);
                    modo = 'ls';
                    const arr = txt ? JSON.parse(txt) : [];
                    for (const r of arr)
                        mem[r.id] = r;
                    return arr;
                }
                catch (_e) {
                    modo = 'mem';
                    return [];
                }
            }
        },
        /** Salva (inserisce o sovrascrive) uno o più record. */
        salva(recs) {
            if (modo === 'idb' && idb) {
                return new Promise((ok, ko) => {
                    const tx = idb.transaction('records', 'readwrite');
                    const st = tx.objectStore('records');
                    for (const r of recs)
                        st.put(r);
                    tx.oncomplete = () => ok();
                    tx.onerror = () => ko(tx.error);
                });
            }
            for (const r of recs)
                mem[r.id] = r;
            if (modo === 'ls')
                scriviLs();
            return Promise.resolve();
        },
        /** v0.17: rimuove definitivamente dei record (solo per lapidi vecchie senza valore). */
        rimuovi(ids) {
            if (!ids.length)
                return Promise.resolve();
            if (modo === 'idb' && idb) {
                return new Promise((ok, ko) => {
                    const tx = idb.transaction('records', 'readwrite'), st = tx.objectStore('records');
                    for (const id of ids)
                        st.delete(id);
                    tx.oncomplete = () => ok();
                    tx.onerror = () => ko(tx.error);
                });
            }
            for (const id of ids)
                delete mem[id];
            if (modo === 'ls')
                scriviLs();
            return Promise.resolve();
        },
    };
})();

// ============================================================
// 03-modello.ts — Tipi dei dati, stato in memoria, ricorrenze.
// ============================================================
// ---------- Stato ----------
const Stato = (() => {
    const rec = new Map();
    const TIPI_SERVIZIO = new Set(['notifica']); // v0.17: lapidi ripulibili dopo 7 giorni
    const lapideScaduta = (r) => TIPI_SERVIZIO.has(r.type) && (r.updatedAt || 0) < Date.now() - 7 * 86400000;
    let ver = 0, cacheVer = -1; // v0.17: versione dei dati e cache per tipo
    const perTipo = new Map();
    const ascoltatori = [];
    let inAttesa = false;
    function notifica() {
        if (inAttesa)
            return;
        inAttesa = true;
        Promise.resolve().then(() => { inAttesa = false; ascoltatori.forEach(f => f()); });
    }
    return {
        rec,
        ascolta(f) { ascoltatori.push(f); },
        notifica,
        async carica() {
            for (const r of await DB.apri())
                rec.set(r.id, r);
            ver++;
            // Primo avvio: categorie e impostazioni di partenza.
            // updatedAt = 1 così, alla prima sincronizzazione, vincono sempre i dati già su Drive.
            if (!rec.has('impostazioni')) {
                const nuovi = [
                    { id: 'impostazioni', type: 'impostazioni', updatedAt: 1, tema: 'auto', accento: '#6c8cff', vistaIniziale: 'oggi' },
                    { id: 'cat-studio', type: 'categoria', updatedAt: 1, nome: 'Studio', colore: '#6c8cff', visibile: true, ordine: 0 },
                    { id: 'cat-personale', type: 'categoria', updatedAt: 1, nome: 'Personale', colore: '#2fbf8f', visibile: true, ordine: 1 },
                    { id: 'cat-salute', type: 'categoria', updatedAt: 1, nome: 'Salute', colore: '#f0708a', visibile: true, ordine: 2 },
                    { id: 'cat-uni', type: 'categoria', updatedAt: 1, nome: 'Uni', colore: '#e9a23b', visibile: true, ordine: 3 },
                ];
                for (const r of nuovi)
                    if (!rec.has(r.id))
                        rec.set(r.id, r);
                ver++;
                await DB.salva(nuovi);
            }
        },
        /** Tutti i record non eliminati di un tipo. */
        tutti(type) {
            // v0.17: indice per tipo, ricostruito solo dopo una modifica (ver). Restituisce sempre una copia.
            if (cacheVer !== ver) {
                perTipo.clear();
                cacheVer = ver;
            }
            let l = perTipo.get(type);
            if (!l) {
                l = [];
                rec.forEach(r => { if (r.type === type && !r.deleted)
                    l.push(r); });
                perTipo.set(type, l);
            }
            return l.slice();
        },
        /**
         * v0.17: rimuove le lapidi scadute dei tipi "di servizio" (registro notifiche): non servono più alla
         * sincronizzazione e ingrandirebbero dati.json. I dati dell'utente (eventi, schede…) non si toccano.
         */
        pulisci() {
            const via = [];
            rec.forEach(r => { if (r.deleted && lapideScaduta(r))
                via.push(r.id); });
            for (const id of via)
                rec.delete(id);
            if (via.length) {
                ver++;
                DB.rimuovi(via);
                if (typeof Drive !== 'undefined')
                    Drive.programma();
            }
            return via.length;
        },
        /** Numero di versione dei dati: cambia a ogni salvataggio/unione (per le cache). */
        get ver() { return ver; },
        prendi(id) {
            const r = rec.get(id);
            return r && !r.deleted ? r : undefined;
        },
        /** Salva un record aggiornando updatedAt (serve alla sincronizzazione). */
        salva(r, silenzioso = false) {
            r.updatedAt = Date.now();
            rec.set(r.id, r);
            ver++;
            DB.salva([r]);
            if (!silenzioso)
                notifica(); // silenzioso: non ridisegna (es. mentre scrivi la nota del giorno)
            if (typeof Drive !== 'undefined')
                Drive.programma();
            if (typeof GCal !== 'undefined' && (r.type === 'evento' || r.type === 'task'))
                GCal.programma();
        },
        /** Eliminazione "morbida": il record resta come lapide per la sync. */
        elimina(id) {
            const r = rec.get(id);
            if (!r)
                return;
            r.deleted = true;
            this.salva(r);
        },
        /** Unisce record esterni (backup/Drive): vince l'updatedAt più recente. */
        unisci(esterni) {
            const cambiati = [];
            for (const e of esterni) {
                if (!e || !e.id || !e.type)
                    continue;
                if (e.deleted && lapideScaduta(e) && !rec.has(e.id))
                    continue; // v0.17: lapidi vecchie già ripulite
                const mio = rec.get(e.id);
                if (!mio || (e.updatedAt || 0) > (mio.updatedAt || 0)) {
                    rec.set(e.id, e);
                    cambiati.push(e);
                    ver++;
                }
            }
            if (cambiati.length) {
                DB.salva(cambiati);
                notifica();
            }
            return cambiati.length;
        },
        esporta() { return Array.from(rec.values()); },
    };
})();
function imp() { return Stato.rec.get('impostazioni'); }
function categorie() { return Stato.tutti('categoria').sort((a, b) => a.ordine - b.ordine); }
function coloreEvento(e) {
    if (e.colore)
        return e.colore;
    const c = e.categoriaId ? Stato.prendi(e.categoriaId) : undefined;
    return c ? c.colore : imp().accento;
}
function categoriaVisibile(id) {
    if (!id)
        return true;
    const c = Stato.prendi(id);
    return !c || c.visibile;
}
// ---------- Ricorrenze ----------
/** Genera in ordine le date di inizio di una serie (max 3000 passi). */
function* dateSerie(inizio, rr) {
    const intervallo = Math.max(1, rr.interval || 1);
    const fino = rr.until ? piuGiorni(daYmd(rr.until), 1) : null;
    let emesse = 0;
    const H = inizio.getHours(), M = inizio.getMinutes();
    const emetti = function* (d) {
        if (fino && d >= fino)
            return;
        if (rr.count && emesse >= rr.count)
            return;
        emesse++;
        yield d;
    };
    const finita = (d) => (fino != null && d >= fino) || (rr.count != null && rr.count > 0 && emesse >= rr.count);
    if (rr.freq === 'W' && rr.byday && rr.byday.length) {
        const giorni = rr.byday.slice().sort((a, b) => a - b);
        let sett = lunedi(inizio);
        for (let i = 0; i < 3000; i++) {
            for (const g of giorni) {
                const d = piuGiorni(sett, g);
                d.setHours(H, M, 0, 0);
                if (d < inizio)
                    continue;
                if (finita(d))
                    return;
                yield* emetti(d);
            }
            sett = piuGiorni(sett, 7 * intervallo);
        }
        return;
    }
    for (let i = 0; i < 3000; i++) {
        let d;
        if (rr.freq === 'D')
            d = piuGiorni(inizio, i * intervallo);
        else if (rr.freq === 'W')
            d = piuGiorni(inizio, i * 7 * intervallo);
        else if (rr.freq === 'M') {
            d = new Date(inizio.getFullYear(), inizio.getMonth() + i * intervallo, inizio.getDate(), H, M);
            if (d.getDate() !== inizio.getDate())
                continue; // es. il 31 nei mesi corti: si salta
        }
        else {
            d = new Date(inizio.getFullYear() + i * intervallo, inizio.getMonth(), inizio.getDate(), H, M);
            if (d.getMonth() !== inizio.getMonth())
                continue; // 29 febbraio
        }
        if (finita(d))
            return;
        yield* emetti(d);
    }
}
/** Occorrenze di un evento che toccano l'intervallo [da, a). */
function occorrenze(ev, da, a) {
    const inizio = daDt(ev.inizio);
    const durata = Math.max(0, daDt(ev.fine).getTime() - inizio.getTime());
    const out = [];
    if (!ev.rrule) {
        const fine = new Date(inizio.getTime() + durata);
        if (inizio < a && fine >= da)
            out.push({ ev, inizio, fine, chiave: ymd(inizio) });
        return out;
    }
    const esclusi = new Set(ev.exdate || []);
    for (const d of dateSerie(inizio, ev.rrule)) {
        if (d >= a)
            break;
        const fine = new Date(d.getTime() + durata);
        if (fine < da)
            continue;
        const chiave = ymd(d);
        if (esclusi.has(chiave))
            continue;
        out.push({ ev, inizio: d, fine, chiave });
    }
    return out;
}
/** Tutte le occorrenze visibili in [da, a), ordinate. */
function occorrenzeTra(da, a) {
    let out = [];
    for (const ev of Stato.tutti('evento')) {
        if (!categoriaVisibile(ev.categoriaId))
            continue;
        out = out.concat(occorrenze(ev, da, a));
    }
    return out.sort((x, y) => x.inizio.getTime() - y.inizio.getTime() || (x.ev.titolo < y.ev.titolo ? -1 : 1));
}
function occorrenzeDelGiorno(g) {
    const da = inizioGiorno(g), a = piuGiorni(da, 1);
    return occorrenzeTra(da, a).filter(o => o.fine > da || stessoGiorno(o.inizio, da));
}
/** Testo leggibile di una ricorrenza. */
function testoRicorrenza(rr) {
    if (!rr)
        return '';
    const n = rr.interval || 1;
    const unita = { D: ['giorno', 'giorni'], W: ['settimana', 'settimane'], M: ['mese', 'mesi'], Y: ['anno', 'anni'] }[rr.freq];
    let s = n === 1 ? 'Ogni ' + unita[0] : 'Ogni ' + n + ' ' + unita[1];
    if (rr.freq === 'W' && rr.byday && rr.byday.length)
        s += ' (' + rr.byday.map(g => GIORNI_BREVI[g]).join(', ') + ')';
    if (rr.until)
        s += ' fino al ' + fmt(daYmd(rr.until), { day: 'numeric', month: 'short', year: 'numeric' });
    if (rr.count)
        s += ', ' + rr.count + ' volte';
    return s;
}
// ---------- Promemoria/Task ----------
function scadenzaTask(t) { return t.scadenza ? daDt(t.scadenza) : null; }
function taskScaduto(t) {
    if (t.fatto || !t.scadenza)
        return false;
    const d = daDt(t.scadenza);
    return t.scadenza.length > 10 ? d < new Date() : d < oggi();
}
/** Spunta un promemoria; se è ricorrente lo sposta alla prossima scadenza. */
function spuntaTask(t) {
    if (!t.fatto && t.rrule && t.scadenza) {
        const base = daDt(t.scadenza);
        let prossima = null;
        for (const d of dateSerie(base, t.rrule)) {
            if (d > base) {
                prossima = d;
                break;
            }
        }
        if (prossima) {
            t.scadenza = t.scadenza.length > 10 ? dtStr(prossima) : ymd(prossima);
            if (t.rrule.count)
                t.rrule.count = Math.max(1, t.rrule.count - 1);
            Stato.salva(t);
            return;
        }
    }
    t.fatto = !t.fatto;
    t.fattoIl = t.fatto ? dtStr(new Date()) : undefined;
    Stato.salva(t);
}
function ordinaTask(a, b) {
    const da = a.scadenza || '9999', db = b.scadenza || '9999';
    if (da !== db)
        return da < db ? -1 : 1;
    return b.priorita - a.priorita;
}

// ============================================================
// 04-componenti.ts — Pezzi riusabili dell'interfaccia:
// foglio (modale), dialogo di scelta, avviso (toast), campo ricorrenza.
// ============================================================
const ICONE = {
    oggi: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    studio: '<path d="M3 8.5l9-4.5 9 4.5-9 4.5z"/><path d="M7 11v5c1.5 1.6 3.2 2.3 5 2.3s3.5-.7 5-2.3v-5M21 8.5V14"/>',
    task: '<path d="M4 6.5l2 2 3.5-4M4 16.5l2 2 3.5-4M13 7h7M13 17h7"/>',
    note: '<path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20z"/><path d="M9 12h7M9 16h5"/>',
    appunti: '<path d="M5 4.5h11.5l2.5 2.5v12.5H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/><path d="M14 3v3"/>',
    altro: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    cerca: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    piu: '<path d="M12 5v14M5 12h14"/>',
    sx: '<path d="M14.5 5l-7 7 7 7"/>',
    dx: '<path d="M9.5 5l7 7-7 7"/>',
    ripeti: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5"/>',
    luogo: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    campana: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const MODELLI_ICONA = new Map(); // v0.17: ogni icona si costruisce una volta e poi si clona
function icona(nome, dim = 22) {
    const k = nome + '|' + dim;
    let m = MODELLI_ICONA.get(k);
    if (!m) {
        m = h('span.ico');
        m.innerHTML = '<svg viewBox="0 0 24 24" width="' + dim + '" height="' + dim + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONE[nome] || '') + '</svg>';
        MODELLI_ICONA.set(k, m);
    }
    return m.cloneNode(true);
}
/** Foglio modale a tutta altezza su telefono, centrato su PC. */
function foglio(opz) {
    const chiudi = () => { sfondo.remove(); document.removeEventListener('keydown', tasto); };
    const tasto = (e) => { if (e.key === 'Escape')
        chiudi(); };
    const sfondo = h('div.foglio-sfondo', { onclick: (e) => { if (e.target === sfondo)
            chiudi(); } }, h('div.foglio', { role: 'dialog', 'aria-label': opz.titolo }, h('div.foglio-testa', null, h('button.btn-testo', { onclick: chiudi }, 'Annulla'), h('div.foglio-titolo', null, opz.titolo), opz.salva
        ? h('button.btn-testo.forte', { onclick: () => { if (opz.salva() !== false)
                chiudi(); } }, opz.etichettaSalva || 'Salva')
        : h('span', { style: { width: '56px' } })), h('div.foglio-corpo', null, opz.corpo, opz.elimina ? h('button.btn.pericolo', { onclick: () => opz.elimina() }, 'Elimina') : null)));
    document.body.appendChild(sfondo);
    document.addEventListener('keydown', tasto);
    return { chiudi };
}
/** Dialogo di scelta (al posto di confirm/alert, che su iOS in PWA danno problemi). */
function chiedi(titolo, scelte, testo) {
    return new Promise(ok => {
        const fine = (v) => { sfondo.remove(); ok(v); };
        const sfondo = h('div.dialogo-sfondo', { onclick: (e) => { if (e.target === sfondo)
                fine(null); } }, h('div.dialogo', { role: 'alertdialog' }, h('div.dialogo-titolo', null, titolo), testo ? h('div.dialogo-testo', null, testo) : null, scelte.map(s => h('button.btn' + (s.pericolo ? '.pericolo' : ''), { onclick: () => fine(s.valore) }, s.testo)), h('button.btn.neutro', { onclick: () => fine(null) }, 'Annulla')));
        document.body.appendChild(sfondo);
    });
}
/** Avviso temporaneo in alto. */
function avviso(testo, durataMs = 4000, alTocco) {
    let zona = document.getElementById('avvisi');
    if (!zona) {
        zona = h('div', { id: 'avvisi', 'aria-live': 'polite' });
        document.body.appendChild(zona);
    }
    const el = h('div.avviso', { onclick: () => { el.remove(); if (alTocco)
            alTocco(); } }, testo);
    zona.appendChild(el);
    if (durataMs > 0)
        setTimeout(() => el.remove(), durataMs);
}
/** Riga di modulo con etichetta. */
function riga(etichetta, ...campo) {
    return h('label.riga', null, h('span.riga-eti', null, etichetta), h('span.riga-campo', null, campo));
}
function selettore(opzioni, valore, onchange) {
    const s = h('select', { onchange });
    for (const [v, t] of opzioni)
        s.appendChild(h('option', { value: v }, t));
    s.value = valore;
    return s;
}
/** Campo ricorrenza completo (frequenza, intervallo, giorni, fine). */
function campoRicorrenza(iniziale, giornoBase) {
    const rr = iniziale ? JSON.parse(JSON.stringify(iniziale)) : null;
    const freq = selettore([['', 'Mai'], ['D', 'Ogni giorno'], ['W', 'Ogni settimana'], ['M', 'Ogni mese'], ['Y', 'Ogni anno']], rr ? rr.freq : '', () => aggiorna());
    const interv = h('input', { type: 'number', min: '1', max: '99', value: String(rr ? rr.interval || 1 : 1), inputMode: 'numeric' });
    const giorni = new Set(rr && rr.byday ? rr.byday : []);
    const fineTipo = selettore([['', 'Mai'], ['data', 'Fino al'], ['num', 'Dopo N volte']], rr ? (rr.until ? 'data' : rr.count ? 'num' : '') : '', () => aggiorna());
    const fineData = h('input', { type: 'date', value: rr && rr.until ? rr.until : '' });
    const fineNum = h('input', { type: 'number', min: '1', max: '999', value: String(rr && rr.count ? rr.count : 10), inputMode: 'numeric' });
    const dettagli = h('div.rip-dettagli');
    const el = h('div', null, riga('Ripeti', freq), dettagli);
    function aggiorna() {
        svuota(dettagli);
        if (!freq.value)
            return;
        const unita = { D: 'giorni', W: 'settimane', M: 'mesi', Y: 'anni' }[freq.value];
        dettagli.appendChild(riga('Ogni', interv, h('span.dopo', null, unita)));
        if (freq.value === 'W') {
            if (!giorni.size)
                giorni.add((giornoBase().getDay() + 6) % 7);
            dettagli.appendChild(h('div.giorni-sett', null, GIORNI_BREVI.map((n, i) => {
                const b = h('button.chip' + (giorni.has(i) ? '.attivo' : ''), { type: 'button', onclick: () => {
                        if (giorni.has(i)) {
                            if (giorni.size > 1)
                                giorni.delete(i);
                        }
                        else
                            giorni.add(i);
                        b.classList.toggle('attivo', giorni.has(i));
                    } }, n);
                return b;
            })));
        }
        dettagli.appendChild(riga('Termina', fineTipo, fineTipo.value === 'data' ? fineData : fineTipo.value === 'num' ? fineNum : null));
    }
    aggiorna();
    return {
        el,
        valore() {
            if (!freq.value)
                return undefined;
            const out = { freq: freq.value, interval: Math.max(1, parseInt(interv.value, 10) || 1) };
            if (out.freq === 'W' && giorni.size)
                out.byday = Array.from(giorni).sort((a, b) => a - b);
            if (fineTipo.value === 'data' && fineData.value)
                out.until = fineData.value;
            if (fineTipo.value === 'num')
                out.count = Math.max(1, parseInt(fineNum.value, 10) || 1);
            return out;
        },
    };
}
function selettoreCategoria(valore) {
    return selettore([['', 'Nessuna']].concat(categorie().map(c => [c.id, c.nome])), valore || '');
}

// ============================================================
// 05-editor.ts — Fogli di creazione/modifica: evento, promemoria, nota.
// ============================================================
const PROMEMORIA_OPZ = [
    [0, "All'ora dell'evento"], [5, '5 minuti prima'], [10, '10 minuti prima'], [30, '30 minuti prima'],
    [60, '1 ora prima'], [120, '2 ore prima'], [1440, '1 giorno prima'], [2880, '2 giorni prima'],
];
function testoPromemoria(min) {
    const t = PROMEMORIA_OPZ.find(p => p[0] === min);
    return t ? t[1] : min + ' minuti prima';
}
/** Apre l'editor evento. `occ` = occorrenza toccata (per le serie); `preset` = nuovo evento. */
function apriEvento(esistente, occ, preset) {
    const nuovo = !esistente;
    const base = preset ? preset.inizio : new Date();
    let iniz0, fine0;
    if (occ) {
        iniz0 = occ.inizio;
        fine0 = occ.fine;
    }
    else if (esistente) {
        iniz0 = daDt(esistente.inizio);
        fine0 = daDt(esistente.fine);
    }
    else {
        iniz0 = new Date(base);
        if (!preset || (iniz0.getHours() === 0 && iniz0.getMinutes() === 0 && !preset.tuttoIlGiorno)) {
            // nessuna ora indicata: prossima ora piena
            const ora = new Date();
            iniz0.setHours(Math.min(23, ora.getHours() + 1), 0, 0, 0);
        }
        fine0 = piuMinuti(iniz0, 60);
    }
    const ev = esistente ? JSON.parse(JSON.stringify(esistente)) : {
        id: uid(), type: 'evento', updatedAt: 0, titolo: preset && preset.titolo || '', inizio: '', fine: '',
        tuttoIlGiorno: !!(preset && preset.tuttoIlGiorno), categoriaId: categorie()[0] ? categorie()[0].id : undefined,
        promemoria: [], checklist: [],
    };
    const titolo = h('input.titolo-grande', { type: 'text', placeholder: 'Titolo', value: ev.titolo, autocomplete: 'off' });
    const tutto = h('input', { type: 'checkbox', checked: ev.tuttoIlGiorno, onchange: () => vistaDate() });
    const dInizio = h('input', { type: 'date', value: ymd(iniz0) });
    const oInizio = h('input', { type: 'time', value: hm(iniz0) });
    const dFine = h('input', { type: 'date', value: ymd(fine0) });
    const oFine = h('input', { type: 'time', value: hm(fine0) });
    // Spostando l'inizio, la fine mantiene la durata.
    let durata = fine0.getTime() - iniz0.getTime();
    const leggi = () => ({ i: daDt(dInizio.value + 'T' + (tutto.checked ? '00:00' : oInizio.value || '00:00')), f: daDt(dFine.value + 'T' + (tutto.checked ? '23:59' : oFine.value || '00:00')) });
    const inizioCambiato = () => {
        if (!dInizio.value)
            return;
        const i = daDt(dInizio.value + 'T' + (oInizio.value || '00:00'));
        const f = new Date(i.getTime() + durata);
        dFine.value = ymd(f);
        oFine.value = hm(f);
    };
    const fineCambiata = () => { const v = leggi(); if (v.f > v.i)
        durata = daDt(dFine.value + 'T' + (oFine.value || '00:00')).getTime() - daDt(dInizio.value + 'T' + (oInizio.value || '00:00')).getTime(); };
    dInizio.onchange = inizioCambiato;
    oInizio.onchange = inizioCambiato;
    dFine.onchange = fineCambiata;
    oFine.onchange = fineCambiata;
    const zonaDate = h('div');
    function vistaDate() {
        svuota(zonaDate);
        zonaDate.appendChild(riga('Inizio', dInizio, tutto.checked ? null : oInizio));
        zonaDate.appendChild(riga('Fine', dFine, tutto.checked ? null : oFine));
    }
    vistaDate();
    const rip = campoRicorrenza(ev.rrule, () => daYmd(dInizio.value || ymd(new Date())));
    const luogo = h('input', { type: 'text', placeholder: 'Aggiungi luogo', value: ev.luogo || '' });
    const cat = selettoreCategoria(ev.categoriaId);
    const note = h('textarea', { rows: 4, placeholder: 'Note (markdown: **grassetto**, - elenco, # titolo)', value: ev.note || '' });
    // Promemoria multipli
    const prom = new Set(ev.promemoria || []);
    const zonaProm = h('div.chips');
    const selProm = selettore([['', '+ Aggiungi promemoria']].concat(PROMEMORIA_OPZ.map(p => [String(p[0]), p[1]])), '', () => {
        if (selProm.value !== '') {
            prom.add(parseInt(selProm.value, 10));
            selProm.value = '';
            disegnaProm();
        }
    });
    function disegnaProm() {
        svuota(zonaProm);
        Array.from(prom).sort((a, b) => a - b).forEach(m => zonaProm.appendChild(h('button.chip.attivo', { type: 'button', title: 'Tocca per togliere', onclick: () => { prom.delete(m); disegnaProm(); } }, testoPromemoria(m), ' ✕')));
    }
    disegnaProm();
    // Checklist interna
    const voci = (ev.checklist || []).map(v => ({ ...v }));
    const zonaCheck = h('div.checklist');
    const nuovaVoce = h('input', { type: 'text', placeholder: 'Aggiungi voce…', onkeydown: (e) => {
            if (e.key === 'Enter' && nuovaVoce.value.trim()) {
                voci.push({ id: uid(), testo: nuovaVoce.value.trim(), fatto: false });
                nuovaVoce.value = '';
                disegnaCheck();
                e.preventDefault();
            }
        } });
    function disegnaCheck() {
        svuota(zonaCheck);
        voci.forEach((v, i) => zonaCheck.appendChild(h('div.voce', null, h('input', { type: 'checkbox', checked: v.fatto, onchange: (e) => { v.fatto = e.target.checked; } }), h('input', { type: 'text', value: v.testo, oninput: (e) => { v.testo = e.target.value; } }), h('button.btn-ico', { type: 'button', 'aria-label': 'Togli voce', onclick: () => { voci.splice(i, 1); disegnaCheck(); } }, icona('x', 18)))));
    }
    disegnaCheck();
    // Allegati Drive: carico un file nella cartella dell'app oppure collego un file esistente col Picker.
    const allegati = (ev.allegati || []).map(a => ({ ...a }));
    const zonaAll = h('div.allegati');
    function disegnaAll() {
        svuota(zonaAll);
        if (!allegati.length)
            zonaAll.appendChild(h('div.tenue.piccolo', null, Drive.collegato ? 'Nessun allegato.' : 'Collega Google Drive da Altro → Google Drive per usare gli allegati.'));
        allegati.forEach((a, i) => zonaAll.appendChild(h('div.voce', null, h('button.allegato', { type: 'button', onclick: () => apriAllegato(a) }, '📎 ', a.nome), h('button.btn-ico', { type: 'button', 'aria-label': 'Togli allegato', onclick: () => { allegati.splice(i, 1); disegnaAll(); } }, icona('x', 18)))));
    }
    disegnaAll();
    const fileInput = h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: async () => {
            const files = Array.from(fileInput.files || []);
            fileInput.value = '';
            for (const f of files) {
                avviso('Carico ' + f.name + '…', 2500);
                try {
                    allegati.push(await Drive.caricaAllegato(f));
                    disegnaAll();
                }
                catch (e) {
                    avviso('Caricamento fallito: ' + (e.message || e), 6000);
                }
            }
        } });
    const btnCarica = h('button.btn.neutro', { type: 'button', onclick: () => fileInput.click() }, 'Carica file');
    const btnCollega = h('button.btn.neutro', { type: 'button', onclick: async () => {
            if (!Drive.pronto) {
                Drive.login();
                avviso('Accedi a Google, poi tocca di nuovo.');
                return;
            }
            try {
                for (const d of await scegliFileDrive({ multi: true, titolo: 'Collega file dal Drive' }))
                    allegati.push({ id: uid(), nome: d.name, driveId: d.id, mime: d.mimeType, url: d.url });
                disegnaAll();
            }
            catch (e) {
                avviso(String(e.message || e), 6000);
            }
        } }, 'Collega da Drive');
    const corpo = h('div.modulo', null, titolo, h('div.gruppo', null, riga('Tutto il giorno', tutto), zonaDate, rip.el), h('div.gruppo', null, riga('Categoria', cat), riga('Luogo', luogo)), h('div.gruppo', null, h('div.gruppo-titolo', null, 'Promemoria'), zonaProm, selProm), h('div.gruppo', null, h('div.gruppo-titolo', null, 'Checklist'), zonaCheck, nuovaVoce), h('div.gruppo', null, h('div.gruppo-titolo', null, 'Note'), note), h('div.gruppo', null, h('div.gruppo-titolo', null, 'Allegati Drive'), zonaAll, h('div.bottoni', null, btnCarica, btnCollega), fileInput));
    function raccogli() {
        const v = leggi();
        if (!dInizio.value || !dFine.value) {
            avviso('Indica le date');
            return null;
        }
        if (v.f < v.i) {
            avviso('La fine è prima dell\'inizio');
            return null;
        }
        if (nuovaVoce.value.trim())
            voci.push({ id: uid(), testo: nuovaVoce.value.trim(), fatto: false });
        ev.titolo = titolo.value.trim() || '(senza titolo)';
        ev.tuttoIlGiorno = tutto.checked;
        ev.inizio = dtStr(v.i);
        ev.fine = dtStr(v.f);
        ev.luogo = luogo.value.trim() || undefined;
        ev.categoriaId = cat.value || undefined;
        ev.note = note.value;
        ev.promemoria = Array.from(prom).sort((a, b) => a - b);
        ev.checklist = voci.filter(x => x.testo.trim());
        ev.rrule = rip.valore();
        ev.allegati = allegati;
        return ev;
    }
    const serie = !!(esistente && esistente.rrule && occ);
    const f = foglio({
        titolo: nuovo ? 'Nuovo evento' : 'Evento',
        corpo,
        salva: () => {
            const r = raccogli();
            if (!r)
                return false;
            if (!serie) {
                Stato.salva(r);
                return;
            }
            // Evento ricorrente: solo questa occorrenza o tutta la serie?
            chiedi('Evento ricorrente', [{ testo: 'Solo questo evento', valore: 'uno' }, { testo: 'Tutta la serie', valore: 'tutti' }]).then(scelta => {
                if (!scelta)
                    return;
                if (scelta === 'uno') {
                    // escludo il giorno dalla serie e creo un evento singolo modificato
                    const orig = Stato.prendi(esistente.id);
                    orig.exdate = (orig.exdate || []).concat([occ.chiave]);
                    Stato.salva(orig);
                    const singolo = { ...r, id: uid(), rrule: undefined, exdate: undefined, serieId: orig.id };
                    Stato.salva(singolo);
                }
                else {
                    // applico lo spostamento a tutta la serie mantenendo il giorno di partenza
                    const delta = daDt(r.inizio).getTime() - occ.inizio.getTime();
                    const dur = daDt(r.fine).getTime() - daDt(r.inizio).getTime();
                    const i0 = new Date(daDt(esistente.inizio).getTime() + delta);
                    r.inizio = dtStr(i0);
                    r.fine = dtStr(new Date(i0.getTime() + dur));
                    Stato.salva(r);
                }
                f.chiudi();
            });
            return false;
        },
        elimina: nuovo ? undefined : () => {
            const scelte = serie
                ? [{ testo: 'Solo questo evento', valore: 'uno', pericolo: true }, { testo: 'Tutta la serie', valore: 'tutti', pericolo: true }]
                : [{ testo: 'Elimina evento', valore: 'tutti', pericolo: true }];
            chiedi('Eliminare?', scelte, ev.titolo).then(scelta => {
                if (!scelta)
                    return;
                if (scelta === 'uno') {
                    const orig = Stato.prendi(esistente.id);
                    orig.exdate = (orig.exdate || []).concat([occ.chiave]);
                    Stato.salva(orig);
                }
                else
                    Stato.elimina(esistente.id);
                f.chiudi();
            });
        },
    });
    if (nuovo)
        setTimeout(() => { if (!document.activeElement || document.activeElement === document.body)
            titolo.focus(); }, 50);
}
/** Editor promemoria/task. */
function apriTask(esistente, preset) {
    const nuovo = !esistente;
    const t = esistente ? JSON.parse(JSON.stringify(esistente)) : {
        id: uid(), type: 'task', updatedAt: 0, titolo: preset && preset.titolo || '', priorita: 0, fatto: false,
        scadenza: preset ? preset.scadenza : undefined,
    };
    const titolo = h('input.titolo-grande', { type: 'text', placeholder: 'Cosa devi fare?', value: t.titolo, autocomplete: 'off' });
    const data = h('input', { type: 'date', value: t.scadenza ? t.scadenza.slice(0, 10) : '' });
    const ora = h('input', { type: 'time', value: t.scadenza && t.scadenza.length > 10 ? t.scadenza.slice(11) : '' });
    const prio = selettore([['0', 'Nessuna'], ['1', 'Bassa'], ['2', 'Media'], ['3', 'Alta']], String(t.priorita));
    const cat = selettoreCategoria(t.categoriaId);
    const rip = campoRicorrenza(t.rrule, () => data.value ? daYmd(data.value) : new Date());
    const note = h('textarea', { rows: 3, placeholder: 'Note', value: t.note || '' });
    const svuotaData = h('button.btn-testo', { type: 'button', onclick: () => { data.value = ''; ora.value = ''; } }, 'Togli');
    const f = foglio({
        titolo: nuovo ? 'Nuovo promemoria' : 'Promemoria',
        corpo: h('div.modulo', null, titolo, h('div.gruppo', null, riga('Scadenza', data, ora, svuotaData), rip.el, h('div.tenue.piccolo', null, 'Senza data resta in Inbox.')), h('div.gruppo', null, riga('Priorità', prio), riga('Categoria', cat)), h('div.gruppo', null, h('div.gruppo-titolo', null, 'Note'), note)),
        salva: () => {
            t.titolo = titolo.value.trim();
            if (!t.titolo) {
                avviso('Scrivi un titolo');
                return false;
            }
            t.scadenza = data.value ? (ora.value ? data.value + 'T' + ora.value : data.value) : undefined;
            t.priorita = parseInt(prio.value, 10) || 0;
            t.categoriaId = cat.value || undefined;
            t.rrule = t.scadenza ? rip.valore() : undefined;
            t.note = note.value;
            Stato.salva(t);
        },
        elimina: nuovo ? undefined : () => {
            chiedi('Eliminare il promemoria?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], t.titolo).then(s => { if (s) {
                Stato.elimina(t.id);
                f.chiudi();
            } });
        },
    });
    if (nuovo)
        setTimeout(() => { if (!document.activeElement || document.activeElement === document.body)
            titolo.focus(); }, 50);
}
/** Editor nota (con anteprima markdown). */
function apriNota(esistente, preset) {
    const nuovo = !esistente;
    const n = esistente ? JSON.parse(JSON.stringify(esistente)) : {
        id: uid(), type: 'nota', updatedAt: 0, titolo: '', testo: '', tag: [], giorno: preset ? preset.giorno : undefined,
    };
    const titolo = h('input.titolo-grande', { type: 'text', placeholder: 'Titolo', value: n.titolo, autocomplete: 'off' });
    const testo = h('textarea.nota-testo', { rows: 12, placeholder: 'Scrivi qui… (markdown)', value: n.testo });
    const tag = h('input', { type: 'text', placeholder: 'tag separati da virgola', value: n.tag.join(', '), autocapitalize: 'off' });
    const anteprima = h('div.md');
    let mostra = false;
    const btnAnt = h('button.btn-testo', { type: 'button', onclick: () => {
            mostra = !mostra;
            anteprima.innerHTML = mostra ? md(testo.value) : '';
            testo.style.display = mostra ? 'none' : '';
            btnAnt.textContent = mostra ? 'Modifica' : 'Anteprima';
        } }, 'Anteprima');
    const f = foglio({
        titolo: n.giorno ? 'Nota del ' + fmt(daYmd(n.giorno), { day: 'numeric', month: 'long' }) : (nuovo ? 'Nuova nota' : 'Nota'),
        corpo: h('div.modulo', null, titolo, h('div.gruppo', null, h('div.gruppo-titolo', null, 'Testo', btnAnt), testo, anteprima), h('div.gruppo', null, riga('Tag', tag))),
        salva: () => {
            n.titolo = titolo.value.trim();
            n.testo = testo.value;
            n.tag = tag.value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
            if (!n.titolo && !n.testo.trim()) {
                if (!nuovo)
                    Stato.elimina(n.id);
                return;
            }
            if (!n.titolo)
                n.titolo = n.testo.trim().split('\n')[0].slice(0, 60);
            Stato.salva(n);
        },
        elimina: nuovo ? undefined : () => {
            chiedi('Eliminare la nota?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], n.titolo).then(s => { if (s) {
                Stato.elimina(n.id);
                f.chiudi();
            } });
        },
    });
    if (nuovo)
        setTimeout(() => { if (!document.activeElement || document.activeElement === document.body)
            testo.focus(); }, 50);
}
/** Menu del pulsante "+": cosa vuoi creare? */
function apriNuovo(giorno) {
    const g = giorno || oggi();
    chiedi('Nuovo', [
        { testo: 'Evento', valore: 'evento' },
        { testo: 'Promemoria', valore: 'task' },
        { testo: 'Nota', valore: 'nota' },
    ], dataLunga(g)).then(s => {
        if (s === 'evento')
            apriEvento(undefined, undefined, { inizio: g });
        else if (s === 'task')
            apriTask(undefined, { scadenza: stessoGiorno(g, oggi()) && !giorno ? undefined : ymd(g) });
        else if (s === 'nota')
            apriNota();
    });
}

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
const SECONDO_ACCOUNT = 'nicoleschirru@gmail.com';
const ACCOUNT_AMMESSI = [PROPRIETARIO, SECONDO_ACCOUNT].filter(Boolean);
const CARTELLA_APP = 'Calendario personale';
/** Permessi richiesti: si aggiunge Google Calendar solo se lo specchio è attivo. */
function scopeAttuale() { try {
    return G_SCOPE + (imp().gcal ? ' https://www.googleapis.com/auth/calendar.app.created' : '');
}
catch (_) {
    return G_SCOPE;
} }
const SOTTOCARTELLE = ['dati', 'allegati', 'backup', 'studio', '_cestino app'];
const Drive = (() => {
    let token = '';
    let scadenzaToken = 0;
    let client = null;
    let cartelle = {}; // nome → id (cache in localStorage)
    let idDati = '';
    let timerSync = 0;
    let inCorso = false;
    const stato = { sync: 'spento', messaggio: '', email: '', ultimoSync: 0 };
    const ascoltatori = [];
    const LS = {
        get(k, def) { try {
            const v = localStorage.getItem('imc-' + k);
            return v ? JSON.parse(v) : def;
        }
        catch (_) {
            return def;
        } },
        set(k, v) { try {
            localStorage.setItem('imc-' + k, JSON.stringify(v));
        }
        catch (_) { /* niente */ } },
    };
    cartelle = LS.get('cartelle', {});
    idDati = LS.get('idDati', '');
    stato.email = LS.get('email', '');
    stato.ultimoSync = LS.get('ultimoSync', 0);
    if (stato.email)
        stato.sync = 'attesa';
    function cambia(s, msg = '') { stato.sync = s; stato.messaggio = msg; ascoltatori.forEach(f => f()); }
    function script(src) {
        return new Promise((ok, ko) => {
            if (document.querySelector('script[src="' + src + '"]'))
                return ok();
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => ok();
            s.onerror = () => ko(new Error('Impossibile caricare ' + src));
            document.head.appendChild(s);
        });
    }
    /** Ottiene un token. interattivo=false prova in silenzio (sessione Google già attiva). */
    async function accedi(interattivo) {
        await script('https://accounts.google.com/gsi/client');
        return new Promise(ok => {
            if (!client)
                client = google.accounts.oauth2.initTokenClient({ client_id: G_CLIENT_ID, scope: G_SCOPE, callback: () => { } });
            client.callback = (r) => {
                if (r && r.access_token) {
                    token = r.access_token;
                    scadenzaToken = Date.now() + (r.expires_in - 60) * 1000;
                    ok(true);
                }
                else
                    ok(false);
            };
            client.error_callback = () => ok(false);
            try {
                client.requestAccessToken(interattivo ? { prompt: '', scope: scopeAttuale(), login_hint: stato.email || undefined } : { prompt: 'none', scope: scopeAttuale(), login_hint: stato.email || undefined });
            }
            catch (_) {
                ok(false);
            }
        });
    }
    async function tokenValido(interattivo = false) {
        if (token && Date.now() < scadenzaToken)
            return token;
        if (await accedi(false))
            return token;
        if (interattivo && await accedi(true))
            return token;
        return '';
    }
    /** Chiamata REST a Drive. Rilancia l'errore con testo leggibile. */
    async function api(percorso, opz = {}, base = 'https://www.googleapis.com/drive/v3/') {
        const t = await tokenValido(false);
        if (!t)
            throw new Error('NOLOGIN');
        const url = new URL(base + percorso);
        if (opz.query)
            for (const k in opz.query)
                url.searchParams.set(k, opz.query[k]);
        const r = await fetch(url.toString(), { ...opz, headers: { Authorization: 'Bearer ' + t, ...(opz.headers || {}) } });
        if (r.status === 401) {
            token = '';
            throw new Error('NOLOGIN');
        }
        if (!r.ok) {
            const txt = await r.text();
            throw new Error('Drive ' + r.status + ': ' + txt.slice(0, 200));
        }
        if ((opz.query && opz.query.alt === 'media') || percorso.endsWith('/export'))
            return r; // download: restituisco la Response grezza
        const ct = r.headers.get('content-type') || '';
        return ct.includes('json') ? r.json() : r;
    }
    async function chiSono() {
        const r = await api('', {}, 'https://www.googleapis.com/oauth2/v3/userinfo');
        return r.email || '';
    }
    /** Trova (o crea) una cartella per nome dentro `parent`. */
    async function cartella(nome, parent) {
        const q = "name = '" + nome.replace(/'/g, "\\'") + "' and mimeType = 'application/vnd.google-apps.folder' and '" + parent + "' in parents and trashed = false";
        const r = await api('files', { query: { q, fields: 'files(id,name)', spaces: 'drive' } });
        if (r.files && r.files.length)
            return r.files[0].id;
        const c = await api('files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }), query: { fields: 'id' } });
        return c.id;
    }
    async function preparaCartelle() {
        if (cartelle.app && cartelle['_cestino app'])
            return;
        const app = await cartella(CARTELLA_APP, 'root');
        const nuove = { app };
        for (const n of SOTTOCARTELLE)
            nuove[n] = await cartella(n, app);
        cartelle = nuove;
        LS.set('cartelle', cartelle);
    }
    function idCartella(n) { return cartelle[n]; }
    /** v0.21: sottocartella dell'app creata al bisogno (es. «Appunti»), ricordata in locale. */
    async function sottocartella(nome) {
        await preparaCartelle();
        if (!cartelle[nome]) {
            cartelle[nome] = await cartella(nome, cartelle.app);
            LS.set('cartelle', cartelle);
        }
        return cartelle[nome];
    }
    /** Carica (crea o aggiorna) un file; contenuto testo o Blob. Ritorna l'id. */
    async function carica(nome, parent, contenuto, mime, idEsistente) {
        const meta = idEsistente ? { name: nome } : { name: nome, parents: [parent] };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
        form.append('file', contenuto instanceof Blob ? contenuto : new Blob([contenuto], { type: mime }));
        const r = await api('files' + (idEsistente ? '/' + idEsistente : ''), { method: idEsistente ? 'PATCH' : 'POST', body: form, query: { uploadType: 'multipart', fields: 'id,name,size,modifiedTime' } }, 'https://www.googleapis.com/upload/drive/v3/');
        return r.id;
    }
    async function scaricaTesto(id) {
        const r = await api('files/' + id, { query: { alt: 'media' } });
        return r.text();
    }
    async function scaricaBlob(id) {
        const r = await api('files/' + id, { query: { alt: 'media' } });
        return r.blob();
    }
    async function trovaFile(nome, parent) {
        const q = "name = '" + nome.replace(/'/g, "\\'") + "' and '" + parent + "' in parents and trashed = false";
        const r = await api('files', { query: { q, fields: 'files(id,name,modifiedTime)', orderBy: 'modifiedTime desc' } });
        return r.files && r.files[0] || null;
    }
    async function elenca(parent, extra = '') {
        const r = await api('files', { query: { q: "'" + parent + "' in parents and trashed = false" + extra, fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)', orderBy: 'name', pageSize: '200' } });
        return r.files || [];
    }
    /** Elenco completo (tutte le pagine) dei file di una cartella. */
    async function elencaTutti(parent) {
        const out = [];
        let pageToken = '';
        do {
            const query = { q: "'" + parent + "' in parents and trashed = false", fields: 'nextPageToken,files(id,name)', pageSize: '1000' };
            if (pageToken)
                query.pageToken = pageToken;
            const r = await api('files', { query });
            out.push(...(r.files || []));
            pageToken = r.nextPageToken || '';
        } while (pageToken);
        return out;
    }
    /** Cerca file nel Drive (sola lettura): per nome, opzionalmente per tipo. Più recenti prima. */
    async function cerca(testo, mime) {
        // v0.18: con mime = cartella cerca solo cartelle (import di mazzi), altrimenti solo file
        let q = "trashed = false";
        q += mime ? " and mimeType = '" + mime + "'" : " and mimeType != 'application/vnd.google-apps.folder'";
        if (testo.trim())
            q += " and name contains '" + testo.trim().replace(/\\/g, '').replace(/'/g, "\\'") + "'";
        const r = await api('files', { query: { q, fields: 'files(id,name,mimeType,webViewLink,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: '40' } });
        return r.files || [];
    }
    /** v0.18: contenuto di una cartella con tipo e data (sottocartelle incluse), per importare i mazzi. */
    async function elencaCompleti(parent) {
        const out = [];
        let pageToken = '';
        do {
            const query = { q: "'" + parent + "' in parents and trashed = false", fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)', pageSize: '1000' };
            if (pageToken)
                query.pageToken = pageToken;
            const r = await api('files', { query });
            out.push(...(r.files || []));
            pageToken = r.nextPageToken || '';
        } while (pageToken);
        return out;
    }
    /** v0.11: cerca cartelle per nome (sola lettura). */
    async function cercaCartelle(testo) {
        const q = "trashed = false and mimeType = 'application/vnd.google-apps.folder' and name contains '" + testo.replace(/'/g, "\\'") + "'";
        const r = await api('files', { query: { q, fields: 'files(id,name)', pageSize: '20' } });
        return r.files || [];
    }
    /** Esporta un Google Sheet (primo foglio) come CSV. */
    async function esportaCsv(id) { const r = await api('files/' + id + '/export', { query: { mimeType: 'text/csv' } }); return r.text(); }
    /** Mai eliminare: sposta nel cestino dell'app. */
    async function cestinaApp(id, daParent) {
        await api('files/' + id, { method: 'PATCH', query: { addParents: cartelle['_cestino app'], removeParents: daParent, fields: 'id' } });
    }
    // ---------- Backup giornaliero ----------
    async function backupSeServe(testoAttuale) {
        const oggiK = ymd(new Date());
        if (LS.get('ultimoBackup', '') === oggiK)
            return;
        const dir = idCartella('backup');
        // un altro dispositivo può averlo già fatto oggi: controllo su Drive
        if (await trovaFile('dati-' + oggiK + '.json', dir)) {
            LS.set('ultimoBackup', oggiK);
            return;
        }
        await carica('dati-' + oggiK + '.json', dir, testoAttuale, 'application/json');
        LS.set('ultimoBackup', oggiK);
        // conservo gli ultimi 30: i più vecchi vanno in _cestino app (mai eliminati)
        const tutti = (await elenca(dir, " and name contains 'dati-'")).sort((a, b) => a.name < b.name ? 1 : -1);
        for (const f of tutti.slice(30))
            await cestinaApp(f.id, dir);
    }
    // ---------- Sincronizzazione ----------
    async function sincronizza(forzaLogin = false) {
        if (inCorso)
            return;
        if (!navigator.onLine) {
            cambia('offline', 'Sei offline: le modifiche partiranno appena torna la rete.');
            return;
        }
        inCorso = true;
        cambia('incorso');
        try {
            if (!await tokenValido(forzaLogin))
                throw new Error('NOLOGIN');
            if (!stato.email) {
                const email = await chiSono();
                if (!ACCOUNT_AMMESSI.includes(email.toLowerCase())) {
                    try {
                        google.accounts.oauth2.revoke(token, () => { });
                    }
                    catch (_) { /* niente */ }
                    token = '';
                    throw new Error('Questa app è privata: l\'account ' + email + ' non è autorizzato.');
                }
                stato.email = email;
                LS.set('email', stato.email);
                if (typeof Studio !== 'undefined') {
                    if (email.toLowerCase() !== PROPRIETARIO)
                        Studio.togliSito();
                    else
                        Studio.caricaDalSito();
                }
            }
            await preparaCartelle();
            // 1. scarico il file remoto
            let remoti = [];
            if (!idDati) {
                const f = await trovaFile('dati.json', idCartella('dati'));
                if (f) {
                    idDati = f.id;
                    LS.set('idDati', idDati);
                }
            }
            let testoRemoto = '';
            if (idDati) {
                try {
                    testoRemoto = await scaricaTesto(idDati);
                }
                catch (e) {
                    if (String(e.message).includes('404')) {
                        idDati = '';
                        LS.set('idDati', '');
                    }
                    else
                        throw e;
                }
            }
            if (testoRemoto) {
                try {
                    const j = JSON.parse(testoRemoto);
                    remoti = Array.isArray(j) ? j : j.records || [];
                }
                catch (_) {
                    throw new Error('Il file dati.json su Drive non è leggibile: non lo sovrascrivo.');
                }
            }
            // 2. unisco (vince l'updatedAt più alto, per record)
            Stato.unisci(remoti);
            // 3. se ho qualcosa di più nuovo del remoto, ricarico
            const remotiMap = new Map(remoti.map(r => [r.id, r.updatedAt || 0]));
            const miei = Stato.esporta();
            const daSpedire = miei.some(r => (r.updatedAt || 0) > (remotiMap.get(r.id) || 0));
            if (daSpedire || !idDati) {
                if (testoRemoto)
                    await backupSeServe(testoRemoto);
                const testo = JSON.stringify({ formato: 'il-mio-calendario', versione: 1, salvatoIl: new Date().toISOString(), records: miei });
                idDati = await carica('dati.json', idCartella('dati'), testo, 'application/json', idDati || undefined);
                LS.set('idDati', idDati);
            }
            stato.ultimoSync = Date.now();
            LS.set('ultimoSync', stato.ultimoSync);
            applicaTema();
            cambia('ok');
            if (typeof GCal !== 'undefined' && GCal.attivo())
                GCal.allinea().catch(e => { if (String(e.message).includes('403') || String(e.message) === 'NOLOGIN')
                    cambia('attesa', 'Tocca per autorizzare Google Calendar.'); });
        }
        catch (e) {
            const m = String(e && e.message || e);
            if (m === 'NOLOGIN')
                cambia(stato.email ? 'attesa' : 'spento', stato.email ? 'Tocca per accedere di nuovo a Google.' : '');
            else if (m.includes('Failed to fetch'))
                cambia('offline', 'Rete assente o Google non raggiungibile.');
            else
                cambia('errore', m);
        }
        finally {
            inCorso = false;
        }
    }
    /** Sync "a breve": dopo una modifica aspetto 3 s per raggruppare. */
    function programma() {
        if (!stato.email)
            return;
        clearTimeout(timerSync);
        if (stato.sync !== 'incorso')
            cambia('attesa');
        timerSync = window.setTimeout(() => sincronizza(false), 3000);
    }
    /** Precarica la libreria Google, così al tocco il popup si apre subito. */
    function precarica() {
        script('https://accounts.google.com/gsi/client').then(() => {
            if (!client)
                client = google.accounts.oauth2.initTokenClient({ client_id: G_CLIENT_ID, scope: G_SCOPE, callback: () => { } });
        }).catch(() => { });
    }
    /** DA CHIAMARE DIRETTAMENTE DAL TOCCO (niente await prima): apre il popup Google. */
    function login() {
        if (!client) {
            precarica();
            avviso('Sto caricando Google… tocca di nuovo tra un secondo.');
            return;
        }
        const primaVolta = !stato.email;
        client.callback = async (r) => {
            if (!r || !r.access_token) {
                cambia('errore', 'Accesso annullato o non riuscito.');
                return;
            }
            token = r.access_token;
            scadenzaToken = Date.now() + (r.expires_in - 60) * 1000;
            if (primaVolta)
                stato.email = '';
            await sincronizza(false);
            if (stato.sync === 'ok' && primaVolta)
                avviso('Collegato a Google Drive come ' + stato.email);
        };
        client.error_callback = (e) => cambia('errore', e && e.type === 'popup_failed_to_open'
            ? 'Il browser ha bloccato la finestra di Google: consenti i popup per questo sito e riprova.'
            : 'Finestra di Google chiusa.');
        client.requestAccessToken({ prompt: primaVolta ? 'select_account' : '', scope: scopeAttuale(), login_hint: stato.email || undefined });
    }
    function logout() {
        if (token) {
            try {
                google.accounts.oauth2.revoke(token, () => { });
            }
            catch (_) { /* niente */ }
        }
        token = '';
        stato.email = '';
        stato.ultimoSync = 0;
        LS.set('email', '');
        LS.set('ultimoSync', 0);
        cambia('spento');
    }
    // ---------- Allegati ----------
    async function caricaAllegato(file, parent) {
        if (!await tokenValido(true))
            throw new Error('Accedi a Google per caricare allegati.');
        await preparaCartelle();
        const id = await carica(file.name, parent || idCartella('allegati'), file, file.type || 'application/octet-stream');
        return { id: uid(), nome: file.name, driveId: id, mime: file.type, url: 'https://drive.google.com/file/d/' + id + '/view' };
    }
    /** Google Picker per scegliere un file esistente (lo rende accessibile all'app). */
    async function scegliConPicker(opz = {}) {
        const t = await tokenValido(true);
        if (!t)
            throw new Error('Accedi a Google prima.');
        await script('https://apis.google.com/js/api.js');
        await new Promise(ok => gapi.load('picker', () => ok()));
        return new Promise(ok => {
            const vista = new google.picker.DocsView(opz.cartelle ? google.picker.ViewId.FOLDERS : google.picker.ViewId.DOCS)
                .setIncludeFolders(true).setParent('root');
            if (opz.cartelle)
                vista.setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder');
            if (opz.mime)
                vista.setMimeTypes(opz.mime);
            let b = new google.picker.PickerBuilder()
                .setOAuthToken(t).setDeveloperKey(G_API_KEY).setAppId(G_APP_ID)
                .setLocale('it').setTitle(opz.cartelle ? 'Scegli una cartella' : 'Scegli un file')
                .addView(vista)
                .setCallback((d) => {
                if (d.action === google.picker.Action.PICKED)
                    ok((d.docs || []).map((x) => ({ id: x.id, name: x.name, mimeType: x.mimeType, url: x.url })));
                else if (d.action === google.picker.Action.CANCEL)
                    ok([]);
            });
            if (opz.multi)
                b = b.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
            if (!opz.cartelle)
                b = b.enableFeature(google.picker.Feature.NAV_HIDDEN);
            b.build().setVisible(true);
        });
    }
    window.addEventListener('online', () => { if (stato.email)
        sincronizza(false); });
    return {
        stato, ascolta(f) { ascoltatori.push(f); },
        sincronizza, programma, login, logout, precarica,
        caricaAllegato, scegliConPicker, scaricaBlob, scaricaTesto, elenca, trovaFile, carica, idCartella, sottocartella, preparaCartelle, tokenValido,
        elencaTutti, elencaCompleti, esportaCsv, cerca, cercaCartelle,
        get collegato() { return !!stato.email; },
        /** v0.26: proprietario dell'app, o nessun account ancora collegato (anteprima, primo avvio). */
        eProprietario() { return stato.email ? stato.email.toLowerCase() === PROPRIETARIO : (['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:'); }, // v0.26.2: senza account solo in prova locale
        /** true se c'è un token valido adesso (senza aprire finestre). */
        get pronto() { return !!token && Date.now() < scadenzaToken; },
    };
})();
/** Apre un allegato: link Drive in una nuova scheda (il viewer in-app arriva con la Fase 3). */
function apriAllegato(a) {
    const url = a.url || (a.driveId ? 'https://drive.google.com/file/d/' + a.driveId + '/view' : '');
    if (url)
        window.open(url, '_blank', 'noopener');
}
/** Testo e colore dell'indicatore di stato sync. */
function descrSync() {
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
function scegliFileDrive(opz = {}) {
    return new Promise(ok => {
        const scelti = new Map();
        const lista = h('div.lista-file');
        const campo = h('input.rapido', { type: 'search', placeholder: 'Cerca per nome…', oninput: () => { clearTimeout(timer); timer = window.setTimeout(carica, 350); } });
        let timer = 0, giro = 0, finito = false;
        const fine = (v) => { if (finito)
            return; finito = true; ok(v); };
        async function carica() {
            const mio = ++giro;
            svuota(lista);
            lista.appendChild(h('div.vuoto', null, 'Cerco…'));
            try {
                const f = await Drive.cerca(campo.value, opz.mime);
                if (mio !== giro)
                    return;
                svuota(lista);
                if (!f.length)
                    lista.appendChild(h('div.vuoto', null, 'Nessun file trovato.'));
                for (const x of f) {
                    const v = { id: x.id, name: x.name, mimeType: x.mimeType, url: x.webViewLink || 'https://drive.google.com/file/d/' + x.id + '/view' };
                    const el = h('button.voce-lista' + (scelti.has(x.id) ? '.scelto' : ''), { onclick: () => {
                            if (!opz.multi) {
                                fs.chiudi();
                                fine([v]);
                                return;
                            }
                            if (scelti.has(x.id))
                                scelti.delete(x.id);
                            else
                                scelti.set(x.id, v);
                            el.classList.toggle('scelto', scelti.has(x.id));
                        } }, h('span.voce-corpo', null, h('span.voce-titolo', null, x.name), h('span.voce-sotto', null, fmt(new Date(x.modifiedTime), { day: 'numeric', month: 'short', year: 'numeric' }))));
                    lista.appendChild(el);
                }
            }
            catch (e) {
                svuota(lista);
                lista.appendChild(h('div.vuoto', null, String(e.message || e)));
            }
        }
        const fs = foglio({ titolo: opz.titolo || 'Scegli dal Drive', corpo: h('div.modulo', null, campo, lista),
            etichettaSalva: opz.multi ? 'Aggiungi' : undefined,
            salva: opz.multi ? () => { fine(Array.from(scelti.values())); } : undefined });
        // chiusura con Annulla / tocco fuori: risolvo con vuoto
        const oss = new MutationObserver(() => { if (!document.body.contains(lista)) {
            oss.disconnect();
            fine([]);
        } });
        oss.observe(document.body, { childList: true });
        carica();
        setTimeout(() => campo.focus(), 50);
    });
}

// ============================================================
// 06-gcal.ts — Specchio su Google Calendar + import/export .ics.
//
// SPECCHIO (Livello 2 delle notifiche): gli eventi (e i promemoria con ora)
// delle categorie scelte vengono copiati in un calendario Google DEDICATO,
// "Il mio calendario – app", creato dall'app. Così le notifiche arrivano
// native dall'app Google Calendar / Calendario di iOS.
// - Scope: calendar.app.created → l'app vede e modifica SOLO i calendari che
//   ha creato lei, non gli altri tuoi calendari.
// - Id evento Google = UUID del record senza trattini (deterministico): niente
//   doppioni anche se lo specchio gira da due dispositivi.
// - Si invia solo ciò che è cambiato (mappa id → updatedAt in localStorage).
// ============================================================
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const GCAL_NOME = 'Il mio calendario – app';
const GCal = (() => {
    let inCorso = false, timer = 0;
    const LSK = 'imc-gcal-inviati';
    const inviati = () => { try {
        return JSON.parse(localStorage.getItem(LSK) || '{}');
    }
    catch (_) {
        return {};
    } };
    const salvaInviati = (m) => { try {
        localStorage.setItem(LSK, JSON.stringify(m));
    }
    catch (_) { /* niente */ } };
    const attivo = () => !!imp().gcal;
    async function chiama(percorso, opz = {}) {
        const t = await Drive.tokenValido(false);
        if (!t)
            throw new Error('NOLOGIN');
        const r = await fetch('https://www.googleapis.com/calendar/v3/' + percorso, { ...opz, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', ...(opz.headers || {}) } });
        if (r.status === 204)
            return null;
        if (!r.ok) {
            const e = new Error('Calendar ' + r.status + ': ' + (await r.text()).slice(0, 200));
            e.status = r.status;
            throw e;
        }
        return r.json();
    }
    /** Trova o crea il calendario dedicato; l'id è salvato nelle impostazioni (condiviso tra dispositivi). */
    async function calendario() {
        const i = imp();
        if (i.gcalId) {
            try {
                await chiama('calendars/' + encodeURIComponent(i.gcalId));
                return i.gcalId;
            }
            catch (e) {
                if (e.status !== 404)
                    throw e;
            }
        }
        const c = await chiama('calendars', { method: 'POST', body: JSON.stringify({ summary: GCAL_NOME, timeZone: 'Europe/Rome', description: 'Creato dall\'app "Il mio calendario". Si aggiorna da solo: le modifiche vanno fatte nell\'app.' }) });
        i.gcalId = c.id;
        Stato.salva(i);
        return c.id;
    }
    /** Id evento valido per Google (esadecimale, 32 caratteri) ricavato da una stringa. */
    function hashHex(s) {
        let out = '';
        for (let k = 0; k < 4; k++) {
            let h = 0x811c9dc5 ^ k;
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619) >>> 0;
            }
            out += h.toString(16).padStart(8, '0');
        }
        return out;
    }
    function idGoogle(id) { return id.replace(/[^0-9a-f]/gi, '').toLowerCase().padEnd(5, '0'); }
    const dtG = (s) => s.length > 10 ? s + ':00' : s;
    function rruleIcs(rr) {
        let r = 'RRULE:FREQ=' + { D: 'DAILY', W: 'WEEKLY', M: 'MONTHLY', Y: 'YEARLY' }[rr.freq] + ';INTERVAL=' + (rr.interval || 1);
        if (rr.byday && rr.byday.length)
            r += ';BYDAY=' + rr.byday.map(g => ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][g]).join(',');
        if (rr.until)
            r += ';UNTIL=' + rr.until.replace(/-/g, '') + 'T225959Z';
        if (rr.count)
            r += ';COUNT=' + rr.count;
        return r;
    }
    /** Converte un record nella risorsa evento Google (null = non va nello specchio). */
    function risorsa(r) {
        const cats = imp().gcalCategorie || [];
        if (r.deleted || (cats.length && !cats.includes(r.categoriaId || '')))
            return null;
        if (r.type === 'evento') {
            const e = r;
            const corpo = { id: idGoogle(e.id), summary: e.titolo, location: e.luogo || undefined, description: (e.note || '') + '\n\n(da Il mio calendario)',
                reminders: { useDefault: false, overrides: (e.promemoria || []).slice(0, 5).map(m => ({ method: 'popup', minutes: m })) } };
            if (e.tuttoIlGiorno) {
                corpo.start = { date: e.inizio.slice(0, 10) };
                corpo.end = { date: ymd(piuGiorni(daYmd(e.fine), 1)) };
            }
            else {
                corpo.start = { dateTime: dtG(e.inizio), timeZone: 'Europe/Rome' };
                corpo.end = { dateTime: dtG(e.fine), timeZone: 'Europe/Rome' };
            }
            const rec = [];
            if (e.rrule)
                rec.push(rruleIcs(e.rrule));
            if (e.rrule && e.exdate && e.exdate.length)
                rec.push(e.tuttoIlGiorno ? 'EXDATE;VALUE=DATE:' + e.exdate.map(d => d.replace(/-/g, '')).join(',') : 'EXDATE;TZID=Europe/Rome:' + e.exdate.map(d => d.replace(/-/g, '') + 'T' + e.inizio.slice(11).replace(':', '') + '00').join(','));
            if (rec.length)
                corpo.recurrence = rec;
            return corpo;
        }
        if (r.type === 'task') {
            const t = r;
            if (t.fatto || !t.scadenza || t.scadenza.length <= 10)
                return null; // solo promemoria con ora
            const fine = dtStr(piuMinuti(daDt(t.scadenza), 15));
            return { id: idGoogle(t.id), summary: '☑ ' + t.titolo, description: (t.note || '') + '\n\n(promemoria da Il mio calendario)',
                start: { dateTime: dtG(t.scadenza), timeZone: 'Europe/Rome' }, end: { dateTime: dtG(fine), timeZone: 'Europe/Rome' },
                reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }, ...(t.rrule ? { recurrence: [rruleIcs(t.rrule)] } : {}) };
        }
        return null;
    }
    let corrente = null;
    /** Se un allineamento è già in corso, aspetta che finisca e poi ne fa un altro (così nulla va perso). */
    async function allinea(tutto = false) {
        while (corrente) {
            try {
                await corrente;
            }
            catch (_) { /* niente */ }
        }
        corrente = allineaOra(tutto);
        try {
            return await corrente;
        }
        finally {
            corrente = null;
        }
    }
    async function allineaOra(tutto) {
        if (!attivo() || !navigator.onLine)
            return 0;
        inCorso = true;
        try {
            const cal = encodeURIComponent(await calendario()), giaInviati = tutto ? {} : inviati(), nuovi = { ...giaInviati };
            let n = 0;
            for (const r of Stato.esporta()) {
                if (r.type !== 'evento' && r.type !== 'task')
                    continue;
                if (giaInviati[r.id] === r.updatedAt)
                    continue;
                const corpo = risorsa(r), gid = idGoogle(r.id);
                try {
                    if (!corpo) {
                        if (giaInviati[r.id] !== undefined || tutto) {
                            try {
                                await chiama('calendars/' + cal + '/events/' + gid, { method: 'DELETE' });
                            }
                            catch (e) {
                                if (e.status !== 404 && e.status !== 410)
                                    throw e;
                            }
                        }
                    }
                    else {
                        try {
                            await chiama('calendars/' + cal + '/events/' + gid, { method: 'PUT', body: JSON.stringify(corpo) });
                        }
                        catch (e) {
                            if (e.status === 404)
                                await chiama('calendars/' + cal + '/events', { method: 'POST', body: JSON.stringify(corpo) });
                            else
                                throw e;
                        }
                        n++;
                    }
                    nuovi[r.id] = r.updatedAt;
                }
                catch (e) {
                    if (e.status === 401 || e.status === 403)
                        throw e;
                    console.warn('specchio', r.id, e);
                }
            }
            // Blocchi del piano di studio (un evento per voce, id derivato da piano+step: stabile).
            const vivi = new Set();
            if (imp().gcalStudio)
                for (const p of [...Studio.pianiAttivi(), ...Studio.pianiVirtuali()])
                    for (const g of p.giorni)
                        for (const v of g.voci) {
                            const data = Studio.dataVoce(v, g, p.id), chiave = 'piano:' + p.id + ':' + v.k, gid = hashHex(chiave);
                            vivi.add(chiave);
                            const ora = imp().gcalStudioOra || '';
                            const firma = data + '|' + ora + '|' + v.t;
                            if (giaInviati[chiave] !== undefined && nuovi['f:' + chiave] === firma)
                                continue;
                            const titolo = (p.modo === 'raffinamento' && !v.speciale ? 'Raffina ' : '📚 ') + (v.speciale ? v.t : Studio.etichetta(v.k) + ' · ' + v.t);
                            const corpo = { id: gid, summary: titolo, description: (v.d || g.nota || '') + '\n\n(dal ' + p.titolo + ' — Il mio calendario)' };
                            if (ora) {
                                const i = data + 'T' + ora;
                                corpo.start = { dateTime: i + ':00', timeZone: 'Europe/Rome' };
                                corpo.end = { dateTime: dtStr(piuMinuti(daDt(i), 60)) + ':00', timeZone: 'Europe/Rome' };
                                corpo.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] };
                            }
                            else {
                                corpo.start = { date: data };
                                corpo.end = { date: ymd(piuGiorni(daYmd(data), 1)) };
                                corpo.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] };
                            }
                            try {
                                try {
                                    await chiama('calendars/' + cal + '/events/' + gid, { method: 'PUT', body: JSON.stringify(corpo) });
                                }
                                catch (e) {
                                    if (e.status === 404)
                                        await chiama('calendars/' + cal + '/events', { method: 'POST', body: JSON.stringify(corpo) });
                                    else
                                        throw e;
                                }
                                nuovi[chiave] = 1;
                                nuovi['f:' + chiave] = firma;
                                n++;
                            }
                            catch (e) {
                                if (e.status === 401 || e.status === 403)
                                    throw e;
                            }
                        }
            // Studio disattivato (o voce sparita): tolgo i blocchi copiati prima
            for (const chiave of Object.keys(nuovi))
                if (chiave.startsWith('piano:') && !vivi.has(chiave)) {
                    try {
                        await chiama('calendars/' + cal + '/events/' + hashHex(chiave), { method: 'DELETE' });
                    }
                    catch (e) {
                        if (e.status !== 404 && e.status !== 410)
                            throw e;
                    }
                    delete nuovi[chiave];
                    delete nuovi['f:' + chiave];
                }
            salvaInviati(nuovi);
            return n;
        }
        finally {
            inCorso = false;
        }
    }
    function programma() { if (!attivo())
        return; clearTimeout(timer); timer = window.setTimeout(() => allinea().catch(() => { }), 5000); }
    return { allinea, programma, attivo, GCAL_NOME };
})();
// ---------- .ics ----------
function icsEsc(s) { return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function icsData(s, tutto) { return tutto ? ';VALUE=DATE:' + s.slice(0, 10).replace(/-/g, '') : ';TZID=Europe/Rome:' + s.replace(/-/g, '').replace(':', '') + '00'; }
function esportaIcs() {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Il mio calendario//IT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Il mio calendario', 'X-WR-TIMEZONE:Europe/Rome'];
    const ora = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    for (const e of Stato.tutti('evento')) {
        const fine = e.tuttoIlGiorno ? ymd(piuGiorni(daYmd(e.fine), 1)) : e.fine;
        L.push('BEGIN:VEVENT', 'UID:' + e.id + '@il-mio-calendario', 'DTSTAMP:' + ora, 'DTSTART' + icsData(e.inizio, e.tuttoIlGiorno), 'DTEND' + icsData(fine, e.tuttoIlGiorno), 'SUMMARY:' + icsEsc(e.titolo));
        if (e.luogo)
            L.push('LOCATION:' + icsEsc(e.luogo));
        if (e.note)
            L.push('DESCRIPTION:' + icsEsc(e.note));
        if (e.rrule) {
            const r = e.rrule;
            L.push('RRULE:FREQ=' + { D: 'DAILY', W: 'WEEKLY', M: 'MONTHLY', Y: 'YEARLY' }[r.freq] + ';INTERVAL=' + (r.interval || 1) + (r.byday && r.byday.length ? ';BYDAY=' + r.byday.map(g => ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][g]).join(',') : '') + (r.until ? ';UNTIL=' + r.until.replace(/-/g, '') + 'T225959Z' : '') + (r.count ? ';COUNT=' + r.count : ''));
        }
        for (const x of e.exdate || [])
            L.push('EXDATE' + icsData(e.tuttoIlGiorno ? x : x + 'T' + e.inizio.slice(11), e.tuttoIlGiorno));
        for (const m of e.promemoria || [])
            L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(e.titolo), 'TRIGGER:-PT' + m + 'M', 'END:VALARM');
        L.push('END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return L.map(r => { const out = []; while (r.length > 74) {
        out.push(r.slice(0, 74));
        r = ' ' + r.slice(74);
    } out.push(r); return out.join('\r\n'); }).join('\r\n') + '\r\n';
}
/** Importa VEVENT da un file .ics. Gli eventi già importati (stesso UID) vengono aggiornati, non duplicati. */
function importaIcs(testo, categoriaId) {
    const righe = testo.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    const de = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    const leggiData = (chiave, val) => {
        if (/VALUE=DATE/.test(chiave) || /^\d{8}$/.test(val))
            return { s: val.slice(0, 4) + '-' + val.slice(4, 6) + '-' + val.slice(6, 8), tutto: true };
        const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/);
        if (!m)
            return { s: '', tutto: false };
        if (m[7])
            return { s: dtStr(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))), tutto: false };
        return { s: m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5], tutto: false };
    };
    let n = 0, ev = null;
    for (const riga of righe) {
        if (riga === 'BEGIN:VEVENT') {
            ev = { alarms: [] };
            continue;
        }
        if (!ev)
            continue;
        if (riga === 'END:VEVENT') {
            if (ev.inizio) {
                // un .ics esportato da questa app torna sullo stesso evento (niente doppioni)
                const proprio = String(ev.uid || '').match(/^([0-9a-f-]{36}|ics-[A-Za-z0-9-]+)@il-mio-calendario$/);
                const id = proprio ? proprio[1] : 'ics-' + String(ev.uid || uid()).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60);
                let fine = ev.fine || ev.inizio;
                if (ev.tutto)
                    fine = ymd(piuGiorni(daYmd(fine), ev.fine && ev.fine > ev.inizio ? -1 : 0)) + 'T23:59';
                else if (!ev.fine)
                    fine = dtStr(piuMinuti(daDt(ev.inizio), 60));
                const e = { id, type: 'evento', updatedAt: 0, titolo: ev.titolo || '(senza titolo)', inizio: ev.tutto ? ev.inizio + 'T00:00' : ev.inizio, fine, tuttoIlGiorno: !!ev.tutto,
                    luogo: ev.luogo, note: ev.note, categoriaId, rrule: ev.rrule, exdate: ev.exdate, promemoria: ev.alarms, checklist: [] };
                Stato.salva(e, true);
                n++;
            }
            ev = null;
            continue;
        }
        if (riga === 'BEGIN:VALARM' || riga === 'END:VALARM')
            continue;
        const i = riga.indexOf(':');
        if (i < 0)
            continue;
        const chiave = riga.slice(0, i).toUpperCase(), val = riga.slice(i + 1), nome = chiave.split(';')[0];
        if (nome === 'UID')
            ev.uid = val;
        else if (nome === 'SUMMARY')
            ev.titolo = de(val);
        else if (nome === 'LOCATION')
            ev.luogo = de(val) || undefined;
        else if (nome === 'DESCRIPTION')
            ev.note = de(val);
        else if (nome === 'DTSTART') {
            const d = leggiData(chiave, val);
            ev.inizio = d.s;
            ev.tutto = d.tutto;
        }
        else if (nome === 'DTEND')
            ev.fine = leggiData(chiave, val).s;
        else if (nome === 'TRIGGER') {
            const m = val.match(/-?P(T(\d+)H)?(T?(\d+)M)?(\d+)?D?/);
            const ore = val.match(/(\d+)H/), min = val.match(/(\d+)M/), gg = val.match(/(\d+)D/);
            if (m)
                ev.alarms.push((gg ? +gg[1] * 1440 : 0) + (ore ? +ore[1] * 60 : 0) + (min ? +min[1] : 0));
        }
        else if (nome === 'EXDATE')
            ev.exdate = (ev.exdate || []).concat(val.split(',').map(x => leggiData(chiave, x).s.slice(0, 10)));
        else if (nome === 'RRULE') {
            const p = {};
            val.split(';').forEach(x => { const [k, v] = x.split('='); p[k] = v; });
            const f = { DAILY: 'D', WEEKLY: 'W', MONTHLY: 'M', YEARLY: 'Y' }[p.FREQ];
            if (f) {
                ev.rrule = { freq: f, interval: +(p.INTERVAL || 1) };
                if (p.BYDAY && f === 'W')
                    ev.rrule.byday = p.BYDAY.split(',').map((d) => ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].indexOf(d.slice(-2))).filter((x) => x >= 0);
                if (p.UNTIL)
                    ev.rrule.until = p.UNTIL.slice(0, 4) + '-' + p.UNTIL.slice(4, 6) + '-' + p.UNTIL.slice(6, 8);
                if (p.COUNT)
                    ev.rrule.count = +p.COUNT;
            }
        }
    }
    if (n)
        Stato.notifica();
    return n;
}

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
    const FINESTRA = 72 * 3600000; // 3 giorni (limite di ntfy.sh)
    const MAX_PER_GIRO = 40; // sotto il limite di raffica del server pubblico
    const PRED = { mattino: '08:00', sera: '21:30', silDa: '23:00', silA: '07:30' };
    let timer = 0, inCorso = false;
    const server = () => (imp().ntfyServer || 'https://ntfy.sh').replace(/\/+$/, '');
    const tipi = () => Object.assign({ promemoria: true, studio: true, sera: true, esami: true }, imp().ntfyTipi || {});
    const attive = () => !!(imp().ntfy && imp().ntfyTopic);
    const linkApp = () => location.origin + location.pathname.replace(/[^/]*$/, '');
    function minDi(hhmm) { const [a, b] = hhmm.split(':').map(Number); return (a || 0) * 60 + (b || 0); }
    function alle(g, hhmm) { const d = new Date(g); const m = minDi(hhmm); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d; }
    function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++)
        h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
    function nuovoTopic() {
        const b = new Uint8Array(24);
        crypto.getRandomValues(b);
        return 'imc-' + Array.from(b, x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
    }
    /** Orari silenziosi: se l'orario cade dentro, slitta alla fine del silenzio. */
    function fuoriSilenzio(t) {
        const i = imp(), da = minDi(i.ntfySilenzioDa || PRED.silDa), a = minDi(i.ntfySilenzioA || PRED.silA);
        const d = new Date(t), m = d.getHours() * 60 + d.getMinutes();
        const dentro = da > a ? (m >= da || m < a) : (m >= da && m < a);
        if (!dentro)
            return t;
        const fine = alle(d, i.ntfySilenzioA || PRED.silA);
        if (m >= da && da > a)
            fine.setDate(fine.getDate() + 1); // es. 23:30 → 07:30 del giorno dopo
        return fine.getTime();
    }
    function privata(catId) { return !!catId && (imp().ntfyPrivate || []).includes(catId); }
    function vociStudio(g) { return typeof Studio === 'undefined' ? [] : Studio.vociDelGiorno(g); }
    function testoVoci(g) {
        return vociStudio(g).map(x => x.v.speciale ? x.v.t : Studio.etichetta(x.v.k)).join(' + ');
    }
    /** Tutte le notifiche desiderate tra adesso e adesso+72h. */
    function calcola(adesso = Date.now()) {
        const fine = adesso + FINESTRA, T = tipi(), i = imp(), out = [];
        const metti = (d) => { d.at = fuoriSilenzio(d.at); if (d.at > adesso + 15000 && d.at <= fine)
            out.push(d); };
        if (T.promemoria) {
            for (const o of occorrenzeTra(new Date(adesso - 86400000), new Date(fine + 86400000))) {
                const priv = privata(o.ev.categoriaId);
                for (const min of o.ev.promemoria || []) {
                    const at = o.inizio.getTime() - min * 60000;
                    const quando = o.ev.tuttoIlGiorno ? dataRelativa(o.inizio) : (min === 0 ? 'adesso' : (min < 60 ? 'tra ' + min + ' min' : dataRelativa(o.inizio).toLowerCase() + ' alle ' + hm(o.inizio)));
                    metti({ chiave: 'ev:' + o.chiave + ':' + min, at, titolo: priv ? 'Promemoria' : o.ev.titolo, testo: priv ? 'Hai un impegno ' + quando : quando + (o.ev.tuttoIlGiorno ? '' : ' · ore ' + hm(o.inizio)) + (o.ev.luogo && !priv ? ' · ' + o.ev.luogo : ''), tag: 'bell' });
                }
            }
            for (const t of Stato.tutti('task')) {
                if (t.fatto || !t.scadenza || t.scadenza.length <= 10)
                    continue;
                const priv = privata(t.categoriaId);
                metti({ chiave: 'task:' + t.id + ':' + t.scadenza, at: daDt(t.scadenza).getTime(), titolo: priv ? 'Promemoria' : t.titolo, testo: 'Scade adesso', tag: 'ballot_box_with_check' });
            }
        }
        // Giorni della finestra (oggi compreso)
        for (let g = oggi(); g.getTime() <= fine; g = new Date(g.getFullYear(), g.getMonth(), g.getDate() + 1)) {
            const k = ymd(g), voci = testoVoci(g);
            const rip = typeof Ripassi === 'undefined' ? 0 : Ripassi.delGiorno(k).oggi.length;
            const testoRip = rip ? '🧠 ' + rip + ' ripass' + (rip === 1 ? 'o' : 'i') + ' (~' + rip * Ripassi.MIN_SCHEDA + ' min)' : '';
            if (T.studio && (voci || rip))
                metti({ chiave: 'studio:' + k, at: alle(g, i.ntfyMattino || PRED.mattino).getTime(), titolo: '📚 Studio di oggi', testo: [voci, testoRip].filter(Boolean).join(' · '), tag: 'books' });
            if (T.sera && vociStudio(g).some(x => !x.v.speciale))
                metti({ chiave: 'sera:' + k, at: alle(g, i.ntfySera || PRED.sera).getTime(), titolo: '🌙 Ripasso prima di dormire', testo: '10–15 min: richiama a memoria ' + voci + ', senza aprire il libro. Poi chiudi la giornata nell\'app (2 min).', tag: 'crescent_moon', prio: 2 });
            if (T.esami)
                for (const n of [7, 3, 1]) {
                    const target = new Date(g.getFullYear(), g.getMonth(), g.getDate() + n);
                    for (const x of vociStudio(target)) {
                        if (!x.v.speciale || !/^(SIM|VERIFICA|ESAME-)/.test(x.v.k))
                            continue;
                        metti({ chiave: 'esame:' + x.v.k + ':' + n, at: alle(g, i.ntfyMattino || PRED.mattino).getTime() + 60000, titolo: (n === 1 ? '⏰ Domani: ' : '🎯 Tra ' + n + ' giorni: ') + x.v.t.replace(/^🎓 /, ''), testo: n === 1 ? 'Oggi ripasso leggero e dormi bene: il sonno fissa ciò che sai.' : 'Inizia a dare priorità ai ripassi e agli errori.', tag: 'dart', prio: 4 });
                    }
                }
        }
        return out;
    }
    /** Invio a ntfy. mode 'no-cors': la richiesta parte anche se il server non manda le intestazioni CORS. */
    async function invia(m) {
        const corpo = { topic: imp().ntfyTopic, title: m.titolo, message: m.testo, click: linkApp(), sequence_id: 'imc' + hash(m.chiave) };
        if (m.tag)
            corpo.tags = [m.tag];
        if (m.prio)
            corpo.priority = m.prio;
        if (m.at && m.at > Date.now() + 10000)
            corpo.delay = String(Math.floor(m.at / 1000));
        await fetch(server() + '/', { method: 'POST', mode: 'no-cors', body: JSON.stringify(corpo) });
    }
    const impronta = (d) => hash(d.at + '|' + d.titolo + '|' + d.testo);
    const idReg = (chiave) => 'ntf-' + hash(chiave);
    /** Allinea il server ntfy con le notifiche desiderate. Restituisce quante ne ha mandate. */
    async function allinea() {
        if (!attive() || inCorso || !navigator.onLine)
            return 0;
        inCorso = true;
        let inviati = 0;
        try {
            const adesso = Date.now(), voluti = calcola(adesso), visti = new Set();
            for (const d of voluti) {
                if (inviati >= MAX_PER_GIRO)
                    break;
                const id = idReg(d.chiave), reg = Stato.prendi(id), h = impronta(d);
                visti.add(id);
                if (reg && !reg.deleted && reg.h === h)
                    continue;
                // Cambiata e la vecchia è ancora in attesa: subito dopo il vecchio orario la sostituisco in silenzio.
                if (reg && !reg.deleted && reg.at > adesso && reg.at !== d.at) {
                    await invia({ chiave: d.chiave, at: reg.at + 5000, titolo: '↪ ' + reg.titolo, testo: 'Spostato: ' + dataRelativa(new Date(d.at)).toLowerCase() + ' alle ' + hm(new Date(d.at)), prio: 1 });
                    inviati++;
                }
                await invia(d);
                inviati++;
                Stato.salva({ id, type: 'notifica', updatedAt: 0, at: d.at, h, titolo: d.titolo }, true);
            }
            // Notifiche registrate in futuro che non servono più: annullo (sostituzione silenziosa) e chiudo il registro.
            for (const reg of Stato.tutti('notifica')) {
                if (visti.has(reg.id))
                    continue;
                if (reg.at > adesso + 15000 && reg.at <= adesso + FINESTRA && inviati < MAX_PER_GIRO) {
                    await invia({ chiave: reg.id, at: reg.at + 5000, titolo: '✕ Annullato', testo: reg.titolo, prio: 1 });
                    inviati++;
                    Stato.elimina(reg.id);
                }
                else if (reg.at < adesso - 86400000)
                    Stato.elimina(reg.id); // vecchie: pulizia
            }
        }
        catch (e) {
            console.warn('ntfy:', e);
        }
        finally {
            inCorso = false;
        }
        return inviati;
    }
    /** Programma un allineamento tra qualche secondo (le modifiche ravvicinate si accorpano). */
    function programma() { if (!attive())
        return; clearTimeout(timer); timer = setTimeout(() => { allinea(); }, 4000); }
    function attiva() { const i = imp(); if (!i.ntfyTopic)
        i.ntfyTopic = nuovoTopic(); i.ntfy = true; Stato.salva(i); return i.ntfyTopic; }
    function rigenera() {
        for (const r of Stato.tutti('notifica'))
            Stato.elimina(r.id); // il nuovo topic riparte da zero
        const i = imp();
        i.ntfyTopic = nuovoTopic();
        Stato.salva(i);
        return i.ntfyTopic;
    }
    async function prova() { await invia({ chiave: 'prova:' + Date.now(), titolo: '✅ Notifiche attive', testo: 'Il mio calendario può avvisarti anche ad app chiusa.', tag: 'white_check_mark' }); }
    return { calcola, allinea, programma, attiva, rigenera, prova, attive, server, PRED, nuovoTopic, fuoriSilenzio };
})();

// =====================================================================
// 07-aigen.ts — Quiz Studio Q5: domande nuove generate dall'AI (Groq)
// 1) l'AI scrive domande SOLO dalle citazioni del libro presenti nella scheda;
// 2) un secondo passaggio le risolve "alla cieca" (opzioni mescolate, senza
//    sapere la giusta): se sbaglia o le trova ambigue, la domanda è scartata;
// 3) controlli automatici (formato, doppioni, lunghezza della corretta);
// 4) le superstiti vanno nella coda «Da approvare»: entrano nella banca
//    (record 'modq' nuova) solo quando l'utente le approva.
// =====================================================================
const AIGen = (() => {
    const N = 5;
    const parole = (s) => new Set(s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3));
    function simile(a, b) {
        const A = parole(a), B = parole(b);
        if (!A.size || !B.size)
            return 0;
        let c = 0;
        A.forEach(w => { if (B.has(w))
            c++; });
        return c / (A.size + B.size - c);
    }
    function hash(s) { let x = 5381; for (let i = 0; i < s.length; i++)
        x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(36); }
    const proposte = (sk) => Stato.tutti('propq').filter(r => !r.deleted && (!sk || r.sk === sk));
    /** Controlli automatici: null se va bene, altrimenti il motivo dello scarto. */
    function controlla(d, esistenti) {
        if (!d || typeof d.q !== 'string' || d.q.trim().length < 15)
            return 'testo mancante';
        if (!Array.isArray(d.o) || d.o.length !== 5 || d.o.some((x) => typeof x !== 'string' || !x.trim()))
            return 'servono 5 opzioni';
        if (new Set(d.o.map((x) => x.trim().toLowerCase())).size < 5)
            return 'opzioni uguali';
        if (!Array.isArray(d.ew) || d.ew.length !== 4 || d.ew.some((x) => typeof x !== 'string' || !x.trim()))
            return 'manca un «perché è sbagliata»';
        if (!Array.isArray(d.e) || d.e.length < 2)
            return 'correzione troppo corta';
        if (esistenti.some(q => simile(q, d.q) >= 0.6))
            return 'quasi uguale a una domanda già presente';
        return null;
    }
    function promptGenera(titolo, mat, cit, gia, cat, n) {
        const sys = 'Sei un docente che scrive quiz di ' + mat + ' per il semestre filtro di Medicina (stile dei test di ammissione italiani). '
            + 'Scrivi in italiano corretto. Usa SOLO le informazioni del TESTO DI RIFERIMENTO: non inventare dati, numeri o fatti che non ci sono. '
            + 'Rispondi solo con JSON valido.';
        const u = 'Scheda: ' + titolo + '\n\nTESTO DI RIFERIMENTO (citazioni dal libro del corso):\n' + cit
            + '\n\nDomande già presenti (NON ripeterle né riformularle):\n- ' + gia.slice(0, 40).join('\n- ')
            + '\n\nTipi di errore tipici degli studenti (usali per costruire i distrattori):\n' + cat
            + '\n\nScrivi ' + n + ' domande NUOVE a risposta multipla, diverse tra loro, che verifichino la comprensione (non la memoria di una frase). Regole:\n'
            + '- 5 opzioni; la corretta è SEMPRE la prima (o[0]); una sola opzione corretta, senza ambiguità;\n'
            + '- ogni distrattore nasce da un errore preciso e plausibile; la corretta NON deve essere più lunga dei distrattori;\n'
            + '- niente «tutte le precedenti», «nessuna delle precedenti», niente doppie negazioni;\n'
            + '- ew: 4 testi, uno per distrattore nello stesso ordine di o[1..4], che spiegano perché è sbagliato;\n'
            + '- e: correzione passo-passo di 3-4 righe (cosa chiede; il concetto e dove si trova nel testo; il ragionamento; in sintesi la regola da ricordare);\n'
            + '- cit: la frase del testo di riferimento su cui si basa, copiata parola per parola;\n'
            + '- lv: uno tra Sbarramento, Applicativo, Trabocchetto.\n'
            + 'Formato: {"domande":[{"lv":"…","q":"…","o":["corretta","d1","d2","d3","d4"],"ew":["…","…","…","…"],"e":["…","…","…"],"cit":"…"}]}';
        return [{ role: 'system', content: sys }, { role: 'user', content: u }];
    }
    /** Esame alla cieca: restituisce per ogni domanda se il risolutore ha trovato la corretta senza ambiguità. */
    async function esame(dom, mat, cit) {
        const L = 'ABCDE';
        const mesc = dom.map(d => { const ord = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5); return { ord, testo: d.q + '\n' + ord.map((k, i) => L[i] + ') ' + d.o[k]).join('\n') }; });
        const msgs = [
            { role: 'system', content: 'Sei un esperto di ' + mat + ' che controlla la qualità dei quiz. Rispondi solo con JSON valido.' },
            { role: 'user', content: 'Testo di riferimento:\n' + cit + '\n\nRisolvi ogni domanda. Per ciascuna indica la lettera giusta e se è ambigua (più di una opzione accettabile, nessuna corretta, o un dato sbagliato rispetto al testo).\n\n'
                    + mesc.map((m, i) => 'DOMANDA ' + (i + 1) + '\n' + m.testo).join('\n\n')
                    + '\n\nFormato: {"risposte":[{"n":1,"lettera":"A","ambigua":false,"motivo":"breve"}]}' },
        ];
        const j = await Spiega.chat(msgs, 0);
        const r = (j && j.risposte) || [];
        return mesc.map((m, i) => {
            const x = r.find(y => +y.n === i + 1) || r[i];
            if (!x)
                return { ok: false, motivo: 'non verificata' };
            const k = L.indexOf(String(x.lettera || '').trim().toUpperCase().charAt(0));
            if (x.ambigua)
                return { ok: false, motivo: 'ambigua: ' + (x.motivo || '') };
            if (k < 0 || m.ord[k] !== 0)
                return { ok: false, motivo: 'il controllo ha dato un\'altra risposta' };
            return { ok: true, motivo: '' };
        });
    }
    /** Genera e mette in coda le domande per una scheda. Ritorna quante sono entrate in coda e gli scarti. */
    async function genera(pk, m, micro, s, passo = () => { }) {
        passo('Leggo la scheda…');
        const B = await Banca.scheda(pk, m, micro, s);
        const viste = new Set();
        const pezzi = [];
        for (const d of B.domande)
            for (const c of d.cit || []) {
                const t = (c.t || '').trim();
                if (t && !viste.has(t)) {
                    viste.add(t);
                    pezzi.push('«' + t + '»' + (c.f ? ' (' + c.f + ')' : ''));
                }
            }
        let cit = '';
        for (const p of pezzi) {
            if ((cit + p).length > 6000)
                break;
            cit += p + '\n';
        }
        if (!cit)
            throw new Error('Questa scheda non ha citazioni del libro: non posso generare domande sicure.');
        const esistenti = B.domande.map(d => d.q).concat(proposte(s.id).map(p => p.campi.q || ''));
        const R = Regole.get();
        const cat = Object.values(R.categorie).map(c => '- ' + c.etichetta).join('\n');
        const mat = Spiega.materia(nomeMateria(m));
        passo('L\'AI scrive ' + N + ' domande…');
        const j = await Spiega.chat(promptGenera(s.titolo, mat, cit, esistenti, cat, N), 0.6);
        const grezze = (j && Array.isArray(j.domande)) ? j.domande : [];
        const scarti = [];
        const buone = [];
        for (const d of grezze) {
            if (d && typeof d.e === 'string')
                d.e = d.e.split('\n').filter(Boolean);
            const no = controlla(d, esistenti.concat(buone.map(b => b.q)));
            if (no)
                scarti.push(no);
            else
                buone.push(d);
        }
        if (buone.length) {
            passo('Controllo alla cieca…');
            const es = await esame(buone, mat, cit);
            let inCoda = 0;
            buone.forEach((d, i) => {
                if (!es[i].ok) {
                    scarti.push(es[i].motivo);
                    return;
                }
                const lunga = d.o[0].trim().length > Math.max(...d.o.slice(1).map((x) => x.trim().length));
                const campi = { t: 'mcq', lv: ['Sbarramento', 'Applicativo', 'Trabocchetto'].includes(d.lv) ? d.lv : 'Applicativo', q: d.q.trim(), o: d.o.map((x) => x.trim()), ew: d.ew.map((x) => x.trim()), e: d.e.map((x) => String(x).trim()), cit: d.cit ? [{ t: String(d.cit).trim(), f: 'testo citato nella scheda' }] : [] };
                Stato.salva({ id: 'pq-' + hash(s.id + d.q), type: 'propq', updatedAt: 0, sk: s.id, titolo: s.titolo, campi, quando: new Date().toISOString(), avviso: lunga ? 'La risposta corretta è la più lunga: accorciala o allunga un distrattore.' : undefined }, true);
                inCoda++;
            });
            return { inCoda, scarti };
        }
        return { inCoda: 0, scarti };
    }
    /** Scheda con il peggior rapporto errori (dai quiz nell'app; poi punteggio basso). */
    function piuDebole() {
        const agg = new Map();
        for (const r of QuizApp.stat()) {
            if (r.deleted || r.sk.startsWith('gen-'))
                continue;
            const a = agg.get(r.sk) || { n: 0, ok: 0 };
            a.n += r.n;
            a.ok += r.ok;
            agg.set(r.sk, a);
        }
        let best = null, peggio = -1;
        for (const x of tutteLeSchede()) {
            if (x.pk.proprio)
                continue;
            const a = agg.get(x.s.id), p = Studio.prog(x.s.id);
            const err = a && a.n ? 1 - a.ok / a.n : p && p.punteggio != null ? 1 - p.punteggio / 100 : -1;
            if (err > peggio) {
                peggio = err;
                best = x;
            }
        }
        return peggio >= 0 ? best : null;
    }
    /** Avvia la generazione con avvisi e apre la coda. */
    async function avvia(pk, m, micro, s) {
        if (!navigator.onLine) {
            avviso('Serve la connessione.');
            return;
        }
        avviso('🤖 Genero domande nuove per «' + s.titolo + '»: ci vuole circa un minuto.', 6000);
        try {
            const r = await genera(pk, m, micro, s);
            const sc = r.scarti.length ? ' (' + r.scarti.length + ' scartate dai controlli)' : '';
            avviso(r.inCoda ? '✅ ' + r.inCoda + ' domande da approvare' + sc + '. Tocca per vederle.' : 'Nessuna domanda ha superato i controlli' + sc + '. Riprova.', 8000, r.inCoda ? () => coda(s.id) : undefined);
            disegna();
        }
        catch (e) {
            avviso(e.message || 'Errore', 7000);
        }
    }
    /** Coda «Da approvare». */
    function coda(sk) {
        const corpo = h('div.modulo');
        const f = foglio({ titolo: 'Domande AI da approvare', corpo });
        const disegnaCoda = () => {
            svuota(corpo);
            const xs = proposte(sk).sort((a, b) => a.quando.localeCompare(b.quando));
            if (!xs.length) {
                corpo.appendChild(h('div.tenue', null, 'Nessuna domanda in attesa.'));
                return;
            }
            corpo.appendChild(h('div.tenue.piccolo', null, xs.length + ' in attesa. La prima opzione è quella corretta. Approva solo quelle che ti sembrano giuste: entrano nella banca della scheda.'));
            for (const p of xs) {
                const d = p.campi;
                const qid = 'q-ai-' + p.id.slice(3);
                const approva = (campi) => { Stato.salva({ id: 'mq-' + qid, type: 'modq', updatedAt: 0, qid, sk: p.sk, nuova: true, campi }, true); Stato.elimina(p.id); };
                corpo.appendChild(h('div.gruppo.aig-voce', null, h('div.tenue.piccolo', null, p.titolo + ' · ' + (d.lv || '')), h('div.aig-q', null, d.q || ''), h('ol.aig-opz', null, (d.o || []).map((o, k) => h(k ? 'li' : 'li.aig-giusta', null, h('div', null, (k ? '' : '✓ ') + o), k && d.ew ? h('div.tenue.piccolo', null, d.ew[k - 1]) : null))), h('div.tenue.piccolo', null, (Array.isArray(d.e) ? d.e : [d.e]).join(' · ')), d.cit && d.cit[0] ? h('div.tenue.piccolo', null, 'Fonte: «' + d.cit[0].t + '»') : null, p.avviso ? h('div.qz-avviso', null, '⚠️ ' + p.avviso) : null, h('div.bottoni', null, h('button.btn', { onclick: () => { approva(d); avviso('Aggiunta alla scheda.'); disegnaCoda(); } }, '✅ Approva'), h('button.btn.neutro', { onclick: () => Editor.apri({ ...d, id: qid, sk: p.sk, nuova: true }, p.sk, n => { if (n) {
                        Stato.elimina(p.id);
                        disegnaCoda();
                    } }) }, '✏️ Modifica'), h('button.btn.neutro', { onclick: () => { Stato.elimina(p.id); disegnaCoda(); } }, '🗑 Scarta'))));
            }
        };
        disegnaCoda();
        void f;
    }
    /** Riquadro in Studio → Errori. */
    function sezione() {
        const n = proposte().length, x = piuDebole();
        return h('section.card', null, h('h2.card-titolo', null, '🤖 Domande nuove con l\'AI'), h('div.tenue.piccolo', null, 'L\'AI scrive domande dalle citazioni del libro, le controlla risolvendole alla cieca e le mette qui: entrano nei quiz solo se le approvi.'), h('div.bottoni', null, n ? h('button.btn', { onclick: () => coda() }, 'Da approvare (' + n + ')') : null, x ? h('button.btn.neutro', { onclick: () => avvia(x.pk, x.mat.m, x.mi.n, x.s) }, 'Genera per il punto più debole') : null), x ? h('div.tenue.piccolo', null, 'Punto più debole ora: ' + x.mi.n + ' · ' + x.s.titolo) : null);
    }
    return { genera, avvia, coda, sezione, controlla, esame, piuDebole, proposte };
})();

// 07-appunti.ts — Appunti (v0.28, fase 1).
//
// Ispirazione (scouting 13/11): RemNote (appunti e flashcard sono la stessa cosa: «domanda :: risposta»
// scritta nel testo), Obsidian + plugin FSRS (contesto della carta = titolo › sezione; completamenti
// {{…}}), metodo Cornell (spunti / testo / riassunto: arriva nella fase 2), app con AI (generano domande
// dagli appunti: qui le prepara Claude leggendo la copia .md su Drive, senza costi).
// Neuroscienza: appunti con parole proprie (elaborazione generativa) + recupero (le righe-domanda
// diventano carte con ripasso FSRS) + collegamento allo step (interleaving con quiz e piano).
//
// Dati: record 'appunto' (id 'ap-…'). Le carte nascono al salvataggio nel mazzo 'mz-ap-<id>' (figlio di
// 'mz-appunti'), collegato allo stesso sotto-step; una riga cancellata toglie la sua carta.
// Drive: copia «titolo.md» in «Calendario personale/Appunti», SOLO dopo conferma nell'app.
const Appunti = (() => {
    const tutti = () => Stato.tutti('appunto').sort((a, b) => b.updatedAt - a.updatedAt);
    /** Carte contenute nel testo: «domanda :: risposta» e righe con {{completamenti}}; contesto = titoli sopra. */
    function estraiCarte(testo) {
        const out = [], titoli = [];
        for (const riga of testo.split('\n')) {
            const t = /^(#{1,4})\s+(.+)$/.exec(riga.trim());
            if (t) {
                titoli.length = t[1].length - 1;
                titoli[t[1].length - 1] = t[2].trim();
                continue;
            }
            const x = riga.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
            if (!x)
                continue;
            const ctx = titoli.filter(Boolean).join(' › ');
            const q = /^(.+?)\s::\s(.+)$/.exec(x);
            if (q)
                out.push({ f: q[1].trim(), r: q[2].trim(), ctx });
            else if (/\{\{[^}]+\}\}/.test(x))
                out.push({ f: x, r: '', ctx });
        }
        return out;
    }
    /** Allinea il mazzo dell'appunto alle righe-carta attuali. Restituisce [nuove, tolte]. */
    function sincronizzaCarte(a) {
        const lista = estraiCarte(a.testo), idM = 'mz-ap-' + a.id.replace(/^ap-/, '');
        const esistenti = Carte.carte().filter(c => c.mazzo === idM);
        if (!lista.length && !esistenti.length)
            return [0, 0];
        if (!Stato.prendi('mz-appunti'))
            Stato.salva({ id: 'mz-appunti', type: 'mazzo', updatedAt: 0, nome: '📝 Dagli appunti' }, true);
        const m = Stato.prendi(idM);
        const nome = '📝 ' + (a.titolo || 'Appunto');
        if (!m || m.nome !== nome || m.sub !== a.sub)
            Stato.salva({ ...(m || {}), id: idM, type: 'mazzo', updatedAt: 0, nome, padre: 'mz-appunti', sub: a.sub, micro: a.micro }, true);
        const prima = new Set(esistenti.map(c => c.id));
        const nuove = Carte.riempi(idM, lista);
        const ids = new Set(lista.map(x => 'cr-' + Carte.hash(idM + '|' + norm(x.f))));
        for (const x of lista) {
            const c = Stato.prendi('cr-' + Carte.hash(idM + '|' + norm(x.f)));
            if (c && c.ctx !== (x.ctx || undefined)) {
                c.ctx = x.ctx || undefined;
                Stato.salva(c, true);
            }
        }
        let tolte = 0;
        for (const id of prima)
            if (!ids.has(id)) {
                Stato.elimina(id);
                tolte++;
            }
        Stato.notifica();
        return [nuove, tolte];
    }
    function salva(a) {
        a.titolo = a.titolo.trim() || (a.testo.trim().split('\n')[0] || 'Appunto').replace(/^#+\s*/, '').slice(0, 60);
        const col = Carte.collega(a.titolo);
        if (col.sub) {
            a.sub = col.sub;
            a.micro = col.micro;
        }
        Stato.salva(a);
        return sincronizzaCarte(a);
    }
    function nuovo(extra = {}) { return { id: 'ap-' + uid(), type: 'appunto', updatedAt: 0, titolo: '', testo: '', ...extra }; }
    function elimina(a) {
        for (const c of Carte.carte().filter(c => c.mazzo === 'mz-ap-' + a.id.replace(/^ap-/, '')))
            Stato.elimina(c.id);
        Stato.elimina('mz-ap-' + a.id.replace(/^ap-/, ''));
        Stato.elimina(a.id);
    }
    /** Copia Markdown su Drive (crea o aggiorna lo stesso file). */
    async function suDrive(a) {
        const cart = await Drive.sottocartella('Appunti');
        const nome = (a.titolo || 'Appunto').replace(/[\\/:*?"<>|]/g, '-') + '.md';
        const corpo = '# ' + a.titolo + '\n\n' + (a.sub ? '_Step: ' + Studio.etichetta(a.sub) + (a.micro ? ' · ' + a.micro : '') + '_\n\n' : '') + a.testo + '\n';
        const id = await Drive.carica(nome, cart, corpo, 'text/markdown', a.drive && a.drive.id);
        a.drive = { id, agg: Date.now(), h: Carte.hash(a.titolo + '\n' + a.testo) };
        Stato.salva(a);
    }
    const daSalvareSuDrive = (a) => !a.drive || a.drive.h !== Carte.hash(a.titolo + '\n' + a.testo);
    return { tutti, estraiCarte, sincronizzaCarte, salva, nuovo, elimina, suDrive, daSalvareSuDrive };
})();
/** Chiede conferma e salva la copia su Drive (regola: niente su Drive senza conferma). */
async function chiediDrive(a, forza = false) {
    if (!Drive.collegato || !Appunti.daSalvareSuDrive(a)) {
        if (forza && !Drive.collegato)
            avviso('Collega Google Drive da Altro.');
        return;
    }
    const s = await chiedi('Salvare «' + a.titolo + '» su Drive?', [{ testo: a.drive ? '☁︎ Aggiorna la copia' : '☁︎ Salva su Drive', valore: 'si' }], 'Copia .md in «Calendario personale/Appunti». L\'appunto resta comunque salvato nell\'app.');
    if (s !== 'si')
        return;
    if (serveGoogle())
        return;
    try {
        await Appunti.suDrive(a);
        avviso('☁︎ Salvato su Drive.');
    }
    catch (e) {
        avviso('Drive: ' + (e.message || e), 6000);
    }
}
// ---------- Editor ----------
function apriAppunto(a, extra = {}) {
    const ap = a ? { ...a } : Appunti.nuovo(extra);
    let cambiato = false;
    const v = visore(a ? '📝 Appunto' : '📝 Nuovo appunto', () => { if (cambiato)
        fine();
    else if (a)
        chiediDrive(Stato.prendi(ap.id) || ap); disegna(); });
    const titolo = h('input.appunto-titolo', { type: 'text', placeholder: 'Titolo (es. «Chi 2.2.4 Calore latente» lo collega allo step)', value: ap.titolo });
    const testo = h('textarea.appunto-testo', { placeholder: 'Scrivi con parole tue.\n\n# Titolo  ·  - punto  (rientro = sotto-punto)\nDomanda :: risposta  → diventa una flashcard\nIl {{mitocondrio}} produce ATP  → completamento', spellcheck: 'true' }, ap.testo);
    const stato = h('div.appunto-stato.tenue.piccolo');
    const anteprima = h('div.appunto-anteprima', { hidden: true });
    const aggiornaStato = () => {
        const n = Appunti.estraiCarte(testo.value).length, col = Carte.collega(titolo.value);
        svuota(stato);
        stato.append(col.sub ? h('span.chip-mini', null, '🔗 ' + Studio.etichetta(col.sub) + (col.micro ? ' ' + col.micro : '')) : h('span', null, 'Nessuno step collegato'), ' · 🃏 ' + n + (n === 1 ? ' carta' : ' carte'), cambiato ? ' · modifiche non salvate' : ' · salvato');
    };
    let timer = 0;
    const salvaOra = () => { ap.titolo = titolo.value; ap.testo = testo.value; if (!ap.testo.trim() && !ap.titolo.trim())
        return; const r = Appunti.salva(ap); Object.assign(ap, Stato.prendi(ap.id) || {}); cambiato = false; aggiornaStato(); return r; };
    const modifica = () => { cambiato = true; aggiornaStato(); clearTimeout(timer); timer = setTimeout(salvaOra, 1500); };
    titolo.addEventListener('input', modifica);
    testo.addEventListener('input', modifica);
    function fine() { clearTimeout(timer); const r = salvaOra(); if (r && (r[0] || r[1]))
        avviso('🃏 ' + (r[0] ? r[0] + ' carte nuove/aggiornate' : '') + (r[0] && r[1] ? ', ' : '') + (r[1] ? r[1] + ' tolte' : '')); const x = Stato.prendi(ap.id); if (x)
        setTimeout(() => chiediDrive(x), 300); }
    const inserisci = (prima, dopo = '', segnaposto = '') => {
        const s = testo.selectionStart, e = testo.selectionEnd, sel = testo.value.slice(s, e) || segnaposto;
        testo.setRangeText(prima + sel + dopo, s, e, 'end');
        if (!testo.value.slice(s, e))
            testo.setSelectionRange(s + prima.length, s + prima.length + sel.length);
        testo.focus();
        modifica();
    };
    const aCapo = (pref) => { const s = testo.selectionStart, ini = testo.value.lastIndexOf('\n', s - 1) + 1; testo.setRangeText(pref, ini, ini, 'end'); testo.focus(); modifica(); };
    const barra = h('div.appunto-barra', null, h('button', { title: 'Titolo', onclick: () => aCapo('# ') }, 'H'), h('button', { title: 'Punto', onclick: () => aCapo('- ') }, '•'), h('button', { title: 'Rientra', onclick: () => aCapo('  ') }, '⇥'), h('button', { title: 'Domanda :: risposta', onclick: () => inserisci('', ' :: ', '') }, '::'), h('button', { title: 'Completamento', onclick: () => inserisci('{{', '}}', 'parola') }, '{ }'), h('button', { title: 'Grassetto', onclick: () => inserisci('**', '**', 'testo') }, h('b', null, 'B')), h('button', { title: 'Anteprima', onclick: (e) => { const on = !!anteprima.hidden; anteprima.hidden = !on; testo.hidden = on; e.currentTarget.classList.toggle('attivo', on); if (on) {
            anteprima.innerHTML = htmlCarta(testo.value.replace(/\s::\s/g, ' → '), 'mostra');
            caricaImmagini(anteprima);
        } } }, '👁'));
    v.barra.append(h('button.btn-testo', { onclick: async () => {
            const s = await chiedi(ap.titolo || 'Appunto', [{ testo: '☁︎ Salva su Drive', valore: 'drive' }, { testo: '🃏 Ripassa le sue carte', valore: 'carte' }, { testo: '🗑 Elimina appunto', valore: 'del', pericolo: true }]);
            if (s === 'drive') {
                salvaOra();
                const x = Stato.prendi(ap.id);
                if (x) {
                    x.drive && !Appunti.daSalvareSuDrive(x) ? avviso('Copia su Drive già aggiornata.') : chiediDrive(x, true);
                }
            }
            if (s === 'carte') {
                salvaOra();
                avviaCarte(['mz-ap-' + ap.id.replace(/^ap-/, '')], ap.titolo);
            }
            if (s === 'del') {
                const x = Stato.prendi(ap.id);
                if (x)
                    Appunti.elimina(x);
                cambiato = false;
                v.chiudi();
                avviso('Appunto eliminato (la copia su Drive, se c\'è, resta).');
            }
        } }, '⋯'));
    v.corpo.append(h('div.appunto', null, titolo, stato, barra, testo, anteprima));
    aggiornaStato();
    setTimeout(() => (a ? testo : titolo).focus(), 80);
}
// ---------- Vista «Appunti» ----------
function vistaAppunti() {
    const q = norm(UI.apCerca || '');
    const tutti = Appunti.tutti().filter(a => !q || norm(a.titolo + ' ' + a.testo).includes(q));
    const gruppi = new Map();
    for (const a of tutti) {
        const g = a.sub ? formaMateria(materiaDi(a.sub)) + ' ' + nomeMateria(materiaDi(a.sub)) : 'Senza step';
        if (!gruppi.has(g))
            gruppi.set(g, []);
        gruppi.get(g).push(a);
    }
    const voce = (a) => {
        const n = Appunti.estraiCarte(a.testo).length, anteprima = a.testo.replace(/[#*_{}>`-]|::/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);
        return h('button.voce-lista', { onclick: () => apriAppunto(a) }, h('span.voce-corpo', null, h('span.voce-titolo', null, a.sub ? segnoMateria(a.sub) : null, a.titolo || 'Appunto'), h('span.voce-sotto', { style: { whiteSpace: 'normal' } }, (a.sub ? Studio.etichetta(a.sub) + (a.micro ? ' ' + a.micro : '') + ' · ' : '') + (n ? '🃏 ' + n + ' · ' : '') + (a.drive ? (Appunti.daSalvareSuDrive(a) ? '☁︎ da aggiornare · ' : '☁︎ · ') : '') + fmt(new Date(a.updatedAt), { day: 'numeric', month: 'short' }) + (anteprima ? ' — ' + anteprima : ''))));
    };
    const campo = h('input.campo', { type: 'search', placeholder: 'Cerca negli appunti…', value: UI.apCerca || '', oninput: (e) => { UI.apCerca = e.target.value; clearTimeout(vistaAppunti.t); vistaAppunti.t = setTimeout(() => { disegna(); const c = document.querySelector('main input[type=search]'); if (c) {
            c.focus();
            c.setSelectionRange(c.value.length, c.value.length);
        } }, 250); } });
    const nCarte = Carte.conta(['mz-appunti']);
    return h('div.pagina', null, h('section.card', null, campo, h('div.bottoni', null, h('button.btn', { onclick: () => apriAppunto() }, '＋ Nuovo appunto'), nCarte.nuove + nCarte.ripasso ? h('button.btn.neutro', { onclick: () => avviaCarte(['mz-appunti'], 'Carte dagli appunti') }, '🃏 Ripassa ' + (nCarte.nuove + nCarte.ripasso)) : null), h('div.tenue.piccolo', null, 'Scrivi «domanda :: risposta» o {{parola}} dentro un appunto: diventa una flashcard. Un titolo con il numero dello step lo collega al piano.')), tutti.length ? Array.from(gruppi.entries()).map(([g, l]) => h('section.card', null, h('h2.card-titolo', null, g + ' · ' + l.length), l.map(voce)))
        : h('section.card', null, h('div.vuoto', null, q ? 'Nessun appunto trovato.' : 'Ancora nessun appunto. Tocca «Nuovo appunto».')));
}
/** Nel sotto-step: appunti collegati + nuovo appunto già collegato. */
function rigaAppunti(k) {
    const l = Appunti.tutti().filter(a => a.sub === k);
    const t = Studio.trovaSotto(k);
    return h('div.bottoni', null, l.slice(0, 3).map(a => h('button.btn.neutro', { onclick: () => apriAppunto(a) }, '📝 ' + a.titolo.slice(0, 28))), h('button.btn.neutro', { onclick: () => apriAppunto(undefined, { titolo: Studio.etichetta(k) + (t ? ' ' + t.sub.titolo : ''), sub: k }) }, '＋ Appunto'));
}

// 07-carte.ts — Flashcard (v0.18, F3).
//
// Ispirazione (ricerca 12/11): Anki (FSRS, 4 tasti con l'intervallo scritto, import da testo con
// intestazioni "#separator:tab"), Quizlet (export "termine TAB definizione", una carta per riga; modalità
// scelta multipla e scrivi), Mochi (Markdown con "---" tra i lati, completamenti {{…}}, una cartella di
// file = un mazzo), Kahoot (opzioni con colore + forma), app moderne (tocca per girare, scorri per giudicare,
// ma sempre anche i pulsanti).
//
// Dati: 'mazzo' (id 'mz-…', nome, padre?, sub? = sotto-step collegato, micro?, fonte Drive?) e 'carta'
// (id 'cr-<hash mazzo+fronte>' così una reimportazione non perde i ripassi). Memoria FSRS per carta (e per
// il verso inverso) in record 'memoria' con id 'mem-cr-<id>' / 'mem-cr-<id>-r'.
//
// Formati importati (file dal telefono, file Drive, cartella Drive = mazzo con sotto-mazzi):
//  - testo / CSV / TSV: "fronte<sep>retro[<sep>tag]" per riga; separatore tab, ";" o "," (rilevato o da
//    "#separator:"); righe che iniziano con "#" ignorate; cloze di Anki {{c1::testo}} → {{testo}};
//  - Markdown: carte separate da una riga "===" (o "***"), lati separati da "---"; oppure righe
//    "domanda :: risposta"; un file .md senza "===" e con un solo "---" = una carta (stile Mochi);
//  - JSON: { "tipo": "carte", "mazzo": "…", "micro": "2.2.4", "carte": [ { "f": "…", "r": "…" } ] } o un array.
// Immagini: "![testo](nome.png)" se nome.png è nella cartella Drive importata → "![testo](drive:ID)".
const Carte = (() => {
    function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++)
        h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
    const mazzi = () => Stato.tutti('mazzo').sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }));
    const carte = () => Stato.tutti('carta');
    const figli = (id) => mazzi().filter(m => m.padre === id);
    /** Il mazzo e tutti i suoi sotto-mazzi. */
    function albero(id) { const out = [id]; for (const f of figli(id))
        out.push(...albero(f.id)); return out; }
    const carteDi = (idMazzo) => { const set = new Set(albero(idMazzo)); return carte().filter(c => set.has(c.mazzo)); };
    // ---------- Lettura dei formati ----------
    const isCloze = (s) => /\{\{[^}]+\}\}/.test(s);
    const pulisciCloze = (s) => s.replace(/\{\{c\d+::([^}]*?)(?:::[^}]*)?\}\}/g, '{{$1}}');
    function csvRiga(riga, sep) {
        if (sep === '\t' || !riga.includes('"'))
            return riga.split(sep);
        const out = [];
        let cur = '', q = false;
        for (let i = 0; i < riga.length; i++) {
            const ch = riga[i];
            if (q) {
                if (ch === '"' && riga[i + 1] === '"') {
                    cur += '"';
                    i++;
                }
                else if (ch === '"')
                    q = false;
                else
                    cur += ch;
            }
            else if (ch === '"')
                q = true;
            else if (ch === sep) {
                out.push(cur);
                cur = '';
            }
            else
                cur += ch;
        }
        out.push(cur);
        return out;
    }
    function daTesto(txt) {
        const righe = txt.replace(/^﻿/, '').split(/\r?\n/);
        let sep = '', colTag = -1;
        for (const r of righe) {
            const m = /^#separator:(.+)$/i.exec(r.trim());
            if (m) {
                const v = m[1].trim().toLowerCase();
                sep = v === 'tab' ? '\t' : v === 'comma' ? ',' : v === 'semicolon' ? ';' : v === 'pipe' ? '|' : v.length === 1 ? v : sep;
            }
            const t = /^#tags column:(\d+)/i.exec(r.trim());
            if (t)
                colTag = +t[1] - 1;
        }
        const dati = righe.filter(r => r.trim() && !r.startsWith('#'));
        if (!sep)
            sep = dati.some(r => r.includes('\t')) ? '\t' : dati.filter(r => r.includes(';')).length >= dati.length / 2 ? ';' : ',';
        const out = [];
        for (const r of dati) {
            const c = csvRiga(r, sep).map(x => x.trim());
            if (c.length < 2 && !isCloze(pulisciCloze(c[0] || '')))
                continue;
            out.push({ f: pulisciCloze(c[0]), r: c[1] || '', tag: colTag >= 0 ? c[colTag] : c[2] });
        }
        return out;
    }
    function daMarkdown(txt) {
        const t = txt.replace(/\r/g, '').trim();
        if (/^.+\s::\s.+$/m.test(t) && !/^\s*---\s*$/m.test(t)) // stile RemNote: "domanda :: risposta"
            return t.split('\n').map(r => /^(.+?)\s::\s(.+)$/.exec(r.trim())).filter(Boolean).map(m => ({ f: m[1].trim(), r: m[2].trim() }));
        const blocchi = /^\s*(===+|\*\*\*+)\s*$/m.test(t) ? t.split(/^\s*(?:===+|\*\*\*+)\s*$/m) : [t];
        return blocchi.map(b => b.trim()).filter(Boolean).map(b => {
            const lati = b.split(/^\s*---+\s*$/m).map(x => x.trim());
            return { f: pulisciCloze(lati[0] || ''), r: lati.slice(1).join('\n\n') };
        }).filter(x => x.f);
    }
    function daJson(txt) {
        const d = JSON.parse(txt);
        const arr = Array.isArray(d) ? d : (d.carte || d.cards || []);
        return { nome: d.mazzo || d.nome, micro: d.micro, carte: arr.map((x) => ({ f: pulisciCloze(String(x.f ?? x.fronte ?? x.front ?? x.term ?? '')), r: String(x.r ?? x.retro ?? x.back ?? x.definition ?? ''), tag: x.tag })).filter((x) => x.f) };
    }
    /** Legge un file qualsiasi (dal nome capisce il formato). */
    function leggi(nome, txt) {
        if (/\.json$/i.test(nome))
            return daJson(txt);
        if (/\.(md|markdown)$/i.test(nome))
            return { carte: daMarkdown(txt) };
        return { carte: daTesto(txt) };
    }
    /** Collega un mazzo a un microstep/sotto-step dal nome (es. "2.2.4 Calore" o "Chimica 2.2"). */
    function collega(nome, percorso = '') {
        const m = /(?:^|\s)(\d+\.\d+(?:\.\d+)?)(?=\s|$|[-_·])/.exec(nome);
        if (!m)
            return {};
        const testo = norm(percorso + ' ' + nome);
        const mat = /\bchim|\bchi\b|^c\s/.test(testo) ? 'C' : /\bbio/.test(testo) ? 'B' : /\bfis/.test(testo) ? 'F' : '';
        const cand = [];
        for (const pk of Studio.pkStep())
            for (const ma of pk.materie)
                for (const s of ma.sottostep) {
                    if (mat && ma.m !== mat)
                        continue;
                    if (s.k === ma.m + m[1])
                        cand.push({ sub: s.k });
                    for (const mi of s.microstep)
                        if (mi.n === m[1])
                            cand.push({ sub: s.k, micro: mi.n });
                }
        return cand.length === 1 ? cand[0] : {};
    }
    /** Crea/aggiorna le carte di un mazzo. Stessa domanda = stessa carta (i ripassi restano). */
    function riempi(idMazzo, lista, immagini) {
        let n = 0;
        for (const x of lista) {
            let f = x.f, r = x.r;
            if (immagini) {
                const sost = (s) => s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (tutto, alt, src) => immagini.has(src) ? '![' + alt + '](drive:' + immagini.get(src) + ')' : tutto);
                f = sost(f);
                r = sost(r);
            }
            const id = 'cr-' + hash(idMazzo + '|' + norm(f));
            const prima = Stato.prendi(id);
            if (prima && prima.f === f && prima.r === r)
                continue;
            Stato.salva({ id, type: 'carta', updatedAt: 0, mazzo: idMazzo, f, r, tipo: isCloze(f) ? 'cloze' : 'base', inversa: prima ? prima.inversa : undefined, tag: x.tag || undefined }, true);
            n++;
        }
        Stato.notifica();
        return n;
    }
    function nuovoMazzo(nome, padre, extra = {}) {
        const pa = padre ? Stato.prendi(padre) : undefined, eredita = pa && pa.sub ? { sub: pa.sub, micro: pa.micro } : {};
        const m = { id: 'mz-' + uid(), type: 'mazzo', updatedAt: 0, nome, padre, ...eredita, ...collega(nome), ...extra };
        if (!m.sub && pa && pa.sub) {
            m.sub = pa.sub;
            m.micro = pa.micro;
        } // il sotto-mazzo eredita il collegamento
        Stato.salva(m, true);
        return m;
    }
    /** Importa un file Drive come mazzo (o aggiorna il mazzo che già lo rappresenta). */
    async function importaFileDrive(id, nome, padre, immagini, percorso = '') {
        const txt = await Drive.scaricaTesto(id);
        const d = leggi(nome, txt);
        let m = mazzi().find(x => x.fonte && x.fonte.id === id);
        const nomeM = d.nome || nome.replace(/\.(txt|csv|tsv|md|markdown|json)$/i, '');
        if (!m)
            m = nuovoMazzo(nomeM, padre, { fonte: { id, tipo: 'file' }, ...(d.micro ? collega(d.micro + ' ' + nomeM, percorso) : collega(nomeM, percorso)) });
        return riempi(m.id, d.carte, immagini);
    }
    /** Importa una cartella Drive: la cartella è un mazzo, le sottocartelle sotto-mazzi, ogni file un mazzo. */
    async function importaCartellaDrive(id, nome, padre, percorso = '') {
        let m = mazzi().find(x => x.fonte && x.fonte.id === id);
        if (!m)
            m = nuovoMazzo(nome, padre, { fonte: { id, tipo: 'cartella' }, ...collega(nome, percorso) });
        const voci = await Drive.elencaCompleti(id);
        const immagini = new Map();
        for (const v of voci)
            if (/^image\//.test(v.mimeType))
                immagini.set(v.name, v.id);
        let tot = { mazzi: 1, carte: 0 };
        for (const v of voci) {
            if (v.mimeType === 'application/vnd.google-apps.folder') {
                const r = await importaCartellaDrive(v.id, v.name, m.id, percorso + ' ' + nome);
                tot.mazzi += r.mazzi;
                tot.carte += r.carte;
            }
            else if (/\.(txt|csv|tsv|md|markdown|json)$/i.test(v.name)) {
                tot.carte += await importaFileDrive(v.id, v.name, m.id, immagini, percorso + ' ' + nome);
                tot.mazzi++;
            }
        }
        m.fonte = { id, tipo: 'cartella', agg: ymd(new Date()) };
        Stato.salva(m);
        return tot;
    }
    async function aggiornaDaDrive(m) {
        if (!m.fonte)
            return 0;
        if (m.fonte.tipo === 'cartella')
            return (await importaCartellaDrive(m.fonte.id, m.nome, m.padre)).carte;
        return importaFileDrive(m.fonte.id, m.nome + '.txt', m.padre);
    }
    const idMem = (v) => 'mem-cr-' + v.c.id + (v.rev ? '-r' : '');
    const giorni = (a, b) => Math.round((inizioGiorno(daDt(b)).getTime() - inizioGiorno(daDt(a)).getTime()) / 86400000);
    function voci(ids) {
        const set = ids ? new Set(ids.flatMap(albero)) : null;
        const out = [];
        for (const c of carte())
            if (!set || set.has(c.mazzo)) {
                out.push({ c, rev: false });
                if (c.inversa && c.tipo === 'base')
                    out.push({ c, rev: true });
            }
        return out;
    }
    function mem(v) { return Stato.prendi(idMem(v)); }
    const nuovePerGiorno = () => imp().carteNuove || 20;
    const ripassiPerGiorno = () => imp().carteRipassi || 150;
    /** Coda di oggi: carte scadute (prima le più a rischio) + nuove fino al limite, mescolate tra mazzi. */
    function coda(ids, oggiK = ymd(new Date())) {
        const tutte = voci(ids);
        const scad = tutte.map(v => ({ v, m: mem(v) })).filter(x => x.m && x.m.due <= oggiK && x.m.ultimo !== oggiK)
            .map(x => ({ v: x.v, r: Ripassi.recuperabilita(Math.max(0, giorni(x.m.ultimo, oggiK)), x.m.s) })).sort((a, b) => a.r - b.r).slice(0, ripassiPerGiorno()).map(x => x.v);
        const giaNuove = Stato.tutti('memoria').filter(m => m.er.startsWith('carta:') && m.log && m.log[0] && m.log[0][0] === oggiK).length;
        const nuove = tutte.filter(v => !mem(v)).slice(0, Math.max(0, nuovePerGiorno() - giaNuove));
        // alternanza: una nuova ogni 3 ripassi; mai due carte di fila dello stesso mazzo se evitabile
        const out = [];
        let i = 0, j = 0;
        while (i < scad.length || j < nuove.length) {
            for (let k = 0; k < 3 && i < scad.length; k++)
                out.push(scad[i++]);
            if (j < nuove.length)
                out.push(nuove[j++]);
        }
        for (let k = 1; k < out.length - 1; k++)
            if (out[k].c.mazzo === out[k - 1].c.mazzo) {
                const s = out.findIndex((x, q) => q > k && x.c.mazzo !== out[k - 1].c.mazzo);
                if (s > 0)
                    [out[k], out[s]] = [out[s], out[k]];
            }
        return out;
    }
    function conta(ids) {
        const oggiK = ymd(new Date()), tutte = voci(ids);
        let nuove = 0, ripasso = 0;
        for (const v of tutte) {
            const m = mem(v);
            if (!m)
                nuove++;
            else if (m.due <= oggiK && m.ultimo !== oggiK)
                ripasso++;
        }
        return { nuove: Math.min(nuove, nuovePerGiorno()), ripasso: Math.min(ripasso, ripassiPerGiorno()), totale: tutte.length };
    }
    /** Prossimo intervallo (giorni) per ogni voto, da scrivere sui tasti. */
    function anteprima(v) {
        const m = mem(v), oggiK = ymd(new Date()), t = m && m.ultimo ? giorni(m.ultimo, oggiK) : 0;
        return [1, 2, 3, 4].map(g => g === 1 ? 0 : Ripassi.intervallo(Ripassi.passo(m && m.ultimo ? { d: m.d, s: m.s } : null, g, t).s, Ripassi.ritenzione(oggiK)));
    }
    function valuta(v, g, sec) {
        const oggiK = ymd(new Date()), m = mem(v), t = m && m.ultimo ? giorni(m.ultimo, oggiK) : 0;
        const st = Ripassi.passo(m && m.ultimo ? { d: m.d, s: m.s } : null, g, t);
        const iv = g === 1 ? 0 : Ripassi.intervallo(st.s, Ripassi.ritenzione(oggiK));
        const d = daDt(oggiK);
        d.setDate(d.getDate() + iv);
        Stato.salva({ id: idMem(v), type: 'memoria', updatedAt: 0, er: 'carta:' + v.c.id + (v.rev ? ':r' : ''), d: st.d, s: st.s, due: ymd(d), ultimo: oggiK,
            n: (m ? m.n : 0) + 1, lapsi: (m ? m.lapsi : 0) + (m && g === 1 ? 1 : 0), log: ((m && m.log) || []).concat([[oggiK, g, undefined, sec]]).slice(-50) }, true);
    }
    /**
     * v0.20.3: le domande sbagliate dei quiz diventano flashcard in automatico, nel mazzo «⚠️ Errori dei quiz»
     * con un sotto-mazzo per sotto-step (collegato: entra nei ripassi e in «Studia ora»). Stessa domanda =
     * stessa carta. Restituisce gli id delle carte NUOVE (per l'Annulla).
     */
    function daErrori(lista) {
        if (imp().carteDaErrori === false)
            return [];
        const nuove = [];
        let radice = Stato.prendi('mz-errori');
        for (const d of lista) {
            if (!d.q || !d.giusta)
                continue;
            if (!radice || radice.deleted) {
                radice = { id: 'mz-errori', type: 'mazzo', updatedAt: 0, nome: '⚠️ Errori dei quiz' };
                Stato.salva(radice, true);
            }
            const t = d.schedaId.startsWith('sim:') ? null : trovaScheda(d.schedaId);
            const idM = 'mz-err-' + (t ? t.k : 'sim');
            if (!Stato.prendi(idM) || Stato.prendi(idM).deleted)
                Stato.salva({ id: idM, type: 'mazzo', updatedAt: 0, nome: t ? Studio.etichetta(t.k) + ' · errori' : 'Simulazioni · errori', padre: 'mz-errori', ...(t ? { sub: t.k, micro: t.micro } : {}) }, true);
            const id = 'cr-' + hash(idM + '|' + norm(d.q));
            if (Stato.prendi(id) && !Stato.prendi(id).deleted)
                continue;
            Stato.salva({ id, type: 'carta', updatedAt: 0, mazzo: idM, f: d.q, r: d.giusta + (d.spieg ? '\n\n' + d.spieg : ''), tipo: 'base', tag: 'errore' }, true);
            nuove.push(id);
        }
        if (nuove.length)
            Stato.notifica();
        return nuove;
    }
    return { daErrori, mazzi, carte, figli, albero, carteDi, leggi, daTesto, daMarkdown, daJson, collega, riempi, nuovoMazzo, importaFileDrive, importaCartellaDrive, aggiornaDaDrive, coda, conta, anteprima, valuta, mem, voci, isCloze, hash };
})();
// ---------- Rendering di una faccia (Markdown minimale, completamenti, immagini da Drive) ----------
const immaginiDrive = new Map();
function htmlCarta(s, cloze = 'no') {
    let x = md(s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '\u0001$2\u0002$1\u0003'));
    x = x.replace(/\u0001([^\u0002]+)\u0002([^\u0003]*)\u0003/g, (_t, src, alt) => {
        const sorg = src.startsWith('drive:') ? (immaginiDrive.get(src.slice(6)) || '') : /^https:\/\//.test(src) ? src : '';
        return '<img class="carta-img" alt="' + alt + '"' + (src.startsWith('drive:') ? ' data-drive="' + esc(src.slice(6)) + '"' : '') + (sorg ? ' src="' + esc(sorg) + '"' : '') + '>';
    });
    if (cloze !== 'no')
        x = x.replace(/\{\{([^}]+)\}\}/g, (_t, c) => cloze === 'nascondi' ? '<span class="cloze-buco">[ … ]</span>' : '<span class="cloze-vista">' + c + '</span>');
    return x;
}
/** Carica le immagini Drive mancanti dentro un elemento. */
function caricaImmagini(el) {
    el.querySelectorAll('img[data-drive]:not([src])').forEach(async (img) => {
        const id = img.dataset.drive;
        try {
            if (!immaginiDrive.has(id))
                immaginiDrive.set(id, URL.createObjectURL(await Drive.scaricaBlob(id)));
            img.src = immaginiDrive.get(id);
        }
        catch (_) {
            img.alt = '🖼 immagine non disponibile offline';
        }
    });
}
const rispostaDi = (c, rev) => c.tipo === 'cloze' ? (c.f.match(/\{\{([^}]+)\}\}/g) || []).map(x => x.slice(2, -2)).join(' · ') : rev ? c.f : c.r;
const domandaDi = (c, rev) => c.tipo === 'cloze' ? htmlCarta(c.f, 'nascondi') : htmlCarta(rev ? c.r : c.f);
const testoPiano = (s) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
const normRisp = (s) => norm(testoPiano(s)).replace(/[.;:!?]+$/, '').replace(/,/g, '.').replace(/\s+/g, ' ').trim();
// ---------- Sessione di ripasso ----------
function avviaCarte(ids, titolo = 'Flashcard') {
    const coda = Carte.coda(ids);
    if (!coda.length) {
        avviso('Nessuna carta da ripassare oggi. 🎉');
        return;
    }
    let modo = imp().modoCarte || 'gira';
    let i = 0, giuste = 0, fatte = 0, girata = false, t0 = Date.now(), ripetute = new Map();
    const v = visore('🃏 ' + titolo, () => disegna());
    const contatore = h('span.carte-contatore');
    const sceltaModo = h('div.segmenti.carte-modi', null, [['gira', 'Gira'], ['scelta', 'Scelta'], ['scrivi', 'Scrivi']].map(([m, t]) => h('button' + (m === modo ? '.attivo' : ''), { onclick: (e) => { modo = m; const i2 = imp(); i2.modoCarte = m; Stato.salva(i2, true); sceltaModo.querySelectorAll('button').forEach(b => b.classList.toggle('attivo', b === e.target)); mostra(); } }, t)));
    v.barra.appendChild(contatore);
    const area = h('div.carte-area');
    v.corpo.append(h('div.carte-testa', null, sceltaModo), area);
    const avanti = (g) => {
        const x = coda[i];
        Carte.valuta(x, g, Math.round((Date.now() - t0) / 1000));
        fatte++;
        if (g >= 3)
            giuste++;
        if (g === 1) {
            const n = (ripetute.get(x.c.id) || 0) + 1;
            ripetute.set(x.c.id, n);
            if (n <= 2)
                coda.splice(Math.min(coda.length, i + 4), 0, x);
        }
        i++;
        mostra();
    };
    function mostra() {
        svuota(area);
        girata = false;
        t0 = Date.now();
        contatore.textContent = Math.min(i + 1, coda.length) + '/' + coda.length;
        if (i >= coda.length) {
            area.append(h('div.carte-fine', null, h('div.carte-fine-num', null, giuste + '/' + fatte), h('div', null, 'carte ricordate al primo colpo o dopo il ripasso'), h('div.tenue.piccolo', null, 'Le sbagliate torneranno domani: la fatica di ricordare è ciò che le fissa.'), h('div.bottoni', null, h('button.btn', { onclick: v.chiudi }, 'Fine'))));
            if (giuste === fatte && fatte >= 5)
                festa();
            return;
        }
        const x = coda[i], c = x.c, mz = Stato.prendi(c.mazzo);
        const fronte = h('div.carta-faccia.fronte'), retro = h('div.carta-faccia.retro');
        fronte.innerHTML = domandaDi(c, x.rev);
        retro.innerHTML = c.tipo === 'cloze' ? htmlCarta(c.f, 'mostra') + (c.r ? '<hr>' + htmlCarta(c.r) : '') : htmlCarta(x.rev ? c.f : c.r);
        const carta = h('div.carta', { role: 'button', tabindex: '0', 'aria-label': 'Gira la carta' }, h('div.carta-interno', null, fronte, retro));
        const etich = h('div.tenue.piccolo.carta-mazzo', null, (mz ? mz.nome : '') + (c.ctx ? ' › ' + c.ctx : '') + (x.rev ? ' · inversa' : '') + (Carte.mem(x) ? '' : ' · nuova'));
        area.append(etich, carta);
        caricaImmagini(carta);
        const gira = () => { if (girata)
            return; girata = true; carta.classList.add('girata'); };
        const voti = () => {
            const iv = Carte.anteprima(x), nomi = ['Di nuovo', 'Difficile', 'Bene', 'Facile'];
            const testoIv = (d) => d === 0 ? '<10 min' : d < 30 ? d + ' g' : d < 365 ? Math.round(d / 30) + ' mesi' : '1 anno+';
            return h('div.carte-voti', null, [1, 2, 3, 4].map(g => h('button.voto.voto-' + g, { onclick: () => avanti(g) }, h('b', null, nomi[g - 1]), h('small', null, testoIv(iv[g - 1])))));
        };
        const giustaS = rispostaDi(c, x.rev);
        const altreS = modo === 'scelta' ? Array.from(new Set(Carte.voci([c.mazzo]).concat(Carte.voci()).filter(y => y.c.id !== c.id).map(y => rispostaDi(y.c, x.rev)).filter(r => r && normRisp(r) !== normRisp(giustaS)))) : [];
        const modoQui = modo === 'scelta' && altreS.length < 2 ? 'gira' : modo; // poche carte simili: questa si gira
        if (modoQui === 'gira') {
            const sotto = h('div.carte-sotto', null, h('button.btn.carte-mostra', { onclick: () => { gira(); svuota(sotto); sotto.appendChild(voti()); } }, 'Mostra risposta'));
            carta.addEventListener('click', () => { if (!girata) {
                gira();
                svuota(sotto);
                sotto.appendChild(voti());
            } });
            // scorri: destra = Bene, sinistra = Di nuovo (dopo aver girato)
            let x0 = 0, dx = 0;
            carta.addEventListener('pointerdown', e => { x0 = e.clientX; dx = 0; });
            carta.addEventListener('pointermove', e => { if (!girata || !x0)
                return; dx = e.clientX - x0; carta.style.transform = 'translateX(' + dx + 'px) rotate(' + dx / 25 + 'deg)'; carta.classList.toggle('verso-ok', dx > 60); carta.classList.toggle('verso-ko', dx < -60); });
            const rilascia = () => { if (!x0)
                return; x0 = 0; carta.style.transform = ''; carta.classList.remove('verso-ok', 'verso-ko'); if (girata && Math.abs(dx) > 90)
                avanti(dx > 0 ? 3 : 1); };
            carta.addEventListener('pointerup', rilascia);
            carta.addEventListener('pointercancel', rilascia);
            area.appendChild(sotto);
        }
        else if (modoQui === 'scelta') {
            const giusta = giustaS, altre = altreS;
            const stesso = new Set(Carte.voci([c.mazzo]).map(y => rispostaDi(y.c, x.rev)));
            const opz = altre.sort((p, q) => (stesso.has(q) ? 1 : 0) - (stesso.has(p) ? 1 : 0) || Math.random() - .5).slice(0, 3).concat([giusta]).sort(() => Math.random() - .5);
            const forme = ['▲', '◆', '●', '■'];
            const lista = h('div.carte-opzioni', null, opz.map((o, k) => h('button.opzione.op-' + k, { onclick: (e) => {
                    const ok = o === giusta;
                    lista.querySelectorAll('button').forEach((b, q) => { b.disabled = true; if (opz[q] === giusta)
                        b.classList.add('giusta'); });
                    if (!ok)
                        e.currentTarget.classList.add('sbagliata');
                    gira();
                    area.appendChild(h('div.bottoni', null, h('button.btn', { onclick: () => avanti(ok ? 3 : 1) }, ok ? '✓ Avanti' : '✗ Avanti (la rivedrai)')));
                } }, h('span.forma', null, forme[k]), h('span', null, testoPiano(o)))));
            area.appendChild(lista);
        }
        else {
            const giusta = rispostaDi(c, x.rev);
            const campo = h('input.carte-campo', { type: 'text', placeholder: 'Scrivi la risposta…', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
            const verifica = () => {
                if (girata)
                    return;
                const ok = normRisp(campo.value) === normRisp(giusta) || (normRisp(giusta).length > 12 && normRisp(giusta).includes(normRisp(campo.value)) && normRisp(campo.value).length >= normRisp(giusta).length * .6);
                gira();
                campo.disabled = true;
                campo.classList.add(ok ? 'giusta' : 'sbagliata');
                area.appendChild(h('div.bottoni', null, h('button.btn', { onclick: () => avanti(ok ? 3 : 1) }, ok ? '✓ Avanti' : '✗ Avanti'), ok ? null : h('button.btn.neutro', { onclick: () => avanti(3) }, 'Era giusta')));
            };
            const form = h('form.carte-scrivi', { onsubmit: (e) => { e.preventDefault(); verifica(); } }, campo, h('button.btn', { type: 'submit' }, 'Verifica'));
            area.appendChild(form);
            setTimeout(() => campo.focus(), 50);
        }
    }
    mostra();
}
/** Piccola celebrazione (rispetta "riduci movimento"). */
function festa() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches)
        return;
    const cv = h('canvas.festa');
    document.body.appendChild(cv);
    cv.width = innerWidth;
    cv.height = innerHeight;
    const g = cv.getContext('2d');
    const col = ['#6c8cff', '#2f9e44', '#f59f00', '#e8590c', '#7048e8'];
    const p = Array.from({ length: 60 }, () => ({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - .5) * 9, vy: -Math.random() * 9 - 3, c: col[Math.floor(Math.random() * 5)], r: Math.random() * 6 + 3 }));
    let t = 0;
    const passo = () => { g.clearRect(0, 0, cv.width, cv.height); for (const q of p) {
        q.x += q.vx;
        q.y += q.vy;
        q.vy += .35;
        g.fillStyle = q.c;
        g.fillRect(q.x, q.y, q.r, q.r * .6);
    } if (++t < 55)
        requestAnimationFrame(passo);
    else
        cv.remove(); };
    requestAnimationFrame(passo);
}
// ---------- Viste ----------
function editorCarta(idMazzo, c) {
    const f = h('textarea.campo', { rows: 3, placeholder: 'Fronte (domanda). Completamento: scrivi {{parola}} per nasconderla.' }, c ? c.f : '');
    const r = h('textarea.campo', { rows: 3, placeholder: 'Retro (risposta). Immagini: ![](https://…)' }, c ? c.r : '');
    const inv = h('input', { type: 'checkbox', checked: !!(c && c.inversa) });
    foglio({ titolo: c ? 'Modifica carta' : 'Nuova carta', corpo: h('div.modulo', null, f, r, h('label.widget-riga', null, h('span.nome', null, 'Crea anche la carta inversa', h('div.tenue.piccolo', null, 'Studi anche dal retro al fronte (utile per termini e definizioni).')), h('span.interruttore', null, inv, h('span')))),
        elimina: c ? () => { Stato.elimina(c.id); } : undefined,
        salva: () => {
            if (!f.value.trim())
                return;
            if (c && Carte.hash(idMazzo + '|' + norm(c.f)) !== Carte.hash(idMazzo + '|' + norm(f.value))) {
                Object.assign(c, { f: f.value.trim(), r: r.value.trim(), tipo: Carte.isCloze(f.value) ? 'cloze' : 'base', inversa: inv.checked || undefined });
                Stato.salva(c);
                return;
            }
            Carte.riempi(idMazzo, [{ f: f.value.trim(), r: r.value.trim() }]);
            const id = 'cr-' + Carte.hash(idMazzo + '|' + norm(f.value.trim())), nc = Stato.prendi(id);
            if (nc) {
                nc.inversa = inv.checked || undefined;
                Stato.salva(nc);
            }
            if (!c)
                setTimeout(() => editorCarta(idMazzo), 50); // pronta la prossima (creare deve essere veloce)
        } });
}
async function importaCarte(padre) {
    const fileLocale = h('input', { type: 'file', accept: '.txt,.csv,.tsv,.md,.markdown,.json,text/*,application/json', style: { display: 'none' }, onchange: async () => {
            const fl = fileLocale.files;
            if (!fl || !fl.length)
                return;
            let n = 0;
            for (const file of Array.from(fl)) {
                const d = Carte.leggi(file.name, await file.text());
                const m = Carte.nuovoMazzo(d.nome || file.name.replace(/\.[^.]+$/, ''), padre, d.micro ? Carte.collega(d.micro) : {});
                n += Carte.riempi(m.id, d.carte);
            }
            fs.chiudi();
            avviso('Importate ' + n + ' carte.');
            disegna();
        } });
    const fs = foglio({ titolo: 'Importa flashcard', corpo: h('div.modulo', null, h('div.tenue.piccolo', null, 'Formati: testo/CSV «fronte TAB retro» (export di Quizlet o di Anki «Note in testo semplice»), Markdown («---» tra fronte e retro, «===» tra le carte, oppure «domanda :: risposta»), JSON. Il file .apkg di Anki non si legge: da Anki esporta come testo.'), h('div.gruppo', null, h('button.voce-lista', { onclick: () => fileLocale.click() }, h('span.voce-corpo', null, h('span.voce-titolo', null, '📱 File dal telefono o dal PC'), h('span.voce-sotto', null, 'uno o più file: ogni file diventa un mazzo'))), h('button.voce-lista', { onclick: async () => {
                if (serveGoogle())
                    return;
                const sc = await scegliFileDrive({ titolo: 'File di flashcard su Drive', multi: true });
                if (!sc.length)
                    return;
                fs.chiudi();
                avviso('Importo…');
                let n = 0;
                for (const x of sc)
                    n += await Carte.importaFileDrive(x.id, x.name, padre);
                avviso('Importate ' + n + ' carte da ' + sc.length + ' file.');
                disegna();
            } }, h('span.voce-corpo', null, h('span.voce-titolo', null, '📄 File su Drive'), h('span.voce-sotto', null, 'restano collegati: «Aggiorna da Drive» rilegge le modifiche'))), h('button.voce-lista', { onclick: async () => {
                if (serveGoogle())
                    return;
                const sc = await scegliFileDrive({ titolo: 'Cartella di flashcard su Drive', mime: 'application/vnd.google-apps.folder' });
                if (!sc.length)
                    return;
                fs.chiudi();
                avviso('Importo la cartella…', 4000);
                try {
                    const r = await Carte.importaCartellaDrive(sc[0].id, sc[0].name, padre);
                    avviso('Importati ' + r.mazzi + ' mazzi, ' + r.carte + ' carte.');
                }
                catch (e) {
                    avviso('Import non riuscito: ' + (e.message || e), 8000);
                }
                disegna();
            } }, h('span.voce-corpo', null, h('span.voce-titolo', null, '📁 Cartella su Drive'), h('span.voce-sotto', null, 'cartella = mazzo, sottocartelle = sotto-mazzi; le immagini della cartella si usano con ![](nome.png)')))), fileLocale) });
}
function esportaMazzo(m) {
    const righe = ['#separator:tab', '#html:false', '#columns:Fronte\tRetro'].concat(Carte.carteDi(m.id).map(c => [c.f, c.r].map(x => x.replace(/[\t\r\n]+/g, ' ')).join('\t')));
    const a = h('a', { href: URL.createObjectURL(new Blob([righe.join('\n')], { type: 'text/plain' })), download: m.nome + '.txt' });
    a.click();
}
function opzioniMazzo(m) {
    chiedi(m.nome, [
        { testo: '➕ Aggiungi carta', valore: 'carta' }, { testo: '📂 Sotto-mazzo', valore: 'sotto' },
        ...(m.fonte ? [{ testo: '🔄 Aggiorna da Drive', valore: 'agg' }] : []),
        { testo: '✏️ Rinomina', valore: 'nome' }, { testo: '📤 Esporta (Anki/Quizlet)', valore: 'esp' },
        { testo: '🗑 Elimina mazzo e carte', valore: 'del', pericolo: true }
    ]).then(async (r) => {
        if (r === 'carta')
            editorCarta(m.id);
        if (r === 'sotto') {
            const n = prompt('Nome del sotto-mazzo');
            if (n) {
                Carte.nuovoMazzo(n, m.id);
                disegna();
            }
        }
        if (r === 'agg') {
            if (serveGoogle())
                return;
            avviso('Aggiorno…');
            try {
                const n = await Carte.aggiornaDaDrive(m);
                avviso(n ? n + ' carte nuove o modificate.' : 'Già aggiornato.');
            }
            catch (e) {
                avviso(String(e.message || e));
            }
        }
        if (r === 'nome') {
            const n = prompt('Nuovo nome', m.nome);
            if (n) {
                m.nome = n;
                Object.assign(m, Carte.collega(n));
                Stato.salva(m);
            }
        }
        if (r === 'esp')
            esportaMazzo(m);
        if (r === 'del') {
            for (const id of Carte.albero(m.id)) {
                for (const c of Carte.carte().filter(c => c.mazzo === id))
                    Stato.elimina(c.id);
                Stato.elimina(id);
            }
        }
    });
}
function vistaCarte() {
    const aperto = UI.mazzoAperto;
    if (aperto && Stato.prendi(aperto))
        return vistaMazzo(Stato.prendi(aperto));
    const tot = Carte.conta(), radici = Carte.mazzi().filter(m => !m.padre || !Stato.prendi(m.padre));
    const riga = (m, liv) => {
        const n = Carte.conta([m.id]);
        return [h('div.voce-lista.mazzo-riga', { style: { paddingLeft: (8 + liv * 16) + 'px' } }, h('button.voce-corpo', { onclick: () => { UI.mazzoAperto = m.id; disegna(); } }, h('span.voce-titolo', null, (liv ? '└ ' : '') + m.nome, m.sub ? h('span.chip-mini', null, Studio.etichetta(m.sub) + (m.micro ? ' ' + m.micro : '')) : null), h('span.voce-sotto', null, h('b.c-nuove', null, n.nuove + ' nuove'), ' · ', h('b.c-rip', null, n.ripasso + ' da ripassare'), ' · ' + n.totale + ' carte', m.fonte ? ' · ☁︎ Drive' : '')), h('button.icona-btn', { 'aria-label': 'Opzioni', onclick: () => opzioniMazzo(m) }, '⋯'))].concat(...Carte.figli(m.id).map(f => riga(f, liv + 1)));
    };
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('section.card', null, h('button.btn.studia-ora', { disabled: !(tot.nuove + tot.ripasso), onclick: () => avviaCarte(undefined, 'Tutti i mazzi') }, tot.nuove + tot.ripasso ? '▶ Ripassa ' + (tot.nuove + tot.ripasso) + ' carte' : '✓ Nessuna carta per oggi'), h('div.tenue.piccolo', { style: { marginTop: '6px' } }, tot.ripasso + ' da ripassare + ' + tot.nuove + ' nuove (massimo ' + (imp().carteNuove || 20) + ' nuove al giorno, come Anki). Si alternano mazzi diversi.'), h('div.bottoni', null, h('button.btn.neutro', { onclick: () => { const n = prompt('Nome del mazzo (es. «2.2.4 Calore latente» per collegarlo allo step)'); if (n) {
            const m = Carte.nuovoMazzo(n);
            disegna();
            editorCarta(m.id);
        } } }, '＋ Nuovo mazzo'), h('button.btn.neutro', { onclick: () => importaCarte() }, '⤓ Importa'))), h('section.card', null, h('h2.card-titolo', null, 'Mazzi'), radici.length ? radici.flatMap(m => riga(m, 0)) : h('div.vuoto', null, 'Nessun mazzo. Creane uno o importa da Drive (file o cartelle), da Anki o da Quizlet.')));
}
function vistaMazzo(m) {
    const n = Carte.conta([m.id]), cc = Carte.carteDi(m.id);
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('button.btn-testo', { style: { alignSelf: 'flex-start' }, onclick: () => { UI.mazzoAperto = m.padre && Stato.prendi(m.padre) ? m.padre : undefined; disegna(); } }, '‹ Mazzi'), h('section.card', null, h('h2.card-titolo', null, m.nome), m.sub ? h('div.tenue.piccolo', null, 'Collegato a ' + Studio.etichetta(m.sub) + (m.micro ? ' · microstep ' + m.micro : '') + ': compare nei ripassi e in «Studia ora».') : null, h('button.btn.studia-ora', { disabled: !(n.nuove + n.ripasso), onclick: () => avviaCarte([m.id], m.nome) }, n.nuove + n.ripasso ? '▶ Ripassa ' + (n.nuove + n.ripasso) + ' carte' : '✓ Niente per oggi'), h('div.bottoni', null, h('button.btn.neutro', { onclick: () => editorCarta(m.id) }, '＋ Carta'), h('button.btn.neutro', { onclick: () => importaCarte(m.id) }, '⤓ Importa qui'), h('button.btn.neutro', { onclick: () => opzioniMazzo(m) }, '⋯ Altro'))), h('section.card', null, h('h2.card-titolo', null, cc.length + ' carte'), cc.slice(0, 200).map(c => {
        const me = Carte.mem({ c, rev: false });
        return h('button.voce-lista', { onclick: () => editorCarta(c.mazzo, c) }, h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, testoPiano(c.f.replace(/\{\{([^}]+)\}\}/g, '[$1]')).slice(0, 120)), h('span.voce-sotto', null, testoPiano(c.r).slice(0, 90) || (c.tipo === 'cloze' ? 'completamento' : ''), me ? ' · 🧠 ' + Math.round(Ripassi.recuperabilita(Math.max(0, Math.round((inizioGiorno(new Date()).getTime() - inizioGiorno(daDt(me.ultimo)).getTime()) / 86400000)), me.s) * 100) + '%' : ' · nuova')));
    }), cc.length > 200 ? h('div.tenue.piccolo', null, '… e altre ' + (cc.length - 200)) : null));
}
/** Nel sotto-step: carte collegate. */
function rigaCarte(k) {
    const mz = Carte.mazzi().filter(m => m.sub === k);
    if (!mz.length)
        return h('div.bottoni', null, h('button.btn.neutro', { onclick: () => {
                const t = Studio.trovaSotto(k);
                const m = Carte.nuovoMazzo(Studio.etichetta(k) + (t ? ' · ' + t.sub.titolo : ''), undefined, { sub: k });
                disegna();
                editorCarta(m.id);
            } }, '🃏 Crea flashcard per ' + Studio.etichetta(k)));
    const n = Carte.conta(mz.map(m => m.id));
    return h('div.bottoni', null, h('button.btn.neutro', { onclick: () => avviaCarte(mz.map(m => m.id), Studio.etichetta(k)) }, '🃏 Flashcard di ' + Studio.etichetta(k) + ' (' + (n.nuove + n.ripasso) + ' oggi / ' + n.totale + ')'));
}
/** Riquadro in Oggi. */
function widgetCarte() {
    if (!Carte.mazzi().length)
        return null;
    const n = Carte.conta();
    if (!(n.nuove + n.ripasso))
        return null;
    return scheda('Flashcard di oggi', h('div.tenue.piccolo', null, n.ripasso + ' da ripassare + ' + n.nuove + ' nuove · circa ' + Math.max(2, Math.round((n.ripasso + n.nuove) * 0.2)) + ' min'), h('div.bottoni', null, h('button.btn', { onclick: () => avviaCarte(undefined, 'Tutti i mazzi') }, '▶ Ripassa')));
}

// 07-cattura.ts — Lettura automatica del risultato dei quiz HTML (F3 ridotta, tattica T12).
//
// I file dei quiz su Drive NON vengono mai modificati: quando l'app apre un quiz, aggiunge alla copia
// scaricata (solo in memoria, nell'iframe) un piccolo "osservatore" che guarda la schermata finale del
// motore dei quiz e manda all'app: percentuale, giuste/totale, righe "Per tipo di domanda", punto debole
// e se era "Rifai solo gli errori".
//
// Decisioni dell'utente (11/11): salvataggio automatico con avviso "tocca per annullare" (8 s);
// "Rifai solo gli errori" NON cambia il punteggio: si annota nella nota della scheda.
//
// Selettori del motore dei quiz (schermata finale): .score .big ("12 / 16"), .score .pct ("75% di
// risposte corrette"), .lvrow (tipo, barra, "ok/tot"), .weak ("Punto debole: …"), .stat durante il
// quiz ("Domanda 1 di 3 · ripasso errori"). Se un quiz ha un formato diverso, non succede nulla:
// il punteggio si scrive a mano come prima.
const Cattura = (() => {
    const SPIA = '<script>(function(){var retry=false,inviato=null;function leggi(){try{'
        + 'var st=document.querySelector(".stat");if(st&&/Domanda\\s+1\\s+di/.test(st.textContent)){retry=/ripasso errori/i.test(st.textContent)}'
        + 'var pc=document.querySelector(".score .pct");if(!pc){inviato=null;return}'
        + 'var m=/(\\d+)\\s*%/.exec(pc.textContent);if(!m)return;'
        + 'var big=document.querySelector(".score .big"),gm=big?/(\\d+)\\s*\\/\\s*(\\d+)/.exec(big.textContent):null;'
        + 'var liv=[].map.call(document.querySelectorAll(".lvrow"),function(r){var s=r.querySelector("span"),n=/(\\d+)\\s*\\/\\s*(\\d+)\\s*$/.exec(r.textContent.trim());return[s?s.textContent.trim():"",n?+n[1]:0,n?+n[2]:0]});'
        + 'var deb=null;[].forEach.call(document.querySelectorAll(".weak"),function(w){var t=w.textContent;if(/Punto debole:/.test(t))deb=t.replace(/^[\\s\\S]*Punto debole:\\s*/,"").replace(/\\s*\\([\\s\\S]*$/,"").trim()});'
        + 'var sb=[];var rv=document.querySelector(".review");if(rv)[].forEach.call(rv.querySelectorAll("details"),function(d){var su=d.querySelector("summary"),ps=d.querySelectorAll(".inner p"),giu="",sp="";[].forEach.call(ps,function(p){var b=p.querySelector("b.r");if(b)giu=p.textContent.replace(/^\\s*Risposta corretta:\\s*/,"").trim();else if(!p.classList.contains("pair")&&!sp)sp=p.textContent.trim()});if(su)sb.push([su.textContent.trim().slice(0,400),giu.slice(0,200),sp.slice(0,400)])});'
        + 'var firma=m[1]+"|"+(gm?gm[0]:"")+"|"+retry;if(firma===inviato)return;inviato=firma;'
        + 'parent.postMessage({imc:"quiz-risultato",pct:+m[1],giuste:gm?+gm[1]:null,totale:gm?+gm[2]:null,livelli:liv,debole:deb,errori:retry,sbagliate:sb},"*")'
        + '}catch(e){}}new MutationObserver(leggi).observe(document.documentElement,{childList:true,subtree:true,characterData:true})})();<\/script>';
    /** Aggiunge l'osservatore alla copia del quiz (in fondo al body). */
    function inietta(html) { return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, SPIA + '</body>') : html + SPIA; }
    let ctx = null;
    let ascolto = false;
    function osserva(frame, schedaId, titolo, cb) {
        ctx = { frame, schedaId, titolo, cb };
        if (!ascolto) {
            window.addEventListener('message', ricevi);
            ascolto = true;
        }
    }
    function ricevi(e) {
        const d = e.data;
        if (!d || d.imc !== 'quiz-risultato' || !ctx || e.source !== ctx.frame.contentWindow)
            return;
        if (typeof d.pct !== 'number' || d.pct < 0 || d.pct > 100)
            return;
        if (ctx.cb)
            ctx.cb(d);
        else
            salva(ctx.schedaId, d);
    }
    /** Salva il risultato; restituisce la funzione per annullare. */
    function salva(id, d) {
        const oggiK = ymd(new Date());
        const p0 = Studio.prog(id), primaProg = p0 ? JSON.parse(JSON.stringify(p0)) : null;
        const t = trovaScheda(id), idMem = t ? 'mem-sub-' + t.k : '';
        const m0 = idMem ? Stato.prendi(idMem) : undefined, primaMem = m0 ? JSON.parse(JSON.stringify(m0)) : null;
        const quanto = d.giuste != null && d.totale != null ? d.giuste + '/' + d.totale : d.pct + '%';
        const annullaDom = typeof Domande !== 'undefined' ? Domande.registra(id, t ? Studio.etichetta(t.k) + ' ' + t.micro + ' · ' + t.s.titolo : id, d) : () => { }; // v0.16
        let testo;
        if (d.errori) {
            const riga = 'Errori rifatti ' + oggiK.slice(8, 10) + '/' + oggiK.slice(5, 7) + ': ' + quanto;
            Studio.segna(id, { nota: ((p0 && p0.nota) ? p0.nota + '\n' : '') + riga });
            testo = '📝 ' + riga + ' (annotato, il punteggio non cambia)';
        }
        else {
            Studio.segna(id, { fatta: true, data: oggiK, punteggio: d.pct, deboli: d.livelli && d.livelli.length ? d.livelli : undefined });
            testo = '✅ Salvato ' + d.pct + '% (' + quanto + ')' + (typeof Freddo !== 'undefined' ? Freddo.confronto(id, d.pct) : '') + (d.debole ? ' · punto debole: ' + d.debole : '');
        }
        const annulla = () => {
            annullaDom();
            if (primaProg)
                Stato.salva(primaProg);
            else
                Stato.elimina('prog-' + id);
            if (idMem) {
                if (primaMem)
                    Stato.salva(primaMem);
                else if (Stato.prendi(idMem))
                    Stato.elimina(idMem);
            }
            avviso('Annullato: risultato non salvato.');
        };
        avviso(testo + ' · tocca per annullare', 8000, annulla);
        return annulla;
    }
    return { inietta, osserva, salva, SPIA };
})();

// 07-chiusura.ts — Chiusura serale della giornata in 2 minuti (v0.13, tattica T28).
//
// Dalle 19:00 compare in cima a Oggi il riquadro "Chiudi la giornata" (finché non la chiudi).
// Tre tocchi: step di oggi (fatti / da spostare a domani), ripasso serale fatto, concentrazione 1–5
// e ore di sonno della notte scorsa. Si salva nel record 'giorno' (id 'g-YYYY-MM-DD').
// Gli step lasciati indietro si spostano con Studio.sposta (i progressi restano).
const Giornata = {
    rec(k = ymd(new Date())) { return Stato.prendi('g-' + k) || { id: 'g-' + k, type: 'giorno', updatedAt: 0, data: k }; },
    oraDiChiudere() { const d = new Date(); return d.getHours() >= 19 && !Giornata.rec().chiuso; },
};
function widgetChiusura() {
    if (!Giornata.oraDiChiudere())
        return null;
    return scheda('Chiudi la giornata', h('div.tenue.piccolo', null, '2 minuti: cosa hai fatto, cosa slitta, come stai. Serve a ripianificare bene e a vedere come sonno e concentrazione influiscono sui risultati.'), h('div.bottoni', null, h('button.btn', { onclick: apriChiusura }, '🌙 Chiudi la giornata')));
}
function apriChiusura() {
    const k = ymd(new Date()), g = Giornata.rec(k), domani = ymd(new Date(Date.now() + 86400000));
    // step di oggi + quelli che questa chiusura aveva già spostato a domani (per poterli riportare)
    const voci = Studio.vociDelGiorno(oggi()).concat(Studio.vociDelGiorno(daDt(domani)).filter(x => (g.spostati || []).includes(x.v.k)))
        .filter(x => !x.v.speciale && x.p.modo !== 'raffinamento');
    const sposta = new Set(g.spostati || []);
    let focus = g.focus || 0, sonno = g.sonno || 0, serale = !!g.ripassoSerale;
    const corpo = h('div.modulo');
    const chip = (val, att, testo, set) => h('button.chip' + (val === att ? '.attivo' : ''), { onclick: () => { set(val); disegnaC(); } }, testo);
    const disegnaC = () => {
        svuota(corpo);
        const righe = voci.map(x => {
            const fatto = Studio.stepFatto(x.v.k, x.p), n = Studio.trovaSotto(x.v.k) ? Studio.numeri(Studio.schedeDi(Studio.trovaSotto(x.v.k).sub)) : null;
            return h('div.widget-riga', null, h('span.nome', null, (fatto ? '✓ ' : '') + Studio.etichetta(x.v.k), h('div.tenue.piccolo', null, n ? n.Pf + '/' + n.P + ' prioritarie' : x.v.t)), fatto ? h('span.tenue.piccolo', null, 'fatto') : h('button.chip' + (sposta.has(x.v.k) ? '.attivo' : ''), { onclick: () => { sposta.has(x.v.k) ? sposta.delete(x.v.k) : sposta.add(x.v.k); disegnaC(); } }, sposta.has(x.v.k) ? '→ domani' : 'Sposta a domani'));
        });
        [
            h('div.gruppo-titolo', null, 'Step di oggi'),
            voci.length ? h('div.gruppo', null, righe) : h('div.tenue.piccolo', null, 'Nessuno step del piano oggi.'),
            voci.some(x => !Studio.stepFatto(x.v.k, x.p)) ? h('div.tenue.piccolo', null, 'Se non lo sposti resta «in ritardo» e potrai ripianificarlo dopo.') : null,
            h('div.gruppo-titolo', null, 'Ripasso prima di dormire'),
            h('div.widget-riga', null, h('span.nome', null, '10–15 min di richiamo a memoria di ciò che hai studiato oggi', h('div.tenue.piccolo', null, 'Senza libro: scrivi o ripeti a voce i punti chiave, poi controlla. Il sonno fissa ciò che hai appena richiamato.')), h('label.interruttore', null, h('input', { type: 'checkbox', checked: serale, onchange: (e) => { serale = e.target.checked; } }), h('span'))),
            h('div.gruppo-titolo', null, 'Concentrazione di oggi'),
            h('div.chips', null, [1, 2, 3, 4, 5].map(v => chip(v, focus, ['😵', '😕', '😐', '🙂', '🔥'][v - 1] + ' ' + v, x => { focus = x; }))),
            h('div.gruppo-titolo', null, 'Ore di sonno la notte scorsa'),
            h('div.chips', null, [5, 6, 7, 8, 9].map(v => chip(v, sonno, (v === 5 ? '≤5' : v === 9 ? '9+' : String(v)) + ' h', x => { sonno = x; }))),
        ].forEach(el => { if (el)
            corpo.appendChild(el); });
    };
    disegnaC();
    foglio({ titolo: 'Chiudi la giornata', corpo, etichettaSalva: 'Fatto', salva: () => {
            for (const x of voci) {
                const pid = x.p.id;
                if (sposta.has(x.v.k) && !Studio.stepFatto(x.v.k, x.p))
                    Studio.sposta(x.v.k, domani, pid);
                else if ((g.spostati || []).includes(x.v.k) && !sposta.has(x.v.k))
                    Studio.sposta(x.v.k, null, pid);
            }
            Stato.salva(Object.assign(g, { chiuso: true, focus: focus || undefined, sonno: sonno || undefined, ripassoSerale: serale, spostati: Array.from(sposta) }));
            const dom = Studio.vociDelGiorno(daDt(domani)).map(x => x.v.speciale ? x.v.t : Studio.etichetta(x.v.k));
            avviso('🌙 Buonanotte. Domani: ' + (dom.length ? dom.join(' + ') : 'niente dal piano') + '.', 7000);
        } });
}
/** Statistiche: sonno e concentrazione rispetto ai punteggi dei quiz fatti lo stesso giorno. */
function sezioneSonno() {
    const giorni = Stato.tutti('giorno').filter(g => g.sonno || g.focus);
    if (giorni.length < 3)
        return null;
    const punteggi = {};
    for (const p of Stato.tutti('progresso'))
        if (p.data && p.punteggio != null)
            (punteggi[p.data] = punteggi[p.data] || []).push(p.punteggio);
    const media = (l) => l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null;
    const gruppo = (f) => media(giorni.filter(f).flatMap(g => punteggi[g.data] || []));
    const pocoSonno = gruppo(g => !!g.sonno && g.sonno < 7), sonnoOk = gruppo(g => !!g.sonno && g.sonno >= 7);
    const focusAlto = gruppo(g => !!g.focus && g.focus >= 4), focusBasso = gruppo(g => !!g.focus && g.focus <= 2);
    return h('section.card', null, h('h2.card-titolo', null, 'Sonno, concentrazione e risultati'), h('div.numeri', null, numero(pocoSonno != null ? pocoSonno + '%' : '—', 'con < 7 h di sonno'), numero(sonnoOk != null ? sonnoOk + '%' : '—', 'con ≥ 7 h')), h('div.numeri', null, numero(focusBasso != null ? focusBasso + '%' : '—', 'concentrazione 1–2'), numero(focusAlto != null ? focusAlto + '%' : '—', 'concentrazione 4–5')), h('div.tenue.piccolo', null, 'Media dei punteggi dei quiz fatti in quei giorni (' + giorni.length + ' giornate chiuse). È una correlazione sui tuoi dati, non una prova: più giornate chiudi, più è affidabile.'));
}

// 07-domande.ts — Errori ricorrenti, domanda per domanda (v0.16).
//
// L'osservatore dei quiz (07-cattura) legge dalla schermata finale la sezione «Da rivedere»: per ogni
// domanda sbagliata testo, risposta corretta e spiegazione. Qui diventano record 'domanda'
// (id 'dom-<hash scheda+testo>') con quante volte è stata sbagliata e com'è andata l'ultima volta.
// - quiz intero: le domande già note di quella scheda che NON sono tra le sbagliate contano come giuste;
// - «rifai solo gli errori»: aggiorna solo quelle ancora aperte;
// - le prove a freddo non contano (lì sbagliare è normale).
// In Studio → Errori: elenco con «mostra risposta» (prima prova a ricordare) e «la sapevo / non la sapevo».
const Domande = (() => {
    function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++)
        h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
    const norm = (q) => q.replace(/\s+/g, ' ').trim().toLowerCase();
    const tutte = () => Stato.tutti('domanda');
    /** Registra l'esito di un quiz; restituisce la funzione per annullare. */
    const Domande_aperte = () => tutte().filter(x => x.esito === 'sbagliata');
    function registra(schedaId, titolo, d) {
        const oggiK = ymd(new Date()), sb = d.sbagliate || [];
        const mie = tutte().filter(x => x.schedaId === schedaId);
        const prima = mie.map(x => JSON.parse(JSON.stringify(x))), nuove = [];
        const sbagliateId = new Set();
        for (const [q, giusta, spieg] of sb) {
            if (!q)
                continue;
            const id = 'dom-' + hash(schedaId + '|' + norm(q));
            sbagliateId.add(id);
            const r = Stato.prendi(id);
            if (r && !r.deleted)
                Stato.salva(Object.assign(r, { volte: r.volte + 1, ultima: oggiK, esito: 'sbagliata', giusta: giusta || r.giusta, spieg: spieg || r.spieg }), true);
            else {
                nuove.push(id);
                Stato.salva({ id, type: 'domanda', updatedAt: 0, schedaId, titolo, q, giusta, spieg: spieg || undefined, volte: 1, giuste: 0, ultima: oggiK, esito: 'sbagliata' }, true);
            }
        }
        // Le domande note che stavolta non sono tra le sbagliate: giuste (nel ripasso errori, solo quelle aperte)
        // (solo se il quiz ha mostrato «Da rivedere» o è tutto giusto: un formato diverso non deve «risolvere» nulla)
        if (sb.length || d.pct === 100)
            for (const r of mie) {
                if (sbagliateId.has(r.id) || (d.errori && r.esito !== 'sbagliata'))
                    continue;
                Stato.salva(Object.assign(r, { giuste: r.giuste + 1, ultima: oggiK, esito: 'giusta' }), true);
            }
        const carteNuove = Carte.daErrori(Domande_aperte()); // v0.20.3: errori → flashcard (anche quelli vecchi ancora aperti)
        Stato.notifica();
        return () => { for (const r of prima)
            Stato.salva(r, true); for (const id of nuove)
            Stato.elimina(id); for (const id of carteNuove)
            Stato.elimina(id); };
    }
    /** Aperte = ultimo esito sbagliato; ricorrenti = sbagliate almeno 2 volte e ancora aperte. */
    const aperte = () => tutte().filter(x => x.esito === 'sbagliata');
    const ricorrenti = () => aperte().filter(x => x.volte >= 2);
    function segna(id, sapevo) {
        const r = Stato.prendi(id);
        if (!r)
            return;
        Stato.salva(Object.assign(r, sapevo ? { giuste: r.giuste + 1, esito: 'giusta' } : { volte: r.volte + 1, esito: 'sbagliata' }, { ultima: ymd(new Date()) }));
    }
    return { registra, aperte, ricorrenti, tutte, segna };
})();
function gruppoDomanda(x) { return x.schedaId.startsWith('sim:') ? 'Simulazioni' : nomeMateria(materiaDi(x.schedaId)); }
/** Sezione in Studio → Errori. */
function sezioneDomande() {
    const filtro = UI.domFiltro || 'ricorrenti';
    const elenco = (filtro === 'ricorrenti' ? Domande.ricorrenti() : filtro === 'aperte' ? Domande.aperte() : Domande.tutte().filter(x => x.esito === 'giusta'))
        .sort((a, b) => b.volte - a.volte || (a.ultima < b.ultima ? 1 : -1));
    const nR = Domande.ricorrenti().length, nA = Domande.aperte().length, nG = Domande.tutte().length - nA;
    const voce = (x) => {
        const risp = h('div.dom-risposta', { hidden: true }, h('div', null, h('b', null, 'Risposta: '), x.giusta || '—'), x.spieg ? h('div.tenue.piccolo', null, x.spieg) : null, x.esito === 'sbagliata' ? h('div.bottoni', null, h('button.btn', { onclick: () => { Domande.segna(x.id, true); avviso('✓ Bene: esce dagli errori aperti.'); } }, '✓ La sapevo'), h('button.btn.neutro', { onclick: () => { Domande.segna(x.id, false); avviso('Resta tra gli errori: la rivedrai.'); } }, '✗ Non la sapevo')) : null);
        return h('div.dom-voce', null, h('div.tenue.piccolo', null, gruppoDomanda(x) + ' · ' + x.titolo + ' · sbagliata ' + x.volte + (x.volte === 1 ? ' volta' : ' volte') + (x.giuste ? ' · giusta ' + x.giuste : '')), h('div.dom-q', null, x.q), h('button.btn-testo', { onclick: (e) => { risp.hidden = !risp.hidden; e.target.textContent = risp.hidden ? 'Prima prova a rispondere, poi mostra la risposta' : 'Nascondi'; } }, 'Prima prova a rispondere, poi mostra la risposta'), risp);
    };
    return h('section.card', null, h('h2.card-titolo', null, 'Domande sbagliate'), h('div.tenue.piccolo', null, 'Raccolte in automatico dai quiz fatti nell\'app (sezione «Da rivedere»). Ricorrenti = sbagliate almeno 2 volte: ripassale prima delle simulazioni.'), h('div.segmenti', null, h('button' + (filtro === 'ricorrenti' ? '.attivo' : ''), { onclick: () => { UI.domFiltro = 'ricorrenti'; disegna(); } }, 'Ricorrenti ' + nR), h('button' + (filtro === 'aperte' ? '.attivo' : ''), { onclick: () => { UI.domFiltro = 'aperte'; disegna(); } }, 'Aperte ' + nA), h('button' + (filtro === 'risolte' ? '.attivo' : ''), { onclick: () => { UI.domFiltro = 'risolte'; disegna(); } }, 'Risolte ' + nG)), nA ? h('button.btn.neutro', { onclick: () => { const n = Carte.daErrori(Domande.aperte()).length; if (n)
            avviso(n + ' errori trasformati in flashcard.'); avviaCarte(['mz-errori'], 'Errori dei quiz'); } }, '🃏 Ripassa gli errori come flashcard') : null, elenco.length ? elenco.slice(0, 60).map(voce) : h('div.vuoto', null, filtro === 'ricorrenti' ? 'Nessuna domanda sbagliata due volte. 👍' : 'Niente qui per ora.'));
}

// ============================================================
// 07-extra.ts — Studio "versatile":
// - corsi di studio creati dall'utente (qualsiasi materia, esame, certificazione…)
// - registro errori (schede da rifare)
// - timer di studio (Pomodoro) e sessioni registrate
// - statistiche per materia
// - esami con conto alla rovescia
// ============================================================
function sogliaErrori() { const v = imp().sogliaErrori; return typeof v === 'number' ? v : 70; }
/** Una scheda è "da rifare" se segnata a mano o se il punteggio è sotto la soglia. */
function daRifare(id) {
    const p = Studio.prog(id);
    return !!p && (!!p.daRifare || (p.punteggio != null && p.punteggio < sogliaErrori()));
}
/** Tutte le schede (di tutti i corsi) con il loro contesto. */
function tutteLeSchede() {
    const out = [];
    for (const pk of Studio.pkStep())
        for (const mat of pk.materie)
            for (const sub of mat.sottostep)
                for (const mi of sub.microstep)
                    for (const s of mi.schede)
                        out.push({ pk, mat, sub, mi, s });
    return out;
}
// ---------- Registro errori ----------
function vistaErrori() {
    const lista = tutteLeSchede().filter(x => daRifare(x.s.id));
    const perMat = new Map();
    for (const x of lista) {
        if (!perMat.has(x.mat.m))
            perMat.set(x.mat.m, []);
        perMat.get(x.mat.m).push(x);
    }
    const soglia = h('input', { type: 'number', min: '0', max: '100', value: String(sogliaErrori()), inputMode: 'numeric', onchange: (e) => {
            const i = imp();
            i.sogliaErrori = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 70));
            Stato.salva(i);
        } });
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, sezioneDomande(), Regole.sezioneTipici(), AIGen.sezione(), h('section.card', null, h('div.tenue.piccolo', null, 'Qui finiscono le schede con punteggio sotto la soglia o segnate "da rifare". Rifalle e inserisci il nuovo punteggio: escono da sole. Compaiono anche nei giorni del piano di raffinamento.'), riga('Soglia', soglia, h('span.dopo', null, '%'))), lista.length ? null : vuoto('Nessuna scheda da rifare. 🎉'), Array.from(perMat.entries()).map(([m, xs]) => h('section.card', null, h('h2.card-titolo', { style: { color: coloreMateria(m) } }, nomeMateria(m) + ' · ' + xs.length), xs.sort((a, b) => (Studio.prog(a.s.id).punteggio ?? 101) - (Studio.prog(b.s.id).punteggio ?? 101)).map(x => {
        const p = Studio.prog(x.s.id);
        return h('button.voce-lista', { onclick: () => apriScheda(x.pk, x.mat.m, x.mi.n, x.s) }, h('span.barra', { style: { background: coloreMateria(m) } }), h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, x.mi.n + ' · ' + x.s.titolo), h('span.voce-sotto', { style: { whiteSpace: 'normal' } }, (p.punteggio != null ? p.punteggio + '%' : 'segnata a mano') + (p.data ? ' · ' + fmt(daYmd(p.data), { day: 'numeric', month: 'short' }) : '') + (p.nota ? ' · ' + p.nota.slice(0, 60) : ''))));
    }))));
}
function widgetErrori() {
    const n = tutteLeSchede().filter(x => daRifare(x.s.id)).length, nr = Domande.ricorrenti().length;
    if (!n && !nr)
        return null;
    return scheda('Schede da rifare', h('button.voce-lista', { onclick: () => { UI.studioVista = 'errori'; UI.studioSub = null; vai('studio'); } }, h('span.voce-corpo', null, h('span.voce-titolo', null, n + (n === 1 ? ' scheda da rifare' : ' schede da rifare') + (nr ? ' · ' + nr + (nr === 1 ? ' domanda ricorrente' : ' domande ricorrenti') : '')), h('span.voce-sotto', null, 'Punteggio sotto il ' + sogliaErrori() + '% o segnate a mano' + (nr ? '; domande sbagliate 2+ volte' : ''))), icona('dx', 18)));
}
const Timer = (() => {
    const CH = 'imc-timer';
    let tick = 0;
    const leggi = () => { try {
        return JSON.parse(localStorage.getItem(CH) || 'null');
    }
    catch (_) {
        return null;
    } };
    const scrivi = (t) => { try {
        if (t)
            localStorage.setItem(CH, JSON.stringify(t));
        else
            localStorage.removeItem(CH);
    }
    catch (_) { /* niente */ } };
    const durate = () => { const i = imp(); return { studio: i.pomodoro || 25, pausa: i.pausa || 5 }; };
    function trascorsi(t) { return ((t.pausaDa || Date.now()) - t.inizio) / 1000; }
    function restano(t) { return Math.max(0, t.durata * 60 - trascorsi(t)); }
    function registra(t, minuti) {
        if (t.fase !== 'studio' || minuti < 1)
            return;
        const i = new Date(t.inizio);
        Stato.salva({ id: 'ses-' + uid(), type: 'sessione', updatedAt: 0, data: ymd(i), inizio: dtStr(i), minuti: Math.round(minuti), m: t.m, k: t.k, schedaId: t.schedaId, titolo: t.titolo });
    }
    function avvia(o) {
        const t = leggi();
        if (t)
            registra(t, trascorsi(t) / 60);
        scrivi({ inizio: Date.now(), fase: 'studio', ...o, durata: o.durata || durate().studio }); // v0.15: durata scelta da «Studia ora»
        avviso('▶ Timer avviato: ' + durate().studio + ' minuti' + (o.titolo ? ' · ' + o.titolo : ''));
        aggiorna();
        disegna();
    }
    function pausaRiprendi() {
        const t = leggi();
        if (!t)
            return;
        if (t.pausaDa) {
            t.inizio += Date.now() - t.pausaDa;
            delete t.pausaDa;
        }
        else
            t.pausaDa = Date.now();
        scrivi(t);
        aggiorna();
    }
    function ferma() {
        const t = leggi();
        if (!t)
            return;
        registra(t, trascorsi(t) / 60);
        scrivi(null);
        aggiorna();
        disegna();
    }
    /** Controlla la scadenza (anche dopo che l'app è stata in background) e aggiorna la barra. */
    function aggiorna() {
        const t = leggi();
        let bar = document.getElementById('timer-barra');
        if (!t) {
            if (bar)
                bar.remove();
            return;
        }
        if (!t.pausaDa && restano(t) <= 0) {
            if (t.fase === 'studio') {
                registra(t, t.durata);
                try {
                    navigator.vibrate && navigator.vibrate([200, 100, 200]);
                }
                catch (_) { /* niente */ }
                avviso('⏰ Fine sessione: ' + t.durata + ' minuti di studio registrati. Pausa di ' + durate().pausa + ' minuti.', 12000);
                scrivi({ ...t, inizio: t.inizio + t.durata * 60000, durata: durate().pausa, fase: 'pausa' });
                Stato.notifica();
            }
            else {
                avviso('⏰ Pausa finita: tocca ▶ per un\'altra sessione.', 12000);
                scrivi(null);
                if (bar)
                    bar.remove();
                return;
            }
            return aggiorna();
        }
        const r = Math.ceil(restano(t)), testo = (t.fase === 'pausa' ? '☕ Pausa ' : '📚 ') + pad2(Math.floor(r / 60)) + ':' + pad2(r % 60) + (t.titolo && t.fase === 'studio' ? ' · ' + t.titolo : '');
        if (!bar) {
            bar = h('div', { id: 'timer-barra' }, h('span.timer-testo'), h('button.timer-btn', { 'aria-label': 'Pausa o riprendi', onclick: pausaRiprendi }, ''), h('button.timer-btn', { 'aria-label': 'Ferma', onclick: () => chiedi('Fermare il timer?', [{ testo: 'Ferma e registra', valore: 'si' }]).then(s => { if (s)
                    ferma(); }) }, '■'));
            document.body.appendChild(bar);
        }
        bar.style.setProperty('--c', t.m ? coloreMateria(t.m) : 'var(--accento)');
        bar.querySelector('.timer-testo').textContent = testo;
        bar.querySelectorAll('.timer-btn')[0].textContent = t.pausaDa ? '▶' : '❚❚';
    }
    function parti() { clearInterval(tick); tick = window.setInterval(aggiorna, 1000); aggiorna(); }
    return { avvia, ferma, pausaRiprendi, aggiorna, parti, attivo: () => !!leggi(), durate };
})();
function minutiStudio(da, a, m) {
    const x = ymd(da), y = ymd(a);
    return Stato.tutti('sessione').filter(s => s.data >= x && s.data <= y && (!m || s.m === m)).reduce((t, s) => t + s.minuti, 0);
}
function durata(min) { return min >= 60 ? Math.floor(min / 60) + ' h ' + (min % 60 ? pad2(min % 60) + ' min' : '') : min + ' min'; }
function widgetTimer() {
    const g = oggi(), oggiMin = minutiStudio(g, g), sett = minutiStudio(lunedi(g), g);
    const st = Studio.vociDelGiorno(g).filter(x => !x.v.speciale);
    return scheda('Timer e tempo di studio', h('div.numeri', null, numero(durata(oggiMin), 'oggi'), numero(durata(sett), 'questa settimana')), h('div.chips', { style: { marginTop: '8px' } }, st.map(x => h('button.chip', { style: { borderLeft: '4px solid ' + coloreChiave(x.v.k) }, onclick: () => Timer.avvia({ m: materiaDi(x.v.k), k: x.v.k, titolo: Studio.etichetta(x.v.k) }) }, '▶ ' + Studio.etichetta(x.v.k))), h('button.chip', { onclick: () => Timer.avvia({ titolo: 'Studio libero' }) }, '▶ Studio libero')), h('div.tenue.piccolo', null, 'Sessioni da ' + Timer.durate().studio + ' min + pausa ' + Timer.durate().pausa + ' (si cambia in Altro → Studio).'));
}
// ---------- Statistiche ----------
function vistaStatistiche() {
    const g = oggi(), schede = tutteLeSchede();
    const codici = Array.from(new Set([...schede.map(x => x.mat.m), ...Stato.tutti('sessione').map(s => s.m || '').filter(Boolean)]));
    const ritardo = Studio.inRitardo();
    const righe = codici.map(m => {
        const mie = schede.filter(x => x.mat.m === m), fatte = mie.filter(x => Studio.fatta(x.s.id));
        const punti = fatte.map(x => Studio.prog(x.s.id).punteggio).filter((v) => v != null);
        return { m, tot: mie.length, P: mie.filter(x => x.s.tipo === 'P').length, Pf: fatte.filter(x => x.s.tipo === 'P').length, fatte: fatte.length,
            media: punti.length ? Math.round(punti.reduce((a, b) => a + b, 0) / punti.length) : null, err: mie.filter(x => daRifare(x.s.id)).length,
            min7: minutiStudio(piuGiorni(g, -6), g, m), rit: ritardo.filter(v => materiaDi(v.k) === m).length };
    });
    // ultimi 14 giorni: minuti per giorno, divisi per materia
    const giorni = Array.from({ length: 14 }, (_, i) => piuGiorni(g, i - 13));
    const ses = Stato.tutti('sessione');
    const perGiorno = giorni.map(d => { const k = ymd(d), o = {}; for (const s of ses)
        if (s.data === k)
            o[s.m || '?'] = (o[s.m || '?'] || 0) + s.minuti; return o; });
    const max = Math.max(30, ...perGiorno.map(o => Object.values(o).reduce((a, b) => a + b, 0)));
    const peggiore = righe.filter(r => r.rit > 0).sort((a, b) => b.rit - a.rit)[0];
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('section.card', null, h('h2.card-titolo', null, 'Tempo di studio'), h('div.numeri', null, numero(durata(minutiStudio(g, g)), 'oggi'), numero(durata(minutiStudio(piuGiorni(g, -6), g)), 'ultimi 7 giorni'), numero(durata(minutiStudio(piuGiorni(g, -29), g)), 'ultimi 30')), h('div.grafico', { role: 'img', 'aria-label': 'Minuti di studio negli ultimi 14 giorni' }, perGiorno.map((o, i) => h('div.colonna', { title: dataBreve(giorni[i]) + ': ' + durata(Object.values(o).reduce((a, b) => a + b, 0)) }, h('div.pila', null, Object.entries(o).map(([m, v]) => h('div', { style: { height: (v / max) * 100 + '%', background: m === '?' ? 'var(--tenue)' : coloreMateria(m) } }))), h('span', null, String(giorni[i].getDate()))))), ses.length ? null : h('div.tenue.piccolo', null, 'Usa il timer (▶) per registrare il tempo di studio.')), sezionePuntiDeboli(), sezioneSottostepDeboli(), sezioneSonno(), peggiore ? h('div.indicatore.ritardo', null, 'Materia più indietro: ' + nomeMateria(peggiore.m) + ' (' + peggiore.rit + ' step in ritardo)') : null, righe.map(r => h('section.card', null, h('h2.card-titolo', { style: { color: coloreMateria(r.m) } }, nomeMateria(r.m)), h('div.numeri', null, numero(r.Pf + '/' + r.P, 'prioritarie'), numero(r.fatte + '/' + r.tot, 'schede fatte'), numero(r.media != null ? r.media + '%' : '—', 'media punteggi')), barra(r.fatte, r.tot, coloreMateria(r.m)), h('div.tenue.piccolo', null, durata(r.min7) + ' negli ultimi 7 giorni · ' + r.err + ' da rifare' + (r.rit ? ' · ' + r.rit + ' step in ritardo' : '')))));
}
// ---------- Esami ----------
function giorniA(data) { return Math.round((daYmd(data).getTime() - oggi().getTime()) / 86400000); }
function testoCountdown(d) { return d === 0 ? 'oggi!' : d === 1 ? 'domani' : d < 0 ? 'passato' : 'tra ' + d + ' giorni'; }
function vistaEsami() {
    const esami = Stato.tutti('esame').sort((a, b) => a.data < b.data ? -1 : 1);
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, sezioneSimulazioni(), esami.length ? h('section.card', null, esami.map(e => {
        const d = giorniA(e.data);
        return h('button.voce-lista' + (d < 0 ? '.passato' : ''), { onclick: () => editorEsame(e) }, h('span.esame-giorni', null, d >= 0 ? String(d) : '✓', h('small', null, d >= 0 ? (d === 1 ? 'giorno' : 'giorni') : '')), h('span.voce-corpo', null, h('span.voce-titolo', null, e.nome), h('span.voce-sotto', null, dataLunga(daYmd(e.data)) + (e.ora ? ' · ' + e.ora : '') + (e.materie && e.materie.length ? ' · ' + e.materie.map(nomeMateria).join(', ') : ''))));
    }))
        : vuoto('Nessun esame. Aggiungi le date degli appelli: compaiono nel calendario e in Oggi con il conto alla rovescia.'), h('button.btn', { onclick: () => editorEsame() }, '+ Aggiungi esame / appello'));
}
function widgetEsami() {
    const prossimi = Stato.tutti('esame').filter(e => giorniA(e.data) >= 0).sort((a, b) => a.data < b.data ? -1 : 1).slice(0, 3);
    if (!prossimi.length)
        return null;
    return scheda('Prossimi esami', prossimi.map(e => {
        const d = giorniA(e.data);
        return h('button.voce-lista', { onclick: () => { UI.studioVista = 'esami'; UI.studioSub = null; vai('studio'); } }, h('span.esame-giorni', null, String(d), h('small', null, d === 1 ? 'giorno' : 'giorni')), h('span.voce-corpo', null, h('span.voce-titolo', null, e.nome), h('span.voce-sotto', null, dataLunga(daYmd(e.data)) + ' · ' + testoCountdown(d))));
    }));
}
function editorEsame(es) {
    const e = es ? JSON.parse(JSON.stringify(es)) : { id: 'esame-' + uid(), type: 'esame', updatedAt: 0, nome: '', data: ymd(piuGiorni(oggi(), 30)) };
    const nome = h('input.titolo-grande', { type: 'text', placeholder: 'Es. Primo appello semestre filtro', value: e.nome });
    const data = h('input', { type: 'date', value: e.data });
    const ora = h('input', { type: 'time', value: e.ora || '' });
    const nota = h('textarea', { rows: 2, placeholder: 'Aula, documenti, note…', value: e.nota || '' });
    const codici = Array.from(new Set(tutteLeSchede().map(x => x.mat.m)));
    const scelte = new Set(e.materie || []);
    const f = foglio({ titolo: es ? 'Esame' : 'Nuovo esame', corpo: h('div.modulo', null, nome, h('div.gruppo', null, riga('Data', data), riga('Ora', ora)), codici.length ? h('div.gruppo', null, h('div.gruppo-titolo', null, 'Materie'), h('div.chips', { style: { margin: '4px 0 10px' } }, codici.map(m => { const b = h('button.chip' + (scelte.has(m) ? '.attivo' : ''), { type: 'button', onclick: () => { scelte.has(m) ? scelte.delete(m) : scelte.add(m); b.classList.toggle('attivo', scelte.has(m)); } }, nomeMateria(m)); return b; }))) : null, h('div.gruppo', null, h('div.gruppo-titolo', null, 'Note'), nota)),
        salva: () => { if (!nome.value.trim() || !data.value) {
            avviso('Nome e data');
            return false;
        } e.nome = nome.value.trim(); e.data = data.value; e.ora = ora.value || undefined; e.nota = nota.value || undefined; e.materie = Array.from(scelte); Stato.salva(e); },
        elimina: es ? () => chiedi('Eliminare l\'esame?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], e.nome).then(s => { if (s) {
            Stato.elimina(e.id);
            f.chiudi();
        } }) : undefined });
    if (!es)
        setTimeout(() => { if (!document.activeElement || document.activeElement === document.body)
            nome.focus(); }, 50);
}
// ---------- Corsi di studio creati dall'utente ----------
// Un corso è un pacchetto (stesso formato v1) con proprio: true, salvato come record 'pacchetto'
// e quindi sincronizzato su Drive come tutto il resto. Argomenti = sotto-step (con data facoltativa:
// compaiono nel calendario e nel ritardo). Schede = qualsiasi cosa da fare, con file Drive collegato.
function pacchettoRec(pk) { return Stato.rec.get('pk-' + pk.id); }
function salvaPacchetto(pk) { pk.aggiornato = ymd(new Date()); const r = pacchettoRec(pk) || { id: 'pk-' + pk.id, type: 'pacchetto', updatedAt: 0 }; r.contenuto = pk; r.deleted = false; Stato.salva(r); }
function nuovoCodice(nome) {
    const usati = new Set([...Object.keys(MATERIE_BASE), ...tutteLeSchede().map(x => x.mat.m), ...Studio.pkStep().flatMap(p => p.materie.map(m => m.m)), ...Stato.tutti('materia').map(m => m.codice)]);
    const base = norm(nome).replace(/[^a-z]/g, '').toUpperCase() || 'M';
    for (let l = 2; l <= base.length; l++)
        if (!usati.has(base.slice(0, l)))
            return base.slice(0, l);
    let i = 2;
    while (usati.has(base.slice(0, 3) + 'X'.repeat(i - 1)))
        i++;
    return base.slice(0, 3) + 'X'.repeat(i - 1);
}
function editorCorso(pk0) {
    const pk = pk0 ? JSON.parse(JSON.stringify(pk0)) : { tipo: 'step', id: 'corso-' + uid().slice(0, 8), step: 1000 + Studio.pkStep().filter(p => p.proprio).length, titolo: '', aggiornato: ymd(new Date()), proprio: true, risorse: { libri: {}, quiz: {} }, materie: [] };
    const titolo = h('input.titolo-grande', { type: 'text', placeholder: 'Es. Anatomia I, Inglese B2, Patente…', value: pk.titolo });
    const descr = h('textarea', { rows: 2, placeholder: 'Descrizione (facoltativa)', value: pk.descrizione || '' });
    const zonaMat = h('div');
    function disegnaMat() {
        svuota(zonaMat);
        pk.materie.forEach((m, i) => zonaMat.appendChild(h('div.cat-riga', null, h('input', { type: 'color', value: coloreMateria(m.m), onchange: (e) => { Stato.salva({ id: 'mat-' + m.m, type: 'materia', updatedAt: 0, codice: m.m, nome: m.nome, colore: e.target.value }); } }), h('input', { type: 'text', value: m.nome, onchange: (e) => { m.nome = e.target.value.trim() || m.nome; } }), h('input', { type: 'text', value: m.libro, placeholder: 'libro/fonte', style: { maxWidth: '110px' }, onchange: (e) => { m.libro = e.target.value.trim(); } }), h('button.btn-ico', { 'aria-label': 'Togli materia', onclick: () => { if (m.sottostep.length) {
                avviso('Prima togli gli argomenti di questa materia.');
                return;
            } pk.materie.splice(i, 1); disegnaMat(); } }, icona('x', 18)))));
    }
    disegnaMat();
    const nuovaMat = h('input', { type: 'text', placeholder: '+ Materia (es. Anatomia) e Invio', onkeydown: (e) => {
            if (e.key !== 'Enter' || !nuovaMat.value.trim())
                return;
            const nome = nuovaMat.value.trim(), codice = nuovoCodice(nome);
            pk.materie.push({ m: codice, nome, libro: '', sottostep: [] });
            Stato.salva({ id: 'mat-' + codice, type: 'materia', updatedAt: 0, codice, nome, colore: PALETTE_MATERIE[(tutteLeSchede().length + pk.materie.length) % PALETTE_MATERIE.length] });
            nuovaMat.value = '';
            disegnaMat();
        } });
    const f = foglio({ titolo: pk0 ? 'Corso' : 'Nuovo corso di studio', corpo: h('div.modulo', null, titolo, h('div.gruppo', null, h('div.gruppo-titolo', null, 'Materie del corso'), zonaMat, nuovaMat, h('div.tenue.piccolo', { style: { padding: '6px 0 10px' } }, 'Ogni materia ha il suo colore. Dopo potrai aggiungere argomenti (con data) e schede/attività con file del Drive.')), h('div.gruppo', null, h('div.gruppo-titolo', null, 'Descrizione'), descr)),
        salva: () => {
            if (!titolo.value.trim()) {
                avviso('Dai un nome al corso');
                return false;
            }
            if (nuovaMat.value.trim()) {
                const nome = nuovaMat.value.trim();
                pk.materie.push({ m: nuovoCodice(nome), nome, libro: '', sottostep: [] });
            }
            if (!pk.materie.length) {
                avviso('Aggiungi almeno una materia');
                return false;
            }
            pk.titolo = titolo.value.trim();
            pk.descrizione = descr.value.trim() || undefined;
            salvaPacchetto(pk);
            UI.studioStep = pk.id;
            UI.studioVista = 'schede';
        },
        elimina: pk0 ? () => chiedi('Eliminare il corso?', [{ testo: 'Elimina il corso', valore: 'si', pericolo: true }], pk.titolo + ': i progressi restano salvati ma il corso sparisce.').then(s => { if (s) {
            Stato.elimina('pk-' + pk.id);
            UI.studioStep = '';
            f.chiudi();
        } }) : undefined });
    if (!pk0)
        setTimeout(() => { if (!document.activeElement || document.activeElement === document.body)
            titolo.focus(); }, 50);
}
function editorSottostep(pk0, mat0, sub0) {
    const pk = JSON.parse(JSON.stringify(pk0));
    const matSel = selettore(pk.materie.map(m => [m.m, m.nome]), mat0 ? mat0.m : pk.materie[0].m);
    if (sub0)
        matSel.disabled = true;
    const titolo = h('input.titolo-grande', { type: 'text', placeholder: 'Argomento (es. Apparato cardiovascolare)', value: sub0 ? sub0.titolo : '' });
    const data = h('input', { type: 'date', value: sub0 && sub0.data || '' });
    const f = foglio({ titolo: sub0 ? 'Argomento' : 'Nuovo argomento', corpo: h('div.modulo', null, titolo, h('div.gruppo', null, riga('Materia', matSel), riga('Giorno nel piano', data), h('div.tenue.piccolo', { style: { paddingBottom: '10px' } }, 'Con una data, l\'argomento compare nel calendario e conta per "in pari / in ritardo".'))),
        salva: () => {
            if (!titolo.value.trim()) {
                avviso('Scrivi l\'argomento');
                return false;
            }
            const mat = pk.materie.find(m => m.m === matSel.value);
            if (sub0) {
                const s = mat.sottostep.find(x => x.k === sub0.k);
                s.titolo = titolo.value.trim();
                s.data = data.value || undefined;
                s.posizione = data.value ? dataLunga(daYmd(data.value)) : '';
            }
            else {
                const n = '1.' + (mat.sottostep.length + 1), k = mat.m + n;
                mat.sottostep.push({ k, n, titolo: titolo.value.trim(), posizione: data.value ? dataLunga(daYmd(data.value)) : '', data: data.value || undefined, microstep: [{ n: n + '.1', schede: [] }] });
                UI.studioSub = k;
            }
            salvaPacchetto(pk);
        },
        elimina: sub0 ? () => chiedi('Eliminare l\'argomento?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], sub0.titolo).then(s => {
            if (!s)
                return;
            const mat = pk.materie.find(m => m.m === mat0.m);
            mat.sottostep = mat.sottostep.filter(x => x.k !== sub0.k);
            salvaPacchetto(pk);
            UI.studioSub = null;
            f.chiudi();
        }) : undefined });
    if (!sub0)
        setTimeout(() => { if (!document.activeElement || document.activeElement === document.body)
            titolo.focus(); }, 50);
}
function editorSchedaPropria(pk0, mat0, sub0, s0) {
    const pk = JSON.parse(JSON.stringify(pk0));
    const sub = pk.materie.find(m => m.m === mat0.m).sottostep.find(x => x.k === sub0.k);
    const mi = sub.microstep[0] || (sub.microstep[0] = { n: sub.n + '.1', schede: [] });
    const titolo = h('input.titolo-grande', { type: 'text', placeholder: 'Es. Quiz cuore 1, Esercizi cap. 3, Flashcard…', value: s0 ? s0.titolo : '' });
    const tipo = selettore([['P', 'Prioritaria (da fare subito)'], ['R', 'Raffinamento (dopo)']], s0 ? s0.tipo : 'P');
    const pagine = h('input', { type: 'text', placeholder: 'es. 12-18, 25', value: s0 ? s0.pagine : '' });
    let file = s0 && s0.file ? { ...s0.file } : undefined;
    const nomeFile = h('span.tenue', null, file ? file.nome : 'nessuno');
    const f = foglio({ titolo: s0 ? 'Scheda' : 'Nuova scheda', corpo: h('div.modulo', null, titolo, h('div.gruppo', null, riga('Tipo', tipo), riga('Pagine', pagine)), h('div.gruppo', null, h('div.gruppo-titolo', null, 'File collegato (quiz HTML, PDF, documento…)'), h('div', { style: { padding: '4px 0' } }, nomeFile), h('div.bottoni', { style: { marginBottom: '10px' } }, h('button.btn.neutro', { type: 'button', onclick: async () => { if (serveGoogle())
                return; const [d] = await scegliFileDrive({ titolo: 'File della scheda' }); if (d) {
                file = { id: d.id, nome: d.name, mime: d.mimeType, url: d.url };
                nomeFile.textContent = d.name;
            } } }, 'Dal Drive'), h('button.btn.neutro', { type: 'button', onclick: () => { file = undefined; nomeFile.textContent = 'nessuno'; } }, 'Togli')))),
        salva: () => {
            if (!titolo.value.trim()) {
                avviso('Scrivi un titolo');
                return false;
            }
            if (s0) {
                const s = mi.schede.find(x => x.id === s0.id);
                Object.assign(s, { titolo: titolo.value.trim(), tipo: tipo.value, pagine: pagine.value.trim(), file });
            }
            else {
                const k = mi.schede.length + 1;
                mi.schede.push({ id: mat0.m + '-' + uid().slice(0, 8), k, n: k, titolo: titolo.value.trim(), tipo: tipo.value, problemi: false, pagine: pagine.value.trim(), quizFile: '', file });
            }
            mi.schede.forEach(x => x.n = mi.schede.length);
            salvaPacchetto(pk);
        },
        elimina: s0 ? () => chiedi('Eliminare la scheda?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], s0.titolo).then(ok => { if (!ok)
            return; mi.schede = mi.schede.filter(x => x.id !== s0.id); mi.schede.forEach((x, i) => { x.k = i + 1; x.n = mi.schede.length; }); salvaPacchetto(pk); f.chiudi(); }) : undefined });
    if (!s0)
        setTimeout(() => { if (!document.activeElement || document.activeElement === document.body)
            titolo.focus(); }, 50);
}

// 07-freddo.ts — Prova a freddo (v0.14, tattica T6 "effetto pretest").
//
// Prima di studiare uno step nuovo (nessuna prioritaria fatta) si fa la PRIMA scheda prioritaria
// senza aver letto niente. Il risultato NON è il punteggio della scheda, non entra nei ripassi né nelle
// statistiche: si salva a parte (record 'pretest', id 'pre-<k>'). Provare a rispondere prima, anche
// sbagliando, migliora quanto si impara dopo. Quando poi la stessa scheda si fa "sul serio", l'avviso
// mostra il confronto (es. "prova a freddo 40% → 85%").
const Freddo = {
    rec(k) { const r = Stato.prendi('pre-' + k); return r && !r.deleted ? r : undefined; },
    /** Lo step si presta alla prova a freddo: ha prioritarie e nessuna è ancora fatta. */
    possibile(k) {
        const t = Studio.trovaSotto(k);
        if (!t)
            return false;
        const P = Studio.schedeDi(t.sub).filter(x => x.tipo === 'P');
        return P.length > 0 && !P.some(x => Studio.fatta(x.id));
    },
    scheda(k) { const t = Studio.trovaSotto(k); return t ? Studio.schedeDi(t.sub).find(x => x.tipo === 'P') || null : null; },
    /** Testo di confronto per l'avviso quando la scheda della prova a freddo viene fatta sul serio. */
    confronto(schedaId, pct) {
        const t = trovaScheda(schedaId);
        const r = t ? Freddo.rec(t.k) : undefined;
        if (!r || r.schedaId !== schedaId)
            return '';
        const d = pct - r.pct;
        return ' · a freddo era ' + r.pct + '% (' + (d >= 0 ? '+' : '') + d + ')';
    },
};
async function avviaProvaAFreddo(k) {
    const t = Studio.trovaSotto(k), s = Freddo.scheda(k);
    if (!t || !s)
        return;
    const micro = (t.sub.microstep.find(m => m.schede.some(x => x.id === s.id)) || { n: '' }).n;
    const ok = await chiedi('Prova a freddo · ' + Studio.etichetta(k), [{ testo: 'Inizia la prova', valore: 'si' }], 'Fai la scheda «' + s.titolo + '» SENZA aver studiato: rispondi d\'istinto, anche a caso. Il risultato non conta e non cambia i tuoi punteggi. Serve a preparare il cervello: dopo, studiando, le risposte giuste si fissano meglio.');
    if (!ok)
        return;
    apriQuiz(t.pk, t.mat.m, micro, s, d => {
        if (d.errori)
            return;
        const r = { id: 'pre-' + k, type: 'pretest', updatedAt: 0, k, schedaId: s.id, data: ymd(new Date()), pct: d.pct, giuste: d.giuste, totale: d.totale };
        Stato.salva(r);
        avviso('🧊 Prova a freddo: ' + d.pct + '%. Non conta: ora studia lo step. Alla fine rifai questa scheda e guarda quanto sei migliorato.', 10000);
    });
}
/** Pulsanti "Prova a freddo" per gli step di oggi non ancora iniziati (riquadro Studio di oggi). */
function bottoniFreddo(voci) {
    const ks = voci.filter(x => !x.v.speciale && x.p.modo !== 'raffinamento' && Freddo.possibile(x.v.k) && !Freddo.rec(x.v.k)).map(x => x.v.k);
    if (!ks.length)
        return null;
    return h('div', null, h('div.tenue.piccolo', { style: { margin: '8px 0 4px' } }, 'Prima di leggere: 5–10 min a freddo sulla prima scheda (non conta, aiuta a ricordare).'), h('div.chips', null, ks.map(k => h('button.chip', { onclick: () => avviaProvaAFreddo(k) }, '🧊 Prova a freddo · ' + Studio.etichetta(k)))));
}
/** Riga nella scheda del sotto-step: pulsante o risultato. */
function rigaFreddo(k) {
    const r = Freddo.rec(k);
    if (r)
        return h('div.tenue.piccolo', null, '🧊 Prova a freddo del ' + r.data.slice(8) + '/' + r.data.slice(5, 7) + ': ' + r.pct + '%' + (r.giuste != null ? ' (' + r.giuste + '/' + r.totale + ')' : ''));
    if (!Freddo.possibile(k))
        return null;
    return h('div.bottoni', null, h('button.btn.neutro', { onclick: () => avviaProvaAFreddo(k) }, '🧊 Prova a freddo (prima di studiare)'));
}

// 07-generatore.ts — Generatore di piani di studio (v0.19, F5).
//
// Ispirazione (ricerca 12/11): i planner per esami (StudySmarter, Exam Study Planner, Notion/Shovel)
// chiedono data dell'esame, argomenti e ore disponibili e producono un calendario che si adatta; la
// letteratura sul ripasso suggerisce tre fasi — basi → applicazione → prestazione (simulazioni a tempo) —
// con argomenti alternati tra materie (interleaving) e un secondo passaggio distanziato sui deboli.
//
// Il piano generato è un pacchetto 'piano' con id 'gen-…': affianca gli altri (non li sostituisce),
// compare in Oggi, nel calendario e nel ritardo, e si ripianifica con lo stesso pulsante.
// Le opzioni restano nel piano (campo 'generato') così «Rigenera» lo ricostruisce con i dati di oggi.
const Generatore = (() => {
    const piu = (k, n) => { const d = daDt(k); d.setDate(d.getDate() + n); return ymd(d); };
    const tra = (a, b) => Math.round((daDt(b).getTime() - daDt(a).getTime()) / 86400000);
    /** Quanto è debole un sotto-step (0 = solido, 1 = da rifare): punteggi, schede da rifare, ricordo. */
    /** Ha dati veri (punteggi o ripassi)? Senza, la debolezza è una stima neutra (0.6). */
    function haDati(k) {
        const t = Studio.trovaSotto(k);
        if (!t)
            return false;
        return Ripassi.ricordo(k) != null || Studio.schedeDi(t.sub).some(s => { const p = Studio.prog(s.id); return !!(p && p.fatta && p.punteggio != null); });
    }
    function debolezza(k) {
        const t = Studio.trovaSotto(k);
        if (!t)
            return .5;
        const sch = Studio.schedeDi(t.sub).filter(s => s.tipo === 'P');
        const pt = sch.map(s => Studio.prog(s.id)).filter(p => p && p.fatta && p.punteggio != null).map(p => p.punteggio);
        let w = pt.length ? 1 - pt.reduce((a, b) => a + b, 0) / pt.length / 100 : .6;
        w += Math.min(.3, sch.filter(s => { const p = Studio.prog(s.id); return p && p.daRifare; }).length * .1);
        const r = Ripassi.ricordo(k);
        if (r != null && r < .8)
            w += (.8 - r) * .5;
        return Math.max(0, Math.min(1, w));
    }
    /** Tutti i sotto-step disponibili, con materia e debolezza. */
    function catalogo() {
        const out = [];
        for (const pk of Studio.pkStep())
            for (const ma of pk.materie)
                for (const s of ma.sottostep)
                    out.push({ k: s.k, t: s.titolo, m: ma.m, w: debolezza(s.k), dati: haDati(s.k) });
        return out;
    }
    const capienza = (o) => Math.max(1, Math.min(4, Math.floor(o.ore * 60 / o.minArg)));
    /** Ordine degli argomenti: alternati tra materie; nel raffinamento (o se chiesto) prima i più deboli. */
    function ordina(o) {
        const cat = new Map(catalogo().map(x => [x.k, x]));
        const lista = o.argomenti.map((k, i) => { const c = cat.get(k); return { k, t: c ? c.t : (o.testi || {})[k] || k, m: c ? c.m : 'TXT', w: c ? c.w : .5, dati: c ? c.dati : false, i }; });
        const gruppi = new Map();
        for (const x of lista) {
            if (!gruppi.has(x.m))
                gruppi.set(x.m, []);
            gruppi.get(x.m).push(x);
        }
        for (const g of gruppi.values())
            g.sort((a, b) => o.deboliPrima ? b.w - a.w || a.i - b.i : a.i - b.i);
        const out = [], code = Array.from(gruppi.values());
        while (code.some(c => c.length))
            for (const c of code)
                if (c.length)
                    out.push(c.shift());
        return out;
    }
    /** Costruisce il piano. Non salva nulla. */
    function genera(o) {
        const cap = capienza(o), avvisi = [];
        const giorni = new Map();
        const metti = (d, v) => { if (!giorni.has(d))
            giorni.set(d, { data: d, voci: [] }); giorni.get(d).voci.push(v); };
        // 1) giorni disponibili prima dell'esame
        const tutti = [];
        for (let d = o.inizio; d < o.esame; d = piu(d, 1))
            if (o.giorniSett.includes(daDt(d).getDay()))
                tutti.push(d);
        let liberi = tutti.slice();
        // 2) coda: vigilia di riposo, ripasso finale
        if (o.riposo && liberi.length && liberi[liberi.length - 1] === piu(o.esame, -1)) {
            metti(liberi.pop(), { k: 'RIPOSO', t: '😌 Riposo pre-esame', d: 'Niente teoria nuova: una passeggiata, formule a colpo d\'occhio, a letto presto.', speciale: true });
        }
        for (let i = o.finale; i > 0 && liberi.length; i--)
            metti(liberi.pop(), { k: 'FINALE-' + i, t: '📚 Ripasso finale ' + (o.finale - i + 1) + '/' + o.finale, d: 'Tabelle, formule ed errori ricorrenti. Ripassi e flashcard di oggi.', speciale: true });
        // 3) simulazioni nella fase "prestazione" (ultimo 40% dei giorni rimasti), ognuna seguita dalla revisione
        const sim = [];
        if (o.simulazioni > 0 && liberi.length > 4) {
            const da = Math.floor(liberi.length * .6), span = liberi.length - da;
            for (let i = 0; i < o.simulazioni; i++) {
                const idx = da + Math.floor((i + 1) * span / (o.simulazioni + 1)) - 1;
                if (idx >= 0 && idx < liberi.length && !sim.includes(liberi[idx]))
                    sim.push(liberi[idx]);
            }
            sim.forEach((d, i) => metti(d, { k: 'SIM-' + (i + 1), t: '⏱ Simulazione ' + (i + 1), d: 'A tempo, come all\'esame. Poi registra il punteggio.', speciale: true }));
            liberi = liberi.filter(d => !sim.includes(d));
        }
        // 4) riserve: un giorno ogni N giorni utili resta vuoto (assorbe i ritardi)
        if (o.riservaOgni > 1) {
            const ris = liberi.filter((_d, i) => (i + 1) % o.riservaOgni === 0);
            ris.forEach((d, i) => metti(d, { k: 'RISERVA-' + (i + 1), t: '🛟 Riserva', d: 'Recupera i ritardi; se sei in pari, ripassi e flashcard.', speciale: true }));
            liberi = liberi.filter(d => !ris.includes(d));
        }
        // 5) posti per gli argomenti: revisione della simulazione il giorno utile dopo (occupa 1 posto)
        const posti = new Map(liberi.map(d => [d, cap]));
        sim.forEach((s, i) => { const d = liberi.find(x => x > s); if (d) {
            metti(d, { k: 'REV-' + (i + 1), t: '🔎 Revisione simulazione ' + (i + 1), d: 'Rifai le domande sbagliate, annota l\'errore.', speciale: true });
            posti.set(d, posti.get(d) - 1);
        } });
        // 6) primo giro (fase «basi»): distribuito in modo uniforme sul primo ~65% dei giorni utili, così
        //    restano giorni per il secondo giro e le simulazioni; se non basta, usa tutti i giorni a pieno carico.
        const ord = ordina(o), fuori = [], quando = new Map();
        const nBasi = Math.max(1, Math.ceil(liberi.length * (o.secondoGiro || o.simulazioni ? .65 : 1)));
        const carico = Math.min(cap, Math.ceil(ord.length / nBasi));
        const limite = new Map(liberi.map(d => [d, Math.min(posti.get(d), carico)]));
        let gi = 0;
        for (const x of ord) {
            while (gi < liberi.length && limite.get(liberi[gi]) <= 0)
                gi++;
            if (gi >= liberi.length) {
                gi = 0;
                for (const d of liberi)
                    limite.set(d, posti.get(d));
                while (gi < liberi.length && limite.get(liberi[gi]) <= 0)
                    gi++;
            }
            if (gi >= liberi.length) {
                fuori.push(x.k);
                continue;
            }
            metti(liberi[gi], { k: x.k, t: x.t, ...(x.m === 'TXT' ? { speciale: true, d: 'Argomento' } : {}) });
            quando.set(x.k, liberi[gi]);
            posti.set(liberi[gi], posti.get(liberi[gi]) - 1);
            limite.set(liberi[gi], limite.get(liberi[gi]) - 1);
        }
        // 7) secondo giro sui deboli, distanziato di almeno 7 giorni (o 3 se manca spazio)
        if (o.secondoGiro) {
            const deboli = ord.filter(x => x.m !== 'TXT' && x.dati && x.w >= .4 && quando.has(x.k)).sort((a, b) => b.w - a.w);
            let saltati = 0;
            for (const x of deboli) {
                const primo = quando.get(x.k);
                const d = liberi.find(g => tra(primo, g) >= 7 && posti.get(g) > 0) || liberi.find(g => tra(primo, g) >= 3 && posti.get(g) > 0);
                if (!d) {
                    saltati++;
                    continue;
                }
                metti(d, { k: 'G2-' + x.k, t: '🔁 Secondo giro · ' + Studio.etichetta(x.k), d: 'Rifai le schede sbagliate di ' + x.t + ' (' + Math.round(x.w * 100) + '% debole).', speciale: true });
                posti.set(d, posti.get(d) - 1);
            }
            if (saltati)
                avvisi.push(saltati + ' secondi giri non entrano: aggiungi ore o giorni.');
        }
        if (fuori.length)
            avvisi.push(fuori.length + ' argomenti non entrano prima dell\'esame: aumenta le ore, riduci le riserve o i minuti per argomento.');
        if (!tutti.length)
            avvisi.push('Nessun giorno disponibile tra inizio ed esame.');
        const lista = Array.from(giorni.values()).sort((a, b) => a.data < b.data ? -1 : 1);
        lista.forEach((g, i) => g.n = i + 1);
        const piano = { formato: 'pacchetto-studio', versione: 1, tipo: 'piano', id: 'gen-' + uid(), modo: o.modo === 'raffinamento' ? 'raffinamento' : undefined, titolo: o.titolo,
            aggiornato: ymd(new Date()), giorniTeoria: lista.filter(g => g.voci.some(v => !v.speciale)).length,
            nota: 'Generato il ' + fmt(new Date(), { day: '2-digit', month: '2-digit' }) + ': ' + ord.length + ' argomenti, ' + carico + ' al giorno (massimo ' + cap + ')' + (o.deboliPrima ? ', prima i più deboli' : '') + '.',
            giorni: lista, generato: o, capienza: cap };
        return { piano, fuori, avvisi };
    }
    function salva(p) { Studio.importa(p); }
    function elimina(id) { Stato.elimina('pk-' + id); }
    return { debolezza, catalogo, capienza, ordina, genera, salva, elimina };
})();
// ---------- Procedura guidata ----------
function apriGeneratore(base, sostituisci) {
    const oggiK = ymd(new Date()), esami = Stato.tutti('esame').filter(e => e.data > oggiK).sort((a, b) => a.data < b.data ? -1 : 1);
    const cat = Generatore.catalogo();
    // Proposta iniziale: con due appelli futuri → raffinamento tra il primo e il secondo, prima i deboli.
    const due = esami.length >= 2;
    const o = {
        titolo: due ? 'Raffinamento verso ' + esami[1].nome : esami.length ? 'Piano per ' + esami[0].nome : 'Nuovo piano',
        esame: due ? esami[1].data : esami.length ? esami[0].data : ymd(new Date(Date.now() + 30 * 864e5)),
        inizio: due ? (() => { const d = daDt(esami[0].data); d.setDate(d.getDate() + 1); return ymd(d); })() : (() => { const d = new Date(); d.setDate(d.getDate() + 1); return ymd(d); })(),
        modo: due ? 'raffinamento' : 'teoria', argomenti: cat.map(x => x.k), deboliPrima: true,
        giorniSett: [0, 1, 2, 3, 4, 5, 6], ore: 6, minArg: due ? 100 : 120, riservaOgni: 7, simulazioni: due ? 3 : 2, finale: 2, riposo: true, secondoGiro: true,
        ...(base || {}),
    };
    const PASSI = ['Esame', 'Argomenti', 'Tempo', 'Struttura', 'Anteprima'];
    let passo = 0, incolla = false, testoIncollato = '';
    const v = visore('✨ Genera un piano');
    const testa = h('div.gen-passi'), corpo = h('div.gen-corpo'), piede = h('div.gen-piede');
    v.corpo.append(testa, corpo, piede);
    const campo = (eti, el, nota) => h('label.gen-campo', null, h('span.gen-eti', null, eti), el, nota ? h('span.tenue.piccolo', null, nota) : null);
    const num = (val, min, max, pas, set) => h('input', { type: 'number', min, max, step: pas, value: String(val), oninput: (e) => { const n = +e.target.value; if (!isNaN(n))
            set(n); } });
    const interr = (val, set) => h('span.interruttore', null, h('input', { type: 'checkbox', checked: val, onchange: (e) => set(e.target.checked) }), h('span'));
    function disegnaPasso() {
        svuota(testa);
        svuota(corpo);
        svuota(piede);
        PASSI.forEach((p, i) => testa.appendChild(h('button.gen-passo' + (i === passo ? '.attivo' : i < passo ? '.fatto' : ''), { onclick: () => { if (i < passo) {
                passo = i;
                disegnaPasso();
            } } }, h('b', null, String(i + 1)), h('span', null, p))));
        if (passo === 0) {
            corpo.append(esami.length ? h('div.chips', null, esami.map(e => h('button.chip' + (o.esame === e.data ? '.attivo' : ''), { onclick: () => { o.esame = e.data; o.titolo = (o.modo === 'raffinamento' ? 'Raffinamento verso ' : 'Piano per ') + e.nome; disegnaPasso(); } }, '🎓 ' + e.nome + ' · ' + giornoBreve(e.data)))) : h('div.tenue.piccolo', null, 'Nessun esame salvato: scegli la data qui (puoi aggiungerli in Studio → Esami).'), campo('Data dell\'esame', h('input', { type: 'date', value: o.esame, onchange: (e) => { o.esame = e.target.value; } })), campo('Inizio del piano', h('input', { type: 'date', value: o.inizio, onchange: (e) => { o.inizio = e.target.value; } })), campo('Tipo', h('div.segmenti', null, [['teoria', 'Prima passata (teoria)'], ['raffinamento', 'Raffinamento']].map(([m, t]) => h('button' + (o.modo === m ? '.attivo' : ''), { onclick: () => { o.modo = m; if (m === 'raffinamento') {
                    o.deboliPrima = true;
                    o.minArg = Math.min(o.minArg, 100);
                } disegnaPasso(); } }, t))), o.modo === 'raffinamento' ? 'Uno step è completo quando hai rifatto le sbagliate e fatto le schede di raffinamento.' : 'Uno step è completo quando hai fatto tutte le prioritarie.'), campo('Nome', h('input', { type: 'text', value: o.titolo, oninput: (e) => { o.titolo = e.target.value; } })));
        }
        if (passo === 1) {
            corpo.append(h('div.segmenti', null, h('button' + (!incolla ? '.attivo' : ''), { onclick: () => { incolla = false; disegnaPasso(); } }, 'Dagli step'), h('button' + (incolla ? '.attivo' : ''), { onclick: () => { incolla = true; disegnaPasso(); } }, 'Incolla un elenco')));
            if (incolla) {
                corpo.append(h('textarea.campo', { rows: 10, placeholder: 'Un argomento per riga (es. dal syllabus del corso)…', oninput: (e) => { testoIncollato = e.target.value; } }, testoIncollato), h('div.tenue.piccolo', null, 'Gli argomenti incollati diventano voci del piano (senza schede collegate). Per legarli alle schede crea un corso in Studio.'));
            }
            else {
                const scelti = new Set(o.argomenti);
                corpo.append(h('div.bottoni', null, h('button.btn.neutro', { onclick: () => { o.argomenti = cat.map(x => x.k); disegnaPasso(); } }, 'Tutti'), h('button.btn.neutro', { onclick: () => { o.argomenti = cat.filter(x => x.dati ? x.w >= .4 : true).map(x => x.k); disegnaPasso(); } }, 'Deboli + mai provati'), h('button.btn.neutro', { onclick: () => { o.argomenti = []; disegnaPasso(); } }, 'Nessuno')), h('label.widget-riga', null, h('span.nome', null, 'Prima i più deboli', h('div.tenue.piccolo', null, 'Dentro ogni materia; le materie si alternano ogni giorno.')), interr(o.deboliPrima, b => o.deboliPrima = b)), h('div.tenue.piccolo', null, o.argomenti.length + ' scelti. La barra è quanto è debole (punteggi, schede da rifare, ricordo stimato); n.d. = ancora nessun punteggio. Il secondo giro va solo ai deboli misurati.'));
                const mats = Array.from(new Set(cat.map(x => x.m)));
                for (const m of mats)
                    corpo.appendChild(h('section.card', null, h('h2.card-titolo', { style: { color: coloreMateria(m) } }, formaMateria(m) + ' ' + nomeMateria(m)), cat.filter(x => x.m === m).map(x => h('label.gen-arg', null, h('input', { type: 'checkbox', checked: scelti.has(x.k), onchange: (e) => { const on = e.target.checked; o.argomenti = on ? o.argomenti.concat(x.k) : o.argomenti.filter(y => y !== x.k); } }), h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, Studio.etichetta(x.k) + ' · ' + x.t), h('span.gen-debole', null, h('i', { style: { width: Math.round(x.w * 100) + '%', background: coloreRicordo(1 - x.w) } }))), x.dati ? h('b.piccolo', { style: { color: coloreRicordo(1 - x.w) } }, Math.round(x.w * 100) + '%') : h('span.tenue.piccolo', { title: 'Nessun punteggio ancora: stima neutra' }, 'n.d.')))));
            }
        }
        if (passo === 2) {
            const nomi = ['D', 'L', 'M', 'M', 'G', 'V', 'S'], ordine = [1, 2, 3, 4, 5, 6, 0];
            const resa = h('div.gen-resa');
            const aggiorna = () => { const c = Generatore.capienza(o); resa.textContent = '= ' + c + (c === 1 ? ' argomento' : ' argomenti') + ' al giorno (' + o.ore + ' h ÷ ' + o.minArg + ' min)'; };
            corpo.append(campo('Giorni in cui studi', h('div.gen-sett', null, ordine.map(d => h('button.gen-giorno' + (o.giorniSett.includes(d) ? '.attivo' : ''), { 'aria-pressed': String(o.giorniSett.includes(d)), onclick: (e) => {
                    o.giorniSett = o.giorniSett.includes(d) ? o.giorniSett.filter(x => x !== d) : o.giorniSett.concat(d);
                    e.currentTarget.classList.toggle('attivo');
                } }, nomi[d])))), campo('Ore di studio al giorno', num(o.ore, 1, 12, .5, n => { o.ore = n; aggiorna(); })), campo('Minuti per argomento', num(o.minArg, 30, 300, 10, n => { o.minArg = n; aggiorna(); }), o.modo === 'raffinamento' ? 'Raffinamento: rifai le sbagliate + schede R. Di solito 80–110 min.' : 'Prima passata: lettura + prioritarie. Di solito 100–150 min.'), resa);
            aggiorna();
        }
        if (passo === 3) {
            corpo.append(campo('Giorno di riserva ogni', h('div.segmenti', null, [0, 5, 6, 7].map(n => h('button' + (o.riservaOgni === n ? '.attivo' : ''), { onclick: () => { o.riservaOgni = n; disegnaPasso(); } }, n ? n + ' giorni' : 'mai'))), 'Un giorno vuoto che assorbe i ritardi: i piani senza margine saltano alla prima influenza.'), campo('Simulazioni a tempo', h('div.segmenti', null, [0, 1, 2, 3, 4].map(n => h('button' + (o.simulazioni === n ? '.attivo' : ''), { onclick: () => { o.simulazioni = n; disegnaPasso(); } }, String(n)))), 'Nell\'ultima parte del piano, ognuna seguita dalla revisione degli errori.'), campo('Giorni di ripasso finale', h('div.segmenti', null, [0, 1, 2, 3, 4].map(n => h('button' + (o.finale === n ? '.attivo' : ''), { onclick: () => { o.finale = n; disegnaPasso(); } }, String(n))))), h('label.widget-riga', null, h('span.nome', null, 'Vigilia di riposo', h('div.tenue.piccolo', null, 'Il sonno prima dell\'esame consolida più di un\'ultima nottata.')), interr(o.riposo, b => o.riposo = b)), h('label.widget-riga', null, h('span.nome', null, 'Secondo giro sui deboli', h('div.tenue.piccolo', null, 'Gli argomenti deboli tornano almeno 7 giorni dopo: ripetizione distanziata.')), interr(o.secondoGiro, b => o.secondoGiro = b)));
        }
        if (passo === 4) {
            if (incolla) {
                const righe = testoIncollato.split('\n').map(s => s.trim()).filter(Boolean);
                o.argomenti = righe.map((_r, i) => 'TXT-' + (i + 1));
                o.testi = Object.fromEntries(righe.map((r, i) => ['TXT-' + (i + 1), r]));
            }
            const r = Generatore.genera(o), p = r.piano;
            const nArg = p.giorni.reduce((a, g) => a + g.voci.filter(x => !x.speciale).length, 0);
            corpo.append(h('section.card', null, h('h2.card-titolo', null, p.titolo), h('div.numeri', null, numero(String(p.giorni.length), 'giorni'), numero(String(nArg), 'argomenti'), numero(String(p.giorni.filter(g => g.voci.some(x => /^SIM/.test(x.k))).length), 'simulazioni')), h('div.tenue.piccolo', null, giornoBreve(o.inizio) + ' → esame ' + giornoBreve(o.esame) + ' · ' + p.nota)), r.avvisi.length ? h('div.gen-avvisi', null, r.avvisi.map(a => h('div', null, '⚠️ ' + a))) : h('span'), h('section.card.gen-anteprima', null, p.giorni.map(g => h('div.gen-giorno-riga', null, h('span.gen-data', null, giornoBreve(g.data)), h('span.gen-voci', null, g.voci.map(x => h('span.gen-voce' + (x.speciale ? '.speciale' : ''), { style: x.speciale ? {} : { '--c': coloreChiave(x.k) } }, x.speciale ? x.t : formaChiave(x.k) + ' ' + Studio.etichetta(x.k))))))));
            corpo._r = r;
        }
        piede.append(passo ? h('button.btn.neutro', { onclick: () => { passo--; disegnaPasso(); } }, '‹ Indietro') : h('span'), passo < PASSI.length - 1
            ? h('button.btn', { onclick: () => { if (passo === 1 && !incolla && !o.argomenti.length) {
                    avviso('Scegli almeno un argomento.');
                    return;
                } if (passo === 0 && !(o.inizio < o.esame)) {
                    avviso('L\'inizio deve essere prima dell\'esame.');
                    return;
                } passo++; disegnaPasso(); } }, 'Avanti ›')
            : h('button.btn', { onclick: () => {
                    const r = corpo._r;
                    if (sostituisci) { // i giorni già passati del vecchio piano restano (storico e ritardi)
                        const vecchio = Studio.pkPiani().find(x => x.id === sostituisci), oggiK2 = ymd(new Date());
                        r.piano.id = sostituisci;
                        if (vecchio) {
                            r.piano.giorni = vecchio.giorni.filter(g => g.data < oggiK2).concat(r.piano.giorni.filter(g => g.data >= oggiK2));
                            r.piano.giorni.forEach((g, i) => g.n = i + 1);
                        }
                    }
                    Generatore.salva(r.piano);
                    v.chiudi();
                    const ini = r.piano.giorni[0] ? r.piano.giorni[0].data : '', fin = r.piano.giorni.length ? r.piano.giorni[r.piano.giorni.length - 1].data : '';
                    const sovr = Studio.pianiAttivi().filter(x => x.id !== r.piano.id && (x.modo || '') === (r.piano.modo || '') && x.giorni.some(g => g.data >= ini && g.data <= fin));
                    if (sovr.length)
                        setTimeout(() => chiedi('Nascondere ' + sovr.map(x => '«' + x.titolo + '»').join(', ') + '?', [{ testo: 'Sì, nascondi', valore: 'si' }], 'Copre gli stessi giorni del nuovo piano: in Oggi vedresti gli argomenti due volte. Non viene cancellato: lo rimostri da Studio → Piano.').then(s => { if (s) {
                            sovr.forEach(x => Studio.nascondiPiano(x.id, true));
                            disegna();
                        } }), 400);
                    UI.studioVista = 'piano';
                    UI.studioPiano = r.piano.id;
                    vai('studio');
                    avviso((sostituisci ? 'Piano rigenerato: ' : 'Piano creato: ') + r.piano.giorni.length + ' giorni. Lo trovi in Studio → Piano, in Oggi e nel calendario.', 6000);
                } }, sostituisci ? '✓ Sostituisci il piano' : '✓ Crea il piano'));
        corpo.scrollTop = 0;
    }
    disegnaPasso();
}
/** Pulsanti nella vista Piano: genera, e per i piani generati rigenera/elimina. */
function bottoniGeneratore(p) {
    const gen = p && /^gen-/.test(p.id) ? p : null;
    const nas = !!p && Studio.nascosto(p.id);
    return h('div', null, nas ? h('div.tenue.piccolo', null, '🙈 Piano nascosto: non compare in Oggi, nel calendario, nei ritardi e nei ripassi.') : null, h('div.bottoni', null, h('button.btn.neutro', { onclick: () => apriGeneratore() }, '✨ Genera un piano'), p && Studio.pkPiani().length > 1 ? h('button.btn.neutro', { onclick: () => { Studio.nascondiPiano(p.id, !nas); disegna(); } }, nas ? '👁 Mostra di nuovo' : '🙈 Nascondi') : null, gen ? h('button.btn.neutro', { onclick: () => apriGeneratore({ ...gen.generato, inizio: gen.generato.inizio < ymd(new Date()) ? ymd(new Date()) : gen.generato.inizio, argomenti: gen.generato.argomenti.filter(k => /^TXT-/.test(k) || !Studio.stepFatto(k, gen)) }, gen.id) }, '↻ Rigenera con i dati di oggi') : null, gen ? h('button.btn.neutro', { onclick: async () => { if (await chiedi('Eliminare «' + gen.titolo + '»?', [{ testo: 'Elimina il piano', valore: 'si', pericolo: true }], 'Le schede fatte e i punteggi restano: sparisce solo il calendario.') === 'si') {
            Generatore.elimina(gen.id);
            UI.studioPiano = '';
            disegna();
        } } }, '🗑 Elimina') : null));
}

// 07-genesercizi.ts — Quiz Studio Q3 (v0.24): esercizi numerici generati a regole, offline.
//
// Ogni modello ha: dati casuali entro intervalli realistici, la formula del risultato e 4+ distrattori
// calcolati con formule che riproducono un errore preciso (unità non convertite, rapporto invertito,
// fattore dimenticato…), ciascuno con il suo «perché è sbagliato». Idee da Moodle «calculated multichoice».
// Le domande generate hanno id fisso per modello ('g-<modello>'): le statistiche (record statq) si
// accumulano per modello e, per i distrattori, per TIPO di errore (chiave dk) — è la base di Q4.
// Per aggiungere un modello: un oggetto in MODELLI (m = C/B/F, micro = microstep dove compare).
const Generatori = (() => {
    const rnd = (a, b, p = 1) => { const n = Math.round((b - a) / p); return +(a + p * Math.floor(Math.random() * (n + 1))).toFixed(6); };
    const scegli = (a) => a[Math.floor(Math.random() * a.length)];
    /** Numero all'italiana con 3 cifre significative; notazione scientifica per valori molto grandi o piccoli. */
    function fN(x, cifre = 3) {
        if (!isFinite(x))
            return '—';
        if (x === 0)
            return '0';
        const a = Math.abs(x);
        if (a >= 1e5 || a < 1e-3) {
            let e = Math.floor(Math.log10(a)), m = +(x / Math.pow(10, e)).toPrecision(cifre);
            if (Math.abs(m) >= 10) {
                m = +(m / 10).toPrecision(cifre);
                e++;
            }
            return String(m).replace('.', ',') + ' × 10^{' + e + '}';
        }
        return String(+x.toPrecision(cifre)).replace('.', ',');
    }
    const G = 9.81, NA = 6.02e23;
    const rad = (g) => g * Math.PI / 180;
    const MODELLI = [
        // ---------------- CHIMICA ----------------
        { id: 'c-moli', m: 'C', micro: ['3.1.5', '3.1.6'], lv: 'Problema', titolo: 'Moli da massa',
            dati: () => { const [f, M] = scegli([['H₂O', 18.0], ['NaCl', 58.5], ['CO₂', 44.0], ['glucosio (C₆H₁₂O₆)', 180], ['NaOH', 40.0], ['CaCO₃', 100]]); return { f, M, m: rnd(5, 250, 5) }; },
            r: v => v.m / v.M, u: 'mol',
            q: v => 'Quante moli ci sono in ' + fN(v.m) + ' g di ' + v.f + ' (M = ' + fN(v.M) + ' g/mol)?',
            d: [['molt', v => v.m * v.M, 'Hai moltiplicato massa e massa molare: n = m / M.'],
                ['inv', v => v.M / v.m, 'Hai invertito il rapporto: è la massa divisa per la massa molare.'],
                ['milli', (v, r) => r * 1000, 'Hai moltiplicato per 1000 come per convertire in millimoli.'],
                ['ordine', (v, r) => r / 10, 'Errore di un ordine di grandezza nei conti.']],
            passi: (v, r) => ['Formula: n = m / M', 'Sostituisco: n = ' + fN(v.m) + ' g ÷ ' + fN(v.M) + ' g/mol', 'Risultato: n = ' + fN(r) + ' mol'] },
        { id: 'c-particelle', m: 'C', micro: ['3.1.5'], lv: 'Problema', titolo: 'Molecole e atomi da moli',
            dati: () => ({ f: scegli(['O₂', 'N₂', 'H₂', 'Cl₂']), n: rnd(0.1, 5, 0.1) }),
            r: v => v.n * NA, u: 'molecole',
            q: v => 'Quante molecole ci sono in ' + fN(v.n) + ' mol di ' + v.f + '?',
            d: [['atomi', (v, r) => 2 * r, 'Hai contato gli atomi: ogni molecola di ' + 'gas biatomico ha 2 atomi, ma la domanda chiede le molecole.'],
                ['div', v => v.n / NA, 'Hai diviso per il numero di Avogadro invece di moltiplicare.'],
                ['esp', (v, r) => r / 10, 'Hai usato 6,02 × 10^{22}: l\'esponente di Avogadro è 23.'],
                ['inv', v => NA / v.n, 'Hai diviso Avogadro per le moli: N = n · N_{A}.']],
            passi: (v, r) => ['Formula: N = n · N_{A}', 'N = ' + fN(v.n) + ' mol × 6,02 × 10^{23} mol^{-1}', 'Risultato: ' + fN(r) + ' molecole'] },
        { id: 'c-stechio', m: 'C', micro: ['3.1.6', '3.1.7'], lv: 'Problema', titolo: 'Rapporti stechiometrici',
            dati: () => { const [eq, A, ca, B, cb] = scegli([['N₂ + 3 H₂ → 2 NH₃', 'H₂', 3, 'NH₃', 2], ['2 H₂ + O₂ → 2 H₂O', 'O₂', 1, 'H₂O', 2], ['CH₄ + 2 O₂ → CO₂ + 2 H₂O', 'O₂', 2, 'CO₂', 1], ['2 KClO₃ → 2 KCl + 3 O₂', 'KClO₃', 2, 'O₂', 3], ['C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O', 'C₃H₈', 1, 'H₂O', 4]]); return { eq, A, ca, B, cb, n: rnd(0.5, 12, 0.5) }; },
            r: v => v.n * v.cb / v.ca, u: 'mol',
            q: v => 'Per la reazione ' + v.eq + ', quante moli di ' + v.B + ' si ottengono da ' + fN(v.n) + ' mol di ' + v.A + ' (l\'altro reagente in eccesso)?',
            d: [['uguale', v => v.n, 'Hai ignorato i coefficienti: il rapporto in moli è quello dei coefficienti.'],
                ['inv', v => v.n * v.ca / v.cb, 'Hai invertito il rapporto dei coefficienti.'],
                ['solo', v => v.n * v.cb, 'Hai moltiplicato per il coefficiente del prodotto senza dividere per quello del reagente.'],
                ['div', v => v.n / v.ca, 'Hai diviso per il coefficiente del reagente senza moltiplicare per quello del prodotto.']],
            passi: (v, r) => ['Rapporto molare: ' + v.cb + ' mol ' + v.B + ' / ' + v.ca + ' mol ' + v.A, 'n(' + v.B + ') = ' + fN(v.n) + ' × ' + v.cb + ' / ' + v.ca, 'Risultato: ' + fN(r) + ' mol'] },
        { id: 'c-molarita', m: 'C', micro: ['2.3.3'], lv: 'Problema', titolo: 'Molarità',
            dati: () => ({ n: rnd(0.05, 2, 0.05), V: scegli([100, 200, 250, 500, 750, 1500, 2000]) }),
            r: v => v.n / (v.V / 1000), u: 'M',
            q: v => 'Si sciolgono ' + fN(v.n) + ' mol di soluto fino a ' + v.V + ' mL di soluzione. Molarità?',
            d: [['ml', v => v.n / v.V, 'Non hai convertito i mL in L.'],
                ['molt', v => v.n * v.V / 1000, 'Hai moltiplicato moli e volume: M = n / V.'],
                ['inv', v => (v.V / 1000) / v.n, 'Hai invertito il rapporto: è moli diviso litri.'],
                ['cento', v => v.n / v.V * 100, 'Conversione sbagliata: 1 L = 1000 mL, non 100.']],
            passi: (v, r) => ['Volume in litri: ' + v.V + ' mL = ' + fN(v.V / 1000) + ' L', 'Formula: M = n / V', 'M = ' + fN(v.n) + ' / ' + fN(v.V / 1000) + ' = ' + fN(r) + ' M'] },
        { id: 'c-molarita-m', m: 'C', micro: ['2.3.3'], lv: 'Problema', titolo: 'Molarità da massa',
            dati: () => { const [f, M] = scegli([['NaCl', 58.5], ['NaOH', 40.0], ['KCl', 74.6], ['glucosio', 180]]); return { f, M, m: rnd(2, 90, 1), V: scegli([0.25, 0.5, 1, 2]) }; },
            r: v => v.m / v.M / v.V, u: 'M',
            q: v => fN(v.m) + ' g di ' + v.f + ' (M = ' + fN(v.M) + ' g/mol) in ' + fN(v.V) + ' L di soluzione. Molarità?',
            d: [['massa', v => v.m / v.V, 'Hai usato la massa al posto delle moli (manca ÷ M).'],
                ['molt', v => v.m / v.M * v.V, 'Hai moltiplicato per il volume invece di dividere.'],
                ['mmolt', v => v.m * v.M / v.V, 'Hai moltiplicato la massa per la massa molare: n = m / M.'],
                ['ml', v => v.m / v.M / (v.V * 1000), 'Hai trasformato i litri in mL al denominatore.']],
            passi: (v, r) => ['Moli: n = ' + fN(v.m) + ' / ' + fN(v.M) + ' = ' + fN(v.m / v.M) + ' mol', 'M = n / V = ' + fN(v.m / v.M) + ' / ' + fN(v.V), 'Risultato: ' + fN(r) + ' M'] },
        { id: 'c-diluizione', m: 'C', micro: ['2.3.4'], lv: 'Problema', titolo: 'Diluizione',
            dati: () => { const V1 = scegli([10, 20, 25, 50, 100]); return { C1: rnd(0.5, 6, 0.5), V1, V2: V1 * scegli([2, 4, 5, 8, 10]) }; },
            r: v => v.C1 * v.V1 / v.V2, u: 'M',
            q: v => fN(v.V1) + ' mL di una soluzione ' + fN(v.C1) + ' M vengono diluiti con acqua fino a un volume finale di ' + fN(v.V2) + ' mL. Concentrazione finale?',
            d: [['inv', v => v.C1 * v.V2 / v.V1, 'Hai invertito i volumi: diluendo la concentrazione deve diminuire.'],
                ['somma', v => v.C1 * v.V1 / (v.V1 + v.V2), 'Hai sommato i volumi: ' + 'il volume finale è già quello indicato.'],
                ['uguale', v => v.C1, 'La concentrazione cambia: le moli restano, il volume aumenta.'],
                ['diff', v => v.C1 * v.V1 / (v.V2 - v.V1), 'Hai usato solo l\'acqua aggiunta come volume finale.']],
            passi: (v, r) => ['Le moli di soluto non cambiano: C₁V₁ = C₂V₂', 'C₂ = ' + fN(v.C1) + ' × ' + fN(v.V1) + ' / ' + fN(v.V2), 'Risultato: ' + fN(r) + ' M'] },
        { id: 'c-crioscopia', m: 'C', micro: ['2.3.5', '2.3.6'], lv: 'Problema', titolo: 'Abbassamento crioscopico',
            dati: () => { const [f, i] = scegli([['glucosio', 1], ['NaCl', 2], ['CaCl₂', 3], ['KNO₃', 2], ['urea', 1]]); return { f, i, mo: rnd(0.1, 2, 0.1) }; },
            r: v => v.i * 1.86 * v.mo, u: '°C',
            q: v => 'Di quanto si abbassa il punto di congelamento dell\'acqua per una soluzione ' + fN(v.mo) + ' m di ' + v.f + ' (K_{cr} = 1,86 °C·kg/mol, dissociazione completa)?',
            d: [['noi', v => 1.86 * v.mo, 'Hai dimenticato il fattore di van \'t Hoff i.'],
                ['keb', v => v.i * 0.512 * v.mo, 'Hai usato la costante ebullioscopica (0,512) invece della crioscopica.'],
                ['nok', v => v.i * v.mo, 'Hai dimenticato la costante crioscopica.'],
                ['divi', v => 1.86 * v.mo / v.i, 'Hai diviso per i invece di moltiplicare.']],
            passi: (v, r) => ['ΔT = i · K_{cr} · m', 'i = ' + v.i + ' (' + v.f + ')', 'ΔT = ' + v.i + ' × 1,86 × ' + fN(v.mo) + ' = ' + fN(r) + ' °C'] },
        { id: 'c-vanthoff', m: 'C', micro: ['2.3.6'], lv: 'Applicativo', titolo: 'Fattore di van \'t Hoff',
            dati: () => { const [f, i, at] = scegli([['NaCl', 2, 2], ['CaCl₂', 3, 3], ['Na₂SO₄', 3, 7], ['K₃PO₄', 4, 8], ['AlCl₃', 4, 4], ['MgSO₄', 2, 6], ['glucosio', 1, 24]]); return { f, i, at }; },
            r: v => v.i, u: '',
            q: v => 'Qual è il fattore di van \'t Hoff ideale di ' + v.f + ' in acqua?',
            d: [['atomi', v => v.at, 'Hai contato gli atomi: contano gli ioni (o le molecole) liberati in soluzione.'],
                ['uno', () => 1, 'i = 1 vale per i soluti che non si dissociano.'],
                ['piu1', v => v.i + 1, 'Hai contato uno ione in più di quelli che si formano.'],
                ['meno1', v => Math.max(1, v.i - 1), 'Hai contato uno ione in meno: conta anche i ioni poliatomici come uno ciascuno.']],
            passi: v => ['Conta le particelle in soluzione per formula unitaria', v.f + ' → ' + v.i + (v.i === 1 ? ' particella (non si dissocia)' : ' ioni'), 'i = ' + v.i] },
        { id: 'c-osmotica', m: 'C', micro: ['2.3.7'], lv: 'Problema', titolo: 'Pressione osmotica',
            dati: () => { const [f, i] = scegli([['glucosio', 1], ['NaCl', 2], ['CaCl₂', 3]]); return { f, i, M: rnd(0.05, 0.5, 0.05), t: scegli([25, 27, 37]) }; },
            r: v => v.i * v.M * 0.0821 * (v.t + 273), u: 'atm',
            q: v => 'Pressione osmotica di una soluzione ' + fN(v.M) + ' M di ' + v.f + ' a ' + v.t + ' °C (R = 0,0821 L·atm/(mol·K))?',
            d: [['celsius', v => v.i * v.M * 0.0821 * v.t, 'Hai usato i gradi Celsius: T va in kelvin.'],
                ['noi', v => v.M * 0.0821 * (v.t + 273), 'Hai dimenticato il fattore di van \'t Hoff.'],
                ['r', v => v.i * v.M * 8.314 * (v.t + 273), 'Hai usato R = 8,314, che dà il risultato in Pa con M in mol/m³, non in atm.'],
                ['div', v => v.i * v.M / (0.0821 * (v.t + 273)), 'Hai diviso per RT invece di moltiplicare.']],
            passi: (v, r) => ['π = i · M · R · T, con T in kelvin', 'T = ' + v.t + ' + 273 = ' + (v.t + 273) + ' K', 'π = ' + v.i + ' × ' + fN(v.M) + ' × 0,0821 × ' + (v.t + 273) + ' = ' + fN(r) + ' atm'] },
        { id: 'c-gibbs', m: 'C', micro: ['3.2.4'], lv: 'Problema', titolo: 'ΔG = ΔH − TΔS',
            dati: () => ({ H: scegli([-1, 1]) * rnd(20, 180, 5), S: scegli([-1, 1]) * rnd(40, 300, 10), t: scegli([0, 25, 100, 227, 527]) }),
            r: v => v.H - (v.t + 273) * v.S / 1000, u: 'kJ/mol',
            q: v => 'ΔH = ' + fN(v.H) + ' kJ/mol, ΔS = ' + fN(v.S) + ' J/(mol·K), t = ' + v.t + ' °C. Quanto vale ΔG?',
            d: [['joule', v => v.H - (v.t + 273) * v.S, 'Non hai convertito ΔS da J in kJ.'],
                ['celsius', v => v.H - v.t * v.S / 1000, 'Hai usato la temperatura in °C: va in kelvin.'],
                ['segno', v => v.H + (v.t + 273) * v.S / 1000, 'Segno sbagliato: ΔG = ΔH − TΔS.'],
                ['soloh', v => -(v.t + 273) * v.S / 1000, 'Hai dimenticato ΔH.']],
            passi: (v, r) => ['T = ' + v.t + ' + 273 = ' + (v.t + 273) + ' K; ΔS = ' + fN(v.S / 1000) + ' kJ/(mol·K)', 'ΔG = ' + fN(v.H) + ' − ' + (v.t + 273) + ' × (' + fN(v.S / 1000) + ')', 'Risultato: ΔG = ' + fN(r) + ' kJ/mol (' + (r < 0 ? 'spontanea' : 'non spontanea') + ')'] },
        { id: 'c-tinversione', m: 'C', micro: ['3.2.4'], lv: 'Problema', titolo: 'Temperatura di inversione',
            dati: () => { const s = scegli([-1, 1]); return { H: s * rnd(20, 180, 5), S: s * rnd(50, 300, 10) }; },
            r: v => v.H * 1000 / v.S, u: 'K',
            q: v => 'ΔH = ' + fN(v.H) + ' kJ/mol e ΔS = ' + fN(v.S) + ' J/(mol·K). A quale temperatura ΔG = 0?',
            d: [['joule', v => v.H / v.S, 'Non hai portato ΔH in J (o ΔS in kJ).'],
                ['inv', v => v.S / (v.H * 1000), 'Hai invertito il rapporto: T = ΔH / ΔS.'],
                ['celsius', (v, r) => r - 273, 'È il valore in °C, ma la domanda chiede kelvin.'],
                ['mille', v => v.H * 1e6 / v.S, 'Hai moltiplicato per 1000 due volte.']],
            passi: (v, r) => ['ΔG = 0 ⇒ T = ΔH / ΔS', 'ΔH = ' + fN(v.H * 1000) + ' J/mol', 'T = ' + fN(v.H * 1000) + ' / ' + fN(v.S) + ' = ' + fN(r) + ' K'] },
        { id: 'c-emivita', m: 'C', micro: ['3.2.7'], lv: 'Problema', titolo: 'Quanto ne resta dopo n emivite',
            dati: () => { const th = scegli([2, 5, 8, 10, 12, 20, 30]); return { m0: scegli([80, 100, 160, 200, 320, 400, 640]), th, n: rnd(1, 5, 1), un: scegli(['min', 'h', 'giorni']) }; },
            r: v => v.m0 / Math.pow(2, v.n), u: 'mg',
            q: v => 'Una sostanza con cinetica del primo ordine ha t½ = ' + v.th + ' ' + v.un + '. Partendo da ' + v.m0 + ' mg, quanti mg restano dopo ' + v.th * v.n + ' ' + v.un + '?',
            d: [['lineare', v => v.n >= 2 ? v.m0 / (2 * v.n) : v.m0 / 4, 'Hai diviso per 2·n: ogni emivita dimezza quello che resta.'],
                ['meno1', v => v.m0 / Math.pow(2, v.n - 1), 'Hai contato un\'emivita in meno.'],
                ['piu1', v => v.m0 / Math.pow(2, v.n + 1), 'Hai contato un\'emivita in più.'],
                ['decaduta', v => v.m0 - v.m0 / Math.pow(2, v.n), 'È la quantità decaduta, non quella rimasta.']],
            passi: (v, r) => ['Numero di emivite: ' + v.th * v.n + ' / ' + v.th + ' = ' + v.n, 'Resta m₀ / 2^{n} = ' + v.m0 + ' / ' + Math.pow(2, v.n), 'Risultato: ' + fN(r) + ' mg'] },
        { id: 'c-thalf', m: 'C', micro: ['3.2.7'], lv: 'Problema', titolo: 't½ dalla costante k',
            dati: () => ({ k: scegli([0.0010, 0.0025, 0.0050, 0.010, 0.020, 0.035, 0.050, 0.070]) }),
            r: v => 0.693 / v.k, u: 's',
            q: v => 'Una reazione del primo ordine ha k = ' + fN(v.k) + ' s^{-1}. Quanto vale il tempo di dimezzamento?',
            d: [['inv', v => v.k / 0.693, 'Hai invertito: t½ = 0,693 / k.'],
                ['molt', v => 0.693 * v.k, 'Hai moltiplicato per k invece di dividere.'],
                ['unok', v => 1 / v.k, 'Quello è 1/k (vita media), manca il fattore ln 2 = 0,693.'],
                ['doppio', v => 2 / v.k, 'Hai usato 2 al posto di ln 2.']],
            passi: (v, r) => ['Primo ordine: t½ = ln 2 / k = 0,693 / k', 't½ = 0,693 / ' + fN(v.k), 'Risultato: ' + fN(r) + ' s'] },
        { id: 'c-eainversa', m: 'C', micro: ['3.2.8', '3.2.9'], lv: 'Problema', titolo: 'Energia di attivazione inversa',
            dati: () => ({ Ea: rnd(40, 200, 5), H: scegli([-1, 1]) * rnd(10, 90, 5) }),
            r: v => v.Ea - v.H, u: 'kJ/mol',
            q: v => 'Reazione con Ea (diretta) = ' + fN(v.Ea) + ' kJ/mol e ΔH = ' + fN(v.H) + ' kJ/mol. Quanto vale l\'energia di attivazione della reazione inversa?',
            d: [['segno', v => v.Ea + v.H, 'Segno sbagliato: Ea(inversa) = Ea(diretta) − ΔH.'],
                ['uguale', v => v.Ea, 'Le due barriere sono uguali solo se ΔH = 0.'],
                ['soloh', v => Math.abs(v.H), 'Quello è solo |ΔH|, non la barriera.'],
                ['somma', v => v.Ea + Math.abs(v.H) * 2, 'Hai contato ΔH due volte.']],
            passi: (v, r) => ['Ea(inversa) = Ea(diretta) − ΔH', '= ' + fN(v.Ea) + ' − (' + fN(v.H) + ')', 'Risultato: ' + fN(r) + ' kJ/mol'] },
        // ---------------- FISICA ----------------
        { id: 'f-mru', m: 'F', micro: ['2.1.1', '2.1.2'], lv: 'Problema', titolo: 'Moto rettilineo uniforme',
            dati: () => ({ v: scegli([18, 36, 54, 72, 90, 108, 126]), t: rnd(2, 30, 1) }),
            r: v => v.v / 3.6 * v.t * 60, u: 'm',
            q: v => 'Un\'auto viaggia a velocità costante di ' + v.v + ' km/h per ' + v.t + ' minuti. Quanti metri percorre?',
            d: [['noconv', v => v.v * v.t, 'Non hai convertito né la velocità né il tempo.'],
                ['per36', v => v.v * 3.6 * v.t * 60, 'Per passare da km/h a m/s si divide per 3,6, non si moltiplica.'],
                ['min', v => v.v / 3.6 * v.t, 'Hai lasciato il tempo in minuti.'],
                ['km', v => v.v * v.t / 60, 'È il risultato in km, non in metri.']],
            passi: (v, r) => ['v = ' + v.v + ' / 3,6 = ' + fN(v.v / 3.6) + ' m/s; t = ' + v.t + ' × 60 = ' + v.t * 60 + ' s', 's = v · t', 's = ' + fN(r) + ' m'] },
        { id: 'f-frenata', m: 'F', micro: ['2.1.3'], lv: 'Problema', titolo: 'Spazio di frenata',
            dati: () => ({ v: scegli([36, 54, 72, 90, 108]), a: scegli([2, 4, 5, 6, 8]) }),
            r: v => Math.pow(v.v / 3.6, 2) / (2 * v.a), u: 'm',
            q: v => 'Un\'auto a ' + v.v + ' km/h frena con decelerazione costante di ' + v.a + ' m/s². In quanti metri si ferma?',
            d: [['kmh', v => v.v * v.v / (2 * v.a), 'Non hai convertito la velocità in m/s.'],
                ['no2', v => Math.pow(v.v / 3.6, 2) / v.a, 'Hai dimenticato il 2: s = v² / (2a).'],
                ['noquad', v => v.v / 3.6 / (2 * v.a), 'La velocità va al quadrato.'],
                ['tempo', v => v.v / 3.6 / v.a, 'Quello è il tempo di frenata (in s), non lo spazio.']],
            passi: (v, r) => ['v₀ = ' + v.v + ' / 3,6 = ' + fN(v.v / 3.6) + ' m/s', 's = v₀² / (2a)', 's = ' + fN(Math.pow(v.v / 3.6, 2)) + ' / ' + 2 * v.a + ' = ' + fN(r) + ' m'] },
        { id: 'f-mcu', m: 'F', micro: ['2.1.4'], lv: 'Problema', titolo: 'Velocità nel moto circolare uniforme',
            dati: () => ({ r: rnd(0.2, 5, 0.1), T: rnd(0.5, 10, 0.5) }),
            r: v => 2 * Math.PI * v.r / v.T, u: 'm/s',
            q: v => 'Un corpo percorre una circonferenza di raggio ' + fN(v.r) + ' m con periodo ' + fN(v.T) + ' s. Velocità tangenziale?',
            d: [['pi', v => Math.PI * v.r / v.T, 'La circonferenza è 2πr, non πr.'],
                ['omega', v => 2 * Math.PI / v.T, 'Quella è la velocità angolare ω (rad/s): manca il raggio.'],
                ['molt', v => 2 * Math.PI * v.r * v.T, 'Hai moltiplicato per il periodo invece di dividere.'],
                ['nopi', v => v.r / v.T, 'Manca il fattore 2π.']],
            passi: (v, r) => ['v = 2πr / T', 'v = 2π × ' + fN(v.r) + ' / ' + fN(v.T), 'v = ' + fN(r) + ' m/s'] },
        { id: 'f-newton', m: 'F', micro: ['2.2.1'], lv: 'Problema', titolo: 'Secondo principio della dinamica',
            dati: () => ({ m: scegli([rnd(2, 80, 1), rnd(500, 1500, 50)]), v: rnd(2, 30, 1), t: rnd(2, 12, 1) }),
            r: v => v.m * v.v / v.t, u: 'N',
            q: v => 'Un corpo di ' + fN(v.m) + ' kg parte da fermo e raggiunge ' + v.v + ' m/s in ' + v.t + ' s con accelerazione costante. Forza risultante?',
            d: [['molt', v => v.m * v.v * v.t, 'a = v / t: hai moltiplicato per il tempo.'],
                ['nodiv', v => v.m * v.v, 'Hai usato la velocità al posto dell\'accelerazione.'],
                ['soloa', v => v.v / v.t, 'Quella è l\'accelerazione (m/s²), manca la massa.'],
                ['peso', v => v.m * G, 'Quello è il peso, non la forza che accelera.']],
            passi: (v, r) => ['a = Δv / Δt = ' + v.v + ' / ' + v.t + ' = ' + fN(v.v / v.t) + ' m/s²', 'F = m · a', 'F = ' + fN(v.m) + ' × ' + fN(v.v / v.t) + ' = ' + fN(r) + ' N'] },
        { id: 'f-hooke', m: 'F', micro: ['2.2.4'], lv: 'Problema', titolo: 'Legge di Hooke',
            dati: () => ({ k: scegli([50, 80, 100, 150, 200, 250, 400, 500]), x: rnd(1, 25, 1) }),
            r: v => v.k * v.x / 100, u: 'N',
            q: v => 'Una molla con k = ' + v.k + ' N/m è allungata di ' + v.x + ' cm. Modulo della forza elastica?',
            d: [['cm', v => v.k * v.x, 'Non hai convertito i centimetri in metri.'],
                ['div', v => v.k / (v.x / 100), 'F = k · x: hai diviso.'],
                ['mm', v => v.k * v.x / 1000, 'Conversione sbagliata: 1 cm = 0,01 m.'],
                ['inv', v => (v.x / 100) / v.k, 'Hai calcolato x / k: è l\'inverso.']],
            passi: (v, r) => ['x = ' + v.x + ' cm = ' + fN(v.x / 100) + ' m', 'F = k · x', 'F = ' + v.k + ' × ' + fN(v.x / 100) + ' = ' + fN(r) + ' N'] },
        { id: 'f-inclinato', m: 'F', micro: ['2.2.6'], lv: 'Problema', titolo: 'Piano inclinato',
            dati: () => ({ m: rnd(2, 50, 1), th: scegli([30, 45, 60]) }),
            r: v => v.m * G * Math.sin(rad(v.th)), u: 'N',
            q: v => 'Un corpo di ' + v.m + ' kg è su un piano inclinato di ' + v.th + '° senza attrito. Componente del peso parallela al piano (g = 9,81 m/s²)?',
            d: [['cos', v => v.m * G * Math.cos(rad(v.th)), 'Con il coseno trovi la componente perpendicolare al piano.'],
                ['peso', v => v.m * G, 'Quello è il peso intero, non la sua componente.'],
                ['tan', v => v.m * G * Math.tan(rad(v.th)), 'La componente si trova con seno o coseno, non con la tangente.'],
                ['nog', v => v.m * Math.sin(rad(v.th)), 'Hai dimenticato g: serve il peso, non la massa.']],
            passi: (v, r) => ['P = m · g = ' + fN(v.m * G) + ' N', 'Componente parallela: P∥ = P · sen θ', 'P∥ = ' + fN(v.m * G) + ' × sen ' + v.th + '° = ' + fN(r) + ' N'] },
        { id: 'f-lavoro', m: 'F', micro: ['2.3.1'], lv: 'Problema', titolo: 'Lavoro di una forza',
            dati: () => ({ F: rnd(10, 400, 10), s: rnd(2, 50, 1), th: scegli([0, 30, 60, 45]) }),
            r: v => v.F * v.s * Math.cos(rad(v.th)), u: 'J',
            q: v => 'Una forza di ' + v.F + ' N sposta un corpo di ' + v.s + ' m formando un angolo di ' + v.th + '° con lo spostamento. Lavoro compiuto?',
            d: [['nocos', v => v.th === 0 ? v.F * v.s * 0.5 : v.F * v.s, 'Il lavoro dipende dall\'angolo: L = F · s · cos θ.'],
                ['sin', v => v.F * v.s * Math.sin(rad(v.th === 0 ? 30 : v.th)), 'Si usa il coseno dell\'angolo tra forza e spostamento, non il seno.'],
                ['div', v => v.F / v.s, 'Il lavoro è un prodotto, non un rapporto.'],
                ['meta', v => v.F * v.s * Math.cos(rad(v.th)) / 2, 'Non c\'è il fattore ½ nel lavoro.']],
            passi: (v, r) => ['L = F · s · cos θ', 'L = ' + v.F + ' × ' + v.s + ' × cos ' + v.th + '°', 'L = ' + fN(r) + ' J'] },
        { id: 'f-potenza', m: 'F', micro: ['2.3.2'], lv: 'Problema', titolo: 'Potenza',
            dati: () => ({ m: rnd(5, 120, 5), h: rnd(2, 30, 1), t: rnd(2, 60, 1) }),
            r: v => v.m * G * v.h / v.t, u: 'W',
            q: v => 'Un motore solleva ' + v.m + ' kg di ' + v.h + ' m in ' + v.t + ' s a velocità costante. Potenza (g = 9,81 m/s²)?',
            d: [['lavoro', v => v.m * G * v.h, 'Quello è il lavoro (J): la potenza è lavoro diviso tempo.'],
                ['nog', v => v.m * v.h / v.t, 'Hai dimenticato g: la forza da vincere è il peso.'],
                ['molt', v => v.m * G * v.h * v.t, 'Hai moltiplicato per il tempo invece di dividere.'],
                ['noh', v => v.m * G / v.t, 'Hai dimenticato l\'altezza.']],
            passi: (v, r) => ['L = m g h = ' + fN(v.m * G * v.h) + ' J', 'P = L / t', 'P = ' + fN(v.m * G * v.h) + ' / ' + v.t + ' = ' + fN(r) + ' W'] },
        { id: 'f-cinetica', m: 'F', micro: ['2.3.3'], lv: 'Problema', titolo: 'Energia cinetica',
            dati: () => ({ m: scegli([0.5, 2, 5, 10, 70, 80, 1000, 1200]), v: scegli([18, 36, 54, 72, 90]) }),
            r: v => 0.5 * v.m * Math.pow(v.v / 3.6, 2), u: 'J',
            q: v => 'Energia cinetica di un corpo di ' + fN(v.m) + ' kg che viaggia a ' + v.v + ' km/h?',
            d: [['kmh', v => 0.5 * v.m * v.v * v.v, 'Non hai convertito km/h in m/s.'],
                ['nomezzo', v => v.m * Math.pow(v.v / 3.6, 2), 'Manca il fattore ½.'],
                ['noquad', v => 0.5 * v.m * v.v / 3.6, 'La velocità va al quadrato.'],
                ['p', v => v.m * v.v / 3.6, 'Quella è la quantità di moto (kg·m/s).']],
            passi: (v, r) => ['v = ' + v.v + ' / 3,6 = ' + fN(v.v / 3.6) + ' m/s', 'E_{c} = ½ m v²', 'E_{c} = 0,5 × ' + fN(v.m) + ' × ' + fN(Math.pow(v.v / 3.6, 2)) + ' = ' + fN(r) + ' J'] },
        { id: 'f-potenziale', m: 'F', micro: ['2.3.5', '2.3.4'], lv: 'Problema', titolo: 'Caduta libera: velocità d\'arrivo',
            dati: () => ({ h: scegli([1.25, 5, 10, 20, 45, 80]) }),
            r: v => Math.sqrt(2 * G * v.h), u: 'm/s',
            q: v => 'Un sasso cade da fermo da ' + fN(v.h) + ' m (attrito trascurabile, g = 9,81 m/s²). Con che velocità arriva a terra?',
            d: [['no2', v => Math.sqrt(G * v.h), 'Da m g h = ½ m v² viene v = √(2gh): manca il 2.'],
                ['noradice', v => 2 * G * v.h, 'Hai dimenticato la radice quadrata.'],
                ['gh', v => G * v.h, 'Quella è g·h, non una velocità.'],
                ['kmh', v => Math.sqrt(2 * G * v.h) * 3.6, 'È il risultato in km/h, non in m/s.']],
            passi: (v, r) => ['Conservazione: m g h = ½ m v²', 'v = √(2 g h) = √(2 × 9,81 × ' + fN(v.h) + ')', 'v = ' + fN(r) + ' m/s'] },
        { id: 'f-qdm', m: 'F', micro: ['2.3.6', '2.3.7'], lv: 'Problema', titolo: 'Urto anelastico',
            dati: () => ({ m1: rnd(1, 10, 1), v1: rnd(2, 12, 1), m2: rnd(1, 10, 1) }),
            r: v => v.m1 * v.v1 / (v.m1 + v.m2), u: 'm/s',
            q: v => 'Un carrello di ' + v.m1 + ' kg a ' + v.v1 + ' m/s urta un carrello fermo di ' + v.m2 + ' kg e i due restano attaccati. Velocità dopo l\'urto?',
            d: [['solo2', v => v.m1 * v.v1 / v.m2, 'Dopo l\'urto si muovono insieme: la massa è m₁ + m₂.'],
                ['uguale', v => v.v1, 'La quantità di moto si conserva, non la velocità.'],
                ['meta', v => v.v1 / 2, 'v/2 vale solo se le masse sono uguali.'],
                ['energia', v => v.v1 * Math.sqrt(v.m1 / (v.m1 + v.m2)), 'Hai conservato l\'energia cinetica: in un urto anelastico non si conserva.']],
            passi: (v, r) => ['Si conserva la quantità di moto: m₁v₁ = (m₁ + m₂) v', 'v = ' + v.m1 + ' × ' + v.v1 + ' / ' + (v.m1 + v.m2), 'v = ' + fN(r) + ' m/s'] },
        { id: 'f-pressione', m: 'F', micro: ['3.1.1'], lv: 'Problema', titolo: 'Pressione = F / S',
            dati: () => ({ F: rnd(10, 600, 10), S: scegli([2, 4, 5, 10, 20, 25, 50]) }),
            r: v => v.F / (v.S * 1e-4), u: 'Pa',
            q: v => 'Una forza di ' + v.F + ' N agisce perpendicolarmente su una superficie di ' + v.S + ' cm². Pressione?',
            d: [['cm2', v => v.F / v.S, 'Non hai convertito i cm² in m² (1 cm² = 10^{-4} m²).'],
                ['cm', v => v.F / (v.S * 1e-2), 'Hai convertito come se fossero cm: per le aree il fattore è 10^{-4}.'],
                ['molt', v => v.F * v.S * 1e-4, 'La pressione è forza diviso superficie.'],
                ['inv', v => v.S * 1e-4 / v.F, 'Hai invertito il rapporto.']],
            passi: (v, r) => ['S = ' + v.S + ' cm² = ' + fN(v.S * 1e-4) + ' m²', 'p = F / S', 'p = ' + v.F + ' / ' + fN(v.S * 1e-4) + ' = ' + fN(r) + ' Pa'] },
        { id: 'f-stevino', m: 'F', micro: ['3.1.3', '3.1.5'], lv: 'Problema', titolo: 'Legge di Stevino',
            dati: () => { const [l, rho] = scegli([['acqua dolce', 1000], ['acqua di mare', 1030]]); return { l, rho, h: rnd(1, 40, 1) }; },
            r: v => v.rho * G * v.h / 1000, u: 'kPa',
            q: v => 'Di quanto supera la pressione atmosferica la pressione a ' + v.h + ' m di profondità in ' + v.l + ' (ρ = ' + v.rho + ' kg/m³, g = 9,81 m/s²)?',
            d: [['pa', v => v.rho * G * v.h, 'È il valore in Pa: la domanda chiede kPa.'],
                ['assoluta', v => v.rho * G * v.h / 1000 + 101.3, 'Hai aggiunto la pressione atmosferica: la domanda chiede solo la parte idrostatica.'],
                ['nog', v => v.rho * v.h / 1000, 'Hai dimenticato g.'],
                ['norho', v => G * v.h, 'Hai dimenticato la densità.']],
            passi: (v, r) => ['Δp = ρ g h', 'Δp = ' + v.rho + ' × 9,81 × ' + v.h + ' = ' + fN(v.rho * G * v.h) + ' Pa', 'In kPa: ' + fN(r) + ' kPa'] },
        { id: 'f-pascal', m: 'F', micro: ['3.1.6'], lv: 'Problema', titolo: 'Torchio idraulico',
            dati: () => { const S1 = scegli([2, 5, 10, 20]); return { F1: rnd(10, 200, 10), S1, S2: S1 * scegli([5, 10, 20, 40, 50]) }; },
            r: v => v.F1 * v.S2 / v.S1, u: 'N',
            q: v => 'In un torchio idraulico si applica ' + v.F1 + ' N sul pistone di ' + v.S1 + ' cm². Che forza si ottiene sul pistone di ' + v.S2 + ' cm²?',
            d: [['inv', v => v.F1 * v.S1 / v.S2, 'Hai invertito le superfici: sul pistone più grande la forza è maggiore.'],
                ['uguale', v => v.F1, 'È la pressione a trasmettersi uguale, non la forza.'],
                ['diff', v => v.F1 * (v.S2 - v.S1) / v.S1, 'Hai usato la differenza delle superfici.'],
                ['molt', v => v.F1 * v.S2, 'Manca la divisione per S₁.']],
            passi: (v, r) => ['Pascal: F₁ / S₁ = F₂ / S₂', 'F₂ = ' + v.F1 + ' × ' + v.S2 + ' / ' + v.S1, 'F₂ = ' + fN(r) + ' N'] },
        { id: 'f-archimede', m: 'F', micro: ['3.1.7'], lv: 'Problema', titolo: 'Spinta di Archimede',
            dati: () => ({ V: scegli([0.5, 1, 2, 2.5, 4, 5, 8, 10, 20]) }),
            r: v => 1000 * G * v.V / 1000, u: 'N',
            q: v => 'Un oggetto di volume ' + fN(v.V) + ' dm³ è completamente immerso in acqua (ρ = 1000 kg/m³, g = 9,81 m/s²). Spinta di Archimede?',
            d: [['dm3', v => 1000 * G * v.V, 'Non hai convertito i dm³ in m³ (1 dm³ = 10^{-3} m³).'],
                ['nog', v => v.V, 'Hai calcolato la massa d\'acqua spostata (kg), non la forza.'],
                ['cm3', v => 1000 * G * v.V / 1e6, 'Conversione sbagliata: 1 dm³ = 10^{-3} m³, non 10^{-6}.'],
                ['meta', v => 1000 * G * v.V / 2000, 'L\'oggetto è tutto immerso: conta tutto il volume.']],
            passi: (v, r) => ['V = ' + fN(v.V) + ' dm³ = ' + fN(v.V / 1000) + ' m³', 'S = ρ · g · V', 'S = 1000 × 9,81 × ' + fN(v.V / 1000) + ' = ' + fN(r) + ' N'] },
        // ---------------- BIOLOGIA ----------------
        { id: 'b-cromosomi', m: 'B', micro: ['2.3.3', '2.3.4', '2.3.5', '2.3.6'], lv: 'Applicativo', titolo: 'Cromosomi e cromatidi',
            dati: () => {
                const [sp, dn] = scegli([['l\'uomo', 46], ['il cane', 78], ['il gatto', 38], ['il moscerino della frutta', 8], ['il mais', 20], ['lo scimpanzé', 48]]);
                const [chi, f, spieg] = scegli([['quanti cromosomi ha ciascun gamete', 1, 'I gameti sono aploidi: n cromosomi.'],
                    ['quanti cromatidi ci sono in una cellula in metafase della mitosi', 4, 'In metafase i 2n cromosomi sono duplicati: 2 cromatidi ciascuno, quindi 4n.'],
                    ['quanti cromosomi ci sono in una cellula in anafase della mitosi', 4, 'In anafase i cromatidi fratelli si separano e diventano cromosomi: 4n.'],
                    ['quanti cromatidi ci sono in una cellula in metafase II', 2, 'Dopo la meiosi I la cellula è aploide con n cromosomi duplicati: 2n cromatidi.'],
                    ['quanti cromosomi ha ciascuna cellula alla fine della meiosi I', 1, 'La meiosi I separa gli omologhi: n cromosomi (ancora con 2 cromatidi).']]);
                return { sp, dn, chi, f, spieg };
            },
            r: v => v.dn / 2 * v.f, u: '',
            q: v => 'Il corredo diploide ' + v.sp.replace(/^l'/, 'dell\'').replace(/^lo /, 'dello ').replace(/^il /, 'del ') + ' è 2n = ' + v.dn + '. ' + v.chi.charAt(0).toUpperCase() + v.chi.slice(1) + '?',
            d: [['n', v => v.dn / 2, 'Questo è n, il corredo aploide.'],
                ['2n', v => v.dn, 'Questo è 2n, il corredo diploide senza duplicazione.'],
                ['4n', v => v.dn * 2, 'Questo è 4n: vale con DNA duplicato in una cellula diploide.'],
                ['n2', v => v.dn / 4, 'Hai dimezzato due volte: la meiosi riduce il corredo una sola volta.']],
            passi: v => ['2n = ' + v.dn + ', quindi n = ' + v.dn / 2, v.spieg, 'Risultato: ' + (v.dn / 2 * v.f)] },
        { id: 'b-glicolisi', m: 'B', micro: ['2.2.2', '2.2.7'], lv: 'Applicativo', titolo: 'Bilancio della glicolisi',
            dati: () => { const [chi, f, sp] = scegli([['Quanti ATP netti', 2, '2 ATP consumati e 4 prodotti: netto +2 per glucosio.'], ['Quante molecole di NADH', 2, '2 NADH per glucosio (gliceraldeide-3-fosfato deidrogenasi).'], ['Quante molecole di piruvato', 2, 'Ogni glucosio (6 C) dà 2 piruvati (3 C).'], ['Quanti ATP lordi (prodotti in totale)', 4, '4 ATP prodotti per fosforilazione a livello del substrato, prima di togliere i 2 consumati.']]); return { n: rnd(2, 12, 1), chi, f, sp }; },
            r: v => v.n * v.f, u: '',
            q: v => v.chi + ' si ottengono dalla glicolisi di ' + v.n + ' molecole di glucosio?',
            d: [['uno', v => v.n, 'Hai contato 1 per glucosio.'],
                ['lordi', v => v.n * (v.f === 4 ? 2 : 4), 'Hai confuso ATP lordi e netti (4 prodotti, 2 consumati).'],
                ['resp', v => v.n * 30, 'Quello è (circa) il bilancio della respirazione completa, non della sola glicolisi.'],
                ['tre', v => v.n * 3, 'Per glucosio il valore non è 3.']],
            passi: (v, r) => ['Per una molecola di glucosio: ' + v.f, v.sp, v.n + ' × ' + v.f + ' = ' + r] },
    ];
    const SINGOLO = (u, x) => u === 'molecole' && x === 1 ? 'molecola' : u;
    const conUnita = (x, u) => fN(x) + (u ? ' ' + SINGOLO(u, x) : '');
    /** Una domanda dal modello; null se non riesce a costruire 4 distrattori distinti. */
    function genera(M, tentativi = 8) {
        for (let t = 0; t < tentativi; t++) {
            const v = M.dati(), r = M.r(v), u = typeof M.u === 'function' ? M.u(v) : M.u;
            if (!isFinite(r))
                continue;
            const giusta = conUnita(r, u), viste = new Set([giusta]), valori = [r];
            // scarta i valori troppo vicini (entro il 3%) a uno già presente: sembrerebbero arrotondamenti
            const vicino = (x) => valori.some(y => Math.abs(x - y) <= 0.03 * Math.max(Math.abs(x), Math.abs(y)));
            const o = [giusta], ew = [], dk = [];
            for (const [k, f, p] of M.d) {
                let x;
                try {
                    x = f(v, r);
                }
                catch (_) {
                    continue;
                }
                if (!isFinite(x) || (r > 0 && x <= 0) || (r < 0 && x === 0))
                    continue;
                if (Number.isInteger(r) && u === '' && !Number.isInteger(x))
                    continue; // conteggi: solo interi
                const s = conUnita(x, u);
                if (viste.has(s) || vicino(x))
                    continue;
                viste.add(s);
                valori.push(x);
                o.push(s);
                ew.push(p);
                dk.push(k);
                if (o.length === 5)
                    break;
            }
            const intero = Number.isInteger(r) && Math.abs(r) < 1000;
            const riserva = intero
                ? [[r + 1, 'p1', 'Hai contato uno in più.'], [r - 1, 'm1', 'Hai contato uno in meno.'], [r + 2, 'p2', 'Conteggio sbagliato.'], [r * 2, 'x2', 'Hai raddoppiato.'], [r - 2, 'm2', 'Conteggio sbagliato.']]
                : [[r * 10, 'x10', ''], [r / 10, 'd10', ''], [r * 2, 'x2', ''], [r / 2, 'd2', ''], [r * 3, 'x3', ''], [r * 100, 'x100', '']];
            for (const [x, k, p] of riserva) {
                if (o.length === 5)
                    break;
                if (!isFinite(x) || (r > 0 && x <= 0))
                    continue;
                const s = conUnita(x, u);
                if (viste.has(s) || vicino(x))
                    continue;
                viste.add(s);
                valori.push(x);
                o.push(s);
                ew.push(p || 'Valore sbagliato di un fattore ' + fN(x / r) + ': ricontrolla unità e passaggi.');
                dk.push(k);
            }
            if (o.length < 5)
                continue;
            return { id: 'g-' + M.id, sk: 'gen-' + M.m + '-' + M.micro[0], t: 'mcq', lv: M.lv, q: M.q(v), o, ew, dk, e: M.passi(v, r), gen: true };
        }
        return null;
    }
    const per = (m, micro) => MODELLI.filter(x => x.m === m && x.micro.includes(micro));
    /** Serie di esercizi per un microstep: ogni modello almeno una volta, fino a n domande. */
    function serie(m, micro, n = 8) {
        const ms = per(m, micro);
        if (!ms.length)
            return [];
        const out = [], scelti = Regole.scegliModelli(ms, n * 2); // Q4: quota ai modelli dove sbagli
        for (let i = 0; out.length < n && i < scelti.length; i++) {
            const d = genera(scelti[i]);
            if (d)
                out.push(d);
        }
        return out.sort(() => Math.random() - 0.5);
    }
    function titoloMicro(pk, m, micro) {
        for (const ss of mat0(pk, m).sottostep)
            for (const mi of ss.microstep)
                if (mi.n === micro && mi.schede[0])
                    return mi.schede[0].titolo;
        return '';
    }
    return { MODELLI, genera, per, serie, fN, titoloMicro };
})();

// 07-memoria.ts — Motore dei ripassi (F2): ripetizione spaziata con FSRS.
//
// Ogni scheda fatta ha un record 'memoria' (id 'mem-<idScheda>') con difficoltà D (1–10), stabilità S
// (giorni) e data del prossimo ripasso. Formule pubbliche di FSRS-5 (open-spaced-repetition), parametri
// predefiniti: probabilità di ricordare dopo t giorni R = (1 + F·t/S)^-0,5; intervallo = giorni in cui R
// scende alla ritenzione desiderata (0,90; 0,95 nei 14 giorni prima di un esame).
//
// Voto ricavato dal punteggio della scheda: <50 → 1 (Di nuovo), 50–69 → 2 (Difficile), 70–89 → 3 (Bene),
// ≥90 → 4 (Facile); senza punteggio → 3. Il voto si registra quando cambia la data della scheda
// (ripasso nuovo) o il punteggio nello stesso giorno (correzione: si riparte dallo stato precedente).
//
// "Ripassi di oggi": SOTTO-STEP con data ≤ oggi, prima le più a rischio (R più bassa), con un tetto di
// minuti al giorno (impostazione ripassoMinuti, predefinito 30) e minuti stimati per scheda (10).
const Ripassi = (() => {
    const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
    const DECAY = -0.5, F = 19 / 81;
    const MIN_SCHEDA = 10;
    const giorni = (a, b) => Math.round((inizioGiorno(daDt(b)).getTime() - inizioGiorno(daDt(a)).getTime()) / 86400000);
    const piu = (k, n) => { const d = daDt(k); d.setDate(d.getDate() + n); return ymd(d); };
    const lim = (x, a, b) => Math.min(b, Math.max(a, x));
    function recuperabilita(t, s) { return Math.pow(1 + F * t / s, DECAY); }
    function intervallo(s, r) { return lim(Math.round(s / F * (Math.pow(r, 1 / DECAY) - 1)), 1, 365); }
    const d0 = (g) => lim(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);
    function voto(punteggio) { return punteggio == null ? 3 : punteggio < 50 ? 1 : punteggio < 70 ? 2 : punteggio < 90 ? 3 : 4; }
    /** Un passo di FSRS: nuovo stato dopo un ripasso con voto g, t giorni dopo il precedente. */
    function passo(st, g, t) {
        if (!st)
            return { d: d0(g), s: W[g - 1] };
        const { d, s } = st;
        let s2;
        if (t <= 0)
            s2 = s * Math.exp(W[17] * (g - 3 + W[18])); // stesso giorno
        else {
            const r = recuperabilita(t, s);
            if (g === 1)
                s2 = Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
            else
                s2 = s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1) + 1);
        }
        const dd = d - W[6] * (g - 3) * (10 - d) / 9;
        return { d: lim(W[7] * d0(4) + (1 - W[7]) * dd, 1, 10), s: lim(s2, 0.1, 36500) };
    }
    /** Ritenzione desiderata per un giorno: più alta nei 14 giorni prima di un esame. */
    function ritenzione(giorno) {
        const base = imp().ritenzione || 0.9;
        const vicino = Stato.tutti('esame').some(e => { const g = giorni(giorno, e.data); return g >= 0 && g <= 14; });
        return vicino ? Math.max(base, 0.95) : base;
    }
    // ---------- Unità di ripasso: il SOTTO-STEP (decisione dell'utente, 11/11) ----------
    // Ripassare ogni scheda costerebbe ~150 ore prima dell'esame; per sotto-step ~20 ore. Quando un
    // sotto-step è in scadenza l'app propone UNA sua scheda (la meno rifatta di recente, poi la più debole).
    // Il sotto-step entra nei ripassi quando tutte le sue PRIORITARIE sono fatte ("apprendimento").
    /** Giorno in cui il sotto-step è stato studiato: data del piano se precedente all'ultima spunta. */
    function dataApprendimento(k) {
        const t = Studio.trovaSotto(k);
        if (!t)
            return null;
        const P = Studio.schedeDi(t.sub).filter(x => x.tipo === 'P');
        const date = P.map(x => (Studio.prog(x.id) || {}).data).filter(Boolean);
        if (!date.length)
            return null;
        const ultima = date.sort()[date.length - 1];
        let piano = null;
        for (const pp of Studio.pianiAttivi()) {
            if (pp.modo === 'raffinamento')
                continue;
            for (const g of pp.giorni)
                for (const v of g.voci)
                    if (v.k === k)
                        piano = Studio.dataVoce(v, g, pp.id);
            if (!piano)
                for (const c of pp.copertura || []) {
                    const mm = /(\d{2})\/(\d{2})/.exec(c.k === k ? c.quando : '');
                    if (mm) {
                        const d = new Date();
                        piano = d.getFullYear() + '-' + mm[2] + '-' + mm[1];
                        break;
                    }
                }
        }
        return piano && piano < ultima ? piano : ultima;
    }
    function votoMedio(k) {
        const t = Studio.trovaSotto(k);
        if (!t)
            return 3;
        const pt = Studio.schedeDi(t.sub).filter(x => x.tipo === 'P').map(x => (Studio.prog(x.id) || {}).punteggio).filter(v => v != null);
        return pt.length ? voto(pt.reduce((a, b) => a + b, 0) / pt.length) : 3;
    }
    function salvaStato(k, base, g, giorno, log, scheda) {
        const t = base && base.ultimo ? giorni(base.ultimo, giorno) : 0;
        const st = passo(base && base.ultimo ? { d: base.d, s: base.s } : null, g, t);
        const prec = (mem(k) || {}).schede;
        const m = {
            id: 'mem-sub-' + k, type: 'memoria', updatedAt: 0, er: 'sub:' + k, d: st.d, s: st.s,
            due: piu(giorno, intervallo(st.s, ritenzione(giorno))), ultimo: giorno,
            n: (base ? base.n : 0) + 1, lapsi: (base ? base.lapsi : 0) + (base && base.ultimo && g === 1 ? 1 : 0),
            log: log.slice(-50), prima: base || undefined,
            schede: scheda ? (prec || []).concat([scheda]).slice(-30) : prec, // schede usate per i ripassi (rotazione)
        };
        Stato.salva(m, true);
    }
    function mem(k) { const m = Stato.prendi('mem-sub-' + k); return m && !m.deleted ? m : undefined; }
    /** Primo ingresso nei ripassi (quando le prioritarie sono tutte fatte) o ricalcolo dell'apprendimento. */
    function apprendi(k) {
        const giorno = dataApprendimento(k);
        if (!giorno)
            return;
        salvaStato(k, null, votoMedio(k), giorno, [[giorno, votoMedio(k)]]);
    }
    /** Chiamata da Studio.segna: una scheda è stata spuntata o ha un nuovo punteggio. */
    function registra(id, p) {
        const t = trovaScheda(id);
        if (!t || !p)
            return;
        const k = t.k, m = mem(k);
        if (!m) {
            if (Studio.stepFatto(k))
                apprendi(k);
            return;
        }
        if (!p.fatta || p.punteggio == null || !p.data)
            return;
        const g = voto(p.punteggio), giorno = p.data;
        if (m.n === 1 && giorno <= (m.ultimo || '')) {
            apprendi(k);
            return;
        } // correzione dell'apprendimento
        if (giorno < (m.ultimo || ''))
            return; // data passata: ignoro
        if (giorno === m.ultimo) { // correzione del ripasso di oggi
            const log = (m.log || []).slice(0, -1);
            const sc = (m.schede || []);
            m.schede = sc.slice(0, -1);
            Stato.salva(m, true);
            salvaStato(k, m.prima || null, g, giorno, log.concat([[giorno, g]]), id);
            return;
        }
        salvaStato(k, { d: m.d, s: m.s, due: m.due, ultimo: m.ultimo, n: m.n, lapsi: m.lapsi }, g, giorno, (m.log || []).concat([[giorno, g]]), id);
    }
    /** Crea le memorie mancanti dei sotto-step completati (prima installazione o dati arrivati dalla sync). */
    function inizializza() {
        let n = 0;
        for (const pk of Studio.pkStep())
            for (const mat of pk.materie)
                for (const sub of mat.sottostep)
                    if (!mem(sub.k) && Studio.stepFatto(sub.k)) {
                        apprendi(sub.k);
                        n++;
                    }
        return n;
    }
    /** Probabilità di ricordare oggi un sotto-step (0–1). */
    function ricordo(k, giorno = ymd(new Date())) {
        const m = mem(k);
        if (!m || !m.ultimo)
            return null;
        return recuperabilita(Math.max(0, giorni(m.ultimo, giorno)), m.s);
    }
    /** Scheda da proporre per il ripasso: una prioritaria non usata negli ultimi ripassi, la più debole (punteggio più basso). */
    function schedaDaProporre(k) {
        const t = Studio.trovaSotto(k);
        if (!t)
            return null;
        const P = Studio.schedeDi(t.sub).filter(x => x.tipo === 'P');
        if (!P.length)
            return null;
        const usate = ((mem(k) || {}).schede || []);
        const recenti = new Set(P.length > 1 ? usate.slice(-(P.length - 1)) : []);
        const cand = P.filter(x => !recenti.has(x.id));
        const punt = (x) => { const p = Studio.prog(x.id); return p && p.punteggio != null ? p.punteggio : 75; };
        return (cand.length ? cand : P).slice().sort((a, b) => punt(a) - punt(b))[0];
    }
    const quanteAlGiorno = () => Math.max(1, Math.floor((imp().ripassoMinuti || 30) / MIN_SCHEDA));
    /** Ripassi di un giorno: { oggi (entro il tetto), coda, fatti, minuti }. */
    function delGiorno(giorno = ymd(new Date())) {
        const tutte = Stato.tutti('memoria').filter(m => m.er.startsWith('sub:'));
        const fatti = tutte.filter(m => m.ultimo === giorno && m.n > 1);
        const scadute = tutte.filter(m => m.due <= giorno && m.ultimo !== giorno && m.ultimo)
            .map(m => ({ m, k: m.er.slice(4), r: recuperabilita(Math.max(0, giorni(m.ultimo, giorno)), m.s) }))
            .sort((a, b) => a.r - b.r);
        const posti = Math.max(0, quanteAlGiorno() - fatti.length);
        return { oggi: scadute.slice(0, posti), coda: scadute.slice(posti), fatti, minuti: Math.min(posti, scadute.length) * MIN_SCHEDA };
    }
    return { W, voto, passo, recuperabilita, intervallo, ritenzione, registra, inizializza, mem, ricordo, delGiorno, quanteAlGiorno, schedaDaProporre, dataApprendimento, MIN_SCHEDA };
})();
/** Trova una scheda dei pacchetti dal suo id (per aprirla dai ripassi). */
let indiceSchede = { v: -1, m: new Map() };
function trovaScheda(id) {
    if (indiceSchede.v !== Stato.ver) { // v0.17: indice ricostruito solo quando i dati cambiano
        const m = new Map();
        for (const pk of Studio.pkStep())
            for (const mat of pk.materie)
                for (const sub of mat.sottostep)
                    for (const mi of sub.microstep)
                        for (const s of mi.schede)
                            if (!m.has(s.id))
                                m.set(s.id, { pk, m: mat.m, micro: mi.n, s, k: sub.k });
        indiceSchede = { v: Stato.ver, m };
    }
    return indiceSchede.m.get(id) || null;
}
/** Colore della probabilità di ricordare (scala unica del piano: corallo → ambra → verde → teal). */
function coloreRicordo(r) { return r < 0.7 ? '#e8590c' : r < 0.85 ? '#f59f00' : r < 0.95 ? '#2f9e44' : '#0b7285'; }
function chipRicordo(k) {
    const r = Ripassi.ricordo(k);
    if (r == null)
        return null;
    return h('span.chip-ricordo', { style: { color: coloreRicordo(r), borderColor: coloreRicordo(r) }, title: 'Probabilità di ricordare questo sotto-step oggi' }, '🧠 ' + Math.round(r * 100) + '%');
}
/** Riquadro "Ripassi di oggi" (schermata Oggi). */
function widgetRipassi() {
    const r = Ripassi.delGiorno();
    if (!r.oggi.length && !r.fatti.length)
        return null;
    const proposta = (k) => { const sc = Ripassi.schedaDaProporre(k); return sc ? trovaScheda(sc.id) : null; };
    const riga = (x) => {
        const t = proposta(x.k), sub = Studio.trovaSotto(x.k);
        if (!t || !sub)
            return null;
        return h('button.voce-lista', { onclick: () => apriScheda(t.pk, t.m, t.micro, t.s, true) }, h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, Studio.etichetta(x.k) + ' · ' + sub.sub.titolo), h('span.voce-sotto', null, 'Rifai: ' + t.micro + ' ' + t.s.titolo + ' (' + t.s.k + '/' + t.s.n + ') · ricordo ', h('b', { style: { color: coloreRicordo(x.r) } }, Math.round(x.r * 100) + '%'))), icona('dx', 18));
    };
    const primo = r.oggi.map(x => proposta(x.k)).find(Boolean);
    return scheda('Ripassi di oggi', h('div.tenue.piccolo', null, r.oggi.length
        ? r.oggi.length + (r.oggi.length === 1 ? ' sotto-step' : ' sotto-step') + ' · circa ' + r.minuti + ' min. Rifai la scheda proposta (va bene anche «rifai solo gli errori») e scrivi il punteggio: l\'app decide quando riproporre il sotto-step.'
        : '✓ Ripassi di oggi fatti (' + r.fatti.length + '). Ottimo: la fatica di ricordare è ciò che fissa la memoria.'), r.oggi.map(riga), r.coda.length ? h('div.tenue.piccolo', null, '+' + r.coda.length + ' in coda per i prossimi giorni (tetto: ' + (imp().ripassoMinuti || 30) + ' min al giorno).') : null, primo ? h('div.bottoni', null, h('button.btn', { onclick: () => apriScheda(primo.pk, primo.m, primo.micro, primo.s, true) }, '▶ Inizia')) : null);
}

// 07-progressi.ts — Punti deboli (v0.12, F6 ridotta). In Studio → Statistiche.
//
// 1) Per tipo di domanda (Sbarramento, Applicativo, Trabocchetto, Problema, Completamento…), per materia,
//    sommando i risultati letti in automatico dai quiz (Progresso.deboli) e dalle simulazioni.
// 2) Sotto-step più deboli: media dei punteggi delle prioritarie e probabilità di ricordarli oggi.
function puntiDeboli() {
    const acc = {};
    let quiz = 0;
    const somma = (g, l) => {
        acc[g] = acc[g] || {};
        for (const [tipo, ok, tot] of l) {
            if (!tipo || !tot)
                continue;
            const r = acc[g][tipo] || (acc[g][tipo] = [0, 0]);
            r[0] += ok;
            r[1] += tot;
        }
    };
    for (const p of Stato.tutti('progresso'))
        if (p.deboli && p.deboli.length) {
            quiz++;
            somma(materiaDi(p.id.slice(5)) || '?', p.deboli);
        }
    for (const s of Stato.tutti('simulazione'))
        if (s.deboli && s.deboli.length) {
            quiz++;
            somma('SIM', s.deboli);
        }
    const gruppi = Object.keys(acc).sort((a, b) => a === 'SIM' ? 1 : b === 'SIM' ? -1 : a.localeCompare(b)).map(g => ({
        chiave: g, nome: g === 'SIM' ? 'Simulazioni' : nomeMateria(g), colore: g === 'SIM' ? 'var(--accento)' : coloreMateria(g),
        righe: Object.entries(acc[g]).map(([tipo, [ok, tot]]) => ({ tipo, ok, tot })).sort((a, b) => a.ok / a.tot - b.ok / b.tot),
    }));
    return { gruppi, quiz };
}
function sezionePuntiDeboli() {
    const { gruppi, quiz } = puntiDeboli();
    const riga = (r, primo, colore) => {
        const pc = Math.round(r.ok * 100 / r.tot);
        return h('div.debole-riga', null, h('span.debole-tipo', null, r.tipo, primo && pc < 85 ? h('span.debole-tag', null, 'più debole') : null), h('span.debole-barra', null, h('span', { style: { width: pc + '%', background: pc < 70 ? coloreRicordo(0.6) : pc < 85 ? coloreRicordo(0.8) : colore } })), h('span.debole-n', null, pc + '%', h('small', null, ' ' + r.ok + '/' + r.tot)));
    };
    return h('section.card', null, h('h2.card-titolo', null, 'Punti deboli per tipo di domanda'), quiz ? h('div.tenue.piccolo', null, 'Da ' + quiz + (quiz === 1 ? ' quiz letto' : ' quiz letti') + ' in automatico. Dove la percentuale è bassa, allenati su quel tipo: rileggi la «Correzione» e la «Spiegazione» delle domande sbagliate.')
        : h('div.tenue.piccolo', null, 'Si riempie da sola man mano che finisci i quiz dentro l\'app (i punteggi scritti a mano non contengono i tipi di domanda).'), gruppi.map(g => h('div.debole-gruppo', null, h('div.gruppo-titolo', { style: { color: g.colore } }, g.nome), g.righe.map((r, i) => riga(r, i === 0, g.colore)))));
}
function sezioneSottostepDeboli() {
    const out = [];
    for (const pk of Studio.pkStep())
        for (const mat of pk.materie)
            for (const sub of mat.sottostep) {
                const pt = Studio.schedeDi(sub).filter(x => x.tipo === 'P').map(x => Studio.prog(x.id)).filter(p => p && p.fatta && p.punteggio != null).map(p => p.punteggio);
                if (pt.length)
                    out.push({ k: sub.k, titolo: sub.titolo, media: Math.round(pt.reduce((a, b) => a + b, 0) / pt.length), n: pt.length, r: Ripassi.ricordo(sub.k) });
            }
    if (!out.length)
        return null;
    out.sort((a, b) => a.media - b.media || (a.r ?? 1) - (b.r ?? 1));
    return h('section.card', null, h('h2.card-titolo', null, 'Sotto-step più deboli'), h('div.tenue.piccolo', null, 'Media dei punteggi delle prioritarie fatte; 🧠 = probabilità di ricordarlo oggi.'), out.slice(0, 5).map(x => h('button.voce-lista', { onclick: () => { const t = Studio.trovaSotto(x.k); if (t) {
            UI.studioStep = t.pk.id;
            UI.studioSub = x.k;
            UI.studioVista = 'schede';
            disegna();
        } } }, h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, Studio.etichetta(x.k) + ' · ' + x.titolo), h('span.voce-sotto', null, 'media ', h('b', { style: { color: coloreRicordo(x.media / 100) } }, x.media + '%'), ' su ' + x.n + (x.n === 1 ? ' scheda' : ' schede') + (x.r != null ? ' · 🧠 ' + Math.round(x.r * 100) + '%' : ''))), icona('dx', 18))));
}

// 07-quizapp.ts — Quiz Studio Q0+Q1 (v0.22): banca domande e quiz nativo.
//
// Banca (Q0): studio/banca/banca-step-N.json, generata dai sorgenti delle schede (quiz/build/banca.js):
// { schede: {sk: info}, immagini: {id: svg}, domande: [DomB] }. Le schede che non sono nella banca
// (Step 1, 2.1: solo HTML su Drive) si estraggono al volo: il quiz HTML gira in un iframe isolato e
// nascosto con `var q=` reso visibile, e manda le domande al genitore. Il risultato resta in
// localStorage ('imc-banca-<sk>') per non riscaricarlo.
// Quiz nativo (Q1): disegnato dall'app, stesse funzioni delle schede (suggerimento, spiegazione dalle
// fonti, correzione passo-passo, perché le altre sono sbagliate, ✨ AI, rifai gli errori) più le
// statistiche per domanda: record 'statq' (id 'sq-<id domanda>') con tentativi, giuste e distrattori
// scelti — è la base di Q4 (regole che imparano dall'esperienza).
// Il risultato finale passa da Cattura.salva come per le schede HTML (progresso, ripassi, errori).
const Banca = (() => {
    const file = new Map();
    function carica(step) {
        if (!file.has(step))
            file.set(step, fetch('studio/banca/banca-step-' + step + '.json').then(r => r.ok ? r.json() : null).catch(() => null));
        return file.get(step);
    }
    const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++)
        h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
    const norm = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
    /** Estrae le domande da un quiz HTML (qualsiasi versione del motore) in un iframe isolato. */
    function estraiDaHtml(html, sk) {
        return new Promise((ok, ko) => {
            if (!/var q\s*=\s*\{\s*questions/.test(html)) {
                ko(new Error('Formato del quiz non riconosciuto.'));
                return;
            }
            const spia = '<script>setTimeout(function(){try{var q=window.__q,I=window.__img||{};parent.postMessage({imc:"banca-estratta",q:JSON.parse(JSON.stringify(q)),img:JSON.parse(JSON.stringify(I))},"*")}catch(e){parent.postMessage({imc:"banca-estratta",errore:String(e)},"*")}},50)<\/script>';
            const src = html.replace(/var q\s*=\s*\{\s*questions/, 'var q=window.__q={questions').replace(/var IMG\s*=/, 'var IMG=window.__img=')
                .replace(/<\/body>(?![\s\S]*<\/body>)/i, spia + '</body>');
            const fr = h('iframe', { sandbox: 'allow-scripts', srcdoc: /<\/body>/i.test(html) ? src : src + spia, style: { display: 'none' } });
            const t = setTimeout(() => { fine(); ko(new Error('Estrazione non riuscita (tempo scaduto).')); }, 8000);
            const ascolta = (e) => {
                if (e.source !== fr.contentWindow || !e.data || e.data.imc !== 'banca-estratta')
                    return;
                fine();
                if (e.data.errore || !e.data.q || !e.data.q.questions) {
                    ko(new Error('Estrazione non riuscita.'));
                    return;
                }
                const imm = {};
                const visti = new Set();
                const domande = e.data.q.questions.map((q, i) => {
                    let id = 'q-' + hash(sk + '|' + norm(q.q));
                    if (visti.has(id))
                        id += '-' + i;
                    visti.add(id);
                    const x = q.x || {};
                    const d = { id, sk, t: q.t, lv: q.lv, q: q.q, e: q.e };
                    if (q.t === 'mcq') {
                        const c = q.c || 0;
                        d.o = [q.o[c]].concat(q.o.filter((_, k) => k !== c));
                        if (q.ew)
                            d.ew = q.ew;
                    }
                    else {
                        d.a = q.a;
                        d.show = q.show;
                        if (q.ew)
                            d.ew = q.ew;
                    }
                    if (q.r)
                        d.r = q.r;
                    if (x.cit)
                        d.cit = x.cit;
                    if (x.cl)
                        d.cl = x.cl;
                    if (q.img && e.data.img)
                        d.img = q.img.map((g) => { const svg = e.data.img[g.s]; if (!svg)
                            return null; const k = 'i-' + hash(svg); imm[k] = svg; return { i: k, cap: g.cap, f: g.f }; }).filter(Boolean);
                    return d;
                });
                ok({ domande, immagini: imm });
            };
            const fine = () => { clearTimeout(t); window.removeEventListener('message', ascolta); fr.remove(); };
            window.addEventListener('message', ascolta);
            document.body.appendChild(fr);
        });
    }
    /** Q2: applica le modifiche dell'utente (record 'modq'): campi cambiati, domande nascoste, domande nuove. */
    function applica(domande, sk) {
        const mod = new Map();
        for (const r of Stato.tutti('modq'))
            if (r.sk === sk && !r.deleted)
                mod.set(r.qid, r);
        const out = domande.map(d => { const r = mod.get(d.id); return r ? (r.nascosta ? null : { ...d, ...r.campi, id: d.id, sk, mod: true }) : d; }).filter(Boolean);
        for (const r of mod.values())
            if (r.nuova && !r.nascosta && r.campi)
                out.push({ ...r.campi, id: r.qid, sk, mod: true, nuova: true });
        return out;
    }
    /** Domande nascoste di una scheda (per poterle ripristinare). */
    function nascoste(sk) { return Stato.tutti('modq').filter(r => r.sk === sk && r.nascosta && !r.deleted); }
    /** Domande di una scheda: dalla banca pubblicata, dalla copia locale o estraendole dal quiz su Drive. */
    async function scheda(pk, m, micro, s) {
        const B = await carica(parseInt(micro, 10));
        if (B && B.schede[s.id])
            return { domande: applica(B.domande.filter(d => d.sk === s.id), s.id), immagini: B.immagini, fonte: 'banca' };
        const K = 'imc-banca-' + s.id;
        try {
            const c = localStorage.getItem(K);
            if (c) {
                const j = JSON.parse(c);
                return { domande: applica(j.domande, s.id), immagini: j.immagini || {}, fonte: 'copia' };
            }
        }
        catch (_) { /* niente */ }
        if (!Drive.pronto)
            throw new Error('Questa scheda non è ancora nella banca: accedi a Google per estrarla dal quiz.');
        const html = await Drive.scaricaTesto(await Studio.idQuiz(pk, m, micro, s));
        const r = await estraiDaHtml(html, s.id);
        try {
            localStorage.setItem(K, JSON.stringify(r));
        }
        catch (_) { /* spazio esaurito: la riestraggo la prossima volta */ }
        return { domande: applica(r.domande, s.id), immagini: r.immagini, fonte: 'estratta' };
    }
    return { carica, scheda, estraiDaHtml, applica, nascoste };
})();
const QuizApp = (() => {
    const L = ['A', 'B', 'C', 'D', 'E'], LIVELLI = ['Sbarramento', 'Applicativo', 'Trabocchetto', 'Problema', 'Completamento'];
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmt = (s) => esc(s).replace(/_\{([^}]*)\}/g, '<sub>$1</sub>').replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>');
    const fmtQ = (s) => fmt(s).replace(/(…+|\.\.\.\.+)/g, '<span class="qz-buco">________</span>');
    const normR = (s) => { let t = String(s).toLowerCase(); if (t.normalize)
        t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); return t.replace(/\s+/g, ' ').trim().replace(/[.;:!]+$/, '').replace(/,/g, '.'); };
    function giusta(v, a) {
        const x = normR(v);
        if (!x)
            return false;
        return a.some(r => { const y = normR(r); if (x === y)
            return true; if (/^-?\d+(\.\d+)?$/.test(y)) {
            const m = x.match(/^(-?\d+(?:\.\d+)?)\s*[a-z%/]*$/);
            return !!m && Number(m[1]) === Number(y);
        } return false; });
    }
    const mescola = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    } return a; };
    function registraStat(v) {
        const id = 'sq-' + v.d.id, p = Stato.prendi(id);
        const r = p && !p.deleted ? p : { id, type: 'statq', updatedAt: 0, sk: v.d.sk, n: 0, ok: 0, ultima: '', esito: false };
        r.n++;
        if (v.ok)
            r.ok++;
        r.ultima = ymd(new Date());
        r.esito = !!v.ok;
        if (!v.ok && v.d.t === 'mcq' && typeof v.picked === 'number') {
            const oi = v.ord[v.picked], o = v.d.dk ? v.d.dk[oi - 1] : v.d.o[oi];
            r.scelte = Object.assign({}, r.scelte);
            r.scelte[o] = (r.scelte[o] || 0) + 1;
        }
        Stato.salva(r, true);
    }
    /** gen: Q3, esercizi generati (nessun salvataggio sulla scheda, «Rifai tutto» = numeri nuovi). */
    async function apri(pk, m, micro, s, gen) {
        const v = visore((gen ? '🎲 ' : '🧩 ') + micro + (gen ? ' · esercizi nuovi' : ' · scheda ' + s.k + '/' + s.n), () => apriScheda(pk, m, micro, s));
        v.corpo.classList.add('qz');
        v.corpo.appendChild(h('div.vuoto.centro', null, 'Preparo le domande…'));
        let dati;
        try {
            dati = gen ? { domande: gen(), immagini: {}, fonte: 'gen' } : await Banca.scheda(pk, m, micro, s);
        }
        catch (e) {
            svuota(v.corpo);
            v.corpo.appendChild(h('div.vuoto.centro', null, String(e.message || e)));
            return;
        }
        if (!dati.domande.length) {
            svuota(v.corpo);
            v.corpo.appendChild(h('div.vuoto.centro', null, 'Nessuna domanda trovata.'));
            return;
        }
        const app = h('div.qz-app');
        svuota(v.corpo);
        v.corpo.appendChild(h('div.qz-testa', null, h('div.qz-occhiello', null, (mat0(pk, m).nome || m) + ' · ' + micro + (gen ? ' · esercizi generati' : ' · scheda ' + s.k + ' di ' + s.n)), h('h1.qz-h1', null, gen ? 'Esercizi nuovi: ' + (Generatori.titoloMicro(pk, m, micro) || s.titolo) : s.titolo)));
        v.corpo.appendChild(app);
        let P = [], cur = 0, ripasso = false, apertaX = false, finito = false;
        const nuovo = (idx, rip) => {
            P = idx.map(i => { const d = dati.domande[i]; return { d, ord: d.t === 'mcq' ? mescola(d.o.map((_, k) => k)) : [], picked: null, ok: null, hid: [] }; });
            cur = 0;
            ripasso = rip;
            apertaX = false;
            finito = false;
            disegnaQ();
            v.corpo.scrollTop = 0;
        };
        const fatta = (x) => x.picked !== null;
        const punti = () => P.filter(x => x.ok).length;
        const corretta = (x) => x.ord.indexOf(0);
        const passi = (e) => '<ol class="qz-passi">' + (Array.isArray(e) ? e : [e]).map(t => { const m2 = String(t).match(/^([^:]{2,80}):\s([\s\S]*)$/); return '<li>' + (m2 ? '<b>' + fmt(m2[1]) + ':</b> ' + fmt(m2[2]) : fmt(t)) + '</li>'; }).join('') + '</ol>';
        const spiegFonti = (d) => '<div class="qz-box"><span class="qz-etich">Spiegazione dalle fonti</span>'
            + (d.cit || []).map(c => '<blockquote>«' + esc(c.t) + '»<span class="qz-chi">' + esc(c.f) + (c.l ? ' · <a href="' + esc(c.l) + '" target="_blank" rel="noopener">apri la pagina</a>' : '') + '</span></blockquote>').join('')
            + (d.cl ? '<div class="qz-mia"><b>Spiegazione di Claude</b> ' + esc(d.cl) + '</div>' : '') + (!d.cit && !d.cl ? '<p>' + fmt(Array.isArray(d.e) ? d.e.join(' ') : d.e) + '</p>' : '') + '</div>';
        function correzione(x) {
            const d = x.d, ew = d.ew || [], mc = d.t === 'mcq';
            let s2 = (x.avv ? '<div class="qz-avviso">' + fmt(x.avv) + '</div>' : '') + '<div class="qz-box" id="qz-why"><span class="qz-etich">Correzione passo-passo</span><p class="qz-verdetto ' + (x.ok ? 'ok' : 'ko') + '">'
                + (x.ok ? 'Corretto.' : mc ? 'Non corretto: la risposta giusta è ' + L[corretta(x)] + '.' : 'Non corretto: la risposta attesa è «' + fmt(d.show) + '».') + '</p>' + passi(d.e);
            if (!x.ok && mc && typeof x.picked === 'number' && ew[x.ord[x.picked] - 1])
                s2 += '<div class="qz-perche"><b>Perché la tua risposta è sbagliata</b><p>Hai scelto «' + fmt(d.o[x.ord[x.picked]]) + '»: ' + fmt(ew[x.ord[x.picked] - 1]) + '</p></div>';
            else if (!x.ok && !mc && ew[0])
                s2 += '<div class="qz-perche"><b>Perché la tua risposta è sbagliata</b><p>' + (x.picked ? 'Hai scritto «' + esc(x.picked) + '». ' : '') + fmt(ew[0]) + '</p></div>';
            if (mc && ew.length && (x.ok || x.picked === null))
                s2 += '<details class="qz-altre"><summary>Perché le altre opzioni sono sbagliate</summary>' + ew.map((t, k) => '<p><b>«' + fmt(d.o[k + 1]) + '»</b> — ' + fmt(t) + '</p>').join('') + '</details>';
            return s2 + '</div>';
        }
        function riquadroAI(x) {
            const a = x.ai, b = (l, n) => '<button type="button" class="chip' + (a && a.l === l ? ' on' : '') + '" data-ai="' + l + '">' + n + '</button>';
            let o = '';
            if (a)
                o = a.attesa ? '<p class="tenue">Genero la spiegazione…</p>' : a.errore ? '<p class="tenue">⚠️ ' + esc(a.errore) + '</p>'
                    : '<div class="qz-ai-testo">' + esc(a.testo) + '</div><div class="qz-ai-piede"><span>' + esc(a.modello || '') + '</span><button type="button" class="chip" data-ai="' + a.l + '" data-forza="1">↻ Rigenera</button></div>';
            return '<div class="qz-box qz-ai"><span class="qz-etich">✨ Spiegazione AI</span><div class="chips">' + b('breve', 'Breve') + b('media', 'Media') + b('dettagliata', 'Dettagliata') + '</div>' + o + '</div>';
        }
        function disegnaQ() {
            if (finito) {
                risultato();
                return;
            }
            const x = P[cur], d = x.d, a = fatta(x), mc = d.t === 'mcq';
            let s2 = '<div class="qz-metro" style="--n:' + P.length + '">' + P.map((y, k) => '<span class="' + (y.ok === null ? (k === cur ? 'ora' : '') : y.ok ? 'ok' : 'ko') + '"></span>').join('') + '</div>'
                + '<div class="qz-stat"><span>Domanda <b>' + (cur + 1) + '</b> di ' + P.length + (ripasso ? ' · ripasso errori' : '') + '</span><span>Punteggio <b>' + punti() + '</b></span></div>'
                + '<section class="qz-carta"><div class="qz-qtesta"><span class="qz-liv lv-' + esc(d.lv) + '">' + esc(d.lv) + '</span><span>' + (mc ? 'Risposta multipla' : 'A completamento') + '</span></div>';
            for (const g of d.img || [])
                if (dati.immagini[g.i])
                    s2 += '<figure class="qz-fig"><button type="button" class="qz-zoom-b" data-zoom="' + esc(g.i) + '" aria-label="Ingrandisci immagine">' + dati.immagini[g.i] + '</button><figcaption>' + esc(g.cap) + (g.f ? ' · ' + esc(g.f) : '') + '</figcaption></figure>';
            s2 += '<p class="qz-domanda">' + (mc ? fmt(d.q) : fmtQ(d.q)) + '</p><div class="chips">';
            if (mc) {
                const rest = 2 - x.hid.length;
                s2 += '<button type="button" class="chip" data-az="aiuto"' + (a || rest <= 0 ? ' disabled' : '') + '>💡 Suggerimento (' + rest + ')</button>';
            }
            s2 += '<button type="button" class="chip' + (apertaX ? ' on' : '') + '" data-az="fonti">📖 Spiegazione</button>' + (d.gen ? '' : '<button type="button" class="chip" data-az="modifica">✏️ Modifica</button>') + (d.mod ? '<span class="qz-mod">modificata</span>' : '') + '</div>';
            if (apertaX)
                s2 += spiegFonti(d);
            if (mc) {
                s2 += '<div class="qz-opz">' + x.ord.map((oi, k) => {
                    let c = 'qz-opz-b', tag = '';
                    const off = x.hid.includes(k);
                    if (a) {
                        if (oi === 0) {
                            c += ' ok';
                            tag = '<span class="qz-tag">Risposta corretta</span>';
                        }
                        else if (k === x.picked) {
                            c += ' ko';
                            tag = '<span class="qz-tag">La tua risposta</span>';
                        }
                        else
                            c += ' spento';
                    }
                    if (off && !(a && oi === 0))
                        c += ' escluso';
                    return '<button type="button" class="' + c + '" data-k="' + k + '"' + (a || off ? ' disabled' : '') + '><span class="qz-lett">' + L[k] + '</span><span>' + fmt(d.o[oi]) + tag + '</span></button>';
                }).join('') + '</div>';
            }
            else
                s2 += '<form class="qz-fill" autocomplete="off"><input id="qz-ans" type="text" enterkeyhint="done" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="La tua risposta"' + (a ? ' disabled class="' + (x.ok ? 'ok' : 'ko') + '" value="' + esc(x.picked) + '"' : '') + '>' + (a ? '' : '<button type="submit" class="btn">Verifica</button><p class="tenue piccolo">Maiuscole e accenti non contano.</p>') + '</form>';
            if (a)
                s2 += correzione(x) + riquadroAI(x);
            const ultima = cur === P.length - 1;
            s2 += '<div class="qz-nav"><button type="button" class="btn neutro" data-az="prec"' + (cur === 0 ? ' disabled' : '') + '>◀ Indietro</button><button type="button" class="btn' + (a ? '' : ' neutro') + '" data-az="avanti">' + (ultima ? 'Vedi il risultato' : a ? 'Avanti ▶' : 'Salta ▶') + '</button></div></section>';
            app.innerHTML = s2;
            if (!a && !mc) {
                const i = app.querySelector('#qz-ans');
                if (i && matchMedia('(hover:hover)').matches)
                    i.focus({ preventScroll: true });
            }
        }
        function rispondi(val) {
            const x = P[cur];
            if (fatta(x))
                return;
            if (typeof val === 'number') {
                x.picked = val;
                x.ok = x.ord[val] === 0;
            }
            else {
                if (!normR(val)) {
                    avviso('Scrivi una risposta.');
                    return;
                }
                x.picked = val.trim();
                x.ok = giusta(val, x.d.a || []);
            }
            registraStat(x);
            if (!x.ok) {
                const dk = x.d.dk && typeof x.picked === 'number' && x.ord[x.picked] > 0 ? x.d.dk[x.ord[x.picked] - 1] : null;
                x.avv = Regole.avvisoRisposta(x.d, dk);
            }
            disegnaQ();
            const w = app.querySelector('#qz-why');
            if (w)
                w.scrollIntoView({ block: 'nearest' });
        }
        async function chiediAI(l, forza) {
            const x = P[cur], d = x.d, mc = d.t === 'mcq';
            const dd = { q: d.q, opts: mc ? x.ord.map(i => d.o[i]) : [], corretta: mc ? d.o[0] : (d.show || (d.a || [''])[0]),
                scelta: x.ok ? '' : mc ? (typeof x.picked === 'number' ? d.o[x.ord[x.picked]] : '') : String(x.picked || ''),
                cit: (d.cit || []).map(c => c.t).join('\n'), passi: (Array.isArray(d.e) ? d.e : [d.e]).join(' '), titolo: (mat0(pk, m).nome || m) + ' — ' + s.titolo };
            const id = Spiega.idDi(dd, l), c = Stato.prendi(id);
            if (c && !c.deleted && !forza) {
                x.ai = { l, testo: c.testo, modello: c.modello + ' · salvata' };
                disegnaQ();
                return;
            }
            x.ai = { l, attesa: true };
            disegnaQ();
            try {
                const g = await Spiega.genera(dd, l);
                Stato.salva({ id, type: 'spiegazione', updatedAt: 0, q: dd.q, giusta: dd.corretta, livello: l, testo: g.testo, modello: g.modello, quiz: dd.titolo }, true);
                x.ai = { l, testo: g.testo, modello: g.modello };
            }
            catch (e) {
                x.ai = { l, errore: String(e.message || e) };
            }
            if (P[cur] === x)
                disegnaQ();
        }
        function risultato() {
            const tot = P.length, ok = punti(), pct = Math.round(ok * 100 / tot);
            const liv = LIVELLI.map(lv => { const q2 = P.filter(x => x.d.lv === lv); return [lv, q2.filter(x => x.ok).length, q2.length]; }).filter(z => z[2]);
            let deb = null;
            for (const z of liv) {
                const err = z[2] - z[1];
                if (err && (!deb || err / z[2] > (deb[2] - deb[1]) / deb[2]))
                    deb = z;
            }
            const sb = P.filter(x => !x.ok);
            let s2 = '<section class="qz-carta"><div class="qz-punti">' + ok + '<small> / ' + tot + '</small></div><div class="tenue">' + pct + '% di risposte corrette</div>'
                + '<div class="qz-livelli">' + liv.map(z => '<div class="qz-lvriga"><span>' + z[0] + '</span><span class="qz-barra"><span style="width:' + Math.round(z[1] * 100 / z[2]) + '%"></span></span><span>' + z[1] + '/' + z[2] + '</span></div>').join('') + '</div>'
                + (deb ? '<p><b>Punto debole:</b> ' + deb[0] + '</p>' : '<p><b>Nessun punto debole.</b></p>');
            if (sb.length)
                s2 += '<h3>Da rivedere (' + sb.length + ')</h3>' + sb.map(x => '<details class="qz-altre"><summary>' + fmt(x.d.q) + '</summary><p><b>Risposta corretta:</b> ' + fmt(x.d.t === 'mcq' ? x.d.o[0] : x.d.show) + '</p>' + passi(x.d.e) + (x.d.r ? '<p class="tenue piccolo">Ripassa: ' + esc(x.d.r) + '</p>' : '') + '</details>').join('');
            s2 += '<div class="qz-nav">' + (sb.length ? '<button type="button" class="btn" data-az="errori">Rifai solo gli errori</button>' : '') + '<button type="button" class="btn neutro" data-az="tutto">' + (gen ? '🎲 Numeri nuovi' : 'Rifai tutto') + '</button></div>'
                + (gen ? '' : '<div class="chips"><button type="button" class="chip" data-az="nuova">➕ Aggiungi una domanda</button>' + (Banca.nascoste(s.id).length ? '<button type="button" class="chip" data-az="ripristina">↩︎ Ripristina le domande nascoste (' + Banca.nascoste(s.id).length + ')</button>' : '') + '</div>') + '</section>';
            app.innerHTML = s2;
            v.corpo.scrollTop = 0;
            const r = { imc: 'quiz-risultato', pct, giuste: ok, totale: tot, livelli: liv, debole: deb ? deb[0] : null, errori: ripasso,
                sbagliate: sb.map(x => [x.d.q, x.d.t === 'mcq' ? x.d.o[0] : String(x.d.show || ''), (Array.isArray(x.d.e) ? x.d.e.join(' ') : x.d.e)]) };
            if (!gen)
                Cattura.salva(s.id, r);
        }
        app.addEventListener('click', ev => {
            const b = ev.target.closest('button');
            if (!b || b.disabled)
                return;
            if (b.dataset.zoom) {
                const z = h('div.qz-zoom', { onclick: () => z.remove() });
                z.innerHTML = '<div class="qz-zoom-box">' + (dati.immagini[b.dataset.zoom] || '') + '</div><div class="qz-zoom-x">Tocca per chiudere</div>';
                v.corpo.appendChild(z);
                return;
            }
            if (b.dataset.k != null) {
                rispondi(parseInt(b.dataset.k, 10));
                return;
            }
            if (b.dataset.ai) {
                chiediAI(b.dataset.ai, !!b.dataset.forza);
                return;
            }
            const az = b.dataset.az, x = P[cur];
            if (az === 'aiuto') {
                const lib = x.ord.map((oi, k) => oi !== 0 && !x.hid.includes(k) ? k : -1).filter(k => k >= 0);
                if (lib.length)
                    x.hid.push(lib[Math.floor(Math.random() * lib.length)]);
                disegnaQ();
            }
            else if (az === 'fonti') {
                apertaX = !apertaX;
                disegnaQ();
            }
            else if (az === 'prec') {
                if (cur > 0) {
                    cur--;
                    apertaX = false;
                    disegnaQ();
                    v.corpo.scrollTop = 0;
                }
            }
            else if (az === 'avanti') {
                if (cur < P.length - 1) {
                    cur++;
                    apertaX = false;
                    disegnaQ();
                    v.corpo.scrollTop = 0;
                }
                else {
                    const senza = P.filter(y => !fatta(y)).length;
                    if (senza)
                        chiedi('Vedere il risultato?', [{ testo: 'Vedi il risultato', valore: 'si' }, { testo: 'Torna al quiz', valore: 'no' }], senza + (senza === 1 ? ' domanda senza risposta: conta come errata.' : ' domande senza risposta: contano come errate.')).then(si => { if (si === 'si') {
                            finito = true;
                            disegnaQ();
                        } });
                    else {
                        finito = true;
                        disegnaQ();
                    }
                }
            }
            else if (az === 'errori')
                nuovo(P.map((y, k) => y.ok ? -1 : dati.domande.indexOf(y.d)).filter(k => k >= 0), true);
            else if (az === 'tutto') {
                if (gen)
                    dati.domande = gen();
                nuovo(dati.domande.map((_, k) => k), false);
            }
            else if (az === 'modifica')
                Editor.apri(x.d, s.id, nd => {
                    const k = dati.domande.indexOf(x.d);
                    if (!nd) {
                        if (k >= 0)
                            dati.domande.splice(k, 1);
                        P.splice(cur, 1);
                        if (!P.length) {
                            finito = true;
                        }
                        else if (cur >= P.length)
                            cur = P.length - 1;
                        disegnaQ();
                        return;
                    }
                    if (k >= 0)
                        dati.domande[k] = nd;
                    const fattaPrima = fatta(x);
                    x.d = nd;
                    if (nd.t === 'mcq') {
                        if (x.ord.length !== nd.o.length)
                            x.ord = mescola(nd.o.map((_, j) => j));
                        x.hid = [];
                    }
                    if (!fattaPrima) {
                        x.picked = null;
                        x.ok = null;
                    }
                    disegnaQ();
                });
            else if (az === 'nuova')
                Editor.apri(null, s.id, nd => { if (nd) {
                    dati.domande.push(nd);
                    avviso('Domanda aggiunta: comparirà quando rifai il quiz.');
                } });
            else if (az === 'ripristina')
                Editor.ripristina(s.id, () => avviso('Ripristinate: rifai il quiz per vederle.'));
        });
        app.addEventListener('submit', ev => { ev.preventDefault(); const i = app.querySelector('#qz-ans'); if (i)
            rispondi(i.value); });
        const tasti = (e) => {
            if (!document.body.contains(app)) {
                document.removeEventListener('keydown', tasti);
                return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey || e.target.tagName === 'INPUT' || finito)
                return;
            const x = P[cur];
            if (!x)
                return;
            if (x.d.t === 'mcq' && !fatta(x)) {
                let k = 'abcde'.indexOf(e.key.toLowerCase());
                if (k < 0 && /^[1-5]$/.test(e.key))
                    k = +e.key - 1;
                if (k >= 0 && !x.hid.includes(k)) {
                    rispondi(k);
                    return;
                }
            }
            if (e.key === 'ArrowRight' || (e.key === 'Enter' && fatta(x)))
                app.querySelector('[data-az=avanti]').click();
            else if (e.key === 'ArrowLeft')
                app.querySelector('[data-az=prec]').click();
        };
        document.addEventListener('keydown', tasti);
        nuovo(gen ? dati.domande.map((_, k) => k) : Regole.ordina(dati.domande), false);
    }
    /** Statistiche per domanda (per Q4 e per la vista Errori). */
    function stat(sk) { return Stato.tutti('statq').filter(r => !sk || r.sk === sk); }
    return { apri, stat };
})();
/** Q2: editor di una domanda (modifica, nascondi, ripristina l'originale, nuova). */
const Editor = (() => {
    const LIV = ['Sbarramento', 'Applicativo', 'Trabocchetto', 'Problema', 'Completamento'];
    const area = (v, righe = 2, ph = '') => h('textarea', { rows: righe, value: v, placeholder: ph });
    const pulisci = (d) => { const c = { ...d }; delete c.id; delete c.sk; delete c.mod; delete c.nuova; return c; };
    function apri(d0, sk, fatto) {
        const nuova = !d0;
        const d = d0 ? JSON.parse(JSON.stringify(d0)) : { id: 'q-u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), sk, t: 'mcq', lv: 'Applicativo', q: '', o: ['', '', '', '', ''], ew: ['', '', '', ''], e: '' };
        const recId = 'mq-' + d.id, r0 = Stato.prendi(recId);
        const tipo = h('select', null, [['mcq', 'Risposta multipla'], ['fill', 'Completamento']].map(([v, n]) => h('option', { value: v, selected: d.t === v }, n)));
        tipo.disabled = !nuova;
        const liv = h('select', null, LIV.map(l => h('option', { value: l, selected: d.lv === l }, l)));
        const testo = area(d.q, 3, 'Testo della domanda (per il completamento usa …… dove va la risposta)');
        const o = (d.o || ['', '', '', '', '']).concat(['', '', '', '', '']).slice(0, 5);
        const ew = (d.ew || []).concat(['', '', '', '']).slice(0, 4);
        const opz = o.map((v, k) => h('input', { type: 'text', value: v, placeholder: k ? 'Distrattore ' + k : 'Risposta corretta' }));
        const perche = ew.map((v, k) => area(v, 2, 'Perché il distrattore ' + (k + 1) + ' è sbagliato'));
        const acc = h('input', { type: 'text', value: (d.a || []).join(' | '), placeholder: 'Risposte accettate, separate da |' });
        const mostra = h('input', { type: 'text', value: d.show || '', placeholder: 'Risposta da mostrare' });
        const ewFill = area(d.t === 'fill' ? (d.ew || [''])[0] : '', 2, 'Errore più probabile e perché');
        const passi = area((Array.isArray(d.e) ? d.e : [d.e]).join('\n'), 4, 'Correzione: un passaggio per riga (es. «Formula: …»)');
        const nota = h('div.tenue.piccolo');
        const blocco = h('div');
        const controlla = () => {
            if (tipo.value !== 'mcq') {
                nota.textContent = '';
                return;
            }
            const g = opz[0].value.trim().length, max = Math.max(...opz.slice(1).map(x => x.value.trim().length));
            const doppie = new Set(opz.map(x => x.value.trim().toLowerCase())).size < 5;
            nota.textContent = doppie ? '⚠️ Due opzioni sono uguali.' : g > max ? '⚠️ La risposta corretta è più lunga di tutti i distrattori: si riconosce a colpo d\'occhio.' : '';
        };
        opz.forEach(x => x.addEventListener('input', controlla));
        const disegnaTipo = () => {
            svuota(blocco);
            if (tipo.value === 'mcq')
                blocco.appendChild(h('div.gruppo', null, h('div.gruppo-titolo', null, 'Opzioni (la prima è la corretta)'), opz.map((x, k) => h(k ? 'div.ed-opz' : 'div.ed-opz.ed-giusta', null, x, k ? perche[k - 1] : null)), nota));
            else
                blocco.appendChild(h('div.gruppo', null, h('div.gruppo-titolo', null, 'Risposta'), acc, mostra, ewFill));
            controlla();
        };
        tipo.onchange = disegnaTipo;
        disegnaTipo();
        const leggi = () => {
            const n = { ...d, t: tipo.value, lv: liv.value, q: testo.value.trim() };
            const righe = passi.value.split('\n').map(x => x.trim()).filter(Boolean);
            n.e = righe.length > 1 ? righe : (righe[0] || '');
            if (!n.q) {
                avviso('Scrivi il testo della domanda.');
                return null;
            }
            if (n.t === 'mcq') {
                n.o = opz.map(x => x.value.trim());
                n.ew = perche.map(x => x.value.trim());
                delete n.a;
                delete n.show;
                if (n.o.some(x => !x)) {
                    avviso('Servono la risposta corretta e 4 distrattori.');
                    return null;
                }
                if (new Set(n.o.map(x => x.toLowerCase())).size < 5) {
                    avviso('Due opzioni sono uguali.');
                    return null;
                }
            }
            else {
                n.a = acc.value.split('|').map(x => x.trim()).filter(Boolean);
                n.show = mostra.value.trim() || n.a[0];
                n.ew = ewFill.value.trim() ? [ewFill.value.trim()] : [];
                delete n.o;
                if (!n.a.length) {
                    avviso('Scrivi almeno una risposta accettata.');
                    return null;
                }
                if (!/…|\.\.\.\./.test(n.q)) {
                    avviso('Nel completamento metti …… dove va la risposta.');
                    return null;
                }
            }
            return n;
        };
        const salvaRec = (r) => {
            const base = r0 && !r0.deleted ? r0 : { id: recId, type: 'modq', updatedAt: 0, qid: d.id, sk };
            if (!base.originale && d0 && !d0.nuova)
                base.originale = pulisci(d0);
            Stato.salva(Object.assign(base, r), true);
        };
        const f = foglio({
            titolo: nuova ? 'Nuova domanda' : 'Modifica domanda',
            corpo: h('div.modulo', null, h('div.gruppo', null, riga('Tipo', tipo), riga('Livello', liv)), h('div.gruppo', null, h('div.gruppo-titolo', null, 'Domanda'), testo), blocco, h('div.gruppo', null, h('div.gruppo-titolo', null, 'Correzione passo-passo'), passi), h('div.tenue.piccolo', null, 'Le modifiche si salvano con i tuoi dati su Drive; l\'originale resta e puoi ripristinarlo. Statistiche e spiegazioni AI della domanda restano collegate.'), nuova ? null : h('div.bottoni', null, d0 && d0.mod && !d0.nuova ? h('button.btn.neutro', { onclick: () => { const orig = r0 && r0.originale; if (r0)
                    Stato.elimina(recId); f.chiudi(); fatto({ ...(orig || {}), id: d.id, sk }); avviso('Ripristinato l\'originale.'); } }, '↩︎ Ripristina originale') : null, h('button.btn.pericolo', { onclick: async () => {
                    const x = await chiedi('Nascondere questa domanda?', [{ testo: 'Nascondi', valore: 'si', pericolo: true }, { testo: 'Annulla', valore: 'no' }], 'Non comparirà più nel quiz. Puoi ripristinarla dalla schermata del risultato.');
                    if (x !== 'si')
                        return;
                    salvaRec({ nascosta: true });
                    f.chiudi();
                    fatto(null);
                    avviso('Domanda nascosta.');
                } }, d0 && d0.nuova ? 'Elimina domanda' : 'Nascondi domanda'))),
            etichettaSalva: 'Salva',
            salva: () => {
                const n = leggi();
                if (!n)
                    return false;
                if (nuova || (d0 && d0.nuova))
                    salvaRec({ nuova: true, campi: pulisci(n), nascosta: false });
                else
                    salvaRec({ campi: pulisci(n), nascosta: false });
                fatto({ ...n, mod: true, nuova: nuova || !!(d0 && d0.nuova) });
                avviso(nuova ? 'Domanda creata.' : 'Modifica salvata.');
            },
        });
    }
    /** Rende di nuovo visibili le domande nascoste di una scheda. */
    function ripristina(sk, fatto) {
        for (const r of Banca.nascoste(sk)) {
            if (r.campi || r.nuova)
                Stato.salva(Object.assign(r, { nascosta: false }), true);
            else
                Stato.elimina(r.id);
        }
        fatto();
    }
    return { apri, ripristina };
})();

// ============================================================
// 07-rapido.ts — Aggiunta rapida in linguaggio naturale (italiano).
// Esempi: "domani 15-17 Chimica 3.1", "ogni lunedì 9 palestra",
// "ven 18:30 cena da Marco", "12/11 tutto il giorno gita",
// "ricorda lunedì alle 10 chiamare il medico" (→ promemoria),
// "dalle 9 alle 10:30 ripasso fisica", "ogni giorno 7:30 corsa fino al 30/11".
// ============================================================
const GIORNI_IT = { lun: 0, lunedi: 0, mar: 1, martedi: 1, mer: 2, mercoledi: 2, gio: 3, giovedi: 3, ven: 4, venerdi: 4, sab: 5, sabato: 5, dom: 6, domenica: 6 };
const MESI_IT = { gen: 0, gennaio: 0, feb: 1, febbraio: 1, mar: 2, marzo: 2, apr: 3, aprile: 3, mag: 4, maggio: 4, giu: 5, giugno: 5, lug: 6, luglio: 6, ago: 7, agosto: 7, set: 8, settembre: 8, ott: 9, ottobre: 9, nov: 10, novembre: 10, dic: 11, dicembre: 11 };
/** Interpreta una frase. Restituisce null se non c'è un titolo. */
function interpreta(frase, rif = new Date()) {
    let s = ' ' + frase.trim().replace(/\s+/g, ' ') + ' ';
    const n = norm(s); // senza accenti, minuscolo, stesse posizioni
    const togli = (re) => {
        let m;
        const out = [];
        const r = new RegExp(re.source, 'gi');
        let t = norm(s);
        while ((m = r.exec(t))) {
            out.push(m);
            s = s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length);
            t = norm(s);
            r.lastIndex = m.index + m[0].length;
        }
        return out;
    };
    void n;
    const base = inizioGiorno(rif);
    let giorno = base, dataEsplicita = false, tipo = 'evento', tutto = false;
    let rr;
    if (togli(/(^|\s)(ricorda(mi)?|promemoria|todo|da fare)(\s*:)?(?=\s)/).length)
        tipo = 'task';
    if (togli(/\s(tutto il giorno|tutta la giornata)(?=\s)/).length)
        tutto = true;
    // ricorrenze: "ogni giorno", "ogni settimana", "ogni mese", "ogni lunedì e giovedì", "ogni 2 settimane"
    const og = togli(/\sogni\s+(\d+\s+)?(giorno|giorni|settimana|settimane|mese|mesi|anno|anni|((lun|mar|mer|gio|ven|sab|dom)[a-z]*)((\s*,\s*|\s+e\s+)(lun|mar|mer|gio|ven|sab|dom)[a-z]*)*)(?=\s)/);
    if (og.length) {
        const m = og[0], interv = m[1] ? parseInt(m[1], 10) : 1, w = m[2];
        if (/^giorn/.test(w))
            rr = { freq: 'D', interval: interv };
        else if (/^settiman/.test(w))
            rr = { freq: 'W', interval: interv };
        else if (/^mes/.test(w))
            rr = { freq: 'M', interval: interv };
        else if (/^ann/.test(w))
            rr = { freq: 'Y', interval: interv };
        else {
            const giorni = Array.from(new Set((w.match(/(lun|mar|mer|gio|ven|sab|dom)[a-z]*/g) || []).map(x => GIORNI_IT[x.slice(0, 3)]))).sort();
            rr = { freq: 'W', interval: interv, byday: giorni };
            const oggiI = (base.getDay() + 6) % 7, primo = giorni.map(g => (g - oggiI + 7) % 7).sort((a, b) => a - b)[0];
            giorno = piuGiorni(base, primo);
            dataEsplicita = true;
        }
    }
    const fino = togli(/\s(fino al?|fino a)\s+(\d{1,2})[\/.-](\d{1,2})([\/.-](\d{2,4}))?(?=\s)/);
    if (rr && fino.length) {
        const f = fino[0];
        let y = f[5] ? +f[5] : base.getFullYear();
        if (y < 100)
            y += 2000;
        rr.until = ymd(new Date(y, +f[3] - 1, +f[2]));
    }
    const volte = togli(/\sper\s+(\d+)\s+volte(?=\s)/);
    if (rr && volte.length)
        rr.count = +volte[0][1];
    // giorno
    if (togli(/\sdopodomani(?=\s)/).length) {
        giorno = piuGiorni(base, 2);
        dataEsplicita = true;
    }
    else if (togli(/\sdomani(?=\s)/).length) {
        giorno = piuGiorni(base, 1);
        dataEsplicita = true;
    }
    else if (togli(/\s(oggi|stasera|stamattina)(?=\s)/).length) {
        giorno = base;
        dataEsplicita = true;
    }
    const dm = togli(/\s(\d{1,2})\/(\d{1,2})(\/(\d{2,4}))?(?=\s)/); // solo con '/': '3.1' resta nel titolo (es. Chimica 3.1)
    if (dm.length) {
        const m = dm[0];
        let y = m[4] ? +m[4] : base.getFullYear();
        if (y < 100)
            y += 2000;
        let d = new Date(y, +m[2] - 1, +m[1]);
        if (!m[4] && d < base)
            d = new Date(y + 1, +m[2] - 1, +m[1]);
        giorno = d;
        dataEsplicita = true;
    }
    const dmes = togli(/\s(\d{1,2})\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*\.?(\s+(\d{4}))?(?=\s)/);
    if (dmes.length) {
        const m = dmes[0];
        const y = m[4] ? +m[4] : base.getFullYear();
        let d = new Date(y, MESI_IT[m[2]], +m[1]);
        if (!m[4] && d < base)
            d = new Date(y + 1, MESI_IT[m[2]], +m[1]);
        giorno = d;
        dataEsplicita = true;
    }
    if (!og.length || (rr && !rr.byday)) {
        const gs = togli(/\s(prossimo\s+|prossima\s+|questo\s+|questa\s+)?(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|lun|mar|mer|gio|ven|sab|dom)(?=\s)/);
        if (gs.length) {
            const g = GIORNI_IT[gs[0][2]];
            const oggiI = (base.getDay() + 6) % 7;
            let d = (g - oggiI + 7) % 7;
            if (d === 0 || /prossim/.test(gs[0][1] || ''))
                d = d || 7;
            giorno = piuGiorni(base, d);
            dataEsplicita = true;
        }
    }
    if (rr && !rr.byday && rr.freq === 'W')
        rr.byday = [(giorno.getDay() + 6) % 7];
    // ore: "15-17", "15:30-17", "dalle 9 alle 10:30", "alle 9", "ore 9", "9:30", "h 9"
    const hh = (x) => { const [a, b] = x.replace('.', ':').split(':'); return [Math.min(23, +a), Math.min(59, +(b || 0))]; };
    let ora, fineOra;
    const intv = togli(/\s(dalle\s+|ore\s+|h\s*)?(\d{1,2}([:.]\d{2})?)\s*(-|–|alle\s+|fino alle\s+)\s*(\d{1,2}([:.]\d{2})?)(?=\s)/);
    if (intv.length) {
        ora = hh(intv[0][2]);
        fineOra = hh(intv[0][5]);
    }
    else {
        const una = togli(/\s(alle\s+|ore\s+|h\s*|all')(\d{1,2}([:.]\d{2})?)(?=\s)/);
        if (una.length)
            ora = hh(una[0][2]);
        else {
            const nuda = togli(/\s(\d{1,2}[:.]\d{2})(?=\s)/);
            if (nuda.length)
                ora = hh(nuda[0][1]);
        }
        // "ogni lunedì 9 palestra": un numero isolato subito dopo la data/ricorrenza vale come ora
        if (!ora && (og.length || dataEsplicita)) {
            const iso = togli(/^\s+(\d{1,2})(?=\s)/);
            if (iso.length && +iso[0][1] <= 23)
                ora = [+iso[0][1], 0];
        }
    }
    if (ora && !fineOra) {
        const p = /(sera|stasera)/.test(norm(frase)) && ora[0] < 12 ? 12 : 0;
        ora = [ora[0] + p, ora[1]];
    }
    const titolo = s.replace(/\s+/g, ' ').replace(/^[\s,:;-]+|[\s,:;-]+$/g, '').trim();
    if (!titolo)
        return null;
    if (!ora && tipo === 'evento' && !rr)
        tutto = tutto || dataEsplicita;
    if (!ora && tipo === 'evento' && rr)
        tutto = true;
    // categoria: materie di studio → Studio
    let categoriaId;
    const t = norm(titolo);
    for (const c of categorie())
        if (t.includes(norm(c.nome)))
            categoriaId = c.id;
    if (!categoriaId && /(chimica|biologia|fisica|\bchi\b|\bbio\b|\bfis\b|quiz|ripasso|simulazione)/.test(t) && Stato.prendi('cat-studio'))
        categoriaId = 'cat-studio';
    return { tipo, titolo: maiuscola(titolo), giorno, ora, fine: fineOra, tuttoIlGiorno: tipo === 'evento' && (tutto || !ora), rrule: rr, categoriaId, dataEsplicita };
}
function descriviRapido(r) {
    const quando = (r.rrule ? testoRicorrenza(r.rrule) + (r.rrule.byday ? '' : ', da ' + dataBreve(r.giorno)) : dataLunga(r.giorno))
        + (r.ora ? ' · ' + pad2(r.ora[0]) + ':' + pad2(r.ora[1]) + (r.fine ? '–' + pad2(r.fine[0]) + ':' + pad2(r.fine[1]) : '') : r.tipo === 'evento' ? ' · tutto il giorno' : '');
    const cat = r.categoriaId ? Stato.prendi(r.categoriaId) : null;
    return (r.tipo === 'task' ? 'Promemoria' : 'Evento') + ': «' + r.titolo + '» — ' + quando + (cat ? ' · ' + cat.nome : '');
}
function creaDaRapido(r) {
    if (r.tipo === 'task') {
        const d = ymd(r.giorno);
        const t = { id: uid(), type: 'task', updatedAt: 0, titolo: r.titolo, priorita: 0, fatto: false, categoriaId: r.categoriaId,
            scadenza: r.dataEsplicita || r.ora ? (r.ora ? d + 'T' + pad2(r.ora[0]) + ':' + pad2(r.ora[1]) : d) : undefined, rrule: r.rrule };
        Stato.salva(t);
        return t;
    }
    const i = new Date(r.giorno), f = new Date(r.giorno);
    if (r.tuttoIlGiorno) {
        f.setHours(23, 59);
    }
    else {
        i.setHours(r.ora[0], r.ora[1], 0, 0);
        if (r.fine) {
            f.setHours(r.fine[0], r.fine[1], 0, 0);
            if (f <= i)
                f.setDate(f.getDate() + 1);
        }
        else
            f.setTime(i.getTime() + 3600000);
    }
    const ev = { id: uid(), type: 'evento', updatedAt: 0, titolo: r.titolo, inizio: dtStr(i), fine: dtStr(f), tuttoIlGiorno: r.tuttoIlGiorno,
        categoriaId: r.categoriaId || (categorie()[0] || {}).id, rrule: r.rrule, promemoria: r.tuttoIlGiorno ? [] : [30], checklist: [] };
    Stato.salva(ev);
    return ev;
}
/** Campo di aggiunta rapida con anteprima di ciò che verrà creato. */
function campoRapido() {
    const anteprima = h('div.rapido-anteprima');
    const campo = h('input.rapido', { type: 'text', placeholder: '+ Aggiungi: "domani 15-17 Chimica 3.1"', enterKeyHint: 'done', autocomplete: 'off',
        oninput: () => { const r = interpreta(campo.value); anteprima.textContent = r && campo.value.trim() ? descriviRapido(r) : ''; },
        onkeydown: (e) => {
            if (e.key !== 'Enter')
                return;
            const r = interpreta(campo.value);
            if (!r)
                return;
            const rec = creaDaRapido(r);
            avviso('Creato: ' + descriviRapido(r), 5000, () => rec.type === 'task' ? apriTask(rec) : apriEvento(rec));
        } });
    return h('div.rapido-box', null, campo, anteprima);
}

// 07-regole.ts — Quiz Studio Q4 (v0.25): regole che imparano dall'esperienza.
//
// Legge le statistiche per domanda (record 'statq') e:
//  • raggruppa gli errori degli esercizi generati per TIPO (chiave dk del distrattore → categoria);
//  • dopo N errori dello stesso tipo mostra un avviso con il consiglio, nel quiz;
//  • per le domande della banca avvisa se la stessa domanda è già stata sbagliata;
//  • negli esercizi generati sceglie più spesso i modelli in cui sbagli (quota «deboli»);
//  • nel quiz nativo può mettere prima le domande già sbagliate (ordineQuiz = 'deboli-prima').
// Le regole sono un oggetto JSON: predefinite qui, modificabili in Altro → Regole dei quiz (record
// 'regole', id 'regole-quiz', sincronizzato su Drive). Claude può proporre una versione nuova da incollare.
const Regole = (() => {
    const ID = 'regole-quiz';
    const PREDEFINITE = {
        versione: 1,
        avvisoDopo: 2, // dalla 2ª volta dello stesso tipo di errore compare l'avviso
        quotaDeboli: 0.5, // metà degli esercizi generati viene dai modelli in cui sbagli di più
        minTentativi: 2, // un modello conta come «debole» solo dopo almeno 2 tentativi
        ordineQuiz: 'scheda', // 'deboli-prima' = nel quiz nativo prima le domande già sbagliate
        categorie: {
            unita: { etichetta: 'Unità di misura non convertite', consiglio: 'Prima di sostituire porta tutto nelle stesse unità (m, s, kg, L, m², m³, Pa) e scrivi l\'unità accanto a ogni numero.', dk: ['ml', 'kmh', 'noconv', 'min', 'cm', 'cm2', 'dm3', 'mm', 'pa', 'km', 'cento', 'mille', 'esp', 'milli', 'per36', 'cm3', 'r', 'ordine'] },
            kelvin: { etichetta: 'Temperatura in °C invece che in K', consiglio: 'Nelle formule di termodinamica, gas e soluzioni T va in kelvin: T = t + 273.', dk: ['celsius'] },
            joule: { etichetta: 'J e kJ confusi', consiglio: 'ΔH è di solito in kJ, ΔS in J/K: converti prima di sottrarre (÷1000 o ×1000).', dk: ['joule'] },
            segno: { etichetta: 'Segno sbagliato', consiglio: 'Scrivi la formula con il suo segno prima dei numeri, e metti tra parentesi i valori negativi.', dk: ['segno'] },
            inverso: { etichetta: 'Rapporto invertito o operazione sbagliata', consiglio: 'Controlla le unità del risultato: dicono cosa sta al numeratore e cosa al denominatore.', dk: ['inv', 'div', 'molt', 'unok', 'mmolt', 'divi'] },
            fattore: { etichetta: 'Fattore dimenticato (½, 2, g, i, ρ…)', consiglio: 'Scrivi sempre la formula completa prima di sostituire, poi spunta ogni simbolo mentre metti il numero.', dk: ['nomezzo', 'no2', 'nog', 'noi', 'norho', 'noh', 'nok', 'noquad', 'noradice', 'pi', 'nopi', 'nocos', 'meta', 'doppio', 'sin', 'cos', 'tan', 'massa', 'soloh'] },
            grandezza: { etichetta: 'Hai calcolato un\'altra grandezza', consiglio: 'Rileggi cosa chiede la domanda: tempo o spazio? rimasta o decaduta? molecole o atomi? relativa o assoluta?', dk: ['tempo', 'omega', 'soloa', 'peso', 'lavoro', 'p', 'assoluta', 'decaduta', 'atomi', 'energia', 'resp', 'gh', 'uguale', 'somma', 'diff', 'solo2', 'nodiv', 'keb'] },
            stechiometria: { etichetta: 'Coefficienti stechiometrici ignorati', consiglio: 'Il rapporto in moli è quello dei coefficienti: moli cercate = moli date × (coeff. cercato / coeff. dato).', dk: ['solo'] },
            conteggio: { etichetta: 'Conteggi (cromosomi, ioni, molecole)', consiglio: 'Fai uno schema: quante unità prima, cosa raddoppia o si divide, quante dopo.', dk: ['n', '2n', '4n', 'n2', 'uno', 'piu1', 'meno1', 'p1', 'm1', 'p2', 'm2', 'x2', 'lordi', 'tre', 'lineare'] },
        },
    };
    let cache = null, cacheTs = -1;
    function get() {
        const r = Stato.prendi(ID), ts = r && !r.deleted ? r.updatedAt : 0;
        if (cache && ts === cacheTs)
            return cache;
        let x = PREDEFINITE;
        if (r && !r.deleted)
            try {
                const j = JSON.parse(r.json);
                x = { ...PREDEFINITE, ...j, categorie: { ...PREDEFINITE.categorie, ...(j.categorie || {}) } };
            }
            catch (_) { /* JSON rotto: predefinite */ }
        cache = x;
        cacheTs = ts;
        return x;
    }
    function categoriaDi(dk) {
        const c = get().categorie;
        for (const k of Object.keys(c))
            if (c[k].dk.includes(dk))
                return k;
        return 'altro';
    }
    /** Errori per categoria negli esercizi generati (somma delle scelte sbagliate per dk). */
    function perTipo() {
        const out = {};
        for (const s of Stato.tutti('statq'))
            if (s.id.startsWith('sq-g-') && s.scelte)
                for (const [dk, n] of Object.entries(s.scelte)) {
                    const c = categoriaDi(dk);
                    out[c] = (out[c] || 0) + n;
                }
        return out;
    }
    /** Avviso da mostrare dopo una risposta sbagliata ('' se nessuno). */
    function avvisoRisposta(d, dk) {
        const R = get();
        if (d.gen && dk) {
            const c = categoriaDi(dk);
            if (c === 'altro')
                return '';
            const n = perTipo()[c] || 0;
            if (n >= R.avvisoDopo)
                return '⚠️ ' + n + 'ª volta: ' + R.categorie[c].etichetta.toLowerCase() + '. ' + R.categorie[c].consiglio;
            return '';
        }
        const s = Stato.prendi('sq-' + d.id);
        const sb = s && !s.deleted ? s.n - s.ok : 0;
        return sb >= R.avvisoDopo ? '⚠️ Hai sbagliato questa domanda ' + sb + ' volte: rileggi la spiegazione dalle fonti e poi chiedi la versione «Dettagliata» all\'AI.' : '';
    }
    /** Tasso d'errore di un modello generato (0..1), null se pochi tentativi. */
    function errModello(id) {
        const s = Stato.prendi('sq-g-' + id);
        if (!s || s.deleted || s.n < get().minTentativi)
            return null;
        return (s.n - s.ok) / s.n;
    }
    /** Sceglie l'ordine dei modelli per una serie: quota ai più sbagliati, il resto a rotazione. */
    function scegliModelli(ms, n) {
        const R = get(), out = [];
        const deboli = ms.map(m => ({ m, e: errModello(m.id) })).filter(x => x.e !== null && x.e > 0).sort((a, b) => b.e - a.e);
        const nd = deboli.length ? Math.round(n * R.quotaDeboli) : 0;
        for (let i = 0; i < nd; i++) {
            // estrazione pesata sul tasso d'errore
            const tot = deboli.reduce((a, x) => a + x.e, 0);
            let r = Math.random() * tot;
            const x = deboli.find(y => (r -= y.e) <= 0) || deboli[0];
            out.push(x.m);
        }
        for (let i = 0; out.length < n; i++)
            out.push(ms[i % ms.length]);
        return out;
    }
    /** Ordine delle domande del quiz nativo secondo la regola. */
    function ordina(domande) {
        const idx = domande.map((_, k) => k);
        if (get().ordineQuiz !== 'deboli-prima')
            return idx;
        const err = (d) => { const s = Stato.prendi('sq-' + d.id); return s && !s.deleted ? s.n - s.ok : 0; };
        return idx.sort((a, b) => err(domande[b]) - err(domande[a]));
    }
    // ---- Studio → Errori: errori tipici ----
    function sezioneTipici() {
        const t = perTipo(), R = get();
        const voci = Object.entries(t).filter(([c]) => R.categorie[c]).sort((a, b) => b[1] - a[1]);
        const modelli = Generatori.MODELLI.map(m => ({ m, e: errModello(m.id), s: Stato.prendi('sq-g-' + m.id) })).filter(x => x.e !== null && x.e >= 0.5).sort((a, b) => b.e - a.e);
        if (!voci.length && !modelli.length)
            return null;
        return h('section.card', null, h('h2.card-titolo', null, 'I tuoi errori tipici'), h('div.tenue.piccolo', null, 'Dagli esercizi generati (🎲): che tipo di errore fai più spesso e come evitarlo.'), voci.map(([c, n]) => h('div.dom-voce', null, h('div', null, h('b', null, R.categorie[c].etichetta), ' · ' + n + (n === 1 ? ' volta' : ' volte')), h('div.tenue.piccolo', null, R.categorie[c].consiglio))), modelli.length ? h('div', null, h('div.gruppo-titolo', null, 'Esercizi dove sbagli di più'), modelli.slice(0, 8).map(x => h('div.tenue.piccolo', null, nomeMateria(x.m.m) + ' · ' + x.m.titolo + ' — ' + Math.round(x.e * 100) + '% di errori su ' + x.s.n))) : null);
    }
    // ---- Altro → Regole dei quiz ----
    function sezioneAltro() {
        const r = Stato.prendi(ID), propria = !!(r && !r.deleted);
        const ta = h('textarea.regole-json', { rows: 12, spellcheck: false, value: JSON.stringify(get(), null, 1) });
        const box = h('div', { hidden: true }, ta, h('div.bottoni', null, h('button.btn', { onclick: () => {
                let j;
                try {
                    j = JSON.parse(ta.value);
                }
                catch (e) {
                    avviso('JSON non valido: ' + e.message, 7000);
                    return;
                }
                if (typeof j !== 'object' || !j.categorie) {
                    avviso('Mancano le categorie.', 5000);
                    return;
                }
                Stato.salva({ id: ID, type: 'regole', updatedAt: 0, json: JSON.stringify(j) }, true);
                cache = null;
                avviso('Regole salvate.');
                disegna();
            } }, 'Salva regole'), propria ? h('button.btn.neutro', { onclick: () => { Stato.elimina(ID); cache = null; avviso('Ripristinate le regole predefinite.'); disegna(); } }, 'Ripristina predefinite') : null, h('button.btn.neutro', { onclick: async () => { try {
                await navigator.clipboard.writeText(ta.value);
                avviso('Copiate: puoi incollarle a Claude.');
            }
            catch (_) {
                ta.select();
                avviso('Seleziona e copia a mano.');
            } } }, '📋 Copia')));
        const R = get();
        return scheda('Regole dei quiz', h('div.tenue.piccolo', null, 'Come l\'app adatta quiz ed esercizi ai tuoi errori. ' + (propria ? 'Stai usando regole modificate.' : 'Regole predefinite.')), h('div.gruppo', null, riga('Avviso dalla', h('select', { onchange: (e) => imposta({ avvisoDopo: +e.target.value }) }, [2, 3, 4, 5].map(n => h('option', { value: n, selected: R.avvisoDopo === n }, n + 'ª volta')))), riga('Esercizi sui punti deboli', h('select', { onchange: (e) => imposta({ quotaDeboli: +e.target.value }) }, [[0, 'nessuno'], [0.25, '1 su 4'], [0.5, 'metà'], [0.75, '3 su 4']].map(([v, n]) => h('option', { value: v, selected: R.quotaDeboli === v }, String(n))))), riga('Ordine nel quiz', h('select', { onchange: (e) => imposta({ ordineQuiz: e.target.value }) }, [['scheda', 'come nella scheda'], ['deboli-prima', 'prima quelle già sbagliate']].map(([v, n]) => h('option', { value: v, selected: R.ordineQuiz === v }, n))))), h('button.btn-testo', { onclick: (e) => { box.hidden = !box.hidden; e.target.textContent = box.hidden ? 'Modifica avanzata (JSON)' : 'Chiudi modifica avanzata'; } }, 'Modifica avanzata (JSON)'), box);
    }
    function imposta(p) {
        const j = { ...get(), ...p };
        Stato.salva({ id: ID, type: 'regole', updatedAt: 0, json: JSON.stringify(j) }, true);
        cache = null;
        avviso('Regola aggiornata.');
    }
    return { get, PREDEFINITE, categoriaDi, perTipo, avvisoRisposta, errModello, scegliModelli, ordina, sezioneTipici, sezioneAltro };
})();

// 07-ripianifica.ts — Ripianifica gli step in ritardo del piano principale (F5 ridotta, v0.10).
//
// Gli step non completati con data passata vengono spostati in avanti con Studio.sposta(): i progressi
// non cambiano mai, cambia solo il giorno (record 'spostamento'). Due modi, scelti nell'anteprima:
//  - "prima possibile": il primo giorno utile con meno di 3 step;
//  - "giorni leggeri": il giorno utile con meno step (a parità, il più vicino).
// Giorni utili: da domani all'ultimo giorno prima della chiusura della teoria; esclusi simulazioni,
// verifica, chiusura, sprint, riposo. Le "Riserva" accettano al massimo 2 step, gli altri 3.
const Ripianifica = (() => {
    const VIETATI = /^(SIM|VERIFICA|CHIUSURA|SPRINT|RIPOSO|FINALE)/; // v0.19: anche i giorni finali dei piani generati
    const piu = (k, n) => { const d = daDt(k); d.setDate(d.getDate() + n); return ymd(d); };
    /** Step in ritardo del piano principale, nell'ordine del piano. */
    function inRitardo(oggiK = ymd(new Date()), p = Studio.pkPiano()) {
        if (!p || (p.modo === 'raffinamento' && !/^gen-/.test(p.id)))
            return [];
        const out = [];
        for (const g of p.giorni)
            for (const v of g.voci) {
                const d = Studio.dataVoce(v, g, p.id);
                if (!v.speciale && d < oggiK && !Studio.stepFatto(v.k, p))
                    out.push({ k: v.k, t: v.t, da: d });
            }
        return out;
    }
    /** Giorni utili con il loro carico attuale (step non speciali che cadono quel giorno). */
    function giorniUtili(oggiK, p = Studio.pkPiano()) {
        if (!p)
            return [];
        const cap = p.capienza || 3;
        const fine = (p.giorni.find(g => g.voci.some(v => /^CHIUSURA/.test(v.k))) || p.giorni[p.giorni.length - 1]).data;
        const carico = {}, tipo = {};
        for (const g of p.giorni)
            for (const v of g.voci) {
                const d = Studio.dataVoce(v, g, p.id);
                if (v.speciale) {
                    if (g.data === d)
                        tipo[d] = VIETATI.test(v.k) ? 'no' : (tipo[d] || 'riserva');
                }
                else
                    carico[d] = (carico[d] || 0) + 1;
            }
        const out = [];
        for (let d = piu(oggiK, 1); d < fine; d = piu(d, 1)) {
            if (tipo[d] === 'no')
                continue;
            out.push({ data: d, carico: carico[d] || 0, max: tipo[d] === 'riserva' ? Math.min(2, cap) : cap });
        }
        return out;
    }
    /** Proposta: per ogni step in ritardo, il nuovo giorno (null se non c'è posto prima della chiusura). */
    function proponi(modo, oggiK = ymd(new Date()), p = Studio.pkPiano()) {
        const giorni = giorniUtili(oggiK, p);
        return inRitardo(oggiK, p).map(x => {
            const liberi = giorni.filter(g => g.carico < g.max);
            let scelto = liberi[0];
            if (modo === 'leggeri' && liberi.length)
                scelto = liberi.reduce((a, b) => b.carico < a.carico ? b : a);
            if (scelto)
                scelto.carico++;
            return { ...x, a: scelto ? scelto.data : null };
        });
    }
    function applica(prop, p = Studio.pkPiano()) {
        const prima = prop.map(x => ({ k: x.k, sp: Stato.prendi(p.id === 'piano' ? 'sp-' + x.k : 'sp-' + p.id + '-' + x.k) }));
        for (const x of prop)
            if (x.a)
                Studio.sposta(x.k, x.a, p.id);
        return () => { for (const x of prima)
            Studio.sposta(x.k, x.sp && !x.sp.deleted ? x.sp.data : null, p.id); };
    }
    return { inRitardo, giorniUtili, proponi, applica };
})();
const giornoBreve = (k) => { const d = daDt(k); return ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'][d.getDay()] + ' ' + k.slice(8, 10) + '/' + k.slice(5, 7); };
/** Foglio con anteprima e conferma. */
function apriRipianifica(piano) {
    const pp = piano && piano.giorni ? piano : Studio.pkPiano();
    let modo = 'leggeri';
    const corpo = h('div.modulo');
    const disegnaProp = () => {
        svuota(corpo);
        const prop = Ripianifica.proponi(modo, ymd(new Date()), pp);
        [
            h('div.segmenti', { role: 'tablist' }, h('button' + (modo === 'leggeri' ? '.attivo' : ''), { onclick: () => { modo = 'leggeri'; disegnaProp(); } }, 'Giorni leggeri'), h('button' + (modo === 'presto' ? '.attivo' : ''), { onclick: () => { modo = 'presto'; disegnaProp(); } }, 'Prima possibile')),
            h('div.tenue.piccolo', null, modo === 'leggeri'
                ? 'Mette gli step dove il piano è più leggero (giorni con meno step, Riserve): giornate più sostenibili.'
                : 'Recupera subito: il primo giorno con meno di 3 step. Si torna in pari prima, ma con giornate più piene.'),
            h('div.gruppo', null, prop.length ? prop.map(x => h('div.widget-riga', null, h('span.nome', null, Studio.etichetta(x.k), h('div.tenue.piccolo', null, x.t)), h('span', { style: { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } }, giornoBreve(x.da) + ' → ', x.a ? h('b', null, giornoBreve(x.a)) : h('b', { style: { color: 'var(--rosso)' } }, 'nessun posto')))) : h('div.vuoto', null, 'Nessuno step in ritardo: sei in pari. 🎉')),
            prop.some(x => !x.a) ? h('div.tenue.piccolo', { style: { color: 'var(--rosso)' } }, 'Alcuni step non trovano posto prima della chiusura: vanno fatti in un giorno di sprint o accorpati.') : null,
            h('div.tenue.piccolo', null, 'Cambia solo il giorno: le schede fatte e i punteggi restano.'),
        ].forEach(el => { if (el)
            corpo.appendChild(el); });
        corpo._prop = prop;
    };
    disegnaProp();
    foglio({ titolo: 'Ripianifica i ritardi', corpo, etichettaSalva: 'Conferma', salva: () => {
            const prop = corpo._prop;
            if (!prop.length)
                return;
            const annulla = Ripianifica.applica(prop, pp);
            avviso('Spostati ' + prop.filter(x => x.a).length + ' step · tocca per annullare', 8000, () => { annulla(); avviso('Spostamenti annullati.'); });
        } });
}

// 07-simulazioni.ts — Modalità simulazione d'esame (v0.11, tattica T14).
//
// Le schede di consolidamento/simulazione (31 domande, 50 minuti) stanno su Drive in una cartella
// trovata per nome ("consolidamento" o "simulazion", modificabile salvando imp().cartellaSimulazioni).
// La simulazione si apre a schermo intero con il conto alla rovescia (predefinito 50 min), lo schermo
// resta acceso (Wake Lock, dove supportato), avvisi a 10 minuti dalla fine e allo scadere; il risultato
// si legge in automatico (07-cattura) e si salva in un record 'simulazione'. I file non vengono toccati.
const Simulazioni = (() => {
    async function cartella() {
        const i = imp();
        if (i.cartellaSimulazioni)
            return i.cartellaSimulazioni;
        for (const t of ['consolidamento', 'simulazion', 'Simulazion']) {
            const r = await Drive.cercaCartelle(t);
            if (r.length) {
                i.cartellaSimulazioni = r[0].id;
                Stato.salva(i, true);
                return r[0].id;
            }
        }
        return null;
    }
    async function file() {
        const c = await cartella();
        if (!c)
            return [];
        return (await Drive.elencaTutti(c)).filter(f => /\.html?$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }));
    }
    const tutte = () => Stato.tutti('simulazione').sort((a, b) => (a.data + a.ora) < (b.data + b.ora) ? 1 : -1);
    const minutiPredefiniti = () => imp().minutiSimulazione || 50;
    return { file, tutte, minutiPredefiniti };
})();
/** Elenco dei file di simulazione da scegliere. */
async function apriSimulazioni() {
    if (serveGoogle())
        return;
    const corpo = h('div.modulo', null, h('div.vuoto.centro', null, 'Cerco le simulazioni su Drive…'));
    const f = foglio({ titolo: 'Simulazione d\'esame', corpo });
    try {
        const lista = await Simulazioni.file();
        svuota(corpo);
        if (!lista.length) {
            corpo.appendChild(h('div.vuoto', null, 'Non trovo la cartella delle simulazioni su Drive (nome con «consolidamento» o «simulazioni»).'));
            return;
        }
        const fatte = Simulazioni.tutte();
        corpo.append(h('div.tenue.piccolo', null, 'Condizioni d\'esame: ' + Simulazioni.minutiPredefiniti() + ' minuti, schermo intero, senza appunti. Attiva «Full immersion» sull\'iPhone per non ricevere notifiche.'), h('div.gruppo', null, lista.map(x => {
            const prec = fatte.filter(s => s.fileId === x.id);
            return h('button.voce-lista', { onclick: () => { f.chiudi(); avviaSimulazione(x.id, x.name.replace(/\.html?$/i, '')); } }, h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, x.name.replace(/\.html?$/i, '')), h('span.voce-sotto', null, prec.length ? 'Fatta ' + prec.length + (prec.length === 1 ? ' volta' : ' volte') + ' · ultima ' + (prec[0].pct != null ? prec[0].pct + '%' : '—') + ' il ' + prec[0].data.slice(8) + '/' + prec[0].data.slice(5, 7) : 'Mai fatta')), icona('dx', 18));
        })));
    }
    catch (e) {
        svuota(corpo);
        corpo.appendChild(h('div.vuoto', null, String(e.message || e)));
    }
}
/** Esegue una simulazione a tempo. */
async function avviaSimulazione(fileId, nome, limite = Simulazioni.minutiPredefiniti()) {
    const inizio = Date.now(), fine = inizio + limite * 60000;
    let lock = null, tick = 0, salvata = false, avvisato10 = false, scaduto = false;
    const orologio = h('span.sim-orologio', { 'aria-live': 'off' }, limite + ':00');
    const barra = h('div.sim-barra', null, h('div.sim-riempi'));
    const v = visore('⏱ ' + nome, () => { clearInterval(tick); try {
        lock && lock.release();
    }
    catch (_) { /* niente */ } });
    v.barra.appendChild(orologio);
    v.corpo.appendChild(h('div.vuoto.centro', null, 'Scarico la simulazione da Drive…'));
    const aggiorna = () => {
        const resta = Math.max(0, fine - Date.now()), m = Math.floor(resta / 60000), s = Math.floor(resta / 1000) % 60;
        orologio.textContent = m + ':' + String(s).padStart(2, '0');
        barra.firstChild.style.width = (100 - resta / (limite * 600)) + '%';
        orologio.classList.toggle('ultimi', resta <= 10 * 60000);
        if (!avvisato10 && resta <= 10 * 60000 && limite > 10) {
            avvisato10 = true;
            avviso('⏱ Mancano 10 minuti.', 6000);
        }
        if (!scaduto && resta === 0) {
            scaduto = true;
            avviso('⏰ Tempo scaduto: chiudi il quiz e guarda il risultato (come all\'esame, le domande senza risposta contano sbagliate).', 12000);
        }
    };
    try {
        let html = await Drive.scaricaTesto(fileId);
        const toppa = '<script>try{window.localStorage.getItem("x")}catch(e){(function(){var m={};var s={getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}}};try{Object.defineProperty(window,"localStorage",{value:s});Object.defineProperty(window,"sessionStorage",{value:s})}catch(_){}})()}<\/script>';
        html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, x => x + toppa) : toppa + html;
        html = Cattura.inietta(html);
        svuota(v.corpo);
        const fr = h('iframe.visore-frame', { sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals', srcdoc: html, title: nome });
        v.corpo.append(barra, fr);
        try {
            lock = await navigator.wakeLock?.request('screen');
        }
        catch (_) { /* non supportato */ }
        tick = window.setInterval(aggiorna, 1000);
        aggiorna();
        Cattura.osserva(fr, 'sim:' + fileId, nome, d => {
            if (d.errori) {
                Domande.registra('sim:' + fileId, '🧪 ' + nome, d);
                avviso('📝 Errori rifatti: ' + (d.giuste ?? '') + '/' + (d.totale ?? '') + ' (non cambia il risultato della simulazione)');
                return;
            }
            const adesso = new Date(), minuti = Math.round((Date.now() - inizio) / 60000);
            const rec = { id: 'sim-' + inizio, type: 'simulazione', updatedAt: 0, data: ymd(adesso), ora: hm(new Date(inizio)), fileId, nome,
                pct: d.pct, giuste: d.giuste, totale: d.totale, deboli: d.livelli, debole: d.debole, minuti, limite };
            Stato.salva(rec);
            salvata = true;
            Domande.registra('sim:' + fileId, '🧪 ' + nome, d); // v0.16: domande sbagliate della simulazione
            clearInterval(tick);
            avviso('✅ Simulazione salvata: ' + d.pct + '%' + (d.giuste != null ? ' (' + d.giuste + '/' + d.totale + ')' : '') + ' in ' + minuti + ' min' + (minuti > limite ? ' · fuori tempo di ' + (minuti - limite) + ' min' : '') + ' · tocca per annullare', 9000, () => { Stato.elimina(rec.id); avviso('Simulazione non salvata.'); });
        });
    }
    catch (e) {
        svuota(v.corpo);
        v.corpo.appendChild(h('div.vuoto.centro', null, String(e.message || e)));
    }
}
/** Riquadro in Studio → Esami: storico e pulsante. */
function sezioneSimulazioni() {
    const s = Simulazioni.tutte();
    return h('section.card', null, h('h2.card-titolo', null, 'Simulazioni a tempo'), h('div.bottoni', null, h('button.btn', { onclick: apriSimulazioni }, '▶ Nuova simulazione (' + Simulazioni.minutiPredefiniti() + ' min)')), s.length ? s.slice(0, 12).map(x => h('div.widget-riga', null, h('span.nome', null, x.nome, h('div.tenue.piccolo', null, x.data.slice(8) + '/' + x.data.slice(5, 7) + ' · ' + x.minuti + '/' + x.limite + ' min' + (x.debole ? ' · debole: ' + x.debole : ''))), h('b', { style: { fontVariantNumeric: 'tabular-nums' } }, x.pct != null ? x.pct + '%' : '—'))) : h('div.tenue.piccolo', null, 'Nessuna simulazione ancora. La prossima del piano: Simulazione 3, domenica 22/11.'));
}

// 07-spiegazioni.ts — Spiegazioni AI dentro i quiz (v0.21).
//
// Nella copia del quiz aperta nell'app (il file su Drive non cambia) si aggiunge, sotto la correzione,
// il riquadro «✨ Spiegazione AI» con tre livelli: breve, media, dettagliata. Il quiz manda al genitore
// domanda, opzioni, risposta corretta, risposta data, citazioni e correzione; l'app chiama Groq
// (gratuito, chiave solo su questo dispositivo, mai nei dati sincronizzati) e risponde.
// Ogni spiegazione diventa un record 'spiegazione' (id 'sp-<hash domanda+corretta>-<livello>'):
// si sincronizza su Drive con gli altri dati, così non si rigenera mai due volte e resta offline.
// Modello principale openai/gpt-oss-120b; se finisce il limite si passa alla riserva.
const Spiega = (() => {
    const KC = 'imc-groq-chiave', KM = 'imc-groq-modello';
    const PRINCIPALE = 'openai/gpt-oss-120b', RISERVA = 'llama-3.3-70b-versatile';
    const LIV = {
        breve: 'in 2-3 frasi, andando dritto al punto',
        media: 'in un paragrafo di 5-7 frasi, con il ragionamento passo passo',
        dettagliata: 'in modo approfondito: ragionamento passo passo, perché ciascuna risposta sbagliata è sbagliata, un esempio concreto e un trucco per ricordarlo',
    };
    const leggi = (k) => { try {
        return localStorage.getItem(k) || '';
    }
    catch (_) {
        return '';
    } };
    const scrivi = (k, v) => { try {
        if (v)
            localStorage.setItem(k, v);
        else
            localStorage.removeItem(k);
    }
    catch (_) { /* niente */ } };
    const chiave = () => leggi(KC);
    const modello = () => leggi(KM) || PRINCIPALE;
    function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++)
        h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
    const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const idDi = (d, l) => 'sp-' + hash(norm(d.q) + '|' + norm(d.corretta)) + '-' + l;
    function materia(t) {
        if (/fisic/i.test(t))
            return 'Fisica';
        if (/biolog/i.test(t))
            return 'Biologia';
        if (/chimic/i.test(t))
            return 'Chimica';
        return 'Chimica, Biologia o Fisica';
    }
    async function chiama(mod, d, l) {
        const sys = 'Sei un tutor di ' + materia(d.titolo) + ' per il semestre filtro di Medicina. Rispondi in italiano corretto e semplice, rivolgendoti allo studente con il tu. '
            + 'Basati sul testo di riferimento del corso e su conoscenze certe; non inventare dati, numeri o citazioni. Se il testo di riferimento non basta, dillo. '
            + 'Niente markdown: niente asterischi, cancelletti o tabelle. Puoi andare a capo tra un passaggio e l\'altro.';
        const u = 'Quiz: ' + d.titolo + '\nDomanda: ' + d.q
            + (d.opts.length ? '\nOpzioni: ' + d.opts.join(' | ') : '')
            + '\nRisposta corretta: ' + d.corretta
            + (d.scelta && norm(d.scelta) !== norm(d.corretta) ? '\nLo studente ha risposto: ' + d.scelta + ' (sbagliato): spiega anche dove sta l\'errore.' : '')
            + (d.cit ? '\nTesto di riferimento (dal corso): ' + d.cit : '')
            + (d.passi ? '\nCorrezione già mostrata: ' + d.passi : '')
            + '\n\nSpiega perché la risposta corretta è giusta ' + LIV[l] + '.';
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST', headers: { Authorization: 'Bearer ' + chiave(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: mod, temperature: 0.3, messages: [{ role: 'system', content: sys }, { role: 'user', content: u }] }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            const e = new Error((j && j.error && j.error.message) || 'errore ' + r.status);
            e.stato = r.status;
            throw e;
        }
        const t = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
        if (!t)
            throw new Error('risposta vuota');
        return t.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
    }
    async function genera(d, l) {
        const modelli = [modello()];
        if (modelli[0] !== RISERVA)
            modelli.push(RISERVA);
        let ultimo = null;
        for (const m of modelli) {
            try {
                return { testo: await chiama(m, d, l), modello: m };
            }
            catch (e) {
                ultimo = e;
                if (e.stato === 401)
                    break;
            }
        }
        if (ultimo && ultimo.stato === 401)
            throw new Error('Chiave Groq non valida: controllala in Altro → Spiegazioni AI.');
        if (ultimo && ultimo.stato === 429)
            throw new Error('Limite gratuito di oggi raggiunto. Riprova più tardi.');
        throw new Error(navigator.onLine === false ? 'Sei offline: le spiegazioni già generate restano disponibili.' : 'Non riuscito: ' + (ultimo && ultimo.message || 'errore'));
    }
    /** Q5: chiamata generica (messaggi liberi, risposta JSON) con lo stesso modello di riserva. */
    async function chat(msgs, temperatura = 0.4) {
        if (!chiave())
            throw new Error('Manca la chiave Groq: inseriscila in Altro → Spiegazioni AI.');
        const modelli = [modello()];
        if (modelli[0] !== RISERVA)
            modelli.push(RISERVA);
        let ultimo = null;
        for (const mod of modelli) {
            try {
                const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST', headers: { Authorization: 'Bearer ' + chiave(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: mod, temperature: temperatura, response_format: { type: 'json_object' }, messages: msgs }),
                });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) {
                    const e = new Error((j && j.error && j.error.message) || 'errore ' + r.status);
                    e.stato = r.status;
                    throw e;
                }
                const t = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
                return JSON.parse(t.replace(/^```(json)?|```$/g, ''));
            }
            catch (e) {
                ultimo = e;
                if (e.stato === 401)
                    break;
            }
        }
        if (ultimo && ultimo.stato === 401)
            throw new Error('Chiave Groq non valida: controllala in Altro → Spiegazioni AI.');
        if (ultimo && ultimo.stato === 429)
            throw new Error('Limite gratuito di Groq raggiunto. Riprova più tardi.');
        throw new Error(navigator.onLine === false ? 'Sei offline.' : 'Non riuscito: ' + (ultimo && ultimo.message || 'errore'));
    }
    // ---- Lato genitore: risponde alle richieste dei quiz aperti nell'app ----
    async function ricevi(e) {
        const m = e.data;
        if (!m || m.imc !== 'spiega-chiedi' || !e.source)
            return;
        const fonte = Array.from(document.querySelectorAll('iframe.visore-frame')).some(f => f.contentWindow === e.source);
        if (!fonte)
            return;
        const d = m.d, l = String(m.l);
        const rispondi = (x) => e.source.postMessage(Object.assign({ imc: 'spiega-risposta', k: m.k, l }, x), '*');
        if (!d || !d.q || !d.corretta || !LIV[l]) {
            rispondi({ errore: 'Non riesco a leggere la domanda.' });
            return;
        }
        const id = idDi(d, l), c = Stato.prendi(id);
        if (c && !c.deleted && !m.forza) {
            rispondi({ testo: c.testo, modello: c.modello, salvata: true });
            return;
        }
        if (!chiave()) {
            rispondi({ errore: 'Manca la chiave Groq: incollala in Altro → Spiegazioni AI.' });
            return;
        }
        try {
            const g = await genera(d, l);
            Stato.salva({ id, type: 'spiegazione', updatedAt: 0, q: d.q, giusta: d.corretta, livello: l, testo: g.testo, modello: g.modello, quiz: d.titolo }, true);
            rispondi(g);
        }
        catch (err) {
            rispondi({ errore: String(err.message || err) });
        }
    }
    window.addEventListener('message', e => { ricevi(e); });
    // ---- Lato quiz: script aggiunto alla copia del quiz (autonomo, niente riferimenti all'app) ----
    function spiaAI() {
        const D = document, stato = {};
        const tx = (el) => el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
        const senzaTag = (el) => { if (!el)
            return ''; const c = el.cloneNode(true); c.querySelectorAll('.tag').forEach(t => t.remove()); return tx(c); };
        const chiaveQ = () => tx(D.querySelector('.question'));
        const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        function raccogli() {
            const opts = Array.prototype.map.call(D.querySelectorAll('.opt .txt'), senzaTag);
            let corretta = senzaTag(D.querySelector('.opt.ok .txt')), scelta = senzaTag(D.querySelector('.opt.bad .txt'));
            if (!opts.length) {
                const v = D.querySelector('#why .verdict'), ans = D.querySelector('#ans');
                const mm = /«([\s\S]*)»/.exec(tx(v));
                if (v && v.classList.contains('ok'))
                    corretta = ans ? ans.value : '';
                else {
                    corretta = mm ? mm[1] : '';
                    scelta = ans ? ans.value : '';
                }
            }
            return { q: chiaveQ(), opts, corretta, scelta,
                cit: Array.prototype.map.call(D.querySelectorAll('#expl blockquote'), tx).join('\n'),
                passi: tx(D.querySelector('#why .steps')), titolo: tx(D.querySelector('header .eyebrow')) + ' — ' + tx(D.querySelector('header h1')) };
        }
        function mostra(b, k) {
            const o = b.querySelector('.ai-out'), s = stato[k];
            b.querySelectorAll('button[data-l]').forEach(x => x.classList.toggle('on', !!s && x.dataset.l === s.l && !x.dataset.f));
            if (!s) {
                o.innerHTML = '';
                return;
            }
            if (s.attesa) {
                o.innerHTML = '<p class="ai-nota">Genero la spiegazione…</p>';
                return;
            }
            if (s.errore) {
                o.innerHTML = '<p class="ai-nota">⚠️ ' + esc(s.errore) + '</p>';
                return;
            }
            o.innerHTML = '<div class="ai-testo">' + esc(s.testo) + '</div><div class="ai-piede"><span>' + esc(s.modello || '') + (s.salvata ? ' · salvata' : '') + '</span><button type="button" class="tool" data-l="' + s.l + '" data-f="1">↻ Rigenera</button></div>';
        }
        function aggiungi() {
            const w = D.getElementById('why');
            if (!w || (w.nextElementSibling && w.nextElementSibling.classList.contains('ai-box')))
                return;
            const k = chiaveQ(), b = D.createElement('div');
            b.className = 'ai-box';
            b.innerHTML = '<span class="label">✨ Spiegazione AI</span><div class="ai-btns"><button type="button" class="tool" data-l="breve">Breve</button><button type="button" class="tool" data-l="media">Media</button><button type="button" class="tool" data-l="dettagliata">Dettagliata</button></div><div class="ai-out"></div>';
            w.parentNode.insertBefore(b, w.nextSibling);
            mostra(b, k);
            b.addEventListener('click', ev => {
                const t = ev.target.closest('button[data-l]');
                if (!t)
                    return;
                ev.stopPropagation();
                const l = t.dataset.l, forza = !!t.dataset.f;
                // Le citazioni sono nel riquadro «📖 Spiegazione»: se è chiuso lo apro un istante per leggerle.
                const btn = D.getElementById('explbtn'), apri = !D.getElementById('expl') && !!btn;
                if (apri)
                    btn.click();
                const d = raccogli();
                if (apri && D.getElementById('explbtn'))
                    D.getElementById('explbtn').click();
                stato[k] = { l, attesa: true };
                const box = D.querySelector('.ai-box');
                if (box)
                    mostra(box, k);
                parent.postMessage({ imc: 'spiega-chiedi', k, l, forza, d }, '*');
            });
        }
        window.addEventListener('message', e => {
            const m = e.data;
            if (!m || m.imc !== 'spiega-risposta')
                return;
            stato[m.k] = { l: m.l, testo: m.testo, errore: m.errore, modello: m.modello, salvata: m.salvata };
            const b = D.querySelector('.ai-box');
            if (b && chiaveQ() === m.k)
                mostra(b, m.k);
        });
        const st = D.createElement('style');
        st.textContent = '.ai-box{margin-top:14px;padding:12px 14px;border-radius:12px;border:1px solid rgba(127,127,127,.35)}'
            + '.ai-box .label{display:block;font-weight:700;margin-bottom:8px}.ai-btns{display:flex;gap:6px;flex-wrap:wrap}'
            + '.ai-btns .tool.on{outline:2px solid currentColor}.ai-testo{white-space:pre-wrap;margin-top:10px;line-height:1.55}'
            + '.ai-piede{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;font-size:.8em;opacity:.8}.ai-nota{margin:10px 0 0;opacity:.85}';
        D.head.appendChild(st);
        new MutationObserver(aggiungi).observe(D.body, { childList: true, subtree: true });
        aggiungi();
    }
    const SCRIPT = '<script>(' + spiaAI.toString() + ')();<\/script>';
    /** Aggiunge il riquadro AI alla copia del quiz (in fondo al body). */
    function inietta(html) { return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, SCRIPT + '</body>') : html + SCRIPT; }
    // ---- Altro → Spiegazioni AI ----
    function sezione() {
        const inp = h('input', { type: 'text', placeholder: 'gsk_…', value: chiave(), autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: false, style: { fontFamily: 'monospace' } });
        const salvaChiave = () => { const v = inp.value.replace(/\s+/g, ''); inp.value = v; scrivi(KC, v); avviso(v ? (/^gsk_/.test(v) ? 'Chiave salvata su questo dispositivo.' : 'Salvata, ma non sembra una chiave Groq (inizia con gsk_).') : 'Chiave rimossa.', 5000); };
        const incolla = async () => {
            try {
                const t = await navigator.clipboard.readText();
                if (!t) {
                    avviso('Gli appunti sono vuoti.');
                    return;
                }
                inp.value = t;
                salvaChiave();
            }
            catch (_) {
                inp.focus();
                avviso('Tieni premuto nel campo e scegli «Incolla».', 6000);
            }
        };
        const sel = h('select', null, [PRINCIPALE, RISERVA].map(m => h('option', { value: m, selected: m === modello() }, m)));
        sel.onchange = () => { scrivi(KM, sel.value === PRINCIPALE ? '' : sel.value); avviso('Modello: ' + sel.value); };
        const n = Stato.tutti('spiegazione').length;
        const prova = async () => {
            if (!chiave()) {
                avviso('Prima salva la chiave.');
                return;
            }
            avviso('Provo…');
            try {
                const g = await genera({ q: 'Quanto fa 2 + 2?', opts: [], corretta: '4', scelta: '', cit: '', passi: '', titolo: 'prova' }, 'breve');
                avviso('✅ Funziona (' + g.modello + ')', 5000);
            }
            catch (e) {
                avviso(String(e.message || e), 8000);
            }
        };
        return scheda('Spiegazioni AI', h('div.tenue.piccolo', null, 'Nei quiz aperti dall\'app, sotto la correzione compare «✨ Spiegazione AI» (breve, media o dettagliata). Usa Groq, gratuito. La chiave resta solo su questo dispositivo; le spiegazioni generate si salvano con i tuoi dati su Drive e non si rigenerano.'), h('div.gruppo', null, riga('Chiave Groq', inp), riga('Modello', sel)), h('div.bottoni', null, h('button.btn', { onclick: incolla }, '📋 Incolla chiave'), h('button.btn.neutro', { onclick: salvaChiave }, 'Salva'), h('button.btn.neutro', { onclick: prova }, 'Prova')), h('div.tenue.piccolo', null, n ? 'Spiegazioni salvate: ' + n + '.' : 'Nessuna spiegazione salvata finora.'));
    }
    return { inietta, sezione, genera, idDi, chat, materia };
})();

// 07-studiaora.ts — "Studia ora" (v0.15, F4 ridotta, tattiche T15–T19).
//
// Un tasto in cima a Oggi: scegli quanto tempo hai (25/50/90 min) e l'app compone la sessione,
// una cosa alla volta, in quest'ordine:
//  1. ripassi di oggi più a rischio (al massimo ~40% del tempo, richiamo con memoria "tiepida");
//  2. step del giorno: prova a freddo se lo step non è iniziato, poi le prioritarie da fare in ordine;
//  3. schede da rifare (errori), se avanza tempo;
//  4. 5 minuti finali di richiamo a memoria (cosa ho imparato? scrivo una domanda).
// Le pause sono inserite ogni ~25 minuti. Il timer della sessione parte con la durata scelta.
// La sessione in corso si salva sul dispositivo (localStorage) per riprenderla.
const StudiaOra = (() => {
    const CH = 'imc-studia-ora', MIN = 10;
    const leggi = () => { try {
        return JSON.parse(localStorage.getItem(CH) || 'null');
    }
    catch (_) {
        return null;
    } };
    const scrivi = (s) => { try {
        s ? localStorage.setItem(CH, JSON.stringify(s)) : localStorage.removeItem(CH);
    }
    catch (_) { /* niente */ } };
    function componi(minuti, giorno = oggi()) {
        const out = [];
        let resto = minuti - 5; // 5 min finali di richiamo
        const metti = (v) => { if (resto >= v.min) {
            out.push(v);
            resto -= v.min;
            return true;
        } return false; };
        // 1) ripassi più a rischio, max ~40% del tempo
        let tettoRip = Math.max(MIN, Math.round(minuti * 0.4));
        for (const x of Ripassi.delGiorno(ymd(giorno)).oggi) {
            if (tettoRip < MIN)
                break;
            const sc = Ripassi.schedaDaProporre(x.k);
            if (!sc)
                continue;
            if (metti({ tipo: 'ripasso', titolo: '🧠 Ripasso ' + Studio.etichetta(x.k), sotto: 'Rifai: ' + sc.titolo + ' · ricordo ' + Math.round(x.r * 100) + '%', min: MIN, k: x.k, id: sc.id }))
                tettoRip -= MIN;
        }
        // 1b) flashcard di oggi (v0.18): circa 12 secondi a carta, massimo 15 minuti
        const nc = Carte.conta();
        const minC = Math.min(15, Math.max(5, Math.round((nc.ripasso + nc.nuove) * 0.2)));
        if (nc.ripasso + nc.nuove && Carte.mazzi().length)
            metti({ tipo: 'carte', titolo: '🃏 Flashcard', sotto: nc.ripasso + ' da ripassare + ' + nc.nuove + ' nuove', min: minC });
        // 2) step del giorno
        for (const vg of Studio.vociDelGiorno(giorno)) {
            if (vg.v.speciale || vg.p.modo === 'raffinamento')
                continue;
            const t = Studio.trovaSotto(vg.v.k);
            if (!t)
                continue;
            if (Freddo.possibile(vg.v.k) && !Freddo.rec(vg.v.k))
                metti({ tipo: 'freddo', titolo: '🧊 Prova a freddo ' + Studio.etichetta(vg.v.k), sotto: 'Prima di leggere: d\'istinto, non conta', min: MIN, k: vg.v.k });
            for (const s of Studio.schedeDi(t.sub).filter(x => x.tipo === 'P' && !Studio.fatta(x.id)))
                if (!metti({ tipo: 'scheda', titolo: '📖 ' + Studio.etichetta(vg.v.k) + ' · scheda ' + s.k + '/' + s.n, sotto: s.titolo + ' · pp. ' + Studio.intervalli(Studio.pagineSet(s.pagine)), min: MIN, k: vg.v.k, id: s.id }))
                    break;
        }
        // 3) errori
        for (const x of tutteLeSchede().filter(x => daRifare(x.s.id)))
            if (!metti({ tipo: 'errore', titolo: '✏️ Da rifare · ' + Studio.etichetta(x.sub.k), sotto: x.s.titolo, min: MIN, k: x.sub.k, id: x.s.id }))
                break;
        // pause ogni ~25 minuti di lavoro
        const conPause = [];
        let acc = 0;
        out.forEach((v, i) => { conPause.push(v); acc += v.min; if (acc >= 25 && i < out.length - 1 && minuti >= 50) {
            conPause.push({ tipo: 'pausa', titolo: '☕ Pausa', sotto: 'Alzati, bevi, niente social: il cervello consolida', min: 5 });
            acc = 0;
        } });
        conPause.push({ tipo: 'richiamo', titolo: '🔁 Richiamo finale', sotto: 'Senza guardare: scrivi i 3 concetti chiave di oggi e una domanda d\'esame che ti faresti', min: 5 });
        return conPause;
    }
    function avvia(minuti) {
        const s = { inizio: Date.now(), minuti, voci: componi(minuti) };
        scrivi(s);
        const prima = s.voci.find(v => v.k);
        Timer.avvia({ m: prima && prima.k ? materiaDi(prima.k) : undefined, k: prima && prima.k, titolo: 'Studia ora · ' + minuti + ' min', durata: minuti });
        return s;
    }
    function segnaFatto(i) { const s = leggi(); if (!s || !s.voci[i])
        return; s.voci[i].fatto = !s.voci[i].fatto; scrivi(s); }
    function chiudi() { scrivi(null); }
    return { componi, avvia, leggi, segnaFatto, chiudi };
})();
/** Esegue una voce: apre il quiz giusto (ripasso, scheda, errore) o la prova a freddo. */
function eseguiVoce(v) {
    if (v.tipo === 'freddo' && v.k) {
        avviaProvaAFreddo(v.k);
        return;
    }
    if (v.tipo === 'carte') {
        avviaCarte(undefined, 'Flashcard');
        return;
    }
    if (v.id) {
        const t = trovaScheda(v.id);
        if (t) {
            apriScheda(t.pk, t.m, t.micro, t.s, v.tipo === 'ripasso' || v.tipo === 'errore');
            return;
        }
    }
    avviso(v.sotto, 8000);
}
function apriStudiaOra() {
    const s = StudiaOra.leggi();
    if (s) {
        apriSessione();
        return;
    }
    let minuti = 50;
    const corpo = h('div.modulo');
    const disegnaS = () => {
        svuota(corpo);
        const voci = StudiaOra.componi(minuti);
        [
            h('div.gruppo-titolo', null, 'Quanto tempo hai?'),
            h('div.chips', null, [25, 50, 90].map(m => h('button.chip' + (m === minuti ? '.attivo' : ''), { onclick: () => { minuti = m; disegnaS(); } }, m + ' min'))),
            h('div.gruppo-titolo', null, 'La tua sessione'),
            h('div.gruppo', null, voci.map(v => h('div.widget-riga', null, h('span.nome', null, v.titolo, h('div.tenue.piccolo', null, v.sotto)), h('span.tenue.piccolo', null, v.min + "'")))),
            h('div.tenue.piccolo', null, 'Prima i ripassi più a rischio, poi lo step di oggi, poi gli errori; si chiude con un richiamo a memoria. Silenzia il telefono (Full immersion).'),
        ].forEach(el => corpo.appendChild(el));
    };
    disegnaS();
    foglio({ titolo: '▶ Studia ora', corpo, etichettaSalva: 'Inizia', salva: () => { StudiaOra.avvia(minuti); setTimeout(apriSessione, 50); } });
}
function apriSessione() {
    const corpo = h('div.modulo');
    const disegnaS = () => {
        const s = StudiaOra.leggi();
        svuota(corpo);
        if (!s)
            return;
        const prossima = s.voci.findIndex(v => !v.fatto), fatte = s.voci.filter(v => v.fatto).length;
        [
            h('div.tenue.piccolo', null, fatte + ' di ' + s.voci.length + ' fatte · ' + s.minuti + ' minuti · iniziata alle ' + hm(new Date(s.inizio))),
            barra(fatte, s.voci.length),
            h('div.gruppo', null, s.voci.map((v, i) => h('div.voce-lista.task' + (v.fatto ? '.fatto' : '') + (i === prossima ? '.sessione-ora' : ''), null, h('button.spunta' + (v.fatto ? '.on' : ''), { 'aria-label': v.fatto ? 'Da fare' : 'Fatto', onclick: () => { StudiaOra.segnaFatto(i); disegnaS(); } }, v.fatto ? '✓' : ''), h('button.voce-corpo', { onclick: () => eseguiVoce(v) }, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, v.titolo), h('span.voce-sotto', null, v.sotto + ' · ' + v.min + "'"))))),
            prossima >= 0 ? h('div.bottoni', null, h('button.btn', { onclick: () => eseguiVoce(s.voci[prossima]) }, '▶ ' + s.voci[prossima].titolo.replace(/^\S+\s/, ''))) : h('div.vuoto', null, '🎉 Sessione completata. Ora 5 minuti di pausa tranquilla, senza schermo.'),
        ].forEach(el => corpo.appendChild(el));
    };
    disegnaS();
    foglio({ titolo: 'Sessione in corso', corpo, etichettaSalva: 'Termina', salva: () => { StudiaOra.chiudi(); avviso('Sessione chiusa.'); } });
}
/** Riquadro in cima a Oggi. */
function widgetStudiaOra() {
    const s = StudiaOra.leggi();
    if (s) {
        const prossima = s.voci.find(v => !v.fatto), fatte = s.voci.filter(v => v.fatto).length;
        return h('section.card', null, h('button.btn.studia-ora', { onclick: apriSessione }, '▶ Sessione in corso · ' + fatte + '/' + s.voci.length), prossima ? h('div.tenue.piccolo', { style: { marginTop: '6px' } }, 'Prossima: ' + prossima.titolo) : null);
    }
    return h('section.card', null, h('button.btn.studia-ora', { onclick: apriStudiaOra }, '▶ Studia ora'), h('div.tenue.piccolo', { style: { marginTop: '6px' } }, 'Scegli quanto tempo hai: l\'app compone la sessione migliore.'));
}

// ============================================================
// 07-studio.ts — Modulo STUDIO.
// - Pacchetti studio (formato v1, docs/formato-studio.md): arrivano dal sito
//   (studio/*.json, generati da studio/genera.mjs) e dalla cartella Drive
//   "Calendario personale/studio". Salvati come record type 'pacchetto'.
// - I PROGRESSI sono record separati (type 'progresso', id 'prog-<idScheda>'):
//   aggiornare un pacchetto non li tocca mai.
// - Piano → calendario: i giorni del piano compaiono come blocchi "Studio".
//   Uno step spostato è un record type 'spostamento' (id 'sp-<chiave>').
// ============================================================
// ---------- Materie (generiche) ----------
// Una materia ha un CODICE di lettere maiuscole (C, B, F, ANA, STAT…). Le chiavi dei sotto-step sono
// codice + numero ("C2.3", "ANA1.2"). Nome, sigla e colore vengono, in ordine: dal record 'materia'
// (modificabile dall'utente), dal pacchetto che la contiene, dai valori di base sotto.
const MATERIE_BASE = {
    C: { nome: 'Chimica', breve: 'Chi', colore: '#e9a23b' }, B: { nome: 'Biologia', breve: 'Bio', colore: '#2fbf8f' }, F: { nome: 'Fisica', breve: 'Fis', colore: '#6c8cff' },
};
const PALETTE_MATERIE = ['#e9a23b', '#2fbf8f', '#6c8cff', '#f0708a', '#a78bfa', '#38bdf8', '#f97316', '#14b8a6', '#eab308', '#ec4899'];
function materiaDi(k) { const m = /^([A-Z]+)/.exec(k || ''); return m ? m[1] : ''; }
function infoMateria(code) {
    const r = Stato.prendi('mat-' + code);
    const base = MATERIE_BASE[code];
    let nome = r ? r.nome : base ? base.nome : '', colore = r ? r.colore : base ? base.colore : '';
    if (!nome || !colore)
        for (const pk of Studio.pkStep()) {
            const m = pk.materie.find(x => x.m === code);
            if (m) {
                nome = nome || m.nome;
                colore = colore || m.colore || '';
                break;
            }
        }
    if (!colore) {
        let hsh = 0;
        for (const ch of code)
            hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
        colore = PALETTE_MATERIE[hsh % PALETTE_MATERIE.length];
    }
    nome = nome || code;
    return { nome, breve: (r && r.breve) || (base && base.breve) || nome.slice(0, 3), colore };
}
const nomeMateria = (c) => infoMateria(c).nome;
const coloreMateria = (c) => infoMateria(c).colore;
/** Colore di una chiave di step ("C2.3") o grigio per le voci speciali. */
const coloreChiave = (k) => materiaDi(k) ? coloreMateria(materiaDi(k)) : '#7c8597';
/** v0.20: ogni materia ha anche una FORMA (non solo un colore): si riconosce anche senza distinguere i colori. */
const FORME_BASE = { C: '◆', B: '●', F: '▲' };
const FORME = ['■', '★', '⬟', '⬢', '✚', '◗'];
function formaMateria(code) { if (FORME_BASE[code])
    return FORME_BASE[code]; let x = 0; for (const ch of code)
    x = (x * 31 + ch.charCodeAt(0)) >>> 0; return FORME[x % FORME.length]; }
const formaChiave = (k) => materiaDi(k) ? formaMateria(materiaDi(k)) : '';
function segnoMateria(k) { const f = formaChiave(k); return f ? h('span.forma-mat', { style: { color: coloreChiave(k) }, 'aria-hidden': 'true' }, f) : null; }
const Studio = (() => {
    /**
     * "Piani" ricavati da altri dati: i corsi creati dall'utente (sotto-step con data) e gli esami.
     * Così compaiono nel calendario, in Oggi e nel ritardo come gli step del piano principale.
     */
    function pianiVirtuali() {
        const out = [];
        for (const pk of pkStep().filter(p => p.proprio)) {
            const giorni = [];
            for (const m of pk.materie)
                for (const s of m.sottostep)
                    if (s.data)
                        giorni.push({ data: s.data, voci: [{ k: s.k, t: s.titolo }] });
            if (giorni.length)
                out.push({ tipo: 'piano', id: 'v-' + pk.id, titolo: pk.titolo, aggiornato: pk.aggiornato, giorniTeoria: 0, giorni });
        }
        const esami = Stato.tutti('esame');
        if (esami.length)
            out.push({ tipo: 'piano', id: 'v-esami', titolo: 'Esami', aggiornato: '', giorniTeoria: 0,
                giorni: esami.map(e => ({ data: e.data, voci: [{ k: 'ESAME-' + e.id, t: '🎓 ' + e.nome + (e.ora ? ' · ' + e.ora : ''), d: e.nota || 'Esame', speciale: true }] })) });
        return out;
    }
    // v0.17: risultati memorizzati finché i dati non cambiano (Stato.ver)
    const memo = (f) => { let v = -1, x; return () => { if (v !== Stato.ver) {
        x = f();
        v = Stato.ver;
    } return x; }; };
    const pkStepM = memo(() => Stato.tutti('pacchetto').map(r => r.contenuto).filter(c => c && c.tipo === 'step').sort((a, b) => a.step - b.step));
    function pkStep() { return pkStepM().slice(); }
    const pkPianiM = memo(() => Stato.tutti('pacchetto').map(r => r.contenuto).filter(c => c && c.tipo === 'piano').sort((a, b) => (a.giorni[0] || { data: '' }).data < (b.giorni[0] || { data: '' }).data ? -1 : 1));
    function pkPiani() { return pkPianiM().slice(); }
    /** v0.20.1: piani visibili in Oggi, calendario, ritardi e ripassi (quelli nascosti restano solo nella vista Piano). */
    const nascosto = (id) => (imp().pianiNascosti || []).includes(id);
    function pianiAttivi() { return pkPianiM().filter(p => !nascosto(p.id)); }
    function nascondiPiano(id, si) { const i = imp(), l = (i.pianiNascosti || []).filter((x) => x !== id); if (si)
        l.push(id); i.pianiNascosti = l; Stato.salva(i, true); }
    /** Il piano principale (teoria). */
    function pkPiano() { return pkPiani().find(p => p.id === 'piano') || pkPiani()[0] || null; }
    /** Inserisce/aggiorna un pacchetto. I progressi stanno altrove: non si perdono. */
    function importa(c, daSito = false) {
        if (!c || c.formato !== 'pacchetto-studio' || !c.id || !c.tipo)
            return false;
        const id = 'pk-' + c.id, mio = Stato.rec.get(id);
        if (mio && !mio.deleted && JSON.stringify(mio.contenuto) === JSON.stringify(c))
            return false;
        // mai sostituire un pacchetto con una versione più vecchia (es. sito vs Drive)
        if (mio && !mio.deleted && mio.contenuto && String(mio.contenuto.aggiornato || '') > String(c.aggiornato || ''))
            return false;
        Stato.salva({ id, type: 'pacchetto', updatedAt: 0, contenuto: c, daSito: daSito || undefined });
        // esami indicati dal pacchetto: creati una volta sola (poi li gestisce l'utente)
        for (const e of c.esami || [])
            if (e && e.id && !Stato.rec.has(e.id))
                Stato.salva({ id: e.id, type: 'esame', updatedAt: 0, nome: e.nome, data: e.data, ora: e.ora, daSito: daSito || undefined });
        return true;
    }
    /** Pacchetti distribuiti col sito (base di partenza). */
    async function caricaDalSito() {
        if (!Drive.eProprietario())
            return; // v0.26: il programma del sito è solo del proprietario
        try {
            const r = await fetch('studio/indice.json', { cache: 'no-cache' });
            if (!r.ok)
                return;
            for (const f of await r.json()) {
                const p = await fetch('studio/' + f, { cache: 'no-cache' });
                if (p.ok)
                    importa(await p.json(), true);
            }
        }
        catch (_) { /* offline o anteprima */ }
    }
    /** v0.26: il secondo account non deve ereditare il programma del sito caricato prima dell'accesso. */
    function togliSito() {
        let n = 0;
        for (const r of Stato.rec.values())
            if (r.daSito && !r.deleted) {
                Stato.elimina(r.id);
                n++;
            }
        return n;
    }
    /** Pacchetti nella cartella Drive dell'app (quelli creati da Claude in futuro). */
    async function caricaDaDrive() {
        await Drive.preparaCartelle();
        let n = 0;
        for (const f of await Drive.elencaTutti(Drive.idCartella('studio'))) {
            if (!/\.json$/i.test(f.name))
                continue;
            try {
                if (importa(JSON.parse(await Drive.scaricaTesto(f.id))))
                    n++;
            }
            catch (_) {
                avviso('Pacchetto non leggibile: ' + f.name);
            }
        }
        return n;
    }
    function prog(id) { return Stato.prendi('prog-' + id); }
    function fatta(id) { const p = prog(id); return !!(p && p.fatta); }
    function segna(id, mod) {
        const p = prog(id) || { id: 'prog-' + id, type: 'progresso', updatedAt: 0, fatta: false };
        Object.assign(p, mod);
        if (p.fatta && !p.data)
            p.data = ymd(new Date());
        Stato.salva(p);
        if (!id.startsWith('step-') && typeof Ripassi !== 'undefined')
            Ripassi.registra(id, p); // v0.7: ripasso FSRS
    }
    /** Pagine del libro: '141-144,146' o appendice 'A1-A4'. Restituisce stringhe ('141', 'A2'). */
    const cachePagine = new Map(); // v0.17: stessa stringa → stesso risultato
    function pagineSet(s) {
        const c = cachePagine.get(s || '');
        if (c)
            return new Set(c);
        const o = new Set();
        for (const p of (s || '').split(',').map(x => x.trim()).filter(Boolean)) {
            const m = p.match(/^([A-Z]?)(\d+)(?:-[A-Z]?(\d+))?$/);
            if (!m)
                continue;
            for (let i = +m[2]; i <= +(m[3] || m[2]); i++)
                o.add(m[1] + i);
        }
        cachePagine.set(s || '', Array.from(o));
        return o;
    }
    function intervalli(set) {
        const ord = (x) => /^\d/.test(x) ? +x : 100000 + +x.slice(1);
        const v = Array.from(set).sort((a, b) => ord(a) - ord(b)), out = [];
        for (let i = 0; i < v.length; i++) {
            let j = i;
            while (j + 1 < v.length && ord(v[j + 1]) === ord(v[j]) + 1)
                j++;
            out.push(i === j ? v[i] : v[i] + '–' + v[j]);
            i = j;
        }
        return out.join(', ');
    }
    function unione(l) { const o = new Set(); l.forEach(s => pagineSet(s.pagine).forEach(p => o.add(p))); return o; }
    /** Numeri di un insieme di schede (come nella tabella riepilogo della scheda PDF). */
    function numeri(l) {
        const P = l.filter(s => s.tipo === 'P'), R = l.filter(s => s.tipo === 'R');
        return { P: P.length, R: R.length, Pf: P.filter(s => fatta(s.id)).length, Rf: R.filter(s => fatta(s.id)).length,
            pagP: unione(P), pagR: unione(R), pagT: unione(l), pagLette: unione(l.filter(s => fatta(s.id))) };
    }
    function schedeDi(s) { return s.microstep.flatMap(m => m.schede); }
    const indiceSotto = memo(() => { const m = new Map(); for (const pk of pkStepM())
        for (const mat of pk.materie)
            for (const sub of mat.sottostep)
                if (!m.has(sub.k))
                    m.set(sub.k, { pk, mat, sub }); return m; });
    function trovaSotto(k) {
        const x = indiceSotto().get(k);
        if (x)
            return x;
        return null;
    }
    function etichetta(k) { const m = /^([A-Z]+)(\d.*)$/.exec(k); return m ? infoMateria(m[1]).breve + ' ' + m[2] : k; }
    // ---------- Piano ----------
    // Chiavi degli spostamenti: 'sp-<k>' per il piano principale, 'sp-<idPiano>-<k>' per gli altri.
    const idSp = (k, pid = 'piano') => pid === 'piano' ? 'sp-' + k : 'sp-' + pid + '-' + k;
    function dataVoce(v, g, pid = 'piano') { const sp = Stato.prendi(idSp(v.k, pid)); return sp ? sp.data : g.data; }
    /**
     * Uno step è completato quando tutte le sue prioritarie sono fatte; nel piano di raffinamento
     * quando sono fatte anche tutte le schede di raffinamento. Senza pacchetto si spunta a mano.
     */
    function stepFatto(k, p) {
        const t = trovaSotto(k), raff = !!(p && p.modo === 'raffinamento');
        if (t) {
            const n = numeri(schedeDi(t.sub));
            return raff ? n.R + n.P > 0 && n.Rf === n.R && n.Pf === n.P : n.P > 0 && n.Pf === n.P;
        }
        return fatta(raff ? 'step-raff-' + k : 'step-' + k);
    }
    function segnaStepAMano(k, p, si) { segna(p.modo === 'raffinamento' ? 'step-raff-' + k : 'step-' + k, { fatta: si }); }
    function vociDelGiorno(g) {
        const k = ymd(g), out = [];
        for (const p of [...pianiAttivi(), ...pianiVirtuali()])
            for (const gg of p.giorni)
                for (const v of gg.voci)
                    if (dataVoce(v, gg, p.id) === k)
                        out.push({ v, g: gg, spostata: gg.data !== k, p });
        return out;
    }
    /** Step (non speciali) con data già passata e non completati, in tutti i piani. */
    function inRitardo() {
        const oggiK = ymd(oggi()), out = [];
        for (const p of [...pianiAttivi(), ...pianiVirtuali()])
            for (const g of p.giorni)
                for (const v of g.voci)
                    if (!v.speciale && dataVoce(v, g, p.id) < oggiK && !stepFatto(v.k, p))
                        out.push(v);
        return out;
    }
    function sposta(k, data, pid = 'piano') {
        const id = idSp(k, pid);
        if (data)
            Stato.salva({ id, type: 'spostamento', updatedAt: 0, data });
        else if (Stato.rec.get(id))
            Stato.elimina(id);
    }
    // ---------- Risorse su Drive ----------
    const cacheElenchi = {};
    async function elenco(cartella) {
        if (!cacheElenchi[cartella])
            cacheElenchi[cartella] = await Drive.elencaTutti(cartella);
        return cacheElenchi[cartella];
    }
    /** Trova il file quiz di una scheda nella cartella "<materia> quiz" (per microstep + "scheda k di n"). */
    async function idQuiz(pk, m, micro, s) {
        if (s.quizFileId)
            return s.quizFileId;
        const coda = '(scheda ' + s.k + ' di ' + s.n + ').html';
        const f = (await elenco(pk.risorse.quiz[m])).filter(x => x.name.startsWith(micro + ' ') && x.name.endsWith(coda));
        const esatto = f.find(x => x.name === s.quizFile);
        if (!f.length)
            throw new Error('Quiz non trovato su Drive: ' + s.quizFile);
        return (esatto || f[0]).id;
    }
    /** Pagina del libro → file PDF diviso + pagina dentro al file. */
    async function pdfPagina(pk, m, pagLibro) {
        const L = pk.risorse.libri[m], ass = pagLibro + L.offset, primo = Math.floor((ass - 1) / L.blocco) * L.blocco + 1;
        let id = L.file[String(primo)];
        const pref = String(primo).padStart(3, '0');
        if (!id) {
            const f = (await elenco(L.cartella)).find(x => x.name.startsWith(pref) && /\.pdf$/i.test(x.name));
            if (!f)
                throw new Error('PDF del libro non trovato (inizio ' + pref + ').');
            id = f.id;
        }
        return { id, pagina: ass - primo + 1, nome: L.nome + ' p. ' + pagLibro };
    }
    return { togliSito, pkStep, pkPiano, pkPiani, pianiAttivi, nascosto, nascondiPiano, pianiVirtuali, segnaStepAMano, importa, caricaDalSito, caricaDaDrive, prog, fatta, segna, pagineSet, intervalli, numeri, schedeDi, trovaSotto, etichetta,
        dataVoce, stepFatto, vociDelGiorno, inRitardo, sposta, idQuiz, pdfPagina };
})();
// ---------- Visore a tutto schermo (quiz e PDF) ----------
function visore(titolo, alChiudi) {
    const corpo = h('div.visore-corpo'), barra = h('div.visore-strumenti');
    const chiudi = () => { el.remove(); if (alChiudi)
        alChiudi(); };
    const el = h('div.visore', null, h('div.visore-testa', null, h('button.btn-testo', { onclick: chiudi }, 'Chiudi'), h('div.foglio-titolo.visore-titolo', null, titolo), barra), corpo);
    document.body.appendChild(el);
    return { corpo, barra, chiudi };
}
function serveGoogle() {
    if (Drive.pronto)
        return false;
    Drive.login();
    avviso('Accedi a Google, poi tocca di nuovo.');
    return true;
}
/** Apre una mini-app quiz HTML dentro l'app, in un iframe isolato (sandbox). Il file su Drive non viene modificato. */
async function apriQuiz(pk, m, micro, s, cb) {
    // Schede dei corsi propri: file qualsiasi (PDF → visore, HTML → iframe, altro → link)
    if (s.file && !(s.file.mime || '').includes('html') && !/\.html?$/i.test(s.file.nome)) {
        if (s.file.id && /pdf/i.test(s.file.mime || s.file.nome)) {
            if (serveGoogle())
                return;
            apriPdf(s.file.id, 1, s.file.nome);
            return;
        }
        if (s.file.url) {
            window.open(s.file.url, '_blank', 'noopener');
            return;
        }
    }
    if (s.file && s.file.id)
        s = { ...s, quizFileId: s.file.id };
    if (!s.quizFileId && !s.file && pk.proprio) {
        avviso('Questa scheda non ha un file collegato.');
        return;
    }
    if (serveGoogle())
        return;
    const v = visore((cb ? '🧊 ' : '') + micro + ' · scheda ' + s.k + '/' + s.n, () => { if (!cb)
        apriScheda(pk, m, micro, s);
    else
        disegna(); });
    v.corpo.appendChild(h('div.vuoto.centro', null, 'Scarico il quiz da Drive…'));
    try {
        let html = await Drive.scaricaTesto(await Studio.idQuiz(pk, m, micro, s));
        // Nell'iframe isolato localStorage non esiste: ne fornisco uno in memoria, solo a schermo.
        const toppa = '<script>try{window.localStorage.getItem("x")}catch(e){(function(){var m={};var s={getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}}};try{Object.defineProperty(window,"localStorage",{value:s});Object.defineProperty(window,"sessionStorage",{value:s})}catch(_){}})()}<\/script>';
        html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, x => x + toppa) : html.replace(/<html[^>]*>/i, x => x + toppa);
        html = Cattura.inietta(html); // v0.9: legge il risultato finale (il file su Drive non cambia)
        html = Spiega.inietta(html); // v0.21: riquadro «✨ Spiegazione AI» sotto la correzione
        svuota(v.corpo);
        const fr = h('iframe.visore-frame', { sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals', srcdoc: html, title: s.titolo });
        v.corpo.appendChild(fr);
        Cattura.osserva(fr, s.id, s.titolo, cb);
    }
    catch (e) {
        svuota(v.corpo);
        v.corpo.appendChild(h('div.vuoto.centro', null, String(e.message || e)));
    }
}
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
/**
 * Cache dei PDF dei libri sul dispositivo (Cache Storage): il primo apertura scarica il file intero
 * mostrando l'avanzamento, le successive sono istantanee e funzionano anche offline.
 * Tiene al massimo MAX file (i meno usati escono per primi).
 */
const PdfCache = (() => {
    const NOME = 'imc-pdf', MAX = 10, CH = 'imc-pdf-uso';
    const url = (id) => location.origin + '/__pdf/' + id;
    const uso = () => { try {
        return JSON.parse(localStorage.getItem(CH) || '{}');
    }
    catch (_) {
        return {};
    } };
    const segna = (u) => { try {
        localStorage.setItem(CH, JSON.stringify(u));
    }
    catch (_) { /* niente */ } };
    async function cache() { try {
        return await caches.open(NOME);
    }
    catch (_) {
        return null;
    } }
    async function presente(id) { const c = await cache(); return !!(c && await c.match(url(id))); }
    async function prendi(id, avanz) {
        const c = await cache(), u = uso();
        const vecchia = c && await c.match(url(id));
        if (vecchia) {
            u[id] = Date.now();
            segna(u);
            return new Uint8Array(await vecchia.arrayBuffer());
        }
        const token = await Drive.tokenValido(false);
        if (!token)
            throw new Error('Accedi a Google per scaricare il PDF.');
        const r = await fetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media', { headers: { Authorization: 'Bearer ' + token } });
        if (!r.ok || !r.body)
            throw new Error('Download non riuscito (' + r.status + ').');
        const tot = parseInt(r.headers.get('content-length') || '0', 10), pezzi = [], lettore = r.body.getReader();
        let fatti = 0;
        for (;;) {
            const { done, value } = await lettore.read();
            if (done)
                break;
            pezzi.push(value);
            fatti += value.length;
            if (avanz)
                avanz(fatti, tot);
        }
        const tutto = new Uint8Array(fatti);
        let pos = 0;
        for (const p of pezzi) {
            tutto.set(p, pos);
            pos += p.length;
        }
        if (c) {
            try {
                await c.put(url(id), new Response(tutto.slice(0), { headers: { 'content-type': 'application/pdf' } }));
                u[id] = Date.now();
                for (const vecchio of Object.keys(u).sort((a, b) => u[b] - u[a]).slice(MAX)) {
                    await c.delete(url(vecchio));
                    delete u[vecchio];
                }
                segna(u);
            }
            catch (_) { /* spazio esaurito: lo uso senza salvarlo */ }
        }
        return tutto;
    }
    return { prendi, presente };
})();
/** Visualizzatore PDF integrato (pdf.js), alla pagina indicata. */
async function apriPdf(fileId, pagina, titolo) {
    if (serveGoogle())
        return;
    const v = visore(titolo);
    const stato = h('div.vuoto.centro', null, 'Apro il PDF…');
    v.corpo.appendChild(stato);
    try {
        await new Promise((ok, ko) => { if (typeof pdfjsLib !== 'undefined')
            return ok(); const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js'; s.onload = () => ok(); s.onerror = () => ko(new Error('Impossibile caricare il lettore PDF (serve la rete).')); document.head.appendChild(s); });
        pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
        const dati = await PdfCache.prendi(fileId, (f, t) => { stato.textContent = 'Scarico il PDF… ' + (t ? Math.round(f / t * 100) + '%' : Math.round(f / 1048576) + ' MB') + ' (solo la prima volta)'; });
        stato.textContent = 'Apro il PDF…';
        const doc = await pdfjsLib.getDocument({ data: dati }).promise;
        let p = Math.min(Math.max(1, pagina), doc.numPages), zoom = 1, giro = 0;
        const tela = h('canvas.pdf-tela'), num = h('span.pdf-num');
        async function mostra() {
            const mio = ++giro;
            num.textContent = p + ' / ' + doc.numPages;
            const pag = await doc.getPage(p);
            if (mio !== giro)
                return;
            const larg = v.corpo.clientWidth - 8, base = pag.getViewport({ scale: 1 });
            const dpr = Math.min(window.devicePixelRatio || 1, 2), scala = (larg / base.width) * zoom;
            const vp = pag.getViewport({ scale: scala * dpr });
            tela.width = vp.width;
            tela.height = vp.height;
            tela.style.width = vp.width / dpr + 'px';
            await pag.render({ canvasContext: tela.getContext('2d'), viewport: vp }).promise;
        }
        svuota(v.corpo);
        v.corpo.classList.add('pdf');
        v.corpo.appendChild(tela);
        aggiungi(v.barra, [
            h('button.btn-ico', { 'aria-label': 'Pagina precedente', onclick: () => { if (p > 1) {
                    p--;
                    v.corpo.scrollTop = 0;
                    mostra();
                } } }, icona('sx')), num,
            h('button.btn-ico', { 'aria-label': 'Pagina successiva', onclick: () => { if (p < doc.numPages) {
                    p++;
                    v.corpo.scrollTop = 0;
                    mostra();
                } } }, icona('dx')),
            h('button.btn-ico', { 'aria-label': 'Ingrandisci', onclick: () => { zoom = zoom >= 2.5 ? 1 : zoom + 0.5; mostra(); } }, icona('cerca')),
        ]);
        await mostra();
    }
    catch (e) {
        stato.textContent = 'Non riesco ad aprire il PDF: ' + String(e.message || e);
        if (!stato.isConnected) {
            svuota(v.corpo);
            v.corpo.appendChild(stato);
        }
    }
}
/** Foglio di una scheda: fatta, data, punteggio, nota errori, quiz, pagine del libro. */
function apriScheda(pk, m, micro, s, ripasso = false) {
    const p = Studio.prog(s.id);
    // Ripasso (v0.7): data di oggi e punteggio vuoto; si salva solo se scrivi il nuovo punteggio.
    const fatta = h('input', { type: 'checkbox', checked: !!(p && p.fatta) });
    const data = h('input', { type: 'date', value: ripasso ? ymd(new Date()) : p && p.data || '' });
    const punti = h('input', { type: 'number', min: '0', max: '100', inputMode: 'numeric', placeholder: ripasso && p && p.punteggio != null ? 'prima ' + p.punteggio + '%' : '%', value: !ripasso && p && p.punteggio != null ? String(p.punteggio) : '' });
    const nota = h('textarea', { rows: 3, placeholder: 'Errori, cose da rivedere…', value: p && p.nota || '' });
    const rifare = h('input', { type: 'checkbox', checked: !!(p && p.daRifare) });
    punti.oninput = () => { if (punti.value !== '')
        fatta.checked = true; };
    const L = pk.risorse.libri[m] || { nome: mat0(pk, m).libro || 'libro' };
    const blocchi = Studio.intervalli(Studio.pagineSet(s.pagine)).split(', ').filter(Boolean);
    const apribili = pk.risorse.libri[m] ? blocchi.filter(b => /^\d/.test(b)) : [];
    const f = foglio({
        titolo: (ripasso ? '🧠 Ripasso · ' : '') + micro + ' · scheda ' + s.k + '/' + s.n,
        corpo: h('div.modulo', null, h('div.gruppo', { style: { padding: '12px 14px' } }, h('div.voce-titolo', { style: { whiteSpace: 'normal' } }, s.titolo), h('div.chips', { style: { marginTop: '8px' } }, h('span.etichetta.' + (s.tipo === 'P' ? 'prior' : 'raff'), null, s.tipo === 'P' ? 'PRIORITARIA' : 'RAFFINAMENTO'), s.problemi ? h('span.etichetta', null, 'Problemi da risolvere') : null)), h('div.bottoni', null, h('button.btn', { onclick: () => { salva(); f.chiudi(); apriQuiz(pk, m, micro, s); } }, pk.proprio ? (s.file ? 'Apri il file' : 'Nessun file') : 'Apri il quiz'), pk.proprio ? null : h('button.btn.neutro', { onclick: () => { salva(); f.chiudi(); QuizApp.apri(pk, m, micro, s); } }, '🧩 Quiz nell\'app'), Generatori.per(m, micro).length ? h('button.btn.neutro', { onclick: () => { salva(); f.chiudi(); QuizApp.apri(pk, m, micro, s, () => Generatori.serie(m, micro)); } }, '🎲 Esercizi nuovi') : null, pk.proprio ? null : h('button.btn.neutro', { onclick: () => { salva(); f.chiudi(); AIGen.avvia(pk, m, micro, s); } }, '🤖 Domande AI'), h('button.btn.neutro', { onclick: () => { salva(); f.chiudi(); Timer.avvia({ m, k: m + micro.split('.').slice(0, 2).join('.'), schedaId: s.id, titolo: s.titolo }); } }, '▶ Timer')), pk.proprio ? h('button.btn-testo', { onclick: () => { f.chiudi(); editorSchedaPropria(pk, mat0(pk, m), mat0(pk, m).sottostep.find(ss => ss.microstep.some(mm => mm.schede.some(x => x.id === s.id))), s); } }, 'Modifica scheda') : null, h('div.gruppo', null, riga('Fatta', fatta), riga('Data', data), riga('Punteggio %', punti), riga('Da rifare', rifare)), ripasso ? h('div.tenue.piccolo', null, 'Rifai il quiz senza guardare gli appunti, poi scrivi il nuovo punteggio: l\'app calcola il prossimo ripasso.') : h('div.tenue.piccolo', null, 'Con un punteggio sotto il ' + sogliaErrori() + '% la scheda va da sola in Studio → Errori.'), h('div.gruppo', null, h('div.gruppo-titolo', null, 'Nota errori'), nota), h('div.gruppo', null, h('div.gruppo-titolo', null, blocchi.length ? 'Libro (' + L.nome + ') — pp. ' + blocchi.join(', ') : 'Nessuna pagina del libro'), h('div.chips', { style: { margin: '4px 0 10px' } }, apribili.map(b => {
            const pag = parseInt(b, 10);
            return h('button.chip', { onclick: async () => {
                    if (serveGoogle())
                        return;
                    try {
                        const r = await Studio.pdfPagina(pk, m, pag);
                        apriPdf(r.id, r.pagina, r.nome);
                    }
                    catch (e) {
                        avviso(String(e.message || e), 6000);
                    }
                } }, 'Apri p. ' + b);
        })), s.slide ? h('div.tenue.piccolo', { style: { paddingBottom: '10px' } }, 'Slide docenti — ' + s.slide) : null)),
        salva: () => { salva(); },
    });
    function salva() {
        if (ripasso && punti.value === '')
            return; // aprire un ripasso senza punteggio non conta
        const v = punti.value === '' ? undefined : Math.max(0, Math.min(100, parseInt(punti.value, 10) || 0));
        const prima = JSON.stringify([!!(p && p.fatta), p && p.data || '', p && p.punteggio, p && p.nota || '', !!(p && p.daRifare)]);
        if (prima === JSON.stringify([fatta.checked, data.value, v, nota.value, rifare.checked]))
            return;
        Studio.segna(s.id, { fatta: fatta.checked, data: data.value || undefined, punteggio: v, nota: nota.value || undefined, daRifare: rifare.checked });
    }
}
/** Foglio per spostare uno step del piano su un altro giorno (i progressi restano). */
function apriSposta(v, g, p) {
    const attuale = Studio.dataVoce(v, g, p.id);
    const data = h('input', { type: 'date', value: attuale });
    const riserve = p.giorni.filter(x => x.voci.some(y => /^RISERVA/.test(y.k)) || x.nota && /leggero/i.test(x.nota));
    const f = foglio({
        titolo: 'Sposta ' + Studio.etichetta(v.k),
        corpo: h('div.modulo', null, h('div.gruppo', { style: { padding: '12px 14px' } }, h('div.voce-titolo', { style: { whiteSpace: 'normal' } }, v.t), h('div.tenue.piccolo', null, 'Nel piano: ' + dataLunga(daYmd(g.data)))), h('div.gruppo', null, riga('Nuovo giorno', data), h('div.chips', { style: { margin: '4px 0 10px' } }, riserve.map(r => h('button.chip', { onclick: () => { data.value = r.data; } }, fmt(daYmd(r.data), { day: 'numeric', month: 'short' }) + (r.voci[0].speciale ? ' · ' + r.voci[0].t : ' · leggero'))))), attuale !== g.data ? h('button.btn.neutro', { onclick: () => { Studio.sposta(v.k, null, p.id); f.chiudi(); } }, 'Rimetti al giorno del piano') : null),
        salva: () => { if (data.value)
            Studio.sposta(v.k, data.value === g.data ? null : data.value, p.id); },
    });
}
function barra(fatte, tot, colore) {
    return h('div.barra-av', { role: 'progressbar', 'aria-valuenow': String(fatte), 'aria-valuemax': String(tot) }, h('div', { style: { width: (tot ? (fatte / tot) * 100 : 0) + '%', background: colore || 'var(--accento)' } }));
}
/** Riga "blocco studio" per Oggi / calendario. */
function rigaStudio(x) {
    const raff = x.p.modo === 'raffinamento', fatto = !x.v.speciale && Studio.stepFatto(x.v.k, x.p), t = Studio.trovaSotto(x.v.k.replace(/^G2-/, ''));
    const sim = !!x.v.speciale && /^(SIM|VERIFICA)/.test(x.v.k); // v0.11: apre la modalità simulazione
    return h('button.voce-lista', { onclick: () => { if (sim) {
            apriSimulazioni();
            return;
        } if (t) {
            UI.studioSub = t.sub.k;
            UI.studioVista = 'schede';
            UI.studioStep = t.pk.id;
            vai('studio');
        }
        else {
            UI.studioVista = 'piano';
            UI.studioPiano = x.p.id;
            vai('studio');
        } } }, h('span.barra', { style: { background: x.v.speciale ? 'var(--tenue)' : coloreChiave(x.v.k) } }), h('span.voce-corpo', null, h('span.voce-titolo', null, x.v.speciale ? null : segnoMateria(x.v.k), (fatto ? '✓ ' : '') + (raff && !x.v.speciale ? 'Raffina ' : '') + (x.v.speciale ? x.v.t : Studio.etichetta(x.v.k) + ' · ' + x.v.t)), h('span.voce-sotto', null, x.v.speciale ? (x.v.d || '') + (/^G2-/.test(x.v.k) ? testoCarte(x.v.k.slice(3)) : '') : testoAvanzamento(x.v.k, x.p), x.spostata ? ' · spostato' : '', sim ? ' · ▶ tocca per iniziare' : '')));
}
/** "3/9 prioritarie · 19 pag." (teoria) oppure "1 · priorità ... 2 · raffina ..." (raffinamento). */
/** v0.20.2: flashcard collegate al sotto-step, da aggiungere al sottotitolo delle voci del piano. */
function testoCarte(k) {
    const mz = Carte.mazzi().filter(m => m.sub === k);
    if (!mz.length)
        return '';
    const n = Carte.conta(mz.map(m => m.id));
    return ' · 🃏 ' + (n.nuove + n.ripasso ? (n.nuove + n.ripasso) + ' carte oggi' : n.totale + ' carte');
}
function testoAvanzamento(k, p) { return testoAvanzamento0(k, p) + testoCarte(k); }
function testoAvanzamento0(k, p) {
    const t = Studio.trovaSotto(k);
    if (!t)
        return p.modo === 'raffinamento' ? 'schede in preparazione' : 'schede da creare';
    const n = Studio.numeri(Studio.schedeDi(t.sub));
    if (p.modo !== 'raffinamento')
        return n.Pf + '/' + n.P + ' prioritarie · ' + n.pagP.size + ' pag. · ' + n.R + ' raff.';
    const piu = Array.from(n.pagR).filter(x => !n.pagP.has(x)).length;
    const err = Studio.schedeDi(t.sub).filter(s => daRifare(s.id)).length;
    return '1 · priorità: ' + (err ? err + ' schede da rifare' : 'rifai le prioritarie sbagliate') + ', rileggi ' + n.pagP.size + ' pag. · 2 · raffina: ' + n.Rf + '/' + n.R + ' schede (+' + piu + ' pag.)';
}
function indicatoreStudio() {
    if (!Studio.pkPiani().length)
        return null;
    const r = Studio.inRitardo();
    const ind = h('button.indicatore.' + (r.length ? 'ritardo' : 'pari'), { onclick: () => { UI.studioVista = 'piano'; vai('studio'); } }, r.length ? 'In ritardo di ' + r.length + ' step: ' + r.map(v => Studio.etichetta(v.k)).join(', ') : 'In pari con il piano');
    // v0.10: ripianificazione in un tocco (solo piano principale)
    return Ripianifica.inRitardo().length ? h('div', null, ind, h('button.btn.neutro', { style: { marginTop: '8px', width: '100%' }, onclick: () => apriRipianifica() }, '↻ Ripianifica i ritardi')) : ind;
}
// ---------- Vista STUDIO ----------
function vistaStudio() {
    const pks = Studio.pkStep(), piano = Studio.pkPiano();
    if (UI.studioSub) {
        const t = Studio.trovaSotto(UI.studioSub);
        if (t)
            return vistaSottostep(t.pk, t.mat, t.sub);
        UI.studioSub = null;
    }
    const pk = pks.find(p => p.id === UI.studioStep) || pks[pks.length - 1];
    const voci = [['schede', 'Schede'], ['carte', 'Carte'], ['piano', 'Piano'], ['errori', 'Errori'], ['statistiche', 'Statistiche'], ['esami', 'Esami'], ['syllabus', 'Syllabus'], ['tabelle', 'Tabelle']];
    const seg = h('div.segmenti.scorre', { role: 'tablist' }, voci.map(([v, t]) => h('button' + (UI.studioVista === v ? '.attivo' : ''), { role: 'tab', onclick: () => { UI.studioVista = v; UI.pianoScorso = false; disegna(); } }, t)));
    if (UI.studioVista === 'carte')
        return h('div.pagina', null, seg, vistaCarte());
    if (UI.studioVista === 'tabelle')
        return h('div.pagina', null, seg, vistaTabelle());
    if (UI.studioVista === 'errori')
        return h('div.pagina', null, seg, vistaErrori());
    if (UI.studioVista === 'statistiche')
        return h('div.pagina', null, seg, vistaStatistiche());
    if (UI.studioVista === 'esami')
        return h('div.pagina', null, seg, vistaEsami());
    if (UI.studioVista === 'syllabus' && piano)
        return h('div.pagina', null, seg, vistaCopertura(piano));
    if (UI.studioVista === 'piano' && piano) {
        const piani = Studio.pkPiani(), scelto = piani.find(p => p.id === UI.studioPiano) || piani.find(p => { const g = p.giorni; return g.length && ymd(oggi()) <= g[g.length - 1].data; }) || piano;
        return h('div.pagina', null, seg, indicatoreStudio(), piani.length > 1 ? h('div.chips', null, piani.map(p => h('button.chip' + (p.id === scelto.id ? '.attivo' : ''), { onclick: () => { UI.studioPiano = p.id; UI.pianoScorso = false; disegna(); } }, p.titolo))) : null, scelto.nota ? h('div.tenue.piccolo', null, scelto.nota) : null, bottoniGeneratore(scelto), Ripianifica.inRitardo(ymd(new Date()), scelto).length && scelto.id !== (Studio.pkPiano() || { id: '' }).id ? h('button.btn.neutro', { onclick: () => apriRipianifica(scelto) }, '↻ Ripianifica i ritardi di questo piano') : null, vistaPiano(scelto));
    }
    if (UI.studioVista !== 'schede')
        UI.studioVista = 'schede';
    if (!pk)
        return h('div.pagina', null, seg, vuoto('Nessun corso di studio. Crea il tuo corso (qualsiasi materia o esame) oppure aggiorna i pacchetti dal Drive.'), h('button.btn', { onclick: () => editorCorso() }, '+ Nuovo corso di studio'), bottoneDrive());
    const tutte = pk.materie.flatMap(m => m.sottostep.flatMap(Studio.schedeDi)), T = Studio.numeri(tutte);
    return h('div.pagina', null, seg, indicatoreStudio(), h('div.chips', null, pks.map(p => h('button.chip' + (p.id === pk.id ? '.attivo' : ''), { onclick: () => { UI.studioStep = p.id; disegna(); } }, (p.proprio ? '★ ' : '') + p.titolo)), h('button.chip', { onclick: () => editorCorso() }, '+ Nuovo corso')), pk.proprio ? h('div.bottoni', null, h('button.btn.neutro', { onclick: () => editorCorso(pk) }, 'Modifica corso'), h('button.btn.neutro', { onclick: () => editorSottostep(pk) }, '+ Aggiungi argomento')) : null, pk.descrizione ? h('div.tenue.piccolo', null, pk.descrizione) : null, h('section.card', null, h('h2.card-titolo', null, pk.titolo + ' · totale'), h('div.numeri', null, numero(T.Pf + '/' + T.P, 'prioritarie'), numero(T.Rf + '/' + T.R, 'raffinamento'), numero(T.pagLette.size + '/' + T.pagT.size, 'pagine lette')), barra(T.Pf, T.P)), pk.materie.map(m => {
        const N = Studio.numeri(m.sottostep.flatMap(Studio.schedeDi));
        return h('section.card', null, h('h2.card-titolo', { style: { color: coloreMateria(m.m) } }, formaMateria(m.m) + ' ' + m.nome + (m.libro ? ' · ' + m.libro : '')), m.sottostep.map(s => {
            const n = Studio.numeri(Studio.schedeDi(s));
            return h('button.voce-lista.sotto', { onclick: () => { UI.studioSub = s.k; disegna(); } }, h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, s.n + ' · ' + s.titolo, chipRicordo(s.k)), h('span.voce-sotto', null, 'Prior. ' + n.Pf + '/' + n.P + ' · Raff. ' + n.Rf + '/' + n.R + ' · pag. ' + n.pagP.size + ' / ' + n.pagR.size + ' / ' + n.pagT.size), h('span.voce-sotto', null, s.posizione), barra(n.Pf, n.P, coloreMateria(m.m))), icona('dx', 18));
        }), h('div.totale-riga', null, 'Totale ' + m.nome + ': ' + N.P + ' prior. · ' + N.R + ' raff. · pag. ' + N.pagP.size + ' / ' + N.pagR.size + ' / ' + N.pagT.size));
    }), h('div.tenue.piccolo', null, 'pag. = prioritarie / raffinamento / totali (unione, non somma). Aggiornato: ' + pk.aggiornato + '.'), bottoneDrive());
}
function numero(v, eti) { return h('div.numero', null, h('strong', null, v), h('span', null, eti)); }
function bottoneDrive() {
    return h('button.btn.neutro', { onclick: async () => {
            if (serveGoogle())
                return;
            try {
                const n = await Studio.caricaDaDrive();
                avviso(n ? 'Pacchetti aggiornati da Drive: ' + n : 'Nessun pacchetto nuovo su Drive.');
            }
            catch (e) {
                avviso(String(e.message || e), 6000);
            }
        } }, 'Aggiorna pacchetti da Drive');
}
function vistaSottostep(pk, mat, sub) {
    const sch = Studio.schedeDi(sub), n = Studio.numeri(sch), col = coloreMateria(mat.m);
    const blocco = (eti, cls, k, f, pag) => h('div.blocco.' + cls, null, h('strong', null, eti), h('span', null, f + '/' + k + ' schede · ' + pag.size + ' pag.'), h('span.tenue.piccolo', null, pag.size ? (mat.libro ? mat.libro + ': ' : '') + 'pp. ' + Studio.intervalli(pag) : '—'));
    return h('div.pagina', null, h('button.btn-testo.indietro', { onclick: () => { UI.studioSub = null; disegna(); } }, '‹ ' + pk.titolo), h('section.card', null, h('h2.sub-titolo', { style: { color: col } }, mat.nome + ' ' + sub.n, chipRicordo(sub.k)), h('div.voce-titolo', { style: { whiteSpace: 'normal' } }, sub.titolo), h('div.tenue.piccolo', null, sub.posizione), sub.ripasso ? h('div.tenue.piccolo', null, 'Ripasso: ' + sub.ripasso) : null, barra(n.Pf, n.P, col), h('div.blocchi', null, blocco('PRIORITARIE', 'prior', n.P, n.Pf, n.pagP), blocco('RAFFINAMENTO', 'raff', n.R, n.Rf, n.pagR), blocco('TOTALE', 'tot', n.P + n.R, n.Pf + n.Rf, n.pagT)), h('div.tenue.piccolo', null, 'Pagine lette: ' + n.pagLette.size + ' di ' + n.pagT.size), rigaFreddo(sub.k), rigaCarte(sub.k), rigaAppunti(sub.k)), h('div.bottoni', null, h('button.btn', { onclick: () => Timer.avvia({ m: mat.m, k: sub.k, titolo: mat.nome + ' ' + sub.n + ' · ' + sub.titolo }) }, '▶ Avvia timer di studio'), pk.proprio ? h('button.btn.neutro', { onclick: () => editorSottostep(pk, mat, sub) }, 'Modifica') : null), pk.proprio ? h('button.btn.neutro', { onclick: () => editorSchedaPropria(pk, mat, sub) }, '+ Aggiungi scheda') : null, !pk.risorse.libri[mat.m] ? null : (h('button.btn.neutro', { onclick: async (e) => {
            if (serveGoogle())
                return;
            const b = e.currentTarget, ids = new Map();
            try {
                for (const p of Array.from(n.pagT).filter(x => /^\d/.test(x))) {
                    const r = await Studio.pdfPagina(pk, mat.m, +p);
                    ids.set(r.id, r.nome);
                }
                let i = 0;
                for (const id of Array.from(ids.keys())) {
                    i++;
                    await PdfCache.prendi(id, (f, t) => { b.textContent = 'Scarico PDF ' + i + '/' + ids.size + '… ' + (t ? Math.round(f / t * 100) + '%' : ''); });
                }
                b.textContent = 'PDF del libro pronti anche offline ✓';
            }
            catch (err) {
                b.textContent = 'Scarica i PDF del libro';
                avviso(String(err.message || err), 6000);
            }
        } }, 'Scarica i PDF del libro (apertura immediata)')), h('label.riga.filtro', null, h('span.riga-eti', null, 'Solo prioritarie'), h('span.interruttore', null, h('input', { type: 'checkbox', checked: UI.soloPrior, onchange: (e) => { UI.soloPrior = e.target.checked; disegna(); } }), h('span'))), sub.microstep.map(mi => {
        const lista = mi.schede.filter(s => !UI.soloPrior || s.tipo === 'P').sort((a, b) => a.k - b.k);
        if (!lista.length)
            return null;
        const mn = Studio.numeri(mi.schede);
        return h('section.card', null, h('h2.card-titolo.riga-tra', null, h('span', null, 'Microstep ' + mi.n), h('span.tenue.piccolo', null, (mn.Pf + mn.Rf) + '/' + mi.schede.length + ' · ' + mn.pagT.size + ' pag.')), barra(mn.Pf + mn.Rf, mi.schede.length, col), lista.map(s => {
            const p = Studio.prog(s.id), ok = !!(p && p.fatta);
            return h('div.voce-lista.task' + (ok ? '.fatto' : ''), null, h('button.spunta' + (ok ? '.on' : ''), { 'aria-label': ok ? 'Segna da fare' : 'Segna fatta', style: { '--c': col }, onclick: () => Studio.segna(s.id, { fatta: !ok }) }, ok ? '✓' : ''), h('button.voce-corpo', { onclick: () => apriScheda(pk, mat.m, mi.n, s) }, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, s.titolo, h('span.tenue', null, ' (' + s.k + '/' + s.n + ')')), h('span.voce-sotto', null, h('span.etichetta.' + (s.tipo === 'P' ? 'prior' : 'raff'), null, s.tipo === 'P' ? 'PRIOR.' : 'RAFF.'), s.problemi ? ' problemi ·' : '', ' pp. ' + Studio.intervalli(Studio.pagineSet(s.pagine)), p && p.punteggio != null ? ' · ' + p.punteggio + '%' : '', p && p.nota ? ' · 📝' : '')));
        }));
    }));
}
function vistaPiano(piano) {
    const oggiK = ymd(oggi()), lista = h('div.agenda');
    // raggruppo per data effettiva (tenendo conto degli spostamenti)
    const perData = new Map();
    for (const g of piano.giorni) {
        if (!perData.has(g.data))
            perData.set(g.data, []);
        for (const v of g.voci) {
            const d = Studio.dataVoce(v, g, piano.id);
            if (!perData.has(d))
                perData.set(d, []);
            perData.get(d).push({ v, g });
        }
    }
    for (const d of Array.from(perData.keys()).sort()) {
        const g = daYmd(d), gp = piano.giorni.find(x => x.data === d), voci = perData.get(d);
        lista.appendChild(h('div.agenda-giorno' + (d === oggiK ? '.oggi' : ''), { id: d === oggiK ? 'piano-oggi' : null }, h('div.agenda-data', null, h('span.agenda-num', null, String(g.getDate())), h('span.agenda-sett', null, fmt(g, { weekday: 'short' }) + ' · ' + fmt(g, { month: 'short' })), gp && gp.n ? h('span.agenda-sett', null, 'g. ' + gp.n + '/' + piano.giorniTeoria) : null), h('div.agenda-voci', null, voci.map(({ v, g: go }) => {
            const fatto = !v.speciale && Studio.stepFatto(v.k, piano), t = Studio.trovaSotto(v.k), tardi = !v.speciale && !fatto && d < oggiK;
            return h('div.voce-lista.task' + (fatto ? '.fatto' : ''), null, v.speciale ? h('span.barra', { style: { background: 'var(--tenue)' } })
                : h('button.spunta' + (fatto ? '.on' : ''), { style: { '--c': coloreChiave(v.k) }, 'aria-label': 'Step completato', onclick: () => { if (t) {
                        UI.studioSub = v.k;
                        disegna();
                    }
                    else
                        Studio.segnaStepAMano(v.k, piano, !fatto); } }, fatto ? '✓' : ''), h('button.voce-corpo', { onclick: () => { if (t) {
                    UI.studioSub = v.k;
                    disegna();
                } } }, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, v.speciale ? v.t : Studio.etichetta(v.k) + ' · ' + v.t), h('span.voce-sotto' + (tardi ? '.scaduto' : ''), { style: { whiteSpace: 'normal' } }, v.speciale ? (v.d || '') + (/^G2-/.test(v.k) ? testoCarte(v.k.slice(3)) : '') : testoAvanzamento(v.k, piano), tardi ? ' · in ritardo' : '', go.data !== d ? ' · spostato dal ' + fmt(daYmd(go.data), { day: 'numeric', month: 'short' }) : '')), v.speciale ? null : h('button.btn-testo', { onclick: () => apriSposta(v, go, piano) }, 'Sposta'));
        }), !voci.length ? h('div.tenue.piccolo', { style: { padding: '8px 0' } }, 'Step spostati altrove.') : null, gp && gp.nota ? h('div.tenue.piccolo', { style: { padding: '4px 0' } }, gp.nota) : null)));
    }
    setTimeout(() => { const el = document.getElementById('piano-oggi'); if (el && !UI.pianoScorso) {
        UI.pianoScorso = true;
        el.scrollIntoView({ block: 'start' });
    } }, 30);
    return lista;
}
// ---------- Copertura del syllabus ----------
function vistaCopertura(piano) {
    const cop = piano.copertura || [];
    if (!cop.length)
        return vuoto('Il piano non contiene la tabella di copertura.');
    const ETI = { E: ['Schede esistenti', 'stato-e'], I: ['Integrazione', 'stato-i'], N: ['Da creare', 'stato-n'] };
    const filtrate = cop.filter(c => (!UI.copMateria || c.m === UI.copMateria) && (!UI.copStato || c.stato === UI.copStato));
    const conta = (st) => cop.filter(c => (!UI.copMateria || c.m === UI.copMateria) && c.stato === st).length;
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('div.chips', null, [['', 'Tutte']].concat(Array.from(new Set(cop.map(c => c.m))).map(m => [m, nomeMateria(m)])).map(([m, t]) => h('button.chip' + (UI.copMateria === m ? '.attivo' : ''), { onclick: () => { UI.copMateria = m; disegna(); } }, t))), h('div.chips', null, h('button.chip' + (!UI.copStato ? '.attivo' : ''), { onclick: () => { UI.copStato = ''; disegna(); } }, 'Tutti · ' + (conta('E') + conta('I') + conta('N'))), ['E', 'I', 'N'].map(st => h('button.chip' + (UI.copStato === st ? '.attivo' : ''), { onclick: () => { UI.copStato = st; disegna(); } }, ETI[st][0] + ' · ' + conta(st)))), Array.from(new Set(cop.map(c => c.m))).filter(m => filtrate.some(c => c.m === m)).map(m => h('section.card', null, h('h2.card-titolo', { style: { color: coloreMateria(m) } }, nomeMateria(m) + ' — copertura del syllabus'), filtrate.filter(c => c.m === m).map(c => {
        const t = Studio.trovaSotto(c.k), fatto = Studio.stepFatto(c.k, piano);
        return h('button.voce-lista', { onclick: () => { if (t) {
                UI.studioSub = c.k;
                disegna();
            } } }, h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal', fontWeight: '550' } }, (fatto ? '✓ ' : '') + c.a), h('span.voce-sotto', { style: { whiteSpace: 'normal' } }, h('span.etichetta.' + ETI[c.stato][1], null, ETI[c.stato][0]), ' ' + c.ud + ' · Step ' + c.k.slice(1) + ' · ' + c.quando)));
    }))));
}
function mat0(pk, m) { return pk.materie.find(x => x.m === m) || { m, nome: nomeMateria(m), libro: '', sottostep: [] }; }

// ============================================================
// 07-tabelle.ts — Tabelle personalizzate (dentro Studio → Tabelle).
// Una tabella = un record type 'tabella' con colonne e righe.
// Tipi di colonna: testo, numero, data, spunta, selezione, link (Drive o web).
// Le righe con una colonna "data" compaiono nel giorno corrispondente (Oggi e calendario).
// CSV: importa/esporta. Google Sheet: collega (apri) e importa come righe.
// ============================================================
const TIPI_COL = [['testo', 'Testo'], ['numero', 'Numero'], ['data', 'Data'], ['spunta', 'Spunta'], ['selezione', 'Selezione'], ['link', 'Link / file Drive']];
function tabelle() { return Stato.tutti('tabella').sort((a, b) => a.nome.localeCompare(b.nome)); }
/** Righe di tutte le tabelle che hanno una colonna data uguale al giorno. */
function righeDelGiorno(g) {
    const k = ymd(g), out = [];
    for (const t of tabelle())
        for (const col of t.colonne.filter(c => c.tipo === 'data'))
            for (const r of t.righe)
                if (r.c[col.id] === k)
                    out.push({ t, r, col });
    return out;
}
function rigaTabellaGiorno(x) {
    const prima = x.t.colonne.find(c => c.tipo === 'testo');
    return h('button.voce-lista', { onclick: () => { UI.studioVista = 'tabelle'; UI.tabella = x.t.id; vai('studio'); } }, h('span.barra', { style: { background: 'var(--tenue)' } }), h('span.voce-corpo', null, h('span.voce-titolo', null, prima ? String(x.r.c[prima.id] || '(riga)') : '(riga)'), h('span.voce-sotto', null, x.t.nome + ' · ' + x.col.nome)));
}
// ---------- CSV ----------
function csvRighe(testo) {
    const sep = (testo.split('\n')[0].match(/;/g) || []).length > (testo.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const out = [];
    let riga = [], cella = '', virg = false;
    for (let i = 0; i < testo.length; i++) {
        const ch = testo[i];
        if (virg) {
            if (ch === '"') {
                if (testo[i + 1] === '"') {
                    cella += '"';
                    i++;
                }
                else
                    virg = false;
            }
            else
                cella += ch;
            continue;
        }
        if (ch === '"')
            virg = true;
        else if (ch === sep) {
            riga.push(cella);
            cella = '';
        }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && testo[i + 1] === '\n')
                i++;
            riga.push(cella);
            cella = '';
            if (riga.some(x => x !== ''))
                out.push(riga);
            riga = [];
        }
        else
            cella += ch;
    }
    riga.push(cella);
    if (riga.some(x => x !== ''))
        out.push(riga);
    return out;
}
function csvDa(t) {
    const q = (v) => { const s = v == null ? '' : typeof v === 'boolean' ? (v ? 'sì' : 'no') : String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return [t.colonne.map(c => q(c.nome)).join(','), ...t.righe.map(r => t.colonne.map(c => q(r.c[c.id])).join(','))].join('\n');
}
/** Aggiunge righe da una tabella di testo (CSV o Google Sheet). Prima riga = intestazioni: crea le colonne mancanti. */
function importaRighe(t, dati) {
    if (!dati.length)
        return 0;
    const [testa, ...corpo] = dati;
    const mappa = testa.map(nome => {
        const n = nome.trim() || 'Colonna';
        let col = t.colonne.find(c => norm(c.nome) === norm(n));
        if (!col) {
            col = { id: uid(), nome: n, tipo: 'testo' };
            t.colonne.push(col);
        }
        return col;
    });
    for (const r of corpo) {
        const c = {};
        r.forEach((v, i) => {
            const col = mappa[i];
            if (!col)
                return;
            if (col.tipo === 'numero')
                c[col.id] = v === '' ? '' : parseFloat(v.replace(',', '.'));
            else if (col.tipo === 'spunta')
                c[col.id] = /^(s[iì]|x|true|1|vero)$/i.test(v.trim());
            else if (col.tipo === 'data') {
                const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                c[col.id] = m ? m[3] + '-' + pad2(+m[2]) + '-' + pad2(+m[1]) : v;
            }
            else
                c[col.id] = v;
        });
        t.righe.push({ id: uid(), c });
    }
    return corpo.length;
}
// ---------- Viste ----------
function vistaTabelle() {
    if (UI.tabella) {
        const t = Stato.prendi(UI.tabella);
        if (t)
            return vistaTabella(t);
        UI.tabella = null;
    }
    const lista = tabelle();
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, lista.length ? h('section.card', null, h('h2.card-titolo', null, 'Le mie tabelle'), lista.map(t => h('button.voce-lista', { onclick: () => { UI.tabella = t.id; UI.tabQ = ''; UI.tabOrd = ''; disegna(); } }, h('span.voce-corpo', null, h('span.voce-titolo', null, t.nome), h('span.voce-sotto', null, t.righe.length + ' righe · ' + t.colonne.length + ' colonne' + (t.sheet ? ' · collegata a Google Sheet' : ''))), icona('dx', 18))))
        : vuoto('Nessuna tabella. Creane una: colonne di testo, numeri, date, spunte, scelte, link Drive.'), h('button.btn', { onclick: () => apriNuovaTabella() }, '+ Nuova tabella'));
}
function apriNuovaTabella() {
    const nome = h('input.titolo-grande', { type: 'text', placeholder: 'Nome della tabella' });
    const modello = selettore([['vuota', 'Vuota (Titolo, Data, Fatto)'], ['studio', 'Studio (Argomento, Materia, Data, Fatto, Punteggio, Note)'], ['sheet', 'Da un Google Sheet esistente']], 'vuota');
    foglio({ titolo: 'Nuova tabella', etichettaSalva: 'Crea', corpo: h('div.modulo', null, nome, h('div.gruppo', null, riga('Modello', modello))),
        salva: () => {
            const t = { id: 'tab-' + uid(), type: 'tabella', updatedAt: 0, nome: nome.value.trim() || 'Nuova tabella', colonne: [], righe: [] };
            const col = (n, tipo, opzioni) => ({ id: uid(), nome: n, tipo, ...(opzioni ? { opzioni } : {}) });
            if (modello.value === 'studio')
                t.colonne = [col('Argomento', 'testo'), col('Materia', 'selezione', ['Chimica', 'Biologia', 'Fisica']), col('Data', 'data'), col('Fatto', 'spunta'), col('Punteggio %', 'numero'), col('Note', 'testo')];
            else
                t.colonne = [col('Titolo', 'testo'), col('Data', 'data'), col('Fatto', 'spunta')];
            if (modello.value === 'sheet') {
                t.colonne = [];
                Stato.salva(t);
                UI.tabella = t.id;
                collegaSheet(t, true);
                return;
            }
            t.righe.push({ id: uid(), c: {} });
            Stato.salva(t);
            UI.tabella = t.id;
            disegna();
        } });
    setTimeout(() => { if (!document.activeElement || document.activeElement === document.body)
        nome.focus(); }, 50);
}
async function collegaSheet(t, importa) {
    if (serveGoogle())
        return;
    try {
        const [d] = await scegliFileDrive({ mime: 'application/vnd.google-apps.spreadsheet', titolo: 'Scegli un Google Sheet' });
        if (!d)
            return;
        t.sheet = { id: d.id, nome: d.name, url: d.url || 'https://docs.google.com/spreadsheets/d/' + d.id };
        if (importa || (await chiedi('Importare le righe?', [{ testo: 'Sì, importa le righe', valore: 'si' }, { testo: 'No, solo collegamento', valore: 'no' }], d.name)) === 'si') {
            const n = importaRighe(t, csvRighe(await Drive.esportaCsv(d.id)));
            avviso('Importate ' + n + ' righe dal foglio (primo foglio).');
        }
        if (!t.nome || t.nome === 'Nuova tabella')
            t.nome = d.name;
        Stato.salva(t);
    }
    catch (e) {
        avviso(String(e.message || e), 6000);
    }
}
function editorColonna(t, col) {
    const nuova = !col;
    const c = col ? JSON.parse(JSON.stringify(col)) : { id: uid(), nome: '', tipo: 'testo' };
    const nome = h('input.titolo-grande', { type: 'text', placeholder: 'Nome colonna', value: c.nome });
    const tipo = selettore(TIPI_COL, c.tipo, () => { opz.style.display = tipo.value === 'selezione' ? '' : 'none'; });
    const opz = h('div', { style: { display: c.tipo === 'selezione' ? '' : 'none' } }, riga('Scelte', h('input', { type: 'text', placeholder: 'separate da virgola', value: (c.opzioni || []).join(', ') })));
    const f = foglio({ titolo: nuova ? 'Nuova colonna' : 'Colonna', corpo: h('div.modulo', null, nome, h('div.gruppo', null, riga('Tipo', tipo), opz)),
        salva: () => {
            c.nome = nome.value.trim() || 'Colonna';
            c.tipo = tipo.value;
            c.opzioni = c.tipo === 'selezione' ? opz.querySelector('input').value.split(',').map(x => x.trim()).filter(Boolean) : undefined;
            if (nuova)
                t.colonne.push(c);
            else
                t.colonne[t.colonne.findIndex(x => x.id === c.id)] = c;
            Stato.salva(t);
        },
        elimina: nuova ? undefined : () => chiedi('Eliminare la colonna?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], c.nome + ': i valori di questa colonna andranno persi.').then(s => {
            if (!s)
                return;
            t.colonne = t.colonne.filter(x => x.id !== c.id);
            t.righe.forEach(r => delete r.c[c.id]);
            Stato.salva(t);
            f.chiudi();
        }) });
}
function cella(t, r, col) {
    const v = r.c[col.id];
    const salva = (nv) => { if (r.c[col.id] === nv)
        return; r.c[col.id] = nv; Stato.salva(t, true); };
    switch (col.tipo) {
        case 'spunta': return h('input', { type: 'checkbox', checked: !!v, 'aria-label': col.nome, onchange: (e) => { salva(e.target.checked); } });
        case 'numero': return h('input.cella', { type: 'number', inputMode: 'decimal', value: v == null ? '' : String(v), 'aria-label': col.nome, onchange: (e) => { const x = e.target.value; salva(x === '' ? '' : parseFloat(x)); } });
        case 'data': return h('input.cella', { type: 'date', value: v || '', 'aria-label': col.nome, onchange: (e) => { salva(e.target.value); Stato.notifica(); } });
        case 'selezione': return selettore([['', '—']].concat((col.opzioni || []).map(o => [o, o])), v || '', function () { salva(this.value); });
        case 'link': {
            const box = h('span.cella-link');
            const url = v && typeof v === 'object' ? v.url : v;
            if (url)
                box.appendChild(h('a', { href: url, target: '_blank', rel: 'noopener' }, v.nome || 'Apri'));
            box.appendChild(h('button.btn-testo', { onclick: async () => {
                    const s = await chiedi(col.nome, [{ testo: 'Scegli file dal Drive', valore: 'drive' }, { testo: 'Incolla un link web', valore: 'web' }].concat(url ? [{ testo: 'Togli il link', valore: 'via' }] : []));
                    if (s === 'via') {
                        salva('');
                        Stato.notifica();
                    }
                    else if (s === 'drive') {
                        if (serveGoogle())
                            return;
                        try {
                            const [d] = await scegliFileDrive({});
                            if (d) {
                                salva({ nome: d.name, url: d.url, driveId: d.id });
                                Stato.notifica();
                            }
                        }
                        catch (e) {
                            avviso(String(e.message || e));
                        }
                    }
                    else if (s === 'web') {
                        const inp = h('input', { type: 'url', placeholder: 'https://…', value: typeof v === 'string' ? v : '' });
                        foglio({ titolo: 'Link', corpo: h('div.modulo', null, h('div.gruppo', null, riga('Indirizzo', inp))), salva: () => { const u = inp.value.trim(); salva(u ? (/^https?:\/\//.test(u) ? u : 'https://' + u) : ''); Stato.notifica(); } });
                    }
                } }, url ? '✎' : '+ link'));
            return box;
        }
        default: return h('textarea.cella', { rows: 1, value: v == null ? '' : String(v), 'aria-label': col.nome, oninput: (e) => { const a = e.target; a.style.height = 'auto'; a.style.height = a.scrollHeight + 'px'; }, onchange: (e) => salva(e.target.value) });
    }
}
function vistaTabella(t) {
    const q = norm(UI.tabQ);
    const testoCella = (v) => v == null ? '' : typeof v === 'object' ? (v.nome || v.url || '') : String(v);
    let righe = t.righe.filter(r => !q || t.colonne.some(c => norm(testoCella(r.c[c.id])).includes(q)));
    if (UI.tabOrd) {
        const [cid, dir] = UI.tabOrd.split(':'), col = t.colonne.find(c => c.id === cid);
        if (col)
            righe = righe.slice().sort((a, b) => {
                const x = a.c[cid], y = b.c[cid];
                const vx = col.tipo === 'numero' ? (x === '' || x == null ? -Infinity : +x) : col.tipo === 'spunta' ? (x ? 1 : 0) : norm(testoCella(x));
                const vy = col.tipo === 'numero' ? (y === '' || y == null ? -Infinity : +y) : col.tipo === 'spunta' ? (y ? 1 : 0) : norm(testoCella(y));
                return (vx < vy ? -1 : vx > vy ? 1 : 0) * (dir === 'd' ? -1 : 1);
            });
    }
    const ordina = (c) => { UI.tabOrd = UI.tabOrd === c.id + ':a' ? c.id + ':d' : UI.tabOrd === c.id + ':d' ? '' : c.id + ':a'; disegna(); };
    const freccia = (c) => UI.tabOrd === c.id + ':a' ? ' ▲' : UI.tabOrd === c.id + ':d' ? ' ▼' : '';
    const fileCsv = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', style: { display: 'none' }, onchange: () => {
            const f = fileCsv.files && fileCsv.files[0];
            if (!f)
                return;
            f.text().then(txt => { const n = importaRighe(t, csvRighe(txt)); Stato.salva(t); avviso('Importate ' + n + ' righe.'); });
        } });
    const esporta = () => {
        const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + csvDa(t)], { type: 'text/csv' })), download: t.nome.replace(/[\\/:*?"<>|]/g, '_') + '.csv' });
        document.body.appendChild(a);
        a.click();
        a.remove();
    };
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('button.btn-testo.indietro', { onclick: () => { UI.tabella = null; disegna(); } }, '‹ Tabelle'), h('div.riga-tra', null, h('input.titolo-tab', { type: 'text', value: t.nome, 'aria-label': 'Nome tabella', onchange: (e) => { t.nome = e.target.value.trim() || t.nome; Stato.salva(t); } }), h('button.btn-ico', { 'aria-label': 'Altre azioni', onclick: async () => {
            const s = await chiedi(t.nome, [
                { testo: 'Importa CSV', valore: 'csv' }, { testo: 'Esporta CSV', valore: 'exp' },
                { testo: t.sheet ? 'Ricollega Google Sheet' : 'Collega un Google Sheet', valore: 'sheet' },
                ...(t.sheet ? [{ testo: 'Importa righe dal Google Sheet', valore: 'sheetimp' }] : []),
                { testo: 'Elimina tabella', valore: 'del', pericolo: true }
            ]);
            if (s === 'csv')
                fileCsv.click();
            else if (s === 'exp')
                esporta();
            else if (s === 'sheet')
                collegaSheet(t, false);
            else if (s === 'sheetimp' && t.sheet) {
                if (serveGoogle())
                    return;
                try {
                    const n = importaRighe(t, csvRighe(await Drive.esportaCsv(t.sheet.id)));
                    Stato.salva(t);
                    avviso('Importate ' + n + ' righe.');
                }
                catch (e) {
                    avviso(String(e.message || e), 6000);
                }
            }
            else if (s === 'del') {
                const ok = await chiedi('Eliminare la tabella?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], t.nome);
                if (ok) {
                    Stato.elimina(t.id);
                    UI.tabella = null;
                }
            }
        } }, '⋯'), fileCsv), t.sheet ? h('a.collegamento', { href: t.sheet.url, target: '_blank', rel: 'noopener' }, '📊 Apri il Google Sheet: ' + t.sheet.nome) : null, h('input.rapido', { type: 'search', placeholder: 'Filtra righe…', value: UI.tabQ, oninput: (e) => { UI.tabQ = e.target.value; clearTimeout(window.__tq); window.__tq = setTimeout(() => { disegna(); const i = document.querySelector('.rapido'); if (i) {
            i.focus();
            i.setSelectionRange(i.value.length, i.value.length);
        } }, 300); } }), h('div.tab-scroll', null, h('table.tab', null, h('thead', null, h('tr', null, t.colonne.map(c => h('th', null, h('button', { onclick: () => ordina(c), title: 'Ordina' }, c.nome + freccia(c)), h('button.th-mod', { 'aria-label': 'Modifica colonna ' + c.nome, onclick: () => editorColonna(t, c) }, '⚙'))), h('th.th-piu', null, h('button', { onclick: () => editorColonna(t), 'aria-label': 'Aggiungi colonna' }, '+')))), h('tbody', null, righe.map(r => h('tr', null, t.colonne.map(c => h('td.td-' + c.tipo, null, cella(t, r, c))), h('td', null, h('button.btn-ico', { 'aria-label': 'Elimina riga', onclick: () => { t.righe = t.righe.filter(x => x.id !== r.id); Stato.salva(t); } }, icona('x', 16)))))))), h('div.tenue.piccolo', null, righe.length + ' di ' + t.righe.length + ' righe' + (UI.tabOrd ? ' · ordinate' : '') + '. Le righe con una data compaiono anche nel calendario.'), h('button.btn.neutro', { onclick: () => { t.righe.push({ id: uid(), c: {} }); Stato.salva(t); } }, '+ Aggiungi riga'));
}

// ============================================================
// 06-viste.ts — Le schermate: Oggi, Calendario (giorno/settimana/mese/
// agenda), Promemoria, Note, Altro (impostazioni), Cerca.
// Ogni vista è una funzione che restituisce un elemento; `disegna()`
// (in 07-main.ts) ricostruisce la schermata a ogni cambio di dati.
// ============================================================
const UI = {
    scheda: 'oggi',
    vista: 'mese',
    data: oggi(), // giorno selezionato nel calendario
    filtroTask: 'dafare',
    qNote: '',
    tagNote: '',
    q: '',
    studioVista: 'schede',
    studioPiano: '',
    copMateria: '',
    copStato: '',
    tabella: null,
    tabQ: '',
    tabOrd: '',
    studioStep: '',
    studioSub: null,
    soloPrior: false,
    pianoScorso: false,
};
const ORA_PX = 52; // altezza di un'ora nella griglia oraria
function vai(scheda, vista, data) {
    UI.scheda = scheda;
    if (vista)
        UI.vista = vista;
    if (data)
        UI.data = inizioGiorno(data);
    disegna();
}
// ---------- Righe riusabili ----------
function orarioOcc(o, giorno) {
    if (o.ev.tuttoIlGiorno)
        return 'Tutto il giorno';
    if (giorno && !stessoGiorno(o.inizio, giorno) && !stessoGiorno(o.fine, giorno))
        return 'Tutto il giorno';
    if (giorno && !stessoGiorno(o.inizio, giorno))
        return 'fino alle ' + hm(o.fine);
    if (giorno && !stessoGiorno(o.fine, giorno))
        return 'dalle ' + hm(o.inizio);
    return hm(o.inizio) + ' – ' + hm(o.fine);
}
function rigaOcc(o, giorno) {
    const fatte = (o.ev.checklist || []).filter(v => v.fatto).length, tot = (o.ev.checklist || []).length;
    return h('button.voce-lista', { onclick: () => apriEvento(o.ev, o) }, h('span.barra', { style: { background: coloreEvento(o.ev) } }), h('span.voce-corpo', null, h('span.voce-titolo', null, o.ev.titolo), h('span.voce-sotto', null, orarioOcc(o, giorno), o.ev.luogo ? [' · ', o.ev.luogo] : null, tot ? ' · ' + fatte + '/' + tot + ' ✓' : null)), o.ev.rrule ? h('span.tenue', { title: testoRicorrenza(o.ev.rrule) }, icona('ripeti', 16)) : null, (o.ev.promemoria || []).length ? h('span.tenue', null, icona('campana', 16)) : null, (o.ev.allegati || []).length ? h('span.tenue', null, '📎') : null);
}
function etichettaScadenza(t) {
    if (!t.scadenza)
        return '';
    const d = daDt(t.scadenza);
    return dataRelativa(d) + (t.scadenza.length > 10 ? ' ' + hm(d) : '');
}
function rigaTask(t) {
    const scad = taskScaduto(t);
    return h('div.voce-lista.task' + (t.fatto ? '.fatto' : ''), null, h('button.spunta' + (t.fatto ? '.on' : ''), {
        'aria-label': t.fatto ? 'Segna da fare' : 'Segna fatto',
        style: { '--c': coloreEvento(t) },
        onclick: () => spuntaTask(t),
    }, t.fatto ? '✓' : ''), h('button.voce-corpo', { onclick: () => apriTask(t) }, h('span.voce-titolo', null, t.priorita ? h('span.prio.p' + t.priorita, null, '!'.repeat(t.priorita) + ' ') : null, t.titolo), (t.scadenza || t.rrule) ? h('span.voce-sotto' + (scad ? '.scaduto' : ''), null, etichettaScadenza(t), t.rrule ? ' · ' + testoRicorrenza(t.rrule) : null) : null));
}
function vuoto(testo) { return h('div.vuoto', null, testo); }
function scheda(titolo, ...corpo) {
    return h('section.card', null, h('h2.card-titolo', null, titolo), corpo);
}
function taskDelGiorno(g) {
    const k = ymd(g);
    return Stato.tutti('task').filter(t => !t.fatto && t.scadenza && t.scadenza.slice(0, 10) === k && categoriaVisibile(t.categoriaId)).sort(ordinaTask);
}
// ---------- OGGI (Home/Dashboard) ----------
const WIDGET = [['ripassi', 'Ripassi di oggi'], ['chiusura', 'Chiudi la giornata (sera)'], ['studiaora', 'Studia ora'], ['carte', 'Flashcard di oggi'], ['esami', 'Prossimi esami'], ['impegni', 'Impegni di oggi'], ['studio', 'Studio di oggi'], ['timer', 'Timer e tempo di studio'], ['errori', 'Schede da rifare'], ['promemoria', 'Promemoria'], ['tabelle', 'Dalle tue tabelle'], ['nota', 'Nota del giorno'], ['domani', 'Domani']];
/** Riquadri di Oggi nell'ordine scelto, senza quelli nascosti (quelli nuovi in fondo). */
function ordineWidget() {
    const i = imp(), ord = (i.widget || []).filter(w => WIDGET.some(x => x[0] === w));
    for (const [w] of WIDGET)
        if (!ord.includes(w))
            (w === 'ripassi' || w === 'chiusura' || w === 'studiaora') ? ord.unshift(w) : ord.push(w); // v0.7: i ripassi in cima
    return ord.filter(w => !(i.widgetNascosti || []).includes(w));
}
let timerNotaGiorno = 0;
function vistaOggi() {
    const g = oggi();
    const occ = occorrenzeDelGiorno(g);
    const tasks = Stato.tutti('task').filter(t => !t.fatto && t.scadenza && (taskScaduto(t) || t.scadenza.slice(0, 10) === ymd(g))).sort(ordinaTask);
    // Nota del giorno: id fisso per data, così non si duplica tra dispositivi.
    const idNota = 'giorno-' + ymd(g);
    const nota = Stato.prendi(idNota);
    const area = h('textarea.nota-giorno', {
        rows: 4, placeholder: 'Appunti di oggi…', value: nota ? nota.testo : '',
        oninput: () => {
            clearTimeout(timerNotaGiorno);
            timerNotaGiorno = window.setTimeout(() => {
                const n = Stato.prendi(idNota) || { id: idNota, type: 'nota', updatedAt: 0, titolo: 'Nota del ' + fmt(g, { day: 'numeric', month: 'long', year: 'numeric' }), testo: '', tag: [], giorno: ymd(g) };
                n.testo = area.value;
                Stato.salva(n, true);
            }, 500);
        },
    });
    const rapido = h('input', { type: 'text', placeholder: '+ Promemoria veloce', enterKeyHint: 'done', onkeydown: (e) => {
            if (e.key === 'Enter' && rapido.value.trim()) {
                Stato.salva({ id: uid(), type: 'task', updatedAt: 0, titolo: rapido.value.trim(), priorita: 0, fatto: false, scadenza: ymd(g) });
            }
        } });
    const domani = piuGiorni(g, 1);
    const occDomani = occorrenzeDelGiorno(domani);
    return h('div.pagina', null, h('div.oggi-testa', null, h('div.oggi-giorno', null, String(g.getDate())), h('div', null, h('div.oggi-sett', null, maiuscola(fmt(g, { weekday: 'long' }))), h('div.tenue', null, maiuscola(fmt(g, { month: 'long', year: 'numeric' }))))), campoRapido(), ordineWidget().map(w => {
        switch (w) {
            case 'impegni': return scheda('Impegni di oggi', occ.length ? occ.map(o => rigaOcc(o, g)) : vuoto('Nessun impegno. Scrivi sopra o tocca +.'));
            case 'promemoria': return scheda('Promemoria', tasks.length ? tasks.map(rigaTask) : vuoto('Niente in scadenza.'), rapido);
            case 'studio': {
                const st = Studio.vociDelGiorno(g);
                return Studio.pkPiani().length ? scheda('Studio di oggi', indicatoreStudio(), st.length ? st.map(rigaStudio) : vuoto('Niente dal piano per oggi.'), bottoniFreddo(st)) : null;
            }
            case 'tabelle': {
                const r = righeDelGiorno(g);
                return r.length ? scheda('Dalle tue tabelle', r.map(rigaTabellaGiorno)) : null;
            }
            case 'nota': return scheda('Nota del giorno', area);
            case 'domani': return occDomani.length ? scheda('Domani', occDomani.map(o => rigaOcc(o, domani))) : null;
            case 'studiaora': return Studio.pkStep().length ? widgetStudiaOra() : null;
            case 'carte': return widgetCarte();
            case 'ripassi': return widgetRipassi();
            case 'chiusura': return widgetChiusura();
            case 'esami': return widgetEsami();
            case 'timer': return widgetTimer();
            case 'errori': return widgetErrori();
        }
        return null;
    }));
}
// ---------- CALENDARIO ----------
function titoloCal() {
    const d = UI.data;
    if (UI.vista === 'mese')
        return maiuscola(fmt(d, { month: 'long', year: 'numeric' }));
    if (UI.vista === 'giorno')
        return maiuscola(fmt(d, { weekday: 'short', day: 'numeric', month: 'long' }));
    if (UI.vista === 'settimana') {
        const a = lunedi(d), b = piuGiorni(a, 6);
        return a.getDate() + (a.getMonth() !== b.getMonth() ? ' ' + fmt(a, { month: 'short' }) : '') + ' – ' + b.getDate() + ' ' + fmt(b, { month: 'short', year: 'numeric' });
    }
    return 'Agenda';
}
function spostaCal(dir) {
    const d = UI.data;
    if (UI.vista === 'mese')
        UI.data = new Date(d.getFullYear(), d.getMonth() + dir, Math.min(d.getDate(), new Date(d.getFullYear(), d.getMonth() + dir + 1, 0).getDate()));
    else if (UI.vista === 'settimana')
        UI.data = piuGiorni(d, 7 * dir);
    else if (UI.vista === 'giorno')
        UI.data = piuGiorni(d, dir);
    else
        UI.data = piuGiorni(d, 30 * dir);
    disegna();
}
function vistaCalendario() {
    const viste = [['giorno', 'Giorno'], ['settimana', 'Settimana'], ['mese', 'Mese'], ['agenda', 'Agenda']];
    const barra = h('div.cal-barra', null, h('div.cal-nav', null, h('button.btn-ico', { 'aria-label': 'Precedente', onclick: () => spostaCal(-1) }, icona('sx')), h('button.cal-titolo', { onclick: () => { UI.data = oggi(); disegna(); }, title: 'Torna a oggi' }, titoloCal()), h('button.btn-ico', { 'aria-label': 'Successivo', onclick: () => spostaCal(1) }, icona('dx')), stessoGiorno(UI.data, oggi()) ? null : h('button.btn-testo', { onclick: () => { UI.data = oggi(); disegna(); } }, 'Oggi')), h('div.segmenti', { role: 'tablist' }, viste.map(([v, t]) => h('button' + (UI.vista === v ? '.attivo' : ''), { role: 'tab', onclick: () => { UI.vista = v; disegna(); } }, t))));
    const corpo = UI.vista === 'mese' ? vistaMese() : UI.vista === 'agenda' ? vistaAgenda() : vistaGriglia(UI.vista === 'giorno' ? 1 : 7);
    const el = h('div.pagina.cal', null, barra, UI.vista === 'agenda' || UI.vista === 'mese' ? campoRapido() : null, corpo);
    // Scorrimento orizzontale col dito per cambiare periodo.
    let x0 = 0, y0 = 0;
    el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2)
            spostaCal(dx < 0 ? 1 : -1);
    }, { passive: true });
    return el;
}
/** Raggruppa le occorrenze per giorno ('YYYY-MM-DD'), contando anche gli eventi su più giorni. */
function perGiorno(da, a) {
    const m = new Map();
    for (const o of occorrenzeTra(da, a)) {
        let g = inizioGiorno(o.inizio < da ? da : o.inizio);
        const ultimo = o.fine > a ? a : o.fine;
        do {
            const k = ymd(g);
            if (!m.has(k))
                m.set(k, []);
            m.get(k).push(o);
            g = piuGiorni(g, 1);
        } while (g < ultimo);
    }
    return m;
}
function vistaMese() {
    const primo = new Date(UI.data.getFullYear(), UI.data.getMonth(), 1);
    const inizio = lunedi(primo);
    const giorniMese = new Date(primo.getFullYear(), primo.getMonth() + 1, 0).getDate();
    const settimane = Math.ceil((((primo.getDay() + 6) % 7) + giorniMese) / 7);
    const fine = piuGiorni(inizio, settimane * 7);
    const mappa = perGiorno(inizio, fine);
    const griglia = h('div.mese', { style: { '--righe': String(settimane) } });
    GIORNI_BREVI.forEach(n => griglia.appendChild(h('div.mese-eti', null, n)));
    for (let i = 0; i < settimane * 7; i++) {
        const g = piuGiorni(inizio, i);
        const occ = mappa.get(ymd(g)) || [];
        const nTask = taskDelGiorno(g).length;
        const cls = (g.getMonth() !== primo.getMonth() ? '.fuori' : '') + (stessoGiorno(g, oggi()) ? '.oggi' : '') + (stessoGiorno(g, UI.data) ? '.sel' : '');
        griglia.appendChild(h('button.mese-cella' + cls, {
            'aria-label': dataLunga(g) + ', ' + occ.length + ' impegni',
            onclick: () => { if (stessoGiorno(g, UI.data))
                vai('cal', 'giorno', g);
            else {
                UI.data = g;
                disegna();
            } },
        }, h('span.mese-num', null, String(g.getDate())), Studio.vociDelGiorno(g).slice(0, 2).map(x => h('span.mese-chip.studio', { style: { '--c': x.v.speciale ? '#7c8597' : coloreChiave(x.v.k) } }, x.v.speciale ? x.v.t : Studio.etichetta(x.v.k))), occ.slice(0, 2).map(o => h('span.mese-chip', { style: { '--c': coloreEvento(o.ev) } }, o.ev.titolo)), occ.length > 2 ? h('span.mese-altro', null, '+' + (occ.length - 2)) : null, nTask ? h('span.mese-task', { title: nTask + ' promemoria' }) : null));
    }
    // Sotto la griglia: dettaglio del giorno selezionato.
    const occSel = occorrenzeDelGiorno(UI.data), taskSel = taskDelGiorno(UI.data);
    return h('div', null, griglia, h('div.card.giorno-sel', null, h('div.card-titolo.riga-tra', null, h('span', null, dataLunga(UI.data)), h('button.btn-testo', { onclick: () => vai('cal', 'giorno', UI.data) }, 'Apri giorno')), Studio.vociDelGiorno(UI.data).map(rigaStudio), righeDelGiorno(UI.data).map(rigaTabellaGiorno), occSel.map(o => rigaOcc(o, UI.data)), taskSel.map(rigaTask), !occSel.length && !taskSel.length && !Studio.vociDelGiorno(UI.data).length ? vuoto('Niente in programma.') : null));
}
/** Dispone gli eventi sovrapposti in colonne affiancate. */
function impagina(occ, giorno) {
    const g0 = inizioGiorno(giorno).getTime();
    const voci = occ.map(o => {
        const s = Math.max(0, (o.inizio.getTime() - g0) / 60000);
        const e = Math.min(1440, (o.fine.getTime() - g0) / 60000);
        return { o, s, e: Math.max(e, s + 24), col: 0, ncol: 1 };
    }).sort((a, b) => a.s - b.s || b.e - a.e);
    let gruppo = [], fineGruppo = -1;
    const chiudi = () => { const n = Math.max(...gruppo.map(v => v.col)) + 1; gruppo.forEach(v => v.ncol = n); gruppo = []; fineGruppo = -1; };
    for (const v of voci) {
        if (gruppo.length && v.s >= fineGruppo)
            chiudi();
        const usate = new Set(gruppo.filter(x => x.e > v.s).map(x => x.col));
        let c = 0;
        while (usate.has(c))
            c++;
        v.col = c;
        gruppo.push(v);
        fineGruppo = Math.max(fineGruppo, v.e);
    }
    if (gruppo.length)
        chiudi();
    return voci;
}
function vistaGriglia(nGiorni) {
    const primo = nGiorni === 1 ? UI.data : lunedi(UI.data);
    const giorni = [];
    for (let i = 0; i < nGiorni; i++)
        giorni.push(piuGiorni(primo, i));
    const mappa = perGiorno(primo, piuGiorni(primo, nGiorni));
    const col = { gridTemplateColumns: '44px repeat(' + nGiorni + ', minmax(0, 1fr))' };
    const testa = h('div.gr-testa', { style: col }, h('span'), giorni.map(g => h('button.gr-giorno' + (stessoGiorno(g, oggi()) ? '.oggi' : ''), { onclick: () => vai('cal', 'giorno', g) }, h('span.gr-sett', null, GIORNI_BREVI[(g.getDay() + 6) % 7]), h('span.gr-num', null, String(g.getDate())))));
    const lungo = (o) => o.ev.tuttoIlGiorno || o.fine.getTime() - o.inizio.getTime() >= 86400000;
    const fascia = h('div.gr-fascia', { style: col }, h('span.gr-fascia-eti', null, 'giorno'), giorni.map(g => {
        const occ = (mappa.get(ymd(g)) || []).filter(lungo);
        return h('div.gr-fascia-col', null, Studio.vociDelGiorno(g).map(x => h('button.mese-chip.studio', { style: { '--c': x.v.speciale ? '#7c8597' : coloreChiave(x.v.k) }, onclick: () => rigaStudio(x).click() }, x.v.speciale ? x.v.t : Studio.etichetta(x.v.k) + (nGiorni === 1 ? ' · ' + x.v.t : ''))), occ.map(o => h('button.mese-chip', { style: { '--c': coloreEvento(o.ev) }, onclick: () => apriEvento(o.ev, o) }, o.ev.titolo)), taskDelGiorno(g).map(t => h('button.mese-chip.task', { style: { '--c': coloreEvento(t) }, onclick: () => apriTask(t) }, '○ ' + t.titolo)));
    }));
    const ore = h('div.gr-ore');
    for (let i = 1; i < 24; i++)
        ore.appendChild(h('span', { style: { top: i * ORA_PX + 'px' } }, pad2(i) + ':00'));
    const corpo = h('div.gr-corpo', { style: { ...col, height: 24 * ORA_PX + 'px', '--ora': ORA_PX + 'px' } }, ore, giorni.map(g => {
        const colonna = h('div.gr-col' + (stessoGiorno(g, oggi()) ? '.oggi' : ''), {
            onclick: (e) => {
                if (e.target !== colonna)
                    return;
                // tocco su uno spazio vuoto: nuovo evento a quell'ora (arrotondata alla mezz'ora)
                const min = Math.floor((e.offsetY / ORA_PX) * 2) * 30;
                const d = new Date(g);
                d.setHours(0, min, 0, 0);
                apriEvento(undefined, undefined, { inizio: d, tuttoIlGiorno: false });
            },
        });
        for (const v of impagina((mappa.get(ymd(g)) || []).filter(o => !lungo(o)), g)) {
            const breve = v.e - v.s < 45;
            colonna.appendChild(trascinabile(h('button.gr-ev' + (breve ? '.breve' : ''), {
                style: { top: (v.s / 60) * ORA_PX + 'px', height: Math.max(20, ((v.e - v.s) / 60) * ORA_PX - 2) + 'px', left: (v.col / v.ncol) * 100 + '%', width: 'calc(' + 100 / v.ncol + '% - 2px)', '--c': coloreEvento(v.o.ev) },
                onclick: (e) => { e.stopPropagation(); apriEvento(v.o.ev, v.o); },
            }, h('span.gr-ev-tit', null, v.o.ev.titolo), breve ? null : h('span.gr-ev-ora', null, hm(v.o.inizio) + (nGiorni === 1 ? ' – ' + hm(v.o.fine) : ''), v.o.ev.luogo && nGiorni === 1 ? ' · ' + v.o.ev.luogo : null), h('span.gr-maniglia', { 'aria-hidden': 'true' })), v.o, nGiorni));
        }
        if (stessoGiorno(g, oggi())) {
            const ora = new Date();
            colonna.appendChild(h('div.gr-adesso', { style: { top: ((ora.getHours() * 60 + ora.getMinutes()) / 60) * ORA_PX + 'px' } }));
        }
        return colonna;
    }));
    return h('div.griglia' + (nGiorni === 1 ? '.uno' : ''), null, testa, fascia, h('div.gr-scroll', null, corpo));
}
function vistaAgenda() {
    const da = UI.data, a = piuGiorni(da, 60);
    const mappa = perGiorno(da, a);
    const lista = h('div.agenda');
    for (let i = 0; i < 60; i++) {
        const g = piuGiorni(da, i);
        const occ = mappa.get(ymd(g)) || [], tasks = taskDelGiorno(g), st = Studio.vociDelGiorno(g);
        if (!occ.length && !tasks.length && !st.length)
            continue;
        lista.appendChild(h('div.agenda-giorno' + (stessoGiorno(g, oggi()) ? '.oggi' : ''), null, h('button.agenda-data', { onclick: () => vai('cal', 'giorno', g) }, h('span.agenda-num', null, String(g.getDate())), h('span.agenda-sett', null, fmt(g, { weekday: 'short' }) + ' · ' + fmt(g, { month: 'short' }))), h('div.agenda-voci', null, st.map(rigaStudio), occ.map(o => rigaOcc(o, g)), tasks.map(rigaTask))));
    }
    if (!lista.firstChild)
        lista.appendChild(vuoto('Niente in programma nei prossimi 60 giorni.'));
    return lista;
}
// ---------- PROMEMORIA ----------
function vistaTask() {
    const tutti = Stato.tutti('task');
    const rapido = h('input.rapido', { type: 'text', placeholder: '+ Nuovo promemoria (Invio per salvare in Inbox)', enterKeyHint: 'done', onkeydown: (e) => {
            if (e.key === 'Enter' && rapido.value.trim())
                Stato.salva({ id: uid(), type: 'task', updatedAt: 0, titolo: rapido.value.trim(), priorita: 0, fatto: false });
        } });
    const filtri = [['dafare', 'Da fare'], ['inbox', 'Inbox'], ['fatti', 'Fatti']];
    const corpo = h('div');
    const gruppo = (titolo, voci, cls = '') => voci.length ? corpo.appendChild(h('section.card', null, h('h2.card-titolo' + cls, null, titolo + ' · ' + voci.length), voci.map(rigaTask))) : null;
    if (UI.filtroTask === 'fatti') {
        const fatti = tutti.filter(t => t.fatto).sort((a, b) => (b.fattoIl || '') < (a.fattoIl || '') ? -1 : 1);
        if (fatti.length)
            gruppo('Completati', fatti);
        else
            corpo.appendChild(vuoto('Ancora nessun promemoria completato.'));
    }
    else if (UI.filtroTask === 'inbox') {
        const inbox = tutti.filter(t => !t.fatto && !t.scadenza).sort((a, b) => b.priorita - a.priorita || b.updatedAt - a.updatedAt);
        if (inbox.length)
            gruppo('Inbox (senza data)', inbox);
        else
            corpo.appendChild(vuoto('Inbox vuota.'));
    }
    else {
        const aperti = tutti.filter(t => !t.fatto).sort(ordinaTask);
        const k = ymd(oggi());
        gruppo('Scaduti', aperti.filter(taskScaduto), '.scaduto');
        gruppo('Oggi', aperti.filter(t => !taskScaduto(t) && t.scadenza && t.scadenza.slice(0, 10) === k));
        gruppo('Prossimi', aperti.filter(t => t.scadenza && t.scadenza.slice(0, 10) > k));
        gruppo('Inbox (senza data)', aperti.filter(t => !t.scadenza));
        if (!aperti.length)
            corpo.appendChild(vuoto('Tutto fatto. Niente da fare.'));
    }
    return h('div.pagina', null, h('div.segmenti', { role: 'tablist' }, filtri.map(([v, t]) => h('button' + (UI.filtroTask === v ? '.attivo' : ''), { role: 'tab', onclick: () => { UI.filtroTask = v; disegna(); } }, t))), rapido, corpo);
}
// ---------- NOTE ----------
function vistaNote() {
    const lista = h('div');
    const zonaTag = h('div.chips');
    function aggiorna() {
        const tutte = Stato.tutti('nota').filter(n => n.testo.trim() || !n.giorno).sort((a, b) => b.updatedAt - a.updatedAt);
        const tags = Array.from(new Set(tutte.flatMap(n => n.tag))).sort();
        svuota(zonaTag);
        tags.forEach(t => zonaTag.appendChild(h('button.chip' + (UI.tagNote === t ? '.attivo' : ''), { onclick: () => { UI.tagNote = UI.tagNote === t ? '' : t; aggiorna(); } }, '#' + t)));
        const q = norm(UI.qNote);
        const viste = tutte.filter(n => (!UI.tagNote || n.tag.includes(UI.tagNote)) && (!q || norm(n.titolo + ' ' + n.testo + ' ' + n.tag.join(' ')).includes(q)));
        svuota(lista);
        if (!viste.length)
            lista.appendChild(vuoto(tutte.length ? 'Nessuna nota trovata.' : 'Ancora nessuna nota. Tocca + per scriverne una.'));
        viste.forEach(n => lista.appendChild(h('button.card.nota-card', { onclick: () => apriNota(n) }, h('span.voce-titolo', null, n.titolo || '(senza titolo)'), h('span.nota-estratto', null, n.testo.replace(/[#*`]/g, '').slice(0, 140)), h('span.voce-sotto', null, n.giorno ? 'Nota del giorno · ' : '', fmt(new Date(n.updatedAt), { day: 'numeric', month: 'short' }), n.tag.map(t => ' #' + t)))));
    }
    aggiorna();
    return h('div.pagina', null, h('input.rapido', { type: 'search', placeholder: 'Cerca nelle note…', value: UI.qNote, oninput: (e) => { UI.qNote = e.target.value; aggiorna(); } }), zonaTag, lista);
}
// ---------- CERCA (globale) ----------
function vistaCerca() {
    const ris = h('div');
    function aggiorna() {
        svuota(ris);
        const q = norm(UI.q.trim());
        if (q.length < 2) {
            ris.appendChild(vuoto('Scrivi almeno 2 lettere: cerco in eventi, promemoria e note.'));
            return;
        }
        const ev = Stato.tutti('evento').filter(e => norm(e.titolo + ' ' + (e.luogo || '') + ' ' + (e.note || '')).includes(q)).sort((a, b) => a.inizio < b.inizio ? 1 : -1);
        const tk = Stato.tutti('task').filter(t => norm(t.titolo + ' ' + (t.note || '')).includes(q));
        const nt = Stato.tutti('nota').filter(n => norm(n.titolo + ' ' + n.testo + ' ' + n.tag.join(' ')).includes(q));
        if (ev.length)
            ris.appendChild(scheda('Eventi · ' + ev.length, ev.slice(0, 50).map(e => h('button.voce-lista', { onclick: () => apriEvento(e) }, h('span.barra', { style: { background: coloreEvento(e) } }), h('span.voce-corpo', null, h('span.voce-titolo', null, e.titolo), h('span.voce-sotto', null, fmt(daDt(e.inizio), { day: 'numeric', month: 'short', year: 'numeric' }), e.rrule ? ' · ' + testoRicorrenza(e.rrule) : ''))))));
        if (tk.length)
            ris.appendChild(scheda('Promemoria · ' + tk.length, tk.slice(0, 50).map(rigaTask)));
        if (nt.length)
            ris.appendChild(scheda('Note · ' + nt.length, nt.slice(0, 50).map(n => h('button.voce-lista', { onclick: () => apriNota(n) }, h('span.voce-corpo', null, h('span.voce-titolo', null, n.titolo || '(senza titolo)'), h('span.voce-sotto', null, n.testo.slice(0, 80)))))));
        if (!ev.length && !tk.length && !nt.length)
            ris.appendChild(vuoto('Nessun risultato.'));
    }
    aggiorna();
    const campo = h('input.rapido', { type: 'search', placeholder: 'Cerca ovunque…', value: UI.q, oninput: (e) => { UI.q = e.target.value; aggiorna(); } });
    setTimeout(() => { if (document.activeElement !== campo && !UI.q)
        campo.focus(); }, 50);
    return h('div.pagina', null, campo, ris);
}
// ---------- ALTRO (impostazioni base; l'editor completo arriva in Fase 4) ----------
function vistaAltro() {
    const i = imp();
    const salvaImp = (mod) => { Object.assign(i, mod); Stato.salva(i); applicaTema(); };
    const cats = categorie().map(c => h('div.cat-riga', null, h('input', { type: 'color', value: c.colore, 'aria-label': 'Colore di ' + c.nome, onchange: (e) => { c.colore = e.target.value; Stato.salva(c); } }), h('input', { type: 'text', value: c.nome, 'aria-label': 'Nome categoria', onchange: (e) => { const v = e.target.value.trim(); if (v) {
            c.nome = v;
            Stato.salva(c);
        } } }), h('label.interruttore', { title: 'Mostra/nascondi nel calendario' }, h('input', { type: 'checkbox', checked: c.visibile, onchange: (e) => { c.visibile = e.target.checked; Stato.salva(c); } }), h('span')), h('button.btn-ico', { 'aria-label': 'Elimina categoria ' + c.nome, onclick: () => chiedi('Eliminare la categoria?', [{ testo: 'Elimina', valore: 'si', pericolo: true }], c.nome + ' — gli eventi restano, senza categoria.').then(s => { if (s)
            Stato.elimina(c.id); }) }, icona('x', 18))));
    const nuovaCat = h('input', { type: 'text', placeholder: '+ Nuova categoria', onkeydown: (e) => {
            if (e.key === 'Enter' && nuovaCat.value.trim()) {
                const colori = ['#6c8cff', '#2fbf8f', '#f0708a', '#e9a23b', '#a78bfa', '#38bdf8', '#f97316'];
                Stato.salva({ id: uid(), type: 'categoria', updatedAt: 0, nome: nuovaCat.value.trim(), colore: colori[categorie().length % colori.length], visibile: true, ordine: categorie().length });
            }
        } });
    const fileImport = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: () => {
            const f = fileImport.files && fileImport.files[0];
            if (!f)
                return;
            f.text().then(txt => {
                try {
                    const dati = JSON.parse(txt);
                    const n = Stato.unisci(Array.isArray(dati) ? dati : dati.records || []);
                    applicaTema();
                    avviso('Importazione completata: ' + n + ' elementi aggiornati.');
                }
                catch (_) {
                    avviso('File non valido.');
                }
            });
        } });
    const anteprima = !document.querySelector('link[rel="manifest"]'); // versione di prova a file unico
    const esporta = () => {
        if (anteprima) {
            avviso("Nell'anteprima l'esportazione non è disponibile: funziona nell'app installata.");
            return;
        }
        const blob = new Blob([JSON.stringify({ formato: 'il-mio-calendario', versione: 1, esportatoIl: new Date().toISOString(), records: Stato.esporta() })], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: 'calendario-backup-' + ymd(new Date()) + '.json' });
        document.body.appendChild(a);
        a.click();
        a.remove();
    };
    const memoria = { idb: 'sul dispositivo (IndexedDB)', ls: 'sul dispositivo (ridotto)', mem: 'solo temporaneo: questa finestra non permette il salvataggio' }[DB.modo];
    const ds = descrSync();
    const sezDrive = scheda('Google Drive', h('div.sync-riga', null, h('span.sync-pallino.' + ds.cls), h('span', null, ds.testo)), Drive.collegato
        ? [h('div.tenue.piccolo', null, 'Account: ' + Drive.stato.email + '. Dati in "Calendario personale/dati", backup giornaliero in "backup" (ultimi 30). L\'app non elimina mai file: al massimo li sposta in "_cestino app".'),
            h('div.bottoni', null, h('button.btn', { onclick: () => Drive.stato.sync === 'ok' ? Drive.sincronizza(false) : Drive.login() }, 'Sincronizza ora'), h('button.btn.neutro', { onclick: () => chiedi('Scollegare Google Drive?', [{ testo: 'Scollega', valore: 'si', pericolo: true }], 'I dati restano sia qui sia su Drive.').then(s => { if (s)
                    Drive.logout(); }) }, 'Scollega'))]
        : [h('div.tenue.piccolo', null, 'Collega il tuo Google Drive: i dati si salvano in una cartella "Calendario personale" e compaiono identici su iPhone e PC. Solo il tuo account potrà vederli.'),
            h('div.bottoni', null, h('button.btn', { onclick: () => Drive.login() }, 'Accedi con Google'))]);
    return h('div.pagina', null, sezDrive, sezioneAspetto(salvaImp), sezioneLayout(salvaImp), sezionePreset(salvaImp), scheda('Categorie', cats, nuovaCat), sezioneStudio(salvaImp), sezioneNotifiche(salvaImp), Spiega.sezione(), Regole.sezioneAltro(), sezioneCalendari(salvaImp), scheda('I miei dati', h('div.tenue.piccolo', null, 'Salvataggio: ' + memoria + '.'), anteprima ? h('div.tenue.piccolo', null, 'Questa è l\'anteprima di prova: i dati restano solo in questo browser e possono andare persi.') : null, h('div.bottoni', null, h('button.btn', { onclick: esporta }, 'Esporta backup'), h('button.btn.neutro', { onclick: () => fileImport.click() }, 'Importa backup'), fileImport)), h('div.tenue.piccolo.centro', null, 'Il mio calendario · v' + VERSIONE));
}
const ACCENTI = ['#6c8cff', '#2fbf8f', '#e9a23b', '#f0708a', '#a78bfa', '#38bdf8', '#f97316', '#64748b'];
const CAMPI_ASPETTO = ['tema', 'accento', 'sfondo', 'font', 'scala', 'densita', 'raggio', 'widget', 'widgetNascosti', 'tabNascoste', 'nav', 'vistaIniziale'];
function sezioneAspetto(salva) {
    const i = imp(), sel = (o, v, k, num = false) => selettore(o, v, function () { salva({ [k]: num ? +this.value : this.value, preset: '' }); });
    return scheda('Aspetto', riga('Tema', sel([['auto', 'Automatico'], ['chiaro', 'Chiaro'], ['scuro', 'Scuro']], i.tema, 'tema')), riga('Colore accento', h('span.anteprima-tema', null, ACCENTI.map(c => h('button.campione' + (c === i.accento ? '.attivo' : ''), { style: { background: c }, 'aria-label': 'Accento ' + c, onclick: () => salva({ accento: c, preset: '' }) })), h('input', { type: 'color', value: i.accento, 'aria-label': 'Altro colore', onchange: (e) => salva({ accento: e.target.value, preset: '' }) }))), riga('Sfondo', h('input', { type: 'color', value: i.sfondo || (document.documentElement.dataset.tema === 'scuro' ? '#0e1014' : '#f4f5f8'), onchange: (e) => salva({ sfondo: e.target.value, preset: '' }) }), i.sfondo ? h('button.btn-testo', { onclick: () => salva({ sfondo: '', preset: '' }) }, 'Del tema') : null), riga('Effetto vetro', sel([['si', 'Vetro leggero'], ['no', 'Superfici piene']], i.vetro === false || i.vetro === 'no' ? 'no' : 'si', 'vetro'), h('span.tenue.piccolo', null, 'Barra e fogli traslucidi')), riga('Carattere', sel([['sistema', 'Sistema'], ['arrotondato', 'Arrotondato'], ['serif', 'Serif'], ['mono', 'Monospazio']], i.font || 'sistema', 'font')), riga('Dimensione testo', sel([['0.9', 'Piccolo'], ['1', 'Normale'], ['1.1', 'Grande'], ['1.25', 'Molto grande']], String(i.scala || 1), 'scala', true)), riga('Densità', sel([['comoda', 'Comoda'], ['compatta', 'Compatta']], i.densita || 'comoda', 'densita')), riga('Angoli', sel([['4', 'Squadrati'], ['10', 'Leggeri'], ['14', 'Arrotondati'], ['22', 'Molto arrotondati']], String(i.raggio != null ? i.raggio : 14), 'raggio', true)));
}
function sezioneLayout(salva) {
    const i = imp(), ord = (() => { const o = (i.widget || []).filter(w => WIDGET.some(x => x[0] === w)); for (const [w] of WIDGET)
        if (!o.includes(w))
            (w === 'ripassi' || w === 'chiusura' || w === 'studiaora') ? o.unshift(w) : o.push(w); return o; })();
    const nasc = new Set(i.widgetNascosti || []), tabN = new Set(i.tabNascoste || []);
    const sposta = (idx, d) => { const o = ord.slice(); const [x] = o.splice(idx, 1); o.splice(idx + d, 0, x); salva({ widget: o, preset: '' }); };
    return scheda('Layout', riga('Vista iniziale', selettore([['oggi', 'Oggi'], ['giorno', 'Giorno'], ['settimana', 'Settimana'], ['mese', 'Mese'], ['agenda', 'Agenda']], i.vistaIniziale, function () { salva({ vistaIniziale: this.value, preset: '' }); })), riga('Barra delle sezioni su PC', selettore([['auto', 'Laterale'], ['basso', 'In basso']], i.nav || 'auto', function () { salva({ nav: this.value, preset: '' }); })), h('div.gruppo-titolo', null, 'Riquadri di Oggi (ordine e visibilità)'), ord.map((w, idx) => h('div.widget-riga', null, h('span.nome', null, (WIDGET.find(x => x[0] === w) || [w, w])[1]), h('button.btn-ico', { 'aria-label': 'Su', disabled: idx === 0, onclick: () => sposta(idx, -1) }, '↑'), h('button.btn-ico', { 'aria-label': 'Giù', disabled: idx === ord.length - 1, onclick: () => sposta(idx, 1) }, '↓'), h('label.interruttore', { title: 'Mostra' }, h('input', { type: 'checkbox', checked: !nasc.has(w), onchange: (e) => { e.target.checked ? nasc.delete(w) : nasc.add(w); salva({ widgetNascosti: Array.from(nasc), preset: '' }); } }), h('span')))), h('div.gruppo-titolo', null, 'Sezioni nella barra'), [['cal', 'Calendario'], ['studio', 'Studio'], ['appunti', 'Appunti'], ['task', 'Promemoria'], ['note', 'Note']].map(([s, t]) => h('div.widget-riga', null, h('span.nome', null, t), h('label.interruttore', null, h('input', { type: 'checkbox', checked: !tabN.has(s), onchange: (e) => { e.target.checked ? tabN.delete(s) : tabN.add(s); salva({ tabNascoste: Array.from(tabN), preset: '' }); } }), h('span')))));
}
const PRESET_BASE = [
    { nome: 'Predefinito', valori: { tema: 'auto', accento: '#6c8cff', sfondo: '', font: 'sistema', scala: 1, densita: 'comoda', raggio: 14, widget: [], widgetNascosti: [], tabNascoste: [], nav: 'auto', vistaIniziale: 'oggi' } },
    { nome: 'Studio intenso', valori: { tema: 'scuro', accento: '#e9a23b', sfondo: '', font: 'sistema', scala: 1, densita: 'compatta', raggio: 10, widget: ['studio', 'impegni', 'promemoria', 'tabelle', 'nota', 'domani'], widgetNascosti: ['domani'], tabNascoste: [], nav: 'auto', vistaIniziale: 'oggi' } },
    { nome: 'Minimal', valori: { tema: 'chiaro', accento: '#64748b', sfondo: '#ffffff', font: 'sistema', scala: 1, densita: 'comoda', raggio: 4, widget: ['impegni', 'promemoria', 'studio', 'nota', 'tabelle', 'domani'], widgetNascosti: ['tabelle', 'domani'], tabNascoste: ['note'], nav: 'auto', vistaIniziale: 'oggi' } },
];
function sezionePreset(salva) {
    const i = imp(), miei = Stato.tutti('preset').sort((a, b) => a.nome.localeCompare(b.nome));
    const applica = (nome, v) => { salva({ ...JSON.parse(JSON.stringify(v)), preset: nome }); avviso('Preset «' + nome + '» applicato'); };
    return scheda('Preset', h('div.chips', null, PRESET_BASE.map(p => h('button.chip' + (i.preset === p.nome ? '.attivo' : ''), { onclick: () => applica(p.nome, p.valori) }, p.nome)), miei.map(p => h('button.chip' + (i.preset === p.nome ? '.attivo' : ''), { onclick: async () => {
            const s = await chiedi(p.nome, [{ testo: 'Applica', valore: 'a' }, { testo: 'Sovrascrivi con l\'aspetto attuale', valore: 's' }, { testo: 'Elimina preset', valore: 'd', pericolo: true }]);
            if (s === 'a')
                applica(p.nome, p.valori);
            else if (s === 's') {
                p.valori = valoriAttuali();
                Stato.salva(p);
                avviso('Preset aggiornato');
            }
            else if (s === 'd')
                Stato.elimina(p.id);
        } }, '★ ' + p.nome))), h('button.btn.neutro', { style: { marginTop: '8px' }, onclick: () => {
            const nome = h('input.titolo-grande', { type: 'text', placeholder: 'Nome del preset (es. Esami)' });
            foglio({ titolo: 'Salva preset', corpo: h('div.modulo', null, nome, h('div.tenue.piccolo', null, 'Salva tema, colori, carattere, densità e layout attuali.')),
                salva: () => { const n = nome.value.trim(); if (!n)
                    return false; Stato.salva({ id: 'preset-' + uid(), type: 'preset', updatedAt: 0, nome: n, valori: valoriAttuali() }); salva({ preset: n }); } });
            setTimeout(() => { if (!document.activeElement || document.activeElement === document.body)
                nome.focus(); }, 50);
        } }, 'Salva l\'aspetto attuale come preset'));
}
function valoriAttuali() { const i = imp(), v = {}; for (const k of CAMPI_ASPETTO)
    if (i[k] !== undefined)
        v[k] = JSON.parse(JSON.stringify(i[k])); return v; }
function sezioneCalendari(salva) {
    const i = imp(), cats = new Set(i.gcalCategorie || []);
    const fileIcs = h('input', { type: 'file', accept: '.ics,text/calendar', style: { display: 'none' }, onchange: () => {
            const f = fileIcs.files && fileIcs.files[0];
            if (!f)
                return;
            f.text().then(async (txt) => {
                const opz = [{ testo: 'Nessuna categoria', valore: '' }].concat(categorie().map(c => ({ testo: c.nome, valore: c.id })));
                const cat = await chiedi('In quale categoria?', opz, f.name);
                if (cat === null)
                    return;
                const n = importaIcs(txt, cat || undefined);
                avviso(n ? 'Importati ' + n + ' eventi da ' + f.name : 'Nessun evento trovato nel file.');
            });
        } });
    const esporta = () => {
        const a = h('a', { href: URL.createObjectURL(new Blob([esportaIcs()], { type: 'text/calendar' })), download: 'il-mio-calendario-' + ymd(new Date()) + '.ics' });
        document.body.appendChild(a);
        a.click();
        a.remove();
    };
    return scheda('Google Calendar e file .ics', h('div.tenue.piccolo', null, 'Gli avvisi dentro l\'app arrivano solo ad app aperta. Per le notifiche vere sull\'iPhone attiva lo specchio: gli eventi vengono copiati in un calendario Google dedicato («' + GCal.GCAL_NOME + '») e le notifiche arrivano dall\'app Google Calendar o da Calendario di iOS (aggiungendo il tuo account Google). L\'app può toccare solo quel calendario, non gli altri tuoi.'), h('div.widget-riga', null, h('span.nome', null, 'Specchio su Google Calendar'), h('label.interruttore', null, h('input', { type: 'checkbox', checked: !!i.gcal, onchange: (e) => {
            const on = e.target.checked;
            salva({ gcal: on });
            if (on) {
                Drive.login();
                setTimeout(() => GCal.allinea(true).then(n => avviso('Specchio attivo: ' + n + ' elementi copiati su Google Calendar.')).catch(err => avviso('Specchio: ' + (err.message || err), 8000)), 2500);
            }
        } }), h('span'))), i.gcal ? [h('div.gruppo-titolo', null, 'Categorie da copiare (nessuna scelta = tutte)'),
        categorie().map(c => h('div.widget-riga', null, h('span.nome', null, h('span.campione', { style: { background: c.colore, display: 'inline-block', width: '12px', height: '12px', marginRight: '8px', verticalAlign: 'middle' } }), c.nome), h('label.interruttore', null, h('input', { type: 'checkbox', checked: cats.has(c.id), onchange: (e) => { e.target.checked ? cats.add(c.id) : cats.delete(c.id); salva({ gcalCategorie: Array.from(cats) }); GCal.allinea(true).catch(() => { }); } }), h('span')))),
        h('div.widget-riga', null, h('span.nome', null, 'Copia anche il piano di studio'), h('label.interruttore', null, h('input', { type: 'checkbox', checked: !!i.gcalStudio, onchange: (e) => { salva({ gcalStudio: e.target.checked }); GCal.allinea().then(n => avviso('Specchio aggiornato (' + n + ').')).catch(() => { }); } }), h('span'))),
        i.gcalStudio ? riga('Avviso dello studio', h('input', { type: 'time', value: i.gcalStudioOra || '', onchange: (e) => { salva({ gcalStudioOra: e.target.value }); GCal.allinea().catch(() => { }); } }), h('span.tenue.piccolo', null, 'vuoto = tutto il giorno')) : null,
        h('div.tenue.piccolo', null, 'Si copiano: eventi delle categorie scelte, promemoria con un orario' + (i.gcalStudio ? ' e blocchi del piano di studio.' : '. Se non vedi nulla su Google Calendar, è probabile che non ci siano ancora eventi da copiare.')),
        h('button.btn.neutro', { onclick: () => GCal.allinea(true).then(n => avviso('Ricopiati ' + n + ' elementi.')).catch(err => { if (String(err.message).match(/NOLOGIN|403|401/)) {
                Drive.login();
                avviso('Autorizza Google Calendar e riprova.');
            }
            else
                avviso(String(err.message || err), 8000); }) }, 'Ricopia tutto ora')] : null, h('div.gruppo-titolo', null, 'File .ics'), h('div.bottoni', null, h('button.btn.neutro', { onclick: () => fileIcs.click() }, 'Importa .ics'), h('button.btn.neutro', { onclick: esporta }, 'Esporta .ics'), fileIcs));
}
// ---------- v0.7: Notifiche sul telefono (ntfy) ----------
function sezioneNotifiche(salva) {
    const i = imp(), T = Object.assign({ promemoria: true, studio: true, sera: true, esami: true }, i.ntfyTipi || {});
    const priv = new Set(i.ntfyPrivate || []);
    const interr = (on, cambia) => h('label.interruttore', null, h('input', { type: 'checkbox', checked: on, onchange: (e) => cambia(e.target.checked) }), h('span'));
    const ora = (k, def) => h('input', { type: 'time', value: i[k] || def, onchange: (e) => salva({ [k]: e.target.value || def }) });
    const tipo = (k, nome, nota) => h('div.widget-riga', null, h('span.nome', null, nome, h('div.tenue.piccolo', null, nota)), interr(!!T[k], v => salva({ ntfyTipi: Object.assign({}, T, { [k]: v }) })));
    const copia = (t) => { try {
        navigator.clipboard.writeText(t).then(() => avviso('Codice copiato: incollalo nell\'app ntfy.'));
    }
    catch (_) {
        avviso(t, 15000);
    } };
    const futuri = Stato.tutti('notifica').filter(r => r.at > Date.now()).length;
    return scheda('Notifiche sul telefono', h('div.tenue.piccolo', null, 'Avvisi anche ad app chiusa, tramite l\'app gratuita ntfy. L\'app programma le notifiche dei prossimi 3 giorni ogni volta che la apri o modifichi qualcosa.'), h('div.widget-riga', null, h('span.nome', null, 'Notifiche sul telefono'), interr(!!i.ntfy, v => { if (v) {
        Notifiche.attiva();
        avviso('Attivate: segui i 3 passi qui sotto.', 6000);
    }
    else
        salva({ ntfy: false }); })), i.ntfy && i.ntfyTopic ? [
        h('div.gruppo-titolo', null, 'Collega l\'iPhone (una volta sola)'),
        h('ol.tenue.piccolo', { style: { paddingLeft: '18px', margin: '4px 0 8px' } }, h('li', null, 'Installa «ntfy» dall\'App Store (gratis) e consenti le notifiche.'), h('li', null, 'In ntfy tocca «+», incolla il codice qui sotto e tocca «Subscribe».'), h('li', null, 'Torna qui e tocca «Prova»: deve arrivare «✅ Notifiche attive».')),
        h('div.widget-riga', null, h('code', { style: { fontSize: '12px', wordBreak: 'break-all' } }, i.ntfyTopic), h('button.btn.neutro', { onclick: () => copia(i.ntfyTopic) }, 'Copia')),
        h('div.bottoni', null, h('button.btn', { onclick: () => Notifiche.prova().then(() => avviso('Inviata: controlla il telefono.')).catch(e => avviso('Invio non riuscito: ' + (e.message || e), 8000)) }, 'Prova'), h('button.btn.neutro', { onclick: () => Notifiche.allinea().then(n => avviso(n ? 'Mandate ' + n + ' notifiche.' : 'Già tutto programmato.')) }, 'Riprogramma ora'), h('button.btn.neutro', { onclick: async () => { const r = await chiedi('Nuovo codice?', [{ testo: 'Genera nuovo codice', valore: 'si', pericolo: true }], 'Il vecchio smette di ricevere. Dovrai iscriverti in ntfy al nuovo codice.'); if (r) {
                Notifiche.rigenera();
                avviso('Nuovo codice creato.');
            } } }, 'Nuovo codice')),
        h('div.tenue.piccolo', null, futuri + ' notifiche programmate nei prossimi giorni.'),
        h('div.gruppo-titolo', null, 'Cosa ricevere'),
        tipo('promemoria', 'Promemoria di eventi e task', 'quelli impostati negli eventi e nei promemoria con orario'),
        tipo('studio', 'Studio di oggi', 'la mattina: gli step del piano del giorno'),
        tipo('sera', 'Ripasso prima di dormire', 'la sera dei giorni di studio: 10–15 min di richiamo'),
        tipo('esami', 'Esami e simulazioni vicini', '7, 3 e 1 giorno prima'),
        h('div.gruppo-titolo', null, 'Orari'),
        riga('Studio di oggi', ora('ntfyMattino', Notifiche.PRED.mattino)),
        riga('Ripasso serale', ora('ntfySera', Notifiche.PRED.sera)),
        riga('Silenzio dalle', ora('ntfySilenzioDa', Notifiche.PRED.silDa)),
        riga('alle', ora('ntfySilenzioA', Notifiche.PRED.silA)),
        h('div.tenue.piccolo', null, 'Le notifiche che cadono nel silenzio arrivano alla fine del silenzio.'),
        h('div.gruppo-titolo', null, 'Categorie private (testo generico)'),
        h('div.tenue.piccolo', null, 'I testi passano dal server pubblico ntfy.sh senza cifratura. Per queste categorie arriva solo «Promemoria».'),
        categorie().map(c => h('div.widget-riga', null, h('span.nome', null, h('span.campione', { style: { background: c.colore, display: 'inline-block', width: '12px', height: '12px', marginRight: '8px', verticalAlign: 'middle' } }), c.nome), interr(priv.has(c.id), v => { v ? priv.add(c.id) : priv.delete(c.id); salva({ ntfyPrivate: Array.from(priv) }); }))),
    ] : null);
}
function sezioneStudio(salva) {
    const i = imp();
    const num = (k, def, min, max) => h('input', { type: 'number', min: String(min), max: String(max), inputMode: 'numeric', value: String(i[k] || def), onchange: (e) => salva({ [k]: Math.max(min, Math.min(max, parseInt(e.target.value, 10) || def)) }) });
    return scheda('Studio', riga('Sessione di studio', num('pomodoro', 25, 5, 180), h('span.dopo', null, 'min')), riga('Pausa', num('pausa', 5, 1, 60), h('span.dopo', null, 'min')), riga('Soglia "da rifare"', num('sogliaErrori', 70, 0, 100), h('span.dopo', null, '%')), riga('Ripassi al giorno', num('ripassoMinuti', 30, 10, 240), h('span.dopo', null, 'min')), h('div.tenue.piccolo', null, 'I ripassi (Oggi → Ripassi di oggi) riprogrammano le schede fatte con la ripetizione spaziata (FSRS): tornano quando stai per dimenticarle, prima se il punteggio era basso. Circa ' + Ripassi.MIN_SCHEDA + ' min a scheda.'));
}
// ---------- Trascinamento degli eventi (vista Giorno/Settimana) ----------
// Tieni premuto (circa 0,3 s) e trascina per spostare; trascina la lineetta in basso per cambiare la durata.
// Passi di 15 minuti; nella settimana si può spostare anche di giorno. Le serie chiedono "solo questo / tutta la serie".
const PASSO = 15;
function trascinabile(el, o, nGiorni) {
    let x0 = 0, y0 = 0, attivo = false, ridim = false, dMin = 0, dGiorni = 0, timer = 0, larg = 0, mosso = false, pid = -1;
    const reset = () => { clearTimeout(timer); el.classList.remove('trascino'); el.style.transform = ''; el.style.height = el.dataset.h || el.style.height; attivo = false; pid = -1; };
    el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0)
            return;
        x0 = e.clientX;
        y0 = e.clientY;
        mosso = false;
        dMin = 0;
        dGiorni = 0;
        pid = e.pointerId;
        ridim = e.target.classList.contains('gr-maniglia');
        larg = el.parentElement.getBoundingClientRect().width;
        el.dataset.h = el.style.height;
        const parti = () => { attivo = true; el.classList.add('trascino'); try {
            el.setPointerCapture(pid);
        }
        catch (_) { /* niente */ } try {
            navigator.vibrate && navigator.vibrate(15);
        }
        catch (_) { /* niente */ } };
        if (e.pointerType === 'mouse' || ridim)
            parti();
        else
            timer = window.setTimeout(parti, 300);
    });
    el.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pid)
            return;
        const dx = e.clientX - x0, dy = e.clientY - y0;
        if (!attivo) {
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8)
                clearTimeout(timer);
            return;
        }
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3)
            mosso = true;
        dMin = Math.round((dy / ORA_PX) * 60 / PASSO) * PASSO;
        if (ridim) {
            const h0 = parseFloat(el.dataset.h || '0');
            el.style.height = Math.max(ORA_PX / 4, h0 + (dMin / 60) * ORA_PX) + 'px';
            return;
        }
        dGiorni = nGiorni > 1 ? Math.round(dx / larg) : 0;
        el.style.transform = 'translate(' + dGiorni * larg + 'px,' + (dMin / 60) * ORA_PX + 'px)';
    });
    el.addEventListener('touchmove', (e) => { if (attivo)
        e.preventDefault(); }, { passive: false });
    const fine = (e) => {
        if (e.pointerId !== pid)
            return;
        const eraAttivo = attivo && mosso, dm = dMin, dg = dGiorni, r = ridim;
        reset();
        if (!eraAttivo || (!dm && !dg))
            return;
        el.dataset.trascinato = '1';
        setTimeout(() => delete el.dataset.trascinato, 50);
        spostaOccorrenza(o, r ? 0 : dm + dg * 1440, dm);
    };
    el.addEventListener('pointerup', fine);
    el.addEventListener('pointercancel', (e) => { if (e.pointerId === pid)
        reset(); });
    // dopo un trascinamento non deve aprirsi l'editor
    el.addEventListener('click', (e) => { if (el.dataset.trascinato) {
        e.stopImmediatePropagation();
        e.preventDefault();
    } }, true);
    return el;
}
/** Sposta un'occorrenza: deltaInizio (min) sposta tutto, deltaFine (min) allunga/accorcia solo la fine (ridimensionamento). */
async function spostaOccorrenza(o, deltaInizio, deltaFine) {
    const ridim = deltaInizio === 0;
    const nuovoI = piuMinuti(o.inizio, deltaInizio), nuovaF = piuMinuti(o.fine, ridim ? deltaFine : deltaInizio);
    if (nuovaF <= nuovoI)
        return;
    const ev = Stato.prendi(o.ev.id);
    if (!ev)
        return;
    if (!ev.rrule) {
        ev.inizio = dtStr(nuovoI);
        ev.fine = dtStr(nuovaF);
        Stato.salva(ev);
        avviso('Spostato: ' + ev.titolo + ' · ' + dataBreve(nuovoI) + ' ' + hm(nuovoI) + '–' + hm(nuovaF));
        return;
    }
    const s = await chiedi('Evento ricorrente', [{ testo: 'Solo questo evento', valore: 'uno' }, { testo: 'Tutta la serie', valore: 'tutti' }], ev.titolo);
    if (s === 'uno') {
        ev.exdate = (ev.exdate || []).concat([o.chiave]);
        Stato.salva(ev);
        Stato.salva({ ...JSON.parse(JSON.stringify(ev)), id: uid(), rrule: undefined, exdate: undefined, serieId: ev.id, inizio: dtStr(nuovoI), fine: dtStr(nuovaF) });
    }
    else if (s === 'tutti') {
        const i0 = piuMinuti(daDt(ev.inizio), deltaInizio), f0 = piuMinuti(daDt(ev.fine), ridim ? deltaFine : deltaInizio);
        ev.inizio = dtStr(i0);
        ev.fine = dtStr(f0);
        Stato.salva(ev);
    }
}

// ============================================================
// 07-main.ts — Avvio, struttura della pagina, tema, avvisi in-app.
// ============================================================
const VERSIONE = '0.28.0';
function applicaTema() {
    const i = imp();
    const scuro = i.tema === 'scuro' || (i.tema === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.tema = scuro ? 'scuro' : 'chiaro';
    const r = document.documentElement, st = r.style;
    st.setProperty('--accento', i.accento);
    if (i.sfondo)
        st.setProperty('--bg', i.sfondo);
    else
        st.removeProperty('--bg');
    const FONT = { sistema: '', arrotondato: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif', serif: 'ui-serif, "New York", Georgia, "Times New Roman", serif', mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' };
    if (i.font && FONT[i.font])
        st.setProperty('--font', FONT[i.font]);
    else
        st.removeProperty('--font');
    st.setProperty('--scala', String(i.scala || 1));
    st.setProperty('--raggio', (i.raggio != null ? i.raggio : 14) + 'px');
    r.dataset.densita = i.densita || 'comoda';
    r.dataset.nav = i.nav || 'auto';
    r.dataset.vetro = i.vetro === false || i.vetro === 'no' ? 'no' : 'si'; // v0.20: vetro leggero (disattivabile)
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta)
        meta.setAttribute('content', i.sfondo || (scuro ? '#0e1014' : '#f4f5f8'));
}
/** Ricostruisce l'intera schermata (le viste sono leggere: va benissimo così). */
function disegna() {
    const app = document.getElementById('app');
    // ricordo lo scorrimento della griglia oraria per non "saltare" a ogni salvataggio
    const vecchiaGriglia = app.querySelector('.gr-scroll');
    const scrollGriglia = vecchiaGriglia ? vecchiaGriglia.scrollTop : -1;
    const vecchioMain = app.querySelector('main');
    const scrollMain = vecchioMain ? vecchioMain.scrollTop : 0;
    const stessaScheda = vecchioMain && vecchioMain.dataset.scheda === UI.scheda + (UI.scheda === 'cal' ? UI.vista : '');
    const titoli = { oggi: 'Oggi', cal: 'Calendario', studio: 'Studio', appunti: 'Appunti', task: 'Promemoria', note: 'Note', altro: 'Impostazioni', cerca: 'Cerca' };
    const vista = UI.scheda === 'oggi' ? vistaOggi() : UI.scheda === 'cal' ? vistaCalendario() : UI.scheda === 'studio' ? vistaStudio() : UI.scheda === 'task' ? vistaTask()
        : UI.scheda === 'note' ? vistaNote() : UI.scheda === 'appunti' ? vistaAppunti() : UI.scheda === 'cerca' ? vistaCerca() : vistaAltro();
    const daFare = Stato.tutti('task').filter(t => !t.fatto && t.scadenza && (taskScaduto(t) || t.scadenza.slice(0, 10) === ymd(oggi()))).length;
    const schede = [['oggi', 'Oggi', 'oggi'], ['cal', 'Calendario', 'cal'], ['studio', 'Studio', 'studio'], ['appunti', 'Appunti', 'appunti'], ['task', 'Promemoria', 'task'], ['note', 'Note', 'note'], ['altro', 'Altro', 'altro']];
    const nascoste = imp().tabNascoste || [];
    const nav = h('nav.tabbar', { 'aria-label': 'Sezioni' }, schede.filter(([s]) => s === 'oggi' || s === 'altro' || !nascoste.includes(s)).map(([s, t, ic]) => h('button' + (UI.scheda === s ? '.attivo' : ''), { onclick: () => { if (s === 'studio')
            UI.studioSub = null; vai(s); }, 'aria-current': UI.scheda === s ? 'page' : null }, h('span.tab-ico', null, icona(ic), s === 'task' && daFare ? h('span.badge', null, String(daFare)) : null), h('span.tab-eti', null, t))));
    const giornoNuovo = UI.scheda === 'cal' ? UI.data : undefined;
    const nuovo = () => UI.scheda === 'task' ? apriTask() : UI.scheda === 'note' ? apriNota() : UI.scheda === 'appunti' ? apriAppunto() : apriNuovo(giornoNuovo);
    const main = h('main' + (stessaScheda ? '' : '.entra'), { 'data-scheda': UI.scheda + (UI.scheda === 'cal' ? UI.vista : '') }, vista);
    svuota(app);
    aggiungi(app, [
        h('header.testata', null, h('h1', null, titoli[UI.scheda]), h('div.testata-azioni', null, Drive.stato.sync === 'spento' ? null : h('button.sync-ind', { 'aria-label': descrSync().testo, title: descrSync().testo, onclick: () => { if (Drive.stato.sync === 'errore' || Drive.stato.sync === 'attesa')
                Drive.login();
            else
                vai('altro'); } }, h('span.sync-pallino.' + descrSync().cls)), h('button.btn-ico', { 'aria-label': 'Cerca', onclick: () => vai('cerca') }, icona('cerca')), h('button.btn-ico.solo-pc', { 'aria-label': 'Nuovo', onclick: nuovo }, icona('piu')))),
        nav, main,
        UI.scheda === 'altro' || UI.scheda === 'cerca' || UI.scheda === 'studio' ? null : h('button.fab', { 'aria-label': 'Nuovo', onclick: nuovo }, icona('piu', 26)),
    ]);
    const griglia = app.querySelector('.gr-scroll');
    if (griglia) {
        if (scrollGriglia >= 0 && stessaScheda)
            griglia.scrollTop = scrollGriglia;
        else
            griglia.scrollTop = Math.max(0, (Math.min(new Date().getHours(), 20) - 1.5) * ORA_PX); // parte vicino all'ora attuale
    }
    if (stessaScheda)
        main.scrollTop = scrollMain;
}
// ---------- Avvisi in-app (Livello 1 dei promemoria) ----------
// Controlla ogni 30 s cosa è "scattato" dall'ultimo controllo; all'apertura
// mostra anche ciò che è scattato mentre l'app era chiusa (ultime 12 ore).
function controllaAvvisi() {
    const CHIAVE = 'imc-ultimo-controllo';
    const adesso = Date.now();
    let ultimo = adesso - 60000;
    try {
        const v = parseInt(localStorage.getItem(CHIAVE) || '', 10);
        if (v)
            ultimo = Math.max(v, adesso - 12 * 3600000);
    }
    catch (_) { /* niente */ }
    try {
        localStorage.setItem(CHIAVE, String(adesso));
    }
    catch (_) { /* niente */ }
    for (const o of occorrenzeTra(new Date(ultimo - 86400000), new Date(adesso + 3 * 86400000))) {
        if (o.fine.getTime() < adesso)
            continue; // già finito: inutile avvisare
        for (const min of o.ev.promemoria || []) {
            const scatto = o.inizio.getTime() - min * 60000;
            if (scatto > ultimo && scatto <= adesso) {
                const quando = stessoGiorno(o.inizio, new Date()) ? 'alle ' + hm(o.inizio) : dataRelativa(o.inizio).toLowerCase() + ' alle ' + hm(o.inizio);
                avviso('🔔 ' + o.ev.titolo + (o.ev.tuttoIlGiorno ? ' — ' + dataRelativa(o.inizio).toLowerCase() : ' — ' + quando), 15000, () => apriEvento(o.ev, o));
            }
        }
    }
    for (const t of Stato.tutti('task')) {
        if (t.fatto || !t.scadenza || t.scadenza.length <= 10)
            continue;
        const scatto = daDt(t.scadenza).getTime();
        if (scatto > ultimo && scatto <= adesso)
            avviso('☑️ ' + t.titolo + ' — scade adesso', 15000, () => apriTask(t));
    }
}
async function avvia() {
    await Stato.carica();
    applicaTema();
    const v = imp().vistaIniziale;
    if (v && v !== 'oggi') {
        UI.scheda = 'cal';
        UI.vista = v;
    }
    Stato.ascolta(disegna);
    Ripassi.inizializza();
    Stato.pulisci(); // v0.17: lapidi vecchie del registro notifiche
    Stato.ascolta(() => { Ripassi.inizializza(); }); // v0.7: memoria per le schede fatte (anche da altri dispositivi)
    Stato.ascolta(Notifiche.programma); // v0.7: riallinea le notifiche sul telefono a ogni modifica
    Drive.ascolta(() => { if (!document.querySelector('.foglio-sfondo'))
        disegna(); });
    disegna();
    Drive.precarica();
    Timer.parti();
    Studio.caricaDalSito();
    if (Drive.collegato && navigator.onLine)
        Drive.sincronizza(false);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applicaTema);
    controllaAvvisi();
    setInterval(controllaAvvisi, 30000);
    Notifiche.programma();
    // Al ritorno sull'app (es. dalla Home dell'iPhone) aggiorno giorno e avvisi.
    let giornoMostrato = ymd(new Date());
    document.addEventListener('visibilitychange', () => {
        if (document.hidden)
            return;
        controllaAvvisi();
        Timer.aggiorna();
        if (Drive.collegato)
            Drive.sincronizza(false);
        Notifiche.programma();
        if (giornoMostrato !== ymd(new Date())) {
            giornoMostrato = ymd(new Date());
            UI.data = oggi();
        }
        if (!document.querySelector('.foglio-sfondo'))
            disegna();
    });
    // Service worker: cache dell'app per l'uso offline (solo sul sito vero, non nell'anteprima).
    if ('serviceWorker' in navigator && location.protocol === 'https:' && document.querySelector('link[rel="manifest"]')) {
        navigator.serviceWorker.register('sw.js').catch(() => { });
    }
    // Chiedo al browser di non cancellare i dati locali quando lo spazio scarseggia.
    try {
        if (navigator.storage && navigator.storage.persist)
            navigator.storage.persist();
    }
    catch (_) { /* niente */ }
}
avvia().catch(err => {
    document.getElementById('app').textContent = 'Errore di avvio: ' + (err && err.message || err);
});
