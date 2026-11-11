# Test del modulo Studio. Uso: python3 test/studio.py
import os, sys, http.server, threading, functools
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
QUIZ = '<!DOCTYPE html><html><head><title>q</title></head><body><h1 id="t">QUIZ FINTO</h1><script>localStorage.setItem("a","1");document.getElementById("t").textContent+=" ok "+localStorage.getItem("a")</script></body></html>'
FINTO = """
window.google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken() { setTimeout(() => this.callback({ access_token: 'tok', expires_in: 3600 }), 0); } }), revoke() {} } } };
const _f = window.fetch.bind(window);
window.fetch = async (url, opz = {}) => {
  const u = new URL(url, location.href); if (u.origin === location.origin) return _f(url, opz);
  const j = o => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
  if (u.pathname.endsWith('/userinfo')) return j({ email: 'cocco.haloa@gmail.com' });
  if (u.searchParams.get('alt') === 'media') return new Response(u.pathname.includes('QZ') ? %s : '{"records":[]}', { headers: { 'content-type': 'text/html' } });
  if (u.pathname.startsWith('/upload/')) return j({ id: 'up1' });
  if (opz.method === 'POST') return j({ id: 'c' + Math.random() });
  const q = u.searchParams.get('q') || '';
  if (q.includes('1U8XHeco0XMOGdOs78YVDnTn4J6r12F2P')) return j({ files: [{ id: 'QZ1', name: '2.2.4 Problemi: calcolo del calore nei cambiamenti di fase (scheda 2 di 3).html' }, { id: 'QZx', name: '2.2.4 Altro (scheda 1 di 3).html' }] });
  if (u.pathname.endsWith('/export')) return new Response('Argomento,Data,Fatto\\nOsmosi,12/11/2026,si\\nGas,13/11/2026,no', { headers: { 'content-type': 'text/csv' } });
  if (q.includes("mimeType = 'application/vnd.google-apps.spreadsheet'")) return j({ files: [{ id: 'S1', name: 'Errori quiz', mimeType: 'application/vnd.google-apps.spreadsheet', webViewLink: 'https://docs.google.com/x', modifiedTime: '2026-11-10T10:00:00Z' }] });
  if (q.includes('1qdrWXSEUeP9DEBiIP6Twq96oxqoEWUtW')) return j({ files: [{ id: 'PDF421', name: '421-560.pdf' }] });
  return j({ files: [] });
};
""" % repr(QUIZ)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome', color_scheme='dark')
    ctx.route('**/accounts.google.com/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body='//'))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-12T09:00:00+01:00')   # "oggi" = giovedì 12/11/2026
    pg.add_init_script(FINTO)
    pg.add_init_script("window.PK2 = () => Studio.pkStep().find(p => p.id === 'step-2')")
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("Studio.pkStep().length === 2 && Studio.pkPiani().length === 2 && !!Studio.pkPiano()")
    # criterio: il 12/11 mostra Bio 2.2 + Chi 2.3
    v = pg.evaluate("Studio.vociDelGiorno(daYmd('2026-11-12')).map(x => Studio.etichetta(x.v.k))")
    ok(v == ['Bio 2.2', 'Chi 2.3'], '12/11 dal piano: %s' % v)
    ok(pg.locator('.card:has-text("Studio di oggi") .voce-lista').count() == 2, 'Oggi mostra i 2 blocchi studio')
    ok('In ritardo di 2 step' in pg.locator('.indicatore').first.inner_text(), 'indicatore: ' + pg.locator('.indicatore').first.inner_text())
    pg.screenshot(path='test/20-oggi-studio.png')
    pg.click('.tabbar >> text=Calendario'); pg.wait_for_selector('.mese'); ok(pg.locator('.mese-chip.studio:text("Bio 2.2")').count() == 1, 'mese: chip Bio 2.2'); pg.screenshot(path='test/21-mese-studio.png')
    # criterio: numeri Step 2 = scheda PDF (C2.2: 9 3 19 11 19)
    n = pg.evaluate("(() => { const t = Studio.trovaSotto('C2.2'), n = Studio.numeri(Studio.schedeDi(t.sub)); return [n.P, n.R, n.pagP.size, n.pagR.size, n.pagT.size]; })()")
    ok(n == [9, 3, 19, 11, 19], 'numeri Chimica 2.2: %s' % n)
    tot = pg.evaluate("(() => { const s = PK2().materie.flatMap(m => m.sottostep.flatMap(Studio.schedeDi)); const n = Studio.numeri(s); return [n.P, n.R]; })()")
    ok(tot == [111, 35], 'totale Step 2: %s' % tot)
    # viste native
    pg.click('.tabbar >> text=Studio'); pg.wait_for_selector('.voce-lista.sotto'); pg.screenshot(path='test/22-studio.png', full_page=True)
    pg.locator('.voce-lista.sotto', has_text='2.2 · Liquidi').click(); pg.wait_for_selector('.blocchi'); pg.screenshot(path='test/23-sottostep.png', full_page=True)
    ok(pg.locator('.voce-lista.task').count() == 12, '12 schede in Chimica 2.2')
    # spunto una scheda con un tocco, poi apro il foglio di un'altra e apro il quiz
    pg.locator('.voce-lista.task .spunta').first.click(); pg.wait_for_selector('.voce-lista.task.fatto')
    ok(pg.evaluate("Studio.fatta('C-2.2.1-1')"), 'scheda spuntata')
    pg.evaluate("Drive.login()"); pg.wait_for_function("Drive.pronto")
    pg.locator('.voce-corpo', has_text='calcolo del calore').click(); pg.wait_for_selector('.foglio'); pg.screenshot(path='test/24-scheda.png')
    pg.click('.foglio >> text=Apri il quiz'); pg.wait_for_selector('.visore-frame')
    fr = pg.frame_locator('.visore-frame'); fr.locator('#t').wait_for()
    ok(fr.locator('#t').inner_text() == 'QUIZ FINTO ok 1', 'quiz aperto in-app, script e localStorage funzionano: ' + fr.locator('#t').inner_text())
    ok(pg.get_attribute('.visore-frame', 'sandbox').find('allow-same-origin') == -1, 'iframe isolato (niente same-origin)')
    pg.click('.visore >> text=Chiudi'); pg.wait_for_selector('.foglio'); pg.fill('.foglio input[type=number]', '83'); pg.click('.foglio-testa >> text=Salva')
    ok(pg.evaluate("Studio.prog('C-2.2.4-2').punteggio") == 83 and pg.evaluate("Studio.fatta('C-2.2.4-2')"), 'punteggio 83% salvato e scheda fatta')
    # libro alla pagina giusta
    r = pg.evaluate("(async () => { const pk = PK2(); return [await Studio.pdfPagina(pk,'C',121), await Studio.pdfPagina(pk,'B',287), await Studio.pdfPagina(pk,'F',33), await Studio.pdfPagina(pk,'F',400)]; })()")
    ok([x['pagina'] for x in r] == [3, 1, 57, 4] and r[0]['id'].startswith('1QNG') and r[1]['id'].startswith('1zMS') and r[3]['id'] == 'PDF421', 'libro → PDF e pagina (esempi delle direttive): %s' % [(x['id'][:6], x['pagina']) for x in r])
    # aggiornare il pacchetto non perde i progressi
    pg.evaluate("(() => { const c = JSON.parse(JSON.stringify(PK2())); c.aggiornato = '2099-01-01'; Studio.importa(c); })()")
    ok(pg.evaluate("Studio.fatta('C-2.2.1-1') && Studio.prog('C-2.2.4-2').punteggio === 83 && PK2().aggiornato === '2099-01-01'"), 'pacchetto aggiornato, progressi intatti')
    # piano: sposto C2.2 sulla Riserva 1
    pg.click('.tabbar >> text=Studio'); pg.click('.segmenti >> text=Piano'); pg.wait_for_selector('.agenda-giorno'); pg.screenshot(path='test/25-piano.png')
    pg.evaluate("Studio.sposta('C2.2', '2026-12-01')")
    ok(sorted(pg.evaluate("Studio.vociDelGiorno(daYmd('2026-12-01')).map(x => x.v.k)")) == ['C2.2', 'RISERVA1'] and pg.evaluate("Studio.inRitardo().map(v => v.k)") == ['F2.2'], 'step spostato sulla Riserva; ritardo ricalcolato')
    ok(pg.evaluate("Studio.fatta('C-2.2.1-1')"), 'progressi conservati dopo lo spostamento')
    # Step 1: numeri come nella scheda PDF
    n1 = pg.evaluate("(() => { const s = Studio.pkStep().find(p => p.id === 'step-1').materie.flatMap(m => m.sottostep.flatMap(Studio.schedeDi)); const n = Studio.numeri(s); return [n.P, n.R, s.length]; })()")
    ok(n1 == [98, 87, 185], 'Step 1 totale: %s' % n1)
    f11 = pg.evaluate("(() => { const n = Studio.numeri(Studio.schedeDi(Studio.trovaSotto('F1.1').sub)); return [n.P, n.R, n.pagP.size, n.pagR.size, n.pagT.size, Studio.intervalli(n.pagT)]; })()")
    ok(f11[:5] == [9, 14, 5, 10, 10], 'Fisica 1.1 con appendice A1-A6: %s' % f11)
    # piano di raffinamento: 12/12 = Chi 1.3, Bio 1.3, Fis 2.1
    r = pg.evaluate("Studio.vociDelGiorno(daYmd('2026-12-12')).map(x => x.p.id + ':' + x.v.k)")
    ok(r == ['piano-raffinamento:C1.3', 'piano-raffinamento:B1.3', 'piano-raffinamento:F2.1'], 'raffinamento 12/12: %s' % r)
    ok(pg.evaluate("Studio.vociDelGiorno(daYmd('2027-01-10'))[0].v.t") == 'Riposo pre-appello', 'raffinamento fino al 10/01')
    ok(pg.evaluate("Studio.inRitardo().every(v => !/^R\\d/.test(v.k))"), 'il raffinamento non conta come ritardo adesso')
    # copertura
    ok(pg.evaluate("Studio.pkPiano().copertura.length") == 124, '124 argomenti del syllabus')
    pg.click('.tabbar >> text=Studio'); pg.click('.segmenti >> text=Syllabus'); pg.wait_for_selector('.etichetta.stato-n'); pg.screenshot(path='test/26-syllabus.png')
    # tabelle
    pg.click('.segmenti >> text=Tabelle'); pg.click('text=+ Nuova tabella'); pg.fill('.foglio .titolo-grande', 'Errori ricorrenti'); pg.locator('.foglio select').select_option('studio'); pg.click('.foglio-testa >> text=Crea')
    pg.wait_for_selector('table.tab'); pg.locator('table.tab textarea').first.fill('Osmolarità'); pg.locator('table.tab textarea').first.dispatch_event('change')
    pg.locator('table.tab input[type=date]').first.fill('2026-11-12'); pg.locator('table.tab input[type=date]').first.dispatch_event('change')
    pg.click('text=+ Aggiungi riga'); pg.wait_for_timeout(200)
    t = pg.evaluate("Stato.tutti('tabella')[0]")
    ok(t['nome'] == 'Errori ricorrenti' and len(t['colonne']) == 6 and len(t['righe']) == 2, 'tabella creata con 6 colonne e 2 righe')
    ok(pg.evaluate("righeDelGiorno(daYmd('2026-11-12')).length") == 1, 'riga con data collegata al giorno')
    csv = pg.evaluate("csvRighe('a;b\\n\"x;1\";2\\n')")
    ok(csv == [['a', 'b'], ['x;1', '2']], 'CSV con ; e virgolette: %s' % csv)
    pg.evaluate("(async () => { const t = Stato.tutti('tabella')[0]; importaRighe(t, csvRighe(await Drive.esportaCsv('S1'))); Stato.salva(t); })()"); pg.wait_for_timeout(300)
    ok(pg.evaluate("Stato.tutti('tabella')[0].righe.length") == 4 and pg.evaluate("righeDelGiorno(daYmd('2026-11-13')).length") == 1, 'import da Google Sheet (CSV) con date italiane')
    pg.screenshot(path='test/27-tabella.png', full_page=True)
    # collegare un Google Sheet dal selettore interno (senza Picker / chiave API)
    pg.evaluate("void collegaSheet(Stato.tutti('tabella')[0], false)"); pg.wait_for_selector('.lista-file .voce-lista'); pg.screenshot(path='test/28-scegli-sheet.png')
    pg.click('.lista-file .voce-lista'); pg.click('.dialogo >> text=No, solo collegamento'); pg.wait_for_timeout(300)
    ok(pg.evaluate("Stato.tutti('tabella')[0].sheet && Stato.tutti('tabella')[0].sheet.id") == 'S1', 'Google Sheet collegato senza chiave API')
    # cache PDF: la seconda apertura non riscarica
    r = pg.evaluate("""(async () => { let n = 0; const f = window.fetch; window.fetch = (u, o) => { if (String(u).includes('PDFX')) n++; return f(u, o); };
      const a = await PdfCache.prendi('PDFX'); const b = await PdfCache.prendi('PDFX'); return [n, a.length === b.length && a.length > 0, await PdfCache.presente('PDFX')]; })()""")
    ok(r == [1, True, True], 'PDF scaricato una volta e poi letto dalla cache: %s' % r)
    pg.reload(); pg.wait_for_selector('.tabbar')
    ok(pg.evaluate("PK2().aggiornato === '2099-01-01' && Studio.fatta('C-2.2.1-1') && Studio.dataVoce({k:'C2.2'}, {data:'2026-11-11'}) === '2026-12-01'"), 'tutto salvato dopo ricarica')
    b.close()
print('ERRORI:' if err else 'TUTTO OK', *err, sep='\n'); sys.exit(1 if err else 0)
