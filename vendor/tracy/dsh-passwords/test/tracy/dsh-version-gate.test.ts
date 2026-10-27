// H9 DSH version gate (a new invariant, no id in the 83-row table). Upstream 2.7.7 accepts only
// the DSH 0.2.1 patch line (exit 37 otherwise). Tracy runs its own DSH fork on the 0.2.0
// release-candidate line, published as `0.2.0-rc.<n>-tracy.<m>`; that identity, and only that
// one, also clears the gate. Plain upstream 0.2.0 builds stay refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isTracyDshRuntime } from '../../src/tracy/dsh-runtime.js';
import { makeDshRoot, startGateway, writeConfig } from './cli-fixture.js';

const accepted = ['0.2.0-rc.2-tracy.22', '0.2.0-rc.2-tracy.1', '0.2.0-rc.10-tracy.0', '0.2.0-rc.2-tracy.22+build.5'];
const refused = [
  '0.2.0-rc.2', '0.2.0', '0.2.0-tracy.22', '0.2.0-rc.2-tracy', '0.2.0-rc.2-tracy.22.1', '0.2.0-rc.2-tracyx.1',
  '0.2.0-rc.2-tracy.022', '0.2.0-rc.02-tracy.1', '0.2.0-alpha.1-tracy.1', '0.1.7-rc.2-tracy.1', '0.2.2-rc.1-tracy.1',
  '0.3.0-rc.2-tracy.1', 'v0.2.0-rc.2-tracy.22',
];

test('H9 dsh version: the Tracy DSH identity is exactly 0.2.0-rc.<n>-tracy.<m>', () => {
  for (const version of accepted) assert.equal(isTracyDshRuntime(version), true, version);
  for (const version of refused) assert.equal(isTracyDshRuntime(version), false, version);
});

function gateStatus(version: string): { status: number | null; stderr: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-dsh-gate-'));
  try {
    const result = startGateway(writeConfig(root, makeDshRoot(root, version)));
    return { status: result.status, stderr: result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('H9 dsh version: serve-gateway lets the Tracy DSH fork through the version gate', () => {
  for (const version of ['0.2.0-rc.2-tracy.22', '0.2.0-rc.2-tracy.22+build.5']) {
    const { status, stderr } = gateStatus(version);
    // Past the identity gate the fixture stops at the missing Cookie bridge (33), not at 37.
    assert.equal(status, 33, `${version}: ${stderr}`);
    assert.doesNotMatch(stderr, /Unsupported or invalid DSH version/i, version);
  }
});

test('H9 dsh version: serve-gateway still refuses upstream 0.2.0 builds and near-miss Tracy identities (37)', () => {
  for (const version of ['0.2.0-rc.2', '0.2.0-tracy.22', '0.2.0-rc.2-tracy']) {
    const { status, stderr } = gateStatus(version);
    assert.equal(status, 37, `${version}: ${stderr}`);
    assert.match(stderr, /Unsupported or invalid DSH version/i, version);
  }
});
