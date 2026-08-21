# @worldwideview/wwv-plugin-tor-exit-nodes

WorldWideView plugin — Tor exit node IPs geolocated worldwide.

## Usage

This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:

- **ID:** `tor-exit-nodes`
- **Category:** Security
- **Format:** static

## Data Sources

IP addresses come from the **Tor Project exit list** (`https://check.torproject.org/exit-addresses`), a public-domain plaintext file refreshed hourly:

> ExitNode &lt;fingerprint&gt;
> Published &lt;date&gt;
> LastStatus &lt;date&gt;
> ExitAddress &lt;ip&gt; &lt;date&gt;

All unique `ExitAddress` IPs are extracted. Geolocation (lat/lon, city, country, ISP/AS org) is resolved via the **ip-api.com** free batch endpoint (`http://ip-api.com/batch`, 100 IPs per request, HTTP only, non-commercial use) on a snapshot basis. IPs that fail geolocation are dropped; the live count varies as Tor exits churn hourly.

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:

```bash
npm install @worldwideview/wwv-plugin-tor-exit-nodes
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
