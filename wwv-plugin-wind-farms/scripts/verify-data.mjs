#!/usr/bin/env node
// Fail-closed GeoJSON validator for the wind-farms plugin data.
// Checks: parses as JSON, is a FeatureCollection, every feature has a Point
// geometry with lon in [-180,180] and lat in [-90,90], required properties
// present, and no duplicate ids. Exit 0 on pass, 1 on fail.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(__dirname, "../data/data.json");

const REQUIRED_PROPS = ["name"];

let raw;
try {
    raw = fs.readFileSync(dataPath, "utf8");
} catch (e) {
    console.error("[verify-data] FAIL: could not read data file:", dataPath, e.message);
    process.exit(1);
}

let data;
try {
    data = JSON.parse(raw);
} catch (e) {
    console.error("[verify-data] FAIL: data.json is not valid JSON:", e.message);
    process.exit(1);
}

const errors = [];

if (!data || data.type !== "FeatureCollection") {
    errors.push("top-level type is not FeatureCollection");
}
if (!Array.isArray(data.features)) {
    errors.push("features is not an array");
    console.error("[verify-data] FAIL:", errors.join("; "));
    process.exit(1);
}

const features = data.features;
const ids = new Set();
let idsSeen = 0;

for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const where = `feature[${i}]`;
    if (!f || f.type !== "Feature") {
        errors.push(`${where}: missing type "Feature"`);
        continue;
    }
    const g = f.geometry;
    if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) {
        errors.push(`${where}: geometry is not a Point`);
        continue;
    }
    const [lon, lat] = g.coordinates;
    if (typeof lon !== "number" || typeof lat !== "number") {
        errors.push(`${where}: coordinates are not numeric`);
        continue;
    }
    if (lon < -180 || lon > 180) {
        errors.push(`${where}: lon ${lon} out of range [-180,180]`);
    }
    if (lat < -90 || lat > 90) {
        errors.push(`${where}: lat ${lat} out of range [-90,90]`);
    }
    const p = f.properties || {};
    for (const key of REQUIRED_PROPS) {
        if (!(key in p)) {
            errors.push(`${where}: missing required property "${key}"`);
        }
    }
    // id uniqueness (f.id or wikidata_id or index fallback as authored in index.ts)
    const idKey = f.id !== undefined ? String(f.id) : (p.wikidata_id !== undefined ? String(p.wikidata_id) : `idx:${i}`);
    idsSeen++;
    if (ids.has(idKey)) {
        errors.push(`${where}: duplicate id "${idKey}"`);
    } else {
        ids.add(idKey);
    }
}

if (errors.length > 0) {
    console.error(`[verify-data] FAIL: ${errors.length} issue(s)`);
    for (const e of errors.slice(0, 25)) {
        console.error("  -", e);
    }
    if (errors.length > 25) console.error(`  ... and ${errors.length - 25} more`);
    process.exit(1);
}

const withCoords = features.filter((f) => f.geometry && f.geometry.type === "Point").length;
console.log(`[verify-data] PASS: ${features.length} features, ${withCoords} Point geometries, ${ids.size} unique ids, ${idsSeen - ids.size === 0 ? "no duplicates" : idsSeen - ids.size + " duplicate id entries"}`);
process.exit(0);
