import type {
    WorldPlugin,
    GeoEntity,
    TimeRange,
    LayerConfig,
    CesiumEntityOptions,
    PluginContext,
} from "@worldwideview/wwv-plugin-sdk";
import { createSvgIconUrl } from "@worldwideview/wwv-plugin-sdk";
import { MoonStar } from "lucide-react";
import pkg from "../package.json";

const MOON_ICON_URL = createSvgIconUrl(MoonStar, {
    color: "#e2e8f0",
    background: false,
});

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function normalizeDeg(deg: number): number {
    let d = deg % 360;
    if (d < 0) d += 360;
    return d;
}

/**
 * Sub-lunar point (latitude/longitude directly beneath the moon) using Meeus'
 * low-precision lunar position formula (Astronomical Algorithms ch. 47,
 * truncated series) -- accurate to roughly 0.3 degrees, which is plenty for a
 * visual globe marker and needs no external ephemeris data or network call.
 */
function subLunarPoint(date: Date): { latitude: number; longitude: number } {
    const JD = date.getTime() / 86400000 + 2440587.5;
    const D = JD - 2451545.0; // days since J2000.0

    const Lp = normalizeDeg(218.316 + 13.176396 * D); // mean longitude
    const Mp = normalizeDeg(134.963 + 13.064993 * D) * DEG; // mean anomaly
    const F = normalizeDeg(93.272 + 13.229350 * D) * DEG; // argument of latitude

    const eclipticLon = normalizeDeg(Lp + 6.289 * Math.sin(Mp));
    const eclipticLat = 5.128 * Math.sin(F);

    const obliquity = (23.439 - 0.0000004 * D) * DEG;
    const lonRad = eclipticLon * DEG;
    const latRad = eclipticLat * DEG;

    const ra = Math.atan2(
        Math.sin(lonRad) * Math.cos(obliquity) - Math.tan(latRad) * Math.sin(obliquity),
        Math.cos(lonRad),
    ) * RAD;
    const dec = Math.asin(
        Math.sin(latRad) * Math.cos(obliquity) + Math.cos(latRad) * Math.sin(obliquity) * Math.sin(lonRad),
    ) * RAD;

    // Greenwich Mean Sidereal Time, in degrees
    const gmst = normalizeDeg(280.46061837 + 360.98564736629 * D);

    let longitude = normalizeDeg(ra - gmst);
    if (longitude > 180) longitude -= 360;

    return { latitude: dec, longitude };
}

/**
 * Earth-Moon center distance using the dominant term of Meeus' ch. 47
 * truncated distance series (~20905km amplitude, >90% of the real
 * perigee-apogee swing) -- same "good enough for a marker" tradeoff as
 * subLunarPoint() above, no new dependency or network call.
 */
function moonDistanceKm(date: Date): number {
    const JD = date.getTime() / 86400000 + 2440587.5;
    const D = JD - 2451545.0;
    const Mp = normalizeDeg(134.963 + 13.064993 * D) * DEG;
    return 385000.56 - 20905.355 * Math.cos(Mp);
}

// Informal "supermoon" definition (as popularized by astrologer Richard Nolle,
// widely adopted by NASA/press coverage): a full moon within ~90% of perigee.
// Mean perigee is ~356500km, so 90%-of-the-way-in from the mean distance
// (~385000km) lands around 361000km.
const SUPERMOON_DISTANCE_KM = 361000;

const SYNODIC_MONTH_DAYS = 29.53058867;
// Known new moon reference: 2000-01-06 18:14 UTC
const REFERENCE_NEW_MOON_JD = 2451550.26;

/** Moon phase name + illumination fraction from lunar "age" (days since last new moon). */
function moonPhase(date: Date): { name: string; illuminationPercent: number } {
    const JD = date.getTime() / 86400000 + 2440587.5;
    let age = (JD - REFERENCE_NEW_MOON_JD) % SYNODIC_MONTH_DAYS;
    if (age < 0) age += SYNODIC_MONTH_DAYS;

    const illuminationPercent = Math.round(((1 - Math.cos((2 * Math.PI * age) / SYNODIC_MONTH_DAYS)) / 2) * 100);

    let name: string;
    if (age < 1.84566) name = "New Moon";
    else if (age < 5.53699) name = "Waxing Crescent";
    else if (age < 9.22831) name = "First Quarter";
    else if (age < 12.91963) name = "Waxing Gibbous";
    else if (age < 16.61096) name = "Full Moon";
    else if (age < 20.30228) name = "Waning Gibbous";
    else if (age < 23.99361) name = "Last Quarter";
    else name = "Waning Crescent";

    return { name, illuminationPercent };
}

// The sub-lunar point moves with Earth's rotation (~0.25 deg/min of longitude),
// so a 30s tick gives smooth-enough visual movement without needless recompute.
const POLL_INTERVAL_MS = 30_000;

const moonPlugin: WorldPlugin = {
    id: "moon",
    name: "Moon Tracker",
    description: "Live sub-lunar point -- the spot on Earth directly beneath the moon",
    icon: "MoonStar",
    category: "space",
    version: pkg.version,

    async initialize(_ctx: PluginContext): Promise<void> {},
    destroy(): void {},

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        const now = new Date();
        const { latitude, longitude } = subLunarPoint(now);
        const { name, illuminationPercent } = moonPhase(now);
        const distanceKm = moonDistanceKm(now);
        const isSupermoon = name === "Full Moon" && distanceKm < SUPERMOON_DISTANCE_KM;

        return [{
            id: "moon-sublunar-point",
            pluginId: "moon",
            latitude,
            longitude,
            timestamp: now,
            label: isSupermoon ? "Moon (Supermoon)" : "Moon",
            properties: {
                phase: name,
                illumination: `${illuminationPercent}%`,
                distance_km: `${Math.round(distanceKm).toLocaleString()} km`,
                supermoon: isSupermoon,
                position_note: "Point on Earth directly beneath the moon (approximate, +/-0.3 deg)",
                distance_note: "Position uses a simplified low-precision lunar model; average Earth-Moon distance is ~384,400 km",
            },
        }];
    },

    getPollingInterval(): number {
        return POLL_INTERVAL_MS;
    },

    getLayerConfig(): LayerConfig {
        return {
            color: "#e2e8f0",
            iconUrl: MOON_ICON_URL,
            clusterEnabled: false,
            clusterDistance: 0,
            maxEntities: 1,
        };
    },

    renderEntity(_entity: GeoEntity): CesiumEntityOptions {
        return {
            type: "billboard",
            iconUrl: MOON_ICON_URL,
            iconScale: 0.75,
            labelText: "Moon",
            disableManualHorizonCulling: true,
            disableClustering: true,
        };
    },
};

export default moonPlugin;
