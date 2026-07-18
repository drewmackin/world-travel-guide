#!/usr/bin/env python3
"""Inline style.css + app.js + data/app.json into a single shareable dist/index.html.
Leaflet + Leaflet.markercluster stay on their CDN (needed at runtime, with internet).
Run: python3 build/bundle.py

Two things here are easy to get wrong and used to ship a silently broken bundle:
  1. The pattern that rewrites app.js's data fetch must tolerate parentheses inside the URL
     expression (it contains `Date.now()`), so it uses a non-greedy `.*?`, not `[^)]*`.
  2. css/js/json are injected via a CALLABLE replacement. Passing them as re.sub replacement
     strings would reinterpret backslash escapes (a `\\n` inside app.json would be mangled).
The self-check below asserts the property that actually matters and exits non-zero if it fails.
"""
import os, re, sys
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
def rd(p): return open(os.path.join(ROOT,p),encoding="utf-8").read()
html=rd("index.html"); css=rd("style.css"); js=rd("app.js"); data=rd("data/app.json")

# 1. inline the stylesheet
html,n_css=re.subn(r'<link href="style\.css[^"]*" rel="stylesheet" />',
                   lambda m: "<style>\n"+css+"\n</style>", html)

# 2. make app.js read the embedded global instead of fetching over the network
js_inlined,n_fetch=re.subn(r"DATA=await fetch\('data/app\.json.*?\)\.then\(r=>r\.json\(\)\);",
                           lambda m: "DATA=window.__APP__;", js)

# 3. swap the <script src> for the embedded data + inlined app code
html,n_js=re.subn(r'<script src="app\.js[^"]*"></script>',
                  lambda m: '<script>window.__APP__='+data+';</script>\n<script>\n'+js_inlined+'\n</script>',
                  html)

os.makedirs(os.path.join(ROOT,"dist"),exist_ok=True)
out=os.path.join(ROOT,"dist","index.html")
open(out,"w",encoding="utf-8").write(html)
kb=os.path.getsize(out)//1024

problems=[]
if n_css!=1:   problems.append(f"stylesheet link not inlined (matched {n_css}x)")
if n_fetch!=1: problems.append(f"app.json fetch not rewritten (matched {n_fetch}x) — app.js's fetch line changed?")
if n_js!=1:    problems.append(f"app.js script tag not replaced (matched {n_js}x)")
if "DATA=window.__APP__" not in html: problems.append("bundle never assigns DATA from the embedded data")
if "fetch('data/app.json" in html:    problems.append("bundle still fetches data/app.json at runtime")
if 'src="app.js' in html:             problems.append("bundle still references external app.js")
if "<style>" not in html:             problems.append("no inline <style> in bundle")
if "leaflet" not in html:             problems.append("leaflet CDN tags missing")

if problems:
    print(f"Wrote dist/index.html ({kb} KB) — BROKEN:")
    for p in problems: print("  ✗ "+p)
    sys.exit(1)
print(f"Wrote dist/index.html ({kb} KB) — self-contained ✓ (data embedded, no runtime fetch)")
