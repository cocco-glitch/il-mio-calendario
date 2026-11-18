# Test v0.49: schemaVersion nell'involucro di dati.json (sola lettura se più nuovo) + upload con ricontrollo (BP1 §5.2).
import os, sys, http.server, threading, functools, json
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
# Finto Drive (come test/sync.py) con `version` che cresce a ogni scrittura e un gancio sulle letture dei metadati.
FINTO = r"""
(() => {
  const S = window.__drive = { files: {}, next: 1, log: [], hook: null };
  window.google = { accounts: { oauth2: {
    initTokenClient: (o) => ({ requestAccessToken(p) { setTimeout(() => this.callback({ access_token: 'tok', expires_in: 3600 }), 0); } }),
    revoke: (t, cb) => cb && cb(),
  } } };
  const risp = (obj, ct = 'application/json') => new Response(typeof obj === 'string' ? obj : JSON.stringify(obj), { status: 200, headers: { 'content-type': ct } });
  let orologio = Date.parse('2026-11-18T10:00:00Z');
  S.tocca = (f, body) => { f.body = body; f.version = (f.version || 0) + 1; f.modifiedTime = new Date(orologio += 1000).toISOString(); };
  window.fetch = async (url, opz = {}) => {
    const u = new URL(url); S.log.push((opz.method || 'GET') + ' ' + u.pathname + u.search);
    if (u.pathname.endsWith('/userinfo')) return risp({ email: 'cocco.haloa@gmail.com' });
    const m = u.pathname.match(/\/files\/?([^/]*)$/);
    const id = m && m[1];
    if (u.pathname.startsWith('/upload/')) {
      const fd = opz.body; const meta = JSON.parse(await fd.get('metadata').text()); const file = fd.get('file');
      const fid = id || ('f' + S.next++);
      S.files[fid] = { ...(S.files[fid] || {}), id: fid, name: meta.name, parents: meta.parents || (S.files[fid] || {}).parents, mimeType: file.type };
      S.tocca(S.files[fid], await file.text());
      return risp({ id: fid, name: meta.name });
    }
    if (!id) {
      if (opz.method === 'POST') { const b = JSON.parse(opz.body); const fid = 'd' + S.next++; S.files[fid] = { id: fid, ...b }; return risp({ id: fid }); }
      const q = u.searchParams.get('q') || '';
      const nome = (q.match(/name = '([^']+)'/) || [])[1]; const parent = (q.match(/'([^']+)' in parents/) || [])[1];
      const contiene = (q.match(/name contains '([^']+)'/) || [])[1];
      const cart = q.includes("mimeType = 'application/vnd.google-apps.folder'");
      return risp({ files: Object.values(S.files).filter(f => (!nome || f.name === nome) && (!parent || (f.parents || []).includes(parent)) && (!cart || f.mimeType === 'application/vnd.google-apps.folder') && (!contiene || f.name.includes(contiene))) });
    }
    if (u.searchParams.get('alt') === 'media') { const f = S.files[id]; return f ? risp(f.body) : new Response('nf', { status: 404 }); }
    if (opz.method === 'PATCH') { const f = S.files[id]; const add = u.searchParams.get('addParents'), rem = u.searchParams.get('removeParents'); if (add) f.parents = (f.parents || []).filter(p => p !== rem).concat([add]); return risp({ id }); }
    if ((u.searchParams.get('fields') || '').includes('version') && S.hook) S.hook(S.files[id]);
    const f = S.files[id]; return risp({ id, version: String(f.version || 0), modifiedTime: f.modifiedTime });
  };
})();
"""
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='it-IT', timezone_id='Europe/Rome')
    pg = ctx.new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    ctx.route('**/accounts.google.com/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body='//'))
    ctx.route('**/apis.google.com/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body='//'))
    pg.add_init_script(FINTO)
    pg.goto(URL); pg.wait_for_selector('.tabbar')
    pg.evaluate("Stato.salva({id:'t0',type:'task',updatedAt:0,titolo:'primo',priorita:0,fatto:false})")
    pg.evaluate("new Promise(r => setTimeout(() => { Drive.login(); r(); }, 300))")
    pg.wait_for_function("Drive.stato.sync === 'ok'", timeout=10000)
    J = "(() => { const f = Object.values(window.__drive.files).find(f => f.name === 'dati.json'); return f; })()"
    f = pg.evaluate(J); corpo = json.loads(f['body'])
    ok(corpo.get('versione') == 1 and corpo.get('schemaVersion') == 2 and corpo.get('formato') == 'il-mio-calendario', 'involucro: versione 1 + schemaVersion 2')
    fid = f['id']
    conta = lambda: pg.evaluate("id => { const L = window.__drive.log; return { giu: L.filter(l => l.includes('/files/' + id + '?alt=media')).length, su: L.filter(l => l.startsWith('PATCH /upload') && l.includes('/files/' + id)).length }; }", fid)
    sincr = "async () => { window.__drive.log = []; await Drive.sincronizza(false); }"

    # --- file 0.48 (senza schemaVersion) → letto e riscritto normalmente ---
    pg.evaluate("""() => { const f = Object.values(window.__drive.files).find(f => f.name === 'dati.json'); const j = JSON.parse(f.body); delete j.schemaVersion;
      j.records.push({ id: 'vecchio', type: 'task', updatedAt: 5, titolo: 'da 0.48', priorita: 0, fatto: false }); window.__drive.tocca(f, JSON.stringify(j)); }""")
    pg.evaluate("Stato.salva({id:'t1',type:'task',updatedAt:0,titolo:'mio',priorita:0,fatto:false})")
    pg.evaluate(sincr)
    c = conta(); corpo = json.loads(pg.evaluate(J)['body'])
    ok(pg.evaluate("!!Stato.prendi('vecchio')") and c['su'] == 1 and corpo.get('schemaVersion') == 2, 'file 0.48 senza schemaVersion: letto e riscritto (%s)' % c)

    # --- corsa: un altro dispositivo scrive tra il mio download e il mio upload ---
    pg.evaluate("""() => { const S = window.__drive; let n = 0;
      S.hook = (f) => { if (++n === 2) { const j = JSON.parse(f.body); j.records.push({ id: 'altro', type: 'task', updatedAt: Date.now(), titolo: 'dall\\'altro', priorita: 0, fatto: false }); S.tocca(f, JSON.stringify(j)); } }; }""")
    pg.evaluate("Stato.salva({id:'t2',type:'task',updatedAt:0,titolo:'mio 2',priorita:0,fatto:false})")
    pg.evaluate(sincr)
    c = conta(); ids = {r['id'] for r in json.loads(pg.evaluate(J)['body'])['records']}
    ok(c['giu'] == 2 and c['su'] == 1, 'file cambiato prima dell\'upload: riscaricato e riunito (%s)' % c)
    ok({'altro', 't2', 't1'} <= ids and pg.evaluate("!!Stato.prendi('altro')"), 'nessuna scrittura persa: su Drive sia «altro» sia i miei')
    ok(pg.evaluate("Drive.stato.sync") == 'ok', 'sync ok dopo la corsa')

    # --- file che cambia sempre: max 3 giri di ricontrollo, poi carica comunque ---
    pg.evaluate("""() => { const S = window.__drive; let n = 0;
      S.hook = (f) => { if (++n % 2 === 0) { const j = JSON.parse(f.body); j.records.push({ id: 'x' + n, type: 'task', updatedAt: Date.now(), titolo: 'x', priorita: 0, fatto: false }); S.tocca(f, JSON.stringify(j)); } }; }""")
    pg.evaluate("Stato.salva({id:'t3',type:'task',updatedAt:0,titolo:'mio 3',priorita:0,fatto:false})")
    pg.evaluate(sincr)
    c = conta(); ids = {r['id'] for r in json.loads(pg.evaluate(J)['body'])['records']}
    ok(c['giu'] == 4 and c['su'] == 1 and 't3' in ids, 'al massimo 3 riscaricamenti, poi un solo upload (%s)' % c)
    pg.evaluate("() => { window.__drive.hook = null; }")

    # --- niente da spedire: nessun upload ---
    pg.evaluate(sincr); c = conta()
    ok(c['su'] == 0 and c['giu'] == 1, 'senza modifiche locali non carica nulla (%s)' % c)

    # --- schemaVersion remoto 3 → sola lettura ---
    pg.evaluate("""() => { const f = Object.values(window.__drive.files).find(f => f.name === 'dati.json'); const j = JSON.parse(f.body); j.schemaVersion = 3;
      j.records.push({ id: 'futuro', type: 'task', updatedAt: Date.now(), titolo: 'dal futuro', priorita: 0, fatto: false }); window.__drive.tocca(f, JSON.stringify(j)); }""")
    prima = pg.evaluate(J)['body']
    pg.evaluate("Stato.salva({id:'t4',type:'task',updatedAt:0,titolo:'mio 4',priorita:0,fatto:false})")
    pg.evaluate(sincr)
    c = conta()
    ok(c['su'] == 0 and pg.evaluate(J)['body'] == prima, 'schemaVersion 3 su Drive: nessun upload, file intatto (%s)' % c)
    ok(pg.evaluate("!!Stato.prendi('futuro') && !!Stato.prendi('t4')"), 'i dati remoti si leggono comunque; le modifiche locali restano qui')
    ok(pg.evaluate("Drive.stato.sync") == 'errore' and "Aggiorna l'app" in pg.evaluate("Drive.stato.messaggio"), 'stato: «Aggiorna l\'app»')
    ok(pg.locator('#avvisi .avviso', has_text="Aggiorna l'app").count() == 1, 'banner «Aggiorna l\'app»')
    pg.evaluate(sincr)
    ok(pg.locator('#avvisi .avviso', has_text="Aggiorna l'app").count() == 1 and conta()['su'] == 0, 'banner non ripetuto, ancora nessun upload')
    ok(pg.evaluate("Stato.esporta().length") > 0 and not any(l.startswith('DELETE') for l in pg.evaluate("window.__drive.log")), 'nessuna DELETE verso Drive')
    b.close()
print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)), *err, sep='\n'); sys.exit(1 if err else 0)
