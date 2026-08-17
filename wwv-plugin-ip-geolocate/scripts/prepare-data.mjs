/**
 * prepare-data.mjs — build data/data.json for wwv-plugin-ip-geolocate.
 *
 * Inputs (downloaded from upstream, NOT committed here — re-download before re-running):
 *   data/user-country-ipv4.csv  (3 cols: start_ip,end_ip,country_code; PDDL)
 *     https://github.com/sapics/ip-location-db/releases/download/latest/user-country-ipv4.csv
 *   data/countries.json         (mledoze/countries: cca2 + latlng + name)
 *     https://raw.githubusercontent.com/mledoze/countries/master/countries.json
 *
 * Output:
 *   data/data.json = {
 *     "countries": [{ code, name, lat, lng }, ...]  // index 0 = Unknown
 *     "ranges": {
 *       "s": base64(Uint32Array of range starts),
 *       "e": base64(Uint32Array of range ends),
 *       "c": base64(Uint16Array of country indices),
 *       "n": row count
 *     }
 *   }
 *
 * Run: node scripts/prepare-data.mjs   (from the plugin directory)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function ipToUint32(ip) {
    const parts = ip.split(".");
    if (parts.length !== 4) return null;
    let v = 0;
    for (let i = 0; i < 4; i++) {
        const o = Number(parts[i]);
        if (!Number.isInteger(o) || o < 0 || o > 255) return null;
        v = (v << 8) | o;
    }
    return v >>> 0;
}

// ── 1. Parse CSV ──────────────────────────────────────────────────────────
const csvPath = join(root, "data", "user-country-ipv4.csv");
const lines = readFileSync(csvPath, "utf8").split(/\r?\n/);
const rows = [];
for (const line of lines) {
    if (!line.trim()) continue;
    const [start, end, code] = line.split(",");
    if (!start || !end || !code) continue;
    const s = ipToUint32(start);
    const e = ipToUint32(end);
    if (s === null || e === null) continue;
    rows.push([s, e, code]);
}
console.log(`parsed rows: ${rows.length}`);

// Sort by start (stable; keep original order for ties)
rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

// ── 2. Country map from mledoze countries.json ────────────────────────────
const countriesPath = join(root, "data", "countries.json");
let countryByCode = new Map();
try {
    const countries = JSON.parse(readFileSync(countriesPath, "utf8"));
    for (const c of countries) {
        if (!c.cca2 || !c.name?.common) continue;
        const [lat, lng] = c.latlng ?? [0, 0];
        countryByCode.set(c.cca2, { code: c.cca2, name: c.name.common, lat, lng });
    }
    console.log(`country map entries: ${countryByCode.size}`);
} catch (e) {
    console.error("Failed to load countries.json — all lookups will be Unknown:", e.message);
}

// ── 3. Assign country indices ─────────────────────────────────────────────
// index 0 = Unknown
const countryList = [{ code: "", name: "Unknown", lat: 0, lng: 0 }];
const indexByCode = new Map();
function countryIndex(code) {
    if (indexByCode.has(code)) return indexByCode.get(code);
    const info = countryByCode.get(code);
    const idx = info ? countryList.length : 0;
    if (info) {
        countryList.push(info);
        indexByCode.set(code, idx);
    } else if (!indexByCode.has("")) {
        indexByCode.set("", 0);
    }
    return idx;
}

const starts = new Uint32Array(rows.length);
const ends = new Uint32Array(rows.length);
const codes = new Uint16Array(rows.length);
let known = 0;
let unknown = 0;
for (let i = 0; i < rows.length; i++) {
    const [s, e, code] = rows[i];
    starts[i] = s;
    ends[i] = e;
    const idx = countryIndex(code);
    codes[i] = idx;
    if (idx === 0) unknown++; else known++;
}

console.log(`known rows: ${known}, unknown rows: ${unknown}`);
console.log(`countries (incl Unknown): ${countryList.length}`);

// ── 4. Serialize ──────────────────────────────────────────────────────────
function b64(arr) {
    return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64");
}

const data = {
    countries: countryList,
    ranges: {
        s: b64(starts),
        e: b64(ends),
        c: b64(codes),
        n: rows.length,
    },
};

const outPath = join(root, "data", "data.json");
writeFileSync(outPath, JSON.stringify(data));
const size = readFileSync(outPath).byteLength;
console.log(`data.json written: ${outPath}`);
console.log(`data.json size: ${size} bytes (${(size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`raw arrays: starts=${starts.byteLength} ends=${ends.byteLength} codes=${codes.byteLength}`);
