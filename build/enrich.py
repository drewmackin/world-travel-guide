#!/usr/bin/env python3
"""Enrich every place with RELIABLE, on-topic data:
  1. Wikipedia search (name+country) -> best article title
  2. Wikipedia REST summary -> factual blurb, LEAD IMAGE (guaranteed on-topic), exact coords, article url
  3. Wikimedia Commons search -> up to 2 extra real images
Writes data/enrich.json {id:{photos:[{url,alt,credit}], factual, wiki, lat, lng, coordSrc}}.
Idempotent/resumable. Run: python3 build/enrich.py"""
import json, os, re, time, urllib.parse, urllib.request, sys
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE); DATA=os.path.join(ROOT,"data")
UA={"User-Agent":"ryan-shirley-travel-map/1.0 (personal trip planning; ryan-shirley-map project)"}
OUT=os.path.join(DATA,"enrich.json")
WBAD=re.compile(r"(disambiguation|list of|may refer to)",re.I)
CBAD=re.compile(r"(map|locator|flag|coat of arms|escudo|seal|logo|diagram|\.svg|\.pdf|plan of|chart|poster)",re.I)

def jget(url):
    for _ in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=25) as r:
                return json.load(r)
        except Exception: time.sleep(1.2)
    return {}

def wiki_title(name,country):
    d=jget("https://en.wikipedia.org/w/api.php?"+urllib.parse.urlencode({
        "action":"query","list":"search","srsearch":f"{name} {country}","srlimit":3,
        "format":"json","origin":"*"}))
    hits=(d.get("query",{}) or {}).get("search",[]) or []
    for h in hits:
        if not WBAD.search(h.get("title","")): return h["title"]
    return hits[0]["title"] if hits else None

def wiki_summary(title):
    d=jget("https://en.wikipedia.org/api/rest_v1/page/summary/"+urllib.parse.quote(title.replace(" ","_"),safe=""))
    if not d or d.get("type")=="disambiguation": return None
    return d

def commons_imgs(name,country,want=2):
    d=jget("https://commons.wikimedia.org/w/api.php?"+urllib.parse.urlencode({
        "action":"query","generator":"search","gsrsearch":f"{name} {country}","gsrnamespace":6,
        "gsrlimit":12,"prop":"imageinfo","iiprop":"url|extmetadata|mime|size","iiurlwidth":1200,
        "format":"json","origin":"*"}))
    pages=list((d.get("query",{}).get("pages",{}) or {}).values()); pages.sort(key=lambda p:p.get("index",999))
    out=[]
    for p in pages:
        if CBAD.search(p.get("title","")): continue
        ii=(p.get("imageinfo") or [{}])[0]
        if ii.get("mime","").split("/")[0]!="image": continue
        url=ii.get("thumburl") or ii.get("url");
        if not url: continue
        w=ii.get("thumbwidth") or 0; h=ii.get("thumbheight") or 0
        if w and h and w/h<0.9: continue
        md=ii.get("extmetadata") or {}
        art=re.sub(r"<[^>]+>","",((md.get("Artist") or {}).get("value","") if isinstance(md.get("Artist"),dict) else "")).strip()
        art=re.sub(r"\s+"," ",art or "Wikimedia")[:46]
        lic=((md.get("LicenseShortName") or {}).get("value","") if isinstance(md.get("LicenseShortName"),dict) else "") or "CC"
        alt=re.sub(r"^File:|\.(jpe?g|png|webp)$","",p.get("title",""),flags=re.I).replace("_"," ").strip()
        out.append({"url":url,"alt":alt[:80],"credit":f"Photo: {art} / {lic} (Wikimedia)"})
        if len(out)>=want: break
    return out

def first_sentences(t,n=2):
    t=re.sub(r"\s+"," ",(t or "").strip()); parts=re.split(r"(?<=[.!?])\s",t)
    return " ".join(parts[:n])[:320]

def enrich_one(name,country):
    rec={"photos":[],"factual":"","wiki":"","lat":None,"lng":None,"coordSrc":""}
    title=wiki_title(name,country)
    if title:
        s=wiki_summary(title)
        if s:
            rec["factual"]=first_sentences(s.get("extract",""))
            rec["wiki"]=(s.get("content_urls",{}) or {}).get("desktop",{}).get("page","")
            co=s.get("coordinates") or {}
            if co.get("lat") is not None:
                rec["lat"]=co["lat"]; rec["lng"]=co["lon"]; rec["coordSrc"]="wikipedia"
            th=s.get("originalimage") or s.get("thumbnail") or {}
            if th.get("source"):
                rec["photos"].append({"url":th["source"],"alt":title,"credit":f"Wikipedia: {title}"})
    # extra images from Commons
    for im in commons_imgs(name,country):
        if im["url"] not in {p["url"] for p in rec["photos"]}:
            rec["photos"].append(im)
    return rec

def main():
    places=json.load(open(os.path.join(DATA,"places.json")))
    data=json.load(open(OUT)) if os.path.exists(OUT) else {}
    todo=[p for p in places if p["id"] not in data]
    print(f"{len(places)} places, {len(data)} cached, {len(todo)} to enrich")
    withph=wc=0
    for i,p in enumerate(todo):
        r=enrich_one(p["name"],p.get("country",""))
        data[p["id"]]=r
        if r["photos"]: withph+=1
        if r["coordSrc"]: wc+=1
        if i%25==0:
            json.dump(data,open(OUT,"w"),ensure_ascii=False)
            print(f"  [{i+1}/{len(todo)}] withPhotos={withph} wikiCoords={wc}",flush=True)
        time.sleep(0.2)
    json.dump(data,open(OUT,"w"),ensure_ascii=False)
    wp=sum(1 for v in data.values() if v["photos"]); tot=sum(len(v["photos"]) for v in data.values())
    fc=sum(1 for v in data.values() if v["factual"])
    print(f"DONE: {wp}/{len(data)} have photos ({tot} imgs), {fc} have factual blurbs.")

if __name__=="__main__": main()
