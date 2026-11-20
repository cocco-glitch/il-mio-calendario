"use strict";
const Centro = (() => {
    const s = (x) => typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim();
    const slug = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '');
    const nelloStep = (m, step) => /^\d+(\.\d+)*$/.test(m) && m.startsWith(step + '.');
    const due = (n) => String(n).padStart(2, '0');
    const prefisso = (o) => slug(o.materia) + '-' + s(o.step);
    const nomeParte = (o, da, a = da) => prefisso(o) + '-s' + da + (a !== da ? '-' + a : '');
    const codiceDi = (o) => s(o.codice).toUpperCase().replace(/[^A-Z]/g, '') || 'X';
    function daPiano(p, step) {
        step = s(step);
        const avvisi = [...(p.avvisi || [])], schede = [], blocchi = [], numeri = [];
        for (const b of p.blocchi || []) {
            const micro = b.copre.flatMap(c => c.micro);
            const dentro = b.codice === step || nelloStep(b.codice, step) || micro.some(m => nelloStep(m, step));
            if (!dentro) {
                avvisi.push('Blocco ' + b.codice + ' (' + b.titolo + ') non è dello step ' + step + ': ignorato');
                continue;
            }
            blocchi.push(b.titolo);
            const cat = /raffin/i.test(b.titolo) ? 'raffinamento' : 'prioritaria';
            for (const c of b.copre) {
                const validi = c.micro.filter(m => nelloStep(m, step)), fuori = c.micro.filter(m => !nelloStep(m, step));
                if (fuori.length)
                    avvisi.push('Microstep fuori dallo step ' + step + ': ' + fuori.join(', ') + (validi.length ? '' : ' → scheda in ' + step + '.1'));
                for (const n of c.schede) {
                    numeri.push(n);
                    schede.push({ n, micro: validi.length ? validi : [step + '.1'], categoria: cat, blocco: b.titolo });
                }
            }
        }
        if (numeri.some((n, i) => n !== i + 1)) {
            avvisi.push('Schede rinumerate 1–' + schede.length + ' nell\'ordine del piano (erano ' + numeri.map(n => 'S' + n).join(' ') + ')');
            schede.forEach((x, i) => { x.n = i + 1; });
        }
        if (!schede.length)
            avvisi.push('Nessuna scheda per lo step ' + step);
        return { step, schede, blocchi, avvisi };
    }
    function schede(p, o) {
        const cod = codiceDi(o);
        return p.schede.map(x => ({ n: x.n, sigla: 'S' + due(x.n), id: cod + '-' + x.micro[0] + '-' + x.n, micro: x.micro.slice(), categoria: x.categoria, blocco: x.blocco }));
    }
    const dataBreve = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(d)); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
    function ripartisci(tot, pesi) {
        const somma = pesi.reduce((a, b) => a + b, 0) || 1;
        const out = pesi.map(p => Math.floor(tot * p / somma));
        let resto = tot - out.reduce((a, b) => a + b, 0);
        for (let i = 0; resto > 0 && out.length; i = (i + 1) % out.length, resto--)
            out[i]++;
        return out;
    }
    function chiusura(p, o) {
        const pref = prefisso(o), cod = codiceDi(o), step = s(o.step) || p.step, per = o.perScheda || 18, minB = o.minBlocco || 50;
        const sigla = (n) => pref + '-S' + due(n);
        const perMicro = new Map();
        for (const x of p.schede) {
            const l = perMicro.get(x.micro[0]) || [];
            l.push(x);
            perMicro.set(x.micro[0], l);
        }
        const nBlocchi = Math.max(1, p.blocchi.length), durata = nBlocchi * minB;
        const voci = [...perMicro.entries()], minuti = ripartisci(durata, voci.map(([, l]) => l.length));
        const sottoSchede = voci.map(([micro, l], i) => ({
            codice: micro, titolo: l[0].blocco || micro, microstep: [...new Set(l.flatMap(x => x.micro))], durataMin: minuti[i], wakefulRestMin: 12,
            schedePrioritarie: l.filter(x => x.categoria === 'prioritaria').map(x => sigla(x.n)), schedeRaffinamento: l.filter(x => x.categoria === 'raffinamento').map(x => sigla(x.n)),
        }));
        const prio = p.schede.filter(x => x.categoria === 'prioritaria').map(x => sigla(x.n)), raff = p.schede.filter(x => x.categoria === 'raffinamento').map(x => sigla(x.n));
        const tutte = p.schede.map(x => sigla(x.n)), base = prio.length ? prio : tutte;
        const titolo = s(o.titolo) || p.blocchi[0] || step, data = dataBreve(o.data || '');
        const programma = {};
        if (data)
            programma.formatoGeneraMjs = [cod + '|' + (s(o.unita) || 'UD' + step.split('.')[0]) + '|' + titolo + '|' + p.schede.length + '|' + step + '|' + data];
        programma.pianoStrutturato = {
            materiaCodice: cod, step, origine: 'ai_neuro', durataTotaleMin: durata, blocchiBRAC: nBlocchi, sottoSchede,
            ancoraggiRipassoFSRS: [{ intervallo: '+1g', target: base }, { intervallo: '+3g', target: base }, { intervallo: '+7g', target: raff.length ? raff : tutte }],
        };
        const meta = { schemaVersion: 2, origine: 'centro', materia: s(o.materia), codiceMateria: cod, unita: s(o.unita) || 'UD' + step.split('.')[0], stepId: pref, sottoStep: step, titolo,
            domandeTotali: p.schede.length * per, ripartizioneSchede: { totale: p.schede.length } };
        if (s(o.archetipo))
            meta.archetipo = s(o.archetipo);
        return { meta, programmaCalendario: programma };
    }
    const arrivata = (x) => x.stato === 'arrivata';
    function passoDi(r) {
        if (!s(r.materia) || !s(r.step))
            return 1;
        const sc = r.schede || [], e = r.esiti || {};
        if (!r.piano || !sc.length)
            return 2;
        if (!sc.every(arrivata))
            return 3;
        if (!e.controllato)
            return 4;
        if ((e.daCorreggere || 0) > 0)
            return 5;
        return e.provato ? 7 : 6;
    }
    const prossimaScheda = (r) => ((r.schede || []).filter(x => !arrivata(x)).sort((a, b) => a.n - b.n)[0] || { n: 0 }).n;
    const cmpNum = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const d = (x[i] || 0) - (y[i] || 0);
        if (d)
            return d;
    } return 0; };
    const DATA_FISSA = '2000-01-01';
    function albero(gruppi) {
        const perCartella = new Map();
        for (const g of gruppi) {
            const cartella = (g.files[0] && g.files[0].cartella) || '';
            const st = { chiave: g.chiave, step: g.step, sotto: '', stato: g.stato, schede: 0, domande: 0, microstep: [] };
            try {
                const tr = ImportaDrive.traduci(ImportaParti.unisci(g).pacchetto, DATA_FISSA), dom = new Map(tr.banche.map(b => [b.sk, b.domande.length]));
                st.sotto = tr.sotto;
                st.domande = tr.domande;
                st.microstep = tr.sub.microstep.map(m => ({ n: m.n, schede: m.schede.map(x => x.k), domande: m.schede.reduce((a, x) => a + (dom.get(x.id) || 0), 0) }));
                st.schede = st.microstep.reduce((a, m) => a + m.schede.length, 0);
            }
            catch (e) {
                st.errore = e.message;
            }
            const l = perCartella.get(cartella) || [];
            l.push(st);
            perCartella.set(cartella, l);
        }
        return [...perCartella.entries()].sort(([a], [b]) => a.localeCompare(b, 'it'))
            .map(([cartella, steps]) => ({ cartella, steps: steps.sort((a, b) => cmpNum(a.sotto, b.sotto) || a.step.localeCompare(b.step)) }));
    }
    function filtra(j, scelti) {
        const out = JSON.parse(JSON.stringify(j)), ok = new Set(scelti.map(s));
        const ps = (out.programmaCalendario && out.programmaCalendario.pianoStrutturato) || null;
        const quiz = Array.isArray(out.quiz) ? out.quiz : [], tieni = (x) => ok.has(s(x.codice || x.sottoStep));
        const sez = (Array.isArray(out.sottoSchede) ? out.sottoSchede : ps && Array.isArray(ps.sottoSchede) ? ps.sottoSchede : []).filter(x => x && tieni(x));
        const ampliato = quiz.some(q => q && ImportaParti.numScheda(q.scheda));
        let resta, bersaglio = null;
        if (ampliato) {
            const numeri = new Set();
            for (const m of ImportaDrive.traduci(j, DATA_FISSA).sub.microstep)
                if (ok.has(m.n))
                    for (const x of m.schede)
                        numeri.add(x.k);
            const primo = ImportaParti.numScheda((quiz.find(q => q && ImportaParti.numScheda(q.scheda)) || {}).scheda);
            resta = q => numeri.has(ImportaParti.numScheda(q.scheda) || primo);
            bersaglio = t => numeri.has(ImportaParti.numScheda(t));
        }
        else {
            const ids = new Set(sez.flatMap(x => [...(x.schedePrioritarie || []), ...(x.schedeRaffinamento || []), ...(x.rangeId || [])].map(s)));
            resta = q => ids.has(s(q.id)) || ok.has(s(q.sottoStep));
        }
        out.quiz = quiz.filter(q => q && resta(q));
        if (Array.isArray(out.sottoSchede))
            out.sottoSchede = out.sottoSchede.filter(x => x && tieni(x));
        if (ps) {
            if (Array.isArray(ps.sottoSchede))
                ps.sottoSchede = ps.sottoSchede.filter(x => x && tieni(x));
            const min = sez.reduce((a, x) => a + (Number(x.durataMin || x.durataBracMin) || 0), 0);
            if (min > 0)
                ps.durataTotaleMin = min;
            if (bersaglio && Array.isArray(ps.ancoraggiRipassoFSRS)) {
                const b = bersaglio;
                ps.ancoraggiRipassoFSRS = ps.ancoraggiRipassoFSRS.filter(a => a).map(a => Array.isArray(a.target) && a.target.length ? { ...a, target: a.target.filter(t => b(s(t))) } : a)
                    .filter(a => !Array.isArray(a.target) || a.target.length);
            }
        }
        out.meta = { ...(out.meta || {}), domandeTotali: out.quiz.length };
        return out;
    }
    const codiceVoce = (v) => (/^\s*(\d+(?:\.\d+)*)/.exec(s(v.capitolo)) || ['', ''])[1];
    function pagineMicrostep(indice, mappa, ms) {
        const voci = (indice || []).filter(v => v && codiceVoce(v)), i = voci.findIndex(v => codiceVoce(v) === s(ms));
        if (i < 0 || (mappa && mappa.fonte === 'nessuna'))
            return null;
        const da = Number(voci[i].pagina), dopo = voci[i + 1] ? Number(voci[i + 1].pagina) : NaN;
        const a = dopo > da ? dopo - 1 : null;
        const m = mappa && mappa.tratti.length ? mappa : null;
        return { stampDa: da, stampA: a, pdfDa: m ? MappaPagine.aPdf(m, da) : null, pdfA: m && a !== null ? MappaPagine.aPdf(m, a) : null,
            affidabilita: m ? m.affidabilita : 'nessuna' };
    }
    function mappaAuto(etichette, numeriPerPagina) {
        return (etichette && MappaPagine.daEtichette(etichette)) || MappaPagine.daStampati(numeriPerPagina || []);
    }
    function descriviMappa(m) {
        if (!m || (!m.tratti.length && m.fonte !== 'nessuna'))
            return '⚪ pagine non rilevate: indicale tu a mano (pagina del libro = pagina del PDF)';
        if (m.fonte === 'nessuna')
            return '⚪ senza numeri di pagina: si cita per capitolo e paragrafo';
        const n = m.tratti.length, tratti = n > 1 ? ', ' + n + ' tratti' : '';
        if (m.fonte === 'mano')
            return '🟢 pagine esatte (indicate a mano' + tratti + ')';
        if (m.fonte === 'auto-etichette')
            return '🟢 pagine esatte (etichette del PDF' + tratti + ')';
        return '🟡 pagine stimate dai numeri stampati' + (n > 1 ? ' (' + n + ' tratti)' : '') + ': controllale con la prova';
    }
    const slugLibro = (x) => String(x || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const idLibro = (materia, nome) => 'lib-' + slugLibro(materia) + '-' + slugLibro(nome);
    function libroDa(materia, l, prec) {
        const base = prec && !prec.deleted ? { ...prec } : { id: idLibro(materia, l.nome), type: 'libro', updatedAt: 0, nome: l.nome, materia, pdf: [], fonte: 'auto', mappa: null };
        base.nome = l.nome;
        base.materia = materia;
        base.pdf = l.pdf.map(nome => { const sd = l.segmenti ? MasterPrompt.segmentoDa(nome) : null; return sd ? { nome, segmentoDa: sd } : { nome }; });
        if (l.lettura)
            base.lettura = l.lettura;
        const misuraNuova = l.mappa && l.mappa.fonte !== 'mano' && l.mappa.fonte !== 'nessuna' ? l.mappa : null;
        base.misurata = misuraNuova || misurataDi(base);
        if ((base.fonte === 'auto' || base.fonte === 'indice') && misuraNuova)
            base.mappa = misuraNuova;
        if (base.mappa === undefined)
            base.mappa = null;
        return base;
    }
    function unisciSegmenti(segmenti) {
        const con = segmenti.filter(x => x.mappa && x.mappa.tratti.length);
        if (!con.length)
            return null;
        const tratti = con.flatMap(x => x.mappa.tratti.map(t => ({ pdfDa: t.pdfDa + x.base, pdfA: t.pdfA + x.base, stampDa: t.stampDa })));
        const stimata = con.some(x => x.mappa.affidabilita !== 'esatta');
        return { fonte: con.every(x => x.mappa.fonte === 'auto-etichette') ? 'auto-etichette' : 'auto-stampati', tratti, affidabilita: stimata ? 'stimata' : 'esatta' };
    }
    function indiceDa(testo) {
        return Pianificatore.righeIndice(testo).filter(v => v.pagina != null).map(v => ({ capitolo: v.num + ' ' + v.titolo, pagina: v.pagina }));
    }
    const misurataDi = (r) => r.misurata !== undefined ? r.misurata : r.fonte === 'auto' ? r.mappa : null;
    function applicaAncore(misurata, ancore) {
        if (!misurata || !misurata.tratti.length)
            return MappaPagine.daMano(ancore);
        let tratti = misurata.tratti.map(t => ({ ...t })).sort((a, b) => a.pdfDa - b.pdfDa);
        for (const a of [...ancore].sort((x, y) => x.pdf - y.pdf)) {
            const dentro = tratti.find(t => t.pdfDa <= a.pdf && a.pdf <= t.pdfA);
            const dopo = tratti.find(t => t.pdfDa > a.pdf);
            const fine = dentro ? dentro.pdfA : dopo ? dopo.pdfDa - 1 : MappaPagine.APERTO;
            if (dentro)
                dentro.pdfA = a.pdf - 1;
            tratti = tratti.filter(t => t.pdfA >= t.pdfDa);
            tratti.push({ pdfDa: a.pdf, pdfA: fine, stampDa: a.stampata });
            tratti.sort((x, y) => x.pdfDa - y.pdfDa);
        }
        return { fonte: 'mano', tratti, affidabilita: 'esatta' };
    }
    function mappaDi(r) {
        if (r.fonte === 'nessuna')
            return { fonte: 'nessuna', tratti: [], affidabilita: 'nessuna' };
        if (r.fonte === 'mano' && r.ancore && r.ancore.length)
            return applicaAncore(misurataDi(r), r.ancore);
        return misurataDi(r);
    }
    const numeroO = (x) => typeof x === 'string' && /^\s*\d+\s*$/.test(x) ? Number(x) : typeof x === 'string' ? x.trim() : x;
    function conAncore(r, a) {
        const ancora = { stampata: numeroO(a.stampata), pdf: a.pdf };
        const out = { ...r, misurata: misurataDi(r), ancore: [...(r.ancore || []).filter(x => x.pdf !== a.pdf), ancora].sort((x, y) => x.pdf - y.pdf), fonte: 'mano' };
        out.mappa = mappaDi(out);
        return out;
    }
    function conFonte(r, fonte) {
        const out = { ...r, misurata: misurataDi(r), fonte };
        out.mappa = mappaDi(out);
        return out;
    }
    function conProva(r, risposte, quando) {
        const norma = (x) => String(x == null ? '' : x).trim().toLowerCase();
        let out = { ...r, misurata: misurataDi(r) };
        let ok = 0;
        for (const x of risposte) {
            if (norma(x.letta) === norma(x.stampata)) {
                ok++;
                continue;
            }
            if (norma(x.letta))
                out = conAncore(out, { pdf: x.pdf, stampata: x.letta });
        }
        out.prova = { quando, ok, tot: risposte.length };
        return out;
    }
    function descriviLibro(r) {
        let s = r.fonte === 'indice' ? '📑 capitoli dall’indice · ' + (r.mappa ? descriviMappa(r.mappa) : '🟡 pagine stimate dall’indice (PDF non mappato)') : descriviMappa(r.mappa);
        if (r.prova) {
            const [a, m, g] = r.prova.quando.split('-');
            s += ' · provata il ' + g + '/' + m + '/' + a + ': ' + r.prova.ok + '/' + r.prova.tot;
        }
        return s;
    }
    function paginePer(libri, micro) {
        const out = {};
        for (const ms of micro)
            for (const l of libri) {
                if (!l || l.deleted || !l.indice || !l.indice.length)
                    continue;
                const p = pagineMicrostep(l.indice, l.mappa, ms);
                if (p) {
                    out[ms] = p;
                    break;
                }
            }
        return out;
    }
    const VUOTE = new Set(['quale', 'quali', 'della', 'delle', 'degli', 'dello', 'nella', 'nelle', 'negli', 'nello', 'dalla', 'dalle', 'dagli', 'dallo',
        'sulla', 'sulle', 'sugli', 'sullo', 'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'quelli', 'quelle', 'viene', 'vengono', 'essere',
        'tramite', 'attraverso', 'durante', 'mentre', 'anche', 'ancora', 'sempre', 'perché', 'quando', 'quanto', 'quanti', 'seguenti', 'seguente',
        'corretta', 'corretto', 'affermazione', 'risposta', 'funzione', 'principale', 'rispetto', 'possono', 'perche']);
    function paroleChiave(q) {
        const o = Array.isArray(q.opzioni) ? q.opzioni : [], e = q.esatta;
        const giusta = typeof e === 'number' && typeof o[e] === 'string' ? o[e] : '';
        const out = [];
        for (const w of (String(q.domanda || '') + ' ' + giusta).split(/[^\p{L}\p{N}]+/u)) {
            const l = w.toLowerCase();
            if (!(l.length >= 5 || /^\p{Lu}{2,}$/u.test(w)) || VUOTE.has(l) || out.includes(l))
                continue;
            out.push(l);
            if (out.length === 8)
                break;
        }
        return out;
    }
    const verificabile = (m) => !!m && m.fonte !== 'nessuna' && m.tratti.length > 0;
    function pagineDaLeggere(qs, m) {
        const pagine = new Set();
        if (verificabile(m))
            for (const q of qs)
                if (typeof q.fonte === 'string')
                    MappaPagine.verifica(m, q.fonte, p => { pagine.add(p); return ''; }, ['x']);
        return [...pagine].filter(p => p > 0).sort((a, b) => a - b);
    }
    const cambiaPagina = (t, da, a) => t.replace(new RegExp('(\\bpp?\\.\\s*)' + String(da) + '\\b', 'i'), '$1' + String(a));
    function verificaCitazioni(qs, m, testoPagina) {
        const out = { qs: [...qs], registro: [], problemi: [], ok: 0, dubbi: [] };
        if (!verificabile(m))
            return out;
        qs.forEach((q, i) => {
            if (typeof q.fonte !== 'string' || !q.fonte.trim())
                return;
            const id = String(q.id), v = MappaPagine.verifica(m, q.fonte, testoPagina, paroleChiave(q));
            const vecchia = (/\bpp?\.\s*(\d{1,5}|[ivxlcdm]+)\b/i.exec(q.fonte) || [])[1];
            if (v.esito === '✅')
                out.ok++;
            else if (v.esito === '❓')
                out.dubbi.push(id);
            else if (v.esito === '↔' && vecchia && v.pagina !== null) {
                const n = { ...q, fonte: cambiaPagina(q.fonte, vecchia, v.pagina) };
                if (typeof q.sourceRef === 'string')
                    n.sourceRef = cambiaPagina(q.sourceRef, vecchia, v.pagina);
                if (typeof q.spiegazione === 'string')
                    n.spiegazione = q.spiegazione.replace(/\[\[[^\]]*\]\]/g, c => cambiaPagina(c, vecchia, v.pagina));
                out.qs[i] = n;
                out.registro.push(id + ': p. ' + vecchia + ' → p. ' + v.pagina + ' (i concetti sono sulla pagina accanto)');
            }
            else
                out.problemi.push({ sev: 'err', id, msg: 'citazione p. ' + (vecchia || v.pagina) + ': ' + (v.esito === '⚠' ? 'sulla pagina solo parte dei concetti della domanda' : 'la pagina non contiene i concetti della domanda') });
        });
        return out;
    }
    return { prefisso, nomeParte, daPiano, schede, chiusura, passoDi, prossimaScheda, albero, filtra, pagineMicrostep, mappaAuto, descriviMappa, idLibro, libroDa, unisciSegmenti, indiceDa, conAncore, conFonte, conProva, descriviLibro, paginePer, paroleChiave, pagineDaLeggere, verificaCitazioni };
})();

