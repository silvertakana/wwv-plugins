import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";
import issPlugin, { mapIssToEntity, mapIssPayload, type IssEnvelope, type IssPosition } from "../index";

// ---- Fixtures ----------------------------------------------------------------

/** Real row shape from GET https://dataenginev2.worldwideview.dev/api/iss. */
const POSITION: IssPosition = {
    id: 25544,
    name: "iss",
    latitude: -43.5321,
    longitude: 172.6362,
    altitude: 418.5,
    velocity: 27580.4,
    visibility: "daylight",
    footprint: 4523.7,
    timestamp: 1791093306,
    units: "kilometers",
};

/** The ground track the snapshot carries: { latitude, longitude, timestamp } samples. */
const TRACK = [
    { latitude: -45.5, longitude: 168.1, timestamp: 1791093126 },
    { latitude: -44.5, longitude: 170.4, timestamp: 1791093306 },
];

const ENVELOPE: IssEnvelope = {
    source: "iss",
    fetchedAt: "2026-10-04T05:55:08.000Z",
    items: [POSITION],
    track: TRACK,
    totalCount: 1,
};

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/** Minimal PluginContext stand-in; initialize() only stores it. */
function makeContext(engineUrl = "https://engine.test") {
    const onError = vi.fn();
    return { context: { getEngineUrl: () => engineUrl, onError } as never, onError };
}

async function initializedPlugin(engineUrl?: string) {
    const { context, onError } = makeContext(engineUrl);
    await issPlugin.initialize(context);
    return { onError };
}

beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    issPlugin.destroy();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// ---- mapIssToEntity ----------------------------------------------------------

describe("mapIssToEntity", () => {
    it("maps every engine field, converting km to metres and seconds to milliseconds", () => {
        const entity = mapIssToEntity("iss", POSITION, TRACK);

        expect(entity.id).toBe("iss-25544");
        expect(entity.pluginId).toBe("iss");
        expect(entity.latitude).toBe(-43.5321);
        expect(entity.longitude).toBe(172.6362);
        expect(entity.altitude).toBe(418500); // 418.5 km -> metres
        expect(entity.speed).toBe(27580.4);
        expect(entity.timestamp).toBeInstanceOf(Date);
        expect(entity.timestamp.getTime()).toBe(1791093306000); // 1791093306 s -> ms
        expect(entity.label).toBe("ISS");
        expect(entity.properties.velocity).toBe("27580 km/h (17138 mph)");
        expect(entity.properties.altitude).toBe("419 km");
        expect(entity.properties.visibility).toBe("In daylight");
        expect(entity.properties.ground_footprint).toBe("4524 km diameter visible from this position");
        expect(entity.properties.orbital_period).toBe("~92.7 minutes per orbit (~15.5 orbits/day)");
        expect(entity.properties.last_updated).toBe("datetime:2026-10-04T05:55:06.000Z");
        expect(entity.properties.more_info).toBe("url:https://en.wikipedia.org/wiki/International_Space_Station");
    });

    it("reports an eclipsed station as in darkness", () => {
        const entity = mapIssToEntity("iss", { ...POSITION, visibility: "eclipsed" });
        expect(entity.properties.visibility).toBe("In darkness (eclipsed)");
    });

    it("wires properties.history from the engine's ground track", () => {
        const entity = mapIssToEntity("iss", POSITION, TRACK);

        expect(entity.properties.history).toHaveLength(2);
        expect(entity.properties.history).toEqual([
            { latitude: -45.5, longitude: 168.1, timestamp: 1791093126 },
            { latitude: -44.5, longitude: 170.4, timestamp: 1791093306 },
        ]);
    });

    it("defaults history to [] when the payload carries no track", () => {
        expect(mapIssToEntity("iss", POSITION).properties.history).toEqual([]);
    });
});

// ---- fetch -------------------------------------------------------------------

