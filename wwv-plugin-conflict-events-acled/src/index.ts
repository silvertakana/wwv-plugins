import { Crosshair } from "lucide-react";
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

interface ConflictEvent {
    lat: number;
    lon: number;
    eventType?: string;
    fatalities?: number;
    actor?: string;
    date?: string;
    url?: string;
}

interface EventStyle {
    key: string;
    label: string;
    color: string;
}

const EVENT_STYLES: Record<string, EventStyle> = {
    battles: { key: "battles", label: "Battles", color: "#dc2626" },
    protests: { key: "protests", label: "Protests", color: "#3b82f6" },
    riots: { key: "riots", label: "Riots", color: "#f97316" },
    strategic: { key: "strategic", label: "Strategic Developments", color: "#8b5cf6" },
};

const DEFAULT_EVENT_STYLE: EventStyle = { key: "other", label: "Other", color: "#6b7280" };

function eventStyle(eventType: string | undefined): EventStyle {
    if (eventType && EVENT_STYLES[eventType]) return EVENT_STYLES[eventType];
    return DEFAULT_EVENT_STYLE;
}

/** Scale billboard size by fatalities so higher-casualty events read larger on the globe. */
function eventScale(fatalities: number | undefined): number {
    const f = typeof fatalities === "number" && Number.isFinite(fatalities) ? fatalities : 0;
    if (f <= 0) return 0.8;
    if (f < 10) return 1.0;
    if (f < 100) return 1.2;
    return 1.4;
}

export class ConflictEventsACLEDPlugin implements WorldPlugin {
    id = "conflict-events-acled";
    name = "Conflict Events (ACLED)";
    description = "Global conflict events, protests, and riots from ACLED. KEY-GATED: requires the ACLED_API_KEY seeder on the data engine.";
    icon = Crosshair;
    category = "conflict" as const;
    version = pkg.version;

    private context: PluginContext | null = null;
    private iconUrls: Record<string, string> = {};

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/conflict-events-acled`);
            if (res.status === 404 || !res.ok) {
                console.warn(`[ConflictEventsACLED] Seeder not deployed; key required (ACLED_API_KEY). HTTP ${res.status}`);
                return [];
            }
            const data = await res.json();
            if (!data.items || !Array.isArray(data.items)) return [];

            const entities: GeoEntity[] = [];
            data.items.forEach((event: ConflictEvent, idx: number) => {
                const { lat, lon } = event;
                if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
                const style = eventStyle(event.eventType);
                const fatalities = typeof event.fatalities === "number" ? event.fatalities : 0;
                entities.push({
                    id: `conflict-events-acled-${lat.toFixed(4)},${lon.toFixed(4)}-${idx}`,
                    pluginId: this.id,
                    latitude: lat,
                    longitude: lon,
                    timestamp: event.date ? new Date(event.date) : new Date(),
                    label: `${style.label}${fatalities > 0 ? ` - ${fatalities} fatalities` : ""}${event.actor ? ` (${event.actor})` : ""}`,
                    properties: {
                        event_type: style.key,
                        fatalities,
                        actor: event.actor ?? null,
                        event_date: dtProp(event.date),
                        source_url: urlProp(event.url),
                    },
                });
            });
            return entities;
        } catch (err) {
            console.warn("[ConflictEventsACLED] Fetch error (seeder likely not deployed):", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return { apiBasePath: "/api/conflict-events-acled", pollingIntervalMs: 0, historyEnabled: true };
    }

    getLayerConfig(): LayerConfig {
        return { color: "#dc2626", clusterEnabled: true, clusterDistance: 30 };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const style = eventStyle(entity.properties.event_type as string | undefined);
        if (!this.iconUrls[style.color]) {
            this.iconUrls[style.color] = createSvgIconUrl(Crosshair, { color: style.color });
        }
        const scale = eventScale(entity.properties.fatalities as number | undefined);
        return { type: "billboard", iconUrl: this.iconUrls[style.color], color: style.color, iconScale: scale };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "event_type", label: "Event Type", type: "select", propertyKey: "event_type",
                options: [
                    { value: "battles", label: "Battles" },
                    { value: "protests", label: "Protests" },
                    { value: "riots", label: "Riots" },
                    { value: "strategic", label: "Strategic Developments" },
                ],
            },
            {
                id: "fatalities", label: "Fatalities", type: "range", propertyKey: "fatalities",
                range: { min: 0, max: 1000, step: 1 },
            },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Battles", color: "#dc2626", filterId: "event_type", filterValue: "battles" },
            { label: "Protests", color: "#3b82f6", filterId: "event_type", filterValue: "protests" },
            { label: "Riots", color: "#f97316", filterId: "event_type", filterValue: "riots" },
            { label: "Strategic Developments", color: "#8b5cf6", filterId: "event_type", filterValue: "strategic" },
        ];
    }
}