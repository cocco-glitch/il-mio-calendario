# Test v0.16: errori ricorrenti domanda per domanda (dalla sezione «Da rivedere» dei quiz).
import os, http.server, threading, functools, json
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

# Stessa struttura del motore dei quiz: .review > details > summary + .inner p.pair (b.w / b.r) + p spiegazione
QUIZ = r'''<!doctype html><html><head></head><body><main id="app"></main><button id="r1">r1</button><button id="r2">r2</button><button id="rr">rr</button>
<script>var app=document.getElementById('app');
var Q={1:['Quanto vale R nei gas perfetti?','0,0821 L·atm/(mol·K)','R è la costante universale dei gas.'],2:['Che cos\'è la pressione parziale?','La pressione del singolo gas','Legge di Dalton.']};
function dom(n,retry){app.innerHTML='<div class="stat"><span>Domanda <b>1</b> di '+n+(retry?' · ripasso errori':'')+'</span></div>'}
function fine(ok,n,bad){var h='<div class="score"><div class="big">'+ok+'<small> / '+n+'</small></div><div class="pct">'+Math.round(ok*100/n)+'% di risposte corrette</div></div>';
 if(bad.length){h+='<div class="review"><h2>Da rivedere ('+bad.length+')</h2>';bad.forEach(function(k){h+='<details><summary>'+Q[k][0]+'</summary><div class="inner"><p class="pair"><b class="w">La tua risposta:</b> boh</p><p class="pair"><b class="r">Risposta corretta:</b> '+Q[k][1]+'</p><p>'+Q[k][2]+'</p><p class="pair">Ripassa: libro</p></div></details>'});h+='</div><div class="review"><h2>Cosa ripassare</h2><p class="pair"><b>2 errori:</b> libro</p></div>'}
 app.innerHTML=h}
function run(n,retry,ok,bad){dom(n,retry);setTimeout(function(){fine(ok,n,bad)},50)}
document.getElementById('r1').onclick=function(){run(10,false,8,[1,2])};
document.getElementById('r2').onclick=function(){run(10,false,9,[1])};
document.getElementById('rr').onclick=function(){run(1,true,1,[])};
</script></body></html>'''

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-12T16:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("Studio.pkStep().length >= 3")
    sid = pg.evaluate("Studio.schedeDi(Studio.trovaSotto('C2.1').sub)[3].id")
    pg.evaluate("""(html => { const f = document.createElement('iframe'); f.id = 'q'; f.setAttribute('sandbox', 'allow-scripts'); f.srcdoc = Cattura.inietta(html); f.style.cssText = 'position:fixed;bottom:0;left:0;width:200px;height:120px;z-index:99999'; document.body.appendChild(f); Cattura.osserva(f, '%s', 'Prova'); })(%s)""" % (sid, json.dumps(QUIZ)))
    fq = pg.frame_locator('#q'); fq.locator('#r1').wait_for()
    D = lambda: {d['q'][:12]: (d['volte'], d['giuste'], d['esito']) for d in pg.evaluate("Domande.tutte()")}

    fq.locator('#r1').click(); pg.wait_for_timeout(400)
    d = D()
    ok(d == {'Quanto vale ': (1, 0, 'sbagliata'), "Che cos'è la": (1, 0, 'sbagliata')}, 'primo quiz: 2 domande sbagliate %s' % d)
    r = pg.evaluate("Domande.tutte().find(x => x.q.startsWith('Quanto'))")
    ok(r['giusta'] == '0,0821 L·atm/(mol·K)' and r['spieg'] == 'R è la costante universale dei gas.' and 'C2.1' not in r['titolo'] and 'Chi 2.1' in r['titolo'], 'risposta corretta e spiegazione lette (%s)' % r['titolo'])
    fq.locator('#r2').click(); pg.wait_for_timeout(400)
    d = D()
    ok(d['Quanto vale '] == (2, 0, 'sbagliata') and d["Che cos'è la"] == (1, 1, 'giusta'), 'secondo quiz: Q1 ricorrente, Q2 risolta %s' % d)
    ok(pg.evaluate("Domande.ricorrenti().length") == 1, '1 domanda ricorrente')
    fq.locator('#rr').click(); pg.wait_for_timeout(400)
    d = D()
    ok(d['Quanto vale '] == (2, 1, 'giusta') and d["Che cos'è la"] == (1, 1, 'giusta'), 'rifai gli errori: Q1 ora giusta, Q2 non ricontata %s' % d)
    pg.locator('#avvisi .avviso').last.dispatch_event('click'); pg.wait_for_timeout(200)
    ok(D()['Quanto vale '] == (2, 0, 'sbagliata'), 'annulla: Q1 torna sbagliata')
    # Interfaccia: Studio → Errori
    pg.evaluate("document.getElementById('q').remove(); UI.studioVista = 'errori'; vai('studio')"); pg.wait_for_selector('text=Domande sbagliate')
    t = pg.inner_text('body')
    ok('Ricorrenti 1' in t and 'Quanto vale R' in t and '0,0821' not in t, 'ricorrenti: domanda visibile, risposta nascosta')
    pg.click('text=Prima prova a rispondere, poi mostra la risposta'); pg.wait_for_timeout(100)
    ok('0,0821' in pg.inner_text('body'), 'mostra risposta')
    pg.screenshot(path='test/domande.png', full_page=True)
    pg.click('text=✓ La sapevo'); pg.wait_for_timeout(200)
    ok(pg.evaluate("Domande.ricorrenti().length") == 0 and 'Ricorrenti 0' in pg.inner_text('body'), 'la sapevo → esce dalle ricorrenti')
    # Riquadro in Oggi
    pg.evaluate("Domande.segna(Domande.tutte()[0].id, false); Domande.segna(Domande.tutte()[0].id, false); vai('oggi')"); pg.wait_for_timeout(200)
    ok('domanda ricorrente' in pg.inner_text('body'), 'Oggi: riquadro errori con le ricorrenti')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
