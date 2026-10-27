// H9 fleet guard (a new invariant, no id in the 83-row table). With MCP_TRACY_FLEET=1 the
// gateway refuses to start (exit 38, before any database or listener) unless the Tracy policy is
// the one plugged in and the seat secret, the DSH root and the public host are set. Without the
// flag nothing changes. The public host is the Origin the gateway accepts writes from: 2.7.7 trusts
// X-Forwarded-Host from loopback only, so behind cloudflared every write is 403 without it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tracyPolicy, type TracyPolicy } from '../../src/tracy/index.js';
import { EXIT_TRACY_FLEET_GUARD, tracyFleetStartupProblem } from '../../src/tracy/fleet-guard.js';
import { isPermanentGatewayExitCode } from '../../src/plugin.js';
import { makeDshRoot, startGateway, writeConfig } from './cli-fixture.js';

const fleetEnv = { MCP_TRACY_FLEET: '1', MCP_SEAT_SECRET: 'seat-secret', MCP_DSH_ROOT: '/opt/dsh' };
const otherPolicy: TracyPolicy = { ...tracyPolicy, name: 'other' };

test('H9 fleet guard: without MCP_TRACY_FLEET the guard never objects', () => {
  assert.equal(tracyFleetStartupProblem({}, otherPolicy), null);
  assert.equal(tracyFleetStartupProblem({ MCP_TRACY_FLEET: '0' }, otherPolicy), null);
});

test('H9 fleet guard: a fleet gateway with the Tracy policy, seat secret and DSH root starts', () => {
  assert.equal(tracyFleetStartupProblem(fleetEnv, tracyPolicy), null);
});

test('H9 fleet guard: a fleet gateway refuses any policy but the Tracy one', () => {
  assert.match(tracyFleetStartupProblem(fleetEnv, otherPolicy) ?? '', /policy.*other/i);
});

test('H9 fleet guard: a fleet gateway refuses a missing or blank MCP_SEAT_SECRET', () => {
  for (const value of [undefined, '', '   ']) {
    assert.match(tracyFleetStartupProblem({ ...fleetEnv, MCP_SEAT_SECRET: value }, tracyPolicy) ?? '', /MCP_SEAT_SECRET/);
  }
});

test('H9 fleet guard: a fleet gateway refuses a missing or blank MCP_DSH_ROOT', () => {
  for (const value of [undefined, '', '  ']) {
    assert.match(tracyFleetStartupProblem({ ...fleetEnv, MCP_DSH_ROOT: value }, tracyPolicy) ?? '', /MCP_DSH_ROOT/);
  }
});

test('H9 fleet guard: no public host is required (tracy-web strips Origin before the gateway)', () => {
  for (const value of [undefined, '', '  ']) {
    assert.equal(tracyFleetStartupProblem({ ...fleetEnv, MCP_GATEWAY_PUBLIC_HOST: value }, tracyPolicy), null);
  }
});

test('H9 fleet guard: the plugin treats the fleet guard exit as permanent (no restart loop)', () => {
  assert.equal(EXIT_TRACY_FLEET_GUARD, 38);
  assert.equal(isPermanentGatewayExitCode(EXIT_TRACY_FLEET_GUARD), true);
});

test('H9 fleet guard: serve-gateway on the fleet exits 38 before opening the database when a secret or root is missing', () => {
  const cases: Array<{ name: string; env: Record<string, string>; config: Record<string, string | undefined>; message: RegExp }> = [
    { name: 'no seat secret', env: { MCP_TRACY_FLEET: '1' }, config: {}, message: /MCP_SEAT_SECRET/ },
    { name: 'no DSH root', env: { MCP_TRACY_FLEET: '1', MCP_SEAT_SECRET: 's' }, config: { MCP_DSH_ROOT: undefined }, message: /MCP_DSH_ROOT/ },
  ];
  for (const c of cases) {
    const root = mkdtempSync(path.join(tmpdir(), 'tracy-fleet-guard-'));
    try {
      const envFile = writeConfig(root, makeDshRoot(root, '0.2.1-alpha.1'), c.config);
      const result = startGateway(envFile, c.env);
      assert.equal(result.status, 38, `${c.name}: ${result.stdout}\n${result.stderr}`);
      assert.match(result.stderr, c.message, c.name);
      assert.equal(existsSync(path.join(root, 'gateway.db')), false, `${c.name}: no database before the guard`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('H9 fleet guard: serve-gateway passes the guard when the fleet is fully configured, and without the flag', () => {
  for (const env of [{ MCP_TRACY_FLEET: '1', MCP_SEAT_SECRET: 's' }, {}] as Array<Record<string, string>>) {
    const root = mkdtempSync(path.join(tmpdir(), 'tracy-fleet-guard-'));
    try {
      const envFile = writeConfig(root, makeDshRoot(root, '0.2.1-alpha.1'));
      const result = startGateway(envFile, env);
      // The fixture's DSH has no Cookie bridge: a gateway past the guard stops there (33).
      assert.equal(result.status, 33, `${JSON.stringify(env)}: ${result.stdout}\n${result.stderr}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
