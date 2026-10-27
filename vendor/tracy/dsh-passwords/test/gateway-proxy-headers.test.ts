// 回归测试（issue #1）：网关响应不得同时携带 Content-Length 与 Transfer-Encoding
//
// 根因回顾：dsh 上游以 chunked（Transfer-Encoding: chunked）返回 HTML/JSON 时，
// 网关改写路径（HTML 注入、workspace.list / session.list / session.history 过滤）
// 重算了 body 并设置了新的 content-length，但没有删掉上游的 transfer-encoding，
// Node http 服务端会把两个头原样发出 → 畸形消息 → Nginx（NPM）直接 502。
//
// 修复后契约（RFC 9110 §8.6）：
//   - 改写路径：只有 content-length，绝不带 transfer-encoding
//   - 流式透传 / JSON 解析失败回退：保留上游 transfer-encoding（chunked），
//     绝不带 content-length；任何路径都不得同时出现两者
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { WebSocketServer, WebSocket: NodeWebSocket } = require('ws') as {
  WebSocketServer: new (options?: { noServer?: boolean }) => any;
  WebSocket: {
    new (url: string, options?: { headers?: Record<string, string> }): any;
    OPEN: number;
  };
};

import { createGatewayServer, requestBodyLimitFor, DEFAULT_USER_REQUEST_BODY_BYTES, ADMIN_REQUEST_BODY_BYTES } from '../src/gateway.js';
import { AuthService } from '../src/auth.js';
import { Database } from '../src/db.js';
import { createFieldCrypto } from '../src/encrypt.js';
import type { PlatformConfig } from '../src/config.js';

const HTML_BODY = '<html><head><title>home</title></head><body>hello</body></html>';
const WORKSPACES_JSON = JSON.stringify({
  ok: true,
  data: [{ id: 'ws-1', path: '/workspaces/a' }],
});
const ARCHIVED_WORKSPACES_JSON = JSON.stringify({
  rpcId: 'workspace-list-archive-regression',
  result: {
    ok: true,
    value: {
      items: [
        {
          workspaceId: 'ws-visible',
          path: '/workspaces/a',
          sessionIds: ['s-active', 's-archived', 's-disabled'],
        },
        {
          workspaceId: 'ws-hidden',
          path: '/workspaces/b',
          sessionIds: ['s-other-user'],
        },
      ],
      archivedSessionIds: ['s-archived', 's-other-user', 's-disabled'],
    },
  },
});
/** 已分配可见工作区的 workspace.list 形状：用于在无 Remote 基线时灌入全局
 *  workspaceId→path 快照（x-test-mode: assigned-visible）。 */
const ASSIGNED_VISIBLE_WORKSPACES_JSON = JSON.stringify({
  rpcId: 'workspace-list-assigned-visible',
  result: {
    ok: true,
    value: {
      items: [
        {
          workspaceId: 'workspace-visible',
          path: '/workspaces/visible',
          title: 'Visible workspace',
          sessionIds: ['session-visible'],
        },
      ],
      archivedSessionIds: [],
    },
  },
});

let tempDir: string;
let db: Database;
let auth: AuthService;
let upstream: http.Server;
let gateway: http.Server;
let gatewayPort = 0;
let cookie = '';
/** 会话 JWT 明文（Cookie Chaos 回归测试用：构造 Unicode 前缀的伪同名 cookie） */
let tokenValue = '';
/** 上游最后一次收到的请求头（F-15 回归测试用：验证网关 cookie 不被透传） */
let lastUpstreamHeaders: http.IncomingHttpHeaders = {};
/** 上游最后一次收到的请求 URL（凭据 query 清洗回归用） */
let lastUpstreamUrl = '';
let sandboxStatusCode = 200;
let sandboxSessionSequence = 0;
/** 上游收到的沙盒注入请求（内部接口 body { sessionId, mode }）。 */
let sandboxRequests: Array<{ sessionId: string; mode: string }> = [];
/** 上游收到的 session/prompt 次数（区分“沙盒注入后转发”与“未转发”）。 */
let promptUpstreamCount = 0;
let workspaceCreateMakesNewWorkspace = false;
/** 回归用：createDirectory 让上游回一个请求父目录之外的路径（模拟上游被替换/回归）。 */
let directoryCreateEscapePath: string | null = null;
let failNextSessionCreate = false;
let workspaceOrderResponseWorkspaceId = 'ws-visible';
let delaySessionCreateResponse = false;
let dropDelayedWorkspaceUpsert = false;
let sessionSearchResponseMode: 'valid' | 'malformed' = 'valid';
/** schedule/catalog 响应形状：'malformed' 模拟官方成功信封下 value 不是数组（子用户必须 fail-closed）。 */
let scheduleCatalogResponseMode: 'ok' | 'malformed' = 'ok';
let releaseSessionCreateResponse: (() => void) | null = null;
let createdSessionIdForMock = 'created-session';
let wireCreatedSessionId = '';
let delayedWorkspaceClient: any = null;
let delayedWorkspaceStreamId = '';
let assignableResources = {
  folders: ['/workspaces/visible'],
  sessions: ['session-visible', 'session-hidden', 'session-newly-shared'],
};
let assignableResourcesUnavailable = false;
let assignableResourcesDelayMs = 0;
let remoteMuxOpenEndpoints: string[] = [];
let remoteMuxOpenFrames: Array<Record<string, unknown>> = [];
let remoteMuxCancelStreamIds: string[] = [];
/** 回归用：上游收到的浏览器上行帧（0.1.7-alpha.1 的 item/end）。 */
let remoteMuxUplinkFrames: Array<Record<string, unknown>> = [];
/** 回归用：workspace/follow baseline 携带的 pinnedSessionIds（null = 不下发，模拟 0.1.6）。 */
let remoteMuxBaselinePinnedSessionIds: unknown[] | null = null;
/** 回归用：baseline 之后追加的 pinned 增量集合（null = 不发送）。 */
let remoteMuxPinnedIncrement: unknown[] | null = null;
let remoteMuxHistoryPayloadBytes = 0;
/** 回归用：workspace/follow baseline 的「可见工作区」路径（默认与旧用例一致）。 */
let remoteMuxBaselineVisiblePath = '/workspaces/visible';
let remoteMuxBaselineVisibleSessionIds = ['session-visible'];
/** 回归用：baseline 是否省略可见工作区（模拟不完整的可见性快照）。 */
let remoteMuxBaselineOmitVisibleWorkspace = false;
/** 回归用：上游在收到 cancel 后仍发出该流的迟到 item/end（官方 Remote 契约允许）。 */
let remoteMuxLateFrameOnCancel = false;
/** 回归用：workspace.archiveSession/unarchiveSession 成功响应回带的宿主全局归档集合
 *  （null = 使用默认 mock 响应，不进入归档分支）。 */
let archiveSessionResponseMode: 'ok' | 'malformed' | null = null;
/** 回归用：workspace/create 成功响应 workspace.sessionIds（null = 默认空数组；
 *  非数组用于模拟上游形状回归）。 */
let workspaceCreateResponseSessionIds: unknown = null;
/** 回归用：workspace.list 的 pinnedSessionIds 形状（'malformed' = 存在但不是数组）。 */
let workspaceListPinnedMode: 'ok' | 'malformed' = 'ok';
/** 回归用：改写 session/follow 首帧 snapshot 的 header.id，制造身份不匹配。 */
let remoteMuxSnapshotHeaderId: string | null = null;
let lastRawUploadBody = Buffer.alloc(0);
let lastSelectModelBody: Record<string, unknown> | null = null;
let lastScopedRequestBody: Record<string, unknown> | null = null;
/** 响应头超时回归：上游接受请求后不回响应头也不断开（模拟上游卡死）。 */
let holdResponseHeaders = false;
/** 响应头超时回归：上游先回响应头，再延迟该毫秒数结束 body（模拟 SSE/长响应）。 */
let slowResponseBodyMs = 0;
let mockSshHosts: Array<{ alias: string; host: string }> = [
  { alias: 'admin-host', host: '198.51.100.10' },
];

/** mock 上游：刻意不设 content-length（write 分段写），Node 会以 chunked 分帧——
 *  这正是生产环境 dsh 的行为，也是触发原 bug 的前提 */
function startMockUpstream(): Promise<http.Server> {
  return new Promise((resolve) => {
    const remoteMux = new WebSocketServer({ noServer: true });
    remoteMux.on('connection', (client: any) => {
      client.on('message', (data: Buffer) => {
        const frame = JSON.parse(data.toString()) as Record<string, unknown> & { type?: string; streamId?: string; endpoint?: string };
        // 0.1.7-alpha.1 浏览器上行帧：上游只做记录，用于断言网关是否转发。
        if (frame.type === 'item' || frame.type === 'end') {
          remoteMuxUplinkFrames.push(frame);
          return;
        }
        if (frame.type === 'cancel' && typeof frame.streamId === 'string') {
          remoteMuxCancelStreamIds.push(frame.streamId);
          // 官方语义允许上游在 cancel 后仍投递已排队的帧。仅在回归测试中启用，
          // 用于断言网关按逻辑流丢弃它们而不是关闭整条 carrier。
          if (remoteMuxLateFrameOnCancel) {
            client.send(JSON.stringify({
              type: 'item',
              streamId: frame.streamId,
              value: { type: 'event', seq: 99, records: ['late-after-cancel'] },
            }));
            client.send(JSON.stringify({ type: 'end', streamId: frame.streamId }));
          }
          return;
        }
        if (frame.type !== 'open' || typeof frame.streamId !== 'string' || typeof frame.endpoint !== 'string') return;
        remoteMuxOpenEndpoints.push(frame.endpoint);
        remoteMuxOpenFrames.push(frame);
        if (frame.endpoint === 'terminal/follow' || frame.endpoint === 'terminal/retain') {
          client.send(JSON.stringify({
            type: 'item',
            streamId: frame.streamId,
            value: { type: 'terminal/output', terminalId: 'term-owner-1', data: 'owner-shell-bytes' },
          }));
          return;
        }
        if (frame.endpoint === 'workspaceFiles/changes') {
          const payload = frame.payload as Record<string, unknown> | undefined;
          const args = payload?.args as Record<string, unknown> | undefined;
          const targetPath = typeof args?.path === 'string' ? args.path : '/workspaces/visible/app.ts';
          client.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: { kind: 'ready' } }));
          client.send(JSON.stringify({
            type: 'item', streamId: frame.streamId,
            value: { kind: 'change', change: { absolutePath: targetPath, version: 'v1' } },
          }));
          client.send(JSON.stringify({
            type: 'item', streamId: frame.streamId,
            value: { kind: 'change', change: { absolutePath: '/workspaces/hidden/secret.txt', version: 'hidden' } },
          }));
          client.send(JSON.stringify({ type: 'end', streamId: frame.streamId }));
          return;
        }
        if (frame.endpoint === 'future/plugin' || frame.endpoint === 'future/remote/terminal/stream') {
          client.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: { type: 'plugin/opaque', ok: true } }));
          return;
        }
        if (frame.endpoint === 'job/list') {
          client.send(JSON.stringify({
            type: 'item',
            streamId: frame.streamId,
            value: { type: 'rows', jobs: [
              { id: 'job-visible', owner: 'session-visible', label: 'visible' },
              { id: 'job-hidden', owner: 'session-hidden', label: 'hidden' },
              { id: 'job-ownerless', label: 'host job' },
            ] },
          }));
          client.send(JSON.stringify({ type: 'end', streamId: frame.streamId }));
          return;
        }
        if (frame.endpoint === 'job/follow') {
          const payload = frame.payload as { args?: { request?: { jobId?: string } } } | undefined;
          const jobId = payload?.args?.request?.jobId ?? '';
          const owner = jobId === 'job-visible' ? 'session-visible' : 'session-hidden';
          client.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: {
            type: 'opened', job: { id: jobId, owner },
          } }));
          client.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value: {
            type: 'output', chunks: [`${owner}-output`],
          } }));
          client.send(JSON.stringify({ type: 'end', streamId: frame.streamId }));
          return;
        }
        if (frame.endpoint === 'workspace/follow') {
          client.send(JSON.stringify({
            type: 'item',
            streamId: frame.streamId,
            value: {
              type: 'baseline',
              value: {
                items: [
                  ...(remoteMuxBaselineOmitVisibleWorkspace ? [] : [{
                    workspaceId: 'workspace-visible',
                    path: remoteMuxBaselineVisiblePath,
                    title: 'Visible workspace',
                    sessionIds: remoteMuxBaselineVisibleSessionIds,
                  }]),
                  {
                    workspaceId: 'workspace-hidden',
                    path: '/workspaces/hidden',
                    title: 'Hidden workspace',
                    sessionIds: ['session-hidden'],
                  },
                ],
                archivedSessionIds: [],
                ...(remoteMuxBaselinePinnedSessionIds === null
                  ? {}
                  : { pinnedSessionIds: remoteMuxBaselinePinnedSessionIds }),
              },
            },
          }));
          if (remoteMuxPinnedIncrement !== null) {
            client.send(JSON.stringify({
              type: 'item',
              streamId: frame.streamId,
              value: { type: 'pinned', pinnedSessionIds: remoteMuxPinnedIncrement },
            }));
          }
          // The Host publishes the durable attach once the delayed create
          // request is received, while its unary response is still pending.
          if (delaySessionCreateResponse) {
            delayedWorkspaceClient = client;
            delayedWorkspaceStreamId = frame.streamId;
          }
          return;
        }
        if (frame.endpoint === '$events') {
          client.send(JSON.stringify({
            type: 'item',
            streamId: frame.streamId,
            value: { type: 'ready', clientId: 'remote-client', host: { home: '/root' } },
          }));
          client.send(JSON.stringify({
            type: 'item',
            streamId: frame.streamId,
            value: {
              type: 'emit', event: 'api-session/added',
              args: [{ sessionId: 'session-visible', cwd: '/workspaces/visible', parentSessionId: 'admin-session' }],
            },
          }));
          client.send(JSON.stringify({
            type: 'item',
            streamId: frame.streamId,
            value: { type: 'emit', event: 'api-session/status', args: ['session-hidden', true] },
          }));
          client.send(JSON.stringify({
            type: 'item',
            streamId: frame.streamId,
            value: {
              type: 'waterfall', event: 'user-questions/request', eventId: 'question-visible', agentId: 'session-visible',
              request: { questions: [{ id: 'language', question: 'Choose language', options: [{ label: 'Chinese' }, { label: 'English' }] }] },
            },
          }));
          client.send(JSON.stringify({
            type: 'item',
            streamId: frame.streamId,
            value: {
              type: 'waterfall', event: 'user-questions/request', eventId: 'question-hidden', agentId: 'session-hidden',
              request: { questions: [{ id: 'secret', question: 'Hidden question', options: [{ label: 'No' }] }] },
            },
          }));
          client.send(JSON.stringify({
            type: 'item',
            streamId: frame.streamId,
            value: {
              type: 'waterfall', event: 'approval/request', eventId: 'approval-visible', agentId: 'session-visible',
              request: { approvalId: 'approval-1', toolName: 'shell' },
            },
          }));
          return;
        }
        if (frame.endpoint === 'session/follow') {
          if (remoteMuxHistoryPayloadBytes > 0) {
            client.send(JSON.stringify({
              type: 'item',
              streamId: frame.streamId,
              value: {
                type: 'snapshot',
                header: { id: 'session-visible' },
                cursor: 1,
                records: [{ type: 'event', event: { type: 'user/message', seq: 1, time: 1, data: 'x'.repeat(remoteMuxHistoryPayloadBytes) } }],
                hasMore: false,
                projections: { asOfSeq: 1, values: {} },
              },
            }));
            return;
          }
          const payload = frame.payload as Record<string, unknown> | undefined;
          const args = payload?.args as Record<string, unknown> | undefined;
          const request = args?.request as Record<string, unknown> | undefined;
          const address = request?.address as Record<string, unknown> | undefined;
          if (address?.kind === 'subagent') {
            client.send(JSON.stringify({
              type: 'item',
              streamId: frame.streamId,
              value: {
                type: 'snapshot',
                header: { id: address.childSessionId, origin: 'subagent', parentSession: address.parentSessionId },
                cursor: 17,
                records: [{ type: 'event', event: { type: 'message', seq: 17, text: 'child history' } }],
                projections: { model: 'test-model' },
                hasMore: true,
              },
            }));
            client.send(JSON.stringify({
              type: 'item',
              streamId: frame.streamId,
              value: { type: 'event', seq: 18, records: ['child-live-event'] },
            }));
          } else {
            client.send(JSON.stringify({
              type: 'item',
              streamId: frame.streamId,
              value: {
                type: 'snapshot',
                header: { id: remoteMuxSnapshotHeaderId ?? 'session-visible' },
                cursor: 1,
                records: [{ type: 'event', event: { type: 'user/message', seq: 1, time: 1, data: 'authorized session history' } }],
                hasMore: false,
                projections: { asOfSeq: 1, values: {} },
              },
            }));
          }
          return;
        }
        if (frame.endpoint === 'session/control') {
          client.send(JSON.stringify({
            type: 'item',
            streamId: frame.streamId,
            value: {
              type: 'baseline',
              value: {
                queues: { 'session-visible': { active: true }, 'session-hidden': { active: true } },
                jobs: {},
                projections: {},
              },
            },
          }));
        }
      });
    });
    const server = http.createServer((req, res) => {
      lastUpstreamHeaders = req.headers;
      lastUpstreamUrl = req.url ?? '';
      const badJson = req.headers['x-test-mode'] === 'bad-json';
      if ((req.url ?? '').startsWith('/html')) {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.write(HTML_BODY.slice(0, 20)); // 无 CL 的多次 write → chunked
        res.end(HTML_BODY.slice(20));
      } else if ((req.url ?? '').startsWith('/api/dsh-passwords/internal/sandbox')) {
        const sandboxChunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => sandboxChunks.push(chunk));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(sandboxChunks).toString('utf8')) as { sessionId?: unknown; mode?: unknown };
            if (typeof body.sessionId === 'string' && typeof body.mode === 'string') {
              sandboxRequests.push({ sessionId: body.sessionId, mode: body.mode });
            }
          } catch {
            // 形状非法的注入请求不记录：被测代码不应发出这种请求。
          }
          res.writeHead(sandboxStatusCode, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: sandboxStatusCode >= 200 && sandboxStatusCode < 300 }));
        });
      } else if (/^\/api\/session[.\/]prompt(?:[?]|$)/.test(req.url ?? '')) {
        promptUpstreamCount += 1;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ result: { ok: true, value: { accepted: true } } }));
      } else if (/^\/api\/workspace(?:\.|\/)create(?:[?]|$)/.test(req.url ?? '')) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          let requestedPath = workspaceCreateMakesNewWorkspace ? '/workspaces/owned' : '/workspaces/visible';
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
            const args = (parsed as { payload?: { args?: { request?: { path?: unknown } } } }).payload?.args?.request;
            if (typeof args?.path === 'string' && args.path.length > 0) requestedPath = args.path;
            else if (typeof (parsed as { path?: unknown }).path === 'string') requestedPath = (parsed as { path: string }).path;
          } catch {
            // keep default mock path
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ result: { ok: true, value: {
            workspace: {
              workspaceId: `ws-${requestedPath.replace(/[^A-Za-z0-9]+/g, '-')}`,
              path: requestedPath,
              title: 'Mock workspace',
              sessionIds: workspaceCreateResponseSessionIds ?? [],
            },
            created: workspaceCreateMakesNewWorkspace,
          } } }));
        });
      } else if (/^\/api\/(?:directoryPicker(?:\.|\/)createDirectory|host(?:\.|\/)createDirectory)(?:[?]|$)/.test(req.url ?? '')) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          let parent = '';
          let name = 'child';
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
            const args = (parsed as { payload?: { args?: { path?: unknown; name?: unknown } } }).payload?.args;
            if (typeof args?.path === 'string') parent = args.path;
            else if (typeof (parsed as { path?: unknown }).path === 'string') parent = (parsed as { path: string }).path;
            if (typeof args?.name === 'string') name = args.name;
            else if (typeof (parsed as { name?: unknown }).name === 'string') name = (parsed as { name: string }).name;
          } catch {
            // fall through with defaults
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ result: { ok: true, value: directoryCreateEscapePath ?? `${parent.replace(/\/+$/, '')}/${name}` } }));
        });
      } else if (/^\/api\/(?:directoryPicker(?:\.|\/)list|host(?:\.|\/)listDirectory)(?:[?]|$)/.test(req.url ?? '')) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          let requested = '/root';
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
            const args = (parsed as { payload?: { args?: { path?: unknown } } }).payload?.args;
            if (typeof args?.path === 'string' && args.path.length > 0) requested = args.path;
          } catch {
            // default home listing
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ result: { ok: true, value: {
            path: requested,
            home: '/root',
            crumbs: [
              { name: '/', path: '/', hidden: false },
              { name: 'root', path: '/root', hidden: false },
            ],
            entries: [
              { name: '33', path: '/root/33', hidden: false },
              { name: 'other-user', path: '/root/other-user', hidden: false },
              { name: 'visible', path: '/workspaces/visible', hidden: false },
              { name: 'other', path: '/workspaces/other', hidden: false },
            ],
            truncated: false,
          } } }));
        });
      } else if ((req.url ?? '').startsWith('/api/dsh-passwords/internal/assignable-resources')) {
        const sendResources = () => {
          res.writeHead(assignableResourcesUnavailable ? 503 : 200, { 'content-type': 'application/json' });
          res.end(assignableResourcesUnavailable ? JSON.stringify({ ok: false }) : JSON.stringify({ ok: true, ...assignableResources }));
        };
        if (assignableResourcesDelayMs > 0) setTimeout(sendResources, assignableResourcesDelayMs);
        else sendResources();
      } else if ((req.url ?? '').startsWith('/api/session/uploadFileBinary')) {
        const requestChunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => requestChunks.push(chunk));
        req.on('end', () => {
          lastRawUploadBody = Buffer.concat(requestChunks);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, uploaded: lastRawUploadBody.length }));
        });
      } else if (/^\/api\/session(?:[.]|\/)selectModel(?:[?]|$)/.test(req.url ?? '')) {
        const requestChunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => requestChunks.push(chunk));
        req.on('end', () => {
          try {
            lastSelectModelBody = JSON.parse(Buffer.concat(requestChunks).toString('utf8')) as Record<string, unknown>;
          } catch {
            lastSelectModelBody = null;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ result: { ok: true, value: { accepted: true } } }));
        });
      } else if ((req.url ?? '').startsWith('/api/session.create')) {
        const requestChunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => requestChunks.push(chunk));
        req.on('end', () => {
          try {
            const request = JSON.parse(Buffer.concat(requestChunks).toString('utf8')) as Record<string, unknown>;
            createdSessionIdForMock = extractSessionIdForTest(request) ?? 'created-session';
            wireCreatedSessionId = createdSessionIdForMock;
          } catch {
            createdSessionIdForMock = 'created-session';
          }
          const respond = () => {
            res.writeHead(200, { 'content-type': 'application/json' });
            if (failNextSessionCreate) {
              failNextSessionCreate = false;
              res.end(JSON.stringify({ result: { ok: false, error: { code: 'session/workspace-attach-failed', details: { sessionId: createdSessionIdForMock } } } }));
              return;
            }
            res.end(JSON.stringify({ result: { value: { sessionId: createdSessionIdForMock, cwd: '/workspaces/visible' } } }));
          };
          if (delaySessionCreateResponse) {
            if (!dropDelayedWorkspaceUpsert) {
              delayedWorkspaceClient?.send(JSON.stringify({
                type: 'item',
                streamId: delayedWorkspaceStreamId,
                value: {
                  type: 'upsert',
                  workspace: {
                    workspaceId: 'workspace-visible',
                    path: '/workspaces/visible',
                    title: 'Visible workspace',
                    sessionIds: ['session-visible', createdSessionIdForMock],
                  },
                },
              }));
            }
            releaseSessionCreateResponse = respond;
          } else {
            respond();
          }
        });
      } else if (
        /^\/api\/session[.\/](?:history|page)$/.test(req.url ?? '') &&
        (req.headers['x-test-mode'] === 'raw-fallback-br' || req.headers['x-test-mode'] === 'raw-fallback-bad-json')
      ) {
        // 回归：上游以不支持的 content-encoding: br 或畸形 JSON 回带标记字符串。
        // session/history 与 session/page 的隐藏 Unicode 清洗是强制项，网关必须
        // fail-closed 502，绝不回放未清洗的上游原始体。
        req.resume();
        const marker = 'RAW-FALLBACK-MARKER';
        const brMode = req.headers['x-test-mode'] === 'raw-fallback-br';
        res.writeHead(200, {
          'content-type': 'application/json',
          ...(brMode ? { 'content-encoding': 'br' } : {}),
        });
        res.end(brMode ? marker : `not-json{${marker}`);
      } else if (/^\/api\/(?:session[.]page|subagents[.](?:prompt|interruptByParent))$/.test(req.url ?? '')) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            lastScopedRequestBody = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
          } catch {
            lastScopedRequestBody = null;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ result: { ok: true, value: { accepted: true } } }));
        });
      } else if ((req.url ?? '').startsWith('/api/ssh-http/inspect')) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            lastScopedRequestBody = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
          } catch {
            lastScopedRequestBody = null;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, reached: true }));
        });
      } else if ((req.url ?? '').startsWith('/api/dsh-ssh/hosts')) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          if (req.method === 'GET') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ hosts: mockSshHosts }));
            return;
          }
          if (req.method === 'POST') {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { alias?: unknown; host?: unknown };
            if (typeof body.alias !== 'string' || typeof body.host !== 'string') {
              res.writeHead(400, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ error: 'invalid host' }));
              return;
            }
            if (mockSshHosts.some((host) => host.alias === body.alias)) {
              res.writeHead(400, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ error: 'alias already exists' }));
              return;
            }
            const host = { alias: body.alias, host: body.host };
            mockSshHosts.push(host);
            res.writeHead(201, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ host }));
            return;
          }
          res.writeHead(405, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'method not allowed' }));
        });
      } else if ((req.url ?? '').startsWith('/api/sessionReferenceResolver/candidates')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ result: { ok: true, value: [
          { sessionId: 'session-visible', label: 'Visible session', cwd: '/workspaces/visible', createdAt: 1, mention: '@visible' },
          { sessionId: 'session-hidden', label: 'Hidden session', cwd: '/workspaces/hidden', createdAt: 1, mention: '@hidden' },
        ] } }));
      } else if (/^\/api\/schedule[.\/]catalog(?:[?]|$)/.test(req.url ?? '')) {
        // rc.2 ScheduleCatalogEntry：宿主全局提醒数组，每条带原始 sessionId。
        // 官方 remote 信封（server-response）——子用户由网关逐条按 sessionId 过滤。
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          type: 'server-response',
          rpcId: 'schedule-catalog-mock',
          result: {
            ok: true,
            value: scheduleCatalogResponseMode === 'malformed'
              ? { not: 'an array' }
              : [
                { id: 'schedule-visible', title: 'Visible reminder', sessionId: 'session-visible', status: 'active', lastDelivery: { at: 1 } },
                { id: 'schedule-hidden', title: 'Hidden reminder', sessionId: 'session-hidden', status: 'active' },
                { id: 'schedule-no-session', title: 'No session binding', status: 'inactive' },
                { id: 'schedule-bad-session', title: 'Invalid session binding', sessionId: 42, status: 'active' },
                { id: 'schedule-long-session', title: 'Over-long session binding', sessionId: 'x'.repeat(201), status: 'active' },
              ],
          },
        }));
      } else if ((req.url ?? '').startsWith('/sidebar/bundle/')) {
        res.writeHead(200, { 'content-type': 'text/javascript' });
        res.end('console.log("mock sidebar chunk");');
      } else if ((req.url ?? '').startsWith('/api/session.search')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(sessionSearchResponseMode === 'malformed'
          ? JSON.stringify({ result: { ok: true, value: { items: { malformed: true }, hasMore: false } } })
          : JSON.stringify({
            result: {
              ok: true,
              value: {
                items: [
                  { sessionId: 'session-visible', snippet: 'visible session snippet' },
                  { sessionId: 'session-hidden', snippet: 'hidden session snippet' },
                ],
                hasMore: false,
              },
            },
          }));
      } else if (/^\/api\/workspace[.]insertBefore(?:[?]|$)/.test(req.url ?? '')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ result: { ok: true, value: { workspaceIds: ['ws-visible', 'ws-hidden', 'ws-not-visible'] } } }));
      } else if (/^\/api\/workspace[.]insertSessionBefore(?:[?]|$)/.test(req.url ?? '')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ result: { ok: true, value: { workspace: {
          workspaceId: workspaceOrderResponseWorkspaceId,
          sessionIds: ['s-active', 's-archived', 's-other-user', 's-not-visible'],
        } } } }));
      } else if ((req.url ?? '').startsWith('/api/session.list')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          result: {
            value: {
              items: [
                { sessionId: 'session-visible', cwd: '/workspaces/visible', title: 'Visible session' },
                { sessionId: 'session-hidden', cwd: '/workspaces/hidden', title: 'Hidden session' },
              ],
            },
          },
        }));
      } else if (/^\/api\/workspace[.\/](?:archiveSession|unarchiveSession)(?:[?]|$)/.test(req.url ?? '')) {
        // 0.1.7 的 archiveSession/unarchiveSession 成功响应携带宿主全局归档集合。
        if (archiveSessionResponseMode === 'malformed') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            type: 'server-response',
            rpcId: 'workspace-archive-mock',
            result: { ok: true, value: { archivedSessionIds: 'not-an-array' } },
          }));
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            type: 'server-response',
            rpcId: 'workspace-archive-mock',
            result: {
              ok: true,
              value: { archivedSessionIds: ['session-visible', 'session-hidden', 'session-other-user', 42] },
            },
          }));
        }
      } else if (/^\/api\/workspace[.\/](?:pinSession|unpinSession)(?:[?]|$)/.test(req.url ?? '')) {
        // 0.1.7-alpha.1 的 pin 响应携带宿主机全局 pin 集合（会被网关收租）。
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          type: 'server-response',
          rpcId: 'workspace-pin-mock',
          result: {
            ok: true,
            value: { pinnedSessionIds: ['session-visible', 'session-hidden', 'session-other-user'] },
          },
        }));
      } else if ((req.url ?? '').startsWith('/api/workspace.list')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write(
          badJson
            ? 'not-json{'
            : req.headers['x-test-mode'] === 'archived-sessions'
              ? ARCHIVED_WORKSPACES_JSON
              : req.headers['x-test-mode'] === 'pinned-sessions'
                ? (workspaceListPinnedMode === 'malformed'
                    ? JSON.stringify({
                        rpcId: 'workspace-list-pinned-malformed',
                        result: { ok: true, value: {
                          items: [], archivedSessionIds: [], pinnedSessionIds: { malformed: true },
                        } },
                      })
                    : JSON.stringify({
                        rpcId: 'workspace-list-pinned-regression',
                        result: { ok: true, value: {
                          items: [
                            { workspaceId: 'ws-visible', path: '/workspaces/a', sessionIds: ['s-active', 's-archived'] },
                            { workspaceId: 'ws-hidden', path: '/workspaces/b', sessionIds: ['s-other-user'] },
                          ],
                          archivedSessionIds: ['s-archived'],
                          pinnedSessionIds: ['s-active', 's-archived', 's-other-user', 42],
                        } },
                      }))
                : req.headers['x-test-mode'] === 'assigned-visible'
                  ? ASSIGNED_VISIBLE_WORKSPACES_JSON
                  : WORKSPACES_JSON,
        );
        res.end();
      } else if ((req.url ?? '').startsWith('/api/gateway-timeout-probe')) {
        // 上游响应头超时回归专用探针：holdResponseHeaders 时不回响应头也不断开；
        // slowResponseBodyMs 时先回响应头（网关应清除计时器）再延迟结束 body。
        req.resume();
        if (holdResponseHeaders) return;
        res.writeHead(200, { 'content-type': 'application/json' });
        if (slowResponseBodyMs > 0) {
          // Node 只有在首个 write/end 才真正把响应头写进 socket，先写一段头部字节。
          res.write('{"ok":true,');
          setTimeout(() => res.end('"slow":true}'), slowResponseBodyMs).unref();
        } else {
          res.end(JSON.stringify({ ok: true }));
        }
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write(JSON.stringify({ ok: true, method: req.method, url: req.url }));
        res.end();
      }
    });
    server.on('upgrade', (req, socket, head) => {
      lastUpstreamHeaders = req.headers;
      lastUpstreamUrl = req.url ?? '';
      if ((req.url ?? '').startsWith('/api/remote.mux')) {
        remoteMux.handleUpgrade(req, socket, head, (client: any) => remoteMux.emit('connection', client, req));
        return;
      }
      socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
      socket.destroy();
    });
    server.on('close', () => remoteMux.close());
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function extractSessionIdForTest(value: unknown, depth = 0): string | null {
  if (depth > 8 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractSessionIdForTest(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  const object = value as Record<string, unknown>;
  if (typeof object.sessionId === 'string' && object.sessionId.length > 0) return object.sessionId;
  for (const child of Object.values(object)) {
    const found = extractSessionIdForTest(child, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

function rawNames(rawHeaders: string[]): string[] {
  const names: string[] = [];
  for (let i = 0; i < rawHeaders.length; i += 2) names.push(rawHeaders[i].toLowerCase());
  return names;
}

function gatewayReq(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; rawHeaders: string[]; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: gatewayPort, method, path: url, headers: { cookie, ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            rawHeaders: res.rawHeaders,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

/** 契约断言：响应绝不能同时出现 CL 与 TE */
function assertNoClTe(rawHeaders: string[]): void {
  const names = rawHeaders
    .filter((_, i) => i % 2 === 0)
    .map((n) => String(n).toLowerCase());
  assert.ok(
    !(names.includes('content-length') && names.includes('transfer-encoding')),
    `响应同时携带 Content-Length 与 Transfer-Encoding（Nginx 会 502）：${JSON.stringify(rawHeaders)}`,
  );
}

function chunkedGatewayRequest(
  url: string,
  headers: Record<string, string>,
  chunkCount: number,
  chunkSize: number,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: gatewayPort,
      method: 'POST',
      path: url,
      headers: {
        cookie,
        'content-type': 'application/octet-stream',
        'transfer-encoding': 'chunked',
        ...headers,
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    const chunk = Buffer.alloc(chunkSize, 0x61);
    for (let i = 0; i < chunkCount; i += 1) req.write(chunk);
    req.end();
  });
}

before(async () => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-test-'));
  db = new Database(path.join(tempDir, 'test.db'), createFieldCrypto('testkey', 'testkey'));
  db.init(); // 建表（构造函数不建表）
  const user = db.createUser('admin', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');

  upstream = await startMockUpstream();
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
    // 端点登记表：无前缀 = HTTP 与 WS 两条通道都放行；`ws:` / `http:` 前缀限定
    // 只在该通道生效；`owner:` 前缀 = 仅主用户（优先于 ssh）。代码不含插件路径。
    endpointRules: [
      '/api/dsh-ssh/terminal',
      '/plugins/ssh-b/terminal',
      '/plugins/ssh-wild/*',
      '/api/ssh-http/inspect',
      'ws:/api/ssh-ws-only/terminal',
      'http:/api/ssh-http-only/inspect',
      // 同一路径同时以两种能力登记：用于验证 owner: 优先于 ssh（两条通道一致）
      '/api/ssh-owner-only/hosts',
      'owner:/api/ssh-owner-only/hosts',
      '/api/dynamicCordisRunner/*',
      'ws:/api/dynamicCordisRunner/*',
    ],
  };

  auth = new AuthService(config, db);
  gateway = createGatewayServer(config, auth, db);
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', () => resolve()));
  gatewayPort = (gateway.address() as { port: number }).port;

  // 直接签一个合法会话（等价于登录成功后的 cookie），cv=0 与新建用户一致
  const token = jwt.sign({ sub: String(user.id), username: user.username, cv: 0 }, config.jwtSecret, {
    expiresIn: '12h',
  });
  tokenValue = token;
  cookie = `dsh_gateway_token=${token}`;
});

after(() => {
  gateway?.close();
  upstream?.close();
  // Windows 上 node:sqlite 文件句柄保持打开（Database 无 close 接口），
  // 临时目录清理为尽力而为，失败时由系统临时目录回收
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* 忽略：文件锁未释放 */
  }
});

function websocketHandshake(url: string, headers: Record<string, string>): Promise<{ statusLine: string; headers: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: gatewayPort,
      path: url,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...headers,
      },
    });
    req.once('upgrade', (res, socket) => {
      const statusLine = `HTTP/${res.httpVersion} ${String(res.statusCode)} ${res.statusMessage ?? ''}`.trim();
      socket.destroy();
      resolve({ statusLine, headers: JSON.stringify(res.headers) });
    });
    req.once('response', (res) => {
      res.resume();
      res.once('end', () => resolve({ statusLine: `HTTP/${res.httpVersion} ${String(res.statusCode)}`, headers: JSON.stringify(res.headers) }));
    });
    req.once('error', reject);
    req.end();
  });
}

