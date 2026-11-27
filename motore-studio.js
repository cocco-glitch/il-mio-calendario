"use strict";
const ComponiQuiz = (() => {
    const ORD = ['da_studiare', 'da_consolidare', 'in_consolidamento', 'consolidato', 'non_verificato'];
    const DEBOLI = ['da_studiare', 'da_consolidare'];
    const perScheda = (t) => t === 'deboli' ? VerificaConcetti.PER * VerificaConcetti.MAX_CON : VerificaConcetti.MAX_CON;
    function candidati(tipo, mem, giorno, materiaDi, fatte, materie) {
        const per = new Map();
        for (const m of mem) {
            if (!m || m.deleted || !String(m.er || '').startsWith('con:') || m.ripiego || !m.sk || !m.etichetta || !m.ultimo)
                continue;
            const p = Concetti.stato(m, giorno), scad = m.due <= giorno;
            if (tipo === 'deboli' && !scad && !DEBOLI.includes(p.stato))
                continue;
            const l = per.get(m.sk) || [];
            l.push({ e: m.etichetta, p, scad });
            per.set(m.sk, l);
        }
        if (tipo === 'cumulativo')
            for (const sk of fatte)
                if (!per.has(sk))
                    per.set(sk, []);
        const peso = (x) => (x.scad ? 0 : 1) + ORD.indexOf(x.p.stato) * 10 + (x.p.r === null ? 1 : x.p.r);
        const out = [];
        per.forEach((l, sk) => {
            const materia = materiaDi(sk);
            if (materie.length && !materie.includes(materia))
                return;
            const c = l.sort((a, b) => peso(a) - peso(b) || (a.e < b.e ? -1 : 1)).slice(0, VerificaConcetti.MAX_CON);
            out.push({ sk, etichette: c.map(z => z.e), materia, r: c.length ? Math.min(...c.map(z => z.p.r === null ? 1 : z.p.r)) : 0, peggiore: c.length ? c[0].p.stato : 'non_verificato' });
        });
        out.sort((a, b) => tipo === 'deboli' ? ORD.indexOf(a.peggiore) - ORD.indexOf(b.peggiore) || a.r - b.r || (a.sk < b.sk ? -1 : 1) : a.r - b.r || (a.sk < b.sk ? -1 : 1));
        const code = new Map();
        for (const s of out) {
            const l = code.get(s.materia) || [];
            l.push(s);
            code.set(s.materia, l);
        }
        const alt = [], liste = Array.from(code.values());
        for (let i = 0; alt.length < out.length; i++)
            for (const l of liste)
                if (l[i])
                    alt.push(l[i]);
        return alt;
    }
    function intreccia(gruppi, n) {
        const out = [];
        for (let i = 0; out.length < n && gruppi.some(g => g[i]); i++)
            for (const g of gruppi)
                if (g[i] && out.length < n)
                    out.push(g[i]);
        return out;
    }
    function dividi(r, skDi) {
        const per = new Map();
        for (const e of r.dettagli || []) {
            const sk = skDi.get(e.id);
            if (!sk)
                continue;
            const l = per.get(sk) || [];
            l.push(e);
            per.set(sk, l);
        }
        const out = new Map();
        per.forEach((det, sk) => {
            const giuste = det.filter(e => e.ok).length, sb = det.filter(e => !e.ok);
            out.set(sk, { imc: 'quiz-risultato', pct: Math.round(giuste * 100 / det.length), giuste, totale: det.length, livelli: [], debole: null, errori: false,
                domandeSvolte: det.map(e => e.q), sbagliate: sb.map(e => [e.q, e.giusta, e.spieg || '']), dettagli: det, verifica: true, misto: true });
        });
        return out;
    }
    const matSk = (sk) => { const t = trovaScheda(sk); return t ? t.m : '?'; };
    const fatte = () => Stato.tutti('progresso').filter(p => !p.deleted && p.fatta && trovaScheda(p.id.slice(5))).map(p => p.id.slice(5));
    async function domande(cand, n, per) {
        const gruppi = [], immagini = {}, focus = new Map();
        const viste = new Map(Stato.tutti('statq').filter(s => !s.deleted).map(s => [s.id, s.ultima || '']));
        let tot = 0;
        for (const c of cand) {
            if (tot >= n)
                break;
            const t = trovaScheda(c.sk);
            if (!t)
                continue;
            let b;
            try {
                b = await Banca.scheda(t.pk, t.m, t.micro, t.s);
            }
            catch (e) {
                console.warn('ComponiQuiz: banca ' + c.sk, e);
                continue;
            }
            const lista = Concetti.etichette(b.focus || ''), doms = b.domande.map(d => ({ ...d, sk: c.sk }));
            if (!doms.length)
                continue;
            const ass = Concetti.assegna(c.sk, t.s.titolo, doms.map(d => ({ id: d.id, q: d.q, giusta: d.t === 'mcq' && d.o ? d.o[0] : String(d.show || ''),
                spieg: Array.isArray(d.e) ? d.e.join(' ') : String(d.e || ''), concetto: d.concetto })), lista, Locale);
            const et = c.etichette.length ? c.etichette : lista.slice(0, VerificaConcetti.MAX_CON);
            let sel = VerificaConcetti.scegli(doms, ass, et, id => viste.get('sq-' + id) || '');
            if (per < VerificaConcetti.PER * et.length)
                sel = sel.slice(0, per);
            if (!sel.length)
                continue;
            gruppi.push(sel);
            tot += sel.length;
            Object.assign(immagini, b.immagini);
            if (b.focus)
                focus.set(c.sk, b.focus);
        }
        return { gruppi, immagini, focus };
    }
    function apriMisto(lista, immagini, focus, o, fatto) {
        const t0 = trovaScheda(lista[0].sk);
        if (!t0)
            return;
        const skDi = new Map(lista.map(d => [d.id, d.sk])), inizio = Date.now();
        let ferma = null, tick = 0, salvata = false;
        QuizApp.apri(t0.pk, t0.m, t0.micro, t0.s, () => lista, { occh: o.occh, titolo: o.titolo, immagini, modo: o.esame ? 'esame' : 'neuro', verifica: true,
            ferma: f => { ferma = f; },
            fine: r => {
                clearInterval(tick);
                const parti = dividi(r, skDi), annulli = [];
                parti.forEach((rp, sk) => { const t = trovaScheda(sk); rp.titoloScheda = t ? t.s.titolo : sk; rp.focus = focus.get(sk); annulli.push(Cattura.salva(sk, rp, undefined, true)); });
                const giuste = new Set((r.dettagli || []).filter(e => e.ok).map(e => e.id)), sb = (r.dettagli || []).filter(e => !e.ok && skDi.has(e.id)).length;
                const errate = lista.filter(d => !giuste.has(d.id)).map(d => [d.sk, d.id]);
                const box = document.querySelector('.qz-carta');
                if (box)
                    box.appendChild(h('p.tenue.piccolo.misto-riga', null, '🧩 Padronanza aggiornata su ' + parti.size + (parti.size === 1 ? ' scheda' : ' schede') + ' · il punteggio delle schede non cambia'
                        + (sb ? ' · ' + sb + (sb === 1 ? ' sbagliata torna' : ' sbagliate tornano') + ' in «Quiz da rifare»' : '')));
                if (fatto && !salvata) {
                    salvata = true;
                    fatto(r, errate, Math.round((Date.now() - inizio) / 60000));
                }
                avviso('🧩 Quiz salvato: ' + r.giuste + '/' + r.totale + ' su ' + parti.size + (parti.size === 1 ? ' scheda' : ' schede') + ' · tocca per annullare', 8000, () => { annulli.forEach(f => f()); avviso('Annullato: risultato non salvato.'); });
            } });
        if (!o.esame || !o.minuti)
            return;
        const fineT = inizio + o.minuti * 60000, el = h('span.misto-tempo', { role: 'timer', 'aria-live': 'off' });
        const vis = Array.from(document.querySelectorAll('.visore')).pop();
        vis?.querySelector('.visore-strumenti')?.appendChild(el);
        const avvisati = new Set();
        const aggiorna = () => {
            if (!el.isConnected || document.querySelector('.qz-punti')) {
                clearInterval(tick);
                return;
            }
            const s = Math.max(0, Math.round((fineT - Date.now()) / 1000)), m = Math.floor(s / 60);
            el.textContent = '⏱ ' + m + ':' + String(s % 60).padStart(2, '0');
            for (const k of [10, 1])
                if (m < k && o.minuti > k && !avvisati.has(k)) {
                    avvisati.add(k);
                    avviso('⏱ ' + (k === 1 ? 'Manca 1 minuto' : 'Mancano ' + k + ' minuti'));
                }
            if (s <= 0) {
                clearInterval(tick);
                avviso('⏰ Tempo scaduto: le domande senza risposta contano come sbagliate e tornano nella revisione.', 6000);
                if (ferma)
                    ferma();
            }
        };
        tick = window.setInterval(aggiorna, 1000);
        aggiorna();
    }
    async function avvia(o) {
        const cand = candidati(o.tipo, Stato.tutti('memoria'), ymd(new Date()), matSk, fatte(), o.materie);
        if (!cand.length) {
            avviso(o.tipo === 'deboli' ? 'Nessun concetto debole o scaduto: per ora sei in pari.' : 'Nessuna scheda studiata in queste materie.', 6000);
            return;
        }
        avviso('Preparo le domande…', 2500);
        const { gruppi, immagini, focus } = await domande(cand, o.n, perScheda(o.tipo));
        const lista = intreccia(gruppi, o.n);
        if (!lista.length) {
            avviso('⚠️ Domande non disponibili (serve la connessione la prima volta).', 6000);
            return;
        }
        const sim = !!o.piano;
        apriMisto(lista, immagini, focus, { occh: (sim ? '📝 Simulazione d\'esame' : o.tipo === 'deboli' ? '🎯 Quiz sui punti deboli' : '📚 Quiz cumulativo') + ' · ' + lista.length + ' domande · '
                + gruppi.length + (gruppi.length === 1 ? ' scheda' : ' schede') + (o.esame ? ' · correzione alla fine' + (o.minuti ? ' · ' + o.minuti + ' min' : '') : ''),
            titolo: o.titolo || (o.materie.length ? o.materie.map(nomeMateria).join(' · ') : 'Tutte le materie'), esame: o.esame, minuti: o.esame ? o.minuti : 0 }, sim ? (r, errate, minuti) => {
            const ad = new Date(), rec = { id: 'sim-' + ad.getTime(), type: 'simulazione', updatedAt: 0, data: ymd(ad), ora: hm(ad), fileId: 'app', nome: o.titolo || 'Simulazione in app',
                pct: r.pct, giuste: r.giuste, totale: r.totale, deboli: r.livelli, debole: r.debole, minuti, limite: o.minuti, piano: o.piano, voce: o.voce, errate };
            Stato.salva(rec);
        } : undefined);
    }
    async function revisione(piano) {
        const s = Stato.tutti('simulazione').filter(x => !x.deleted && x.piano === piano && x.errate).sort((a, b) => a.data + a.ora < b.data + b.ora ? 1 : -1)[0];
        if (!s) {
            avviso('Nessuna simulazione in app per questo piano: fai prima la simulazione, poi qui rivedi gli errori.', 6000);
            return;
        }
        if (!s.errate.length) {
            avviso('🎉 Nessun errore nella simulazione del ' + s.data.slice(8) + '/' + s.data.slice(5, 7) + ': ripassa le carte di oggi.', 6000);
            return;
        }
        const per = new Map();
        for (const [sk, id] of s.errate) {
            const l = per.get(sk) || [];
            l.push(id);
            per.set(sk, l);
        }
        const gruppi = [], immagini = {}, focus = new Map();
        for (const [sk, ids] of per) {
            const t = trovaScheda(sk);
            if (!t)
                continue;
            try {
                const b = await Banca.scheda(t.pk, t.m, t.micro, t.s);
                const g = b.domande.filter(d => ids.includes(d.id)).map(d => ({ ...d, sk }));
                if (g.length) {
                    gruppi.push(g);
                    Object.assign(immagini, b.immagini);
                    if (b.focus)
                        focus.set(sk, b.focus);
                }
            }
            catch (e) {
                console.warn('ComponiQuiz: revisione ' + sk, e);
            }
        }
        const lista = intreccia(gruppi, Infinity);
        if (!lista.length) {
            avviso('⚠️ Domande della simulazione non disponibili (serve la connessione la prima volta).', 6000);
            return;
        }
        apriMisto(lista, immagini, focus, { occh: '🔍 Revisione degli errori · simulazione del ' + s.data.slice(8) + '/' + s.data.slice(5, 7) + ' · ' + lista.length + ' domande', titolo: s.nome, esame: false, minuti: 0 });
    }
    function apri(pre) {
        const o = { tipo: 'deboli', materie: [], n: 18, esame: false, minuti: Simulazioni.minutiPredefiniti(), ...pre };
        const sim = !!o.piano, presenti = Array.from(new Set(Stato.tutti('memoria').filter(m => !m.deleted && String(m.er || '').startsWith('con:') && m.sk).map(m => matSk(m.sk))
            .concat(fatte().map(matSk)))).filter(m => m !== '?').sort();
        const corpo = h('div.modulo');
        const drive = h('div.gruppo.misto-drive');
        if (sim && Drive.pronto) {
            drive.appendChild(h('div.tenue.piccolo', null, 'Cerco le simulazioni su Drive…'));
            Simulazioni.file().then(lista => {
                svuota(drive);
                if (!lista.length)
                    return;
                const fatte = Simulazioni.tutte();
                drive.append(h('div.tenue.piccolo', null, 'Oppure una simulazione da Drive (stessi minuti):'), ...lista.map(x => {
                    const nome = x.name.replace(/\.html?$/i, ''), prec = fatte.filter(z => z.fileId === x.id);
                    return h('button.voce-lista', { type: 'button', onclick: () => { f.chiudi(); void avviaSimulazione(x.id, nome, o.minuti || Simulazioni.minutiPredefiniti()); } }, h('span.voce-corpo', null, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, nome), h('span.voce-sotto', null, prec.length ? 'Fatta ' + prec.length + (prec.length === 1 ? ' volta' : ' volte') + (prec[0].pct != null ? ' · ultima ' + prec[0].pct + '%' : '') : 'Mai fatta')));
                }));
            }, e => { svuota(drive); console.warn('ComponiQuiz: simulazioni Drive', e); });
        }
        else if (sim)
            drive.appendChild(h('button.btn.neutro', { type: 'button', onclick: () => { f.chiudi(); void apriSimulazioni(); } }, 'Accedi a Google per le simulazioni su Drive'));
        const seg = (voci, val, set) => h('div.segmenti', null, voci.map(([v, t]) => h('button' + (v === val ? '.attivo' : ''), { type: 'button', onclick: () => { set(v); disegna(); } }, t)));
        const num = (v, min, max, set, et) => {
            const i = h('input', { type: 'number', min: String(min), max: String(max), value: String(v), 'aria-label': et, inputmode: 'numeric' });
            i.onchange = () => { const n = Math.round(+i.value); set(n >= min && n <= max ? n : v); i.value = String(n >= min && n <= max ? n : v); };
            return i;
        };
        function disegna() {
            svuota(corpo);
            const parti = [
                sim ? h('p.tenue.piccolo', null, 'Domande di tutte le schede studiate, alternate tra le materie. Correzione alla fine; domani la revisione riapre solo le sbagliate.')
                    : riga('Cosa', seg([['deboli', '🎯 Punti deboli'], ['cumulativo', '📚 Cumulativo']], o.tipo, v => { o.tipo = v; })),
                !sim ? h('p.tenue.piccolo', null, o.tipo === 'deboli' ? 'Concetti da studiare, da consolidare o con la verifica scaduta: 3 domande per concetto, dal più debole.'
                    : 'Una domanda per concetto da tutte le schede studiate, dal ricordo più basso, alternate tra le materie.') : null,
                presenti.length > 1 ? riga('Materie', h('div.chips', null, h('button.chip' + (o.materie.length ? '' : '.on'), { type: 'button', onclick: () => { o.materie = []; disegna(); } }, 'Tutte'), presenti.map(m => h('button.chip' + (o.materie.includes(m) ? '.on' : ''), { type: 'button', onclick: () => { o.materie = o.materie.includes(m) ? o.materie.filter(x => x !== m) : o.materie.concat(m); disegna(); } }, nomeMateria(m))))) : null,
                riga('Domande', h('div.chips', null, [9, 18, 27, 36].map(n => h('button.chip' + (o.n === n ? '.on' : ''), { type: 'button', onclick: () => { o.n = n; disegna(); } }, String(n))), num(o.n, 3, 120, n => { o.n = n; }, 'Numero di domande'))),
                sim ? null : riga('Modo', seg([[false, '🧠 Allenamento'], [true, '📝 Esame']], o.esame, v => { o.esame = v; })),
                o.esame ? riga('Minuti', h('div.chips', null, num(o.minuti, 0, 300, n => { o.minuti = n; }, 'Minuti a disposizione'), h('span.tenue.piccolo', null, '0 = senza limite'))) : null,
                h('button.btn', { type: 'button', onclick: () => { f.chiudi(); void avvia(o); } }, sim ? '▶ Inizia la simulazione' : '▶ Inizia il quiz'),
                sim ? drive : null
            ];
            for (const el of parti)
                if (el)
                    corpo.appendChild(el);
        }
        const f = foglio({ titolo: sim ? '📝 Simulazione d\'esame' : '🧩 Componi un quiz', corpo });
        disegna();
    }
    function daVoce(p, v) {
        if (/^VERIFICA/.test(v.k)) {
            void apriSimulazioni();
            return;
        }
        if (/^REV-/.test(v.k) || /^🔍/.test(v.t)) {
            void revisione(p.id);
            return;
        }
        const g = p.generato, materie = g && g.argomenti ? Array.from(new Set(g.argomenti.map(k => materiaDi(k)))).filter(Boolean) : [];
        apri({ tipo: 'cumulativo', esame: true, n: 27, materie, piano: p.id, voce: v.k, titolo: v.t.replace(/^\S+\s/, '') });
    }
    return { candidati, intreccia, dividi, apri, avvia, revisione, daVoce, perScheda };
})();

