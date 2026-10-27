import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import jwt from 'jsonwebtoken';

import { AuthService } from '../src/auth.js';
import { Database } from '../src/db.js';
import { createFieldCrypto } from '../src/encrypt.js';
import { createGatewayServer } from '../src/gateway.js';
import type { PlatformConfig } from '../src/config.js';

let tempDir: string;
let db: Database;
let upstream: http.Server;
let gateway: http.Server;
let port = 0;
let adminCookie = '';
let userCookie = '';
let freshCookie = '';
let jwtSecret = '';
// 长连接模式的 events.* 上游响应（按请求 query 里的 hold 值索引），供生命周期测试持有/释放。
const heldStreams = new Map<string, http.ServerResponse>();

const workspaces = {
  result: {
    value: {
      items: [
        {
          workspaceId: 'visible-workspace',
          path: '/work/visible',
          title: 'Visible',
          sessionIds: ['visible-session', 'disabled-session'],
          createdAt: '2026-08-28T00:00:00.000Z',
          updatedAt: '2026-08-28T00:00:00.000Z',
        },
        {
          workspaceId: 'hidden-workspace',
          path: '/work/hidden',
          title: 'Hidden',
          sessionIds: ['hidden-session'],
          createdAt: '2026-08-28T00:00:00.000Z',
          updatedAt: '2026-08-28T00:00:00.000Z',
        },
        {
          // 生命周期测试专用：无任何子用户登记过的目录，使新建子用户的快照非空。
          workspaceId: 'sse-workspace',
          path: '/work/sse',
          title: 'SSE',
          sessionIds: ['sse-session'],
          createdAt: '2026-08-28T00:00:00.000Z',
          updatedAt: '2026-08-28T00:00:00.000Z',
        },
      ],
      archivedSessionIds: [],
    },
  },
};

