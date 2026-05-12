import { WorldPlugin, PluginManifest, GeoEntity, CesiumEntityOptions, PluginContext, TimeRange, LayerConfig } from '@worldwideview/wwv-plugin-sdk';
import pkg from '../package.json';

export interface FortiGuardThreat {
  id: string;
  vuln_name: string;
  severity: string;
  src_lat: number;
  src_long: number;
  dest_lat: number;
  dest_long: number;
}

export const manifest: PluginManifest = {
  id: pkg.worldwideview.id,
  name: 'Cyber Threats (FortiGuard)',
  version: pkg.version,
  description: pkg.description,
  format: pkg.worldwideview.format as any,
  trust: 'verified',
  capabilities: pkg.worldwideview.capabilities as any,
  category: pkg.worldwideview.category as any,
  type: pkg.worldwideview.type as any
};

export class FortiGuardPlugin implements WorldPlugin {
  id = pkg.worldwideview.id;
  name = 'Cyber Threats (FortiGuard)';
  description = pkg.description;
  icon = 'ShieldAlert';
  category = 'cyber' as any;
  version = pkg.version;
  
  private context?: PluginContext;
  
  async initialize(context: PluginContext): Promise<void> {
    console.log('FortiGuard Plugin Initialized');
    this.context = context;
  }

  destroy(): void {
    this.context = undefined;
  }

  async fetch(timeRange: TimeRange): Promise<GeoEntity[]> {
    // Legacy HTTP fetch removed. Data is now pushed via WebSocket by the seeder.
    return [];
  }

  mapWebsocketPayload(payload: any): GeoEntity[] {
    if (!Array.isArray(payload)) return [];
    
    return payload.filter((t: any) => t.dest_lat && t.dest_long).map((threat: any) => ({
      id: `threat-${threat.id}-${Date.now()}`,
      pluginId: this.id,
      latitude: threat.dest_lat,
      longitude: threat.dest_long,
      timestamp: new Date(),
      properties: threat
    }));
  }

  getPollingInterval(): number {
    return 0; // WebSocket push only
  }

  getLayerConfig(): LayerConfig {
    return {
      color: '#ffaa00',
      clusterEnabled: true,
      clusterDistance: 50,
      maxEntities: 1000
    };
  }

  renderEntity(entity: GeoEntity): CesiumEntityOptions {
    const data = entity.properties as unknown as FortiGuardThreat;
    
    return {
      type: 'point',
      color: data.severity === 'Critical' ? '#ff0000' : '#ffaa00',
      size: 5,
      labelText: data.vuln_name
    };
  }
}

export default function createPlugin() {
    return new FortiGuardPlugin();
}

