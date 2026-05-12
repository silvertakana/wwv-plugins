import type { 
    WorldPlugin, 
    GeoEntity, 
    TimeRange, 
    PluginContext, 
    LayerConfig,
    FilterDefinition,
    CesiumEntityOptions,
    ServerPluginConfig
} from "@worldwideview/wwv-plugin-sdk";
import { Hand } from "lucide-react";

export class CivilUnrestPlugin implements WorldPlugin {
    id = "civil-unrest";
    name = "Civil Unrest";
    description = "Tracks global protests, riots, and civil disturbances via GDELT.";
    icon = Hand;
    category = "conflict" as const;
    version = "1.1.0";
    context?: PluginContext;

    async initialize(ctx: PluginContext): Promise<void> {
        this.context = ctx;
        console.log("[CivilUnrestPlugin] Initialized.");
    }

    destroy(): void {}
    
    getPollingInterval(): number {
        return 900000;
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#eab308",
            clusterEnabled: true,
            clusterDistance: 50,
            minZoomLevel: 3
        };
    }

    getServerConfig(): ServerPluginConfig {
        return { streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/civil-unrest",
            pollingIntervalMs: 43200000, 
            historyEnabled: false,
            availabilityEnabled: false
        };
    }

    async fetch(timeRange: TimeRange): Promise<GeoEntity[]> {
        let engineBase = this.context?.getEngineUrl() || "https://dataengine.worldwideview.dev";
        engineBase = engineBase.replace(/\/$/, "");
        const res = await fetch(`${engineBase}/api/civil-unrest`);
        const json = await res.json();
        
        const payload = json.data;
        if (!payload) return [];

        const items = Array.isArray(payload) ? payload : (payload.items || []);
        
        return items.map((item: any) => {
            const TS = item.date ? new Date(item.date).getTime() : undefined;
            return {
                id: item.id,
                latitude: item.lat,
                longitude: item.lon,
                timestamp: !Number.isNaN(TS) ? TS : undefined,
                name: `${item.type}: ${item.location || 'Unknown'}`,
                properties: {
                type: item.type,
                subType: item.subType,
                actor1: item.actor1,
                actor2: item.actor2,
                fatalities: item.fatalities,
                country: item.country,
                location: item.location,
                date: item.date,
                source: item.source,
                notes: item.notes,
                reportCount: item.reportCount
            }
        };
        });
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "type",
                label: "Event Type",
                type: "select",
                propertyKey: "type",
                options: [
                    { value: "Protests", label: "Protests" },
                    { value: "Riots", label: "Riots" },
                    { value: "Demonstrations", label: "Demonstrations" },
                    { value: "Strikes", label: "Labor Strikes" }
                ]
            }
        ];
    }

    getLegend() {
        return [
            { label: "Riots/Violent", color: "#ef4444" },
            { label: "Demonstrations", color: "#f97316" },
            { label: "Peaceful Protests", color: "#eab308" },
            { label: "Strikes", color: "#3b82f6" },
        ];
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const type = (entity.properties?.type as string) || "";
        const reportCount = (entity.properties?.reportCount as number) || 1;
        
        let color = "#eab308"; 
        if (type.includes("Riots") || type.includes("clash")) {
            color = "#ef4444"; 
        } else if (type.includes("Demonstration")) {
            color = "#f97316"; 
        } else if (type.includes("Strike")) {
            color = "#3b82f6";
        }

        let size = 8;
        if (reportCount > 50) size = 16;
        else if (reportCount > 15) size = 12;

        return {
            type: "point",
            color,
            size,
            outlineColor: "#000000",
            outlineWidth: 2
        };
    }
}
