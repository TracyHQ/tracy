// Template kit `site.selfLinkButtons` (card AF): the containers of a template's "more" buttons that may lead to the page they sit
// on, declared by a person when packaging (`cli.mjs self-link-buttons`). A made-up kit; every container and reason is invented.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { isSafeContainer } from '../../../../apps/tracy-web/src/lib/self-link-buttons.js'
import { containerProblem, declareSelfLinkButtons } from '../template-kit/lib/self-link-buttons.mjs'

const CLI = fileURLToPath(new URL('../template-kit/cli.mjs', import.meta.url))
const CONTAINER = '.more-row'
const WHY = 'the invented section chrome prints its "more" button in div.more-row'

test('a declared container is one plain compound selector, as the write step reads it', () => {
  for (const c of [
    CONTAINER,
    'div#more.row.x',
    '#more',
    'div',
    '.a, .b',
    '.a .b',
    '.a>b',
    '.a{}',
    '.a[href]',
    '#x:hover',
    ''
  ])
    assert.equal(containerProblem(c) === null, isSafeContainer(c), c)
  assert.match(containerProblem('.a .b'), /compound/)
})

test('declaring adds a container once with its reason, and --none sets an empty list', () => {
  const kit = { site: {} }
  assert.deepEqual(declareSelfLinkButtons(kit, { container: CONTAINER, why: WHY }), {
    error: null,
    changed: true
  })
  assert.deepEqual(declareSelfLinkButtons(kit, { container: CONTAINER, why: WHY }), {
    error: null,
    changed: false
  })
  assert.deepEqual(kit.site.selfLinkButtons, [{ container: CONTAINER, why: WHY }])
  assert.match(declareSelfLinkButtons(kit, { container: CONTAINER }).error, /--why/)
  assert.deepEqual(declareSelfLinkButtons(kit, { none: true }), { error: null, changed: true })
  assert.deepEqual(kit.site.selfLinkButtons, [])
})

test('cli: self-link-buttons writes the kit in place with its own indent, and nothing on a bad container', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-self-'))
  try {
    const file = join(dir, 'template-kit.json')
    const before = `${JSON.stringify({ kit: 'x', site: { head: {} } }, null, 2)}\n`
    writeFileSync(file, before)
    const run = (...args) =>
      spawnSync(process.execPath, [CLI, 'self-link-buttons', '--kit', file, ...args], { encoding: 'utf8' })
    assert.equal(run('--container', '.a .b', '--why', WHY).status, 1)
    assert.equal(readFileSync(file, 'utf8'), before, 'untouched')
    const ok = run('--container', CONTAINER, '--why', WHY)
    assert.equal(ok.status, 0, ok.stderr)
    const written = readFileSync(file, 'utf8')
    assert.ok(written.startsWith('{\n  "kit"'))
    assert.deepEqual(JSON.parse(written).site.selfLinkButtons, [{ container: CONTAINER, why: WHY }])
    assert.equal(run('--container', CONTAINER, '--why', WHY).status, 0)
    assert.equal(readFileSync(file, 'utf8'), written, 'idempotent')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
