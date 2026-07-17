#!/usr/bin/env python3
"""Merge per-country data/country/*.json (safety + costs + Boston flights) into one
data/country_profiles.json keyed by the exact country string. Run: python3 build/merge_country.py"""
import json, os, glob
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE); DATA=os.path.join(ROOT,"data")
out={}
for f in sorted(glob.glob(os.path.join(DATA,"country","*.json"))):
    try: d=json.load(open(f))
    except Exception as e: print("skip",f,e); continue
    c=d.get("country")
    if c: out[c]=d
json.dump(out,open(os.path.join(DATA,"country_profiles.json"),"w"),ensure_ascii=False)
lv={1:0,2:0,3:0,4:0}
for d in out.values():
    L=((d.get("advisory") or {}).get("level"));
    if L in lv: lv[L]+=1
print(f"Merged {len(out)} country profiles -> country_profiles.json")
print("advisory levels:",lv)
