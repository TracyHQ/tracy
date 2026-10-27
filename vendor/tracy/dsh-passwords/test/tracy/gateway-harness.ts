// A real gateway in front of a fake dsh, for the request-path hooks (H1, H2, H3, H11, H13, H15).
// Built WITHOUT naming a policy, so every case also proves the Tracy layer is the default. The
// fake records every request it received (`request` events: headers whole), so a refusal can
// assert that nothing reached dsh, and every reply goes through `answer` so a case can script it.
// Seats are written straight into the database the way the seat door (H7) leaves them: one row
// with its seat role (so the Tracy store seeds it nothing, TCH #300), grants added as a create
// would add them.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import jwt from 'jsonwebtoken';

import { createGatewayServer } from '../../src/gateway.js';
import { AuthService } from '../../src/auth.js';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import type { PlatformConfig } from '../../src/config.js';
import { withSeatColumns, type SeatColumns } from './seat-columns.js';
import { tracyStoreOf } from '../../src/tracy/persistence.js';

export interface Seen {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface FakeAnswer {
  status?: number;
  headers?: Record<string, string>;
  body: string | Buffer;
  delayMs?: number;
}

export type FakeDsh = (seen: Seen) => FakeAnswer | undefined;

export interface Harness {
  db: Database & SeatColumns;
  port: number;
  /** Every request the fake dsh received, in order. */
  seen: Seen[];
  /** Replace the fake's script; `undefined` from it falls back to `{ ok: true }`. */
  setDsh(script: FakeDsh): void;
  /** How many requests reached the fake on a path (query ignored). */
  reached(pathname: string): number;
  seat(name: string, options?: SeatOptions): Person;
  master(name?: string): Person;
  send(method: string, url: string, who: Person | null, body?: string | Buffer, headers?: Record<string, string>): Promise<Reply>;
  rpc(method: string, args: Record<string, unknown>, who: Person, separator?: '/' | '.'): Promise<Reply>;
  close(): Promise<void>;
}

export interface SeatOptions {
  folders?: string[];
  allowUpload?: boolean;
  allowWorkspaceCreate?: boolean;
  email?: string | null;
  sessions?: string[];
  disabledSessions?: string[];
  /** The role the signed seat grant named (`users.seat_role`); `editor` unless given. */
  role?: string;
}

export interface Person {
  userId: number;
  username: string;
  cookie: string;
}

export interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

const JWT_SECRET = 'harness-jwt-secret';
const DUMMY_HASH = '$2a$10$dummyhashdummyhashdummyhashdu';

const okJson = (value: unknown = { ok: true }): FakeAnswer => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});

/** A dsh RPC answer the way dsh 0.2 writes it. */
export const rpcAnswer = (value: unknown): FakeAnswer => okJson({ type: 'server-response', rpcId: 'r', result: { ok: true, value } });

export async function startHarness(script: FakeDsh = () => undefined, extra: Partial<PlatformConfig> = {}): Promise<Harness> {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-tracy-harness-'));
  // init() attaches the Tracy store (H10); the seat columns read through it, so init comes first.
  const raw = new Database(path.join(tempDir, 'gateway.db'), createFieldCrypto('k', 'k'));
  raw.init();
  const db = withSeatColumns(raw);
  const seen: Seen[] = [];
  let dsh: FakeDsh = script;

  const upstream = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    // The record is taken when the headers arrive: a refused request must not even get that far.
    const row: Seen = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: '' };
    seen.push(row);
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      row.body = Buffer.concat(chunks).toString('utf8');
      const answer = dsh(row) ?? okJson();
      const reply = (): void => {
        if (res.destroyed) return;
        res.writeHead(answer.status ?? 200, answer.headers ?? { 'content-type': 'application/json' });
        res.end(req.method === 'HEAD' ? undefined : answer.body);
      };
      if (answer.delayMs !== undefined) setTimeout(reply, answer.delayMs);
      else reply();
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = (upstream.address() as { port: number }).port;

  const config: PlatformConfig = {
    setupKey: 'setup', dbPath: path.join(tempDir, 'gateway.db'), dbEncKey: 'k',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: `http://127.0.0.1:${upstreamPort}`,
      tls: null, redirectPort: null, publicHost: '', domain: 'localhost', autoTls: false,
      acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: JWT_SECRET, internalSecret: 'internal',
    patch: { dshRoot: '', restartService: '' }, endpointRules: [],
    ...extra,
  };
  const gateway = createGatewayServer(config, new AuthService(config, db), db);
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  const port = (gateway.address() as { port: number }).port;

  const cookieOf = (userId: number, username: string): string =>
    `dsh_gateway_token=${jwt.sign({ sub: String(userId), username, cv: 0 }, JWT_SECRET, { expiresIn: '1h' })}`;

  const send = (method: string, url: string, who: Person | null, body?: string | Buffer, headers: Record<string, string> = {}): Promise<Reply> =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
      const req = http.request({
        host: '127.0.0.1', port, path: url, method,
        headers: {
          origin: `http://127.0.0.1:${port}`,
          ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(payload.length) }),
          ...(who === null ? {} : { cookie: who.cookie }),
          ...headers,
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.end(payload);
    });

  return {
    db,
    port,
    seen,
    setDsh: (next) => { dsh = next; },
    reached: (pathname) => seen.filter((row) => row.url.split('?')[0] === pathname).length,
    seat(name, options = {}) {
      const user = db.createUser(name, DUMMY_HASH, 'user');
      db.setPermissions(user.id, {
        allowedFolders: options.folders ?? ['/site/alpha'],
        hourlyTokenLimit: null, dailyMinutesLimit: null,
        allowUpload: options.allowUpload ?? false, allowGitDownload: false,
        allowWorkspaceCreate: options.allowWorkspaceCreate ?? false,
        allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: options.disabledSessions ?? [],
        allowedSessionIds: options.sessions ?? [],
      });
      tracyStoreOf(db)!.setSeatRole(user.id, options.role ?? 'editor');
      // Granted sessions as the master's admin save writes them (origin `master`, Q1).
      tracyStoreOf(db)!.writeMasterGrants(user.id, options.sessions ?? []);
      if (options.email !== undefined && options.email !== null) db.setUserEmail(user.id, options.email);
      return { userId: user.id, username: name, cookie: cookieOf(user.id, name) };
    },
    master(name = 'root') {
      const user = db.createUser(name, DUMMY_HASH, 'admin');
      return { userId: user.id, username: name, cookie: cookieOf(user.id, name) };
    },
    send,
    rpc: (method, args, who, separator = '/') =>
      send('POST', `/api/${separator === '/' ? method : method.replace('/', '.')}`, who,
        JSON.stringify({ type: 'client-request', rpcId: `rpc-${Math.random()}`, method, payload: { args } })),
    async close() {
      // Open sockets (a request a failed case left behind) must not keep the run alive.
      const closed = Promise.all([gateway, upstream].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
      gateway.closeAllConnections();
      upstream.closeAllConnections();
      await closed;
      db.close();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

/** dsh's workspace.list answer for the given workspaces. */
export function workspaceList(items: Array<{ workspaceId: string; path: string; sessionIds: string[] }>): FakeAnswer {
  return rpcAnswer({
    items: items.map((item) => ({ ...item, title: item.workspaceId, createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z' })),
    archivedSessionIds: [],
  });
}
