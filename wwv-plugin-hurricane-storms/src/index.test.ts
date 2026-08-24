import { describe, it, expect } from "vitest";
import { HurricaneStormsPlugin, mapActiveStormToEntity, severityColor, severitySize, type NhcActiveStorm } from "./index";

// ---- Fixture -----------------------------------------------------------------

const STORM: NhcActiveStorm = {
    id: 1,
    name: "AL052026",
    classification: "HU",
    intensity: 120,
    pressure: 955,
    latitudeNumeric: 25.4,
    longitudeNumeric: -78.2,
    movementDir: "NW",
    movementSpeed: 12,
    lastUpdate: "2026-08-24T12:00:00Z",
    publicAdvisory: { url: "https://www.nhc.noaa.gov/archive/2026/al05/public/" },
    forecastDiscussion: { url: "https://www.nhc.noaa.gov/archive/2026/al05/dis/" },
    forecastTrack: {
        kmzFile: "https://www.nhc.noaa.gov/storm_graphics/2026/AL052026/AL052026.kmz",
        zipFile: "https://www.nhc.noaa.gov/storm_graphics/2026/AL052026/AL052026.zip",
    },
};

// ---- mapActiveStormToEntity ---------------------------------------------------

describe("mapActiveStormToEntity", () => {
    it("maps a valid active storm to a GeoEntity", () => {
        const entity = mapActiveStormToEntity("hurricane-storms", STORM)!;
        expect(entity).not.toBeNull();
        expect(entity.id).toBe("hurricane-storms-1");
        expect(entity.pluginId).toBe("hurricane-storms");
        expect(entity.latitude).toBe(25.4);
        expect(entity.longitude).toBe(-78.2);
        expect(entity.altitude).toBe(0);
        expect(entity.label).toBe("AL052026");
        expect(entity.timestamp).toBeInstanceOf(Date);
        expect(entity.timestamp.toISOString()).toBe("2026-08-24T12:00:00.000Z");
    });

    it("tags URL properties for the Intel panel", () => {
        const entity = mapActiveStormToEntity("hurricane-storms", STORM)!;
        expect(entity.properties.advisoryUrl).toBe(`url:${STORM.publicAdvisory!.url}`);
        expect(entity.properties.forecastUrl).toBe(`url:${STORM.forecastTrack!.kmzFile}`);
        expect(entity.properties.discussionUrl).toBe(`url:${STORM.forecastDiscussion!.url}`);
        expect(entity.properties.lastUpdate).toBe("datetime:2026-08-24T12:00:00Z");
        expect(entity.properties.intensity).toBe(120);
        expect(entity.properties.pressure).toBe(955);
        expect(entity.properties.movementDir).toBe("NW");
        expect(entity.properties.movementSpeed).toBe(12);
    });

    it("returns null when latitude or longitude is not finite", () => {
        expect(mapActiveStormToEntity("hurricane-storms", { ...STORM, latitudeNumeric: null })).toBeNull();
        expect(mapActiveStormToEntity("hurricane-storms", { ...STORM, longitudeNumeric: null })).toBeNull();
        expect(mapActiveStormToEntity("hurricane-storms", { ...STORM, latitudeNumeric: Number.NaN })).toBeNull();
        expect(mapActiveStormToEntity("hurricane-storms", { ...STORM, longitudeNumeric: "nope" as unknown as number })).toBeNull();
    });

    it("defaults timestamp to now when lastUpdate is missing", () => {
        const before = Date.now();
        const entity = mapActiveStormToEntity("hurricane-storms", { ...STORM, lastUpdate: null })!;
        const after = Date.now();
        expect(entity.timestamp.getTime()).toBeGreaterThanOrEqual(before);
        expect(entity.timestamp.getTime()).toBeLessThanOrEqual(after);
    });
});

// ---- Plugin contract ----------------------------------------------------------

describe("HurricaneStormsPlugin", () => {
    const plugin = new HurricaneStormsPlugin();

    it("exposes the expected identity and version", () => {
        expect(plugin.id).toBe("hurricane-storms");
        expect(plugin.name).toBe("Hurricane Storms");
        expect(plugin.category).toBe("natural-disaster");
        expect(plugin.version).toBe("1.0.0");
    });

    it("serves the engine endpoint contract", () => {
        const cfg = plugin.getServerConfig();
        expect(cfg.apiBasePath).toBe("/api/hurricane-storms");
        expect(cfg.streamUrl).toBe("wss://dataenginev2.worldwideview.dev/stream");
        expect(cfg.pollingIntervalMs).toBe(900000);
        expect(cfg.historyEnabled).toBe(false);
    });

    it("defines a classification select filter", () => {
        const filters = plugin.getFilterDefinitions();
        expect(filters.length).toBeGreaterThanOrEqual(1);
        expect(filters[0].id).toBe("classification");
        expect(filters[0].type).toBe("select");
        expect(filters[0].options?.map((o) => o.value)).toEqual(expect.arrayContaining(["TD", "TS", "HU"]));
    });

    it("provides a legend and an interactive detail component", () => {
        expect(plugin.getLegend()).toHaveLength(4);
        const Detail = plugin.getDetailComponent();
        expect(typeof Detail).toBe("function");
    });

    it("maps severity helpers by wind intensity (mph)", () => {
        expect(severityColor(0)).toBe("#22c55e"); // Tropical depression
        expect(severityColor(50)).toBe("#fcd34d"); // Tropical storm
        expect(severityColor(90)).toBe("#f97316"); // Cat 1-2
        expect(severityColor(130)).toBe("#ef4444"); // Cat 3+
        expect(severitySize(130)).toBe(16);
        expect(severitySize(20)).toBe(6);
    });
});