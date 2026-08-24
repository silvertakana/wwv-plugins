# wwv-plugin-river-levels-flood

WorldWideView plugin for USGS river stage observations.

- Source: data engine `/api/river-levels-flood`
- Renders each gauge as a point classified into a flood-risk band (major red, moderate orange, action amber, normal green), sized by stage height.
- Risk bands are a fixed global heuristic over `stage_ft` (>= 20 major, 12-20 moderate, 8-12 action, < 8 normal) because USGS flood categories are gauge-specific
  and the payload carries no per-gauge thresholds.
- Properties: name, stage_ft, risk_band, dateTime (raw string), dateTimeIso (rich datetime when parseable).
- Filters: flood-risk band select, stage height range. Legend: four bands.
- Engine timestamps arrive as non-ISO `MM/dd/yyyy HH:mm:ss` / `dd/MM/yyyy h:mm:ss am` with no timezone; the raw string is always kept, and parsing (UTC wall-clock, defensively) is best-effort.