# Test Fase 4: aggiunta rapida, .ics, specchio Google Calendar, preset e layout.
import os, sys, http.server, threading, functools, json
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
FINTO = r"""
window.__gc = { cal: null, ev: {}, log: [] };
window.google = { accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken(o) { window.__scope = o && o.scope; setTimeout(() => this.callback({ access_token: 'tok', expires_in: 3600 }), 0); } }), revoke() {} } } };
const _f = window.fetch.bind(window);
window.fetch = async (url, opz = {}) => {
  const u = new URL(url, location.href); if (u.origin === location.origin) return _f(url, opz);
  const j = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json' } });
  if (u.pathname.endsWith('/userinfo')) return j({ email: 'cocco.haloa@gmail.com' });
  if (u.hostname === 'www.googleapis.com' && u.pathname.startsWith('/calendar/')) {
    const G = window.__gc, m = opz.method || 'GET'; G.log.push(m + ' ' + u.pathname);
    if (u.pathname.endsWith('/calendars') && m === 'POST') { G.cal = 'cal1'; return j({ id: 'cal1' }); }
    if (/\/calendars\/[^/]+$/.test(u.pathname)) return G.cal ? j({ id: G.cal }) : j({}, 404);
    const mm = u.pathname.match(/\/events\/?([^/]*)$/), id = mm[1];
    if (m === 'PUT') { if (!G.ev[id]) return j({}, 404); G.ev[id] = JSON.parse(opz.body); return j(G.ev[id]); }
    if (m === 'POST') { const b = JSON.parse(opz.body); G.ev[b.id] = b; return j(b); }
    if (m === 'DELETE') { if (!G.ev[id]) return j({}, 404); delete G.ev[id]; return new Response(null, { status: 204 }); }
  }
  if (u.searchParams.get('alt') === 'media') return new Response('{"records":[]}', { headers: { 'content-type': 'application/json' } });
  if (u.pathname.startsWith('/upload/')) return j({ id: 'up1' });
  if (opz.method === 'POST') return j({ id: 'c' + Math.random() });
  return j({ files: [] });
};
"""
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='it-IT', timezone_id='Europe/Rome', color_scheme='dark')
    ctx.route('**/accounts.google.com/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body='//'))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.clock.install(time='2026-11-11T09:00:00+01:00')   # mercoledì 11/11/2026
    pg.add_init_script(FINTO); pg.goto(URL); pg.wait_for_selector('.tabbar')
    I = lambda f: pg.evaluate("(() => { const r = interpreta(%s); return r && { tipo: r.tipo, titolo: r.titolo, g: ymd(r.giorno), ora: r.ora, fine: r.fine, tutto: r.tuttoIlGiorno, rr: r.rrule, cat: r.categoriaId }; })()" % json.dumps(f))
    c = [
      ('domani 15-17 Chimica 3.1', dict(tipo='evento', titolo='Chimica 3.1', g='2026-11-12', ora=[15, 0], fine=[17, 0], tutto=False, cat='cat-studio')),
      ('ogni lunedì 9 palestra', dict(titolo='Palestra', g='2026-11-16', ora=[9, 0], rr={'freq': 'W', 'interval': 1, 'byday': [0]})),
      ('ven 18:30 cena da Marco', dict(titolo='Cena da Marco', g='2026-11-13', ora=[18, 30], fine=None)),
      ('12/11 tutto il giorno gita', dict(titolo='Gita', g='2026-11-12', tutto=True)),
      ('ricorda lunedì alle 10 chiamare il medico', dict(tipo='task', titolo='Chiamare il medico', g='2026-11-16', ora=[10, 0])),
      ('dalle 9 alle 10:30 ripasso fisica', dict(titolo='Ripasso fisica', g='2026-11-11', ora=[9, 0], fine=[10, 30], cat='cat-studio')),
      ('ogni giorno 7:30 corsa fino al 30/11', dict(titolo='Corsa', ora=[7, 30], rr={'freq': 'D', 'interval': 1, 'until': '2026-11-30'})),
      ('3 dicembre esame fisica', dict(titolo='Esame fisica', g='2026-12-03', tutto=True)),
      ('ogni martedì e giovedì 18-19 inglese', dict(titolo='Inglese', g='2026-11-12', ora=[18, 0], rr={'freq': 'W', 'interval': 1, 'byday': [1, 3]})),
    ]
    for frase, att in c:
        r = I(frase); bad = {k: (r or {}).get(k) for k, v in att.items() if (r or {}).get(k) != v}
        ok(not bad, 'rapido «%s»%s' % (frase, '' if not bad else ' → diverso: %s' % bad))
    # campo rapido nell'interfaccia
    pg.fill('.rapido-box .rapido', 'domani 15-17 Chimica 3.1'); ok('12 novembre' in pg.inner_text('.rapido-anteprima'), 'anteprima: ' + pg.inner_text('.rapido-anteprima'))
    pg.press('.rapido-box .rapido', 'Enter'); pg.wait_for_timeout(200)
    ok(pg.evaluate("Stato.tutti('evento').some(e => e.titolo === 'Chimica 3.1' && e.inizio === '2026-11-12T15:00' && e.fine === '2026-11-12T17:00')"), 'evento creato dal campo rapido')
    pg.screenshot(path='test/30-rapido.png')
    # ICS: esporta e reimporta (andata/ritorno)
    pg.evaluate("Stato.salva({id:'11111111-2222-4333-8444-555555555555',type:'evento',updatedAt:0,titolo:'Palestra, pesi; gambe',inizio:'2026-11-16T09:00',fine:'2026-11-16T10:00',tuttoIlGiorno:false,rrule:{freq:'W',interval:1,byday:[0,3],until:'2026-12-31'},exdate:['2026-11-23'],promemoria:[30],luogo:'Via Roma 1'})")
    ics = pg.evaluate("esportaIcs()").replace("\r\n ", "")
    ok('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TH;UNTIL=20261231T225959Z' in ics and 'EXDATE;TZID=Europe/Rome:20261123T090000' in ics and 'SUMMARY:Palestra\\, pesi\; gambe' in ics, 'esportazione .ics con ricorrenza, eccezione ed escape')
    pg.evaluate("Stato.elimina('11111111-2222-4333-8444-555555555555')")
    n = pg.evaluate("importaIcs(esportaIcs.toString() && %s)" % json.dumps(ics))
    r = pg.evaluate("Stato.prendi('11111111-2222-4333-8444-555555555555') || Stato.rec.get('11111111-2222-4333-8444-555555555555')")
    ok(r and r['titolo'] == 'Palestra, pesi; gambe' and r['rrule']['byday'] == [0, 3] and r['exdate'] == ['2026-11-23'] and r['promemoria'] == [30] and r['inizio'] == '2026-11-16T09:00', 'reimportazione .ics identica: %s' % (r and {k: r[k] for k in ['titolo', 'inizio', 'rrule', 'exdate', 'promemoria']}))
    n2 = pg.evaluate("importaIcs(%s)" % json.dumps(ics)); ok(pg.evaluate("Stato.tutti('evento').filter(e => e.titolo.startsWith('Palestra,')).length") == 1, 'reimportare non duplica')
    gics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:abc@google.com\nDTSTART:20261120T140000Z\nDTEND:20261120T150000Z\nSUMMARY:Da Google\nEND:VEVENT\nBEGIN:VEVENT\nUID:xyz\nDTSTART;VALUE=DATE:20261125\nDTEND;VALUE=DATE:20261126\nSUMMARY:Tutto il giorno\nEND:VEVENT\nEND:VCALENDAR"
    pg.evaluate("importaIcs(%s)" % json.dumps(gics))
    ok(pg.evaluate("(() => { const a = Stato.tutti('evento').find(e => e.titolo === 'Da Google'), b = Stato.tutti('evento').find(e => e.titolo === 'Tutto il giorno'); return a.inizio === '2026-11-20T15:00' && b.tuttoIlGiorno && b.inizio === '2026-11-25T00:00' && b.fine === '2026-11-25T23:59'; })()"), '.ics di Google: ora UTC → Roma, tutto il giorno corretto')
    # Specchio Google Calendar
    pg.evaluate("Drive.login()"); pg.wait_for_function("Drive.pronto")
    pg.evaluate("(() => { const i = imp(); i.gcal = true; Stato.salva(i); })()")
    ok('calendar.app.created' in pg.evaluate("scopeAttuale()"), 'permesso Calendar richiesto solo con lo specchio attivo')
    n = pg.evaluate("GCal.allinea(true)")
    G = pg.evaluate("window.__gc")
    ok(G['cal'] == 'cal1' and n == len(G['ev']) and n >= 4, 'calendario dedicato creato e %d eventi copiati' % n)
    e = G['ev'].get(pg.evaluate("Stato.tutti('evento').find(e => e.titolo === 'Chimica 3.1').id.replace(/-/g,'')"))
    ok(e and e['start']['dateTime'] == '2026-11-12T15:00:00' and e['start']['timeZone'] == 'Europe/Rome' and e['reminders']['overrides'] == [{'method': 'popup', 'minutes': 30}], 'evento con orario e notifica 30 min')
    pg.evaluate("Stato.salva({id:'tt1',type:'task',updatedAt:0,titolo:'Pagare bolletta',priorita:0,fatto:false,scadenza:'2026-11-14T10:00'})")
    pg.evaluate("GCal.allinea()"); ok(pg.evaluate("!!window.__gc.ev['tt1'.padEnd(5,'0')] || Object.values(window.__gc.ev).some(x => x.summary === '☑ Pagare bolletta')"), 'promemoria con ora copiato come evento')
    pg.evaluate("Stato.elimina(Stato.tutti('evento').find(e => e.titolo === 'Chimica 3.1').id)"); pg.evaluate("GCal.allinea()")
    ok(not any(x['summary'] == 'Chimica 3.1' for x in pg.evaluate("Object.values(window.__gc.ev)")), 'evento eliminato anche dallo specchio')
    pg.evaluate("(() => { const i = imp(); i.gcalCategorie = ['cat-salute']; Stato.salva(i); })()"); pg.evaluate("GCal.allinea(true)")
    ok(len(pg.evaluate("window.__gc.ev")) == 0, 'filtro categorie: copiati solo quelli scelti')
    pg.evaluate("(() => { const i = imp(); i.gcalStudio = true; i.gcalStudioOra = '08:30'; i.gcalCategorie = []; Stato.salva(i); })()"); pg.evaluate("GCal.allinea()")
    st = [x for x in pg.evaluate("Object.values(window.__gc.ev)") if x['summary'].startswith(('📚', 'Raffina'))]
    ok(len(st) >= 50 and any(x['summary'] == '📚 Bio 2.2 · Bioenergetica: glicolisi, Krebs, catena respiratoria' and x['start']['dateTime'] == '2026-11-12T08:30:00' for x in st), 'piano di studio copiato con avviso alle 8:30 (%d blocchi)' % len(st))
    pg.evaluate("Studio.sposta('B2.2', '2026-12-01')"); pg.evaluate("GCal.allinea()")
    ok(any(x['summary'].startswith('📚 Bio 2.2') and x['start']['dateTime'].startswith('2026-12-01') for x in pg.evaluate("Object.values(window.__gc.ev)")) and len([x for x in pg.evaluate("Object.values(window.__gc.ev)") if x['summary'].startswith('📚 Bio 2.2')]) == 1, 'step spostato: spostato anche su Google Calendar, senza doppioni')
    pg.evaluate("(() => { const i = imp(); i.gcalStudio = false; Stato.salva(i); })()"); pg.evaluate("GCal.allinea()")
    ok(not any(x['summary'].startswith('📚') for x in pg.evaluate("Object.values(window.__gc.ev)")), 'piano tolto dallo specchio quando lo disattivi')
    # Preset e layout
    pg.click('.tabbar >> text=Altro'); pg.click('.riga-gruppo >> text=Aspetto'); pg.click('.chip >> text=Studio intenso'); pg.wait_for_timeout(200)
    ok(pg.evaluate("[document.documentElement.dataset.tema, document.documentElement.dataset.densita, imp().accento]") == ['scuro', 'compatta', '#e9a23b'], 'preset Studio intenso applicato')
    pg.screenshot(path='test/31-impostazioni.png', full_page=True)
    pg.click('.tabbar >> text=Oggi'); t = pg.locator('.card-titolo').all_inner_texts()
    ok(t[0].upper().startswith('STUDIO'), 'Oggi: primo riquadro = Studio (%s)' % t[:3])
    pg.click('.tabbar >> text=Altro'); pg.click('.riga-gruppo >> text=Aspetto'); pg.click('.chip >> text=Minimal'); pg.wait_for_timeout(200)
    ok(pg.locator('.tabbar button', has_text='Note').count() == 0 and pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()") == '#ffffff', 'Minimal: sezione Note nascosta, sfondo bianco')
    pg.click('.tabbar >> text=Oggi'); pg.screenshot(path='test/32-minimal.png')
    pg.evaluate("(() => { const i = imp(); i.scala = 1.25; i.font = 'serif'; Stato.salva(i); applicaTema(); })()")
    pg.reload(); pg.wait_for_selector('.tabbar')
    ok(pg.evaluate("[getComputedStyle(document.documentElement).getPropertyValue('--scala').trim(), imp().preset]") == ['1.25', 'Minimal'], 'aspetto salvato dopo ricarica')
    b.close()
print('ERRORI:' if err else 'TUTTO OK', *err, sep='\n'); sys.exit(1 if err else 0)
