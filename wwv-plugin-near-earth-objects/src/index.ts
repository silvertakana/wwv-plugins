import { Orbit } from "lucide-react";
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

/**
 * Raw shape of one item from the near-earth objects data engine.
 * lat/lon are deterministic placeholder coordinates hashed from the asteroid id
 * (documented engine behavior); all orbital facts live in the properties.
 */
interface NeoItem {
    id: string;
    name: string | null;
    lat: number | null;
    lon: number | null;
    closeApproachDate: string | null;
    orbitingBody: string | null;
    missDistanceKm: number | null;
    relativeVelocityKms: number | null;
    diameterKmMin: number | null;
    diameterKmMax: number | null;
    absoluteMagnitudeH: number | null;
    potentiallyHazardous: boolean;
    nasaJplUrl: string | null;
    dateTime: string | null;
}

function num(value: number | null): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hazardColor(hazardous: boolean): string {
    return hazardous ? "#ef4444" : "#3b82f6";
}

/** Hazardous objects are larger; diameter (km) adds a small secondary scale. */
function hazardSize(hazardous: boolean, diameterKmMax: number | null): number {
    return (hazardous ? 10 : 6) + Math.min(4, (diameterKmMax ?? 0) * 40);
}

function toIsoUtc(raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (!Number.isNaN(Date.parse(raw))) return new Date(raw).toISOString();
    return null;
}

export class NearEarthObjectsPlugin implements WorldPlugin {
    id = "near-earth-objects";
    name = "Near-Earth Objects";
    description = "Near-Earth object close approaches from JPL data via the data engine, hazardous objects highlighted";
    icon = Orbit;
    category = "space" as const;
    version = pkg.version;

    private context: PluginContext | null = null;

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/near-earth-objects`);
            if (!res.ok) throw new Error(`Near-earth objects API returned ${res.status}`);
            const data = await res.json();
            if (!data.items || !Array.isArray(data.items)) return [];

            return data.items
                .map((item: NeoItem): GeoEntity | null => {
                    const lat = Number(item.lat);
                    const lon = Number(item.lon);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                    const approachIso = toIsoUtc(item.dateTime) || toIsoUtc(item.closeApproachDate);
                    return {
                        id: item.id,
                        pluginId: this.id,
                        latitude: lat,
                        longitude: lon,
                        timestamp: approachIso ? new Date(approachIso) : new Date(),
                        label: item.name || item.id,
                        properties: {
                            name: item.name,
                            closeApproachDate: dtProp(item.closeApproachDate),
                            orbitingBody: item.orbitingBody,
                            missDistanceKm: num(item.missDistanceKm),
                            relativeVelocityKms: num(item.relativeVelocityKms),
                            diameterKmMin: num(item.diameterKmMin),
                            diameterKmMax: num(item.diameterKmMax),
                            absoluteMagnitudeH: num(item.absoluteMagnitudeH),
                            potentiallyHazardous: item.potentiallyHazardous,
                            nasaJplUrl: urlProp(item.nasaJplUrl),
                        },
                    };
                })
                .filter((entity: GeoEntity | null): entity is GeoEntity => entity !== null);
        } catch (err) {
            console.error("[NearEarthObjectsPlugin] Fetch error:", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return {
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/near-earth-objects",
            pollingIntervalMs: 0,
            historyEnabled: true,
        };
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#3b82f6",
            clusterEnabled: true,
            clusterDistance: 25,
            maxEntities: 10000,
        };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const hazardous = entity.properties.potentiallyHazardous === true;
        const diameterKmMax = num(entity.properties.diameterKmMax as number | null);
        return {
            type: "point",
            color: hazardColor(hazardous),
            size: hazardSize(hazardous, diameterKmMax),
            outlineColor: "#1e293b",
            outlineWidth: 1,
            labelText: entity.label,
        };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "potentially_hazardous", label: "Hazardous", type: "select", propertyKey: "potentiallyHazardous",
                options: [
                    { value: "true", label: "Potentially Hazardous" },
                    { value: "false", label: "Not Hazardous" },
                ],
            },
            {
                id: "miss_distance", label: "Miss Distance (km)", type: "range",
                propertyKey: "missDistanceKm", range: { min: 0, max: 70000000, step: 1000000 },
            },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Potentially Hazardous", color: "#ef4444", filterId: "potentially_hazardous", filterValue: "true" },
            { label: "Not Hazardous", color: "#3b82f6", filterId: "potentially_hazardous", filterValue: "false" },
        ];
    }
}