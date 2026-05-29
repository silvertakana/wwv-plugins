import { Rocket } from "lucide-react";
import {
    type WorldPlugin,
    type GeoEntity,
    type TimeRange,
    type PluginContext,
    type LayerConfig,
    type CesiumEntityOptions,
    type PluginCategory,
    type FilterDefinition,
} from "@worldwideview/wwv-plugin-sdk";
import pkg from "../package.json";
import { mapLaunchToEntity, type LL2Launch } from "./mapper";
import { statusColor, getIconUrl } from "./status";

const BASE_URL = import.meta.env.DEV
    ? "https://lldev.thespacedevs.com/2.2.0"
    : "https://ll.thespacedevs.com/2.2.0";

export class RocketLaunchesPlugin implements WorldPlugin {
    id = "rocket-launches";
    name = "Rocket Launches";
    description = "Upcoming and recent rocket launches pinned to their launch sites worldwide";
    icon = Rocket;
    category: PluginCategory = "space";
    version = pkg.version;

    private context: PluginContext | null = null;

    async initialize(ctx: PluginContext): Promise<void> {
        this.context = ctx;
    }

    destroy(): void {
        this.context = null;
    }

    getPollingInterval(): number {
        return 900_000; // 15 minutes — safe within LL2 anonymous rate limit (8 req/hr of 15 allowed)
    }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        const [upcomingRes, previousRes] = await Promise.all([
            globalThis.fetch(`${BASE_URL}/launch/upcoming/?limit=100&mode=detailed&ordering=net`),
            globalThis.fetch(`${BASE_URL}/launch/previous/?limit=30&mode=detailed&ordering=-net`),
        ]);

        if (!upcomingRes.ok) throw new Error(`LL2 upcoming returned ${upcomingRes.status}`);
        if (!previousRes.ok) throw new Error(`LL2 previous returned ${previousRes.status}`);

        const [upcomingData, previousData] = await Promise.all([
            upcomingRes.json() as Promise<{ results: LL2Launch[] }>,
            previousRes.json() as Promise<{ results: LL2Launch[] }>,
        ]);

        // Merge and dedupe by launch id — upcoming takes precedence
        const byId = new Map<string, LL2Launch>();
        for (const launch of (previousData.results ?? [])) {
            byId.set(launch.id, launch);
        }
        for (const launch of (upcomingData.results ?? [])) {
            byId.set(launch.id, launch);
        }

        // Single `now` for the whole batch so time_bucket values are consistent.
        const now = Date.now();
        const entities: GeoEntity[] = [];
        for (const launch of byId.values()) {
            const entity = mapLaunchToEntity(launch, now);
            if (entity !== null) entities.push(entity);
        }

        return entities;
    }

    /**
     * Filters surfaced in the app's "Filters" tab for this layer. All data stays
     * loaded; these only narrow what is shown. Empty selection = show everything.
     */
    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "launch-window",
                label: "Launch Window",
                type: "select",
                propertyKey: "time_bucket",
                options: [
                    { value: "past", label: "Past" },
                    { value: "next-7d", label: "Next 7 days" },
                    { value: "next-30d", label: "Next 30 days" },
                    { value: "next-90d", label: "Next 90 days" },
                    { value: "beyond-90d", label: "Beyond 90 days" },
                ],
            },
            {
                id: "status",
                label: "Status",
                type: "select",
                propertyKey: "status_abbrev",
                options: [
                    { value: "Go", label: "Go for Launch" },
                    { value: "TBC", label: "To Be Confirmed" },
                    { value: "TBD", label: "To Be Determined" },
                    { value: "Success", label: "Success" },
                    { value: "Failure", label: "Failure" },
                    { value: "Hold", label: "Hold" },
                    { value: "In Flight", label: "In Flight" },
                    { value: "Partial Failure", label: "Partial Failure" },
                ],
            },
        ];
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#818cf8",
            clusterEnabled: true,
            clusterDistance: 40,
        };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const abbrev = entity.properties?.status_abbrev as string | undefined;
        const color = statusColor(abbrev);
        return {
            type: "billboard",
            iconUrl: getIconUrl(color),
            iconScale: 0.75,
        };
    }
}

export default RocketLaunchesPlugin;
export { mapLaunchToEntity } from "./mapper";
