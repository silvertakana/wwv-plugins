#!/usr/bin/env node
/**
 * fetch-data.mjs — reproducible NOAA IBTrACS data refresh for the
 * hurricane-tracks plugin.
 *
 * Downloads the IBTrACS v04r00 North Atlantic basin CSV, filters to
 * North-Atlantic storms from 2000+ with a peak USA_SSHS >= 2, and
 * regenerates data/data.json (GeoJSON FeatureCollection, one Point per
 * 6-hour best-track position, full tracks including pre-peak rows with
 * negative SSHS).
 *
 * Data source: NOAA IBTrACS (public domain)
 *   https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r00/access/csv/ibtracs.NA.list.v04r00.csv
 *
 * Usage: node scripts/fetch-data.mjs [--force]
 *   --force   bypass the "data.json already exists" safety prompt
 *
 * After running, verify with: node scripts/verify-data.mjs  (must exit 0)
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginDir = join(__dirname, "..");
const dataPath = join(pluginDir, "data", "data.json");

const URL = "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r00/access/csv/ibtracs.NA.list.v04r00.csv";

const MIN_SEASON = 2000;
const MIN_PEAK_CATEGORY = 2; // USA_SSHS (Saffir-Simpson), e.g. category 2+

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function isMissing(v) {
    return v == null || String(v).trim() === "" || v === "-999.0" || v === "-999";
}

// Guard against placeholder rows (IBTrACS -999.0 or exactly 0,0) that
// would otherwise pollute the geometry. Lat must be in [-90, 90], lon in
// [-180, 180], and the pair must not be the (0,0) sentinel.
function isBadCoords(lat, lon) {
    return (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 || lat > 90 ||
        lon < -180 || lon > 180 ||
        (lat === 0 && lon === 0)
    );
}

async function download(url, retries = 3) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Downloading ${url}`);
            console.log(`  attempt ${attempt}/${retries} ...`);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.log(`  received ${(text.length / 1024 / 1024).toFixed(2)} MB`);
            return text;
        } catch (err) {
            lastErr = err;
            console.error(`  download failed: ${err.message}`);
            if (attempt < retries) {
                const delay = 2000 * attempt;
                console.log(`  retrying in ${delay / 1000}s ...`);
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }
    throw new Error(`download failed after ${retries} attempts: ${lastErr?.message ?? lastErr}`);
}

/**
 * Parse the IBTrACS NA CSV and build the filtered FeatureCollection.
 * Format gotchas (verified against the v04r00 NA file):
 *   - The CSV opens with 2 header rows (columns, units); data starts at
 *     line index 2. (Earlier builds described 3 header rows; the live
 *     v04r00 file has 2. The parser detects the columns row by content,
 *     so it is robust either way.)
 *   - No quoted fields — plain split(",") is safe.
 *   - Basin selection: storms are selected at the STORM level. A storm is
 *     an NA-basin storm if ANY of its rows carries BASIN == "NA" (cross-
 *     basin storms like 2022 BONNIE are NA storms that track into the EP,
 *     so their EP rows are part of the storm and must be kept). Rows are
 *     then filtered by storm membership, not by individual row basin.
 *     The file name says NA but also contains other-basin rows, so the
 *     column filter is required, not the file name.
 *   - Category column is the USA_SSHS (Saffir-Simpson); WMO_WIND/WMO_PRES
 *     are optional and may be blank or -999.0.
 */
function parseCSV(text) {
    const lines = text.split("\n");

    const columns = {};
    const header = lines[0]; // columns row (index 0)
    header.split(",").forEach((col, i) => { columns[col.trim()] = i; });

    const required = ["SID", "SEASON", "BASIN", "NAME", "ISO_TIME", "LAT", "LON", "USA_SSHS"];
    for (const c of required) {
        if (!(c in columns)) throw new Error(`unexpected CSV columns — missing ${c}`);
    }

    // Pass 1: determine which storms are NA-basin storms (any NA row).
    const naStormSids = new Set();
    for (const line of lines.slice(2)) {
        if (!line.trim()) continue;
        const p = line.split(",");
        if (p.length < 8) continue;
        if (p[columns.BASIN] === "NA") naStormSids.add(p[columns.SID]);
    }

    // Pass 2: keep rows whose storm is an NA storm, applying the
    // season / placeholder-coordinate filters per row.
    const rows = [];
    for (const line of lines.slice(2)) {
        if (!line.trim()) continue;
        const p = line.split(",");
        if (p.length < 8) continue;
        const sid = p[columns.SID];
        if (!naStormSids.has(sid)) continue; // storm-level NA selection
        const season = num(p[columns.SEASON]);
        if (season == null || season < MIN_SEASON) continue;
        const lat = num(p[columns.LAT]);
        const lon = num(p[columns.LON]);
        if (isBadCoords(lat, lon)) continue; // drop placeholder rows
        const category = isMissing(p[columns.USA_SSHS]) ? null : num(p[columns.USA_SSHS]);
        const windRaw = p[columns.WMO_WIND];
        const presRaw = p[columns.WMO_PRES];
        rows.push({
            sid,
            season,
            name: p[columns.NAME],
            iso_time: p[columns.ISO_TIME],
            lat,
            lon,
            category,
            wind: isMissing(windRaw) ? null : num(windRaw),
            pres: isMissing(presRaw) ? null : num(presRaw),
        });
    }
    return rows;
}

