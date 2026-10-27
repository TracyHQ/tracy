import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { testDir } from './lib/test-root.mjs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { collect, formatReport, projectDirName, totalsByKind } from '../perf/token-report.mjs'

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'perf', 'token-report.mjs')
const assistant = (id, usage, ts, extra = {}) => ({ type: 'assistant', timestamp: ts, message: { id, model: 'claude-x', usage, content: [{ type: 'text', text: 'ok' }], ...extra } })
const user = (content, ts) => ({ type: 'user', timestamp: ts, message: { role: 'user', content } })
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n'

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'tok-'))
  const worktree = '/Users/x/work.trees/proj'
  const dir = path.join(root, projectDirName(worktree))
  mkdirSync(path.join(dir, 'sess1', 'subagents'), { recursive: true })
  writeFileSync(
    path.join(dir, 'sess1.jsonl'),
    jsonl([
      user('Port the site and fix the header', '2026-10-01T10:00:00Z'),
      // the same message written twice (once per content block): counted once
      assistant('m1', { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 5 }, '2026-10-01T10:00:05Z'),
      assistant('m1', { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 5 }, '2026-10-01T10:00:06Z'),
      // a tool result carrying an image block
      user([{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }] }], '2026-10-01T10:00:07Z'),
      assistant('m2', { input_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 3000, output_tokens: 7 }, '2026-10-01T10:00:09Z')
    ])
  )
  writeFileSync(path.join(dir, 'sess1', 'subagents', 'agent-a.jsonl'), jsonl([user('Measure the page groups', '2026-10-01T10:01:00Z'), assistant('s1', { input_tokens: 1, cache_creation_input_tokens: 2, cache_read_input_tokens: 30, output_tokens: 4 }, '2026-10-01T10:01:02Z')]))
  writeFileSync(path.join(dir, 'sess1', 'subagents', 'agent-b.jsonl'), jsonl([user([{ type: 'text', text: 'You are the layout lens reader for cell 3' }], '2026-10-01T10:02:00Z'), assistant('l1', { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 10, output_tokens: 1 }, '2026-10-01T10:02:02Z')]))
  return { root, worktree }
}

test('project dir names replace / and . with -', () => {
  assert.equal(projectDirName('/Users/x/work.trees/proj'), '-Users-x-work-trees-proj')
})

test('rows: messages counted once by id, an image result is harmless, kinds from the first user message', () => {
  const { root, worktree } = fixture()
  const rows = collect({ projectsRoot: root, worktrees: [worktree] })
  assert.equal(rows.length, 3)
  const main = rows.find((r) => r.kind === 'main')
  assert.equal(main.turns, 2)
  assert.equal(main.input, 30)
  assert.equal(main.cacheWrite, 100)
  assert.equal(main.cacheRead, 4000)
  assert.equal(main.output, 12)
  assert.equal(main.contextPerTurn, 2000)
  assert.equal(main.model, 'claude-x')
  assert.equal(main.label, 'Port the site and fix the header')
  assert.equal(main.first, '2026-10-01T10:00:00Z')
  assert.equal(main.last, '2026-10-01T10:00:09Z')
  assert.equal(rows.find((r) => r.kind === 'subagent').label, 'Measure the page groups')
  assert.equal(rows.find((r) => r.kind === 'lens').turns, 1)
  const totals = totalsByKind(rows)
  assert.deepEqual(Object.keys(totals).sort(), ['lens', 'main', 'subagent'])
  assert.equal(totals.main.cacheRead, 4000)
  assert.match(formatReport(rows), /main\s+sessions=1 turns=2/)
})

test('--since drops sessions that ended before it; a missing project dir yields nothing', () => {
  const { root, worktree } = fixture()
  assert.equal(collect({ projectsRoot: root, worktrees: [worktree], since: '2026-10-01T10:01:30Z' }).length, 1)
  assert.equal(collect({ projectsRoot: root, worktrees: ['/nowhere'] }).length, 0)
})

test('CLI prints the table and writes --json', () => {
  const { root, worktree } = fixture()
  const json = path.join(root, 'rows.json')
  const r = spawnSync('node', [TOOL, '--worktree', worktree, '--projects-root', root, '--json', json], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /lens\s+sessions=1/)
  assert.equal(JSON.parse(readFileSync(json, 'utf8')).rows.length, 3)
})

test('CLI without --worktree reports the current directory; an explicit --worktree is not joined by it', () => {
  const root = testDir('tok')
  const cwd = realpathSync(testDir('tok-cwd'))
  const dir = path.join(root, projectDirName(cwd))
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 's.jsonl'), jsonl([user('Fix the header', '2026-10-01T10:00:00Z'), assistant('m1', { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 10, output_tokens: 2 }, '2026-10-01T10:00:05Z')]))
  const run = (...args) => spawnSync('node', [TOOL, '--projects-root', root, ...args], { encoding: 'utf8', cwd })
  const bare = run()
  assert.equal(bare.status, 0, bare.stderr)
  assert.match(bare.stdout, /main\s+sessions=1 turns=1/)
  assert.equal(run('--worktree', cwd).stdout, bare.stdout, 'the same as naming the directory')
  const elsewhere = run('--worktree', '/nowhere')
  assert.equal(elsewhere.status, 0)
  assert.match(elsewhere.stdout, /no transcripts found/)
  assert.match(run('--worktree', '/nowhere', '--worktree', cwd).stdout, /sessions=1/)
})
