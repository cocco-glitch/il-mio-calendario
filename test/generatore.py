# Test v0.19: generatore di piani — algoritmo, procedura guidata, rigenera, ripianifica.
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
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-12T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("!!Studio.pkPiano() && Studio.pkStep().length >= 3")
    # i due appelli (10/12 e 10/01) arrivano dal pacchetto del piano; Chi 2.2 con punteggi bassi, Bio 1.1 alto
    pg.evaluate("""() => {
      for (const s of Studio.schedeDi(Studio.trovaSotto('C2.2').sub).filter(s => s.tipo === 'P')) Studio.segna(s.id, { fatta: true, punteggio: 35 });
      for (const s of Studio.schedeDi(Studio.trovaSotto('B1.1').sub).filter(s => s.tipo === 'P')) Studio.segna(s.id, { fatta: true, punteggio: 95 });
    }""")
    w = pg.evaluate("[Generatore.debolezza('C2.2'), Generatore.debolezza('B1.1'), Generatore.debolezza('F1.1')]")
    ok(w[0] > .6 and w[1] < .1 and abs(w[2] - .6) < .01, 'debolezza: Chi 2.2 alta, Bio 1.1 bassa, mai fatto = 0.6 (%s)' % w)

    # --- procedura guidata con la proposta iniziale (raffinamento tra i due appelli) ---
    pg.evaluate("UI.studioVista = 'piano'; vai('studio')"); pg.wait_for_timeout(200)
    pg.click('text=✨ Genera un piano'); pg.wait_for_selector('.gen-passi')
    pg.screenshot(path='test/gen-esame.png')
    ok(pg.input_value('.visore input[type=date] >> nth=0') == '2027-01-10' and pg.input_value('.visore input[type=date] >> nth=1') == '2026-12-11', 'proposta: dal 11/12 al secondo appello 10/01')
    ok(pg.locator('.segmenti button.attivo', has_text='Raffinamento').count() == 1, 'proposta: modo raffinamento')
    pg.click('.gen-piede button:has-text("Avanti")'); pg.wait_for_selector('.gen-arg')
    n_arg = pg.locator('.gen-arg input:checked').count()
    ok(n_arg == pg.evaluate("Generatore.catalogo().length") and n_arg >= 20, 'argomenti: tutti selezionati (%d)' % n_arg)
    pg.screenshot(path='test/gen-argomenti.png', full_page=True)
    pg.click('.gen-piede button:has-text("Avanti")'); pg.wait_for_selector('.gen-resa')
    ok('= 3 argomenti al giorno' in pg.inner_text('.gen-resa'), 'tempo: 6 h / 100 min = 3 al giorno')
    pg.click('.gen-piede button:has-text("Avanti")'); pg.click('.gen-piede button:has-text("Avanti")'); pg.wait_for_selector('.gen-anteprima')
    pg.screenshot(path='test/gen-anteprima.png', full_page=True)
    r = pg.evaluate("Generatore.genera(Object.assign({}, %s))" % json.dumps({'titolo': 'x', 'esame': '2027-01-10', 'inizio': '2026-12-11', 'modo': 'raffinamento', 'argomenti': [], 'deboliPrima': True, 'giorniSett': [0,1,2,3,4,5,6], 'ore': 6, 'minArg': 100, 'riservaOgni': 7, 'simulazioni': 3, 'finale': 2, 'riposo': True, 'secondoGiro': True}))
    ok(r['piano']['giorni'][-1]['voci'][0]['k'] == 'RIPOSO' and r['piano']['giorni'][-1]['data'] == '2027-01-09', 'vigilia di riposo 09/01')
    pg.click('text=✓ Crea il piano'); pg.wait_for_timeout(300)
    pid = pg.evaluate("Studio.pkPiani().find(p => /^gen-/.test(p.id)).id")
    piano = pg.evaluate("Studio.pkPiani().find(p => p.id === '%s')" % pid)
    ks = [v['k'] for g in piano['giorni'] for v in g['voci']]
    ok(len(Studio_cat := [k for k in ks if not any(k.startswith(x) for x in ('SIM', 'REV', 'RISERVA', 'FINALE', 'RIPOSO', 'G2-'))]) == n_arg, 'ogni argomento compare una volta (%d)' % len(Studio_cat))
    ok(sum(1 for k in ks if k.startswith('SIM-')) == 3 and sum(1 for k in ks if k.startswith('REV-')) == 3, '3 simulazioni + 3 revisioni')
    ok(any(k.startswith('RISERVA') for k in ks), 'giorni di riserva presenti')
    prima = [v['k'] for g in piano['giorni'] for v in g['voci'] if v['k'].startswith('C')]
    ok(prima[0] == 'C2.2', 'Chimica: il più debole (Chi 2.2) per primo')
    giorno1 = [v['k'][0] for v in piano['giorni'][0]['voci']]
    ok(len(giorno1) >= 2 and len(set(giorno1)) == len(giorno1), 'primo giorno: materie diverse (%s)' % giorno1)
    ultimo1 = max(g['data'] for g in piano['giorni'] for v in g['voci'] if not v.get('speciale'))
    ok('2026-12-19' <= ultimo1 <= '2027-01-02', 'primo giro distribuito sulle prime settimane (ultimo %s)' % ultimo1)
    g2 = [v['k'] for g in piano['giorni'] for v in g['voci'] if v['k'].startswith('G2-')]
    ok(g2 == ['G2-C2.2'], 'secondo giro solo per i deboli misurati (%s)' % g2)
    d1 = next(g['data'] for g in piano['giorni'] for v in g['voci'] if v['k'] == 'C2.2')
    d2 = next((g['data'] for g in piano['giorni'] for v in g['voci'] if v['k'] == 'G2-C2.2'), None)
    import datetime as dt
    ok(d2 and (dt.date.fromisoformat(d2) - dt.date.fromisoformat(d1)).days >= 7, 'secondo giro di Chi 2.2 dopo ≥7 giorni (%s → %s)' % (d1, d2))
    ok(all(len([v for v in g['voci'] if not v.get('speciale')]) <= 3 for g in piano['giorni']), 'massimo 3 argomenti al giorno')
    ok(pg.evaluate("Studio.pkPiano().id") == 'piano', 'il piano principale resta quello di prima')
    ok(pg.locator('.chip.attivo', has_text='Raffinamento verso Secondo appello').count() == 1, 'il nuovo piano è selezionato nella vista Piano')

    # --- in Oggi l'11/12 ---
    pg.clock.set_fixed_time('2026-12-11T09:00:00+01:00'); pg.evaluate("vai('oggi')"); pg.wait_for_timeout(200)
    ok('Chi 2.2' in pg.inner_text('body'), 'Oggi 11/12: compare Chi 2.2 dal piano generato')

    # --- ritardi e ripianifica per il piano generato ---
    pg.clock.set_fixed_time('2026-12-14T09:00:00+01:00')
    rit = pg.evaluate("Ripianifica.inRitardo(ymd(new Date()), Studio.pkPiani().find(p => p.id === '%s')).length" % pid)
    ok(rit >= 6, 'ritardi del piano generato: %d' % rit)
    prop = pg.evaluate("Ripianifica.proponi('leggeri', ymd(new Date()), Studio.pkPiani().find(p => p.id === '%s'))" % pid)
    ok(all(x['a'] and x['a'] > '2026-12-14' for x in prop[:3]), 'proposta di ripianifica con nuove date')
    pg.evaluate("UI.studioVista = 'piano'; UI.studioPiano = '%s'; vai('studio')" % pid); pg.wait_for_timeout(200)
    ok(pg.locator('button', has_text='Ripianifica i ritardi di questo piano').count() == 1, 'pulsante ripianifica per il piano generato')

    # --- rigenera: i giorni passati restano, gli step già fatti escono ---
    pg.click('text=↻ Rigenera con i dati di oggi'); pg.wait_for_selector('.gen-passi')
    ok(pg.input_value('.visore input[type=date] >> nth=1') == '2026-12-14', 'rigenera: riparte da oggi')
    for _ in range(4): pg.click('.gen-piede button:has-text("Avanti")')
    pg.click('text=✓ Sostituisci il piano'); pg.wait_for_timeout(300)
    p2 = pg.evaluate("Studio.pkPiani().filter(p => /^gen-/.test(p.id))")
    ok(len(p2) == 1 and p2[0]['id'] == pid, 'rigenera: stesso piano, nessun doppione')
    ok(p2[0]['giorni'][0]['data'] == '2026-12-11', 'rigenera: i giorni passati restano')

    # --- argomenti incollati ---
    r = pg.evaluate("Generatore.genera(Object.assign({}, %s))" % json.dumps({'titolo': 'Storia', 'esame': '2026-12-20', 'inizio': '2026-12-15', 'modo': 'teoria', 'argomenti': ['TXT-1', 'TXT-2'], 'testi': {'TXT-1': 'Rinascimento', 'TXT-2': 'Riforma'}, 'deboliPrima': False, 'giorniSett': [1,2,3,4,5], 'ore': 2, 'minArg': 120, 'riservaOgni': 0, 'simulazioni': 0, 'finale': 0, 'riposo': False, 'secondoGiro': False}))
    ok([v['t'] for g in r['piano']['giorni'] for v in g['voci']] == ['Rinascimento', 'Riforma'] and r['piano']['giorni'][1]['data'] == '2026-12-16', 'elenco incollato, solo giorni feriali')
    r = pg.evaluate("Generatore.genera(Object.assign({}, %s))" % json.dumps({'titolo': 'x', 'esame': '2026-12-17', 'inizio': '2026-12-15', 'modo': 'teoria', 'argomenti': ['C1.1','C1.2','B1.1','B1.2','F1.1'], 'deboliPrima': False, 'giorniSett': [0,1,2,3,4,5,6], 'ore': 2, 'minArg': 120, 'riservaOgni': 0, 'simulazioni': 0, 'finale': 0, 'riposo': False, 'secondoGiro': False}))
    ok(len(r['fuori']) == 3 and 'non entrano' in r['avvisi'][0], 'avviso quando gli argomenti non entrano')

    # --- elimina ---
    pg.click('text=🗑 Elimina'); pg.click('.dialogo button:has-text("Elimina il piano")'); pg.wait_for_timeout(200)
    ok(not pg.evaluate("Studio.pkPiani().some(p => /^gen-/.test(p.id))"), 'piano generato eliminato')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
