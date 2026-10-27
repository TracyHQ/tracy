/**
 * `scripts/check-passwords-core-diff.ts` — the shape ADR 0027 demands of the dsh-passwords fork.
 *
 *   node --import tsx --test scripts/test/check-passwords-core-diff.test.ts
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkTree, lineDiff, parseSnapshot, type CoreConfig } from '../check-passwords-core-diff.ts'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

const UPSTREAM_GATEWAY = [
  'import x from "x"',
  'function a() {',
  '  return 1',
  '}',
  'function b() {',
  '  return 2',
  '}'
].join('\n')
const UPSTREAM_DB = 'export const db = 1\n'
const UPSTREAM_TEST = 'test("u", () => {})\n'

function tree(
  t: { after: (fn: () => void) => void },
  edits: Record<string, string | null> = {}
): { dir: string; config: CoreConfig } {
  const dir = mkdtempSync(join(tmpdir(), 'pw-core-diff-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, 'src/tracy'), { recursive: true })
  mkdirSync(join(dir, 'test/tracy'), { recursive: true })
  mkdirSync(join(dir, '.upstream-pristine/src'), { recursive: true })
  const files: Record<string, string | null> = {
    'src/gateway.ts': UPSTREAM_GATEWAY,
    'src/db.ts': UPSTREAM_DB,
    'test/u.test.ts': UPSTREAM_TEST,
    ...edits
  }
  for (const [path, body] of Object.entries(files)) {
    if (body === null) continue
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  writeFileSync(join(dir, '.upstream-pristine/src/gateway.ts'), UPSTREAM_GATEWAY)
  writeFileSync(
    join(dir, 'upstream-snapshot.sha256'),
    [
      '# snapshot',
      `${sha(UPSTREAM_GATEWAY)}  src/gateway.ts`,
      `${sha(UPSTREAM_DB)}  src/db.ts`,
      `${sha(UPSTREAM_TEST)}  test/u.test.ts`
    ].join('\n')
  )
  const config: CoreConfig = {
    upstream: { repo: 'x/y', commit: 'abc1234' },
    snapshot: 'upstream-snapshot.sha256',
    pristine: '.upstream-pristine',
    tracyDirs: ['src/tracy/', 'test/tracy/'],
    hooks: { 'src/gateway.ts': { maxAdded: 6, maxRemoved: 1, maxHunkAdded: 4, allow: ['tracy', 'policy'] } },
    exceptions: {},
    forbiddenImports: [{ module: 'test/tracy/upstream-policy-preload', notUnder: ['src/'] }]
  }
  return { dir, config }
}

test('an untouched upstream tree with a Tracy layer beside it is green', (t) => {
  const { dir, config } = tree(t, {
    'src/tracy/routes.ts': 'export const r = 1\n',
    'test/tracy/r.test.ts': 'test("t", () => {})\n'
  })
  assert.deepEqual(checkTree(dir, config), [])
})

test('a hook file may add a small hunk that names the layer', (t) => {
  const edited = UPSTREAM_GATEWAY.replace(
    '  return 1',
    '  const d = policy.decideHttp(req)\n  if (d.kind === "deny") return 403\n  return 1'
  )
  const { dir, config } = tree(t, { 'src/gateway.ts': edited })
  assert.deepEqual(checkTree(dir, config), [])
})

test('a hunk in a hook file that names no layer token is red', (t) => {
  const edited = UPSTREAM_GATEWAY.replace('  return 2', '  console.log("convenient")\n  return 2')
  const { dir, config } = tree(t, { 'src/gateway.ts': edited })
  const problems = checkTree(dir, config)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /names none of \[tracy, policy\]/)
})

test('a hunk bigger than the per-hook budget is red even when it names the layer', (t) => {
  const big = ['  // tracy', '  const a = 1', '  const b = 2', '  const c = 3', '  const d = 4'].join('\n')
  const edited = UPSTREAM_GATEWAY.replace('  return 1', `${big}\n  return 1`)
  const { dir, config } = tree(t, { 'src/gateway.ts': edited })
  assert.ok(checkTree(dir, config).some((p) => /hunk 1 adds 5 lines, budget 4/.test(p.message)))
})

test('any edit to a non-hook upstream file is red, and so is editing an upstream test', (t) => {
  const { dir, config } = tree(t, {
    'src/db.ts': 'export const db = 2\n',
    'test/u.test.ts': 'test("u2", () => {})\n'
  })
  const files = checkTree(dir, config)
    .map((p) => p.file)
    .sort()
  assert.deepEqual(files, ['src/db.ts', 'test/u.test.ts'])
})

test('a named exception may differ', (t) => {
  const { dir, config } = tree(t, { 'src/db.ts': 'export const db = 2\n' })
  config.exceptions = { 'src/db.ts': 'migration adapter until H10' }
  assert.deepEqual(checkTree(dir, config), [])
})

test('deleting an upstream file, or adding a file outside the Tracy directories, is red', (t) => {
  const { dir, config } = tree(t, { 'src/db.ts': null, 'src/helper.ts': 'export const h = 1\n' })
  const messages = checkTree(dir, config).map((p) => `${p.file}: ${p.message}`)
  assert.ok(messages.some((m) => m.startsWith('src/db.ts: upstream file deleted')))
  assert.ok(messages.some((m) => m.startsWith('src/helper.ts: new file outside')))
})

test('the pass-through preload imported under src/ is red', (t) => {
  const { dir, config } = tree(t, {
    'src/tracy/index.ts': 'import "../../test/tracy/upstream-policy-preload.ts"\n'
  })
  const problems = checkTree(dir, config)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /test-only preload/)
})

test('a comment that merely mentions the preload is not an import', (t) => {
  const { dir, config } = tree(t, {
    'src/tracy/index.ts':
      '// the pass-through lives in test/tracy/upstream-policy-preload.ts\nexport const p = 1\n'
  })
  assert.deepEqual(checkTree(dir, config), [])
})

test('parseSnapshot reads shasum output and skips comments', () => {
  const m = parseSnapshot(`# c\n${'a'.repeat(64)}  ./src/x.ts\n${'b'.repeat(64)}  test/y.ts\n`)
  assert.deepEqual([...m.keys()], ['src/x.ts', 'test/y.ts'])
})

test('lineDiff groups consecutive additions into one hunk and counts removals', () => {
  const { added, removed } = lineDiff(['a', 'b', 'c', 'd'], ['a', 'x', 'y', 'c'])
  assert.deepEqual(added, [['x', 'y']])
  assert.deepEqual(removed, ['b', 'd'])
})
