# Test v0.62 «Dossier studente»: ospite con statistiche finte di Biologia.
# «🧠 Prompt quiz» → «👁 Vedi dossier» mostra le voci (sotto-step debole, idea sbagliata) → il prompt contiene le regole;
# togliere una voce la toglie dal prompt (e resta tolta riaprendo); un'email nel testo di un distrattore blocca «Copia».
import os, json, http.server, threading, functools
from playwright.sync_api import sync_playwright
RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
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

OGGI = '2026-11-20'
STAT = [{'id': 'sq-tdos-%d' % i, 'type': 'statq', 'updatedAt': 0, 'sk': 'B-2.2.1-1', 'n': 1, 'ok': 1 if i < 3 else 0, 'ultima': OGGI, 'esito': i < 3}
        for i in range(10)]
STAT[5]['scelte'] = {'La glicolisi avviene nel mitocondrio': 3}
STAT[6]['scelte'] = {'Scrivi a mario.rossi@example.com': 2}

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 360, 'height': 800}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time=OGGI + 'T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.evaluate("(() => { localStorage.removeItem('imc-dossier-escluse'); if (!Stato.tutti('materia').some(m => m.codice === 'B')) Stato.salva({ id: 'mat-B', type: 'materia', updatedAt: 0, codice: 'B', nome: 'Biologia' }); })()")
    pg.evaluate('(xs => xs.forEach(r => Stato.salva(r)))(%s)' % json.dumps(STAT, ensure_ascii=False))

    def apri():
        pg.evaluate("document.querySelectorAll('.foglio-sfondo, .visore, dialog').forEach(e => e.remove()); conStrumentiQuiz(() => StrumentiQuiz.prompt())")
        pg.get_by_label('Materia', exact=True).wait_for(timeout=10000)
        pg.get_by_label('Materia', exact=True).select_option('B')
        pg.get_by_label('Step (es. 3.3)').fill('2.2')
    apri()
    ok(pg.get_by_label('Vedi dossier').count() == 1 and pg.get_by_text('Usa il mio dossier').count() == 1, 'foglio: «Usa il mio dossier» e «👁 Vedi dossier»')
    pg.get_by_label('Vedi dossier').click()
    box = pg.get_by_role('region', name='Dossier studente')
    box.wait_for(timeout=5000)
    t = box.inner_text()
    ok('Sotto-step 2.2.1 debole' in t and '30 %' in t and '10 tentativi' in t, 'voce debole con il motivo numerico')
    ok('La glicolisi avviene nel mitocondrio' in t, 'idea sbagliata ricorrente citata')
    ok('Controllo privacy' in t and 'email' in t, 'controllo privacy segnala l’email nel distrattore')
    pg.screenshot(path='test/v062_dossier.png', full_page=True)
    pg.get_by_role('button', name='Genera il prompt').click()
    out = pg.get_by_label('Master prompt da copiare in Gemini').input_value()
    ok('Dossier dello studente' in out and 'Sotto-step 2.2.1: aggiungi' in out, 'il prompt contiene le regole del dossier')
    ok('Punti deboli misurati' not in out, 'il dossier sostituisce la vecchia riga dei punti deboli')
    copia = pg.get_by_role('button', name='Copia prompt')
    ok(copia.is_disabled(), '«Copia prompt» disabilitato con un’email nel dossier')
    # togli la voce con l'email → Copia di nuovo attivo
    pg.get_by_label(lambda_name := 'Manda all\'AI: Idea sbagliata ricorrente (sotto-step 2.2.1)').first.wait_for(timeout=3000)
    for c in pg.get_by_label(lambda_name).all():
        if 'mario' in c.locator('xpath=..').inner_text(): c.uncheck(); break
    pg.wait_for_timeout(200)
    out = pg.get_by_label('Master prompt da copiare in Gemini').input_value()
    ok('mario.rossi' not in out and copia.is_enabled(), 'voce con l’email tolta: non è nel prompt e «Copia» torna attivo')
    # togli la voce debole → sparisce dal prompt e resta tolta riaprendo il foglio
    pg.get_by_label('Manda all\'AI: Sotto-step 2.2.1 debole').uncheck(); pg.wait_for_timeout(200)
    out = pg.get_by_label('Master prompt da copiare in Gemini').input_value()
    ok('Sotto-step 2.2.1: aggiungi' not in out, 'voce debole tolta → non è più nel prompt')
    apri(); pg.get_by_label('Vedi dossier').click()
    ok(not pg.get_by_label('Manda all\'AI: Sotto-step 2.2.1 debole').is_checked(), 'le voci tolte sono ricordate (imc-dossier-escluse)')
    ok('imc-dossier-escluse' in pg.evaluate('Object.keys(localStorage).join(",")'), 'chiave locale con prefisso imc- (cancellata al cambio account)')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
