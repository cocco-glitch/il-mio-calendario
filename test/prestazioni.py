# Prova di carico (v0.17): ~4.600 record simulati, tempi di disegno con CPU rallentata 4x, dimensione dei dati.
# Uso: node build.mjs && python3 test/prestazioni.py   (stampa i tempi, non fallisce)
import http.server, threading, functools
from playwright.sync_api import sync_playwright
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'..','dist')))
srv.RequestHandlerClass.log_message=lambda *a:None
threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    ctx=p.chromium.launch().new_context(viewport={'width':390,'height':844},locale='it-IT',timezone_id='Europe/Rome')
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
    print('record caricati:',t[0],' unione + memoria:',t[1],'ms')
    for nome,js in [('oggi',"vai('oggi')"),('agenda',"vai('cal','agenda')"),('mese',"vai('cal','mese')"),('errori',"UI.studioVista='errori';vai('studio')"),('statistiche',"UI.studioVista='statistiche';vai('studio')"),('esami',"UI.studioVista='esami';vai('studio')"),('altro',"vai('altro')")]:
        print('%-12s %4d ms'%(nome,pg.evaluate("(()=>{const t=performance.now();%s;disegna();return Math.round(performance.now()-t)})()"%js)))
    print('notifiche calcola %d ms'%pg.evaluate("(()=>{const t=performance.now();Notifiche.calcola();return Math.round(performance.now()-t)})()"))
    print('dimensione dati.json: %d kB'%(pg.evaluate("JSON.stringify(Stato.esporta()).length")//1024)); print('lapidi rimosse:', pg.evaluate('Stato.pulisci()')); print('dopo la pulizia: %d kB'%(pg.evaluate("JSON.stringify(Stato.esporta()).length")//1024)); print('rientrano dalla sync:', pg.evaluate("Stato.unisci([{id:'ntf-0',type:'notifica',updatedAt:1,at:0,h:'x',titolo:'t',deleted:true}])"))
    print('errori:',errs or 'nessuno')
