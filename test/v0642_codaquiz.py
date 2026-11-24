# Test v0.64.2–0.64.4: coda persistente, runner sequenziale, qualità e innesto.
import os, http.server, threading, functools
from playwright.sync_api import sync_playwright

RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128
http.server.SimpleHTTPRequestHandler.protocol_version = 'HTTP/1.1'
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err = []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)

ACC_A, ACC_B = 'a@example.test', 'b@example.test'
SRC = {'tipo': 'testo', 'id': 'note-membrane', 'versione': 'sha256:uno'}
SPEC = {'quantita': 30, 'tipi': ['mcq', 'aperta']}

def carica(pg):
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.evaluate('caricaStrumentiQuiz()')

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(viewport={'width': 375, 'height': 800}, locale='it-IT', timezone_id='Europe/Rome')
    a = ctx.new_page(); a.on('pageerror', lambda e: err.append('pageerror A: ' + str(e))); carica(a)
    a.evaluate('CodaQuiz.svuotaTutto()')
    a.evaluate('CodaQuizUI.apri()')
    ok(a.locator('textarea[aria-label="Testo da cui generare il quiz"]').count() == 1
       and a.get_by_role('button', name='Genera nella coda').count() == 1
       and a.locator('input[aria-label="Uno o più PDF testuali da cui generare il quiz"][multiple]').count() == 1,
       'P0-B UI: testo, libro PDF multi-file e avvio coda raggiungibili')
    a.locator('input[aria-label="Microstep di destinazione del quiz"]').fill('3.3.1, 3.3.2')
    a.locator('select[aria-label="Modalità quantità quiz"]').select_option('manuale')
    a.locator('input[aria-label="Numero di domande"]').fill('12')
    a.get_by_role('button', name='Calcola proposta quantità').click()
    proposta = a.locator('[data-piano-quantita]').inner_text()
    ok('12 domande totali' in proposta and '3.3.1: 6' in proposta and '3.3.2: 6' in proposta,
       'P0.67-C UI: proposta manuale visibile e ripartita per microstep (%s)' % proposta)
    a.evaluate("CodaQuizRunner.avanza=async()=>({esito:'vuoto'})")
    a.locator('textarea[aria-label="Testo da cui generare il quiz"]').fill('Membrane, fosfolipidi e trasporto selettivo.')
    a.get_by_role('button', name='Genera nella coda').click()
    a.locator('section.card[data-coda-id]').first.wait_for()
    cards_piano = a.locator('section.card[data-coda-id]').all_inner_texts()
    ok(len(cards_piano) == 2 and all('0/6 pronte' in x for x in cards_piano),
       'P0.67-C UI: Genera crea una card pronte/richieste per ciascun microstep (%s)' % cards_piano)
    a.evaluate('CodaQuiz.svuotaTutto()')
    a.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(x => x.remove())")
    lavori_piano = a.evaluate("""async () => {
      const acc=CodaQuiz.accountAttuale(), piano=PianificazioneQuiz.calcola({modalita:'manuale',totaleManuale:12,massimoTotale:200,intensita:2,microstep:[{id:'3.3.1'},{id:'3.3.2'}]});
      piano.perMicrostep[0].quantita=7; piano.perMicrostep[1].quantita=5;
      const ls=await CodaQuizRunner.creaPianoDaTesto(acc,'Membrane e trasporto selettivo.',{materia:'Biologia',step:'3.3',maxPerBatch:4},piano,'piano-p067');
      return ls.map(l=>[l.specifica.microstep,l.specifica.quantita,l.specifica.maxPerBatch,(l.risultati||[]).length]);
    }""")
    ok(lavori_piano == [['3.3.1', 7, 4, 0], ['3.3.2', 5, 4, 0]],
       'P0.67-C coda: un lavoro persistente per microstep con rapporto iniziale pronte/richieste (%s)' % lavori_piano)

    # Stesso input due volte: un solo record, persistente dopo reload e invisibile all'altro account.
    r = a.evaluate("""async ([acc, src, spec]) => {
      const x = await CodaQuiz.aggiungi(acc, src, spec, 1000), y = await CodaQuiz.aggiungi(acc, src, spec, 2000);
      return { x: x.id, y: y.id, a: (await CodaQuiz.lista(acc)).length, b: (await CodaQuiz.lista('b@example.test')).length };
    }""", [ACC_A, SRC, SPEC])
    ok(r['x'] == r['y'] and r['a'] == 1 and r['b'] == 0, 'ID idempotente e isolamento account (%s)' % r)
    a.reload(); a.wait_for_selector('.tabbar'); a.evaluate('caricaStrumentiQuiz()')
    ok(a.evaluate("CodaQuiz.lista('a@example.test').then(x => x.length)") == 1, 'IndexedDB persiste dopo reload')

    # Cancellazione sicura: un lavoro attivo non sparisce; pausa/ripresa/annulla sono persistenti.
    stati = a.evaluate("""async acc => {
      const l = (await CodaQuiz.lista(acc))[0]; let bloccata = false;
      try { await CodaQuiz.elimina(acc, l.id); } catch (_) { bloccata = true; }
      const p = await CodaQuiz.pausa(acc, l.id, 3000), q = await CodaQuiz.riprendi(acc, l.id, 4000), z = await CodaQuiz.annulla(acc, l.id, 5000);
      const tolto = await CodaQuiz.elimina(acc, l.id);
      return [bloccata, p.stato, q.stato, z.stato, tolto, (await CodaQuiz.lista(acc)).length];
    }""", ACC_A)
    ok(stati == [True, 'in_pausa', 'in_coda', 'annullato', True, 0], 'pausa, ripresa, annulla e cancellazione terminale (%s)' % stati)

    # Due schede sullo stesso account: solo il proprietario del lease può prendere il lavoro.
    a.evaluate("CodaQuiz.aggiungi('a@example.test', {tipo:'pdf', id:'manuale', versione:'v1'}, {quantita:30}, 6000)")
    b = ctx.new_page(); b.on('pageerror', lambda e: err.append('pageerror B: ' + str(e))); carica(b)
    lease_a = a.evaluate("CodaQuiz.acquisisciLease('a@example.test', 'tab-a', 10000, 5000)")
    lease_b = b.evaluate("CodaQuiz.acquisisciLease('a@example.test', 'tab-b', 10000, 5000)")
    preso_b = b.evaluate("CodaQuiz.prossimo('a@example.test', 'tab-b', 10001)")
    preso_a = a.evaluate("CodaQuiz.prossimo('a@example.test', 'tab-a', 10001)")
    ok(lease_a and not lease_b and preso_b is None and preso_a['stato'] == 'in_esecuzione', 'lease multi-tab: un solo runner')

    retry = a.evaluate("""async id => {
      const r = await CodaQuiz.rimanda('a@example.test', id, '429: quota esaurita', 11001, 11000);
      return [r.stato, r.tentativi, r.prossimoTentativoIl, r.ultimoErrore];
    }""", preso_a['id'])
    ok(retry == ['in_coda', 1, 11001, '429: quota esaurita'], 'errore persistente con tentativo e prossimo retry (%s)' % retry)
    preso_a = a.evaluate("CodaQuiz.prossimo('a@example.test', 'tab-a', 11001)")
    ok(preso_a['stato'] == 'in_esecuzione' and preso_a['tentativi'] == 1, 'il retry dovuto riparte una sola volta')

    # Dopo scadenza/chiusura il lavoro in esecuzione torna in coda, senza duplicati.
    rec = a.evaluate("""async () => {
      const n = await CodaQuiz.recuperaInterrotti('a@example.test', 16000), l = await CodaQuiz.lista('a@example.test');
      return [n, l.length, l[0].stato, l[0].ultimoErrore];
    }""")
    ok(rec == [1, 1, 'in_coda', '429: quota esaurita'], 'ripresa dopo lease scaduto senza duplicati e con ultimo errore intatto (%s)' % rec)
    ok(b.evaluate("CodaQuiz.rilasciaLease('a@example.test', 'tab-b')") is False, 'una scheda non può rilasciare il lease altrui')
    ok(a.evaluate("CodaQuiz.acquisisciLease('a@example.test', 'tab-a', 16000, 2000)") is True, 'lease riacquisibile dopo la scadenza')

    # Cambio account con la seconda scheda ancora aperta: la pulizia non resta bloccata da IndexedDB.
    pulizia = a.evaluate("""async () => {
      localStorage.setItem('imc-accLocale', JSON.stringify('a@example.test'));
      const prima = (await CodaQuiz.lista('a@example.test')).length;
      await Privacy.primaDiUnire('b@example.test');
      await caricaStrumentiQuiz();
      return [prima, (await CodaQuiz.lista('a@example.test')).length, Stato.tutti('codaquiz').length];
    }""")
    ok(pulizia == [1, 0, 0], 'cambio account multi-tab elimina la coda locale e niente record sincronizzato (%s)' % pulizia)

    # P0-B: testo -> micro-batch -> checkpoint; reload -> ripresa senza duplicati.
    creato = a.evaluate("""async acc => {
      const testo = 'La membrana cellulare contiene un doppio strato di fosfolipidi.\\n\\nLa mitosi comprende profase, metafase, anafase e telofase.';
      const l = await CodaQuizRunner.creaDaTesto(acc, testo, { quantita: 7, materia: 'Biologia', argomento: 'cellula', step: '3.3', maxPerBatch: 4 });
      window.__chiamaP0B = async (m, o) => { const n = Number(/esattamente (\\d+)/.exec(m[1].content)[1]); return { prov: 'mock-sequenziale', modello: 'mock-1', j: { formato:'quiz-v4', quiz: Array.from({length:n}, (_,i) => ({ tipo:'mcq', livello:2, domanda:'Quale ruolo hanno membrana e fosfolipidi nel concettoA'+i+'?', opzioni:['Formano il doppio strato','Producono DNA','Creano cellulosa','Avviano la mitosi'], spiegazione:'Membrana e fosfolipidi formano il doppio strato cellulare. [[Fonte, p. 1]]', spiegazioneDistrattori:['Il DNA non descrive la struttura lipidica della membrana.','La cellulosa appartiene alla parete e non al doppio strato.','La mitosi è divisione cellulare e non struttura di membrana.'], distractorTypes:['confusione_termine','misconception','plausibile_generico'], erroreTipico:'Confondere membrana e altri componenti cellulari', fonte:'Pagina 1' })) } }; };
      const r = await CodaQuizRunner.avanza(acc, 'runner-a', { chiama: window.__chiamaP0B });
      return [l.id, r.esito, r.lavoro.risultati.length, r.lavoro.checkpoint.length];
    }""", ACC_B)
    ok(creato[1:] == ['checkpoint', 4, 1], 'primo micro-batch salvato subito (%s)' % creato)
    a.reload(); a.wait_for_selector('.tabbar'); a.evaluate('caricaStrumentiQuiz()')
    ripresa = a.evaluate("""async acc => {
      const chiama = async (m, o) => { const n = Number(/esattamente (\\d+)/.exec(m[1].content)[1]); return { prov:'mock-sequenziale', modello:'mock-2', j:{ formato:'quiz-v4', quiz:Array.from({length:n}, (_,i) => ({ tipo:'mcq', livello:3, domanda:'Come interagiscono membrana e fosfolipidi nel concettoB'+i+'?', opzioni:['Formano il doppio strato','Producono glicogeno','Creano il nucleo','Consumano cromosomi'], spiegazione:'La membrana cellulare contiene un doppio strato di fosfolipidi. [[Fonte, p. 1]]', spiegazioneDistrattori:['Il glicogeno è una riserva e non struttura la membrana.','Il nucleo è un organulo distinto dal doppio strato lipidico.','I cromosomi partecipano alla mitosi, non formano la membrana.'], distractorTypes:['confusione_termine','misconception','plausibile_generico'], erroreTipico:'Confondere strutture e processi cellulari', fonte:'Pagina 1' })) } }; };
      const r = await CodaQuizRunner.avanza(acc, 'runner-a', { chiama });
      return [r.esito, r.lavoro.risultati.length, new Set(r.lavoro.risultati.map(q => q.id)).size, r.lavoro.checkpoint.length, r.lavoro.stato];
    }""", ACC_B)
    ok(ripresa == ['completato', 7, 7, 2, 'completato'], 'reload e ripresa completano senza ID duplicati (%s)' % ripresa)

    # P0.65: una singola pagina PDF enorme non deve oltrepassare il budget del prompt Groq.
    pagina_lunga = a.evaluate("""async acc => {
      const testo = ('La membrana regola il trasporto selettivo di soluti e acqua. ').repeat(900);
      await CodaQuizRunner.creaDaPaginePdf(acc, 'pagina-lunga.pdf', 'sha256:pagina-lunga', [{ n:1, testo }],
        { quantita:5, materia:'Biologia', argomento:'membrana', maxPerBatch:5, maxCaratteriFonte:12000 });
      let caratteri = 0, limite = 0;
      const chiama = async m => {
        caratteri = m[0].content.length + m[1].content.length;
        limite = Math.floor(IA._r.budget('groq', 'contesto-ristretto', 3250) * 3.5);
        if (caratteri > limite) throw new Error('Il testo è troppo lungo per i modelli disponibili: accorcialo, oppure aggiungi la chiave Gemini.');
        return { prov:'groq-mock', modello:'contesto-ristretto', j:{ formato:'quiz-v4', quiz:[{ tipo:'mcq', livello:2,
          domanda:'Quale funzione svolge la membrana nel trasporto dei soluti?', opzioni:['Regola il trasporto selettivo','Duplica il DNA','Produce cellulosa','Forma i cromosomi'],
          spiegazione:'La membrana regola il trasporto selettivo di soluti e acqua. [[Fonte, p. 1]]',
          spiegazioneDistrattori:['La duplicazione del DNA non descrive il trasporto di membrana.','La cellulosa appartiene alla parete e non regola i soluti.','I cromosomi custodiscono informazione e non trasportano soluti.'],
          distractorTypes:['confusione_termine','misconception','plausibile_generico'], erroreTipico:'Confondere membrana e materiale genetico', fonte:'Pagina 1' }] } };
      };
      const r = await CodaQuizRunner.avanza(acc, 'runner-pagina-lunga', { chiama });
      const esito = [r.esito, caratteri, limite, r.lavoro.risultati.length, r.errore || ''];
      await CodaQuiz.annulla(acc, r.lavoro.id); await CodaQuiz.elimina(acc, r.lavoro.id);
      return esito;
    }""", ACC_B)
    ok(pagina_lunga[0] == 'checkpoint' and pagina_lunga[1] <= pagina_lunga[2] and pagina_lunga[3] == 1,
       'pagina PDF lunga rispetta il budget Groq e completa il batch (%s)' % pagina_lunga)

    # P0.65: le riparazioni Groq restano chirurgiche; cinque domande bocciate non viaggiano nello stesso prompt.
    correzione_lunga = a.evaluate("""async acc => {
      const fonte = ('Il trasporto di membrana dipende da gradienti e proteine selettive. ').repeat(500);
      await CodaQuizRunner.creaDaPaginePdf(acc, 'correzioni-lunghe.pdf', 'sha256:correzioni-lunghe', [{ n:1, testo:fonte }],
        { quantita:5, materia:'Biologia', argomento:'trasporto', maxPerBatch:5, maxCaratteriFonte:12000 });
      const genera = async () => ({ prov:'groq-mock', modello:'genera', j:{ formato:'quiz-v4', quiz:Array.from({length:5}, (_,i) => ({
        tipo:'mcq', livello:2, domanda:'Come funziona il trasporto di membrana nel caso '+i+'? '+('Dettaglio contestuale. '.repeat(45)),
        opzioni:['Attraverso gradienti e proteine','Duplicando il DNA','Sintetizzando cellulosa','Formando cromosomi'],
        spiegazione:'Breve', erroreTipico:'Confusione', fonte:'Pagina 1' })) } });
      const primo = await CodaQuizRunner.avanza(acc, 'runner-correzioni-lunghe', { chiama:genera });
      let caratteri=0, limite=0, maxOut=0;
      const correggi = async (m,o) => {
        maxOut=o.maxOut; caratteri=m.reduce((n,x)=>n+x.content.length,0);
        limite=Math.floor(IA._r.budget('groq','contesto-ristretto',maxOut)*3.5);
        if (caratteri > limite) throw new Error('Il testo è troppo lungo per i modelli disponibili: accorcialo, oppure aggiungi la chiave Gemini.');
        return { prov:'groq-mock', modello:'corregge', j:[] };
      };
      const secondo = await CodaQuizRunner.avanza(acc, 'runner-correzioni-lunghe', { chiama:correggi });
      const tentativi=secondo.lavoro.revisioni.map(x=>x.tentativi), esito=[primo.lavoro.revisioni.length,secondo.esito,caratteri,limite,maxOut,tentativi.filter(x=>x===1).length,secondo.errore||''];
      await CodaQuiz.annulla(acc, secondo.lavoro.id); await CodaQuiz.elimina(acc, secondo.lavoro.id);
      return esito;
    }""", ACC_B)
    ok(correzione_lunga[0] == 5 and correzione_lunga[1] == 'checkpoint' and correzione_lunga[2] <= correzione_lunga[3]
       and correzione_lunga[4] == 900 and correzione_lunga[5] == 1,
       'correzione Groq singola rispetta il budget e non blocca le altre (%s)' % correzione_lunga)

    # Tutti i provider indisponibili: il lavoro resta in coda con quando riprovare; poi riparte una volta sola.
    retry_b = a.evaluate("""async acc => {
      await CodaQuizRunner.creaDaTesto(acc, 'Testo diverso e sufficiente per una domanda.', { quantita:1, argomento:'retry' }, 'retry-429');
      const ko = await CodaQuizRunner.avanza(acc, 'runner-b', { ora:() => 100000, chiama:async () => { throw new Error('429: tutti i modelli in pausa per quota'); } });
      const ok = await CodaQuizRunner.avanza(acc, 'runner-b', { ora:() => 165000, chiama:async () => ({ prov:'riserva', modello:'mock-ok', j:{ formato:'quiz-v4', quiz:[{ tipo:'mcq', livello:1, domanda:'Quale testo diverso è sufficiente per il retry?', opzioni:['Il testo diverso','Una risposta estranea','Un concetto assente','Una fonte inesistente'], spiegazione:'Il testo diverso è sufficiente per creare la domanda. [[Fonte, p. 1]]', spiegazioneDistrattori:['La risposta è estranea al testo fornito e non è sostenuta.','Il concetto non compare nel testo e quindi non è verificabile.','La fonte inesistente non offre alcun riscontro testuale.'], distractorTypes:['plausibile_generico','confusione_termine','misconception'], erroreTipico:'Ignorare il testo fornito come fonte', fonte:'Pagina 1' }] } }) });
      return [ko.esito, ko.prossimoTentativoIl, ko.lavoro.stato, ok.esito, ok.lavoro.tentativi, ok.lavoro.risultati.length];
    }""", ACC_B)
    ok(retry_b == ['rimandato', 165000, 'in_coda', 'completato', 1, 1], '429 conserva coda e prossimo retry, poi riparte (%s)' % retry_b)

    # P0-C: solo la bocciata viene corretta; tre risposte senza patch la marcano da_rivedere senza bloccare il lavoro.
    qualita = a.evaluate("""async acc => {
      await CodaQuizRunner.creaDaTesto(acc, 'La membrana contiene fosfolipidi e proteine di trasporto selettivo.', { quantita:1, materia:'Biologia', step:'3.3', microstep:'3.3.1' }, 'p0c-qualita');
      const genera = async () => ({ prov:'mock', modello:'genera', j:{ formato:'quiz-v4', quiz:[{ tipo:'mcq', livello:2, domanda:'Quale struttura contiene i fosfolipidi?', opzioni:['La membrana','Il DNA','Il glicogeno','Il cromosoma'], spiegazione:'Breve', erroreTipico:'Confusione', fonte:'Pagina 1' }] } });
      let r = await CodaQuizRunner.avanza(acc, 'runner-c', { chiama:genera });
      const iniziale = [r.lavoro.risultati.length, r.lavoro.revisioni.length, r.lavoro.revisioni[0].stato];
      const vuota = async () => ({ prov:'mock', modello:'patch', j:[] });
      r = await CodaQuizRunner.avanza(acc, 'runner-c', { chiama:vuota });
      r = await CodaQuizRunner.avanza(acc, 'runner-c', { chiama:vuota });
      r = await CodaQuizRunner.avanza(acc, 'runner-c', { chiama:vuota });
      return [iniziale, r.esito, r.lavoro.stato, r.lavoro.revisioni[0].tentativi, r.lavoro.revisioni[0].stato, r.lavoro.rapportoQualita.pronte];
    }""", ACC_B)
    ok(qualita == [[0, 1, 'da_correggere'], 'completato', 'completato', 3, 'da_rivedere', 0], 'P0-C: tre correzioni chirurgiche, poi da_rivedere senza blocco (%s)' % qualita)

    riaperta = a.evaluate("""async acc => {
      const l=(await CodaQuiz.lista(acc)).find(x=>x.sorgente.id==='p0c-qualita'), id=l.revisioni[0].id;
      const r=await CodaQuiz.riprovaCorrezione(acc,l.id,id,200000);
      const out=[r.stato,r.revisioni[0].stato,r.revisioni[0].tentativi,r.revisioni[0].cronologia.length,r.rapportoQualita.daCorreggere,r.ultimoErrore];
      await CodaQuiz.annulla(acc,l.id,200001); return out;
    }""", ACC_B)
    ok(riaperta == ['in_coda','da_correggere',0,3,1,None],
       'P0-C: riprova correzione conserva domanda e cronologia senza rigenerare (%s)' % riaperta)

    gratis = a.evaluate("""async acc => {
      const l=await CodaQuizRunner.creaDaTesto(acc,'La membrana cellulare contiene fosfolipidi e proteine di trasporto selettivo.',
        {quantita:1,materia:'Biologia'},'rivalida-gratis');
      const owner='runner-gratis'; await CodaQuiz.acquisisciLease(acc,owner,300000,120000); await CodaQuiz.prossimo(acc,owner,300000);
      const q={id:'gratis-S01-01',stepId:'gratis',scheda:'gratis-S01',sottoStep:'',categoria:'prioritaria',livelloCognitivo:2,livello:'L2',tipo:'mcq',tipoItem:'',coppiaGemellaId:'',
        domanda:'Quale componente caratterizza la membrana cellulare?',opzioni:['I fosfolipidi formano il doppio strato della membrana','DNA','ATP','RNA'],esatta:0,
        spiegazione:'Fosfolipidi e proteine regolano il trasporto selettivo. [[Fonte, p. 999]]',
        spiegazioneDistrattori:['Il DNA conserva informazione e non forma la membrana.','ATP trasferisce energia e non forma la membrana.','RNA partecipa alla sintesi e non forma la membrana.'],
        distractorTypes:['confusione_termine','plausibile_generico','misconception'],erroreTipico:'Confondere componenti cellulari',fonte:'Pagina 999',sourceRef:'Pagina 999'};
      await CodaQuiz.salvaBatchQualita(acc,l.id,{id:'vecchio',da:1,richieste:1,ottenute:1,provider:'mock',modello:'vecchio',salvatoIl:300001},
        [{id:q.id,domanda:q,stato:'da_correggere',tentativi:0,motivi:['Fonte: manca una pagina presente nel micro-batch'],pagine:[1]}],1,300001);
      await CodaQuiz.rilasciaLease(acc,owner); const r=await CodaQuiz.rivalidaLocale(acc,l.id,300002);
      return [r.stato,r.risultati.length,r.revisioni.length,r.risultati[0].fonte,r.checkpoint.length];
    }""", ACC_B)
    ok(gratis == ['completato',1,0,'Pagina 1',1],
       'P0-C: rivalidazione locale recupera la coda senza richieste o checkpoint aggiuntivi (%s)' % gratis)

    # Due innesti dello stesso lavoro danno lo stesso record e la stessa banca, con le sole domande pronte.
    innesto = a.evaluate("""() => {
      const q = { id:'biologia-3.3-S01-01', stepId:'biologia-3.3', scheda:'biologia-3.3-S01', sottoStep:'3.3.1', categoria:'prioritaria', livelloCognitivo:2, livello:'L2', tipoItem:'', coppiaGemellaId:'', domanda:'Quale struttura contiene fosfolipidi?', opzioni:['La membrana','Il DNA','Il glicogeno','Il cromosoma'], esatta:0, spiegazione:'La membrana contiene fosfolipidi. [[Fonte, p. 1]]', spiegazioneDistrattori:['Il DNA non è la struttura lipidica della membrana.','Il glicogeno è una riserva e non una membrana.','Il cromosoma non forma il doppio strato lipidico.'], distractorTypes:['misconception','confusione_termine','plausibile_generico'], erroreTipico:'Confondere componenti cellulari', fonte:'Pagina 1', sourceRef:'Pagina 1' };
      const l = CodaQuiz.nuovo(CodaQuiz.accountAttuale(), {tipo:'testo',id:'innesto-p0c',versione:'v1'}, {quantita:1,materia:'Biologia',step:'3.3',microstep:'3.3.1',argomento:'Membrane'}, 1);
      l.stato='completato'; l.risultati=[q]; l.revisioni=[];
      const x = CodaQuizQualita.innesta(l), y = CodaQuizQualita.innesta(l), banca = Stato.prendi('bq-' + x.banche[0]);
      return [x.id, y.id, Stato.tutti('innesto').filter(z => z.id === x.id).length, banca.domande.length];
    }""")
    ok(innesto[0] == innesto[1] and innesto[2:] == [1, 1], 'P0-C: innesto idempotente in step/microstep e piano (%s)' % innesto)

    # Quiz P1: appena esiste una domanda pronta la coda mostra il rapporto e la apre in prova senza statistiche/innesto.
    prova = a.evaluate("""async () => {
      const acc = CodaQuiz.accountAttuale();
      const l = await CodaQuizRunner.creaDaTesto(acc, 'La membrana cellulare contiene un doppio strato di fosfolipidi e proteine di trasporto selettivo.',
        { quantita:1, materia:'Biologia', argomento:'Membrane', maxPerBatch:1 }, 'prova-immediata');
      const chiama = async () => ({ prov:'mock', modello:'prova', j:{ formato:'quiz-v4', quiz:[{ tipo:'mcq', livello:2,
        domanda:'Quale componente forma il doppio strato della membrana cellulare?', opzioni:['I fosfolipidi','Il glicogeno','Il DNA','La cellulosa'],
        spiegazione:'I fosfolipidi formano il doppio strato della membrana cellulare. [[Fonte, p. 1]]',
        spiegazioneDistrattori:['Il glicogeno è una riserva e non forma la membrana.','Il DNA conserva informazione e non forma il doppio strato.','La cellulosa appartiene alla parete e non alla membrana.'],
        distractorTypes:['confusione_termine','plausibile_generico','misconception'], erroreTipico:'Confondere membrana e parete', fonte:'Pagina 1' }] } });
      const r = await CodaQuizRunner.avanza(acc, 'runner-prova', { chiama });
      return [r.esito, r.lavoro.risultati.length, l.id];
    }""")
    ok(prova[:2] == ['completato', 1], 'quiz pronto per la prova immediata (%s)' % prova)
    a.evaluate('CodaQuizUI.apri()')
    scheda_prova = a.locator('section.card[data-coda-id="%s"]' % prova[2])
    bottone_prova = scheda_prova.get_by_role('button', name='Prova 1 domanda pronta')
    rapporto_ui = scheda_prova.locator('summary').filter(has_text='Dettagli qualità · 1 pronte')
    rapporto_ui.wait_for()
    ok(bottone_prova.count() == 1 and rapporto_ui.count() >= 1,
       'coda mostra prova immediata e rapporto qualità')
    stat_prima = a.evaluate("Stato.tutti('statq').length")
    bottone_prova.click()
    a.wait_for_selector('.qz-h1')
    a.locator('.qz-opz-b').first.click()
    stat_dopo = a.evaluate("Stato.tutti('statq').length")
    occhiello = a.locator('.qz-occhiello').inner_text().lower()
    ok(a.locator('.qz-h1').inner_text() == 'Membrane' and 'senza statistiche' in occhiello and stat_prima == stat_dopo,
       'la prova apre le sole domande pronte nel quiz in app senza statistiche (%s a %s)' % (stat_prima, stat_dopo))
    b.close()
    ctx.close()

srv.shutdown()
if err:
    print('\n%d errori' % len(err))
    for e in err: print(' -', e)
    raise SystemExit(1)
print('TUTTO OK')