const Concetti = (() => {
    const MARGINE = 1.3, MIN_AFFIDABILE = 3, MAX_ETICHETTE = 12;
    const n2 = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const una = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const slug = (s) => n2(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    const ORDINE = ['non_verificato', 'da_studiare', 'da_consolidare', 'in_consolidamento', 'consolidato'];
    const NOMI = { non_verificato: 'non verificato', da_studiare: 'da studiare', da_consolidare: 'da consolidare', in_consolidamento: 'in consolidamento', consolidato: 'consolidato' };
    function etichette(focus) {
        const out = [], visti = new Set();
        let d = 0, cur = '';
        const chiudi = () => { const x = una(cur).replace(/^[-•·]\s*|[.\s]+$/g, ''); cur = ''; const k = slug(x); if (x.length >= 3 && k && !visti.has(k)) {
            visti.add(k);
            out.push(x.slice(0, 80));
        } };
        for (const ch of String(focus || '')) {
            if (ch === '(' || ch === '[')
                d++;
            if ((ch === ')' || ch === ']') && d > 0)
                d--;
            if ((ch === ',' || ch === ';' || ch === '\n') && d === 0)
                chiudi();
            else
                cur += ch;
        }
        chiudi();
        return out.slice(0, MAX_ETICHETTE);
    }
    const chiave = (sk, etichetta) => sk + '|' + (etichetta ? slug(etichetta) : '*');
    function assegna(sk, titoloScheda, domande, lista, lingua) {
        const out = new Map(), rip = { chiave: chiave(sk, null), etichetta: titoloScheda || sk, ripiego: true };
        const ind = lista.length >= 2 ? IndicePagine.costruisci(sk, lista.map((t, i) => ({ n: i + 1, testo: t })), lingua) : null;
        for (const d of domande) {
            const esp = una(d.concetto || '');
            if (esp) {
                const e = lista.find(x => slug(x) === slug(esp)) || esp.slice(0, 80);
                out.set(d.id, { chiave: chiave(sk, e), etichetta: e, ripiego: false });
                continue;
            }
            if (!ind) {
                out.set(d.id, rip);
                continue;
            }
            const q = new Map();
            for (const w of IndicePagine.parole([d.q, d.giusta || '', d.spieg || ''].join(' '))) {
                const r = IndicePagine.rad(lingua, w);
                q.set(r, 1);
            }
            const sc = ind.pagine.map(p => ({ n: p.n, s: punteggio(ind, p, q) })).sort((a, b) => b.s - a.s || a.n - b.n);
            const [a, b] = sc;
            if (a && a.s > 0 && a.s >= MARGINE * (b ? b.s : 0)) {
                const e = lista[a.n - 1];
                out.set(d.id, { chiave: chiave(sk, e), etichetta: e, ripiego: false });
            }
            else
                out.set(d.id, rip);
        }
        return out;
    }
    function punteggio(ind, p, q) {
        let s = 0;
        for (const r of q.keys()) {
            const f = p.tf.get(r) || 0;
            if (!f)
                continue;
            const df = ind.df.get(r) || 0, idf = Math.log(1 + (ind.N - df + 0.5) / (df + 0.5));
            s += idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * p.len / (ind.avgdl || 1)));
        }
        return s;
    }
    const giorniTra = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
    const piu = (k, n) => { const d = new Date(k + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    function voto(giuste, tot, illusioni, fortunate) {
        const acc = tot ? giuste / tot : 0;
        if (illusioni || acc < 0.5)
            return 1;
        if (acc < 0.8)
            return 2;
        return giuste === tot && !fortunate && tot >= MIN_AFFIDABILE ? 4 : 3;
    }
    function aggiorna(m0, base, esiti, giorno, ritenzione = 0.9) {
        const g0 = esiti.filter(e => e.ok).length, i0 = esiti.filter(e => !e.ok && e.caso === 'illusione_competenza').length;
        const f0 = esiti.filter(e => e.ok && e.caso === 'lucky_guess').length;
        const ver = (m0 && m0.ver ? m0.ver.slice() : []);
        const stessoGiorno = !!(m0 && m0.ultimo === giorno && ver.length && ver[ver.length - 1][0] === giorno);
        const prec = stessoGiorno ? ver.pop() : null;
        const giuste = g0 + (prec ? prec[1] : 0), tot = esiti.length + (prec ? prec[2] : 0), ill = i0 + (prec ? prec[3] : 0);
        const fort = f0 + (stessoGiorno ? (m0.fortOggi || 0) : 0);
        ver.push([giorno, giuste, tot, ill]);
        const pr = stessoGiorno ? (m0.prima || null) : m0 ? { d: m0.d, s: m0.s, ultimo: m0.ultimo, n: m0.n, lapsi: m0.lapsi, due: m0.due } : null;
        const g = voto(giuste, tot, ill, fort), t = pr && pr.ultimo ? Math.max(0, giorniTra(pr.ultimo, giorno)) : 0;
        const st = Fsrs.passo(pr && pr.ultimo ? { d: pr.d, s: pr.s } : null, g, t);
        const log = ((m0 && m0.log) || []).filter(x => x[0] !== giorno).concat([[giorno, g]]).slice(-50);
        return { id: base.id, type: 'memoria', updatedAt: 0, er: 'con:' + base.chiave, sk: base.sk, etichetta: base.etichetta, ...(base.ripiego ? { ripiego: true } : {}), ...(base.nEt || (m0 && m0.nEt) ? { nEt: base.nEt || m0.nEt } : {}),
            d: st.d, s: st.s, due: piu(giorno, Fsrs.intervallo(st.s, ritenzione)), ultimo: giorno, n: (pr ? pr.n : 0) + 1,
            lapsi: (pr ? pr.lapsi : 0) + (pr && pr.ultimo && g === 1 ? 1 : 0), log, ver: ver.slice(-20), prima: pr, fortOggi: fort };
    }
    function stato(m, giorno) {
        const rip = !!(m && m.ripiego);
        if (!m || !m.ver || !m.ver.length || !m.ultimo)
            return { stato: 'non_verificato', giorni: 0, ultimaAcc: null, r: null, s: 0, ripiego: rip, motivo: 'nessuna verifica' };
        const v = m.ver, u = v[v.length - 1], acc = (x) => x[2] ? x[1] / x[2] : 0;
        const giorni = new Set(v.map(x => x[0])).size, ua = acc(u), r = Fsrs.recuperabilita(Math.max(0, giorniTra(m.ultimo, giorno)), m.s);
        const ult3 = (m.log || []).slice(-3), lapsiRecenti = ult3.filter(x => x[1] === 1).length;
        const base = { giorni, ultimaAcc: Math.round(ua * 100) / 100, r: Math.round(r * 100) / 100, s: Math.round(m.s * 10) / 10, ripiego: rip };
        const pct = Math.round(ua * 100) + '%';
        if (ua < 0.5 || lapsiRecenti >= 2)
            return { ...base, stato: 'da_studiare', motivo: lapsiRecenti >= 2 ? '2 errori nelle ultime 3 verifiche' : 'ultima verifica ' + pct };
        if (giorni < 2 || r < 0.8 || ua < 0.8)
            return { ...base, stato: 'da_consolidare', motivo: giorni < 2 ? 'verificato in un solo giorno' : r < 0.8 ? 'ricordo stimato ' + Math.round(r * 100) + '%' : 'ultima verifica ' + pct };
        const ult2 = v.slice(-2), arco = giorniTra(v[0][0], u[0]);
        const consolidato = giorni >= 3 && arco >= 7 && ult2.every(x => acc(x) >= 0.8) && m.s >= 21 && ult2.every(x => !x[3]) && u[2] >= MIN_AFFIDABILE;
        if (consolidato)
            return { ...base, stato: 'consolidato', motivo: giorni + ' giorni su ' + arco + ', stabilità ' + Math.round(m.s) + ' g' };
        return { ...base, stato: 'in_consolidamento', motivo: u[2] < MIN_AFFIDABILE ? 'solo ' + u[2] + ' domande nell\'ultima verifica' : 'stabilità ' + Math.round(m.s) + ' g (consolidato da 21)' };
    }
    function insieme(stati) {
        const ver = stati.filter(s => s.stato !== 'non_verificato');
        const peggiore = ver.length ? ver.map(s => s.stato).sort((a, b) => ORDINE.indexOf(a) - ORDINE.indexOf(b))[0] : 'non_verificato';
        return { stato: ver.length < stati.length && peggiore === 'consolidato' ? 'in_consolidamento' : peggiore, verificati: ver.length, totale: stati.length };
    }
    function riepilogo(mem, giorno) {
        const per = new Map();
        for (const m of mem)
            if (m && !m.deleted && String(m.er || '').startsWith('con:') && m.sk) {
                const l = per.get(m.sk) || [];
                l.push(m);
                per.set(m.sk, l);
            }
        const out = [];
        for (const [sk, l] of per) {
            const veri = l.filter(m => !m.ripiego).map(m => ({ etichetta: m.etichetta, p: stato(m, giorno) })), rip = l.find(m => m.ripiego);
            const totale = Math.max(veri.length, ...l.map(m => m.nEt || 0)), nonVerificati = totale - veri.filter(c => c.p.stato !== 'non_verificato').length;
            const st = insieme(veri.map(c => c.p).concat(Array.from({ length: totale - veri.length }, () => ({ stato: 'non_verificato' }))));
            veri.sort((a, b) => ORDINE.indexOf(a.p.stato) - ORDINE.indexOf(b.p.stato) || a.etichetta.localeCompare(b.etichetta));
            out.push({ sk, concetti: veri, ripiego: rip ? stato(rip, giorno) : null, totale, nonVerificati, insieme: veri.length ? st.stato : 'non_verificato' });
        }
        return out.sort((a, b) => ORDINE.indexOf(a.insieme) - ORDINE.indexOf(b.insieme) || a.sk.localeCompare(b.sk));
    }
    function paginaDa(f) {
        const m = /\b(pp?\.|slides?|diapositiv[ae])\s*(\d+)/i.exec(String(f || ''));
        if (!m)
            return null;
        return { libro: una(String(f).split(/[,(]/)[0]).slice(0, 40) || '?', p: +m[2], slide: !/^p/i.test(m[1]) };
    }
    function matrice(sk, titolo, focus, domande, mem, giorno, lingua) {
        const lista = etichette(focus), ass = assegna(sk, titolo, domande, lista, lingua), per = new Map();
        const riga = (e, rip) => { const k = chiave(sk, rip ? null : e); if (!per.has(k))
            per.set(k, { etichetta: rip ? 'Domande senza concetto distinto' : e, ripiego: rip, ids: [] }); return per.get(k); };
        for (const e of lista)
            riga(e, false);
        for (const m of mem)
            if (m && !m.deleted && m.sk === sk && !m.ripiego && String(m.er || '').startsWith('con:'))
                riga(m.etichetta, false);
        for (const d of domande) {
            const a = ass.get(d.id);
            if (a)
                riga(a.etichetta, a.ripiego).ids.push(d);
        }
        const memo = new Map(mem.filter(m => m && !m.deleted && m.sk === sk).map(m => [String(m.er).slice(4), m]));
        return [...per.entries()].sort((a, b) => +a[1].ripiego - +b[1].ripiego).map(([k, x]) => {
            const libri = new Map();
            for (const d of x.ids)
                for (const c of d.cit || []) {
                    const pg = paginaDa(c.f);
                    if (pg) {
                        const k = pg.libro + (pg.slide ? '\u0001' : ''), l = libri.get(k) || new Set();
                        l.add(pg.p);
                        libri.set(k, l);
                    }
                }
            const pagine = [...libri].map(([k, ps]) => {
                const v = [...ps].sort((a, b) => a - b), sl = k.endsWith('\u0001');
                return k.replace('\u0001', '') + (sl ? ' slide ' : v.length > 1 ? ' pp. ' : ' p. ') + v.join(', ');
            });
            const p = stato(memo.get(k), giorno), n = x.ids.length;
            const buco = x.ripiego ? null : !n ? 'senza_domande' : n < MIN_AFFIDABILE ? 'poche_domande' : p.stato === 'da_studiare' || p.stato === 'da_consolidare' ? 'debole'
                : p.stato === 'non_verificato' ? 'non_verificato' : !pagine.length ? 'senza_pagine' : null;
            return { etichetta: x.etichetta, ripiego: x.ripiego, domande: n, pagine, p, buco };
        });
    }
    return { etichette, assegna, aggiorna, stato, insieme, riepilogo, voto, chiave, slug, matrice, paginaDa, NOMI, ORDINE, MARGINE, MIN_AFFIDABILE };
})();

const Copertura = (() => {
    const SOGLIA_J = 0.5, SOGLIA_PAG = 0.5, SOGLIA_VOCE = 0.5, MAX_AVVISI = 6;
    const r2 = (x) => Math.round(x * 100) / 100;
    function radici(testi, lingua) {
        const s = new Set();
        for (const t of testi)
            for (const w of IndicePagine.parole(t)) {
                const r = IndicePagine.rad(lingua, w);
                if (r.length >= 3)
                    s.add(r);
            }
        return s;
    }
    function jaccard(a, b) {
        let i = 0;
        for (const x of a)
            if (b.has(x))
                i++;
        const u = a.size + b.size - i;
        return u ? i / u : 0;
    }
    function sovrapp(a, b) {
        if (!a.pagine || !b.pagine || (a.fileId && b.fileId && a.fileId !== b.fileId))
            return 0;
        const i = Math.min(a.pagine[1], b.pagine[1]) - Math.max(a.pagine[0], b.pagine[0]) + 1;
        const corto = Math.min(a.pagine[1] - a.pagine[0] + 1, b.pagine[1] - b.pagine[0] + 1);
        return i > 0 && corto > 0 ? Math.min(1, i / corto) : 0;
    }
    const contenuto = (u) => (u.concettiChiave && u.concettiChiave.length >= 2 ? u.concettiChiave : [u.titolo, ...(u.concettiChiave || [])]);
    function coppie(unita, lingua) {
        const R = unita.map(u => radici(contenuto(u), lingua)), duplicati = [], ripetizioni = [];
        for (let i = 0; i < unita.length; i++)
            for (let j = i + 1; j < unita.length; j++) {
                const jj = jaccard(R[i], R[j]);
                if (jj < SOGLIA_J)
                    continue;
                const a = unita[i], b = unita[j], ov = sovrapp(a, b);
                const c = { a: a.uid, b: b.uid, titoloA: a.titolo, titoloB: b.titolo, jaccard: r2(jj), sovrapp: r2(ov) };
                (ov >= SOGLIA_PAG ? duplicati : ripetizioni).push(c);
            }
        return { duplicati, ripetizioni };
    }
    function voci(struttura) {
        const out = [];
        for (const r of String(struttura || '').split('\n')) {
            const p = r.split('|').map(x => x.trim());
            if (p.length < 4 || !p[3])
                continue;
            const m = /^(\d+)-(\d+)$/.exec(p[2]);
            out.push({ titolo: p[3], fileId: p[0], pagine: m ? [+m[1], Math.max(+m[1], +m[2])] : undefined });
        }
        return out;
    }
    function lacune(unita, struttura, lingua) {
        const vv = voci(struttura), R = unita.map(u => radici([u.titolo, ...(u.concettiChiave || [])], lingua)), out = [];
        for (const v of vv) {
            const perPagine = !!v.pagine && unita.some(u => u.pagine && (!u.fileId || u.fileId === v.fileId) && sovrapp({ uid: '', titolo: '', pagine: v.pagine, fileId: v.fileId }, u) > 0);
            if (perPagine)
                continue;
            const rv = radici([v.titolo], lingua);
            if (!rv.size)
                continue;
            const perTesto = R.some(r => { let i = 0; for (const x of rv)
                if (r.has(x))
                    i++; return i / rv.size >= SOGLIA_VOCE; });
            if (!perTesto)
                out.push(v);
        }
        return { lacune: out, voci: vv.length };
    }
    const pp = (p) => p ? ' (pp. ' + p[0] + (p[1] !== p[0] ? '–' + p[1] : '') + ')' : '';
    function analizza(unita, struttura, lingua) {
        const c = coppie(unita || [], lingua), l = lacune(unita || [], struttura, lingua), avvisi = [];
        for (const d of c.duplicati)
            avvisi.push('🔁 Possibile doppione: «' + d.titoloA + '» e «' + d.titoloB + '» (stessi concetti, stesse pagine): valuta di unirle.');
        for (const x of l.lacune)
            avvisi.push('🕳 Argomento mancante: «' + x.titolo + '»' + pp(x.pagine) + ' non è in nessuna unità.');
        for (const r of c.ripetizioni)
            avvisi.push('↪ Ripetizione didattica: «' + r.titoloB + '» riprende «' + r.titoloA + '» su altre pagine (conservata).');
        const extra = avvisi.length - MAX_AVVISI;
        return { ...c, ...l, avvisi: extra > 0 ? avvisi.slice(0, MAX_AVVISI).concat(['… e altri ' + extra + ' avvisi.']) : avvisi };
    }
    return { analizza, coppie, lacune, voci, jaccard, sovrapp, SOGLIA_J, SOGLIA_PAG, SOGLIA_VOCE };
})();

const FineQuiz = (() => {
    const MAX_R = 300, MIN_CARTA = 0.5, MIN_NOTA = 5, AUTO_MAX = 5, LACUNA_N = 6, LACUNA_PCT = 60;
    const ORD = { illusione: 0, errore: 1, fortunata: 2 };
    const una = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    function taglia(s, n) {
        const x = una(s);
        if (x.length <= n)
            return x;
        const y = x.slice(0, n - 1), sp = y.lastIndexOf(' ');
        return (sp > n * 0.6 ? y.slice(0, sp) : y).replace(/[\s,;:.]+$/, '') + '…';
    }
    function tipo(e) {
        if (e.ok)
            return e.caso === 'lucky_guess' ? 'fortunata' : null;
        return e.caso === 'illusione_competenza' ? 'illusione' : 'errore';
    }
    function carta(e, t) {
        const giusta = una(e.giusta), spieg = e.spieg ? taglia(e.spieg, MAX_R) : '';
        if (t === 'illusione' && e.scelta) {
            const sc = una(e.scelta);
            return { qid: e.id, qids: [e.id], tipo: t, q: e.q, motivo: 'eri certo ma era sbagliata',
                f: e.q + '\n\nPerché «' + taglia(giusta, 120) + '» e non «' + taglia(sc, 120) + '»?',
                r: giusta + '\n\n' + (e.perche ? 'Perché «' + taglia(sc, 120) + '» non va: ' + taglia(e.perche, MAX_R) : spieg) };
        }
        return { qid: e.id, qids: [e.id], tipo: t, q: e.q, motivo: t === 'illusione' ? 'eri certo ma era sbagliata' : t === 'fortunata' ? 'giusta tirando a indovinare: da fissare' : 'sbagliata',
            f: e.q, r: giusta + (spieg ? '\n\n' + spieg : '') };
    }
    function perDomanda(det) {
        const visti = new Set(), out = [];
        for (const e of det) {
            const t = tipo(e), chiave = una(e.q).toLowerCase();
            if (!t || !chiave || !una(e.giusta) || visti.has(chiave))
                continue;
            visti.add(chiave);
            const c = carta(e, t);
            if (e.con && !e.con.ripiego) {
                c.chiave = e.con.chiave;
                c.concetto = e.con.etichetta;
            }
            out.push(c);
        }
        return out.sort((a, b) => ORD[a.tipo] - ORD[b.tipo]);
    }
    function candidati(det) {
        const out = [], per = new Map();
        for (const c of perDomanda(det)) {
            if (!c.chiave) {
                out.push(c);
                continue;
            }
            const g = per.get(c.chiave);
            if (g) {
                g.qids.push(c.qid);
                continue;
            }
            const nuovo = { ...c, qids: [c.qid] };
            per.set(c.chiave, nuovo);
            out.push(nuovo);
        }
        return out;
    }
    function proposta(det, pct, pref, esiste = () => false) {
        const cand = candidati(det), nuove = cand.filter(c => !esiste(c.q, c));
        const conta = { illusione: 0, errore: 0, fortunata: 0 };
        for (const c of perDomanda(det))
            conta[c.tipo]++;
        const sbagliate = conta.illusione + conta.errore;
        const lacuna = sbagliate >= LACUNA_N || (sbagliate > 0 && pct < LACUNA_PCT);
        const carteOk = pref.carte && pref.carteAuto === 'proponi' && nuove.length > 0;
        const notaOk = pref.appunti && sbagliate > 0 && (pref.carteAuto !== 'auto' || (pref.suggerisci && lacuna));
        const opzioni = [];
        if (carteOk)
            opzioni.push('carte');
        if (notaOk)
            opzioni.push('nota');
        if (carteOk && notaOk)
            opzioni.push('entrambi');
        let consiglio = null, perche = '';
        const notaSugg = notaOk && pref.suggerisci;
        if (lacuna && notaSugg && carteOk && conta.illusione) {
            consiglio = 'entrambi';
            perche = sbagliate + ' errori: riorganizzali in un appunto con parole tue; le illusioni vanno in carte comparative.';
        }
        else if (lacuna && notaSugg) {
            consiglio = 'nota';
            perche = sbagliate + ' errori: una lacuna ampia si ripara riorganizzando, non con carte singole.';
        }
        else if (carteOk) {
            consiglio = 'carte';
            perche = 'pochi errori puntuali: ' + nuove.length + (nuove.length === 1 ? ' carta mirata basta' : ' carte mirate bastano') + '.';
        }
        else if (notaSugg) {
            consiglio = 'nota';
            perche = 'le carte di queste domande ci sono già: fissa la correzione in un appunto.';
        }
        const mc = Math.max(1, Math.ceil(nuove.length * MIN_CARTA));
        return { solido: cand.length === 0, mostra: cand.length > 0 && opzioni.length > 0, lacuna, candidati: cand, nuove, gia: cand.length - nuove.length,
            opzioni, consiglio, perche, min: { carte: mc, nota: MIN_NOTA, entrambi: mc + MIN_NOTA }, conta };
    }
    function unisci(c, cand, impronta) {
        const prima = (c.origine && c.origine.domande) || [], dom = prima.concat(cand.qids.filter(q => q && !prima.includes(q)));
        const intatta = !!c.gen && c.gen === impronta(c.f + '\n' + c.r);
        const comparativa = cand.tipo === 'illusione' && c.tag !== 'illusione' && intatta && cand.f !== c.f;
        if (dom.length === prima.length && !comparativa)
            return null;
        const out = { ...c, origine: { domande: dom.slice(-30) } };
        if (cand.concetto && !c.concetto)
            out.concetto = cand.concetto;
        if (comparativa) {
            out.f = cand.f;
            out.r = cand.r;
            out.tag = 'illusione';
            out.gen = impronta(cand.f + '\n' + cand.r);
        }
        return out;
    }
    const automatiche = (p) => p.nuove.slice(0, AUTO_MAX);
    function cornell(det) {
        const cand = perDomanda(det), err = cand.filter(c => c.tipo !== 'fortunata'), fort = cand.filter(c => c.tipo === 'fortunata');
        const pul = (x) => x.replace(/::/g, ':').replace(/\{\{|\}\}/g, '');
        const dom = (q) => { const x = taglia(q, 160); return /\?\s*$/.test(x) ? x : x + ' — perché?'; };
        const riga = [];
        if (err.length) {
            riga.push('## Errori e correzioni');
            for (const c of err) {
                const e = det.find(x => una(x.q) === una(c.q));
                riga.push('- ' + dom(c.q), '  Corretta: ' + taglia(e.giusta, 200) + (e.spieg ? '. ' + taglia(e.spieg, 240) : ''));
                if (c.tipo === 'illusione' && e.scelta)
                    riga.push('  Mi aveva convinto «' + taglia(e.scelta, 120) + '»' + (e.perche ? ': ' + taglia(e.perche, 200) : ''));
            }
        }
        const richiamo = cand.filter(c => c.tipo !== 'errore');
        if (richiamo.length) {
            riga.push('', '## Da richiamare senza guardare');
            for (const c of richiamo) {
                const e = det.find(x => una(x.q) === una(c.q));
                riga.push('- Sai spiegare con parole tue perché la risposta è «' + taglia(e.giusta, 100) + '»?');
            }
        }
        if (fort.length && !err.length)
            riga.unshift('_Tutte giuste, ma ' + fort.length + ' a intuito._', '');
        riga.push('', '## Con parole mie', '');
        return pul(riga.join('\n'));
    }
    return { candidati, perDomanda, proposta, unisci, automatiche, cornell, taglia, AUTO_MAX };
})();

const FineQuizUI = (() => {
    function pref() {
        const p = StudiaOra.prefGlobali();
        return { carte: p.carte, appunti: p.appunti, suggerisci: imp().suggerisciAppunti !== false, carteAuto: StudiaOra.carteAuto() };
    }
    const mazzoDi = (id) => Carte.mazzoErrori(id);
    function esiste(id) {
        const idM = mazzoDi(id);
        return (q, c) => { const x = cartaDi(idM, q, c); return !!x; };
    }
    function cartaDi(idM, q, c) { const x = Stato.prendi(Carte.idErrore(idM, q, c && c.chiave)); return x && !x.deleted ? x : null; }
    const crea = (id, l) => Carte.daErrori(l.map(c => ({ schedaId: id, q: c.q, giusta: c.r, f: c.f, r: c.r, tag: c.tipo, qid: c.qid || undefined,
        chiave: c.chiave, concetto: c.concetto, qids: c.qids })), true);
    function dettagliDi(r, id = '') {
        if (!r.dettagli)
            return (r.sbagliate || []).map(([q, giusta, spieg]) => ({ id: '', q, giusta, spieg, ok: false }));
        if (r.dettagli.every(e => e.con))
            return r.dettagli;
        const t = trovaScheda(id), titolo = r.titoloScheda || (t ? t.s.titolo : id);
        const ass = Concetti.assegna(id, titolo, r.dettagli, Concetti.etichette(r.focus || ''), Locale);
        r.dettagli = r.dettagli.map(e => ({ ...e, con: ass.get(e.id) }));
        return r.dettagli;
    }
    function padronanza(id, det, nEt = 0) {
        const giorno = ymd(new Date()), per = new Map();
        for (const e of det) {
            if (!e.con)
                continue;
            const g = per.get(e.con.chiave) || { con: e.con, es: [] };
            g.es.push({ ok: e.ok, caso: e.caso });
            per.set(e.con.chiave, g);
        }
        const prima = [], stati = [];
        for (const [ch, g] of per) {
            const idM = 'mem-con-' + Carte.hash(ch), m0 = Stato.prendi(idM), vivo = m0 && !m0.deleted ? m0 : undefined;
            prima.push([idM, vivo ? JSON.parse(JSON.stringify(vivo)) : undefined]);
            const m = Concetti.aggiorna(vivo, { id: idM, chiave: ch, sk: id, etichetta: g.con.etichetta, ripiego: g.con.ripiego, nEt }, g.es, giorno, Ripassi.ritenzione(giorno));
            Stato.salva(m, true);
            stati.push(Concetti.stato(m, giorno));
        }
        return { stati, annulla: () => { for (const [k, m] of prima) {
                if (m)
                    Stato.salva(m, true);
                else if (Stato.prendi(k))
                    Stato.elimina(k);
            } } };
    }
    function aggiornaCarte(id, p) {
        const idM = mazzoDi(id), prima = [];
        for (const c of p.candidati) {
            if (!c.chiave)
                continue;
            const x = cartaDi(idM, c.q, c);
            if (!x)
                continue;
            const nuova = FineQuiz.unisci(x, c, Carte.hash);
            if (!nuova)
                continue;
            prima.push(JSON.parse(JSON.stringify(x)));
            Stato.salva(nuova, true);
        }
        return () => { for (const c of prima)
            Stato.salva(c, true); };
    }
    function rigaConcetti(stati, senza) {
        const veri = stati.filter(s => !s.ripiego);
        if (!veri.length)
            return null;
        const n = new Map();
        for (const s of veri)
            n.set(s.stato, (n.get(s.stato) || 0) + 1);
        const ord = ['da_studiare', 'da_consolidare', 'in_consolidamento', 'consolidato'];
        return h('p.tenue.piccolo.qz-concetti', null, '🧩 Concetti verificati (' + veri.length + '): ' + ord.filter(s => n.get(s)).map(s => n.get(s) + ' ' + Concetti.NOMI[s]).join(' · ')
            + (senza ? ' · ' + senza + (senza === 1 ? ' domanda senza concetto distinto' : ' domande senza concetto distinto') : ''));
    }
    function apriNota(id, r) {
        const t = trovaScheda(id), giorno = ymd(new Date()), idA = 'ap-q-' + Carte.hash(id + '|' + giorno);
        let a = Stato.prendi(idA);
        if (!a || a.deleted) {
            a = Appunti.nuovo({ id: idA, titolo: 'Dopo il quiz · ' + (t ? Studio.etichetta(t.k) + ' ' + t.micro + ' · ' + t.s.titolo : 'quiz'), testo: FineQuiz.cornell(dettagliDi(r, id)),
                origine: { tipo: 'quiz', scheda: id, concetti: [...new Set(dettagliDi(r, id).filter(e => e.con && !e.con.ripiego && (!e.ok || e.caso === 'lucky_guess')).map(e => e.con.etichetta))] }, ...(t ? { sub: t.k, micro: t.micro, subMano: 1 } : {}) });
            Appunti.salva(a);
            a = Stato.prendi(idA) || a;
        }
        apriAppunto(a);
    }
    function avviaCarteDi(id) { avviaCarte([mazzoDi(id)], 'Errori · ' + (trovaScheda(id) ? Studio.etichetta(trovaScheda(id).k) : 'quiz')); }
    function inserisci(box, el) {
        const dopoDi = box.querySelector(':scope > .qz-neuro') || box.querySelector(':scope > .qz-livelli + p');
        if (dopoDi) {
            dopoDi.after(el);
            return;
        }
        const h3 = box.querySelector(':scope > h3');
        if (h3)
            box.insertBefore(el, h3);
        else
            box.appendChild(el);
    }
    function esegui(s, id, r, p, el) {
        let n = 0;
        if (s === 'carte' || s === 'entrambi')
            n = crea(id, p.nuove).length;
        svuota(el);
        el.append(h('div', null, h('b', null, '✓ ' + (n ? n + (n === 1 ? ' carta creata' : ' carte create') : s === 'nota' ? 'Blocco note pronto' : 'Carte già presenti'))), h('div.bottoni', null, s !== 'nota' ? h('button.btn', { type: 'button', onclick: () => avviaCarteDi(id) }, '🃏 Ripassale ora') : null, s !== 'carte' ? h('button.btn' + (s === 'nota' ? '' : '.neutro'), { type: 'button', onclick: () => apriNota(id, r) }, '📝 Apri il blocco note') : null));
        if (s !== 'carte')
            apriNota(id, r);
    }
    function solido(id, box, riga) {
        if (box.querySelector('.qz-solido'))
            return;
        const t = trovaScheda(id), m = t ? Stato.prendi('mem-sub-' + t.k) : undefined;
        const dom = Stato.tutti('statq').filter(q => q.sk === id && q.neuro && q.neuro.due).map(q => q.neuro.due).sort()[0];
        const [quando, cosa] = m && m.due && !m.deleted ? [m.due, 'dello step'] : dom ? [dom, 'delle domande'] : ['', ''];
        const el = h('p.qz-solido', null, '✅ Tutto solido' + (quando ? ' · prossimo ripasso ' + cosa + ' il ' + quando.slice(8, 10) + '/' + quando.slice(5, 7) : ''));
        inserisci(box, el);
        if (riga)
            el.after(riga);
    }
    function dopo(id, r, aggiungiAnnulla) {
        const pr = pref(), det = dettagliDi(r, id), p = FineQuiz.proposta(det, r.pct, pr, esiste(id));
        let stati = [];
        if (r.dettagli && !r.errori) {
            const pd = padronanza(id, det, Concetti.etichette(r.focus || '').length);
            stati = pd.stati;
            aggiungiAnnulla(pd.annulla);
        }
        if (pr.carte && pr.carteAuto !== 'mai')
            aggiungiAnnulla(aggiornaCarte(id, p));
        if (pr.carteAuto === 'auto' && p.nuove.length) {
            const ids = crea(id, FineQuiz.automatiche(p));
            if (ids.length) {
                aggiungiAnnulla(() => { for (const x of ids)
                    Stato.elimina(x); });
                const t = Array.from(document.querySelectorAll('#avvisi .avviso')).reverse().find(x => /^✅ Salvato .*tocca per annullare$/.test(x.dataset.testo || ''));
                if (t)
                    t.insertBefore(h('span', null, ' · 🃏 ' + ids.length + (ids.length === 1 ? ' carta creata' : ' carte create')), t.firstChild ? t.firstChild.nextSibling : null);
            }
        }
        const box = r.dettagli && !r.misto ? document.querySelector('.qz-carta') : null;
        if (!box || box.querySelector('.finequiz'))
            return;
        const riga = rigaConcetti(stati, det.filter(e => e.con && e.con.ripiego).length);
        if (p.solido) {
            solido(id, box, riga);
            return;
        }
        if (!p.mostra) {
            if (riga)
                inserisci(box, riga);
            return;
        }
        const NOMI = { carte: '🃏 Flashcard mirate', nota: '📝 Blocco note (Cornell)', entrambi: '🃏 + 📝 Entrambi' };
        const SOTTO = {
            carte: p.nuove.length + (p.nuove.length === 1 ? ' carta' : ' carte') + ' · ~' + p.min.carte + ' min',
            nota: 'correzioni già scritte, tu aggiungi le tue parole · ~' + p.min.nota + ' min',
            entrambi: '~' + p.min.entrambi + ' min'
        };
        const c = p.conta, pezzi = [c.illusione ? c.illusione + (c.illusione === 1 ? ' illusione' : ' illusioni') : '', c.errore ? c.errore + (c.errore === 1 ? ' errore' : ' errori') : '', c.fortunata ? c.fortunata + (c.fortunata === 1 ? ' fortunata' : ' fortunate') : ''].filter(Boolean);
        const el = h('section.finequiz', { 'aria-label': 'Consolida' }, h('div', null, h('b', null, '✨ Consolida: ' + pezzi.join(' · '))), p.gia ? h('div.tenue.piccolo', null, p.gia + (p.gia === 1 ? ' è già tra le tue carte: non la duplico.' : ' sono già tra le tue carte: non le duplico.')) : null, h('div.finequiz-opzioni', null, p.opzioni.map(s => h('button.btn' + (s === p.consiglio ? '' : '.neutro'), { type: 'button', 'data-fine': s, onclick: () => esegui(s, id, r, p, el) }, h('b', null, NOMI[s]), h('span.piccolo', null, ' · ' + SOTTO[s])))), p.consiglio ? h('button.btn-testo', { type: 'button', 'data-fine': 'app', onclick: () => { const s = p.consiglio; esegui(s, id, r, p, el); el.prepend(h('div.tenue.piccolo', null, '✨ Scelta dell\'app: ' + NOMI[s] + ' — ' + p.perche)); } }, '✨ Lascia decidere all\'app') : null, p.consiglio ? h('div.tenue.piccolo', null, 'Consiglio: ' + NOMI[p.consiglio] + ' — ' + p.perche) : null, riga);
        inserisci(box, el);
    }
    return { dopo, apriNota };
})();

const IndicePagine = (() => {
    const K1 = 1.2, B = 0.75, PESO_SINONIMO = 0.5, ALFA = 0.55, VICINI = 2;
    const STOP = new Set('alla alle agli dalla dalle degli delle della dello nella nelle negli nello sulla sulle come anche sono essere viene vengono questo questa questi queste quello quella perche quando dove mentre oppure ogni tutti tutte loro ciascun'.split(' '));
    const n2 = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const GRECO = { 'Δ': 'delta', '∆': 'delta', 'δ': 'delta', 'α': 'alfa', 'β': 'beta', 'γ': 'gamma', 'λ': 'lambda', 'μ': 'mu', 'µ': 'mu', 'π': 'pi',
        'ρ': 'rho', 'σ': 'sigma', 'ω': 'omega', 'Ω': 'omega', 'θ': 'theta', 'ε': 'epsilon', 'ν': 'nu', 'τ': 'tau', 'φ': 'phi', 'η': 'eta' };
    const APICI = '⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉⁺⁻₊₋', SEGNI = '01234567890123456789+-+-';
    const NO_SIGLA = new Set('IL LO LA LE UN DI DA IN SU MA SE NE SI CI VI AL AI ED AD HA HO NO OK'.split(' '));
    const apici = (s) => String(s || '').replace(/[⁰-⁹₀-₉¹²³⁺⁻₊₋]/g, c => SEGNI[APICI.indexOf(c)] || '').replace(/[−–]/g, '-');
    const forma = (s) => apici(s).replace(/[Δ∆δαβγλμµπρσωΩθενηφτ]/g, c => GRECO[c] || '');
    function simboli(t) {
        const out = [];
        for (const m of t.matchAll(/(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{0,8})\s*=\s*([A-Za-z0-9()]+(?:\s*[·×*/+^-]\s*[A-Za-z0-9()]+)*)/g))
            out.push(('§' + m[1] + '=' + m[2].replace(/\s+/g, '').replace(/[·×]/g, '*')).toLowerCase().slice(0, 25));
        for (const m of t.matchAll(/(?<![A-Za-z0-9])([A-Za-z0-9]+)(\+|-(?![A-Za-z0-9]))?/g)) {
            const w = m[1], car = m[2] || '';
            const ione = !!car && w.length <= 4 && /^[A-Z]/.test(w), misto = /[a-z][A-Z]/.test(w), cifra = w.length <= 2 && /[A-Za-z]/.test(w) && /\d/.test(w);
            const sigla = w.length === 2 && /^[A-Z]{2}$/.test(w) && !NO_SIGLA.has(w) && !/^[IVXLC]+$/.test(w);
            if ((ione || misto || cifra || sigla) && (ione || w.length < 3 || /^(delta|alfa|beta|gamma|lambda|mu|pi|rho|sigma|omega|theta|epsilon|nu|tau|phi|eta)[a-z0-9]/i.test(w) && /[A-Z0-9]/.test(w.slice(1))))
                out.push('§' + w.toLowerCase() + (ione ? car : ''));
        }
        return out;
    }
    const parole = (s) => n2(apici(s).replace(/[Δ∆δαβγλμµπρσωΩθενηφτ]/g, ' ')).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)).concat(simboli(forma(s)));
    const rad = (l, w) => w.charAt(0) === '§' ? w : l.radice(w);
    const RE_ESERCIZIO = /\b(esempio|esercizio|esercizi|problema|problemi|esercitazione|soluzione)\b/i;
    const RE_FORMULA = /\d+(?:[.,]\d+)?\s*(?:[=×x·*/+−-]\s*\d|(?:m|s|kg|mol|j|n|pa|k|l|g|v|a|w)\b)/i;
    function titoliDa(testo) {
        return testo.split('\n').map(r => r.trim()).filter(r => r.length >= 4 && r.length <= 80 && !/[.;,:]$/.test(r)
            && (/^(\d+(\.\d+)*|capitolo|cap\.|paragrafo|unit[aà])\s/i.test(r) || (/^[A-ZÀ-Ù]/.test(r) && r.split(/\s+/).length <= 8)));
    }
    const firma = (t) => { const p = parole(t); return p.length < 20 ? '' : p.join(' '); };
    function costruisci(libro, pagine, lingua) {
        const df = new Map(), out = [], per = new Map(), visti = new Map();
        let somma = 0;
        for (const p of pagine.slice().sort((a, b) => a.n - b.n)) {
            const f = firma(p.testo), prima = f ? visti.get(f) : undefined;
            const tf = new Map(), titoli = new Set();
            for (const w of parole(p.testo)) {
                const r = rad(lingua, w);
                tf.set(r, (tf.get(r) || 0) + 1);
            }
            for (const t of titoliDa(p.testo))
                for (const w of parole(t))
                    titoli.add(rad(lingua, w));
            const len = Array.from(tf.values()).reduce((a, b) => a + b, 0);
            const pi = { n: p.n, tf, len, titoli, testo: p.testo, esercizio: RE_ESERCIZIO.test(p.testo) || RE_FORMULA.test(p.testo) };
            if (prima !== undefined)
                pi.dup = prima;
            else {
                if (f)
                    visti.set(f, p.n);
                for (const r of tf.keys())
                    df.set(r, (df.get(r) || 0) + 1);
                somma += len;
            }
            out.push(pi);
            per.set(p.n, pi);
        }
        const N = out.filter(p => p.dup === undefined).length;
        return { libro, N, avgdl: N ? somma / N : 0, df, pagine: out, per, lingua };
    }
    function query(ind, termini) {
        const q = new Map(), base = termini.flatMap(parole);
        for (const w of base)
            q.set(rad(ind.lingua, w), 1);
        for (const w of ind.lingua.espandi(base).flatMap(parole)) {
            const r = rad(ind.lingua, w);
            if (!q.has(r))
                q.set(r, PESO_SINONIMO);
        }
        return q;
    }
    function bm25(ind, p, q) {
        let s = 0, occ = 0, inTitolo = false;
        for (const [r, peso] of q) {
            const f = p.tf.get(r) || 0;
            if (!f)
                continue;
            if (peso === 1) {
                occ += f;
                if (p.titoli.has(r))
                    inTitolo = true;
            }
            const df = ind.df.get(r) || 0, idf = Math.log(1 + (ind.N - df + 0.5) / (df + 0.5));
            s += peso * idf * f * (K1 + 1) / (f + K1 * (1 - B + B * p.len / (ind.avgdl || 1)));
        }
        return { s: Math.round(s * 1000) / 1000, occ, inTitolo };
    }
    function soglia(punteggi, alfa = ALFA) {
        const m = punteggi.reduce((a, b) => b > a ? b : a, 0);
        return m > 0 ? Math.round(alfa * m * 1000) / 1000 : 0;
    }
    function estratto(testo, radici) {
        const t = testo.replace(/\s+/g, ' '), low = n2(t);
        let i = -1;
        for (const r of radici) {
            const k = low.indexOf(r);
            if (k >= 0 && (i < 0 || k < i))
                i = k;
        }
        const a = Math.max(0, (i < 0 ? 0 : i) - 60);
        return (a > 0 ? '…' : '') + t.slice(a, a + 200).trim() + (a + 200 < t.length ? '…' : '');
    }
    function copertura(ind, termini, o = {}) {
        const q = query(ind, termini), radiciTermini = Array.from(q).filter(([, p]) => p === 1).map(([r]) => r);
        const ver = new Set(o.verificate || []), inc = new Set(o.incluse || []), esc = new Set(o.escluse || []), iv = o.intervallo;
        const dentro = (n) => !!iv && n >= iv[0] && n <= iv[1];
        const calc = ind.pagine.filter(p => p.dup === undefined).map(p => ({ p, ...bm25(ind, p, q) }));
        const tau = o.tau != null ? o.tau : soglia(calc.map(x => x.s));
        const incertezze = [];
        if (!radiciTermini.length)
            incertezze.push('nessun termine utile nella richiesta');
        if (!iv)
            incertezze.push("manca l'intervallo dell'indice: un segnale su tre non è disponibile");
        const dup = new Map();
        for (const p of ind.pagine)
            if (p.dup !== undefined)
                dup.set(p.dup, (dup.get(p.dup) || []).concat(p.n));
        let riscontri = [];
        for (const x of calc) {
            const manuale = inc.has(x.p.n);
            if (esc.has(x.p.n))
                continue;
            if (!x.occ && !manuale) {
                if (dentro(x.p.n))
                    riscontri.push(riscontro(x, 'fuori_programma', tau, dentro, ver, 'nell\'intervallo ma senza i termini del microstep (da controllare, non cancellata)'));
                continue;
            }
            const tratta = manuale || (tau > 0 && x.s >= tau && (x.inTitolo || x.occ >= 3));
            const classe = !tratta ? (iv && !dentro(x.p.n) ? 'richiamo' : 'presenza') : x.p.esercizio ? 'applicazione' : 'trattazione';
            const motivo = manuale ? 'inclusa a mano' : tratta ? 'BM25 ' + x.s + ' ≥ τ ' + tau + (x.inTitolo ? ' e termine nel titolo' : ' e ' + x.occ + ' occorrenze')
                : x.occ + ' occorrenze, BM25 ' + x.s + (x.s >= tau ? ' ma termine né nel titolo né ripetuto' : ' < τ ' + tau);
            riscontri.push(riscontro(x, classe, tau, dentro, ver, motivo, dup.get(x.p.n)));
        }
        const fortiDi = () => new Set(riscontri.filter(r => r.classe === 'trattazione' || r.classe === 'applicazione').map(r => r.n));
        for (let giro = 0; giro < VICINI; giro++) {
            const f = fortiDi();
            riscontri = riscontri.map(r => (r.classe === 'presenza' || (r.classe === 'richiamo' && !iv)) && (f.has(r.n - 1) || f.has(r.n + 1))
                ? { ...r, classe: (ind.per.get(r.n).esercizio ? 'applicazione' : 'trattazione'), motivo: r.motivo + '; accanto a una trattazione' } : r);
        }
        const forti = riscontri.filter(r => r.classe === 'trattazione' || r.classe === 'applicazione').map(r => r.n).sort((a, b) => a - b);
        const tratti = [];
        for (const n of forti) {
            const t = tratti[tratti.length - 1];
            if (t && n === t.a + 1)
                t.a = n;
            else
                tratti.push({ da: n, a: n, classe: 'trattazione' });
        }
        for (const t of tratti)
            if (t.a - t.da + 1 >= 3) {
                t.classe = 'approfondimento';
                riscontri = riscontri.map(r => r.n >= t.da && r.n <= t.a && r.classe === 'trattazione' ? { ...r, classe: 'approfondimento' } : r);
            }
        const contaSegnali = (r) => +r.segnali.intervallo + +r.segnali.bm25 + +r.segnali.verificata;
        const utili = riscontri.filter(r => r.classe !== 'fuori_programma');
        const stato = utili.some(r => inc.has(r.n) || contaSegnali(r) >= 2) ? 'coperto' : utili.some(r => contaSegnali(r) === 1) ? 'da_verificare' : 'lacuna';
        if (stato === 'da_verificare')
            incertezze.push('un solo segnale: fonte da verificare');
        riscontri.sort((a, b) => b.punteggio - a.punteggio || a.n - b.n);
        return { stato, tau, riscontri, tratti, incertezze };
        function riscontro(x, classe, t, inIv, v, motivo, duplicati) {
            const r = { n: x.p.n, classe, punteggio: x.s, occorrenze: x.occ, inTitolo: x.inTitolo,
                segnali: { intervallo: inIv(x.p.n), bm25: t > 0 && x.s >= t, verificata: v.has(x.p.n) }, estratto: estratto(x.p.testo, radiciTermini), motivo };
            if (duplicati && duplicati.length)
                r.duplicati = duplicati;
            return r;
        }
    }
    return { costruisci, copertura, soglia, titoliDa, parole, rad, simboli: (s) => simboli(forma(s)) };
})();

