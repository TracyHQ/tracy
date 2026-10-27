import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';

import { AuthService } from '../src/auth.js';
import { Database } from '../src/db.js';
import { createFieldCrypto } from '../src/encrypt.js';
import { createGatewayServer } from '../src/gateway.js';
import type { PlatformConfig } from '../src/config.js';

let appDir: string;
let workspaceDir: string;
let otherWorkspaceDir: string;
let sharedRootDir: string;
let sharedOwnedDir: string;
let sharedForeignDir: string;
let db: Database;
let gateway: http.Server;
let upstream: http.Server;
let gatewayPort = 0;
let adminCookie = '';
let downloadsAllowedCookie = '';
let downloadsDeniedCookie = '';
let bannedCookie = '';
let otherFolderCookie = '';
let sharedOwnerCookie = '';
let sharedPeerCookie = '';
let ordinaryFile = '';
let otherFile = '';
let envFile = '';
let sharedOwnedFile = '';
let sharedForeignFile = '';
let escapeLink: string | null = null;

function request(pathname: string, cookie?: string): Promise<{ status: number; body: Buffer; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: gatewayPort,
      path: pathname,
      headers: cookie === undefined ? {} : { cookie },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

function downloadPath(file: string): string {
  return `/gateway/api/download?path=${encodeURIComponent(file)}`;
}

before(async () => {
  appDir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-download-app-'));
  workspaceDir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-download-workspace-'));
  otherWorkspaceDir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-download-other-'));
  sharedRootDir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-download-shared-'));
  sharedOwnedDir = path.join(sharedRootDir, 'owned');
  sharedForeignDir = path.join(sharedRootDir, 'foreign');
  mkdirSync(sharedOwnedDir);
  mkdirSync(sharedForeignDir);
  mkdirSync(path.join(appDir, 'data'));
  ordinaryFile = path.join(workspaceDir, 'generated.md');
  otherFile = path.join(otherWorkspaceDir, 'other.md');
  envFile = path.join(appDir, '.env');
  sharedOwnedFile = path.join(sharedOwnedDir, 'own.md');
  sharedForeignFile = path.join(sharedForeignDir, 'secret.md');
  const candidateEscapeLink = path.join(workspaceDir, 'escape-link');
  writeFileSync(ordinaryFile, 'ordinary workspace content');
  writeFileSync(otherFile, 'outside subuser allowlist');
  writeFileSync(envFile, 'SETUP_KEY=must-not-download');
  writeFileSync(sharedOwnedFile, 'shared owner own content');
  writeFileSync(sharedForeignFile, 'shared peer private content');

  const dbPath = path.join(appDir, 'data', 'test.db');
  db = new Database(dbPath, createFieldCrypto('testkey', 'testkey'));
  db.init();
  const admin = db.createUser('admin', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
  const allowed = db.createUser('allowed', '$2a$10$dummyhashdummyhashdummyhashdu');
  const denied = db.createUser('denied', '$2a$10$dummyhashdummyhashdummyhashdu');
  const banned = db.createUser('banned', '$2a$10$dummyhashdummyhashdummyhashdu');
  const otherFolder = db.createUser('otherfolder', '$2a$10$dummyhashdummyhashdummyhashdu');
  const sharedOwner = db.createUser('sharedowner', '$2a$10$dummyhashdummyhashdummyhashdu');
  const sharedPeer = db.createUser('sharedpeer', '$2a$10$dummyhashdummyhashdummyhashdu');
  db.setPermissions(allowed.id, {
    allowedFolders: [workspaceDir], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    banned: false, sandboxMode: null,
  });
  db.setPermissions(denied.id, {
    allowedFolders: [workspaceDir], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: false, allowWorkspaceCreate: false,
    banned: false, sandboxMode: null,
  });
  db.setPermissions(banned.id, {
    allowedFolders: [workspaceDir], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    banned: true, sandboxMode: null,
  });
  db.setPermissions(otherFolder.id, {
    allowedFolders: [otherWorkspaceDir], hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
    banned: false, sandboxMode: null,
  });
  // 共享父目录场景：两个子用户都被分配同一父目录，但各自在父目录下自建了
  // 私有 workspace 子树。白名单只到父目录，归属由 user_workspaces 行区分。
  for (const user of [sharedOwner, sharedPeer]) {
    db.setPermissions(user.id, {
      allowedFolders: [sharedRootDir], hourlyTokenLimit: null, dailyMinutesLimit: null,
      allowUpload: true, allowGitDownload: true, allowWorkspaceCreate: false,
      banned: false, sandboxMode: null,
    });
  }
  db.addUserWorkspace(sharedOwner.id, sharedOwnedDir);
  db.addUserWorkspace(sharedPeer.id, sharedForeignDir);
  try {
    symlinkSync(dbPath, candidateEscapeLink);
    escapeLink = candidateEscapeLink;
  } catch {
    // Windows symlink creation needs Developer Mode or elevated privileges. The rest
    // of the path guard suite remains valid on constrained test hosts.
  }

  upstream = http.createServer((_req, res) => res.end());
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = (upstream.address() as { port: number }).port;
  const config: PlatformConfig = {
    setupKey: 'test-setup-key', dbPath, dbEncKey: 'testkey',
    gateway: {
      host: '127.0.0.1', port: 0, upstream: `http://127.0.0.1:${upstreamPort}`,
      tls: null, redirectPort: null, publicHost: '', domain: 'localhost', autoTls: false,
      acmeEmail: '', acmeStaging: false,
    },
    jwtSecret: 'test-secret', internalSecret: 'test-internal',
    patch: { dshRoot: '', restartService: '' },
    endpointRules: [],
  };
  const tokenFor = (user: { id: number; username: string }) =>
    `dsh_gateway_token=${jwt.sign({ sub: String(user.id), username: user.username, cv: 0 }, config.jwtSecret, { expiresIn: '12h' })}`;
  adminCookie = tokenFor(admin);
  downloadsAllowedCookie = tokenFor(allowed);
  downloadsDeniedCookie = tokenFor(denied);
  bannedCookie = tokenFor(banned);
  otherFolderCookie = tokenFor(otherFolder);
  sharedOwnerCookie = tokenFor(sharedOwner);
  sharedPeerCookie = tokenFor(sharedPeer);

  gateway = createGatewayServer(config, new AuthService(config, db), db);
  await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve));
  gatewayPort = (gateway.address() as { port: number }).port;
});

