// Issue #33（附带项「.env 修改不生效」）的机制与契约测试。
//
// 机制：dotenv 默认 override:false，而 dsh 是常驻进程——它在启动时把部署 .env 的
// 值灌进自身 process.env，并在拉起网关子进程时原样继承（plugin.ts spawn 的
// env: {...process.env}）。于是修改 .env 后只重启网关子进程，旧值仍压过文件。
//
// 插件拉起的网关与插件初始配置共享部署文件；直接运行 CLI 和 Docker 注入保持环境变量优先。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { deploymentGatewayEnv } from '../src/config.ts';
import type { PlatformConfig } from '../src/config.ts';
import {
  GATEWAY_CONFIG_DRIFT_MAX_RETRIES,
  gatewayConfigDrift,
  gatewayDriftDecision,
} from '../src/plugin.ts';

const projectRoot = path.resolve(import.meta.dirname, '..');
const configUrl = pathToFileURL(path.join(projectRoot, 'src', 'config.ts')).href;

/** 在全新进程里导入 config.ts 并调用 loadConfig()，避开 ESM 模块缓存。 */
function loadConfigInChild(env: NodeJS.ProcessEnv): { setupKey: string; port: number } {
  const script =
    `const { loadConfig } = await import(${JSON.stringify(configUrl)});` +
    `const c = loadConfig();` +
    `console.log(JSON.stringify({ setupKey: c.setupKey, port: c.gateway.port }));`;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `child exit=${String(result.status)}\n${result.stdout}\n${result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]!) as { setupKey: string; port: number };
}

function writeDeploymentEnv(dir: string, setupKey: string, port: string): string {
  const file = path.join(dir, '.env');
  writeFileSync(file, [`SETUP_KEY=${setupKey}`, `MCP_GATEWAY_PORT=${port}`, 'MCP_GATEWAY_AUTO_TLS=0', ''].join('\n'));
  return file;
}

/** 模拟 dsh 常驻进程固化进自身环境、再继承给网关子进程的陈旧值。 */
function staleEnv(envFile: string, parentPid?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DSH_PASSWORDS_ENV_FILE: envFile,
    SETUP_KEY: 'env-key',
    MCP_GATEWAY_PORT: '2222',
    MCP_GATEWAY_AUTO_TLS: '0',
    LANG: 'en_US.UTF-8',
  };
  delete env.DSH_GATEWAY_PARENT_PID;
  if (parentPid !== undefined) env.DSH_GATEWAY_PARENT_PID = parentPid;
  return env;
}

test('未由插件拉起时：显式环境变量优先于部署 .env（守住 cli.ts 的三层优先级）', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dshpw-envprec-'));
  try {
    const file = writeDeploymentEnv(dir, 'file-key', '1111');
    assert.deepEqual(loadConfigInChild(staleEnv(file)), { setupKey: 'env-key', port: 2222 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('无陈旧继承值时：全新进程正常读取部署 .env', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dshpw-envprec-'));
  try {
    const file = writeDeploymentEnv(dir, 'file-key', '1111');
    const env = staleEnv(file);
    delete env.SETUP_KEY;
    delete env.MCP_GATEWAY_PORT;
    assert.deepEqual(loadConfigInChild(env), { setupKey: 'file-key', port: 1111 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Windows 未显式配置 systemd 服务时默认手动重启', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dshpw-envprec-'));
  try {
    const file = writeDeploymentEnv(dir, 'file-key', '1111');
    const env = staleEnv(file);
    delete env.MCP_DSH_RESTART_SERVICE;
    const script = `const { loadConfig } = await import(${JSON.stringify(configUrl)});` +
      'console.log(JSON.stringify({ restartService: loadConfig().patch.restartService }));';
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: projectRoot, env, encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1) ?? '{}') as { restartService?: string };
    assert.equal(output.restartService, process.platform === 'win32' ? '' : 'dsh-web');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('插件拉起的 Docker 网关仍以容器环境变量为准', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dshpw-envprec-'));
  try {
    const file = writeDeploymentEnv(dir, 'file-key', '1111');
    assert.deepEqual(loadConfigInChild({ ...staleEnv(file, '12345'), DSH_PASSWORDS_RUNTIME: 'docker' }),
      { setupKey: 'env-key', port: 2222 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('插件子进程仍保留仅通过环境变量提供的设置', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dshpw-envprec-'));
  try {
    const file = path.join(dir, '.env');
    writeFileSync(file, 'SETUP_KEY=file-key\nMCP_GATEWAY_AUTO_TLS=0\n');
    assert.deepEqual(loadConfigInChild(staleEnv(file, '12345')), { setupKey: 'file-key', port: 2222 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('插件快照清理文件中已删除的键，文件消失时拒绝沿用旧值', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dshpw-envprec-'));
  const file = path.join(dir, '.env');
  try {
    writeFileSync(file, 'SETUP_KEY=file-key\nMCP_GATEWAY_PORT=1111\n');
    const inherited = { SETUP_KEY: 'old-key', MCP_GATEWAY_PORT: '2222', MCP_DSH_ROOT: 'environment-only' };
    const first = deploymentGatewayEnv(file, inherited);
    assert.equal(first.MCP_GATEWAY_PORT, '1111');
    writeFileSync(file, 'SETUP_KEY=file-key\n');
    const second = deploymentGatewayEnv(file, first);
    assert.equal(second.MCP_GATEWAY_PORT, undefined);
    assert.equal(second.MCP_DSH_ROOT, 'environment-only');
    rmSync(file);
    assert.throws(() => deploymentGatewayEnv(file, first), /部署环境文件已缺失/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Issue #33：插件拉起的子进程以部署文件为准，重启子进程读取新值', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dshpw-envprec-'));
  try {
    const file = writeDeploymentEnv(dir, 'file-key', '1111');
    assert.deepEqual(
      loadConfigInChild(staleEnv(file, '12345')),
      { setupKey: 'file-key', port: 1111 },
      '插件子进程必须读取部署文件',
    );

    // 修改 .env 后只重启网关子进程：文件中的新值要生效。
    writeDeploymentEnv(dir, 'file-key2', '3333');
    assert.deepEqual(
      loadConfigInChild(staleEnv(file, '12345')),
      { setupKey: 'file-key2', port: 3333 },
      '重启子进程后应重新读取部署文件',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MANAGED_ENV_KEYS 覆盖设置文件、bindAll 与上游 TLS 校验开关，且随文件删除而清除', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dshpw-envprec-'));
  const file = path.join(dir, '.env');
  try {
    writeFileSync(file, [
      'SETUP_KEY=file-key',
      'MCP_DSH_SETTINGS_FILE=file-settings.yaml',
      'MCP_DSH_PATCH_ALLOW_BIND_ALL=1',
      'MCP_GATEWAY_UPSTREAM_TLS_VERIFY=0',
      '',
    ].join('\n'));
    // 模拟 dsh 常驻进程继承下来的陈旧值：部署文件必须覆盖它们。
    const inherited = {
      SETUP_KEY: 'stale-key',
      MCP_DSH_SETTINGS_FILE: 'stale-settings.yaml',
      MCP_DSH_PATCH_ALLOW_BIND_ALL: '0',
      MCP_GATEWAY_UPSTREAM_TLS_VERIFY: '1',
      MCP_DSH_ROOT: 'environment-only',
    };
    const snapshot = deploymentGatewayEnv(file, inherited);
    assert.equal(snapshot.MCP_DSH_SETTINGS_FILE, 'file-settings.yaml');
    assert.equal(snapshot.MCP_DSH_PATCH_ALLOW_BIND_ALL, '1');
    assert.equal(snapshot.MCP_GATEWAY_UPSTREAM_TLS_VERIFY, '0');
    // 未纳入管理的键仍沿用环境变量。
    assert.equal(snapshot.MCP_DSH_ROOT, 'environment-only');

    // 运维从文件中删掉这些键后，插件快照必须清除旧值，
    // 否则网关子进程会继续沿用陈旧的安全开关（如 bindAll 或跳过上游校验）。
    writeFileSync(file, 'SETUP_KEY=file-key\n');
    const cleared = deploymentGatewayEnv(file, snapshot);
    assert.equal(cleared.MCP_DSH_SETTINGS_FILE, undefined);
    assert.equal(cleared.MCP_DSH_PATCH_ALLOW_BIND_ALL, undefined);
    assert.equal(cleared.MCP_GATEWAY_UPSTREAM_TLS_VERIFY, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function driftConfig(overrides: Partial<PlatformConfig> = {}, gateway: Partial<PlatformConfig['gateway']> = {}): PlatformConfig {
  return {
    setupKey: 'key',
    dbPath: '/deploy/data/platform.db',
    dbEncKey: '',
    jwtSecret: 'jwt',
    internalSecret: 'internal',
    gateway: {
      host: '0.0.0.0', port: 8080, upstream: 'http://127.0.0.1:3080',
      tls: null, redirectPort: null, publicHost: '', domain: '', autoTls: false, acmeEmail: '', acmeStaging: false,
      ...gateway,
    },
    patch: { dshRoot: '', restartService: '' },
    endpointRules: [],
    ...overrides,
  };
}

test('密钥/端口/上游漂移必须被识别，避免用旧快照误启网关', () => {
  const base = driftConfig();
  assert.deepEqual(gatewayConfigDrift(base, base), [], '完全一致时无漂移');
  assert.deepEqual(gatewayConfigDrift(base, driftConfig({}, { port: 8443 })), ['MCP_GATEWAY_PORT']);
  assert.deepEqual(gatewayConfigDrift(base, driftConfig({ jwtSecret: 'other' })), ['MCP_JWT_SECRET']);
  assert.deepEqual(gatewayConfigDrift(base, driftConfig({ internalSecret: 'other' })), ['MCP_INTERNAL_SECRET']);
  assert.deepEqual(gatewayConfigDrift(base, driftConfig({ setupKey: 'other' })), ['SETUP_KEY/MCP_DB_ENC_KEY']);
  assert.deepEqual(gatewayConfigDrift(base, driftConfig({ dbEncKey: 'explicit' })), ['SETUP_KEY/MCP_DB_ENC_KEY']);
  assert.deepEqual(gatewayConfigDrift(base, driftConfig({ dbPath: '/other/platform.db' })), ['MCP_DB_PATH']);
  assert.deepEqual(
    gatewayConfigDrift(base, driftConfig({}, { upstream: 'http://127.0.0.1:9090' })),
    ['MCP_GATEWAY_UPSTREAM'],
  );
  assert.deepEqual(
    gatewayConfigDrift(base, driftConfig({}, { tls: { cert: 'a.pem', key: 'a.key' } })),
    ['MCP_GATEWAY_TLS_CERT/MCP_GATEWAY_TLS_KEY'],
  );
});

test('配置漂移重试有界：超过上限后转为已诊断停机而不是静默不启动', () => {
  assert.ok(Number.isInteger(GATEWAY_CONFIG_DRIFT_MAX_RETRIES) && GATEWAY_CONFIG_DRIFT_MAX_RETRIES > 0);
  for (let attempt = 1; attempt <= GATEWAY_CONFIG_DRIFT_MAX_RETRIES; attempt += 1) {
    assert.equal(gatewayDriftDecision(attempt), 'retry', `第 ${String(attempt)} 次应在界内重试`);
  }
  // 越界后必须明确停机（不退化为无限静默重试，也不误启）。
  assert.equal(gatewayDriftDecision(GATEWAY_CONFIG_DRIFT_MAX_RETRIES + 1), 'stopped');
  assert.equal(gatewayDriftDecision(GATEWAY_CONFIG_DRIFT_MAX_RETRIES + 100), 'stopped');
});
