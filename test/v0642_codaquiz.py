# Test v0.64.2 P0-A: coda quiz locale persistente, idempotente e con lease multi-tab.
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
       and a.locator('input[aria-label="PDF testuale da cui generare il quiz"]').count() == 1,
       'P0-B UI: testo, PDF testuale e avvio coda raggiungibili')
    a.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(x => x.remove())")

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
      window.__chiamaP0B = async (m, o) => { const n = Number(/esattamente (\\d+)/.exec(m[1].content)[1]); return { prov: 'mock-sequenziale', modello: 'mock-1', j: { formato:'quiz-v4', quiz: Array.from({length:n}, (_,i) => ({ tipo:'mcq', livello:2, domanda:'Domanda batch A '+i+' abbastanza lunga?', opzioni:['Corretta','Errata 1','Errata 2','Errata 3'], spiegazione:'Spiegazione con fonte.', erroreTipico:'Confusione', fonte:'Pagina 1' })) } }; };
      const r = await CodaQuizRunner.avanza(acc, 'runner-a', { chiama: window.__chiamaP0B });
      return [l.id, r.esito, r.lavoro.risultati.length, r.lavoro.checkpoint.length];
    }""", ACC_B)
    ok(creato[1:] == ['checkpoint', 4, 1], 'primo micro-batch salvato subito (%s)' % creato)
    a.reload(); a.wait_for_selector('.tabbar'); a.evaluate('caricaStrumentiQuiz()')
    ripresa = a.evaluate("""async acc => {
      const chiama = async (m, o) => { const n = Number(/esattamente (\\d+)/.exec(m[1].content)[1]); return { prov:'mock-sequenziale', modello:'mock-2', j:{ formato:'quiz-v4', quiz:Array.from({length:n}, (_,i) => ({ tipo:'mcq', livello:3, domanda:'Domanda batch B '+i+' abbastanza lunga?', opzioni:['Corretta','Errata 1','Errata 2','Errata 3'], spiegazione:'Spiegazione con fonte.', erroreTipico:'Confusione', fonte:'Pagina 2' })) } }; };
      const r = await CodaQuizRunner.avanza(acc, 'runner-a', { chiama });
      return [r.esito, r.lavoro.risultati.length, new Set(r.lavoro.risultati.map(q => q.id)).size, r.lavoro.checkpoint.length, r.lavoro.stato];
    }""", ACC_B)
    ok(ripresa == ['completato', 7, 7, 2, 'completato'], 'reload e ripresa completano senza ID duplicati (%s)' % ripresa)

    # Tutti i provider indisponibili: il lavoro resta in coda con quando riprovare; poi riparte una volta sola.
    retry_b = a.evaluate("""async acc => {
      await CodaQuizRunner.creaDaTesto(acc, 'Testo diverso e sufficiente per una domanda.', { quantita:1, argomento:'retry' }, 'retry-429');
      const ko = await CodaQuizRunner.avanza(acc, 'runner-b', { ora:() => 100000, chiama:async () => { throw new Error('429: tutti i modelli in pausa per quota'); } });
      const ok = await CodaQuizRunner.avanza(acc, 'runner-b', { ora:() => 165000, chiama:async () => ({ prov:'riserva', modello:'mock-ok', j:{ formato:'quiz-v4', quiz:[{ tipo:'mcq', livello:1, domanda:'Quale risposta e corretta nel retry?', opzioni:['Corretta','B','C','D'], spiegazione:'Spiegazione.', erroreTipico:'Errore', fonte:'Pagina 1' }] } }) });
      return [ko.esito, ko.prossimoTentativoIl, ko.lavoro.stato, ok.esito, ok.lavoro.tentativi, ok.lavoro.risultati.length];
    }""", ACC_B)
    ok(retry_b == ['rimandato', 165000, 'in_coda', 'completato', 1, 1], '429 conserva coda e prossimo retry, poi riparte (%s)' % retry_b)
    b.close()
    ctx.close()

srv.shutdown()
if err:
    print('\n%d errori' % len(err))
    for e in err: print(' -', e)
    raise SystemExit(1)
print('TUTTO OK')
