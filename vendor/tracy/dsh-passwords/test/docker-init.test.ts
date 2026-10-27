import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initializeDocker } from '../scripts/docker-init.mjs';

function envValue(contents: string, name: string): string {
  const match = contents.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

test('Docker initialization writes a copyable setup key that matches the persistent env', () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-passwords-docker-init-'));
  const envFile = path.join(stateDir, '.env');
  const env = {
    DSH_PASSWORDS_ENV_FILE: envFile,
    MCP_DB_PATH: path.join(stateDir, 'platform.db'),
    MCP_GATEWAY_UPSTREAM: 'http://127.0.0.1:3080',
  };

  try {
    initializeDocker({ env, log: () => {}, error: () => {} });

    const setupKey = readFileSync(path.join(stateDir, 'setup-key.txt'), 'utf8').trim();
    const persistentKey = envValue(readFileSync(envFile, 'utf8'), 'SETUP_KEY');
    assert.match(setupKey, /^[a-f0-9]{48}$/);
    assert.equal(setupKey, persistentKey);

    initializeDocker({ env, log: () => {}, error: () => {} });
    assert.equal(readFileSync(path.join(stateDir, 'setup-key.txt'), 'utf8').trim(), setupKey);
    assert.ok(existsSync(envFile));
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test('Docker initialization adopts SETUP_KEY from the environment instead of generating one', () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-passwords-docker-init-'));
  const envFile = path.join(stateDir, '.env');
  const providedKey = 'e'.repeat(48);
  const logs: string[] = [];
  const env = {
    DSH_PASSWORDS_ENV_FILE: envFile,
    MCP_DB_PATH: path.join(stateDir, 'platform.db'),
    MCP_GATEWAY_UPSTREAM: 'http://127.0.0.1:3080',
    SETUP_KEY: providedKey,
  };

  try {
    initializeDocker({ env, log: (message: string) => logs.push(message), error: () => {} });

    assert.equal(envValue(readFileSync(envFile, 'utf8'), 'SETUP_KEY'), providedKey);
    // The user already knows the key; no plaintext bootstrap file is left behind.
    assert.equal(existsSync(path.join(stateDir, 'setup-key.txt')), false);
    // Logs must never echo the key.
    assert.ok(logs.length > 0);
    assert.ok(logs.every((line) => !line.includes(providedKey)));

    // Idempotent: a later boot keeps the same key and never rotates it.
    initializeDocker({ env, log: () => {}, error: () => {} });
    assert.equal(envValue(readFileSync(envFile, 'utf8'), 'SETUP_KEY'), providedKey);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test('Docker initialization repairs a partial .env with the environment SETUP_KEY', () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-passwords-docker-init-'));
  const envFile = path.join(stateDir, '.env');
  const providedKey = 'f'.repeat(48);
  writeFileSync(envFile, `MCP_GATEWAY_UPSTREAM=http://127.0.0.1:9999\n`, 'utf8');
  const env = {
    DSH_PASSWORDS_ENV_FILE: envFile,
    MCP_DB_PATH: path.join(stateDir, 'platform.db'),
    SETUP_KEY: providedKey,
  };

  try {
    initializeDocker({ env, log: () => {}, error: () => {} });

    const contents = readFileSync(envFile, 'utf8');
    assert.equal(envValue(contents, 'SETUP_KEY'), providedKey);
    // Existing configuration is preserved; only the missing key is appended.
    assert.match(contents, /^MCP_GATEWAY_UPSTREAM=http:\/\/127\.0\.0\.1:9999$/m);
    assert.equal(existsSync(path.join(stateDir, 'setup-key.txt')), false);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test('Docker initialization does not overwrite an existing SETUP_KEY from the environment', () => {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'dsh-passwords-docker-init-'));
  const envFile = path.join(stateDir, '.env');
  const existingKey = 'a'.repeat(48);
  writeFileSync(envFile, `SETUP_KEY=${existingKey}\nMCP_GATEWAY_UPSTREAM=http://127.0.0.1:9999\n`, 'utf8');
  const env = {
    DSH_PASSWORDS_ENV_FILE: envFile,
    MCP_DB_PATH: path.join(stateDir, 'platform.db'),
    SETUP_KEY: 'b'.repeat(48),
  };

  try {
    initializeDocker({ env, log: () => {}, error: () => {} });

    // The volume already holds a key; the environment value must not rotate it.
    assert.equal(envValue(readFileSync(envFile, 'utf8'), 'SETUP_KEY'), existingKey);
    assert.equal(existsSync(path.join(stateDir, 'setup-key.txt')), false);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});
