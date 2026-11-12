# Test v0.20: vetro leggero — attivo di base, disattivabile, barra galleggiante, forme delle materie, movimento ridotto.
import os, http.server, threading, functools
from playwright.sync_api import sync_playwright
RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err = []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-12T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("!!Studio.pkPiano()")
    ok(pg.evaluate("document.documentElement.dataset.vetro") == 'si', 'vetro attivo di base')
    st = pg.evaluate("(() => { const s = getComputedStyle(document.querySelector('.tabbar')); return [s.position, s.backdropFilter, s.borderRadius]; })()")
    ok(st[0] == 'fixed' and 'blur' in st[1] and st[2] == '26px', 'barra galleggiante di vetro: %s' % st)
    ok(pg.locator('.voce-lista .forma-mat').count() >= 2, 'forme delle materie nelle voci di studio')
    ok(pg.evaluate("formaMateria('C') + formaMateria('B') + formaMateria('F')") == '◆●▲', 'forme base Chi/Bio/Fis')
    pg.evaluate("vai('studio')"); pg.wait_for_timeout(50)
    ok(pg.evaluate("document.querySelector('main').classList.contains('entra')"), 'animazione di ingresso al cambio scheda')
    pg.evaluate("Stato.salva(Object.assign({}, imp()), true); disegna()"); pg.wait_for_timeout(100)
    ok(not pg.evaluate("document.querySelector('main').classList.contains('entra')"), 'nessuna animazione ai ridisegni della stessa scheda')
    # l'ultimo elemento della pagina non resta sotto la barra
    pg.evaluate("const m = document.querySelector('main'); m.scrollTop = m.scrollHeight"); pg.wait_for_timeout(100)
    ok(pg.evaluate("(() => { const c = Array.from(document.querySelectorAll('main .card')).pop().getBoundingClientRect(); return c.bottom <= document.querySelector('.tabbar').getBoundingClientRect().top + 1; })()"), 'ultima scheda visibile sopra la barra')
    pg.evaluate("vai('altro')"); pg.wait_for_timeout(200)
    pg.locator('.riga', has_text='Effetto vetro').locator('select').select_option('no'); pg.wait_for_timeout(200)
    ok(pg.evaluate("document.documentElement.dataset.vetro") == 'no' and pg.evaluate("getComputedStyle(document.querySelector('.tabbar')).position") != 'fixed', 'disattivato: superfici piene, barra normale')
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    pg2 = ctx2.new_page(); pg2.goto(URL); pg2.wait_for_selector('.tabbar'); pg2.wait_for_timeout(500); pg2.evaluate("vai('note')")
    ok(pg2.evaluate("getComputedStyle(document.querySelector('main.entra > .pagina')).animationName") == 'none', 'movimento ridotto rispettato')
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
