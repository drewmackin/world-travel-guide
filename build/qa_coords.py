#!/usr/bin/env python3
"""QA: flag pinned places whose coordinates fall outside their tagged continent's rough
bounding box (a proxy for a wrong Wikipedia-article / geocode match). Writes data/qa_flags.json.
Does NOT auto-remove — flags for review. Run: python3 build/qa_coords.py"""
import json, os
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE); DATA=os.path.join(ROOT,"data")
# lng_min, lng_max, lat_min, lat_max (generous; overseas territories handled as exceptions)
BOX={
 "Europe":(-32,60,33,72),      # incl. Iceland, Azores, Canaries edge
 "Asia":(25,180,-11,60),       # incl. Indonesia
 "Africa":(-26,52,-36,38),
 "North America":(-170,-50,6,73),
 "South America":(-93,-33,-56,14),
 "Oceania":(110,180,-50,2),
 "Other":(-180,180,-90,90),
}
OCEANIA_EAST=(-180,-120,-30,0)  # French Polynesia etc. (east of dateline)

def in_box(lng,lat,b):
    return b[0]<=lng<=b[1] and b[2]<=lat<=b[3]

def main():
    app=json.load(open(os.path.join(DATA,"app.json")))
    flags=[]
    for p in app["places"]:
        if not p.get("pinned"): continue
        lng,lat,cont=p["lng"],p["lat"],p["continent"]
        b=BOX.get(cont,BOX["Other"])
        ok=in_box(lng,lat,b)
        if not ok and cont=="Oceania" and in_box(lng,lat,OCEANIA_EAST): ok=True
        if not ok:
            flags.append({"id":p["id"],"name":p["name"],"country":p["country"],
                "continent":cont,"lat":lat,"lng":lng})
    json.dump(flags,open(os.path.join(DATA,"qa_flags.json"),"w"),ensure_ascii=False)
    pinned=sum(1 for p in app["places"] if p.get("pinned"))
    print(f"QA coords: {pinned} pins, {len(flags)} flagged (coord outside tagged continent).")
    for f in flags[:40]:
        print(f"  ⚠ {f['name'][:26]:26} {f['country'][:16]:16} {f['continent'][:13]:13} @ {f['lat']:.1f},{f['lng']:.1f}")

if __name__=="__main__": main()
