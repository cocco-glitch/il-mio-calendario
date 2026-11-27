# Regola utente 27/11/2026: nei programmi di creazione si scelgono sempre PIÙ file (un indice o un libro non sta mai in un file solo).
# Comportamento: flashcard da 2 file = 2 mazzi; risposte dell'AI da 2 file = un'unica lettura con le domande di entrambi, in ordine
# di nome (parte 2 prima di parte 10); gli input dei programmi di creazione hanno `multiple`. La copertura statica di tutti i
# selettori (unica eccezione: la lezione audio) è nella suite Node. Anche tabelle, .ics, backup e file della scheda. 0 chiamate esterne.
import os, json, http.server, threading, functools
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

def quiz(n0, n):
    return json.dumps({'formato': 'quiz-v3', 'scheda': 'S01', 'quiz': [{'livello': 1, 'tipoItem': 'scelta', 'domanda': 'Domanda %d sul trasporto di membrana?' % i,
        'opzioni': [{'testo': 'Giusta %d' % i, 'corretta': True}, {'testo': 'Sbagliata A'}, {'testo': 'Sbagliata B'}, {'testo': 'Sbagliata C'}]} for i in range(n0, n0 + n)]})

with sync_playwright() as p:
    pg = p.chromium.launch().new_context(viewport={'width': 375, 'height': 760}, bypass_csp=True).new_page()
    pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    # 1) flashcard: due file dal dispositivo → due mazzi (prima mancava `multiple`: se ne sceglieva uno solo)
    prima = pg.evaluate("Stato.tutti('mazzo').length")
    pg.evaluate("importaCarte()"); pg.wait_for_selector('.foglio')
    inp = pg.locator('.foglio input[type=file]')
    ok(inp.get_attribute('multiple') is not None, 'flashcard: il selettore accetta più file')
    inp.set_input_files([{'name': 'Cap 1.txt', 'mimeType': 'text/plain', 'buffer': 'osmosi\tpassaggio di acqua\ndiffusione\tsecondo gradiente\n'.encode()},
                         {'name': 'Cap 2.txt', 'mimeType': 'text/plain', 'buffer': 'pompa Na/K\t3 Na fuori, 2 K dentro\n'.encode()}])
    pg.wait_for_function("Stato.tutti('mazzo').length >= %d" % (prima + 2), timeout=5000)
    nomi = sorted(pg.evaluate("Stato.tutti('mazzo').map(m => m.nome)"))[-2:]
    ok(pg.evaluate("Stato.tutti('mazzo').length") == prima + 2 and nomi == ['Cap 1', 'Cap 2'], 'flashcard da 2 file = 2 mazzi %s' % nomi)
    # 2) risposta dell'AI da più file (Centro, strumenti quiz): un'unica lettura, in ordine di nome
    pg.evaluate("caricaStrumentiQuiz()"); pg.wait_for_function("typeof testiDaFile === 'function' && typeof Contratto !== 'undefined'")
    r = pg.evaluate("""async ([a, b, c]) => { const dt = new DataTransfer();
        dt.items.add(new File([c], 'risposta parte 10.json')); dt.items.add(new File([a], 'risposta parte 1.json')); dt.items.add(new File([b], 'risposta parte 2.json'));
        const t = await testiDaFile(dt.files), l = Contratto.leggi(t), d = (l.dati && l.dati.quiz) || [];
        const uno = new DataTransfer(); uno.items.add(new File([a], 'solo.json'));
        return { n: d.length, ordine: d.map(q => q.domanda.match(/\\d+/)[0]).join(','), errori: l.errori, singolo: (await testiDaFile(uno.files)) === a }; }""",
        [quiz(1, 2), quiz(3, 2), quiz(5, 1)])
    ok(r['n'] == 5 and not r['errori'], 'risposte da 3 file unite: %d domande, errori %s' % (r['n'], r['errori']))
    ok(r['ordine'] == '1,2,3,4,5', 'ordine per nome (parte 1, 2, 10): %s' % r['ordine'])
    ok(r['singolo'], 'un file solo resta com\'è (nessun blocco aggiunto)')
    # 3) gli input dei programmi di creazione nel chunk sono multipli
    src = open(os.path.join(RADICE, 'strumenti-quiz.js'), encoding='utf-8').read()
    import re
    oggetti = re.findall(r"\{[^{}]*type: 'file'[^{}]*\}", src)
    ok(len(oggetti) >= 6 and all('multiple: true' in x for x in oggetti), 'chunk di creazione: %d input di file, tutti con multiple' % len(oggetti))

    # 4) tabelle: righe da 2 CSV nella stessa tabella; celle link con più file; export CSV senza «[object Object]»
    pg.evaluate("""() => { Stato.salva({ id: 'tab-m', type: 'tabella', updatedAt: 0, nome: 'Esami', colonne: [{ id: 'c1', nome: 'Materia', tipo: 'testo' }, { id: 'c2', nome: 'File', tipo: 'link' }], righe: [] });
      UI.studioVista = 'tabelle'; UI.tabella = 'tab-m'; vai('studio'); }""")
    pg.wait_for_selector('input.titolo-tab')
    pg.locator('input[type=file][accept^=".csv"]').set_input_files([{'name': 'a.csv', 'mimeType': 'text/csv', 'buffer': b'Materia\nChimica\nFisica\n'},
                                                                     {'name': 'b.csv', 'mimeType': 'text/csv', 'buffer': b'Materia\nBiologia\n'}])
    pg.wait_for_function("Stato.prendi('tab-m').righe.length >= 3", timeout=5000)
    ok(pg.evaluate("Stato.prendi('tab-m').righe.length") == 3, 'tabella: righe da 2 CSV insieme (3)')
    csv = pg.evaluate("""() => { const t = Stato.prendi('tab-m'); t.righe[0].c.c2 = [{ nome: 'cap1.pdf', url: 'https://x/1' }, { nome: 'cap2.pdf', url: 'https://x/2' }]; Stato.salva(t); return csvDa(t); }""")
    ok('https://x/1 https://x/2' in csv and 'object' not in csv, 'cella link con 2 file, export CSV leggibile')
    pg.wait_for_timeout(200)
    ok(pg.locator('.cella-link a').count() == 2, 'la cella mostra i 2 collegamenti')
    # 5) .ics: 2 file, una sola domanda di categoria
    pg.evaluate("UI.altroSez = 'calendario'; vai('altro')"); pg.wait_for_timeout(200)
    ev0 = pg.evaluate("Stato.tutti('evento').length")
    ics = lambda t, d: ('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:%s@x\nSUMMARY:%s\nDTSTART:%sT090000\nDTEND:%sT100000\nEND:VEVENT\nEND:VCALENDAR\n' % (t, t, d, d)).encode()
    pg.locator('input[type=file][accept^=".ics"]').set_input_files([{'name': 'lezioni.ics', 'mimeType': 'text/calendar', 'buffer': ics('Lezione', '20261201')},
                                                                     {'name': 'esami.ics', 'mimeType': 'text/calendar', 'buffer': ics('Esame', '20261210')}])
    pg.wait_for_selector('dialog.dialogo-sfondo[open]'); domande = pg.locator('dialog.dialogo-sfondo[open]').count()
    pg.locator('dialog.dialogo-sfondo[open] button', has_text='Nessuna categoria').click(); pg.wait_for_timeout(300)
    ok(domande == 1 and pg.evaluate("Stato.tutti('evento').length") == ev0 + 2, '.ics: 2 file, una sola domanda, 2 eventi')
    # 6) backup: 2 file uniti
    pg.evaluate("UI.altroSez = 'dati'; vai('altro')"); pg.wait_for_timeout(200)
    bk = lambda i: json.dumps({'records': [{'id': 'nota-bk%d' % i, 'type': 'nota', 'updatedAt': 5, 'titolo': 'Backup %d' % i, 'testo': ''}]}).encode()
    pg.locator('input[type=file][accept=".json,application/json"]').first.set_input_files([{'name': 'b1.json', 'mimeType': 'application/json', 'buffer': bk(1)},
                                                                                           {'name': 'b2.json', 'mimeType': 'application/json', 'buffer': bk(2)}])
    pg.wait_for_timeout(400)
    ok(pg.evaluate("!!Stato.prendi('nota-bk1') && !!Stato.prendi('nota-bk2')"), 'backup: 2 file importati insieme')
    # 7) scheda con più file collegati: si sceglie quale aprire
    pg.evaluate("window.__aperto = ''; window.open = u => { window.__aperto = u; return null; }")
    pg.evaluate("""() => { const s = { id: 'X-1', k: 1, n: 1, titolo: 'Cap 3', tipo: 'P', problemi: false, pagine: '', quizFile: '', file: { nome: 'slide.pptx', url: 'https://x/slide' }, altri: [{ nome: 'appunti.docx', url: 'https://x/appunti' }] };
      void apriQuiz({ id: 'pk-x', proprio: true, titolo: 'Corso', materie: [] }, 'X', '1.1', s); }""")
    pg.wait_for_selector('dialog.dialogo-sfondo[open]')
    scelte = pg.locator('dialog.dialogo-sfondo[open] button').all_inner_texts()
    pg.locator('dialog.dialogo-sfondo[open] button', has_text='appunti.docx').click(); pg.wait_for_timeout(200)
    ok('slide.pptx' in scelte and 'appunti.docx' in scelte and pg.evaluate("window.__aperto") == 'https://x/appunti', 'scheda con 2 file: chiede quale aprire e apre quello scelto')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
