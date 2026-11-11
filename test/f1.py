# Test F1 (v0.7): notifiche sul telefono tramite ntfy (finto server).
import os, http.server, threading, functools, json, datetime
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
ROMA = datetime.timezone(datetime.timedelta(hours=1))
def ts(s): return str(int(datetime.datetime.fromisoformat(s).replace(tzinfo=ROMA).timestamp()))

def apri(p, quando):
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, locale='it-IT', timezone_id='Europe/Rome')
    inviati = []
    def ntfy(r):
        try: inviati.append(json.loads(r.request.post_data or '{}'))
        except Exception: inviati.append({'grezzo': r.request.post_data})
        r.fulfill(status=200, body='{}', headers={'access-control-allow-origin': '*'})
    ctx.route('https://ntfy.sh/**', ntfy)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time=quando)
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.wait_for_function("Studio.pkPiano() !== null", timeout=10000)
    return pg, inviati

def avanza(pg, ms=6000):
    pg.clock.run_for(ms); pg.wait_for_timeout(300)

with sync_playwright() as p:
    pg, inv = apri(p, '2026-11-11T09:00:00+01:00')
    # Spente: nessun invio
    pg.evaluate("Stato.salva({ id: 'e1', type: 'evento', updatedAt: 0, titolo: 'Chimica 3.1', inizio: '2026-11-12T15:00', fine: '2026-11-12T17:00', tuttoIlGiorno: false, promemoria: [15] })")
    avanza(pg); ok(len(inv) == 0, 'notifiche spente: nessun invio')
    # Attivazione dall'interfaccia
    pg.evaluate("vai('altro')"); pg.wait_for_timeout(200)
    pg.locator('.card', has_text='Notifiche sul telefono').locator('.widget-riga', has_text='Notifiche sul telefono').locator('input').check(force=True)
    pg.wait_for_timeout(200)
    topic = pg.evaluate("imp().ntfyTopic")
    ok(bool(topic) and topic.startswith('imc-') and len(topic) == 28, 'topic segreto generato: ' + str(topic))
    ok(topic in pg.inner_text('body'), 'topic mostrato con le istruzioni')
    avanza(pg)
    tit = {m.get('title'): m for m in inv}
    ok('Chimica 3.1' in tit and tit['Chimica 3.1'].get('delay') == ts('2026-11-12T14:45'), 'promemoria evento alle 14:45 del 12/11')
    ok(all(m.get('topic') == topic for m in inv), 'tutte sul topic giusto')
    studio = [m for m in inv if m.get('title') == '📚 Studio di oggi']
    ok(any(m.get('delay') == ts('2026-11-12T08:00') and 'Bio 2.2' in m.get('message', '') for m in studio), 'studio di oggi 12/11 alle 8:00 (Bio 2.2 + Chi 2.3)')
    ok(not any(m.get('delay') == ts('2026-11-11T08:00') for m in studio), 'niente studio per stamattina (orario passato)')
    sera = [m for m in inv if m.get('title', '').startswith('🌙')]
    ok(any(m.get('delay') == ts('2026-11-11T21:30') for m in sera), 'ripasso serale 11/11 alle 21:30')
    ok(all(int(m.get('delay', '0')) <= int(ts('2026-11-14T09:00')) for m in inv if m.get('delay')), 'nessuna oltre 72 ore')
    n0 = len(inv)
    # Idempotenza
    pg.evaluate("Notifiche.allinea()"); pg.wait_for_timeout(300)
    ok(len(inv) == n0, 'riallineare non manda doppioni')
    # Spostamento: nuova notifica + sostituzione silenziosa della vecchia
    pg.evaluate("(() => { const e = Stato.prendi('e1'); e.inizio = '2026-11-12T16:00'; e.fine = '2026-11-12T18:00'; Stato.salva(e); })()")
    avanza(pg); nuovi = inv[n0:]
    ok(any(m.get('title') == 'Chimica 3.1' and m.get('delay') == ts('2026-11-12T15:45') for m in nuovi), 'evento spostato: nuova notifica alle 15:45')
    ok(any(m.get('priority') == 1 and m.get('delay') == str(int(ts('2026-11-12T14:45')) + 5) for m in nuovi), 'vecchia sostituita in silenzio dopo le 14:45')
    seq = {m.get('sequence_id') for m in nuovi if m.get('title') == 'Chimica 3.1' or m.get('priority') == 1}
    ok(len(seq) == 1, 'stesso sequence_id per sostituire')
    n1 = len(inv)
    # Eliminazione: annullo
    pg.evaluate("Stato.elimina('e1')"); avanza(pg)
    ok(any(m.get('title') == '✕ Annullato' and m.get('message') == 'Chimica 3.1' for m in inv[n1:]), 'evento eliminato: notifica annullata')
    # Silenzio: evento alle 23:30 → arriva alle 7:30 del giorno dopo
    pg.evaluate("Stato.salva({ id: 'e2', type: 'evento', updatedAt: 0, titolo: 'Tardi', inizio: '2026-11-12T23:30', fine: '2026-11-12T23:59', tuttoIlGiorno: false, promemoria: [0] })")
    avanza(pg)
    ok(any(m.get('title') == 'Tardi' and m.get('delay') == ts('2026-11-13T07:30') for m in inv), 'orari silenziosi: spostata alle 7:30')
    # Categoria privata
    pg.evaluate("(() => { const c = categorie()[0]; const i = imp(); i.ntfyPrivate = [c.id]; Stato.salva(i); Stato.salva({ id: 'e3', type: 'evento', updatedAt: 0, titolo: 'Dentista segreto', inizio: '2026-11-12T10:00', fine: '2026-11-12T11:00', tuttoIlGiorno: false, promemoria: [30], categoriaId: c.id }); })()")
    avanza(pg)
    ok(not any('Dentista' in json.dumps(m) for m in inv), 'categoria privata: titolo nascosto')
    # Task con orario
    pg.evaluate("Stato.salva({ id: 't1', type: 'task', updatedAt: 0, titolo: 'Pagare affitto', scadenza: '2026-11-13T12:00', priorita: 0, fatto: false })")
    avanza(pg)
    ok(any(m.get('title') == 'Pagare affitto' and m.get('delay') == ts('2026-11-13T12:00') for m in inv), 'task con orario')
    # Prova immediata (senza delay)
    k = len(inv); pg.evaluate("Notifiche.prova()"); pg.wait_for_timeout(300)
    ok(len(inv) == k + 1 and 'delay' not in inv[-1] and inv[-1].get('title') == '✅ Notifiche attive', 'prova immediata')

    # Simulazione vicina: il 19/11 la SIM3 (22/11) è tra 3 giorni
    pg2, inv2 = apri(p, '2026-11-19T07:00:00+01:00')
    pg2.evaluate("(() => { const i = imp(); i.ntfy = true; i.ntfyTopic = 'imc-test'; Stato.salva(i); })()")
    avanza(pg2)
    ok(any('Tra 3 giorni: Simulazione 3' in m.get('title', '') and m.get('delay') == str(int(ts('2026-11-19T08:00')) + 60) for m in inv2), 'simulazione 3 giorni prima')
    ok(any('Domani: Simulazione 3' in m.get('title', '') for m in inv2), 'simulazione il giorno prima')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
