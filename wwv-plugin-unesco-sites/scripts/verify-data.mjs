#!/usr/bin/env node
/**
 * verify-data.mjs — fail-closed GeoJSON integrity validator for the
 * unesco-sites plugin. Exits 0 on PASS, 1 on FAIL.
 *
 * Checks:
 *   - data/data.json parses and is a FeatureCollection
 *   - every feature is a Feature with a Point geometry
 *   - lon in [-180, 180], lat in [-90, 90]
 *   - required properties (name, id) present
 *   - no duplicate feature ids and no duplicate property ids
 *   - feature count > 0
 *   - total file size < 10240 KB
 *
 * Usage: node scripts/verify-data.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "..", "data", "data.json");
const MAX_BYTES = 10240 * 1024; // 10 MB

const REQUIRED_PROPS = ["name", "id"];

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
}

let buf;
try {
    buf = readFileSync(dataPath);
} catch (e) {
    fail(`cannot read ${dataPath}: ${e.message}`);
}

if (buf.byteLength >= MAX_BYTES) {
    fail(`data.json is ${(buf.byteLength / 1024).toFixed(1)} KB, >= 10240 KB limit`);
}

let data;
try {
    data = JSON.parse(buf.toString("utf8"));
} catch (e) {
    fail(`data.json is not valid JSON: ${e.message}`);
}

if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    fail("top-level object must be a FeatureCollection with a features array");
}

const features = data.features;
if (features.length === 0) fail("FeatureCollection is empty");

const seenFeatureIds = new Set();
const seenPropIds = new Set();
let badGeom = 0;
let outOfRange = 0;
let missingProps = 0;
let dupFeatureIds = 0;
let dupPropIds = 0;

for (const f of features) {
    if (!f || f.type !== "Feature" || !f.geometry) {
        badGeom++;
        continue;
    }
    const g = f.geometry;
    if (g.type !== "Point" || !Array.isArray(g.coordinates) || g.coordinates.length < 2) {
        badGeom++;
        continue;
    }
    const lon = g.coordinates[0];
    const lat = g.coordinates[1];
    if (typeof lon !== "number" || typeof lat !== "number" || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        outOfRange++;
    }
    for (const p of REQUIRED_PROPS) {
        if (f.properties == null || f.properties[p] == null) {
            missingProps++;
            break;
        }
    }
    const id = f.id;
    if (id != null) {
        if (seenFeatureIds.has(id)) dupFeatureIds++;
        seenFeatureIds.add(id);
    }
    const pid = f.properties && f.properties.id;
    if (pid != null) {
        if (seenPropIds.has(pid)) dupPropIds++;
        seenPropIds.add(pid);
    }
}

console.log(`unesco-sites data check`);
console.log(`  file size:       ${(buf.byteLength / 1024).toFixed(1)} KB`);
console.log(`  features:        ${features.length}`);
console.log(`  bad geometries:  ${badGeom}`);
console.log(`  out-of-range:    ${outOfRange}`);
console.log(`  missing props:   ${missingProps}`);
console.log(`  duplicate ids:   ${dupFeatureIds} (feature), ${dupPropIds} (property)`);
console.log(`  unique ids:      ${seenFeatureIds.size} (feature), ${seenPropIds.size} (property)`);

if (badGeom > 0) fail(`${badGeom} feature(s) missing a valid Point geometry`);
if (outOfRange > 0) fail(`${outOfRange} feature(s) have out-of-range coordinates`);
if (missingProps > 0) fail(`${missingProps} feature(s) missing required properties [${REQUIRED_PROPS.join(", ")}]`);
if (dupFeatureIds > 0) fail(`${dupFeatureIds} duplicate feature id(s)`);
if (dupPropIds > 0) fail(`${dupPropIds} duplicate property id(s)`);

console.log("PASS: all data integrity checks succeeded");
process.exit(0);
