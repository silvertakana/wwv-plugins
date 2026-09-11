import { Ship } from "lucide-react";
import {
    createSvgIconUrl,
    dtProp,
    urlProp,
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

interface VesselActivity {
    lat: number;
    lon: number;
    vesselId?: string;
    type?: string;
    confidence?: string | number;
    darkVessel?: boolean;
    date?: string;
    url?: string;
}

interface VesselStyle {
    key: string;
    label: string;
    color: string;
}

function vesselStyle(a: VesselActivity): VesselStyle {
    if (a.darkVessel) return { key: "dark", label: "Dark Vessel", color: "#8b5cf6" };
    if (a.type === "transit") return { key: "transit", label: "Transit", color: "#2563eb" };
    return { key: "fishing", label: "Fishing", color: "#ef4444" };
}

export class FishingActivityGFWPlugin implements WorldPlugin {
    id = "fishing-activity-gfw";
    name = "Fishing Activity (GFW)";
    description = "Global fishing activity and dark-vessel detections from Global Fishing Watch.";
    icon = Ship;
    category = "maritime" as const;
    version = pkg.version;

    private context: PluginContext | null = null;
    private iconUrls: Record<string, string> = {};

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/fishing-activity-gfw`);
            if (res.status === 404 || !res.ok) {
                console.warn(`[FishingActivityGFW] Seeder not deployed; key required (GFW_API_KEY). HTTP ${res.status}`);
                return [];
            }
            const data = await res.json();
            if (!data.items || !Array.isArray(data.items)) return [];

            const entities: GeoEntity[] = [];
            data.items.forEach((vessel: VesselActivity, idx: number) => {
                const { lat, lon } = vessel;
                if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
                const style = vesselStyle(vessel);
                entities.push({
                    id: `fishing-activity-gfw-${vessel.vesselId ?? `${lat.toFixed(4)},${lon.toFixed(4)}`}-${idx}`,
                    pluginId: this.id,
                    latitude: lat,
                    longitude: lon,
                    timestamp: vessel.date ? new Date(vessel.date) : new Date(),
                    label: style.label + (vessel.vesselId ? ` (${vessel.vesselId})` : ""),
                    properties: {
                        vessel_id: vessel.vesselId ?? null,
                        activity_type: style.key,
                        confidence: vessel.confidence ?? null,
                        dark_vessel: vessel.darkVessel ?? false,
                        observed_at: dtProp(vessel.date),
                        source_url: urlProp(vessel.url),
                    },
                });
            });
            return entities;
        } catch (err) {
            console.warn("[FishingActivityGFW] Fetch error (seeder likely not deployed):", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return { apiBasePath: "/api/fishing-activity-gfw", pollingIntervalMs: 0, historyEnabled: true };
    }

    getLayerConfig(): LayerConfig {
        return { color: "#2563eb", clusterEnabled: true, clusterDistance: 30 };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const activityType = entity.properties.activity_type as string;
        const color =
            activityType === "transit" ? "#2563eb" :
            activityType === "dark" ? "#8b5cf6" : "#ef4444";
        if (!this.iconUrls[color]) {
            this.iconUrls[color] = createSvgIconUrl(Ship, { color });
        }
        return { type: "billboard", iconUrl: this.iconUrls[color], color, iconScale: 0.9 };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "activity_type", label: "Vessel Activity", type: "select", propertyKey: "activity_type",
                options: [
                    { value: "fishing", label: "Fishing" },
                    { value: "transit", label: "Transit" },
                    { value: "dark", label: "Dark Vessel" },
                ],
            },
            {
                id: "confidence", label: "Confidence", type: "select", propertyKey: "confidence",
                options: [
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                ],
            },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Fishing", color: "#ef4444", filterId: "activity_type", filterValue: "fishing" },
            { label: "Transit", color: "#2563eb", filterId: "activity_type", filterValue: "transit" },
            { label: "Dark Vessel", color: "#8b5cf6", filterId: "activity_type", filterValue: "dark" },
        ];
    }
}