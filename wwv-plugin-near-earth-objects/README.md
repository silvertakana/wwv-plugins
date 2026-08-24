# wwv-plugin-near-earth-objects

WorldWideView plugin for near-Earth object close approaches (JPL data).

- Source: data engine `/api/near-earth-objects`
- Renders each object as a point: potentially hazardous objects are red and larger, others blue; size also scales slightly with maximum diameter.
- lat/lon are deterministic placeholder coordinates hashed from the asteroid id (documented engine behavior); all real data is in the properties.
- Properties: name, closeApproachDate (rich datetime), orbitingBody, missDistanceKm, relativeVelocityKms, diameterKmMin/Max, absoluteMagnitudeH, potentiallyHazardous, nasaJplUrl (rich link).
- Filters: hazardous select, miss-distance range. Legend: hazardous / not hazardous.