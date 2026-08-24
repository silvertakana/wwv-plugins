import { CloudLightning } from "lucide-react";
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

/** Raw shape of one item from the severe weather alerts data engine (NWS CAP feed). */
interface AlertItem {
    id: string;
    lat: number | null;
    lon: number | null;
    event: string | null;
    severity: string | null;
    urgency: string | null;
    headline: string | null;
    areaDesc: string | null;
    description: string | null;
    instruction: string | null;
    sent: string | null;
    effective: string | null;
    expires: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
    extreme: "#dc2626",
    severe: "#f97316",
    moderate: "#f59e0b",
    minor: "#eab308",
    unknown: "#6b7280",
};

const URGENCY_SIZES: Record<string, number> = {
    immediate: 11,
    expected: 8,
    future: 6,
    past: 5,
    unknown: 6,
};

function severityColor(severity: string | null): string {
    const key = (severity || "unknown").toLowerCase();
    return SEVERITY_COLORS[key] ?? SEVERITY_COLORS.unknown;
}

function urgencySize(urgency: string | null): number {
    const key = (urgency || "unknown").toLowerCase();
    return URGENCY_SIZES[key] ?? URGENCY_SIZES.unknown;
}

/**
 * NWS CAP timestamps arrive as non-ISO "MM/dd/yyyy HH:mm:ss" (sometimes with am/pm)
 * and carry no timezone. Interpret the wall-clock as UTC (deterministic, machine
 * independent) and normalize to ISO; returns null for unparseable input.
 */
function toIsoUtc(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw.trim());
    if (m) {
        const a = parseInt(m[1], 10);
        const b = parseInt(m[2], 10);
        // Disambiguate MM/dd vs dd/MM: a value > 12 cannot be a month.
        const month = a > 12 ? b : a;
        const day = a > 12 ? a : b;
        const year = parseInt(m[3], 10);
        let hour = parseInt(m[4], 10);
        const min = parseInt(m[5], 10);
        const sec = m[6] ? parseInt(m[6], 10) : 0;
        const meridian = m[7] ? m[7].toLowerCase() : null;
        if (meridian === "pm" && hour < 12) hour += 12;
        if (meridian === "am" && hour === 12) hour = 0;
        if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || hour > 23 || min > 59 || sec > 59) return null;
        const d = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (!Number.isNaN(Date.parse(raw))) return new Date(raw).toISOString();
    return null;
}

export class SevereWeatherAlertsPlugin implements WorldPlugin {
    id = "severe-weather-alerts";
    name = "Severe Weather Alerts";
    description = "NWS severe weather alerts (CAP feed) from the data engine, severity-colored and urgency-sized";
    icon = CloudLightning;
    category = "natural-disaster" as const;
    version = pkg.version;

    private context: PluginContext | null = null;

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/severe-weather-alerts`);
            if (!res.ok) throw new Error(`Severe weather alerts API returned ${res.status}`);
            const data = await res.json();
            if (!data.items || !Array.isArray(data.items)) return [];

            return data.items
                .map((item: AlertItem): GeoEntity | null => {
                    const lat = Number(item.lat);
                    const lon = Number(item.lon);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                    const sentIso = toIsoUtc(item.sent);
                    return {
                        id: item.id,
                        pluginId: this.id,
                        latitude: lat,
                        longitude: lon,
                        timestamp: sentIso ? new Date(sentIso) : new Date(),
                        label: item.event || "Weather Alert",
                        properties: {
                            event: item.event,
                            severity: item.severity,
                            urgency: item.urgency,
                            headline: item.headline,
                            areaDesc: item.areaDesc,
                            description: item.description,
                            instruction: item.instruction,
                            sent: dtProp(sentIso),
                            effective: dtProp(toIsoUtc(item.effective)),
                            expires: dtProp(toIsoUtc(item.expires)),
                        },
                    };
                })
                .filter((entity: GeoEntity | null): entity is GeoEntity => entity !== null);
        } catch (err) {
            console.error("[SevereWeatherAlertsPlugin] Fetch error:", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return {
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/severe-weather-alerts",
            pollingIntervalMs: 0,
            historyEnabled: true,
        };
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#f97316",
            clusterEnabled: true,
            clusterDistance: 25,
            maxEntities: 10000,
        };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const severity = (entity.properties.severity as string | null) ?? null;
        const urgency = (entity.properties.urgency as string | null) ?? null;
        return {
            type: "point",
            color: severityColor(severity),
            size: urgencySize(urgency),
            outlineColor: "#1e293b",
            outlineWidth: 1,
            labelText: entity.label,
        };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "severity", label: "Severity", type: "select", propertyKey: "severity",
                options: [
                    { value: "Extreme", label: "Extreme" },
                    { value: "Severe", label: "Severe" },
                    { value: "Moderate", label: "Moderate" },
                    { value: "Minor", label: "Minor" },
                    { value: "Unknown", label: "Unknown" },
                ],
            },
            {
                id: "urgency", label: "Urgency", type: "select", propertyKey: "urgency",
                options: [
                    { value: "Immediate", label: "Immediate" },
                    { value: "Expected", label: "Expected" },
                    { value: "Future", label: "Future" },
                    { value: "Past", label: "Past" },
                    { value: "Unknown", label: "Unknown" },
                ],
            },
            {
                id: "event", label: "Event Type", type: "select", propertyKey: "event",
                options: [
                    { value: "Tornado Warning", label: "Tornado Warning" },
                    { value: "Severe Thunderstorm Warning", label: "Severe Thunderstorm Warning" },
                    { value: "Flash Flood Warning", label: "Flash Flood Warning" },
                    { value: "Flood Warning", label: "Flood Warning" },
                    { value: "Flood Advisory", label: "Flood Advisory" },
                    { value: "Special Marine Warning", label: "Special Marine Warning" },
                    { value: "Special Weather Statement", label: "Special Weather Statement" },
                    { value: "Winter Storm Warning", label: "Winter Storm Warning" },
                    { value: "Winter Weather Advisory", label: "Winter Weather Advisory" },
                    { value: "Hurricane Warning", label: "Hurricane Warning" },
                    { value: "Hurricane Watch", label: "Hurricane Watch" },
                    { value: "Excessive Heat Warning", label: "Excessive Heat Warning" },
                    { value: "Heat Advisory", label: "Heat Advisory" },
                    { value: "High Wind Warning", label: "High Wind Warning" },
                    { value: "Dense Fog Advisory", label: "Dense Fog Advisory" },
                ],
            },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Extreme", color: "#dc2626", filterId: "severity", filterValue: "Extreme" },
            { label: "Severe", color: "#f97316", filterId: "severity", filterValue: "Severe" },
            { label: "Moderate", color: "#f59e0b", filterId: "severity", filterValue: "Moderate" },
            { label: "Minor", color: "#eab308", filterId: "severity", filterValue: "Minor" },
            { label: "Unknown", color: "#6b7280", filterId: "severity", filterValue: "Unknown" },
        ];
    }
}