const CentroUI = (() => {
    const PASSI = ['Obiettivo', 'Piano', 'Quiz', 'Controllo', 'Correggi', 'Prova', 'Importa'];
    const RE_STEP = /^\d+(\.\d+)*$/;
    const FORMATI_QUIZ = ['quiz-v3', 'quiz-v2', 'quiz-058', 'parte'];
    const vaiScheda = (x) => vai(x);
    const PER = () => PROFILO_STANDARD.perScheda;
    const SEGNO = { err: '⛔', warn: '⚠️', info: 'ℹ️' };
    const sig = (n) => 'S' + String(n).padStart(2, '0');
    const simbolo = (x) => x.stato === 'arrivata' ? '✅' : x.stato === 'interrotta' ? '✂️' : '⏳';
    const statoTesto = (x) => x.stato === 'arrivata' ? 'arrivata' : x.stato === 'interrotta' ? 'interrotta' : 'da fare';
    const aperte = () => Stato.tutti('creazione').filter(r => !r.deleted && !(r.esiti && r.esiti.importato))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const pref = (r) => Centro.prefisso({ materia: r.nomeMateria, step: r.step });
    const idParte = (r, n) => 'prq-' + pref(r) + '-s' + n;
    function parteDi(r, n) {
        const p = Stato.prendi(idParte(r, n));
        return p && !p.deleted ? p : null;
    }
    function domande(r) {
        const qs = [], daScheda = new Map();
        for (const x of r.schede || []) {
            const p = parteDi(r, x.n);
            if (p)
                for (const q of p.quiz) {
                    qs.push(q);
                    daScheda.set(String(q.id), x.n);
                }
        }
        return { qs, daScheda };
    }
    function salvaDomande(r, qs, daScheda) {
        const per = new Map();
        for (const q of qs) {
            const n = daScheda.get(String(q.id));
            if (n) {
                const l = per.get(n) || [];
                l.push(q);
                per.set(n, l);
            }
        }
        for (const [n, l] of per) {
            const p = parteDi(r, n);
            if (p)
                Stato.salva({ ...p, quiz: l }, true);
        }
    }
    function controlla(qs, avvisi = false, citazioni = []) {
        const v = Validatore.valida(qs), visti = new Set(), problemi = [];
        const tutti = [...[...v.bloccanti].flatMap(([id, ms]) => ms.map(msg => ({ sev: 'err', id, msg }))), ...v.qualita, ...v.insieme, ...citazioni];
        for (const p of tutti) {
            const k = p.id + '|' + p.msg;
            if (!visti.has(k)) {
                visti.add(k);
                problemi.push(p);
            }
        }
        const corr = DiagnosiQuiz.promptCorrezione(qs, problemi, { avvisi });
        return { v, problemi, corr };
    }
    const problemiCit = (r, qs) => (r.citazioni ? r.citazioni.problemi : [])
        .filter(p => qs.some(q => String(q.id) === p.id && q.fonte === p.fonte)).map(p => ({ sev: p.sev, id: p.id, msg: p.msg }));
    const libriVerificabili = (r) => (r.fonti ? r.fonti.libri : []).map(l => Stato.prendi(Centro.idLibro(r.nomeMateria, l.nome)))
        .filter((x) => !!x && !x.deleted && x.fonte !== 'nessuna' && !!x.mappa && x.mappa.fonte !== 'nessuna' && x.mappa.tratti.length > 0);
    const pdfScelti = new Map();
    async function datiPdf(nome) {
        const loc = pdfScelti.get(nome);
        if (loc)
            return new Uint8Array(await loc.arrayBuffer());
        const f = (await Drive.cerca(nome.replace(/\.pdf$/i, ''), 'application/pdf')).find(x => x.name === nome);
        if (!f)
            throw new Error('«' + nome + '» non trovato su Drive');
        return PdfCache.prendi(f.id);
    }
    async function testiPagine(l, pagine, avanza) {
        const testi = new Map();
        const seg = l.pdf.map(f => ({ nome: f.nome, base: f.segmentoDa ? f.segmentoDa - 1 : 0 })).sort((a, b) => a.base - b.base);
        const L = await caricaPdfJs();
        for (const [k, sg] of seg.entries()) {
            const fine = k + 1 < seg.length ? seg[k + 1].base : Infinity, mie = pagine.filter(p => p > sg.base && p <= fine);
            if (!mie.length)
                continue;
            avanza('Apro «' + sg.nome + '»…');
            const doc = await L.getDocument({ data: await datiPdf(sg.nome), isEvalSupported: false }).promise;
            try {
                for (const p of mie) {
                    if (p - sg.base > doc.numPages)
                        continue;
                    const tc = await (await doc.getPage(p - sg.base)).getTextContent();
                    testi.set(p, tc.items.map(x => x.str || '').join(' '));
                }
            }
            finally {
                if (typeof doc.destroy === 'function')
                    await doc.destroy();
            }
        }
        return testi;
    }
    const elencoProblemi = (problemi, etichetta, max = 40) => problemi.length
        ? h('ul.piccolo.centro-avvisi', { 'aria-label': etichetta }, ...problemi.slice(0, max).map(p => h('li', null, SEGNO[p.sev] + ' ' + p.id + ' — ' + p.msg)), problemi.length > max ? h('li.tenue', null, '…e altri ' + (problemi.length - max)) : null)
        : null;
    function apri() {
        let rec = aperte()[0] || null;
        let passo = rec ? Centro.passoDi(rec) : 1;
        const indicatore = h('p.centro-passo', { role: 'status', 'aria-live': 'polite' });
        const indietro = h('button.chip', { type: 'button', 'aria-label': 'Torna al passo precedente' }, '← Indietro');
        const zona = h('div.centro-zona');
        indietro.addEventListener('click', () => { if (passo > 1)
            vai(passo - 1); });
        let nota = null;
        let registroRip = [];
        function salva(r) { Stato.salva(r, true); rec = r; }
        function vai(n) {
            passo = Math.max(1, Math.min(7, n));
            indicatore.textContent = 'Passo ' + passo + ' di 7 · ' + PASSI[passo - 1] + (rec ? ' — ' + rec.nomeMateria + ' · step ' + rec.step : '');
            indietro.disabled = passo === 1;
            svuota(zona);
            const corpo = passo === 1 ? passoObiettivo() : passo === 2 ? passoPiano() : passo === 3 ? passoQuiz()
                : passo === 4 ? passoControllo() : passo === 5 ? passoCorreggi() : passo === 6 ? passoProva() : passoImporta();
            if (nota) {
                corpo.insertBefore(nota, corpo.firstChild);
                nota = null;
            }
            zona.appendChild(corpo);
            const primo = zona.querySelector('input, select, textarea, button');
            if (primo)
                primo.focus({ preventScroll: true });
        }
        function passoObiettivo() {
            const materie = Stato.tutti('materia').filter(m => !m.deleted).sort((a, b) => a.nome.localeCompare(b.nome));
            const cm = campoMateria(materie.map(m => [m.codice, m.nome]), rec ? rec.materia : '', materiaPerNome);
            const sel = cm.el.querySelector('select');
            if (sel)
                sel.setAttribute('aria-label', 'Materia');
            const step = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'es. 3.3', 'aria-label': 'Step (es. 3.3)', value: rec ? rec.step : '' });
            const titolo = h('input', { type: 'text', placeholder: 'Titolo dello step (facoltativo)', 'aria-label': 'Titolo dello step', value: (rec && rec.titolo) || '' });
            const data = h('input', { type: 'date', 'aria-label': 'Data prevista', value: (rec && rec.data) || '' });
            const intens = selettore([['leggera', 'Leggera (10–14 schede)'], ['standard', 'Standard (18–25 schede)'], ['intensa', 'Intensa (24–30 schede)']], (rec && rec.intensita) || 'standard');
            intens.setAttribute('aria-label', 'Intensità');
            const opzArch = Object.values(ARCHETIPI_DISCIPLINARI).map(a => [a.id, ICONE_ARCHETIPO[a.id] + ' ' + a.etichetta]);
            const codiceScelto = () => sel && sel.value !== '__nuova__' ? sel.value : '';
            const arch = selettore(opzArch, codiceScelto() ? Dominio.archetipoMateria(codiceScelto()) : 'scienze_sperimentali');
            arch.setAttribute('aria-label', 'Tipo di materia (archetipo)');
            if (sel)
                sel.addEventListener('change', () => { const c = codiceScelto(); if (c)
                    arch.value = Dominio.archetipoMateria(c); });
            const nomeMat = () => {
                const c = codiceScelto();
                if (c)
                    return (materie.find(m => m.codice === c) || { nome: '' }).nome;
                const t = cm.el.matches('input.campo-materia-nuova') ? cm.el : cm.el.querySelector('input.campo-materia-nuova');
                return t ? t.value.trim() : '';
            };
            const fonti = StrumentiQuiz.raccoltaFonti(nomeMat, rec ? rec.fonti : undefined);
            const altri = aperte().filter(r => !rec || r.id !== rec.id);
            const riprendi = altri.length ? h('div', null, h('p.piccolo.tenue', null, 'Altri step in corso:'), h('div.chips', null, ...altri.slice(0, 8).map(r => h('button.chip', { type: 'button', onclick: () => { rec = r; vai(Centro.passoDi(r)); } }, r.nomeMateria + ' · ' + r.step + ' (passo ' + Centro.passoDi(r) + ')')))) : null;
            const nuovo = rec ? h('button.chip', { type: 'button', onclick: () => { rec = null; vai(1); } }, '＋ Nuovo step') : null;
            function avanti() {
                const codice = cm.value;
                if (!codice) {
                    avviso('Scegli o scrivi la materia.');
                    return;
                }
                const st = step.value.trim();
                if (!RE_STEP.test(st)) {
                    avviso('Scrivi lo step come numero, es. 3.3.');
                    step.focus();
                    return;
                }
                const m = Stato.prendi('mat-' + codice), nome = m ? m.nome : codice;
                if (eArchetipo(arch.value) && (!m || m.archetipo !== arch.value))
                    Dominio.impostaArchetipo(codice, arch.value);
                const id = 'cre-' + Centro.prefisso({ materia: nome, step: st });
                const gia = Stato.prendi(id);
                const base = gia && !gia.deleted ? gia : { id, type: 'creazione', updatedAt: 0, materia: codice, nomeMateria: nome, step: st, schede: [], esiti: {} };
                const fv = fonti.valori();
                for (const l of fv.libri) {
                    const prec = Stato.prendi(Centro.idLibro(nome, l.nome)), nuovo = Centro.libroDa(nome, l, prec);
                    if (!prec || JSON.stringify(prec) !== JSON.stringify(nuovo))
                        Stato.salva(nuovo, true);
                }
                salva({ ...base, materia: codice, nomeMateria: nome, step: st, titolo: titolo.value.trim() || undefined, data: data.value || undefined,
                    intensita: intens.value, fonti: fv });
                vai(Math.max(2, Centro.passoDi(rec)));
            }
            return h('div.centro-passo-corpo', null, h('p.piccolo.tenue', null, 'Scegli la materia e lo step: l\'app prepara il prompt del piano, poi quello di ogni scheda.'), riprendi, nuovo, h('label.piccolo', null, 'Materia'), cm.el, h('div.chips', null, step, data), titolo, intens, h('label.piccolo', null, 'Tipo di materia'), arch, h('h3.centro-sotto', null, 'Fonti'), fonti.el, h('button.btn', { type: 'button', onclick: avanti }, 'Avanti →'));
        }
        function opzioniMP(r) {
            const fv = r.fonti || { libri: [], slide: [], guide: [], indici: [], quiz: [], vietati: [] };
            const dos = StrumentiQuiz.regoleDossier(r.nomeMateria, r.materia, r.step, [...fv.libri.flatMap(l => l.pdf), ...fv.slide, ...fv.guide, ...fv.indici, ...fv.quiz]);
            const arch = Dominio.archetipoMateria(r.materia);
            const opz = { materia: r.nomeMateria, codice: r.materia, step: r.step, titolo: r.titolo, data: r.data, intensita: r.intensita,
                archetipo: arch, etichettaArchetipo: ARCHETIPI_DISCIPLINARI[arch].etichetta, tono: Dominio.profilo().tonoSpiegazioneAI,
                libri: fv.libri, slide: fv.slide, guide: fv.guide, indici: fv.indici, quizEsistenti: fv.quiz, vietati: [...new Set([...fv.vietati, ...StrumentiQuiz.esclusi()])],
                idEsistenti: StrumentiQuiz.idGiaUsati(), dossier: dos.problemi.length ? [] : dos.regole };
            return { opz, dos };
        }
        function rispostaAI(etichetta, segnaposto, bottone, leggi) {
            const ta = h('textarea', { rows: 6, placeholder: segnaposto, 'aria-label': etichetta, spellcheck: 'false' });
            const daFile = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', 'aria-label': etichetta + ' da un file' });
            daFile.addEventListener('change', async () => { const f = daFile.files && daFile.files[0]; if (f) {
                ta.value = await f.text();
                leggi(ta.value);
            } daFile.value = ''; });
            return h('div.centro-passo-corpo', null, ta, h('div.chips', null, h('button.chip', { type: 'button', onclick: () => leggi(ta.value) }, bottone), daFile));
        }
        const notaDi = (righe) => h('div.centro-nota', { role: 'status' }, ...righe.map(t => h('p.piccolo', null, t)));
        const copiabile = (testo, etichetta, bottone) => {
            const out = h('textarea', { rows: 5, readonly: true, 'aria-label': etichetta, spellcheck: 'false' });
            out.value = testo;
            return [h('button.btn', { type: 'button', onclick: () => { StrumentiQuiz.copia(testo, out); } }, bottone), out];
        };
        function passoPiano() {
            const r = rec;
            const { opz, dos } = opzioniMP(r);
            const testoPrompt = MasterPrompt.costruisciPiano(opz);
            const out = h('textarea', { rows: 6, readonly: true, 'aria-label': 'Prompt del piano da copiare nell\'AI' });
            out.value = testoPrompt;
            const copia = h('button.btn', { type: 'button', onclick: () => { StrumentiQuiz.copia(testoPrompt, out); } }, '📋 Copia il prompt del piano');
            const incolla = h('textarea', { rows: 6, placeholder: 'Incolla qui la risposta dell\'AI (il piano)…', 'aria-label': 'Risposta dell\'AI con il piano' });
            const daFile = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', 'aria-label': 'Apri la risposta dell\'AI da un file' });
            daFile.addEventListener('change', async () => { const f = daFile.files && daFile.files[0]; if (f) {
                incolla.value = await f.text();
                leggi();
            } daFile.value = ''; });
            const esito = h('div', { role: 'status', 'aria-live': 'polite' });
            const anteprima = h('div.centro-anteprima');
            let piano = r.piano ? JSON.parse(JSON.stringify(r.piano)) : null;
            function leggi() {
                const l = Contratto.leggi(incolla.value);
                svuota(esito);
                if (l.formato !== 'piano-v1' && l.formato !== 'piano-righe') {
                    esito.appendChild(h('p.piccolo', null, '⛔ Non trovo un piano. ' + (l.errori[0] || 'Serve il blocco piano-v1 (o le righe @B / COPRE).')));
                    return;
                }
                piano = Centro.daPiano(Contratto.aPiano(l), r.step);
                disegna();
            }
            function disegna() {
                svuota(anteprima);
                if (!piano)
                    return;
                const p = piano;
                const rinumera = () => p.schede.forEach((x, i) => { x.n = i + 1; });
                if (p.avvisi.length)
                    anteprima.appendChild(h('ul.piccolo.centro-avvisi', { 'aria-label': 'Avvisi sul piano' }, ...p.avvisi.map(a => h('li', null, '⚠️ ' + a))));
                anteprima.appendChild(h('p.piccolo', null, h('b', null, p.schede.length + ' schede'), ' · ' + p.blocchi.length + ' blocchi: correggi microstep e categoria se serve.'));
                const lista = h('ol.centro-schede', { 'aria-label': 'Schede del piano' });
                p.schede.forEach((x, i) => {
                    const micro = h('input', { type: 'text', value: x.micro.join(', '), 'aria-label': 'Microstep della scheda S' + x.n, size: 8 });
                    micro.addEventListener('change', () => {
                        const v = micro.value.split(/[,;\s]+/).map(m => m.trim()).filter(Boolean), ok = v.filter(m => RE_STEP.test(m) && m.startsWith(p.step + '.'));
                        if (!ok.length) {
                            avviso('Microstep dello step ' + p.step + ', es. ' + p.step + '.1');
                            micro.value = x.micro.join(', ');
                            return;
                        }
                        x.micro = ok;
                        micro.value = ok.join(', ');
                    });
                    const cat = selettore([['prioritaria', 'Prioritaria'], ['raffinamento', 'Raffinamento']], x.categoria, function () { x.categoria = this.value; });
                    cat.setAttribute('aria-label', 'Categoria della scheda S' + x.n);
                    const togli = h('button.btn-ico', { type: 'button', 'aria-label': 'Togli la scheda S' + x.n, onclick: () => { p.schede.splice(i, 1); rinumera(); disegna(); } }, '✕');
                    lista.appendChild(h('li.riga-tra', null, h('span', null, h('b', null, 'S' + String(x.n).padStart(2, '0')), h('span.piccolo.tenue', null, ' ' + x.blocco)), h('span.chips', null, micro, cat, togli)));
                });
                anteprima.appendChild(lista);
                const aggiungi = h('button.chip', { type: 'button', onclick: () => {
                        const ult = p.schede[p.schede.length - 1];
                        p.schede.push({ n: p.schede.length + 1, micro: ult ? ult.micro.slice() : [p.step + '.1'], categoria: 'prioritaria', blocco: ult ? ult.blocco : (p.blocchi[0] || p.step) });
                        disegna();
                    } }, '＋ Aggiungi scheda');
                const approva = h('button.btn', { type: 'button', onclick: () => {
                        if (!p.schede.length) {
                            avviso('Il piano non ha schede.');
                            return;
                        }
                        salva({ ...r, piano: p, schede: p.schede.map(x => ({ n: x.n, stato: 'da-fare' })), esiti: {} });
                        avviso('Piano salvato: ' + p.schede.length + ' schede.');
                        vai(3);
                    } }, '✅ Approva il piano');
                anteprima.appendChild(h('div.chips', null, aggiungi, approva));
            }
            if (piano)
                disegna();
            return h('div.centro-passo-corpo', null, h('p.piccolo.tenue', null, '1) Copia il prompt e incollalo nella chat dell\'AI, allegando le fonti. 2) Incolla qui la risposta: l\'app numera le schede e ti mostra il piano.'), dos.problemi.length ? h('p.piccolo', null, '⛔ Il dossier conteneva dati identificativi: nel prompt non è stato messo.') : null, copia, out, h('h3.centro-sotto', null, 'Risposta dell\'AI'), incolla, h('div.chips', null, h('button.chip', { type: 'button', onclick: leggi }, '🔍 Leggi il piano'), daFile), esito, anteprima);
        }
        let scelta = 0, coppia = true;
        function passoQuiz() {
            const r = rec, sc = r.schede || [], piano = r.piano;
            if (!piano || !sc.length) {
                vai(2);
                return h('div');
            }
            const delPiano = (n) => piano.schede.find(x => x.n === n);
            const flusso = (n) => sc.find(x => x.n === n);
            const n0 = scelta && flusso(scelta) ? scelta : Centro.prossimaScheda(r);
            const tutte = !n0;
            const cur = n0 ? flusso(n0) : null, continua = !!cur && cur.stato === 'interrotta';
            const succ = cur && !continua && coppia ? flusso(n0 + 1) : undefined;
            const bersaglio = cur ? [n0, ...(succ && succ.stato === 'da-fare' ? [succ.n] : [])] : [];
            const lista = h('ol.centro-schede', { 'aria-label': 'Schede dello step' }, ...sc.map(x => {
                const p = delPiano(x.n), parte = x.stato !== 'da-fare' ? parteDi(r, x.n) : null, n = parte ? parte.quiz.length : 0;
                const etich = x.stato === 'interrotta' ? '✂️ Continua da qui' : x.stato === 'arrivata' ? '↻ Riscrivi' : '✍️ Scrivi';
                const aria = x.stato === 'interrotta' ? 'Continua la scheda ' + sig(x.n) + ' da dove si è interrotta' : (x.stato === 'arrivata' ? 'Riscrivi' : 'Scrivi') + ' la scheda ' + sig(x.n);
                const attiva = bersaglio.includes(x.n);
                return h('li.riga-tra' + (attiva ? '.centro-attiva' : ''), { 'aria-current': attiva ? 'true' : undefined }, h('span', null, simbolo(x) + ' ', h('b', null, sig(x.n)), h('span.piccolo.tenue', null, ' ' + (p ? p.micro[0] + ' · ' + p.categoria : '') + ' · ' + statoTesto(x) + (n ? ' (' + n + '/' + PER() + ')' : ''))), h('button.chip', { type: 'button', 'aria-label': aria, onclick: () => { scelta = x.n; vai(3); } }, etich));
            }));
            const arrivate = sc.filter(x => x.stato === 'arrivata').length;
            const testa = h('p.piccolo', null, h('b', null, arrivate + ' di ' + sc.length + ' schede arrivate'), ' · ✅ arrivata · ✂️ interrotta · ⏳ da fare');
            if (tutte)
                return h('div.centro-passo-corpo', null, testa, lista, h('p.piccolo', null, 'Tutte le schede sono arrivate: ora l\'app le controlla.'), h('button.btn', { type: 'button', onclick: () => vai(4) }, 'Avanti: Controllo →'));
            const casella = h('input', { type: 'checkbox', checked: coppia || undefined });
            casella.addEventListener('change', () => { coppia = casella.checked; vai(3); });
            let testoPrompt;
            if (continua) {
                const gia = (parteDi(r, n0) || { quiz: [] }).quiz, ult = gia[gia.length - 1];
                const ultimo = ult ? String(ult.domanda || ult.id || '').slice(0, 160) : undefined;
                testoPrompt = Contratto.continua({ formato: 'quiz-v3', dati: { step: pref(r), scheda: sig(n0), quiz: gia }, blocchi: [], riparazioni: [],
                    troncato: true, ultimoCompleto: ultimo, avvisi: [], errori: [] }, { perScheda: PER() });
            }
            else {
                const lst = bersaglio.map(n => delPiano(n)).filter((x) => !!x);
                const libri = (r.fonti ? r.fonti.libri : []).map(l => Stato.prendi(Centro.idLibro(r.nomeMateria, l.nome))).filter((x) => !!x);
                const pagine = Centro.paginePer(libri, lst.map(x => x.micro[0]).filter(Boolean));
                testoPrompt = MasterPrompt.costruisciSchede(opzioniMP(r).opz, lst.map(x => ({ n: x.n, sigla: sig(x.n), micro: x.micro, categoria: x.categoria, blocco: x.blocco })), pagine);
            }
            const titolo = (continua ? 'Continua ' : 'Prompt per ') + bersaglio.map(sig).join(' e ');
            return h('div.centro-passo-corpo', null, testa, lista, h('h3.centro-sotto', null, titolo), continua ? h('p.piccolo.tenue', null, 'Incolla questo prompt nella stessa chat: l\'AI scrive solo le domande che mancano.')
                : h('label.riga-tra.piccolo', null, '2 schede per messaggio (36 domande)', casella), ...copiabile(testoPrompt, 'Prompt da copiare nell\'AI per ' + bersaglio.map(sig).join(' e '), continua ? '📋 Copia «continua da qui»' : '📋 Copia il prompt'), h('h3.centro-sotto', null, 'Risposta dell\'AI'), rispostaAI('Risposta dell\'AI con le schede ' + bersaglio.map(sig).join(' e '), 'Incolla qui la risposta (anche la chat intera)…', '📥 Leggi la risposta', t => leggiSchede(r, t, bersaglio, continua)));
        }
        function leggiSchede(r, testo, bersaglio, continua) {
            const l = Contratto.leggi(testo), piano = r.piano;
            if (!FORMATI_QUIZ.includes(l.formato)) {
                avviso('⛔ Non trovo domande di quiz. ' + (l.errori[0] || (l.formato === 'ignoto' ? 'Serve il blocco JSON con «quiz».' : 'È un ' + l.formato + '.')), 6000);
                return;
            }
            const d = (l.dati && typeof l.dati === 'object' ? l.dati : {}), nuove = (Array.isArray(d.quiz) ? d.quiz : []);
            let dati = d;
            if (continua) {
                const gia = (parteDi(r, bersaglio[0]) || { quiz: [] }).quiz, testi = new Set(gia.map(q => String(q.domanda || '').trim()));
                const solo = nuove.filter(q => !testi.has(String(q.domanda || '').trim()));
                dati = { ...d, scheda: sig(bersaglio[0]), quiz: [...gia, ...solo.map(q => ({ ...q, scheda: q.scheda || sig(bersaglio[0]) }))] };
            }
            const qs = Contratto.aQuiz({ ...l, dati }, { step: pref(r), scheda: bersaglio[0] });
            const perScheda = new Map(), fuori = [];
            for (const q of qs) {
                const n = ImportaParti.numScheda(q.scheda) || bersaglio[0], p = piano.schede.find(x => x.n === n);
                if (!p) {
                    if (!fuori.includes(n))
                        fuori.push(n);
                    continue;
                }
                const lst = perScheda.get(n) || [];
                lst.push({ ...q, categoria: p.categoria, sottoStep: q.sottoStep || p.micro[0] });
                perScheda.set(n, lst);
            }
            if (!perScheda.size) {
                avviso('⛔ Nessuna domanda delle schede del piano in questa risposta.', 6000);
                return;
            }
            const righe = [], schede = (r.schede || []).map(x => ({ ...x }));
            for (const [n, lst] of [...perScheda].sort((a, b) => a[0] - b[0])) {
                const id = idParte(r, n), gia = Stato.prendi(id);
                Stato.salva({ id, type: 'parteq', updatedAt: gia ? gia.updatedAt : 0, cre: r.id, parte: Centro.nomeParte({ materia: r.nomeMateria, step: r.step }, n), scheda: n, quiz: lst }, true);
                const x = schede.find(s => s.n === n), ok = lst.length >= PER();
                x.stato = ok ? 'arrivata' : 'interrotta';
                x.parteId = id;
                righe.push((ok ? '✅ ' : '✂️ ') + sig(n) + ': ' + lst.length + ' domande' + (ok ? '' : ' su ' + PER() + ' — premi «Continua da qui»'));
            }
            if (fuori.length)
                righe.push('⚠️ Ignorate le domande di ' + fuori.map(sig).join(', ') + ': non sono nel piano.');
            for (const n of bersaglio)
                if (!perScheda.has(n))
                    righe.push('⏳ ' + sig(n) + ': nessuna domanda arrivata.');
            if (l.riparazioni.length)
                righe.push('🔧 ' + l.riparazioni.join(' · '));
            for (const a of l.avvisi.slice(0, 5))
                righe.push('⚠️ ' + a);
            salva({ ...r, schede, esiti: {} });
            scelta = 0;
            nota = notaDi(righe);
            registroRip = [];
            vai(3);
        }
        function passoControllo() {
            const r = rec, { qs: grezze, daScheda } = domande(r);
            const rip = Validatore.ripara(grezze);
            if (rip.log.length) {
                salvaDomande(r, rip.qs, daScheda);
                registroRip = [...registroRip, ...rip.log];
            }
            const qs = rip.qs, { v, problemi, corr } = controlla(qs, false, problemiCit(r, qs));
            const daCorreggere = corr.nDomande;
            salva({ ...r, esiti: { ...(r.esiti || {}), controllato: true, daCorreggere } });
            const err = problemi.filter(p => p.sev === 'err'), warn = problemi.filter(p => p.sev !== 'err');
            return h('div.centro-passo-corpo', null, h('p.piccolo', null, h('b', null, qs.length + ' domande'), ' · pronte da importare ' + v.pronte + ' · da correggere con patch ' + daCorreggere), registroRip.length ? h('details', null, h('summary.piccolo', null, '🔧 Riparazioni automatiche già fatte: ' + registroRip.length), h('ul.piccolo.tenue.centro-avvisi', { 'aria-label': 'Riparazioni automatiche' }, ...registroRip.map(t => h('li', null, t)))) : null, err.length ? h('h3.centro-sotto', null, '⛔ Da rifare') : null, elencoProblemi(err, 'Problemi da rifare'), corr.manuali.length ? h('p.piccolo', null, '✋ Da sistemare a mano (le patch non bastano): ' + corr.manuali.map(p => p.id + ' — ' + p.msg).join('; ')) : null, warn.length ? h('details', null, h('summary.piccolo', null, '⚠️ Avvisi di qualità: ' + warn.length), elencoProblemi(warn, 'Avvisi di qualità')) : null, !problemi.length ? h('p.piccolo', null, '✅ Nessun problema trovato.') : null, bloccoCitazioni(r, qs), h('div.chips', null, daCorreggere ? h('button.btn', { type: 'button', onclick: () => vai(5) }, 'Correggi ' + daCorreggere + (daCorreggere === 1 ? ' domanda →' : ' domande →'))
                : h('button.btn', { type: 'button', onclick: () => vai(6) }, 'Avanti: Prova →'), h('button.chip', { type: 'button', onclick: () => vai(4) }, '🔁 Ricontrolla'), h('button.chip', { type: 'button', onclick: () => vai(3) }, '📋 Torna alle schede')));
        }
        function bloccoCitazioni(r, qs) {
            const libri = libriVerificabili(r), l = libri[0], c = r.citazioni;
            if (!l)
                return h('div', null, h('h3.centro-sotto', null, '📖 Citazioni sul libro'), h('p.piccolo.tenue', null, 'Nessun libro con la mappa delle pagine: le citazioni non si possono verificare sul PDF (Obiettivo → Fonti → ⚙️ Pagine).'));
            const stato = h('span.piccolo', { role: 'status' }), btn = h('button.chip', { type: 'button', 'aria-label': 'Verifica le citazioni sul PDF di ' + l.nome }, '🔎 Verifica le citazioni sul PDF');
            const scegli = h('input', { type: 'file', accept: 'application/pdf', multiple: true, 'aria-label': 'Scegli dal dispositivo il PDF di ' + l.nome });
            scegli.addEventListener('change', () => { for (const f of Array.from(scegli.files || []))
                pdfScelti.set(f.name, f); stato.textContent = (scegli.files || []).length + ' PDF scelti: ora verifica.'; });
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                try {
                    const pagine = Centro.pagineDaLeggere(qs, l.mappa);
                    if (!pagine.length) {
                        stato.textContent = 'Nessuna citazione con numero di pagina da verificare.';
                        return;
                    }
                    const testi = await testiPagine(l, pagine, m => { stato.textContent = m; });
                    const { qs: dopo, daScheda } = domande(r), res = Centro.verificaCitazioni(dopo, l.mappa, p => testi.get(p) || '');
                    if (res.registro.length)
                        salvaDomande(r, res.qs, daScheda);
                    const fonteDi = (id) => String((res.qs.find(q => String(q.id) === id) || {}).fonte || '');
                    salva({ ...r, citazioni: { quando: ymd(new Date()), libro: l.nome, ok: res.ok, dubbi: res.dubbi, registro: res.registro, problemi: res.problemi.map(p => ({ ...p, fonte: fonteDi(p.id) })) } });
                    vai(4);
                }
                catch (e) {
                    console.warn('[centro] verifica citazioni', e);
                    stato.textContent = '⛔ ' + (e instanceof Error ? e.message : String(e)) + ': scegli il PDF dal dispositivo e riprova.';
                    btn.disabled = false;
                }
            });
            const fatto = c && c.libro === l.nome ? (() => {
                const [a, m, g] = c.quando.split('-'), np = problemiCit(r, qs).length;
                return [h('p.piccolo', null, 'Verificate il ' + g + '/' + m + '/' + a + ' su «' + l.nome + '»: ✅ ' + c.ok + ' giuste · ↔ ' + c.registro.length + ' corrette da sole · ⚠/✗ ' + np + ' nel prompt di correzione · ❓ ' + c.dubbi.length + ' non verificabili'),
                    c.dubbi.length ? h('p.piccolo.tenue', null, '❓ Pagina senza testo leggibile o citazione senza numero: ' + c.dubbi.join(', ') + '. Controllale tu sul libro.') : null,
                    c.registro.length ? h('details', null, h('summary.piccolo', null, '↔ Citazioni corrette sulla pagina accanto: ' + c.registro.length), h('ul.piccolo.tenue.centro-avvisi', { 'aria-label': 'Citazioni corrette' }, ...c.registro.map(t => h('li', null, t)))) : null];
            })() : [h('p.piccolo.tenue', null, 'Controlla che ogni «fonte» citi la pagina giusta di «' + l.nome + '»: l\'app legge la pagina (e quelle accanto) e cerca le parole chiave della domanda.' + (libri.length > 1 ? ' Si usa il primo libro con la mappa.' : ''))];
            return h('div', null, h('h3.centro-sotto', null, '📖 Citazioni sul libro'), ...fatto, h('div.chips', null, btn, h('label.piccolo', null, 'PDF dal dispositivo: ', scegli)), stato);
        }
        let conAvvisi = false;
        function passoCorreggi() {
            const r = rec, { qs, daScheda } = domande(r), { corr } = controlla(qs, conAvvisi, problemiCit(r, qs));
            const casella = h('input', { type: 'checkbox', checked: conAvvisi || undefined });
            casella.addEventListener('change', () => { conAvvisi = casella.checked; vai(5); });
            function applica(t) {
                const lp = DiagnosiQuiz.leggiPatch(t);
                if ('errore' in lp) {
                    avviso('⛔ ' + lp.errore, 6000);
                    return;
                }
                const ap = DiagnosiQuiz.applicaPatch(qs, lp.patch);
                salvaDomande(r, ap.qs, daScheda);
                const dopo = controlla(ap.qs, false, problemiCit(r, ap.qs)), resta = dopo.corr.nDomande;
                salva({ ...r, esiti: { ...(r.esiti || {}), controllato: true, daCorreggere: resta } });
                const righe = ['🩹 Patch applicate a ' + ap.n + (ap.n === 1 ? ' domanda' : ' domande') + '.',
                    ...(ap.mancanti.length ? ['⚠️ Id non trovati: ' + ap.mancanti.join(', ')] : []),
                    resta ? '⛔ Restano ' + resta + ' domande da correggere: ecco il nuovo prompt.' : '✅ Ricontrollo superato: nessuna domanda da correggere.'];
                nota = notaDi(righe);
                vai(resta ? 5 : 6);
            }
            return h('div.centro-passo-corpo', null, h('p.piccolo.tenue', null, '1) Copia il prompt di correzione nella stessa chat: l\'AI rimanda solo i campi da rifare. 2) Incolla le patch: l\'app le applica e ricontrolla.'), h('label.riga-tra.piccolo', null, 'Chiedi di correggere anche gli avvisi', casella), h('p.piccolo', null, h('b', null, corr.nDomande + (corr.nDomande === 1 ? ' domanda' : ' domande')), ' nel prompt'), ...copiabile(corr.testo, 'Prompt di correzione da copiare nell\'AI', '📋 Copia il prompt di correzione'), corr.manuali.length ? h('p.piccolo', null, '✋ Da sistemare a mano: ' + corr.manuali.map(p => p.id + ' — ' + p.msg).join('; ')) : null, corr.globali.length ? h('p.piccolo', null, '⚠️ Squilibri d\'insieme (non si correggono con patch): ' + corr.globali.slice(0, 5).map(p => p.id + ' — ' + p.msg).join('; ')) : null, h('h3.centro-sotto', null, 'Patch dell\'AI'), rispostaAI('Patch JSON dell\'AI', 'Incolla qui le patch ([{"id":"…","campo":"…"}])…', '🩹 Applica le patch', applica), h('div.chips', null, h('button.chip', { type: 'button', onclick: () => vai(4) }, '🔁 Ricontrolla'), h('button.chip', { type: 'button', 'aria-label': 'Prosegui senza correggere: le domande bloccate non si importano',
                onclick: () => { salva({ ...r, esiti: { ...(r.esiti || {}), controllato: true, daCorreggere: 0 } }); vai(6); } }, '⏭ Prosegui senza correggere')));
        }
        const provate = new Set();
        function domandeProva(r, n) {
            const p = parteDi(r, n), qs = p ? p.quiz : [], sk = 'prova-' + pref(r) + '-s' + n;
            const lista = qs.map(q => ImportaDrive.domanda(q, sk, pref(r))).filter((d) => !!d);
            return { lista, escluse: qs.length - lista.length };
        }
        function prova(r, n) {
            const { lista } = domandeProva(r, n), p = r.piano.schede.find(x => x.n === n);
            if (!lista.length) {
                avviso('Nessuna domanda valida da provare in ' + sig(n) + '.');
                return;
            }
            const pk = { tipo: 'step', id: 'prova', step: 0, titolo: '', aggiornato: '', risorse: { libri: {}, quiz: {} }, materie: [] };
            const s = { id: 'prova-' + pref(r) + '-s' + n, k: n, n: (r.schede || []).length, titolo: 'Prova ' + sig(n), tipo: 'P', problemi: false, pagine: '', quizFile: '' };
            provate.add(n);
            fg.chiudi();
            QuizApp.apri(pk, r.materia, p ? p.micro[0] : r.step, s, () => lista, { occh: '🧪 Prova · ' + r.nomeMateria + ' ' + r.step + ' · ' + sig(n) + ' · senza statistiche',
                titolo: 'Prova della scheda ' + sig(n), prova: true, chiudi: () => { apriFoglio(); vai(6); } });
        }
        function passoProva() {
            const r = rec, sc = r.schede || [], piano = r.piano;
            const lista = h('ol.centro-schede', { 'aria-label': 'Schede da provare' }, ...sc.map(x => {
                const p = piano.schede.find(y => y.n === x.n), { lista: l, escluse } = domandeProva(r, x.n);
                return h('li.riga-tra', null, h('span', null, (provate.has(x.n) ? '🧪 ' : simbolo(x) + ' '), h('b', null, sig(x.n)), h('span.piccolo.tenue', null, ' ' + (p ? p.micro[0] : '') + ' · ' + l.length + ' domande' + (escluse ? ' (' + escluse + ' bloccate escluse)' : '') + (provate.has(x.n) ? ' · provata' : ''))), h('button.chip', { type: 'button', 'aria-label': 'Prova la scheda ' + sig(x.n) + ' nel quiz in app', disabled: l.length ? undefined : true, onclick: () => prova(r, x.n) }, '▶ Prova la scheda'));
            }));
            const avanti = () => { salva({ ...r, esiti: { ...(r.esiti || {}), provato: true } }); vai(7); };
            return h('div.centro-passo-corpo', null, h('p.piccolo.tenue', null, 'Fai il quiz di una scheda come lo vedrà lo studente. È una prova: non salva statistiche, ripassi né flashcard.'), lista, h('div.chips', null, h('button.btn', { type: 'button', onclick: avanti }, provate.size ? 'Avanti: Importa →' : 'Salta la prova: Importa →'), h('button.chip', { type: 'button', onclick: () => vai(4) }, '🔁 Torna al controllo')));
        }
        const CARTELLA = '🏗️ Centro di creazione';
        function letture(r) {
            const step = pref(r), quando = (n) => new Date(n || 0).toISOString();
            const parti = (r.schede || []).filter(x => x.stato !== 'da-fare').map(x => parteDi(r, x.n)).filter((p) => !!p)
                .map(p => ({ id: p.id, name: p.parte + '.json', cartella: CARTELLA, modificato: quando(p.updatedAt), tipo: 'parte', step, json: { parte: p.parte, quiz: p.quiz } }));
            const ch = Centro.chiusura(r.piano, { materia: r.nomeMateria, codice: r.materia, step: r.step, titolo: r.titolo, data: r.data, archetipo: Dominio.archetipoMateria(r.materia), perScheda: PER() });
            return [...parti, { id: 'chi-' + r.id, name: step + '-chiusura.json', cartella: CARTELLA, modificato: '', tipo: 'chiusura', step, json: ch }];
        }
        function passoImporta() {
            const r = rec, g = ImportaParti.raggruppa(letture(r)).find(x => x.tipo === 'parti');
            const esito = h('div.centro-nota', { role: 'status', hidden: true }), zona = h('div');
            if (!g)
                return h('div.centro-passo-corpo', null, h('p.piccolo', null, 'Nessuna scheda arrivata da importare.'), h('button.chip', { type: 'button', onclick: () => vai(3) }, '← Torna ai quiz'));
            const [cart] = Centro.albero([g]), st = cart.steps[0];
            const spunte = [];
            const conta = h('p.piccolo', { 'aria-live': 'polite' }), tutto = h('input', { type: 'checkbox', 'aria-label': 'Tutto lo step ' + st.sotto });
            const vaiBtn = h('button.btn', { type: 'button' }, 'Avanti: dove lo metto? →');
            const scelti = () => spunte.filter(x => x.el.checked);
            function aggiorna() {
                const sel = scelti(), sch = sel.reduce((a, x) => a + x.schede, 0), dom = sel.reduce((a, x) => a + x.domande, 0);
                tutto.checked = sel.length === spunte.length;
                tutto.indeterminate = sel.length > 0 && sel.length < spunte.length;
                conta.textContent = sel.length ? 'Selezionati: ' + sel.length + ' microstep · ' + sch + (sch === 1 ? ' scheda' : ' schede') + ' · ' + dom + ' domande' : 'Seleziona almeno un microstep.';
                vaiBtn.disabled = !sel.length;
                svuota(zona);
            }
            const voci = st.microstep.map(m => {
                const el = h('input', { type: 'checkbox', 'aria-label': 'Microstep ' + m.n });
                el.checked = true;
                el.addEventListener('change', aggiorna);
                spunte.push({ n: m.n, el, schede: m.schede.length, domande: m.domande });
                return h('li', null, h('label', null, el, ' ' + m.n + ' ', h('span.piccolo.tenue', null, m.schede.map(sig).join(', ') + ' · ' + m.domande + ' domande')));
            });
            tutto.checked = true;
            tutto.addEventListener('change', () => { for (const x of spunte)
                x.el.checked = tutto.checked; aggiorna(); });
            vaiBtn.addEventListener('click', () => {
                const u = ImportaParti.unisci(g), pk = Centro.filtra(u.pacchetto, scelti().map(x => x.n));
                const rapporto = ImportaParti.valida(pk, { bloccanti: u.bloccanti, duplicati: u.duplicati, completo: true });
                let t;
                try {
                    t = ImportaDrive.traduci(pk);
                }
                catch (e) {
                    esito.hidden = false;
                    esito.textContent = '✗ ' + e.message;
                    return;
                }
                const prima = Stato.prendi('inn-' + t.k);
                svuota(zona);
                zona.appendChild(ImportaDrive.pannelloScelta(t.k, t.nome + ' ' + t.sotto + ' · ' + t.titolo, ImportaDrive.proponi(t), prima ? { corso: prima.corso, piano: prima.piano, data: prima.data } : null, prima ? 'Reimporta' : 'Inserisci', sc => {
                    const inn = ImportaDrive.salva(t, sc, CARTELLA, { accumula: true, rapporto });
                    salva({ ...r, esiti: { ...(r.esiti || {}), importato: true } });
                    svuota(zona);
                    esito.hidden = false;
                    svuota(esito);
                    const ns = t.sub.microstep.reduce((a, m) => a + m.schede.length, 0);
                    esito.append(h('p', null, '✓ ' + t.domande + ' domande · ' + ns + (ns === 1 ? ' scheda' : ' schede') + ' nei tuoi programmi (' + inn.k + ').'), h('p.piccolo.tenue', null, prima ? 'Reimport: aggiornate le schede già presenti, nessun doppione.' : 'Le trovi in Oggi e in «Studia ora» nel giorno scelto.'), h('button.chip', { type: 'button', onclick: () => { fg.chiudi(); vaiScheda('oggi'); } }, '📅 Vai a Oggi'));
                }));
                const b = zona.querySelector('select, button');
                if (b)
                    b.focus({ preventScroll: true });
            });
            aggiorna();
            return h('div.centro-passo-corpo', null, h('p.piccolo.tenue', null, 'Scegli cosa importare. Il file di chiusura (sotto-schede, ripassi +1/+3/+7 g, durata) lo scrive l\'app dal piano approvato.'), h('ul.centro-albero', { 'aria-label': 'Cosa importare' }, h('li', null, h('span.piccolo.tenue', null, '📁 ' + cart.cartella), h('ul', null, h('li', null, h('label.forte', null, tutto, ' ' + r.nomeMateria + ' ' + st.sotto + ' ', h('span.piccolo.tenue', null, st.schede + ' schede · ' + st.domande + ' domande')), h('ul', null, ...voci))))), st.errore ? h('p.piccolo', null, '⚠️ ' + st.errore) : null, conta, h('div.chips', null, vaiBtn, h('button.chip', { type: 'button', onclick: () => vai(6) }, '← Torna alla prova')), zona, esito);
        }
        function impostazioni() {
            const ta = h('textarea', { rows: 4, 'aria-label': 'Fonti escluse, una per riga' });
            const stato = h('p.piccolo.tenue', { role: 'status' });
            const carica = () => { ta.value = StrumentiQuiz.esclusi().join('\n'); };
            carica();
            return h('details.centro-impostazioni', null, h('summary.piccolo', null, '⚙️ Impostazioni del Centro'), h('p.piccolo.tenue', null, 'Fonti escluse (eserciziari commerciali): l\'AI non deve usarle e i file con questi nomi non entrano tra le fonti. Una per riga.'), ta, h('div.chips', null, h('button.chip', { type: 'button', onclick: () => { StrumentiQuiz.salvaEsclusi(ta.value.split('\n')); carica(); stato.textContent = '✓ Lista salvata (' + StrumentiQuiz.esclusi().length + ').'; } }, '💾 Salva lista'), h('button.chip', { type: 'button', onclick: () => { StrumentiQuiz.salvaEsclusi(null); carica(); stato.textContent = 'Ripristinata la lista predefinita.'; } }, '↺ Predefiniti')), stato);
        }
        const corpo = h('div.centro', null, h('div.riga-tra', null, indicatore, indietro), zona, impostazioni());
        let fg = { chiudi: () => undefined };
        const apriFoglio = () => { fg = foglio({ titolo: '🏗️ Centro di creazione', corpo }); };
        apriFoglio();
        vai(passo);
    }
    return { apri };
})();

