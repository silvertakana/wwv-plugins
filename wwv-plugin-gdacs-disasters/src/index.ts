import { Siren } from "lucide-react";
import {
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

/** Raw shape of one item from the gdacs-disasters data engine (GDACS JSON API). */
interface GdacsItem {
    id: string; // `${eventtype}-${eventid}`
    latitude: number;
    longitude: number;
    timestamp: string | null;
    eventtype: string | null; // EQ | TC | FL | VO | WF | DR
    eventname: string | null;
    name: string | null;
    alertlevel: string | null; // Green | Orange | Red
    alertscore: number | null;
    episodealertlevel: string | null;
    country: string | null;
    iso3: string | null;
    glide: string | null;
    source: string | null;
    fromdate: string | null;
    todate: string | null;
    datemodified: string | null;
    severity: number | null;
    severitytext: string | null;
    severityunit: string | null;
    reportUrl: string | null;
    detailsUrl: string | null;
}

const ALERTLEVEL_COLORS: Record<string, string> = {
    red: "#dc2626",
    orange: "#f97316",
    green: "#22c55e",
    unknown: "#6b7280",
};

const ALERTLEVEL_SIZES: Record<string, number> = {
    red: 12,
    orange: 9,
    green: 6,
    unknown: 7,
};

const EVENTTYPE_LABELS: Record<string, string> = {
    EQ: "Earthquake",
    TC: "Tropical Cyclone",
    FL: "Flood",
    VO: "Volcano",
    WF: "Wildfire",
    DR: "Drought",
};

function alertLevelColor(level: string | null): string {
    const key = (level || "unknown").toLowerCase();
    return ALERTLEVEL_COLORS[key] ?? ALERTLEVEL_COLORS.unknown;
}

function alertLevelSize(level: string | null): number {
    const key = (level || "unknown").toLowerCase();
    return ALERTLEVEL_SIZES[key] ?? ALERTLEVEL_SIZES.unknown;
}

export class GdacsDisastersPlugin implements WorldPlugin {
    id = "gdacs-disasters";
    name = "GDACS Disasters";
    description = "Current GDACS disaster alerts (earthquakes, tropical cyclones, floods, wildfires, volcanoes, droughts) from the data engine, colored by alert level";
    icon = Siren;
    category = "natural-disaster" as const;
    version = pkg.version;

    private context: PluginContext | null = null;

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/gdacs-disasters`);
            if (!res.ok) throw new Error(`GDACS disasters API returned ${res.status}`);
            const data = await res.json();
            if (!data.items || !Array.isArray(data.items)) return [];

            return data.items
                .map((item: GdacsItem): GeoEntity | null => {
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
                        label: item.name || item.eventname || "GDACS event",
                        properties: {
                            eventtype: item.eventtype,
                            eventname: item.eventname,
                            alertlevel: item.alertlevel,
                            alertscore: item.alertscore,
                            episodealertlevel: item.episodealertlevel,
                            country: item.country,
                            iso3: item.iso3,
                            glide: item.glide,
                            source: item.source,
                            severity: item.severity,
                            severitytext: item.severitytext,
                            severityunit: item.severityunit,
                            fromdate: dtProp(item.fromdate),
                            todate: dtProp(item.todate),
                            datemodified: dtProp(item.datemodified),
                            reportUrl: urlProp(item.reportUrl),
                            detailsUrl: urlProp(item.detailsUrl),
                        },
                    };
                })
                .filter((entity: GeoEntity | null): entity is GeoEntity => entity !== null);
        } catch (err) {
            console.error("[GdacsDisastersPlugin] Fetch error:", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return {
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/gdacs-disasters",
            pollingIntervalMs: 0,
            historyEnabled: true,
        };
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#f97316",
            clusterEnabled: true,
            clusterDistance: 25,
            maxEntities: 2000,
        };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const level = (entity.properties.alertlevel as string | null) ?? null;
        return {
            type: "point",
            color: alertLevelColor(level),
            size: alertLevelSize(level),
            outlineColor: "#1e293b",
            outlineWidth: 1,
            labelText: entity.label,
        };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "alertlevel", label: "Alert Level", type: "select", propertyKey: "alertlevel",
                options: [
                    { value: "Red", label: "Red" },
                    { value: "Orange", label: "Orange" },
                    { value: "Green", label: "Green" },
                ],
            },
            {
                id: "eventtype", label: "Event Type", type: "select", propertyKey: "eventtype",
                options: Object.entries(EVENTTYPE_LABELS).map(([value, label]) => ({ value, label })),
            },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Red (Severe)", color: "#dc2626", filterId: "alertlevel", filterValue: "Red" },
            { label: "Orange (Moderate)", color: "#f97316", filterId: "alertlevel", filterValue: "Orange" },
            { label: "Green (Low)", color: "#22c55e", filterId: "alertlevel", filterValue: "Green" },
        ];
    }
}