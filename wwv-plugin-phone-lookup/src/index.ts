import type {
    WorldPlugin,
    GeoEntity,
    TimeRange,
    LayerConfig,
    CesiumEntityOptions,
    PluginContext,
} from "@worldwideview/wwv-plugin-sdk";
import { createSvgIconUrl } from "@worldwideview/wwv-plugin-sdk";
import { Phone } from "lucide-react";
import pkg from "../package.json";
import { setDataUpdateCallback, getCurrentEntities } from "./phoneStore";
import PhoneLookupSidebar from "./PhoneLookupSidebar";

const PHONE_ICON_URL = createSvgIconUrl(Phone, {
    color: "#facc15",
    background: false,
});

// No live data source -- entities only change when the user runs a lookup.
const POLL_INTERVAL_MS = 60 * 60 * 1000;

const phoneLookupPlugin: WorldPlugin = {
    id: "phone-lookup",
    name: "Phone Number Lookup",
    description: "OSINT tool: country/region and number type from a phone number's dialing-code format",
    icon: "Phone",
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
            color: "#facc15",
            iconUrl: PHONE_ICON_URL,
            clusterEnabled: false,
            clusterDistance: 0,
            maxEntities: 50,
        };
    },

    renderEntity(_entity: GeoEntity): CesiumEntityOptions {
        return {
            type: "billboard",
            iconUrl: PHONE_ICON_URL,
            iconScale: 0.7,
        };
    },

    getSidebarComponent() {
        return PhoneLookupSidebar;
    },
};

export default phoneLookupPlugin;
