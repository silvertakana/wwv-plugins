import { TreePine } from "lucide-react";
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

interface AlertItem {
    lat: number;
    lon: number;
    alertType?: string;
    confidence?: string | number;
    date?: string;
    url?: string;
}

interface AlertStyle {
    key: string;
    label: string;
    color: string;
}

function alertStyle(alertType: string | undefined): AlertStyle {
    if (alertType === "fire") return { key: "fire", label: "Fire Alert", color: "#f97316" };
    return { key: "deforestation", label: "Forest Loss", color: "#dc2626" };
}

export class DeforestationGFWPlugin implements WorldPlugin {
    id = "deforestation-gfw";
    name = "Deforestation (GFW GLAD)";
    description = "Deforestation and fire alerts from Global Forest Watch GLAD.";
    icon = TreePine;
    category = "custom" as const;
    version = pkg.version;

    private context: PluginContext | null = null;
    private iconUrls: Record<string, string> = {};

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/deforestation-gfw`);
            if (res.status === 404 || !res.ok) {
                console.warn(`[DeforestationGFW] Seeder not deployed; key required (GFW_GLAD_API_KEY). HTTP ${res.status}`);
                return [];
            }
            const data = await res.json();
            if (!data.items || !Array.isArray(data.items)) return [];

            const entities: GeoEntity[] = [];
            data.items.forEach((alert: AlertItem, idx: number) => {
                const { lat, lon } = alert;
                if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
                const style = alertStyle(alert.alertType);
                entities.push({
                    id: `deforestation-gfw-${lat.toFixed(4)},${lon.toFixed(4)}-${idx}`,
                    pluginId: this.id,
                    latitude: lat,
                    longitude: lon,
                    timestamp: alert.date ? new Date(alert.date) : new Date(),
                    label: style.label,
                    properties: {
                        alert_type: style.key,
                        confidence: alert.confidence ?? null,
                        alert_date: dtProp(alert.date),
                        source_url: urlProp(alert.url),
                    },
                });
            });
            return entities;
        } catch (err) {
            console.warn("[DeforestationGFW] Fetch error (seeder likely not deployed):", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return { apiBasePath: "/api/deforestation-gfw", pollingIntervalMs: 0, historyEnabled: true };
    }

    getLayerConfig(): LayerConfig {
        return { color: "#dc2626", clusterEnabled: true, clusterDistance: 30 };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const style = alertStyle(entity.properties.alert_type as string | undefined);
        if (!this.iconUrls[style.color]) {
            this.iconUrls[style.color] = createSvgIconUrl(TreePine, { color: style.color });
        }
        return { type: "billboard", iconUrl: this.iconUrls[style.color], color: style.color, iconScale: 0.9 };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "alert_type", label: "Alert Type", type: "select", propertyKey: "alert_type",
                options: [
                    { value: "deforestation", label: "Forest Loss" },
                    { value: "fire", label: "Fire Alert" },
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
            { label: "Forest Loss", color: "#dc2626", filterId: "alert_type", filterValue: "deforestation" },
            { label: "Fire Alert", color: "#f97316", filterId: "alert_type", filterValue: "fire" },
        ];
    }
}