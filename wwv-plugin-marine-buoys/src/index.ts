import { Waves } from "lucide-react";
import type { ComponentType } from "react";
import {
    type GeoEntity,
    type TimeRange,
    type FilterDefinition,
    type ServerPluginConfig,
    dtProp,
} from "@worldwideview/wwv-plugin-sdk";
import { BaseIncidentPlugin } from "@worldwideview/wwv-lib-incidents";
import { MarineBuoyDetail } from "./MarineBuoyDetail";
import pkg from "../package.json";

/**
 * Raw observation row as served by the engine snapshot for /api/marine-buoys.
 * Mirrors the seeder's parsed NDBC latest_obs.txt row. Every numeric field is
 * null when the source reports it missing (NDBC uses "MM" for missing values).
 */
export interface BuoyObservation {
    stn: string;
    lat: number | null;
    lon: number | null;
    year: number | null;
    month: number | null;
    day: number | null;
    hour: number | null;
    minute: number | null;
    wdir: number | null;
    wspd: number | null;
    gst: number | null;
    wvht: number | null;
    dpd: number | null;
    apd: number | null;
    mwd: number | null;
    pres: number | null;
    ptdy: number | null;
    atmp: number | null;
    wtmp: number | null;
    dewp: number | null;
    vis: number | null;
    tide: number | null;
}

/** Keep only finite numbers; "MM" or unparseable values map to null. */
function num(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

/** Observation UTC instant; falls back to now only when time parts are missing. */
function observationDate(b: BuoyObservation): Date {
    const year = num(b.year);
    const month = num(b.month);
    const day = num(b.day);
    const hour = num(b.hour);
    const minute = num(b.minute);
    if (year === null || month === null || day === null || hour === null || minute === null) {
        return new Date();
    }
    return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

/** Map a raw buoy observation to a GeoEntity; returns null when lat/lon are invalid. */
export function mapBuoyToEntity(pluginId: string, b: BuoyObservation): GeoEntity | null {
    const lat = num(b.lat);
    const lon = num(b.lon);
    if (lat === null || lon === null) return null;
    if (!b.stn) return null;

    const observedAt = observationDate(b);

    return {
        id: `${pluginId}-${b.stn}`,
        pluginId,
        latitude: lat,
        longitude: lon,
        altitude: 0,
        timestamp: observedAt,
        label: b.stn,
        properties: {
            wvht: num(b.wvht),
            wspd: num(b.wspd),
            gst: num(b.gst),
            dpd: num(b.dpd),
            atmp: num(b.atmp),
            wtmp: num(b.wtmp),
            pres: num(b.pres),
            wdir: num(b.wdir),
            observedAt: dtProp(observedAt.toISOString()),
        },
    };
}

export class MarineBuoysPlugin extends BaseIncidentPlugin {
    id = "marine-buoys";
    name = "Marine Buoys";
    description = "Live marine buoy observations from NOAA NDBC (wave height, wind, temperature)";
    icon = Waves;
    category = "maritime" as const;
    version = pkg.version;
    protected defaultLayerColor = "#0ea5e9";

    protected getSeverityValue(entity: GeoEntity): number {
        return typeof entity.properties.wvht === "number" ? entity.properties.wvht : 0;
    }

    protected getSeverityColor(wvht: number): string {
        if (wvht < 1.0) return "#22c55e"; // Calm
        if (wvht < 2.0) return "#fcd34d"; // Slight
        if (wvht < 3.5) return "#f97316"; // Moderate
        if (wvht < 6.0) return "#ef4444"; // Rough
        return "#7f1d1d"; // Very rough / storm seas
    }

    protected getSeveritySize(wvht: number): number {
        if (wvht < 1.0) return 5;
        if (wvht < 2.0) return 8;
        if (wvht < 3.5) return 12;
        if (wvht < 6.0) return 16;
        return 20;
    }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const res = await globalThis.fetch("/api/marine-buoys");
            if (!res.ok) {
                this.context?.onError(new Error(`Marine Buoys API returned ${res.status}`));
                return [];
            }

            const data = await res.json();
            const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];

            return items.flatMap((b: BuoyObservation): GeoEntity[] => {
                const entity = mapBuoyToEntity(this.id, b);
                return entity ? [entity] : [];
            });
        } catch (err) {
            const error = err instanceof Error ? err : new Error("Failed to fetch marine buoys");
            this.context?.onError(error);
            return [];
        }
    }

    getServerConfig(): ServerPluginConfig {
        return {
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/marine-buoys",
            pollingIntervalMs: 900000,
            historyEnabled: false,
        };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            { id: "wvht", label: "Wave height (m)", type: "range", propertyKey: "wvht", range: { min: 0, max: 20, step: 0.1 } },
            { id: "wspd", label: "Wind speed (m/s)", type: "range", propertyKey: "wspd", range: { min: 0, max: 60, step: 0.1 } },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Calm · < 1.0 m", color: "#22c55e", filterId: "wvht", filterValue: "0" },
            { label: "Slight · 1.0-1.9 m", color: "#fcd34d", filterId: "wvht", filterValue: "1.0" },
            { label: "Moderate · 2.0-3.4 m", color: "#f97316", filterId: "wvht", filterValue: "2.0" },
            { label: "Rough · 3.5-5.9 m", color: "#ef4444", filterId: "wvht", filterValue: "3.5" },
            { label: "Very rough · ≥ 6.0 m", color: "#7f1d1d", filterId: "wvht", filterValue: "6.0" },
        ];
    }

    getDetailComponent(): ComponentType<{ entity: GeoEntity }> {
        return MarineBuoyDetail;
    }
}