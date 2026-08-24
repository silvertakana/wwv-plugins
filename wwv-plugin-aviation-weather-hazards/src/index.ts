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

/**
 * Raw shape of one item from the aviation weather data engine.
 * `kind` is "metar" (station observations with a flightCategory) or
 * "sigmet" (convective hazard advisories with hazard/severity).
 */
interface AviationHazardItem {
    id: string;
    kind: "metar" | "sigmet";
    lat: number | null;
    lon: number | null;
    name: string | null;
    temp: number | null;
    windDir: number | null;
    windSpeed: number | null;
    visibility: string | null;
    flightCategory: "VFR" | "MVFR" | "IFR" | "LIFR" | null;
    hazard: string | null;
    severity: number | null;
    /** Unix epoch seconds when the advisory is no longer valid (SIGMET only). */
    validTimeTo: number | null;
    rawReport: string | null;
}

/** METAR flight category -> color. */
const FLIGHT_CATEGORY_COLOR: Record<string, string> = {
    VFR: "#22c55e",
    MVFR: "#3b82f6",
    IFR: "#ef4444",
    LIFR: "#d946ef",
};

const FLIGHT_CATEGORY_LABEL: Record<string, string> = {
    VFR: "VFR (Visual)",
    MVFR: "MVFR (Marginal)",
    IFR: "IFR (Instrument)",
    LIFR: "LIFR (Low IFR)",
};

/** SIGMET severity (1-6) -> color: moderate amber, strong orange, extreme red. */
function severityToColor(severity: number | null): string {
    if (severity === null) return "#f59e0b";
    if (severity >= 5) return "#dc2626";
    if (severity >= 3) return "#f97316";
    return "#f59e0b";
}

function severityToLabel(severity: number | null): string {
    if (severity === null) return "Unknown";
    if (severity >= 5) return "Severe";
    if (severity >= 3) return "Moderate";
    return "Minor";
}

export class AviationWeatherHazardsPlugin implements WorldPlugin {
    id = "aviation-weather-hazards";
    name = "Aviation Weather Hazards";
    description = "METAR flight categories and SIGMET convective hazards";
    icon = CloudLightning;
    category = "aviation" as const;
    version = pkg.version;

    private context: PluginContext | null = null;

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/aviation-weather-hazards`);
            if (!res.ok) throw new Error(`Aviation weather hazards API returned ${res.status}`);
            const data = await res.json();
            if (!Array.isArray(data.items)) return [];

            return data.items
                .map((item: AviationHazardItem): GeoEntity | null => {
                    const lat = Number(item.lat);
                    const lon = Number(item.lon);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

                    // SIGMETs carry an explicit validity window (epoch seconds); METARs are live observations.
                    const validTime = item.validTimeTo != null ? new Date(item.validTimeTo * 1000) : null;
                    const isSigmet = item.kind === "sigmet";

                    return {
                        id: item.id,
                        pluginId: this.id,
                        latitude: lat,
                        longitude: lon,
                        timestamp: validTime ?? new Date(),
                        label: item.name ?? item.id,
                        properties: {
                            kind: item.kind,
                            name: item.name,
                            temp: item.temp,
                            windDir: item.windDir,
                            windSpeed: item.windSpeed,
                            visibility: item.visibility,
                            flightCategory: item.flightCategory,
                            hazard: item.hazard,
                            severity: item.severity,
                            severity_label: isSigmet ? severityToLabel(item.severity) : null,
                            validTimeTo: dtProp(
                                item.validTimeTo != null ? new Date(item.validTimeTo * 1000).toISOString() : null
                            ),
                            rawReport: item.rawReport,
                        },
                    };
                })
                .filter((entity: GeoEntity | null): entity is GeoEntity => entity !== null);
        } catch (err) {
            console.error("[AviationWeatherHazardsPlugin] Fetch error:", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return {
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/aviation-weather-hazards",
            pollingIntervalMs: 0,
            historyEnabled: true,
        };
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#f97316",
            clusterEnabled: true,
            clusterDistance: 40,
            maxEntities: 2000,
        };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const isSigmet = entity.properties.kind === "sigmet";
        if (isSigmet) {
            const severity = entity.properties.severity as number | null;
            return {
                type: "point",
                color: severityToColor(severity),
                size: 14,
                outlineColor: "#7f1d1d",
                outlineWidth: 2,
                labelText: (entity.properties.hazard as string) || "SIGMET",
            };
        }

        const flightCategory = (entity.properties.flightCategory as string) || "UNK";
        return {
            type: "point",
            color: FLIGHT_CATEGORY_COLOR[flightCategory] || "#6b7280",
            size: 8,
            outlineColor: "#111827",
            outlineWidth: 1,
            labelText: flightCategory,
        };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "kind", label: "Report Type", type: "select",
                propertyKey: "kind",
                options: [
                    { value: "metar", label: "METAR (station)" },
                    { value: "sigmet", label: "SIGMET (hazard)" },
                ],
            },
            {
                id: "flightCategory", label: "Flight Category", type: "select",
                propertyKey: "flightCategory",
                options: [
                    { value: "VFR", label: "VFR (Visual)" },
                    { value: "MVFR", label: "MVFR (Marginal)" },
                    { value: "IFR", label: "IFR (Instrument)" },
                    { value: "LIFR", label: "LIFR (Low IFR)" },
                ],
            },
            {
                id: "severity", label: "SIGMET Severity", type: "range",
                propertyKey: "severity", range: { min: 0, max: 6, step: 1 },
            },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "VFR (Visual)", color: "#22c55e", filterId: "flightCategory", filterValue: "VFR" },
            { label: "MVFR (Marginal)", color: "#3b82f6", filterId: "flightCategory", filterValue: "MVFR" },
            { label: "IFR (Instrument)", color: "#ef4444", filterId: "flightCategory", filterValue: "IFR" },
            { label: "LIFR (Low IFR)", color: "#d946ef", filterId: "flightCategory", filterValue: "LIFR" },
            { label: "SIGMET severity 1 - 2", color: "#f59e0b", filterId: "severity", filterValue: "1" },
            { label: "SIGMET severity 3 - 4", color: "#f97316", filterId: "severity", filterValue: "3" },
            { label: "SIGMET severity >= 5", color: "#dc2626", filterId: "severity", filterValue: "5" },
        ];
    }
}