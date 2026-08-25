# wwv-plugin-gdacs-disasters

WorldWideView plugin for **GDACS** (Global Disaster Alert and Coordination System) current disasters.

- **Source**: data engine `/api/gdacs-disasters` (GDACS JSON API, official Joint Research Centre feed — data is CC BY 4.0, credit GDACS).
- **Endpoint**: `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH` — GeoJSON FeatureCollection, refresh ~every 6 minutes; the seeder keeps only `iscurrent == "true"` (latest-episode) events.
- **Coverage**: earthquakes (EQ), tropical cyclones (TC), floods (FL), volcanoes (VO), wildfires (WF), droughts (DR).
- **Rendering**: each event as a point colored by `alertlevel` (Red severe -> Orange moderate -> Green low) and sized by alert level.
- **Properties**: eventtype, alertlevel, alertscore, country, iso3, glide, source, severity/severitytext/severityunit, reportUrl, detailsUrl; fromdate/todate/datemodified as rich datetime props.
- **Filters**: alert level select, event type select. **Legend**: three alert-level bands.