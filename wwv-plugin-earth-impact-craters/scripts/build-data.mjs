import { readFileSync, writeFileSync } from 'fs';
const rawPath = 'C:/dev/wwv/temp/batch-mass-2026-08-30/data/earth-impact-craters/earth-impact-craters.geojson';
const outPath = 'C:/dev/wwv/temp/batch-mass-2026-08-30/data/earth-impact-craters/data/data.json';
const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
const features = raw.features.filter(f => {
  const name = f.properties?.crater_name?.trim();
  return name && name.length > 0;
}).map((f, idx) => {
  const p = f.properties;
  return {
    type: 'Feature',
    id: `earth-impact-craters-${idx + 1}`,
    geometry: f.geometry,
    properties: {
      name: p.crater_name,
      country: p.country,
      diameter: typeof p.diameter_km === 'number' ? p.diameter_km : parseFloat(p.diameter_km),
      age: p.age_millions_years_ago
    }
  };
});
const out = { type: 'FeatureCollection', features };
writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log('Built data.json with', features.length, 'features');
