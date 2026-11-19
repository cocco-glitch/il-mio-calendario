# Test v0.52 (BP2): architettura multidominio universale e profili utente.
# Profili cognitivi, archetipi, diagnostica locale per archetipo (< 3 ms), pacchetti .imcpack (o[0] corretta, export senza
# dati personali), quiz dei nuovi tipi, piano dall'indice del libro, modalità «100% senza AI», compatibilità col proprietario.
import os, http.server, threading, functools, json
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

PACK = {
  'formato': 'imcpack-v1', 'titolo': 'Storia contemporanea', 'descrizione': 'Prova', 'archetipo': 'umanistico_storico', 'livelloConsigliato': 'superiori_maturita',
  'autore': 'Prof', 'dataCreazione': '2026-11-01',
  'programma': [{ 'codiceStep': 'S1', 'titolo': 'Ottocento', 'sottostep': [{ 'sk': 's1', 'titolo': 'Risorgimento', 'oreStimate': 2 }, { 'sk': 's2', 'titolo': 'Unità', 'oreStimate': 1 }] }],
  'domande': {
    's1': [
      { 'id': 'a', 'tipoDomanda': 'mcq', 't': 'In che anno scoppiano i moti del Quarantotto?', 'o': ['1820', '1848', '1870'], 'c': 1, 'e': ['Le rivoluzioni europee del 1848.'], 'cit': 'Manuale cap. 3', 'diff': 'Base' },
      { 'id': 'b', 't': 'sequenza', 'q': 'Ordina gli eventi', 'sequenzaOk': ['Congresso di Vienna', 'Moti del 1848', 'Unità d\'Italia'], 'o': [] },
      { 'id': 'c', 'tipoDomanda': 'abbinamento', 't': 'Abbina personaggio e ruolo', 'o': [], 'coppieOk': [['Cavour', 'Primo ministro'], ['Garibaldi', 'Spedizione dei Mille']] },
      { 'id': 'd', 'tipoDomanda': 'risposta_aperta_rubrica', 't': 'Perché fallirono i moti del 1848?', 'o': [], 'rubricaPunti': ['mancanza di coordinamento tra i rivoltosi', 'intervento militare austriaco'] },
      { 'id': 'e', 'tipoDomanda': 'mcq', 't': 'Domanda rotta', 'o': ['solo una'] },
    ],
    'fuori': [{ 'id': 'f', 'tipoDomanda': 'fill', 't': 'Capitale d\'Italia nel 1871: ……', 'o': ['Roma'] }],
  },
  'flashcard': [{ 'sk': 's1', 'fronte': 'Anno dell\'Unità', 'retro': '1861', 'tag': ['date'] }],
}

