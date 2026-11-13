# Test v0.24: esercizi generati (Quiz Studio Q3).
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8768', '-d', 'dist'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); errori = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 844})
        pg.on('pageerror', lambda e: errori.append(str(e)))
        pg.goto('http://localhost:8768/index.html'); pg.wait_for_timeout(1500)
        r = pg.evaluate("""() => { const out = {}; for (const M of Generatori.MODELLI) { let ok = 0, err = []; for (let i = 0; i < 300; i++) { const d = Generatori.genera(M);
            if (!d) { err.push('null'); continue; }
            if (d.o.length !== 5 || new Set(d.o).size !== 5) err.push('opzioni'); else if (d.ew.length !== 4) err.push('ew');
            else if (d.o.some(x => /NaN|undefined|Infinity|—/.test(x)) || /NaN|undefined/.test(d.q + d.e.join(''))) err.push('testo: ' + d.q);
            else ok++; } out[M.id] = { ok, err: err.slice(0, 2), es: Generatori.genera(M) }; } return out; }""")
        male = {k: v['err'] for k, v in r.items() if v['ok'] < 300}
        assert not male, male
        if '-v' in sys.argv:
            for k, v in r.items(): print(k, '|', v['es']['q'], '|', v['es']['o'], '|', v['es']['e'][-1])
        # UI: dalla scheda F-3.1.7-1 il pulsante esercizi nuovi
        pg.evaluate("() => { const t = trovaScheda('F-3.1.7-1'); apriScheda(t.pk, t.m, t.micro, t.s); }"); pg.wait_for_timeout(300)
        pg.click('text=Esercizi nuovi'); pg.wait_for_selector('.qz-domanda')
        assert pg.locator('.qz-metro span').count() == 8
        assert pg.locator('[data-az=modifica]').count() == 0
        pg.click('.qz-opz-b >> nth=0'); pg.wait_for_timeout(200)
        st = pg.evaluate("Stato.tutti('statq')")
        assert st and st[0]['id'] == 'sq-g-f-archimede', st
        prima = pg.evaluate("Studio.prog('F-3.1.7-1')")
        pg.evaluate("""() => { for (let i=0;i<10;i++){ const a=document.querySelector('[data-az=avanti]'); if(!a) break; a.click(); if(a.textContent.includes('risultato')) break; } }""")
        pg.wait_for_timeout(200)
        if pg.locator('.dialogo-sfondo').count(): pg.click('.dialogo-sfondo button:has-text("Vedi il risultato")')
        pg.wait_for_selector('.qz-punti')
        assert pg.evaluate("Studio.prog('F-3.1.7-1')") == prima, 'gli esercizi generati non devono toccare la scheda'
        q1 = pg.evaluate("[...document.querySelectorAll('.qz-altre summary')].map(x=>x.textContent).join('|')")
        pg.click('text=Numeri nuovi'); pg.wait_for_selector('.qz-domanda')
        assert pg.locator('.qz-metro span').count() == 8
        # nessun modello per un microstep di sola teoria
        assert pg.evaluate("Generatori.per('B','3.1.3').length") == 0
        assert not errori, errori
        print('TUTTO OK generatori: ' + str(len(r)) + ' modelli x 300, interfaccia, statistiche per modello')
        b.close()
finally:
    srv.terminate()
