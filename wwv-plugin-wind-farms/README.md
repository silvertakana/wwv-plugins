# Wind Farms

WorldWideView static data-layer plugin showing wind power farms and plants worldwide.

- **id**: `wind-farms`
- **category**: Energy
- **type**: data-layer
- **capabilities**: `layer`

## Data source

Global wind farm locations from [Wikidata](https://www.wikidata.org) via the Wikidata Query Service (SPARQL).

Query: instances of **wind farm** (`Q194356`) that have a coordinate (`P625`) and an English label.

Attribution: **Wikidata** (licensed under CC0 1.0). Each feature carries its `wikidata_id` (Q identifier) and `name`, plus `country` when available.

Fields per feature:

- `name` — English label of the wind farm
- `wikidata_id` — Wikidata Q identifier (also used as the entity id)
- `country` — country label, when declared

## Build

```bash
node "C:/dev/wwv/worldwideview/node_modules/vite/bin/vite.js" build   # → dist/frontend.mjs
node scripts/verify-data.mjs                                          # validate data.json (exit 0 = pass)
```
