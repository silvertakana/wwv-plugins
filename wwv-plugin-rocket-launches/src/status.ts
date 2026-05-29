/**
 * Status color mapping for Launch Library 2 status abbreviations.
 * Pre-built at module scope so createSvgIconUrl is only called once per color.
 */
import { createSvgIconUrl } from "@worldwideview/wwv-plugin-sdk";
import { Rocket } from "lucide-react";

/** Status abbreviation to hex color. */
export const STATUS_COLORS: Record<string, string> = {
    Go: "#22c55e",
    Success: "#3b82f6",
    Failure: "#ef4444",
    "Partial Failure": "#ef4444",
    Hold: "#f59e0b",
    "In Flight": "#06b6d4",
    TBD: "#9ca3af",
    TBC: "#9ca3af",
};

export const DEFAULT_STATUS_COLOR = "#818cf8";

/**
 * Returns the hex color for a given status abbreviation string.
 * Falls back to DEFAULT_STATUS_COLOR for unknown values.
 */
export function statusColor(abbrev: string | undefined | null): string {
    if (!abbrev) return DEFAULT_STATUS_COLOR;
    return STATUS_COLORS[abbrev] ?? DEFAULT_STATUS_COLOR;
}

/** Pre-built icon URL cache keyed by hex color string. */
const _iconCache: Record<string, string> = {};

export function getIconUrl(color: string): string {
    if (!_iconCache[color]) {
        _iconCache[color] = createSvgIconUrl(Rocket, { color });
    }
    return _iconCache[color];
}

/** Pre-build all known status icon URLs at module load time. */
const ALL_COLORS = new Set([...Object.values(STATUS_COLORS), DEFAULT_STATUS_COLOR]);
for (const color of ALL_COLORS) {
    getIconUrl(color);
}
