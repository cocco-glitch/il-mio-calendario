# Test v0.55 (BP4): Allenamento Neuro con certezza → illusione di competenza → hook del Pianificatore (0 token).
# Certezza 3 + risposta sbagliata su C-3.1.1-1: statq.neuro.ultimoCaso = illusione_competenza (con tag) e,
# nel piano ai_neuro della materia C, la prossima attività L3/L4 viene anticipata nel buffer. Nessuna chiamata di rete AI.
import json, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', 'dist', '--protocol', 'HTTP/1.1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    with socket.socket() as _s:
        if _s.connect_ex(('127.0.0.1', 8765)) == 0: break
    time.sleep(.1)
errori, rete_ai = [], []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(bypass_csp=True, viewport={'width': 390, 'height': 844})
        pg.add_init_script("try { localStorage.setItem('imc-quiz-modo','neuro') } catch (e) {}")   # Allenamento Neuro (certezza)
        pg.on('pageerror', lambda e: errori.append(str(e)))
        for host in ['api.groq.com', 'generativelanguage.googleapis.com', 'api.xkiro.com', 'api.cohere.com', 'router.requesty.ai', 'api.cerebras.ai', 'api.sambanova.ai']:
            pg.route('https://' + host + '/**', lambda route: (rete_ai.append(route.request.url), route.abort()))
        pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(1500)
        # piano ai_neuro della materia C (unità note → 0 token), con buffer
        prova = pg.evaluate("""async () => {
            const oggi = ymd(new Date()), tgt = ymd(piuGiorni(new Date(), 14));
            const U = [1, 2, 3, 4].map(i => ({ uid: 'U' + i, titolo: 'Unità ' + i, prereq: i > 1 ? ['U' + (i - 1)] : [], densita: 3, minutiBase: 90, concettiChiave: [] }));
            const v = { materiaCodice: 'C', archetipo: 'scienze_sperimentali', sorgentiDriveIds: [], dataTarget: tgt, livelloPartenza: 'da_zero', livelloObiettivo: 4,
              finestreSettimanali: [0, 1, 2, 3, 4, 5, 6].map(g => ({ giornoSettimana: g, oraInizio: '15:00', oraFine: '21:00' })), maxOreGiorno: 3 };
            const r = await Pianificatore.creaPiano(v, { oggi, unita: U, pid: 'ai-e2e', statq: () => [] });
            if (!r.piano) return { errore: r.fatt.stato };
            Studio.importa(r.piano);
            const h = Pianificatore.hookIpercorrezione(r.piano, { oggi, sk: 'C-3.1.1-1', caso: 'illusione_competenza' });
            return h ? { k: h.k, da: h.da, a: h.a, salvato: !!Studio.pkPiani().find(x => x.id === 'ai-e2e') } : { errore: 'nessun candidato' };
        }""")
        assert 'errore' not in prova and prova['salvato'], prova
        # quiz C-3.1.1-1 in Allenamento Neuro
        pg.evaluate("""() => { const t = trovaScheda('C-3.1.1-1'); QuizApp.apri(t.pk, t.m, t.micro, t.s); }""")
        pg.wait_for_selector('.qz-domanda', timeout=8000)
        assert pg.locator('.qz-cert [data-cert]').count() == 3, 'manca il passo di certezza'
        pg.click('.qz-cert [data-cert="3"]')
        d = pg.evaluate("""async () => { const B = await Banca.carica(3); const N = s => String(s).replace(/<[^>]+>/g, ' ').replace(/[^A-Za-z0-9àèéìòù]+/g, '').toLowerCase();
            const vis = N(document.querySelector('.qz-domanda').textContent);
            const c = B.domande.filter(d => d.sk==='C-3.1.1-1').map(d => ({ d, k: N(d.q).slice(0, 40) })).filter(x => x.k && vis.includes(x.k)).sort((a, b) => b.k.length - a.k.length);
            return c.length ? c[0].d : null; }""")
        assert d, 'domanda mostrata non trovata nella banca'
        if d['t'] == 'mcq':
            giusta = d['o'][0][:12]
            bott = pg.locator('.qz-opz-b')
            for i in range(bott.count()):
                if giusta not in bott.nth(i).inner_text(): bott.nth(i).click(); break
        else:
            pg.fill('#qz-ans', 'risposta volutamente sbagliata zzz'); pg.click('.qz-fill button[type=submit]')
        pg.wait_for_timeout(400)
        st = pg.evaluate("Stato.tutti('statq').filter(r => r.sk === 'C-3.1.1-1')")
        assert len(st) == 1 and st[0]['ok'] == 0, st
        neuro = st[0].get('neuro') or {}
        assert neuro.get('ultimoCaso') == 'illusione_competenza' and 'illusione_competenza' in (neuro.get('tag') or []), neuro
        assert st[0]['confidenceLog'][-1]['livelloCertezza'] == 3 and st[0]['confidenceLog'][-1]['corretto'] is False, st[0]['confidenceLog']
        # hook post-quiz: L3/L4 anticipata nel buffer del piano ai_neuro
        dopo = pg.evaluate("""k => { const p = Studio.pkPiani().find(x => x.id === 'ai-e2e'); const g = p.giorni.find(g => g.voci.some(v => v.k === k)); return { iper: !!p.iper, data: g && g.data }; }""", prova['k'])
        assert dopo['iper'] and dopo['data'] == prova['a'] and prova['a'] < prova['da'], (prova, dopo)
        assert 'Illusione di competenza' in pg.inner_text('body'), 'avviso dell\'anticipo'
        assert not rete_ai, rete_ai
        assert not errori, errori
        print('TUTTO OK allenamento neuro: certezza 3 + errore → illusione di competenza, L3/L4 anticipata nel buffer, 0 chiamate AI')
        b.close()
finally:
    srv.terminate()
