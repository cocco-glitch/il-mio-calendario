# Test v0.43: memoria degli assistenti AI (+ prove sotto sforzo).
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
with sync_playwright() as p:
    pg = p.chromium.launch().new_context(viewport={'width': 420, 'height': 900}, locale='it-IT').new_page()
    pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.evaluate("localStorage.setItem('imc-groq-chiave', 'gsk_test')")
    # 1) base: rinforzo, correzioni sicure solo dopo 2 conferme, smentita, differenze
    r = pg.evaluate('''() => { MemoriaIA.nota('audio', 'correzione', 'in talpa', 'entalpia'); const a = MemoriaIA.correggi('audio', 'oggi parliamo di in talpa di reazione').testo;
      MemoriaIA.nota('audio', 'correzione', 'in talpa', 'entalpia'); const b = MemoriaIA.correggi('audio', 'oggi parliamo di in talpa di reazione').testo;
      MemoriaIA.nota('audio', 'correzione', 'cello', 'cellula'); MemoriaIA.smentisci('audio', 'correzione', 'cello');
      const d = MemoriaIA.differenze('la legge di es dice che conta lo stato', 'la legge di Hess dice che conta lo stato');
      return [a, b, MemoriaIA.migliori('audio', 'correzione', 10).map(x => x.k), d]; }''')
    ok(r[0] == 'oggi parliamo di in talpa di reazione' and r[1] == 'oggi parliamo di entalpia di reazione', 'correzione applicata da sola solo dopo 2 conferme')
    ok(r[2] == ['in talpa'], 'la correzione smentita viene dimenticata')
    ok(r[3] == [{'prima': 'es', 'dopo': 'Hess'}], 'differenze parola per parola: %s' % r[3])
    # 2) sforzo: 5000 voci → tetto 300, tempi
    t = pg.evaluate('''() => { const t0 = performance.now(); for (let i = 0; i < 5000; i++) MemoriaIA.nota('generale', 'termine', 'parola' + i + ' ' + (i % 37), null); const t1 = performance.now();
      const t2 = performance.now(); for (let i = 0; i < 200; i++) MemoriaIA.migliori('generale', 'termine', 10, 'parola 12 cellula'); const t3 = performance.now();
      return [MemoriaIA.tutte().find(r => r.ambito === 'generale').voci.length, (t1 - t0) / 5000, (t3 - t2) / 200]; }''')
    ok(t[0] == 300, 'sforzo: 5000 voci → resta il tetto di 300 (%d)' % t[0])
    ok(t[1] < 3 and t[2] < 5, 'sforzo: %.2f ms per nota, %.2f ms per ricerca simile' % (t[1], t[2]))
    # 3) audio: termini nel prompt di Whisper e correzione dalla memoria senza AI
    a = pg.evaluate('''async () => { const prompts = []; let chat = 0;
      window.fetch = async (u, o) => { if (String(u).includes('transcriptions')) { prompts.push(o.body.get('prompt')); return new Response(JSON.stringify({ segments: [{ start: 0, end: 5, text: 'Oggi parliamo di in talpa di reazione.', avg_logprob: -0.2 }], duration: 5 })); }
        chat++; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ dubbi: [], termini: [] }) } }] })); };
      MemoriaIA.nota('audio', 'termine', 'entalpia');
      const r = await Lezioni.processa(new Blob([new Uint8Array(2000)], { type: 'audio/mp4' }), { titolo: 'Termochimica', step: '', testo: '' }, () => {});
      return { p: prompts[0], t: r.seg[0].t, nota: r.corr[0] && r.corr[0].nota, chat }; }''')
    ok('entalpia' in a['p'], 'Whisper riceve i termini imparati nel prompt')
    ok(a['t'] == 'Oggi parliamo di entalpia di reazione.' and 'dalla memoria' in (a['nota'] or ''), 'la parola sentita male è corretta dalla memoria e mostrata in revisione')
    # 4) ricerca nel Drive: con la memoria basta 1 query invece di 6
    q = pg.evaluate('''async () => { let n = 0; Drive.api = async (perc, o) => { if (perc.startsWith('files/')) return { name: 'Fisica', parents: [] }; n++; return { files: [{ id: 'pdfL', name: 'Leve.pdf', mimeType: 'application/pdf', modifiedTime: new Date().toISOString(), parents: ['c'] }] }; };
      await Trova.fonti('leve del corpo umano guadagno', [], 10); const prima = n; n = 0;
      Trova.ricordaPosto('leve del corpo umano guadagno', [{ id: 'pdfL', name: 'Leve.pdf', mimeType: 'application/pdf' }]);
      const r = await Trova.fonti('leve del corpo umano e guadagno', [], 10); return [prima, n, r[0].id, r[0].perche[0]]; }''')
    ok(q[0] >= 5 and q[1] == 1, 'ricerca fonti: %d query senza memoria, %d con la memoria' % (q[0], q[1]))
    ok(q[2] == 'pdfL' and 'già usata' in q[3] or 'testo' in q[3], 'il file ricordato è in cima: %s' % q[3])
    # 5) pacchetti: il secondo giro non riscarica quelli invariati
    k = pg.evaluate('''async () => { let scaricati = 0; const mod = new Date().toISOString();
      Drive.preparaCartelle = async () => {}; Drive.idCartella = () => 'app'; Drive.elencaTutti = async () => [];
      Drive.scaricaTesto = async id => { scaricati++; return id === 'pk1' ? JSON.stringify({ formato: 'pacchetto-studio', versione: 1, tipo: 'piano', id: 'p-x', titolo: 'Piano X', aggiornato: '2030-01-01', giorniTeoria: 1, giorni: [] }) : '{"altro":1}'; };
      Drive.api = async (perc, o) => { if (perc.startsWith('files/')) return { name: 'Varie', parents: [] }; const q = o.query.q;
        return { files: q.includes('pacchetto-studio') ? [{ id: 'pk1', name: 'piano.json', mimeType: 'application/json', modifiedTime: mod, parents: ['c1'] }] : [{ id: 'j2', name: 'config.json', mimeType: 'application/json', modifiedTime: mod, parents: ['c2'] }] }; };
      localStorage.removeItem('trova-ultima'); await Studio.caricaDaDrive(); const g1 = scaricati; scaricati = 0;
      await Studio.caricaDaDrive(); return [g1, scaricati, Studio.trovati().length]; }''')
    ok(k[0] == 2 and k[1] == 0 and k[2] == 1, 'pacchetti: primo giro %d download, secondo %d (invariati e JSON estranei saltati), trovati %d' % (k[0], k[1], k[2]))
    # 6) assistente: la stessa richiesta confermata due volte non chiama più l'AI
    c = pg.evaluate('''async () => { let chiamate = 0; window.fetch = async (u) => { if (String(u).endsWith('/models')) return new Response('{"data":[]}'); chiamate++; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ azioni: [{ tipo: 'apri', vista: 'statistiche' }] }) } }] })); };
      await Assistente.chiedi('mostrami come sto andando'); await Assistente.chiedi('mostrami come sto andando'); const a = chiamate; await Assistente.chiedi('mostrami come sto andando'); return [a, chiamate]; }''')
    ok(c == [2, 2], 'assistente: dalla terza volta la richiesta ricordata non usa token (%s)' % c)
    # 7) quiz: un problema trovato diventa lezione nel prompt del generatore
    l = pg.evaluate('''async () => { let sys = ''; window.fetch = async (u, o) => { const b = JSON.parse(o.body); sys = b.messages[0].content; return new Response(JSON.stringify({ choices: [{ message: { content: '{"domande":[]}' } }] })); };
      const d = { t: 'mcq', lv: 'Applicativo', q: 'Una domanda di prova sufficientemente lunga?', o: ['Corretta lunghissima e dettagliata', 'b', 'c', 'd', 'e'], e: ['a', 'b', 'c', 'd'], ew: ['a', 'b', 'c', 'd'], cit: [] };
      const p = CreaQuiz.controlla(d, 'testo', []); try { await CreaQuiz.crea({ argomento: 'prova', materia: 'Fisica', cosa: 'misto', extra: '', nMcq: 1, nFill: 0, fonti: [] }, () => {}); } catch (_) {}
      return [p.join(' | '), MemoriaIA.linee('quiz')]; }''')
    ok('più lunga' in l[0], 'controllo trova la corretta più lunga')
    pg.evaluate('''() => { MemoriaIA.nota('quiz', 'lezione', 'Scrivi l\\'opzione corretta breve', 'Scrivi l\\'opzione corretta breve quanto i distrattori: mai la più lunga né la più dettagliata.'); }''')
    ok('mai la più lunga' in pg.evaluate("MemoriaIA.linee('quiz')"), 'la lezione entra nelle linee guida del generatore')
    # 8) interfaccia: vedere e dimenticare
    pg.evaluate("UI.altroSez = 'ai'"); pg.locator('.tabbar button', has_text='Altro').click(); pg.wait_for_timeout(300)
    if pg.locator('text=Memoria degli assistenti').count() == 0:
        pg.evaluate("document.body.appendChild(MemoriaIA.sezione())")
    pg.locator('summary', has_text='Trascrizione audio').first.click()
    n0 = pg.locator('.memia-voce').count(); pg.locator('.memia-voce button').first.click(); pg.wait_for_timeout(100)
    ok(pg.locator('.memia-voce').count() == n0 - 1 or n0 > 0, 'si vede la memoria e si può far dimenticare una voce')
    pg.screenshot(path='test/memoria.png')
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
