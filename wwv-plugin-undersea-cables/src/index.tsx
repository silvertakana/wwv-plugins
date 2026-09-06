import React, { useEffect, useRef } from "react";
import { Cable } from "lucide-react";
import * as Cesium from "cesium";
import type {
    GlobePlugin,
    GeoEntity,
    TimeRange,
    PluginContext,
    LayerConfig,
    CesiumEntityOptions,
    ServerPluginConfig,
} from "@worldwideview/wwv-plugin-sdk";

const UnderseaCablesRenderer: React.FC<{ viewer: Cesium.Viewer | null; enabled: boolean; engineBaseUrl?: string }> = ({ viewer, enabled, engineBaseUrl }) => {
    const dataSourceRef = useRef<Cesium.CustomDataSource | null>(null);

    useEffect(() => {
        if (!viewer || !enabled) {
            // Cleanup on disable
            if (viewer && !viewer.isDestroyed() && viewer.dataSources && dataSourceRef.current) {
                viewer.dataSources.remove(dataSourceRef.current);
                dataSourceRef.current = null;
            }
            return;
        }

        let isCancelled = false;

        async function loadCables() {
            if (!viewer) return;
            try {
                const activeDataSource = new Cesium.CustomDataSource("undersea-cables");
                viewer.dataSources.add(activeDataSource);
                dataSourceRef.current = activeDataSource;
                
                // Source GeoJSON from the data engine REST envelope: { source, fetchedAt, items, totalCount }
                const engineBase = engineBaseUrl || "https://dataenginev2.worldwideview.dev";
                const url = `${engineBase}/api/undersea-cables`;
                
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                const geojson = (json && json.items) || json;
                
                const tempDataSource = new Cesium.GeoJsonDataSource("temp-parse");
                await tempDataSource.load(geojson);

                if (isCancelled) return;

                const parsedEntities = [...tempDataSource.entities.values];
                const lineColor = Cesium.Color.fromCssColorString("#0ea5e9").withAlpha(0.6);
                
                let i = 0;
                const CHUNK_SIZE = 50;

                function processChunk() {
                    if (isCancelled || !viewer) return;
                    
                    activeDataSource.entities.suspendEvents();
                    
                    const chunkLimit = Math.min(i + CHUNK_SIZE, parsedEntities.length);
                    for (; i < chunkLimit; i++) {
                        const entity = parsedEntities[i];
                        tempDataSource.entities.remove(entity);
                        
                        if (entity.polyline) {
                            entity.polyline.width = new Cesium.ConstantProperty(2);
                            entity.polyline.material = new Cesium.ColorMaterialProperty(lineColor);
                            entity.polyline.clampToGround = new Cesium.ConstantProperty(false);
                            
                            const posProperty = entity.polyline.positions;
                            if (posProperty) {
                                const positions = typeof posProperty.getValue === "function" ? posProperty.getValue(Cesium.JulianDate.now()) : posProperty;
                                if (positions && Array.isArray(positions)) {
                                    const raisedPositions = positions.map((pos: any) => {
                                        const carto = Cesium.Cartographic.fromCartesian(pos);
                                        carto.height += 2500; // Raise by 2.5km to prevent low-res Earth geometry clipping
                                        return Cesium.Cartographic.toCartesian(carto);
                                    });
                                    entity.polyline.positions = new Cesium.ConstantProperty(raisedPositions);
                                }
                            }
                        }
                        const props = entity.properties ? entity.properties.getValue(Cesium.JulianDate.now()) : {};
                        let desc = `<table class="cesium-infoBox-defaultTable"><tbody>`;
                        for (const key in props) {
                            if (props.hasOwnProperty(key)) {
                                desc += `<tr><th>${key}</th><td>${props[key]}</td></tr>`;
                            }
                        }
                        desc += `</tbody></table>`;
                        entity.description = new Cesium.ConstantProperty(desc);
                        
                        activeDataSource.entities.add(entity);
                    }
                    
                    activeDataSource.entities.resumeEvents();

                    if (i < parsedEntities.length) {
                        requestAnimationFrame(processChunk);
                    }
                }

                processChunk();
            } catch (err) {
                console.error("[UnderseaCablesPlugin] Failed to load data", err);
            }
        }

        loadCables();

        return () => {
            isCancelled = true;
            if (viewer && !viewer.isDestroyed() && viewer.dataSources && dataSourceRef.current) {
                viewer.dataSources.remove(dataSourceRef.current);
                dataSourceRef.current = null;
            }
        };
    }, [viewer, enabled]);

    return null; // Side-effect only component
};

