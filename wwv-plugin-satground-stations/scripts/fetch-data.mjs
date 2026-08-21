#!/usr/bin/env node
/**
 * fetch-data.mjs — reproducible data refresh for the satground-stations plugin.
 *
 * Re-downloads the SatNOGS Network station list and regenerates
 * data/data.json (GeoJSON FeatureCollection of Point features).
 *
 * Source: https://network.satnogs.org/api/stations/?format=json (CC BY-SA)
 *
 * Transform:
 *   - drop stations with invalid coordinates: (0,0), or lon outside
 *     [-180, 180] / lat outside [-90, 90]
 *   - feature id: `st-${station.id}` (string, mirrors the shipped dataset)
 *   - properties: name, status (if present), altitude (number),
 *     bands (comma-joined unique non-empty frequency bands, original order),
 *     qth (qthlocator)
 *
 * Usage: node scripts/fetch-data.mjs
 * Exits 0 on success, 1 on failure. Path-independent (resolves relative
 * to this file). After running, validate with:
 *   node scripts/verify-data.mjs
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "..", "data", "data.json");

const API_URL = "https://network.satnogs.org/api/stations/?format=json";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
}

async function fetchJson(url, retries = MAX_RETRIES) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                headers: {
                    "User-Agent": "wwv-plugin-satground-stations data refresh (contact: worldwideview)"
                }
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} ${res.statusText}`);
            }
            return await res.json();
        } catch (e) {
            lastErr = e;
            console.error(`  fetch attempt ${attempt}/${retries} failed: ${e.message}`);
            if (attempt < retries) {
                await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            }
        }
    }
    throw lastErr;
}

function toId(s) {
    return s != null ? String(s).trim() : "";
}

function isInvalidCoord(lat, lng) {
    // (0,0) is the SatNOGS "unknown location" sentinel — drop it.
    if (Number(lat) === 0 && Number(lng) === 0) return true;
    if (!Number.isFinite(Number(lng)) || Number(lng) < -180 || Number(lng) > 180) return true;
    if (!Number.isFinite(Number(lat)) || Number(lat) < -90 || Number(lat) > 90) return true;
    return false;
}

async function main() {
    console.log(`Fetching stations from ${API_URL}`);
    const stations = await fetchJson(API_URL);
    if (!Array.isArray(stations)) {
        fail(`API returned a ${typeof stations} instead of an array`);
    }
    console.log(`  fetched ${stations.length} stations`);

    const seen = new Set();
    const dropped = { coords: 0, dup: 0, emptyName: 0 };
    const features = [];

    for (const s of stations) {
        if (!s || typeof s !== "object") {
            dropped.coords++;
            continue;
        }
        const name = toId(s.name);
        if (!name) {
            dropped.emptyName++;
            continue;
        }
        const lat = Number(s.lat);
        const lng = Number(s.lng);
        if (isInvalidCoord(lat, lng)) {
            dropped.coords++;
            continue;
        }
        const id = `st-${toId(s.id)}`;
        if (id === "st-" || seen.has(id)) {
            dropped.dup++;
            continue;
        }
        seen.add(id);

        // Each antenna band is a comma-joined string (e.g. "VHF, UHF"); split,
        // then dedupe case-insensitively (API mixes "UHF" and "uhf"), keeping
        // first-occurrence casing and API order. Mirrors the shipped dataset.
        const seenBands = new Set();
        const bands = [];
        if (Array.isArray(s.antenna)) {
            for (const a of s.antenna) {
                if (!a || a.band == null) continue;
                for (const part of toId(a.band).split(/,\s*/)) {
                    if (!part) continue;
                    const key = part.toLowerCase();
                    if (!seenBands.has(key)) {
                        seenBands.add(key);
                        bands.push(part);
                    }
                }
            }
        }
        const props = { name };
        if (s.status != null) props.status = toId(s.status);
        if (s.altitude != null && Number.isFinite(Number(s.altitude))) props.altitude = Number(s.altitude);
        if (bands.length > 0) props.bands = bands.join(", ");
        if (s.qthlocator != null) props.qth = toId(s.qthlocator);

        features.push({
            type: "Feature",
            id,
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: props
        });
    }

    console.log(`  kept ${features.length}, dropped ${stations.length - features.length} (coords: ${dropped.coords}, duplicate ids: ${dropped.dup}, empty names: ${dropped.emptyName})`);

    const data = { type: "FeatureCollection", features };
    const raw = JSON.stringify(data);
    writeFileSync(dataPath, raw, "utf8");

    console.log(`Wrote ${dataPath} (${raw.length} bytes, ${features.length} features)`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
