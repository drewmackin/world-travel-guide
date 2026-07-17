# 🌍 World Travel Guide — an interactive map of the Mediterranean & beyond

An interactive, satellite-mapped travel guide built from the entire catalogue of travel
YouTuber **[Ryan Shirley](https://www.youtube.com/@RyanShirley)**. Every place he recommends
across his "Top 10 / Top 25 Places to Visit" videos is pinned on a real satellite map — with
photos, live weather, safety, typical prices, flight estimates, and real hotels you can book.

> **Credit & scope.** The place selections and one-line "why go" notes are drawn from Ryan
> Shirley's YouTube travel guides — full credit to him; go watch and subscribe to his channel.
> This is a personal, non-commercial companion project made to plan a trip, not an official
> product. All facts, photos, weather, prices and hotels come from the open sources listed below.

## ✨ What it does

- **1,500+ destinations** from 150+ of Ryan's videos, plus a hand-picked set of extra
  Mediterranean coastal spots — pinned on a **real satellite basemap** that sharpens as you zoom.
- Opens **centered on the Mediterranean** (pan/zoom out for the rest of the world).
- Click any place for a detail panel with:
  - 📸 real photos (from Wikipedia/Wikimedia) + a factual blurb
  - 🌤️ **live weather** (now + 10-day forecast)
  - 🛡️ **safety** — the current **US State Department travel advisory** (Level 1–4)
  - 💰 **typical prices** — daily budget, hotel/night, and a **round-trip flight estimate from Boston**
  - 🎬 links to the exact moment in Ryan's video where it appears
  - 🏨 **real, curated hotels** (budget → luxury) with **Booking + Airbnb** links
- **"Load the town"** — on Mediterranean places, click the button (or zoom in enough) and the map
  drops to street level and plots **every hotel and attraction where it actually is**, each a
  clickable pin.
- A live **"Top in view" leaderboard** that ranks whatever is on screen by how often Ryan features
  it, tagged with a safety dot + cost tier.

## ▶️ Run it locally

No build step or API keys needed — it's plain HTML/CSS/JS.

```bash
cd ryan-shirley-map
python3 -m http.server 8020
# open http://localhost:8020
```

Or just open the self-contained **`dist/index.html`** directly in a browser (everything is inlined).

## 🧱 How it was built

`build/` holds the (Python) pipeline that assembles `data/app.json`:

1. transcripts of every video → extract the ranked list of places
2. de-dupe, geocode (Wikipedia article coords / Nominatim), enrich with photos + facts
3. per-country safety (US State Dept) + typical costs + Boston flight estimates
4. curated, verified hotels per place, then a "town" pass that geolocates hotels + attractions

## 📚 Data sources & licences

- **Place picks & descriptions:** [Ryan Shirley](https://www.youtube.com/@RyanShirley) (YouTube)
- **Satellite imagery:** Esri World Imagery (© Esri, Maxar, Earthstar Geographics)
- **Labels / basemap:** Esri, © OpenStreetMap
- **Photos & facts:** Wikipedia / Wikimedia Commons (CC BY-SA, credited per image)
- **Weather:** [Open-Meteo](https://open-meteo.com) · **Geocoding:** OpenStreetMap Nominatim
- **Safety:** U.S. Department of State travel advisories · **Costs:** public cost-of-living data
- **Maps:** [Leaflet](https://leafletjs.com) + Leaflet.markercluster

Prices and flight figures are **typical estimates** — click the live Booking / Airbnb / flight
links for exact, bookable prices for your dates.

## ⚠️ Notes

Personal, non-commercial fan project. If you're Ryan Shirley and would like anything changed or
removed, just open an issue. 🙏
