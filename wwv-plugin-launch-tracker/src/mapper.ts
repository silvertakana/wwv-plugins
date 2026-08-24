/**
 * Pure mapper: converts a launch item — either an engine-normalised item from
 * the launch-tracker seeder or, defensively, a raw Launch Library 2 (LL2)
 * 2.3.0 launch object — into a GeoEntity. Exported for unit testing.
 */
import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";
import { urlProp, imageProp } from "@worldwideview/wwv-plugin-sdk";

/** Engine-normalised item shape (what /api/launch-tracker returns). */
export interface NormalisedLaunchItem {
    id: string | number;
    name: string;
    net?: string | null;
    status?: string | null;
    statusId?: number | null;
    padName?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    location?: string | null;
    mission?: string | null;
    rocket?: string | null;
    provider?: string | null;
    url?: string | null;
    webcast_live?: boolean;
}

/** Raw LL2 2.3.0 launch object (defensive mapping path). */
export interface RawLL2Launch {
    id: string | number;
    name: string;
    url?: string | null;
    net?: string | null;
    status?: { id?: number | null; name?: string | null; abbrev?: string | null } | null;
    pad?: {
        name?: string | null;
        latitude?: number | string | null;
        longitude?: number | string | null;
        location?: { name?: string | null } | null;
    } | null;
    mission?:
        | { name?: string | null; type?: string | { name?: string | null } | null } | null;
    rocket?: {
        configuration?: { name?: string | null; family?: string | null; families?: Array<{ name?: string | null }> } | null;
    } | null;
    launch_service_provider?: { name?: string | null } | null;
    provider?: { name?: string | null } | null;
    webcast_live?: boolean;
    image?: string | { image_url?: string | null } | null;
}

export type LaunchItem = NormalisedLaunchItem | RawLL2Launch;

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

/** Plain non-empty string or null. */
function str(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

/** Coerce a coordinate to a finite number; null/undefined/empty never become 0. */
function coord(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/** Extract a string image URL from LL2's image field (string in 2.2.0, object in 2.3.0). */
function imageUrl(image: unknown): string | null {
    if (typeof image === "string") return str(image);
    if (image && typeof image === "object") return str((image as { image_url?: unknown }).image_url);
    return null;
}

/**
 * Maps a single launch item to a GeoEntity. Skips items without finite pad
 * coordinates or a parseable NET. `now` (epoch ms) is injected so the
 * time_bucket is deterministic and unit-testable.
 */
export function mapLaunchItemToEntity(item: LaunchItem, now: number = Date.now()): GeoEntity | null {
    const raw = item as RawLL2Launch;
    const norm = item as NormalisedLaunchItem;

    // Engine items carry flat latitude/longitude; raw LL2 carries pad.*.
    const lat = coord(norm.latitude ?? raw.pad?.latitude);
    const lon = coord(norm.longitude ?? raw.pad?.longitude);
    if (lat === null || lon === null) return null;

    const netIso = str(norm.net ?? raw.net);
    const netMs = netIso ? Date.parse(netIso) : NaN;
    if (!Number.isFinite(netMs)) return null;

    const missionRaw = raw.mission;
    const missionTypeRaw = missionRaw?.type;
    const missionType =
        typeof missionTypeRaw === "string" ? str(missionTypeRaw) : str(missionTypeRaw?.name);

    const rocketFamily =
        str(raw.rocket?.configuration?.family) ?? str(raw.rocket?.configuration?.families?.[0]?.name) ?? null;
    const provider =
        str(raw.provider?.name) ?? str(raw.launch_service_provider?.name) ?? str(norm.provider) ?? rocketFamily;

    return {
        id: `launch-tracker-${item.id}`,
        pluginId: "launch-tracker",
        latitude: lat,
        longitude: lon,
        altitude: 0,
        timestamp: new Date(netMs),
        label: item.name,
        properties: {
            net: netIso,
            status: str(raw.status?.name) ?? str(norm.status),
            statusId: raw.status?.id ?? norm.statusId ?? null,
            padName: str(raw.pad?.name) ?? str(norm.padName),
            location: str(raw.pad?.location?.name) ?? str(norm.location),
            mission: str(missionRaw?.name) ?? str(norm.mission),
            missionType,
            rocket: str(raw.rocket?.configuration?.name) ?? str(norm.rocket),
            rocketFamily,
            provider,
            time_bucket: timeBucket(netMs, now),
            webcastLive: raw.webcast_live ?? norm.webcast_live ?? false,
            launchUrl: urlProp(str(raw.url ?? norm.url)),
            image: imageProp(imageUrl(raw.image)),
        },
    };
}