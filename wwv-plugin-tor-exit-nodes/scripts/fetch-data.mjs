#!/usr/bin/env node
/**
 * fetch-data.mjs — build data/data.json for the tor-exit-nodes plugin.
 *
 * Pipeline:
 *   1. Fetch the Tor Project exit list plaintext
 *      (https://check.torproject.org/exit-addresses, public domain, refreshed hourly)
 *   2. Extract every unique `ExitAddress <ip>` line
 *   3. Batch-geolocate via the ip-api.com free batch endpoint
 *      (POST http://ip-api.com/batch, 100 IPs per request, HTTP only, non-commercial)
 *   4. Emit a GeoJSON FeatureCollection of Points with properties:
 *      name (the IP), city, country, org (ISP/AS org), ip
 *
 * IPs that fail geolocation (status != "success") are dropped and counted.
 *
 * Usage: node scripts/fetch-data.mjs
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "data", "data.json");

const EXIT_LIST_URL = "https://check.torproject.org/exit-addresses";
const BATCH_URL = "http://ip-api.com/batch";
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1200; // stay well under ip-api's 15 req/min free limit

async function fetchExitIps() {
    const res = await fetch(EXIT_LIST_URL);
    if (!res.ok) throw new Error(`exit-addresses fetch failed: ${res.status} ${res.statusText}`);
    const text = await res.text();
    const ips = [];
    const seen = new Set();
    for (const line of text.split("\n")) {
        const m = /^ExitAddress\s+([0-9a-fA-F:.]+)\s+/.exec(line.trim());
        if (m) {
            const ip = m[1];
            if (!seen.has(ip)) {
                seen.add(ip);
                ips.push(ip);
            }
        }
    }
    return ips;
}

async function geolocateBatch(ips) {
    const results = new Map();
    let dropped = 0;
    for (let i = 0; i < ips.length; i += BATCH_SIZE) {
        const chunk = ips.slice(i, i + BATCH_SIZE);
        let body;
        let attempts = 0;
        for (;;) {
            try {
                const res = await fetch(BATCH_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(chunk),
                });
                if (!res.ok) {
                    // 429 (too many requests) — back off and retry, like ip-api docs recommend
                    const retryAfter = Number(res.headers.get("Retry-After") || "1");
                    await new Promise((r) => setTimeout(r, Math.max(retryAfter, 1) * 1000));
                    continue;
                }
                body = await res.json();
                break;
            } catch (e) {
                attempts++;
                if (attempts >= 4) throw e;
                await new Promise((r) => setTimeout(r, 2000));
            }
        }
        if (!Array.isArray(body)) throw new Error(`unexpected batch response shape: ${JSON.stringify(body).slice(0, 200)}`);
        body.forEach((entry, idx) => {
            const ip = chunk[idx];
            if (entry && entry.status === "success") {
                results.set(ip, entry);
            } else {
                dropped++;
            }
        });
        console.log(`  batch ${i / BATCH_SIZE + 1}/${Math.ceil(ips.length / BATCH_SIZE)}: ${chunk.length} queried, ${body.filter((e) => e && e.status === "success").length} ok`);
        if (i + BATCH_SIZE < ips.length) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
    return { results, dropped };
}

const ips = await fetchExitIps();
console.log(`exit-addresses: ${ips.length} unique ExitAddress IPs`);

const { results, dropped } = await geolocateBatch(ips);
console.log(`geolocation: ${results.size} ok, ${dropped} dropped (failed geolocation)`);

const features = [...results.entries()]
    .map(([ip, r]) => ({
        type: "Feature",
        id: ip,
        geometry: {
            type: "Point",
            coordinates: [r.lon, r.lat],
        },
        properties: {
            name: ip,
            city: r.city || "",
            country: r.country || "",
            org: r.org || "",
            ip,
        },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

const fc = {
    type: "FeatureCollection",
    features,
};

writeFileSync(OUT_PATH, JSON.stringify(fc));
console.log(`wrote ${OUT_PATH}: ${features.length} features (${dropped} IPs dropped)`);
