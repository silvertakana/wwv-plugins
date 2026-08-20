// Fail-closed GeoJSON validator for the dams plugin data schema.
// Checks: parses as JSON, is a FeatureCollection, every feature has a Point
// geometry, lon in [-180,180], lat in [-90,90], required properties present,
// and no duplicate ids. Exit 0 on pass / 1 on fail.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(__dirname, "../data/data.json");

const errors = [];
let raw;
try {
    raw = fs.readFileSync(dataPath, "utf8");
} catch (e) {
    console.error(`FAIL: cannot read data file at ${dataPath}`);
    process.exit(1);
}

let root;
try {
    root = JSON.parse(raw);
} catch (e) {
    console.error(`FAIL: data.json is not valid JSON: ${e.message}`);
    process.exit(1);
}

if (!root || root.type !== "FeatureCollection") {
    console.error(`FAIL: expected a FeatureCollection, got type=${root && root.type}`);
    process.exit(1);
}

if (!Array.isArray(root.features)) {
    console.error("FAIL: FeatureCollection has no features array");
    process.exit(1);
}

const ids = new Set();
let featureCount = 0;
for (const f of root.features) {
    featureCount++;
    if (!f || f.type !== "Feature") {
        errors.push(`feature #${featureCount}: missing or non-Feature`);
        continue;
    }
    if (!f.geometry || f.geometry.type !== "Point") {
        errors.push(`feature #${featureCount} (${f.properties && f.properties.name || "?"}): geometry is not a Point`);
        continue;
    }
    const coords = f.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
        errors.push(`feature #${featureCount} (${f.properties && f.properties.name || "?"}): invalid coordinates`);
        continue;
    }
    const lon = coords[0];
    const lat = coords[1];
    if (typeof lon !== "number" || typeof lat !== "number") {
        errors.push(`feature #${featureCount} (${f.properties && f.properties.name || "?"}): non-numeric coordinates`);
        continue;
    }
    if (lon < -180 || lon > 180) {
        errors.push(`feature #${featureCount} (${f.properties && f.properties.name || "?"}): lon out of range ${lon}`);
    }
    if (lat < -90 || lat > 90) {
        errors.push(`feature #${featureCount} (${f.properties && f.properties.name || "?"}): lat out of range ${lat}`);
    }
    const props = f.properties || {};
    if (typeof props.name !== "string" || props.name.trim() === "") {
        errors.push(`feature #${featureCount}: missing required property "name"`);
    }
    if (f.id !== undefined && f.id !== null) {
        const key = String(f.id);
        if (ids.has(key)) errors.push(`duplicate id: ${key}`);
        ids.add(key);
    }
}

if (errors.length > 0) {
    console.error(`FAIL: ${errors.length} error(s) found across ${featureCount} features`);
    for (const e of errors.slice(0, 25)) console.error("  - " + e);
    if (errors.length > 25) console.error(`  ... and ${errors.length - 25} more`);
    process.exit(1);
}

console.log(`PASS: ${featureCount} features, all valid (Point geometry, coords in range, name present, no duplicate ids)`);
process.exit(0);
