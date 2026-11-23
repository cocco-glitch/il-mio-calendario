# Test v0.63 «Centro di creazione»: ospite con un piano di Biologia 3.3 (2 schede) già fatto.
# Risposta incollata → Controllo trova 1 errore → Correggi con patch → ricontrollo verde → salta la prova →
# Importa solo il microstep 3.3.1 → innesto con 1 scheda; reimport → stesso innesto, nessun doppione; lista esclusi precompilata.
# v0.63.1: al Controllo le citazioni si verificano su un PDF scelto dal dispositivo (p. 2 → pagina accanto).
import os, json, http.server, threading, functools, tempfile
from playwright.sync_api import sync_playwright
RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128
http.server.SimpleHTTPRequestHandler.protocol_version = 'HTTP/1.1'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err = []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)

OGGI = '2026-11-20'
CRE = {'id': 'cre-biologia-3.3', 'type': 'creazione', 'updatedAt': 0, 'materia': 'bio', 'nomeMateria': 'Biologia', 'step': '3.3', 'intensita': 'standard',
       'piano': {'step': '3.3', 'blocchi': ['B1'], 'avvisi': [], 'schede': [{'n': 1, 'micro': ['3.3.1'], 'categoria': 'prioritaria', 'blocco': 'B1'},
                                                                          {'n': 2, 'micro': ['3.3.2'], 'categoria': 'prioritaria', 'blocco': 'B1'}]},
       'schede': [{'n': 1, 'stato': 'da-fare'}, {'n': 2, 'stato': 'da-fare'}], 'esiti': {}}
def dom(s, k, rotta=False):
    op = ['Giusta %d' % k, 'Falsa a %d' % k, 'Falsa b %d' % k] + ([] if rotta else ['Falsa c %d' % k])
    return {'scheda': 'S0%d' % s, 'livello': 1 + k % 4, 'tipoItem': 'concetto', 'domanda': 'Domanda %d.%d sulla glicolisi e il suo bilancio energetico?' % (s, k),
            'opzioni': op, 'coppiaGemellaId': None, 'erroreTipico': 'Confondere resa netta e lorda di ATP (%d.%d)' % (s, k),
            'spiegazioneDistrattori': ['B è sbagliata perché confonde la fase preparatoria con quella di recupero %d' % k,
                                       'C è sbagliata perché attribuisce il NADH al ciclo di Krebs invece che alla glicolisi %d' % k,
                                       'D è sbagliata perché ignora le due molecole di ATP investite all inizio %d' % k],
            'distractorTypes': ['confusione di fase', 'attribuzione errata', 'omissione'],
            'spiegazione': 'RISPOSTA ESATTA: A) Giusta. PERCHÉ GLI ALTRI NO: B) no. C) no. D) no.', 'fonte': '[[Manuale, p. %d]]' % k}
RISPOSTA = 'Ecco le schede:\n```json\n' + json.dumps({'formato': 'quiz-v3', 'step': '3.3', 'quiz': [dom(1, k, k == 5) for k in range(1, 19)] + [dom(2, k) for k in range(1, 19)]}, ensure_ascii=False) + '\n```'
CRE['fonti'] = {'libri': [{'nome': 'Manuale', 'pdf': ['Manuale.pdf']}], 'slide': [], 'guide': [], 'indici': [], 'quiz': [], 'vietati': []}
MAPPA = {'fonte': 'auto-etichette', 'tratti': [{'pdfDa': 5, 'pdfA': 99999, 'stampDa': 1}], 'affidabilita': 'esatta'}

