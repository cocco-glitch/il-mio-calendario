# Test v0.58.3: «📥 Importa quiz da Drive» A PARTI (Drive simulato, formato ampliato del master prompt).
# Step B3.3 consegnato in 3 parti (2 schede = 36 domande ciascuna) + file di chiusura. Con 2 parti su 3 l'elenco
# mostra UNA voce «Biologia 3.3 · … · 2/3 parti · Mancano parti: S05, S06»; aggiunta la parte 3 diventa «Completo».
# Importa → Oggi / Studia ora; la scheda ha «🧩 Quiz nell'app»; errore con certezza alta → illusione di competenza
# con la spiegazione del distrattore (spiegazioneDistrattori) e la domanda finisce in «🎯 Quiz da rifare».
# Misura anche il salvataggio di ~1.700 domande (5 step × ~340) in IndexedDB.
import os, json, time, http.server, threading, functools
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

LIV = [1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 2]
def domanda(step, s, i):
    es = (i + s) % 4
    opz = ['Opzione %s-%d-%d n.%d' % (step, s, i, j) for j in range(4)]
    opz[es] = 'Giusta %s S%02d D%02d' % (step, s, i)
    return {'id': 'biologia-%s-S%02d-%02d' % (step, s, i), 'stepId': 'biologia-' + step, 'sottoStep': step + ('.1' if s <= 3 else '.2'), 'scheda': 'biologia-%s-S%02d' % (step, s),
            'categoria': 'raffinamento' if s % 3 == 0 else 'prioritaria', 'livello': 'L%d' % LIV[(i - 1) % 18], 'livelloCognitivo': LIV[(i - 1) % 18],
            'domanda': 'Domanda %s scheda %d numero %d?' % (step, s, i), 'opzioni': opz, 'esatta': es, 'spiegazione': 'Spiegazione %d' % i,
            'spiegazioneDistrattori': ['Trappola numero %d di S%02d D%02d' % (k, s, i) for k in (1, 2, 3)], 'distractorTypes': ['misconception', 'inversione_causa', 'caso_limite'],
            'sourceRef': 'Campbell, cap. 7, p. %d' % (100 + s), 'fonte': 'Campbell cap. 7 p. %d' % (100 + s), 'erroreTipico': 'confonde', 'coppiaGemellaId': ('g%d' % s) if i <= 2 and s % 3 == 1 else None}
def parte(step, a, b, n=18): return {'parte': 'biologia-%s-s%d-%d' % (step, a, b), 'quiz': [domanda(step, s, i) for s in (a, b) for i in range(1, n + 1)]}
def chiusura(step, tot, dom):
    sch = lambda l: ['biologia-%s-S%02d' % (step, s) for s in l]
    meta = {'stepId': 'biologia-' + step, 'materia': 'biologia', 'unita': 'UD' + step.split('.')[0], 'titolo': 'Step ' + step, 'domandeTotali': dom, 'ripartizioneSchede': {'totale': tot}}
    half = tot // 2
    return {'meta': meta, 'conteggi': {'domande': dom}, 'programmaCalendario': {'pianoStrutturato': {'durataTotaleMin': 95,
        'sottoSchede': [{'codice': step + '.1', 'titolo': 'Prima metà', 'durataBracMin': 45, 'schedePrioritarie': sch([s for s in range(1, half + 1) if s % 3]), 'schedeRaffinamento': sch([s for s in range(1, half + 1) if not s % 3])},
                        {'codice': step + '.2', 'titolo': 'Seconda metà', 'durataBracMin': 50, 'schedePrioritarie': sch([s for s in range(half + 1, tot + 1) if s % 3]), 'schedeRaffinamento': sch([s for s in range(half + 1, tot + 1) if not s % 3])}],
        'ancoraggiRipassoFSRS': [{'intervallo': '+1g', 'target': sch([1, 2])}, {'intervallo': '+3g', 'target': sch([3])}, {'intervallo': '+7g', 'target': sch(range(1, tot + 1))}]}}}

