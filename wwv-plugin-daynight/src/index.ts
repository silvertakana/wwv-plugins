import { SunMoon } from "lucide-react";
import type {
    WorldPlugin, GeoEntity, TimeRange, PluginContext,
    LayerConfig, CesiumEntityOptions,
} from "@worldwideview/wwv-plugin-sdk";

export class DayNightPlugin implements WorldPlugin {
    id = "daynight";
    name = "Day / Night";
    description = "Real-time day/night terminator with sunlit and shadow regions.";
    icon = SunMoon;
    category = "custom" as const;
    version = "1.0.0";

    async initialize(_ctx: PluginContext): Promise<void> { }
    destroy(): void { }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        // Scene-level plugin — no discrete entities.
        // The host detects id="daynight" and toggles globe.enableLighting.
        return [{
            id: "daynight-scene",
            pluginId: this.id,
            latitude: 0,
            longitude: 0,
            timestamp: new Date(),
            properties: { sceneModifier: true, enableLighting: true },
        }];
    }

    getPollingInterval(): number { return 0; }

    getLayerConfig(): LayerConfig {
        return { color: "#fbbf24", clusterEnabled: false, clusterDistance: 0 };
    }

    renderEntity(_entity: GeoEntity): CesiumEntityOptions {
        // Invisible — the host uses the scene modifier property
        return { type: "point", color: "transparent", size: 0 };
    }
}
