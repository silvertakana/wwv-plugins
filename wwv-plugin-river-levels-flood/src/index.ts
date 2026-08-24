import { WavesHorizontal } from "lucide-react";
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

/** Raw shape of one item from the river levels data engine (USGS gauge observations). */
interface RiverItem {
    id: string;
    lat: number | null;
    lon: number | null;
    name: string | null;
    stage_ft: number | null;
    dateTime: string | null;
}

/**
 * Fixed flood-risk bands over stage_ft. USGS flood categories (action/flood/moderate/major)
 * are gauge-specific; with no per-gauge thresholds in the payload this is a documented
 * global heuristic: >= 20 ft major, 12-20 moderate, 8-12 action, < 8 normal.
 */
const BAND_COLORS: Record<string, string> = {
    major: "#dc2626",
    moderate: "#f97316",
    action: "#f59e0b",
    normal: "#22c55e",
};

function riskBand(stage: number): string {
    if (stage >= 20) return "major";
    if (stage >= 12) return "moderate";
    if (stage >= 8) return "action";
    return "normal";
}

function stageNum(stage: number | null): number | null {
    return typeof stage === "number" && Number.isFinite(stage) ? stage : null;
}

function riskColor(band: string): string {
    return BAND_COLORS[band] ?? BAND_COLORS.normal;
}

function riskSize(stage: number | null): number {
    return 5 + Math.min(8, (stage ?? 0) / 10);
}

/**
 * dateTime arrives as non-ISO "MM/dd/yyyy HH:mm:ss" or "dd/MM/yyyy h:mm:ss am"
 * (and occasionally ISO) with no timezone. Interpret the wall-clock as UTC
 * (deterministic, machine independent) and normalize to ISO when possible.
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

export class RiverLevelsFloodPlugin implements WorldPlugin {
    id = "river-levels-flood";
    name = "River Levels / Flood";
    description = "USGS river stage observations from the data engine, classified into flood risk bands";
    icon = WavesHorizontal;
    category = "natural-disaster" as const;
    version = pkg.version;

    private context: PluginContext | null = null;

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/river-levels-flood`);
            if (!res.ok) throw new Error(`River levels flood API returned ${res.status}`);
            const data = await res.json();
            if (!data.items || !Array.isArray(data.items)) return [];

            return data.items
                .map((item: RiverItem): GeoEntity | null => {
                    const lat = Number(item.lat);
                    const lon = Number(item.lon);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                    const stage = stageNum(item.stage_ft);
                    const band = stage === null ? "normal" : riskBand(stage);
                    const iso = toIsoUtc(item.dateTime);
                    return {
                        id: item.id,
                        pluginId: this.id,
                        latitude: lat,
                        longitude: lon,
                        timestamp: iso ? new Date(iso) : new Date(),
                        label: item.name || item.id,
                        properties: {
                            id: item.id,
                            name: item.name,
                            stage_ft: stage,
                            risk_band: band,
                            dateTime: item.dateTime,
                            dateTimeIso: dtProp(iso),
                        },
                    };
                })
                .filter((entity: GeoEntity | null): entity is GeoEntity => entity !== null);
        } catch (err) {
            console.error("[RiverLevelsFloodPlugin] Fetch error:", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return {
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/river-levels-flood",
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
        const stage = stageNum(entity.properties.stage_ft as number | null);
        const band = stage === null ? "normal" : riskBand(stage);
        return {
            type: "point",
            color: riskColor(band),
            size: riskSize(stage),
            outlineColor: "#1e293b",
            outlineWidth: 1,
            labelText: entity.label,
        };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "risk_band", label: "Flood Risk", type: "select", propertyKey: "risk_band",
                options: [
                    { value: "major", label: "Major (stage >= 20 ft)" },
                    { value: "moderate", label: "Moderate (12 - 20 ft)" },
                    { value: "action", label: "Action (8 - 12 ft)" },
                    { value: "normal", label: "Normal (< 8 ft)" },
                ],
            },
            {
                id: "stage_ft", label: "Stage Height (ft)", type: "range",
                propertyKey: "stage_ft", range: { min: 0, max: 100, step: 1 },
            },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Major (>= 20 ft)", color: "#dc2626", filterId: "risk_band", filterValue: "major" },
            { label: "Moderate (12 - 20 ft)", color: "#f97316", filterId: "risk_band", filterValue: "moderate" },
            { label: "Action (8 - 12 ft)", color: "#f59e0b", filterId: "risk_band", filterValue: "action" },
            { label: "Normal (< 8 ft)", color: "#22c55e", filterId: "risk_band", filterValue: "normal" },
        ];
    }
}