after(() => {
  gateway?.close();
  upstream?.close();
  for (const dir of [appDir, workspaceDir, otherWorkspaceDir, sharedRootDir]) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows file handles are best-effort. */ }
  }
});

test('Issue #15: admin can download ordinary files outside subuser allowlists', async () => {
  const inside = await request(downloadPath(ordinaryFile), adminCookie);
  assert.equal(inside.status, 200);
  assert.equal(inside.body.toString(), 'ordinary workspace content');
  assert.equal(inside.headers['content-length'], String(Buffer.byteLength('ordinary workspace content')));

  const outside = await request(downloadPath(otherFile), adminCookie);
  assert.equal(outside.status, 200);
  assert.equal(outside.body.toString(), 'outside subuser allowlist');
});

test('Issue #15: admin operational access still cannot download sensitive files or symlink escapes', async () => {
  const sensitiveTargets = [path.join(appDir, 'data', 'test.db'), envFile];
  if (escapeLink !== null) sensitiveTargets.push(escapeLink);
  for (const target of sensitiveTargets) {
    const response = await request(downloadPath(target), adminCookie);
    assert.equal(response.status, 403, `${target} must remain protected`);
  }
});

test('Issue #15: subuser download requires both the download grant and folder allowlist', async () => {
  const allowed = await request(downloadPath(ordinaryFile), downloadsAllowedCookie);
  assert.equal(allowed.status, 200);

  const noDownloadGrant = await request(downloadPath(ordinaryFile), downloadsDeniedCookie);
  assert.equal(noDownloadGrant.status, 403);

  const outsideAllowlist = await request(downloadPath(ordinaryFile), otherFolderCookie);
  assert.equal(outsideAllowlist.status, 403);
});

test('Issue #15: banned subusers cannot use the direct download route', async () => {
  const response = await request(downloadPath(ordinaryFile), bannedCookie);
  assert.equal(response.status, 403);
});

test('Issue #15: download requires an authenticated session and regular file', async () => {
  const unauthenticated = await request(downloadPath(ordinaryFile));
  assert.equal(unauthenticated.status, 401);

  const directory = await request(downloadPath(workspaceDir), adminCookie);
  assert.equal(directory.status, 400);

  const missing = await request(downloadPath(path.join(workspaceDir, 'missing.md')), adminCookie);
  assert.equal(missing.status, 404);
});

// 回归：子用户 A 的 allowed_folders 覆盖共享父目录，但同父目录下 B 自建的
// workspace 子树属于 B。download 路由必须与 /api/file 一样做对象级归属校验，
// 不能因为白名单包含父目录就放行 B 的私有文件。
test('Issue #15: subuser cannot download a peer tenant workspace subtree inside a shared allowlisted parent', async () => {
  const leaked = await request(downloadPath(sharedForeignFile), sharedOwnerCookie);
  assert.equal(leaked.status, 403);
  assert.notEqual(leaked.body.toString(), 'shared peer private content');

  const unauthenticated = await request(downloadPath(sharedForeignFile));
  assert.equal(unauthenticated.status, 401);

  const sensitive = await request(downloadPath(envFile), sharedOwnerCookie);
  assert.equal(sensitive.status, 403);
});

test('Issue #15: peer tenant keeps access to its own workspace and its own allowlisted subtree', async () => {
  const owner = await request(downloadPath(sharedForeignFile), sharedPeerCookie);
  assert.equal(owner.status, 200);
  assert.equal(owner.body.toString(), 'shared peer private content');

  const ownSubtree = await request(downloadPath(sharedOwnedFile), sharedOwnerCookie);
  assert.equal(ownSubtree.status, 200);
  assert.equal(ownSubtree.body.toString(), 'shared owner own content');
});
