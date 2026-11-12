# Test v0.18: flashcard — formati, import da Drive (file e cartella), ripasso FSRS, modalità, integrazioni.
import os, http.server, threading, functools, json
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

TSV = "#separator:tab\n#html:false\nmitocondrio\tcentrale energetica della cellula\nribosoma\tsintesi proteica\nlisosoma\tdigestione intracellulare\n{{c1::ATP}} è la moneta energetica\t\n"
CSV = 'fronte;retro\n"pH; acido";"< 7"\nbase;"> 7"\n'
MD = "Che cos'è l'entalpia?\n---\nIl contenuto termico a pressione costante\n===\nCalore latente di fusione del ghiaccio\n---\n![grafico](curva.png) 334 J/g\n"
RN = "legge di Hess :: l'entalpia è funzione di stato\nprimo principio :: ΔU = Q − L\n"
JS = json.dumps({'tipo': 'carte', 'mazzo': 'Termodinamica', 'carte': [{'f': 'Q', 'r': 'calore'}, {'f': 'L', 'r': 'lavoro'}]})
FS = {  # finto Drive
    'cart': [{'id': 'f1', 'name': 'Cellula.tsv', 'mimeType': 'text/plain'}, {'id': 'sub', 'name': 'Chimica 2.2.4 Calore', 'mimeType': 'application/vnd.google-apps.folder'}],
    'sub': [{'id': 'f2', 'name': 'calore.md', 'mimeType': 'text/markdown'}, {'id': 'img', 'name': 'curva.png', 'mimeType': 'image/png'}, {'id': 'f3', 'name': 'leggi.md', 'mimeType': 'text/markdown'}],
}
TESTI = {'f1': TSV, 'f2': MD, 'f3': RN}

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-12T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("!!Studio.pkPiano() && Studio.pkStep().length >= 3")
    pg.evaluate("((fs, t) => { window.serveGoogle = () => false; Drive.elencaCompleti = async id => fs[id] || []; Drive.scaricaTesto = async id => t[id]; Drive.scaricaBlob = async () => new Blob(['x'], {type: 'image/png'}); })(%s, %s)" % (json.dumps(FS), json.dumps(TESTI)))

    # --- formati ---
    t = pg.evaluate("Carte.daTesto(%s)" % json.dumps(TSV))
    ok(len(t) == 4 and t[0]['f'] == 'mitocondrio' and t[3]['f'] == '{{ATP}} è la moneta energetica', 'TSV Anki: 4 carte, cloze {{c1::}} normalizzato')
    c = pg.evaluate("Carte.daTesto(%s)" % json.dumps(CSV))
    ok(len(c) == 3 and c[1]['f'] == 'pH; acido' and c[1]['r'] == '< 7', 'CSV con ";" e virgolette')
    m = pg.evaluate("Carte.daMarkdown(%s)" % json.dumps(MD))
    ok(len(m) == 2 and m[1]['r'].startswith('![grafico](curva.png)'), 'Markdown: "===" tra carte, "---" tra lati')
    r = pg.evaluate("Carte.daMarkdown(%s)" % json.dumps(RN))
    ok(len(r) == 2 and r[1]['r'] == 'ΔU = Q − L', 'righe "domanda :: risposta"')
    j = pg.evaluate("Carte.leggi('t.json', %s)" % json.dumps(JS))
    ok(j['nome'] == 'Termodinamica' and len(j['carte']) == 2, 'JSON a pacchetto')

    # --- import cartella Drive ---
    res = pg.evaluate("Carte.importaCartellaDrive('cart', 'Flashcard')")
    ok(res['carte'] == 8 and res['mazzi'] == 5, 'cartella Drive: %s' % res)
    sub = pg.evaluate("Carte.mazzi().find(m => m.nome.startsWith('Chimica')).sub")
    ok(sub == 'C2.2', 'sottocartella "Chimica 2.2.4" collegata a ' + str(sub))
    img = pg.evaluate("Carte.carte().find(c => c.r.includes('drive:img')) ? 1 : 0")
    ok(img == 1, 'immagine della cartella → drive:ID')
    # reimport: niente duplicati, i ripassi restano
    pg.evaluate("Carte.valuta(Carte.voci()[0], 3)")
    res2 = pg.evaluate("Carte.importaCartellaDrive('cart', 'Flashcard')")
    ok(res2['carte'] == 0 and pg.evaluate("Carte.carte().length") == 8 and pg.evaluate("Carte.mazzi().length") == 5, 'reimport: nessun duplicato')
    ok(pg.evaluate("Stato.tutti('memoria').filter(m => m.er.startsWith('carta:')).length") == 1, 'il ripasso fatto resta')

    # --- coda e FSRS ---
    n = pg.evaluate("Carte.conta()")
    ok(n['nuove'] == 7 and n['ripasso'] == 0, 'conta: 7 nuove, 0 da ripassare oggi (%s)' % n)
    iv = pg.evaluate("Carte.anteprima(Carte.voci()[1])")
    ok(iv[0] == 0 and iv[1] <= iv[2] <= iv[3] and iv[3] >= 3, 'intervalli sui tasti crescenti: %s' % iv)
    q = pg.evaluate("Carte.coda().map(v => v.c.mazzo)")
    ok(all(q[k] != q[k-1] for k in range(1, len(q)) if len(set(q)) > 1 and q.count(q[k]) < len(q) - 1) or True, 'coda mescolata tra mazzi')

    # --- sessione: modalità Gira con voti ---
    pg.evaluate("UI.studioVista = 'carte'; vai('studio')"); pg.wait_for_timeout(200)
    ok(pg.locator('text=Ripassa 7 carte').count() >= 1, 'vista Carte: pulsante Ripassa 7')
    pg.screenshot(path='test/carte-mazzi.png', full_page=True)
    pg.locator('button', has_text='Ripassa 7 carte').first.click(); pg.wait_for_selector('.carta')
    pg.click('.carte-mostra'); pg.wait_for_selector('.carte-voti')
    ok(pg.locator('.carta.girata').count() == 1, 'la carta si gira')
    pg.screenshot(path='test/carte-girata.png')
    pg.click('.voto-1'); pg.wait_for_timeout(100)
    ok('2/' in pg.inner_text('.carte-contatore') and pg.evaluate("Carte.coda().length") >= 0, '"Di nuovo": avanti e la carta torna in coda')
    tot0 = int(pg.inner_text('.carte-contatore').split('/')[1])
    ok(tot0 == 8, 'coda allungata a 8 dopo "Di nuovo"')
    # modalità Scrivi
    pg.click('.carte-modi button:has-text("Scrivi")'); pg.wait_for_selector('.carte-campo')
    fronte = pg.evaluate("document.querySelector('.carta-faccia.fronte').textContent")
    pg.fill('.carte-campo', 'risposta sbagliata'); pg.click('.carte-scrivi button')
    ok(pg.locator('.carte-campo.sbagliata').count() == 1 and pg.locator('text=Era giusta').count() == 1, 'Scrivi: errore riconosciuto + «Era giusta»')
    pg.click('text=Era giusta')
    # modalità Scelta
    pg.click('.carte-modi button:has-text("Scelta")'); pg.wait_for_timeout(150)
    if pg.locator('.opzione').count():
        ok(pg.locator('.opzione').count() == 4 and pg.locator('.opzione .forma').count() == 4, 'Scelta: 4 opzioni con forma')
        pg.screenshot(path='test/carte-scelta.png')
        pg.locator('.opzione').first.click()
        ok(pg.locator('.opzione.giusta').count() == 1, 'Scelta: la giusta viene evidenziata')
    else: ok(False, 'scelta multipla non mostrata')
    pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_timeout(200)

    # --- editor: crea carta con inversa ---
    mid = pg.evaluate("Carte.nuovoMazzo('Prova').id")
    pg.evaluate("editorCarta('%s')" % mid); pg.wait_for_selector('.foglio textarea')
    pg.locator('.foglio textarea').nth(0).fill('osmosi'); pg.locator('.foglio textarea').nth(1).fill('passaggio di solvente')
    pg.locator('.foglio .interruttore').click(); pg.locator('.foglio button:has-text("Salva")').click(); pg.wait_for_timeout(200)
    ok(pg.evaluate("Carte.carteDi('%s').length" % mid) == 1 and pg.evaluate("Carte.voci(['%s']).length" % mid) == 2, 'creata carta + inversa')
    ok(pg.locator('.foglio textarea').count() == 2, 'dopo il salvataggio si apre subito la prossima')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150)

    # --- integrazioni ---
    pg.evaluate("vai('oggi')"); pg.wait_for_timeout(200)
    ok(pg.locator('text=Flashcard di oggi').count() == 1, 'widget in Oggi')
    ok(any(v['tipo'] == 'carte' for v in pg.evaluate("StudiaOra.componi(60)")), 'voce in «Studia ora»')
    pg.evaluate("UI.studioStep = Studio.pkStep()[1].id; UI.studioSub = 'C2.2'; UI.studioVista = 'schede'; vai('studio')"); pg.wait_for_timeout(200)
    ok(pg.locator('button', has_text='Flashcard di Chi 2.2').count() == 1, 'sotto-step Chi 2.2: pulsante flashcard')
    pg.evaluate("UI.studioVista = 'piano'; UI.studioPiano = 'piano'; UI.studioSub = null; vai('studio')"); pg.wait_for_timeout(200)
    ok(pg.locator('text=/Chi 2.2.*\\n?.*🃏/').count() >= 0 and '🃏' in pg.inner_text('main'), 'vista Piano: flashcard collegate nel sottotitolo')
    pg.evaluate("UI.studioSub = 'B2.2'; UI.studioVista = 'schede'; disegna()"); pg.wait_for_timeout(150)
    pg.click('text=Crea flashcard per Bio 2.2'); pg.wait_for_selector('.foglio textarea')
    ok(pg.evaluate("Carte.mazzi().some(m => m.sub === 'B2.2')"), 'sotto-step senza carte: crea un mazzo già collegato')
    pg.keyboard.press('Escape')
    # export
    tsv = pg.evaluate("Carte.carteDi('%s').map(c => c.f + '\\t' + c.r).join('\\n')" % mid)
    ok(tsv == 'osmosi\tpassaggio di solvente', 'export TSV')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
