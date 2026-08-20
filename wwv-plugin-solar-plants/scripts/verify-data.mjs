#!/usr/bin/env node
/**
 * Fail-closed validator for wwv-plugin-solar-plants data/data.json.
 * Exits 0 on pass, 1 on any failure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "data", "data.json");

const errors = [];
let fc;

try {
    fc = JSON.parse(fs.readFileSync(dataPath, "utf8"));
} catch (e) {
    console.error("FAIL: data.json does not parse as JSON:", e.message);
    process.exit(1);
}

if (!fc || fc.type !== "FeatureCollection") {
    console.error("FAIL: top-level type is not 'FeatureCollection'");
    process.exit(1);
}

if (!Array.isArray(fc.features)) {
    console.error("FAIL: features is not an array");
    process.exit(1);
}

const seenIds = new Set();
let hasErrors = false;

fc.features.forEach((f, i) => {
    const where = `feature[${i}]`;
    if (!f || f.type !== "Feature") {
        errors.push(`${where}: type is not 'Feature'`);
        return;
    }
    const g = f.geometry;
    if (!g || g.type !== "Point") {
        errors.push(`${where}: geometry is not a Point`);
        return;
    }
    if (!Array.isArray(g.coordinates) || g.coordinates.length < 2) {
        errors.push(`${where}: coordinates must have at least [lon, lat]`);
        return;
    }
    const lon = g.coordinates[0];
    const lat = g.coordinates[1];
    if (typeof lon !== "number" || lon < -180 || lon > 180) {
        errors.push(`${where}: lon ${lon} out of range [-180, 180]`);
    }
    if (typeof lat !== "number" || lat < -90 || lat > 90) {
        errors.push(`${where}: lat ${lat} out of range [-90, 90]`);
    }
    const props = f.properties || {};
    if (typeof props.name !== "string" || props.name.trim() === "") {
        errors.push(`${where}: missing required property 'name'`);
    }
    if (typeof props.id === "string") {
        if (seenIds.has(props.id)) {
            errors.push(`${where}: duplicate id '${props.id}'`);
        } else {
            seenIds.add(props.id);
        }
    }
});

if (errors.length > 0) {
    hasErrors = true;
    console.error(`FAIL: ${errors.length} problem(s) found:`);
    errors.forEach((e) => console.error("  - " + e));
}

const summary = `OK: ${fc.features.length} features, ${seenIds.size} unique ids, all points in range`;
if (hasErrors) {
    console.error(summary);
    process.exit(1);
}
console.log(summary);
process.exit(0);
