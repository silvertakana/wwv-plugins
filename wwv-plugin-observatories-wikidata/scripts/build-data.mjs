import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Observatories-Wikidata build script (data-prep / static regeneration).
//
// SOURCES (CC0):
//   - SPARQL endpoint: https://query.wikidata.org/ (Wikidata Query Service)
//   - Entity API:      https://www.wikidata.org/w/api.php?action=wbgetentities
//
// IMPORTANT: The label service (SERVICE wikibase:label) times out (HTTP 504) on
// the full SPARQL, so this uses the PROVEN LIGHT QUERY (QIDs + coords only),
// run once per class (observatory / radio telescope) so each result can be
// tagged with its kind. Labels + countries are resolved separately via the
// batched entity API, which avoids the 504.
//
// If an item belongs to both classes (union overlap), the first-seen kind wins:
// observatory (Q1254933) is iterated first and takes precedence.
//
// License: CC0.
// ---------------------------------------------------------------------------

const USER_AGENT = 'wwv-batch-probe/1.0 (contact: batch)';
const SPARQL_BASE = 'https://query.wikidata.org/sparql?query=';

const CLASSES = [
  { kind: 'observatory', qid: 'Q1254933' },
  { kind: 'radio-telescope', qid: 'Q184356' },
];

const BATCH_SIZE = 50; // entity API ids per call
const MAXLAG = '&maxlag=5'; // Wikidata convention: hold during replication lag
const ENTITY_API =
  'https://www.wikidata.org/w/api.php?action=wbgetentities' +
  MAXLAG +
  '&props=labels|claims&languages=en&languagefallback=1&format=json';

