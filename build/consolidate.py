#!/usr/bin/env python3
"""Merge data/extract/<videoId>.json (from the extraction workflow) into a deduped master
places.json + videos.json. A place seen in multiple videos keeps all its sources.
Run: python3 build/consolidate.py"""
import json, os, glob, re, unicodedata
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE); DATA=os.path.join(ROOT,"data")

ALIAS={"usa":"United States","us":"United States","united states of america":"United States",
 "america":"United States","uk":"United Kingdom","britain":"United Kingdom","great britain":"United Kingdom",
 "england":"United Kingdom","czechia":"Czech Republic","uae":"United Arab Emirates","holland":"Netherlands",
 "the netherlands":"Netherlands","bosnia":"Bosnia and Herzegovina","macedonia":"North Macedonia"}
def normc(c):
    c=(c or "").strip(); return ALIAS.get(c.lower(), c)
def slug(s):
    s=unicodedata.normalize("NFKD",s or "").encode("ascii","ignore").decode()
    return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")

def key(name,country):
    return slug(country)+"__"+slug(name)

def main():
    files=sorted(glob.glob(os.path.join(DATA,"extract","*.json")))
    places={}; videos=[]
    for f in files:
        try: v=json.load(open(f))
        except Exception as e: print("skip",f,e); continue
        vid={"videoId":v.get("videoId",""),"title":v.get("title",""),"url":v.get("url",""),
             "primaryCountry":v.get("primaryCountry",""),"nPlaces":len(v.get("places",[]))}
        videos.append(vid)
        for pl in v.get("places",[]):
            name=(pl.get("name") or "").strip()
            country=normc(pl.get("country") or v.get("primaryCountry") or "")
            if not name: continue
            k=key(name,country)
            src={"videoId":vid["videoId"],"title":vid["title"],"url":vid["url"],
                 "timestamp":pl.get("timestamp",""),"rank":pl.get("rank")}
            if k not in places:
                places[k]={"id":k,"name":name,"country":country,"region":pl.get("region",""),
                    "kind":pl.get("kind",""),"why":pl.get("why",""),
                    "highlights":list(pl.get("highlights") or []),
                    "hotelsMentioned":list(pl.get("hotelsMentioned") or []),
                    "sources":[src]}
            else:
                P=places[k]
                if len(pl.get("why","") )>len(P["why"]): P["why"]=pl["why"]
                for h in (pl.get("highlights") or []):
                    if h not in P["highlights"]: P["highlights"].append(h)
                for h in (pl.get("hotelsMentioned") or []):
                    if h not in P["hotelsMentioned"]: P["hotelsMentioned"].append(h)
                if not P["region"] and pl.get("region"): P["region"]=pl["region"]
                if not P["kind"] and pl.get("kind"): P["kind"]=pl["kind"]
                P["sources"].append(src)
    out=list(places.values())
    json.dump(out,open(os.path.join(DATA,"places.json"),"w"),ensure_ascii=False)
    json.dump(videos,open(os.path.join(DATA,"videos.json"),"w"),ensure_ascii=False)
    from collections import Counter
    cc=Counter(p["country"] for p in out)
    print(f"CONSOLIDATED: {len(videos)} videos, {len(out)} unique places, {len(cc)} countries.")
    print("top countries:", cc.most_common(12))
    multi=sum(1 for p in out if len(p["sources"])>1)
    print(f"places featured in >1 video: {multi}")

if __name__=="__main__": main()
