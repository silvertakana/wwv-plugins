import { Activity } from "lucide-react";
import {
    type GeoEntity,
    type TimeRange,
    type FilterDefinition,
    type ServerPluginConfig,
    dtProp,
    urlProp,
} from "@worldwideview/wwv-plugin-sdk";
import { BaseIncidentPlugin } from "@worldwideview/wwv-lib-incidents";
import pkg from "../package.json";

const ENGINE_FALLBACK_URL = "https://dataenginev2.worldwideview.dev";

/** One earthquake row as served by the data engine's /api/earthquakes snapshot. */
export interface EarthquakeItem {
    id: string;
    place: string | null;
    magnitude: number | null;
    depth_km: number | null;
    lat: number;
    lon: number;
    /** Millisecond epoch. */
    occurredAt: number;
    url: string | null;
    nearTestSite?: boolean;
    nearestSiteName?: string | null;
}

/**
 * Maps one engine earthquake row to a GeoEntity. Returns null for rows whose
 * coordinates or timestamp are not usable, so the caller can drop them without
 * a hole in the layer. The property key is depth (not depth_km) to match the
 * depth filter.
 */
export function mapEarthquakeToEntity(pluginId: string, item: EarthquakeItem): GeoEntity | null {
    if (!Number.isFinite(item?.lat) || !Number.isFinite(item?.lon)) return null;

    // A malformed occurredAt makes toISOString() throw, and mapWebsocketPayload() has no try/catch.
    const occurredAt = new Date(item.occurredAt);
    if (!Number.isFinite(occurredAt.getTime())) return null;

    return {
        id: `${pluginId}-${item.id}`,
        pluginId,
        latitude: item.lat,
        longitude: item.lon,
        altitude: 0,
        timestamp: occurredAt,
        label: `M${item.magnitude ?? "?"}`,
        properties: {
            magnitude: item.magnitude,
            depth: item.depth_km,
            place: item.place,
            url: urlProp(item.url),
            occurredAt: dtProp(occurredAt.toISOString()),
            nearTestSite: item.nearTestSite,
            nearestSiteName: item.nearestSiteName,
        },
    };
}

export class EarthquakesPlugin extends BaseIncidentPlugin {
    id = "earthquakes";
    name = "Earthquakes";
    description = "Recent seismic activity from USGS";
    icon = Activity;
    category = "natural-disaster" as const;
    version = pkg.version;
    protected defaultLayerColor = "#f97316";

    protected getSeverityValue(entity: GeoEntity): number {
        return Number(entity.properties.magnitude ?? 0) || 0;
    }

    protected getSeverityColor(mag: number): string {
        if (mag < 5.0) return "#fcd34d"; // Yellow
        if (mag < 6.0) return "#f97316"; // Orange
        if (mag < 7.0) return "#ef4444"; // Red
        return "#7f1d1d"; // Dark Red
    }

    protected getSeveritySize(mag: number): number {
        if (mag < 5.0) return 5;
        if (mag < 6.0) return 8;
        if (mag < 7.0) return 12;
        return 16;
    }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || ENGINE_FALLBACK_URL;
            const res = await globalThis.fetch(`${engineBase}/api/earthquakes`);
            if (!res.ok) {
                this.context?.onError(new Error(`Earthquakes API returned ${res.status}`));
                return [];
            }

            const data = await res.json();
            if (!Array.isArray(data?.items)) return [];

            return data.items.flatMap((item: EarthquakeItem): GeoEntity[] => {
                const entity = mapEarthquakeToEntity(this.id, item);
                return entity ? [entity] : [];
            });
        } catch (err) {
            const error = err instanceof Error ? err : new Error("Failed to fetch earthquakes");
            this.context?.onError(error);
            return [];
        }
    }

    /**
     * The engine streams the same earthquake rows over the WebSocket that fetch()
     * receives over HTTP, wrapped in the scheduler envelope. Mapping them through
     * mapEarthquakeToEntity keeps streamed entities on the same shape as fetched
     * ones; the base class would otherwise pass the raw rows through as entities.
     */
    override mapWebsocketPayload(payload: unknown): GeoEntity[] {
        const items = Array.isArray(payload)
            ? payload
            : Array.isArray((payload as { items?: unknown } | null)?.items)
                ? (payload as { items: EarthquakeItem[] }).items
                : [];

        return items.flatMap((item: EarthquakeItem): GeoEntity[] => {
            const entity = mapEarthquakeToEntity(this.id, item);
            return entity ? [entity] : [];
        });
    }

    getPollingInterval(): number {
        return 0;
    }

    getServerConfig(): ServerPluginConfig {
        return { streamUrl: "wss://dataenginev2.worldwideview.dev/stream", apiBasePath: "/api/earthquakes", pollingIntervalMs: 0, historyEnabled: false };
    }

    getLayerConfig() {
        return {
            color: "#ef4444",
            clusterEnabled: true,
            clusterDistance: 40,
            maxEntities: 2000,
        };
    }

    renderEntity(entity: GeoEntity) {
        const magnitude = this.getSeverityValue(entity);
        return {
            type: "point" as const,
            color: this.getSeverityColor(magnitude),
            size: this.getSeveritySize(magnitude),
            outlineColor: "#000000",
            outlineWidth: 1,
            labelText: entity.label,
        };
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "M < 5.0", color: "#fcd34d", filterId: "magnitude", filterValue: "4.5" },
            { label: "M 5.0 - 5.9", color: "#f97316", filterId: "magnitude", filterValue: "5.0" },
            { label: "M 6.0 - 6.9", color: "#ef4444", filterId: "magnitude", filterValue: "6.0" },
            { label: "M ≥ 7.0", color: "#7f1d1d", filterId: "magnitude", filterValue: "7.0" },
        ];
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            { id: "magnitude", label: "Magnitude", type: "range", propertyKey: "magnitude", range: { min: 4.5, max: 10, step: 0.1 } },
            { id: "depth", label: "Depth (km)", type: "range", propertyKey: "depth", range: { min: 0, max: 800, step: 10 } },
        ];
    }
}
