/**
 * verify-data.mjs — reusable data-integrity + known-IP spot-check runner
 * for WorldWideView data-layer plugins.
 *
 * Why this exists: the ip-geolocate v1.1.0 build hit a real integer-overflow
 * bug (Int32 wrap on block starts >= 2^31 scrambled the sort order and broke
 * binary search, returning nulls). That was caught only by hand-run spot
 * checks. This script makes the same checks automatic and FAIL CLOSED so a
 * broken data file can never ship again.
 *
 * HOW TO REUSE (see CONVENTION note for the full 5-8 line summary):
 *   1. Copy this file into <your-plugin>/scripts/verify-data.mjs.
 *   2. Edit ONLY the ADAPTER block below (marked "EDIT ME"):
 *        - dataPath : path to your data file (relative to this script)
 *        - decode() : parse the file into whatever structure you need
 *        - ranges() : expose { starts, ends, idx, n } for the generic
 *                     integrity checks (sorted, ends>=starts, idx bounds,
 *                     coverage). Return null/[] if N/A.
 *        - lookup() : resolve one input string -> country code or null
 *        - assertions : known-input -> expected-country spot checks
 *        - extraChecks() : optional schema-specific invariants
 *   3. Run: node scripts/verify-data.mjs   (exit 0 = PASS, exit 1 = FAIL)
 *
 * Generic core behavior (works for any plugin):
 *   - reads dataPath, JSON.parses it
 *   - verifies ranges are sorted ascending, ends >= starts, no loc index
 *     out-of-range, declared counts match decoded lengths, coverage > 0
 *   - reports (non-failing) overlap warnings
 *   - runs every known-input assertion, FAIL CLOSED on the first violation
 *   - prints a PASS summary listing every check it ran
 *
 * Extra argv (optional):
 *   node scripts/verify-data.mjs --check=1.2.3.4=US --check=10.0.0.1=null
 *   Appends/overrides assertions without editing the file.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// ╔══════════════════════════════════════════════════════════════════════╗
// ║ ADAPTER — EDIT ME for your plugin's data schema                      ║
// ╚══════════════════════════════════════════════════════════════════════╝
const ADAPTER = {
    name: "ip-geolocate",
    // data.json is bundled into the plugin (imported as ?raw in src/index.tsx);
    // path is relative to this script.
    dataPath: join(root, "data", "data.json"),

    /**
     * Decode the raw file text into a queryable structure.
     * Must be idempotent and cheap enough to call once per run.
     */
    decode(text) {
        const data = JSON.parse(text);

        // Little-endian typed-array decode — MUST mirror src/index.tsx decodeB64.
        const b64ToTyped = (b64, Ctor) => {
            const buf = Buffer.from(b64, "base64");
            const out = new Ctor(buf.length / Ctor.BYTES_PER_ELEMENT);
            const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
            for (let i = 0; i < out.length; i++) {
                const off = i * Ctor.BYTES_PER_ELEMENT;
                if (Ctor === Uint32Array) out[i] = dv.getUint32(off, true);
                else if (Ctor === Uint16Array) out[i] = dv.getUint16(off, true);
                else out[i] = dv.getFloat32(off, true);
            }
            return out;
        };

        return {
            data,
            countries: data.countries ?? [],
            locC: b64ToTyped(data.locs.c, Uint16Array),
            locOff: b64ToTyped(data.locs.off, Uint32Array),
            locY: b64ToTyped(data.locs.y, Float32Array),
            locX: b64ToTyped(data.locs.x, Float32Array),
            cityStr: data.locs.t ?? "",
            starts: b64ToTyped(data.ranges.s, Uint32Array),
            ends: b64ToTyped(data.ranges.e, Uint32Array),
            locIdx: data.ranges.u32
                ? b64ToTyped(data.ranges.i, Uint32Array)
                : b64ToTyped(data.ranges.i, Uint16Array),
            locCount: data.locs.n,
            rangeCount: data.ranges.n,
        };
    },

    /**
     * Expose the range table used by the generic integrity checks.
     * Return { starts, ends, idx, n }; throws/returns null if your schema
     * has no range table (generic checks are skipped).
     */
    ranges(dec) {
        return {
            starts: dec.starts,
            ends: dec.ends,
            idx: dec.locIdx,
            n: dec.rangeCount,
            // maxIndex: any idx[i] must satisfy 0 <= idx[i] < maxIndex
            maxIndex: dec.locCount,
        };
    },

    /**
     * Resolve an input string to a country code ('' if unknown) or null.
     * This is where plugins that look things up by name/lat/etc. adapt.
     */
    lookup(dec, input) {
        const target = ipToUint32(input);
        if (target === null || dec.starts.length === 0) return null;
        let lo = 0;
        let hi = dec.starts.length - 1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (dec.starts[mid] <= target) {
                if (target <= dec.ends[mid]) {
                    const li = dec.locIdx[mid];
                    return dec.countries[dec.locC[li]] ?? "";
                }
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return null;
    },

    /**
     * Known-input -> expected-country spot checks.
     * expect is a country code string, or null for "must NOT resolve".
     */
    assertions: [
        { input: "208.67.222.222", expect: "US", note: "OpenDNS public resolver" },
        { input: "217.65.192.5", expect: "RS", note: "server in Serbia" },
        { input: "8.8.8.8", expect: "US", note: "Google DNS (city may vary per dataset — assert country only)" },
        { input: "1.1.1.1", expect: "CN", note: "Cloudflare DNS, city-level dataset resolves to CN" },
        { input: "10.0.0.1", expect: null, note: "RFC1918 10/8" },
        { input: "172.16.0.1", expect: null, note: "RFC1918 172.16/12" },
        { input: "192.168.1.1", expect: null, note: "RFC1918 192.168/16" },
        { input: "127.0.0.1", expect: null, note: "loopback" },
        { input: "abc", expect: null, note: "malformed" },
        { input: "999.1.1.1", expect: null, note: "octet out of range" },
    ],

    /**
     * Optional schema-specific integrity checks. Return an array of
     * { ok, msg } lines (or throw; a throw counts as a FAIL).
     * Called after the generic checks, with the decoded structure.
     */
    extraChecks(dec) {
        const out = [];
        const { data, locC, locOff, locY, locX, cityStr, locIdx, locCount, rangeCount } = dec;
        out.push({
            ok: locC.length === locCount && locY.length === locCount && locX.length === locCount,
            msg: `loc scalar arrays match locs.n=${locCount} (c=${locC.length} y=${locY.length} x=${locX.length})`,
        });
        out.push({
            ok: locOff.length === locCount + 1,
            msg: `locOff length is locs.n+1 (${locOff.length} vs ${locCount + 1})`,
        });
        let offMonotonic = true;
        for (let i = 0; i < locCount; i++) {
            if (locOff[i] > locOff[i + 1]) { offMonotonic = false; break; }
        }
        out.push({ ok: offMonotonic, msg: "locOff offsets monotonic non-decreasing" });
        out.push({
            ok: locOff[locCount] === cityStr.length,
            msg: `locOff[n] === cities string length (${locOff[locCount]} vs ${cityStr.length})`,
        });
        let badCountryIdx = 0;
        for (let i = 0; i < locCount; i++) {
            if (locC[i] >= dec.countries.length) badCountryIdx++;
        }
        out.push({
            ok: badCountryIdx === 0,
            msg: `loc country indices within countries[] (${badCountryIdx} violations)`,
        });
        // Empty country among referenced locations: DB-IP always carries a code,
        // but some datasets legitimately use '' for "unknown" — WARN, don't fail.
        const referenced = new Set();
        for (let i = 0; i < rangeCount; i++) referenced.add(locIdx[i]);
        let emptyCountryLocs = 0;
        for (const li of referenced) {
            const ci = locC[li];
            if (ci >= dec.countries.length || !dec.countries[ci]) emptyCountryLocs++;
        }
        out.push({
            ok: true,
            warn: emptyCountryLocs > 0,
            msg: `referenced locations with empty/missing country: ${emptyCountryLocs} (of ${referenced.size})`,
        });
        return out;
    },
};
// ═══════════════════════════════════════════════════════════════════════

