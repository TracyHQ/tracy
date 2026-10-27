// The seam's default: a gateway built without naming a policy runs the Tracy layer (slice.test.ts
// proves it end to end), and only the upstream-suite preload can swap that default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolvePolicy, tracyPolicy } from '../../src/tracy/index.js';
import { projectRoot } from './cli-fixture.js';

test('seam: the process default policy is the Tracy policy', () => {
  assert.equal(resolvePolicy(), tracyPolicy);
  assert.equal(resolvePolicy().name, 'tracy');
});

test('seam: nothing under src/ imports the pass-through preload or swaps the default', () => {
  const srcRoot = path.join(projectRoot, 'src');
  const offenders: string[] = [];
  for (const entry of readdirSync(srcRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(ts|tsx|js|mjs)$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(srcRoot, file);
    const source = readFileSync(file, 'utf8');
    if (/(?:from\s*|import\s*\(?\s*)['"][^'"]*upstream-policy-preload/.test(source)) offenders.push(`${relative}: imports the preload`);
    if (relative !== path.join('tracy', 'index.ts') && source.includes('replaceDefaultPolicyForUpstreamTests')) {
      offenders.push(`${relative}: swaps the default policy`);
    }
  }
  assert.deepEqual(offenders, []);
});
