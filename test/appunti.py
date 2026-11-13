# Test v0.28: appunti — scheda, editor, carte dalla sintassi, collegamento allo step, conferma Drive.
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
TESTO = "# Calore latente\n- serve per il cambio di stato\n- Calore latente di fusione del ghiaccio :: 334 J/g\n## Formule\n  - Q = m·{{L}}\nUna riga normale\n"
with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-13T17:30:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("Studio.pkStep().length >= 3")
    ok(pg.locator('.tabbar button', has_text='Appunti').count() == 1, 'scheda Appunti nella barra')
    c = pg.evaluate("Appunti.estraiCarte(%r)" % TESTO)
    ok(len(c) == 2 and c[0]['f'].startswith('Calore latente di fusione') and c[0]['ctx'] == 'Calore latente' and c[1]['ctx'] == 'Calore latente › Formule', 'carte + contesto dai titoli: %s' % c)
    pg.locator('.tabbar button', has_text='Appunti').click(); pg.wait_for_timeout(200)
    pg.click('text=＋ Nuovo appunto'); pg.wait_for_selector('.appunto-testo')
    pg.fill('.appunto-titolo', 'Chi 2.2.4 Calore latente'); pg.fill('.appunto-testo', TESTO)
    pg.wait_for_timeout(100)
    ok('🔗 Chi 2.2' in pg.inner_text('.appunto-stato') and '2 carte' in pg.inner_text('.appunto-stato'), 'stato: step collegato e 2 carte')
    pg.screenshot(path='test/appunti-editor.png')
    pg.clock.run_for(2000); pg.wait_for_timeout(100)
    a = pg.evaluate("Appunti.tutti()[0]")
    ok(a and a['sub'] == 'C2.2' and a['micro'] == '2.2.4', 'salvataggio automatico + collegamento allo step')
    ok(pg.evaluate("Carte.carteDi('mz-appunti').length") == 2 and pg.evaluate("Carte.mazzi().find(m => m.id.startsWith('mz-ap-')).sub") == 'C2.2', 'carte nel mazzo collegato')
    # togli una riga-carta → carta tolta
    pg.fill('.appunto-testo', TESTO.replace("- Calore latente di fusione del ghiaccio :: 334 J/g\n", ""))
    pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_timeout(300)
    ok(pg.evaluate("Carte.carteDi('mz-appunti').length") == 1, 'riga cancellata → carta tolta')
    ok(pg.locator('.dialogo').count() == 0, 'Drive non collegato: nessuna richiesta')
    # conferma Drive (finto Drive collegato)
    pg.evaluate("""() => { Object.defineProperty(Drive, 'collegato', { get: () => true }); window.serveGoogle = () => false;
      window._caricati = []; Drive.sottocartella = async () => 'cartAp'; Drive.carica = async (n, par, corpo, mime, id) => { _caricati.push([n, par, id || null]); return id || 'f1'; }; }""")
    pg.locator('.voce-lista', has_text='Calore latente').first.click(); pg.wait_for_selector('.appunto-testo')
    pg.fill('.appunto-testo', TESTO); pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_selector('.dialogo')
    ok('Salvare' in pg.inner_text('.dialogo'), 'chiede conferma prima di salvare su Drive')
    pg.click('.dialogo button:has-text("Salva su Drive")'); pg.wait_for_timeout(300)
    ok(pg.evaluate("_caricati") == [['Chi 2.2.4 Calore latente.md', 'cartAp', None]], 'copia .md creata in Appunti')
    pg.locator('.voce-lista', has_text='Calore latente').first.click(); pg.wait_for_selector('.appunto-testo')
    pg.fill('.appunto-testo', TESTO + "altro\n"); pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_selector('.dialogo')
    ok('Aggiorna la copia' in pg.inner_text('.dialogo'), 'seconda volta: aggiorna la copia')
    pg.click('.dialogo button:has-text("Aggiorna")'); pg.wait_for_timeout(300)
    ok(pg.evaluate("_caricati[1]") == ['Chi 2.2.4 Calore latente.md', 'cartAp', 'f1'], 'aggiorna lo stesso file')
    pg.screenshot(path='test/appunti-lista.png')
    # nello step
    pg.evaluate("UI.studioStep = Studio.pkStep()[1].id; UI.studioSub = 'C2.2'; UI.studioVista = 'schede'; vai('studio')"); pg.wait_for_timeout(200)
    ok(pg.locator('button', has_text='📝 Chi 2.2.4').count() == 1 and pg.locator('button', has_text='＋ Appunto').count() == 1, 'sotto-step: appunto collegato + nuovo')
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
