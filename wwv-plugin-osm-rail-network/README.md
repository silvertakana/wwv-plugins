# @worldwideview/wwv-plugin-osm-rail-network

WorldWideView plugin - Global Rail Network

## Description

Global mainline railway network (Natural Earth). A static, line-based globe layer (baked snapshot - not a live feed).

## Data

- Source: verified open dataset, snapshot date 2026-08-30
- Baked static snapshot, no live polling, no runtime network calls

## Usage

This package is part of the WorldWideView plugin ecosystem.
- **ID:** `osm-rail-network`
- **Category:** transport
- **Format:** static
- **Icon:** TrainFront

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:
```bash
npm install @worldwideview/wwv-plugin-osm-rail-network
```

## Architecture

Adheres to the WorldWideView standard plugin structure. As a `static` plugin it renders baked geospatial data via the AutoStaticPlugin pattern (no polling, no UI extension).

## Verification

```bash
node scripts/verify-data.mjs
```

Fail-closed validator: FeatureCollection parse, LineString geometry, lon/lat bounds, required name/id props, no duplicate ids, count > 0, file size under limit. Exits 0 on PASS.

---
*Built for WorldWideView.*
