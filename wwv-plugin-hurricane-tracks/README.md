# @worldwideview/wwv-plugin-hurricane-tracks

WorldWideView plugin — Historical hurricane/cyclone/tropical storm track points worldwide.

## Usage

This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:

- **ID:** `hurricane-tracks`
- **Category:** Weather
- **Format:** static

## Data Sources

Track points come from the **NOAA IBTrACS** (International Best Track Archive for Climate Stewardship), public domain:

> IBTrACS is the World Meteorological Organization (WMO) sanctioned dataset of global tropical cyclone best track data. NOAA NCEI.
> https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/

Subset: North Atlantic basin (`ibtracs.NA.list.v04r00.csv`), seasons 2000+ with maximum intensity of Saffir-Simpson category 2 or higher (or equivalent WMO category when the USA SSH scales are absent). One point per 6-hour best-track position. Missing values (IBTrACS `-999.0` placeholders) are dropped; category falls back to the WMO category when the USA Saffir-Simpson value is empty.

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:

```bash
npm install @worldwideview/wwv-plugin-hurricane-tracks
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
