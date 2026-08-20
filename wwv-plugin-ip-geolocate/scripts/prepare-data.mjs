/**
 * prepare-data.mjs — build city-level data/data.json for wwv-plugin-ip-geolocate.
 *
 * Source (downloaded upstream, NOT committed — re-download before re-running):
 *   data/dbip-city-ipv4.csv   (10 cols/csv.gz, CC BY 4.0)
 *     https://github.com/sapics/ip-location-db/releases/download/latest/dbip-city-ipv4.csv.gz
 *
 * CSV columns (verified first line):
 *   [0] start_ip  [1] end_ip  [2] country_code  [3] state1  [4] state2
 *   [5] city      [6] postcode [7] latitude      [8] longitude [9] time_zone
 *
 * Pipeline (aggressively compacted to fit the CI ~9.5MB bundle gate):
 *   1. Parse IPv4 -> uint32; drop private/reserved ranges + start>=end rows.
 *   2. Dedup (country, city, rounded-coords) into a location table; each range ->
 *      a location index. Rounded coords chosen so dedup is high.
 *   3. Sort by start; merge adjacent/overlapping ranges that map to the SAME
 *      location (extends end to cover subsumed neighbors).
 *   4. If still over budget: aggregate to fixed /BLOCK_BITS blocks keeping the
 *      DOMINANT location per block (by address-count), then re-merge same-location
 *      adjacent blocks. (Trades precision for compactness: a block of 2^BLOCK_BITS
 *      addresses is labelled with its most-populous city.)
 *
 * Every stage is reported so the accuracy-vs-size tradeoff is transparent.
 *
 * Output layout:
 *   {
 *     "countries": string[],            // country code by index (0 = "")
 *     "locs": {
 *       "c": b64(Uint16Array country idx),
 *       "t": concatenated city strings (no separator; sliced by off),
 *       "off": b64(Uint32Array per-loc start offset),  // t.slice(off[i], off[i+1])
 *       "y": b64(Float32Array lat),
 *       "x": b64(Float32Array lng)
 *     },
 *     "ranges": {
 *       "s": b64(Uint32Array starts),
 *       "e": b64(Uint32Array ends),
 *       "i": b64(Uint16Array loc indices) | b64(Uint32Array) if locs > 65535,
 *       "n": range count
 *     }
 *   }
 *
 * Run: node scripts/prepare-data.mjs   (from the plugin directory)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// ── Tunables (bump coarser if result exceeds budget) ─────────────────────
const COORD_DECIMALS = Number(process.env.COORD_DECIMALS ?? 2); // 2 dec ~1.1km
const BLOCK_BITS = Number(process.env.BLOCK_BITS ?? 0);         // 0 = no block aggregation
const TARGET_BYTES = 9_500_000;                                 // ~9.5MB bundle ceiling

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

// Private/reserved address blocks to exclude (RFC1918 + loopback + link-local + this-net + multicast/reserved).
const RESERVED = [
  [0x00000000, 0x00ffffff], // 0/8       "this network"
  [0x0a000000, 0x0affffff], // 10/8      RFC1918
  [0x7f000000, 0x7fffffff], // 127/8     loopback
  [0xa9fe0000, 0xa9feffff], // 169.254/16 link-local
  [0xac100000, 0xac1fffff], // 172.16/12 RFC1918
  [0xc0a80000, 0xc0a8ffff], // 192.168/16 RFC1918
  [0xe0000000, 0xffffffff], // 224/4 multicast + 240/4 reserved/reserved
];
function isReserved(s, e) {
  return RESERVED.some(([a, b]) => !(e < a || s > b)); // any overlap with a reserved block
}

// ── 1. Parse + filter ────────────────────────────────────────────────────
const csvPath = join(root, "data", "dbip-city-ipv4.csv");
const lines = readFileSync(csvPath, "utf8").split(/\r?\n/);
const rawRows = [];
let skipped = 0;
for (const line of lines) {
  if (!line.trim()) continue;
  const f = line.split(",");
  const s = ipToUint32(f[0]);
  const e = ipToUint32(f[1]);
  if (s === null || e === null) { skipped++; continue; }
  if (s >= e) { skipped++; continue; }
  if (isReserved(s, e)) { skipped++; continue; }
  rawRows.push([s, e, f[2], f[5], Number(f[7]), Number(f[8])]); // [start, end, country, city, lat, lng]
}
console.log(`input rows: ${rawRows.length}  (skipped/filtered: ${skipped})`);

// ── 2. Location dedup (rounded coords) ───────────────────────────────────
const countryList = [""]; // index 0 = empty country
const countryIdx = new Map();
const locs = []; // { c, t, y, x }
const locKey = new Map(); // `${c}:${t}:${y}:${x}` -> loc index

function locIndex(country, city, lat, lng) {
  const y = lat.toFixed(COORD_DECIMALS);
  const x = lng.toFixed(COORD_DECIMALS);
  const key = `${country}|${city}|${y}|${x}`;
  if (locKey.has(key)) return locKey.get(key);
  if (!countryIdx.has(country)) {
    countryIdx.set(country, countryList.length);
    countryList.push(country);
  }
  const idx = locs.length;
  locs.push({ c: countryIdx.get(country), t: city || "", y: Number(y), x: Number(x) });
  locKey.set(key, idx);
  return idx;
}

const ranges = rawRows.map(([s, e, country, city, lat, lng]) => {
  const li = locIndex(country, city || "", lat, lng);
  return [s, e, li];
});
console.log(`distinct locations (${COORD_DECIMALS} dec): ${locs.length}`);

// ── 3. Sort + merge same-location adjacents ──────────────────────────────
ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
function merge(rr) {
  const out = [];
  for (const [s, e, li] of rr) {
    const last = out[out.length - 1];
    if (last && last[2] === li && s <= last[1] + 1) {
      if (e > last[1]) last[1] = e;
    } else {
      out.push([s, e, li]);
    }
  }
  return out;
}
let merged = merge(ranges);
console.log(`ranges after same-location merge: ${merged.length}`);

// ── 4. Optional dominant-location block aggregation ──────────────────────
if (BLOCK_BITS > 0) {
  const size = 2 ** BLOCK_BITS;
  const blockDominant = new Map(); // block -> [loc, addressCount]
  for (const [s, e, li] of merged) {
    // Use unsigned shift (>>>) so addresses >= 2^31 (first octet >= 128)
    // don't wrap negative, and float multiply (block * size) to avoid Int32
    // overflow when converting back to a start address.
    let b = s >>> BLOCK_BITS;
    const lastBlock = e >>> BLOCK_BITS;
    while (b <= lastBlock) {
      const blockStart = b * size;
      const blockEnd = blockStart + size - 1;
      const os = Math.max(s, blockStart);
      const oe = Math.min(e, blockEnd);
      const cnt = oe - os + 1;
      const cur = blockDominant.get(b);
      if (!cur) blockDominant.set(b, [li, cnt]);
      else if (cnt > cur[1]) blockDominant.set(b, [li, cnt]);
      b++;
    }
  }
  const blockRanges = [];
  for (const [block, [li]] of blockDominant) {
    blockRanges.push([block * size, block * size + size - 1, li]);
  }
  blockRanges.sort((a, b) => a[0] - b[0]);
  merged = merge(blockRanges);
  console.log(`ranges after /${32 - BLOCK_BITS} (${BLOCK_BITS} host-bit) dominant-location aggregation: ${merged.length}`);
}

// ── 5. Prune + remap: keep only locations actually referenced by ranges ──
const referenced = new Set();
for (const r of merged) referenced.add(r[2]);
const locIdMap = new Map();
const prunedLocs = [];
for (const r of merged) {
  const li = r[2];
  if (!locIdMap.has(li)) {
    locIdMap.set(li, prunedLocs.length);
    prunedLocs.push(locs[li]);
  }
  r[2] = locIdMap.get(li);
}
const useU32index = prunedLocs.length > 65535;
const Idx = useU32index ? Uint32Array : Uint16Array;
console.log(`referenced locations (post-prune): ${prunedLocs.length} (useU32index=${useU32index})`);

// ── Serialize ────────────────────────────────────────────────────────────
const starts = new Uint32Array(merged.length);
const ends = new Uint32Array(merged.length);
for (let i = 0; i < merged.length; i++) { starts[i] = merged[i][0]; ends[i] = merged[i][1]; }

const idxs = new Idx(merged.length);
for (let i = 0; i < merged.length; i++) idxs[i] = merged[i][2];

// Build pruned loc arrays + city string
const locC = new Uint16Array(prunedLocs.length);
const locY = new Float32Array(prunedLocs.length);
const locX = new Float32Array(prunedLocs.length);
const locOff = new Uint32Array(prunedLocs.length + 1);
// Cities are sliced purely by numeric offsets, so no separator is needed.
let cityStr = "";
let acc = 0;
for (let i = 0; i < prunedLocs.length; i++) {
  locC[i] = prunedLocs[i].c;
  locY[i] = prunedLocs[i].y;
  locX[i] = prunedLocs[i].x;
  locOff[i] = acc; // start of city i
  cityStr += prunedLocs[i].t;
  acc += prunedLocs[i].t.length;
}
locOff[prunedLocs.length] = acc;

// Prune country list to those referenced
const usedCountries = new Set();
for (const l of prunedLocs) usedCountries.add(l.c);
const countryListPruned = countryList.filter((_, i) => usedCountries.has(i));
// Remap country indices in prunedLocs
const countryRemap = new Map();
countryListPruned.forEach((_, i) => countryRemap.set(countryList.indexOf(countryListPruned[i]), i));
for (let i = 0; i < prunedLocs.length; i++) locC[i] = countryRemap.get(locC[i]);

function b64(arr) {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString("base64");
}

const data = {
  countries: countryListPruned,
  locs: {
    c: b64(locC),
    t: cityStr,
    off: b64(locOff),
    y: b64(locY),
    x: b64(locX),
    n: prunedLocs.length,
  },
  ranges: {
    s: b64(starts),
    e: b64(ends),
    i: b64(idxs),
    n: merged.length,
    u32: useU32index,
  },
};

const outPath = join(root, "data", "data.json");
writeFileSync(outPath, JSON.stringify(data));
const size = readFileSync(outPath).byteLength;
console.log(`data.json size: ${size} bytes (${(size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`raw binary: starts=${starts.byteLength} ends=${ends.byteLength} idx=${idxs.byteLength} locs(misc)=${locC.byteLength + locY.byteLength + locX.byteLength + locOff.byteLength}`);
console.log(`est bundle (data.json + ~50KB JS): ${(size + 50000).toFixed(0)} bytes`);
console.log(`status: ${size + 50000 <= TARGET_BYTES ? "FITS" : "OVER BUDGET"}`);
console.log(`meta: coordDecimals=${COORD_DECIMALS} blockBits=${BLOCK_BITS} useU32index=${useU32index}`);
