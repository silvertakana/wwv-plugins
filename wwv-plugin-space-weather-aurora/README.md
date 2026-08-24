# wwv-plugin-space-weather-aurora

WorldWideView plugin for aurora oval intensity forecasts.

- Source: data engine `/api/space-weather-aurora`
- Renders `aurora-oval` items as intensity-colored points (blue -> green -> orange -> white, like real aurora), sized by intensity.
- The single `kp-index` item (positioned at 0,0) is intentionally skipped as a positional entity.
- Filters: intensity range, intensity band. Legend: four intensity bands.