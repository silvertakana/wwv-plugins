import { ShieldAlert, Rocket, Plane, Target, Bomb } from "lucide-react";
import {
    type GeoEntity,
    type TimeRange,
    type FilterDefinition,
    type ServerPluginConfig,
    urlProp,
    imageProp,
    videoProp,
} from "@worldwideview/wwv-plugin-sdk";
import { BaseIncidentPlugin } from "@worldwideview/wwv-lib-incidents";

function typeToIcon(type: string) {
    switch(type.toLowerCase()) {
        case "missile strike": return Rocket;
        case "air strike": return Plane;
        case "ground combat": return Target;
        case "artillery": return Bomb;
        default: return ShieldAlert;
    }
}

export class IranWarLivePlugin extends BaseIncidentPlugin {
    id = "iranwarlive";
    name = "Iran War Live";
    description = "Live OSINT tracking — Data sourced from IranWarLive.com (Not for Life-Safety)";
    icon = ShieldAlert;
    category = "conflict" as const;
    version = "1.0.2";
    
    protected defaultLayerColor = "#ef4444";
    protected clusterDistance = 40;

    protected getSeverityValue(entity: GeoEntity): number {
        return (entity.properties.casualties as number) || 0;
    }

    protected getSeverityColor(value: number): string {
        return "#ef4444"; // Vivid alert red for all kinetic events
    }

    protected getSeveritySize(value: number): number {
        return 16; // Maintain uniform 0.8 scale size approximately 
    }

    protected getEntityIcon(entity: GeoEntity): any {
        const type = (entity.properties.type as string) || "Unknown";
        return typeToIcon(type);
    }

    private mapPayloadToEntities(data: any): GeoEntity[] {
        const items = Array.isArray(data) ? data : (data.items && Array.isArray(data.items) ? data.items : []);
        
        // Handle single item pushed via websocket
        if (items.length === 0 && !Array.isArray(data)) {
            if (data.event_id || data._osint_meta) {
                items.push(data);
            }
        }

        return items.map((item: any): GeoEntity => {
            const lat = item._osint_meta?.coordinates?.lat || 0;
            const lon = item._osint_meta?.coordinates?.lng || 0;
            const eventTime = new Date(item.timestamp || Date.now());
            const hoursAgo = Math.max(0, Math.round((Date.now() - eventTime.getTime()) / (1000 * 60 * 60)));
            
            return {
                id: item.event_id,
                pluginId: "iranwarlive",
                latitude: lat,
                longitude: lon,
                timestamp: eventTime,
                label: item.type + (item.location ? ` in ${item.location}` : ''),
                properties: {
                    hours_ago: hoursAgo,
                    type: item.type,
                    confidence: item.confidence,
                    location: item.location,
                    summary: item.event_summary,
                    casualties: item._osint_meta?.casualties || 0,
                    source_url: urlProp(item.source_url ?? null),
                    preview_image: imageProp(item.preview_image ?? null),
                    preview_video: videoProp(item.preview_video ?? null)
                },
            };
        });
    }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        // Legacy HTTP fetch removed. Data is now pushed via WebSocket by the seeder.
        return [];
    }

    mapWebsocketPayload(payload: any): GeoEntity[] {
        return this.mapPayloadToEntities(payload);
    }

    getServerConfig(): ServerPluginConfig {
        return { streamUrl: "wss://dataenginev2.worldwideview.dev/stream", apiBasePath: "/api/iranwarlive", pollingIntervalMs: 0, historyEnabled: true };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "type", label: "Strike Type", type: "select", propertyKey: "type",
                options: [
                    { value: "Missile Strike", label: "Missile Strike" }, 
                    { value: "Air Strike", label: "Air Strike" }
                ],
            },
            {
                id: "confidence", label: "Intelligence Confidence", type: "select", propertyKey: "confidence",
                options: [{ value: "News Wire", label: "News Wire" }, { value: "State Actor", label: "State Defense Press" }],
            },
            {
                id: "hours_ago", label: "Max Hours Ago", type: "range", propertyKey: "hours_ago",
                range: { min: 0, max: 168, step: 1 }
            }
        ];
    }

    getLegend() {
        return [
            { label: "Kinetic Event", color: "#ef4444" },
        ];
    }
}
