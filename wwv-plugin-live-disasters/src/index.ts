import { Siren } from "lucide-react";
import type { ComponentType } from "react";
import {
    type GeoEntity,
    type TimeRange,
    type FilterDefinition,
    type ServerPluginConfig,
    dtProp,
    urlProp,
} from "@worldwideview/wwv-plugin-sdk";
import { BaseIncidentPlugin } from "@worldwideview/wwv-lib-incidents";
import { LiveDisasterDetail } from "./DetailPanel";

const EVENT_TYPES: { code: string; label: string }[] = [
    { code: "EQ", label: "Earthquake" },
    { code: "TC", label: "Tropical Cyclone" },
    { code: "FL", label: "Flood" },
    { code: "DR", label: "Drought" },
    { code: "VO", label: "Volcano" },
    { code: "WF", label: "Wildfire" },
    { code: "TS", label: "Tsunami" },
    { code: "HT", label: "Heat Wave" },
];

function toStr(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

export class LiveDisastersPlugin extends BaseIncidentPlugin {
    id = "live-disasters";
    name = "Live Disasters";
    description = "Global disaster alerts from GDACS (earthquakes, cyclones, floods, droughts)";
    icon = Siren;
    category = "natural-disaster" as const;
    version = "1.0.0";
    protected defaultLayerColor = "#dc2626";

    // GDACS alert levels: Red = 3, Orange = 2, Green = 1, unknown/other = 0.
    protected getSeverityValue(entity: GeoEntity): number {
        const level = String(entity.properties.alertlevel ?? "").toLowerCase();
        switch (level) {
            case "red":
                return 3;
            case "orange":
                return 2;
            case "green":
                return 1;
            default:
                return 0;
        }
    }

    protected getSeverityColor(level: number): string {
        if (level >= 3) return "#dc2626"; // Red
        if (level === 2) return "#f97316"; // Orange
        if (level === 1) return "#22c55e"; // Green
        return "#9ca3af"; // Unknown
    }

    protected getSeveritySize(level: number): number {
        if (level >= 3) return 14;
        if (level === 2) return 10;
        if (level === 1) return 6;
        return 4;
    }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const res = await globalThis.fetch(`/api/live-disasters`);
            if (!res.ok) {
                this.context?.onError(new Error(`Live Disasters API returned ${res.status}`));
                return [];
            }

            const data = await res.json();
            const items = Array.isArray(data?.items)
                ? data.items
                : Array.isArray(data)
                  ? data
                  : [];

            return items.flatMap((item: any, i: number): GeoEntity[] => {
                const latitude = Number(item?.lat);
                const longitude = Number(item?.lon);
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                    return [];
                }

                return [{
                    id: `${this.id}-${item?.id ?? i}`,
                    pluginId: this.id,
                    latitude,
                    longitude,
                    altitude: 0,
                    timestamp: new Date(item?.pubDate ?? Date.now()),
                    label: toStr(item?.title) ?? undefined,
                    properties: {
                        alertlevel: item?.alertlevel ?? item?.severity ?? null,
                        eventtype: item?.eventtype ?? null,
                        country: item?.iso3 ?? null,
                        countryName: item?.country ?? null,
                        title: item?.title ?? null,
                        link: urlProp(item?.link ?? null),
                        description: item?.description ?? null,
                        pubDate: dtProp(item?.pubDate ?? null),
                    },
                }];
            });
        } catch (err) {
            const error = err instanceof Error ? err : new Error("Failed to fetch live disasters");
            this.context?.onError(error);
            return [];
        }
    }

    getPollingInterval(): number {
        return 900000;
    }

    getServerConfig(): ServerPluginConfig {
        return { streamUrl: "wss://dataenginev2.worldwideview.dev/stream", apiBasePath: "/api/live-disasters", pollingIntervalMs: 900000, historyEnabled: false };
    }

    getLayerConfig() {
        return {
            color: "#dc2626",
            clusterEnabled: true,
            clusterDistance: 40,
            maxEntities: 2000,
        };
    }

    renderEntity(entity: GeoEntity) {
        const level = this.getSeverityValue(entity);
        return {
            type: "point" as const,
            color: this.getSeverityColor(level),
            size: this.getSeveritySize(level),
            outlineColor: "#000000",
            outlineWidth: 1,
            labelText: entity.label,
        };
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Red", color: "#dc2626", filterId: "alertlevel", filterValue: "red" },
            { label: "Orange", color: "#f97316", filterId: "alertlevel", filterValue: "orange" },
            { label: "Green", color: "#22c55e", filterId: "alertlevel", filterValue: "green" },
            { label: "Unknown", color: "#9ca3af", filterId: "alertlevel", filterValue: "unknown" },
        ];
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "eventtype",
                label: "Event Type",
                type: "select",
                propertyKey: "eventtype",
                options: EVENT_TYPES.map((t) => ({ value: t.code, label: t.label })),
            },
            {
                id: "alertlevel",
                label: "Alert Level",
                type: "select",
                propertyKey: "alertlevel",
                options: [
                    { value: "red", label: "Red" },
                    { value: "orange", label: "Orange" },
                    { value: "green", label: "Green" },
                    { value: "unknown", label: "Unknown" },
                ],
            },
        ];
    }

    getDetailComponent(): ComponentType<{ entity: GeoEntity }> {
        return LiveDisasterDetail;
    }
}