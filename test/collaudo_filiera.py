# Collaudo di filiera del «motore unificato di studio» (S9, 27/11/2026): il percorso intero dello studente, non i blocchi da soli.
# 1 libro mai visto (PDF sintetico, pdf.js vero) → pagine trovate · 2 piano con esame tra 10 giorni (settimana finale) ·
# 3 Oggi «Adesso» e Studia ora · 4 quiz con errori → «Consolida» e carte per concetto · 5 padronanza in Statistiche ·
# 6 giorni simulati D+1/+3/+7: cosa torna da ripassare · 7 dati popolati e offline (service worker con i due chunk).
# 0 chiamate AI. pdf.js arriva da cdnjs; se la CDN non è raggiungibile (container) PDFJS_DIR indica una copia locale di pdfjs-dist 3.11.174/build.
import os, re, json, http.server, threading, functools, zlib
from playwright.sync_api import sync_playwright

RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128
http.server.SimpleHTTPRequestHandler.protocol_version = 'HTTP/1.1'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
PDFJS_DIR = os.environ.get('PDFJS_DIR')
err, rete_ai, falle = [], [], []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)
def falla(m):
    """Comportamento discutibile ma non un errore di codice: va deciso con l'utente."""
    print(' NOTA ' + m); falle.append(m)

# ---------- libro sintetico (materia mai vista: psichiatria), pagine vere note in anticipo ----------
LIBRO = [
  ('Prefazione', 'Questo manuale accompagna lo studente nei primi anni di formazione clinica. Ogni capitolo si apre con gli obiettivi e si chiude con le domande di verifica. Le parole chiave sono in grassetto nel testo originale.'),
  ('1. Neurotrasmettitori e sinapsi', 'La sinapsi chimica trasmette il segnale tra due neuroni attraverso i neurotrasmettitori. La dopamina, la serotonina e la noradrenalina sono monoammine sintetizzate da precursori aminoacidici. Il neurotrasmettitore liberato nella fessura sinaptica si lega ai recettori postsinaptici.'),
  ('Neurotrasmettitori: recettori', 'I recettori ionotropi aprono un canale ionico; i recettori metabotropi agiscono tramite proteine G. La ricaptazione presinaptica e gli enzimi come le monoamminossidasi terminano il segnale del neurotrasmettitore nella sinapsi.'),
  ('Neurotrasmettitori: vie', 'Le vie dopaminergiche mesolimbica, mesocorticale, nigrostriatale e tuberoinfundibolare hanno funzioni diverse. La serotonina origina dai nuclei del rafe. Il glutammato eccita, il GABA inibisce la sinapsi.'),
  ('2. Farmaci antipsicotici', 'I farmaci antipsicotici di prima generazione bloccano i recettori dopaminergici D2 nella via mesolimbica e riducono deliri e allucinazioni. Aloperidolo e clorpromazina sono antipsicotici tipici.'),
  ('Antipsicotici: effetti avversi', 'Il blocco D2 nella via nigrostriatale provoca effetti extrapiramidali: distonia acuta, acatisia, parkinsonismo e discinesia tardiva. Il blocco nella via tuberoinfundibolare aumenta la prolattina. La sindrome maligna da neurolettici è rara ma grave.'),
  ('Antipsicotici atipici', 'Gli antipsicotici atipici come clozapina, olanzapina e risperidone bloccano anche i recettori serotoninergici 5-HT2A. La clozapina è indicata nella schizofrenia resistente e richiede il controllo dei neutrofili per il rischio di agranulocitosi.'),
  ('3. Disturbi d\'ansia', 'Il disturbo d\'ansia generalizzata comporta preoccupazione eccessiva per almeno sei mesi. Il disturbo di panico si manifesta con attacchi improvvisi di paura intensa, palpitazioni e timore di morire.'),
  ('Ansia: fobie e diagnosi', 'Le fobie specifiche e il disturbo d\'ansia sociale si basano sull\'evitamento. La diagnosi differenziale dell\'ansia esclude ipertiroidismo, uso di sostanze e cardiopatie.'),
  ('Ansia: terapia', 'Le benzodiazepine potenziano il recettore GABA-A e danno sollievo rapido dell\'ansia, ma causano tolleranza e dipendenza. Gli inibitori selettivi della ricaptazione della serotonina sono la terapia di prima scelta a lungo termine, insieme alla terapia cognitivo comportamentale.'),
  ('Esercizi', 'Esercizio 1: quale via dopaminergica spiega gli effetti extrapiramidali? Esercizio 2: perché la clozapina richiede il controllo dei neutrofili? Esercizio 3: confronta benzodiazepine e inibitori della ricaptazione nel disturbo di panico.'),
  ('Bibliografia', 'Testi consigliati per approfondire. Indice analitico. Ringraziamenti agli autori e ai revisori del volume.'),
]
VERE = {'Neurotrasmettitori e sinapsi': {2, 3, 4}, 'Farmaci antipsicotici': {5, 6, 7}, 'Disturbi d\'ansia': {8, 9, 10}}

