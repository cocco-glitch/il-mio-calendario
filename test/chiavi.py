# Test v0.44.1: chiavi AI (Gemini «AQ.»), scelta dei modelli disponibili, finestra pacchetti con «Fatto».
import os, http.server, threading, functools
from playwright.sync_api import sync_playwright
RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128   # Windows: coda più ampia per i caricamenti in parallelo
http.server.SimpleHTTPRequestHandler.protocol_version = 'HTTP/1.1'   # Windows: con HTTP/1.0 la chiusura del socket a volte tronca app.js (ERR_CONNECTION_RESET)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err = []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)
with sync_playwright() as p:
    pg = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 420, 'height': 900}, locale='it-IT').new_page()
    pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    r = pg.evaluate('''async () => {
      localStorage.setItem('imc-groq-chiave', 'gsk_x'); localStorage.setItem('imc-gemini-chiave', 'AQ.Ab8RN6nuovaChiave');
      const log = [];
      window.fetch = async (u, o) => { u = String(u); const h = (o && o.headers) || {}; log.push((h.Authorization ? 'B' : h['x-goog-api-key'] ? 'X' : u.includes('key=') ? 'Q' : '-') + ' ' + u.replace(/^https:\\/\\/[^/]+/, '') + (o && o.body ? ' ' + JSON.parse(o.body).model : ''));
        if (u.includes('generativelanguage')) {
          if (h.Authorization) return new Response('{"error":{"message":"API key not valid"}}', { status: 401 });   // le chiavi AQ non vanno come Bearer
          if (u.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'models/gemini-2.5-flash' }, { id: 'models/gemini-2.5-flash-lite' }] }));
          return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
        }
        if (u.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'openai/gpt-oss-120b' }, { id: 'openai/gpt-oss-20b' }] }));   // llama-3.3-70b non disponibile per questa chiave
        const m = JSON.parse(o.body).model; if (m === 'llama-3.3-70b-versatile') return new Response('{"error":{"message":"model does not exist or you do not have access"}}', { status: 404 });
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":"' + m + '"}' } }] })); };
      const g = await IA.chiedi([{ role: 'user', content: 'json' }], 'genera');
      const rv = await IA.chiedi([{ role: 'user', content: 'json' }], 'revisiona');
      const cat = (await IA.catena('revisiona')).map(f => f.modello);
      const sp = await Spiega.chat([{ role: 'user', content: 'json' }]);
      return { g: g.modello, rv: rv.modello, cat, sp, log: log.slice(0, 8) }; }''')
    ok(r['g'] == 'gemini-2.5-flash-lite', 'chiave Gemini «AQ.» funziona (genera con %s)' % r['g'])
    ok(any(x.startswith('X ') for x in r['log']), 'per le chiavi nuove usa l\'intestazione x-goog-api-key')
    ok('llama-3.3-70b-versatile' not in r['cat'] and r['rv'] in ('openai/gpt-oss-120b', 'gemini-2.5-flash'), 'modello senza accesso saltato: revisore = %s, catena %s' % (r['rv'], r['cat']))
    ok(r['sp'] is not None, 'spiegazioni: se il modello fisso fallisce passa ai modelli disponibili (%s)' % r['sp'])
    pg.evaluate("localStorage.setItem('imc-gemini-chiave', '')")
    pg.locator('.tabbar button', has_text='Altro').click(); pg.wait_for_timeout(300)
    # finestra pacchetti: deve avere «Fatto» e chiudersi
    pg.evaluate('''() => { window.serveGoogle = () => false; Drive.preparaCartelle = async () => {}; Drive.idCartella = () => 'a'; Drive.elencaTutti = async () => []; Drive.api = async () => ({ files: [] }); }''')
    pg.evaluate("vai('studio')"); pg.wait_for_timeout(300)
    b = pg.locator('button', has_text='Aggiorna pacchetti da Drive')
    if b.count() == 0:
        pg.evaluate("UI.studioVista = 'schede'; disegna()"); pg.wait_for_timeout(300)
    pg.locator('button', has_text='Aggiorna pacchetti da Drive').first.click()
    pg.wait_for_selector('.foglio:has-text("Pacchetti dal Drive")'); pg.wait_for_timeout(500)
    ok(pg.locator('.foglio button', has_text='Fatto').count() == 1, 'finestra pacchetti: c\'è il tasto «Fatto»')
    pg.locator('.foglio button', has_text='Fatto').click(); pg.wait_for_timeout(400)
    ok(pg.locator('.foglio:has-text("Pacchetti dal Drive")').count() == 0, 'con «Fatto» la finestra si chiude')
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err) + '\n' + '\n'.join(err)))
raise SystemExit(1 if err else 0)
