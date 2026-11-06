// Template kit `site.createdPageHide` (card AT): the blocks a template prints on every article page, hard coded, that a page the
// write step creates must not show (a share bar on a privacy page), declared by a person when packaging
// (`cli.mjs created-page-hide`). A made-up kit; every selector and reason is invented.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createdPageHideOf } from '../../../../apps/tracy-web/src/lib/created-page-hide.js'
import { declareCreatedPageHide } from '../template-kit/lib/self-link-buttons.mjs'

const CLI = fileURLToPath(new URL('../template-kit/cli.mjs', import.meta.url))
const SELECTOR = '.share-row'
const WHY =
  'the invented article file prints div.share-row with three share buttons, with no setting to turn it off'

test('declaring adds a selector once with its reason, in its own field, and --none sets an empty list', () => {
  const kit = { site: {} }
  assert.deepEqual(declareCreatedPageHide(kit, { selector: SELECTOR, why: WHY }), {
    error: null,
    changed: true
  })
  assert.deepEqual(declareCreatedPageHide(kit, { selector: SELECTOR, why: WHY }), {
    error: null,
    changed: false
  })
  assert.deepEqual(kit.site.createdPageHide, [{ selector: SELECTOR, why: WHY }])
  assert.equal(kit.site.selfLinkButtons, undefined)
  assert.match(declareCreatedPageHide(kit, { selector: SELECTOR }).error, /--why/)
  assert.match(declareCreatedPageHide(kit, { selector: '.a .b', why: WHY }).error, /compound/)
  assert.match(declareCreatedPageHide(kit, { selector: 'body', why: WHY }).error, /compound/)
  assert.deepEqual(declareCreatedPageHide(kit, { none: true }), { error: null, changed: true })
  assert.deepEqual(kit.site.createdPageHide, [])
})

test('what the cli declares is what the write step reads', () => {
  const kit = { site: {} }
  declareCreatedPageHide(kit, { selector: SELECTOR, why: WHY })
  assert.deepEqual(createdPageHideOf(kit), { selectors: [SELECTOR], problems: [] })
})

test('cli: created-page-hide writes the kit in place with its own indent, and nothing on a bad selector', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-created-hide-'))
  try {
    const file = join(dir, 'template-kit.json')
    const before = `${JSON.stringify({ kit: 'x', site: { head: {} } }, null, 2)}\n`
    writeFileSync(file, before)
    const run = (...args) =>
      spawnSync(process.execPath, [CLI, 'created-page-hide', '--kit', file, ...args], { encoding: 'utf8' })
    assert.equal(run('--selector', '.a .b', '--why', WHY).status, 1)
    assert.equal(readFileSync(file, 'utf8'), before, 'untouched')
    const ok = run('--selector', SELECTOR, '--why', WHY)
    assert.equal(ok.status, 0, ok.stderr)
    const written = readFileSync(file, 'utf8')
    assert.ok(written.startsWith('{\n  "kit"'))
    assert.deepEqual(JSON.parse(written).site.createdPageHide, [{ selector: SELECTOR, why: WHY }])
    assert.equal(run('--selector', SELECTOR, '--why', WHY).status, 0)
    assert.equal(readFileSync(file, 'utf8'), written, 'idempotent')
    assert.equal(run('--none').status, 0)
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).site.createdPageHide, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
