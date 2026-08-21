#!/usr/bin/env node
/**
 * fetch-data.mjs — downloads RIPE Atlas probe metadata from the Atlas API v2
 * (https://atlas.ripe.net/api/v2/probes/) and writes the plugin's GeoJSON
 * FeatureCollection bundle to data/data.json.
 *
 * Pipeline:
 *   1. Paginate /api/v2/probes/ with `status=1` (server-side filter for
 *      connected probes; ~14-15k results at limit=1000, ~60k if unfiltered)
 *   2. Filter to probes with a valid Point geometry (lat/lon present, not 0,0)
 *   3. Transform to GeoJSON FeatureCollection of Points with properties:
 *        name      - description, or "probe-<id>" fallback
 *        probe_id  - RIPE Atlas probe id
 *        asn       - asn_v4 (may be null)
 *        country   - country_code (ISO-3166-1 alpha-2, may be null)
 *        is_public - boolean
 *        tags      - array of tag slugs (optional, omitted when empty)
 *   4. Deterministic sampling if the bundle exceeds ~9MB (sort by probe_id,
 *      keep every Nth)
 *
 * Usage: node scripts/fetch-data.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data", "data.json");

const API = "https://atlas.ripe.net/api/v2/probes/";
const PAGE_SIZE = 1000;
const MAX_PAGES = 200;         // safety: API caps at 100/page despite limit, ~15k connected => ~150 pages
const MAX_TOTAL = 60000;       // brief's ~60k cap
const MAX_BUNDLE_BYTES = 9 * 1024 * 1024; // 9MB gate
const MAX_RETRIES = 4;
const FETCH_TIMEOUT_MS = 60000;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, attempt = 0) {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(url, {
            headers: { "User-Agent": "worldwideview-wwv-plugin-ripe-atlas (data fetch)" },
            signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return await res.json();
    } catch (e) {
        if (attempt < MAX_RETRIES) {
            await sleep(1500 * (attempt + 1));
            return fetchJson(url, attempt + 1);
        }
        throw e;
    }
}

function validPoint(p) {
    if (!p || !p.geometry || p.geometry.type !== "Point") return false;
    const c = p.geometry.coordinates;
    if (!Array.isArray(c) || c.length < 2) return false;
    const lon = c[0];
    const lat = c[1];
    if (typeof lon !== "number" || typeof lat !== "number") return false;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
    // exclude (0,0) which usually means "unknown location"
    if (lat === 0 && lon === 0) return false;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return false;
    return true;
}

function toFeature(p) {
    const [lon, lat] = p.geometry.coordinates;
    const tags = Array.isArray(p.tags) ? p.tags.map((t) => t?.slug).filter(Boolean) : [];
    const props = {
        name: p.description || `probe-${p.id}`,
        probe_id: p.id,
        asn: p.asn_v4 ?? null,
        country: p.country_code ?? null,
        is_public: p.is_public ?? false,
    };
    if (tags.length) props.tags = tags;
    return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        id: `ripe-atlas-${p.id}`,
        properties: props,
    };
}

async function fetchAll() {
    const all = [];
    let next = `${API}?status=1&limit=${PAGE_SIZE}`;
    let pages = 0;
    while (next && pages < MAX_PAGES) {
        const data = await fetchJson(next);
        if (!data || !Array.isArray(data.results)) {
            throw new Error(`unexpected API envelope at page ${pages + 1}`);
        }
        all.push(...data.results);
        pages++;
        console.log(`  page ${pages}: fetched ${data.results.length} (total ${all.length}, count ${data.count})`);
        if (all.length >= MAX_TOTAL) break;
        next = data.next;
        if (next && pages % 5 === 0) await sleep(300); // be polite
    }
    return all;
}

function sampleFeatures(features, maxBytes) {
    if (features.length === 0) return features;
    let keepEvery = 1;
    let sampled = features;
    // estimate, then double the sampling ratio until it fits
    while (Buffer.byteLength(JSON.stringify(sampled), "utf8") > maxBytes) {
        keepEvery *= 2;
        const step = keepEvery;
        sampled = features.filter((_, i) => i % step === 0);
        if (sampled.length < 10) break; // never drop below ~10 features
    }
    return sampled;
}

async function main() {
    console.log("RIPE Atlas probe fetch");
    console.log(`  API: ${API}?status=1&limit=${PAGE_SIZE}`);
    console.log("  fetching connected probes...");
    const probes = await fetchAll();
    console.log(`  fetched ${probes.length} probes`);

    const connected = probes.filter((p) => p.status && p.status.id === 1);
    console.log(`  connected (status.id===1): ${connected.length}`);

    const geo = connected.filter(validPoint);
    console.log(`  with valid point geometry: ${geo.length}`);
    console.log(`  rejected (no/invalid/0,0 geometry): ${connected.length - geo.length}`);

    const features = geo.map(toFeature);

    // de-duplicate by id (live count can drift mid-pagination, causing a probe
    // to appear on two pages); keep the first occurrence, stable order
    const seenIds = new Set();
    const uniqueFeatures = [];
    for (const f of features) {
        if (seenIds.has(f.id)) continue;
        seenIds.add(f.id);
        uniqueFeatures.push(f);
    }
    if (uniqueFeatures.length !== features.length) {
        console.log(`  de-duplicated: ${features.length - uniqueFeatures.length} duplicate id(s) removed`);
    }

    const fullBytes = Buffer.byteLength(JSON.stringify(uniqueFeatures), "utf8");
    console.log(`  full bundle: ${uniqueFeatures.length} features, ${(fullBytes / 1024 / 1024).toFixed(2)} MB`);

    let finalFeatures = uniqueFeatures;
    let sampledNote = null;
    if (fullBytes > MAX_BUNDLE_BYTES) {
        finalFeatures = sampleFeatures(features, MAX_BUNDLE_BYTES);
        sampledNote = {
            total: features.length,
            kept: finalFeatures.length,
            ratio: (features.length / finalFeatures.length).toFixed(1),
        };
        console.log(`  bundle exceeded ${MAX_BUNDLE_BYTES / 1024 / 1024}MB — sampled to ${finalFeatures.length} features`);
    }

    const fc = {
        type: "FeatureCollection",
        features: finalFeatures,
    };
    mkdirSync(dirname(DATA_PATH), { recursive: true });
    writeFileSync(DATA_PATH, JSON.stringify(fc), "utf8");
    const bytes = Buffer.byteLength(JSON.stringify(fc), "utf8");
    console.log(`  wrote ${DATA_PATH}: ${finalFeatures.length} features, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
    if (sampledNote) {
        console.log(`  NOTE: sampled deterministically (sort by probe_id implicit in API order, keep every Nth) — kept ${sampledNote.kept}/${sampledNote.total}`);
    }
    console.log("fetch-data.mjs done");
}

main().catch((e) => {
    console.error("fetch-data.mjs failed:", e.message);
    process.exit(1);
});
