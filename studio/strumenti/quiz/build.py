import sys, json, html, os
# Uso: python3 build.py esempio/meta.json   -> scrive out/<meta.out>
# meta: out, title, eyebrow, h1, focus, src, data[] (file .js relativi alla cartella del meta)
B = os.path.dirname(os.path.abspath(__file__))
mf = os.path.abspath(sys.argv[1]); m = json.load(open(mf, encoding="utf-8")); D = os.path.dirname(mf)
r = lambda f: open(f, encoding="utf-8").read()
h0 = r(os.path.join(B, "h0")); i, j = h0.index("<title>"), h0.index("</title>") + 8
h0 = h0[:i] + "<title>" + html.escape(m["title"]) + "</title>" + h0[j:]
head = ('<header>\n    <p class="eyebrow">%s</p>\n    <h1>%s</h1>\n    <p class="focus">%s</p>\n    <p class="src">%s</p>\n  </header>'
        % tuple(html.escape(m[k], quote=False) for k in ("eyebrow", "h1", "focus", "src")))
data = "".join(r(os.path.join(D, f)) for f in m["data"])
out = h0 + head + r(os.path.join(B, "h1")) + "<script>\n(function(){\n" + data + "\n" + r(os.path.join(B, "engine.js")) + r(os.path.join(B, "tail"))
os.makedirs(os.path.join(B, "out"), exist_ok=True)
p = os.path.join(B, "out", m["out"]); open(p, "w", encoding="utf-8").write(out)
print(p); print(len(out.encode()), "byte", file=sys.stderr)
