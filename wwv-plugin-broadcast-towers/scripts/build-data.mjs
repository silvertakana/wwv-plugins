#!/usr/bin/env node
/**
 * build-data.mjs — build data/data.json for the broadcast-towers plugin.
 *
 * Reads FCC ASR (Antenna Structure Registration) Public Access Files
 * (a_tower.zip → asr_src/) and produces a GeoJSON FeatureCollection of
 * Point features, one per active registration with a valid coordinate.
 *
 * Join strategy (mirrors asr2geojson):
 *   - RA.dat  registration_data: city, state, structure type, heights
 *   - CO.dat  application_coordinates: lat/lon in deg-min-sec total seconds
 *   - EN.dat  registration_entities: owning entity name (not used for props)
 *
 * Selection rule: only records with status G (granted), no dismantle date,
 * and a valid coordinate. For registrations with multiple records, the
 * record with the most recent date_action wins.
 *
 * Coordinate conversion: total seconds / 3600, negative for W/S.
 *
 * Usage: node scripts/build-data.mjs [path-to-asr_src]
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const asrSrc = process.argv[2] || join(__dirname, "..", "..", "asr_src");

// ---------------------------------------------------------------------------
// Parse pipe-delimited FCC fixed-width-ish files. Records can contain
// embedded newlines, so normalize \r\r\n / \r to spaces first (asr2geojson
// fix_file.py approach), then split on \n and split each line on |.
// ---------------------------------------------------------------------------
function readDat(filename) {
    const p = join(asrSrc, filename);
    if (!existsSync(p)) {
        console.error(`missing ${p}`);
        process.exit(1);
    }
    const raw = readFileSync(p, "latin1")
        .replace(/\r\r\n/g, " ")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, " ");
    return raw.split("\n").map((line) => line.split("|"));
}

console.log("reading RA.dat ...");
const raRows = readDat("RA.dat");
console.log("reading CO.dat ...");
const coRows = readDat("CO.dat");
console.log("RA records:", raRows.length, "CO records:", coRows.length);

// ---------------------------------------------------------------------------
// CO.dat columns (from FCC schema, 0-indexed):
// 0 record_type, 1 content_indicator, 2 file_number, 3 registration_number,
// 4 unique_system_identifier, 5 coordinate_type, 6 lat_deg, 7 lat_min,
// 8 lat_sec, 9 lat_direction, 10 lat_total_seconds, 11 lon_deg, 12 lon_min,
// 13 lon_sec, 14 lon_direction, 15 lon_total_seconds, 16 array_tower_pos,
// 17 array_total_tower
// ---------------------------------------------------------------------------
const coords = new Map();
for (const r of coRows) {
    if (r.length < 16) continue;
    const regNum = r[3];
    const latSec = parseFloat(r[10]);
    const lonSec = parseFloat(r[15]);
    const latDir = r[9];
    const lonDir = r[14];
    if (!Number.isFinite(latSec) || !Number.isFinite(lonSec)) continue;
    if (!latSec || !lonSec) continue;
    // Keep the first coordinate record for a registration (current application).
    if (!coords.has(regNum)) {
        coords.set(regNum, {
            lat: latSec / 3600 * (latDir === "S" ? -1 : 1),
            lon: lonSec / 3600 * (lonDir === "W" ? -1 : 1),
        });
    }
}
console.log("coords with valid lat/lon:", coords.size);

// ---------------------------------------------------------------------------
// RA.dat columns (from FCC schema, 0-indexed):
// 0 record_type, 1 content_indicator, 2 file_number, 3 registration_number,
// 4 unique_system_identifier, 5 application_purpose, 6 previous_purpose,
// 7 input_source_code, 8 status_code, 9 date_entered, 10 date_received,
// 11 date_issued, 12 date_constructed, 13 date_dismantled, 14 date_action,
// 15 archive_flag_code, 16 version, 17-21 signature name fields,
// 22 invalid_signature, 23 structure_street_address,
// 24 structure_city, 25 structure_state_code, 26 county_code, 27 zip_code,
// 28 height_of_structure, 29 ground_elevation, 30 overall_height_above_ground,
// 31 overall_height_amsl, 32 structure_type, 33 date_faa_determination_issued,
// 34 faa_study_number, 35 faa_circular_number, 36 specification_option,
// 37 painting_and_lighting, 38 mark_light_code, 39 mark_light_other,
// 40 faa_emi_flag, 41 nepa_flag, 42 date_signed, 43-47 signature last/first/mi/suffix/title,
// 48 date_signed_or
// ---------------------------------------------------------------------------
const registrations = new Map();
for (const r of raRows) {
    if (r.length < 33) continue;
    const regNum = r[3];
    const status = r[8];
    const dateAction = r[14];
    if (status !== "G") continue; // only granted
    const existing = registrations.get(regNum);
    // Prefer the record with the most recent date_action.
    if (existing && existing.dateAction >= (dateAction || "")) continue;
    registrations.set(regNum, {
        regNum,
        dateAction,
        street: r[23],
        city: r[24],
        state: r[25],
        height: parseFloat(r[28]), // height of structure (feet)
        overallHeight: parseFloat(r[30]), // overall height above ground (feet)
        amsl: parseFloat(r[31]), // overall height above mean sea level (feet)
        structureType: r[32],
    });
}
console.log("granted registrations:", registrations.size);

// ---------------------------------------------------------------------------
// Build features: registration + coordinate.
// ---------------------------------------------------------------------------
const features = [];
for (const [regNum, reg] of registrations) {
    const c = coords.get(regNum);
    if (!c) continue;
    if (c.lat < -90 || c.lat > 90 || c.lon < -180 || c.lon > 180) continue;
    const name = [reg.city, reg.state].filter(Boolean).join(", ") || undefined;
    const props = {
        name: name || `ASR-${regNum}`,
        asr: regNum,
        city: reg.city || undefined,
        state: reg.state || undefined,
    };
    // height: prefer overall height above ground (feet); fall back to
    // structure height. Numeric only.
    const h = Number.isFinite(reg.overallHeight) ? reg.overallHeight
        : Number.isFinite(reg.height) ? reg.height : null;
    if (h != null) props.height = Math.round(h * 10) / 10;
    if (reg.structureType) props.structureType = reg.structureType;

    features.push({
        type: "Feature",
        id: regNum,
        geometry: { type: "Point", coordinates: [c.lon, c.lat] },
        properties: props,
    });
}
console.log("features built:", features.length);

// ---------------------------------------------------------------------------
// Deterministic sampling to keep data.json under the ~9 MB bundle cap.
// Sort by height descending (tallest first, null height treated as -1),
// then keep every Nth feature. This preserves the most interesting towers
// while spreading across the whole range deterministically.
// ---------------------------------------------------------------------------
const TARGET_BYTES = 8.5 * 1024 * 1024;

function featureSizeEstimate(features, bytes) {
    return features.length > 0 ? bytes / features.length : 0;
}

// First pass: write once to measure actual size, then decide the sampling rate.
const rawFc = { type: "FeatureCollection", features };
writeFileSync(outPath(), JSON.stringify(rawFc));
let bytes = statSync(outPath()).size;
const perFeature = featureSizeEstimate(features, bytes);

let sampled = features;
let step = 1;
if (bytes > TARGET_BYTES) {
    step = Math.max(1, Math.ceil(bytes / TARGET_BYTES));
    const sorted = [...features].sort((a, b) => {
        const ha = typeof a.properties.height === "number" ? a.properties.height : -1;
        const hb = typeof b.properties.height === "number" ? b.properties.height : -1;
        return hb - ha;
    });
    sampled = sorted.filter((_, i) => i % step === 0);
}
console.log(`sampling: step=${step}, kept ${sampled.length} of ${features.length} features`);

const fc = { type: "FeatureCollection", features: sampled };
const out = outPath();
writeFileSync(out, JSON.stringify(fc));
console.log("wrote", out, (statSync(out).size / 1024 / 1024).toFixed(2) + " MB");

function outPath() {
    return join(__dirname, "..", "data", "data.json");
}
