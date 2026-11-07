#!/usr/bin/env node
/**
 * Validate every plugin manifest against schema/plugin-manifest.schema.json and
 * check that each plugin's declared capabilities match what it is observed
 * doing. Run by .github/workflows/capabilities.yml; also runnable by hand:
 *
 *   node scripts/capabilities/validate.mjs            # whole fleet
 *   node scripts/capabilities/validate.mjs --plugin wwv-plugin-airports
 *   node scripts/capabilities/validate.mjs --json
 *
 * Exit code 0 = every manifest is valid, everything declared is used, and
 * everything used is declared.
 *
 * Why there is a grandfather list
 * -------------------------------
 * The fleet's declarations predate this check and almost none of them match
 * observed behaviour. Rewriting 80 manifests inside the PR that introduces the
 * check would make the check unreviewable, and generating them from detection
 * would write claims the detectors cannot actually see (a plugin that inherits
 * getLayerConfig from a base class in an npm library has no getLayerConfig in
 * its own source). So today's entries are recorded in
 * schema/capabilities-baseline.json and the rules below keep the file honest:
 *
 *   - a plugin NOT in the baseline must be consistent, both directions;
 *   - a plugin IN the baseline passes only while its declared set is unchanged;
 *   - changing a grandfathered plugin's declared set means making it consistent
 *     and then deleting its baseline entry;
 *   - a baseline entry for a plugin that is now consistent, or for a plugin that
 *     no longer exists, is an error, so the file can only ever shrink.
 *
 * Widening the list is possible with --update-baseline, and it shows up in the
 * PR diff, which is the point.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DETECTORS, detect, diff, sameSet } from './detect.mjs';
import { validate as validateSchema } from './schema.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SCHEMA_PATH = join(REPO_ROOT, 'schema', 'plugin-manifest.schema.json');
const BASELINE_PATH = join(REPO_ROOT, 'schema', 'capabilities-baseline.json');

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
const pluginArgs = [];
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === '--plugin') pluginArgs.push(argv[index + 1]);
}

const asJson = flags.has('--json');
const updateBaseline = flags.has('--update-baseline');
const quiet = flags.has('--quiet');

function die(message) {
  console.error('capabilities: ' + message);
  process.exit(2);
}

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const vocabulary = schema.$defs.capability.enum;
const detectorIds = Object.keys(DETECTORS).sort();

const missingDetector = vocabulary.filter((capability) => !detectorIds.includes(capability));
const unknownDetector = detectorIds.filter((capability) => !vocabulary.includes(capability));
if (missingDetector.length > 0 || unknownDetector.length > 0) {
  die(
    'schema/plugin-manifest.schema.json and scripts/capabilities/detect.mjs disagree. '
    + 'In the schema but not detected: [' + missingDetector.join(', ') + ']. '
    + 'Detected but not in the schema: [' + unknownDetector.join(', ') + ']. '
    + 'A capability is only meaningful if both halves exist.',
  );
}

let baseline = { version: 1, plugins: {} };
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') die('cannot read ' + BASELINE_PATH + ': ' + error.message);
}

const allPlugins = readdirSync(REPO_ROOT)
  .filter((name) => name.startsWith('wwv-plugin-') && statSync(join(REPO_ROOT, name)).isDirectory())
  .sort();

const targets = pluginArgs.length > 0 ? pluginArgs : allPlugins;
const results = [];
const failures = [];

for (const name of targets) {
  const pluginDir = join(REPO_ROOT, name);
  if (!statSync(pluginDir, { throwIfNoEntry: false })?.isDirectory()) {
    failures.push({ plugin: name, problems: ['not a plugin directory at the repository root'] });
    continue;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'));
  } catch (error) {
    failures.push({ plugin: name, problems: ['package.json is unreadable or not JSON: ' + error.message] });
    continue;
  }

  // Schema problems are hard failures and are never grandfathered.
  const schemaProblems = validateSchema(manifest, schema).concat(
    (manifest.worldwideview?.capabilities ?? [])
      .filter((capability) => !vocabulary.includes(capability))
      .map((capability) => '$.worldwideview.capabilities: "' + capability + '" is not a known capability. Known: ' + vocabulary.join(', ')),
  );

  const { declared, observed, evidence } = detect(pluginDir, manifest);
  const { overDeclared, undeclared } = diff(declared, observed);
  const consistent = overDeclared.length === 0 && undeclared.length === 0;
  const entry = baseline.plugins?.[name];

  const problems = [...schemaProblems];
  let grandfathered = false;

  if (schemaProblems.length === 0) {
    if (!consistent) {
      if (!entry) {
        for (const capability of overDeclared) {
          problems.push(
            'declares "' + capability + '" but no source in the plugin does it '
            + '(' + (DETECTORS[capability]?.what ?? 'no detector') + '). Either drop the claim, '
            + 'or - if the behaviour really is there and detection cannot see it - teach '
            + 'scripts/capabilities/detect.mjs the signal.',
          );
        }
        for (const capability of undeclared) {
          problems.push(
            'uses "' + capability + '" (' + (evidence[capability] ?? 'detected') + ') but does not declare it.',
          );
        }
      } else if (!sameSet(declared, entry.declared ?? [])) {
        problems.push(
          'declared capabilities changed and are still inconsistent: over-declared ['
          + overDeclared.join(', ') + '], undeclared [' + undeclared.join(', ')
          + ']. A grandfathered plugin may only change its declaration by becoming consistent, '
          + 'and its schema/capabilities-baseline.json entry must then be deleted.',
        );
      } else {
        grandfathered = true;
      }
    } else if (entry) {
      problems.push(
        'is consistent now, so its schema/capabilities-baseline.json entry is stale. Delete the entry - the list only shrinks.',
      );
    }
  }

  const result = {
    plugin: name,
    declared,
    observed,
    overDeclared,
    undeclared,
    evidence,
    grandfathered,
    consistent,
    status: problems.length > 0 ? 'fail' : grandfathered ? 'grandfathered' : 'consistent',
  };

  if (problems.length > 0) failures.push({ plugin: name, problems, detail: result });
  results.push(result);
}

if (pluginArgs.length === 0) {
  const existing = new Set(allPlugins);
  for (const name of Object.keys(baseline.plugins ?? {})) {
    if (!existing.has(name)) {
      failures.push({
        plugin: name,
        problems: ['schema/capabilities-baseline.json still lists this plugin, but no such directory exists'],
      });
    }
  }
}

if (updateBaseline) {
  const schemaFailures = failures.filter((failure) =>
    failure.problems.some((problem) => problem.includes('$.') || problem.includes('unexpected property')));
  if (schemaFailures.length > 0) {
    for (const failure of schemaFailures) {
      console.error(failure.plugin + ': ' + failure.problems.join('; '));
    }
    die('refusing to write a baseline while manifests are schema-invalid. Fix those first.');
  }
  const plugins = {};
  for (const result of results) {
    if (!result.consistent) plugins[result.plugin] = { declared: [...result.declared].sort() };
  }
  const next = {
    $comment: 'Grandfathered capability declarations. See scripts/capabilities/validate.mjs for the rules. This list may only shrink: each entry is a plugin whose manifest claims something its code does not show, or the reverse. Delete an entry when the plugin becomes consistent; never add one without a reviewer noticing.',
    version: 1,
    plugins,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  if (!quiet) console.log('wrote ' + BASELINE_PATH + ' (' + Object.keys(plugins).length + ' grandfathered plugin(s))');
  process.exit(0);
}

if (asJson) {
  console.log(JSON.stringify({ ok: failures.length === 0, scanned: results.length, failures, results }, null, 2));
} else if (!quiet) {
  for (const result of results) {
    if (result.status === 'fail') continue;
    console.log(
      '  ' + result.status.padEnd(14) + result.plugin.padEnd(34)
      + 'declared=[' + result.declared.join(',') + '] observed=[' + result.observed.join(',') + ']',
    );
  }
  const consistent = results.filter((result) => result.status === 'consistent').length;
  const grandfathered = results.filter((result) => result.status === 'grandfathered').length;
  console.log('');
  console.log('  scanned ' + results.length + ', consistent ' + consistent
    + ', grandfathered ' + grandfathered + ', failed ' + failures.length);
}

if (failures.length > 0) {
  if (!asJson) {
    console.error('');
    console.error('Capability check failed:');
    for (const failure of failures) {
      console.error('  ' + failure.plugin);
      for (const problem of failure.problems) console.error('    - ' + problem);
    }
    console.error('');
    console.error('A capability has to be true in both directions: declared means used, and used means declared.');
  }
  process.exit(1);
}

if (!asJson && !quiet) console.log('\nCapability check passed.');
