// verify-data.mjs – fail-closed validator for osm-rail-network data.json
// Checks:
// - Valid FeatureCollection
// - All features have geometry type LineString
// - Feature count > 0
// - All coordinates valid [lon, lat] within bounds (-180..180, -90..90), no 3D z element
// - File size <= 15 MB (15,728,640 bytes)
// - No duplicate feature ids

import fs from 'fs';
import path from 'path';

const dataPath = path.resolve('C:/dev/wwv/temp/batch-mass-2026-08-30/data/osm-rail-network/data/data.json');

function verify() {
  if (!fs.existsSync(dataPath)) {
    console.error('FAIL: data.json does not exist at', dataPath);
    process.exit(1);
  }

  const stats = fs.statSync(dataPath);
  const sizeMB = stats.size / (1024 * 1024);
  console.log(`File size: ${stats.size} bytes (${sizeMB.toFixed(2)} MB)`);

  if (stats.size > 15 * 1024 * 1024) {
    console.error(`FAIL: data.json size (${sizeMB.toFixed(2)} MB) exceeds 15 MB limit`);
    process.exit(1);
  }

  let fc;
  try {
    fc = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (err) {
    console.error('FAIL: data.json is not valid JSON:', err.message);
    process.exit(1);
  }

  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    console.error('FAIL: Top-level object must be a FeatureCollection');
    process.exit(1);
  }

  if (fc.features.length === 0) {
    console.error('FAIL: FeatureCollection is empty');
    process.exit(1);
  }

  console.log(`Feature count: ${fc.features.length}`);

  const ids = new Set();
  let featureIndex = 0;

  for (const f of fc.features) {
    featureIndex++;
    if (f.type !== 'Feature') {
      console.error(`FAIL: Item at index ${featureIndex} is not a Feature`);
      process.exit(1);
    }

    if (!f.id) {
      console.error(`FAIL: Feature at index ${featureIndex} missing id`);
      process.exit(1);
    }

    if (ids.has(f.id)) {
      console.error(`FAIL: Duplicate feature id found: ${f.id}`);
      process.exit(1);
    }
    ids.add(f.id);

    if (!f.geometry || f.geometry.type !== 'LineString') {
      console.error(`FAIL: Feature ${f.id} geometry must be LineString, got ${f.geometry?.type}`);
      process.exit(1);
    }

    const coords = f.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      console.error(`FAIL: Feature ${f.id} has invalid LineString coordinates array`);
      process.exit(1);
    }

    for (let i = 0; i < coords.length; i++) {
      const pt = coords[i];
      if (!Array.isArray(pt) || pt.length !== 2) {
        console.error(`FAIL: Feature ${f.id} coordinate ${i} is not 2D [lon, lat]: ${JSON.stringify(pt)}`);
        process.exit(1);
      }
      const [lon, lat] = pt;
      if (typeof lon !== 'number' || typeof lat !== 'number' || isNaN(lon) || isNaN(lat)) {
        console.error(`FAIL: Feature ${f.id} coordinate ${i} has non-numeric value: ${JSON.stringify(pt)}`);
        process.exit(1);
      }
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        console.error(`FAIL: Feature ${f.id} coordinate ${i} out of bounds: [${lon}, ${lat}]`);
        process.exit(1);
      }
    }
  }

  console.log('PASS: All validation checks passed successfully.');
}

verify();
