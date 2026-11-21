# Test v0.42: assistente della home, ricerca universale dei pacchetti, quiz «creati in app» (AI simulata).
import os, http.server, threading, functools, json
from playwright.sync_api import sync_playwright
RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
http.server.ThreadingHTTPServer.request_queue_size = 128   # Windows: coda più ampia per i caricamenti in parallelo
http.server.SimpleHTTPRequestHandler.protocol_version = 'HTTP/1.1'   # Windows: con HTTP/1.0 la chiusura del socket a volte tronca app.js (ERR_CONNECTION_RESET)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err = []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)
FONTE = ("Una leva è una macchina semplice costituita da un'asta rigida che può ruotare attorno a un punto fisso detto fulcro. "
         "Nelle leve di primo genere il fulcro si trova tra la forza motrice e la forza resistente, come nell'articolazione tra testa e colonna. "
         "Nelle leve di terzo genere la forza motrice è applicata tra il fulcro e la resistenza: sono svantaggiose ma permettono movimenti ampi e rapidi, come l'avambraccio flesso dal bicipite. "
         "Il guadagno meccanico di una leva è il rapporto tra il braccio della forza motrice e il braccio della forza resistente.")
with sync_playwright() as p:
    pg = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 420, 'height': 900}, locale='it-IT').new_page()
    pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.evaluate("localStorage.setItem('imc-groq-chiave', 'gsk_test')")
    # 1) frasi veloci restano locali
    r = pg.evaluate("[Assistente.eRapida('domani 15-17 Chimica 3.1'), Assistente.eRapida('crea un quiz sulle leve'), Assistente.eRapida('apri le statistiche')]")
    ok(r == [True, False, False], 'eventi con data restano locali, il resto va all\'assistente: %s' % r)
    # 2) controlli automatici delle domande
    pg.evaluate("window._F = %s" % json.dumps(FONTE))
    c = pg.evaluate('''() => { const base = { t: 'mcq', lv: 'Sbarramento', q: 'Dove si trova il fulcro in una leva di primo genere?', e: ['Cosa chiede: x', 'Il concetto: y', 'Passaggio 1: z', 'In sintesi: w'], ew: ['a', 'b', 'c', 'd'],
        cit: [{ t: "Nelle leve di primo genere il fulcro si trova tra la forza motrice e la forza resistente", f: 'Leve, p. 3' }] };
      const lunga = { ...base, o: ['Tra la forza motrice e la forza resistente, sempre e comunque', 'Dopo la resistenza', 'Prima della forza', 'Sul baricentro', 'Fuori asta'] };
      const buona = { ...base, o: ['Tra motrice e resistente', 'Oltre la resistenza applicata', 'Sotto la forza motrice', 'Nel baricentro dell\\'asta', 'Fuori dall\\'asta rigida'] };
      const inventata = { ...buona, cit: [{ t: 'Il fulcro è sempre al centro della leva come dice il libro', f: 'x' }] };
      const fill = { t: 'fill', lv: 'Completamento', q: 'Il guadagno meccanico è il rapporto tra bracci: vale …… se i bracci sono 20 cm e 5 cm.', a: ['4'], show: '4', e: ['Cosa chiede: a', 'Il concetto: b', 'In sintesi: c'], cit: buona.cit };
      const fillNo = { ...fill, a: ['10²'] };
      return [lunga, buona, inventata, fill, fillNo].map(d => CreaQuiz.controlla(JSON.parse(JSON.stringify(d)), _F, []).join(' | ')); }''')
    ok('la corretta è la più lunga' in c[0], 'scarta la corretta più lunga')
    ok(c[1] == '', 'domanda buona passa: «%s»' % c[1])
    ok('citazione non trovata' in c[2], 'scarta la citazione non presente parola per parola')
    ok(c[3] == '', 'completamento buono passa: «%s»' % c[3])
    ok('non digitabile' in c[4], 'scarta la risposta non digitabile da tastiera')
    # 3) AI simulata: generatore (gpt-oss) + revisore (llama), Drive simulato
    pg.evaluate('''() => {
      window._chiamate = [];
      const mcq = i => ({ lv: ['Sbarramento','Applicativo','Trabocchetto','Problema'][i % 4], q: ['Fulcro','Bicipite','Avambraccio','Testa','Colonna','Braccio','Resistenza','Motrice','Asta','Guadagno','Rotazione','Equilibrio','Momento','Forbici','Carriola','Pinzette','Piede','Caviglia','Gomito','Ginocchio','Mandibola','Remo','Altalena','Martello'][i % 24] + ' ' + ['alfa','beta','gamma','delta','epsilon','zeta','eta','theta','iota','kappa','lambda','mu','nu','xi','omicron','pi','rho','sigma','tau','upsilon','phi','chi','psi','omega'][(i * 7) % 24] + ' ' + i + ' w' + i + 'a w' + i + 'b w' + i + 'c w' + i + 'd: quale affermazione è corretta?', o: ['Giusta ' + i, 'Sbagliata A' + i + ' più lunga', 'Sbagliata B' + i + ' più lunga', 'Sbagliata C' + i + ' più lunga', 'Sbagliata D' + i + ' più lunga'],
        e: ['Cosa chiede: x', 'Il concetto: y', 'Passaggio 1: z', 'In sintesi: w'], ew: ['a','b','c','d'], r: 'Leve, p. 3', cit: [{ t: "Una leva è una macchina semplice costituita da un'asta rigida che può ruotare attorno a un punto fisso detto fulcro", f: 'Leve, p. 3' }] });
      const fill = i => ({ q: ['Carrucola','Tendine','Rotula','Omero','Radio','Ulna','Femore','Tibia'][i % 8] + ' ' + ['uno','due','tre','quattro','cinque','sei','sette','otto'][(i * 3) % 8] + ' w' + i + 'a w' + i + 'b w' + i + 'c w' + i + 'd: il punto fisso si chiama ……', a: ['fulcro'], show: 'fulcro', e: ['Cosa chiede: a', 'Il concetto: b', 'In sintesi: c'], ew: ['x'], r: 'Leve', cit: [{ t: 'Il guadagno meccanico di una leva è il rapporto tra il braccio della forza motrice e il braccio della forza resistente', f: 'Leve' }] });
      let k = 0, indiceParziale = 0;
      window.fetch = async (u, o) => {
        const b = JSON.parse(o.body), sys = b.messages[0].content, us = b.messages[1].content; _chiamate.push(b.model);
        if (window._provaTesto && us.includes('[[Testo incollato]]') && us.includes(_F)) window._passiTesto.add(sys.includes('revisore') ? 'revisione' : 'generazione');
        if (window._interrompi && !sys.includes('revisore') && Stato.tutti('qcreato').some(q => q.ripresa && q.domande.length >= 6)) {
          return new Response(JSON.stringify({choices:[{message:{content:'{"domande":[]}'}}]}));
        }
        let out;
        if (sys.includes('assistente dell')) out = { azioni: [{ tipo: 'evento', titolo: 'Ripasso fisica', data: '2030-01-02', inizio: '09:00', fine: '10:00' }, { tipo: 'promemoria', titolo: 'Portare il camice', data: '2030-01-02', ora: '08:00' }] };
        else if (sys.includes('revisore delle correzioni')) {
          const dati = JSON.parse(us.split('\\n')[1]);
          out = { correzioni: dati.map(d => ({ i: d.i, problema: '' })) };
          if (window._rifiuta) out.correzioni.pop();
        } else if (sys.includes('revisore')) {
          const blocchi = us.split('DOMANDE:')[1].split('FONTI:')[0].trim().split(/\\n\\n(?=\\d+\\))/);
          out = { esiti: blocchi.map(bl => { const i = +bl.match(/^(\\d+)\\)/)[1]; const m = bl.match(/\\n\\s+([A-E])\\) Giusta/); return { i, applicazione_verificata: true, risposta: m ? m[1] : 'fulcro', ambigua: false, errori_contenuto: '', errori_italiano: '' }; }) };
          if (window._parziale && !window._mirata) out.esiti.pop();
        } else { const nm = (us.match(/Scrivi (\\d+) domande a risposta multipla/) || [])[1], nf = (us.match(/(\\d+) completamenti/) || [])[1];
          out = { domande: nm ? Array.from({ length: +nm }, () => mcq(k++)) : Array.from({ length: +nf }, () => fill(k++)) };
          if (window._mirata) {
            if (!us.includes(JSON.stringify([window._mirata]))) throw Error('Applicazione mirata mancante');
            out.domande.forEach(d => d.applicazione = window._mirata);
          } else if (window._parziale) {
            out.applicazioni = ['Individuare il fulcro', 'Calcolare il guadagno', 'Confrontare i bracci'];
            for (const d of out.domande) d.applicazione = ++indiceParziale === 10 ? out.applicazioni[1] : out.applicazioni[0];
          }
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }), { status: 200 });
      };
      Drive.scaricaTesto = async id => id === 'doc1' ? _F : JSON.stringify({ formato: 'pacchetto-studio', versione: 1, tipo: 'piano', id: 'piano-nicole', titolo: 'Piano di Nicole', aggiornato: '2030-01-01', giorniTeoria: 1, giorni: [] });
    }''')
    rec = pg.evaluate('''async () => { const r = await CreaQuiz.crea({ argomento: 'leve del corpo umano', materia: 'Fisica', cosa: 'misto', extra: 'fulcro guadagno', nMcq: 12, nFill: 6,
        fonti: [{ id: 'doc1', name: 'Leve.txt', mimeType: 'text/plain', modifiedTime: '', punti: 50, perche: [] }] }, () => {});
      return { n: r.domande.length, mcq: r.domande.filter(d => d.t === 'mcq').length, fill: r.domande.filter(d => d.t === 'fill').length, modelli: r.modelli, gen: r.domande.every(d => d.gen), id: r.id }; }''')
    ok(rec['n'] == 18 and rec['mcq'] == 12 and rec['fill'] == 6, 'quiz creato: 12 multiple + 6 completamenti (%s)' % rec)
    ok(len(set(rec['modelli'])) >= 2, 'generatore e revisore sono modelli diversi: %s' % rec['modelli'])
    pg.evaluate("CreaQuiz.elenco()"); pg.wait_for_selector('text=✨ leve del corpo umano', timeout=3000) if False else pg.wait_for_timeout(300)
    ok(pg.locator('.voce-lista', has_text='Leve del corpo umano').count() == 1, 'compare tra i «Quiz creati in app»')
    pg.locator('.voce-lista', has_text='Leve del corpo umano').click(); pg.wait_for_selector('.qz-occhiello')
    ok('creato in app' in pg.text_content('.qz-occhiello'), 'si apre nel motore quiz con l\'etichetta «creato in app»')
    pg.screenshot(path='test/quiz-creato.png')
    pg.evaluate("document.querySelectorAll('.visore').forEach(v => v.remove())")
    # Un esito omesso resta consultabile e non entra nel tentativo.
    risultato = pg.evaluate("""async () => {
      window._parziale = true;
      const r = await CreaQuiz.crea({ argomento: 'revisione parziale', materia: 'Fisica', cosa: 'misto',
        extra: 'fulcro', nMcq: 10, nFill: 0, fonti: [{ id: 'doc1', name: 'Leve.txt', mimeType: 'text/plain' }] }, () => {});
      const salvato = Stato.prendi(r.id);
      window._quizPrima = JSON.parse(JSON.stringify(salvato));
      CreaQuiz.apri(salvato);
      return [salvato.domande.length, salvato.daRivedere.length, salvato.daRivedere[0].motivo];
    }""")
    ok(risultato == [9, 1, 'Esito del revisore mancante.'], 'nove esiti su dieci: %s' % risultato)
    for nome, stato, conteggio in [
        ('Individuare il fulcro', 'Coperta', '9 pronte · 0 da rivedere'),
        ('Calcolare il guadagno', 'Scoperta', '0 pronte · 1 da rivedere'),
        ('Confrontare i bracci', 'Scoperta', '0 pronte · 0 da rivedere'),
    ]:
        voce = pg.locator('section details').filter(has_text=nome)
        ok(stato in voce.locator('summary').inner_text() and conteggio in voce.text_content(), nome + ' · ' + stato)
    pg.evaluate("window._mirata = 'Confrontare i bracci'")
    bersaglio = pg.locator('section details').filter(has_text='Confrontare i bracci')
    bersaglio.locator('summary').click()
    bersaglio.get_by_role('button', name='Aggiungi una domanda su questa applicazione').click()
    pg.get_by_text('Confrontare i bracci · Coperta', exact=True).wait_for(timeout=8000)
    intatto = pg.evaluate("""() => {
      const prima = window._quizPrima, dopo = Stato.prendi(prima.id);
      return dopo.domande.length === 10 && JSON.stringify(dopo.domande.slice(0, 9)) === JSON.stringify(prima.domande)
        && JSON.stringify(prima.daRivedere) === JSON.stringify(dopo.daRivedere)
        && dopo.domande[9].applicazione === 'Confrontare i bracci';
    }""")
    ok(intatto, 'aggiunta mirata nello stesso quiz conserva le nove domande e la revisione pendente')
    pg.evaluate("""() => { window._mirata = 'Calcolare il guadagno'; window._rifiuta = true;
      window._primaRigenera = JSON.stringify(Stato.prendi(_quizPrima.id)); }""")
    domanda = pg.locator('details').filter(has=pg.get_by_role('button', name='Rigenera questa domanda', include_hidden=True))
    domanda.locator('summary').click()
    domanda.get_by_role('button').click()
    pg.get_by_role('status').filter(has_text='Sostituzione non approvata').wait_for()
    ok(pg.evaluate("JSON.stringify(Stato.prendi(_quizPrima.id)) === _primaRigenera"), 'revisione incompleta: originale conservato')
    pg.evaluate("window._rifiuta = false")
    domanda.get_by_role('button').click()
    pg.get_by_text('Calcolare il guadagno · Coperta', exact=True).wait_for()
    ok(pg.evaluate("""() => { const dopo = Stato.prendi(_quizPrima.id);
      return dopo.daRivedere.length === 0 && dopo.domande.length === 11
        && JSON.stringify(dopo.domande.slice(0, 10)) === JSON.stringify(JSON.parse(_primaRigenera).domande)
        && dopo.domande[10].applicazione === 'Calcolare il guadagno'; }"""), 'sostituita solo la domanda selezionata')
    pg.get_by_role('button', name='Inizia con 11 domande pronte').click()
    pg.wait_for_selector('.qz-occhiello')
    pg.evaluate("""() => {
      document.querySelectorAll('.visore').forEach(v => v.remove());
      window._parziale = false; window._mirata = false; window._provaTesto = true;
      window._passiTesto = new Set(); window._lettureDrive = 0;
      Drive.scaricaTesto = async () => { window._lettureDrive++; throw Error('Drive non disponibile'); };
      CreaQuiz.elenco();
    }""")
    pg.get_by_role('button', name='＋ Crea un quiz').click()
    pg.get_by_label('Argomento', exact=True).fill('Quiz da testo sulle leve')
    pg.get_by_label('Testo o appunti da usare come fonte').fill(FONTE)
    pg.get_by_label('Risposte multiple').fill('30')
    pg.get_by_label('Completamenti', exact=True).fill('0')
    pg.evaluate("window._interrompi = true")
    pg.locator('.foglio').get_by_role('button', name='Crea', exact=True).click()
    pg.wait_for_function("document.querySelector('.audio-pillola')?.textContent.includes('Nessuna domanda')")
    pg.evaluate("window._interrompi = false; CreaQuiz.elenco()")
    pg.locator('.voce-lista', has_text='Quiz da testo sulle leve').click()
    pg.get_by_role('button', name='Riprendi generazione').click()
    pg.locator('.audio-fine').click(timeout=20000)
    pg.get_by_label('Modalità').select_option('esame')
    pg.get_by_label('Sessione').select_option('1')
    pg.get_by_role('button', name='Inizia con 30 domande pronte').click()
    pg.wait_for_selector('.qz-occhiello')
    ok(pg.evaluate("""() => {
      const quiz = CreaQuiz.tutti().find(r => r.argomento === 'Quiz da testo sulle leve');
      return _lettureDrive === 0 && _passiTesto.size === 2 && quiz.testoIncollato === _F
        && quiz.fonti.length === 1 && quiz.fonti[0].nome === 'Testo incollato'
        && quiz.domande.length === 30 && new Set(quiz.domande.map(d => d.q)).size === 30 && quiz.domande.every(d => d.cit.every(c => !c.l));
    }"""), 'testo incollato dal modulo: generazione, revisione e apertura quiz senza leggere Drive')
    # Sessione breve: ripasso, salvataggio singolo e annullamento.
    for i in range(10):
        pg.locator('.qz-opz-b', has_text='Sbagliata A').first.click()
        pg.locator('[data-az="avanti"]').click()
    pg.wait_for_selector('.qz-punti')
    ok(pg.evaluate("Domande.aperte().length === 10"), 'i dieci errori della sessione breve entrano nel ripasso')
    pg.locator('#avvisi .avviso', has_text='Salvato').last.click()
    ok(pg.evaluate("""() => { const q = CreaQuiz.tutti().find(r => r.argomento === 'Quiz da testo sulle leve');
      return Domande.aperte().length === 0 && !Studio.prog(q.id) && QuizApp.stat(q.id).every(s => s.n === 0); }"""),
       'Annulla ritira punteggio, errori e conteggi del tentativo')
    # Prova di volume dalla voce del piano fino allo stesso quiz in Oggi.
    pg.evaluate("""() => {
      document.querySelectorAll('.visore').forEach(v => v.remove());
      const v = { k: 'F7.5', t: 'Leve e momenti' }, g = {data: ymd(oggi()), n:1, voci:[v]};
      // Volume: trasporto simulato senza le quote del router gratuito (provate in v047_router).
      IA.chiedi = async (messages, ruolo) => {
        const risposta = await window.fetch('mock-provider', {body:JSON.stringify({messages, model:ruolo})});
        return {j:JSON.parse((await risposta.json()).choices[0].message.content), modello:ruolo};
      };
      window._piano = {id:'piano-quiz-test',tipo:'piano',titolo:'Fisica',giorniTeoria:1,giorni:[g]};
      Studio.importa({..._piano, formato:'pacchetto-studio'});
      UI.studioVista = 'piano'; UI.studioPiano = _piano.id; vai('studio');
      Stato.salva({id:'app-leve',type:'appunto',titolo:'Appunto sulle leve',testo:_F});
    }""")
    pg.get_by_role('button', name='Quiz su Leve e momenti', exact=True).click()
    pg.get_by_label('Aggiungi un appunto').select_option('app-leve')
    pg.get_by_label('Risposte multiple').fill('200')
    pg.get_by_label('Completamenti', exact=True).fill('0')
    pg.locator('.foglio').get_by_role('button', name='Crea', exact=True).click()
    assert not pg.locator('.foglio').count(), (pg.locator('#avvisi').all_text_contents(), err)
    try:
        pg.wait_for_function("document.querySelector('.audio-fine') || Array.from(document.querySelectorAll('.audio-pillola')).at(-1)?.textContent.startsWith('⚠')", timeout=15000)
    except Exception:
        print(pg.locator('.audio-pillola').all_text_contents(), err, flush=True)
        raise
    assert pg.locator('.audio-fine').count(), pg.locator('.audio-pillola').all_text_contents()
    pg.locator('.audio-fine').click()
    ok(pg.evaluate("""() => { const q = CreaQuiz.tutti().find(r => r.pianoId === _piano.id);
      return q.voceId === 'F7.5' && q.domande.length === 200 && new Set(q.domande.map(d => d.q)).size === 200 && !q.ripresa;
    }"""), '200 domande da appunto in un quiz collegato al piano')
    pg.evaluate("""() => { document.querySelectorAll('.visore').forEach(v => v.remove());
      const i = imp(); i.widget = ['studio']; i.widgetNascosti = []; Stato.salva(i); vai('oggi'); }""")
    pg.get_by_role('button', name='Quiz su Leve e momenti').click()
    pg.get_by_role('button', name='Inizia con 200 domande pronte').wait_for()
    # 4) assistente: due azioni da confermare
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.evaluate('''() => { window.fetch = async (u, o) => { const out = { azioni: [{ tipo: 'evento', titolo: 'Ripasso fisica', data: '2030-01-02', inizio: '09:00', fine: '10:00' }, { tipo: 'promemoria', titolo: 'Portare il camice', data: '2030-01-02', ora: '08:00' }] };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }), { status: 200 }); }; }''')
    pg.fill('.rapido-box input.rapido', 'il 2 gennaio 2030 ripasso fisica dalle 9 alle 10 e ricordami di portare il camice alle 8 e crea pure tutto')
    pg.click('.rapido-ai'); pg.wait_for_selector('.foglio:has-text("Assistente")')
    ok(pg.locator('.cq-fonte').count() == 2, 'assistente: mostra le 2 azioni capite')
    pg.screenshot(path='test/assistente.png')
    pg.click('.foglio button:has-text("Fai")'); pg.wait_for_timeout(300)
    ev = pg.evaluate("Stato.tutti('evento').filter(e => e.titolo === 'Ripasso fisica').map(e => e.inizio)")
    tk = pg.evaluate("Stato.tutti('task').filter(t => t.titolo === 'Portare il camice').map(t => t.scadenza)")
    ok(ev and ev[0].startswith('2030-01-02T09:00'), 'evento creato alle 9: %s' % ev)
    ok(tk == ['2030-01-02T08:00'], 'promemoria creato alle 8: %s' % tk)
    # 5) ricerca universale dei pacchetti: un JSON in una cartella qualsiasi
    n = pg.evaluate('''async () => {
      Drive.preparaCartelle = async () => {}; Drive.idCartella = () => 'app'; Drive.elencaTutti = async () => [];
      Drive.scaricaTesto = async id => JSON.stringify({ formato: 'pacchetto-studio', versione: 1, tipo: 'piano', id: 'piano-nicole', titolo: 'Piano di Nicole', aggiornato: '2030-01-01', giorniTeoria: 1, giorni: [] });
      Drive.api = async (perc, o) => { if (perc.startsWith('files/') ) return { name: 'Roba mia varia', parents: [] };
        const q = o.query.q; return { files: q.includes('pacchetto-studio') ? [{ id: 'x1', name: 'mio file strano.json', mimeType: 'application/json', modifiedTime: new Date().toISOString(), parents: ['c1'] }] : [] }; };
      return await Studio.caricaDaDrive(); }''')
    ok(n == 1, 'pacchetto trovato dal contenuto in una cartella qualsiasi (%s)' % n)
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
