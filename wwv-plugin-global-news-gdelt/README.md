# wwv-plugin-global-news-gdelt

WorldWideView plugin for global news article locations from GDELT.

- Source: data engine `/api/global-news-gdelt`
- Renders each article as a point colored by GDELT CAMEO tone (negative red, positive green, neutral/absent gray) and sized by sentiment magnitude.
- Properties: title, domain, language, tone, mentions, mentionedThemes, sourceCountry, publishedAt (rich datetime), url (rich link).
- Filters: tone range, sentiment band select. Legend: three tone bands.
- Payload caveat (observed 2026-08-24): `title` holds the place/region string, `mentions`/`language`/`sourceCountry` are currently null, and `publishedAt` is non-ISO `MM/dd/yyyy HH:mm:ss` with no timezone (interpreted as UTC wall-clock, normalized defensively). Those fields are still surfaced as properties for when the engine populates them.