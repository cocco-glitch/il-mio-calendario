# Test v0.58.6 «Nessun vicolo cieco»: ospite nuovo → «Inizia in 3 passi» su Oggi (U10), piano creato scrivendo la
# materia dentro il wizard (U4), voci di «＋ Crea piano» in lingua comune (U5), Annulla/Modifica dopo l'aggiunta rapida (U7).
import os, sys, http.server, threading, functools
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

with sync_playwright() as p:
    b = p.chromium.launch()
    for nome, vp in (('telefono', {'width': 375, 'height': 812}), ('desktop', {'width': 1280, 'height': 800})):
        ctx = b.new_context(bypass_csp=True, viewport=vp)
        ctx.route('**/cdnjs.cloudflare.com/**', lambda r: r.abort())
        pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
        pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.wait_for_timeout(600)
        # ospite: niente programma del proprietario (in locale il sito lo carica perché non c'è accesso)
        pg.evaluate("Stato.tutti('pacchetto').concat(Stato.tutti('esame')).forEach(r => Stato.elimina(r.id))")

        # --- U10: Oggi senza corsi → un solo riquadro guida al posto dei riquadri vuoti ---
        pg.evaluate("vai('oggi')"); pg.wait_for_timeout(150)
        ok(pg.locator('.inizia-3').count() == 1, '%s: Oggi mostra «Inizia in 3 passi»' % nome)
        ok(pg.locator('.nota-giorno').count() == 0, '%s: niente riquadri vuoti (Nota del giorno nascosta)' % nome)

        # --- U5 + U4: dal riquadro, piano con materia scritta nel wizard; tocchi contati ---
        tocchi = 0
        pg.click('.inizia-3 button:has-text("Crea piano")'); tocchi += 1
        pg.wait_for_selector('dialog.dialogo-sfondo[open]')
        t = pg.inner_text('dialog.dialogo-sfondo')
        ok('Ho una data d’esame' in t and 'Parto dall’indice del libro' in t, '%s: voci in lingua comune' % nome)
        ok('Uso le schede' not in t and 'Intelligente' not in t, '%s: niente «dalle schede» senza schede, niente sigle' % nome)
        pg.click('dialog.dialogo-sfondo button:has-text("Ho una data d’esame")'); tocchi += 1
        pg.wait_for_selector('.campo-materia-nuova', state='attached')
        if pg.locator('.campo-materia select').count():   # in locale senza accesso il ruolo è «proprietario»: ci sono le materie base
            pg.select_option('.campo-materia select', '__nuova__'); tocchi += 1
            ok(pg.locator('.campo-materia-nuova').is_visible(), '%s: «＋ Nuova materia…» apre il campo di testo' % nome)
        else:
            ok(pg.locator('.campo-materia-nuova').is_visible(), '%s: senza materie il campo è un testo libero' % nome)
        pg.click('.campo-materia-nuova'); tocchi += 1
        pg.keyboard.type('Anatomia')
        pg.click('.foglio-testa button:has-text("Crea")'); tocchi += 1
        pg.wait_for_timeout(500)
        if pg.evaluate("Studio.pkPiani().length") == 0:   # materia nuova: il wizard chiede l'indice e lo mette a fuoco (nessun tocco)
            foc = pg.evaluate("!!(document.activeElement && document.activeElement.tagName === 'TEXTAREA' && document.activeElement.closest('details') && document.activeElement.closest('details').open)")
            ok(foc, '%s: senza argomenti il wizard apre e mette a fuoco il campo indice' % nome)
            pg.keyboard.type(chr(10).join(['1 Introduzione', '2 Ossa', '3 Muscoli', '4 Apparato cardiovascolare']))
            pg.click('.foglio-testa button:has-text("Crea")'); tocchi += 1
            pg.wait_for_timeout(600)
        r = pg.evaluate("({ piani: Studio.pkPiani().length, mat: Stato.tutti('materia').filter(m => !m.deleted && m.nome === 'Anatomia').length })")
        ok(r['piani'] >= 1 and r['mat'] == 1, '%s: piano e materia creati senza uscire dal wizard (%s)' % (nome, r))
        ok(tocchi <= 6, '%s: %d tocchi (≤ 6)' % (nome, tocchi))
        pg.evaluate("document.querySelectorAll('.visore, .foglio-sfondo, dialog').forEach(e => e.remove())")
        d = pg.evaluate("[materiaPerNome('anatomia '), materiaPerNome('Anatomia'), Stato.tutti('materia').filter(m => !m.deleted && /anatomia/i.test(m.nome)).length]")
        ok(d[0] == d[1] and d[2] == 1, '%s: materia deduplicata per nome (%s)' % (nome, d))
        # v0.59.1: con un piano (o carte/appunti) ma senza agenda, Oggi mostra la guida SOPRA i riquadri soliti, non al loro posto
        pg.evaluate("(() => { const mz = Carte.nuovoMazzo('Vicoli'); Carte.riempi(mz.id, [{ f: 'Osso', r: 'tessuto' }]); vai('oggi'); })()"); pg.wait_for_timeout(200)
        ok(pg.locator('.inizia-3').count() == 1 and pg.locator('.card.ripassa').count() == 1 and pg.locator('.nota-giorno').count() == 1,
           '%s: piano + carte senza agenda → guida + «Ripassa (N)» + riquadri soliti' % nome)
        pg.evaluate("Stato.tutti('carta').concat(Stato.tutti('mazzo')).forEach(r => Stato.elimina(r.id))")

        # --- U10: chi ha già impegni ma nessun corso vede la guida sopra i riquadri soliti, e può nasconderla ---
        pg.evaluate("Stato.salva({ id: 'ev-t1', type: 'evento', updatedAt: 0, titolo: 'Riunione', inizio: ymd(new Date()) + 'T09:00', fine: ymd(new Date()) + 'T10:00', tuttoIlGiorno: false, categoriaId: (categorie()[0] || {}).id, promemoria: [], checklist: [] }); vai('oggi')"); pg.wait_for_timeout(150)
        ok(pg.locator('.inizia-3').count() == 1 and pg.locator('.nota-giorno').count() == 1, '%s: con dati ma senza corsi: guida + riquadri soliti' % nome)
        pg.click('.inizia-3 button:has-text("Nascondi")'); pg.wait_for_timeout(150)
        ok(pg.locator('.inizia-3').count() == 0, '%s: «Nascondi» toglie la guida' % nome)
        pg.evaluate("localStorage.removeItem('imc-guida-3passi'); Stato.elimina('ev-t1')")

        # --- U10: il riquadro sparisce al primo corso ---
        pg.evaluate("""(() => { const pk = { tipo: 'step', id: 'corso-t1', step: 1000, titolo: 'Corso T', aggiornato: '2026-11-19', proprio: true, risorse: { libri: {}, quiz: {} }, materie: [] };
          salvaPacchetto(pk); })()""")
        pg.evaluate("vai('oggi')"); pg.wait_for_timeout(150)
        ok(pg.locator('.inizia-3').count() == 0, '%s: con un corso il riquadro guida sparisce' % nome)

        # --- U7: aggiunta rapida → Annulla toglie il record ---
        pg.evaluate("document.getElementById('avvisi') && document.getElementById('avvisi').replaceChildren()")
        campo = pg.locator('.pagina input[type=text]').first
        campo.fill('Dentista domani alle 16'); campo.press('Enter'); pg.wait_for_timeout(200)
        n0 = pg.evaluate("Stato.tutti('evento').filter(e => !e.deleted && e.titolo.includes('Dentista')).length")
        ok(n0 == 1 and pg.locator('#avvisi .avviso-azione:has-text("Annulla")').count() == 1, '%s: toast «Creato» con Annulla (%d)' % (nome, n0))
        ok(pg.locator('#avvisi .avviso-azione:has-text("Modifica")').count() == 1, '%s: toast con Modifica' % nome)
        pg.click('#avvisi .avviso-azione:has-text("Annulla")'); pg.wait_for_timeout(150)
        n1 = pg.evaluate("Stato.tutti('evento').filter(e => !e.deleted && e.titolo.includes('Dentista')).length")
        ok(n1 == 0, '%s: Annulla elimina l\'evento appena creato' % nome)
        campo.fill('Palestra domani alle 18'); campo.press('Enter'); pg.wait_for_timeout(200)
        pg.click('#avvisi .avviso-azione:has-text("Modifica")'); pg.wait_for_timeout(250)
        ok(pg.locator('.foglio-sfondo').count() >= 1, '%s: Modifica apre l\'editor' % nome)
        ctx.close()
    b.close()

print('TUTTO OK' if not err else '%d errori' % len(err)); sys.exit(1 if err else 0)
