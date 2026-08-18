import { Globe } from "lucide-react";
import type {
    WorldPlugin,
    PluginContext,
    TimeRange,
    GeoEntity,
    LayerConfig,
    CesiumEntityOptions,
    SelectionBehavior,
    PluginCategory,
} from "@worldwideview/wwv-plugin-sdk";
import { IpGeolocateSidebar } from "./components/IpGeolocateSidebar";
import dataRaw from "../data/data.json?raw";

/** A single country centroid + name entry (index 0 = Unknown). */
export interface CountryInfo {
    code: string;
    name: string;
    lat: number;
    lng: number;
}

/** Shape of data/data.json (compact base64 typed arrays, see scripts/prepare-data.mjs). */
interface IpGeoData {
    countries: CountryInfo[];
    ranges: {
        s: string; // base64 Uint32Array of range starts
        e: string; // base64 Uint32Array of range ends
        c: string; // base64 Uint16Array of country indices
        n: number; // row count
    };
}

function decodeB64(b64: string, Ctor: typeof Uint32Array | typeof Uint16Array): Uint32Array | Uint16Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = new Ctor(bytes.length / Ctor.BYTES_PER_ELEMENT);
    if (Ctor === Uint32Array) {
        for (let i = 0; i < out.length; i++) out[i] = dv.getUint32(i * 4, true);
    } else {
        for (let i = 0; i < out.length; i++) out[i] = dv.getUint16(i * 2, true);
    }
    return out;
}

export function ipToUint32(ip: string): number | null {
    const parts = ip.split(".");
    if (parts.length !== 4) return null;
    let v = 0;
    for (let i = 0; i < 4; i++) {
        const o = Number(parts[i]);
        if (!Number.isInteger(o) || o < 0 || o > 255) return null;
        v = (v << 8) | o;
    }
    return v >>> 0;
}

export default class IpGeolocatePlugin implements WorldPlugin {
    id = "ip-geolocate";
    name = "IP Geolocate";
    description = "Find where any IP address lives on the globe. Country-level lookup, fully offline.";
    icon = Globe;
    category: PluginCategory = "custom";
    version = "1.0.0";

    private ctx: PluginContext | null = null;
    private countries: CountryInfo[] = [];
    private starts: Uint32Array = new Uint32Array(0);
    private ends: Uint32Array = new Uint32Array(0);
    private codes: Uint16Array = new Uint16Array(0);

    async initialize(ctx: PluginContext) {
        this.ctx = ctx;
        try {
            const data = JSON.parse(dataRaw) as IpGeoData;
            this.countries = data.countries ?? [];
            this.starts = decodeB64(data.ranges.s, Uint32Array) as Uint32Array;
            this.ends = decodeB64(data.ranges.e, Uint32Array) as Uint32Array;
            this.codes = decodeB64(data.ranges.c, Uint16Array) as Uint16Array;
        } catch (e) {
            console.error("Failed to parse IP geolocate data", e);
            this.countries = [];
            this.starts = new Uint32Array(0);
            this.ends = new Uint32Array(0);
            this.codes = new Uint16Array(0);
        }
    }

    destroy() {
        this.ctx = null;
        this.countries = [];
        this.starts = new Uint32Array(0);
        this.ends = new Uint32Array(0);
        this.codes = new Uint16Array(0);
    }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        return [];
    }

    getPollingInterval() {
        return 999999999;
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#4f8cff",
            clusterEnabled: false,
            clusterDistance: 50,
            maxEntities: 50,
        };
    }

    renderEntity(_entity: GeoEntity): CesiumEntityOptions {
        return {
            type: "point",
            color: "#4f8cff",
            size: 10,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        };
    }

    getSelectionBehavior(_entity: GeoEntity): SelectionBehavior | null {
        return { flyToBaseDistance: 500000, showTrail: false };
    }

    getSidebarComponent() {
        return IpGeolocateSidebar;
    }

    /** Public bridge for the sidebar to push lookup results into the main map state. */
    pushResults(entities: GeoEntity[]) {
        if (this.ctx) {
            this.ctx.onDataUpdate(entities);
        }
    }

    /**
     * Look up an IPv4 address against the bundled country ranges.
     * Returns country info or null when the IP is invalid or unmatched.
     */
    lookup(ip: string): CountryInfo | null {
        const target = ipToUint32(ip);
        if (target === null || this.starts.length === 0) return null;
        let lo = 0;
        let hi = this.starts.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (this.starts[mid] <= target) {
                if (target <= this.ends[mid]) {
                    const c = this.countries[this.codes[mid]];
                    return c ?? null;
                }
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return null;
    }
}
