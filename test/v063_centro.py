# Test v0.63 «Centro di creazione»: ospite con un piano di Biologia 3.3 (2 schede) già fatto.
# Risposta incollata → Controllo trova 1 errore → Correggi con patch → ricontrollo verde → salta la prova →
# Importa solo il microstep 3.3.1 → innesto con 1 scheda; reimport → stesso innesto, nessun doppione; lista esclusi precompilata.
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
CRE = {'id': 'cre-biologia-3.3', 'type': 'creazione', 'updatedAt': 0, 'materia': 'bio', 'nomeMateria': 'Biologia', 'step': '3.3', 'intensita': 'standard',
       'piano': {'step': '3.3', 'blocchi': ['B1'], 'avvisi': [], 'schede': [{'n': 1, 'micro': ['3.3.1'], 'categoria': 'prioritaria', 'blocco': 'B1'},
                                                                          {'n': 2, 'micro': ['3.3.2'], 'categoria': 'prioritaria', 'blocco': 'B1'}]},
       'schede': [{'n': 1, 'stato': 'da-fare'}, {'n': 2, 'stato': 'da-fare'}], 'esiti': {}}
def dom(s, k, rotta=False):
    op = ['Giusta %d' % k, 'Falsa a %d' % k, 'Falsa b %d' % k] + ([] if rotta else ['Falsa c %d' % k])
    return {'scheda': 'S0%d' % s, 'livello': 1 + k % 4, 'tipoItem': 'concetto', 'domanda': 'Domanda %d.%d sulla glicolisi e il suo bilancio energetico?' % (s, k),
            'opzioni': op, 'coppiaGemellaId': None, 'erroreTipico': 'Confondere resa netta e lorda di ATP (%d.%d)' % (s, k),
            'spiegazioneDistrattori': ['B è sbagliata perché confonde la fase preparatoria con quella di recupero %d' % k,
                                       'C è sbagliata perché attribuisce il NADH al ciclo di Krebs invece che alla glicolisi %d' % k,
                                       'D è sbagliata perché ignora le due molecole di ATP investite all inizio %d' % k],
            'distractorTypes': ['confusione di fase', 'attribuzione errata', 'omissione'],
            'spiegazione': 'RISPOSTA ESATTA: A) Giusta. PERCHÉ GLI ALTRI NO: B) no. C) no. D) no.', 'fonte': '[[Manuale, p. %d]]' % k}
