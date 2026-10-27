/**
 * `scripts/session-v4-audit.mjs` on two tiny synthetic sessions — one clean, one carrying a
 * `source.kind: 'plugin'` message — written the way dsh stores them: one independent Zstandard
 * frame for the header, one per append batch (`session-persistence-jsonl` README "Physical
 * encoding"). The V3 rows follow the released V3 shapes the rc.2 migration reads: a user-role
 * `tool/result` wrapping one `tool-result` block (`session-format-v3-to-v4`
 * `tests/tool-role.spec.ts:15-27`) and a `{kind:'plugin', plugin}` source (`src/sources.ts:74-90`).
 *
 * These run WITHOUT the rc.2 catalog (the submodule may be unbuilt): they pin the frame reader,
 * the counts and the copied predicate. The catalog path is measured on real data, not here.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'

import {
  auditDirectories,
  countSources,
  formatReport,
  loadCatalog,
  predicateVerdict,
  readSessionFile,
  scanZstdFrames,
  sessionFiles
} from '../session-v4-audit.mjs'

const line = (value) => `${JSON.stringify(value)}\n`

/** One session file, one frame per batch — the concatenation Node's one-shot decoder stops inside. */
function writeSession(root, id, header, batches, version = header.version) {
  const dir = join(root, '--site-demo--', id)
  mkdirSync(dir, { recursive: true })
  const frames = [zstdCompressSync(line({ type: 'session', ...header, id }))]
  for (const batch of batches) frames.push(zstdCompressSync(batch.map(line).join('')))
  writeFileSync(join(dir, `session.v${version}.jsonl.zstd`), Buffer.concat(frames))
  return dir
}

const HEADER = {
  version: 3,
  createdAt: 1,
  cwd: '/site/demo',
  isSeeded: false,
  delegationDepth: 0,
  agentPreset: 'designer-wordpress'
}
const userMessage = (seq, source) => ({
  type: 'user/message',
  seq,
  time: seq,
  surfaceOp: 'append',
  data: { id: `m${seq}`, role: 'user', source, content: [{ type: 'text', text: 'hi' }] }
})
const v3ToolResult = (seq, callId) => ({
  type: 'tool/result',
  seq,
  time: seq,
  surfaceOp: 'append',
  data: {
    turn: 1,
    step: 1,
    message: {
      id: `tool-result-${callId}`,
      role: 'user',
      source: { kind: 'tool', callId },
      content: [
        {
          type: 'tool-result',
          toolCallId: callId,
          isError: false,
          content: [{ type: 'text', text: '{"ok":true}' }]
        }
      ]
    }
  }
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'session-v4-audit-'))
  writeSession(root, 'session-clean', HEADER, [[userMessage(0, { kind: 'user' })], [v3ToolResult(1, 'c1')]])
  writeSession(root, 'session-plugin', HEADER, [
    [userMessage(0, { kind: 'user' })],
    [
      userMessage(1, {
        kind: 'plugin',
        plugin: 'tracy-site-tools:site-context',
        form: 'notice',
        summary: 's'
      })
    ],
    [
      userMessage(2, { kind: 'plugin', plugin: 'tracy-site-build-wordpress' }),
      userMessage(3, { kind: 'plugin', plugin: 'tracy-site-build-wordpress' })
    ]
  ])
  return root
}

