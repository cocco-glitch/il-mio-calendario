# Test v0.10: ripianificazione degli step in ritardo (piano principale).
import os, http.server, threading, functools, json
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
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-14T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("!!Studio.pkPiano()")
    rit = pg.evaluate("Ripianifica.inRitardo().map(x => x.k)")
    ok(rit == ['C2.2', 'F2.2', 'B2.2', 'C2.3', 'B2.3', 'F2.3'], 'in ritardo: %s' % rit)
    # uno step completato non è più in ritardo
    pg.evaluate("Studio.schedeDi(Studio.trovaSotto('C2.2').sub).filter(x => x.tipo === 'P').forEach(x => Studio.segna(x.id, { fatta: true, data: '2026-11-11', punteggio: 80 }))")
    rit = pg.evaluate("Ripianifica.inRitardo().map(x => x.k)")
    ok('C2.2' not in rit and len(rit) == 5, 'step completato escluso')
    g = pg.evaluate("Ripianifica.giorniUtili('2026-11-14').map(x => x.data)")
    ok('2026-11-22' not in g and '2026-11-30' not in g and '2026-12-03' not in g and g[0] == '2026-11-15' and '2026-12-01' in g, 'giorni utili: niente simulazione, verifica, chiusura')
    leg = pg.evaluate("Ripianifica.proponi('leggeri').map(x => x.a)")
    ok(leg == ['2026-12-01', '2026-12-02', '2026-11-19', '2026-12-01', '2026-12-02'], 'giorni leggeri: %s' % leg)
    pre = pg.evaluate("Ripianifica.proponi('presto').map(x => x.a)")
    ok(pre == ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'], 'prima possibile: %s' % pre)
    # Interfaccia: pulsante in Oggi → anteprima → conferma → annulla
    pg.evaluate("vai('oggi')"); pg.wait_for_timeout(200)
    pg.click('text=↻ Ripianifica i ritardi'); pg.wait_for_selector('.foglio')
    t = pg.inner_text('.foglio')
    ok('Fis 2.2' in t and '01/12' in t, 'anteprima con gli spostamenti')
    pg.click('.foglio >> text=Prima possibile'); pg.wait_for_timeout(100)
    ok('15/11' in pg.inner_text('.foglio'), 'cambio modo aggiorna l\'anteprima')
    pg.screenshot(path='test/ripianifica.png')
    pg.click('.foglio button:has-text("Conferma")')
    pg.wait_for_timeout(300)
    ok(pg.evaluate("Ripianifica.inRitardo().length") == 0, 'confermato: nessuno step in ritardo')
    ok('Fis 2.2' in json.dumps(pg.evaluate("Studio.vociDelGiorno(daDt('2026-11-15')).map(x => Studio.etichetta(x.v.k))")), 'Fis 2.2 ora il 15/11')
    ok(pg.evaluate("Studio.fatta(Studio.schedeDi(Studio.trovaSotto('C2.2').sub)[0].id)"), 'progressi intatti')
    pg.locator('#avvisi >> text=Spostati').first.dispatch_event('click'); pg.wait_for_timeout(200)
    ok(len(pg.evaluate("Ripianifica.inRitardo()")) == 5, 'annullato: di nuovo 5 in ritardo')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
