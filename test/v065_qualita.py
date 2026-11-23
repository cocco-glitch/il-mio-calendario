# Test P0.65: lint qualitativo, riparazioni zero-token e merge chirurgico protetto.
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

BASE = {
  'id':'bio-001','stepId':'bio-1','scheda':'S01','categoria':'prioritaria','livelloCognitivo':2,'livello':'L2',
  'domanda':'Per quale motivo la membrana contiene fosfolipidi?',
  'opzioni':['Formano un doppio strato selettivo','Producono direttamente il DNA','Costruiscono la parete di cellulosa','Avviano la separazione dei cromosomi'], 'esatta':0,
  'spiegazione':'COSA CHIEDE: la struttura. CONCETTO E MECCANISMO: i fosfolipidi hanno teste idrofile e code idrofobe. RISPOSTA ESATTA: A) Formano un doppio strato selettivo. PERCHÉ GLI ALTRI NO: DNA, cellulosa e cromosomi riguardano processi o strutture differenti. IN SINTESI: il doppio strato crea una barriera selettiva. [[Manuale, p. 12]] ' + ('Approfondimento didattico. ' * 14),
  'spiegazioneDistrattori':['Il DNA è sintetizzato da enzimi e non dai fosfolipidi di membrana.','La cellulosa appartiene alla parete vegetale, non al doppio strato.','I cromosomi si separano durante la mitosi e non formano la membrana.'],
  'distractorTypes':['confusione_termine','misconception','processo_non_pertinente'],'erroreTipico':'Confondere struttura di membrana e processi cellulari','fonte':'Pagina 12','sourceRef':'Pagina 12','coppiaGemellaId':'','tipo':'mcq'
}

