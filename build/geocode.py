#!/usr/bin/env python3
"""Geocode every unique place (Nominatim, country-aware, throttled, confidence-flagged).
Reads data/places.json [{id,name,country,...}] -> data/geo/geocoded.json {id:{lat,lng,tier,display}}.
Tier A = OSM returned a hit whose country matches the expected country; C = mismatch/none (not pinned).
Idempotent: skips ids already present in geocoded.json. Run: python3 build/geocode.py"""
import json, os, time, urllib.parse, urllib.request, re, sys
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE); DATA=os.path.join(ROOT,"data")
UA={"User-Agent":"ryan-shirley-travel-map/1.0 (personal trip planning; ryan-shirley-map project)"}
GEOF=os.path.join(DATA,"geo","geocoded.json")

def norm(s): return re.sub(r"[^a-z]","",(s or "").lower())

def nominatim(q, country=None):
    params={"q":q if not country else f"{q}, {country}","format":"jsonv2","limit":1,
            "addressdetails":1,"accept-language":"en"}
    url="https://nominatim.openstreetmap.org/search?"+urllib.parse.urlencode(params)
    for _ in range(3):
        try:
            req=urllib.request.Request(url,headers=UA)
            with urllib.request.urlopen(req,timeout=25) as r:
                d=json.load(r)
                return d[0] if d else None
        except Exception:
            time.sleep(2)
    return None

def main():
    places=json.load(open(os.path.join(DATA,"places.json")))
    geo=json.load(open(GEOF)) if os.path.exists(GEOF) else {}
    # Prefer Wikipedia's exact article coordinates (on-topic, correct) from enrich.json
    ep=os.path.join(DATA,"enrich.json"); enrich=json.load(open(ep)) if os.path.exists(ep) else {}
    seeded=0
    for p in places:
        e=enrich.get(p["id"]) or {}
        if p["id"] not in geo and e.get("coordSrc")=="wikipedia" and e.get("lat") is not None:
            geo[p["id"]]={"lat":e["lat"],"lng":e["lng"],"tier":"A","display":"(Wikipedia)","osm_country":p.get("country","")}
            seeded+=1
    todo=[p for p in places if p["id"] not in geo]
    print(f"{len(places)} places, {seeded} seeded from Wikipedia coords, {len(todo)} to Nominatim")
    A=C=0
    for i,p in enumerate(todo):
        hit=nominatim(p["name"], p.get("country"))
        if hit:
            got_cc=(hit.get("address") or {}).get("country","")
            exp=p.get("country","")
            match = norm(got_cc)==norm(exp) or not exp or norm(exp) in norm(got_cc) or norm(got_cc) in norm(exp)
            geo[p["id"]]={"lat":float(hit["lat"]),"lng":float(hit["lon"]),
                          "tier":"A" if match else "C","display":hit.get("display_name","")[:120],
                          "osm_country":got_cc}
            if match: A+=1
            else: C+=1
        else:
            geo[p["id"]]={"lat":None,"lng":None,"tier":"C","display":"","osm_country":""}
            C+=1
        if i%25==0:
            json.dump(geo,open(GEOF,"w"),ensure_ascii=False)
            print(f"  [{i+1}/{len(todo)}] A(matched)={A} C(weak/none)={C}", flush=True)
        time.sleep(1.1)   # Nominatim usage policy: <=1 req/sec
    json.dump(geo,open(GEOF,"w"),ensure_ascii=False)
    pinned=sum(1 for g in geo.values() if g.get("lat") and g["tier"]=="A")
    print(f"DONE: {len(geo)} geocoded, {pinned} confident pins (tier A).")

if __name__=="__main__": main()
