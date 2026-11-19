# Test v0.58.5 «HUD che non copre»: avvisi in basso (mai sopra Cerca, +, Annulla/Salva, barra, timer),
# al massimo 2 e senza doppioni (U1, B2); con il timer attivo l'ultima tessera resta sopra la pillola (U9).
import os, sys, http.server, threading, functools
from playwright.sync_api import sync_playwright
QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.join(QUI, '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128
http.server.SimpleHTTPRequestHandler.protocol_version = 'HTTP/1.1'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err = []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)

# pulsanti dell'interfaccia fissa: nessuno deve avere un avviso sopra il suo centro
COPERTI = """(sel) => Array.from(document.querySelectorAll(sel)).filter(b => { const r = b.getBoundingClientRect();
  if (!r.width || !r.height || getComputedStyle(b).visibility === 'hidden') return false;
  const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(e && e.closest('#avvisi')); })
  .map(b => b.getAttribute('aria-label') || b.textContent.trim())"""
FISSI = '.testata button, .tabbar button, .fab, #timer-barra button, .foglio-testa button'
AVVISI = "() => { avviso('Primo avviso abbastanza lungo da occupare quasi tutta la larghezza dello schermo del telefono', 8000); avviso('Secondo', 8000); avviso('Terzo avviso', 8000); avviso('Terzo avviso', 8000); }"
TIMER = "() => { localStorage.setItem('imc-timer', JSON.stringify({ inizio: Date.now(), durata: 25, fase: 'studio' })); Timer.aggiorna(); }"

with sync_playwright() as p:
    b = p.chromium.launch()
    for nome, vp in (('telefono', {'width': 390, 'height': 844}), ('desktop', {'width': 1280, 'height': 800})):
        ctx = b.new_context(bypass_csp=True, viewport=vp)
        ctx.route('**/cdnjs.cloudflare.com/**', lambda r: r.abort())
        pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
        pg.goto(URL); pg.wait_for_selector('.tabbar')

        # --- Oggi: Cerca e + in testata ---
        pg.evaluate(AVVISI); pg.wait_for_timeout(300)
        testi = pg.eval_on_selector_all('#avvisi .avviso', 'els => els.map(e => e.textContent)')
        ok(len(testi) == 2 and testi == ['Secondo', 'Terzo avviso'], '%s: al massimo 2 avvisi, senza doppioni (%s)' % (nome, testi))
        c = pg.evaluate(COPERTI, FISSI)
        ok(c == [], '%s, Oggi: nessun pulsante fisso coperto (%s)' % (nome, c))
        r = pg.evaluate("() => { const z = document.querySelector('#avvisi').getBoundingClientRect(); const t = document.querySelector('.testata').getBoundingClientRect(); return z.top > t.bottom; }")
        ok(r, '%s: zona avvisi sotto la testata' % nome)

        # --- Calendario: + flottante (telefono) ---
        pg.evaluate("() => vai('cal')"); pg.wait_for_timeout(200); pg.evaluate(AVVISI); pg.wait_for_timeout(300)
        c = pg.evaluate(COPERTI, FISSI)
        ok(c == [], '%s, Calendario: nessun pulsante fisso coperto, + compreso (%s)' % (nome, c))

        # --- foglio aperto: Annulla e Salva restano cliccabili ---
        pg.evaluate("() => foglio({ titolo: 'Prova', corpo: h('div', null, 'corpo'), salva: () => true })"); pg.wait_for_selector('.foglio-testa')
        pg.evaluate(AVVISI); pg.wait_for_timeout(300)
        c = pg.evaluate(COPERTI, '.foglio-testa button')
        ok(c == [] and pg.locator('.foglio-testa button').count() >= 2, '%s, foglio: Annulla/Salva non coperti (%s)' % (nome, c))
        pg.locator('.foglio-testa button', has_text='Annulla').click(); pg.wait_for_timeout(200)

        # --- timer attivo: avvisi sopra la pillola; ultima tessera di Altro non coperta (U9) ---
        pg.evaluate("() => vai('altro')"); pg.wait_for_timeout(200)
        pg.evaluate(TIMER); pg.wait_for_selector('#timer-barra'); pg.evaluate(AVVISI); pg.wait_for_timeout(300)
        c = pg.evaluate(COPERTI, FISSI)
        ok(c == [], '%s, timer attivo: pulsanti del timer e della barra non coperti (%s)' % (nome, c))
        pg.evaluate("() => document.querySelectorAll('#avvisi .avviso').forEach(e => e.remove())")
        r = pg.evaluate("""() => { const m = document.querySelector('main'); m.scrollTop = m.scrollHeight;
          const ult = document.querySelector('main .pagina').lastElementChild.getBoundingClientRect(); const t = document.querySelector('#timer-barra').getBoundingClientRect();
          return { ult: Math.round(ult.bottom), timer: Math.round(t.top) }; }""")
        ok(r['ult'] <= r['timer'], '%s: ultima riga di Altro sopra il timer (%s)' % (nome, r))
        pg.evaluate("() => { localStorage.removeItem('imc-timer'); Timer.aggiorna(); }")
        ctx.close()
    b.close()
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)), *err, sep='\n'); sys.exit(1 if err else 0)
