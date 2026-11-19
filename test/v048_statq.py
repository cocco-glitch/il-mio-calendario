# Test v0.48: statistiche per domanda (StatQ) come contatore per dispositivo (BP1 §5.1) + annulla della risposta.
import os, http.server, threading, functools
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

with sync_playwright() as p:
    pg = p.chromium.launch().new_page(bypass_csp=True, viewport={'width': 390, 'height': 844}); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.add_init_script("try { localStorage.setItem('imc-quiz-modo','esame') } catch (e) {}")   # v0.54: quiz senza passo di certezza (default neuro)
    pg.goto(URL); pg.wait_for_selector('.tabbar')

    # --- S2: base 3 (2 giuste), poi offline A +2, B +3, C +1 annullata → 8, non 6 ---
    r = pg.evaluate("""() => {
      const base = { id: 'sq-x', type: 'statq', sk: 's', ultima: '2026-11-01', esito: true, n: 3, ok: 2, updatedAt: 100, c: { A: { n: 3, ok: 2, xn: 0, xok: 0 } } };
      const cp = (o) => JSON.parse(JSON.stringify(o));
      const a = cp(base); a.c.A.n += 2; a.c.A.ok += 1; a.updatedAt = 200; a.ultima = '2026-11-02'; StatQC.ricalcola(a);
      const b = cp(base); b.c.B = { n: 3, ok: 3, xn: 0, xok: 0 }; b.updatedAt = 300; b.ultima = '2026-11-03'; StatQC.ricalcola(b);
      const c = cp(base); c.c.C = { n: 1, ok: 1, xn: 1, xok: 1 }; c.updatedAt = 150; StatQC.ricalcola(c);
      const U = StatQC.unisci, eq = StatQC.uguali;
      const ordini = [U(U(a, b), c), U(U(c, b), a), U(a, U(b, c)), U(U(b, a), c), U(c, U(a, b))];
      return { n: ordini[0].n, ok: ordini[0].ok, ultima: ordini[0].ultima, upd: ordini[0].updatedAt,
        comm: eq(U(a, b), U(b, a)), assoc: ordini.every(o => eq(o, ordini[0])), idem: eq(U(ordini[0], ordini[0]), ordini[0]) && eq(U(ordini[0], a), ordini[0]) }; }""")
    ok(r['n'] == 8 and r['ok'] == 6, 'S2: 3 + 2 + 3 (+1 annullata) = 8 risposte, 6 giuste (n=%s ok=%s)' % (r['n'], r['ok']))
    ok(r['comm'] and r['assoc'] and r['idem'], 'unione commutativa %s, associativa %s, idempotente %s' % (r['comm'], r['assoc'], r['idem']))
    ok(r['ultima'] == '2026-11-03' and r['upd'] == 300, 'campi descrittivi dal più recente')

    # --- Stato.unisci: somma per dispositivo, nessun cambio fittizio se riunito; 0.44 senza `c` → come prima ---
    r = pg.evaluate("""() => {
      Stato.unisci([{ id: 'sq-y', type: 'statq', sk: 's', ultima: '', esito: false, n: 2, ok: 1, updatedAt: 10, c: { A: { n: 2, ok: 1, xn: 0, xok: 0 } } }]);
      const est = { id: 'sq-y', type: 'statq', sk: 's', ultima: '', esito: true, n: 4, ok: 4, updatedAt: 20, c: { B: { n: 4, ok: 4, xn: 0, xok: 0 } } };
      const k1 = Stato.unisci([est]), dopo = Stato.prendi('sq-y'), k2 = Stato.unisci([est]);
      const vecchio = { id: 'sq-y', type: 'statq', sk: 's', ultima: '', esito: false, n: 9, ok: 1, updatedAt: 30 };
      const k3 = Stato.unisci([vecchio]), v = Stato.prendi('sq-y');
      const m = JSON.parse(JSON.stringify(v)); StatQC.mio(m, 'D').n++; StatQC.ricalcola(m);
      return { k1, n: dopo.n, ok: dopo.ok, k2, k3, nv: v.n, cv: v.c || null, mig: m.c, nm: m.n }; }""")
    ok(r['k1'] == 1 and r['n'] == 6 and r['ok'] == 5, 'Stato.unisci somma i dispositivi (n=%s ok=%s)' % (r['n'], r['ok']))
    ok(r['k2'] == 0, 'riunire lo stesso record non cambia nulla')
    ok(r['k3'] == 1 and r['nv'] == 9 and r['cv'] is None, 'record 0.44 senza contatori: vince il più recente, come prima')
    ok(r['mig'] == {'legacy': {'n': 9, 'ok': 1, 'xn': 0, 'xok': 0}, 'D': {'n': 1, 'ok': 0, 'xn': 0, 'xok': 0}} and r['nm'] == 10, 'migrazione: c.legacy dai vecchi n/ok, poi si conta per dispositivo')

    # --- quiz reale: risposta → contatore del dispositivo; annulla dal tocco sull'avviso ---
    pg.evaluate("() => { const t = trovaScheda('C-3.1.1-1'); QuizApp.apri(t.pk, t.m, t.micro, t.s); }")
    pg.wait_for_selector('.qz-domanda', timeout=8000)
    pg.locator('.qz-opz-b').first.click()
    r = pg.evaluate("() => { const s = Stato.tutti('statq').find(x => x.sk === 'C-3.1.1-1'); const d = Privacy.idDispositivo(); return { n: s.n, c: s.c, d, id: s.id }; }")
    ok(r['n'] == 1 and list(r['c'].keys()) == [r['d']] and r['c'][r['d']]['n'] == 1, 'risposta nel contatore di questo dispositivo %s' % r['c'])
    av = pg.locator('#avvisi .avviso', has_text='tocca per annullare')
    ok(av.count() == 1, 'avviso «tocca per annullare»')
    av.first.click(); pg.wait_for_timeout(100)
    s = pg.evaluate("id => Stato.prendi(id)", r['id'])
    ok(s['n'] == 0 and s['c'][r['d']]['xn'] == 1 and not s.get('scelte'), 'annullata: n=0, xn=1, scelta tolta (%s)' % s['c'])
    ok(pg.locator('.qz-opz-b:not([disabled])').count() >= 2, 'la domanda si può rispondere di nuovo')
    pg.locator('.qz-opz-b').first.click()
    ok(pg.locator('#avvisi .avviso', has_text='tocca per annullare').count() == 1, 'un solo avviso di annulla alla volta')
    s = pg.evaluate("id => Stato.prendi(id)", r['id'])
    ok(s['n'] == 1 and s['c'][r['d']] ['n'] == 2, 'nuova risposta contata (n=%s)' % s['n'])

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
