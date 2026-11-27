# Fase 14 del brief: unire e dividere i micro-step nel Centro, PRIMA dell'import (0 chiamate AI, niente pdf.js).
# Ospite con un piano di Biologia 3.3 approvato: 4 schede (S1–S2 in 3.3.1, S3–S4 in 3.3.2), 3 blocchi (75 min per microstep),
# S1 già scritta. Passo 2: due proposte «Dividi?» (più di una sessione da 50 min) col perché; «Unisci al successivo» → un gruppo;
# approvazione → S1 resta scritta (niente rigenerazione), id delle schede = nuovo microstep; «Dividi qui» → microstep nuovo 3.3.3
# con le pagine di quello d'origine; la proposta applica la divisione a metà; rilettura del piano dall'AI → tutto da fare.
import os, json, http.server, threading, functools, re
from playwright.sync_api import sync_playwright
RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128
http.server.SimpleHTTPRequestHandler.protocol_version = 'HTTP/1.1'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err, rete_ai = [], []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)

sk = lambda n, ms: {'n': n, 'micro': [ms], 'categoria': 'prioritaria', 'blocco': 'Membrane'}
CRE = {'id': 'cre-biologia-3.3', 'type': 'creazione', 'updatedAt': 0, 'materia': 'bio', 'nomeMateria': 'Biologia', 'step': '3.3', 'intensita': 'standard',
       'piano': {'step': '3.3', 'blocchi': ['A', 'B', 'C'], 'avvisi': [], 'schede': [sk(1, '3.3.1'), sk(2, '3.3.1'), sk(3, '3.3.2'), sk(4, '3.3.2')]},
       'schede': [{'n': 1, 'stato': 'arrivata', 'parteId': 'prq-biologia-3.3-s1'}, {'n': 2, 'stato': 'da-fare'}, {'n': 3, 'stato': 'da-fare'}, {'n': 4, 'stato': 'da-fare'}],
       'esiti': {}, 'fonti': {'libri': [], 'slide': [], 'guide': [], 'indici': [], 'quiz': [], 'vietati': []}}
