import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";

const DEFAULT_CAMERA_ALT = 8;

export function mapRawCamera(cam: Record<string, unknown>, index: number, prefix: string): GeoEntity {
    return {
        id: `camera-${prefix}-${index}`,
        pluginId: "camera",
        latitude: cam.latitude as number,
        longitude: cam.longitude as number,
        altitude: (cam.altitude as number) ?? (cam.elevation as number) ?? DEFAULT_CAMERA_ALT,
        timestamp: new Date(),
        label: (cam.city as string) || (cam.country as string) || "Unknown Camera",
        properties: { ...cam },
    };
}

export function mapGeoJsonFeature(feature: unknown, index: number, prefix: string): GeoEntity {
    const f = feature as { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> };
    const [lon, lat] = f.geometry?.coordinates ?? [0, 0];
    const props = f.properties ?? {};
    return {
        id: `camera-${prefix}-${index}`,
        pluginId: "camera",
        latitude: lat,
        longitude: lon,
        altitude: DEFAULT_CAMERA_ALT,
        timestamp: new Date(),
        label: (props.city as string) || (props.country as string) || "Unknown Camera",
        properties: { ...props },
    };
}
