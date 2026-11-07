#!/usr/bin/env node
/**
 * Self-test for the capability checker: proves that the CLI accepts a plugin
 * whose declaration is true and rejects the three ways a declaration can be
 * wrong. Runs in CI before the fleet-wide check, so a broken checker cannot
 * pass by failing everything, or pass by failing nothing.
 *
 *   node scripts/capabilities/self-test.mjs
 */

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VALIDATE = join(HERE, 'validate.mjs');
const FIXTURES = 'scripts/capabilities/fixtures';

const CASES = [
  {
    name: 'consistent',
    why: 'declares globe:overlay, layer and network:fetch, and its source does all three',
    expectExit: 0,
    expectOutput: ['Capability check passed.'],
  },
  {
    name: 'over-declared',
    why: 'declares ui:sidebar and nothing in its source contributes one',
    expectExit: 1,
    expectOutput: ['declares "ui:sidebar" but no source in the plugin does it'],
  },
  {
    name: 'undeclared',
    why: 'calls globalThis.fetch() but only declares layer',
    expectExit: 1,
    expectOutput: ['uses "network:fetch"', 'but does not declare it'],
  },
  {
    name: 'invalid-manifest',
    why: 'capabilities contains an unknown id and a duplicate, and icon/category requirements are unmet',
    expectExit: 1,
    expectOutput: ['is not one of', 'duplicate of', 'missing required property "icon"'],
  },
];

let failed = 0;
console.log('capability check self-test');

for (const testCase of CASES) {
  const result = spawnSync(
    process.execPath,
    [VALIDATE, '--plugin', FIXTURES + '/' + testCase.name],
    { cwd: resolve(HERE, '..', '..'), encoding: 'utf8' },
  );
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  const problems = [];

  if (result.status !== testCase.expectExit) {
    problems.push('exit ' + result.status + ', expected ' + testCase.expectExit);
  }
  for (const needle of testCase.expectOutput) {
    if (!output.includes(needle)) problems.push('output is missing: ' + needle);
  }

  if (problems.length === 0) {
    console.log('  PASS  ' + testCase.name.padEnd(17) + testCase.why);
  } else {
    failed += 1;
    console.log('  FAIL  ' + testCase.name.padEnd(17) + testCase.why);
    for (const problem of problems) console.log('        ' + problem);
    console.log(output.split('\n').map((line) => '        | ' + line).join('\n'));
  }
}

console.log('');
if (failed > 0) {
  console.log(failed + ' of ' + CASES.length + ' self-test case(s) failed - the checker itself is wrong, not the fleet.');
  process.exit(1);
}
console.log(CASES.length + ' of ' + CASES.length + ' self-test cases passed.');
