# Test v0.41: calcoli dopo «=» (testo e a mano), lezione audio con autocorrezione, menu a tendina.
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
with sync_playwright() as p:
    pg = p.chromium.launch().new_context(viewport={'width': 820, 'height': 1100}, locale='it-IT').new_page()
    pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    r = pg.evaluate('''() => [Calcolo.formatta(Calcolo.valuta('12*3,5')), Calcolo.formatta(Calcolo.valuta('2(3+1)^2')), Calcolo.formatta(Calcolo.valuta('sin(30)')), Calcolo.formatta(Calcolo.valuta('√16 + 10%')),
      Calcolo.formatta(Calcolo.valuta('6,02·10^23 * 2')), Calcolo.formatta(Calcolo.valuta('m*a', { m: 2, a: 9.81 })), (() => { try { Calcolo.valuta('alert(1)'); return 'eseguito'; } catch (e) { return 'bloccato'; } })(),
      Calcolo.suggerisci('m = 2\\nF = m*9,81 =', 25), Calcolo.suggerisci('ciao =', 6), Calcolo.suggerisci('5 =', 3)]''')
    ok(r == ['42', '32', '0,5', '4,1', '1,204·10^24', '19,62', 'bloccato', '19,62', None, None], 'valutatore sicuro: %s' % r)
    pg.evaluate("localStorage.setItem('imc-groq-chiave', 'gsk_x')")
    pg.locator('.tabbar button', has_text='Appunti').click(); pg.wait_for_timeout(200)
    pg.click('text=＋ Nuovo appunto'); pg.wait_for_selector('.appunto-testo')
    pg.fill('.appunto-titolo', 'Termochimica')
    pg.click('.appunto-testo'); pg.keyboard.type('v = 3\nv*4 =')
    ok(pg.locator('.calcolo-bolla:not([hidden])', has_text='12').count() == 1, 'bolla col risultato dopo «=»')
    pg.keyboard.press('Enter')
    ok(pg.input_value('.appunto-testo').endswith('v*4 = 12'), 'Invio inserisce il risultato')
    # menu a tendina
    pg.click('.appunto-barra .tendina-btn'); pg.wait_for_selector('.tendina-menu')
    ok(pg.locator('.tendina-menu button', has_text='Grassetto').count() == 1, 'menu a tendina della barra del testo')
    pg.mouse.click(5, 1090); pg.wait_for_timeout(100)
    ok(pg.locator('.tendina-menu').count() == 0, 'il menu si chiude toccando fuori')
    # audio: Whisper e revisore simulati
    pg.evaluate('''() => { window._chiamate = []; window.fetch = async (u, o) => {
      if (String(u).includes('/audio/transcriptions')) { const m = o.body.get('model'); _chiamate.push(m);
        const segs = m === 'whisper-large-v3-turbo' ? [{ start: 0, end: 5, text: 'Oggi parliamo di in talpa di reazione.', avg_logprob: -0.9 }, { start: 5, end: 9, text: 'La legge di Hess dice che conta solo lo stato iniziale e finale.', avg_logprob: -0.2 }]
          : [{ start: 0, end: 5, text: 'Oggi parliamo di entalpia di reazione.' }, { start: 5, end: 9, text: 'La legge di Hess dice che conta solo lo stato iniziale e finale.' }];
        return new Response(JSON.stringify({ segments: segs, duration: 9 }), { status: 200 }); }
      const b = JSON.parse(o.body), u2 = b.messages[1].content; _chiamate.push('chat');
      const c = u2.includes('Segmenti numerati') ? { dubbi: [{ i: 0, motivo: 'in talpa non ha senso' }], termini: ['entalpia', 'legge di Hess'] } : { correzioni: [{ i: 0, testo: 'Oggi parliamo di entalpia di reazione.', nota: 'in talpa → entalpia' }] };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(c) } }] }), { status: 200 }); }; }''')
    pg.click('.appunto-barra button[aria-label="Lezione audio"]'); pg.wait_for_selector('.dialogo, .foglio, [role=dialog]')
    with pg.expect_file_chooser() as fc:
        pg.click('text=Carica un file audio')
    fc.value.set_files('/tmp/finto.m4a')
    pg.wait_for_selector('text=Trascrizione pronta', timeout=15000)
    ok('in talpa' in pg.inner_text('.audio-prima') and 'entalpia' in pg.inner_text('.audio-dopo'), 'correzione mostrata con prima/dopo')
    ok(pg.evaluate("_chiamate") == ['whisper-large-v3-turbo', 'chat', 'whisper-large-v3', 'chat'], 'tre passaggi: trascrive, controlla, riascolta e corregge: %s' % pg.evaluate("_chiamate"))
    pg.screenshot(path='test/audio.png')
    pg.click('.foglio button:has-text("Aggiungi")'); pg.wait_for_timeout(200)
    t = pg.input_value('.appunto-testo')
    ok('## 🎙 finto' in t and '[0:00] Oggi parliamo di entalpia di reazione.' in t, 'trascrizione corretta aggiunta con il minuto')
    # calcolo a mano: «=» disegnato dopo l'espressione
    pg.click('.appunto-modo button:has-text("A mano")'); pg.wait_for_selector('.mano-vivo'); pg.wait_for_timeout(200)
    pg.evaluate('''() => { Spiega.vede = async () => '12*3,5'; }''')
    tr = '''(pts) => { const c = document.querySelector('.mano-vivo'), r = c.getBoundingClientRect();
      const e = (n, x, y) => c.dispatchEvent(new PointerEvent(n, { pointerId: 3, pointerType: 'pen', pressure: .5, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true }));
      e('pointerdown', pts[0][0], pts[0][1]); pts.slice(1).forEach(q => e('pointermove', q[0], q[1])); const l = pts[pts.length - 1]; e('pointerup', l[0], l[1]); }'''
    pg.evaluate("PREF_MANO.stab = 0")
    pg.evaluate(tr, [[40 + i * 6, 100 + (i % 4) * 8] for i in range(20)])
    pg.evaluate(tr, [[200 + i * 4, 100] for i in range(8)])
    pg.evaluate(tr, [[200 + i * 4, 112] for i in range(8)])
    pg.wait_for_selector('text=Ho letto così', timeout=5000)
    ok(pg.inner_text('.calcolo-esito') == '= 42', 'a mano: legge l\'espressione, l\'app calcola 42')
    pg.click('.foglio button:has-text("Scrivi")'); pg.wait_for_timeout(200)
    pg.screenshot(path='test/calcolo-mano.png')
    pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_timeout(300)
    a = pg.evaluate("Appunti.tutti().find(a => a.titolo === 'Termochimica')")
    ok(any(i.get('r') == 1 for i in a['mano'].get('im', [])), 'risultato scritto accanto all\'uguale')
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
