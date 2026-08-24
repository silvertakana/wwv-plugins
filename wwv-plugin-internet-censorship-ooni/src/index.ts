import { ShieldOff } from "lucide-react";
import {
    dtProp,
    urlProp,
    type WorldPlugin,
    type GeoEntity,
    type TimeRange,
    type PluginContext,
    type LayerConfig,
    type CesiumEntityOptions,
    type FilterDefinition,
    type ServerPluginConfig,
} from "@worldwideview/wwv-plugin-sdk";
import pkg from "../package.json";

/** Raw shape of one OONI measurement from the data engine. */
interface OoniMeasurement {
    id: string;
    lat: number | null;
    lon: number | null;
    probeCc: string | null;
    probeAsn: string | null;
    testName: string | null;
    input: string | null;
    anomaly: boolean | null;
    confirmed: boolean | null;
    blockingGeneral: number | null;
    measuredAt: string | null;
}

type CensorshipStatus = "blocked" | "anomaly" | "accessible";

/** Confirmed measurements are blocked; anomalies (or a blockingGeneral=1 signal) are suspicious; the rest are accessible. */
function resolveStatus(measurement: OoniMeasurement): CensorshipStatus {
    if (measurement.confirmed === true) return "blocked";
    if (measurement.anomaly === true || measurement.blockingGeneral === 1) return "anomaly";
    return "accessible";
}

const STATUS_COLOR: Record<CensorshipStatus, string> = {
    blocked: "#dc2626",
    anomaly: "#f59e0b",
    accessible: "#22c55e",
};

const STATUS_SIZE: Record<CensorshipStatus, number> = {
    blocked: 11,
    anomaly: 9,
    accessible: 6,
};

export class InternetCensorshipOoniPlugin implements WorldPlugin {
    id = "internet-censorship-ooni";
    name = "Internet Censorship (OONI)";
    description = "Internet censorship measurements from OONI";
    icon = ShieldOff;
    category = "cyber" as const;
    version = pkg.version;

    private context: PluginContext | null = null;

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/internet-censorship-ooni`);
            if (!res.ok) throw new Error(`OONI API returned ${res.status}`);
            const data = await res.json();
            if (!Array.isArray(data.items)) return [];

            return data.items
                .map((item: OoniMeasurement): GeoEntity | null => {
                    const lat = Number(item.lat);
                    const lon = Number(item.lon);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                    const status = resolveStatus(item);
                    const testName = item.testName || "unknown";
                    return {
                        id: item.id,
                        pluginId: this.id,
                        latitude: lat,
                        longitude: lon,
                        timestamp: item.measuredAt ? new Date(item.measuredAt) : new Date(),
                        label: `${item.probeCc || "?"} ${item.probeAsn || ""}: ${testName}`,
                        properties: {
                            status,
                            probeCc: item.probeCc,
                            probeAsn: item.probeAsn,
                            testName,
                            input: urlProp(item.input ?? null),
                            anomaly: item.anomaly ?? null,
                            confirmed: item.confirmed ?? null,
                            blockingGeneral: item.blockingGeneral ?? null,
                            measuredAt: dtProp(item.measuredAt ?? null),
                        },
                    };
                })
                .filter((entity: GeoEntity | null): entity is GeoEntity => entity !== null);
        } catch (err) {
            console.error("[InternetCensorshipOoniPlugin] Fetch error:", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return {
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/internet-censorship-ooni",
            pollingIntervalMs: 0,
            historyEnabled: true,
        };
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#dc2626",
            clusterEnabled: true,
            clusterDistance: 30,
            maxEntities: 500,
        };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const status = (entity.properties.status as CensorshipStatus) || "accessible";
        return {
            type: "point",
            color: STATUS_COLOR[status],
            size: STATUS_SIZE[status],
            outlineColor: "#111827",
            outlineWidth: 1,
            labelText: entity.label,
        };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "status", label: "State", type: "select",
                propertyKey: "status",
                options: [
                    { value: "blocked", label: "Blocked (confirmed)" },
                    { value: "anomaly", label: "Anomaly" },
                    { value: "accessible", label: "Accessible" },
                ],
            },
            {
                id: "testName", label: "Test Name", type: "select",
                propertyKey: "testName",
                options: [
                    { value: "web_connectivity", label: "Web Connectivity" },
                    { value: "http_invalid_request_line", label: "HTTP Invalid Request Line" },
                    { value: "http_header_field_manipulation", label: "HTTP Header Field Manipulation" },
                    { value: "ndt", label: "NDT" },
                    { value: "dnscheck", label: "DNS Check" },
                    { value: "telegram", label: "Telegram" },
                ],
            },
            { id: "probeCc", label: "Probe Country Code", type: "text", propertyKey: "probeCc" },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Blocked (confirmed)", color: "#dc2626", filterId: "status", filterValue: "blocked" },
            { label: "Anomaly", color: "#f59e0b", filterId: "status", filterValue: "anomaly" },
            { label: "Accessible", color: "#22c55e", filterId: "status", filterValue: "accessible" },
        ];
    }
}