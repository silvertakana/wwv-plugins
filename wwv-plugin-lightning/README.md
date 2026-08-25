# wwv-plugin-lightning

WorldWideView plugin for **live lightning strikes** from the Blitzortung community detection network.

- **Source**: data engine `/api/lightning` (Blitzortung WebSocket protocol v24 via the `lightning` seeder — live feed, strokes batched every few seconds).
- **Rendering**: each stroke as a small yellow point; clusters when zoomed out.
- **Properties**: amplitude (Blitzortung accuracy estimate, meters), serverDelayMs (upstream server delay), src (detection source id).
- **Nature**: informational globe overlay. **NOT a storm-warning system**; it intentionally does not alert.

## Terms & usage risk (read before deploying)

This plugin surfaces live lightning data derived from the **Blitzortung.org** community network (aggregated by lightningmaps.org). Their terms are restrictive:

- **blitzortung.org / limaps.org terms bar** use of the data for **storm-warning systems, overvoltage plausibility checks, or precautionary risk analysis** — *"even via third-party websites"* — and **non-commercial use only**.
- The Home Assistant data-usage policy requires apps to **serve their own clients from their own servers**. The WWV architecture complies: the seeder pulls the stream into the WWV data engine, and the engine serves WWV's own clients.
- **WWV's use**: informational globe overlay only — NOT storm warning, NOT risk analysis, NOT commercial.

Do not repurpose this plugin (or its seeder) for warning/risk/commercial purposes without legal review of the upstream terms.