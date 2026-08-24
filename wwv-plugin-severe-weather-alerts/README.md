# wwv-plugin-severe-weather-alerts

WorldWideView plugin for NWS severe weather alerts (CAP feed, all alert types).

- Source: data engine `/api/severe-weather-alerts`
- Renders each alert as a point colored by severity (Extreme red -> Severe orange -> Moderate amber -> Minor yellow -> Unknown gray) and sized by urgency (Immediate largest).
- Properties: event, severity, urgency, headline, areaDesc, description, instruction; sent/effective/expires as rich datetime props.
- Filters: severity select, urgency select, event type select. Legend: five severity bands.
- Engine timestamps arrive as non-ISO `MM/dd/yyyy HH:mm:ss` with no timezone; they are interpreted as UTC wall-clock (deterministic across machines) and normalized defensively.