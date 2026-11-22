# Test v0.64.5 T13: onboarding ospite in 3 domande, atomico, riapribile e senza Drive.
import os, http.server, threading, functools
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

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(viewport={'width': 360, 'height': 800}, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    for _ in range(100):
        if pg.evaluate("Stato.tutti('esame').filter(x => !x.deleted).length") >= 2: break
        pg.wait_for_timeout(100)
    pg.evaluate("""() => {
      Drive.eProprietario = () => false;
      localStorage.removeItem('imc-onboarding-saltato');
      for (const t of ['profilo', 'materia', 'esame', 'profiloai']) for (const r of Stato.tutti(t)) Stato.elimina(r.id);
    }""")
    prima = pg.evaluate("""() => ['profilo','materia','esame','profiloai'].map(t => Stato.tutti(t).filter(x => !x.deleted).length)""")

    # Salta chiude senza creare record di dominio e non riparte automaticamente nella stessa installazione.
    pg.evaluate('Dominio.benvenuto(true)')
    dlg = pg.get_by_role('dialog', name='👋 Configurazione iniziale')
    ok(dlg.count() == 1 and pg.get_by_text('Domanda 1 di 3').count() == 1, 'onboarding raggiungibile senza Drive a 360 px')
    pg.get_by_role('button', name='Salta per ora').click()
    dopo = pg.evaluate("""() => ['profilo','materia','esame','profiloai'].map(t => Stato.tutti(t).filter(x => !x.deleted).length)""")
    ok(dopo == prima, 'Salta non crea profilo, materia, esame o profilo AI (%s → %s)' % (prima, dopo))

    # Riapertura manuale: tre risposte, salvataggio atomico e apertura del Centro.
    pg.evaluate('Dominio.benvenuto(true)')
    pg.get_by_label('Profilo di studio iniziale').select_option('universita_concorsi')
    pg.get_by_role('button', name='Avanti').click()
    pg.get_by_label('Prima materia').fill('Diritto privato')
    pg.get_by_label('Tipo della materia').select_option('giuridico_economico')
    pg.get_by_label('Data esame facoltativa').fill('2027-01-10')
    pg.get_by_role('button', name='Avanti').click()
    pg.get_by_label('AI usata per creare quiz').select_option('chatgpt')
    pg.get_by_role('button', name='Completa').click()
    pg.wait_for_selector('.centro-zona', timeout=10000)
    salvato = pg.evaluate("""() => {
      const m = Stato.tutti('materia').find(x => !x.deleted && x.nome === 'Diritto privato');
      const e = Stato.tutti('esame').find(x => !x.deleted && x.nome === 'Esame di Diritto privato');
      return [Dominio.profilo().modalita, m && m.archetipo, e && e.data, (Stato.prendi('profiloai') || {}).profilo?.id];
    }""")
    ok(salvato == ['universita_concorsi', 'giuridico_economico', '2027-01-10', 'chatgpt'], 'tre risposte salvano profilo, materia, esame e AI (%s)' % salvato)
    ok(pg.locator('.centro-zona').count() == 1, 'alla fine si apre il Centro di creazione')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)

    # Altro → Studio consente la riapertura all'ospite; il proprietario non vede il comando.
    pg.evaluate("UI.scheda='altro'; UI.altroSez='studio'; disegna()")
    ok(pg.get_by_role('button', name='Riapri configurazione iniziale').count() == 1, 'ospite: riapertura disponibile da Altro → Studio')
    pg.evaluate("Drive.eProprietario=()=>true; disegna()")
    ok(pg.get_by_role('button', name='Riapri configurazione iniziale').count() == 0, 'proprietario: onboarding assente')
    ctx.close()

srv.shutdown()
if err:
    print('\nERRORI:')
    for e in err: print(' - ' + e)
    raise SystemExit(1)
print('TUTTO OK — onboarding v0.64.5')
