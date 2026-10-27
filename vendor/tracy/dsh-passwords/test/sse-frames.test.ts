import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SseFrameBuffer } from '../src/sse-frames.js';

test('SseFrameBuffer：跨 chunk 的帧在空行到达后才交付', () => {
  const buffer = new SseFrameBuffer(1024);
  assert.deepEqual(buffer.push('data: a'), []);
  assert.deepEqual(buffer.push('\n\ndata: b\n\n'), ['data: a', 'data: b']);
  assert.deepEqual(buffer.push('data: partial'), []);
  assert.deepEqual(buffer.flush(), ['data: partial']);
});

test('SseFrameBuffer：CRLF 空行同样分隔事件', () => {
  const buffer = new SseFrameBuffer(1024);
  assert.deepEqual(buffer.push('data: a\r\n\r\ndata: b\r\n\r\n'), ['data: a', 'data: b']);
});

test('SseFrameBuffer：单个 CRLF 行终止符不会被误认为空行', () => {
  const buffer = new SseFrameBuffer(1024);
  assert.deepEqual(buffer.push('data: first\r\n'), []);
  assert.deepEqual(buffer.push('data: second\r\n\r\n'), ['data: first\r\ndata: second']);
});



test('SseFrameBuffer：裸 CR 空行同样分隔事件', () => {
  const buffer = new SseFrameBuffer(1024);
  assert.deepEqual(buffer.push('data: a\r\rdata: b\r\r'), ['data: a', 'data: b']);
});

test('SseFrameBuffer：混合行终止符的空行同样分隔事件', () => {
  const buffer = new SseFrameBuffer(1024);
  assert.deepEqual(buffer.push('data: a\n\rdata: b\r\n\ndata: c'), ['data: a', 'data: b']);
  assert.deepEqual(buffer.flush(), ['data: c']);
});

test('SseFrameBuffer：跨 chunk 切割的裸 CR 空行定界符仍被识别', () => {
  const buffer = new SseFrameBuffer(1024);
  // 第一段以单个 CR 结尾，第二个 CR 在下个 chunk 到达后才构成空行。
  assert.deepEqual(buffer.push('data: a\r'), []);
  assert.deepEqual(buffer.push('\rdata: b\r\r'), ['data: a', 'data: b']);
});

test('SseFrameBuffer：完整帧不受未终止帧上限影响', () => {
  const buffer = new SseFrameBuffer(8);
  const frame = `data: ${'y'.repeat(64)}`;
  assert.deepEqual(buffer.push(`${frame}\n\n`), [frame]);
});

test('SseFrameBuffer：超限的未终止帧被丢弃并从下一个空行重新同步', () => {
  const buffer = new SseFrameBuffer(64);
  // 未终止帧超过上限：不交付，进入重新同步。
  assert.deepEqual(buffer.push(`data: ${'x'.repeat(200)}`), []);
  assert.deepEqual(buffer.flush(), []);
  // 重新同步丢弃到下一个空行为止，其后的完整帧恢复正常交付。
  assert.deepEqual(buffer.push('\n\ndata: ok\n\n'), ['data: ok']);
});

test('SseFrameBuffer：持续无空行的上游不会让缓冲无界增长', () => {
  const buffer = new SseFrameBuffer(64);
  const chunk = `: ping ${'z'.repeat(32)}\n`;
  // 模拟只发单换行心跳、永不发空行的上游：不应交付任何帧，也不应抛出。
  let delivered: string[] = [];
  for (let index = 0; index < 200; index += 1) {
    delivered = delivered.concat(buffer.push(chunk));
  }
  assert.deepEqual(delivered, []);
  // 超限后进入重新同步，残留的最后一个未终止帧在 flush 时也不再交付。
  assert.deepEqual(buffer.flush(), []);
});

test('SseFrameBuffer：重新同步边界处被切开的裸 CR 空行仍能识别', () => {
  const buffer = new SseFrameBuffer(16);
  // 未终止帧超限进入重新同步。
  assert.deepEqual(buffer.push(`data: ${'x'.repeat(64)}`), []);
  // 重新同步阶段：空行定界符跨越 chunk 边界（先到 CR，再到 CR）。
  assert.deepEqual(buffer.push('\r'), []);
  assert.deepEqual(buffer.push('\rdata: ok\r\r'), ['data: ok']);
});

test('SseFrameBuffer：超限发生在分片边界时按字节累计判定', () => {
  const buffer = new SseFrameBuffer(16);
  assert.deepEqual(buffer.push('data: '), []);
  assert.deepEqual(buffer.push('0123456789'), []);
  assert.deepEqual(buffer.push('abcdefghij'), []); // 累计 27 字节 > 16：丢弃并重新同步
  assert.deepEqual(buffer.push('\n\ndata: next\n\n'), ['data: next']);
});

test('SseFrameBuffer：空 chunk 不影响帧切分', () => {
  const buffer = new SseFrameBuffer(1024);
  assert.deepEqual(buffer.push(''), []);
  assert.deepEqual(buffer.push('data: a'), []);
  assert.deepEqual(buffer.push(''), []);
  assert.deepEqual(buffer.push('\n\n'), ['data: a']);
});
