import { CloudLightning } from "lucide-react";
import { createElement, type ComponentType, type CSSProperties } from "react";
import {
    type GeoEntity,
    type TimeRange,
    type FilterDefinition,
    type ServerPluginConfig,
    urlProp,
} from "@worldwideview/wwv-plugin-sdk";
import { BaseIncidentPlugin } from "@worldwideview/wwv-lib-incidents";
import pkg from "../package.json";

/**
 * Raw shape of one entry in NOAA NHC's CurrentStorms.json `activeStorms` array.
 * Most fields may be null (e.g. windWatchesWarnings); only storms with finite
 * numeric coordinates become entities.
 */
export interface NhcActiveStorm {
    id: string | number;
    name: string | null;
    classification: string | null;
    intensity: number | null;
    pressure: number | null;
    latitudeNumeric: number | null;
    longitudeNumeric: number | null;
    movementDir: string | null;
    movementSpeed: number | null;
    lastUpdate: string | null;
    publicAdvisory?: { url?: string | null } | null;
    forecastAdvisory?: { url?: string | null } | null;
    forecastDiscussion?: { url?: string | null } | null;
    forecastTrack?: { kmzFile?: string | null; zipFile?: string | null } | null;
}

/** Map a raw NHC storm to a GeoEntity; returns null when coordinates are invalid. */
export function mapActiveStormToEntity(pluginId: string, storm: NhcActiveStorm): GeoEntity | null {
    const lat = storm.latitudeNumeric;
    const lon = storm.longitudeNumeric;
    if (typeof lat !== "number" || !Number.isFinite(lat)) return null;
    if (typeof lon !== "number" || !Number.isFinite(lon)) return null;

    const lastUpdate = storm.lastUpdate ? new Date(storm.lastUpdate) : new Date();

    return {
        id: `${pluginId}-${storm.id}`,
        pluginId,
        latitude: lat,
        longitude: lon,
        altitude: 0,
        timestamp: lastUpdate,
        label: storm.name ?? "Unnamed Storm",
        properties: {
            classification: storm.classification,
            intensity: finiteOrNull(storm.intensity),
            pressure: finiteOrNull(storm.pressure),
            movementDir: storm.movementDir,
            movementSpeed: finiteOrNull(storm.movementSpeed),
            lastUpdate: storm.lastUpdate,
            advisoryUrl: urlProp(storm.publicAdvisory?.url ?? null),
            forecastUrl: urlProp(storm.forecastTrack?.kmzFile ?? null),
            discussionUrl: urlProp(storm.forecastDiscussion?.url ?? null),
        },
    };
}

/** Keep only finite numbers; everything else maps to null. */
function finiteOrNull(value: number | null): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Severity color by wind intensity (mph): green -> yellow -> orange -> red. */
export function severityColor(intensity: number): string {
    if (intensity < 39) return "#22c55e"; // Tropical depression
    if (intensity < 74) return "#fcd34d"; // Tropical storm
    if (intensity < 111) return "#f97316"; // Category 1-2 hurricane
    return "#ef4444"; // Category 3+ major hurricane
}

/** Severity marker size by wind intensity (mph). */
export function severitySize(intensity: number): number {
    if (intensity < 39) return 6;
    if (intensity < 74) return 9;
    if (intensity < 111) return 12;
    return 16;
}

/** Strip the `url:` tag applied by urlProp() so it can back an `<a href>`. */
function unwrapUrl(value: unknown): string | null {
    if (typeof value !== "string" || !value.startsWith("url:")) return null;
    return value.slice(4);
}

/**
 * Detail panel rendered when a storm entity is clicked: identity, current
 * conditions, and (when NHC publishes them) public advisory, forecast track
 * (KMZ), and forecast discussion links. Built with createElement because
 * esbuild does not parse JSX in `.ts` files.
 */
