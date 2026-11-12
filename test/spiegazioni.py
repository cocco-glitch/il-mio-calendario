# Test v0.21: riquadro «✨ Spiegazione AI» nei quiz aperti dall'app (Groq simulato).
import json, os, sys
from playwright.sync_api import sync_playwright

QUIZ = '/home/claude/quiz/out/3.2.9 Catalizzatori: omogenei, eterogenei, enzimi (scheda 1 di 1).html'
if not os.path.exists(QUIZ):
    print('SALTATO: quiz di prova non presente'); sys.exit(0)
quiz = open(QUIZ, encoding='utf-8').read()
APP = 'file://' + os.path.abspath('dist/anteprima.html')
chiamate = []
errori = []

def groq(route):
    body = json.loads(route.request.post_data or '{}')
    chiamate.append(body)
    if body['model'] == 'openai/gpt-oss-120b' and len(chiamate) == 3:
        route.fulfill(status=429, body=json.dumps({'error': {'message': 'rate limit'}}), headers={'content-type': 'application/json', 'access-control-allow-origin': '*'})
        return
    route.fulfill(status=200, body=json.dumps({'choices': [{'message': {'content': '**Spiegazione** di prova (' + body['model'] + ')'}}]}),
                  headers={'content-type': 'application/json', 'access-control-allow-origin': '*'})

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.on('pageerror', lambda e: errori.append(str(e)))
    pg.route('https://api.groq.com/**', groq)
    pg.goto(APP); pg.wait_for_timeout(800)
    pg.evaluate("localStorage.setItem('imc-groq-chiave','gsk_test')")
    pg.evaluate("""q => { const f=document.createElement('iframe'); f.className='visore-frame'; f.style.cssText='width:800px;height:900px';
      f.setAttribute('sandbox','allow-scripts allow-popups allow-forms allow-modals'); f.srcdoc=Spiega.inietta(Cattura.inietta(q)); document.body.appendChild(f); }""", quiz)
    pg.wait_for_timeout(800)
    fr = pg.frames[1]
    assert fr.query_selector('.ai-box') is None, 'riquadro prima della risposta'
    fr.click('.opt >> nth=1'); pg.wait_for_timeout(200)
    assert fr.query_selector('.ai-box'), 'manca il riquadro dopo la risposta'
    fr.click('.ai-box button[data-l=breve]'); pg.wait_for_timeout(600)
    t = fr.inner_text('.ai-box')
    assert 'Spiegazione di prova (openai/gpt-oss-120b)' in t and '**' not in t, t
    u = chiamate[0]['messages'][1]['content']
    assert 'Lo studente ha risposto' in u and 'Testo di riferimento' in u and 'Opzioni:' in u, u
    assert fr.query_selector('#expl') is None, 'il riquadro Spiegazione doveva restare chiuso'
    # seconda volta: dalla memoria, nessuna nuova chiamata
    n = len(chiamate)
    fr.click('.ai-box button[data-l=media]'); pg.wait_for_timeout(500)
    fr.click('.ai-box button[data-l=breve]'); pg.wait_for_timeout(500)
    assert len(chiamate) == n + 1, ('cache non usata', len(chiamate))
    assert 'salvata' in fr.inner_text('.ai-box')
    # rigenera con limite raggiunto sul principale -> riserva
    fr.click('.ai-box button[data-f]'); pg.wait_for_timeout(600)
    assert 'llama-3.3-70b-versatile' in fr.inner_text('.ai-box'), fr.inner_text('.ai-box')
    rec = pg.evaluate("Stato.tutti('spiegazione').length")
    assert rec == 2, rec
    # domanda successiva: riquadro nuovo e vuoto
    fr.click('#next'); pg.wait_for_timeout(200)
    fr.click('.opt >> nth=0'); pg.wait_for_timeout(200)
    assert fr.inner_text('.ai-box .ai-out').strip() == ''
    # completamento (fill): ultima domanda
    for _ in range(30):
        if fr.query_selector('#ans'): break
        fr.click('#next'); pg.wait_for_timeout(100)
    fr.fill('#ans', 'sposta'); fr.click('#fillform button[type=submit]'); pg.wait_for_timeout(200)
    fr.click('.ai-box button[data-l=breve]'); pg.wait_for_timeout(500)
    u = chiamate[-1]['messages'][1]['content']
    assert 'Risposta corretta: non sposta' in u and 'Lo studente ha risposto: sposta' in u, u
    # sezione in Altro
    assert pg.evaluate("Spiega.sezione().textContent.includes('Chiave Groq')")
    assert not errori, errori
    print('TUTTO OK spiegazioni AI: riquadro, cache, riserva, completamento')
    b.close()