function websocketFrame(
  url: string,
  headers: Record<string, string>,
  frame: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const client = new NodeWebSocket(`ws://127.0.0.1:${String(gatewayPort)}${url}`, { headers });
    const timer = setTimeout(() => {
      client.terminate();
      reject(new Error('WebSocket frame timeout'));
    }, 3000);
    client.once('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    client.once('open', () => client.send(JSON.stringify(frame)));
    client.once('message', (data: Buffer) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      } finally {
        client.close();
      }
    });
  });
}

function openRemoteMux(headers: Record<string, string>): Promise<{ client: any; nextFrame: () => Promise<Record<string, unknown>> }> {
  return new Promise((resolve, reject) => {
    const client = new NodeWebSocket(`ws://127.0.0.1:${String(gatewayPort)}/api/remote.mux`, { headers });
    const pending: Array<(value: Record<string, unknown>) => void> = [];
    const received: Record<string, unknown>[] = [];
    const timer = setTimeout(() => {
      client.terminate();
      reject(new Error('WebSocket open timeout'));
    }, 3000);
    client.once('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    client.on('message', (data: Buffer) => {
      const frame = JSON.parse(data.toString()) as Record<string, unknown>;
      const next = pending.shift();
      if (next) next(frame);
      else received.push(frame);
    });
    client.once('open', () => {
      clearTimeout(timer);
      resolve({
        client,
        nextFrame: () => new Promise((resolveFrame) => {
          const frame = received.shift();
          if (frame) resolveFrame(frame);
          else pending.push(resolveFrame);
        }),
      });
    });
  });
}

/**
 * 有界地等待下一帧：若 carrier 被意外关闭或帧迟迟不到，让回归测试以明确
 * 错误失败，而不是永久挂起。
 */
function nextFrameOrFail(
  connection: { client: any; nextFrame: () => Promise<Record<string, unknown>> },
  label: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const finish = (error: Error | null, frame?: Record<string, unknown>): void => {
      clearTimeout(timer);
      connection.client.off('close', onClose);
      if (error !== null) reject(error);
      else resolve(frame!);
    };
    const timer = setTimeout(() => finish(new Error(`${label}: frame timeout`)), 3000);
    const onClose = (code: number, reason: Buffer): void => {
      finish(new Error(`${label}: carrier closed (${String(code)} ${reason.toString()})`));
    };
    connection.client.once('close', onClose);
    void connection.nextFrame().then(
      (frame) => finish(null, frame),
      (error: unknown) => finish(error instanceof Error ? error : new Error(String(error))),
    );
  });
}

test('workspace ordering is scoped to visible workspaces and same-workspace sessions', async () => {
  const subUser = db.createUser('workspace-order-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/a', '/workspaces/b'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedSessionIds: ['s-active', 's-archived', 's-other-user'],
    banned: false, sandboxMode: null, disabledSessions: [],
  });
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  const originalWorkspaceId = workspaceOrderResponseWorkspaceId;
  cookie = subCookie;
  workspaceOrderResponseWorkspaceId = 'ws-visible';
  try {
    const list = await gatewayReq('POST', '/api/workspace.list', { 'content-type': 'application/json', 'x-test-mode': 'archived-sessions' }, '{}');
    assert.equal(list.status, 200, list.body);
    assert.equal(db.isSessionGrantsSeeded(subUser.id), true);
    assert.equal(db.listUserSessionGrants(subUser.id).includes('s-other-user'), true,
      '跨工作区用例必须使用已授权会话，避免退化为未知会话拒绝');

    let upstreamBefore = lastUpstreamUrl;
    const hiddenWorkspace = await gatewayReq('POST', '/api/workspace.insertBefore', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'workspace-order-hidden-source', method: 'workspace/insertBefore',
      payload: { args: { request: { workspaceId: 'ws-not-visible', beforeWorkspaceId: 'ws-visible' } } },
    }));
    assert.equal(hiddenWorkspace.status, 403, hiddenWorkspace.body);
    assert.equal(lastUpstreamUrl, upstreamBefore, '不可见源 workspace 的排序请求不得到达上游');

    upstreamBefore = lastUpstreamUrl;
    const hiddenAnchor = await gatewayReq('POST', '/api/workspace.insertBefore', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'workspace-order-hidden-anchor', method: 'workspace/insertBefore',
      payload: { args: { request: { workspaceId: 'ws-visible', beforeWorkspaceId: 'ws-not-visible' } } },
    }));
    assert.equal(hiddenAnchor.status, 403, hiddenAnchor.body);
    assert.equal(lastUpstreamUrl, upstreamBefore, '不可见锚点 workspace 的排序请求不得到达上游');

    upstreamBefore = lastUpstreamUrl;
    const crossWorkspaceSession = await gatewayReq('POST', '/api/workspace.insertSessionBefore', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'session-order-cross-workspace', method: 'workspace/insertSessionBefore',
      payload: { args: { request: { workspaceId: 'ws-visible', sessionId: 's-other-user' } } },
    }));
    assert.equal(crossWorkspaceSession.status, 403, crossWorkspaceSession.body);
    assert.equal(lastUpstreamUrl, upstreamBefore, '跨 workspace 的已授权会话排序请求不得到达上游');

    const workspaceOrder = await gatewayReq('POST', '/api/workspace.insertBefore', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'workspace-order', method: 'workspace/insertBefore',
      payload: { args: { request: { workspaceId: 'ws-visible', beforeWorkspaceId: 'ws-hidden' } } },
    }));
    assert.equal(workspaceOrder.status, 200, workspaceOrder.body);
    assert.deepEqual((JSON.parse(workspaceOrder.body) as { result: { value: { workspaceIds: string[] } } }).result.value.workspaceIds,
      ['ws-visible', 'ws-hidden'], '排序返回只保留用户可见 workspace ID，allowWorkspaceCreate=false 仍可排序');

    const sessionOrder = await gatewayReq('POST', '/api/workspace.insertSessionBefore', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'session-order', method: 'workspace/insertSessionBefore',
      payload: { args: { request: { workspaceId: 'ws-visible', sessionId: 's-active', beforeSessionId: 's-archived' } } },
    }));
    assert.equal(sessionOrder.status, 200, sessionOrder.body);
    const sessionIds = (JSON.parse(sessionOrder.body) as { result: { value: { workspace: { sessionIds: string[] } } } }).result.value.workspace.sessionIds;
    assert.deepEqual(sessionIds, ['s-active', 's-archived'], '响应不得将另一个 workspace 的授权会话混进当前分组');

    workspaceOrderResponseWorkspaceId = 'ws-hidden';
    const wrongWorkspace = await gatewayReq('POST', '/api/workspace.insertSessionBefore', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'session-order-mismatch', method: 'workspace/insertSessionBefore',
      payload: { args: { request: { workspaceId: 'ws-visible', sessionId: 's-active' } } },
    }));
    assert.equal(wrongWorkspace.status, 502, '上游返回与已授权请求不匹配的 workspace 时 fail closed');
  } finally {
    cookie = originalCookie;
    workspaceOrderResponseWorkspaceId = originalWorkspaceId;
  }
});

test('Remote job streams require a session and filter jobs to that authorized session', async () => {
  const subUser = db.createUser('remote-job-scope-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedSessionIds: [], allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
  });
  db.addUserSessionGrant(subUser.id, 'session-visible');
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    connection.client.send(JSON.stringify({ type: 'open', streamId: 'job-auth-baseline', endpoint: 'workspace/follow', payload: { args: {} } }));
    const baseline = await nextFrameOrFail(connection, 'job workspace baseline');
    assert.equal((baseline.value as { type?: string }).type, 'baseline');
    assert.deepEqual(db.listUserSessionGrants(subUser.id), ['session-visible']);

    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'job-list-visible', endpoint: 'job/list',
      payload: { args: { request: { sessionId: 'session-visible' } } },
    }));
    const rows = await nextFrameOrFail(connection, 'authorized job list');
    assert.equal(rows.streamId, 'job-list-visible');
    assert.deepEqual((rows.value as { jobs: Array<{ id: string }> }).jobs.map((job) => job.id), ['job-visible']);

    const listEnd = await nextFrameOrFail(connection, 'job list end');
    assert.equal(listEnd.type, 'end');
    assert.equal(listEnd.streamId, 'job-list-visible');

    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'job-follow-hidden', endpoint: 'job/follow',
      payload: { args: { request: { sessionId: 'session-visible', jobId: 'job-hidden' } } },
    }));
    const hiddenEnd = await nextFrameOrFail(connection, 'foreign job follow end');
    assert.equal(hiddenEnd.type, 'end');
    assert.equal(hiddenEnd.streamId, 'job-follow-hidden');

    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'job-follow-visible', endpoint: 'job/follow',
      payload: { args: { request: { sessionId: 'session-visible', jobId: 'job-visible' } } },
    }));
    const opened = await nextFrameOrFail(connection, 'authorized job owner');
    assert.equal(opened.streamId, 'job-follow-visible');
    assert.equal((opened.value as { type?: string }).type, 'opened');
    const output = await nextFrameOrFail(connection, 'authorized job output');
    assert.equal(output.streamId, 'job-follow-visible');
    assert.deepEqual((output.value as { chunks: string[] }).chunks, ['session-visible-output']);

    const visibleEnd = await nextFrameOrFail(connection, 'authorized job follow end');
    assert.equal(visibleEnd.type, 'end');
    assert.equal(visibleEnd.streamId, 'job-follow-visible');
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'job-follow-unscoped', endpoint: 'job/follow',
      payload: { args: { request: { jobId: 'job-ownerless' } } },
    }));
    const rejected = await nextFrameOrFail(connection, 'unscoped job follow');
    assert.equal(rejected.type, 'error');
    assert.equal(rejected.streamId, 'job-follow-unscoped');
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, 'rejecting one logical stream must preserve the carrier');
  } finally {
    connection.client.close();
  }
});

test('Issue #25：主用户保存既有工作区和会话授权后，子用户能从 Remote mux 收到它们', async () => {
  const subUser = db.createUser('issue-25-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  const permissionPayload = JSON.stringify({
    userId: subUser.id,
    allowedFolders: ['/workspaces/visible'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: false,
    allowGitDownload: false,
    allowWorkspaceCreate: false,
    allowedAgentPresets: null,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  const saved = await gatewayReq(
    'POST',
    '/gateway/api/permissions',
    { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(permissionPayload)) },
    permissionPayload,
  );
  assert.equal(saved.status, 200, saved.body);
  assert.deepEqual(db.listUserSessionGrants(subUser.id), ['session-visible']);
  const subToken = jwt.sign(
    { sub: String(subUser.id), username: subUser.username, cv: 0 },
    'test-secret',
    { expiresIn: '12h' },
  );
  const frame = await websocketFrame('/api/remote.mux', {
    cookie: `dsh_gateway_token=${subToken}`,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  }, {
    type: 'open',
    streamId: 'issue-25-stream',
    endpoint: 'workspace/follow',
    payload: { args: {} },
  });
  const value = frame.value as { type?: string; value?: { items?: Array<{ workspaceId?: string; sessionIds?: string[] }> } };
  assert.equal(frame.type, 'item');
  assert.equal(value.type, 'baseline');
  assert.deepEqual(value.value?.items, [{
    workspaceId: 'workspace-visible',
    path: '/workspaces/visible',
    title: 'Visible workspace',
    sessionIds: ['session-visible'],
  }]);
});

test('动态清单包含官方 Remote 流时仍建立隔离基线，普通流继续透明转发', async () => {
  const subUser = db.createUser('manifest-official-stream-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const manifest = JSON.stringify({
    generation: 'manifest-official-stream-regression',
    parentPid: process.pid,
    namespaces: ['workspace', 'session', 'thirdParty', 'terminal', 'pluginManager'],
    streamEndpoints: ['workspace/follow', 'session/follow', 'session/control', 'future/plugin', 'terminal/follow'],
    exactPaths: ['/api/pluginManager/socket'], pathPrefixes: [],
  });
  const manifestResponse = await gatewayReq('POST', '/gateway/internal/plugin-manifest', {
    'content-type': 'application/json',
    'x-internal-secret': 'test-internal',
    'content-length': String(Buffer.byteLength(manifest)),
  }, manifest);
  assert.equal(manifestResponse.status, 200, manifestResponse.body);
  const accepted = JSON.parse(manifestResponse.body) as { namespaces: number; streamEndpoints: number };
  assert.equal(accepted.namespaces, 1, '官方和硬拒 namespace 不得进入动态清单');
  assert.equal(accepted.streamEndpoints, 1, '官方和硬拒 stream 不得进入动态清单');
  for (const endpoint of ['/api/terminal/socket', '/api/pluginManager/socket']) {
    const denied = await websocketHandshake(endpoint, {
      cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1',
    });
    assert.match(denied.statusLine, /40[34]/, `${endpoint} 不得被清单升级成子用户 WS`);
  }

  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'manifest-workspace-follow', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    const baseline = await connection.nextFrame();
    assert.equal(baseline.type, 'item');
    assert.equal((baseline.value as { type?: string }).type, 'baseline');
    assert.deepEqual((baseline.value as { value?: { items?: Array<{ workspaceId?: string }> } }).value?.items?.map((item) => item.workspaceId), ['workspace-visible']);

    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'manifest-ordinary-stream', endpoint: 'future/plugin', payload: { args: {} },
    }));
    const ordinary = await connection.nextFrame();
    assert.equal(ordinary.streamId, 'manifest-ordinary-stream');
    assert.equal(ordinary.type, 'item');
    assert.equal(remoteMuxOpenEndpoints.includes('future/plugin'), true);
  } finally {
    connection.client.close();
  }
});

