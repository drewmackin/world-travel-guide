# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **buildless** interactive travel map (public repo: `world-travel-guide`). Two independent halves:

1. **A Python data pipeline** (`build/`) that assembles many research/enrichment JSON files into a single `data/app.json`.
2. **A static front-end** (`index.html` + `app.js` + `style.css`) that fetches `data/app.json` and renders a Leaflet map.

There is no npm, no bundler, no transpiler, no test framework, and no lint config. Everything is vanilla ES5/ES6 in one `app.js`, plain CSS in one `style.css`, and stdlib-only Python (`urllib`, `json`) in `build/`.

## Commands

```bash
# Serve the app (preview config name: "ryan-map")
python3 -m http.server 8020        # then open http://localhost:8020

# Rebuild data/app.json from all pipeline inputs  (the command you'll run most)
python3 build/build.py

# Inline css/js/app.json into a single shareable dist/index.html
python3 build/bundle.py            # exits non-zero and lists what broke if inlining fails
```

Pipeline scripts, in dependency order. All are **idempotent and resumable** — they skip IDs already present in their output file, so to force a re-fetch you delete that ID's entry (or the whole file):

```bash
python3 build/consolidate.py    # data/extract/<videoId>.json -> places.json + videos.json (dedupes)
python3 build/enrich.py         # Wikipedia summary/lead image/coords + Commons -> enrich.json
python3 build/geocode.py        # Nominatim, country-matched -> geo/geocoded.json (tier A vs C)
python3 build/qa_coords.py      # flag pins outside their continent bbox -> qa_flags.json
python3 build/qa_fix.py         # re-geocode flagged pins with a hard country constraint
python3 build/merge_country.py  # data/country/*.json -> country_profiles.json
python3 build/photos.py         # Commons geosearch+keyword -> photos_extra.json (SEE GOTCHAS)
```

**There are no tests.** Verify changes by serving the app and driving it in a browser (check the console, click a pin, toggle filters).

## Architecture

### Data flow

`build.py` is the single join point. It merges, per place:

- `places.json` — the master place list (id, name, country, kind, why, sources)
- `geo/geocoded.json` + `enrich.json` — coordinates. **Wikipedia article coords win**; Nominatim tier-A is the fallback. A place only becomes a map pin (`pinned: true`) if it has trustworthy coords — this is deliberate, so bad geocodes silently drop off the map instead of showing a wrong location.
- `enrich.json` + `photos_extra.json` — photos (merged and deduped by URL)
- `country_profiles.json` + `curate/country_extra.json` — per-**country** safety (US State Dept advisory level), costs, flights, and the richer cost/safety detail
- `hotels/<id>.json` and `town/<id>.json` — curated stays; `town/` also carries geolocated hotels + attractions and **overrides** `hotels/` where present

Output: `data/app.json` (`{meta, places[], videos[]}`) plus `data/app.full.json`, an unfiltered backup of every place.

### World + collections model (read this before touching build.py)

The app ships the **whole world**: every place with trustworthy coordinates (`pinned`), currently ~1,509 across 121 countries. On top of that, three hand-curated **collections** are tagged via `zone` and exposed as one-click filters:

| zone | what | source of truth |
|---|---|---|
| `med` | Mediterranean **coastal** spots | `curate/tags_med_*.json` — `coastal:true` only |
| `fr` | small charming French towns | `places.json` entries with `bucket: "fr-charming"` |
| `sa` | exotic **and safe** South America | `curate/tags_sa.json` — `keep:true` (advisory ≤ 2) |

Everything else has `zone: null` and is reached via the **continent** and **country** facets. `continent` is computed for every place from the `CONTINENT` map — if a country is missing there it falls into `"Other"`, which is why that map is long; add new countries to it rather than letting them land in `Other`.

Two flags drive the UI:
- **`icon`** — set when a Med place's `fame >= POPULAR_HIDE_AT` (currently 4): the overrun icons (Santorini, Amalfi, Cinque Terre…). They stay in the data but are **hidden by default**; the "Show famous spots" toggle reveals them, and an explicit text search bypasses the gate so they're still findable by name. Surfacing lesser-known places is deliberate — don't "fix" it by unhiding them.
- **`curTag`** — the curated one-line reason to go.

**Duplicate merging.** The same real place was often extracted from several videos under slightly different names ("Balos Beach"/"Balos Lagoon", three "Iguazu Falls"). Ids are unique so nothing caught them and they stacked identical pins. `dedupe_places()` merges entries whose *stem* (name minus generic geo words) matches and that sit within ~20 km, unioning photos/stays/sources and recording `mergedFrom`. It prints every merge — read that output when a place count changes unexpectedly.

