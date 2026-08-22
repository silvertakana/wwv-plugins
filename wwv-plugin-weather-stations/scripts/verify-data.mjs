// verify-data.mjs - fail-closed validator for the weather-stations baked snapshot.
// Usage: node scripts/verify-data.mjs   (from the plugin root)
// Exits 0 on PASS, 1 on FAIL. Every check must hold; any malformed record fails the run.
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "data", "data.json");

const MAX_KB = 15360; // owner-approved bundle ceiling for this plugin (15 MB)

const errors = [];
const fail = (msg) => {
  errors.push(msg);
};

let fc = null;
try {
  fc = JSON.parse(readFileSync(DATA, "utf8"));
} catch (e) {
  fail(`data.json is not valid JSON: ${e.message}`);
}
if (!fc) {
  fail("data.json failed to parse");
} else {
  if (fc.type !== "FeatureCollection") fail(`top-level "type" must be "FeatureCollection", got ${JSON.stringify(fc.type)}`);
  if (!Array.isArray(fc.features)) fail('"features" must be an array');
}

const features = fc && Array.isArray(fc.features) ? fc.features : [];

if (features.length === 0) fail("feature count must be > 0");

const seenIds = new Set();
const seenStationIds = new Set();
for (let i = 0; i < features.length; i++) {
  const f = features[i];
  const at = `feature[${i}]`;
  if (!f || typeof f !== "object") { fail(`${at}: not an object`); continue; }
  if (f.type !== "Feature") fail(`${at}: type must be "Feature"`);

  const g = f.geometry;
  if (!g || g.type !== "Point") {
    fail(`${at}: geometry must be a Point`);
  } else if (!Array.isArray(g.coordinates) || g.coordinates.length < 2) {
    fail(`${at}: Point coordinates must have [lon, lat]`);
  } else {
    const [lon, lat] = g.coordinates;
    if (typeof lon !== "number" || !Number.isFinite(lon)) fail(`${at}: lon must be a finite number`);
    if (typeof lat !== "number" || !Number.isFinite(lat)) fail(`${at}: lat must be a finite number`);
    if (typeof lon === "number" && (lon < -180 || lon > 180)) fail(`${at}: lon ${lon} out of [-180, 180]`);
    if (typeof lat === "number" && (lat < -90 || lat > 90)) fail(`${at}: lat ${lat} out of [-90, 90]`);
  }

  const p = f.properties;
  if (!p || typeof p !== "object") { fail(`${at}: properties must be an object`); continue; }
  if (typeof p.name !== "string" || p.name.trim().length === 0) fail(`${at}: properties.name must be a non-empty string`);

  if (f.id !== undefined) {
    if (typeof f.id !== "string" || f.id.length === 0) fail(`${at}: feature id must be a non-empty string`);
    else if (seenIds.has(f.id)) fail(`${at}: duplicate feature id ${f.id}`);
    else seenIds.add(f.id);
  }
  if (p.station_id !== undefined) {
    if (typeof p.station_id !== "string" || p.station_id.length === 0) fail(`${at}: properties.station_id must be a non-empty string`);
    else if (seenStationIds.has(p.station_id)) fail(`${at}: duplicate station_id ${p.station_id}`);
    else seenStationIds.add(p.station_id);
  }
}

const sizeBytes = statSync(DATA).size;
const sizeKB = sizeBytes / 1024;
if (sizeKB >= MAX_KB) fail(`data.json is ${sizeKB.toFixed(1)} KB, must be < ${MAX_KB} KB`);

if (errors.length > 0) {
  console.error(`FAIL: ${errors.length} check(s) failed`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error("FAIL");
  process.exit(1);
}

console.log(`OK: ${features.length} features, ${sizeKB.toFixed(1)} KB, all checks passed`);
console.log("PASS");
process.exit(0);
