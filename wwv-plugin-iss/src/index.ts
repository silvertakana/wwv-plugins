import type {
    WorldPlugin,
    GeoEntity,
    TimeRange,
    LayerConfig,
    CesiumEntityOptions,
    PluginContext,
} from "@worldwideview/wwv-plugin-sdk";
import { createSvgIconUrl, dtProp, urlProp } from "@worldwideview/wwv-plugin-sdk";
import { Satellite } from "lucide-react";
import pkg from "../package.json";

// background: false -- the host's iconUpscaler.ts already redraws this onto a
// 48px canvas with its own backdrop circle; adding one here too would double it.
const ISS_ICON_URL = createSvgIconUrl(Satellite, {
    color: "#e2e8f0",
    background: false,
});

interface IssApiResponse {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    altitude: number;
    velocity: number;
    visibility: string;
    footprint: number;
    timestamp: number;
    units: string;
}

// Matches the server route's own 10s upstream cache window (/api/iss
// revalidate=10) -- polling faster than that just re-serves the same cached
// response and wastes a request.
const POLL_INTERVAL_MS = 10_000;

interface IssPositionsResponse {
    positions: { latitude: number; longitude: number; timestamp: number }[];
}

// 9 points over the last 27 minutes (3-min spacing) -- well under the
// route's 10-timestamp cap, and long enough relative to the ISS's ~92.7min
// orbital period to show a real, visibly curved arc of ground track leading
// into the current position (the host's trail renderer appends that tip
// itself from the live entity, see properties.history below).
const GROUND_TRACK_MINUTES_BACK = [27, 24, 21, 18, 15, 12, 9, 6, 3];

async function fetchGroundTrack(): Promise<{ lat: number; lon: number; ts: number }[]> {
    const nowSec = Math.floor(Date.now() / 1000);
    const timestamps = GROUND_TRACK_MINUTES_BACK.map((m) => nowSec - m * 60);
    try {
        const res = await fetch(`/api/iss/positions?timestamps=${timestamps.join(",")}`);
        if (!res.ok) return [];
        const data: IssPositionsResponse = await res.json();
        if (!Array.isArray(data.positions)) return [];
        return data.positions
            .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
            .map((p) => ({ lat: p.latitude, lon: p.longitude, ts: p.timestamp }));
    } catch {
        // Ground track is a bonus visual, not core data -- never let it fail the main fetch.
        return [];
    }
}

const issPlugin: WorldPlugin = {
    id: "iss",
    name: "ISS Tracker",
    description: "Live position of the International Space Station",
    icon: "Satellite",
    category: "space",
    version: pkg.version,

    async initialize(_ctx: PluginContext): Promise<void> {
        // No setup needed -- fetch() hits this app's own same-origin /api/iss
        // proxy route, so no engine URL / auth wiring is required.
    },

    destroy(): void {
        // No open connections or timers owned outside the host's poll loop.
    },

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        const res = await fetch("/api/iss");
        if (!res.ok) return [];

        const data: IssApiResponse = await res.json();
        if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) {
            return [];
        }

        const groundTrack = await fetchGroundTrack();

        const entity: GeoEntity = {
            id: "iss-25544",
            pluginId: "iss",
            latitude: data.latitude,
            longitude: data.longitude,
            altitude: (data.altitude ?? 0) * 1000, // km -> meters
            speed: data.velocity,
            timestamp: new Date(data.timestamp * 1000),
            label: "ISS",
            properties: {
                velocity: `${Math.round(data.velocity)} km/h (${Math.round(data.velocity * 0.6214)} mph)`,
                altitude: `${Math.round(data.altitude)} km`,
                visibility: data.visibility === "daylight" ? "In daylight" : "In darkness (eclipsed)",
                ground_footprint: `${Math.round(data.footprint)} km diameter visible from this position`,
                orbital_period: "~92.7 minutes per orbit (~15.5 orbits/day)",
                last_updated: dtProp(new Date(data.timestamp * 1000).toISOString()),
                more_info: urlProp("https://en.wikipedia.org/wiki/International_Space_Station"),
                // Consumed by the host's trail renderer (useTrailRendering.ts) to draw a
                // real curved ground-track polyline into the current position -- not
                // synthetic dead-reckoning, actual historical positions from the API.
                history: groundTrack,
            },
        };

        return [entity];
    },

    getPollingInterval(): number {
        return POLL_INTERVAL_MS;
    },

    getLayerConfig(): LayerConfig {
        return {
            color: "#e2e8f0",
            iconUrl: ISS_ICON_URL,
            clusterEnabled: false,
            clusterDistance: 0,
            maxEntities: 1,
        };
    },

    renderEntity(_entity: GeoEntity): CesiumEntityOptions {
        return {
            type: "billboard",
            iconUrl: ISS_ICON_URL,
            iconScale: 0.75,
            labelText: "ISS",
            // ISS orbits at ~400km -- skip the horizon-cull math built for
            // ground-level entities, per Cesium rendering rules for satellites.
            disableManualHorizonCulling: true,
            disableClustering: true,
            // Real ground-track polyline, built from properties.history above --
            // glow material for the "orbital trail" look.
            trailOptions: {
                color: "#e2e8f0",
                width: 2,
                opacityFade: true,
            },
        };
    },

    // Note: intentionally no getSelectionBehavior() here. That mechanism
    // (SelectionHandler.ts) synthesizes a trail by dead-reckoning backward
    // from the entity's own `heading`/`speed` in a straight line -- gated on
    // `heading !== undefined`, which this plugin never set, so that trail
    // silently never fired. It would also be geometrically wrong for a fast,
    // sharply-curving orbit anyway (straight-line extrapolation over 20min of
    // ISS travel diverges heavily from the real curved ground track). The
    // trailOptions above drive the *other*, properties.history-based trail
    // system (useTrailRendering.ts) instead, which renders the real curved
    // path from actual historical positions.
};

export default issPlugin;