def pdf_testo(pagine):
    """PDF 1.4 minimo, solo testo (Helvetica, WinAnsi), una pagina per voce: titolo + righe da ~80 caratteri."""
    ogg = []
    def riga(s): return '(' + s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)') + ') Tj T*'
    kids = []
    font = 3
    ogg.append(b'<< /Type /Catalog /Pages 2 0 R >>')
    ogg.append(None)   # Pages, dopo
    ogg.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    for tit, testo in pagine:
        parole, righe, cur = testo.split(), [], ''
        for w in parole:
            if len(cur) + len(w) + 1 > 80: righe.append(cur); cur = w
            else: cur = (cur + ' ' + w).strip()
        if cur: righe.append(cur)
        corpo = 'BT /F1 16 Tf 18 TL 60 760 Td ' + riga(tit) + ' /F1 11 Tf 14 TL T* ' + ' '.join(riga(r) for r in righe) + ' ET'
        dati = corpo.encode('cp1252')
        ogg.append(b'<< /Length %d >>\nstream\n' % len(dati) + dati + b'\nendstream')
        cont = len(ogg)
        ogg.append(b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents %d 0 R >>' % cont)
        kids.append(len(ogg))
    ogg[1] = b'<< /Type /Pages /Kids [' + b' '.join(b'%d 0 R' % k for k in kids) + b'] /Count %d >>' % len(kids)
    out, pos = bytearray(b'%PDF-1.4\n'), []
    for i, o in enumerate(ogg, 1):
        pos.append(len(out)); out += b'%d 0 obj\n' % i + o + b'\nendobj\n'
    x = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(ogg) + 1) + b''.join(b'%010d 00000 n \n' % p for p in pos)
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(ogg) + 1, x)
    return bytes(out)

def prepara(ctx):
    ctx.route(re.compile(r'https://(api\.groq\.com|generativelanguage\.googleapis\.com|api\.xkiro\.com|api\.cohere\.com|router\.requesty\.ai)/.*'),
              lambda r: (rete_ai.append(r.request.url), r.abort()))
    if PDFJS_DIR:
        ctx.route(re.compile(r'https://cdnjs\.cloudflare\.com/ajax/libs/pdf\.js/3\.11\.174/(pdf(\.worker)?\.min\.js)'),
                  lambda r: r.fulfill(path=os.path.join(PDFJS_DIR, r.request.url.rsplit('/', 1)[1]), content_type='application/javascript'))

