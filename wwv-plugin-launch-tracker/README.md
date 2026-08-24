# @worldwideview/wwv-plugin-launch-tracker

Engine-backed dynamic placeholder for upcoming rocket launches, pinned to their
launch sites worldwide.

## Data source

[Launch Library 2](https://ll.thespacedevs.com/2.3.0) — the open spaceflight
tracking dataset. This plugin consumes the
`GET https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=100` endpoint
through the paired `@wwv-seeders/launch-tracker` seeder
(`local-seeders/community/packages/launch-tracker`), which:

- polls LL2 on an hourly cron,
- filters to upcoming launches (NET in the future) with valid pad latitude/longitude,
- persists each launch into the per-plugin `launch_tracker` SQLite table,
- publishes a live snapshot (`launch_tracker`) the data engine serves over
  `/api/launch-tracker` and streams over the WebSocket.

The frontend plugin never calls LL2 directly — it reads the engine endpoint and
maps normalised items (or, defensively, raw LL2 launches) to `GeoEntity[]`.

## Features

- Category `space`, icon `Rocket`, format `bundle`, type `data-layer`
- Severity ranked by launch status (upcoming=1, in-flight=2, success=3, failure=4)
- Filters: launch window (`time_bucket`: past/next-7d/next-30d/next-90d/beyond-90d) and status
- Interactive click-detail panel (`getDetailComponent`) with NET, status, mission,
  rocket, provider, pad, and a link to the Launch Library 2 launch page when available
- Engine-backed: WS stream (`wss://dataenginev2.worldwideview.dev/stream`) + poll fallback

## Build

```bash
pnpm install --no-frozen-lockfile
pnpm --filter @worldwideview/wwv-plugin-launch-tracker build  # -> dist/frontend.mjs
```