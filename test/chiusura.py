# Test v0.13: chiusura serale della giornata.
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

def apri(p, quando):
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time=quando); pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("!!Studio.pkPiano()")
    return pg

with sync_playwright() as p:
    pg = apri(p, '2026-11-12T10:00:00+01:00')
    ok(pg.locator('text=Chiudi la giornata').count() == 0, 'di mattina il riquadro non c\'è')
    pg = apri(p, '2026-11-12T21:30:00+01:00')
    tit = pg.eval_on_selector_all('.card-titolo', 'els => els.map(e => e.textContent)')
    ok(tit[0] == 'Chiudi la giornata', 'la sera è in cima a Oggi: %s' % tit[:2])
    # B2.2 completato oggi, C2.3 no
    pg.evaluate("Studio.schedeDi(Studio.trovaSotto('B2.2').sub).filter(x => x.tipo === 'P').forEach(x => Studio.segna(x.id, { fatta: true, data: '2026-11-12', punteggio: 80 }))")
    pg.click('text=🌙 Chiudi la giornata'); pg.wait_for_selector('.foglio')
    t = pg.inner_text('.foglio')
    ok('✓ Bio 2.2' in t and 'Chi 2.3' in t and 'Sposta a domani' in t, 'step di oggi con stato')
    pg.click('.foglio >> text=Sposta a domani'); pg.click('.foglio >> text=🙂 4'); pg.click('.foglio >> text=6 h')
    pg.locator('.foglio .interruttore input').check(force=True)
    pg.screenshot(path='test/chiusura.png')
    pg.click('.foglio button:has-text("Fatto")'); pg.wait_for_timeout(300)
    g = pg.evaluate("Stato.prendi('g-2026-11-12')")
    ok(g and g['chiuso'] and g['focus'] == 4 and g['sonno'] == 6 and g['ripassoSerale'] and g['spostati'] == ['C2.3'], 'giornata salvata: %s' % g)
    ok('Chi 2.3' in str(pg.evaluate("Studio.vociDelGiorno(daDt('2026-11-13')).map(x => Studio.etichetta(x.v.k))")), 'Chi 2.3 spostato a domani')
    ok('Buonanotte' in pg.inner_text('#avvisi') and 'Chi 2.3' in pg.inner_text('#avvisi'), 'avviso con lo studio di domani')
    ok(pg.locator('.card-titolo', has_text='Chiudi la giornata').count() == 0, 'riquadro sparito dopo la chiusura')
    # Riapro e annullo lo spostamento
    pg.evaluate("apriChiusura()"); pg.wait_for_selector('.foglio')
    pg.click('.foglio >> text=→ domani'); pg.click('.foglio button:has-text("Fatto")'); pg.wait_for_timeout(300)
    ok('Chi 2.3' not in str(pg.evaluate("Studio.vociDelGiorno(daDt('2026-11-13')).map(x => Studio.etichetta(x.v.k))")), 'spostamento annullato riaprendo la chiusura')
    # Statistiche sonno: servono almeno 3 giornate
    pg.evaluate("""(() => { [['2026-11-09', 5, 2, 55], ['2026-11-10', 8, 5, 90], ['2026-11-11', 6, 3, 65]].forEach(([d, s, f, pt], i) => {
      Stato.salva({ id: 'g-' + d, type: 'giorno', updatedAt: 0, data: d, sonno: s, focus: f, chiuso: true });
      Stato.salva({ id: 'prog-X-' + i, type: 'progresso', updatedAt: 0, fatta: true, data: d, punteggio: pt }); }); })()""")
    pg.evaluate("UI.studioVista = 'statistiche'; vai('studio')"); pg.wait_for_timeout(300)
    t = pg.inner_text('body')
    ok('sonno, concentrazione e risultati' in t.lower() and 'con ≥ 7 h' in t, 'statistiche sonno/concentrazione')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