const MotoreStudio = (() => {
    const PREF = { fonte: null, richiamo: null, quiz: 'quiz', errori: 'quiz', diagnostico: 'quiz', carte: 'carte', appunto: 'appunti' };
    const CONSOLIDA = [1, 2, 4, 6], FINALE = 5, PAUSA = 5, BLOCCO = 25, MIN_PASSO = 10;
    const tra = (x, a, b) => Math.max(a, Math.min(b, x));
    function obiettivo(o, minuti) { return o !== 'auto' ? o : minuti < 15 ? 'breve' : 'ordinaria'; }
    const attivo = (m, p) => { const k = PREF[m]; return !k || p[k] !== false; };
    function ordina(c) {
        return c.slice().sort((a, b) => a.livello - b.livello || b.ind - a.ind || a.min - b.min || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }
    function fattori(oss) {
        const f = {};
        for (const o of oss) {
            if (!(o.min > 0) || !(o.sec > 0))
                continue;
            const r = tra(o.sec / 60 / o.min, 0.5, 2), p = f[o.metodo];
            f[o.metodo] = p === undefined ? r : Math.round((0.3 * r + 0.7 * p) * 100) / 100;
        }
        return f;
    }
    function varia(v) {
        const out = v.slice();
        for (let i = 2; i < out.length; i++) {
            if (out[i].metodo !== out[i - 1].metodo || out[i].metodo !== out[i - 2].metodo)
                continue;
            const j = out.findIndex((x, n) => n > i && x.livello === out[i].livello && x.metodo !== out[i].metodo);
            if (j > 0) {
                const x = out[j];
                out.splice(j, 1);
                out.splice(i, 0, x);
            }
        }
        return out;
    }
    function componi(o, minuti, pref, cand, fatt = {}) {
        const ob = obiettivo(o, minuti), finale = minuti >= 15 ? FINALE : 0;
        const pause = minuti >= 50 ? PAUSA * Math.floor((minuti - finale) / 30) : 0;
        const budget = finale ? Math.max(0, minuti - Math.max(finale + pause, Math.ceil(minuti * 0.1))) : Math.floor(minuti * 0.9);
        const esclusi = [], dentro = [], visti = new Set();
        let resto = budget, tettoStep = Math.max(MIN_PASSO, Math.round(minuti * 0.4)), nAp = 0;
        for (const c0 of ordina(cand)) {
            if (visti.has(c0.id))
                continue;
            visti.add(c0.id);
            const c = { ...c0, min: Math.max(1, Math.round(c0.min * (fatt[c0.metodo] || 1))) }, no = (perche) => esclusi.push({ titolo: c.voce.titolo, perche });
            if (!attivo(c.metodo, pref)) {
                no('metodo disattivato');
                continue;
            }
            if (ob === 'consolidamento' && !CONSOLIDA.includes(c.livello)) {
                no('consolidamento: niente contenuto nuovo');
                continue;
            }
            if (ob === 'breve' && c.metodo === 'fonte') {
                no('serve leggere: non entra in una sessione breve');
                continue;
            }
            if (c.gruppo === 'step' && tettoStep < c.min) {
                no('ripassi dei sotto-step già al 40% del tempo');
                continue;
            }
            if (c.gruppo === 'appunti' && nAp >= 3) {
                no('già 3 appunti in questa sessione');
                continue;
            }
            if (c.min > resto) {
                no('non entra nel tempo (' + c.min + ' min)');
                continue;
            }
            dentro.push(c);
            resto -= c.min;
            if (c.gruppo === 'step')
                tettoStep -= c.min;
            if (c.gruppo === 'appunti')
                nAp++;
        }
        const voci = [];
        let acc = 0;
        varia(dentro).forEach((c, i, a) => {
            voci.push({ ...c.voce, min: c.min, metodo: c.metodo, livello: c.livello, motivo: c.motivo });
            acc += c.min;
            if (acc >= BLOCCO && i < a.length - 1 && minuti >= 50) {
                voci.push({ tipo: 'pausa', titolo: '☕ Pausa', sotto: 'Alzati, bevi, niente social: il cervello consolida', min: PAUSA });
                acc = 0;
            }
        });
        if (finale)
            voci.push({ tipo: 'richiamo', titolo: '🔁 Richiamo finale', sotto: 'Senza guardare: scrivi i 3 concetti chiave di oggi e una domanda d\'esame che ti faresti', min: FINALE, metodo: 'richiamo' });
        return { obiettivo: ob, minuti, voci, esclusi, margine: minuti - voci.reduce((x, v) => x + v.min, 0) };
    }
    return { componi, ordina, fattori, obiettivo, attivo, varia };
})();

const PadronanzaUI = (() => {
    const VARI = ['da_studiare', 'da_consolidare', 'in_consolidamento', 'consolidato', 'non_verificato'];
    const COL = {
        da_studiare: 'var(--rosso)', da_consolidare: 'color-mix(in srgb, var(--rosso) 45%, var(--sup2))',
        in_consolidamento: 'color-mix(in srgb, var(--accento) 45%, var(--sup2))', consolidato: 'var(--accento)', non_verificato: 'var(--linea)',
    };
    const plur = (s, n) => n === 1 ? Concetti.NOMI[s] : s === 'consolidato' ? 'consolidati' : s === 'non_verificato' ? 'non verificati' : Concetti.NOMI[s];
    const ICO = { da_studiare: '●', da_consolidare: '◐', in_consolidamento: '◑', consolidato: '✔', non_verificato: '○' };
    function barra5(n, tot, nome) {
        const testo = VARI.filter(s => n[s]).map(s => n[s] + ' ' + plur(s, n[s])).join(', ');
        return h('div.pad-barra', { role: 'img', 'aria-label': nome + ': ' + testo }, VARI.filter(s => n[s]).map(s => h('span', { style: { width: (n[s] / Math.max(1, tot)) * 100 + '%', background: COL[s] }, title: n[s] + ' ' + plur(s, n[s]) })));
    }
    function apriQuiz(sk) {
        const t = trovaScheda(sk);
        if (!t) {
            avviso('Scheda non trovata nei corsi caricati.');
            return;
        }
        void QuizApp.apri(t.pk, t.m, t.micro, t.s);
    }
    const BUCO = { senza_domande: 'nessuna domanda: non si può verificare', poche_domande: 'meno di ' + Concetti.MIN_AFFIDABILE + ' domande: non si può verificare',
        debole: 'debole: verificalo', non_verificato: 'mai verificato', senza_pagine: 'nessuna pagina o slide citata dalle domande' };
    async function matrice(det, t, giorno) {
        const ul = det.querySelector('ul.pad-concetti');
        if (!ul)
            return;
        const stato = h('p.tenue.piccolo', { role: 'status' }, '⏳ Carico le domande della scheda…');
        ul.before(stato);
        let b;
        try {
            b = await Banca.scheda(t.pk, t.m, t.micro, t.s);
        }
        catch (e) {
            console.warn('Padronanza: banca', e);
            stato.textContent = 'Domande non disponibili: resta l\'elenco dei concetti verificati.';
            return;
        }
        const righe = Concetti.matrice(t.s.id, t.s.titolo, b.focus || '', b.domande.map(d => ({ id: d.id, q: d.q, giusta: d.t === 'mcq' && d.o ? d.o[0] : String(d.show || ''),
            spieg: Array.isArray(d.e) ? d.e.join(' ') : String(d.e || ''), concetto: d.concetto, cit: d.cit })), Stato.tutti('memoria'), giorno, Locale);
        const buchi = righe.filter(x => x.buco && x.buco !== 'senza_pagine').length, ai = !t.pk.proprio && !Dominio.senzaAI();
        stato.textContent = buchi ? '⚠️ ' + buchi + (buchi === 1 ? ' concetto da sistemare' : ' concetti da sistemare') + ' su ' + righe.filter(x => !x.ripiego).length : '✔ Ogni concetto ha domande sufficienti ed è verificato';
        const azione = (x) => h('span.chips', null, (x.buco === 'senza_domande' || x.buco === 'poche_domande') && ai ? h('button.btn.neutro', { 'aria-label': 'Domande AI per ' + x.etichetta, onclick: () => AIGen.avvia(t.pk, t.m, t.micro, t.s) }, '🤖 Domande AI') : null, x.domande && x.buco !== 'senza_pagine' && x.p.stato !== 'consolidato' ? h('button.btn.neutro', { 'aria-label': 'Verifica ' + x.etichetta, onclick: () => void VerificaConcetti.avvia(t.s.id, [x.etichetta]) }, '🧩 Verifica') : null);
        ul.replaceWith(h('ul.pad-concetti.pad-matrice', { 'aria-label': 'Matrice dei concetti di ' + t.s.titolo }, righe.map(x => h('li', null, h('span', { style: { color: x.p.stato === 'non_verificato' ? 'var(--tenue)' : COL[x.p.stato] }, 'aria-hidden': 'true' }, ICO[x.p.stato] + ' '), h(x.ripiego ? 'span.tenue' : 'strong', null, x.etichetta), h('div.tenue.piccolo', null, 'Pagine: ' + (x.pagine.length ? x.pagine.join(' · ') : 'nessuna') + ' · Domande: ' + x.domande
            + ' · ' + Concetti.NOMI[x.p.stato] + (x.p.stato !== 'non_verificato' ? ' (' + x.p.motivo + ')' : '')), x.buco ? h('div.riga-tra.piccolo', null, h('span', null, '⚠️ ' + BUCO[x.buco]), azione(x)) : null))));
    }
    function riempi(el) {
        const g = ymd(new Date()), righe = Concetti.riepilogo(Stato.tutti('memoria'), g);
        svuota(el);
        el.appendChild(h('h2.card-titolo', null, '🧩 Padronanza per concetto'));
        el.appendChild(h('p.tenue.piccolo', null, 'Conta solo i quiz: lettura e appunti non la cambiano. Consolidato = verificato in almeno 3 giorni su 7 o più, ultime 2 verifiche ≥ 80%.'));
        el.appendChild(h('div.chips', null, h('button.btn', { type: 'button', onclick: () => ComponiQuiz.apri({ tipo: 'deboli' }) }, '🎯 Quiz sui punti deboli'), h('button.btn.neutro', { type: 'button', onclick: () => ComponiQuiz.apri({ tipo: 'cumulativo' }) }, '📚 Quiz cumulativo')));
        if (!righe.length) {
            el.appendChild(h('p.tenue.piccolo', null, 'Nessun concetto verificato: fai il quiz di una scheda della banca.'));
            return;
        }
        const perM = new Map();
        for (const r of righe) {
            const t = trovaScheda(r.sk), m = t ? t.m : '?';
            const l = perM.get(m) || [];
            l.push(r);
            perM.set(m, l);
        }
        for (const [m, l] of perM) {
            const n = Object.fromEntries(VARI.map(s => [s, 0]));
            let tot = 0;
            for (const r of l) {
                for (const c of r.concetti)
                    n[c.p.stato]++;
                n.non_verificato += r.totale - r.concetti.length;
                tot += r.totale;
            }
            const nome = m === '?' ? 'Altro' : nomeMateria(m), debole = l.find(r => r.insieme !== 'consolidato');
            el.appendChild(h('div.pad-materia', null, h('h3.pad-nome', { style: { color: m === '?' ? 'var(--tenue)' : coloreMateria(m) } }, nome), h('div.tenue.piccolo', null, n.consolidato + ' di ' + tot + ' concetti consolidati · ' + l.length + (l.length === 1 ? ' scheda verificata' : ' schede verificate')), barra5(n, tot, nome), h('div.pad-legenda.tenue.piccolo', null, VARI.filter(s => n[s]).map(s => h('span', null, h('i', { style: { background: COL[s] }, 'aria-hidden': 'true' }), n[s] + ' ' + plur(s, n[s])))), debole ? h('button.btn.neutro', { onclick: () => apriQuiz(debole.sk) }, '▶ Inizia dalla più debole') : null, l.map(r => {
                const t = trovaScheda(r.sk), tit = t ? t.micro + ' · ' + t.s.titolo : r.sk;
                const ver = r.totale - r.nonVerificati;
                const det = h('details.pad-scheda', null, h('summary', null, ICO[r.insieme] + ' ' + tit, h('span.tenue.piccolo', null, ' — ' + Concetti.NOMI[r.insieme] + ' (' + ver + '/' + r.totale + ' verificati)')), h('ul.pad-concetti', null, r.concetti.map(c => h('li', null, h('span', { style: { color: c.p.stato === 'non_verificato' ? 'var(--tenue)' : COL[c.p.stato] }, 'aria-hidden': 'true' }, ICO[c.p.stato] + ' '), h('strong', null, c.etichetta), h('span.tenue.piccolo', null, ' — ' + Concetti.NOMI[c.p.stato] + ': ' + c.p.motivo))), r.totale > r.concetti.length ? h('li.tenue.piccolo', null, '○ ' + (r.totale - r.concetti.length) + ' concetti non ancora verificati') : null, r.ripiego ? h('li.tenue.piccolo', null, 'Domande senza concetto distinto: ' + Concetti.NOMI[r.ripiego.stato] + ' (' + r.ripiego.motivo + '). Correggile da «Modifica domanda» › Concetto.') : null), t ? h('button.btn.neutro', { onclick: () => apriQuiz(r.sk) }, '🧩 Rifai il quiz') : null);
                if (t)
                    det.addEventListener('toggle', () => { if (det.open && !det.dataset.matrice) {
                        det.dataset.matrice = '1';
                        void matrice(det, t, g);
                    } });
                return det;
            })));
        }
    }
    return { riempi };
})();

const StudiaOra = (() => {
    const MIN = 10, VECCHIA = 'imc-studia-ora';
    const g8 = (d) => ymd(d);
    function prefGlobali() { const m = (imp() || {}).metodi; return { quiz: !m || m.quiz !== false, carte: !m || m.carte !== false, appunti: !m || m.appunti !== false }; }
    function carteAuto() { const i = (imp() || {}); return i.carteAuto || (i.carteDaErrori === false ? 'mai' : 'proponi'); }
    function metodoCoda(s) { return s === 'carte' ? 'carte' : s === 'appunti' ? 'appunto' : s === 'piano' ? 'richiamo' : 'quiz'; }
    function motivoCoda(e) {
        if (e.sorgente === 'step')
            return 'ripasso in scadenza · ' + (e.sotto.split(' · ').pop() || '');
        if (e.sorgente === 'carte')
            return e.sotto;
        if (e.sorgente === 'quiz')
            return e.n + ' domande scadute';
        if (e.sorgente === 'appunti')
            return 'sezioni da ripassare';
        if (e.sorgente === 'concetti')
            return 'verifica scaduta · ' + e.sotto;
        return 'ripasso previsto dal piano';
    }
    function istantanea(giorno) {
        const g = g8(giorno), out = [], ieri = g8(new Date(giorno.getTime() - 2 * 864e5));
        for (const e of CodaRipasso.dovuti(g)) {
            const ill = e.sorgente === 'quiz' && QuizRifare.dovute(g).some(s => !!(s.neuro && s.neuro.ultimoCaso === 'illusione_competenza' && s.ultima >= ieri));
            out.push({ id: e.voce.id && e.sorgente !== 'concetti' ? 'scheda:' + e.voce.id : e.id, livello: ill ? 1 : 2, ind: e.priorita, metodo: metodoCoda(e.sorgente), min: e.voce.min, voce: e.voce,
                motivo: ill ? 'eri certo ma era sbagliato' : motivoCoda(e), gruppo: e.sorgente === 'step' ? 'step' : e.sorgente === 'appunti' ? 'appunti' : undefined });
        }
        const vg = Studio.vociDelGiorno(giorno).filter(x => !x.v.speciale && x.p.modo !== 'raffinamento' && !x.v.isRipassoFSRS);
        const dip = new Map();
        for (const x of vg) {
            const u = (x.p.unita || []).find(z => z.uid === x.v.uid);
            if (!u)
                continue;
            for (const pu of u.prereq)
                for (const gp of x.p.giorni)
                    for (const v of gp.voci)
                        if (v.uid === pu && !v.isRipassoFSRS && !Studio.stepFatto(v.k, x.p)) {
                            const d = dip.get(v.k);
                            dip.set(v.k, { p: x.p, n: (d ? d.n : 0) + 1 });
                        }
        }
        dip.forEach((d, k) => {
            const t = Studio.trovaSotto(k), s = t && Studio.schedeDi(t.sub).find(x => x.tipo === 'P' && !Studio.fatta(x.id));
            if (!s)
                return;
            out.push({ id: 'scheda:' + s.id, livello: 3, ind: d.n, metodo: 'fonte', min: MIN, motivo: 'prerequisito di ' + d.n + (d.n === 1 ? ' argomento' : ' argomenti') + ' di oggi',
                voce: { tipo: 'scheda', titolo: '🧩 Prerequisito ' + Studio.etichetta(k) + ' · scheda ' + s.k + '/' + s.n, sotto: s.titolo, min: MIN, k, id: s.id } });
        });
        for (const x of tutteLeSchede().filter(x => daRifare(x.s.id)))
            out.push({ id: 'scheda:' + x.s.id, livello: 4, ind: 0, metodo: 'errori', min: MIN, motivo: 'errori aperti in questa scheda',
                voce: { tipo: 'errore', titolo: '✏️ Da rifare · ' + Studio.etichetta(x.sub.k), sotto: x.s.titolo, min: MIN, k: x.sub.k, id: x.s.id } });
        let ord = 1000;
        for (const x of vg) {
            const t = Studio.trovaSotto(x.v.k);
            if (!t)
                continue;
            if (Freddo.possibile(x.v.k) && !Freddo.rec(x.v.k))
                out.push({ id: 'freddo:' + x.v.k, livello: 5, ind: ord--, metodo: 'diagnostico', min: MIN, motivo: 'previsto oggi dal piano · prima di leggere',
                    voce: { tipo: 'freddo', titolo: '🧊 Prova a freddo ' + Studio.etichetta(x.v.k), sotto: 'Prima di leggere: d\'istinto, non conta', min: MIN, k: x.v.k } });
            for (const s of Studio.schedeDi(t.sub).filter(z => z.tipo === 'P' && !Studio.fatta(z.id)))
                out.push({ id: 'scheda:' + s.id, livello: 5, ind: ord--, metodo: 'fonte', min: MIN, motivo: 'previsto oggi dal piano',
                    voce: { tipo: 'scheda', titolo: '📖 ' + Studio.etichetta(x.v.k) + ' · scheda ' + s.k + '/' + s.n, sotto: s.titolo + ' · pp. ' + Studio.intervalli(Studio.pagineSet(s.pagine)), min: MIN, k: x.v.k, id: s.id } });
        }
        for (const m of Stato.tutti('memoria')) {
            if (!m.er.startsWith('sub:') || m.esposto || !(m.s < 21) || m.due <= g)
                continue;
            const giorni = new Set((m.log || []).filter(l => l[1] > 0).map(l => l[0]));
            if (giorni.size < 2)
                continue;
            const k = m.er.slice(4), sc = Ripassi.schedaDaProporre(k);
            if (!sc)
                continue;
            out.push({ id: 'cons:' + k, livello: 6, ind: -m.s, metodo: 'quiz', min: MIN, gruppo: 'step', motivo: 'da fissare prima che si stabilizzi (stabilità ' + Math.round(m.s) + ' g)',
                voce: { tipo: 'ripasso', titolo: '🔒 Consolida ' + Studio.etichetta(k), sotto: 'Rifai: ' + sc.titolo, min: MIN, k, id: sc.id } });
        }
        const finale = Studio.vociDelGiorno(giorno).some(x => /^FINALE-|~FIN~/.test(x.v.k))
            || esamiNoti().some(e => { const d = Math.round((daDt(e.data).getTime() - daDt(g).getTime()) / 864e5); return d >= 1 && d <= 7; });
        if (finale)
            VerificaConcetti.perFinale(Stato.tutti('memoria'), g, sk => { const t = trovaScheda(sk); return t ? materiaDi(t.k) || t.m : ''; }).forEach((x, i) => {
                const t = trovaScheda(x.sk);
                if (!t)
                    return;
                const gia = out.find(c => c.voce.tipo === 'concetti' && c.voce.id === x.sk);
                if (gia) {
                    const con = (gia.voce.con || []).concat(x.etichette.filter(e => !(gia.voce.con || []).includes(e))).slice(0, VerificaConcetti.MAX_CON);
                    gia.voce = { ...gia.voce, con, sotto: con.join(' · '), min: VerificaConcetti.PER * con.length };
                    gia.min = gia.voce.min;
                    return;
                }
                const min = VerificaConcetti.PER * x.etichette.length, sotto = x.etichette.join(' · ');
                out.push({ id: 'conc:' + x.sk, livello: 6, ind: 1000 - i, metodo: 'quiz', min, motivo: 'settimana finale · ' + Concetti.NOMI[x.peggiore] + ' · ricordo ' + Math.round(x.r * 100) + '%',
                    voce: { tipo: 'concetti', titolo: '🧩 Verifica cumulativa · ' + Studio.etichetta(t.k), sotto, min, k: t.k, id: x.sk, con: x.etichette } });
            });
        const perScheda = new Map();
        for (const m of Stato.tutti('memoria')) {
            if (!m.er.startsWith('con:') || m.deleted || m.ripiego || m.due <= g || Concetti.stato(m, g).stato !== 'in_consolidamento')
                continue;
            const x = perScheda.get(m.sk) || { et: [], s: Infinity };
            x.et.push(m.etichetta);
            x.s = Math.min(x.s, m.s);
            perScheda.set(m.sk, x);
        }
        for (const [sk, x] of perScheda) {
            const t = trovaScheda(sk);
            if (!t || out.some(c => c.id === 'cons:' + t.k || c.id === 'conc:' + sk))
                continue;
            out.push({ id: 'conc:' + sk, livello: 6, ind: -x.s, metodo: 'quiz', min: MIN, gruppo: 'step',
                motivo: x.et.length + (x.et.length === 1 ? ' concetto' : ' concetti') + ' in consolidamento: ' + x.et.slice(0, 3).join(', ') + (x.et.length > 3 ? '…' : ''),
                voce: { tipo: 'ripasso', titolo: '🧩 Consolida ' + Studio.etichetta(t.k), sotto: 'Rifai: ' + t.s.titolo, min: MIN, k: t.k, id: sk } });
        }
        return out;
    }
    function osservazioni() {
        const out = [];
        for (const s of Stato.tutti('sessioneora').filter(x => x.chiusa).sort((a, b) => a.inizio - b.inizio).slice(-30))
            for (const v of s.voci)
                if (v.metodo && v.sec)
                    out.push({ metodo: v.metodo, min: v.min, sec: v.sec });
        return out;
    }
    function proposta(minuti, giorno = oggi(), o = 'auto', pref = prefGlobali()) {
        return MotoreStudio.componi(o, minuti, pref, istantanea(giorno), MotoreStudio.fattori(osservazioni()));
    }
    function componi(minuti, giorno = oggi(), o = 'auto', pref = prefGlobali()) { return proposta(minuti, giorno, o, pref).voci; }
    function migra() {
        let v = null;
        try {
            v = JSON.parse(localStorage.getItem(VECCHIA) || 'null');
            localStorage.removeItem(VECCHIA);
        }
        catch (e) {
            console.warn('StudiaOra.migra', e);
        }
        if (v && Array.isArray(v.voci) && !sessioneAperta())
            Stato.salva({ id: 'sor-' + v.inizio, type: 'sessioneora', updatedAt: Date.now(), inizio: v.inizio, minuti: v.minuti, obiettivo: 'auto', voci: v.voci });
    }
    function leggi() { migra(); return sessioneAperta() || null; }
    function avvia(minuti, o = 'auto', pref = prefGlobali()) {
        const p = proposta(minuti, oggi(), o, pref), t = Date.now();
        const s = { id: 'sor-' + t, type: 'sessioneora', updatedAt: t, inizio: t, minuti, obiettivo: p.obiettivo, voci: p.voci, esclusi: p.esclusi.slice(0, 20), pref };
        Stato.salva(s);
        const prima = s.voci.find(v => v.k);
        Timer.avvia({ m: prima && prima.k ? materiaDi(prima.k) : undefined, k: prima && prima.k, titolo: 'Studia ora · ' + minuti + ' min', durata: minuti });
        return s;
    }
    function cambia(f) { const s = sessioneAperta(); if (!s)
        return; const c = JSON.parse(JSON.stringify(s)); f(c); c.updatedAt = Date.now(); Stato.salva(c); }
    function segnaFatto(i) {
        cambia(s => { const v = s.voci[i]; if (!v)
            return; v.fatto = !v.fatto; if (v.fatto && v.avviata)
            v.sec = Math.min(Math.round((Date.now() - v.avviata) / 1000), v.min * 180); });
    }
    function inizia(i) { cambia(s => { const v = s.voci[i]; if (v && !v.fatto && !v.avviata)
        v.avviata = Date.now(); }); }
    function chiudi() { cambia(s => { s.chiusa = Date.now(); }); }
    return { componi, proposta, istantanea, avvia, leggi, segnaFatto, inizia, chiudi, prefGlobali, carteAuto };
})();
function eseguiVoce(v) {
    if (v.tipo === 'freddo' && v.k) {
        avviaProvaAFreddo(v.k);
        return;
    }
    if (v.tipo === 'carte') {
        avviaCarte(undefined, 'Flashcard');
        return;
    }
    if (v.tipo === 'quiz') {
        QuizRifare.avvia();
        return;
    }
    if (v.tipo === 'concetti' && v.id) {
        VerificaConcetti.avvia(v.id, v.con || []);
        return;
    }
    if (v.tipo === 'piano' && v.id) {
        apriPianoDi(v.id);
        return;
    }
    if (v.tipo === 'appunto' && v.id) {
        const a = Stato.prendi(v.id);
        if (a) {
            apriCornell(a, true);
            return;
        }
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
const StudiaOraUI = (() => {
    const OB = [['auto', 'Automatico'], ['breve', 'Breve'], ['consolidamento', 'Solo consolidare']];
    const MET = [['quiz', 'Quiz'], ['carte', 'Flashcard'], ['appunti', 'Appunti']];
    const chip = (on, t, f) => h('button.chip' + (on ? '.attivo' : ''), { 'aria-pressed': String(on), onclick: f }, t);
    function adesso(giorno = oggi()) {
        const lavoro = (vv) => vv.filter(v => v.tipo !== 'pausa' && v.tipo !== 'richiamo');
        const tutto = lavoro(StudiaOra.componi(90, giorno)), serve = tutto.reduce((s, v) => s + v.min, 0);
        if (!tutto.length)
            return { minuti: 0, riassunto: 'Niente in scadenza: buon momento per avanzare o per una pausa vera.' };
        const minuti = [25, 50, 90].find(m => Math.ceil(serve / 0.9) + 5 <= m) || 90, voci = lavoro(StudiaOra.componi(minuti, giorno));
        const n = (tipo) => voci.filter(v => v.tipo === tipo).length, pezzi = [];
        const nc = Carte.conta(), nq = QuizRifare.conta(ymd(giorno));
        if (n('ripasso'))
            pezzi.push(n('ripasso') + (n('ripasso') === 1 ? ' ripasso' : ' ripassi'));
        if (n('carte'))
            pezzi.push((nc.ripasso + nc.nuove) + ' carte');
        if (n('quiz'))
            pezzi.push(Math.min(nq, QuizRifare.MAX) + ' quiz da rifare');
        if (n('appunto'))
            pezzi.push(n('appunto') + (n('appunto') === 1 ? ' appunto' : ' appunti'));
        if (n('concetti'))
            pezzi.push(n('concetti') + (n('concetti') === 1 ? ' verifica di concetti' : ' verifiche di concetti'));
        if (n('piano'))
            pezzi.push(n('piano') + (n('piano') === 1 ? ' ripasso del piano' : ' ripassi del piano'));
        const st = voci.find(v => (v.tipo === 'scheda' || v.tipo === 'freddo') && v.k);
        if (st && st.k)
            pezzi.push(Studio.etichetta(st.k));
        if (n('errore'))
            pezzi.push(n('errore') + ' errori');
        return { minuti, riassunto: (pezzi.join(' + ') || voci[0].titolo) };
    }
    function studia(sceltaSeVuoto = false) {
        if (StudiaOra.leggi()) {
            sessione();
            return;
        }
        const a = adesso();
        if (!a.minuti) {
            if (sceltaSeVuoto)
                scegli();
            else
                Timer.avvia({ titolo: 'Studio libero' });
            return;
        }
        StudiaOra.avvia(a.minuti);
        setTimeout(sessione, 50);
    }
    function scegli() {
        if (StudiaOra.leggi()) {
            sessione();
            return;
        }
        let minuti = 50, ob = 'auto';
        const pref = StudiaOra.prefGlobali();
        const corpo = h('div.modulo');
        const disegna = () => {
            svuota(corpo);
            const p = StudiaOra.proposta(minuti, oggi(), ob, pref);
            [
                h('div.gruppo-titolo', null, 'Quanto tempo hai?'),
                h('div.chips', null, [10, 25, 50, 90].map(m => chip(m === minuti, m + ' min', () => { minuti = m; disegna(); }))),
                h('div.gruppo-titolo', null, 'Obiettivo'),
                h('div.chips', null, OB.map(([o, t]) => chip(o === ob, t, () => { ob = o; disegna(); }))),
                h('div.gruppo-titolo', null, 'Metodi di questa sessione'),
                h('div.chips', null, MET.map(([k, t]) => chip(pref[k], t, () => { pref[k] = !pref[k]; disegna(); }))),
                h('div.gruppo-titolo', null, 'La tua sessione'),
                h('div.gruppo', null, p.voci.map(v => h('div.widget-riga', null, h('span.nome', null, v.titolo, h('div.tenue.piccolo', null, v.motivo ? v.motivo : v.sotto)), h('span.tenue.piccolo', null, v.min + "'")))),
                p.esclusi.length ? h('details', null, h('summary.tenue.piccolo', null, 'Non entrano (' + p.esclusi.length + ')'), h('div.gruppo', null, p.esclusi.slice(0, 12).map(x => h('div.tenue.piccolo', null, x.titolo + ' — ' + x.perche)))) : null,
                h('div.tenue.piccolo', null, 'Ordine: illusioni di competenza, ripassi in scadenza, prerequisiti, errori, contenuto nuovo, consolidamento. Almeno il 10% del tempo resta per pause e richiamo finale; ciò che non entra è elencato con il motivo.'),
            ].forEach(el => el && corpo.appendChild(el));
        };
        disegna();
        foglio({ titolo: '▶ Studia ora', corpo, etichettaSalva: 'Inizia', salva: () => { StudiaOra.avvia(minuti, ob, pref); setTimeout(sessione, 50); } });
    }
    function sessione() {
        const corpo = h('div.modulo');
        const disegna = () => {
            const s = StudiaOra.leggi();
            svuota(corpo);
            if (!s)
                return;
            const prossima = s.voci.findIndex(v => !v.fatto), fatte = s.voci.filter(v => v.fatto).length;
            const esegui = (i) => { StudiaOra.inizia(i); eseguiVoce(s.voci[i]); };
            [
                h('div.tenue.piccolo', null, fatte + ' di ' + s.voci.length + ' fatte · ' + s.minuti + ' minuti · iniziata alle ' + hm(new Date(s.inizio))),
                barra(fatte, s.voci.length),
                h('div.gruppo', null, s.voci.map((v, i) => h('div.voce-lista.task' + (v.fatto ? '.fatto' : '') + (i === prossima ? '.sessione-ora' : ''), null, h('button.spunta' + (v.fatto ? '.on' : ''), { 'aria-label': v.fatto ? 'Da fare' : 'Fatto', onclick: () => { StudiaOra.segnaFatto(i); disegna(); } }, v.fatto ? '✓' : ''), h('button.voce-corpo', { onclick: () => esegui(i) }, h('span.voce-titolo', { style: { whiteSpace: 'normal' } }, v.titolo), h('span.voce-sotto', null, (v.motivo || v.sotto) + ' · ' + v.min + "'"))))),
                prossima >= 0 ? h('div.bottoni', null, h('button.btn', { onclick: () => esegui(prossima) }, '▶ ' + s.voci[prossima].titolo.replace(/^\S+\s/, ''))) : h('div.vuoto', null, '🎉 Sessione completata. Ora 5 minuti di pausa tranquilla, senza schermo.'),
            ].forEach(el => corpo.appendChild(el));
        };
        disegna();
        foglio({ titolo: 'Sessione in corso', corpo, etichettaSalva: 'Termina', salva: () => { StudiaOra.chiudi(); avviso('Sessione chiusa.'); } });
    }
    function preferenze() {
        const i = imp(), pref = StudiaOra.prefGlobali();
        let ca = StudiaOra.carteAuto(), sa = i.suggerisciAppunti !== false;
        const corpo = h('div.modulo');
        const disegna = () => {
            svuota(corpo);
            [
                h('div.gruppo-titolo', null, 'Metodi che l\'app può proporti'),
                h('div.chips', null, MET.map(([k, t]) => chip(pref[k], t, () => { pref[k] = !pref[k]; disegna(); }))),
                h('div.tenue.piccolo', null, 'Un metodo spento non compare mai in Studia ora; nella singola sessione puoi riaccenderlo solo per quella volta. Lettura e richiamo restano sempre.'),
                h('div.gruppo-titolo', null, 'Flashcard dagli errori dei quiz'),
                h('div.chips', null, [['mai', 'Mai'], ['proponi', 'Proponi'], ['auto', 'Automatiche']].map(([v, t]) => chip(ca === v, t, () => { ca = v; disegna(); }))),
                h('div.gruppo-titolo', null, 'Appunti dopo il quiz'),
                h('div.chips', null, chip(sa, 'Suggeriscili', () => { sa = !sa; disegna(); })),
            ].forEach(el => corpo.appendChild(el));
        };
        disegna();
        foglio({ titolo: 'Metodi di studio', corpo, etichettaSalva: 'Salva', salva: () => { Stato.salva({ ...i, metodi: { ...pref }, carteAuto: ca, suggerisciAppunti: sa, updatedAt: Date.now() }); avviso('Preferenze salvate.'); } });
    }
    return { adesso, studia, scegli, sessione, preferenze };
})();

const VerificaConcetti = (() => {
    const PER = 3, MAX_CON = 3;
    const ORD = ['da_studiare', 'da_consolidare', 'in_consolidamento', 'consolidato', 'non_verificato'];
    function scegli(domande, ass, etichette, vista) {
        const gruppi = etichette.slice(0, MAX_CON).map(e => domande
            .filter(d => { const a = ass.get(d.id); return !!a && !a.ripiego && Concetti.slug(a.etichetta) === Concetti.slug(e); })
            .sort((a, b) => { const x = vista(a.id), y = vista(b.id); return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0; })
            .slice(0, PER));
        const out = [];
        for (let i = 0; i < PER; i++)
            for (const g of gruppi)
                if (g[i])
                    out.push(g[i]);
        return out;
    }
    function perFinale(mem, giorno, materiaDi) {
        const per = new Map();
        for (const m of mem) {
            if (!m || m.deleted || !String(m.er || '').startsWith('con:') || m.ripiego || !m.sk || !m.etichetta || !m.ultimo || m.due <= giorno)
                continue;
            const x = per.get(m.sk) || { c: [] };
            x.c.push({ e: m.etichetta, p: Concetti.stato(m, giorno) });
            per.set(m.sk, x);
        }
        const peso = (p) => ORD.indexOf(p.stato) * 10 + (p.r === null ? 1 : p.r);
        const schede = [];
        per.forEach((x, sk) => {
            const c = x.c.sort((a, b) => peso(a.p) - peso(b.p) || (a.e < b.e ? -1 : 1)).slice(0, MAX_CON);
            schede.push({ sk, etichette: c.map(z => z.e), peggiore: c[0].p.stato, r: Math.min(...c.map(z => z.p.r === null ? 1 : z.p.r)), materia: materiaDi(sk) });
        });
        schede.sort((a, b) => ORD.indexOf(a.peggiore) - ORD.indexOf(b.peggiore) || a.r - b.r || (a.sk < b.sk ? -1 : 1));
        const code = new Map();
        for (const s of schede) {
            const l = code.get(s.materia) || [];
            l.push(s);
            code.set(s.materia, l);
        }
        const out = [], liste = Array.from(code.values());
        for (let i = 0; out.length < schede.length; i++)
            for (const l of liste)
                if (l[i])
                    out.push(l[i]);
        return out;
    }
    async function avvia(sk, etichette, chiudi) {
        const t = trovaScheda(sk);
        if (!t) {
            avviso('Scheda non trovata: ' + sk);
            return;
        }
        let b;
        try {
            b = await Banca.scheda(t.pk, t.m, t.micro, t.s);
        }
        catch (e) {
            console.warn('VerificaConcetti: banca', e);
            avviso('⚠️ Domande della scheda non disponibili (serve la connessione la prima volta).', 6000);
            return;
        }
        const lista = Concetti.etichette(b.focus || ''), doms = b.domande;
        const ass = Concetti.assegna(sk, t.s.titolo, doms.map(d => ({ id: d.id, q: d.q, giusta: d.t === 'mcq' && d.o ? d.o[0] : String(d.show || ''),
            spieg: Array.isArray(d.e) ? d.e.join(' ') : String(d.e || ''), concetto: d.concetto })), lista, Locale);
        const viste = new Map(Stato.tutti('statq').filter(s => !s.deleted && s.sk === sk).map(s => [s.id, s.ultima || '']));
        const sel = scegli(doms, ass, etichette, id => viste.get('sq-' + id) || '');
        if (!sel.length) {
            avviso('Nessuna domanda della scheda è assegnata a questi concetti: rifai il quiz completo.', 6000);
            apriScheda(t.pk, t.m, t.micro, t.s, true);
            return;
        }
        const scelte = sel;
        QuizApp.apri(t.pk, t.m, t.micro, t.s, () => scelte, { occh: '🧩 Verifica dei concetti · ' + scelte.length + (scelte.length === 1 ? ' domanda' : ' domande') + ' · il punteggio della scheda non cambia',
            titolo: etichette.slice(0, MAX_CON).join(' · '), chiudi, immagini: b.immagini, verifica: true, focus: b.focus });
    }
    return { scegli, perFinale, avvia, PER, MAX_CON };
})();
