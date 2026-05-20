import React, { useEffect, useRef } from "react";
import { Pickaxe } from "lucide-react";
import * as Cesium from "cesium";
import {
    createSvgIconUrl,
    type WorldPlugin, type GeoEntity, type TimeRange,
    type PluginContext, type LayerConfig, type CesiumEntityOptions,
} from "@worldwideview/wwv-plugin-sdk";

const MineralMinesRenderer: React.FC<{ viewer: Cesium.Viewer | null; enabled: boolean }> = ({ viewer, enabled }) => {
    const dataSourceRef = useRef<Cesium.GeoJsonDataSource | null>(null);

    useEffect(() => {
        if (!viewer || !enabled) {
            // Cleanup on disable
            if (viewer && dataSourceRef.current) {
                viewer.dataSources.remove(dataSourceRef.current);
                dataSourceRef.current = null;
            }
            return;
        }

        let isCancelled = false;

        async function loadMines() {
            if (!viewer) return;
            try {
                const dataSource = new Cesium.GeoJsonDataSource("mineral-mines");
                
                // Load from public data folder
                const url = "/data/mineral_mines.geojson";
                
                await dataSource.load(url, {
                    markerSymbol: "minepost",
                    markerColor: Cesium.Color.fromCssColorString("#d97706"),
                    markerSize: 24,
                    clampToGround: true,
                });

                if (isCancelled) return;

                // Configure clustering
                dataSource.clustering.enabled = true;
                dataSource.clustering.pixelRange = 40;
                dataSource.clustering.minimumClusterSize = 3;

                // Custom styling for clusters
                dataSource.clustering.clusterEvent.addEventListener(
                    (clusteredEntities, cluster) => {
                        cluster.label.show = true;
                        cluster.label.text = clusteredEntities.length.toLocaleString();
                        cluster.label.font = "bold 14px sans-serif";
                        cluster.label.fillColor = Cesium.Color.WHITE;
                        cluster.label.outlineColor = Cesium.Color.BLACK;
                        cluster.label.outlineWidth = 2;
                        cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
                        cluster.label.verticalOrigin = Cesium.VerticalOrigin.CENTER;
                        cluster.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;

                        cluster.billboard.show = true;
                        cluster.billboard.id = cluster.label.id;
                        cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;

                        // Create pin builder or use SVG for clusters
                        const pinBuilder = new Cesium.PinBuilder();
                        cluster.billboard.image = pinBuilder.fromColor(
                            Cesium.Color.fromCssColorString("#d97706").withAlpha(0.8),
                            48
                        ).toDataURL();
                    }
                );

                viewer.dataSources.add(dataSource);
                dataSourceRef.current = dataSource;
            } catch (err) {
                console.error("[MineralMinesPlugin] Failed to load data", err);
            }
        }

        loadMines();

        return () => {
            isCancelled = true;
            if (viewer && dataSourceRef.current) {
                viewer.dataSources.remove(dataSourceRef.current);
                dataSourceRef.current = null;
            }
        };
    }, [viewer, enabled]);

    return null; // Side-effect only component
};

export class MineralMinesPlugin implements WorldPlugin {
    id = "mineral-mines";
    name = "Mineral Mines";
    description = "Global mining sites and quarries from OpenStreetMap.";
    icon = Pickaxe;
    category = "economic" as const;
    version = "1.0.0";
    private iconUrl?: string;

    async initialize(_ctx: PluginContext): Promise<void> { }
    destroy(): void { }
    async fetch(_tr: TimeRange): Promise<GeoEntity[]> { return []; }
    getPollingInterval(): number { return 0; }

    getLayerConfig(): LayerConfig {
        return { color: "#d97706", clusterEnabled: true, clusterDistance: 50, maxEntities: 50000 };
    }

    renderEntity(_entity: GeoEntity): CesiumEntityOptions {
        if (!this.iconUrl) {
            this.iconUrl = createSvgIconUrl(Pickaxe, { color: "#d97706" });
        }
        return { type: "billboard", iconUrl: this.iconUrl, color: "#d97706" };
    }

    getGlobeComponent() {
        return MineralMinesRenderer;
    }
}
