import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.join(__dirname, '..', 'COMNAP_Facilities_Nov2024.csv');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'data.json');
const CSV_URL = 'https://www.comnap.aq/s/Facilities_Nov2024.csv';

function parseCSVLine(line) {
  const result = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cell);
      cell = '';
    } else {
      cell += c;
    }
  }
  result.push(cell);
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = fields[idx] ? fields[idx].trim() : '';
    });
    rows.push(row);
  }
  return rows;
}

async function fetchCSVWithRetry(url, retries = 2) {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      console.log(`Fetching CSV from ${url} (attempt ${attempt + 1})...`);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      return text;
    } catch (err) {
      attempt++;
      if (attempt > retries) {
        throw err;
      }
      console.warn(`Fetch failed: ${err.message}. Retrying...`);
    }
  }
}

async function build() {
  let csvText;
  try {
    csvText = await fetchCSVWithRetry(CSV_URL, 2);
    // Also save raw CSV locally
    fs.writeFileSync(CSV_PATH, csvText, 'utf8');
  } catch (err) {
    console.warn(`Could not fetch CSV from URL: ${err.message}. Falling back to local CSV file...`);
    if (fs.existsSync(CSV_PATH)) {
      csvText = fs.readFileSync(CSV_PATH, 'utf8');
    } else {
      console.error(`ERROR: Failed to fetch CSV from network after retries and no local fallback found.`);
      process.exit(1);
    }
  }

  const rows = parseCSV(csvText);
  const features = [];

  for (const row of rows) {
    const seasonality = row['Seasonality'] || '';
    const type = row['Type'] || '';
    const name = row['English Name'] || '';
    const country = row['Operator (primary)'] || '';
    const status = row['Status'] || '';
    const established = row['Year Established'] || '';
    const latStr = row['Latitude (DD)'] || '';
    const lonStr = row['Longitude (DD)'] || '';

    if (seasonality === 'Year-Round' && type === 'Station') {
      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      const id = 'antarctic-stations-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      features.push({
        type: 'Feature',
        id: id,
        geometry: {
          type: 'Point',
          coordinates: [lon, lat]
        },
        properties: {
          name: name,
          country: country,
          established: established,
          status: status
        }
      });
    }
  }

  const featureCollection = {
    type: 'FeatureCollection',
    features: features
  };

  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(featureCollection, null, 2), 'utf8');
  console.log(`Successfully generated ${features.length} features to ${OUTPUT_PATH}`);
}

build().catch(err => {
  console.error('Build script failed:', err);
  process.exit(1);
});
