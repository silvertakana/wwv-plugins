import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";
import issPlugin, { mapIssToEntity, mapIssPayload, type IssEnvelope, type IssPosition, type IssTrackPoint } from "../index";

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

/**
 * The ground track the snapshot carries, with both epoch fields the mapper
 * writes: `ts` for the host's trail renderer and `timestamp` for everything
 * else.
 */
const TRACK: IssTrackPoint[] = [
    { latitude: -45.5, longitude: 168.1, timestamp: 1791093126 },
    { latitude: -44.5, longitude: 170.4, timestamp: 1791093306 },
];

/** What the mapper writes for that track: both epoch fields, ts in milliseconds. */
const MAPPED_TRACK = [
    { latitude: -45.5, longitude: 168.1, timestamp: 1791093126, ts: 1791093126000 },
    { latitude: -44.5, longitude: 170.4, timestamp: 1791093306, ts: 1791093306000 },
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

    it("drives the host trail renderer's change detection", () => {
        // The two lines below mirror useTrailRendering.ts:48/50 (globe origin/main)
        // against the properties this mapper writes. With only `timestamp` on the
        // points, latestHistoryTs was permanently undefined and the polyline was
        // built once and never rebuilt as the track grew.
        const latestHistoryTs = (entity: GeoEntity): unknown => {
            const history = entity.properties.history as { ts?: unknown }[];
            return history.length > 0 ? history[history.length - 1].ts : 0;
        };

        const first = mapIssToEntity("iss", POSITION, TRACK.slice(0, 1));
        const second = mapIssToEntity("iss", POSITION, TRACK);

        const firstTs = latestHistoryTs(first);
        expect(firstTs).toBe(1791093126000);
        expect(latestHistoryTs(second)).not.toBe(firstTs);
        // Exactly the comparison the renderer makes: item._lastHistoryTs !== latestHistoryTs.
        expect(latestHistoryTs(second) !== firstTs).toBe(true);
    });

    it("reports an eclipsed station as in darkness", () => {
        const entity = mapIssToEntity("iss", { ...POSITION, visibility: "eclipsed" });
        expect(entity.properties.visibility).toBe("In darkness (eclipsed)");
    });

    it("wires properties.history from the engine's ground track", () => {
        const entity = mapIssToEntity("iss", POSITION, TRACK);

        expect(entity.properties.history).toHaveLength(2);
        expect(entity.properties.history).toEqual(MAPPED_TRACK);
    });

    it("omits history entirely when the payload carries no track and there is no earlier entity", () => {
        expect(mapIssToEntity("iss", POSITION).properties).not.toHaveProperty("history");
    });

    it("carries an earlier entity's history forward when the payload has no track", () => {
        const previous = mapIssToEntity("iss", POSITION, TRACK);

        const next = mapIssToEntity("iss", { ...POSITION, timestamp: POSITION.timestamp + 60 }, undefined, previous);

        expect(next.properties.history).toEqual(MAPPED_TRACK);
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
        expect(entities[0].properties.history).toEqual(MAPPED_TRACK);
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
        expect(streamed[0].properties.history).toEqual(MAPPED_TRACK);
    });

    it("writes the ground track onto history when the payload carries one", () => {
        const entities = issPlugin.mapWebsocketPayload(ENVELOPE);

        expect(entities[0].properties.history).toEqual(MAPPED_TRACK);
        expect(entities[0].properties.history).toHaveLength(2);
    });

    it("accepts a bare position array, with no ground track", () => {
        const entities: GeoEntity[] = issPlugin.mapWebsocketPayload([POSITION]);

        expect(entities).toHaveLength(1);
        expect(entities[0].longitude).toBe(172.6362);
        expect(entities[0].timestamp.getTime()).toBe(1791093306000);
        expect(entities[0].properties).not.toHaveProperty("history");
    });

    it("does not empty properties.history when a streamed frame carries no track", () => {
        // The host passes the plugin's current entities as the second argument
        // (WsClient.ts:284) and replaces the array wholesale, so a frame with no
        // track must carry the previous history forward.
        const held = issPlugin.mapWebsocketPayload(ENVELOPE);
        expect(held[0].properties.history).toEqual(MAPPED_TRACK);

        const afterBareFrame = issPlugin.mapWebsocketPayload([POSITION], held);

        expect(afterBareFrame[0].properties.history).toEqual(MAPPED_TRACK);
        expect(afterBareFrame[0].properties.history).toHaveLength(2);
    });

    it("keeps an envelope's own track when a previous entity exists", () => {
        const previous = issPlugin.mapWebsocketPayload(ENVELOPE);
        const shorter: IssTrackPoint[] = TRACK.slice(0, 1);

        const next = issPlugin.mapWebsocketPayload({ ...ENVELOPE, track: shorter }, previous);

        expect(next[0].properties.history).toEqual(MAPPED_TRACK.slice(0, 1));
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

// ---- track reset semantics and unusable input --------------------------------

describe("ground-track reset semantics", () => {
    it("clears properties.history when the payload carries an explicit empty track", () => {
        const held = issPlugin.mapWebsocketPayload(ENVELOPE);
        expect(held[0].properties.history).toEqual(MAPPED_TRACK);

        // An empty array is a deliberate "the track is now empty", so it has to
        // win over the history the host is still holding. Treating it as absent
        // (the old length-based check) left a stale trail on the globe.
        const reset = issPlugin.mapWebsocketPayload({ ...ENVELOPE, track: [] }, held);

        expect(reset[0].properties.history).toEqual([]);
    });

    it("keeps properties.history when the payload omits the track key", () => {
        const held = issPlugin.mapWebsocketPayload(ENVELOPE);
        const withoutTrack = {
            source: "iss",
            fetchedAt: ENVELOPE.fetchedAt,
            items: [POSITION],
            totalCount: 1,
        };

        const next = issPlugin.mapWebsocketPayload(withoutTrack, held);

        expect(next[0].properties.history).toEqual(MAPPED_TRACK);
    });

    it("treats a non-array track as absent rather than empty", () => {
        const held = issPlugin.mapWebsocketPayload(ENVELOPE);

        const next = issPlugin.mapWebsocketPayload({ ...ENVELOPE, track: "nope" }, held);

        expect(next[0].properties.history).toEqual(MAPPED_TRACK);
    });

    it("accepts a fresh track after a reset", () => {
        const held = issPlugin.mapWebsocketPayload(ENVELOPE);
        const reset = issPlugin.mapWebsocketPayload({ ...ENVELOPE, track: [] }, held);
        expect(reset[0].properties.history).toEqual([]);

        const regrown = issPlugin.mapWebsocketPayload(ENVELOPE, reset);

        expect(regrown[0].properties.history).toEqual(MAPPED_TRACK);
    });

    it("never mutates the entity or history it was handed", () => {
        const held = issPlugin.mapWebsocketPayload(ENVELOPE);
        const history = held[0].properties.history as IssTrackPoint[];
        history.forEach((point) => Object.freeze(point));
        Object.freeze(history);
        Object.freeze(held[0].properties);
        Object.freeze(held[0]);
        Object.freeze(held);

        // This module is ESM, so a write to a frozen object throws. Calling the
        // mapper against a frozen previous entity is therefore the assertion.
        expect(() => issPlugin.mapWebsocketPayload(ENVELOPE, held)).not.toThrow();
        expect(() => issPlugin.mapWebsocketPayload({ ...ENVELOPE, track: [] }, held)).not.toThrow();
        expect(history).toEqual(MAPPED_TRACK);
    });
});

describe("unusable input", () => {
    const BAD_POSITIONS: Array<[string, unknown]> = [
        ["a missing latitude", { ...POSITION, latitude: undefined }],
        ["a missing longitude", { ...POSITION, longitude: undefined }],
        ["a numeric-string latitude", { ...POSITION, latitude: "51.6" }],
        ["a latitude off the globe", { ...POSITION, latitude: 91 }],
        ["a NaN longitude", { ...POSITION, longitude: NaN }],
        ["a missing timestamp", { ...POSITION, timestamp: undefined }],
        ["a zero timestamp", { ...POSITION, timestamp: 0 }],
        ["an unrepresentable timestamp", { ...POSITION, timestamp: 1e20 }],
        ["a bare string", "not-a-position"],
        ["a number", 42],
        ["null", null],
    ];

    for (const [label, position] of BAD_POSITIONS) {
        it(`returns [] for ${label} rather than throwing on the Date`, () => {
            const payload = { ...ENVELOPE, items: [position] };

            // mapIssToEntity would build new Date(undefined * 1000) and throw
            // RangeError out of the WebSocket handler; the boundary rejects first.
            expect(() => mapIssPayload("iss", payload)).not.toThrow();
            expect(mapIssPayload("iss", payload)).toEqual([]);
        });
    }

    it("still renders a fix on the equator at the prime meridian", () => {
        const entities = mapIssPayload("iss", {
            ...ENVELOPE,
            items: [{ ...POSITION, latitude: 0, longitude: 0 }],
        });

        expect(entities).toHaveLength(1);
        expect(entities[0].latitude).toBe(0);
        expect(entities[0].longitude).toBe(0);
    });

    it("drops unusable track points and keeps the usable ones", () => {
        const track = [
            TRACK[0],
            { latitude: 1, longitude: 2 },
            { latitude: NaN, longitude: 2, timestamp: 1791093306 },
            { latitude: 1, longitude: 2, timestamp: 0 },
            null,
            TRACK[1],
        ];

        const entities = mapIssPayload("iss", { ...ENVELOPE, track });

        expect(entities[0].properties.history).toEqual(MAPPED_TRACK);
    });

    it("clears the trail when every track point is unusable", () => {
        const held = issPlugin.mapWebsocketPayload(ENVELOPE);
        expect(held[0].properties.history).toHaveLength(2);

        const entities = issPlugin.mapWebsocketPayload(
            { ...ENVELOPE, track: [{ latitude: 1, longitude: 2 }] },
            held
        );

        expect(entities[0].properties.history).toEqual([]);
    });

    // A finite number is not enough for a track point: 91 degrees latitude and
    // 1e308 seconds are both "finite" and both unusable. 1e308 * 1000 overflows
    // to Infinity, so the point reached the renderer with ts: null in JSON and
    // the polyline's change detection read it as a real timestamp.
    const IMPOSSIBLE_TRACK_POINTS: Array<[string, unknown]> = [
        ["a latitude past the north pole", { latitude: 91, longitude: 0, timestamp: POSITION.timestamp }],
        ["a latitude past the south pole", { latitude: -91, longitude: 0, timestamp: POSITION.timestamp }],
        ["a longitude past the antimeridian", { latitude: 0, longitude: 181, timestamp: POSITION.timestamp }],
        ["a longitude past the antimeridian the other way", { latitude: 0, longitude: -181, timestamp: POSITION.timestamp }],
        ["a timestamp whose millisecond conversion overflows", { latitude: 0, longitude: 0, timestamp: 1e308 }],
        ["a timestamp past the Date range", { latitude: 0, longitude: 0, timestamp: 1e20 }],
    ];

    for (const [label, point] of IMPOSSIBLE_TRACK_POINTS) {
        it(`drops ${label} and keeps the usable points around it`, () => {
            const entities = mapIssPayload("iss", {
                ...ENVELOPE,
                track: [TRACK[0], point, TRACK[1]],
            });

            expect(entities[0].properties.history).toEqual(MAPPED_TRACK);
        });
    }

    it("keeps track points on the coordinate boundaries and at the origin", () => {
        const track: IssTrackPoint[] = [
            { latitude: -90, longitude: -180, timestamp: 1791093126 },
            { latitude: 90, longitude: 180, timestamp: 1791093186 },
            { latitude: 0, longitude: 0, timestamp: 1791093306 },
        ];

        const entities = mapIssPayload("iss", { ...ENVELOPE, track });

        expect(entities[0].properties.history).toEqual(
            track.map((point) => ({ ...point, ts: point.timestamp * 1000 }))
        );
    });
});

