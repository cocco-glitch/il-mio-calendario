# Test P0.65: tentativo generato, propagazione e rollback completo (stat/FSRS, errori, carte, progresso, piano fatica).
import os, http.server, threading, functools
from playwright.sync_api import sync_playwright

RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err=[]
def ok(c,m):
    print(('  ok  ' if c else ' FAIL ')+m)
    if not c: err.append(m)

with sync_playwright() as p:
    pg=p.chromium.launch().new_page(viewport={'width':390,'height':844}); pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.evaluate("""() => { localStorage.setItem('imc-quiz-modo','esame');
      const piano={formato:'pacchetto-studio',tipo:'piano',id:'ai-rollback',origine:'ai_neuro',titolo:'Piano rollback',aggiornato:'2026-11-01',giorniTeoria:0,giorni:[],vincoliAI:{materiaCodice:'BIO'},livelloIntensita:0,unita:[]}; Studio.importa(piano);
      window.__aggiornaDeload=Pianificatore.aggiornaDeload; Pianificatore.aggiornaDeload=p=>({...p,nota:'mutato-dal-circuito',deload:{attivo:false,fino:'2026-11-22',livelloTarget:1,livelloRidotto:1,motivo:'test'}});
      window.__undoFatica=0; const cf=PianiAI.controllaFatica; PianiAI.controllaFatica=()=>{const u=cf(); return ()=>{window.__undoFatica++; u();};};
      const id='qc-v065-rollback', q={id:'q-v065',sk:id,t:'mcq',lv:'Applicativo',q:'Quale struttura forma la membrana?',o:['Il doppio strato fosfolipidico','Il DNA nucleare','La parete di cellulosa','Il fuso mitotico'],e:'I fosfolipidi formano un doppio strato selettivo.',ew:['Il DNA non forma la membrana.','La cellulosa forma la parete vegetale.','Il fuso separa i cromosomi.']};
      Stato.salva({id,type:'qcreato',updatedAt:0,titolo:'Rollback',materia:'BIO',argomento:'membrana',cosa:'test',testoIncollato:'',fonti:[],domande:[q],creato:new Date().toISOString(),modelli:[],scartate:0},true);
      const pk={tipo:'step',id:'qc',step:0,titolo:'',aggiornato:'',risorse:{libri:{},quiz:{}},materie:[]}, s={id,k:1,n:1,titolo:'Rollback',tipo:'P',problemi:false,pagine:'',quizFile:''};
      QuizApp.apri(pk,'BIO','membrana',s,()=>[q],{occh:'test',titolo:'Rollback'});
    }""")
    pg.wait_for_selector('.qz-opz-b')
    pg.locator('.qz-opz-b',has_text='DNA nucleare').click(); pg.wait_for_timeout(100)
    prima=pg.evaluate("""() => ({stat:Stato.tutti('statq').map(x=>({n:x.n,ok:x.ok,neuro:x.neuro})), piano:Studio.pkPiani().find(x=>x.id==='ai-rollback').nota,
      errori:Domande.aperte().length, carte:Carte.carte().length})""")
    ok(prima['stat'][0]['n']==1 and prima['stat'][0]['ok']==0 and prima['piano']=='mutato-dal-circuito','errore aggiorna stat/FSRS e circuito fatica')
    ok(prima['errori']==0, 'gli errori di sessione vengono consolidati una sola volta al risultato')
    pg.click('[data-az=avanti]'); pg.wait_for_selector('.qz-punti'); pg.wait_for_timeout(120)
    salvato=pg.evaluate("""() => ({prog:!!Studio.prog('qc-v065-rollback'),errori:Domande.aperte().length,carte:Carte.carte().length,dovuti:CodaRipasso.dovuti().length})""")
    ok(salvato['prog'] and salvato['errori']==1 and salvato['carte']>=1 and salvato['dovuti']>=1,'risultato propagato a Studio, Errori, carte/Ripassa e coda Oggi')
    # Il click ripetuto sul risultato non deve salvare una seconda volta.
    pg.click('[data-az=avanti]') if pg.locator('[data-az=avanti]').count() else None
    pg.wait_for_timeout(50)
    ok(pg.evaluate("Domande.aperte()[0].volte")==1,'salvataggio del tentativo idempotente')
    pg.locator('#avvisi .avviso').last.click(); pg.wait_for_timeout(120)
    dopo=pg.evaluate("""() => { const s=Stato.tutti('statq')[0],p=Studio.pkPiani().find(x=>x.id==='ai-rollback'); Pianificatore.aggiornaDeload=window.__aggiornaDeload;
      return {n:s&&s.n,ok:s&&s.ok,neuro:s&&s.neuro,prog:Studio.prog('qc-v065-rollback')||null,errori:Domande.aperte().length,carte:Carte.carte().length,nota:p.nota||null,dovuti:CodaRipasso.dovuti().length,undoFatica:window.__undoFatica}; }""")
    ok(dopo['n']==0 and dopo['ok']==0 and not dopo['neuro'],'annulla ritira contatori e stato FSRS della carta quiz')
    ok(dopo['prog'] is None and dopo['errori']==0 and dopo['carte']==0 and dopo['nota'] is None,'annulla ritira progresso, Errori, carte e de-load derivato %s' % dopo)

print('\n'+('TUTTO OK' if not err else '%d ERRORI'%len(err)),*err,sep='\n')
raise SystemExit(1 if err else 0)