test('Issue #25：alpha.3 Remote workspace 基线可解析 workspaceId 创建会话，且隐藏工作区仍被拒绝', async () => {
  const subUser = db.createUser('issue-25-workspace-selection', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  const admin = db.listUsers().find((user) => user.role === 'admin');
  assert.ok(admin, 'test fixture must have an administrator');
  // An administrator-owned workspace is shareable once its directory and
  // sessions are granted. Only a different subuser's private workspace blocks it.
  db.addUserWorkspace(admin.id, '/workspaces/visible');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  const originalCookie = cookie;
  cookie = subCookie;
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'workspace-selection', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    const baseline = await connection.nextFrame();
    assert.equal(baseline.streamId, 'workspace-selection');

    const allowed = await gatewayReq(
      'POST',
      '/api/session.create',
      { 'content-type': 'application/json' },
      JSON.stringify({
        type: 'client-request', rpcId: 'issue-25-create-visible', method: 'session/create',
        payload: { args: { request: { workspaceId: 'workspace-visible' } } },
      }),
    );
    assert.equal(allowed.status, 200, allowed.body);

    const hidden = await gatewayReq(
      'POST',
      '/api/session.create',
      { 'content-type': 'application/json' },
      JSON.stringify({
        type: 'client-request', rpcId: 'issue-25-create-hidden', method: 'session/create',
        payload: { args: { request: { workspaceId: 'workspace-hidden' } } },
      }),
    );
    assert.equal(hidden.status, 403, hidden.body);

    db.setPermissions(subUser.id, {
      allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
      allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
      allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    });
    const existingWorkspaceCreate = await gatewayReq(
      'POST',
      '/api/workspace/create',
      { 'content-type': 'application/json' },
      JSON.stringify({
        type: 'client-request', rpcId: 'issue-25-create-existing', method: 'workspace/create',
        payload: { args: { request: { path: '/workspaces/visible' } } },
      }),
    );
    assert.equal(existingWorkspaceCreate.status, 200, existingWorkspaceCreate.body);
    assert.equal(
      db.listUserWorkspacePaths(subUser.id).includes('/workspaces/visible'),
      false,
      'resolving an administrator workspace must not claim it as a subuser-owned workspace',
    );

    workspaceCreateMakesNewWorkspace = true;
    try {
      const newWorkspace = await gatewayReq(
        'POST',
        '/api/workspace/create',
        { 'content-type': 'application/json' },
        JSON.stringify({
          type: 'client-request', rpcId: 'issue-25-create-owned', method: 'workspace/create',
          payload: { args: { request: { path: '/workspaces/owned' } } },
        }),
      );
      // D1 收紧：预存在且未分配给该子用户的目录不得登记为工作区。
      assert.equal(newWorkspace.status, 403, newWorkspace.body);
      assert.equal(db.listUserWorkspacePaths(subUser.id).includes('/workspaces/owned'), false);
      assert.equal(db.getPermissions(subUser.id)?.allowed_folders.includes('/workspaces/owned'), false);
    } finally {
      workspaceCreateMakesNewWorkspace = false;
    }

    const sharedWorkspaceDelete = await gatewayReq(
      'POST',
      '/api/workspace/delete',
      { 'content-type': 'application/json' },
      JSON.stringify({
        type: 'client-request', rpcId: 'issue-25-delete-shared', method: 'workspace/delete',
        payload: { args: { request: { workspaceId: 'workspace-visible' } } },
      }),
    );
    assert.equal(sharedWorkspaceDelete.status, 403, 'a workspace grant does not convey workspace management authority');

    const otherSubuser = db.createUser('issue-25-private-workspace-owner', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
    db.addUserWorkspace(otherSubuser.id, '/workspaces/visible');
    try {
      const privateWorkspace = await gatewayReq(
        'POST',
        '/api/session.create',
        { 'content-type': 'application/json' },
        JSON.stringify({
          type: 'client-request', rpcId: 'issue-25-create-private', method: 'session/create',
          payload: { args: { request: { workspaceId: 'workspace-visible' } } },
        }),
      );
      assert.equal(privateWorkspace.status, 403, privateWorkspace.body);
    } finally {
      db.removeUserWorkspace(otherSubuser.id, '/workspaces/visible');
    }
  } finally {
    cookie = originalCookie;
    connection.client.close();
  }
});

test('分配空工作区可新建第一条会话，既有未分配会话不可见', async () => {
  const subUser = db.createUser('empty-assigned-workspace', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  remoteMuxBaselineVisibleSessionIds = [];
  let connection: Awaited<ReturnType<typeof openRemoteMux>> | undefined;
  try {
    connection = await openRemoteMux({ cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    connection.client.send(JSON.stringify({ type: 'open', streamId: 'empty-assigned', endpoint: 'workspace/follow', payload: { args: {} } }));
    const baseline = await nextFrameOrFail(connection, 'empty assigned workspace baseline');
    const value = baseline.value as { value?: { items?: Array<{ workspaceId: string; sessionIds: string[] }> } };
    assert.deepEqual(value.value?.items?.map((item) => [item.workspaceId, item.sessionIds]), [['workspace-visible', []]]);
    const unassigned = await gatewayReq('POST', '/api/session.list', { 'content-type': 'application/json' }, '{}');
    assert.equal(unassigned.status, 200, unassigned.body);
    assert.deepEqual((JSON.parse(unassigned.body) as { result: { value: { items: unknown[] } } }).result.value.items, []);
    const created = await gatewayReq('POST', '/api/session.create', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'empty-assigned-create', method: 'session/create',
      payload: { args: { request: { workspaceId: 'workspace-visible' } } },
    }));
    assert.equal(created.status, 200, created.body);
    assert.ok(db.hasUserSessionGrant(subUser.id, createdSessionIdForMock));
    assert.deepEqual(db.listUserWorkspacePaths(subUser.id), [], '分配工作区不变为子用户私有归属');
  } finally {
    remoteMuxBaselineVisibleSessionIds = ['session-visible'];
    connection?.client.close();
    cookie = originalCookie;
  }
});

test('自建工作区的既有会话自动可见，分配工作区的既有会话仍须逐条授权', async () => {
  const owner = db.createUser('owned-workspace-sessions-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(owner.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  db.markSessionGrantsSeeded(owner.id);
  db.addUserWorkspace(owner.id, '/workspaces/visible');
  const assigned = db.createUser('assigned-workspace-sessions-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(assigned.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  db.markSessionGrantsSeeded(assigned.id);
  const originalCookie = cookie;
  const ownerCookie = `dsh_gateway_token=${jwt.sign({ sub: String(owner.id), username: owner.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const assignedCookie = `dsh_gateway_token=${jwt.sign({ sub: String(assigned.id), username: assigned.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  let connection: Awaited<ReturnType<typeof openRemoteMux>> | undefined;
  try {
    cookie = ownerCookie;
    connection = await openRemoteMux({ cookie: ownerCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    connection.client.send(JSON.stringify({ type: 'open', streamId: 'owned-sessions', endpoint: 'workspace/follow', payload: { args: {} } }));
    const baseline = await nextFrameOrFail(connection, 'owned session baseline');
    const row = (baseline.value as { value?: { items?: Array<{ sessionIds: string[] }> } }).value?.items?.[0];
    assert.deepEqual(row?.sessionIds, ['session-visible']);
    const list = await gatewayReq('POST', '/api/session.list', { 'content-type': 'application/json' }, '{}');
    assert.equal(list.status, 200, list.body);
    assert.deepEqual((JSON.parse(list.body) as { result: { value: { items: Array<{ sessionId: string }> } } }).result.value.items.map((item) => item.sessionId), ['session-visible']);
    assert.equal(db.hasUserSessionGrant(owner.id, 'session-visible'), false, '自建工作区不需要逐条补写 grant');
    cookie = assignedCookie;
    const other = await openRemoteMux({ cookie: assignedCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      other.client.send(JSON.stringify({ type: 'open', streamId: 'assigned-private', endpoint: 'workspace/follow', payload: { args: {} } }));
      const frame = await nextFrameOrFail(other, 'assigned workspace beside private owner');
      const items = (frame.value as { value?: { items?: unknown[] } }).value?.items ?? [];
      assert.deepEqual(items, [], '另一子用户的私有工作区不得被共享目录授权绕过');
    } finally { other.client.close(); }
  } finally {
    connection?.client.close();
    db.removeUserWorkspace(owner.id, '/workspaces/visible');
    cookie = originalCookie;
  }
});

test('分配共享目录即使上游 created:true 也不占为私有，其他被分配子用户可继续建会话', async () => {
  const first = db.createUser('shared-created-first', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  const second = db.createUser('shared-created-second', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  for (const user of [first, second]) {
    db.setPermissions(user.id, {
      allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
      allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
      allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
    });
    db.markSessionGrantsSeeded(user.id);
  }
  const originalCookie = cookie;
  const json = { 'content-type': 'application/json' };
  workspaceCreateMakesNewWorkspace = true;
  try {
    cookie = `dsh_gateway_token=${jwt.sign({ sub: String(first.id), username: first.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
    const register = await gatewayReq('POST', '/api/workspace/create', json, JSON.stringify({
      type: 'client-request', rpcId: 'shared-created', method: 'workspace/create',
      payload: { args: { request: { path: '/workspaces/visible' } } },
    }));
    assert.equal(register.status, 200, register.body);
    assert.deepEqual(db.listUserWorkspacePaths(first.id), [], '分配给子用户的共享目录不得被标为私有');
    cookie = `dsh_gateway_token=${jwt.sign({ sub: String(second.id), username: second.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
    const connection = await openRemoteMux({ cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      connection.client.send(JSON.stringify({ type: 'open', streamId: 'shared-created-baseline', endpoint: 'workspace/follow', payload: { args: {} } }));
      const baseline = await nextFrameOrFail(connection, 'shared assigned baseline');
      assert.equal((baseline.value as { value?: { items?: unknown[] } }).value?.items?.length, 1);
      const created = await gatewayReq('POST', '/api/session.create', json, JSON.stringify({
        type: 'client-request', rpcId: 'shared-second-create', method: 'session/create',
        payload: { args: { request: { workspaceId: 'workspace-visible' } } },
      }));
      assert.equal(created.status, 200, created.body);
    } finally { connection.client.close(); }
  } finally {
    workspaceCreateMakesNewWorkspace = false;
    cookie = originalCookie;
  }
});

test('一次 session/create 业务失败不关闭同用户的工作区 mux，后续工作区仍可建会话', async () => {
  const subUser = db.createUser('create-failure-isolated', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const json = { 'content-type': 'application/json' };
  const connection = await openRemoteMux({ cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    connection.client.send(JSON.stringify({ type: 'open', streamId: 'failure-isolation-baseline', endpoint: 'workspace/follow', payload: { args: {} } }));
    await nextFrameOrFail(connection, 'failure isolation baseline');
    failNextSessionCreate = true;
    const request = (rpcId: string) => JSON.stringify({
      type: 'client-request', rpcId, method: 'session/create',
      payload: { args: { request: { workspaceId: 'workspace-visible' } } },
    });
    const failed = await gatewayReq('POST', '/api/session.create', json, request('first-create-fails'));
    assert.equal(failed.status, 200, failed.body);
    assert.equal((JSON.parse(failed.body) as { result?: { ok?: boolean } }).result?.ok, false);
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, '一条创建失败不能关闭其他工作区的 carrier');
    const next = await gatewayReq('POST', '/api/session.create', json, request('second-create-works'));
    assert.equal(next.status, 200, next.body);
    assert.ok(db.hasUserSessionGrant(subUser.id, createdSessionIdForMock));
  } finally {
    failNextSessionCreate = false;
    connection.client.close();
    cookie = originalCookie;
  }
});

test('D1 工作流：刚创建目录可登记、精确分配可登记、预存在未分配拒绝、登记后立即可建会话', async () => {
  const subUser = db.createUser('d1-workflow-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  const json = { 'content-type': 'application/json' };
  const workspaceCreateBody = (path: string, rpcId: string) => JSON.stringify({
    type: 'client-request', rpcId, method: 'workspace/create',
    payload: { args: { request: { path } } },
  });
  try {
    // 1) 预存在且未分配（即使上游回 created:true）→ 403，且不写任何授权。
    workspaceCreateMakesNewWorkspace = true;
    let response = await gatewayReq('POST', '/api/workspace/create', json, workspaceCreateBody('/workspaces/preexisting', 'd1-preexisting'));
    assert.equal(response.status, 403, response.body);
    assert.equal(db.listUserWorkspacePaths(subUser.id).includes('/workspaces/preexisting'), false);
    assert.equal(db.getPermissions(subUser.id)?.allowed_folders.includes('/workspaces/preexisting'), false);

    // 2) 主用户显式分配的精确目录 → 200（created:false 解析既有工作区，不登记所有权）。
    workspaceCreateMakesNewWorkspace = false;
    response = await gatewayReq('POST', '/api/workspace/create', json, workspaceCreateBody('/workspaces/visible', 'd1-exact'));
    assert.equal(response.status, 200, response.body);
    assert.equal(db.listUserWorkspacePaths(subUser.id).includes('/workspaces/visible'), false);

    // 3) 刚通过目录选择器创建的目录 → 登记成功，原子写入所有权与白名单。
    const mkdir = await gatewayReq('POST', '/api/directoryPicker/createDirectory', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1-mkdir', method: 'directoryPicker/createDirectory',
      payload: { args: { path: '/workspaces/visible', name: 'fresh-dir' } },
    }));
    assert.equal(mkdir.status, 200, mkdir.body);
    workspaceCreateMakesNewWorkspace = true;
    const register = await gatewayReq('POST', '/api/workspace/create', json, workspaceCreateBody('/workspaces/visible/fresh-dir', 'd1-register'));
    assert.equal(register.status, 200, register.body);
    const registerValue = (JSON.parse(register.body) as { result?: { value?: { workspace?: { workspaceId?: unknown } } } }).result?.value;
    const workspaceId = registerValue?.workspace?.workspaceId;
    assert.equal(typeof workspaceId, 'string', '登记响应必须带 workspaceId 供后续 session.create 解析');
    assert.equal(db.listUserWorkspacePaths(subUser.id).includes('/workspaces/visible/fresh-dir'), true);
    assert.equal(db.getPermissions(subUser.id)?.allowed_folders.includes('/workspaces/visible/fresh-dir'), true);

    // 4) 登记后立即用 workspaceId 新建会话 → 200（映射已同步，不再被 403）。
    const sessionCreate = await gatewayReq('POST', '/api/session.create', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1-session', method: 'session/create',
      payload: { args: { request: { workspaceId } } },
    }));
    assert.equal(sessionCreate.status, 200, sessionCreate.body);
    const createdSessionId = (JSON.parse(sessionCreate.body) as { result?: { value?: { sessionId?: unknown } } }).result?.value?.sessionId;
    assert.equal(typeof createdSessionId, 'string');
    assert.equal(db.listUserSessionGrants(subUser.id).includes(createdSessionId as string), true, '新会话必须进入该子用户的显式授权');

    // 5) 另一子用户不能用别人的 pending 目录登记，也不得伸进他人子树。
    const other = db.createUser('d1-other-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
    db.setPermissions(other.id, {
      allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
      allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
      allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    });
    cookie = `dsh_gateway_token=${jwt.sign({ sub: String(other.id), username: other.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
    const otherRegister = await gatewayReq('POST', '/api/workspace/create', json, workspaceCreateBody('/workspaces/visible/fresh-dir', 'd1-other-register'));
    assert.equal(otherRegister.status, 403, 'pending 目录与所有权子树均按用户隔离');
    const otherMkdirInside = await gatewayReq('POST', '/api/directoryPicker/createDirectory', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1-other-mkdir', method: 'directoryPicker/createDirectory',
      payload: { args: { path: '/workspaces/visible/fresh-dir', name: 'nested' } },
    }));
    assert.equal(otherMkdirInside.status, 403, '不得在另一子用户创建的工作区子树内建目录');
    const otherMkdirSibling = await gatewayReq('POST', '/api/directoryPicker/createDirectory', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1-other-sibling', method: 'directoryPicker/createDirectory',
      payload: { args: { path: '/workspaces/visible', name: 'sibling-dir' } },
    }));
    assert.equal(otherMkdirSibling.status, 200, '共享分配根下建兄弟目录不受他人子树影响');
  } finally {
    workspaceCreateMakesNewWorkspace = false;
    cookie = originalCookie;
  }
});

test('权限：A 被分配父目录时不得伸进 B 拥有的子工作区子树（session/create 与 workspaceFiles 读取）', async () => {
  // B 拥有子工作区 /workspaces/visible，A 只被分配其父目录 /workspaces。
  // 归属判定必须是单向子树包含：等值只能在目标恰好等于 B 的工作区根时命中，
  // /workspaces/visible/deep 这类深一层的目标会被漏放。
  const owner = db.createUser('subtree-overlap-owner', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.addUserWorkspace(owner.id, '/workspaces/visible');
  const subUser = db.createUser('subtree-overlap-assignee', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  const previousVisiblePath = remoteMuxBaselineVisiblePath;
  cookie = subCookie;
  // 会话根 = 被分配的父目录本身；只有目标伸进 B 的子工作区才命中子树包含。
  remoteMuxBaselineVisiblePath = '/workspaces';
  let connection: Awaited<ReturnType<typeof openRemoteMux>> | undefined;
  const json = { 'content-type': 'application/json', cookie: subCookie };
  const sessionCreate = (targetPath: string, rpcId: string) => gatewayReq('POST', '/api/session.create', json, JSON.stringify({
    type: 'client-request', rpcId, method: 'session/create',
    payload: { args: { request: { path: targetPath } } },
  }));
  const readBytes = (targetPath: string) => gatewayReq(
    'POST', '/api/workspaceFiles/readBytes', json,
    readBytesEnvelope('session-visible', targetPath, {}),
  );
  try {
    connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'subtree-overlap-baseline', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    await nextFrameOrFail(connection, 'subtree overlap baseline');

    // 1) 目标恰好等于 B 的工作区根：两条通道都必须拒绝。
    assert.equal((await sessionCreate('/workspaces/visible', 'subtree-exact-create')).status, 403);
    assert.equal((await readBytes('/workspaces/visible/secret.txt')).status, 403);

    // 2) 目标位于 B 的子树深一层（等值判定会漏放）：必须同样拒绝，且不得到达上游。
    const deepCreateBefore = lastUpstreamUrl;
    assert.equal((await sessionCreate('/workspaces/visible/deep', 'subtree-deep-create')).status, 403);
    assert.equal(lastUpstreamUrl, deepCreateBefore, '越权 session/create 不得到达上游');
    const deepReadBefore = lastUpstreamUrl;
    assert.equal((await readBytes('/workspaces/visible/deep/secret.txt')).status, 403);
    assert.equal(lastUpstreamUrl, deepReadBefore, '越权 workspaceFiles 读取不得到达上游');

    // 3) A 自己的兄弟路径在分配子树内且不属于任何他人工作区：保持可用。
    assert.equal((await sessionCreate('/workspaces/a-sibling', 'subtree-sibling-create')).status, 200);
    assert.equal((await readBytes('/workspaces/a-sibling/ok.txt')).status, 200);

    if (process.platform === 'win32') {
      const beforeAlias = lastUpstreamUrl;
      assert.equal((await sessionCreate('/workspaces/Visible/deep', 'subtree-case-alias')).status, 403,
        'Windows 上不同大小写拼法仍位于另一子用户工作区子树内');
      assert.equal(lastUpstreamUrl, beforeAlias, '大小写别名不得把越权会话创建转发上游');
    }
  } finally {
    remoteMuxBaselineVisiblePath = previousVisiblePath;
    cookie = originalCookie;
    connection?.client.close();
    db.removeUserWorkspace(owner.id, '/workspaces/visible');
  }
});

test('D1 工作流：孤儿所有权行（已删除用户残留）不阻断分配目录的可见性与登记', async () => {
  const subUser = db.createUser('d1-orphan-owner-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  // 模拟 112233 事故：已删除用户的残留所有权行指向同一目录。
  (db as unknown as { db: import('node:sqlite').DatabaseSync }).db.exec(
    "INSERT INTO user_workspaces (user_id, path) VALUES (424242, '/workspaces/visible')",
  );
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  const json = { 'content-type': 'application/json' };
  try {
    // 1) Remote baseline：孤儿行不得把已分配工作区过滤掉（事故症状：侧边栏“暂无会话”）。
    const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'orphan-baseline', endpoint: 'workspace/follow', payload: { args: {} },
      }));
      const frame = await connection.nextFrame();
      const baseline = (frame as { value?: { value?: { items?: Array<{ path?: string }> } } }).value?.value;
      const paths = (baseline?.items ?? []).map((item) => item.path);
      assert.ok(paths.includes('/workspaces/visible'), '孤儿所有权行不得隐藏已分配工作区');
    } finally {
      connection.client.close();
    }

    // 2) workspace/create：孤儿行不得阻断对已分配目录的登记（事故症状：HTTP 403）。
    workspaceCreateMakesNewWorkspace = false;
    const register = await gatewayReq('POST', '/api/workspace/create', json, JSON.stringify({
      type: 'client-request', rpcId: 'orphan-register', method: 'workspace/create',
      payload: { args: { request: { path: '/workspaces/visible' } } },
    }));
    assert.equal(register.status, 200, register.body);

    // 3) directoryPicker/createDirectory：孤儿行不得阻断在已分配根下建目录。
    const mkdir = await gatewayReq('POST', '/api/directoryPicker/createDirectory', json, JSON.stringify({
      type: 'client-request', rpcId: 'orphan-mkdir', method: 'directoryPicker/createDirectory',
      payload: { args: { path: '/workspaces/visible', name: 'orphan-sibling' } },
    }));
    assert.equal(mkdir.status, 200, mkdir.body);
  } finally {
    workspaceCreateMakesNewWorkspace = false;
    cookie = originalCookie;
    (db as unknown as { db: import('node:sqlite').DatabaseSync }).db.exec(
      "DELETE FROM user_workspaces WHERE user_id = 424242",
    );
  }
});

test('D1 工作流：directoryPicker/list 目录浏览按授权根过滤与拦截', async () => {
  const subUser = db.createUser('d1-list-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
  });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const json = { 'content-type': 'application/json' };
  const listBody = (requestPath: string | null, rpcId: string) => JSON.stringify({
    type: 'client-request', rpcId, method: 'directoryPicker/list',
    payload: { args: requestPath === null ? {} : { path: requestPath } },
  });
  const entryPaths = (body: string): string[] => {
    const value = (JSON.parse(body) as { result?: { value?: { entries?: Array<{ path?: unknown }> } } }).result?.value;
    return (value?.entries ?? []).map((entry) => String(entry.path));
  };
  try {
    // 1) 授权子树内 → 完整列表（不过滤）。
    const inside = await gatewayReq('POST', '/api/directoryPicker/list', json, listBody('/workspaces/visible', 'd1-list-inside'));
    assert.equal(inside.status, 200, inside.body);
    assert.equal(entryPaths(inside.body).length, 4, '授权子树内的列表保持原样');

    // 2) 祖先导航 → 只保留通往授权根的条目，其余目录名隐藏。
    const ancestor = await gatewayReq('POST', '/api/directoryPicker/list', json, listBody('/workspaces', 'd1-list-ancestor'));
    assert.equal(ancestor.status, 200, ancestor.body);
    assert.deepEqual(entryPaths(ancestor.body).sort(), ['/workspaces/visible'], '祖先层只保留通往授权根的路径');

    // 3) 白名单外且非祖先：只返回授权根入口，不回放 /etc 内容。
    const outside = await gatewayReq('POST', '/api/directoryPicker/list', json, listBody('/etc', 'd1-list-outside'));
    assert.equal(outside.status, 200, outside.body);
    assert.deepEqual(entryPaths(outside.body), ['/workspaces/visible']);

    // 4) 无 path（默认 home）且 home 不在授权根树时：返回可进入的授权根，
    // 但不回放 home 的未过滤目录名，避免 Windows 多盘符/非 home 工作区被误判 403。
    const home = await gatewayReq('POST', '/api/directoryPicker/list', json, listBody(null, 'd1-list-home'));
    assert.equal(home.status, 200, home.body);
    assert.deepEqual(entryPaths(home.body), ['/workspaces/visible']);

    // 5) alpha.2 ClientConnection 只消费 payload.args。信封外层 path 仍不能作为
    // 授权依据；这里最多返回已授权根入口，不得回放外层 path 对应的完整目录。
    const decoy = await gatewayReq('POST', '/api/directoryPicker/list', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1-list-decoy', method: 'directoryPicker/list',
      payload: { args: {} }, path: '/workspaces/visible',
    }));
    assert.equal(decoy.status, 200, decoy.body);
    assert.deepEqual(entryPaths(decoy.body), ['/workspaces/visible']);
  } finally {
    cookie = originalCookie;
  }
});

test('D1 工作流：主目录可直接新建文件夹并登记；__deny__ 不开放任何创建通道', async () => {
  const home = os.homedir().replace(/\\/g, '/').replace(/\/+$/, '');
  const newDir = `${home}/d1-home-e2e-dir`;
  // 与网关 normalizePath 同口径（盘符小写）比较 DB 内的路径。
  const norm = (p: string) => p.replace(/^([A-Za-z]):/, (m) => m.toLowerCase());
  const subUser = db.createUser('d1-home-flow-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
  });
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  const json = { 'content-type': 'application/json' };
  try {
    // 1) 主目录新建文件夹（picker 落点，D1 工作流第一步）。
    const mkdir = await gatewayReq('POST', '/api/directoryPicker/createDirectory', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1h-mkdir', method: 'directoryPicker/createDirectory',
      payload: { args: { path: home, name: 'd1-home-e2e-dir' } },
    }));
    assert.equal(mkdir.status, 200, mkdir.body);

    // 2) 刚创建的目录可列出（选择新文件夹必需）且可登记为工作区。
    const listNew = await gatewayReq('POST', '/api/directoryPicker/list', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1h-list-new', method: 'directoryPicker/list',
      payload: { args: { path: newDir } },
    }));
    assert.equal(listNew.status, 200, '刚创建的目录必须立即可进入');
    workspaceCreateMakesNewWorkspace = true;
    const register = await gatewayReq('POST', '/api/workspace/create', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1h-register', method: 'workspace/create',
      payload: { args: { request: { path: newDir } } },
    }));
    assert.equal(register.status, 200, register.body);
    assert.equal(
      db.listUserWorkspacePaths(subUser.id).some((entry) => norm(entry) === norm(newDir)),
      true,
    );
    assert.equal(
      (db.getPermissions(subUser.id)?.allowed_folders ?? []).some((entry) => norm(entry) === norm(newDir)),
      true,
    );

    // 3) 根目录（'/'）不是主目录，仍拒绝创建。
    const mkdirRoot = await gatewayReq('POST', '/api/directoryPicker/createDirectory', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1h-mkdir-root', method: 'directoryPicker/createDirectory',
      payload: { args: { path: '/', name: 'should-deny' } },
    }));
    assert.equal(mkdirRoot.status, 403, '文件系统根不是创建父目录');
  } finally {
    workspaceCreateMakesNewWorkspace = false;
    cookie = originalCookie;
  }
});

test('D1 工作流：仅新建工作区权限可从主目录创建并登记自建目录', async () => {
  const home = os.homedir().replace(/\\/g, '/').replace(/\/+$/, '');
  const denyUser = db.createUser('d1-deny-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(denyUser.id, {
    allowedFolders: ['__deny__'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
  });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(denyUser.id), username: denyUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const json = { 'content-type': 'application/json' };
  try {
    const mkdir = await gatewayReq('POST', '/api/directoryPicker/createDirectory', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1d-mkdir', method: 'directoryPicker/createDirectory',
      payload: { args: { path: home, name: 'deny-dir' } },
    }));
    assert.equal(mkdir.status, 200, mkdir.body);
    const register = await gatewayReq('POST', '/api/workspace/create', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1d-register', method: 'workspace/create',
      payload: { args: { request: { path: `${home}/deny-dir` } } },
    }));
    assert.equal(register.status, 200, register.body);
    const initialize = await gatewayReq('POST', '/api/workspace/initializeDefault', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1d-initialize', method: 'workspace/initializeDefault', payload: { args: {} },
    }));
    assert.equal(initialize.status, 200, initialize.body);
  } finally {
    cookie = originalCookie;
  }
});

test('Issue #25：空 allowed_folders 在登记新工作区后仍保持不限目录', async () => {
  const unrestricted = db.createUser('unrestricted-workspace-create', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(unrestricted.id, {
    allowedFolders: [], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
  });
  db.addAllowedFolder(unrestricted.id, '/workspaces/new');
  assert.deepEqual(db.getPermissions(unrestricted.id)?.allowed_folders, [], '空列表代表不限，不能被登记流程收窄');
});

test('Issue #25：弱网络下 workspace upsert 先于 session.create 响应仍保留会话分组', async () => {
  const subUser = db.createUser('issue-25-create-race', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  delaySessionCreateResponse = true;
  releaseSessionCreateResponse = null;
  try {
    const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'issue-25-create-race-workspace', endpoint: 'workspace/follow', payload: { args: {} },
      }));
      const baseline = await connection.nextFrame();
      assert.equal(baseline.streamId, 'issue-25-create-race-workspace');

      const create = gatewayReq(
        'POST',
        '/api/session.create',
        { 'content-type': 'application/json' },
        JSON.stringify({
          type: 'client-request', rpcId: 'issue-25-create-race', method: 'session/create',
          payload: { args: { request: { workspaceId: 'workspace-visible' } } },
        }),
      );
      for (let attempt = 0; attempt < 20 && releaseSessionCreateResponse === null; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      const release = releaseSessionCreateResponse as (() => void) | null;
      if (release === null) throw new Error('mock DSH must receive the delayed create request');
      assert.match(wireCreatedSessionId, /^session-[0-9a-f-]{36}$/i, '网关必须向 DSH 发出预分配 sessionId');

      const upsert = await connection.nextFrame();
      const upsertValue = upsert.value as { type?: string; workspace?: { sessionIds?: string[] } };
      assert.equal(upsertValue.type, 'upsert');
      assert.deepEqual(upsertValue.workspace?.sessionIds, ['session-visible', createdSessionIdForMock]);
      assert.equal(db.listUserSessionGrants(subUser.id).includes(createdSessionIdForMock), false, 'upsert 到达时仍未提前写入 grant');

      release();
      releaseSessionCreateResponse = null;
      const response = await create;
      assert.equal(response.status, 200, response.body);
      assert.deepEqual(db.listUserSessionGrants(subUser.id), [wireCreatedSessionId, 'session-visible'].sort(), '创建响应确认后才写入 grant');
    } finally {
      connection.client.close();
    }
  } finally {
    delaySessionCreateResponse = false;
    dropDelayedWorkspaceUpsert = false;
    const pendingRelease = releaseSessionCreateResponse as (() => void) | null;
    releaseSessionCreateResponse = null;
    if (pendingRelease !== null) pendingRelease();
    cookie = originalCookie;
  }
});

test('Issue #25：原始 workspace upsert 丢失时，创建响应后补发最终会话分组', async () => {
  const subUser = db.createUser('issue-25-create-compensation', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  delaySessionCreateResponse = true;
  dropDelayedWorkspaceUpsert = true;
  releaseSessionCreateResponse = null;
  try {
    const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'issue-25-create-compensation-workspace', endpoint: 'workspace/follow', payload: { args: {} },
      }));
      const baseline = await connection.nextFrame();
      assert.equal(baseline.streamId, 'issue-25-create-compensation-workspace');

      const create = gatewayReq(
        'POST',
        '/api/session.create',
        { 'content-type': 'application/json' },
        JSON.stringify({
          type: 'client-request', rpcId: 'issue-25-create-compensation', method: 'session/create',
          payload: { args: { request: { workspaceId: 'workspace-visible' } } },
        }),
      );
      for (let attempt = 0; attempt < 20 && releaseSessionCreateResponse === null; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      const release = releaseSessionCreateResponse as (() => void) | null;
      if (release === null) throw new Error('mock DSH must receive the delayed create request');
      release();
      releaseSessionCreateResponse = null;
      const response = await create;
      assert.equal(response.status, 200, response.body);

      const compensation = await connection.nextFrame();
      const value = compensation.value as { type?: string; workspace?: { sessionIds?: string[] } };
      assert.equal(compensation.streamId, 'issue-25-create-compensation-workspace');
      assert.equal(value.type, 'upsert');
      assert.deepEqual(value.workspace?.sessionIds, ['session-visible', wireCreatedSessionId]);
    } finally {
      connection.client.close();
    }
  } finally {
    delaySessionCreateResponse = false;
    dropDelayedWorkspaceUpsert = false;
    const pendingRelease = releaseSessionCreateResponse as (() => void) | null;
    releaseSessionCreateResponse = null;
    if (pendingRelease !== null) pendingRelease();
    cookie = originalCookie;
  }
});

test('Issue #25：权限保存拒绝当前资源快照中不存在的会话', async () => {
  const subUser = db.createUser('issue-25-stale-assignment', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const originalCookie = cookie;
  const originalResources = assignableResources;
  cookie = originalCookie;
  assignableResources = { folders: ['/workspaces/visible'], sessions: ['session-visible'] };
  const payload = JSON.stringify({
    userId: subUser.id,
    allowedFolders: ['/workspaces/visible'],
    allowedSessionIds: ['deleted-session'],
  });
  try {
    const response = await gatewayReq('POST', '/gateway/api/permissions', { 'content-type': 'application/json' }, payload);
    assert.equal(response.status, 400, response.body);
    assert.equal(db.listUserSessionGrants(subUser.id).includes('deleted-session'), false);
  } finally {
    assignableResources = originalResources;
    cookie = originalCookie;
  }
});

test('Issue #25：保存权限时清理历史失效会话并保留新授权', async () => {
  const subUser = db.createUser('issue-25-stale-existing-grant', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    allowedSessionIds: ['archived-session'],
  });
  const originalResources = assignableResources;
  assignableResources = { folders: ['/workspaces/visible'], sessions: ['session-visible'] };
  try {
    const response = await gatewayReq(
      'POST',
      '/gateway/api/permissions',
      { 'content-type': 'application/json' },
      JSON.stringify({
        userId: subUser.id,
        allowedFolders: ['/workspaces/visible'],
        allowedSessionIds: ['archived-session', 'session-visible'],
      }),
    );
    assert.equal(response.status, 200, response.body);
    assert.deepEqual(db.listUserSessionGrants(subUser.id), ['session-visible']);
    assert.deepEqual(JSON.parse(response.body).allowedSessionIds, ['session-visible']);
  } finally {
    assignableResources = originalResources;
  }
});

test('资源清单耗时超过旧 3 秒预算时仍可分配工作区', async () => {
  const subUser = db.createUser('slow-assignable-resource-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  const originalDelay = assignableResourcesDelayMs;
  assignableResourcesDelayMs = 3_200;
  try {
    const response = await gatewayReq('POST', '/gateway/api/permissions', { 'content-type': 'application/json' }, JSON.stringify({
      userId: subUser.id, allowedFolders: ['/workspaces/visible'],
    }));
    assert.equal(response.status, 200, response.body);
    assert.deepEqual(db.getPermissions(subUser.id)?.allowed_folders, ['/workspaces/visible']);
  } finally {
    assignableResourcesDelayMs = originalDelay;
  }
});

test('Issue #25：资源核验不可用时权限保存 fail-closed', async () => {
  const subUser = db.createUser('issue-25-resource-outage', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const originalCookie = cookie;
  const originalResources = assignableResources;
  const originalResourcesUnavailable = assignableResourcesUnavailable;
  cookie = originalCookie;
  assignableResourcesUnavailable = true;
  try {
    const response = await gatewayReq('POST', '/gateway/api/permissions', { 'content-type': 'application/json' }, JSON.stringify({
      userId: subUser.id,
      allowedFolders: ['/workspaces/visible'],
      allowedSessionIds: ['session-visible'],
    }));
    assert.equal(response.status, 502, response.body);
    assert.deepEqual(db.listUserSessionGrants(subUser.id), []);
  } finally {
    assignableResources = originalResources;
    assignableResourcesUnavailable = originalResourcesUnavailable;
    cookie = originalCookie;
  }
});

test('rc.1 session.search 只返回子用户已授权会话的摘要', async () => {
  const subUser = db.createUser('session-search-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const subCookie = `dsh_gateway_token=${subToken}`;
  const originalCookie = cookie;
  cookie = subCookie;
  try {
    const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'session-search-workspace', endpoint: 'workspace/follow', payload: { args: {} },
      }));
      await connection.nextFrame();
      const response = await gatewayReq(
        'POST',
        '/api/session.search',
        { 'content-type': 'application/json' },
        JSON.stringify({ type: 'client-request', rpcId: 'session-search', method: 'session/search', payload: { args: { request: { query: 'secret' } } } }),
      );
      assert.equal(response.status, 200, response.body);
      const value = (JSON.parse(response.body) as {
        result: { value: { items: Array<{ sessionId: string; snippet: string }>; hasMore: boolean } };
      }).result.value;
      assert.deepEqual(value.items, [{ sessionId: 'session-visible', snippet: 'visible session snippet' }]);
      assert.equal(value.hasMore, false);
      assert.doesNotMatch(response.body, /hidden session snippet|session-hidden/);
    } finally {
      connection.client.close();
    }
  } finally {
    cookie = originalCookie;
  }
});

test('rc.1 session.search 成功响应结构异常时 fail-closed，不透传原始结果', async () => {
  const subUser = db.createUser('session-search-malformed', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  const originalMode = sessionSearchResponseMode;
  cookie = subCookie;
  sessionSearchResponseMode = 'malformed';
  try {
    const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'session-search-malformed-workspace', endpoint: 'workspace/follow', payload: { args: {} },
      }));
      await connection.nextFrame();
      const response = await gatewayReq(
        'POST',
        '/api/session.search',
        { 'content-type': 'application/json' },
        JSON.stringify({ type: 'client-request', rpcId: 'session-search-malformed', method: 'session/search', payload: { args: { request: { query: 'secret' } } } }),
      );
      assert.equal(response.status, 502, response.body);
      assert.doesNotMatch(response.body, /malformed|session-visible/);
    } finally {
      connection.client.close();
    }
  } finally {
    sessionSearchResponseMode = originalMode;
    cookie = originalCookie;
  }
});

test('session/history 与 session/page 解码/解析失败时 fail-closed 502，不回放未清洗内容', async () => {
  // 隐藏 Unicode 清洗（history 还含受限子用户沙盒降级）是强制项；上游以不支持的
  // content-encoding: br 或畸形 JSON 回带标记时，网关必须 502，绝不能让原始体到达客户端。
  for (const endpoint of ['/api/session.history', '/api/session.page']) {
    for (const mode of ['raw-fallback-br', 'raw-fallback-bad-json']) {
      const response = await gatewayReq(
        'POST',
        endpoint,
        { 'content-type': 'application/json', 'x-test-mode': mode },
        JSON.stringify({ type: 'client-request', rpcId: `raw-fallback-${mode}`, method: 'session/history', payload: { args: {} } }),
      );
      assert.equal(response.status, 502, `${endpoint} ${mode}: ${response.body}`);
      assert.ok(!response.body.includes('RAW-FALLBACK-MARKER'), `${endpoint} ${mode} 不得回放上游原始内容`);
    }
  }
});

test('普通第三方 HTTP 路径对子用户直接放行（SSH 开关不参与普通扩展判定）', async () => {
  const subUser = db.createUser('third-party-denied-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false, allowSsh: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const upstreamUrlBefore = lastUpstreamUrl;
  const originalCookie = cookie;
  cookie = subCookie;
  try {
    // 普通第三方路径不再依赖端点登记或 allow_ssh；路径分类完成后直接进入上游代理。
    const response = await gatewayReq(
      'POST',
      '/api/dsh-ssh/hosts',
      { 'content-type': 'application/json' },
      JSON.stringify({ alias: 'must-not-reach-upstream', host: '203.0.113.10' }),
    );
    assert.equal(response.status, 201, response.body);
    assert.notEqual(lastUpstreamUrl, upstreamUrlBefore, '普通插件请求应到达 dsh');
  } finally {
    cookie = originalCookie;
  }
});

test('SSH HTTP 端点：子用户一律拒绝（历史 allow_ssh 也不例外），主用户仍可用', async () => {
  const offUser = db.createUser('ssh-two-key-off', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  const onUser = db.createUser('ssh-two-key-on', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(offUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false, allowSsh: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  db.setPermissions(onUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false, allowSsh: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const offCookie = `dsh_gateway_token=${jwt.sign({ sub: String(offUser.id), username: offUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const onCookie = `dsh_gateway_token=${jwt.sign({ sub: String(onUser.id), username: onUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  try {
    // 传统 SSH 登记已改为 owner-only 宿主能力：子用户无论历史 allow_ssh 如何都不可用。
    cookie = offCookie;
    const offUpstreamBefore = lastUpstreamUrl;
    const off = await gatewayReq('POST', '/api/ssh-http/inspect', { 'content-type': 'application/json' }, '{}');
    assert.equal(off.status, 403, off.body);
    assert.equal(lastUpstreamUrl, offUpstreamBefore, '未授权子用户不得到达上游');

    // 历史 allow_ssh=true 也不再授予 SSH 端点能力。
    cookie = onCookie;
    const onUpstreamBefore = lastUpstreamUrl;
    const on = await gatewayReq('POST', '/api/ssh-http/inspect', { 'content-type': 'application/json' }, '{}');
    assert.equal(on.status, 403, `历史 allow_ssh=true 仍不可用: ${on.body}`);
    assert.equal(lastUpstreamUrl, onUpstreamBefore, 'allow_ssh 不再放行 SSH 端点');

    // 主用户不受 SSH 边界限制（originalCookie 即管理员会话）
    cookie = originalCookie;
    const adminResponse = await gatewayReq('POST', '/api/ssh-http/inspect', { 'content-type': 'application/json' }, '{}');
    assert.equal(adminResponse.status, 200, adminResponse.body);
  } finally {
    cookie = originalCookie;
  }
});

test('传输前缀：SSH 登记在两条通道对子用户一律拒绝（前缀不绕过 owner-only）', async () => {
  const subUser = db.createUser('ssh-transport-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false, allowSsh: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  try {
    // SSH 已改为 owner-only：transport 前缀只用于登记表解析，不再向子用户放开任何通道。
    const wsRuleOverWs = await websocketHandshake('/api/ssh-ws-only/terminal', {
      cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1',
    });
    assert.match(wsRuleOverWs.statusLine, /403/, 'ws: SSH 规则对子用户拒绝');

    // ws: 规则不能通过 HTTP 绕过。
    const wsRuleOverHttp = await gatewayReq(
      'POST', '/api/ssh-ws-only/terminal', { 'content-type': 'application/json' }, '{}',
    );
    assert.equal(wsRuleOverHttp.status, 403, 'ws: SSH 规则不得在 HTTP 通道放行');

    // http: 规则对 HTTP 通道同样拒绝。
    const httpRuleOverHttp = await gatewayReq(
      'POST', '/api/ssh-http-only/inspect', { 'content-type': 'application/json' }, '{}',
    );
    assert.equal(httpRuleOverHttp.status, 403, `http: SSH 规则对子用户拒绝: ${httpRuleOverHttp.body}`);

    // http: 规则也不能通过 WebSocket 通道绕过（前缀不重开另一条 carrier）。
    const httpRuleOverWs = await websocketHandshake('/api/ssh-http-only/inspect', {
      cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1',
    });
    assert.match(httpRuleOverWs.statusLine, /403/, 'http: SSH 规则不得在 WebSocket 通道放行');

    // 主用户不受登记表/SSH 边界限制，两条通道各自放行。
    cookie = originalCookie;
    assert.match(
      (await websocketHandshake('/api/ssh-ws-only/terminal', {
        cookie: originalCookie, origin: 'http://127.0.0.1', host: '127.0.0.1',
      })).statusLine,
      /101/,
      '主用户 ws: SSH 规则应放行',
    );
    assert.equal(
      (await gatewayReq('POST', '/api/ssh-http-only/inspect', { 'content-type': 'application/json' }, '{}')).status,
      200,
      '主用户 http: SSH 规则应放行',
    );
  } finally {
    cookie = originalCookie;
  }
});

test('owner-only 表在两条通道都生效（WebSocket 侧不被 SSH 登记绕过）', async () => {
  const subUser = db.createUser('ssh-owner-only-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    // 已勾选 SSH：该路径同时在 SSH 表里，owner-only 必须仍然优先
    allowSsh: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  try {
    const overHttp = await gatewayReq(
      'POST', '/api/ssh-owner-only/hosts', { 'content-type': 'application/json' }, '{}',
    );
    assert.equal(overHttp.status, 403, 'owner-only 应优先于 SSH 登记（HTTP）');

    const overWs = await websocketHandshake('/api/ssh-owner-only/hosts', {
      cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1',
    });
    assert.match(overWs.statusLine, /403/, 'owner-only 应优先于 SSH 登记（WS，修复前这里会被放过）');
  } finally {
    cookie = originalCookie;
  }
});

test('SSH HTTP 端点 SSRF：子用户不可达；主用户私网 host 被拦、公网放行且钉死 DNS', async () => {
  const subUser = db.createUser('ssh-ssrf-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false, allowSsh: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  try {
    // 子用户对已登记 SSH 端点整体不可达：私网/公网 host 均在网关边界返回 403，
    // 不依赖（也不可能触发）SSRF 检查。
    const subUpstreamBefore = lastUpstreamUrl;
    for (const host of ['127.0.0.1', '8.8.8.8']) {
      const denied = await gatewayReq(
        'POST', '/api/ssh-http/inspect', { 'content-type': 'application/json' },
        JSON.stringify({ host }),
      );
      assert.equal(denied.status, 403, `${host} 子用户应被拒绝: ${denied.body}`);
    }
    assert.equal(lastUpstreamUrl, subUpstreamBefore, '子用户 SSH 请求不得到达上游');

    // 主用户可以抵达已登记 SSH 端点，SSRF 纵深防御仍然生效（不因改为子用户边界
    // 而丢掉宿主回环/元数据的保护）。
    cookie = originalCookie;
    for (const host of ['127.0.0.1', '0177.0.0.1', '169.254.169.254', '::ffff:127.0.0.1']) {
      const blocked = await gatewayReq(
        'POST', '/api/ssh-http/inspect', { 'content-type': 'application/json' },
        JSON.stringify({ host }),
      );
      assert.equal(blocked.status, 403, `${host} 应被拦截: ${blocked.body}`);
    }
    // 公网 IP 字面量：通过校验，并改写为已验证地址（DNS 钉死）
    const allowed = await gatewayReq(
      'POST', '/api/ssh-http/inspect', { 'content-type': 'application/json' },
      JSON.stringify({ host: '8.8.8.8' }),
    );
    assert.equal(allowed.status, 200, allowed.body);
    assert.equal(
      (lastScopedRequestBody as { host?: unknown } | null)?.host,
      '8.8.8.8',
      '校验通过后 host 应被改写为已验证的 IP 字面量',
    );
  } finally {
    cookie = originalCookie;
  }
});

test('SSH 终端 WebSocket 升级对子用户拒绝', async () => {
  const subUser = db.createUser('ssh-terminal-denied-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false, allowSsh: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const handshake = await websocketHandshake('/api/dsh-ssh/terminal?alias=forbidden', {
    cookie: `dsh_gateway_token=${subToken}`,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  });
  assert.match(handshake.statusLine, /403/);
});

test('SSH 终端 WebSocket：子用户即使 allow_ssh=true 也不能连接已登记端点，主用户仍可用', async () => {
  const subUser = db.createUser('ssh-terminal-shared-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false, allowSsh: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const denied = await websocketHandshake('/api/dsh-ssh/terminal?alias=admin-host', {
    cookie: `dsh_gateway_token=${subToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  assert.match(denied.statusLine, /403/, '历史 allow_ssh=true 不再授予已登记终端端点');
  const admin = await websocketHandshake('/api/dsh-ssh/terminal?alias=admin-host', {
    cookie, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  assert.match(admin.statusLine, /101/, '主用户仍可连接已登记终端端点');
});

test('多 SSH WebSocket 端点：子用户一律拒绝，主用户可连接全部已登记端点', async () => {
  const deniedUser = db.createUser('ssh-second-denied', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(deniedUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false, allowSsh: false,
    allowedAgentPresets: null, banned: false,
    sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const deniedToken = jwt.sign({ sub: String(deniedUser.id), username: deniedUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const denied = await websocketHandshake('/plugins/ssh-b/terminal', {
    cookie: `dsh_gateway_token=${deniedToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  assert.match(denied.statusLine, /403/, '未勾选 SSH 权限时已登记端点被拒绝');

  const allowedUser = db.createUser('ssh-second-allowed', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(allowedUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false, allowSsh: true,
    allowedAgentPresets: null, banned: false,
    sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const allowedToken = jwt.sign({ sub: String(allowedUser.id), username: allowedUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const stillDenied = await websocketHandshake('/plugins/ssh-b/terminal', {
    cookie: `dsh_gateway_token=${allowedToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  assert.match(stillDenied.statusLine, /403/, '历史 allow_ssh=true 也不再放开已登记端点');

  const admin = await websocketHandshake('/plugins/ssh-b/terminal', {
    cookie, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  assert.match(admin.statusLine, /101/, '主用户可连接已登记端点');
});

test('通配 SSH WebSocket 端点：子用户一律拒绝，主用户可连接', async () => {
  const sshUser = db.createUser('ssh-wildcard-allowed', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(sshUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false, allowSsh: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const sshToken = jwt.sign({ sub: String(sshUser.id), username: sshUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const sshHeaders = { cookie: `dsh_gateway_token=${sshToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1' };

  const child = await websocketHandshake('/plugins/ssh-wild/terminal', sshHeaders);
  assert.match(child.statusLine, /403/, '已登记通配端点的直接子路径对子用户拒绝');
  const base = await websocketHandshake('/plugins/ssh-wild', sshHeaders);
  assert.match(base.statusLine, /404/, '通配规则不放行基路径本身');
  const deeper = await websocketHandshake('/plugins/ssh-wild/a/b', sshHeaders);
  assert.match(deeper.statusLine, /404/, '通配规则不放行更深层路径');

  const deniedUser = db.createUser('ssh-wildcard-denied', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(deniedUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false, allowSsh: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const deniedToken = jwt.sign({ sub: String(deniedUser.id), username: deniedUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const denied = await websocketHandshake('/plugins/ssh-wild/terminal', {
    cookie: `dsh_gateway_token=${deniedToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  assert.match(denied.statusLine, /403/, '未勾选 SSH 权限时通配端点被拒绝');

  const admin = await websocketHandshake('/plugins/ssh-wild/terminal', {
    cookie, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  assert.match(admin.statusLine, /101/, '管理员不受端点清单限制');
});

test('Issue #25：alpha.3 session.list 先到时等待 Remote 基线并只返回显式授权会话', async () => {
  const subUser = db.createUser('issue-25-session-list-race', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  try {
    let resolved = false;
    const pendingList = gatewayReq('POST', '/api/session.list', { 'content-type': 'application/json' }, '{}').then((response) => {
      resolved = true;
      return response;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(resolved, false, 'session.list must wait for a trusted Remote workspace baseline');

    const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'session-list-race-workspace', endpoint: 'workspace/follow', payload: { args: {} },
      }));
      const baseline = await connection.nextFrame();
      assert.equal(baseline.streamId, 'session-list-race-workspace');
      const response = await pendingList;
      assert.equal(response.status, 200, response.body);
      const items = (JSON.parse(response.body) as {
        result: { value: { items: Array<{ sessionId: string }> } };
      }).result.value.items;
      assert.deepEqual(items.map((item) => item.sessionId), ['session-visible']);
    } finally {
      connection.client.close();
    }
  } finally {
    cookie = originalCookie;
  }
});

test('Issue #25：alpha.3 子用户能建立 $events 并且只收到当前工作区可见会话的通知', async () => {
  remoteMuxOpenEndpoints = [];
  const subUser = db.createUser('issue-25-events-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null, allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible', 'session-hidden'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const connection = await openRemoteMux({
    cookie: `dsh_gateway_token=${subToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'workspace-before-events', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    const workspace = await connection.nextFrame();
    assert.equal(workspace.streamId, 'workspace-before-events');

    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'events', endpoint: '$events', payload: { args: {} },
    }));
    const ready = await connection.nextFrame();
    const visible = await connection.nextFrame();
    assert.deepEqual(ready, {
      type: 'item', streamId: 'events', value: { type: 'ready', clientId: 'remote-client', host: { home: '/root' } },
    });
    assert.deepEqual(visible, {
      type: 'item', streamId: 'events', value: { type: 'emit', event: 'api-session/added', args: [{ sessionId: 'session-visible' }] },
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.deepEqual(remoteMuxOpenEndpoints, ['workspace/follow', '$events']);
  } finally {
    connection.client.close();
  }
});

test('Issue #26：子用户收到自己会话的提问与审批 waterfall，且结果只能由同一 Remote generation 回传', async () => {
  const subUser = db.createUser('issue-26-events-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  const originalCookie = cookie;
  cookie = subCookie;
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'issue-26-workspace', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    assert.equal((await connection.nextFrame()).streamId, 'issue-26-workspace');
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'issue-26-events', endpoint: '$events', payload: { args: {} },
    }));
    const ready = await connection.nextFrame();
    const added = await connection.nextFrame();
    const question = await connection.nextFrame();
    const approval = await connection.nextFrame();
    assert.deepEqual(ready, {
      type: 'item', streamId: 'issue-26-events', value: { type: 'ready', clientId: 'remote-client', host: { home: '/root' } },
    });
    assert.equal((added.value as { type?: string }).type, 'emit');
    assert.deepEqual(question, {
      type: 'item', streamId: 'issue-26-events', value: {
        type: 'waterfall', event: 'user-questions/request', eventId: 'question-visible', agentId: 'session-visible',
        request: { questions: [{ id: 'language', question: 'Choose language', options: [{ label: 'Chinese' }, { label: 'English' }] }] },
      },
    });
    assert.deepEqual(approval, {
      type: 'item', streamId: 'issue-26-events', value: {
        type: 'waterfall', event: 'approval/request', eventId: 'approval-visible', agentId: 'session-visible',
        request: { approvalId: 'approval-1', toolName: 'shell' },
      },
    });

    const result = (eventId: string, clientId = 'remote-client') => JSON.stringify({
      type: 'client-request', rpcId: `issue-26-${eventId}`, method: '$events/result',
      payload: { args: { clientId, eventId, outcome: { kind: 'result', value: { answers: [] } } } },
    });
    const forgedClient = await gatewayReq('POST', '/api/$events/result', { 'content-type': 'application/json' }, result('question-visible', 'wrong-client'));
    assert.equal(forgedClient.status, 403, forgedClient.body);
    const hidden = await gatewayReq('POST', '/api/$events/result', { 'content-type': 'application/json' }, result('question-hidden'));
    assert.equal(hidden.status, 403, hidden.body);
    const allowed = await gatewayReq('POST', '/api/$events/result', { 'content-type': 'application/json' }, result('question-visible'));
    assert.equal(allowed.status, 200, allowed.body);
    const replay = await gatewayReq('POST', '/api/$events/result', { 'content-type': 'application/json' }, result('question-visible'));
    assert.equal(replay.status, 403, replay.body);
    const approvalResult = await gatewayReq('POST', '/api/$events/result', { 'content-type': 'application/json' }, result('approval-visible'));
    assert.equal(approvalResult.status, 200, approvalResult.body);

    // A shared session may receive the same Host waterfall on two independent
    // Remote generations. The first subuser's answer must not overwrite the
    // other recipient's authorization record.
    const sharedUser = db.createUser('issue-26-shared-events-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
    db.setPermissions(sharedUser.id, {
      allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
      allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
      allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
    });
    db.markSessionGrantsSeeded(sharedUser.id);
    const sharedCookie = `dsh_gateway_token=${jwt.sign({ sub: String(sharedUser.id), username: sharedUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
    const sharedConnection = await openRemoteMux({ cookie: sharedCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      sharedConnection.client.send(JSON.stringify({ type: 'open', streamId: 'issue-26-shared-workspace', endpoint: 'workspace/follow', payload: { args: {} } }));
      await sharedConnection.nextFrame();
      sharedConnection.client.send(JSON.stringify({ type: 'open', streamId: 'issue-26-shared-events', endpoint: '$events', payload: { args: {} } }));
      await sharedConnection.nextFrame();
      await sharedConnection.nextFrame();
      const sharedQuestion = await sharedConnection.nextFrame();
      assert.equal((sharedQuestion.value as { eventId?: string }).eventId, 'question-visible');
      const originalResultCookie = cookie;
      cookie = sharedCookie;
      try {
        const sharedResult = await gatewayReq('POST', '/api/$events/result', { 'content-type': 'application/json' }, result('question-visible'));
        assert.equal(sharedResult.status, 200, sharedResult.body);
      } finally {
        cookie = originalResultCookie;
      }
    } finally {
      sharedConnection.client.close();
    }
  } finally {
    cookie = originalCookie;
    connection.client.close();
  }
});

test('Remote mux 浏览器腿发送 heartbeat ping，避免前置代理按空闲连接回收', async () => {
  const connection = await openRemoteMux({ cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  let pings = 0;
  connection.client.on('ping', () => { pings += 1; });
  try {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    assert.ok(pings >= 1, `expected at least one browser-leg ping, got ${String(pings)}`);
  } finally {
    connection.client.close();
  }
});

test('Remote mux 转发超过 1MiB 的 RC.1 历史快照单帧', async () => {
  remoteMuxHistoryPayloadBytes = 2 * 1024 * 1024;
  try {
    const connection = await openRemoteMux({ cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'large-history', endpoint: 'session/follow', payload: { args: {} },
      }));
      const frame = await connection.nextFrame();
      const value = frame.value as { header?: { id?: string }; records?: Array<{ event?: { data?: string } }> };
      assert.equal(frame.type, 'item');
      assert.equal(value.header?.id, 'session-visible');
      assert.equal((value.records?.[0]?.event?.data as string | undefined)?.length, remoteMuxHistoryPayloadBytes);
    } finally {
      connection.client.close();
    }
  } finally {
    remoteMuxHistoryPayloadBytes = 0;
  }
});

test('管理员 Remote mux 接受官方协议的合法扩展 endpoint', async () => {
  remoteMuxOpenEndpoints = [];
  const connection = await openRemoteMux({ cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'official-extension', endpoint: 'feed/follow', payload: { args: {} },
    }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(remoteMuxOpenEndpoints, ['feed/follow']);
  } finally {
    connection.client.close();
  }
});

test('Issue #25：alpha.3 只允许子用户订阅被明确授予的 session/follow', async () => {
  const subUser = db.createUser('issue-25-follow-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const headers = { cookie: `dsh_gateway_token=${subToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1' };
  remoteMuxOpenEndpoints = [];
  const connection = await openRemoteMux(headers);
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'follow-visible', endpoint: 'session/follow',
      payload: { args: { request: { address: { kind: 'session', sessionId: 'session-visible' }, maxMessages: 200 } } },
    }));
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.deepEqual(remoteMuxOpenEndpoints, [], 'session/follow must wait for a trusted workspace baseline');
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'follow-workspace', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    const workspace = await connection.nextFrame();
    const authorized = await connection.nextFrame();
    assert.equal(workspace.streamId, 'follow-workspace');
    assert.equal(authorized.type, 'item');
    assert.equal((authorized.value as any).type, 'snapshot');
    assert.equal((authorized.value as any).header.id, 'session-visible');
    assert.deepEqual(remoteMuxOpenEndpoints, ['workspace/follow', 'session/follow']);
  } finally {
    connection.client.close();
  }
  const client = new NodeWebSocket(`ws://127.0.0.1:${String(gatewayPort)}/api/remote.mux`, { headers });
  try {
    const forbidden = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.terminate();
        reject(new Error('Remote mux logical error timeout'));
      }, 3000);
      client.once('error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
      client.once('open', () => client.send(JSON.stringify({
        type: 'open', streamId: 'follow-hidden', endpoint: 'session/follow',
        payload: { args: { request: { address: { kind: 'session', sessionId: 'session-hidden' } } } },
      })));
      client.once('message', (data: Buffer) => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(data.toString()) as Record<string, unknown>);
        } catch (error) {
          reject(error);
        }
      });
    });
    assert.deepEqual(forbidden, {
      type: 'error',
      streamId: 'follow-hidden',
      error: {
        code: 'gateway/forbidden',
        message: 'Remote session not available for this user',
        details: {},
      },
    });
    assert.equal(client.readyState, NodeWebSocket.OPEN, '逻辑流拒绝不得关闭物理 mux');
    assert.deepEqual(remoteMuxOpenEndpoints, ['workspace/follow', 'session/follow'], '被拒绝的 session/follow 不得转发到 DSH');
  } finally {
    client.terminate();
  }
});

test('RC.1 子代理 session/follow 沿用 parent 授权并原样保留地址与连续字段', async () => {
  const subUser = db.createUser('rc1-subagent-follow-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const childId = 'child-without-grant';
  assert.deepEqual(db.listUserSessionGrants(subUser.id), ['session-visible']);
  const headers = {
    cookie: `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`,
    origin: 'http://127.0.0.1', host: '127.0.0.1',
  };
  remoteMuxOpenEndpoints = [];
  remoteMuxOpenFrames = [];
  const connection = await openRemoteMux(headers);
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'subagent-workspace', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    await connection.nextFrame();
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'subagent-follow', endpoint: 'session/follow',
      payload: { args: { request: {
        address: { kind: 'subagent', parentSessionId: 'session-visible', childSessionId: childId, mode: 'continuable' },
        maxMessages: 50,
      } } },
    }));
    const snapshot = await connection.nextFrame();
    const event = await connection.nextFrame();
    assert.deepEqual((remoteMuxOpenFrames.find((frame) => frame.endpoint === 'session/follow')?.payload as any).args.request.address, {
      kind: 'subagent', parentSessionId: 'session-visible', childSessionId: childId, mode: 'continuable',
    });
    assert.deepEqual(snapshot, {
      type: 'item', streamId: 'subagent-follow', value: {
        type: 'snapshot',
        header: { id: childId, origin: 'subagent', parentSession: 'session-visible' },
        cursor: 17,
        records: [{ type: 'event', event: { type: 'message', seq: 17, text: 'child history' } }],
        projections: { model: 'test-model' }, hasMore: true,
      },
    });
    assert.deepEqual(event, {
      type: 'item', streamId: 'subagent-follow', value: { type: 'event', seq: 18, records: ['child-live-event'] },
    });
    assert.deepEqual(db.listUserSessionGrants(subUser.id), ['session-visible'], 'child must not become an ordinary grant');
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'subagent-follow-one-shot', endpoint: 'session/follow',
      payload: { args: { request: {
        address: { kind: 'subagent', parentSessionId: 'session-visible', childSessionId: 'one-shot-child', mode: 'one-shot' },
        maxMessages: 50,
      } } },
    }));
    const oneShotSnapshot = await connection.nextFrame();
    const oneShotEvent = await connection.nextFrame();
    assert.equal((oneShotSnapshot.value as any).cursor, 17);
    assert.equal((oneShotEvent.value as any).seq, 18);
    assert.deepEqual((remoteMuxOpenFrames.filter((frame) => frame.endpoint === 'session/follow').at(-1)?.payload as any).args.request.address, {
      kind: 'subagent', parentSessionId: 'session-visible', childSessionId: 'one-shot-child', mode: 'one-shot',
    });
  } finally {
    connection.client.close();
  }
});

test('RC.1 子代理 HTTP 请求只校验 parent，并保留 child 与 mode', async () => {
  const subUser = db.createUser('rc1-subagent-http-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${subToken}`;
  const address = { kind: 'subagent', parentSessionId: 'session-visible', childSessionId: 'http-child-without-grant', mode: 'continuable' };
  try {
    const connection = await openRemoteMux({
      cookie: `dsh_gateway_token=${subToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
    });
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'http-baseline', endpoint: 'workspace/follow', payload: { args: {} },
      }));
      await connection.nextFrame();
    } finally {
      connection.client.close();
    }
    const requests = [
      {
        method: 'session/page',
        args: { request: { address, throughSeq: 12, maxMessages: 50 } },
      },
      {
        method: 'subagents/prompt',
        args: { request: { requestId: 'request-1', parentSessionId: address.parentSessionId, childSessionId: address.childSessionId, mode: address.mode, content: [{ type: 'text', text: 'continue' }] } },
      },
      {
        method: 'subagents/interruptByParent',
        args: { childSessionId: address.childSessionId, parentSessionId: address.parentSessionId, mode: address.mode },
      },
    ] as const;
    for (const { method, args } of requests) {
      lastScopedRequestBody = null;
      const response = await gatewayReq(
        'POST', `/api/${method.replace('/', '.')}`, { 'content-type': 'application/json' },
        JSON.stringify({ type: 'client-request', rpcId: `rpc-${method}`, method, payload: { args } }),
      );
      assert.equal(response.status, 200, `${method}: ${response.body}`);
      const forwarded = lastScopedRequestBody as Record<string, unknown> | null;
      assert.deepEqual(forwarded?.payload, { args }, `${method} must preserve its request`);
    }
    assert.deepEqual(db.listUserSessionGrants(subUser.id), ['session-visible']);
  } finally {
    cookie = originalCookie;
  }
});

test('RC.1 未授权 parent 的子代理地址在到达 DSH 前被拒绝', async () => {
  const subUser = db.createUser('rc1-subagent-denied-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null, allowUpload: true,
    allowGitDownload: false, allowWorkspaceCreate: false, allowedAgentPresets: null,
    banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const subCookie = `dsh_gateway_token=${subToken}`;
  const originalCookie = cookie;
  cookie = subCookie;
  // 会话归属校验现在是 baseline 门禁：gateway 在 workspace/follow 基线到达前会
  // 有界等待（无基线 → 503）。先建立合法基线，才能隔离出“未授权 parent → 403”本体。
  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'rc1-denied-parent-baseline', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    assert.equal((await nextFrameOrFail(connection, 'rc1 denied-parent baseline')).streamId, 'rc1-denied-parent-baseline');
    const before = lastUpstreamUrl;
    const response = await gatewayReq(
      'POST', '/api/session.page', { 'content-type': 'application/json' },
      JSON.stringify({ type: 'client-request', rpcId: 'rpc-denied-parent', method: 'session/page', payload: { args: { request: {
        address: { kind: 'subagent', parentSessionId: 'not-visible', childSessionId: 'child', mode: 'one-shot' }, throughSeq: 1,
      } } } }),
    );
    assert.equal(response.status, 403, response.body);
    assert.equal(lastUpstreamUrl, before, 'unauthorized subagent parent must not reach DSH');
    for (const [method, args] of [
      ['subagents/prompt', { request: { requestId: 'denied-request', parentSessionId: 'not-visible', childSessionId: 'child', mode: 'continuable', content: [{ type: 'text', text: 'denied' }] } }],
      ['subagents/interruptByParent', { childSessionId: 'child', parentSessionId: 'not-visible', mode: 'continuable' }],
    ] as const) {
      const denied = await gatewayReq(
        'POST', `/api/${method.replace('/', '.')}`, { 'content-type': 'application/json' },
        JSON.stringify({ type: 'client-request', rpcId: `rpc-${method}-denied`, method, payload: { args } }),
      );
      assert.equal(denied.status, 403, `${method}: ${denied.body}`);
      assert.equal(lastUpstreamUrl, before, `${method} must not reach DSH`);
    }
  } finally {
    connection.client.close();
    cookie = originalCookie;
  }
});

test('Issue #25：Remote session/follow 拒绝只结束逻辑流，不摧毁同一 mux', async () => {
  const subUser = db.createUser('issue-25-follow-folder-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    allowedSessionIds: ['session-hidden'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const headers = {
    cookie: `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`,
    origin: 'http://127.0.0.1', host: '127.0.0.1',
  };
  remoteMuxOpenEndpoints = [];
  const connection = await openRemoteMux(headers);
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'follow-folder-baseline', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    const baseline = await connection.nextFrame();
    assert.equal(baseline.streamId, 'follow-folder-baseline');

    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'follow-hidden-folder', endpoint: 'session/follow',
      payload: { args: { request: { address: { kind: 'session', sessionId: 'session-hidden' } } } },
    }));
    assert.deepEqual(await connection.nextFrame(), {
      type: 'error',
      streamId: 'follow-hidden-folder',
      error: {
        code: 'gateway/forbidden',
        message: 'Remote session not available for this user',
        details: {},
      },
    });
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, '逻辑流拒绝不得关闭物理 mux');
    assert.deepEqual(remoteMuxOpenEndpoints, ['workspace/follow'], '不可见工作区的 session/follow 不得到达 DSH');

    // The same carrier must still be able to open another official stream.
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'control-after-denial', endpoint: 'session/control', payload: { args: {} },
    }));
    const control = await connection.nextFrame();
    assert.equal(control.streamId, 'control-after-denial');
    assert.equal(control.type, 'item');
    assert.deepEqual((control.value as { value?: { queues?: Record<string, unknown> } }).value?.queues, {});
    assert.deepEqual(remoteMuxOpenEndpoints, ['workspace/follow', 'session/control']);
  } finally {
    connection.client.close();
  }
});

test('官方 open-in-app 路由对子用户可读，但启动路径必须属于已授权工作区', async () => {
  const subUser = db.createUser('official-open-in-app-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowSsh: false, allowedAgentPresets: null, banned: false, sandboxMode: null,
    disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    const apps = await gatewayReq('GET', '/open-in-app/apps');
    assert.equal(apps.status, 200, '官方目录读取不应被第三方 fail-closed 误拦');

    const denied = await gatewayReq(
      'POST', '/open-in-app/open', { 'content-type': 'application/json' },
      JSON.stringify({ app: 'vscode', path: '/tmp' }),
    );
    assert.equal(denied.status, 403, '子用户不能让官方启动器打开未授权目录');

    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'open-in-app-workspace', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    assert.equal((await connection.nextFrame()).streamId, 'open-in-app-workspace');
    const allowed = await gatewayReq(
      'POST', '/open-in-app/open', { 'content-type': 'application/json' },
      JSON.stringify({ app: 'vscode', path: '/workspaces/visible' }),
    );
    assert.equal(allowed.status, 200, allowed.body);
  } finally {
    connection.client.close();
    cookie = originalCookie;
  }
});

test('权限保存：仅更新 SSH 开关不初始化或清空会话授权集合', async () => {
  const subUser = db.createUser('ssh-partial-save-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.replaceUserSessionGrants(subUser.id, ['session-visible']);
  assert.equal(db.isSessionGrantsSeeded(subUser.id), false);
  const payload = JSON.stringify({
    userId: subUser.id,
    allowedFolders: ['__deny__'],
    allowSsh: true,
    allowUpload: false,
    allowGitDownload: false,
    allowWorkspaceCreate: false,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
  });
  const response = await gatewayReq(
    'POST', '/gateway/api/permissions',
    { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) },
    payload,
  );
  assert.equal(response.status, 200, response.body);
  assert.deepEqual(db.listUserSessionGrants(subUser.id), ['session-visible']);
  assert.equal(db.isSessionGrantsSeeded(subUser.id), false, '省略 allowedSessionIds 不得冻结一次性种子状态');
});

test('Issue #25：session/control 在 workspace 基线确认前不使用无 cwd 的临时授权', async () => {
  const subUser = db.createUser('issue-25-control-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  const permissionPayload = JSON.stringify({
    userId: subUser.id,
    allowedFolders: ['/workspaces/visible'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: false,
    allowGitDownload: false,
    allowWorkspaceCreate: false,
    allowedAgentPresets: null,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  const saved = await gatewayReq(
    'POST',
    '/gateway/api/permissions',
    { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(permissionPayload)) },
    permissionPayload,
  );
  assert.equal(saved.status, 200, saved.body);
  remoteMuxOpenEndpoints = [];
  const subToken = jwt.sign(
    { sub: String(subUser.id), username: subUser.username, cv: 0 },
    'test-secret',
    { expiresIn: '12h' },
  );
  const connection = await openRemoteMux({
    cookie: `dsh_gateway_token=${subToken}`,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'control-before-workspace', endpoint: 'session/control', payload: { args: {} },
    }));
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.deepEqual(remoteMuxOpenEndpoints, [], 'session/control must wait for a trusted workspace baseline');

    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'workspace-after-control', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    const workspaceFrame = await connection.nextFrame();
    const controlFrame = await connection.nextFrame();
    assert.equal(workspaceFrame.streamId, 'workspace-after-control');
    assert.equal(controlFrame.streamId, 'control-before-workspace');
    assert.deepEqual(remoteMuxOpenEndpoints, ['workspace/follow', 'session/control']);
    const controlValue = controlFrame.value as { value?: { queues?: Record<string, unknown> } };
    assert.deepEqual(Object.keys(controlValue.value?.queues ?? {}), ['session-visible']);
  } finally {
    connection.client.close();
  }
});

test('权限同值保存不触发子用户 Remote mux 重连', async () => {
  const subUser = db.createUser('issue-25-live-refresh', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: false,
    allowGitDownload: false,
    allowWorkspaceCreate: false,
    allowedAgentPresets: null,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign(
    { sub: String(subUser.id), username: subUser.username, cv: 0 },
    'test-secret',
    { expiresIn: '12h' },
  );
  const connection = await openRemoteMux({
    cookie: `dsh_gateway_token=${subToken}`,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'live-refresh-workspace', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    const baseline = await connection.nextFrame();
    assert.equal(baseline.streamId, 'live-refresh-workspace');
    let closed = false;
    connection.client.once('close', () => { closed = true; });
    const permissionPayload = JSON.stringify({
      userId: subUser.id,
      allowedFolders: ['/workspaces/visible'],
      hourlyTokenLimit: null,
      dailyMinutesLimit: null,
      allowUpload: false,
      allowGitDownload: false,
      allowWorkspaceCreate: false,
      allowedAgentPresets: null,
      banned: false,
      sandboxMode: null,
      disabledSessions: [],
      allowedSessionIds: ['session-visible'],
    });
    const saved = await gatewayReq(
      'POST',
      '/gateway/api/permissions',
      { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(permissionPayload)) },
      permissionPayload,
    );
    assert.equal(saved.status, 200, saved.body);
    await new Promise((resolve) => setTimeout(resolve, 75));
    assert.equal(closed, false, '权限语义未变化时不应关闭物理 mux');
  } finally {
    connection.client.close();
  }
});

function waitForWebSocketClose(client: any, label: string): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.terminate();
      reject(new Error(`${label}: websocket close timeout`));
    }, 3000);
    client.once('close', (code: number, reason: Buffer) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });
    client.once('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test('凭据撤销：主用户登出会立即关闭已建立的 Remote mux', async () => {
  const admin = db.createUser('logout-mux-admin', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
  const token = jwt.sign({ sub: String(admin.id), username: admin.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const adminCookie = `dsh_gateway_token=${token}`;
  const connection = await openRemoteMux({
    cookie: adminCookie,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  });
  try {
    const closed = waitForWebSocketClose(connection.client, 'logout admin mux');
    const logout = await gatewayReq('POST', '/gateway/logout', {
      cookie: adminCookie,
      origin: `http://127.0.0.1:${String(gatewayPort)}`,
    });
    assert.equal(logout.status, 302, logout.body);
    assert.deepEqual(await closed, { code: 1008, reason: 'Session ended' });
  } finally {
    connection.client.close();
  }
});

test('凭据撤销：内部 session-invalidate 会立即关闭子用户 Remote mux', async () => {
  const subUser = db.createUser('credential-mux-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowSsh: false, allowedAgentPresets: null, banned: false, sandboxMode: null,
    disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const connection = await openRemoteMux({
    cookie: `dsh_gateway_token=${subToken}`,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  });
  try {
    const closed = waitForWebSocketClose(connection.client, 'session invalidate mux');
    const invalidated = await gatewayReq(
      'POST',
      '/gateway/internal/session-invalidate',
      {
        cookie: '',
        'content-type': 'application/json',
        'x-internal-secret': 'test-internal',
      },
      JSON.stringify({ userId: subUser.id }),
    );
    assert.equal(invalidated.status, 200, invalidated.body);
    assert.deepEqual(await closed, { code: 1008, reason: 'Credentials changed' });
  } finally {
    connection.client.close();
  }
});

test('Issue #25：真实权限收紧仍触发一次子用户 Remote mux 刷新', async () => {
  const subUser = db.createUser('issue-25-live-revoke', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowSsh: false, allowedAgentPresets: null, banned: false, sandboxMode: null,
    disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign(
    { sub: String(subUser.id), username: subUser.username, cv: 0 },
    'test-secret',
    { expiresIn: '12h' },
  );
  const connection = await openRemoteMux({
    cookie: `dsh_gateway_token=${subToken}`,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'revoke-workspace', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    assert.equal((await connection.nextFrame()).streamId, 'revoke-workspace');
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      connection.client.once('close', (code: number, reason: Buffer) => resolve({ code, reason: reason.toString() }));
    });
    const payload = JSON.stringify({
      userId: subUser.id,
      allowedFolders: ['__deny__'],
      allowUpload: false,
      allowGitDownload: false,
      allowWorkspaceCreate: false,
      allowSsh: false,
      allowedAgentPresets: null,
      banned: false,
      sandboxMode: null,
      disabledSessions: [],
      allowedSessionIds: ['session-visible'],
    });
    const saved = await gatewayReq(
      'POST', '/gateway/api/permissions',
      { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) },
      payload,
    );
    assert.equal(saved.status, 200, saved.body);
    assert.deepEqual(await closed, { code: 1012, reason: 'Permissions changed' });
  } finally {
    connection.client.close();
  }
});

test('普通插件上传路径不再受 allow_upload 开关阻断', async () => {
  const subUser = db.createUser('upload-denied-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: false,
    allowGitDownload: true,
    allowWorkspaceCreate: false,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
  });
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  // 官方 fileUploads 端点现在是会话作用域：owner 鉴权依赖 Remote 基线，无基线会
  // 503。先建立基线，才能隔离出“allow_upload 开关不再决定上传端点”的本体。
  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'upload-policy-baseline', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    assert.equal((await nextFrameOrFail(connection, 'upload baseline')).streamId, 'upload-policy-baseline');
    for (const target of ['/api/fileUploads/upload', '/api/filePathBridge/importFile']) {
      const response = await gatewayReq('POST', target, { 'content-type': 'application/json' }, '{}');
      // 官方 fileUploads 仍需归属一个已授权会话（空 body → 403）；普通第三方插件
      // 上传路径不再受 allow_upload 阻断，直接直通上游。
      assert.equal(response.status, target === '/api/fileUploads/upload' ? 403 : 200, `${target} ordinary/plugin scope policy`);
    }
  } finally {
    connection.client.close();
    cookie = originalCookie;
  }
});

test('RC.1 Agent-scope RPC：未授权 session 在到达 DSH 前拒绝', async () => {
  const subUser = db.createUser('scoped-rpc-denied-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const originalCookie = cookie;
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  cookie = subCookie;
  try {
    const envelope = (endpoint: string, sessionId: string) => JSON.stringify({
      type: 'client-request', rpcId: `scoped-${endpoint}-${sessionId}`, method: endpoint,
      payload: { args: { agentId: sessionId, request: { sessionId } } },
    });
    const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'scoped-rpc-baseline', endpoint: 'workspace/follow', payload: { args: {} },
      }));
      assert.equal((await connection.nextFrame()).streamId, 'scoped-rpc-baseline');
      for (const endpoint of [
        '/api/fileUploads/upload',
        '/api/fileReferences/list',
        '/api/skills/list',
        '/api/messageFeedback/list',
        '/api/goals/create',
      ]) {
        const response = await gatewayReq('POST', endpoint, { 'content-type': 'application/json' }, envelope(endpoint.slice('/api/'.length), 'session-hidden'));
        assert.equal(response.status, 403, `${endpoint} must reject an unowned session`);
      }

      for (const endpoint of ['/api/dynamicCordisRunner/runHostHalf', '/api/dynamicCordisRunner.runHostHalf', '/api/dynamicCordisRunner/unknownMethod', '/api/dynamicCordisRunner']) {
        const method = endpoint.slice('/api/'.length).replace('.', '/');
        const response = await gatewayReq('POST', endpoint, { 'content-type': 'application/json' }, envelope(method, 'session-visible'));
        assert.equal(response.status, 403, `${endpoint} must remain unavailable even for an authorized session`);
      }
    } finally {
      connection.client.close();
    }

    // Admin requests bypass subuser classification and must retain upstream access.
    cookie = originalCookie;
    const adminResponse = await gatewayReq(
      'POST', '/api/dynamicCordisRunner/runHostHalf',
      { 'content-type': 'application/json' }, envelope('dynamicCordisRunner/runHostHalf', 'session-visible'),
    );
    assert.equal(adminResponse.status, 200, 'admin dynamic Cordis requests must remain pass-through');
    assert.equal(lastUpstreamUrl, '/api/dynamicCordisRunner/runHostHalf');
  } finally {
    cookie = originalCookie;
  }
});

test('RC.1 sessionReferenceResolver 结果只返回子用户已授权会话', async () => {
  const subUser = db.createUser('scoped-reference-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const originalCookie = cookie;
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  cookie = subCookie;
  try {
    const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'scoped-reference-baseline', endpoint: 'workspace/follow', payload: { args: {} },
      }));
      await connection.nextFrame();
      const response = await gatewayReq(
        'POST', '/api/sessionReferenceResolver/candidates', { 'content-type': 'application/json' },
        JSON.stringify({
          type: 'client-request', rpcId: 'reference-candidates', method: 'sessionReferenceResolver/candidates',
          payload: { args: { agentId: 'session-visible', query: 'session' } },
        }),
      );
      assert.equal(response.status, 200, response.body);
      const value = (JSON.parse(response.body) as { result: { value: Array<{ sessionId: string }> } }).result.value;
      assert.deepEqual(value.map((item) => item.sessionId), ['session-visible']);
      assert.doesNotMatch(response.body, /Hidden session|session-hidden|@hidden/);
    } finally {
      connection.client.close();
    }
  } finally {
    cookie = originalCookie;
  }
});

test('权限：alpha.1 原始 session 上传要求已授权会话并保留字节流', async () => {
  const subUser = db.createUser('raw-upload-contract', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const originalCookie = cookie;
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  cookie = subCookie;
  const headers = { cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' };
  try {
    const missingSession = await gatewayReq('POST', '/api/session/uploadFileBinary', {
      'content-type': 'application/octet-stream',
    }, 'bytes');
    assert.equal(missingSession.status, 403, missingSession.body);

    const hiddenSession = await gatewayReq('POST', '/api/session/uploadFileBinary?sessionId=session-hidden', {
      'content-type': 'application/octet-stream',
    }, 'bytes');
    assert.equal(hiddenSession.status, 403, hiddenSession.body);

    const connection = await openRemoteMux(headers);
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'raw-upload-baseline', endpoint: 'workspace/follow', payload: { args: {} },
      }));
      assert.equal((await connection.nextFrame()).streamId, 'raw-upload-baseline');
      const uploaded = await gatewayReq('POST', '/api/session/uploadFileBinary?sessionId=session-visible&name=note.txt', {
        'content-type': 'application/octet-stream',
      }, 'bytes');
      assert.equal(uploaded.status, 200, uploaded.body);
      assert.deepEqual(lastRawUploadBody, Buffer.from('bytes'));
    } finally {
      connection.client.close();
    }
  } finally {
    cookie = originalCookie;
  }
});

test('权限：alpha.1 selectModel 仅允许已授权会话', async () => {
  const subUser = db.createUser('select-model-contract', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const body = (sessionId: string) => JSON.stringify({
    sessionId, provider: 'test-provider', model: 'test-model', reasoningEffort: 'low',
  });
  try {
    const connection = await openRemoteMux({ cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'select-model-baseline', endpoint: 'workspace/follow', payload: { args: {} },
      }));
      assert.equal((await connection.nextFrame()).streamId, 'select-model-baseline');
      const hidden = await gatewayReq('POST', '/api/session/selectModel', { 'content-type': 'application/json' }, body('session-hidden'));
      assert.equal(hidden.status, 403, hidden.body);
      const visible = await gatewayReq('POST', '/api/session/selectModel', { 'content-type': 'application/json' }, body('session-visible'));
      assert.equal(visible.status, 200, visible.body);
      assert.deepEqual(lastSelectModelBody, JSON.parse(body('session-visible')));
    } finally {
      connection.client.close();
    }
  } finally {
    cookie = originalCookie;
  }
});

test('权限：alpha.3 directoryPicker 创建目录受工作区创建开关和父目录白名单约束', async () => {
  const subUser = db.createUser('directory-picker-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    banned: false, sandboxMode: null, disabledSessions: [],
  });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const body = JSON.stringify({
    type: 'client-request', rpcId: 'directory-create-1', method: 'directoryPicker/createDirectory',
    payload: { args: { path: '/workspaces/visible', name: 'child' } },
  });
  try {
    const denied = await gatewayReq('POST', '/api/directoryPicker/createDirectory', { 'content-type': 'application/json' }, body);
    assert.equal(denied.status, 403, denied.body);
    db.setPermissions(subUser.id, {
      allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
      allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: true,
      banned: false, sandboxMode: null, disabledSessions: [],
    });
    const allowed = await gatewayReq('POST', '/api/directoryPicker/createDirectory', { 'content-type': 'application/json' }, body);
    assert.equal(allowed.status, 200, allowed.body);
    const outside = await gatewayReq('POST', '/api/directoryPicker/createDirectory', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'directory-create-2', method: 'directoryPicker/createDirectory',
      payload: { args: { path: '/workspaces/hidden', name: 'child' } },
    }));
    assert.equal(outside.status, 403, outside.body);
  } finally {
    cookie = originalCookie;
  }
});

test('权限：alpha.3 commands 仍须会话授权；内嵌图片不再受 allow_upload 阻断', async () => {
  const subUser = db.createUser('alpha3-command-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: true, allowWorkspaceCreate: false,
    allowedSessionIds: ['session-visible'], banned: false, sandboxMode: 'read-only', disabledSessions: [],
  });
  const originalCookie = cookie;
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  cookie = subCookie;
  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    // commands/execute 是会话作用域 RPC，先建立基线再判归属（无基线会有界等待后 503）。
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'alpha3-command-baseline', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    assert.equal((await nextFrameOrFail(connection, 'alpha3 command baseline')).streamId, 'alpha3-command-baseline');
    const foreignCommand = await gatewayReq('POST', '/api/commands/execute', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'command-foreign', method: 'commands/execute',
      payload: { args: { agentId: 'session-hidden', line: '/permission danger-full-access', images: [] } },
    }));
    // 未授权会话 + 提权预设：在到达上游前拒绝。
    assert.equal(foreignCommand.status, 403, foreignCommand.body);
    // allow_upload 不再控制内嵌图片：已授权会话的图文 prompt 直接透传（媒体改由
    // 独立的 allow_chat_media 与魔数校验在各自入口把关）。
    const imagePrompt = await gatewayReq('POST', '/api/session/prompt', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'image-prompt', method: 'session/prompt',
      payload: { args: { request: { sessionId: 'session-visible', content: [{ type: 'image', mediaType: 'image/png', data: 'AAAA' }] } } },
    }));
    assert.equal(imagePrompt.status, 200, imagePrompt.body);
  } finally {
    connection.client.close();
    cookie = originalCookie;
  }
});

test('权限：允许创建工作区不放行 import/move 等其它 workspace 写操作', async () => {
  const subUser = db.createUser('workspace-write-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: true,
    allowGitDownload: true,
    allowWorkspaceCreate: true,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
  });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  try {
    for (const target of ['/api/workspace.import', '/api/workspace.move', '/api/workspace.materialize', '/api/workspace.adopt']) {
      const response = await gatewayReq('POST', target, { 'content-type': 'application/json' }, JSON.stringify({ path: '/workspaces/visible' }));
      assert.equal(response.status, 403, `${target} must not be covered by the create-workspace grant`);
    }
  } finally {
    cookie = originalCookie;
  }
});

test('权限：受限沙盒必须由 DSH 内部接口确认后才返回新会话', async () => {
  const subUser = db.createUser('sandbox-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: true,
    allowGitDownload: true,
    allowWorkspaceCreate: false,
    banned: false,
    sandboxMode: 'read-only',
    disabledSessions: [],
  });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  sandboxStatusCode = 503;
  try {
    const response = await gatewayReq('POST', '/api/session.create', { 'content-type': 'application/json' }, JSON.stringify({ cwd: '/workspaces/visible' }));
    assert.equal(response.status, 502, response.body);
    assert.deepEqual(db.listUserSessionGrants(subUser.id), [], 'failed sandbox enforcement must not create a subuser grant');
  } finally {
    sandboxStatusCode = 200;
    cookie = originalCookie;
  }
});

test('权限：收紧旧会话沙盒失败时回收既有授权与新共享会话（fail-closed）', async () => {
  const subUser = db.createUser('sandbox-tighten-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    allowedSessionIds: ['session-visible'], banned: false, sandboxMode: 'danger-full-access', disabledSessions: [],
  });
  const permissionPayload = JSON.stringify({
    userId: subUser.id,
    allowedFolders: ['/workspaces/visible'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: true,
    allowGitDownload: true,
    allowWorkspaceCreate: false,
    allowedAgentPresets: null,
    banned: false,
    sandboxMode: 'read-only',
    disabledSessions: [],
    allowedSessionIds: ['session-visible', 'session-newly-shared'],
  });
  sandboxRequests = [];
  sandboxStatusCode = 503;
  try {
    const response = await gatewayReq('POST', '/gateway/api/permissions', {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(permissionPayload)),
    }, permissionPayload);
    assert.equal(response.status, 200, response.body);
    const result = JSON.parse(response.body) as { sandboxRevokedSessionIds: string[] };
    // 收紧时既有授权与新共享会话都要注入；注入失败一律回收，绝不把未确认
    // 档位的（可能是主用户的）会话留在受限子用户授权里。
    assert.deepEqual(
      [...result.sandboxRevokedSessionIds].sort(),
      ['session-newly-shared', 'session-visible'],
    );
    assert.deepEqual(db.listUserSessionGrants(subUser.id), []);
  } finally {
    sandboxStatusCode = 200;
  }
});

test('权限：新授权既有会话必须注入授权档位，注入失败则拒绝授权', async () => {
  const subUser = db.createUser('sandbox-new-grant-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  // 沙盒档位在此之前就是 read-only 且保持同值：走“非收紧”分支。旧实现只对
  // 收紧的既有授权注入，新共享的主用户会话（可能是 danger-full-access）会直接
  // 进入授权快照，子用户零操作即可借共享会话提权。
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    allowedSessionIds: [], banned: false, sandboxMode: 'read-only', disabledSessions: [],
  });
  const permissionPayload = JSON.stringify({
    userId: subUser.id,
    allowedFolders: ['/workspaces/visible'],
    sandboxMode: 'read-only',
    allowedSessionIds: ['session-visible'],
    disabledSessions: [],
  });
  sandboxRequests = [];
  sandboxStatusCode = 503;
  try {
    const denied = await gatewayReq('POST', '/gateway/api/permissions', {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(permissionPayload)),
    }, permissionPayload);
    assert.equal(denied.status, 200, denied.body);
    assert.deepEqual(
      (JSON.parse(denied.body) as { sandboxRevokedSessionIds: string[] }).sandboxRevokedSessionIds,
      ['session-visible'],
    );
    assert.deepEqual(db.listUserSessionGrants(subUser.id), [], '注入失败的新授权必须 fail-closed 拒绝');

    // 注入成功后授权保留，且注入到的是本次新授权的会话 + 子用户授权档位。
    sandboxRequests = [];
    sandboxStatusCode = 200;
    const allowed = await gatewayReq('POST', '/gateway/api/permissions', {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(permissionPayload)),
    }, permissionPayload);
    assert.equal(allowed.status, 200, allowed.body);
    assert.deepEqual(
      (JSON.parse(allowed.body) as { sandboxRevokedSessionIds: string[] }).sandboxRevokedSessionIds,
      [],
    );
    assert.deepEqual(db.listUserSessionGrants(subUser.id), ['session-visible']);
    assert.deepEqual(sandboxRequests, [{ sessionId: 'session-visible', mode: 'read-only' }]);
  } finally {
    sandboxStatusCode = 200;
  }
});

test('权限：受限子用户 prompt 前必须确认共享会话沙盒，失败则 fail-closed 不转发', async () => {
  const subUser = db.createUser('sandbox-prompt-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    allowedSessionIds: ['session-visible'], banned: false, sandboxMode: 'read-only', disabledSessions: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  const promptBody = JSON.stringify({
    type: 'client-request', rpcId: 'sandbox-prompt', method: 'session/prompt',
    payload: { args: { request: { sessionId: 'session-visible', content: [{ type: 'text', text: 'hi' }] } } },
  });
  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'sandbox-prompt-baseline', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    assert.equal((await nextFrameOrFail(connection, 'sandbox prompt baseline')).streamId, 'sandbox-prompt-baseline');

    // 沙盒确认失败：prompt 不得转发到上游（否则会话 log 里的主用户档位会生效）。
    sandboxRequests = [];
    promptUpstreamCount = 0;
    sandboxStatusCode = 503;
    const denied = await gatewayReq('POST', '/api/session/prompt', { 'content-type': 'application/json' }, promptBody);
    assert.equal(denied.status, 502, denied.body);
    assert.deepEqual(sandboxRequests, [{ sessionId: 'session-visible', mode: 'read-only' }]);
    assert.equal(promptUpstreamCount, 0, '沙盒未确认时不得转发 prompt');

    // 确认成功后 prompt 正常转发，且注入的就是子用户授权档位（不是共享会话的档位）。
    sandboxRequests = [];
    promptUpstreamCount = 0;
    sandboxStatusCode = 200;
    const allowed = await gatewayReq('POST', '/api/session/prompt', { 'content-type': 'application/json' }, promptBody);
    assert.equal(allowed.status, 200, allowed.body);
    assert.deepEqual(sandboxRequests, [{ sessionId: 'session-visible', mode: 'read-only' }]);
    assert.equal(promptUpstreamCount, 1, '沙盒确认后必须转发一次 prompt');
  } finally {
    sandboxStatusCode = 200;
    cookie = originalCookie;
    connection.client.close();
  }
});

test('权限 API：只改上传时保留目录、配额、SSH、封禁与会话收紧策略', async () => {
  const subUser = db.createUser('permission-partial-update-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: 100, dailyMinutesLimit: 45,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false, allowSsh: true,
    allowedAgentPresets: [], banned: true, sandboxMode: 'read-only', disabledSessions: ['session-visible'],
    allowedSessionIds: ['session-visible'],
  });
  const permissionPayload = JSON.stringify({ userId: subUser.id, allowUpload: true });
  const response = await gatewayReq('POST', '/gateway/api/permissions', {
    'content-type': 'application/json', 'content-length': String(Buffer.byteLength(permissionPayload)),
  }, permissionPayload);
  assert.equal(response.status, 200, response.body);
  const saved = db.getPermissions(subUser.id);
  assert.equal(saved?.sandbox_mode, 'read-only');
  assert.deepEqual(saved?.disabled_sessions, ['session-visible']);
  assert.deepEqual(saved?.allowed_folders, ['/workspaces/visible']);
  assert.equal(saved?.hourly_token_limit, 100);
  assert.equal(saved?.daily_minutes_limit, 45);
  assert.equal(saved?.allow_ssh, true);
  assert.equal(saved?.banned, true);
  assert.equal(saved?.allow_upload, true);
});

