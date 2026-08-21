# @worldwideview/wwv-plugin-satground-stations

WorldWideView plugin — Satellite ground stations worldwide.

## Usage

This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:

- **ID:** `satground-stations`
- **Category:** Space
- **Format:** static

## Data Sources

Feature coordinates and metadata come from the **SatNOGS Network** public station API:

> SatNOGS — Satellite Networked Open Ground Stations
> https://network.satnogs.org/api/stations/?format=json

Used under CC BY-SA. The network is the global open community of amateur ground stations tracking and receiving signals from satellites and space probes. The dataset contains ~4,400 stations with station-level Point coordinates. Each feature carries the station `name`, `status`, `altitude`, `bands` (comma-joined unique frequency bands, e.g. "VHF, UHF"), and `qth` (Maidenhead QTH locator). Stations with missing or invalid coordinates (0,0) are dropped.

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:

```bash
npm install @worldwideview/wwv-plugin-satground-stations
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
