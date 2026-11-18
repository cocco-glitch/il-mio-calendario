# Test v0.45: parseJsonSicuro (BP1 §4.6) — think, fence, testo intorno, LaTeX nelle stringhe, riprova unica in IA.chiedi.
import os, http.server, threading, functools, json
from playwright.sync_api import sync_playwright
RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128   # Windows: coda più ampia per i caricamenti in parallelo
http.server.SimpleHTTPRequestHandler.protocol_version = 'HTTP/1.1'   # Windows: con HTTP/1.0 a volte ERR_CONNECTION_RESET
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err = []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)

# (nome, testo restituito dal modello, valore atteso di "e")
CASI = [
    ('frac', r'{"e":"\frac{1}{2}"}', r'\frac{1}{2}'),
    ('beta', r'{"e":"\beta"}', r'\beta'),
    ('text', r'{"e":"5 \text{mol}"}', r'5 \text{mol}'),
    ('times', r'{"e":"2 \times 3"}', r'2 \times 3'),
    ('theta', r'{"e":"\theta"}', r'\theta'),
    ('left/right', r'{"e":"\left( x \right)"}', r'\left( x \right)'),
    ('neq', r'{"e":"a \neq b"}', r'a \neq b'),
    ('già raddoppiato', r'{"e":"\\frac{1}{2}"}', r'\frac{1}{2}'),
    ('\\n vero + parola italiana', r'{"e":"riga1\nnuovo"}', 'riga1\nnuovo'),
    ('\\n vero + Maiuscola', r'{"e":"A\nB"}', 'A\nB'),
    ('think + fence + testo dopo', '<think>{bozza}</think>```json\n{"e":"ok"}\n```\nSpero vada bene {x}', 'ok'),
    ('graffa dentro stringa', r'{"e":"usa } e ] qui"} coda', 'usa } e ] qui'),
    ('think non chiuso (gpt-oss troncato)', 'ragiono...</think>{"e":"x"}', 'x'),
    # oltre ai 13 di BP1
    ('unicode \\u00e8 intatto', r'{"e":"perchè"}', 'perchè'),
    ('LaTeX inline \\( \\) e \\,', r'{"e":"\(x\,y\)"}', r'\(x\,y\)'),
    ('virgolette escapate', r'{"e":"detto \"ciao\""}', 'detto "ciao"'),
    ('\\ce chimica', r'{"e":"\ce{H2O}"}', r'\ce{H2O}'),
]

with sync_playwright() as p:
    pg = p.chromium.launch().new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    for nome, raw, att in CASI:
        r = pg.evaluate("r => { try { return IA.parseJsonSicuro(r).e; } catch (e) { return 'ERRORE ' + e.message; } }", raw)
        ok(r == att, 'parse %s%s' % (nome, '' if r == att else ' → %r (atteso %r)' % (r, att)))
    r = pg.evaluate("r => IA.parseJsonSicuro(r)", '[{"a":1},{"a":2}] fine')
    ok(r == [{'a': 1}, {'a': 2}], 'array al primo livello')
    r = pg.evaluate("r => { try { IA.parseJsonSicuro(r); return 'nessun errore'; } catch (e) { return e.message; } }", 'non ho JSON da darti')
    ok('JSON' in r, 'testo senza JSON → errore chiaro: ' + r)

    # IA.chiedi: prima risposta illeggibile → una sola riprova con richiesta di JSON valido
    r = pg.evaluate("""async () => {
      localStorage.setItem('imc-groq-chiave', 'gsk_finta'); const chiamate = []; let n = 0;
      window.fetch = async (url, op) => {
        if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'openai/gpt-oss-120b' }] }), { status: 200 });
        const b = JSON.parse(op.body); chiamate.push(b.messages.length); n++;
        const testo = n === 1 ? 'Ecco: {"e": "non chiuso' : '{"e":"\\\\frac{1}{2}"}';
        return new Response(JSON.stringify({ choices: [{ message: { content: testo } }] }), { status: 200 });
      };
      const out = await IA.chiedi([{ role: 'user', content: 'dammi JSON' }], 'genera');
      return { e: out.j.e, chiamate, ultimo: '' };
    }""")
    ok(r['e'] == r'\frac{1}{2}' and len(r['chiamate']) == 2 and r['chiamate'][1] == 3, 'riprova unica dopo JSON illeggibile: %s' % r)

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
