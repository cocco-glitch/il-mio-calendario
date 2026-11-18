# Test v0.47: router del gateway AI (BP1 §4.4–4.5) — pause dopo 429/5xx, 413, chiave rifiutata, controllo preventivo,
# intestazioni x-ratelimit-*, fornitori nuovi, massimo 2 richieste in volo, stato nelle impostazioni.
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
window.prepara = (chiavi, fn, ritardo) => {
  Object.keys(localStorage).filter(k => /^imc-(ai-keys|groq-chiave|gemini-chiave|modelli-)/.test(k)).forEach(k => localStorage.removeItem(k));
  for (const p in chiavi) IA.impostaChiave(p, chiavi[p]);
  IA.azzera(); window.LOG = []; window.MAXV = 0; let v = 0;
  window.fetch = async (u, o) => { u = String(u); const host = new URL(u).host, chi = host.split('.').slice(-2, -1)[0];
    if (u.endsWith('/models')) {
      const L = { groq: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], googleapis: ['gemini-3.8-flash', 'gemini-3.1-flash-lite'] }[chi];
      return L ? new Response(JSON.stringify({ data: L.map(id => ({ id })) })) : new Response('{}', { status: 500 }); }
    const c = JSON.parse(o.body), ultimo = c.messages[c.messages.length - 1].content;
    LOG.push(chi + ' ' + c.model + ' ' + (typeof ultimo === 'string' ? ultimo.length : 0));
    v++; MAXV = Math.max(MAXV, v); if (ritardo) await new Promise(r => setTimeout(r, ritardo)); v--;
    const x = (fn && fn(chi, c, ultimo)) || {};
    if (x.rete) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(x.body || { choices: [{ message: { content: 'ok ' + c.model + (typeof ultimo === 'string' && ultimo.includes('accorciato') ? ' accorciato' : '') } }] }), { status: x.status || 200, headers: x.headers || {} });
  };
};
window.chiedi = async (testo, ruolo, o) => { try { const r = await IA.testo([{ role: 'user', content: testo }], ruolo || 'genera', o || {}); return r.testo; } catch (e) { return 'ERR ' + e.message; } };
window.pausa = (p, m) => { const s = IA._r.RM[p + ':' + m]; return s ? Math.round((s.finoA - Date.now()) / 1000) : null; };
"""
Q = {'groq': 'gsk_prova1'}
QG = {'groq': 'gsk_prova1', 'gemini': 'AIzaProva'}

with sync_playwright() as p:
    pg = p.chromium.launch().new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.evaluate(PREPARA)
    E = lambda js, arg=None: pg.evaluate(js, arg)

    # --- durate delle intestazioni ---
    d = E("() => ['7.66s', '2m59.56s', '120ms', '30', '1h2m', '', 'boh'].map(IA._r.dur)")
    ok(d == [7660, 179560, 120, 30000, 3720000, 0, 0], 'durate x-ratelimit/retry-after %s' % d)

    # --- 429 con retry-after: pausa del modello, poi riserva; la chiamata dopo salta il modello in pausa ---
    r = E("""async (Q) => { prepara(Q, (h, c) => c.model === 'openai/gpt-oss-120b' ? { status: 429, headers: { 'retry-after': '20' }, body: { error: { message: 'rate' } } } : null);
      const a = await chiedi('ciao'); const p = pausa('groq', 'openai/gpt-oss-120b'); const b = await chiedi('ciao'); return { a, b, p, log: LOG.map(x => x.split(' ')[1]) }; }""", Q)
    ok(r['a'] == 'ok openai/gpt-oss-20b' and r['b'] == r['a'], '429 → risponde il modello seguente')
    ok(19 <= r['p'] <= 20, '429 con retry-after 20 → pausa 20 s (%s)' % r['p'])
    ok(r['log'] == ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'openai/gpt-oss-20b'], 'modello in pausa non riprovato: %s' % r['log'])

    # --- 429 senza intestazioni: quarantena 65 s (v0.51); con reset-tokens: quello ---
    r = E("""async (Q) => { prepara(Q, (h, c) => c.model === 'openai/gpt-oss-120b' ? { status: 429 } : null);
      await chiedi('a'); const p1 = pausa('groq', 'openai/gpt-oss-120b');
      prepara(Q, (h, c) => c.model === 'openai/gpt-oss-120b' ? { status: 429, headers: { 'x-ratelimit-reset-tokens': '7.5s', 'x-ratelimit-reset-requests': '2s' } } : null);
      await chiedi('a'); return [p1, pausa('groq', 'openai/gpt-oss-120b')]; }""", Q)
    ok(64 <= r[0] <= 65 and 7 <= r[1] <= 8, '429: quarantena 65 s; reset-tokens 7.5 s usato %s' % r)

    # --- tutti in pausa: messaggio chiaro, nessuna chiamata ---
    r = E("""async (Q) => { prepara(Q, () => ({ status: 429, headers: { 'retry-after': '120' } }));
      const a = await chiedi('a'); const n = LOG.length; const b = await chiedi('a'); return { a, b, n, n2: LOG.length, st: IA.stato().groq }; }""", Q)
    ok(r['a'].startswith('ERR Limite gratuito'), 'tutti 429 → messaggio limite (%s)' % r['a'])
    ok(r['n2'] == r['n'] and 'in pausa' in r['b'] and 'riprova verso le' in r['b'], 'tutti in pausa → nessuna chiamata, orario di ripresa: %s' % r['b'])
    ok(not r['st']['ok'] and r['st']['finoA'] > 0, 'stato groq: in pausa %s' % r['st'])

    # --- 413: abbassa i token/minuto del modello; la volta dopo il testo va accorciato ---
    r = E("""async (Q) => { prepara(Q, (h, c) => c.model === 'openai/gpt-oss-120b' ? { status: 413 } : null);
      const t = 'x'.repeat(7000), tok = IA._r.stimaTok([{ role: 'user', content: t }]);
      const a = await chiedi(t); return { a, tok, tpm: IA._r.RM['groq:openai/gpt-oss-120b'].tpm }; }""", Q)
    ok(r['a'] == 'ok openai/gpt-oss-20b' and r['tpm'] == int(r['tok'] * 0.9), '413 → tpm abbassato a %s (testo %s token), risponde il seguente' % (r['tpm'], r['tok']))

    # --- 401: chiave segnata non valida, non riprovata finché non cambia ---
    r = E("""async (Q) => { prepara(Q, (h, c, u) => ({ status: 401, body: { error: { message: 'Invalid API Key' } } }));
      const a = await chiedi('a'); const n = LOG.length; const b = await chiedi('a'); const n2 = LOG.length; const st = IA.stato().groq;
      IA.impostaChiave('groq', 'gsk_prova2'); const c = await chiedi('a'); return { a, b, n, n2, st, n3: LOG.length, c }; }""", Q)
    ok(r['a'] == r['b'] == 'ERR Chiave AI non valida: controllala in Altro → Spiegazioni AI.', '401 → chiave non valida')
    ok(r['n'] == 1 and r['n2'] == 1, '401: nessun altro modello né chiamata con la stessa chiave (%s, %s)' % (r['n'], r['n2']))
    ok(r['st'] == {'ok': False, 'motivo': 'chiave non valida'}, 'stato: chiave non valida')
    ok(r['n3'] == 2, 'chiave cambiata → si riprova')

    # --- controllo preventivo: testo grande salta Groq e va a Gemini; solo Groq → accorciato; tronca:false → errore ---
    r = E("""async ([QG, Q]) => { const t = 'parola '.repeat(6000);
      prepara(QG); const a = await chiedi(t, 'veloce'); const la = LOG.slice();
      prepara(Q); const b = await chiedi(t, 'veloce'); const lb = LOG.slice();
      const c = await chiedi(t, 'veloce', { tronca: false });
      return { a, la, b, lb, c, bud: IA._r.budget('groq', 'openai/gpt-oss-20b', 500) }; }""", [QG, Q])
    ok(r['a'] == 'ok gemini-3.1-flash-lite' and len(r['la']) == 1, 'testo grande: Groq saltato senza chiamarlo → Gemini %s' % r['la'])
    lb = int(r['lb'][0].split(' ')[2]) if r['lb'] else 0
    ok(r['b'].endswith('accorciato') and 0 < lb <= r['bud'] * 3.5 + 40, 'solo Groq: testo accorciato al budget (%s car., budget %s token)' % (lb, r['bud']))
    ok(r['c'].startswith('ERR Il testo è troppo lungo'), 'tronca:false → nessun taglio, messaggio chiaro')

    # --- 5xx / rete: fornitore in pausa 30 s, si passa al seguente ---
    r = E("""async (QG) => { prepara(QG, (h) => h === 'groq' ? { status: 503 } : null);
      const a = await chiedi('a', 'veloce'); const la = LOG.slice(); const st = IA.stato().groq;
      prepara(QG, (h) => h === 'groq' ? { rete: true } : null); const b = await chiedi('a', 'veloce');
      return { a, la, st, b, st2: IA.stato().groq }; }""", QG)
    ok(r['a'] == 'ok gemini-3.1-flash-lite' and len(r['la']) == 2, '503 → Groq in pausa (nessun altro modello Groq), risponde Gemini %s' % r['la'])
    ok(r['st']['motivo'] == 'non raggiungibile' and r['st']['finoA'] > 0, 'stato: non raggiungibile')
    ok(r['b'] == 'ok gemini-3.1-flash-lite' and r['st2']['motivo'] == 'non raggiungibile', 'errore di rete → stessa pausa')

    # --- intestazioni: limite token del modello e token rimasti ---
    r = E("""async (Q) => { prepara(Q, () => ({ headers: { 'x-ratelimit-limit-tokens': '30000', 'x-ratelimit-remaining-tokens': '100', 'x-ratelimit-reset-tokens': '30s' } }));
      await chiedi('a'); const s = IA._r.RM['groq:openai/gpt-oss-120b']; const b = await chiedi('a');
      return { tpm: s.tpm, rest: s.rest.tok, b, log: LOG.map(x => x.split(' ')[1]) }; }""", Q)
    ok(r['tpm'] == 30000 and r['rest'] == 100, 'x-ratelimit-limit/remaining-tokens letti')
    ok(r['log'] == ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], 'token rimasti insufficienti → modello saltato fino al reset %s' % r['log'])

    # --- fornitore xkiro: solo chiave xkiro (senza elenco modelli → riserva «vendor/modello»), Bearer su /chat/completions ---
    r = E("""async () => { const H = []; prepara({ xkiro: 'xkProva' }); const f0 = window.fetch;
      window.fetch = (u, o) => { H.push([String(u), (o && o.headers && (o.headers.Authorization || o.headers.authorization)) || '']); return f0(u, o); };
      const a = await chiedi('a'); const ch = IA.tutteChiavi();
      return { a, log: LOG, H: H.filter(x => !x[0].endsWith('/models')), leg: localStorage.getItem('imc-groq-chiave'), ch, f: [IA.formatoOk('cohere', 'qualsiasi'), IA.formatoOk('mistral', 'x')] }; }""")
    ok(r['a'] == 'ok deepseek/deepseek-v4-pro-0813' and r['log'][0].startswith('xkiro '), 'solo chiave xkiro → api.xkiro.com, modello di riserva %s' % r['log'])
    ok(r['H'] and r['H'][0][0] == 'https://api.xkiro.com/v1/chat/completions' and r['H'][0][1] == 'Bearer xkProva', 'xkiro: endpoint OpenAI e Bearer %s' % r['H'][:1])
    ok(r['ch'] == {'xkiro': 'xkProva'} and r['leg'] is None, 'chiave xkiro solo in imc-ai-keys')
    ok(r['f'][0] is True, 'formato chiavi %s' % r['f'])

    # --- al massimo 2 richieste in volo per fornitore ---
    r = E("""async (Q) => { prepara(Q, null, 60); const t = await Promise.all([1, 2, 3, 4, 5].map(i => chiedi('a' + i)));
      return { maxv: MAXV, ok: t.every(x => x.startsWith('ok ')) }; }""", Q)
    ok(r['maxv'] == 2 and r['ok'], 'richieste in volo per fornitore: max %s' % r['maxv'])

    # --- impostazioni: stato fornitori e campi delle chiavi nuove; Drive recupera anche Mistral ---
    r = E("""async () => { prepara({ groq: 'gsk_prova1' }); const t = Spiega.sezione().textContent;
      localStorage.removeItem('imc-groq-chiave'); IA.impostaChiave('xkiro', '');
      Object.defineProperty(Drive, 'pronto', { get: () => true, configurable: true });
      Drive.preparaCartelle = async () => {}; Drive.idCartella = () => 'dati'; Drive.trovaFile = async n => n === 'chiave-ai.json' ? { id: 'k1' } : null;
      Drive.scaricaTesto = async () => JSON.stringify({ groq: 'gsk_g', v: 2, chiavi: { groq: 'gsk_g', mistral: 'mKey', openrouter: 'oKey', xkiro: 'xKey' } });
      const fatto = await Spiega.recuperaDaDrive(); return { t, fatto, x: IA.chiave('xkiro'), ch: Object.keys(IA.tutteChiavi()).sort() }; }""")
    ok(all(x in r['t'] for x in ['Stato dei fornitori', 'Groq: ✅ pronto', 'xkiro: —', 'Requesty', 'Cohere']) and 'OpenRouter' not in r['t'] and 'Mistral' not in r['t'], 'impostazioni: stato e campi fornitori (niente Mistral/OpenRouter)')
    ok(r['fatto'] and r['x'] == 'xKey' and r['ch'] == ['groq', 'xkiro'], 'Drive: recupera xkiro, ignora Mistral/OpenRouter %s' % r['ch'])

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
