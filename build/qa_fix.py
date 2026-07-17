#!/usr/bin/env python3
"""Re-geocode every QA-flagged pin with a HARD country constraint. If a country-matched
location is found, replace the (suspect) coords with it; if none, unpin the place.
Updates enrich.json (clears bad wiki coords) + geo/geocoded.json. Run after qa_coords.py."""
import json, os, time, urllib.parse, urllib.request, re
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE); DATA=os.path.join(ROOT,"data")
UA={"User-Agent":"ryan-shirley-travel-map/1.0 (personal; ryan-shirley-map project)"}
def norm(s): return re.sub(r"[^a-z]","",(s or "").lower())
def nomin(q,country):
    params={"q":f"{q}, {country}","format":"jsonv2","limit":1,"addressdetails":1,"accept-language":"en"}
    url="https://nominatim.openstreetmap.org/search?"+urllib.parse.urlencode(params)
    for _ in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=25) as r:
                d=json.load(r); return d[0] if d else None
        except Exception: time.sleep(2)
    return None
def cc_match(got,exp):
    g,e=norm(got),norm(exp)
    return g==e or (e and e in g) or (g and g in e)

def main():
    flags=json.load(open(os.path.join(DATA,"qa_flags.json")))
    enrich=json.load(open(os.path.join(DATA,"enrich.json")))
    geo=json.load(open(os.path.join(DATA,"geo","geocoded.json")))
    fixed=unpinned=kept=0
    for f in flags:
        hit=nomin(f["name"],f["country"])
        time.sleep(1.1)
        if hit and cc_match((hit.get("address") or {}).get("country",""), f["country"]):
            lat,lng=float(hit["lat"]),float(hit["lon"])
            # override any (possibly wrong) wiki coord + set geocoded tier A
            if f["id"] in enrich: enrich[f["id"]]["coordSrc"]="qa-fixed"; enrich[f["id"]]["lat"]=None
            geo[f["id"]]={"lat":lat,"lng":lng,"tier":"A","display":"(country-verified)","osm_country":f["country"]}
            # measure how far it moved
            import math
            d=math.hypot(lat-f["lat"],lng-f["lng"])
            if d>1.0: fixed+=1; print(f"  FIXED {f['name'][:26]:26} {f['country'][:14]:14} -> {lat:.2f},{lng:.2f}")
            else: kept+=1
        else:
            # cannot verify in the tagged country -> unpin
            if f["id"] in enrich: enrich[f["id"]]["coordSrc"]=""; enrich[f["id"]]["lat"]=None
            geo[f["id"]]={"lat":None,"lng":None,"tier":"C","display":"unverified","osm_country":""}
            unpinned+=1; print(f"  UNPIN {f['name'][:26]:26} {f['country'][:14]:14} (no country-matched location)")
    json.dump(enrich,open(os.path.join(DATA,"enrich.json"),"w"),ensure_ascii=False)
    json.dump(geo,open(os.path.join(DATA,"geo","geocoded.json"),"w"),ensure_ascii=False)
    print(f"\nQA fix: {fixed} relocated, {kept} confirmed-correct, {unpinned} unpinned.")

if __name__=="__main__": main()