⚠️ **`data/curate/` is gitignored but `build.py` depends on it.** `data/app.json` is committed; the curation tags are not. Running `build.py` in a fresh clone still produces the whole world, but the three collections will be empty. Don't rebuild from a clone expecting identical output.

### Front-end (`app.js`)

- **Map:** Leaflet 1.9.4 + Leaflet.markercluster, Esri **World Imagery** satellite tiles with a boundaries/labels overlay. Markers are `circleMarker`s colored by `continent`. Cluster drill-in is driven by our own `clusterclick` handler with `zoomToBoundsOnClick:false` — see the animation gotcha below.
- **Filtering:** a single `FILT = {q, loc:Set, safety, price, famous}` object and one predicate, `matches(p)`. `loc` holds prefixed keys — `z:<collection>`, `k:<continent>`, `c:<country>`. Every view (markers, the "Top in view" leaderboard, the count, **and the search dropdown**) filters through `matches`, so they can never disagree. **Location facets OR within themselves; facet *types* AND together** — that's what makes "Brazil OR Mediterranean, AND safe" return a sensible set. Call `applyFilters()` after mutating `FILT`.
- **Panel:** `openPlace(id)` builds the whole detail panel as one HTML string (photos, weather, safety, costs, stays, videos).
- **Town mode:** `loadTown(p)` drops to street level and plots each hotel/attraction at its real coordinates.
- **Weather** is fetched on demand from Open-Meteo when a panel opens — not baked into `app.json`.

## Gotchas (all of these cost real debugging time)

- **Use Leaflet, not MapLibre.** MapLibre GL's Web Worker is blocked in both the preview pane and Chrome here — the style never loads and the map renders black. This is why the app uses Leaflet.
- **Animated map moves silently no-op.** `flyTo`, and `fitBounds`/`setView` with animation, do nothing in this environment. Always pass `{animate:false}`. This bit markercluster too: its built-in `zoomToBoundsOnClick` uses animated moves, so the group is constructed with `zoomToBoundsOnClick:false` and we zoom ourselves in a `clusterclick` handler. Note `CLUSTER.fire('clusterclick', …)` does **not** invoke that handler — to test it, dispatch a real click on a `.cluster-ic` element.
- **`photos.py` must stay single-threaded.** Wikimedia Commons hard-rate-limits concurrent requests from one IP — 6 and 3 ThreadPool workers both got throttled to *zero* results for most places. Sequential works; it still throttles after ~270 requests, so just re-run it later to pick up stragglers. Its resume logic now treats an **empty** cached result as "retry" (`not data.get(id)`), so throttled places are picked up automatically instead of being cached as permanently photo-less.
- **Cache-busting:** `index.html` loads `app.js?v=N` and `style.css?v=N` — **bump `N` when you edit either file** or the browser serves a stale copy.
- **`bundle.py` is coupled to app.js's fetch line.** It rewrites `DATA=await fetch('data/app.json…)` into `DATA=window.__APP__;`. If you reword that line the rewrite silently misses and the bundle ships broken — which already happened once. `bundle.py` now asserts the result and **exits non-zero** on failure, so trust its exit code, not just its output. It also injects css/js/json through *callable* replacements, because passing them as `re.sub` replacement strings reinterprets backslash escapes.
- **The `hidden` attribute loses to a CSS `display` rule.** Any element toggled via `el.hidden` that also has `display` set in a class needs an explicit `[hidden]{display:none}` rule.
- **Wikipedia lead images are sometimes locator maps** (e.g. `Pontine_Islands_map.png`). `build.py`'s `MAPRE` / `is_maplike()` filter drops them so a map never becomes a hero image — keep that filter when touching photo merging.
- **Pushing:** the `gh`/git CLI push fails on auth in this environment. Commit locally, then push via the GitHub Desktop app.

## Data honesty conventions

This project exists so its owner can actually book a trip from it, so accuracy beats completeness:

- **Never invent** hotel names, prices, coordinates, or availability. Curation agents are instructed to omit anything they can't verify, and a verify pass drops what doesn't hold up.
- Prices and flight figures are framed as **typical/approximate ranges**; exact figures come from the live Booking/Airbnb/Skyscanner links, which are generated client-side from the place name.
- Safety is the **US State Department advisory level** for the country, labeled as such — not a vibe.
- Editorial additions carry a source with no URL so the panel renders "Editor's pick" instead of implying a video citation. This covers the 28 added Mediterranean coastal spots; the 32 `fr` charming-French-town entries currently have an **empty** `sources` array and so render no provenance line at all — worth fixing if you touch that data.
- Place selections and the "why go" notes are drawn from YouTuber **Ryan Shirley**'s travel guides; the README credits him prominently and frames this as a personal, non-commercial companion project. Keep that attribution intact.
