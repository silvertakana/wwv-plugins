import { Map } from "lucide-react";
import type {
    WorldPlugin,
    GeoEntity,
    TimeRange,
    PluginContext,
    LayerConfig,
    CesiumEntityOptions,
} from "@worldwideview/wwv-plugin-sdk";

export class BordersPlugin implements WorldPlugin {
    id = "borders";
    name = "Borders & Labels";
    description = "Displays political borders and country labels on the map.";
    icon = Map;
    category = "custom" as const;
    version = "1.0.0";

    async initialize(_ctx: PluginContext): Promise<void> { }
    destroy(): void { }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        // Rendering is managed by BordersManager in GlobeView
        return [];
    }

    getPollingInterval(): number { return 9999999; }

    getLayerConfig(): LayerConfig {
        return { color: "#00ffff", clusterEnabled: false, clusterDistance: 0, maxEntities: 0 };
    }

    renderEntity(_entity: GeoEntity): CesiumEntityOptions {
        return { type: "point" };
    }
}
