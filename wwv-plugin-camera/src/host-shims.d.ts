/**
 * Ambient type declarations for host-internal modules imported by settings/detail
 * components. These components run inside the host app bundle at runtime; the shims
 * let CI type-check them in isolation without accessing host source code.
 */

declare module "@/core/state/store" {
  interface PluginSettingsSlice {
    dataConfig: {
      pluginSettings: Record<string, Record<string, unknown>>;
    };
    updatePluginSettings: (pluginId: string, patch: Record<string, unknown>) => void;
    setHighlightLayerId: (id: string | null) => void;
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

declare module "@/components/video/CameraStream" {
  import type React from "react";
  interface CameraStreamProps {
    id: string;
    streamUrl?: string;
    previewUrl?: string;
    isIframe?: boolean;
    label?: string;
  }
  export const CameraStream: React.FC<CameraStreamProps>;
}
