// Template kit `site.emptyVideoButtons`: the selectors of a template's play buttons with an empty video address, declared by a
// person when packaging (`cli.mjs video-buttons`). A made-up kit; every selector and reason is invented.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { isSafeSelector } from '../../../../apps/tracy-web/src/lib/empty-video-buttons.js'
import { declareVideoButtons, selectorProblem } from '../template-kit/lib/video-buttons.mjs'

const CLI = fileURLToPath(new URL('../template-kit/cli.mjs', import.meta.url))
const SELECTOR = '.play-chip[data-src$="/embed/"]'
const WHY = 'the invented card layout prints the button whatever the video field holds'
const NONE_WHY = 'no invented layout file prints a video play button'

test('a declared selector must test the video address and hold only plain selector characters, as the write step reads it', () => {
  for (const selector of [
    SELECTOR,
    "a.clip[href='https://player.example/video/']",
    '.card .play[data-video=""]',
    '.play-chip',
    '.play-chip[data-src$="/embed/"]{}',
    '.play-chip[data-src$="/embed/"];body',
    '.play-chip[data-src$="/embed/"]</style>',
    '@media all',
    ''
  ])
    assert.equal(selectorProblem(selector) === null, isSafeSelector(selector), selector)
  assert.equal(selectorProblem(SELECTOR), null)
  assert.match(selectorProblem('.play-chip'), /tests the video address/)
})

test('declaring adds a selector once with its reason, and --none sets an empty list with its reason', () => {
  const kit = { site: {} }
  assert.deepEqual(declareVideoButtons(kit, { selector: SELECTOR, why: WHY }), { error: null, changed: true })
  assert.deepEqual(declareVideoButtons(kit, { selector: SELECTOR, why: WHY }), {
    error: null,
    changed: false
  })
  assert.deepEqual(kit.site.emptyVideoButtons, [{ selector: SELECTOR, why: WHY }])
  assert.match(declareVideoButtons(kit, { selector: SELECTOR }).error, /--why/)
  assert.match(declareVideoButtons(kit, { none: true }).error, /--why/)
  assert.deepEqual(kit.site.emptyVideoButtons, [{ selector: SELECTOR, why: WHY }], 'untouched')
  assert.deepEqual(declareVideoButtons(kit, { none: true, why: NONE_WHY }), { error: null, changed: true })
  assert.deepEqual(kit.site.emptyVideoButtons, [])
  assert.deepEqual(kit.site.noneWhy, { emptyVideoButtons: NONE_WHY })
  assert.deepEqual(declareVideoButtons(kit, { none: true, why: NONE_WHY }), { error: null, changed: false })
  // A selector declared later takes the none back.
  declareVideoButtons(kit, { selector: SELECTOR, why: WHY })
  assert.equal(kit.site.noneWhy, undefined)
  assert.match(declareVideoButtons({}, { selector: SELECTOR, why: WHY }).error, /no site part/)
})

test('cli: video-buttons writes the kit in place with its own indent, and writes nothing on a bad selector', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-video-'))
  try {
    const file = join(dir, 'template-kit.json')
    const before = `${JSON.stringify({ kit: 'x', site: { head: {} } }, null, 2)}\n`
    writeFileSync(file, before)
    const run = (...args) =>
      spawnSync(process.execPath, [CLI, 'video-buttons', '--kit', file, ...args], { encoding: 'utf8' })
    const bad = run('--selector', '.play-chip', '--why', WHY)
    assert.equal(bad.status, 1)
    assert.equal(readFileSync(file, 'utf8'), before, 'untouched')
    const ok = run('--selector', SELECTOR, '--why', WHY)
    assert.equal(ok.status, 0, ok.stderr)
    const written = readFileSync(file, 'utf8')
    assert.ok(written.startsWith('{\n  "kit"'), 'the same indent')
    assert.deepEqual(JSON.parse(written).site.emptyVideoButtons, [{ selector: SELECTOR, why: WHY }])
    assert.equal(run('--selector', SELECTOR, '--why', WHY).status, 0)
    assert.equal(readFileSync(file, 'utf8'), written, 'idempotent')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