function heldStreamId(req: http.IncomingMessage): string | null {
  const raw = req.headers['x-test-hold'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value !== '' ? value : null;
}

function request(pathname: string, cookie: string, body = '{}'): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method: pathname.includes('workspace.list') ? 'POST' : 'GET',
      headers: {
        cookie,
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

before(async () => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-events-'));
  db = new Database(path.join(tempDir, 'test.db'), createFieldCrypto('test-key', 'test-key'));
  db.init();
  const admin = db.createUser('admin', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
  const user = db.createUser('events-user', '$2a$10$dummyhashdummyhashdummyhashdu');
  const other = db.createUser('other-user', '$2a$10$dummyhashdummyhashdummyhashdu');
  const fresh = db.createUser('fresh-user', '$2a$10$dummyhashdummyhashdummyhashdu');
  db.addUserWorkspace(user.id, '/work/visible');
  db.addUserWorkspace(other.id, '/work/hidden');
  db.setPermissions(user.id, {
    allowedFolders: ['/work/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: false, allowWorkspaceCreate: false,
    disabledSessions: ['disabled-session'], banned: false, sandboxMode: null,
  });
  db.setPermissions(fresh.id, {
    allowedFolders: ['/work/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: false, allowWorkspaceCreate: false,
    disabledSessions: [], banned: false, sandboxMode: null,
  });

  upstream = http.createServer((req, res) => {
    if (req.url?.startsWith('/api/workspace.list')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(workspaces));
      return;
    }
    if (req.url?.startsWith('/api/events.host')) {
      const frames = [
        { rpcId: 'hidden-changed', payload: { type: 'host/workspace-changed', workspace: { workspaceId: 'hidden-workspace', path: '/work/hidden', title: 'Hidden', sessionIds: ['hidden-session'], createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z' } } },
        { rpcId: 'visible-changed', payload: { type: 'host/workspace-changed', workspace: { workspaceId: 'visible-workspace', path: '/work/visible', title: 'Visible', sessionIds: ['visible-session', 'disabled-session'], createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z' } } },
        { rpcId: 'renamed-outside', payload: { type: 'host/workspace-changed', workspace: { workspaceId: 'visible-workspace', path: '/work/also-allowed', title: 'Visible', sessionIds: ['visible-session'], createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z' } } },
        { rpcId: 'collision-path', payload: { type: 'host/workspace-changed', workspace: { workspaceId: 'visible-workspace', path: '/work/hidden', title: 'Visible', sessionIds: ['visible-session'], createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z' } } },
        { rpcId: 'blocked-session', payload: { type: 'host/session-added', sessionId: 'hidden-session', cwd: '/work/hidden' } },
        { rpcId: 'allowed-session', payload: { type: 'host/session-added', sessionId: 'visible-session', cwd: '/work/visible', parentSessionId: 'hidden-session' } },
        { rpcId: 'removed-hidden', payload: { type: 'host/session-removed', sessionId: 'hidden-session' } },
        { rpcId: 'removed-visible', payload: { type: 'host/session-removed', sessionId: 'visible-session' } },
        { rpcId: 'status-hidden', payload: { type: 'host/session-status', sessionId: 'hidden-session', running: true } },
        { rpcId: 'status-visible', payload: { type: 'host/session-status', sessionId: 'visible-session', running: true } },
        { rpcId: 'error-hidden', payload: { type: 'host/agent-error', sessionId: 'hidden-session', message: 'boom' } },
        { rpcId: 'error-visible', payload: { type: 'host/agent-error', sessionId: 'visible-session', message: 'boom' } },
        { rpcId: 'remote-event', payload: { type: 'host/remote-event', event: 'workspace/somewhere', args: [{ path: '/work/hidden' }] } },
        { rpcId: 'workspace-removed-visible', payload: { type: 'host/workspace-removed', workspaceId: 'visible-workspace' } },
        { rpcId: 'order-mixed', payload: { type: 'host/workspace-order-changed', workspaceIds: ['visible-workspace', 'hidden-workspace'] } },
        { rpcId: 'archived-mixed', payload: { type: 'host/archived-sessions-changed', archivedSessionIds: ['visible-session', 'hidden-session'] } },
        { rpcId: 'sse-workspace-changed', payload: { type: 'host/workspace-changed', workspace: { workspaceId: 'sse-workspace', path: '/work/sse', title: 'SSE', sessionIds: ['sse-session'], createdAt: '2026-08-28T00:00:00.000Z', updatedAt: '2026-08-28T00:00:00.000Z' } } },
        { rpcId: 'unknown-type', payload: { type: 'host/unknown', path: '/work/hidden' } },
        { rpcId: 'malformed-payload', payload: '/work/hidden' },
        { rpcId: 'utf8-visible', payload: { type: 'host/session-status', sessionId: 'visible-session', running: true, note: 'emoji-😀-中文' } },
      ];
      // 末尾追加一个以裸 CR 结束注释行、随后给出隐藏会话事件的帧：过滤若不按 SSE
      // 行语义（CR/LF/CRLF）解析 data 行，整帧会被放行而导致 hidden-session 泄露。
      const payload =
        frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') +
        `: comment\rdata: ${JSON.stringify({ rpcId: 'cr-comment-hidden', payload: { type: 'host/session-added', sessionId: 'hidden-session', cwd: '/work/hidden' } })}\r\r`;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const hold = heldStreamId(req);
      if (hold !== null) {
        heldStreams.set(hold, res);
        res.on('close', () => heldStreams.delete(hold));
        res.write(payload);
        return;
      }
      // 故意在 emoji 的 UTF-8 字节序列中间切开：逐 chunk 无状态解码会在此产生 U+FFFD。
      const payloadBuffer = Buffer.from(payload, 'utf8');
      const splitAt = payloadBuffer.indexOf(Buffer.from('😀', 'utf8')) + 1;
      res.write(payloadBuffer.subarray(0, splitAt));
      res.end(payloadBuffer.subarray(splitAt));
      return;
    }
    if (req.url?.startsWith('/api/events.mux')) {
      const frames = [
        { rpcId: 'mux-visible', payload: { type: 'session/event', sessionId: 'visible-session', event: { id: 'e1' } } },
        { rpcId: 'mux-hidden', payload: { type: 'session/event', sessionId: 'hidden-session', event: { id: 'e2' } } },
        { rpcId: 'mux-subscribed-hidden', payload: { type: 'session/subscribed', sessionId: 'hidden-session', lastSeq: 1 } },
        { rpcId: 'mux-subscribed-visible', payload: { type: 'session/subscribed', sessionId: 'visible-session', lastSeq: 2 } },
        { rpcId: 'mux-approval-hidden', payload: { type: 'approval/requested', sessionId: 'hidden-session', approvalId: 'a1', toolName: 't' } },
        { rpcId: 'mux-queue-visible', payload: { type: 'session/queue', sessionId: 'visible-session', items: [] } },
        { rpcId: 'mux-sse', payload: { type: 'session/event', sessionId: 'sse-session', event: { id: 'e3' } } },
        { rpcId: 'mux-error', payload: { type: 'stream/error', error: { message: 'boom' } } },
        { rpcId: 'utf8-mux-visible', payload: { type: 'session/event', sessionId: 'visible-session', event: { id: 'e-中文' } } },
      ];
      // 同 host：裸 CR 注释行后跟隐藏会话事件，验证 mux 过滤同样按 SSE 行语义解析。
      const payload =
        frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') +
        `: comment\rdata: ${JSON.stringify({ rpcId: 'cr-comment-hidden-mux', payload: { type: 'session/event', sessionId: 'hidden-session', event: { id: 'e-cr' } } })}\r\r`;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const hold = heldStreamId(req);
      if (hold !== null) {
        heldStreams.set(hold, res);
        res.on('close', () => heldStreams.delete(hold));
        res.write(payload);
        return;
      }
      // 故意在中文的 UTF-8 字节序列中间切开，验证跨 chunk 多字节字符不被替换。
      const payloadBuffer = Buffer.from(payload, 'utf8');
      const splitAt = payloadBuffer.indexOf(Buffer.from('中', 'utf8')) + 1;
      res.write(payloadBuffer.subarray(0, splitAt));
      res.end(payloadBuffer.subarray(splitAt));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = (upstream.address() as { port: number }).port;
  const config: PlatformConfig = {
    setupKey: 'test-setup-key', dbPath: path.join(tempDir, 'test.db'), dbEncKey: 'test-key',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: `http://127.0.0.1:${upstreamPort}`,
      tls: null, redirectPort: null, publicHost: '', domain: 'localhost', autoTls: false,
      acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: 'test-secret', internalSecret: 'test-internal',
    patch: { dshRoot: '', restartService: '' },
    endpointRules: [],
  };
  jwtSecret = config.jwtSecret;
  adminCookie = `dsh_gateway_token=${jwt.sign({ sub: String(admin.id), username: admin.username, cv: 0 }, config.jwtSecret, { expiresIn: '12h' })}`;
  userCookie = `dsh_gateway_token=${jwt.sign({ sub: String(user.id), username: user.username, cv: 0 }, config.jwtSecret, { expiresIn: '12h' })}`;
  freshCookie = `dsh_gateway_token=${jwt.sign({ sub: String(fresh.id), username: fresh.username, cv: 0 }, config.jwtSecret, { expiresIn: '12h' })}`;
  gateway = createGatewayServer(config, new AuthService(config, db), db);
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  port = (gateway.address() as { port: number }).port;
});

after(() => {
  for (const stream of heldStreams.values()) {
    try { stream.destroy(); } catch { /* 测试收尾时尽力释放 */ }
  }
  heldStreams.clear();
  gateway?.close();
  upstream?.close();
  db?.close();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* Windows cleanup is best effort */ }
});

test('Issue #20: 子用户 host SSE 仅接收已授权工作区和会话，且不泄露 cwd', async () => {
  const snapshot = await request('/api/workspace.list', userCookie);
  assert.equal(snapshot.status, 200);

  const response = await request('/api/events.host', userCookie);
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.body, /hidden-workspace|hidden-session|\/work\/hidden|\/work\/also-allowed/);
  assert.match(response.body, /visible-workspace|visible-session/);
  assert.doesNotMatch(response.body, /disabled-session/);
  assert.doesNotMatch(response.body, /cwd|parentSessionId/);
});

test('Issue #20: 管理员 host SSE 保持原始事件流', async () => {
  const response = await request('/api/events.host', adminCookie);
  assert.equal(response.status, 200);
  assert.match(response.body, /hidden-workspace|hidden-session/);
  assert.match(response.body, /cwd/);
});

test('Issue #20: workspace-changed 携带白名单外路径时丢弃', async () => {
  await request('/api/workspace.list', userCookie);
  const response = await request('/api/events.host', userCookie);
  assert.doesNotMatch(response.body, /renamed-outside|also-allowed/);
});

test('Issue #20: workspace-changed 路径与其他用户所有权冲突时丢弃', async () => {
  await request('/api/workspace.list', userCookie);
  const response = await request('/api/events.host', userCookie);
  assert.doesNotMatch(response.body, /collision-path/);
  assert.doesNotMatch(response.body, /"workspaceId":"visible-workspace","path":"\/work\/hidden"/);
});

test('Issue #20: 隐藏会话的 session-removed/session-status/agent-error 均丢弃', async () => {
  await request('/api/workspace.list', userCookie);
  const response = await request('/api/events.host', userCookie);
  for (const needle of ['removed-hidden', 'status-hidden', 'error-hidden']) {
    assert.doesNotMatch(response.body, new RegExp(needle));
  }
  for (const needle of ['removed-visible', 'status-visible', 'error-visible']) {
    assert.match(response.body, new RegExp(needle));
  }
});

test('Issue #20: unknown or malformed host frames are fail-closed', async () => {
  await request('/api/workspace.list', userCookie);
  const response = await request('/api/events.host', userCookie);
  assert.doesNotMatch(response.body, /unknown-type|malformed-payload|host\/unknown|work\/hidden/);
});

test('Issue #20: host/remote-event 对子用户一律丢弃', async () => {
  await request('/api/workspace.list', userCookie);
  const response = await request('/api/events.host', userCookie);
  assert.doesNotMatch(response.body, /remote-event|workspace\/somewhere/);
});

test('Issue #20: mux 只透传已授权会话事件，stream/error 与隐藏会话丢弃', async () => {
  await request('/api/workspace.list', userCookie);
  const response = await request('/api/events.mux', userCookie);
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.body, /mux-hidden|mux-subscribed-hidden|mux-approval-hidden|mux-error/);
  assert.match(response.body, /mux-visible|mux-subscribed-visible|mux-queue-visible/);
});

test('Issue #20: 裸 CR 注释后的隐藏 host 事件仍被过滤', async () => {
  await request('/api/workspace.list', userCookie);
  const response = await request('/api/events.host', userCookie);
  // 无过滤时该帧（注释行 + 裸 CR + data 行）会整帧放行，泄露 hidden-session。
  assert.doesNotMatch(response.body, /cr-comment-hidden/);
  assert.doesNotMatch(response.body, /hidden-session/);
  assert.match(response.body, /visible-session/);
});

test('Issue #20: 裸 CR 注释后的隐藏 mux 事件仍被过滤', async () => {
  await request('/api/workspace.list', userCookie);
  const response = await request('/api/events.mux', userCookie);
  assert.doesNotMatch(response.body, /cr-comment-hidden-mux/);
  assert.match(response.body, /mux-visible/);
});

test('Issue #20: 跨 chunk 的多字节 UTF-8 字符在 host 过滤后不被替换', async () => {
  await request('/api/workspace.list', userCookie);
  const response = await request('/api/events.host', userCookie);
  assert.match(response.body, /emoji-😀-中文/);
  assert.doesNotMatch(response.body, /\uFFFD/);
});

test('Issue #20: 跨 chunk 的多字节 UTF-8 字符在 mux 过滤后不被替换', async () => {
  await request('/api/workspace.list', userCookie);
  const response = await request('/api/events.mux', userCookie);
  assert.match(response.body, /e-中文/);
  assert.doesNotMatch(response.body, /\uFFFD/);
});

test('Issue #20: 未建立快照前敏感事件一律 fail-closed 丢弃', async () => {
  const response = await request('/api/events.host', freshCookie);
  assert.equal(response.status, 200);
  assert.equal(response.body, '');
  const mux = await request('/api/events.mux', freshCookie);
  assert.equal(mux.body, '');
});

test('Issue #20: 并行 SSE 连接互不影响对方工作区快照', async () => {
  await request('/api/workspace.list', userCookie);
  const [first, second] = await Promise.all([
    request('/api/events.host', userCookie),
    request('/api/events.host', userCookie),
  ]);
  assert.match(first.body, /visible-workspace/);
  assert.match(second.body, /visible-workspace/);
  assert.doesNotMatch(second.body, /hidden-workspace/);
});

// ── SSE 长连接的生命周期：权限变更/登出/凭据变更必须终止旧订阅 ──────────────
// 旧线 /api/events.host|events.mux 是 HTTP SSE 长连接。没有登记机制时，撤销授权
// 后连接会继续持有升级时身份（主用户为原样透传，泄露面更大）；这里验证它们与 WS
// 通道同口径：登记后由 closeUserWebSocketClients 统一终止。

interface HeldSseConnection {
  status: number;
  /** 等待累积下行内容匹配模式；超时即失败。 */
  waitForMatch: (pattern: RegExp, label: string) => Promise<string>;
  closed: Promise<void>;
  destroy: () => void;
}

function openHeldSse(
  pathname: string,
  cookie: string,
  extraHeaders: Record<string, string> = {},
): Promise<HeldSseConnection> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(`SSE 未建立响应：${pathname}`)); }, 8000);
    const req = http.request(
      { host: '127.0.0.1', port, path: pathname, method: 'GET', headers: { cookie, ...extraHeaders } },
      (res) => {
        clearTimeout(timer);
        let text = '';
        const waiters: Array<{ pattern: RegExp; resolve: (value: string) => void; timer: NodeJS.Timeout }> = [];
        const closed = new Promise<void>((settle) => { res.on('close', () => settle()); });
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString('utf8');
          for (let index = waiters.length - 1; index >= 0; index -= 1) {
            const waiter = waiters[index];
            if (!waiter.pattern.test(text)) continue;
            clearTimeout(waiter.timer);
            waiters.splice(index, 1);
            waiter.resolve(text);
          }
        });
        const waitForMatch = (pattern: RegExp, label: string): Promise<string> => {
          if (pattern.test(text)) return Promise.resolve(text);
          return new Promise<string>((settle, fail) => {
            const waiter = {
              pattern,
              resolve: settle,
              timer: setTimeout(() => {
                const index = waiters.indexOf(waiter);
                if (index >= 0) waiters.splice(index, 1);
                fail(new Error(`${label}: 未收到匹配 ${String(pattern)} 的下行数据`));
              }, 2000),
            };
            waiters.push(waiter);
          });
        };
        resolve({ status: res.statusCode ?? 0, waitForMatch, closed, destroy: () => req.destroy() });
      },
    );
    req.on('error', (error) => { clearTimeout(timer); reject(error); });
    req.end();
  });
}

function post(
  pathname: string,
  cookie: string,
  body: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error(`POST 无响应：${pathname}`)); }, 5000);
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
        ...extraHeaders,
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }); });
    });
    req.on('error', (error) => { clearTimeout(timer); reject(error); });
    req.end(body);
  });
}