test('权限 API：非法 sandboxMode 拒绝保存且不清除既有策略', async () => {
  const subUser = db.createUser('permission-invalid-sandbox-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: [], banned: false, sandboxMode: 'workspace-write', disabledSessions: ['session-visible'],
    allowedSessionIds: ['session-visible'],
  });
  const permissionPayload = JSON.stringify({
    userId: subUser.id,
    allowedFolders: ['/workspaces/visible'], sandboxMode: 'not-a-sandbox',
  });
  const response = await gatewayReq('POST', '/gateway/api/permissions', {
    'content-type': 'application/json', 'content-length': String(Buffer.byteLength(permissionPayload)),
  }, permissionPayload);
  assert.equal(response.status, 400, response.body);
  const saved = db.getPermissions(subUser.id);
  assert.equal(saved?.sandbox_mode, 'workspace-write');
  assert.deepEqual(saved?.disabled_sessions, ['session-visible']);
});

test('权限：封禁子用户时代理请求在到达上游前拒绝', async () => {
  const subUser = db.createUser('banned-proxy-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: [],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: true,
    allowGitDownload: true,
    allowWorkspaceCreate: false,
    banned: true,
    sandboxMode: null,
    disabledSessions: [],
  });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  try {
    const response = await gatewayReq('GET', '/html');
    assert.equal(response.status, 403);
  } finally {
    cookie = originalCookie;
  }
});

