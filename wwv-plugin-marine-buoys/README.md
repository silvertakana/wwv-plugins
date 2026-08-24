# @worldwideview/wwv-plugin-marine-buoys

Live marine buoy observations from NOAA's National Data Buoy Center (NDBC) —
wave height, wind speed/gust/direction, and air/water temperature — rendered
as a real-time data layer on the WorldWideView globe.

## Data source

- **Latest observations (TXT):** https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt
- **Active stations (XML):** https://www.ndbc.noaa.gov/activestations.xml

The TXT feed is a whitespace-delimited fixed-width table (`#STN` header column).
Rows with `MM` in a numeric column mean "missing" and are surfaced as `null`.
Rows whose LAT/LON are not finite numbers are skipped.

## Usage

- **ID:** `marine-buoys`
- **Category:** maritime
- **Format:** bundle
- **Engine endpoint:** `/api/marine-buoys`
- **Polling:** 15 minutes (900000 ms)

This plugin is part of the WorldWideView plugin ecosystem and is typically
installed via the WorldWideView Marketplace or discovered automatically.

If installing manually in a Next.js setup:

```bash
npm install @worldwideview/wwv-plugin-marine-buoys
```

## Architecture

The plugin adheres to the WorldWideView standard plugin structure. As a
`bundle` plugin it fetches its entities from the data engine
(`/api/marine-buoys`, populated by the `@wwv-seeders/marine-buoys` seeder) and
renders them on the globe. Severity is mapped from wave height (WVHT, meters):
0-1 m calm, 1-2 m slight, 2-3.5 m moderate, 3.5-6 m rough, 6 m+ very rough.
Clicking a buoy opens a detail panel with the latest observed conditions.

---
*Built for WorldWideView.*