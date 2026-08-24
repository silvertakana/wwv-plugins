# wwv-plugin-aviation-weather-hazards

WorldWideView plugin for aviation weather hazards.

- Source: data engine `/api/aviation-weather-hazards`
- METAR items render as points colored by flight category (VFR green, MVFR blue, IFR red, LIFR magenta).
- SIGMET items render as larger points colored by severity (amber/orange/red), labeled with the hazard type.
- Properties include the raw METAR/SIGMET report, hazard, severity, and validTimeTo (exposed as an ISO datetime).
- Filters: kind (metar/sigmet), flight category, severity range.