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

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
