#!/usr/bin/env node
/**
 * Generate the plugin catalog.
 *
 * The catalog is one JSON document listing every plugin directory in this
 * repository with the metadata a consumer needs to find it: the plugin id, the
 * npm package that carries the artifact, the version, the category, the declared
 * capabilities and the CI tier settings. It is deliberately NOT a second
 * registry - npm stays the artifact plane and the marketplace's signed registry
 * stays the trust plane. This is the rebuildable list both of those can be
 * reconciled against.
 *
 *   node scripts/catalog/generate-catalog.mjs                     # catalog/plugins.json
 *   node scripts/catalog/generate-catalog.mjs --out /tmp/any.json
 *
 * Output shape (the normative version is schema/plugin-catalog.schema.json, and
 * this script refuses to write a document that does not satisfy it):
 *
 *   {
 *     "schemaVersion": 1,
 *     "generatedFrom": {
 *       "repository": "silvertakana/wwv-plugins",
 *       "commit": "<sha>",
 *       "ref": "refs/heads/main",
 *       "generatedAt": "<commit date, ISO 8601>"   <- commit date, not wall clock
 *     },
 *     "pluginCount": 80,
 *     "plugins": [                                  <- sorted by id
 *       {
 *         "id": "airports",
 *         "dir": "wwv-plugin-airports",
 *         "npmPackage": "@worldwideview/wwv-plugin-airports",
 *         "version": "1.1.3",
 *         "description": "WorldWideView plugin - Airports and aerodromes worldwide from OSM",
 *         "category": "Aviation",
 *         "format": "bundle",
 *         "type": "data-layer",                     <- only when the manifest sets it
 *         "license": "ISC",
 *         "entry": "dist/frontend.mjs",
 *         "dataFile": "data/data.json",              <- only when the manifest sets it
 *         "capabilities": { "declared": ["layer"] },
 *         "ci": { "type": "ui" }                     <- bundleSizeLimitKb only when set
 *       }
 *     ]
 *   }
 *
 * Same commit in, byte-identical document out: generatedAt comes from the commit,
 * arrays are sorted, and no path outside the repository appears. That is what
 * makes the artifact diffable between runs.
 *
 * Manifests are validated against schema/plugin-manifest.schema.json on the way
 * through, so a catalog of broken manifests is never produced.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validate as validateSchema } from '../capabilities/schema.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const MANIFEST_SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, 'schema', 'plugin-manifest.schema.json'), 'utf8'));
const CATALOG_SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, 'schema', 'plugin-catalog.schema.json'), 'utf8'));

const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const outPath = outIndex >= 0 ? resolve(argv[outIndex + 1]) : join(REPO_ROOT, 'catalog', 'plugins.json');

function git(args, fallback) {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function firstSet(...values) {
  return values.find((value) => typeof value === 'string' && value.length > 0);
}

const generatedFrom = {
  repository: firstSet(process.env.GITHUB_REPOSITORY, git(['config', '--get', 'remote.origin.url'], ''), 'unknown'),
  commit: firstSet(process.env.GITHUB_SHA, git(['rev-parse', 'HEAD'], 'unknown')),
  ref: firstSet(process.env.GITHUB_REF, 'refs/heads/' + git(['rev-parse', '--abbrev-ref', 'HEAD'], 'unknown')),
  generatedAt: git(['log', '-1', '--format=%cI'], ''),
};

const plugins = [];
const problems = [];

for (const dir of readdirSync(REPO_ROOT).filter((name) => name.startsWith('wwv-plugin-')).sort()) {
  if (!statSync(join(REPO_ROOT, dir)).isDirectory()) continue;

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(REPO_ROOT, dir, 'package.json'), 'utf8'));
  } catch (error) {
    problems.push(dir + ': package.json is unreadable or not JSON: ' + error.message);
    continue;
  }

  const schemaErrors = validateSchema(manifest, MANIFEST_SCHEMA);
  if (schemaErrors.length > 0) {
    problems.push(dir + ': ' + schemaErrors.join('; '));
    continue;
  }

  const view = manifest.worldwideview;
  const entry = {
    id: view.id,
    dir,
    npmPackage: manifest.name,
    version: manifest.version,
    description: manifest.description ?? '',
    category: view.category,
    format: view.format,
    capabilities: { declared: [...view.capabilities].sort() },
  };
  if (typeof view.type === 'string') entry.type = view.type;
  if (typeof manifest.license === 'string') entry.license = manifest.license;
  if (typeof manifest.main === 'string') entry.entry = manifest.main;
  if (typeof view.dataFile === 'string') entry.dataFile = view.dataFile;
  if (view.ci !== undefined) {
    entry.ci = {};
    if (typeof view.ci.type === 'string') entry.ci.type = view.ci.type;
    if (Number.isInteger(view.ci.bundleSizeLimitKb)) entry.ci.bundleSizeLimitKb = view.ci.bundleSizeLimitKb;
  }

  plugins.push(entry);
}

if (problems.length > 0) {
  console.error('catalog: refusing to generate from invalid manifests:');
  for (const problem of problems) console.error('  ' + problem);
  process.exit(1);
}

const catalog = {
  schemaVersion: 1,
  generatedFrom,
  pluginCount: plugins.length,
  plugins: plugins.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
};

const catalogErrors = validateSchema(catalog, CATALOG_SCHEMA);
if (catalogErrors.length > 0) {
  console.error('catalog: generated document does not satisfy schema/plugin-catalog.schema.json:');
  for (const error of catalogErrors) console.error('  ' + error);
  process.exit(1);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');

console.log('catalog: wrote ' + outPath);
console.log('catalog: ' + catalog.pluginCount + ' plugin(s) from ' + generatedFrom.repository + '@' + generatedFrom.commit.slice(0, 12)
  + ' (' + generatedFrom.ref + ', generatedAt ' + generatedFrom.generatedAt + ')');
