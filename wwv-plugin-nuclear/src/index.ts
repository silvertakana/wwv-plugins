import { Atom, Radiation } from "lucide-react";
import {
    createSvgIconUrl,
    type WorldPlugin,
    type GeoEntity,
    type TimeRange,
    type PluginContext,
    type LayerConfig,
    type CesiumEntityOptions,
    type FilterDefinition,
} from "@worldwideview/wwv-plugin-sdk";
import dataRaw from "../data/data.json?raw";

const STATUS_COLORS: Record<string, string> = {
    "operational": "#22c55e",
    "under construction": "#eab308",
    "decommissioned": "#64748b",
    "abandoned": "#ef4444",
};

function representativePoint(geom: any) {
    if (!geom) return { lat: 0, lon: 0 };
    switch (geom.type) {
        case "Point":
            return { lat: geom.coordinates[1], lon: geom.coordinates[0] };
        default:
            return { lat: 0, lon: 0 };
    }
}

export default class NuclearPlugin implements WorldPlugin {
    id = "nuclear";
    name = "Nuclear Facilities";
    description = "Global nuclear power plants and reactors from OSM.";
    icon = Atom;
    category = "infrastructure" as const;
    version = "1.0.3";

    private context: PluginContext | null = null;
    private entities: GeoEntity[] = [];
    private iconUrls: Record<string, string> = {};

    async initialize(ctx: PluginContext): Promise<void> {
        this.context = ctx;
        let data: any = null;

        try {
            data = JSON.parse(dataRaw);
        } catch (e) {
            console.error("[NuclearPlugin] Failed to parse static data:", e);
        }

        if (data?.features) {
            this.entities = data.features.map((f: any, i: number) => {
                const pt = representativePoint(f.geometry);
                return {
                    id: `nuclear-${f.id ?? i}`,
                    pluginId: this.id,
                    latitude: pt.lat,
                    longitude: pt.lon,
                    timestamp: new Date(),
                    label: f.properties?.name ?? undefined,
                    properties: {
                        ...f.properties,
                        _geometryType: f.geometry?.type,
                    },
                };
            });
        }
    }

    destroy(): void {
        this.context = null;
        this.entities = [];
    }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        return this.entities;
    }

    getPollingInterval(): number {
        return 0;
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#22d3ee",
            clusterEnabled: true,
            clusterDistance: 50,
            maxEntities: 1000,
        };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const status =
            (entity.properties?.status as string)?.toLowerCase() || "unknown";
        const color = STATUS_COLORS[status] || "#22d3ee";
        const iconComponent = STATUS_COLORS[status] ? Radiation : Atom;

        const cacheKey = `${iconComponent === Radiation ? "rad" : "atom"}-${color}`;
        if (!this.iconUrls[cacheKey]) {
            this.iconUrls[cacheKey] = createSvgIconUrl(iconComponent, { color });
        }

        return {
            type: "billboard",
            iconUrl: this.iconUrls[cacheKey],
            color,
            iconScale: 0.5,
        };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "status",
                label: "Facility Status",
                propertyKey: "status",
                type: "select",
                options: [
                    { value: "operational", label: "Operational" },
                    { value: "under construction", label: "Under Construction" },
                    { value: "decommissioned", label: "Decommissioned" },
                    { value: "abandoned", label: "Abandoned" },
                ],
            },
        ];
    }

    getLegend() {
        return [
            { label: "Operational", color: "#22c55e", filterId: "status", filterValue: "operational" },
            { label: "Under Const.", color: "#eab308", filterId: "status", filterValue: "under construction" },
            { label: "Decommissioned", color: "#64748b", filterId: "status", filterValue: "decommissioned" },
            { label: "Abandoned", color: "#ef4444", filterId: "status", filterValue: "abandoned" },
        ];
    }
}
