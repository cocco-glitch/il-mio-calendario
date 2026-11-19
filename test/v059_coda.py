# Test v0.59 «Coda unica»: CodaRipasso dà gli STESSI elementi dovuti delle 5 sorgenti di prima (equivalenza),
# non riscrive gli stati di ripasso, e Oggi mostra un solo riquadro «Ripassa (N)» (U6) a 375 px e 1280 px.
import os, sys, json, http.server, threading, functools
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

G = '2026-11-12'
DATI = """(() => {
  // step: C2.1 completato → ripasso oggi (come studiaora.py)
  Studio.schedeDi(Studio.trovaSotto('C2.1').sub).filter(x => x.tipo === 'P').forEach((x, i) => Studio.segna(x.id, { fatta: true, data: '2026-11-11', punteggio: i ? 80 : 50 }));
  // carte: un mazzo con 3 carte nuove
  const mz = Carte.nuovoMazzo('Mazzo coda'); Carte.riempi(mz.id, [{ f: 'Uno', r: '1' }, { f: 'Due', r: '2' }, { f: 'Tre', r: '3' }]);
  // quiz: due domande con ripasso scaduto su una scheda vera, una è un'illusione di competenza
  const sk = Studio.schedeDi(Studio.trovaSotto('C2.1').sub)[0].id;
  Stato.salva({ id: 'sq-coda1', type: 'statq', updatedAt: 0, sk, n: 2, ok: 1, ultima: '', esito: true, neuro: { due: '2026-11-10' } });
  Stato.salva({ id: 'sq-coda2', type: 'statq', updatedAt: 0, sk, n: 2, ok: 0, ultima: '', esito: false, neuro: { due: '2026-11-12', tag: ['illusione_competenza'] } });
  Stato.salva({ id: 'sq-coda3', type: 'statq', updatedAt: 0, sk, n: 2, ok: 2, ultima: '', esito: true, neuro: { due: '2026-11-20' } });
  // appunti: uno di ieri (sezioni mai ripassate → dovute), uno di oggi (non ancora)
  Stato.salva(Appunti.nuovo({ id: 'ap-coda1', titolo: 'Osmosi', testo: '# Membrana\\nLa membrana è semipermeabile.\\n# Pressione\\nLa pressione osmotica dipende dalla concentrazione.', creato: '2026-11-11' }));
  Stato.salva(Appunti.nuovo({ id: 'ap-coda2', titolo: 'Nuovo', testo: '# Oggi\\nScritto oggi.', creato: '2026-11-12' }));
  // piano: timeline L1–L4 con un ripasso FSRS oggi (dovuto), uno già fatto e una voce di studio (non è ripasso)
  Stato.salva({ id: 'pk-ai-coda', type: 'pacchetto', updatedAt: 0, contenuto: { formato: 'pacchetto-studio', versione: 1, tipo: 'piano', id: 'ai-coda', titolo: 'Piano coda', aggiornato: '2026-11-01', origine: 'ai_neuro', giorniTeoria: 1,
    giorni: [{ data: '2026-11-12', voci: [
      { k: 'C~ai-coda~u1~R1', t: '🔁 Ripasso 1 · Gas', uid: 'u1', livelloCognitivo: 1, isRipassoFSRS: true, min: 15 },
      { k: 'C~ai-coda~u2~R1', t: '🔁 Ripasso 1 · Soluzioni', uid: 'u2', livelloCognitivo: 1, isRipassoFSRS: true, min: 15 },
      { k: 'C~ai-coda~u3~L2', t: 'Equilibrio', uid: 'u3', livelloCognitivo: 2, min: 40 }] }] } });
  Studio.segna('step-C~ai-coda~u2~R1', { fatta: true, data: '2026-11-12' });
})()"""

# Le funzioni di PRIMA (i consumatori di oggi): cosa risultava dovuto per ciascuna sorgente.
VECCHIE = """(() => {
  const g = '%s';
  const step = Ripassi.delGiorno(g).oggi.filter(x => Ripassi.schedaDaProporre(x.k)).map(x => x.k);
  const nc = Carte.mazzi().length ? Carte.conta() : { nuove: 0, ripasso: 0 };
  const quiz = QuizRifare.dovute(g).map(s => s.id);
  const appunti = Appunti.appuntiDaRipassare().map(a => a.id);
  const piano = Studio.vociDelGiorno(new Date(g + 'T12:00')).filter(x => x.v.isRipassoFSRS && !Studio.stepFatto(x.v.k, x.p)).map(x => x.v.k);
  return { step, carte: nc.nuove + nc.ripasso, quiz, appunti, piano };
})()""" % G
NUOVE = """(() => {
  const g = '%s', per = s => CodaRipasso.per(s, g);
  return { step: per('step').map(e => e.k), carte: per('carte').reduce((s, e) => s + e.n, 0), quiz: per('quiz').flatMap(e => e.ids),
    appunti: per('appunti').map(e => e.id), piano: per('piano').map(e => e.k), conta: CodaRipasso.conta(g), tutti: CodaRipasso.dovuti(g).map(e => e.sorgente + ':' + e.priorita) };
})()""" % G
STATI = "JSON.stringify(['memoria', 'statq', 'progresso', 'carta', 'appunto', 'pacchetto'].map(t => Stato.tutti(t).map(r => { const { updatedAt, ...x } = r; return x; }).sort((a, b) => a.id < b.id ? -1 : 1)))"

