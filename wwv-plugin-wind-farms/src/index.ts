import { Wind } from "lucide-react";
import { createSvgIconUrl } from "@worldwideview/wwv-plugin-sdk";
import dataRaw from "../data/data.json?raw";

function representativePoint(geom: any) {
    if (!geom) return { lat: 0, lon: 0 };
    switch (geom.type) {
        case "Point":
            return { lat: geom.coordinates[1], lon: geom.coordinates[0], alt: geom.coordinates[2] };
        case "MultiPoint":
        case "LineString":
            return { lat: geom.coordinates[0][1], lon: geom.coordinates[0][0] };
        case "Polygon":
        case "MultiLineString":
            return { lat: geom.coordinates[0][0][1], lon: geom.coordinates[0][0][0] };
        case "MultiPolygon":
            return { lat: geom.coordinates[0][0][0][1], lon: geom.coordinates[0][0][0][0] };
        default:
            return { lat: 0, lon: 0 };
    }
}

export default class AutoStaticPlugin {
    id = "wind-farms";
    name = "Wind Farms";
    description = "Wind power farms and plants worldwide";
    icon = Wind;
    category = "Energy";
    version = "1.0.0";

    _context: any = null;
    _entities: any[] = [];
    _iconUrl?: string;

    async initialize(ctx: any) {
        this._context = ctx;
        let data: any = null;
        try {
            data = JSON.parse(dataRaw);
        } catch (e) {
            console.error("Failed to parse data for wind-farms", e);
        }
        if (data && Array.isArray(data.features)) {
            this._entities = data.features.map((f: any, i: number) => {
                const pt = representativePoint(f.geometry);
                return {
                    id: "wind-farms-" + (f.id ?? f.properties?.wikidata_id ?? i),
                    pluginId: "wind-farms",
                    latitude: pt.lat,
                    longitude: pt.lon,
                    altitude: pt.alt,
                    timestamp: new Date(),
                    label: f.properties?.name ?? undefined,
                    properties: { ...f.properties, _geometryType: f.geometry?.type },
                };
            });
        }
    }

    destroy() { this._context = null; this._entities = []; }
    async fetch(_timeRange: any) { return this._entities; }
    getPollingInterval() { return 0; }

    getLayerConfig() {
        return { color: "#38bdf8", clusterEnabled: true, clusterDistance: 50, maxEntities: 5000 };
    }

    renderEntity(_entity: any) {
        if (!this._iconUrl) {
            this._iconUrl = createSvgIconUrl(Wind, { color: "#38bdf8" });
        }
        return { type: "billboard" as const, iconUrl: this._iconUrl, color: "#38bdf8" };
    }
}
