# Prova di carico (v0.17): ~4.600 record simulati, tempi di disegno con CPU rallentata 4x, dimensione dei dati.
# Uso: node build.mjs && python3 test/prestazioni.py
# v0.57 (BP6): asserzioni sui budget di CONSTRAINTS.md (tempi, primo disegno < 200 ms di Mese ed Errori, peso app.js).
import http.server, threading, functools, gzip, os
err = []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)
from playwright.sync_api import sync_playwright
http.server.ThreadingHTTPServer.request_queue_size = 128   # Windows: coda più ampia per i caricamenti in parallelo
http.server.SimpleHTTPRequestHandler.protocol_version = 'HTTP/1.1'   # Windows: con HTTP/1.0 la chiusura del socket a volte tronca app.js (ERR_CONNECTION_RESET)
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'..','dist')))
srv.RequestHandlerClass.log_message=lambda *a:None
threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    ctx=p.chromium.launch().new_context(bypass_csp=True, viewport={'width':390,'height':844},locale='it-IT',timezone_id='Europe/Rome')
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    ctx.new_cdp_session(pg).send('Emulation.setCPUThrottlingRate',{'rate':4})
    pg.clock.install(time='2026-12-20T21:00:00+01:00')
    pg.goto('http://127.0.0.1:%d/index.html'%srv.server_address[1]); pg.wait_for_function("Studio.pkStep().length>=3")
    t=pg.evaluate("""(()=>{const t0=performance.now(), R=[], P=k=>Studio.schedeDi(Studio.trovaSotto(k).sub);
      for (const pk of Studio.pkStep()) for (const m of pk.materie) for (const s of m.sottostep) Studio.schedeDi(s).forEach((x,i)=>R.push({id:'prog-'+x.id,type:'progresso',updatedAt:1,fatta:true,data:'2026-11-'+String(10+i%18).padStart(2,'0'),punteggio:50+(i*7)%50,deboli:[['Sbarramento',3,4],['Trabocchetto',1,3]]}));
      for(let i=0;i<600;i++)R.push({id:'dom-x'+i,type:'domanda',updatedAt:1,schedaId:'C-2.1.1-1',titolo:'t',q:'Domanda '+i+' sul tema numero '+i,giusta:'r',volte:1+i%3,giuste:0,ultima:'2026-12-01',esito:'sbagliata'});
      for(let i=0;i<3000;i++)R.push({id:'ntf-'+i,type:'notifica',updatedAt:1,at:0,h:'x',titolo:'t',deleted:i%2===0});
      for(let i=0;i<60;i++)R.push({id:'sim-'+i,type:'simulazione',updatedAt:1,data:'2026-12-01',ora:'09:00',fileId:'f',nome:'S',pct:60+i%30,minuti:45,limite:50,deboli:[['Completamento',8,16]]});
      for(let i=0;i<40;i++)R.push({id:'g-2026-11-'+String(1+i%28).padStart(2,'0')+'x'+i,type:'giorno',updatedAt:1,data:'2026-11-'+String(1+i%28).padStart(2,'0'),sonno:5+i%4,focus:1+i%5});
      for(let i=0;i<500;i++)R.push({id:'ev'+i,type:'evento',updatedAt:1,titolo:'Evento '+i,inizio:'2026-12-'+String(1+i%28).padStart(2,'0')+'T'+String(8+i%10).padStart(2,'0')+':00',fine:'2026-12-'+String(1+i%28).padStart(2,'0')+'T'+String(9+i%10).padStart(2,'0')+':00',tuttoIlGiorno:false,promemoria:[15]});
      Stato.unisci(R); Ripassi.inizializza(); return [R.length, Math.round(performance.now()-t0)]})()""")
    print('record caricati:',t[0],' unione + memoria:',t[1],'ms'); ok(t[1] < 500, 'unione + memoria < 500 ms (%d)' % t[1])
    # primo disegno (INP): una sola interazione = un vai(), compresa l'impaginazione, su una vista mai aperta prima
    PRIMO = "(()=>{const t=performance.now();%s;document.body.offsetHeight;return Math.round(performance.now()-t)})()"
    for nome,js in [('mese',"vai('cal','mese')"),('errori',"UI.studioVista='errori';vai('studio')")]:
        ms = pg.evaluate(PRIMO % js); ok(ms < 200, 'primo disegno %s < 200 ms (%d)' % (nome, ms))
    BUDGET = {'oggi': 130, 'agenda': 230, 'mese': 350, 'errori': 450, 'statistiche': 350}
    for nome,js in [('oggi',"vai('oggi')"),('agenda',"vai('cal','agenda')"),('mese',"vai('cal','mese')"),('errori',"UI.studioVista='errori';vai('studio')"),('statistiche',"UI.studioVista='statistiche';vai('studio')"),('esami',"UI.studioVista='esami';vai('studio')"),('altro',"vai('altro')")]:
        # Un singolo campione sotto throttling 4× oscillava 59–140 ms per il solo scheduling di Chromium.
        # La mediana conserva gli stessi floor e boccia una lentezza sostenuta, non un picco isolato.
        campioni = pg.evaluate("(()=>{const r=[];for(let i=0;i<3;i++){const t=performance.now();%s;disegna();r.push(Math.round(performance.now()-t))}return r})()"%js)
        ms = sorted(campioni)[1]
        print('%-12s %4d ms  campioni=%s'%(nome,ms,campioni))
        if nome in BUDGET: ok(ms < BUDGET[nome], '%s < %d ms (%d)' % (nome, BUDGET[nome], ms))
    pg.evaluate("vai('oggi')")
    ms = pg.evaluate("(()=>{const t=performance.now();Stato.salva({id:'task-prova-tempi',type:'task',updatedAt:0,titolo:'Prova tempi',fatto:false});disegna();return Math.round(performance.now()-t)})()")
    ok(ms < 80, 'salvataggio su Oggi < 80 ms (%d)' % ms)
    print('notifiche calcola %d ms'%pg.evaluate("(()=>{const t=performance.now();Notifiche.calcola();return Math.round(performance.now()-t)})()"))
    print('dimensione dati.json: %d kB'%(pg.evaluate("JSON.stringify(Stato.esporta()).length")//1024)); print('lapidi rimosse:', pg.evaluate('Stato.pulisci()')); print('dopo la pulizia: %d kB'%(pg.evaluate("JSON.stringify(Stato.esporta()).length")//1024)); print('rientrano dalla sync:', pg.evaluate("Stato.unisci([{id:'ntf-0',type:'notifica',updatedAt:1,at:0,h:'x',titolo:'t',deleted:true}])"))
    print('errori:',errs or 'nessuno'); ok(not errs, 'nessun errore di pagina')
kb = len(gzip.compress(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'app.js'), 'rb').read(), 9)) / 1024
ok(kb <= 306, 'app.js gzip <= 306 KB (%d KB)' % kb)
print('TUTTO OK' if not err else '%d FALLITI' % len(err))
