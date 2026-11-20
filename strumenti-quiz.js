"use strict";
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
    function costruisci(o) {
        const mat = String(o.materia || 'Materia').trim(), ms = slug(mat) || 'materia', cod = String(o.codice || mat.charAt(0)).toUpperCase();
        const step = String(o.step || '1.1').trim(), pref = ms + '-' + step, ud = o.unita || 'UD' + step.split('.')[0];
        const arch = o.archetipo || 'scienze_sperimentali', [smin, smax] = RANGE_SCHEDE[o.intensita || 'standard'];
        const pm = o.perMessaggio === 1 ? 1 : 2, nx = prossimo(o.idEsistenti || [], pref);
        const libri = o.libri || [], slide = o.slide || [], quiz = o.quizEsistenti || [], vietati = o.vietati || [];
        const blocchi = smax <= 14 ? '2–3' : '3–4', durata = smax <= 14 ? '~95–140' : '~185–190';
        const elenco = (xs, max = 12) => xs.slice(0, max).map(x => '«' + x + '»').join(', ') + (xs.length > max ? ' e altri ' + (xs.length - max) : '');
        const S = [];
        const sez = (t) => S.push('', '==========================================================', t, '==========================================================');
        S.push('REGOLA ZERO — UNICO OUTPUT CONSENTITO (prevale su tutto)', 'Il TUO UNICO PRODOTTO sono blocchi ```json scritti qui in chat: le SCHEDE DI QUIZ e, alla fine dello step, il blocco di CHIUSURA (sotto-schede BRAC, ripassi, righe calendario). L\'app ricostruisce tutto da sola quando il file viene importato.', 'NON PRODURRE MAI: teoria, riassunti, dispense, mappe, formulari, file (.docx/.pdf/.html…), mini-app. Se stai per scriverne, fermati e torna alle schede.', 'Prima risposta: esegui subito la Fase 1 (tabella + righe calendario) e poi la prima consegna di schede, senza introduzioni.');
        S.push('', 'RUOLO', 'Sei l\'architetto didattico e neuroscientifico dell\'app di studio «il-mio-calendario». Lavori in AUTONOMIA: nessuno allungherà o correggerà il tuo output a mano (un controllo automatico scarta ciò che non rispetta il formato). Quantità e qualità qui sotto sono obbligatorie. Tutto in italiano, niente chiacchiere.', registro(o.tono || 'tecnico_accademico'));
        sez('TARGET (già compilato dall\'app)');
        S.push(' - Materia: ' + mat + ' (codice ' + cod + ', id in minuscolo «' + ms + '») · archetipo: ' + (o.etichettaArchetipo || arch) + '.', ' - Step: ' + step + (o.titolo ? ' «' + o.titolo + '»' : '') + ' · unità ' + ud + ' · data: ' + (o.data || 'da definire') + '.', ' - Schede: ' + smin + '–' + smax + ' (1 scheda = 18 domande) raggruppate in ' + blocchi + ' sotto-schede BRAC da 45–50 min (' + durata + ' min in tutto).', ' - Prima scheda: S' + String(nx.scheda).padStart(2, '0') + (nx.primo > 1 ? ' (le schede precedenti esistono già: non riscriverle)' : '') + '.');
        if (o.puntiDeboli && o.puntiDeboli.length)
            S.push(' - Punti deboli misurati dall\'app (risposte corrette < 60%): ' + o.puntiDeboli.join('; ') + '. Dedica a questi argomenti almeno una scheda in più, con più L3 (trabocchetti) e confutazioni molto esplicite.');
        if (o.note)
            S.push(' - Richieste dello studente: ' + o.note);
        sez('COMPATIBILITÀ CON L\'APP — COSA FA L\'APP DEI TUOI QUIZ');
        S.push(' - «📥 Importa quiz da Drive» legge i .json nelle cartelle che finiscono in «quiz»: domanda → testo, opzioni → 4 risposte (la corretta la scrivi SEMPRE in `opzioni[0]`, l\'app la sposta in una posizione bilanciata), ' +
            'spiegazione → correzione passo-passo divisa nelle sezioni COSA CHIEDE / CONCETTO E MECCANISMO / IN SINTESI, fonte → riferimento, livello (NUMERO 1–4) → livello di Bloom.', ' - L\'app MESCOLA le opzioni: per questo le confutazioni vanno in `spiegazioneDistrattori` (l\'app le mostra accanto all\'opzione scelta) e le lettere dentro `spiegazione` le riscrive l\'app dopo aver mescolato.', ' - «Allenamento Neuro»: certezza 1/2/3 dopo ogni risposta; sicuro+sbagliato = illusione di competenza → la domanda torna oggi in «Quiz da rifare» con la confutazione del distrattore scelto e il tuo `erroreTipico`.', ' - Interleaving per step e livello; coppie gemelle (`gemella`) e `distractorTypes` alimentano trabocchetti e statistiche.', ' - ID, step, sotto-step, posizione dell\'esatta, conteggi e controlli li fa l\'app: tu scrivi SOLO il contenuto. Reimportare aggiorna, non duplica.');
        sez('FASE 0 — ALLINEAMENTO (a ogni nuova chat)');
        S.push('Leggi sul Drive collegato, in quest\'ordine:');
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
        sez('FASE 1 — ANALISI AUTONOMA DELLO STEP (senza chiedere approvazione)');
        S.push(' P1. Analizza l\'argomento da syllabus, libro, slide e appelli.', ' P2. Stabilisci i MICROSTEP (' + step + '.1, ' + step + '.2, …) che coprono tutto lo step senza sovrapposizioni e senza duplicare ciò che esiste già.', ' P3. Per OGNI microstep decidi quante schede servono in base ai suoi ambiti: numero NON uniforme, minimo 2, 3–4 se ha molti ambiti.');
        if (conCalcoli(arch, mat))
            S.push(' P4. Dove compare una formula, un rapporto o un calcolo: schede dedicate «Problemi su …» OLTRE a quelle teoriche.');
        S.push(' P5. Verifica la copertura di ogni microstep e riempi i buchi.', ' P6. Dividi le schede in PRIORITARIE (~70%) e RAFFINAMENTO (~30%).', ' Soglia obbligatoria: ' + smin + '–' + smax + ' schede in tutto. Raggruppa i microstep in ' + blocchi + ' SOTTOSCHEDE = blocchi BRAC da 45–50 min.', ' Output della Fase 1 (primo messaggio, poi procedi): a) righe calendario `' + cod + '|' + ud + '|ARGOMENTO|N|' + step + '|' + (o.data || 'da definire') + '`; b) tabella microstep → n. schede → prioritarie/raffinamento → pagine del libro → sotto-scheda; c) totale schede e domande.');
        sez('FASE 2 — GENERAZIONE A SCHEDE');
        S.push(' - 1 SCHEDA = 18 domande a risposta multipla con ESATTAMENTE 4 opzioni; ogni scheda copre un solo microstep e contiene tutti e 4 i livelli.', ' - NON scrivere id, stepId, sottoStep, esatta, livelloCognitivo, sourceRef: li aggiunge l\'app.', '', 'LIVELLI — segui questa SEQUENZA per le 18 domande di ogni scheda (1ª, 2ª, … 18ª): ' + SEQUENZA_LIVELLI.join(', ') + '.', ' - 1 richiamo attivo · 2 applicazione · 3 trabocchetto (illusione di competenza) · 4 sintesi trasversale / caso.', ' - Coppie gemelle: due domande su concetti speculari, in schede diverse, con la stessa etichetta `"gemella": "G1"` (poi G2, G3…); circa 1 coppia ogni 3 schede.', ' - `erroreTipico` sempre valorizzato: l\'errore di ragionamento dietro il distrattore principale.', '', 'REGOLE DI QUALITÀ (il controllo automatico le verifica)', ' Q-A. La risposta corretta va SEMPRE in `opzioni[0]`: la posizione la sceglie l\'app.', ' Q-B. La corretta NON deve essere la più lunga: scrivila breve e allunga i distrattori.', ' Q-C. Distrattori plausibili, ognuno nato da un errore preciso; il testo della corretta non deve stare dentro un distrattore. Mai «tutte/nessuna delle precedenti».', ' Q-D. Nessun duplicato o quasi-duplicato, né nello step né rispetto a ciò che esiste già. Stile = appello vero.', ' ' + regolaArchetipo(arch, mat), ' Q-F. Italiano corretto; pedici/apici come `_{2}` e `^{2}`; risultati numerici semplici con unità SI.', ' Q-G. Ogni calcolo deve tornare: ricalcola e verifica l\'ordine di grandezza prima di consegnare.', '', 'CAMPO `spiegazione` (lunga e completa, almeno un paragrafo pieno; nei calcoli tutti i passaggi), con queste etichette ESATTE in maiuscolo:', ' COSA CHIEDE: … CONCETTO E MECCANISMO: … RISPOSTA ESATTA: A) «testo» … PERCHÉ GLI ALTRI NO: B) … C) … D) … IN SINTESI: … [[Manuale, p. X]]', ' Scrivi le lettere come se la corretta fosse A (cioè `opzioni[0]`): l\'app le riscrive dopo aver mescolato. La citazione [[…]] è uguale a `fonte`.', ' VIETATO «p. da verificare» o pagine inventate: se non hai letto la pagina, «BLOCCO: …» e non consegnare quella scheda.');
        sez('FASE 3 — CONSEGNA (niente troncamenti)');
        S.push(' - Un messaggio = ' + (pm === 2 ? '2 schede (36 domande); se il limite di output tronca il JSON, scendi a 1 scheda' : '1 scheda (18 domande)') + '. MAI accorciare spiegazioni o ridurre domande.', ' - Formato di ogni messaggio:', '   1. `STEP ' + ms + ' ' + step + ' · SCHEDA <n>' + (pm === 2 ? ' e <n+1>' : '') + ' di <N> · microstep <x.y.z>`', '   2. UN SOLO blocco ```json valido (doppi apici, zero virgole finali, nessun commento): { "formato": "quiz-v3", "parte": "' + pref + '-s<n>' + (pm === 2 ? '-<n+1>' : '') + '", "quiz": [ … ] } con `"scheda": "S<n>"` e `"categoria": "prioritaria"|"raffinamento"` in ogni domanda', '      Campi di ogni domanda: ' + CHIAVI_V3.join(', ') + ' (gemella solo se fa parte di una coppia).', '      livello = NUMERO 1–4 dalla sequenza; spiegazioneDistrattori e distractorTypes = 3 stringhe ciascuno, per opzioni[1], [2], [3].', '   3. `STATO: schede consegnate X/N — prossimo: <microstep>. Scrivi "avanti".`', ' - Dopo «avanti» consegni le schede successive: niente riassunti né conferme.', ' - Ultimo messaggio dello step: blocco ```json di CHIUSURA:', '   { "meta": { "schemaVersion": 2, "materia": "' + mat + '", "codiceMateria": "' + cod + '", "unita": "' + ud + '", "stepId": "' + pref + '", "sottoStep": "' + step + '", "titolo": "…", "archetipo": "' + arch + '", "fonti": [ … ] },', '     "programmaCalendario": { "formatoGeneraMjs": [ "' + cod + '|' + ud + '|…|N|' + step + '|…" ], "pianoStrutturato": { "materiaCodice": "' + cod + '", "step": "' + step + '", "origine": "ai_neuro", "durataTotaleMin": N, "blocchiBRAC": N,', '       "sottoSchede": [ { "codice": "' + step + '.<k>", "titolo": "…", "microstep": ["…"], "durataMin": 45|50, "wakefulRestMin": 12, "schedePrioritarie": ["' + pref + '-S01"], "schedeRaffinamento": ["…"], "fonte": "[[Manuale, pp. …]]" } ],', '       "ancoraggiRipassoFSRS": [ { "intervallo": "+1g", "target": [ID scheda], "livello": "L3" }, { "intervallo": "+3g", "target": [ID scheda], "livello": "L3-L4" }, { "intervallo": "+7g", "target": [ID scheda], "livello": "Raffinamento" } ] } } }', '   Ogni scheda compare in esattamente una sotto-scheda. Il file si chiama `' + ms + '_' + step.replace(/\./g, '_') + '_quiz_e_calendario.json` e va nella cartella «' + mat + ' quiz».');
        if (o.tabella) {
            S.push('');
            S.push(o.tabella);
        }
        if (o.gem)
            S.push('', 'Se le istruzioni del Gem chiedono id, esatta o conteggi (regole vecchie), valgono QUESTE: formato quiz-v3, giusta in opzioni[0].');
        sez('ESEMPIO DI FORMATO (non copiarne il contenuto: imita struttura e livello di dettaglio)');
        S.push('{"scheda":"S01","categoria":"prioritaria","livello":1,"tipoItem":"richiamo_attivo_…","erroreTipico":"Scambiare … con …",' +
            '"domanda":"…?","opzioni":["risposta corretta, non la più lunga","distrattore plausibile e dettagliato","distrattore plausibile e dettagliato","distrattore plausibile e dettagliato"],' +
            '"spiegazione":"COSA CHIEDE: … CONCETTO E MECCANISMO: … RISPOSTA ESATTA: A) «…». PERCHÉ GLI ALTRI NO: B) … C) … D) … IN SINTESI: … [[Manuale, p. X]]",' +
            '"spiegazioneDistrattori":["perché B è sbagliata …","perché C è sbagliata …","perché D è sbagliata …"],"distractorTypes":["confusione_…","inversione_…","caso_limite_…"],"fonte":"[[Manuale, p. X]]"}');
        sez('AUTOVERIFICA PRIMA DI OGNI CONSEGNA');
        S.push(' [ ] Livelli nell\'ordine della sequenza; la corretta in opzioni[0], breve, non contenuta in un distrattore.', ' [ ] Ogni spiegazione ha le 5 etichette, è completa, ha RISPOSTA ESATTA: A) e la citazione [[…]] uguale a `fonte`.', ' [ ] JSON valido: doppi apici, nessuna virgola finale; nessuna pagina «da verificare».', 'Non contare e non riepilogare: i conteggi e i controlli li fa l\'app. Parti ora dalla FASE 0.');
        return S.join('\n');
    }
    return { paginaLeggibile, indiceLettura, pagineCampione, segmentoDa, nomeLibro, numeroStampato, stimaOffset, slug, prossimo, RANGE_SCHEDE, SEQUENZA_LIVELLI, CHIAVI_V3, regolaArchetipo, costruisci };
})();

