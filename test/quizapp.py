# Test v0.22: banca domande + quiz nativo (Quiz Studio Q0-Q1). Serve dist/ in http locale.
import json, os, subprocess, sys, time, glob
from playwright.sync_api import sync_playwright

srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', 'dist', '--protocol', 'HTTP/1.1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
import socket   # aspetta che il server sia in ascolto (time.sleep(1) a volte non basta su Windows)
for _ in range(100):
    with socket.socket() as _s:
        if _s.connect_ex(('127.0.0.1', 8765)) == 0: break
    time.sleep(.1)
errori, chiamate = [], []
def groq(route):
    if route.request.method == 'GET':   # v0.46: elenco modelli (GET /models) → vuoto, si usano i modelli di riserva
        route.fulfill(status=200, body='{"data":[]}', headers={'content-type': 'application/json', 'access-control-allow-origin': '*'}); return
    chiamate.append(json.loads(route.request.post_data))
    route.fulfill(status=200, body=json.dumps({'choices': [{'message': {'content': 'Spiegazione AI di prova'}}]}), headers={'content-type': 'application/json', 'access-control-allow-origin': '*'})
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
        pg.add_init_script("try { localStorage.setItem('imc-quiz-modo','esame') } catch (e) {}")   # v0.54: quiz senza passo di certezza (default neuro)
        pg.on('pageerror', lambda e: errori.append(str(e)))
        pg.route('https://api.groq.com/**', groq)
        pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(1500)
        pg.evaluate("localStorage.setItem('imc-groq-chiave','gsk_x')")
        # apre la scheda C-3.1.1-1 nel quiz nativo
        pg.evaluate("""() => { const t = trovaScheda('C-3.1.1-1'); QuizApp.apri(t.pk, t.m, t.micro, t.s); }""")
        pg.wait_for_selector('.qz-domanda', timeout=8000)
        n = pg.locator('.qz-metro span').count()
        assert n == 18, n
        assert 'Reazioni chimiche' in pg.inner_text('.qz-h1')
        # suggerimento esclude un'opzione sbagliata
        pg.click('[data-az=aiuto]'); assert pg.locator('.qz-opz-b.escluso').count() == 1
        # rispondo sbagliato di proposito: trovo l'opzione non corretta tramite i dati
        giusta = pg.evaluate("""async () => { const B = await Banca.carica(3); return B.domande.filter(d => d.sk==='C-3.1.1-1')[0].o[0]; }""")
        bott = pg.locator('.qz-opz-b:not(.escluso)')
        for i in range(bott.count()):
            if giusta not in bott.nth(i).inner_text(): bott.nth(i).click(); break
        assert pg.locator('.qz-opz-b.ko').count() == 1 and 'Non corretto' in pg.inner_text('#qz-why')
        assert 'Perché la tua risposta è sbagliata' in pg.inner_text('#qz-why')
        st = pg.evaluate("Stato.tutti('statq')")
        assert len(st) == 1 and st[0]['n'] == 1 and st[0]['ok'] == 0 and st[0]['scelte'], st
        # AI
        # v0.54 imbuto AI: senza spiegazione pronta «Breve» arriva al livello 2 (micro-chiamata ≤350 token), poi resta salvata
        pg.click('[data-ai=breve]'); pg.wait_for_timeout(500)
        assert len(chiamate) == 1 and 'Spiegazione AI di prova' in pg.inner_text('.qz-ai') and 'micro' in pg.inner_text('.qz-ai')
        assert 'Studente ha sbagliato' in chiamate[0]['messages'][0]['content'] and chiamate[0]['max_completion_tokens'] == 350, chiamate[0]
        pg.click('[data-ai=media]'); pg.wait_for_timeout(300)
        assert len(chiamate) == 2 and 'Spiegazione AI di prova' in pg.inner_text('.qz-ai')
        pg.click('[data-ai=breve]'); pg.wait_for_timeout(300)
        assert len(chiamate) == 2 and 'salvata' in pg.inner_text('.qz-ai'), (len(chiamate), pg.inner_text('.qz-ai'))
        # spiegazione dalle fonti con citazione
        pg.click('[data-az=fonti]'); assert pg.locator('.qz-box blockquote').count() >= 1
        # rispondo bene a tutte le altre
        for k in range(1, 18):
            pg.click('[data-az=avanti]')
            # v0.54: l'ordine è interleaved → riconosco la domanda mostrata dal testo, non dall'indice
            d = pg.evaluate("""async () => { const B = await Banca.carica(3); const N = s => String(s).replace(/<[^>]+>/g, ' ').replace(/[^A-Za-z0-9àèéìòù]+/g, '').toLowerCase();
                const vis = N(document.querySelector('.qz-domanda').textContent);
                const c = B.domande.filter(d => d.sk==='C-3.1.1-1').map(d => ({ d, k: N(d.q).slice(0, 40) })).filter(x => x.k && vis.includes(x.k)).sort((a, b) => b.k.length - a.k.length);
                return c.length ? c[0].d : null; }""")
            assert d, 'domanda mostrata non trovata nella banca'
            if d['t'] == 'mcq':
                bott = pg.locator('.qz-opz-b')
                for i in range(bott.count()):
                    t = bott.nth(i).inner_text().split('\n', 1)[-1]
                    if t.strip() == d['o'][0].replace('_{', '').replace('^{', '').replace('}', '') or bott.nth(i).inner_text().endswith(d['o'][0]):
                        bott.nth(i).click(); break
                else:
                    pg.evaluate("""o => { const b=[...document.querySelectorAll('.qz-opz-b')]; const i=b.findIndex(x=>x.textContent.includes(o.slice(0,12))); b[i].click(); }""", d['o'][0])
            else:
                pg.fill('#qz-ans', d['a'][0]); pg.click('.qz-fill button[type=submit]')
            assert pg.locator('#qz-why').count() == 1
        pg.click('[data-az=avanti]'); pg.wait_for_timeout(300)
        assert pg.locator('.qz-punti').count() == 1, 'manca il risultato'
        ris = pg.inner_text('.qz-punti')
        prog = pg.evaluate("Studio.prog('C-3.1.1-1')")
        assert prog and prog['fatta'] and prog['punteggio'] >= 80, (ris, prog)
        assert pg.evaluate("Stato.tutti('domanda').length") >= 1
        # rifai solo gli errori
        pg.click('[data-az=errori]'); pg.wait_for_timeout(200)
        assert 'ripasso errori' in pg.inner_text('.qz-stat')
        # estrazione da un quiz HTML del motore vecchio (Step 1)
        vecchio = '<!doctype html><html><body><main id="app"></main><script>(function(){var q={questions:[{t:"mcq",lv:"Sbarramento",q:"Domanda vecchia?",e:"Perché sì.",r:"Libro p. 1",o:["Sbagliata","Giusta","C","D","E"],c:1},{t:"fill",lv:"Completamento",q:"Due più due fa ……",e:"4",a:["4","quattro"],show:"4"}]},y=[1];document.getElementById("app").textContent="ok"})();</script></body></html>'
        r = pg.evaluate("h => Banca.estraiDaHtml(h, 'F-1.1.1-1')", vecchio)
        assert len(r['domande']) == 2 and r['domande'][0]['o'][0] == 'Giusta' and r['domande'][1]['a'] == ['4', 'quattro'], r
        # motore nuovo con immagini
        nuovo = open(glob.glob('/home/claude/quiz/out/3.2.9 *')[0], encoding='utf-8').read() if glob.glob('/home/claude/quiz/out/3.2.9 *') else None
        if nuovo:
            r = pg.evaluate("h => Banca.estraiDaHtml(h, 'C-3.2.9-1')", nuovo)
            assert len(r['domande']) == 18 and r['domande'][0].get('img') and len(r['immagini']) == 1, (len(r['domande']), r['immagini'].keys())
        # schermo stretto: niente scorrimento orizzontale
        assert pg.evaluate("document.querySelector('.qz').scrollWidth <= document.querySelector('.qz').clientWidth + 1")
        assert not errori, errori
        print('TUTTO OK quiz nativo: banca, suggerimento, statistiche, AI, risultato, errori, estrazione')
        b.close()
finally:
    srv.terminate()