with sync_playwright() as p:
    pg = p.chromium.launch().new_page(); pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.evaluate('caricaStrumentiQuiz()')
    E = lambda js, arg=None: pg.evaluate(js, arg)

    # Shuffle già avvenuto: l'identità testuale esplicita consente riallineamento certo di indice e lettera.
    q = dict(BASE); q['opzioni'] = [BASE['opzioni'][1], BASE['opzioni'][2], BASE['opzioni'][0], BASE['opzioni'][3]]; q['esatta'] = 0
    r = E("""q => { const x=Validatore.ripara([q]); return {q:x.qs[0],log:x.log,p:Validatore.analizza(x.qs).problemi}; }""", q)
    ok(r['q']['esatta'] == 2 and 'RISPOSTA ESATTA: C)' in r['q']['spiegazione'], 'shuffle: identità semantica, indice e lettera riallineati')
    ok(not any('RISPOSTA ESATTA' in x['msg'] for x in r['p']), 'riallineamento zero-token supera il ricontrollo')

    # Senza testo della risposta nella spiegazione non si inventa quale indice sia corretto.
    q = dict(BASE); q['esatta'] = 2; q['spiegazione'] = q['spiegazione'].replace('A) Formano un doppio strato selettivo', 'A) La risposta indicata')
    r = E("""q => { const x=Validatore.ripara([q]); return {e:x.qs[0].esatta,p:Validatore.analizza(x.qs).problemi.map(x=>x.msg)}; }""", q)
    ok(r['e'] == 2 and any('RISPOSTA ESATTA' in x for x in r['p']), 'ambiguità: nessuna correzione inventata, problema segnalato')

    # Formati equivalenti della fonte sono normalizzati senza inventare pagine.
    q = dict(BASE); q['fonte'] = 'p. 12'; q['sourceRef'] = ' pagina 12 '
    r = E("q => Validatore.ripara([q]).qs[0]", q)
    ok(r['fonte'] == 'Pagina 12' and r['sourceRef'] == 'Pagina 12', 'sourceRef/fonte equivalenti normalizzati')

    # Duplicati semantici, confutazioni generiche e length bias marcato non passano come qualità.
    q = dict(BASE); q['opzioni'] = ['Il doppio strato lipidico è una struttura selettiva molto articolata e descritta in modo inutilmente prolisso','doppio strato lipidico.','DNA','Cellulosa']
    q['spiegazioneDistrattori'] = ['Questa opzione è sbagliata perché non è la risposta corretta.'] * 3
    r = E("q => Validatore.analizza([q]).problemi.map(x=>[x.sev,x.msg])", q)
    msgs = [x[1] for x in r]
    ok(any('semanticamente duplicate' in x for x in msgs), 'distrattori semanticamente duplicati rilevati')
    ok(any('generiche' in x for x in msgs), 'confutazioni generiche rilevate anche se abbastanza lunghe')
    ok(any('marcatamente più lunga' in x for x in msgs), 'length bias relativo marcato rilevato')

    # Bloom: si valuta la struttura complessiva, non il solo numero dichiarato.
    q = dict(BASE); q['livelloCognitivo'] = 4; q['livello'] = 'L4'; q['domanda'] = 'Qual è la definizione di membrana cellulare?'
    r = E("q => Validatore.analizza([q]).problemi.map(x=>x.msg)", q)
    ok(any('Bloom L4' in x for x in r), 'L4 dichiarato ma quesito di puro recupero segnalato')

    # Patch: solo il campo autorizzato passa; un campo protetto/non richiesto rifiuta l'intera patch.
    r = E("""q => { const problemi=[{sev:'err',id:q.id,msg:'spiegazioneDistrattori: servono 3 confutazioni'}];
      const piano=DiagnosiQuiz.pianoPatch([q],problemi), bene=DiagnosiQuiz.applicaPatch([q],[{id:q.id,spiegazioneDistrattori:['Confutazione specifica uno sufficientemente estesa.','Confutazione specifica due sufficientemente estesa.','Confutazione specifica tre sufficientemente estesa.']}],piano);
      const male=DiagnosiQuiz.applicaPatch([q],[{id:q.id,domanda:'Domanda alterata',spiegazioneDistrattori:['x','y','z']}],piano);
      return {bene:bene.qs[0],nb:bene.n,male:male.qs[0],nm:male.n,r:male.rifiutate}; }""", BASE)
    ok(r['nb'] == 1 and r['bene']['domanda'] == BASE['domanda'], 'patch a singolo campo preserva il resto')
    ok(r['nm'] == 0 and r['male']['domanda'] == BASE['domanda'] and len(r['r']) == 1, 'campo non autorizzato rifiuta l’intera patch')

    # Dopo tre fallimenti la rigenerazione singola archivia la cronologia e riapre un solo posto.
    r = E("""async q => { await CodaQuiz.svuotaTutto(); const acc='q@example.test'; const l=await CodaQuiz.aggiungi(acc,{tipo:'testo',id:'r',versione:'v1'},{quantita:1},1000,{pagine:[{n:12,testo:'membrana fosfolipidi doppio strato selettivo'}],pagineVuote:0});
      await CodaQuiz.acquisisciLease(acc,'t',1100,5000); await CodaQuiz.prossimo(acc,'t',1101);
      const z=await CodaQuiz.salvaBatchQualita(acc,l.id,{id:'cp',da:1,richieste:1,ottenute:1,provider:'mock',modello:'mock',salvatoIl:1200},[{id:q.id,domanda:q,stato:'da_rivedere',tentativi:3,motivi:['terzo fallimento'],pagine:[12],cronologia:[{tentativo:3,motivi:['terzo fallimento'],campi:['spiegazione'],esito:'da_rivedere'}]}],1,1200);
      const y=await CodaQuiz.rigeneraDomanda(acc,l.id,q.id,1300); return [z.stato,y.stato,y.revisioni.length,y.revisioniStoriche.length,y.rigenerazioni,y.revisioniStoriche[0].cronologia.length]; }""", BASE)
    ok(r == ['completato','in_coda',0,1,1,1], 'rigenerazione individuale senza duplicare né perdere la cronologia (%s)' % r)

    # Un esito di rete/timeout potenzialmente consumato mette in pausa, non programma un retry automatico.
    r = E("""async () => { await CodaQuiz.svuotaTutto(); const acc='i@example.test'; await CodaQuizRunner.creaDaTesto(acc,'membrana fosfolipidi doppio strato selettivo',{quantita:1},'incerto');
      const chiama=async()=>{const e=new Error('Esito incerto: timeout'); e.consumoIncerto=true; throw e;};
      const x=await CodaQuizRunner.avanza(acc,'t2',{chiama}); return [x.esito,x.lavoro.stato,x.lavoro.prossimoTentativoIl,x.lavoro.ultimoErrore]; }""")
    ok(r[0:3] == ['pausa_incerta','in_pausa',None] and 'incerto' in r[3].lower(), 'esito incerto sospende la coda senza retry automatico')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)), *err, sep='\n')
raise SystemExit(1 if err else 0)
