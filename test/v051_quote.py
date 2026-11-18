# Test v0.51: quote gratuite (PROVIDER_FREE_QUOTAS, guardia 85%), contatori locali a finestra mobile,
# parseRateLimitInfo senza intestazioni (CORS), 429 con retryDelay Gemini / 65 s / mezzanotte, Strict Privacy,
# xkiro (20 rpm, 500k token/giorno, 1M con Telegram), pulizia dati Mistral/OpenRouter, Requesty 404 → fallback immediato.
import os, http.server, threading, functools
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

PREPARA = """
window.prepara = (chiavi, fn, liste) => {
  Object.keys(localStorage).filter(k => /^imc-(ai-|groq-chiave|gemini-chiave|modelli-)/.test(k)).forEach(k => localStorage.removeItem(k));
  for (const p in chiavi) IA.impostaChiave(p, chiavi[p]);
  IA.azzera(); window.LOG = [];
  const L = Object.assign({ groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], googleapis: ['gemini-3.8-flash', 'gemini-3.1-flash-lite'],
    requesty: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'], cohere: ['command-a-03-2025'] }, liste || {});
  window.fetch = async (u, o) => { u = String(u); const host = new URL(u).host, chi = host.split('.').slice(-2, -1)[0];
    if (u.endsWith('/models')) return L[chi] ? new Response(JSON.stringify({ data: L[chi].map(id => ({ id })) })) : new Response('{}', { status: 500 });
    const c = JSON.parse(o.body); LOG.push(chi + ' ' + c.model);
    const x = (fn && fn(chi, c)) || {};
    return new Response(JSON.stringify(x.body || { choices: [{ message: { content: 'ok ' + c.model } }] }), { status: x.status || 200, headers: x.headers || {} });
  };
};
window.chiedi = async (testo, ruolo) => { try { const r = await IA.testo([{ role: 'user', content: testo }], ruolo || 'genera'); return r.testo; } catch (e) { return 'ERR ' + e.message; } };
window.pausa = (p, m) => { const s = IA._r.RM[p + ':' + m]; return s ? Math.round((s.finoA - Date.now()) / 1000) : null; };
window.uso = () => JSON.parse(localStorage.getItem('imc-ai-uso') || '{}');
"""
G = {'gemini': 'AIzaProva'}

