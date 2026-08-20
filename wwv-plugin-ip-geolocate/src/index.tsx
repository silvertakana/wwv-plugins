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

/** A single resolved city location returned by a lookup. */
export interface CityInfo {
    code: string; // ISO 3166-1 alpha-2 country code (empty string when unknown)
    city: string;
    lat: number;
    lng: number;
}

/** Shape of data/data.json (compact base64 typed arrays, see scripts/prepare-data.mjs). */
interface IpGeoData {
    countries: string[]; // country code by index (0 = "")
    locs: {
        c: string; // base64 Uint16Array of country indices
        t: string; // concatenated city strings (sliced by off, no separator)
        off: string; // base64 Uint32Array of per-loc start offsets into t
        y: string; // base64 Float32Array of latitudes
        x: string; // base64 Float32Array of longitudes
        n: number; // loc count
    };
    ranges: {
        s: string; // base64 Uint32Array of range starts
        e: string; // base64 Uint32Array of range ends
        i: string; // base64 Uint16Array|Uint32Array of loc indices
        n: number; // range count
        u32: boolean; // true when loc indices are Uint32
    };
}

type TypedCtor = typeof Uint32Array | typeof Uint16Array | typeof Float32Array;
type TypedOut<T extends TypedCtor> = T extends typeof Float32Array
    ? Float32Array
    : T extends typeof Uint32Array
      ? Uint32Array
      : Uint16Array;

function decodeB64<T extends TypedCtor>(b64: string, Ctor: T): TypedOut<T> {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = new Ctor(bytes.length / Ctor.BYTES_PER_ELEMENT) as TypedOut<T>;
    for (let i = 0; i < out.length; i++) {
        const off = i * Ctor.BYTES_PER_ELEMENT;
        if (Ctor === Uint32Array) out[i] = dv.getUint32(off, true) as never;
        else if (Ctor === Uint16Array) out[i] = dv.getUint16(off, true) as never;
        else out[i] = dv.getFloat32(off, true) as never;
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
    description = "Find where any IP address lives on the globe. City-level lookup, fully offline.";
    icon = Globe;
    category: PluginCategory = "custom";
    version = "1.1.0";

    private ctx: PluginContext | null = null;
    private countries: string[] = [];
    private locC: Uint16Array = new Uint16Array(0);
    private locOff: Uint32Array = new Uint32Array(0);
    private locY: Float32Array = new Float32Array(0);
    private locX: Float32Array = new Float32Array(0);
    private cityStr = "";
    private starts: Uint32Array = new Uint32Array(0);
    private ends: Uint32Array = new Uint32Array(0);
    private locIdx: Uint16Array | Uint32Array = new Uint16Array(0);

    async initialize(ctx: PluginContext) {
        this.ctx = ctx;
        try {
            const data = JSON.parse(dataRaw) as IpGeoData;
            this.countries = data.countries ?? [];
            this.locC = decodeB64(data.locs.c, Uint16Array) as Uint16Array;
            this.locOff = decodeB64(data.locs.off, Uint32Array) as Uint32Array;
            this.locY = decodeB64(data.locs.y, Float32Array) as Float32Array;
            this.locX = decodeB64(data.locs.x, Float32Array) as Float32Array;
            this.cityStr = data.locs.t ?? "";
            this.starts = decodeB64(data.ranges.s, Uint32Array) as Uint32Array;
            this.ends = decodeB64(data.ranges.e, Uint32Array) as Uint32Array;
            this.locIdx = data.ranges.u32
                ? (decodeB64(data.ranges.i, Uint32Array) as Uint32Array)
                : (decodeB64(data.ranges.i, Uint16Array) as Uint16Array);
        } catch (e) {
            console.error("Failed to parse IP geolocate data", e);
            this.countries = [];
            this.starts = new Uint32Array(0);
            this.ends = new Uint32Array(0);
            this.locIdx = new Uint16Array(0);
        }
    }

    destroy() {
        this.ctx = null;
        this.countries = [];
        this.starts = new Uint32Array(0);
        this.ends = new Uint32Array(0);
        this.locIdx = new Uint16Array(0);
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

    private locationAt(li: number): CityInfo {
        const ci = this.locC[li];
        return {
            code: this.countries[ci] ?? "",
            city: this.cityStr.slice(this.locOff[li], this.locOff[li + 1]),
            lat: this.locY[li],
            lng: this.locX[li],
        };
    }

    /**
     * Look up an IPv4 address against the bundled city ranges.
     * Returns the resolved city + real coordinates, or null when the IP is
     * invalid, private/reserved, or unmatched.
     */
    lookup(ip: string): CityInfo | null {
        const target = ipToUint32(ip);
        if (target === null || this.starts.length === 0) return null;
        let lo = 0;
        let hi = this.starts.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (this.starts[mid] <= target) {
                if (target <= this.ends[mid]) {
                    return this.locationAt(this.locIdx[mid]);
                }
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return null;
    }
}
