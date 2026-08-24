import type { CSSProperties } from "react";
import { type GeoEntity } from "@worldwideview/wwv-plugin-sdk";

/** Strip the `datetime:` tag applied by dtProp() for plain display. */
function unwrapDt(value: unknown): string | null {
    if (typeof value !== "string" || !value.startsWith("datetime:")) return null;
    return value.slice(9);
}

function fmt(value: unknown, unit: string): string {
    return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)} ${unit}` : "n/a";
}

function dirLabel(degrees: unknown): string {
    if (typeof degrees !== "number" || !Number.isFinite(degrees)) return "n/a";
    const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return `${Math.round(degrees)}° ${dirs[Math.round(degrees / 22.5) % 16]}`;
}

/**
 * Detail panel rendered when a buoy entity is clicked: station identity plus
 * the latest observed marine conditions (wave, wind, temperature, pressure).
 */
export function MarineBuoyDetail({ entity }: { entity: GeoEntity }) {
    const props = entity.properties;
    const observedAt = unwrapDt(props.observedAt);
    const observedText = observedAt && !Number.isNaN(Date.parse(observedAt))
        ? new Date(observedAt).toLocaleString()
        : "n/a";

    return (
        <div style={panelStyle}>
            <h3 style={titleStyle}>{entity.label ?? "Unknown Station"}</h3>
            <p style={subtitleStyle}>
                {entity.latitude.toFixed(2)}°, {entity.longitude.toFixed(2)}°
            </p>
            <dl style={{ margin: 0 }}>
                <DetailRow label="Observed" value={observedText} />
                <DetailRow label="Wave height" value={fmt(props.wvht, "m")} />
                <DetailRow label="Wave period" value={fmt(props.dpd, "s")} />
                <DetailRow label="Wind speed" value={fmt(props.wspd, "m/s")} />
                <DetailRow label="Wind gust" value={fmt(props.gst, "m/s")} />
                <DetailRow label="Wind direction" value={dirLabel(props.wdir)} />
                <DetailRow label="Air temp" value={fmt(props.atmp, "°C")} />
                <DetailRow label="Water temp" value={fmt(props.wtmp, "°C")} />
                <DetailRow label="Pressure" value={fmt(props.pres, "hPa")} />
            </dl>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={rowStyle}>
            <dt style={labelStyle}>{label}</dt>
            <dd style={valueStyle}>{value}</dd>
        </div>
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
const rowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0" };
const labelStyle: CSSProperties = { color: "#64748b", margin: 0 };
const valueStyle: CSSProperties = { margin: 0, fontWeight: 600 };