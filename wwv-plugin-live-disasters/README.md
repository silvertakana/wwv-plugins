# wwv-plugin-live-disasters

Dynamic WorldWideView data-layer plugin surfacing global natural-disaster alerts from the
Global Disaster Alert and Coordination System (GDACS) 24-hour RSS feed: earthquakes,
tropical cyclones, floods, droughts, volcanoes and other hazards.

- Plugin id: `live-disasters`
- Icon: Siren (lucide-react)
- Category: natural-disaster
- Data source: <https://www.gdacs.org/xml/rss_24h.xml>
- Engine endpoint: `/api/live-disasters` (fed hourly by the `@wwv-seeders/live-disasters` seeder)
- Stream: `wss://dataenginev2.worldwideview.dev/stream`, polling 900000 ms
- Severity: GDACS alert level mapped to 0-3 (Red = 3, Orange = 2, Green = 1, unknown = 0)