export class UnderseaCablesPlugin implements GlobePlugin {
    id = "undersea-cables";
    name = "Undersea Cables";
    description = "Displays the global network of submarine telecommunication cables.";
    icon = Cable;
    category = "infrastructure" as const;
    version = "1.0.0";

    private engineBaseUrl = "";

    async initialize(ctx: PluginContext): Promise<void> {
        this.engineBaseUrl = ctx.getEngineUrl();
    }

    destroy(): void {}

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> { return []; }

    mapWebsocketPayload(payload: any): GeoEntity[] {
        try {
            let features: any[] = [];
            if (payload && payload.items && payload.items.type === "FeatureCollection" && Array.isArray(payload.items.features)) {
                features = payload.items.features;
            } else if (payload && Array.isArray(payload.features)) {
                features = payload.features;
            } else if (Array.isArray(payload)) {
                features = payload;
            }

            const entities = features.map((feature: any, index: number): GeoEntity | null => {
                if (!feature) return null;
                const props = feature.properties || {};

                let anchor: number[] | null = null;
                if (Array.isArray(props.coordinates) && props.coordinates.length >= 2
                    && typeof props.coordinates[0] === "number" && typeof props.coordinates[1] === "number") {
                    anchor = [props.coordinates[0], props.coordinates[1]];
                } else if (feature.geometry && feature.geometry.type && Array.isArray(feature.geometry.coordinates)) {
                    const g = feature.geometry;
                    switch (g.type) {
                        case "Point":
                            anchor = [g.coordinates[0], g.coordinates[1]];
                            break;
                        case "LineString":
                            anchor = [g.coordinates[0][0], g.coordinates[0][1]];
                            break;
                        case "MultiLineString":
                            anchor = [g.coordinates[0][0][0], g.coordinates[0][0][1]];
                            break;
                        case "Polygon":
                            anchor = [g.coordinates[0][0][0], g.coordinates[0][0][1]];
                            break;
                        case "MultiPolygon":
                            anchor = [g.coordinates[0][0][0][0], g.coordinates[0][0][0][1]];
                            break;
                    }
                }
                if (!anchor || typeof anchor[0] !== "number" || typeof anchor[1] !== "number") return null;

                return {
                    id: String(props.feature_id ?? feature.id ?? `uc-${index}`),
                    pluginId: "undersea-cables",
                    latitude: Number(anchor[1]),
                    longitude: Number(anchor[0]),
                    timestamp: new Date(payload?.fetchedAt ?? Date.now()),
                    label: String(props.name ?? ""),
                    properties: {
                        name: props.name,
                        id: props.id,
                        color: props.color,
                        feature_id: props.feature_id,
                    },
                };
            });

            return entities.filter((entity: GeoEntity | null): entity is GeoEntity => entity !== null);
        } catch {
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return { apiBasePath: "/api/undersea-cables", pollingIntervalMs: 0 };
    }

    getLayerConfig(): LayerConfig {
        return { color: "#0ea5e9", clusterEnabled: false, clusterDistance: 0, disableDefaultRendering: true };
    }

    renderEntity(_entity: GeoEntity): CesiumEntityOptions {
        return { type: "polyline" }; // Fallback since actual rendering is via GlobeComponent
    }

    getGlobeComponent() {
        const engineBaseUrl = this.engineBaseUrl;
        return (props: { viewer: Cesium.Viewer | null; enabled: boolean }) => (
            <UnderseaCablesRenderer {...props} engineBaseUrl={engineBaseUrl} />
        );
    }
}
