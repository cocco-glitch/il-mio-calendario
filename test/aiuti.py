# Redesign blocco 5 (27/11/2026): aiuti contestuali. Al primo uso un fumetto ancorato al pulsante (uno per visita della schermata),
# «?» nella testata di Oggi e Studio per rivederli, visti salvati nelle impostazioni dell'account (sincronizzate). Chunk aiuti.js
# fuori da app.js. Nei test automatici i fumetti non si aprono da soli (qui si accendono con window.__aiutiAuto). 0 chiamate esterne.
import os, http.server, threading, functools
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

with sync_playwright() as p:
    br = p.chromium.launch()
    # 1) senza __aiutiAuto (come negli altri E2E): nessun fumetto da solo, il «?» c'è
    pg = br.new_context(viewport={'width': 375, 'height': 760}, bypass_csp=True).new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_timeout(900)
    ok(pg.locator('.aiuto').count() == 0 and pg.evaluate("typeof Aiuti") == 'undefined', 'test automatici: chunk non scaricato da solo, nessun fumetto (non tocca gli altri E2E)')
    pg.locator('.aiuti-btn').click(); pg.wait_for_selector('.aiuto')
    ok(pg.evaluate("typeof Aiuti") == 'object', '«?» carica il chunk e mostra gli aiuti anche nei test'); pg.keyboard.press('Escape')
    ok(pg.locator('.testata .aiuti-btn').count() == 1, '«?» nella testata di Oggi')
    app_js, chunk = (open(os.path.join(RADICE, f), encoding='utf-8').read() for f in ('app.js', 'aiuti.js'))
    ok('const Aiuti' not in app_js and 'const Aiuti' in chunk and "'aiuti.js'" in open(os.path.join(RADICE, 'sw.js'), encoding='utf-8').read(), 'il modulo sta nel chunk aiuti.js (in cache offline), non in app.js')
    pg.close()

    ctx = br.new_context(viewport={'width': 375, 'height': 760}, bypass_csp=True); ctx.add_init_script("window.__aiutiAuto = true")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("Studio.pkPiani().length > 0")
    # 2) primo uso su Oggi: un fumetto, ancorato, chiudibile con Esc
    pg.wait_for_selector('.aiuto', timeout=5000)
    a = pg.locator('.aiuto')
    ok(a.count() == 1 and a.get_attribute('data-aiuto') == 'adesso' and a.get_attribute('role') == 'dialog' and a.get_attribute('aria-modal') == 'false', 'Oggi: un solo fumetto, «Adesso», dialogo non modale')
    ab, bb = a.bounding_box(), pg.locator('.adesso .btn.studia-ora').bounding_box()
    ok(abs((ab['y'] - 12) - (bb['y'] + bb['height'])) < 3 or abs((ab['y'] + ab['height'] + 12) - bb['y']) < 3, 'ancorato al pulsante (12 px sopra o sotto)')
    ok(ab['x'] >= 8 and ab['x'] + ab['width'] <= 367, 'dentro lo schermo a 375 px')
    ver = pg.evaluate("imp().updatedAt")
    pg.keyboard.press('Escape')
    ok(pg.locator('.aiuto').count() == 0 and pg.evaluate("imp().aiutiVisti") == ['adesso'] and pg.evaluate("imp().updatedAt") > ver, 'Esc chiude; «adesso» segnato nelle impostazioni dell\'account (updatedAt: va su Drive)')
    pg.wait_for_timeout(900)
    ok(pg.locator('.aiuto').count() == 0, 'mai più di uno per visita della schermata')
    # 3) Studio: il primo non visto della schermata
    pg.evaluate("UI.studioVista = 'schede'; vai('studio')"); pg.wait_for_selector('.aiuto', timeout=5000)
    primo = pg.locator('.aiuto').get_attribute('data-aiuto')
    ok(primo in ('ripianifica', 'step') and pg.locator('.aiuto').count() == 1, 'Studio: un fumetto (%s)' % primo)
    pg.locator('.aiuto .btn').click()
    ok(primo in pg.evaluate("imp().aiutiVisti") and pg.locator('.aiuto').count() == 0, '«Ho capito» chiude e segna')
    # 4) usare il pulsante vale come «ho capito»
    pg.evaluate("vai('oggi')"); pg.wait_for_timeout(100); pg.evaluate("vai('studio')"); pg.wait_for_selector('.aiuto', timeout=5000)
    sec = pg.locator('.aiuto').get_attribute('data-aiuto')
    pg.locator('.selettore-step' if sec == 'step' else '.ripianifica').first.dispatch_event('pointerdown')
    ok(sec in pg.evaluate("imp().aiutiVisti") and pg.locator('.aiuto').count() == 0, 'toccare il pulsante indicato chiude il fumetto (%s)' % sec)
    # 5) «?»: tutti gli aiuti della schermata, anche visti, con «Avanti»; il Centro (fuori schermo nella fila) viene mostrato
    pg.evaluate("vai('oggi')"); pg.wait_for_timeout(100); pg.evaluate("vai('studio')"); pg.wait_for_timeout(600)
    if pg.locator('.aiuto').count(): pg.keyboard.press('Escape')
    pg.locator('.aiuti-btn').click(); pg.wait_for_selector('.aiuto')
    vist = []
    for _ in range(6):
        vist.append(pg.locator('.aiuto').get_attribute('data-aiuto')); b = pg.locator('.aiuto .btn')
        if b.inner_text() == 'Ho capito': b.click(); break
        b.click(); pg.wait_for_selector('.aiuto')
    ok(set(vist) == {'ripianifica', 'step', 'centro'} and pg.locator('.aiuto').count() == 0, '«?» in Studio: %s, l\'ultimo dice «Ho capito»' % vist)
    c = pg.locator('.segmenti .cq-studio[title^="Crea i quiz"]').bounding_box()
    ok(c['x'] + c['width'] <= 375, 'la fila scorre fino a mostrare il Centro di creazione')
    # 6) sincronizzazione: i visti stanno nel record impostazioni, che riparte con l'app
    pg.reload(); pg.wait_for_selector('.tabbar'); pg.wait_for_timeout(900)
    ok(set(pg.evaluate("imp().aiutiVisti")) >= {'adesso', 'ripianifica', 'step', 'centro'}, 'dopo il riavvio i visti restano: %s' % pg.evaluate("imp().aiutiVisti"))
    ok(pg.locator('.aiuto').get_attribute('data-aiuto') == 'barra' if pg.locator('.aiuto').count() else False, 'Oggi riparte dal successivo non visto («barra»)')
    # 7) nessun «?» né fumetto fuori da Oggi e Studio; nessun avviso a vuoto
    pg.keyboard.press('Escape'); pg.evaluate("vai('cal')"); pg.wait_for_timeout(600)
    ok(pg.locator('.aiuti-btn, .aiuto').count() == 0, 'Calendario: niente «?» né fumetti')
    # 8) tema scuro: contrasto del fumetto
    pg.evaluate("() => { const i = imp(); i.tema = 'scuro'; applicaTema(); vai('oggi'); }"); pg.wait_for_timeout(200)
    pg.locator('.aiuti-btn').click(); pg.wait_for_selector('.aiuto')
    cr = pg.evaluate("""() => { const lum = c => { const x = c.match(/[\\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * x[0] + .7152 * x[1] + .0722 * x[2]; };
      const s = getComputedStyle(document.querySelector('.aiuto p')), b = getComputedStyle(document.querySelector('.aiuto')); const A = lum(s.color), B = lum(b.backgroundColor); return (Math.max(A, B) + .05) / (Math.min(A, B) + .05); }""")
    ok(cr >= 4.5, 'tema scuro: testo del fumetto %.1f:1' % cr)
    pg.wait_for_timeout(400); pg.screenshot(path='test/aiuti.png')
    pg.keyboard.press('Escape'); pg.evaluate("() => { imp().tema = 'chiaro'; applicaTema(); }"); pg.locator('.aiuti-btn').click(); pg.wait_for_selector('.aiuto'); pg.wait_for_timeout(400); pg.screenshot(path='test/aiuti-chiaro.png')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
