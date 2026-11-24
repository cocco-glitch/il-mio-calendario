# P0.66 fasi 1-2: generazioni 5/10/20 e libro virtuale multi-file su coda/checkpoint esistenti.
import os, http.server, threading, functools
from playwright.sync_api import sync_playwright

RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err = []

def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)

FONTE = '''
La membrana cellulare e' formata da un doppio strato di fosfolipidi. Le teste idrofile guardano gli ambienti acquosi e le code idrofobe l'interno.

Le proteine di membrana funzionano come canali, trasportatori o recettori. La diffusione semplice segue il gradiente e non richiede energia.

Il trasporto attivo puo' muovere soluti contro gradiente e richiede energia. Il colesterolo contribuisce alla fluidita' della membrana.
'''

PREPARA = r"""
window.domanda66 = (i, pagina) => ({tipo:'mcq',livello:2,
  domanda:'Nel caso concettoMembrana'+i+', quale proprieta descrive la membrana cellulare?',
  opzioni:['Regola selettivamente gli scambi tramite lipidi e proteine '+i,'Conserva il DNA nel citoplasma '+i,'Produce cellulosa nelle cellule animali '+i,'Separa i cromosomi durante la mitosi '+i],
  spiegazione:'Il doppio strato e le proteine regolano selettivamente gli scambi nel caso '+i+'. [[Fonte, p. '+pagina+']]',
  spiegazioneDistrattori:['Il DNA non costituisce la funzione selettiva della membrana nel caso '+i+'.','La cellulosa appartiene alla parete vegetale e non alla membrana animale '+i+'.','La separazione cromosomica dipende dal fuso e non dal trasporto di membrana '+i+'.'],
  distractorTypes:['confusione_struttura','generalizzazione_errata','processo_non_pertinente'],
  erroreTipico:'Confondere la membrana con altre strutture nel caso '+i,fonte:'Pagina '+pagina});
window.mock66 = (da=0) => { let i=da; return async m => { const n=Number(/esattamente (\d+)/.exec(m[1].content)[1]);
  const pagina=Number((/--- PAGINA (\d+) ---/.exec(m[1].content)||[])[1]||1);
  return {prov:'fixture',modello:'fixture-v1',j:{formato:'quiz-v4',quiz:Array.from({length:n},()=>domanda66(++i,pagina))}}; }; };
"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 375, 'height': 800})
    page.goto(URL); page.wait_for_selector('.tabbar'); page.evaluate('caricaStrumentiQuiz()'); page.evaluate(PREPARA)
    account = page.evaluate('CodaQuiz.accountAttuale()')

    for quantita in (5, 10, 20):
        page.evaluate('CodaQuiz.svuotaTutto()')
        r = page.evaluate("""async ([acc,fonte,q]) => {
          const l=await CodaQuizRunner.creaDaTesto(acc,fonte,{quantita:q,materia:'Biologia',argomento:'membrana',maxPerBatch:5,maxCaratteriFonte:3000},'p066-'+q);
          const chiama=mock66(); let x=await CodaQuizRunner.avanza(acc,'runner-66',{chiama}), pausa='';
          if(q===20){ const p=await CodaQuiz.pausa(acc,l.id); pausa=p.stato; const fermo=await CodaQuizRunner.avanza(acc,'runner-66',{chiama});
            if(fermo.esito!=='vuoto') throw new Error('la pausa non ferma il runner'); await CodaQuiz.riprendi(acc,l.id); }
          let guardia=0; while(x.esito==='checkpoint'){ x=await CodaQuizRunner.avanza(acc,'runner-66',{chiama}); if(++guardia>10) throw new Error('coda non termina'); }
          const z=x.lavoro; return {esito:x.esito,stato:z.stato,pronte:z.risultati.length,revisioni:z.revisioni.length,
            checkpoint:z.checkpoint.length,ids:new Set(z.risultati.map(v=>v.id)).size,pausa};
        }""", [account, FONTE, quantita])
        ok(r['esito'] == 'completato' and r['stato'] == 'completato' and r['pronte'] == quantita and r['ids'] == quantita,
           '%d domande: completate e senza duplicati (%s)' % (quantita, r))
        attesi = {5: 1, 10: 2, 20: 4}[quantita]  # solo micro-batch provider: il formato storico da 18 non segmenta la coda
        ok(r['revisioni'] == 0 and r['checkpoint'] == attesi, '%d domande: checkpoint e validazione coerenti' % quantita)
        if quantita == 20: ok(r['pausa'] == 'in_pausa', '20 domande: pausa e ripresa della stessa coda verificate')

    # Fase 2: due PDF diventano un solo libro virtuale. La stessa coda riparte dopo reload e conserva la mappa delle pagine.
    page.evaluate('CodaQuiz.svuotaTutto()')
    fase2 = page.evaluate("""async acc => {
      const docs=[
        {id:'volume-a.pdf',nome:'Volume A.pdf',versione:'sha256:a',pagine:[{n:1,testo:%s},{n:2,testo:%s}]},
        {id:'volume-b.pdf',nome:'Volume B.pdf',versione:'sha256:b',pagine:[{n:3,testo:''},{n:4,testo:%s}]}
      ];
      const l=await CodaQuizRunner.creaDaLibroPdf(acc,docs,{quantita:10,materia:'Biologia',argomento:'membrana',maxPerBatch:5,maxCaratteriFonte:3000});
      const p=CodaQuizRunner.prompt(l,1,l.input.pagine);
      const x=await CodaQuizRunner.avanza(acc,'runner-libro',{chiama:mock66()});
      await CodaQuiz.pausa(acc,l.id);
      return {id:l.id,tipo:l.sorgente.tipo,pagine:l.input.pagine.map(v=>[v.n,v.fileNome,v.paginaFile]),
        fonti:l.input.fonti.map(v=>[v.nome,v.primaPagina,v.ultimaPagina,v.pagineVuote]),checkpoint:x.lavoro.checkpoint.length,
        prompt:p[1].content.includes('Volume B.pdf · pagina originale 4')};
    }""" % tuple(__import__('json').dumps(x) for x in (FONTE, FONTE, FONTE)), account)
    ok(fase2['tipo'] == 'libro_pdf' and fase2['pagine'] == [[1, 'Volume A.pdf', 1], [2, 'Volume A.pdf', 2], [3, 'Volume B.pdf', 4]],
       'libro virtuale: numeri globali e rimandi a file/pagina originali')
    ok(fase2['fonti'] == [['Volume A.pdf', 1, 2, 0], ['Volume B.pdf', 3, 3, 1]] and fase2['prompt'],
       'libro virtuale: indice dei file persistito e origine esposta al prompt')
    page.reload(); page.wait_for_selector('.tabbar'); page.evaluate('caricaStrumentiQuiz()'); page.evaluate(PREPARA)
    ripresa = page.evaluate("""async ([acc,id]) => {
      await CodaQuiz.riprendi(acc,id); const chiama=mock66(5); let x=await CodaQuizRunner.avanza(acc,'runner-libro',{chiama});
      let guardia=0; while(x.esito==='checkpoint'){ x=await CodaQuizRunner.avanza(acc,'runner-libro',{chiama}); if(++guardia>5) throw new Error('libro non termina'); }
      const z=x.lavoro; return {esito:x.esito,pronte:z.risultati.length,checkpoint:z.checkpoint.length,ids:new Set(z.risultati.map(v=>v.id)).size,fonti:z.input.fonti.length};
    }""", [account, fase2['id']])
    ok(ripresa == {'esito':'completato','pronte':10,'checkpoint':2,'ids':10,'fonti':2},
       'libro virtuale: pausa, reload e ripresa riusano coda e checkpoint senza duplicati')

    # Provider reale stretto: se il modello non puo' sostenere 5 domande insieme, il runner deve
    # ridurre il micro-batch invece di inviare comunque il prompt e restituire "testo troppo lungo".
    page.evaluate('CodaQuiz.svuotaTutto()')
    adattivo = page.evaluate(r"""async acc => {
      const vecchioPiano=IA.pianificaBudgetCaratteri, vecchiaChiamata=IA.chiedi, vecchiaValida=CodaQuizQualita.validaDomande;
      let progressivo=0, piani=[], chiamate=[];
      try {
        IA.pianificaBudgetCaratteri=async (_ruolo,out) => {
          piani.push(out); return out>900 ? null : {caratteri:3500,prov:'groq',modello:'openai/gpt-oss-120b',guardia:false};
        };
        IA.chiedi=async (m,_ruolo,o) => {
          chiamate.push(o.maxOut);
          if(o.maxOut>900) throw new Error('Il testo è troppo lungo per i modelli disponibili: accorcialo, oppure aggiungi la chiave Gemini.');
          if(m.reduce((s,x)=>s+x.content.length,0)>3500) throw new Error('Il testo è troppo lungo per i modelli disponibili: accorcialo, oppure aggiungi la chiave Gemini.');
          const n=Number(/esattamente (\d+)/.exec(m[1].content)[1]);
          const pagina=Number((/--- PAGINA (\d+) ---/.exec(m[1].content)||[])[1]||1);
          return {prov:'groq',modello:'openai/gpt-oss-120b',j:{formato:'quiz-v4',quiz:Array.from({length:n},()=>domanda66(++progressivo,pagina))}};
        };
        CodaQuizQualita.validaDomande=qs => qs.map(q => ({id:q.id,domanda:q,stato:'pronta',tentativi:0,motivi:[],pagine:[1]}));
        const pagineA=Array.from({length:38},(_,i)=>({n:i+1,testo:'membrana cellulare volume A capitolo '+(i+1)+' '+%s.slice(0,90)}));
        const pagineB=Array.from({length:37},(_,i)=>({n:i+1,testo:'membrana cellulare volume B capitolo '+(i+1)+' '+%s.slice(0,90)}));
        const l=await CodaQuizRunner.creaDaLibroPdf(acc,[
          {id:'libro-a.pdf',nome:'Libro A.pdf',versione:'sha256:38',pagine:pagineA},
          {id:'libro-b.pdf',nome:'Libro B.pdf',versione:'sha256:37',pagine:pagineB}],
          {quantita:5,materia:'Biologia',argomento:'membrana',maxPerBatch:5,maxCaratteriFonte:12000});
        let x=await CodaQuizRunner.avanza(acc,'runner-adattivo'), guardia=0;
        while(x.esito==='checkpoint'){ x=await CodaQuizRunner.avanza(acc,'runner-adattivo'); if(++guardia>10) throw new Error('batch adattivo non termina'); }
        return {esito:x.esito,pronte:x.lavoro.risultati.length,checkpoint:x.lavoro.checkpoint.length,piani,chiamate,errore:x.errore||''};
      } finally { IA.pianificaBudgetCaratteri=vecchioPiano; IA.chiedi=vecchiaChiamata; CodaQuizQualita.validaDomande=vecchiaValida; }
    }""" % (__import__('json').dumps(FONTE), __import__('json').dumps(FONTE)), account)
    ok(adattivo['esito'] == 'completato' and adattivo['pronte'] == 5 and adattivo['checkpoint'] == 5
       and adattivo['chiamate'] == [900] * 5 and 3250 in adattivo['piani'],
       'provider stretto: il runner riduce 5 domande a micro-batch da 1 senza falso testo troppo lungo (%s)' % adattivo)
    browser.close()

srv.shutdown()
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)), *err, sep='\n')
raise SystemExit(1 if err else 0)
