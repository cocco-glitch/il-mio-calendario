# Fase 5 del brief: matrice obiettivo → concetto → pagine → domande → risultato nella vista Padronanza (0 chiamate AI).
# Ospite, scheda C-3.1.1-1 della banca: un concetto verificato male (da studiare) → aprendo la scheda la lista diventa la matrice
# (una riga per concetto del focus con pagine citate, numero di domande, stato e motivo), riepilogo dei buchi, azione «Verifica»
# sul concetto debole che apre la mini-verifica; accessibilità e niente sforamento a 375 px.
import os, re, http.server, threading, functools
from playwright.sync_api import sync_playwright
RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128
http.server.SimpleHTTPRequestHandler.protocol_version = 'HTTP/1.1'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err, rete_ai = [], []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)

SK = 'C-3.1.1-1'
with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 375, 'height': 800}, locale='it-IT', timezone_id='Europe/Rome')
    ctx.route(re.compile(r'https://(api\.groq\.com|generativelanguage\.googleapis\.com|api\.xkiro\.com|api\.cohere\.com|router\.requesty\.ai)/.*'),
              lambda r: (rete_ai.append(r.request.url), r.abort()))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e))); pg.on('console', lambda m: print('   [console]', m.type, m.text[:200]) if m.type in ('error', 'warning') else None)
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    et = pg.evaluate("""async sk => { await caricaMotoreStudio(); const B = await Banca.carica(3), et = Concetti.etichette(B.schede[sk].focus);
      const m = Concetti.aggiorna(undefined, { id: 'mem-con-prova', chiave: Concetti.chiave(sk, et[0]), sk, etichetta: et[0], ripiego: false, nEt: et.length },
        [{ ok: false }, { ok: false }, { ok: false }], ymd(new Date())); Stato.salva(m, true); return et; }""", SK)
    ok(len(et) >= 2, 'scheda con %d concetti nel focus' % len(et))
    pg.evaluate("UI.studioVista = 'statistiche'; vai('studio')")
    pg.wait_for_selector('.pad-scheda', timeout=8000)
    scheda = pg.locator('.pad-scheda').first
    scheda.locator('summary').click()
    pg.wait_for_selector('.pad-matrice', timeout=10000)
    righe = scheda.locator('.pad-matrice > li')
    testi = [righe.nth(i).inner_text() for i in range(righe.count())]
    ok(righe.count() >= len(et), 'una riga per concetto del focus (%d righe, %d concetti)' % (righe.count(), len(et)))
    ok(all('Pagine:' in t and 'Domande:' in t for t in testi), 'ogni riga: pagine citate e numero di domande')
    ok(et[0] in testi[0] and 'da studiare' in testi[0].lower() and 'Verifica' in testi[0], 'concetto debole: stato, motivo e azione «Verifica» (%s)' % testi[0].replace('\n', ' | ')[:160])
    ok(any(re.search(r'(p+\.|slide) \d+', t) for t in testi), 'pagine o slide dalle citazioni delle domande (%s)' % [t.split('\n')[1][:60] for t in testi[:2]])
    st = scheda.locator('[role=status]').inner_text()
    ok(re.search(r'\d+ concett[oi] da sistemare su \d+', st) is not None, 'riepilogo dei buchi della scheda (%s)' % st)
    ok(all('%' not in t for t in testi if 'non verificato' in t.lower()), 'nessuna percentuale per i concetti mai verificati')
    senza = pg.evaluate("[...document.querySelectorAll('.pad-sezione button, .pad-sezione summary')].filter(b => !(b.getAttribute('aria-label') || b.textContent.trim())).length")
    ok(senza == 0, 'nessun controllo senza nome (%d)' % senza)
    ok(not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"), 'nessuno sforamento orizzontale a 375 px')
    pg.screenshot(path='test/matrice.png', full_page=False)
    scheda.get_by_role('button', name='Verifica ' + et[0]).click()
    pg.wait_for_selector('.qz-domanda', timeout=8000)
    occh = pg.locator('.qz-occhiello').first.inner_text()
    ok('verifica dei concetti' in occh.lower() and '2 domande' in occh.lower(), '«Verifica» apre la mini-verifica del concetto (%s)' % occh)
    ok(not rete_ai, 'zero chiamate AI (%s)' % rete_ai)

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
