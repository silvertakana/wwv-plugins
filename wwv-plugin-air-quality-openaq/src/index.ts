import { Wind } from "lucide-react";
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

interface AirQualityReading {
    lat: number;
    lon: number;
    pm25?: number;
    pm10?: number;
    o3?: number;
    no2?: number;
    aqi?: number;
    station?: string;
    date?: string;
    url?: string;
}

interface AqiBand {
    key: string;
    label: string;
    color: string;
}

function aqiBand(aqi: number): AqiBand {
    if (aqi <= 50) return { key: "good", label: "Good (0-50)", color: "#22c55e" };
    if (aqi <= 100) return { key: "moderate", label: "Moderate (51-100)", color: "#eab308" };
    if (aqi <= 150) return { key: "unhealthy-sg", label: "Unhealthy for Sensitive Groups (101-150)", color: "#f97316" };
    if (aqi <= 200) return { key: "unhealthy", label: "Unhealthy (151-200)", color: "#ef4444" };
    return { key: "very-unhealthy", label: "Very Unhealthy (201+)", color: "#a855f7" };
}

const UNKNOWN_BAND: AqiBand = { key: "unknown", label: "Unknown", color: "#6b7280" };

export class AirQualityOpenAQPlugin implements WorldPlugin {
    // NOTE: The PluginCategory union has no "environmental" member, so "custom" is used here
    // (nearest valid value). The package.json display category is "Custom" for the same reason.
    id = "air-quality-openaq";
    name = "Air Quality (OpenAQ)";
    description = "Real-time air quality index (AQI) from OpenAQ stations. KEY-GATED: requires the OPENAQ_API_KEY seeder on the data engine.";
    icon = Wind;
    category = "custom" as const;
    version = pkg.version;

    private context: PluginContext | null = null;
    private iconUrls: Record<string, string> = {};

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/air-quality-openaq`);
            if (res.status === 404 || !res.ok) {
                console.warn(`[AirQualityOpenAQ] Seeder not deployed; key required (OPENAQ_API_KEY). HTTP ${res.status}`);
                return [];
            }
            const data = await res.json();
            if (!data.items || !Array.isArray(data.items)) return [];

            const entities: GeoEntity[] = [];
            data.items.forEach((reading: AirQualityReading, idx: number) => {
                const { lat, lon } = reading;
                if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
                const aqi = typeof reading.aqi === "number" ? reading.aqi : Number.NaN;
                const band = Number.isNaN(aqi) ? UNKNOWN_BAND : aqiBand(aqi);
                const label = Number.isNaN(aqi)
                    ? (reading.station ?? band.label)
                    : `${reading.station ?? "Station"} - AQI ${aqi}`;
                entities.push({
                    id: `air-quality-openaq-${lat.toFixed(4)},${lon.toFixed(4)}-${idx}`,
                    pluginId: this.id,
                    latitude: lat,
                    longitude: lon,
                    timestamp: reading.date ? new Date(reading.date) : new Date(),
                    label,
                    properties: {
                        aqi: reading.aqi ?? null,
                        aqi_band: band.key,
                        pm25: reading.pm25 ?? null,
                        pm10: reading.pm10 ?? null,
                        o3: reading.o3 ?? null,
                        no2: reading.no2 ?? null,
                        station: reading.station ?? null,
                        measured_at: dtProp(reading.date),
                        source_url: urlProp(reading.url),
                    },
                });
            });
            return entities;
        } catch (err) {
            console.warn("[AirQualityOpenAQ] Fetch error (seeder likely not deployed):", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return { apiBasePath: "/api/air-quality-openaq", pollingIntervalMs: 0, historyEnabled: true };
    }

    getLayerConfig(): LayerConfig {
        return { color: "#22c55e", clusterEnabled: true, clusterDistance: 30 };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const aqi = entity.properties.aqi as number | null | undefined;
        const band = typeof aqi === "number" ? aqiBand(aqi) : UNKNOWN_BAND;
        if (!this.iconUrls[band.color]) {
            this.iconUrls[band.color] = createSvgIconUrl(Wind, { color: band.color });
        }
        return { type: "billboard", iconUrl: this.iconUrls[band.color], color: band.color, iconScale: 0.9 };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "aqi_band", label: "AQI Band", type: "select", propertyKey: "aqi_band",
                options: [
                    { value: "good", label: "Good (0-50)" },
                    { value: "moderate", label: "Moderate (51-100)" },
                    { value: "unhealthy-sg", label: "Unhealthy for Sensitive Groups (101-150)" },
                    { value: "unhealthy", label: "Unhealthy (151-200)" },
                    { value: "very-unhealthy", label: "Very Unhealthy (201+)" },
                ],
            },
            {
                id: "aqi", label: "AQI Value", type: "range", propertyKey: "aqi",
                range: { min: 0, max: 500, step: 1 },
            },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Good (0-50)", color: "#22c55e", filterId: "aqi_band", filterValue: "good" },
            { label: "Moderate (51-100)", color: "#eab308", filterId: "aqi_band", filterValue: "moderate" },
            { label: "USG (101-150)", color: "#f97316", filterId: "aqi_band", filterValue: "unhealthy-sg" },
            { label: "Unhealthy (151-200)", color: "#ef4444", filterId: "aqi_band", filterValue: "unhealthy" },
            { label: "Very Unhealthy (201+)", color: "#a855f7", filterId: "aqi_band", filterValue: "very-unhealthy" },
        ];
    }
}