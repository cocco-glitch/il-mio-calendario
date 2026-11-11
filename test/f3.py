# Test F3 ridotta (v0.9): lettura automatica del risultato dei quiz, Annulla, "rifai solo gli errori".
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

# Quiz finto con la stessa schermata finale del motore dei quiz dell'utente (classi e testi).
FINTO = r'''<!doctype html><html><head><meta charset="utf-8"></head><body><main id="app"></main>
<button id="fine">fine</button><button id="retry">retry</button><button id="again">again</button>
<script>
var app=document.getElementById('app');
function domanda(n,tot,r){app.innerHTML='<div class="stat"><span>Domanda <b>'+n+'</b> di '+tot+(r?' · ripasso errori':'')+'</span><span>Punteggio <b>0</b></span></div>';}
function finale(s,n,liv){var pc=Math.round(s*100/n);var h='<section class="card"><div class="score"><div class="big">'+s+'<small> / '+n+'</small></div><div class="pct">'+pc+'% di risposte corrette</div><p class="msg">x</p></div><div class="levels"><h2>Per tipo di domanda</h2>';
 liv.forEach(function(l){h+='<div class="lvrow"><span>'+l[0]+'</span><span class="bar"><span class="fill"></span></span><span class="n">'+l[1]+'/'+l[2]+'</span></div>'});
 h+='<p class="weak"><b>Punto debole:</b> Trabocchetto (2 errori su 3, 67%)</p><p class="weak"><b>Suggerimenti usati:</b> 1</p></div></section>';app.innerHTML=h;}
domanda(1,16,false);
document.getElementById('fine').onclick=function(){domanda(1,16,false);setTimeout(function(){finale(12,16,[['Sbarramento',3,3],['Applicativo',6,7],['Trabocchetto',1,3],['Completamento',2,3]])},50)};
document.getElementById('retry').onclick=function(){domanda(1,4,true);setTimeout(function(){finale(3,4,[['Trabocchetto',2,2],['Applicativo',1,2]])},50)};
document.getElementById('again').onclick=function(){domanda(1,16,false);setTimeout(function(){finale(15,16,[['Sbarramento',3,3]])},50)};
</script></body></html>'''

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(viewport={'width': 390, 'height': 844}, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-12T10:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("Studio.pkStep().length >= 3")
    ok('</body>' in pg.evaluate("Cattura.inietta('<html><body>x</body></html>')") and 'quiz-risultato' in pg.evaluate("Cattura.inietta('<html><body>x</body></html>')"), 'osservatore aggiunto solo alla copia')
    # Tutte le prioritarie di C2.1 fatte tranne una: il quiz dell'ultima completa il sotto-step
    ids = pg.evaluate("Studio.schedeDi(Studio.trovaSotto('C2.1').sub).filter(x => x.tipo === 'P').map(x => x.id)")
    for sid in ids[:-1]: pg.evaluate("Studio.segna('%s', { fatta: true, data: '2026-11-02', punteggio: 80 })" % sid)
    ultima = ids[-1]
    ok(not pg.evaluate("Ripassi.mem('C2.1')"), 'sotto-step non ancora completo')
    pg.evaluate("""(html => { const f = document.createElement('iframe'); f.id = 'q'; f.setAttribute('sandbox', 'allow-scripts'); f.srcdoc = Cattura.inietta(html); f.style.cssText = 'position:fixed;top:0;left:0;width:300px;height:300px;z-index:99999;background:#fff'; document.body.appendChild(f); Cattura.osserva(f, '%s', 'Prova'); })(%s)""" % (ultima, json.dumps(FINTO)))
    fq = pg.frame_locator('#q'); fq.locator('#fine').wait_for()

    # 1) Fine del quiz → salvato in automatico
    fq.locator('#fine').click(); pg.wait_for_timeout(400)
    pr = pg.evaluate("Studio.prog('%s')" % ultima)
    ok(pr and pr['fatta'] and pr['punteggio'] == 75 and pr['data'] == '2026-11-12', 'risultato salvato: 75%%, oggi (%s)' % pr)
    ok(pr.get('deboli') == [['Sbarramento', 3, 3], ['Applicativo', 6, 7], ['Trabocchetto', 1, 3], ['Completamento', 2, 3]], 'tipi di domanda salvati')
    ok(pg.evaluate("!!Ripassi.mem('C2.1')"), 'sotto-step completato → entra nei ripassi')
    t = pg.inner_text('#avvisi')
    ok('Salvato 75% (12/16)' in t and 'Trabocchetto' in t and 'annullare' in t, 'avviso: %s' % t.replace('\n', ' '))

    # 2) Annulla → tutto come prima (anche la memoria)
    pg.locator('#avvisi >> text=Salvato').first.dispatch_event('click'); pg.wait_for_timeout(300)
    pr = pg.evaluate("Studio.prog('%s')" % ultima)
    ok(not pr or not pr.get('fatta'), 'annullato: scheda di nuovo da fare')
    ok(not pg.evaluate("Ripassi.mem('C2.1')"), 'annullato: niente memoria del sotto-step')

    # 3) Rifaccio il quiz intero → salvato di nuovo; poi "rifai solo gli errori" → solo nota
    fq.locator('#again').click(); pg.wait_for_timeout(400)
    ok(pg.evaluate("Studio.prog('%s').punteggio" % ultima) == 94, 'quiz rifatto: 94%')
    fq.locator('#retry').click(); pg.wait_for_timeout(400)
    pr = pg.evaluate("Studio.prog('%s')" % ultima)
    ok(pr['punteggio'] == 94 and 'Errori rifatti 12/11: 3/4' in (pr.get('nota') or ''), 'rifai solo gli errori: punteggio invariato, nota «%s»' % pr.get('nota'))

    # 4) Messaggi da altre fonti ignorati
    pg.evaluate("window.postMessage({ imc: 'quiz-risultato', pct: 5, giuste: 1, totale: 20, livelli: [], debole: null, errori: false }, '*')"); pg.wait_for_timeout(300)
    ok(pg.evaluate("Studio.prog('%s').punteggio" % ultima) == 94, 'messaggi non dal quiz aperto: ignorati')

    # 5) La stessa schermata finale non si salva due volte
    n = pg.evaluate("Stato.prendi('mem-sub-C2.1').n")
    fq.locator('#fine').click(); pg.wait_for_timeout(300); fq.locator('#fine').click(); pg.wait_for_timeout(300)
    ok(pg.evaluate("Studio.prog('%s').punteggio" % ultima) == 75, 'nuovo risultato aggiornato')
    ok(pg.evaluate("Stato.prendi('mem-sub-C2.1').n") == n, 'stessa giornata: correzione, non ripasso in più')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
