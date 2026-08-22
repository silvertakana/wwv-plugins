#!/usr/bin/env node
// verify-data.mjs - fail-closed verifier for the oil-gas-pipelines static bundle.
// PASS conditions (all must hold, otherwise exit 1):
//   - data file exists and parses as JSON
//   - root is a GeoJSON FeatureCollection
//   - every feature is { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] } }
//   - lon in [-180,180], lat in [-90,90], coordinates are finite numbers (no NaN)
//   - every feature has a non-empty string "name" property
//   - feature "id" property present and unique across the collection
//   - at least one feature
//   - data file size < 10240 KB (10 MB)
// Any parsing error, missing file, or unmet condition -> exit 1 (fail closed).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = process.argv[2] || path.resolve(__dirname, '..', 'data', 'data.json');
const MAX_BYTES = 10240 * 1024; // 10 MB

const failures = [];
const pass = (msg) => console.log(`  PASS ${msg}`);
const fail = (msg) => failures.push(msg);

function check(cond, msg) {
  if (cond) pass(msg);
  else fail(msg);
}

console.log(`Verifying ${DATA_PATH}`);

// 1. file exists + size cap
if (!fs.existsSync(DATA_PATH)) {
  fail(`data file does not exist: ${DATA_PATH}`);
  console.error('FAIL');
  process.exit(1);
}
const size = fs.statSync(DATA_PATH).size;
check(size < MAX_BYTES, `file size ${(size / 1024).toFixed(1)} KB < 10240 KB`);

// 2. parses as JSON
let root;
try {
  root = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  pass('data parses as JSON');
} catch (e) {
  fail(`data is not valid JSON: ${e.message}`);
}

if (failures.length > 0) {
  console.error(failures.map((f) => `FAIL ${f}`).join('\n'));
  console.error('FAIL');
  process.exit(1);
}

// 3. FeatureCollection shape
check(root && typeof root === 'object' && !Array.isArray(root), 'root is an object');
check(root.type === 'FeatureCollection', 'root.type === "FeatureCollection"');
check(Array.isArray(root.features), 'root.features is an array');
const feats = root.features || [];
check(feats.length > 0, `feature count ${feats.length} > 0`);

// 4. per-feature shape
const ids = new Set();
let geomOk = true;
let boundsOk = true;
let nameOk = true;
let idOk = true;

for (const f of feats) {
  if (!f || typeof f !== 'object' || f.type !== 'Feature' || !f.geometry) { geomOk = false; continue; }
  if (f.geometry.type !== 'Point') geomOk = false;

  const c = f.geometry.coordinates;
  if (!Array.isArray(c) || c.length < 2) { boundsOk = false; continue; }
  const lon = c[0];
  const lat = c[1];
  if (typeof lon !== 'number' || typeof lat !== 'number' || Number.isNaN(lon) || Number.isNaN(lat)) boundsOk = false;
  else if (lon < -180 || lon > 180 || lat < -90 || lat > 90) boundsOk = false;

  if (!f.properties || typeof f.properties.name !== 'string' || f.properties.name.trim() === '') nameOk = false;

  const id = f.properties && f.properties.id;
  if (typeof id !== 'string' || id.trim() === '') { idOk = false; }
  else if (ids.has(id)) { idOk = false; }
  else ids.add(id);
}

check(geomOk, 'every feature has Point geometry');
check(boundsOk, 'all coordinates in bounds (lon [-180,180], lat [-90,90]), finite, no NaN');
check(nameOk, 'every feature has a non-empty string "name"');
check(idOk, `feature ids present and unique (${ids.size} unique)`);

// 5. no NaN/trailing-comma artifacts can survive JSON.parse, but check no literal "NaN" leaked as text
check(!/NaN|Infinity/.test(fs.readFileSync(DATA_PATH, 'utf8')), 'no NaN/Infinity tokens in file');

if (failures.length > 0) {
  console.error(failures.map((f) => `FAIL ${f}`).join('\n'));
  console.error('FAIL');
  process.exit(1);
}

console.log('PASS');
process.exit(0);
