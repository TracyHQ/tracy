// H9: the Tracy settings `loadConfig` reads from the environment (MCP_SEAT_SECRET, MCP_TRACY_*,
// MCP_GATEWAY_TRUSTED_PROXIES). Upstream 2.7.7 reads none of them; without this hook the seat door,
// the Tracy sign-in door and the mount prefix all read as "not configured" on every fleet host.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deploymentGatewayEnv, loadConfig } from '../../src/config.js';

const BASE = { SETUP_KEY: 'k'.repeat(48), MCP_GATEWAY_AUTO_TLS: '0' };

test('H9: the seat secret and the five MCP_TRACY_* settings reach the gateway config, trimmed', () => {
  const config = loadConfig({
    env: {
      ...BASE,
      MCP_SEAT_SECRET: ' seat-secret ',
      MCP_TRACY_ORIGIN: 'https://cowork.tracy.ai',
      MCP_TRACY_SEATS_ORIGIN: 'http://127.0.0.1:8787',
      MCP_TRACY_SITE_KEY: 'tracy.ai',
      MCP_TRACY_ACTOR_SECRET: 'actor',
      MCP_TRACY_SITE_LABEL: 'tracy-ai-8836f920',
    },
  });
  assert.equal(config.seatSecret, 'seat-secret');
  assert.deepEqual(config.tracy, {
    origin: 'https://cowork.tracy.ai',
    seatsOrigin: 'http://127.0.0.1:8787',
    siteKey: 'tracy.ai',
    actorSecret: 'actor',
    siteLabel: 'tracy-ai-8836f920',
  });
});

test('H9: unset means empty — the doors stay absent, never half-open', () => {
  const config = loadConfig({ env: { ...BASE } });
  assert.equal(config.seatSecret, '');
  assert.deepEqual(config.tracy, { origin: '', seatsOrigin: '', siteKey: '', actorSecret: '', siteLabel: '' });
  assert.equal(config.gateway.trustedProxies, undefined, 'absent = loopback only');
});

test('K5/H0: MCP_GATEWAY_TRUSTED_PROXIES is a comma list; blanks are dropped', () => {
  const config = loadConfig({ env: { ...BASE, MCP_GATEWAY_TRUSTED_PROXIES: ' 172.18.0.0/16, ,10.0.0.5 ' } });
  assert.deepEqual(config.gateway.trustedProxies, ['172.18.0.0/16', '10.0.0.5']);
});

test('H9: the gateway the plugin spawns reads the Tracy keys from the deployment file, not from a stale inherited env', () => {
  const keys = [
    'MCP_SEAT_SECRET', 'MCP_TRACY_ORIGIN', 'MCP_TRACY_SEATS_ORIGIN', 'MCP_TRACY_SITE_KEY', 'MCP_TRACY_ACTOR_SECRET',
    'MCP_TRACY_SITE_LABEL', 'MCP_TRACY_FLEET', 'MCP_DSH_ROOT', 'MCP_GATEWAY_TRUSTED_PROXIES', 'MCP_GATEWAY_PUBLIC_HOST',
  ];
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tracy-managed-env-'));
  try {
    const file = path.join(dir, '.env');
    writeFileSync(file, keys.map((key) => `${key}=from-file`).join('\n'));
    const inherited: NodeJS.ProcessEnv = Object.fromEntries(keys.map((key) => [key, 'stale']));
    const env = deploymentGatewayEnv(file, inherited);
    for (const key of keys) assert.equal(env[key], 'from-file', key);
    // A key removed from the file is removed from the next snapshot too.
    writeFileSync(file, '');
    const next = deploymentGatewayEnv(file, env);
    for (const key of keys) assert.equal(next[key], undefined, `${key} after it left the file`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
