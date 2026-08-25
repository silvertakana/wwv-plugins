import { Zap } from "lucide-react";
import {
    type WorldPlugin,
    type GeoEntity,
    type TimeRange,
    type PluginContext,
    type LayerConfig,
    type CesiumEntityOptions,
    type ServerPluginConfig,
} from "@worldwideview/wwv-plugin-sdk";
import pkg from "../package.json";

/** Raw shape of one item from the lightning data engine (Blitzortung strokes). */
interface LightningItem {
    id: string; // `${src}/${id}`
    latitude: number;
    longitude: number;
    timestamp: string | null;
    amplitude: number | null; // accuracy diameter (m)
    serverDelayMs: number | null;
    src: number | null;
}

export class LightningPlugin implements WorldPlugin {
    id = "lightning";
    name = "Lightning";
    description = "Live lightning strikes from the Blitzortung network via the data engine (informational overlay, not a storm-warning system)";
    icon = Zap;
    category = "natural-disaster" as const;
    version = pkg.version;

    private context: PluginContext | null = null;

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/lightning`);
            if (!res.ok) throw new Error(`Lightning API returned ${res.status}`);
            const data = await res.json();
            if (!data.items || !Array.isArray(data.items)) return [];

            return data.items
                .map((item: LightningItem): GeoEntity | null => {
                    const lat = Number(item.latitude);
                    const lon = Number(item.longitude);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                    const ts = item.timestamp ? new Date(item.timestamp) : new Date();
                    return {
                        id: item.id,
                        pluginId: this.id,
                        latitude: lat,
                        longitude: lon,
                        timestamp: Number.isNaN(ts.getTime()) ? new Date() : ts,
                        label: "Lightning strike",
                        properties: {
                            amplitude: item.amplitude,
                            serverDelayMs: item.serverDelayMs,
                            src: item.src,
                        },
                    };
                })
                .filter((entity: GeoEntity | null): entity is GeoEntity => entity !== null);
        } catch (err) {
            console.error("[LightningPlugin] Fetch error:", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return {
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/lightning",
            pollingIntervalMs: 0,
            historyEnabled: false, // ephemeral high-frequency feed — no SQLite history
        };
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#facc15",
            clusterEnabled: true,
            clusterDistance: 30,
            maxEntities: 10000,
        };
    }

    renderEntity(_entity: GeoEntity): CesiumEntityOptions {
        return {
            type: "point",
            color: "#facc15",
            size: 4,
            outlineColor: "#1e293b",
            outlineWidth: 1,
        };
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [{ label: "Lightning strike", color: "#facc15" }];
    }
}