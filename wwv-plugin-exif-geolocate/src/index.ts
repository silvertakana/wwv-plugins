import type {
    WorldPlugin,
    GeoEntity,
    TimeRange,
    LayerConfig,
    CesiumEntityOptions,
    PluginContext,
} from "@worldwideview/wwv-plugin-sdk";
import { createSvgIconUrl } from "@worldwideview/wwv-plugin-sdk";
import { MapPinned } from "lucide-react";
import pkg from "../package.json";
import { setDataUpdateCallback, getCurrentEntities } from "./photoStore";
import PhotoUploadSidebar from "./PhotoUploadSidebar";

const PHOTO_ICON_URL = createSvgIconUrl(MapPinned, {
    color: "#a78bfa",
    background: false,
});

// No live data source to poll -- entities only change when the user uploads
// a photo (photoStore pushes updates directly via onDataUpdate). A long
// interval just re-confirms the same in-memory state.
const POLL_INTERVAL_MS = 60 * 60 * 1000;

const exifGeolocatePlugin: WorldPlugin = {
    id: "exif-geolocate",
    name: "Photo Geolocation",
    description: "OSINT tool: upload a photo to extract its GPS location from EXIF metadata, if present",
    icon: "MapPinned",
    category: "intelligence",
    version: pkg.version,

    async initialize(ctx: PluginContext): Promise<void> {
        setDataUpdateCallback(ctx.onDataUpdate);
    },

    destroy(): void {
        setDataUpdateCallback(() => {});
    },

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        return getCurrentEntities();
    },

    getPollingInterval(): number {
        return POLL_INTERVAL_MS;
    },

    getLayerConfig(): LayerConfig {
        return {
            color: "#a78bfa",
            iconUrl: PHOTO_ICON_URL,
            clusterEnabled: false,
            clusterDistance: 0,
            maxEntities: 50,
        };
    },

    renderEntity(_entity: GeoEntity): CesiumEntityOptions {
        return {
            type: "billboard",
            iconUrl: PHOTO_ICON_URL,
            iconScale: 0.7,
        };
    },

    getSidebarComponent() {
        return PhotoUploadSidebar;
    },
};

export default exifGeolocatePlugin;