/** 事件流必须在撤销后立即关闭；超时即视为失败。 */
async function expectSseClosed(closed: Promise<void>, label: string): Promise<void> {
  const closedInTime = await Promise.race([
    closed.then(() => true),
    new Promise<boolean>((resolve) => { setTimeout(() => resolve(false), 2000); }),
  ]);
  assert.equal(closedInTime, true, `${label}: SSE 长连接必须在撤销后关闭`);
}

async function waitForAnyData(sse: HeldSseConnection, label: string): Promise<void> {
  await sse.waitForMatch(/./s, `${label}（任意下行数据）`);
}

/** 专用子用户：allowedFolders 由调用方指定（默认是可授与的单目录），避免权限保存触发上游资源校验。 */
function makeSubuser(name: string, allowedFolders: string[] = ['/work/sse']): { id: number; cookie: string } {
  const created = db.createUser(name, '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(created.id, {
    allowedFolders, hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: false, allowWorkspaceCreate: false,
    disabledSessions: [], banned: false, sandboxMode: null,
  });
  const cookie = `dsh_gateway_token=${jwt.sign(
    { sub: String(created.id), username: created.username, cv: 0 },
    jwtSecret,
    { expiresIn: '12h' },
  )}`;
  return { id: created.id, cookie };
}

async function waitForRelease(id: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!heldStreams.has(id)) return;
    await new Promise((resolve) => { setTimeout(resolve, 20); });
  }
  assert.equal(heldStreams.has(id), false, `${id}: 客户端断开后上游订阅必须释放`);
}

