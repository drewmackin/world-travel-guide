#!/usr/bin/env python3
"""Inline style.css + app.js + data/app.json into a single shareable dist/index.html.
MapLibre stays on its CDN (needed at runtime, with internet). Run: python3 build/bundle.py"""
import os, re, json
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
def rd(p): return open(os.path.join(ROOT,p),encoding="utf-8").read()
html=rd("index.html"); css=rd("style.css"); js=rd("app.js"); data=rd("data/app.json")
# inline css
html=re.sub(r'<link href="style\.css[^"]*" rel="stylesheet" />', "<style>\n"+css+"\n</style>", html)
# embed data as a global, and make app.js read it instead of fetching
js_inlined=re.sub(r"DATA=await fetch\('data/app\.json[^)]*\)\.then\(r=>r\.json\(\)\);","DATA=window.__APP__;",js)
html=re.sub(r'<script src="app\.js[^"]*"></script>',
            '<script>window.__APP__='+data+';</script>\n<script>\n'+js_inlined+'\n</script>', html)
os.makedirs(os.path.join(ROOT,"dist"),exist_ok=True)
out=os.path.join(ROOT,"dist","index.html")
open(out,"w",encoding="utf-8").write(html)
kb=os.path.getsize(out)//1024
ok=("__APP__" in html) and ("<style>" in html) and ("leaflet" in html) and ('src="app.js' not in html)
print(f"Wrote dist/index.html ({kb} KB) — inlined ok: {ok}")
