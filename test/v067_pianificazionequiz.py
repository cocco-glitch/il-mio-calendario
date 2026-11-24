# P0.67-A/B/D: quantità, adapter e sessioni brevi dal calendario.
import os, subprocess, sys, http.server, threading, functools
from playwright.sync_api import sync_playwright

RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
r = subprocess.run(['node', 'test/centro.mjs'], cwd=RADICE, text=True, encoding='utf-8', capture_output=True)
if r.returncode or 'Centro 61/61' not in r.stdout:
    print('FAIL P0.67-A/B: contratto PianificazioneQuiz')
    print((r.stdout + '\n' + r.stderr)[-4000:])
    sys.exit(1)
print('TUTTO OK · PianificazioneQuiz quantità e adapter UnitaAI/PianoV1')

DIST = os.path.join(RADICE, 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=DIST))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]

with sync_playwright() as p:
    pg = p.chromium.launch().new_page(viewport={'width': 390, 'height': 844})
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    sessioni = pg.evaluate("""() => {
      const domanda=(micro,i,sk)=>({id:micro+'-'+i,sk,t:'mcq',lv:'Applicativo',q:'Domanda '+micro+' '+i+'?',o:['Corretta','Errata A','Errata B','Errata C'],e:'Spiegazione',ew:['A','B','C']});
      const scheda=(id,k,n,titolo)=>({id,k,n,titolo,tipo:'P',problemi:false,pagine:'',quizFile:''});
      const corso={formato:'pacchetto-studio',tipo:'step',id:'p067-corso',step:3,titolo:'P0.67-D',aggiornato:'2026-11-24',proprio:true,risorse:{libri:{},quiz:{}},materie:[{m:'B',nome:'Biologia',libro:'',sottostep:[{k:'B3.3',n:'3.3',titolo:'Membrane',posizione:'',microstep:[
        {n:'3.3.1',schede:[scheda('B-3.3.1-1',1,1,'Struttura')]},{n:'3.3.2',schede:[scheda('B-3.3.2-1',1,1,'Trasporto')]}]}]}]};
      const voce={k:'B3.3',t:'Membrane'}, piano={formato:'pacchetto-studio',tipo:'piano',id:'p067-piano',titolo:'Piano P0.67-D',aggiornato:'2026-11-24',giorniTeoria:1,livelloIntensita:2,giorni:[{data:'2026-11-24',voci:[voce]}]};
      Studio.importa(corso); Studio.importa(piano);
      Stato.salva({id:'bq-B-3.3.1-1',type:'bancaimc',updatedAt:0,sk:'B-3.3.1-1',pk:'p067',domande:Array.from({length:7},(_,i)=>domanda('3.3.1',i+1,'B-3.3.1-1'))},true);
      Stato.salva({id:'bq-B-3.3.2-1',type:'bancaimc',updatedAt:0,sk:'B-3.3.2-1',pk:'p067',domande:Array.from({length:4},(_,i)=>domanda('3.3.2',i+1,'B-3.3.2-1'))},true);
      const r=CreaQuiz.sessioniDalPiano(piano,voce); CreaQuiz.dalPiano(piano,voce);
      return r.map(x=>[x.microstep,x.richieste,x.disponibili,x.domande.length]);
    }""")
    if sessioni != [['3.3.1', 6, 7, 6], ['3.3.2', 6, 4, 4]]:
        print('FAIL P0.67-D: sessioni dal piano', sessioni); sys.exit(1)
    pg.get_by_role('button', name='Avvia sessione 3.3.1 con 6 di 6 domande pronte; banca 7').click()
    pg.wait_for_selector('.qz-app')
    if '3.3.1' not in pg.locator('.qz-testa').inner_text():
        print('FAIL P0.67-D: il quiz non conserva il microstep'); sys.exit(1)
    if 'di 6' not in pg.locator('.qz-stat').inner_text():
        print('FAIL P0.67-D: il quiz non contiene 6 domande'); sys.exit(1)
    print('TUTTO OK - P0.67-D calendario -> sessione breve collegata al microstep')

srv.shutdown()
