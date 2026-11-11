# Test F2 (v0.8): ripassi con FSRS, riquadro "Ripassi di oggi", tetto giornaliero, correzioni.
import os, http.server, threading, functools, json, math
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

# Riferimento indipendente FSRS-5 (stesse formule pubbliche) per controllare il TypeScript.
W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621]
F = 19 / 81
cl = lambda x, a, b: min(b, max(a, x))
R = lambda t, s: (1 + F * t / s) ** -0.5
d0 = lambda g: cl(W[4] - math.exp(W[5] * (g - 1)) + 1, 1, 10)
def passo(st, g, t):
    if st is None: return (d0(g), W[g - 1])
    d, s = st
    if t <= 0: s2 = s * math.exp(W[17] * (g - 3 + W[18]))
    else:
        r = R(t, s)
        if g == 1: s2 = min(s, W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * math.exp(W[14] * (1 - r)))
        else: s2 = s * (math.exp(W[8]) * (11 - d) * s ** -W[9] * (math.exp(W[10] * (1 - r)) - 1) * (W[15] if g == 2 else 1) * (W[16] if g == 4 else 1) + 1)
    dd = d - W[6] * (g - 3) * (10 - d) / 9
    return (cl(W[7] * d0(4) + (1 - W[7]) * dd, 1, 10), cl(s2, 0.1, 36500))

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-11T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("Studio.pkStep().length >= 3")

    # 1) Motore: sequenze di voti confrontate con il riferimento
    for seq in [[(3, 0), (3, 3), (3, 8)], [(4, 0), (1, 16), (3, 2)], [(2, 0), (2, 1), (4, 4), (3, 12)], [(1, 0), (3, 1), (3, 0)]]:
        st = None; js = 'null'
        for g, t in seq:
            st = passo(st, g, t)
            js = pg.evaluate("((st, g, t) => Ripassi.passo(st, g, t))(%s, %d, %d)" % (js, g, t)); js = json.dumps(js)
        got = json.loads(js)
        ok(abs(got['d'] - st[0]) < 1e-9 and abs(got['s'] - st[1]) < 1e-9, 'FSRS %s → D %.3f S %.3f' % (seq, st[0], st[1]))
    ok(pg.evaluate("Ripassi.intervallo(3.173, 0.9)") == 3 and pg.evaluate("Ripassi.intervallo(15.69105, 0.9)") == 16, 'intervalli: Bene → 3 g, Facile → 16 g')
    ok(pg.evaluate("Ripassi.intervallo(10, 0.95)") < pg.evaluate("Ripassi.intervallo(10, 0.9)"), 'ritenzione più alta → intervallo più corto')
    ok([pg.evaluate("Ripassi.voto(%s)" % v) for v in ['undefined', 40, 60, 80, 95]] == [3, 1, 2, 3, 4], 'voto dal punteggio')

    P = lambda k: pg.evaluate("Studio.schedeDi(Studio.trovaSotto('%s').sub).filter(x => x.tipo === 'P').map(x => x.id)" % k)
    def fatte(k, punti, data='2026-11-11'):
        ids = P(k)
        for i, sid in enumerate(ids):
            v = punti[i] if isinstance(punti, list) else punti
            pg.evaluate("Studio.segna('%s', { fatta: true, data: '%s'%s })" % (sid, data, '' if v is None else ', punteggio: %d' % v))
        return ids

    # 2) Sotto-step completato in blocco l'11/11: data dal piano (C2.1 → 02/11), voto medio
    ids = fatte('C2.1', [80] * 11 + [60])
    ok(pg.evaluate("Ripassi.dataApprendimento('C2.1')") == '2026-11-02', 'data di apprendimento dal piano: 02/11')
    m = pg.evaluate("Ripassi.mem('C2.1')")
    ok(m and m['ultimo'] == '2026-11-02' and m['due'] == '2026-11-05', 'C2.1: prossimo ripasso %s' % (m and m['due']))
    fatte('F2.1', 95)
    ok(pg.evaluate("Ripassi.mem('F2.1').due") == '2026-11-20', 'F2.1 tutto ≥90%: torna il 20/11')
    # Sotto-step parziale: niente ripasso
    pg.evaluate("Studio.segna(Studio.schedeDi(Studio.trovaSotto('B2.2').sub)[0].id, { fatta: true })")
    ok(not pg.evaluate("Ripassi.mem('B2.2')"), 'sotto-step non completo: non entra nei ripassi')
    # Piano futuro ma fatto prima (C2.3 previsto 12/11, fatto 11/11) → 11/11
    fatte('C2.3', 85)
    ok(pg.evaluate("Ripassi.mem('C2.3').ultimo") == '2026-11-11', 'fatto prima del piano: vale la data vera')
    oggi = pg.evaluate("Ripassi.delGiorno('2026-11-11').oggi.map(x => x.k)")
    ok(oggi == ['C2.1'], 'ripassi di oggi: %s' % oggi)

    # 3) Proposta: la scheda più debole; poi rotazione
    prop = pg.evaluate("Ripassi.schedaDaProporre('C2.1').id")
    ok(prop == ids[-1], 'proposta la scheda più debole (60%%): %s' % prop)

    # 4) Riquadro in Oggi, in cima
    pg.evaluate("vai('oggi')"); pg.wait_for_timeout(300)
    titoli = pg.eval_on_selector_all('.card-titolo', 'els => els.map(e => e.textContent)')
    ok(titoli and titoli[0] == 'Ripassi di oggi', 'riquadro ripassi in cima a Oggi (dopo «Studia ora»): %s' % titoli[:3])
    t0 = pg.locator('.card', has_text='Ripassi di oggi').inner_text()
    ok('Chi 2.1' in t0 and 'Rifai:' in t0, 'riga: sotto-step e scheda da rifare')
    pg.screenshot(path='test/f2-oggi.png', full_page=True)

    # 5) Apro il ripasso: data di oggi, punteggio vuoto; chiudere senza punteggio non conta
    pg.locator('.card', has_text='Ripassi di oggi').locator('.voce-lista').first.click(); pg.wait_for_selector('.foglio')
    ok('Ripasso' in pg.inner_text('.foglio'), 'foglio in modalità ripasso')
    vals = pg.eval_on_selector_all('.foglio input[type=date], .foglio input[type=number]', 'els => els.map(e => e.value)')
    ok(vals == ['2026-11-11', ''], 'data di oggi e punteggio vuoto: %s' % vals)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    if pg.locator('.foglio').count(): pg.evaluate("document.querySelector('.foglio-sfondo').click()"); pg.wait_for_timeout(200)
    ok(pg.evaluate("Ripassi.mem('C2.1').n") == 1, 'aprire e chiudere senza punteggio non registra')

    # 6) Ripasso fatto, poi correzione nello stesso giorno, poi rotazione
    pg.evaluate("Studio.segna('%s', { fatta: true, data: '2026-11-11', punteggio: 85 })" % prop)
    m = pg.evaluate("Ripassi.mem('C2.1')")
    ok(m['n'] == 2 and m['ultimo'] == '2026-11-11' and m['due'] > '2026-11-11', 'ripasso registrato: prossimo %s' % m['due'])
    pg.evaluate("Studio.segna('%s', { fatta: true, data: '2026-11-11', punteggio: 40 })" % prop)
    m2 = pg.evaluate("Ripassi.mem('C2.1')")
    ok(m2['n'] == 2 and m2['log'][-1][1] == 1 and len(m2['log']) == 2, 'correzione stesso giorno: voto aggiornato, nessun ripasso in più')
    ok(m2['s'] <= m['s'] and len(m2['schede']) == 1, 'voto peggiore → stabilità non maggiore')
    ok(pg.evaluate("Ripassi.schedaDaProporre('C2.1').id") != prop, 'rotazione: la prossima volta un\'altra scheda')
    rr = pg.evaluate("Ripassi.delGiorno('2026-11-11')")
    ok(len(rr['fatti']) == 1 and len(rr['oggi']) == 0, 'ripasso di oggi fatto')

    # 7) Tetto: 30 min = 3 sotto-step; il resto in coda, prima i più a rischio
    for k in ['C2.2', 'B2.1', 'F2.2']: fatte(k, 55)
    r = pg.evaluate("(() => { const r = Ripassi.delGiorno('2026-11-25'); return { oggi: r.oggi.map(x => x.r), coda: r.coda.length, min: r.minuti }; })()")
    ok(len(r['oggi']) == 3 and r['coda'] >= 1 and r['min'] == 30, 'tetto 30 min: 3 oggi, %d in coda' % r['coda'])
    ok(r['oggi'] == sorted(r['oggi']), 'ordinati dal più a rischio')

    # 8) Dati arrivati dalla sync (senza memoria) → memoria creata
    recs = json.dumps([{'id': 'prog-' + i, 'type': 'progresso', 'updatedAt': 9e12, 'fatta': True, 'data': '2026-11-11', 'punteggio': 75} for i in P('B2.2')])
    pg.evaluate("Stato.unisci(%s)" % recs); pg.wait_for_timeout(300)
    ok(pg.evaluate("!!Ripassi.mem('B2.2')"), 'memoria creata per un sotto-step completato su un altro dispositivo')

    # 9) Esame vicino → ritenzione 0,95
    ok(pg.evaluate("Ripassi.ritenzione('2026-11-11')") == 0.9 and pg.evaluate("Ripassi.ritenzione('2026-12-01')") == 0.95, 'ritenzione 0,95 nei 14 giorni prima dell\'esame')

    # 10) Chip della memoria nella lista dei sotto-step
    pg.evaluate("UI.studioStep = Studio.pkStep()[1].id; UI.studioSub = null; vai('studio')"); pg.wait_for_selector('.chip-ricordo')
    ok(pg.locator('.chip-ricordo').count() >= 4, 'chip "ricordo %" sui sotto-step completati')
    pg.screenshot(path='test/f2-studio.png', full_page=True)

    # 11) Tetto modificabile
    pg.evaluate("(() => { const i = imp(); i.ripassoMinuti = 60; Stato.salva(i); })()")
    ok(pg.evaluate("Ripassi.quanteAlGiorno()") == 6, 'tetto 60 min → 6 ripassi')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
