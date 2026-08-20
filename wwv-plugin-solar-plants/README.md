# wwv-plugin-solar-plants

WorldWideView plugin — Utility-scale solar power plants worldwide.

A static bundle plugin that renders the locations of the world's largest
utility-scale photovoltaic power stations as billboards on the globe.

## Data

Source: [Wikipedia — List of photovoltaic power stations](https://en.wikipedia.org/wiki/List_of_photovoltaic_power_stations)
(World's largest photovoltaic power stations table), with four coordinates resolved
via [Wikidata](https://www.wikidata.org) entity coordinate claims:

- Pavagada Solar Park (Q29026621)
- Mohammed bin Rashid Al Maktoum Solar Park (Q30588403)
- Rewa Ultra Mega Solar (Q24929801)
- Energiepark Witznitz (Q112322987)

The data is derived from Wikipedia/Wikidata content and is provided under the
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) license terms of
Wikipedia/Wikidata. Coordinates were parsed from the `{{coord}}` templates and
Wikidata `P625` claims.

## Development

```bash
# Install resolution: node_modules junction must exist at the workspace root
vite build        # produces dist/frontend.mjs
node scripts/verify-data.mjs   # validates data/data.json (exit 0 = pass)
```

## Verify

```bash
node scripts/verify-data.mjs
# e.g. OK: 69 features, 69 unique ids, all points in range
```
