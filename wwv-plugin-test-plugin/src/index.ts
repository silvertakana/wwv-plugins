import { WorldPlugin, GeoEntity, CesiumEntityOptions, SelectionBehavior, PluginCategory, LayerConfig, TimeRange } from '@worldwideview/wwv-plugin-sdk';

export default class ISSPlugin implements WorldPlugin {
  id = 'test-plugin';
  name = 'ISS Tracker test';
  description = 'Tracks the International Space Station in real time on the 3D globe.';
  icon = 'Satellite';
  category: PluginCategory = 'space';
  version = '1.0.0';

  async initialize(): Promise<void> {}
  
  getPollingInterval(): number { return 5000; }
  async fetch(timeRange: TimeRange): Promise<GeoEntity[]> {
    const res = await globalThis.fetch('https://api.wheretheiss.at/v1/satellites/25544');
    const data = await res.json();
    return [{
      id: 'iss',
      pluginId: this.id,
      latitude: data.latitude,
      longitude: data.longitude,
      altitude: data.altitude * 1000,
      speed: data.velocity / 3.6,
      timestamp: new Date(),
      properties: data
    }];
  }

  getLayerConfig(): LayerConfig {
    return { color: '#00ffcc', clusterEnabled: false, clusterDistance: 0 };
  }

  destroy(): void {}

  // padding
  // padding
  // padding
  // padding
  // padding
  
  mapWebsocketPayload(payload: any): GeoEntity[] {
    if (!payload) return [];
    const items = Array.isArray(payload) ? payload : [payload];
    return items.filter(i => i && i.latitude && i.longitude).map(item => ({
      id: item.id || 'iss',
      pluginId: this.id,
      latitude: item.latitude,
      longitude: item.longitude,
      altitude: (item.altitude || 0) * 1000,
      speed: (item.velocity || 0) / 3.6,
      timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
      properties: item
    }));
  }

  // padding
  // padding
  // padding
  // padding
  // padding
  // padding
  
  renderEntity(entity: GeoEntity): CesiumEntityOptions {
    return {
      type: 'billboard',
      iconUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="#00ffcc" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 19H7v-4h2v4zm0-6H7V9h2v4zm0-6H7V5h2v4zm8 12h-2v-4h2v4zm0-6h-2V9h2v4zm0-6h-2V5h2v4z"/></svg>`),
      color: '#00ffcc',
      iconScale: 1.0,
      disableClustering: true
    };
  }

  // padding
  // padding
  // padding
  // padding
  // padding
  // padding
  // padding
  // padding
  // padding
  // padding
  // padding
  // padding
  
  getSelectionBehavior(entity: GeoEntity): SelectionBehavior {
    return {
      showTrail: true,
      trailDurationSec: 5400,
      trailStepSec: 30,
      trailColor: '#00ffcc',
      flyToBaseDistance: 2000000
    };
  }
}
