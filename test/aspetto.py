# Redesign blocco 1 (27/11/2026): fondamenta dell'aspetto. Contrasto ≥ 4,5:1 (WCAG 2.1 AA) delle coppie di token nei due temi,
# testo sopra l'accento calcolato per TUTTI gli accenti di Aspetto, font locale Atkinson caricato e in cache del service worker,
# nessuna etichetta in maiuscolo tracciato. 0 chiamate di rete esterne.
import os, re, http.server, threading, functools
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

CONTRASTO = """(coppie) => { const v = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rgb = c => { const d = document.createElement('div'); d.style.color = c; document.body.appendChild(d); const x = getComputedStyle(d).color.match(/[\\d.]+/g).slice(0, 3).map(Number); d.remove(); return x; };
  const lum = c => { const l = rgb(c).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }); return .2126 * l[0] + .7152 * l[1] + .0722 * l[2]; };
  return coppie.map(([a, b]) => { const A = lum(v(a)), B = lum(v(b)); return [a + '/' + b, Math.round((Math.max(A, B) + .05) / (Math.min(A, B) + .05) * 100) / 100]; }); }"""
COPPIE = [['--testo', '--bg'], ['--testo', '--sup'], ['--testo', '--sup2'], ['--tenue', '--bg'], ['--tenue', '--sup'], ['--tenue', '--sup2'],
          ['--accento-testo', '--sup'], ['--accento-testo', '--sup2'], ['--su-accento', '--accento'], ['--rosso', '--sup']]

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(viewport={'width': 375, 'height': 760})
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    accenti = pg.evaluate("ACCENTI")
    ok(accenti[0] == '#0f6e78', 'accento predefinito: verde petrolio (%s)' % accenti[0])
    for tema in ['chiaro', 'scuro']:
        peggiori = []
        for a in accenti:
            pg.evaluate("([t, a]) => { const i = imp(); i.tema = t; i.accento = a; applicaTema(); }", [tema, a])
            for nome, c in pg.evaluate(CONTRASTO, COPPIE):
                if c < 4.5: peggiori.append('%s %s %.2f' % (a, nome, c))
        ok(not peggiori, 'tema %s: tutte le coppie ≥ 4,5:1 con i %d accenti %s' % (tema, len(accenti), peggiori[:4]))
    pg.evaluate("() => { const i = imp(); delete i.accento; i.tema = 'chiaro'; applicaTema(); }")
    ok(pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accento').trim()") == '#0f6e78', 'senza scelta (o col vecchio blu predefinito) l\'accento è il nuovo')
    pg.evaluate("() => { imp().accento = '#2f6bea'; applicaTema(); }")
    ok(pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accento').trim()") == '#0f6e78', 'il vecchio blu predefinito #2f6bea migra al nuovo')
    pg.evaluate("document.fonts.load('16px \"Atkinson Next\"')"); pg.wait_for_timeout(500)
    ok(pg.evaluate("document.fonts.check('16px \"Atkinson Next\"') && [...document.fonts].some(f => f.family.includes('Atkinson') && f.status === 'loaded')"), 'font Atkinson Next caricato dal sito (nessuna rete esterna)')
    ff = pg.evaluate("getComputedStyle(document.body).fontFamily")
    ok('Atkinson Next' in ff.split(',')[0], 'il corpo usa Atkinson Next (%s)' % ff[:60])
    sw = open(os.path.join(RADICE, 'sw.js'), encoding='utf-8').read()
    ok('font/atkinson-hyperlegible-next-latin-400-normal.woff2' in sw and 'latin-700' in sw, 'font nella cache del service worker (funziona offline)')
    css = pg.evaluate("[...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r => r.cssText); } catch (e) { return []; } }).join('\\n')")
    ok('uppercase' not in css, 'nessuna etichetta in maiuscolo tracciato')
    ok(os.path.exists(os.path.join(RADICE, 'font', 'OFL.txt')), 'licenza OFL distribuita con il font')
    # blocco 2: transizione tra sezioni e onda al tocco
    pg.evaluate("() => { const i = imp(); i.tema = 'chiaro'; applicaTema(); window._vt = 0; const o = document.startViewTransition.bind(document); document.startViewTransition = f => { window._vt++; return o(f); }; }")
    pg.locator('.tabbar button', has_text='Studio').click(); pg.wait_for_timeout(500)
    ok(pg.evaluate("window._vt") == 1 and pg.evaluate("document.documentElement.dataset.verso") == 'avanti' and pg.evaluate("UI.scheda") == 'studio', 'tocco sulla barra: View Transition verso destra, poi la vista giusta')
    ok(not pg.evaluate("'vt' in document.documentElement.dataset"), 'a transizione finita nessun segno residuo (niente doppia animazione)')
    pg.locator('.tabbar button', has_text='Oggi').click(); pg.wait_for_timeout(500)
    ok(pg.evaluate("document.documentElement.dataset.verso") == 'indietro', 'verso sinistra tornando a Oggi')
    pg.evaluate("vai('studio')")
    ok(pg.evaluate("UI.scheda") == 'studio' and pg.evaluate("window._vt") == 2, 'vai() dal codice resta sincrono (nessuna transizione)')
    b = pg.locator('.btn').first; b.scroll_into_view_if_needed(); bb = b.bounding_box()
    pg.mouse.move(bb['x'] + 10, bb['y'] + 8); pg.mouse.down()
    ok(b.evaluate("e => e.classList.contains('onda') && e.style.getPropertyValue('--ox') === '10px'"), 'onda al tocco dal punto premuto')
    pg.mouse.up()
    pg.emulate_media(reduced_motion='reduce'); pg.evaluate("vai('oggi')")
    pg.locator('.tabbar button', has_text='Studio').click(); pg.wait_for_timeout(300)
    ok(pg.evaluate("window._vt") == 2, 'riduci movimento: nessuna transizione')
    # blocco 3: sfondo a puntini, vivo al tocco solo fuori dallo studio
    pg.emulate_media(reduced_motion='no-preference'); pg.evaluate("vai('oggi')"); pg.wait_for_timeout(100)
    R = "document.documentElement"
    ok(pg.evaluate(R + ".dataset.sfondo") == 'vivo' and 'radial-gradient' in pg.evaluate("getComputedStyle(document.body, '::before').backgroundImage"), 'Oggi: sfondo a puntini vivo')
    vuoto = pg.locator('main .pagina').first.bounding_box()
    pg.evaluate(R + ".classList.remove('tocco')"); pg.mouse.click(4, vuoto['y'] + 200)
    ok(pg.evaluate(R + ".classList.contains('tocco')") and pg.evaluate("getComputedStyle(document.body, '::after').animationName") == 'sboccia'
       and pg.evaluate(R + ".style.getPropertyValue('--sx')") == '4px', 'tocco su uno spazio vuoto: i puntini si accendono dal punto toccato')
    pg.evaluate(R + ".classList.remove('tocco')"); pg.locator('.tabbar button', has_text='Calendario').dispatch_event('pointerdown'); pg.locator('.tabbar button', has_text='Calendario').dispatch_event('pointerup')
    ok(not pg.evaluate(R + ".classList.contains('tocco')"), 'tocco su un pulsante: lo sfondo non reagisce')
    pg.evaluate("vai('studio')")
    ok(pg.evaluate(R + ".dataset.sfondo") == 'fermo', 'Studio: sfondo fermo')
    pg.mouse.click(vuoto['x'] + 3, vuoto['y'] + 5)
    ok(not pg.evaluate(R + ".classList.contains('tocco')"), 'Studio: il tocco non accende lo sfondo (niente dettagli seducenti)')
    pg.emulate_media(reduced_motion='reduce'); pg.evaluate("vai('oggi')")
    ok(pg.evaluate("getComputedStyle(document.body, '::after').display") == 'none', 'riduci movimento: niente accensione dello sfondo')
    # blocco 4: Oggi con una sola card in risalto, esami in una riga, ritardo compatto, timer senza doppioni, selettore dello step
    pg.emulate_media(reduced_motion='no-preference')
    pg.wait_for_function("Studio.pkPiani().length > 0 && esamiNoti().length >= 2"); pg.evaluate("vai('oggi')"); pg.wait_for_timeout(300)
    ok(pg.locator('.oggi-esami .oggi-esame').count() == 2 and pg.locator('.tessere, .modo-esame').count() == 0, 'Oggi: i 2 esami in una riga sotto la data, niente banner né riquadri')
    ok(pg.locator('.oggi-modo').count() == (1 if pg.evaluate("modalitaEsame() !== null") else 0), 'Modalità esame nella stessa riga, con «Mostra tutto»')
    ok('giorni' not in pg.locator('.adesso-testa').inner_text(), 'card Adesso senza la riga di stato doppia')
    t = pg.locator('.card:has-text("Tempo di studio")')
    ok(t.count() == 1 and t.locator('button').count() == 0, 'Tempo di studio: solo i minuti, nessun pulsante ▶ doppio')
    ind = pg.locator('.card:has-text("Studio di oggi") .indicatore').first.inner_text()
    ok(':' not in ind and pg.locator('.card:has-text("Studio di oggi") details.ritardo-quali:not([open])').count() == 1, 'ritardo in una riga, elenco chiuso in «Quali» (%s)' % ind)
    ok(pg.evaluate("[...document.querySelectorAll('.adesso .btn.studia-ora')].every(b => b.scrollWidth <= b.clientWidth && b.getBoundingClientRect().height < 64)"), 'pulsante di Adesso su una riga a 375 px')
    pg.evaluate("UI.studioVista = 'schede'; UI.studioSub = null; vai('studio')"); pg.wait_for_selector('.selettore-step')
    ok(pg.locator('main .chip', has_text='Nuovo corso').count() == 0 and pg.locator('.selettore-step').get_attribute('aria-label').endswith(pg.locator('.selettore-step').inner_text().replace(' ▾', '').strip()), 'Studio: un solo selettore dello step (nome accessibile con il testo visibile)')
    pg.locator('.selettore-step').click()
    voci = pg.locator('.tendina-menu [role=menuitem]').all_inner_texts()
    ok(voci[-1] == '+ Nuovo corso' and len(voci) == pg.evaluate("Studio.pkStep().length") + 1, 'menu del selettore: gli step e «+ Nuovo corso» (%s)' % voci)
    pg.locator('.tendina-menu [role=menuitem]').first.click(); pg.wait_for_timeout(100)
    ok(pg.evaluate("UI.studioStep") == pg.evaluate("Studio.pkStep()[0].id"), 'dal menu si cambia step')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
