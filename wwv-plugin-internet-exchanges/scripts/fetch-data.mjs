#!/usr/bin/env node
/**
 * fetch-data.mjs — build data/data.json for wwv-plugin-internet-exchanges.
 *
 * Source: PeeringDB public API (https://www.peeringdb.com/api, CC BY-SA 4.0).
 *   - /api/ix   — Internet Exchange Points (name, city, country, name_long,
 *                 media, proto_unicast, proto_multicast, proto_ipv6, notes)
 *   - /api/fac  — Carrier-neutral facilities (name, city, country, org_id,
 *                 org_name, latitude, longitude)
 *
 * Pipeline:
 *   1. Fetch /api/ix and /api/fac (both return {"data":[...]}; the full result
 *      is returned in one response — no pagination needed).
 *   2. Facilities become Features directly (type "facility").
 *   3. IXPs no longer expose latitude/longitude on /api/ix (removed from the
 *      API). Coordinates are derived from the IXP's member facilities
 *      (fac_set -> facility ids): the feature point is the centroid of all
 *      member facilities with valid coordinates. IXPs with zero geocodable
 *      members are dropped.
 *   4. Features with missing/invalid lat/lon are dropped (0,0 is invalid).
 *
 * Output: GeoJSON FeatureCollection of Points with properties:
 *   name, city, country, type ("ixp" | "facility"),
 *   + media, proto_ipv6, proto_unicast, proto_multicast, notes for IXPs
 *   + org_name, org_id for facilities
 *
 * Usage: node scripts/fetch-data.mjs
 */
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "data.json");
const CACHE_DIR = join(__dirname, "..", ".cache");
const USER_AGENT = "WorldWideView-internet-exchanges-plugin/1.0 (plugin data build; https://github.com/silvertakana/worldwideview)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRaw(url) {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    return res.text();
}

async function getJsonWithCache(key, url) {
    const cacheFile = join(CACHE_DIR, `${key}.json`);
    if (existsSync(cacheFile)) {
        console.log(`using cached ${key} (${cacheFile})`);
        return JSON.parse(readFileSync(cacheFile, "utf8"));
    }
    // PeeringDB throttles anonymous clients (HTTP 429, ~15-20 min cooldown).
    // Retry with exponential backoff; on final failure fall back to a local
    // cache file that the operator can drop in .cache/ (see README).
    let lastErr;
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const text = await fetchRaw(url);
            if (existsSync(CACHE_DIR)) writeFileSync(cacheFile, text);
            return JSON.parse(text);
        } catch (e) {
            lastErr = e;
            if (e.message.startsWith("HTTP 429") || e.message.startsWith("HTTP 5")) {
                const backoff = 15000 * 2 ** (attempt - 1) + Math.random() * 3000;
                console.warn(`HTTP throttled/5xx for ${key}, retrying in ${Math.round(backoff / 1000)}s (attempt ${attempt}/5)`);
                await sleep(backoff);
                continue;
            }
            break;
        }
    }
    throw lastErr;
}

function validCoord(lat, lon) {
    return (
        typeof lat === "number" && typeof lon === "number" &&
        Number.isFinite(lat) && Number.isFinite(lon) &&
        lat !== 0 && lon !== 0 &&
        lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
    );
}

async function run() {
    const [ixRes, facRes] = await Promise.all([
        getJsonWithCache("ix", "https://www.peeringdb.com/api/ix"),
        getJsonWithCache("fac", "https://www.peeringdb.com/api/fac"),
    ]);
    const ixs = ixRes.data || [];
    const facs = facRes.data || [];
    console.log(`fetched ${ixs.length} IXPs, ${facs.length} facilities`);

    const facById = new Map();
    for (const f of facs) facById.set(f.id, f);

    const features = [];

    // Facilities: keep status ok + valid coords; drop 0,0.
    let facDropped = 0;
    for (const f of facs) {
        if (f.status !== "ok" || !validCoord(f.latitude, f.longitude)) {
            facDropped++;
            continue;
        }
        features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [f.longitude, f.latitude] },
            id: `facility-${f.id}`,
            properties: {
                name: f.name,
                city: f.city ?? undefined,
                country: f.country ?? undefined,
                type: "facility",
                org_name: f.org_name ?? undefined,
                org_id: f.org_id ?? undefined,
            },
        });
    }

    // IXPs: centroid of geocodable member facilities.
    let ixWithPoints = 0;
    let ixDropped = 0;
    for (const ix of ixs) {
        if (ix.status !== "ok") { ixDropped++; continue; }
        const memberIds = Array.isArray(ix.fac_set) ? ix.fac_set : [];
        const pts = memberIds
            .map((id) => facById.get(id))
            .filter((f) => f && validCoord(f.latitude, f.longitude))
            .map((f) => ({ lat: f.latitude, lon: f.longitude }));
        if (pts.length === 0) { ixDropped++; continue; }
        const lat = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
        const lon = pts.reduce((a, p) => a + p.lon, 0) / pts.length;
        features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, lat] },
            id: `ixp-${ix.id}`,
            properties: {
                name: ix.name,
                city: ix.city ?? undefined,
                country: ix.country ?? undefined,
                type: "ixp",
                name_long: ix.name_long ?? undefined,
                media: ix.media ?? undefined,
                proto_unicast: ix.proto_unicast ?? undefined,
                proto_multicast: ix.proto_multicast ?? undefined,
                proto_ipv6: ix.proto_ipv6 ?? undefined,
                notes: ix.notes ?? undefined,
            },
        });
        ixWithPoints++;
    }

    const out = { type: "FeatureCollection", features };
    writeFileSync(OUT, JSON.stringify(out));
    console.log(`wrote ${OUT}`);
    console.log(`  total features: ${features.length}`);
    console.log(`  ixp:      ${features.filter((f) => f.properties.type === "ixp").length} (dropped ${ixDropped} without coords)`);
    console.log(`  facility: ${features.filter((f) => f.properties.type === "facility").length} (dropped ${facDropped} without valid coords)`);
    console.log(`  size:     ${(Buffer.byteLength(JSON.stringify(out)) / 1024 / 1024).toFixed(2)} MB`);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
