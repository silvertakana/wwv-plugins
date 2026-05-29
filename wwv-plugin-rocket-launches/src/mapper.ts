/**
 * Pure mapper: converts a Launch Library 2 launch object to a GeoEntity.
 * Exported for unit testing.
 */
import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";
import { dtProp, urlProp, imageProp, videoProp } from "@worldwideview/wwv-plugin-sdk";

/** Narrow interface for only the LL2 launch fields this plugin uses. */
export interface LL2Launch {
    id: string;
    name: string;
    slug?: string;
    url?: string;
    status?: {
        id?: number;
        name?: string;
        abbrev?: string;
    };
    net?: string;
    net_precision?: { abbrev?: string };
    window_start?: string;
    window_end?: string;
    probability?: number | null;
    weather_concerns?: string | null;
    last_updated?: string;
    image?: string | null;
    webcast_live?: boolean;
    vidURLs?: Array<{
        url?: string;
        title?: string;
        source?: string;
        publisher?: string;
        type?: { name?: string };
    }>;
    holdreason?: string | null;
    failreason?: string | null;
    rocket?: {
        configuration?: {
            full_name?: string;
            family?: string;
            reusable?: boolean;
        };
    };
    launch_service_provider?: {
        name?: string;
        abbrev?: string;
        type?: string;
        country_code?: string;
    };
    mission?: {
        name?: string;
        description?: string;
        type?: { name?: string };
        orbit?: { abbrev?: string };
    };
    pad?: {
        name?: string;
        latitude?: string | null;
        longitude?: string | null;
        map_url?: string;
        wiki_url?: string;
        location?: {
            name?: string;
            country_code?: string;
        };
    };
}

/** Time-window bucket for the "Launch Window" filter. Values match the filter options. */
export type TimeBucket = "past" | "next-7d" | "next-30d" | "next-90d" | "beyond-90d";

const DAY_MS = 86_400_000;

/** Classify a launch's NET (epoch ms) relative to `now` into a coarse window bucket. */
export function timeBucket(netMs: number, now: number): TimeBucket {
    if (netMs < now) return "past";
    const days = (netMs - now) / DAY_MS;
    if (days <= 7) return "next-7d";
    if (days <= 30) return "next-30d";
    if (days <= 90) return "next-90d";
    return "beyond-90d";
}

/**
 * Maps a single LL2 launch object to a GeoEntity.
 * Returns null when the pad is missing or has non-numeric coordinates.
 * `now` (epoch ms) is injected so the time_bucket is deterministic and unit-testable.
 */
export function mapLaunchToEntity(launch: LL2Launch, now: number = Date.now()): GeoEntity | null {
    if (!launch.pad?.latitude || !launch.pad?.longitude) return null;

    const lat = parseFloat(launch.pad.latitude);
    const lon = parseFloat(launch.pad.longitude);

    if (isNaN(lat) || isNaN(lon)) return null;

    const netMs = launch.net ? new Date(launch.net).getTime() : 0;

    return {
        id: `rocket-launches-${launch.id}`,
        pluginId: "rocket-launches",
        latitude: lat,
        longitude: lon,
        altitude: 0,
        timestamp: new Date(launch.net ?? 0),
        label: launch.name,
        properties: {
            // Core identity
            slug: launch.slug,
            launch_url: urlProp(launch.url),

            // Status
            status_id: launch.status?.id,
            status_name: launch.status?.name,
            status_abbrev: launch.status?.abbrev,
            last_updated: dtProp(launch.last_updated),

            // Timing
            net: dtProp(launch.net),
            time_bucket: timeBucket(netMs, now),
            net_precision: launch.net_precision?.abbrev,
            window_start: dtProp(launch.window_start),
            window_end: dtProp(launch.window_end),
            probability: launch.probability ?? null,
            weather_concerns: launch.weather_concerns ?? null,

            // Vehicle
            rocket_name: launch.rocket?.configuration?.full_name,
            rocket_family: launch.rocket?.configuration?.family,
            rocket_reusable: launch.rocket?.configuration?.reusable,

            // Provider
            provider_name: launch.launch_service_provider?.name,
            provider_abbrev: launch.launch_service_provider?.abbrev,
            provider_type: launch.launch_service_provider?.type,
            provider_country: launch.launch_service_provider?.country_code,

            // Mission
            mission_name: launch.mission?.name,
            mission_description: launch.mission?.description,
            mission_type: launch.mission?.type?.name,
            orbit: launch.mission?.orbit?.abbrev,

            // Pad and location
            pad_name: launch.pad?.name,
            pad_location: launch.pad?.location?.name,
            pad_country: launch.pad?.location?.country_code,
            pad_map_url: urlProp(launch.pad?.map_url),
            pad_wiki_url: urlProp(launch.pad?.wiki_url),

            // Media — flatten vidURLs (array of objects) to primitives so the
            // generic detail panel can render them (it stringifies values; an
            // array of objects would show as "[object Object]").
            image: imageProp(launch.image ?? null),
            webcast_live: launch.webcast_live,
            webcast_url: videoProp(launch.vidURLs?.[0]?.url ?? null),
            webcast_count: launch.vidURLs?.length ?? 0,

            // Hold/fail reasons
            holdreason: launch.holdreason ?? null,
            failreason: launch.failreason ?? null,
        },
    };
}
