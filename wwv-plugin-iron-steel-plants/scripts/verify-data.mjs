#!/usr/bin/env node
// Fail-closed verifier for the iron-steel-plants static data bundle.
// Exits 0 with a final line starting "PASS" when every check holds; exits 1 otherwise.
// Checks:
//   - data.json exists, is valid JSON, UTF-8 (no BOM), no NaN/Infinity (JSON.parse rejects those anyway)
//   - parses as a GeoJSON FeatureCollection
//   - feature count > 0
//   - every feature: type "Feature", geometry type "Point", numeric [lon, lat] in bounds
//   - every feature: properties.name is a non-empty string, properties.id is a non-empty unique string
//   - feature-level id matches properties.id (no duplicate feature ids)
//   - total file size < 10240 KB (10 MB)
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "data.json");
const MAX_KB = 10240;

const failures = [];
let featureCount = 0;

function fail(msg) {
  failures.push(msg);
}

try {
  const stat = statSync(DATA_PATH);
  const sizeKB = stat.size / 1024;
  if (stat.size >= MAX_KB * 1024) {
    fail(`file size ${sizeKB.toFixed(1)} KB exceeds the ${MAX_KB} KB limit`);
  }

  const raw = readFileSync(DATA_PATH, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    fail("file starts with a UTF-8 BOM");
  }
  if (raw.includes("NaN") || raw.includes("Infinity")) {
    fail("file contains NaN or Infinity literals");
  }

  let fc;
  try {
    fc = JSON.parse(raw);
  } catch (err) {
    fail(`data.json is not valid JSON: ${err.message}`);
  }

  if (failures.length === 0) {
    if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
      fail("root is not a GeoJSON FeatureCollection");
    } else {
      featureCount = fc.features.length;
      if (featureCount === 0) {
        fail("FeatureCollection has no features");
      }

      const seenIds = new Set();
      fc.features.forEach((f, i) => {
        const where = `feature[${i}]`;
        if (!f || typeof f !== "object" || f.type !== "Feature") {
          fail(`${where}: not a Feature`);
          return;
        }
        if (!f.geometry || f.geometry.type !== "Point") {
          fail(`${where}: geometry is not a Point`);
        } else {
          const c = f.geometry.coordinates;
          if (!Array.isArray(c) || c.length < 2) {
            fail(`${where}: coordinates are not a [lon, lat] pair`);
          } else {
            const [lon, lat] = c;
            if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
              fail(`${where}: coordinates are not finite numbers`);
            } else if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
              fail(`${where}: coordinates out of bounds (lon=${lon}, lat=${lat})`);
            }
          }
        }
        const p = f.properties;
        if (!p || typeof p !== "object") {
          fail(`${where}: missing properties`);
          return;
        }
        if (typeof p.name !== "string" || p.name.trim() === "") {
          fail(`${where}: missing required non-empty properties.name`);
        }
        if (typeof p.id !== "string" || p.id.trim() === "") {
          fail(`${where}: missing required properties.id`);
        } else {
          if (seenIds.has(p.id)) {
            fail(`${where}: duplicate properties.id "${p.id}"`);
          }
          seenIds.add(p.id);
          if (f.id !== undefined && String(f.id) !== p.id) {
            fail(`${where}: feature id "${f.id}" does not match properties.id "${p.id}"`);
          }
        }
      });
    }
  }
} catch (err) {
  fail(`unexpected error: ${err.message}`);
}

if (failures.length > 0) {
  console.error("FAIL");
  failures.slice(0, 25).forEach((m) => console.error(`  - ${m}`));
  if (failures.length > 25) {
    console.error(`  ... and ${failures.length - 25} more`);
  }
  process.exit(1);
}

const sizeKB = statSync(DATA_PATH).size / 1024;
console.log(`PASS: ${featureCount} features, ${sizeKB.toFixed(1)} KB, under ${MAX_KB} KB limit`);
process.exit(0);
