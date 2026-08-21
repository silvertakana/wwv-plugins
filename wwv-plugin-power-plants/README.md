# @worldwideview/wwv-plugin-power-plants

WorldWideView plugin — Global power plants (thermal, hydro, coal, gas, and more).

## Usage

This package is part of the WorldWideView plugin ecosystem. It provides the following capabilities:

- **ID:** `power-plants`
- **Category:** Energy
- **Format:** static

## Data Sources

Feature coordinates and metadata come from the **WRI Global Power Plant Database**:

> Global Power Plant Database (c) World Resources Institute
> https://datasets.wri.org/dataset/globalpowerplantdatabase

Used under the **CC BY 4.0** license (see the dataset license). The database contains ~35,000 power plants of all fuel types (thermal, hydro, coal, gas, oil, wind, solar, nuclear, biomass, geothermal, waste, etc.) with plant-level Point coordinates across the globe. Plant locations vary in precision — most are plant-site coordinates from WRI/verified sources; see the dataset documentation for the accuracy caveats.

## Installation

Typically installed via the WorldWideView Marketplace or discovered automatically.
If installing manually in a Next.js setup:

```bash
npm install @worldwideview/wwv-plugin-power-plants
```

## Architecture

This plugin adheres to the WorldWideView standard plugin structure. As a `static` plugin, it connects to the core Event Bus and renders map capabilities. The GeoJSON FeatureCollection is baked into `data/data.json` and raw-imported at runtime by an `AutoStaticPlugin` class (same pattern as `wwv-plugin-data-centers`).

## Data Integrity

Run the fail-closed validator to check the data file:

```bash
node scripts/verify-data.mjs
```

Exits `0` on pass, `1` on any anomaly (FeatureCollection shape, Point geometries, coordinate ranges, required properties, duplicate ids).

## Refreshing Data

Re-download the WRI Global Power Plant Database CSV and regenerate `data/data.json`:

```bash
node scripts/fetch-data.mjs
```

The script parses the RFC-4180 CSV (quoted fields, `""` escapes), filters rows with unparseable coordinates, and writes a FeatureCollection with the same field mapping and row order as the committed data. It exits `1` (fails closed) if verification fails, if the feature count moves more than 2% from the committed file, or if the download shows signs of corruption. If the regenerated file is byte-identical, nothing is written.

Known plants can be spot-checked after a refresh:

```bash
node scripts/fetch-data.mjs --check="Ain Djasser=Algeria"
```

Re-run offline with `--use-cache` after a previous download (cached in the system temp dir).

---
*Built for WorldWideView.*
