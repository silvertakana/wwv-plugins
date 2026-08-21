# @worldwideview/wwv-plugin-hospitals

WorldWideView plugin — Hospital locations worldwide.

## Usage

This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:

- **ID:** `hospitals`
- **Category:** Infrastructure
- **Format:** static

## Data Sources

Feature coordinates and metadata come from **OpenStreetMap** via the **Overpass API**:

> OpenStreetMap data (c) OpenStreetMap contributors
> https://www.openstreetmap.org/copyright

Used under the Open Database License (ODbL 1.0). The dataset is a snapshot of `node["amenity"="hospital"]` and `way["amenity"="hospital"]` elements (way centroids for ways) that carry a `name` tag. Elements without a name are dropped because unnamed hospital features are not usable as labeled points. Kept properties: `name`, `operator`, `emergency`, `healthcare`, and the OSM `id`. The snapshot was taken via the kumi Overpass mirror (`https://overpass.kumi.systems/api/interpreter`).

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:

```bash
npm install @worldwideview/wwv-plugin-hospitals
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