const StrumentiQuiz = (() => {
    const RE_VIETATI = /\bTB\b|TB\.pdf|testbusters|alpha ?test|editest/i;
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
    async function misura(f) {
        const L = await caricaPdfJs();
        const blob = await Drive.scaricaBlob(f.id);
        const doc = await L.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
        const tot = doc.numPages, base = (MasterPrompt.segmentoDa(f.name) || 1) - 1;
        const testi = [], campioni = [];
        for (const i of MasterPrompt.pagineCampione(tot)) {
            const p = await doc.getPage(i);
            const tc = await p.getTextContent();
            const t = tc.items.map(x => (x.str || '') + (x.hasEOL ? '\n' : ' ')).join('');
            testi.push(t);
            campioni.push({ pdf: base + i, testo: t });
        }
        let mappa = null;
        try {
            const et = await doc.getPageLabels();
            if (et)
                mappa = MappaPagine.daEtichette(et);
        }
        catch (e) {
            console.warn('[prompt quiz] etichette pagine', e);
        }
        if (mappa)
            mappa.tratti.forEach(t => { t.pdfDa += base; t.pdfA += base; });
        if (typeof doc.destroy === 'function')
            await doc.destroy();
        const offset = MasterPrompt.stimaOffset(campioni);
        return { lettura: MasterPrompt.indiceLettura(testi), offset, mappa: mappa || (offset === null ? null : { fonte: 'auto-stampati', tratti: [{ pdfDa: offset + 1, pdfA: MappaPagine.APERTO, stampDa: 1 }], affidabilita: 'stimata' }), pagine: tot };
    }
    function puntiDeboli(m) {
        const ms = MasterPrompt.slug(m.nome), cod = m.codice.toLowerCase();
        const per = new Map();
        for (const s of Stato.tutti('statq')) {
            const sk = String(s.sk || '').toLowerCase();
            if (!sk || !(sk.includes(ms) || sk.startsWith(cod + '-')))
                continue;
            const v = per.get(s.sk) || { n: 0, ok: 0 };
            v.n += s.n || 0;
            v.ok += s.ok || 0;
            per.set(s.sk, v);
        }
        return [...per.entries()].filter(([, v]) => v.n >= 3 && v.ok / v.n < 0.6).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)
            .slice(0, 6).map(([sk, v]) => sk + ' (' + Math.round(100 * v.ok / v.n) + '%)');
    }
    function idGiaUsati() {
        const out = [];
        for (const b of Stato.tutti('bancaimc'))
            for (const d of b.domande || [])
                if (d && d.id)
                    out.push(d.id);
        return out;
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
        const deboli = casella('Insisti sui miei punti deboli (dalle statistiche)', true);
        const note = area('Richieste particolari (facoltativo)', 2);
        const stato = h('p.piccolo.tenue', { role: 'status', 'aria-live': 'polite' });
        const elenco = h('div');
        const out = area('Master prompt da copiare in Gemini', 10, true);
        const info = h('p.piccolo.tenue');
        let gruppi = [];
        const altri = { slide: [], guide: [], quiz: [], vietati: [], indici: [] };
        const scelti = new Set();
        const materia = () => {
            const m = materie.find(x => x.codice === selMat.value) || null;
            const nome = m ? m.nome : altra.value.trim();
            return { m, nome, codice: m ? m.codice : nome.slice(0, 1).toUpperCase() };
        };
        selMat.addEventListener('change', () => { altra.hidden = !!selMat.value; });
        async function cercaDrive() {
            if (serveGoogle())
                return;
            const { nome } = materia();
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
            const fs = [...visti.values()];
            altri.slide = [];
            altri.guide = [];
            altri.quiz = [];
            altri.vietati = [];
            altri.indici = [];
            const libri = new Map();
            for (const f of fs) {
                const n = f.name, pdf = /\.pdf$/i.test(n) || f.mimeType === 'application/pdf';
                if (RE_VIETATI.test(n))
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
            gruppi = [...libri.entries()].map(([nomeL, files]) => ({ files: files.sort((a, b) => (MasterPrompt.segmentoDa(a.name) || 0) - (MasterPrompt.segmentoDa(b.name) || 0)),
                usa: true, libro: { nome: nomeL, pdf: files.map(f => f.name), segmenti: files.some(f => MasterPrompt.segmentoDa(f.name) !== null) } }));
            scelti.clear();
            [...altri.slide, ...altri.guide, ...altri.quiz, ...altri.indici].forEach(f => scelti.add(f.id));
            stato.textContent = fs.length ? 'Trovati ' + fs.length + ' file: togli la spunta a quelli da non usare e misura i libri.' : 'Nessun file trovato con il nome della materia: il prompt chiederà a Gemini di cercarli.';
            disegnaElenco();
        }
        function disegnaElenco() {
            elenco.textContent = '';
            if (gruppi.length)
                elenco.appendChild(h('p', null, h('b', null, '📚 Libri')));
            gruppi.forEach(g => {
                const c = h('input', { type: 'checkbox', checked: g.usa || undefined, 'aria-label': 'Usa ' + g.libro.nome });
                c.addEventListener('change', () => { g.usa = c.checked; });
                const esito = h('span.piccolo.tenue', null, g.libro.lettura ? descrivi(g) : g.files.length + ' PDF' + (g.libro.segmenti ? ' a segmenti' : ''));
                const b = h('button.chip', { type: 'button', 'aria-label': 'Misura la leggibilità di ' + g.libro.nome }, '📏 Misura leggibilità');
                b.addEventListener('click', async () => {
                    b.disabled = true;
                    esito.textContent = 'Scarico e leggo pagine campione…';
                    try {
                        const r = await misura(g.files[0]);
                        g.libro.lettura = r.lettura;
                        g.libro.offset = r.offset;
                        g.libro.mappa = r.mappa;
                        esito.textContent = descrivi(g);
                    }
                    catch (e) {
                        esito.textContent = '⚠️ ' + (e instanceof Error ? e.message : String(e));
                    }
                    b.disabled = false;
                });
                elenco.appendChild(h('div.riga', null, h('label', null, c, ' ' + g.libro.nome), h('div', null, esito, ' ', b)));
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
            sez('🧩 Quiz già fatti', altri.quiz, '(Gemini non li duplicherà)');
            if (altri.vietati.length)
                elenco.appendChild(h('p.piccolo', null, '🚫 Esclusi come fonte (eserciziari commerciali): ' + altri.vietati.map(f => f.name).slice(0, 8).join(', ')));
        }
        function descrivi(g) {
            const r = g.libro.lettura;
            if (!r)
                return '';
            const sim = r.giudizio === 'testo pieno' ? '🟢' : r.giudizio === 'parziale' ? '🟡' : '🔴';
            return sim + ' lettura ' + r.pct + '% (' + r.giudizio + ')' + (g.libro.mappa ? ' · pagine ' + (g.libro.mappa.affidabilita === 'esatta' ? 'dalle etichette del PDF' : 'stimate (PDF = libro + ' + g.libro.offset + ')') : ' · pagine non rilevate: si citano capitolo e paragrafo');
        }
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
            const nomi = (xs) => xs.filter(f => scelti.has(f.id)).map(f => f.name);
            const opz = {
                materia: nome, codice, step: step.value.trim(), titolo: titolo.value.trim() || undefined, data: data.value || undefined,
                archetipo: arch, etichettaArchetipo: def ? def.etichetta : arch, tono: Dominio.profilo().tonoSpiegazioneAI,
                intensita: intens.value, perMessaggio: perMsg.value === '1' ? 1 : 2, gem: gem.c.checked,
                libri: gruppi.filter(g => g.usa).map(g => g.libro), slide: nomi(altri.slide), guide: nomi(altri.guide), indici: nomi(altri.indici),
                quizEsistenti: nomi(altri.quiz), vietati: altri.vietati.map(f => f.name), idEsistenti: idGiaUsati(),
                puntiDeboli: deboli.c.checked && m ? puntiDeboli(m) : [], note: note.value.trim() || undefined,
            };
            out.value = MasterPrompt.costruisci(opz);
            const nonMisurati = (opz.libri || []).filter(l => !l.lettura).length;
            info.textContent = out.value.length.toLocaleString('it-IT') + ' caratteri' + (nonMisurati ? ' · ' + nonMisurati + ' libri non misurati: Gemini citerà capitolo e paragrafo.' : '') +
                ' · Allega a Gemini il Drive (o i file elencati), incolla il prompt, poi controlla ogni risposta con «🩺 Diagnostica quiz».';
        }
        const corpo = h('div', null, h('p.piccolo.tenue', null, 'Prepara il prompt completo per far creare a Gemini le schede di quiz di uno step, nel formato che l\'app importa. Più dati trova l\'app, più il prompt è mirato.'), selMat, altra, h('div.chips', null, step, data), titolo, intens, perMsg, gem.el, h('p.piccolo.tenue', null, 'Hai un Gem con le regole vecchie? Copia queste istruzioni nuove nel Gem: l\'app ora chiede il formato quiz-v3 e fa da sola ID, posizioni e conteggi.'), deboli.el, note, h('button.btn.neutro', { type: 'button', onclick: () => { cercaDrive(); } }, '🔎 Cerca materiale su Drive'), stato, elenco, h('button.btn', { type: 'button', onclick: genera }, '🧠 Genera il prompt'), out, info, h('div.chips', null, h('button.chip', { type: 'button', onclick: () => { if (out.value)
                copia(out.value, out); } }, '📋 Copia prompt'), h('button.chip', { type: 'button', onclick: () => { if (out.value)
                scarica('prompt-quiz-' + MasterPrompt.slug(materia().nome) + '-' + step.value.trim() + '.txt', out.value, 'text/plain'); } }, '💾 Scarica .txt'), h('button.chip', { type: 'button', onclick: () => diagnostica() }, '🩺 Diagnostica quiz')));
        foglio({ titolo: '🧠 Prompt quiz per Gemini', corpo });
    }
    return { diagnostica, prompt };
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
