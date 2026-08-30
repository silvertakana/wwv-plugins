// build-data.mjs – generate data.json for osm-rail-network plugin
// Filters Natural Earth railroads: keep only featurecla 'Railroad' and category == 1 (main lines)
// Rounds coordinates to 4 decimal places, flattens MultiLineString to LineString features.
// Output written to ../data/data.json

import fs from 'fs';
import path from 'path';

const srcPath = path.resolve('C:/dev/wwv/temp/batch-mass-2026-08-30/data/osm-rail-network/ne_10m_railroads.geojson');
const outPath = path.resolve('C:/dev/wwv/temp/batch-mass-2026-08-30/data/osm-rail-network/data/data.json');

function roundCoord(coord) {
  return [Math.round(coord[0] * 10000) / 10000, Math.round(coord[1] * 10000) / 10000];
}

function process() {
  const raw = fs.readFileSync(srcPath, 'utf8');
  const fc = JSON.parse(raw);
  let count = 0;
  const features = [];
  for (const f of fc.features) {
    if (f.properties?.featurecla !== 'Railroad') continue;
    const cat = Number(f.properties?.category);
    if (cat !== 1) continue; // keep only category 1 (main lines)
    if (f.geometry.type === 'LineString') {
      features.push({
        type: 'Feature',
        id: `osm-rail-network-${++count}`,
        geometry: { type: 'LineString', coordinates: f.geometry.coordinates.map(roundCoord) },
        properties: { featurecla: 'Railroad', name: f.properties?.name || null, category: cat }
      });
    } else if (f.geometry.type === 'MultiLineString') {
      for (const line of f.geometry.coordinates) {
        features.push({
          type: 'Feature',
          id: `osm-rail-network-${++count}`,
          geometry: { type: 'LineString', coordinates: line.map(roundCoord) },
          properties: { featurecla: 'Railroad', name: f.properties?.name || null, category: cat }
        });
      }
    }
  }
  const out = { type: 'FeatureCollection', features };
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log('Generated', features.length, 'features, size MB:', Buffer.byteLength(JSON.stringify(out)) / (1024*1024));
}

process();
