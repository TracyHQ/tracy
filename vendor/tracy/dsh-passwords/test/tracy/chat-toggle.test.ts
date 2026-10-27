// 聊天入口显示偏好：按账号持久化（跨设备同步），默认隐藏。
//
// 这个文件从前自己抄了一份规则（`getSetting(key) !== '0'`），于是它检验的是抄下来的那份，
// 不是服务端跑的那份——真规则改了它照样绿。现在它 import `chatEntryEnabled`，也就是
// `/api/dsh-passwords/state` 回给面板的同一个函数。
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
// Hook H9: plugin.ts exports the rule its `/api/dsh-passwords/state` answer reads.
import { chatEntryEnabled } from '../../src/plugin.js';

let tempDir = '';
let db: Database;

const keyOf = (userId: number) => `chat_enabled:${String(userId)}`;

before(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-chat-toggle-'));
  db = new Database(path.join(tempDir, 'platform.db'), createFieldCrypto('test-db-key', 'test-setup-key'));
  db.init();
});

after(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test('K6: 聊天入口偏好：默认关闭、按账号隔离、开启后可再关闭', () => {
  // 未写入配置即隐藏：新座位一进来不该多出一个谁也没要过的浮动气泡。
  assert.equal(chatEntryEnabled(db, 1), false);
  assert.equal(chatEntryEnabled(db, 2), false);

  db.setSetting(keyOf(1), '1');
  assert.equal(chatEntryEnabled(db, 1), true);
  // 用户 1 的设置不得影响用户 2。
  assert.equal(chatEntryEnabled(db, 2), false);

  db.setSetting(keyOf(1), '0');
  assert.equal(chatEntryEnabled(db, 1), false);
});

test('K6: “没设置过”和“设成关”落在同一边', () => {
  // 这一条是默认值的定义本身。写成 `!== '0'` 时它是红的：那种写法下，默认值取决于
  // 有没有人碰过开关，而不是取决于我们决定了什么。
  assert.equal(chatEntryEnabled(db, 99), chatEntryEnabled(db, 1));
  db.setSetting(keyOf(98), '0');
  assert.equal(chatEntryEnabled(db, 98), chatEntryEnabled(db, 99));
});
