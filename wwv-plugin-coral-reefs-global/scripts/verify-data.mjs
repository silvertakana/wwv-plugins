// verify-data.mjs
// Fail‑closed validator for the coral‑reef GeoJSON bundle.
// Exits with code 0 on PASS, otherwise non‑zero.

import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.resolve(__dirname, '..', 'data', 'data.json');
const MAX_BYTES = 15 * 1024 * 1024; // 15 MiB

function exitFail(message, code = 1) {
  console.error('FAIL:', message);
  process.exit(code);
}

function validateFeature(feature, index) {
  if (!feature.geometry) exitFail(`Feature ${index} missing geometry`);
  const geomType = feature.geometry.type;
  if (geomType !== 'Polygon' && geomType !== 'MultiPolygon') {
    exitFail(`Feature ${index} geometry type ${geomType} not Polygon/MultiPolygon`);
  }
  const props = feature.properties || {};
  if (!props.name) exitFail(`Feature ${index} missing name`);
  if (typeof props.gis_area_k !== 'number' || isNaN(props.gis_area_k)) {
    exitFail(`Feature ${index} gis_area_k not numeric`);
  }
  // Optional family/genus/species are allowed.
}

function checkBounds(coord) {
  const [lon, lat] = coord;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    return false;
  }
  return true;
}

function validateCoordinates(geom) {
  const rings = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const ring of rings) {
    for (const coord of ring) {
      if (!checkBounds(coord)) return false;
    }
  }
  return true;
}

function main() {
  if (!fs.existsSync(DATA_PATH)) {
    exitFail(`Data file not found at ${DATA_PATH}`);
  }
  const stats = fs.statSync(DATA_PATH);
  if (stats.size > MAX_BYTES) {
    exitFail(`File size ${stats.size} exceeds ${MAX_BYTES} bytes`);
  }
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  let geojson;
  try {
    geojson = JSON.parse(raw);
  } catch (e) {
    exitFail('Invalid JSON');
  }
  if (geojson.type !== 'FeatureCollection') {
    exitFail('Root type is not FeatureCollection');
  }
  const features = geojson.features || [];
  if (features.length === 0) {
    exitFail('FeatureCollection has no features');
  }
  features.forEach((f, i) => {
    validateFeature(f, i);
    if (!validateCoordinates(f.geometry)) {
      exitFail(`Feature ${i} has out‑of‑bounds coordinates`);
    }
  });
  console.log('PASS: Validation succeeded');
  process.exit(0);
}

main();
