# Test P0.65: snapshot quote, telemetria misurata/stimata, failover sequenziale e timeout prudenti.
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

PREPARA = r"""
window.prepara65 = (chiavi, risposta) => {
  Object.keys(localStorage).filter(k => /^imc-(ai-|groq-chiave|gemini-chiave|modelli-)/.test(k)).forEach(k => localStorage.removeItem(k));
  IA.azzera(); for (const p in chiavi) IA.impostaChiave(p, chiavi[p]);
  window.LOG65 = []; window.VOLO65 = 0; window.MAX65 = 0;
  window.fetch = async (u, o = {}) => {
    u = String(u); const host = new URL(u).host, p = host.includes('googleapis') ? 'gemini' : host.split('.').slice(-2, -1)[0];
    if (u.endsWith('/models')) return new Response(JSON.stringify({ data: (p === 'gemini' ? ['gemini-3.1-flash-lite'] : ['openai/gpt-oss-120b','openai/gpt-oss-20b']).map(id => ({id})) }));
    const c = JSON.parse(o.body); LOG65.push([p, c.model, Date.now()]); VOLO65++; MAX65 = Math.max(MAX65, VOLO65);
    try { return await risposta(p, c, o); } finally { VOLO65--; }
  };
};
window.giorno65 = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
"""