const CHIAVI_QUIZ = ['id', 'stepId', 'sottoStep', 'scheda', 'categoria', 'livelloCognitivo', 'livello', 'tipoItem', 'coppiaGemellaId', 'erroreTipico',
    'domanda', 'opzioni', 'esatta', 'spiegazione', 'spiegazioneDistrattori', 'distractorTypes', 'fonte', 'sourceRef'];
const Contratto = (() => {
    const LETTERE = 'ABCD';
    const ogg = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const str = (v) => typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
    const pad2 = (n) => String(n).padStart(2, '0');
    const QUIZ = ['quiz-v3', 'quiz-v2', 'quiz-058', 'parte'];
    function riparaVirgole(s) {
        let out = '', dentro = false, esc = false;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (dentro) {
                out += c;
                if (esc)
                    esc = false;
                else if (c === '\\')
                    esc = true;
                else if (c === '"')
                    dentro = false;
                continue;
            }
            if (c === '"') {
                dentro = true;
                out += c;
                continue;
            }
            if (c === ',') {
                let j = i + 1;
                while (j < s.length && /\s/.test(s[j]))
                    j++;
                if (s[j] === '}' || s[j] === ']')
                    continue;
            }
            out += c;
        }
        return out;
    }
    function bilanciato(s) {
        const i = s.search(/[{[]/);
        if (i < 0)
            return null;
        let d = 0, dentro = false, esc = false;
        for (let j = i; j < s.length; j++) {
            const c = s[j];
            if (dentro) {
                if (esc)
                    esc = false;
                else if (c === '\\')
                    esc = true;
                else if (c === '"')
                    dentro = false;
                continue;
            }
            if (c === '"')
                dentro = true;
            else if (c === '{' || c === '[')
                d++;
            else if (c === '}' || c === ']') {
                d--;
                if (!d)
                    return s.slice(i, j + 1);
            }
        }
        return null;
    }
    const parse = (s) => { try {
        return { ok: true, d: JSON.parse(JsonAI.riparaLatex(s)) };
    }
    catch (_) {
        return { ok: false };
    } };
    function blocchiDi(t) {
        const re = /```[a-zA-Z]*[ \t]*\n?([\s\S]*?)```/g, out = [];
        let m, fine = 0, fuori = '';
        while ((m = re.exec(t))) {
            fuori += t.slice(fine, m.index);
            if (m[1].trim())
                out.push(m[1].trim());
            fine = re.lastIndex;
        }
        const resto = t.slice(fine), aperto = resto.search(/```/);
        if (aperto >= 0) {
            fuori += resto.slice(0, aperto);
            const r = resto.slice(aperto).replace(/^```[a-zA-Z]*/, '').trim();
            if (r)
                out.push(r);
        }
        else
            fuori += resto;
        return out.length ? { blocchi: out, fuori: !!fuori.trim() } : { blocchi: [t.trim()], fuori: false };
    }
    function formatoDi(d, avvisi) {
        if (Array.isArray(d)) {
            const qs = d.filter(ogg);
            if (qs.some(q => 'opzioni' in q || 'domanda' in q))
                return { formato: qs.some(q => 'esatta' in q) ? 'quiz-v2' : 'quiz-v3', dati: { quiz: qs } };
            return { formato: 'ignoto', dati: d };
        }
        if (!ogg(d))
            return { formato: 'ignoto', dati: d };
        const f = str(d.formato);
        if (f) {
            const q = /^quiz-v(\d+)/i.exec(f), p = /^piano-v(\d+)/i.exec(f);
            if (q && Array.isArray(d.quiz)) {
                const n = Number(q[1]);
                if (n > 3)
                    avvisi.push('Formato «' + f + '» più nuovo dell\'app: lo leggo come quiz-v3 (aggiorna l\'app se manca qualcosa)');
                return { formato: n >= 3 ? 'quiz-v3' : 'quiz-v2', dati: d };
            }
            if (p) {
                if (Number(p[1]) > 1)
                    avvisi.push('Formato «' + f + '» più nuovo dell\'app: lo leggo come piano-v1');
                return { formato: 'piano-v1', dati: d };
            }
            avvisi.push('Formato «' + f + '» sconosciuto: lo riconosco dal contenuto');
        }
        if (Array.isArray(d.quiz)) {
            if (str(d.parte))
                return { formato: 'parte', dati: d };
            if (ogg(d.meta))
                return { formato: 'quiz-058', dati: d };
            return { formato: d.quiz.some(q => ogg(q) && 'esatta' in q) ? 'quiz-v2' : 'quiz-v3', dati: d };
        }
        if (ogg(d.meta) && ogg(d.programmaCalendario))
            return { formato: 'chiusura', dati: d };
        if (Array.isArray(d.blocchi))
            return { formato: 'piano-v1', dati: d };
        return { formato: 'ignoto', dati: d };
    }
    function leggiBlocco(b, rip, avvisi) {
        let s = b.trim(), r = parse(s);
        if (!r.ok) {
            const e = bilanciato(s);
            if (e && e !== s) {
                s = e;
                r = parse(s);
                if (r.ok)
                    rip.push('testo intorno al JSON ignorato');
            }
        }
        if (!r.ok && /[“”]/.test(s)) {
            s = s.replace(/[“”]/g, '"');
            const e = bilanciato(s);
            if (e)
                s = e;
            r = parse(s);
            rip.push('virgolette tipografiche sostituite');
        }
        if (!r.ok) {
            const v = riparaVirgole(s);
            if (v !== s) {
                s = v;
                r = parse(s);
                rip.push('virgole finali rimosse');
            }
        }
        if (r.ok)
            return { ...formatoDi(r.d, avvisi), troncato: false };
        const qs = JsonAI.recuperaArrayParziale(s, s.indexOf('"quiz"') >= 0 ? '"quiz"' : '').filter(ogg);
        if (!qs.length)
            return null;
        const testata = {};
        for (const k of ['formato', 'step', 'scheda', 'sottoStep', 'parte']) {
            const m = new RegExp('"' + k + '"\\s*:\\s*"([^"]*)"').exec(s.slice(0, s.indexOf('"quiz"') >= 0 ? s.indexOf('"quiz"') : 0));
            if (m)
                testata[k] = m[1];
        }
        const ultimo = qs[qs.length - 1];
        rip.push('risposta interrotta: tenute ' + qs.length + ' domande complete');
        const f = formatoDi({ ...testata, quiz: qs }, avvisi);
        return { ...f, troncato: true, ultimo: str(ultimo.domanda) || str(ultimo.id) };
    }
    function leggi(testo) {
        const l = { formato: 'ignoto', dati: null, blocchi: [], riparazioni: [], troncato: false, avvisi: [], errori: [] };
        const t = JsonAI.pulisci(testo).trim();
        if (!t) {
            l.errori.push('Il testo è vuoto.');
            return l;
        }
        if (!/[{[]/.test(t) && /^\s*@B\s/m.test(t)) {
            l.formato = 'piano-righe';
            l.dati = t;
            return l;
        }
        const { blocchi, fuori } = blocchiDi(t);
        if (blocchi.length > 1 || fuori)
            l.riparazioni.push(fuori ? 'testo fuori dai blocchi di codice ignorato' : 'blocchi di codice uniti');
        else if (/```/.test(t))
            l.riparazioni.push('blocco markdown rimosso');
        blocchi.forEach((b, k) => {
            const r = leggiBlocco(b, l.riparazioni, l.avvisi);
            if (!r) {
                l.errori.push('Blocco ' + (k + 1) + ': JSON non leggibile.');
                return;
            }
            l.blocchi.push({ formato: r.formato, dati: r.dati, troncato: r.troncato });
            if (r.troncato) {
                l.troncato = true;
                l.ultimoCompleto = r.ultimo;
            }
        });
        l.riparazioni = [...new Set(l.riparazioni)];
        const quiz = l.blocchi.filter(b => QUIZ.includes(b.formato));
        if (quiz.length) {
            const primo = quiz[0], testa = ogg(primo.dati) ? primo.dati : {};
            l.formato = primo.formato;
            l.dati = quiz.length === 1 ? primo.dati : { ...testa, quiz: quiz.flatMap(b => ogg(b.dati) && Array.isArray(b.dati.quiz) ? b.dati.quiz : []) };
        }
        else if (l.blocchi.length) {
            l.formato = l.blocchi[0].formato;
            l.dati = l.blocchi[0].dati;
        }
        return l;
    }
    const livelloN = (v) => { const n = Number(str(v).replace(/^L/i, '')); return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 0; };
    const numScheda = (v) => ImportaParti.numScheda(v);
    const haEsatta = (q) => q.esatta !== undefined && q.esatta !== null && q.esatta !== '';
    function seme(step, scheda) {
        let h = 2166136261;
        for (const c of step + '#' + scheda) {
            h ^= c.charCodeAt(0);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
    function tabellaPosizioni(n, sem) {
        let x = (sem >>> 0) || 1;
        const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
        const out = [];
        while (out.length < n) {
            const p = [0, 1, 2, 3];
            for (let i = 3; i > 0; i--) {
                const j = Math.floor(rnd() * (i + 1));
                [p[i], p[j]] = [p[j], p[i]];
            }
            out.push(...p);
        }
        return out.slice(0, n);
    }
    function assegna(qs, ctx = {}) {
        const step = str(ctx.step).toLowerCase(), n0 = numScheda(ctx.scheda) || 1, conta = new Map();
        return qs.map(q0 => {
            const q = { ...q0 }, n = numScheda(q.scheda) || n0, k = (conta.get(n) || 0) + 1, base = (step ? step + '-' : '') + 'S' + pad2(n);
            conta.set(n, k);
            if (!str(q.id))
                q.id = base + '-' + pad2(k);
            if (!/-S\d+$/i.test(str(q.scheda)))
                q.scheda = base;
            if (step && !str(q.stepId))
                q.stepId = step;
            const sotto = str(q.sottoStep) || str(ctx.sottoStep);
            if (sotto)
                q.sottoStep = sotto;
            q.categoria = str(q.categoria) || str(ctx.categoria) || 'prioritaria';
            const lv = livelloN(q.livelloCognitivo) || livelloN(q.livello);
            if (lv) {
                q.livelloCognitivo = lv;
                q.livello = 'L' + lv;
            }
            const g = str(q.gemella);
            if (g && !str(q.coppiaGemellaId))
                q.coppiaGemellaId = (step ? step + '-' : '') + g.toLowerCase();
            if (!q.sourceRef && str(q.fonte))
                q.sourceRef = str(q.fonte);
            return q;
        });
    }
    const LETTERA_LIBERA = /(^|[^A-Za-z0-9])[A-D]\)/;
    function riscriviLettere(sp, mappa, pos) {
        const re = new RegExp(RE_SEZ_SPIEGAZIONE.source, 'g'), tagli = [];
        let m;
        while ((m = re.exec(sp)))
            tagli.push({ i: m.index, fine: re.lastIndex, et: m[1] });
        let out = sp.slice(0, tagli.length ? tagli[0].i : sp.length), libere = LETTERA_LIBERA.test(out);
        tagli.forEach((c, k) => {
            let corpo = sp.slice(c.fine, k + 1 < tagli.length ? tagli[k + 1].i : sp.length);
            if (/^RISPOSTA/.test(c.et))
                corpo = corpo.replace(/^(\s*)([A-D])\)/, (_, a) => a + LETTERE[pos] + ')');
            else if (/^PERCH/.test(c.et))
                corpo = corpo.replace(/(^|[^A-Za-z0-9])([A-D])\)/g, (_, a, l) => a + LETTERE[mappa[LETTERE.indexOf(l)]] + ')');
            else if (LETTERA_LIBERA.test(corpo))
                libere = true;
            out += sp.slice(c.i, c.fine) + corpo;
        });
        return { testo: out, libere };
    }
    function mescola(q, pos, avvisi = []) {
        const o = Array.isArray(q.opzioni) ? q.opzioni.slice() : [];
        if (o.length < 2 || !(pos >= 0 && pos < o.length))
            return { ...q, esatta: 0 };
        const resto = o.slice(1), mappa = o.map((_, i) => i === 0 ? pos : i - 1 < pos ? i - 1 : i);
        const r = { ...q, opzioni: [...resto.slice(0, pos), o[0], ...resto.slice(pos)], esatta: pos };
        if (typeof q.spiegazione === 'string') {
            const w = riscriviLettere(q.spiegazione, mappa, pos);
            r.spiegazione = w.testo;
            if (w.libere)
                avvisi.push('«' + str(q.domanda).slice(0, 50) + '…»: c\'è una lettera d\'opzione fuori da «RISPOSTA ESATTA» e «PERCHÉ GLI ALTRI NO» — non riscritta, controllala');
        }
        return r;
    }
    function aQuiz(l, ctx = {}) {
        if (!QUIZ.includes(l.formato))
            return [];
        const d = ogg(l.dati) ? l.dati : {}, qs = (Array.isArray(d.quiz) ? d.quiz : []).filter(ogg).map(q => ({ ...q }));
        if (l.formato !== 'quiz-v3')
            return qs;
        const step = (str(ctx.step) || str(d.step)).toLowerCase(), sch = numScheda(d.scheda) || numScheda(ctx.scheda) || 1;
        const fatte = assegna(qs, { ...ctx, step, scheda: sch, sottoStep: str(d.sottoStep) || str(ctx.sottoStep) });
        const perScheda = new Map();
        fatte.forEach((q, i) => { if (haEsatta(q))
            return; const n = numScheda(q.scheda) || sch, v = perScheda.get(n) || []; v.push(i); perScheda.set(n, v); });
        for (const [n, idx] of perScheda) {
            const tab = tabellaPosizioni(idx.length, ctx.seme ?? seme(step, n));
            idx.forEach((i, k) => { fatte[i] = mescola(fatte[i], tab[k], l.avvisi); });
        }
        return fatte;
    }
    function aPiano(l) {
        const avvisi = [], blocchi = [];
        const schedeDi = (xs) => xs.map(numScheda).filter(n => n > 0);
        const lista = (v) => (Array.isArray(v) ? v : []);
        if (l.formato === 'piano-righe') {
            let cur = null, ignorate = 0;
            for (const riga of String(l.dati).split('\n').map(r => r.trim()).filter(Boolean)) {
                let m = /^@B\s+(\S+)\s*(?:\|\s*(.*))?$/.exec(riga);
                if (m) {
                    cur = { codice: m[1], titolo: str(m[2]) || m[1], copre: [] };
                    blocchi.push(cur);
                    continue;
                }
                m = /^COPRE\s+(.*?)\s*\|\s*(.*)$/i.exec(riga);
                if (!m) {
                    ignorate++;
                    continue;
                }
                if (!cur) {
                    avvisi.push('«' + riga + '» viene prima di ogni @B: ignorata');
                    continue;
                }
                const tok = m[1].split(/[\s,]+/).filter(Boolean), schede = schedeDi(tok), micro = m[2].split(/[\s,]+/).filter(Boolean);
                if (schede.length !== tok.length)
                    avvisi.push('Blocco ' + cur.codice + ': schede illeggibili in «' + riga + '»');
                if (schede.length)
                    cur.copre.push({ schede, micro });
            }
            if (ignorate)
                avvisi.push(ignorate + (ignorate === 1 ? ' riga ignorata' : ' righe ignorate') + ' (né @B né COPRE)');
        }
        else if (l.formato === 'piano-v1') {
            for (const b of lista(ogg(l.dati) ? l.dati.blocchi : null).filter(ogg)) {
                const codice = str(b.codice);
                if (!codice) {
                    avvisi.push('Blocco senza codice: ignorato');
                    continue;
                }
                const copre = lista(b.copre).filter(ogg).map(c => ({ schede: schedeDi(lista(c.schede)), micro: lista(c.micro).map(str).filter(Boolean) })).filter(c => c.schede.length);
                blocchi.push({ codice, titolo: str(b.titolo) || codice, copre });
            }
        }
        else
            avvisi.push('Non è un piano (formato ' + l.formato + ')');
        return { blocchi, avvisi };
    }
    function continua(l, o = {}) {
        const per = o.perScheda || 18, d = ogg(l.dati) ? l.dati : {}, n = Array.isArray(d.quiz) ? d.quiz.length : 0;
        const scheda = str(d.scheda) || 'S01', da = n + 1, mancano = Math.max(0, per - n);
        const testa = JSON.stringify({ formato: 'quiz-v3', ...(str(d.step) ? { step: str(d.step) } : {}), scheda, ...(str(d.sottoStep) ? { sottoStep: str(d.sottoStep) } : {}) }).slice(0, -1);
        return ['CONTINUA DA QUI — la risposta precedente si è interrotta a metà.',
            'Scheda ' + scheda + ': sono arrivate complete ' + n + ' domande. Scrivi le ' + mancano + ' domande che mancano (dalla ' + da + ' alla ' + per + ') e solo quelle.',
            l.ultimoCompleto ? 'L\'ultima domanda arrivata completa è: «' + l.ultimoCompleto + '». Riprendi subito dopo, senza riscrivere quelle già arrivate.' : 'Non riscrivere le domande già arrivate.',
            'Segui la stessa sequenza di livelli e le stesse regole del prompt iniziale, dalla posizione ' + da + '.',
            'Stesso formato, un solo blocco di codice JSON: ' + testa + ',"quiz":[ … ]}'].join('\n');
    }
    function pacchetti(testo) {
        const l = leggi(testo), out = [];
        for (const b of l.blocchi) {
            const d = ogg(b.dati) ? b.dati : {};
            if (b.formato === 'chiusura') {
                out.push(d);
                continue;
            }
            if (b.formato === 'piano-v1') {
                l.avvisi.push('C\'è un piano: si importa da «✨ Crea Piano Intelligente», non da qui');
                continue;
            }
            if (!QUIZ.includes(b.formato))
                continue;
            const meta = ogg(d.meta) ? d.meta : {}, np = ImportaParti.nomeParte(str(d.parte));
            const step = (str(d.step) || str(meta.stepId) || (np ? np.step : '')).toLowerCase();
            const quiz = aQuiz({ ...l, formato: b.formato, dati: d }, { step });
            const m2 = { ...meta };
            if (step && !str(m2.stepId))
                m2.stepId = step;
            if (step && !str(m2.materia))
                m2.materia = step.replace(/-[\d.]+$/, '');
            if (str(d.sottoStep) && !str(m2.sottoStep))
                m2.sottoStep = str(d.sottoStep);
            out.push({ ...d, meta: m2, quiz });
        }
        return { lettura: l, pacchetti: out };
    }
    return { LETTERE, riparaVirgole, bilanciato, blocchiDi, formatoDi, leggi, continua, seme, tabellaPosizioni, assegna, mescola, aQuiz, aPiano, pacchetti };
})();

const DiagnosiQuiz = (() => {
    const CHIAVI = CHIAVI_QUIZ;
    const PER_SCHEDA = 18;
    const LV_TARGET = [25, 35, 25, 15];
    const RANGE_SCHEDA = [[4, 5], [6, 7], [4, 5], [2, 3]];
    const LETTERE = 'ABCD';
    const oggetto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const testo = (v) => typeof v === 'string' ? v : '';
    function riparaVirgole(s) {
        let out = '', str = false, esc = false;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (str) {
                out += c;
                if (esc)
                    esc = false;
                else if (c === '\\')
                    esc = true;
                else if (c === '"')
                    str = false;
                continue;
            }
            if (c === '"') {
                str = true;
                out += c;
                continue;
            }
            if (c === ',') {
                let j = i + 1;
                while (j < s.length && /\s/.test(s[j]))
                    j++;
                if (s[j] === '}' || s[j] === ']')
                    continue;
            }
            out += c;
        }
        return out;
    }
    function blocchiDi(t) {
        const re = /```[a-zA-Z]*\s*\n?([\s\S]*?)```/g, out = [];
        let m;
        while ((m = re.exec(t)))
            if (m[1].trim())
                out.push(m[1].trim());
        return out.length ? out : [t.trim()];
    }
    function leggi(t) {
        const r = { quiz: [], parti: [], chiusura: null, errori: [], riparato: false, blocchi: 0 };
        const pulito = String(t || '').replace(/^﻿/, '').trim();
        if (!pulito) {
            r.errori.push('Il testo è vuoto.');
            return r;
        }
        blocchiDi(pulito).forEach((b, k) => {
            let d;
            try {
                d = JSON.parse(b);
            }
            catch (e) {
                try {
                    d = JSON.parse(riparaVirgole(b));
                    r.riparato = true;
                }
                catch (_e2) {
                    r.errori.push('Blocco ' + (k + 1) + ': JSON non valido (' + (e instanceof Error ? e.message : String(e)) + ').');
                    return;
                }
            }
            r.blocchi++;
            if (Array.isArray(d)) {
                r.quiz.push(...d.filter(oggetto));
                return;
            }
            if (!oggetto(d)) {
                r.errori.push('Blocco ' + (k + 1) + ': formato non riconosciuto.');
                return;
            }
            if (Array.isArray(d.quiz)) {
                r.quiz.push(...d.quiz.filter(oggetto));
                if (testo(d.parte))
                    r.parti.push(testo(d.parte));
            }
            if (oggetto(d.meta) && oggetto(d.programmaCalendario))
                r.chiusura = d;
            else if (!Array.isArray(d.quiz))
                r.errori.push('Blocco ' + (k + 1) + ': cerco un elenco di domande o un oggetto con la chiave "quiz".');
        });
        return r;
    }
    const sezioni = (sp) => sezioniSpiegazione(sp);
    const letteraDichiarata = (sp) => Validatore.letteraDichiarata(sp);
    const citazioni = (x) => Validatore.citazioni(x);
    const analizza = (qs) => Validatore.analizza(qs);
    const CONSIGLI = [
        [/^chiave mancante: (.+)/, m => ['Aggiungi la chiave «' + m[1] + '» con un valore del tipo corretto.', 'L\'import scarta gli oggetti incompleti.']],
        [/^chiave in più: (.+)/, m => ['Rimuovi la chiave «' + m[1] + '»: non fa parte del formato.', 'Il formato è fisso; chiavi estranee confondono l\'import.']],
        [/ID duplicato/, () => ['Assegna un ID univoco materia-x.y-NNN senza riusare numeri già presenti.', 'Con un ID duplicato una domanda sovrascrive l\'altra.']],
        [/livelloCognitivo deve essere/, () => ['Scrivi livelloCognitivo come numero da 1 a 4, senza virgolette.', 'Serve all\'interleaving per livello di Bloom.']],
        [/non coincide con livelloCognitivo/, () => ['Allinea «livello» a «livelloCognitivo» (3 → "L3").', 'Altrimenti i conteggi per livello sono sbagliati.']],
        [/domanda mancante/, () => ['Scrivi un testo di domanda completo.', 'Senza testo la domanda non è utilizzabile.']],
        [/tutte\/nessuna delle precedenti/, () => ['Elimina «tutte/nessuna delle precedenti» da domanda e opzioni.', 'Si risponde per esclusione senza conoscere il contenuto.']],
        [/4 opzioni testuali/, () => ['Porta le opzioni a esattamente 4 stringhe non vuote.', 'L\'app usa 4 opzioni e l\'indice di «esatta».']],
        [/opzioni duplicate/, () => ['Rendi le 4 opzioni distinte.', 'Opzioni uguali rendono la domanda ambigua.']],
        [/esatta deve essere/, () => ['Imposta «esatta» come intero 0–3 (posizione della risposta giusta).', 'L\'app legge opzioni[esatta] come corretta.']],
        [/RISPOSTA ESATTA: /, () => ['Allinea la lettera in «RISPOSTA ESATTA» a «esatta» (0=A … 3=D), o correggi «esatta» se è lei a essere sbagliata.', 'Una delle due è sbagliata: lo studente vedrebbe la soluzione contraddetta.']],
        [/la più lunga/, () => ['Accorcia la corretta o arricchisci i distrattori, senza cambiare il significato.', 'Altrimenti si impara a scegliere la risposta più lunga.']],
        [/contenuto in un distrattore/, () => ['Riformula il distrattore perché non contenga il testo della corretta.', 'Avresti due risposte difendibili.']],
        [/molto più corta/, () => ['Porta la corretta a una lunghezza simile ai distrattori.', 'Una corretta molto più corta si riconosce a colpo d\'occhio.']],
        [/confutazioni duplicate/, () => ['Scrivi una confutazione diversa per ciascun distrattore.', 'Ogni distrattore nasce da un errore diverso.']],
        [/spiegazioneDistrattori/, () => ['Scrivi 3 confutazioni, una per distrattore, nell\'ordine delle opzioni saltando la corretta.', 'È il feedback «Perché la tua risposta è sbagliata».']],
        [/distractorTypes/, () => ['Fornisci 3 etichette di tipo di errore, nello stesso ordine delle confutazioni.', 'Classificano gli errori dello studente.']],
        [/erroreTipico/, () => ['Scrivi in una frase l\'errore di ragionamento che la domanda intercetta.', 'L\'app lo mostra quando sbagli.']],
        [/spiegazione mancante/, () => ['Scrivi la spiegazione con COSA CHIEDE / CONCETTO E MECCANISMO / RISPOSTA ESATTA / PERCHÉ GLI ALTRI NO / IN SINTESI e [[Manuale, p. X]].', 'È ciò che si studia dopo la risposta.']],
        [/spiegazione corta/, () => ['Amplia la spiegazione ad almeno 600 caratteri (meccanismo e confronto coi distrattori).', 'Una spiegazione breve non insegna il perché.']],
        [/manca la citazione/, () => ['Aggiungi in fondo [[Manuale, p. X]] con la pagina reale del libro cartaceo.', 'Senza fonte non si può ricontrollare.']],
        [/non coincide con fonte/, () => ['Rendi la citazione [[…]] della spiegazione coerente con «fonte».', 'Fonte e spiegazione devono rimandare alle stesse pagine.']],
        [/fonte mancante/, () => ['Compila «fonte» con manuale e pagina reale (e copia in sourceRef).', 'Ogni risposta deve essere verificabile.']],
        [/da verificare/, () => ['Sostituisci con una pagina reale controllata sul PDF.', 'Una fonte non verificata è un rischio di errore.']],
        [/sourceRef diverso/, () => ['Imposta sourceRef uguale a fonte.', 'Le due chiavi devono coincidere.']],
        [/^citazione p\. /, () => ['Cerca sul libro la pagina reale che contiene questi concetti e correggi la pagina in fonte, sourceRef e [[…]] della spiegazione.', 'Il controllo sul testo del PDF non ha trovato i concetti della domanda sulla pagina citata né su quelle accanto.']],
        [/stanno nella stessa scheda/, () => ['Sposta un membro della coppia gemella in un\'altra scheda.', 'La coppia serve a ripetere il concetto a distanza.']],
        [/ha (\d+) domande invece di/, m => ['Porta la scheda a ' + PER_SCHEDA + ' domande (ora ' + m[1] + ').', 'Ignoralo se hai caricato solo una parte del file.']],
        [/livello L(\d): (\d+) domande \(atteso (.+)\)/, m => ['Riequilibra: L' + m[1] + ' ha ' + m[2] + ' domande, atteso ' + m[3] + '.', 'Il mix 25/35/25/15 garantisce progressione.']],
        [/meno di 3 posizioni|per 3 domande di fila/, () => ['Ridistribuisci la posizione della corretta (aggiorna «esatta» e l\'ordine delle confutazioni).', 'Posizioni ripetute rendono la risposta prevedibile.']],
        [/nel (\d+)% dei casi \(massimo 25%\)/, () => ['Riscrivi le opzioni delle domande segnate «la più lunga».', 'Vedi la regola sulla lunghezza.']],
        [/esatta=(\d) nel/, m => ['Sposta la corretta dalla posizione ' + m[1] + ' in alcune domande.', 'Le 4 posizioni vanno usate in modo omogeneo.']],
        [/^L(\d) al/, m => ['Riequilibra la quota di domande L' + m[1] + '.', 'Il mix di livelli deve rispettare le percentuali.']],
    ];
    function consiglio(msg) {
        for (const [re, fn] of CONSIGLI) {
            const m = msg.match(re);
            if (m)
                return fn(m);
        }
        return ['Correggi secondo il formato di riferimento.', 'Regola del formato non rispettata.'];
    }
    const autoFix = (qs) => Validatore.ripara(qs);
    function leggiPatch(t) {
        let s = String(t || '').trim();
        if (!s)
            return { errore: 'Il riquadro è vuoto.' };
        const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (m)
            s = m[1].trim();
        let d;
        try {
            d = JSON.parse(riparaVirgole(s));
        }
        catch (e) {
            try {
                d = s.split(/\n+/).map(l => l.trim().replace(/,$/, '')).filter(l => l && l !== '[' && l !== ']').map(l => JSON.parse(l));
            }
            catch (_e2) {
                return { errore: 'JSON non valido: ' + (e instanceof Error ? e.message : String(e)) };
            }
        }
        if (oggetto(d) && Array.isArray(d.quiz))
            d = d.quiz;
        if (oggetto(d) && Array.isArray(d.patch))
            d = d.patch;
        if (oggetto(d)) {
            const o = d;
            d = o.id !== undefined ? [o] : Object.keys(o).map(k => ({ id: k, ...(oggetto(o[k]) ? o[k] : {}) }));
        }
        if (!Array.isArray(d))
            return { errore: 'Non trovo un elenco di patch (serve un array di oggetti con «id»).' };
        return { patch: d.filter(oggetto) };
    }
    function applicaPatch(qs, patch) {
        const out = qs.map(q => oggetto(q) ? { ...q } : q), log = [], mancanti = [];
        let n = 0;
        for (const p of patch) {
            if (p.id === undefined) {
                mancanti.push('elemento senza id');
                continue;
            }
            const q = out.find(x => oggetto(x) && x.id === p.id);
            if (!q) {
                mancanti.push(String(p.id));
                continue;
            }
            const ch = [];
            for (const k of Object.keys(p)) {
                if (k === 'id')
                    continue;
                if (!CHIAVI.includes(k)) {
                    log.push(p.id + ': campo sconosciuto ignorato «' + k + '»');
                    continue;
                }
                q[k] = p[k];
                ch.push(k);
            }
            if (ch.length) {
                n++;
                log.push(p.id + ': aggiornati ' + ch.join(', '));
            }
            else
                log.push(p.id + ': nessun campo da aggiornare');
        }
        return { qs: out, log, mancanti, n };
    }
    function jsonFinale(qs, parte) {
        const ord = (q) => { if (!oggetto(q))
            return q; const o = {}; for (const k of CHIAVI)
            if (k in q)
                o[k] = q[k]; for (const k of Object.keys(q))
            if (!(k in o))
                o[k] = q[k]; return o; };
        return '{"parte":' + JSON.stringify(parte || 'DA-COMPILARE') + ',"quiz":[\n' + qs.map(q => '  ' + JSON.stringify(ord(q))).join(',\n') + '\n]}';
    }
    const A_MANO = /ID duplicato|stanno nella stessa scheda|domande invece di|per 3 domande di fila/;
    const SPEC = [
        [/^chiave mancante: (.+)/, m => ({ f: [m[1]], c: ['domanda'] })],
        [/livelloCognitivo deve essere/, () => ({ f: ['livelloCognitivo', 'livello'], c: ['domanda'] })],
        [/domanda mancante/, () => ({ f: ['domanda'], c: ['opzioni', 'esatta'] })],
        [/tutte\/nessuna delle precedenti/, () => ({ f: ['domanda', 'opzioni', 'esatta', 'spiegazioneDistrattori', 'distractorTypes'], c: ['domanda', 'opzioni', 'esatta', 'spiegazioneDistrattori'] })],
        [/4 opzioni testuali|opzioni duplicate/, () => ({ f: ['opzioni', 'esatta', 'spiegazioneDistrattori', 'distractorTypes'], c: ['domanda', 'opzioni', 'esatta'] })],
        [/esatta deve essere/, () => ({ f: ['esatta'], c: ['domanda', 'opzioni'] })],
        [/RISPOSTA ESATTA: /, () => ({ f: ['esatta', 'spiegazione'], c: ['domanda', 'opzioni', 'esatta', 'spiegazione'] })],
        [/la più lunga|contenuto in un distrattore|molto più corta/, () => ({ f: ['opzioni'], c: ['domanda', 'opzioni', 'esatta'] })],
        [/spiegazioneDistrattori/, () => ({ f: ['spiegazioneDistrattori'], c: ['domanda', 'opzioni', 'esatta', 'spiegazioneDistrattori'] })],
        [/distractorTypes/, () => ({ f: ['distractorTypes'], c: ['opzioni', 'esatta', 'spiegazioneDistrattori'] })],
        [/erroreTipico/, () => ({ f: ['erroreTipico'], c: ['domanda', 'opzioni', 'esatta'] })],
        [/spiegazione mancante|spiegazione corta|manca la citazione|non coincide con fonte/, () => ({ f: ['spiegazione'], c: ['domanda', 'opzioni', 'esatta', 'spiegazione', 'fonte'] })],
        [/fonte mancante/, () => ({ f: ['fonte', 'sourceRef'], c: ['domanda', 'citazione'] })],
        [/da verificare/, () => ({ f: ['fonte', 'sourceRef', 'spiegazione'], c: ['domanda', 'fonte', 'spiegazione'] })],
        [/sourceRef diverso/, () => ({ f: ['sourceRef'], c: ['fonte'] })],
        [/^citazione p\. /, () => ({ f: ['fonte', 'sourceRef', 'spiegazione'], c: ['domanda', 'opzioni', 'esatta', 'fonte', 'citazione'] })],
    ];
    const specDi = (msg) => { for (const [re, fn] of SPEC) {
        const m = msg.match(re);
        if (m)
            return fn(m);
    } return { f: [], c: ['domanda'] }; };
    function riga(q, k) {
        const o = Array.isArray(q.opzioni) ? q.opzioni : null, e = q.esatta;
        if (k === 'domanda')
            return 'Domanda: ' + testo(q.domanda);
        if (k === 'opzioni')
            return o ? 'Opzioni: ' + o.map((x, j) => (LETTERE[j] || String(j + 1)) + ') ' + String(x)).join(' | ') : 'Opzioni: (assenti)';
        if (k === 'esatta')
            return 'Esatta attuale: ' + (Number.isInteger(e) && e >= 0 && e < 4 ? LETTERE[e] + ' (indice ' + e + ')' : String(e));
        if (k === 'spiegazioneDistrattori')
            return 'Confutazioni attuali: ' + (Array.isArray(q.spiegazioneDistrattori) ? q.spiegazioneDistrattori.map((x, j) => (j + 1) + ') ' + String(x)).join(' ') : '(assenti)');
        if (k === 'spiegazione')
            return 'Spiegazione attuale (' + testo(q.spiegazione).length + ' car.): ' + (testo(q.spiegazione) || '(assente)');
        if (k === 'citazione') {
            const c = citazioni(testo(q.spiegazione));
            return 'Citazione nella spiegazione: ' + (c.length ? c.join(' ') : '(nessuna)');
        }
        if (k === 'fonte')
            return 'Fonte attuale: ' + (testo(q.fonte) || '(assente)');
        return k + ': ' + JSON.stringify(q[k]);
    }
    function promptCorrezione(qs, problemi, o = {}) {
        const sel = problemi.filter(p => p.sev === 'err' || (o.avvisi && p.sev === 'warn'));
        const perQ = new Map(), manuali = [], globali = [];
        for (const p of sel) {
            if (A_MANO.test(p.msg)) {
                manuali.push(p);
                continue;
            }
            const q = qs.find(x => oggetto(x) && x.id === p.id);
            if (!q) {
                globali.push(p);
                continue;
            }
            if (p.msg === 'chiave mancante: fonte' && sel.some(j => j.id === p.id && /^fonte mancante/.test(j.msg)))
                continue;
            const sp = specDi(p.msg), a = perQ.get(p.id) || { q, f: new Set(), c: new Set(), righe: [] };
            sp.f.forEach(x => a.f.add(x));
            sp.c.forEach(x => a.c.add(x));
            const [fix, why] = consiglio(p.msg);
            a.righe.push('- ' + p.msg + ' → ' + fix + (o.perche ? ' (perché: ' + why + ')' : ''));
            perQ.set(p.id, a);
        }
        const out = [];
        if (o.gem)
            out.push('CORREZIONE CHIRURGICA — solo patch JSON: per ogni domanda un oggetto con «id» e SOLO i campi dopo RESTITUISCI; un unico blocco di codice compatto (un oggetto per riga), nessun altro testo.');
        else
            out.push('CORREZIONE CHIRURGICA QUIZ — restituisci SOLO patch JSON.', '1. Per ogni domanda elencata rispondi con un oggetto con «id» e SOLO i campi indicati dopo RESTITUISCI. Non rimandare la scheda e non toccare le altre domande.', '2. Un unico blocco di codice JSON: array con un oggetto per riga, compatto, senza commenti né altro testo.', '3. Non cambiare il contenuto scientifico se non serve; cita pagine reali del libro cartaceo; niente eserciziari commerciali.', '4. Non cambiare l\'ordine delle opzioni né «esatta» se non richiesto; se modifichi un\'opzione, adatta la confutazione relativa.', '5. Niente controlli, conteggi o riepiloghi: il controllo è automatico.', 'Formato: [{"id":"...","campo":"..."},{"id":"...","campo":"..."}]');
        out.push('');
        if (!perQ.size)
            out.push('Nessuna patch da chiedere con le impostazioni attuali.');
        else {
            out.push('DOMANDE DA CORREGGERE: ' + perQ.size);
            const ordine = ['domanda', 'opzioni', 'esatta', 'spiegazioneDistrattori', 'spiegazione', 'fonte', 'citazione'];
            perQ.forEach((a, id) => {
                out.push('', '### ' + id, 'RESTITUISCI: ' + (a.f.size ? [...a.f].join(', ') : '(vedi problemi)'), ...a.righe);
                ordine.filter(k => a.c.has(k)).forEach(k => out.push(riga(a.q, k)));
            });
        }
        return { testo: out.join('\n'), nDomande: perQ.size, manuali, globali };
    }
    function avvisiUso(o) {
        const n = [], m = o.manuali || [], g = o.globali || [];
        if (o.autoInSospeso)
            n.push({ sev: 'warn', t: 'Prima le correzioni automatiche', x: 'Ci sono ' + o.autoInSospeso + ' correzioni automatiche non applicate: il prompt le dà per fatte. Premi «Ripara automaticamente» prima di applicare la risposta.' });
        if (m.length)
            n.push({ sev: 'warn', t: 'Da correggere a mano', x: 'Non si risolvono con le patch: ' + m.slice(0, 6).map(i => i.id + ' — ' + i.msg).join('; ') + (m.length > 6 ? '; …e altri ' + (m.length - 6) : '') + '.' });
        if (g.length)
            n.push({ sev: 'warn', t: 'Squilibri globali', x: 'Livelli, posizioni o lunghezze sull\'insieme non si correggono con patch: ' + g.slice(0, 5).map(i => i.id + ' — ' + i.msg).join('; ') + '. Rigenera solo le domande necessarie con la tabella di assegnazione.' });
        n.push({ sev: 'warn', t: 'Chat nuova', x: 'Apri una chat NUOVA (o il tuo Gem) per la correzione: continuare quella della generazione rilegge tutta la cronologia e consuma quota.' });
        n.push({ sev: 'warn', t: 'Incolla solo il prompt', x: 'Non riallegare il file e non chiedere di rigenerare la scheda: le patch bastano.' });
        n.push({ sev: 'info', t: 'Risposta', x: 'Copia solo il blocco di codice e incollalo in «Applica la risposta». Se arriva la scheda intera, rispondi: «Solo patch JSON, solo i campi richiesti.»' });
        n.push({ sev: 'info', t: 'Non farlo ricontrollare', x: 'Non chiedere all\'AI di contare o verificare: il controllo lo fa l\'app.' });
        if (!o.gem)
            n.push({ sev: 'info', t: 'Gem', x: 'Metti le «Regole per il Gem» nelle istruzioni di un Gem e spunta «Ho un Gem»: i prompt si accorciano.' });
        n.push({ sev: 'info', t: 'Quota', x: 'Il consumo si controlla su gemini.google.com/usage.' });
        return n;
    }
    function pianoConteggi(n) {
        const p = [0.25, 0.35, 0.25, 0.15], raw = p.map(x => x * n), fl = raw.map(Math.floor);
        const resto = n - fl.reduce((a, b) => a + b, 0);
        const ord = raw.map((r, i) => [r - fl[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
        for (let k = 0; k < resto; k++)
            fl[ord[k][1]]++;
        return fl;
    }
    function mescola(a, rnd) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
    } return b; }
    function piano(n, rnd = Math.random) {
        const lv = [];
        pianoConteggi(n).forEach((k, i) => { for (let j = 0; j < k; j++)
            lv.push(i + 1); });
        const base = Math.floor(n / 4), pc = [base, base, base, base];
        mescola([0, 1, 2, 3], rnd).slice(0, n % 4).forEach(i => pc[i]++);
        const ps = [];
        pc.forEach((k, i) => { for (let j = 0; j < k; j++)
            ps.push(i); });
        const ok = (a) => { for (let i = 2; i < a.length; i++)
            if (a[i] === a[i - 1] && a[i] === a[i - 2])
                return false; return true; };
        for (let t = 0; t < 3000; t++) {
            const a = mescola(lv, rnd), b = mescola(ps, rnd);
            if (ok(a) && ok(b))
                return a.map((l, i) => ({ lv: l, es: b[i] }));
        }
        return lv.map((l, i) => ({ lv: l, es: ps[i] }));
    }
    const pad3 = (x) => String(x).padStart(3, '0');
    function tabella(prefisso, primo, righe) {
        return ['TABELLA DI ASSEGNAZIONE (domande ' + pad3(primo) + '–' + pad3(primo + righe.length - 1) + ')',
            'Per ogni riga usa ESATTAMENTE id e livello indicati e metti la risposta giusta nella posizione indicata (esatta: 0=A, 1=B, 2=C, 3=D). Non cambiare l\'assegnazione.',
            ...righe.map((p, i) => prefisso + '-' + pad3(primo + i) + ' | L' + p.lv + ' | esatta=' + p.es + ' (' + LETTERE[p.es] + ')')].join('\n');
    }
    const REGOLE_GEM = ['REGOLE DI FORMATO (da mettere nelle istruzioni del Gem)',
        '- Rispondi solo con blocchi di codice JSON, una domanda per riga, compatti, senza commenti né testo fuori dal formato richiesto.',
        '- Se ricevi una TABELLA DI ASSEGNAZIONE, segui alla lettera id, livello e posizione della risposta esatta di ogni riga.',
        '- In ogni domanda almeno un distrattore deve avere più caratteri della risposta corretta.',
        '- spiegazioneDistrattori e distractorTypes: 3 elementi, nell\'ordine delle opzioni saltando la corretta.',
        '- Non eseguire controlli o conteggi finali estesi: la verifica la fa l\'app.',
        '- Se ricevi una CORREZIONE CHIRURGICA, restituisci solo patch: un oggetto per domanda con «id» e i soli campi dopo RESTITUISCI, mai la scheda intera.'].join('\n');
    return { CHIAVI, PER_SCHEDA, LETTERE, riparaVirgole, leggi, sezioni, letteraDichiarata, analizza, consiglio, autoFix, leggiPatch, applicaPatch, jsonFinale,
        promptCorrezione, avvisiUso, pianoConteggi, piano, tabella, REGOLE_GEM };
})();

const Dossier = (() => {
    const MIN_ARG = 5, SOGLIA_DEBOLE = 0.6, MAX_CONFUSIONI = 5, MAX_REGOLE = 8, TAGLIO = 140;
    const pct = (a, b) => Math.round(100 * a / b);
    const taglia = (s) => { const x = String(s || '').replace(/\s+/g, ' ').trim(); return x.length > TAGLIO ? x.slice(0, TAGLIO - 1) + '…' : x; };
    const mediana = (a) => { if (!a.length)
        return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    function argomentoDaSk(sk) {
        const m = /(\d+(?:\.\d+)+|\d+)(?=-(?:S?\d+)$|$)/i.exec(String(sk || ''));
        return m ? m[1] : '';
    }
    const nelloStep = (arg, step) => !step || arg === step || arg.startsWith(step + '.');
    function calcola(dati, o) {
        const step = String(o.step || '').trim();
        const stat = (dati.stat || []).filter(s => s && nelloStep(argomentoDaSk(s.sk), step));
        const voci = [];
        const perArg = new Map();
        for (const s of stat) {
            const a = argomentoDaSk(s.sk);
            if (!a)
                continue;
            const l = perArg.get(a) || [];
            l.push(s);
            perArg.set(a, l);
        }
        const tentativi = stat.reduce((x, s) => x + (s.n || 0), 0);
        const g = dati.giorniEsame;
        if (typeof g === 'number' && g >= 0) {
            const motivo = 'Esame tra ' + g + (g === 1 ? ' giorno.' : ' giorni.');
            if (g <= 7)
                voci.push({ id: 'esame', tipo: 'esame', titolo: 'Esame vicino', motivo, peso: 100,
                    regola: 'Esame tra pochi giorni: niente approfondimenti fuori programma; privilegia domande d\'esame L3–L4 e trabocchetti sui sotto-step deboli.' });
            else if (g <= 21)
                voci.push({ id: 'esame', tipo: 'esame', titolo: 'Esame entro tre settimane', motivo, peso: 45,
                    regola: 'Esame entro tre settimane: bilancia richiamo (L1–L2) e applicazione (L3–L4) in ogni scheda.' });
            else
                voci.push({ id: 'esame', tipo: 'esame', titolo: 'Esame lontano', motivo: motivo + ' C\'è tempo per costruire le basi.', peso: 5 });
        }
        for (const [arg, xs] of perArg) {
            const n = xs.reduce((a, s) => a + (s.n || 0), 0), ok = xs.reduce((a, s) => a + (s.ok || 0), 0);
            if (n >= MIN_ARG && ok / n < SOGLIA_DEBOLE)
                voci.push({ id: 'debole:' + arg, tipo: 'debole', arg, titolo: 'Sotto-step ' + arg + ' debole',
                    motivo: pct(ok, n) + ' % di risposte giuste su ' + n + ' tentativi.', peso: 80 + Math.round(60 - 100 * ok / n),
                    regola: 'Sotto-step ' + arg + ': aggiungi almeno una scheda in più, con più domande L3 (trabocchetti) e confutazioni esplicite.' });
            const ill = xs.filter(s => s.caso === 'illusione_competenza' || (s.tag || []).includes('illusione_competenza') ||
                (s.log || []).some(t => !t.corretto && t.certezza === 3)).length;
            if (ill >= 2)
                voci.push({ id: 'illusione:' + arg, tipo: 'illusione', arg, titolo: 'Sicurezza mal riposta nel sotto-step ' + arg,
                    motivo: ill + ' domande sbagliate dicendo «sicuro».', peso: 70 + ill,
                    regola: 'Sotto-step ' + arg + ': ci sono risposte sbagliate date con sicurezza; aggiungi coppie gemelle (G1, G2…) e trabocchetti L3 sui punti che sembrano facili.' });
            const rip = xs.filter(s => typeof s.ease === 'number' && (s.reps || 0) >= 1);
            if (rip.length >= 3) {
                const e = rip.reduce((a, s) => a + s.ease, 0) / rip.length;
                if (e <= 2.0)
                    voci.push({ id: 'oblio:' + arg, tipo: 'oblio', arg, titolo: 'Il sotto-step ' + arg + ' si dimentica in fretta',
                        motivo: 'Facilità media dei ripassi ' + e.toFixed(1).replace('.', ',') + ' su ' + rip.length + ' domande (2,5 = normale).', peso: 50,
                        regola: 'Sotto-step ' + arg + ': più domande di richiamo (L1–L2) sugli stessi concetti, formulate in modi diversi.' });
            }
        }
        const conf = [];
        for (const s of stat)
            if (s.scelte && !/^g-/.test(s.qid))
                for (const [scelta, volte] of Object.entries(s.scelte))
                    if (volte >= 2 && scelta.trim())
                        conf.push({ s, scelta, volte });
        conf.sort((a, b) => b.volte - a.volte || (a.s.qid < b.s.qid ? -1 : a.s.qid > b.s.qid ? 1 : 0) || (a.scelta < b.scelta ? -1 : 1));
        for (const c of conf.slice(0, MAX_CONFUSIONI)) {
            const arg = argomentoDaSk(c.s.sk), dove = c.s.testo ? 'a «' + taglia(c.s.testo) + '»' : 'nel sotto-step ' + arg;
            voci.push({ id: 'confusione:' + c.s.qid + ':' + taglia(c.scelta).slice(0, 24), tipo: 'confusione', arg, titolo: 'Idea sbagliata ricorrente (sotto-step ' + arg + ')',
                motivo: 'Risposta sbagliata «' + taglia(c.scelta) + '» scelta ' + c.volte + ' volte.', peso: 60 + c.volte,
                regola: 'Smonta l\'idea sbagliata: ' + dove + ' si risponde spesso «' + taglia(c.scelta) + '». Aggiungi 2 domande con questa risposta come distrattore e confutazione esplicita.' });
        }
        const tL1 = stat.filter(s => s.livello === 1).flatMap(s => (s.log || []).map(t => t.ms).filter(ms => ms > 0));
        if (tL1.length >= 8) {
            const m = mediana(tL1);
            if (m > 25000)
                voci.push({ id: 'tempo:L1', tipo: 'tempo', titolo: 'Domande di base lente', motivo: 'Mediana ' + Math.round(m / 1000) + ' s per una domanda L1 (su ' + tL1.length + ' risposte).', peso: 40,
                    regola: 'Domande L1 brevi: testo sotto le 25 parole, una sola idea per domanda.' });
        }
        const tutti = stat.flatMap(s => s.log || []).filter(t => t && t.ts && !isNaN(Date.parse(t.ts))).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
        const sessioni = [];
        for (const t of tutti) {
            const u = sessioni[sessioni.length - 1];
            if (u && Date.parse(t.ts) - Date.parse(u[u.length - 1].ts) <= 20 * 60000)
                u.push(t);
            else
                sessioni.push([t]);
        }
        const cali = [];
        for (const s of sessioni) {
            if (s.length < 12)
                continue;
            const base = s.slice(0, 8), acc0 = base.filter(t => t.corretto).length / 8, ms0 = mediana(base.map(t => t.ms).filter(x => x > 0));
            for (let i = 8; i + 5 <= s.length; i++) {
                const w = s.slice(i, i + 5), acc = w.filter(t => t.corretto).length / 5, ms = mediana(w.map(t => t.ms).filter(x => x > 0));
                if (acc < acc0 - 0.25 || (ms0 > 0 && ms > 1.6 * ms0)) {
                    const primo = w.findIndex(t => !t.corretto);
                    cali.push(i + (primo >= 0 ? primo : 0));
                    break;
                }
            }
        }
        if (cali.length >= 2) {
            const n = Math.round(mediana(cali));
            voci.push({ id: 'concentrazione', tipo: 'concentrazione', titolo: 'La concentrazione cala dopo circa ' + n + ' domande',
                motivo: 'Mediana su ' + cali.length + ' sessioni: fai una pausa breve ogni ' + n + ' domande.', peso: 20 });
        }
        const FASCE = ['notte', 'mattina', 'pomeriggio', 'sera'];
        const perF = FASCE.map(() => ({ n: 0, ok: 0 }));
        for (const t of tutti) {
            const f = perF[Math.floor(new Date(t.ts).getHours() / 6)];
            f.n++;
            if (t.corretto)
                f.ok++;
        }
        const valide = perF.map((f, i) => ({ i, n: f.n, p: f.n ? f.ok / f.n : 0 })).filter(f => f.n >= 10).sort((a, b) => b.p - a.p || a.i - b.i);
        if (valide.length >= 2) {
            const su = valide[0], giu = valide[valide.length - 1];
            if (su.p - giu.p >= 0.15)
                voci.push({ id: 'orario', tipo: 'orario', titolo: 'Rendi di più di ' + FASCE[su.i],
                    motivo: FASCE[su.i] + ' ' + Math.round(100 * su.p) + ' % · ' + FASCE[giu.i] + ' ' + Math.round(100 * giu.p) + ' % di risposte giuste.', peso: 15 });
        }
        const mg = dati.minutiGiorno;
        if (typeof mg === 'number' && mg > 0)
            voci.push({ id: 'studio', tipo: 'studio', titolo: 'Circa ' + Math.round(mg) + ' minuti nei giorni di studio',
                motivo: 'Media degli ultimi 14 giorni in cui hai studiato.', peso: 10 });
        voci.sort((a, b) => b.peso - a.peso || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return { materia: o.materia, step, voci, tentativi, insufficiente: tentativi < MIN_ARG };
    }
    function regole(d, escluse = []) {
        const via = new Set(escluse);
        return d.voci.filter(v => v.regola && !via.has(v.id)).slice(0, MAX_REGOLE).map(v => v.regola);
    }
    function testo(d, r) {
        const L = ['Dossier — ' + d.materia + (d.step ? ' · step ' + d.step : ' · tutta la materia') + ' (' + d.tentativi + ' risposte)'];
        if (d.insufficiente)
            L.push('Dati insufficienti: servono più quiz fatti in app perché il dossier dica qualcosa.');
        for (const v of d.voci)
            L.push('• ' + v.titolo + ' — ' + v.motivo + (v.regola ? '' : ' (solo per te)'));
        L.push('All\'AI vanno ' + (r.length === 1 ? '1 regola.' : r.length + ' regole.'));
        return L.join('\n');
    }
    function controllaPrivacy(t, ctx = {}) {
        const s = String(t || ''), basso = s.toLowerCase(), out = new Set();
        if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(s))
            out.add('Contiene un\'email.');
        const email = String(ctx.email || '').toLowerCase();
        if (email) {
            const loc = email.split('@')[0];
            if (basso.includes(email) || (loc.length >= 4 && basso.includes(loc)))
                out.add('Contiene l\'email dell\'account (o una sua parte).');
        }
        const nome = String(ctx.nome || '').trim().toLowerCase();
        if (nome.length >= 3 && basso.includes(nome))
            out.add('Contiene il nome dell\'account.');
        if ((ctx.dispositivo && s.includes(ctx.dispositivo)) || /\bdev-[a-z0-9]{6,}/i.test(s))
            out.add('Contiene l\'id del dispositivo.');
        if (/\b\d{4}-\d{2}-\d{2}\b/.test(s) || /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(s))
            out.add('Contiene una data.');
        if (/\b([01]?\d|2[0-3]):[0-5]\d\b/.test(s))
            out.add('Contiene un\'ora esatta.');
        for (const f of ctx.nomiFile || []) {
            const x = String(f || '').toLowerCase(), senza = x.replace(/\.[a-z0-9]{2,5}$/, '');
            if (senza.length >= 5 && basso.includes(senza)) {
                out.add('Contiene il nome di un file.');
                break;
            }
        }
        if (/(?:\+|\b00)\d{2}[\s.-]?\d{2,4}[\s.-]?\d{5,8}\b/.test(s) || /\b3\d{2}[\s.-]?\d{6,7}\b/.test(s))
            out.add('Contiene un numero di telefono.');
        return [...out];
    }
    return { argomentoDaSk, nelloStep, calcola, regole, testo, controllaPrivacy };
})();

const MappaPagine = (() => {
    const APERTO = 99999;
    const ROMANI = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    function aRomano(n, maiuscolo = false) {
        let out = '';
        for (const [v, r] of ROMANI)
            while (n >= v) {
                out += r;
                n -= v;
            }
        return maiuscolo ? out.toUpperCase() : out;
    }
    function daRomano(t) {
        const s = t.toLowerCase();
        if (!/^[ivxlcdm]+$/.test(s))
            return null;
        let n = 0, i = 0;
        for (const [v, r] of ROMANI)
            while (s.startsWith(r, i)) {
                n += v;
                i += r.length;
            }
        return i === s.length && n > 0 && aRomano(n) === s ? n : null;
    }
    function leggiNumero(x) {
        if (typeof x === 'number')
            return Number.isInteger(x) && x > 0 ? { romano: false, n: x, maiuscolo: false } : null;
        const t = String(x == null ? '' : x).trim();
        if (/^\d{1,5}$/.test(t))
            return Number(t) > 0 ? { romano: false, n: Number(t), maiuscolo: false } : null;
        const r = daRomano(t);
        return r ? { romano: true, n: r, maiuscolo: t === t.toUpperCase() } : null;
    }
    const scrivi = (romano, n, maiuscolo) => romano ? aRomano(n, maiuscolo) : n;
    function daEtichette(etichette) {
        const tratti = [];
        let prec = null;
        etichette.forEach((e, i) => {
            const x = e == null ? null : leggiNumero(e), ultimo = tratti[tratti.length - 1];
            if (x && prec && ultimo && ultimo.pdfA === i && x.romano === prec.romano && x.n === prec.n + 1)
                ultimo.pdfA = i + 1;
            else if (x)
                tratti.push({ pdfDa: i + 1, pdfA: i + 1, stampDa: scrivi(x.romano, x.n, x.maiuscolo) });
            prec = x;
        });
        return tratti.length ? { fonte: 'auto-etichette', tratti, affidabilita: 'esatta' } : null;
    }
    function daStampati(numeriPerPagina) {
        const cand = numeriPerPagina.map((ns, i) => new Set((ns || []).map(n => i + 1 - n).filter(d => d >= 0)));
        const scost = cand.map((c, i) => {
            let best = null, nb = 0;
            c.forEach(d => {
                let v = 0;
                for (let j = Math.max(0, i - 3); j <= Math.min(cand.length - 1, i + 3); j++)
                    if (cand[j].has(d))
                        v++;
                if (v > nb || (v === nb && best !== null && d < best)) {
                    best = d;
                    nb = v;
                }
            });
            return nb >= 3 ? best : null;
        });
        const tratti = [];
        scost.forEach((d, i) => {
            if (d === null)
                return;
            const ultimo = tratti[tratti.length - 1];
            if (ultimo && ultimo.d === d) {
                ultimo.pdfA = i + 1;
                ultimo.voti++;
            }
            else
                tratti.push({ pdfDa: i + 1, pdfA: i + 1, stampDa: i + 1 - d, d, voti: 1 });
        });
        const buoni = tratti.filter(t => t.voti >= 3).map(({ pdfDa, pdfA, stampDa }) => ({ pdfDa, pdfA, stampDa }));
        return buoni.length ? { fonte: 'auto-stampati', tratti: buoni, affidabilita: 'stimata' } : null;
    }
    function daMano(righe) {
        const ok = righe.map(r => ({ x: leggiNumero(r.stampata), pdf: Math.round(Number(r.pdf)) })).filter(r => r.x && r.pdf > 0).sort((a, b) => a.pdf - b.pdf);
        const tratti = ok.map((r, i) => ({ pdfDa: r.pdf, pdfA: i + 1 < ok.length ? ok[i + 1].pdf - 1 : APERTO, stampDa: scrivi(r.x.romano, r.x.n, r.x.maiuscolo) }));
        return { fonte: 'mano', tratti, affidabilita: tratti.length ? 'esatta' : 'nessuna' };
    }
    function aPdf(m, stampata) {
        const x = leggiNumero(stampata);
        if (!m || !x)
            return null;
        for (const t of m.tratti) {
            const s = leggiNumero(t.stampDa);
            if (!s || s.romano !== x.romano)
                continue;
            const k = x.n - s.n;
            if (k >= 0 && k <= t.pdfA - t.pdfDa)
                return t.pdfDa + k;
        }
        return null;
    }
    function aStampata(m, pdf) {
        const t = m ? m.tratti.find(x => pdf >= x.pdfDa && pdf <= x.pdfA) : undefined, s = t ? leggiNumero(t.stampDa) : null;
        return t && s ? scrivi(s.romano, s.n + pdf - t.pdfDa, s.maiuscolo) : null;
    }
    const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    function verifica(m, citazione, testoPagina, parole) {
        const c = /\bpp?\.\s*(\d{1,5}|[ivxlcdm]+)\b/i.exec(String(citazione || '')), x = c ? leggiNumero(c[1]) : null;
        const pagina = x ? scrivi(x.romano, x.n, x.maiuscolo) : null, pdf = x ? aPdf(m, pagina) : null, pv = parole.map(norm).filter(Boolean);
        if (pdf === null || !pv.length)
            return { esito: '❓', pagina };
        const quota = (p) => { const t = norm(testoPagina(p) || ''); return t ? pv.filter(w => t.includes(w)).length / pv.length : -1; };
        const qui = quota(pdf);
        if (qui >= 0.5)
            return { esito: '✅', pagina };
        const vicine = [pdf + 1, pdf - 1].map(p => ({ p, q: quota(p) })).filter(v => v.q >= 0.5).sort((a, b) => b.q - a.q);
        if (vicine.length) {
            const s = aStampata(m, vicine[0].p);
            if (s !== null)
                return { esito: '↔', pagina: s };
        }
        if (qui > 0)
            return { esito: '⚠', pagina };
        return { esito: qui < 0 && quota(pdf - 1) < 0 && quota(pdf + 1) < 0 ? '❓' : '✗', pagina };
    }
    function campioneProva(m, k = 3, seme = 1, totale) {
        if (!m)
            return [];
        const pagine = [];
        for (const t of m.tratti) {
            const fine = Math.min(t.pdfA, totale || (t.pdfA === APERTO ? t.pdfDa + 49 : t.pdfA));
            for (let p = t.pdfDa; p <= fine; p++)
                pagine.push(p);
        }
        let x = (seme >>> 0) || 1;
        const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
        for (let i = pagine.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [pagine[i], pagine[j]] = [pagine[j], pagine[i]];
        }
        return pagine.slice(0, k).sort((a, b) => a - b).map(pdf => ({ pdf, stampata: aStampata(m, pdf) }));
    }
    return { APERTO, aRomano, daRomano, daEtichette, daStampati, daMano, aPdf, aStampata, verifica, campioneProva };
})();

const MasterPrompt = (() => {
    function paginaLeggibile(t) {
        const s = String(t || '').replace(/\s+/g, ' ').trim();
        if (s.length < 200)
            return false;
        const lettere = (s.match(/[A-Za-zÀ-ÿ]/g) || []).length;
        return lettere / s.replace(/ /g, '').length >= 0.6;
    }
    function indiceLettura(testi) {
        const campione = testi.length, leggibili = testi.filter(paginaLeggibile).length;
        const pct = campione ? Math.round(100 * leggibili / campione) : 0;
        const media = campione ? Math.round(testi.reduce((a, t) => a + String(t || '').trim().length, 0) / campione) : 0;
        return { campione, leggibili, pct, media, giudizio: pct >= 85 ? 'testo pieno' : pct >= 50 ? 'parziale' : 'scansione' };
    }
    function pagineCampione(totale, k = 24) {
        if (totale <= k)
            return Array.from({ length: totale }, (_, i) => i + 1);
        const out = new Set();
        for (let i = 0; i < k; i++)
            out.add(1 + Math.round(i * (totale - 1) / (k - 1)));
        return [...out];
    }
    function segmentoDa(nome) {
        const m = /(\d{1,4})\s*[-–_]\s*(\d{1,4})(?!.*\d{1,4}\s*[-–_]\s*\d)/.exec(String(nome || '').replace(/\.pdf$/i, ''));
        if (!m)
            return null;
        const a = Number(m[1]), b = Number(m[2]);
        return b > a ? a : null;
    }
    function nomeLibro(nome) {
        return String(nome || '').replace(/\.pdf$/i, '').replace(/\d{1,4}\s*[-–_]\s*\d{1,4}/g, ' ').replace(/[\s_\-–()]+/g, ' ').trim() || String(nome || '');
    }
    function numeroStampato(t) {
        const righe = String(t || '').split(/\n+/).map(r => r.trim()).filter(Boolean);
        const bordi = righe.slice(0, 3).concat(righe.slice(-3)).filter(r => r.length <= 60);
        const out = [];
        for (const r of bordi) {
            const m = /^(\d{1,4})(?:\s|$)/.exec(r) || /(?:^|\s)(\d{1,4})$/.exec(r);
            if (m)
                out.push(Number(m[1]));
        }
        return out;
    }
    function stimaOffset(campioni) {
        const voti = new Map();
        for (const c of campioni) {
            const visti = new Set();
            for (const n of numeroStampato(c.testo)) {
                const d = c.pdf - n;
                if (d >= 0 && d <= 60 && !visti.has(d)) {
                    visti.add(d);
                    voti.set(d, (voti.get(d) || 0) + 1);
                }
            }
        }
        let best = null, nb = 0;
        voti.forEach((v, d) => { if (v > nb || (v === nb && best !== null && d < best)) {
            best = d;
            nb = v;
        } });
        return best !== null && nb >= 3 && nb >= 0.3 * campioni.length ? best : null;
    }
    const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '');
    function prossimo(ids, prefisso) {
        const re = new RegExp('(?:^|-)' + prefisso.replace(/[.]/g, '\\.') + '-(\\d{3})$');
        let max = 0;
        for (const id of ids) {
            const m = re.exec(String(id));
            if (m)
                max = Math.max(max, Number(m[1]));
        }
        return { primo: max + 1, scheda: Math.ceil(max / 18) + 1 };
    }
    const RANGE_SCHEDE = { leggera: [10, 14], standard: [18, 25], intensa: [24, 30] };
    const SEQUENZA_LIVELLI = [1, 1, 2, 1, 2, 2, 3, 1, 2, 3, 2, 4, 1, 3, 2, 4, 3, 4];
    const CHIAVI_V3 = ['livello', 'gemella', 'tipoItem', 'erroreTipico', 'domanda', 'opzioni', 'spiegazione', 'spiegazioneDistrattori', 'distractorTypes', 'fonte'];
    function regolaArchetipo(arch, materia) {
        const m = slug(materia);
        if (arch === 'stem_calcolo')
            return 'Q-E. Materia di calcolo: ogni scheda "Problemi su …" ha numeri che tornano; grafici (P–V, v–t, s–t, funzioni) descritti a parole; formula inversa e unità SI sempre esplicite.';
        if (arch === 'umanistico_storico')
            return 'Q-E. Materia umanistica: niente nozionismo di sole date; usa cause → eventi → conseguenze, confronti tra autori/correnti, passi di fonti da interpretare, cronologie relative.';
        if (arch === 'giuridico_economico')
            return 'Q-E. Materia giuridico-economica: regola + eccezione, casi pratici, articoli/norme citati con precisione; distrattori da norme vicine o eccezioni dimenticate.';
        if (arch === 'lingue_letteratura')
            return 'Q-E. Lingue/letteratura: grammatica e lessico SEMPRE in contesto (frasi intere), analisi di brevi passi; distrattori da falsi amici, accordi, tempi verbali.';
        if (arch === 'informatica_coding')
            return 'Q-E. Informatica: frammenti di codice brevi inline, «cosa stampa», complessità, casi limite; distrattori da off-by-one, tipi, precedenza degli operatori.';
        if (m.startsWith('biolog'))
            return 'Q-E. BIOLOGIA: niente domande su tabelle; usa strutture, processi, fasi, meccanismi, casi clinici.';
        if (m.startsWith('chimic') || m.startsWith('fisic'))
            return 'Q-E. ' + materia.toUpperCase() + ': dove serve, domande su grafici (P–V, v–t, curve di riscaldamento, energia di reazione) descritti a parole; problemi con numeri che tornano.';
        return 'Q-E. Scienze sperimentali: meccanismi, processi, esperimenti e casi clinici/applicativi; niente domande su tabelle da memorizzare.';
    }
    const conCalcoli = (arch, materia) => arch === 'stem_calcolo' || arch === 'informatica_coding' || /^(chimic|fisic)/.test(slug(materia));
    function registro(tono) {
        if (tono === 'semplice_esempi')
            return 'Registro delle spiegazioni: semplice, frasi brevi, un esempio concreto per concetto.';
        if (tono === 'didattico_chiaro')
            return 'Registro delle spiegazioni: didattico e chiaro, termini tecnici spiegati alla prima occorrenza.';
        return 'Registro delle spiegazioni: tecnico-accademico, terminologia del manuale.';
    }
    function rigaLibro(l) {
        const segs = l.segmenti || l.pdf.some(p => segmentoDa(p) !== null);
        const parti = [' - ' + l.nome + ' (' + l.pdf.length + ' PDF' + (segs ? ' a segmenti: il numero nel nome è la pagina PDF assoluta di inizio' : '') + ').'];
        const tratti = l.mappa && l.mappa.tratti.length ? l.mappa.tratti : typeof l.offset === 'number' ? [{ pdfDa: l.offset + 1, pdfA: MappaPagine.APERTO, stampDa: 1 }] : [];
        if (tratti.length)
            parti.push('Pagine (misurate dall\'app): ' + tratti.map(t => {
                const fine = t.pdfA >= MappaPagine.APERTO ? '' : '–' + MappaPagine.aStampata({ fonte: 'mano', tratti: [t], affidabilita: 'esatta' }, t.pdfA);
                return 'stampate ' + t.stampDa + fine + ' = PDF ' + t.pdfDa + (fine ? '–' + t.pdfA : ' in poi');
            }).join('; ') + (segs ? '; dentro un segmento: pagina = PDF assoluta − inizio segmento + 1' : '') + '. Cita SEMPRE la pagina stampata.');
        else
            parti.push('Pagine stampate non misurate: nella citazione scrivi capitolo e paragrafo (es. [[Manuale, cap. 3, par. 3.2]]), senza numero di pagina.');
        const r = l.lettura;
        if (r) {
            parti.push('Indice di lettura ' + r.pct + '% (' + r.leggibili + '/' + r.campione + ' pagine campione con testo).');
            if (r.giudizio === 'parziale')
                parti.push('Alcune pagine sono immagini: cita SOLO pagine di cui hai letto un passaggio chiaro; per il resto usa slide o un\'altra pagina dello stesso argomento.');
            if (r.giudizio === 'scansione')
                parti.push('È una SCANSIONE senza testo: leggi le pagine come immagini e verifica a vista ogni pagina citata; se non ci riesci scrivi «BLOCCO: <libro, pagine>» invece di inventare.');
        }
        return parti.join(' ');
    }
    const SBARRA = '==========================================================';
    const sezione = (S, t) => S.push('', SBARRA, t, SBARRA);
    const elenco = (xs, max = 12) => xs.slice(0, max).map(x => '«' + x + '»').join(', ') + (xs.length > max ? ' e altri ' + (xs.length - max) : '');
    function base(o) {
        const mat = String(o.materia || 'Materia').trim(), ms = slug(mat) || 'materia', cod = String(o.codice || mat.charAt(0)).toUpperCase();
        const step = String(o.step || '1.1').trim(), arch = o.archetipo || 'scienze_sperimentali';
        return { mat, ms, cod, step, pref: ms + '-' + step, ud: o.unita || 'UD' + step.split('.')[0], arch };
    }
    const RUOLO = 'Sei l\'architetto didattico e neuroscientifico dell\'app di studio «il-mio-calendario». Lavori in AUTONOMIA: nessuno allungherà o correggerà il tuo output a mano (un controllo automatico scarta ciò che non rispetta il formato). Quantità e qualità qui sotto sono obbligatorie. Tutto in italiano, niente chiacchiere.';
    const rigaMateria = (o) => { const b = base(o); return ' - Materia: ' + b.mat + ' (codice ' + b.cod + ', id in minuscolo «' + b.ms + '») · archetipo: ' + (o.etichettaArchetipo || b.arch) + '.'; };
    function righeStudente(o, classico = false) {
        const S = [];
        if (o.dossier && o.dossier.length)
            S.push(' - Dossier dello studente (calcolato dall\'app sui suoi quiz, già deciso: ' + (classico ? 'applica queste regole senza ricalcolare nulla' : 'applica queste regole così come sono') + '):', ...o.dossier.map(r => '   • ' + r));
        else if (o.puntiDeboli && o.puntiDeboli.length)
            S.push(' - Punti deboli misurati dall\'app (risposte corrette < 60%): ' + o.puntiDeboli.join('; ') + '. Dedica a questi argomenti almeno una scheda in più, con più L3 (trabocchetti) e confutazioni molto esplicite.');
        if (o.note)
            S.push(' - Richieste dello studente: ' + o.note);
        return S;
    }
    const COMPATIBILITA = [
        ' - «📥 Importa quiz da Drive» legge i .json nelle cartelle che finiscono in «quiz»: domanda → testo, opzioni → 4 risposte (la corretta la scrivi SEMPRE in `opzioni[0]`, l\'app la sposta in una posizione bilanciata), ' +
            'spiegazione → correzione passo-passo divisa nelle sezioni COSA CHIEDE / CONCETTO E MECCANISMO / IN SINTESI, fonte → riferimento, livello (NUMERO 1–4) → livello di Bloom.',
        ' - L\'app MESCOLA le opzioni: per questo le confutazioni vanno in `spiegazioneDistrattori` (l\'app le mostra accanto all\'opzione scelta) e le lettere dentro `spiegazione` le riscrive l\'app dopo aver mescolato.',
        ' - «Allenamento Neuro»: certezza 1/2/3 dopo ogni risposta; sicuro+sbagliato = illusione di competenza → la domanda torna oggi in «Quiz da rifare» con la confutazione del distrattore scelto e il tuo `erroreTipico`.',
        ' - Interleaving per step e livello; coppie gemelle (`gemella`) e `distractorTypes` alimentano trabocchetti e statistiche.',
        ' - ID, step, sotto-step, posizione dell\'esatta, conteggi e controlli li fa l\'app: tu scrivi SOLO il contenuto. Reimportare aggiorna, non duplica.'
    ];
    function fonti(o, intro) {
        const { mat } = base(o), quiz = o.quizEsistenti || [], slide = o.slide || [], vietati = o.vietati || [], libri = o.libri || [];
        const S = [intro];
        let k = 1;
        if (quiz.length)
            S.push(' ' + (k++) + '. Quiz già esistenti (non duplicare argomenti già coperti): ' + elenco(quiz) + '.');
        else
            S.push(' ' + (k++) + '. La cartella «' + mat + ' quiz», se esiste, per sapere cosa è già coperto.');
        if (o.guide && o.guide.length)
            S.push(' ' + (k++) + '. Syllabus, programma e appelli d\'esame come MODELLO di stile, difficoltà e trabocchetti: ' + elenco(o.guide) + '.');
        if (slide.length)
            S.push(' ' + (k++) + '. Slide e dispense dei docenti: ' + elenco(slide) + '.');
        if (o.indici && o.indici.length)
            S.push(' ' + (k++) + '. Indici dei libri (per trovare capitoli e pagine): ' + elenco(o.indici) + '.');
        S.push(' ' + (k++) + '. Il libro di testo, solo le pagine dello step (le trovi dall\'indice).');
        if (vietati.length)
            S.push('VIETATO usare come fonte: ' + elenco(vietati) + ' (eserciziari commerciali).');
        S.push('Se un file non è apribile o un PDF è troncato: NON inventare. Scrivi «BLOCCO: <file/capitolo non leggibile>» e fermati.');
        if (libri.length) {
            S.push('', 'MAPPA LIBRI E PAGINE — misurata dall\'app:');
            libri.forEach(l => S.push(rigaLibro(l)));
        }
        return S;
    }
    function regoleScheda(o, calcoli) {
        const { mat, arch } = base(o);
        return [' - 1 SCHEDA = 18 domande a risposta multipla con ESATTAMENTE 4 opzioni; ogni scheda copre un solo microstep e contiene tutti e 4 i livelli.',
            ' - NON scrivere id, stepId, sottoStep, esatta, livelloCognitivo, sourceRef: li aggiunge l\'app.',
            '', 'LIVELLI — segui questa SEQUENZA per le 18 domande di ogni scheda (1ª, 2ª, … 18ª): ' + SEQUENZA_LIVELLI.join(', ') + '.',
            ' - 1 richiamo attivo · 2 applicazione · 3 trabocchetto (illusione di competenza) · 4 sintesi trasversale / caso.',
            ' - Coppie gemelle: due domande su concetti speculari, in schede diverse, con la stessa etichetta `"gemella": "G1"` (poi G2, G3…); circa 1 coppia ogni 3 schede.',
            ' - `erroreTipico` sempre valorizzato: l\'errore di ragionamento dietro il distrattore principale.',
            '', 'REGOLE DI QUALITÀ (il controllo automatico le verifica)',
            ' Q-A. La risposta corretta va SEMPRE in `opzioni[0]`: la posizione la sceglie l\'app.',
            ' Q-B. La corretta NON deve essere la più lunga: scrivila breve e allunga i distrattori.',
            ' Q-C. Distrattori plausibili, ognuno nato da un errore preciso; il testo della corretta non deve stare dentro un distrattore. Mai «tutte/nessuna delle precedenti».',
            ' Q-D. Nessun duplicato o quasi-duplicato, né nello step né rispetto a ciò che esiste già. Stile = appello vero.',
            ' ' + regolaArchetipo(arch, mat),
            ' Q-F. Italiano corretto; pedici/apici come `_{2}` e `^{2}`; risultati numerici semplici con unità SI.',
            calcoli,
            '', 'CAMPO `spiegazione` (lunga e completa, almeno un paragrafo pieno; nei calcoli tutti i passaggi), con queste etichette ESATTE in maiuscolo:',
            ' COSA CHIEDE: … CONCETTO E MECCANISMO: … RISPOSTA ESATTA: A) «testo» … PERCHÉ GLI ALTRI NO: B) … C) … D) … IN SINTESI: … [[Manuale, p. X]]',
            ' Scrivi le lettere come se la corretta fosse A (cioè `opzioni[0]`): l\'app le riscrive dopo aver mescolato. La citazione [[…]] è uguale a `fonte`.',
            ' VIETATO «p. da verificare» o pagine inventate: se non hai letto la pagina, «BLOCCO: …» e non consegnare quella scheda.'];
    }
    const ESEMPIO = '{"scheda":"S01","categoria":"prioritaria","livello":1,"tipoItem":"richiamo_attivo_…","erroreTipico":"Scambiare … con …",' +
        '"domanda":"…?","opzioni":["risposta corretta, non la più lunga","distrattore plausibile e dettagliato","distrattore plausibile e dettagliato","distrattore plausibile e dettagliato"],' +
        '"spiegazione":"COSA CHIEDE: … CONCETTO E MECCANISMO: … RISPOSTA ESATTA: A) «…». PERCHÉ GLI ALTRI NO: B) … C) … D) … IN SINTESI: … [[Manuale, p. X]]",' +
        '"spiegazioneDistrattori":["perché B è sbagliata …","perché C è sbagliata …","perché D è sbagliata …"],"distractorTypes":["confusione_…","inversione_…","caso_limite_…"],"fonte":"[[Manuale, p. X]]"}';
    const AUTOVERIFICA = [' [ ] Livelli nell\'ordine della sequenza; la corretta in opzioni[0], breve, non contenuta in un distrattore.',
        ' [ ] Ogni spiegazione ha le 5 etichette, è completa, ha RISPOSTA ESATTA: A) e la citazione [[…]] uguale a `fonte`.',
        ' [ ] JSON valido: doppi apici, nessuna virgola finale; nessuna pagina «da verificare».'];
    function costruisci(o) {
        const { mat, ms, cod, step, pref, ud, arch } = base(o), [smin, smax] = RANGE_SCHEDE[o.intensita || 'standard'];
        const pm = o.perMessaggio === 1 ? 1 : 2, nx = prossimo(o.idEsistenti || [], pref);
        const blocchi = smax <= 14 ? '2–3' : '3–4', durata = smax <= 14 ? '~95–140' : '~185–190';
        const S = [];
        const sez = (t) => sezione(S, t);
        S.push('REGOLA ZERO — UNICO OUTPUT CONSENTITO (prevale su tutto)', 'Il TUO UNICO PRODOTTO sono blocchi ```json scritti qui in chat: le SCHEDE DI QUIZ e, alla fine dello step, il blocco di CHIUSURA (sotto-schede BRAC, ripassi, righe calendario). L\'app ricostruisce tutto da sola quando il file viene importato.', 'NON PRODURRE MAI: teoria, riassunti, dispense, mappe, formulari, file (.docx/.pdf/.html…), mini-app. Se stai per scriverne, fermati e torna alle schede.', 'Prima risposta: esegui subito la Fase 1 (tabella + righe calendario) e poi la prima consegna di schede, senza introduzioni.');
        S.push('', 'RUOLO', RUOLO, registro(o.tono || 'tecnico_accademico'));
        sez('TARGET (già compilato dall\'app)');
        S.push(rigaMateria(o), ' - Step: ' + step + (o.titolo ? ' «' + o.titolo + '»' : '') + ' · unità ' + ud + ' · data: ' + (o.data || 'da definire') + '.', ' - Schede: ' + smin + '–' + smax + ' (1 scheda = 18 domande) raggruppate in ' + blocchi + ' sotto-schede BRAC da 45–50 min (' + durata + ' min in tutto).', ' - Prima scheda: S' + String(nx.scheda).padStart(2, '0') + (nx.primo > 1 ? ' (le schede precedenti esistono già: non riscriverle)' : '') + '.');
        S.push(...righeStudente(o, true));
        sez('COMPATIBILITÀ CON L\'APP — COSA FA L\'APP DEI TUOI QUIZ');
        S.push(...COMPATIBILITA);
        sez('FASE 0 — ALLINEAMENTO (a ogni nuova chat)');
        S.push(...fonti(o, 'Leggi sul Drive collegato, in quest\'ordine:'));
        sez('FASE 1 — ANALISI AUTONOMA DELLO STEP (senza chiedere approvazione)');
        S.push(' P1. Analizza l\'argomento da syllabus, libro, slide e appelli.', ' P2. Stabilisci i MICROSTEP (' + step + '.1, ' + step + '.2, …) che coprono tutto lo step senza sovrapposizioni e senza duplicare ciò che esiste già.', ' P3. Per OGNI microstep decidi quante schede servono in base ai suoi ambiti: numero NON uniforme, minimo 2, 3–4 se ha molti ambiti.');
        if (conCalcoli(arch, mat))
            S.push(' P4. Dove compare una formula, un rapporto o un calcolo: schede dedicate «Problemi su …» OLTRE a quelle teoriche.');
        S.push(' P5. Verifica la copertura di ogni microstep e riempi i buchi.', ' P6. Dividi le schede in PRIORITARIE (~70%) e RAFFINAMENTO (~30%).', ' Soglia obbligatoria: ' + smin + '–' + smax + ' schede in tutto. Raggruppa i microstep in ' + blocchi + ' SOTTOSCHEDE = blocchi BRAC da 45–50 min.', ' Output della Fase 1 (primo messaggio, poi procedi): a) righe calendario `' + cod + '|' + ud + '|ARGOMENTO|N|' + step + '|' + (o.data || 'da definire') + '`; b) tabella microstep → n. schede → prioritarie/raffinamento → pagine del libro → sotto-scheda; c) totale schede e domande.');
        sez('FASE 2 — GENERAZIONE A SCHEDE');
        S.push(...regoleScheda(o, ' Q-G. Ogni calcolo deve tornare: ricalcola e verifica l\'ordine di grandezza prima di consegnare.'));
        sez('FASE 3 — CONSEGNA (niente troncamenti)');
        S.push(' - Un messaggio = ' + (pm === 2 ? '2 schede (36 domande); se il limite di output tronca il JSON, scendi a 1 scheda' : '1 scheda (18 domande)') + '. MAI accorciare spiegazioni o ridurre domande.', ' - Formato di ogni messaggio:', '   1. `STEP ' + ms + ' ' + step + ' · SCHEDA <n>' + (pm === 2 ? ' e <n+1>' : '') + ' di <N> · microstep <x.y.z>`', '   2. UN SOLO blocco ```json valido (doppi apici, zero virgole finali, nessun commento): { "formato": "quiz-v3", "parte": "' + pref + '-s<n>' + (pm === 2 ? '-<n+1>' : '') + '", "quiz": [ … ] } con `"scheda": "S<n>"` e `"categoria": "prioritaria"|"raffinamento"` in ogni domanda', '      Campi di ogni domanda: ' + CHIAVI_V3.join(', ') + ' (gemella solo se fa parte di una coppia).', '      livello = NUMERO 1–4 dalla sequenza; spiegazioneDistrattori e distractorTypes = 3 stringhe ciascuno, per opzioni[1], [2], [3].', '   3. `STATO: schede consegnate X/N — prossimo: <microstep>. Scrivi "avanti".`', ' - Dopo «avanti» consegni le schede successive: niente riassunti né conferme.', ' - Ultimo messaggio dello step: blocco ```json di CHIUSURA:', '   { "meta": { "schemaVersion": 2, "materia": "' + mat + '", "codiceMateria": "' + cod + '", "unita": "' + ud + '", "stepId": "' + pref + '", "sottoStep": "' + step + '", "titolo": "…", "archetipo": "' + arch + '", "fonti": [ … ] },', '     "programmaCalendario": { "formatoGeneraMjs": [ "' + cod + '|' + ud + '|…|N|' + step + '|…" ], "pianoStrutturato": { "materiaCodice": "' + cod + '", "step": "' + step + '", "origine": "ai_neuro", "durataTotaleMin": N, "blocchiBRAC": N,', '       "sottoSchede": [ { "codice": "' + step + '.<k>", "titolo": "…", "microstep": ["…"], "durataMin": 45|50, "wakefulRestMin": 12, "schedePrioritarie": ["' + pref + '-S01"], "schedeRaffinamento": ["…"], "fonte": "[[Manuale, pp. …]]" } ],', '       "ancoraggiRipassoFSRS": [ { "intervallo": "+1g", "target": [ID scheda], "livello": "L3" }, { "intervallo": "+3g", "target": [ID scheda], "livello": "L3-L4" }, { "intervallo": "+7g", "target": [ID scheda], "livello": "Raffinamento" } ] } } }', '   Ogni scheda compare in esattamente una sotto-scheda. Il file si chiama `' + ms + '_' + step.replace(/\./g, '_') + '_quiz_e_calendario.json` e va nella cartella «' + mat + ' quiz».');
        if (o.tabella) {
            S.push('');
            S.push(o.tabella);
        }
        if (o.gem)
            S.push('', 'Se le istruzioni del Gem chiedono id, esatta o conteggi (regole vecchie), valgono QUESTE: formato quiz-v3, giusta in opzioni[0].');
        sez('ESEMPIO DI FORMATO (non copiarne il contenuto: imita struttura e livello di dettaglio)');
        S.push(ESEMPIO);
        sez('AUTOVERIFICA PRIMA DI OGNI CONSEGNA');
        S.push(...AUTOVERIFICA, 'Non contare e non riepilogare: i conteggi e i controlli li fa l\'app. Parti ora dalla FASE 0.');
        return S.join('\n');
    }
    function costruisciPiano(o) {
        const { mat, step, arch } = base(o), [smin, smax] = RANGE_SCHEDE[o.intensita || 'standard'];
        const blocchi = smax <= 14 ? '2–3' : '3–4';
        const S = [];
        S.push('REGOLA ZERO — UNICO OUTPUT CONSENTITO (prevale su tutto)', 'Il TUO UNICO PRODOTTO è il PIANO dello step: UN SOLO blocco ```json in formato piano-v1 (oppure le righe @B / COPRE descritte sotto). Niente domande in questo messaggio: le schede le chiederà l\'app dopo, una alla volta.', 'NON PRODURRE MAI: teoria, riassunti, tabelle di ore, date, righe di calendario, file. Rispondi subito con il piano, senza introduzioni.');
        S.push('', 'RUOLO', RUOLO);
        sezione(S, 'TARGET (già compilato dall\'app)');
        S.push(rigaMateria(o), ' - Step: ' + step + (o.titolo ? ' «' + o.titolo + '»' : '') + '.', ' - Schede: ' + smin + '–' + smax + ' in tutto (1 scheda = 18 domande, scritte dopo), raggruppate in ' + blocchi + ' blocchi di studio da 45–50 min.');
        S.push(...righeStudente(o));
        sezione(S, 'FASE 0 — ALLINEAMENTO');
        S.push(...fonti(o, 'Leggi sul Drive collegato, in quest\'ordine:'));
        sezione(S, 'FASE 1 — PIANO DELLO STEP (senza chiedere approvazione)');
        S.push(' P1. Analizza l\'argomento da syllabus, libro, slide e appelli.', ' P2. Stabilisci i MICROSTEP (' + step + '.1, ' + step + '.2, …) che coprono tutto lo step senza sovrapposizioni e senza duplicare ciò che esiste già.', ' P3. Per OGNI microstep decidi quante schede servono in base ai suoi ambiti: numero NON uniforme, minimo 2, 3–4 se ha molti ambiti.');
        if (conCalcoli(arch, mat))
            S.push(' P4. Dove compare una formula, un rapporto o un calcolo: schede dedicate «Problemi su …» OLTRE a quelle teoriche.');
        S.push(' P5. Verifica la copertura di ogni microstep e riempi i buchi.', ' P6. Circa il 70% delle schede sono PRIORITARIE, il 30% di RAFFINAMENTO: metti quelle di raffinamento in un blocco a parte il cui titolo inizia con «Raffinamento».', ' P7. Raggruppa le schede in ' + blocchi + ' BLOCCHI da 45–50 min; numera le schede S1, S2, … nell\'ordine di studio (l\'app controlla e sistema la numerazione).');
        sezione(S, 'FORMATO DEL PIANO');
        S.push('JSON (preferito):', '{ "formato": "piano-v1", "blocchi": [ { "codice": "' + step + '", "titolo": "<argomento del blocco>", "copre": [ { "schede": ["S1", "S2"], "micro": ["' + step + '.1"] }, { "schede": ["S3"], "micro": ["' + step + '.2", "' + step + '.3"] } ] },', '  { "codice": "' + step + '", "titolo": "Raffinamento – <argomento>", "copre": [ { "schede": ["S9"], "micro": ["' + step + '.1"] } ] } ] }', 'Oppure a righe (una riga @B per blocco, una COPRE per gruppo di schede):', '@B ' + step + ' | <argomento del blocco>', 'COPRE S1 S2 | ' + step + '.1', 'COPRE S3 | ' + step + '.2 ' + step + '.3', ' - Ogni scheda copre un solo microstep principale (il primo elencato) e compare una sola volta.', ' - Durata, ripassi, date e file finale li calcola l\'app dal piano: non scriverli.');
        return S.join('\n');
    }
    function costruisciSchede(o, schede, pagine) {
        const { ms, step, pref } = base(o), l = schede.slice().sort((a, b) => a.n - b.n);
        const pag = (x) => {
            const p = pagine && pagine[x.micro[0]];
            if (!p)
                return '';
            const pdf = p.pdfDa !== null ? ' (PDF ' + p.pdfDa + (p.pdfA !== null ? '–' + p.pdfA : ' in poi') + ')' : '';
            return ' · ' + (p.stampA !== null ? 'pagine ' + p.stampDa + '–' + p.stampA : 'pagine dalla ' + p.stampDa) + ' del libro' + pdf;
        };
        const conPagine = l.some(x => pag(x));
        const da = l.length ? l[0].n : 1, a = l.length ? l[l.length - 1].n : da;
        const parte = pref + '-s' + da + (a !== da ? '-' + a : ''), sigla = (x) => x.sigla || 'S' + String(x.n).padStart(2, '0');
        const S = [];
        S.push('REGOLA ZERO — UNICO OUTPUT CONSENTITO (prevale su tutto)', 'Il TUO UNICO PRODOTTO è UN SOLO blocco ```json con le SCHEDE DI QUIZ elencate qui sotto, e nient\'altro: niente piano, niente riepiloghi, niente file.', 'NON PRODURRE MAI: teoria, riassunti, dispense, mappe, formulari, file (.docx/.pdf/.html…), mini-app.');
        S.push('', 'RUOLO', RUOLO, registro(o.tono || 'tecnico_accademico'));
        sezione(S, 'TARGET (già compilato dall\'app)');
        S.push(rigaMateria(o), ' - Step: ' + step + (o.titolo ? ' «' + o.titolo + '»' : '') + '.', ' - Schede da scrivere ora (' + l.length + ' × 18 domande):', ...l.map(x => '   • ' + sigla(x) + ' · microstep ' + x.micro.join(', ') + ' · ' + x.categoria + (x.blocco ? ' · blocco «' + x.blocco + '»' : '') + pag(x)));
        if (conPagine)
            S.push(' - Cita solo le pagine indicate per la scheda (numero stampato del libro); il PDF serve a trovarle.');
        S.push(...righeStudente(o));
        sezione(S, 'COMPATIBILITÀ CON L\'APP — COSA FA L\'APP DEI TUOI QUIZ');
        S.push(...COMPATIBILITA);
        sezione(S, 'FONTI');
        S.push(...fonti(o, 'Usa solo il materiale dello step, in quest\'ordine:'));
        sezione(S, 'FASE 2 — GENERAZIONE DELLE SCHEDE');
        S.push(...regoleScheda(o, ' Q-G. Ogni calcolo deve tornare: verifica risultato e ordine di grandezza prima di consegnare.'));
        sezione(S, 'CONSEGNA');
        S.push(' - Prima riga: `STEP ' + ms + ' ' + step + ' · ' + l.map(sigla).join(' e ') + '`.', ' - Poi UN SOLO blocco ```json valido (doppi apici, zero virgole finali, nessun commento):', '   { "formato": "quiz-v3", "parte": "' + parte + '", "quiz": [ … ] }', '   Ogni domanda ha `"scheda"` (' + l.map(x => '"' + sigla(x) + '"').join(' o ') + ') e `"categoria"` come nell\'elenco sopra.', '   Campi di ogni domanda: ' + CHIAVI_V3.join(', ') + ' (gemella solo se fa parte di una coppia).', '   livello = NUMERO 1–4 dalla sequenza; spiegazioneDistrattori e distractorTypes = 3 stringhe ciascuno, per opzioni[1], [2], [3].', ' - MAI accorciare spiegazioni o ridurre domande. Se il limite di output ti ferma, fermati dopo una domanda completa: l\'app ti chiederà il resto.');
        if (o.gem)
            S.push('', 'Se le istruzioni del Gem chiedono id, esatta o conteggi (regole vecchie), valgono QUESTE: formato quiz-v3, giusta in opzioni[0].');
        sezione(S, 'ESEMPIO DI FORMATO (non copiarne il contenuto: imita struttura e livello di dettaglio)');
        S.push(ESEMPIO);
        sezione(S, 'AUTOVERIFICA PRIMA DI CONSEGNARE');
        S.push(...AUTOVERIFICA, 'Numeri, posizioni e controlli li fa l\'app: non riepilogare. Parti ora con ' + sigla(l[0] || { n: 1, micro: [], categoria: 'prioritaria' }) + '.');
        return S.join('\n');
    }
    return { paginaLeggibile, indiceLettura, pagineCampione, segmentoDa, nomeLibro, numeroStampato, stimaOffset, slug, prossimo, RANGE_SCHEDE, SEQUENZA_LIVELLI, CHIAVI_V3, regolaArchetipo, costruisci, costruisciPiano, costruisciSchede };
})();

const StrumentiQuiz = (() => {
    const K_CENTRO_ESCLUSI = 'imc-centro-esclusi', ESCLUSI_BASE = ['Testbusters', 'Alpha Test', 'Editest'];
    function esclusi() {
        try {
            const x = JSON.parse(localStorage.getItem(K_CENTRO_ESCLUSI) || 'null');
            return Array.isArray(x) ? x.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()) : ESCLUSI_BASE.slice();
        }
        catch (e) {
            console.warn('[centro] lista esclusi illeggibile', e);
            return ESCLUSI_BASE.slice();
        }
    }
    function salvaEsclusi(xs) {
        try {
            if (xs)
                localStorage.setItem(K_CENTRO_ESCLUSI, JSON.stringify([...new Set(xs.map(v => v.trim()).filter(Boolean))].slice(0, 50)));
            else
                localStorage.removeItem(K_CENTRO_ESCLUSI);
        }
        catch (e) {
            console.warn('[centro] lista esclusi non salvata', e);
        }
    }
    const reNome = (v) => new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, ' ?'), 'i');
    const vietato = (n) => /\bTB\b|TB\.pdf/i.test(n) || esclusi().some(v => reNome(v).test(n));
    const RE_GUIDE = /syllabus|programma|appell|esame|prova|simulazion/i;
    const RE_SLIDE = /slide|lezion|dispens|presentaz/i;
    const RE_INDICE = /indice|sommario|toc\b/i;
    async function copia(t, ta) {
        try {
            await navigator.clipboard.writeText(t);
            avviso('Copiato: incollalo in Gemini.');
        }
        catch (_) {
            if (ta) {
                ta.focus();
                ta.select();
            }
            avviso('Appunti non disponibili: seleziona e copia dal riquadro.', 5000);
        }
    }
    function scarica(nome, testo, tipo) {
        const a = h('a', { href: URL.createObjectURL(new Blob([testo], { type: tipo })), download: nome });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    const area = (etichetta, righe, sola = false) => h('textarea', { rows: righe, 'aria-label': etichetta, readonly: sola || undefined, spellcheck: 'false' });
    const casella = (etichetta, val = false) => {
        const c = h('input', { type: 'checkbox', checked: val || undefined });
        return { c, el: h('label.riga-tra', null, etichetta, c) };
    };
    const SEGNO = { err: '⛔', warn: '⚠️', info: 'ℹ️' };
    function diagnostica(testoIniziale) {
        let qs = [], parte = '', analisi = null, autoSospese = 0;
        const ta = area('JSON dei quiz da controllare (anche la chat intera)', 8);
        if (testoIniziale)
            ta.value = testoIniziale;
        const file = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', 'aria-label': 'Carica un file .json di quiz' });
        file.addEventListener('change', async () => { const f = file.files && file.files[0]; if (!f)
            return; ta.value = await f.text(); controlla(); });
        const rapporto = h('div', { role: 'status', 'aria-live': 'polite' });
        const registro = h('ul.piccolo.tenue');
        const correzione = h('div');
        const gem = casella('Ho un Gem con le «Regole per il Gem»'), perche = casella('Chiedi anche il perché di ogni patch');
        const outCorr = area('Prompt di correzione da copiare in Gemini', 8, true);
        const avvisiCorr = h('ul.piccolo');
        const patch = area('Risposta di Gemini (patch JSON) da applicare', 6);
        function controlla() {
            const L = DiagnosiQuiz.leggi(ta.value);
            rapporto.textContent = '';
            registro.textContent = '';
            if (!L.quiz.length) {
                rapporto.appendChild(h('p', null, '⛔ ' + (L.errori[0] || 'Nessuna domanda trovata: incolla il blocco ```json con «quiz».')));
                analisi = null;
                return;
            }
            qs = L.quiz;
            parte = L.parti[0] || parte;
            if (L.riparato)
                registro.appendChild(h('li', null, '🔧 Virgole finali rimosse per leggere il JSON (salva il JSON corretto qui sotto).'));
            if (L.blocchi > 1)
                registro.appendChild(h('li', null, 'Letti ' + L.blocchi + ' blocchi ```json dalla chat.'));
            L.errori.forEach(e => registro.appendChild(h('li', null, '⚠️ ' + e)));
            analisi = DiagnosiQuiz.analizza(qs);
            autoSospese = DiagnosiQuiz.autoFix(qs).log.length;
            disegnaRapporto(analisi);
        }
        function disegnaRapporto(A) {
            const err = A.problemi.filter(p => p.sev === 'err'), warn = A.problemi.filter(p => p.sev === 'warn'), info = A.problemi.filter(p => p.sev === 'info');
            const pct = (x) => A.n ? Math.round(100 * x / A.n) + '%' : '0%';
            rapporto.appendChild(h('p', null, h('b', null, (err.length ? '⛔ ' : warn.length ? '⚠️ ' : '✅ ') + A.n + ' domande · ' + A.pronte + ' pronte per l\'import'), ' · ' + err.length + ' errori · ' + warn.length + ' avvisi'));
            rapporto.appendChild(h('p.piccolo', null, 'Livelli L1–L4: ' + A.lv.map(pct).join(' / ') + ' (obiettivo 25/35/25/15) · posizioni A–D: ' + A.es.map(pct).join(' / ') +
                ' · corretta più lunga: ' + pct(A.lunga) + ' · coppie gemelle: ' + A.gemelle));
            if (A.schede.length)
                rapporto.appendChild(h('div.scorre', null, h('table.piccolo', { 'aria-label': 'Composizione per scheda' }, h('thead', null, h('tr', null, ...['Scheda', 'N', 'L1', 'L2', 'L3', 'L4', 'A', 'B', 'C', 'D'].map(t => h('th', { scope: 'col' }, t)))), h('tbody', null, ...A.schede.map(s => h('tr', null, h('th', { scope: 'row' }, s.nome), h('td', null, (s.n === DiagnosiQuiz.PER_SCHEDA ? '' : '⚠️') + s.n), ...s.lv.map(x => h('td', null, String(x))), ...s.es.map(x => h('td', null, String(x)))))))));
            const gruppo = (titolo, xs, aperto) => xs.length ? h('details', { open: aperto || undefined }, h('summary', null, titolo + ' (' + xs.length + ')'), h('ul.piccolo', null, ...xs.slice(0, 150).map(p => {
                const [fix, why] = DiagnosiQuiz.consiglio(p.msg);
                return h('li', null, SEGNO[p.sev] + ' ', h('b', null, p.id), ' — ' + p.msg, fix ? h('div.tenue', null, '→ ' + fix + (why ? ' (' + why + ')' : '')) : null);
            }), xs.length > 150 ? h('li.tenue', null, '…e altri ' + (xs.length - 150)) : null)) : null;
            const g1 = gruppo('Errori bloccanti', err, true), g2 = gruppo('Avvisi', warn, !err.length), g3 = gruppo('Note', info, false);
            [g1, g2, g3].forEach(g => { if (g)
                rapporto.appendChild(g); });
            if (autoSospese)
                rapporto.appendChild(h('p.piccolo', null, '🔧 ' + autoSospese + ' problemi si riparano da soli: premi «Ripara automaticamente».'));
        }
        function ripara() {
            if (!qs.length)
                controlla();
            if (!qs.length)
                return;
            const r = DiagnosiQuiz.autoFix(qs);
            qs = r.qs;
            ta.value = DiagnosiQuiz.jsonFinale(qs, parte);
            rapporto.textContent = '';
            analisi = DiagnosiQuiz.analizza(qs);
            autoSospese = 0;
            disegnaRapporto(analisi);
            registro.textContent = '';
            (r.log.length ? r.log : ['Niente da riparare in automatico.']).slice(0, 60).forEach(x => registro.appendChild(h('li', null, '🔧 ' + x)));
        }
        function preparaCorrezione() {
            if (!analisi)
                controlla();
            if (!analisi)
                return;
            const r = DiagnosiQuiz.promptCorrezione(qs, analisi.problemi, { gem: gem.c.checked, perche: perche.c.checked });
            outCorr.value = r.nDomande ? r.testo : '';
            avvisiCorr.textContent = '';
            if (!r.nDomande)
                avvisiCorr.appendChild(h('li', null, '✅ Nessuna domanda da correggere con le patch.'));
            DiagnosiQuiz.avvisiUso({ gem: gem.c.checked, autoInSospeso: autoSospese, manuali: r.manuali, globali: r.globali })
                .forEach(a => avvisiCorr.appendChild(h('li', null, SEGNO[a.sev] + ' ', h('b', null, a.t + ': '), a.x)));
        }
        function applica() {
            if (!qs.length)
                controlla();
            if (!qs.length)
                return;
            const p = DiagnosiQuiz.leggiPatch(patch.value);
            if ('errore' in p) {
                avviso('⚠️ ' + p.errore, 6000);
                return;
            }
            const r = DiagnosiQuiz.applicaPatch(qs, p.patch);
            qs = r.qs;
            ta.value = DiagnosiQuiz.jsonFinale(qs, parte);
            patch.value = '';
            rapporto.textContent = '';
            analisi = DiagnosiQuiz.analizza(qs);
            autoSospese = DiagnosiQuiz.autoFix(qs).log.length;
            disegnaRapporto(analisi);
            registro.textContent = '';
            registro.appendChild(h('li', null, '🩹 ' + r.n + ' patch applicate' + (r.mancanti.length ? ' · ID non trovati: ' + r.mancanti.join(', ') : '') + '.'));
            r.log.slice(0, 40).forEach(x => registro.appendChild(h('li', null, x)));
        }
        correzione.append(gem.el, perche.el, h('button.btn.neutro', { type: 'button', onclick: preparaCorrezione }, '✍️ Prepara il prompt di correzione'), outCorr, h('div.chips', null, h('button.chip', { type: 'button', onclick: () => { if (outCorr.value)
                copia(outCorr.value, outCorr); } }, '📋 Copia prompt')), avvisiCorr, h('p.piccolo.tenue', null, 'Incolla qui sotto SOLO il blocco di codice che risponde Gemini:'), patch, h('button.btn.neutro', { type: 'button', onclick: applica }, '🩹 Applica la risposta'));
        const pref = h('input', { type: 'text', placeholder: 'biologia-3.3', 'aria-label': 'Prefisso ID (materia-step)' });
        const primo = h('input', { type: 'number', min: 1, value: 1, 'aria-label': 'Numero della prima domanda' });
        const quante = h('input', { type: 'number', min: 1, max: 200, value: 18, 'aria-label': 'Quante domande' });
        const outTab = area('Tabella di assegnazione', 6, true);
        const regole = area('Regole per il Gem', 6, true);
        regole.value = DiagnosiQuiz.REGOLE_GEM;
        const piano = h('details', null, h('summary', null, '🎲 Tabella di assegnazione e regole per il Gem'), h('p.piccolo.tenue', null, 'Decide prima livello e posizione della risposta esatta di ogni domanda: incollala nel prompt e Gemini non sbilancia più A–D e L1–L4.'), h('div.chips', null, pref, primo, quante, h('button.chip', { type: 'button', onclick: () => {
                const p = pref.value.trim() || 'materia-1.1', n = Math.max(1, Math.min(200, Number(quante.value) || 18));
                outTab.value = DiagnosiQuiz.tabella(p, Math.max(1, Number(primo.value) || 1), DiagnosiQuiz.piano(n));
            } }, 'Genera')), outTab, h('div.chips', null, h('button.chip', { type: 'button', onclick: () => { if (outTab.value)
                copia(outTab.value, outTab); } }, '📋 Copia tabella')), regole, h('div.chips', null, h('button.chip', { type: 'button', onclick: () => copia(regole.value, regole) }, '📋 Copia regole Gem')));
        const corpo = h('div', null, h('p.piccolo.tenue', null, 'Incolla il JSON dei quiz (o l\'intera risposta di Gemini) oppure carica il file. Il controllo è locale: zero token.'), ta, file, h('div.chips', null, h('button.btn', { type: 'button', onclick: controlla }, '🩺 Controlla'), h('button.btn.neutro', { type: 'button', onclick: ripara }, '🔧 Ripara automaticamente')), rapporto, registro, h('details', null, h('summary', null, '✍️ Correzione chirurgica con Gemini (solo patch)'), correzione), piano, h('div.chips', null, h('button.chip', { type: 'button', onclick: () => { if (qs.length)
                copia(DiagnosiQuiz.jsonFinale(qs, parte), ta); } }, '📋 Copia JSON'), h('button.chip', { type: 'button', onclick: () => { if (qs.length)
                scarica((parte || 'quiz') + '.json', DiagnosiQuiz.jsonFinale(qs, parte), 'application/json'); } }, '💾 Scarica .json')), h('p.piccolo.tenue', null, 'Poi metti il .json nella cartella «<materia> quiz» del tuo Drive e usa «📥 Importa quiz da Drive».'));
        foglio({ titolo: '🩺 Diagnostica quiz', corpo });
        if (testoIniziale)
            controlla();
    }
    async function misuraPdf(dati, avanza) {
        const L = await caricaPdfJs();
        const doc = await L.getDocument({ data: new Uint8Array(await dati.arrayBuffer()), isEvalSupported: false }).promise;
        try {
            const tot = doc.numPages, campione = new Set(MasterPrompt.pagineCampione(tot));
            let et = null;
            try {
                et = await doc.getPageLabels();
            }
            catch (e) {
                console.warn('[misura] etichette pagine', e);
            }
            const conEtichette = !!(et && MappaPagine.daEtichette(et));
            const testi = [], numeri = [];
            for (let i = 1; i <= tot; i++) {
                if (conEtichette && !campione.has(i))
                    continue;
                if (avanza && !conEtichette && i % 20 === 0)
                    avanza('Leggo i numeri di pagina: ' + i + '/' + tot + '…');
                const tc = await (await doc.getPage(i)).getTextContent();
                const t = tc.items.map(x => (x.str || '') + (x.hasEOL ? '\n' : ' ')).join('');
                if (campione.has(i))
                    testi.push(t);
                numeri[i - 1] = conEtichette ? [] : MasterPrompt.numeroStampato(t);
            }
            return { lettura: MasterPrompt.indiceLettura(testi), mappa: Centro.mappaAuto(et, numeri), pagine: tot };
        }
        finally {
            if (typeof doc.destroy === 'function')
                await doc.destroy();
        }
    }
    async function misura(g, avanza) {
        let lettura = null;
        const segmenti = [];
        for (const [k, f] of g.files.entries()) {
            const pre = g.files.length > 1 ? 'PDF ' + (k + 1) + '/' + g.files.length + ': ' : '';
            avanza(pre + (f.file ? 'leggo il file…' : 'scarico da Drive…'));
            const r = await misuraPdf(f.file || await Drive.scaricaBlob(f.id), m => avanza(pre + m));
            if (!lettura || r.lettura.pct < lettura.pct)
                lettura = r.lettura;
            segmenti.push({ mappa: r.mappa, base: g.libro.segmenti ? (MasterPrompt.segmentoDa(f.name) || 1) - 1 : 0 });
        }
        return { lettura, mappa: Centro.unisciSegmenti(segmenti) };
    }
    const K_ESCLUSE = 'imc-dossier-escluse';
    function escluseLette() {
        try {
            const x = JSON.parse(localStorage.getItem(K_ESCLUSE) || '[]');
            return Array.isArray(x) ? x.filter(v => typeof v === 'string') : [];
        }
        catch (e) {
            console.warn('[dossier] voci escluse illeggibili', e);
            return [];
        }
    }
    function escluseSalva(xs) {
        try {
            localStorage.setItem(K_ESCLUSE, JSON.stringify(xs.slice(-200)));
        }
        catch (e) {
            console.warn('[dossier] voci escluse non salvate', e);
        }
    }
    const LV_NUM = { Sbarramento: 1, Completamento: 1, Applicativo: 2, Trabocchetto: 3, Problema: 4 };
    function datiDossier(nome, codice) {
        const ms = MasterPrompt.slug(nome), cod = codice.toLowerCase();
        const testi = new Map();
        for (const b of Stato.tutti('bancaimc'))
            for (const d of b.domande || [])
                if (d && d.id)
                    testi.set(d.id, d);
        for (const q of Stato.tutti('qcreato'))
            for (const d of q.domande || [])
                if (d && d.id)
                    testi.set(d.id, d);
        const stat = [];
        for (const s of Stato.tutti('statq')) {
            const sk = String(s.sk || '').toLowerCase();
            if (!sk || !(sk.includes(ms) || sk.startsWith(cod + '-')))
                continue;
            const qid = s.id.replace(/^sq-/, ''), d = testi.get(qid), nr = s.neuro;
            stat.push({ qid, sk: s.sk, n: s.n || 0, ok: s.ok || 0, scelte: s.scelte, testo: d ? d.q : undefined,
                caso: nr && nr.ultimoCaso, tag: nr && nr.tag, ease: nr && nr.ease, reps: nr && nr.reps,
                livello: d ? (d.bloomLevel || LV_NUM[d.lv]) : undefined,
                log: (s.confidenceLog || []).map(t => ({ ts: t.ts, corretto: t.corretto, certezza: t.livelloCertezza, ms: t.tempoRispostaMs })) });
        }
        const oggiY = ymd(new Date()), t0 = Date.parse(oggiY + 'T00:00:00');
        const esami = Stato.tutti('esame').filter(e => e.data >= oggiY && (!e.materie || !e.materie.length || e.materie.includes(codice))).sort((a, b) => a.data < b.data ? -1 : 1);
        const giorniEsame = esami.length ? Math.round((Date.parse(esami[0].data + 'T00:00:00') - t0) / 86400000) : null;
        const da = ymd(new Date(t0 - 14 * 86400000)), perG = new Map();
        for (const s of Stato.tutti('sessione'))
            if (s.m === codice && s.data >= da && s.data <= oggiY)
                perG.set(s.data, (perG.get(s.data) || 0) + (s.minuti || 0));
        const minutiGiorno = perG.size ? [...perG.values()].reduce((a, b) => a + b, 0) / perG.size : null;
        return { stat, giorniEsame, minutiGiorno };
    }
    function idGiaUsati() {
        const out = [];
        for (const b of Stato.tutti('bancaimc'))
            for (const d of b.domande || [])
                if (d && d.id)
                    out.push(d.id);
        return out;
    }
    function classifica(fs) {
        const altri = { slide: [], guide: [], quiz: [], vietati: [], indici: [] };
        const libri = new Map();
        for (const f of fs) {
            const n = f.name, pdf = /\.pdf$/i.test(n) || f.mimeType === 'application/pdf';
            if (vietato(n))
                altri.vietati.push(f);
            else if (/\.json$/i.test(n) || /quiz/i.test(n))
                altri.quiz.push(f);
            else if (RE_INDICE.test(n))
                altri.indici.push(f);
            else if (RE_GUIDE.test(n))
                altri.guide.push(f);
            else if (RE_SLIDE.test(n) || /presentation|powerpoint/i.test(f.mimeType))
                altri.slide.push(f);
            else if (pdf) {
                const k = MasterPrompt.nomeLibro(n);
                libri.set(k, (libri.get(k) || []).concat(f));
            }
            else
                altri.slide.push(f);
        }
        return { libri, altri };
    }
    function raccoltaFonti(nomeMateria, iniziali) {
        const stato = h('p.piccolo.tenue', { role: 'status', 'aria-live': 'polite' });
        const elenco = h('div');
        let gruppi = [];
        let altri = classifica([]).altri;
        const scelti = new Set();
        const incollate = area('Fonti senza Drive: un nome di file per riga (libro, syllabus, slide…)', 3);
        if (iniziali)
            incollate.value = [...iniziali.libri.flatMap(l => l.pdf), ...iniziali.guide, ...iniziali.slide, ...iniziali.indici, ...iniziali.quiz].join('\n');
        const daFile = h('input', { type: 'file', multiple: true, 'aria-label': 'Scegli i file delle fonti dal dispositivo (si usa solo il nome)' });
        daFile.addEventListener('change', () => {
            const nomi = Array.from(daFile.files || []).map(f => f.name), gia = new Set(incollate.value.split('\n').map(x => x.trim()).filter(Boolean));
            incollate.value = [...gia, ...nomi.filter(n => !gia.has(n))].join('\n');
            daFile.value = '';
        });
        async function cercaDrive() {
            if (serveGoogle())
                return;
            const nome = nomeMateria();
            if (!nome) {
                avviso('Scegli o scrivi la materia.');
                return;
            }
            stato.textContent = 'Cerco su Drive…';
            elenco.textContent = '';
            const visti = new Map();
            const aggiungi = (fs) => fs.forEach(f => { if (f.mimeType !== 'application/vnd.google-apps.folder' && !visti.has(f.id))
                visti.set(f.id, f); });
            try {
                aggiungi(await Drive.cerca(nome));
                for (const c of (await Drive.cercaCartelle(nome)).slice(0, 6))
                    aggiungi((await Drive.elencaCompleti(c.id)).slice(0, 200));
                for (const t of ['syllabus', 'programma', 'appell'])
                    aggiungi((await Drive.cerca(t)).filter(f => new RegExp(MasterPrompt.slug(nome).slice(0, 5), 'i').test(MasterPrompt.slug(f.name)) || /syllabus/i.test(f.name)));
            }
            catch (e) {
                stato.textContent = '⚠️ Ricerca non riuscita: ' + (e instanceof Error ? e.message : String(e));
                return;
            }
            const fs = [...visti.values()], c = classifica(fs);
            altri = c.altri;
            gruppi = [...c.libri.entries()].map(([nomeL, files]) => gruppoLibro(nomeL, files));
            scelti.clear();
            [...altri.slide, ...altri.guide, ...altri.quiz, ...altri.indici].forEach(f => scelti.add(f.id));
            stato.textContent = fs.length ? 'Trovati ' + fs.length + ' file: togli la spunta a quelli da non usare e misura i libri.' : 'Nessun file trovato con il nome della materia: il prompt chiederà all\'AI di cercarli.';
            disegnaElenco();
        }
        function daRecord(libro) {
            const rec = Stato.prendi(Centro.idLibro(nomeMateria(), libro.nome));
            if (rec && !rec.deleted) {
                if (rec.lettura)
                    libro.lettura = rec.lettura;
                libro.mappa = rec.mappa;
            }
            return libro;
        }
        function gruppoLibro(nomeL, files) {
            const fs = files.slice().sort((a, b) => (MasterPrompt.segmentoDa(a.name) || 0) - (MasterPrompt.segmentoDa(b.name) || 0));
            return { usa: true, files: fs, libro: daRecord({ nome: nomeL, pdf: fs.map(f => f.name), segmenti: fs.some(f => MasterPrompt.segmentoDa(f.name) !== null) }) };
        }
        const daPdf = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, 'aria-label': 'Scegli i PDF del libro da misurare' });
        daPdf.addEventListener('change', () => {
            const fs = Array.from(daPdf.files || []).map((file, i) => ({ id: 'loc-' + i + '-' + file.name, name: file.name, mimeType: 'application/pdf', file }));
            daPdf.value = '';
            for (const [nomeL, files] of classifica(fs).libri)
                gruppi = gruppi.filter(g => g.libro.nome !== nomeL).concat(gruppoLibro(nomeL, files));
            disegnaElenco();
        });
        function disegnaElenco() {
            elenco.textContent = '';
            if (gruppi.length)
                elenco.appendChild(h('p', null, h('b', null, '📚 Libri')));
            gruppi.forEach(g => {
                const c = h('input', { type: 'checkbox', checked: g.usa || undefined, 'aria-label': 'Usa ' + g.libro.nome });
                c.addEventListener('change', () => { g.usa = c.checked; });
                const esito = h('span.piccolo.tenue', { role: 'status', 'aria-live': 'polite' }, g.libro.lettura || g.libro.mappa ? descrivi(g) : g.files.length + ' PDF' + (g.libro.segmenti ? ' a segmenti' : ''));
                const b = h('button.chip', { type: 'button', 'aria-label': 'Misura pagine e leggibilità di ' + g.libro.nome }, '📏 Misura pagine');
                b.addEventListener('click', async () => {
                    b.disabled = true;
                    try {
                        const r = await misura(g, m => { esito.textContent = m; });
                        g.libro.lettura = r.lettura;
                        g.libro.mappa = r.mappa;
                        delete g.libro.offset;
                        const rec = recordDi(g);
                        if (rec)
                            g.libro.mappa = rec.mappa;
                        esito.textContent = descrivi(g);
                    }
                    catch (e) {
                        esito.textContent = '⚠️ ' + (e instanceof Error ? e.message : String(e));
                    }
                    b.disabled = false;
                });
                const bp = h('button.chip', { type: 'button', 'aria-label': 'Pagine di ' + g.libro.nome + ': fonte, ancore, indice e prova', onclick: () => foglioPagine(g, esito) }, '⚙️ Pagine');
                elenco.appendChild(h('div.riga', null, h('label', null, c, ' ' + g.libro.nome), h('div', null, esito, ' ', b, ' ', bp)));
            });
            const sez = (titolo, xs, nota) => {
                if (!xs.length)
                    return;
                elenco.appendChild(h('p', null, h('b', null, titolo), nota ? h('span.piccolo.tenue', null, ' ' + nota) : null));
                xs.slice(0, 25).forEach(f => {
                    const c = h('input', { type: 'checkbox', checked: scelti.has(f.id) || undefined, 'aria-label': 'Usa ' + f.name });
                    c.addEventListener('change', () => { if (c.checked)
                        scelti.add(f.id);
                    else
                        scelti.delete(f.id); });
                    elenco.appendChild(h('label.riga-tra.piccolo', null, f.name, c));
                });
            };
            sez('🎞️ Slide e dispense', altri.slide);
            sez('🧭 Syllabus e appelli', altri.guide);
            sez('📑 Indici', altri.indici);
            sez('🧩 Quiz già fatti', altri.quiz, '(l\'AI non li duplicherà)');
            if (altri.vietati.length)
                elenco.appendChild(h('p.piccolo', null, '🚫 Esclusi come fonte (eserciziari commerciali): ' + altri.vietati.map(f => f.name).slice(0, 8).join(', ')));
        }
        function descrivi(g) {
            const r = g.libro.lettura, sim = !r ? '' : r.giudizio === 'testo pieno' ? '🟢' : r.giudizio === 'parziale' ? '🟡' : '🔴';
            const rec = nomeMateria() ? Stato.prendi(Centro.idLibro(nomeMateria(), g.libro.nome)) : null;
            return (r ? sim + ' lettura ' + r.pct + '% (' + r.giudizio + ') · ' : '') + (rec && !rec.deleted ? Centro.descriviLibro(rec) : Centro.descriviMappa(g.libro.mappa || null));
        }
        function recordDi(g) {
            const mat = nomeMateria();
            if (!mat)
                return null;
            const prec = Stato.prendi(Centro.idLibro(mat, g.libro.nome)), nuovo = Centro.libroDa(mat, g.libro, prec);
            if (!prec || JSON.stringify(prec) !== JSON.stringify(nuovo))
                Stato.salva(nuovo, true);
            return nuovo;
        }
        const blobLibro = new Map();
        async function disegnaPagina(g, pdf, tela, nota) {
            const conBase = g.files.map(f => ({ f, base: g.libro.segmenti ? (MasterPrompt.segmentoDa(f.name) || 1) - 1 : 0 })).sort((a, b) => a.base - b.base);
            const x = conBase.filter(c => c.base < pdf).pop();
            if (!x) {
                nota.textContent = 'Apri tu il PDF alla pagina ' + pdf + ' e leggi il numero stampato.';
                tela.hidden = true;
                return;
            }
            nota.textContent = 'Carico la pagina ' + pdf + '…';
            try {
                let b = x.f.file || blobLibro.get(x.f.id);
                if (!b) {
                    b = await Drive.scaricaBlob(x.f.id);
                    blobLibro.set(x.f.id, b);
                }
                const L = await caricaPdfJs();
                const doc = await L.getDocument({ data: new Uint8Array(await b.arrayBuffer()), isEvalSupported: false }).promise;
                try {
                    const n = pdf - x.base;
                    if (n > doc.numPages) {
                        nota.textContent = 'Il PDF ha solo ' + (doc.numPages + x.base) + ' pagine.';
                        tela.hidden = true;
                        return;
                    }
                    const pag = await doc.getPage(n), base = pag.getViewport({ scale: 1 });
                    const dpr = Math.min(window.devicePixelRatio || 1, 2), larg = Math.min(560, (tela.parentElement?.clientWidth || 320) - 8);
                    const vp = pag.getViewport({ scale: (larg / base.width) * dpr });
                    tela.width = vp.width;
                    tela.height = vp.height;
                    tela.style.width = vp.width / dpr + 'px';
                    tela.hidden = false;
                    await pag.render({ canvasContext: tela.getContext('2d'), viewport: vp }).promise;
                    nota.textContent = 'Pagina ' + pdf + ' del PDF: quale numero è stampato (in alto o in basso)?';
                }
                finally {
                    if (typeof doc.destroy === 'function')
                        await doc.destroy();
                }
            }
            catch (e) {
                nota.textContent = '⚠️ Pagina non mostrata: ' + (e instanceof Error ? e.message : String(e));
                tela.hidden = true;
            }
        }
        function foglioPagine(g, esito) {
            let rec = recordDi(g);
            if (!rec) {
                avviso('Scegli o scrivi la materia.');
                return;
            }
            const riga = h('p', { role: 'status', 'aria-live': 'polite' });
            const salva = (r) => { rec = r; Stato.salva(r, true); riga.textContent = Centro.descriviLibro(r); disegnaAncore(); };
            riga.textContent = Centro.descriviLibro(rec);
            const FONTI = [['auto', 'A · 📏 automatica (misura del PDF)'], ['mano', 'B · ✍️ guidata: leggo io i numeri stampati'], ['indice', 'C · 📑 dall’indice del libro'], ['nessuna', 'D · ⚪ senza numeri di pagina (capitoli e paragrafi)']];
            const sceltaFonte = h('fieldset', null, h('legend', null, 'Da dove prendo le pagine'), ...FONTI.map(([v, t]) => {
                const r = h('input', { type: 'radio', name: 'fonte-pagine', value: v, checked: rec.fonte === v || undefined });
                r.addEventListener('change', () => { if (r.checked)
                    salva(Centro.conFonte(rec, v)); });
                return h('label.riga', null, r, ' ' + t);
            }));
            const tela = h('canvas.pdf-tela', { hidden: true }), notaB = h('p.piccolo.tenue', { 'aria-live': 'polite' });
            const pagPdf = h('input', { type: 'number', min: '1', value: '10', 'aria-label': 'Pagina del PDF da guardare' });
            const stampata = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': 'Numero stampato su questa pagina' });
            const elencoAncore = h('ul.piccolo');
            function disegnaAncore() {
                elencoAncore.textContent = '';
                (rec.ancore || []).forEach(a => elencoAncore.appendChild(h('li', null, 'PDF ' + a.pdf + ' → pagina ' + a.stampata)));
            }
            disegnaAncore();
            const righeB = area('Oppure una riga per ancora: «pagina 5 = PDF 9»', 2);
            const sezB = h('details', null, h('summary', null, '✍️ B · leggo io i numeri (ancore)'), h('div.riga', null, pagPdf, h('button.chip', { type: 'button', 'aria-label': 'Mostra la pagina del PDF', onclick: () => { disegnaPagina(g, Number(pagPdf.value) || 1, tela, notaB); } }, '👁️ Mostra')), notaB, tela, h('div.riga', null, stampata, h('button.chip', { type: 'button', 'aria-label': 'Aggiungi ancora', onclick: () => {
                    const p = Number(pagPdf.value), s = stampata.value.trim();
                    if (!(p >= 1) || !s) {
                        avviso('Scrivi la pagina del PDF e il numero stampato.');
                        return;
                    }
                    salva(Centro.conAncore(rec, { pdf: p, stampata: s }));
                    stampata.value = '';
                } }, '➕ Aggiungi ancora')), righeB, h('button.chip', { type: 'button', 'aria-label': 'Salva le ancore scritte', onclick: () => {
                    let r = rec, n = 0;
                    for (const t of righeB.value.split('\n')) {
                        const m = /^\s*(?:pagina|pag\.?|p\.?)?\s*([0-9]+|[ivxlcdm]+)\s*=\s*(?:pdf\s*)?([0-9]+)\s*$/i.exec(t);
                        if (m) {
                            r = Centro.conAncore(r, { stampata: m[1], pdf: Number(m[2]) });
                            n++;
                        }
                    }
                    if (!n) {
                        avviso('Nessuna riga «pagina N = PDF M» riconosciuta.');
                        return;
                    }
                    salva(r);
                    righeB.value = '';
                } }, '💾 Salva righe'), elencoAncore);
            const testoIndice = area('Incolla qui l’indice del libro (una voce per riga, con il numero di pagina)', 5);
            const notaC = h('p.piccolo.tenue', { 'aria-live': 'polite' }, rec.indice ? rec.indice.length + ' voci dell’indice salvate.' : '');
            const sezC = h('details', null, h('summary', null, '📑 C · indice del libro'), testoIndice, h('button.chip', { type: 'button', 'aria-label': 'Leggi l’indice', onclick: () => {
                    const v = Centro.indiceDa(testoIndice.value);
                    if (!v.length) {
                        notaC.textContent = 'Nessuna voce con numero di pagina riconosciuta.';
                        return;
                    }
                    salva({ ...rec, indice: v });
                    notaC.textContent = v.length + ' voci dell’indice salvate.';
                } }, '📑 Leggi indice'), notaC);
            const sezProva = h('div');
            const avviaProva = () => {
                sezProva.textContent = '';
                const camp = MappaPagine.campioneProva(rec.mappa, 3, Date.now() % 997 + 1);
                if (!camp.length) {
                    sezProva.appendChild(h('p.piccolo.tenue', null, 'Prima serve una mappa (misura, ancore o indice).'));
                    return;
                }
                sezProva.appendChild(h('p.piccolo.tenue', null, 'Apri ogni pagina e correggi il numero se sul libro è diverso.'));
                const campi = camp.map(c => {
                    const inp = h('input', { type: 'text', inputmode: 'numeric', value: String(c.stampata), 'aria-label': 'Numero stampato sulla pagina ' + c.pdf + ' del PDF' });
                    const t = h('canvas.pdf-tela', { hidden: true }), n = h('p.piccolo.tenue', { 'aria-live': 'polite' });
                    sezProva.appendChild(h('div', null, h('div.riga', null, h('span', null, 'PDF ' + c.pdf + ': '), inp, h('button.chip', { type: 'button', 'aria-label': 'Mostra la pagina ' + c.pdf + ' del PDF', onclick: () => { disegnaPagina(g, c.pdf, t, n); } }, '👁️')), n, t));
                    return { c, inp };
                });
                sezProva.appendChild(h('button.btn', { type: 'button', 'aria-label': 'Conferma la prova', onclick: () => {
                        salva(Centro.conProva(rec, campi.map(x => ({ pdf: x.c.pdf, stampata: x.c.stampata, letta: x.inp.value })), ymd(new Date())));
                        sezProva.textContent = '';
                    } }, '✅ Conferma prova'));
            };
            const corpo = h('div', null, riga, sceltaFonte, sezB, sezC, h('button.chip', { type: 'button', 'aria-label': 'Prova la mappa su 3 pagine', onclick: avviaProva }, '🧪 Prova a 3 pagine'), sezProva);
            foglio({ titolo: '📄 Pagine di ' + g.libro.nome, corpo, allaChiusura: () => {
                    if (rec) {
                        if (rec.lettura)
                            g.libro.lettura = rec.lettura;
                        g.libro.mappa = rec.mappa;
                    }
                    esito.textContent = descrivi(g);
                } });
        }
        function daIncollate() {
            const fs = incollate.value.split('\n').map(x => x.trim()).filter(Boolean).map((name, i) => ({ id: 'man-' + i, name, mimeType: '' }));
            return classifica(fs);
        }
        function valori() {
            const m = daIncollate(), nomi = (xs, tutti = false) => xs.filter(f => tutti || scelti.has(f.id)).map(f => f.name);
            const libriMan = [...m.libri.entries()].map(([nome, files]) => daRecord({ nome, pdf: files.map(f => f.name) }));
            const libriDrv = gruppi.filter(g => g.usa).map(g => g.libro), visti = new Set(libriDrv.map(l => l.nome));
            return { libri: [...libriDrv, ...libriMan.filter(l => !visti.has(l.nome))],
                slide: [...nomi(altri.slide), ...nomi(m.altri.slide, true)], guide: [...nomi(altri.guide), ...nomi(m.altri.guide, true)],
                indici: [...nomi(altri.indici), ...nomi(m.altri.indici, true)], quiz: [...nomi(altri.quiz), ...nomi(m.altri.quiz, true)],
                vietati: [...altri.vietati, ...m.altri.vietati].map(f => f.name) };
        }
        const nomiNoti = () => [...gruppi.flatMap(g => g.files), ...altri.slide, ...altri.guide, ...altri.quiz, ...altri.indici, ...altri.vietati].map(f => f.name)
            .concat(incollate.value.split('\n').map(x => x.trim()).filter(Boolean));
        const el = h('div.fonti', null, h('button.btn.neutro', { type: 'button', onclick: () => { cercaDrive(); } }, '🔎 Cerca materiale su Drive'), stato, elenco, h('details', { open: (!Drive.pronto && !!iniziali) || undefined }, h('summary', null, '📎 Fonti senza Drive (nomi dei file da allegare all\'AI)'), h('p.piccolo.tenue', null, 'Scrivi un nome per riga o scegli i file: l\'app legge solo il nome, i file li alleghi tu alla chat dell\'AI.'), incollate, daFile, h('p.piccolo.tenue', null, '📏 Misura le pagine di un libro dal dispositivo: l\'app legge i numeri di pagina del PDF qui (il file non viene salvato né inviato).'), daPdf));
        return { el, valori, nomiNoti };
    }
    function regoleDossier(nome, codice, stepV, nomiFile, escl = escluseLette()) {
        if (!nome)
            return { d: null, regole: [], problemi: [] };
        const dati = datiDossier(nome, codice), oggiY = ymd(new Date());
        const d0 = Dossier.calcola(dati, { materia: nome, step: stepV, oggi: oggiY });
        const d = d0.tentativi || !d0.step ? d0 : Dossier.calcola(dati, { materia: nome, oggi: oggiY });
        const regole = Dossier.regole(d, escl);
        return { d, regole, problemi: Dossier.controllaPrivacy(regole.join('\n'), { email: Privacy.accLocale(), dispositivo: Privacy.idDispositivo(), nomiFile }) };
    }
    function prompt() {
        const materie = Stato.tutti('materia').sort((a, b) => a.nome.localeCompare(b.nome));
        const selMat = h('select', { 'aria-label': 'Materia' }, ...materie.map(m => h('option', { value: m.codice }, m.nome)), h('option', { value: '' }, 'Altra materia…'));
        const altra = h('input', { type: 'text', placeholder: 'Nome della materia', 'aria-label': 'Nome di un\'altra materia', hidden: materie.length ? true : undefined });
        if (!materie.length)
            selMat.value = '';
        const step = h('input', { type: 'text', placeholder: 'es. 3.3', 'aria-label': 'Step (es. 3.3)' });
        const titolo = h('input', { type: 'text', placeholder: 'Titolo dello step (facoltativo)', 'aria-label': 'Titolo dello step' });
        const data = h('input', { type: 'date', 'aria-label': 'Data prevista' });
        const intens = h('select', { 'aria-label': 'Intensità' }, h('option', { value: 'leggera' }, 'Leggera (10–14 schede)'), h('option', { value: 'standard', selected: true }, 'Standard (18–25 schede)'), h('option', { value: 'intensa' }, 'Intensa (24–30 schede)'));
        const perMsg = h('select', { 'aria-label': 'Schede per messaggio' }, h('option', { value: '2' }, '2 schede per messaggio'), h('option', { value: '1' }, '1 scheda per messaggio (account gratuito)'));
        const gem = casella('Uso un Gem con le «Regole per il Gem»');
        const usaDos = casella('Usa il mio dossier (regole dai miei quiz)', true);
        const dosBox = h('div.dossier', { hidden: true, role: 'region', 'aria-label': 'Dossier studente' });
        const btnDos = h('button.chip', { type: 'button', 'aria-expanded': 'false', 'aria-label': 'Vedi dossier' }, '👁 Vedi dossier');
        let escluse = escluseLette(), problemiPrivacy = [];
        const note = area('Richieste particolari (facoltativo)', 2);
        const out = area('Master prompt da copiare in Gemini', 10, true);
        const info = h('p.piccolo.tenue');
        const materia = () => {
            const m = materie.find(x => x.codice === selMat.value) || null;
            const nome = m ? m.nome : altra.value.trim();
            return { m, nome, codice: m ? m.codice : nome.slice(0, 1).toUpperCase() };
        };
        selMat.addEventListener('change', () => { altra.hidden = !!selMat.value; });
        const fonti = raccoltaFonti(() => materia().nome);
        function dossier() {
            const { nome, codice } = materia();
            if (!nome)
                return null;
            const dati = datiDossier(nome, codice), oggiY = ymd(new Date());
            const d = Dossier.calcola(dati, { materia: nome, step: step.value.trim(), oggi: oggiY });
            return d.tentativi || !d.step ? d : Dossier.calcola(dati, { materia: nome, oggi: oggiY });
        }
        function controllaDossier(regole) {
            return Dossier.controllaPrivacy(regole.join('\n'), { email: Privacy.accLocale(), dispositivo: Privacy.idDispositivo(), nomiFile: fonti.nomiNoti() });
        }
        function disegnaDossier() {
            dosBox.textContent = '';
            const d = dossier();
            if (!d) {
                dosBox.appendChild(h('p.piccolo.tenue', null, 'Scegli prima la materia.'));
                return;
            }
            const regole = Dossier.regole(d, escluse), problemi = controllaDossier(regole);
            dosBox.appendChild(h('p.piccolo', null, h('b', null, '🗂️ Dossier — ' + d.materia + (d.step ? ' · step ' + d.step : ' · tutta la materia')), ' · ' + d.tentativi + ' risposte'));
            if (d.insufficiente || !d.voci.length)
                dosBox.appendChild(h('p.piccolo.tenue', null, 'Dati insufficienti: fai qualche quiz in app di questa materia e il dossier ti dirà dove insistere.'));
            for (const v of d.voci) {
                const testoV = h('span', null, h('b', null, v.titolo), h('br'), h('span.piccolo.tenue', null, v.motivo), v.regola ? h('span.piccolo', null, h('br'), '→ all\'AI: ' + v.regola) : h('span.piccolo.tenue', null, ' (solo per te, non va all\'AI)'));
                if (!v.regola) {
                    dosBox.appendChild(h('p.dossier-voce', null, testoV));
                    continue;
                }
                const c = h('input', { type: 'checkbox', checked: escluse.includes(v.id) ? undefined : true, 'aria-label': 'Manda all\'AI: ' + v.titolo });
                c.addEventListener('change', () => {
                    escluse = c.checked ? escluse.filter(x => x !== v.id) : escluse.concat(v.id);
                    escluseSalva(escluse);
                    disegnaDossier();
                    if (out.value)
                        genera();
                });
                dosBox.appendChild(h('label.dossier-voce.riga-tra', null, testoV, c));
            }
            dosBox.appendChild(h('p.piccolo', { role: 'status' }, problemi.length ? '⛔ Controllo privacy: ' + problemi.join(' ') + ' Togli la voce per poter copiare.'
                : '✅ Controllo privacy: nessun dato identificativo. All\'AI ' + (regole.length === 1 ? 'va 1 regola' : 'vanno ' + regole.length + ' regole') + '.'));
        }
        btnDos.addEventListener('click', () => {
            const apri = dosBox.hidden;
            dosBox.hidden = !apri;
            btnDos.setAttribute('aria-expanded', String(apri));
            if (apri)
                disegnaDossier();
        });
        function genera() {
            const { m, nome, codice } = materia();
            if (!nome) {
                avviso('Scegli o scrivi la materia.');
                return;
            }
            if (!/^\d+(\.\d+)*$/.test(step.value.trim())) {
                avviso('Scrivi lo step come numero, es. 3.3.');
                step.focus();
                return;
            }
            const arch = (m && m.archetipo) || Dominio.archetipoMateria(nome) || 'scienze_sperimentali';
            const def = ARCHETIPI_DISCIPLINARI[arch];
            const fv = fonti.valori();
            const opz = {
                materia: nome, codice, step: step.value.trim(), titolo: titolo.value.trim() || undefined, data: data.value || undefined,
                archetipo: arch, etichettaArchetipo: def ? def.etichetta : arch, tono: Dominio.profilo().tonoSpiegazioneAI,
                intensita: intens.value, perMessaggio: perMsg.value === '1' ? 1 : 2, gem: gem.c.checked,
                libri: fv.libri, slide: fv.slide, guide: fv.guide, indici: fv.indici, quizEsistenti: fv.quiz, vietati: fv.vietati, idEsistenti: idGiaUsati(),
                note: note.value.trim() || undefined,
            };
            const d = usaDos.c.checked ? dossier() : null;
            opz.dossier = d ? Dossier.regole(d, escluse) : [];
            problemiPrivacy = controllaDossier(opz.dossier);
            out.value = MasterPrompt.costruisci(opz);
            bloccaCopia();
            if (!dosBox.hidden)
                disegnaDossier();
            if (problemiPrivacy.length)
                avviso('⛔ Il dossier contiene dati identificativi: apri «Vedi dossier» e togli la voce.', 6000);
            const nonMisurati = (opz.libri || []).filter(l => !l.lettura).length;
            info.textContent = out.value.length.toLocaleString('it-IT') + ' caratteri' + (nonMisurati ? ' · ' + nonMisurati + ' libri non misurati: Gemini citerà capitolo e paragrafo.' : '') +
                ' · Allega a Gemini il Drive (o i file elencati), incolla il prompt, poi controlla ogni risposta con «🩺 Diagnostica quiz».';
        }
        const btnCopia = h('button.chip', { type: 'button', onclick: () => { if (out.value && !problemiPrivacy.length)
                copia(out.value, out); } }, '📋 Copia prompt');
        const btnScarica = h('button.chip', { type: 'button', onclick: () => { if (out.value && !problemiPrivacy.length)
                scarica('prompt-quiz-' + MasterPrompt.slug(materia().nome) + '-' + step.value.trim() + '.txt', out.value, 'text/plain'); } }, '💾 Scarica .txt');
        function bloccaCopia() { btnCopia.disabled = btnScarica.disabled = problemiPrivacy.length > 0; }
        const corpo = h('div', null, h('p.piccolo.tenue', null, 'Prepara il prompt completo per far creare a Gemini le schede di quiz di uno step, nel formato che l\'app importa. Più dati trova l\'app, più il prompt è mirato.'), selMat, altra, h('div.chips', null, step, data), titolo, intens, perMsg, gem.el, h('p.piccolo.tenue', null, 'Hai un Gem con le regole vecchie? Copia queste istruzioni nuove nel Gem: l\'app ora chiede il formato quiz-v3 e fa da sola ID, posizioni e conteggi.'), usaDos.el, h('div.chips', null, btnDos), dosBox, note, fonti.el, h('button.btn', { type: 'button', onclick: genera }, '🧠 Genera il prompt'), out, info, h('div.chips', null, btnCopia, btnScarica, h('button.chip', { type: 'button', onclick: () => diagnostica() }, '🩺 Diagnostica quiz')));
        foglio({ titolo: '🧠 Prompt quiz per Gemini', corpo });
    }
    return { diagnostica, prompt, raccoltaFonti, regoleDossier, idGiaUsati, copia, esclusi, salvaEsclusi, vietato };
})();

