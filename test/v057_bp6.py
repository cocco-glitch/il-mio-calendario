# Test v0.57 (BP6): XSS di esc()/md(), DB (02-db), Privacy (A6), allegati fuori da dati.json (A14),
# parser JSON unico (A15), ritenzione unica (A16), tetto LRU della banca quiz, «ricordami di…», corso non duplicato,
# chiedi() come <dialog> (Esc + focus), ingresso unico «＋ Crea piano», primi passi e PianiAI.bottoni.
import os, http.server, threading, functools
from playwright.sync_api import sync_playwright
RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128
http.server.SimpleHTTPRequestHandler.protocol_version = 'HTTP/1.1'
class Muto(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Muto, directory=RADICE))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err = []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844}, locale='it-IT', timezone_id='Europe/Rome')
    pe = []; pg.on('pageerror', lambda e: pe.append(str(e)))
    pg.goto(URL); pg.wait_for_function("typeof Stato === 'object' && typeof Allegati === 'object' && document.querySelector('nav.tabbar')")

    # --- XSS: esc() e md() ---
    x = pg.evaluate("""(() => {
      const P = ['<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', "' onmouseover='alert(1)", '<svg/onload=alert(1)>',
                 '[clic](javascript:alert(1))', '[x](https://a.it" onclick="alert(1))', '&lt;b&gt;'];
      const d = document.createElement('div'), r = {};
      r.esc = P.map(s => esc(s));
      r.escOk = P.every(s => { const e = esc(s); return !/[<>"']/.test(e); });
      r.attr = P.every(s => { d.innerHTML = "<span title='" + esc(s) + "'></span>"; const sp = d.firstChild; return d.childNodes.length === 1 && sp.attributes.length === 1 && sp.getAttribute('title') === s; });
      r.md = P.every(s => { d.innerHTML = md(s); return !d.querySelector('script,img,svg,[onerror],[onload],[onclick],[onmouseover]') && ![...d.querySelectorAll('a')].some(a => !/^https?:/.test(a.getAttribute('href') || '')); });
      r.doppio = esc('&lt;') === '&amp;lt;';
      return r;
    })()""")
    ok(x['escOk'], 'esc(): nessun < > " \' superstite')
    ok(x['attr'], 'esc() in attributo tra apici singoli o doppi: nessun attributo iniettato')
    ok(x['md'], 'md(): niente tag/eventi iniettati, link solo http(s)')
    ok(x['doppio'], 'esc() riesegue l\'escape di & (niente decodifica)')

    # --- 02-db: salva / rileggi / rimuovi ---
    d = pg.evaluate("""(async () => {
      const r = { id: 'tst-db-1', type: 'nota', updatedAt: 1, titolo: 'Prova <db>', testo: 'x'.repeat(5000) };
      await DB.salva([r]); let tutti = await DB.apri(); const letto = tutti.find(x => x.id === r.id);
      await DB.rimuovi([r.id]); tutti = await DB.apri();
      return { modo: DB.modo, letto: !!letto && letto.titolo === r.titolo && letto.testo.length === 5000, via: !tutti.some(x => x.id === r.id) };
    })()""")
    ok(d['modo'] == 'idb', 'DB su IndexedDB (%s)' % d['modo'])
    ok(d['letto'], 'DB: record salvato e riletto identico')
    ok(d['via'], 'DB: record rimosso')

    # --- A15: parser JSON unico ---
    j = pg.evaluate("""(() => ({
      recinto: JsonAI.leggi('```json\\n{"a": 1, "b": [1,2,],}\\n```'),
      latex: JsonAI.parseSicuro('{"f": "\\\\frac{1}{2}"}'),
      tronco: JsonAI.recuperaArrayParziale('{"unita": [{"t": "uno"}, {"t": "due"}, {"t": "tr', 'unita'),
      file: JsonAI.leggiFile('\\ufeff{"x": 1}'),
      rotto: (() => { try { return JsonAI.leggi('niente json qui'); } catch (e) { return 'errore'; } })(),
      stesso: IA.parseJsonSicuro === undefined ? false : JSON.stringify(IA.parseJsonSicuro('{"k": 2}')) === JSON.stringify(JsonAI.parseSicuro('{"k": 2}')),
    }))()""")
    ok(j['recinto'] == {'a': 1, 'b': [1, 2]}, 'JsonAI.leggi: recinto ``` e virgole finali (%s)' % j['recinto'])
    ok(j['latex'] == {'f': '\\frac{1}{2}'}, 'JsonAI.parseSicuro: LaTeX \\frac preservato (%s)' % j['latex'])
    ok(isinstance(j['tronco'], list) and [u['t'] for u in j['tronco']] == ['uno', 'due'], 'JsonAI.recuperaArrayParziale: risposta troncata (%s)' % j['tronco'])
    ok(j['file'] == {'x': 1}, 'JsonAI.leggiFile: BOM tollerato (.imcpack)')
    ok(j['rotto'] in (None, 'errore'), 'JsonAI.leggi: testo senza JSON non inventa dati (%s)' % j['rotto'])
    ok(j['stesso'], 'IA.parseJsonSicuro delega a JsonAI')

    # --- A16: ritenzione unica ---
    r = pg.evaluate("""(() => { const g = ymd(new Date()), base = Ripassi.ritenzione(g);
      return { base, min: Ripassi.ritenzione(g, 0.97), basso: Ripassi.ritenzione(g, 0.1), alto: Ripassi.ritenzione(g, 2),
        k: [Pianificatore.intervalliFsrs ? Pianificatore.intervalliFsrs(2, 0.9, Ripassi.intervallo) : null, Pianificatore.intervalliFsrs ? Pianificatore.intervalliFsrs(2, 0.97, Ripassi.intervallo) : null] }; })()""")
    ok(0.5 <= r['base'] <= 0.99, 'Ripassi.ritenzione nel range (%s)' % r['base'])
    ok(abs(r['min'] - 0.97) < 1e-9 and r['basso'] == r['base'] and r['alto'] == 0.99, 'ritenzione(giorno, minimo): rispetta il minimo e il tetto 0,99 (%s)' % r)
    if r['k'][0] is not None:
        a, c = r['k']
        ok(isinstance(a, list) and isinstance(c, list) and sum(c) < sum(a), 'FSRS del pianificatore: ritenzione più alta → intervalli più brevi (%s vs %s)' % (a, c))

    # --- A6 + A14: allegati fuori da dati.json, svuotati al cambio account ---
    a = pg.evaluate("""(async () => {
      const png = 'data:image/png;base64,' + btoa('x'.repeat(3000));
      const ap = Appunti.nuovo({ titolo: 'Con foto', testo: '' }); ap.mano = { h: 800, tr: [], im: [{ s: png, x: 0, y: 0, w: 100, h: 100 }] };
      Stato.salva(ap); const n = await Allegati.migra(); const dopo = Stato.prendi(ap.id);
      const rif = dopo.mano.im[0].s, json = JSON.stringify(Stato.esporta());
      const ris = await Allegati.risolvi(rif);
      const r2 = Allegati.rifDi(png) === rif, att = Allegati.attesa().includes(rif);
      localStorage.setItem('imc-ai-keys', '{"groq":"k"}'); localStorage.setItem('imc-banca-zz', 'x'); localStorage.setItem('pref-mano', '{}');
      await Privacy.svuotaAccount();
      const dopoSv = await Allegati.risolvi(rif);
      return { n, rif, ris: ris === png, r2, att, leggero: !json.includes('base64,' + btoa('x'.repeat(3000)).slice(0, 40)),
        chiavi: localStorage.getItem('imc-ai-keys'), banca: localStorage.getItem('imc-banca-zz'), pref: localStorage.getItem('pref-mano'),
        dopoSv, attesaDopo: Allegati.attesa().length };
    })()""")
    ok(a['n'] >= 1 and a['rif'].startswith('imc-img:'), 'migrazione: data-URL → riferimento imc-img: (%s)' % a['rif'][:20])
    ok(a['leggero'], 'dati.json non contiene più i byte dell\'immagine')
    ok(a['ris'] and a['r2'], 'riferimento risolto da IndexedDB, hash stabile')
    ok(a['att'], 'allegato in coda per l\'upload su Drive')
    ok(a['chiavi'] is None and a['banca'] is None, 'cambio account: via chiavi AI e cache della banca quiz')
    ok(a['pref'] == '{}', 'cambio account: restano le preferenze del dispositivo')
    ok(a['dopoSv'] == '' and a['attesaDopo'] == 0, 'cambio account: archivio allegati e coda svuotati')

    # --- tetto LRU della banca quiz ---
    l = pg.evaluate("""(() => {
      for (let i = 0; i < 8; i++) localStorage.setItem('imc-banca-t' + i, 'y'.repeat(1000));
      localStorage.setItem('imc-banca-uso', JSON.stringify(Object.fromEntries([...Array(8)].map((_, i) => ['imc-banca-t' + i, i + 1]))));
      const tolte = Banca.potaCopie('imc-banca-t0', 3, 1e9);
      const resta = [...Array(8)].map((_, i) => localStorage.getItem('imc-banca-t' + i) !== null);
      Banca.salvaCopia('imc-banca-nuova', 'z'); const nuova = localStorage.getItem('imc-banca-nuova');
      return { tolte, resta, nuova };
    })()""")
    ok(l['tolte'] == 5, 'LRU: tolte le 5 copie meno usate (%s)' % l['tolte'])
    ok(l['resta'] == [True, False, False, False, False, False, True, True], 'LRU: restano la protetta e le 2 più recenti (%s)' % l['resta'])
    ok(l['nuova'] == 'z', 'salvaCopia scrive la copia')

    # --- «ricordami di …» ---
    q = pg.evaluate("[interpreta('ricordami di comprare il latte domani'), interpreta('promemoria: chiamare Luca'), interpreta('ricorda che domani c\\'è lo sciopero')]")
    ok(q[0] and q[0]['tipo'] == 'task' and q[0]['titolo'] == 'Comprare il latte', 'ricordami di… → «Comprare il latte» (%s)' % (q[0] and q[0]['titolo']))
    ok(q[1] and q[1]['titolo'] == 'Chiamare Luca', 'promemoria: … → «Chiamare Luca» (%s)' % (q[1] and q[1]['titolo']))
    ok(q[2] and not q[2]['titolo'].lower().startswith('che '), 'ricorda che… senza «Che» (%s)' % (q[2] and q[2]['titolo']))

    # --- corso non duplicato in «Crea piano dal libro» ---
    c = pg.evaluate("""(() => {
      const o = { nome: 'Storia moderna', testo: '1 Rinascimento .... 1\\n2 Riforma .... 20\\n3 Assolutismo .... 40', esame: ymd(piuGiorni(new Date(), 40)), oreGiorno: 2 };
      const a = Dominio.creaPiano(o), b = Dominio.creaPiano(o);
      return { stesso: a.pk.id === b.pk.id, corsi: Studio.pkStep().filter(p => p.titolo === a.pk.titolo).length,
        esami: Stato.tutti('esame').filter(e => e.nome === 'Esame di Storia moderna').length };
    })()""")
    ok(c['stesso'] and c['corsi'] == 1, 'stesso nome → stesso corso, nessun duplicato (%s)' % c)
    ok(c['esami'] == 1, 'esame aggiornato, non duplicato (%s)' % c['esami'])

    # --- chiedi() come <dialog>: Esc, focus, ripristino del focus ---
    pg.evaluate("vai('oggi')"); pg.wait_for_timeout(100)
    pg.evaluate("document.querySelector('nav.tabbar button').focus(); window.__esito = 'attesa'; void chiedi('Prova', [{ testo: 'Uno', valore: '1' }, { testo: 'Due', valore: '2' }]).then(v => window.__esito = v)")
    pg.wait_for_selector('dialog.dialogo-sfondo[open]')
    ok(pg.evaluate("document.querySelector('dialog.dialogo-sfondo').matches(':modal')"), 'chiedi(): <dialog> modale (showModal)')
    ok(pg.evaluate("document.activeElement && document.activeElement.closest('dialog') !== null && document.activeElement.textContent === 'Uno'"), 'chiedi(): focus sul primo pulsante')
    ok(pg.evaluate("!!document.querySelector('dialog.dialogo-sfondo').getAttribute('aria-labelledby')"), 'chiedi(): nome accessibile (aria-labelledby)')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    ok(pg.evaluate("window.__esito") is None and pg.locator('dialog.dialogo-sfondo').count() == 0, 'chiedi(): Esc chiude e risponde null')
    ok(pg.evaluate("document.activeElement === document.querySelector('nav.tabbar button')"), 'chiedi(): focus ripristinato')

    # --- ingresso unico «＋ Crea piano» e PianiAI.bottoni ---
    pg.evaluate("UI.studioVista = 'piano'; vai('studio')"); pg.wait_for_timeout(150)
    ok(pg.locator('button:has-text("Crea Piano Intelligente")').count() == 0 and pg.locator('button:has-text("＋ Crea piano")').count() >= 1, 'vista Piano: un solo pulsante di creazione')
    pg.click('button:has-text("＋ Crea piano")'); pg.wait_for_selector('dialog.dialogo-sfondo[open]')
    t = pg.inner_text('dialog.dialogo-sfondo')
    ok('Genera un piano' in t and 'Crea Piano Intelligente' in t and 'Crea piano dal libro' in t, 'scegliPiano: le tre modalità in un dialogo')
    pg.click('dialog.dialogo-sfondo button:has-text("Crea Piano Intelligente")'); pg.wait_for_timeout(250)
    ok('Crea Piano Intelligente' in pg.inner_text('body'), 'scelta «Intelligente» apre la procedura di PianiAI')
    pg.evaluate("document.querySelectorAll('.visore, .foglio-sfondo, dialog').forEach(e => e.remove())")
    bt = pg.evaluate("""(() => { const n = PianiAI.bottoni(undefined); const ai = { id: 'ai-x', titolo: 'X', tipo: 'ai_neuro', giorni: [], vincoliAI: {} };
      let el = null; try { el = PianiAI.eAI(ai) ? PianiAI.bottoni(ai) : null; } catch (e) { el = null; }
      return { nullo: n === null, testo: el ? el.textContent : '' }; })()""")
    ok(bt['nullo'], 'PianiAI.bottoni senza piano AI: nessun pulsante (si crea da «＋ Crea piano»)')
    if bt['testo']:
        ok('Pausa' in bt['testo'] and 'Ricalcola' in bt['testo'] and 'Elimina' in bt['testo'] and 'Crea Piano' not in bt['testo'], 'PianiAI.bottoni su piano AI: Pausa / Ricalcola / Elimina')

    # --- primi passi (senza corsi, anche senza login) ---
    pg.evaluate("Studio.pkStep().filter(p => p.proprio).forEach(p => Stato.elimina('pk-' + p.id))")
    vuoto = pg.evaluate("Studio.pkStep().length === 0")
    if vuoto:
        pg.evaluate("UI.studioVista = 'schede'; vai('studio')"); pg.wait_for_timeout(150)
        ok(pg.locator('.primi-passi').count() == 1 and pg.locator('.primi-passi li').count() == 3, 'Studio vuoto: primi passi Corso → Piano → Quiz/Schede')
        ok('solo su questo dispositivo' in pg.inner_text('.primi-passi'), 'senza login: avviso sui dati solo locali')
    else:
        el = pg.evaluate("(() => { const e = primiPassi(); return { n: e.querySelectorAll('li').length, t: e.textContent }; })()")
        ok(el['n'] == 3 and 'Crea un corso' in el['t'] and 'Crea piano' in el['t'], 'primiPassi(): tre passi Corso → Piano → Quiz/Schede')
    ok(not pe, 'nessun errore di pagina (%s)' % (pe[:2] or 'nessuno'))
    b.close()
srv.shutdown()
print('TUTTO OK' if not err else '%d FALLITI' % len(err))
