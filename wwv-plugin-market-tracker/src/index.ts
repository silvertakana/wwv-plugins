import type {
  WorldPlugin,
  PluginContext,
  GeoEntity,
  CesiumEntityOptions,
  TimeRange,
  LayerConfig,
  PluginCategory
} from "@worldwideview/wwv-plugin-sdk";
import { LineChart } from "lucide-react";
import pkg from "../package.json";
import { useMarketStore } from "./store/marketStore";
import MarketDashboard from "./components/MarketDashboard";

export default class MarketTrackerPlugin implements WorldPlugin {
  id = "market-tracker";
  name = "Market Tracker";
  description = "Real-time stock and market index tracker with draggable grid";
  icon = LineChart;
  category: PluginCategory = "economic";
  version = pkg.version;

  async initialize(_ctx: PluginContext): Promise<void> {
    // no-op
  }

  destroy(): void {
    // no-op
  }

  async fetch(timeRange: TimeRange): Promise<GeoEntity[]> {
    return []; // WS-only plugin
  }

  getPollingInterval(): number {
    return 0; // WS-only
  }

  getLayerConfig(): LayerConfig {
    return {
      color: "#10b981", // Emerald
      clusterEnabled: false,
      maxEntities: 0,
    };
  }

  renderEntity(entity: GeoEntity): CesiumEntityOptions {
    return {
      type: "point",
      color: "#10b981",
      size: 1,
      outlineColor: "#ffffff",
      outlineWidth: 0,
    };
  }

  // Intercept WebSocket payloads directly and push them into our localized Zustand store
  mapWebsocketPayload(payload: any, existing: GeoEntity[]): GeoEntity[] {
    if (payload && payload.items) {
      useMarketStore.getState().updatePrices(payload.items);
    }
    return []; // We don't render entities on the globe for this plugin
  }

  getBottomPanelComponent() {
    return MarketDashboard;
  }
}