const PROFILO_STANDARD = { perScheda: 18, opzioni: 4, quoteLivello: [25, 35, 25, 15], rangeScheda: [[4, 5], [6, 7], [4, 5], [2, 3]], spiegazioneMin: 600, confutazioneMin: 30,
    tolLivello: 3, tolPosizione: 10, lungaMax: 25, schedeStep: [18, 25], brac: [45, 50] };
const Validatore = (() => {
    const LETTERE = 'ABCD';
    const oggetto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const testo = (v) => typeof v === 'string' ? v : '';
    const s = (x) => typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim();
    function letteraDichiarata(sp) {
        const m = /RISPOSTA ESATTA\s*:\s*([A-D])\s*[)\].:]/.exec(String(sp || ''));
        return m ? LETTERE.indexOf(m[1]) : null;
    }
    const citazioni = (x) => (String(x || '').match(/\[\[[^\]]+\]\]/g) || []);
    const numeriPagina = (x) => new Set((String(x).match(/\d+/g) || []).map(Number));
    function bloccanti(q, P = PROFILO_STANDARD) {
        const b = [], o = Array.isArray(q.opzioni) ? q.opzioni : [];
        if (!s(q.domanda))
            b.push('testo mancante');
        if (o.length !== P.opzioni)
            b.push(o.length + ' opzioni invece di ' + P.opzioni);
        const e = Number(q.esatta);
        if (!Number.isInteger(e) || e < 0 || e >= P.opzioni || e >= o.length)
            b.push('«esatta» fuori da 0..' + (P.opzioni - 1));
        return b;
    }
    const pct = (n, tot) => tot ? Math.round(n * 100 / tot) : 0;
    const livelloDi = (q) => { const n = Number(s(q.livelloCognitivo).replace(/^L/i, '')) || Number(s(q.livello).replace(/^L/i, '')); return n >= 1 && n <= 4 ? n : 0; };
    function rapporto(p, extra = {}, P = PROFILO_STANDARD) {
        const quiz = (p.quiz || []).filter(q => q && typeof q === 'object'), tot = quiz.length;
        const bloccanti = (extra.bloccanti || []).slice(), avvisi = [], righe = [];
        if (extra.duplicati && extra.duplicati.length)
            avvisi.push(extra.duplicati.length + ' domande ripetute tra parti: tengo la più recente (' + extra.duplicati.slice(0, 3).join('; ') + (extra.duplicati.length > 3 ? '…' : '') + ')');
        if (!tot)
            return { bloccanti, avvisi, righe: ['Nessuna domanda valida'] };
        const perScheda = new Map();
        for (const q of quiz) {
            const n = ImportaParti.numScheda(q.scheda);
            if (n)
                perScheda.set(n, (perScheda.get(n) || 0) + 1);
        }
        if (perScheda.size) {
            const storte = [...perScheda].filter(([, c]) => c !== P.perScheda).sort((a, b) => a[0] - b[0]);
            righe.push(perScheda.size + ' schede · ' + tot + ' domande');
            if (storte.length)
                avvisi.push('Schede con domande ≠ ' + P.perScheda + ': ' + storte.slice(0, 6).map(([n, c]) => 'S' + String(n).padStart(2, '0') + '=' + c).join(', ') + (storte.length > 6 ? '…' : ''));
            if (extra.completo !== false && (perScheda.size < P.schedeStep[0] || perScheda.size > P.schedeStep[1]))
                avvisi.push(perScheda.size + ' schede nello step (attese ' + P.schedeStep.join('–') + ')');
        }
        else
            righe.push(tot + ' domande');
        const liv = [0, 0, 0, 0];
        for (const q of quiz) {
            const l = livelloDi(q);
            if (l)
                liv[l - 1]++;
        }
        const lp = liv.map(n => pct(n, tot));
        righe.push('Livelli L1–L4: ' + lp.join('/') + '% (attesi ' + P.quoteLivello.join('/') + ')');
        if (lp.some((x, i) => Math.abs(x - P.quoteLivello[i]) > P.tolLivello))
            avvisi.push('Livelli fuori soglia (±' + P.tolLivello + '): ' + lp.join('/') + '% invece di ' + P.quoteLivello.join('/'));
        const pos = Array(P.opzioni).fill(0);
        let lunga = 0;
        for (const q of quiz) {
            const e = Number(q.esatta), o = (q.opzioni || []).map(x => s(x).length);
            if (e >= 0 && e < P.opzioni)
                pos[e]++;
            if (o.length > 1 && o.every((l, i) => i === e || l < o[e]))
                lunga++;
        }
        const pp = pos.map(n => pct(n, tot));
        righe.push('Esatta in A/B/C/D: ' + pp.join('/') + '% · corretta più lunga: ' + pct(lunga, tot) + '%');
        if (pp.some(x => Math.abs(x - 100 / P.opzioni) > P.tolPosizione))
            avvisi.push('Posizione dell\'esatta sbilanciata: ' + pp.join('/') + '% (attesa ~' + Math.round(100 / P.opzioni) + '% ciascuna)');
        if (pct(lunga, tot) > P.lungaMax)
            avvisi.push('La corretta è la più lunga nel ' + pct(lunga, tot) + '% delle domande (attesa ≤ ' + P.lungaMax + '%): si indovina dalla lunghezza');
        const gem = new Map();
        for (const q of quiz) {
            const g = s(q.coppiaGemellaId);
            if (g)
                gem.set(g, (gem.get(g) || 0) + 1);
        }
        const coppie = [...gem.values()].filter(n => n >= 2).length, sole = [...gem].filter(([, n]) => n < 2).map(([g]) => g);
        const schede = perScheda.size || Math.ceil(tot / P.perScheda), attese = Math.floor(schede / 3);
        righe.push('Coppie gemelle complete: ' + coppie);
        if (coppie < attese)
            avvisi.push('Coppie gemelle: ' + coppie + ' (attese ≥ ' + attese + ', una ogni 3 schede)');
        if (sole.length)
            avvisi.push(sole.length + ' gemelle senza l\'altra metà: ' + sole.slice(0, 3).join(', ') + (sole.length > 3 ? '…' : ''));
        const senzaErrore = quiz.filter(q => !s(q.erroreTipico)).length;
        if (senzaErrore)
            avvisi.push(senzaErrore + ' domande senza «erroreTipico»');
        const conSd = quiz.filter(q => q.spiegazioneDistrattori !== undefined);
        const sdStorte = (conSd.length || perScheda.size ? quiz : []).filter(q => !(Array.isArray(q.spiegazioneDistrattori) && q.spiegazioneDistrattori.length === P.opzioni - 1)).length;
        if (sdStorte)
            avvisi.push(sdStorte + ' domande senza ' + (P.opzioni - 1) + ' «spiegazioneDistrattori»');
        const daVerificare = quiz.filter(q => /da verificare|p\.\s*_{2,}/i.test(s(q.fonte))).length;
        if (daVerificare)
            avvisi.push(daVerificare + ' fonti «da verificare» o senza pagina');
        const fuori = (m) => m < P.brac[0] || m > P.brac[1];
        const ps = (p.programmaCalendario && p.programmaCalendario.pianoStrutturato) || {};
        const brac = (Array.isArray(ps.sottoSchede) ? ps.sottoSchede : Array.isArray(p.sottoSchede) ? p.sottoSchede : []).map(x => Number(x && (x.durataBracMin || x.durataMin)) || 0).filter(Boolean);
        if (brac.some(fuori))
            avvisi.push('Blocchi di studio fuori ' + P.brac.join('–') + ' min (BRAC): ' + brac.filter(fuori).join(', '));
        return { bloccanti, avvisi, righe };
    }
    function analizza(qs, P = PROFILO_STANDARD) {
        const problemi = [], add = (sev, id, msg) => { problemi.push({ sev, id, msg }); };
        const visti = new Set(), schede = new Map(), gemelle = new Map();
        const lv = [0, 0, 0, 0], es = [0, 0, 0, 0];
        let lunga = 0;
        qs.forEach((q0, i) => {
            if (!oggetto(q0)) {
                add('err', '(riga ' + (i + 1) + ')', 'elemento non valido');
                return;
            }
            const q = q0, id = testo(q.id) || '(riga ' + (i + 1) + ')';
            for (const k of CHIAVI_QUIZ)
                if (!(k in q))
                    add('err', id, 'chiave mancante: ' + k);
            for (const k of Object.keys(q))
                if (!CHIAVI_QUIZ.includes(k))
                    add('warn', id, 'chiave in più: ' + k);
            if (testo(q.id)) {
                if (visti.has(id))
                    add('err', id, 'ID duplicato');
                visti.add(id);
            }
            const L = q.livelloCognitivo;
            const lOk = typeof L === 'number' && [1, 2, 3, 4].includes(L);
            if (!lOk)
                add('err', id, 'livelloCognitivo deve essere un numero da 1 a 4, senza virgolette');
            else {
                lv[L - 1]++;
                if (q.livello !== 'L' + L)
                    add('err', id, 'livello (' + String(q.livello) + ') non coincide con livelloCognitivo (' + L + ')');
            }
            const o = q.opzioni;
            if (testo(q.domanda).trim().length < 10)
                add('err', id, 'domanda mancante o troppo breve');
            else if (/tutte le precedenti|nessuna delle precedenti/i.test(testo(q.domanda) + ' ' + (Array.isArray(o) ? o.join(' ') : '')))
                add('warn', id, 'usa «tutte/nessuna delle precedenti»');
            const esOk = Number.isInteger(q.esatta) && q.esatta >= 0 && q.esatta < P.opzioni;
            if (!Array.isArray(o) || o.length !== P.opzioni || o.some(x => typeof x !== 'string' || !x.trim()))
                add('err', id, 'servono esattamente ' + P.opzioni + ' opzioni testuali');
            else {
                const op = o;
                if (new Set(op.map(x => x.trim().toLowerCase())).size < P.opzioni)
                    add('err', id, 'opzioni duplicate');
                if (!esOk)
                    add('err', id, 'esatta deve essere un intero da 0 a ' + (P.opzioni - 1));
                else {
                    const e = q.esatta, c = op[e], altre = op.filter((_, j) => j !== e);
                    es[e]++;
                    if (c.length >= Math.max(...altre.map(x => x.length))) {
                        lunga++;
                        add('info', id, 'la risposta corretta è la più lunga');
                    }
                    if (altre.some(x => x.toLowerCase().includes(c.toLowerCase())))
                        add('err', id, 'il testo della corretta è contenuto in un distrattore');
                    if (c.length < 0.45 * Math.min(...altre.map(x => x.length)))
                        add('warn', id, 'la corretta è molto più corta delle altre: si nota');
                    const dich = letteraDichiarata(testo(q.spiegazione));
                    if (dich !== null && dich !== e)
                        add('err', id, 'la spiegazione dice «RISPOSTA ESATTA: ' + LETTERE[dich] + ')» ma esatta = ' + e + ' (' + LETTERE[e] + ')');
                }
            }
            if (!esOk && !(Array.isArray(o) && o.length === P.opzioni) && 'esatta' in q && !Number.isInteger(q.esatta))
                add('err', id, 'esatta deve essere un intero da 0 a ' + (P.opzioni - 1));
            const sd = q.spiegazioneDistrattori;
            if (!Array.isArray(sd) || sd.length !== P.opzioni - 1 || sd.some(x => typeof x !== 'string' || x.trim().length < P.confutazioneMin))
                add('err', id, 'spiegazioneDistrattori: servono ' + (P.opzioni - 1) + ' confutazioni (almeno ' + P.confutazioneMin + ' caratteri ciascuna)');
            else if (new Set(sd.map(x => String(x).trim().toLowerCase())).size < P.opzioni - 1)
                add('warn', id, 'spiegazioneDistrattori: confutazioni duplicate');
            if (!Array.isArray(q.distractorTypes) || q.distractorTypes.length !== P.opzioni - 1)
                add('err', id, 'distractorTypes: servono ' + (P.opzioni - 1) + ' stringhe');
            if (!testo(q.erroreTipico).trim())
                add('err', id, 'erroreTipico vuoto o null');
            const sp = testo(q.spiegazione), fonte = testo(q.fonte).trim();
            if (typeof q.spiegazione !== 'string')
                add('err', id, 'spiegazione mancante');
            else {
                if (sp.length < P.spiegazioneMin)
                    add('warn', id, 'spiegazione corta (' + sp.length + ' caratteri, minimo ~' + P.spiegazioneMin + ')');
                if (!citazioni(sp).length)
                    add('warn', id, 'nella spiegazione manca la citazione [[Manuale, p. X]]');
                else if (fonte) {
                    const pf = numeriPagina(fonte), ps = numeriPagina(citazioni(sp).join(' '));
                    if (pf.size && ![...pf].some(n => ps.has(n)))
                        add('warn', id, 'la citazione nella spiegazione non coincide con fonte');
                }
            }
            if (!fonte)
                add('err', id, 'fonte mancante');
            else {
                if (/verificar/i.test(fonte + ' ' + sp))
                    add('err', id, 'pagina «da verificare»: vietata');
                if (q.sourceRef !== q.fonte)
                    add('warn', id, 'sourceRef diverso da fonte');
            }
            const gid = testo(q.coppiaGemellaId);
            if (gid) {
                const a = gemelle.get(gid) || [];
                a.push({ id, scheda: testo(q.scheda) });
                gemelle.set(gid, a);
            }
            const nome = testo(q.scheda) || '(senza scheda)';
            const s = schede.get(nome) || { nome, n: 0, lv: [0, 0, 0, 0], es: [0, 0, 0, 0], seq: [] };
            s.n++;
            if (lOk)
                s.lv[L - 1]++;
            if (esOk) {
                s.es[q.esatta]++;
                s.seq.push(q.esatta);
            }
            schede.set(nome, s);
        });
        schede.forEach(s => {
            const chi = 'scheda ' + s.nome;
            if (s.n !== P.perScheda)
                add('err', chi, 'ha ' + s.n + ' domande invece di ' + P.perScheda + ' (può essere normale solo se hai caricato una parte del file)');
            else {
                P.rangeScheda.forEach(([a, b], k) => { if (s.lv[k] < a || s.lv[k] > b)
                    add('warn', chi, 'livello L' + (k + 1) + ': ' + s.lv[k] + ' domande (atteso ' + a + '–' + b + ')'); });
                if (s.es.filter(x => x > 0).length < 3)
                    add('warn', chi, 'la risposta esatta usa meno di 3 posizioni diverse');
            }
            for (let i = 2; i < s.seq.length; i++)
                if (s.seq[i] === s.seq[i - 1] && s.seq[i] === s.seq[i - 2]) {
                    add('warn', chi, 'risposta esatta nella stessa posizione (' + LETTERE[s.seq[i]] + ') per 3 domande di fila');
                    break;
                }
        });
        gemelle.forEach((a, k) => {
            if (a.length === 1)
                add('info', 'gemella ' + k, 'membro presente: ' + a[0].id + ' (scheda ' + a[0].scheda + '). L\'altro membro deve stare in una scheda diversa.');
            else if (new Set(a.map(x => x.scheda)).size < a.length)
                add('warn', 'gemella ' + k, 'i due membri stanno nella stessa scheda');
        });
        const n = qs.length;
        if (n >= P.perScheda && 100 * lunga / n > P.lungaMax)
            add('err', 'insieme', 'la corretta è la più lunga nel ' + Math.round(100 * lunga / n) + '% dei casi (massimo ' + P.lungaMax + '%)');
        if (n >= 2 * P.perScheda) {
            es.forEach((c, j) => { const p = 100 * c / n; if (Math.abs(p - 100 / P.opzioni) > P.tolPosizione)
                add('warn', 'insieme', 'esatta=' + j + ' nel ' + Math.round(p) + '% dei casi (atteso ~' + Math.round(100 / P.opzioni) + '%)'); });
            P.quoteLivello.forEach((t, k) => { const p = 100 * lv[k] / n; if (Math.abs(p - t) > P.tolLivello)
                add('warn', 'insieme', 'L' + (k + 1) + ' al ' + Math.round(p) + '% (atteso ' + t + '% ±' + P.tolLivello + ')'); });
        }
        const conErrori = new Set(problemi.filter(p => p.sev === 'err').map(p => p.id));
        const pronte = qs.filter((q, i) => oggetto(q) && !conErrori.has(testo(q.id) || '(riga ' + (i + 1) + ')')).length;
        return { problemi, n, lv, es, lunga, schede: [...schede.values()].map(({ nome, n: nn, lv: l, es: e }) => ({ nome, n: nn, lv: l, es: e })), gemelle: gemelle.size, pronte };
    }
    function valida(qs, P = PROFILO_STANDARD) {
        const blocchi = new Map(), visti = new Set();
        let pronte = 0;
        qs.forEach((q, i) => {
            const id = oggetto(q) && testo(q.id) ? testo(q.id) : '(riga ' + (i + 1) + ')';
            const b = oggetto(q) ? bloccanti(q, P) : ['non è una domanda'];
            if (visti.has(id))
                b.push('ID doppio: vale la prima domanda con questo id');
            visti.add(id);
            if (b.length)
                blocchi.set(id, [...(blocchi.get(id) || []), ...b]);
            else
                pronte++;
        });
        const analisi = analizza(qs, P), globale = (p) => /^(scheda |insieme|gemella )/.test(p.id);
        return { bloccanti: blocchi, qualita: analisi.problemi.filter(p => !globale(p)), insieme: analisi.problemi.filter(globale), pronte, analisi };
    }
    function ripara(qs) {
        const log = [];
        const out = qs.map(q0 => {
            if (!oggetto(q0))
                return q0;
            const q = { ...q0 }, id = testo(q.id) || '?';
            for (const k of Object.keys(q))
                if (!CHIAVI_QUIZ.includes(k)) {
                    log.push(id + ': rimossa la chiave in più «' + k + '»');
                    delete q[k];
                }
            for (const k of ['domanda', 'spiegazione', 'fonte', 'erroreTipico']) {
                const v = q[k];
                if (typeof v === 'string' && v !== v.trim()) {
                    log.push(id + ': tolti spazi superflui in «' + k + '»');
                    q[k] = v.trim();
                }
            }
            if (Array.isArray(q.opzioni) && q.opzioni.some(o => typeof o === 'string' && o !== o.trim())) {
                log.push(id + ': tolti spazi superflui nelle opzioni');
                q.opzioni = q.opzioni.map(o => typeof o === 'string' ? o.trim() : o);
            }
            if (typeof q.livelloCognitivo === 'string' && /^L?[1-4]$/i.test(q.livelloCognitivo.trim())) {
                log.push(id + ': livelloCognitivo da testo a numero');
                q.livelloCognitivo = Number(q.livelloCognitivo.trim().replace(/^L/i, ''));
            }
            if (typeof q.esatta === 'string' && /^[0-3]$/.test(q.esatta.trim())) {
                log.push(id + ': esatta da testo a numero');
                q.esatta = Number(q.esatta.trim());
            }
            const lc = q.livelloCognitivo;
            if (typeof lc === 'number' && [1, 2, 3, 4].includes(lc) && q.livello !== 'L' + lc) {
                log.push(id + ': livello allineato a livelloCognitivo (' + (q.livello === undefined ? 'mancante' : String(q.livello)) + ' → L' + lc + ')');
                q.livello = 'L' + lc;
            }
            const f = testo(q.fonte).trim();
            if (f && q.sourceRef !== f) {
                log.push(id + ': sourceRef reso uguale a fonte');
                q.sourceRef = f;
            }
            return q;
        });
        return { qs: out, log };
    }
    const promptCorrezione = (qs, problemi, o = {}) => DiagnosiQuiz.promptCorrezione(qs, problemi, o).testo;
    return { PROFILO_STANDARD, LETTERE, letteraDichiarata, citazioni, bloccanti, rapporto, analizza, valida, ripara, promptCorrezione };
})();