// Peak category per storm (max USA_SSHS across its positions; a null
// category contributes nothing — all post-2000 NA storms carry USA_SSHS).
function stormPeakCategories(rows) {
    const peak = new Map();
    for (const r of rows) {
        if (r.category != null) {
            const cur = peak.get(r.sid);
            if (cur == null || r.category > cur) peak.set(r.sid, r.category);
        }
    }
    return peak;
}

function buildData(rows) {
    const peak = stormPeakCategories(rows);
    const features = [];
    const storms = new Set();
    let droppedNoCategory = 0;
    let droppedBelowPeak = 0;
    for (const r of rows) {
        const p = peak.get(r.sid);
        if (p == null) { droppedNoCategory++; continue; } // no category data at all
        if (p < MIN_PEAK_CATEGORY) { droppedBelowPeak++; continue; } // peak below cat 2
        storms.add(r.sid);
        features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [r.lon, r.lat] },
            properties: {
                name: r.name,
                season: r.season,
                sid: r.sid,
                category: r.category,
                wind: r.wind,
                pres: r.pres,
                iso_time: r.iso_time,
            },
        });
    }
    return { features, storms: storms.size, droppedNoCategory, droppedBelowPeak };
}

// Verify a freshly generated file before it replaces the committed one.
function verifyData(path) {
    const data = JSON.parse(readFileSync(path, "utf8"));
    const feats = data.features;
    if (!feats || !Array.isArray(feats)) throw new Error("not a FeatureCollection");
    const seen = new Set();
    for (const f of feats) {
        if (f.type !== "Feature" || !f.geometry || f.geometry.type !== "Point") {
            throw new Error("non-Point feature encountered");
        }
        const [lon, lat] = f.geometry.coordinates;
        if (typeof lon !== "number" || typeof lat !== "number" || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
            throw new Error("out-of-range coordinates encountered");
        }
        const pr = f.properties;
        for (const p of ["name", "season", "category", "iso_time"]) {
            if (pr == null || pr[p] == null) throw new Error(`missing property ${p}`);
        }
        const id = f.id;
        if (id != null) {
            if (seen.has(id)) throw new Error("duplicate id");
            seen.add(id);
        }
    }
    return feats.length;
}

async function main() {
    const force = process.argv.includes("--force");
    if (existsSync(dataPath) && !force) {
        console.error(`Refusing to overwrite existing ${dataPath}.`);
        console.error(`Re-run with --force to regenerate.`);
        process.exit(1);
    }

    const text = await download(URL);

    console.log("Parsing CSV ...");
    const rows = parseCSV(text);
    console.log(`  retained NA storm rows: ${rows.length}`);

    console.log("Building FeatureCollection ...");
    const { features, storms, droppedNoCategory, droppedBelowPeak } = buildData(rows);
    if (droppedNoCategory > 0) console.warn(`  WARN: ${droppedNoCategory} row(s) had no USA_SSHS category (all post-2000 NA storms expected to have it)`);
    console.log(`  storms:               ${storms}`);
    console.log(`  features:             ${features.length}`);
    if (droppedBelowPeak > 0) console.log(`  rows below peak cat ${MIN_PEAK_CATEGORY} dropped: ${droppedBelowPeak}`);

    const data = { type: "FeatureCollection", features };

    // Write to a temp file first, validate, then atomically replace.
    const tmpPath = dataPath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(data));
    let verified;
    try {
        verified = verifyData(tmpPath);
    } catch (e) {
        try { unlinkSync(tmpPath); } catch {}
        throw new Error(`generated data failed integrity check: ${e.message}`);
    }
    writeFileSync(dataPath, JSON.stringify(data));
    try { unlinkSync(tmpPath); } catch {}

    const size = (JSON.stringify(data).length / 1024 / 1024).toFixed(2);
    console.log(`Wrote ${dataPath}`);
    console.log(`  ${verified} features, ${storms} storms, ${size} MB`);
    console.log("Next: node scripts/verify-data.mjs");
}

main().catch((e) => {
    console.error(`fetch-data failed: ${e.message}`);
    process.exit(1);
});
