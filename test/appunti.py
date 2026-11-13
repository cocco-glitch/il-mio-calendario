# Test v0.28: appunti — scheda, editor, carte dalla sintassi, collegamento allo step, conferma Drive.
import os, http.server, threading, functools
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
TESTO = "# Calore latente\n- serve per il cambio di stato\n- Calore latente di fusione del ghiaccio :: 334 J/g\n## Formule\n  - Q = m·{{L}}\nUna riga normale\n"
with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-13T17:30:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("Studio.pkStep().length >= 3")
    ok(pg.locator('.tabbar button', has_text='Appunti').count() == 1, 'scheda Appunti nella barra')
    c = pg.evaluate("Appunti.estraiCarte(%r)" % TESTO)
    ok(len(c) == 2 and c[0]['f'].startswith('Calore latente di fusione') and c[0]['ctx'] == 'Calore latente' and c[1]['ctx'] == 'Calore latente › Formule', 'carte + contesto dai titoli: %s' % c)
    pg.locator('.tabbar button', has_text='Appunti').click(); pg.wait_for_timeout(200)
    pg.click('text=＋ Nuovo appunto'); pg.wait_for_selector('.appunto-testo')
    pg.fill('.appunto-titolo', 'Chi 2.2.4 Calore latente'); pg.fill('.appunto-testo', TESTO)
    pg.wait_for_timeout(100)
    ok('🔗 Chi 2.2' in pg.inner_text('.appunto-stato') and '2 carte' in pg.inner_text('.appunto-stato'), 'stato: step collegato e 2 carte')
    pg.screenshot(path='test/appunti-editor.png')
    pg.clock.run_for(2000); pg.wait_for_timeout(100)
    a = pg.evaluate("Appunti.tutti()[0]")
    ok(a and a['sub'] == 'C2.2' and a['micro'] == '2.2.4', 'salvataggio automatico + collegamento allo step')
    ok(pg.evaluate("Carte.carteDi('mz-appunti').length") == 2 and pg.evaluate("Carte.mazzi().find(m => m.id.startsWith('mz-ap-')).sub") == 'C2.2', 'carte nel mazzo collegato')
    # togli una riga-carta → carta tolta
    pg.fill('.appunto-testo', TESTO.replace("- Calore latente di fusione del ghiaccio :: 334 J/g\n", ""))
    pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_timeout(300)
    ok(pg.evaluate("Carte.carteDi('mz-appunti').length") == 1, 'riga cancellata → carta tolta')
    ok(pg.locator('.dialogo').count() == 0, 'Drive non collegato: nessuna richiesta')
    # conferma Drive (finto Drive collegato)
    pg.evaluate("""() => { Object.defineProperty(Drive, 'collegato', { get: () => true }); window.serveGoogle = () => false;
      window._caricati = []; Drive.sottocartella = async () => 'cartAp'; Drive.carica = async (n, par, corpo, mime, id) => { _caricati.push([n, par, id || null]); return id || 'f1'; }; }""")
    pg.locator('.voce-lista', has_text='Calore latente').first.click(); pg.wait_for_selector('.appunto-testo')
    pg.fill('.appunto-testo', TESTO); pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_selector('.dialogo')
    ok('Salvare' in pg.inner_text('.dialogo'), 'chiede conferma prima di salvare su Drive')
    pg.click('.dialogo button:has-text("Salva su Drive")'); pg.wait_for_timeout(300)
    ok(pg.evaluate("_caricati") == [['Chi 2.2.4 Calore latente.md', 'cartAp', None]], 'copia .md creata in Appunti')
    pg.locator('.voce-lista', has_text='Calore latente').first.click(); pg.wait_for_selector('.appunto-testo')
    pg.fill('.appunto-testo', TESTO + "altro\n"); pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_selector('.dialogo')
    ok('Aggiorna la copia' in pg.inner_text('.dialogo'), 'seconda volta: aggiorna la copia')
    pg.click('.dialogo button:has-text("Aggiorna")'); pg.wait_for_timeout(300)
    ok(pg.evaluate("_caricati[1]") == ['Chi 2.2.4 Calore latente.md', 'cartAp', 'f1'], 'aggiorna lo stesso file')
    pg.screenshot(path='test/appunti-lista.png')
    # nello step
    pg.evaluate("UI.studioStep = Studio.pkStep()[1].id; UI.studioSub = 'C2.2'; UI.studioVista = 'schede'; vai('studio')"); pg.wait_for_timeout(200)
    ok(pg.locator('button', has_text='📝 Chi 2.2.4').count() == 1 and pg.locator('button', has_text='＋ Appunto').count() == 1, 'sotto-step: appunto collegato + nuovo')
    # --- v0.29: Cornell, copri e ricorda, AI ---
    ap = pg.evaluate("Appunti.tutti()[0]")
    sez = pg.evaluate("Appunti.sezioni(Appunti.tutti()[0])")
    ok([x['titolo'] for x in sez] == ['Calore latente', 'Formule'] and 'Calore latente di fusione del ghiaccio' in sez[0]['spunti'], 'sezioni + spunti Cornell: %s' % [(x['titolo'], x['spunti']) for x in sez])
    pg.evaluate("(() => { const a = Appunti.tutti()[0]; a.creato = '2026-11-12'; Stato.salva(a, true); apriCornell(a, true); })()"); pg.wait_for_selector('.cornell-testo.coperto')
    ok(pg.locator('.cornell-testo.coperto').count() == 2, 'copri e ricorda: testo coperto')
    pg.screenshot(path='test/appunti-cornell.png')
    pg.locator('.cornell-azioni button:has-text("Scopri")').first.click(); pg.locator('.voto-3').first.click()
    ok(len(pg.evaluate("Appunti.daRipassare(Appunti.tutti()[0])")) == 1, 'sezione valutata esce dal ripasso di oggi')
    pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_timeout(150)
    # AI: Groq simulato, chiave recuperata dal Drive
    pg.evaluate('''() => { localStorage.removeItem('imc-groq-chiave');
      Object.defineProperty(Drive, 'pronto', { get: () => true });
      Drive.preparaCartelle = async () => {}; Drive.idCartella = () => 'dati'; Drive.trovaFile = async n => n === 'chiave-ai.json' ? { id: 'k1' } : null;
      Drive.scaricaTesto = async id => JSON.stringify({ groq: 'gsk_prova' });
      window.fetch = async (u, o) => { window._ultimo = JSON.parse(o.body); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(
        JSON.parse(o.body).messages[0].content.includes('riassunto') ? { ok: 'Bene', manca: ['il valore 334 J/g'], errori: [] } : { domande: [{ q: 'Cosa misura il calore latente?', r: 'energia per il cambio di stato' }, { q: 'Unità del calore latente', r: 'J/g' }] }) } }] }), { status: 200 }); }; }''')
    pg.evaluate("vai('appunti')"); pg.wait_for_timeout(150)
    pg.locator('.voce-lista', has_text='Calore latente').first.click(); pg.wait_for_selector('.appunto-testo')
    pg.click('.appunto-barra button.ai'); pg.wait_for_selector('.foglio .gen-arg')
    ok(pg.evaluate("localStorage.getItem('imc-groq-chiave')") == 'gsk_prova', 'chiave Groq recuperata dal Drive')
    ok(pg.locator('.foglio .gen-arg').count() == 2, 'AI: 2 domande proposte')
    pg.locator('.foglio .gen-arg input').nth(1).uncheck(); pg.click('.foglio button:has-text("Aggiungi le scelte")'); pg.wait_for_timeout(300)
    ok('Cosa misura il calore latente? :: energia' in pg.input_value('.appunto-testo') and 'Unità del' not in pg.input_value('.appunto-testo'), 'solo la domanda scelta aggiunta come riga ::')
    ok(pg.evaluate("Carte.carteDi('mz-appunti').some(c => c.f === 'Cosa misura il calore latente?')"), 'e diventa flashcard')
    pg.fill('.appunto-riassunto', 'Il calore latente serve a cambiare stato senza cambiare temperatura.'); pg.wait_for_timeout(100)
    pg.click('.visore-testa .btn-testo:has-text("⋯")'); pg.click('.dialogo button:has-text("Riscontro AI")'); pg.wait_for_selector('.foglio:has-text("Manca")')
    ok('334 J/g' in pg.inner_text('.foglio'), 'riscontro sul riassunto: cosa manca')

    # --- v0.30: Studia ora, Oggi, errori dei quiz, import ---
    pg.keyboard.press('Escape'); pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_timeout(200)
    nuovo = pg.evaluate("(() => { const a = Appunti.nuovo({ titolo: 'oggi', testo: '# A\\nx' }); Stato.salva(a); return Appunti.daRipassare(a).length; })()")
    ok(nuovo == 0, 'appunto di oggi: si ripassa da domani')
    pg.clock.set_fixed_time('2026-11-14T09:00:00+01:00')
    ok(any(v['tipo'] == 'appunto' for v in pg.evaluate("StudiaOra.componi(90)")), 'domani: appunti in «Studia ora»')
    pg.evaluate("vai('oggi')"); pg.wait_for_timeout(200)
    ok(pg.locator('text=Appunti da ripassare').count() == 1, 'riquadro in Oggi')
    pg.evaluate('''() => { const s = Studio.schedeDi(Studio.trovaSotto('C2.2').sub)[0];
      Stato.salva({ id: 'dom-x', type: 'domanda', updatedAt: 0, schedaId: s.id, titolo: 't', q: 'Calore latente di vaporizzazione?', giusta: '2260 J/g', volte: 1, giuste: 0, ultima: '2026-11-13', esito: 'sbagliata' }); }''')
    ok(len(pg.evaluate("Appunti.errori(Appunti.tutti().find(a => a.sub === 'C2.2'))")) == 1, 'errori del quiz dello stesso step')
    pg.evaluate("document.querySelectorAll('.visore, .foglio-sfondo, .dialogo-sfondo').forEach(e => e.remove()); apriCornell(Appunti.tutti().find(a => a.sub === 'C2.2'))"); pg.wait_for_timeout(150)
    ok('Sbagliate nei quiz di Chi 2.2' in pg.inner_text('.cornell') and 'vaporizzazione' in pg.inner_text('.cornell'), 'errori in fondo alla vista Cornell')
    pg.evaluate("document.querySelectorAll('.visore').forEach(e => e.remove())")
    pg.evaluate('''() => { Drive.elencaCompleti = async id => [{ id: 'm1', name: 'Bio 1.1 cellula.md', mimeType: 'text/markdown' }, { id: 'x', name: 'foto.png', mimeType: 'image/png' }];
      Drive.scaricaTesto = async id => '# La cellula\\n- nucleo :: contiene il DNA\\n'; }''')
    n = pg.evaluate("Appunti.importaDrive([{ id: 'c', name: 'Biologia', mimeType: 'application/vnd.google-apps.folder' }])")
    a = pg.evaluate("Appunti.tutti().find(a => a.fonte && a.fonte.id === 'm1')")
    ok(n == 1 and a['titolo'] == 'La cellula' and a['sub'] == 'B1.1', 'import cartella: titolo dal # e collegamento allo step')
    ok(pg.evaluate("Appunti.importaDrive([{ id: 'm1', name: 'Bio 1.1 cellula.md' }])") == 0 and len([x for x in pg.evaluate("Appunti.tutti()") if x.get('fonte')]) == 1, 'reimport: nessun doppione')

    # --- v0.31: scrittura a mano ---
    pg.evaluate("document.querySelectorAll('.visore, .foglio-sfondo, .dialogo-sfondo').forEach(e => e.remove()); vai('appunti')"); pg.wait_for_timeout(150)
    pg.click('text=＋ Nuovo appunto'); pg.wait_for_selector('.appunto-modo')
    pg.click('.appunto-modo button:has-text("A mano")'); pg.wait_for_selector('.mano-vivo'); pg.wait_for_timeout(150)
    pg.fill('.appunto-titolo', 'Fis 1.1 cinematica')
    disegna = '''(tipo) => { const c = document.querySelector('.mano-vivo'), r = c.getBoundingClientRect();
      const ev = (n, x, y) => c.dispatchEvent(new PointerEvent(n, { pointerId: 7, pointerType: tipo, pressure: .6, clientX: r.left + x, clientY: r.top + y, bubbles: true, cancelable: true }));
      ev('pointerdown', 20, 30); for (let i = 1; i < 12; i++) ev('pointermove', 20 + i * 12, 30 + (i % 3) * 6); ev('pointerup', 160, 40); }'''
    pg.evaluate(disegna, 'pen')
    ok(pg.locator('text=Pencil: il dito scorre').count() == 1, 'Pencil riconosciuta: il dito scorre')
    pg.evaluate(disegna, 'touch')
    pg.screenshot(path='test/appunti-mano.png')
    pg.click('.visore-testa button:has-text("Chiudi")'); pg.wait_for_timeout(300)
    a = pg.evaluate("Appunti.tutti().find(a => a.titolo === 'Fis 1.1 cinematica')")
    ok(a and a.get('mano') and len(a['mano']['t']) == 1, 'tratto della Pencil salvato, il dito non scrive dopo la Pencil')
    ok(a['sub'] == 'F1.1', 'appunto a mano collegato allo step')
    # trascrizione (Groq visivo simulato)
    pg.evaluate('''() => { localStorage.setItem('imc-groq-chiave', 'gsk_x'); window.fetch = async (u, o) => { const b = JSON.parse(o.body); window._vis = b;
      return new Response(JSON.stringify({ choices: [{ message: { content: '# Moto rettilineo\\n- velocità media :: Δs/Δt\\n- {{accelerazione}} = Δv/Δt' } }] }), { status: 200 }); }; }''')
    pg.evaluate("document.querySelectorAll('.dialogo-sfondo').forEach(e => e.remove())")
    pg.locator('.voce-lista', has_text='Fis 1.1 cinematica').first.click(); pg.wait_for_selector('.mano-leggi')
    ok(pg.locator('.appunto-modo button.attivo', has_text='A mano').count() == 1, 'si riapre in modalità a mano')
    pg.click('.mano-leggi'); pg.wait_for_selector('.foglio textarea')
    ok(pg.evaluate("_vis.model").startswith('qwen/qwen3.8') and pg.evaluate("_vis.messages[0].content[1].image_url.url").startswith('data:image/png'), 'immagine della pagina inviata al modello visivo')
    pg.click('.foglio button:has-text("Aggiungi al testo")'); pg.wait_for_timeout(300)
    ok('velocità media :: Δs/Δt' in pg.input_value('.appunto-testo'), 'trascrizione aggiunta al testo')
    ok(pg.evaluate("Carte.carte().filter(c => c.f === 'velocità media' || c.f.includes('{{accelerazione}}')).length") == 2, 'e diventa 2 flashcard')

    # --- v0.32: Feynman, errori ↔ appunto, collegamenti ---
    pg.evaluate("document.querySelectorAll('.visore, .foglio-sfondo, .dialogo-sfondo').forEach(e => e.remove())")
    ap = "Appunti.tutti().find(a => a.sub === 'C2.2')"
    pg.evaluate('''() => { window.fetch = async (u, o) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ voto: 2, ok: 'Hai colto il cambio di stato', manca: ['il valore 334 J/g'], errori: [], domanda: 'Quanto vale il calore latente di fusione del ghiaccio?' }) } }] }), { status: 200 }); }''')
    pg.evaluate("apriCornell(%s)" % ap); pg.wait_for_timeout(150)
    pg.locator('.cornell button:has-text("Spiegamelo")').first.click(); pg.wait_for_selector('.foglio textarea')
    pg.fill('.foglio textarea', 'Il calore latente è l energia che serve per cambiare stato senza cambiare la temperatura del corpo.')
    pg.click('.foglio button:has-text("Valuta")'); pg.wait_for_selector('.foglio:has-text("Ti è sfuggito")')
    ok('334 J/g' in pg.inner_text('.foglio') and 'Parziale (2/4)' in pg.inner_text('body'), 'Spiegamelo: riscontro + voto')
    sid = pg.evaluate("Appunti.sezioni(%s)[0].id" % ap)
    ok(pg.evaluate("Stato.prendi(Appunti.idMemS(%s, '%s')).log.slice(-1)[0][1]" % (ap, sid)) == 2, 'voto Feynman registrato nel ripasso della sezione')
    pg.evaluate("document.querySelectorAll('.visore, .foglio-sfondo, .dialogo-sfondo').forEach(e => e.remove()); UI.studioSub = null; UI.studioVista = 'errori'; vai('studio')"); pg.wait_for_timeout(250)
    pg.evaluate("(UI as any) === 0") if False else None
    pg.evaluate("UI.domFiltro = 'aperte'; disegna()"); pg.wait_for_timeout(150)
    ok(pg.locator('.dom-appunto').count() >= 1 and 'Nel tuo appunto' in pg.inner_text('.dom-appunto'), 'errore del quiz: sezione del tuo appunto che ne parla')
    pg.wait_for_timeout(400); pg.locator('text=Prima prova a rispondere').first.dispatch_event('click')
    pg.wait_for_timeout(400); pg.locator('.dom-appunto button:has-text("Aggiungi")').first.dispatch_event('click'); pg.wait_for_timeout(150)
    ok('vaporizzazione? :: 2260 J/g' in pg.evaluate("%s.testo" % ap) and pg.evaluate("Carte.carte().some(c => c.f.includes('vaporizzazione'))"), 'errore aggiunto all\'appunto e diventato flashcard')
    pg.evaluate("Stato.salva(Object.assign(Appunti.nuovo({ titolo: 'Ripasso termodinamica', testo: 'Vedi [[Calore latente]]' })))")
    ok([x['titolo'] for x in pg.evaluate("Appunti.citatoDa(%s)" % ap)] == ['Ripasso termodinamica'], 'collegamento [[…]]: «citato in»')
    pg.evaluate("apriCornell(Appunti.trova('Ripasso termodinamica'))"); pg.wait_for_timeout(150)
    pg.click('a.ap-link'); pg.wait_for_timeout(200)
    ok('Chi 2.2.4 Calore latente' in pg.inner_text('.visore-titolo'), 'il link apre l\'appunto citato')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
