import { readFileSync, statSync } from 'fs';
function fail(msg){ console.error('FAIL:',msg); process.exit(1); }
const dataPath = 'C:/dev/wwv/temp/batch-mass-2026-08-30/data/earth-impact-craters/data/data.json';
let raw;
try { raw = JSON.parse(readFileSync(dataPath,'utf8')); } catch(e){ fail('Invalid JSON'); }
if (raw.type !== 'FeatureCollection') fail('Root type not FeatureCollection');
if (!Array.isArray(raw.features)) fail('features not array');
if (raw.features.length === 0) fail('No features');
const ids = new Set();
for (const f of raw.features){
  if (f.type !== 'Feature') fail('Non-Feature element');
  if (!f.geometry || f.geometry.type !== 'Point') fail('Invalid geometry');
  if (!f.id) fail('Missing id');
  if (ids.has(f.id)) fail('Duplicate id '+f.id);
  ids.add(f.id);
  const props = f.properties || {};
  if (!props.name) fail('Missing name');
}
const stats = statSync(dataPath);
if (stats.size > 1024*1024) fail('File >1MB');
console.log('PASS: verified', raw.features.length, 'features, size', stats.size, 'bytes');
process.exit(0);