with sync_playwright() as p:
    pg = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 420, 'height': 900}, locale='it-IT').new_page()
    pg.add_init_script("try { localStorage.setItem('imc-quiz-modo','esame') } catch (e) {}")   # v0.54: quiz senza passo di certezza (default neuro)
    pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')

    # §1 Profili
    r = pg.evaluate("() => [Dominio.ruolo(), Dominio.profilo().modalita, Dominio.profilo().ritenzioneTarget, Dominio.profilo('ospite').modalita, Ripassi.ritenzione('2030-01-01')]")
    ok(r[0] == 'owner' and r[1] == 'universita_concorsi' and r[2] == 0.9, 'proprietario senza scelta → universita_concorsi (ritenzione 0,90 come prima): %s' % r[:3])
    ok(r[3] == 'superiori_maturita', 'ospite senza scelta → superiori_maturita')
    ok(abs(r[4] - 0.9) < 1e-9, 'FSRS: ritenzione invariata per il proprietario (%s)' % r[4])
    pr = pg.evaluate("PRESET_COGNITIVI")
    ok(pr['medie_biennio']['ritenzioneTarget'] == 0.85 and pr['medie_biennio']['dimensioneMicroLotto'] == 5 and not pr['medie_biennio']['mostraMetricheFSRS'] and pr['medie_biennio']['tonoSpiegazioneAI'] == 'semplice_esempi'
       and pr['superiori_maturita']['ritenzioneTarget'] == 0.88 and pr['universita_concorsi']['dimensioneMicroLotto'] == 8 and pr['lifelong_pro']['ritenzioneTarget'] == 0.86 and not pr['lifelong_pro']['attivaHypercorrection'],
       'preset cognitivi come da blueprint')
    r = pg.evaluate("() => { Dominio.impostaModalita('medie_biennio'); const a = [Dominio.profilo().ritenzioneTarget, Ripassi.ritenzione('2030-01-01'), Stato.prendi('profilo').acc !== undefined || true]; Stato.elimina('profilo'); return a.concat(Dominio.profilo().modalita); }")
    ok(r[0] == 0.85 and abs(r[1] - 0.85) < 1e-9 and r[3] == 'universita_concorsi', 'cambio profilo → ritenzione FSRS 0,85; eliminato il record si torna al predefinito: %s' % r)

    # §2 Archetipi
    r = pg.evaluate("() => [risolviArchetipoMateria('F'), risolviArchetipoMateria('c'), risolviArchetipoMateria('B'), risolviArchetipoMateria('X'), risolviArchetipoMateria('F', 'lingue_letteratura'), Dominio.archetipoMateria('F'), Dominio.archetipoMateria('C')]")
    ok(r == ['stem_calcolo', 'scienze_sperimentali', 'scienze_sperimentali', 'scienze_sperimentali', 'lingue_letteratura', 'stem_calcolo', 'scienze_sperimentali'], 'risolviArchetipoMateria: %s' % r)
    r = pg.evaluate("() => ['Diritto privato', 'Inglese B2', 'Storia moderna', 'Programmazione in Python', 'Analisi matematica 1', 'Anatomia umana', 'Cucina'].map(Dominio.indovinaArchetipo)")
    ok(r == ['giuridico_economico', 'lingue_letteratura', 'umanistico_storico', 'informatica_coding', 'stem_calcolo', 'scienze_sperimentali', None], 'archetipo dedotto dal nome: %s' % r)
    ok(pg.evaluate("Object.keys(ARCHETIPI_DISCIPLINARI).length") == 6 and pg.evaluate("ARCHETIPI_DISCIPLINARI.giuridico_economico.pluginLocaleId") == 'diagnosticaNormativaEccezioni', 'sei archetipi con plugin locale')
    r = pg.evaluate("() => [IA.ordinePerArchetipo(['groq','gemini','xkiro','cohere','requesty'], 'umanistico_storico'), IA.ordinePerArchetipo(['groq','gemini','xkiro'], undefined), IA.ordinePerArchetipo(['gemini','groq'], 'lingue_letteratura')]")
    ok(r[0] == ['cohere', 'gemini', 'groq', 'xkiro', 'requesty'] and r[1] == ['groq', 'gemini', 'xkiro'] and r[2] == ['groq', 'gemini'], 'catena AI riordinata per archetipo (senza archetipo invariata): %s' % r)
    r = pg.evaluate("() => [Dominio.promptTutor('Fisica', 'stem_calcolo'), Dominio.promptTutor('Fisica'), Dominio.promptTutor('Diritto', 'giuridico_economico')]")
    ok(r[0] == r[1] == "Sei un tutor di Fisica per il semestre filtro di Medicina. Rispondi in italiano corretto e semplice, rivolgendoti allo studente con il tu. ", 'prompt del tutor del proprietario identico a prima')
    ok('Diritto, Economia' in r[2] and 'eccezioni' in r[2] and 'Medicina' not in r[2], 'prompt per altre discipline guidato dall\'archetipo')

    # §3 Diagnostica locale (< 3 ms ciascuna)
    casi = [
      ('stem_calcolo', '2500', '2.5', '⚠️ Ordine di grandezza: fattore 10^3 (controlla conversione unità SI).'),
      ('stem_calcolo', '-9,8 m/s²', '9,8 m/s²', '➖ Segno invertito'),
      ('stem_calcolo', '0,25 Ω', '4 Ω', '🔄 Reciproco'),
      ('scienze_sperimentali', 'Nella matrice mitocondriale', 'Nel citoplasma', '🔀 Inversione rilevata: hai scelto il meccanismo del compartimento opposto.'),
      ('scienze_sperimentali', 'Sistema parasimpatico', 'Sistema simpatico', '🔀 Inversione rilevata'),
      ('scienze_sperimentali', 'H2SO3', 'H2SO4', '🧪 Formula: stessi elementi ma indici diversi (H₂SO₃ invece di H₂SO₄).'),
      ('umanistico_storico', 'Nel 1888', 'Nel 1848', '⏳ Anacronismo: l\'evento scelto è successivo di circa 40 anni al contesto richiesto.'),
      ('umanistico_storico', 'XV sec', '1648', '⏳ Anacronismo: l\'evento scelto è precedente'),
      ('giuridico_economico', 'Il ricorso è ammesso esclusivamente davanti al TAR', 'Il ricorso è ammesso davanti al TAR, salvo che la legge disponga diversamente', '⚖️ Trappola normativa: l\'opzione contiene "esclusivamente", ma la norma prevede eccezioni.'),
      ('giuridico_economico', 'entro 30 giorni', 'entro 60 giorni', '📅 Termine sbagliato'),
      ('lingue_letteratura', 'perchè', 'perché', '✍️ Quasi esatto (distanza 1 carattere): controlla la desinenza/accento.'),
      ('lingue_letteratura', 'recieve', 'receive', '✍️ Quasi esatto (distanza 1 carattere)'),
      ('informatica_coding', 'for (i = 0; i <= n; i++) {\n  x++\n  if (a[i] {\n}', 'for (i = 0; i < n; i++) {\n  x++\n  if (a[i]) {}\n}', '🐛 Errore di sintassi o indice off-by-one alla riga 3 del blocco.'),
      ('informatica_coding', 'for (i = 0; i <= n; i++)', 'for (i = 0; i < n; i++)', '🐛 Errore di sintassi o indice off-by-one alla riga 1'),
    ]
    for a, s, c, atteso in casi:
        r = pg.evaluate("([a, s, c]) => { const t0 = performance.now(); let m; for (let i = 0; i < 50; i++) m = Locale.diagnosticaPerArchetipo(a, { scelta: s, corretta: c }); return [m, (performance.now() - t0) / 50]; }", [a, s, c])
        ok(r[0] is not None and r[0].startswith(atteso) and r[1] < 3, '%s: «%s» vs «%s» → %s (%.3f ms)' % (a, s.split('\n')[0], c.split('\n')[0], r[0], r[1]))
    r = pg.evaluate("() => [Locale.diagnosticaPerArchetipo('stem_calcolo', { scelta: '3', corretta: '7' }), Locale.diagnosticaPerArchetipo('lingue_letteratura', { scelta: 'gatto', corretta: 'elefante' }), Locale.diagnosticaPerArchetipo('boh', { scelta: 'a', corretta: 'b' })]")
    ok(r == [None, None, None], 'nessuna diagnosi inventata quando non c\'è uno schema riconoscibile')
    r = pg.evaluate("() => [Locale.rubrica('I moti fallirono per la mancanza di coordinamento e per l\\'intervento militare dell\\'Austria', ['mancanza di coordinamento tra i rivoltosi', 'intervento militare austriaco']).punteggio, Locale.rubrica('Non lo so', ['mancanza di coordinamento', 'intervento austriaco']).punteggio]")
    ok(r[0] >= 0.99 and r[1] == 0, 'rubrica locale per risposte aperte: %s' % r)

    # §4 Pacchetti .imcpack
    ok(pg.evaluate("Dominio.valida({ formato: 'altro' })") != '' and pg.evaluate("Dominio.valida(%s)" % json.dumps(PACK)) == '', 'validazione del formato imcpack-v1')
    r = pg.evaluate("(j) => { const r = Dominio.importa(j); return { id: r.pk.id, proprio: r.pk.proprio, dom: r.domande, scart: r.scartate, carte: r.carte, m: r.pk.materie[0].m, sub: r.pk.materie[0].sottostep.map(s => [s.k, s.titolo, s.microstep[0].schede[0].id]) }; }", PACK)
    ok(r['proprio'] and r['dom'] == 5 and r['scart'] == 1 and r['carte'] == 1 and len(r['sub']) == 3, 'import: corso proprio, 5 domande valide, 1 scartata, 1 flashcard, 3 sotto-step (uno «fuori programma»): %s' % {k: r[k] for k in ('dom', 'scart', 'carte')})
    m = r['m']; sk1 = r['sub'][0][2]
    ok(all(x[2].startswith(m + '-') and x[2].count('-') >= 2 for x in r['sub']), 'id schede nel formato <materia>-<microstep>-<k>: %s' % [x[2] for x in r['sub']])
    q = pg.evaluate("(sk) => Dominio.domandeDi(sk)", sk1)
    mcq = [x for x in q if x['t'] == 'mcq'][0]
    ok(mcq['o'][0] == '1848' and mcq['lv'] == 'Sbarramento' and mcq['r'] == 'Manuale cap. 3' and mcq['archetipo'] == 'umanistico_storico', 'mcq normalizzata: o[0] = risposta corretta (c=1 spostata in testa), diff Base → Sbarramento, cit → Ripassa')
    ok(sorted(x['t'] for x in q) == ['abbinamento', 'mcq', 'risposta_aperta_rubrica', 'sequenza'], 'tipi universali importati: %s' % sorted(x['t'] for x in q))
    ok(pg.evaluate("(m) => Dominio.archetipoMateria(m)", m) == 'umanistico_storico' and pg.evaluate("(sk) => Dominio.haDomande(sk)", sk1), 'materia creata con il suo archetipo')
    r2 = pg.evaluate("(j) => { const n = Stato.tutti('bancaimc').length; const r = Dominio.importa(j); return [r.pk.id, Stato.tutti('bancaimc').length === n, Studio.pkStep().filter(p => p.id === r.pk.id).length, Carte.carteDi(Carte.mazzi().find(z => z.nome === j.titolo).id).length]; }", PACK)
    ok(r2[0] == r['id'] and r2[1] and r2[2] == 1 and r2[3] == 1, 'reimportare aggiorna lo stesso corso (niente doppioni di banche, corsi o carte)')
    # statistiche e FSRS su una domanda, poi export: nessun dato personale
    ex = pg.evaluate("""(id) => { const pk = Studio.pkStep().find(p => p.id === id); const d = Dominio.domandeDi(pk.materie[0].sottostep[0].microstep[0].schede[0].id)[0];
      Stato.salva({ id: 'sq-' + d.id, type: 'statq', updatedAt: 0, sk: d.sk, n: 3, ok: 1, ultima: '2026-11-01', esito: false, c: {} });
      IA.impostaChiave && IA.impostaChiave('groq', 'gsk_segretissima'); const j = Dominio.esporta(pk); IA.impostaChiave && IA.impostaChiave('groq', ''); return j; }""", r['id'])
    s = json.dumps(ex, ensure_ascii=False)
    ok(ex['formato'] == 'imcpack-v1' and ex['archetipo'] == 'umanistico_storico' and len(ex['programma']) >= 1 and sum(len(v) for v in ex['domande'].values()) == 5 and len(ex['flashcard']) == 1, 'export imcpack-v1 completo (programma, 5 domande, flashcard)')
    ok(not any(k in s for k in ['"acc"', 'statq', '"n": 3', 'gsk_', 'updatedAt', 'cocco', '@gmail', '"due"', '"stab"']), 'export senza dati personali (account, statistiche, FSRS, chiavi)')
    emcq = [x for v in ex['domande'].values() for x in v if x.get('tipoDomanda') == 'mcq'][0]
    ok(emcq['o'][0] == '1848' and emcq['t'].startswith('In che anno') and emcq.get('diff') == 'Base', 'export: o[0] corretta, t = enunciato, diff riconvertita')
    ok(pg.evaluate("(j) => { const r = Dominio.importa(j); return Dominio.domandeDi(r.pk.materie[0].sottostep[0].microstep[0].schede[0].id).length; }", dict(ex, titolo='Copia esportata')) == 4, 'il pacchetto esportato si reimporta (giro completo)')

    # Quiz dei nuovi tipi nell'app
    pg.evaluate("""(id) => { const pk = Studio.pkStep().find(p => p.id === id), m = pk.materie[0], sub = m.sottostep[0], s = sub.microstep[0].schede[0];
      Regole.ordina = (d) => d.map((_, k) => k); QuizApp.apri(pk, m.m, sub.microstep[0].n, s); }""", r['id'])
    pg.wait_for_selector('.qz-carta')
    tipi = []
    for _ in range(4):
        t = pg.inner_text('.qz-qtesta').lower(); tipi.append(t)
        if 'risposta multipla' in t:
            pg.locator('.qz-opz-b').filter(has_text='1820').click()
            pg.wait_for_selector('.qz-avviso')
            ok('Anacronismo' in pg.inner_text('.qz-avviso'), 'quiz: errore → diagnostica dell\'archetipo nella correzione («%s»)' % pg.inner_text('.qz-avviso')[:80])
        elif 'metti in ordine' in t:
            for voce in ['Congresso di Vienna', 'Moti del 1848', 'Unità d\'Italia']: pg.locator('[data-seq]', has_text=voce).click()
            ok(pg.locator('.qz-verdetto.ok').count() == 1, 'quiz: sequenza nell\'ordine giusto → corretta')
        elif 'abbinamento' in t:
            pg.select_option('select[data-abb="0"]', 'Primo ministro'); pg.select_option('select[data-abb="1"]', 'Primo ministro'); pg.click('.qz-abb button[type=submit]')
            ok(pg.locator('.qz-verdetto.ko').count() == 1 and 'Spedizione dei Mille' in pg.inner_text('.qz-abb'), 'quiz: abbinamento sbagliato → mostra la coppia giusta')
        elif 'risposta aperta' in t:
            pg.fill('textarea#qz-ans', 'Mancò il coordinamento tra i rivoltosi e ci fu l\'intervento militare austriaco.'); pg.click('.qz-rub button[type=submit]')
            ok(pg.locator('.qz-verdetto.ok').count() == 1 and 'Punti chiave: 2 su 2' in pg.inner_text('.qz-carta'), 'quiz: risposta aperta valutata con la rubrica, senza AI')
        ok(pg.locator('[data-az=modifica]').count() == (1 if 'risposta multipla' in t else 0), 'quiz: «Modifica» solo per i tipi che l\'editor gestisce (%s)' % t.split('\n')[-1])
        pg.click('[data-az=avanti]')
    ok(len(set(tipi)) == 4, 'quiz: i 4 tipi compaiono tutti')
    pg.evaluate("document.querySelectorAll('.visore,.foglio-sfondo,.dialogo-sfondo').forEach(e => e.remove())")

    # §5 Piano dall'indice del libro
    INDICE = "Indice\n1 Introduzione ..... 1\n2 La cellula ..... 9\n2.1 Membrane ..... 9\n2.2 Organuli ..... 25\n3 Genetica ..... 41\n4 Evoluzione 73\n5 Ecologia 90"
    c = pg.evaluate("(t) => Dominio.estraiCapitoli(t)", INDICE)
    ok([x['titolo'] for x in c] == ['Introduzione', 'Membrane', 'Organuli', 'Genetica', 'Evoluzione', 'Ecologia'], 'indice: capitoli e paragrafi (solo il livello più fine): %s' % [x['titolo'] for x in c])
    ok(c[0]['ore'] == 1 and c[2]['ore'] == 2 and c[3]['ore'] == 4 and c[-1]['ore'] == 1.5, 'ore stimate dalle pagine (8 pag/h, ultimo senza fine → 1,5 h): %s' % [x['ore'] for x in c])
    d = pg.evaluate("(t) => Dominio.distribuisci(Dominio.estraiCapitoli(t), '2030-03-01', '2030-03-21', 2)", INDICE)
    date = [x['data'] for x in d['capitoli']]
    ore = {}
    for x in d['capitoli']: ore[x['data']] = ore.get(x['data'], 0) + x['ore']
    ok(date == sorted(date) and date[0] == '2030-03-01' and date[-1] < '2030-03-18' and max(ore.values()) <= 4.01, 'piano: date in ordine, ultimi giorni liberi per il ripasso, carico giornaliero contenuto: %s' % date)
    d = pg.evaluate("(t) => Dominio.distribuisci(Dominio.estraiCapitoli(t), '2030-03-01', '2030-03-04', 1)", INDICE)
    ok(all(x['data'] < '2030-03-04' for x in d['capitoli']) and any('supera' in a for a in d['avvisi']), 'piano troppo stretto: ritmo compresso e avviso, mai oltre l\'esame')
    r = pg.evaluate("""(t) => { const n0 = Stato.tutti('esame').length; const r = Dominio.creaPiano({ nome: 'Biologia generale', testo: t, esame: '2099-06-30', oreGiorno: 2 });
      const pv = Studio.pianiVirtuali ? Studio.pianiVirtuali() : []; return [r.pk.proprio, r.pk.materie[0].sottostep.every(s => !!s.data), Stato.tutti('esame').length - n0, Dominio.archetipoMateria(r.pk.materie[0].m)]; }""", INDICE)
    ok(r[0] and r[1] and r[2] == 1 and r[3] == 'scienze_sperimentali', 'creaPiano: corso proprio con sotto-step datati, esame creato, archetipo dedotto: %s' % r)

    # §5 Modalità 100% senza AI
    r = pg.evaluate("() => { const k = IA.tutteChiavi(); return [Dominio.senzaAI(), Object.keys(k).filter(p => k[p]).length]; }")
    ok(r[0] == (r[1] == 0), 'senzaAI() vero solo senza chiavi: %s' % r)
    pg.evaluate("vai('altro'); UI.altroSez = 'studio'; disegna()"); pg.wait_for_timeout(300)
    ok(pg.locator('text=Profilo e materie').count() >= 1 and pg.locator('text=Importa .imcpack').count() >= 1 and pg.locator('text=＋ Crea piano').count() >= 1, 'Altro → Studio: profilo, import pacchetti e piano dal libro')
    ok(pg.locator('text=100% senza AI').count() >= 1, 'senza chiavi: avviso «100% senza AI» nelle impostazioni')
    pg.evaluate("localStorage.setItem('imc-groq-chiave', 'gsk_test')")
    ok(pg.evaluate("Dominio.senzaAI()") is False, 'con una chiave la modalità senza AI si disattiva')
    pg.evaluate("localStorage.removeItem('imc-groq-chiave')")
    ok(pg.evaluate("Dominio.serveBenvenuto()") is False, 'proprietario/test: nessun wizard di benvenuto')

    pg.close()
print('TUTTO OK' if not err else 'ERRORI: %d' % len(err))
