// 客户端纯函数单测：之前 src/client 完全没有自动化测试，
// 这两个函数是聊天合并与权限保存的核心逻辑，覆盖边界防回归。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeById } from '../src/client/chat.tsx';
import { parseLimit } from '../src/client/card.tsx';

type Msg = Parameters<typeof mergeById>[0];

const msg = (id: number, sender = 1): Msg[number] => ({
  id,
  sender_id: sender,
  sender_name: 'u',
  recipient_id: null,
  content: `m${id}`,
  tags: [],
  created_at: new Date().toISOString(),
});

// ── mergeById（聊天消息合并） ─────────────────────────────────

test('mergeById：无新消息时返回原引用（滚动 effect 不触发，不被拽回底部）', () => {
  const prev = [msg(1), msg(2)];
  assert.equal(mergeById(prev, []), prev);
  assert.equal(mergeById(prev, [msg(1), msg(2)]), prev);
});

test('mergeById：新消息追加 + 升序 + 去重', () => {
  const prev = [msg(1), msg(3)];
  const out = mergeById(prev, [msg(2), msg(3), msg(4)]);
  assert.deepEqual(
    out.map((m) => m.id),
    [1, 2, 3, 4],
  );
});

test('mergeById：保留最近 200 条（截断最旧）', () => {
  const prev = Array.from({ length: 200 }, (_, i) => msg(i + 1));
  const out = mergeById(prev, [msg(201)]);
  assert.equal(out.length, 200);
  assert.equal(out[0].id, 2);
  assert.equal(out[out.length - 1].id, 201);
});

// ── parseLimit（权限限额输入解析） ────────────────────────────

test('parseLimit：空串 = 不限（null）', () => {
  assert.equal(parseLimit(''), null);
  assert.equal(parseLimit('   '), null);
});

test('parseLimit：纯数字正常解析（含前导空白）', () => {
  assert.equal(parseLimit('0'), 0);
  assert.equal(parseLimit('123'), 123);
  assert.equal(parseLimit(' 456 '), 456);
  assert.equal(parseLimit('999999999'), 999999999);
});

test('parseLimit：科学计数/十六进制/小数/负数/超大值一律非法（NaN）', () => {
  for (const v of ['1e3', '0x10', '12.5', '-1', '+5', '99999999999999999999', '1,000']) {
    assert.ok(Number.isNaN(parseLimit(v)), `"${v}" 应判为非法`);
  }
});
