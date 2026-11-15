# Test v0.44: algoritmi locali (zero token), assistente robusto, privacy tra account.
import os, http.server, threading, functools, json
from playwright.sync_api import sync_playwright
RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=RADICE))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
err = []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)
with sync_playwright() as p:
    pg = p.chromium.launch().new_context(viewport={'width': 420, 'height': 900}, locale='it-IT').new_page()
    pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.evaluate("window._f0 = window.fetch; localStorage.setItem('imc-groq-chiave', 'gsk_test'); window._ai = 0; window.fetch = async () => { _ai++; return new Response(JSON.stringify({ choices: [{ message: { content: '{\"azioni\":[]}' } }] })); }")
    # A. intenzioni senza AI
    casi = {
      'crea un quiz sulle leve del corpo umano': ('quiz', 'Fisica'), 'fammi delle domande di teoria sulla mitosi': ('quiz', 'Biologia'),
      'creami un quiz di problemi su entalpia e legge di Hess': ('quiz', 'Chimica'), 'apri le statistiche': ('apri', None), 'mostrami il piano': ('apri', None),
      'cerca leve': ('cerca', None), 'nuovo appunto a mano su termodinamica': ('appunto', None), 'ripassa le flashcard': ('carte', None),
      'registra la lezione': ('lezione_audio', None), 'studia ora': ('studia_ora', None), 'aggiorna i pacchetti dal drive': ('pacchetti', None),
      'domani alle 9 ripasso fisica': ('evento', None), 'ricordami venerdì alle 18 di comprare il camice': ('promemoria', None), 'come creo un quiz?': ('risposta', None),
    }
    for f, (t, mat) in casi.items():
        r = pg.evaluate("Locale.capisci(%s)" % json.dumps(f))
        ok(r and r[0]['tipo'] == t and (mat is None or r[0].get('materia') == mat), 'locale: «%s» → %s' % (f, r and [x['tipo'] + ('/' + x.get('materia', '') if x.get('materia') else '') for x in r]))
    r = pg.evaluate("Locale.capisci('apri le statistiche e crea un quiz sulla meiosi')")
    ok(r and [x['tipo'] for x in r] == ['apri', 'quiz'], 'locale: due richieste in una frase → %s' % (r and [x['tipo'] for x in r]))
    ok(pg.evaluate("Locale.capisci('domani alle 9 ripasso e ricordami il camice e crea pure tutto')") is None, 'frase complessa → passa all\'AI invece di sbagliare')
    # B. assistente: con AI che risponde in formati diversi non si blocca più
    norm = pg.evaluate('''async () => { const forme = [{ actions: [{ type: 'quiz', topic: 'leve' }] }, [{ azione: 'search', query: 'mitosi' }], { azioni: [{ tipo: 'apri', parametri: { vista: 'piano' } }] }, { type: 'reminder', title: 'Camice', date: '2030-01-01', time: '08:00' }];
      const out = []; for (const f of forme) { window.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(f) } }] })); out.push((await Assistente.capisci('frase strana ' + Math.random())).map(a => a.tipo).join(',')); } return out; }''')
    ok(norm == ['quiz', 'cerca', 'apri', 'promemoria'], 'risposte AI in formati diversi riconosciute: %s' % norm)
    pg.evaluate("window._ai = 0; window.fetch = async (u) => { if (String(u).includes('completions')) _ai++; return new Response(JSON.stringify({ choices: [{ message: { content: '{\"azioni\":[]}' } }] })); }")
    pg.fill('.rapido-box input.rapido', 'crea un quiz sulle leve'); pg.click('.rapido-ai'); pg.wait_for_selector('.foglio:has-text("Crea un quiz")', timeout=5000)
    ok(pg.evaluate('_ai') == 0 and pg.input_value('.foglio input.campo') == 'leve', 'home: «crea un quiz sulle leve» apre subito la creazione, senza AI (%d chiamate)' % pg.evaluate('_ai'))
    pg.evaluate("document.querySelectorAll('.foglio-sfondo').forEach(e => e.remove())")
    pg.fill('.rapido-box input.rapido', 'blablabla qualcosa di incomprensibile'); pg.click('.rapido-ai'); pg.wait_for_selector('.dialogo, [role=dialog]', timeout=5000)
    ok(pg.locator('text=Crea un quiz su').count() >= 1, 'se nessuno capisce, propone le scelte (niente più «riscrivi»)')
    pg.keyboard.press('Escape'); pg.evaluate("document.querySelectorAll('.foglio-sfondo,.dialogo-sfondo').forEach(e => e.remove())")
    # C. quiz: correzioni locali
    c = pg.evaluate('''() => { const F = "Il fulcro è il punto fisso attorno al quale ruota la leva. Nelle leve di terzo genere la forza motrice è tra fulcro e resistenza.";
      const d = { t: 'mcq', lv: 'Sbarramento', q: 'Che cosa è il fulcro in una leva qualsiasi?', o: ['Il punto fisso (attorno al quale ruota tutta la leva rigida)', 'Il punto di forza', 'La resistenza', 'Il braccio lungo', 'La massa totale'], e: ['Cosa chiede: a', 'Il concetto: b', 'Passaggio 1: c', 'In sintesi: d'], ew: ['a','b','c','d'],
        cit: [{ t: 'il fulcro e il punto fisso attorno a cui ruota la leva', f: 'x' }] };
      const p = CreaQuiz.controlla(d, F, []); const f = { t: 'fill', lv: 'Completamento', q: 'La superficie vale …… se il lato è 3 m.', a: ['9 m²'], e: ['Cosa chiede: a', 'Il concetto: b', 'In sintesi: c'], cit: [{ t: 'Il fulcro è il punto fisso attorno al quale ruota la leva', f: 'x' }] };
      const pf = CreaQuiz.controlla(f, F, []); return [p, d.o[0], d.cit[0].t, pf, f.a]; }''')
    ok(c[0] == [] and c[1] == 'Il punto fisso', 'corretta troppo lunga accorciata in locale: «%s»' % c[1])
    ok(c[2].startswith('Il fulcro è il punto fisso'), 'citazione quasi uguale sostituita con la frase vera della fonte')
    ok('9 m2' in c[4] and c[3] == [], 'risposta con ² resa digitabile: %s' % c[4])
    # D. audio, E. carte, F. spiegazione, G. riassunto
    a = pg.evaluate('''() => [Locale.pulisciParlato('ehm allora la la entalpia è, ehm, una funzione di stato'), Locale.quasiTermini('oggi parliamo di entalpa e di entropia', ['entalpia', 'entropia']).map(x => x.parola + '>' + x.termine)]''')
    ok(a[0] == 'Allora la entalpia è, una funzione di stato' or a[0].startswith('Allora la entalpia'), 'parlato ripulito: «%s»' % a[0])
    ok(a[1] == ['entalpa>entalpia'], 'parola quasi uguale a un termine noto: %s' % a[1])
    k = pg.evaluate('''() => Locale.carteDaTesto("**Fulcro**: punto fisso della leva\\nL'entalpia è una funzione di stato che misura il calore a pressione costante.\\nMomento: forza per braccio\\nF = m * a\\nIl ribosoma si chiama così per l'RNA ribosomiale.")''')
    ok(len(k) >= 4, 'flashcard ricavate senza AI: %d (%s)' % (len(k), [x['q'] for x in k]))
    b = pg.evaluate("Locale.spiegazioneBreve(['Cosa chiede: x', 'Il concetto: il momento è forza per braccio.', 'Passaggio 1: y', 'In sintesi: più braccio, più momento.'])")
    ok(b and 'forza per braccio' in b and 'più braccio' in b, 'spiegazione breve dalla correzione, senza AI')
    m = pg.evaluate("Locale.concettiMancanti('## Fulcro\\n## Momento torcente\\n**guadagno meccanico** è il rapporto tra bracci', 'Il fulcro è il punto fisso')")
    ok(any('Momento' in x for x in m) and any('guadagno' in x for x in m) and not any(x == 'Fulcro' for x in m), 'riassunto: concetti mancanti trovati in locale: %s' % m)
    # sforzo: 2000 frasi locali
    t = pg.evaluate("(() => { const t0 = performance.now(); for (let i = 0; i < 2000; i++) Locale.capisci('crea un quiz sulle leve numero ' + i); return (performance.now() - t0) / 2000; })()")
    ok(t < 1, 'sforzo: %.3f ms per frase riconosciuta in locale' % t)
    # PRIVACY
    pr = pg.evaluate('''async () => {
      localStorage.setItem('imc-email', JSON.stringify('cocco.haloa@gmail.com'));
      Stato.salva({ id: 'ev-mio', type: 'evento', updatedAt: 0, titolo: 'Mio evento', inizio: '2030-01-01T10:00', fine: '2030-01-01T11:00', tuttoIlGiorno: false, categoriaId: 'cat-studio', promemoria: [], checklist: [] });
      localStorage.setItem('imc-accLocale', JSON.stringify('cocco.haloa@gmail.com'));
      const prima = !!Stato.prendi('ev-mio');
      await Privacy.primaDiUnire('nicoleschirru@gmail.com');   // un altro account accede su questo dispositivo
      return [prima, !!Stato.prendi('ev-mio'), Stato.esporta().length, JSON.parse(localStorage.getItem('imc-accLocale'))]; }''')
    ok(pr[0] and not pr[1] and pr[3] == 'nicoleschirru@gmail.com', 'altro account sullo stesso dispositivo: i dati del precedente spariscono prima di unire (%s)' % pr)
    pu = pg.evaluate('''async () => { window.fetch = window._f0;
      localStorage.setItem('imc-email', JSON.stringify('nicoleschirru@gmail.com'));
      Stato.unisci([{ id: 'x-altrui', type: 'nota', updatedAt: 5, titolo: 'del proprietario', testo: '', tag: [], acc: 'cocco.haloa@gmail.com' }, { id: 'pk-step-3', type: 'pacchetto', updatedAt: 5, contenuto: { id: 'step-3', tipo: 'step', materie: [], risorse: { libri: {}, quiz: {} } } }, { id: 'n-sua', type: 'nota', updatedAt: 5, titolo: 'sua', testo: '', tag: [] }]);
      const n = await Privacy.pulisciAltrui('nicoleschirru@gmail.com');
      return [n, !!Stato.prendi('x-altrui'), !!Stato.prendi('pk-step-3'), !!Stato.prendi('n-sua')]; }''')
    ok(pu[1] is False and pu[2] is False and pu[3] is True, 'account non proprietario: via i record altrui e il programma del proprietario, restano i suoi (%s)' % pu)
    st = pg.evaluate("(() => { Stato.salva({ id: 'n-x', type: 'nota', updatedAt: 0, titolo: 't', testo: '', tag: [] }); return Stato.prendi('n-x').acc; })()")
    ok(st == 'nicoleschirru@gmail.com', 'ogni salvataggio porta l\'account: %s' % st)
    dv = pg.evaluate('''async () => { const id = Privacy.idDispositivo(); await Privacy.dispositivo('nicoleschirru@gmail.com'); const d = Stato.prendi(id);
      let uscito = false; const lo = Drive.logout; Drive.logout = () => { uscito = true; }; d.revocato = true; Stato.salva(d); const r = await Privacy.dispositivo('nicoleschirru@gmail.com'); Drive.logout = lo;
      return [!!d, r, uscito, Stato.esporta().length]; }''')
    ok(dv[0] and dv[1] is False and dv[2] and dv[3] == 5, 'dispositivo scollegato: alla riapertura cancella tutto ed esce (%s)' % dv)
print('\n'.join(e for e in err if e.startswith('pageerror'))[:1500]); print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