with sync_playwright() as p:
    pg = p.chromium.launch().new_page()
    pg.on('pageerror', lambda e: err.append('pageerror: ' + str(e)))
    pg.goto(URL); pg.wait_for_selector('.tabbar'); pg.evaluate(PREPARA)
    E = lambda js, arg=None: pg.evaluate(js, arg)

    # Contratto pubblico: tutti i provider, chiave solo booleana, stati e campi diagnostici stabili.
    r = E("""() => { IA.azzera(); const s = IA.snapshotQuote(); return { keys: Object.keys(s.provider), one: s.provider.groq, history: s.failover }; }""")
    ok(r['keys'] == ['groq', 'gemini', 'xkiro', 'cohere', 'requesty'], 'snapshot contiene tutti e soli i provider noti')
    one = r['one']
    campi = ['id', 'haChiave', 'modello', 'stato', 'origineQuota', 'quotaDisponibile', 'quotaStimata', 'aggiornatoIl', 'ultimoSuccessoIl', 'ripristinoIl', 'ultimoErroreHttp', 'ultimoErroreRete', 'ultimoFailover', 'microBatchResidui']
    ok(all(k in one for k in campi) and one['stato'] == 'senza_chiave' and one['haChiave'] is False and r['history'] == [], 'snapshot stabile e nessun valore della chiave esposto')

    # Una chiave configura il provider ma non garantisce risposta/quota; solo un successo osservato lo rende disponibile.
    r = E("""async () => { prepara65({groq:'gsk_prova'}, async () => new Response(JSON.stringify({choices:[{message:{content:'ok'}}]})));
      const prima=IA.snapshotQuote().provider.groq; await IA.testo([{role:'user',content:'ciao'}], 'genera'); const dopo=IA.snapshotQuote().provider.groq;
      return {prima:prima.stato,dopo:dopo.stato,successo:dopo.ultimoSuccessoIl}; }""")
    ok(r['prima'] == 'configurato' and r['dopo'] == 'disponibile' and r['successo'], 'configurato non equivale a disponibile; il successo osservato aggiorna lo stato')

    # Il budget segue il provider/modello candidato: Gemini non eredita il limite TPM piu' stretto di Groq.
    r = E("""async () => { prepara65({groq:'gsk_prova',gemini:'AIza-prova'}, async () => new Response('{}'));
      const piano=await IA.pianificaBudgetCaratteri('genera',3250); return {piano,groq:IA.budgetCaratteriPrudente(3250,'groq'),gemini:IA.budgetCaratteriPrudente(3250,'gemini')}; }""")
    ok(r['piano']['prov'] == 'gemini' and r['piano']['caratteri'] > r['groq'] and r['gemini'] > r['groq'], 'budget calcolato sul provider/modello candidato (%s)' % r)

    # Quota locale: è una stima, non una misura del provider; guardia 85% esplicita.
    r = E("""() => { prepara65({ groq: 'gsk_prova' }, async () => new Response('{}'));
      const t = Date.now(); localStorage.setItem('imc-ai-uso', JSON.stringify({ 'groq:openai/gpt-oss-120b': { g: giorno65(), n: 850, w: Array.from({length: 26}, () => [t, 1]) } }));
      const x = IA.snapshotQuote().provider.groq; return x; }""")
    ok(r['origineQuota'] == 'stimata' and r['quotaDisponibile'] is None and r['stato'] == 'guardia_85', 'contatori locali dichiarati stimati e guardia 85% visibile')
    ok(r['microBatchResidui'] is not None and r['microBatchResidui'] >= 0, 'stima prudenziale micro-batch disponibile quando esistono limiti e storico')

    # Header del provider: quota misurata; 429 registra HTTP, cooldown e failover in ordine.
    r = E("""async () => { prepara65({ groq: 'gsk_prova' }, async (p, c) => c.model.includes('120b')
        ? new Response(JSON.stringify({error:{message:'rate'}}), {status:429, headers:{'retry-after':'20','x-ratelimit-remaining-requests':'0'}})
        : new Response(JSON.stringify({choices:[{message:{content:'ok'}}]}), {headers:{'x-ratelimit-remaining-requests':'7'}}));
      const x = await IA.testo([{role:'user',content:'ciao'}], 'genera'); const s = IA.snapshotQuote();
      return { x, log: LOG65, max: MAX65, g: s.provider.groq, h: s.failover }; }""")
    ok(r['x']['testo'] == 'ok' and r['max'] == 1 and [x[1] for x in r['log']] == ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], '429: tentativi strettamente sequenziali')
    ok(r['g']['origineQuota'] == 'misurata' and r['g']['quotaDisponibile'] == 7 and r['g']['microBatchResidui'] <= 7 and r['g']['ultimoErroreHttp'] == 429 and r['g']['ripristinoIl'] > 0, 'header quota misurato, stima prudenziale e 429 diagnosticato')
    ok(len(r['h']) == 1 and r['h'][0]['da'].startswith('groq:') and r['h'][0]['a'].startswith('groq:'), 'storico sintetico del failover registrato')

    # GPT-OSS: il ragionamento resta basso e fuori dalla risposta, per lasciare spazio al JSON del quiz.
    r = E("""async () => { let corpo=null; prepara65({groq:'gsk_prova'}, async (p,c) => { corpo=c; return new Response(JSON.stringify({choices:[{message:{content:'{\"ok\":true}'}}]})); });
      await IA.chiedi([{role:'user',content:'Rispondi in JSON'}], 'genera', {prudente:true,maxOut:900});
      return {effort:corpo.reasoning_effort,include:corpo.include_reasoning,formato:corpo.response_format&&corpo.response_format.type}; }""")
    ok(r == {'effort':'low','include':False,'formato':'json_object'}, 'Groq GPT-OSS riserva il completamento al JSON (%s)' % r)

    # Timeout al primo byte su POST: consumo incerto, nessun secondo provider/modello automatico.
    r = E("""async () => { prepara65({ groq:'gsk_prova' }, async (p, c, o) => await new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve(new Response(JSON.stringify({choices:[{message:{content:'tardi'}}]}))), 200);
        o.signal && o.signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted','AbortError')); });
      })); IA.impostaTimeout('groq', { primoByte:20, risposta:80, totale:100 });
      let e = ''; try { await IA.chiedi([{role:'user',content:'json'}], 'genera', { prudente:true }); } catch (x) { e = x.message; }
      const s = IA.snapshotQuote(); return {e, n:LOG65.length, rete:s.provider.groq.ultimoErroreRete, h:s.failover}; }""")
    ok(r['n'] == 1 and 'incerto' in r['e'].lower(), 'timeout POST incerto non ripetuto automaticamente (%s)' % r['e'])
    ok(r['rete'] == 'timeout_primo_byte' and r['h'] == [], 'fase timeout registrata senza falso failover %s' % r)

    # Timeout durante il corpo: la risposta è iniziata, il consumo è certamente da trattare come incerto.
    r = E("""async () => { prepara65({ groq:'gsk_prova' }, async () => {
        const enc = new TextEncoder(); const body = new ReadableStream({start(c){ setTimeout(() => { c.enqueue(enc.encode('{\"choices\":[')); }, 2); setTimeout(() => { c.enqueue(enc.encode('{\"message\":{\"content\":\"ok\"}}]}')); c.close(); }, 120); }});
        return new Response(body, {headers:{'content-type':'application/json'}});
      }); IA.impostaTimeout('groq', { primoByte:40, risposta:20, totale:100 });
      let e=''; try { await IA.chiedi([{role:'user',content:'json'}], 'genera', {prudente:true}); } catch(x) {e=x.message;}
      return {e,n:LOG65.length,rete:IA.snapshotQuote().provider.groq.ultimoErroreRete}; }""")
    ok(r['n'] == 1 and r['rete'] == 'timeout_risposta' and 'incerto' in r['e'].lower(), 'timeout del corpo classificato e non duplicato %s' % r)

    # HTTP 500/503 dopo un POST possono avere consumato la richiesta: in prudente si ferma senza failover cieco.
    for stato in (500, 503):
      r = E("""async stato => { prepara65({groq:'gsk_prova'}, async () => new Response(JSON.stringify({error:{message:'server'}}),{status:stato}));
        let e=''; try { await IA.chiedi([{role:'user',content:'json'}], 'genera', {prudente:true}); } catch(x) {e=x.message;}
        const s=IA.snapshotQuote(); return {e,n:LOG65.length,http:s.provider.groq.ultimoErroreHttp,h:s.failover}; }""", stato)
      ok(r['n'] == 1 and r['http'] == stato and not r['h'] and 'incerto' in r['e'].lower(), 'HTTP %d prudente: stop senza doppio consumo (%s)' % (stato, r))

    # Un TypeError di fetch non dimostra CORS: resta un errore di rete a origine non determinabile.
    r = E("""async () => { prepara65({groq:'gsk_prova'}, async () => { throw new TypeError('Failed to fetch'); });
      let e=''; try { await IA.chiedi([{role:'user',content:'json'}], 'genera', {prudente:true}); } catch(x) {e=x.message;}
      const s=IA.snapshotQuote(); return {e,n:LOG65.length,rete:s.provider.groq.ultimoErroreRete,h:s.failover}; }""")
    ok(r['n'] == 1 and r['rete'] == 'errore_rete' and not r['h'] and 'cors' not in r['e'].lower(), 'errore fetch classificato come rete non determinabile, senza falso CORS (%s)' % r)

    # Risposta malformata in modalità prudente: niente correzione/failover che consumi una seconda richiesta.
    r = E("""async () => { prepara65({groq:'gsk_prova'}, async () => new Response(JSON.stringify({choices:[{message:{content:'non json'}}]})));
      let e=''; try { await IA.chiedi([{role:'user',content:'json'}], 'genera', {prudente:true}); } catch(x) {e=x.message;}
      return {e,n:LOG65.length,rete:IA.snapshotQuote().provider.groq.ultimoErroreRete}; }""")
    ok(r['n'] == 1 and r['rete'] == 'risposta_malformata', 'risposta malformata prudente: una sola richiesta %s' % r)

    # Il pannello vive nel bundle dedicato, mostra indisponibilità leggibile e non espone chiavi.
    r = E("""async () => { IA.PROVS.forEach(p=>IA.impostaChiave(p,'')); IA.azzera(); await caricaStrumentiQuiz(); CodaQuizUI.apri(); const q = document.querySelector('[data-quote-ai]');
      return { testo:q && q.textContent, pannelli:document.querySelectorAll('[data-quote-ai]').length }; }""")
    ok(r['pannelli'] == 1 and 'Nessun provider disponibile' in r['testo'] and 'chiave assente' in r['testo'], 'pannello quote nel Centro/coda con indisponibilità leggibile')

print('\n' + ('TUTTO OK' if not err else '%d ERRORI' % len(err)), *err, sep='\n')
raise SystemExit(1 if err else 0)
