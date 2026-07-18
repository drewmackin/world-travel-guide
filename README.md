# 🌍 World Travel Guide

An interactive, satellite-mapped travel guide covering **1,500+ places across 121 countries and
every continent** — built from the entire catalogue of travel YouTuber
**[Ryan Shirley](https://www.youtube.com/@RyanShirley)**. Every place is pinned on real satellite
imagery with photos, live weather, safety, typical prices and — where curated — real hotels you
can book. A search box and stackable filters let you cut the world down to exactly the kind of
place you're looking for.

> **Credit & scope.** The place selections and the one-line "why go" notes are drawn from Ryan
> Shirley's YouTube travel guides — full credit to him; go watch and subscribe to his channel.
> This is a personal, non-commercial companion project made to plan a trip, not an official
> product. All facts, photos, weather, prices and hotels come from the open sources listed below.

## ✨ What it does

- **1,509 destinations, 121 countries, all continents**, pinned on a **real satellite basemap**
  that sharpens as you zoom, with clustering that drills in as you click.
- **Search + stack filters, in any combination.** Every filter reflects a real data field:
  - 🌍 **Continent** — Europe · Asia · Africa · N. America · S. America · Oceania
  - 🏳️ **Country** — all 121, searchable
  - ✦ **Curated collections** — hand-picked sets layered on top of the world map:
    **Mediterranean coast** (261 coastal spots), **Charming France** (32 small towns and villages),
    **Exotic & safe South America** (50 places, US State Dept advisory Level 1–2 only)
  - 🛡️ **Safety** — Any / Safe (advisory 1–2) / Safest (advisory 1)
  - 💰 **Price** — max cost tier ($ → $$$)
  - Location filters **OR** together, then **AND** with safety and price — so *"Brazil **or** the
    Mediterranean, **and** safe"* works and a live count updates as you go.
- **Famous spots are hidden by default.** The 82 most overrun icons (Santorini, Amalfi, Cinque
  Terre…) are tucked behind a **"Show famous spots"** toggle so lesser-known places surface first —
  though you can still find any of them by name in the search box.
- Click any place for a detail panel with:
  - 📸 **photos** in a swipeable gallery (7,500+ images, ~5 per place; 10–13 across the curated collections)
  - 🌤️ **live weather** (now + 10-day forecast)
  - 🛡️ **safety** — the **US State Dept advisory** (Level 1–4), plus concrete solo-travel tips,
    common scams, emergency number and tap-water guidance for the country
  - 💰 **costs** — daily budget, hotel/night, round-trip flight from Boston, and everyday prices
    (a meal, beer, coffee, transit, taxi, tourist SIM)
  - 🎬 links to the exact moment in Ryan's video where it appears
  - 🏨 **real, curated places to stay** (500 destinations covered) with **Booking + Airbnb** links
- **"Load the town"** — on covered places, click the button (or zoom in enough) and the map drops
  to street level and plots **every hotel and sight where it actually is**, each a clickable pin.
- A live **"Top in view" leaderboard** ranking whatever is on screen, tagged with a safety dot and
  cost tier.

## ▶️ Run it locally

No build step, no dependencies, no API keys — it's plain HTML/CSS/JS.

```bash
cd world-travel-guide
python3 -m http.server 8020
# open http://localhost:8020
```

Or just open the self-contained **`dist/index.html`** directly in a browser — all the data is
embedded, so it works from `file://` with no server (it only needs internet for map tiles).

## 🧱 How it was built

`build/` holds the (Python, stdlib-only) pipeline that assembles `data/app.json`:

1. transcripts of every video → extract the ranked list of places
2. de-dupe, geocode (Wikipedia article coords / Nominatim), enrich with photos + facts
3. per-country safety (US State Dept) + typical costs + Boston flight estimates
4. curated, verified hotels per place, then a "town" pass that geolocates hotels + sights
5. `photos.py` gathers many more real, on-topic images per place from Wikimedia Commons
   (geosearch within 3 km of the coordinates, plus keyword search)
6. a curation pass tags the Mediterranean coastal set, the charming French towns and the
   exotic-but-safe South American set, and rates how crowded each Mediterranean spot is
7. `build.py` merges it all, drops non-photo imagery (locator maps, coats of arms), and merges
   duplicate entries for the same real place

**Reliability rule:** a place only becomes a map pin if it has trustworthy coordinates (a Wikipedia
article coordinate, or a country-matched geocode). Anything ambiguous is left off rather than
shown in the wrong place.

## 📚 Data sources & licences

- **Place picks & descriptions:** [Ryan Shirley](https://www.youtube.com/@RyanShirley) (YouTube)
- **Satellite imagery:** Esri World Imagery (© Esri, Maxar, Earthstar Geographics)
- **Labels / boundaries:** Esri, © OpenStreetMap
- **Photos & facts:** Wikipedia / Wikimedia Commons (CC BY-SA, credited per image)
- **Weather:** [Open-Meteo](https://open-meteo.com) · **Geocoding:** OpenStreetMap Nominatim
- **Safety:** U.S. Department of State travel advisories · **Costs:** public cost-of-living data
- **Maps:** [Leaflet](https://leafletjs.com) + Leaflet.markercluster

Prices and flight figures are **typical estimates**, not quotes — click the live Booking / Airbnb /
flight links for exact prices for your dates.

## ⚠️ Notes

Coverage is deepest across the curated collections (Mediterranean, France, South America), which
have the most photos and the hotel data; the rest of the world has the place, its photos, weather,
safety and cost figures, and live booking links.

Personal, non-commercial fan project. If you're Ryan Shirley and would like anything changed or
removed, just open an issue. 🙏
