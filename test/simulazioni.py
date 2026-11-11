# Test v0.11: modalità simulazione d'esame (Drive finto, quiz finto con la schermata finale del motore).
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

QUIZ = r'''<!doctype html><html><head><meta charset="utf-8"></head><body><main id="app"><div class="stat"><span>Domanda <b>1</b> di 31</span></div></main><button id="fine">fine</button>
<script>document.getElementById('fine').onclick=function(){document.getElementById('app').innerHTML='<section class="card"><div class="score"><div class="big">24<small> / 31</small></div><div class="pct">77% di risposte corrette</div></div><div class="levels"><div class="lvrow"><span>Sbarramento</span><span class="bar"></span><span class="n">10/11</span></div><div class="lvrow"><span>Completamento</span><span class="bar"></span><span class="n">9/16</span></div><p class="weak"><b>Punto debole:</b> Completamento (7 errori su 16, 44%)</p></div></section>'};</script></body></html>'''

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-22T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("!!Studio.pkPiano()")
    pg.evaluate("""(q => { window.serveGoogle = () => false;
      Drive.cercaCartelle = async t => t === 'consolidamento' ? [{ id: 'cart1', name: 'Schede esame/consolidamento' }] : [];
      Drive.elencaTutti = async id => id === 'cart1' ? [{ id: 'f2', name: 'Simulazione mista 2.html' }, { id: 'f1', name: 'Simulazione mista 1.html' }, { id: 'x', name: 'note.txt' }] : [];
      Drive.scaricaTesto = async id => q; })(%s)""" % json.dumps(QUIZ))
    # Il giorno della Simulazione 3: la voce del piano apre la modalità simulazione
    voce = pg.locator('.voce-lista', has_text='Simulazione 3')
    ok(voce.count() >= 1 and 'tocca per iniziare' in voce.first.inner_text(), 'Oggi: «Simulazione 3 · tocca per iniziare»')
    voce.first.click(); pg.wait_for_selector('.foglio >> text=Simulazione mista 1')
    t = pg.inner_text('.foglio')
    ok(t.index('mista 1') < t.index('mista 2') and 'note' not in t, 'elenco dei file HTML in ordine')
    pg.click('.foglio >> text=Simulazione mista 1'); pg.wait_for_selector('.visore iframe')
    ok(pg.inner_text('.sim-orologio') in ('50:00', '49:59'), 'conto alla rovescia da 50 minuti: ' + pg.inner_text('.sim-orologio'))
    pg.clock.run_for(40 * 60000 + 1000); pg.wait_for_timeout(200)
    ok(pg.inner_text('.sim-orologio').startswith('9:') and 'ultimi' in pg.get_attribute('.sim-orologio', 'class'), 'ultimi 10 minuti evidenziati: ' + pg.inner_text('.sim-orologio'))
    ok('Mancano 10 minuti' in pg.inner_text('#avvisi'), 'avviso a 10 minuti dalla fine')
    pg.screenshot(path='test/simulazione.png')
    pg.frame_locator('.visore iframe').locator('#fine').click(); pg.wait_for_timeout(400)
    s = pg.evaluate("Stato.tutti('simulazione')")
    ok(len(s) == 1 and s[0]['pct'] == 77 and s[0]['giuste'] == 24 and s[0]['totale'] == 31 and s[0]['minuti'] == 40 and s[0]['debole'] == 'Completamento', 'risultato salvato: %s' % (s and {k: s[0][k] for k in ('pct', 'giuste', 'totale', 'minuti', 'debole')}))
    ok('Simulazione salvata: 77%' in pg.inner_text('#avvisi'), 'avviso di salvataggio')
    ok(pg.evaluate("Stato.tutti('progresso').length") == 0, 'nessuna scheda di step toccata')
    pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_timeout(200)
    ok(pg.locator('.visore').count() == 0, 'visore chiuso')
    pg.screenshot(path='test/sim-dopo.png')
    pg.evaluate("UI.studioVista = 'esami'; UI.studioSub = null; vai('studio')"); pg.wait_for_selector('text=Simulazioni a tempo')
    ok('77%' in pg.inner_text('.pagina') and '40/50 min' in pg.inner_text('.pagina'), 'storico in Studio → Esami')
    pg.evaluate("apriSimulazioni()"); pg.wait_for_selector('.foglio >> text=Fatta 1 volta')
    ok('ultima 77%' in pg.inner_text('.foglio'), 'nell\'elenco: già fatta, ultima 77%')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
