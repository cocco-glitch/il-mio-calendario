# Test: corsi propri (materie qualsiasi), errori, timer, statistiche, esami, trascinamento.
import os, sys, http.server, threading, functools
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
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome', color_scheme='dark', has_touch=True)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-12T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("Studio.pkStep().length >= 3")
    # --- corso proprio
    pg.click('.tabbar >> text=Studio'); pg.click('.chip >> text=+ Nuovo corso')
    pg.wait_for_timeout(150); pg.fill('.foglio .titolo-grande', 'Inglese B2')
    pg.fill('.foglio input[placeholder^="+ Materia"]', 'Grammatica'); pg.press('.foglio input[placeholder^="+ Materia"]', 'Enter')
    pg.fill('.foglio input[placeholder^="+ Materia"]', 'Ascolto'); pg.press('.foglio input[placeholder^="+ Materia"]', 'Enter')
    pg.click('.foglio-testa >> text=Salva'); pg.wait_for_selector('.foglio', state='detached')
    pk = pg.evaluate("Studio.pkStep().find(p => p.proprio)")
    ok(pk and pk['titolo'] == 'Inglese B2' and [m['nome'] for m in pk['materie']] == ['Grammatica', 'Ascolto'], 'corso proprio con 2 materie nuove: %s' % (pk and [(m['m'], m['nome']) for m in pk['materie']]))
    codice = pk['materie'][0]['m']
    pg.click('text=+ Aggiungi argomento'); pg.fill('.foglio .titolo-grande', 'Condizionali'); pg.fill('.foglio input[type=date]', '2026-11-14'); pg.click('.foglio-testa >> text=Salva')
    pg.wait_for_selector('.blocchi'); pg.click('text=+ Aggiungi scheda'); pg.fill('.foglio .titolo-grande', 'Esercizi condizionali'); pg.fill('.foglio input[placeholder^="es. 12"]', '40-45'); pg.click('.foglio-testa >> text=Salva')
    pg.wait_for_selector('.voce-lista.task'); pg.screenshot(path='test/40-corso.png', full_page=True)
    k = codice + '1.1'
    ok(pg.evaluate("Studio.trovaSotto('%s') && Studio.numeri(Studio.schedeDi(Studio.trovaSotto('%s').sub)).pagP.size" % (k, k)) == 6, 'argomento con scheda e 6 pagine')
    v = pg.evaluate("Studio.vociDelGiorno(daYmd('2026-11-14')).map(x => Studio.etichetta(x.v.k))")
    ok(any(x.startswith('Gra 1.1') for x in v), 'argomento del corso nel calendario del 14/11: %s' % v)
    ok(pg.evaluate("coloreMateria('%s') !== coloreMateria('C')" % codice), 'colore proprio per la nuova materia')
    # --- errori
    sid = pg.evaluate("Studio.schedeDi(Studio.trovaSotto('%s').sub)[0].id" % k)
    pg.evaluate("Studio.segna('%s', { fatta: true, punteggio: 55 }); Studio.segna('C-2.2.1-1', { fatta: true, punteggio: 90 }); Studio.segna('B-2.2.2-1', { fatta: true, daRifare: true })" % sid)
    ok(pg.evaluate("tutteLeSchede().filter(x => daRifare(x.s.id)).length") == 2, 'registro errori: punteggio < 70% e segnate a mano')
    pg.evaluate('UI.studioSub = null; disegna()'); pg.click('.segmenti >> text=Errori'); pg.wait_for_selector('.card-titolo'); pg.screenshot(path='test/41-errori.png')
    pg.evaluate("Studio.segna('%s', { punteggio: 85 })" % sid)
    ok(pg.evaluate("tutteLeSchede().filter(x => daRifare(x.s.id)).length") == 1, 'rifatta con 85%: esce dal registro')
    # --- timer
    pg.evaluate("Timer.avvia({ m: 'C', k: 'C2.3', titolo: 'Chi 2.3' })"); pg.wait_for_selector('#timer-barra')
    ok('📚 25:00' in pg.inner_text('#timer-barra') or '📚 24:5' in pg.inner_text('#timer-barra'), 'barra del timer: ' + pg.inner_text('#timer-barra'))
    pg.clock.run_for(25 * 60 * 1000 + 2000); pg.wait_for_timeout(200)
    ok(pg.evaluate("Stato.tutti('sessione').reduce((t, s) => t + s.minuti, 0)") == 25 and 'Pausa' in pg.inner_text('#timer-barra'), 'sessione di 25 min registrata, poi pausa')
    pg.clock.run_for(5 * 60 * 1000 + 2000); pg.wait_for_timeout(200)
    ok(pg.locator('#timer-barra').count() == 0, 'fine pausa: timer chiuso')
    pg.evaluate("Timer.avvia({ m: 'B', titolo: 'Bio' })"); pg.clock.run_for(10 * 60 * 1000); pg.evaluate("Timer.ferma()")
    ok(pg.evaluate("Stato.tutti('sessione').filter(s => s.m === 'B')[0].minuti") == 10, 'fermato a 10 minuti: registrati 10')
    # --- statistiche
    pg.click('.tabbar >> text=Studio'); pg.click('.segmenti >> text=Statistiche'); pg.wait_for_selector('.grafico')
    ok('35 min' in pg.inner_text('.pagina'), 'statistiche: 35 min di studio')
    pg.screenshot(path='test/42-statistiche.png', full_page=True)
    # --- esami
    pg.click('.segmenti >> text=Esami'); pg.click('text=+ Aggiungi esame'); pg.fill('.foglio .titolo-grande', 'Primo appello'); pg.fill('.foglio input[type=date]', '2026-12-10'); pg.click('.foglio-testa >> text=Salva')
    pg.click('.tabbar >> text=Oggi'); txt = pg.inner_text('.pagina')
    ok('PROSSIMI ESAMI' in txt.upper() and '28' in txt and 'Primo appello' in txt, 'Oggi: conto alla rovescia 28 giorni')
    ok(any('Primo appello' in x for x in pg.evaluate("Studio.vociDelGiorno(daYmd('2026-12-10')).map(x => x.v.t)")), 'esame nel calendario')
    pg.screenshot(path='test/43-oggi.png', full_page=True)
    # --- trascinamento (mouse) nella vista Giorno
    pg.evaluate("Stato.salva({id:'drag1',type:'evento',updatedAt:0,titolo:'Da spostare',inizio:'2026-11-12T10:00',fine:'2026-11-12T11:00',tuttoIlGiorno:false})")
    pg.evaluate("vai('cal', 'giorno', daYmd('2026-11-12'))"); pg.wait_for_selector('.gr-ev')
    ev = pg.locator('.gr-ev', has_text='Da spostare'); bb = ev.bounding_box()
    pg.mouse.move(bb['x'] + 20, bb['y'] + 10); pg.mouse.down(); pg.mouse.move(bb['x'] + 20, bb['y'] + 10 + 52 * 1.5, steps=6); pg.mouse.up(); pg.wait_for_timeout(200)
    ok(pg.evaluate("[Stato.prendi('drag1').inizio, Stato.prendi('drag1').fine]") == ['2026-11-12T11:30', '2026-11-12T12:30'], 'trascinato di 1h30: %s' % pg.evaluate("[Stato.prendi('drag1').inizio, Stato.prendi('drag1').fine]"))
    ok(pg.locator('.foglio').count() == 0, 'dopo il trascinamento non si apre l\'editor')
    ev = pg.locator('.gr-ev', has_text='Da spostare'); bb = ev.bounding_box()
    pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] - 3); pg.mouse.down(); pg.mouse.move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] - 3 + 26, steps=4); pg.mouse.up(); pg.wait_for_timeout(200)
    ok(pg.evaluate("Stato.prendi('drag1').fine") == '2026-11-12T13:00', 'ridimensionato: fine alle 13:00 (%s)' % pg.evaluate("Stato.prendi('drag1').fine"))
    ev = pg.locator('.gr-ev', has_text='Da spostare'); ev.click(); ok(pg.locator('.foglio').count() == 1, 'un tocco semplice apre ancora l\'editor')
    b.close()
print('ERRORI:' if err else 'TUTTO OK', *err, sep='\n'); sys.exit(1 if err else 0)
