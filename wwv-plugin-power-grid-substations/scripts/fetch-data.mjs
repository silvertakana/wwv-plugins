#!/usr/bin/env node
/**
 * fetch-data.mjs — (re)generate data/data.json for wwv-plugin-power-grid-substations.
 *
 * Source: OpenStreetMap via the Overpass API (ODbL).
 *   Query: node["power"="substation"] + way["power"="substation"] (way center
 *   via `out tags center`) over 28 fixed country/subregion bounding boxes.
 *
 * Pipeline:
 *   1. Fetch each region's raw Overpass JSON, caching per-region responses in
 *      .cache/regions/<name>.json (incremental — re-running resumes from cache).
 *   2. Convert elements to Point features. Only NAMED substations are kept
 *      (matches the committed dataset; ~300k named existed in raw, 863k
 *      unnamed dropped). Properties: id (OSM element id), name, voltage,
 *      operator, substation.
 *   3. Dedupe by OSM id (node and way ids are distinct namespaces, so ids are
 *      prefixed node-/way- internally for dedup, but stored un-prefixed).
 *   4. Deterministic selection to fit the ~9 MB bundle budget: hash-sort by
 *      (id hash, id), keep features in that order until the byte gate.
 *   5. Write data/data.json, then verify it with scripts/verify-data.mjs.
 *      If verification fails, or the feature count drifts >2% from the
 *      previous dataset, the script FAILS CLOSED and does not replace the
 *      committed data.
 *
 * Gotchas baked in:
 *   - Query passes as `data=` + encodeURIComponent(query). URLSearchParams
 *     encodes spaces as `+`, which the mirrors reject with HTTP 400.
 *   - Verified 2026-08-22: ALL public mirrors (mail.ru, overpass-api.de,
 *     openstreetmap.fr) reject POST with HTTP 400 and answer GET 200. GET is
 *     the primary mode; POST/curl are last-ditch fallbacks.
 *   - Pace ~45-60s between large queries (mail.ru tolerates ~1/60s).
 *
 * Usage: node scripts/fetch-data.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, "..");
const OUT_PATH = join(PLUGIN_DIR, "data", "data.json");
const CACHE_DIR = join(PLUGIN_DIR, ".cache", "regions");
const VERIFY_SCRIPT = join(__dirname, "verify-data.mjs");
const MAX_BYTES = 9 * 1024 * 1024; // ~9 MB bundle gate
const MAX_DRIFT_PCT = 2; // fail-closed if new count deviates >2% from old

const USER_AGENT = "WWV-power-grid-substations-build/1.0 (data engineering; https://github.com/silvertakana/worldwideview)";

// ---------------------------------------------------------------------------
// Region bounding boxes — same 28 boxes used for the original build.
// {south, west, north, east}
// ---------------------------------------------------------------------------
const REGIONS = {
    // Europe: dense countries fetched individually (continent-wide boxes exceed gateway timeouts)
    fr:         { south: 41.0, west: -6.0,  north: 51.5, east: 10.0 },
    de:         { south: 47.0, west: 5.0,   north: 56.0, east: 16.0 },
    it:         { south: 36.0, west: 6.0,   north: 47.5, east: 20.0 },
    es:         { south: 35.0, west: -10.0, north: 44.0, east: 4.0 },
    uk:         { south: 49.0, west: -9.0,  north: 60.0, east: 2.0 },
    pl:         { south: 49.0, west: 13.0,  north: 56.0, east: 25.0 },
    balkans:    { south: 38.0, west: 12.0,  north: 49.0, east: 30.0 },
    baltic:     { south: 52.0, west: 13.0,  north: 66.0, east: 30.0 },
    scandinavia: { south: 55.0, west: 2.0,  north: 72.0, east: 32.0 },
    ru_west:    { south: 43.0, west: 28.0,  north: 62.0, east: 48.0 },
    // Africa: north fringe (Maghreb/Mediterranean), west, central-east, south
    af_north:   { south: 15.0, west: -20.0, north: 34.0, east: 52.0 },
    af_west:    { south: -18.0, west: -20.0, north: 15.0, east: 20.0 },
    af_east:    { south: -18.0, west: 20.0,  north: 15.0, east: 52.0 },
    af_south:   { south: -35.0, west: 8.0,   north: -18.0, east: 52.0 },
    // Asia: middle east, central, india, china, russia east, southeast, japan/korea
    as_mideast: { south: 10.0, west: 32.0,  north: 48.0, east: 68.0 },
    as_central: { south: 28.0, west: 48.0,  north: 58.0, east: 90.0 },
    as_india:   { south: 4.0,  west: 68.0,  north: 35.0, east: 100.0 },
    as_china:   { south: 18.0, west: 95.0,  north: 55.0, east: 135.0 },
    as_russia:  { south: 45.0, west: 100.0, north: 60.0, east: 150.0 },
    as_sea:     { south: -10.0, west: 95.0, north: 18.0, east: 150.0 },
    as_japan:   { south: 25.0, west: 125.0, north: 46.0, east: 150.0 },
    // Oceania
    oc_aust:    { south: -45.0, west: 112.0, north: -8.0, east: 155.0 },
    oc_pacific: { south: -48.0, west: 155.0, north: 8.0,  east: 180.0 },
    // North America: north (Canada/Alaska/Greenland), central (US), south (Mexico/Caribbean)
    na_north:   { south: 45.0, west: -170.0, north: 72.0, east: -50.0 },
    na_central: { south: 25.0, west: -170.0, north: 50.0, east: -50.0 },
    na_south:   { south: 4.0,  west: -120.0, north: 28.0, east: -50.0 },
    // South America: north, central, south
    sa_north:   { south: -15.0, west: -82.0, north: 12.0, east: -34.0 },
    sa_south:   { south: -56.0, west: -82.0, north: -10.0, east: -34.0 },
};

const ENDPOINTS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function queryFor(name) {
    const c = REGIONS[name];
    const box = `(${c.south},${c.west},${c.north},${c.east})`;
    return `[out:json][timeout:180];(node["power"="substation"]${box};way["power"="substation"]${box};);out tags center;`;
}

function classify(text) {
    let kind = "json", count = -1, remark = "";
    try {
        const j = JSON.parse(text);
        count = (j.elements || []).length;
        remark = j.remark || "";
        if (count === 0 && remark) kind = "remark";
    } catch {
        kind = "html";
    }
    return { kind, count, remark };
}

async function fetchNode(name, endpoint, useGet) {
    const q = queryFor(name);
    const body = "data=" + encodeURIComponent(q);
    const opts = {
        method: useGet ? "GET" : "POST",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(240000),
    };
    if (!useGet) opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
    const res = await fetch(useGet ? `${endpoint}?${body}` : endpoint, opts);
    return { status: res.status, text: await res.text() };
}

function fetchCurl(name, endpoint) {
    const q = queryFor(name);
    const body = "data=" + encodeURIComponent(q);
    // curl --get: curl appends the query string itself, preserving encoding
    // (--data-urlencode adds a `data=` field which is what the mirrors expect).
    // maxBuffer: responses can reach 80MB+; execFileSync's 1MB default throws ENOBUFS.
    const args = ["-sS", "--get", "--max-time", "240", "--data-urlencode", `data=${q}`,
        "-H", `User-Agent: ${USER_AGENT}`, endpoint];
    const out = execFileSync("curl", args, { encoding: "utf8", timeout: 260000, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    return { status: 200, text: out };
}

async function fetchRegion(name) {
    const dest = join(CACHE_DIR, `${name}.json`);
    if (existsSync(dest)) {
        console.log(`  ${name}: cached (${(statSync(dest).size / 1048576).toFixed(1)}MB)`);
        return { data: JSON.parse(readFileSync(dest, "utf8")), fresh: false };
    }
    for (let attempt = 1; attempt <= 4; attempt++) {
        for (const ep of ENDPOINTS) {
            // GET is primary (verified 2026-08-22: all mirrors reject POST 400).
            for (const mode of ["get", "post", "curl"]) {
                try {
                    let r;
                    if (mode === "curl") r = fetchCurl(name, ep);
                    else r = await fetchNode(name, ep, mode === "get");
                    const info = classify(r.text);
                    console.log(`  [${name}] ${ep.split("/")[2]} ${mode} a${attempt}: HTTP ${r.status} kind=${info.kind} count=${info.count} size=${(r.text.length / 1048576).toFixed(1)}MB${info.remark ? " remark=" + info.remark.slice(0, 40) : ""}`);
                    if (r.status === 200 && info.kind === "json" && (info.count > 0 || r.text.includes('"elements":[]'))) {
                        writeFileSync(dest, r.text);
                        console.log(`  -> saved ${name} (${info.count} elements)`);
                        return { data: JSON.parse(r.text), fresh: true };
                    }
                    if (r.status === 429 || r.status === 503) {
                        const backoff = 30000 * attempt;
                        console.log(`  ...throttled (HTTP ${r.status}), backoff ${backoff / 1000}s`);
                        await sleep(backoff);
                    }
                    // 400/504 = bad request / gateway timeout; do NOT back off,
                    // try next mode/endpoint immediately
                } catch (e) {
                    console.log(`  [${name}] ${ep.split("/")[2]} ${mode} a${attempt} threw: ${e.message.slice(0, 70)}`);
                }
                await sleep(5000);
            }
        }
        console.log(`  ${name}: no good response yet (attempt ${attempt}/4)`);
        await sleep(45000);
    }
    throw new Error(`region ${name} failed after all endpoints/attempts`);
}

// Deterministic string hash (FNV-1a) and PRNG — same as original build.
function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

const byHash = (a, b) => {
    const ha = hashStr(a._sortKey), hb = hashStr(b._sortKey);
    if (ha !== hb) return ha - hb;
    return a._sortKey.localeCompare(b._sortKey);
};

async function main() {
    mkdirSync(CACHE_DIR, { recursive: true });

    const prevRaw = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, "utf8") : null;
    let prevCount = 0;
    if (prevRaw) {
        try { prevCount = JSON.parse(prevRaw).features.length; } catch {}
    }
    console.log(`previous data.json: ${prevCount} features`);

    const regionNames = Object.keys(REGIONS);
    console.log(`fetching ${regionNames.length} regions ...`);
    const features = [];
    const seen = new Set();
    let totalElems = 0, dropped = 0;
    for (let i = 0; i < regionNames.length; i++) {
        const name = regionNames[i];
        const { data: j, fresh } = await fetchRegion(name);
        const els = j.elements || [];
        totalElems += els.length;
        for (const e of els) {
            let lat, lon;
            if (e.type === "node") { lat = e.lat; lon = e.lon; }
            else if (e.type === "way") { lat = e.center?.lat; lon = e.center?.lon; }
            if (typeof lat !== "number" || typeof lon !== "number" || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                dropped++;
                continue;
            }
            const tags = e.tags || {};
            const name2 = tags.name;
            if (!name2) { dropped++; continue; } // named only
            const sortKey = `${e.type}-${e.id}`; // node/way namespaces distinct
            if (seen.has(sortKey)) { dropped++; continue; } // dedupe across overlapping bboxes
            seen.add(sortKey);
            const props = { id: e.id, name: name2 };
            if (tags.voltage) props.voltage = tags.voltage;
            if (tags.operator) props.operator = tags.operator;
            if (tags.substation) props.substation = tags.substation;
            const f = {
                type: "Feature",
                geometry: { type: "Point", coordinates: [lon, lat] },
                properties: props,
                _sortKey: sortKey,
            };
            features.push(f);
        }
        console.log(`  ${name}: ${els.length} elems -> ${features.length} named so far (dropped ${dropped})`);
        if (fresh && i < regionNames.length - 1) {
            const pace = 45000 + Math.random() * 15000; // 45-60s between large queries
            console.log(`  pacing ${Math.round(pace / 1000)}s ...`);
            await sleep(pace);
        }
    }
    console.log(`\nTotal elements: ${totalElems}, named kept: ${features.length}, dropped: ${dropped}`);

    // Deterministic ordering + byte-gated selection (hash-sort by sort key).
    features.sort(byHash);
    const final = [];
    let bytes = 2;
    for (const f of features) {
        delete f._sortKey;
        const frag = (final.length ? "," : "") + JSON.stringify(f);
        if (bytes + frag.length + 30 > MAX_BYTES) break;
        final.push(f);
        bytes += frag.length;
    }
    const out = JSON.stringify({ type: "FeatureCollection", features: final });
    console.log(`selected ${final.length} of ${features.length} named features, ${(out.length / 1048576).toFixed(2)}MB (budget ${MAX_BYTES / 1048576}MB)`);

    // Fail-closed: drift check vs previous count.
    if (prevCount > 0) {
        const driftPct = (Math.abs(final.length - prevCount) / prevCount) * 100;
        console.log(`drift vs previous: ${driftPct.toFixed(2)}% (limit ${MAX_DRIFT_PCT}%)`);
        if (driftPct > MAX_DRIFT_PCT) {
            console.error(`FAIL-CLOSED: feature count drifted ${driftPct.toFixed(2)}% from ${prevCount} to ${final.length}. Not writing data.json.`);
            process.exit(1);
        }
    }

    writeFileSync(OUT_PATH, out);
    console.log(`wrote ${OUT_PATH} (${final.length} features, ${(out.length / 1048576).toFixed(2)}MB)`);

    // Verify.
    try {
        execFileSync(process.execPath, [VERIFY_SCRIPT], { stdio: "inherit", cwd: PLUGIN_DIR });
        console.log("verify-data.mjs: PASS");
    } catch (e) {
        console.error("FAIL-CLOSED: verify-data.mjs did not pass. data.json was written but is suspect; inspect before committing.");
        process.exit(1);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
