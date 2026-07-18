#!/usr/bin/env python3
"""Gather MANY more real, on-topic photos per focused place from Wikimedia Commons:
  1. GEOSEARCH within 3 km of the place's coordinates  (photos actually taken there)
  2. keyword search on "name country"                  (on-topic by name)
Filters to real landscape images (no maps/flags/diagrams/SVG), dedupes against the photos
a place already has. Writes data/photos_extra.json {id:[{url,alt,credit}]}; build.py merges
them into each place. Idempotent/resumable. Run: python3 build/photos.py"""
import json, os, re, time, urllib.parse, urllib.request
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE); DATA=os.path.join(ROOT,"data")
UA={"User-Agent":"ryan-shirley-travel-map/1.0 (personal trip planning; ryan-shirley-map project)"}
OUT=os.path.join(DATA,"photos_extra.json")
# Separators matter: Commons titles use spaces, hyphens AND underscores ("Saint-Tropez-Coat-of-Arms.png"),
# so every multi-word term below has to tolerate all three.
CBAD=re.compile(r"(\bmap\b|locator|\bflag\b|coat[-_ ]?of[-_ ]?arms|escudo|blason|wappen|stemma|\bseal\b|\blogo\b"
                r"|diagram|\.svg|\.pdf|\.tif|plan[-_ ]?of|chart|poster|gpx|panorama[-_ ]?sphere|equirectangular)",re.I)
TARGET=10  # extra photos to collect per place (on top of what it already has)

def jget(url):
    for a in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30) as r:
                return json.load(r)
        except Exception: time.sleep(1.5*(a+1))   # backoff — be polite under rate limits
    return {}

def imgs_from_pages(pages):
    out=[]
    for p in sorted(pages,key=lambda p:p.get("index",999)):
        title=p.get("title","")
        if CBAD.search(title): continue
        ii=(p.get("imageinfo") or [{}])[0]
        if (ii.get("mime","").split("/")[0])!="image": continue
        url=ii.get("thumburl") or ii.get("url")
        if not url: continue
        w=ii.get("thumbwidth") or ii.get("width") or 0
        h=ii.get("thumbheight") or ii.get("height") or 0
        if w and h and (w/h)<0.9: continue      # drop tall/skinny; keep square + landscape
        md=ii.get("extmetadata") or {}
        art=re.sub(r"<[^>]+>","",((md.get("Artist") or {}).get("value","") if isinstance(md.get("Artist"),dict) else "")).strip()
        art=re.sub(r"\s+"," ",art or "Wikimedia")[:46]
        lic=((md.get("LicenseShortName") or {}).get("value","") if isinstance(md.get("LicenseShortName"),dict) else "") or "CC"
        alt=re.sub(r"^File:|\.(jpe?g|png|webp)$","",title,flags=re.I).replace("_"," ").strip()
        out.append({"url":url,"alt":alt[:80],"credit":f"Photo: {art} / {lic} (Wikimedia)"})
    return out

def geosearch(lat,lng):
    if lat is None or lng is None: return []
    u="https://commons.wikimedia.org/w/api.php?"+urllib.parse.urlencode({
        "action":"query","generator":"geosearch","ggscoord":f"{lat}|{lng}","ggsradius":3000,
        "ggsnamespace":6,"ggslimit":40,"prop":"imageinfo","iiprop":"url|extmetadata|mime|size",
        "iiurlwidth":1200,"format":"json","origin":"*"})
    d=jget(u); return imgs_from_pages(list((d.get("query",{}).get("pages",{}) or {}).values()))

def keyword(name,country):
    u="https://commons.wikimedia.org/w/api.php?"+urllib.parse.urlencode({
        "action":"query","generator":"search","gsrsearch":f"{name} {country}","gsrnamespace":6,
        "gsrlimit":24,"prop":"imageinfo","iiprop":"url|extmetadata|mime|size","iiurlwidth":1200,
        "format":"json","origin":"*"})
    d=jget(u); return imgs_from_pages(list((d.get("query",{}).get("pages",{}) or {}).values()))

def gather_one(p):
    seen=set(im["url"] for im in (p.get("photos") or []))   # don't repeat existing photos
    pics=[]
    def take(src):
        for im in src:
            if im["url"] in seen: continue
            seen.add(im["url"]); pics.append(im)
            if len(pics)>=TARGET: break
    take(geosearch(p.get("lat"),p.get("lng")))              # photos actually taken there
    if len(pics)<6: take(keyword(p["name"],p.get("country","")))  # only if geosearch was thin
    return p["id"],pics

def main():
    # Sequential + gentle pacing: Wikimedia Commons throttles concurrent requests from one IP,
    # so a single-threaded pass is what reliably returns photos for every place.
    places=json.load(open(os.path.join(DATA,"app.json")))["places"]
    data=json.load(open(OUT)) if os.path.exists(OUT) else {}
    todo=[p for p in places if not data.get(p["id"])]   # empty result = retry (throttling is transient)
    print(f"{len(places)} focused places, {len(data)} cached, {len(todo)} to gather (sequential)",flush=True)
    for i,p in enumerate(todo):
        pid,pics=gather_one(p); data[pid]=pics
        if i%25==0:
            json.dump(data,open(OUT,"w"),ensure_ascii=False)
            print(f"  [{i+1}/{len(todo)}]",flush=True)
        time.sleep(0.15)
    json.dump(data,open(OUT,"w"),ensure_ascii=False)
    tot=sum(len(v) for v in data.values())
    print(f"DONE: {sum(1 for v in data.values() if v)}/{len(data)} got extra photos, {tot} new images",flush=True)

if __name__=="__main__": main()
