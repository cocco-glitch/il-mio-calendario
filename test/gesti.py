# Test v0.42: gesti del blocco note (pizzica+trascina insieme, elastico, doppio tocco, tocco a 2 dita = annulla).
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
    ctx = p.chromium.launch().new_context(viewport={'width': 800, 'height': 1200}, device_scale_factor=1.5, is_mobile=True, has_touch=True, locale='it-IT')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    cdp = ctx.new_cdp_session(pg)
    def touch(tipo, pts): cdp.send('Input.dispatchTouchEvent', {'type': tipo, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.locator('.tabbar button', has_text='Appunti').click(); pg.wait_for_timeout(200)
    pg.click('text=＋ Nuovo appunto'); pg.click('.appunto-modo button:has-text("A mano")'); pg.wait_for_selector('.mano-vivo'); pg.wait_for_timeout(600)
    r = pg.evaluate("(() => { const b = document.querySelector('.mano-foglio').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()")
    cx, cy = r[0] + r[2] / 2, r[1] + 250
    # pizzica (×2,5) e intanto trascina di 120 px a sinistra e 80 in alto
    touch('touchStart', [(cx - 40, cy), (cx + 40, cy)])
    fps = []
    for k in range(1, 21):
        s = 40 + 60 * k / 20; dx, dy = -120 * k / 20, -80 * k / 20
        t0 = pg.evaluate('performance.now()'); touch('touchMove', [(cx - s + dx, cy + dy), (cx + s + dx, cy + dy)]); pg.wait_for_timeout(16)
    touch('touchEnd', []); pg.wait_for_timeout(400)
    z = pg.inner_text('.mano-zoom')
    ok(z == '250%', 'pizzico: zoom 250%% (%s)' % z)
    # il punto del foglio che era sotto le dita è ora sotto il nuovo centro (± 3 px)
    sl = pg.evaluate("[document.querySelector('.mano-foglio').scrollLeft, document.querySelector('.mano-foglio').scrollTop]")
    base = r[2] / 1000; f = [(cx - r[0]) / base, (cy - r[1]) / base]
    attesi = [f[0] * base * 2.5 - (cx - 120 - r[0]), f[1] * base * 2.5 - (cy - 80 - r[1])]
    ok(abs(sl[0] - attesi[0]) < 4 and abs(sl[1] - attesi[1]) < 4, 'zoom e trascina insieme: il punto resta sotto le dita (%s vs %s)' % ([round(x) for x in sl], [round(x) for x in attesi]))
    # elastico: pizzico in dentro oltre il 100% → torna al 100%
    touch('touchStart', [(cx - 150, cy), (cx + 150, cy)])
    for k in range(1, 16): s = 150 - 140 * k / 15; touch('touchMove', [(cx - s, cy), (cx + s, cy)]); pg.wait_for_timeout(10)
    touch('touchEnd', []); pg.wait_for_timeout(500)
    ok(pg.locator('.mano-zoom[hidden]').count() == 1, 'elastico: sotto il 100% torna al 100%')
    # tocco a due dita fermo = annulla (dopo un tratto)
    pg.evaluate('''() => { const c = document.querySelector('.mano-vivo'), r = c.getBoundingClientRect(); const e = (n, x, y) => c.dispatchEvent(new PointerEvent(n, { pointerId: 4, pointerType: 'pen', pressure: .5, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true }));
      e('pointerdown', 50, 50); for (let i = 1; i < 10; i++) e('pointermove', 50 + i * 10, 50 + i * 3); e('pointerup', 140, 77); }''')
    pg.wait_for_timeout(100)
    n0 = pg.evaluate("document.querySelectorAll('.mano-vivo').length")
    touch('touchStart', [(cx - 30, cy + 300), (cx + 30, cy + 300)]); pg.wait_for_timeout(60); touch('touchEnd', []); pg.wait_for_timeout(300)
    ok(pg.locator('.avviso', has_text='Annullato').count() >= 1 or pg.locator('text=Annullato').count() >= 1, 'tocco a due dita = annulla')
    # dopo la penna il dito scorre: doppio tocco = zoom 2,5×, di nuovo = 100%
    for _ in range(2):
        touch('touchStart', [(cx, cy)]); touch('touchEnd', []); pg.wait_for_timeout(60)
    pg.wait_for_timeout(500)
    ok(pg.inner_text('.mano-zoom') == '250%', 'doppio tocco: zoom 2,5×')
    for _ in range(2):
        touch('touchStart', [(cx, cy)]); touch('touchEnd', []); pg.wait_for_timeout(60)
    pg.wait_for_timeout(500)
    ok(pg.locator('.mano-zoom[hidden]').count() == 1, 'doppio tocco di nuovo: torna al 100%')
    # prestazioni del frame durante il gesto con 3000 tratti
    ms = pg.evaluate('''() => { const t = []; for (let i = 0; i < 3000; i++) { const p = []; const x = (i * 37) % 900, y = (i * 2.8) % 8400; for (let k = 0; k < 40; k++) p.push([x + k * 2, y + Math.sin(k) * 6, 40 + k % 30]); t.push(codTratto('#1f2a44', 3, 'p', p)); }
      const g = document.createElement('canvas'); g.width = 1200; g.height = 1800; const c = g.getContext('2d'); const m = { t, h: 8484, sf: 'quadretti' };
      const t0 = performance.now(); for (let f = 0; f < 60; f++) disegnaMano(c, m, .8 * (1 + f / 30), false, { ox: f * 7, oy: f * 90, w: 800, h: 1200, passo: 20, veloce: true }); return (performance.now() - t0) / 60; }''')
    ok(ms < 12, 'frame del gesto con 3000 tratti: %.1f ms (< 12 ms → 60+ fps)' % ms)
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
