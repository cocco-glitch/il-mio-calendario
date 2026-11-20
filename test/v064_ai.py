# Test v0.64 «Qualsiasi AI»: ospite che sceglie «AI locale» (6 domande per risposta, niente file) nel Centro di creazione.
# Biologia 3.3, 1 scheda da 18 (scienze_sperimentali → 12 risposta multipla, 3 completamento, 3 ordinamento):
# 3 prompt «parte k di 3» → 3 risposte quiz-v4 con "da" → 18 domande per ID; PDF finto scelto al Controllo → riga «Includo N pagine»;
# import → 18 domande nel programma; reimport → ancora 18; il profilo si ritrova riaprendo il Centro.
import os, json, http.server, threading, functools, tempfile
from playwright.sync_api import sync_playwright
QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.join(QUI, '..', 'dist')
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

# il PDF finto di 24 pagine (i–iv, poi 1…20) è quello di v063_centro.py
src = open(os.path.join(QUI, 'v063_centro.py'), encoding='utf8').read()
ns = {}; exec(src[src.index('def pdf_libro'):src.index('PDF = os.path')], ns)
PDF = os.path.join(tempfile.mkdtemp(), 'Manuale.pdf'); ns['pdf_libro'](PDF)

OGGI = '2026-11-20'
CRE = {'id': 'cre-biologia-3.3', 'type': 'creazione', 'updatedAt': 0, 'materia': 'bio', 'nomeMateria': 'Biologia', 'step': '3.3', 'intensita': 'standard',
       'archetipo': 'scienze_sperimentali',
       'piano': {'step': '3.3', 'blocchi': ['B1'], 'avvisi': [], 'schede': [{'n': 1, 'micro': ['3.3.1'], 'categoria': 'prioritaria', 'blocco': 'B1'}]},
       'schede': [{'n': 1, 'stato': 'da-fare'}], 'esiti': {},
       'fonti': {'libri': [{'nome': 'Manuale', 'pdf': ['Manuale.pdf']}], 'slide': [], 'guide': [], 'indici': [], 'quiz': [], 'vietati': []}}
LIBRO = {'nome': 'Manuale', 'materia': 'Biologia', 'pdf': [{'nome': 'Manuale.pdf'}], 'fonte': 'auto',
         'mappa': {'fonte': 'auto-etichette', 'tratti': [{'pdfDa': 5, 'pdfA': 99999, 'stampDa': 1}], 'affidabilita': 'esatta'},
         'indice': [{'capitolo': '3.3.1 Glicolisi', 'pagina': 1}, {'capitolo': '3.3.2 Membrana', 'pagina': 4}]}

def mcq(k):
    return {'scheda': 'S01', 'livello': 1 + k % 4, 'tipo': 'mcq', 'tipoItem': 'concetto', 'domanda': 'Domanda %d sulla glicolisi e il suo bilancio energetico?' % k,
            'opzioni': ['Giusta %d' % k, 'Falsa a %d' % k, 'Falsa b %d' % k, 'Falsa c %d' % k], 'coppiaGemellaId': None,
            'erroreTipico': 'Confondere resa netta e lorda di ATP (%d)' % k,
            'spiegazioneDistrattori': ['B è sbagliata perché confonde la fase preparatoria con quella di recupero %d' % k,
                                       'C è sbagliata perché attribuisce il NADH al ciclo di Krebs invece che alla glicolisi %d' % k,
                                       'D è sbagliata perché ignora le due molecole di ATP investite all inizio %d' % k],
            'distractorTypes': ['confusione di fase', 'attribuzione errata', 'omissione'],
            'spiegazione': 'RISPOSTA ESATTA: A) Giusta. PERCHÉ GLI ALTRI NO: B) no. C) no. D) no.', 'fonte': '[[Manuale, p. 1]]'}
def compl(k):
    return {'scheda': 'S01', 'livello': 2, 'tipo': 'completamento', 'domanda': 'Nella glicolisi (caso %d) il glucosio diventa ___.' % k,
            'risposte': ['piruvato', 'acido piruvico'], 'spiegazione': 'La glicolisi termina con due molecole di piruvato (%d).' % k, 'fonte': '[[Manuale, p. 2]]'}
