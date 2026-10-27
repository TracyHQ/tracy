// 留言 ?since 增量拉取回归测试：
// 客户端轮询带 ?since=<lastId>，服务端只返回 id > lastId 的新消息（升序），
// 避免每 4 秒轮询都全量下载最近 300 条留言（长期挂机的无谓带宽/CPU 开销）。
// 同时覆盖：POST 留言 → 全量列表包含 → 增量列表只含新消息且升序。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import jwt from 'jsonwebtoken';

import { createGatewayServer } from '../src/gateway.js';
import { AuthService } from '../src/auth.js';
import { Database } from '../src/db.js';
import { createFieldCrypto } from '../src/encrypt.js';
import type { PlatformConfig } from '../src/config.js';

let tempDir: string;
let db: Database;
let gateway: http.Server;
let upstream: http.Server;
let gatewayPort = 0;
let cookie = '';

interface JsonResponse {
  status: number;
  body: { ok?: boolean; messages?: Array<{ id: number; content: string }>; message?: { id: number } };
}

function req(method: string, url: string, body?: unknown): Promise<JsonResponse> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const r = http.request(
      {
        host: '127.0.0.1',
        port: gatewayPort,
        method,
        path: url,
        headers: {
          cookie,
          ...(payload !== undefined
            ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'),
          }),
        );
      },
    );
    r.on('error', reject);
    r.end(payload);
  });
}

before(async () => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-msg-'));
  db = new Database(path.join(tempDir, 'test.db'), createFieldCrypto('testkey', 'testkey'));
  db.init();
  const user = db.createUser('admin', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');

  // 上游 mock：本测试只走网关自带 /gateway/* 路由，mock 仅兜底
  upstream = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', () => resolve()));
  const upstreamPort = (upstream.address() as { port: number }).port;

  const config: PlatformConfig = {
    setupKey: 'test-setup-key',
    dbPath: path.join(tempDir, 'test.db'),
    dbEncKey: 'testkey',
    gateway: {
      host: '127.0.0.1',
      port: 0,
      upstream: `http://127.0.0.1:${upstreamPort}`,
      tls: null,
      redirectPort: null,
      publicHost: '',
      domain: 'localhost',
      autoTls: false,
      acmeEmail: '',
      acmeStaging: false,
    },
    jwtSecret: 'test-secret',
    internalSecret: 'test-internal',
    patch: { dshRoot: '', restartService: '' },
    endpointRules: [],
  };

  const auth = new AuthService(config, db);
  gateway = createGatewayServer(config, auth, db);
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', () => resolve()));
  gatewayPort = (gateway.address() as { port: number }).port;

  const token = jwt.sign({ sub: String(user.id), username: user.username, cv: 0 }, config.jwtSecret, {
    expiresIn: '12h',
  });
  cookie = `dsh_gateway_token=${token}`;
});

after(() => {
  gateway?.close();
  upstream?.close();
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* 忽略：Windows 上 node:sqlite 文件句柄可能未释放 */
  }
});

test('留言：POST 三条 → since 增量拉取只返回新消息（升序）', async () => {
  const ids: number[] = [];
  for (const text of ['first', 'second', 'third']) {
    const r = await req('POST', '/gateway/api/messages', { content: text, broadcast: true });
    assert.equal(r.status, 200);
    assert.ok(r.body.message, 'POST 应返回新消息体');
    ids.push(r.body.message!.id);
  }
  assert.ok(ids[0] < ids[1] && ids[1] < ids[2], '消息 id 应递增');

  // 全量：应含全部三条（服务端 DESC 返回，客户端自己排序，这里只验证存在性）
  const all = await req('GET', '/gateway/api/messages');
  assert.equal(all.status, 200);
  const allIds = (all.body.messages ?? []).map((m) => m.id);
  for (const id of ids) assert.ok(allIds.includes(id), `全量列表应包含消息 ${id}`);

  // 增量：since=ids[0] 应只返回 ids[1]、ids[2]，且升序
  const inc = await req('GET', `/gateway/api/messages?since=${ids[0]}`);
  assert.equal(inc.status, 200);
  const incIds = (inc.body.messages ?? []).map((m) => m.id);
  assert.deepEqual(incIds, [ids[1], ids[2]], 'since 增量应只含新消息且升序');

  // since 越过最新消息：应返回空数组
  const empty = await req('GET', `/gateway/api/messages?since=${ids[2]}`);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.messages ?? [], [], 'since 超出最新 id 时应为空');
});
