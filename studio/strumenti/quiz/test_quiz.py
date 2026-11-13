import re, sys, json
from playwright.sync_api import sync_playwright

path = sys.argv[1]
shots = sys.argv[2]
html = open(path, encoding="utf-8").read()
# correct answers from data
mcq = re.findall(r'\{t:"mcq",lv:"(\w+)",q:"(.*?)",r:.*?o:\["(.*?)"', html, re.S)
fill = re.findall(r'\{t:"fill",lv:"\w+",q:"(.*?)",r:.*?a:\["(.*?)"', html, re.S)
corr = {q: o for _, q, o in mcq}
fcorr = {q: a for q, a in fill}
print("mcq", len(mcq), "fill", len(fill))
assert len(mcq) == 12 and len(fill) == 6
lvs = [l for l, _, _ in mcq]
print("tipi", {l: lvs.count(l) for l in set(lvs)})
# Q2: correct never longer than distractors
for _, q, o in mcq:
    opts = re.search(re.escape(q) + r'".*?o:\[(.*?)\]', html, re.S).group(1)
    opts = json.loads("[" + opts + "]")
    if len(opts[0]) > max(len(x) for x in opts[1:]):
        print("WARN corretta piu lunga:", q[:50], opts)

errs = []
def norm_q(t):
    return t.replace("________", "……").strip()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "TUNNEL" not in m.text else None)
    pg.goto("file://" + path)
    pg.wait_for_timeout(300)

    # --- test hint + explanation + nav on first mcq ---
    qt = pg.inner_text(".question")
    pg.click("#hintbtn"); pg.click("#hintbtn")
    off = pg.query_selector_all(".opt.off")
    assert len(off) == 2, "hint deve oscurare 2"
    for o in off:
        assert corr[qt] not in o.inner_text(), "hint ha oscurato la corretta!"
    assert pg.is_disabled("#hintbtn")
    pg.click("#explbtn")
    assert pg.query_selector("#expl blockquote") or pg.query_selector("#expl .mine"), "spiegazione non aperta"
    pg.screenshot(path=shots + "/s1_hint_spieg.png", full_page=True)
    # skip forward, go back
    pg.click("#next"); assert "2</b> di 18" in pg.inner_html(".stat")
    pg.click("#prev"); assert "1</b> di 18" in pg.inner_html(".stat")
    assert len(pg.query_selector_all(".opt.off")) == 2, "stato hint perso"

    # --- answer all correctly except question 1 skipped first to test warning ---
    pg.click("#next")
    for i in range(1, 18):
        qt = norm_q(pg.inner_text(".question"))
        if pg.query_selector(".opts"):
            target = corr[qt]
            for o in pg.query_selector_all(".opt"):
                if o.query_selector(".txt").inner_text().strip() == target:
                    o.click(); break
            else:
                raise SystemExit("opzione corretta non trovata: " + qt)
        else:
            pg.fill("#ans", fcorr[qt] if fcorr[qt] != "velocita" else "Velocità")
            pg.click("button[type=submit]")
        assert pg.query_selector(".why .verdict.ok"), "risposta giusta segnata errata: " + qt
        if pg.query_selector(".fig") and i < 12:
            pg.screenshot(path=shots + f"/q{i+1}_fig.png", full_page=True)
        pg.click("#next")
    # warning for unanswered Q1
    assert pg.query_selector("#warnbox"), "manca avviso domande senza risposta"
    pg.screenshot(path=shots + "/warn.png", full_page=True)
    pg.click("#gofirst")
    assert "1</b> di 18" in pg.inner_html(".stat")
    qt = norm_q(pg.inner_text(".question"))
    for o in pg.query_selector_all(".opt:not(.off)"):
        if o.query_selector(".txt").inner_text().strip() == corr[qt]:
            o.click(); break
    # jump to last via meter and finish
    pg.click('[data-go="17"]'); pg.click("#next")
    txt = pg.inner_text("#app")
    assert "18 / 18" in txt.replace("\n", " "), txt[:200]
    assert "Suggerimenti usati: 2" in txt
    pg.screenshot(path=shots + "/final_ok.png", full_page=True)

    # --- rifai tutto, sbaglia una, controlla link ---
    pg.click("#again")
    pg.query_selector_all(".opt")[0]
    qt = norm_q(pg.inner_text(".question"))
    for o in pg.query_selector_all(".opt"):
        if o.query_selector(".txt").inner_text().strip() != corr[qt]:
            o.click(); break
    pg.click('[data-go="17"]'); pg.click("#next"); pg.click("#finish")
    assert pg.query_selector(".lk a"), "mancano i link Cosa ripassare"
    assert pg.query_selector(".review .wrongwhy"), "manca perche sbagliata nel riepilogo"
    pg.screenshot(path=shots + "/final_bad.png", full_page=True)
    # light theme check
    pg.emulate_media(color_scheme="light")
    pg.click("#retry")
    pg.screenshot(path=shots + "/light.png", full_page=True)
    b.close()

print("errori console:", errs)
print("TUTTO OK" if not errs else "CON ERRORI")
