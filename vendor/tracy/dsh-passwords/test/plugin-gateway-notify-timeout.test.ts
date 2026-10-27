// notifyGateway 回归测试（fire-and-forget 的内部通知）：
//   1) 网关未监听：静默失败，不抛出、不产生未处理异常；
//   2) 网关进程存活但卡住不回包：timeout(4000ms) 到点后必须主动销毁请求，
//      不能把 socket 永久挂住（此前只有 error 处理，timeout 事件无人接管）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { notifyGateway } from '../src/plugin.js';
import type { PlatformConfig } from '../src/config.js';

function configFor(port: number): PlatformConfig {
  return {
    setupKey: 'test-setup-key',
    dbPath: '',
    dbEncKey: 'test-key',
    gateway: {
      host: '127.0.0.1', port, upstream: 'http://127.0.0.1:1',
      tls: null, redirectPort: null, publicHost: '', domain: 'localhost',
      autoTls: false, acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: 'test-secret',
    internalSecret: 'test-internal',
    patch: { dshRoot: '', restartService: '' },
    endpointRules: [],
  };
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

async function waitUntil(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!cond() && Date.now() < deadline) await wait(25);
  return cond();
}

test('notifyGateway 在网关未监听时静默失败（不抛出）', async () => {
  // 先占用再释放一个端口，得到一个几乎必然无人监听的端口号。
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));

  assert.doesNotThrow(() => notifyGateway(configFor(port)), '连接被拒时不得抛出');
  // 留出事件循环处理 ECONNREFUSED：error 处理器静默吞掉，不应冒泡为未处理异常。
  await wait(300);
});

test('notifyGateway 在网关卡死（可连接但不回包）时按 timeout 销毁请求，保持静默', async () => {
  let connections = 0;
  let closedAt = 0;
  // 接受连接与请求，但永不响应：模拟网关进程存活却卡在重载。
  const server = http.createServer((req, res) => {
    req.resume();
    void res;
  });
  server.on('connection', (socket) => {
    connections += 1;
    socket.on('close', () => { closedAt = Date.now(); });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const startedAt = Date.now();

  try {
    assert.doesNotThrow(() => notifyGateway(configFor(port)), '卡死网关不得抛出');

    // timeout 选项为 4000ms：1s 时连接应仍在（证明断开确实来自 timeout 而非立即销毁）。
    await wait(1000);
    assert.equal(connections, 1, '请求应已建立连接');
    assert.equal(closedAt, 0, 'timeout 到点前不应主动断开');

    assert.equal(await waitUntil(() => closedAt !== 0, 6000), true, 'timeout 到点后必须销毁请求');
    const elapsed = closedAt - startedAt;
    assert.ok(elapsed >= 3900, `应在 timeout(4000ms) 之后才销毁，实际 ${elapsed}ms`);
    assert.ok(elapsed <= 6000, `应在超时后尽快销毁，实际 ${elapsed}ms`);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
