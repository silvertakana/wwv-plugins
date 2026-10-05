import type {
    WorldPlugin,
    GeoEntity,
    TimeRange,
    LayerConfig,
    CesiumEntityOptions,
    PluginContext,
    ServerPluginConfig,
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

const ENGINE_FALLBACK_URL = "https://dataenginev2.worldwideview.dev";

/** One position row as served by the data engine's /api/iss snapshot: the upstream wheretheiss.at payload, verbatim. */
export interface IssPosition {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    /** Kilometres. */
    altitude: number;
    velocity: number;
    visibility: string;
    footprint: number;
    /** Second epoch, the upstream unit -- converted to milliseconds on the entity. */
    timestamp: number;
    units: string;
}

/**
 * One historical ground-track sample. It carries the timestamp twice on
 * purpose: `ts` is the field the host's trail renderer reads
 * (useTrailRendering.ts, `history[history.length - 1].ts`) to decide whether
 * the polyline needs rebuilding, and `timestamp` is the engine's own field
 * name, kept for every other consumer.
 */
export interface IssTrackPoint {
    latitude: number;
    longitude: number;
    /** Millisecond epoch, the field useTrailRendering.ts compares. */
    ts?: number;
    /** Second epoch, the engine's own field name. */
    timestamp: number;
}

/** Envelope served at GET /api/iss and pushed over the engine stream. */
export interface IssEnvelope {
    source: string;
    fetchedAt: string;
    items: IssPosition[];
    track?: IssTrackPoint[];
    totalCount: number;
}

/**
 * Maps one engine ISS position to the layer's single GeoEntity. The engine
 * serves altitude in kilometres and timestamp in seconds, while the entity
 * carries metres and a Date, so both are converted here.
 *
 * `track` is the incoming ground track, and is `undefined` when the payload
 * carries none (a streamed frame with no track, or a bare position array). In
 * that case the history from `previous` is carried forward: the host replaces
 * a plugin's entity array wholesale, so an omitted `history` key would empty
 * the trail until the next frame that does carry a track.
 */
export function mapIssToEntity(
    pluginId: string,
    position: IssPosition,
    track?: IssTrackPoint[],
    previous?: GeoEntity,
): GeoEntity {
    // The engine's samples carry `timestamp`; the host's trail renderer compares
    // `ts`. Write both so neither consumer has to know about the other.
    const history = (track ?? (previous?.properties.history as IssTrackPoint[] | undefined))?.map((point) => ({
        ...point,
        ts: point.timestamp * 1000,
    }));
    const ts = new Date(position.timestamp * 1000);

    return {
        id: `${pluginId}-25544`,
        pluginId,
        latitude: position.latitude,
        longitude: position.longitude,
        altitude: (position.altitude ?? 0) * 1000, // km -> meters
        speed: position.velocity,
        timestamp: ts,
        label: "ISS",
        properties: {
            velocity: `${Math.round(position.velocity)} km/h (${Math.round(position.velocity * 0.6214)} mph)`,
            altitude: `${Math.round(position.altitude)} km`,
            visibility: position.visibility === "daylight" ? "In daylight" : "In darkness (eclipsed)",
            ground_footprint: `${Math.round(position.footprint)} km diameter visible from this position`,
            orbital_period: "~92.7 minutes per orbit (~15.5 orbits/day)",
            last_updated: dtProp(ts.toISOString()),
            more_info: urlProp("https://en.wikipedia.org/wiki/International_Space_Station"),
            // Consumed by the host's trail renderer (useTrailRendering.ts) to draw a
            // real curved ground-track polyline into the current position -- not
            // synthetic dead-reckoning, actual historical positions from the engine.
            // Left off entirely when there is no track and no earlier history.
            ...(history ? { history } : {}),
        },
    };
}

/** Reads an engine envelope, or a bare position array, into items plus ground track. */
function readIssPayload(payload: unknown): { items: IssPosition[]; track: IssTrackPoint[] } {
    if (Array.isArray(payload)) return { items: payload, track: [] };

    const envelope = payload as IssEnvelope | null | undefined;
    return {
        items: Array.isArray(envelope?.items) ? envelope.items : [],
        track: Array.isArray(envelope?.track) ? envelope.track : [],
    };
}

/**
 * Maps the engine snapshot (or a streamed frame, which may be a bare array) to
 * the layer's single entity. Returns [] for an envelope with no items.
 *
 * `previous` is the entity the host last held for this layer, passed through
 * to mapIssToEntity so a payload with no track keeps the existing trail.
 */
export function mapIssPayload(pluginId: string, payload: unknown, previous?: GeoEntity): GeoEntity[] {
    const { items, track } = readIssPayload(payload);
    const position = items[0];
    if (!position) return [];

    return [mapIssToEntity(pluginId, position, track.length > 0 ? track : undefined, previous)];
}

/**
 * WorldPlugin has no context slot, so the host context is declared here and
 * captured in initialize(). mapWebsocketPayload() and getServerConfig() are
 * declared required because this plugin always implements them.
 */
interface IssPlugin extends WorldPlugin {
    context?: PluginContext;
    mapWebsocketPayload(payload: unknown, existingEntities?: GeoEntity[]): GeoEntity[];
    getServerConfig(): ServerPluginConfig;
}

const issPlugin: IssPlugin = {
    id: "iss",
    name: "ISS Tracker",
    description: "Live position of the International Space Station",
    icon: "Satellite",
    category: "space",
    version: pkg.version,

    async initialize(ctx: PluginContext): Promise<void> {
        // fetch() resolves the engine URL from this context; the position and the
        // ground track now come from the engine's own /api/iss snapshot.
        this.context = ctx;
    },

    destroy(): void {
        this.context = undefined;
    },

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || ENGINE_FALLBACK_URL;
            const res = await globalThis.fetch(`${engineBase}/api/iss`);
            if (!res.ok) {
                this.context?.onError(new Error(`ISS API returned ${res.status}`));
                return [];
            }

            const data = await res.json();
            if (!Array.isArray(data?.items) || data.items.length === 0) return [];

            return mapIssPayload(this.id, data);
        } catch (err) {
            const error = err instanceof Error ? err : new Error("Failed to fetch ISS position");
            this.context?.onError(error);
            return [];
        }
    },

    /**
     * The engine streams the same envelope the fetch() above receives over HTTP.
     * Mapping it through mapIssPayload keeps streamed entities on the shape the
     * globe expects; without this it drops every pushed frame and the layer only
     * ever updates on the one initial fetch.
     */
    mapWebsocketPayload(payload: unknown, existingEntities?: GeoEntity[]): GeoEntity[] {
        return mapIssPayload(this.id, payload, existingEntities?.[0]);
    },

    getPollingInterval(): number {
        // One poll for the initial position; live updates arrive over the stream.
        return 0;
    },

    getServerConfig(): ServerPluginConfig {
        return { streamUrl: "wss://dataenginev2.worldwideview.dev/stream", apiBasePath: "/api/iss", pollingIntervalMs: 0, historyEnabled: false };
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
