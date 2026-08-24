#!/usr/bin/env node
/**
 * verify-data.mjs — fail-closed GeoJSON integrity validator for the
 * eez-boundaries plugin. Exits 0 on PASS, 1 on FAIL.
 *
 * Checks:
 *   - data/data.json parses and is a FeatureCollection
 *   - every feature is a Feature with a Point geometry
 *   - lon in [-180, 180], lat in [-90, 90]
 *   - required properties (name, id) present
 *   - no duplicate feature ids (feature-level and property-level)
 *   - feature count > 0
 *   - total file size < 10240 KB (10 MB baked-bundle cap)
 *
 * Usage: node scripts/verify-data.mjs
 */
import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "..", "data", "data.json");

const REQUIRED_PROPS = ["name", "id"];
const SIZE_LIMIT_KB = 10240; // 10 MB baked-bundle cap

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
}

let raw;
try {
    raw = readFileSync(dataPath, "utf8");
} catch (e) {
    fail(`cannot read ${dataPath}: ${e.message}`);
}

const sizeBytes = statSync(dataPath).size;
const sizeKB = sizeBytes / 1024;
if (sizeKB >= SIZE_LIMIT_KB) {
    fail(`data.json is ${sizeKB.toFixed(1)} KB, must be < ${SIZE_LIMIT_KB} KB`);
}

let data;
try {
    data = JSON.parse(raw);
} catch (e) {
    fail(`data.json is not valid JSON: ${e.message}`);
}

if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    fail("top-level object must be a FeatureCollection with a features array");
}

const features = data.features;
if (features.length === 0) fail("FeatureCollection is empty");

const seenIds = new Set();
const seenPropIds = new Set();
let badGeom = 0;
let outOfRange = 0;
let missingProps = 0;
let dupIds = 0;
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
        if (f.properties == null || f.properties[p] == null || String(f.properties[p]).trim() === "") {
            missingProps++;
            break;
        }
    }
    const id = f.id;
    if (id != null) {
        if (seenIds.has(id)) dupIds++;
        seenIds.add(id);
    }
    const propId = f.properties && f.properties.id;
    if (propId != null) {
        if (seenPropIds.has(propId)) dupPropIds++;
        seenPropIds.add(propId);
    }
}

console.log(`eez-boundaries data check`);
console.log(`  features:        ${features.length}`);
console.log(`  bad geometries:  ${badGeom}`);
console.log(`  out-of-range:    ${outOfRange}`);
console.log(`  missing props:   ${missingProps}`);
console.log(`  duplicate ids:   ${dupIds}`);
console.log(`  duplicate prop ids: ${dupPropIds}`);
console.log(`  unique ids:      ${seenIds.size}`);
console.log(`  file size:       ${sizeKB.toFixed(1)} KB (limit ${SIZE_LIMIT_KB} KB)`);

if (badGeom > 0) fail(`${badGeom} feature(s) missing a valid Point geometry`);
if (outOfRange > 0) fail(`${outOfRange} feature(s) have out-of-range coordinates`);
if (missingProps > 0) fail(`${missingProps} feature(s) missing required properties [${REQUIRED_PROPS.join(", ")}]`);
if (dupIds > 0) fail(`${dupIds} duplicate feature id(s)`);
if (dupPropIds > 0) fail(`${dupPropIds} duplicate property id(s)`);

console.log("PASS: all data integrity checks succeeded");
process.exit(0);