# P0.65: collaudo deterministico di scala quando una prova con provider reale non e' disponibile.
# Verifica fixture da 5/50/200 domande, con pausa/ripresa/reload e senza provider reali.
import os, http.server, threading, functools, time
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
La membrana cellulare e' formata da un doppio strato di fosfolipidi. Le teste idrofile sono rivolte verso gli ambienti acquosi, mentre le code idrofobe si dispongono verso l'interno.

Le proteine di membrana possono agire come canali, trasportatori o recettori. Il trasporto selettivo permette alla cellula di regolare gli scambi con l'ambiente.

La diffusione semplice segue il gradiente di concentrazione e non richiede energia metabolica. Il trasporto attivo puo' muovere soluti contro gradiente e richiede energia.

Il colesterolo contribuisce alla fluidita' della membrana. I carboidrati esposti sulla superficie partecipano al riconoscimento cellulare.
'''

PREPARA = r"""
window.__collaudoQ = (i, pagina) => ({
  tipo:'mcq', livello:2,
  domanda:'Nel caso didattico concettoMembrana'+i+', quale funzione descrive correttamente la membrana cellulare?',
  opzioni:['Regola selettivamente gli scambi mediante lipidi e proteine '+i,
    'Conserva direttamente il patrimonio genetico nel citoplasma '+i,
    'Produce la parete di cellulosa in tutte le cellule animali '+i,
    'Separa i cromosomi durante ogni fase del ciclo cellulare '+i],
  spiegazione:'La membrana usa il doppio strato fosfolipidico e proteine specifiche per regolare selettivamente gli scambi nel caso '+i+'. [[Fonte, p. '+pagina+']]',
  spiegazioneDistrattori:[
    'Il patrimonio genetico e conservato nel DNA e non costituisce la funzione selettiva della membrana '+i+'.',
    'La cellulosa appartiene alla parete vegetale e non viene prodotta dalla membrana delle cellule animali '+i+'.',
    'La separazione dei cromosomi dipende dal fuso mitotico e non descrive il trasporto di membrana '+i+'.'],
  distractorTypes:['confusione_struttura','generalizzazione_errata','processo_non_pertinente'],
  erroreTipico:'Confondere la membrana con altre strutture cellulari nel caso '+i,
  fonte:'Pagina '+pagina
});
window.__mockCollaudo = (partenza, provider, modello) => {
  let prossimo = partenza;
  return async (m) => {
    const n = Number(/esattamente (\d+)/.exec(m[1].content)[1]);
    const pm = [...m[1].content.matchAll(/--- PAGINA (\d+) ---/g)].map(x => Number(x[1]));
    const pagina = pm[0] || 1;
    const quiz = Array.from({length:n}, () => window.__collaudoQ(++prossimo, pagina));
    return {prov:provider, modello, j:{formato:'quiz-v4', quiz}};
  };
};
"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 375, 'height': 800})
    page.goto(URL); page.wait_for_selector('.tabbar'); page.evaluate('caricaStrumentiQuiz()'); page.evaluate(PREPARA)
    account = page.evaluate('CodaQuiz.accountAttuale()')
    page.evaluate('CodaQuiz.svuotaTutto()')

    # Fixture minima da 5: il totale coincide col micro-batch, senza eredita' del formato da 18.
    minimo = page.evaluate("""async ([acc, fonte]) => {
      const l=await CodaQuizRunner.creaDaTesto(acc,fonte,{quantita:5,materia:'Biologia',argomento:'membrana cellulare',maxPerBatch:8,maxCaratteriFonte:3000},'collaudo-5');
      const chiama=__mockCollaudo(0,'fixture-minima','fixture-v1');
      const r=await CodaQuizRunner.avanza(acc,'runner-5',{chiama}), x=r.lavoro;
      return {esito:r.esito,pronte:x.risultati.length,checkpoint:x.checkpoint.length,richieste:x.checkpoint.reduce((n,c)=>n+c.richieste,0),ids:new Set(x.risultati.map(q=>q.id)).size};
    }""", [account, FONTE])
    ok(minimo == {'esito':'completato','pronte':5,'checkpoint':1,'richieste':5,'ids':5},
       '5: totale, micro-batch e deduplica restano indipendenti dal formato storico da 18 (%s)' % minimo)

    page.evaluate('CodaQuiz.svuotaTutto()')

    # Percorso principale da 50: fonte -> selezione pagine -> prompt -> checkpoint.
    creato = page.evaluate("""async ([acc, fonte]) => {
      const l=await CodaQuizRunner.creaDaTesto(acc,fonte,{quantita:50,materia:'Biologia',argomento:'membrana cellulare',step:'1.1',microstep:'1.1.1',maxPerBatch:8,maxCaratteriFonte:3000},'collaudo-50');
      const pagine=CodaQuizRunner.selezionaPagine(l,0), prompt=CodaQuizRunner.prompt(l,8,pagine);
      return {id:l.id,pagine:pagine.map(x=>x.n),testo:prompt[1].content};
    }""", [account, FONTE])
    ok(len(creato['pagine']) >= 1 and 'Crea esattamente 8 domande' in creato['testo'] and '--- PAGINA' in creato['testo'],
       '50: selezione della fonte e prompt del micro-batch verificati')

    t0 = time.perf_counter()
    primi = page.evaluate("""async acc => {
      const chiama=__mockCollaudo(0,'fixture-controllata','fixture-v1');
      const a=await CodaQuizRunner.avanza(acc,'runner-50',{chiama});
      const b=await CodaQuizRunner.avanza(acc,'runner-50',{chiama});
      const pausa=await CodaQuiz.pausa(acc,b.lavoro.id);
      const fermo=await CodaQuizRunner.avanza(acc,'runner-50',{chiama});
      return [a.esito,b.esito,b.lavoro.risultati.length,b.lavoro.checkpoint.length,pausa.stato,fermo.esito];
    }""", account)
    ok(primi == ['checkpoint','checkpoint',16,2,'in_pausa','vuoto'], '50: due checkpoint, pausa effettiva e nessun batch aggiuntivo (%s)' % primi)

    page.reload(); page.wait_for_selector('.tabbar'); page.evaluate('caricaStrumentiQuiz()'); page.evaluate(PREPARA)
    finale = page.evaluate("""async acc => {
      let l=(await CodaQuiz.lista(acc))[0]; await CodaQuiz.riprendi(acc,l.id);
      const chiama=__mockCollaudo((l.risultati||[]).length,'fixture-controllata','fixture-v1');
      let r=null, guardia=0;
      do { r=await CodaQuizRunner.avanza(acc,'runner-50b',{chiama}); if(++guardia>12) throw new Error('coda 50 non termina'); }
      while(r.esito==='checkpoint');
      l=r.lavoro; return {esito:r.esito,stato:l.stato,pronte:l.risultati.length,correggere:l.rapportoQualita.daCorreggere,
        rivedere:l.rapportoQualita.daRivedere,checkpoint:l.checkpoint.length,ids:new Set(l.risultati.map(q=>q.id)).size,
        richieste:l.checkpoint.reduce((n,x)=>n+x.richieste,0),ottenute:l.checkpoint.reduce((n,x)=>n+x.ottenute,0),
        provider:[...new Set(l.checkpoint.map(x=>x.provider))],modelli:[...new Set(l.checkpoint.map(x=>x.modello))]};
    }""", account)
    durata50 = time.perf_counter() - t0
    ok(finale['esito']=='completato' and finale['stato']=='completato' and finale['pronte']==50 and finale['ids']==50,
       '50: ripresa dopo reload completa 50 pronte senza duplicati (%s)' % finale)
    ok(finale['correggere']==0 and finale['rivedere']==0 and finale['checkpoint']==7 and finale['richieste']==50 and finale['ottenute']==50,
       '50: totale e contatori dei micro-batch coerenti, senza confini storici da 18')
    ok(finale['provider']==['fixture-controllata'] and finale['modelli']==['fixture-v1'],
       '50: provider e modello dei checkpoint registrati distintamente')

    # Stress deterministico 200: stessa architettura, 25 micro-batch sequenziali da 8.
    page.evaluate('CodaQuiz.svuotaTutto()')
    t1 = time.perf_counter()
    stress = page.evaluate("""async ([acc, fonte]) => {
      await CodaQuizRunner.creaDaTesto(acc,fonte,{quantita:200,materia:'Biologia',argomento:'trasporto di membrana',maxPerBatch:8,maxCaratteriFonte:3000},'collaudo-200');
      const chiama=__mockCollaudo(1000,'fixture-stress','fixture-v1'); let r=null,guardia=0;
      do { r=await CodaQuizRunner.avanza(acc,'runner-200',{chiama}); if(++guardia>30) throw new Error('coda 200 non termina'); }
      while(r.esito==='checkpoint');
      const l=r.lavoro; return {esito:r.esito,pronte:l.risultati.length,revisioni:l.revisioni.length,checkpoint:l.checkpoint.length,
        ids:new Set(l.risultati.map(q=>q.id)).size,richieste:l.checkpoint.reduce((n,x)=>n+x.richieste,0)};
    }""", [account, FONTE])
    durata200 = time.perf_counter() - t1
    ok(stress == {'esito':'completato','pronte':200,'revisioni':0,'checkpoint':25,'ids':200,'richieste':200},
       '200: micro-batch provider indipendenti dal formato storico da 18, integrita e idempotenza (%s)' % stress)
    ok(durata50 < 30 and durata200 < 60, 'collaudi deterministici completati in %.2fs e %.2fs' % (durata50, durata200))
    browser.close()

srv.shutdown()
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)), *err, sep='\n')
raise SystemExit(1 if err else 0)
