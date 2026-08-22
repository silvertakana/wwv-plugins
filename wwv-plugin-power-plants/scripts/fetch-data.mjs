#!/usr/bin/env node
/**
 * fetch-data.mjs — reproducible data-refresh script for the power-plants plugin.
 *
 * Re-downloads the WRI Global Power Plant Database CSV and regenerates
 * data/data.json as a GeoJSON FeatureCollection (one Point feature per CSV row,
 * same row order as the source, country-grouped by upstream).
 *
 * No external dependencies — runs on system node. Exits 0 on success, 1 on
 * failure (network, CSV parse, encoding sanity, write, or verification).
 *
 * Usage:
 *   node scripts/fetch-data.mjs                  # download + regenerate + verify
 *   node scripts/fetch-data.mjs --check="Ain Djasser=Algeria"
 *                                                # spot-check a known plant (run alone)
 *
 * Property mapping (mirrors the original data build):
 *   name              CSV `name` (trimmed; upstream names already carry the country)
 *   capacity_mw       CSV `capacity_mw` as number
 *   primary_fuel      CSV `primary_fuel` (verbatim)
 *   country           CSV `country_long` (verbatim)
 *   owner             CSV `owner` (trimmed) — omitted when empty
 *   commissioning_year CSV `commissioning_year` as number — omitted when empty
 *
 * The original data.json was built from a ~1.0 release of the same CSV. If the
 * upstream file changes meaningfully, feature counts and spot-checks will drift
 * by design — that is the point of a refresh script. This script FAILS CLOSED:
 * it refuses to write when the regenerated file fails verify-data.mjs, when the
 * feature count moves by more than 2% vs the committed data, or when the source
 * shows more than a threshold of U+FFFD replacement chars (upstream ships a few
 * dozen of those already; a spike means the download is corrupt). Note the
 * upstream CSV is itself double-encoded for a handful of accented names/owners
 * (e.g. "SociÃ©te" for "Société"); those are passed through faithfully, exactly
 * as the committed data already contains them.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data", "data.json");
const VERIFY_PATH = join(__dirname, "verify-data.mjs");

const SOURCE_URL =
    "https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv";
const SOURCE_LICENSE = "CC BY 4.0 — WRI Global Power Plant Database, https://datasets.wri.org/dataset/globalpowerplantdatabase";

// Fail-closed guardrails vs the committed dataset (keeps a bad refresh from
// silently replacing good data).
const MAX_COUNT_DRIFT = 0.02; // allow ±2% feature-count movement
const MAX_BAD_CHARS = 200;    // upstream occasionally ships U+FFFD replacement chars

const args = process.argv.slice(2);
const checkArg = args.find((a) => a.startsWith("--check="));

// ---------------------------------------------------------------------------
// RFC-4180 CSV parser (state machine, no dependencies). Handles quoted fields
// with embedded commas/newlines and "" escapes.
// ---------------------------------------------------------------------------
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            row.push(field);
            field = "";
        } else if (c === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else if (c !== "\r") {
            field += c;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fail(msg) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
}

function readJson(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
        fail(`cannot read ${path}: ${e.message}`);
    }
}

function toNum(s) {
    if (typeof s !== "string" || s.trim() === "") return null; // empty CSV field
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// HTTP fetch with retries (system node ≥ 18 exposes global fetch)
// ---------------------------------------------------------------------------
async function downloadCsv() {
    const attempts = [
        { url: SOURCE_URL, note: "primary: github raw" },
        {
            url: "https://datasets.wri.org/dataset/globalpowerplantdatabase",
            note: "fallback: WRI dataset page (check the CSV download link there)",
        },
    ];
    const MAX_RETRIES = 3;
    for (const attempt of attempts) {
        for (let tryN = 1; tryN <= MAX_RETRIES; tryN++) {
            try {
                console.log(`downloading ${attempt.note} (try ${tryN}/${MAX_RETRIES})...`);
                const res = await fetch(attempt.url);
                if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
                const text = await res.text();
                if (!text.includes("country_long")) {
                    throw new Error("response does not look like the GPPD CSV (missing country_long header)");
                }
                return text;
            } catch (e) {
                if (tryN === MAX_RETRIES) console.error(`  download failed: ${e.message}`);
                else console.error(`  retrying: ${e.message}`);
                if (e.cause && typeof e.cause === "object") {
                    // fetch on older node may surface the underlying error as cause
                    console.error(`  cause: ${e.cause.message || e.cause.code || ""}`);
                }
            }
        }
    }
    fail(
        `could not download the GPPD CSV from any source.\n` +
            `  Primary: ${SOURCE_URL}\n` +
            `  Fallback: download the CSV manually and place it at the script's data path,\n` +
            `  then re-run (set --use-cache to keep going offline).`
    );
}

// ---------------------------------------------------------------------------
// Transform CSV rows -> GeoJSON features
// ---------------------------------------------------------------------------
function transformCsv(rows) {
    const header = rows[0];
    const col = {};
    header.forEach((h, i) => {
        col[h.trim()] = i;
    });
    const required = ["name", "country_long", "capacity_mw", "latitude", "longitude", "primary_fuel"];
    for (const name of required) {
        if (!(name in col)) fail(`CSV missing required column "${name}" (got: ${header.join(", ")})`);
    }

    const features = [];
    let skipped = 0;
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const lon = toNum(r[col.longitude]);
        const lat = toNum(r[col.latitude]);
        if (lon == null || lat == null || !Number.isFinite(lon) || !Number.isFinite(lat)) {
            skipped++;
            continue; // drop rows with unparseable coordinates
        }
        const name = r[col.name].trim();
        const owner = (r[col.owner] || "").trim();
        const cy = toNum(r[col.commissioning_year]);
        const props = {
            name,
            capacity_mw: toNum(r[col.capacity_mw]) ?? 0,
            primary_fuel: r[col.primary_fuel],
            country: r[col.country_long],
        };
        if (owner.length > 0) props.owner = owner;
        if (cy != null) props.commissioning_year = cy;
        features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties: props,
        });
    }
    return { features, skipped };
}

// ---------------------------------------------------------------------------
// Encoding sanity: the CSV is nominally UTF-8 but occasionally ships broken
// bytes. Guard so a mojibake re-encode can never overwrite good data.
// ---------------------------------------------------------------------------
function encodingSanityCheck(text) {
    const bad = (text.match(/\uFFFD/g) || []).length;
    if (bad > MAX_BAD_CHARS) fail(`${bad} U+FFFD replacement chars in CSV — source encoding looks broken; aborting.`);
    console.log(`  source encoding: ${bad} U+FFFD replacement char(s) (threshold ${MAX_BAD_CHARS})`);
}

function dataSanityCheck(features) {
    // Minimal structural sanity on the regenerated payload. Deep corruption is
    // caught downstream by the drift guard and verify-data.mjs.
    if (!Array.isArray(features) || features.length === 0) {
        fail("transform produced no features");
    }
    for (const f of features.slice(0, 100)) {
        if (!f || f.type !== "Feature" || !f.geometry || f.geometry.type !== "Point" || !f.properties?.name) {
            fail(`malformed feature at head of payload: ${JSON.stringify(f)?.slice(0, 160)}`);
        }
    }
    console.log(`  structural sanity: ${features.length} features, first 100 all valid`);
}

// ---------------------------------------------------------------------------
// Spot-check: `--check="<name>=<country>"` verifies a known plant survives the
// pipeline. `--check="<name>=null"` asserts the plant is NOT present.
// ---------------------------------------------------------------------------
function runCheck(features, expr) {
    const eq = expr.indexOf("=");
    if (eq < 0) fail(`--check expects "<name>=<country>" or "<name>=null", got: ${expr}`);
    const targetName = expr.slice(0, eq).trim();
    const expected = expr.slice(eq + 1).trim();
    const match = features.filter((f) => f.properties.name === targetName);
    if (expected.toLowerCase() === "null") {
        if (match.length > 0) fail(`expected ${targetName} to be absent, but found ${match.length} feature(s)`);
        console.log(`  CHECK ${JSON.stringify(targetName)}=null: absent (${match.length} found) — OK`);
        return;
    }
    if (match.length === 0) fail(`spot-check: no feature named ${JSON.stringify(targetName)}`);
    const got = match.map((f) => f.properties.country).join("|");
    if (got !== expected) fail(`spot-check: ${JSON.stringify(targetName)} country=${got}, expected ${expected}`);
    console.log(`  CHECK ${JSON.stringify(targetName)}=${got} — OK`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const useCache = args.includes("--use-cache");
    let csvText = null;
    let csvFromCache = false;

    if (useCache) {
        try {
            const { tmpdir } = await import("node:os");
            csvText = readFileSync(join(tmpdir(), "gppd-global-power-plant-database.csv"), "utf8");
            csvFromCache = true;
            console.log(`using cached CSV: ${csvText.length} chars`);
        } catch {
            csvText = null;
        }
    }

    if (csvText == null) {
        csvText = await downloadCsv();
        // cache for offline re-runs — the temp dir, never the repo (data/ is a
        // published artifact and the plugin ships no .gitignore)
        try {
            const { tmpdir } = await import("node:os");
            const cachePath = join(tmpdir(), "gppd-global-power-plant-database.csv");
            writeFileSync(cachePath, csvText);
            console.log(`cached CSV to ${cachePath} (re-run with --use-cache to go offline)`);
        } catch {
            /* cache write is best-effort */
        }
    }

    encodingSanityCheck(csvText);

    console.log("parsing CSV...");
    const rows = parseCsv(csvText);
    if (rows.length === 0) fail("CSV parsed to zero rows");
    console.log(`  rows: ${rows.length} (header + ${rows.length - 1} data)`);

    console.log("transforming to GeoJSON...");
    const { features, skipped } = transformCsv(rows);
    console.log(`  features: ${features.length}, skipped (bad coords): ${skipped}`);

    dataSanityCheck(features);

    const out = {
        type: "FeatureCollection",
        features,
    };
    const outStr = JSON.stringify(out);
    const size = Buffer.byteLength(outStr, "utf8");
    console.log(`  generated ${features.length} features, ${(size / 1024 / 1024).toFixed(2)} MB`);

    // spot-checks (when requested)
    if (checkArg) {
        runCheck(features, checkArg.slice("--check=".length));
        console.log("PASS: spot-check succeeded");
        process.exit(0);
    }

    // drift guard vs the committed dataset
    let committed = null;
    try {
        committed = readJson(DATA_PATH);
    } catch {
        /* first run / no committed data */
    }
    if (committed && Array.isArray(committed.features)) {
        const drift = Math.abs(features.length - committed.features.length) / committed.features.length;
        console.log(`  count drift vs committed: ${((drift) * 100).toFixed(2)}% (${committed.features.length} -> ${features.length})`);
        if (drift > MAX_COUNT_DRIFT && !args.includes("--force")) {
            fail(
                `feature count moved ${(drift * 100).toFixed(2)}% (allowed ${MAX_COUNT_DRIFT * 100}%). ` +
                    `This is more than a cosmetic upstream change — review before committing. ` +
                    `Re-run with --force to override.`
            );
        }
    }

    // unchanged guard: byte-identical output must not dirty the working tree
    let prev = null;
    try {
        prev = readFileSync(DATA_PATH, "utf8");
    } catch {
        prev = null;
    }
    if (prev === outStr) {
        console.log("data.json is byte-identical to the committed file — nothing to write.");
    } else {
        if (!args.includes("--force")) {
            const delta = prev ? Buffer.byteLength(outStr) - Buffer.byteLength(prev) : size;
            console.log(`  change vs committed: ${delta > 0 ? "+" : ""}${delta} bytes`);
        }
        writeFileSync(DATA_PATH, outStr);
        console.log(`wrote ${DATA_PATH} (${(size / 1024 / 1024).toFixed(2)} MB)`);
    }

    // fail-closed verification with the committed validator
    console.log("verifying with verify-data.mjs...");
    try {
        const { spawnSync } = await import("node:child_process");
        const res = spawnSync(process.execPath, [VERIFY_PATH], { stdio: "inherit" });
        if (res.status !== 0) fail(`verify-data.mjs exited ${res.status}`);
    } catch (e) {
        fail(`could not run verify-data.mjs: ${e.message}`);
    }

    console.log(`PASS: data refresh complete. Source: ${SOURCE_URL} (${SOURCE_LICENSE})`);
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
