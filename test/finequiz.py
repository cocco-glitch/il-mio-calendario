# Test blocco 5 (motore unificato, N4): riquadro «Consolida» a fine quiz nell'app (decisione utente 26/11: niente modale).
# Quiz C-3.1.1-1 in Allenamento Neuro: 1 illusione (certezza 3, sbagliata) → riquadro prima di «Da rivedere» con
# carte e blocco note; «Entrambi» crea la carta comparativa e apre l'appunto Cornell con origine; poi un giro tutto
# giusto: nessun riquadro e riga «Tutto solido». 0 chiamate AI.
import json, re, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

PORTA = 8766
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORTA), '-d', 'dist', '--protocol', 'HTTP/1.1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    with socket.socket() as _s:
        if _s.connect_ex(('127.0.0.1', PORTA)) == 0: break
    time.sleep(.1)
err, rete_ai = [], []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)
TROVA = """async () => { const B = await Banca.carica(3); const N = s => String(s).replace(/<[^>]+>/g, ' ').replace(/[^A-Za-z0-9àèéìòù]+/g, '').toLowerCase();
    const vis = N(document.querySelector('.qz-domanda').textContent);
    const c = B.domande.filter(d => d.sk==='C-3.1.1-1').map(d => ({ d, k: N(d.q).slice(0, 40) })).filter(x => x.k && vis.includes(x.k)).sort((a, b) => b.k.length - a.k.length);
    return c.length ? c[0].d : null; }"""
def rispondi(pg, giusto):
    pg.click('.qz-cert [data-cert="3"]')
    d = pg.evaluate(TROVA)
    assert d, 'domanda mostrata non trovata nella banca'
    if d['t'] == 'mcq':
        # bottone più simile (bigrammi, Dice) a ciascuna opzione: robusto a formule e markup resi diversamente
        pg.evaluate("""([o, giusto]) => { const N = s => String(s).replace(/<[^>]+>/g, ' ').replace(/[^A-Za-z0-9àèéìòù]+/g, '').toLowerCase();
            const bg = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
            const dice = (a, b) => { const A = bg(a), B = bg(b); let c = 0, n = 0; A.forEach((v, g) => { c += Math.min(v, B.get(g) || 0); n += v; }); B.forEach(v => { n += v; }); return n ? 2 * c / n : 0; };
            const b = [...document.querySelectorAll('.qz-opz-b')], t = b.map(x => N(x.textContent));
            const sim = t.map(x => o.map(y => dice(x, N(y))));
            const giu = sim.map(r => r.indexOf(Math.max(...r)) === 0);
            const i = giusto ? sim.map(r => r[0]).indexOf(Math.max(...sim.map(r => r[0]))) : giu.indexOf(false);
            b[i].click(); }""", [d['o'], giusto])
    else:
        pg.fill('#qz-ans', d['a'][0] if giusto else 'risposta volutamente sbagliata zzz'); pg.click('.qz-fill button[type=submit]')
    pg.wait_for_selector('#qz-why')
    return d