with sync_playwright() as p:
    b = p.chromium.launch()
    for nome, vp in (('telefono', {'width': 375, 'height': 812}), ('desktop', {'width': 1280, 'height': 800})):
        ctx = b.new_context(bypass_csp=True, viewport=vp, locale='it-IT', timezone_id='Europe/Rome')
        ctx.route('**/cdnjs.cloudflare.com/**', lambda r: r.abort())
        pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
        pg.clock.install(time=G + 'T15:00:00+01:00')
        pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_function("!!Studio.pkPiano() && Studio.pkStep().length >= 3")
        pg.evaluate(DATI); pg.wait_for_timeout(200)

        # --- equivalenza sulle 5 sorgenti (scritta prima della UI) ---
        v = pg.evaluate(VECCHIE)
        ok(all([v['step'], v['carte'], v['quiz'], v['appunti'], v['piano']]), '%s: dati di prova dovuti in tutte e 5 le sorgenti %s' % (nome, v))
        prima = pg.evaluate(STATI)
        n = pg.evaluate(NUOVE)
        for s in ('step', 'quiz', 'appunti', 'piano'):
            ok(sorted(n[s]) == sorted(v[s]), '%s: %s uguali a prima (%s = %s)' % (nome, s, n[s], v[s]))
        ok(n['carte'] == v['carte'], '%s: carte uguali a prima (%s = %s)' % (nome, n['carte'], v['carte']))
        ok(n['quiz'] and n['quiz'][0] == 'sq-coda2', '%s: nei quiz prima le illusioni di competenza (%s)' % (nome, n['quiz']))
        ok(n['conta'] == len(v['step']) + v['carte'] + len(v['quiz']) + len(v['appunti']) + len(v['piano']), '%s: Ripassa (N) = somma delle 5 sorgenti (%s)' % (nome, n['conta']))
        pr = [float(x.split(':')[1]) for x in n['tutti']]
        ok(pr == sorted(pr, reverse=True), '%s: coda ordinata per priorità %s' % (nome, n['tutti']))
        # vicinanza dell'esame: un esame tra 3 giorni alza la priorità senza cambiare gli elementi
        pg.evaluate("Stato.salva({ id: 'es-coda', type: 'esame', updatedAt: 0, nome: 'Chimica', data: '2026-11-15', materie: ['C'] })")
        n2 = pg.evaluate(NUOVE)
        ok(sorted(n2['step']) == sorted(v['step']) and max(float(x.split(':')[1]) for x in n2['tutti']) > max(pr), '%s: esame vicino → priorità più alta, stessi elementi' % nome)
        pg.evaluate("Stato.elimina('es-coda')")

        # --- Oggi: un solo riquadro di ripasso (U6) ---
        pg.evaluate("vai('oggi')"); pg.wait_for_timeout(300)
        titoli = pg.eval_on_selector_all('.card-titolo', 'els => els.map(e => e.textContent)')
        ok(not any(t in ('Ripassi di oggi', 'Flashcard di oggi', 'Appunti da ripassare') for t in titoli), '%s: niente più 3 riquadri separati %s' % (nome, titoli))
        rip = pg.locator('.card.ripassa')
        ok(rip.count() == 1, '%s: un solo riquadro «Ripassa»' % nome)
        t = rip.inner_text() if rip.count() else ''
        ok(('Ripassa (%d)' % n['conta']) in t, '%s: titolo «Ripassa (%d)» (%s)' % (nome, n['conta'], t[:60]))
        ok(all(x in t for x in ('carte', 'quiz', 'appunt', 'Chi 2.1', 'Rifai:')), '%s: riepilogo con tutte le sorgenti e riga del sotto-step' % nome)
        larg = pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        ok(larg, '%s: niente scorrimento orizzontale' % nome)

        # --- Studia ora usa la coda: ci sono tutte le sorgenti, anche il ripasso del piano (prima mancava) ---
        voci = pg.evaluate("StudiaOra.componi(90, new Date('%sT15:00')).map(v => v.tipo)" % G)
        ok(all(x in voci for x in ('ripasso', 'carte', 'quiz', 'appunto', 'piano')), '%s: Studia ora con le 5 sorgenti %s' % (nome, voci))
        voci25 = pg.evaluate("StudiaOra.componi(25, new Date('%sT15:00')).reduce((s, v) => s + v.min, 0)" % G)
        ok(voci25 <= 25, '%s: 25 min rispettati (%d)' % (nome, voci25))

        # --- sola lettura: nessuno stato di ripasso riscritto dalla coda né dal disegno di Oggi ---
        ok(pg.evaluate(STATI) == prima, '%s: stati di ripasso identici prima e dopo (letti, non riscritti)' % nome)

        # --- tocco su «Inizia» apre la voce più urgente (senza i quiz finti, che offline non si ricostruiscono: in cima va il sotto-step) ---
        pg.evaluate("['sq-coda1', 'sq-coda2'].forEach(id => Stato.elimina(id)); vai('oggi')"); pg.wait_for_timeout(300)
        pg.click('.card.ripassa button:has-text("Inizia")'); pg.wait_for_timeout(500)
        ok(pg.locator('.foglio').count() >= 1 and 'Ripasso' in pg.inner_text('.foglio'), '%s: «Inizia» apre il ripasso del sotto-step più a rischio' % nome)
        ctx.close()
    b.close()

print('TUTTO OK' if not err else '%d errori' % len(err)); sys.exit(1 if err else 0)