with sync_playwright() as p:
    pg = p.chromium.launch().new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.evaluate(PREPARA)
    E = lambda js, arg=None: pg.evaluate(js, arg)

    # --- tabella delle quote ---
    q = E("""() => { const Q = IA.PROVIDER_FREE_QUOTAS, f = (p, m) => IA._r.quota(p, m).q;
      return { fl: f('gemini', 'gemini-3.1-flash-lite'), fx: f('gemini', 'gemini-3.8-flash'), xk: f('xkiro', 'deepseek/deepseek-v4-pro-0813'), co: f('cohere', 'x'),
        rq: f('requesty', 'x'), g8: f('groq', 'llama-3.1-8b-instant'), g70: f('groq', 'llama-3.3-70b-versatile'), via: Object.keys(Q).filter(k => /mistral|openrouter/.test(k)),
        idG: IA._r.quota('gemini', 'gemini-3.8-flash').id, idX: IA._r.quota('xkiro', 'moonshotai/kimi-k3-agent').id }; }""")
    ok(q['fl'] == {'rpm': 12, 'rpd': 500, 'tpm': 250000} and q['fx'] == {'rpm': 5, 'rpd': 20, 'tpm': 250000}, 'gemini flash-lite 12/250k/500, flash 5/250k/20')
    ok(q['xk'] == {'rpm': 20, 'tpd': 500000}, 'xkiro 20 rpm, 500k token/giorno %s' % q['xk'])
    ok(q['co'] == {'rpm': 20, 'rpd': 33} and q['rq'] == {'rpm': 20, 'rpd': 200}, 'cohere 20/33, requesty 20/200')
    ok(q['via'] == [], 'Mistral e OpenRouter tolti dalle quote')
    ok(q['g8'] == {'rpm': 30, 'rpd': 14400} and q['g70'] == {'rpm': 30, 'rpd': 1000}, 'groq 8b-instant 30/14400, 70b-versatile 30/1000')
    ok(q['idG'] == 'gemini:gemini-3.8-flash' and q['idX'] == 'xkiro', 'contatori per modello (Gemini/Groq) o per account (altri)')
    r = E("""() => { IA.impostaOpzione('xkiroTelegramVerified', true); const a = IA._r.quota('xkiro', 'x').q.tpd;
      IA.impostaOpzione('xkiroTelegramVerified', false); return [a, IA._r.quota('xkiro', 'x').q.tpd, localStorage.getItem('imc-ai-opzioni')]; }""")
    ok(r == [1000000, 500000, None], 'flag xkiroTelegramVerified → 1.000.000 token al giorno %s' % r)
    r = E("() => [IA.PROVS, IA._r.CATENA ? IA._r.CATENA.genera : null]")
    ok(r[0].index('xkiro') == r[0].index('gemini') + 1 and r[0].index('groq') < r[0].index('xkiro'), 'xkiro subito dopo Gemini e Groq %s' % r)

    # --- Gemini di base su flash-lite; contatori rpm60s / rpdToday / tpm60s salvati ---
    r = E("""async (G) => { prepara(G); const a = await chiedi('ciao'); const c = IA._r.contatori('gemini:gemini-3.1-flash-lite');
      return { a, c, u: Object.keys(uso()) }; }""", G)
    ok(r['a'] == 'ok gemini-3.1-flash-lite', 'Gemini genera parte da flash-lite (%s)' % r['a'])
    ok(r['c']['rpm60s'] == 1 and r['c']['rpdToday'] == 1 and r['c']['tpm60s'] > 0, 'contatori dopo una richiesta %s' % r['c'])
    ok(r['u'] == ['gemini:gemini-3.1-flash-lite'], 'contatori salvati in imc-ai-uso %s' % r['u'])

    # --- guardia 85%: flash-lite a 10/12 al minuto → si passa a flash; finestra di 60 s ---
    r = E("""async (G) => { prepara(G); const t = Date.now();
      localStorage.setItem('imc-ai-uso', JSON.stringify({ 'gemini:gemini-3.1-flash-lite': { g: (d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate())(new Date()), n: 10, w: Array.from({ length: 10 }, () => [t, 10]) } }));
      const a = await chiedi('ciao'); const v = uso(); v['gemini:gemini-3.1-flash-lite'].w = v['gemini:gemini-3.1-flash-lite'].w.map(x => [x[0] - 61000, x[1]]);
      localStorage.setItem('imc-ai-uso', JSON.stringify(v)); const b = await chiedi('ciao'); return { a, b }; }""", G)
    ok(r['a'] == 'ok gemini-3.8-flash', '10/12 al minuto (>85%%) → flash-lite saltato, risponde flash (%s)' % r['a'])
    ok(r['b'] == 'ok gemini-3.1-flash-lite', 'dopo 60 s la finestra si svuota → di nuovo flash-lite (%s)' % r['b'])
    # quota giornaliera: 17/20 su flash e 425/500 su flash-lite → oltre la guardia, ma senza alternative si usa il resto
    r = E("""async (G) => { prepara(G); const g = (d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate())(new Date());
      localStorage.setItem('imc-ai-uso', JSON.stringify({ 'gemini:gemini-3.1-flash-lite': { g, n: 425, w: [] }, 'gemini:gemini-3.8-flash': { g, n: 20, w: [] } }));
      const a = await chiedi('ciao'); const n = LOG.length; return { a, n, piena: IA._r.quotaPiena('gemini', 'gemini-3.8-flash', 0, 1) }; }""", G)
    ok(r['a'] == 'ok gemini-3.1-flash-lite' and r['n'] == 1, "oltre l'85%% e nessun altro: si usa il 15%% tenuto da parte (%s)" % r['a'])
    ok(r['piena'], 'flash a 20/20: limite vero, mai chiamato')

    # --- parseRateLimitInfo: intestazioni assenti (CORS) → undefined, presenti → lette ---
    r = E("""() => { const a = IA.parseRateLimitInfo(new Response('{}'));
      const b = IA.parseRateLimitInfo(new Response('{}', { headers: { 'x-ratelimit-remaining-requests': '0', 'x-ratelimit-remaining-tokens': '900', 'x-ratelimit-reset-requests': '2m30s', 'retry-after': '12' } }));
      return { a: Object.values(a).filter(x => x !== undefined).length, b }; }""")
    ok(r['a'] == 0, 'nessuna intestazione esposta → nessun valore inventato')
    ok(r['b']['remainingRequests'] == 0 and r['b']['remainingTokens'] == 900 and r['b']['resetRequests'] == 150000 and r['b']['retryAfter'] == 12000, 'intestazioni lette %s' % r['b'])

    # --- 429: retryDelay nel corpo Gemini; senza nulla 65 s; con la quota del giorno quasi finita → mezzanotte ---
    r = E("""async (G) => { prepara(G, (h, c) => c.model === 'gemini-3.1-flash-lite' ? { status: 429, body: [{ error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }] } }] } : null);
      const a = await chiedi('ciao'); const p1 = pausa('gemini', 'gemini-3.1-flash-lite'), q1 = uso()['gemini:gemini-3.1-flash-lite'];
      prepara(G, (h, c) => c.model === 'gemini-3.1-flash-lite' ? { status: 429 } : null);
      await chiedi('ciao'); const p2 = pausa('gemini', 'gemini-3.1-flash-lite');
      prepara(G, () => ({ status: 429 }));
      const g = (d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate())(new Date());
      localStorage.setItem('imc-ai-uso', JSON.stringify({ 'gemini:gemini-3.1-flash-lite': { g, n: 425, w: [] } }));
      await chiedi('ciao'); const s = IA._r.RM['gemini:gemini-3.1-flash-lite'], m = new Date(); m.setHours(24, 0, 0, 0);
      const n = LOG.length; const b = await chiedi('ciao');
      return { a, p1, q1: Math.round((q1.q - Date.now()) / 1000), n1: q1.n, p2, mezz: s.finoA === m.getTime() && uso()['gemini:gemini-3.1-flash-lite'].q === m.getTime(),
        salta: LOG.length === n && b.includes('in pausa') }; }""", G)
    ok(r['a'] == 'ok gemini-3.8-flash' and 36 <= r['p1'] <= 37 and 36 <= r['q1'] <= 37, '429 Gemini: retryDelay 37s dal corpo, quarantena salvata (%s, %s)' % (r['p1'], r['q1']))
    ok(r['n1'] == 0, 'il 429 non conta nella quota giornaliera')
    ok(64 <= r['p2'] <= 65, '429 senza retry-after né corpo → 65 s (%s)' % r['p2'])
    ok(r['mezz'], '429 con quota del giorno ≥ 85% → quarantena fino a mezzanotte')
    ok(r['salta'], 'modello in quarantena non richiamato')

    # --- xkiro: guardia 85% sui token del giorno; con Telegram il tetto sale a 1M ---
    r = E("""async () => { const g = (d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate())(new Date());
      prepara({ xkiro: 'xkKey', cohere: 'coKey' }); const a = await chiedi('ciao'); const t1 = (uso().xkiro || {}).t || 0;
      localStorage.setItem('imc-ai-uso', JSON.stringify({ xkiro: { g, n: 5, w: [], t: 430000 } }));
      const piena = IA._r.quotaPiena('xkiro', 'x', 0, 0.85); const b = await chiedi('ciao');
      IA.impostaOpzione('xkiroTelegramVerified', true); const piena2 = IA._r.quotaPiena('xkiro', 'x', 0, 0.85); const c = await chiedi('ciao');
      IA.impostaOpzione('xkiroTelegramVerified', false); return { a, t1, piena, b, piena2, c }; }""")
    ok(r['a'] == 'ok deepseek/deepseek-v4-pro-0813' and r['t1'] > 0, 'xkiro risponde e conta i token del giorno (%s, %s)' % (r['a'], r['t1']))
    ok(r['piena'] and r['b'] == 'ok command-a-03-2025', '430k/500k token (>85%%) → xkiro saltato, risponde Cohere (%s)' % r['b'])
    ok(not r['piena2'] and r['c'].startswith('ok ') and '/' in r['c'], 'con Telegram 430k/1M → di nuovo xkiro (%s)' % r['c'])

    # --- dati vecchi Mistral/OpenRouter: ignorati in silenzio e ripuliti ---
    r = E("""() => { localStorage.setItem('imc-ai-opzioni', JSON.stringify({ openrouterHasCredits10Usd: true, xkiroTelegramVerified: true }));
      localStorage.setItem('imc-ai-keys', JSON.stringify({ v: 2, chiavi: { mistral: 'mKey', openrouter: 'oKey', groq: 'gsk_x' } })); localStorage.setItem('imc-groq-chiave', 'gsk_x');
      const o = IA.opzioni(), ch = Object.keys(IA.tutteChiavi()), k = JSON.parse(localStorage.getItem('imc-ai-keys')).chiavi;
      IA.impostaChiave('mistral', 'nuova'); const t = IA.campoAltri().textContent; const st = Object.keys(IA.stato());
      IA.impostaOpzione('xkiroTelegramVerified', false); IA.impostaChiave('groq', '');
      return { o, ch, k: Object.keys(k), dopo: IA.chiave('mistral'), t, st }; }""")
    ok(r['o'] == {'xkiroTelegramVerified': True}, 'opzione OpenRouter vecchia ignorata %s' % r['o'])
    ok(r['ch'] == ['groq'] and r['k'] == ['groq'] and not r['dopo'], 'chiavi Mistral/OpenRouter ignorate e tolte da imc-ai-keys %s %s' % (r['ch'], r['k']))
    ok('xkiro' in r['t'] and 'Telegram' in r['t'] and 'Mistral' not in r['t'] and 'OpenRouter' not in r['t'] and 'Strict Privacy' not in r['t'], 'impostazioni: spunta Telegram, niente Mistral/OpenRouter')
    ok('mistral' not in r['st'] and 'openrouter' not in r['st'], 'stato fornitori senza Mistral/OpenRouter %s' % r['st'])

    # --- Requesty: 404 / modello scaduto → subito il seguente, senza riprovare ---
    r = E("""async () => { prepara({ requesty: 'rqKey' }, (h, c) => c.model === 'google/gemini-2.5-flash' ? { status: 404, body: { error: { message: 'model not found' } } } : null);
      const a = await chiedi('ciao'); const la = LOG.slice(); const b = await chiedi('ciao'); const nb = LOG.length;
      prepara({ requesty: 'rqKey' }, (h, c) => c.model === 'google/gemini-2.5-flash' ? { status: 400, body: { error: { message: 'Model has expired' } } } : { body: { choices: [{ message: { content: '{"ok":true}' } }] } });
      let d; try { d = (await IA.chiedi([{ role: 'user', content: 'json' }], 'genera')).modello; } catch (e) { d = 'ERR ' + e.message; }
      return { a, la, b, nb, lb: LOG.slice(), d }; }""")
    ok(r['a'] == 'ok openai/gpt-4o-mini' and r['la'] == ['requesty google/gemini-2.5-flash', 'requesty openai/gpt-4o-mini'], 'Requesty 404 → seguente %s' % r['la'])
    ok(r['b'] == 'ok openai/gpt-4o-mini' and r['nb'] == 3, 'modello sparito poi saltato (%s chiamate)' % r['nb'])
    ok(r['lb'] == ['requesty google/gemini-2.5-flash', 'requesty openai/gpt-4o-mini'] and r['d'] == 'openai/gpt-4o-mini', '400 «expired» in JSON: nessuna riprova senza response_format %s' % r['lb'])

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)), *err, sep='\n')
raise SystemExit(1 if err else 0)
