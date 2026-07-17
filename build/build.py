#!/usr/bin/env python3
"""Assemble places.json + geo/geocoded.json + enrich.json + videos.json -> data/app.json
for the Ryan Shirley world travel map. Booking links are generated client-side."""
import json, os, re
from collections import Counter, defaultdict
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE); DATA=os.path.join(ROOT,"data")

def load(p,d):
    fp=os.path.join(DATA,p)
    return json.load(open(fp)) if os.path.exists(fp) else d

CONTINENT={
 # Europe
 "Italy":"Europe","France":"Europe","Spain":"Europe","Portugal":"Europe","Greece":"Europe","Germany":"Europe",
 "Austria":"Europe","Switzerland":"Europe","Netherlands":"Europe","Belgium":"Europe","United Kingdom":"Europe",
 "UK":"Europe","Scotland":"Europe","Ireland":"Europe","Iceland":"Europe","Norway":"Europe","Sweden":"Europe",
 "Finland":"Europe","Denmark":"Europe","Croatia":"Europe","Slovenia":"Europe","Montenegro":"Europe","Albania":"Europe",
 "Hungary":"Europe","Poland":"Europe","Czech Republic":"Europe","Czechia":"Europe","Slovakia":"Europe","Romania":"Europe",
 "Bulgaria":"Europe","Malta":"Europe","Ukraine":"Europe","Russia":"Europe","Turkey":"Europe","Faroe Islands":"Europe",
 "Bosnia and Herzegovina":"Europe","Serbia":"Europe","Estonia":"Europe","Latvia":"Europe","Lithuania":"Europe",
 "Luxembourg":"Europe","Monaco":"Europe","Liechtenstein":"Europe","North Macedonia":"Europe","Kosovo":"Europe",
 # Africa
 "Morocco":"Africa","Egypt":"Africa","Namibia":"Africa","Tanzania":"Africa","Kenya":"Africa","Ethiopia":"Africa",
 "South Africa":"Africa","Botswana":"Africa","Seychelles":"Africa","Madagascar":"Africa","Zimbabwe":"Africa",
 "Zambia":"Africa","Uganda":"Africa","Rwanda":"Africa","Mauritius":"Africa","Tunisia":"Africa",
 # Asia
 "Thailand":"Asia","Sri Lanka":"Asia","Oman":"Asia","China":"Asia","Japan":"Asia","India":"Asia","Vietnam":"Asia",
 "Indonesia":"Asia","Philippines":"Asia","Nepal":"Asia","Cambodia":"Asia","Malaysia":"Asia","Jordan":"Asia",
 "United Arab Emirates":"Asia","UAE":"Asia","Israel":"Asia","South Korea":"Asia","Maldives":"Asia","Bhutan":"Asia",
 # Oceania
 "Australia":"Oceania","New Zealand":"Oceania","Tasmania":"Oceania","French Polynesia":"Oceania","Fiji":"Oceania",
 # North America
 "United States":"North America","USA":"North America","United States of America":"North America","Canada":"North America",
 "Mexico":"North America","Belize":"North America","Costa Rica":"North America","Guatemala":"North America",
 "El Salvador":"North America","Panama":"North America","Cuba":"North America","Jamaica":"North America",
 # South America
 "Brazil":"South America","Argentina":"South America","Chile":"South America","Peru":"South America",
 "Colombia":"South America","Bolivia":"South America","Ecuador":"South America","Uruguay":"South America",
 "Patagonia":"South America","Venezuela":"South America","Paraguay":"South America","Guyana":"South America",
}
def continent(c):
    c=(c or "").strip()
    if c in CONTINENT: return CONTINENT[c]
    for k,v in CONTINENT.items():
        if k.lower() in c.lower(): return v
    return "Other"

def main():
    places=load("places.json",[])
    geo=load("geo/geocoded.json",{})
    enrich=load("enrich.json",{})
    videos=load("videos.json",[])
    profiles=load("country_profiles.json",{})   # safety + costs + Boston flights per country
    # curated real hotels per place (from the med-hotels workflow): data/hotels/<id>.json
    import glob as _glob
    stays_by_id={}
    for f in _glob.glob(os.path.join(DATA,"hotels","*.json")):
        try:
            hd=json.load(open(f)); hid=hd.get("id") or os.path.basename(f)[:-5]
            hs=hd.get("hotels") or []
            if hs: stays_by_id[hid]=hs
        except Exception: pass
    # town data (verified+geocoded hotels + mapped attractions) overrides stays where present
    town_by_id={}
    for f in _glob.glob(os.path.join(DATA,"town","*.json")):
        try:
            td=json.load(open(f)); tid=td.get("id") or os.path.basename(f)[:-5]
            town_by_id[tid]=td
        except Exception: pass
    out=[]
    for p in places:
        g=geo.get(p["id"]) or {}; e=enrich.get(p["id"]) or {}
        # Prefer Wikipedia's exact article coordinates (on-topic, correct); else Nominatim tier-A.
        if e.get("coordSrc")=="wikipedia" and e.get("lat") is not None:
            lat=e["lat"]; lng=e["lng"]; tier="A"
        else:
            lat=g.get("lat"); lng=g.get("lng"); tier=g.get("tier","C")
        pinned=bool(lat and lng and tier=="A")
        prof=profiles.get(p.get("country","")) or {}
        out.append({**p,
            "lat":lat,"lng":lng,"pinned":pinned,"continent":continent(p.get("country","")),
            "photos":e.get("photos",[]),"factual":e.get("factual",""),"wiki":e.get("wiki",""),
            "advisory":prof.get("advisory"),"safetyIndex":prof.get("safetyIndex"),
            "safetySummary":prof.get("safetySummary",""),"costTier":prof.get("costTier"),
            "dailyBudgetUSD":prof.get("dailyBudgetUSD"),"dailyMidUSD":prof.get("dailyMidUSD"),
            "hotelBudgetUSD":prof.get("hotelBudgetUSD"),"hotelMidUSD":prof.get("hotelMidUSD"),
            "airport":prof.get("mainAirport"),"flightRT":prof.get("flightFromBostonRT_USD"),
            "flightNote":prof.get("flightNote",""),
            "stays":(town_by_id.get(p["id"],{}).get("hotels") or stays_by_id.get(p["id"],[])),
            "attractions":town_by_id.get(p["id"],{}).get("attractions",[]),
            "town":bool(town_by_id.get(p["id"])),
        })
    pinned=[p for p in out if p["pinned"]]
    bycountry=Counter(p["country"] for p in out if p["country"])
    bycont=Counter(p["continent"] for p in pinned)
    withphoto=sum(1 for p in out if p["photos"])
    meta={
        "title":"Ryan Shirley — World Travel Map",
        "channel":"Ryan Shirley (@RyanShirley)",
        "blurb":"Every place from Ryan Shirley's entire travel-guide catalog, mapped — with photos, live weather, his picks, and where to book.",
        "videos":len(videos),"places":len(out),"pinned":len(pinned),
        "countries":len(bycountry),"withPhotos":withphoto,
        "topCountries":bycountry.most_common(15),"byContinent":dict(bycont),
    }
    app={"meta":meta,"places":out,"videos":videos}
    json.dump(app,open(os.path.join(DATA,"app.json"),"w"),ensure_ascii=False)
    print(f"app.json: {len(out)} places ({len(pinned)} pinned), {len(bycountry)} countries, {withphoto} with photos, {len(videos)} videos")
    print("continents:",dict(bycont))

if __name__=="__main__": main()