/** IPv4 string -> unsigned 32-bit integer; null when malformed/out-of-range. */
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

// ── Runner (generic — no edits needed below this line) ──────────────────
const out = [];
const failures = [];
let warns = 0;

function check(ok, msg, { warn = false } = {}) {
    out.push({ ok, warn, msg });
    if (!ok) {
        if (warn) warns++;
        else failures.push(msg);
    }
}

function fmtOk(ok, warn = false) {
    if (warn) return "WARN";
    return ok ? "PASS" : "FAIL";
}

function main() {
    // argv overrides: --check=<input>=<EXPECT>  (EXPECT = country code or "null")
    const extraChecks = [];
    for (const arg of process.argv.slice(2)) {
        if (arg.startsWith("--check=")) {
            const eq = arg.indexOf("=", 8);
            const body = arg.slice(8);
            const partEq = body.indexOf("=");
            if (partEq === -1) {
                failures.push(`bad --check arg (expected --check=<input>=<EXPECT>): ${arg}`);
            } else {
                const input = body.slice(0, partEq);
                const expectVal = body.slice(partEq + 1);
                const expect = expectVal === "null" ? null : expectVal;
                extraChecks.push({ input, expect, note: "argv override" });
            }
        } else {
            failures.push(`unknown argument: ${arg} (expected --check=<input>=<EXPECT>)`);
        }
    }

    if (!existsSync(ADAPTER.dataPath)) {
        failures.push(`data file not found: ${ADAPTER.dataPath}`);
        finish();
        return;
    }
    const bytes = readFileSync(ADAPTER.dataPath).byteLength;
    out.push({ ok: bytes > 0, warn: false, msg: `data file exists and is non-empty (${(bytes / 1024 / 1024).toFixed(2)} MB, ${bytes.toLocaleString()} bytes)` });

    let dec;
    try {
        dec = ADAPTER.decode(readFileSync(ADAPTER.dataPath, "utf8"));
    } catch (e) {
        failures.push(`failed to decode data: ${e.message}`);
        finish();
        return;
    }

    // ── generic integrity checks ──
    const r = ADAPTER.ranges(dec);
    if (r && r.n > 0) {
        const { starts, ends, idx, n } = r;
        const maxIndex = r.maxIndex ?? Infinity;
        check(starts.length === n && ends.length === n && idx.length === n,
            `declared range count n=${n} matches decoded lengths (s=${starts.length} e=${ends.length} i=${idx.length})`);

        let unsortedAt = -1;
        for (let i = 1; i < n; i++) {
            if (starts[i] < starts[i - 1]) { unsortedAt = i; break; }
        }
        check(unsortedAt === -1,
            unsortedAt === -1
                ? `ranges sorted ascending (${n.toLocaleString()})`
                : `ranges NOT sorted: first violation at index ${unsortedAt} (starts[${unsortedAt - 1}]=${starts[unsortedAt - 1]} > starts[${unsortedAt}]=${starts[unsortedAt]})`);

        let badEnd = 0, badIdx = 0, firstBadEnd = -1, firstBadIdx = -1;
        let overlaps = 0, firstOverlap = -1;
        for (let i = 0; i < n; i++) {
            if (ends[i] < starts[i]) { badEnd++; if (firstBadEnd === -1) firstBadEnd = i; }
            if (idx[i] >= maxIndex || idx[i] < 0) { badIdx++; if (firstBadIdx === -1) firstBadIdx = i; }
            if (i > 0 && starts[i] <= ends[i - 1]) { overlaps++; if (firstOverlap === -1) firstOverlap = i; }
        }
        check(badEnd === 0,
            badEnd === 0
                ? `ends >= starts for all ranges (0 violations)`
                : `ends < starts in ${badEnd} ranges (first at index ${firstBadEnd})`);
        check(badIdx === 0,
            badIdx === 0
                ? `loc indexes within bounds (0 violations, maxIndex=${maxIndex})`
                : `loc index out of range in ${badIdx} ranges (first at index ${firstBadIdx}, maxIndex=${maxIndex})`);
        // Overlaps are informational: some datasets legitimately let ranges
        // overlap with different locations (first-match wins). Not a fail.
        check(overlaps === 0, `${overlaps.toLocaleString()} overlapping range${overlaps === 1 ? "" : "s"} (different/any location)`, { warn: overlaps > 0 });
        if (overlaps > 0 && firstOverlap !== -1) {
            out.push({ ok: true, warn: true, msg: `  first overlap between ranges ${firstOverlap - 1} and ${firstOverlap}` });
        }

        const span = ends[n - 1] - starts[0] + 1;
        let gaps = 0, firstGapLen = 0;
        for (let i = 1; i < n; i++) {
            const gap = starts[i] - ends[i - 1] - 1;
            if (gap > 0) { gaps++; if (firstGapLen === 0) firstGapLen = gap; }
        }
        check(span > 0, `coverage: ${n.toLocaleString()} ranges span ${starts[0]} → ${ends[n - 1]} (${span.toLocaleString()} addresses, ${gaps} gap${gaps === 1 ? "" : "s"}, largest gap ${firstGapLen.toLocaleString()} addresses)`);
    } else {
        check(false, "no range table exposed by adapter (ranges() returned empty) — cannot run generic integrity checks");
    }

    // ── schema-specific checks ──
    if (ADAPTER.extraChecks) {
        try {
            for (const c of ADAPTER.extraChecks(dec)) {
                out.push({ ok: c.ok, warn: !!c.warn, msg: c.msg });
                if (!c.ok && !c.warn) failures.push(c.msg);
                else if (c.warn) warns++;
            }
        } catch (e) {
            failures.push(`extraChecks threw: ${e.message}`);
        }
    }

    // ── known-input spot checks ──
    const allAssertions = [...ADAPTER.assertions, ...extraChecks];
    for (const a of allAssertions) {
        let got;
        try {
            got = ADAPTER.lookup(dec, a.input);
        } catch (e) {
            got = `ERROR: ${e.message}`;
        }
        const expectDesc = a.expect === null ? "null" : a.expect;
        const gotDesc = got === null ? "null" : got;
        const ok = got === a.expect;
        check(ok, `"${a.input}" → ${gotDesc} (expected ${expectDesc})${a.note ? `  [${a.note}]` : ""}`);
    }

    finish();
}

function finish() {
    const T = ADAPTER.name;
    const width = 60;
    const line = "=".repeat(width);
    console.log(`\n${line}`);
    console.log(` verify-data: ${T}`);
    console.log(line);
    for (const c of out) {
        console.log(` [${fmtOk(c.ok, c.warn)}] ${c.msg}`);
    }
    console.log(line);
    const totalChecks = out.length;
    const passCount = out.filter((c) => c.ok && !c.warn).length;
    const failCount = out.filter((c) => !c.ok).length;
    if (failures.length === 0) {
        console.log(` RESULT: PASS — ${passCount}/${totalChecks} checks passed${warns ? `, ${warns} warning(s)` : ""}`);
    } else {
        console.log(` RESULT: FAIL — ${failures.length} failure(s), ${passCount}/${totalChecks} checks passed${warns ? `, ${warns} warning(s)` : ""}`);
        console.log(" FAIL ITEMS:");
        for (const f of failures) console.log(`   ✗ ${f}`);
    }
    console.log(`${line}\n`);
    process.exitCode = failures.length === 0 ? 0 : 1;
}

main();