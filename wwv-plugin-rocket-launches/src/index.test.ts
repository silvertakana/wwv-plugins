import { describe, it, expect } from "vitest";
import { mapLaunchToEntity, timeBucket, type LL2Launch } from "./mapper";

// ---- Fixtures ----------------------------------------------------------------

/** SLC-40 fixture derived from the RESEARCH-rocket-launches.md sample response */
const SLC40_LAUNCH: LL2Launch = {
    id: "384fb817-2a18-46ec-b294-613c08ecea52",
    name: "Falcon 9 Block 5 | Starlink Group 10-53",
    status: { id: 1, name: "Go for Launch", abbrev: "Go" },
    net: "2026-05-29T12:03:09Z",
    net_precision: { abbrev: "SEC" },
    window_start: "2026-05-29T11:52:00Z",
    window_end: "2026-05-29T15:52:00Z",
    probability: 80,
    image: "https://thespacedevs-prod.nyc3.digitaloceanspaces.com/media/images/falcon2520925_image_20221009234147.png",
    webcast_live: false,
    launch_service_provider: {
        name: "SpaceX",
        abbrev: "SpX",
        type: "Commercial",
        country_code: "USA",
    },
    rocket: {
        configuration: {
            full_name: "Falcon 9 Block 5",
            family: "Falcon",
            reusable: true,
        },
    },
    mission: {
        name: "Starlink Group 10-53",
        type: { name: "Communications" },
        orbit: { abbrev: "LEO" },
    },
    pad: {
        name: "Space Launch Complex 40",
        latitude: "28.56194122",
        longitude: "-80.57735736",
        map_url: "https://www.google.com/maps?q=28.56194122,-80.57735736",
        wiki_url: "https://en.wikipedia.org/wiki/Cape_Canaveral",
        location: { name: "Cape Canaveral SFS, FL, USA", country_code: "USA" },
    },
    vidURLs: [
        {
            url: "https://www.youtube.com/watch?v=e98GNsifulw",
            title: "Live: Falcon 9 rocket launches from Cape Canaveral",
            source: "youtube.com",
            publisher: "Spaceflight Now",
            type: { name: "Unofficial Webcast" },
        },
    ],
};

/** Launch with null pad — should be skipped */
const NULL_PAD_LAUNCH: LL2Launch = {
    id: "null-pad-test",
    name: "Mystery Launch",
    pad: { name: "Unknown Pad", latitude: null, longitude: null },
};

/** Launch with empty-string coordinates — should be skipped */
const EMPTY_PAD_LAUNCH: LL2Launch = {
    id: "empty-pad-test",
    name: "Empty Coord Launch",
    pad: { name: "Empty Pad", latitude: "", longitude: "" },
};

/** Launch with no pad object at all — should be skipped */
const NO_PAD_LAUNCH: LL2Launch = {
    id: "no-pad-test",
    name: "No Pad Launch",
};

// ---- Tests -------------------------------------------------------------------