def ordi(k):
    return {'scheda': 'S01', 'livello': 3, 'tipo': 'ordinamento', 'domanda': 'Ordina le tappe della glicolisi (caso %d).' % k,
            'elementi': ['Fosforilazione del glucosio', 'Scissione del fruttosio-1,6-bisfosfato', 'Ossidazione della gliceraldeide-3-fosfato', 'Formazione del piruvato'],
            'spiegazione': 'Fase preparatoria, poi fase di recupero (%d).' % k, 'fonte': '[[Manuale, p. 3]]'}
def risposta(da):
    q = [mcq(k) if k <= 12 else compl(k) if k <= 15 else ordi(k) for k in range(da, da + 6)]
    return 'Ecco la parte:\n```json\n' + json.dumps({'formato': 'quiz-v4', 'step': '3.3', 'scheda': 'S01', 'da': da, 'quiz': q}, ensure_ascii=False) + '\n```'

APRI = """(([cre, libro]) => new Promise(fatto => conStrumentiQuiz(() => {
  if (cre) { Stato.salva(cre, true); Stato.salva({ id: Centro.idLibro('Biologia', 'Manuale'), type: 'libro', updatedAt: 0, ...libro }, true); }
  Drive.eProprietario = () => false;   // ospite: in locale senza account l'app crede di essere il proprietario
  CentroUI.apri(); fatto(); })))"""
INNESTI = """JSON.stringify(Stato.tutti('innesto').filter(r => !r.deleted).map(x => ({ k: x.k, micro: x.sub.microstep.map(m => m.n + ':' + m.schede.length),
  dom: x.banche.reduce((a, sk) => a + ((Stato.prendi('bq-' + sk) || {}).domande || []).length, 0) })))"""

