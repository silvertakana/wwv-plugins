import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";
import { EarthquakesPlugin, mapEarthquakeToEntity, type EarthquakeItem } from "./index";

// ---- Fixtures ----------------------------------------------------------------

/** Real row shape from GET https://dataenginev2.worldwideview.dev/api/earthquakes */
const ITEM: EarthquakeItem = {
    id: "us6000tzh0",
    place: "121 km WNW of Chauk, Burma (Myanmar)",
    magnitude: 4.6,
    depth_km: 58.258,
    lat: 21.3382,
    lon: 93.7503,
    occurredAt: 1791093306861,
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/us6000tzh0",
    nearTestSite: false,
    nearestSiteName: null,
};

const ENVELOPE = {
    source: "usgs",
    fetchedAt: "2026-10-02T00:00:00.000Z",
    items: [ITEM],
    totalCount: 1,
};

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/** Minimal PluginContext stand-in; initialize() only stores it. */
function makeContext(engineUrl = "https://engine.test") {
    const onError = vi.fn();
    return {
        context: { getEngineUrl: () => engineUrl, onError } as never,
        onError,
    };
}

beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// ---- mapEarthquakeToEntity ---------------------------------------------------

describe("mapEarthquakeToEntity", () => {
    it("maps every engine field onto the entity", () => {
        const entity = mapEarthquakeToEntity("earthquakes", ITEM)!;
        expect(entity).not.toBeNull();
        expect(entity.id).toBe("earthquakes-us6000tzh0");
        expect(entity.pluginId).toBe("earthquakes");
        expect(entity.latitude).toBe(21.3382);
        expect(entity.longitude).toBe(93.7503);
        expect(entity.altitude).toBe(0);
        expect(entity.timestamp).toBeInstanceOf(Date);
        expect(entity.timestamp.getTime()).toBe(1791093306861);
        expect(entity.label).toBe("M4.6");
        expect(entity.properties.magnitude).toBe(4.6);
        // depth_km is stored under the key the depth filter reads.
        expect(entity.properties.depth).toBe(58.258);
        expect(entity.properties).not.toHaveProperty("depth_km");
        expect(entity.properties.place).toBe("121 km WNW of Chauk, Burma (Myanmar)");
        expect(entity.properties.url).toBe("url:https://earthquake.usgs.gov/earthquakes/eventpage/us6000tzh0");
        expect(entity.properties.occurredAt).toBe("datetime:2026-10-04T05:55:06.861Z");
        expect(entity.properties.nearTestSite).toBe(false);
        expect(entity.properties.nearestSiteName).toBeNull();
        // The engine feed publishes no distance field, so the mapper must not
        // invent a permanently-blank row in the detail panel.
        expect(entity.properties).not.toHaveProperty("distanceToTestSiteKm");
    });

    it("returns null when lat or lon is not finite", () => {
        expect(mapEarthquakeToEntity("earthquakes", { ...ITEM, lat: Number.NaN })).toBeNull();
        expect(mapEarthquakeToEntity("earthquakes", { ...ITEM, lon: Number.POSITIVE_INFINITY })).toBeNull();
    });
});

// ---- fetch -------------------------------------------------------------------

describe("EarthquakesPlugin.fetch", () => {
    it("requests the engine's earthquakes endpoint", async () => {
        const fetchMock = vi.mocked(globalThis.fetch);
        fetchMock.mockResolvedValueOnce(okResponse(ENVELOPE) as Response);

        const plugin = new EarthquakesPlugin();
        const { context } = makeContext();
        await plugin.initialize(context);
        await plugin.fetch({} as never);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toBe("https://engine.test/api/earthquakes");
    });

    it("maps items to entities with the exact field values", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(okResponse(ENVELOPE) as Response);

        const plugin = new EarthquakesPlugin();
        const { context, onError } = makeContext();
        await plugin.initialize(context);
        const entities = await plugin.fetch({} as never);

        expect(entities).toHaveLength(1);
        expect(entities[0].id).toBe("earthquakes-us6000tzh0");
        expect(entities[0].latitude).toBe(21.3382);
        expect(entities[0].longitude).toBe(93.7503);
        expect(entities[0].label).toBe("M4.6");
        expect(entities[0].properties.depth).toBe(58.258);
        expect(onError).not.toHaveBeenCalled();
    });

    it("drops only the rows with non-finite coordinates", async () => {
        const envelope = { ...ENVELOPE, items: [ITEM, { ...ITEM, id: "bad-lat", lat: Number.NaN }, { ...ITEM, id: "bad-lon", lon: null }] };
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(okResponse(envelope) as Response);

        const plugin = new EarthquakesPlugin();
        const { context } = makeContext();
        await plugin.initialize(context);
        const entities = await plugin.fetch({} as never);

        expect(entities).toHaveLength(1);
        expect(entities[0].id).toBe("earthquakes-us6000tzh0");
    });

    it("returns [] when items is missing or not an array", async () => {
        const plugin = new EarthquakesPlugin();
        const { context } = makeContext();
        await plugin.initialize(context);

        vi.mocked(globalThis.fetch).mockResolvedValueOnce(okResponse({ source: "usgs", totalCount: 0 }) as Response);
        expect(await plugin.fetch({} as never)).toEqual([]);

        vi.mocked(globalThis.fetch).mockResolvedValueOnce(okResponse({ items: null }) as Response);
        expect(await plugin.fetch({} as never)).toEqual([]);
    });

    it("returns [] when items is an empty array", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(okResponse({ ...ENVELOPE, items: [], totalCount: 0 }) as Response);

        const plugin = new EarthquakesPlugin();
        const { context } = makeContext();
        await plugin.initialize(context);

        expect(await plugin.fetch({} as never)).toEqual([]);
    });

    it("reports a non-ok response through onError and returns []", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as Response);

        const plugin = new EarthquakesPlugin();
        const { context, onError } = makeContext();
        await plugin.initialize(context);

        expect(await plugin.fetch({} as never)).toEqual([]);
        expect(onError).toHaveBeenCalledTimes(1);
        expect((onError.mock.calls[0][0] as Error).message).toBe("Earthquakes API returned 503");
    });

    it("reports a rejected fetch through onError and returns []", async () => {
        vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("network down"));

        const plugin = new EarthquakesPlugin();
        const { context, onError } = makeContext();
        await plugin.initialize(context);

        expect(await plugin.fetch({} as never)).toEqual([]);
        expect(onError).toHaveBeenCalledTimes(1);
        expect((onError.mock.calls[0][0] as Error).message).toBe("network down");
    });
});