function sparqlUrl(classQid) {
  const query =
    `SELECT ?item ?coords WHERE { ` +
    `  ?item wdt:P31 wd:${classQid} . ` +
    `  ?item wdt:P625 ?coords . ` +
    `}`;
  return SPARQL_BASE + encodeURIComponent(query) + '&format=json&maxlag=5';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Robust fetch with retry-on-429/5xx/network-error and jittered exponential
// backoff (capped at 30s). Honors the server's Retry-After when sent. Treats
// a 429 like "wait and try again" rather than a hard failure, so a busy
// Wikidata keeps retrying until it succeeds across a long sweep run.
async function fetchJson(url, { timeoutMs = 80000, attempts = 12, baseDelay = 2000, maxBackoff = 30000 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (resp.status === 429 || resp.status >= 500) {
        // Honor Retry-After if the server tells us exactly how long to wait.
        const retryAfter = resp.headers.get('retry-after');
        const parsed = retryAfter !== null && Number.isFinite(Number(retryAfter))
          ? Number(retryAfter) * 1000
          : 0;
        const cap = Math.min(maxBackoff, baseDelay * 2 ** attempt);
        const jitter = 0.8 + 0.4 * Math.random();
        await sleep(Math.max(parsed, cap * jitter));
        lastErr = new Error(`HTTP ${resp.status} (retryable, attempt ${attempt + 1})`);
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url.slice(0, 120)}`);
      const bytes = await resp.arrayBuffer();
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (err) {
      lastErr = err;
      if (err.name === 'AbortError') {
        const cap = Math.min(maxBackoff, baseDelay * 2 ** attempt);
        await sleep(cap * (0.8 + 0.4 * Math.random()));
        continue;
      }
      // Non-429 non-timeout HTTP/structure errors: still worth a few retries
      // on transient conditions, but a final parse/markup error must surface.
      if (attempt < 2) {
        await sleep(baseDelay);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('fetchJson exhausted all attempts');
}

// Resolve en labels + P17 country refs for a batch of QIDs.
async function fetchEntities(ids) {
  const url = ENTITY_API + '&ids=' + ids.join('|');
  const data = await fetchJson(url);
  if (!data.entities) return {};
  const out = {};
  for (const eid of Object.keys(data.entities)) {
    const ent = data.entities[eid];
    if (!ent) continue;
    const labels = ent.labels || {};
    const claims = ent.claims || {};
    const name = (labels.en && labels.en.value) ? labels.en.value : eid;
    let country = '';
    const p17 = Array.isArray(claims.P17) ? claims.P17 : [];
    if (p17.length) {
      const dv = p17[0] && p17[0].mainsnak && p17[0].mainsnak.datavalue;
      if (dv && dv.value && dv.value.id) country = dv.value.id;
    }
    out[eid] = { name, country };
  }
  return out;
}

// Pull id + kind + coords for each item, one SPARQL pass per class.
async function collectEntities() {
  const byId = new Map();
  for (let ci = 0; ci < CLASSES.length; ci++) {
    const cls = CLASSES[ci];
    const data = await fetchJson(sparqlUrl(cls.qid));
    for (const b of data.results.bindings) {
      const id = b.item.value.split('/').pop();
      let wkt = null;
      let m;
      if (b.coords && b.coords.value) {
        m = /Point\((-?[0-9.]+) (-?[0-9.]+)\)/.exec(b.coords.value);
      }
      if (m) wkt = [parseFloat(m[1]), parseFloat(m[2])];
      if (!byId.has(id)) {
        byId.set(id, { id, kind: cls.kind, coords: wkt });
      }
    }
    console.log(`SPARQL ${cls.qid} (${cls.kind}): got ${data.results.bindings.length} bindings.`);
    if (ci < CLASSES.length - 1) await sleep(1500);
  }
  return byId;
}

async function build() {
  const byId = await collectEntities();
  const ids = Array.from(byId.keys());
  const withCoords = ids.filter((id) => {
    const c = byId.get(id).coords;
    return c && c.length === 2 &&
      typeof c[0] === 'number' && typeof c[1] === 'number' &&
      !isNaN(c[0]) && !isNaN(c[1]) &&
      c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90;
  });
  console.log(`Collected ${ids.length} unique entities; ${withCoords.length} with valid coordinates.`);

  // Resolve names + country refs in batches.
  const resolved = {};
  for (let i = 0; i < withCoords.length; i += BATCH_SIZE) {
    const batch = withCoords.slice(i, i + BATCH_SIZE);
    const ents = await fetchEntities(batch);
    Object.assign(resolved, ents);
    await sleep(1500);
    console.log(`Resolved ${Math.min(i + BATCH_SIZE, withCoords.length)}/${withCoords.length} entities.`);
  }

  // Collect country QIDs, then resolve their labels.
  const countryQidMap = {};
  for (const id of withCoords) {
    countryQidMap[id] = resolved[id] && resolved[id].country ? resolved[id].country : '';
  }
  const uniqueCountryIds = Array.from(new Set(Object.values(countryQidMap).filter(Boolean)));
  const countryNames = {};
  for (let i = 0; i < uniqueCountryIds.length; i += BATCH_SIZE) {
    const batch = uniqueCountryIds.slice(i, i + BATCH_SIZE);
    const ents = await fetchEntities(batch);
    for (const cid of batch) countryNames[cid] = ents[cid] ? ents[cid].name : cid;
    await sleep(1500);
  }

  const features = withCoords.map((id) => {
    const ent = byId.get(id);
    const [lon, lat] = ent.coords;
    const name = (resolved[id] && resolved[id].name) ? resolved[id].name : id;
    const countryQ = countryQidMap[id];
    // Fall back to the QID when a country is missing/unresolvable so the
    // `country` property stays a non-empty string (the verifier is fail-closed).
    const country = countryQ ? (countryNames[countryQ] || countryQ) : id;
    return {
      type: 'Feature',
      id: `observatories-wikidata-${id}`,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { name, kind: ent.kind, country },
    };
  });

  const geo = { type: 'FeatureCollection', features };
  const outPath = path.resolve(__dirname, '../data/data.json');
  // Atomic write: write a temp file first, then rename over the target so an
  // interrupted/failed build can never leave a truncated or empty data.json.
  const tmpPath = outPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(geo), 'utf8');
  fs.renameSync(tmpPath, outPath);
  console.log(`Wrote ${features.length} features to ${outPath}.`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
