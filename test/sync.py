# Test della sincronizzazione con un finto Google Drive (fetch e GIS simulati).
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
(() => {
  // Finto Drive in memoria, condiviso tra "dispositivi" tramite window.name? No: lo passa il test.
  const S = window.__drive = window.__drive || { files: {}, next: 1, log: [] };
  window.google = { accounts: { oauth2: {
    initTokenClient: (o) => ({ requestAccessToken(p) { setTimeout(() => this.callback({ access_token: 'tok', expires_in: 3600 }), 0); } }),
    revoke: (t, cb) => cb && cb(),
  } } };
  const risp = (obj, ct = 'application/json') => new Response(typeof obj === 'string' ? obj : JSON.stringify(obj), { status: 200, headers: { 'content-type': ct } });
  window.fetch = async (url, opz = {}) => {
    const u = new URL(url); S.log.push((opz.method || 'GET') + ' ' + u.pathname + u.search);
    if (u.pathname.endsWith('/userinfo')) return risp({ email: 'cocco.haloa@gmail.com' });
    const m = u.pathname.match(/\/files\/?([^/]*)$/);
    const id = m && m[1];
    if (u.pathname.startsWith('/upload/')) {
      const fd = opz.body; const meta = JSON.parse(await fd.get('metadata').text()); const file = fd.get('file');
      const testo = await file.text();
      const fid = id || ('f' + S.next++);
      S.files[fid] = { ...(S.files[fid] || {}), id: fid, name: meta.name, parents: meta.parents || (S.files[fid] || {}).parents, body: testo, mimeType: file.type, modifiedTime: new Date().toISOString() };
      return risp({ id: fid, name: meta.name });
    }
    if (!id) {
      if (opz.method === 'POST') { const b = JSON.parse(opz.body); const fid = 'd' + S.next++; S.files[fid] = { id: fid, ...b, modifiedTime: new Date().toISOString() }; return risp({ id: fid }); }
      const q = u.searchParams.get('q') || '';
      const nome = (q.match(/name = '([^']+)'/) || [])[1]; const parent = (q.match(/'([^']+)' in parents/) || [])[1];
      const contiene = (q.match(/name contains '([^']+)'/) || [])[1];
      const cart = q.includes("mimeType = 'application/vnd.google-apps.folder'");
      const files = Object.values(S.files).filter(f => !f.trashed && (!nome || f.name === nome) && (!parent || (f.parents || []).includes(parent)) && (!cart || f.mimeType === 'application/vnd.google-apps.folder') && (!contiene || f.name.includes(contiene)));
      return risp({ files });
    }
    if (u.searchParams.get('alt') === 'media') { const f = S.files[id]; return f ? risp(f.body, 'application/json') : new Response('nf', { status: 404 }); }
    if (opz.method === 'PATCH') { const f = S.files[id]; const add = u.searchParams.get('addParents'), rem = u.searchParams.get('removeParents'); if (add) f.parents = (f.parents || []).filter(p => p !== rem).concat([add]); return risp({ id }); }
    return risp({ id, ...S.files[id] });
  };
})();
"""
with sync_playwright() as p:
    b = p.chromium.launch()
    stato_drive = {'files': {}, 'next': 1, 'log': []}
    def dispositivo(nome):
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, locale='it-IT', timezone_id='Europe/Rome')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: err.append(nome + ' pageerror: ' + str(e)))
        ctx.route('**/accounts.google.com/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body='// finto'))
        ctx.route('**/apis.google.com/**', lambda r: r.fulfill(status=200, content_type='application/javascript', body='// finto'))
        pg.add_init_script('window.__drive = ' + json.dumps(stato_drive) + ';' + FINTO)
        pg.goto(URL); pg.wait_for_selector('.tabbar')
        return pg
    def salva_drive(pg):
        stato_drive.update(pg.evaluate('window.__drive'))

    # iPhone: login e primo sync
    a = dispositivo('A')
    a.evaluate("Stato.salva({id:'ev1',type:'evento',updatedAt:0,titolo:'Chimica 3.1',inizio:'2026-11-12T15:00',fine:'2026-11-12T17:00',tuttoIlGiorno:false,promemoria:[30]})")
    a.evaluate("new Promise(r => setTimeout(() => { Drive.login(); r(); }, 300))")
    try: a.wait_for_function("Drive.stato.sync === 'ok'", timeout=10000)
    except Exception: print('STATO', a.evaluate("[Drive.stato.sync, Drive.stato.messaggio, window.__drive.log]")); raise
    salva_drive(a)
    nomi = sorted(f['name'] for f in stato_drive['files'].values())
    ok('Calendario personale' in nomi and all(n in nomi for n in ['dati','allegati','backup','studio','_cestino app']), 'cartelle create: %s' % nomi)
    dati = [f for f in stato_drive['files'].values() if f['name']=='dati.json']
    ok(len(dati)==1 and 'Chimica 3.1' in dati[0]['body'], 'dati.json caricato con l\'evento')
    ok(a.locator('.sync-ind .sync-ok').count()==1, 'indicatore verde')

    # PC: stesso account, dati identici
    pc = dispositivo('PC'); pc.evaluate("new Promise(r => setTimeout(() => { Drive.login(); r(); }, 300))")
    try: pc.wait_for_function("Drive.stato.sync === 'ok'", timeout=10000)
    except Exception: print('STATO', pc.evaluate("[Drive.stato.sync, Drive.stato.messaggio, window.__drive.log]")); raise
    ok(pc.evaluate("Stato.prendi('ev1')?.titolo") == 'Chimica 3.1', 'il PC riceve l\'evento dal Drive')
    # PC modifica, iPhone elimina un altro: merge
    pc.evaluate("const e=Stato.prendi('ev1'); e.titolo='Chimica 3.1 bis'; Stato.salva(e); Stato.salva({id:'t1',type:'task',updatedAt:0,titolo:'Dal PC',priorita:0,fatto:false})")
    pc.wait_for_function("Drive.stato.sync === 'ok' && Drive.stato.messaggio === '' && window.__drive.log.filter(l=>l.startsWith('PATCH /upload')).length >= 1", timeout=10000)
    salva_drive(pc)
    a2 = dispositivo('A2')  # iPhone riaperto (nuovo contesto = memoria vuota, simula altro dispositivo)
    a2.evaluate("Stato.salva({id:'t2',type:'task',updatedAt:0,titolo:'Offline su iPhone',priorita:0,fatto:false})")
    a2.evaluate("new Promise(r => setTimeout(() => { Drive.login(); r(); }, 300))"); a2.wait_for_function("Drive.stato.sync === 'ok'", timeout=10000)
    ok(a2.evaluate("Stato.prendi('ev1')?.titolo") == 'Chimica 3.1 bis', 'modifica del PC arrivata')
    ok(a2.evaluate("!!Stato.prendi('t1') && !!Stato.prendi('t2')"), 'unione: record di entrambi presenti')
    a2.wait_for_timeout(500); salva_drive(a2)
    corpo = json.loads([f for f in stato_drive['files'].values() if f['name']=='dati.json'][0]['body'])
    ids = {r['id'] for r in corpo['records']}
    ok({'ev1','t1','t2'} <= ids, 'dati.json su Drive contiene tutto')
    # eliminazione = lapide che si propaga
    a2.evaluate("Stato.elimina('t1')"); a2.wait_for_timeout(3500); a2.wait_for_function("Drive.stato.sync === 'ok'", timeout=10000); salva_drive(a2)
    pc2 = dispositivo('PC2'); pc2.evaluate("new Promise(r => setTimeout(() => { Drive.login(); r(); }, 300))"); pc2.wait_for_function("Drive.stato.sync === 'ok'", timeout=10000)
    ok(pc2.evaluate("Stato.prendi('t1')") is None and pc2.evaluate("Stato.rec.get('t1')?.deleted") is True, 'eliminazione propagata come lapide')
    # backup giornaliero: 1 file, non di più nello stesso giorno
    bk = [f for f in stato_drive['files'].values() if f['name'].startswith('dati-20')]
    ok(len(bk) == 1, 'backup giornaliero creato una volta (%d)' % len(bk))
    ok(not any(l.startswith('DELETE') for l in stato_drive['log']), 'nessuna DELETE verso Drive')
    # offline: coda
    off = dispositivo('OFF'); off.evaluate("new Promise(r => setTimeout(() => { Drive.login(); r(); }, 300))"); off.wait_for_function("Drive.stato.sync === 'ok'", timeout=10000)
    off.context.set_offline(True)
    off.evaluate("Stato.salva({id:'t9',type:'task',updatedAt:0,titolo:'offline',priorita:0,fatto:false})"); off.wait_for_timeout(3500)
    ok(off.evaluate("Drive.stato.sync") == 'offline', 'stato offline mostrato')
    off.context.set_offline(False); off.wait_for_function("Drive.stato.sync === 'ok'", timeout=10000)
    ok(any('t9' in f['body'] for f in off.evaluate('window.__drive').get('files').values() if f['name']=='dati.json'), 'coda offline spedita al ritorno della rete')
    off.screenshot(path='test/11-drive.png'); off.click('.tabbar >> text=Altro'); off.screenshot(path='test/12-altro-drive.png')
    b.close()
print('ERRORI:' if err else 'TUTTO OK', *err, sep='\n'); sys.exit(1 if err else 0)