test('权限：已上报的 token 用量达到上限后阻断后续代理请求', async () => {
  const subUser = db.createUser('token-limited-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: [],
    hourlyTokenLimit: 10,
    dailyMinutesLimit: null,
    allowUpload: true,
    allowGitDownload: true,
    allowWorkspaceCreate: false,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
  });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  try {
    const report = await gatewayReq('POST', '/gateway/api/usage/report', { 'content-type': 'application/json' }, JSON.stringify({ tokens: 10 }));
    assert.equal(report.status, 200, report.body);
    const response = await gatewayReq('GET', '/html');
    assert.equal(response.status, 403, 'server-recorded token cap must block later requests');
  } finally {
    cookie = originalCookie;
  }
});

test('普通第三方根级路径对子用户直接放行：注册 WS 通道不改变 HTTP 判定', async () => {
  const subUser = db.createUser('plugin-http-denied', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: [], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    banned: false, sandboxMode: null, disabledSessions: [],
  });
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${subToken}`;
  try {
    const response = await gatewayReq('POST', '/plugin/ws/run', { origin: `http://127.0.0.1:${String(gatewayPort)}` }, '{}');
    assert.equal(response.status, 200, '普通第三方根级路径对子用户直接放行');
  } finally {
    cookie = originalCookie;
  }
});

test('代理写请求拒绝恶意 Origin，同源请求仍转发', async () => {
  const subUser = db.createUser('proxy-origin-guard-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: [], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    banned: false, sandboxMode: null, disabledSessions: [],
  });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  try {
    const before = lastUpstreamUrl;
    const denied = await gatewayReq('POST', '/plugin/ws/run', {
      origin: 'http://evil.example',
      'content-type': 'application/x-www-form-urlencoded',
    }, 'request=1');
    assert.equal(denied.status, 403);
    assert.equal(lastUpstreamUrl, before, 'cross-origin form write must not reach upstream');

    const allowed = await gatewayReq('POST', '/plugin/ws/run', {
      origin: `http://127.0.0.1:${String(gatewayPort)}`,
    }, '{}');
    assert.equal(allowed.status, 200);
  } finally {
    cookie = originalCookie;
  }
});

test('通用第三方 WebSocket：主用户不受限，子用户未授权路径一律拒绝', async () => {
  const allowed = await websocketHandshake('/plugin/ws/run?tab=test', {
    cookie,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  });
  assert.match(allowed.statusLine, /101 Switching Protocols/, '主用户无需登记即可使用任意第三方路径');

  const subUser = db.createUser('ws-unknown-subuser', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: [], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    banned: false, sandboxMode: null, disabledSessions: [],
  });
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  for (const path of ['/plugin/ws/run', '/plugin/unknown/terminal', '/sidebar/ws/terminal']) {
    const denied = await websocketHandshake(path, {
      cookie: `dsh_gateway_token=${subToken}`,
      origin: 'http://127.0.0.1',
      host: '127.0.0.1',
    });
    assert.match(denied.statusLine, /404/, `子用户访问 ${path} 必须被拒绝`);
  }
});

test('F-15：WebSocket 网关认证 query 不得转发，插件业务 token 必须保留', async () => {
  const result = await websocketHandshake('/plugin/ws/run?keep=1&dsh_gateway_token=leaked&token=plugin-business-token', {
    cookie,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  });
  assert.match(result.statusLine, /101 Switching Protocols/);
  assert.equal(lastUpstreamUrl, '/plugin/ws/run?keep=1&token=plugin-business-token');
});

test('F-15：WebSocket 保留第三方 Cookie，但不转发网关 JWT', async () => {
  const result = await websocketHandshake('/plugin/ws/run', {
    cookie: `${cookie}; plugin_session=abc; preference=dark`,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  });
  assert.match(result.statusLine, /101 Switching Protocols/);
  assert.equal(lastUpstreamHeaders.cookie, 'plugin_session=abc; preference=dark');
});

test('Issue #24：WebSocket combo URL 保留第二个问号和 rev', async () => {
  const result = await websocketHandshake('/plugin/ws/run??module-a&module-b&rev=abc123', {
    cookie,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  });
  assert.match(result.statusLine, /101 Switching Protocols/);
  assert.equal(lastUpstreamUrl, '/plugin/ws/run??module-a&module-b&rev=abc123');
  assert.ok(!lastUpstreamUrl.includes('%3F'));
});

test('跨源第三方 WebSocket 在升级前被拒绝', async () => {
  const denied = await websocketHandshake('/plugin/ws/run', {
    cookie,
    origin: 'https://attacker.example',
    host: '127.0.0.1',
  });
  assert.match(denied.statusLine, /403/);
});

// ── F-30：畸形 WebSocket 帧不得终止网关进程 ───────────────────────
// 根因：ws 的 Receiver 在协议错误（如客户端帧未加掩码）时 emit('error')；
// EventEmitter 无 'error' 监听会把异常升级为 uncaughtException 终止进程，
// 任何已登录用户发一帧就能让密码门崩溃并进入重启循环。
// 契约：错误只断开该连接；网关继续服务其它请求。

/** 用原始 socket 完成真实 Upgrade 并保留可写句柄（websocketHandshake 会立即销毁）。 */
function rawUpgradeSocket(
  pathname: string,
  headers: Record<string, string>,
): Promise<{ socket: net.Socket; statusLine: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: gatewayPort });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('raw WebSocket upgrade timeout'));
    }, 4000);
    socket.once('connect', () => {
      const lines = [
        `GET ${pathname} HTTP/1.1`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        // Host/Origin 由调用方传入（与 websocketHandshake 同口径，避免重复 Host 被判跨源）
        ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
        '',
        '',
      ];
      socket.write(lines.join('\r\n'));
    });
    let received = '';
    const onData = (chunk: Buffer): void => {
      received += chunk.toString('latin1');
      if (!received.includes('\r\n\r\n')) return;
      socket.off('data', onData);
      clearTimeout(timer);
      resolve({ socket, statusLine: received.slice(0, received.indexOf('\r\n')) });
    };
    socket.on('data', onData);
    socket.once('error', reject);
  });
}

/** 发送未加掩码文本帧，断言连接断开且网关仍能应答健康检查。 */
async function malformedFrameProbe(pathname: string, headers: Record<string, string>): Promise<void> {
  const { socket, statusLine } = await rawUpgradeSocket(pathname, headers);
  assert.match(statusLine, /101/, `${pathname} 应完成升级，实际：${statusLine}`);
  const closed = new Promise<void>((resolve) => {
    socket.once('close', () => resolve());
    socket.once('error', () => resolve()); // RST 也算断开
  });
  // 0x81 = FIN+text，0x02 = 长度 2 但掩码位为 0（客户端帧必须掩码，服务端应报协议错误）
  socket.write(Buffer.from([0x81, 0x02, 0x68, 0x69]));
  await Promise.race([closed, new Promise<void>((resolve) => setTimeout(resolve, 2000))]);
  socket.destroy();
  // 决定性断言：进程若因 uncaughtException 退出，这里会连接被拒
  const health = await gatewayReq('GET', '/gateway/healthz');
  assert.equal(health.status, 200, `网关进程必须存活，实际 status=${String(health.status)}`);
}

test('F-30：/api/remote.mux 收到未加掩码帧只断开该连接，网关进程存活', async () => {
  await malformedFrameProbe('/api/remote.mux', {
    cookie,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  });
});

test('F-30：子用户 /api/events.host 收到未加掩码帧只断开该连接，网关进程存活', async () => {
  const subUser = db.createUser('ws-malformed-subuser', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    disabledSessions: [], banned: false, sandboxMode: null,
  });
  const subCookie = `dsh_gateway_token=${jwt.sign(
    { sub: String(subUser.id), username: subUser.username, cv: 0 },
    'test-secret',
    { expiresIn: '12h' },
  )}`;
  await malformedFrameProbe('/api/events.host', {
    cookie: subCookie,
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
  });
});

test('子用户已加载普通插件 WebSocket 通用放行，未知路径仍拒绝', async () => {
  const subUser = db.createUser('dynamic-ws-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: [], hourlyTokenLimit: null, dailyMinutesLimit: null, allowUpload: false,
    allowGitDownload: false, allowWorkspaceCreate: false, allowSsh: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const token = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${token}`;
  try {
    const dynamicAllowed = await websocketHandshake('/plugin/ws/run', {
      cookie, origin: 'http://127.0.0.1', host: '127.0.0.1',
    });
    assert.match(dynamicAllowed.statusLine, /404/, '未同步清单的未知 WS 路径仍拒绝');
  } finally {
    cookie = originalCookie;
  }
});

test('子用户第三方 WebSocket：除内置事件与已配置 SSH 端点外一律拒绝', async () => {
  const subUser = db.createUser('plugin-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: [],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: true,
    allowGitDownload: true,
    allowWorkspaceCreate: false,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
  });
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const subCookie = `dsh_gateway_token=${subToken}`;
  const originalCookie = cookie;
  try {
    const beforeGrant = await websocketHandshake('/plugin/ws/run', {
      cookie: subCookie,
      origin: 'http://127.0.0.1',
      host: '127.0.0.1',
    });
    assert.match(beforeGrant.statusLine, /404/);

    cookie = originalCookie;
    const save = await gatewayReq(
      'POST',
      '/gateway/api/permissions',
      { 'content-type': 'application/json' },
      JSON.stringify({
        userId: subUser.id,
        allowedFolders: [],
      }),
    );
    assert.equal(save.status, 200);

    const overview = await gatewayReq('GET', '/gateway/api/overview');
    assert.equal(overview.status, 200);
    const overviewBody = JSON.parse(overview.body) as {
      endpoints: string[];

      users: Array<{ id: number; permissions: { allowSsh: boolean } }>;
    };
    assert.deepEqual(overviewBody.endpoints, [
      '/api/dsh-ssh/terminal',
      '/plugins/ssh-b/terminal',
      '/plugins/ssh-wild/*',
      '/api/ssh-http/inspect',
      'ws:/api/ssh-ws-only/terminal',
      'http:/api/ssh-http-only/inspect',
      '/api/ssh-owner-only/hosts',
      'owner:/api/ssh-owner-only/hosts',
      '/api/dynamicCordisRunner/*',
      'ws:/api/dynamicCordisRunner/*',
    ]);


    const afterGrant = await websocketHandshake('/plugin/ws/run', {
      cookie: subCookie,
      origin: 'http://127.0.0.1',
      host: '127.0.0.1',
    });
    assert.match(afterGrant.statusLine, /404/, '普通第三方路径不再支持逐路径授权');

    const unknownAfterGrant = await websocketHandshake('/plugin/unknown/terminal', {
      cookie: subCookie,
      origin: 'http://127.0.0.1',
      host: '127.0.0.1',
    });
    assert.match(unknownAfterGrant.statusLine, /404/);
  } finally {
    cookie = originalCookie;
  }
});

test('HTML 改写路径（注入脚本）：只有 content-length，无 transfer-encoding', async () => {
  const r = await gatewayReq('GET', '/html');
  assert.equal(r.status, 200);
  assertNoClTe(r.rawHeaders);
  const names = rawNames(r.rawHeaders);
  assert.ok(names.includes('content-length'), '改写路径必须带 content-length');
  assert.ok(!names.includes('transfer-encoding'), '改写路径不得带 transfer-encoding');
  assert.ok(r.body.includes('randomUUID'), 'HTML 注入脚本缺失');
  assert.ok(r.body.includes('<title>home</title>'), 'HTML 内容缺失');
});

test('workspace.list JSON 改写路径：只有 content-length，无 transfer-encoding', async () => {
  const r = await gatewayReq('POST', '/api/workspace.list', { 'content-type': 'application/json' });
  assert.equal(r.status, 200);
  assertNoClTe(r.rawHeaders);
  const names = rawNames(r.rawHeaders);
  assert.ok(names.includes('content-length'), '改写路径必须带 content-length');
  assert.ok(!names.includes('transfer-encoding'), '改写路径不得带 transfer-encoding');
  const parsed = JSON.parse(r.body);
  assert.deepEqual(parsed.data[0], { id: 'ws-1', path: '/workspaces/a' });
});

test('workspace.list：子用户归档会话保留工作区槽且不会掉入未分组', async () => {
  const subUser = db.createUser('archive-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/a'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: true,
    allowGitDownload: true,
    allowWorkspaceCreate: false,
    banned: false,
    sandboxMode: null,
    disabledSessions: ['s-disabled'],
  });
  const subToken = jwt.sign(
    { sub: String(subUser.id), username: subUser.username, cv: 0 },
    'test-secret',
    { expiresIn: '12h' },
  );
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${subToken}`;
  try {
    const response = await gatewayReq(
      'POST',
      '/api/workspace.list',
      { 'content-type': 'application/json', 'x-test-mode': 'archived-sessions' },
      '{}',
    );
    assert.equal(response.status, 200);
    const value = (JSON.parse(response.body) as {
      result: {
        value: {
          items: Array<{ path: string; sessionIds: string[] }>;
          archivedSessionIds: string[];
        };
      };
    }).result.value;
    assert.deepEqual(value.items.map((item) => item.path), ['/workspaces/a']);
    assert.deepEqual(
      value.items[0].sessionIds,
      ['s-active', 's-archived'],
      '归档会话保留在工作区计数槽中，由 archivedSessionIds 负责隐藏',
    );
    assert.deepEqual(
      value.archivedSessionIds,
      ['s-archived'],
      '只下发当前子用户可见且未禁用的归档 ID',
    );
  } finally {
    cookie = originalCookie;
  }
});

test('workspace.archiveSession：子用户可归档可见会话，但不能归档禁用或越权会话', async () => {
  const subUser = db.createUser('archive-action-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/a'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: true,
    allowGitDownload: true,
    allowWorkspaceCreate: false,
    banned: false,
    sandboxMode: null,
    disabledSessions: ['s-disabled'],
  });
  const subToken = jwt.sign(
    { sub: String(subUser.id), username: subUser.username, cv: 0 },
    'test-secret',
    { expiresIn: '12h' },
  );
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${subToken}`;
  try {
    // 先走 workspace.list，模拟真实前端并建立 sessionId -> cwd 归属缓存。
    const list = await gatewayReq(
      'POST',
      '/api/workspace.list',
      { 'content-type': 'application/json', 'x-test-mode': 'archived-sessions' },
      '{}',
    );
    assert.equal(list.status, 200);

    const allowed = await gatewayReq(
      'POST',
      '/api/workspace.archiveSession',
      { 'content-type': 'application/json' },
      JSON.stringify({ sessionId: 's-active' }),
    );
    assert.equal(allowed.status, 200, '可见且未禁用的会话应允许归档');

    const disabled = await gatewayReq(
      'POST',
      '/api/workspace.archiveSession',
      { 'content-type': 'application/json' },
      JSON.stringify({ sessionId: 's-disabled' }),
    );
    assert.equal(disabled.status, 403, '被管理员禁用的会话不得归档');

    const hidden = await gatewayReq(
      'POST',
      '/api/workspace.archiveSession',
      { 'content-type': 'application/json' },
      JSON.stringify({ sessionId: 's-other-user' }),
    );
    assert.equal(hidden.status, 403, '白名单外的会话不得归档');
  } finally {
    cookie = originalCookie;
  }
});

test('workspace.list：子用户只收到已授权会话的 pinnedSessionIds，形状异常时 fail-closed', async () => {
  const subUser = db.createUser('list-pinned-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/a'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: false,
    allowGitDownload: false,
    allowWorkspaceCreate: false,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
    allowedSessionIds: ['s-active', 's-archived'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign(
    { sub: String(subUser.id), username: subUser.username, cv: 0 },
    'test-secret',
    { expiresIn: '12h' },
  );
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${subToken}`;
  try {
    const allowed = await gatewayReq(
      'POST',
      '/api/workspace.list',
      { 'content-type': 'application/json', 'x-test-mode': 'pinned-sessions' },
      '{}',
    );
    assert.equal(allowed.status, 200, allowed.body);
    const value = (JSON.parse(allowed.body) as {
      result: { value: { pinnedSessionIds: unknown[] } };
    }).result.value;
    assert.deepEqual(
      value.pinnedSessionIds,
      ['s-active', 's-archived'],
      '全局 pin 集合里的其他租户会话与非法元素必须被过滤',
    );

    workspaceListPinnedMode = 'malformed';
    const malformed = await gatewayReq(
      'POST',
      '/api/workspace.list',
      { 'content-type': 'application/json', 'x-test-mode': 'pinned-sessions' },
      '{}',
    );
    assert.equal(malformed.status, 502, 'pinnedSessionIds 形状不符必须 fail-closed，不回放全局集合');
  } finally {
    workspaceListPinnedMode = 'ok';
    cookie = originalCookie;
  }
});

test('workspace.archiveSession：响应体的全局归档集合只保留已授权会话，形状异常 fail-closed', async () => {
  const fixture = await authorizedSubuserFixture('archive-response-user');
  const originalCookie = cookie;
  cookie = fixture.cookie;
  const json = { 'content-type': 'application/json' };
  try {
    archiveSessionResponseMode = 'ok';
    const archived = await gatewayReq(
      'POST',
      '/api/workspace.archiveSession',
      json,
      JSON.stringify({ sessionId: 'session-visible' }),
    );
    assert.equal(archived.status, 200, archived.body);
    const archivedValue = (JSON.parse(archived.body) as {
      result?: { value?: { archivedSessionIds?: unknown } };
    }).result?.value;
    assert.deepEqual(
      archivedValue?.archivedSessionIds,
      ['session-visible'],
      '全局归档集合里的其他租户会话与非法元素必须被过滤',
    );

    const unarchived = await gatewayReq(
      'POST',
      '/api/workspace.unarchiveSession',
      json,
      JSON.stringify({ sessionId: 'session-visible' }),
    );
    assert.equal(unarchived.status, 200, unarchived.body);
    const unarchiveValue = (JSON.parse(unarchived.body) as {
      result?: { value?: { archivedSessionIds?: unknown } };
    }).result?.value;
    assert.deepEqual(unarchiveValue?.archivedSessionIds, ['session-visible']);

    archiveSessionResponseMode = 'malformed';
    const malformed = await gatewayReq(
      'POST',
      '/api/workspace.archiveSession',
      json,
      JSON.stringify({ sessionId: 'session-visible' }),
    );
    assert.equal(malformed.status, 502, 'archivedSessionIds 形状不符必须 fail-closed，不回放全局集合');
  } finally {
    archiveSessionResponseMode = null;
    cookie = originalCookie;
    fixture.connection.client.close();
  }
});

