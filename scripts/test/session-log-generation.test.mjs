/**
 * The three session readers (`scripts/measure/session-metrics.mjs`, `scripts/agent-turn-cost.mjs`,
 * `scripts/e2e/wp-business.mjs`) after dsh 0.1.7 introduced session format V4.
 *
 * WHY. dsh 0.1.7 converts a session on its first write open: it writes `session.v4.jsonl.zstd` BESIDE
 * the untouched `session.v3.jsonl.zstd`, and only V4 grows from then on. The readers were pinned to
 * the V3 name, so after the upgrade they would keep reporting the history as it stood before it,
 * with no error. And a V4 tool result carries `isError` on its `role: 'tool'` message, not on a
 * `tool-result` block, so the flag would read zero.
 *
 * Fixtures are built the way `scripts/test/session-v4-audit.test.mjs` builds them: one Zstandard
 * frame for the header, one per append batch. The V3 rows follow the released V3 shapes (a
 * user-role `tool/result` wrapping one `tool-result` block); the V4 rows are what the rc.2 catalog
 * produces from them (measured 26/09), plus a second turn written natively. The assertions hold
 * whether or not the rc.2 catalog is importable — only the last test needs it, and skips without it.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { zstdCompressSync } from 'node:zlib'

import { loadCatalog } from '../session-v4-audit.mjs'

const HOME = mkdtempSync(path.join(tmpdir(), 'session-log-generation-'))
process.env.TRACY_DSH_HOME = HOME
// Imported after the environment is set: `session-metrics.mjs` reads `TRACY_DSH_HOME` on load.
const metrics = await import('../measure/session-metrics.mjs')
const TURN_COST = path.join(import.meta.dirname, '..', 'agent-turn-cost.mjs')

const line = (value) => `${JSON.stringify(value)}\n`
const step1 = { turn: 1, step: 1 }
const step2 = { turn: 2, step: 1 }
const HEADER = {
  type: 'session',
  id: 'session-g',
  createdAt: 1,
  cwd: '/site/demo',
  isSeeded: false,
  delegationDepth: 0,
  agentPreset: 'designer-wordpress'
}
const assistant = (step, callId, action) => ({
  type: 'assistant/message',
  surfaceOp: 'append',
  data: {
    ...step,
    stream: [],
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 100 },
    message: {
      id: `a-${callId}`,
      role: 'assistant',
      source: { kind: 'model', provider: 'mock', model: 'mock' },
      content: [{ type: 'tool-call', id: callId, name: 'tracy_site', arguments: `{"action":"${action}"}` }]
    }
  }
})
const call = (step, callId, action) => ({
  type: 'tool/call',
  data: { ...step, callId, name: 'tracy_site', arguments: `{"action":"${action}"}` }
})

/** Turn 1 as V3 stores it: the result is flagged `isError` and its payload says nothing about `ok`. */
const V3_TURN_1 = [
  { type: 'turn/start', data: { turn: 1 } },
  { type: 'step/start', data: step1 },
  {
    type: 'user/message',
    surfaceOp: 'append',
    data: { id: 'm1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] }
  },
  {
    type: 'request/header',
    data: { reason: 'initial', header: { config: { provider: 'mock', model: 'mock' } } }
  },
  assistant(step1, 'c1', 'content.list'),
  call(step1, 'c1', 'content.list'),
  {
    type: 'tool/result',
    surfaceOp: 'append',
    data: {
      ...step1,
      message: {
        id: 'tool-result-c1',
        role: 'user',
        source: { kind: 'tool', callId: 'c1' },
        content: [
          { type: 'tool-result', toolCallId: 'c1', isError: true, content: [{ type: 'text', text: 'boom' }] }
        ]
      }
    }
  },
  { type: 'step/end', data: step1 },
  { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } }
]

/** V4 tool result: a `role: 'tool'` message, `isError` on the message itself. */
const v4Result = (step, callId, text, isError) => ({
  type: 'tool/result',
  surfaceOp: 'append',
  data: {
    ...step,
    message: {
      id: `tool-result-${callId}`,
      role: 'tool',
      source: { kind: 'tool', callId },
      toolCallId: callId,
      content: [{ type: 'text', text }],
      isError
    }
  }
})

/** The same turn 1 converted, then a turn 2 that only the V4 file has: a refused `{ok:false}` call. */
const V4_ROWS = [
  ...V3_TURN_1.slice(0, 6),
  v4Result(step1, 'c1', 'boom', true),
  ...V3_TURN_1.slice(7),
  { type: 'turn/start', data: { turn: 2 } },
  { type: 'step/start', data: step2 },
  {
    type: 'user/message',
    surfaceOp: 'append',
    data: { id: 'm2', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'again' }] }
  },
  assistant(step2, 'c2', 'content.get'),
  call(step2, 'c2', 'content.get'),
  v4Result(step2, 'c2', '{"ok":false,"code":"NOT_FOUND"}', false),
  { type: 'step/end', data: step2 },
  { type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } }
]