test('SSE 生命周期：子用户登出后 events.host 长连接立即关闭', async () => {
  const sub = makeSubuser('sse-logout-sub');
  await request('/api/workspace.list', sub.cookie);
  const sse = await openHeldSse('/api/events.host', sub.cookie, { 'x-test-hold': 'logout-host' });
  try {
    assert.equal(sse.status, 200);
    await sse.waitForMatch(/sse-workspace/, 'logout host');
    const logout = await post('/gateway/logout', sub.cookie, '{}');
    assert.equal(logout.status, 302, logout.body);
    await expectSseClosed(sse.closed, 'logout host');
  } finally {
    sse.destroy();
  }
});

test('SSE 生命周期：权限变更后 events.mux 长连接立即关闭', async () => {
  const sub = makeSubuser('sse-perms-sub');
  await request('/api/workspace.list', sub.cookie);
  const sse = await openHeldSse('/api/events.mux', sub.cookie, { 'x-test-hold': 'perms-mux' });
  try {
    assert.equal(sse.status, 200);
    await sse.waitForMatch(/mux-sse/, 'permission change mux');
    const saved = await post('/gateway/api/permissions', adminCookie, JSON.stringify({
      userId: sub.id,
      allowedFolders: ['__deny__'],
    }));
    assert.equal(saved.status, 200, saved.body);
    await expectSseClosed(sse.closed, 'permission change mux');
  } finally {
    sse.destroy();
  }
});

