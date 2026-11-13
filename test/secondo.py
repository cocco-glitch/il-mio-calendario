# Test v0.26: seconda persona — il programma del sito resta del proprietario.
import subprocess, sys, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8770', '-d', 'dist'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); errori = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        pg.on('pageerror', lambda e: errori.append(str(e)))
        pg.goto('http://localhost:8770/index.html'); pg.wait_for_timeout(1500)
        n = pg.evaluate("Stato.tutti('pacchetto').filter(r => r.daSito).length")
        assert n >= 3, n                                   # primo avvio senza account: caricato
        assert pg.evaluate("Drive.eProprietario()")
        pg.evaluate("Drive.stato.email = 'altra.persona@gmail.com'")
        assert not pg.evaluate("Drive.eProprietario()")
        tolti = pg.evaluate("Studio.togliSito()")
        assert tolti >= n and pg.evaluate("Stato.tutti('pacchetto').filter(r => !r.deleted).length") == 0
        assert pg.evaluate("Stato.tutti('esame').filter(r => !r.deleted && r.daSito).length") == 0
        pg.evaluate("Studio.caricaDalSito()"); pg.wait_for_timeout(800)
        assert pg.evaluate("Stato.tutti('pacchetto').filter(r => !r.deleted).length") == 0, 'il secondo account non deve ricevere il programma del sito'
        pg.evaluate("Drive.stato.email = 'cocco.haloa@gmail.com'")
        pg.evaluate("Studio.caricaDalSito()"); pg.wait_for_timeout(800)
        assert pg.evaluate("Stato.tutti('pacchetto').filter(r => !r.deleted).length") >= 3
        assert not errori, errori
        print('TUTTO OK seconda persona: programma del sito solo al proprietario')
        b.close()
finally:
    srv.terminate()
