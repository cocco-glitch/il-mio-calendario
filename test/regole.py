# Test v0.25: regole che imparano (Quiz Studio Q4).
import json, subprocess, sys, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8769', '-d', 'dist'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); errori = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 844})
        pg.on('pageerror', lambda e: errori.append(str(e)))
        pg.goto('http://localhost:8769/index.html'); pg.wait_for_timeout(1500)
        # ogni chiave di errore dei modelli ha una categoria
        senza = pg.evaluate("Generatori.MODELLI.flatMap(m => m.d.map(x => x[0]).filter(k => Regole.categoriaDi(k) === 'altro').map(k => m.id + ':' + k))")
        assert not senza, senza
        # errore ripetuto «celsius» negli esercizi -> avviso alla 2a volta
        apri = "() => { const t = trovaScheda('C-2.3.7-1'); QuizApp.apri(t.pk, t.m, t.micro, t.s, () => [Generatori.genera(Generatori.MODELLI.find(m => m.id==='c-osmotica')), Generatori.genera(Generatori.MODELLI.find(m => m.id==='c-osmotica'))]); }"
        pg.evaluate(apri); pg.wait_for_selector('.qz-domanda')
        def sbaglia_celsius():
            pg.evaluate("""() => { const v = [...document.querySelectorAll('.qz-opz-b')]; const q = document.querySelector('.qz-domanda').textContent; 
               const m = q.match(/soluzione ([\\d,]+) M di (\\S+) a (\\d+)/); const M = +m[1].replace(',', '.'), i = {glucosio:1, NaCl:2, 'CaCl₂':3}[m[2]], t = +m[3];
               const s = Generatori.fN(i*M*0.0821*t) + ' atm'; const b = v.find(x => x.textContent.endsWith(s)); b.click(); }""")
            pg.wait_for_timeout(150)
        sbaglia_celsius()
        assert pg.locator('.qz-avviso').count() == 0
        pg.click('[data-az=avanti]'); sbaglia_celsius()
        t = pg.inner_text('.qz-avviso')
        assert '2ª volta' in t and 'kelvin' in t, t
        assert pg.evaluate("Regole.perTipo().kelvin") == 2
        # quota deboli: c-osmotica ora ha 100% errori -> compare spesso nella serie di 2.3.7? (unico modello) ; test su 2.3.3 con due modelli
        pg.evaluate("""() => { Stato.salva({ id: 'sq-g-c-molarita', type: 'statq', updatedAt: 0, sk: 'x', n: 4, ok: 0, ultima: '', esito: false }, true);
                               Stato.salva({ id: 'sq-g-c-molarita-m', type: 'statq', updatedAt: 0, sk: 'x', n: 4, ok: 4, ultima: '', esito: true }, true); }""")
        cnt = pg.evaluate("() => { let a = 0; for (let k = 0; k < 20; k++) a += Generatori.serie('C', '2.3.3', 8).filter(d => d.id === 'g-c-molarita').length; return a / 20; }")
        assert cnt >= 5, cnt     # metà dai deboli + metà a rotazione => ~6 su 8
        # banca: domanda sbagliata 2 volte -> avviso; ordine «deboli-prima»
        pg.click('text=Chiudi'); pg.wait_for_timeout(100)
        pg.evaluate("""async () => { const B = await Banca.carica(3); const d = B.domande.filter(x => x.sk === 'C-3.1.1-1')[5];
              Stato.salva({ id: 'sq-' + d.id, type: 'statq', updatedAt: 0, sk: d.sk, n: 2, ok: 0, ultima: '', esito: false }, true); window.__d5 = d.q; }""")
        pg.evaluate("Regole.sezioneAltro()")  # si costruisce senza errori
        pg.evaluate("() => { const r = Regole.get(); Stato.salva({ id: 'regole-quiz', type: 'regole', updatedAt: 0, json: JSON.stringify({ ...r, ordineQuiz: 'deboli-prima' }) }, true); }")
        pg.evaluate("() => { const t = trovaScheda('C-3.1.1-1'); QuizApp.apri(t.pk, t.m, t.micro, t.s); }"); pg.wait_for_selector('.qz-domanda')
        assert pg.inner_text('.qz-domanda') == pg.evaluate("window.__d5"), 'la domanda sbagliata doveva venire prima'
        giusta = pg.evaluate("async () => { const B = await Banca.carica(3); return B.domande.filter(x => x.sk === 'C-3.1.1-1')[5].o[0]; }")
        pg.evaluate("g => { const b = [...document.querySelectorAll('.qz-opz-b')].find(x => !x.textContent.includes(g)); b.click(); }", giusta)
        assert 'sbagliato questa domanda 3 volte' in pg.inner_text('.qz-avviso')
        # sezione Errori tipici
        el = pg.evaluate("Regole.sezioneTipici().textContent")
        assert 'Temperatura in °C invece che in K' in el and 'Molarità' in el, el
        # JSON rotto -> predefinite
        pg.evaluate("Stato.salva({ id: 'regole-quiz', type: 'regole', updatedAt: 0, json: '{rotto' }, true)")
        assert pg.evaluate("Regole.get().ordineQuiz") == 'scheda'
        assert not errori, errori
        print('TUTTO OK regole: categorie, avviso per tipo, quota deboli, ordine, errori tipici, JSON')
        b.close()
finally:
    srv.terminate()