test('SSE 生命周期：权限同值保存不关闭长连接', async () => {
  const sub = makeSubuser('sse-noop-sub', ['__deny__']);
  await request('/api/workspace.list', sub.cookie);
  const sse = await openHeldSse('/api/events.host', sub.cookie, { 'x-test-hold': 'noop-host' });
  try {
    await waitForAnyData(sse, 'no-op permission save');
    const saved = await post('/gateway/api/permissions', adminCookie, JSON.stringify({
      userId: sub.id,
      allowedFolders: ['__deny__'],
      allowUpload: true,
      allowGitDownload: false,
      allowWorkspaceCreate: false,
    }));
    assert.equal(saved.status, 200, saved.body);
    const closed = await Promise.race([
      sse.closed.then(() => true),
      new Promise<boolean>((resolve) => { setTimeout(() => resolve(false), 200); }),
    ]);
    assert.equal(closed, false, '同值保存不得关闭长连接');
  } finally {
    sse.destroy();
  }
});

test('SSE 生命周期：凭据变更（session-invalidate）关闭子用户 events.mux 长连接', async () => {
  const sub = makeSubuser('sse-invalidate-sub');
  await request('/api/workspace.list', sub.cookie);
  const sse = await openHeldSse('/api/events.mux', sub.cookie, { 'x-test-hold': 'invalidate-mux' });
  try {
    await waitForAnyData(sse, 'session invalidate mux');
    const invalidated = await post(
      '/gateway/internal/session-invalidate',
      '',
      JSON.stringify({ userId: sub.id }),
      { 'x-internal-secret': 'test-internal' },
    );
    assert.equal(invalidated.status, 200, invalidated.body);
    await expectSseClosed(sse.closed, 'session invalidate mux');
  } finally {
    sse.destroy();
  }
});

