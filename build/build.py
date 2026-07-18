#!/usr/bin/env python3
"""Assemble places.json + geo/geocoded.json + enrich.json + videos.json -> data/app.json
for the Ryan Shirley world travel map. Booking links are generated client-side."""
import json, os, re
from collections import Counter, defaultdict
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE); DATA=os.path.join(ROOT,"data")

def load(p,d):
    fp=os.path.join(DATA,p)
    return json.load(open(fp)) if os.path.exists(fp) else d

# Some Wikipedia lead images are locator maps (e.g. "Pontine_Islands_map.png") — keep them out of the gallery.
MAPRE=re.compile(r"(location[_ -]?map|locator|[_-]map[._-]|[_-]map$|\.svg|karte|topograph|orthographic|\bmapa\b"
                 r"|coat[-_ ]?of[-_ ]?arms|blason|escudo|wappen|stemma|[-_]flag[._-]|[-_]seal[._-]|[-_]logo[._-])",re.I)
def is_maplike(im):
    s=(str(im.get("url",""))+" "+str(im.get("alt",""))).lower()
    return bool(MAPRE.search(s))

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
 "South Georgia":"South America","Suriname":"South America",
 # additions so nothing falls into "Other" (continent drives the world filters)
 "Vatican City":"Europe","Vatican":"Europe","San Marino":"Europe","Belarus":"Europe","Georgia":"Europe",
 "Cyprus":"Europe","Moldova":"Europe","Andorra":"Europe","Gibraltar":"Europe",
 "Saudi Arabia":"Asia","Yemen":"Asia","Bangladesh":"Asia","Pakistan":"Asia","Afghanistan":"Asia",
 "Uzbekistan":"Asia","Kyrgyzstan":"Asia","Kazakhstan":"Asia","Myanmar":"Asia","Laos":"Asia",
 "Qatar":"Asia","Kuwait":"Asia","Bahrain":"Asia","Lebanon":"Asia","Taiwan":"Asia","Mongolia":"Asia",
 "Greenland":"North America","Puerto Rico":"North America","Bahamas":"North America",
 "Saint Lucia":"North America","Aruba":"North America","Barbados":"North America",
 "Dominican Republic":"North America","Haiti":"North America","Nicaragua":"North America",
 "Honduras":"North America","Trinidad and Tobago":"North America","Curaçao":"North America",
 "Democratic Republic of the Congo":"Africa","Central African Republic":"Africa",
 "São Tomé and Príncipe":"Africa","Chad":"Africa","Mauritania":"Africa","Algeria":"Africa",
 "Angola":"Africa","Mozambique":"Africa","Malawi":"Africa","Ghana":"Africa","Senegal":"Africa",
 "Cape Verde":"Africa","Réunion":"Africa","Comoros":"Africa","Sudan":"Africa","Libya":"Africa",
 "Cook Islands":"Oceania","New Caledonia":"Oceania","Vanuatu":"Oceania","Samoa":"Oceania",
 "Papua New Guinea":"Oceania","Solomon Islands":"Oceania","Tonga":"Oceania","Palau":"Oceania",
}
def continent(c):
    c=(c or "").strip()
    if c in CONTINENT: return CONTINENT[c]
    for k,v in CONTINENT.items():
        if k.lower() in c.lower(): return v
    return "Other"

# ---- duplicate merging -------------------------------------------------------
# The same real location was extracted from several videos under slightly different names
# ("Balos Beach"/"Balos Lagoon", "Elafonissi"/"Elafonisi", "Iguazu Falls" x3). Ids are unique so
# nothing caught them; they stack identical pins and double-count the destination total.
# Rule: same *stem* (name minus generic geo words) AND within ~20 km -> one place.
GEOWORDS={"beach","beaches","island","islands","isle","lagoon","cave","caves","falls","fall","bay",
          "cove","national","park","the","of","di","de","del","la","le","les","el","a","and"}
def _stem(name):
    ws=[w for w in re.sub(r"[^a-z0-9]+"," ",(name or "").lower()).split() if w and w not in GEOWORDS]
    return " ".join(ws)
def _near(a,b,deg=0.2):     # ~20 km
    return abs(a["lat"]-b["lat"])<=deg and abs(a["lng"]-b["lng"])<=deg
