# @worldwideview/wwv-plugin-power-grid-substations

WorldWideView plugin — Electrical power grid substations worldwide.

## Usage

This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:

- **ID:** `power-grid-substations`
- **Category:** Infrastructure
- **Format:** static

## Data Sources

Feature coordinates and metadata come from **OpenStreetMap** via the Overpass API (ODbL):

> © OpenStreetMap contributors — https://www.openstreetmap.org/copyright

Queried `node["power"="substation"]` and `way["power"="substation"]` (using the way's center point via `out center`), keeping features with a `name` tag first, then deterministically sampling unnamed substations to fit the plugin size budget. Properties kept: `name`, `voltage`, `operator`, `substation`, and the OSM element `id`.

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:

```bash
npm install @worldwideview/wwv-plugin-power-grid-substations
```

## Architecture

This plugin adheres to the WorldWideView standard plugin structure. As a `static` plugin, it connects to the core Event Bus and renders map capabilities. The GeoJSON FeatureCollection is baked into `data/data.json` and raw-imported at runtime by an `AutoStaticPlugin` class (same pattern as `wwv-plugin-data-centers`).

## Data Integrity

Run the fail-closed validator to check the data file:

```bash
node scripts/verify-data.mjs
```

Exits `0` on pass, `1` on any anomaly (FeatureCollection shape, Point geometries, coordinate ranges, required properties, duplicate ids).

---
*Built for WorldWideView.*
