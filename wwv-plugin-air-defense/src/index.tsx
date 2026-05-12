import React from "react";
import { ShieldAlert } from "lucide-react";
import * as Cesium from "cesium";
import { Entity, PolygonGraphics } from "resium";
import type {
    GlobePlugin, GeoEntity, TimeRange, PluginContext,
    LayerConfig, CesiumEntityOptions,
} from "@worldwideview/wwv-plugin-sdk";
import { ADIZ_ZONES } from "./zones";

const AirDefenseRenderer: React.FC<{ viewer: Cesium.Viewer | null; enabled: boolean }> = ({ enabled }) => {
    if (!enabled) return null;

    return (
        <>
            {ADIZ_ZONES.map(zone => {
                const positions = Cesium.Cartesian3.fromDegreesArray(
                    zone.polygon.flatMap(p => [p[0], p[1]])
                );
                
                const isAdiz = zone.type === "ADIZ";
                const fillColor = Cesium.Color.fromCssColorString(isAdiz ? "#ef4444" : "#fb923c").withAlpha(0.2);
                const outlineColor = Cesium.Color.fromCssColorString(isAdiz ? "#ef4444" : "#fb923c");

                return (
                    <Entity
                        key={zone.id}
                        name={zone.name}
                        description={`
                            <table class="cesium-infoBox-defaultTable">
                                <tbody>
                                    <tr><th>Country</th><td>${zone.country}</td></tr>
                                    <tr><th>Type</th><td>${zone.type}</td></tr>
                                    <tr><th>Status</th><td>${zone.status}</td></tr>
                                </tbody>
                            </table>
                        `}
                    >
                        <PolygonGraphics
                            hierarchy={positions}
                            material={fillColor}
                            outline={true}
                            outlineColor={outlineColor}
                            outlineWidth={2}
                            height={0} // Clamp to ground
                        />
                    </Entity>
                );
            })}
        </>
    );
};

export class AirDefensePlugin implements GlobePlugin {
    id = "air-defense";
    name = "Air Defense Zones";
    description = "Known ADIZ boundaries, no-fly zones, and restricted airspace.";
    icon = ShieldAlert;
    category = "conflict" as const;
    version = "1.0.0";

    async initialize(_ctx: PluginContext): Promise<void> { }
    destroy(): void { }

    async fetch(_tr: TimeRange): Promise<GeoEntity[]> { return []; }

    getPollingInterval(): number { return 0; }

    getLayerConfig(): LayerConfig {
        return { color: "#ef4444", clusterEnabled: false, clusterDistance: 0 };
    }

    renderEntity(_entity: GeoEntity): CesiumEntityOptions {
        // Fallback
        return { type: "point", color: "#ef4444" };
    }

    getGlobeComponent() {
        return AirDefenseRenderer;
    }
}
