// Tracy (TCH E11.b, dev e2e 04/10/2026): `/gateway/api/usage/report` allowed ONE report per user per
// 5 s, while every mounted TokenReporter (`client/token.tsx`) flushes on its own 15 s timer and once
// more when it unmounts. Two reporters of one seat — two tabs, or a conversation view remounting —
// landed inside the same 5 s and one got 429 on every tick: ten 429s on cowork.tracy.site in one
// EmDash chat turn, four in a row 15 s apart; three within 25 ms on the local rc2 stand. The reports
// were retried, so nothing was lost, but every one was a browser error. The limit is now a small
// bucket: the same average ceiling, room for a few reporters of one seat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUsageReportLimiter } from '../../src/tracy/usage-report-limit.ts';

test('K4: two reporters of one seat, 15 s apart each and 1 s apart from each other, are never refused', () => {
  const limit = createUsageReportLimiter();
  for (let tick = 0; tick < 40; tick += 1) {
    const at = tick * 15_000;
    assert.equal(limit.take(7, at), true, `reporter A, tick ${tick}`);
    assert.equal(limit.take(7, at + 1_000), true, `reporter B, tick ${tick}`);
  }
});

test('K4: three reporters flushing in the same instant (a remount) all land', () => {
  const limit = createUsageReportLimiter();
  assert.equal(limit.take(7, 1_000), true);
  assert.equal(limit.take(7, 1_010), true);
  assert.equal(limit.take(7, 1_025), true);
});

test('K4: a flood is still held to one report per 5 s on average, per user', () => {
  const limit = createUsageReportLimiter();
  let accepted = 0;
  for (let at = 0; at < 60_000; at += 100) if (limit.take(7, at)) accepted += 1;
  // The burst, then one per 5 s for the rest of the minute.
  assert.ok(accepted <= 4 + 12, `accepted ${accepted}`);
  assert.ok(accepted >= 12, `accepted ${accepted}`);
  // Another user has a bucket of their own.
  assert.equal(limit.take(8, 59_000), true);
});

test('K4: forget empties a user\'s bucket record; sweep drops buckets idle for an hour', () => {
  const limit = createUsageReportLimiter();
  for (let i = 0; i < 10; i += 1) limit.take(7, 0);
  assert.equal(limit.take(7, 0), false);
  limit.forget(7);
  assert.equal(limit.take(7, 0), true);
  limit.take(9, 0);
  limit.sweep(3_600_001);
  assert.equal(limit.entries.has(9), false);
  assert.equal(limit.entries.has(7), false);
});
