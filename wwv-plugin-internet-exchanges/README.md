# @worldwideview/wwv-plugin-internet-exchanges

WorldWideView plugin — Internet Exchange Points (IXPs) and carrier-neutral facilities worldwide.

## Usage

This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:

- **ID:** `internet-exchanges`
- **Category:** Infrastructure
- **Format:** static

## Data Sources

Feature coordinates and metadata come from the **PeeringDB** public API (CC BY-SA 4.0):

> PeeringDB data (c) PeeringDB / Internet eXchange providers and facility providers
> https://www.peeringdb.com/api

- `/api/ix` — Internet Exchange Points (name, city, country, name_long, media, proto_unicast, proto_multicast, proto_ipv6, notes)
- `/api/fac` — Carrier-neutral facilities (name, city, country, org_id, org_name, latitude, longitude)

Both datasets are combined into a single GeoJSON FeatureCollection layer with a `type` property: `"ixp"` or `"facility"`.

**IXP coordinate derivation:** PeeringDB no longer exposes `latitude`/`longitude` directly on `/api/ix`. Each IXP feature point is the centroid of the IXP's member facilities (`fac_set` facility ids, looked up in `/api/fac`). IXPs with zero geocodable member facilities are dropped.

**Coverage (built 2026-08-21):** 910 IXPs + 5,260 facilities. Facilities with missing/invalid coordinates (including `0,0`) are dropped.

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:

```bash
npm install @worldwideview/wwv-plugin-internet-exchanges
```

## Architecture

This plugin adheres to the WorldWideView standard plugin structure. As a `static` plugin, it connects to the core Event Bus and renders map capabilities. The GeoJSON FeatureCollection is baked into `data/data.json` and raw-imported at runtime by an `AutoStaticPlugin` class (same pattern as `wwv-plugin-data-centers`).

## Data Integrity

Run the fail-closed validator to check the data file:

```bash
node scripts/verify-data.mjs
```

Exits `0` on pass, `1` on any anomaly (FeatureCollection shape, Point geometries, coordinate ranges, required properties, duplicate ids).

## Regenerating the data

```bash
node scripts/fetch-data.mjs
```

The fetcher queries PeeringDB directly. PeeringDB throttles anonymous clients (HTTP 429, ~15-20 min cooldown); the script retries with backoff and caches raw responses in `.cache/` (gitignored). To rebuild offline, drop raw `/api/ix` and `/api/fac` responses into `.cache/ix.json` and `.cache/fac.json` before running.

---
*Built for WorldWideView.*