def giro(pg, sbagliate):
    prima = None
    n = pg.locator('.qz-metro span').count()
    for k in range(n):
        if k: pg.click('[data-az=avanti]')
        d = rispondi(pg, k >= sbagliate)
        if k == 0: prima = d
    pg.click('[data-az=avanti]'); pg.wait_for_selector('.qz-punti')
    return prima
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
        pg.add_init_script("try { localStorage.setItem('imc-quiz-modo','neuro') } catch (e) {}")
        pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
        for host in ['api.groq.com', 'generativelanguage.googleapis.com', 'api.xkiro.com', 'api.cohere.com', 'router.requesty.ai']:
            pg.route('https://' + host + '/**', lambda route: (rete_ai.append(route.request.url), route.abort()))
        pg.goto('http://localhost:%d/index.html' % PORTA); pg.wait_for_timeout(1500)
        pg.evaluate("() => { const t = trovaScheda('C-3.1.1-1'); QuizApp.apri(t.pk, t.m, t.micro, t.s); }")
        pg.wait_for_selector('.qz-domanda', timeout=8000)
        d0 = giro(pg, 1)
        pg.wait_for_selector('.finequiz', timeout=8000)
        ok(pg.locator('.foglio').count() == 0, 'nessuna finestra modale sopra il risultato')
        pg.locator('.finequiz').scroll_into_view_if_needed(); pg.screenshot(path='test/finequiz-riquadro.png')
        ordine = pg.evaluate("(() => { const b = document.querySelector('.qz-carta'), f = b.querySelector('.finequiz'), h3 = b.querySelector(':scope > h3'); return !!h3 && !!(f.compareDocumentPosition(h3) & Node.DOCUMENT_POSITION_FOLLOWING); })()")
        ok(ordine, 'riquadro prima di «Da rivedere»')
        t = pg.inner_text('.finequiz')
        ok('1 illusione' in t and 'Flashcard mirate' in t and 'Blocco note' in t and 'Entrambi' in t and 'Lascia decidere' in t, 'riquadro: 1 illusione e le opzioni (%s)' % t.replace('\n', ' | ')[:160])
        ok(pg.locator('[data-az=errori]').is_visible() and pg.locator('.qz-carta h3').is_visible(), '«Rifai solo gli errori» e «Da rivedere» restano visibili e cliccabili')
        ok(pg.evaluate("Carte.carteDi('mz-errori').length") == 0, "carteAuto 'proponi': nessuna carta prima della scelta")
        pg.click('[data-fine=entrambi]'); pg.wait_for_timeout(400)
        carte = pg.evaluate("Carte.carteDi('mz-errori')")
        ok(len(carte) == 1 and carte[0]['tag'] == 'illusione' and carte[0]['mazzo'] == 'mz-err-C3.1' and carte[0]['origine']['domande'] == [d0['id']], 'una carta per la domanda, nel mazzo dello step, con origine (%s)' % json.dumps(carte)[:200])
        if d0['t'] == 'mcq':
            ok('e non «' in carte[0]['f'] and carte[0]['f'].rstrip().endswith('»?'), 'carta comparativa «Perché X e non Y?»')
        ap = pg.evaluate("Stato.tutti('appunto').filter(a => a.origine && a.origine.tipo === 'quiz')")
        ok(len(ap) == 1 and ap[0]['origine']['scheda'] == 'C-3.1.1-1' and ap[0]['sub'] == 'C3.1' and '## Errori e correzioni' in ap[0]['testo'] and '## Con parole mie' in ap[0]['testo'] and '::' not in ap[0]['testo'], 'appunto Cornell con origine quiz e step collegato')
        ok(pg.locator('.appunto-titolo').count() == 1, 'si apre l\'editor dell\'appunto')
        ok(pg.evaluate("Appunti.sezioni(Stato.tutti('appunto').find(a => a.origine)).some(s => s.spunti.length >= 1)"), 'la sezione degli errori ha spunti per «Copri e ricorda»')
        pg.locator('.visore button', has_text='Chiudi').last.click(); pg.wait_for_timeout(300)
        ok(pg.locator('.appunto-titolo').count() == 0 and re.search(r'cart[ae] creat', pg.inner_text('.finequiz')) is not None and pg.locator('.finequiz button', has_text='Ripassale ora').count() == 1, 'il riquadro mostra l\'esito e «Ripassale ora»')
        # secondo giro: tutto giusto → niente riquadro, «Tutto solido»
        pg.click('[data-az=tutto]'); pg.wait_for_selector('.qz-domanda')
        giro(pg, 0)
        pg.wait_for_selector('.qz-solido', timeout=8000)
        ok(pg.locator('.finequiz').count() == 0 and re.search(r'Tutto solido · prossimo ripasso (dello step|delle domande) il \d\d/\d\d', pg.inner_text('.qz-solido')) is not None, 'tutto giusto e sicuro: nessun riquadro, riga «Tutto solido» (%s)' % pg.inner_text('.qz-solido'))
        ok(pg.evaluate("Carte.carteDi('mz-errori').length") == 1, 'nessuna carta nuova al secondo giro')
        pg.screenshot(path='test/finequiz.png')
        b.close()
finally:
    srv.terminate()
ok(not rete_ai, '0 chiamate AI (%d)' % len(rete_ai))
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
