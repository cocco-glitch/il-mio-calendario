# Test v0.15: "Studia ora" — composizione della sessione, avvio, avanzamento.
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
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-12T15:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("!!Studio.pkPiano() && Studio.pkStep().length >= 3")
    # C2.1 completato il 02/11 → ripasso oggi; una scheda di C2.1 con 50% → anche "da rifare"
    pg.evaluate("Studio.schedeDi(Studio.trovaSotto('C2.1').sub).filter(x => x.tipo === 'P').forEach((x, i) => Studio.segna(x.id, { fatta: true, data: '2026-11-11', punteggio: i ? 80 : 50 }))")
    tit = pg.eval_on_selector_all('.card', 'els => els.slice(0, 2).map(e => e.innerText.split("\\n")[0])')
    ok(tit[0] == '▶ Studia ora', 'pulsante in cima a Oggi: %s' % tit)
    v = pg.evaluate("StudiaOra.componi(50).map(v => v.tipo + ':' + v.min)")
    ok(v[0].startswith('ripasso') and 'freddo:10' in v and v[-1] == 'richiamo:5', '50 min: ripasso, prova a freddo, …, richiamo finale: %s' % v)
    ok(sum(int(x.split(':')[1]) for x in v) <= 55 and 'pausa:5' in v, 'durata rispettata con una pausa')
    ok(pg.evaluate("StudiaOra.componi(25).filter(v => v.tipo === 'pausa').length") == 0, '25 min: niente pause')
    ok(pg.evaluate("StudiaOra.componi(90).filter(v => v.tipo === 'scheda').length") >= 3, '90 min: più schede dello step')
    pg.click('text=▶ Studia ora'); pg.wait_for_selector('.foglio >> text=Quanto tempo hai?')
    pg.click('.foglio >> text=25 min'); pg.wait_for_timeout(100)
    pg.screenshot(path='test/studiaora.png')
    pg.click('.foglio button:has-text("Inizia")'); pg.wait_for_selector('.foglio >> text=Sessione in corso')
    t = pg.evaluate("JSON.parse(localStorage.getItem('imc-timer') || 'null')")
    ok(t and t['durata'] == 25, 'timer avviato per 25 minuti')
    ok('0 di' in pg.inner_text('.foglio'), 'sessione: 0 fatte')
    pg.locator('.foglio .spunta').first.click(); pg.wait_for_timeout(100)
    ok('1 di' in pg.inner_text('.foglio'), 'spunto la prima voce')
    pg.locator('.foglio .voce-corpo', has_text='Prova a freddo').first.click(); pg.wait_for_timeout(200)
    ok(pg.locator('text=Inizia la prova').count() == 1, 'la voce apre la prova a freddo')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    pg.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(e => e.remove()); vai('oggi')"); pg.wait_for_timeout(200)
    ok('Sessione in corso · 1/' in pg.inner_text('body'), 'Oggi: sessione in corso ripresa')
    pg.evaluate("StudiaOra.chiudi(); disegna()"); pg.wait_for_timeout(100)
    ok('▶ Studia ora' in pg.inner_text('body'), 'sessione chiusa')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
