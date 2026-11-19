# Test v0.57 (BP6 · A13): la CSP di index.html è stretta ma non blocca l'app.
# Unico test SENZA bypass_csp: l'app si avvia, le viste si disegnano e non c'è nessuna violazione della politica.
# Controlla anche che ogni endpoint AI di 07-ia.ts e gli host Google siano in connect-src.
import os, re, http.server, threading, functools
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

# --- statico: direttive e host ---
html = open(os.path.join(QUI, '..', 'public', 'index.html'), encoding='utf-8').read()
m = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', html)
ok(bool(m), 'meta CSP presente')
csp = {d.strip().split(' ')[0]: d.strip().split(' ')[1:] for d in (m.group(1) if m else '').split(';') if d.strip()}
ok(csp.get('object-src') == ["'none'"], "object-src 'none'")
ok(csp.get('base-uri') == ["'self'"], "base-uri 'self'")
ok(csp.get('default-src') == ["'self'"], "default-src 'self'")
ok("'unsafe-eval'" not in csp.get('script-src', []), "niente 'unsafe-eval' in script-src")
ok('*' not in csp.get('connect-src', []) and 'https:' not in csp.get('connect-src', []), 'connect-src senza jolly')
ia = open(os.path.join(QUI, '..', 'src', '07-ia.ts'), encoding='utf-8').read()
host_ia = sorted(set(re.findall(r"'(https://[a-z0-9.-]+)/", ia)))
ok(len(host_ia) >= 5, 'endpoint AI trovati in 07-ia.ts (%d)' % len(host_ia))
mancanti = [x for x in host_ia if x not in csp.get('connect-src', [])]
ok(not mancanti, 'ogni endpoint AI è in connect-src (%s)' % (mancanti or 'tutti'))
for g in ('https://www.googleapis.com', 'https://accounts.google.com'):
    ok(g in csp.get('connect-src', []), 'Google in connect-src: ' + g)
for g in ('https://accounts.google.com', 'https://apis.google.com', 'https://cdnjs.cloudflare.com'):
    ok(g in csp.get('script-src', []), 'GIS / Google API / pdf.js in script-src: ' + g)

# --- dinamico: l'app gira con la CSP attiva ---
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pe = []
    pg.on('pageerror', lambda e: pe.append(str(e)))
    pg.add_init_script("window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));")
    pg.goto(URL); pg.wait_for_selector('nav, .barra, #app', timeout=15000); pg.wait_for_timeout(800)
    ok(pg.evaluate("typeof VERSIONE === 'string' && typeof Stato === 'object'"), 'app avviata con la CSP')
    for nome, js in [('oggi', "vai('oggi')"), ('mese', "vai('cal','mese')"), ('agenda', "vai('cal','agenda')"),
                     ('studio', "UI.studioVista='schede';vai('studio')"), ('errori', "UI.studioVista='errori';vai('studio')"), ('altro', "vai('altro')")]:
        pg.evaluate(js); pg.wait_for_timeout(150)
    pg.evaluate("void chiedi('Prova CSP', [{ testo: 'Va bene', valore: 'si' }])"); pg.wait_for_selector('dialog.dialogo-sfondo[open]')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    ok(pg.locator('dialog.dialogo-sfondo').count() == 0, 'dialogo chiuso con Esc sotto CSP')
    v = pg.evaluate('window.__csp')
    ok(not v, 'nessuna violazione CSP (%s)' % (v or 'nessuna'))
    ok(not pe, 'nessun errore di pagina (%s)' % (pe[:2] or 'nessuno'))
    b.close()
srv.shutdown()
print('TUTTO OK' if not err else '%d FALLITI' % len(err))