test('workspace/create：响应体的 workspace.sessionIds 只保留已授权会话，形状异常 fail-closed', async () => {
  const subUser = db.createUser('create-response-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: false,
    allowGitDownload: false,
    allowWorkspaceCreate: true,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign(
    { sub: String(subUser.id), username: subUser.username, cv: 0 },
    'test-secret',
    { expiresIn: '12h' },
  );
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${subToken}`;
  const json = { 'content-type': 'application/json' };
  try {
    workspaceCreateResponseSessionIds = ['session-visible', 'session-hidden', 'session-other-user', 42];
    const allowed = await gatewayReq('POST', '/api/workspace/create', json, JSON.stringify({
      type: 'client-request', rpcId: 'create-response-scope', method: 'workspace/create',
      payload: { args: { request: { path: '/workspaces/visible' } } },
    }));
    assert.equal(allowed.status, 200, allowed.body);
    const workspace = (JSON.parse(allowed.body) as {
      result: { value: { workspace: { sessionIds: unknown[] } } };
    }).result.value.workspace;
    assert.deepEqual(
      workspace.sessionIds,
      ['session-visible'],
      '响应 workspace 投影里其他租户的会话 ID 必须被过滤',
    );

    workspaceCreateResponseSessionIds = { malformed: true };
    const malformed = await gatewayReq('POST', '/api/workspace/create', json, JSON.stringify({
      type: 'client-request', rpcId: 'create-response-malformed', method: 'workspace/create',
      payload: { args: { request: { path: '/workspaces/visible' } } },
    }));
    assert.equal(malformed.status, 502, 'sessionIds 形状不符必须 fail-closed，不回放全局集合');
  } finally {
    workspaceCreateResponseSessionIds = null;
    cookie = originalCookie;
  }
});

test('流式透传路径（session.list，管理员）：保留 chunked，不带 content-length', async () => {
  const r = await gatewayReq('GET', '/api/session.list');
  assert.equal(r.status, 200);
  assertNoClTe(r.rawHeaders);
  const names = rawNames(r.rawHeaders);
  assert.ok(names.includes('transfer-encoding'), '透传路径应保留上游的 chunked 分帧');
  assert.ok(!names.includes('content-length'), '透传路径不得出现 content-length');
  const parsed = JSON.parse(r.body) as { result?: { value?: { items?: unknown[] } } };
  assert.ok(Array.isArray(parsed.result?.value?.items), '管理员透传的 session.list body 必须完整');
});

test('JSON 解析失败回退路径：不得同时出现 CL+TE，body 原样透传', async () => {
  const r = await gatewayReq('POST', '/api/workspace.list', {
    'content-type': 'application/json',
    'x-test-mode': 'bad-json',
  });
  assert.equal(r.status, 200);
  assertNoClTe(r.rawHeaders);
  const names = rawNames(r.rawHeaders);
  assert.ok(names.includes('transfer-encoding'), '回退路径应保留上游的 chunked 分帧');
  assert.ok(!names.includes('content-length'), '回退路径不得出现 content-length');
  assert.equal(r.body, 'not-json{');
});

test('F-15：网关会话 Cookie 不得转发给上游，第三方 Cookie 必须保留', async () => {
  const r = await gatewayReq('GET', '/api/workspace.list', { cookie: `${cookie}; plugin_session=abc; preference=dark` });
  assert.equal(r.status, 200);
  assert.equal(lastUpstreamHeaders['cookie'], 'plugin_session=abc; preference=dark');
  assert.ok(!String(lastUpstreamHeaders['cookie']).includes('dsh_gateway_token'));
});

test('F-15：根路径认证 query 不得转发，但业务 query 必须保留', async () => {
  const r = await gatewayReq('GET', '/?keep=1&dsh_gateway_token=leaked&token=launch');
  assert.equal(r.status, 200);
  assert.equal(lastUpstreamUrl, '/?keep=1', '上游不能收到网关 JWT 或 alpha launch token');
});

test('Issue #24：HTTP combo URL 保留第二个问号和原始业务 query', async () => {
  const r = await gatewayReq('GET', '/plugins/??module-a&module-b&rev=abc123');
  assert.equal(r.status, 200);
  assert.equal(lastUpstreamUrl, '/plugins/??module-a&module-b&rev=abc123');
  assert.ok(!lastUpstreamUrl.includes('%3F'));
});

test('Issue #24：HTTP combo URL 删除网关认证键但保留插件业务 token', async () => {
  const r = await gatewayReq('GET', '/plugins/??module-a&dsh_gateway_token=leaked&module-b&token=plugin-business-token&rev=abc123');
  assert.equal(r.status, 200);
  assert.equal(lastUpstreamUrl, '/plugins/??module-a&module-b&token=plugin-business-token&rev=abc123');
});

test('Issue #24：HTTP query 不误伤相似键和原始编码', async () => {
  const r = await gatewayReq('GET', '/plugins?mytoken=1&tokenize=2&dsh_gateway_token_extra=3&x=%2F%3F&space=+&empty=');
  assert.equal(r.status, 200);
  assert.equal(lastUpstreamUrl, '/plugins?mytoken=1&tokenize=2&dsh_gateway_token_extra=3&x=%2F%3F&space=+&empty=');
});

test('F-15：编码网关认证键会删除，但 combo URL 原始字节保持不变', async () => {
  const r = await gatewayReq('GET', '/plugins/??module-a&%64sh_gateway_token=leaked&x=%2F%3F&space=+&empty=&rev=abc123');
  assert.equal(r.status, 200);
  assert.equal(lastUpstreamUrl, '/plugins/??module-a&x=%2F%3F&space=+&empty=&rev=abc123');
});

test('工作区创建权限关闭时拒绝 rc.2 目录选择器写入', async () => {
  const subUser = db.createUser('workspace-denied', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['__deny__'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: true,
    allowGitDownload: false,
    allowWorkspaceCreate: false,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
  });
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', {
    expiresIn: '12h',
  });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${subToken}`;
  try {
    const r = await gatewayReq('POST', '/api/host.createDirectory', { 'content-type': 'application/json' }, JSON.stringify({ path: '/tmp', name: 'should-not-exist' }));
    assert.equal(r.status, 403, '子用户无创建权限时不得进入目录选择器写入');
  } finally {
    cookie = originalCookie;
  }
});

test('权限保存拒绝非布尔 allowUpload 且缺失字段保留现值', async () => {
  const subUser = db.createUser('upload-contract', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: [], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    banned: false, sandboxMode: null, disabledSessions: [],
  });
  const base = { userId: subUser.id, allowedFolders: ['__deny__'], hourlyTokenLimit: null, dailyMinutesLimit: null, allowGitDownload: false, allowWorkspaceCreate: false, banned: false, sandboxMode: null, disabledSessions: [] };
  const invalid = JSON.stringify({ ...base, allowUpload: 'false' });
  const invalidResponse = await gatewayReq('POST', '/gateway/api/permissions', { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(invalid)) }, invalid);
  assert.equal(invalidResponse.status, 400);
  assert.equal(db.getPermissions(subUser.id)?.allow_upload, false);
  const omitted = JSON.stringify(base);
  const omittedResponse = await gatewayReq('POST', '/gateway/api/permissions', { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(omitted)) }, omitted);
  assert.equal(omittedResponse.status, 200, omittedResponse.body);
  assert.equal(db.getPermissions(subUser.id)?.allow_upload, false);
});

test('权限保存接受唯一的拒绝全部工作区哨兵', async () => {
  const subUser = db.createUser('save-deny-sentinel', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  const payload = JSON.stringify({
    userId: subUser.id,
    allowedFolders: ['__deny__'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: true,
    allowGitDownload: false,
    allowWorkspaceCreate: false,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
  });
  const r = await gatewayReq('POST', '/gateway/api/permissions', { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }, payload);
  assert.equal(r.status, 200, r.body);
  assert.deepEqual(db.getPermissions(subUser.id)?.allowed_folders, ['__deny__']);
});

test('F-15 例外：自身插件路由 /api/dsh-passwords/* 必须保留 Cookie（插件 guard 鉴权依赖）', async () => {
  const r = await gatewayReq('GET', '/api/dsh-passwords/state');
  assert.equal(r.status, 200);
  assert.equal(
    lastUpstreamHeaders['cookie'],
    cookie,
    '插件路由的上游请求必须携带网关 Cookie，否则设置页用户管理全部 401',
  );
});

test('上游认证 Broker：loopback/internal-secret 更新 Cookie 并通过 health 探测', async () => {
  const invalid = JSON.stringify({ cookie: 'dsh-auth-test=valid_cookie' });
  const denied = await gatewayReq('POST', '/gateway/internal/upstream-auth', {
    'content-type': 'application/json',
    'x-internal-secret': 'wrong',
    'content-length': String(Buffer.byteLength(invalid)),
  }, invalid);
  assert.equal(denied.status, 403);

  const cookiePair = 'dsh-auth-test=valid_cookie';
  const payload = JSON.stringify({ cookie: cookiePair });
  const updated = await gatewayReq('POST', '/gateway/internal/upstream-auth', {
    'content-type': 'application/json',
    'x-internal-secret': 'test-internal',
    'content-length': String(Buffer.byteLength(payload)),
  }, payload);
  assert.equal(updated.status, 200, updated.body);

  const health = await gatewayReq('GET', '/gateway/internal/upstream-auth/health', {
    'x-internal-secret': 'test-internal',
  });
  assert.equal(health.status, 200, health.body);
  assert.equal(JSON.parse(health.body).authenticated, true);
  assert.equal(lastUpstreamHeaders.cookie, cookiePair);
});

test('网关 owner 探针：仅正确 internal secret 返回 parent PID，错误密钥拒绝', async () => {
  const denied = await gatewayReq('GET', '/gateway/internal/owner', { 'x-internal-secret': 'wrong' });
  assert.equal(denied.status, 403);

  const allowed = await gatewayReq('GET', '/gateway/internal/owner', { 'x-internal-secret': 'test-internal' });
  assert.equal(allowed.status, 200, allowed.body);
  const body = JSON.parse(allowed.body) as { ok: boolean; parentPid: number | null };
  assert.equal(body.ok, true);
  assert.equal(body.parentPid, null, '测试网关未设置 parent PID 时必须返回 null，而不是伪造 PID');
});

test('Cookie Chaos 加固（P3）：Unicode 空白前缀的会话 cookie 不再被归一化匹配 → 未认证', async () => {
  const locationOf = (rh: string[]): string => {
    const i = rh.findIndex((v, idx) => idx % 2 === 0 && v.toLowerCase() === 'location');
    return i >= 0 ? rh[i + 1] ?? '' : '';
  };
  // 只有 U+00A0 前缀的伪同名 cookie（旧 trim() 会按 Unicode 空白语义归一化成
  // dsh_gateway_token 读入并放行认证）；严格解析应视为不同 cookie → 302 登录页
  const r = await gatewayReq('GET', '/html', {
    cookie: `\u00a0dsh_gateway_token=${tokenValue}`, // U+00A0 在 latin1 下为单字节 0xA0
  });
  assert.equal(r.status, 302, 'Unicode 前缀 cookie 不应通过认证，应重定向到登录页');
  assert.match(locationOf(r.rawHeaders), /\/gateway\/login/);

  // 对照：正常 cookie 认证通过（U+00A0 精确匹配不被干扰）
  const ok = await gatewayReq('GET', '/html', { cookie: `dsh_gateway_token=${tokenValue}` });
  assert.equal(ok.status, 200, '正常会话 cookie 应认证通过');
});

test('未认证根路径重定向到登录页时不把 next 参数甩到地址栏（登录后仍回首页）', async () => {
  const locationOf = (rh: string[]): string => {
    const i = rh.findIndex((v, idx) => idx % 2 === 0 && v.toLowerCase() === 'location');
    return i >= 0 ? rh[i + 1] ?? '' : '';
  };
  // 显式空 cookie 覆盖测试夹具的模块级会话 cookie，确保走未认证分支
  const root = await gatewayReq('GET', '/', { cookie: '' });
  assert.equal(root.status, 302, '未认证访问根路径应重定向登录页');
  assert.equal(locationOf(root.rawHeaders), '/gateway/login', '根路径重定向不带 next 参数');

  // 深层路径仍需保留 next，登录后能跳回原页面
  const deep = await gatewayReq('GET', '/settings/general', { cookie: '' });
  assert.equal(deep.status, 302);
  assert.match(locationOf(deep.rawHeaders), /^\/gateway\/login\?next=/);
});

test('Remote mux 竞态：cancel 后的迟到上游帧只丢弃该逻辑流，不关闭整条 carrier', async () => {
  remoteMuxOpenEndpoints = [];
  remoteMuxLateFrameOnCancel = true;
  const connection = await openRemoteMux({ cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  let closed: { code: number; reason: string } | null = null;
  connection.client.on('close', (code: number, reason: Buffer) => {
    closed = { code, reason: reason.toString() };
  });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'cancel-race-doomed', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    const baseline = await nextFrameOrFail(connection, 'workspace baseline');
    assert.equal(baseline.streamId, 'cancel-race-doomed');
    assert.equal(baseline.type, 'item');

    // cancel 到达上游后，上游仍发该流的 item + end（官方契约允许）。
    connection.client.send(JSON.stringify({ type: 'cancel', streamId: 'cancel-race-doomed' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(closed, null, `迟到的单流帧不得关闭物理 carrier：${JSON.stringify(closed)}`);
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, 'cancel 后的迟到帧不得使客户端连接退出 OPEN');

    // 同一 carrier 上的其它逻辑流必须仍能建流并收到响应。
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'cancel-race-survivor', endpoint: 'session/control', payload: { args: {} },
    }));
    const survivor = await nextFrameOrFail(connection, 'surviving stream');
    assert.equal(survivor.streamId, 'cancel-race-survivor');
    assert.equal(survivor.type, 'item');
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, '其它逻辑流应能在同一 carrier 上继续');
  } finally {
    remoteMuxLateFrameOnCancel = false;
    connection.client.terminate();
  }
});

test('Remote mux 竞态：session/follow 首帧快照不匹配只结束该逻辑流，不关闭整条 carrier', async () => {
  remoteMuxOpenEndpoints = [];
  remoteMuxCancelStreamIds = [];
  remoteMuxSnapshotHeaderId = 'session-mismatched';
  const subUser = db.createUser('remote-mux-snapshot-mismatch-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const connection = await openRemoteMux({
    cookie: `dsh_gateway_token=${subToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'mismatch-follow', endpoint: 'session/follow',
      payload: { args: { request: { address: { kind: 'session', sessionId: 'session-visible' } } } },
    }));
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'mismatch-workspace', endpoint: 'workspace/follow', payload: { args: {} },
    }));

    // 基线先经 workspace/follow 建立，随后被 flush 的 session/follow 才到达上游；
    // 上游回一个 header.id 不匹配的 snapshot，网关必须只拒绝该逻辑流。
    const seen: Record<string, unknown>[] = [];
    const waitFor = async (streamId: string): Promise<Record<string, unknown>> => {
      for (;;) {
        const frame = await nextFrameOrFail(connection, `waiting for ${streamId}`);
        seen.push(frame);
        if (frame.streamId === streamId) return frame;
      }
    };
    const workspace = await waitFor('mismatch-workspace');
    assert.equal(workspace.type, 'item');
    const rejected = await waitFor('mismatch-follow');
    assert.deepEqual(rejected, {
      type: 'error',
      streamId: 'mismatch-follow',
      error: {
        code: 'gateway/invalid-snapshot',
        message: 'Remote session follow snapshot rejected',
        details: {},
      },
    });
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, '快照不匹配不得关闭物理 mux');
    for (let attempt = 0; attempt < 20 && !remoteMuxCancelStreamIds.includes('mismatch-follow'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.ok(remoteMuxCancelStreamIds.includes('mismatch-follow'), '快照拒绝后必须向上游补发 cancel');
    assert.deepEqual(remoteMuxOpenEndpoints, ['workspace/follow', 'session/follow']);

    // 被拒绝后，同一 carrier 上的新逻辑流仍可正常建立。
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'mismatch-control', endpoint: 'session/control', payload: { args: {} },
    }));
    const control = await waitFor('mismatch-control');
    assert.equal(control.type, 'item');
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, '同一 carrier 的其它逻辑流必须存活');
  } finally {
    remoteMuxSnapshotHeaderId = null;
    connection.client.close();
  }
});

test('Remote mux：主用户 terminal/follow 与 terminal/retain 原样转发到上游', async () => {
  remoteMuxOpenEndpoints = [];
  remoteMuxOpenFrames = [];
  const connection = await openRemoteMux({ cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    for (const [streamId, endpoint, args] of [
      ['admin-terminal-follow', 'terminal/follow', { agentId: 'agent-owner', id: 'term-owner-1', attachmentId: 'att-owner-1' }],
      ['admin-terminal-retain', 'terminal/retain', { sessionId: 'session-owner', id: 'term-owner-1' }],
    ] as const) {
      connection.client.send(JSON.stringify({ type: 'open', streamId, endpoint, payload: { args } }));
      const frame = await nextFrameOrFail(connection, `${endpoint} admin roundtrip`);
      assert.deepEqual(frame, {
        type: 'item',
        streamId,
        value: { type: 'terminal/output', terminalId: 'term-owner-1', data: 'owner-shell-bytes' },
      });
    }
    assert.deepEqual(remoteMuxOpenEndpoints, ['terminal/follow', 'terminal/retain']);
    assert.deepEqual(
      remoteMuxOpenFrames.map((frame) => frame.endpoint),
      ['terminal/follow', 'terminal/retain'],
    );
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, '主用户 terminal 流不应关闭 carrier');
  } finally {
    connection.client.close();
  }
});

test('Remote mux：子用户普通未知端点透明转发且 carrier 存活', async () => {
  remoteMuxOpenEndpoints = [];
  remoteMuxOpenFrames = [];
  remoteMuxCancelStreamIds = [];
  const subUser = db.createUser('remote-mux-unknown-endpoint-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const connection = await openRemoteMux({
    cookie: `dsh_gateway_token=${subToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'unknown-deep', endpoint: 'future/remote/terminal/stream', payload: { args: {} },
    }));
    const forwarded = await nextFrameOrFail(connection, 'unknown deep endpoint forward');
    assert.deepEqual(forwarded, { type: 'item', streamId: 'unknown-deep', value: { type: 'plugin/opaque', ok: true } });
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, '普通未知端点不得关闭 carrier');
    assert.deepEqual(remoteMuxOpenEndpoints, ['future/remote/terminal/stream'], '普通未知端点应透明到达上游');
    assert.deepEqual(remoteMuxCancelStreamIds, []);
  } finally {
    connection.client.close();
  }
});

test('Remote mux：子用户 terminal/follow 与 terminal/retain 只结束该逻辑流，workspace baseline 仍可达且上游收不到 terminal', async () => {
  remoteMuxOpenEndpoints = [];
  remoteMuxOpenFrames = [];
  const subUser = db.createUser('remote-mux-terminal-denied-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const connection = await openRemoteMux({
    cookie: `dsh_gateway_token=${subToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  try {
    // 子用户永远不能 create 终端，因此这两条 open 只能被拒绝；关键是只拒绝该
    // 逻辑流（error + active 删除），而不是关掉整条物理 carrier。
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'terminal-retain-denied', endpoint: 'terminal/retain', payload: { args: {} },
    }));
    const retainError = await nextFrameOrFail(connection, 'terminal/retain rejection');
    assert.equal(retainError.type, 'error');
    assert.equal(retainError.streamId, 'terminal-retain-denied');
    const retainDetail = retainError.error as Record<string, unknown>;
    assert.equal(retainDetail.code, 'terminal/unavailable');
    assert.equal(typeof retainDetail.message, 'string');
    assert.ok((retainDetail.message as string).length > 0, 'terminal/unavailable 必须带固定非空 message');
    assert.deepEqual(retainDetail.details, {});

    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'terminal-follow-denied', endpoint: 'terminal/follow',
      payload: { args: { request: { address: { kind: 'session', sessionId: 'session-visible' } } } },
    }));
    const followError = await nextFrameOrFail(connection, 'terminal/follow rejection');
    assert.equal(followError.type, 'error');
    assert.equal(followError.streamId, 'terminal-follow-denied');
    assert.equal((followError.error as Record<string, unknown>).code, 'terminal/unavailable');

    // terminal 只结束该逻辑流：同一 socket 的 workspace/follow 仍能建立 baseline。
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'terminal-survivor-workspace', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    const baseline = await nextFrameOrFail(connection, 'workspace baseline after terminal rejection');
    assert.equal(baseline.streamId, 'terminal-survivor-workspace');
    assert.equal(baseline.type, 'item');
    assert.equal((baseline.value as { type?: unknown }).type, 'baseline');

    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, 'terminal 拒绝不得关闭物理 carrier');
    assert.deepEqual(remoteMuxOpenEndpoints, ['workspace/follow'], 'terminal 逻辑流不得转发到上游');
    assert.equal(
      remoteMuxOpenFrames.some((frame) => typeof frame.endpoint === 'string' && frame.endpoint.startsWith('terminal/')),
      false,
      '上游不得收到任何 terminal 端点',
    );
  } finally {
    connection.client.close();
  }
});

test('Remote mux：子用户 terminal/follow 与 terminal/retain 即使 allow_ssh=true 也按逻辑流拒绝', async () => {
  remoteMuxOpenEndpoints = [];
  remoteMuxOpenFrames = [];
  const subUser = db.createUser('remote-mux-terminal-allowed-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: [], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowSsh: true, allowedAgentPresets: null, banned: false, sandboxMode: null,
    disabledSessions: [], allowedSessionIds: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const connection = await openRemoteMux({
    cookie: `dsh_gateway_token=${subToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  try {
    for (const [streamId, endpoint] of [
      ['terminal-follow-denied', 'terminal/follow'],
      ['terminal-retain-denied', 'terminal/retain'],
    ] as const) {
      connection.client.send(JSON.stringify({
        type: 'open', streamId, endpoint, payload: { args: {} },
      }));
      const frame = await nextFrameOrFail(connection, `${endpoint} denial`);
      assert.equal(frame.type, 'error', `${endpoint} 应只结束该逻辑流`);
      assert.equal(frame.streamId, streamId);
      assert.equal((frame.error as Record<string, unknown>).code, 'terminal/unavailable');
    }
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, 'terminal 逻辑流拒绝不得关闭 carrier');
    assert.equal(
      remoteMuxOpenEndpoints.some((endpoint) => endpoint.startsWith('terminal/')),
      false,
      '上游不得收到任何 terminal 端点',
    );
  } finally {
    connection.client.close();
  }
});

test('Remote mux：SSH 登记端点对子用户按逻辑流拒绝，allow_ssh 不授予 Remote 宿主能力', async () => {
  remoteMuxOpenEndpoints = [];
  remoteMuxOpenFrames = [];
  const subUser = db.createUser('remote-mux-ssh-rule-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowSsh: true, allowedAgentPresets: null, banned: false, sandboxMode: null,
    disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const connection = await openRemoteMux({
    cookie: `dsh_gateway_token=${subToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  try {
    // Remote 端点名可映射到已登记的 SSH HTTP 路径（/api/<endpoint>），一律按
    // owner-only 宿主能力拒绝；历史 allow_ssh 不再授予任何 Remote SSH 流。
    for (const [streamId, endpoint] of [
      ['owner-only-inspect', 'ssh-http/inspect'],
      ['owner-only-terminal', 'dsh-ssh/terminal'],
    ] as const) {
      connection.client.send(JSON.stringify({ type: 'open', streamId, endpoint, payload: { args: {} } }));
      const frame = await nextFrameOrFail(connection, `${endpoint} owner-only rejection`);
      assert.equal(frame.type, 'error', `${endpoint} 应只结束该逻辑流`);
      assert.equal(frame.streamId, streamId);
      assert.equal((frame.error as Record<string, unknown>).code, 'gateway/forbidden');
    }
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, 'SSH 逻辑流拒绝不得关闭 carrier');
    assert.equal(remoteMuxOpenEndpoints.includes('ssh-http/inspect'), false, '上游不得收到 SSH 端点');
    assert.equal(remoteMuxOpenEndpoints.includes('dsh-ssh/terminal'), false, '上游不得收到 SSH 端点');

    // 同一 carrier 的 workspace baseline 仍可达：拒绝只作用于该逻辑流。
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'ssh-rule-survivor', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    const baseline = await nextFrameOrFail(connection, 'workspace baseline after ssh rejection');
    assert.equal(baseline.streamId, 'ssh-rule-survivor');
    assert.equal((baseline.value as { type?: unknown }).type, 'baseline');
  } finally {
    connection.client.close();
  }
  assert.equal(db.getPermissions(subUser.id)?.allow_ssh, true, '历史 allow_ssh 仍保留在权限行，但不再授予 SSH 能力');
});

test('Remote mux：已登记的宿主敏感流也不能由子用户打开', async () => {
  remoteMuxOpenEndpoints = [];
  const subUser = db.createUser('remote-host-namespace-denied-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null,
    disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const connection = await openRemoteMux({
    cookie: `dsh_gateway_token=${subToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  try {
    for (const [streamId, endpoint] of [
      ['probe', 'pluginRegistryProbe/fastest'],
      ['speech', 'speech/follow'],
      ['telemetry', 'productAnalytics/watchPolicy'],
    ] as const) {
      connection.client.send(JSON.stringify({ type: 'open', streamId, endpoint, payload: { args: {} } }));
      const frame = await nextFrameOrFail(connection, `${endpoint} host rejection`);
      assert.equal(frame.streamId, streamId);
      assert.equal(frame.type, 'error');
      assert.equal((frame.error as Record<string, unknown>).code, 'gateway/forbidden');
    }
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN);
    for (const endpoint of ['pluginRegistryProbe/fastest', 'speech/follow', 'productAnalytics/watchPolicy']) {
      assert.equal(remoteMuxOpenEndpoints.includes(endpoint), false, endpoint);
    }
  } finally {
    connection.client.close();
  }
});

// ── 0.1.7-alpha.1 网关修复 ────────────────────────────────────────────────

/** 已授权 session-visible（工作区 /workspaces/visible）的子用户，并用 Remote baseline
 *  填充网关的会话归属快照（与真实前端启动顺序一致）。 */
async function authorizedSubuserFixture(
  username: string,
  options: { allowSsh?: boolean; allowGitDownload?: boolean } = {},
): Promise<{
  userId: number;
  cookie: string;
  connection: { client: any; nextFrame: () => Promise<Record<string, unknown>> };
  baseline: Record<string, unknown>;
}> {
  const subUser = db.createUser(username, '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'],
    hourlyTokenLimit: null,
    dailyMinutesLimit: null,
    allowUpload: false,
    allowGitDownload: options.allowGitDownload === true,
    allowWorkspaceCreate: false,
    ...(options.allowSsh === true ? { allowSsh: true } : {}),
    allowedAgentPresets: null,
    banned: false,
    sandboxMode: null,
    disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign(
    { sub: String(subUser.id), username: subUser.username, cv: 0 },
    'test-secret',
    { expiresIn: '12h' },
  )}`;
  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  connection.client.send(JSON.stringify({
    type: 'open', streamId: `fixture-${username}`, endpoint: 'workspace/follow', payload: { args: {} },
  }));
  const baseline = await nextFrameOrFail(connection, `${username} workspace baseline`);
  assert.equal(baseline.type, 'item');
  return { userId: subUser.id, cookie: subCookie, connection, baseline };
}

/** 0.1.7-alpha.1 workspaceFiles/readBytes 的 ClientConnection 信封。 */
function readBytesEnvelope(scopeId: string, targetPath: string, options: unknown): string {
  return JSON.stringify({
    type: 'client-request',
    rpcId: 'workspace-files-readBytes',
    method: 'workspaceFiles/readBytes',
    payload: { args: { workspaceFileScopeId: scopeId, path: targetPath, options } },
  });
}

/** 打开 Remote mux，发送一条原始消息，返回 carrier 的关闭码与原因。 */
async function remoteMuxCloseAfterRawSend(cookieValue: string, payload: string | Buffer): Promise<{ code: number; reason: string }> {
  const client = new NodeWebSocket(`ws://127.0.0.1:${String(gatewayPort)}/api/remote.mux`, {
    headers: { cookie: cookieValue, origin: 'http://127.0.0.1', host: '127.0.0.1' },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { client.terminate(); reject(new Error('Remote mux open timeout')); }, 3000);
    client.once('open', () => { clearTimeout(timer); resolve(); });
    client.once('error', (error: Error) => { clearTimeout(timer); reject(error); });
  });
  const closed = waitForWebSocketClose(client, 'raw Remote mux send');
  client.send(payload);
  const result = await closed;
  client.terminate();
  return result;
}

test('Remote mux alpha.1 上行：仅透明放行的已开流转发 item/end，未知或过滤流只丢弃该帧', async () => {
  remoteMuxOpenEndpoints = [];
  remoteMuxUplinkFrames = [];
  // SSH/terminal 流已改为 owner-only，改用普通扩展流验证上行透明转发语义。
  const fixture = await authorizedSubuserFixture('mux-uplink-user');
  try {
    fixture.connection.client.send(JSON.stringify({
      type: 'open', streamId: 'uplink-plugin', endpoint: 'future/plugin', payload: { args: {} },
    }));
    const output = await nextFrameOrFail(fixture.connection, 'plugin output');
    assert.equal(output.streamId, 'uplink-plugin');

    fixture.connection.client.send(JSON.stringify({
      type: 'item', streamId: 'uplink-plugin', value: { type: 'plugin/input', data: 'ls\n' },
    }));
    fixture.connection.client.send(JSON.stringify({ type: 'end', streamId: 'uplink-plugin' }));
    // 未打开的流：只丢弃该帧，不转发、不关闭 carrier
    fixture.connection.client.send(JSON.stringify({
      type: 'item', streamId: 'never-opened', value: { type: 'terminal/input', data: 'pwn' },
    }));
    fixture.connection.client.send(JSON.stringify({ type: 'end', streamId: 'never-opened' }));
    // 已打开但被网关按租户逐帧过滤的流：不得借上行帧把数据注入该流
    fixture.connection.client.send(JSON.stringify({
      type: 'item', streamId: 'fixture-mux-uplink-user', value: { type: 'emit', event: 'x', args: [] },
    }));
    fixture.connection.client.send(JSON.stringify({ type: 'end', streamId: 'fixture-mux-uplink-user' }));

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(
      remoteMuxUplinkFrames,
      [
        { type: 'item', streamId: 'uplink-plugin', value: { type: 'plugin/input', data: 'ls\n' } },
        { type: 'end', streamId: 'uplink-plugin' },
      ],
      '只有透明放行的已开流可以上行转发',
    );
    assert.equal(fixture.connection.client.readyState, NodeWebSocket.OPEN, '丢弃上行帧不得关闭物理 carrier');
  } finally {
    fixture.connection.client.close();
  }
});

test('Remote mux alpha.1 上行：畸形 item/end 仍 1008，二进制帧仍 1003', async () => {
  for (const frame of [
    { type: 'item' },
    { type: 'item', streamId: 'x', extra: 1 },
    { type: 'item', streamId: '' },
    { type: 'end' },
    { type: 'end', streamId: 'x', value: 1 },
    { type: 'end', streamId: 'x', streamId2: 'y' },
  ]) {
    assert.deepEqual(
      await remoteMuxCloseAfterRawSend(cookie, JSON.stringify(frame)),
      { code: 1008, reason: 'invalid Remote stream request' },
      JSON.stringify(frame),
    );
  }
  assert.deepEqual(
    await remoteMuxCloseAfterRawSend(cookie, Buffer.from([0x01, 0x02, 0x03])),
    { code: 1003, reason: 'text messages required' },
  );
});

test('Remote mux 0.1.7-alpha.1：workspace/follow baseline 与 pinned 增量只下发已授权会话', async () => {
  remoteMuxBaselinePinnedSessionIds = ['session-visible', 'session-hidden', 's-other-user', 42];
  remoteMuxPinnedIncrement = ['session-hidden', 'session-visible'];
  const fixture = await authorizedSubuserFixture('mux-pinned-user');
  try {
    const value = (fixture.baseline.value as { value: Record<string, unknown> }).value;
    assert.deepEqual(value.archivedSessionIds, []);
    assert.deepEqual(value.pinnedSessionIds, ['session-visible'], '全局 pin 集合里的其他租户会话必须被过滤');
    const increment = await nextFrameOrFail(fixture.connection, 'pinned increment');
    assert.deepEqual(increment, {
      type: 'item',
      streamId: 'fixture-mux-pinned-user',
      value: { type: 'pinned', pinnedSessionIds: ['session-visible'] },
    });
    assert.equal(fixture.connection.client.readyState, NodeWebSocket.OPEN);
  } finally {
    remoteMuxBaselinePinnedSessionIds = null;
    remoteMuxPinnedIncrement = null;
    fixture.connection.client.close();
  }
});

test('Remote mux 0.1.6 兼容：baseline 不含 pinnedSessionIds 时不补发该字段', async () => {
  const fixture = await authorizedSubuserFixture('mux-0-1-6-pinned-user');
  try {
    const value = (fixture.baseline.value as { value: Record<string, unknown> }).value;
    assert.equal(Object.hasOwn(value, 'pinnedSessionIds'), false);
    assert.deepEqual(value.archivedSessionIds, []);
  } finally {
    fixture.connection.client.close();
  }
});

test('权限：workspace.pinSession 响应只回子用户已授权会话的 pin 集合', async () => {
  const fixture = await authorizedSubuserFixture('pin-response-user');
  const originalCookie = cookie;
  cookie = fixture.cookie;
  try {
    const allowed = await gatewayReq(
      'POST',
      '/api/workspace.pinSession',
      { 'content-type': 'application/json' },
      JSON.stringify({ sessionId: 'session-visible' }),
    );
    assert.equal(allowed.status, 200, allowed.body);
    const parsed = JSON.parse(allowed.body) as { result?: { ok?: boolean; value?: { pinnedSessionIds?: unknown } } };
    assert.deepEqual(
      parsed.result?.value?.pinnedSessionIds,
      ['session-visible'],
      '全局 pin 集合里的其他租户会话必须被过滤掉',
    );
    const hidden = await gatewayReq(
      'POST',
      '/api/workspace.pinSession',
      { 'content-type': 'application/json' },
      JSON.stringify({ sessionId: 'session-hidden' }),
    );
    assert.equal(hidden.status, 403, '未授权会话的 pin 请求侧即被拒绝');
  } finally {
    cookie = originalCookie;
    fixture.connection.client.close();
  }
});

