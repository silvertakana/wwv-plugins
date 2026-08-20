# @worldwideview/wwv-plugin-data-centers

WorldWideView plugin — Data center locations worldwide.

## Usage

This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:

- **ID:** `data-centers`
- **Category:** Infrastructure
- **Format:** static

## Data Sources

Feature coordinates and metadata come from the **ATLAS** global data center dataset (Ringmast4r / Global-Data-Center-Map):

> Data centers (c) Ringmast4r - Global-Data-Center-Map
> https://github.com/Ringmast4r/Global-Data-Center-Map

Used under its permissive attribution-required license (see the dataset LICENSE). 6,131 facilities with building/city-level Point coordinates across 116 countries. Facility locations vary in precision — some are building-level, many resolve to a city, and a portion fall back to state or country centroids; see the source license for the accuracy caveats.

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:

```bash
npm install @worldwideview/wwv-plugin-data-centers
```

## Architecture

This plugin adheres to the WorldWideView standard plugin structure. As a `static` plugin, it connects to the core Event Bus and renders map capabilities. The GeoJSON FeatureCollection is baked into `data/data.json` and raw-imported at runtime by an `AutoStaticPlugin` class (same pattern as `wwv-plugin-lighthouses`).

## Data Integrity

Run the fail-closed validator to check the data file:

```bash
node scripts/verify-data.mjs
```

Exits `0` on pass, `1` on any anomaly (FeatureCollection shape, Point geometries, coordinate ranges, required properties, duplicate ids).

---
*Built for WorldWideView.*