def _close_names(a,b):
    if a==b or (a and b and (a in b or b in a)): return True
    if abs(len(a)-len(b))>1: return False           # cheap edit-distance<=1 for spelling variants
    i=0
    while i<min(len(a),len(b)) and a[i]==b[i]: i+=1
    ra,rb=a[i:],b[i:]
    return ra[1:]==rb or ra==rb[1:] or ra[1:]==rb[1:]
def _richness(p):
    return (len(p.get("photos") or []), len(p.get("stays") or []), len(p.get("sources") or []))
def dedupe_places(ps):
    groups={}
    for p in ps: groups.setdefault(_stem(p.get("name","")), []).append(p)
    kept,merged=[],0
    for stem,items in groups.items():
        if not stem or len(items)==1: kept.extend(items); continue
        clusters=[]
        for p in items:
            for c in clusters:
                if _near(c[0],p) and _close_names(stem,_stem(p.get("name",""))): c.append(p); break
            else: clusters.append([p])
        for c in clusters:
            if len(c)==1: kept.append(c[0]); continue
            c.sort(key=_richness, reverse=True)
            primary, dups = c[0], c[1:]
            seen={x.get("url") for x in (primary.get("photos") or [])}
            for d in dups:
                for x in (d.get("photos") or []):
                    if x.get("url") and x["url"] not in seen:
                        primary.setdefault("photos",[]).append(x); seen.add(x["url"])
                have={(s.get("name") or "").lower() for s in (primary.get("stays") or [])}
                for s in (d.get("stays") or []):
                    if (s.get("name") or "").lower() not in have:
                        primary.setdefault("stays",[]).append(s); have.add((s.get("name") or "").lower())
                srcs={json.dumps(s,sort_keys=True) for s in (primary.get("sources") or [])}
                for s in (d.get("sources") or []):
                    if json.dumps(s,sort_keys=True) not in srcs:
                        primary.setdefault("sources",[]).append(s); srcs.add(json.dumps(s,sort_keys=True))
                if not primary.get("attractions") and d.get("attractions"):
                    primary["attractions"]=d["attractions"]; primary["town"]=True
            primary["mergedFrom"]=[d["id"] for d in dups]
            merged+=len(dups)
            print(f"  merged {len(dups)} duplicate(s) into {primary['id']}: {[d['id'] for d in dups]}")
            kept.append(primary)
    if merged: print(f"dedupe: merged {merged} duplicate place entries")
    return kept

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
    # curation tags: coastal+fame (Mediterranean) / exotic+safe+keep (South America)
    curtag={}
    for f in _glob.glob(os.path.join(DATA,"curate","tags_med_*.json")):
        for t in json.load(open(f)): curtag[t["id"]]={**t,"_med":True}
    saf=os.path.join(DATA,"curate","tags_sa.json")
    if os.path.exists(saf):
        for t in json.load(open(saf)): curtag[t["id"]]={**t,"_sa":True}
    POPULAR_HIDE_AT=4  # fame >= this = famous/overrun spot, hidden unless "Show famous spots" is on
    photos_extra=load("photos_extra.json",{})            # many more real images per place
    country_extra=load("curate/country_extra.json",{})   # richer cost + safety detail per country
    out=[]
    for p in places:
        g=geo.get(p["id"]) or {}; e=enrich.get(p["id"]) or {}
        # Prefer Wikipedia's exact article coordinates (on-topic, correct); else Nominatim tier-A.
        if e.get("coordSrc")=="wikipedia" and e.get("lat") is not None:
            lat=e["lat"]; lng=e["lng"]; tier="A"
        else:
            lat=g.get("lat"); lng=g.get("lng"); tier=g.get("tier","C")
        pinned=(lat is not None and lng is not None and tier=="A")   # 0.0 is a real coordinate
        cc=p.get("country","")                          # multi-country places -> use the first
        prof=profiles.get(cc) or profiles.get(cc.split(" / ")[0]) or {}
        cx=country_extra.get(cc) or country_extra.get(cc.split(" / ")[0]) or {}
        # merge many more photos (deduped by url) onto the enrich lead+commons images
        ph=list(e.get("photos",[])); seenu={x.get("url") for x in ph}
        for x in photos_extra.get(p["id"],[]):
            if x.get("url") and x["url"] not in seenu: ph.append(x); seenu.add(x["url"])
        ph=[x for x in ph if not is_maplike(x)]              # drop locator-map images
        out.append({**p,
            "lat":lat,"lng":lng,"pinned":pinned,"continent":continent(p.get("country","")),
            "photos":ph,"factual":e.get("factual",""),"wiki":e.get("wiki",""),
            "advisory":prof.get("advisory"),"safetyIndex":prof.get("safetyIndex"),
            "safetySummary":prof.get("safetySummary",""),"costTier":prof.get("costTier"),
            "costDetail":cx.get("costDetail"),"safetyDetail":cx.get("safetyDetail"),
            "dailyBudgetUSD":prof.get("dailyBudgetUSD"),"dailyMidUSD":prof.get("dailyMidUSD"),
            "hotelBudgetUSD":prof.get("hotelBudgetUSD"),"hotelMidUSD":prof.get("hotelMidUSD"),
            "airport":prof.get("mainAirport"),"flightRT":prof.get("flightFromBostonRT_USD"),
            "flightNote":prof.get("flightNote",""),
            "stays":(town_by_id.get(p["id"],{}).get("hotels") or stays_by_id.get(p["id"],[])),
            "attractions":town_by_id.get(p["id"],{}).get("attractions",[]),
            "town":bool(town_by_id.get(p["id"])),
        })
    # ---- FOCUS: Mediterranean coastal gems + exotic/safe South America ----
    # The complete unfiltered assembly is preserved in app.full.json (regeneration/backup).
    for p in out:
        t=curtag.get(p["id"]) or {}
        zone=None; icon=False
        if t.get("_med") and t.get("coastal"):
            zone="med"; p["fame"]=t.get("fame"); p["coastal"]=True; p["curTag"]=t.get("tagline","")
            icon=(t.get("fame") or 0)>=POPULAR_HIDE_AT
        elif t.get("_sa") and t.get("keep"):
            zone="sa"; p["exotic"]=t.get("exotic"); p["curTag"]=t.get("tagline","")
        elif p.get("bucket")=="fr-charming":
            zone="fr"; p["curTag"]=p.get("why","")            # small charming French towns
        p["zone"]=zone; p["icon"]=icon
    full_app={"meta":{"title":"Ryan Shirley — World Travel Map (full)","places":len(out)},
              "places":out,"videos":videos}
    json.dump(full_app,open(os.path.join(DATA,"app.full.json"),"w"),ensure_ascii=False)

    # The app ships the WHOLE WORLD: every place with trustworthy coordinates.
    # The curated collections (Mediterranean coast / charming France / exotic-safe South America)
    # survive as `zone` tags so they stay one-click filters on top of the world map.
    world=dedupe_places([p for p in out if p["pinned"]])
    med=[p for p in world if p.get("zone")=="med"]; sa=[p for p in world if p.get("zone")=="sa"]
    fr=[p for p in world if p.get("zone")=="fr"]
    default_vis=[p for p in world if not p["icon"]]
    bycountry=Counter(p["country"] for p in world if p["country"])
    bycont=Counter(p["continent"] for p in world)
    totphotos=sum(len(p["photos"]) for p in world)
    withphoto=sum(1 for p in world if p["photos"])
    withstays=sum(1 for p in world if p.get("stays"))
    meta={
        "title":"World Travel Guide — every place, mapped",
        "channel":"Ryan Shirley (@RyanShirley)",
        "blurb":"Every place from Ryan Shirley's travel guides, mapped worldwide — with photos, live weather, safety, prices and where to stay. Search and stack filters (place · country · continent · safety · price), plus hand-curated collections for the Mediterranean coast, charming France and exotic-but-safe South America.",
        "videos":len(videos),"places":len(world),"pinned":len(world),
        "med":len(med),"sa":len(sa),"fr":len(fr),
        "defaultVisible":len(default_vis),"famous":len(world)-len(default_vis),
        "countries":len(bycountry),"withPhotos":withphoto,"withStays":withstays,
        "totalPhotos":totphotos,"byContinent":dict(bycont),"topCountries":bycountry.most_common(15),
    }
    app={"meta":meta,"places":world,"videos":videos}
    json.dump(app,open(os.path.join(DATA,"app.json"),"w"),ensure_ascii=False)
    print(f"app.json (WORLD): {len(world)} places across {len(bycountry)} countries")
    print(f"  continents: {dict(bycont)}")
    print(f"  curated collections — Med {len(med)} / France {len(fr)} / S.America {len(sa)}; "
          f"famous(hidden by default) {len(world)-len(default_vis)}")
    print(f"  {totphotos} photos ({round(totphotos/max(1,len(world)),1)}/place avg), {withstays} places with stays")
    print(f"app.full.json (backup incl. unpinned): {len(out)} places")

if __name__=="__main__": main()
