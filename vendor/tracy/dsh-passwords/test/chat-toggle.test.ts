// 聊天入口显示偏好：按账号持久化（跨设备同步），默认显示。
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database } from '../src/db.js';
import { createFieldCrypto } from '../src/encrypt.js';

let tempDir = '';
let db: Database;

const keyOf = (userId: number) => `chat_enabled:${String(userId)}`;
const chatEnabledOf = (userId: number) => db.getSetting(keyOf(userId)) !== '0';

before(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-chat-toggle-'));
  db = new Database(path.join(tempDir, 'platform.db'), createFieldCrypto('test-db-key', 'test-setup-key'));
  db.init();
});

after(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test('聊天入口偏好：默认开启、按账号隔离、关闭后可重新开启', () => {
  // 未写入配置即默认显示，避免升级后意外隐藏既有用户的聊天入口。
  assert.equal(chatEnabledOf(1), true);
  assert.equal(chatEnabledOf(2), true);

  db.setSetting(keyOf(1), '0');
  assert.equal(chatEnabledOf(1), false);
  // 用户 1 的设置不得影响用户 2。
  assert.equal(chatEnabledOf(2), true);

  db.setSetting(keyOf(1), '1');
  assert.equal(chatEnabledOf(1), true);
});