// ---- mapWebsocketPayload -----------------------------------------------------

describe("EarthquakesPlugin.mapWebsocketPayload", () => {
    it("yields the same entities as fetch for the same payload", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(okResponse(ENVELOPE) as Response);

        const plugin = new EarthquakesPlugin();
        const { context } = makeContext();
        await plugin.initialize(context);
        const fetched = await plugin.fetch({} as never);
        const streamed = plugin.mapWebsocketPayload(ENVELOPE);

        expect(streamed).toEqual(fetched);
        expect(streamed[0].id).toBe("earthquakes-us6000tzh0");
        expect(streamed[0].properties.magnitude).toBe(4.6);
        expect(streamed[0].properties.depth).toBe(58.258);
    });

    it("accepts a bare array payload and skips non-finite coordinates", () => {
        const plugin = new EarthquakesPlugin();
        const entities: GeoEntity[] = plugin.mapWebsocketPayload([ITEM, { ...ITEM, id: "bad", lat: Number.NaN }]);

        expect(entities).toHaveLength(1);
        expect(entities[0].id).toBe("earthquakes-us6000tzh0");
    });

    it("drops rows whose occurredAt is missing or unparseable instead of throwing", () => {
        const plugin = new EarthquakesPlugin();
        const { occurredAt: _dropped, ...undated } = ITEM;
        const entities = plugin.mapWebsocketPayload([
            ITEM,
            { ...undated, id: "no-date" },
            { ...ITEM, id: "bad-date", occurredAt: Number.NaN },
        ]);

        expect(entities).toHaveLength(1);
        expect(entities[0].id).toBe("earthquakes-us6000tzh0");
    });

    it("returns [] for a payload with no items", () => {
        const plugin = new EarthquakesPlugin();
        expect(plugin.mapWebsocketPayload({ source: "usgs" })).toEqual([]);
        expect(plugin.mapWebsocketPayload(null)).toEqual([]);
    });
});

// ---- preserved config --------------------------------------------------------

describe("EarthquakesPlugin config", () => {
    it("points at the engine's earthquakes endpoint and stream", () => {
        const plugin = new EarthquakesPlugin();
        expect(plugin.getServerConfig()).toEqual({
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/earthquakes",
            pollingIntervalMs: 0,
            historyEnabled: false,
        });
    });

    it("keeps the magnitude filter's floor at the feed minimum of 4.5", () => {
        const plugin = new EarthquakesPlugin();
        const magnitude = plugin.getFilterDefinitions().find((f) => f.id === "magnitude")!;
        expect(magnitude.propertyKey).toBe("magnitude");
        expect(magnitude.range).toEqual({ min: 4.5, max: 10, step: 0.1 });
    });

    it("renders a point with the magnitude colour band and size", () => {
        const plugin = new EarthquakesPlugin();
        const at = (magnitude: number): GeoEntity => mapEarthquakeToEntity("earthquakes", { ...ITEM, magnitude })!;

        expect(plugin.renderEntity(at(4.6))).toMatchObject({ type: "point", color: "#fcd34d", size: 5, outlineColor: "#000000", outlineWidth: 1 });
        expect(plugin.renderEntity(at(5.4))).toMatchObject({ color: "#f97316", size: 8 });
        expect(plugin.renderEntity(at(6.4))).toMatchObject({ color: "#ef4444", size: 12 });
        expect(plugin.renderEntity(at(7.2))).toMatchObject({ color: "#7f1d1d", size: 16 });
    });
});
