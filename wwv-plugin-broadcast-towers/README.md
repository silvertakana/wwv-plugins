# @worldwideview/wwv-plugin-broadcast-towers

WorldWideView plugin — US broadcast and communications antenna structures (FCC Antenna Structure Registration).

## Usage

This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:

- **ID:** `broadcast-towers`
- **Category:** Infrastructure
- **Format:** static

## Data Sources

Feature coordinates and metadata come from the **FCC Antenna Structure Registration (ASR)** public access files (weekly snapshot):

> Federal Communications Commission — Antenna Structure Registration (ASR)
> https://www.fcc.gov/wireless/systems-utilities/antenna-structure-registration
> Bulk weekly snapshot: `https://data.fcc.gov/download/pub/uls/complete/a_tower.zip`

US public domain data. The plugin ships a deterministic sample of the registration database: active (granted) registrations with a valid coordinate, sorted by structure height descending and sampled every 5th record to keep the bundle under ~9 MB. Each feature carries `name` (city, state or `ASR-<regnum>`), `asr` (registration number), `city`, `state`, and numeric `height` (overall height above ground in feet, when present).

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:

```bash
npm install @worldwideview/wwv-plugin-broadcast-towers
```

## Architecture

This plugin adheres to the WorldWideView standard plugin structure. As a `static` plugin, it connects to the core Event Bus and renders map capabilities. The GeoJSON FeatureCollection is baked into `data/data.json` and raw-imported at runtime by an `AutoStaticPlugin` class (same pattern as `wwv-plugin-data-centers`).

## Data Integrity

Run the fail-closed validator to check the data file:

```bash
node scripts/verify-data.mjs
```

Exits `0` on pass, `1` on any anomaly (FeatureCollection shape, Point geometries, coordinate ranges, required properties, duplicate ids).

To rebuild the data file from the FCC weekly snapshot, extract `a_tower.zip` into `asr_src/` next to this plugin and run:

```bash
node scripts/build-data.mjs
```

---

*Built for WorldWideView.*