def pagina(ctx, quando):
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time=quando)
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("!!Studio.pkPiano() && Studio.pkStep().length >= 3")
    return pg

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(bypass_csp=True, viewport={'width': 390, 'height': 844}, locale='it-IT', timezone_id='Europe/Rome')
    prepara(ctx)

    # ---------- 1. libro mai visto ----------
    print('— 1. Libro mai visto (PDF sintetico, %d pagine, pdf.js vero)' % len(LIBRO))
    pg = pagina(ctx, '2026-11-12T09:00:00+01:00')
    pg.evaluate('caricaStrumentiQuiz()'); pg.wait_for_function("typeof Centro !== 'undefined'")
    b = list(pdf_testo(LIBRO))
    res = pg.evaluate("""async ([b, query]) => {
      const blob = new Blob([new Uint8Array(b)], { type: 'application/pdf' });
      const testi = (await TestoPdf.tutte(blob, null, 'eol')).map((testo, i) => ({ n: i + 1, testo }));
      const l = { id: 'libro-x', nome: 'Manuale di psichiatria', indice: [], mappa: null, pdf: [{ nome: 'psichiatria.pdf' }] };
      const out = {};
      for (const q of query) { const t = Centro.pagineTrovate(l, testi, q, [q], { radice: Locale.radice, espandi: Locale.espandi });
        out[q] = { pagine: t.pagine && [t.pagine.pdfDa, t.pagine.pdfA], stato: t.copertura.stato, riscontri: t.copertura.riscontri.map(r => r.n), riga: Centro.descriviTrovate(t) }; }
      return { n: testi.length, vuote: testi.filter(t => !t.testo.trim()).length, accenti: testi[7].testo.includes("d'ansia"), out };
    }""", [b, list(VERE)])
    ok(res['n'] == len(LIBRO) and res['vuote'] == 0 and res['accenti'], 'testo estratto da tutte le %d pagine (vuote %d, apostrofi intatti %s)' % (res['n'], res['vuote'], res['accenti']))
    for q, vere in VERE.items():
        o = res['out'][q]; trov = set(range(o['pagine'][0], o['pagine'][1] + 1)) if o['pagine'] else set()
        ric = len(trov & vere) / len(vere); prec = len(trov & vere) / len(trov) if trov else 0
        ok(ric == 1, '«%s»: richiamo %d%% (pagine %s, vere %s)' % (q, ric * 100, sorted(trov), sorted(vere)))
        print('        precisione %d%% · stato %s · riscontri %s · «%s»' % (prec * 100, o['stato'], o['riscontri'], o['riga']))
        if prec < 0.8: falla('«%s»: precisione %d%% < 80%% (pagine in più: %s)' % (q, prec * 100, sorted(trov - vere)))
    pg.close()

    # ---------- 2. piano dal Generatore: esame tra 10 giorni, settimana finale 7 ----------
    print('— 2. Piano: esame 22/11, inizio 13/11, settimana finale 7 giorni di calendario')
    pg = pagina(ctx, '2026-11-12T09:00:00+01:00')
    pg.evaluate("UI.studioVista = 'piano'; vai('studio')"); pg.wait_for_timeout(200)
    pg.click('text=＋ Crea piano'); pg.click('.dialogo button:has-text("Uso le schede")'); pg.wait_for_selector('.gen-passi')
    for i, d in ((0, '2026-11-22'), (1, '2026-11-13')):
        pg.locator('.visore input[type=date]').nth(i).fill(d); pg.locator('.visore input[type=date]').nth(i).dispatch_event('change')
    pg.click('.segmenti button:has-text("Prima passata")')
    pg.click('.gen-piede button:has-text("Avanti")'); pg.wait_for_selector('.gen-arg')
    n_cat = pg.locator('.gen-arg input:checked').count()
    for _ in range(3): pg.click('.gen-piede button:has-text("Avanti")')
    pg.wait_for_selector('.gen-anteprima'); ante = pg.inner_text('.gen-anteprima')
    avv = pg.inner_text('.gen-avvisi') if pg.locator('.gen-avvisi').count() else ''
    print('        anteprima: ' + ante.replace('\n', ' | ')[:200]); print('        avvisi: ' + (avv.replace('\n', ' | ') or '—'))
    pg.click('text=✓ Crea il piano'); pg.wait_for_timeout(400)
    if pg.locator('.dialogo').count(): print('        dialogo: ' + pg.inner_text('.dialogo').replace('\n', ' | ')[:200]); pg.click('.dialogo button:has-text("Sì, nascondi")') if pg.locator('.dialogo button:has-text("Sì, nascondi")').count() else pg.keyboard.press('Escape')
    pg.wait_for_timeout(300)
    piano = pg.evaluate("Studio.pkPiani().filter(p => /^gen-/.test(p.id)).pop() || null")
    ok(piano is not None, 'piano creato e salvato')
    giorni = {g['data']: [v['k'] for v in g['voci']] for g in piano['giorni']}
    fin = sorted(d for d, ks in giorni.items() if any(k.startswith('FINALE') for k in ks))
    nuovi_in_fin = [(d, k) for d in fin for k in giorni[d] if not re.match(r'^(FINALE|RIPOSO|SIM|REV|RISERVA|G2-)', k)]
    ok(fin and fin[0] >= '2026-11-15' and fin[-1] <= '2026-11-21', 'settimana finale dentro D−7…D−1 (%s…%s)' % (fin[:1], fin[-1:]))
    ok(not nuovi_in_fin, 'nessun argomento nuovo nella settimana finale (%s)' % nuovi_in_fin[:3])
    ok(giorni.get('2026-11-21', [''])[0] == 'RIPOSO', 'vigilia di riposo il 21/11')
    arg = [k for ks in giorni.values() for k in ks if not re.match(r'^(FINALE|RIPOSO|SIM|REV|RISERVA|G2-)', k)]
    print('        argomenti nel piano %d su %d del catalogo; giorni con argomenti nuovi: %d' % (len(set(arg)), n_cat, sum(1 for d, ks in giorni.items() if d < '2026-11-15' and any(k in arg for k in ks))))
    if len(set(arg)) < n_cat:
        ok(str(n_cat - len(set(arg))) + ' argomenti non entrano' in avv, 'l\'anteprima avvisa che %d argomenti non entrano' % (n_cat - len(set(arg))))
        ok('settimana finale' in avv and 'guadagni' in avv, 'F3: l\'avviso nomina la settimana finale e quanti giorni si guadagnano con 3')
    pg.close()

    # ---------- 3. Oggi «Adesso» e Studia ora (13/11, primo giorno del piano) ----------
    print('— 3. Oggi e Studia ora il 13/11')
    pg = pagina(ctx, '2026-11-13T15:00:00+01:00')
    pg.wait_for_function("(() => { const c = document.querySelector('.card.adesso'); return !!c && !/…/.test(c.innerText); })()", timeout=8000)
    ad = pg.inner_text('.card.adesso'); print('        Adesso: ' + ad.replace('\n', ' | ')[:160])
    ok('Inizia' in ad, 'card «Adesso» pronta con [Inizia]')
    es = pg.inner_text('.oggi-esami') if pg.locator('.oggi-esami').count() else ''   # redesign blocco 4: il conto alla rovescia sta sotto la data di Oggi
    ok('9 giorni' in es, 'F4: Oggi conta i giorni all\'esame del piano generato (22/11 → 9 giorni): %s' % es.replace('\n', ' | '))
    for minuti in (25, 50, 90):
        pr = pg.evaluate("StudiaOraUI && StudiaOra.proposta(%d)" % minuti) if False else pg.evaluate("(() => { const p = StudiaOra.proposta(%d); return { ob: p.obiettivo, v: p.voci.map(v => [v.tipo, v.min, v.titolo, v.motivo || '']), es: p.esclusi.length }; })()" % minuti)
        tot = sum(v[1] for v in pr['v'])
        ok(tot <= minuti and len(pr['v']) >= 2, '%d min: %d voci, totale %d min, obiettivo %s' % (minuti, len(pr['v']), tot, pr['ob']))
        print('          ' + ' · '.join('%s %d' % (v[0], v[1]) for v in pr['v']))
    piano_oggi = pg.evaluate("Studio.vociDelGiorno(new Date('2026-11-13T12:00')).filter(x => /^gen-/.test(x.p.id)).map(x => x.v.k)")
    p50 = pg.evaluate("StudiaOra.proposta(50).voci.map(v => v.k || '')")
    ok(any(k in p50 for k in piano_oggi), 'Studia ora 50 min contiene un argomento del piano di oggi (%s → %s)' % (piano_oggi, [k for k in p50 if k]))
    pg.close()

    # ---------- 4. quiz con errori → «Consolida» ----------
    print('— 4. Quiz su un argomento di oggi con 2 errori')
    pg = pagina(ctx, '2026-11-13T16:00:00+01:00')
    pg.evaluate("try { localStorage.setItem('imc-quiz-modo','neuro') } catch (e) {}")
    sk = pg.evaluate("""async (ks) => { for (const k of ks) { const t = Studio.trovaSotto(k); if (!t) continue;
        for (const s of Studio.schedeDi(t.sub).filter(x => x.tipo === 'P')) { const st = +s.id.split('-')[1].split('.')[0]; const B = await Banca.carica(st, s.id[0]);
          if (B && B.domande.filter(d => d.sk === s.id).length >= 5) return s.id; } } return null; }""", piano_oggi)
    if not sk: falla('nessuna scheda del piano di oggi ha ≥ 5 domande in banca: uso C-3.1.1-1'); sk = 'C-3.1.1-1'
    print('        scheda: ' + sk)
    TROVA = """async (sk) => { const B = await Banca.carica(+sk.split('-')[1].split('.')[0], sk[0]); const N = s => String(s).replace(/<[^>]+>/g, ' ').replace(/[^A-Za-z0-9àèéìòù]+/g, '').toLowerCase();
        const vis = N(document.querySelector('.qz-domanda').textContent);
        const c = B.domande.filter(d => d.sk === sk).map(d => ({ d, k: N(d.q).slice(0, 40) })).filter(x => x.k && vis.includes(x.k)).sort((a, b) => b.k.length - a.k.length);
        return c.length ? c[0].d : null; }"""
    def rispondi(giusto):
        pg.click('.qz-cert [data-cert="3"]')
        d = pg.evaluate(TROVA, sk); assert d, 'domanda mostrata non trovata nella banca'
        if d['t'] == 'mcq':
            pg.evaluate("""([o, giusto]) => { const N = s => String(s).replace(/<[^>]+>/g, ' ').replace(/[^A-Za-z0-9àèéìòù]+/g, '').toLowerCase();
                const bg = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
                const dice = (a, b) => { const A = bg(a), B = bg(b); let c = 0, n = 0; A.forEach((v, g) => { c += Math.min(v, B.get(g) || 0); n += v; }); B.forEach(v => { n += v; }); return n ? 2 * c / n : 0; };
                const b = [...document.querySelectorAll('.qz-opz-b')], t = b.map(x => N(x.textContent)); const sim = t.map(x => o.map(y => dice(x, N(y))));
                const giu = sim.map(r => r.indexOf(Math.max(...r)) === 0); const i = giusto ? sim.map(r => r[0]).indexOf(Math.max(...sim.map(r => r[0]))) : giu.indexOf(false); b[i].click(); }""", [d['o'], giusto])
        else:
            pg.fill('#qz-ans', d['a'][0] if giusto else 'risposta volutamente sbagliata zzz'); pg.click('.qz-fill button[type=submit]')
        pg.wait_for_selector('#qz-why'); return d
    pg.evaluate("(sk) => { const t = trovaScheda(sk); QuizApp.apri(t.pk, t.m, t.micro, t.s); }", sk); pg.wait_for_selector('.qz-domanda', timeout=8000)
    n = pg.locator('.qz-metro span').count(); sbagliate = []
    for k in range(n):
        if k: pg.click('[data-az=avanti]')
        d = rispondi(k >= 2)
        if k < 2: sbagliate.append(d['id'])
    pg.click('[data-az=avanti]'); pg.wait_for_selector('.qz-punti')
    pg.wait_for_selector('.finequiz', timeout=8000)
    fq = pg.inner_text('.finequiz'); print('        Consolida: ' + fq.replace('\n', ' | ')[:220])
    ok('illusion' in fq and 'Flashcard' in fq, 'riquadro «Consolida» con le 2 illusioni e le flashcard (%d domande)' % n)
    con = pg.evaluate("(sk) => Stato.tutti('memoria').filter(m => m.er.startsWith('con:' + sk + '|')).map(m => [m.etichetta, m.ver[m.ver.length - 1], m.due, !!m.ripiego])", sk)
    print('        concetti: ' + '; '.join('%s %s due %s%s' % (c[0], c[1][1:], c[2], ' (ripiego)' if c[3] else '') for c in con))
    ok(len(con) >= 1, 'padronanza per concetto registrata (%d concetti)' % len(con))
    pg.click('[data-fine=carte]'); pg.wait_for_timeout(400)
    carte = pg.evaluate("Carte.carteDi('mz-errori').map(c => [c.tag, c.origine && c.origine.concetto, (c.f || '').slice(0, 70)])")
    print('        carte: ' + ' | '.join('%s [%s] %s' % tuple(c) for c in carte))
    ok(1 <= len(carte) <= 2, 'carte mirate create dagli errori, una per concetto (%d)' % len(carte))
    sub = pg.evaluate("(sk) => { const t = trovaScheda(sk); const m = Stato.prendi('mem-sub-' + t.k); return { k: t.k, due: m && m.due, esposto: m && m.esposto }; }", sk)
    print('        step %s: prossimo ripasso %s' % (sub['k'], sub['due']))
    pg.close()

    # ---------- 5. padronanza in Statistiche ----------
    print('— 5. Statistiche › Padronanza per concetto')
    pg = pagina(ctx, '2026-11-13T18:00:00+01:00')
    pg.evaluate("UI.studioVista = 'statistiche'; vai('studio')"); pg.wait_for_function("document.body.innerText.includes('Padronanza per concetto')", timeout=8000)
    pg.wait_for_timeout(800)
    sez = pg.evaluate("(() => { const h = [...document.querySelectorAll('h2, h3')].find(x => /Padronanza per concetto/.test(x.textContent)); const s = h && h.closest('section'); return s ? s.innerText : ''; })()")
    print('        ' + sez.replace('\n', ' | ')[:260])
    ok(re.search(r'\d+ di \d+', sez) is not None and 'Rifai' in sez or 'Inizia' in sez, 'vista: «N di M» e un\'azione')
    pg.close()

    # ---------- 6. giorni simulati ----------
    print('— 6. Cosa torna nei giorni dopo (sk %s, sbagliate %s)' % (sk, sbagliate))
    # storico realistico: altre 5 schede già verificate il 13/11 (Concetti.aggiorna, la stessa funzione del fine quiz)
    pg = pagina(ctx, '2026-11-14T08:00:00+01:00'); pg.evaluate('caricaMotoreStudio()'); pg.wait_for_function("typeof Concetti !== 'undefined'")
    seme = pg.evaluate("""async () => { const out = [];
      for (const [st, m] of [[2, 'C'], [2, 'B'], [3, 'B'], [2, 'F'], [3, 'F']]) { const B = await Banca.carica(st, m); if (!B) continue;
        const sk = Object.keys(B.schede).find(k => trovaScheda(k) && Concetti.etichette(B.schede[k].focus || '').length >= 3); if (!sk) continue;
        const et = Concetti.etichette(B.schede[sk].focus).slice(0, 3);
        et.forEach((e, i) => { const ch = Concetti.chiave(sk, e), id = 'mem-con-' + Carte.hash(ch);
          Stato.salva(Concetti.aggiorna(undefined, { id, chiave: ch, sk, etichetta: e, ripiego: false, nEt: et.length }, [{ ok: true }, { ok: i !== 0 }, { ok: true }], '2026-11-13'), true); });
        out.push(sk); } return out; }""")
    print('        storico seminato: %s' % seme); ok(len(seme) >= 4, 'storico di %d schede in 3 materie' % len(seme))
    pg.close()
    for g in ('2026-11-14', '2026-11-16', '2026-11-20', '2026-11-23'):
        pg = pagina(ctx, g + 'T15:00:00+01:00'); pg.evaluate('caricaMotoreStudio()'); pg.wait_for_function("typeof StudiaOra !== 'undefined'")
        r = pg.evaluate("""([sk, g]) => { const coda = CodaRipasso.dovuti().map(e => e.sorgente + ':' + (e.voce.id || '') + ' ' + e.sotto);
          const p = StudiaOra.proposta(50);
          const scad = Stato.tutti('memoria').filter(m => m.er.startsWith('con:' + sk + '|') && !m.ripiego && m.due <= g).map(m => m.etichetta);
          return { coda, scad, esc: p.esclusi.map(e => e.titolo + ' → ' + e.perche), tot: p.voci.reduce((t, v) => t + v.min, 0), qr: QuizRifare.dovute().length, voci: p.voci.map(v => v.tipo + ':' + (v.id || v.k || '') + ' ' + v.min),
                   conc: p.voci.filter(v => v.tipo === 'concetti').map(v => [v.id, v.con, v.motivo]), fin: Studio.vociDelGiorno(new Date(g + 'T12:00')).map(x => x.v.k).filter(k => /^(FINALE|SIM-|REV-)/.test(k)).join(' ') }; }""", [sk, g])
        print('    %s  coda: %s' % (g, r['coda'][:5]))
        print('              Studia ora 50 → %d min: %s' % (r['tot'], r['voci'])); print('              esclusi: %s' % (r['esc'][:4] or '—'))
        if g == '2026-11-14': ok(r['qr'] >= 2 and any(c.startswith('quiz:') for c in r['coda']), 'D+1: le 2 domande sbagliate tornano in «Quiz da rifare»')
        if g == '2026-11-14':
            pg.evaluate("vai('oggi')"); pg.wait_for_selector('.card.ripassa'); rip = pg.inner_text('.card.ripassa')
            ok('concett' in rip and 'Verifica concetti' in rip, 'Oggi «Ripassa»: conta i concetti e mostra la verifica (%s)' % rip.split('\n')[1][:90])
            pg.locator('.card.ripassa button', has_text='Verifica concetti').first.click(); pg.wait_for_selector('.qz-domanda', timeout=8000)
            ok('il punteggio della scheda non cambia' in pg.inner_text('.qz-testa').lower(), 'dal tocco in Oggi si apre la mini-verifica, dichiarata come tale')
            pg.keyboard.press('Escape')
        # fase 12 (27/11): D−3 simulazione, D−2 revisione dei suoi errori (come il Pianificatore), gli altri giorni FINALE
        if g == '2026-11-16': ok(r['fin'].startswith('SIM-'), 'D−6: simulazione nella settimana finale (%s)' % r['fin'])
        if g == '2026-11-20': ok(r['fin'].startswith('REV-'), 'D−2: revisione degli errori della simulazione di D−3 (%s)' % r['fin'])
        if r['scad'] and g < '2026-11-22':
            in_so = any(x[0] == sk for x in r['conc']) or any('non entra nel tempo' in e for e in r['esc'])
            ok(any(c.startswith('concetti:' + sk) for c in r['coda']) and in_so, 'F2 %s: concetti scaduti %s → «Verifica concetti» in Oggi; in Studia ora o escluso solo per il tempo' % (g, r['scad']))
        if r['fin']:
            saturo = r['tot'] >= 38 and all('non entra nel tempo' in e or 'metodo' in e for e in r['esc'])
            ok(saturo and len(r['conc']) >= 3 and len({x[0][0] for x in r['conc']}) >= 2, 'F1 %s (settimana finale): Studia ora 50 min → %d min (sessione satura), %d verifiche di concetti, materie %s' % (g, r['tot'], len(r['conc']), ''.join(sorted({x[0][0] for x in r['conc']}))))
        if g == '2026-11-16':
            # la mini-verifica fino in fondo: tutte giuste → padronanza avanzata, punteggio della scheda invariato
            prima = pg.evaluate("(sk) => (Studio.prog(sk) || {}).punteggio", sk)
            v = pg.evaluate("(sk) => StudiaOra.proposta(50).voci.find(v => v.tipo === 'concetti' && v.id === sk) || null", sk)
            pg.evaluate("(v) => eseguiVoce(v)", v); pg.wait_for_selector('.qz-domanda', timeout=8000)
            nq = pg.locator('.qz-metro span').count()
            for k in range(nq):
                if k: pg.click('[data-az=avanti]')
                rispondi(True)
            pg.click('[data-az=avanti]'); pg.wait_for_selector('.qz-punti'); pg.wait_for_timeout(600)
            dopo = pg.evaluate("""([sk, et]) => ({ p: (Studio.prog(sk) || {}).punteggio, nota: (Studio.prog(sk) || {}).nota || '',
              con: Stato.tutti('memoria').filter(m => m.er.startsWith('con:' + sk + '|') && et.includes(m.etichetta)).map(m => [m.etichetta, m.ver[m.ver.length - 1], m.due, Concetti.stato(m, '2026-11-16').stato]) })""", [sk, v['con']])
            print('        mini-verifica %d domande su %s → %s' % (nq, v['con'], dopo['con']))
            ok(nq == 3 * len(v['con']) or nq >= len(v['con']), 'mini-verifica: %d domande per %d concetti' % (nq, len(v['con'])))
            ok(dopo['p'] == prima and 'Verifica concetti 16/11' in dopo['nota'], 'punteggio della scheda invariato (%s) e verifica annotata' % prima)
            ok(all(c[1][0] == '2026-11-16' and c[2] > '2026-11-16' for c in dopo['con']), 'padronanza aggiornata il 16/11 e nuova scadenza nel futuro')
            r2 = pg.evaluate("(sk) => CodaRipasso.dovuti().some(e => e.sorgente === 'concetti' && e.voce.id === sk)", sk)
            ok(not r2, 'dopo la verifica la scheda esce dalla coda dei concetti')
        pg.close()

    # ---------- 7. dati popolati, offline con i due chunk ----------
    print('— 7. Offline: service worker e chunk in cache')
    c2 = br.new_context(bypass_csp=True, viewport={'width': 390, 'height': 844}, locale='it-IT', timezone_id='Europe/Rome', service_workers='allow'); prepara(c2)
    pg = c2.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    print('        service worker: ' + str(pg.evaluate("'serviceWorker' in navigator ? navigator.serviceWorker.getRegistration().then(r => r ? (r.active ? 'attivo' : 'in installazione') : 'non registrato') : 'non supportato'")))
    pg.evaluate("""async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
      for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100)); }"""); pg.wait_for_timeout(1500)
    pg.reload(); pg.wait_for_selector('.tabbar'); pg.wait_for_timeout(500)
    cache = pg.evaluate("caches.keys().then(ks => Promise.all(ks.filter(k => /^imc-/.test(k)).map(k => caches.open(k).then(c => c.keys()).then(r => r.map(x => new URL(x.url).pathname))))).then(a => a.flat())")
    ok(any(x.endswith('/motore-studio.js') for x in cache) and any(x.endswith('/strumenti-quiz.js') for x in cache), 'in cache offline: motore-studio.js e strumenti-quiz.js')
    c2.set_offline(True); pg.reload(); pg.wait_for_selector('.tabbar', timeout=15000)
    pg.evaluate("conMotoreStudio(() => StudiaOraUI.scegli())"); pg.wait_for_timeout(1500)
    ok(pg.evaluate("typeof StudiaOraUI") == 'object', 'offline: Studia ora si apre (motore dal service worker)')
    pg.evaluate("document.querySelectorAll('.foglio-sfondo, dialog').forEach(e => e.remove()); conStrumentiQuiz(() => CentroUI.apri())"); pg.wait_for_timeout(1500)
    ok(pg.evaluate("typeof CentroUI") == 'object', 'offline: il Centro si apre (strumenti dal service worker)')
    c2.close()

print('\nNote da decidere: %d' % len(falle)); [print('  - ' + f) for f in falle]
ok(not rete_ai, 'nessuna chiamata AI (%d)' % len(rete_ai))
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
