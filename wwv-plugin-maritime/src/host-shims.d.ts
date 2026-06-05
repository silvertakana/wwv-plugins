/**
 * Ambient type declarations for host-internal modules imported by settings
 * components. These components run inside the host app bundle at runtime; the shims
 * let CI type-check them in isolation without accessing host source code.
 */

declare module "@/core/state/store" {
  interface PluginSettingsSlice {
    dataConfig: {
      pluginSettings: Record<string, Record<string, unknown>>;
    };
    updatePluginSettings: (pluginId: string, patch: Record<string, unknown>) => void;
  }
  export function useStore<T>(selector: (state: PluginSettingsSlice) => T): T;
}

declare module "@/core/plugins/PluginManager" {
  import type { TimeRange } from "@worldwideview/wwv-plugin-sdk";
  interface ManagedPlugin {
    enabled: boolean;
    context: { timeRange: TimeRange };
  }
  export const pluginManager: {
    getPlugin: (pluginId: string) => ManagedPlugin | undefined;
    fetchForPlugin: (pluginId: string, timeRange: TimeRange) => Promise<void>;
  };
}
