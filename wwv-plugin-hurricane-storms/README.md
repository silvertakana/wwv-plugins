# wwv-plugin-hurricane-storms

WorldWideView dynamic data-layer plugin for live tropical storms and hurricanes.

**Data source:** NOAA National Hurricane Center (NHC) active storm feed - https://www.nhc.noaa.gov/CurrentStorms.json

The paired `@wwv-seeders/hurricane-storms` seeder polls NHC hourly, persists each
active storm to SQLite, and pushes a live snapshot the data engine serves at
`/api/hurricane-storms` (WebSocket stream: `wss://dataenginev2.worldwideview.dev/stream`).

Storms render as severity-scaled points (color/size by wind intensity in mph).
Click any storm to open a detail panel with its classification, intensity,
pressure, movement, last update, and links to the NHC public advisory, forecast
track (KMZ), and forecast discussion when published.