test('reads every frame of a multi-frame log, not only the first', () => {
  const root = fixture()
  try {
    const [plugin] = sessionFiles(root).filter((s) => s.file.includes('session-plugin'))
    const { header, rows, torn } = readSessionFile(plugin.file)
    assert.equal(header.id, 'session-plugin')
    assert.equal(header.agentPreset, 'designer-wordpress')
    assert.equal(rows.length, 4, 'three batches after the header frame, four rows')
    assert.equal(torn, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a torn final frame is reported, and the whole frames before it still read', () => {
  const frames = Buffer.concat([zstdCompressSync(line({ a: 1 })), zstdCompressSync(line({ b: 2 }))])
  const whole = scanZstdFrames(frames)
  assert.equal(whole.frames.length, 2)
  assert.equal(whole.tornStart, undefined)
  const torn = scanZstdFrames(frames.subarray(0, frames.length - 3))
  assert.equal(torn.frames.length, 1)
  assert.equal(torn.tornStart, whole.frames[1].start)
})

test('the highest generation in a session directory is the one audited', () => {
  const root = mkdtempSync(join(tmpdir(), 'session-v4-audit-gen-'))
  try {
    const dir = writeSession(root, 'session-x', { ...HEADER, version: 2 }, [])
    writeSession(root, 'session-x', HEADER, [])
    const found = sessionFiles(root)
    assert.equal(found.length, 1)
    assert.equal(found[0].dir, dir)
    assert.equal(found[0].version, 3)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('counts messages and plugin-kind messages per plugin, at the positions dsh visits', () => {
  const rows = [
    userMessage(0, { kind: 'user' }),
    userMessage(1, { kind: 'plugin', plugin: 'a' }),
    {
      type: 'agent/inbox/spliced',
      seq: 2,
      data: { inserted: [{ id: 'i', role: 'user', source: { kind: 'plugin', plugin: 'a' }, content: [] }] }
    },
    // Not a message position: a `plugin` kind inside tool arguments is not counted.
    { type: 'tool/call', seq: 3, data: { arguments: '{"source":{"kind":"plugin","plugin":"a"}}' } }
  ]
  assert.deepEqual(countSources(rows), { messages: 3, plugin: 2, byPlugin: { a: 2 } })
})

test('without the catalog: a V3 plugin source is converted (accepted), a V4 one is refused', () => {
  const v3 = [userMessage(0, { kind: 'plugin', plugin: 'tracy-site-build-wordpress' })]
  assert.deepEqual(predicateVerdict(HEADER, v3), { verdict: 'accept' })
  const v4 = predicateVerdict({ ...HEADER, version: 4 }, v3)
  assert.equal(v4.verdict, 'refuse')
  assert.match(v4.reason, /producer-owned source kind/)
  assert.equal(
    predicateVerdict({ ...HEADER, version: 4 }, [userMessage(0, { kind: 'tracy-site', producer: 'x' })])
      .verdict,
    'accept'
  )
  // The V3 rules the edge itself refuses on.
  assert.equal(predicateVerdict(HEADER, [userMessage(0, { kind: 'plugin', plugin: 7 })]).verdict, 'refuse')
  const nested = v3ToolResult(0, 'c1')
  nested.data.message.content[0].content = [{ type: 'tool-result', toolCallId: 'c0', content: [] }]
  assert.equal(predicateVerdict(HEADER, [nested]).verdict, 'refuse')
  assert.equal(predicateVerdict({ ...HEADER, version: 2 }, []).verdict, 'unknown')
})

test('the audit of a directory: one clean session, one with plugin messages, the verdict labelled as a predicate', async () => {
  const root = fixture()
  try {
    const result = await auditDirectories([root], { catalog: join(root, 'no-such-catalog.js') })
    assert.match(result.catalog.error, /does not exist/)
    const byId = Object.fromEntries(result.sessions.map((s) => [s.id, s]))
    assert.equal(byId['session-clean'].messages, 2)
    assert.equal(byId['session-clean'].plugin, 0)
    assert.equal(byId['session-clean'].predicate.verdict, 'accept')
    assert.equal(byId['session-plugin'].messages, 4)
    assert.equal(byId['session-plugin'].plugin, 3)
    assert.deepEqual(byId['session-plugin'].byPlugin, {
      'tracy-site-tools:site-context': 1,
      'tracy-site-build-wordpress': 2
    })
    assert.equal(byId['session-plugin'].predicate.verdict, 'accept')
    assert.equal(result.totals.sessions, 2)
    assert.equal(result.totals.withPlugin, 1)
    assert.equal(result.totals.pluginMessages, 3)
    const report = formatReport(result)
    assert.match(report, /PREDICATE copied from dsh-v0\.1\.7-rc\.2/)
    assert.match(report, /sessions with source\.kind 'plugin': 1 · such messages: 3/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a catalog that cannot be imported is reported, never thrown', async () => {
  const loaded = await loadCatalog('/nonexistent/catalog.js')
  assert.equal(loaded.module, null)
  assert.match(loaded.error, /does not exist/)
})
