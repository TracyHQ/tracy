import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

import { AuthService } from '../src/auth.js';
import { Database } from '../src/db.js';
import { createFieldCrypto } from '../src/encrypt.js';
import type { PlatformConfig } from '../src/config.js';
import { ADMIN_REQUEST_BODY_BYTES, DEFAULT_USER_REQUEST_BODY_BYTES, requestBodyLimitFor } from '../src/gateway.js';

test('Issue #23: 请求体上限按角色和大请求体权限分档', () => {
  assert.equal(DEFAULT_USER_REQUEST_BODY_BYTES, 64 * 1024 * 1024);
  assert.equal(ADMIN_REQUEST_BODY_BYTES, 300 * 1024 * 1024);
  assert.equal(requestBodyLimitFor('user', false), DEFAULT_USER_REQUEST_BODY_BYTES);
  assert.equal(requestBodyLimitFor('user', true), ADMIN_REQUEST_BODY_BYTES);
  assert.equal(requestBodyLimitFor('admin', false), ADMIN_REQUEST_BODY_BYTES);
});

test('新增子用户默认 allowed_agent_presets 为 NULL（不限制 Agent preset）', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-preset-perms-'));
  const dbPath = path.join(tempDir, 'test.db');
  const crypto = createFieldCrypto('test-key', 'test-key');
  const db = new Database(dbPath, crypto);
  try {
    db.init();
    const config: PlatformConfig = {
      setupKey: 'test-setup-key', dbPath, dbEncKey: 'test-key',
      gateway: {
        host: '127.0.0.1', port: 0, upstream: 'http://127.0.0.1:3080',
        tls: null, redirectPort: null, publicHost: '', domain: 'localhost', autoTls: false,
        acmeEmail: '', acmeStaging: false,
      },
      jwtSecret: 'test-secret', internalSecret: 'test-internal',
      patch: { dshRoot: '', restartService: '' },
      endpointRules: [],
    };
    const auth = new AuthService(config, db);
    const admin = db.createUser('admin', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');

    await auth.addSubUser(
      { userId: admin.id, username: admin.username, role: 'admin' },
      'new-subuser',
      'ValidPassword!123',
    );

    const user = db.getUserByUsername('new-subuser');
    assert.ok(user, '子用户应已创建');
    const perms = db.getPermissions(user.id);
    assert.equal(perms?.allowed_agent_presets, null, '新子用户默认不限制 Agent preset（工作区授权后可用会话）');
    assert.equal(perms?.allow_upload, false, '新子用户默认使用 64 MiB 请求体档位');

    // 显式 [] 仍表示「禁止全部」：管理员在权限面板取消勾选全部 preset 后必须保持禁止。
    db.setPermissions(user.id, {
      allowedFolders: ['/work'],
      hourlyTokenLimit: null,
      dailyMinutesLimit: null,
      allowUpload: true,
      allowGitDownload: false,
      allowWorkspaceCreate: false,
      allowedAgentPresets: [],
      banned: false,
      sandboxMode: null,
      disabledSessions: [],
    });
    assert.deepEqual(db.getPermissions(user.id)?.allowed_agent_presets, [], '显式 [] 必须保留禁止全部语义');

    // 非空数组仍为白名单。
    db.setPermissions(user.id, {
      allowedFolders: ['/work'],
      hourlyTokenLimit: null,
      dailyMinutesLimit: null,
      allowUpload: true,
      allowGitDownload: false,
      allowWorkspaceCreate: false,
      allowedAgentPresets: ['preset-alpha'],
      banned: false,
      sandboxMode: null,
      disabledSessions: [],
    });
    assert.deepEqual(db.getPermissions(user.id)?.allowed_agent_presets, ['preset-alpha'], '非空数组必须保留白名单语义');

    // 显式 NULL 仍表示不限制。
    db.setPermissions(user.id, {
      allowedFolders: ['/work'],
      hourlyTokenLimit: null,
      dailyMinutesLimit: null,
      allowUpload: true,
      allowGitDownload: false,
      allowWorkspaceCreate: false,
      allowedAgentPresets: null,
      banned: false,
      sandboxMode: null,
      disabledSessions: [],
    });
    assert.equal(db.getPermissions(user.id)?.allowed_agent_presets, null, '显式 NULL 必须保留不限制语义');
  } finally {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});