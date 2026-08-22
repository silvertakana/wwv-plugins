# @worldwideview/wwv-plugin-iron-steel-plants

WorldWideView plugin - Iron & Steel Plants

## Description

1,209 iron and steel plants worldwide, from the Global Energy Monitor Global Iron and Steel Tracker (March 2025 V1.2 release). A static, point-based layer of the industrial supply chain.

## Data

- Source: Global Energy Monitor - Global Iron and Steel Tracker, March 2025 V1.2 (CC BY 4.0)
- Snapshot date: 2026-08-23 (baked static snapshot - not a live feed)
- Features: 1,209
- Each feature carries: id, name, country, region, municipality, province, owner, parent, coordinate_accuracy, status, start_year, steel_capacity_ttpa, iron_capacity_ttpa

## Usage

This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:
- **ID:** `iron-steel-plants`
- **Category:** Industry
- **Format:** static
- **Icon:** Factory

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:
```bash
npm install @worldwideview/wwv-plugin-iron-steel-plants
```

## Architecture

This plugin adheres to the WorldWideView standard plugin structure. As a `static` plugin, it renders baked geospatial data as a globe layer via the AutoStaticPlugin pattern (no live polling, no runtime network calls).

## Verification

```bash
node scripts/verify-data.mjs
```

Fail-closed validator: parses the FeatureCollection, checks Point geometry, lon/lat bounds, required name/id props, no duplicate ids, count > 0, and file size under the bundle limit. Exits 0 on PASS.

---
*Built for WorldWideView.*