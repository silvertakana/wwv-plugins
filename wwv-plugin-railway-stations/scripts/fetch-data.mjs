#!/usr/bin/env node
/**
 * fetch-data.mjs — reproducible OpenStreetMap data refresh for the
 * railway-stations plugin.
 *
 * Re-queries OSM (Overpass API) for railway=station nodes per-region,
 * de-dupes by OSM id, deterministically samples (sort by name, keep every
 * SAMPLE_STEP-th) to stay under the 9MB gate, and regenerates
 * data/data.json. Fail-closed: exits 1 without touching data.json if the
 * resulting feature count drifts >2% from the expected count or the file
 * would exceed the size gate.
 *
 * Usage: node scripts/fetch-data.mjs
 * Env:   PACE_MS      min delay between region queries (default 45000)
 *        CACHE_DIR    override cache location (default temp/.cache)
 *
 * Gotchas honored (from the original build):
 *   - Endpoint chaos: maps.mail.ru (VK Maps) first, then fallbacks.
 *   - POST body `data=` + encodeURIComponent(query) — never URLSearchParams
 *     (node encodes spaces as + → HTTP 400).
 *   - Nodes must use `out body` (NOT `out tags`) — `out tags` omits lat/lon
 *     and every element would be dropped by the coordinate guard.
 *   - ~45-60s pacing between queries + exponential backoff on 429/400/504.
 *   - Each region's raw response is cached to temp/.cache immediately after
 *     success, so a mid-run kill loses nothing. Delete temp/.cache to force a
 *     full re-query (e.g. after a query/format change).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, "..");
const DATA_PATH = join(PLUGIN_ROOT, "data", "data.json");
const CACHE_DIR = process.env.CACHE_DIR || join(PLUGIN_ROOT, "temp", ".cache");

const ENDPOINTS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
];

// [south, west, north, east] — 17 regions covering the world.
// Overlaps are fine: features are de-duped by OSM id.
// The original build's list covered europe/americas/africa/asia/oceania but
// left an East-Asia gap (Japan, Korea, Taiwan, Manchuria, Russian Far East)
// and missed Luzon — east-asia + philippines-n close that gap (verified
// against the committed data: 5,263 features / 16.7% sat outside the old
// 15 boxes). siberia's east bound was widened 150 -> 160 for Magadan.
const REGIONS = [
    { name: "europe",            bbox: [35, -10, 71, 20] },
    { name: "europe-east",       bbox: [35, 20, 71, 60] },
    { name: "north-america-w",   bbox: [15, -168, 72, -110] },
    { name: "north-america-e",   bbox: [15, -110, 72, -52] },
    { name: "central-america",   bbox: [5, -118, 30, -60] },
    { name: "south-america-w",   bbox: [-56, -82, 13, -60] },
    { name: "south-america-e",   bbox: [-56, -60, 13, -34] },
    { name: "africa-w",          bbox: [-35, -18, 20, 20] },
    { name: "africa-e",          bbox: [-35, 20, 20, 52] },
    { name: "north-africa-me",   bbox: [20, -18, 37, 52] },
    { name: "asia-w",            bbox: [5, 40, 60, 80] },
    { name: "asia-e",            bbox: [5, 80, 60, 120] },
    { name: "siberia",           bbox: [50, 60, 75, 160] },
    { name: "southeast-asia",    bbox: [-15, 90, 10, 155] },
    { name: "oceania",           bbox: [-50, 110, 0, 180] },
    { name: "east-asia",         bbox: [20, 120, 50, 150] },
    { name: "philippines-n",     bbox: [10, 119, 20, 127] },
];

const PACE_MS = Number(process.env.PACE_MS || 45000);
const EXPECTED_COUNT = 31501;
const MAX_DRIFT_PCT = 2;
const MAX_BYTES = 9 * 1024 * 1024;
const SAMPLE_STEP = 3;
const TIMEOUT_MS = 180000;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function overpassQuery(region) {
    const [s, w, n, e] = region.bbox;
    return `[out:json][timeout:180];\nnode["railway"="station"]["name"](${s},${w},${n},${e});\nout body;`;
}

async function postOverpass(endpoint, query) {
    const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
        const err = new Error(`HTTP ${res.status} from ${endpoint}`);
        err.status = res.status;
        throw err;
    }
    const text = await res.text();
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error(`non-JSON response from ${endpoint}`);
    }
    if (parsed.remark) {
        throw new Error(`Overpass remark from ${endpoint}: ${parsed.remark}`);
    }
    if (!Array.isArray(parsed.elements)) {
        throw new Error(`no elements array from ${endpoint}`);
    }
    return parsed.elements;
}

async function fetchRegion(region) {
    const cacheFile = join(CACHE_DIR, `${region.name}.json`);
    if (existsSync(cacheFile)) {
        const cached = JSON.parse(readFileSync(cacheFile, "utf8"));
        console.log(`  [cache] ${region.name}: ${cached.length} elements`);
        return cached;
    }
    const query = overpassQuery(region);
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        for (const endpoint of ENDPOINTS) {
            try {
                const elements = await postOverpass(endpoint, query);
                mkdirSync(CACHE_DIR, { recursive: true });
                writeFileSync(cacheFile, JSON.stringify(elements));
                console.log(`  [ok] ${region.name}: ${elements.length} elements via ${endpoint}`);
                return elements;
            } catch (e) {
                lastErr = e;
                const backoff = Math.min(5000 * 2 ** attempt, 60000);
                console.log(`  [warn] ${region.name} ${endpoint}: ${e.message} — retry in ${backoff / 1000}s`);
                await sleep(backoff);
            }
        }
    }
    throw new Error(`region ${region.name} failed after retries: ${lastErr?.message}`);
}

function toFeature(el) {
    const t = el.tags || {};
    const props = { name: t.name };
    if (t.public_transport) props.public_transport = t.public_transport;
    if (t.railway) props.railway = t.railway;
    if (t.operator) props.operator = t.operator;
    if (t.station_code) props.station_code = t.station_code;
    return {
        type: "Feature",
        id: `railway-station-${el.id}`,
        geometry: { type: "Point", coordinates: [el.lon, el.lat] },
        properties: props,
    };
}

async function main() {
    console.log(`railway-stations data refresh — ${REGIONS.length} regions, pace ${PACE_MS}ms`);
    mkdirSync(CACHE_DIR, { recursive: true });

    const byId = new Map();
    let rawCount = 0;
    for (const region of REGIONS) {
        const elements = await fetchRegion(region);
        rawCount += elements.length;
        for (const el of elements) {
            if (typeof el.id !== "number" || typeof el.lon !== "number" || typeof el.lat !== "number") continue;
            if (!el.tags || typeof el.tags.name !== "string" || el.tags.name.length === 0) continue;
            if (!byId.has(el.id)) byId.set(el.id, el);
        }
        if (region !== REGIONS[REGIONS.length - 1]) await sleep(PACE_MS);
    }

    const named = [...byId.values()].map(toFeature);
    named.sort((a, b) => (a.properties.name < b.properties.name ? -1 : a.properties.name > b.properties.name ? 1 : 0));
    const sampled = named.filter((_, i) => i % SAMPLE_STEP === 0);

    const fc = { type: "FeatureCollection", features: sampled };
    const json = JSON.stringify(fc);
    const bytes = Buffer.byteLength(json);

    const pct = Math.round((Math.abs(sampled.length - EXPECTED_COUNT) / EXPECTED_COUNT) * 10000) / 100;
    console.log(`raw elements:  ${rawCount}`);
    console.log(`named unique:  ${named.length}`);
    console.log(`sampled:       ${sampled.length} (every ${SAMPLE_STEP}th)`);
    console.log(`size:          ${(bytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`drift vs ${EXPECTED_COUNT}: ${pct}%`);

    if (pct > MAX_DRIFT_PCT) {
        console.error(`FAIL: feature count ${sampled.length} drifts ${pct}% from expected ${EXPECTED_COUNT} (max ${MAX_DRIFT_PCT}%) — data.json NOT updated`);
        process.exit(1);
    }
    if (bytes > MAX_BYTES) {
        console.error(`FAIL: output ${(bytes / 1024 / 1024).toFixed(2)} MB exceeds 9MB gate — data.json NOT updated`);
        process.exit(1);
    }

    writeFileSync(DATA_PATH, json);
    console.log(`PASS: wrote ${DATA_PATH} (${sampled.length} features, ${(bytes / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((e) => {
    console.error(`FATAL: ${e.message}`);
    process.exit(1);
});
