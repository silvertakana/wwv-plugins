import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";
import { imageProp, dtProp } from "@worldwideview/wwv-plugin-sdk";

export interface UploadedPhoto {
    fileName: string;
    latitude: number;
    longitude: number;
    thumbnailUrl: string;
    dateTaken: string | null;
    cameraMake: string | null;
    cameraModel: string | null;
    altitudeMeters: number | null;
}

// Session-only, in-memory: uploaded photos aren't persisted anywhere and
// disappear on reload -- this is a client-side lookup tool, not a data feed.
let photos: UploadedPhoto[] = [];
let notifyDataUpdate: ((entities: GeoEntity[]) => void) | null = null;

export function setDataUpdateCallback(cb: (entities: GeoEntity[]) => void): void {
    notifyDataUpdate = cb;
}

function toEntities(): GeoEntity[] {
    const now = new Date();
    return photos.map((p, i) => ({
        id: `exif-photo-${i}-${p.fileName}`,
        pluginId: "exif-geolocate",
        latitude: p.latitude,
        longitude: p.longitude,
        timestamp: now,
        label: p.fileName,
        properties: {
            photo: imageProp(p.thumbnailUrl),
            file_name: p.fileName,
            coordinates: `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`,
            date_taken: dtProp(p.dateTaken),
            camera: p.cameraMake || p.cameraModel ? `${p.cameraMake ?? ""} ${p.cameraModel ?? ""}`.trim() : null,
            altitude: p.altitudeMeters !== null ? `${Math.round(p.altitudeMeters)} m` : null,
        },
    }));
}

export function addUploadedPhoto(photo: UploadedPhoto): void {
    photos = [...photos, photo];
    notifyDataUpdate?.(toEntities());
}

export function getCurrentEntities(): GeoEntity[] {
    return toEntities();
}