RISPOSTA = 'Ecco le schede:\n```json\n' + json.dumps({'formato': 'quiz-v3', 'step': '3.3', 'quiz': [dom(1, k, k == 5) for k in range(1, 19)] + [dom(2, k) for k in range(1, 19)]}, ensure_ascii=False) + '\n```'
INNESTI = """JSON.stringify(Stato.tutti('innesto').filter(r => !r.deleted).map(x => ({ k: x.k, micro: x.sub.microstep.map(m => m.n + ':' + m.schede.length),
  dom: x.banche.reduce((a, sk) => a + ((Stato.prendi('bq-' + sk) || {}).domande || []).length, 0) })))"""

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 375, 'height': 800}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time=OGGI + 'T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    # ospite: niente pacchetto né esame; fixture del Centro al passo 3
    pg.evaluate("""(cre => { localStorage.removeItem('imc-centro-esclusi');
      for (const t of ['pacchetto', 'esame', 'creazione', 'parteq', 'innesto']) for (const r of Stato.tutti(t)) Stato.elimina(r.id);
      Stato.salva(cre, true); conStrumentiQuiz(() => CentroUI.apri()); })(%s)""" % json.dumps(CRE, ensure_ascii=False))
    pg.wait_for_selector('.centro-zona', timeout=10000)
    passo = lambda: pg.locator('.centro-passo').inner_text()
    zona = lambda: pg.locator('.centro-zona')
    ok('Passo 3 di 7' in passo(), 'il Centro riapre la creazione al passo 3 (Quiz)')

    pg.locator('textarea[aria-label^="Risposta dell"]').fill(RISPOSTA)
    zona().get_by_role('button', name='Leggi la risposta').click(); pg.wait_for_timeout(300)
    sc = pg.evaluate("Stato.prendi('cre-biologia-3.3').schede.map(s => s.stato).join(',')")
    ok(sc == 'arrivata,arrivata', 'una risposta con due schede → entrambe arrivate (%s)' % sc)

    zona().get_by_role('button', name='Avanti: Controllo').click(); pg.wait_for_timeout(300)
    e = pg.evaluate("Stato.prendi('cre-biologia-3.3').esiti")
    ok(e.get('controllato') and e.get('daCorreggere') == 1, 'Controllo zero token: 1 domanda da correggere (%s)' % json.dumps(e))

    zona().locator('button', has_text='Correggi').first.click(); pg.wait_for_timeout(300)
    ok('Passo 5 di 7' in passo(), 'Correggi apre il passo 5 con il prompt di correzione')
    rotta = pg.evaluate("Stato.prendi('prq-biologia-3.3-s1').quiz.find(q => q.opzioni.length !== 4).id")
    patch = [{'id': rotta, 'opzioni': ['Giusta 5', 'Falsa a 5', 'Falsa b 5', 'Falsa c 5'], 'esatta': 0,
              'spiegazione': 'RISPOSTA ESATTA: A) Giusta. PERCHÉ GLI ALTRI NO: B) no. C) no. D) no.'}]
    pg.locator('textarea[aria-label^="Patch JSON"]').fill('```json\n' + json.dumps(patch, ensure_ascii=False) + '\n```')
    zona().get_by_role('button', name='Applica le patch').click(); pg.wait_for_timeout(300)
    ok('nessuna domanda da correggere' in zona().inner_text(), 'patch applicata → ricontrollo superato')

    pg.get_by_role('button', name='Salta la prova: Importa').or_(pg.get_by_role('button', name='Avanti: Importa')).first.click(); pg.wait_for_timeout(300)
    ok('Passo 7 di 7' in passo(), 'si arriva a Importa')
    albero = pg.locator('.centro-albero').inner_text()
    ok('3.3.1' in albero and '3.3.2' in albero and '36 domande' in albero, 'albero cartella → step → microstep con i conteggi')
    pg.get_by_label('Microstep 3.3.2').uncheck()
    ok(pg.get_by_label('Tutto lo step', exact=False).evaluate('e => e.indeterminate'), 'step parziale dopo aver tolto 3.3.2')
    ok('1 microstep · 1 scheda · 18 domande' in zona().inner_text(), 'conteggio della selezione aggiornato')

    pg.get_by_role('button', name='dove lo metto', exact=False).click()
    pg.locator('.innesto-scelta button').click(); pg.wait_for_timeout(300)
    i1 = pg.evaluate(INNESTI)
    ok(i1 == '[{"k":"BIO3.3","micro":["3.3.1:1"],"dom":18}]', 'importato solo 3.3.1: 1 scheda, 18 domande (%s)' % i1)
    ok('1 scheda nei tuoi programmi' in pg.locator('.centro-nota[role=status]').inner_text(), 'esito con il singolare «1 scheda»')
    pg.screenshot(path='test/v063_centro.png', full_page=True)

    pg.get_by_role('button', name='dove lo metto', exact=False).click()
    ok('Reimporta' in pg.locator('.innesto-scelta button').inner_text(), 'la seconda volta il pulsante dice «Reimporta»')
    pg.locator('.innesto-scelta button').click(); pg.wait_for_timeout(300)
    ok(pg.evaluate(INNESTI) == i1, 'reimport: stesso innesto, nessun doppione')

    det = pg.locator('details.centro-impostazioni'); det.locator('summary').click()
    lista = pg.get_by_label('Fonti escluse, una per riga').input_value()
    ok(all(n in lista for n in ['Testbusters', 'Alpha Test', 'Editest']), 'lista esclusi precompilata')
    senza = pg.evaluate("[...document.querySelectorAll('.foglio button, .foglio input, .foglio select, .foglio textarea')].filter(b => !(b.getAttribute('aria-label') || (b.labels && b.labels.length) || b.textContent.trim())).length")
    ok(senza == 0, 'nessun controllo senza nome nel foglio (%d)' % senza)
    ok(not pg.evaluate("document.querySelector('.foglio').scrollWidth > document.querySelector('.foglio').clientWidth"), 'nessuno sforamento orizzontale a 375 px')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