PARTE = {'id': 'prq-biologia-3.3-s1', 'type': 'parteq', 'updatedAt': 0, 'quiz': [{'scheda': 'S01', 'domanda': 'D%d?' % k, 'concetto': 'osmosi'} for k in range(18)]}
RISPOSTA = '```json\n' + json.dumps({'formato': 'piano-v1', 'blocchi': [{'codice': '3.3', 'titolo': 'Membrane', 'copre': [{'schede': ['S1', 'S2'], 'micro': ['3.3.1']}]}]}) + '\n```'

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 375, 'height': 800}, locale='it-IT', timezone_id='Europe/Rome')
    ctx.route(re.compile(r'https://(api\.groq\.com|generativelanguage\.googleapis\.com|api\.xkiro\.com|api\.cohere\.com|router\.requesty\.ai)/.*'),
              lambda r: (rete_ai.append(r.request.url), r.abort()))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-20T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.evaluate("""([cre, parte]) => {
      for (const t of ['pacchetto', 'esame', 'creazione', 'parteq', 'innesto', 'libro']) for (const r of Stato.tutti(t)) Stato.elimina(r.id);
      Stato.salva(cre, true); Stato.salva(parte, true); conStrumentiQuiz(() => CentroUI.apri()); }""", [CRE, PARTE])
    pg.wait_for_selector('.centro-zona', timeout=10000)
    passo = lambda: pg.locator('.centro-passo').inner_text()
    zona = lambda: pg.locator('.centro-zona')
    rec = lambda: pg.evaluate("Stato.prendi('cre-biologia-3.3')")
    torna = lambda: pg.get_by_role('button', name='Torna al passo precedente').click()
    ok('Passo 3 di 7' in passo(), 'la creazione riapre al passo 3 (Quiz)')
    torna(); ok('Passo 2 di 7' in passo(), 'indietro al piano: anteprima con il piano approvato')

    t = zona().inner_text()
    ok('Microstep 3.3.1 · 2 schede · ~75 min' in t and 'Microstep 3.3.2 · 2 schede · ~75 min' in t, 'gruppi per microstep con schede e minuti')
    prop = pg.get_by_label('Proposte sui microstep').locator('li')
    ok(prop.count() == 2 and 'più di una sessione da 50' in prop.first.inner_text(), 'due proposte «Dividi?» con il perché (%d)' % prop.count())
    ok(rec()['piano']['schede'][2]['micro'] == ['3.3.2'], 'le proposte non si applicano da sole')

    pg.get_by_role('button', name='Unisci il microstep 3.3.2 a 3.3.1').click()
    t = zona().inner_text()
    ok('Microstep 3.3.1 · 4 schede' in t and 'Microstep 3.3.2' not in t, '⤵ Unisci al successivo → un solo gruppo (1 tocco)')
    pg.get_by_role('button', name='Approva il piano').click(); pg.wait_for_timeout(300)
    r = rec()
    ok([x['micro'] for x in r['piano']['schede']] == [['3.3.1'], ['3.3.1'], ['3.3.1', '3.3.2'], ['3.3.1', '3.3.2']], 'piano salvato: 3.3.2 resta fra i microstep coperti')
    ok([x['stato'] for x in r['schede']] == ['arrivata', 'da-fare', 'da-fare', 'da-fare'], 'S1 già scritta resta: niente da rigenerare')
    ok(pg.evaluate("Stato.prendi('prq-biologia-3.3-s1').quiz.length") == 18, 'la parte di S1 è intatta')
    ok(pg.evaluate("Centro.schede(Stato.prendi('cre-biologia-3.3').piano, { codice: 'BIO' }).map(s => s.id).join(',')") == 'BIO-3.3.1-1,BIO-3.3.1-2,BIO-3.3.1-3,BIO-3.3.1-4',
       'id delle schede col microstep nuovo (nascono all\'import)')
    ok('Passo 3 di 7' in passo(), 'approvato → passo 3')

    torna()
    pg.get_by_role('button', name='Dividi il microstep 3.3.1 dopo la scheda S2').click()
    t = zona().inner_text()
    ok('Microstep 3.3.1 · 2 schede' in t and 'Microstep 3.3.3 · 2 schede' in t, '✂ Dividi qui → microstep nuovo 3.3.3 (1 tocco)')
    pg.get_by_role('button', name='Approva il piano').click(); pg.wait_for_timeout(300)
    r = rec()
    ok([(x['micro'][0], x.get('fonte')) for x in r['piano']['schede']] == [('3.3.1', None), ('3.3.1', None), ('3.3.3', '3.3.2'), ('3.3.3', '3.3.2')],
       'S3–S4 nel nuovo 3.3.3 con le pagine di 3.3.2 (%s)' % [(x['micro'], x.get('fonte')) for x in r['piano']['schede']])
    ok(r['piano'].get('nuovi') == ['3.3.3'] and 'azzera' not in r['piano'], 'codice creato registrato, nessun flag residuo')
    ok(r['schede'][0]['stato'] == 'arrivata', 'S1 ancora scritta dopo la divisione')

    torna()
    prop = pg.get_by_label('Proposte sui microstep').locator('li')
    ok(prop.count() == 2 and '~75 min' in prop.first.inner_text(), 'i due microstep valgono ancora 75 min > 50: le proposte restano, mai applicate (%d)' % prop.count())
    pg.get_by_role('button', name='Unisci il microstep 3.3.3 a 3.3.1').click()
    pg.locator('.centro-avvisi button', has_text='Dividi').first.click()
    t = zona().inner_text()
    ok('Microstep 3.3.1 · 2 schede' in t and 'Microstep 3.3.3 · 2 schede' in t,
       'la proposta «✂ Dividi» divide a metà (3.3.3, liberato dall\'unione, si riusa)')

    senza = pg.evaluate("[...document.querySelectorAll('.foglio button, .foglio input, .foglio select, .foglio textarea')].filter(b => !(b.getAttribute('aria-label') || (b.labels && b.labels.length) || b.textContent.trim())).length")
    ok(senza == 0, 'nessun controllo senza nome nel foglio (%d)' % senza)
    ok(not pg.evaluate("document.querySelector('.foglio').scrollWidth > document.querySelector('.foglio').clientWidth"), 'nessuno sforamento orizzontale a 375 px')
    pg.screenshot(path='test/microstep_centro.png', full_page=True)

    pg.locator('textarea[aria-label^="Risposta dell"]').fill(RISPOSTA)
    pg.get_by_role('button', name='Leggi il piano').click()
    pg.get_by_role('button', name='Approva il piano').click(); pg.wait_for_timeout(300)
    ok([x['stato'] for x in rec()['schede']] == ['da-fare', 'da-fare'], 'piano riletto dall\'AI → le schede ripartono da fare')
    ok(not rete_ai, 'zero chiamate AI (%s)' % rete_ai)

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
