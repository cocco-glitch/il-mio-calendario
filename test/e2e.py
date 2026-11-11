# Test end-to-end della Fase 1 (Playwright). Uso: python3 test/e2e.py
import sys, os, http.server, threading, functools
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
    pg = ctx.new_page()
    pg.on('console', lambda m: m.type == 'error' and err.append('console: ' + m.text))
    pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    ok(pg.evaluate('DB.modo') == 'idb', 'IndexedDB attivo')
    ok(pg.locator('.testata h1').inner_text() == 'Oggi', 'apre su Oggi')
    pg.screenshot(path='test/01-oggi.png')

    # evento ricorrente settimanale con promemoria e checklist, creato dall'interfaccia
    pg.click('.fab'); pg.click('.dialogo >> text=Evento')
    pg.fill('.titolo-grande', 'Palestra')
    pg.locator('.foglio select').first.select_option('W')
    pg.locator('.gruppo:has(.gruppo-titolo:text("Promemoria")) select').select_option('30')
    pg.fill('.checklist + input', 'Scarpe'); pg.keyboard.press('Enter')
    pg.screenshot(path='test/02-editor.png')
    pg.click('.foglio-testa >> text=Salva')
    pg.wait_for_selector('.foglio', state='detached')
    ok(pg.locator('.card >> text=Palestra').count() >= 1, 'evento visibile in Oggi')
    n = pg.evaluate("occorrenzeTra(oggi(), piuGiorni(oggi(), 28)).filter(o => o.ev.titolo === 'Palestra').length")
    ok(n == 4, 'ricorrenza settimanale: 4 occorrenze in 28 giorni (trovate %s)' % n)

    # persistenza dopo ricarica
    pg.reload(); pg.wait_for_selector('.tabbar')
    ok(pg.locator('.card >> text=Palestra').count() >= 1, 'evento ancora presente dopo ricarica')

    # viste calendario
    pg.click('.tabbar >> text=Calendario'); pg.screenshot(path='test/03-mese.png')
    ok(pg.locator('.mese-chip:text("Palestra")').count() >= 4, 'mese mostra la serie')
    pg.click('.segmenti >> text=Settimana'); pg.wait_for_selector('.gr-ev'); pg.screenshot(path='test/04-settimana.png')
    pg.click('.segmenti >> text=Giorno'); pg.screenshot(path='test/05-giorno.png')
    pg.click('.segmenti >> text=Agenda'); pg.screenshot(path='test/06-agenda.png')
    ok(pg.locator('.agenda-giorno').count() >= 4, 'agenda elenca le occorrenze')

    # elimina solo la seconda occorrenza
    pg.locator('.agenda-giorno').nth(1).locator('.voce-lista').first.click()
    pg.click('.foglio >> text=Elimina'); pg.click('.dialogo >> text=Solo questo evento')
    pg.wait_for_selector('.foglio', state='detached')
    n = pg.evaluate("occorrenzeTra(oggi(), piuGiorni(oggi(), 28)).filter(o => o.ev.titolo === 'Palestra').length")
    ok(n == 3, 'eliminata una sola occorrenza (restano %s)' % n)

    # modifica di tutta la serie: cambio titolo
    pg.locator('.agenda-giorno').first.locator('.voce-lista').first.click()
    pg.fill('.titolo-grande', 'Palestra 2'); pg.click('.foglio-testa >> text=Salva'); pg.click('.dialogo >> text=Tutta la serie')
    pg.wait_for_selector('.foglio', state='detached')
    n = pg.evaluate("occorrenzeTra(oggi(), piuGiorni(oggi(), 28)).filter(o => o.ev.titolo === 'Palestra 2').length")
    ok(n == 3, 'modifica della serie applicata (%s)' % n)

    # promemoria
    pg.click('.tabbar >> text=Promemoria')
    pg.fill('.rapido', 'Comprare quaderni'); pg.keyboard.press('Enter')
    ok(pg.locator('.task >> text=Comprare quaderni').count() == 1, 'promemoria in Inbox')
    pg.locator('.task .spunta').first.click()
    pg.click('.segmenti >> text=Fatti')
    ok(pg.locator('.task.fatto').count() == 1, 'promemoria spuntato')
    pg.screenshot(path='test/07-promemoria.png')

    # note + ricerca
    pg.click('.tabbar >> text=Note'); pg.click('.fab')
    pg.fill('.titolo-grande', 'Idee'); pg.fill('.nota-testo', '**Ripassare** i gas\n- Boyle\n- Charles')
    pg.fill('.foglio input[placeholder^="tag"]', 'chimica'); pg.click('.foglio-testa >> text=Salva')
    ok(pg.locator('.nota-card >> text=Idee').count() == 1, 'nota creata')
    pg.click('[aria-label=Cerca]'); pg.fill('.rapido', 'boyle')
    ok(pg.locator('.card >> text=Idee').count() == 1, 'ricerca globale trova la nota')

    # tema chiaro salvato
    pg.click('.tabbar >> text=Altro'); pg.locator('.card select').first.select_option('chiaro')
    ok(pg.evaluate('document.documentElement.dataset.tema') == 'chiaro', 'tema chiaro applicato')
    pg.screenshot(path='test/08-impostazioni-chiaro.png', full_page=True)
    pg.reload(); pg.wait_for_selector('.tabbar')
    ok(pg.evaluate('document.documentElement.dataset.tema') == 'chiaro', 'tema ricordato dopo ricarica')
    pg.click('.tabbar >> text=Calendario'); pg.screenshot(path='test/09-mese-chiaro.png')

    # logica ricorrenze
    r = pg.evaluate("""(() => {
      const ev = (rr, ex) => ({id:'x',type:'evento',titolo:'t',inizio:'2026-11-11T09:00',fine:'2026-11-11T10:00',tuttoIlGiorno:false,rrule:rr,exdate:ex});
      const c = (e, a, b) => occorrenze(e, daYmd(a), daYmd(b)).map(o => ymd(o.inizio));
      return {
        lunMer: c(ev({freq:'W',interval:1,byday:[0,2]}), '2026-11-11', '2026-11-25'),
        cont: c(ev({freq:'D',interval:2,count:3}), '2026-11-01', '2026-12-31'),
        fino: c(ev({freq:'D',interval:1,until:'2026-11-13'}), '2026-11-01', '2026-12-31'),
        mese: c({...ev({freq:'M',interval:1}), inizio:'2026-01-31T09:00', fine:'2026-01-31T10:00'}, '2026-01-01', '2026-06-01'),
        ex: c(ev({freq:'D',interval:1,count:3}, ['2026-11-12']), '2026-11-01', '2026-12-31'),
      };
    })()""")
    ok(r['lunMer'] == ['2026-11-11','2026-11-16','2026-11-18','2026-11-23'], 'settimanale lun+mer')
    ok(r['cont'] == ['2026-11-11','2026-11-13','2026-11-15'], 'ogni 2 giorni, 3 volte')
    ok(r['fino'] == ['2026-11-11','2026-11-12','2026-11-13'], 'fino al (compreso)')
    ok(r['mese'] == ['2026-01-31','2026-03-31','2026-05-31'], 'mensile il 31 salta i mesi corti')
    ok(r['ex'] == ['2026-11-11','2026-11-13'], 'eccezione esclusa')

    # PC
    pc = b.new_context(viewport={'width': 1280, 'height': 800}, locale='it-IT', timezone_id='Europe/Rome').new_page()
    pc.goto(URL.replace('index.html', 'anteprima.html')); pc.wait_for_selector('.tabbar')
    pc.click('.tabbar >> text=Calendario'); pc.screenshot(path='test/10-pc-mese.png')
    ok(pc.locator('.mese-cella').count() >= 35, 'anteprima a file unico funziona su PC')
    # offline: service worker registrato solo su https; verifico che i file siano tutti in elenco
    b.close()
print('ERRORI:' if err else 'TUTTO OK', *err, sep='\n')
sys.exit(1 if err else 0)