test('SSE 生命周期：主用户（原样透传）登出后 events.host 长连接也关闭', async () => {
  const admin = db.createUser('sse-logout-admin', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
  const cookie = `dsh_gateway_token=${jwt.sign(
    { sub: String(admin.id), username: admin.username, cv: 0 },
    jwtSecret,
    { expiresIn: '12h' },
  )}`;
  const sse = await openHeldSse('/api/events.host', cookie, { 'x-test-hold': 'logout-admin-host' });
  try {
    assert.equal(sse.status, 200);
    await sse.waitForMatch(/sse-workspace/, 'admin logout host');
    const logout = await post('/gateway/logout', cookie, '{}');
    assert.equal(logout.status, 302, logout.body);
    await expectSseClosed(sse.closed, 'admin logout host');
  } finally {
    sse.destroy();
  }
});

test('SSE 生命周期：客户端断开后上游订阅同步释放', async () => {
  const sub = makeSubuser('sse-abort-sub');
  await request('/api/workspace.list', sub.cookie);
  const sse = await openHeldSse('/api/events.host', sub.cookie, { 'x-test-hold': 'abort-host' });
  try {
    await waitForAnyData(sse, 'client abort host');
    assert.equal(heldStreams.has('abort-host'), true);
    sse.destroy();
    await waitForRelease('abort-host');
  } finally {
    sse.destroy();
  }
});