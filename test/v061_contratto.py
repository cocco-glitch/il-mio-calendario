# Test v0.61 «Contratto AI»: import MANUALE da ospite (Drive non collegato).
# «📋 Incolla testo» con la risposta di Gemini in formato quiz-v3 (niente id, niente esatta: la giusta è opzioni[0])
# → anteprima con controllo qualità → Importa → Inserisci → la scheda ha «🧩 Quiz nell'app» e la giusta non è sempre la A.
# Risposta interrotta a metà → «📋 Copia «continua da qui»». «📁 Scegli file» legge un .json scelto dal disco.
import os, json, http.server, threading, functools, tempfile
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

LIV = [1, 1, 2, 1, 2, 2, 3, 1, 2, 3, 2, 4, 1, 3, 2, 4, 3, 4]
def dom(s, i):
    return {'scheda': 'S%02d' % s, 'categoria': 'prioritaria', 'livello': LIV[i - 1], 'tipoItem': 'concetto', 'erroreTipico': 'confonde',
            'domanda': 'Domanda %d della scheda %d sulla glicolisi?' % (i, s), 'opzioni': ['Giusta S%02d D%02d' % (s, i), 'Falsa uno %d' % i, 'Falsa due %d' % i, 'Falsa tre %d' % i],
            'spiegazione': 'RISPOSTA ESATTA: A) perché sì. PERCHÉ GLI ALTRI NO: B) no. C) no. D) no.',
            'spiegazioneDistrattori': ['Trappola %d-%d' % (i, k) for k in (1, 2, 3)], 'distractorTypes': ['misconception', 'inversione_causa', 'caso_limite'], 'fonte': '[[Manuale, cap. 3, par. 3.3]]'}
BLOCCO = {'formato': 'quiz-v3', 'parte': 'biologia-3.3-s1-2', 'quiz': [dom(s, i) for s in (1, 2) for i in range(1, 19)]}
TESTO = 'Ecco le schede richieste.\n```json\n' + json.dumps(BLOCCO, ensure_ascii=False, indent=1) + '\n```\nFammi sapere!'
TRONCO = '```json\n' + json.dumps({'formato': 'quiz-v3', 'step': 'biologia-3.4', 'scheda': 'S01', 'quiz': [dom(1, i) for i in range(1, 6)]}, ensure_ascii=False)[:-40]
OGGI = '2026-11-20'

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 360, 'height': 800}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.add_init_script("try { localStorage.setItem('imc-quiz-modo','neuro') } catch (e) {}")
    pg.clock.install(time=OGGI + 'T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.wait_for_function("typeof ImportaDrive === 'object'", timeout=10000)
    ok(not pg.evaluate('Drive.pronto'), 'ospite: Drive non collegato')
    # 1) il foglio si apre anche senza Drive
    pg.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(e => e.remove()); ImportaDrive.apri()")
    pg.wait_for_selector('.foglio >> text=Senza Drive collegato', timeout=5000)
    ok(pg.get_by_role('button', name='Collega Drive').count() == 1, 'nota ospite con «Collega Drive»')
    # 2) incolla testo → anteprima
    pg.get_by_role('button', name='Incolla testo').click()
    pg.get_by_label('Testo da importare').fill(TESTO)
    pg.get_by_role('button', name='Leggi', exact=True).click()
    pg.wait_for_selector('.foglio >> text=/pacchett[oi] trovat/', timeout=8000)
    t = pg.inner_text('.foglio')
    ok('Biologia 3.3' in t and '36 domande' in t, 'anteprima: una voce «Biologia 3.3 … 36 domande»')
    ok('Controllo qualità superato' in t or 'avvisi di qualità' in t, 'riepilogo qualità prima di «Importa»')
    pg.screenshot(path='test/v061_contratto.png')
    # 3) importa
    pg.get_by_role('button', name='Importa Biologia 3.3').click()
    pg.get_by_label('Corso di destinazione per B3.3').wait_for(timeout=5000)
    pg.get_by_label('Giorno nel piano per B3.3').fill(OGGI)
    pg.get_by_role('button', name='Inserisci B3.3').click()
    pg.wait_for_function("!!Stato.prendi('inn-B3.3')", timeout=5000)
    ok('36 domande in Banca' in pg.inner_text('.foglio'), 'esito: 36 domande in Banca')
    banca = pg.evaluate("Stato.tutti('bancaimc').filter(r => /^B-3[.]3/.test(r.sk)).flatMap(r => r.domande.map(d => ({ sk: r.sk, id: d.id, giusta: d.o[0], e: String(d.e) })))")
    ok(len(banca) == 36 and all(b['giusta'].startswith('Giusta') for b in banca), 'in Banca la giusta è quella di opzioni[0] di Gemini (36/36)')
    lettere = sorted(set(b['e'][17] for b in banca if b['e'].startswith('RISPOSTA ESATTA: ')))
    ok(lettere == ['A', 'B', 'C', 'D'], 'posizioni mescolate dall’app, lettere della spiegazione riscritte: %s' % lettere)
    ok(all('biologia-3.3-S0' in b['id'] for b in banca), 'ID assegnati dall’app: %s' % banca[0]['id'])
    # 4) risposta interrotta → «continua da qui»
    pg.get_by_label('Testo da importare').fill(TRONCO)
    pg.get_by_role('button', name='Leggi', exact=True).click()
    pg.get_by_role('button', name='Copia prompt continua da qui').wait_for(timeout=5000)
    pg.get_by_role('button', name='Copia prompt continua da qui').click(); pg.wait_for_timeout(300)
    cb = pg.evaluate('navigator.clipboard.readText()')
    ok('CONTINUA DA QUI' in cb and 'quiz-v3' in cb, 'prompt «continua da qui» negli appunti')
    # 5) scegli file
    tmp = os.path.join(tempfile.mkdtemp(), 'gemini 3.4.json')
    with open(tmp, 'w', encoding='utf8') as fh: json.dump({'formato': 'quiz-v3', 'step': 'biologia-3.4', 'scheda': 'S01', 'quiz': [dom(1, i) for i in range(1, 19)]}, fh, ensure_ascii=False)
    pg.get_by_label('File da importare').set_input_files(tmp)
    pg.get_by_role('button', name='Importa Biologia 3.4').wait_for(timeout=5000)
    t = pg.inner_text('.foglio')
    ok('Biologia 3.4' in t and 'schema da verificare' not in t, '«📁 Scegli file»: il .json scelto compare come «Biologia 3.4», senza «schema da verificare»')
    # 6) scheda → «🧩 Quiz nell'app»
    sk = banca[0]['sk']
    pg.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(e => e.remove()); (() => { const t = trovaScheda(%s); apriScheda(t.pk, t.m, t.micro, t.s); })()" % json.dumps(sk))
    pg.get_by_role('button', name="Quiz nell'app").click()
    pg.wait_for_selector('.qz-domanda', timeout=8000)
    ok('glicolisi' in pg.inner_text('.qz-domanda'), 'la scheda importata si apre nel quiz in app')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
