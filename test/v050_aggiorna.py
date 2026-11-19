# Test v0.50 → v0.58.5: service worker, aggiornamento senza banner (puntino su Altro, automatico a freddo) + comprimiImmagine (BP1 §6, §7).
import os, sys, re, http.server, threading, functools
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

sw = open(os.path.join(QUI, '..', 'public', 'sw.js'), encoding='utf-8').read()
install = re.search(r"addEventListener\('install'.*?\n\}\);", sw, re.S).group(0)
ok('skipWaiting' not in re.sub(r'//.*', '', install), 'install senza skipWaiting')
ok("e.data === 'salta'" in sw and 'self.skipWaiting()' in sw, "skipWaiting solo sul messaggio 'salta'")
ok("e.data === 'versione?'" in sw and 'e.ports[0].postMessage(CACHE.slice(4))' in sw, 'il worker risponde con la sua versione (B1)')
ok('imc-lib' in install and "waitUntil(caches.open(CACHE).then(c => c.addAll(FILE.map(f => new Request(f, { cache: 'reload' })))))" in install
   and 'imc-lib' not in install.split('waitUntil(')[1].split(chr(10))[0], 'pdf.js fuori dal waitUntil critico; precache con cache reload (v0.57)')

FINTI = """(opz) => {
  const ev = (o) => { o.ascolta = {}; o.addEventListener = (t, f) => { (o.ascolta[t] = o.ascolta[t] || []).push(f); }; o.lancia = (t) => (o.ascolta[t] || []).forEach(f => f()); return o; };
  const posta = []; const waiting = { postMessage: (m, porte) => { posta.push(m); if (m === 'versione?' && opz.ver != null && porte) porte[0].postMessage(opz.ver); } };
  const reg = ev({ waiting: opz.waiting ? waiting : null, installing: null });
  const sw = ev({ controller: opz.controller ? {} : null });
  let ricariche = 0;
  window.__f = { reg, sw, posta, waiting, get ricariche() { return ricariche; } };
  Aggiornamento.collega(reg, sw, () => { ricariche++; });
}"""
# v0.58.5: niente banner fisso (U2), mai per la stessa versione (B1), aggiornamento automatico a freddo
banner = lambda pg: pg.locator('#avvisi .avviso', has_text='Nuova versione').count()
puntino = lambda pg: pg.locator('.tabbar .punto-agg').count()
TIMER = "() => localStorage.setItem('imc-timer', JSON.stringify({ inizio: Date.now(), durata: 25, fase: 'studio' }))"
def nuova(pg):
    pg.evaluate("() => localStorage.removeItem('imc-timer')"); pg.reload(); pg.wait_for_selector('.tabbar')
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(bypass_csp=True, viewport={'width': 390, 'height': 844})
    ctx.route('**/cdnjs.cloudflare.com/**', lambda r: r.abort())
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    VER = pg.evaluate('VERSIONE')

    # --- prima installazione: nessun controller → niente, nessuna ricarica ---
    pg.evaluate(FINTI, {'controller': False, 'waiting': True, 'ver': '9.9.9'})
    pg.evaluate("() => { __f.sw.lancia('controllerchange'); }"); pg.wait_for_timeout(300)
    ok(pg.evaluate("__f.posta") == [] and pg.evaluate("__f.ricariche") == 0, 'prima installazione: niente aggiornamento né ricarica')

    # --- avvio a freddo, app libera: si aggiorna da sola, senza banner ---
    nuova(pg)
    pg.evaluate(FINTI, {'controller': True, 'waiting': True, 'ver': '9.9.9'}); pg.wait_for_timeout(300)
    ok(pg.evaluate("__f.posta") == ['versione?', 'salta'] and banner(pg) == 0, 'freddo + app libera: salta automatico, nessun banner (%s)' % pg.evaluate("__f.posta"))
    pg.evaluate("() => { __f.sw.lancia('controllerchange'); __f.sw.lancia('controllerchange'); }")
    ok(pg.evaluate("__f.ricariche") == 1, 'controllerchange → una sola ricarica')

    # --- avvio a freddo con il timer attivo: niente ricarica, puntino su Altro + riga in Altro ---
    nuova(pg); pg.evaluate(TIMER)
    pg.evaluate(FINTI, {'controller': True, 'waiting': True, 'ver': '9.9.9'}); pg.wait_for_timeout(300)
    ok(pg.evaluate("__f.posta") == ['versione?'] and puntino(pg) == 1 and banner(pg) == 0, 'timer attivo: nessun salta, puntino su Altro, nessun banner')
    ok(pg.locator('.tabbar button[aria-label="Altro · aggiornamento pronto"]').count() == 1, 'nome accessibile del tab Altro con aggiornamento')
    pg.locator('.tabbar button[aria-label="Altro · aggiornamento pronto"]').click(); pg.wait_for_selector('.agg-pronto')
    ok(('v%s → v9.9.9' % VER) in pg.inner_text('.agg-pronto'), 'riga in Altro con le due versioni: ' + pg.inner_text('.agg-pronto')[:60])
    pg.locator('.agg-pronto button', has_text='Aggiorna').click()
    ok(pg.evaluate("__f.posta") == ['versione?', 'salta'], "Aggiorna → postMessage('salta')")

    # --- stessa versione già in esecuzione: nulla da proporre (B1) ---
    nuova(pg); pg.evaluate(TIMER)
    pg.evaluate(FINTI, {'controller': True, 'waiting': True, 'ver': VER}); pg.wait_for_timeout(300)
    ok(pg.evaluate("__f.posta") == ['versione?'] and puntino(pg) == 0, 'stessa versione: nessun puntino, nessun salta')

    # --- worker vecchio che non risponde alla domanda: si propone comunque (dopo l'attesa) ---
    nuova(pg); pg.evaluate(TIMER)
    pg.evaluate(FINTI, {'controller': True, 'waiting': True, 'ver': None}); pg.wait_for_timeout(1800)
    ok(puntino(pg) == 1, 'worker senza risposta: puntino dopo il timeout')

    # --- aggiornamento trovato mentre l'app è aperta (updatefound → installed): puntino, mai ricarica da sola ---
    nuova(pg)
    pg.evaluate(FINTI, {'controller': True, 'waiting': False, 'ver': '9.9.9'}); pg.wait_for_timeout(200)
    ok(puntino(pg) == 0, 'nessun puntino senza aggiornamenti')
    pg.evaluate("""() => { const n = { state: 'installing', ascolta: [], addEventListener(t, f) { this.ascolta.push(f); } };
      __f.reg.installing = n; __f.reg.lancia('updatefound'); n.state = 'installed'; __f.reg.waiting = __f.waiting; n.ascolta.forEach(f => f()); n.ascolta.forEach(f => f()); }""")
    pg.wait_for_timeout(300)
    ok(puntino(pg) == 1 and pg.evaluate("__f.posta") == ['versione?'] and banner(pg) == 0, 'updatefound → installed: un puntino, una sola domanda, nessun salta (%s)' % pg.evaluate("__f.posta"))
    pg.evaluate("() => localStorage.removeItem('imc-timer')")

    # --- service worker vero su 127.0.0.1: installa e prende il controllo anche con la CDN di pdf.js irraggiungibile ---
    r = pg.evaluate("""async () => { const reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready;
      for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100));
      const nomi = await caches.keys(); const c = nomi.find(n => n.startsWith('imc-') && n !== 'imc-lib' && n !== 'imc-pdf'); const app = c ? !!(await (await caches.open(c)).match('app.js')) : false;
      return { attivo: !!reg.active, ctrl: !!navigator.serviceWorker.controller, c, app }; }""")
    ok(r['attivo'] and r['ctrl'] and r['app'], 'SW installato e attivo senza pdf.js (%s)' % r)

    # --- comprimiImmagine ---
    r = pg.evaluate("""async () => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; const g = c.getContext('2d');
      for (let i = 0; i < 300; i++) { g.fillStyle = 'hsl(' + i + ',70%,50%)'; g.fillRect((i * 37) % 3000, (i * 53) % 2000, 120, 90); }
      const png = await new Promise(r => c.toBlob(r, 'image/png'));
      const out = await MediaStore.comprimiImmagine(png); const bm = await createImageBitmap(out);
      const piccolo = await MediaStore.comprimiImmagine(png, 800); const bp = await createImageBitmap(piccolo);
      return { tipo: out.type, w: bm.width, h: bm.height, prima: png.size, dopo: out.size, wp: bp.width }; }""")
    ok(r['tipo'] == 'image/webp' and r['w'] == 1600 and r['h'] == 1067, 'WebP, lato lungo 1600 (%s)' % r)
    ok(r['dopo'] < r['prima'] and r['wp'] == 800, 'più leggera dell\'originale; maxLato rispettato')
    r = pg.evaluate("""async () => { const orig = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, tipo, q) { return orig.call(this, cb, tipo === 'image/webp' ? 'image/png' : tipo, q); };
      try { const c = document.createElement('canvas'); c.width = 400; c.height = 300; c.getContext('2d').fillRect(0, 0, 50, 50);
        const png = await new Promise(r => orig.call(c, r, 'image/png')); const out = await MediaStore.comprimiImmagine(png); return out.type; }
      finally { HTMLCanvasElement.prototype.toBlob = orig; } }""")
    ok(r == 'image/jpeg', 'browser senza WebP (Safari): ripiego JPEG (%s)' % r)

    # --- limite visione 20 MB: errore chiaro, nessuna chiamata ---
    r = pg.evaluate("""async () => { let chiamate = 0; const f0 = window.fetch; window.fetch = async (...a) => { chiamate++; return f0(...a); };
      IA.impostaChiave('groq', 'gsk_prova_finta_1234567890');
      const piccolo = 'data:image/png;base64,' + 'A'.repeat(4000);
      const grande = 'data:image/png;base64,' + 'A'.repeat(Math.ceil(21 * 1048576 * 4 / 3));
      let msg = ''; try { await Spiega.vede('leggi', grande); } catch (e) { msg = String(e.message); }
      window.fetch = f0; IA.impostaChiave('groq', '');
      return { msg, chiamate, nP: MediaStore.byteDataUrl(piccolo), nG: MediaStore.byteDataUrl(grande) }; }""")
    ok(r['nP'] == 3000, 'byte dal data URL (%s)' % r['nP'])
    ok('troppo grande' in r['msg'] and '20 MB' in r['msg'] and r['chiamate'] == 0, 'immagine > 20 MB: errore chiaro, nessun invio (%s, %d chiamate)' % (r['msg'][:60], r['chiamate']))
    b.close()
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)), *err, sep='\n'); sys.exit(1 if err else 0)