with sync_playwright() as p:
    ctx = p.chromium.launch().new_context(bypass_csp=True, viewport={'width': 360, 'height': 800}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time=OGGI + 'T09:00:00+01:00')
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.evaluate("""() => { localStorage.removeItem('imc-centro-esclusi');
      for (const t of ['pacchetto', 'esame', 'creazione', 'parteq', 'innesto', 'libro', 'profiloai']) for (const r of Stato.tutti(t)) Stato.elimina(r.id); }""")
    pg.evaluate(APRI, [CRE, LIBRO]); pg.wait_for_selector('.centro-zona', timeout=10000)
    passo = lambda: pg.locator('.centro-passo').inner_text()
    zona = lambda: pg.locator('.centro-zona')
    def prompt():
        return pg.evaluate("""[...document.querySelectorAll('.centro-zona textarea, .centro-zona pre')]
          .filter(x => !/Risposta/.test(x.getAttribute('aria-label') || '')).map(x => x.value || x.textContent)[0] || ''""")
    def indietro_a(n):
        while ('Passo %d ' % n) not in passo(): pg.get_by_role('button', name='Torna al passo precedente').click(); pg.wait_for_timeout(200)

    # passo 1: senza profilo vale Gemini (il prompt di v0.63: 18 in una risposta); si sceglie «AI locale»
    ok('Passo 3 di 7' in passo() and 'Parti di S01' not in zona().inner_text(), 'senza profilo (Gemini): nessuna divisione in parti')
    indietro_a(1)
    sel = pg.get_by_label('Quale AI usi?')
    ok(sel.input_value() == 'gemini', 'il selettore parte da Gemini')
    sel.select_option('locale'); pg.wait_for_timeout(200)
    ok(not pg.get_by_label('Domande al massimo per risposta').is_visible(), 'i 3 campi restano nascosti per un preset')
    ok(pg.evaluate("Stato.prendi('profiloai').profilo.id") == 'locale', 'scelta salvata nel record profiloai')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok(not pg.locator('.centro-zona').count(), 'Esc chiude il Centro')

    # riapro: il Centro torna al passo 3, ora a parti
    pg.evaluate(APRI, [None, None]); pg.wait_for_selector('.centro-zona')
    ok('Parti di S01 · 0 di 3 incollate' in zona().inner_text(), 'riaperto: S01 in 3 parti, nessuna incollata')
    pg.wait_for_function("/Testo del PDF non disponibile/.test(document.querySelector('.centro-zona').innerText)", timeout=15000)
    ok('Testo del PDF non disponibile' in zona().inner_text() and 'non incluso' in prompt().lower(), 'senza PDF scelto: il prompt dichiara il materiale non incluso')
    viste = []
    for k, da in enumerate([1, 7, 13], 1):
        t = prompt(); viste.append(t)
        ok(('PARTE %d di 3' % k) in t and ('· parte %d di 3' % k) in zona().inner_text(), 'prompt %d: parte %d di 3' % (k, k))
        pg.locator('textarea[aria-label^="Risposta dell"]').fill(risposta(da))
        zona().get_by_role('button', name='Leggi la risposta').click(); pg.wait_for_timeout(300)
    ok(all(len(t) <= 12000 for t in viste), 'i 3 prompt restano entro 12 000 caratteri (%s)' % [len(t) for t in viste])
    ok('completamento' in viste[2] and 'ordinamento' in viste[2] and 'completamento' not in viste[0].split('PARTE')[-1][:400], 'solo la parte 3 chiede completamento e ordinamento')
    q = pg.evaluate("Stato.prendi('prq-biologia-3.3-s1').quiz.map(q => q.id.split('-').pop() + ':' + (q.tipo || 'mcq'))")
    ok(len(q) == 18 and len(set(q)) == 18, '3 risposte → 18 domande con ID distinti (%d)' % len(q))
    ok([x.split(':')[1] for x in q].count('completamento') == 3 and [x.split(':')[1] for x in q].count('ordinamento') == 3, 'mix 12/3/3 rispettato (%s)' % q[11:])

    # PDF finto scelto al Controllo → di nuovo al Quiz: il prompt include il testo
    zona().get_by_role('button', name='Avanti: Controllo').click(); pg.wait_for_timeout(300)
    ok('Passo 4 di 7' in passo(), 'Controllo raggiunto')
    pg.get_by_label('Scegli dal dispositivo il PDF di Manuale').set_input_files(PDF)
    zona().get_by_role('button', name='Torna alle schede').click(); pg.wait_for_timeout(200)
    zona().get_by_role('button', name='Riscrivi la scheda S01').click()
    pg.wait_for_function("/Includo \\d+ pagine/.test(document.querySelector('.centro-zona').innerText)", timeout=15000)
    riga = pg.get_by_role('checkbox', name='Includo', exact=False)
    ok('Includo 3 pagine' in zona().inner_text() and riga.is_checked(), 'PDF scelto: «Includo 3 pagine …» con la casella spuntata (PDF 5–7 = p. 1–3)')
    ok('bilancio energetico' in prompt(), 'il testo del PDF entra nel prompt')
    senza = pg.evaluate("[...document.querySelectorAll('.foglio button, .foglio input, .foglio select, .foglio textarea')].filter(b => b.offsetParent && !(b.getAttribute('aria-label') || (b.labels && b.labels.length) || b.textContent.trim())).length")
    ok(senza == 0, 'nessun controllo senza nome al passo 3 (%d)' % senza)
    ok(pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), 'nessuno sforamento orizzontale a 360 px')

    # riaprendo: Controllo già superato (al passo 4, quando si è scelto il PDF) → Importa
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate(APRI, [None, None]); pg.wait_for_selector('.centro-zona')
    ok('Passo 6 di 7' in passo(), 'controllo superato: riaperto il Centro riparte dalla Prova (%s)' % passo())
    e = pg.evaluate("Stato.prendi('cre-biologia-3.3').esiti")
    ok(e.get('controllato') and not e.get('daCorreggere'), 'Controllo zero token: niente da correggere (%s)' % json.dumps(e))
    pg.get_by_role('button', name='Salta la prova: Importa').or_(pg.get_by_role('button', name='Avanti: Importa')).first.click(); pg.wait_for_timeout(300)
    ok('Passo 7 di 7' in passo() and '18 domande' in pg.locator('.centro-albero').inner_text(), 'Importa: 18 domande nell\'albero')
    pg.get_by_role('button', name='dove lo metto', exact=False).click()
    pg.locator('.innesto-scelta button').click(); pg.wait_for_timeout(300)
    i1 = pg.evaluate(INNESTI)
    ok(i1 == '[{"k":"BIO3.3","micro":["3.3.1:1"],"dom":18}]', 'import: 1 scheda, 18 domande (%s)' % i1)
    pg.get_by_role('button', name='dove lo metto', exact=False).click()
    pg.locator('.innesto-scelta button').click(); pg.wait_for_timeout(300)
    ok(pg.evaluate(INNESTI) == i1, 'reimport: ancora 18, nessun doppione')

    # il profilo si ritrova riaprendo il Centro
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate(APRI, [None, None]); pg.wait_for_selector('.centro-zona')
    indietro_a(1)
    ok(pg.get_by_label('Quale AI usi?').input_value() == 'locale', 'riaprendo il Centro il profilo è ancora «AI locale»')
    pg.set_viewport_size({'width': 1280, 'height': 800}); pg.wait_for_timeout(200)
    ok(pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), 'nessuno sforamento a 1280 px')

    # T8 runner: domanda di codice in monospazio; voto della rubrica confermato dall'utente → statq (auto solo se cambiato)
    pg.set_viewport_size({'width': 360, 'height': 800}); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.evaluate("""() => { localStorage.setItem('imc-quiz-modo', 'esame');
      for (const id of ['sq-t8-cod', 'sq-t8-ap']) if (Stato.prendi(id)) Stato.elimina(id);
      const dom = [
        { id: 't8-cod', sk: 'bio-3.3-S01', t: 'risposta_aperta_rubrica', lv: 'Applicativo', q: 'Scrivi una funzione somma(a, b).', e: 'Usa return.', linguaCodice: 'python',
          rubricaPunti: ['definisce la funzione somma con due parametri', 'restituisce il risultato con return'], show: 'def somma(a, b): return a + b' },
        { id: 't8-ap', sk: 'bio-3.3-S01', t: 'risposta_aperta_rubrica', lv: 'Applicativo', q: 'Cosa produce la glicolisi?', e: 'Piruvato e ATP.',
          rubricaPunti: ['produce due molecole di piruvato', 'guadagno netto di due ATP'], show: 'Due piruvato e due ATP netti.' }];
      QuizApp.apri(null, 'bio', '3.3.1', { id: 'bio-3.3-S01', k: 1, n: 1, titolo: 'Runner' }, () => dom.map(d => ({ ...d })), { occh: 'v0.64', titolo: 'Runner v0.64' }); }""")
    pg.wait_for_selector('.qz-domanda')
    ta = pg.locator('#qz-ans')
    att = ta.evaluate("t => [t.classList.contains('qz-codice'), t.getAttribute('spellcheck'), t.getAttribute('autocapitalize'), getComputedStyle(t).fontFamily]")
    ok(att[0] and att[1] == 'false' and att[2] == 'off' and 'monospace' in att[3], 'codice: textarea in monospazio, spellcheck e maiuscole spenti (%s)' % att)
    ta.fill('def somma(a, b):\n    return a + b'); pg.get_by_role('button', name='Verifica').click(); pg.wait_for_selector('.qz-voto')
    v = pg.locator('.qz-voto').inner_text()
    ok('Coperti ' in v and '/2 punti chiave' in v, 'proposta della rubrica «coperti k/n» (%s)' % v.splitlines()[0])
    ok(pg.evaluate("!Stato.prendi('sq-t8-cod')"), 'prima della conferma niente statq')
    prop = 'giusta' in v.splitlines()[0].split('proposta:')[1]
    pg.get_by_role('button', name='Era sbagliata' if prop else 'Era giusta').click(); pg.wait_for_selector('#qz-why')
    sq = pg.evaluate("(({n, ok, auto}) => ({n, ok, auto: auto || false}))(Stato.prendi('sq-t8-cod'))")
    ok(sq == {'n': 1, 'ok': 0 if prop else 1, 'auto': True}, 'voto cambiato → statq col voto confermato e auto:true (%s)' % sq)
    ok('Voto deciso da te' in pg.locator('#qz-why').inner_text(), 'la correzione dice che il voto l\'hai deciso tu')
    pg.locator('[data-az=avanti]').click(); pg.wait_for_selector('.qz-domanda')
    ok(not pg.locator('#qz-ans').evaluate("t => t.classList.contains('qz-codice')"), 'risposta aperta senza codice: testo normale')
    pg.locator('#qz-ans').fill('Produce due molecole di piruvato con un guadagno netto di due ATP.'); pg.get_by_role('button', name='Verifica').click(); pg.wait_for_selector('.qz-voto')
    ok(pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), 'conferma del voto: nessuno sforamento a 360 px')
    pg.locator('.qz-voto .chip.on').click(); pg.wait_for_selector('#qz-why')
    sq = pg.evaluate("(({n, ok, auto}) => ({n, ok, auto: auto || false}))(Stato.prendi('sq-t8-ap'))")
    ok(sq == {'n': 1, 'ok': 1, 'auto': False}, 'voto proposto confermato → statq senza auto (%s)' % sq)

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