const numbered = (rows) => rows.map((row, seq) => ({ ...row, seq, time: seq + 1 }))

/** One session file, one frame for the header and one per two rows. */
function writeZstd(dir, version, rows) {
  mkdirSync(dir, { recursive: true })
  const frames = [zstdCompressSync(line({ ...HEADER, version }))]
  const body = numbered(rows)
  for (let i = 0; i < body.length; i += 2)
    frames.push(
      zstdCompressSync(
        body
          .slice(i, i + 2)
          .map(line)
          .join('')
      )
    )
  writeFileSync(path.join(dir, `session.v${version}.jsonl.zstd`), Buffer.concat(frames))
}

/** The same, uncompressed — the tree `agent-turn-cost.mjs <dir>` reads. */
function writeJsonl(dir, version, rows) {
  mkdirSync(dir, { recursive: true })
  const text = [{ ...HEADER, version }, ...numbered(rows)].map(line).join('')
  writeFileSync(path.join(dir, `session.v${version}.jsonl`), text)
}

test('the newest generation is the log: v4 beside v3, v3 alone, nothing else', () => {
  assert.equal(
    metrics.newestSessionLog(['session.v3.jsonl.zstd', 'session.v4.jsonl.zstd', 'x.lock']),
    'session.v4.jsonl.zstd'
  )
  assert.equal(metrics.newestSessionLog(['session.v3.jsonl.zstd']), 'session.v3.jsonl.zstd')
  assert.equal(metrics.newestSessionLog(['meta.json']), null)
})

test('session-metrics: v4 wins when both exist, a v3-only session still reads, and isError is counted', async () => {
  const both = path.join(HOME, 'sessions', '--site-demo--', 'session-both')
  writeZstd(both, 3, V3_TURN_1)
  writeZstd(both, 4, V4_ROWS)
  const alone = path.join(HOME, 'sessions', '--site-demo--', 'session-v3only')
  writeZstd(alone, 3, V3_TURN_1)
  try {
    const rows = await metrics.report(10)
    const byDir = Object.fromEntries(rows.map((r) => [path.basename(path.dirname(r.file)), r]))
    assert.equal(path.basename(byDir['session-both'].file), 'session.v4.jsonl.zstd')
    // Both turns: the second exists only in V4. Two failures — one by the flag, one by the payload.
    assert.equal(byDir['session-both'].calls, 2)
    assert.equal(byDir['session-both'].failed, 2)
    assert.equal(byDir['session-both'].preset, 'designer-wordpress')
    assert.equal(byDir['session-both'].tokens, 2 * 115)
    assert.equal(path.basename(byDir['session-v3only'].file), 'session.v3.jsonl.zstd')
    assert.equal(byDir['session-v3only'].calls, 1)
    // The payload is `boom`: only `isError` makes this a failure.
    assert.equal(byDir['session-v3only'].failed, 1)
  } finally {
    rmSync(path.join(HOME, 'sessions'), { recursive: true, force: true })
  }
})

test('agent-turn-cost: a directory holding v3 and v4 is measured from v4, named by the session', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'turn-cost-generation-'))
  try {
    writeJsonl(path.join(root, '--site-demo--', 'session-both'), 3, V3_TURN_1)
    writeJsonl(path.join(root, '--site-demo--', 'session-both'), 4, V4_ROWS)
    writeJsonl(path.join(root, '--site-demo--', 'session-v3only'), 3, V3_TURN_1)
    const rows = JSON.parse(
      execFileSync('node', [TURN_COST, root, '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
    )
    const both = rows.filter((r) => r.session === 'session-both')
    assert.deepEqual(
      both.map((r) => r.turn),
      [1, 2],
      'turn 2 exists only in the v4 file, and the v3 file is not counted a second time'
    )
    assert.deepEqual(both[1].codes, ['NOT_FOUND'])
    const alone = rows.filter((r) => r.session === 'session-v3only')
    assert.deepEqual(
      alone.map((r) => [r.turn, r.calls]),
      [[1, 1]]
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('with the rc.2 catalog, a v3 log comes back in V4 shape and a native v4 log restores', async (t) => {
  const loaded = await loadCatalog()
  if (!loaded.module) return t.skip(`rc.2 catalog not importable: ${loaded.error}`)
  const v3 = metrics.restoreSession({ ...HEADER, version: 3 }, numbered(V3_TURN_1))
  assert.equal(v3.restored, true, v3.reason)
  assert.equal(v3.header.version, 4)
  const result = v3.events.find((e) => e.type === 'tool/result')
  assert.equal(result.data.message.role, 'tool')
  assert.equal(result.data.message.isError, true)
  assert.deepEqual(metrics.toolResultOf(result), { isError: true, text: 'boom' })
  const v4 = metrics.restoreSession({ ...HEADER, version: 4 }, numbered(V4_ROWS))
  assert.equal(v4.restored, true, v4.reason)
  assert.equal(v4.events.filter((e) => e.type === 'tool/result').length, 2)
})

test.after(() => rmSync(HOME, { recursive: true, force: true }))
