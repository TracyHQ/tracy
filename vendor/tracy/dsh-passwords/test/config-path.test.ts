import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveConfigPath, SSH_ENDPOINT_ENV } from '../src/config.ts';
import { parseEndpointAllowlist } from '../src/permissions.ts';

test('relative database paths stay anchored to the deployment env directory after npm package switches', () => {
  const root = path.resolve('/opt/dsh-passwords');
  assert.equal(resolveConfigPath('data/platform.db', root, path.join(root, 'data', 'platform.db')), path.join(root, 'data', 'platform.db'));
  assert.equal(resolveConfigPath('/var/lib/dsh/platform.db', root, path.join(root, 'data', 'platform.db')), '/var/lib/dsh/platform.db');
});

test('端点登记表：唯一变量名，旧变量与旧开关已清理（不再导出兼容常量）', async () => {
  assert.equal(SSH_ENDPOINT_ENV, 'MCP_GATEWAY_SSH_ENDPOINTS');
  const mod = (await import('../src/config.ts')) as Record<string, unknown>;
  assert.equal(mod.SSH_ENDPOINT_LEGACY_ENV, undefined, '旧 WS 变量兼容常量已删除');
  assert.equal(mod.collectSshEndpointEntries, undefined, '旧并集读取函数已删除');
});

test('端点登记表：owner:/ws:/http: 前缀可任意组合，规范化后能力与传输明确', () => {
  assert.deepEqual(
    parseEndpointAllowlist(
      `${'owner:/api/a'},ws:/api/b,http:/api/c,owner:ws:/api/d,ws:owner:/api/e,owner:http:/api/f`,
      'TEST',
    ),
    [
      'owner:/api/a',
      'ws:/api/b',
      'http:/api/c',
      'owner:ws:/api/d',
      'owner:ws:/api/e',
      'owner:http:/api/f',
    ],
  );
});

test('端点登记表：空值与未设置等价（默认不登记任何端点）', () => {
  assert.deepEqual(parseEndpointAllowlist('   ', 'TEST'), []);
  assert.deepEqual(parseEndpointAllowlist(undefined, 'TEST'), []);
});

test('端点登记表：缺路径 / 只写前缀均启动即失败（fail-closed）', () => {
  assert.throws(() => parseEndpointAllowlist('owner:', 'TEST'), /missing a path/);
  assert.throws(() => parseEndpointAllowlist('ws:owner:', 'TEST'), /missing a path/);
  assert.throws(() => parseEndpointAllowlist('http:', 'TEST'), /missing a path/);
});