describe("ISSPlugin.fetch", () => {
    it("requests the engine's iss endpoint", async () => {
        const fetchMock = vi.mocked(globalThis.fetch);
        fetchMock.mockResolvedValueOnce(okResponse(ENVELOPE) as Response);

        await initializedPlugin();
        await issPlugin.fetch({} as never);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe("https://engine.test/api/iss");
    });

    it("falls back to the public engine host when the context resolves no URL", async () => {
        const fetchMock = vi.mocked(globalThis.fetch);
        fetchMock.mockResolvedValueOnce(okResponse(ENVELOPE) as Response);

        await initializedPlugin("");
        await issPlugin.fetch({} as never);

        expect(fetchMock.mock.calls[0][0]).toBe("https://dataenginev2.worldwideview.dev/api/iss");
    });

    it("maps the envelope onto the single entity with the exact values", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(okResponse(ENVELOPE) as Response);

        const { onError } = await initializedPlugin();
        const entities = await issPlugin.fetch({} as never);

        expect(entities).toHaveLength(1);
        expect(entities[0].id).toBe("iss-25544");
        expect(entities[0].latitude).toBe(-43.5321);
        expect(entities[0].longitude).toBe(172.6362);
        expect(entities[0].altitude).toBe(418500);
        expect(entities[0].speed).toBe(27580.4);
        expect(entities[0].timestamp.getTime()).toBe(1791093306000);
        expect(entities[0].properties.history).toEqual(TRACK);
        expect(onError).not.toHaveBeenCalled();
    });

    it("returns [] when items is missing, not an array, or empty", async () => {
        await initializedPlugin();

        vi.mocked(globalThis.fetch).mockResolvedValueOnce(okResponse({ source: "iss", totalCount: 0 }) as Response);
        expect(await issPlugin.fetch({} as never)).toEqual([]);

        vi.mocked(globalThis.fetch).mockResolvedValueOnce(okResponse({ items: null }) as Response);
        expect(await issPlugin.fetch({} as never)).toEqual([]);

        vi.mocked(globalThis.fetch).mockResolvedValueOnce(okResponse({ ...ENVELOPE, items: [], totalCount: 0 }) as Response);
        expect(await issPlugin.fetch({} as never)).toEqual([]);
    });

    it("reports a non-ok response through onError and returns []", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) } as Response);

        const { onError } = await initializedPlugin();

        expect(await issPlugin.fetch({} as never)).toEqual([]);
        expect(onError).toHaveBeenCalledTimes(1);
        expect((onError.mock.calls[0][0] as Error).message).toBe("ISS API returned 404");
    });

    it("reports a rejected fetch through onError and returns []", async () => {
        vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("network down"));

        const { onError } = await initializedPlugin();

        expect(await issPlugin.fetch({} as never)).toEqual([]);
        expect(onError).toHaveBeenCalledTimes(1);
        expect((onError.mock.calls[0][0] as Error).message).toBe("network down");
    });
});

// ---- mapWebsocketPayload -----------------------------------------------------

describe("ISSPlugin.mapWebsocketPayload", () => {
    it("yields the same entities as fetch for the same payload", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(okResponse(ENVELOPE) as Response);

        await initializedPlugin();
        const fetched = await issPlugin.fetch({} as never);
        const streamed = issPlugin.mapWebsocketPayload(ENVELOPE);

        expect(streamed).toEqual(fetched);
        expect(streamed[0].id).toBe("iss-25544");
        expect(streamed[0].altitude).toBe(418500);
        expect(streamed[0].properties.history).toEqual(TRACK);
    });

    it("accepts a bare position array, with no ground track", () => {
        const entities: GeoEntity[] = issPlugin.mapWebsocketPayload([POSITION]);

        expect(entities).toHaveLength(1);
        expect(entities[0].longitude).toBe(172.6362);
        expect(entities[0].timestamp.getTime()).toBe(1791093306000);
        expect(entities[0].properties.history).toEqual([]);
    });

    it("returns [] for a payload with no items", () => {
        expect(mapIssPayload("iss", { source: "iss" })).toEqual([]);
        expect(issPlugin.mapWebsocketPayload({ items: [] })).toEqual([]);
        expect(issPlugin.mapWebsocketPayload(null)).toEqual([]);
    });
});

// ---- preserved config --------------------------------------------------------

describe("ISSPlugin config", () => {
    it("points at the engine's iss endpoint and stream, with polling off", () => {
        expect(issPlugin.getServerConfig()).toEqual({
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/iss",
            pollingIntervalMs: 0,
            historyEnabled: false,
        });
        expect(issPlugin.getPollingInterval()).toBe(0);
    });

    it("keeps the single-entity, unclustered layer config", () => {
        expect(issPlugin.getLayerConfig()).toMatchObject({
            color: "#e2e8f0",
            clusterEnabled: false,
            clusterDistance: 0,
            maxEntities: 1,
        });
    });

    it("keeps the billboard icon settings and the history-driven trail", () => {
        const options = issPlugin.renderEntity(mapIssToEntity("iss", POSITION, TRACK));

        expect(options).toMatchObject({
            type: "billboard",
            iconScale: 0.75,
            labelText: "ISS",
            disableManualHorizonCulling: true,
            disableClustering: true,
            trailOptions: { color: "#e2e8f0", width: 2, opacityFade: true },
        });
    });
});
