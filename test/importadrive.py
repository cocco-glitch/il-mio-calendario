# Test v0.58.2: «📥 Importa quiz da Drive» con INNESTI — il pacchetto riconosce dove va (corso e piano che già
# hai), lo propone, si conferma e si può cambiare percorso dopo, senza duplicati. Drive simulato.
# Pacchetti sintetici nello schema 0.58; con REALI=<cartella> usa i file veri (b33v.json … b43v.json).
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

def pacchetto(sotto, titolo, quando):
    ud = sotto.split('.')[0]
    ids = ['biologia-%s-%02d' % (sotto, n) for n in range(1, 13)]
    q = lambda n: {'id': ids[n - 1], 'stepId': 'biologia-' + sotto, 'sottoStep': sotto + ('.1' if n <= 6 else '.2'), 'categoria': 'raffinamento' if n in (5, 6, 12) else 'prioritaria',
                   'livelloCognitivo': 'L%d' % (1 + n % 4), 'tipoItem': 'scelta_multipla', 'domanda': 'Domanda %s n.%d?' % (sotto, n),
                   'opzioni': ['A%d' % n, 'B%d' % n, 'C%d' % n, 'D%d' % n], 'esatta': n % 4, 'spiegazione': 'Spiegazione %d' % n, 'fonte': 'Campbell cap. 7'}
    return {'meta': {'versioneSchema': '0.58', 'materia': 'B', 'unita': 'UD' + ud, 'stepId': 'biologia-' + sotto, 'titolo': titolo},
            'programmaCalendario': {'formatoGeneraMjs': ['B|UD%s|%s|N|%s|%s' % (ud, titolo, sotto, quando)]},
            'sottoSchede': [{'sottoStep': sotto + '.1', 'titolo': titolo + ' I', 'durataBracMin': 45, 'rangeId': ids[:6]},
                            {'sottoStep': sotto + '.2', 'titolo': titolo + ' II', 'durataBracMin': 40, 'rangeId': ids[6:]}],
            'quiz': [q(n) for n in range(1, 13)]}

PK = [('3.3', 'Traduzione', 'Mer 18/11'), ('3.4', 'Folding', 'Mer 18/11'), ('4.1', 'Genetica', 'Sab 21/11'), ('4.2', 'Eredità', 'Lun 23/11'), ('4.3', 'DNA', 'Mar 24/11')]
REALI = os.environ.get('REALI')
FILES, NOMI = {}, {}
for sotto, tit, quando in PK:
    sid = 'f' + sotto.replace('.', '')
    FILES[sid] = json.load(open(os.path.join(REALI, 'b%sv.json' % sotto.replace('.', '')), encoding='utf-8')) if REALI else pacchetto(sotto, tit, quando)
    NOMI[sotto] = 'biologia_%s_quiz_e_calendario_v058.json' % sotto.replace('.', '_')
