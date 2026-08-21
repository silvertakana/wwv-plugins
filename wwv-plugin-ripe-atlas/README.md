# @worldwideview/wwv-plugin-ripe-atlas

WorldWideView plugin — RIPE Atlas network measurement probes worldwide.

## Usage

This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:

- **ID:** `ripe-atlas`
- **Category:** Infrastructure
- **Format:** static

## Data Sources

Feature coordinates and metadata come from the **RIPE Atlas** API v2 (RIPE NCC):

> RIPE Atlas probes (c) RIPE NCC — open data under the RIPE NCC data policy
> https://atlas.ripe.net/

The plugin bundles every currently connected probe (`status == Connected`, valid Point geometry, excluding `0,0` coordinates) with its probe id, description, IPv4 ASN, country code, public flag, and tag slugs. Around 14,600 features (~7 MB) at build time; probe count drifts as the live network changes, so the bundle is refreshed by re-running `node scripts/fetch-data.mjs`.

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:

```bash
npm install @worldwideview/wwv-plugin-ripe-atlas
```

## Architecture

This plugin adheres to the WorldWideView standard plugin structure. As a `static` plugin, it connects to the core Event Bus and renders map capabilities. The GeoJSON FeatureCollection is baked into `data/data.json` and raw-imported at runtime by an `AutoStaticPlugin` class (same pattern as `wwv-plugin-data-centers`).

## Data Integrity

Run the fail-closed validator to check the data file:

```bash
node scripts/verify-data.mjs
```

Exits `0` on pass, `1` on any anomaly (FeatureCollection shape, Point geometries, coordinate ranges, required properties, duplicate ids).

## Refreshing the Data

```bash
node scripts/fetch-data.mjs
```

Paginates the RIPE Atlas probes endpoint with `status=1`, filters to probes with a valid Point geometry, transforms to the GeoJSON FeatureCollection bundle, and de-duplicates by probe id. The bundle gate is ~9 MB; if exceeded, features are sampled deterministically by index.

---
*Built for WorldWideView.*
