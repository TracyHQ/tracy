// 聊天媒体数据层回归测试（本轮新增）：
//   - 上传生命周期：pending → ready / failed、同一 ID 不可重复占用
//   - 按 owner/ready/未过期 查询、占用判定
//   - 安全消息投影（任务书 #5：不泄露 storage_key/sha256，只返回 ready 且未过期）
//   - addMessageWithMedia 的事务原子性（失败全回滚）
//   - deleteUser 级联 + 消息历史修剪 + 过期/pending 清理返回 storage keys
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { Database, MediaError, MEDIA_IN_USE } from '../src/db.js';
import { createFieldCrypto } from '../src/encrypt.js';

const HASH = '$2a$10$dummyhashdummyhashdummyhashdu';

function withDb(
  fn: (db: Database, dir: string) => void,
  options: { legacyMessageMedia?: boolean } = {},
): void {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-media-'));
  const dbPath = path.join(tempDir, 'media.db');
  if (options.legacyMessageMedia) {
    const raw = new DatabaseSync(dbPath);
    raw.exec(`
      CREATE TABLE message_media (
        message_id INTEGER NOT NULL,
        media_id   TEXT    NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        caption    TEXT,
        PRIMARY KEY (message_id, media_id)
      );
      CREATE INDEX idx_message_media_media ON message_media(media_id);
      INSERT INTO message_media (message_id, media_id, sort_order) VALUES (1, 'dup', 0);
      INSERT INTO message_media (message_id, media_id, sort_order) VALUES (2, 'dup', 1);
    `);
    raw.close();
  }
  const db = new Database(dbPath, createFieldCrypto('test-key', 'test-key'));
  try {
    db.init();
    fn(db, tempDir);
  } finally {
    try {
      db.close();
    } catch {
      /* 用例内已关闭（重开断言） */
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function addPending(
  db: Database,
  id: string,
  ownerId: number,
  expiresAt?: string | null,
): void {
  const result = db.addMediaAsset({
    id,
    ownerId,
    storageKey: '',
    originalName: 'cat.png',
    kind: 'image',
    mimeType: 'image/png',
    byteSize: 1024,
    sha256: '',
    state: 'pending',
    expiresAt: expiresAt ?? null,
  });
  assert.equal(result.created, true, `pending 资产 ${id} 应创建成功`);
}

test('媒体生命周期：pending → ready，同一 ID/存储键不可重复占用', () => {
  withDb((db) => {
    const user = db.createUser('media-owner', HASH);
    addPending(db, 'm-1', user.id);

    assert.equal(db.getMediaAsset('m-1')?.state, 'pending', 'pending 不是可用状态');
    assert.equal(db.mediaOwnedByUser('m-1', user.id), false, 'pending 不得被视作可用媒体');

    const ready = db.finalizeMediaAsset('m-1', {
      storageKey: 'objects/m-1.bin',
      sha256: 'a'.repeat(64),
      byteSize: 2048,
      mimeType: 'image/png',
      width: 640,
      height: 480,
    });
    assert.equal(ready?.state, 'ready');
    assert.equal(ready?.byte_size, 2048);
    assert.equal(ready?.width, 640);
    assert.equal(db.mediaOwnedByUser('m-1', user.id), true);
    assert.equal(db.mediaOwnedByUser('m-1', user.id + 1), false, '跨用户不得视为可用');

    // 已 ready 的资产不能被二次改写（防止指向别的文件）
    assert.equal(
      db.finalizeMediaAsset('m-1', { storageKey: 'objects/other.bin', sha256: 'b'.repeat(64) }),
      null,
      'ready 资产不得再次 finalize',
    );
    assert.equal(db.getMediaAssetFile('m-1')?.storage_key, 'objects/m-1.bin');

    // 同一 upload ID 重复占用：不覆盖旧行
    const again = db.addMediaAsset({
      id: 'm-1', ownerId: user.id, storageKey: 'objects/hijack.bin', originalName: 'x',
      kind: 'image', mimeType: 'image/png', byteSize: 10, sha256: 'c', state: 'ready',
    });
    assert.equal(again.created, false, '同一 media ID 不得重复插入');
    assert.equal(db.getMediaAssetFile('m-1')?.storage_key, 'objects/m-1.bin', '旧行不得被覆盖');

    // 同一存储键被另一 media ID 复用：也拒绝
    const reused = db.addMediaAsset({
      id: 'm-2', ownerId: user.id, storageKey: 'objects/m-1.bin', originalName: 'x',
      kind: 'image', mimeType: 'image/png', byteSize: 10, sha256: 'c', state: 'ready',
    });
    assert.equal(reused.created, false, '同一存储键不得被两个资产共用');
    assert.equal(db.getMediaAsset('m-2'), null);
  });
});

test('媒体生命周期：pending → failed；按 owner/ready/未过期 查询与占用判定', () => {
  withDb((db) => {
    const owner = db.createUser('owner', HASH);
    const other = db.createUser('other', HASH);
    addPending(db, 'm-failed', owner.id);
    assert.equal(db.markMediaFailed('m-failed')?.state, 'failed');
    assert.equal(db.markMediaFailed('m-failed'), null, '非 pending 不得再次迁移');
    assert.equal(db.mediaOwnedByUser('m-failed', owner.id), false, 'failed 不可用');

    addPending(db, 'm-expired', owner.id, '2000-01-01T00:00:00.000Z');
    db.finalizeMediaAsset('m-expired', { storageKey: 'objects/expired.bin', sha256: 'd', byteSize: 10 });
    assert.equal(db.mediaOwnedByUser('m-expired', owner.id), false, '过期媒体不可用');

    addPending(db, 'm-live', owner.id);
    db.finalizeMediaAsset('m-live', { storageKey: 'objects/live.bin', sha256: 'e', byteSize: 10 });
    addPending(db, 'm-other', other.id);
    db.finalizeMediaAsset('m-other', { storageKey: 'objects/other.bin', sha256: 'f', byteSize: 10 });

    assert.deepEqual(
      db.listMediaForUser(owner.id).map((row) => row.id),
      ['m-live'],
      '列表只返回自己的 ready 且未过期资产',
    );
    assert.deepEqual(db.listMediaForUser(owner.id, 'image').map((r) => r.id), ['m-live']);
    assert.deepEqual(db.listMediaForUser(owner.id, 'video'), [], '按类型过滤不得串类型');

    assert.equal(db.mediaAttachedToAnyMessage('m-live'), false);
    assert.equal(db.mediaMessageId('m-live'), null);

    // 未占用资产可删除，返回待删 storage keys
    assert.deepEqual(db.deleteMediaAsset('m-live'), {
      media_ids: ['m-live'],
      storage_keys: ['objects/live.bin'],
    });
    assert.equal(db.getMediaAsset('m-live'), null);
    assert.deepEqual(db.drainPendingMediaRemovals(), ['objects/live.bin'], '删除元数据时必须保留文件回收凭证');
    assert.throws(() => db.deleteMediaAsset('m-live'), (error: unknown) => (error as MediaError).code === 'MEDIA_NOT_FOUND');
  });
});

test('上传配额统计：只计未绑定资产（ready 未挂消息 + pending），已发送/失败/过期/他人不计', () => {
  withDb((db) => {
    const owner = db.createUser('quota-owner', HASH);
    const other = db.createUser('quota-other', HASH);

    const ready = (id: string, ownerId: number): void => {
      addPending(db, id, ownerId);
      db.finalizeMediaAsset(id, { storageKey: `objects/${id}.bin`, sha256: id, byteSize: 10 });
    };

    // pending（已签发但未 PUT）计入：堵住只 init 不 PUT 绕过配额
    addPending(db, 'q-pending', owner.id);
    // 未绑定的 ready 计入
    ready('q-ready', owner.id);
    // 已发送（挂到消息上）不计入：否则正常聊天会逐步耗尽配额
    ready('q-bound', owner.id);
    db.addMessageWithMedia({ senderId: owner.id, recipientId: other.id, content: '', tags: [], mediaIds: ['q-bound'] });
    // failed / 过期 / 他人的资产都不计入
    addPending(db, 'q-failed', owner.id);
    db.markMediaFailed('q-failed');
    addPending(db, 'q-expired', owner.id, '2000-01-01T00:00:00.000Z');
    db.finalizeMediaAsset('q-expired', { storageKey: 'objects/q-expired.bin', sha256: 'x', byteSize: 10 });
    ready('q-other', other.id);

    assert.equal(db.countUnboundMediaForUser(owner.id), 2, '只统计自己的未绑定（pending + ready 未挂消息）资产');
    assert.equal(db.countUnboundMediaForUser(other.id), 1, '不串用户，且已绑定资产不计入');

    // 未绑定资产减少后配额随之释放：pending 转 failed、ready 挂到消息上
    db.markMediaFailed('q-pending');
    db.addMessageWithMedia({ senderId: owner.id, recipientId: other.id, content: '', tags: [], mediaIds: ['q-ready'] });
    assert.equal(db.countUnboundMediaForUser(owner.id), 0, '未绑定资产发送/失败后不再占配额');
  });
});

test('addMessageWithMedia：事务原子，失败全回滚且消息投影不泄露内部字段', () => {
  withDb((db) => {
    const sender = db.createUser('sender', HASH);
    const recipient = db.createUser('recipient', HASH);
    const stranger = db.createUser('stranger', HASH);

    addPending(db, 'ok-1', sender.id);
    db.finalizeMediaAsset(db.listMediaForUser(sender.id).length ? 'ok-1' : 'ok-1', {
      storageKey: 'objects/ok-1.bin', sha256: 'g', byteSize: 100, mimeType: 'image/png', width: 10, height: 20,
    });

    const message = db.addMessageWithMedia({
      senderId: sender.id,
      recipientId: recipient.id,
      content: '图片消息',
      tags: ['media'],
      mediaIds: ['ok-1'],
      mediaCaptions: ['说明'],
    });
    assert.equal(message.media.length, 1);
    const media = message.media[0]!;
    assert.deepEqual(Object.keys(media).sort(), [
      'byte_size', 'caption', 'duration_ms', 'height', 'id', 'kind', 'mime_type', 'original_name', 'sort_order', 'width',
    ]);
    assert.equal('storage_key' in (media as unknown as Record<string, unknown>), false, '消息投影不得泄露 storage_key');
    assert.equal('sha256' in (media as unknown as Record<string, unknown>), false, '消息投影不得泄露 sha256');
    assert.equal(media.caption, '说明');
    assert.equal(db.mediaAttachedToAnyMessage('ok-1'), true);
    assert.equal(db.mediaMessageId('ok-1'), message.id);

    // 已被占用的媒体不得再绑定
    assert.throws(
      () => db.addMessageWithMedia({ senderId: sender.id, recipientId: null, content: 'again', tags: [], mediaIds: ['ok-1'] }),
      (error: unknown) => (error as MediaError).code === MEDIA_IN_USE,
    );

    // 别人的媒体：拒绝，且整条消息不得落库
    addPending(db, 'foreign', stranger.id);
    db.finalizeMediaAsset('foreign', { storageKey: 'objects/foreign.bin', sha256: 'h', byteSize: 10 });
    const before = db.listMessagesForUser(sender.id, 500).length;
    assert.throws(
      () => db.addMessageWithMedia({ senderId: sender.id, recipientId: null, content: 'steal', tags: [], mediaIds: ['foreign'] }),
      (error: unknown) => (error as MediaError).code === 'MEDIA_NOT_OWNED',
    );
    assert.equal(db.listMessagesForUser(sender.id, 500).length, before, '校验失败必须整条回滚');

    // 不存在 / 未就绪 / 已过期 的媒体同样拒绝且回滚
    addPending(db, 'pending-1', sender.id);
    addPending(db, 'expired-1', sender.id, '2000-01-01T00:00:00.000Z');
    db.finalizeMediaAsset('expired-1', { storageKey: 'objects/expired-1.bin', sha256: 'i', byteSize: 10 });
    for (const [id, code] of [
      ['ghost', 'MEDIA_NOT_FOUND'],
      ['pending-1', 'MEDIA_NOT_READY'],
      ['expired-1', 'MEDIA_EXPIRED'],
    ] as const) {
      assert.throws(
        () => db.addMessageWithMedia({ senderId: sender.id, recipientId: null, content: `bad-${id}`, tags: [], mediaIds: [id] }),
        (error: unknown) => (error as MediaError).code === code,
        `${id} 必须以 ${code} 拒绝`,
      );
    }
    assert.equal(db.listMessagesForUser(sender.id, 500).length, before, '所有失败分支都不得留下消息');

    // 纯媒体消息：空文本 + 附件；接收方可见且能看到媒体元数据
    const asRecipient = db.listMessagesForUser(recipient.id, 500).find((m) => m.id === message.id);
    assert.equal(asRecipient?.media.length, 1, '接收方应看到附件元数据');

    // 旧文本入口语义不变
    const legacy = db.addMessage(sender.id, null, 'hello', ['t']);
    assert.deepEqual(legacy.media, []);
    assert.equal(typeof legacy.id, 'number');
  });
});

test('消息历史修剪与 clearMessages 清理关系及不再被引用的资产', () => {
  withDb((db) => {
    const user = db.createUser('pruner', HASH);
    addPending(db, 'old', user.id);
    db.finalizeMediaAsset('old', { storageKey: 'objects/old.bin', sha256: 'j', byteSize: 10 });
    const first = db.addMessageWithMedia({
      senderId: user.id, recipientId: null, content: 'oldest', tags: [], mediaIds: ['old'],
    });
    assert.equal(db.listMessageMediaIds(first.id).length, 1);

    // 修剪阀值：保留最新 MESSAGES_MAX_ROWS(2000) 条，每 100 条写入触发一次。
    // 灌到超过窗口后，最旧的带媒体消息应被连带清理（多灌 100 条保证触发点已过）。
    for (let i = 0; i < 2100; i += 1) db.addMessage(user.id, null, `filler-${i}`, []);

    const raw = (db as unknown as { db: DatabaseSync }).db;
    const remaining = Number((raw.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number }).n);
    assert.ok(remaining <= 2101, `修剪应保持消息数有界（实际 ${remaining}）`);
    assert.equal(db.getMessageForUser(first.id, user.id), null, '最旧消息应被修剪');
    assert.equal(db.getMediaAssetFile('old'), null, '不再被引用的资产应被回收');
    assert.equal(db.listMessageMediaIds(first.id).length, 0, '修剪后关系行必须一并清理');

    const cleared = db.clearMessages();
    assert.deepEqual(cleared.media_ids, []);
    assert.equal(db.listMessagesForUser(user.id, 500).length, 0, 'clearMessages 清空历史');
  });
});

test('过期/pending 清理返回待删 storage keys，被占用的资产不清理', () => {
  withDb((db) => {
    const user = db.createUser('gc', HASH);
    addPending(db, 'expired-free', user.id, '2000-01-01T00:00:00.000Z');
    db.finalizeMediaAsset('expired-free', { storageKey: 'objects/expired-free.bin', sha256: 'k', byteSize: 10 });
    addPending(db, 'stale-expired', user.id, '2000-01-01T00:00:00.000Z');
    db.finalizeMediaAsset('stale-expired', { storageKey: 'objects/stale.bin', sha256: 'l', byteSize: 10 });
    addPending(db, 'stale-pending', user.id);
    // 被占用的媒体必须能正常绑定（过期也只拦截新的绑定）
    addPending(db, 'held-live', user.id);
    db.finalizeMediaAsset('held-live', { storageKey: 'objects/held-live.bin', sha256: 'm', byteSize: 10 });
    const kept = db.addMessageWithMedia({
      senderId: user.id, recipientId: null, content: 'held', tags: [], mediaIds: ['held-live'],
    });
    assert.ok(kept.media.length > 0);

    const plan = db.pruneMedia({ pendingCutoff: new Date(Date.now() + 60_000) });
    assert.deepEqual(plan.media_ids.sort(), ['expired-free', 'stale-expired', 'stale-pending']);
    assert.deepEqual(plan.storage_keys.sort(), [
      '__pending__:stale-pending',
      'objects/expired-free.bin',
      'objects/stale.bin',
    ]);
    assert.deepEqual(
      db.drainPendingMediaRemovals().sort(),
      ['objects/expired-free.bin', 'objects/stale.bin'],
      'pruneMedia 提交元数据删除时必须保留文件回收凭证，且忽略占位键',
    );
    assert.equal(db.getMediaAsset('held-live')?.id, 'held-live', '被消息占用的资产保留');
    assert.equal(db.listMessageMediaIds(kept.id).length, 1, '已绑定媒体仍可正常展示');

    // 删除被占用的媒体必须被拒绝（避免消息引用悬空）
    assert.throws(
      () => db.deleteMediaAsset('held-live'),
      (error: unknown) => (error as MediaError).code === MEDIA_IN_USE,
    );

    // 孤儿关系清理（历史库/异常中断残留）
    const raw = (db as unknown as { db: DatabaseSync }).db;
    raw.exec("INSERT INTO message_media (message_id, media_id, sort_order) VALUES (999999, 'ghost-media', 0)");
    assert.equal(db.pruneOrphanedMessageMedia(), 1);
    assert.equal(db.mediaAttachedToAnyMessage('ghost-media'), false);
  });
});

test('deleteUser 级联清理媒体元数据与消息关系，并给出待删 storage keys', () => {
  withDb((db) => {
    const gone = db.createUser('gone', HASH);
    const keeper = db.createUser('keeper', HASH);
    addPending(db, 'gone-media', gone.id);
    db.finalizeMediaAsset('gone-media', { storageKey: 'objects/gone.bin', sha256: 'm', byteSize: 10 });
    addPending(db, 'keeper-media', keeper.id);
    db.finalizeMediaAsset('keeper-media', { storageKey: 'objects/keeper.bin', sha256: 'n', byteSize: 10 });

    const goneMessage = db.addMessageWithMedia({
      senderId: gone.id, recipientId: keeper.id, content: 'bye', tags: [], mediaIds: ['gone-media'],
    });
    db.addMessageWithMedia({
      senderId: keeper.id, recipientId: null, content: 'keep', tags: [], mediaIds: ['keeper-media'],
    });

    const plan = db.peekUserMediaRemoval(gone.id);
    assert.deepEqual(plan.media_ids, ['gone-media']);
    assert.deepEqual(plan.storage_keys, ['objects/gone.bin']);

    db.deleteUser(gone.id);
    assert.equal(db.getMediaAsset('gone-media'), null, '删除用户必须级联清理其媒体元数据');
    assert.equal(db.listMessageMediaIds(goneMessage.id).length, 0, '消息关系必须一并清理');
    assert.equal(db.mediaAttachedToAnyMessage('gone-media'), false, '不得留下孤儿关系阻断后续 GC');
    assert.equal(db.getMediaAssetFile('keeper-media')?.storage_key, 'objects/keeper.bin', '他人媒体不受影响');
    assert.equal(db.getUserById(gone.id), null);
    assert.deepEqual(db.listMediaForUser(keeper.id).map((r) => r.id), ['keeper-media']);
  });
});

test('旧库非唯一 message_media 索引会被去重并升级为 UNIQUE', () => {
  withDb(
    (db) => {
      const raw = (db as unknown as { db: DatabaseSync }).db;
      const indexes = raw.prepare('PRAGMA index_list(message_media)').all() as { name: string; unique: number }[];
      const unique = indexes.find((idx) => idx.name === 'idx_message_media_media' && idx.unique === 1);
      assert.ok(unique, '迁移后必须存在 UNIQUE 索引');
      const rows = (raw.prepare('SELECT message_id, media_id FROM message_media ORDER BY rowid').all() as {
        message_id: number; media_id: string;
      }[]).map((row) => ({ message_id: Number(row.message_id), media_id: String(row.media_id) }));
      assert.deepEqual(rows, [{ message_id: 1, media_id: 'dup' }], '重复关系只保留最早一条');
      assert.equal(typeof db.pruneMedia, 'function');
    },
    { legacyMessageMedia: true },
  );
});

test('媒体参数校验：非法 ID/MIME/大小/状态一律拒绝', () => {
  withDb((db) => {
    const user = db.createUser('validator', HASH);
    const base = {
      id: 'v-1', ownerId: user.id, storageKey: 'objects/v.bin', originalName: 'a.png',
      kind: 'image' as const, mimeType: 'image/png', byteSize: 100, sha256: 'o',
    };
    assert.throws(() => db.addMediaAsset({ ...base, id: '' }), MediaError);
    assert.throws(() => db.addMediaAsset({ ...base, id: 'x'.repeat(200) }), MediaError);
    assert.throws(() => db.addMediaAsset({ ...base, mimeType: 'not-a-mime' }), MediaError);
    assert.throws(() => db.addMediaAsset({ ...base, byteSize: 0 }), MediaError);
    assert.throws(() => db.addMediaAsset({ ...base, byteSize: 10 * 1024 * 1024 * 1024 }), MediaError);
    assert.throws(
      () => db.addMediaAsset({ ...base, state: 'weird' as unknown as 'ready' }),
      MediaError,
    );
    assert.throws(() => db.addMediaAsset({ ...base, storageKey: 'objects/../escape.bin' }), MediaError);
    assert.throws(
      () => db.addMessageWithMedia({ senderId: user.id, recipientId: null, content: 'x', tags: [], mediaIds: ['', 'a'] }),
      MediaError,
    );
    assert.throws(
      () => db.addMessageWithMedia({
        senderId: user.id, recipientId: null, content: 'x', tags: [],
        mediaIds: Array.from({ length: 11 }, (_, i) => `id-${i}`),
      }),
      MediaError,
    );
    // 纯文本路径不受影响
    assert.equal(db.addMessage(user.id, null, 'plain', []).media.length, 0);
  });
});
