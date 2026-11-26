# Test fase 9/12 (27/11/2026): «Componi un quiz» (ComponiQuiz, chunk del motore).
# 1) Quiz cumulativo misto in Allenamento su 3 schede di 3 materie: domande di più schede, risultato diviso per scheda
#    (statq e padronanza 'con:' per ogni scheda, nota «Verifica concetti», punteggi delle schede invariati), un solo avviso,
#    niente riquadro «Consolida» di una sola scheda. 2) Simulazione in app a tempo (modo Esame): allo scadere il quiz si chiude,
#    record 'simulazione' con piano ed errate. 3) Revisione: riapre solo le sbagliate. 4) Voce SIM di un piano → foglio simulazione.
# 0 chiamate AI.
import json, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

PORTA = 8767
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORTA), '-d', 'dist', '--protocol', 'HTTP/1.1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    with socket.socket() as _s:
        if _s.connect_ex(('127.0.0.1', PORTA)) == 0: break
    time.sleep(.1)
err, rete_ai = [], []
def ok(c, m):
    print(('  ok  ' if c else ' FAIL ') + m)
    if not c: err.append(m)

def rispondi(pg):
    """Risponde alla domanda corrente in qualunque formato (la correttezza non conta qui)."""
    if pg.locator('.qz-cert [data-cert="2"]').count(): pg.click('.qz-cert [data-cert="2"]')
    if pg.locator('.qz-opz-b:not([data-seq])').count(): pg.locator('.qz-opz-b:not([data-seq])').first.click()
    elif pg.locator('[data-seq]').count():
        while pg.locator('[data-seq]').count(): pg.locator('[data-seq]').first.click()
    elif pg.locator('select[data-abb]').count():
        for s in pg.locator('select[data-abb]').all(): s.select_option(index=1)
        pg.click('.qz-abb button[type=submit]')
    else:
        pg.fill('#qz-ans', 'risposta di prova'); pg.click('.qz-fill button[type=submit]')
        if pg.locator('[data-voto="0"]').count(): pg.click('[data-voto="0"]')
    pg.wait_for_selector('#qz-why', timeout=5000)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
        pg.add_init_script("try { localStorage.setItem('imc-quiz-modo','neuro') } catch (e) {}")
        pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
        for host in ['api.groq.com', 'generativelanguage.googleapis.com', 'api.xkiro.com', 'api.cohere.com', 'router.requesty.ai']:
            pg.route('https://' + host + '/**', lambda route: (rete_ai.append(route.request.url), route.abort()))
        pg.goto('http://localhost:%d/index.html' % PORTA); pg.wait_for_timeout(1500)
        # tre schede della banca dello step 3, una per materia, segnate come fatte (70%) senza quiz in app
        sk = pg.evaluate("""async () => { const B = await Banca.carica(3); const out = [];
            for (const m of ['C', 'B', 'F']) { const id = Object.keys(B.schede).find(k => k[0] === m && trovaScheda(k) && B.domande.filter(d => d.sk === k).length >= 6); if (id) out.push(id); }
            for (const id of out) Studio.segna(id, { fatta: true, data: '2026-11-20', punteggio: 70 });
            await caricaMotoreStudio(); return out; }""")
        ok(len(sk) == 3, 'tre schede di tre materie nella banca dello step 3: %s' % sk)

        # 1) foglio dalla vista padronanza → cumulativo, 6 domande, Allenamento
        pg.evaluate("ComponiQuiz.apri({ tipo: 'cumulativo' })"); pg.wait_for_selector('.foglio')
        testo = pg.inner_text('.foglio')
        ok('Punti deboli' in testo and 'Cumulativo' in testo and 'Allenamento' in testo and 'Esame' in testo, 'foglio: cosa, materie, domande, modo')
        ok(pg.locator('.foglio .chip', has_text='Tutte').count() == 1, 'scelta delle materie (Tutte + una per materia)')
        pg.fill('.foglio input[aria-label="Numero di domande"]', '6'); pg.dispatch_event('.foglio input[aria-label="Numero di domande"]', 'change')
        ok(pg.locator('.foglio input[aria-label="Minuti a disposizione"]').count() == 0, 'Allenamento: niente minuti')
        pg.click('.foglio button:has-text("Esame")')
        ok(pg.locator('.foglio input[aria-label="Minuti a disposizione"]').count() == 1, 'Esame: minuti selezionabili a mano')
        pg.click('.foglio button:has-text("Allenamento")')
        pg.click('.foglio button:has-text("Inizia il quiz")')
        pg.wait_for_selector('.qz-domanda', timeout=10000)
        occ = pg.text_content('.qz-occhiello')
        ok('Quiz cumulativo' in occ and '6 domande' in occ and '2 schede' in occ, 'occhiello: %s' % occ)
        n = pg.locator('.qz-metro span').count(); ok(n == 6, '6 domande nel quiz (%d)' % n)
        for k in range(n):
            if k: pg.click('[data-az=avanti]')
            rispondi(pg)
        pg.click('[data-az=avanti]'); pg.wait_for_selector('.qz-punti'); pg.wait_for_timeout(1200)
        st = pg.evaluate("""(sk) => { const oggi = ymd(new Date());
            const sq = Stato.tutti('statq').filter(s => !s.deleted && s.ultima === oggi).map(s => s.sk);
            const con = Stato.tutti('memoria').filter(m => !m.deleted && String(m.er || '').startsWith('con:') && m.ultimo === oggi).map(m => m.sk);
            return { sq: [...new Set(sq)].sort(), con: [...new Set(con)].sort(), prog: sk.map(id => { const p = Studio.prog(id); return [p.punteggio, /Verifica concetti/.test(p.nota || '')]; }),
              riga: (document.querySelector('.misto-riga') || {}).textContent || '', fine: !!document.querySelector('.finequiz'),
              avvisi: [...document.querySelectorAll('#avvisi .avviso')].map(a => a.textContent) }; }""", sk)
        ok(len(st['sq']) == 2 and len(st['con']) == 2 and st['sq'] == st['con'], 'statq e padronanza divise per scheda: %s / %s' % (st['sq'], st['con']))
        ok(sum(1 for x in st['prog'] if x[0] == 70) == 3 and sum(1 for x in st['prog'] if x[1]) == 2, 'punteggi delle schede invariati (70), nota «Verifica concetti» sulle 2 schede del quiz: %s' % st['prog'])
        ok('Padronanza aggiornata su 2 schede' in st['riga'] and not st['fine'], 'una riga per il quiz misto, niente «Consolida» di una scheda sola')
        ok(sum(1 for a in st['avvisi'] if 'Quiz salvato' in a) == 1 and not any('Verifica concetti' in a for a in st['avvisi']), 'un solo avviso per tutte le schede: %s' % st['avvisi'])
        pg.click('.visore-testa button:has-text("Chiudi")')

        # 2) simulazione in app a tempo: 3 domande, 1 minuto; il tempo scade senza risposte
        pg.evaluate("ComponiQuiz.avvia({ tipo: 'cumulativo', materie: [], n: 3, esame: true, minuti: 1, piano: 'gen-prova', voce: 'SIM-1', titolo: 'Simulazione 1' })")
        pg.wait_for_selector('.qz-domanda', timeout=10000)
        ok('Simulazione d\'esame' in pg.text_content('.qz-occhiello') and 'correzione alla fine' in pg.text_content('.qz-occhiello'), 'occhiello della simulazione')
        t0 = pg.text_content('.misto-tempo').strip(); ok(t0.endswith(('0:59', '0:58', '1:00')), 'conto alla rovescia nella barra: %s' % t0)
        pg.evaluate("(() => { const n0 = Date.now(), now = Date.now.bind(Date); Date.now = () => now() + 61000; })()")
        pg.wait_for_selector('.qz-punti', timeout=4000); pg.wait_for_timeout(600)
        sim = pg.evaluate("Stato.tutti('simulazione').filter(s => s.piano === 'gen-prova').map(s => ({ pct: s.pct, totale: s.totale, errate: (s.errate || []).length, limite: s.limite, fileId: s.fileId }))")
        ok(len(sim) == 1 and sim[0]['errate'] == 3 and sim[0]['limite'] == 1 and sim[0]['fileId'] == 'app', 'tempo scaduto: quiz chiuso, simulazione salvata, le 3 senza risposta tra le errate (per la revisione): %s' % sim)
        pg.click('[data-az=tutto]'); pg.wait_for_timeout(300)
        n2 = pg.evaluate("Stato.tutti('simulazione').filter(s => s.piano === 'gen-prova').length")
        ok(n2 == 1, '«Rifai tutto» non crea una seconda simulazione')
        pg.click('.visore-testa button:has-text("Chiudi")')

        # 3) revisione: solo le sbagliate, in Allenamento
        pg.evaluate("ComponiQuiz.revisione('gen-prova')"); pg.wait_for_selector('.qz-domanda', timeout=10000)
        ok('Revisione degli errori' in pg.text_content('.qz-occhiello') and pg.locator('.qz-metro span').count() == 3 and pg.locator('.qz-cert').count() == 1, 'revisione: le 3 sbagliate, con la certezza (Allenamento)')
        pg.click('.visore-testa button:has-text("Chiudi")')

        # 4) voce SIM di un piano generato → foglio della simulazione (domande e minuti a mano, materie del piano)
        pg.evaluate("ComponiQuiz.daVoce({ id: 'gen-prova', generato: { argomenti: ['C1.1', 'B1.1'] } }, { k: 'SIM-2', t: '⏱ Simulazione 2 (D−3)', speciale: true })")
        pg.wait_for_selector('.foglio')
        f = pg.inner_text('.foglio')
        ok('Simulazione d\'esame' in f and 'Inizia la simulazione' in f and pg.locator('.foglio input[aria-label="Minuti a disposizione"]').count() == 1
           and pg.input_value('.foglio input[aria-label="Numero di domande"]') == '27', 'foglio simulazione: 27 domande e minuti modificabili')
        ok(pg.locator('.foglio .chip.on').count() >= 2, 'materie del piano preselezionate')
        b.close()
finally:
    srv.terminate()
ok(not rete_ai, 'nessuna chiamata AI (%d)' % len(rete_ai))
print('\nTUTTO OK' if not err else '\n%d FALLITI: %s' % (len(err), err))