STUB = """([files, nomi]) => {
  Object.defineProperty(Drive, 'pronto', { get: () => true, configurable: true });
  Drive.cercaCartelle = async () => [{ id: 'cb', name: 'biologia quiz' }, { id: 'zz', name: 'quiz vecchi archivio' }];
  Drive.elencaTutti = async (id) => id === 'cb' ? [...Object.entries(nomi).reverse().map(([s, n]) => ({ id: 'f' + s.replace('.', ''), name: n })), { id: 'x', name: 'note.txt' }] : [];
  Drive.elencaCompleti = async (id) => (await Drive.elencaTutti(id)).map(f => ({ ...f, mimeType: 'application/json', modifiedTime: '2026-11-19T08:00:00Z' }));
  Drive.scaricaTesto = async (id) => JSON.stringify(files[id]);
}"""
OGGI = '2026-11-19'
CONTA = """k => ({ corsi: Studio.pkStep().flatMap(p => p.materie.flatMap(m => m.sottostep.filter(s => s.k === k).map(() => p.id))),
  voci: Studio.pianiAttivi().filter(p => p.modo !== 'raffinamento').flatMap(p => p.giorni.flatMap(g => g.voci.filter(v => v.k === k && !v.speciale).map(v => p.id + '@' + Studio.dataVoce(v, g, p.id)))) })"""

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time=OGGI + 'T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.wait_for_function("Studio.pkStep().some(p => p.id === 'step-3') && Studio.pkPiani().some(p => p.id === 'piano')", timeout=10000)
    pg.evaluate(STUB, [FILES, NOMI])
    prima = pg.evaluate(CONTA, 'B3.3')
    ok(prima['corsi'] == [] and prima['voci'] == ['piano@2026-11-18'], 'prima: B3.3 previsto nel piano il 18/11, nessun corso lo contiene: %s' % prima)
    pg.evaluate("vai('studio')"); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='📥 Importa quiz da Drive').first.click()
    pg.wait_for_selector('.foglio >> text=pacchetti trovati', timeout=5000)
    testo = pg.inner_text('.foglio')
    ok(all(n in testo for n in NOMI.values()) and 'note.txt' not in testo, 'elenco dei 5 pacchetti _v058, solo .json')
    ok(testo.index(NOMI['3.3']) < testo.index(NOMI['4.3']), 'ordine naturale 3.3 → 4.3')

    def importa(sotto, attesi=None):
        k = 'B' + sotto
        pg.get_by_role('button', name='Importa ' + NOMI[sotto]).click()
        pg.get_by_label('Corso di destinazione per ' + k).wait_for(timeout=5000)
        c, pi, g = (pg.get_by_label(x + k).input_value() for x in ('Corso di destinazione per ', 'Piano di destinazione per ', 'Giorno nel piano per '))
        if attesi: ok((c, pi, g) == attesi, '%s riconosciuto → corso «%s», piano «%s», giorno %s (atteso %s)' % (k, c, pi, g, attesi))
        if sotto == '3.3': pg.wait_for_timeout(300); pg.screenshot(path='test/importadrive.png')
        pg.get_by_role('button', name='Inserisci ' + k).click()
        pg.wait_for_function("k => !!Stato.prendi('inn-' + k)", arg=k, timeout=5000)

    importa('3.3', ('step-3', 'piano', OGGI))
    ok('✓ 12 domande in Banca' in pg.inner_text('.foglio') or bool(REALI), 'esito: 12 domande in Banca')
    x = pg.evaluate(CONTA, 'B3.3')
    ok(x == {'corsi': ['step-3'], 'voci': ['piano@' + OGGI]}, 'B3.3 dentro step-3 e nel piano spostato a oggi, una volta sola: %s' % x)
    ok(pg.evaluate("Studio.trovaSotto('B3.3').mat.sottostep.map(s => s.k).join(',')").startswith('B3.1,B3.2,B3.3'), 'B3.3 inserito dopo B3.2')
    ok(pg.evaluate("Dominio.haDomande(Studio.schedeDi(Studio.trovaSotto('B3.3').sub)[0].id)"), 'Banca sulle schede di B3.3')
    pg.evaluate('caricaStrumentiQuiz()')   # blocco 4: Studia ora sta nel chunk su richiesta
    v = pg.evaluate("StudiaOra.componi(120).filter(v => v.k === 'B3.3').map(v => v.tipo + ':' + (v.id || ''))")
    ok(any(s.startswith('scheda:B-3.3.') for s in v), 'Studia ora propone le schede B3.3: %s' % v)
    importa('3.4', ('step-3', 'piano', OGGI))
    importa('4.1', ('', 'piano', '2026-11-21'))
    importa('4.2', ('', 'piano', '2026-11-23'))
    importa('4.3', ('', 'piano', '2026-11-24'))
    ud4 = pg.evaluate("(Studio.pkStep().find(p => p.id === 'drv-ud-4') || {materie: []}).materie.flatMap(m => m.sottostep.map(s => s.k))")
    ok(ud4 == ['B4.1', 'B4.2', 'B4.3'], 'B4.1–4.3 insieme nel corso «Step 4 (UD4) · da Drive», in ordine: %s' % ud4)
    x = [pg.evaluate(CONTA, 'B4.%d' % i)['voci'] for i in (1, 2, 3)]
    ok(x == [['piano@2026-11-21'], ['piano@2026-11-23'], ['piano@2026-11-24']], 'B4.x nel piano nei giorni 21/23/24, senza duplicati: %s' % x)
    ok(pg.evaluate("Stato.tutti('pacchetto').filter(r => /^pk-drv-/.test(r.id)).length") == 0, 'nessun percorso a parte salvato (solo innesti)')
    # reimportare non duplica
    pg.get_by_role('button', name='Importa ' + NOMI['3.3']).click(); pg.get_by_label('Corso di destinazione per B3.3').wait_for()
    pg.get_by_role('button', name='Inserisci B3.3').click(); pg.wait_for_timeout(300)
    ok(pg.evaluate(CONTA, 'B3.3') == {'corsi': ['step-3'], 'voci': ['piano@' + OGGI]} and pg.evaluate("Stato.tutti('innesto').length") == 5, 'reimportare aggiorna senza duplicare')
    # cambia percorso: B3.4 al 25/11 nel piano «Importati da Drive»; B4.2 nel corso step-3
    pg.get_by_role('button', name='Cambia percorso B3.4').click()
    pg.get_by_label('Piano di destinazione per B3.4').select_option(''); pg.get_by_label('Giorno nel piano per B3.4').fill('2026-11-25')
    pg.get_by_role('button', name='Sposta qui B3.4').click(); pg.wait_for_timeout(300)
    x = pg.evaluate(CONTA, 'B3.4')
    ok(x == {'corsi': ['step-3'], 'voci': ['piano@2026-11-18', 'drv-piano@2026-11-25']} or x == {'corsi': ['step-3'], 'voci': ['drv-piano@2026-11-25', 'piano@2026-11-18']}, 'B3.4 nel piano «Importati» il 25/11; il piano originale torna com\'era: %s' % x)
    pg.get_by_role('button', name='Cambia percorso B3.4').click()
    pg.get_by_label('Piano di destinazione per B3.4').select_option('piano'); pg.get_by_label('Giorno nel piano per B3.4').fill('2026-11-26')
    pg.get_by_role('button', name='Sposta qui B3.4').click(); pg.wait_for_timeout(300)
    ok(pg.evaluate(CONTA, 'B3.4') == {'corsi': ['step-3'], 'voci': ['piano@2026-11-26']}, 'B3.4 rimesso nel piano, spostato al 26/11, una volta sola')
    pg.get_by_role('button', name='Cambia percorso B4.2').click()
    pg.get_by_label('Corso di destinazione per B4.2').select_option('step-3')
    pg.get_by_role('button', name='Sposta qui B4.2').click(); pg.wait_for_timeout(300)
    ok(pg.evaluate(CONTA, 'B4.2')['corsi'] == ['step-3'] and pg.evaluate("Studio.trovaSotto('B4.2').pk.id") == 'step-3', 'B4.2 spostato nel corso step-3 (sparito dal corso UD4)')
    ok(pg.evaluate("Dominio.haDomande(Studio.schedeDi(Studio.trovaSotto('B4.2').sub)[0].id)"), 'le domande seguono B4.2')
    # l'editor dei corsi non salva gli innesti dentro il corso
    pg.evaluate("salvaPacchetto(JSON.parse(JSON.stringify(Studio.pkStep().find(p => p.id === 'step-3'))))")
    ok(pg.evaluate("Stato.rec.get('pk-step-3').contenuto.materie.flatMap(m => m.sottostep).every(s => !s.innesto)"), 'salvaPacchetto(step-3) non salva gli innesti')
    ok(pg.evaluate(CONTA, 'B3.3')['corsi'] == ['step-3'], '…ma restano visibili (applicati in lettura)')
    # togli
    pg.get_by_role('button', name='Togli B4.3').click(); pg.get_by_role('button', name='Togli', exact=True).last.click(); pg.wait_for_timeout(300)
    ok(pg.evaluate(CONTA, 'B4.3') == {'corsi': [], 'voci': ['piano@2026-11-24']} and not pg.evaluate("Dominio.haDomande('B-4.3.1-1')"), 'Togli B4.3: sparisce dal corso e dalla Banca; il piano originale resta: %s' % pg.evaluate(CONTA, 'B4.3'))
    # migrazione dei pacchetti v0.58.1 a parte
    pg.evaluate("""() => { Stato.salva({ id: 'pk-drv-b-5.1', type: 'pacchetto', updatedAt: 0, contenuto: { tipo: 'step', id: 'drv-b-5.1', step: 5, titolo: 'B 5.1', aggiornato: '', proprio: true, descrizione: 'Importato da Drive · UD5', risorse: { libri: {}, quiz: {} },
      materie: [{ m: 'B', nome: 'Biologia', libro: '', sottostep: [{ k: 'B5.1', n: '5.1', titolo: 'Vecchio', posizione: '', microstep: [{ n: '5.1.1', schede: [{ id: 'B-5.1.1-1', k: 1, n: 1, titolo: 'V', tipo: 'P', problemi: false, pagine: '', quizFile: '' }] }] }] }] } });
      Stato.salva({ id: 'bq-B-5.1.1-1', type: 'bancaimc', updatedAt: 0, sk: 'B-5.1.1-1', pk: 'drv-b-5.1', domande: [{ id: 'q-drv-x', sk: 'B-5.1.1-1', t: 'mcq', lv: 'Applicativo', q: 'v?', o: ['a', 'b'], e: '' }] }, true); Stato.notifica(); }""")
    pg.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(e => e.remove()); ImportaDrive.gestisci()"); pg.wait_for_timeout(300)
    ok(pg.evaluate("!Stato.prendi('pk-drv-b-5.1') && Stato.prendi('inn-B5.1') && Stato.prendi('bq-B-5.1.1-1').pk === 'inn-B5.1' && Studio.trovaSotto('B5.1').pk.id === 'drv-ud-5'"), 'migrazione v0.58.1: corso a parte → innesto, Banca conservata')
    ok('Cambia percorso' in pg.inner_text('.foglio') and pg.get_by_role('button', name='Cambia percorso B5.1').count() == 1, '«🧭 Sposta quiz importati» elenca gli innesti')
    pg.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(e => e.remove()); vai('oggi')"); pg.wait_for_timeout(300)
    oggi = pg.inner_text('body')
    ok('3.3' in oggi, 'Oggi: B3.3 in «Studio di oggi»')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
