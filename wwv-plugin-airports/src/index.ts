
import { PlaneTakeoff } from "lucide-react";
import { createSvgIconUrl } from "@worldwideview/wwv-plugin-sdk";
import dataRaw from "../data/data.json?raw";

function representativePoint(geom) {
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
    id = "airports";
    name = "airports";
    description = "WorldWideView plugin — Airports and aerodromes worldwide from OSM";
    icon = PlaneTakeoff;
    category = "Aviation";
    version = "1.1.3";

    _context = null;
    _entities = [];
    _iconUrls = {};

    async initialize(ctx) {
        this._context = ctx;
        let data = null;
        try {
            data = JSON.parse(dataRaw);
        } catch(e) {
            console.error("Failed to parse data for airports", e);
        }
        if (data && Array.isArray(data.features)) {
            this._entities = data.features.map((f, i) => {
                const pt = representativePoint(f.geometry);
                return {
                    id: "airports-" + (f.id ?? i),
                    pluginId: "airports",
                    latitude: pt.lat,
                    longitude: pt.lon,
                    altitude: pt.alt,
                    timestamp: new Date(),
                    label: f.properties?.name ?? f.properties?.name ?? undefined,
                    properties: { ...f.properties, _geometryType: f.geometry?.type },
                };
            });
        }
    }

    destroy() { this._context = null; this._entities = []; }
    async fetch(_timeRange) { return this._entities; }
    getPollingInterval() { return 0; }

    getLayerConfig() {
        return {
            color: "#ffffff",
            clusterEnabled: true,
            clusterDistance: 50,
            maxEntities: 5000,
        };
    }

    renderEntity(_entity) {
        return { type: "point", color: "#ffffff", size: 6 };
    }
}
