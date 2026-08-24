import { CloudSun } from "lucide-react";
import {
    dtProp,
    type WorldPlugin,
    type GeoEntity,
    type TimeRange,
    type PluginContext,
    type LayerConfig,
    type CesiumEntityOptions,
    type FilterDefinition,
    type ServerPluginConfig,
} from "@worldwideview/wwv-plugin-sdk";
import pkg from "../package.json";

/**
 * Raw shape of one item from the space weather data engine.
 * `kind` is "aurora-oval" for geo points or "kp-index" for the global
 * planetary Kp value (positioned at 0,0 by the engine).
 */
interface AuroraItem {
    id: string;
    kind: "aurora-oval" | "kp-index";
    lat: number | null;
    lon: number | null;
    intensity: number | null;
    kpIndex: number | null;
    observedAt: string | null;
    forecastTime: string | null;
}

/** Aurora intensity -> color. Low is blue, mid is green, high is orange, extreme is near-white (like real aurora). */
function intensityToColor(intensity: number): string {
    if (intensity < 3) return "#3b82f6";
    if (intensity < 6) return "#22c55e";
    if (intensity < 8) return "#f97316";
    return "#fafaf9";
}

/** Aurora intensity -> point size in px. */
function intensityToSize(intensity: number): number {
    return 3 + Math.min(12, intensity) * 1.1;
}

function getIntensityBand(intensity: number): string {
    if (intensity < 3) return "low";
    if (intensity < 6) return "mid";
    if (intensity < 8) return "high";
    return "extreme";
}

export class SpaceWeatherAuroraPlugin implements WorldPlugin {
    id = "space-weather-aurora";
    name = "Aurora Forecast";
    description = "Aurora oval intensity forecasts from the space weather data engine";
    icon = CloudSun;
    category = "space" as const;
    version = pkg.version;

    private context: PluginContext | null = null;

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/space-weather-aurora`);
            if (!res.ok) throw new Error(`Space weather aurora API returned ${res.status}`);
            const data = await res.json();
            if (!Array.isArray(data.items)) return [];

            return data.items
                .filter((item: AuroraItem) => item.kind === "aurora-oval")
                .map((item: AuroraItem): GeoEntity | null => {
                    const lat = Number(item.lat);
                    const lon = Number(item.lon);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                    const intensity = Number(item.intensity) || 0;
                    const observedAt = item.observedAt || item.forecastTime || null;
                    return {
                        id: item.id,
                        pluginId: this.id,
                        latitude: lat,
                        longitude: lon,
                        timestamp: observedAt ? new Date(observedAt) : new Date(),
                        label: `Aurora intensity ${intensity}`,
                        properties: {
                            kind: item.kind,
                            intensity,
                            intensity_band: getIntensityBand(intensity),
                            kpIndex: item.kpIndex,
                            observedAt: dtProp(item.observedAt ?? null),
                            forecastTime: dtProp(item.forecastTime ?? null),
                        },
                    };
                })
                .filter((entity: GeoEntity | null): entity is GeoEntity => entity !== null);
        } catch (err) {
            console.error("[SpaceWeatherAuroraPlugin] Fetch error:", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return {
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/space-weather-aurora",
            pollingIntervalMs: 0,
            historyEnabled: true,
        };
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#22c55e",
            clusterEnabled: true,
            clusterDistance: 25,
            maxEntities: 10000,
        };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const intensity = Number(entity.properties.intensity) || 0;
        return {
            type: "point",
            color: intensityToColor(intensity),
            size: intensityToSize(intensity),
            outlineColor: "#1e293b",
            outlineWidth: 1,
            labelText: entity.label,
        };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "intensity", label: "Intensity", type: "range",
                propertyKey: "intensity", range: { min: 0, max: 10, step: 1 },
            },
            {
                id: "intensity_band", label: "Intensity Band", type: "select",
                propertyKey: "intensity_band",
                options: [
                    { value: "low", label: "Low (< 3)" },
                    { value: "mid", label: "Mid (3 - 5)" },
                    { value: "high", label: "High (6 - 7)" },
                    { value: "extreme", label: "Extreme (>= 8)" },
                ],
            },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Intensity < 3 (Low)", color: "#3b82f6", filterId: "intensity", filterValue: "0" },
            { label: "Intensity 3 - 5 (Mid)", color: "#22c55e", filterId: "intensity", filterValue: "3" },
            { label: "Intensity 6 - 7 (High)", color: "#f97316", filterId: "intensity", filterValue: "6" },
            { label: "Intensity >= 8 (Extreme)", color: "#fafaf9", filterId: "intensity", filterValue: "8" },
        ];
    }
}