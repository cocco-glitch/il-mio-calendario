# Test v0.58.1: «📥 Importa quiz da Drive» — elenco dei pacchetti nelle cartelle «… quiz» (Drive simulato),
# un tocco → corso B3.3 + Banca domande + piano: lo step entra in Oggi / Studia ora.
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

def pacchetto(sotto, titolo):
    q = lambda n, es: {'id': 'biologia-%s-%02d' % (sotto, n), 'livelloCognitivo': 1 + n % 4, 'tipoItem': 'scelta_multipla', 'domanda': 'Domanda %s n.%d?' % (sotto, n),
                       'opzioni': ['A%d' % n, 'B%d' % n, 'C%d' % n, 'D%d' % n], 'esatta': es, 'spiegazione': 'Spiegazione %d' % n, 'fonte': 'Campbell cap. 7'}
    return {'meta': {'schemaVersion': 2, 'materia': 'Biologia', 'codiceMateria': 'B', 'unitaDidattica': 'UD3', 'sottoStep': sotto, 'titolo': titolo},
            'programmaCalendario': {'formatoGeneraMjs': ['B|UD3|%s|N|%s|Mer 18/11' % (titolo, sotto)], 'pianoStrutturato': {'durataTotaleMin': 90,
                'sottoSchede': [{'codice': sotto + '.1', 'titolo': titolo + ' I', 'schedePrioritarie': ['biologia-%s-%02d' % (sotto, i) for i in range(1, 7)], 'schedeRaffinamento': ['biologia-%s-%02d' % (sotto, i) for i in range(7, 9)]},
                                {'codice': sotto + '.2', 'titolo': titolo + ' II', 'schedePrioritarie': ['biologia-%s-%02d' % (sotto, i) for i in range(9, 13)]}],
                'ancoraggiRipassoFSRS': [{'intervallo': '+1g', 'target': []}, {'intervallo': '+3g', 'target': []}]}},
            'quiz': [q(n, n % 4) for n in range(1, 13)]}

FILES = {'f33': pacchetto('3.3', 'Membrane e trasporto'), 'f34': pacchetto('3.4', 'Energia e metabolismo')}
STUB = """(files) => {
  Object.defineProperty(Drive, 'pronto', { get: () => true, configurable: true });
  Drive.cercaCartelle = async () => [{ id: 'cb', name: 'biologia quiz' }, { id: 'cf', name: 'fisica quiz' }, { id: 'zz', name: 'quiz vecchi archivio' }];
  Drive.elencaTutti = async (id) => id === 'cb' ? [{ id: 'f34', name: 'biologia_3_4_quiz_e_calendario.json' }, { id: 'f33', name: 'biologia_3_3_quiz_e_calendario.json' }, { id: 'x', name: 'note.txt' }] : [];
  Drive.scaricaTesto = async (id) => JSON.stringify(files[id]);
}"""

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-19T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.evaluate(STUB, FILES)
    pg.evaluate("vai('studio')"); pg.wait_for_timeout(200)
    b = pg.get_by_role('button', name='📥 Importa quiz da Drive')
    ok(b.count() == 1, 'pulsante «📥 Importa quiz da Drive» nella barra di Studio')
    b.click(); pg.wait_for_selector('.foglio >> text=pacchetti trovati', timeout=5000)
    testo = pg.inner_text('.foglio')
    ok('biologia_3_3_quiz_e_calendario.json' in testo and 'biologia_3_4_quiz_e_calendario.json' in testo, 'elenco esplicito dei pacchetti Drive')
    ok('note.txt' not in testo and testo.count('biologia quiz') == 2, 'solo .json, con la cartella di provenienza')
    ok(testo.index('biologia_3_3') < testo.index('biologia_3_4'), 'ordine naturale 3.3 → 3.4')
    pg.wait_for_timeout(500); pg.screenshot(path='test/importadrive.png')
    pg.get_by_role('button', name='Importa biologia_3_3_quiz_e_calendario.json').click()
    pg.wait_for_selector('.foglio >> text=domande in Banca', timeout=5000)
    ok('✓ 12 domande in Banca' in pg.inner_text('.foglio'), 'esito: 12 domande in Banca')
    ok(pg.evaluate("!!Studio.trovaSotto('B3.3') && Dominio.haDomande('B-3.3.1-1') && Dominio.haDomande('B-3.3.1-2') && Dominio.haDomande('B-3.3.2-1')"), 'corso B3.3 con schede P/R e Banca')
    d = pg.evaluate("Dominio.domandeDi('B-3.3.1-1')[0]")
    ok(d and d['q'] == 'Domanda 3.3 n.1?' and d['o'][0] == 'B1' and d['e'] == 'Spiegazione 1' and d['r'] == 'Campbell cap. 7', 'esatta → o[0], spiegazione → e, fonte → r: %s' % (d and d['o']))
    ok(pg.evaluate("Studio.vociDelGiorno(new Date()).some(x => x.v.k === 'B3.3' && x.p.id === 'drv-piano-b-3.3')"), 'piano: B3.3 nella coda di oggi')
    v = pg.evaluate("StudiaOra.componi(90).filter(v => v.k === 'B3.3').map(v => v.tipo + ':' + (v.id || ''))")
    ok(any(x.startswith('scheda:B-3.3.1-1') for x in v), 'Studia ora propone le schede B3.3: %s' % v)
    # reimportare non duplica
    pg.get_by_role('button', name='Importa biologia_3_3_quiz_e_calendario.json').click(); pg.wait_for_timeout(300)
    ok(pg.evaluate("Stato.tutti('pacchetto').filter(r => /drv-/.test(r.id)).length") == 2, 'reimportare aggiorna senza duplicare')
    pg.get_by_role('button', name='Importa biologia_3_4_quiz_e_calendario.json').click()
    pg.wait_for_function("!!Studio.trovaSotto('B3.4')", timeout=5000)
    pg.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(e => e.remove()); vai('oggi')"); pg.wait_for_timeout(300)
    oggi = pg.inner_text('body')
    ok('3.3' in oggi and '3.4' in oggi, 'Oggi: entrambi gli step importati in «Studio di oggi»')
    ok(pg.evaluate("Studio.vociDelGiorno(new Date(2026, 10, 20)).some(x => x.v.k === 'B3.3' && x.v.speciale)"), 'ripasso FSRS +1g domani')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
