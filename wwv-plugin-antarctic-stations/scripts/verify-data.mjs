import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, '..', 'data', 'data.json');

function verify() {
  console.log('--- Antarctic Stations Data Verification ---');
  
  // 1. Check file existence
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`FAIL: Data file not found at ${DATA_PATH}`);
    process.exit(1);
  }

  // 2. Size check <= 1 MB (1,048,576 bytes)
  const stats = fs.statSync(DATA_PATH);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(3);
  console.log(`File size: ${stats.size} bytes (${sizeMB} MB)`);
  if (stats.size > 1024 * 1024) {
    console.error(`FAIL: File size (${stats.size} bytes) exceeds 1 MB limit.`);
    process.exit(1);
  }

  // 3. Parse JSON
  let data;
  try {
    const content = fs.readFileSync(DATA_PATH, 'utf8');
    data = JSON.parse(content);
  } catch (err) {
    console.error(`FAIL: Could not parse JSON in ${DATA_PATH}: ${err.message}`);
    process.exit(1);
  }

  // 4. Validate FeatureCollection type
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    console.error(`FAIL: Root object is not a valid GeoJSON FeatureCollection.`);
    process.exit(1);
  }

  const features = data.features;
  console.log(`Feature count: ${features.length}`);

  // 5. Feature count check (>0, expected ~43)
  if (features.length === 0) {
    console.error(`FAIL: FeatureCollection has 0 features.`);
    process.exit(1);
  }

  const seenIds = new Set();
  let validCount = 0;

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    
    // Check Feature structure
    if (f.type !== 'Feature') {
      console.error(`FAIL: Feature [${i}] type is not 'Feature'.`);
      process.exit(1);
    }

    // Check ID uniqueness and existence
    if (!f.id) {
      console.error(`FAIL: Feature [${i}] missing 'id'.`);
      process.exit(1);
    }
    if (seenIds.has(f.id)) {
      console.error(`FAIL: Duplicate feature id '${f.id}' found at index ${i}.`);
      process.exit(1);
    }
    seenIds.add(f.id);

    // Check Geometry (Point, lon/lat bounds)
    if (!f.geometry || f.geometry.type !== 'Point' || !Array.isArray(f.geometry.coordinates)) {
      console.error(`FAIL: Feature [${f.id}] geometry is not a Point.`);
      process.exit(1);
    }

    const [lon, lat] = f.geometry.coordinates;
    if (typeof lon !== 'number' || typeof lat !== 'number' || isNaN(lon) || isNaN(lat)) {
      console.error(`FAIL: Feature [${f.id}] coordinates are invalid/non-numeric: [${lon}, ${lat}].`);
      process.exit(1);
    }

    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      console.error(`FAIL: Feature [${f.id}] coordinates out of bounds: lon=${lon}, lat=${lat}.`);
      process.exit(1);
    }

    // Check required properties (name and country)
    if (!f.properties || typeof f.properties !== 'object') {
      console.error(`FAIL: Feature [${f.id}] missing properties object.`);
      process.exit(1);
    }

    if (!f.properties.name || typeof f.properties.name !== 'string' || f.properties.name.trim() === '') {
      console.error(`FAIL: Feature [${f.id}] missing required property 'name'.`);
      process.exit(1);
    }

    if (!f.properties.country || typeof f.properties.country !== 'string' || f.properties.country.trim() === '') {
      console.error(`FAIL: Feature [${f.id}] missing required property 'country'.`);
      process.exit(1);
    }

    validCount++;
  }

  console.log(`Validation passed: ${validCount} valid features verified.`);
  console.log('PASS: All fail-closed validation checks succeeded.');
  process.exit(0);
}

verify();