test('rc.2 schedule/catalog：子用户不再 403，只保留已授权会话的条目，主用户原样透传', async () => {
  const fixture = await authorizedSubuserFixture('schedule-catalog-user');
  const originalCookie = cookie;
  try {
    cookie = fixture.cookie;
    const sub = await gatewayReq(
      'POST',
      '/api/schedule/catalog',
      { 'content-type': 'application/json' },
      JSON.stringify({ type: 'client-request', rpcId: 'schedule-catalog-sub', method: 'schedule/catalog', payload: { args: {} } }),
    );
    assert.equal(sub.status, 200, sub.body);
    const subValue = (JSON.parse(sub.body) as { result?: { ok?: boolean; value?: Array<{ id?: unknown; sessionId?: unknown; status?: unknown }> } }).result;
    assert.equal(subValue?.ok, true);
    assert.deepEqual(
      (subValue?.value ?? []).map((entry) => entry.id),
      ['schedule-visible'],
      '只保留已授权会话的条目：他人/缺失/非法 sessionId 一律丢弃',
    );
    // 保留条目除过滤外不改写：官方字段原样保留。
    assert.equal(subValue?.value?.[0]?.sessionId, 'session-visible');
    assert.equal(subValue?.value?.[0]?.status, 'active');

    // 点号形状同口径（兼容 /api/schedule.catalog）。
    const dotted = await gatewayReq(
      'POST',
      '/api/schedule.catalog',
      { 'content-type': 'application/json' },
      JSON.stringify({ type: 'client-request', rpcId: 'schedule-catalog-dotted', method: 'schedule.catalog', payload: { args: {} } }),
    );
    assert.equal(dotted.status, 200, dotted.body);
    assert.deepEqual(
      ((JSON.parse(dotted.body) as { result?: { value?: Array<{ id?: unknown }> } }).result?.value ?? []).map((entry) => entry.id),
      ['schedule-visible'],
    );

    // 主用户：同一上游响应原样透传，不做任何解析/过滤。
    cookie = originalCookie;
    const admin = await gatewayReq(
      'POST',
      '/api/schedule/catalog',
      { 'content-type': 'application/json' },
      JSON.stringify({ type: 'client-request', rpcId: 'schedule-catalog-admin', method: 'schedule/catalog', payload: { args: {} } }),
    );
    assert.equal(admin.status, 200, admin.body);
    const adminValue = (JSON.parse(admin.body) as { result?: { value?: Array<{ id?: unknown }> } }).result?.value ?? [];
    assert.equal(adminValue.length, 5, '主用户看到原始全局提醒清单');
    assert.ok(adminValue.some((entry) => entry.id === 'schedule-hidden'), '主用户不受会话过滤');
  } finally {
    cookie = originalCookie;
    fixture.connection.client.close();
  }
});

test('rc.2 schedule/catalog：子用户响应结构异常时 fail-closed（502），不透传全局清单', async () => {
  const fixture = await authorizedSubuserFixture('schedule-catalog-malformed-user');
  const originalCookie = cookie;
  const originalMode = scheduleCatalogResponseMode;
  scheduleCatalogResponseMode = 'malformed';
  try {
    cookie = fixture.cookie;
    const sub = await gatewayReq(
      'POST',
      '/api/schedule/catalog',
      { 'content-type': 'application/json' },
      JSON.stringify({ type: 'client-request', rpcId: 'schedule-catalog-bad', method: 'schedule/catalog', payload: { args: {} } }),
    );
    assert.equal(sub.status, 502, sub.body);
    assert.equal(sub.body.includes('schedule-hidden'), false, '不得回放未过滤的全局清单');
  } finally {
    scheduleCatalogResponseMode = originalMode;
    cookie = originalCookie;
    fixture.connection.client.close();
  }
});

test('权限：present.open 的 GET 与 POST 都做会话归属校验，POST 仍校验 action', async () => {
  const fixture = await authorizedSubuserFixture('present-open-user');
  const originalCookie = cookie;
  cookie = fixture.cookie;
  try {
    assert.equal(
      (await gatewayReq('GET', '/api/present.open?sessionId=session-hidden&seq=1&index=0')).status,
      403,
      'GET 不得绕过会话归属校验',
    );
    assert.equal((await gatewayReq('GET', '/api/present.open?sessionId=session-visible&seq=1&index=0')).status, 200);
    assert.equal(
      (await gatewayReq('GET', '/api/present.open?sessionId=session-visible&seq=nope&index=0')).status,
      403,
      '不可解析的坐标一律 fail-closed',
    );
    assert.equal(
      (await gatewayReq('POST', '/api/present.open?sessionId=session-visible&seq=1&index=0&action=evil')).status,
      403,
      'POST 仍校验 action',
    );
    assert.equal(
      (await gatewayReq('POST', '/api/present.open?sessionId=session-visible&seq=1&index=0&action=reveal')).status,
      200,
    );
  } finally {
    cookie = originalCookie;
    fixture.connection.client.close();
  }
});

test('权限：0.1.7 changes.open 的 GET/POST 都按会话归属校验', async () => {
  const fixture = await authorizedSubuserFixture('changes-route-user');
  const originalCookie = cookie;
  cookie = fixture.cookie;
  try {
    assert.equal(
      (await gatewayReq('GET', '/api/changes.open?sessionId=session-visible&seq=1&index=0')).status,
      200,
      '0.1.7 GET changes.open 查询关联应用必须可用',
    );
    assert.equal((await gatewayReq('GET', '/api/changes.summary?sessionId=session-visible&seq=1')).status, 200);
    assert.equal((await gatewayReq('GET', '/api/changes.diff?sessionId=session-visible&seq=1&index=0')).status, 200);
    assert.equal((await gatewayReq('GET', '/api/changes.summary?sessionId=session-hidden&seq=1')).status, 403);
    assert.equal((await gatewayReq('GET', '/api/changes.open?sessionId=session-hidden&seq=1&index=0')).status, 403);
    assert.equal((await gatewayReq('POST', '/api/changes.open?sessionId=session-visible&seq=1&index=0')).status, 200);
    assert.equal((await gatewayReq('POST', '/api/changes.open?sessionId=session-hidden&seq=1&index=0')).status, 403);
  } finally {
    cookie = originalCookie;
    fixture.connection.client.close();
  }
});

test('权限：workspaceFiles/readBytes 的 options.baseFile 与 path 同口径 fail-closed', async () => {
  const fixture = await authorizedSubuserFixture('readBytes-basefile-user');
  const originalCookie = cookie;
  cookie = fixture.cookie;
  const postReadBytes = (body: string) =>
    gatewayReq('POST', '/api/workspaceFiles/readBytes', { 'content-type': 'application/json' }, body);
  try {
    // 基准文件与相对目标都落在会话工作区内：放行并到达上游
    lastUpstreamUrl = '';
    const allowed = await postReadBytes(
      readBytesEnvelope('session-visible', 'b.txt', { baseFile: '/workspaces/visible/sub/a.txt' }),
    );
    assert.equal(allowed.status, 200, allowed.body);
    assert.ok(lastUpstreamUrl.startsWith('/api/workspaceFiles/readBytes'));

    // 相对目标逃逸出会话根：上游会读 resolve(dirname(baseFile), path)，网关必须先拦下
    assert.equal(
      (await postReadBytes(readBytesEnvelope('session-visible', '../../etc/passwd', { baseFile: '/workspaces/visible/a.txt' }))).status,
      403,
    );
    // 基准文件在工作区外 → 目标也在工作区外
    assert.equal(
      (await postReadBytes(readBytesEnvelope('session-visible', 'hostname', { baseFile: '/etc/passwd' }))).status,
      403,
    );
    // 带 baseFile 时 path 必须是相对路径，否则上游会把目标甩到工作区外
    assert.equal(
      (await postReadBytes(readBytesEnvelope('session-visible', '/etc/passwd', { baseFile: '/workspaces/visible/a.txt' }))).status,
      403,
    );
    // 畸形 options 一律拒绝
    for (const options of [
      'x',
      5,
      [],
      { baseFile: 5 },
      { baseFile: '' },
      { baseFile: '/workspaces/visible/a.txt', extra: 1 },
      { range: { offset: 'x' } },
      { range: [] },
    ]) {
      assert.equal(
        (await postReadBytes(readBytesEnvelope('session-visible', 'b.txt', options))).status,
        403,
        JSON.stringify(options),
      );
    }
    // 无 baseFile 的既有口径不变
    assert.equal((await postReadBytes(readBytesEnvelope('session-visible', 'sub/b.txt', {}))).status, 200);
    assert.equal((await postReadBytes(readBytesEnvelope('session-visible', 'sub/b.txt', undefined))).status, 200);
    assert.equal((await postReadBytes(readBytesEnvelope('session-visible', '/etc/passwd', undefined))).status, 403);
    // 未授权的 scope 不能借 baseFile 读取工作区内的文件
    assert.equal(
      (await postReadBytes(readBytesEnvelope('session-hidden', 'sub/b.txt', { baseFile: '/workspaces/visible/a.txt' }))).status,
      403,
    );
  } finally {
    cookie = originalCookie;
    fixture.connection.client.close();
  }
});

// ── 0.1.7-alpha.1 对象级授权 / 授权版本回归 ─────────────────────────────

test('权限：session.export 对子用户按 query sessionId 做归属校验，缺失/越权一律 403', async () => {
  const fixture = await authorizedSubuserFixture('session-export-user', { allowGitDownload: true });
  const originalCookie = cookie;
  const sub = (method: string, url: string) => gatewayReq(method, url, { cookie: fixture.cookie });
  try {
    // 前置对照：授权会话可用，说明下面 403 的原因确实只是导出路由的归属校验
    assert.equal((await sub('GET', '/api/changes.summary?sessionId=session-visible&seq=1')).status, 200);

    // 缺失 sessionId：即使 allow_git_download=true 也必须 403，且不得到达上游
    const beforeMissing = lastUpstreamUrl;
    assert.equal((await sub('GET', '/api/session.export')).status, 403);
    assert.equal(lastUpstreamUrl, beforeMissing, '缺失 sessionId 的导出请求不得到达上游');

    // 越权 sessionId：403 且不得到达上游（否则等于拿走其他租户的会话日志）
    const beforeForeign = lastUpstreamUrl;
    assert.equal((await sub('GET', '/api/session.export?sessionId=session-hidden')).status, 403);
    assert.equal(lastUpstreamUrl, beforeForeign, '他人会话的导出请求不得到达上游');
    assert.equal((await sub('HEAD', '/api/session.export?sessionId=session-hidden')).status, 403, 'HEAD 走同一套归属校验');
    assert.equal((await sub('HEAD', '/api/session/export?sessionId=session-hidden')).status, 403, '斜杠写法同样校验');
    assert.equal((await sub('GET', '/api/session.export?sessionId=')).status, 403, '空 sessionId 同样拒绝');

    // 已授权会话：放行并到达上游（是否允许下载本身仍由 allow_git_download 控制）
    lastUpstreamUrl = '';
    const allowed = await sub('GET', '/api/session.export?sessionId=session-visible');
    assert.equal(allowed.status, 200, allowed.body);
    assert.ok(lastUpstreamUrl.startsWith('/api/session.export'), `必须转发到上游：${lastUpstreamUrl}`);

    // 主用户不受该限制
    cookie = originalCookie;
    assert.equal((await gatewayReq('GET', '/api/session.export?sessionId=session-hidden')).status, 200);
    assert.equal((await gatewayReq('GET', '/api/session.export')).status, 200);
  } finally {
    cookie = originalCookie;
    fixture.connection.client.close();
  }
});

test('权限：workspaceFiles/changes 的 HTTP unary 面对子用户显式 403，主用户透传', async () => {
  const fixture = await authorizedSubuserFixture('workspace-files-changes-user');
  const originalCookie = cookie;
  const envelope = (method: string): string => JSON.stringify({
    type: 'client-request',
    rpcId: 'workspace-files-changes',
    method,
    payload: { args: { workspaceFileScopeId: 'session-visible', path: '/workspaces/visible' } },
  });
  try {
    // scope + path 都合法：旧实现会把它当普通只读 RPC 转发出去（等上游报 signature-invalid），
    // 这里必须由网关自己显式拒绝。
    const before = lastUpstreamUrl;
    assert.equal(
      (await gatewayReq('POST', '/api/workspaceFiles/changes', { 'content-type': 'application/json', cookie: fixture.cookie }, envelope('workspaceFiles/changes'))).status,
      403,
    );
    assert.equal(
      (await gatewayReq('POST', '/api/workspaceFiles.changes', { 'content-type': 'application/json', cookie: fixture.cookie }, envelope('workspaceFiles.changes'))).status,
      403,
    );
    assert.equal(lastUpstreamUrl, before, 'changes 的 HTTP unary 请求不得到达上游');

    // 不误伤同一命名空间下仍按 scope + path 授权的只读 RPC
    assert.equal(
      (await gatewayReq(
        'POST',
        '/api/workspaceFiles/stat',
        { 'content-type': 'application/json', cookie: fixture.cookie },
        JSON.stringify({
          type: 'client-request', rpcId: 'workspace-files-stat', method: 'workspaceFiles/stat',
          payload: { args: { workspaceFileScopeId: 'session-visible', path: '/workspaces/visible/a.txt' } },
        }),
      )).status,
      200,
    );

    // 主用户不受限制
    cookie = originalCookie;
    assert.equal(
      (await gatewayReq('POST', '/api/workspaceFiles.changes', { 'content-type': 'application/json' }, envelope('workspaceFiles.changes'))).status,
      200,
    );
  } finally {
    cookie = originalCookie;
    fixture.connection.client.close();
  }
});

test('权限：子用户 workspaceFiles/changes 只允许授权会话工作区，并过滤越界变化', async () => {
  remoteMuxOpenEndpoints = [];
  const fixture = await authorizedSubuserFixture('workspace-files-change-feed-user');
  try {
    fixture.connection.client.send(JSON.stringify({
      type: 'open',
      streamId: 'workspace-file-change-feed',
      endpoint: 'workspaceFiles/changes',
      payload: { args: { workspaceFileScopeId: 'session-visible', path: '/workspaces/visible/app.ts' } },
    }));
    const ready = await nextFrameOrFail(fixture.connection, 'workspace file changes ready');
    assert.deepEqual(ready, {
      type: 'item', streamId: 'workspace-file-change-feed', value: { kind: 'ready' },
    });
    const allowed = await nextFrameOrFail(fixture.connection, 'workspace file changes allowed change');
    assert.deepEqual(allowed, {
      type: 'item', streamId: 'workspace-file-change-feed',
      value: { kind: 'change', change: { absolutePath: '/workspaces/visible/app.ts', version: 'v1' } },
    });
    const ended = await nextFrameOrFail(fixture.connection, 'workspace file changes end');
    assert.deepEqual(ended, { type: 'end', streamId: 'workspace-file-change-feed' });
    assert.equal(remoteMuxOpenEndpoints.includes('workspaceFiles/changes'), true);

    fixture.connection.client.send(JSON.stringify({
      type: 'open',
      streamId: 'workspace-file-change-denied',
      endpoint: 'workspaceFiles/changes',
      payload: { args: { workspaceFileScopeId: 'session-hidden', path: '/workspaces/hidden/secret.txt' } },
    }));
    const denied = await nextFrameOrFail(fixture.connection, 'workspace file changes denied');
    assert.equal(denied.type, 'error');
    assert.equal((denied.error as { code?: string }).code, 'gateway/forbidden');
    assert.equal(remoteMuxOpenEndpoints.includes('workspaceFiles/changes'), true, 'denied stream must not reach upstream');
  } finally {
    fixture.connection.client.close();
  }
});

test('权限：workspaceFiles 目标路径同时按词法与 canonical 口径判定（符号链接不可逃逸）', async (t) => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'dshpw-wf-root-'));
  const outsideRoot = mkdtempSync(path.join(os.tmpdir(), 'dshpw-wf-outside-'));
  const originalCookie = cookie;
  const previousVisiblePath = remoteMuxBaselineVisiblePath;
  let connection: Awaited<ReturnType<typeof openRemoteMux>> | null = null;
  try {
    writeFileSync(path.join(tempRoot, 'inside.txt'), 'inside');
    writeFileSync(path.join(outsideRoot, 'secret.txt'), 'secret');
    const linkPath = path.join(tempRoot, 'escape');
    let linked = false;
    for (const type of ['junction', 'dir'] as const) {
      try {
        symlinkSync(outsideRoot, linkPath, type);
        linked = true;
        break;
      } catch {
        // 当前平台/权限不支持目录符号链接：下面显式跳过该用例
      }
    }
    if (!linked) {
      t.skip('当前平台无法创建目录符号链接/junction，跳过 canonical 逃逸回归');
      return;
    }
    // 用真实路径作为授权根：使根自身的词法口径与 canonical 口径一致
    const rootPath = realpathSync(tempRoot).replace(/\\/g, '/');
    const subUser = db.createUser('workspace-files-canonical-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
    db.setPermissions(subUser.id, {
      allowedFolders: [rootPath], hourlyTokenLimit: null, dailyMinutesLimit: null,
      allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false, allowSsh: false,
      allowedAgentPresets: null, banned: false, sandboxMode: null,
      disabledSessions: [], allowedSessionIds: ['session-visible'],
    });
    db.markSessionGrantsSeeded(subUser.id);
    const subCookie = `dsh_gateway_token=${jwt.sign(
      { sub: String(subUser.id), username: subUser.username, cv: 0 },
      'test-secret',
      { expiresIn: '12h' },
    )}`;
    // 让会话 cwd 落在真实临时根上（Remote baseline 是唯一的快照来源）
    remoteMuxBaselineVisiblePath = rootPath;
    connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'canonical-workspace', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    await nextFrameOrFail(connection, 'canonical workspace baseline');
    const read = (target: string) => gatewayReq(
      'POST',
      '/api/workspaceFiles/readBytes',
      { 'content-type': 'application/json', cookie: subCookie },
      JSON.stringify({
        type: 'client-request', rpcId: 'workspace-files-canonical', method: 'workspaceFiles/readBytes',
        payload: { args: { workspaceFileScopeId: 'session-visible', path: target } },
      }),
    );
    // 会话根内的真实文件：词法与 canonical 都命中 → 放行
    assert.equal((await read(`${rootPath}/inside.txt`)).status, 200);
    // 词法上在根内、真实路径经 junction/symlink 落在根外 → canonical 口径必须拒绝
    const escapedBefore = lastUpstreamUrl;
    const escaped = await read(`${rootPath}/escape/secret.txt`);
    assert.equal(escaped.status, 403, escaped.body);
    assert.equal(lastUpstreamUrl, escapedBefore, '经符号链接逃逸的读取不得到达上游');
  } finally {
    remoteMuxBaselineVisiblePath = previousVisiblePath;
    cookie = originalCookie;
    connection?.client.close();
    for (const dir of [tempRoot, outsideRoot]) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows 上句柄可能未释放：临时目录交给系统回收
      }
    }
  }
});

test('revision：权限变更后旧基线立即失效，且在途 create 响应不得回写授权', async () => {
  const fixture = await authorizedSubuserFixture('epoch-fence-user');
  const originalCookie = cookie;
  const subJson = { 'content-type': 'application/json', cookie: fixture.cookie };
  delaySessionCreateResponse = true;
  releaseSessionCreateResponse = null;
  try {
    // 前置：旧基线已经授权 session-visible
    assert.equal(
      (await gatewayReq('GET', '/api/changes.summary?sessionId=session-visible&seq=1', { cookie: fixture.cookie })).status,
      200,
    );

    // 在途 create（上游挂起响应）
    const create = gatewayReq('POST', '/api/session.create', subJson, JSON.stringify({
      type: 'client-request', rpcId: 'epoch-fence-create', method: 'session/create',
      payload: { args: { request: { workspaceId: 'workspace-visible' } } },
    }));
    for (let attempt = 0; attempt < 20 && releaseSessionCreateResponse === null; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const release = releaseSessionCreateResponse as (() => void) | null;
    if (release === null) throw new Error('mock DSH must receive the delayed create request');

    // 权限变更：撤销该用户的会话授权（去 grant + 逐会话禁用）
    const revoked = JSON.stringify({
      userId: fixture.userId,
      allowedFolders: ['/workspaces/visible'],
      hourlyTokenLimit: null,
      dailyMinutesLimit: null,
      allowUpload: false,
      allowGitDownload: false,
      allowWorkspaceCreate: false,
      allowedAgentPresets: null,
      banned: false,
      sandboxMode: null,
      disabledSessions: ['session-visible'],
      allowedSessionIds: [],
    });
    const saved = await gatewayReq(
      'POST',
      '/gateway/api/permissions',
      { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(revoked)) },
      revoked,
    );
    assert.equal(saved.status, 200, saved.body);
    assert.deepEqual(db.listUserSessionGrants(fixture.userId), []);

    // 旧基线必须立即失效，不能等到下一次 baseline
    assert.equal(
      (await gatewayReq('GET', '/api/changes.summary?sessionId=session-visible&seq=1', { cookie: fixture.cookie })).status,
      403,
      '撤销后旧授权快照不得继续放行',
    );

    // 释放在途响应：授权已变，旧请求不得把新会话写回 grant/快照
    release();
    releaseSessionCreateResponse = null;
    const response = await create;
    assert.equal(response.status, 200, response.body);
    assert.deepEqual(db.listUserSessionGrants(fixture.userId), [], '在途 create 响应不得回写已撤销的授权');
    assert.equal(
      (await gatewayReq('GET', `/api/changes.summary?sessionId=${wireCreatedSessionId}&seq=1`, { cookie: fixture.cookie })).status,
      403,
      '在途响应也不得把新会话写回授权快照',
    );
  } finally {
    delaySessionCreateResponse = false;
    const pendingRelease = releaseSessionCreateResponse as (() => void) | null;
    releaseSessionCreateResponse = null;
    if (pendingRelease !== null) pendingRelease();
    cookie = originalCookie;
    fixture.connection.client.close();
  }
});

test('Remote mux：baseline 未建立且 grant 尚未 seed 时等待后拒绝未授权 session/follow', async () => {
  const subUser = db.createUser('pending-follow-legacy-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  // 故意不 markSessionGrantsSeeded：模拟首次迁移前的旧用户（grant 还没 seed）
  assert.equal(db.isSessionGrantsSeeded(subUser.id), false);
  const subCookie = `dsh_gateway_token=${jwt.sign(
    { sub: String(subUser.id), username: subUser.username, cv: 0 },
    'test-secret',
    { expiresIn: '12h' },
  )}`;
  remoteMuxOpenEndpoints = [];
  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  const early: Record<string, unknown>[] = [];
  const onMessage = (data: Buffer): void => { early.push(JSON.parse(data.toString()) as Record<string, unknown>); };
  try {
    connection.client.on('message', onMessage);
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'legacy-follow', endpoint: 'session/follow',
      payload: { args: { request: { address: { kind: 'session', sessionId: 'session-visible' } } } },
    }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    connection.client.off('message', onMessage);
    assert.deepEqual(early, [], 'grant 尚未 seed 时既不得立即拒绝，也不得提前放行');
    assert.deepEqual(remoteMuxOpenEndpoints, [], 'baseline 之前不得把 session/follow 转发到上游');

    // baseline 到达后统一重读 grant/disabled/白名单/所有权；工作区分配
    // 不会把既有 session 自动变成 grant，因此该流最终拒绝。
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'legacy-workspace', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    const workspace = await nextFrameOrFail(connection, 'legacy workspace baseline');
    const rejected = await nextFrameOrFail(connection, 'legacy follow rejection');
    assert.equal(workspace.streamId, 'legacy-workspace');
    assert.equal(rejected.streamId, 'legacy-follow');
    assert.equal(rejected.type, 'error');
    assert.deepEqual(remoteMuxOpenEndpoints, ['workspace/follow']);
    assert.equal(db.isSessionGrantsSeeded(subUser.id), true);
    assert.deepEqual(db.listUserSessionGrants(subUser.id), []);
  } finally {
    connection.client.off('message', onMessage);
    connection.client.close();
  }
});

test('Remote mux：延迟等待 baseline 的 session/follow 有界 TTL，超时按逻辑流拒绝', async () => {
  const subUser = db.createUser('pending-follow-ttl-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  assert.equal(db.isSessionGrantsSeeded(subUser.id), false);
  const subCookie = `dsh_gateway_token=${jwt.sign(
    { sub: String(subUser.id), username: subUser.username, cv: 0 },
    'test-secret',
    { expiresIn: '12h' },
  )}`;
  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'ttl-follow', endpoint: 'session/follow',
      payload: { args: { request: { address: { kind: 'session', sessionId: 'session-visible' } } } },
    }));
    // 5 秒 TTL：等待超过 TTL 后发一条消息触发超时收敛（心跳也会收敛）
    await new Promise((resolve) => setTimeout(resolve, 5_200));
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, '超时只拒绝该逻辑流，不额外关闭 carrier');
    connection.client.send(JSON.stringify({ type: 'cancel', streamId: 'ttl-follow' }));
    const frame = await Promise.race([
      connection.nextFrame(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('pending session stream TTL rejection timeout')), 3_000)),
    ]);
    assert.deepEqual(frame, {
      type: 'error',
      streamId: 'ttl-follow',
      error: { code: 'gateway/forbidden', message: 'Remote session not available for this user', details: {} },
    });
  } finally {
    connection.client.close();
  }
});

test('Remote mux：不完整的 baseline 不抹掉仍合法的会话授权快照', async () => {
  const fixture = await authorizedSubuserFixture('baseline-retention-user');
  const originalCookie = cookie;
  cookie = fixture.cookie;
  remoteMuxBaselineOmitVisibleWorkspace = true;
  try {
    assert.equal((await gatewayReq('GET', '/api/changes.summary?sessionId=session-visible&seq=1')).status, 200);
    fixture.connection.client.send(JSON.stringify({
      type: 'open', streamId: 'retention-workspace', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    const baseline = await nextFrameOrFail(fixture.connection, 'incomplete workspace baseline');
    const value = (baseline.value as { value?: { items?: unknown[] } }).value;
    assert.deepEqual(value?.items, [], '第二个 baseline 确实不含可见工作区（用于验证保留行为）');

    // grant 未变、未禁用、仍在白名单内且非他人所有权 → 旧快照条目必须保留
    assert.equal(db.hasUserSessionGrant(fixture.userId, 'session-visible'), true);
    assert.equal(
      (await gatewayReq('GET', '/api/changes.summary?sessionId=session-visible&seq=1')).status,
      200,
      '不完整 baseline 不得把仍在授权内的会话从授权快照里抹掉',
    );
  } finally {
    remoteMuxBaselineOmitVisibleWorkspace = false;
    cookie = originalCookie;
    fixture.connection.client.close();
  }
});

// 上游响应头超时回归：上游卡死（既不回响应头也不断开）必须被有界地结束在 504，
// 而不是让客户端永久挂起；已收到响应头的慢响应（SSE/长响应）必须不受该窗口约束。
function withUpstreamResponseHeaderTimeoutMs<T>(value: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.MCP_GATEWAY_UPSTREAM_HEADER_TIMEOUT_MS;
  process.env.MCP_GATEWAY_UPSTREAM_HEADER_TIMEOUT_MS = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env.MCP_GATEWAY_UPSTREAM_HEADER_TIMEOUT_MS;
    else process.env.MCP_GATEWAY_UPSTREAM_HEADER_TIMEOUT_MS = previous;
  });
}

test('上游响应头超时：接受请求后不回响应头时，网关有界返回 504 并中止上游请求', async () => {
  holdResponseHeaders = true;
  const startedAt = Date.now();
  try {
    const response = await withUpstreamResponseHeaderTimeoutMs('300', () =>
      gatewayReq('POST', '/api/gateway-timeout-probe', { 'content-type': 'application/json' }, JSON.stringify({ probe: true })),
    );
    const elapsed = Date.now() - startedAt;
    assert.equal(response.status, 504, '未收到响应头且上游不断开时必须返回 504');
    assert.match(response.body, /timeout/i);
    assert.ok(elapsed >= 250, `必须真的等到超时窗口而不是立刻失败（实际 ${elapsed}ms）`);
  } finally {
    holdResponseHeaders = false;
  }
});

test('上游响应头超时：已收到响应头的慢响应（SSE/长响应）不被计时器误杀', async () => {
  slowResponseBodyMs = 700;
  const startedAt = Date.now();
  try {
    const response = await withUpstreamResponseHeaderTimeoutMs('300', () =>
      gatewayReq('GET', '/api/gateway-timeout-probe'),
    );
    const elapsed = Date.now() - startedAt;
    assert.equal(response.status, 200, '响应头已到达后不得因响应头计时器被中断');
    assert.deepEqual(JSON.parse(response.body), { ok: true, slow: true });
    assert.ok(elapsed >= 600, `慢响应应完整结束 body（实际 ${elapsed}ms）`);
  } finally {
    slowResponseBodyMs = 0;
  }
});

// ── 子用户工作区/会话 403、503 回归（__deny__+create picker、分配工作区、
//    按 workspaceId 建会话、基线缺失、既有会话可见性） ─────────────────────

test('D1 工作流：__deny__ + allow_workspace_create 的刚创建目录可列出（不再 403）', async () => {
  const home = os.homedir().replace(/\\/g, '/').replace(/\/+$/, '');
  const subUser = db.createUser('d1-deny-list-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['__deny__'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
  });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const json = { 'content-type': 'application/json' };
  const listBody = (requestPath: string, rpcId: string) => JSON.stringify({
    type: 'client-request', rpcId, method: 'directoryPicker/list',
    payload: { args: { path: requestPath } },
  });
  const entryPaths = (body: string): string[] => {
    const value = (JSON.parse(body) as { result?: { value?: { entries?: Array<{ path?: unknown }> } } }).result?.value;
    return (value?.entries ?? []).map((entry) => String(entry.path));
  };
  const newDir = `${home}/d1-deny-list-dir`;
  try {
    // 1) picker 从主目录创建新文件夹 → 记账 pending（__deny__ 不再阻止记账）。
    const mkdir = await gatewayReq('POST', '/api/directoryPicker/createDirectory', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1dl-mkdir', method: 'directoryPicker/createDirectory',
      payload: { args: { path: home, name: 'd1-deny-list-dir' } },
    }));
    assert.equal(mkdir.status, 200, mkdir.body);

    // 2) 主目录（新建落点）可完整列出。
    const listHome = await gatewayReq('POST', '/api/directoryPicker/list', json, listBody(home, 'd1dl-home'));
    assert.equal(listHome.status, 200, listHome.body);

    // 3) 刚创建的目录可列出并进入（选择新文件夹必需）。
    const listNew = await gatewayReq('POST', '/api/directoryPicker/list', json, listBody(newDir, 'd1dl-new'));
    assert.equal(listNew.status, 200, listNew.body);

    // 4) 与授权根/pending 无关的目录不再 403：上游内容全部过滤，只回放可进入的
    //    pending 目录入口（fail-closed，不泄露宿主目录名）。
    const listElsewhere = await gatewayReq('POST', '/api/directoryPicker/list', json, listBody('/etc', 'd1dl-elsewhere'));
    assert.equal(listElsewhere.status, 200, listElsewhere.body);
    assert.equal(entryPaths(listElsewhere.body).includes('/root/33'), false, '不得回放上游目录内容');
    assert.equal(entryPaths(listElsewhere.body).includes('/workspaces/other'), false, '不得回放上游目录内容');
  } finally {
    cookie = originalCookie;
  }
});

test('D1 工作流：上游回包的新目录逃逸出请求父目录时不记账、不可登记', async () => {
  const home = os.homedir().replace(/\\/g, '/').replace(/\/+$/, '');
  const escaped = '/escaped-outside-dir';
  const subUser = db.createUser('d1-escape-record', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['__deny__'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
  });
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const json = { 'content-type': 'application/json' };
  directoryCreateEscapePath = escaped;
  try {
    // 上游被替换/回归时回了一个父目录之外的路径（DSH 自身会拒绝 . / .. / 含分隔符的 name）。
    const mkdir = await gatewayReq('POST', '/api/directoryPicker/createDirectory', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1-escape-mkdir', method: 'directoryPicker/createDirectory',
      payload: { args: { path: home, name: 'escape-dir' } },
    }));
    assert.equal(mkdir.status, 200, mkdir.body);

    // 逃逸目录不得进 pending：登记通道仍 fail-closed，且不得写入任何归属/白名单。
    const register = await gatewayReq('POST', '/api/workspace/create', json, JSON.stringify({
      type: 'client-request', rpcId: 'd1-escape-register', method: 'workspace/create',
      payload: { args: { request: { path: escaped } } },
    }));
    assert.equal(register.status, 403, register.body);
    assert.deepEqual(db.listUserWorkspacePaths(subUser.id), [], '不得把父目录之外的目录归为私有工作区');
    assert.deepEqual(db.getPermissions(subUser.id)?.allowed_folders, ['__deny__'], '不得扩宽工作区白名单');
  } finally {
    directoryCreateEscapePath = null;
    cookie = originalCookie;
  }
});

