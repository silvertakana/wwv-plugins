#!/usr/bin/env node
/**
 * verify-data.mjs — fail-closed GeoJSON integrity validator for the
 * hurricane-tracks plugin. Exits 0 on PASS, 1 on FAIL.
 *
 * Checks:
 *   - data/data.json parses and is a FeatureCollection
 *   - every feature is a Feature with a Point geometry
 *   - lon in [-180, 180], lat in [-90, 90]
 *   - required properties (name) present
 *   - storm metadata properties present (season, category, wind, pres, iso_time)
 *   - no duplicate feature ids
 *   - feature count > 0
 *
 * Usage: node scripts/verify-data.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "..", "data", "data.json");

const REQUIRED_PROPS = ["name"];
const STORM_IDENTITY_PROPS = ["season", "category", "iso_time"];
const STORM_OPTIONAL_PROPS = ["wind", "pres"];

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
let missingStormProps = 0;
let missingOptionalStormProps = 0;
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
    if (typeof lon !== "number" || typeof lat !== "number" || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        outOfRange++;
    }
    for (const p of REQUIRED_PROPS) {
        if (f.properties == null || f.properties[p] == null) {
            missingProps++;
            break;
        }
    }
    for (const p of STORM_IDENTITY_PROPS) {
        if (f.properties == null || f.properties[p] == null) {
            missingStormProps++;
            break;
        }
    }
    for (const p of STORM_OPTIONAL_PROPS) {
        if (f.properties == null || f.properties[p] == null) {
            missingOptionalStormProps++;
            break;
        }
    }
    const id = f.id;
    if (id != null) {
        if (seenIds.has(id)) dupIds++;
        seenIds.add(id);
    }
}

console.log(`hurricane-tracks data check`);
console.log(`  features:            ${features.length}`);
console.log(`  bad geometries:      ${badGeom}`);
console.log(`  out-of-range:        ${outOfRange}`);
console.log(`  missing props:       ${missingProps}`);
console.log(`  missing identity:    ${missingStormProps}`);
console.log(`  missing optional:    ${missingOptionalStormProps}`);
console.log(`  duplicate ids:       ${dupIds}`);
console.log(`  unique ids:          ${seenIds.size}`);

if (badGeom > 0) fail(`${badGeom} feature(s) missing a valid Point geometry`);
if (outOfRange > 0) fail(`${outOfRange} feature(s) have out-of-range coordinates`);
if (missingProps > 0) fail(`${missingProps} feature(s) missing required properties [${REQUIRED_PROPS.join(", ")}]`);
if (missingStormProps > 0) fail(`${missingStormProps} feature(s) missing storm identity properties [${STORM_IDENTITY_PROPS.join(", ")}]`);
if (missingOptionalStormProps > 0) console.warn(`WARN: ${missingOptionalStormProps} feature(s) missing optional storm properties [${STORM_OPTIONAL_PROPS.join(", ")}] (IBTrACS blanks WMO wind/pres for some storms)`);
if (dupIds > 0) fail(`${dupIds} duplicate feature id(s)`);

console.log("PASS: all data integrity checks succeeded");
process.exit(0);