function HurricaneStormDetail({ entity }: { entity: GeoEntity }) {
    const props = entity.properties;

    const classification = typeof props.classification === "string" && props.classification
        ? props.classification
        : "n/a";
    const intensity = typeof props.intensity === "number" ? `${Math.round(props.intensity)} mph` : "n/a";
    const pressure = typeof props.pressure === "number" ? `${Math.round(props.pressure)} mb` : "n/a";

    const dir = typeof props.movementDir === "string" && props.movementDir ? props.movementDir : null;
    const speed = typeof props.movementSpeed === "number" ? `${props.movementSpeed} mph` : null;
    const movement = [dir, speed].filter(Boolean).join(" @ ") || "n/a";

    const lastUpdate = typeof props.lastUpdate === "string" && props.lastUpdate
        ? new Date(props.lastUpdate).toLocaleString()
        : "n/a";

    const advisoryUrl = unwrapUrl(props.advisoryUrl);
    const forecastUrl = unwrapUrl(props.forecastUrl);
    const discussionUrl = unwrapUrl(props.discussionUrl);

    const rows = [
        createElement(DetailRow, { key: "intensity", label: "Intensity", value: intensity }),
        createElement(DetailRow, { key: "pressure", label: "Pressure", value: pressure }),
        createElement(DetailRow, { key: "movement", label: "Movement", value: movement }),
        createElement(DetailRow, { key: "lastUpdate", label: "Last update", value: lastUpdate }),
    ];

    const links: Array<ReturnType<typeof createElement>> = [];
    if (advisoryUrl) {
        links.push(createElement("a", { key: "advisory", href: advisoryUrl, target: "_blank", rel: "noreferrer", style: linkStyle }, "Public Advisory"));
    }
    if (forecastUrl) {
        links.push(createElement("a", { key: "forecast", href: forecastUrl, target: "_blank", rel: "noreferrer", style: linkStyle }, "Forecast Track (KMZ)"));
    }
    if (discussionUrl) {
        links.push(createElement("a", { key: "discussion", href: discussionUrl, target: "_blank", rel: "noreferrer", style: linkStyle }, "Forecast Discussion"));
    }

    return createElement(
        "div",
        { style: panelStyle },
        createElement("h3", { style: titleStyle }, entity.label ?? "Unnamed Storm"),
        createElement("p", { style: subtitleStyle }, `${classification} · ${entity.latitude.toFixed(2)}°, ${entity.longitude.toFixed(2)}°`),
        createElement("dl", { style: dlStyle }, rows),
        links.length > 0 ? createElement("div", { style: linksStyle }, links) : null,
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return createElement(
        "div",
        { style: rowStyle },
        createElement("dt", { style: labelStyle }, label),
        createElement("dd", { style: valueStyle }, value),
    );
}

const panelStyle: CSSProperties = {
    padding: "12px",
    minWidth: 260,
    fontFamily: "system-ui, sans-serif",
    fontSize: 13,
    lineHeight: 1.5,
};
const titleStyle: CSSProperties = { margin: "0 0 4px", fontSize: 16, fontWeight: 700 };
const subtitleStyle: CSSProperties = { margin: "0 0 10px", color: "#64748b", fontSize: 12 };
const dlStyle: CSSProperties = { margin: 0 };
const rowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0" };
const labelStyle: CSSProperties = { color: "#64748b", margin: 0 };
const valueStyle: CSSProperties = { margin: 0, fontWeight: 600 };
const linksStyle: CSSProperties = { marginTop: 10, display: "flex", flexDirection: "column", gap: 4 };
const linkStyle: CSSProperties = { color: "#0ea5e9", textDecoration: "none" };

export class HurricaneStormsPlugin extends BaseIncidentPlugin {
    id = "hurricane-storms";
    name = "Hurricane Storms";
    description = "Live tropical storms & hurricanes from NOAA NHC (nhc.noaa.gov)";
    icon = CloudLightning;
    category = "natural-disaster" as const;
    version = pkg.version;
    protected defaultLayerColor = "#38bdf8";

    protected getSeverityValue(entity: GeoEntity): number {
        return typeof entity.properties.intensity === "number" && Number.isFinite(entity.properties.intensity)
            ? entity.properties.intensity
            : 0;
    }

    protected getSeverityColor(intensity: number): string {
        return severityColor(intensity);
    }

    protected getSeveritySize(intensity: number): number {
        return severitySize(intensity);
    }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const res = await globalThis.fetch("/api/hurricane-storms");
            if (!res.ok) {
                this.context?.onError(new Error(`Hurricane Storms API returned ${res.status}`));
                return [];
            }

            const data = await res.json();
            const storms = Array.isArray(data?.activeStorms) ? data.activeStorms : [];

            return storms.flatMap((storm: NhcActiveStorm): GeoEntity[] => {
                const entity = mapActiveStormToEntity(this.id, storm);
                return entity ? [entity] : [];
            });
        } catch (err) {
            const error = err instanceof Error ? err : new Error("Failed to fetch hurricane storms");
            this.context?.onError(error);
            return [];
        }
    }

    getServerConfig(): ServerPluginConfig {
        return {
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/hurricane-storms",
            pollingIntervalMs: 900000,
            historyEnabled: false,
        };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "classification",
                label: "Classification",
                type: "select",
                propertyKey: "classification",
                options: [
                    { value: "TD", label: "Tropical Depression" },
                    { value: "TS", label: "Tropical Storm" },
                    { value: "HU", label: "Hurricane" },
                ],
            },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "TD · < 39 mph", color: "#22c55e" },
            { label: "TS · 39-73 mph", color: "#fcd34d" },
            { label: "Cat 1-2 · 74-110 mph", color: "#f97316" },
            { label: "Cat 3+ · ≥ 111 mph", color: "#ef4444" },
        ];
    }

    getDetailComponent(): ComponentType<{ entity: GeoEntity }> {
        return HurricaneStormDetail;
    }
}