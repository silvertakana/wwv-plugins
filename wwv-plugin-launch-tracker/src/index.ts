import { Rocket } from "lucide-react";
import type { ComponentType } from "react";
import {
    type GeoEntity,
    type TimeRange,
    type FilterDefinition,
    type ServerPluginConfig,
} from "@worldwideview/wwv-plugin-sdk";
import { BaseIncidentPlugin } from "@worldwideview/wwv-lib-incidents";
import { mapLaunchItemToEntity, type LaunchItem } from "./mapper";
import { LaunchTrackerDetail } from "./DetailPanel";

/** Status rank used for severity: upcoming=1, in-flight=2, success=3, failure=4, unknown=0. */
export const STATUS_RANK: Record<string, number> = {
    "go for launch": 1,
    "to be confirmed": 1,
    "to be determined": 1,
    hold: 1,
    "in flight": 2,
    success: 3,
    failure: 4,
    "partial failure": 4,
};

/** Normalise any payload shape into a list of launch items. */
function extractItems(data: unknown): LaunchItem[] {
    if (Array.isArray(data)) return data as LaunchItem[];
    if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        if (Array.isArray(obj.items)) return obj.items as LaunchItem[];
        if (Array.isArray(obj.results)) return obj.results as LaunchItem[];
    }
    return [];
}

export class LaunchTrackerPlugin extends BaseIncidentPlugin {
    id = "launch-tracker";
    name = "Launch Tracker";
    description = "Live upcoming rocket launches from Launch Library 2, engine-backed";
    icon = Rocket;
    category = "space" as const;
    version = "1.0.0";
    protected defaultLayerColor = "#818cf8";

    protected getSeverityValue(entity: GeoEntity): number {
        const status = String(entity.properties.status ?? "").toLowerCase();
        return STATUS_RANK[status] ?? 0;
    }

    protected getSeverityColor(value: number): string {
        switch (value) {
            case 1: return "#818cf8"; // Upcoming (indigo)
            case 2: return "#06b6d4"; // In flight (cyan)
            case 3: return "#22c55e"; // Success (green)
            case 4: return "#ef4444"; // Failure (red)
            default: return "#9ca3af"; // Unknown (gray)
        }
    }

    protected getSeveritySize(value: number): number {
        switch (value) {
            case 1: return 8;
            case 2: return 10;
            case 3: return 12;
            case 4: return 14;
            default: return 6;
        }
    }

    getPollingInterval(): number {
        return 900_000; // 15 minutes — safe within LL2 anonymous rate limit (8 req/hr of 15 allowed)
    }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const res = await globalThis.fetch("/api/launch-tracker");
            if (!res.ok) {
                this.context?.onError(new Error(`Launch Tracker API returned ${res.status}`));
                return [];
            }

            const data = await res.json();
            // Single `now` for the whole batch so time_bucket values are consistent.
            const now = Date.now();
            return extractItems(data).flatMap((item) => {
                const entity = mapLaunchItemToEntity(item, now);
                return entity ? [entity] : [];
            });
        } catch (err) {
            this.context?.onError(err instanceof Error ? err : new Error("Failed to fetch launches"));
            return [];
        }
    }

    /**
     * The seeder broadcasts flat launch items (not GeoEntities), so normalise
     * every WS envelope through the same mapper used by the HTTP fetch path.
     */
    mapWebsocketPayload(payload: unknown, _existingEntities?: GeoEntity[]): GeoEntity[] {
        const now = Date.now();
        return extractItems(payload).flatMap((item) => {
            const entity = mapLaunchItemToEntity(item, now);
            return entity ? [entity] : [];
        });
    }

    getServerConfig(): ServerPluginConfig {
        return {
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/launch-tracker",
            pollingIntervalMs: 900000,
            historyEnabled: false,
        };
    }

    getLayerConfig() {
        return {
            color: this.defaultLayerColor,
            clusterEnabled: true,
            clusterDistance: 40,
            maxEntities: 2000,
        };
    }

    renderEntity(entity: GeoEntity) {
        const severity = this.getSeverityValue(entity);
        return {
            type: "point" as const,
            color: this.getSeverityColor(severity),
            size: this.getSeveritySize(severity),
            outlineColor: "#000000",
            outlineWidth: 1,
            labelText: entity.label,
        };
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
                propertyKey: "status",
                options: [
                    { value: "Go for Launch", label: "Go for Launch" },
                    { value: "To Be Confirmed", label: "To Be Confirmed" },
                    { value: "To Be Determined", label: "To Be Determined" },
                    { value: "Hold", label: "Hold" },
                    { value: "In Flight", label: "In Flight" },
                    { value: "Success", label: "Success" },
                    { value: "Partial Failure", label: "Partial Failure" },
                    { value: "Failure", label: "Failure" },
                ],
            },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Upcoming", color: "#818cf8", filterId: "status", filterValue: "Go for Launch" },
            { label: "In Flight", color: "#06b6d4", filterId: "status", filterValue: "In Flight" },
            { label: "Success", color: "#22c55e", filterId: "status", filterValue: "Success" },
            { label: "Failure", color: "#ef4444", filterId: "status", filterValue: "Failure" },
            { label: "Unknown", color: "#9ca3af" },
        ];
    }

    getDetailComponent(): ComponentType<{ entity: GeoEntity }> {
        return LaunchTrackerDetail;
    }
}

export default LaunchTrackerPlugin;
export { mapLaunchItemToEntity } from "./mapper";