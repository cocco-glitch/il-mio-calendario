# Test v0.12: punti deboli per tipo di domanda e sotto-step più deboli (Studio → Statistiche).
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
    pg.clock.install(time='2026-11-12T20:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("Studio.pkStep().length >= 3")
    pg.evaluate("UI.studioVista = 'statistiche'; vai('studio')"); pg.wait_for_selector('text=Punti deboli per tipo di domanda')
    ok('Si riempie da sola' in pg.inner_text('.pagina'), 'senza dati: spiegazione')
    pg.evaluate("""(() => {
      const P = k => Studio.schedeDi(Studio.trovaSotto(k).sub).filter(x => x.tipo === 'P').map(x => x.id);
      const c = P('C2.1'), b = P('B2.1');
      Studio.segna(c[0], { fatta: true, data: '2026-11-12', punteggio: 75, deboli: [['Sbarramento', 3, 3], ['Trabocchetto', 1, 3], ['Completamento', 4, 6]] });
      Studio.segna(c[1], { fatta: true, data: '2026-11-12', punteggio: 60, deboli: [['Trabocchetto', 1, 2], ['Completamento', 5, 6]] });
      Studio.segna(b[0], { fatta: true, data: '2026-11-12', punteggio: 90, deboli: [['Applicativo', 9, 10]] });
      Studio.segna('F-2.1.1-1', { fatta: true, data: '2026-11-12', punteggio: 95 });
      Stato.salva({ id: 'sim-1', type: 'simulazione', updatedAt: 0, data: '2026-11-12', ora: '09:00', fileId: 'f', nome: 'Sim', pct: 70, minuti: 45, limite: 50, deboli: [['Completamento', 9, 16], ['Sbarramento', 12, 15]] });
    })()"""); pg.wait_for_timeout(300)
    d = pg.evaluate("puntiDeboli()")
    ok(d['quiz'] == 4, 'quiz contati: %d' % d['quiz'])
    chi = next(g for g in d['gruppi'] if g['chiave'] == 'C')
    ok([r['tipo'] for r in chi['righe']] == ['Trabocchetto', 'Completamento', 'Sbarramento'] and chi['righe'][0]['ok'] == 2 and chi['righe'][0]['tot'] == 5, 'Chimica: trabocchetto 2/5 per primo')
    ok(d['gruppi'][-1]['nome'] == 'Simulazioni', 'simulazioni in fondo')
    t = pg.inner_text('body'); pg.screenshot(path='test/deboli.png', full_page=True)
    ok('più debole' in t and '40%' in t and 'sotto-step più deboli' in t.lower(), 'interfaccia: tipo più debole e sotto-step')
    ok(t.index('Chi 2.1') < t.index('Bio 2.1'), 'sotto-step ordinati dal più debole (Chi 2.1 67% prima di Bio 2.1 90%)')
    pg.screenshot(path='test/deboli.png', full_page=True)
    pg.click('.voce-lista >> text=Chi 2.1'); pg.wait_for_timeout(200)
    ok(pg.evaluate("UI.studioSub") == 'C2.1', 'tocco → apre il sotto-step')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
