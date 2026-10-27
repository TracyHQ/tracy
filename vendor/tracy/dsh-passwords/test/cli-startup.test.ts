import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const cli = path.join(projectRoot, 'dist', 'cli.js');

function writeConfig(root: string, dshRoot: string, overrides: Record<string, string> = {}): string {
  const envFile = path.join(root, '.env');
  const values: Record<string, string> = {
    SETUP_KEY: 'test-setup-key',
    MCP_DB_ENC_KEY: 'test-encryption-key',
    MCP_GATEWAY_AUTO_TLS: '0',
    MCP_GATEWAY_PORT: '19443',
    MCP_DSH_ROOT: dshRoot,
    ...overrides,
  };
  writeFileSync(envFile, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
  return envFile;
}

// The plain settings/connection fixtures. Version defaults to the reviewed pin so a
// fixture that is supposed to clear the identity gate and fail later on the bridge or
// patch target actually reaches that later check.
function makeDshRoot(
  root: string,
  settings: string | null,
  connection: string,
  version = '0.2.1-alpha.1',
): string {
  const dshRoot = path.join(root, 'dsh');
  const settingsPath = path.join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings', 'lib', 'client.js');
  const connectionPath = path.join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-client-connection', 'lib', 'index.js');
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  mkdirSync(path.dirname(connectionPath), { recursive: true });
  writeFileSync(path.join(dshRoot, 'package.json'), JSON.stringify({ version }) + '\n');
  if (settings === null) mkdirSync(settingsPath);
  else writeFileSync(settingsPath, settings);
  writeFileSync(connectionPath, connection);
  return dshRoot;
}

function startGateway(envFile: string) {
  return spawnSync(process.execPath, [cli, 'serve-gateway'], {
    cwd: projectRoot,
    env: { ...process.env, DSH_PASSWORDS_ENV_FILE: envFile, LANG: 'en_US.UTF-8' },
    encoding: 'utf8',
    // A gate that fails open starts a long-running listener; bound the wait so a
    // regression surfaces as a failed assertion instead of a hanging test run.
    timeout: 20_000,
  });
}

test('gateway refuses startup when the explicitly configured DSH root is absent', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dshpw-cli-root-'));
  const envFile = writeConfig(root, path.join(root, 'missing-dsh'));
  try {
    const result = spawnSync(process.execPath, [cli, 'serve-gateway'], {
      cwd: projectRoot,
      env: { ...process.env, DSH_PASSWORDS_ENV_FILE: envFile, LANG: 'en_US.UTF-8' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 34, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /MCP_DSH_ROOT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('gateway refuses startup when the settings anchor cannot be patched', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dshpw-cli-settings-'));
  const dshRoot = makeDshRoot(root, 'export const persistence = "memory";\n', 'export class Connection {}\n');
  try {
    const result = startGateway(writeConfig(root, dshRoot));
    assert.equal(result.status, 35, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /patch target|settings/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('gateway refuses startup when the Cookie bridge is unavailable', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dshpw-cli-cookie-'));
  const settings = 'const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";\n';
  const dshRoot = makeDshRoot(root, settings, 'export class Connection {}\n');
  try {
    const result = startGateway(writeConfig(root, dshRoot));
    assert.equal(result.status, 33, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /Cookie bridge/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// 清单不可读或损坏时版本身份未知：必须在补丁和 Cookie 桥检查前 fail-closed（37），
// 不能静默回落到一次性 launch token。损坏 JSON / 缺失文件都不依赖 chmod，Windows 可用。
test('gateway refuses startup when the DSH manifest is corrupt or missing (fail closed)', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dshpw-cli-manifest-'));
  const settings = 'const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";\n';
  const dshRoot = makeDshRoot(root, settings, 'export class Connection {}\n');
  const manifestPath = path.join(dshRoot, 'package.json');
  // 若门禁回归为 fail-open，启动会走到 listen；占住端口让其快速以 32 退出并暴露回归，
  // 而不是挂起到 spawn 超时。
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '0.0.0.0', resolve));
  const port = (blocker.address() as AddressInfo).port;
  try {
    for (const mode of ['corrupt', 'missing'] as const) {
      if (mode === 'corrupt') writeFileSync(manifestPath, '{"version": "0.2.1-alpha.1",\n');
      else rmSync(manifestPath, { force: true });
      const result = spawnSync(process.execPath, [cli, 'serve-gateway'], {
        cwd: projectRoot,
        env: {
          ...process.env,
          DSH_PASSWORDS_ENV_FILE: writeConfig(root, dshRoot, {
            MCP_GATEWAY_PORT: String(port),
            MCP_GATEWAY_REDIRECT_PORT: '0',
            MCP_DB_PATH: path.join(root, 'gateway.db'),
          }),
          LANG: 'en_US.UTF-8',
        },
        encoding: 'utf8',
        timeout: 20_000,
      });
      assert.equal(result.status, 37, `${mode}: ${result.stdout}\n${result.stderr}`);
      assert.match(result.stderr, /Unsupported or invalid DSH version/i, mode);
    }
  } finally {
    blocker.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// The support window is the single patch line `>=0.2.1-alpha.1 <0.2.2-0`; the accepted
// identities are the reviewed alpha.1 pin, the later 0.2.1 prereleases, and the stable
// 0.2.1 release. Build metadata and multi-identifier prereleases must not let an accepted
// identity slip past the downstream Cookie-bridge gate either.
test('supported 0.2.1 patch-line variants pass the version gate and then require the Cookie bridge', async () => {
  const settings = 'const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";\n';
  const versions = [
    '0.2.1-alpha.1',
    '0.2.1-alpha.2',
    '0.2.1-alpha.10',
    '0.2.1-alpha.20',
    '0.2.1-alpha.3.1',
    '0.2.1-beta.1',
    '0.2.1-rc.1',
    '0.2.1-rc.2',
    '0.2.1-preview.4',
    '0.2.1-alpha.1+build.9',
    '0.2.1+build.1',
    '0.2.1',
  ];
  for (const version of versions) {
    const root = mkdtempSync(path.join(tmpdir(), 'dshpw-cli-021-'));
    const dshRoot = makeDshRoot(root, settings, 'export class Connection {}\n', version);
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '0.0.0.0', resolve));
    const port = (blocker.address() as AddressInfo).port;
    try {
      const result = spawnSync(process.execPath, [cli, 'serve-gateway'], {
        cwd: projectRoot,
        env: {
          ...process.env,
          DSH_PASSWORDS_ENV_FILE: writeConfig(root, dshRoot, {
            MCP_GATEWAY_PORT: String(port),
            MCP_GATEWAY_REDIRECT_PORT: '0',
            MCP_DB_PATH: path.join(root, 'gateway.db'),
          }),
          LANG: 'en_US.UTF-8',
        },
        encoding: 'utf8',
        timeout: 20_000,
      });
      assert.equal(result.status, 33, `${version}: ${result.stdout}\n${result.stderr}`);
      assert.match(result.stderr, /Cookie bridge/i, version);
    } finally {
      blocker.close();
      rmSync(root, { recursive: true, force: true });
    }
  }
});

// Every identity outside the 0.2.1 patch line is an identity boundary: the retired 0.1.x
// head, the retired 0.2.0 line, the pre-pin 0.2.1-alpha.0 / bare 0.2.1-alpha / numeric-only
// 0.2.1 prerelease, and every 0.2.2+/0.3 identity must be rejected (37) before any patch or
// public listener.
test('retired and out-of-window DSH lines are rejected before patching or opening a listener', async () => {
  const settings = 'const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";\n';
  const versions = [
    '0.1.2-alpha.5',
    '0.1.3',
    '0.1.5-rc.2',
    '0.1.6-alpha.2',
    '0.1.7',
    '0.1.7-rc.2',
    '0.1.8-alpha.1',
    '0.2.0',
    '0.2.0-rc.2',
    '0.2.0-alpha.1',
    '0.2.1-alpha',
    '0.2.1-alpha.0',
    '0.2.1-0',
    '0.2.2-rc.1',
    '0.2.2',
    '0.2.2-alpha.1',
    '0.3.0-alpha.1',
  ];
  const blocker = createServer();
  await new Promise<void>((resolve) => blocker.listen(0, '0.0.0.0', resolve));
  const port = (blocker.address() as AddressInfo).port;
  try {
    for (const version of versions) {
      const root = mkdtempSync(path.join(tmpdir(), 'dshpw-cli-gate-'));
      const dshRoot = makeDshRoot(root, settings, 'export class Connection {}\n', version);
      try {
        const result = spawnSync(process.execPath, [cli, 'serve-gateway'], {
          cwd: projectRoot,
          env: {
            ...process.env,
            DSH_PASSWORDS_ENV_FILE: writeConfig(root, dshRoot, {
              MCP_GATEWAY_PORT: String(port),
              MCP_GATEWAY_REDIRECT_PORT: '0',
              MCP_DB_PATH: path.join(root, 'gateway.db'),
            }),
            LANG: 'en_US.UTF-8',
          },
          encoding: 'utf8',
          timeout: 20_000,
        });
        assert.equal(result.status, 37, `${version}: ${result.stdout}\n${result.stderr}`);
        assert.match(result.stderr, /Unsupported or invalid DSH version/i, version);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  } finally {
    blocker.close();
  }
});

test('gateway refuses startup when patch inspection throws', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dshpw-cli-patch-error-'));
  const dshRoot = makeDshRoot(root, null, 'export class Connection {}\n');
  try {
    const result = startGateway(writeConfig(root, dshRoot));
    assert.equal(result.status, 36, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /patch.*failed|EISDIR/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// `patch off` is the rollback escape hatch and must not be blocked by the identity gate:
// a gateway that refuses the installed DSH version must still let the operator restore the
// original bundle after .env / SETUP_KEY were removed. An unsupported version therefore
// reaches rollbackPatch (here with no backup) instead of exiting 37.
test('patch off rollback bypass is not blocked by the DSH identity gate', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'dshpw-cli-patch-off-'));
  const dshRoot = makeDshRoot(root, 'const persistence = "host";\n', 'export class Connection {}\n', '0.1.7');
  try {
    const result = spawnSync(process.execPath, [cli, 'patch', 'off'], {
      cwd: projectRoot,
      env: { ...process.env, DSH_PASSWORDS_ENV_FILE: writeConfig(root, dshRoot), LANG: 'en_US.UTF-8' },
      encoding: 'utf8',
      timeout: 20_000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /no-backup/);
    assert.doesNotMatch(result.stdout + result.stderr, /Unsupported or invalid DSH version/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
