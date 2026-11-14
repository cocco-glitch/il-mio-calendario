# Test v0.39: blocco note — forme (tieni premuto, strumento), stabilizzazione, gomma parziale, pannello penne, incolla.
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
    pg = p.chromium.launch().new_context(viewport={'width': 820, 'height': 1100}, locale='it-IT').new_page()
    pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    # riconoscimento puro
    r = pg.evaluate('''() => { const cerchio = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * 6.3; cerchio.push([200 + 80 * Math.cos(a) + (i % 3), 200 + 78 * Math.sin(a), 50]); }
      const rett = [[0,0],[100,2],[200,0],[201,60],[200,120],[100,121],[0,120],[1,60],[2,3]].map(q => [q[0], q[1], 50]);
      const tri = [[100,0],[150,50],[200,100],[100,100],[0,100],[50,50],[98,3]].map(q => [q[0], q[1], 50]);
      const linea = [[0,0],[50,1],[100,3],[150,2],[200,4]].map(q => [q[0], q[1], 50]);
      const sc = [[0,0],[30,40],[60,0],[90,40],[120,10]].map(q => [q[0], q[1], 50]);
      return [cerchio, rett, tri, linea, sc].map(x => { const f = riconosciForma(x); return f ? f.nome : null; }); }''')
    ok(r == ['cerchio', 'rettangolo', 'triangolo', 'linea', None], 'riconosce cerchio, rettangolo, triangolo, linea; lascia lo scarabocchio: %s' % r)
    pg.locator('.tabbar button', has_text='Appunti').click(); pg.wait_for_timeout(200)
    pg.click('text=＋ Nuovo appunto'); pg.wait_for_selector('.appunto-modo')
    pg.click('.appunto-modo button:has-text("A mano")'); pg.wait_for_selector('.mano-vivo'); pg.wait_for_timeout(200)
    pg.fill('.appunto-titolo', 'Prova penne')
    ev = '''([pts, tieni]) => new Promise(res => { const c = document.querySelector('.mano-vivo'), r = c.getBoundingClientRect();
      const e = (n, x, y) => c.dispatchEvent(new PointerEvent(n, { pointerId: 9, pointerType: 'pen', pressure: .6, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true }));
      e('pointerdown', pts[0][0], pts[0][1]); pts.slice(1).forEach(q => e('pointermove', q[0], q[1]));
      const l = pts[pts.length - 1];
      if (!tieni) { e('pointerup', l[0], l[1]); res(); return; }
      setTimeout(() => { e('pointermove', l[0] + 40, l[1]); e('pointerup', l[0] + 40, l[1]); res(); }, 700); })'''
    dati = "Appunti.tutti().find(a => a.titolo === 'Prova penne')"
    quasi = [[60 + i * 20, 100 + (i % 2) * 3] for i in range(12)]
    pg.evaluate(ev, [quasi, True]); pg.wait_for_timeout(200)
    pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_timeout(300)
    t = pg.evaluate("decodTratto(%s.mano.t[0])" % dati)
    ok(len(t['p']) == 2 and t['p'][0][1] == t['p'][1][1] - (t['p'][1][1] - t['p'][0][1]), 'tieni premuto: la linea diventa dritta (%d punti)' % len(t['p']))
    ok(abs(t['p'][1][0] - t['p'][0][0]) > 250, 'continuando a tenere la linea si allunga seguendo la penna')
    pg.locator('.nota-tessera', has_text='Prova penne').first.click(); pg.wait_for_selector('.mano-vivo'); pg.wait_for_timeout(200)
    # pannello penne
    pg.click('.mano-barra button[aria-label^="Penna:"]'); pg.wait_for_selector('.mano-opzioni')
    ok(pg.locator('.mano-opzioni .chip', has_text='Biro').count() == 1 and pg.locator('.mano-opzioni input[type=range]').count() == 2, 'pannello: tipi di penna, spessore, stabilizzazione')
    pg.click('.mano-opzioni .chip:has-text("Tratteggio")')
    pg.click('.mano-barra button[aria-label^="Forme"]'); pg.click('.mano-barra button[aria-label^="Forme"]'); pg.wait_for_selector('.mano-opzioni .chip:has-text("Ellisse")')
    pg.click('.mano-opzioni .chip:has-text("Ellisse")'); pg.click('.mano-opzioni .chip:has-text("Colorata")')
    pg.evaluate(ev, [[[100, 300], [200, 360], [300, 420]], False]); pg.wait_for_timeout(150)
    # gomma parziale
    pg.click('.mano-barra button[aria-label^="Penna:"]'); pg.click('.mano-opzioni .chip:has-text("Parziale")')
    pg.click('.mano-barra button[aria-label^="Gomma"]')
    pg.evaluate(ev, [[[100, 600], [101, 601]], False])
    pg.click('.mano-opzioni .chip:has-text("Biro")')
    pg.evaluate(ev, [[[60 + i * 25, 600 + (i * 7) % 30] for i in range(16)], False])
    pg.click('.mano-barra button[aria-label^="Gomma"]')
    pg.evaluate(ev, [[[250, 560 + i * 5] for i in range(22)], False])
    pg.screenshot(path='test/penne.png')
    pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_timeout(300)
    tt = pg.evaluate("%s.mano.t.map(decodTratto)" % dati)
    ok(any(x['k'] == 't' and x.get('f') and len(x['p']) > 40 for x in tt), 'strumento forme: ellisse tratteggiata e colorata')
    ok(sum(1 for x in tt if x['k'] == 'b') == 2, 'gomma parziale: il tratto a biro è tagliato in due (%d pezzi)' % sum(1 for x in tt if x['k'] == 'b'))
    pref = pg.evaluate("JSON.parse(localStorage.getItem('pref-mano'))")
    ok(pref['tipo'] == 'b' and pref['gomma'] == 'parziale', 'preferenze della penna ricordate')
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
