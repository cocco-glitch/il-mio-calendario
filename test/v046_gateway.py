# Test v0.46: gateway AI unico (BP1 §4.1–4.3) — invariante 1, chiavi imc-ai-keys + migrazione, discovery per pattern.
import os, re, glob, http.server, threading, functools
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

# Invariante 1: nessun dominio di fornitore AI fuori da 07-ia.ts
DOM = re.compile(r'api\.groq\.com|generativelanguage|api\.xkiro|cohere\.ai|requesty')
fuori = [os.path.basename(f) for f in glob.glob(os.path.join(QUI, '..', 'src', '*.ts')) if not f.endswith('07-ia.ts') and DOM.search(open(f, encoding='utf-8').read())]
ok(not fuori, 'invariante 1: domini dei fornitori solo in 07-ia.ts %s' % (fuori or ''))

with sync_playwright() as p:
    pg = p.chromium.launch().new_page(); pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar')

    # --- chiavi: migrazione una tantum, idempotente, vecchie voci conservate ---
    r = pg.evaluate("""() => { ['imc-ai-keys','imc-groq-chiave','imc-gemini-chiave'].forEach(k => localStorage.removeItem(k));
      const vuoto = (IA.chiave('groq'), localStorage.getItem('imc-ai-keys'));
      localStorage.setItem('imc-groq-chiave', 'gsk_vecchia'); localStorage.setItem('imc-gemini-chiave', 'AIzaVecchia');
      const g = IA.chiave('groq'), a1 = localStorage.getItem('imc-ai-keys'); IA.chiave('gemini'); const a2 = localStorage.getItem('imc-ai-keys');
      return { vuoto, g, a: JSON.parse(a1), stessa: a1 === a2, vecchie: [localStorage.getItem('imc-groq-chiave'), localStorage.getItem('imc-gemini-chiave')] }; }""")
    ok(r['vuoto'] is None, 'senza chiavi non crea imc-ai-keys')
    ok(r['g'] == 'gsk_vecchia' and r['a'] == {'v': 2, 'chiavi': {'groq': 'gsk_vecchia', 'gemini': 'AIzaVecchia'}}, 'migrazione: imc-ai-keys creato dalle vecchie chiavi %s' % r['a'])
    ok(r['stessa'], 'migrazione idempotente')
    ok(r['vecchie'] == ['gsk_vecchia', 'AIzaVecchia'], 'vecchie chiavi NON cancellate (rollback a 0.44)')
    r = pg.evaluate("""() => { IA.impostaChiave('groq', ' gsk_nuova '); const a = JSON.parse(localStorage.getItem('imc-ai-keys'));
      const leg = localStorage.getItem('imc-groq-chiave'); IA.impostaChiave('gemini', ''); const b = JSON.parse(localStorage.getItem('imc-ai-keys'));
      return { a, leg, b, gem: IA.gemini, legG: localStorage.getItem('imc-gemini-chiave'), fmt: [IA.formatoOk('groq','gsk_x'), IA.formatoOk('groq','abc'), IA.formatoOk('gemini','AQ.x'), IA.formatoOk('gemini','xyz')] }; }""")
    ok(r['a']['chiavi']['groq'] == 'gsk_nuova' and r['leg'] == 'gsk_nuova', 'nuova chiave scritta in imc-ai-keys e nella vecchia voce')
    ok('gemini' not in r['b']['chiavi'] and not r['gem'] and r['legG'] is None, 'chiave rimossa ovunque')
    ok(r['fmt'] == [True, False, True, False], 'controllo formato chiavi %s' % r['fmt'])

    # --- discovery per pattern ---
    S = lambda prov, ruolo, lista: pg.evaluate("([p, r, l]) => IA.scegli(p, r, l)", [prov, ruolo, lista])
    GEM = ['gemini-3-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-3.9-flash-preview', 'gemini-4-hydrogen', 'gemini-3.8-flash-image', 'text-embedding-004']
    ok(S('gemini', 'genera', GEM) == ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3-flash'], 'gemini genera (v0.51): flash-lite prima, poi flash per versione, niente preview/image: %s' % S('gemini', 'genera', GEM))
    ok(S('gemini', 'veloce', GEM)[0] == 'gemini-3.1-flash-lite', 'gemini veloce: flash-lite prima')
    ok(S('gemini', 'revisiona', GEM)[0] == 'gemini-4-hydrogen', 'gemini revisiona: hydrogen prima')
    GQ = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'openai/gpt-oss-safeguard-20b', 'qwen/qwen3-32b', 'qwen/qwen3.8-27b', 'whisper-large-v3-turbo', 'llama-3.3-70b-versatile']
    ok(S('groq', 'veloce', GQ) == ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'], 'groq veloce: 20b poi 120b, niente safeguard: %s' % S('groq', 'veloce', GQ))
    ok(S('groq', 'visione', GQ) == ['qwen/qwen3.8-27b'], 'groq visione: solo il qwen visivo (non qwen3-32b): %s' % S('groq', 'visione', GQ))
    ok(S('groq', 'visione', ['qwen/qwen3.9-30b-preview']) == ['qwen/qwen3.9-30b-preview'], 'groq visione accetta la preview (unico modello)')
    ok(S('groq', 'genera', None) == ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] and S('groq', 'genera', []) == S('groq', 'genera', None), 'senza elenco modelli: riserva')
    ok(S('groq', 'lungo', GQ) == [], 'ruolo non previsto per il fornitore → nessun modello')

    # --- tutto passa dal gateway: chat JSON, spiegazioni, visione, audio ---
    r = pg.evaluate("""async () => {
      localStorage.setItem('imc-gemini-chiave', ''); localStorage.removeItem('imc-modelli-q:_nuova'); IA.impostaChiave('groq', 'gsk_nuova');
      const log = [];
      window.fetch = async (u, o) => { u = String(u); const b = o && o.body;
        if (u.endsWith('/models')) { log.push('models'); return new Response(JSON.stringify({ data: [{ id: 'openai/gpt-oss-120b' }, { id: 'openai/gpt-oss-20b' }, { id: 'qwen/qwen3.8-27b' }] })); }
        if (u.includes('/audio/transcriptions')) { log.push('audio ' + b.get('model')); return new Response(JSON.stringify({ text: 'ciao', duration: 2 })); }
        const c = JSON.parse(b); log.push((c.response_format ? 'json ' : 'testo ') + c.model + (Array.isArray(c.messages[0].content) ? ' img' : ''));
        return new Response(JSON.stringify({ choices: [{ message: { content: c.response_format ? '{"x":1}' : '<think>…</think>**Risposta**' } }] })); };
      const chat = await Spiega.chat([{ role: 'user', content: 'json' }]);
      const sp = await Spiega.genera({ q: 'Quanto fa 2+2?', opts: [], corretta: '4', scelta: '', cit: '', passi: '', titolo: 'prova' }, 'breve');
      const vis = await Spiega.vede('leggi', 'data:image/png;base64,AAAA');
      const au = await IA.trascrivi(new Blob(['x']), { nome: 'a.webm', modello: 'whisper-large-v3' });
      return { chat, sp, vis, au: au.text, log }; }""")
    ok(r['chat'] == {'x': 1}, 'Spiega.chat → IA (JSON)')
    ok(r['sp']['testo'] == 'Risposta' and r['sp']['modello'] == 'openai/gpt-oss-120b', 'spiegazione → IA.testo (think e ** tolti): %s' % r['sp'])
    ok(r['vis'] == '**Risposta**', 'visione → IA.testo')
    ok(r['au'] == 'ciao', 'audio → IA.trascrivi')
    ok(r['log'] == ['models', 'json openai/gpt-oss-120b', 'testo openai/gpt-oss-120b', 'testo qwen/qwen3.8-27b img', 'audio whisper-large-v3'], 'chiamate: %s' % r['log'])

    # --- chiave-ai.json su Drive: v2 con `chiavi`, e lettura del vecchio formato { groq } ---
    r = pg.evaluate("""async () => {
      const prova = async (file) => { localStorage.removeItem('imc-groq-chiave'); localStorage.setItem('imc-gemini-chiave', '');
        Object.defineProperty(Drive, 'pronto', { get: () => true, configurable: true });
        Drive.preparaCartelle = async () => {}; Drive.idCartella = () => 'dati'; Drive.trovaFile = async n => n === 'chiave-ai.json' ? { id: 'k1' } : null;
        Drive.scaricaTesto = async () => JSON.stringify(file);
        const fatto = await Spiega.recuperaDaDrive(); return [fatto, IA.chiave('groq'), IA.chiave('gemini')]; };
      return [await prova({ groq: 'gsk_g', modello: 'x', v: 2, chiavi: { groq: 'gsk_g', gemini: 'AQ.gem' } }), await prova({ groq: 'gsk_vecchio' }), await prova({ groq: 'non-valida' })]; }""")
    ok(r[0] == [True, 'gsk_g', 'AQ.gem'], 'Drive v2: recupera groq e gemini %s' % r[0])
    ok(r[1] == [True, 'gsk_vecchio', ''], 'Drive formato 0.44 { groq }: ancora letto %s' % r[1])
    ok(r[2] == [False, '', ''], 'Drive con chiave non valida: ignorata')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)))
raise SystemExit(1 if err else 0)