def pdf_libro(path):
    """PDF minimo di 24 pagine (i–iv, poi 1…20): ogni pagina parla di glicolisi tranne la 2 stampata (PDF 6)."""
    objs = []
    def add(s): objs.append(s); return len(objs)
    font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    kids = []
    for i in range(1, 25):
        righe = ['Premessa'] if i <= 4 else (['Capitolo sulla membrana plasmatica e i suoi trasportatori.'] if i == 6
                 else ['Capitolo: la glicolisi e il bilancio energetico.', 'Domanda di ripasso.'])
        stream = '\n'.join('BT /F1 11 Tf 60 %d Td (%s) Tj ET' % (760 - 18 * k, r) for k, r in enumerate(righe))
        cid = add('<< /Length %d >>\nstream\n%s\nendstream' % (len(stream.encode('latin-1')), stream))
        kids.append(add(str(cid)))
    pages = add('<< /Type /Pages /Kids [%s] /Count %d >>' % (' '.join('%d 0 R' % k for k in kids), len(kids)))
    for k in kids:
        objs[k - 1] = '<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 %d 0 R >> >> /Contents %s 0 R >>' % (pages, font, objs[k - 1])
    root = add('<< /Type /Catalog /Pages %d 0 R /PageLabels << /Nums [0 << /S /r >> 4 << /S /D >>] >> >>' % pages)
    out = b'%PDF-1.4\n'; offs = []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += ('%d 0 obj\n%s\nendobj\n' % (i, o)).encode('latin-1')
    x = len(out)
    out += ('xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1)).encode() + b''.join(('%010d 00000 n \n' % o).encode() for o in offs)
    out += ('trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, root, x)).encode()
    with open(path, 'wb') as f: f.write(out)
PDF = os.path.join(tempfile.mkdtemp(), 'Manuale.pdf'); pdf_libro(PDF)

INNESTI = """JSON.stringify(Stato.tutti('innesto').filter(r => !r.deleted).map(x => ({ k: x.k, micro: x.sub.microstep.map(m => m.n + ':' + m.schede.length),
  dom: x.banche.reduce((a, sk) => a + ((Stato.prendi('bq-' + sk) || {}).domande || []).length, 0) })))"""

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 375, 'height': 800}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time=OGGI + 'T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    # ospite: niente pacchetto né esame; fixture del Centro al passo 3
    pg.evaluate("""(cre => { localStorage.removeItem('imc-centro-esclusi');
      for (const t of ['pacchetto', 'esame', 'creazione', 'parteq', 'innesto']) for (const r of Stato.tutti(t)) Stato.elimina(r.id);
      for (const r of Stato.tutti('libro')) Stato.elimina(r.id);
      Stato.salva(cre, true); conStrumentiQuiz(() => {
        Stato.salva({ id: Centro.idLibro('Biologia', 'Manuale'), type: 'libro', updatedAt: 0, nome: 'Manuale', materia: 'Biologia',
          pdf: [{ nome: 'Manuale.pdf' }], fonte: 'auto', mappa: %s }, true);
        CentroUI.apri(); }); })(%s)""" % (json.dumps(MAPPA), json.dumps(CRE, ensure_ascii=False)))
    pg.wait_for_selector('.centro-zona', timeout=10000)
    passo = lambda: pg.locator('.centro-passo').inner_text()
    zona = lambda: pg.locator('.centro-zona')
    ok('Passo 3 di 7' in passo(), 'il Centro riapre la creazione al passo 3 (Quiz)')

    pg.locator('textarea[aria-label^="Risposta dell"]').fill(RISPOSTA)
    zona().get_by_role('button', name='Leggi la risposta').click(); pg.wait_for_timeout(300)
    sc = pg.evaluate("Stato.prendi('cre-biologia-3.3').schede.map(s => s.stato).join(',')")
    ok(sc == 'arrivata,arrivata', 'una risposta con due schede → entrambe arrivate (%s)' % sc)

    zona().get_by_role('button', name='Avanti: Controllo').click(); pg.wait_for_timeout(300)
    e = pg.evaluate("Stato.prendi('cre-biologia-3.3').esiti")
    ok(e.get('controllato') and e.get('daCorreggere') == 1, 'Controllo zero token: 1 domanda da correggere (%s)' % json.dumps(e))

    pg.get_by_label('Scegli dal dispositivo il PDF di Manuale').set_input_files(PDF)
    pg.get_by_role('button', name='Verifica le citazioni sul PDF di Manuale').click()
    pg.wait_for_function("(Stato.prendi('cre-biologia-3.3') || {}).citazioni", timeout=15000); pg.wait_for_timeout(300)
    c = pg.evaluate("Stato.prendi('cre-biologia-3.3').citazioni")
    ok(len(c['registro']) == 2 and not c['problemi'] and c['ok'] == 34, 'citazioni: 34 giuste, le 2 su p. 2 spostate alla pagina accanto (%s)' % json.dumps(c, ensure_ascii=False)[:300])
    f2 = pg.evaluate("Stato.prendi('prq-biologia-3.3-s1').quiz.filter(q => /Domanda 1\\.2 /.test(q.domanda)).map(q => q.fonte + ' | ' + q.spiegazione.slice(-30))")
    ok(len(f2) == 1 and '[[Manuale, p. 2]]' not in f2[0] and ('p. 1]]' in f2[0] or 'p. 3]]' in f2[0]), 'la fonte di p. 2 è corretta nel quiz salvato (%s)' % f2)
    ok('Verificate il 20/11/2026' in zona().inner_text(), 'riepilogo della verifica nel Controllo')

    pg.evaluate("""() => {
      const l = Stato.prendi(Centro.idLibro('Biologia', 'Manuale'));
      Stato.salva({ ...l, mappa: { ...l.mappa, tratti: l.mappa.tratti.map(t => ({ ...t, stampDa: t.stampDa + 1 })) } }, true);
    }""")
    zona().get_by_role('button', name='Ricontrolla', exact=False).click()
    ok('Verifica precedente da ripetere' in zona().inner_text() and 'Verificate il' not in zona().inner_text(),
       'modifica della mappa: il riepilogo precedente non vale più')
    pg.evaluate("""() => {
      const l = Stato.prendi(Centro.idLibro('Biologia', 'Manuale'));
      Stato.salva({ ...l, mappa: { ...l.mappa, tratti: l.mappa.tratti.map(t => ({ ...t, stampDa: t.stampDa - 1 })) } }, true);
    }""")
    zona().get_by_role('button', name='Ricontrolla', exact=False).click()
    ok('Verificate il 20/11/2026' in zona().inner_text(), 'ripristino della mappa: si riusa la verifica corrispondente')
    with open(PDF, 'rb') as originale:
        sostituto = originale.read().replace(b'glicolisi', b'cellulare')
    pg.get_by_label('Scegli dal dispositivo il PDF di Manuale').set_input_files(
        {'name': 'Manuale.pdf', 'mimeType': 'application/pdf', 'buffer': sostituto})
    ok('Verifica precedente da ripetere' in zona().inner_text() and 'Verificate il' not in zona().inner_text(),
       'PDF sostituito con lo stesso nome: il riepilogo precedente non vale più')

    zona().locator('button', has_text='Correggi').first.click(); pg.wait_for_timeout(300)
    ok('Passo 5 di 7' in passo(), 'Correggi apre il passo 5 con il prompt di correzione')
    rotta = pg.evaluate("Stato.prendi('prq-biologia-3.3-s1').quiz.find(q => q.opzioni.length !== 4).id")
    patch = [{'id': rotta, 'opzioni': ['Falsa a 5', 'Giusta 5', 'Falsa b 5', 'Falsa c 5'], 'esatta': 1}]
    pg.locator('textarea[aria-label^="Patch JSON"]').fill('```json\n' + json.dumps(patch, ensure_ascii=False) + '\n```')
    zona().get_by_role('button', name='Applica le patch').click(); pg.wait_for_timeout(300)
    ok('nessuna domanda da correggere' in zona().inner_text(), 'patch applicata → ricontrollo superato')

    pg.get_by_role('button', name='Salta la prova: Importa').or_(pg.get_by_role('button', name='Avanti: Importa')).first.click(); pg.wait_for_timeout(300)
    ok('Passo 7 di 7' in passo(), 'si arriva a Importa')
    albero = pg.locator('.centro-albero').inner_text()
    ok('3.3.1' in albero and '3.3.2' in albero and '36 domande' in albero, 'albero cartella → step → microstep con i conteggi')
    pg.get_by_label('Microstep 3.3.2').uncheck()
    ok(pg.get_by_label('Tutto lo step', exact=False).evaluate('e => e.indeterminate'), 'step parziale dopo aver tolto 3.3.2')
    ok('1 microstep · 1 scheda · 18 domande' in zona().inner_text(), 'conteggio della selezione aggiornato')

    pg.get_by_role('button', name='dove lo metto', exact=False).click()
    pg.locator('.innesto-scelta button').click(); pg.wait_for_timeout(300)
    i1 = pg.evaluate(INNESTI)
    ok(i1 == '[{"k":"BIO3.3","micro":["3.3.1:1"],"dom":18}]', 'importato solo 3.3.1: 1 scheda, 18 domande (%s)' % i1)
    ok('1 scheda nei tuoi programmi' in pg.locator('.centro-nota[role=status]').inner_text(), 'esito con il singolare «1 scheda»')
    pg.screenshot(path='test/v063_centro.png', full_page=True)

    pg.get_by_role('button', name='dove lo metto', exact=False).click()
    ok('Reimporta' in pg.locator('.innesto-scelta button').inner_text(), 'la seconda volta il pulsante dice «Reimporta»')
    pg.locator('.innesto-scelta button').click(); pg.wait_for_timeout(300)
    ok(pg.evaluate(INNESTI) == i1, 'reimport: stesso innesto, nessun doppione')

    det = pg.locator('details.centro-impostazioni'); det.locator('summary').click()
    lista = pg.get_by_label('Fonti escluse, una per riga').input_value()
    ok(all(n in lista for n in ['Testbusters', 'Alpha Test', 'Editest']), 'lista esclusi precompilata')
    senza = pg.evaluate("[...document.querySelectorAll('.foglio button, .foglio input, .foglio select, .foglio textarea')].filter(b => !(b.getAttribute('aria-label') || (b.labels && b.labels.length) || b.textContent.trim())).length")
    ok(senza == 0, 'nessun controllo senza nome nel foglio (%d)' % senza)
    ok(not pg.evaluate("document.querySelector('.foglio').scrollWidth > document.querySelector('.foglio').clientWidth"), 'nessuno sforamento orizzontale a 375 px')

    # Un PDF remoto cambiato conserva l'id ma non la revisione: cache e verifica devono accorgersene.
    pdf_bytes = list(open(PDF, 'rb').read())
    pg.reload(); pg.wait_for_selector('.tabbar')
    pg.evaluate("""([bytes, mappa]) => {
      window._driveMod = '2026-11-20T08:00:00Z'; window._pdfCalls = [];
      Drive.cerca = async () => [{ id: 'pdf-remoto', name: 'Manuale.pdf', mimeType: 'application/pdf', webViewLink: '', modifiedTime: window._driveMod }];
      PdfCache.prendi = async (id, avanz, versione) => { window._pdfCalls.push([id, versione]); return new Uint8Array(bytes); };
      const r = Stato.prendi('cre-biologia-3.3');
      Stato.salva({ ...r, deleted: false, esiti: { controllato: true, daCorreggere: 0 } }, true);
      conStrumentiQuiz(() => {
        const l = Stato.prendi(Centro.idLibro('Biologia', 'Manuale'));
        Stato.salva({ ...l, mappa }, true);
        CentroUI.apri();
      });
    }""", [pdf_bytes, MAPPA])
    pg.wait_for_selector('.centro-zona'); pg.get_by_role('button', name='Torna al passo precedente').click(); pg.get_by_role('button', name='Torna al passo precedente').click()
    ok('Passo 4 di 7' in passo(), 'fixture remota riaperta al Controllo')
    pg.get_by_role('button', name='Verifica le citazioni sul PDF di Manuale').click()
    pg.wait_for_function("((Stato.prendi('cre-biologia-3.3').citazioni || {}).drive || []).length > 0", timeout=15000)
    c = pg.evaluate("Stato.prendi('cre-biologia-3.3').citazioni")
    chiamate = pg.evaluate("window._pdfCalls")
    ok(c['drive'] == [{'nome': 'Manuale.pdf', 'id': 'pdf-remoto', 'modificato': '2026-11-20T08:00:00Z'}],
       'la verifica salva id e revisione del PDF Drive')
    ok(chiamate and chiamate[-1] == ['pdf-remoto', '2026-11-20T08:00:00Z'], 'la cache PDF usa anche modifiedTime (%s)' % chiamate)
    pg.evaluate("window._driveMod = '2026-11-21T08:00:00Z'")
    zona().get_by_role('button', name='Ricontrolla', exact=False).click()
    pg.wait_for_function("document.querySelector('.centro-zona').innerText.includes('Verifica precedente da ripetere')")
    ok('Verificate il' not in zona().inner_text(), 'modifica del PDF Drive: il riepilogo precedente non vale più')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
