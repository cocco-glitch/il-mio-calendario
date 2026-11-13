# Test v0.27: Quiz Studio Q5 — domande AI (Groq simulato): controlli, esame alla cieca, coda, approvazione.
import json, re, subprocess, sys, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8771', '-d', 'dist'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); errori = []
GIUSTE = ['Aumenta di dieci volte', 'Il legame ionico', 'Diminuisce la pressione', 'Resta costante']
def dom(i, q, o, d=None):
    return {"lv": "Applicativo", "q": q, "o": o, "ew": ["a", "b", "c", "d"], "e": ["Cosa chiede", "Concetto", "In sintesi"], "cit": "frase"}
GEN = {"domande": [
    dom(0, "Che cosa succede alla concentrazione quando il volume si riduce di dieci volte?", ["Aumenta di dieci volte", "Diminuisce di dieci volte", "Resta uguale", "Raddoppia", "Si dimezza"]),
    dom(1, "Quale legame si forma tra un metallo alcalino e un alogeno in condizioni ordinarie?", ["Il legame ionico", "Il legame covalente puro", "Il legame metallico", "Il legame a idrogeno", "Il legame dativo"]),
    dom(2, "Se la temperatura cala a volume costante cosa succede alla pressione del gas ideale?", ["Diminuisce la pressione", "Aumenta la pressione", "Raddoppia la pressione", "Si annulla", "Oscilla molto"]),
    dom(3, "Domanda con opzioni doppie inserita apposta per il test automatico", ["X", "X", "Y", "Z", "W"]),
    dom(4, "Questa domanda viene sbagliata dal controllo alla cieca apposta nel test?", ["Resta costante", "Cresce sempre", "Cala sempre", "Si annulla", "Raddoppia"]),
]}
def rispondi(route):
    body = json.loads(route.request.post_data)
    u = body['messages'][-1]['content']
    if 'Risolvi ogni domanda' in u:
        out = []
        for n, blocco in enumerate(re.split(r'DOMANDA \d+\n', u)[1:], 1):
            righe = [r for r in blocco.split('\n') if re.match(r'^[A-E]\) ', r)]
            giusta = next((r[0] for r in righe if r[3:] in GIUSTE), 'A')
            if 'sbagliata dal controllo' in blocco: giusta = next(r[0] for r in righe if r[3:] not in GIUSTE)
            out.append({"n": n, "lettera": giusta, "ambigua": False, "motivo": ""})
        c = {"risposte": out}
    else:
        c = GEN
    route.fulfill(status=200, content_type='application/json', body=json.dumps({"choices": [{"message": {"content": json.dumps(c)}}]}))
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 390, 'height': 844})
        pg.on('pageerror', lambda e: errori.append(str(e)))
        pg.route('https://api.groq.com/**', rispondi)
        pg.goto('http://localhost:8771/index.html'); pg.wait_for_function("Studio.pkStep().length >= 3", timeout=20000)
        pg.evaluate("localStorage.setItem('imc-groq-chiave','gsk_finta')")
        # controlli automatici
        assert pg.evaluate("AIGen.controlla({q:'Domanda abbastanza lunga?',o:['a','b','c','d','e'],ew:['1','2','3','4'],e:['x','y']}, [])") is None
        assert pg.evaluate("AIGen.controlla({q:'Domanda abbastanza lunga?',o:['a','b','c','d','e'],ew:['1','2','3','4'],e:['x','y']}, ['domanda abbastanza lunga'])")
        r = pg.evaluate("""async () => { const x = tutteLeSchede().find(x => !x.pk.proprio && x.pk.step === 3);
            window._x = x; return await AIGen.genera(x.pk, x.mat.m, x.mi.n, x.s); }""")
        assert r['inCoda'] == 3, r
        assert len(r['scarti']) == 2, r
        assert pg.evaluate("AIGen.proposte().length") == 3
        # coda: approva una, scarta una, modifica una
        pg.evaluate("AIGen.coda()"); pg.wait_for_selector('.aig-voce')
        assert pg.locator('.aig-voce').count() == 3
        assert pg.locator('.aig-giusta').first.inner_text().startswith('✓')
        pg.wait_for_timeout(800); pg.screenshot(path='/tmp/claude-0/aigen.png')
        pg.locator('.aig-voce button:has-text("Approva")').first.click(); pg.wait_for_timeout(300)
        pg.locator('.aig-voce button:has-text("Scarta")').first.click(); pg.wait_for_timeout(300)
        assert pg.locator('.aig-voce').count() == 1
        assert pg.evaluate("Stato.tutti('modq').filter(r => r.nuova && r.qid.startsWith('q-ai-') && !r.deleted).length") == 1
        # la domanda approvata compare nella banca della scheda
        n = pg.evaluate("""async () => { const x = window._x; const B = await Banca.scheda(x.pk, x.mat.m, x.mi.n, x.s); return B.domande.filter(d => d.id.startsWith('q-ai-')).length; }""")
        assert n == 1, n
        # sezione in Studio → Errori
        assert pg.evaluate("AIGen.sezione().textContent.includes('Da approvare (1)')")
        assert pg.evaluate("AIGen.piuDebole() === null")
        pg.evaluate("Stato.salva({id:'sq-t',type:'statq',updatedAt:0,sk:window._x.s.id,n:4,ok:1,ultima:'',esito:false})")
        assert pg.evaluate("AIGen.piuDebole().s.id === window._x.s.id")
        # chiave mancante: errore chiaro
        pg.evaluate("localStorage.removeItem('imc-groq-chiave')")
        msg = pg.evaluate("async () => { try { const x = window._x; await AIGen.genera(x.pk, x.mat.m, x.mi.n, x.s); return 'nessun errore'; } catch (e) { return e.message; } }")
        assert 'chiave' in msg.lower(), msg
        assert not errori, errori
        print('TUTTO OK domande AI: controlli, esame alla cieca, coda, approvazione')
        b.close()
finally:
    srv.terminate()