test('Issue #25：workspace/create 解析既有分配工作区（created:false）后可按 workspaceId 建会话', async () => {
  const subUser = db.createUser('assigned-resolve-existing', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const json = { 'content-type': 'application/json' };
  workspaceCreateMakesNewWorkspace = false;
  try {
    // 1) 解析主用户分配的既有工作区：created:false，绝不变为子用户私有归属。
    const register = await gatewayReq('POST', '/api/workspace/create', json, JSON.stringify({
      type: 'client-request', rpcId: 'assigned-resolve', method: 'workspace/create',
      payload: { args: { request: { path: '/workspaces/visible' } } },
    }));
    assert.equal(register.status, 200, register.body);
    const workspaceId = (JSON.parse(register.body) as {
      result?: { value?: { workspace?: { workspaceId?: unknown } } };
    }).result?.value?.workspace?.workspaceId;
    assert.equal(typeof workspaceId, 'string');
    assert.deepEqual(db.listUserWorkspacePaths(subUser.id), [], '解析既有工作区不得产生私有归属');

    // 2) 紧随其后按 workspaceId 新建会话：不得 403，也不得因 Remote 基线未到 503。
    const created = await gatewayReq('POST', '/api/session.create', json, JSON.stringify({
      type: 'client-request', rpcId: 'assigned-resolve-create', method: 'session/create',
      payload: { args: { request: { workspaceId } } },
    }));
    assert.notEqual(created.status, 503, created.body);
    assert.equal(created.status, 200, created.body);
    assert.ok(db.hasUserSessionGrant(subUser.id, createdSessionIdForMock), '新建会话必须登记给该子用户');
    assert.deepEqual(db.listUserWorkspacePaths(subUser.id), [], '建会话不改写工作区归属');
  } finally {
    workspaceCreateMakesNewWorkspace = false;
    cookie = originalCookie;
  }
});

test('Issue #25：分配工作区里未逐条授权的既有会话对子用户仍不可见', async () => {
  const subUser = db.createUser('assigned-existing-hidden', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  remoteMuxBaselineVisibleSessionIds = ['session-visible'];
  let connection: Awaited<ReturnType<typeof openRemoteMux>> | undefined;
  try {
    // 1) Remote 基线：分配工作区可见，但其既有未授权会话槽位被清空。
    connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    connection.client.send(JSON.stringify({ type: 'open', streamId: 'assigned-hidden', endpoint: 'workspace/follow', payload: { args: {} } }));
    const baseline = await nextFrameOrFail(connection, 'assigned hidden baseline');
    const items = (baseline.value as { value?: { items?: Array<{ workspaceId: string; sessionIds: string[] }> } }).value?.items ?? [];
    assert.deepEqual(items.map((item) => [item.workspaceId, item.sessionIds]), [['workspace-visible', []]]);

    // 2) session.list 也不得回放该会话。
    const list = await gatewayReq('POST', '/api/session.list', { 'content-type': 'application/json' }, '{}');
    assert.equal(list.status, 200, list.body);
    const listItems = (JSON.parse(list.body) as { result: { value: { items: Array<{ sessionId: string }> } } }).result.value.items;
    assert.deepEqual(listItems.map((item) => item.sessionId), []);

    // 3) 未授权既有会话不得因基线被自动写入 grant。
    assert.deepEqual(db.listUserSessionGrants(subUser.id), []);

    // 4) workspace.list 的会话槽位同样被过滤。
    const workspaceList = await gatewayReq(
      'POST', '/api/workspace.list', { 'content-type': 'application/json', 'x-test-mode': 'assigned-visible' }, '{}',
    );
    assert.equal(workspaceList.status, 200, workspaceList.body);
    const workspaceItems = (JSON.parse(workspaceList.body) as {
      result: { value: { items: Array<{ workspaceId: string; sessionIds: string[] }> } };
    }).result.value.items;
    const row = workspaceItems.find((item) => item.workspaceId === 'workspace-visible');
    assert.ok(row, '分配工作区本身仍可见');
    assert.deepEqual(row?.sessionIds, [], '未授权既有会话不得出现在工作区槽位');
  } finally {
    remoteMuxBaselineVisibleSessionIds = ['session-visible'];
    connection?.client.close();
    cookie = originalCookie;
  }
});

test('Issue #25：分配工作区复用已有空白 sessionId 可新建，跨会话 ID 仍拒绝', async () => {
  const subUser = db.createUser('assigned-blank-reuse-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const originalCookie = cookie;
  cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  try {
    const first = await gatewayReq('POST', '/api/session.create', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'assigned-blank-first', method: 'session/create',
      payload: { args: { request: { workspaceId: 'workspace-visible' } } },
    }));
    assert.equal(first.status, 200, first.body);
    const firstValue = (JSON.parse(first.body) as { result?: { value?: { sessionId?: unknown } } }).result?.value;
    assert.equal(typeof firstValue?.sessionId, 'string');
    const reused = await gatewayReq('POST', '/api/session.create', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'assigned-blank-reuse', method: 'session/create',
      payload: { args: { request: { workspaceId: 'workspace-visible', sessionId: firstValue?.sessionId } } },
    }));
    assert.equal(reused.status, 200, reused.body);
    const foreign = await gatewayReq('POST', '/api/session.create', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'assigned-blank-foreign', method: 'session/create',
      payload: { args: { request: { workspaceId: 'workspace-visible', sessionId: 'session-not-authorized' } } },
    }));
    assert.equal(foreign.status, 403, foreign.body);
  } finally {
    cookie = originalCookie;
  }
});

test('Issue #25：自建工作区子目录里未授权的既有会话不因父目录归属而自动可见', async () => {
  const subUser = db.createUser('owned-parent-nested-hidden', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  // 私有归属只覆盖父目录本身；子目录工作区并非该子用户登记的工作区，
  // 其中的既有会话仍须逐条授权（工作区权限 ≠ 会话授权）。
  db.addUserWorkspace(subUser.id, '/workspaces/visible');
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  const originalVisiblePath = remoteMuxBaselineVisiblePath;
  cookie = subCookie;
  remoteMuxBaselineVisibleSessionIds = ['session-visible'];
  remoteMuxBaselineVisiblePath = '/workspaces/visible/nested';
  let connection: Awaited<ReturnType<typeof openRemoteMux>> | undefined;
  try {
    connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    connection.client.send(JSON.stringify({ type: 'open', streamId: 'owned-nested-hidden', endpoint: 'workspace/follow', payload: { args: {} } }));
    const baseline = await nextFrameOrFail(connection, 'owned parent nested baseline');
    const items = (baseline.value as { value?: { items?: Array<{ path: string; sessionIds: string[] }> } }).value?.items ?? [];
    assert.deepEqual(
      items.map((item) => [item.path, item.sessionIds]),
      [['/workspaces/visible/nested', []]],
      '父目录归属不得让子目录里的未授权会话自动可见',
    );

    const list = await gatewayReq('POST', '/api/session.list', { 'content-type': 'application/json' }, '{}');
    assert.equal(list.status, 200, list.body);
    assert.deepEqual(
      (JSON.parse(list.body) as { result: { value: { items: Array<{ sessionId: string }> } } }).result.value.items.map((item) => item.sessionId),
      [],
    );
    assert.deepEqual(db.listUserSessionGrants(subUser.id), []);
  } finally {
    remoteMuxBaselineVisiblePath = originalVisiblePath;
    remoteMuxBaselineVisibleSessionIds = ['session-visible'];
    connection?.client.close();
    cookie = originalCookie;
    // 归属行是全局的：不清理会把它算作其他用例的「另一子用户私有工作区」。
    db.removeUserWorkspace(subUser.id, '/workspaces/visible');
  }
});

test('等待工作区基线期间客户端断开不会触发重复响应或击穿网关', async () => {
  const subUser = db.createUser('baseline-aborted-client', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  await new Promise<void>((resolve, reject) => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'aborted-baseline', method: 'session/create',
      payload: { args: { request: { workspaceId: 'not-a-known-workspace' } } } });
    const request = http.request({ host: '127.0.0.1', port: gatewayPort, path: '/api/session.create', method: 'POST',
      headers: { cookie: subCookie, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } });
    request.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ECONNRESET') reject(error);
    });
    request.end(body, () => { request.destroy(); resolve(); });
  });
  await new Promise((resolve) => setTimeout(resolve, 5200));
  const healthy = await gatewayReq('GET', '/gateway/healthz');
  assert.equal(healthy.status, 200, healthy.body);
});

test('Issue #25：无 Remote 基线时按已分配 workspaceId 新建会话不返回 503', async () => {
  const subUser = db.createUser('assigned-no-baseline', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const originalCookie = cookie;
  try {
    // 主用户 workspace.list 把该工作区的 id→path 灌入全局快照；子用户自己的
    // Remote 基线尚未建立（不打开 workspace/follow）。
    const adminList = await gatewayReq(
      'POST', '/api/workspace.list', { 'content-type': 'application/json', 'x-test-mode': 'assigned-visible' }, '{}',
    );
    assert.equal(adminList.status, 200, adminList.body);

    cookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
    const created = await gatewayReq('POST', '/api/session.create', { 'content-type': 'application/json' }, JSON.stringify({
      type: 'client-request', rpcId: 'no-baseline-create', method: 'session/create',
      payload: { args: { request: { workspaceId: 'workspace-visible' } } },
    }));
    assert.notEqual(created.status, 503, created.body);
    assert.equal(created.status, 200, created.body);
    assert.ok(db.hasUserSessionGrant(subUser.id, createdSessionIdForMock), '新建会话必须登记给该子用户');
  } finally {
    cookie = originalCookie;
  }
});

// ── owner-only SSH / 动态清单 / 会话基线契约回归 ─────────────────────────────

/** ClientConnection 信封（terminal 等官方面 RPC 与 session 作用域 RPC 共用）。 */
function clientRequestEnvelope(rpcId: string, method: string, args: Record<string, unknown>): string {
  return JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } });
}

/** 同步一份普通插件动态清单（宿主 → 网关内部端点）。 */
async function syncDynamicManifest(
  generation: string,
  fields: { namespaces?: string[]; streamEndpoints?: string[]; exactPaths?: string[]; pathPrefixes?: string[] },
): Promise<{ status: number; body: string }> {
  const body = JSON.stringify({
    generation,
    parentPid: process.pid,
    namespaces: fields.namespaces ?? [],
    streamEndpoints: fields.streamEndpoints ?? [],
    exactPaths: fields.exactPaths ?? [],
    pathPrefixes: fields.pathPrefixes ?? [],
  });
  return gatewayReq('POST', '/gateway/internal/plugin-manifest', {
    'content-type': 'application/json',
    'x-internal-secret': 'test-internal',
    'content-length': String(Buffer.byteLength(body)),
  }, body);
}

test('官方 terminal HTTP：子用户始终只能拿到无能力桩或拒绝，主用户原样透传', async () => {
  const subUser = db.createUser('official-terminal-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    // 即使历史 allow_ssh=true 也不改变官方 terminal 对子用户的边界。
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false, allowSsh: true,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  try {
    const upstreamBefore = lastUpstreamUrl;
    // 四个无能力 UX 桩：本地固定响应，绝不触上游。
    const list = await gatewayReq('POST', '/api/terminal/list', { 'content-type': 'application/json' },
      clientRequestEnvelope('official-terminal-list', 'terminal/list', { sessionId: 'session-x' }));
    assert.equal(list.status, 200, list.body);
    const listBody = JSON.parse(list.body) as { type: string; rpcId: string; result: { ok: boolean; value: unknown[] } };
    assert.equal(listBody.type, 'server-response');
    assert.equal(listBody.rpcId, 'official-terminal-list', 'rpcId 必须原样回显');
    assert.equal(listBody.result.ok, true);
    assert.deepEqual(listBody.result.value, [], 'list 桩必须是裸空数组');

    for (const [url, method] of [
      ['/api/terminal/environment', 'terminal/environment'],
      ['/api/terminal/shells', 'terminal/shells'],
    ] as const) {
      const res = await gatewayReq('POST', url, { 'content-type': 'application/json' },
        clientRequestEnvelope(`official-${method}`, method, {}));
      assert.equal(res.status, 200, res.body);
      const body = JSON.parse(res.body) as { result: { ok: boolean; error?: { code?: string } } };
      assert.equal(body.result.ok, false, `${method} 必须回无能力`);
      assert.equal(body.result.error?.code, 'terminal/unavailable');
    }

    const close = await gatewayReq('POST', '/api/terminal/close', { 'content-type': 'application/json' },
      clientRequestEnvelope('official-terminal-close', 'terminal/close', {}));
    assert.equal(close.status, 200, close.body);
    const closeBody = JSON.parse(close.body) as { result: { ok: boolean; value?: unknown } };
    assert.equal(closeBody.result.ok, true);
    assert.equal(closeBody.result.value, undefined, 'close 桩不得带回任何 value');

    // 真实宿主方法一律 403（terminal 命名空间硬边界）。
    for (const method of ['create', 'write', 'resize', 'rename'] as const) {
      const res = await gatewayReq('POST', `/api/terminal/${method}`, { 'content-type': 'application/json' },
        clientRequestEnvelope(`official-${method}`, `terminal/${method}`, {}));
      assert.equal(res.status, 403, `${method} 必须被拒绝: ${res.body}`);
    }
    // GET 即使命中桩方法名也不是合法 RPC，回 403 而不是执行桩。
    assert.equal((await gatewayReq('GET', '/api/terminal/list')).status, 403);
    assert.equal(lastUpstreamUrl, upstreamBefore, '子用户 terminal 桩/拒绝都不得触上游');

    // 主用户不受 terminal 边界限制，真实方法原样透传。
    cookie = originalCookie;
    const adminBefore = lastUpstreamUrl;
    const admin = await gatewayReq('POST', '/api/terminal/create', { 'content-type': 'application/json' },
      clientRequestEnvelope('official-admin-create', 'terminal/create', { agentId: 'a' }));
    assert.equal(admin.status, 200, admin.body);
    assert.notEqual(lastUpstreamUrl, adminBefore, '主用户 terminal 请求必须到达上游');
  } finally {
    cookie = originalCookie;
  }
});

test('Remote mux：官方账号面仅放行 account/watch，account/watchExpiry 按逻辑流拒绝', async () => {
  remoteMuxOpenEndpoints = [];
  remoteMuxOpenFrames = [];
  const subUser = db.createUser('remote-mux-account-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null,
    disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subToken = jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' });
  const connection = await openRemoteMux({
    cookie: `dsh_gateway_token=${subToken}`, origin: 'http://127.0.0.1', host: '127.0.0.1',
  });
  try {
    // account 是官方 namespace，但只有已列出的 account/watch 属allowed；未列的
    // account/watchExpiry 绝不能因命名空间相同而透明转发。
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'account-expiry', endpoint: 'account/watchExpiry', payload: { args: {} },
    }));
    const rejected = await nextFrameOrFail(connection, 'account/watchExpiry rejection');
    assert.equal(rejected.type, 'error');
    assert.equal(rejected.streamId, 'account-expiry');
    assert.equal((rejected.error as Record<string, unknown>).code, 'gateway/forbidden');
    assert.equal(remoteMuxOpenEndpoints.includes('account/watchExpiry'), false, '未列 Remote 流不得触上游');
    assert.equal(connection.client.readyState, NodeWebSocket.OPEN, '拒绝只作用于该逻辑流');

    // 已列出的 account/watch 是官方允许面，应到达上游（官方空 args 请求）。
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'account-watch', endpoint: 'account/watch', payload: { args: {} },
    }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(remoteMuxOpenEndpoints.includes('account/watch'), true, 'account/watch 应到达上游');
  } finally {
    connection.client.close();
  }
});

test('会话作用域请求：无 Remote 基线等待超时 → 503；基线授权 → 正常；未授权 → 403', async () => {
  const subUser = db.createUser('session-baseline-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null,
    disabledSessions: [], allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  const promptEnvelope = (rpcId: string, sessionId: string): string => clientRequestEnvelope(
    rpcId, 'session/prompt', { request: { sessionId, content: [{ type: 'text', text: 'hi' }] } },
  );
  const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    // 仅打开 carrier、未发 workspace/follow：基线未建立 → 有界等待后 503，不触上游。
    const before = lastUpstreamUrl;
    const pending = await gatewayReq('POST', '/api/session/prompt', { 'content-type': 'application/json' },
      promptEnvelope('no-baseline-prompt', 'session-visible'));
    assert.equal(pending.status, 503, pending.body);
    assert.equal((JSON.parse(pending.body) as { code?: string }).code, 'BASELINE_PENDING');
    assert.equal(lastUpstreamUrl, before, '基线未就绪时不得触上游');

    // 建立基线后：已授权会话正常转发，未授权会话 403。
    connection.client.send(JSON.stringify({
      type: 'open', streamId: 'prompt-baseline', endpoint: 'workspace/follow', payload: { args: {} },
    }));
    assert.equal((await nextFrameOrFail(connection, 'prompt baseline')).streamId, 'prompt-baseline');

    const allowed = await gatewayReq('POST', '/api/session/prompt', { 'content-type': 'application/json' },
      promptEnvelope('baseline-allowed-prompt', 'session-visible'));
    assert.equal(allowed.status, 200, allowed.body);

    const denied = await gatewayReq('POST', '/api/session/prompt', { 'content-type': 'application/json' },
      promptEnvelope('baseline-denied-prompt', 'session-hidden'));
    assert.equal(denied.status, 403, denied.body);
  } finally {
    connection.client.close();
    cookie = originalCookie;
  }
});

test('普通未登记插件不因 SSH/SSRF 检查误 403：私有 host 与非 JSON 请求均直通', async () => {
  const subUser = db.createUser('ordinary-plugin-passthrough-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: [], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false, allowSsh: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  cookie = subCookie;
  try {
    // body.host 指向私网：SSH SSRF 纵深防御只对已登记 SSH 端点生效，未登记的普通
    // 插件路径不得因此被误 403。
    const before = lastUpstreamUrl;
    const privateHost = await gatewayReq('POST', '/api/dsh-ssh/hosts', { 'content-type': 'application/json' },
      JSON.stringify({ alias: 'ordinary-private-host', host: '127.0.0.1' }));
    assert.equal(privateHost.status, 201, privateHost.body);
    assert.notEqual(lastUpstreamUrl, before, '普通插件私有 host 请求应到达上游');

    // non-JSON：普通插件路径不得因 JSON 解析或 SSH 检查被 403，而应原样直通上游。
    const nonJson = await gatewayReq('POST', '/api/ordinary-plugin/echo', { 'content-type': 'text/plain' }, 'not-json-at-all');
    assert.equal(nonJson.status, 200, nonJson.body);
  } finally {
    cookie = originalCookie;
  }
});

test('普通插件 WebSocket：宿主清单已登记路径对子用户直通，未登记仍拒绝且不覆盖 SSH 边界', async () => {
  const subUser = db.createUser('manifest-ws-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: [], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false, allowSsh: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: [],
  });
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const synced = await syncDynamicManifest('manifest-ws-passthrough-regression', {
    exactPaths: ['/plugin/ws/manifest'],
    pathPrefixes: ['/plugin/ws-prefix'],
  });
  assert.equal(synced.status, 200, synced.body);

  const wsHeaders = { cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' };
  const exactAllowed = await websocketHandshake('/plugin/ws/manifest', wsHeaders);
  assert.match(exactAllowed.statusLine, /101/, '清单精确路径对子用户直通');
  const prefixAllowed = await websocketHandshake('/plugin/ws-prefix/child', wsHeaders);
  assert.match(prefixAllowed.statusLine, /101/, '清单前缀路径对子用户直通');

  const unlisted = await websocketHandshake('/plugin/ws/unlisted', wsHeaders);
  assert.match(unlisted.statusLine, /404/, '未登记普通插件 WS 路径仍 fail-closed');
  // 清单不能覆盖已登记 SSH 端点或硬拒 namespace。
  const sshEndpoint = await websocketHandshake('/api/dsh-ssh/terminal', wsHeaders);
  assert.match(sshEndpoint.statusLine, /403/, '已登记 SSH 端点对子用户始终拒绝');
  const blockedRoot = await websocketHandshake('/terminal/anything', wsHeaders);
  assert.match(blockedRoot.statusLine, /40[34]/, '硬拒 namespace 的根级路由不得被清单放开');
});

// ── H1：官方上传 / git 下载开关（仅子用户）与请求体分档回归 ──────────────────
// 重构移除插件兼容层时一并删掉了 allow_upload / allow_git_download 在官方端点上
// 的执行。本组回归锁定 H1 的边界：两条开关只管官方上传与官方 git/会话导出端点，
// 绝不误伤未登记的普通第三方插件；主用户不受限。

/**
 * 请求体分档回归：手写 HTTP 报文，声明一个远大于实际 body 的 content-length
 * （无需真的传输 64/300 MiB）。上游 mock 的默认路由不回读 body 即响应，因此
 * allow_upload=true 时可观察到放行；allow_upload=false 时网关在收包前按声明长度
 * 直接 413 并关闭连接。
 */
function rawRequestBodyProbe(
  url: string,
  declaredLength: number,
  cookieHeader: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: gatewayPort }, () => {
      socket.write([
        `POST ${url} HTTP/1.1`,
        'Host: 127.0.0.1',
        `Cookie: ${cookieHeader}`,
        'Content-Type: application/json',
        `Content-Length: ${declaredLength}`,
        'Connection: close',
        '',
        '',
      ].join('\r\n'));
      // 不发送实际 body：网关按声明长度判定，超限时立即回 413 并关闭连接。
    });
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (status: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString('latin1');
      const headerEnd = raw.indexOf('\r\n\r\n');
      const body = headerEnd >= 0 ? raw.slice(headerEnd + 4) : raw;
      socket.destroy();
      resolve({ status, body });
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`raw request body probe timed out for ${url}`));
    }, 10_000);
    const inspect = (): void => {
      const raw = Buffer.concat(chunks).toString('latin1');
      const headerEnd = raw.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      // 只需状态行：分档拒绝（413）与放行/上游错误都在响应头到达时即可判定。
      finish(Number(/^HTTP\/1\.\d (\d{3})/.exec(raw)?.[1] ?? 0));
    };
    socket.on('data', (chunk: Buffer) => { chunks.push(chunk); inspect(); });
    socket.on('end', () => {
      const raw = Buffer.concat(chunks).toString('latin1');
      finish(Number(/^HTTP\/1\.\d (\d{3})/.exec(raw)?.[1] ?? 0));
    });
    socket.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    });
  });
}

test('H1：请求体上限按角色与 allow_upload 分档（64 MiB ↔ 300 MiB）', () => {
  assert.equal(DEFAULT_USER_REQUEST_BODY_BYTES, 64 * 1024 * 1024);
  assert.equal(ADMIN_REQUEST_BODY_BYTES, 300 * 1024 * 1024);
  assert.equal(requestBodyLimitFor('user', false), DEFAULT_USER_REQUEST_BODY_BYTES);
  assert.equal(requestBodyLimitFor('user', true), ADMIN_REQUEST_BODY_BYTES);
  assert.equal(requestBodyLimitFor('admin', false), ADMIN_REQUEST_BODY_BYTES);
  assert.equal(requestBodyLimitFor('admin', true), ADMIN_REQUEST_BODY_BYTES);
});

test('H1：allow_upload=false 时子用户官方上传拒绝且请求体维持 64 MiB；普通插件不受影响', async () => {
  const subUser = db.createUser('h1-no-upload-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const originalCookie = cookie;
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  cookie = subCookie;
  try {
    // 官方二进制上传：即使带已授权 sessionId 也必须在到达上游前 403。
    const beforeBinary = lastUpstreamUrl;
    const uploadBinary = await gatewayReq('POST', '/api/session/uploadFileBinary?sessionId=session-visible', {
      'content-type': 'application/octet-stream',
    }, 'bytes');
    assert.equal(uploadBinary.status, 403, uploadBinary.body);
    assert.equal(lastUpstreamUrl, beforeBinary, '官方上传在开关关闭时不得到达上游');

    // 官方 fileUploads 上传同样拒绝。
    const fileUpload = await gatewayReq('POST', '/api/fileUploads/upload', { 'content-type': 'application/json' }, '{}');
    assert.equal(fileUpload.status, 403, fileUpload.body);

    // 声明 65 MiB（> 64 MiB 且 ≤ 300 MiB）：请求体上限维持默认档位 → 413。
    const overDefault = await rawRequestBodyProbe('/api/ordinary-plugin/echo', 65 * 1024 * 1024, subCookie);
    assert.equal(overDefault.status, 413, 'allow_upload=false 时 65 MiB 声明必须以 413 拒绝');

    // 普通第三方插件路径不因 upload/git 开关被阻断。
    const ordinary = await gatewayReq('POST', '/api/ordinary-plugin/echo', { 'content-type': 'text/plain' }, 'plain');
    assert.equal(ordinary.status, 200, ordinary.body);
  } finally {
    cookie = originalCookie;
  }
});

test('H1：allow_upload=true 时子用户官方上传放行且请求体提升到 300 MiB', async () => {
  const subUser = db.createUser('h1-upload-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const originalCookie = cookie;
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  cookie = subCookie;
  try {
    const connection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
    try {
      connection.client.send(JSON.stringify({
        type: 'open', streamId: 'h1-upload-baseline', endpoint: 'workspace/follow', payload: { args: {} },
      }));
      assert.equal((await nextFrameOrFail(connection, 'h1 upload baseline')).streamId, 'h1-upload-baseline');
      const uploaded = await gatewayReq('POST', '/api/session/uploadFileBinary?sessionId=session-visible&name=note.txt', {
        'content-type': 'application/octet-stream',
      }, 'bytes');
      assert.equal(uploaded.status, 200, uploaded.body);
      assert.deepEqual(lastRawUploadBody, Buffer.from('bytes'));
    } finally {
      connection.client.close();
    }

    // 声明 65 MiB：allow_upload=true 档位为 300 MiB → 声明的 65 MiB 不再触发 413。
    // 选用子用户会被本地策略立即拒绝的官方 RPC（agent-preset 变更，属代理层在收包前
    // 就返回的 403），因此能区分「请求体分档放行」与「下游策略拒绝」。
    const overDefault = await rawRequestBodyProbe('/api/agentPresets/copy', 65 * 1024 * 1024, subCookie);
    assert.notEqual(overDefault.status, 413, `allow_upload=true 时 65 MiB 声明不应触发 413：${overDefault.status} ${overDefault.body}`);
    assert.equal(overDefault.status, 403, `请求体分档放行后应由下游策略拒绝：${overDefault.status} ${overDefault.body}`);
  } finally {
    cookie = originalCookie;
  }
});

test('H1：allow_git_download=false 时子用户官方 git 与 session.export 拒绝；主用户不变', async () => {
  const subUser = db.createUser('h1-no-git-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, {
    allowedFolders: ['/workspaces/visible'], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [],
    allowedSessionIds: ['session-visible'],
  });
  db.markSessionGrantsSeeded(subUser.id);
  const originalCookie = cookie;
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  cookie = subCookie;
  try {
    for (const target of ['/api/git.clone', '/api/git.pull', '/api/git.fetch']) {
      const before = lastUpstreamUrl;
      const denied = await gatewayReq('POST', target, { 'content-type': 'application/json' }, '{}');
      assert.equal(denied.status, 403, `${target}: ${denied.body}`);
      assert.equal(lastUpstreamUrl, before, `${target} 不得到达上游`);
    }

    // session.export：已授权会话仍被 git 下载开关拒绝（这是归属校验之外的独立通道）。
    const beforeExport = lastUpstreamUrl;
    const exportDenied = await gatewayReq('GET', '/api/session.export?sessionId=session-visible');
    assert.equal(exportDenied.status, 403, exportDenied.body);
    assert.equal(lastUpstreamUrl, beforeExport, 'session.export 不得到达上游');

    // 普通第三方插件路径不因 git 开关被阻断。
    const ordinary = await gatewayReq('POST', '/api/ordinary-plugin/echo', { 'content-type': 'application/json' }, '{}');
    assert.equal(ordinary.status, 200, ordinary.body);

    // 主用户不受 allow_git_download 限制。
    cookie = originalCookie;
    assert.equal((await gatewayReq('POST', '/api/git.clone', { 'content-type': 'application/json' }, '{}')).status, 200);
    assert.equal((await gatewayReq('POST', '/api/git/pull', { 'content-type': 'application/json' }, '{}')).status, 200);
    assert.equal((await gatewayReq('GET', '/api/session.export?sessionId=session-hidden')).status, 200);
  } finally {
    cookie = originalCookie;
  }
});

test('H1：allow_git_download=true 时子用户官方 git 端点正常转发到上游', async () => {
  const fixture = await authorizedSubuserFixture('h1-git-allowed-user', { allowGitDownload: true });
  const originalCookie = cookie;
  try {
    lastUpstreamUrl = '';
    const allowed = await gatewayReq('POST', '/api/git.fetch', { cookie: fixture.cookie, 'content-type': 'application/json' }, '{}');
    assert.equal(allowed.status, 200, allowed.body);
    assert.ok(lastUpstreamUrl.startsWith('/api/git.fetch'), `必须转发到上游：${lastUpstreamUrl}`);
  } finally {
    cookie = originalCookie;
    fixture.connection.client.close();
  }
});

// ── 子用户宿主写/出站探测边界（默认产品面 = 分配的工作区 / 使用权 / 新建会话之外）──
// 网关与 Remote mux 共用 permissions.ts 的同一组硬拒绝端点：settings 写方法与
// llm/discoverModels 对子用户 fail-closed，主用户不经分类、保持正常。

/** 受限子用户的宿主写/出站探测用例统一权限行：允许全部目录、无沙盒、无 SSH。 */
function hostWritePermissions() {
  return {
    allowedFolders: [] as string[], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    banned: false, sandboxMode: null, disabledSessions: [] as string[], allowedSessionIds: [] as string[],
  };
}

const HOST_WRITE_ENDPOINTS = ['settings/mutate', 'settings/update', 'settings/replace', 'llm/discoverModels'] as const;

test('子用户不能写宿主全局 settings 或触发宿主模型发现（HTTP 403 且不触达上游，主用户正常）', async () => {
  const subUser = db.createUser('host-write-http-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, hostWritePermissions());
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;
  const originalCookie = cookie;
  try {
    cookie = subCookie;
    for (const endpoint of HOST_WRITE_ENDPOINTS) {
      const body = JSON.stringify({
        type: 'client-request', rpcId: `host-write-${endpoint.replace('/', '-')}`, method: endpoint,
        payload: { args: endpoint === 'llm/discoverModels'
          ? { settingsNs: 'llm', request: { baseURL: 'http://169.254.169.254/latest' } }
          : { ns: 'llm', patch: { providers: {} } } },
      });
      for (const url of [`/api/${endpoint}`, `/api/${endpoint.replace('/', '.')}`]) {
        const before = lastUpstreamUrl;
        const denied = await gatewayReq('POST', url, { 'content-type': 'application/json' }, body);
        assert.equal(denied.status, 403, `${url}: ${denied.body}`);
        assert.equal(lastUpstreamUrl, before, `${url} 不得触达上游`);
      }
    }
    // 边界按精确方法收紧，不按命名空间/前缀扩散：只读方法与相近方法仍进入官方转发。
    for (const url of ['/api/settings/describe', '/api/settings.describe', '/api/settings/mutateExtra', '/api/llm/listProviders', '/api/llm/listConfigurableProviders']) {
      const before = lastUpstreamUrl;
      const allowed = await gatewayReq('POST', url, { 'content-type': 'application/json' }, '{}');
      assert.equal(allowed.status, 200, `${url}: ${allowed.body}`);
      assert.notEqual(lastUpstreamUrl, before, `${url} 应转发到上游`);
    }
    // 第三方插件自己的同名/相近写方法不被本边界误伤（通用 third-party 面直通）。
    const pluginBefore = lastUpstreamUrl;
    const pluginAllowed = await gatewayReq('POST', '/api/thirdPartyPlugin/mutate', { 'content-type': 'application/json' }, '{}');
    assert.equal(pluginAllowed.status, 200, pluginAllowed.body);
    assert.notEqual(lastUpstreamUrl, pluginBefore, '第三方插件写方法仍按通用面直通');

    // 主用户不受限：同一端点保持正常转发。
    cookie = originalCookie;
    for (const endpoint of HOST_WRITE_ENDPOINTS) {
      const before = lastUpstreamUrl;
      const owner = await gatewayReq('POST', `/api/${endpoint}`, { 'content-type': 'application/json' }, '{}');
      assert.equal(owner.status, 200, `${endpoint}: ${owner.body}`);
      assert.notEqual(lastUpstreamUrl, before, `${endpoint} 主用户应转发到上游`);
    }
  } finally {
    cookie = originalCookie;
  }
});

test('Remote mux：子用户打开宿主写/出站探测流被逐流拒绝且不转发，主用户透明放行', async () => {
  const subUser = db.createUser('host-write-mux-user', '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
  db.setPermissions(subUser.id, hostWritePermissions());
  const subCookie = `dsh_gateway_token=${jwt.sign({ sub: String(subUser.id), username: subUser.username, cv: 0 }, 'test-secret', { expiresIn: '12h' })}`;

  remoteMuxOpenEndpoints = [];
  const subConnection = await openRemoteMux({ cookie: subCookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    for (const endpoint of HOST_WRITE_ENDPOINTS) {
      const streamId = `host-write-${endpoint.replace('/', '-')}`;
      subConnection.client.send(JSON.stringify({ type: 'open', streamId, endpoint, payload: { args: {} } }));
      const frame = await nextFrameOrFail(subConnection, `${endpoint} rejection`);
      assert.equal(frame.type, 'error', `${endpoint}: ${JSON.stringify(frame)}`);
      assert.equal(frame.streamId, streamId, endpoint);
      assert.deepEqual((frame.error as { code?: unknown } | undefined)?.code, 'gateway/forbidden', endpoint);
    }
    assert.equal(subConnection.client.readyState, NodeWebSocket.OPEN, '逐流拒绝不得关闭物理 carrier');
    assert.deepEqual(remoteMuxOpenEndpoints, [], '子用户宿主写/出站探测流不得到达 DSH');
  } finally {
    subConnection.client.close();
  }

  // 主用户不经子用户分类：同一端点由 owner 透明转发放行（到达上游）。
  remoteMuxOpenEndpoints = [];
  const ownerConnection = await openRemoteMux({ cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' });
  try {
    ownerConnection.client.send(JSON.stringify({ type: 'open', streamId: 'host-write-owner', endpoint: 'llm/discoverModels', payload: { args: {} } }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(remoteMuxOpenEndpoints.includes('llm/discoverModels'), true, '主用户端点应透明转发到 DSH');
  } finally {
    ownerConnection.client.close();
  }
});