describe("mapLaunchToEntity", () => {
    it("maps a valid SLC-40 launch to a GeoEntity", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH);
        expect(entity).not.toBeNull();
    });

    it("produces the correct id prefix", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        expect(entity.id).toBe("rocket-launches-384fb817-2a18-46ec-b294-613c08ecea52");
    });

    it("sets pluginId to 'rocket-launches'", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        expect(entity.pluginId).toBe("rocket-launches");
    });

    it("parses latitude and longitude as numbers (not strings)", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        expect(typeof entity.latitude).toBe("number");
        expect(typeof entity.longitude).toBe("number");
        expect(entity.latitude).toBeCloseTo(28.56194122);
        expect(entity.longitude).toBeCloseTo(-80.57735736);
    });

    it("sets altitude to 0", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        expect(entity.altitude).toBe(0);
    });

    it("sets label to launch.name", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        expect(entity.label).toBe("Falcon 9 Block 5 | Starlink Group 10-53");
    });

    it("sets timestamp from launch.net", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        expect(entity.timestamp).toBeInstanceOf(Date);
        expect(entity.timestamp.toISOString()).toBe("2026-05-29T12:03:09.000Z");
    });

    it("carries status_abbrev in properties", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        expect(entity.properties.status_abbrev).toBe("Go");
        expect(entity.properties.status_name).toBe("Go for Launch");
        expect(entity.properties.status_id).toBe(1);
    });

    it("carries rocket and provider info in properties", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        expect(entity.properties.rocket_name).toBe("Falcon 9 Block 5");
        expect(entity.properties.provider_name).toBe("SpaceX");
    });

    it("carries orbit and mission type in properties", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        expect(entity.properties.orbit).toBe("LEO");
        expect(entity.properties.mission_type).toBe("Communications");
    });

    it("carries pad location in properties", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        expect(entity.properties.pad_name).toBe("Space Launch Complex 40");
        expect(entity.properties.pad_country).toBe("USA");
    });

    it("does NOT include a top-level 'updates' key in properties", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        expect(entity.properties).not.toHaveProperty("updates");
    });

    it("flattens vidURLs to a primary webcast_url string + webcast_count", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        expect(entity.properties.webcast_url).toBe("video:https://www.youtube.com/watch?v=e98GNsifulw");
        expect(entity.properties.webcast_count).toBe(1);
        // the raw object array must NOT be present (renders as "[object Object]")
        expect(entity.properties).not.toHaveProperty("vidURLs");
    });

    it("yields webcast_url=null and count=0 when there are no videos", () => {
        const entity = mapLaunchToEntity({ ...SLC40_LAUNCH, vidURLs: undefined })!;
        expect(entity.properties.webcast_url).toBeNull();
        expect(entity.properties.webcast_count).toBe(0);
    });

    it("no property value is an object or array (generic panel would show [object Object])", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        for (const [key, value] of Object.entries(entity.properties)) {
            // null/undefined and string/number/boolean are all safe to stringify;
            // objects and arrays are NOT (they render as "[object Object]").
            const isObjectLike = value !== null && typeof value === "object";
            expect(isObjectLike, `property "${key}" is object/array: ${JSON.stringify(value)}`).toBe(false);
        }
    });

    it("returns null when pad latitude is null", () => {
        expect(mapLaunchToEntity(NULL_PAD_LAUNCH)).toBeNull();
    });

    it("returns null when pad coordinates are empty strings", () => {
        expect(mapLaunchToEntity(EMPTY_PAD_LAUNCH)).toBeNull();
    });

    it("returns null when pad object is absent", () => {
        expect(mapLaunchToEntity(NO_PAD_LAUNCH)).toBeNull();
    });

    it("returns null when NaN after parseFloat", () => {
        const nanLaunch: LL2Launch = {
            id: "nan-test",
            name: "NaN Pad",
            pad: { latitude: "not-a-number", longitude: "also-not" },
        };
        expect(mapLaunchToEntity(nanLaunch)).toBeNull();
    });

    it("assigns a time_bucket relative to the injected now", () => {
        const now = Date.parse("2026-05-29T00:00:00Z");
        // SLC40 net is 2026-05-29T12:03:09Z -> same-day future -> next-7d
        const entity = mapLaunchToEntity(SLC40_LAUNCH, now)!;
        expect(entity.properties.time_bucket).toBe("next-7d");
    });

    it("date fields in mapped entity use datetime tag format", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        for (const key of ["net", "window_start", "window_end"] as const) {
            const val = entity.properties[key];
            if (val !== null && val !== undefined) {
                expect(typeof val).toBe("string");
                expect(val as string).toMatch(/^datetime:\d{4}-\d{2}-\d{2}T/);
            }
        }
    });

    it("url fields use url tag format when present", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        for (const key of ["launch_url", "pad_map_url", "pad_wiki_url"] as const) {
            const val = entity.properties[key];
            if (val != null) {
                expect(val as string).toMatch(/^url:/);
            }
        }
    });

    it("image field uses image tag format when present", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        const val = entity.properties.image;
        if (val != null) {
            expect(val as string).toMatch(/^image:/);
        }
    });

    it("webcast_url uses video tag format when present", () => {
        const entity = mapLaunchToEntity(SLC40_LAUNCH)!;
        const val = entity.properties.webcast_url;
        if (val != null) {
            expect(val as string).toMatch(/^video:/);
        }
    });
});

describe("timeBucket", () => {
    const now = Date.parse("2026-05-29T00:00:00Z");
    const at = (days: number) => now + days * 86_400_000;

    it("classifies past launches", () => {
        expect(timeBucket(at(-1), now)).toBe("past");
    });
    it("classifies within 7 days", () => {
        expect(timeBucket(at(3), now)).toBe("next-7d");
        expect(timeBucket(at(7), now)).toBe("next-7d");
    });
    it("classifies 8-30 days", () => {
        expect(timeBucket(at(8), now)).toBe("next-30d");
        expect(timeBucket(at(30), now)).toBe("next-30d");
    });
    it("classifies 31-90 days", () => {
        expect(timeBucket(at(45), now)).toBe("next-90d");
        expect(timeBucket(at(90), now)).toBe("next-90d");
    });
    it("classifies beyond 90 days", () => {
        expect(timeBucket(at(400), now)).toBe("beyond-90d");
    });
});
