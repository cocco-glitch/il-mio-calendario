# Test v0.14: prova a freddo (pretest) prima di uno step nuovo.
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
QUIZ = r'''<!doctype html><html><head></head><body><main id="app"><div class="stat"><span>Domanda <b>1</b> di 12</span></div></main><button id="fine">fine</button>
<script>document.getElementById('fine').onclick=function(){document.getElementById('app').innerHTML='<div class="score"><div class="big">5<small> / 12</small></div><div class="pct">42% di risposte corrette</div></div>'};</script></body></html>'''

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-12T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("!!Studio.pkPiano() && Studio.pkStep().length >= 3")
    pg.evaluate("(q => { window.serveGoogle = () => false; Studio.idQuiz = async () => 'q1'; Drive.scaricaTesto = async () => q; })(%s)" % json.dumps(QUIZ))
    pg.evaluate("vai('oggi')"); pg.wait_for_timeout(200)
    chips = pg.locator('.chip', has_text='Prova a freddo')
    ok(chips.count() == 2 and 'Bio 2.2' in chips.nth(0).inner_text() and 'Chi 2.3' in chips.nth(1).inner_text(), 'Oggi: prova a freddo per Bio 2.2 e Chi 2.3')
    pg.screenshot(path='test/freddo-oggi.png', full_page=True)
    chips.nth(0).click(); pg.wait_for_selector('text=Inizia la prova')
    ok('SENZA aver studiato' in pg.inner_text('body'), 'spiegazione prima di iniziare')
    pg.click('text=Inizia la prova'); pg.wait_for_selector('.visore iframe')
    pg.frame_locator('.visore iframe').locator('#fine').click(); pg.wait_for_timeout(400)
    r = pg.evaluate("Freddo.rec('B2.2')")
    sid = pg.evaluate("Freddo.scheda('B2.2').id")
    ok(r and r['pct'] == 42 and r['schedaId'] == sid, 'prova a freddo salvata: 42%')
    ok(not pg.evaluate("Studio.prog('%s')" % sid), 'punteggio della scheda NON toccato')
    ok(not pg.evaluate("Stato.tutti('memoria').length"), 'nessun ripasso creato')
    ok('Prova a freddo: 42%' in pg.inner_text('#avvisi'), 'avviso dopo la prova')
    pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_timeout(200)
    ok(pg.locator('.foglio').count() == 0, 'chiudendo non si apre il foglio della scheda')
    ok(pg.locator('.chip', has_text='Prova a freddo · Bio 2.2').count() == 0 and pg.locator('.chip', has_text='Prova a freddo · Chi 2.3').count() == 1, 'il pulsante di Bio 2.2 sparisce, resta Chi 2.3')
    # Dopo aver studiato: la stessa scheda fatta sul serio mostra il confronto
    pg.evaluate("void Cattura.salva('%s', { imc: 'quiz-risultato', pct: 83, giuste: 10, totale: 12, livelli: [], debole: null, errori: false })" % sid); pg.wait_for_timeout(200)
    ok('a freddo era 42% (+41)' in pg.inner_text('#avvisi') and 'Annullato' not in pg.inner_text('#avvisi'), 'confronto dopo lo studio: ' + pg.inner_text('#avvisi'))
    ok(pg.evaluate("Studio.prog('%s').punteggio" % sid) == 83, 'punteggio vero salvato')
    # Nel sotto-step: risultato della prova; in uno step già iniziato niente pulsante
    pg.evaluate("UI.studioStep = Studio.pkStep()[1].id; UI.studioSub = 'B2.2'; vai('studio')"); pg.wait_for_timeout(200)
    ok('Prova a freddo del 12/11: 42% (5/12)' in pg.inner_text('body'), 'sotto-step: risultato della prova a freddo')
    pg.evaluate("UI.studioSub = 'C2.3'; disegna()"); pg.wait_for_timeout(200)
    ok(pg.locator('button', has_text='Prova a freddo (prima di studiare)').count() == 1, 'sotto-step non iniziato: pulsante presente')
    pg.evaluate("Studio.segna(Freddo.scheda('C2.3').id, { fatta: true })"); pg.wait_for_timeout(200)
    ok(pg.locator('button', has_text='Prova a freddo (prima di studiare)').count() == 0, 'step iniziato: niente prova a freddo')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
