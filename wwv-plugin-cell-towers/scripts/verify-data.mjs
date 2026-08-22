#!/usr/bin/env node
/**
 * verify-data.mjs — fail-closed GeoJSON integrity validator for the
 * cell-towers plugin. Exits 0 on PASS, 1 on FAIL.
 *
 * Checks:
 *   - data/data.json exists, is valid UTF-8, contains no NaN/Infinity tokens
 *   - parses as JSON and is a FeatureCollection with a features array
 *   - feature count > 0
 *   - every feature is a Feature with a Point geometry
 *   - lon in [-180, 180], lat in [-90, 90], both finite numbers
 *   - required properties (name) present
 *   - no duplicate feature ids (feature.id or properties.id)
 *   - total file size < 15360 KB (owner-approved higher bundle limit)
 *
 * Usage: node scripts/verify-data.mjs
 */
import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "..", "data", "data.json");

const REQUIRED_PROPS = ["name"];
const SIZE_LIMIT_KB = 15360; // 15 MB owner-approved bundle limit

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

// UTF-8 sanity: re-encoding to utf8 must be lossless and must not contain the
// replacement char (would indicate invalid sequences were silently swapped in).
if (Buffer.from(raw, "utf8").toString("utf8") !== raw) {
    fail("data.json is not valid UTF-8");
}
if (raw.includes("\uFFFD")) {
    fail("data.json contains UTF-8 replacement characters (U+FFFD)");
}

// Fail-closed token scan: JSON.parse would accept 1e999 -> Infinity, and NaN is
// not valid JSON but must never sneak in through a loose serializer.
if (/\bNaN\b|\bInfinity\b|-?Infinity\b/.test(raw)) {
    fail("data.json contains NaN or Infinity tokens");
}

let sizeKB;
try {
    sizeKB = statSync(dataPath).size / 1024;
} catch (e) {
    fail(`cannot stat ${dataPath}: ${e.message}`);
}
if (sizeKB >= SIZE_LIMIT_KB) {
    fail(`data.json is ${sizeKB.toFixed(1)} KB, exceeds limit of ${SIZE_LIMIT_KB} KB`);
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
let badGeom = 0;
let outOfRange = 0;
let missingProps = 0;
let dupIds = 0;

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
    if (
        typeof lon !== "number" || typeof lat !== "number" ||
        !Number.isFinite(lon) || !Number.isFinite(lat) ||
        lon < -180 || lon > 180 || lat < -90 || lat > 90
    ) {
        outOfRange++;
    }
    for (const p of REQUIRED_PROPS) {
        if (f.properties == null || f.properties[p] == null || f.properties[p] === "") {
            missingProps++;
            break;
        }
    }
    const id = f.id != null ? f.id : (f.properties && f.properties.id);
    if (id != null) {
        if (seenIds.has(id)) dupIds++;
        seenIds.add(id);
    }
}

console.log(`cell-towers data check`);
console.log(`  features:        ${features.length}`);
console.log(`  bad geometries:  ${badGeom}`);
console.log(`  out-of-range:    ${outOfRange}`);
console.log(`  missing props:   ${missingProps}`);
console.log(`  duplicate ids:   ${dupIds}`);
console.log(`  unique ids:      ${seenIds.size}`);
console.log(`  file size:       ${sizeKB.toFixed(1)} KB (limit ${SIZE_LIMIT_KB} KB)`);

if (badGeom > 0) fail(`${badGeom} feature(s) missing a valid Point geometry`);
if (outOfRange > 0) fail(`${outOfRange} feature(s) have out-of-range coordinates`);
if (missingProps > 0) fail(`${missingProps} feature(s) missing required properties [${REQUIRED_PROPS.join(", ")}]`);
if (dupIds > 0) fail(`${dupIds} duplicate feature id(s)`);

console.log("PASS: all data integrity checks succeeded");
process.exit(0);
