# @worldwideview/wwv-plugin-railway-stations

WorldWideView plugin — Railway station locations worldwide.

## Usage

This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:

- **ID:** `railway-stations`
- **Category:** Infrastructure
- **Format:** static

## Data Sources

Feature coordinates and metadata come from **OpenStreetMap** via the **Overpass API** (query: `node["railway"="station"]`, only nodes with a `name` tag), made available under the [ODbL license](https://www.openstreetmap.org/copyright).

Each feature is a Point with the following properties when present on the source node:

- `name` (required)
- `station_code` — station code, if tagged
- `public_transport` — `station`/`stop_position`/etc., if tagged
- `operator` — station operator, if tagged
- `railway` — tag value (usually `station`)

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:

```bash
npm install @worldwideview/wwv-plugin-railway-stations
```

## Architecture

This plugin adheres to the WorldWideView standard plugin structure. As a `static` plugin, it connects to the core Event Bus and renders map capabilities. The GeoJSON FeatureCollection is baked into `data/data.json` and raw-imported at runtime by an `AutoStaticPlugin` class (same pattern as `wwv-plugin-lighthouses`).

## Data Integrity

Run the fail-closed validator to check the data file:

```bash
node scripts/verify-data.mjs
```

Exits `0` on pass, `1` on any anomaly (FeatureCollection shape, Point geometries, coordinate ranges, required properties, duplicate ids).

## Refreshing Data

Re-query OpenStreetMap and regenerate `data/data.json`:

```bash
node scripts/fetch-data.mjs
```

The script queries the Overpass API per world region (`node["railway"="station"]["name"]`), de-dupes by OSM id, and deterministically samples (sort by name, keep every 3rd) to stay under the 9 MB bundle gate. Raw region responses are cached in `temp/.cache` (gitignored), so an interrupted run resumes without re-querying. It is fail-closed: `data.json` is only written if the resulting feature count drifts less than 2% from the last published count and the file stays under 9 MB. After a successful refresh, re-run `node scripts/verify-data.mjs` to confirm integrity.

---
*Built for WorldWideView.*
