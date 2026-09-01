import { describe, it, expect } from "vitest";
import { MarineBuoysPlugin, mapBuoyToEntity, type BuoyObservation } from "./index";

// ---- Fixture -----------------------------------------------------------------

const ROW: BuoyObservation = {
    stn: "22101",
    lat: 36.9,
    lon: -76.4,
    year: 2026,
    month: 9,
    day: 1,
    hour: 12,
    minute: 0,
    wdir: 109,
    wspd: 11.4,
    gst: 13.6,
    wvht: 1.2,
    dpd: 6.2,
    apd: 4.1,
    mwd: 90,
    pres: 1016.2,
    ptdy: null,
    atmp: 18.8,
    wtmp: 26.1,
    dewp: null,
    vis: null,
    tide: null,
};

// ---- mapBuoyToEntity ----------------------------------------------------------

describe("mapBuoyToEntity", () => {
    it("maps a valid buoy row to a GeoEntity with numeric wvht", () => {
        const entity = mapBuoyToEntity("marine-buoys", ROW)!;
        expect(entity).not.toBeNull();
        expect(entity.id).toBe("marine-buoys-22101");
        expect(entity.properties.wvht).toBe(1.2);
        expect(entity.properties.wspd).toBe(11.4);
    });

    it("keeps null wvht as null (no crash, tractable 'no data' state)", () => {
        const entity = mapBuoyToEntity("marine-buoys", { ...ROW, wvht: null })!;
        expect(entity).not.toBeNull();
        expect(entity.properties.wvht).toBeNull();
        expect(entity.properties.wspd).toBe(11.4);
    });

    it("treats the NDBC -99.99 missing sentinel as null for wvht", () => {
        const entity = mapBuoyToEntity("marine-buoys", { ...ROW, wvht: -99.99 } as BuoyObservation)!;
        expect(entity.properties.wvht).toBeNull();
    });

    it("returns null when lat/lon are missing", () => {
        expect(mapBuoyToEntity("marine-buoys", { ...ROW, lat: null })).toBeNull();
        expect(mapBuoyToEntity("marine-buoys", { ...ROW, lon: null })).toBeNull();
    });
});

// ---- Render path (severity uses wvht) ----------------------------------------

describe("MarineBuoysPlugin", () => {
    it("does not throw and renders a defined state when wvht is null", () => {
        const plugin = new MarineBuoysPlugin();
        const entity = mapBuoyToEntity("marine-buoys", { ...ROW, wvht: null })!;
        expect(() => plugin.renderEntity(entity)).not.toThrow();
        // Null wvht falls back to severity 0 -> calm tier rather than throwing.
        const options = plugin.renderEntity(entity);
        expect(options.type).toBe("billboard");
        expect(options.color).toBe("#22c55e");
    });

    it("keeps valid wvht rendering on the same color scale as before", () => {
        const plugin = new MarineBuoysPlugin();
        const calm = mapBuoyToEntity("marine-buoys", { ...ROW, wvht: 0.5 })!;
        const rough = mapBuoyToEntity("marine-buoys", { ...ROW, wvht: 4.0 })!;
        expect(plugin.renderEntity(calm).color).toBe("#22c55e");
        expect(plugin.renderEntity(rough).color).toBe("#ef4444");
    });

    it("tolerates a raw stream row without a properties bag (no freeze)", () => {
        const plugin = new MarineBuoysPlugin();
        // Raw engine rows from the WS stream lack GeoEntity.properties entirely;
        // the renderer must not throw while accessing properties.wvht.
        const rawRow = { ...ROW, wvht: null } as unknown as import("@worldwideview/wwv-plugin-sdk").GeoEntity;
        expect(() => plugin.renderEntity(rawRow)).not.toThrow();
    });

    it("normalizes WS stream envelopes through mapBuoyToEntity", () => {
        const plugin = new MarineBuoysPlugin();
        const envelope = {
            source: "marine-buoys",
            fetchedAt: "2026-09-01T12:00:00.000Z",
            items: [ROW, { ...ROW, stn: "22102", wvht: null }],
            totalCount: 2,
        };
        const entities = plugin.mapWebsocketPayload(envelope);
        expect(entities).toHaveLength(2);
        expect(entities[0].properties.wvht).toBe(1.2);
        expect(entities[1].properties.wvht).toBeNull();
    });
});