FILES = {'p1': parte('3.3', 1, 2), 'p2': parte('3.3', 3, 4), 'c33': chiusura('3.3', 6, 108)}
ELENCO = [{'id': 'p1', 'name': 'gemini parte 1.json'}, {'id': 'c33', 'name': 'chiusura 3.3.json'}, {'id': 'p2', 'name': 'gemini parte 2.json'}]
STUB = """([files, elenco]) => {
  Object.defineProperty(Drive, 'pronto', { get: () => true, configurable: true });
  window.__files = files; window.__elenco = elenco;
  Drive.cercaCartelle = async () => [{ id: 'cb', name: 'biologia quiz' }];
  Drive.elencaTutti = async (id) => id === 'cb' ? window.__elenco.map(f => ({ id: f.id, name: f.name })) : [];
  Drive.elencaCompleti = async (id) => id === 'cb' ? window.__elenco.map((f, i) => ({ id: f.id, name: f.name, mimeType: 'application/json', modifiedTime: '2026-11-19T0' + i + ':00:00Z' })) : [];
  Drive.scaricaTesto = async (id) => typeof window.__files[id] === 'string' ? window.__files[id] : JSON.stringify(window.__files[id]);
}"""
OGGI = '2026-11-19'

def apri(pg):
    pg.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(e => e.remove()); ImportaDrive.apri()")
    pg.wait_for_selector('.foglio >> text=/pacchett[oi] trovat/', timeout=8000)
    return pg.inner_text('.foglio')

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.add_init_script("try { localStorage.setItem('imc-quiz-modo','neuro') } catch (e) {}")
    pg.clock.install(time=OGGI + 'T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.wait_for_function("typeof ImportaDrive === 'object' && typeof ImportaParti === 'object'", timeout=10000)
    pg.evaluate(STUB, [FILES, ELENCO])
    # 1) 2 parti su 3 + chiusura → una voce, mancano S05/S06
    t = apri(pg)
    ok('Biologia 3.3 · 6 schede · 72 domande · 2/3 parti' in t, 'una voce per lo step: «Biologia 3.3 · 6 schede · 72 domande · 2/3 parti»')
    ok('Mancano parti: schede S05, S06' in t, 'stato: mancano parti S05, S06')
    ok('gemini parte 1.json' not in t, 'le parti non compaiono come file separati')
    # 2) aggiungo la parte 3 (e un file rotto) → completo
    pg.evaluate("() => { window.__files.p3 = %s; window.__files.rotto = '{ non è json'; window.__elenco.push({ id: 'p3', name: 'gemini parte 3.json' }, { id: 'rotto', name: 'rotto.json' }); }" % json.dumps(parte('3.3', 5, 6), ensure_ascii=False))
    t = apri(pg)
    ok('Biologia 3.3 · 6 schede · 108 domande · 3/3 parti' in t and 'Completo' in t, 'aggiunta la parte 3: «108 domande · 3/3 parti · ✅ Completo»')
    ok('rotto.json' in t and 'saltato' in t, 'JSON illeggibile: mostrato e saltato, non blocca lo step')
    ok('Controllo qualità superato' in t or 'avvisi di qualità' in t, 'riepilogo qualità prima di «Importa»')
    pg.screenshot(path='test/importaparti.png')
    # 3) importa → Oggi / Studia ora
    pg.get_by_role('button', name='Importa Biologia 3.3').click()
    pg.get_by_label('Corso di destinazione per B3.3').wait_for(timeout=5000)
    pg.get_by_label('Giorno nel piano per B3.3').fill(OGGI)
    pg.get_by_role('button', name='Inserisci B3.3').click()
    pg.wait_for_function("!!Stato.prendi('inn-B3.3')", timeout=5000)
    inn = pg.evaluate("(() => { const x = Stato.prendi('inn-B3.3'); return { banche: x.banche.length, rap: !!x.rapporto, rip: x.ripassi.map(r => r.giorni + ':' + (r.target || []).length) }; })()")
    ok(inn == {'banche': 6, 'rap': True, 'rip': ['1:2', '3:1', '7:6']}, '6 schede in Banca, rapporto salvato, ripassi +1/+3/+7 con target: %s' % inn)
    ok('108 domande in Banca' in pg.inner_text('.foglio'), 'esito: 108 domande in Banca')
    pg.evaluate('caricaStrumentiQuiz()')   # blocco 4: Studia ora sta nel chunk su richiesta
    v = pg.evaluate("StudiaOra.componi(120).filter(v => v.k === 'B3.3').map(v => v.tipo + ':' + (v.id || ''))")
    ok(any(s.startswith('scheda:B-3.3.') for s in v), 'Studia ora propone le schede B3.3: %s' % v)
    pg.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(e => e.remove()); vai('oggi')"); pg.wait_for_timeout(300)
    ok('3.3' in pg.inner_text('body'), 'Oggi: B3.3 in «Studio di oggi»')
    # 4) reimportare (anche dopo aver tolto una parte da Drive) non perde né duplica
    pg.evaluate("() => { window.__elenco = window.__elenco.filter(f => f.id !== 'p1'); }")
    apri(pg)
    pg.get_by_role('button', name='Importa Biologia 3.3').click(); pg.get_by_label('Corso di destinazione per B3.3').wait_for()
    pg.get_by_role('button', name='Inserisci B3.3').click(); pg.wait_for_timeout(400)
    n = pg.evaluate("Stato.prendi('inn-B3.3').banche.length + '/' + Stato.tutti('bancaimc').filter(r => /^B-3\\.3/.test(r.sk)).reduce((a, r) => a + r.domande.length, 0) + '/' + Stato.tutti('innesto').length")
    ok(n == '6/108/1', 'reimport con una parte in meno: le schede già importate restano, nessun duplicato: %s' % n)
    # 5) scheda → «🧩 Quiz nell'app» → errore con certezza alta
    pg.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(e => e.remove()); (() => { const t = trovaScheda('B-3.3.1-1'); apriScheda(t.pk, t.m, t.micro, t.s); })()")
    pg.get_by_role('button', name="Quiz nell'app").click()
    pg.wait_for_selector('.qz-domanda', timeout=8000)
    ok(pg.locator('.qz-cert [data-cert]').count() == 3, 'Allenamento Neuro: passo di certezza')
    pg.click('.qz-cert [data-cert="3"]')
    bott = pg.locator('.qz-opz-b')
    for i in range(bott.count()):
        if 'Giusta' not in bott.nth(i).inner_text(): bott.nth(i).click(); break
    pg.wait_for_timeout(400)
    corpo = pg.inner_text('body')
    ok('Illusione di competenza' in corpo and 'Trappola numero' in corpo, 'certezza alta + errore: illusione di competenza con la spiegazione del distrattore')
    rif = pg.evaluate("QuizRifare.dovute('2026-11-19').map(s => s.sk)")
    ok('B-3.3.1-1' in rif, 'la domanda sbagliata è in «🎯 Quiz da rifare»: %s' % rif)
    sd = pg.evaluate("(async () => (await QuizRifare.domande()).domande.filter(d => d.sk === 'B-3.3.1-1').map(d => Array.isArray(d.spiegazioneDistrattori) ? d.spiegazioneDistrattori.length : Object.keys(d.spiegazioneDistrattori || {}).length))()")
    ok(sd and all(x == 3 for x in sd), '…con le 3 spiegazioneDistrattori: %s' % sd)
    # 6) misura: ~1.700 domande (5 step × 342) tradotte e salvate
    grandi = {}
    for k, st in enumerate(['3.4', '4.1', '4.2', '4.3', '4.4']):
        for a in range(1, 19, 2): grandi['g%d-%d' % (k, a)] = parte(st, a, a + 1, 19)
        grandi['gc%d' % k] = chiusura(st, 18, 342)
    ms = pg.evaluate("""async (files) => {
      const letti = Object.entries(files).map(([id, j]) => ({ id, name: id, cartella: 'biologia quiz', modificato: '2026-11-19T00:00:00Z', tipo: ImportaParti.classifica(j), step: ImportaParti.stepDi(j), json: j }));
      const t0 = performance.now(); const gruppi = ImportaParti.raggruppa(letti); let dom = 0;
      for (const g of gruppi) { const { t, rapporto } = ImportaDrive.preparaGruppo(g); ImportaDrive.salva(t, { corso: '', piano: '', data: ymd(oggi()) }, g.step, { accumula: true, rapporto }); dom += t.domande; }
      const t1 = performance.now(); await Stato.flush?.(); const t2 = performance.now();
      const b = Stato.tutti('bancaimc').reduce((a, r) => a + r.domande.length, 0);
      return { dom, banca: b, ms: Math.round(t1 - t0), flush: Math.round(t2 - t1), gruppi: gruppi.length };
    }""", grandi)
    print('    misura import: %s' % ms)
    ok(ms['dom'] == 1710 and ms['banca'] >= 1710 + 108, '~1.700 domande importate in Banca (IndexedDB): %s' % ms)
    ok(ms['ms'] < 3000, 'import di 1.710 domande in %d ms (< 3 s)' % ms['ms'])
    pg.evaluate("vai('oggi')"); pg.wait_for_timeout(200)
    t0 = time.time(); dur = pg.evaluate("(() => { const t = performance.now(); vai('studio'); vai('oggi'); return performance.now() - t; })()")
    ok(dur < 260, 'Studio → Oggi con 6 step importati: %.0f ms' % dur)

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
