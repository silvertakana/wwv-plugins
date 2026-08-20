# @worldwideview/wwv-plugin-dams

WorldWideView plugin - Dam locations worldwide from OpenStreetMap

## Usage
This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:
- **ID:** `dams`
- **Category:** Infrastructure
- **Format:** static

## Installation
Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:
```bash
npm install @worldwideview/wwv-plugin-dams
```

## Architecture
This plugin adheres to the WorldWideView standard plugin structure. As a `static` plugin, it connects to the core Event Bus and renders map capabilities.

## Data
`data/data.json` is a GeoJSON FeatureCollection of dam points. Each feature is a `Point` with a `name` property. Data sourced from OpenStreetMap via the Overpass API (query: `way|node["waterway"="dam"]["name"]`, way centroids taken via `out center`), made available under the [ODbL license](https://www.openstreetmap.org/copyright).

---
*Built for WorldWideView.*
