# Test v0.23: editor delle domande (Quiz Studio Q2).
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8767', '-d', 'dist'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); errori = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 844})
        pg.on('pageerror', lambda e: errori.append(str(e)))
        pg.goto('http://localhost:8767/index.html'); pg.wait_for_timeout(1500)
        apri = "() => { const t = trovaScheda('C-3.1.1-1'); QuizApp.apri(t.pk, t.m, t.micro, t.s); }"
        pg.evaluate(apri); pg.wait_for_selector('.qz-domanda')
        orig = pg.inner_text('.qz-domanda')
        # modifica testo e risposta corretta
        pg.click('[data-az=modifica]'); pg.wait_for_selector('.foglio')
        pg.fill('.foglio textarea >> nth=0', 'Domanda modificata da me?')
        pg.fill('.ed-opz input >> nth=0', 'Corretta nuova')
        pg.click('.foglio .btn-testo.forte'); pg.wait_for_timeout(300)
        assert pg.inner_text('.qz-domanda') == 'Domanda modificata da me?'
        assert 'modificata' in pg.inner_text('.qz-carta').lower()
        pg.evaluate("""() => { const b=[...document.querySelectorAll('.qz-opz-b')].find(x=>x.textContent.includes('Corretta nuova')); b.click(); }""")
        assert 'Corretto.' in pg.inner_text('#qz-why')
        r = pg.evaluate("Stato.tutti('modq')")
        assert len(r) == 1 and r[0]['campi']['q'] == 'Domanda modificata da me?' and r[0]['originale']['q'] == orig, r
        # riapro: la modifica resta
        pg.click('text=Chiudi'); pg.wait_for_timeout(200)
        pg.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(x=>x.remove())")
        pg.evaluate(apri); pg.wait_for_selector('.qz-domanda')
        assert pg.inner_text('.qz-domanda') == 'Domanda modificata da me?'
        # validazione: opzioni uguali
        pg.click('[data-az=modifica]'); pg.wait_for_selector('.foglio')
        pg.fill('.ed-opz input >> nth=1', 'Corretta nuova')
        assert 'uguali' in pg.inner_text('.foglio')
        pg.click('.foglio .btn-testo.forte'); pg.wait_for_timeout(200)
        assert pg.locator('.foglio').count() == 1, 'non doveva salvare'
        # ripristina originale
        pg.click('text=Ripristina originale'); pg.wait_for_timeout(300)
        assert pg.inner_text('.qz-domanda') == orig, pg.inner_text('.qz-domanda')
        assert all(x.get('deleted') for x in pg.evaluate("Stato.tutti('modq')")) or pg.evaluate("Stato.tutti('modq').length") == 0
        # nascondi
        n0 = pg.locator('.qz-metro span').count()
        pg.click('[data-az=modifica]'); pg.click('text=Nascondi domanda'); pg.wait_for_timeout(200)
        pg.click('.dialogo-sfondo button:has-text("Nascondi")'); pg.wait_for_timeout(300)
        assert pg.locator('.qz-metro span').count() == n0 - 1
        # risultato: ripristina nascoste + nuova domanda
        pg.evaluate("""() => { for (let i=0;i<30;i++){ const a=document.querySelector('[data-az=avanti]'); if(!a) break; if(a.textContent.includes('risultato')){a.click();break} a.click(); } }""")
        pg.wait_for_timeout(300)
        if pg.locator('.dialogo-sfondo').count(): pg.click('.dialogo-sfondo button:has-text("Vedi il risultato")')
        pg.wait_for_selector('.qz-punti')
        assert 'Ripristina le domande nascoste (1)' in pg.inner_text('.qz-carta')
        pg.click('[data-az=nuova]'); pg.wait_for_selector('.foglio')
        pg.select_option('.foglio select >> nth=0', 'fill')
        pg.fill('.foglio textarea >> nth=0', 'Il simbolo della mole è ……')
        pg.fill('.foglio input[placeholder^="Risposte"]', 'mol')
        pg.click('.foglio .btn-testo.forte'); pg.wait_for_timeout(300)
        pg.click('[data-az=ripristina]'); pg.wait_for_timeout(200)
        pg.click('[data-az=tutto]'); pg.wait_for_timeout(300)
        assert pg.locator('.qz-metro span').count() == n0, pg.locator('.qz-metro span').count()   # 17 + nuova
        pg.click('text=Chiudi'); pg.wait_for_timeout(200); pg.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(x=>x.remove())")
        pg.evaluate(apri); pg.wait_for_selector('.qz-domanda')
        assert pg.locator('.qz-metro span').count() == n0 + 1      # + ripristinata
        assert not errori, errori
        print('TUTTO OK editor: modifica, validazione, ripristino, nascondi, nuova domanda')
        b.close()
finally:
    srv.terminate()
