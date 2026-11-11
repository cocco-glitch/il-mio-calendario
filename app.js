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
function fmt(d, o) { return new Intl.DateTimeFormat('it-IT', o).format(d); }
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
    };
})();

// ============================================================
// 03-modello.ts — Tipi dei dati, stato in memoria, ricorrenze.
// ============================================================
// ---------- Stato ----------
const Stato = (() => {
    const rec = new Map();
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
                await DB.salva(nuovi);
            }
        },
        /** Tutti i record non eliminati di un tipo. */
        tutti(type) {
            const out = [];
            rec.forEach(r => { if (r.type === type && !r.deleted)
                out.push(r); });
            return out;
        },
        prendi(id) {
            const r = rec.get(id);
            return r && !r.deleted ? r : undefined;
        },
        /** Salva un record aggiornando updatedAt (serve alla sincronizzazione). */
        salva(r, silenzioso = false) {
            r.updatedAt = Date.now();
            rec.set(r.id, r);
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
                const mio = rec.get(e.id);
                if (!mio || (e.updatedAt || 0) > (mio.updatedAt || 0)) {
                    rec.set(e.id, e);
                    cambiati.push(e);
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
function icona(nome, dim = 22) {
    const s = h('span.ico');
    s.innerHTML = '<svg viewBox="0 0 24 24" width="' + dim + '" height="' + dim + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONE[nome] || '') + '</svg>';
    return s;
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
const ACCOUNT_AMMESSO = 'cocco.haloa@gmail.com';
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
        let q = "trashed = false and mimeType != 'application/vnd.google-apps.folder'";
        if (mime)
            q += " and mimeType = '" + mime + "'";
        if (testo.trim())
            q += " and name contains '" + testo.trim().replace(/\\/g, '').replace(/'/g, "\\'") + "'";
        const r = await api('files', { query: { q, fields: 'files(id,name,mimeType,webViewLink,modifiedTime)', orderBy: 'modifiedTime desc', pageSize: '40' } });
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
                if (email.toLowerCase() !== ACCOUNT_AMMESSO) {
                    try {
                        google.accounts.oauth2.revoke(token, () => { });
                    }
                    catch (_) { /* niente */ }
                    token = '';
                    throw new Error('Questa app è privata: l\'account ' + email + ' non è autorizzato.');
                }
                stato.email = email;
                LS.set('email', stato.email);
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
        caricaAllegato, scegliConPicker, scaricaBlob, scaricaTesto, elenca, trovaFile, carica, idCartella, preparaCartelle, tokenValido,
        elencaTutti, esportaCsv, cerca,
        get collegato() { return !!stato.email; },
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
                for (const p of [...Studio.pkPiani(), ...Studio.pianiVirtuali()])
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
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('section.card', null, h('div.tenue.piccolo', null, 'Qui finiscono le schede con punteggio sotto la soglia o segnate "da rifare". Rifalle e inserisci il nuovo punteggio: escono da sole. Compaiono anche nei giorni del piano di raffinamento.'), riga('Soglia', soglia, h('span.dopo', null, '%'))), lista.length ? null : vuoto('Nessuna scheda da rifare. 🎉'), Array.from(perMat.entries()).map(([m, xs]) => h('section.card', null, h('h2.card-titolo', { style: { color: coloreMateria(m) } }, nomeMateria(m) + ' · ' + xs.length), xs.sort((a, b) => (Studio.prog(a.s.id).punteggio ?? 101) - (Studio.prog(b.s.id).punteggio ?? 101)).map(x => {
        const p = Studio.prog(x.s.id);
        return h('button.voce-lista', { onclick: () => apriScheda(x.pk, x.mat.m, x.mi.n, x.s) }, h('span.barra', { style: { background: coloreMateria(m) } }), h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, x.mi.n + ' · ' + x.s.titolo), h('span.voce-sotto', { style: { whiteSpace: 'normal' } }, (p.punteggio != null ? p.punteggio + '%' : 'segnata a mano') + (p.data ? ' · ' + fmt(daYmd(p.data), { day: 'numeric', month: 'short' }) : '') + (p.nota ? ' · ' + p.nota.slice(0, 60) : ''))));
    }))));
}
function widgetErrori() {
    const n = tutteLeSchede().filter(x => daRifare(x.s.id)).length;
    if (!n)
        return null;
    return scheda('Schede da rifare', h('button.voce-lista', { onclick: () => { UI.studioVista = 'errori'; UI.studioSub = null; vai('studio'); } }, h('span.voce-corpo', null, h('span.voce-titolo', null, n + (n === 1 ? ' scheda da rifare' : ' schede da rifare')), h('span.voce-sotto', null, 'Punteggio sotto il ' + sogliaErrori() + '% o segnate a mano')), icona('dx', 18)));
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
        scrivi({ inizio: Date.now(), durata: durate().studio, fase: 'studio', ...o });
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
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('section.card', null, h('h2.card-titolo', null, 'Tempo di studio'), h('div.numeri', null, numero(durata(minutiStudio(g, g)), 'oggi'), numero(durata(minutiStudio(piuGiorni(g, -6), g)), 'ultimi 7 giorni'), numero(durata(minutiStudio(piuGiorni(g, -29), g)), 'ultimi 30')), h('div.grafico', { role: 'img', 'aria-label': 'Minuti di studio negli ultimi 14 giorni' }, perGiorno.map((o, i) => h('div.colonna', { title: dataBreve(giorni[i]) + ': ' + durata(Object.values(o).reduce((a, b) => a + b, 0)) }, h('div.pila', null, Object.entries(o).map(([m, v]) => h('div', { style: { height: (v / max) * 100 + '%', background: m === '?' ? 'var(--tenue)' : coloreMateria(m) } }))), h('span', null, String(giorni[i].getDate()))))), ses.length ? null : h('div.tenue.piccolo', null, 'Usa il timer (▶) per registrare il tempo di studio.')), peggiore ? h('div.indicatore.ritardo', null, 'Materia più indietro: ' + nomeMateria(peggiore.m) + ' (' + peggiore.rit + ' step in ritardo)') : null, righe.map(r => h('section.card', null, h('h2.card-titolo', { style: { color: coloreMateria(r.m) } }, nomeMateria(r.m)), h('div.numeri', null, numero(r.Pf + '/' + r.P, 'prioritarie'), numero(r.fatte + '/' + r.tot, 'schede fatte'), numero(r.media != null ? r.media + '%' : '—', 'media punteggi')), barra(r.fatte, r.tot, coloreMateria(r.m)), h('div.tenue.piccolo', null, durata(r.min7) + ' negli ultimi 7 giorni · ' + r.err + ' da rifare' + (r.rit ? ' · ' + r.rit + ' step in ritardo' : '')))));
}
// ---------- Esami ----------
function giorniA(data) { return Math.round((daYmd(data).getTime() - oggi().getTime()) / 86400000); }
function testoCountdown(d) { return d === 0 ? 'oggi!' : d === 1 ? 'domani' : d < 0 ? 'passato' : 'tra ' + d + ' giorni'; }
function vistaEsami() {
    const esami = Stato.tutti('esame').sort((a, b) => a.data < b.data ? -1 : 1);
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, esami.length ? h('section.card', null, esami.map(e => {
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
    function pkStep() { return Stato.tutti('pacchetto').map(r => r.contenuto).filter(c => c && c.tipo === 'step').sort((a, b) => a.step - b.step); }
    function pkPiani() { return Stato.tutti('pacchetto').map(r => r.contenuto).filter(c => c && c.tipo === 'piano').sort((a, b) => (a.giorni[0] || { data: '' }).data < (b.giorni[0] || { data: '' }).data ? -1 : 1); }
    /** Il piano principale (teoria). */
    function pkPiano() { return pkPiani().find(p => p.id === 'piano') || pkPiani()[0] || null; }
    /** Inserisce/aggiorna un pacchetto. I progressi stanno altrove: non si perdono. */
    function importa(c) {
        if (!c || c.formato !== 'pacchetto-studio' || !c.id || !c.tipo)
            return false;
        const id = 'pk-' + c.id, mio = Stato.rec.get(id);
        if (mio && !mio.deleted && JSON.stringify(mio.contenuto) === JSON.stringify(c))
            return false;
        // mai sostituire un pacchetto con una versione più vecchia (es. sito vs Drive)
        if (mio && !mio.deleted && mio.contenuto && String(mio.contenuto.aggiornato || '') > String(c.aggiornato || ''))
            return false;
        Stato.salva({ id, type: 'pacchetto', updatedAt: 0, contenuto: c });
        // esami indicati dal pacchetto: creati una volta sola (poi li gestisce l'utente)
        for (const e of c.esami || [])
            if (e && e.id && !Stato.rec.has(e.id))
                Stato.salva({ id: e.id, type: 'esame', updatedAt: 0, nome: e.nome, data: e.data, ora: e.ora });
        return true;
    }
    /** Pacchetti distribuiti col sito (base di partenza). */
    async function caricaDalSito() {
        try {
            const r = await fetch('studio/indice.json', { cache: 'no-cache' });
            if (!r.ok)
                return;
            for (const f of await r.json()) {
                const p = await fetch('studio/' + f, { cache: 'no-cache' });
                if (p.ok)
                    importa(await p.json());
            }
        }
        catch (_) { /* offline o anteprima */ }
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
    }
    /** Pagine del libro: '141-144,146' o appendice 'A1-A4'. Restituisce stringhe ('141', 'A2'). */
    function pagineSet(s) {
        const o = new Set();
        for (const p of (s || '').split(',').map(x => x.trim()).filter(Boolean)) {
            const m = p.match(/^([A-Z]?)(\d+)(?:-[A-Z]?(\d+))?$/);
            if (!m)
                continue;
            for (let i = +m[2]; i <= +(m[3] || m[2]); i++)
                o.add(m[1] + i);
        }
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
    function trovaSotto(k) {
        for (const pk of pkStep())
            for (const mat of pk.materie)
                for (const sub of mat.sottostep)
                    if (sub.k === k)
                        return { pk, mat, sub };
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
        for (const p of [...pkPiani(), ...pianiVirtuali()])
            for (const gg of p.giorni)
                for (const v of gg.voci)
                    if (dataVoce(v, gg, p.id) === k)
                        out.push({ v, g: gg, spostata: gg.data !== k, p });
        return out;
    }
    /** Step (non speciali) con data già passata e non completati, in tutti i piani. */
    function inRitardo() {
        const oggiK = ymd(oggi()), out = [];
        for (const p of [...pkPiani(), ...pianiVirtuali()])
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
    return { pkStep, pkPiano, pkPiani, pianiVirtuali, segnaStepAMano, importa, caricaDalSito, caricaDaDrive, prog, fatta, segna, pagineSet, intervalli, numeri, schedeDi, trovaSotto, etichetta,
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
async function apriQuiz(pk, m, micro, s) {
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
    const v = visore(micro + ' · scheda ' + s.k + '/' + s.n, () => apriScheda(pk, m, micro, s));
    v.corpo.appendChild(h('div.vuoto.centro', null, 'Scarico il quiz da Drive…'));
    try {
        let html = await Drive.scaricaTesto(await Studio.idQuiz(pk, m, micro, s));
        // Nell'iframe isolato localStorage non esiste: ne fornisco uno in memoria, solo a schermo.
        const toppa = '<script>try{window.localStorage.getItem("x")}catch(e){(function(){var m={};var s={getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}}};try{Object.defineProperty(window,"localStorage",{value:s});Object.defineProperty(window,"sessionStorage",{value:s})}catch(_){}})()}<\/script>';
        html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, x => x + toppa) : html.replace(/<html[^>]*>/i, x => x + toppa);
        svuota(v.corpo);
        v.corpo.appendChild(h('iframe.visore-frame', { sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals', srcdoc: html, title: s.titolo }));
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
function apriScheda(pk, m, micro, s) {
    const p = Studio.prog(s.id);
    const fatta = h('input', { type: 'checkbox', checked: !!(p && p.fatta) });
    const data = h('input', { type: 'date', value: p && p.data || '' });
    const punti = h('input', { type: 'number', min: '0', max: '100', inputMode: 'numeric', placeholder: '%', value: p && p.punteggio != null ? String(p.punteggio) : '' });
    const nota = h('textarea', { rows: 3, placeholder: 'Errori, cose da rivedere…', value: p && p.nota || '' });
    const rifare = h('input', { type: 'checkbox', checked: !!(p && p.daRifare) });
    punti.oninput = () => { if (punti.value !== '')
        fatta.checked = true; };
    const L = pk.risorse.libri[m] || { nome: mat0(pk, m).libro || 'libro' };
    const blocchi = Studio.intervalli(Studio.pagineSet(s.pagine)).split(', ').filter(Boolean);
    const apribili = pk.risorse.libri[m] ? blocchi.filter(b => /^\d/.test(b)) : [];
    const f = foglio({
        titolo: micro + ' · scheda ' + s.k + '/' + s.n,
        corpo: h('div.modulo', null, h('div.gruppo', { style: { padding: '12px 14px' } }, h('div.voce-titolo', { style: { whiteSpace: 'normal' } }, s.titolo), h('div.chips', { style: { marginTop: '8px' } }, h('span.etichetta.' + (s.tipo === 'P' ? 'prior' : 'raff'), null, s.tipo === 'P' ? 'PRIORITARIA' : 'RAFFINAMENTO'), s.problemi ? h('span.etichetta', null, 'Problemi da risolvere') : null)), h('div.bottoni', null, h('button.btn', { onclick: () => { salva(); f.chiudi(); apriQuiz(pk, m, micro, s); } }, pk.proprio ? (s.file ? 'Apri il file' : 'Nessun file') : 'Apri il quiz'), h('button.btn.neutro', { onclick: () => { salva(); f.chiudi(); Timer.avvia({ m, k: m + micro.split('.').slice(0, 2).join('.'), schedaId: s.id, titolo: s.titolo }); } }, '▶ Timer')), pk.proprio ? h('button.btn-testo', { onclick: () => { f.chiudi(); editorSchedaPropria(pk, mat0(pk, m), mat0(pk, m).sottostep.find(ss => ss.microstep.some(mm => mm.schede.some(x => x.id === s.id))), s); } }, 'Modifica scheda') : null, h('div.gruppo', null, riga('Fatta', fatta), riga('Data', data), riga('Punteggio %', punti), riga('Da rifare', rifare)), h('div.tenue.piccolo', null, 'Con un punteggio sotto il ' + sogliaErrori() + '% la scheda va da sola in Studio → Errori.'), h('div.gruppo', null, h('div.gruppo-titolo', null, 'Nota errori'), nota), h('div.gruppo', null, h('div.gruppo-titolo', null, blocchi.length ? 'Libro (' + L.nome + ') — pp. ' + blocchi.join(', ') : 'Nessuna pagina del libro'), h('div.chips', { style: { margin: '4px 0 10px' } }, apribili.map(b => {
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
    const raff = x.p.modo === 'raffinamento', fatto = !x.v.speciale && Studio.stepFatto(x.v.k, x.p), t = Studio.trovaSotto(x.v.k);
    return h('button.voce-lista', { onclick: () => { if (t) {
            UI.studioSub = x.v.k;
            UI.studioVista = 'schede';
            UI.studioStep = t.pk.id;
            vai('studio');
        }
        else {
            UI.studioVista = 'piano';
            UI.studioPiano = x.p.id;
            vai('studio');
        } } }, h('span.barra', { style: { background: x.v.speciale ? 'var(--tenue)' : coloreChiave(x.v.k) } }), h('span.voce-corpo', null, h('span.voce-titolo', null, (fatto ? '✓ ' : '') + (raff && !x.v.speciale ? 'Raffina ' : '') + (x.v.speciale ? x.v.t : Studio.etichetta(x.v.k) + ' · ' + x.v.t)), h('span.voce-sotto', null, x.v.speciale ? x.v.d : testoAvanzamento(x.v.k, x.p), x.spostata ? ' · spostato' : '')));
}
/** "3/9 prioritarie · 19 pag." (teoria) oppure "1 · priorità ... 2 · raffina ..." (raffinamento). */
function testoAvanzamento(k, p) {
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
    return h('button.indicatore.' + (r.length ? 'ritardo' : 'pari'), { onclick: () => { UI.studioVista = 'piano'; vai('studio'); } }, r.length ? 'In ritardo di ' + r.length + ' step: ' + r.map(v => Studio.etichetta(v.k)).join(', ') : 'In pari con il piano');
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
    const voci = [['schede', 'Schede'], ['piano', 'Piano'], ['errori', 'Errori'], ['statistiche', 'Statistiche'], ['esami', 'Esami'], ['syllabus', 'Syllabus'], ['tabelle', 'Tabelle']];
    const seg = h('div.segmenti.scorre', { role: 'tablist' }, voci.map(([v, t]) => h('button' + (UI.studioVista === v ? '.attivo' : ''), { role: 'tab', onclick: () => { UI.studioVista = v; UI.pianoScorso = false; disegna(); } }, t)));
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
        return h('div.pagina', null, seg, indicatoreStudio(), piani.length > 1 ? h('div.chips', null, piani.map(p => h('button.chip' + (p.id === scelto.id ? '.attivo' : ''), { onclick: () => { UI.studioPiano = p.id; UI.pianoScorso = false; disegna(); } }, p.titolo))) : null, scelto.nota ? h('div.tenue.piccolo', null, scelto.nota) : null, vistaPiano(scelto));
    }
    if (UI.studioVista !== 'schede')
        UI.studioVista = 'schede';
    if (!pk)
        return h('div.pagina', null, seg, vuoto('Nessun corso di studio. Crea il tuo corso (qualsiasi materia o esame) oppure aggiorna i pacchetti dal Drive.'), h('button.btn', { onclick: () => editorCorso() }, '+ Nuovo corso di studio'), bottoneDrive());
    const tutte = pk.materie.flatMap(m => m.sottostep.flatMap(Studio.schedeDi)), T = Studio.numeri(tutte);
    return h('div.pagina', null, seg, indicatoreStudio(), h('div.chips', null, pks.map(p => h('button.chip' + (p.id === pk.id ? '.attivo' : ''), { onclick: () => { UI.studioStep = p.id; disegna(); } }, (p.proprio ? '★ ' : '') + p.titolo)), h('button.chip', { onclick: () => editorCorso() }, '+ Nuovo corso')), pk.proprio ? h('div.bottoni', null, h('button.btn.neutro', { onclick: () => editorCorso(pk) }, 'Modifica corso'), h('button.btn.neutro', { onclick: () => editorSottostep(pk) }, '+ Aggiungi argomento')) : null, pk.descrizione ? h('div.tenue.piccolo', null, pk.descrizione) : null, h('section.card', null, h('h2.card-titolo', null, pk.titolo + ' · totale'), h('div.numeri', null, numero(T.Pf + '/' + T.P, 'prioritarie'), numero(T.Rf + '/' + T.R, 'raffinamento'), numero(T.pagLette.size + '/' + T.pagT.size, 'pagine lette')), barra(T.Pf, T.P)), pk.materie.map(m => {
        const N = Studio.numeri(m.sottostep.flatMap(Studio.schedeDi));
        return h('section.card', null, h('h2.card-titolo', { style: { color: coloreMateria(m.m) } }, m.nome + (m.libro ? ' · ' + m.libro : '')), m.sottostep.map(s => {
            const n = Studio.numeri(Studio.schedeDi(s));
            return h('button.voce-lista.sotto', { onclick: () => { UI.studioSub = s.k; disegna(); } }, h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, s.n + ' · ' + s.titolo), h('span.voce-sotto', null, 'Prior. ' + n.Pf + '/' + n.P + ' · Raff. ' + n.Rf + '/' + n.R + ' · pag. ' + n.pagP.size + ' / ' + n.pagR.size + ' / ' + n.pagT.size), h('span.voce-sotto', null, s.posizione), barra(n.Pf, n.P, coloreMateria(m.m))), icona('dx', 18));
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
    return h('div.pagina', null, h('button.btn-testo.indietro', { onclick: () => { UI.studioSub = null; disegna(); } }, '‹ ' + pk.titolo), h('section.card', null, h('h2.sub-titolo', { style: { color: col } }, mat.nome + ' ' + sub.n), h('div.voce-titolo', { style: { whiteSpace: 'normal' } }, sub.titolo), h('div.tenue.piccolo', null, sub.posizione), sub.ripasso ? h('div.tenue.piccolo', null, 'Ripasso: ' + sub.ripasso) : null, barra(n.Pf, n.P, col), h('div.blocchi', null, blocco('PRIORITARIE', 'prior', n.P, n.Pf, n.pagP), blocco('RAFFINAMENTO', 'raff', n.R, n.Rf, n.pagR), blocco('TOTALE', 'tot', n.P + n.R, n.Pf + n.Rf, n.pagT)), h('div.tenue.piccolo', null, 'Pagine lette: ' + n.pagLette.size + ' di ' + n.pagT.size)), h('div.bottoni', null, h('button.btn', { onclick: () => Timer.avvia({ m: mat.m, k: sub.k, titolo: mat.nome + ' ' + sub.n + ' · ' + sub.titolo }) }, '▶ Avvia timer di studio'), pk.proprio ? h('button.btn.neutro', { onclick: () => editorSottostep(pk, mat, sub) }, 'Modifica') : null), pk.proprio ? h('button.btn.neutro', { onclick: () => editorSchedaPropria(pk, mat, sub) }, '+ Aggiungi scheda') : null, !pk.risorse.libri[mat.m] ? null : (h('button.btn.neutro', { onclick: async (e) => {
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
                } } }, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, v.speciale ? v.t : Studio.etichetta(v.k) + ' · ' + v.t), h('span.voce-sotto' + (tardi ? '.scaduto' : ''), { style: { whiteSpace: 'normal' } }, v.speciale ? v.d : testoAvanzamento(v.k, piano), tardi ? ' · in ritardo' : '', go.data !== d ? ' · spostato dal ' + fmt(daYmd(go.data), { day: 'numeric', month: 'short' }) : '')), v.speciale ? null : h('button.btn-testo', { onclick: () => apriSposta(v, go, piano) }, 'Sposta'));
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
const WIDGET = [['esami', 'Prossimi esami'], ['impegni', 'Impegni di oggi'], ['studio', 'Studio di oggi'], ['timer', 'Timer e tempo di studio'], ['errori', 'Schede da rifare'], ['promemoria', 'Promemoria'], ['tabelle', 'Dalle tue tabelle'], ['nota', 'Nota del giorno'], ['domani', 'Domani']];
/** Riquadri di Oggi nell'ordine scelto, senza quelli nascosti (quelli nuovi in fondo). */
function ordineWidget() {
    const i = imp(), ord = (i.widget || []).filter(w => WIDGET.some(x => x[0] === w));
    for (const [w] of WIDGET)
        if (!ord.includes(w))
            ord.push(w);
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
                return Studio.pkPiani().length ? scheda('Studio di oggi', indicatoreStudio(), st.length ? st.map(rigaStudio) : vuoto('Niente dal piano per oggi.')) : null;
            }
            case 'tabelle': {
                const r = righeDelGiorno(g);
                return r.length ? scheda('Dalle tue tabelle', r.map(rigaTabellaGiorno)) : null;
            }
            case 'nota': return scheda('Nota del giorno', area);
            case 'domani': return occDomani.length ? scheda('Domani', occDomani.map(o => rigaOcc(o, domani))) : null;
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
    return h('div.pagina', null, sezDrive, sezioneAspetto(salvaImp), sezioneLayout(salvaImp), sezionePreset(salvaImp), scheda('Categorie', cats, nuovaCat), sezioneStudio(salvaImp), sezioneCalendari(salvaImp), scheda('I miei dati', h('div.tenue.piccolo', null, 'Salvataggio: ' + memoria + '.'), anteprima ? h('div.tenue.piccolo', null, 'Questa è l\'anteprima di prova: i dati restano solo in questo browser e possono andare persi.') : null, h('div.bottoni', null, h('button.btn', { onclick: esporta }, 'Esporta backup'), h('button.btn.neutro', { onclick: () => fileImport.click() }, 'Importa backup'), fileImport)), h('div.tenue.piccolo.centro', null, 'Il mio calendario · v' + VERSIONE));
}
const ACCENTI = ['#6c8cff', '#2fbf8f', '#e9a23b', '#f0708a', '#a78bfa', '#38bdf8', '#f97316', '#64748b'];
const CAMPI_ASPETTO = ['tema', 'accento', 'sfondo', 'font', 'scala', 'densita', 'raggio', 'widget', 'widgetNascosti', 'tabNascoste', 'nav', 'vistaIniziale'];
function sezioneAspetto(salva) {
    const i = imp(), sel = (o, v, k, num = false) => selettore(o, v, function () { salva({ [k]: num ? +this.value : this.value, preset: '' }); });
    return scheda('Aspetto', riga('Tema', sel([['auto', 'Automatico'], ['chiaro', 'Chiaro'], ['scuro', 'Scuro']], i.tema, 'tema')), riga('Colore accento', h('span.anteprima-tema', null, ACCENTI.map(c => h('button.campione' + (c === i.accento ? '.attivo' : ''), { style: { background: c }, 'aria-label': 'Accento ' + c, onclick: () => salva({ accento: c, preset: '' }) })), h('input', { type: 'color', value: i.accento, 'aria-label': 'Altro colore', onchange: (e) => salva({ accento: e.target.value, preset: '' }) }))), riga('Sfondo', h('input', { type: 'color', value: i.sfondo || (document.documentElement.dataset.tema === 'scuro' ? '#0e1014' : '#f4f5f8'), onchange: (e) => salva({ sfondo: e.target.value, preset: '' }) }), i.sfondo ? h('button.btn-testo', { onclick: () => salva({ sfondo: '', preset: '' }) }, 'Del tema') : null), riga('Carattere', sel([['sistema', 'Sistema'], ['arrotondato', 'Arrotondato'], ['serif', 'Serif'], ['mono', 'Monospazio']], i.font || 'sistema', 'font')), riga('Dimensione testo', sel([['0.9', 'Piccolo'], ['1', 'Normale'], ['1.1', 'Grande'], ['1.25', 'Molto grande']], String(i.scala || 1), 'scala', true)), riga('Densità', sel([['comoda', 'Comoda'], ['compatta', 'Compatta']], i.densita || 'comoda', 'densita')), riga('Angoli', sel([['4', 'Squadrati'], ['10', 'Leggeri'], ['14', 'Arrotondati'], ['22', 'Molto arrotondati']], String(i.raggio != null ? i.raggio : 14), 'raggio', true)));
}
function sezioneLayout(salva) {
    const i = imp(), ord = (() => { const o = (i.widget || []).filter(w => WIDGET.some(x => x[0] === w)); for (const [w] of WIDGET)
        if (!o.includes(w))
            o.push(w); return o; })();
    const nasc = new Set(i.widgetNascosti || []), tabN = new Set(i.tabNascoste || []);
    const sposta = (idx, d) => { const o = ord.slice(); const [x] = o.splice(idx, 1); o.splice(idx + d, 0, x); salva({ widget: o, preset: '' }); };
    return scheda('Layout', riga('Vista iniziale', selettore([['oggi', 'Oggi'], ['giorno', 'Giorno'], ['settimana', 'Settimana'], ['mese', 'Mese'], ['agenda', 'Agenda']], i.vistaIniziale, function () { salva({ vistaIniziale: this.value, preset: '' }); })), riga('Barra delle sezioni su PC', selettore([['auto', 'Laterale'], ['basso', 'In basso']], i.nav || 'auto', function () { salva({ nav: this.value, preset: '' }); })), h('div.gruppo-titolo', null, 'Riquadri di Oggi (ordine e visibilità)'), ord.map((w, idx) => h('div.widget-riga', null, h('span.nome', null, (WIDGET.find(x => x[0] === w) || [w, w])[1]), h('button.btn-ico', { 'aria-label': 'Su', disabled: idx === 0, onclick: () => sposta(idx, -1) }, '↑'), h('button.btn-ico', { 'aria-label': 'Giù', disabled: idx === ord.length - 1, onclick: () => sposta(idx, 1) }, '↓'), h('label.interruttore', { title: 'Mostra' }, h('input', { type: 'checkbox', checked: !nasc.has(w), onchange: (e) => { e.target.checked ? nasc.delete(w) : nasc.add(w); salva({ widgetNascosti: Array.from(nasc), preset: '' }); } }), h('span')))), h('div.gruppo-titolo', null, 'Sezioni nella barra'), [['cal', 'Calendario'], ['studio', 'Studio'], ['task', 'Promemoria'], ['note', 'Note']].map(([s, t]) => h('div.widget-riga', null, h('span.nome', null, t), h('label.interruttore', null, h('input', { type: 'checkbox', checked: !tabN.has(s), onchange: (e) => { e.target.checked ? tabN.delete(s) : tabN.add(s); salva({ tabNascoste: Array.from(tabN), preset: '' }); } }), h('span')))));
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
    return scheda('Notifiche e altri calendari', h('div.tenue.piccolo', null, 'Gli avvisi dentro l\'app arrivano solo ad app aperta. Per le notifiche vere sull\'iPhone attiva lo specchio: gli eventi vengono copiati in un calendario Google dedicato («' + GCal.GCAL_NOME + '») e le notifiche arrivano dall\'app Google Calendar o da Calendario di iOS (aggiungendo il tuo account Google). L\'app può toccare solo quel calendario, non gli altri tuoi.'), h('div.widget-riga', null, h('span.nome', null, 'Specchio su Google Calendar'), h('label.interruttore', null, h('input', { type: 'checkbox', checked: !!i.gcal, onchange: (e) => {
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
function sezioneStudio(salva) {
    const i = imp();
    const num = (k, def, min, max) => h('input', { type: 'number', min: String(min), max: String(max), inputMode: 'numeric', value: String(i[k] || def), onchange: (e) => salva({ [k]: Math.max(min, Math.min(max, parseInt(e.target.value, 10) || def)) }) });
    return scheda('Studio', riga('Sessione di studio', num('pomodoro', 25, 5, 180), h('span.dopo', null, 'min')), riga('Pausa', num('pausa', 5, 1, 60), h('span.dopo', null, 'min')), riga('Soglia "da rifare"', num('sogliaErrori', 70, 0, 100), h('span.dopo', null, '%')));
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
const VERSIONE = '0.6.1';
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
    const titoli = { oggi: 'Oggi', cal: 'Calendario', studio: 'Studio', task: 'Promemoria', note: 'Note', altro: 'Impostazioni', cerca: 'Cerca' };
    const vista = UI.scheda === 'oggi' ? vistaOggi() : UI.scheda === 'cal' ? vistaCalendario() : UI.scheda === 'studio' ? vistaStudio() : UI.scheda === 'task' ? vistaTask()
        : UI.scheda === 'note' ? vistaNote() : UI.scheda === 'cerca' ? vistaCerca() : vistaAltro();
    const daFare = Stato.tutti('task').filter(t => !t.fatto && t.scadenza && (taskScaduto(t) || t.scadenza.slice(0, 10) === ymd(oggi()))).length;
    const schede = [['oggi', 'Oggi', 'oggi'], ['cal', 'Calendario', 'cal'], ['studio', 'Studio', 'studio'], ['task', 'Promemoria', 'task'], ['note', 'Note', 'note'], ['altro', 'Altro', 'altro']];
    const nascoste = imp().tabNascoste || [];
    const nav = h('nav.tabbar', { 'aria-label': 'Sezioni' }, schede.filter(([s]) => s === 'oggi' || s === 'altro' || !nascoste.includes(s)).map(([s, t, ic]) => h('button' + (UI.scheda === s ? '.attivo' : ''), { onclick: () => { if (s === 'studio')
            UI.studioSub = null; vai(s); }, 'aria-current': UI.scheda === s ? 'page' : null }, h('span.tab-ico', null, icona(ic), s === 'task' && daFare ? h('span.badge', null, String(daFare)) : null), h('span.tab-eti', null, t))));
    const giornoNuovo = UI.scheda === 'cal' ? UI.data : undefined;
    const nuovo = () => UI.scheda === 'task' ? apriTask() : UI.scheda === 'note' ? apriNota() : apriNuovo(giornoNuovo);
    const main = h('main', { 'data-scheda': UI.scheda + (UI.scheda === 'cal' ? UI.vista : '') }, vista);
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
    // Al ritorno sull'app (es. dalla Home dell'iPhone) aggiorno giorno e avvisi.
    let giornoMostrato = ymd(new Date());
    document.addEventListener('visibilitychange', () => {
        if (document.hidden)
            return;
        controllaAvvisi();
        Timer.aggiorna();
        if (Drive.collegato)
            Drive.sincronizza(false);
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
